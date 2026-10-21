'use strict';
/**
 * THE VIEWER'S MICROPHONE ON A PAIRED MACHINE (lane stream-mic-road, backlog B-7af0 — the product step after lane
 * stream-mic-wheel-probe; every number below is that probe's, measured on the owner's machines). PURE: requires nothing — the
 * page, the hub and the device agent ask the same rules.
 *   • THE TABLES: VB-CABLE (Windows — a signed, Microsoft-attested driver downloaded from VB-Audio at install time), «VibeSpace
 *     Microphone» (Mac — our own Core Audio HAL plug-in, built ON the Mac like the screen helper) and BlackHole 2ch (the Mac's
 *     qualified fallback — notarized, GPL-3, downloaded from Existential Audio at install time)
 *   • THE MACHINE'S STATE (micStateOf over the device's `stream-mic` facts): absent | installed | reboot_owed | inactive |
 *     unsupported | unknown — which device apps pick as their microphone, and WHERE THE VOICE GOES: the virtual microphone,
 *     or (no virtual microphone) the intercom: the machine's default speaker. The speakers' road never changes a default.
 *   • THE STRIP'S TOGGLE (micStep — the verdict table): muted until pressed; a press asks the browser (its own prompt) and puts
 *     the track on the stream's audio m-line (replaceTrack — no renegotiation); live = the red dot; it stops with the window, a
 *     lock (the page hidden), a press, the stream's end or the track's own end; a RESTORED window never re-opens it by itself
 *   • THE WORDS the strip and the Machines card say (micRoadWords) — English keys the page passes through t()
 *   • THE HELPERS: the build plans (Windows: the in-box C# 5 compiler, the window helper's way; Mac: swiftc for the helper,
 *     clang for the plug-in — the screen helper's way, a SEPARATE binary: the screen helper's version, identity and its
 *     Screen Recording grant never change) and how each is spawned (every name rides the env, never argv)
 * The seam B-aec9 (speaker passthrough, machine → viewer) takes: the device offers this m-line `recvonly` today; the
 * machine's sound makes it `sendrecv` — the page's answer already asks `sendonly` only while no machine sound is offered.
 */

/** The hello-ack word: this agent answers `stream-mic` and its `stream-offer` adds the audio m-line when asked `mic: true`. */
const MIC_CAPABILITY = 'stream-mic';

/** VB-CABLE Pack45 (measured 2026-10-19 on the owner's Windows box: the zip 1,318,877 B; the setup EV-signed «BUREL VINCENT»
 *  (GlobalSign GCC R45 EV CodeSigning CA 2020, timestamped); the driver catalog Microsoft-attested (WHCP); `-i -h` 12.2 s,
 *  exit 0; ONE UAC prompt and no driver dialog; works before the restart the vendor asks for). Donationware: the person sees
 *  it is VB-CABLE, from vb-cable.com, where the donation lives. */
const VBCABLE = Object.freeze({
  id: 'vbcable', label: 'VB-CABLE Virtual Audio Device', pack: 'VBCABLE_Driver_Pack45', vendor: 'VB-Audio Software',
  license: 'donationware', site: 'https://vb-cable.com',
  url: 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip',
  sha256: 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb', bytes: 1318877,
  setup: 'VBCABLE_Setup_x64.exe', setupSha256: '734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41', setupVersion: '2.1.5.8',
  signer: 'BUREL VINCENT', driverSigner: 'Microsoft Windows Hardware Compatibility Publisher',
  render: 'CABLE Input', capture: 'CABLE Output', installDir: 'C:\\Program Files\\VB\\CABLE',
});
/** «VibeSpace Microphone» — ours (measured 2026-10-21 with the owner at the Mac: macOS 26.5.2's coreaudiod loads the ad-hoc
 *  signed build, 2 in / 2 out at 48 kHz, tones out → in 21.3 ms, a second process hears them, no TCC prompt, the defaults
 *  unchanged). Its OUTPUT is the agent's feed, its INPUT the microphone every app sees. */
const VSMIC = Object.freeze({ id: 'vibespace-mic', label: 'VibeSpace Microphone', uid: 'VibeSpaceMic_UID', bundle: 'VibeSpaceMic.driver', exe: 'VibeSpaceMic', bundleId: 'app.vibespace.audio.mic', halDir: '/Library/Audio/Plug-Ins/HAL' });
/** BlackHole 2ch 0.7.1 — the Mac's qualified fallback (notarized; sha256 = the Homebrew cask's pin; GPL-3: downloaded at
 *  install time from its vendor, never bundled). */
const BLACKHOLE = Object.freeze({
  id: 'blackhole', label: 'BlackHole 2ch', version: '0.7.1', vendor: 'Existential Audio Inc.', license: 'GPL-3.0', site: 'https://existential.audio/blackhole/',
  url: 'https://existential.audio/downloads/BlackHole2ch-0.7.1.pkg', sha256: '57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf',
  teamId: 'Q5C99V536K', signer: 'Developer ID Installer: Existential Audio Inc. (Q5C99V536K)', uid: 'BlackHole2ch_UID', bundle: 'BlackHole2ch.driver', pkgId: 'audio.existential.BlackHole2ch',
});
/** The agent's helper (one per OS, SEPARATE from the screen / window helpers) + the bounds the device keeps. */
const MIC_HELPER = Object.freeze({ name: 'vibespace-mic', dir: Object.freeze(['.vibespace', 'helpers']), macTarget: 'macos12.0', archs: Object.freeze(['arm64', 'x86_64']), buildMs: 120000, runMs: 20000 });
const MIC_LIMITS = Object.freeze({
  idleMs: 1500,        // no RTP this long ⇒ the renderer stops (the page's replaceTrack(null) sends nothing) — the next packet starts it again
  factsMs: 30000,      // the device's facts are kept this long (a stream's first packet asks them once)
  macWaitSec: 300,     // the Mac's administrator password dialog waits this long, then it is withdrawn (nothing copied before a password)
  installMs: 600000,   // the hub waits for an install this long
});
/** What the page asks the browser for (the probe's product default: echo cancellation ON — the viewer hears the machine, and
 *  without it the machine's sound would loop back into its microphone — noise suppression + gain control, mono). */
const MIC_CONSTRAINTS = Object.freeze({ audio: Object.freeze({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }) });

/** A DECLARED human-visible string (the page renders it through t(); scripts/i18n-extract.mjs reads the marker). */
const i18nKey = (s) => s;

// ── THE MACHINE'S STATE ────────────────────────────────────────────────────────────────────────────────────────────────
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);
const WIN_ACTIVE = 1; // DEVICE_STATE_ACTIVE (WASAPI)
// the platforms by name (a bundle copy that patches the agent's hello by content counts the literal `platform: "win32"`)
const WIN32 = 'win32', DARWIN = 'darwin';
const ROLES = Object.freeze(['console', 'multimedia', 'communications']);
/** The Windows helper's `facts` (stdout, one JSON line) → { ok, platform: 'win32', endpoints: [{ flow, name, state, id,
 *  defaultFor }], defaults: { render: {role: {name, id}}, capture: {…} } } | { ok: false, code, error } */
function parseWinFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { o = JSON.parse(l); break; } catch { /* not ours */ } }
  if (!o || typeof o !== 'object') return { ok: false, code: 'bad_output', error: 'the microphone helper did not print its facts' };
  if (o.ok === false) return { ok: false, code: 'facts_failed', error: `the microphone helper failed (${str(o.error, 200) || 'no reason'})` };
  const endpoints = (Array.isArray(o.endpoints) ? o.endpoints : []).slice(0, 64).filter((e) => e && (e.flow === 'render' || e.flow === 'capture') && typeof e.id === 'string')
    .map((e) => ({ flow: e.flow, name: str(e.name) || '', state: Number.isInteger(e.state) ? e.state : 0, id: str(e.id, 300), defaultFor: (Array.isArray(e.defaultFor) ? e.defaultFor : []).filter((r) => ROLES.includes(r)) }));
  const side = (s) => Object.fromEntries(ROLES.map((r) => [r, { name: str(s && s[r] && s[r].name) || '', id: str(s && s[r] && s[r].id, 300) || '' }]));
  return { ok: true, platform: WIN32, endpoints, defaults: { render: side(o.defaults && o.defaults.render), capture: side(o.defaults && o.defaults.capture) } };
}
/** The Mac helper's `facts` → { ok, platform: 'darwin', devices: [{ uid, name, inputs, outputs }], defaults: { input, output,
 *  system: { uid, name } } } | { ok: false, code, error } */
function parseMacFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { o = JSON.parse(l); break; } catch { /* not ours */ } }
  if (!o || typeof o !== 'object') return { ok: false, code: 'bad_output', error: 'the microphone helper did not print its facts' };
  if (o.ok === false) return { ok: false, code: 'facts_failed', error: `the microphone helper failed (${str(o.error, 200) || 'no reason'})` };
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const devices = (Array.isArray(o.devices) ? o.devices : []).slice(0, 64).filter((d) => d && typeof d.uid === 'string').map((d) => ({ uid: str(d.uid), name: str(d.name) || '', inputs: n(d.inputs), outputs: n(d.outputs) }));
  const one = (x) => ({ uid: str(x && x.uid) || '', name: str(x && x.name) || '' });
  return { ok: true, platform: DARWIN, devices, defaults: { input: one(o.defaults && o.defaults.input), output: one(o.defaults && o.defaults.output), system: one(o.defaults && o.defaults.system) } };
}
const STATES = Object.freeze(['installed', 'reboot_owed', 'inactive', 'absent', 'unsupported', 'unknown']);
/**
 * THE MACHINE'S STATE (Leg 4 item 4). `f` = the `stream-mic` op's facts: the helper's parsed facts + `{ installedAt }` (the
 * moment OUR install door finished — the starter records it) + `{ bootAt }` (the machine's last boot), or a refusal.
 *   Windows  VB-CABLE's endpoints (render «CABLE Input» → capture «CABLE Output») both ACTIVE ⇒ installed; installed by our
 *            door after the last boot ⇒ reboot_owed (the vendor's restart note — the microphone works now); present but not
 *            active (turned off in Windows' sound settings) ⇒ inactive; none ⇒ absent
 *   Mac      a device with our UID ⇒ installed (ours); else BlackHole's UID ⇒ installed (blackhole); else absent
 * → { state, platform, which, render: {id|uid, name} (where the agent writes), mic: {id|uid, name} (what apps pick),
 *     speaker: {id|uid, name} (the default speaker — the intercom's road), defaultMic, micIsDefault, target: 'virtual' |
 *     'speakers' | null, code, error }
 */
function micStateOf(f) {
  const base = { state: 'unknown', platform: null, which: null, render: null, mic: null, speaker: null, defaultMic: null, micIsDefault: false, target: null, code: null, error: null };
  if (!f || typeof f !== 'object') return { ...base, code: 'no_facts', error: 'the machine did not say what it has' };
  if (f.code === 'unsupported' || (f.platform && f.platform !== 'win32' && f.platform !== 'darwin')) return { ...base, state: 'unsupported', platform: f.platform || null, code: 'unsupported', error: f.error || 'the microphone reaches a Windows or macOS machine' };
  if (!f.ok) return { ...base, platform: f.platform || null, code: f.code || 'no_facts', error: f.error || 'the machine did not say what it has' };
  if (f.platform === 'win32') {
    const eps = Array.isArray(f.endpoints) ? f.endpoints : [];
    const named = (flow, part) => eps.filter((e) => e.flow === flow && e.name.toLowerCase().includes(part.toLowerCase()));
    const ins = named('render', VBCABLE.render), outs = named('capture', VBCABLE.capture);
    const inA = ins.find((e) => e.state === WIN_ACTIVE) || null, outA = outs.find((e) => e.state === WIN_ACTIVE) || null;
    const dm = f.defaults && f.defaults.capture && f.defaults.capture.console && f.defaults.capture.console.id ? f.defaults.capture.console : null;
    const ds = f.defaults && f.defaults.render && f.defaults.render.console && f.defaults.render.console.id ? f.defaults.render.console : null;
    const out = { ...base, platform: WIN32, defaultMic: dm ? { id: dm.id, name: dm.name } : null, speaker: ds ? { id: ds.id, name: ds.name } : null };
    if (inA && outA) {
      const bootAt = Number(f.bootAt) || 0, at = Number(f.installedAt) || 0;
      return { ...out, state: at && bootAt && at > bootAt ? 'reboot_owed' : 'installed', which: VBCABLE.id, render: { id: inA.id, name: inA.name }, mic: { id: outA.id, name: outA.name }, micIsDefault: !!(dm && dm.id === outA.id), target: 'virtual' };
    }
    if (ins.length || outs.length) return { ...out, state: 'inactive', which: VBCABLE.id, target: ds ? 'speakers' : null, code: 'inactive', error: 'VB-CABLE is installed, but its devices are turned off in Windows\' sound settings' };
    return { ...out, state: 'absent', target: ds ? 'speakers' : null };
  }
  const devs = Array.isArray(f.devices) ? f.devices : [];
  const di = f.defaults && f.defaults.input && f.defaults.input.uid ? f.defaults.input : null;
  const doo = f.defaults && f.defaults.output && f.defaults.output.uid ? f.defaults.output : null;
  const out = { ...base, platform: DARWIN, defaultMic: di ? { uid: di.uid, name: di.name } : null, speaker: doo ? { uid: doo.uid, name: doo.name } : null };
  for (const T of [VSMIC, BLACKHOLE]) {
    const d = devs.find((x) => x.uid === T.uid);
    if (d) return { ...out, state: 'installed', which: T.id, render: { uid: d.uid, name: d.name }, mic: { uid: d.uid, name: d.name }, micIsDefault: !!(di && di.uid === d.uid), target: 'virtual' };
  }
  return { ...out, state: 'absent', target: doo ? 'speakers' : null };
}
/** The 「设为默认麦克风」 / 「改回」 pair (Leg 4 item 4, for apps that only use the default microphone): `prev` = what the device
 *  remembered when it made ours the default. → { make: bool, restore: bool } */
function micDefaultDoors(st, prev = null) {
  const ok = !!(st && (st.state === 'installed' || st.state === 'reboot_owed') && st.mic);
  return { make: ok && !st.micIsDefault, restore: ok && !!st.micIsDefault && !!(prev && (prev.id || prev.uid)) };
}
/** Where the agent writes the voice: { to: 'virtual' | 'speakers', device: {id|uid, name} } | { to: null, code, error }. */
function micTargetOf(st) {
  if (st && st.target === 'virtual' && st.render) return { to: 'virtual', device: st.render, mic: st.mic };
  if (st && st.target === 'speakers' && st.speaker) return { to: 'speakers', device: st.speaker, mic: null };
  return { to: null, code: (st && st.code) || 'no_target', error: (st && st.error) || 'this machine has neither a virtual microphone nor a speaker' };
}

// ── THE STRIP'S TOGGLE ─────────────────────────────────────────────────────────────────────────────────────────────────
const MIC_STATES = Object.freeze(['off', 'asking', 'live', 'refused', 'unavailable']);
const MIC_EVENTS = Object.freeze(['press', 'granted', 'denied', 'track_ended', 'close', 'lock', 'stream_end', 'restore']);
/**
 * THE TOGGLE (a verdict table — the strip runs `action`): `st` = { state }, `ev` = { type, ready, code }.
 *   off|refused|unavailable + press  → ready (the stream offered its audio m-line) ? asking (ask) : unavailable (no_mline)
 *   asking + granted                 → live (attach — replaceTrack onto the m-line; the red dot)
 *   asking + denied                  → refused (the browser's code: denied | no_device | insecure | failed)
 *   asking + press                   → off (cancel — the answer that comes later is stopped, never attached)
 *   live + press                     → off (stop)
 *   asking|live + close|lock|stream_end|track_ended → off (stop / cancel, the event's name)
 *   any + restore                    → off (a restored window NEVER re-opens the microphone by itself)
 * → { state, action: 'ask' | 'attach' | 'stop' | 'cancel' | null, code }
 */
function micStep(st, ev) {
  const s = st && MIC_STATES.includes(st.state) ? st.state : 'off';
  const type = ev && ev.type;
  if (type === 'restore') return { state: 'off', action: s === 'live' ? 'stop' : s === 'asking' ? 'cancel' : null, code: 'restore' };
  if (type === 'press') {
    if (s === 'live') return { state: 'off', action: 'stop', code: 'press' };
    if (s === 'asking') return { state: 'off', action: 'cancel', code: 'press' };
    if (!(ev && ev.ready)) return { state: 'unavailable', action: null, code: (ev && ev.code) || 'no_mline' };
    return { state: 'asking', action: 'ask', code: null };
  }
  if (type === 'granted') return s === 'asking' ? { state: 'live', action: 'attach', code: null } : { state: s, action: 'cancel', code: 'late' };
  if (type === 'denied') return s === 'asking' ? { state: 'refused', action: null, code: (ev && ev.code) || 'denied' } : { state: s, action: null, code: null };
  if (type === 'close' || type === 'lock' || type === 'stream_end' || type === 'track_ended') {
    if (s === 'live') return { state: 'off', action: 'stop', code: type };
    if (s === 'asking') return { state: 'off', action: 'cancel', code: type };
    return { state: s === 'unavailable' && type === 'stream_end' ? 'off' : s, action: null, code: null };
  }
  return { state: s, action: null, code: null };
}
/** getUserMedia's refusal (a DOMException name; `secure` = the page's isSecureContext) → the toggle's code. */
function micAskCode(name, secure = true) {
  if (!secure) return 'insecure';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no_device';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy';
  return 'failed';
}
/**
 * WHAT THE STRIP SAYS (Leg 4 item 3 — English keys; the page renders them with t(key, params)):
 *   installed / reboot_owed  «Your voice → the microphone of its apps: «{name}»» (+ the restart note while one is owed)
 *   absent / inactive        «The other computer plays your voice on its speakers» — said EVERY time it is in force
 *   unsupported / unknown    why, by name
 * `live` = the device's own word from the stream's numbers (where it IS writing) wins over the facts (where it would).
 * → { road: 'virtual' | 'speakers' | null, key, params, note: { key, params } | null }
 */
function micRoadWords(st, live = null) {
  // lane ci-339-reds: the machine's receiver said it has no decoder (the Windows road's ffmpeg) — said by name, never the
  // facts' road (a virtual microphone the voice never reached)
  if (live && live.state === 'no_target' && live.code === 'no_ffmpeg') return { road: null, refused: 'no_ffmpeg', key: i18nKey('The other computer has no ffmpeg to play your voice — put it on its PATH or in {dir}'), params: { dir: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin' }, note: null };
  const to = live && (live.to === 'virtual' || live.to === 'speakers') ? live.to : st && st.target;
  const name = (live && live.mic && live.mic.name) || (st && st.mic && st.mic.name) || '';
  const note = st && st.state === 'reboot_owed' ? { key: i18nKey('VB-CABLE asks Windows for a restart to finish — the microphone works now'), params: {} } : null;
  if (to === 'virtual') return { road: 'virtual', key: i18nKey('Your voice → the microphone of its apps: «{name}»'), params: { name }, note };
  if (to === 'speakers') return { road: 'speakers', key: i18nKey('The other computer plays your voice on its speakers'), params: {}, note: st && st.state === 'inactive' ? { key: i18nKey('VB-CABLE is installed, but its devices are turned off in Windows’ sound settings'), params: {} } : null };
  if (st && st.state === 'unsupported') return { road: null, key: i18nKey('The microphone reaches a Windows or macOS machine'), params: {}, note: null };
  return { road: null, key: i18nKey('This machine did not say where your voice would go'), params: {}, note: null };
}

// ── THE HELPERS: build plans + spawns ──────────────────────────────────────────────────────────────────────────────────
const WIN_MIC_RECIPE = '%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe /nologo /target:exe /platform:x64 /optimize+ /out:%LOCALAPPDATA%\\vibespace\\helpers\\vibespace-mic.exe vibespace-mic.cs';
const MAC_MIC_RECIPE = 'on the Mac: `xcode-select --install` (the Command Line Tools — the agent then builds its microphone helper and the plug-in itself)';
/** Windows: where the helper is built (beside the window helper) and how; `hash` = the source's digest (a changed source rebuilds).
 *  → { ok, csc, dir, src, exe, stampFile, stamp, cscArgs } | { ok: false, code: 'helper_missing', error } */
function winMicBuildPlan({ windir = '', localAppData = '', hash = '' } = {}) {
  if (!windir || !localAppData) return { ok: false, code: 'helper_missing', error: `the microphone helper cannot be built on this machine (no %WINDIR% / %LOCALAPPDATA%); the recipe: ${WIN_MIC_RECIPE}` };
  const fw = `${windir}\\Microsoft.NET\\Framework64\\v4.0.30319`, dir = `${localAppData}\\vibespace\\helpers`;
  const src = `${dir}\\${MIC_HELPER.name}.cs`, exe = `${dir}\\${MIC_HELPER.name}.exe`;
  return { ok: true, csc: `${fw}\\csc.exe`, dir, src, exe, stampFile: `${dir}\\${MIC_HELPER.name}.stamp`, stamp: `${MIC_HELPER.name} ${String(hash).slice(0, 16)}`, cscArgs: ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${exe}`, src] };
}
/** Mac: the helper (swiftc — both slices, lipo, ONE ad-hoc signature) and the plug-in (clang -bundle, both archs, ad-hoc
 *  signed), staged under ~/.vibespace/helpers/ — the install copies the STAGED plug-in into /Library/Audio/Plug-Ins/HAL.
 *  → { dir, bin, stamp, src, plugin: { dir, bundle, exe, plist, src }, helper: { slices, after }, pluginSteps } */
function macMicBuildPlan({ home = '', swiftc = '/usr/bin/swiftc', clang = '/usr/bin/clang', hash = '' } = {}) {
  const dir = [String(home || '').replace(/\/+$/, ''), ...MIC_HELPER.dir].join('/'), bin = `${dir}/${MIC_HELPER.name}`;
  const slice = (a) => `${bin}-${a}`;
  const pdir = `${dir}/mic-plugin`, bundle = `${pdir}/${VSMIC.bundle}`, exe = `${bundle}/Contents/MacOS/${VSMIC.exe}`;
  return {
    dir, bin, src: `${bin}.swift`, stampFile: `${bin}.stamp`, stamp: `${MIC_HELPER.name} ${String(hash).slice(0, 16)}`,
    helper: {
      slices: MIC_HELPER.archs.map((a) => ({ file: swiftc, args: ['-O', '-target', `${a}-apple-${MIC_HELPER.macTarget}`, '-o', slice(a), `${bin}.swift`] })),
      after: [{ file: '/usr/bin/lipo', args: ['-create', '-output', bin, ...MIC_HELPER.archs.map(slice)] }, { file: '/usr/bin/codesign', args: ['-s', '-', '-f', bin] }],
    },
    plugin: { dir: pdir, bundle, exe, plist: `${bundle}/Contents/Info.plist`, src: `${pdir}/VibeSpaceMic.c` },
    pluginSteps: [
      { file: clang, args: ['-O2', '-Wall', ...MIC_HELPER.archs.flatMap((a) => ['-arch', a]), '-mmacosx-version-min=12.0', '-bundle', '-o', exe, `${pdir}/VibeSpaceMic.c`, '-framework', 'CoreAudio', '-framework', 'CoreFoundation'] },
      { file: '/usr/bin/codesign', args: ['-s', '-', '-f', bundle] },
    ],
  };
}
/** The helper's spawns (one per OS): every NAME (an endpoint id, a device UID, a role) rides the env — the argv is fixed.
 *  render: Windows reads s16le 48 kHz stereo PCM on stdin (ffmpeg decoded it); the Mac reads length-framed Opus packets
 *  (macFrame) and decodes them with AudioToolbox. → { file, args, env } */
function micHelperSpawn(platform, exe, cmd, names = {}) {
  const env = {};
  if (names.device != null) env.VS_MIC_DEVICE = String(names.device);
  if (names.role != null) env.VS_MIC_ROLE = String(names.role);
  if (names.speakers) env.VS_MIC_SPEAKERS = '1';
  return { file: exe, args: [cmd], env, platform };
}
/** Windows' streaming decoder (the probe's measured road: a live Ogg page per RTP packet → s16le PCM as it comes). */
const DECODER_ARGS = Object.freeze(['-hide_banner', '-loglevel', 'error', '-probesize', '32', '-analyzeduration', '0', '-fflags', 'nobuffer', '-flags', 'low_delay', '-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ac', '2', '-ar', '48000', 'pipe:1']);

module.exports = {
  MIC_CAPABILITY, VBCABLE, VSMIC, BLACKHOLE, MIC_HELPER, MIC_LIMITS, MIC_CONSTRAINTS, ROLES, STATES,
  parseWinFacts, parseMacFacts, micStateOf, micDefaultDoors, micTargetOf,
  MIC_STATES, MIC_EVENTS, micStep, micAskCode, micRoadWords,
  WIN_MIC_RECIPE, MAC_MIC_RECIPE, winMicBuildPlan, macMicBuildPlan, micHelperSpawn, DECODER_ARGS,
};
