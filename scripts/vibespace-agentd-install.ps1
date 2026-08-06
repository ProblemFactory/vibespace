# vibespace-agentd standalone installer (Windows, EXPERIMENTAL) — run this
# machine as a VibeSpace dial-out device. Nothing to install first: Node is
# downloaded (and checksum-verified) into the install root when the machine
# has none. Usage (from the pairing dialog):
#   & ([scriptblock]::Create((iwr -UseBasicParsing <vibespace>/agentd-install.ps1).Content)) `
#     -BundleUrl <vibespace>/agentd.js -Dial wss://<host>/api/agentd-dial?device=<id> `
#     -DialToken <vsdt_…> -HostToken <vsht_…>
# -NodeExe <path> forces a specific node.exe and skips discovery/provisioning.
param(
  [Parameter(Mandatory=$true)][string]$BundleUrl,
  [Parameter(Mandatory=$true)][string]$Dial,
  [Parameter(Mandatory=$true)][string]$DialToken,
  [Parameter(Mandatory=$true)][string]$HostToken,
  [string]$NodeExe
)
$ErrorActionPreference = 'Stop'
# PS 5.1 defaults to TLS 1.0 — nodejs.org (and most CDNs) refuse it
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# IWR's progress bar makes a 30MB download take minutes on PS 5.1
$ProgressPreference = 'SilentlyContinue'

$NodeVersion = if ($env:VIBESPACE_NODE_VERSION) { $env:VIBESPACE_NODE_VERSION } else { 'v22.22.0' }
$NodeMirror  = if ($env:VIBESPACE_NODE_MIRROR)  { $env:VIBESPACE_NODE_MIRROR }  else { 'https://nodejs.org/dist' }

# per-instance root: one machine can pair to SEVERAL VibeSpace instances —
# keyed by the dial host so daemons/tokens never collide.
$dialHost = ([uri]($Dial -replace '^ws','http')).Host -replace '[^\w.-]',''
$root = Join-Path $env:USERPROFILE ".vibespace\device@$dialHost"
$ver = 'standalone'
New-Item -ItemType Directory -Force -Path (Join-Path $root $ver), (Join-Path $root 'state') | Out-Null

function Get-NodeMajor([string]$exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return 0 }
  try { return [int](& $exe -e "process.stdout.write(process.versions.node.split('.')[0])" 2>$null) } catch { return 0 }
}

# Provision a PRIVATE node into the install root — no admin, no PATH changes
# outside this script, and `Remove-Item $root -Recurse` stays a complete
# uninstall (daemon AND its runtime). Verified against the official
# SHASUMS256.txt, smoke-run before it is committed into place.
function Install-PrivateNode([string]$rootDir) {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' }
          elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  if ($arch -eq 'x86') { throw 'no official Node build for 32-bit Windows - install Node 18+ (winget install OpenJS.NodeJS.LTS)' }
  $zip = "node-$NodeVersion-win-$arch.zip"
  $tmp = Join-Path $rootDir '.node-dl'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Write-Host "-> no usable Node 18+ found - installing a private one into $rootDir\node (~30MB)"
    Write-Host "   $NodeMirror/$NodeVersion/$zip"
    Invoke-WebRequest -UseBasicParsing -Uri "$NodeMirror/$NodeVersion/$zip"           -OutFile (Join-Path $tmp $zip)
    Invoke-WebRequest -UseBasicParsing -Uri "$NodeMirror/$NodeVersion/SHASUMS256.txt" -OutFile (Join-Path $tmp 'SHASUMS256.txt')
    $line = Select-String -Path (Join-Path $tmp 'SHASUMS256.txt') -Pattern ('\s' + [regex]::Escape($zip) + '$') | Select-Object -First 1
    if (-not $line) { throw "$zip is not listed in SHASUMS256.txt (bad version or platform)" }
    $want = $line.Line.Split(' ')[0].ToLower()
    $got  = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $tmp $zip)).Hash.ToLower()
    if ($got -ne $want) { throw "checksum mismatch for $zip (expected $want, got $got)" }
    Write-Host '   checksum verified'
    Expand-Archive -Path (Join-Path $tmp $zip) -DestinationPath $tmp -Force
    $src = Join-Path $tmp "node-$NodeVersion-win-$arch"   # node.exe sits at the ROOT of the zip dir
    if (-not (Test-Path (Join-Path $src 'node.exe'))) { throw 'unexpected archive layout' }
    if ((Get-NodeMajor (Join-Path $src 'node.exe')) -lt 18) { throw 'the downloaded node cannot run on this machine' }
    $dest = Join-Path $rootDir 'node'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Move-Item $src $dest                                  # commit
    Write-Host "   Node $(& (Join-Path $dest 'node.exe') -v) installed at $dest"
    return (Join-Path $dest 'node.exe')
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

# order: explicit override -> OUR private copy (durable; a volatile PATH entry
# baked into a scheduled task breaks at the user's next node upgrade) -> PATH
# -> the usual install locations -> provision.
$privNode = Join-Path $root 'node\node.exe'
$nodeExe = $null
foreach ($c in @($NodeExe, $privNode, (Get-Command node -ErrorAction SilentlyContinue).Source,
                 "$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
  if ($c -and (Get-NodeMajor $c) -ge 18) { $nodeExe = $c; break }
}
if (-not $nodeExe) {
  try { $nodeExe = Install-PrivateNode $root }
  catch {
    Write-Host "x could not provision Node automatically: $_"
    Write-Host '  Install it yourself and re-run the same command:  winget install OpenJS.NodeJS.LTS'
    exit 1
  }
}
# npm and every `#!/usr/bin/env node` shebang must resolve to THE SAME node
$env:PATH = (Split-Path $nodeExe) + ';' + $env:PATH
Set-Content -NoNewline -Path (Join-Path $root 'state\node-path') -Value $nodeExe   # support breadcrumb
Write-Host "-> node: $nodeExe ($(& $nodeExe -v))"

Write-Host "-> fetching agentd bundle from $BundleUrl"
Invoke-WebRequest -UseBasicParsing -Uri $BundleUrl -OutFile (Join-Path $root "$ver\vibespace-device.js")
# 'current' as a junction (no admin needed, unlike symlinks)
$current = Join-Path $root 'current'
if (Test-Path $current) { Remove-Item $current -Force -Recurse -ErrorAction SilentlyContinue }
cmd /c mklink /J "$current" (Join-Path $root $ver) | Out-Null

Set-Content -NoNewline -Path (Join-Path $root 'state\token') -Value $HostToken
Write-Host "-> host token at $root\state\token"

# Persist the dial config like the bash installer does: a 2.170+ daemon re-reads
# it on every dial attempt, so it can be started ARGLESS (the scheduled task
# below) and a re-pair heals a running daemon.
$dialJson = (@{ url = $Dial; token = $DialToken } | ConvertTo-Json -Compress)
Set-Content -NoNewline -Path (Join-Path $root 'state\dial.json') -Value $dialJson
Write-Host "-> dial config persisted ($root\state\dial.json)"

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
$p = Start-Process -PassThru -WindowStyle Hidden $nodeExe -ArgumentList @("$current\vibespace-device.js", '--dial', $Dial, '--dial-token', $DialToken) `
  -RedirectStandardOutput $out -RedirectStandardError (Join-Path $root 'state\agentd.err')
Start-Sleep -Seconds 2
if ($p.HasExited) {
  Write-Host 'x the daemon exited immediately — last output:'
  Get-Content (Join-Path $root 'state\agentd.err') -Tail 5 -ErrorAction SilentlyContinue
  Get-Content $out -Tail 5 -ErrorAction SilentlyContinue
  exit 1
}

# PERSISTENCE (best-effort): without this a reboot/logout kills the device for
# good — the same dead-Mac lesson launchd/systemd cover on the other platforms.
# Starts ARGLESS: the daemon reads state\dial.json (no token in any task XML).
$persist = 'none (re-run this command after a reboot)'
try {
  $task = "VibeSpaceDevice-$dialHost"
  # NB: never name this $args — that's a PowerShell automatic variable
  $taskArgs = "/c set VIBESPACE_DEVICE_ROOT=$root&& set VIBESPACE_AGENTD_ROOT=$root&& `"$nodeExe`" `"$current\vibespace-device.js`""
  $a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $taskArgs
  $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $task -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Force | Out-Null
  $persist = "scheduled task '$task' (starts at logon)"
} catch { Write-Host "   (no scheduled task: $_)" }

Write-Host "OK vibespace device agent running (pid $($p.Id)). Restart after reboot: $persist"
Write-Host "  Log:  $root\state\agentd.out"
Write-Host "  Stop: Stop-Process -Id $($p.Id)"
Write-Host "  Uninstall: Remove-Item -Recurse -Force '$root'   (removes the agent AND its private Node)"
