import { evaluateQuickJS } from "./quickjs-engine";
self.onmessage = async event => { const { id, request } = event.data; try { self.postMessage({ id, result: await evaluateQuickJS(request) }); } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message.slice(0,1024) : "Script failed" }); } };
