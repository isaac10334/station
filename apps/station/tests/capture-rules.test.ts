import { expect, test } from "bun:test";
import { captureRecord, captureRulesSchema, previewCapture, readCaptureRules, type CaptureRules } from "../src/core/capture-rules";
import { INBOX_DOCUMENT } from "../src/core/shortcuts";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { taskScopeSchema } from "@station/protocol";

const configuration: CaptureRules = { version: 1, rules: [
  { id: "disabled", enabled: false, match: "contains", text: "#done", status: "Inbox", stripPrefix: false },
  { id: "done", enabled: true, match: "starts-with", text: "#done", status: "Done", stripPrefix: true },
  { id: "later", enabled: true, match: "contains", text: "review", status: "Inbox", stripPrefix: false },
] };
const fixture = () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage), control = createStationControl(store);
  const source = () => store.active().assets.find(asset => asset.id === "inbox")!;
  const call = (method: string, params: object) => control.execute({ method, params: { assetId: "inbox", expectedAssetRevision: source().revision, ...params }, version: control.version() });
  return { store, control, source, call, storage };
};

test("capture rules match once, ignore case and disabled entries, and preserve unmatched text", () => {
  expect(readCaptureRules(undefined)).toEqual({ version: 1, rules: [] });
  expect(previewCapture("  #DONE review the release  ", configuration)).toEqual({ text: "review the release", status: "Done", ruleId: "done" });
  expect(previewCapture("plain thought", configuration)).toEqual({ text: "plain thought", status: "Inbox", ruleId: undefined });
  expect(previewCapture("Please REVIEW this", configuration).ruleId).toBe("later");
  expect(() => previewCapture("#done", configuration)).toThrow("entire capture");
  expect(() => readCaptureRules("broken")).toThrow();
  expect(captureRulesSchema.safeParse({ version: 1, rules: [...configuration.rules, configuration.rules[0]] }).success).toBe(false);
  expect(captureRulesSchema.safeParse({ version: 1, rules: Array.from({ length: 21 }, (_, index) => ({ ...configuration.rules[0], id: `${index}` })) }).success).toBe(false);
});

test("capture rejects full, incompatible and read-only sources before changing rows", () => {
  expect(() => captureRecord({ ...INBOX_DOCUMENT, provider: "remote" }, configuration, "hello", "new", "now")).toThrow("writable");
  expect(() => captureRecord({ ...INBOX_DOCUMENT, columns: [] }, configuration, "hello", "new", "now")).toThrow("columns");
  const full = { ...INBOX_DOCUMENT, records: Array.from({ length: 500 }, (_, index) => ({ id: `${index}`, values: { text: "old" } })) };
  expect(() => captureRecord(full, configuration, "hello", "new", "now")).toThrow("full");
  expect(full.records).toHaveLength(500);
  expect(() => captureRecord(INBOX_DOCUMENT, { version: 1, rules: [{ ...configuration.rules[1]!, status: "Missing" }] }, "#done task", "new", "now")).toThrow("Status options");
  expect(INBOX_DOCUMENT.records).toHaveLength(0);
});

test("rules persist as ordinary source and one capture commits exactly one transformed record", () => {
  const f = fixture();
  try {
    f.call("capture.configure", { configuration });
    const revision = f.source().revision;
    expect(JSON.parse(f.source().files!["data.json"]!).records).toHaveLength(0);
    f.call("capture.create", { text: "#DONE release review" });
    const document = JSON.parse(f.source().files!["data.json"]!);
    expect(document.records).toHaveLength(1);
    expect(document.records[0].values).toMatchObject({ text: "release review", status: "Done" });
    expect(f.source().revision).toBe(revision + 1);
    expect(JSON.parse(createStore(f.storage).active().assets.find(asset => asset.id === "inbox")!.files!["capture.json"]!)).toEqual(configuration);
    expect(() => f.call("capture.create", { expectedAssetRevision: revision, text: "stale" })).toThrow("Stale");
    expect(JSON.parse(f.source().files!["data.json"]!).records).toHaveLength(1);
    expect(() => f.call("capture.configure", { configuration: { version: 1, rules: [{ ...configuration.rules[1], status: "Missing" }] } })).toThrow("Status options");
  } finally { f.control.dispose(); }
});

test("capture applies the same operation/resource/revocation/file policy as data edits", () => {
  const f = fixture();
  try {
    const issue = (scope: object) => f.control.issueTask({ name: "Capture policy", workspaceId: f.store.active().id, scope: taskScopeSchema.parse(scope) });
    const request = () => ({ method: "capture.create", params: { assetId: "inbox", expectedAssetRevision: f.source().revision, text: "hello" }, version: f.control.version() });
    const noOperation = issue({ operations: [], editableAssets: ["inbox"] });
    const noResource = issue({ operations: ["capture.create"] });
    const partial = issue({ operations: ["capture.create"], editableAssets: ["inbox"], fileAccess: { inbox: { read: ["data.json"], write: ["data.json"] } } });
    expect(() => f.control.executeFor(noOperation, request())).toThrow();
    expect(() => f.control.executeFor(noResource, request())).toThrow();
    expect(() => f.control.executeFor(partial, request())).toThrow("whole-source");
    expect(JSON.parse(f.source().files!["data.json"]!).records).toHaveLength(0);
    const allowed = issue({ operations: ["capture.create"], editableAssets: ["inbox"] });
    f.control.executeFor(allowed, request());
    expect(JSON.parse(f.source().files!["data.json"]!).records).toHaveLength(1);
    f.control.revoke(allowed.taskId);
    expect(() => f.control.executeFor(allowed, request())).toThrow();
  } finally { f.control.dispose(); }
});
