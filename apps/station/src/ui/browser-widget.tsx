import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  RotateCw,
  Square,
} from "lucide-react";
import {
  browserContexts,
  type BrowserAvailability,
  type BrowserConfiguration,
  type BrowserContexts,
  type BrowserOperation,
  type BrowserSession,
} from "@station/capabilities";
import type { Workspace } from "../core/workspace-state";
import {
  browserConfiguration,
  browserUrl,
  defaultBrowserConfiguration,
} from "../core/browser-policy";
import type { WorkspaceCapabilityRuntime } from "../contracts/widget-runtime";
import type { GrantedWidgetScope } from "../contracts/widget-runtime";
import { Button } from "./components/ui/button";
import { IconAction } from "./components/ui/icon-action";
import { Input } from "./components/ui/input";
import { observeBrowserPresentation } from "./browser-presentation";

/** One movable browser-page widget. The parent Layout supplies the tab rail.
 * Built-in browser controller. Configuration follows the dock instance; service
 * ownership follows the desk/instance scope. No native tag is reparented on move.
 * Starting grants one browsing acquisition; stopping/unmounting revokes it.
 */
export function BrowserWidget({
  workspace,
  instanceId,
  runtime,
  onConfigure,
}: {
  workspace: Workspace;
  instanceId: string;
  runtime: WorkspaceCapabilityRuntime;
  onConfigure(config: BrowserConfiguration): void;
}) {
  const panel = workspace.dock.panels[instanceId];
  const config =
    panel?.kind === "widget"
      ? (panel.browser ?? defaultBrowserConfiguration())
      : defaultBrowserConfiguration();
  const [availability, setAvailability] = useState<BrowserAvailability | null>(
    null,
  );
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState(
    config.tabs.find((t) => t.id === config.activeTab)!.url,
  );
  const owner = useRef<GrantedWidgetScope | null>(null);
  const api = useRef<BrowserContexts | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const active = session?.tabs.find((t) => t.id === session.activeTab);
  const activeId = session?.activeTab ?? config.activeTab;
  useEffect(() => {
    mounted.current = true;
    const scope = runtime.openScope(workspace.id, "Browser availability");
    void scope
      .acquire(browserContexts)
      .then((handle) => handle.value.availability())
      .then((value) => {
        if (mounted.current) setAvailability(value);
      })
      .catch((reason) => {
        if (mounted.current) setError(String(reason));
      })
      .finally(() => void scope.revoke());
    return () => {
      mounted.current = false;
      void scope.revoke();
      void owner.current?.revoke();
      owner.current = null;
      api.current = null;
    };
  }, [workspace.id, workspace.activeDeskId, instanceId, runtime]);
  useEffect(() => {
    setAddress(
      active?.url || config.tabs.find((t) => t.id === activeId)?.url || "",
    );
  }, [activeId, active?.url]);
  useEffect(() => {
    if (active?.addressFocus) {
      addressInput.current?.focus();
      addressInput.current?.select();
    }
  }, [active?.id, active?.addressFocus]);
  const accept = (next: BrowserSession) => {
    if (mounted.current) setSession(next);
  };
  const perform = async (operation: BrowserOperation) => {
    if (!session || !api.current) return;
    try {
      accept(await api.current.perform(session.id, operation));
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  useEffect(() => {
    if (!session || !viewport.current || !api.current) return;
    const current = api.current,
      id = session.id;
    let disposed = false,
      sending = false;
    let pending: Parameters<BrowserContexts["perform"]>[1] | undefined;
    const send = async () => {
      if (sending || disposed) return;
      sending = true;
      try {
        while (pending && !disposed) {
          const operation = pending;
          pending = undefined;
          await current.perform(id, operation);
        }
      } catch (reason) {
        if (!disposed) setError(String(reason));
      } finally {
        sending = false;
      }
    };
    const stop = observeBrowserPresentation(viewport.current, (frame) => {
      pending = { type: "present", frame };
      void send();
    });
    const timer = setInterval(() => {
      void current
        .perform(id, { type: "snapshot" })
        .then((next) => {
          if (!disposed) accept(next);
        })
        .catch((reason) => {
          if (!disposed) setError(String(reason));
        });
    }, 1000);
    return () => {
      disposed = true;
      stop();
      clearInterval(timer);
    };
  }, [session?.id]);
  const save = (next: BrowserConfiguration) => {
    const validated = browserConfiguration(next);
    onConfigure(validated);
    return validated;
  };
  const stop = () => {
    const previous = owner.current;
    owner.current = null;
    api.current = null;
    setSession(null);
    setBusy(false);
    void previous?.revoke();
  };
  const start = async () => {
    if (busy || !availability?.available) return;
    setBusy(true);
    setError("");
    const scope = runtime.openWidgetScope(workspace.id, instanceId, [
      browserContexts.id,
    ]);
    owner.current = scope;
    try {
      const value = await scope.acquire(browserContexts);
      const next = await value.open(browserConfiguration(config));
      if (!mounted.current || owner.current !== scope || scope.signal.aborted) {
        await scope.revoke();
        return;
      }
      api.current = value;
      accept(next);
    } catch (reason) {
      await scope.revoke();
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const navigate = async () => {
    try {
      const url = browserUrl(
        address.trim().includes(":")
          ? address.trim()
          : `https://${address.trim()}`,
      );
      save({
        ...config,
        tabs: config.tabs.map((t) => (t.id === activeId ? { ...t, url } : t)),
      });
      setError("");
      if (session) await perform({ type: "navigate", tab: activeId, url });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Web browser"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "l"
        ) {
          event.preventDefault();
          addressInput.current?.focus();
          addressInput.current?.select();
        }
      }}
    >
      <form
        className="flex shrink-0 items-center gap-1 border-y border-line p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate();
        }}
      >
        <IconAction
          label="Back"
          disabled={!active?.back}
          onClick={() => void perform({ type: "back", tab: activeId })}
        >
          <ArrowLeft size={16} />
        </IconAction>
        <IconAction
          label="Forward"
          disabled={!active?.forward}
          onClick={() => void perform({ type: "forward", tab: activeId })}
        >
          <ArrowRight size={16} />
        </IconAction>
        <IconAction
          label={active?.loading ? "Stop loading" : "Reload"}
          disabled={!session}
          onClick={() =>
            void perform({
              type: active?.loading ? "stop" : "reload",
              tab: activeId,
            })
          }
        >
          {active?.loading ? <Square size={16} /> : <RotateCw size={16} />}
        </IconAction>
        <Input
          ref={addressInput}
          className="min-w-0 flex-1"
          aria-label="Browser address"
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setAddress(
                active?.url ||
                  config.tabs.find((t) => t.id === activeId)?.url ||
                  "",
              );
              event.currentTarget.blur();
            }
          }}
        />
        <Button type="submit" variant="ghost" size="sm">
          Go
        </Button>
      </form>
      <div
        ref={viewport}
        className="relative flex min-h-0 flex-1 overflow-auto p-4"
      >
        <div className="m-auto flex w-full min-w-0 max-w-sm shrink-0 flex-col items-center gap-2 text-center text-sm text-fg-3">
          <Globe size={24} />
          {!session && (
            <>
              <p>
                {availability?.reason ||
                  (availability
                    ? "Open websites in private desktop browser tabs."
                    : "Checking browser availability…")}
              </p>
              <p>
                Tab addresses are saved without query strings or fragments.
                Browser data and grants are session-only.
              </p>
            </>
          )}
          {session && (
            <p>
              Browser temporarily hidden beneath shell overlays or outside its
              visible slot.
            </p>
          )}
        </div>
      </div>
      {(error || active?.error) && (
        <p role="alert" className="shrink-0 px-3 py-2 text-sm text-danger">
          {error || active?.error}
        </p>
      )}
      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-1 text-xs text-fg-3">
        <span role="status">
          {active?.loading
            ? "Loading…"
            : session
              ? "Browser session active"
              : "Browser session stopped"}
        </span>
        {session ? (
          <Button variant="ghost" size="sm" onClick={stop}>
            Revoke session
          </Button>
        ) : (
          <Button size="sm" disabled={!availability?.available || busy} onClick={() => void start()}>
            {busy ? "Opening…" : "Allow browser session"}
          </Button>
        )}
      </div>
    </section>
  );
}
