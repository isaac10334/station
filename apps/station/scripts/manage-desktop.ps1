[CmdletBinding()]
param(
    [ValidateSet('Build', 'Install', 'Update', 'Uninstall', 'Status')][string]$Action = 'Update',
    [switch]$Acceptance,
    # Forced termination is an explicit fallback, never the default.
    [switch]$Force,
    [switch]$Plan
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'This workflow requires Windows.' }
# Bun/PowerShell 7 callers can inherit a PSModulePath without Windows modules.
# Resolve the built-in modules from this interpreter, never a user module alias.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Archive/Microsoft.PowerShell.Archive.psd1')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$app = Join-Path $repo 'apps/station'
$identifier = if ($Acceptance) { 'com.isaacharvey.station.acceptance' } else { 'com.isaacharvey.station' }
$install = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "$identifier/canary"))
$bin = Join-Path $install 'app/bin'
$manifestPath = Join-Path $app ".desktop-local/$identifier.json"
$zip = Join-Path $app 'artifacts/canary-win-x64-Station-Setup-canary.zip'
$metadataPath = Join-Path $app 'artifacts/canary-win-x64-update.json'
$port = if ($Acceptance) { 43158 } else { 43157 }

# Plan mode performs no build, process, filesystem, or registry mutations.
if ($Plan) {
    [ordered]@{ action = $Action; identifier = $identifier; installRoot = $install; port = $port;
        build = $Action -in @('Build', 'Update'); replace = $Action -in @('Install', 'Update');
        preserveProfile = $true; githubUpdates = $false; force = [bool]$Force } | ConvertTo-Json -Compress
    exit 0
}
function Get-InstalledProcesses {
    # Do not select by process name: Bun and WebView2 can belong to other apps.
    @(Get-Process | Where-Object {
        try { $_.Path -and $_.Path.StartsWith($bin + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) }
        catch { $false }
    })
}
function Assert-PortOwnership {
    $owned = @(Get-InstalledProcesses | ForEach-Object Id)
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        if ($listener.OwningProcess -notin $owned) {
            throw "Port $port belongs to an unverified process ($($listener.OwningProcess)); refusing to interrupt it or launch over it."
        }
    }
}
function Assert-Installation {
    $recordPath = Join-Path $install '.electrobun-uninstall.json'
    if (!(Test-Path -LiteralPath $recordPath -PathType Leaf)) { throw "No registered Station installation at $install" }
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    if ($record.identifier -ne $identifier -or $record.channel -ne 'canary') { throw 'Installed identity/channel mismatch; refusing to modify it.' }
}
function Stop-InstalledStation {
    $processes = @(Get-InstalledProcesses)
    if (!$processes.Count) { return }
    Assert-Installation
    # X hides to tray. Dispatch the existing native Quit menu action instead.
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class StationLocalQuit {
    delegate bool EnumProc(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetMenu(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr menu, int position);
    [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr menu, int position);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int size, uint flags);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    static uint FindQuit(IntPtr menu) {
        for (int i = 0; i < GetMenuItemCount(menu); i++) {
            var text = new StringBuilder(256); GetMenuString(menu, (uint)i, text, 256, 0x400);
            if (text.ToString().Replace("&", "") == "Quit") return GetMenuItemID(menu, i);
            var child = GetSubMenu(menu, i);
            if (child != IntPtr.Zero) { var id = FindQuit(child); if (id != uint.MaxValue) return id; }
        }
        return uint.MaxValue;
    }
    public static void Request(uint[] pids) {
        EnumWindows((window, _) => {
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (Array.IndexOf(pids, pid) >= 0) {
                var id = FindQuit(GetMenu(window));
                if (id != uint.MaxValue) PostMessage(window, 0x111, new IntPtr(id), IntPtr.Zero);
            }
            return true;
        }, IntPtr.Zero);
    }
}
'@
    [StationLocalQuit]::Request([uint32[]]@($processes | ForEach-Object Id))
    $deadline = [datetime]::UtcNow.AddSeconds(20)
    while (@(Get-InstalledProcesses).Count -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (@(Get-InstalledProcesses).Count) {
        if (!$Force) { throw 'Station did not quit. Save your work and choose Quit, or explicitly retry with -Force (active work will be lost).' }
        # Re-read executable paths immediately before each stop; never kill by name/tree.
        Get-InstalledProcesses | Stop-Process -Force
        $deadline = [datetime]::UtcNow.AddSeconds(10)
        while (@(Get-InstalledProcesses).Count -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
        if (@(Get-InstalledProcesses).Count) { throw 'Station processes are still running; installation was not changed.' }
    }
    # Let Windows release mapped executables before the installer renames app/.
    Start-Sleep -Milliseconds 500
}
function Build-LocalStation {
    $names = @('STATION_DESKTOP_LOCAL', 'STATION_DESKTOP_ACCEPTANCE', 'STATION_DESKTOP_DEV', 'STATION_DESKTOP_TEST_FEED', 'STATION_VERSION')
    $previous = @{}
    foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        $env:STATION_DESKTOP_LOCAL = '1'
        $env:STATION_DESKTOP_ACCEPTANCE = if ($Acceptance) { '1' } else { $null }
        $env:STATION_DESKTOP_DEV = $null
        $env:STATION_DESKTOP_TEST_FEED = $null
        $env:STATION_VERSION = '0.1.0-canary.' + [datetime]::UtcNow.ToString('yyyyMMddHHmmssfff')
        Push-Location $repo
        try {
            & bun run desktop:build
            if ($LASTEXITCODE -ne 0) { throw "Desktop build failed ($LASTEXITCODE); installed app was not touched." }
        } finally { Pop-Location }
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        if ($metadata.identifier -ne $identifier -or $metadata.channel -ne 'canary' -or $metadata.version -ne $env:STATION_VERSION) {
            throw 'Built metadata does not match the requested local installation.'
        }
        # The stamp binds Install to these exact local bytes, not a later CI/acceptance build.
        $stamp = @{ identifier = $identifier; version = $metadata.version; hash = $metadata.hash;
            zipSha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash;
            frontendSha256 = (Get-FileHash -LiteralPath (Join-Path $app 'dist/index.html') -Algorithm SHA256).Hash;
            profileSha256 = (Get-FileHash -LiteralPath (Join-Path $app 'dist/desktop/profile.json') -Algorithm SHA256).Hash;
            nativeSha256 = (Get-FileHash -LiteralPath (Join-Path $app '.hutch/native-browser/libNativeWrapper.dll') -Algorithm SHA256).Hash }
        New-Item -ItemType Directory -Force -Path (Split-Path $manifestPath) | Out-Null
        $stamp | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
        Write-Host "Local build ready: $($metadata.version)"
    } finally {
        foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}
function Get-VerifiedLocalBuild {
    $stamp = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    if ($stamp.identifier -ne $identifier -or $metadata.identifier -ne $identifier -or $metadata.channel -ne 'canary' -or
        $metadata.version -ne $stamp.version -or $metadata.hash -ne $stamp.hash -or
        (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $stamp.zipSha256) {
        throw 'Artifacts are not the last local build for this identity. Run desktop:update (or desktop:local-build) again.'
    }
    return $stamp
}
function Install-LocalStation {
    $stamp = Get-VerifiedLocalBuild
    # Unique staging keeps every companion payload beside Setup; never run the EXE alone.
    $stage = Join-Path $app ('.desktop-local/setup-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $stage
    $setup = Join-Path $stage 'Station-Setup-canary.exe'
    if (!(Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'Installer ZIP is missing Station-Setup-canary.exe.' }
    Write-Host "Replacing $install with local version $($stamp.version). Saved data is preserved."
    if (Test-Path -LiteralPath (Join-Path $install 'app')) { Assert-Installation }
    Assert-PortOwnership
    Stop-InstalledStation
    # Pinned beta.26 has no silent-install flag: any argument enters its uninstall manager.
    $process = Start-Process -FilePath $setup -WorkingDirectory $stage -PassThru
    if (!$process.WaitForExit(180000)) { throw "Setup is still running; inspect it before retrying. Staged files retained at $stage" }
    if ($process.ExitCode -ne 0) { throw "Setup failed ($($process.ExitCode)); staged files retained at $stage" }
    Assert-Installation
    $versionPath = Join-Path $install 'app/Resources/version.json'
    $version = Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json
    if ($version.identifier -ne $identifier -or $version.channel -ne 'canary' -or $version.version -ne $stamp.version -or $version.hash -ne $stamp.hash) { throw 'Installed identity/version/hash does not match the local build.' }
    $criticalFiles = @{
        'app/Resources/app/station/index.html' = $stamp.frontendSha256
        'app/Resources/app/station/runtime/profile.json' = $stamp.profileSha256
        'app/bin/libNativeWrapper.dll' = $stamp.nativeSha256
    }
    foreach ($relative in $criticalFiles.Keys) {
        if ((Get-FileHash -LiteralPath (Join-Path $install $relative) -Algorithm SHA256).Hash -ne $criticalFiles[$relative]) { throw "Installed bytes differ from local build: $relative" }
    }
    $settings = Get-Content -LiteralPath (Join-Path $install 'app/Resources/app/station/runtime/profile.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($settings.localBuild -ne $true -or $settings.updatesEnabled -ne $false -or $settings.identifier -ne $identifier) { throw 'Installed local profile/update policy mismatch.' }
    $deadline = [datetime]::UtcNow.AddSeconds(30)
    while (!@(Get-InstalledProcesses).Count -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (!@(Get-InstalledProcesses).Count) { throw 'Installed bytes verified, but Station did not stay running. Launch Station and inspect its startup error.' }
    Write-Host "Installed and launched local Station $($stamp.version). GitHub update checks are disabled."
    # Delete only this invocation's verified staging directory, never the install/profile.
    if ([IO.Path]::GetDirectoryName($stage) -ne (Join-Path $app '.desktop-local') -or [IO.Path]::GetFileName($stage) -notmatch '^setup-[a-f0-9]{32}$') { throw 'Unexpected staging cleanup path' }
    Write-Verbose "Removing verified setup staging directory: $stage"
    Remove-Item -LiteralPath $stage -Recurse -Force
}
function Remove-StationCli {
    $cli = Join-Path $env:LOCALAPPDATA "$identifier/cli"
    $recordPath = Join-Path $cli 'install.json'
    if (!(Test-Path -LiteralPath $recordPath -PathType Leaf)) { return }
    $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.identifier -ne $identifier -or ![IO.Path]::GetFullPath($record.installRoot).Equals($install, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning 'CLI belongs to a different installation; leaving it untouched.'
        return
    }
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    if ($key) {
        try {
            if ($key.GetValueNames() -contains 'Path') {
                $kind = $key.GetValueKind('Path')
                if ($kind -notin @([Microsoft.Win32.RegistryValueKind]::String, [Microsoft.Win32.RegistryValueKind]::ExpandString)) { throw 'Unsupported user PATH registry type' }
                $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                $entries = @($raw -split ';' | Where-Object {
                    if (!$_.Trim()) { return $true }
                    try { ![IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_.Trim().Trim('"'))).TrimEnd('\').Equals($cli, [StringComparison]::OrdinalIgnoreCase) }
                    catch { $true }
                })
                $next = $entries -join ';'
                if ($next -cne $raw) { $key.SetValue('Path', $next, $kind) }
            }
        } finally { $key.Dispose() }
    }
    # Only the three files owned by registration are removed, never an identifier root.
    foreach ($name in @('station.cmd', 'station-acceptance.cmd', 'station-cli.ps1', 'install.json')) {
        $target = Join-Path $cli $name
        Write-Verbose "Removing owned CLI registration file: $target"
        if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
    }
}

# Tests dot-source helpers without running any action.
if ($MyInvocation.InvocationName -eq '.') { return }
switch ($Action) {
    'Build' { Build-LocalStation }
    'Update' { Build-LocalStation; Install-LocalStation }
    'Install' { Install-LocalStation }
    'Status' {
        [ordered]@{ installRoot = $install; registered = (Test-Path -LiteralPath (Join-Path $install '.electrobun-uninstall.json'));
            processIds = @(Get-InstalledProcesses | ForEach-Object Id); localBuildStamp = $manifestPath } | ConvertTo-Json
    }
    'Uninstall' {
        Assert-Installation
        Assert-PortOwnership
        Stop-InstalledStation
        $uninstaller = Join-Path $install 'uninstall.exe'
        if (!(Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw "Missing native uninstaller: $uninstaller" }
        # --quiet is supported by the UNINSTALL manager, not by Setup. No --purge-data.
        $process = Start-Process -FilePath $uninstaller -ArgumentList '--uninstall', '--quiet' -PassThru
        if (!$process.WaitForExit(120000)) { throw 'Uninstaller is still running; inspect it before retrying.' }
        if ($process.ExitCode -ne 0) { throw "Uninstall failed ($($process.ExitCode))." }
        # Native manager may finish deletion in a deferred worker after it exits.
        $deadline = [datetime]::UtcNow.AddSeconds(30)
        while ((Test-Path -LiteralPath (Join-Path $install 'app')) -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
        if (Test-Path -LiteralPath (Join-Path $install 'app')) { throw 'Uninstaller returned but app files remain.' }
        Remove-StationCli
        Write-Host 'Station uninstalled. Saved workspace and WebView2 profile data were preserved.'
    }
}
