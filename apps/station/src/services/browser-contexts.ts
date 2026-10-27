import type {
  BrowserAvailability,
  BrowserConfiguration,
  BrowserContexts,
  BrowserOperation,
  BrowserSession,
} from "@station/capabilities";

const webUnavailable: BrowserAvailability = {
  available: false,
  reason:
    "Native browser tabs require Station desktop. This web app does not embed external websites.",
};
function secret() {
  return window.top === window
    ? document.querySelector<HTMLMetaElement>('meta[name="station-desktop"]')
        ?.content
    : undefined;
}
async function request(value?: unknown, signal?: AbortSignal) {
  const token = secret();
  if (!token) throw new Error(webUnavailable.reason);
  const response = await fetch("/api/desktop/browser", {
    method: value ? "POST" : "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: {
      "X-Station-Desktop": token,
      ...(value ? { "Content-Type": "application/json" } : {}),
    },
    body: value ? JSON.stringify(value) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? `Browser unavailable (${response.status}).`,
    );
  return result;
}

/** Acquisition-local transport. Authority never reaches storage or SDK guests.
 * Revocation closes its native lease; missed cleanup expires after 15 seconds.
 * Root reload cannot recover the old secret/lease as a saved browser grant.
 */
export function desktopBrowserContexts(
  signal: AbortSignal,
): BrowserContexts & { dispose(): Promise<void> } {
  let lease: string | undefined;
  let pending: Promise<string> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let cleanup: Promise<void> | undefined;
  const check = () => {
    if (closed || signal.aborted)
      throw new Error("Browser capability revoked.");
  };
  const revoke = () => {
    if (closed) return cleanup;
    closed = true;
    clearInterval(timer);
    if (lease) cleanup = request({ action: "revoke", lease }).then(() => {});
    // Abort listeners cannot await. Provider.dispose below awaits this same work.
    void cleanup?.catch(() => {});
    return cleanup;
  };
  signal.addEventListener("abort", revoke, { once: true });
  const ensure = async () => {
    check();
    if (!pending)
      pending = request({ action: "grant" }, signal).then(async (result) => {
        lease = result.lease;
        if (signal.aborted || closed) {
          cleanup = request({ action: "revoke", lease }).then(() => {});
          void cleanup.catch(() => {});
          revoke();
          check();
        }
        timer = setInterval(() => {
          void request({ action: "renew", lease }, signal).catch(revoke);
        }, 5000);
        return lease!;
      });
    return pending;
  };
  const run = async (value: Record<string, unknown>) => {
    check();
    const id = await ensure();
    check();
    const result = await request({ ...value, lease: id }, signal);
    check();
    return result;
  };
  return {
    async dispose() {
      revoke();
      await pending?.catch(() => {});
      await cleanup;
      signal.removeEventListener("abort", revoke);
    },
    async availability() {
      check();
      return secret()
        ? await request(undefined, signal)
        : { ...webUnavailable };
    },
    open: (config: BrowserConfiguration): Promise<BrowserSession> =>
      run({ action: "open", config }),
    perform: (
      session: string,
      operation: BrowserOperation,
    ): Promise<BrowserSession> =>
      run({ action: "perform", session, operation }),
    async close(session: string) {
      await run({ action: "close", session });
    },
  };
}
