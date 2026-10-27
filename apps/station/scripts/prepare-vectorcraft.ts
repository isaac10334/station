import { unzipSync } from "fflate";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { mkdir, cp } from "node:fs/promises";
const version = "0.14.0", digest = "6f28a8bcee1c5ad6c37c6a0c44058793a40ea4443085866d5f78afb16aba075e";
const root = resolve(import.meta.dir, ".."), target = resolve(root, ".runtime/vectorcraft"), archive = resolve(root, `../../.artifacts/vendor/vectorcraft-web-${version}.zip`);
await mkdir(resolve(root, "../../.artifacts/vendor"), { recursive: true });
if (!await Bun.file(archive).exists()) {
  const response = await fetch(`https://github.com/storytold/vectorcraft/releases/download/v${version}/vectorcraft-web-${version}.zip`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`VectorCraft download failed: ${response.status}`);
  await Bun.write(archive, response);
}
const bytes = new Uint8Array(await Bun.file(archive).arrayBuffer());
if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== digest) throw new Error("VectorCraft archive checksum mismatch");
await mkdir(target, { recursive: true });
for (const [name, data] of Object.entries(unzipSync(bytes))) {
  if (!name.startsWith(`vectorcraft-web-${version}/`) || name.endsWith("/")) continue;
  const file = resolve(target, name.slice(`vectorcraft-web-${version}/`.length)), path = relative(target, file);
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error("Invalid vendor archive path");
  await Bun.write(file, data);
}
const bridge = await Bun.build({ entrypoints: [resolve(root, "src/services/vectorcraft-frame.ts")], target: "browser", minify: true });
if (!bridge.success) throw new Error("VectorCraft bridge build failed", { cause: bridge.logs });
await Bun.write(resolve(target, "bridge.js"), bridge.outputs[0]);
await Bun.write(resolve(target, "vendor.json"), JSON.stringify({ version, sha256: digest, source: "https://github.com/storytold/vectorcraft" }));
await cp(target, resolve(root, "dist/vectorcraft"), { recursive: true });
console.log(`Prepared unmodified VectorCraft ${version} and isolated document adapter`);
