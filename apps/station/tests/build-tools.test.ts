import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { ensurePinnedExecutable } from "../scripts/pinned-executable";

const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const executable = new TextEncoder().encode("pinned test compiler; never executed");
const archive = zipSync({ "compiler.exe": executable, "../escape.txt": new TextEncoder().encode("ignored") });
const spec = { name: "compiler.exe", url: "https://example.invalid/pinned.zip", archiveName: "pinned.zip", archiveSha256: hash(archive), executableSha256: hash(executable) };
async function temporary(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "station-build-tool-test-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
test("missing compiler is verified and installed atomically; cached binary/archive work offline", async () => temporary(async directory => {
  let downloads = 0;
  const options = { directory, download: async () => { downloads++; return archive; } };
  const path = await ensurePinnedExecutable(spec, options);
  expect(hash(new Uint8Array(await readFile(path)))).toBe(spec.executableSha256);
  expect(await Bun.file(join(directory, "escape.txt")).exists()).toBe(false);
  await ensurePinnedExecutable(spec, options); expect(downloads).toBe(1);
  await unlink(path);
  await ensurePinnedExecutable(spec, { directory, download: async () => { throw new Error("offline"); } });
  expect(hash(new Uint8Array(await readFile(path)))).toBe(spec.executableSha256);
}));
test("unverified archive bytes never become cached tools", async () => temporary(async directory => {
  await expect(ensurePinnedExecutable(spec, { directory, download: async () => executable })).rejects.toThrow("Checksum mismatch");
  expect(await Bun.file(join(directory, spec.name)).exists()).toBe(false);
  expect(await Bun.file(join(directory, spec.archiveName)).exists()).toBe(false);
}));
test("verified archive still requires pinned executable bytes", async () => temporary(async directory => {
  await expect(ensurePinnedExecutable({ ...spec, executableSha256: "0".repeat(64) }, { directory, download: async () => archive })).rejects.toThrow("Checksum mismatch");
  expect(await Bun.file(join(directory, spec.name)).exists()).toBe(false);
}));
test("corrupted cache and explicit missing overrides fail without privilege or download fallback", async () => temporary(async directory => {
  let downloads = 0;
  const options = { directory, download: async () => { downloads++; return archive; } };
  await writeFile(join(directory, spec.name), "wrong executable");
  await expect(ensurePinnedExecutable(spec, options)).rejects.toThrow("Checksum mismatch");
  await expect(ensurePinnedExecutable(spec, { ...options, override: join(directory, "missing.exe") })).rejects.toThrow("STATION_SCRIPTING_COMPILER");
  expect(downloads).toBe(0);
}));
