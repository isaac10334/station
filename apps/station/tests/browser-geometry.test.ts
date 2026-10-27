import { test, expect } from "bun:test";
import { nativeBrowserFrame } from "../desktop/browser-geometry";

test("native coordinates follow root page zoom while leaving monitor DPI to Electrobun", () => {
  const frame = {
    x: 120.25,
    y: 80.5,
    width: 600.5,
    height: 300.25,
    visible: true,
  };
  for (const zoom of [0.5, 0.8, 1, 1.25, 1.5, 2]) {
    const actual = nativeBrowserFrame(frame, zoom);
    expect(actual.x).toBe(frame.x * zoom);
    expect(actual.y).toBe(frame.y * zoom);
    expect(actual.width).toBe(frame.width * zoom);
    expect(actual.height).toBe(frame.height * zoom);
    // At 150% OS scaling, resizeWebview multiplies these logical bounds by 1.5.
    expect(actual.x * 1.5).toBeCloseTo(frame.x * zoom * 1.5);
    expect(actual.visible).toBe(true);
  }
  expect(nativeBrowserFrame({ ...frame, visible: false }, 1.25).visible).toBe(
    false,
  );
  for (const zoom of [0, -1, NaN, Infinity])
    expect(() => nativeBrowserFrame(frame, zoom)).toThrow();
});
