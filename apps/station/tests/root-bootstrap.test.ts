import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { desktopRootBootstrap } from "../desktop/root-bootstrap";
const execute = (target: Window, script: string) => new Function("window", "location", "document", "Event", script)(target, target.location, target.document, target.Event);
test("fixed native bootstrap injects only into the exact root and exposes no agent script parameter", () => {
  const root = new Window({ url: "http://127.0.0.1:43158/" });
  let ready = 0; root.addEventListener("station:desktop-ready", () => ready++);
  execute(root, desktopRootBootstrap("http://127.0.0.1:43158", "private-test-secret"));
  expect(root.document.querySelector('meta[name="station-desktop"]')?.getAttribute("content")).toBe("private-test-secret");
  expect(ready).toBe(1);
  const foreign = new Window({ url: "https://example.com/" }); execute(foreign, desktopRootBootstrap("http://127.0.0.1:43158", "private-test-secret"));
  expect(foreign.document.querySelector('meta[name="station-desktop"]')).toBeNull();
  const wrongPath = new Window({ url: "http://127.0.0.1:43158/api/artifacts/x" }); execute(wrongPath, desktopRootBootstrap("http://127.0.0.1:43158", "private-test-secret"));
  expect(wrongPath.document.querySelector('meta[name="station-desktop"]')).toBeNull();
  root.happyDOM.abort(); foreign.happyDOM.abort(); wrongPath.happyDOM.abort();
});
