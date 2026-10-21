'use strict';
/**
 * 「安装虚拟麦克风」 + ITS UNINSTALL DOOR (lane stream-mic-road, backlog B-7af0; the measured facts: lane stream-mic-wheel-probe) —
 * the setup row's PURE plans, the TightVNC row's shape (src/machine-desktop-model.js tightvncInstallPlan: what it installs, from
 * where, the pinned SHA-256 + signer, what the person sees, the script shown before Install), registered in src/installs.js.
 * Its own module, beside src/machine-desktop-model.js and NOT in it: the device agent bundles that one (src/installed-apps.js asks
 * its run door), and a Mac's plan drives `osascript` — the agent bundle never carries that word (lane mac-window-list-helper's
 * law, test-stream-mac §7). PURE: asks only src/mic-model.js (the tables) and src/machine-desktop-model.js (psEncoded, PS_ARGV,
 * the no-admin exit). The hub's install door runs these plans on the machine through its agent (src/server/desktop-access.js).
 */
const MIC = require('./mic-model.js');
const { psEncoded, PS_ARGV, TIGHTVNC_NO_ADMIN_EXIT } = require('./machine-desktop-model.js');
// ── 「安装虚拟麦克风」 — the viewer's voice as a
// MICROPHONE every app on the machine can pick. The tables + the machine's state are src/mic-model.js; these are the setup
// row's plans (the TightVNC row's shape: what it installs, from where, the pinned SHA-256 + signer, what the person sees, the
// script shown before Install), registered in src/installs.js. Installing a driver is the OWNER's act: the plan asks the
// machine's own prompt (Windows' UAC / the Mac's administrator password dialog) on its own screen. Nothing here restarts it.
/** The exit a starter answers when the person said no / nobody was there (Windows' UAC declined — TightVNC's 5; the Mac's
 *  password dialog cancelled) and when the Mac's dialog waited out MIC_LIMITS.macWaitSec with no password (withdrawn). */
const MIC_NO_ADMIN_EXIT = TIGHTVNC_NO_ADMIN_EXIT;
const MIC_NO_PASSWORD_EXIT = 6;
const MIC_INSTALL_ID = 'virtual-mic', MIC_REMOVE_ID = 'virtual-mic-remove';
/** The unelevated starter's default-device reader / writer (IPolicyConfig — the probe's measured restore): Windows moves the
 *  default speaker AND microphone to the cable when it installs (measured: the owner's sound went into CABLE Input). */
const WIN_DEFAULTS_CS = [
  "Add-Type -TypeDefinition @'",
  'using System; using System.Runtime.InteropServices;',
  'namespace VsMicDefaults {',
  '[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class En { }',
  '[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEn { [PreserveSig] int EnumAudioEndpoints(int f, int s, out IntPtr c); [PreserveSig] int GetDefaultAudioEndpoint(int f, int r, out IDev d); }',
  '[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDev { [PreserveSig] int Activate(ref Guid i, int c, IntPtr p, out IntPtr o); [PreserveSig] int OpenPropertyStore(int a, out IntPtr p); [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); }',
  '[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class Pc { }',
  '[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPc { [PreserveSig] int A(IntPtr a, IntPtr b); [PreserveSig] int B(IntPtr a, int b, IntPtr c); [PreserveSig] int C(IntPtr a); [PreserveSig] int D(IntPtr a, IntPtr b, IntPtr c); [PreserveSig] int E(IntPtr a, int b, IntPtr c, IntPtr d); [PreserveSig] int F(IntPtr a, IntPtr b); [PreserveSig] int G(IntPtr a, IntPtr b); [PreserveSig] int H(IntPtr a, IntPtr b); [PreserveSig] int I(IntPtr a, IntPtr b, IntPtr c); [PreserveSig] int J(IntPtr a, IntPtr b, IntPtr c); [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role); }',
  'public static class D {',
  '  public static string Get(int flow, int role) { IDev d; if (((IEn)new En()).GetDefaultAudioEndpoint(flow, role, out d) != 0) return ""; string id; return d.GetId(out id) == 0 ? id : ""; }',
  '  public static int Set(string id, int role) { return ((IPc)new Pc()).SetDefaultEndpoint(id, role); }',
  '} }',
  "'@",
];
const MIC_PROMPTS = Object.freeze({
  en: Object.freeze({ ours: 'VibeSpace wants to install the virtual microphone «VibeSpace Microphone». Core Audio restarts once: every sound stops for a second or two.', blackhole: 'VibeSpace wants to install BlackHole 2ch (Existential Audio, GPL-3) as this Mac\'s virtual microphone. Core Audio restarts once: every sound stops for a second or two.', remove: 'VibeSpace wants to remove the virtual microphone. Core Audio restarts once.' }),
  zh: Object.freeze({ ours: 'VibeSpace 想安装虚拟麦克风「VibeSpace Microphone」。Core Audio 会重启一次，所有声音停一两秒。', blackhole: 'VibeSpace 想安装 BlackHole 2ch（Existential Audio，GPL-3）作为这台 Mac 的虚拟麦克风。Core Audio 会重启一次，所有声音停一两秒。', remove: 'VibeSpace 想移除虚拟麦克风。Core Audio 会重启一次。' }),
  ja: Object.freeze({ ours: 'VibeSpace が仮想マイク「VibeSpace Microphone」をインストールします。Core Audio が一度再起動し、すべての音が 1〜2 秒止まります。', blackhole: 'VibeSpace がこの Mac の仮想マイクとして BlackHole 2ch（Existential Audio、GPL-3）をインストールします。Core Audio が一度再起動し、すべての音が 1〜2 秒止まります。', remove: 'VibeSpace が仮想マイクを削除します。Core Audio が一度再起動します。' }),
});
const promptOf = (lang, k) => (MIC_PROMPTS[lang] || MIC_PROMPTS.en)[k];
const RESTART_COREAUDIO = 'launchctl kickstart -kp system/com.apple.audio.coreaudiod || killall coreaudiod';
/** The Mac's unelevated starter (FIXED text — every name rides its env): BlackHole's pkg downloaded + checked first (SHA-256
 *  + its Developer ID team), then the administrator password dialog with our text — withdrawn after MIC_LIMITS.macWaitSec
 *  (nothing is copied before a password); the root script it runs is VS_MIC_ROOT_SH, shown above Install. */
const MAC_STARTER = [
  'set -u',
  'if [ "${VS_MIC_WHAT:-}" = blackhole ]; then',
  '  d=$(mktemp -d) || exit 1; VS_MIC_PKG="$d/BlackHole2ch-0.7.1.pkg"; export VS_MIC_PKG',
  `  echo 'Downloading ${MIC.BLACKHOLE.label} ${MIC.BLACKHOLE.version} from ${MIC.BLACKHOLE.url}'`,
  `  curl -fsSL -o "$VS_MIC_PKG" '${MIC.BLACKHOLE.url}' || { echo 'the download failed - nothing was installed'; exit 1; }`,
  `  [ "$(shasum -a 256 "$VS_MIC_PKG" | cut -d' ' -f1)" = '${MIC.BLACKHOLE.sha256}' ] || { echo 'the download is not BlackHole 2ch 0.7.1 (its SHA-256 differs) - nothing was installed'; exit 1; }`,
  `  pkgutil --check-signature "$VS_MIC_PKG" | grep -q '(${MIC.BLACKHOLE.teamId})' || { echo 'the download is not signed by Existential Audio - nothing was installed'; exit 1; }`,
  'fi',
  'echo "Waiting for the administrator password on the Mac (at most ${VS_MIC_WAIT}s)..."',
  'err=$(mktemp)',
  `osascript -e 'on run' -e 'set v to "VS_MIC_STAGE=" & quoted form of (system attribute "VS_MIC_STAGE") & " VS_MIC_SHA=" & quoted form of (system attribute "VS_MIC_SHA") & " VS_MIC_PKG=" & quoted form of (system attribute "VS_MIC_PKG")' -e 'do shell script v & " /bin/sh -c " & quoted form of (system attribute "VS_MIC_ROOT_SH") with administrator privileges with prompt (system attribute "VS_MIC_PROMPT")' -e 'end run' 2>"$err" &`,
  'pid=$!',
  '( sleep "$VS_MIC_WAIT"; kill $pid 2>/dev/null ) & w=$!',
  'wait $pid; rc=$?; kill $w 2>/dev/null',
  '[ -n "${VS_MIC_PKG:-}" ] && rm -rf "$(dirname "$VS_MIC_PKG")"',
  `if [ $rc -eq 0 ]; then echo 'Done - Core Audio restarted (every sound stopped for a second or two); the Mac does not restart.'; rm -f "$err"; exit 0; fi`,
  `if [ $rc -ge 128 ]; then echo 'No password was given in time - the dialog was withdrawn and nothing was installed.'; rm -f "$err"; exit ${MIC_NO_PASSWORD_EXIT}; fi`,
  `if grep -q '(-128)' "$err"; then echo 'The administrator password dialog was cancelled - nothing was installed.'; rm -f "$err"; exit ${MIC_NO_ADMIN_EXIT}; fi`,
  'cat "$err"; rm -f "$err"; exit 1',
];
/** The root scripts (FIXED text — the staged path, its SHA-256 and the pkg ride the env the dialog's AppleScript quotes). */
const MAC_ROOT = Object.freeze({
  ours: [
    `H='${MIC.VSMIC.halDir}'; B="$H/${MIC.VSMIC.bundle}"`,
    `rm -rf "$B" && cp -R "$VS_MIC_STAGE" "$H/" && chown -R root:wheel "$B" && [ "$(shasum -a 256 "$B/Contents/MacOS/${MIC.VSMIC.exe}" | cut -d' ' -f1)" = "$VS_MIC_SHA" ] || { rm -rf "$B"; echo 'the installed copy is not the checked build - removed, nothing was installed'; exit 3; }`,
    RESTART_COREAUDIO,
  ],
  blackhole: [
    't=$(mktemp -d /private/tmp/vibespace-mic.XXXXXX) && chmod 700 "$t" && cp "$VS_MIC_PKG" "$t/b.pkg" || exit 1',
    `[ "$(shasum -a 256 "$t/b.pkg" | cut -d' ' -f1)" = '${MIC.BLACKHOLE.sha256}' ] || { rm -rf "$t"; echo 'the download changed after it was checked - nothing was installed'; exit 3; }`,
    'installer -pkg "$t/b.pkg" -target /; rc=$?; rm -rf "$t"; exit $rc',
  ],
  'remove-ours': [`rm -rf '${MIC.VSMIC.halDir}/${MIC.VSMIC.bundle}' && { ${RESTART_COREAUDIO}; }`],
  'remove-blackhole': [`rm -rf '${MIC.VSMIC.halDir}/${MIC.BLACKHOLE.bundle}'; pkgutil --forget ${MIC.BLACKHOLE.pkgId} >/dev/null 2>&1; ${RESTART_COREAUDIO}`],
});
/** A Windows starter: snapshot the defaults (render + capture, every role), ask UAC for `elevated`, put back what moved (three
 *  passes 2 s apart — Windows moves them as the new endpoints appear), say so; `after` = its last lines (the record). */
function winMicStarter(elevated, after = []) {
  return [
    "$ErrorActionPreference = 'Stop'",
    ...WIN_DEFAULTS_CS,
    '$before = @{}; foreach ($f in 0, 1) { foreach ($r in 0, 1, 2) { $before["$f$r"] = [VsMicDefaults.D]::Get($f, $r) } }',
    `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${psEncoded(elevated.join('\n'))}' }`,
    `catch { Write-Output ('Windows granted no administrator rights - nothing was installed: ' + $_.Exception.Message); exit ${MIC_NO_ADMIN_EXIT} }`,
    "Write-Output ('the administrator window ended with exit ' + $p.ExitCode)",
    '$moved = 0; foreach ($pass in 1, 2, 3) { Start-Sleep -Seconds 2; foreach ($k in @($before.Keys)) { $id = $before[$k]; if (-not $id) { continue }; $f = [int]$k.Substring(0, 1); $r = [int]$k.Substring(1, 1); if ([VsMicDefaults.D]::Get($f, $r) -ne $id) { [void][VsMicDefaults.D]::Set($id, $r); $moved++ } } }',
    "Write-Output ('Kept your default speaker and microphone (' + $moved + ' put back after Windows moved them)')",
    ...after,
    'exit $p.ExitCode',
  ];
}
/** The WINDOWS PLAN's administrator window (the probe's mic-install.ps1, as TightVNC's: an admin-only directory, the
 *  download, the zip's SHA-256, the setup's SHA-256 + its signer, then `-i -h` — measured 12.2 s, exit 0). */
function winMicElevated() {
  const V = MIC.VBCABLE;
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  $acl = New-Object Security.AccessControl.DirectorySecurity',
    '  $acl.SetAccessRuleProtection($true, $false)',
    "  foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))) }",
    "  $dir = Join-Path (Join-Path $env:SystemRoot 'Temp') ('vibespace-vbcable-' + [guid]::NewGuid().ToString('N'))",
    '  $null = [IO.Directory]::CreateDirectory($dir, $acl)',
    `  $zip = Join-Path $dir '${V.pack}.zip'`,
    `  Write-Host 'VibeSpace installs VB-CABLE (${V.vendor}, ${V.license} - ${V.site}) so this machine gets a microphone VibeSpace can speak into.'`,
    `  Write-Host 'Downloading ${V.url}'`,
    `  Invoke-WebRequest -UseBasicParsing -Uri '${V.url}' -OutFile $zip`,
    `  if ((Get-FileHash -Algorithm SHA256 $zip).Hash -ne '${V.sha256.toUpperCase()}') { throw 'the download is not VB-CABLE Pack45 (its SHA-256 differs) - nothing was installed' }`,
    "  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $dir 'x')",
    `  $exe = Join-Path $dir 'x\\${V.setup}'`,
    '  $sig = Get-AuthenticodeSignature $exe',
    `  if ((Get-FileHash -Algorithm SHA256 $exe).Hash -ne '${V.setupSha256.toUpperCase()}' -or $sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch '${V.signer}') { throw 'the setup program is not the checked one - nothing was installed' }`,
    "  Write-Host 'Installing the driver (a few seconds; the setup may look stuck - that is normal)...'",
    "  $r = Start-Process -FilePath $exe -ArgumentList '-i', '-h' -WorkingDirectory (Join-Path $dir 'x') -Wait -PassThru",
    '  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue',
    "  if ($r.ExitCode -ne 0) { throw ('the VB-CABLE setup exited ' + $r.ExitCode) }",
    "  Write-Host 'Done. VB-CABLE asks for a restart to finish - the microphone works now; VibeSpace never restarts this machine. This window closes in 10 s.'",
    '  Start-Sleep -Seconds 10',
    "} catch { Write-Host ('FAILED: ' + $_.Exception.Message); Start-Sleep -Seconds 30; exit 1 }",
  ];
}
const MIC_RECORD_PS = "$d = Join-Path $env:USERPROFILE '.vibespace'"; // the record's folder (the agent's ~/.vibespace)
/**
 * THE 「安装虚拟麦克风」 PLAN (PURE; Leg 4 item 1). `f` = { platform (the agent's hello), mic (the `stream-mic` facts with
 * `prepare`: a Mac's staged plug-in), lang (the dialog's language — the Mac dialog's text) }.
 *   win32   VB-CABLE: ONE UAC prompt («Windows PowerShell — Microsoft Windows»), an administrator window for about 30 s, no
 *           driver dialog; the defaults snapshotted and put back («Kept your default speaker and microphone»); the restart note
 *   darwin  ours when the plug-in is staged (built on this Mac — its SHA-256 is checked again once root-owned), else
 *           BlackHole 2ch (downloaded from Existential Audio, SHA-256 + Developer ID checked; GPL-3 named) — the administrator
 *           password dialog with our text, a restart of Core Audio (every sound stops a second or two), no restart of the Mac
 *   → { ok, what, which, label, vendor, license, site, source, packages, url, sha256, signer, prompts, notes, commands,
 *       argv, env?, uac | adminDialog, canRun, after: 'mic' } | { ok: false, code, error }
 */
function virtualMicInstallPlan(f) {
  const platform = f && typeof f === 'object' ? f.platform : null;
  if (!platform) return { ok: false, code: 'no_facts', error: 'the machine did not say what it runs — reconnect it' };
  if (platform !== 'win32' && platform !== 'darwin') return { ok: false, code: 'unsupported', error: 'the virtual microphone is the one-time setup of a paired Windows or macOS machine' };
  const st = f.mic ? MIC.micStateOf(f.mic) : null;
  if (st && (st.state === 'installed' || st.state === 'reboot_owed')) return { ok: false, code: 'already_installed', error: `«${(st.mic && st.mic.name) || 'the virtual microphone'}» is already installed on this machine` };
  if (platform === 'win32') {
    const V = MIC.VBCABLE, commands = winMicElevated();
    const record = [`if ($p.ExitCode -eq 0) { ${MIC_RECORD_PS}; $null = New-Item -ItemType Directory -Force -Path $d; Set-Content -LiteralPath (Join-Path $d 'mic-installed.json') -Value ('{"at":' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '}') -Encoding ASCII }`];
    return { ok: true, what: MIC_INSTALL_ID, which: V.id, label: 'VB-CABLE', vendor: V.vendor, license: V.license, site: V.site, source: 'vb-audio.com', packages: [`${V.label} (${V.pack}, ${V.vendor}, ${V.license})`], url: V.url, sha256: V.sha256, setupSha256: V.setupSha256, signer: V.signer,
      prompts: ['uac', 'admin_window', 'no_driver_dialog'], notes: ['restart_owed', 'defaults_kept', 'donate'], commands, argv: [...PS_ARGV, psEncoded(winMicStarter(commands, record).join('\n'))], uac: true, canRun: true, code: null, error: null, after: 'mic' };
  }
  const stage = f.mic && f.mic.stage && f.mic.stage.ok && /^[0-9a-f]{64}$/.test(String(f.mic.stage.sha256 || '')) && typeof f.mic.stage.bundle === 'string' ? f.mic.stage : null;
  const lang = f.lang || 'en';
  if (stage) {
    const root = MAC_ROOT.ours;
    return { ok: true, what: MIC_INSTALL_ID, which: MIC.VSMIC.id, label: MIC.VSMIC.label, vendor: 'VibeSpace', license: null, site: null, source: 'built on this Mac', packages: [`${MIC.VSMIC.label} (${MIC.VSMIC.bundle}, built on this Mac, SHA-256 ${stage.sha256})`], url: null, sha256: stage.sha256, signer: 'ad-hoc (built on this Mac)',
      prompts: ['password', 'coreaudio_restart'], notes: ['no_mac_restart'], commands: root, argv: ['/bin/sh', '-c', MAC_STARTER.join('\n')],
      env: { VS_MIC_WHAT: 'ours', VS_MIC_STAGE: stage.bundle, VS_MIC_SHA: stage.sha256, VS_MIC_PKG: '', VS_MIC_ROOT_SH: root.join('\n'), VS_MIC_PROMPT: promptOf(lang, 'ours'), VS_MIC_WAIT: String(MIC.MIC_LIMITS.macWaitSec) },
      adminDialog: true, canRun: true, code: null, error: null, after: 'mic' };
  }
  const B = MIC.BLACKHOLE, root = MAC_ROOT.blackhole;
  return { ok: true, what: MIC_INSTALL_ID, which: B.id, label: B.label, vendor: B.vendor, license: B.license, site: B.site, source: 'existential.audio', packages: [`${B.label} ${B.version} (${B.vendor}, ${B.license})`], url: B.url, sha256: B.sha256, signer: B.signer,
    prompts: ['password', 'coreaudio_restart'], notes: ['no_mac_restart', 'fallback'], fallbackWhy: (f.mic && f.mic.stage && f.mic.stage.error) || null, commands: root, argv: ['/bin/sh', '-c', MAC_STARTER.join('\n')],
    env: { VS_MIC_WHAT: 'blackhole', VS_MIC_STAGE: '', VS_MIC_SHA: B.sha256, VS_MIC_PKG: '', VS_MIC_ROOT_SH: root.join('\n'), VS_MIC_PROMPT: promptOf(lang, 'blackhole'), VS_MIC_WAIT: String(MIC.MIC_LIMITS.macWaitSec) },
    adminDialog: true, canRun: true, code: null, error: null, after: 'mic' };
}
/**
 * THE UNINSTALL DOOR (Leg 4 item 5): what goes away, said. `f` as above (the facts say which is installed).
 *   win32   VB-CABLE's own setup in C:\Program Files\VB\CABLE (its signer checked) opens behind ONE UAC: the person presses
 *           «Remove Driver» there; Windows asks for a restart to finish
 *   darwin  the plug-in's bundle removed from /Library/Audio/Plug-Ins/HAL + Core Audio restarted (BlackHole: its pkg receipt
 *           forgotten too) — behind the administrator password dialog
 *   → the plan shape above (`removes` names what goes) | { ok: false, code: not_installed | …, error }
 */
function virtualMicRemovePlan(f) {
  const platform = f && typeof f === 'object' ? f.platform : null;
  if (!platform) return { ok: false, code: 'no_facts', error: 'the machine did not say what it runs — reconnect it' };
  if (platform !== 'win32' && platform !== 'darwin') return { ok: false, code: 'unsupported', error: 'the virtual microphone is the one-time setup of a paired Windows or macOS machine' };
  const st = f.mic ? MIC.micStateOf(f.mic) : null;
  if (!st || !(st.state === 'installed' || st.state === 'reboot_owed' || st.state === 'inactive')) return { ok: false, code: 'not_installed', error: 'this machine has no virtual microphone to remove' };
  if (platform === 'win32') {
    const V = MIC.VBCABLE;
    const commands = [
      "$ErrorActionPreference = 'Stop'",
      'try {',
      `  $exe = '${V.installDir}\\${V.setup}'`,
      `  if (-not (Test-Path -LiteralPath $exe)) { throw 'the VB-CABLE setup is not in ${V.installDir} - remove VB-CABLE from Settings > Apps' }`,
      '  $sig = Get-AuthenticodeSignature $exe',
      `  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch '${V.signer}') { throw 'the VB-CABLE setup there is not signed by VB-Audio - nothing was run' }`,
      "  Write-Host 'VB-CABLE opens its own window: press «Remove Driver» there. Windows asks for a restart to finish.'",
      `  $r = Start-Process -FilePath $exe -WorkingDirectory '${V.installDir}' -Wait -PassThru`,
      "  if ($r.ExitCode -ne 0) { throw ('the VB-CABLE setup exited ' + $r.ExitCode) }",
      "} catch { Write-Host ('FAILED: ' + $_.Exception.Message); Start-Sleep -Seconds 30; exit 1 }",
    ];
    const after = [`if ($p.ExitCode -eq 0) { ${MIC_RECORD_PS}; Remove-Item -LiteralPath (Join-Path $d 'mic-installed.json') -ErrorAction SilentlyContinue }`];
    return { ok: true, what: MIC_REMOVE_ID, which: V.id, label: 'VB-CABLE', vendor: V.vendor, license: V.license, site: V.site, source: V.installDir, packages: [`${V.label} (${V.vendor})`], url: null, sha256: null, signer: V.signer,
      removes: ['vbcable_driver', 'cable_devices'], prompts: ['uac', 'vendor_window'], notes: ['restart_owed'], commands, argv: [...PS_ARGV, psEncoded(winMicStarter(commands, after).join('\n'))], uac: true, canRun: true, code: null, error: null, after: 'mic' };
  }
  const ours = st.which === MIC.VSMIC.id, root = ours ? MAC_ROOT['remove-ours'] : MAC_ROOT['remove-blackhole'];
  return { ok: true, what: MIC_REMOVE_ID, which: st.which, label: ours ? MIC.VSMIC.label : MIC.BLACKHOLE.label, vendor: ours ? 'VibeSpace' : MIC.BLACKHOLE.vendor, license: ours ? null : MIC.BLACKHOLE.license, site: null, source: MIC.VSMIC.halDir, packages: [ours ? MIC.VSMIC.bundle : MIC.BLACKHOLE.bundle], url: null, sha256: null, signer: null,
    removes: [ours ? 'ours_plugin' : 'blackhole_plugin'], prompts: ['password', 'coreaudio_restart'], notes: ['no_mac_restart'], commands: root, argv: ['/bin/sh', '-c', MAC_STARTER.join('\n')],
    env: { VS_MIC_WHAT: 'remove', VS_MIC_STAGE: '', VS_MIC_SHA: '', VS_MIC_PKG: '', VS_MIC_ROOT_SH: root.join('\n'), VS_MIC_PROMPT: promptOf(f.lang || 'en', 'remove'), VS_MIC_WAIT: String(MIC.MIC_LIMITS.macWaitSec) },
    adminDialog: true, canRun: true, code: null, error: null, after: 'mic' };
}
/** THE INSTALLABLES (src/installs.js registers them): planned from the agent's `stream-mic` facts (`from: 'mic'` — `prepare`
 *  builds a Mac's plug-in first), people only, refused by name on this machine (`local`), done once the facts say installed /
 *  gone (`done: 'mic'` / `'mic-removed'`). */
const VIRTUAL_MIC_INSTALL = Object.freeze({ id: MIC_INSTALL_ID, from: 'mic', humanOnly: true, local: Object.freeze({ code: 'not_desktop_machine', error: 'the virtual microphone is the one-time setup of a paired Windows or macOS machine' }), plan: virtualMicInstallPlan, done: 'mic' });
const VIRTUAL_MIC_REMOVE = Object.freeze({ id: MIC_REMOVE_ID, from: 'mic', humanOnly: true, local: VIRTUAL_MIC_INSTALL.local, plan: virtualMicRemovePlan, done: 'mic-removed' });

module.exports = { MIC_NO_ADMIN_EXIT, MIC_NO_PASSWORD_EXIT, MIC_INSTALL_ID, MIC_REMOVE_ID, MIC_PROMPTS, virtualMicInstallPlan, virtualMicRemovePlan, VIRTUAL_MIC_INSTALL, VIRTUAL_MIC_REMOVE };
