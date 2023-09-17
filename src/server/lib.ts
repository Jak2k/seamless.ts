interface Permissions {
  read: boolean,
  write: boolean
  execute: boolean
}

interface Auth {
  getBearerPassword: () => string
}

type AuthGuard = (auth: Auth) => Permissions;

interface Model {
  obj: {},
  auth: AuthGuard
}

type Models = Map<string, Model>;

interface ServerOptions {
  models: Models
  bundle: string
}

class Server {
  #models: Models;
  #jsBundle: string;

  constructor(serverOptions: ServerOptions) {
    this.#models = serverOptions.models;
    this.#jsBundle = serverOptions.bundle;
  }

  listen(port: number) {
    const that = this;
    Bun.serve({
      port: port,
      async fetch (req, server) {
        const pathname = new URL(req.url).pathname;

        // upgrade to websocket, if path is /ws
        if (pathname === "/ws") {
          if(server.upgrade(req)) {
            return;
          }
        }

        // serve the client bundle
        if (pathname === "/client.js") {
          return new Response(that.#jsBundle, {
            headers: {
              "Content-Type": "text/javascript"
            }
          });
        }

        // When / returns the list of models
        if (pathname === "/") {
          return new Response(JSON.stringify(Object.keys(that.#models)));
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
          }
        });

        const method = req.method.toLowerCase();

        if (!auth.read && method === "get") {
          return new Response("Unauthorized", { status: 401 });
        } else if (!auth.write && method === "post") {
          return new Response("Unauthorized", { status: 401 });
        }

        if (method === "get") {
        return new Response(JSON.stringify(model.obj));
        } else if (method === "post") {
          const body = await req.json();

          for (const key in body) {
            // @ts-ignore
            model.obj[key] = body[key];
          }

          // send the new data to all subscribers of the ws topic
          server.publish(modelName, JSON.stringify({
            topic: modelName,
            data: model.obj
          }));

          return new Response(JSON.stringify(model.obj));
        }

        return new Response("Not implemented", { status: 501 });
      },
      websocket: {
        open (ws) {
        },
        message (ws, message) {
          // serialize the message
          const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));

          // get action type
          if (data.type === "ping") {
            ws.send("pong");
          }

          if (data.type === "sub") {
            const topic = data.topic;
            if(!topic) {
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
              }
            });
            if (!auth.read) {
              ws.send("Unauthorized");
              return;
            }

            // Store that the client is subscribed to this model
            ws.subscribe(topic);
            console.log("subscribed to", topic);
            ws.send(JSON.stringify({
              topic,
              data: model.obj
            }))
          }

          if (data.type === "unsub") {
            const topic = data.topic;
            if(!topic) {
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
            if(!topic) {
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
              }
            });

            if (!auth.write) {
              ws.send("Unauthorized");
              console.log("Unauthorized", data);
              return;
            }

            // Get the new data
            const newData = data.data;
            if(!newData) {
              ws.send("No data provided");
              return;
            }

            // Update the model
            for (const key in newData) {
              // @ts-ignore
              model.obj[key] = newData[key];
            }

            ws.send(JSON.stringify({
              topic,
              data: model.obj
            }));

            console.log("published", topic, model.obj);

            // Send the new data to all subscribers
            ws.publish(topic, JSON.stringify({topic: topic, data: model.obj}));
          }
        }
      }
    })
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
    auth
  }
}