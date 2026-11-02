import { readFile, mkdir, writeFile } from "node:fs/promises";
import { win32, join } from "node:path";

export interface WindowsCliContext {
  platform: string;
  channel: string;
  development: boolean;
  acceptance: boolean;
  executable: string;
  localAppData?: string;
  resources: string;
}

/** Only a running managed install may claim a user CLI. Packaged checkout builds
 * are not installs. Acceptance has a separate command and never claims station.
 * The pinned Windows layout is <identifier>/<channel>/app/bin/bun.exe; legacy
 * physical channel-root names are retained rather than reconstructed.
 */
export function windowsCliPlan(context: WindowsCliContext) {
  if (context.platform !== "win32" || context.development || !["canary", "stable"].includes(context.channel) || !context.localAppData || !win32.isAbsolute(context.localAppData)) return undefined;
  const identifier = context.acceptance ? "com.isaacharvey.station.acceptance" : "com.isaacharvey.station";
  const identityRoot = win32.resolve(context.localAppData, identifier);
  const bin = win32.dirname(context.executable);
  const installRoot = win32.resolve(bin, "../..");
  if (win32.basename(context.executable).toLowerCase() !== "bun.exe" || win32.basename(bin).toLowerCase() !== "bin" || win32.basename(win32.dirname(bin)).toLowerCase() !== "app" || win32.dirname(installRoot).toLowerCase() !== identityRoot.toLowerCase()) return undefined;
  if (win32.resolve(context.resources).toLowerCase() !== win32.join(installRoot, "app/Resources/app/station").toLowerCase()) return undefined;
  return { identifier, installRoot, directory: win32.join(identityRoot, "cli"), command: context.acceptance ? "station-acceptance" : "station" };
}

export interface WindowsCliPorts {
  read(path: string): Promise<string>;
  mkdir(path: string): Promise<unknown>;
  write(path: string, content: string): Promise<unknown>;
  register(script: string): Promise<void>;
}
const systemPorts: WindowsCliPorts = {
  read: path => readFile(path, "utf8"),
  mkdir: path => mkdir(path, { recursive: true }),
  write: (path, content) => writeFile(path, content, "utf8"),
  async register(script) {
    const child = Bun.spawn([join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Register"], { stdout: "ignore", stderr: "inherit", windowsHide: true });
    if (await child.exited !== 0) throw new Error("Station CLI user PATH registration failed");
  },
};

/** Best-effort startup integration: errors are reported by the caller, never
 * fatal to desktop startup. Runs again on each installed launch to repair missing
 * assets/PATH after updates. No new desktop authority or control transport.
 */
export async function registerWindowsCli(context: WindowsCliContext, ports: WindowsCliPorts = systemPorts): Promise<boolean> {
  const plan = windowsCliPlan(context);
  if (!plan) return false;
  const registration = JSON.parse(await ports.read(win32.join(plan.installRoot, ".electrobun-uninstall.json")));
  const version = JSON.parse(await ports.read(win32.join(plan.installRoot, "app/Resources/version.json")));
  if (registration.identifier !== plan.identifier || registration.channel !== context.channel || version.identifier !== plan.identifier || version.channel !== context.channel) return false;
  const source = await ports.read(win32.join(context.resources, "runtime/station-cli.ps1"));
  await ports.mkdir(plan.directory);
  const script = win32.join(plan.directory, "station-cli.ps1");
  await ports.write(script, source);
  await ports.write(win32.join(plan.directory, "install.json"), JSON.stringify({ ...plan, channel: context.channel }, null, 2));
  // No absolute user-controlled paths are embedded in cmd source. %~dp0 handles
  // spaces, Unicode and cmd metacharacters; delayed expansion is explicitly off.
  await ports.write(win32.join(plan.directory, `${plan.command}.cmd`), '@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0station-cli.ps1" %*\r\nexit /b %errorlevel%\r\n');
  await ports.register(script);
  return true;
}
