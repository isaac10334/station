import { wasi } from "@polyengine/wasi";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE, ASSET_HOST_INTERFACE, ASSET_SURFACE_INTERFACE } from "./component-contract";

/** Run-local import membrane. Provider effects always recheck their grant and abort state.
 * @example
 * const run = createRunTabProviders(new Set([HOST_LOG]), controller.signal);
 * run.imports[ASSET_HOST_INTERFACE].log("started");
 */
export function createRunTabProviders(grants: ReadonlySet<string>, signal: AbortSignal) {
  const logs: string[] = [];
  let surfaceText = "";
  const check = (grant: string) => {
    if (signal.aborted) throw new Error("Component run cancelled.");
    if (!grants.has(grant)) throw new Error(`Import denied: ${grant}`);
  };
  const imports: Record<string, any> = { ...wasi() };
  imports["wasi:cli/exit@0.2"] = { ...imports["wasi:cli/exit@0.2"], exitWithCode: () => { throw new Error("Guest requested process exit."); } };
  for (const track of ["wasi:clocks/monotonic-clock@0.2", "wasi:clocks/monotonic-clock@0.3"]) {
    const clock = imports[track];
    imports[track] = Object.fromEntries(Object.entries(clock).map(([name, value]) => [name,
      typeof value === "function" ? (...args: unknown[]) => { check(HOST_CLOCK); return Reflect.apply(value, clock, args); } : value,
    ]));
  }
  imports[ASSET_HOST_INTERFACE] = {
    log(message: string) {
      check(HOST_LOG);
      if (logs.length >= 100) throw new Error("Component log limit exceeded.");
      logs.push(String(message).slice(0, 1024));
    },
    feed(input: string) {
      check(HOST_FEED);
      const bytes = new TextEncoder().encode(input);
      if (bytes.byteLength > 64 * 1024) throw new Error("Component feed limit exceeded.");
      return [new ReadableStream<Uint8Array>({ start(controller) { check(HOST_FEED); controller.enqueue(bytes); controller.close(); } }), Promise.resolve(bytes.byteLength)];
    },
  };
  imports[ASSET_SURFACE_INTERFACE] = { setText(message: string) { check(HOST_SURFACE); surfaceText = String(message).slice(0, 4096); } };
  return { imports, snapshot: () => ({ logs: [...logs], surfaceText }) };
}
