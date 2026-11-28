#!/usr/bin/env node
// THE HEAVY TWIN OF test-stream-mac (B-7e49, lane bl-tests-chrome, 主开发 r4363): its §6 and §7 — a REAL Mac-shaped daemon (the
// device agent's bundle from data/bin run as a child with the darwin roads switched on, its screen helper and injector the fake
// helper at the fixed path, a werift stand-in browser, REAL ps) — MOVED VERBATIM from test-stream-mac by the tier rule (a leg that
// runs the real daemon is heavy): profiled alone on the test machine, these sections start the helper fifteen times and the
// injector ten (run a58bf77d1-20261125154747-box). test-stream-mac keeps §1 to §5b (the PURE plan, the helper's source and place,
// the identity, the source and the injector over the fake helper) and §T, the pin that this file holds the daemon legs.
// The head below is test-stream-mac's own, verbatim (its imports, helpers and fixtures); daemonLegs is the same function,
// called here alone instead of beside §4 to §5b.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { flvBytes } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeMacHelper, helperLog, MAC_FACTS, writeFakeCodesign } from './fixtures/stream/mac-fakes.mjs';
import * as CS from './fixtures/stream/codesign-outputs.mjs'; // lane apple-signing
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const T0 = Date.now();
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(25); } return false; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const SW = require(path.join(REPO, 'src/stream-window.js')); // int304: THE window shape (lane stream-p2w-build's PURE file)
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
const I = require(path.join(REPO, 'src/input-inject.js'));
const MAC = require(path.join(REPO, 'src/agentd/stream-mac.js'));
const SRC = require(path.join(REPO, 'src/agentd/mac-helper-source.js'));
const MI = require(path.join(REPO, 'src/mac-helper-identity.js')); // lane apple-signing: who signed a pushed helper
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(FIXTURE)));
const K0 = AUS.findIndex((a) => a.key);
const homes = [];
const home = (n) => { const h = scratchHome(n, fs, ['.vibespace']); homes.push(h); return h; };
const cleanups = [];
process.on('exit', () => { for (const f of cleanups) { try { f(); } catch { } } for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } } });
const flvFile = (h) => { const f = path.join(h, 'desk.flv'); fs.writeFileSync(f, flvBytes(AUS.slice(K0), 30)); return f; };
const facts = (over = {}) => ({ platform: 'darwin', helper: { state: 'ready', bin: '/Users/u/.vibespace/helpers/vibespace-screen', regrant: false }, tcc: { screen: 'granted', accessibility: 'granted' }, ...SP.parseMacFacts(JSON.stringify({ t: 'facts', ...MAC_FACTS, tcc: { screen: 'granted' } })), ...over });


async function daemonLegs() {
console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§6 a REAL Mac-shaped daemon');
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const w = require(path.join(REPO, 'node_modules/werift'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/, INJ = /(createInjector\(\{\s*)platform: process\.platform,/, SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
const fcDir = scratch('smac-codesign'); homes.push(fcDir); const FC = writeFakeCodesign(fcDir); // lane apple-signing: the daemon judges a pushed helper through THIS codesign
const macText = bundleText.replace(HELLO, '$1platform: "darwin",').replace(INJ, '$1platform: "darwin",').replace(SCR, '$1platform: "darwin",').replace(/"\/usr\/bin\/codesign"/g, JSON.stringify(FC.bin));
const darwins = (t) => (t.match(/platform: "darwin",/g) || []).length;
ok(darwins(macText) - darwins(bundleText) === 3 && gateOf(/function createMacScreen\(/.test(macText)) && verdictOf(/"stream-mac", "stream-window"/.test(macText)), 'the copy says darwin three times (the hello-ack, THE injector, THE screen source — found by content); the bundle carries the Mac source and both capabilities');
ok((bundleText.match(/"\/usr\/bin\/codesign"/g) || []).length >= 2 && !/"\/usr\/bin\/codesign"/.test(macText) && verdictOf(macText.includes(JSON.stringify(FC.bin))), 'lane apple-signing: the copy\'s /usr/bin/codesign (the identity judge + the local build\'s signer, found by content) is the fake codesign');
const copyDir = scratch('smac-bundle'); fs.mkdirSync(copyDir, { recursive: true }); homes.push(copyDir);
const macBundle = path.join(copyDir, 'mac', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(macBundle), { recursive: true }); fs.writeFileSync(macBundle, macText);
const oldBundle = path.join(copyDir, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, macText.replace(', "stream-mac", "stream-window", "stream-windows"', ''));
const devices = [], peers = [], daemonHomes = [];
const rootOf = (h) => path.join(h, 'agentd-root');
cleanups.push(() => { for (const p of peers) { try { p.close(); } catch { } } for (const d of devices) { try { d.stop(); } catch { } } for (const h of daemonHomes) endDaemonsOf(rootOf(h)); });
function deviceOn(h, bundlePath) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h); daemonHomes.push(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  return dm;
}
function standIn() {
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [new w.RTCRtpCodecParameters({ mimeType: SM.STREAM_CODEC.mimeType, clockRate: SM.STREAM_CODEC.clockRate, rtcpFeedback: SM.STREAM_CODEC.rtcpFeedback.map((f) => ({ ...f })), parameters: SM.STREAM_CODEC.fmtp })] } });
  peers.push(pc);
  const got = { rtp: [], dc: null };
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => { got.rtp.push({ marker: r.header.marker, payload: Buffer.from(r.payload) }); }));
  pc.onDataChannel.subscribe((ch) => { got.dc = ch; });
  return { pc, got };
}
const pictures = (rtp) => { const out = []; let cur = []; for (const p of rtp) { cur.push(p.payload); if (p.marker) { out.push(H.depacketize(cur)); cur = []; } } return out; };
{
  const hD = home('smac-daemon'), logD = path.join(hD, 'd.log');
  writeFakeMacHelper(hD, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logD, flv: flvFile(hD), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  const dm = deviceOn(hD, macBundle);
  const conn = await dm.connect();
  ok(conn.info.platform === 'darwin' && verdictOf(same(conn.info.capabilities.slice(-12), ['stream-offer', 'input-events', 'stream-facts', 'stream-screen', 'stream-mac', 'stream-window', 'stream-windows', 'settings-open', 'desktop-grab', 'desktop-input', 'stream-mic', 'stream-audio'])), 'the hello-ack names stream-mac + stream-window (after stream-screen), then the picker op\'s stream-windows (int304), then 「打开系统设置」\'s settings-open (lane stream-mac-stall), then the hand-over\'s desktop-grab / desktop-input (lane desktop-handover), then the microphone\'s stream-mic (lane stream-mic-road)', conn.info.capabilities.slice(-8));
  const v = SM.streamRungVerdict({ capabilities: conn.info.capabilities, desktop: true, platform: conn.info.platform });
  const f = await dm.streamFacts();
  ok(gateOf(v.take) && v.source === 'screen' && gateOf(f.ok) && f.platform === 'darwin' && f.helper.state === 'ready' && f.primary.rung === '1440p60' && f.windows.length === 2, 'the rung takes the Mac\'s screen; the stream-facts op answers the Mac\'s facts through its helper', f.primary);
  const pw = await dm.streamWindows();
  ok(gateOf(pw.ok) && pw.platform === 'darwin' && pw.windows.length === 2 && pw.windows[0].id === '4242' && pw.windows[0].dpi === 192 && pw.windows[0].bounds.w === 1312 && pw.windows[1].minimized === true, 'int304: THE ONE PICKER door on a Mac — the daemon\'s stream-windows op answers its helper\'s windows in the window shape (the same rows as a Windows machine\'s)', pw);
  const pushes = [];
  const b = standIn();
  const off = await dm.streamOffer({ sourceKind: 'screen' }, { onPush: (m) => { pushes.push(m); if (m.op === 'stream-ice' && m.candidate) b.pc.addIceCandidate(m.candidate).catch(() => { }); } });
  if (off.ok) { await b.pc.setRemoteDescription(off.offer); await b.pc.setLocalDescription(await b.pc.createAnswer()); await dm.streamAnswer(off.sid, { answer: { type: 'answer', sdp: b.pc.localDescription.sdp } }); }
  const flowing = await until(() => pictures(b.got.rtp).length >= 30, 8000);
  const pics = pictures(b.got.rtp);
  const matches = pics.slice(0, 30).filter((p, i) => { const a = AUS[K0 + i]; return p.length === a.nalus.length && p.every((n, k) => Buffer.compare(n, a.nalus[k]) === 0); }).length;
  ok(gateOf(off.ok) && off.source.kind === 'screen' && off.source.encoder === 'VideoToolbox' && off.source.mode === 'videotoolbox' && off.source.fps === 60 && gateOf(flowing) && matches === 30, 'a screen offer on the Mac: VideoToolbox at 60; the browser gets THE fixture byte for byte (helper FLV → access units → RTP)', { src: off.source || off, n: pics.length, matches });
  ok(gateOf(off.ok) && gateOf(off.helper) && off.helper.version === SRC.VERSION && off.helper.dir === SP.macHelperPaths(hD).dir && off.helper.wantSigned === false && off.helper.identity === null, 'lane apple-signing: the offer answer carries the helper\'s identity facts — no Team ID pinned today ⇒ wantSigned false (the hub pushes nothing)', off.helper);
  await until(() => b.got.dc && b.got.dc.readyState === 'open', 4000);
  for (const e of [{ t: 'kd', c: 'KeyS' }, { t: 'ku', c: 'KeyS' }, { t: 'md', x: 1280, y: 720, b: 0 }, { t: 'mu', x: 1280, y: 720, b: 0 }]) b.got.dc.send(JSON.stringify(e));
  const inputs = () => helperLog(logD).filter((l) => l.input).map((l) => l.input);
  await until(() => inputs().length >= 7, 4000);
  ok(verdictOf(same(inputs().slice(0, 7), ['P 0', 'K 1 0', 'K 1 1', 'M 960 540', 'D 0', 'M 960 540', 'U 0'])), 'the data channel\'s key + click reached the helper\'s input: the frontmost app, the virtual key code, the picture\'s centre in global points (×0.75)', inputs());
  ok(gateOf(off.ok) && off.source.display === '3' && verdictOf(same(off.source.displays.map((d) => [d.id, d.main, d.primary, d.x, d.w, d.pw, d.ph, d.hdr, d.name]), [['3', true, true, 0, 1920, 3840, 2160, true, 'Studio 27 (2)'], ['2', false, false, -1920, 1920, 3840, 2160, true, 'Studio 27 (1)']])), 'lane stream-mac-stall: the offer names the display streamed (the main one) and the Mac\'s displays — the strip\'s switcher (it drew none over a stream: one display was all there was); lane desktop-display-modes: + primary, HDR and the real pixels (the Windows rows\' shape; x / w stay points)', off.source);
  const st = await dm.streamStats(off.sid);
  ok(gateOf(st.ok) && gateOf(st.stats.screen) && st.stats.screen.encoder === 'VideoToolbox' && st.stats.input.n >= 4, 'the session\'s numbers carry the Mac source\'s and the input count', st.stats && st.stats.screen);
  await dm.streamStop(off.sid);
  b.pc.close();
  const off2 = await dm.streamOffer({ sourceKind: 'screen', sourceId: '2' }, { onPush: () => { } });
  ok(gateOf(off2.ok) && off2.source.display === '2' && off2.source.displays.length === 2, 'a display picked on the switcher = THAT display\'s offer (source {kind: display, id} → the plan\'s --display)', off2.source || off2);
  if (off2.ok) await dm.streamStop(off2.sid);
  const sb = await dm.settingsOpen('bogus', { by: 'system:test' });
  ok(gateOf(conn.info.capabilities.includes('settings-open')) && sb.ok === false && sb.code === 'bad_pane', 'lane stream-mac-stall: `settings-open` in the hello-ack; the op reaches the Mac\'s source through the real daemon and answers by name (bad_pane — no `open` runs on this box)', sb);

  const hO = home('smac-old');
  writeFakeMacHelper(hO, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted' } });
  const dmo = deviceOn(hO, oldBundle);
  const co = await dmo.connect();
  let asked = 0;
  const real = dmo.streamOffer.bind(dmo); dmo.streamOffer = (...a) => { asked++; return real(...a); };
  const vo = SM.streamRungVerdict({ capabilities: co.info.capabilities, desktop: true, platform: co.info.platform });
  const hub = DW.create({ access: { streamRung: async () => ({ ...vo, dm: dmo, platform: 'darwin' }) }, relay: false, udpLeg: false, log: { log: () => { }, warn: () => { } } });
  const so = await hub.start('host-old');
  ok(!co.info.capabilities.includes('stream-mac') && gateOf(co.info.capabilities.includes('stream-screen')) && so.take === false && so.code === 'agent_too_old' && asked === 0, 'THE CAPABILITY GATE: an older Mac agent (stream-screen, no stream-mac) ⇒ agent_too_old and it is NEVER asked', { so, asked });
  hub.shutdown?.(); dmo.stop(); endDaemonsOf(rootOf(hO));
  // an agent that predates 「打开系统设置」 on the Mac (no settings-open) is never asked: host_needs_daemon (the page copies the link)
  const preOpen = path.join(copyDir, 'pre-open', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(preOpen), { recursive: true }); fs.writeFileSync(preOpen, macText.replace(', "settings-open"', ''));
  const hQ = home('smac-pre-open');
  writeFakeMacHelper(hQ, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted' } });
  const dmq = deviceOn(hQ, preOpen);
  const cq = await dmq.connect();
  let qAsked = 0;
  const realReq = dmq._request.bind(dmq); dmq._request = (m, ...rest) => { if (m && m.op === 'settings-open') qAsked++; return realReq(m, ...rest); };
  const eq = await dmq.settingsOpen('screen', { by: 'system:test' }).then(() => null, (e) => e);
  ok(!cq.info.capabilities.includes('settings-open') && gateOf(cq.info.capabilities.includes('stream-windows')) && gateOf(eq) && eq.code === 'host_needs_daemon' && qAsked === 0, 'THE CAPABILITY GATE: an agent without settings-open is NEVER asked (host_needs_daemon — the hub answers agent_too_old, the page copies the link)', { code: eq && eq.code, qAsked });
  dmq.stop(); endDaemonsOf(rootOf(hQ));

  const hP = home('smac-push'), logP = path.join(hP, 'p.log'), PP = SP.macHelperPaths(hP), hubBin = path.join(hP, 'hub-helpers');
  const FP = writeFakeMacHelper(hP, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted' }, log: logP, flv: flvFile(hP), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  fs.mkdirSync(hubBin, { recursive: true }); fs.renameSync(FP.bin, path.join(hubBin, 'vibespace-screen')); fs.renameSync(FP.bin + '.version', path.join(hubBin, 'vibespace-screen.version'));
  fs.writeFileSync(path.join(hubBin, 'vibespace-screen.identity.json'), JSON.stringify({ version: SRC.VERSION, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(hubBin, 'vibespace-screen'))).digest('hex'), kind: 'adhoc', teamId: null, identifier: null, notarized: false })); // an identity record beside the hub's prebuilt (round 4: advisory — present, it must name the bytes; the daemon leg keeps one)
  const dmp = deviceOn(hP, macBundle);
  const cp = await dmp.connect();
  const vp = SM.streamRungVerdict({ capabilities: cp.info.capabilities, desktop: true, platform: cp.info.platform });
  const logs2 = [];
  const hub2 = DW.create({ access: { streamRung: async () => ({ ...vp, dm: dmp, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, log: { log: (m) => logs2.push(m), warn: (m) => logs2.push(m) } });
  const sp = await hub2.start('host-push');
  ok(sp.take === true && gateOf(sp.source) && sp.source.encoder === 'VideoToolbox' && fs.readFileSync(PP.version, 'utf8') === SRC.VERSION && (gateOf(fs.statSync(PP.bin).mode & 0o111)) && verdictOf(logs2.some((m) => /pushed this hub's prebuilt/.test(m))), 'a Mac with no helper and no compiler: the offer said no_helper, the HUB pushed its prebuilt over the device link, the agent put it in place and the offer — asked once more — streams', { sp: { take: sp.take, code: sp.code, why: sp.why }, logs2 });
  const csLog = fs.existsSync(FC.log) ? fs.readFileSync(FC.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  ok(gateOf(csLog.some((x) => x[0] === '--verify' && x[1] === '--strict' && x[x.length - 1] === PP.incoming(SRC.VERSION))) && gateOf(csLog.some((x) => x[0] === '-dv' && x[x.length - 1] === PP.incoming(SRC.VERSION))) && !csLog.some((x) => x[0] === '-dr') && JSON.parse(fs.readFileSync(PP.state, 'utf8')).identity.kind === 'adhoc', 'lane apple-signing: the REAL daemon judged the pushed file through codesign (--verify --strict, then -dv; never -dr for an ad-hoc one — round 2) at its INCOMING path before putting it in place; the state records ad-hoc (taken: no Team ID pinned)', csLog);
  fs.writeFileSync(path.join(hubBin, 'vibespace-screen.version'), 'vs-other');
  const r = await DW.pushMacHelper(dmp, { dir: PP.dir, version: SRC.VERSION }, hubBin);
  ok(r.ok === false && r.code === 'no_helper' && verdictOf(/vs-other/.test(r.error)), 'a hub whose prebuilt is another version pushes nothing (an agent would never take it)', r);
  { // lane apple-signing: THE HUB'S SIDE — the prebuilt must be what its identity record and the release manifest describe; the signed one is pushed ONCE over an ad-hoc helper
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    fs.writeFileSync(path.join(hubBin, 'vibespace-screen.version'), SRC.VERSION);
    const hb = path.join(hubBin, 'vibespace-screen');
    const ident = (o) => fs.writeFileSync(hb + '.identity.json', JSON.stringify({ version: SRC.VERSION, sha256: sha(hb), kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER, notarized: false, ...o }));
    const writes = [];
    const dmF = { fsWriteStream: async (p2, o) => { writes.push(p2); await new Promise((res, rej) => o.source.on('end', res).on('error', rej).resume()); } };
    const need = { dir: PP.dir, version: SRC.VERSION }, noMan = path.join(hP, 'no-manifest.json'), manF = path.join(hP, 'manifest.json');
    ident({ sha256: 'f'.repeat(64) });
    const r1 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan });
    ok(r1.ok === false && r1.code === 'helper_unsigned' && gateOf(/not the one its identity record describes/.test(r1.error)) && writes.length === 0, 'a prebuilt its identity record does not describe (another sha256) is never pushed: helper_unsigned', r1);
    ident({});
    fs.writeFileSync(manF, JSON.stringify({ v: 1, helper: { version: SRC.VERSION, sha256: 'e'.repeat(64), identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } } }));
    const r2 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF });
    ok(r2.ok === false && r2.code === 'helper_unsigned' && gateOf(/not the release's/.test(r2.error)) && writes.length === 0, 'a prebuilt the release manifest\'s helper row does not name is never pushed: helper_unsigned (the hub pushes only what the release signed)', r2);
    fs.writeFileSync(manF, JSON.stringify({ v: 1, helper: { version: SRC.VERSION, sha256: sha(hb), identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } } }));
    const r3 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
    ok(r3.ok === true && r3.identity === 'developer-id' && writes.length === 1 && writes[0] === PP.incoming(SRC.VERSION), 'the prebuilt the record AND the manifest describe is pushed (signedOnly: a Developer ID build) to the incoming path', r3);
    ident({ kind: 'adhoc', teamId: null, identifier: null });
    const r4 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan, signedOnly: true });
    ok(r4.ok === false && r4.code === 'helper_unsigned' && gateOf(/not a Developer ID build/.test(r4.error)) && writes.length === 1, 'signedOnly over an ad-hoc prebuilt pushes nothing (the Mac keeps the helper it has)', r4);
    { // ROUND 4 (acceptance r3 M1 + M2) — THE RULE on the hub: the release row and the identity record are checks WHEN PRESENT, their absence is no refusal. THE FOUR ROADS:
      // road 1 — a row that names this very prebuilt, and NO identity record (the mac-helper workflow's two assets) ⇒ pushed, the words name the release
      fs.rmSync(hb + '.identity.json');
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: sha(hb), identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const w1 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF });
      ok(w1.ok === true && w1.identity === 'adhoc' && gateOf(/^named by the signed release 9\.9\.9 \(sha256 [0-9a-f]{12}…\)$/.test(w1.note)) && writes.length === 2, 'road 1 — the signed release\'s row names this prebuilt (version + sha256) ⇒ pushed, even without an identity record (the workflow\'s two assets; acceptance r3: 808126df3 refused for the missing file); the words name the release, the identity is the row\'s kind (round 5)', w1);
      // road 2 — a row that names another version, or other bytes than the file ⇒ refused by name (the ONE refusal the r1 brief asked for)
      ident({});
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: 'vs-other', sha256: sha(hb), identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const w2a = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF });
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: 'e'.repeat(64), identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const w2b = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF });
      ok(w2a.ok === false && w2a.code === 'helper_unsigned' && gateOf(/names Mac screen helper vs-other, this hub's prebuilt is/.test(w2a.error)) && w2b.ok === false && w2b.code === 'helper_unsigned' && gateOf(/not the release's \(sha256/.test(w2b.error)) && writes.length === 2, 'road 2 — a row that names ANOTHER version, or OTHER bytes than the file ⇒ refused by name, nothing pushed', { w2a: w2a.error, w2b: w2b.error });
      // road 3 — no row (every release signed on the Linux release machine) + an identity record ⇒ pushed, the words say unsigned
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9' }));
      const w3 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF });
      ok(w3.ok === true && w3.identity === 'developer-id' && gateOf(/^unsigned prebuilt \(sha256 [0-9a-f]{12}…; the signed release 9\.9\.9 names no Mac screen helper\) — the device judges it$/.test(w3.note)) && writes.length === 3, 'road 3 — a signed release whose record names NO helper + a prebuilt with its identity record ⇒ PUSHED (acceptance r3: 808126df3 refused — every release signed on the Linux release machine carries no row); the words say «unsigned prebuilt — the device judges it»', w3);
      // road 4 — no row + no identity record (a dev hub fed the workflow's two assets) ⇒ pushed by sha256, the words say unsigned + unverified identity
      fs.rmSync(hb + '.identity.json');
      const w4 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan });
      ok(w4.ok === true && w4.identity === null && gateOf(/^unsigned prebuilt \(sha256 [0-9a-f]{12}…; no signed release record on this hub\) — the device judges it; its identity is unverified here \(no vibespace-screen\.identity\.json beside it\)$/.test(w4.note)) && writes.length === 4, 'road 4 — no row and no identity record ⇒ PUSHED by sha256 (acceptance r3: 808126df3 refused the workflow\'s own assets); the words say unsigned + unverified identity', w4);
      // the identity record is advisory: absent, a signedOnly push is refused (unrecorded identity); present, it must name the file (a stale version here; other bytes = r1 above)
      const w5 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan, signedOnly: true });
      ident({ version: 'vs-stale' });
      const w5b = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan });
      ok(w5.ok === false && w5.code === 'helper_unsigned' && gateOf(/of unrecorded identity \(no vibespace-screen\.identity\.json beside it\), not a Developer ID build/.test(w5.error)) && w5b.ok === false && w5b.code === 'helper_unsigned' && gateOf(/identity record is for vs-stale/.test(w5b.error)) && writes.length === 4, 'the identity record is advisory: absent, a signedOnly push is refused (unrecorded identity — the signed road needs the third asset); present for another version ⇒ the stale pair named, nothing pushed', { w5: w5.error, w5b: w5b.error });
      ident({});
      // round 3 (acceptance r1 M1): the bytes the Mac refused or still judges are not sent again; round 4: a refusal with a door names the time
      const r8 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: sha(hb), code: 'helper_unsigned', why: 'signed by team ZZOTHER002; this agent pins no Team ID yet' } }, hubBin, { manifestFile: noMan });
      const r9 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: 'a'.repeat(64), code: 'helper_unsigned', why: 'x' } }, hubBin, { manifestFile: noMan });
      const r10 = await DW.pushMacHelper(dmF, { ...need, pending: { version: SRC.VERSION, sha256: sha(hb), tries: 2 } }, hubBin, { manifestFile: noMan });
      const r11 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: sha(hb), code: 'helper_unsigned', why: 'codesign did not answer 3 times', until: Date.UTC(2030, 0, 2, 3, 4, 5) } }, hubBin, { manifestFile: noMan });
      ok(r8.ok === false && r8.code === 'helper_unsigned' && gateOf(/refused this very prebuilt/.test(r8.error)) && gateOf(/pins no Team ID yet/.test(r8.error)) && gateOf(/not sent again \(a different/.test(r8.error)) && r9.ok === true && r10.ok === false && r10.code === 'no_helper' && gateOf(/holds this prebuilt already/.test(r10.error)) && gateOf(/codesign answered nothing 2 of 3 times so far; the next check is try 3 of 3/.test(r10.error)) && r11.ok === false && r11.code === 'helper_unsigned' && gateOf(/not sent again before 2030-01-02T03:04:05\.000Z or the agent's next start/.test(r11.error)) && writes.length === 5, 'M1 on the hub: the bytes the Mac refused are not sent again (its why rides the answer); a refusal of OTHER bytes holds nothing back (pushed — judged afresh there); bytes the Mac still judges are not re-sent; a refusal with a door (`until`) says when the Mac judges them again', { r8: r8.error, r9, r10: r10.error, r11: r11.error });
      const dmR = (refusedSha) => ({ ...dmF, streamOffer: async () => ({ ok: false, code: 'helper_unsigned', error: 'the screen helper the hub pushed was refused', helper: { dir: PP.dir, version: SRC.VERSION, refused: { version: SRC.VERSION, sha256: refusedSha, code: 'helper_unsigned', why: 'signed by team ZZOTHER002; this agent pins no Team ID yet' } } }), streamStop: async () => ({ ok: true }) });
      const logs4 = []; const hub4 = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmR(sha(hb)), platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, log: { log: (m) => logs4.push(m), warn: (m) => logs4.push(m) } });
      const s4 = await hub4.start('host-refused'); hub4.shutdown?.();
      ok(s4.take === false && s4.code === 'helper_unsigned' && gateOf(/refused this very prebuilt/.test(s4.why)) && gateOf(/not sent again/.test(s4.why)) && writes.length === 5 && verdictOf(logs4.some((m) => /refused a screen helper/.test(m) && /not sent again/.test(m))), 'start(): a Mac that REFUSED this hub\'s prebuilt gets it no second time — the refusal\'s why rides the stream verdict (the page\'s detail) and the log', { s4, logs4 });
      writes.length = 1; // the count the signed-push leg below expects (its pushes are its own)
    }
    ident({});
    const dmO = { ...dmF, streamOffer: async () => ({ ok: true, sid: 'sx', offer: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: true } }), streamStop: async () => ({ ok: true }) };
    const logs3 = [];
    const hub3 = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmO, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, log: { log: (m) => logs3.push(m), warn: (m) => logs3.push(m) } });
    const s1 = await hub3.start('host-signed'); const s2 = await hub3.start('host-signed');
    ok(s1.take === true && s2.take === true && writes.length === 2 && logs3.filter((m) => /pushed this hub's signed prebuilt/.test(m)).length === 1, 'an offer answer whose helper says wantSigned ⇒ the hub pushes its signed prebuilt ONCE per machine (a second start pushes nothing; the manifest copy beside the bundle is absent in a worktree, so the identity record decides)', { writes: writes.length, logs3 });
    for (const k of [s1.key, s2.key]) if (k) await hub3.stop(k, 'stopped').catch(() => { });
    hub3.shutdown?.();
    { // ROUND 5 (acceptance r4 — r4 held; five minors, all the hub's push edges)
      const w0 = writes.length;
      // leg «r5 record unreadable»: a record that EXISTS but is not a JSON object (truncated / an array / null) is refused by name — never taken for absent (808126df3 refused it; round 4 pushed with words that said «no record»); a record without a sha256 is malformed
      const idp = hb + '.identity.json', rec = {};
      for (const [k, text] of [['truncated', '{"version":"vs-other","sha256":"'], ['array', '[1]'], ['null', 'null'], ['nosha', JSON.stringify({ version: SRC.VERSION, kind: 'adhoc' })]]) { fs.writeFileSync(idp, text); rec[k] = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan }); }
      ok(gateOf(['truncated', 'array', 'null'].every((k) => rec[k].ok === false && rec[k].code === 'helper_unsigned' && /vibespace-screen\.identity\.json unreadable: /.test(rec[k].error) && !/no vibespace-screen\.identity\.json beside it/.test(rec[k].error))) && gateOf(/unreadable: not a JSON object \(an array\)/.test(rec.array.error)) && gateOf(/unreadable: not a JSON object \(null\)/.test(rec.null.error)) && rec.nosha.ok === false && rec.nosha.code === 'helper_unsigned' && gateOf(/malformed identity record \(vibespace-screen\.identity\.json names no sha256\)/.test(rec.nosha.error)) && !/vs undefined/.test(rec.nosha.error) && writes.length === w0, 'r5 record unreadable — an identity record that is THERE but cannot be read (truncated, an array, null) is refused by name «vibespace-screen.identity.json unreadable: <why>», never taken for absent (acceptance r4: c9a6b6ede pushed and said «no record»); one that names no sha256 is called malformed (was «vs undefined»)', rec);
      { // the mutant control: a copy of desktop-webrtc.js whose unreadable-record refusal is skipped takes the truncated record for absent — pushes, and says «no record»
        const hubSrc = fs.readFileSync(path.join(REPO, 'src/server/desktop-webrtc.js'), 'utf8');
        const mutText = editAnchor(hubSrc, 'if (identBad !== null) return refuse(', 'if (false && identBad !== null) return refuse(', "src/server/desktop-webrtc.js").replace(/require\('\.\.\/([^']+)'\)/g, (m, f) => `require(${JSON.stringify(path.join(REPO, 'src', f))})`);
        const mutFile = path.join(home('smac-hubmut'), 'desktop-webrtc-mutant.js'); fs.writeFileSync(mutFile, mutText);
        const MUT = require(mutFile);
        fs.writeFileSync(idp, '{"version":"vs-other","sha256":"');
        const rm = await MUT.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan });
        ok(mutText !== hubSrc && rm.ok === true && gateOf(/no vibespace-screen\.identity\.json beside it/.test(rm.note)) && writes.length === w0 + 1, 'RED CONTROL: the copy whose unreadable-record refusal is skipped PUSHES the prebuilt under a truncated record and says «no vibespace-screen.identity.json beside it» (round 4\'s words) — the leg above would fail on it', rm);
      }
      ident({});
      // leg «r5 bytes sent»: the bytes SENT are hashed as they go and must be the bytes NAMED — a prebuilt replaced under the push (an operator's drop into data/bin/helpers/ while the device link opens) is refused by name, the Mac asked to drop what it got
      const A = fs.readFileSync(hb), modeA = fs.statSync(hb).mode, B = Buffer.concat([A.subarray(0, A.length - 1), Buffer.from([A[A.length - 1] ^ 0x01])]); // the same size, other bytes
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: sha(hb), identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } } }));
      const other = path.join(hubBin, 'vibespace-screen.new'); fs.writeFileSync(other, B, { mode: modeA });
      const rms = [], gotT = [];
      const dmT = { fsWriteStream: async (p2, o) => { if (fs.existsSync(other)) fs.renameSync(other, hb); writes.push(p2); const ch = []; for await (const c of o.source) ch.push(c); gotT.push(crypto.createHash('sha256').update(Buffer.concat(ch)).digest('hex')); return { size: o.size, sha256: gotT[gotT.length - 1] }; }, fsRm: async (p2, recursive, o) => { rms.push({ p2, recursive, by: o && o.by }); return { ok: true }; } };
      const rt = await DW.pushMacHelper(dmT, need, hubBin, { manifestFile: manF });
      const shaA = crypto.createHash('sha256').update(A).digest('hex'), shaB = crypto.createHash('sha256').update(B).digest('hex');
      ok(gotT[0] === shaB && rt.ok === false && rt.code === 'helper_unsigned' && gateOf(String(rt.error).includes(`changed under the push: the bytes sent (sha256 ${shaB.slice(0, 12)}…) are not the ones named (sha256 ${shaA.slice(0, 12)}…)`)) && gateOf(/the Mac dropped them/.test(rt.error)) && rms.length === 1 && rms[0].p2 === PP.incoming(SRC.VERSION) && rms[0].recursive === false && rms[0].by === 'system:desktop-webrtc' && writes.length === w0 + 2, 'r5 bytes sent — the prebuilt replaced (same size, other bytes) between the hub\'s digest and its push: the bytes SENT are hashed as they go and are NOT the ones named ⇒ refused by name (both sha256s), the Mac asked to drop the file it got (fsRm by system:desktop-webrtc); nothing is claimed for bytes nobody checked (acceptance r4: c9a6b6ede pushed B under «named by the signed release (sha256 A…)»)', { rt, rms, gotT });
      fs.writeFileSync(hb, A, { mode: modeA }); ident({});
      const rt2 = await DW.pushMacHelper(dmT, need, hubBin, { manifestFile: manF }).catch((e) => ({ threw: String(e) }));
      ok(rt2.ok === true && rt2.sha256 === shaA && gotT[1] === shaA && rms.length === 1 && writes.length === w0 + 3, '…the restored prebuilt (the row names it) is pushed, the result names the sha256 of the bytes sent (= the bytes named; no rename happened — the .new file is gone)', rt2);
      // leg «r5 until range»: a device-sent `until` outside Date's range (toISOString would throw) — a refusal of OTHER bytes still pushes; of THESE bytes the words say «tried again later»; through start() the stream verdict is the refusal's, never offer_failed «Invalid time value»
      const ru1 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: 'b'.repeat(64), code: 'helper_unsigned', why: 'other bytes', until: 1e16 } }, hubBin, { manifestFile: noMan }).catch((e) => ({ threw: String(e) }));
      const ru2 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: shaA, code: 'helper_unsigned', why: 'codesign did not answer 3 times', until: 1e300 } }, hubBin, { manifestFile: noMan }).catch((e) => ({ threw: String(e) }));
      const ru3 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: shaA, code: 'helper_unsigned', why: 'x', until: Date.UTC(2031, 5, 6, 7, 8, 9) } }, hubBin, { manifestFile: noMan });
      const dmU = { ...dmF, streamOffer: async () => ({ ok: false, code: 'helper_unsigned', error: 'the screen helper the hub pushed was refused', helper: { dir: PP.dir, version: SRC.VERSION, refused: { version: SRC.VERSION, sha256: 'b'.repeat(64), code: 'helper_unsigned', why: 'other bytes', until: 1e16 } } }), streamStop: async () => ({ ok: true }) };
      const logsU = []; const hubU = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmU, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, log: { log: (m) => logsU.push(m), warn: (m) => logsU.push(m) } });
      const sU = await hubU.start('host-until'); hubU.shutdown?.();
      ok(ru1.ok === true && ru2.ok === false && ru2.code === 'helper_unsigned' && gateOf(/not sent again, tried again later or at the agent's next start \(the Mac named no legible time\)/.test(ru2.error)) && ru2.until === undefined && ru3.ok === false && gateOf(/not sent again before 2031-06-06T07:08:09\.000Z or the agent's next start/.test(ru3.error)) && ru3.until === Date.UTC(2031, 5, 6, 7, 8, 9) && sU.take === false && sU.code === 'helper_unsigned' && !/Invalid time value/.test(String(sU.why)) && gateOf(logsU.some((m) => /pushed this hub's prebuilt/.test(m))) && writes.length === w0 + 5, 'r5 until range — a device `until` beyond Date\'s range: a refusal of OTHER bytes still pushes (acceptance r4: c9a6b6ede threw «Invalid time value» and start() answered offer_failed), a refusal of THESE bytes says «tried again later» (no `until` in the result); a legible time is named and rides the result (`until`); start() pushes and its verdict is the refusal\'s', { ru1, ru2: ru2.error, ru3: ru3.error, sU, logsU });
      // leg «r5 row kind»: signedOnly reads the SIGNED row's identity.kind when there is a row (the row wins), the unsigned record's otherwise
      fs.rmSync(idp);
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: shaA, identity: { kind: 'developer-id', teamId: CS.TEAM, identifier: CS.IDENTIFIER } } }));
      const rk1 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: shaA, identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      ident({});
      const rk2 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
      ident({ kind: 'adhoc', teamId: null, identifier: null });
      const rk3 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: noMan, signedOnly: true });
      ok(rk1.ok === true && rk1.identity === 'developer-id' && gateOf(/^named by the signed release 9\.9\.9/.test(rk1.note)) && rk2.ok === false && rk2.code === 'helper_unsigned' && gateOf(/is adhoc \(per the signed release\), not a Developer ID build/.test(rk2.error)) && rk3.ok === false && gateOf(/is adhoc \(per its identity record\), not a Developer ID build/.test(rk3.error)) && writes.length === w0 + 6, 'r5 row kind — signedOnly judges the build\'s kind by the SIGNED row when there is one (developer-id without a record ⇒ pushed; adhoc with a record that says developer-id ⇒ refused — the row wins) and by the record otherwise (acceptance r4: the unsigned record outranked the signed statement)', { rk1, rk2: rk2.error, rk3: rk3.error });
      ident({});
      // leg «r5 signed re-push» + leg «r5 re-push bound»: the signed push comes AGAIN when the Mac's hold on those bytes (a refusal with a door / a judgment in progress) is gone from its answer — its door opened (`until` passed, or the agent started anew) — else after SIGNED_RETRY_MS; SIGNED_PUSH_MAX attempts per machine per hub life
      let clock = Date.UTC(2031, 0, 1), hold = null;
      const dmS = { ...dmF, streamOffer: async () => ({ ok: true, sid: 'sx', offer: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: true, ...(hold ? { refused: hold } : {}) } }), streamStop: async () => ({ ok: true }) };
      const logsS = []; const hubS = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmS, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock, log: { log: (m) => logsS.push(m), warn: (m) => logsS.push(m) } });
      const pushesS = () => logsS.filter((m) => /pushed this hub's signed prebuilt/.test(m)).length, keysS = [];
      const startS = async () => { const x = await hubS.start('host-door'); if (x.key) keysS.push(x.key); return x; };
      await startS(); const n1 = pushesS(); await startS(); const n2 = pushesS();                                   // once; the same instant: not again
      hold = { version: SRC.VERSION, sha256: shaA, code: 'helper_unsigned', why: 'codesign did not answer 3 times (timeout); it will be tried again at 2031-01-01T00:20:00.000Z, or at the agent\'s next start', until: clock + 20 * 60 * 1000 };
      clock += 5 * 60 * 1000; await startS(); const n3 = pushesS(); const heldLog = logsS.filter((m) => /the Mac holds this hub's signed prebuilt/.test(m));
      clock += 10 * 60 * 1000; await startS(); const n4 = pushesS();                                                // the hold still stands (15 min): nothing
      hold = null; clock += 1 * 60 * 1000; await startS(); const n5 = pushesS();                                    // the door opened (the Mac's refusal gone — until passed or the agent started anew): pushed again, at once
      ok(n1 === 1 && n2 === 1 && n3 === 1 && heldLog.length === 1 && gateOf(/sha256 [0-9a-f]{12}…\): codesign did not answer 3 times/.test(heldLog[0])) && gateOf(/pushed again when that is over/.test(heldLog[0])) && n4 === 1 && n5 === 2 && gateOf(/try 2 of 8/.test(logsS.filter((m) => /pushed this hub's signed prebuilt/.test(m)).pop())) && writes.length === w0 + 8, 'r5 signed re-push — the signed prebuilt is pushed once; while the Mac holds those very bytes (a refusal with a door) nothing more (one log line names the hold); the hold GONE from the Mac\'s answer (its door opened: `until` passed, or the agent started anew) ⇒ pushed AGAIN at once (acceptance r4: c9a6b6ede pushed once per hub life, so the 30-minute retry never came)', { n1, n2, n3, n4, n5, heldLog, last: logsS.filter((m) => /pushed this hub's signed prebuilt/.test(m)).pop() });
      clock += 29 * 60 * 1000; await startS(); const n6 = pushesS();                                                // 29 min after the second push, no hold reported: not yet
      clock += 2 * 60 * 1000; await startS(); const n7 = pushesS();                                                 // 31 min: the hub's own interval (the Mac judged nothing it told of)
      for (let i = 0; i < 12; i++) { clock += 31 * 60 * 1000; await startS(); }                                     // the bound: SIGNED_PUSH_MAX attempts per machine per hub life
      const n8 = pushesS(), lastWords = logsS.filter((m) => /pushed this hub's signed prebuilt/.test(m)).pop();
      ok(DW.SIGNED_RETRY_MS === 30 * 60 * 1000 && DW.SIGNED_PUSH_MAX === 8 && n6 === 2 && n7 === 3 && n8 === 8 && gateOf(/not again in this hub's life \(8 tries\)/.test(lastWords)) && writes.length === w0 + 6 + 8, 'r5 re-push bound — without a hold the Mac told of, a signed push is tried again at the first stream start after SIGNED_RETRY_MS (30 min — the agent\'s own door interval), and at most SIGNED_PUSH_MAX (8) attempts per machine per hub life: the eighth says «not again in this hub\'s life», twelve more starts push nothing', { n6, n7, n8, lastWords });
      for (const k of keysS) await hubS.stop(k, 'stopped').catch(() => { });
      hubS.shutdown?.();
    }
    { // ROUND 6 (acceptance r5 — r5 pinned; a crash class, a major latent until the Team ID is pinned, four minors: all the hub's push edges)
      const w0 = writes.length, A6 = fs.readFileSync(hb), mode6 = fs.statSync(hb).mode;
      ident({}); const shaA6 = sha(hb);
      // leg «r6 prebuilt vanished»: the prebuilt removed between the hub's digest and the push stream's open (an operator's rm, then the copy) — the fake removes it the moment the hub takes the device link's writer (after the digest, before the open: no race with the open), and reads only after a pause (the link still asking: connect, the gate, the open) ⇒ the read's error is heard, the refusal named, the process never sees an uncaughtException, nothing claimed
      let uncaught = 0; const onU = () => { uncaught++; };
      process.on('uncaughtException', onU);
      const dmV = { get fsWriteStream() { try { fs.rmSync(hb); } catch { /* gone already */ } return async (p2, o) => { await sleep(120); const ch = []; for await (const c of o.source) ch.push(c); writes.push(p2); return { size: o.size }; }; } };
      const rv = await DW.pushMacHelper(dmV, need, hubBin, { manifestFile: noMan }).catch((e) => ({ threw: String(e) }));
      await sleep(60); process.off('uncaughtException', onU);
      fs.writeFileSync(hb, A6, { mode: mode6 });
      ok(uncaught === 0 && rv.ok === false && rv.code === 'helper_unsigned' && gateOf(/vanished under the push \(prebuilt vanished: ENOENT\)/.test(rv.error)) && gateOf(/what the hub has when a push is next tried is judged afresh/.test(rv.error)) && writes.length === w0, 'r6 prebuilt vanished — the prebuilt gone between the hub\'s digest and the push stream\'s open (an operator\'s rm + copy): the read\'s error is heard from the first instant and becomes helper_unsigned «prebuilt vanished: ENOENT» — nothing claimed, the hub never exits (acceptance r5: 335d05ad1 and c9a6b6ede left through uncaughtException ENOENT — the tee had no listener while the device link was still asking)', { rv, uncaught });
      // leg «r6 fd census»: fifty pushes refused at open (the agent's «another transfer is writing», a gate's no, an old daemon) leave no read fd on the prebuilt — the stream is destroyed on every way out
      const fdsOn = (f) => (fs.existsSync('/proc/self/fd') ? fs.readdirSync('/proc/self/fd').filter((d) => { try { return fs.readlinkSync('/proc/self/fd/' + d) === f; } catch { return false; } }).length : 0);
      const dmL = { fsWriteStream: async () => { await sleep(2); throw new Error('another transfer is writing it'); } };
      const rl = []; for (let i = 0; i < 50; i++) rl.push(await DW.pushMacHelper(dmL, need, hubBin, { manifestFile: noMan }));
      const settled = await until(() => fdsOn(hb) === 0, 3000);
      ok(rl.length === 50 && gateOf(rl.every((r) => r.ok === false && r.code === 'no_helper' && /did not reach the Mac \(another transfer is writing it\)/.test(r.error))) && gateOf(settled) && writes.length === w0, 'r6 fd census — 50 pushes refused at open (the Mac\'s «another transfer is writing», a gate\'s no, an old daemon) leave 0 read fds on the prebuilt (/proc/self/fd): the stream is destroyed on every way out (acceptance r5: one fd per failed push for the hub\'s life, on 335d05ad1 and the base)', { fds: fdsOn(hb), r0: rl[0] });
      // leg «r6 until shapes»: a device `until` that is THERE but no number (null / '' / false / [] / true / a word) names no time — «the Mac named no legible time», no `until` on the result (round 5 coerced them to epoch 0 / 1: «before 1970-01-01»); absent ⇒ no «tried again» words at all; a number is legible; a held refusal names the bytes the Mac holds (`held`)
      const shapes = {};
      for (const [k, u] of [['null', null], ['empty', ''], ['false', false], ['array', []], ['true', true], ['word', 'x']]) shapes[k] = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: shaA6, code: 'helper_unsigned', why: 'codesign did not answer 3 times', until: u } }, hubBin, { manifestFile: noMan });
      const absent6 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: shaA6, code: 'helper_unsigned', why: 'pins no Team ID yet' } }, hubBin, { manifestFile: noMan });
      const num6 = await DW.pushMacHelper(dmF, { ...need, refused: { version: SRC.VERSION, sha256: shaA6, code: 'helper_unsigned', why: 'x', until: 5 } }, hubBin, { manifestFile: noMan });
      const pend6 = await DW.pushMacHelper(dmF, { ...need, pending: { version: SRC.VERSION, sha256: shaA6, tries: 2 } }, hubBin, { manifestFile: noMan });
      ok(Object.values(shapes).length === 6 && gateOf(Object.values(shapes).every((r) => r.ok === false && r.code === 'helper_unsigned' && /not sent again, tried again later or at the agent's next start \(the Mac named no legible time\)/.test(r.error) && !/1970/.test(r.error) && r.until === undefined && r.held === shaA6)) && absent6.ok === false && gateOf(/not sent again \(a different prebuilt would be judged afresh\)/.test(absent6.error)) && !/tried again later/.test(absent6.error) && absent6.until === undefined && absent6.held === shaA6 && num6.ok === false && gateOf(/not sent again before 1970-01-01T00:00:00\.005Z or the agent's next start/.test(num6.error)) && num6.until === 5 && pend6.ok === false && pend6.code === 'no_helper' && gateOf(/codesign answered nothing 2 of 3 times so far; the next check is try 3 of 3/.test(pend6.error)) && pend6.held === shaA6 && writes.length === w0, 'r6 until shapes — a device `until` that is there but no number (null, \'\', false, [], true, a word) says «the Mac named no legible time» and rides no `until` (acceptance r5: 335d05ad1 coerced them to epoch 0 / 1 — «not sent again before 1970-01-01T00:00:00.000Z»); none at all ⇒ no «tried again» words; a number is legible; a held refusal / a judgment in progress names the bytes the Mac holds (`held`)', { shapes: Object.fromEntries(Object.entries(shapes).map(([k, r]) => [k, r.error])), absent6: absent6.error, num6: num6.error, pend6 });
      // leg «r6 stale row»: a signed row for ANOTHER version / OTHER bytes is checked against this file BEFORE its kind is read — the refusal names the stale row, never that row's kind as these bytes' (round 5 said «adhoc (per the signed release)» of bytes the release never named)
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: 'vs-other', sha256: 'c'.repeat(64), identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const rs1 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: 'c'.repeat(64), identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const rs2 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
      fs.writeFileSync(manF, JSON.stringify({ v: 1, version: '9.9.9', helper: { version: SRC.VERSION, sha256: shaA6, identity: { kind: 'adhoc', teamId: null, identifier: null } } }));
      const rs3 = await DW.pushMacHelper(dmF, need, hubBin, { manifestFile: manF, signedOnly: true });
      ok(rs1.ok === false && rs1.code === 'helper_unsigned' && gateOf(/^the signed release names Mac screen helper vs-other, this hub's prebuilt is /.test(rs1.error)) && !/adhoc/.test(rs1.error) && rs2.ok === false && gateOf(/is not the release's \(sha256 /.test(rs2.error)) && !/adhoc/.test(rs2.error) && rs3.ok === false && gateOf(/is adhoc \(per the signed release\), not a Developer ID build/.test(rs3.error)) && writes.length === w0, 'r6 stale row — signedOnly with a signed row for another version (or other bytes) beside a record that names THIS file as developer-id: the row is checked against the file first, the refusal says «the signed release names Mac screen helper vs-other …» / «not the release\'s (sha256 …)» (acceptance r5: 335d05ad1 said «adhoc (per the signed release)» of bytes that release never named); a row that names this file still lends its kind', { rs1: rs1.error, rs2: rs2.error, rs3: rs3.error });
      // leg «r6 concurrent starts»: stream starts in flight together for ONE Mac (two desktop windows restored at once) push ONCE — the host is claimed synchronously before the push's await; the bound counts pushes: 12 waves of 3 starts, 31 min apart ⇒ SIGNED_PUSH_MAX pushes, never more
      let clock6 = Date.UTC(2031, 0, 1), hold6 = null, active = 0, maxActive = 0;
      const offer6 = (ref) => ({ ok: true, sid: 'sx', offer: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: true, ...(ref ? { refused: ref } : {}) } });
      const dmC = { fsWriteStream: async (p2, o) => { active++; maxActive = Math.max(maxActive, active); writes.push(p2); for await (const c of o.source) { void c; await sleep(2); } active--; return { size: o.size }; }, streamOffer: async () => { await sleep(3); return offer6(hold6); }, streamStop: async () => ({ ok: true }) };
      const logsC = [], keysC = []; const hubC = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmC, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock6, log: { log: (m) => logsC.push(m), warn: (m) => logsC.push(m) } });
      const wave = async (k) => { const rs = await Promise.all(Array.from({ length: k }, () => hubC.start('host-race'))); for (const x of rs) if (x.key) keysC.push(x.key); return rs; };
      const rc1 = await wave(3); const c1 = writes.length - w0;
      for (let i = 0; i < 11; i++) { clock6 += 31 * 60 * 1000; await wave(3); }
      const c2 = writes.length - w0, triesC = logsC.filter((m) => /signed prebuilt/.test(m)).map((m) => (/try \d+ of 8/.exec(m) || /not again in this hub's life \(8 tries\)/.exec(m) || ['?'])[0]);
      ok(rc1.length === 3 && gateOf(rc1.every((x) => x.take === true)) && c1 === 1 && maxActive === 1 && c2 === 8 && verdictOf(same(triesC, ['try 1 of 8', 'try 2 of 8', 'try 3 of 8', 'try 4 of 8', 'try 5 of 8', 'try 6 of 8', 'try 7 of 8', 'not again in this hub\'s life (8 tries)'])), 'r6 concurrent starts — three stream starts in flight together for one Mac push the signed prebuilt ONCE (the host is claimed synchronously before the push\'s await, as c9a6b6ede did — 335d05ad1 recorded the push after it and pushed three times, three writes to one path at once); twelve waves of three, 31 min apart, push SIGNED_PUSH_MAX (8) times, each try counted once (335d05ad1: 24)', { c1, c2, maxActive, triesC });
      // leg «r6 words»: after the bound a hold the Mac reports is noted as «not pushed again in this hub's life (8 tries spent)» — never «pushed again when that is over» — and when it ends nothing is pushed and nothing promised; a prebuilt changed under the push says «what the hub has when a push is next tried is judged afresh» (not «at the next stream start» — on the signed road the next try is SIGNED_RETRY_MS away)
      hold6 = { version: SRC.VERSION, sha256: shaA6, code: 'helper_unsigned', why: 'codesign did not answer 3 times', until: clock6 + 20 * 60 * 1000 };
      await wave(1); const holdLine = logsC.filter((m) => /the Mac holds (this hub's|a) signed prebuilt/.test(m)).pop() || ''; // round 7: after the bound the hub looks no more, so the line says «a signed prebuilt» (whose bytes they are is not judged)
      hold6 = null; clock6 += 21 * 60 * 1000; const lc = logsC.length; await wave(1);
      const other6 = path.join(hubBin, 'vibespace-screen.new'), B6 = Buffer.concat([A6.subarray(0, A6.length - 1), Buffer.from([A6[A6.length - 1] ^ 0x01])]); fs.writeFileSync(other6, B6, { mode: mode6 });
      const dmW = { get fsWriteStream() { if (fs.existsSync(other6)) fs.renameSync(other6, hb); return async (p2, o) => { writes.push(p2); for await (const c of o.source) void c; return { size: o.size }; }; }, fsRm: async () => ({ ok: true }) };
      const rw = await DW.pushMacHelper(dmW, need, hubBin, { manifestFile: noMan });
      fs.writeFileSync(hb, A6, { mode: mode6 });
      ok(gateOf(/not pushed again in this hub's life \(8 tries spent\)/.test(holdLine)) && !/pushed again when that is over/.test(holdLine) && writes.length === w0 + 8 + 1 && !logsC.slice(lc).some((m) => /signed prebuilt/.test(m)) && rw.ok === false && gateOf(/changed under the push/.test(rw.error)) && gateOf(/what the hub has when a push is next tried is judged afresh/.test(rw.error)) && !/at the next stream start/.test(rw.error), 'r6 words — the log promises only what the machine does: after the eighth try a hold the Mac reports reads «not pushed again in this hub\'s life (8 tries spent)» (335d05ad1: «pushed again when that is over», then nothing when it ended), and the changed-under-the-push refusal says «judged afresh when a push is next tried» (335d05ad1: «at the next stream start» — the signed road\'s next try is 30 min away)', { holdLine, rw: rw.error, after: logsC.slice(lc) });
      for (const k of keysC) await hubC.stop(k, 'stopped').catch(() => { });
      hubC.shutdown?.();
      // leg «r6 hold kept»: the Mac's clock 2 s behind the hub's — a stream start just past the hub's dueAt while the Mac's answer still names the hold tries NOTHING (round 5 tried, was refused «this very prebuilt», marked the hold gone and spent a try — the door's opening then went unseen for 30 min); the hold gone from the answer ⇒ pushed at once
      const w1 = writes.length, SKEW = 2000; let refusedAt = null; const mac = () => clock6 - SKEW;
      const refusal = () => (refusedAt !== null && mac() < refusedAt + 30 * 60e3 ? { version: SRC.VERSION, sha256: shaA6, code: 'helper_unsigned', why: 'codesign did not answer 3 times (timeout)', until: refusedAt + 30 * 60e3 } : null);
      const dmH = { fsWriteStream: async (p2, o) => { writes.push(p2); for await (const c of o.source) void c; refusedAt = mac() + 90e3; return { size: o.size }; }, streamOffer: async () => offer6(refusal()), streamStop: async () => ({ ok: true }) }; // the Mac's codesign times out 3× in ~90 s ⇒ refused until +30 min on ITS clock
      const logsH = [], keysH = []; const hubH = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: dmH, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock6, log: { log: (m) => logsH.push(m), warn: (m) => logsH.push(m) } });
      const startH = async () => { const x = await hubH.start('host-hold'); if (x.key) keysH.push(x.key); return x; };
      const T6 = clock6;
      await startH(); const h1 = writes.length - w1;                                   // push #1
      clock6 = T6 + 2 * 60e3; await startH(); const h2 = writes.length - w1;         // the hold seen: one line, nothing pushed
      clock6 = T6 + 31.5 * 60e3 - 1000; await startH(); const h3 = writes.length - w1; // the hub's clock 1 s past the Mac's `until`, the Mac's 1 s before it: its answer still names the hold ⇒ nothing tried
      clock6 += 5000; await startH(); const h4 = writes.length - w1;                  // 5 s later the hold is gone from the answer ⇒ pushed at once
      clock6 += 10 * 60e3; await startH(); const h5 = writes.length - w1;             // the Mac holds the second push's bytes: nothing
      const pushLinesH = logsH.filter((m) => /pushed this hub's signed prebuilt/.test(m)), holdLinesH = logsH.filter((m) => /the Mac holds this hub's signed prebuilt/.test(m));
      ok(h1 === 1 && h2 === 1 && h3 === 1 && !logsH.some((m) => /refused this very prebuilt/.test(m)) && h4 === 2 && h5 === 2 && pushLinesH.length === 2 && gateOf(/try 2 of 8/.test(pushLinesH[1])) && holdLinesH.length === 2 && verdictOf(holdLinesH.every((m) => /pushed again when that is over/.test(m))), 'r6 hold kept — the Mac\'s clock 2 s behind the hub\'s: a stream start 1 s past the hub\'s dueAt while the Mac\'s answer still names the hold tries nothing (no «refused this very prebuilt» line, no try spent); 5 s later the hold is gone from the answer ⇒ pushed at once as try 2 of 8 (acceptance r5: 335d05ad1 tried, was refused, marked the hold gone and pushed again only 30 min later)', { h1, h2, h3, h4, h5, pushLinesH, holdLinesH, declined: logsH.filter((m) => /refused this very/.test(m)) });
      for (const k of keysH) await hubH.stop(k, 'stopped').catch(() => { });
      hubH.shutdown?.();
      ident({});
    }
    { // ROUND 7 (acceptance r6 — r6 held on five of six; ONE major latent until the Team ID is pinned: the hold was judged against the bytes this hub pushed BEFORE and the hub looked no further while the Mac named them — a corrected prebuilt was never pushed in that hub's life)
      const w0 = writes.length, X7 = fs.readFileSync(hb), mode7 = fs.statSync(hb).mode;
      ident({}); const shaX7 = sha(hb);
      const Y7 = Buffer.concat([X7.subarray(0, X7.length - 1), Buffer.from([X7[X7.length - 1] ^ 0x02])]), shaY7 = crypto.createHash('sha256').update(Y7).digest('hex');
      const putY = () => { fs.writeFileSync(hb, Y7, { mode: mode7 }); ident({}); }, putX = () => { fs.writeFileSync(hb, X7, { mode: mode7 }); ident({}); }; // the operator's drop: the prebuilt + its record, no hub restart
      let clock7 = Date.UTC(2031, 0, 1);
      const forGood = (s256) => ({ version: SRC.VERSION, sha256: s256, code: 'helper_unsigned', why: 'its designated requirement is not the Developer ID one', agent: 'a1' }); // a codesign VERDICT: no `until` — the agent names it in every answer of this agent + helper version
      const macFake = (hostId, mac) => { // mac: { refused, kind, judge(sha) } — the Mac's agent as the hub sees it: its answer names what it refused, a pushed file is judged by its bytes
        const logs = [], keys = [];
        const dm = { fsWriteStream: async (p2, o) => { if (mac.gate) { const e = mac.gate(); if (e) throw e; } const ch = []; for await (const c of o.source) { ch.push(c); if (mac.drop) throw mac.drop(); } writes.push(p2); mac.judge(crypto.createHash('sha256').update(Buffer.concat(ch)).digest('hex')); return { size: o.size }; }, // round 9: `gate` throws before the source is read (the real client's gates throw before the channel opens; the Mac's door refuses the open), `drop` throws under the bytes
          streamOffer: async () => ({ ok: true, sid: 'sx', offer: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: mac.kind }, wantSigned: mac.kind !== 'developer-id', ...(mac.refused ? { refused: mac.refused } : {}), ...(mac.pending ? { pending: mac.pending } : {}) } }), streamStop: async () => ({ ok: true }) };
        const hub = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock7, log: { log: (m) => logs.push(m), warn: (m) => logs.push(m) } });
        const start = async () => { const x = await hub.start(hostId); if (x.key) keys.push(x.key); return x; };
        const done = async () => { for (const k of keys) await hub.stop(k, 'stopped').catch(() => { }); hub.shutdown?.(); };
        const pushLines = () => logs.filter((m) => /pushed this hub's signed prebuilt/.test(m)), holdLines = () => logs.filter((m) => /the Mac holds this hub's signed prebuilt/.test(m));
        return { logs, start, done, pushLines, holdLines };
      };
      // leg «r7 new prebuilt under a hold»: the Mac refused this hub's first signed prebuilt X FOR GOOD (a codesign verdict: no `until`, named in every later answer); the operator drops a corrected Y into the hub's helpers dir, no restart ⇒ Y goes at the NEXT stream start (the hold names X, the hub has Y: judged afresh at once — no 30-min wait); the hold line said so
      const macA = { refused: null, kind: 'adhoc', judge(s256) { if (s256 === shaX7) macA.refused = forGood(shaX7); else if (s256 === shaY7) { macA.refused = null; macA.kind = 'developer-id'; } } };
      const A = macFake('host-newbytes', macA); const T7 = clock7;
      await A.start(); const a1 = writes.length - w0;                                  // X pushed (try 1)
      clock7 = T7 + 2 * 60e3; await A.start(); const a2 = writes.length - w0;           // the Mac names its refusal of X: the hub has X ⇒ held, nothing sent, no try spent
      clock7 = T7 + 3 * 60e3; putY();
      clock7 = T7 + 5 * 60e3; await A.start(); const a3 = writes.length - w0;           // the hub has Y now ⇒ pushed at this very start (480ed457b: never; 335d05ad1: 30 min after X)
      clock7 = T7 + 6 * 60e3; await A.start(); const a4 = writes.length - w0;           // the Mac took Y (developer-id, wantSigned false): nothing more
      const pA = A.pushLines(), hA = A.holdLines();
      ok(a1 === 1 && a2 === 1 && a3 === 2 && a4 === 2 && macA.kind === 'developer-id' && pA.length === 2 && gateOf(/try 1 of 8/.test(pA[0])) && gateOf(/try 2 of 8/.test(pA[1])) && gateOf(/not sent again while the Mac's answer names its hold on these bytes/.test(pA[0])) && hA.length === 1 && gateOf(new RegExp(`sha256 ${shaX7.slice(0, 12)}…\\): its designated requirement is not the Developer ID one — not sent again while that verdict stands`).test(hA[0])) && gateOf(/another prebuilt in this hub's helpers dir goes at the next stream start \(7 of 8 tries left\)/.test(hA[0])) && !A.logs.some((m) => /refused this very prebuilt/.test(m)), 'r7 new prebuilt under a hold — the Mac refused the hub\'s signed prebuilt X for good (a codesign verdict, no `until`); a corrected Y dropped into the hub\'s helpers dir without a restart is pushed at the NEXT stream start (the hold is a fact about bytes, judged against the prebuilt the hub has NOW — pushMacHelper\'s one comparison); the look that found the hold spent no try (7 of 8 left), its line promises the next start (acceptance r6 M1: 480ed457b judged the hold against the bytes it pushed before and looked no further — Y never went in that hub\'s life; 335d05ad1 pushed it 30 min later)', { a1, a2, a3, a4, kind: macA.kind, pA, hA });
      await A.done();
      // leg «r7 new prebuilt across lives»: hub life 2 meets the Mac's permanent refusal of X (hub life 1's push) at its first start — its own record empty, the prebuilt still X ⇒ held (a look, no try); the corrected Y dropped in ⇒ pushed at the next start as try 1 of 8
      putX();
      const macB = { refused: forGood(shaX7), kind: 'adhoc', judge(s256) { if (s256 === shaY7) { macB.refused = null; macB.kind = 'developer-id'; } } };
      const B = macFake('host-life2', macB); clock7 = T7 + 60 * 60e3; const TB = clock7;
      await B.start(); const b1 = writes.length - w0;                                  // the hold found on the hub's own X: nothing sent, no try
      clock7 = TB + 1 * 60e3; await B.start(); const b2 = writes.length - w0;           // still X: nothing (and no second line)
      putY(); clock7 = TB + 5 * 60e3; await B.start(); const b3 = writes.length - w0;   // Y ⇒ pushed, try 1 of 8
      const pB = B.pushLines(), hB = B.holdLines();
      ok(b1 === 2 && b2 === 2 && b3 === 3 && macB.kind === 'developer-id' && hB.length === 1 && gateOf(/not sent again while that verdict stands/.test(hB[0])) && gateOf(/\(8 of 8 tries left\)/.test(hB[0])) && pB.length === 1 && gateOf(/try 1 of 8/.test(pB[0])) && !B.logs.some((m) => /refused this very prebuilt/.test(m)), 'r7 new prebuilt across lives — a hub life that meets the Mac\'s standing refusal of X at its first start (another life pushed X) records the hold with no try spent (8 of 8 left) and one line; the corrected Y dropped in goes at the next start as try 1 of 8 (acceptance r6: 480ed457b spent a try on the look and never pushed Y; 335d05ad1 pushed it 30 min later)', { b1, b2, b3, pB, hB });
      await B.done();
      // leg «r7 hold not ours»: the Mac's answer names a hold on bytes the hub never had (another hub's push; a record that outlived its file) — no hold line (the hub never found the Mac holding ITS bytes), the signed push paced by SIGNED_RETRY_MS as in round 5 (no push per stream start); the moment the Mac names the hub's own bytes the hold is found, and a corrected prebuilt goes at the next start
      putX();
      const shaZ7 = crypto.createHash('sha256').update('bytes this hub never had').digest('hex');
      const macC = { refused: forGood(shaZ7), kind: 'adhoc', judge(s256) { if (s256 === shaY7) { macC.refused = null; macC.kind = 'developer-id'; } } }; // X pushed changes nothing it says: the Mac keeps naming Z
      const C = macFake('host-other', macC); clock7 = T7 + 120 * 60e3; const TC = clock7;
      await C.start(); const c1 = writes.length - w0;                                  // X pushed (try 1): the hold names other bytes
      for (const m of [1, 5, 20]) { clock7 = TC + m * 60e3; await C.start(); } const c2 = writes.length - w0; // the same answer: nothing until dueAt
      clock7 = TC + 31 * 60e3; await C.start(); const c3 = writes.length - w0;          // dueAt ⇒ X again (try 2) — round 5's pacing
      const h0 = C.holdLines().length;
      macC.refused = forGood(shaX7); clock7 = TC + 32 * 60e3; await C.start(); const c4 = writes.length - w0; // the Mac names X now: found, held, no try
      putY(); clock7 = TC + 33 * 60e3; await C.start(); const c5 = writes.length - w0;  // Y ⇒ pushed (try 3)
      const pC = C.pushLines(), hC = C.holdLines();
      ok(c1 === 4 && c2 === 4 && c3 === 5 && c4 === 5 && c5 === 6 && h0 === 0 && hC.length === 1 && gateOf(/\(6 of 8 tries left\)/.test(hC[0])) && pC.length === 3 && gateOf(/try 1 of 8/.test(pC[0])) && gateOf(/try 2 of 8/.test(pC[1])) && gateOf(/try 3 of 8/.test(pC[2])) && macC.kind === 'developer-id', 'r7 hold not ours — a hold the Mac names on bytes this hub never had is no hold of the hub\'s (no line, nothing waited for): the signed push keeps round 5\'s pacing (X at the first start, nothing at +1 / +5 / +20 min, X again at +31 — no push per stream start); the Mac naming the hub\'s own X ⇒ found and held (6 of 8 tries left), the corrected Y ⇒ pushed at the next start as try 3 of 8', { c1, c2, c3, c4, c5, h0, pC, hC });
      await C.done();
      putX();
      // ROUND 8 (acceptance r7 — r7 held; two majors latent until the Team ID is pinned and one minor: the look at bytes the Mac newly named PUSHED at every start (a Mac paired to several hubs spent the bound in minutes), a refusal on the hub's side spent a try (eight looks at an ad-hoc prebuilt shut the host for the hub's life), the hold line's door was generic)
      const w8 = writes.length;
      const forUntil = (s256, until) => ({ version: SRC.VERSION, sha256: s256, code: 'helper_unsigned', why: 'codesign did not answer 3 times (timeout)', agent: 'a1', until }); // a refusal born of unanswered codesign runs: it has a door
      // leg «r8 rotating hold not ours» (rule 1): the Mac's answer names a hold on ever-other bytes the hub never had (a Mac paired to several hubs; an agent whose record flips) ⇒ X once, then NOTHING per start — the look at newly named bytes sends nothing and comes once per SIGNED_RETRY_MS — X again at dueAt (round 5's pacing); a corrected Y under an answer that names nothing goes at the pacing (5bfe5286e: X at every start, the bound spent in 8 min, Y never)
      let i8 = 0; const zs = [0, 1].map((k) => crypto.createHash('sha256').update('another hub\'s prebuilt ' + k).digest('hex'));
      const macR = { refused: null, kind: 'adhoc', rotate: true, judge(s256) { if (s256 === shaY7) macR.kind = 'developer-id'; } };
      const R = macFake('host-rotating', macR); clock7 = T7 + 240 * 60e3; const TR = clock7;
      const startR = async () => { macR.refused = macR.rotate ? forGood(zs[i8++ % 2]) : null; await R.start(); };
      await startR(); const r1 = writes.length - w8;                                   // X pushed (try 1): the hold names other bytes
      for (let m = 1; m <= 10; m++) { clock7 = TR + m * 60e3; await startR(); } const r2 = writes.length - w8; // ten starts, the named bytes flip each time: nothing sent
      const looks = R.logs.filter((m) => /is not on this hub's prebuilt/.test(m));      // the look only — said once (the next within 30 min is not made)
      clock7 = TR + 31 * 60e3; await startR(); const r3 = writes.length - w8;          // dueAt ⇒ X again (try 2)
      macR.rotate = false; putY(); clock7 = TR + 40 * 60e3; await startR(); const r4 = writes.length - w8; // Y dropped, the Mac names nothing: not due yet
      clock7 = TR + 62 * 60e3; await startR(); const r5 = writes.length - w8;          // dueAt ⇒ Y (try 3)
      const pR = R.pushLines();
      ok(r1 === 1 && r2 === 1 && looks.length === 1 && gateOf(/nothing sent, no try spent \(1 of 8 spent\)/.test(looks[0])) && r3 === 2 && r4 === 2 && r5 === 3 && macR.kind === 'developer-id' && pR.length === 3 && gateOf(/try 2 of 8/.test(pR[1])) && gateOf(/try 3 of 8/.test(pR[2])) && R.holdLines().length === 0, 'r8 rotating hold not ours — the Mac\'s answer names a hold on ever-other bytes this hub never had (a Mac paired to several hubs): X at the first start, NOTHING at ten starts a minute apart (one look that sent nothing and spent no try, said once), X again at +31 (round 5\'s pacing), the corrected Y at the pacing once the answer names nothing (acceptance r7 M1: 5bfe5286e pushed X at every start — the bound gone in 8 min, Y never pushed in that hub\'s life)', { r1, r2, looks: looks.length, r3, r4, r5, pR: pR.length });
      await R.done(); putX();
      // leg «r8 local refusal spends no try» (rule 2): the Mac wants a signed build, the hub's prebuilt is the ad-hoc one per its record ⇒ nine paced starts refuse on the hub's side — nothing sent, NO try spent, said once; the Developer ID record lands ⇒ pushed at the next paced start as try 1 of 8 (5bfe5286e: eight refusals spent the bound, the build dropped later was never pushed in that hub's life)
      ident({ kind: 'adhoc', teamId: null });
      const macL = { refused: null, kind: 'adhoc', judge(s256) { if (s256 === shaX7) macL.kind = 'developer-id'; } };
      const Lh = macFake('host-adhoc-hub', macL); clock7 = T7 + 400 * 60e3; const TL = clock7, wL = writes.length;
      for (let k = 0; k < 9; k++) { clock7 = TL + k * 31 * 60e3; await Lh.start(); } const l1 = writes.length - wL;
      const saidL = Lh.logs.filter((m) => /not a Developer ID build/.test(m));
      ident({});                                                                        // the Developer ID build's record lands (the bytes were the signed X all along — the record said adhoc)
      clock7 = TL + 8 * 31 * 60e3 + 60e3; await Lh.start(); const l2 = writes.length - wL; // a minute after the ninth look: not due
      clock7 = TL + 9 * 31 * 60e3; await Lh.start(); const l3 = writes.length - wL;      // the paced start ⇒ pushed, try 1 of 8
      const pL = Lh.pushLines();
      ok(l1 === 0 && saidL.length === 1 && gateOf(/nothing sent, no try spent \(0 of 8 spent\)/.test(saidL[0])) && gateOf(/then once per 30 min, while the Mac still wants a signed build/.test(saidL[0])) && !Lh.logs.some((m) => /try \d of 8|not again in this hub's life/.test(m) && /not a Developer ID build/.test(m)) && l2 === 0 && l3 === 1 && pL.length === 1 && gateOf(/try 1 of 8/.test(pL[0])) && macL.kind === 'developer-id', 'r8 local refusal spends no try — an ad-hoc prebuilt under a Mac that wants a signed one: nine paced looks refuse on the hub\'s side (nothing sent, no try spent, said ONCE — the next line when the answer changes), the Developer ID record landing ⇒ pushed at the next paced start as try 1 of 8 (acceptance r7 M2: 5bfe5286e spent the bound on eight refusals — «not again in this hub\'s life» — and never pushed it)', { l1, saidL: saidL.length, l2, l3, pL: pL.length });
      await Lh.done();
      // leg «r8 the door by kind» (rule 3): the hold line names the door BY THE REFUSAL'S KIND — a codesign verdict (no `until`): «not sent again while that verdict stands (its doors: an agent upgrade or another helper version — a codesign verdict outlives the agent's restarts)», and the agent's restarts indeed open nothing (the fake keeps naming it, as own() does); a refusal born of unanswered runs: «pushed again when that is over (its door: `until` <ISO> passed, or the agent's next start)»; a judgment in progress: «judged at the Mac's next check (try 3 of 3, the last)» — the agent's `tries` counts the runs that went unanswered, round 9 (5bfe5286e said «its door: `until` passed, or the agent's next start» of all three; 20b87789b said «try 2 of 3» of the next check after two had failed)
      const macV = { refused: forGood(shaX7), kind: 'adhoc', judge() { } };
      const Vh = macFake('host-verdict', macV); clock7 = T7 + 700 * 60e3; const TV = clock7, wV = writes.length;
      await Vh.start();                                                                 // the verdict found at the first start (another life's push)
      for (let m = 1; m <= 5; m++) { clock7 = TV + m * 40 * 60e3; await Vh.start(); }  // the agent restarted meanwhile: its answer still names the verdict
      const hV = Vh.holdLines(), v1 = writes.length - wV;
      const macU = { refused: null, kind: 'adhoc', judge() { } }; const Uh = macFake('host-unanswered', macU); clock7 = T7 + 1000 * 60e3; const TU = clock7;
      await Uh.start(); macU.refused = forUntil(shaX7, TU + 20 * 60e3); clock7 = TU + 2 * 60e3; await Uh.start(); const hU = Uh.holdLines();
      const macP = { refused: null, pending: null, kind: 'adhoc', judge() { } }; const Ph = macFake('host-pending', macP); clock7 = T7 + 1100 * 60e3; const TP = clock7;
      await Ph.start(); macP.pending = { version: SRC.VERSION, sha256: shaX7, tries: 2 }; clock7 = TP + 2 * 60e3; await Ph.start(); const hP = Ph.holdLines();
      ok(hV.length === 1 && v1 === 0 && gateOf(/not sent again while that verdict stands \(its doors: an agent upgrade or another helper version — a codesign verdict outlives the agent's restarts\); another prebuilt in this hub's helpers dir goes at the next stream start \(8 of 8 tries left\)/.test(hV[0])) && !/agent's next start/.test(hV[0]) && !/until/.test(hV[0]) && hU.length === 1 && gateOf(new RegExp(`codesign did not answer 3 times \\(timeout\\) — pushed again when that is over \\(its door: \`until\` ${new Date(TU + 20 * 60e3).toISOString()} passed, or the agent's next start\\)`).test(hU[0])) && hP.length === 1 && gateOf(/judging it \(codesign answered nothing 2 of 3 times so far\) — judged at the Mac's next check \(try 3 of 3, the last\) — taken then, or refused with that refusal's own door/.test(hP[0])) && !/until/.test(hP[0]), 'r8 the door by kind — the hold line names the door by the refusal\'s kind: a codesign verdict «not sent again while that verdict stands (its doors: an agent upgrade or another helper version — a codesign verdict outlives the agent\'s restarts)» (and five starts across the agent\'s restarts push nothing: the fake keeps naming it as own() does), an unanswered-runs refusal «pushed again when that is over (its door: `until` <ISO> passed, or the agent\'s next start)», a judgment in progress «judged at the Mac\'s next check (try 2 of 3)» (acceptance r7 m3: 5bfe5286e promised «until passed, or the agent\'s next start» of the verdict too — a road that opens nothing)', { hV, hU, hP, v1 });
      await Vh.done(); await Uh.done(); await Ph.done();
      // leg «r8 hold kept through a half drop» (the verdict's unverified rows 1 + 3): under a hold on X, the operator's drop lands in two writes — Y's binary first, a stream start between, then its record ⇒ the start between refuses on the hub's side («not the one its identity record describes»: nothing sent, no try spent, said once) and the hold is KEPT (the Mac still names X); the record lands ⇒ Y at the NEXT start as try 2 of 8 (5bfe5286e: the refusal spent a try and forgot the hold — Y went 30 min later)
      const macD = { refused: null, kind: 'adhoc', judge(s256) { if (s256 === shaX7) macD.refused = forGood(shaX7); else if (s256 === shaY7) { macD.refused = null; macD.kind = 'developer-id'; } } };
      const Dh = macFake('host-halfdrop', macD); clock7 = T7 + 1300 * 60e3; const TD = clock7, wD = writes.length;
      await Dh.start(); clock7 = TD + 60e3; await Dh.start();                          // X pushed (try 1); the hold found
      fs.writeFileSync(hb, Y7, { mode: mode7 });                                        // the binary lands — the record still names X
      clock7 = TD + 2 * 60e3; await Dh.start(); const d1 = writes.length - wD;         // a start between: refused on the hub's side, nothing sent
      ident({});                                                                        // the record lands
      clock7 = TD + 3 * 60e3; await Dh.start(); const d2 = writes.length - wD;         // Y ⇒ pushed at this very start
      const half = Dh.logs.filter((m) => /not the one its identity record describes/.test(m)), pD = Dh.pushLines();
      ok(d1 === 1 && d2 === 2 && macD.kind === 'developer-id' && half.length === 1 && gateOf(/nothing sent, no try spent \(1 of 8 spent\)/.test(half[0])) && gateOf(new RegExp(`looked at again at every stream start while the Mac holds the prebuilt this hub had \\(sha256 ${shaX7.slice(0, 12)}…\\)`).test(half[0])) && pD.length === 2 && gateOf(/try 2 of 8/.test(pD[1])) && Dh.holdLines().length === 1, 'r8 hold kept through a half drop — a drop that lands in two writes under a standing hold: the stream start between them is refused on the hub\'s side («not the one its identity record describes» — nothing sent, no try spent, «looked at again at every stream start while the Mac holds the prebuilt this hub had»), the hold kept; the record lands ⇒ Y at the NEXT start as try 2 of 8 (acceptance r7 unverified rows 1 + 3: 5bfe5286e spent a try, forgot the hold, and pushed Y 30 min later)', { d1, d2, half: half.length, pD: pD.length });
      await Dh.done(); putX();
      // leg «r8 own bytes named»: X pushed, the Mac's answer then names its refusal of X while the hub already holds the corrected Y — no stream start between the refusal and the drop ⇒ the hub knows the bytes it SENT: a hold on them is a hold on its own, Y goes at this very start (a look in full, not the look only, not the pacing); the look-only words are never said of the hub's own push (green on 5bfe5286e too — its look at newly named bytes pushed; the guard for round 8's own rule)
      const macO = { refused: null, kind: 'adhoc', judge(s256) { if (s256 === shaX7) macO.refused = forGood(shaX7); else if (s256 === shaY7) { macO.refused = null; macO.kind = 'developer-id'; } } };
      const Oh = macFake('host-own', macO); clock7 = T7 + 1500 * 60e3; const TO = clock7, wO = writes.length;
      await Oh.start();                                                                 // X pushed (try 1); the Mac refuses it — its answer names X from now on
      putY(); clock7 = TO + 5 * 60e3; await Oh.start(); const o1 = writes.length - wO;  // the first start after: the Mac names X, this hub's own push ⇒ looked at in full, Y pushed (try 2)
      const pO = Oh.pushLines();
      ok(o1 === 2 && macO.kind === 'developer-id' && !Oh.logs.some((m) => /is not on this hub's prebuilt/.test(m)) && pO.length === 2 && gateOf(/try 2 of 8/.test(pO[1])) && Oh.holdLines().length === 0, 'r8 own bytes named — the Mac names its refusal of the bytes this hub SENT while the hub already holds the corrected Y (no stream start between): a hold on the hub\'s own push, looked at in full at this very start ⇒ Y pushed as try 2 of 8 (never «is not on this hub\'s prebuilt» of its own push, no hold line: the look found Y, not X)', { o1, pO: pO.length });
      await Oh.done(); putX();
      // ROUND 9 (acceptance r8 — r8 held; rule 2 was HALF fixed: pushMacHelper marked every throw of fsWriteStream `sent`, so the device client's refusals BEFORE the channel opens — the owner's «Hub automation» gate, the allow list, no `by`, an old agent — each spent a try and eight paced refusals shut the host for the hub's life; the pending door's try was off by one; the push line promised a re-push at dueAt the hub never makes while the Mac holds those bytes)
      const w9 = writes.length;
      const gateErr = (code, msg) => Object.assign(new Error(msg), code ? { code } : {});
      // leg «r9 a refusal before the channel opened spends no try» (rule 1): the device client refuses the push on the hub — hub_act_denied (Hub automation: nobody), ask_expired (a card nobody answered), op-not-allowed (the allow list), act_without_by, host_needs_daemon — two paced starts each: nothing sent, NO try spent, each refusal's words said once; the owner allows ⇒ pushed at the next paced start as try 1 of 8 (20b87789b: ten tries spent — «not again in this hub's life» after eight — and the build never went)
      ident({});
      const macG = { refused: null, kind: 'adhoc', gate: null, judge(s256) { if (s256 === shaX7) macG.kind = 'developer-id'; } };
      const Gh = macFake('host-gated', macG); clock7 = T7 + 1700 * 60e3; const TG = clock7;
      const codes9 = [['hub_act_denied', '"mac" does not let VibeSpace\'s automation write files there (its Hub automation list is Never) — nothing was done'], ['ask_expired', 'nobody answered within 60 s — VibeSpace did not write files on "mac", nothing was done'], ['op-not-allowed', 'the machine\'s own list refuses fs-op:write-stream'], ['act_without_by', 'act_without_by: fs-op was not sent — the hub names who asked for every act on a device'], ['host_needs_daemon', 'daemon lacks fs-write-stream (capabilities gate) -- upgrade the agent on this machine']];
      let k9 = 0;
      for (const [code, msg] of codes9) { macG.gate = () => gateErr(code, msg); for (let j = 0; j < 2; j++) { clock7 = TG + k9++ * 31 * 60e3; await Gh.start(); } }
      const g1 = writes.length - w9;
      const gLines = Gh.logs.filter((m) => /refused the push before the device link opened/.test(m)), gTries = Gh.logs.filter((m) => /try \d of 8|not again in this hub's life/.test(m)).length; // the tries said while the gate refused: none
      macG.gate = null; clock7 = TG + (k9 - 1) * 31 * 60e3 + 20 * 60e3; await Gh.start(); const g2 = writes.length - w9; // the gate open, 20 min after the last look: not due
      clock7 = TG + k9++ * 31 * 60e3; await Gh.start(); const g3 = writes.length - w9;                                   // the paced start ⇒ pushed, try 1 of 8
      const pG = Gh.pushLines();
      ok(g1 === 0 && gLines.length === 5 && gateOf(codes9.every(([code], i) => new RegExp(`\\(${code}: `).test(gLines[i]))) && gateOf(gLines.every((m) => /nothing sent, no try spent \(0 of 8 spent\)/.test(m) && /then once per 30 min, while the Mac still wants a signed build/.test(m))) && gTries === 0 && g2 === 0 && g3 === 1 && pG.length === 1 && gateOf(/try 1 of 8/.test(pG[0])) && macG.kind === 'developer-id', 'r9 a refusal before the channel opened spends no try — the device client\'s five pre-channel refusals (the owner\'s Hub automation gate: nobody / a card nobody answered; the allow list; no `by`; an old agent), two paced starts each: nothing sent, no try spent, each said once by its code; the gate open ⇒ pushed at the next paced start as try 1 of 8 (acceptance r8 M1: 20b87789b counted every throw of fsWriteStream as a delivery — eight paced refusals shut the host for the hub\'s life and the Developer ID build never went)', { g1, gLines: gLines.length, g2, g3, pG: pG.length });
      await Gh.done();
      // …and the failures that DO spend a try (the link took the push): the open refused at the Mac's door (an error with no code — «another transfer is writing») and the link dropped under the bytes (`stalled`) — a delivery each, said as a push line, never as a refusal on the hub's side
      const macM = { refused: null, kind: 'adhoc', gate: () => gateErr(null, 'another transfer is writing /opt/vs-helper/vibespace-screen-x'), judge() { } };
      const Mh = macFake('host-doors', macM); clock7 = T7 + 2100 * 60e3; const TM = clock7, wM = writes.length;
      await Mh.start();                                                                 // refused at the Mac's door: try 1 of 8
      macM.gate = null; macM.drop = () => gateErr('stalled', 'the link to the machine dropped');
      clock7 = TM + 31 * 60e3; await Mh.start();                                       // the link dropped under the bytes: try 2 of 8
      const dM = Mh.logs.filter((m) => /did not reach the Mac/.test(m));
      ok(writes.length - wM === 0 && dM.length === 2 && gateOf(/another transfer is writing/.test(dM[0])) && gateOf(/try 1 of 8/.test(dM[0])) && gateOf(/the link to the machine dropped/.test(dM[1])) && gateOf(/try 2 of 8/.test(dM[1])) && !Mh.logs.some((m) => /nothing sent, no try spent|refused the push before/.test(m)), 'r9 the deliveries that fail still spend a try — the open refused at the Mac\'s door (no code) and the link dropped under the bytes (`stalled`): the link took the push, try 1 and try 2 of 8, never «refused the push before the device link opened» (a CODE says which — never a message\'s words)', { dM: dM.length });
      await Mh.done();
      // leg «r9 the pending door names the next run» (rule 3): the agent's pending `tries` counts the codesign runs that went UNANSWERED on these bytes; the hub's door names the NEXT check — tries 1 ⇒ «try 2 of 3», tries 2 ⇒ «try 3 of 3, the last» (a second hold line: the count advanced), the third unanswered run ⇒ the agent's refusal with an `until` ⇒ the unanswered door (20b87789b said «try k of 3» of the next check after k had failed, and told the advance to nobody)
      const macQ = { refused: null, pending: null, kind: 'adhoc', judge() { } }; const Qh = macFake('host-pending-advance', macQ); clock7 = T7 + 2300 * 60e3; const TQ = clock7, wQ = writes.length;
      await Qh.start();                                                                 // X pushed (try 1); the Mac's codesign answers nothing
      macQ.pending = { version: SRC.VERSION, sha256: shaX7, tries: 1 }; clock7 = TQ + 60e3; await Qh.start(); clock7 = TQ + 2 * 60e3; await Qh.start();
      macQ.pending = { version: SRC.VERSION, sha256: shaX7, tries: 2 }; clock7 = TQ + 3 * 60e3; await Qh.start(); clock7 = TQ + 4 * 60e3; await Qh.start();
      macQ.pending = null; macQ.refused = forUntil(shaX7, TQ + 40 * 60e3); clock7 = TQ + 5 * 60e3; await Qh.start();
      const hQ = Qh.holdLines();
      ok(writes.length - wQ === 1 && hQ.length === 3 && gateOf(/judging it \(codesign answered nothing 1 of 3 times so far\) — judged at the Mac's next check \(try 2 of 3\) — taken then, or refused with that refusal's own door/.test(hQ[0])) && gateOf(/codesign answered nothing 2 of 3 times so far\) — judged at the Mac's next check \(try 3 of 3, the last\) — taken then/.test(hQ[1])) && !/try 2 of 3\)/.test(hQ[1]) && verdictOf(new RegExp(`pushed again when that is over \\(its door: \`until\` ${new Date(TQ + 40 * 60e3).toISOString()} passed, or the agent's next start\\)`).test(hQ[2])), 'r9 the pending door names the next run — a judgment in progress is told with the runs that went unanswered and the NEXT check\'s number (tries 1 ⇒ «try 2 of 3»; tries 2 ⇒ «try 3 of 3, the last», a second line for the advance); the third unanswered run makes the agent\'s refusal with an `until` ⇒ the unanswered door (acceptance r8 minor: 20b87789b said «try 2 of 3» of the next check after two had failed, one line only)', { hQ: hQ.length });
      await Qh.done();
      // leg «r9 the push line promises what the machine does» (rule 4): the push line promises no re-push at dueAt while the Mac names a hold on these bytes — the Mac refuses X for good ⇒ 70 starts a minute apart send nothing more (one hold line names the verdict's door), as the words say; with NO hold named (an agent that lost its record) X goes again at the first start after the ISO the line named, as the words say (20b87789b promised «pushed again at the first stream start after <ISO>» of a push the Mac then held for good — a push that never came)
      const macW = { refused: null, kind: 'adhoc', judge(s256) { if (s256 === shaX7) macW.refused = forGood(shaX7); } };
      const Wh = macFake('host-promise', macW); clock7 = T7 + 2500 * 60e3; const TW = clock7, wW = writes.length;
      await Wh.start(); const pW = Wh.pushLines();
      for (let m = 1; m <= 70; m++) { clock7 = TW + m * 60e3; await Wh.start(); } const wv = writes.length - wW;
      const macN = { refused: null, kind: 'adhoc', judge() { } }; const Nh = macFake('host-nohold', macN); clock7 = T7 + 2700 * 60e3; const TN = clock7, wN = writes.length;
      await Nh.start(); const pN = Nh.pushLines(); const isoN = (pN[0].match(/pushed again at the first stream start after (\S+) while the Mac still wants a signed build/) || [])[1];
      for (const m of [1, 10, 29]) { clock7 = TN + m * 60e3; await Nh.start(); } const n1 = writes.length - wN;
      clock7 = TN + 30 * 60e3; await Nh.start(); const n2 = writes.length - wN;
      ok(pW.length === 1 && gateOf(/try 1 of 8 — not sent again while the Mac's answer names its hold on these bytes \(the hold line at the next stream start names that hold's door; another prebuilt in this hub's helpers dir goes at that start\); with no hold named, pushed again at the first stream start after \S+ while the Mac still wants a signed build$/.test(pW[0])) && !/sooner only once/.test(pW[0]) && wv === 1 && Wh.holdLines().length === 1 && gateOf(/not sent again while that verdict stands/.test(Wh.holdLines()[0])) && isoN === new Date(TN + 30 * 60e3).toISOString() && n1 === 1 && n2 === 2 && Nh.pushLines().length === 2 && verdictOf(/try 2 of 8/.test(Nh.pushLines()[1])), 'r9 the push line promises what the machine does — after the push: «not sent again while the Mac\'s answer names its hold on these bytes (…); with no hold named, pushed again at the first stream start after <ISO> …» — the Mac holding X for good: one push in 70 min and one hold line (the verdict\'s door); the Mac naming no hold: X again at the first start after that very ISO as try 2 of 8 (acceptance r8 unverified row: 20b87789b promised a re-push at dueAt the hub never makes while the Mac holds those bytes)', { wv, holds: Wh.holdLines().length, isoN, n1, n2 });
      await Wh.done(); await Nh.done(); putX();
      // ROUND 10 (acceptance r9 — the code set held; two majors and a minor, latent until the Team ID: the owner's «Hub automation» gate was asked at every paced push for the hub's life; the device client's connect() throws, before any channel, spent tries; a card held start() past the idle sweep, which stopped the session with sid null and left the Mac's offered session open) — RE-PINNED in ROUND 11 (acceptance r10: the lane sat on 335d05ad1; the tree it ships on carries ledger-dedup-law's asker — a background subject's ONE standing notice: its first act held 60 s, every later one refused AT ONCE (`ask_standing`) and counted on it, a person's Deny stored per subject and read back at boot. Round 10's legs pinned the OLD asker: on the merged tree the Deny leg went RED and the unanswered leg HUNG; `ask_standing` counted as a DELIVERY — 8 tries, 0 bytes, then the host shut even after Always allow). Every leg below runs the REAL DeviceManager + the REAL asker + the REAL For-you store (src/user-todos.js); each hold is driven by the leg (the owner's hand, or its 60-s timer fired) and every wait is bounded — a start that never answers FAILS its leg by name
      const HA = require(path.join(REPO, 'src/server/hub-act-ask.js')), HP = require(path.join(REPO, 'src/hub-act-policy.js')), { UserTodoManager: UTM11 } = require(path.join(REPO, 'src/user-todos.js'));
      const d10 = home('smac-r10'), SDP10 = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
      const nap10 = (ms) => new Promise((r) => setTimeout(r, ms));
      const within11 = (p, what) => { let t; return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), new Promise((r) => { t = setTimeout(() => r({ hung: what }), 20000); })]); }; // the bound of a wait that could hang: the leg FAILS by name, the suite goes on
      const stores11 = [];
      // one Mac on a CLUSTER instance (its Hub automation «ask» by default), named `name` (r12; «mac»): the Mac a stub that takes the bytes; the owner's hand when the push is held (`hand`): deny | once | none (the hold's 60-s timer fired) | manual (the leg's own); `todos` + `clk`: the NEXT hub life on the same For-you store
      const realMac11 = (hostId, o = {}) => {
        const clk = o.clk || { t: Date.UTC(2032, 0, 1) };
        const st = { clk, get clock() { return clk.t; }, set clock(v) { clk.t = v; }, t0: clk.t, hand: o.hand || 'none', list: o.list || null, setting: o.setting || 'auto', unfiled: false, refused: null, timers: [], holds: [], hung: null, logs: [], devLog: [], opens: 0, ends: 0, macSids: new Set(), sidN: 0 };
        const dir = path.join(d10, 'todos-' + hostId); fs.mkdirSync(dir, { recursive: true });
        const store = o.todos || new UTM11({ dataDir: dir, expirySweepMs: 0, now: () => clk.t }); if (!o.todos) stores11.push(store);
        st.todos = store;
        const todos = new Proxy(store, { get: (t, k) => (k === 'add' ? (...a) => { if (st.unfiled) throw new Error('For you is full'); return t.add(...a); } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); // `unfiled`: the store refuses the item
        st.asker = HA.create({ hosts: { get: (id) => (id === hostId ? { id: hostId, name: o.name || 'mac', ...(st.list ? { exit: { hub: { mode: st.list } } } : {}) } : null) }, userTodos: todos, now: () => clk.t, instanceKind: 'cluster', settingOf: () => st.setting,
          setHubPolicy: async (h, mode) => { st.list = mode; },
          timers: { set: (fn, ms) => { const x = { fn, due: clk.t + ms }; st.timers.push(x); return x; }, clear: (x) => { st.timers = st.timers.filter((y) => y !== x); } } });
        st.tick = (ms) => { clk.t += ms; const due = st.timers.filter((x) => x.due <= clk.t); st.timers = st.timers.filter((x) => x.due > clk.t); for (const x of due) { try { x.fn(); } catch { } } };
        const dm = new DeviceManager({ dataDir: d10, bundlePath: path.join(d10, 'none.js'), version: '0', log: (m) => st.devLog.push(String(m)), actGate: { check: (p, x) => st.asker.check(hostId, p, x), verdict: (p, x) => st.asker.verdict(hostId, p, x) } });
        const conn = { info: { capabilities: ['fs-write-stream'], platform: 'darwin' }, nextChan: 1, sessions: new Map(), mux: { data: () => true } };
        dm._conn = conn; dm.connect = async () => conn;
        dm._request = async (req) => { if (req.step === 'open') st.opens++; if (req.step === 'end') { st.ends++; return { size: req.sent, sha256: req.sha256 }; } return { ok: true }; };
        dm.streamOffer = async () => { if (o.noHelper && st.ends === 0) return { ok: false, code: 'no_helper', error: 'the Mac has no screen helper and no compiler', helper: { dir: PP.dir, version: SRC.VERSION } }; const sid = 'm' + (++st.sidN); st.macSids.add(sid); return { ok: true, sid, offer: { type: 'offer', sdp: SDP10 }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: !o.noHelper, ...(st.refused ? { refused: st.refused } : {}) } }; }; // `refused` (r12): the Mac's answer names bytes it refused
        dm.streamStop = async (sid) => ({ ok: true, stopped: st.macSids.delete(sid) });
        st.hub = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clk.t, ...(o.sweepMs ? { sweepMs: o.sweepMs } : {}), log: { log: (m) => st.logs.push(m), warn: (m) => st.logs.push(m) } });
        // one stream start: when the push is HELD (the asker's list names it) the owner's hand settles it — never a wait on a hold the asker did not file
        st.start = async (at) => {
          if (at != null) clk.t = at;
          let done = false; const p = st.hub.start(hostId).then((x) => { done = true; return x; });
          for (let i = 0; i < 1000 && !done; i++) {
            await nap10(1);
            const k = st.hand === 'manual' ? null : st.asker.list().find((a) => a.by === 'system:desktop-webrtc');
            if (!done && k) { st.holds.push(Math.round((clk.t - st.t0) / 60e3)); if (st.hand === 'none') st.tick(HP.ASK_TTL_MS); else { clk.t += 20e3; await st.asker.answer(k.askId, { answer: st.hand, by: 'user', answeredBy: 'owner', person: true }).catch(() => { }); } }
          }
          const x = await within11(p, `${hostId}: start() at minute ${Math.round((clk.t - st.t0) / 60e3)} never answered`);
          if (x.hung) { st.hung = st.hung || x.hung; return x; }
          if (x.key) await st.hub.stop(x.key, 'stopped').catch(() => { });
          return x;
        };
        st.items = () => store.idsWhere((i) => i.action && (i.action.type === HA.ACTION_TYPE || i.action.type === HA.STANDING_TYPE)).length; // the owner's cards / notices
        st.tries = () => st.logs.filter((m) => /try \d of 8|not again in this hub's life/.test(m)).length;
        st.refusals = () => st.logs.filter((m) => /nothing sent, no try spent/.test(m));
        st.notSent = () => st.devLog.filter((m) => /NOT SENT/.test(m)).length;
        // B-c632 (its confirming read's N1): EVERY paced push reached the gate — the open folds said, each first line counts 1, a
        // fold line its «N more time(s)»
        st.pushesRefused = () => { try { dm._foldEndAll(); } catch { } return st.devLog.filter((m) => /NOT SENT/.test(m)).reduce((n, m) => { const r = / (\d+) more time\(s\) since /.exec(m); return n + (r ? Number(r[1]) : 1); }, 0); };
        return st;
      };
      ident({});
      // leg «r11 the owner's Deny is the asker's» (rule 2 — re-pins «r10 a Deny is asked once per hub life»: that «once per hub life» was FALSE on the tree this ships on — the asker STORES a person's Deny per subject and reads it back at boot — and round 10's words promised re-asks the asker never makes): the owner denies the first push's hold ⇒ 48 paced starts (24 h): no other hold, ONE item, no try, said once in words that name only this tree's doors; another prebuilt dropped in ⇒ no hold (the subject is this push's file acts on the machine, not its bytes); the NEXT hub life on the same store ⇒ refused at once — no hold, no new item; the instance's default changed ⇒ still refused; the machine's list «Always allow» ⇒ pushed (try 1 of 8). The list «Never» ⇒ refused at once at each paced push (the gate decides each one — no memory here), no item, said once; back to «ask» ⇒ ONE hold (the asker asks afresh)
      const A11 = realMac11('host-r11-deny', { hand: 'deny' }); const TA11 = A11.t0;
      for (let k = 0; k < 48; k++) await A11.start(TA11 + k * 30 * 60e3);
      const aH1 = A11.holds.join(), aI1 = A11.items(), aR1 = A11.refusals();
      putY(); for (let k = 48; k < 60; k++) await A11.start(TA11 + k * 30 * 60e3);
      const aH2 = A11.holds.length, aI2 = A11.items(), aR2 = A11.refusals().length;
      A11.hub.shutdown();
      const B11 = realMac11('host-r11-deny', { hand: 'deny', todos: A11.todos, clk: A11.clk }); // the next hub life: a new asker (it reads the store when it is built), a new hub, the same For-you store
      for (let k = 60; k < 72; k++) await B11.start(TA11 + k * 30 * 60e3);
      const bH1 = B11.holds.length, bI1 = B11.items(), bR1 = B11.refusals();
      B11.setting = 'ask'; B11.asker.reevaluate(); for (let k = 72; k < 84; k++) await B11.start(TA11 + k * 30 * 60e3);
      const bH2 = B11.holds.length;
      B11.list = 'everyone'; B11.asker.onPolicyChanged('host-r11-deny'); await B11.start(TA11 + 84 * 30 * 60e3);
      putX(); B11.hub.shutdown();
      const N11 = realMac11('host-r11-never', { list: 'nobody' }); const TN11 = N11.t0;
      for (let k = 0; k < 24; k++) await N11.start(TN11 + k * 30 * 60e3);
      const nH1 = N11.holds.length, nI1 = N11.items(), nR1 = N11.refusals(), nNot1 = N11.notSent(), nPush1 = N11.pushesRefused();
      N11.list = 'ask'; N11.asker.onPolicyChanged('host-r11-never'); for (let k = 24; k < 36; k++) await N11.start(TN11 + k * 30 * 60e3);
      N11.hub.shutdown();
      const doors11 = /looked at again at the first stream start after \S+, then once per 30 min, while the Mac still wants a signed build \(said once/, false11 = /asked (about )?again|once per 6 h|card is up|answer is kept/;
      ok(aH1 === '0' && aI1 === 1 && aR1.length === 1 && gateOf(/\(hub_act_denied: the user denied it/.test(aR1[0])) && gateOf(/nothing sent, no try spent \(0 of 8 spent\)/.test(aR1[0])) && gateOf(doors11.test(aR1[0])) && !false11.test(aR1[0]) && aH2 === 1 && aI2 === 1 && aR2 === 1 && A11.tries() === 0 && A11.opens === 0 && bH1 === 0 && bI1 === 1 && bR1.length === 1 && gateOf(/\(hub_act_denied: the user denied it/.test(bR1[0])) && bH2 === 0 && B11.opens === 1 && B11.tries() === 1 && gateOf(/try 1 of 8/.test(B11.logs.find((m) => /pushed this hub's signed prebuilt/.test(m)) || '')) && nH1 === 0 && nI1 === 0 && nR1.length === 1 && gateOf(/its Hub automation list is Never/.test(nR1[0])) && gateOf(doors11.test(nR1[0])) && nNot1 === 1 && nPush1 === 24 /* B-c632: 24 refusals of one verdict = ONE NOT SENT line, the 23 repeats counted on its fold — and every one of the 24 reached the gate */ && N11.holds.join() === '720' && N11.items() === 1 && N11.tries() === 0 && !A11.hung && !B11.hung && !N11.hung, 'r11 the owner\'s Deny is the asker\'s — denied at the first push\'s hold: 48 paced starts (24 h) hold nothing more, ONE item, no try, said once naming only this tree\'s doors; another prebuilt ⇒ no hold; the NEXT hub life on the same store ⇒ refused at once (no hold, no new item); the default changed ⇒ still refused; «Always allow» ⇒ pushed (try 1 of 8); the list «Never» ⇒ each paced push refused at once by the gate, no item, said once — back to «ask» ⇒ one hold (acceptance r10 M2: round 10 pinned the old asker and promised re-asks the asker never makes)', { aH1, aI1, aR1: aR1.map((m) => m.slice(0, 200)), aH2, aI2, bH1, bI1, bH2, bOpens: B11.opens, nH1, nI1, nNot1, nHolds: N11.holds, hung: [A11.hung, B11.hung, N11.hung] });
      // leg «r11 an unanswered ask is ONE standing notice — never asked again» (rule 2 — re-pins «r10 an unanswered ask comes again at most once per 6 h»: the asker this tree ships never re-asks a standing subject, so round 10's 6-h re-ask and its door are GONE): nobody answers — 288 starts every 5 min (24 h) ⇒ ONE hold (minute 0, its 60 s ran out), ONE item whose count is 48 (every paced push refused AT ONCE — `ask_standing` — and counted on it), no try, said twice (the hold's «nobody answered within 60 s», then «counted on its notice»); the machine's list «Always allow» ⇒ the item closed, the next start pushes (try 1 of 8). For you refusing the item ⇒ each paced push refused at once (`ask_unfiled`), no hold, no try, said once. An agent's file act holding ITS card on this Mac ⇒ the push is its own subject: its own hold beside the card, never joining it; the owner's Allow of the agent's card lets the agent's act go and not the push (round 10's leg awaited the push behind a card the asker no longer joins — and hung)
      const U11 = realMac11('host-r11-none', { hand: 'none' }); const TU11 = U11.t0;
      for (let k = 0; k < 288; k++) await U11.start(TU11 + k * 5 * 60e3);
      const uSt11 = U11.asker.standingList(), uR11 = U11.refusals(), uT11 = U11.tries(), uI11 = U11.items(), uOpens11 = U11.opens;
      U11.list = 'everyone'; U11.asker.onPolicyChanged('host-r11-none'); await U11.start(TU11 + 288 * 5 * 60e3);
      U11.hub.shutdown();
      const F11 = realMac11('host-r11-unfiled', { hand: 'none' }); F11.unfiled = true; const TF11 = F11.t0;
      for (let k = 0; k < 48; k++) await F11.start(TF11 + k * 30 * 60e3);
      const fNot11 = F11.notSent(), fPush11 = F11.pushesRefused();   // B-c632: one line, and all 48 pushes refused
      F11.hub.shutdown();
      const C11 = realMac11('host-r11-cardup', { hand: 'manual' });
      const agentAct11 = C11.asker.check('host-r11-cardup', { op: 'fs-op', action: 'write', path: '/Users/me/notes.txt', by: 'agent:a1' }); // an agent's file act on this Mac: its card is up, unanswered
      const cStart11 = C11.start(C11.t0); // the push beside it
      let cBoth11 = 0; for (let i = 0; i < 1000 && (cBoth11 = C11.asker.list().length) < 2; i++) await nap10(1);
      const cBy11 = C11.asker.list().map((a) => a.by).sort().join(), cCard11 = C11.asker.list().find((a) => a.by === 'agent:a1');
      if (cCard11) await C11.asker.answer(cCard11.askId, { answer: 'once', by: 'user', answeredBy: 'owner', person: true }); // the owner allows the AGENT's act
      const cAgent11 = await within11(agentAct11, 'the agent\'s act never settled');
      const cLeft11 = C11.asker.list().map((a) => a.by).join();
      C11.tick(HP.ASK_TTL_MS); const cX11 = await cStart11; // the push's own 60 s run out
      C11.hub.shutdown();
      ok(U11.holds.join() === '0' && uI11 === 1 && uSt11.length === 1 && uSt11[0].count === 48 && uSt11[0].by === 'system:desktop-webrtc' && uR11.length === 2 && gateOf(/\(ask_expired: nobody answered within 60 s/.test(uR11[0])) && gateOf(/\(ask_standing: .*counted on its notice in For you \(no new card\)/.test(uR11[1])) && gateOf(uR11.every((m) => /nothing sent, no try spent \(0 of 8 spent\)/.test(m) && doors11.test(m) && !false11.test(m))) && uT11 === 0 && uOpens11 === 0 && U11.asker.standingList().length === 0 && U11.tries() === 1 && gateOf(/try 1 of 8/.test(U11.logs.find((m) => /pushed this hub's signed prebuilt/.test(m)) || '')) && F11.holds.length === 0 && F11.items() === 0 && F11.tries() === 0 && fNot11 === 1 && fPush11 === 48 /* B-c632: 48 refusals of one act and verdict (ask_unfiled) = ONE NOT SENT line, the 47 repeats counted on its fold — every push reached the gate */ && F11.refusals().length === 1 && gateOf(/\(ask_unfiled: /.test(F11.refusals()[0])) && cBoth11 === 2 && cBy11 === 'agent:a1,system:desktop-webrtc' && gateOf(cAgent11) && cAgent11.ok === true && cLeft11 === 'system:desktop-webrtc' && gateOf(cX11) && cX11.take === true && C11.opens === 0 && C11.tries() === 0 && gateOf(/\(ask_expired: /.test(C11.refusals()[0] || '')) && C11.items() === 2 && ![U11, F11, C11].some((w) => w.hung), 'r11 an unanswered ask is ONE standing notice — never asked again: nobody answers, 288 starts in 24 h ⇒ one hold (minute 0), one item counting 48 refusals, no try, said twice; «Always allow» ⇒ the item closed, pushed (try 1 of 8); For you refusing the item ⇒ refused at once each paced push, no hold, no try; an agent\'s card up on this Mac ⇒ the push holds on its own subject beside it, the agent\'s Allow lets only the agent\'s act go (acceptance r10 M1 + M2: `ask_standing` spent eight tries; round 10\'s 6-h re-ask is a door the tree does not have; its card-up leg hung)', { holds: U11.holds, uI11, standing: uSt11, uR11: uR11.map((m) => m.slice(0, 160)), uT11, unfiled: { holds: F11.holds.length, items: F11.items(), notSent: F11.notSent() }, cBoth11, cBy11, cAgent11, cLeft11, cX11: cX11 && { take: cX11.take, hung: cX11.hung }, hung: [U11.hung, F11.hung, C11.hung] });
      // leg «r11 a refusal on the hub's side spends no try, whatever its code» (rule 1 — acceptance r10 M1: the asker this tree ships refuses with `ask_standing`, a code round 9's hand-kept set did not hold): EVERY code of the asker's own table (hub-act-policy REFUSALS, read here — a code it adds is in this leg), a code it does not have yet, the capability gate (an old agent) and the device's allow list judged on the hub — each through the REAL device client's send point: `stage: 'gate'` ⇒ pushMacHelper `refusedOnHub` (no `sent`), 9 paced starts spend no try and say it once; a refusal at the Mac's door (the open travelled) stays a DELIVERY — a try each, «not again» after eight
      const gRows11 = [];
      for (const g of [...HP.REFUSALS.map((code) => ({ name: code, code })), { name: 'ask_brand_new', code: 'ask_brand_new' }, { name: 'old-agent', oldAgent: true }, { name: 'allow-list', list: true }, { name: 'mac-door', door: true }]) {
        let clock = Date.UTC(2032, 4, 1), opens = 0; const logs = [];
        const dm = new DeviceManager({ dataDir: d10, bundlePath: path.join(d10, 'none.js'), version: '0', log: () => { }, actGate: { check: async () => (g.code ? { ok: false, code: g.code, error: `the gate refused it (${g.code})`, ask: 'standing' } : null), verdict: () => ({ verdict: g.code ? 'ask' : 'allow' }) } });
        const conn = { info: { capabilities: g.oldAgent ? [] : ['fs-write-stream'], platform: 'darwin', ...(g.list ? { policy: { v: 1, allow: ['input'], all: false, source: 'install', at: 1 } } : {}) }, nextChan: 1, sessions: new Map(), mux: { data: () => true } };
        dm._conn = conn; dm.connect = async () => conn;
        dm._request = async (req) => { if (req.step === 'open') { opens++; if (g.door) throw new Error('another transfer is writing that file'); } return req.step === 'end' ? { size: req.sent, sha256: req.sha256 } : { ok: true }; };
        dm.streamOffer = async () => ({ ok: true, sid: 'g1', offer: { type: 'offer', sdp: SDP10 }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: true } });
        dm.streamStop = async () => ({ ok: true });
        const p0 = await DW.pushMacHelper(dm, { dir: PP.dir, version: SRC.VERSION }, hubBin, { signedOnly: true });
        const hub = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock, log: { log: (m) => logs.push(m), warn: (m) => logs.push(m) } });
        const T = clock; for (let k = 0; k < 9; k++) { clock = T + k * 31 * 60e3; const x = await hub.start('host-r11-gate-' + g.name); if (x.key) await hub.stop(x.key, 'stopped').catch(() => { }); }
        hub.shutdown();
        gRows11.push({ name: g.name, refusedOnHub: p0.refusedOnHub || null, sent: p0.sent === true, ask: p0.ask || null, tries: logs.filter((m) => /try \d of 8|not again in this hub's life/.test(m)).length, said: logs.filter((m) => /nothing sent, no try spent/.test(m)).length, opens });
      }
      const gDoor11 = gRows11.find((r) => r.name === 'mac-door'), gHub11 = gRows11.filter((r) => r !== gDoor11);
      ok(gateOf(HP.REFUSALS.includes('ask_standing')) && gHub11.length === HP.REFUSALS.length + 3 && gateOf(gHub11.every((r) => r.refusedOnHub === (r.name === 'old-agent' ? 'host_needs_daemon' : r.name === 'allow-list' ? 'op-not-allowed' : r.name) && !r.sent && r.tries === 0 && r.said === 1 && r.opens === 0)) && gRows11.find((r) => r.name === 'ask_standing').ask === 'standing' && gateOf(gDoor11) && gateOf(gDoor11.sent) && gDoor11.refusedOnHub === null && gDoor11.tries === 8 && gDoor11.opens === 9, `r11 a refusal on the hub's side spends no try, whatever its code — every code of the asker's own table (${HP.REFUSALS.join(', ')}), one it does not have yet, an old agent, the device's allow list: refused before the channel (\`stage: 'gate'\`), no \`sent\`, 9 paced starts spend none and say it once; the open refused at the Mac's door stays a delivery — 8 tries (acceptance r10 M1: \`ask_standing\` spent eight tries, 0 bytes, then the host shut)`, gRows11);
      // leg «r12 a refusal's door is never cut» (acceptance r11 minor 1 — the LIVE no-helper road): the push's refusal on the hub's side carries the gate's sentence WHOLE — its door ends it («… on the machine row (Remote tab) → Hub automation») — in start()'s `why` (the API answer a person's page shows) and in the hub's [stream] line; machines named with 3, 21 and 70 chars (the asker folds a name to 60): nobody answers (ask_expired, then ask_standing), the owner denies (hub_act_denied, then the stored Deny's), the list says Never (hub_act_denied, nobody). 170b0f715 cut the sentence at 240 chars — the ask_standing door mid-word («→ Hub au»)
      const dRows12 = [];
      for (const name of ['mac', 'design-studio-mac-pro', 'render-farm-mac-studio-' + 'r'.repeat(47)]) {
        for (const road of [{ hand: 'none', codes: [['ask_expired', ''], ['ask_standing', '']] }, { hand: 'deny', codes: [['hub_act_denied', ''], ['hub_act_denied', '']] }, { list: 'nobody', codes: [['hub_act_denied', 'nobody'], ['hub_act_denied', 'nobody']] }]) {
          const hostId = `host-r12-door-${name.length}-${road.hand || road.list}`;
          const D = realMac11(hostId, { name, noHelper: true, hand: road.hand || 'none', list: road.list || null });
          const xs = []; for (let k = 0; k < 2; k++) xs.push(await D.start(D.t0 + k * 5 * 60e3));
          D.hub.shutdown();
          xs.forEach((x, k) => {
            const [code, reason] = road.codes[k], sentence = HP.refusalText(code, { machine: name, kind: 'files', reason }), whole = `(${code}: ${sentence})`;
            dRows12.push({ name: name.length, road: road.hand || road.list, k, code, len: sentence.length, take: x.take, whyWhole: typeof x.why === 'string' && x.why.endsWith(whole), lineWhole: D.logs.some((m) => m.includes(whole)), door: sentence.endsWith(HP.WAY_OUT), tail: String(x.why || x.hung || '').slice(-40) });
          });
        }
      }
      ok(dRows12.length === 18 && gateOf(dRows12.every((r) => r.take === false && r.door && r.whyWhole && r.lineWhole)) && verdictOf(dRows12.some((r) => r.len > 240)), 'r12 a refusal\'s door is never cut — on the no-helper road the push\'s refusal on the hub\'s side carries the gate\'s sentence WHOLE, its door at the end («… on the machine row (Remote tab) → Hub automation»), in start()\'s `why` and in the hub\'s [stream] line: machines named with 3, 21 and 70 chars × nobody answers (ask_expired, then ask_standing) / the owner denies (hub_act_denied, then the stored Deny) / the list says Never (hub_act_denied, nobody); 170b0f715 cut it at 240 chars (the ask_standing door «→ Hub au»)', dRows12.filter((r) => !(r.take === false && r.door && r.whyWhole && r.lineWhole)));
      // leg «r12 the own-sent refusal line names the cadence the hub keeps» (acceptance r11 minor 2 — the push-line truth rule): the hub delivered X (the list said Always allow); the Mac's answer then names X refused (a hold on the hub's OWN bytes), a corrected prebuilt Y is dropped in, and the owner sets the machine's list back to «ask» ⇒ 10 starts one minute apart: the gate is asked at EVERY start (10 refusals counted on its notice, nothing sent, no try spent) and the line says so — «asked at each stream start until the machine's list changes» — never «then once per 30 min» (170b0f715's words, a pace the code does not keep; no pace is added — the asker's standing refusal answers at once); a refusal with no gate in it (Y an ad-hoc build, the list Always allow) says «looked at again at every stream start while the Mac's answer names the bytes this hub sent»
      const O12 = realMac11('host-r12-ownsent', { list: 'everyone', hand: 'none' });
      const shaO12 = sha(hb); await O12.start(O12.t0);
      const oTry12 = O12.tries(), oOpens12 = O12.opens;
      O12.refused = { sha256: shaO12, code: 'helper_unsigned', why: 'codesign: not the pinned team' }; putY();
      O12.list = 'ask'; O12.asker.onPolicyChanged('host-r12-ownsent');
      for (let k = 1; k <= 10; k++) await O12.start(O12.t0 + k * 60e3);
      const oR12 = O12.refusals(), oNot12 = O12.notSent(), oPush12 = O12.pushesRefused(), oSt12 = O12.asker.standingList();
      ident({ kind: 'adhoc' }); O12.list = 'everyone'; O12.asker.onPolicyChanged('host-r12-ownsent'); await O12.start(O12.t0 + 11 * 60e3);
      const oR12b = O12.refusals().slice(oR12.length);
      O12.hub.shutdown(); putX();
      const cadence12 = /asked at each stream start until the machine's list changes \(the Mac's answer names the bytes this hub sent, sha256 [0-9a-f]{12}…: looked at at every start — no pace of the hub's own\) \(said once/;
      ok(!O12.hung && oTry12 === 1 && oOpens12 === 1 && oR12.length === 2 && gateOf(/\(ask_expired: /.test(oR12[0])) && gateOf(/\(ask_standing: /.test(oR12[1])) && gateOf(oR12.every((m) => cadence12.test(m) && m.includes(`sha256 ${shaO12.slice(0, 12)}…`) && !/once per 30 min|first stream start after/.test(m))) && oNot12 === 2 && oPush12 === 10 /* B-c632: one NOT SENT line per verdict (expired, then standing) — the 8 standing repeats counted on its fold; all 10 reached the gate */ && oSt12.length === 1 && oSt12[0].count === 10 && O12.tries() === 1 && O12.opens === 1 && oR12b.length === 1 && gateOf(/not a Developer ID build/.test(oR12b[0])) && gateOf(oR12b[0].includes(`looked at again at every stream start while the Mac's answer names the bytes this hub sent (sha256 ${shaO12.slice(0, 12)}…)`)) && !/once per 30 min|asked at each/.test(oR12b[0]), 'r12 the own-sent refusal line names the cadence the hub keeps — X delivered (try 1 of 8), the Mac\'s answer names X refused, Y dropped in, the list back to «ask» ⇒ 10 starts a minute apart: the gate asked at EVERY start (10 refusals on its one notice, nothing sent, no try spent), the line «asked at each stream start until the machine\'s list changes» — never «then once per 30 min» (170b0f715); a refusal with no gate in it (an ad-hoc Y) «looked at again at every stream start while the Mac\'s answer names the bytes this hub sent»', { tries: oTry12, opens: O12.opens, notSent: oNot12, standing: oSt12.map((x) => x.count), lines: [...oR12, ...oR12b].map((m) => m.slice(-260)) });
      // leg «r10 a throw of connect() spends no try» (rule 2): the REAL connect() throws before any channel — the link token's function (`vault_locked`: a locked vault), a dialed device that refused the host key («auth failed»), a client stopped («stopped», no code) — marked `stage: 'connect'` at its one exit: the signed push says it once («the push never left this hub — the device link did not connect (<code>: …)») and spends no try over 9 paced starts; the link back ⇒ pushed, try 1 of 8 (a74960179: «try 1 … 7 of 8», then «not again in this hub's life» with nothing sent)
      const cRows10 = [];
      for (const mode of ['vault_locked', 'auth_failed', 'stopped']) {
        let clock = Date.UTC(2032, 2, 1), down = true, opens = 0; const logs = [];
        const conn = { info: { capabilities: ['fs-write-stream'], platform: 'darwin' }, nextChan: 1, sessions: new Map(), mux: { data: () => true } };
        const transport = { kind: 'stream', getStream: () => null, hostToken: () => { if (down && mode === 'vault_locked') throw Object.assign(new Error('the vault is locked — the link token opens after the owner unlocks the vault'), { code: 'vault_locked' }); return 'tok'; } };
        const dm = new DeviceManager({ dataDir: d10, bundlePath: path.join(d10, 'none.js'), version: '0', log: () => { }, transport });
        dm._tryOnce = async () => { if (down && mode === 'auth_failed') throw Object.assign(new Error('agentd auth failed — token mismatch'), { code: 'auth_failed' }); dm._conn = conn; return conn; };
        if (mode === 'stopped') dm._stopped = true;
        dm._request = async (req) => { if (req.step === 'open') opens++; return req.step === 'end' ? { size: req.sent, sha256: req.sha256 } : { ok: true }; };
        dm.streamOffer = async () => { dm._conn = null; return { ok: true, sid: 'c1', offer: { type: 'offer', sdp: SDP10 }, source: { kind: 'screen', origin: { x: 0, y: 0 } }, helper: { dir: PP.dir, version: SRC.VERSION, identity: { kind: 'adhoc' }, wantSigned: true } }; }; // the answer came on a live link; it dropped right after
        dm.streamStop = async () => ({ ok: true });
        const hub = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, now: () => clock, log: { log: (m) => logs.push(m), warn: (m) => logs.push(m) } });
        const T = clock, startAt = async (k) => { clock = T + k * 31 * 60e3; const x = await hub.start('host-r10-' + mode); if (x.key) await hub.stop(x.key, 'stopped').catch(() => { }); };
        for (let k = 0; k < 9; k++) await startAt(k);
        const e = await dm.fsWriteStream('/Users/me/x', { source: (async function* () { })(), size: 0, by: 'system:test' }).then(() => null, (x) => x);
        const triesDown = logs.filter((m) => /try \d of 8|not again in this hub's life/.test(m)).length, lines = logs.filter((m) => /the push never left this hub — the device link did not connect/.test(m));
        down = false; dm._stopped = false; await startAt(9);
        cRows10.push({ mode, triesDown, lines: lines.length, word: lines[0] || '', stage: e && e.stage, code: e && e.code, opensDown: opens, healed: logs.filter((m) => /pushed this hub's signed prebuilt.*try 1 of 8/.test(m)).length });
        hub.shutdown();
      }
      ok(cRows10.length === 3 && gateOf(cRows10.every((r) => r.triesDown === 0 && r.lines === 1 && r.stage === 'connect' && r.healed === 1)) && gateOf(/\(vault_locked: the vault is locked/.test(cRows10[0].word)) && cRows10[0].code === 'vault_locked' && gateOf(/\(auth_failed: agentd auth failed/.test(cRows10[1].word)) && verdictOf(/\(no code: stopped\); nothing sent, no try spent \(0 of 8 spent\)/.test(cRows10[2].word)), 'r10 a throw of connect() spends no try — the REAL connect() throwing before any channel (a locked vault\'s `vault_locked` from the token function, «auth failed», «stopped» with no code) is marked `stage: \'connect\'`: 9 paced starts say it once and spend no try; the link back ⇒ pushed as try 1 of 8 (acceptance r9 finding 3: a74960179 spent a try per start — «not again in this hub\'s life» after eight with nothing sent)', cRows10.map((r) => ({ ...r, word: r.word.slice(0, 120) })));
      // …and the end of a push never redials: the link dropped after the last byte ⇒ `stalled` (the bytes went — a delivery), never connect()'s «never sent» shape; RED control: a copy of client.js without that line (a text replace, its requires made absolute) marks the very same drop `stage: 'connect'`
      const endRun10 = async (DMC) => {
        const dm = new DMC({ dataDir: d10, bundlePath: path.join(d10, 'none.js'), version: '0', log: () => { }, transport: { kind: 'stream', getStream: () => null, hostToken: 'tok' } });
        const conn = { info: { capabilities: ['fs-write-stream'], platform: 'darwin' }, nextId: 1, nextChan: 1, pending: new Map(), sessions: new Map(), mux: { data: () => true, control: (m) => setImmediate(() => { const f = conn.pending.get(m.id); if (f) { conn.pending.delete(m.id); f({ op: 'fs-result', id: m.id, ok: true }); } }) } };
        dm._conn = conn; dm._tryOnce = async () => { throw Object.assign(new Error('agentd auth failed — token mismatch'), { code: 'auth_failed' }); }; // the REAL connect(): the live link, then a redial the device refuses
        const src = (async function* () { yield Buffer.alloc(64, 7); dm._conn = null; })(); // the link drops after the last byte
        return dm.fsWriteStream('/Users/me/x', { source: src, size: 64, by: 'system:test' }).then(() => null, (x) => x);
      };
      const eEnd10 = await endRun10(DeviceManager);
      const clientText10 = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
      const END_LINE10 = "      if (linkGone()) throw Object.assign(new Error('the link to the machine dropped'), { code: 'stalled' }); // lane apple-signing r10";
      const mutClient10 = editAnchor(clientText10, END_LINE10, '      void 0; //', "src/agentd/client.js").replace(/require\('\.\.\/([^']+)'\)/g, (m, f) => `require(${JSON.stringify(path.join(REPO, 'src', f))})`).replace(/require\('\.\/([^']+)'\)/g, (m, f) => `require(${JSON.stringify(path.join(REPO, 'src/agentd', f))})`);
      const mutFile10 = path.join(d10, 'client.r10-no-end-check.js'); fs.writeFileSync(mutFile10, mutClient10);
      const eMut10 = await endRun10(require(mutFile10).DeviceManager);
      ok(gateOf(clientText10.includes(END_LINE10)) && gateOf(eEnd10) && eEnd10.code === 'stalled' && eEnd10.stage === undefined && mutClient10 !== clientText10 && gateOf(eMut10) && eMut10.stage === 'connect', 'r10 the end of a push never redials — the link dropped after the last byte ⇒ `stalled` (a delivery: the bytes went), never `stage: \'connect\'`; RED control: client.js without that line marks the same drop «never sent» (a redial\'s connect() throw)', { end: eEnd10 && { code: eEnd10.code, stage: eEnd10.stage }, mut: eMut10 && { code: eMut10.code, stage: eMut10.stage } });
      // leg «r10 a session still starting is never idle» (rule 3 — re-pinned in round 11 on the asker this tree ships: the push's hold is its subject's standing item's first act): the owner's hold on the push lasts 45 s (the hub's clock) while the sweep runs every 5 ms — the signed road (the Mac's session offered BEFORE the push) and the no-helper road (offered after it): no «stopped (idle)» while start() has not answered, the key polls, the idle clock starts at the answer (31 s with no poll ⇒ stopped WITH its sid — the Mac's session ends); the hub shut down under the hold ⇒ start() answers take:false and stops the Mac's offered session itself (a74960179: «session null stopped (idle)», take:true for a key already gone, the Mac's session left open toward too_many_streams)
      const sweepRoad10 = async (hostId, o = {}) => {
        const S = realMac11(hostId, { hand: 'manual', sweepMs: 5, ...o });
        let done = false; const p = S.hub.start(hostId).then((x) => { done = true; return x; });
        for (let i = 0; i < 1000 && !done && S.asker.list().length === 0; i++) await nap10(1);
        const cardUp = S.asker.list().length === 1 && !done;
        S.clock += 45e3; await nap10(40); // the owner reads the notice 45 s; the sweep runs meanwhile
        if (o.shutdown) S.hub.shutdown();
        const k = S.asker.list()[0]; if (k) await S.asker.answer(k.askId, { answer: 'once', by: 'user', answeredBy: 'owner', person: true });
        const x = await within11(p, `${hostId}: start() never answered after the owner's answer`);
        if (x.hung) { S.hub.shutdown(); return { hung: x.hung }; }
        const idleWhileStarting = S.logs.filter((m) => /stopped \(idle\)/.test(m)).length;
        const polled = x.key ? await S.hub.poll(x.key, 0, -1, 0) : null;
        if (x.key) { S.clock += 31e3; await nap10(40); } // 31 s with no poll ⇒ the sweep
        const stops = S.logs.filter((m) => /session \S+ stopped \(/.test(m));
        S.hub.shutdown(); await nap10(5);
        return { cardUp, take: x.take, code: x.code || null, why: x.why || null, polled: polled ? (polled.ended || 'live') : null, idleWhileStarting, stops, macLeft: [...S.macSids], ends: S.ends };
      };
      const sSigned10 = await sweepRoad10('host-r10-sweep-signed'), sUnsigned10 = await sweepRoad10('host-r10-sweep-nohelper', { noHelper: true }), sShut10 = await sweepRoad10('host-r10-sweep-shutdown', { shutdown: true });
      for (const s of stores11) s.stop();
      ok(gateOf([sSigned10, sUnsigned10].every((r) => !r.hung && r.cardUp && r.take === true && r.polled === 'live' && r.idleWhileStarting === 0 && r.stops.length === 1 && /session m1 stopped \(idle\)/.test(r.stops[0]) && r.macLeft.length === 0 && r.ends === 1)) && !sShut10.hung && gateOf(sShut10.cardUp) && sShut10.take === false && sShut10.code === 'offer_failed' && gateOf(/stopped while it started \(shutdown\)/.test(sShut10.why)) && sShut10.macLeft.length === 0 && verdictOf(sShut10.stops.some((m) => /session m1 stopped \(shutdown while it was starting\)/.test(m))), 'r10 a session still starting is never idle — the owner\'s hold on the push lasts 45 s under a 5-ms sweep, on the signed road and the no-helper road: no «stopped (idle)» before start() answers, the key polls, 31 s with no poll after it ⇒ stopped WITH its sid (the Mac\'s session ends); the hub shut down under the hold ⇒ take:false and the Mac\'s offered session stopped by start() itself (acceptance r9 minor: a74960179 stopped it with sid null and left the Mac\'s session open)', { sSigned10, sUnsigned10, sShut10 });
    }
  }
  if (sp.key) await hub2.stop(sp.key, 'stopped').catch(() => { });
  hub2.shutdown?.();
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§7 a REAL Mac-shaped daemon: window-track + display-facts through ITS helper (lane mac-window-list-helper)');
{
  const RWT = /(runWindowTrack\(\{\s*)platform: process\.platform,/, RDF = /(readDisplayFacts\(\{\s*)platform: process\.platform,/;
  const winText = macText.replace(RWT, '$1platform: "darwin",').replace(RDF, '$1platform: "darwin",');
  ok(darwins(winText) - darwins(macText) === 2 && (winText.match(/mac: macWindowLook/g) || []).length === 2 && !/osascript/.test(bundleText), 'the copy also runs the window look and the screen table as darwin (found by content), both handed THE helper; the agent bundle carries no osascript');
  const winBundle = path.join(copyDir, 'mac-win', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(winBundle), { recursive: true }); fs.writeFileSync(winBundle, winText);
  const hW = home('smac-win'), logW = path.join(hW, 'h.log');
  const since = Date.now() - 300; // the run's launch report, just before the app started
  const kid = spawn('sleep', ['60']); cleanups.push(() => { try { kid.kill(); } catch { } });
  const APPW = { id: 5151, pid: kid.pid, app: 'Calc', bundle: 'com.example.calc', title: 'Calc', x: 200, y: 150, w: 400, h: 300, onScreen: true, minimized: null };
  const facts0 = { ...MAC_FACTS, windows: [MAC_FACTS.windows[0], APPW] };
  const FW = writeFakeMacHelper(hW, { version: SRC.VERSION, facts: facts0, tcc: { screen: 'granted', accessibility: 'denied' }, log: logW, flv: flvFile(hW), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  const dm = deviceOn(hW, winBundle);
  await dm.connect();
  const pushes = [];
  const t = await dm.windowTrack({ since }, { onPush: (a) => pushes.push(a) });
  ok(t.result.state === 'found' && t.result.windowId === 5151 && t.result.bundle === 'com.example.calc' && gateOf(t.result.rect) && t.result.rect.x === 200 && verdictOf(t.wid), 'window-track through a REAL daemon on a Mac: the helper\'s facts find the app by its process\'s start (REAL ps) — its window was there at the first look', t);
  FW.set({ facts: { ...facts0, windows: [MAC_FACTS.windows[0], { ...APPW, x: 260 }] } });
  ok(verdictOf(await until(() => pushes.some((a) => a.state === 'found' && a.rect && a.rect.x === 260), 5000)), 'a move reaches the hub as a push (the helper read every 500 ms)', pushes);
  FW.set({ facts: { ...facts0, windows: [MAC_FACTS.windows[0]] } });
  ok(verdictOf(await until(() => pushes.some((a) => a.state === 'found' && a.minimized === true && a.rect && a.rect.x === 260), 5000)), 'off the helper\'s list while the app runs (Accessibility off) ⇒ minimized, its last rectangle', pushes.slice(-2));
  kid.kill();
  ok(verdictOf(await until(() => pushes.some((a) => a.state === 'gone'), 5000)), 'its app ended ⇒ gone: the watch ends', pushes.slice(-2));
  const d = await dm.displayFacts();
  ok(gateOf(d.ok) && d.platform === 'darwin' && d.displays.map((x) => x.id).join() === '3,2' && gateOf(d.displays[0].primary) && d.displays[1].x === -1920 && d.displays[0].scale === 2, 'display-facts through the daemon: the helper\'s displays (the main one first, top-left points, its scale)', d);
  FW.set({ tcc: { screen: 'denied', accessibility: 'denied' } });
  const r = await dm.windowTrack({ since: Date.now() });
  ok(r.result.state === 'error' && r.result.code === 'screen_permission' && verdictOf(/vibespace-screen/.test(r.result.error)), 'Screen Recording off for the helper ⇒ the look is refused BY NAME through the daemon', r.result);
  const argvs = helperLog(logW).map((l) => l.argv).filter(Boolean);
  ok(argvs.length >= 5 && verdictOf(argvs.every((a) => a[0] === '--disclaim' && a[1] === 'facts')), 'every helper run the daemon made for these was a DISCLAIMED `facts` — the window look ran nowhere else', { n: argvs.length, odd: argvs.filter((a) => a[1] !== 'facts') });
}
}

await daemonLegs();
console.log(`\n${fail ? '✗' : '✓'} test-stream-mac-daemon: ${pass} passed, ${fail} failed`);
setTimeout(() => process.exit(fail ? 1 : 0), 50); import { verdictOf, gateOf } from './lib/check.mjs';
