import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStationApi } from "../station-server";
import { sha256 } from "../src/build-contract";

const root = await mkdtemp(join(tmpdir(), "station-api-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const api = createStationApi({
  artifactDir: root,
  sandboxConfig: join(root, "missing.json"),
  translator: join(root, "translator.wasm"),
  worker: join(root, "worker.js"),
});
const origin = "http://127.0.0.1:43157";

test("desktop API rejects opaque and cross-site callers before effects", async () => {
  for (const headers of [
    { Origin: "null" },
    { Origin: "https://example.com" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    expect(
      (
        await api(
          new Request(`${origin}/api/component/build`, {
            method: "POST",
            headers,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await api(new Request(`${origin}/api/component/worker.js`, { headers })))
        .status,
    ).toBe(403);
  }
  expect(
    (
      await api(
        new Request(`${origin}/api/component/build`, { method: "POST" }),
      )
    ).status,
  ).toBe(403);
});

test("desktop serves packaged worker and translator without a source checkout", async () => {
  await Bun.write(join(root, "worker.js"), "self.onmessage = () => {};");
  await Bun.write(
    join(root, "translator.wasm"),
    new Uint8Array([0, 97, 115, 109]),
  );
  const worker = await api(new Request(`${origin}/api/component/worker.js`));
  expect(await worker.text()).toBe("self.onmessage = () => {};");
  expect(worker.headers.get("Content-Security-Policy")).toContain(
    "wasm-unsafe-eval",
  );
  const translator = await api(
    new Request(`${origin}/api/component/translator.wasm`),
  );
  expect(translator.headers.get("Content-Type")).toBe("application/wasm");
  expect(new Uint8Array(await translator.arrayBuffer())).toEqual(
    new Uint8Array([0, 97, 115, 109]),
  );
});

test("persistent artifact reads verify bytes and reject tampering", async () => {
  const bytes = new Uint8Array([0, 97, 115, 109]);
  const hash = await sha256(bytes);
  await Bun.write(join(root, `${hash}.wasm`), bytes);
  expect(
    (await api(new Request(`${origin}/api/artifacts/${hash}.wasm`))).status,
  ).toBe(200);
  await Bun.write(join(root, `${hash}.wasm`), "tampered");
  expect(
    (await api(new Request(`${origin}/api/artifacts/${hash}.wasm`))).status,
  ).toBe(404);
});
