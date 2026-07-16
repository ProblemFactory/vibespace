# vibespace-agentd standalone installer (Windows, EXPERIMENTAL) — run this
# machine as a VibeSpace dial-out device. Requires Node 18+ on PATH
# (winget install OpenJS.NodeJS.LTS). Usage (from the pairing dialog):
#   & ([scriptblock]::Create((iwr -UseBasicParsing <vibespace>/agentd-install.ps1).Content)) `
#     -BundleUrl <vibespace>/agentd.js -Dial wss://<host>/api/agentd-dial?device=<id> `
#     -DialToken <vsdt_…> -HostToken <vsht_…>
param(
  [Parameter(Mandatory=$true)][string]$BundleUrl,
  [Parameter(Mandatory=$true)][string]$Dial,
  [Parameter(Mandatory=$true)][string]$DialToken,
  [Parameter(Mandatory=$true)][string]$HostToken
)
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Error 'node 18+ required (winget install OpenJS.NodeJS.LTS)'; exit 1 }
$major = [int]((node -e "process.stdout.write(process.versions.node.split('.')[0])"))
if ($major -lt 18) { Write-Error "node 18+ required (have $(node -v))"; exit 1 }

# per-instance root: one machine can pair to SEVERAL VibeSpace instances —
# keyed by the dial host so daemons/tokens never collide.
$dialHost = ([uri]($Dial -replace '^ws','http')).Host -replace '[^\w.-]',''
$root = Join-Path $env:USERPROFILE ".vibespace\device@$dialHost"
$ver = 'standalone'
New-Item -ItemType Directory -Force -Path (Join-Path $root $ver), (Join-Path $root 'state') | Out-Null

Write-Host "-> fetching agentd bundle from $BundleUrl"
Invoke-WebRequest -UseBasicParsing -Uri $BundleUrl -OutFile (Join-Path $root "$ver\vibespace-device.js")
# 'current' as a junction (no admin needed, unlike symlinks)
$current = Join-Path $root 'current'
if (Test-Path $current) { Remove-Item $current -Force -Recurse -ErrorAction SilentlyContinue }
cmd /c mklink /J "$current" (Join-Path $root $ver) | Out-Null

Set-Content -NoNewline -Path (Join-Path $root 'state\token') -Value $HostToken
Write-Host "-> host token at $root\state\token"

# take over from a daemon already running for this root (re-pair rotates the
# identity; the old daemon must be replaced or it keeps dialing with the old
# token). Verify it's a node process before stopping — never a recycled pid.
$lock = Join-Path $root 'state\agentd.lock'
if (Test-Path $lock) {
  $oldPid = (Get-Content $lock -ErrorAction SilentlyContinue) -as [int]
  if ($oldPid) {
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -like '*node*') {
      Write-Host "-> replacing the running daemon for this root (pid $oldPid)"
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
    Remove-Item $lock -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "-> starting daemon with dial-out to $Dial"
$out = Join-Path $root 'state\agentd.out'
# child inherits process env (Start-Process -Environment needs PS 7.3+; this
# way works on the Windows-default 5.1 too)
$env:VIBESPACE_DEVICE_ROOT = $root; $env:VIBESPACE_AGENTD_ROOT = $root
$p = Start-Process -PassThru -WindowStyle Hidden node -ArgumentList @("$current\vibespace-device.js", '--dial', $Dial, '--dial-token', $DialToken) `
  -RedirectStandardOutput $out -RedirectStandardError (Join-Path $root 'state\agentd.err')
Start-Sleep -Seconds 2
if ($p.HasExited) {
  Write-Host 'x the daemon exited immediately — last output:'
  Get-Content (Join-Path $root 'state\agentd.err') -Tail 5 -ErrorAction SilentlyContinue
  Get-Content $out -Tail 5 -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "OK vibespace-agentd running (pid $($p.Id)). Log: $root\state\agentd.log"
Write-Host "  Stop: Stop-Process -Id $($p.Id)"
