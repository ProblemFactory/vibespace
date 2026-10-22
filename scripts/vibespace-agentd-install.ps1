# vibespace-agentd standalone installer (Windows, EXPERIMENTAL) — run this
# machine as a VibeSpace dial-out device. Nothing to install first: Node is
# downloaded (and checksum-verified) into the install root when the machine
# has none. Usage (from the pairing dialog):
#   & ([scriptblock]::Create((iwr -UseBasicParsing <vibespace>/agentd-install.ps1).Content)) `
#     -BundleUrl <vibespace>/agentd.js -Dial wss://<host>/api/agentd-dial?device=<id> `
#     -DialToken <vsdt_…> -HostToken <vsht_…> -Allow run,files,sessions,upgrade
# -Allow (lane device-allow-flags, design q-042 D5): what the VibeSpace may do on THIS machine — all, none, or some of
# run, files, input, socks, lan, sessions, upgrade → <root>\state\policy.json; only running this again here changes it.
# (a scriptblock's parameters live inside this PowerShell — no process's command line carries the tokens; the
#  dial check gets the token in its environment and the daemon starts argless — verify-r3 B-inst)
# -NodeExe <path> forces a specific node.exe and skips discovery/provisioning.
param(
  [Parameter(Mandatory=$true)][string]$BundleUrl,
  [Parameter(Mandatory=$true)][string]$Dial,
  [Parameter(Mandatory=$true)][string]$DialToken,
  [Parameter(Mandatory=$true)][string]$HostToken,
  [string]$NodeExe,
  [string]$Allow,
  [switch]$NoCheck,
  [switch]$NoElevate
)
$ErrorActionPreference = 'Stop'
# PS 5.1 defaults to TLS 1.0 — nodejs.org (and most CDNs) refuse it
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# IWR's progress bar makes a 30MB download take minutes on PS 5.1
$ProgressPreference = 'SilentlyContinue'

# THE DIAL ADDRESS IS CHECKED BEFORE ANYTHING IS WRITTEN (lane-pairing ⑤, the bash installer's twin): the scheme
# here, before anything is fetched; the daemon's own dial (--dial-check) once the bundle is on disk.
if ($Dial -notmatch '^wss?://') { Write-Host "x the dial address must start with ws:// or wss:// - got: $Dial"; exit 2 }

$hubId = ''; $t0ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()   # lane mac-repair-retires-stale: the hub's id + when this run began
# the pin — v22.23.4 = the Node.js security releases of 2026-10-21 (the hub's floor table, src/device-runtime.js, names them)
$NodeVersion = if ($env:VIBESPACE_NODE_VERSION) { $env:VIBESPACE_NODE_VERSION } else { 'v22.23.4' }
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
function Install-PrivateNode([string]$rootDir, [string]$replacing = '') {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' }
          elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  if ($arch -eq 'x86') { throw 'no official Node build for 32-bit Windows - install Node 18+ (winget install OpenJS.NodeJS.LTS)' }
  $zip = "node-$NodeVersion-win-$arch.zip"
  $tmp = Join-Path $rootDir '.node-dl'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    if ($replacing) { Write-Host "-> installing Node $NodeVersion in place of this install's own $replacing" }
    else { Write-Host "-> no usable Node 18+ found - installing a private one into $rootDir\node (~30MB)" }
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
    $dest = Join-Path $rootDir 'node'; $prev = Join-Path $rootDir 'node.old'
    if (Test-Path $prev) { Remove-Item $prev -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $dest) { Move-Item $dest $prev }        # a node.exe still running from it refuses the move: nothing changed
    try { Move-Item $src $dest } catch { if (Test-Path $prev) { Move-Item $prev $dest }; throw }   # commit (or the old one back)
    if (Test-Path $prev) { Remove-Item $prev -Recurse -Force -ErrorAction SilentlyContinue }
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
# PowerShell names are case-blind: `$nodeExe` below IS the -NodeExe parameter — keep what was passed before it is reused
# (lane device-node-version: the `= $null` wiped it, so a -NodeExe was never tried)
$nodeArg = $NodeExe
$nodeExe = $null
foreach ($c in @($nodeArg, $privNode, (Get-Command node -ErrorAction SilentlyContinue).Source,
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
try { Invoke-WebRequest -UseBasicParsing -Uri $BundleUrl -OutFile (Join-Path $root "$ver\vibespace-device.js") }
catch { Write-Host "x could not fetch $BundleUrl - this device cannot reach that address. -> pick an address this device can reach, in the pairing dialog"; exit 12 }
# 'current' as a junction (no admin needed, unlike symlinks)
$current = Join-Path $root 'current'
if (Test-Path $current) { Remove-Item $current -Force -Recurse -ErrorAction SilentlyContinue }
cmd /c mklink /J "$current" (Join-Path $root $ver) | Out-Null

# THE DIAL CHECK (lane-pairing ⑤): the daemon's own dial, once, with a probe header — the server answers 200 and
# registers nothing. A failure prints its class + the remedy and exits BEFORE the host token, dial.json or the
# scheduled task are written (the same exit codes as the bash installer). -NoCheck skips it.
if (-not $NoCheck) {
  $dhost = ([uri]($Dial -replace '^ws','http')).Authority
  Write-Host "-> checking that this device can dial $dhost..."
  $env:VIBESPACE_DEVICE_ROOT = $root; $env:VIBESPACE_AGENTD_ROOT = $root
  # verify-r3 B-inst: the token in the check's ENVIRONMENT, never its command line (another process can read a
  # command line); removed at once so nothing started later inherits it
  $env:VIBESPACE_DIAL_TOKEN = $DialToken
  try { $checkOut = & $nodeExe "$current\vibespace-device.js" --dial-check $Dial 2>&1; $checkRc = $LASTEXITCODE }
  finally { Remove-Item Env:VIBESPACE_DIAL_TOKEN -ErrorAction SilentlyContinue }
  $checkOut | ForEach-Object { Write-Host "  $_" }
  if ($checkRc -ne 0) {
    Write-Host "x nothing was installed - the device cannot dial ${dhost}: $(@($checkOut)[0])"
    exit $checkRc
  }
  # lane mac-repair-retires-stale: the hub names itself in its answer (an older hub does not) — kept in dial.json below
  foreach ($l in @($checkOut)) { if ("$l" -match '^hub id: (vh-[0-9a-f]{16})$') { $hubId = $Matches[1]; break } }
}

# THE ALLOW LIST (lane device-allow-flags): the agent's own parser writes state\policy.json — BEFORE the host token,
# dial.json or the task: an unknown flag stops here (exit 2) with nothing installed
if ($Allow) {
  $env:VIBESPACE_DEVICE_ROOT = $root; $env:VIBESPACE_AGENTD_ROOT = $root
  & $nodeExe "$current\vibespace-device.js" --write-policy $Allow
  if ($LASTEXITCODE -ne 0) { Write-Host "x nothing was installed - the -Allow list was refused (above)"; exit 2 }
}

Set-Content -NoNewline -Path (Join-Path $root 'state\token') -Value $HostToken
Write-Host "-> host token at $root\state\token"
# THE RELEASE-KEY PIN RESETS (design q-042 D2): a (re-)pair = a new trust-on-first-use; the new bundle pins ITS keys at its first start
Remove-Item (Join-Path $root 'state\trusted-keys.json') -Force -ErrorAction SilentlyContinue
# ...and the version floor with it (fix r2: the newest version this install ran — a re-pair may land an older hub's agent)
Remove-Item (Join-Path $root 'state\release-floor.json') -Force -ErrorAction SilentlyContinue

# Persist the dial config like the bash installer does: a 2.170+ daemon re-reads
# it on every dial attempt, so it can be started ARGLESS (the scheduled task
# below) and a re-pair heals a running daemon.
$dialCfg = @{ url = $Dial; token = $DialToken }; if ($hubId) { $dialCfg.hub = $hubId }   # + the hub's id (lane mac-repair-retires-stale)
$dialJson = ($dialCfg | ConvertTo-Json -Compress)
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

# THE PIN MOVED (lane device-node-version — the bash installer's twin): this install's OWN node older than the pin is
# replaced HERE, after the take-over (Windows will not move a folder whose node.exe is running); a failed download or a
# folder still in use keeps the one it had (said, not fatal). A node this machine had is never touched.
if (-not $nodeArg -and $nodeExe -eq $privNode) {
  $privV = "$(& $privNode -v 2>$null)".Trim()
  if ($privV -match '^v\d+\.\d+\.\d+$' -and [version]($privV.TrimStart('v')) -lt [version]($NodeVersion.TrimStart('v'))) {
    Write-Host "-> this install's own Node $privV is older than the pinned $NodeVersion - replacing it"
    try { $null = Install-PrivateNode $root $privV }
    catch { Write-Host "   ! Node $NodeVersion could not be installed - keeping $privV for now (run this command again to retry): $_" }
  }
}

Write-Host "-> starting daemon with dial-out to $Dial"
$out = Join-Path $root 'state\agentd.out'
# child inherits process env (Start-Process -Environment needs PS 7.3+; this
# way works on the Windows-default 5.1 too)
$env:VIBESPACE_DEVICE_ROOT = $root; $env:VIBESPACE_AGENTD_ROOT = $root
# ARGLESS (verify-r3 B-inst): the daemon reads state\dial.json written above — the token never rides its command line
# (a self-upgrade re-exec carries every original flag, so it stayed there for the daemon's whole life)
# the script path quoted FOR NODE: PS 5.1's Start-Process joins -ArgumentList unquoted (a space in the profile path split it)
$p = Start-Process -PassThru -WindowStyle Hidden $nodeExe -ArgumentList @("`"$current\vibespace-device.js`"") `
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
# HIDDEN (lane win-device-boot-hidden): the action is a hidden PowerShell that runs the first launch above at every logon
# (Start-Process -WindowStyle Hidden). It was `cmd.exe /c ... node`: a console program a task starts gets a console of its
# own, Windows 11 hands it to Windows Terminal, and the daemon lived in that window (closing it ended the agent). The
# daemon builds the SAME text (src/agentd/hidden-start.js logonTaskArgs) and re-registers an old install's task with it.
# A PowerShell single-quoted literal (the curly single quotes PowerShell also reads as quotes are doubled too)
function Quote-Ps([string]$s) { return "'" + ($s -replace '[''\u2018\u2019\u201A\u201B]', '$0$0') + "'" }
# lane win-input-elevated: am I (the installer) already elevated? A function so a test can stub it (IsInRole is a .NET call).
function Test-VsAdmin { return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
$persist = 'none (re-run this command after a reboot)'
try {
  $task = "VibeSpaceDevice-$dialHost"
  # NB: never name this $args — that's a PowerShell automatic variable
  $launch = '$env:VIBESPACE_DEVICE_ROOT=' + (Quote-Ps $root) + '; $env:VIBESPACE_AGENTD_ROOT=' + (Quote-Ps $root) +
    '; Start-Process -WindowStyle Hidden -FilePath ' + (Quote-Ps $nodeExe) + ' -ArgumentList ([char]34+' + (Quote-Ps "$current\vibespace-device.js") + '+[char]34)' +
    ' -RedirectStandardOutput ' + (Quote-Ps "$root\state\agentd.out") + ' -RedirectStandardError ' + (Quote-Ps "$root\state\agentd.err")
  $taskArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $launch + '"'
  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
  $s = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  # ELEVATION (lane win-input-elevated): BY DEFAULT the device agent runs with highest privileges (RunLevel Highest) so that
  # when an agent types into a window the person opened AS ADMINISTRATOR the input is not dropped by Windows UIPI. Registering a
  # Highest task needs admin, so we ask the OS's OWN consent ONCE (Start-Process -Verb RunAs — the person clicks the UAC dialog;
  # the product never elevates silently and never touches the consent UI). The elevated child gets only the task name, the
  # SECRET-FREE argument string and the user id — never a token (the task is argless). A declined consent (or -NoElevate) ⇒ the
  # task is registered at the normal level and the machine card offers 「Run as administrator…」.
  $me = "$env:USERDOMAIN\$env:USERNAME"
  $highest = $false
  if (-not $NoElevate -and (Test-VsAdmin)) {
    try { $p = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Highest; Register-ScheduledTask -TaskName $task -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Principal $p -Force | Out-Null; $highest = $true } catch { $highest = $false }
  } elseif (-not $NoElevate) {
    try {
      $reg = '$ErrorActionPreference=''Stop''; $a = New-ScheduledTaskAction -Execute ''powershell.exe'' -Argument ' + (Quote-Ps $taskArgs) + '; $s = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; $p = New-ScheduledTaskPrincipal -UserId ' + (Quote-Ps $me) + ' -LogonType Interactive -RunLevel Highest; Register-ScheduledTask -TaskName ' + (Quote-Ps $task) + ' -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Principal $p -Force | Out-Null'
      $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($reg))
      $proc = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$enc
      $highest = ($proc.ExitCode -eq 0) -and (((Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue).Principal.RunLevel) -eq 'Highest')
    } catch { $highest = $false }
  }
  if (-not $highest) { Register-ScheduledTask -TaskName $task -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Force | Out-Null }
  if ($highest) { $persist = "scheduled task '$task' (starts at logon, hidden, RUNS AS ADMINISTRATOR)" }
  elseif ($NoElevate) { $persist = "scheduled task '$task' (starts at logon, hidden; normal rights — you chose a normal install)" }
  else { $persist = "scheduled task '$task' (starts at logon, hidden; normal rights — UAC was declined; use 'Run as administrator...' on the machine card to raise it)" }
} catch { Write-Host "   (no scheduled task: $_)" }

Write-Host "OK vibespace device agent running (pid $($p.Id)). Restart after reboot: $persist"
Write-Host "  Log:  $root\state\agentd.out"
Write-Host "  Stop: Stop-Process -Id $($p.Id)"
Write-Host "  Uninstall: Remove-Item -Recurse -Force '$root'   (removes the agent AND its private Node)"

# RETIRE THE OLDER INSTALLS OF THIS HUB (lane mac-repair-retires-stale, B-06e9 — the bash installer's twin): a sibling root
# whose state\dial.json names the SAME hub (or, when neither knows its hub, the same device id) is this machine's older
# pairing of this hub — its scheduled task is exported to ~\.vibespace\disabled-launchagents\ and unregistered (never
# lost), the agent holding its state\agentd.lock is stopped only when that pid's command line names vibespace-device, the
# root and its state stay. Only once THIS install is live (the dial check passed and the new daemon dialed in — its
# state\dial-status.json connectedAt falls in this run). Another hub's install is kept; an unknown one is LISTED with its
# exact stop command, never touched.
function Get-VsDial([string]$dir) {
  $o = @{ hub = ''; dev = '' }
  try {
    $j = Get-Content -Raw (Join-Path $dir 'state\dial.json') -ErrorAction Stop | ConvertFrom-Json
    if ($j.hub -match '^vh-[0-9a-f]{16}$') { $o.hub = $j.hub }
    if ($j.url -match '[?&]device=([^&]+)') { $o.dev = [uri]::UnescapeDataString($Matches[1]) }
  } catch { }
  return $o
}
function Test-VsDialedIn {
  try { $s = Get-Content -Raw (Join-Path $root 'state\dial-status.json') -ErrorAction Stop | ConvertFrom-Json; return ([double]$s.connectedAt -ge $t0ms) } catch { return $false }
}
if (-not $NoCheck) {
  $vsDir = Join-Path $env:USERPROFILE '.vibespace'
  $sibs = @(Get-ChildItem $vsDir -Directory -Filter 'device@*' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne (Split-Path $root -Leaf) -and $_.Name -match '^device@[A-Za-z0-9._-]+$' })
  if ($sibs.Count -gt 0) {
    $i = 0; while ($i -lt 20 -and -not (Test-VsDialedIn)) { Start-Sleep -Seconds 1; $i++ }
    if (-not (Test-VsDialedIn)) {
      Write-Host '-> older installs on this machine were NOT retired: this install has not dialed in yet - run this command again once its row reads connected'
    } else {
      $me = Get-VsDial $root
      $dis = Join-Path $vsDir 'disabled-launchagents'
      $retired = @(); $other = @(); $unknown = @()
      foreach ($sb in $sibs) {
        $them = Get-VsDial $sb.FullName
        $verdict = if ($them.hub -and $me.hub) { if ($them.hub -eq $me.hub) { 'retire' } else { 'other' } } elseif (-not $them.hub -and -not $me.hub -and $them.dev -and $them.dev -eq $me.dev) { 'retire' } else { 'unknown' }
        $x = $sb.Name.Substring(7); $tn = "VibeSpaceDevice-$x"; $lk = Join-Path $sb.FullName 'state\agentd.lock'
        if ($verdict -eq 'retire') {
          # the task FIRST (it would start the agent again at the next logon), its definition set aside
          $t = Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue
          if ($t) {
            New-Item -ItemType Directory -Force -Path $dis | Out-Null
            $xml = Join-Path $dis "$tn.xml"; if (Test-Path $xml) { $xml = Join-Path $dis "$tn.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).xml" }
            try { Export-ScheduledTask -TaskName $tn | Set-Content -Path $xml -Encoding Unicode; Unregister-ScheduledTask -TaskName $tn -Confirm:$false } catch { Write-Host "   (could not set the task $tn aside: $_)" }
          }
          $sp = (Get-Content $lk -ErrorAction SilentlyContinue) -as [int]
          if ($sp) {
            $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$sp" -ErrorAction SilentlyContinue).CommandLine
            if ($cl -like '*vibespace-device*') { Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue }
          }
          $retired += $sb.Name
        } elseif ($verdict -eq 'other') { $other += $sb.Name }
        else { $unknown += "    $($sb.Name) - stop it with: Unregister-ScheduledTask -TaskName '$tn' -Confirm:`$false; Stop-Process -Id (Get-Content `"`$env:USERPROFILE\.vibespace\$($sb.Name)\state\agentd.lock`")" }
      }
      if ($retired.Count -gt 0) {
        $w1 = if ($retired.Count -eq 1) { '1 older install' } else { "$($retired.Count) older installs" }
        Write-Host "-> retired $w1 of this hub: $($retired -join ', ') (kept under ~\.vibespace; their scheduled tasks moved to ~\.vibespace\disabled-launchagents\)"
      }
      if ($unknown.Count -gt 0) { Write-Host '-> older installs I cannot attribute, not touched:'; $unknown | ForEach-Object { Write-Host $_ } }
      if ($other.Count -gt 0) { Write-Host "-> kept: $($other -join ', ') (another VibeSpace's install on this machine)" }
    }
  }
}
