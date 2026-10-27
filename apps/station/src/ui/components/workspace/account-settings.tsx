import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { accountClient, accountCommand, refreshAccount } from "../../../services/account-client";
import { useAccount } from "../../lib/use-account";

/** Account identity conveys no workspace or native authority. Local workspace
 * content remains shared by users of this browser profile until account storage lands.
 */
export function AccountSettings() {
  const state = useAccount();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [name, setName] = useState("");
  const groups = [...new Set(state.account?.sessions.map(s => s.machineId ?? s.id) ?? [])].map(id => ({ id, sessions: state.account!.sessions.filter(s => (s.machineId ?? s.id) === id) }));
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null); setResult(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return <div className="flex min-w-0 flex-col gap-4 text-sm">
    <p className="text-muted-foreground">Desks and assets stay in this browser. They are shared by local users of this browser profile and are not backed up to your account.</p>
    {state.loading ? <p role="status">Connecting to account services…</p> : !state.enabled ? <p>Accounts are not configured on this installation. You can continue using Station locally.</p> : !state.account ? <form className="flex flex-col gap-3" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      void run(() => creating ? accountClient.signUp(String(data.get("name")), String(data.get("email")), String(data.get("password"))) : accountClient.signIn(String(data.get("email")), String(data.get("password"))));
    }}>
      <h2 className="text-base font-medium">{creating ? "Create your Station account" : "Sign in to Station"}</h2>
      {creating && <label className="flex flex-col gap-1">Name<Input name="name" autoComplete="name" required maxLength={80} /></label>}
      <label className="flex flex-col gap-1">Email<Input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label className="flex flex-col gap-1">Password<Input name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} required minLength={12} maxLength={128} /></label>
      <p className="text-xs text-muted-foreground">Use at least 12 characters. This prototype has no email verification or password recovery yet.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} aria-busy={busy} type="submit">{creating ? "Create account" : "Sign in"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setCreating(!creating); setError(null); }}>{creating ? "Use an existing account" : "Create an account"}</Button></div>
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-base font-medium">{state.account.user.name}</h2><p className="break-all text-muted-foreground">{state.account.user.email}</p></div><Button variant="outline" disabled={busy} onClick={() => void run(() => accountClient.signOut())}>Sign out here</Button></div>
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Connected sessions</h3><span className="text-xs text-muted-foreground" role="status">{state.connected ? "Live" : "Reconnecting…"}</span></div>
      <p className="text-xs text-muted-foreground">Grouped by browser installation, with live tabs/windows underneath. Client labels describe the environment; they do not prove machine identity. Presence expires after 45 seconds.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void run(() => accountClient.rename(name.trim())); }}><label className="flex min-w-0 flex-1 flex-col gap-1">Name this browser<Input value={name} onChange={e => setName(e.target.value)} placeholder={state.account.sessions.find(s => s.current)?.name} maxLength={80} required /></label><Button variant="outline" type="submit" disabled={busy || !name.trim()}>Save name</Button></form>
      <div className="space-y-4">{groups.map(group => <section key={group.id}><h4 className="text-sm font-medium">{group.sessions[0].name} <span className="text-xs font-normal text-fg-3">· {group.sessions[0].browser} on {group.sessions[0].platform} · {group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}</span></h4><ul className="flex flex-col divide-y divide-border">{group.sessions.map(session => <li className="flex flex-col gap-2 py-3" key={session.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><strong className="break-words font-medium">{session.name}{session.current ? " · This session" : ""}</strong><p className="text-xs text-muted-foreground">{session.online ? "Online" : "Offline"} · {session.lastSeen ? `Last seen ${new Date(session.lastSeen).toLocaleString()}` : "No presence yet"}</p></div>
        {!session.current && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || !session.online} onClick={() => void run(async () => { const response = await accountCommand("account.ping", { sessionId: session.id }); setResult(response.delivered ? "Ping delivered to the connected session." : "Session is not connected. Try again when it is online."); })}>Ping</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(session.id)}>Sign out</Button></div>}</div>
        {confirm === session.id && <div className="flex flex-wrap items-center gap-2"><p>Sign out {session.name}?</p><Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(async () => { await accountCommand("account.revoke", { sessionId: session.id }); setConfirm(null); await refreshAccount(); })}>Confirm sign out</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></div>}
        <p className="text-xs text-fg-3">{session.connections.length} live tab/window{session.connections.length === 1 ? "" : "s"}{session.connections.some(c => c.clientType === "desktop") ? " · Native desktop" : " · Web browser"}</p>
      </li>)}</ul></section>)}</div>
    </>}
    {(error || state.error) && <p role="alert" className="text-destructive">{error || state.error}</p>}
    {result && <p role="status">{result}</p>}
  </div>;
}
