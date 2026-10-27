/** Separate execution profile inspection; the existing Component verifier is untouched. */
import { requiredImports, type ComponentArtifacts } from "@polyengine/runtime/embedder";
import { sha256 } from "../../core/build-contract";
import { MAX_MEMORY, SERVICES, SURFACES } from "../../features/programs/contracts/engine";

export async function importsHash(plan: ComponentArtifacts["plan"]) {
  return sha256(new TextEncoder().encode(JSON.stringify(requiredImports(plan).map(leaf => [leaf.interfaceId, leaf.leaf, leaf.kind, leaf.type?.async ?? null]))));
}

/** Portable UI additionally requires its owned resource and asynchronous event contract. */
export async function inspectPortableUiEngine(bytes:Uint8Array,translation:ComponentArtifacts){const result=await inspectScriptingEngine(bytes,translation);for(const name of ['Surface','open','render','nextEvent'])if(!result.leaves.some(leaf=>leaf.interfaceId===SURFACES&&leaf.jsName===name))throw new Error('Portable UI resource contract missing: '+name);if(!result.leaves.some(leaf=>leaf.interfaceId===SURFACES&&leaf.jsName==='nextEvent'&&leaf.type?.async))throw new Error('Surface events must be asynchronous');return result;}

/** Read owned core-memory declarations. Imported memories retain their defining bound.
 * Reject unsupported memory encodings rather than assuming a bound for memory64/shared.
 */
export function coreMemories(bytes: Uint8Array): { min: number; max: number }[] {
  if (![0, 97, 115, 109, 1, 0, 0, 0].every((byte, index) => bytes[index] === byte)) throw new Error("Expected a core Wasm module");
  let offset = 8;
  function u32() {
    let value = 0, shift = 0;
    for (let count = 0; count < 5; count++) {
      const byte = bytes[offset++];
      if (byte === undefined) throw new Error("Truncated Wasm integer");
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
    throw new Error("Invalid Wasm integer");
  }
  const memories: { min: number; max: number }[] = [];
  while (offset < bytes.length) {
    const section = bytes[offset++];
    const size = u32();
    const end = offset + size;
    if (end > bytes.length) throw new Error("Truncated Wasm section");
    if (section === 5) {
      const count = u32();
      for (let index = 0; index < count; index++) {
        if (u32() !== 1) throw new Error("Core memory needs an explicit wasm32 maximum");
        const min = u32() * 65536, max = u32() * 65536;
        if (min > max || max > MAX_MEMORY) throw new Error("Core memory exceeds profile budget");
        memories.push({ min, max });
      }
    }
    if (offset > end) throw new Error("Invalid Wasm section size");
    offset = end;
  }
  return memories;
}

export async function inspectScriptingEngine(bytes: Uint8Array, translation: ComponentArtifacts) {
  const leaves = requiredImports(translation.plan);
  const serviceMethods = new Set(["invoke", "subscribe", "next", "cancel", "Subscription"]);
  const surfaceMethods = new Set(["open", "render", "nextEvent", "Surface"]);
  for (const leaf of leaves) {
    const supported = leaf.interfaceId === SERVICES ? serviceMethods.has(leaf.jsName)
      : leaf.interfaceId === SURFACES ? surfaceMethods.has(leaf.jsName)
      : /^wasi:(cli|io|filesystem|clocks|random)\//.test(leaf.interfaceId) && /@0\.[23]\./.test(leaf.interfaceId)
      || ["wasi:sockets/types@0.3.0", "wasi:sockets/ip-name-lookup@0.3.0", "wasi:http/types@0.3.0", "wasi:http/client@0.3.0"].includes(leaf.interfaceId);
    if (!supported) throw new Error(`Unsupported scripting proof import: ${leaf.interfaceId}.${leaf.jsName}`);
  }
  for (const name of ["evaluate", "start", "dispatch", "stop"]) {
    const item = translation.plan.exports.find(item => item.name === name);
    if (item?.kind !== "lifted-func") throw new Error(`Missing scripting export: ${name}`);
    const type = translation.plan.types[item.type];
    const count = name === "evaluate" || name === "start" ? 2 : name === "dispatch" ? 1 : 0;
    if (type?.kind !== "func" || type.async !== (name !== "stop") || type.params.length !== count || type.params.some(param => param.type.kind !== "string") || type.results.length !== (name === "stop" ? 0 : 1) || type.results.some(type => type.kind !== "string")) throw new Error(`Invalid scripting export: ${name}`);
  }
  const memories = translation.plan.modules.flatMap(module => coreMemories(module.kind === "embedded" ? bytes.subarray(module.offset, module.offset + module.len) : translation.adapters!.get(module.file)!));
  if (!memories.length || memories.reduce((sum, memory) => sum + memory.max, 0) > MAX_MEMORY + 65536) throw new Error("Invalid combined memory budget");
  return { importsSha256: await importsHash(translation.plan), leaves, memories };
}
