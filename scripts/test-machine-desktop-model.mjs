#!/usr/bin/env node
// THE VIEWER'S MICROPHONE ON A PAIRED MACHINE — the PURE tables (lane stream-mic-road, backlog B-7af0; every pinned number is
// lane stream-mic-wheel-probe's, measured on the owner's machines): src/mic-model.js (the vendor tables, the machine's state,
// the strip's toggle verdicts, its words, the helpers' build plans + spawns) and src/mic-install.js's 「安装虚拟麦克风」
// / uninstall plans (the TightVNC row's shape — test-rfb-greeting §4 is the template), registered in src/installs.js; the
// device module's Ogg pager (src/desktop-mic.js — PURE functions). No process, no network, no machine.
//   §1 the tables   §2 the machine's state   §3 where the voice goes, said   §4 the default pair   §5 THE TOGGLE (+ RED CONTROL:
//   a table whose restore re-opens the microphone)   §6 the browser's refusals   §7 the helpers' facts parsers   §8 the build
//   plans + spawns (names ride the env)   §9 the install plans (+ RED CONTROL: a starter without the defaults' restore)
//   §10 the uninstall doors   §11 the installs' rows   §12 the Ogg pager + the Mac frame
// Lane speaker-passthrough-v1 (backlog B-aec9 — THE MACHINE'S SOUND to the viewer; every pin is lane stream-audio-probe's): src/sound-model.js
//   §13 the sound's tables: the capability word, the encoder argv (the probe's leg 1h), the streaming WAV header, the RTP reader, an
//   Opus packet's samples   §14 THE CLOCK (one sequence + timestamp per session across every on / off)   §15 THE TOGGLE (+ RED
//   CONTROL: a start verdict that unmutes a restored window) + the per-machine memory   §16 the words (refusals, consent, zh + ja)
//   §17 THE RATE with the sound (src/stream-model.js videoKbpsOf — the sound's ~80 kbps comes off the picture's target) + the page's
//   own read of the sound (statsOf's `audio`). (There is no test-stream-model suite: src/stream-model.js's PURE rows live where their
//   lane's are.)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MM = require(path.join(REPO, 'src/mic-model.js'));
const MD = require(path.join(REPO, 'src/mic-install.js')); // the setup row's plans (beside src/machine-desktop-model.js — the agent bundles that one)
const I = require(path.join(REPO, 'src/installs.js'));
const DM = require(path.join(REPO, 'src/desktop-mic.js'));
const SND = require(path.join(REPO, 'src/sound-model.js')); // lane speaker-passthrough-v1
const STM = require(path.join(REPO, 'src/stream-model.js')); // lane speaker-passthrough-v1: THE RATE with the sound (videoKbpsOf) + statsOf's `audio`
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const decodePs = (argv) => Buffer.from(argv[argv.length - 1], 'base64').toString('utf16le');
const MUT = mutantCopies('mdmodel', REPO);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('§1 the tables (the probe\'s pins)');
{
  const V = MM.VBCABLE;
  ok(V.url === 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip' && V.sha256 === 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb' && V.bytes === 1318877, 'VB-CABLE Pack45: the vendor URL + the zip\'s SHA-256 + its size (measured 2026-10-19)');
  ok(V.setup === 'VBCABLE_Setup_x64.exe' && V.setupSha256 === '734c35dfa6d98f48782a451633ceb471166ec70d60482fd89a1123d0ee3c4f41' && V.signer === 'BUREL VINCENT' && V.driverSigner === 'Microsoft Windows Hardware Compatibility Publisher', 'the setup\'s SHA-256 + its EV signer; the driver catalog Microsoft-attested');
  ok(V.license === 'donationware' && V.site === 'https://vb-cable.com' && V.render === 'CABLE Input' && V.capture === 'CABLE Output', 'donationware named, its site (the donation); the agent writes «CABLE Input», apps pick «CABLE Output»');
  const B = MM.BLACKHOLE;
  ok(B.url === 'https://existential.audio/downloads/BlackHole2ch-0.7.1.pkg' && B.sha256 === '57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf' && B.teamId === 'Q5C99V536K' && B.license === 'GPL-3.0' && B.uid === 'BlackHole2ch_UID', 'BlackHole 2ch 0.7.1: URL + SHA-256 (= the Homebrew cask\'s pin) + its Developer ID team, GPL-3, its UID');
  ok(MM.VSMIC.uid === 'VibeSpaceMic_UID' && MM.VSMIC.bundle === 'VibeSpaceMic.driver' && MM.VSMIC.halDir === '/Library/Audio/Plug-Ins/HAL' && MM.VSMIC.label === 'VibeSpace Microphone', '«VibeSpace Microphone»: the UID the owner\'s installed copy answers (VibeSpaceMic_UID), the bundle, the HAL folder');
  ok(Object.isFrozen(V) && Object.isFrozen(B) && Object.isFrozen(MM.VSMIC) && Object.isFrozen(MM.MIC_LIMITS), 'the tables are frozen');
  ok(MM.MIC_CAPABILITY === 'stream-mic' && MM.MIC_HELPER.name === 'vibespace-mic' && MM.MIC_HELPER.name !== 'vibespace-screen' && MM.MIC_HELPER.name !== 'vibespace-wgc', 'the capability word; the helper is its OWN binary (never the screen / window helper — B-8601: their version, identity and TCC grant never change)');
  ok(same(MM.MIC_CONSTRAINTS.audio, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }), 'the page asks echo cancellation + noise suppression + gain control, mono (the probe\'s product default)');
  ok(MM.MIC_LIMITS.idleMs === 1500 && MM.MIC_LIMITS.macWaitSec === 300, 'the receiver stops after 1.5 s without a packet; the Mac\'s password dialog waits at most 300 s');
}

const win = (eps, { installedAt = null, bootAt = 1000, capDefault = 'mic-1', renDefault = 'spk-1' } = {}) => ({
  ok: true, platform: 'win32', installedAt, bootAt,
  endpoints: [{ flow: 'render', name: 'Speakers (Sound Blaster X3)', state: 1, id: 'spk-1', defaultFor: [] }, { flow: 'capture', name: '麦克风 (Sound Blaster X3)', state: 1, id: 'mic-1', defaultFor: [] }, ...eps],
  defaults: { render: Object.fromEntries(MM.ROLES.map((r) => [r, { name: renDefault ? 'Speakers (Sound Blaster X3)' : '', id: renDefault || '' }])), capture: Object.fromEntries(MM.ROLES.map((r) => [r, { name: capDefault === 'cab-out' ? 'CABLE Output (VB-Audio Virtual Cable)' : '麦克风 (Sound Blaster X3)', id: capDefault }])) },
});
const CABLE = (state = 1) => [{ flow: 'render', name: 'CABLE Input (VB-Audio Virtual Cable)', state, id: 'cab-in', defaultFor: [] }, { flow: 'capture', name: 'CABLE Output (VB-Audio Virtual Cable)', state, id: 'cab-out', defaultFor: [] }];
const mac = (devs, { input = 'BuiltInMicrophoneDevice', output = 'BuiltInSpeakerDevice' } = {}) => ({ ok: true, platform: 'darwin', devices: [{ uid: 'BuiltInMicrophoneDevice', name: 'MacBook Pro Microphone', inputs: 1, outputs: 0 }, { uid: 'BuiltInSpeakerDevice', name: 'MacBook Pro Speakers', inputs: 0, outputs: 2 }, ...devs], defaults: { input: { uid: input, name: input === 'VibeSpaceMic_UID' ? 'VibeSpace Microphone' : 'MacBook Pro Microphone' }, output: { uid: output, name: output ? 'MacBook Pro Speakers' : '' }, system: { uid: output, name: 'MacBook Pro Speakers' } } });
const OURS = { uid: 'VibeSpaceMic_UID', name: 'VibeSpace Microphone', inputs: 2, outputs: 2 }, BH = { uid: 'BlackHole2ch_UID', name: 'BlackHole 2ch', inputs: 2, outputs: 2 };

console.log('§2 the machine\'s state (Leg 4 item 4)');
{
  const s = MM.micStateOf;
  const a = s(win([]));
  ok(a.state === 'absent' && a.target === 'speakers' && a.speaker.id === 'spk-1' && a.mic === null && a.render === null, 'Windows, no cable ⇒ absent; the voice goes to the default speaker (the intercom)', a);
  const i = s(win(CABLE()));
  ok(i.state === 'installed' && i.which === 'vbcable' && i.render.id === 'cab-in' && i.mic.id === 'cab-out' && i.target === 'virtual' && i.micIsDefault === false && i.defaultMic.id === 'mic-1', 'both endpoints ACTIVE ⇒ installed: the agent writes CABLE Input, apps pick CABLE Output; the default microphone is still the owner\'s', i);
  ok(s(win(CABLE(), { installedAt: 5000, bootAt: 1000 })).state === 'reboot_owed' && s(win(CABLE(), { installedAt: 500, bootAt: 1000 })).state === 'installed' && s(win(CABLE(), { installedAt: null })).state === 'installed', 'installed by OUR door after the last boot ⇒ reboot_owed (the vendor\'s note — the microphone works now); a boot since, or no record (installed elsewhere) ⇒ installed');
  ok(s(win(CABLE(), { installedAt: 5000 })).target === 'virtual', 'reboot owed is treated as installed when its endpoints are active (the voice goes to the virtual microphone)');
  const off = s(win(CABLE(4)));
  ok(off.state === 'inactive' && off.target === 'speakers' && off.code === 'inactive', 'present but not active (turned off in Windows\' sound settings) ⇒ inactive, said; the speakers carry the voice', off);
  ok(s(win([CABLE()[0]])).state === 'inactive' && s(win([CABLE()[0], { ...CABLE()[1], state: 4 }])).state === 'inactive', 'half a cable (one endpoint, or the other not active) is never installed');
  ok(s(win(CABLE(), { capDefault: 'cab-out' })).micIsDefault === true, 'CABLE Output as the default microphone ⇒ micIsDefault');
  ok(s(win([], { renDefault: '' })).target === null, 'no cable and no default speaker ⇒ no road (said, never silent)');
  const o = s(mac([OURS]));
  ok(o.state === 'installed' && o.which === 'vibespace-mic' && o.render.uid === 'VibeSpaceMic_UID' && o.mic.uid === 'VibeSpaceMic_UID' && o.target === 'virtual', 'Mac: our UID present ⇒ installed (ours) — its output is the feed, its input every app\'s microphone', o);
  ok(s(mac([BH])).which === 'blackhole' && s(mac([OURS, BH])).which === 'vibespace-mic', 'BlackHole\'s UID ⇒ installed (blackhole); both ⇒ ours first');
  ok(s(mac([])).state === 'absent' && s(mac([])).target === 'speakers' && s(mac([OURS], { input: 'VibeSpaceMic_UID' })).micIsDefault === true, 'Mac absent ⇒ the speakers; ours as the default input ⇒ micIsDefault');
  ok(s({ ok: false, code: 'unsupported', platform: 'linux' }).state === 'unsupported' && s({ ok: true, platform: 'linux' }).state === 'unsupported' && s(null).state === 'unknown' && s({ ok: false, code: 'helper_missing', error: 'x', platform: 'win32' }).code === 'helper_missing', 'Linux ⇒ unsupported; no facts ⇒ unknown; a helper that did not build ⇒ its code, said');
  ok(MM.STATES.every((st) => typeof st === 'string') && MM.STATES.length === 6, 'six states');
}

console.log('§3 where the voice goes, said (Leg 4 item 3)');
{
  const w = MM.micRoadWords;
  const inst = MM.micStateOf(win(CABLE()));
  ok(same(w(inst), { road: 'virtual', key: 'Your voice → the microphone of its apps: «{name}»', params: { name: 'CABLE Output (VB-Audio Virtual Cable)' }, note: null }), 'installed ⇒ 「你的声音 → 本机应用的麦克风『CABLE Output』」 (the name apps pick)', w(inst));
  const owed = w(MM.micStateOf(win(CABLE(), { installedAt: 9e12 })));
  ok(owed.road === 'virtual' && owed.note && /restart to finish — the microphone works now/.test(owed.note.key), 'reboot owed ⇒ the same road + the restart note (the note stays)');
  const sp = w(MM.micStateOf(win([])));
  ok(sp.road === 'speakers' && sp.key === 'The other computer plays your voice on its speakers' && sp.note === null, 'absent ⇒ 「对方电脑会从扬声器播放你的声音」 — said every time the speakers road is in force');
  ok(w(MM.micStateOf(win(CABLE(4)))).road === 'speakers' && /turned off/.test(w(MM.micStateOf(win(CABLE(4)))).note.key), 'inactive ⇒ the speakers, with why');
  ok(w(MM.micStateOf(win([])), { to: 'virtual', mic: { name: 'CABLE Output' } }).road === 'virtual' && w(inst, { to: 'speakers' }).road === 'speakers', 'the machine\'s OWN word (the stream\'s numbers: where it IS writing) wins over the facts');
  ok(w(MM.micStateOf({ ok: true, platform: 'linux' })).road === null && w(null).road === null, 'unsupported / unknown ⇒ no road, said by name');
  // lane ci-339-reds: the receiver's refusal (no decoder on the machine) wins over the facts' road — with where to put one
  const noFf = w(inst, { state: 'no_target', code: 'no_ffmpeg' });
  ok(same(noFf, { road: null, refused: 'no_ffmpeg', key: 'The other computer has no ffmpeg to play your voice — put it on its PATH or in {dir}', params: { dir: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin' }, note: null }) && w(inst, { state: 'no_target', code: 'helper_missing' }).road === 'virtual', 'the machine has no ffmpeg (the stream\'s numbers: no_target / no_ffmpeg) ⇒ 「对方电脑没有 ffmpeg，放不出你的声音」 + where — never 「你的声音 → …CABLE Output」 it never reached; another code keeps the facts\' road', noFf);
  ok(same(MM.micTargetOf(inst), { to: 'virtual', device: { id: 'cab-in', name: 'CABLE Input (VB-Audio Virtual Cable)' }, mic: { id: 'cab-out', name: 'CABLE Output (VB-Audio Virtual Cable)' } }) && MM.micTargetOf(MM.micStateOf(win([]))).to === 'speakers' && MM.micTargetOf(MM.micStateOf(win([], { renDefault: '' }))).to === null, 'micTargetOf: the render endpoint (virtual) / the default speaker / none by name');
}

console.log('§4 the 「设为默认麦克风」 / 「改回」 pair');
{
  const d = MM.micDefaultDoors;
  ok(same(d(MM.micStateOf(win(CABLE()))), { make: true, restore: false }), 'installed, not the default ⇒ 「设为默认麦克风」 only');
  ok(same(d(MM.micStateOf(win(CABLE(), { capDefault: 'cab-out' })), { id: 'mic-1', name: 'x' }), { make: false, restore: true }), 'the default, and the device remembers what it replaced ⇒ 「改回」 only');
  ok(same(d(MM.micStateOf(win(CABLE(), { capDefault: 'cab-out' })), null), { make: false, restore: false }), 'the default but nothing remembered (Windows moved it, not us) ⇒ no 「改回」 — VibeSpace never guesses a device');
  ok(same(d(MM.micStateOf(win([]))), { make: false, restore: false }) && same(d(null), { make: false, restore: false }), 'absent / no facts ⇒ neither');
}

console.log('§5 THE TOGGLE (the verdict table)');
{
  const step = MM.micStep;
  ok(same(step({ state: 'off' }, { type: 'press', ready: true }), { state: 'asking', action: 'ask', code: null }), 'off + press (the m-line is there) ⇒ asking: the browser asks (its own prompt)');
  ok(same(step({ state: 'off' }, { type: 'press', ready: false }), { state: 'unavailable', action: null, code: 'no_mline' }), 'off + press with no m-line (an old agent) ⇒ unavailable, said — never a dead toggle that pretends');
  ok(same(step({ state: 'asking' }, { type: 'granted' }), { state: 'live', action: 'attach', code: null }), 'asking + granted ⇒ live (attach: replaceTrack onto the m-line; the red dot)');
  ok(same(step({ state: 'asking' }, { type: 'denied', code: 'denied' }), { state: 'refused', action: null, code: 'denied' }), 'asking + denied ⇒ refused with the browser\'s code');
  ok(same(step({ state: 'asking' }, { type: 'press' }), { state: 'off', action: 'cancel', code: 'press' }) && step({ state: 'off' }, { type: 'granted' }).action === 'cancel', 'a press while the browser asks cancels; a late grant is stopped, never attached');
  ok(same(step({ state: 'live' }, { type: 'press' }), { state: 'off', action: 'stop', code: 'press' }), 'live + press ⇒ off (stop)');
  for (const ev of ['close', 'lock', 'stream_end', 'track_ended']) ok(same(step({ state: 'live' }, { type: ev }), { state: 'off', action: 'stop', code: ev }) && same(step({ state: 'asking' }, { type: ev }), { state: 'off', action: 'cancel', code: ev }), `live / asking + ${ev} ⇒ off (it stops with the window, a lock, the stream, the track)`);
  for (const s0 of MM.MIC_STATES) { const r = step({ state: s0 }, { type: 'restore' }); ok(r.state === 'off' && r.action !== 'ask' && r.action !== 'attach', `restore from ${s0} ⇒ off — a restored window NEVER re-opens the microphone by itself`); }
  ok(step({ state: 'refused' }, { type: 'press', ready: true }).action === 'ask' && step({ state: 'unavailable' }, { type: 'stream_end' }).state === 'off', 'refused + press asks again; an unavailable toggle resets with its stream');
  // THE WHOLE MATRIX: no event but a PRESS ever starts asking, and nothing but a grant ever attaches
  const starts = [], attaches = [];
  for (const s0 of MM.MIC_STATES) for (const ev of MM.MIC_EVENTS) { const r = step({ state: s0 }, { type: ev, ready: true }); if (r.action === 'ask') starts.push(`${s0}+${ev}`); if (r.action === 'attach') attaches.push(`${s0}+${ev}`); }
  ok(starts.every((x) => x.endsWith('+press')) && same(attaches, ['asking+granted']), `the matrix (${MM.MIC_STATES.length} states × ${MM.MIC_EVENTS.length} events): only a press asks (${starts.join(', ')}); only a grant attaches`);
  // RED CONTROL: a table whose restore re-opens the microphone is caught by the same rows
  const src = read('src/mic-model.js');
  const bad = "  if (type === 'restore') return { state: 'asking', action: 'ask', code: 'restore' };";
  const want = "  if (type === 'restore') return { state: 'off', action: s === 'live' ? 'stop' : s === 'asking' ? 'cancel' : null, code: 'restore' };";
  ok(src.includes(want), 'RED CONTROL anchor: the restore row is spelled once');
  const M2 = MUT.load('src/mic-model.js', src.replace(want, bad), 'restore-reopens');
  const r2 = M2.micStep({ state: 'off' }, { type: 'restore' });
  ok(!(r2.state === 'off' && r2.action !== 'ask'), 'RED CONTROL: a mutant whose restore re-opens the microphone fails the never-auto-reopen row', r2);
}

console.log('§6 the browser\'s refusals');
{
  const c = MM.micAskCode;
  ok(c('NotAllowedError') === 'denied' && c('SecurityError') === 'denied' && c('NotFoundError') === 'no_device' && c('NotReadableError') === 'busy' && c('AbortError') === 'failed' && c('NotAllowedError', false) === 'insecure', 'NotAllowed ⇒ denied, NotFound ⇒ no_device, NotReadable ⇒ busy; an http page ⇒ insecure (the browser gives it no microphone)');
}

console.log('§7 the helpers\' facts parsers');
{
  const wf = MM.parseWinFacts('noise\n' + JSON.stringify({ ok: true, endpoints: [...CABLE(), { flow: 'x', id: 'bad' }, { flow: 'render', name: 'n' }], defaults: { render: { console: { name: 'A', id: 'a' } }, capture: {} } }) + '\n');
  ok(wf.ok && wf.platform === 'win32' && wf.endpoints.length === 2 && wf.defaults.render.console.id === 'a' && wf.defaults.capture.console.id === '' && wf.defaults.render.communications.id === '', 'Windows: the endpoints that carry a flow + an id; every role\'s default (an absent one = empty)');
  ok(MM.parseWinFacts('').code === 'bad_output' && MM.parseWinFacts('{"ok":false,"error":"CoCreate failed"}').code === 'facts_failed', 'no line ⇒ bad_output; the helper\'s own failure ⇒ facts_failed by name');
  const mf = MM.parseMacFacts(JSON.stringify({ ok: true, devices: [OURS, { uid: 5 }], defaults: { input: { uid: 'VibeSpaceMic_UID', name: 'VibeSpace Microphone' } } }));
  ok(mf.ok && mf.platform === 'darwin' && mf.devices.length === 1 && mf.devices[0].inputs === 2 && mf.defaults.input.uid === 'VibeSpaceMic_UID' && mf.defaults.output.uid === '', 'Mac: devices by UID with their channels; the defaults (an absent one = empty)');
  ok(MM.parseWinFacts(JSON.stringify({ ok: true, endpoints: Array.from({ length: 200 }, (_, k) => ({ flow: 'render', name: 'x', id: 'e' + k, state: 1 })) })).endpoints.length === 64, 'bounded: at most 64 endpoints');
}

console.log('§8 the build plans + spawns (every name rides the env)');
{
  const wb = MM.winMicBuildPlan({ windir: 'C:\\Windows', localAppData: 'C:\\Users\\u\\AppData\\Local', hash: 'abcdef0123456789ff' });
  ok(wb.ok && wb.csc === 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe' && wb.exe === 'C:\\Users\\u\\AppData\\Local\\vibespace\\helpers\\vibespace-mic.exe' && wb.stamp === 'vibespace-mic abcdef0123456789' && wb.cscArgs.includes('/platform:x64') && wb.cscArgs[wb.cscArgs.length - 1] === wb.src, 'Windows: the in-box C# 5 compiler builds vibespace-mic.exe beside the window helper; the stamp is the source\'s digest (a changed source rebuilds)');
  ok(MM.winMicBuildPlan({}).code === 'helper_missing' && /csc\.exe/.test(MM.winMicBuildPlan({}).error), 'no %WINDIR% / %LOCALAPPDATA% ⇒ helper_missing with the recipe');
  const mb = MM.macMicBuildPlan({ home: '/Users/u', hash: '0123456789abcdef00' });
  ok(mb.bin === '/Users/u/.vibespace/helpers/vibespace-mic' && mb.helper.slices.length === 2 && mb.helper.slices.every((s) => s.args.includes('-target') && /apple-macos12\.0$/.test(s.args[s.args.indexOf('-target') + 1])) && mb.helper.after[0].file === '/usr/bin/lipo' && same(mb.helper.after[1].args, ['-s', '-', '-f', mb.bin]), 'Mac: the helper — both slices, lipo, ONE ad-hoc signature (the screen helper\'s pipeline, its own binary)');
  ok(mb.plugin.bundle === '/Users/u/.vibespace/helpers/mic-plugin/VibeSpaceMic.driver' && mb.pluginSteps[0].args.includes('-bundle') && mb.pluginSteps[0].args.filter((a) => a === '-arch').length === 2 && mb.pluginSteps[0].args.includes('CoreAudio') && same(mb.pluginSteps[1].args, ['-s', '-', '-f', mb.plugin.bundle]), 'Mac: the plug-in — clang -bundle for both archs + CoreAudio, ad-hoc signed, STAGED (never installed by the agent)');
  const sp = MM.micHelperSpawn('win32', 'C:\\h\\vibespace-mic.exe', 'render', { device: '{0.0.0.00000000}.{abc}' });
  ok(same(sp.args, ['render']) && sp.env.VS_MIC_DEVICE === '{0.0.0.00000000}.{abc}' && !sp.args.join(' ').includes('abc'), 'the render spawn: argv = the command only; the endpoint id rides VS_MIC_DEVICE');
  ok(MM.micHelperSpawn('darwin', '/b', 'render', { speakers: true }).env.VS_MIC_SPEAKERS === '1' && !('VS_MIC_DEVICE' in MM.micHelperSpawn('darwin', '/b', 'render', { speakers: true }).env), 'the speakers road names no device (the default output)');
  ok(same(MM.DECODER_ARGS.slice(-9), ['-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ac', '2', '-ar', '48000', 'pipe:1'].slice(-9)) && MM.DECODER_ARGS.includes('nobuffer') && MM.DECODER_ARGS.includes('low_delay'), 'Windows\' decoder: the probe\'s streaming flags (-fflags nobuffer -flags low_delay), Ogg in, s16le 48 kHz stereo out');
}

console.log('§9 the 「安装虚拟麦克风」 plans');
{
  const p = MD.virtualMicInstallPlan({ platform: 'win32' });
  const script = p.commands.join('\n'), starter = decodePs(p.argv);
  ok(p.ok && p.what === 'virtual-mic' && p.which === 'vbcable' && p.uac === true && p.canRun === true && p.after === 'mic' && p.license === 'donationware' && p.site === 'https://vb-cable.com', 'Windows: VB-CABLE behind UAC, donationware named with its site');
  ok(same(p.prompts, ['uac', 'admin_window', 'no_driver_dialog']) && p.notes.includes('restart_owed') && p.notes.includes('defaults_kept'), 'what the person sees: ONE UAC prompt, an administrator window, no driver dialog; the restart note; the defaults kept');
  ok(script.includes(`Invoke-WebRequest -UseBasicParsing -Uri '${MM.VBCABLE.url}'`) && script.indexOf(MM.VBCABLE.sha256.toUpperCase()) > script.indexOf('Invoke-WebRequest') && script.indexOf(MM.VBCABLE.sha256.toUpperCase()) < script.indexOf('Expand-Archive'), 'the zip\'s SHA-256 is checked BEFORE it is unpacked');
  ok(script.indexOf(MM.VBCABLE.setupSha256.toUpperCase()) < script.indexOf("'-i', '-h'") && /SignerCertificate\.Subject -notmatch 'BUREL VINCENT'/.test(script) && script.indexOf('Get-AuthenticodeSignature') < script.indexOf("'-i', '-h'"), 'the setup\'s SHA-256 AND its Authenticode signer are checked BEFORE `-i -h` runs');
  ok(/SetAccessRuleProtection\(\$true, \$false\)/.test(script) && /'S-1-5-18', 'S-1-5-32-544'/.test(script) && script.indexOf('CreateDirectory') < script.indexOf('Invoke-WebRequest') && !/\$env:TEMP/i.test(script), 'the download lands in an admin-only directory (never the user\'s %TEMP% — the TightVNC row\'s verify r1 F2)');
  ok(!/Restart-Computer|shutdown/i.test(script + starter) && /never restarts this machine/.test(script), 'nothing restarts the machine; the window says so');
  ok(/Start-Process powershell\.exe -Verb RunAs -Wait -PassThru/.test(starter) && decodePs([/'-EncodedCommand','([^']+)'/.exec(starter)[1]]) === script && starter.includes(`exit ${MD.MIC_NO_ADMIN_EXIT}`) && MD.MIC_NO_ADMIN_EXIT === require(path.join(REPO, 'src/machine-desktop-model.js')).TIGHTVNC_NO_ADMIN_EXIT, 'the starter asks UAC and runs EXACTLY the shown commands; no elevation ⇒ the no_admin exit (TightVNC\'s)');
  const snap = starter.indexOf('$before = @{}'), ask = starter.indexOf('-Verb RunAs'), back = starter.indexOf('[VsMicDefaults.D]::Set(');
  ok(snap > 0 && snap < ask && back > ask && /foreach \(\$f in 0, 1\) \{ foreach \(\$r in 0, 1, 2\)/.test(starter) && /foreach \(\$pass in 1, 2, 3\)/.test(starter) && starter.includes("Kept your default speaker and microphone"), 'THE STEP TightVNC lacks: the default speaker AND microphone (every role) snapshotted BEFORE UAC, put back AFTER (three passes 2 s apart), and said 「已保持你原来的默认扬声器和麦克风」');
  ok(/SetDefaultEndpoint/.test(starter) && /f8679f50-850a-41cf-9c72-430f290290c8/.test(starter), 'the restore is IPolicyConfig.SetDefaultEndpoint (the probe\'s measured restore)');
  ok(/if \(\$p\.ExitCode -eq 0\) \{ \$d = Join-Path \$env:USERPROFILE '\.vibespace'; [^\n]*mic-installed\.json/.test(starter), 'a successful install records its moment (~/.vibespace/mic-installed.json — the reboot note\'s fact)');
  ok(p.argv.join(' ').length < 32000, `the agent's argv stays under CreateProcess's 32767 characters (${p.argv.join(' ').length})`);
  ok(/^[\x09\x0a\x20-\x7e]*$/.test(script) && /^[\x09\x0a\x20-\x7e]*$/.test(starter.replace(/'-EncodedCommand','[^']+'/, '')), 'the PowerShell is pure ASCII (Windows PowerShell 5.1 reads a BOM-less script in the ANSI code page)');
  // the Mac: ours when staged
  const stage = { ok: true, bundle: '/Users/u/.vibespace/helpers/mic-plugin/VibeSpaceMic.driver', sha256: 'ab'.repeat(32) };
  const m = MD.virtualMicInstallPlan({ platform: 'darwin', mic: { ...mac([]), stage }, lang: 'zh' });
  ok(m.ok && m.which === 'vibespace-mic' && m.adminDialog === true && !m.uac && m.sha256 === stage.sha256 && m.packages[0].includes(stage.sha256) && same(m.prompts, ['password', 'coreaudio_restart']) && m.notes.includes('no_mac_restart'), 'Mac: ours (built on THIS Mac) behind the administrator password dialog; its SHA-256 is part of what is shown (the digest binds it); Core Audio restarts, the Mac does not');
  ok(same(m.argv.slice(0, 2), ['/bin/sh', '-c']) && !m.argv[2].includes(stage.bundle) && !m.argv[2].includes(stage.sha256) && m.env.VS_MIC_STAGE === stage.bundle && m.env.VS_MIC_SHA === stage.sha256 && m.env.VS_MIC_ROOT_SH === m.commands.join('\n'), 'the staged path and its SHA-256 ride the ENV; the argv is fixed text; the root script the dialog runs IS the shown commands');
  const root = m.commands.join('\n');
  ok(root.indexOf('chown -R root:wheel') < root.indexOf('shasum -a 256') && /rm -rf "\$B"; echo 'the installed copy is not the checked build/.test(root) && /launchctl kickstart -kp system\/com\.apple\.audio\.coreaudiod \|\| killall coreaudiod/.test(root), 'root: copy, make it root\'s, THEN check the installed binary\'s SHA-256 (nothing of the user\'s can swap it after); a mismatch is removed; Core Audio restarted');
  ok(/with administrator privileges with prompt \(system attribute "VS_MIC_PROMPT"\)/.test(m.argv[2]) && /quoted form of/.test(m.argv[2]) && m.env.VS_MIC_PROMPT === MD.MIC_PROMPTS.zh.ours && /声音停一两秒/.test(m.env.VS_MIC_PROMPT), 'the password dialog carries OUR text in the page\'s language; the AppleScript quotes every name it hands the root shell');
  ok(/\( sleep "\$VS_MIC_WAIT"; kill \$pid/.test(m.argv[2]) && m.env.VS_MIC_WAIT === '300' && m.argv[2].includes(`exit ${MD.MIC_NO_PASSWORD_EXIT}`) && /grep -q '\(-128\)'/.test(m.argv[2]) && m.argv[2].includes(`exit ${MD.MIC_NO_ADMIN_EXIT}`), 'a dialog nobody answers is WITHDRAWN after 300 s (exit 6 — nothing was copied before a password); a cancel (-128) ⇒ the no_admin exit');
  ok(MD.virtualMicInstallPlan({ platform: 'darwin', mic: { ...mac([]), stage }, lang: 'xx' }).env.VS_MIC_PROMPT === MD.MIC_PROMPTS.en.ours && MD.MIC_PROMPTS.ja.ours.length > 10, 'an unknown language ⇒ English; ja carries its own');
  const bh = MD.virtualMicInstallPlan({ platform: 'darwin', mic: { ...mac([]), stage: { ok: false, code: 'no_compiler', error: 'no Command Line Tools' } } });
  ok(bh.ok && bh.which === 'blackhole' && bh.license === 'GPL-3.0' && bh.fallbackWhy === 'no Command Line Tools' && bh.url === MM.BLACKHOLE.url && bh.env.VS_MIC_WHAT === 'blackhole', 'no plug-in staged (no compiler) ⇒ BlackHole 2ch, GPL-3 named, the reason said');
  const st = bh.argv[2];
  ok(st.indexOf(`'${MM.BLACKHOLE.sha256}'`) < st.indexOf('osascript') && st.indexOf(`(${MM.BLACKHOLE.teamId})`) < st.indexOf('osascript') && /curl -fsSL -o "\$VS_MIC_PKG" 'https:\/\/existential\.audio/.test(st), 'BlackHole: downloaded from its vendor at the press, its SHA-256 AND its Developer ID team checked BEFORE the dialog');
  ok(/mktemp -d \/private\/tmp\/vibespace-mic\.XXXXXX\) && chmod 700/.test(bh.commands.join('\n')) && bh.commands.join('\n').indexOf(MM.BLACKHOLE.sha256) < bh.commands.join('\n').indexOf('installer -pkg'), 'root copies the pkg into a root-only folder and checks it AGAIN before installer runs');
  ok(MD.virtualMicInstallPlan({ platform: 'win32', mic: win(CABLE()) }).code === 'already_installed' && MD.virtualMicInstallPlan({ platform: 'darwin', mic: mac([OURS]) }).code === 'already_installed', 'a machine that has one ⇒ already_installed (the row is the remove door then)');
  ok(!/mic-install|mic-model/.test(read('src/machine-desktop-model.js')) && /require\('\.\/machine-desktop-model\.js'\)/.test(read('src/installed-apps.js')), 'the plans live in src/mic-install.js, never in src/machine-desktop-model.js — the agent bundles that one (src/installed-apps.js asks it) and a Mac plan names osascript, a word the agent bundle never carries');
  ok(MD.virtualMicInstallPlan({ platform: 'linux' }).code === 'unsupported' && MD.virtualMicInstallPlan(null).code === 'no_facts' && MD.virtualMicInstallPlan({}).code === 'no_facts', 'Linux ⇒ unsupported; no platform ⇒ no_facts');
  // RED CONTROL: a starter without the defaults' restore (the TightVNC shape) is caught
  const msrc = read('src/mic-install.js');
  const keep = "    '$moved = 0; foreach ($pass in 1, 2, 3) {";
  ok(msrc.includes(keep), 'RED CONTROL anchor: the restore line is spelled once');
  const M3 = MUT.load('src/mic-install.js', msrc.replace(keep, "    '$moved = 0; foreach ($pass in @()) {"), 'no-restore');
  const s3 = decodePs(M3.virtualMicInstallPlan({ platform: 'win32' }).argv);
  ok(!/foreach \(\$pass in 1, 2, 3\)/.test(s3), 'RED CONTROL: a starter that never puts the defaults back fails the defaults row');
}

console.log('§10 the uninstall doors (what goes away, said)');
{
  const w = MD.virtualMicRemovePlan({ platform: 'win32', mic: win(CABLE()) });
  const script = w.commands.join('\n'), starter = decodePs(w.argv);
  ok(w.ok && w.what === 'virtual-mic-remove' && same(w.removes, ['vbcable_driver', 'cable_devices']) && w.prompts.includes('vendor_window') && w.uac, 'Windows: VB-CABLE\'s own setup behind ONE UAC; what goes away named');
  ok(script.includes("$exe = 'C:\\Program Files\\VB\\CABLE\\VBCABLE_Setup_x64.exe'") && script.indexOf('Get-AuthenticodeSignature') < script.indexOf('Start-Process -FilePath $exe') && /press «Remove Driver» there/.test(script) && !/'-u'/.test(script), 'its setup in C:\\Program Files\\VB\\CABLE, its signer checked first; the person presses «Remove Driver» (the measured GUI — the unmeasured silent -u is not used)');
  ok(/Remove-Item -LiteralPath \(Join-Path \$d 'mic-installed\.json'\)/.test(starter), 'the install record is removed with it');
  const mo = MD.virtualMicRemovePlan({ platform: 'darwin', mic: mac([OURS]) });
  ok(mo.ok && mo.which === 'vibespace-mic' && same(mo.removes, ['ours_plugin']) && /rm -rf '\/Library\/Audio\/Plug-Ins\/HAL\/VibeSpaceMic\.driver' && \{ launchctl kickstart/.test(mo.commands.join('\n')) && mo.adminDialog, 'Mac (ours): the bundle out of the HAL folder + Core Audio restarted, behind the password dialog');
  const mb = MD.virtualMicRemovePlan({ platform: 'darwin', mic: mac([BH]) });
  ok(mb.which === 'blackhole' && /BlackHole2ch\.driver'; pkgutil --forget audio\.existential\.BlackHole2ch/.test(mb.commands.join('\n')), 'Mac (BlackHole): its bundle + its pkg receipt');
  ok(MD.virtualMicRemovePlan({ platform: 'win32', mic: win([]) }).code === 'not_installed' && MD.virtualMicRemovePlan({ platform: 'win32', mic: win(CABLE(4)) }).ok === true, 'nothing to remove ⇒ not_installed; a turned-off cable can still be removed');
}

console.log('§11 the installs\' rows');
{
  const r = I.installRow('virtual-mic'), rr = I.installRow('virtual-mic-remove');
  ok(r && r.from === 'mic' && r.humanOnly === true && r.done === 'mic' && r.plan === MD.virtualMicInstallPlan && r.local.code === 'not_desktop_machine', 'installs.js registers 「安装虚拟麦克风」: planned from the `stream-mic` facts, people only, refused on this machine by name, done = the facts say it is there');
  ok(rr && rr.from === 'mic' && rr.done === 'mic-removed' && rr.humanOnly === true, '…and its uninstall door');
  ok(!I.INSTALL_WHATS.includes('virtual-mic') && I.installPlanFor('virtual-mic', {}).code === 'bad-request', 'not a facts-op install (the access layer plans it from the microphone facts — never the apt slot)');
  const routes = read('src/routes/desktop-apps.js');
  ok(/mic: \(\) => micDone\(true\), 'mic-removed': \(\) => micDone\(false\)/.test(routes) && /e\.code = want \? 'still-absent' : 'still-present'/.test(routes), 'the route re-checks the machine\'s microphone facts after the run (still-absent / still-present by name)');
}

console.log('§12 the Ogg pager + the Mac frame (src/desktop-mic.js)');
{
  const crc = (buf) => { let c = 0; for (const b of buf) { c ^= b << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1; c >>>= 0; } return c >>> 0; };
  const pkt = Buffer.alloc(600, 7);
  const pg = DM.oggPage(1, 5, 4800, 0, pkt);
  const z = Buffer.from(pg); z.writeUInt32LE(0, 22);
  ok(pg.subarray(0, 4).toString() === 'OggS' && pg[26] === 3 && pg[27] === 255 && pg[28] === 255 && pg[29] === 90 && pg.readBigInt64LE(6) === 4800n && pg.readUInt32LE(18) === 5 && pg.length === 27 + 3 + 600, 'a 600-byte packet ⇒ one page: lacing 255 255 90, its granule, its sequence');
  ok(pg.readUInt32LE(22) === crc(z), 'the page CRC = an independent CRC-32 (poly 0x04c11db7, Ogg\'s)');
  const [head, tags] = DM.oggOpusHead(2);
  ok(head.subarray(28, 36).toString() === 'OpusHead' && head[37] === 2 && head.readUInt32LE(40) === 48000 && head[5] === 2 && tags.subarray(28, 36).toString() === 'OpusTags', 'the head pages: OpusHead (stereo, 48 kHz, BOS) + OpusTags');
  const f = DM.macFrame(Buffer.from([1, 2, 3]));
  ok(same([...f], [3, 0, 0, 0, 1, 2, 3]), 'the Mac road\'s frame: u32 little-endian length, then the packet');
}

console.log('§13 THE SOUND\'s tables (lane speaker-passthrough-v1 — the probe\'s pins)');
{
  const S = SND.SOUND;
  ok(SND.SOUND_CAPABILITY === 'stream-audio' && S.kbps === 64 && S.wireKbps === 80 && S.frameMs === 20 && S.clockRate === 48000 && S.samples === 960 && S.channels === 2, 'the hello-ack word stream-audio; Opus 64 kbps, 20 ms (960 samples) of 48 kHz stereo; ~80 kbps on the wire (the share the picture gives up)');
  ok(S.streamId === 'vibespace-desktop' && Object.isFrozen(S) && Object.isFrozen(SND.SOUND_LIMITS) && SND.SOUND_LIMITS.startMs >= 5000 && SND.SOUND_LIMITS.stopGraceMs === 1000, 'ONE msid for the picture and the sound (one MediaStream — the page\'s <video> carries both); the tables are frozen');
  const P = 9; // an argv's port only (PURE — the discard port, nothing is opened)
  const a = SND.soundEncoderArgs(P);
  ok(same(a, ['-hide_banner', '-loglevel', 'error', '-fflags', 'nobuffer', '-probesize', '32', '-analyzeduration', '0', '-f', 'wav', '-max_size', '1920', '-ignore_length', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '64k', '-application', 'lowdelay', '-frame_duration', '20', '-flush_packets', '1', '-max_delay', '0', '-muxdelay', '0', '-muxpreload', '0', '-f', 'rtp', `rtp://127.0.0.1:${P}?rtcpport=${P}`]), 'the encoder = the probe\'s leg 1h: PCM behind a STREAMING WAV header (`-max_size 1920` — 10 ms demuxed packets, not the raw demuxer\'s 85 ms clumps), no probing, libopus 64 kbps lowdelay 20 ms, every packet flushed, RTP to OUR loopback port (its RTCP to the same socket — never port + 1, someone else\'s)', a);
  ok(SND.soundEncoderArgs(0) === null && SND.soundEncoderArgs(70000) === null && SND.soundEncoderArgs('x') === null && !a.some((x) => /[A-Z]{2,}_[A-Z]+=/.test(x)), 'a port that is no port ⇒ no argv; no name rides it');
  const h = Buffer.from(SND.soundWavHeader());
  ok(h.length === 44 && h.toString('latin1', 0, 4) === 'RIFF' && h.readUInt32LE(4) === 0xFFFFFFFF && h.toString('latin1', 8, 16) === 'WAVEfmt ' && h.readUInt16LE(20) === 1 && h.readUInt16LE(22) === 2 && h.readUInt32LE(24) === 48000 && h.readUInt32LE(28) === 192000 && h.readUInt16LE(32) === 4 && h.readUInt16LE(34) === 16 && h.toString('latin1', 36, 40) === 'data' && h.readUInt32LE(40) === 0xFFFFFFFF, 'the WAV header: PCM s16le stereo 48 kHz (192000 B/s, 4-byte frames), its sizes unknown (0xFFFFFFFF — `-ignore_length 1`)');
  // the RTP reader: a header with 2 CSRCs, a one-word extension and 3 bytes of padding
  const pkt = Buffer.from([0xb2, 0x60, 0x12, 0x34, 0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0, 0, 0, 1, 0, 0, 0, 2, 0xbe, 0xde, 0, 1, 9, 9, 9, 9, 0xfc, 0xaa, 0xbb, 0, 0, 3]);
  const r = SND.rtpOf(pkt);
  ok(r && r.seq === 0x1234 && r.ts === 0xdeadbeef && r.pt === 0x60 && r.ssrc === 0x01020304 && same([...r.payload], [0xfc, 0xaa, 0xbb]), 'the RTP reader: version 2, its CSRCs, its extension and its padding skipped — the Opus payload exact', r);
  ok(SND.rtpOf(Buffer.from([0x40, 0x60, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])) === null && SND.rtpOf(Buffer.alloc(8)) === null && SND.rtpOf('x') === null && SND.rtpOf(Buffer.from([0x90, 0x60, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0xbe, 0xde, 0, 9])) === null, 'not version 2, too short, not bytes, an extension past the end ⇒ null (a stray datagram is dropped, never a packet)');
  const os = (bytes) => SND.opusSamples(Uint8Array.from(bytes));
  ok(os([0xfc]) === 960 && os([0x78]) === 960 && os([0x00]) === 480 && os([0x01, 0, 0]) === 960 && os([0x03 | (31 << 3), 0x03]) === 2880 && os([0x03 | (31 << 3), 0x00]) === 0 && os([]) === 0 && os([0x03 | (3 << 3), 0x02]) === 5760 && os([0x03 | (3 << 3), 0x03]) === 0, 'an Opus packet\'s samples from its TOC (RFC 6716 §3.1): CELT 20 ms = 960, hybrid 20 ms, SILK 10 ms = 480, two frames, three CELT frames = 2880, the 120 ms bound; an empty / a zero-count packet = 0');
}

console.log('§14 THE CLOCK (one sequence + one 48 kHz timestamp per session, across every on / off)');
{
  let c = SND.soundRtpStart(77);
  const p1 = SND.soundRtpStep(c, { samples: 960, at: 1000, fresh: true }); c = p1.st;
  const p2 = SND.soundRtpStep(c, { samples: 960, at: 1020 }); c = p2.st;
  const p3 = SND.soundRtpStep(c, { samples: 480, at: 1040 }); c = p3.st;
  ok(p1.seq === 77 && p1.marker === true && p2.seq === 78 && p2.ts === (p1.ts + 960) >>> 0 && p2.marker === false && p3.ts === (p2.ts + 960) >>> 0, 'the first packet is MARKED; inside a run each packet is the next number, its timestamp the last one\'s + that one\'s samples', [p1, p2, p3]);
  const q = SND.soundRtpStep(c, { samples: 960, at: 1060 + 5000, fresh: true });
  ok(q.seq === 80 && q.marker === true && q.ts === (p3.ts + 480 + 250 * 960) >>> 0, 'a press after 5 s off: the SAME sequence goes on (one stream, no jump the receiver reads as loss), the timestamp moves by the 5 s that passed (250 frames) — NetEq sees time pass; marked', q);
  const z = SND.soundRtpStep({ seq: 65535, ts: 0xFFFFFE00, at: 0, samples: 960 }, { samples: 960, at: 20 });
  ok(z.seq === 0 && z.ts === (0xFFFFFE00 + 960) % 0x100000000, 'the sequence wraps at 65536, the timestamp at 2^32', z);
  const now0 = SND.soundRtpStep({ seq: 5, ts: 1000, at: 100, samples: 960 }, { samples: 960, at: 110, fresh: true });
  ok(now0.ts === 1960 && now0.marker === true, 'a run that begins at once (an in-place restart) advances only the last packet\'s samples', now0);
  ok(SND.soundRtpStep(null, { at: 5 }).seq === 0 && SND.soundRtpStep(c, { samples: 0, at: 9 }).st.samples === 960 && SND.soundRtpStep(c, { samples: 99999, at: 9 }).st.samples === 960, 'no clock yet ⇒ a fresh one; a sample count that is no Opus count ⇒ one frame');
}

console.log('§15 THE TOGGLE 「声音」 (the verdict table) + the per-machine memory');
{
  const step = SND.soundStep, start = SND.soundStartOf;
  ok(start({}) === 'off' && start({ remembered: true, activated: true }) === 'on' && start({ remembered: true, restored: true, activated: true }) === 'tap' && start({ remembered: true, activated: false }) === 'tap' && start({ remembered: false, restored: true, activated: true }) === 'off', 'how a stream begins: OFF for a machine never turned on; remembered on + a person\'s gesture on this page ⇒ on; a RESTORED window (or no gesture yet) ⇒ 「点一下开声音」; never on otherwise');
  ok(same(step({ state: 'unavailable' }, { type: 'ready', ok: true }), { state: 'off', action: null, code: null }), 'a stream that carries the sound ⇒ 「声音」 shows, OFF by default — the machine captures nothing');
  ok(same(step({ state: 'unavailable' }, { type: 'ready', ok: true, remembered: true, activated: true }), { state: 'starting', action: 'start', code: null }), 'remembered on (a new window, a person\'s click opened it) ⇒ starting: the <video> unmuted + ONE op');
  ok(same(step({ state: 'unavailable' }, { type: 'ready', ok: true, remembered: true, restored: true, activated: true }), { state: 'tap', action: null, code: null }), 'remembered on, a RESTORED window ⇒ tap — 「点一下开声音」, nothing captured, nothing unmuted');
  ok(same(step({ state: 'off' }, { type: 'ready', ok: false }), { state: 'unavailable', action: null, code: 'no_mline' }) && same(step({ state: 'on' }, { type: 'ready', ok: false }), { state: 'unavailable', action: 'mute', code: 'no_mline' }), 'a stream without the sound\'s track (an older agent) ⇒ unavailable (no dead toggle); one that was on is muted');
  ok(same(step({ state: 'off' }, { type: 'press' }), { state: 'starting', action: 'start', code: null, remember: true }) && same(step({ state: 'tap' }, { type: 'press' }), { state: 'starting', action: 'start', code: null, remember: true }) && same(step({ state: 'refused', code: 'x' }, { type: 'press' }), { state: 'starting', action: 'start', code: null, remember: true }), 'off / tap / refused + press ⇒ starting (unmute IN the press + the op); this machine is remembered ON');
  ok(same(step({ state: 'on' }, { type: 'press' }), { state: 'off', action: 'stop', code: null, remember: false }) && same(step({ state: 'starting' }, { type: 'press' }), { state: 'off', action: 'stop', code: null, remember: false }), 'on / starting + press ⇒ off (the op off + muted); remembered OFF');
  ok(same(step({ state: 'unavailable' }, { type: 'press' }), { state: 'unavailable', action: null, code: 'no_mline' }), 'unavailable + press ⇒ nothing asked');
  ok(step({ state: 'starting' }, { type: 'started' }).state === 'on' && step({ state: 'off' }, { type: 'started' }).state === 'off', 'starting + the machine started ⇒ on; a late answer after off changes nothing');
  ok(same(step({ state: 'starting' }, { type: 'failed', code: 'no_ffmpeg' }), { state: 'refused', action: 'mute', code: 'no_ffmpeg' }) && same(step({ state: 'on' }, { type: 'failed', code: 'capture_ended' }), { state: 'refused', action: 'mute', code: 'capture_ended' }), 'the machine refused / its capture ended ⇒ refused by its code, muted');
  ok(same(step({ state: 'starting' }, { type: 'blocked' }), { state: 'tap', action: 'stop', code: 'autoplay' }), 'the browser kept it muted ⇒ tap (the machine stops capturing — nobody would hear it)');
  ok(same(step({ state: 'on' }, { type: 'stream_end' }), { state: 'unavailable', action: 'mute', code: 'no_stream' }) && same(step({ state: 'on' }, { type: 'close' }), { state: 'off', action: 'stop', code: null }) && step({ state: 'on' }, { type: 'close' }).remember === undefined, 'the stream ends ⇒ unavailable (its capture ended with the session); the window closes ⇒ off (stop) — the memory untouched (the next window of the machine)');
  // THE WHOLE MATRIX: only a press or a ready (soundStartOf's on) ever starts; a restored ready never does; only a press remembers
  const starts = [], remembers = [], restoredStarts = [];
  for (const s0 of SND.SOUND_STATES) for (const ev of SND.SOUND_EVENTS) for (const remembered of [false, true]) for (const restored of [false, true]) {
    const r = step({ state: s0 }, { type: ev, ok: true, remembered, restored, activated: true, code: 'x' });
    if (r.action === 'start') starts.push(`${s0}+${ev}${restored ? '(restored)' : ''}`);
    if (r.action === 'start' && ev === 'ready' && restored) restoredStarts.push(s0);
    if (r.remember !== undefined) remembers.push(`${s0}+${ev}`);
  }
  ok(starts.every((x) => /\+press/.test(x) || /\+ready$/.test(x)) && restoredStarts.length === 0, `the matrix (${SND.SOUND_STATES.length} states × ${SND.SOUND_EVENTS.length} events × memory × restored): only a press or a remembered ready starts — a RESTORED window never unmutes by itself`, { starts, restoredStarts });
  ok(remembers.every((x) => x.endsWith('+press')), 'only a press changes the memory', remembers);
  // RED CONTROL: a start verdict that ignores `restored` (it would unmute a restored window) fails the rows above
  const src = read('src/sound-model.js');
  const want = "  return restored || !activated ? 'tap' : 'on';";
  ok(src.includes(want), 'RED CONTROL anchor: the start verdict is spelled once');
  const M2 = MUT.load('src/sound-model.js', src.replace(want, "  return !activated ? 'tap' : 'on';"), 'restored-unmutes');
  const r2 = M2.soundStep({ state: 'unavailable' }, { type: 'ready', ok: true, remembered: true, restored: true, activated: true });
  ok(r2.action === 'start', 'RED CONTROL: a mutant that ignores `restored` STARTS a restored window\'s sound — the never-by-itself row catches it', r2);
  // THE MEMORY (the HDR switch's shape): per machine, on only, ≤ 32 machines, the newest kept
  ok(SND.SOUND_KEY === 'vibespace.streamSound' && SND.soundRemembered(null, 'win-a') === false && SND.soundRemembered('not json', 'win-a') === false && SND.soundRemembered('[1]', 'win-a') === false, 'its localStorage key; nothing stored / junk ⇒ off');
  let m = SND.rememberSound(null, 'win-a', true); m = SND.rememberSound(m, 'mac-b', true);
  ok(SND.soundRemembered(m, 'win-a') && SND.soundRemembered(m, 'mac-b') && !SND.soundRemembered(m, 'x') && !SND.soundRemembered(SND.rememberSound(m, 'win-a', false), 'win-a') && SND.soundRemembered(SND.rememberSound(m, 'win-a', false), 'mac-b'), 'on is remembered PER MACHINE; off forgets that machine alone');
  let big = null; for (let i = 0; i < 40; i++) big = SND.rememberSound(big, 'h' + i, true);
  const keys = Object.keys(JSON.parse(big));
  ok(keys.length === 32 && keys[0] === 'h8' && keys[31] === 'h39' && !SND.soundRemembered(SND.rememberSound(null, '', true), ''), 'at most 32 machines, the newest kept; no machine id ⇒ nothing remembered');
}

console.log('§16 the sound\'s words (refusals, consent — zh + ja)');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const has = (dict, k) => dict.includes(`  ${JSON.stringify(k)}: `);
  const codes = ['no_mline', 'sound_unsupported', 'helper_missing', 'no_ffmpeg', 'screen_permission', 'helper_changed_regrant', 'not_found', 'autoplay', 'capture_failed'];
  const keys = [...new Set(codes.map(SND.soundRefusalKey))];
  ok(keys.length === codes.length && keys.every((k) => has(zh, k) && has(ja, k)), `every refusal code has its own words, in zh and ja (${keys.length})`, keys.filter((k) => !has(zh, k) || !has(ja, k)));
  const mac = SND.soundConsentKeys('darwin'), win = SND.soundConsentKeys('win32');
  ok(mac.length === 2 && win.length === 1 && SND.soundConsentKeys('linux').length === 0 && [...mac, ...win].every((k) => has(zh, k) && has(ja, k)), 'the consent: a Mac names its permission + the one re-grant after the helper updates; Windows asks nothing; another machine says nothing');
  ok(zh.includes(`${JSON.stringify(mac[0])}: "声音用的是同一个“屏幕与系统录音”授权"`) && zh.includes(`${JSON.stringify(win[0])}: "声音：Windows 不需要授权"`) && zh.includes('"Tap to turn the sound on": "点一下开声音"'), 'the brief\'s words: 「声音用的是同一个“屏幕与系统录音”授权」, 「声音：Windows 不需要授权」, 「点一下开声音」');
  const strip = read('src/lib/stream-mic-strip.js');
  ok(/t\('Play this machine’s sound here — off until you press it; nothing is recorded or stored'\)/.test(strip) && /t\('Sound on — press to turn it off; nothing is recorded or stored'\)/.test(strip) && zh.includes('不录制、不保存'), 'the toggle\'s title says nothing is recorded or stored (zh: 不录制、不保存)');
}

console.log('§17 THE RATE with the sound (src/stream-model.js videoKbpsOf) + the page\'s read of it (statsOf `audio`)');
{
  const v = STM.videoKbpsOf, W = SND.SOUND.wireKbps;
  ok(v({ kbps: 5000, maxKbps: 8000 }) === 5000 && v({ kbps: 9000, maxKbps: 8000 }) === 8000 && v({ kbps: 4321.5, maxKbps: 8000 }) === 4321.5 && v({ kbps: 0, maxKbps: 8000 }) === 0, 'the sound OFF: the estimate capped by the page\'s maxKbps — exactly the rule before this lane (Math.min)');
  ok(v({ kbps: 5000, maxKbps: 8000, audio: true, audioKbps: W }) === 4920 && v({ kbps: 9000, maxKbps: 8000, audio: true, audioKbps: W }) === 7920, `the sound ON: its ${W} kbps come OFF the picture's target (the estimate counts the picture's packets only — the sound carries no transport-cc number)`);
  ok(v({ kbps: 320, maxKbps: 8000, audio: true, audioKbps: W }) === STM.STREAM_LIMITS.maxKbpsMin && v({ kbps: 222, audio: true, audioKbps: W }) === 222 && v({ kbps: 100, audio: true, audioKbps: W }) === 100, `the sound never pushes the picture under the stream's floor (${STM.STREAM_LIMITS.maxKbpsMin} kbps) and never RAISES it: an estimate already under the floor is told as it is (⑳ measured 222 kbps on loopback — the floor rule first written told 300)`);
  for (let k = 0; k <= 20000; k += 37) if (v({ kbps: k, maxKbps: 8000, audio: true, audioKbps: W }) > v({ kbps: k, maxKbps: 8000 })) { ok(false, 'the sound ON never tells the picture MORE than the sound off', k); break; }
  ok(true, 'for every estimate 0–20000 kbps: the sound ON never tells the picture more than the sound off');
  ok(v({ kbps: null, maxKbps: 6000, audio: true, audioKbps: W }) === 5920 && v({ kbps: undefined, maxKbps: 6000 }) === 6000 && v({ kbps: 'x', maxKbps: 'y' }) === STM.STREAM_LIMITS.maxKbpsDefault, 'no estimate yet ⇒ the cap (less the sound while it is on); junk ⇒ the default cap');
  const rep = (packets, bytes, level) => [{ id: 'v', type: 'inbound-rtp', kind: 'video', framesDecoded: 10, bytesReceived: 1000 }, { id: 'a', type: 'inbound-rtp', kind: 'audio', packetsReceived: packets, bytesReceived: bytes, audioLevel: level, totalAudioEnergy: 0.5, concealedSamples: 960, jitter: 0.004 }];
  const s1 = STM.statsOf(null, rep(50, 10000, 0.1), 1000), s2 = STM.statsOf(s1, rep(100, 20000, 0.09), 2000);
  ok(s1.audio && s1.audio.packets === 50 && s1.audio.level === 0.1 && s1.audio.kbps === null && s2.audio.kbps === 80 && s2.audio.jitterMs === 4 && s2.audio.concealed === 960 && STM.statsOf(null, rep(1, 1, 0).slice(0, 1), 1).audio === null, 'the page\'s read: the sound\'s packets, its level, its kbps between two reads, its jitter, the concealed samples — none when the stream carries no sound', s2.audio);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
