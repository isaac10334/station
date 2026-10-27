import { expect, test } from "bun:test";
import { contributionSource, parseManifest } from "../src/core/package-assets";
import { programFiles, draftSchema } from "../src/core/programs";
import type { Asset } from "../src/core/asset-state";

const source = (kind: Asset["kind"], files: Record<string, string>) => ({ id: "source", instanceId: "i", name: "Source", description: "", revision: 0, kind, files }) as Asset;
const manifest = (role: string, extra = {}) => parseManifest(JSON.stringify({ version: 1, id: "kit", name: "Kit", contributions: [{ id: "tool", title: "Tool", role, assetId: "source", ...extra }] }));

test("contribution roles select compatible source without granting or starting anything", () => {
  const html = source("web-content", { "index.html": "<p>Tool</p>" });
  expect(contributionSource(manifest("widget").contributions[0]!, html)).toBe("web");
  expect(contributionSource(manifest("editor").contributions[0]!, html)).toBe("web");
  for (const role of ["service", "settings", "asset-type", "command"]) expect(() => contributionSource(manifest(role).contributions[0]!, html)).toThrow("incompatible");
  for (const role of ["service", "settings", "asset-type", "widget", "command", "editor"]) {
    const programRole = role === "command" ? "action" : role === "editor" ? "widget" : role;
    const program = source("script", programFiles(draftSchema.parse({ role: programRole, files: { "main.tsx": "export default () => null" } })));
    expect(contributionSource(manifest(role).contributions[0]!, program)).toBe("program");
  }
  expect(() => contributionSource(manifest("service").contributions[0]!, source("script", programFiles(draftSchema.parse({ role: "action", files: { "main.ts": "export default () => null" } }))))).toThrow("service program");
});

test("slots accept surface definitions, reject nonvisual roles and bind editor parts only to editors", () => {
  expect(() => manifest("widget", { slots: [{ id: "tools", definitions: ["missing"] }] })).toThrow("widget or editor");
  expect(() => manifest("widget", { slots: [{ id: "code", definitions: ["station:editor/code"] }] })).toThrow("editor contribution");
  expect(() => manifest("editor", { slots: [{ id: "code", definitions: ["station:editor/code"] }] })).not.toThrow();
  for (const role of ["command", "service", "settings", "asset-type"]) expect(() => parseManifest(JSON.stringify({ version: 1, id: "kit", name: "Kit", contributions: [
    { id: "view", title: "View", role: "widget", assetId: "view", slots: [{ id: "tools", definitions: ["worker"] }] },
    { id: "worker", title: "Worker", role, assetId: "worker" },
  ] }))).toThrow("widget or editor");
});
