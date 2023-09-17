import { createLogger, jsonFormatter } from "../shared/logging";

const log = createLogger();

export class RemoteObjectManager {
  ws: WebSocket;
  models: Map<string, any> = new Map();
  auth: string;
  #pingInterval: Timer;
  #lastPing: number = Date.now();

  constructor(ws: WebSocket, auth: string) {
    this.ws = ws;
    this.auth = auth;

    this.ws.onmessage = (event) => {
      this.#handleMessage(event.data);
    };

    this.#pingInterval = setInterval(() => {
      // If the last ping was more than 30 seconds ago, error the user
      if (Date.now() - this.#lastPing > 30000) {
        log({
          status: "error",
          message: "No ping received from server in 30 seconds",
          debug: {
            lastPing: this.#lastPing,
            time: Date.now(),
            adress: this.ws.url
          },
          emoji: "🏓"
        })
      } else if (Date.now() - this.#lastPing > 10000) {
        log({
          status: "warning",
          message: "No ping received from server in 10 seconds",
          debug: {
            lastPing: this.#lastPing,
            time: Date.now(),
            adress: this.ws.url
          },
          emoji: "🏓"
        })
      }

      // Ping
      this.ws.send(JSON.stringify({
        type: "ping"
      }));
    }, 5000);
  }

  #handleMessage(message: string | Buffer) {
    // serialize the message
    const dataText = typeof message === "string" ? message : new TextDecoder().decode(message);

    if (dataText === "pong") {
      this.#lastPing = Date.now();
      log({
        status: "success",
        message: "Received pong",
        emoji: "🏓",
        debug: {
          time: Date.now(),
        }
      })
      return;
    }

    if (dataText === "Unauthorized") {
      log({
        status: "error",
        message: "Unauthorized",
        emoji: "🛂",
        debug: {
          time: Date.now(),
        },
        reason: "user"
      })
      return;
    }

    const data = JSON.parse(dataText);

    log({
      status: "success",
      message: "Received message",
      emoji: "📥",
      debug: {
        time: Date.now(),
        data
      }
    })

    const modelData = data.data;
    const topic = data.topic;

    // Update the model
    this.models.set(topic, modelData);

    log({
      status: "success",
      message: "Updated model",
      emoji: "🔄",
      debug: {
        time: Date.now(),
        topic,
        modelData
      }
    })
  }

  async subscribe(topic: string) {
    log({
      status: "success",
      message: "Subscribing to topic",
      emoji: "🔌",
      debug: {
        time: Date.now(),
        topic
      }
    })
    this.ws.send(JSON.stringify({
      type: "sub",
      topic
    }));

    // Return a fake object
    // It gets updated when the server sends a message
    // When a property is set, it sends a message to the server
    const that = this;

    return new Proxy({}, {
      get: (target, prop) => {
        // check if the model is loaded
        if (!that.models.has(topic)) {
          return undefined;
        }
        const value = that.models.get(topic)[prop];

        // check if the value is a function
        if (typeof value === "object" && value.__function) {
          return (...args: any[]) => {
            that.ws.send(JSON.stringify({
              type: "call",
              topic,
              function: prop,
              args,
              auth: that.auth
            }));
          }
        }

        return value;
      },
      set: (target, prop, value) => {
        that.ws.send(JSON.stringify({
          type: "pub",
          topic,
          data: {
            [prop]: value
          },
          auth: that.auth
        }));
        log({
          status: "success",
          message: "Sent message",
          emoji: "📤",
          debug: {
            time: Date.now(),
            topic,
            data: {
              [prop]: value
            }
          }
        })
        return true;
      },
    });
  }
}