import { expect, test } from "bun:test";
import { desktopProfile } from "../desktop/profile";
import { isTrustedDesktopRequest } from "../desktop/trusted-request";

test("acceptance identity and origin cannot reuse the installed user's desktop membrane", () => {
  const user = desktopProfile(false),
    acceptance = desktopProfile(true);
  expect(acceptance.identifier).not.toBe(user.identifier);
  expect(acceptance.port).not.toBe(user.port);
  const request = new Request(`${acceptance.origin}/api/desktop/browser`, {
    method: "POST",
    headers: {
      host: new URL(acceptance.origin).host,
      origin: acceptance.origin,
      "sec-fetch-site": "same-origin",
      "x-station-desktop": "test",
    },
  });
  expect(isTrustedDesktopRequest(request, "test", acceptance.origin)).toBe(
    true,
  );
  expect(isTrustedDesktopRequest(request, "test", user.origin)).toBe(false);
  expect(isTrustedDesktopRequest(request, "wrong", acceptance.origin)).toBe(
    false,
  );
});
