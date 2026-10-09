import { expect, test } from "bun:test";
import { createStore } from "../src/model";
import { migrateDock } from "../src/docking/core";
import { scoreCommand } from "../src/lib/command-search";
import { navigationItems, normalizeNavigation } from "../src/navigation-filter";
import {
  parseWorkspaceQuery,
  workspaceSearchItems,
} from "../src/workspace-search";

const matches = (item: Parameters<typeof scoreCommand>[0], query: string) =>
  scoreCommand(item, query) !== null;
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

test("prefixes narrow a query without treating arbitrary colons as commands", () => {
  expect(parseWorkspaceQuery(" > open settings")).toEqual({
    scope: "actions",
    text: "open settings",
  });
  expect(parseWorkspaceQuery("ASSETS: greeting")).toEqual({
    scope: "assets",
    text: "greeting",
  });
  expect(parseWorkspaceQuery("panels:")).toEqual({ scope: "panels", text: "" });
  expect(parseWorkspaceQuery("search: hello")).toEqual({
    scope: "search",
    text: "hello",
  });
  expect(parseWorkspaceQuery("actions: new")).toEqual({
    scope: "actions",
    text: "new",
  });
  expect(parseWorkspaceQuery("http://hello")).toEqual({
    scope: "all",
    text: "http://hello",
  });
  expect(parseWorkspaceQuery("my assets: test").scope).toBe("all");
});

test("shared matching finds accents, acronyms, and authored file paths", () => {
  expect(scoreCommand({ label: "São Paulo" }, "sao")?.ranges).toEqual([[0, 3]]);
  expect(matches({ label: "Open settings" }, "os")).toBe(true);
  const store = createStore(storage());
  const greeting = workspaceSearchItems(store.active()).find(
    (item) => item.assetId === "greeting",
  )!;
  expect(matches(greeting, "lib.rs")).toBe(true);
  expect(matches(greeting, "unfindable")).toBe(false);
});

test("pins bypass filters, exclusions win, and live results follow creation, rename and deletion", () => {
  const store = createStore(storage());
  const web = store.createWebAsset("Weather page");
  const filter = normalizeNavigation({
    query: "assets: weather",
    pinned: ["asset:greeting"],
    assetKinds: ["web-content"],
  });
  const select = () =>
    navigationItems(workspaceSearchItems(store.active()), filter, matches).map(
      (item) => item.id,
    );
  expect(select()).toEqual(["asset:greeting", `asset:${web}`]);
  filter.excluded.push("asset:greeting");
  expect(select()).toEqual([`asset:${web}`]);
  store.renameAsset(web, "Something else");
  expect(select()).toEqual([]);
  const another = store.createWebAsset("Weather today");
  expect(select()).toEqual([`asset:${another}`]);
  store.deleteAssets([another]);
  expect(select()).toEqual([]);
});

test("saved navigation is workspace-local, survives reload, and stays outside layout undo", () => {
  const disk = storage();
  const store = createStore(disk);
  const original = store.active().id;
  const filter = normalizeNavigation({
    kinds: ["panels"],
    query: "panels: clock",
    pinned: [],
    excluded: ["panel:workspace-home"],
    sort: "workspace",
  });
  store.setNavigation(filter);
  expect(store.layoutHistory().canUndo).toBe(false);
  store.createWorkspace("Another workspace");
  expect(store.active().navigation).toEqual(normalizeNavigation());
  store.selectWorkspace(original);
  expect(createStore(disk).active().navigation).toEqual(filter);
});

test("older workspaces get navigation defaults without changing source or dock identity", () => {
  const disk = storage();
  const original = createStore(disk).active();
  const { navigation: _navigation, ...legacy } = original;
  disk.setItem(
    "unit-workspace.v4",
    JSON.stringify({ workspaces: [legacy], activeWorkspaceId: legacy.id }),
  );
  const restored = createStore(disk).active();
  expect(restored.navigation).toEqual(normalizeNavigation());
  expect(restored.assets).toEqual(original.assets);
  expect(restored.dock).toEqual(migrateDock(original.dock));
  expect(
    normalizeNavigation({
      kinds: ["assets", "assets", "invalid"] as never,
      pinned: ["x", "x"],
    }).kinds,
  ).toEqual(["assets"]);
});
