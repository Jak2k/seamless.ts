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

## Usage

```ts
// server
import { bundleClient } from "./bundle";
import { createServer, createModel } from "./lib";

const config = {
  message: "Hello World!",
  counter: 0,
  isAwesome: true,
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
