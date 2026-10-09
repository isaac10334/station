import { expect, test } from "bun:test";
import { defineCapability, type Capability } from "../src/index.ts";

interface Clock { now(): number }
const clock = defineCapability<Clock>({ id: "loop:time/clock", version: "1.0.0" });
const typed: Capability<Clock> = clock;
void typed;

test("identity is stable data, independent of implementation", () => {
  expect(clock).toEqual({ id: "loop:time/clock", version: "1.0.0" });
  expect(Object.isFrozen(clock)).toBe(true);
  expect(defineCapability<Clock>({ id: clock.id, version: clock.version })).toEqual(clock);
  expect(() => defineCapability<Clock>({ id: "clock", version: "1" })).toThrow();
});
