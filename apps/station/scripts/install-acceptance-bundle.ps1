param([Parameter(Mandatory)][string]$InstallRoot)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($InstallRoot)
$registration=Get-Content -LiteralPath (Join-Path $target '.electrobun-uninstall.json') -Raw|ConvertFrom-Json
if($registration.identifier -ne 'com.isaacharvey.station.acceptance'){throw 'Only the registered managed acceptance installation may be updated'}
$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../build/canary-win-x64/Station-canary'))
if(!(Test-Path -LiteralPath (Join-Path $source 'Resources/version.json'))){
 $metadata=Get-Content -LiteralPath (Join-Path $source 'Resources/metadata.json') -Raw|ConvertFrom-Json
 if($metadata.identifier -ne $registration.identifier){throw 'Compressed build is not the managed acceptance payload'}
 $stage=Join-Path ([IO.Path]::GetTempPath()) ('station-acceptance-'+[guid]::NewGuid())
 New-Item -ItemType Directory -Path $stage | Out-Null
 $archive=Join-Path $PSScriptRoot '../artifacts/canary-win-x64-Station-canary.tar.zst'
 & zstd -d -f $archive -o (Join-Path $stage 'payload.tar')
 if($LASTEXITCODE -ne 0){throw 'Could not decompress acceptance payload'}
 & tar -xf (Join-Path $stage 'payload.tar') -C $stage
 if($LASTEXITCODE -ne 0){throw 'Could not extract acceptance payload'}
 $source=Join-Path $stage 'Station-canary'
}
$version=Get-Content -LiteralPath (Join-Path $source 'Resources/version.json') -Raw|ConvertFrom-Json
$profile=Get-Content -LiteralPath (Join-Path $source 'Resources/app/station/runtime/profile.json') -Raw|ConvertFrom-Json
if($version.identifier -ne $registration.identifier -or !$profile.acceptance -or $profile.port -ne 43158){throw 'Build is not an isolated acceptance payload'}
$app=Join-Path $target 'app'
if(Get-Process|Where-Object{$_.Path -and $_.Path.StartsWith($app+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)}){throw 'Quit the acceptance installation before updating it'}
if(Get-NetTCPConnection -LocalPort 43158 -State Listen -ErrorAction SilentlyContinue){throw 'Acceptance port is already owned'}
# Copy only application payload. WebView2, saved workspace data and uninstall registration stay outside it.
Copy-Item -LiteralPath (Join-Path $source 'bin'),(Join-Path $source 'Resources') -Destination $app -Recurse -Force
$env:STATION_PROGRAMS_VERIFY='1'
try {Start-Process -FilePath (Join-Path $app 'bin/launcher.exe') -WorkingDirectory $app -WindowStyle Hidden}finally{Remove-Item Env:STATION_PROGRAMS_VERIFY}
Write-Host "Updated and launched verified acceptance payload: $app"
