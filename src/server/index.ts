import { bundleClient } from "./bundle";
import { createServer, createModel } from "./lib";

const config = {
  message: "Hello World!",
  counter: 0,
  isAwesome: true
}

const textList = [
  "Hello",
  "World",
  "How",
  "Are",
  "You",
  "Today?"
];

const configModel = createModel(config, (auth) => {
  if (auth.getBearerPassword() === "123") {
    return {
      write: true,
      read: true,
      execute: true
    };
  }
  return {
    write: false,
    read: true,
    execute: false
  };
});

const textListModel = createModel(textList, (auth) => {
  if (auth.getBearerPassword() === "123") {
    return {
      write: true,
      read: true,
      execute: false
    };
  }
  return {
    write: false,
    read: true,
    execute: false
  };
});

const bundle = await bundleClient();
const clientCode = await bundle.outputs[0].text();

const server = createServer({
  models: new Map([
    ["config", configModel],
    ["textList", textListModel]
  ]),
  bundle: clientCode
});


server.listen(3000);