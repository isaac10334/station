import { installProofWorker } from "./worker";
installProofWorker({ send: value => postMessage(value), listen: callback => addEventListener("message", event => callback(event.data)) });
