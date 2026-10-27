import { z } from "zod";
import { defineCapability } from "@loop-kit/capabilities";
export const scriptInputSchema = z.object({ code: z.string().min(1).max(16384), input: z.json(), expression: z.boolean().default(false) }).strict();
export const scriptOutputSchema = z.object({ value: z.json(), logs: z.array(z.string()), elapsedMs: z.number(), engine: z.literal("quickjs-wasm") });
export type ScriptInput = z.input<typeof scriptInputSchema>;
export type ScriptOutput = z.infer<typeof scriptOutputSchema>;
/** Data-only evaluation. No filesystem, DOM, network, Station handles or imports.
 * @example await handle.value.evaluate({code: 'return input * 2', input: 4}) */
export interface ScriptEvaluator { evaluate(request: ScriptInput, signal?: AbortSignal): Promise<ScriptOutput> }
export const scriptEvaluator = defineCapability<ScriptEvaluator>({ id: "station:scripting/evaluate", version: "1.0.0" });
