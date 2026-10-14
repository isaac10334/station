import type { Station, Json, Theme, EditorSession, CapabilityHandle } from "@station/capabilities/guest";
export type { Station, Json, Theme, EditorSession, CapabilityHandle } from "@station/capabilities/guest";

/** Connect only to the bootstrap port supplied to this exact guest execution. */
export function connect(): Promise<Station> {
  return new Promise((resolve, reject) => {
    const announce = () =>
      parent.postMessage(
        {
          type: "station:ready",
          execution: (window as unknown as { __stationExecution?: string })
            .__stationExecution,
        },
        "*",
      );
    const retry = setInterval(announce, 100);
    const timeout = setTimeout(() => {
      clearInterval(retry);
      window.removeEventListener("message", bootstrap);
      reject(new Error("Station connection unavailable"));
    }, 5000);
    const bootstrap = (event: MessageEvent) => {
      if (
        event.source !== parent ||
        event.data?.type !== "station:connect" ||
        !event.ports[0]
      )
        return;
      clearTimeout(timeout);
      clearInterval(retry);
      window.removeEventListener("message", bootstrap);
      const port = event.ports[0];
      let sequence = 0,
        closed = false;
      let theme: Theme = event.data.theme;
      const applyTheme = (value: Theme) => {
        for (const [key, token] of Object.entries(value.variables))
          document.documentElement.style.setProperty(key, token);
        document.documentElement.style.colorScheme = value.mode;
      };
      applyTheme(theme);
      const pending = new Map<
        number,
        { resolve: (value: any) => void; reject: (error: Error) => void }
      >();
      const subscriptions = new Map<string, (value: Json) => void>();
      const themes = new Set<(theme: Theme) => void>(),
        channels = new Map<string, Set<(value: Json) => void>>();
      const request = (op: string, args: unknown): Promise<any> => {
        if (closed) return Promise.reject(new Error("Station session closed"));
        if (pending.size >= 32)
          return Promise.reject(new Error("Too many pending requests"));
        const id = ++sequence;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          port.postMessage({ id, op, args });
        });
      };
      const disconnect = () => {
        if (closed) return;
        closed = true;
        port.postMessage({ id: ++sequence, op: "disconnect", args: {} });
        port.close();
        for (const call of pending.values())
          call.reject(new Error("Station session closed"));
        pending.clear();
        subscriptions.clear();
        themes.clear();
        channels.clear();
      };
      port.onmessage = (event) => {
        const message = event.data;
        if (message.type === "closed") {
          disconnect();
          return;
        }
        if (message.type === "theme") {
          theme = message.value;
          applyTheme(theme);
          themes.forEach((listener) => listener(theme));
          return;
        }
        if (message.type === "capability") {
          subscriptions.get(message.handle)?.(message.value);
          return;
        }
        if (message.type === "state") {
          channels
            .get(message.key)
            ?.forEach((listener) => listener(message.value));
          return;
        }
        const call = pending.get(message.id);
        if (!call) return;
        pending.delete(message.id);
        message.error
          ? call.reject(new Error(message.error))
          : call.resolve(message.value);
      };
      port.start();
      resolve({
        async acquire<T extends object>(capability: {
          id: string;
          version: string;
        }) {
          const handle = await request("acquire", capability);
          let released = false;
          return {
            value: new Proxy({} as T, {
              get: (_, method) =>
                method === "then"
                  ? undefined
                  : (...args: unknown[]) =>
                      released
                        ? Promise.reject(new Error("Capability released"))
                        : request("call", {
                            handle,
                            method: String(method),
                            args,
                          }),
            }),
            subscribe: async (listener) => {
              subscriptions.set(handle, listener);
              try {
                await request("subscribe", { handle });
              } catch (error) {
                subscriptions.delete(handle);
                throw error;
              }
              return () => {
                subscriptions.delete(handle);
                void request("unsubscribe", { handle }).catch(() => {});
              };
            },
            release: async () => {
              released = true;
              subscriptions.delete(handle);
              await request("release", { handle });
            },
          };
        },
        theme: {
          subscribe(listener) {
            themes.add(listener);
            listener(theme);
            return () => {
              themes.delete(listener);
            };
          },
        },
        state(key) {
          return {
            get: () => request("state.get", { key }),
            set: (value) => request("state.set", { key, value }),
            subscribe(listener) {
              const listeners = channels.get(key) ?? new Set();
              listeners.add(listener);
              channels.set(key, listeners);
              void request("state.get", { key }).then((value) =>
                listener(value),
              );
              return () => {
                listeners.delete(listener);
              };
            },
          };
        },
        slots: {
          open: (slot, definition) =>
            request("slot.open", { slot, definition }),
          close: (instance) => request("slot.close", { instance }),
        },
        disconnect,
      });
    };
    window.addEventListener("message", bootstrap);
    announce();
  });
}
