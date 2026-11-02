import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/manage-desktop.ps1");
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const run = (code: string) => Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `$ErrorActionPreference='Stop'; ${code}`], { stdout: "inherit", stderr: "inherit" });

if (process.platform === "win32") {
  test("Windows management script parses and previews both identities without mutation", () => {
    expect(run(`$errors=$null; $tokens=$null; [System.Management.Automation.Language.Parser]::ParseFile(${quote(script)}, [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { throw ($errors | Out-String) }`).exitCode).toBe(0);
    for (const acceptance of [false, true]) {
      // Plan exits its own child, so inspect its structured output in this process.
      const code = `$result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${quote(script)} -Action Update -Plan ${acceptance ? "-Acceptance" : ""}; if ($LASTEXITCODE -ne 0) { throw 'Plan failed' }; $plan=$result | ConvertFrom-Json; if ($plan.identifier -ne '${acceptance ? "com.isaacharvey.station.acceptance" : "com.isaacharvey.station"}' -or $plan.port -ne ${acceptance ? 43158 : 43157} -or !$plan.preserveProfile -or $plan.force -or $plan.githubUpdates -or !$plan.build -or !$plan.replace) { throw 'Incorrect plan' }`;
      expect(run(code).exitCode).toBe(0);
    }
  });

  test("installer rejects stale bytes and cross-profile stamps before any process or install change", async () => {
    const directory = await mkdtemp(join(tmpdir(), "station-desktop-test-"));
    try {
      const archive = join(directory, "setup.zip");
      const metadata = join(directory, "update.json");
      const stamp = join(directory, "stamp.json");
      await writeFile(archive, "fixture bytes, not an installer");
      await writeFile(metadata, JSON.stringify({ identifier: "com.isaacharvey.station.acceptance", channel: "canary", version: "0.1.0-canary.123", hash: "fixture" }));
      const code = `. ${quote(script)} -Acceptance; $zip=${quote(archive)}; $metadataPath=${quote(metadata)}; $manifestPath=${quote(stamp)};
        $stamp=@{ identifier=$identifier; version='0.1.0-canary.123'; hash='fixture'; zipSha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash };
        $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8;
        if ((Get-VerifiedLocalBuild).version -ne $stamp.version) { throw 'Valid stamp rejected' };
        function Stop-InstalledStation { throw 'MUTATION: must not stop app' };
        function Start-Process { throw 'MUTATION: must not run installer' };
        function AssertRejected { try { Install-LocalStation; throw 'Unexpected success' } catch { if ($_.Exception.Message -notmatch 'Artifacts are not the last local build') { throw } } };
        $stamp.identifier='com.isaacharvey.station'; $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8; AssertRejected;
        $stamp.identifier=$identifier; $stamp.zipSha256='wrong'; $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8; AssertRejected;
        $stamp.zipSha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash; $stamp.version='stale'; $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8; AssertRejected;
        $stamp.version='0.1.0-canary.123'; $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8;
        Add-Content -LiteralPath $zip 'changed'; AssertRejected;
        'Artifact guards passed'`;
      expect(run(code).exitCode).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("unverified port owner and wrong installed identity fail closed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "station-desktop-test-"));
    try {
      await writeFile(join(directory, ".electrobun-uninstall.json"), JSON.stringify({ identifier: "foreign", channel: "canary" }));
      expect(run(`. ${quote(script)} -Acceptance; $install=${quote(directory)};
        try { Assert-Installation; throw 'Unexpected success' } catch { if ($_.Exception.Message -notmatch 'identity/channel mismatch') { throw } };
        function Get-InstalledProcesses { @([pscustomobject]@{ Id=123 }) };
        function Get-NetTCPConnection { @([pscustomobject]@{ OwningProcess=999 }) };
        try { Assert-PortOwnership; throw 'Unexpected success' } catch { if ($_.Exception.Message -notmatch 'unverified process') { throw } };
        'Ownership guards passed'`).exitCode).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
