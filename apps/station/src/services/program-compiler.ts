/** Compile selected virtual files into a function body for the reusable Wasm engine. */
import { WorkerClient } from "./worker-client";
import type { ProgramDraft } from "../core/programs";
export async function compileProgram(draft:ProgramDraft, dependencies:Record<string,string>, signal?:AbortSignal) {
  const [tools,web,sdk]=await Promise.all([import("../generated/program-tools"),import("../generated/web-tools"),import("../generated/program-resources")]);
  signal?.throwIfAborted();
  const client=new WorkerClient(tools.compilerWorker);
  const abort=()=>client.dispose(new Error("Compilation cancelled"));signal?.addEventListener('abort',abort,{once:true});
  try {await client.request({op:'init',resources:sdk.resources,wasm:web.wasm});const result=await client.request<string>({op:'build',entry:draft.entry,files:{...dependencies,...draft.files}});signal?.throwIfAborted();return result;} finally {signal?.removeEventListener('abort',abort);client.dispose();}
}
