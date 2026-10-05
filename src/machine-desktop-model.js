'use strict';
/**
 * A PAIRED WINDOWS / macOS MACHINE'S WHOLE DESKTOP (design 014 D1) — the platforms, the stream id namespace
 * (`machineDesktopId`), the picker row, the "Run on its desktop" plan (`desktopRunPlan`, `psQuote`), its remembered
 * presets and the TightVNC MSI plan. PURE: asks only src/hidden-chars.js. Moved verbatim out of src/desktop-apps.js
 * (rv-desktop-apps F-S1, lane dc-seams-desktop 2026-10-05) so src/lib/machine-desktop.js bundles this family alone;
 * src/desktop-apps.js re-exports every name.
 */
const HC = require('./hidden-chars.js'); // verify r1 (design 014 D1): THE hidden-character set — a command run on a machine's desktop asks it

// ── design 014 D1 (lane desktop-vnc-native, 2026-10-03): a Windows / macOS paired machine's WHOLE DESKTOP ───────────
/** The platforms whose paired machines get "Its desktop" — their OWN whole-screen VNC server (the `vnc-native` rung,
 *  src/desktop-display.js VNC_NATIVE: macOS Screen Sharing, a TightVNC service on Windows) — instead of per-app
 *  windows: neither has X11, and neither can capture one app's window. */
const DESKTOP_PLATFORMS = Object.freeze(['darwin', 'win32']);
/** Where that server listens on the machine (its loopback; the hub reaches it through the agent's tcp-connect). */
const MACHINE_DESKTOP_PORT = 5900;
/** ONE desktop per machine: its stream id (the bridge's STREAM_RE alphabet — no ':' — within its 80 characters). */
const MACHINE_DESKTOP_PREFIX = 'machine-desktop.';
const MD_HOST_RE = /^[A-Za-z0-9._-]{1,64}$/;
function machineDesktopId(hostId) { const h = String(hostId || ''); return h !== 'local' && MD_HOST_RE.test(h) ? MACHINE_DESKTOP_PREFIX + h : null; }
function machineDesktopHost(id) { const s = String(id || ''); if (!s.startsWith(MACHINE_DESKTOP_PREFIX)) return null; const h = s.slice(MACHINE_DESKTOP_PREFIX.length); return h !== 'local' && MD_HOST_RE.test(h) ? h : null; }
/**
 * THE PICKER ROW OF A WINDOWS / macOS MACHINE (PURE; machinePickRow's branch for DESKTOP_PLATFORMS). `r.vnc` = the
 * hub's probe of the machine's 127.0.0.1:5900 (desktop-access probeDesktop → src/desktop-display.js rfbGreeting),
 * asked when the launcher opens — never on a timer. Every row carries `desktop: 'vnc-native'` (the launcher offers
 * "Its desktop", not an app list) and `setup` = the platform whose one-time setup the words name:
 *   desktop_ready  a VNC server answered with a sign-in the viewer speaks (`auth`: 'ard' = the Mac user's name and
 *                  password, 'password' = the VNC password, 'user' = a name + password, 'none')
 *   no_vnc         nothing usable answers (`why` = the probe's code) — the one-time setup is shown
 *   offline        the machine is not connected
 */
function desktopPickRow(r) {
  const base = { desktop: 'vnc-native', setup: r.platform };
  if (!r.connected) return { selectable: false, code: 'offline', ...base };
  const v = r.vnc && typeof r.vnc === 'object' ? r.vnc : null;
  if (v && v.ok) return { selectable: true, code: 'desktop_ready', ...base, auth: v.auth || null, authType: v.type == null ? null : v.type };
  return { selectable: true, code: 'no_vnc', ...base, why: v ? v.code || null : null };
}
/** The longest command "Run on its desktop…" takes (a command line, not a script). */
const RUN_LINE_MAX = 1000;
/** Characters a person cannot SEE in the box are src/hidden-chars.js's set (verify r1: this door spelled its own list and
 *  let 242 of them through — the tag block, U+034F, the Mongolian selectors, U+0600–0605…): asked strictly, like the exit
 *  door (no CR, no joiners; a tab is whitespace a person sees). The command shown must be the command that runs, so any
 *  of them is refused by name (its code point), never stripped. */
/** A PowerShell single-quoted literal: PowerShell reads ' and the three typographic single quotes alike, each doubled. */
const psQuote = (s) => `'${String(s).replace(/['\u{2018}\u{2019}\u{201a}\u{201b}]/gu, (q) => q + q)}'`;
/** The UTF-16LE base64 `powershell -EncodedCommand` reads (PURE, no Buffer — this module is bundled for the page too):
 *  a script handed over this way passes through no quoting layer at all. */
function psEncoded(script) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b = [];
  for (const ch of String(script)) {
    const cp = ch.codePointAt(0);
    const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
    for (const u of units) b.push(u & 0xff, u >> 8);
  }
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '=');
  }
  return out;
}
const PS_ARGV = Object.freeze(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
/**
 * "RUN ON ITS DESKTOP…" (PURE): the argv the machine's agent runs through its EXISTING `run-cmd` (argv form — the hub
 * names no shell line) so that the owner's command starts DETACHED on the logged-in desktop (the agent IS that user:
 * a logon task on Windows, a LaunchAgent on macOS) and run-cmd answers at once. The line runs WHOLE, as typed — `a &&
 * b` is one command — and `shown` is that line, character for character (the confirm step and the answer show it):
 *   darwin  /bin/sh -c 'nohup /bin/sh -lc "$1" …&' vibespace-run <line> — the line is a POSITIONAL argument (never
 *           pasted into a script), the login shell gives it the user's PATH, nohup + /dev/null detach it
 *   win32   powershell -EncodedCommand <Start-Process %ComSpec% '/d /s /c "<line>"'> — the line is a PowerShell
 *           single-quoted literal inside an encoded script, then cmd.exe parses it ONCE, exactly as typed at a prompt
 *           (`/s` strips only the outer quotes); Start-Process detaches it
 * Refused by name: not_desktop_machine (any other platform), empty, too_long, multi_line (CR / LF — one line only),
 * hidden_chars (naming the first code point).
 */
function desktopRunPlan(platform, line) {
  if (!DESKTOP_PLATFORMS.includes(platform)) return { ok: false, code: 'not_desktop_machine', error: `"Run on its desktop" is for Windows and macOS machines (this one runs ${platform || 'an unknown system'})` };
  if (typeof line !== 'string' || !line.trim()) return { ok: false, code: 'empty', error: 'type a command to run' };
  if (line.length > RUN_LINE_MAX) return { ok: false, code: 'too_long', error: `a command is at most ${RUN_LINE_MAX} characters (this one has ${line.length})` };
  if (/[\r\n]/.test(line)) return { ok: false, code: 'multi_line', error: 'one line only — a line break would start a second command' };
  const hid = HC.hiddenCharsOf(line, { max: 1 });
  if (hid.length) return { ok: false, code: 'hidden_chars', error: `the command holds an invisible character (${hid[0]}) — what runs must be what you see; retype it` };
  if (platform === 'darwin') return { ok: true, platform, shown: line, argv: ['/bin/sh', '-c', 'nohup /bin/sh -lc "$1" </dev/null >/dev/null 2>&1 &', 'vibespace-run', line] };
  const script = `$ErrorActionPreference = 'Stop'; try { Start-Process -FilePath $env:ComSpec -WindowStyle Minimized -ArgumentList ('/d /s /c "' + ${psQuote(line)} + '"') } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return { ok: true, platform, shown: line, argv: [...PS_ARGV, psEncoded(script)] };
}
/** The box's presets per platform (design 014: "presets: Blender"), then up to RUN_REMEMBER_MAX of the owner's own
 *  recent commands on that machine (the page remembers them; each is re-judged by desktopRunPlan before it is offered). */
const DESKTOP_RUN_PRESETS = Object.freeze({ darwin: Object.freeze([Object.freeze({ label: 'Blender', cmd: 'open -a Blender' })]), win32: Object.freeze([Object.freeze({ label: 'Blender', cmd: 'start "" blender' })]) });
const RUN_REMEMBER_MAX = 3;
function desktopRunPresets(platform, remembered = []) {
  const fixed = DESKTOP_RUN_PRESETS[platform] || [];
  const seen = new Set(fixed.map((p) => p.cmd));
  const mine = [];
  for (const c of Array.isArray(remembered) ? remembered : []) {
    if (mine.length >= RUN_REMEMBER_MAX) break;
    if (typeof c !== 'string' || seen.has(c) || !desktopRunPlan(platform, c).ok) continue;
    seen.add(c); mine.push({ label: c, cmd: c, remembered: true });
  }
  return [...fixed.map((p) => ({ ...p })), ...mine];
}
/** The remembered list after `cmd` ran (newest first, no duplicates, at most RUN_REMEMBER_MAX). */
function rememberRun(list, cmd) { return [cmd, ...(Array.isArray(list) ? list : []).filter((c) => typeof c === 'string' && c !== cmd)].slice(0, RUN_REMEMBER_MAX); }
/**
 * THE WINDOWS ONE-TIME SETUP: TightVNC Server, a CLOSED table (design 014 §2 piece 1; the owner's option A,
 * 2026-10-03). The MSI is pinned by URL + SHA-256 (measured 2026-10-03: 2,531,328 bytes). The FLAGS: the server half
 * only, as a service; NO firewall exception and NO HTTP (Java viewer) port; loopback connections ALLOWED (TightVNC
 * refuses them by default — the agent's forward is one) and ONLY loopback (nothing on the network); the RFB port
 * 5900; VNC password authentication on. The password is NOT in the table: the owner types it on that machine, into
 * the elevated window, and VibeSpace never carries it.
 */
const TIGHTVNC = Object.freeze({
  id: 'tightvnc', label: 'TightVNC Server 2.8.85', version: '2.8.85',
  url: 'https://www.tightvnc.com/download/2.8.85/tightvnc-2.8.85-gpl-setup-64bit.msi',
  sha256: 'd8fbed7b27ebab86df6f780f6e86f723668f3715cee521ccaa4568812aef5f3e', bytes: 2531328,
  flags: Object.freeze(['ADDLOCAL=Server', 'SERVER_REGISTER_AS_SERVICE=1', 'SERVER_ADD_FIREWALL_EXCEPTION=0', 'SERVER_ALLOW_SAS=1',
    'SET_ACCEPTHTTPCONNECTIONS=1', 'VALUE_OF_ACCEPTHTTPCONNECTIONS=0', 'SET_ALLOWLOOPBACK=1', 'VALUE_OF_ALLOWLOOPBACK=1',
    'SET_LOOPBACKONLY=1', 'VALUE_OF_LOOPBACKONLY=1', 'SET_RFBPORT=1', 'VALUE_OF_RFBPORT=5900',
    'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=1', 'SET_PASSWORD=1']),
});
/** The exit the unelevated starter answers when Windows granted no administrator rights (UAC declined / nobody there). */
const TIGHTVNC_NO_ADMIN_EXIT = 5;
/**
 * THE TIGHTVNC PLAN (PURE; `f` = `{platform}` — the agent's hello, no facts op). The agent runs UNELEVATED (a logon
 * task without admin rights — scripts/vibespace-agentd-install.ps1), so the xpra door's "root or passwordless sudo"
 * has no Windows twin. `argv` asks Windows for elevation (UAC) ON THAT MACHINE'S SCREEN and waits: someone there
 * clicks Yes, then types the VNC password into the elevated window; `commands` = that window's script — the same
 * lines a person pastes into an administrator PowerShell when nobody can click (no_admin). The script checks the
 * download's SHA-256 before running it and, after the install, that 5900 listens on loopback addresses only.
 * verify r1 F2: the MSI lands in a directory ONLY administrators can write (created with a protected ACL — %TEMP% of an
 * elevated window is the signed-in user's, so any process of that user, an agent's `vibespace-exit run` included, could
 * swap the checked file while the person typed the password: an administrator install of anything); the hash is checked
 * again right before msiexec. F3: a TightVNC found listening beyond loopback is STOPPED and disabled, not only reported.
 *   → { ok:true, what:'tightvnc', label, source, packages, url, sha256, flags, commands, argv, uac:true, canRun:true }
 *   → { ok:false, code: no_facts | not_windows, error }
 */
function tightvncInstallPlan(f) {
  const platform = f && typeof f === 'object' ? f.platform : null;
  if (!platform) return { ok: false, code: 'no_facts', error: 'the machine did not say what it runs — reconnect it' };
  if (platform !== 'win32') return { ok: false, code: 'not_windows', error: platform === 'darwin' ? 'a Mac needs no install — turn on Screen Sharing in System Settings → General → Sharing' : 'TightVNC is the one-time setup of a Windows machine' };
  const T = TIGHTVNC, P = MACHINE_DESKTOP_PORT;
  const commands = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  $acl = New-Object Security.AccessControl.DirectorySecurity',
    '  $acl.SetAccessRuleProtection($true, $false)',
    "  foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))) }",
    "  $dir = Join-Path (Join-Path $env:SystemRoot 'Temp') ('vibespace-tightvnc-' + [guid]::NewGuid().ToString('N'))",
    '  $null = [IO.Directory]::CreateDirectory($dir, $acl)',
    `  $msi = Join-Path $dir 'tightvnc-${T.version}-gpl-setup-64bit.msi'`,
    `  Write-Host 'Downloading ${T.label} from ${T.url}'`,
    `  Invoke-WebRequest -UseBasicParsing -Uri '${T.url}' -OutFile $msi`,
    `  if ((Get-FileHash -Algorithm SHA256 $msi).Hash -ne '${T.sha256.toUpperCase()}') { throw 'the download is not ${T.label} (its SHA-256 differs) - nothing was installed' }`,
    "  $s = Read-Host 'Choose the VNC password for this machine (up to 8 characters; VibeSpace never sees it)' -AsSecureString",
    '  $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))',
    `  if (-not $p -or $p.Contains('"')) { throw 'the password must not be empty or hold a double quote - nothing was installed' }`,
    `  if ((Get-FileHash -Algorithm SHA256 $msi).Hash -ne '${T.sha256.toUpperCase()}') { throw 'the download changed after it was checked - nothing was installed' }`,
    `  $r = Start-Process msiexec.exe -Wait -PassThru -ArgumentList ('/i "' + $msi + '" /qn /norestart ${T.flags.join(' ')} VALUE_OF_PASSWORD="' + $p + '"')`,
    '  $p = $null; $s = $null; Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue',
    "  if ($r.ExitCode -ne 0 -and $r.ExitCode -ne 3010) { throw ('msiexec exited ' + $r.ExitCode) }",
    '  Start-Sleep -Seconds 3',
    `  $l = @(Get-NetTCPConnection -LocalPort ${P} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalAddress })`,
    `  if (-not $l.Count) { throw 'TightVNC is installed, but nothing listens on port ${P}' }`,
    "  if (@($l | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count) { Stop-Service tvnserver -Force -ErrorAction SilentlyContinue; Set-Service tvnserver -StartupType Disabled -ErrorAction SilentlyContinue; throw ('TightVNC listened on ' + ($l -join ', ') + ' - not on this machine only, so it was stopped and disabled: check its Access Control settings') }",
    "  Write-Host ('TightVNC listens on ' + ($l -join ', ') + ' - this machine only. Done; this window closes in 10 s.')",
    '  Start-Sleep -Seconds 10',
    "} catch { Write-Host ('FAILED: ' + $_.Exception.Message); Start-Sleep -Seconds 30; exit 1 }",
  ];
  const starter = [
    "$ErrorActionPreference = 'Stop'",
    `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${psEncoded(commands.join('\n'))}' }`,
    `catch { Write-Output ('Windows granted no administrator rights: ' + $_.Exception.Message); exit ${TIGHTVNC_NO_ADMIN_EXIT} }`,
    "Write-Output ('the administrator window ended with exit ' + $p.ExitCode)",
    'exit $p.ExitCode',
  ];
  return { ok: true, what: T.id, label: T.label, source: 'tightvnc.com', packages: [T.label], url: T.url, sha256: T.sha256, flags: T.flags.slice(), commands, argv: [...PS_ARGV, psEncoded(starter.join('\n'))], uac: true, canRun: true, code: null, error: null };
}

/** THE TIGHTVNC INSTALLABLE (src/installs.js registers it): planned from the agent's hello (`from: 'hello'`, no facts op),
 *  people only (`humanOnly` — an agent token is refused at the route), refused by name on this machine (`local`), done
 *  once the machine's 5900 answers as a VNC server (`done: 'vnc'`). */
const TIGHTVNC_INSTALL = Object.freeze({ id: TIGHTVNC.id, from: 'hello', humanOnly: true, local: Object.freeze({ code: 'not_windows', error: 'TightVNC is the one-time setup of a paired Windows machine' }), plan: tightvncInstallPlan, done: 'vnc' });

module.exports = {
  DESKTOP_PLATFORMS, MACHINE_DESKTOP_PORT, MACHINE_DESKTOP_PREFIX, machineDesktopId, machineDesktopHost, desktopPickRow, RUN_LINE_MAX, psQuote, psEncoded, desktopRunPlan, DESKTOP_RUN_PRESETS, RUN_REMEMBER_MAX, desktopRunPresets, rememberRun, TIGHTVNC, TIGHTVNC_NO_ADMIN_EXIT, tightvncInstallPlan, TIGHTVNC_INSTALL,
};
