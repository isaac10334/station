import { z } from "zod";
import type { DataDocument } from "./data-sources";

const modifiers = ["mod", "ctrl", "alt", "shift", "meta"] as const;
/** Canonical portable combo; `mod` follows the platform. Sequences and arbitrary
 * expressions are intentionally outside this first shortcut contract. */
export function normalizeShortcut(value: string): string {
  const parts = value.toLowerCase().trim().split("+").filter(Boolean);
  return [...modifiers.filter(m => parts.includes(m)), ...parts.filter(p => !modifiers.includes(p as typeof modifiers[number]))].join("+");
}
const key = /^(?:[a-z0-9]|f(?:[1-9]|1\d|2[0-4])|space|enter|tab|backspace|delete|escape|up|down|left|right|home|end|pageup|pagedown|\/|\[|\]|,|\.|;|'|=|-|`|\\)$/;
export const shortcutKeysSchema = z.string().max(80).transform(normalizeShortcut).refine(value => {
  const parts = value.split("+"), last = parts.pop()!;
  return key.test(last) && parts.every(p => modifiers.includes(p as typeof modifiers[number])) && new Set(parts).size === parts.length;
}, "Record a single key combination");
export const shortcutEntrySchema = z.object({
  id: z.string().regex(/^[\w-]{1,80}$/), label: z.string().trim().min(1).max(120),
  keys: shortcutKeysSchema.nullable(), enabled: z.boolean().default(true),
  scope: z.enum(["workspace", "desk", "global"]).default("workspace"),
  deskId: z.string().min(1).max(200).optional(),
  presentation: z.enum(["focus", "quick-access"]).optional(),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("widget"), assetId: z.string().min(1).max(200) }).strict(),
    z.object({ kind: z.literal("shell"), actionId: z.string().min(1).max(200) }).strict(),
  ]),
}).strict().refine(entry => entry.scope !== "desk" || !!entry.deskId, "Choose a desk for this shortcut");
export const shortcutSettingsSchema = z.object({
  entries: z.array(shortcutEntrySchema).max(100), inboxSourceId: z.string().min(1).max(200).optional(),
}).strict().refine(settings => new Set(settings.entries.map(e => e.id)).size === settings.entries.length, "Shortcut IDs must be unique").superRefine((settings, context) => {
  for (let i = 0; i < settings.entries.length; i++) {
    const a = settings.entries[i]!; if (!a.enabled || !a.keys) continue;
    for (const b of settings.entries.slice(i + 1)) {
      if (!b.enabled || !b.keys || a.scope === "desk" && b.scope === "desk" && a.deskId !== b.deskId) continue;
      if ((["mac", "other"] as const).some(platform => resolvedShortcut(a.keys!, platform) === resolvedShortcut(b.keys!, platform))) context.addIssue({ code: "custom", message: `Shortcut conflict: ${a.label} and ${b.label}` });
    }
  }
});
export type ShortcutEntry = z.infer<typeof shortcutEntrySchema>;
export type ShortcutSettings = z.infer<typeof shortcutSettingsSchema>;
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  inboxSourceId: "inbox",
  entries: [{ id: "quick-capture", label: "Quick capture", keys: "ctrl+alt+space", enabled: true, scope: "global", action: { kind: "widget", assetId: "builtin:quick-capture" } }, { id: "widget-inspector", label: "Widget inspector", keys: "mod+alt+i", enabled: true, scope: "workspace", presentation: "quick-access", action: { kind: "widget", assetId: "builtin:docking-inspector" } }],
};
export const INBOX_DOCUMENT: DataDocument = { version: 1, provider: "local.table", columns: [
  { id: "text", label: "Capture", type: "text" }, { id: "created", label: "Created", type: "text" },
  { id: "status", label: "Status", type: "select", options: ["Inbox", "Done"] },
], records: [] };
export function activeShortcutEntries(settings: ShortcutSettings, deskId: string) {
  return settings.entries.filter(e => e.enabled && e.keys && (e.scope !== "desk" || e.deskId === deskId));
}
/** Resolve physical key codes before layout-dependent characters (Alt/Shift).
 * IME, AltGraph, repeat and previously handled events never execute actions. */
export function shortcutFromEvent(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, platform: "mac" | "other"): string | null {
  const named: Record<string, string> = { Space: "space", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Comma: ",", Period: ".", Semicolon: ";", Quote: "'", Minus: "-", Equal: "=", Backquote: "`" };
  const primary = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : /^Digit\d$/.test(e.code) ? e.code.slice(5) : named[e.code] ?? e.key.toLowerCase();
  if (!key.test(primary)) return null;
  return normalizeShortcut([e.ctrlKey && (platform === "mac" ? "ctrl" : "mod"), e.metaKey && (platform === "mac" ? "mod" : "meta"), e.altKey && "alt", e.shiftKey && "shift", primary].filter(Boolean).join("+"));
}
export function resolvedShortcut(value: string, platform: "mac" | "other") {
  return normalizeShortcut(value.replace(/\bmod\b/g, platform === "mac" ? "meta" : "ctrl"));
}
/** Exact native accelerators only. OS registration failure is surfaced; it never
 * falls back to a broader binding or acquires another application's shortcuts. */
export function nativeAccelerator(value: string, platform: "mac" | "other"): string {
  const parsed = shortcutKeysSchema.parse(value);
  const names: Record<string, string> = { mod: platform === "mac" ? "Command" : "Control", ctrl: "Control", meta: platform === "mac" ? "Command" : "Super", alt: "Alt", shift: "Shift", space: "Space", enter: "Return", escape: "Escape", up: "Up", down: "Down", left: "Left", right: "Right" };
  const parts = parsed.split("+");
  if (!parts.some(p => modifiers.includes(p as typeof modifiers[number]))) throw new Error("Global shortcuts require a modifier");
  return parts.map(p => names[p] ?? (p.length === 1 || /^f\d+$/.test(p) ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1))).join("+");
}
