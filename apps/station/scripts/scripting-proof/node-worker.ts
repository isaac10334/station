import { parentPort } from "node:worker_threads";
import { installProofWorker } from "./worker";
if (!parentPort) throw new Error("Expected an isolated Node worker");
const port = parentPort;
installProofWorker({ send: value => port.postMessage(value), listen: callback => port.on("message", callback) });
