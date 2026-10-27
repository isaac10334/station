import { z } from "zod";
import { accountEvent, accountOperations, type AccountMethod, type AccountSnapshot } from "../contracts/account";

type AccountState = { enabled: boolean; loading: boolean; account: AccountSnapshot | null; error: string | null; notice: string | null; connected: boolean };
let state: AccountState = { enabled: false, loading: true, account: null, error: null, notice: null, connected: false };
const listeners = new Set<() => void>();
const publish = (patch: Partial<AccountState>) => { state = { ...state, ...patch }; for (const l of listeners) l(); };
let events: EventSource | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let started = false;
let refreshing = false;
let generation = 0;
const rendererId = crypto.randomUUID();
const clientType = () => document.querySelector('meta[name="station-native-root"]') || typeof (window as Window & { __electrobunWebviewId?: number }).__electrobunWebviewId === "number" ? "desktop" as const : "web" as const;
async function request(path: string, body?: unknown) {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(value.error?.message ?? value.error ?? value.message ?? "Account request failed"); Object.assign(error, { status: response.status }); throw error; }
  return value;
}
export async function accountCommand<M extends AccountMethod>(method: M, params: z.input<(typeof accountOperations)[M]["input"]>): Promise<z.output<(typeof accountOperations)[M]["output"]>> {
  const result = await request("/api/account/command", { method, params: accountOperations[method].input.parse(params) });
  return accountOperations[method].output.parse(result) as z.output<(typeof accountOperations)[M]["output"]>;
}
function stopConnection() { generation++; events?.close(); events = undefined; clearInterval(heartbeat); heartbeat = undefined; publish({ connected: false }); }
function machine() {
  const key = "station.machine.v1";
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key) ?? "null"); } catch {}
  if (!saved || !z.uuid().safeParse(saved.machineId).success || typeof saved.name !== "string") {
    saved = { machineId: crypto.randomUUID(), name: "This browser" }; localStorage.setItem(key, JSON.stringify(saved));
  }
  return saved as { machineId: string; name: string };
}
async function beat() { try { await accountCommand("account.heartbeat", { ...machine(), rendererId, clientType: clientType() }); } catch (error) { publish({ error: message(error) }); } }
const message = (error: unknown) => error instanceof Error ? error.message : "Account service unavailable";
export async function refreshAccount() {
  if (refreshing) return;
  refreshing = true;
  const expected = generation;
  try {
    // Anonymous bootstrap is a normal state, not a failed protected request.
    const session = await request("/api/auth/get-session");
    if (expected !== generation) return;
    if (!session?.user) { stopConnection(); publish({ account: null, loading: false, error: null }); return; }
    const account = await accountCommand("account.inspect", {});
    if (expected !== generation) return;
    publish({ account, loading: false, error: null });
    if (!events) {
      events = new EventSource("/api/account/events");
      events.onopen = () => publish({ connected: true, error: null });
      events.onerror = () => publish({ connected: false });
      events.onmessage = (event) => {
        let value: unknown;
        try { value = JSON.parse(event.data); } catch { return; }
        const result = accountEvent.safeParse(value);
        if (!result.success) return;
        if (result.data.type === "revoked") { stopConnection(); publish({ account: null, notice: "This session was signed out remotely." }); }
        else if (result.data.type === "ping") publish({ notice: `Ping from ${result.data.from}` });
        else void refreshAccount();
      };
      void beat(); heartbeat = setInterval(() => void beat(), 15_000);
    }
  } catch (error) {
    if ((error as any).status === 401) { stopConnection(); publish({ account: null, loading: false, error: null }); }
    else publish({ loading: false, error: message(error) });
  } finally { refreshing = false; }
}
export async function startAccountClient() {
  if (started) return; started = true;
  try { const config = await request("/api/account/config"); publish({ enabled: config.enabled === true }); if (config.enabled) await refreshAccount(); }
  catch { /* Desktop/offline installations have no account backend. */ }
  finally { publish({ loading: false }); }
  window.addEventListener("pagehide", stopConnection);
  window.addEventListener("pageshow", () => { if (state.enabled) void refreshAccount(); });
}
export function subscribeAccount(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function getAccountState() { return state; }
export const accountClient = {
  async signIn(email: string, password: string) { await request("/api/auth/sign-in/email", { email, password }); publish({ notice: null }); await refreshAccount(); },
  async signUp(name: string, email: string, password: string) { await request("/api/auth/sign-up/email", { name, email, password }); publish({ notice: null }); await refreshAccount(); },
  async signOut() { await request("/api/auth/sign-out", {}); stopConnection(); publish({ account: null, notice: null }); },
  async rename(name: string) { const next = { ...machine(), name }; await accountCommand("account.heartbeat", { ...next, rendererId, clientType: clientType() }); localStorage.setItem("station.machine.v1", JSON.stringify(next)); await refreshAccount(); },
  dismissNotice() { publish({ notice: null }); },
};
