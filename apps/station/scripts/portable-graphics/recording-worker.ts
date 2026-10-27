import {parentPort} from 'node:worker_threads';
import {installScriptingWorker} from '../../src/providers/scripting/worker';
installScriptingWorker({send:value=>parentPort!.postMessage(value),listen:listener=>{parentPort!.on('message',listener);}});
