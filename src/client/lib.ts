export class RemoteObjectManager {
  ws: WebSocket;
  models: Map<string, any> = new Map();
  auth: string;

  constructor(ws: WebSocket, auth: string) {
    this.ws = ws;
    this.auth = auth;

    this.ws.onmessage = (event) => {
      console.log("Message from server ", event);
      this.#handleMessage(event.data);
    };
  }

  #handleMessage(message: string | Buffer) {
    // serialize the message
    const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));

    const modelData = data.data;
    const topic = data.topic;

    // Update the model
    this.models.set(topic, modelData);

    console.log("Updated model ", topic, modelData);
  }

  async subscribe(topic: string) {
    console.log("Subscribing to ", topic);
    console.log(this)
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
        return that.models.get(topic)[prop];
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
        return true;
      },
    });
  }
}