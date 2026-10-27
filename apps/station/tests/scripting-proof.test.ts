import { describe, expect, test } from "bun:test";
import { coreMemories } from "../scripts/scripting-proof/inspection";
import { ProofHost } from "../scripts/scripting-proof/host";
import { requestSchema, hostCallSchema } from "../scripts/scripting-proof/contracts";

describe("scripting proof bounds and host membrane", () => {
  test("requires a bounded wasm32 memory declaration", () => {
    const header = [0, 97, 115, 109, 1, 0, 0, 0];
    expect(coreMemories(new Uint8Array([...header, 5, 4, 1, 1, 1, 2]))).toEqual([{ min: 65536, max: 131072 }]);
    expect(() => coreMemories(new Uint8Array([...header, 5, 3, 1, 0, 1]))).toThrow("explicit wasm32 maximum");
    expect(() => coreMemories(new Uint8Array([...header, 5, 9, 1]))).toThrow("Truncated");
  });
  test("wire schemas bound payloads and refuse undeclared operations", () => {
    expect(hostCallSchema.safeParse({ op: "source.read", resource: 1 }).success).toBe(false);
    expect(hostCallSchema.safeParse({ op: "render", resource: 1, document: "🧭".repeat(2048) }).success).toBe(false);
    expect(requestSchema.safeParse({ op: "evaluate", source: "x".repeat(32_769), input: "null" }).success).toBe(false);
  });
  test("revocation ends pending reads and invalidates retained handles", async () => {
    const host = new ProofHost();
    const resource = Number(await host.call({ op: "subscribe", binding: "counter" }));
    const pending = host.call({ op: "next", resource });
    host.revoke("counter");
    expect(await pending).toBeNull();
    await expect(host.call({ op: "next", resource })).rejects.toThrow("disposed");
    expect(host.stats.resources).toBe(0);
    expect(() => host.emit("counter", "late")).toThrow("Binding denied");
    host.close();
  });
  test("revocation during a service call denies its late result", async () => {
    const host = new ProofHost();
    const pending = host.call({ op: "invoke", binding: "double", input: "21" });
    host.revoke("double");
    await expect(pending).rejects.toThrow("Binding denied");
    host.close();
    expect(host.stats.timers).toBe(0);
  });
  test("close aborts host timers and disposes resources once", async () => {
    const host = new ProofHost();
    await host.call({ op: "open" });
    const pending = host.call({ op: "invoke", binding: "double", input: "21" });
    const result = pending.then(() => "resolved", error => String(error));
    host.close(); host.close();
    expect(await result).toContain("cancelled");
    expect(host.stats.disposed).toBe(1);
    expect(host.stats.timers).toBe(0);
    expect(host.stats.resources).toBe(0);
  });
});
