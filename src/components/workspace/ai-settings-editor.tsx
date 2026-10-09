import { useId, useState } from "react";
import { Button } from "../ui/button";
import { EnvEditor } from "../ui/env-editor";
import type { AISettingsStore } from "../../ai-settings";

export function AISettingsEditor({ settings }: { settings: AISettingsStore }) {
  const id = useId();
  const initial = settings.get();
  const [rows, setRows] = useState([{ key: "AI_GATEWAY_API_KEY", value: initial.apiKey, secret: true }, { key: "AI_GATEWAY_MODEL", value: initial.model }]);
  const [remember, setRemember] = useState(initial.rememberKey);
  const [status, setStatus] = useState("");
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    try { settings.save({ apiKey: rows[0].value, model: rows[1].value, rememberKey: remember }); setStatus("AI settings saved."); }
    catch { setStatus("Could not save. Check the model ID and browser storage."); }
  }}>
    <EnvEditor value={rows} onChange={setRows} />
    <label htmlFor={id} className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Remember key on this device</label>
    <p className="text-xs leading-relaxed text-muted-foreground">Your key is sent directly to Vercel AI Gateway. By default it stays in memory. Remembering saves it in plaintext browser storage, readable by scripts running in Station.</p>
    <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm">Save AI settings</Button><Button type="button" size="sm" variant="ghost" onClick={() => {
      try { settings.save({ ...settings.get(), apiKey: "", rememberKey: false }); setRows(rows.map(row => row.secret ? { ...row, value: "" } : row)); setRemember(false); setStatus("Key forgotten."); }
      catch { setStatus("Could not clear browser storage."); }
    }}>Forget key</Button></div>
    <p role="status" className="text-xs text-muted-foreground">{status}</p>
  </form>;
}
