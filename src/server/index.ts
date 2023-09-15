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

const configModel = createModel(config, (req, auth) => {
  if (auth.getBearerPassword() === "123") {
    return {
      write: true,
      read: true
    };
  }
  return {
    write: false,
    read: true
  };
});

const textListModel = createModel(textList, (req, auth) => {
  if (auth.getBearerPassword() === "123") {
    return {
      write: true,
      read: true
    };
  }
  return {
    write: false,
    read: true
  };
});

const bundle = await bundleClient();
const clientCode = await bundle.outputs[0].text();

const server = createServer({
  models: {
    config: configModel,
    textList: textListModel
  },
  bundle: clientCode
});


server.listen(3000);