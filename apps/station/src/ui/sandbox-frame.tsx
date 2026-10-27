import { getIcons, subscribeIcons } from "@station/ui/theme-icons";
import { useEffect, useRef, useState } from "react";
import { webContentDocument } from "../core/sandbox-document";
import { serveGuest, type GuestBindings } from "../services/guest-bridge";
function themeSnapshot() {
  const style = getComputedStyle(document.documentElement);
  const variables = Object.fromEntries(
    [
      "frame",
      "raised",
      "fg",
      "fg-3",
      "line-2",
      "selected",
      "focus-ring",
      "station-spacing",
      "station-radius",
    ].map((token) => [
      `--station-${token.replace(/^station-/, "")}`,
      style.getPropertyValue(`--${token}`).trim(),
    ]),
  );
  variables["--station-font"] =
    style.getPropertyValue("--font-sans").trim() || "system-ui";
  return {
    mode: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    variables,
    icons: { ...getIcons() },
  };
}
/** One opaque frame and private port per execution. A second load revokes authority. */
export function SandboxFrame({
  html,
  title,
  bindings,
}: {
  html: string;
  title: string;
  bindings?: GuestBindings;
}) {
  const [execution] = useState(() => crypto.randomUUID());
  const frame = useRef<HTMLIFrameElement>(null),
    session = useRef<ReturnType<typeof serveGuest> | null>(null),
    loads = useRef(0);
  useEffect(() => {
    let issued = false;
    const ready = (event: MessageEvent) => {
      if (
        issued ||
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "station:ready" ||
        event.data.execution !== execution
      )
        return;
      issued = true;
      const channel = new MessageChannel();
      session.current = serveGuest(channel.port1, bindings);
      frame.current.contentWindow!.postMessage(
        { type: "station:connect", theme: themeSnapshot() },
        "*",
        [channel.port2],
      );
    };
    const observer = new MutationObserver(() =>
      session.current?.theme(themeSnapshot()),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-theme"],
    });
    const unsubscribeIcons = subscribeIcons(() =>
      session.current?.theme(themeSnapshot()),
    );
    window.addEventListener("message", ready);
    return () => {
      observer.disconnect();
      unsubscribeIcons();
      window.removeEventListener("message", ready);
      session.current?.close();
      session.current = null;
    };
  }, [bindings]);
  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={webContentDocument(
        `<script>window.__stationExecution=${JSON.stringify(execution)};</script>${html}`,
      )}
      onLoad={() => {
        if (++loads.current > 1) session.current?.close();
      }}
    />
  );
}
