import { ServerWebSocket, type Server as BunServer } from "bun";
import { functionReplacer } from "./functionUtils";

interface Permissions {
  read: boolean;
  write: boolean;
  execute: boolean;
}

interface Auth {
  getBearerPassword: () => string;
}

type AuthGuard = (auth: Auth) => Permissions;

interface Model {
  obj: {};
  auth: AuthGuard;
}

type Models = Map<string, Model>;

interface ServerOptions {
  models: Models;
  bundle: string;
  enableFunctions?: boolean;
}

class Server {
  #models: Models;
  #jsBundle: string;

  constructor(serverOptions: ServerOptions) {
    this.#models = serverOptions.models;
    this.#jsBundle = serverOptions.bundle;
  }

  stringifyModel(model: {}): string {
    // The object is converted to a string, so that it can be sent to the client
    // All functions are converted to a special object, so that the client can tell to call them
    return JSON.stringify(model, functionReplacer);
  }

  broadcast(server: BunServer | ServerWebSocket<unknown>, topic: string) {
    const model = this.#models.get(topic)!;
    const data = this.stringifyModel({
      topic: topic,
      data: model.obj,
    });
    const send = server.publish(topic, data);
    if (send === 0) {
      console.warn("⚠️ Dropped");
      // Wait a second and try again
      setTimeout(() => {
        this.broadcast(server, topic);
      }, 1000);
    } else console.log("✅ Broadcasted ", topic, data, send);
  }

  listen(port: number) {
    const that = this;
    Bun.serve({
      port: port,
      async fetch(req, server) {
        const pathname = new URL(req.url).pathname;

        // upgrade to websocket, if path is /ws
        if (pathname === "/ws") {
          if (server.upgrade(req)) {
            return;
          }
        }

        // serve the client bundle
        if (pathname === "/client.js") {
          return new Response(that.#jsBundle, {
            headers: {
              "Content-Type": "text/javascript",
            },
          });
        }

        // On root, a list of all models is returned
        if (pathname === "/") {
          return new Response(JSON.stringify([...that.#models.keys()]));
        }

        const modelName = pathname.split("/")[1];

        if (!that.#models.has(modelName)) {
          return new Response("Model not found", { status: 404 });
        }

        const model = that.#models.get(modelName)!;

        // Check if the user has read access
        const auth = model.auth({
          getBearerPassword() {
            return req.headers.get("Authorization") || "";
          },
        });

        const method = req.method.toLowerCase();

        if (!auth.read && method === "get") {
          return new Response("Unauthorized", { status: 401 });
        } else if (!auth.write && method === "post") {
          return new Response("Unauthorized", { status: 401 });
        } else if (!auth.execute && method === "put") {
          return new Response("Unauthorized", { status: 401 });
        }

        if (method === "get") {
          return new Response(that.stringifyModel(model.obj));
        } else if (method === "post") {
          const body = await req.json();

          for (const key in body) {
            // @ts-ignore
            model.obj[key] = body[key];
          }

          // send the new data to all subscribers of the ws topic
          that.broadcast(server, modelName);

          return new Response(that.stringifyModel(model.obj));
        } else if (method === "put") {
          const body: {
            topic: string;
            function: string;
            args: any[];
          } = await req.json();

          if (!that.#models.has(body.topic)) {
            return new Response("Model not found", { status: 404 });
          }

          const model = that.#models.get(body.topic)!;

          // Check if function exists
          // @ts-ignore
          if (
            !model.obj[body.function] ||
            typeof model.obj[body.function] !== "function"
          ) {
            return new Response("Function not found", { status: 404 });
          }

          try {
            // @ts-ignore
            model.obj[body.function](...body.args);
          } catch (e: any) {
            return new Response(e.message, { status: 500 });
          }

          // send the new data to all subscribers of the ws topic
          that.broadcast(server, modelName);
        }

        return new Response("Not implemented", { status: 501 });
      },
      websocket: {
        open(ws) {},
        async message(ws, message) {
          // serialize the message
          const data = JSON.parse(
            typeof message === "string"
              ? message
              : new TextDecoder().decode(message)
          );

          // get action type
          if (data.type === "ping") {
            ws.send("pong");
          }

          if (data.type === "sub") {
            const topic = data.topic;
            if (!topic) {
              ws.send("No topic provided");
              return;
            }
            // Check if the model exists
            if (!that.#models.has(topic)) {
              ws.send("Model not found");
              return;
            }
            const model = that.#models.get(topic)!;

            // Check if the user has read access
            const auth = model.auth({
              getBearerPassword() {
                return data.auth;
              },
            });
            if (!auth.read) {
              ws.send("Unauthorized");
              console.log("🛂 Unauthorized Request");
              return;
            }

            // Store that the client is subscribed to this model
            ws.subscribe(topic);
            console.log("✅ subscribed to", topic);
            ws.send(
              that.stringifyModel({
                topic,
                data: model.obj,
              })
            );
          }

          if (data.type === "unsub") {
            const topic = data.topic;
            if (!topic) {
              ws.send("No topic provided");
              return;
            }

            // Check if the model exists
            if (!that.#models.has(topic)) {
              ws.send("Model not found");
              return;
            }
            const model = that.#models.get(topic)!;

            // Remove the subscription
            ws.unsubscribe(topic);
          }

          if (data.type === "pub") {
            // get the topic
            const topic = data.topic;
            if (!topic) {
              ws.send("No topic provided");
              return;
            }
            // Check if the model exists
            if (!that.#models.has(topic)) {
              ws.send("Model not found");
              return;
            }
            const model = that.#models.get(topic)!;
            // Check if the user has write access
            const auth = model.auth({
              getBearerPassword() {
                return data.auth;
              },
            });

            if (!auth.write) {
              ws.send("Unauthorized");
              console.log("🛂 Unauthorized Request");
              return;
            }

            // Get the new data
            const newData = data.data;
            if (!newData) {
              ws.send("No data provided");
              return;
            }

            // Update the model
            for (const key in newData) {
              // @ts-ignore
              model.obj[key] = newData[key];
            }

            ws.send(
              that.stringifyModel({
                topic,
                data: model.obj,
              })
            );

            // Send the new data to all subscribers
            that.broadcast(ws, topic);
          }

          if (data.type === "call") {
            // get the topic
            const topic = data.topic;
            if (!topic) {
              ws.send("No topic provided");
              return;
            }
            // Check if the model exists
            if (!that.#models.has(topic)) {
              ws.send("Model not found");
              return;
            }
            const model = that.#models.get(topic)!;

            // Check if the user has execute access
            const auth = model.auth({
              getBearerPassword() {
                return data.auth;
              },
            });

            if (!auth.execute) {
              ws.send("Unauthorized");
              console.log("🛂 Unauthorized Request");
              return;
            }

            // Get the function name
            const functionName = data.function;
            if (!functionName) {
              ws.send("No function provided");
              return;
            }

            // Check if function exists
            // @ts-ignore
            if (
              !model.obj[functionName] ||
              typeof model.obj[functionName] !== "function"
            ) {
              ws.send("Function not found");
              return;
            }

            console.log("📞 call", functionName, data.args);
            try {
              // @ts-ignore
              model.obj[functionName](...data.args);
            } catch (e: any) {
              console.log("❌", e);
              ws.send("Error while executing function" + e.message);
              return;
            }

            console.log("✅ called", functionName, data.args);

            // Send the new data to all subscribers
            that.broadcast(ws, topic);
            ws.send(
              that.stringifyModel({
                topic: topic,
                data: that.#models.get(topic)!.obj,
              })
            );
          }
        },
      },
    });
  }
}

export function createServer(serverOptions: ServerOptions) {
  return new Server(serverOptions);
}

// The createModel function is used to create a model
// Currently it just takes the Model but not as object but as parameters
export function createModel(obj: {}, auth: AuthGuard): Model {
  return {
    obj,
    auth,
  };
}
