import { installScriptingWorker } from "./worker";
installScriptingWorker({ send: value => postMessage(value), listen: callback => addEventListener("message", event => callback(event.data)) });
