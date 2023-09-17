# seamless.ts

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

To build:

```bash
bun run build
```

To execute after build:

```bash
./dist/server
```

## Goal

Provide a seamless way of creating APIs. The goal is to have an API that don't even notice.

## Roadmap

- [x] Create a server that can be used to create APIs
- [x] Create a client that can be used to access the API
- [ ] Support for nested objects
- [x] Support for arrays
- [x] Support for functions
- [ ] Advanced array queries
- [ ] Advanced authentication
- [ ] Advanced authorization
- [] DB integration

## How it works

The server, which is written with Bun, provides a WebSocket and a REST API.

The client can subscribe to remote objects and get notified when they change.

For easier use, the client outputs a proxy object that can be used to access the remote objects as if they were local.

Nested objects aren't watched, instead, you have to replace the whole object, if you want to change a nested property.

## Usage

```ts
// server
import { bundleClient } from "./bundle";
import { createServer, createModel } from "./lib";

const config = {
  message: "Hello World!",
  counter: 0,
  isAwesome: true,
  increment() {
    this.counter++;
  },
};

const configModel = createModel(config, (req, auth) => {
  if (auth.getBearerPassword() === "123") {
    return {
      write: true,
      read: true,
    };
  }
  return {
    write: false,
    read: true,
  };
});

const bundle = await bundleClient();
const clientCode = await bundle.outputs[0].text();

const server = createServer({
  models: {
    config: configModel,
  },
  bundle: clientCode,
});

server.listen(3000);
```

```ts
// client
const client = await import("http://localhost:3000/client.js");

const ws = new WebSocket("ws://localhost:3000/ws");

const manager = new client.RemoteObjectManager(ws, "123");

await new Promise((resolve) => setTimeout(resolve, 1000));

const config = await manager.subscribe("config");

config.message; // -> "Hello World!"

config.counter; // -> 0

config.counter = 1;

config.counter; // -> 1
```
