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
        console.error("⚠️ No ping received from server in 30 seconds");
      } else if (Date.now() - this.#lastPing > 10000) {
        console.warn("⚠️ No ping received from server in 10 seconds");
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
      console.debug("✅ Received pong");
      return;
    }

    if (dataText === "Unauthorized") {
      console.error("⚠️ Unauthorized");
      return;
    }

    const data = JSON.parse(dataText);

    console.log("➡️ Received message", data);

    const modelData = data.data;
    const topic = data.topic;

    // Update the model
    this.models.set(topic, modelData);

    console.log("Updated model ", topic, modelData);
  }

  async subscribe(topic: string) {
    console.log("Subscribing to ", topic);
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
        console.log("📤 Sent message")
        return true;
      },
    });
  }
}