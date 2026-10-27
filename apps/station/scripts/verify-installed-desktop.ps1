param([Parameter(Mandatory)][string]$InstallRoot, [ValidateSet(43157, 43158)][int]$Port = 43157)
$ErrorActionPreference = 'Stop'
# This probe is for a disposable, normally installed Windows CI app. It sends
# real WM_CLOSE/menu messages to the installed HWND; no browser/native API mocks.
$install = [IO.Path]::GetFullPath($InstallRoot)
if (!(Test-Path -LiteralPath (Join-Path $install '.electrobun-uninstall.json'))) {
  throw 'A registered managed installation is required'
}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class StationNativeProbe {
  public delegate bool EnumProc(IntPtr h, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr menu, int position);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr menu, int position);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int size, uint flags);
  public static IntPtr[] Windows(uint[] pids) {
    var result = new List<IntPtr>();
    EnumWindows((h, _) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var title = new StringBuilder(256); GetWindowText(h, title, 256);
      if (Array.IndexOf(pids, pid) >= 0 && title.ToString() == "Station") result.Add(h);
      return true;
    }, IntPtr.Zero);
    return result.ToArray();
  }
  public static uint Command(IntPtr menu, string label) {
    for (int i = 0; i < GetMenuItemCount(menu); i++) {
      var text = new StringBuilder(256); GetMenuString(menu, (uint)i, text, 256, 0x400);
      if (text.ToString().Replace("&", "") == label) return GetMenuItemID(menu, i);
      var child = GetSubMenu(menu, i);
      if (child != IntPtr.Zero) { var id = Command(child, label); if (id != uint.MaxValue) return id; }
    }
    return uint.MaxValue;
  }
}
'@
function InstalledProcesses {
  @(Get-Process | Where-Object {
    $_.Path -and $_.Path.StartsWith((Join-Path $install 'app/bin/'), [StringComparison]::OrdinalIgnoreCase)
  })
}
function WaitUntil([scriptblock]$Condition, [string]$Failure) {
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 100
  }
  throw $Failure
}
WaitUntil { (InstalledProcesses).Count -gt 0 } 'Installed app is not running'
[uint32[]]$processIds = @(InstalledProcesses | ForEach-Object Id)
$windows = [StationNativeProbe]::Windows($processIds)
if ($windows.Count -ne 1) { throw "Expected one Station HWND, found $($windows.Count)" }
$windowHandle = $windows[0]
[uint32]$ownerId = 0
[void][StationNativeProbe]::GetWindowThreadProcessId($windowHandle, [ref]$ownerId)
$trayHandle = [IntPtr]::Zero
do {
  $trayHandle = [StationNativeProbe]::FindWindowEx([IntPtr](-3), $trayHandle, 'TrayWindowClass', 'TrayWindow')
  if ($trayHandle -eq [IntPtr]::Zero) { throw 'Installed process has no native tray owner' }
  [uint32]$trayOwner = 0
  [void][StationNativeProbe]::GetWindowThreadProcessId($trayHandle, [ref]$trayOwner)
} while ($trayOwner -ne $ownerId)

# Verify the actual installed executable resource, not just config/source paths.
$sourceIcon = [Drawing.Icon]::new((Join-Path $PSScriptRoot '../../../packages/ui/assets/station.ico'), 32, 32)
$executable = (Get-Process -Id $ownerId).Path
$installedIcon = [Drawing.Icon]::ExtractAssociatedIcon($executable)
try {
  $expected = $sourceIcon.ToBitmap()
  $actual = $installedIcon.ToBitmap()
  if ($actual.Width -ne $expected.Width -or $actual.Height -ne $expected.Height) { throw 'Installed executable icon size differs from Station icon' }
  for ($x = 0; $x -lt $expected.Width; $x++) {
    for ($y = 0; $y -lt $expected.Height; $y++) {
      if ($actual.GetPixel($x, $y).ToArgb() -ne $expected.GetPixel($x, $y).ToArgb()) { throw 'Installed executable branding differs from Station S' }
    }
  }
} finally { $expected.Dispose(); $actual.Dispose(); $sourceIcon.Dispose(); $installedIcon.Dispose() }

for ($cycle = 0; $cycle -lt 3; $cycle++) {
  [void][StationNativeProbe]::PostMessage($windowHandle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
  WaitUntil { ![StationNativeProbe]::IsWindowVisible($windowHandle) } 'X did not hide Station'
  if (![StationNativeProbe]::IsWindow($windowHandle) -or ![StationNativeProbe]::IsWindow($trayHandle)) { throw 'Hide destroyed the app or tray' }
  if ((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/").StatusCode -ne 200) { throw 'Hidden app stopped its API' }
  $command = [StationNativeProbe]::Command([StationNativeProbe]::GetMenu($windowHandle), 'Show Station')
  if ($command -eq [uint32]::MaxValue) { throw 'Show Station menu is missing' }
  [void][StationNativeProbe]::PostMessage($windowHandle, 0x111, [IntPtr]::new($command), [IntPtr]::Zero)
  WaitUntil { [StationNativeProbe]::IsWindowVisible($windowHandle) } 'Show Station did not restore the same HWND'
  if ([StationNativeProbe]::Windows($processIds).Count -ne 1) { throw 'Show created duplicate Station windows' }
}
$quitCommand = [StationNativeProbe]::Command([StationNativeProbe]::GetMenu($windowHandle), 'Quit')
if ($quitCommand -eq [uint32]::MaxValue) { throw 'Quit menu is missing' }
[void][StationNativeProbe]::PostMessage($windowHandle, 0x111, [IntPtr]::new($quitCommand), [IntPtr]::Zero)
WaitUntil { !(InstalledProcesses).Count } 'Quit left installed processes running'
if ([StationNativeProbe]::IsWindow($trayHandle)) { throw 'Quit left the tray owner alive' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Quit left the API port listening' }
Write-Host 'Installed native probe passed: S icon, tray ownership, X/hide, three same-HWND restores, Quit/process/tray/API cleanup.'
