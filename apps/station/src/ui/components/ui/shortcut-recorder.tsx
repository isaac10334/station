import { useEffect, useState } from "react";
import { Kbd, usePlatform, formatShortcut } from "./kbd";
import { Button } from "./button";
import { normalizeShortcut, resolvedShortcut, shortcutFromEvent } from "../../../core/shortcuts";

/** Adapted from Stealth UI shortcut-recorder (https://stealth.pm/r/shortcut-recorder.json).
 * Station owns keycaps and canonical combos; the caller owns persistence and
 * conflict resolution. Recording never invokes the recorded action. */
export function ShortcutRecorder({ label, value, onChange, taken = [], disabled = false }: {
  label: string; value: string | null; onChange: (value: string | null) => void;
  taken?: readonly { keys: string; label: string }[]; disabled?: boolean;
}) {
  const platform = usePlatform();
  const [recording, setRecording] = useState(false), [held, setHeld] = useState<string | null>(null), [message, setMessage] = useState("");
  useEffect(() => {
    if (!recording || disabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) { setRecording(false); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || e.isComposing || e.getModifierState("AltGraph")) return;
      if (e.key === "Escape") { setRecording(false); setMessage("Recording cancelled"); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        onChange(null); setRecording(false); setMessage("Shortcut cleared"); return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        setHeld([e.ctrlKey && (platform === "mac" ? "ctrl" : "mod"), e.metaKey && (platform === "mac" ? "mod" : "meta"), e.altKey && "alt", e.shiftKey && "shift"].filter(Boolean).join("+"));
        return;
      }
      const keys = shortcutFromEvent(e, platform);
      if (!keys) return;
      setHeld(keys);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !/^F\d+$/.test(e.key)) { setMessage("Include a modifier such as Ctrl, Alt or Shift"); return; }
      const conflict = taken.find(item => resolvedShortcut(item.keys, platform) === resolvedShortcut(keys, platform));
      if (conflict) { setMessage(`Already assigned to ${conflict.label}. Choose another combination.`); return; }
      const reserved = ["alt+f4", "meta+l", "mod+w", "mod+t", "mod+n", "mod+q", "mod+tab"];
      if (reserved.some(item => resolvedShortcut(item, platform) === resolvedShortcut(keys, platform))) { setMessage("This shortcut is reserved by the system or browser"); return; }
      onChange(normalizeShortcut(keys)); setRecording(false); setMessage("Shortcut saved");
    };
    const blur = () => setRecording(false);
    window.addEventListener("keydown", down, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("blur", blur); };
  }, [recording, disabled, platform, taken, onChange]);
  return <div className="min-w-0 space-y-1" data-shortcut-recorder>
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={disabled} aria-pressed={recording}
        aria-label={recording ? `Recording ${label}` : `Record ${label} shortcut`}
        onBlur={() => setRecording(false)} onClick={() => { setRecording(!recording); setHeld(null); setMessage("Escape cancels. Backspace clears. Tab leaves recording."); }}>
        {recording ? held ? <Kbd keys={held} /> : "Press keys…" : value ? <Kbd keys={value} /> : "Record shortcut"}
      </Button>
      {!!value && <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Clear ${label} shortcut`} onClick={() => { setRecording(false); onChange(null); setMessage("Shortcut cleared"); }}>Clear</Button>}
    </div>
    <p role="status" className="text-xs text-fg-3">{message || (value ? formatShortcut(value, platform) : "Unassigned")}</p>
  </div>;
}
