import { describe, expect, test } from "bun:test";
import { win32, resolve } from "node:path";
import { registerWindowsCli, windowsCliPlan, type WindowsCliContext, type WindowsCliPorts } from "../desktop/windows-cli";

const local = "C:\\Users\\A & Zoë!\\AppData\\Local";
function context(acceptance = false, channel = "canary"): WindowsCliContext {
  const identifier = acceptance ? "com.isaacharvey.station.acceptance" : "com.isaacharvey.station";
  const root = win32.join(local, identifier, channel);
  return { platform: "win32", channel, acceptance, development: false, localAppData: local, executable: win32.join(root, "app/bin/bun.exe"), resources: win32.join(root, "app/Resources/app/station") };
}
function fixture(ctx = context()) {
  const plan = windowsCliPlan(ctx)!;
  const files = new Map<string, string>([
    [win32.join(plan.installRoot, ".electrobun-uninstall.json"), JSON.stringify({ identifier: plan.identifier, channel: ctx.channel })],
    [win32.join(plan.installRoot, "app/Resources/version.json"), JSON.stringify({ identifier: plan.identifier, channel: ctx.channel })],
    [win32.join(ctx.resources, "runtime/station-cli.ps1"), "# bundled CLI"],
  ]);
  const registered: string[] = [];
  const ports: WindowsCliPorts = {
    async read(path) { if (!files.has(path)) throw new Error("Missing fixture: " + path); return files.get(path)!; },
    async mkdir() {}, async write(path, content) { files.set(path, content); },
    async register(script) { registered.push(script); },
  };
  return { files, registered, ports, plan };
}

describe("installed Windows CLI", () => {
  test("normal and acceptance commands never collide; stable is also installed", () => {
    expect(windowsCliPlan(context())?.command).toBe("station");
    expect(windowsCliPlan(context(true))?.command).toBe("station-acceptance");
    expect(windowsCliPlan(context(false, "stable"))?.command).toBe("station");
    expect(windowsCliPlan(context(true))?.directory).not.toBe(windowsCliPlan(context())?.directory);
  });
  test("rejects dev, checkout packaged output, mismatched resources and non-Windows without effects", async () => {
    const ctx = context();
    for (const changes of [
      { platform: "linux" }, { channel: "dev" }, { development: true }, { localAppData: undefined },
      { executable: "C:\\checkout\\apps\\station\\build\\canary-win-x64\\Station-canary\\bin\\bun.exe" },
      { resources: "C:\\checkout\\dist" }, { executable: ctx.executable.replace("bun.exe", "launcher.exe") },
    ]) {
      expect(windowsCliPlan({ ...ctx, ...changes })).toBeUndefined();
      expect(await registerWindowsCli({ ...ctx, ...changes }, { read: () => { throw new Error("Unexpected effect"); } } as unknown as WindowsCliPorts)).toBe(false);
    }
  });
  test("requires matching uninstall and packaged version identities before writes", async () => {
    for (const file of [".electrobun-uninstall.json", "app/Resources/version.json"]) {
      const f = fixture();
      f.files.set(win32.join(f.plan.installRoot, file), JSON.stringify({ identifier: "foreign", channel: "canary" }));
      expect(await registerWindowsCli(context(), f.ports)).toBe(false);
      expect(f.registered).toEqual([]);
      expect(f.files.size).toBe(3);
    }
  });
  test("rejects mismatched installed channels and malformed metadata before writes", async () => {
    for (const file of [".electrobun-uninstall.json", "app/Resources/version.json"]) {
      const f = fixture();
      f.files.set(win32.join(f.plan.installRoot, file), JSON.stringify({ identifier: f.plan.identifier, channel: "stable" }));
      expect(await registerWindowsCli(context(), f.ports)).toBe(false);
      expect(f.files.size).toBe(3);
      f.files.set(win32.join(f.plan.installRoot, file), "not json");
      await expect(registerWindowsCli(context(), f.ports)).rejects.toThrow();
      expect(f.files.size).toBe(3);
    }
  });
  test("copies bundled CLI and writes a relative quoted shim, not checkout/Bun commands", async () => {
    const f = fixture();
    expect(await registerWindowsCli(context(), f.ports)).toBe(true);
    const shim = f.files.get(win32.join(f.plan.directory, "station.cmd"))!;
    expect(shim).toContain('"%~dp0station-cli.ps1" %*');
    expect(shim).toContain("DisableDelayedExpansion");
    expect(shim).not.toContain(local);
    expect(f.registered).toEqual([win32.join(f.plan.directory, "station-cli.ps1")]);
    expect(JSON.parse(f.files.get(win32.join(f.plan.directory, "install.json"))!).installRoot).toBe(f.plan.installRoot);
    expect(await registerWindowsCli(context(), f.ports)).toBe(true); // repair/retry
  });
  test("missing installed marker fails closed and registration errors remain observable", async () => {
    const f = fixture();
    f.files.delete(win32.join(f.plan.installRoot, ".electrobun-uninstall.json"));
    await expect(registerWindowsCli(context(), f.ports)).rejects.toThrow("Missing fixture");
    expect(f.registered).toEqual([]);
    const failure = fixture();
    failure.ports.register = async () => { throw new Error("registry denied"); };
    await expect(registerWindowsCli(context(), failure.ports)).rejects.toThrow("registry denied");
  });
});

// Execute only pure dot-sourced helpers/help in PowerShell: no registry writes,
// installed process discovery, window messages, launch or live installation use.
const script = resolve(import.meta.dir, "../desktop/station-cli.ps1").replace(/'/g, "''");
function powershell(code: string) {
  return Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", code], { stdout: "inherit", stderr: "inherit" });
}
if (process.platform === "win32") {
  test("PowerShell PATH merge preserves long raw entries, variables, order and empty segments", () => {
    const result = powershell(`. '${script}'; $dir='C:\\Station CLI'; $raw='%USERPROFILE%\\tools;;C:\\Other;' + ('x' * 5000); $next=Merge-StationUserPath $raw $dir; if ($next -cne ($raw+';'+$dir)) { throw 'PATH changed' }; if ((Merge-StationUserPath $next $dir) -cne $next) { throw 'not idempotent' }; if ((Merge-StationUserPath '"c:\\station cli\\";C:\\Other' $dir) -cne '"c:\\station cli\\";C:\\Other') { throw 'duplicate' }; if ((Merge-StationUserPath '' $dir) -cne $dir) { throw 'empty' }; 'passed'`);
    expect(result.exitCode).toBe(0);
  });
  test("bundled script parses; help and unknown commands never require installation", () => {
    const result = powershell(`$text=& '${script}' help; if (($text -join ' ') -notmatch 'No workspace/control authority') { throw 'Missing CLI help' }`);
    expect(result.exitCode).toBe(0);
    const invalid = powershell(`& '${script}' invalid`);
    expect(invalid.exitCode).toBe(1);
  });
}
