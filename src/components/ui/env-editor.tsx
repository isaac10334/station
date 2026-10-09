import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

export type EnvVar = { key: string; value: string; secret?: boolean };
/** Controlled credential rows adapted from Stealth's env-editor. Paste imports only
 * known keys; secrets are masked and never copied or emitted to diagnostics.
 */
export function EnvEditor({ value, onChange }: { value: EnvVar[]; onChange: (rows: EnvVar[]) => void }) {
  const uid = useId();
  const [revealed, setRevealed] = useState(false);
  return <div className="min-w-0 rounded-lg border border-border bg-background p-3" aria-label="AI environment variables">
    {value.map((row, index) => <div key={row.key} className="mb-3 last:mb-0">
      <label htmlFor={`${uid}-${index}`} className="mb-1 block break-all font-mono text-xs text-muted-foreground">{row.key}</label>
      <div className="flex min-w-0 items-center gap-1">
        <Input id={`${uid}-${index}`} value={row.value} type={row.secret && !revealed ? "password" : "text"} autoComplete="off" spellCheck={false}
          onChange={event => onChange(value.map(item => item.key === row.key ? { ...item, value: event.target.value } : item))}
          onPaste={event => {
            const text = event.clipboardData.getData("text");
            if (!text.includes("=")) return;
            const parsed = new Map<string, string>();
            for (const line of text.split(/\r?\n/)) {
              const match = line.trim().match(/^(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*)$/);
              if (match) parsed.set(match[1], match[2].replace(/^(["'])(.*)\1$/, "$2"));
            }
            if (!value.some(item => parsed.has(item.key))) return;
            event.preventDefault();
            onChange(value.map(item => ({ ...item, value: parsed.get(item.key) ?? item.value })));
          }} />
        {row.secret && <Button type="button" variant="ghost" size="icon" aria-label={revealed ? "Hide API key" : "Reveal API key"} aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff /> : <Eye />}</Button>}
      </div>
    </div>)}
    <p className="mt-2 text-xs text-muted-foreground">Paste a key or a .env containing these variables.</p>
  </div>;
}
