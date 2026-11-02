param([switch]$Register, [Parameter(Position=0)][string]$Command = 'launch')
$ErrorActionPreference = 'Stop'

function Merge-StationUserPath([string]$Current, [string]$Directory) {
  $target = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
  foreach ($entry in ($Current -split ';')) {
    if (!$entry.Trim()) { continue }
    try {
      $expanded = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"'))
      if ([IO.Path]::GetFullPath($expanded).TrimEnd('\').Equals($target, [StringComparison]::OrdinalIgnoreCase)) { return $Current }
    } catch { # Preserve unusual pre-existing entries verbatim.
    }
  }
  if (!$Current) { return $Directory }
  if ($Current.EndsWith(';')) { return $Current + $Directory }
  return $Current + ';' + $Directory
}

function Get-StationCliInstall {
  $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'install.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $expected = if ($config.command -eq 'station-acceptance') { 'com.isaacharvey.station.acceptance' } elseif ($config.command -eq 'station') { 'com.isaacharvey.station' } else { throw 'Unknown Station CLI identity' }
  $root = [IO.Path]::GetFullPath($config.installRoot)
  $identityRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA $expected))
  if (![IO.Path]::GetDirectoryName($root).Equals($identityRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'CLI target is not a managed Station installation' }
  if (![IO.Path]::GetFullPath($PSScriptRoot).Equals((Join-Path $identityRoot 'cli'), [StringComparison]::OrdinalIgnoreCase)) { throw 'CLI is outside its registered directory' }
  $manifest = Get-Content -LiteralPath (Join-Path $root '.electrobun-uninstall.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = Get-Content -LiteralPath (Join-Path $root 'app/Resources/version.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.identifier -ne $expected -or $manifest.channel -ne $config.channel -or $version.identifier -ne $expected -or $version.channel -notin @('canary','stable') -or $version.channel -ne $config.channel) { throw 'Installed Station identity/channel does not match CLI registration' }
  $launcher = Join-Path $root 'app/bin/launcher.exe'
  if (!(Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Installed Station launcher is missing; reinstall Station' }
  return @{ Root=$root; Launcher=$launcher; Name=$config.command; Version=$version.version }
}

function Register-StationCliPath {
  # Read the USER registry value, not the expanded process PATH (which includes
  # machine entries). Preserve both raw %variables% and the existing registry kind.
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
  try {
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
    if ($kind -notin @([Microsoft.Win32.RegistryValueKind]::String, [Microsoft.Win32.RegistryValueKind]::ExpandString)) { throw 'User PATH has an unsupported registry type' }
    $next = Merge-StationUserPath $raw $PSScriptRoot
    if ($next -eq $raw) { return }
    $key.SetValue('Path', $next, $kind)
  } finally { $key.Dispose() }
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StationPathNotification {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);
}
'@
  $result = [UIntPtr]::Zero
  [void][StationPathNotification]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 1000, [ref]$result)
}

function Show-StationInstalledWindow([int[]]$ProcessIds) {
  Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class StationCliWindow {
  delegate bool Callback(IntPtr h, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int size);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  public static bool Show(int[] ids) {
    bool found = false;
    EnumWindows((h, _) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var title = new StringBuilder(256); GetWindowText(h, title, 256);
      if (Array.IndexOf(ids, (int)pid) >= 0 && title.ToString() == "Station") {
        ShowWindowAsync(h, 9); SetForegroundWindow(h); found = true;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
  return [StationCliWindow]::Show($ProcessIds)
}

function Invoke-StationCli {
  if ($Command -in @('help','--help','-h')) {
    Write-Output 'Station installed desktop launcher: station [launch|status|help]'
    Write-Output 'Acceptance uses station-acceptance. Launch restores the installed window or starts the app.'
    Write-Output 'No workspace/control authority. Open a new terminal after first installed launch for PATH changes.'
    return
  }
  if (!$Register -and $Command -notin @('launch','status')) { throw "Unknown command: $Command. Use help." }
  $install = Get-StationCliInstall
  if ($Register) { Register-StationCliPath; return }
  $bin = (Join-Path $install.Root 'app/bin/')
  $running = @(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($bin, [StringComparison]::OrdinalIgnoreCase) })
  if ($Command -eq 'status') {
    Write-Output ("{0} {1}: installed at {2}; running={3}" -f $install.Name, $install.Version, $install.Root, ($running.Count -gt 0))
    return
  }
  if ($running.Count -gt 0) {
    if (!(Show-StationInstalledWindow @($running | ForEach-Object Id))) { throw 'Installed Station is already running but its window is not ready. Retry shortly; no second instance was started.' }
    return
  }
  Start-Process -FilePath $install.Launcher -WorkingDirectory (Join-Path $install.Root 'app') -WindowStyle Hidden
}

# Dot-sourcing exposes pure helpers for tests; never registers PATH or launches.
if ($MyInvocation.InvocationName -ne '.') {
  try { Invoke-StationCli } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
}
