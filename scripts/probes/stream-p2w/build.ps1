# build.ps1 — compile wgc-probe.cs with the in-box C# 5 csc of .NET Framework 4.8 (lane stream-p2w-capture-probe).
# References: every WinRT metadata file in System32\WinMetadata (a client Windows splits them per namespace; a union
# Windows.winmd is used instead when there is one) + the .NET Framework's WinRT facades from the runtime folder.
# Tries /define:MINUPDATE first (GraphicsCaptureSession.MinUpdateInterval, Windows 11 24H2+), then without it.
# The exe lands next to this script. Prints one JSON line.
$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $dir 'wgc-probe.cs'
$exe = Join-Path $dir 'wgc-probe.exe'
$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $fw 'csc.exe'
$wm = Join-Path $env:WINDIR 'System32\WinMetadata'
$union = @(Get-ChildItem $wm -Filter 'Windows.winmd' -ErrorAction SilentlyContinue)
$winmd = if ($union.Count) { $union } else { @(Get-ChildItem $wm -Filter '*.winmd') }
$facades = @('System.Runtime.dll', 'System.Runtime.WindowsRuntime.dll', 'System.Runtime.InteropServices.WindowsRuntime.dll') | ForEach-Object { Join-Path $fw $_ } | Where-Object { Test-Path $_ }
$refs = @($winmd | ForEach-Object { '/r:' + $_.FullName }) + @($facades | ForEach-Object { '/r:' + $_ })
$res = [ordered]@{ ev = 'build'; csc = $csc; winmd = @($winmd | ForEach-Object { $_.Name }); facades = @($facades); tries = @() }
foreach ($def in @('MINUPDATE', '')) {
  if (Test-Path $exe) { Remove-Item $exe -Force }
  $argList = @('/nologo', '/target:exe', '/platform:x64', '/optimize+', "/out:$exe") + $refs
  if ($def) { $argList += "/define:$def" }
  $argList += $src
  $t0 = Get-Date
  $out = & $csc @argList 2>&1 | ForEach-Object { "$_" }
  $ok = ($LASTEXITCODE -eq 0) -and (Test-Path $exe)
  $res.tries += [ordered]@{ define = $def; exit = $LASTEXITCODE; ok = $ok; ms = [math]::Round(((Get-Date) - $t0).TotalMilliseconds); out = @($out | Select-Object -First 20) }
  if ($ok) { $res.ok = $true; $res.define = $def; $res.exe = $exe; $res.size = (Get-Item $exe).Length; break }
}
if (-not $res.ok) { $res.ok = $false }
Write-Output ($res | ConvertTo-Json -Depth 5 -Compress)
