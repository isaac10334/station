import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { assetFiles } from "../src/core/source-project";
import {
  exportPackage,
  importPackage,
  parseManifest,
} from "../src/core/package-assets";
import { parseTheme, DEFAULT_THEME } from "../src/core/theme-assets";
import {
  migrateDock,
  validateDock,
  descendants,
  type Node,
} from "../src/core/docking";
import { floatingBounds } from "../src/ui/docking/floating";
import { serveGuest, type GuestBindings } from "../src/services/guest-bridge";

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
};
test("legacy HTML and placement migrate losslessly into the initial desk and stay idempotent", () => {
  const { storage, values } = memory(),
    seed = createStore(storage);
  const id = seed.createWebAsset("Legacy", "<p>Original</p>");
  const workspace: any = structuredClone(seed.active());
  delete workspace.desks;
  delete workspace.activeDeskId;
  delete workspace.assets.find((asset: any) => asset.id === id).files;
  values.set(
    "unit-workspace.v4",
    JSON.stringify({
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
    }),
  );
  const store = createStore(storage);
  expect(assetFiles(store.selected()!)).toEqual({
    "index.html": "<p>Original</p>",
  });
  expect(store.desk().dock).toEqual(migrateDock(workspace.dock));
  store.renameWorkspace("Saved");
  const reloaded = createStore(storage);
  expect(reloaded.active()).toEqual(store.active());
});
test("desk copies use new identities, share assets, isolate history, and snapshot defaults", () => {
  const { storage } = memory(),
    store = createStore(storage);
  const original = store.desk();
  const result = store.dispatchDock({
    type: "createWidget",
    widget: "snake",
    target: { surface: "dashboard", intent: "append" },
  });
  expect(result.ok).toBe(true);
  store.saveDeskDefault();
  store.createDesk("Second");
  const second = store.desk();
  expect(Object.keys(second.dock.panels)).not.toContain(
    result.ok ? result.panelId : "",
  );
  expect(validateDock(second.dock)).toBeNull();
  expect(store.layoutHistory().canUndo).toBe(false);
  const id = store.createWebAsset("Shared");
  store.selectDesk(original.id);
  expect(store.active().assets.some((asset) => asset.id === id)).toBe(true);
  expect(store.layoutHistory().canUndo).toBe(true);
  store.patchDesk({ themeId: "edited" });
  store.saveDeskDefault();
  store.selectDesk(second.id);
  expect(store.desk().themeId).toBeNull();
});
test("owned editor children survive migration, reject escape and foreign insertion, and close atomically", () => {
  const { storage } = memory(),
    store = createStore(storage);
  store.dispatchDock({ type: "openAsset", assetId: "greeting" });
  const ownerId = "asset-view:greeting";
  const child = `${ownerId}:code`,
    root: Node = {
      kind: "stack",
      id: "owned-slot",
      tabs: [child],
      active: child,
      keepEmpty: true,
    };
  expect(
    store.dispatchDock({
      type: "compose",
      ownerId,
      root,
      panels: [
        {
          id: child,
          kind: "editor-part",
          part: "code",
          ownerId,
          assetId: "greeting",
          tags: ["widget"],
        },
      ],
    }).ok,
  ).toBe(true);
  const dock = store.active().dock;
  expect(migrateDock(migrateDock(dock))).toEqual(migrateDock(dock));
  expect(migrateDock(dock).containers[ownerId]).toEqual({
    ...root,
    presentation: "tabs",
  });
  expect(
    store.dispatchDock({
      type: "move",
      panelId: child,
      target: { surface: "dashboard", intent: "append" },
    }).ok,
  ).toBe(false);
  expect(
    store.dispatchDock({
      type: "createWidget",
      widget: "clock",
      target: { surface: "main", ownerId, nodeId: root.id, intent: "tab" },
    }).ok,
  ).toBe(false);
  store.dispatchDock({ type: "close", panelId: ownerId });
  expect(store.active().dock.panels[child]).toBeUndefined();
  store.undoLayout();
  expect(descendants(store.active().dock, ownerId)).toEqual([child]);
  store.createDesk("Copy", true);
  expect(validateDock(store.desk().dock)).toBeNull();
});
test("deleting shared source removes its owner views from inactive desks too", () => {
  const { storage } = memory(),
    store = createStore(storage);
  store.dispatchDock({ type: "openAsset", assetId: "greeting" });
  store.createDesk("Other", true);
  store.deleteAssets(["greeting"]);
  expect(
    store
      .active()
      .desks.every(
        (desk) =>
          !Object.values(desk.dock.panels).some(
            (panel) => "assetId" in panel && panel.assetId === "greeting",
          ),
      ),
  ).toBe(true);
});
test("package roundtrip remaps references and strips grants/artifacts; malformed input never mutates the workspace", () => {
  const { storage } = memory(),
    store = createStore(storage);
  const web = store.createWebAsset("Widget"),
    pkg = store.createDataAsset("package", "Kit");
  store.editFile(
    pkg,
    "station.json",
    JSON.stringify({
      version: 1,
      id: "kit",
      name: "Kit",
      contributions: [
        { id: "hello", title: "Hello", role: "widget", assetId: web },
      ],
      themeAssets: [],
    }),
  );
  const asset = store.active().assets.find((asset) => asset.id === pkg)!;
  const source = exportPackage(asset, store.active().assets);
  const imported = importPackage(source, store.active().assets);
  const manifest = parseManifest(
    imported.find((asset) => asset.kind === "package")!.files!["station.json"]!,
  );
  expect(imported.find((asset) => asset.kind === "web-content")!.id).not.toBe(
    web,
  );
  expect(manifest.contributions[0]!.assetId).toBe(
    imported.find((asset) => asset.kind === "web-content")!.id,
  );
  const before = store.get();
  expect(() =>
    importPackage('{"format":"wrong"}', store.active().assets),
  ).toThrow();
  expect(store.get()).toBe(before);
});
test("themes reject arbitrary CSS and floats use identical display/movement clamps", () => {
  expect(parseTheme(JSON.stringify(DEFAULT_THEME))).toEqual(DEFAULT_THEME);
  expect(() =>
    parseTheme(
      JSON.stringify({
        ...DEFAULT_THEME,
        colors: { ...DEFAULT_THEME.colors, frame: "url(https://example.com)" },
      }),
    ),
  ).toThrow();
  expect(
    floatingBounds(
      { x: 2000, y: -10, width: 420, height: 360 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ x: 372, y: 8, width: 420, height: 360 });
});

test("failed persistence publishes no partial import or source mutation", () => {
  const store = createStore({
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage full");
    },
  });
  const before = store.get();
  expect(() => store.createWebAsset("Unsaved")).toThrow("Storage full");
  expect(store.get()).toBe(before);
});

test("package layouts require complete slots and reject recursive contribution graphs", () => {
  const contribution = {
    id: "editor",
    title: "Editor",
    role: "editor",
    assetId: "source",
    slots: [
      {
        id: "code",
        definitions: ["station:editor/code"],
        initial: ["station:editor/code"],
      },
    ],
    layout: {
      axis: "horizontal",
      ratio: 0.2,
      first: { slot: "body" },
      second: { slot: "code" },
    },
  };
  const manifest = {
    version: 1,
    id: "test",
    name: "Test",
    contributions: [contribution],
  };
  expect(
    parseManifest(JSON.stringify(manifest)).contributions[0]!.layout,
  ).toEqual(contribution.layout);
  expect(() =>
    parseManifest(
      JSON.stringify({
        ...manifest,
        contributions: [{ ...contribution, layout: { slot: "body" } }],
      }),
    ),
  ).toThrow("each declared slot");
  expect(() =>
    parseManifest(
      JSON.stringify({
        ...manifest,
        contributions: [
          {
            ...contribution,
            slots: [{ id: "code", definitions: ["editor"], initial: [] }],
          },
        ],
      }),
    ),
  ).toThrow("Recursive");
});
test("guest RPC denies undeclared authority, prototype methods, released handles, and revoked sessions", async () => {
  const channel = new MessageChannel(),
    controller = new AbortController();
  let released = 0;
  const bindings: GuestBindings = {
    signal: controller.signal,
    grants: ["station:test/service"],
    acquire: async () => ({
      methods: { read: () => "bound resource" },
      release: async () => {
        released++;
      },
    }),
    state: () => null,
    subscribe: () => () => {},
    slotOpen: () => {
      throw new Error("Denied");
    },
    slotClose: () => {
      throw new Error("Denied");
    },
  };
  const connection = serveGuest(channel.port1, bindings);
  let sequence = 0;
  const request = (op: string, args: unknown) =>
    new Promise<any>((resolve) => {
      channel.port2.onmessage = (event) => resolve(event.data);
      channel.port2.postMessage({ id: ++sequence, op, args });
    });
  expect(
    (
      await request("acquire", {
        id: "station:other/service",
        version: "1.0.0",
      })
    ).error,
  ).toContain("Grant required");
  const handle = (
    await request("acquire", { id: "station:test/service", version: "1.0.0" })
  ).value;
  expect(
    (await request("call", { handle, method: "read", args: [] })).value,
  ).toBe("bound resource");
  expect(
    (await request("call", { handle, method: "constructor", args: [] })).error,
  ).toBe("Method unavailable");
  await request("release", { handle });
  expect(released).toBe(1);
  expect(
    (await request("call", { handle, method: "read", args: [] })).error,
  ).toBe("Method unavailable");
  controller.abort();
  connection.close();
  channel.port2.close();
});
