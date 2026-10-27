import { z } from "zod";
import { isTrustedDesktopRequest } from "./trusted-request";

type Frame = { x: number; y: number; width: number; height: number };
export interface LauncherWindow {
  getFrame(): Frame; setFrame(x: number, y: number, width: number, height: number): unknown;
  isVisible(): boolean; isMinimized(): boolean; isMaximized(): boolean; isFullScreen(): boolean;
  unminimize(): unknown; minimize(): unknown; unmaximize(): unknown; maximize(): unknown;
  setFullScreen(value: boolean): unknown; center(): unknown; show(): unknown; hide(): unknown; activate(): unknown;
}
/** Transient presentation of the existing native root. No second WebView, workspace
 * owner or guest authority is created. Only a native shortcut can arm entry; the
 * authenticated root acknowledges it. Close, navigation and lease expiry restore
 * original bounds/state. Foreign-app focus restoration is not available in this pin. */
export function createLauncher(window: () => LauncherWindow | undefined, now = Date.now, workArea?: () => Frame) {
  type Saved = { frame: Frame; visible: boolean; minimized: boolean; maximized: boolean; fullScreen: boolean };
  let pending: { saved: Saved; deadline: number } | undefined;
  let active: { saved: Saved; sessionId: string; deadline: number } | undefined;
  function restore() {
    pending = undefined;
    const previous = active; active = undefined;
    const win = window(); if (!previous || !win) return false;
    const s = previous.saved;
    win.setFrame(s.frame.x, s.frame.y, s.frame.width, s.frame.height);
    if (s.maximized) win.maximize();
    if (s.fullScreen) win.setFullScreen(true);
    if (s.minimized) win.minimize();
    if (!s.visible) win.hide();
    return true;
  }
  return {
    restore,
    get active() { return !!active; },
    arm() {
      const win = window(); if (!win || active) return;
      pending = { deadline: now() + 5000, saved: { frame: win.getFrame(), visible: win.isVisible(), minimized: win.isMinimized(), maximized: win.isMaximized(), fullScreen: win.isFullScreen() } };
    },
    open(sessionId: string) {
      const win = window(); if (!win) throw new Error("Window unavailable");
      if (active) {
        if (active.sessionId !== sessionId) throw new Error("Launcher session changed");
        active.deadline = now() + 180_000; return;
      }
      if (!pending || now() >= pending.deadline) throw new Error("Native invocation expired");
      const saved = pending.saved; pending = undefined;
      active = { saved, sessionId, deadline: now() + 180_000 };
      try {
        if (saved.fullScreen) win.setFullScreen(false);
        if (saved.maximized) win.unmaximize();
        win.unminimize();
        // Capture the normal frame after leaving maximized/minimized state, so
        // restoring does not replace Windows' normal restore bounds with its
        // maximized desktop rectangle or minimized sentinel position.
        if (saved.maximized || saved.minimized || saved.fullScreen) saved.frame = win.getFrame();
        const area = workArea?.();
        if (area && area.width > 0 && area.height > 0) {
          const width = Math.min(760, Math.max(1, area.width - 24)), height = Math.min(620, Math.max(1, area.height - 24));
          win.setFrame(area.x + (area.width - width) / 2, area.y + (area.height - height) / 2, width, height);
        } else { win.setFrame(saved.frame.x, saved.frame.y, 760, 620); win.center(); }
        win.show(); win.activate();
      } catch (error) { restore(); throw error; }
    },
    close(sessionId: string) {
      if (active && active.sessionId !== sessionId) throw new Error("Launcher session changed");
      return restore();
    },
    expand(sessionId: string) {
      if (active && active.sessionId !== sessionId) throw new Error("Launcher session changed");
      restore();
      const win = window(); if (!win) return;
      win.unminimize(); win.show(); win.activate();
    },
    expire() {
      if (pending && now() >= pending.deadline) pending = undefined;
      if (active && now() >= active.deadline) return restore();
      return false;
    },
  };
}
const requestSchema = z.object({ action: z.enum(["open", "close", "expand"]), sessionId: z.string().uuid() }).strict();
/** Fixed presentation actions, never arbitrary geometry, scripts or OS handles. */
export function createLauncherHttp(token: string, origin: string, launcher: ReturnType<typeof createLauncher>) {
  return async (request: Request) => {
    if (!isTrustedDesktopRequest(request, token, origin)) return new Response("Forbidden", { status: 403 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = await request.text(); if (body.length > 512) return new Response("Request too large", { status: 413 });
    try {
      const p = requestSchema.parse(JSON.parse(body));
      if (p.action === "open") launcher.open(p.sessionId);
      else if (p.action === "expand") launcher.expand(p.sessionId);
      else launcher.close(p.sessionId);
      return Response.json({ active: launcher.active });
    } catch { return new Response("Launcher unavailable", { status: 409 }); }
  };
}
