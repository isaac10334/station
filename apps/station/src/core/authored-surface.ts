import { z } from "zod";
import { validateFrame, type UiFrame, type UiNode } from "@loop-kit/ui";

export const CONTROLLER_INPUTS: Readonly<Record<string, Readonly<Record<string, "string" | "boolean">>>> = {
  clock: { date: "string", time: "string", zone: "string", error: "string" },
  weather: { temperature: "string", condition: "string", hours: "string", error: "string", loading: "boolean" },
  "action-button": { label: "string", name: "string", busy: "boolean", error: "string", result: "string" },
  "ai-chat": {},
};

/** Authored structure binds only data and named controller actions. A binding
 * describes wiring, never permission, executable host code or a service handle. */
export const authoredSurfaceSchema = z.object({
  controller: z.enum(["clock", "weather", "action-button", "ai-chat"]),
  frame: z.unknown().transform((value, context): UiFrame => {
    try { return validateFrame(value); }
    catch (error) { context.addIssue({ code: "custom", message: String(error) }); return z.NEVER; }
  }),
  bindings: z.array(z.object({
    key: z.string().min(1).max(100),
    property: z.enum(["text", "label", "value", "loading", "disabled"]),
    input: z.string().regex(/^[a-zA-Z][\w.]{0,100}$/),
  }).strict()).max(128).default([]),
  actions: z.record(z.string().max(100), z.enum(["locate", "activate"])).default({}),
}).strict().superRefine((surface, context) => {
  const keys = new Set<string>();
  const visit = (node: UiNode) => { keys.add(node.key); node.children?.forEach(visit); };
  visit(surface.frame.root);
  for (const binding of surface.bindings) {
    if (!keys.has(binding.key)) context.addIssue({ code: "custom", message: `Missing bound element: ${binding.key}` });
    const contract = CONTROLLER_INPUTS[surface.controller]!;
    const input = Object.hasOwn(contract, binding.input) ? contract[binding.input] : undefined;
    const expected = ["loading", "disabled"].includes(binding.property) ? "boolean" : "string";
    if (!input || binding.property !== "value" && input !== expected) context.addIssue({ code: "custom", message: `Incompatible controller input: ${binding.input}` });
  }
  for (const [key, action] of Object.entries(surface.actions)) {
    if (!keys.has(key) || action !== (surface.controller === "weather" ? "locate" : surface.controller === "action-button" ? "activate" : ""))
      context.addIssue({ code: "custom", message: `Incompatible controller action: ${key}` });
  }
});
export type AuthoredSurface = z.infer<typeof authoredSurfaceSchema>;

/** Resolve a snapshot from a controller's primitive projection. Unknown inputs
 * fail visibly; source is retained so a missing reference can be repaired. */
export function bindAuthoredSurface(surface: AuthoredSurface, inputs: Readonly<Record<string, string | boolean>>, revision = 0): UiFrame {
  const copy = structuredClone(surface.frame);
  const nodes = new Map<string, UiNode>();
  const visit = (node: UiNode) => { nodes.set(node.key, node); node.children?.forEach(visit); };
  visit(copy.root);
  for (const binding of surface.bindings) {
    const value = inputs[binding.input];
    if (value === undefined) throw new Error(`Controller input unavailable: ${binding.input}`);
    if (typeof value !== "string" && typeof value !== "boolean") throw new Error(`Incompatible input: ${binding.input}`);
    const boolean = ["disabled", "loading"].includes(binding.property);
    if (boolean ? typeof value !== "boolean" : binding.property !== "value" && typeof value !== "string") throw new Error(`Incompatible input: ${binding.input}`);
    Object.assign(nodes.get(binding.key)!, { [binding.property]: value });
  }
  return validateFrame({ ...copy, revision });
}

const text = (key: string, value: string): UiNode => ({ type: "text", key, text: value, ...(key === "error" ? { tone: "danger" as const } : {}) });
/** These are the real built-in sources, also exposed as forkable widget assets.
 * The same controller can render any compatible authored hierarchy. */
export const BUILTIN_AUTHORED_SURFACES: Readonly<Record<"clock" | "weather" | "action-button" | "ai-chat", AuthoredSurface>> = {
  "ai-chat": authoredSurfaceSchema.parse({ controller: "ai-chat", frame: { revision: 0, root: { type: "column", key: "root", children: [text("intro", "Ask a question, explore your assets, or describe a web widget to draft. Enable the tools you want Station to use.")] } } }),
  clock: authoredSurfaceSchema.parse({ controller: "clock", frame: { revision: 0, root: { type: "column", key: "root", children: [text("date", "Tuesday, October 20"), { type: "metric", key: "time", label: "Local time", text: "10:24" }, text("zone", "Local time zone"), text("error", "")] } }, bindings: ["date", "time", "zone", "error"].map(key => ({ key, property: "text", input: key })) }),
  weather: authoredSurfaceSchema.parse({ controller: "weather", frame: { revision: 0, root: { type: "column", key: "root", children: [{ type: "metric", key: "temperature", label: "Your local forecast", text: "—" }, text("condition", "See the next six hours where you are."), { type: "button", key: "locate", text: "Use my location", label: "Use my location" }, text("hours", ""), text("error", "")] } }, bindings: ["temperature", "condition", "hours", "error"].map(key => ({ key, property: "text", input: key })).concat([{ key: "locate", property: "loading", input: "loading" }]), actions: { locate: "locate" } }),
  "action-button": authoredSurfaceSchema.parse({ controller: "action-button", frame: { revision: 0, root: { type: "column", key: "root", children: [{ type: "button", key: "activate", text: "Add a widget", label: "Add a widget" }, text("error", ""), text("result", "")] } }, bindings: [{ key: "activate", property: "text", input: "label" }, { key: "activate", property: "label", input: "name" }, { key: "activate", property: "loading", input: "busy" }, { key: "error", property: "text", input: "error" }, { key: "result", property: "text", input: "result" }], actions: { activate: "activate" } }),
};
