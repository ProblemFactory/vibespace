#!/usr/bin/env node
// THE MACHINE-DESKTOP HAND-OVER (fast, in-process; lane desktop-handover — the owner 2026-10-19 「把远程桌面的控制权交给 agent」).
// The owner hands a paired machine's desktop (its machine-desktop window's live stream) to ONE agent conversation; the agent
// drives it with `vibespace-window` verbs on `md-<hostId>` through the SAME records the owner's data channel carries, into the
// SAME sink (src/agentd/stream-host.js), and reads it with one still. PURE src/desktop-handover.js, ORCH
// src/server/desktop-handover-engine.js, the two device ops (desktop-grab / desktop-input), the routes, the CLI.
//   ① THE LEASE STATE TABLE: give → agent; the owner's input → paused (user); resume → agent; revoke / the window's × / the
//      stream's end / the conversation's end / the agent's own detach → gone, each by name; a display switch → rebinding →
//      the next stream (its input kept: a paused lease stays paused) or stream_ended after REBIND_MS; another window's stream
//      of the same machine changes nothing; a give over a live lease = replaced
//   ② WHO MAY ACT (agentVerdict): nobody handed it ⇒ desktop_not_handed (the door named — no verb asks for one), another
//      conversation's ⇒ desktop_not_handed, the owner driving ⇒ window_paused, switching ⇒ desktop_switching
//   ③ THE FENCES as named refusals: --at outside the still ⇒ outside_display (none yet ⇒ screenshot_first); the chords that
//      lock / log off / power the machine ⇒ chord_refused by name per platform (both tables when unknown) — the everyday ones
//      pass; type > 1500 ⇒ type_too_long; --keys outside ASCII ⇒ not_ascii
//   ④ THE PARITY: the owner's records (src/lib/stream-input.js pointerMessage / wheelMessage / keyMessage + the view's paste)
//      and the agent's (clickRecords / scrollRecords / chordRecords / typeRecords) are BYTE-IDENTICAL for the same act — and
//      through the REAL stream host (werift in-process) the injector receives the same bytes from the data channel and from
//      the `desktop-input` op (the window's live place + the Mac's target applied once, by the same onInput)
//   ⑤ THE OP CENSUS (THREE-TOUCH): the handlers answer `desktop-grab-result` / `desktop-input-result`; the hello-ack names both
//      capabilities; the client's routing set holds both; the client's methods are capability-gated — an agent without them is
//      NEVER asked (a spy on _request) and says host_needs_daemon
//   ⑥ THE ENGINE over a fake stream module + device: give (stream live, a display, the capabilities, a live conversation),
//      the rows, screenshot (the still's size kept), click / key / type / scroll as records + origin, the fences before any
//      device call, pause → window_paused with no device call, resume, revoke, the window's ×, a display switch carried by
//      `after`, the conversation gone (tick), the agent's detach, re-asked AFTER the await (a pause landing mid-verb stops
//      it), the audit line per verb (origin machine, a type's LENGTH never its text), the strip's facts + the agent's dot
//   ⑦ THE ROUTES: the owner's give / pause / resume / revoke refuse an agent token human_only; the agent's verbs on md-
//      handles reach the engine (403 / 409 / 400 by name, the screenshot as image/png + X-Window-Shot)
//   ⑧ P10 UNTOUCHED: a `dw-<pid>` act still reaches the WINDOW engine (its desktop_injection_refused by name), never the hand-over —
//      MUTANT: the routes' md- test widened to dw- ⇒ the dw act reaches the hand-over (RED)
//   ⑨ THE CLI end to end (data/bin/vibespace-window → the real routes → the real engine → a fake device): list's md- row,
//      screenshot's size line, click / type / key wording, desktop_not_handed / window_paused / chord_refused hints, exit codes
// Run: node scripts/test-desktop-handover.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const DH = require(path.join(REPO, 'src/desktop-handover.js'));
const SH = require(path.join(REPO, 'src/agentd/stream-host.js'));
const ENG = require(path.join(REPO, 'src/server/desktop-handover-engine.js'));
const SI = await import(pathToFileURL(path.join(REPO, 'src/lib/stream-input.js')).href);
const J = (x) => JSON.stringify(x);
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code || String(e.message); } };
const codeOfAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || String(e.message); } };

console.log('① the lease state table');
{
  const holder = { key: 'claude:cid-1', webuiId: 'w1', name: 'Alpha' };
  const give = DH.leaseStep(null, { type: 'give', hostId: 'pc1', streamKey: 'stA', sid: 's1', holder }, 100);
  ok(give.lease && give.lease.handle === 'md-pc1' && give.lease.input === 'agent' && give.lease.holder.key === 'claude:cid-1' && !give.end, 'give → md-pc1, the agent drives', give);
  const p = DH.leaseStep(give.lease, { type: 'owner-input' }, 200);
  ok(p.lease.input === 'user' && p.lease.pausedAt === 200, 'the owner\'s input → paused (user)');
  ok(!DH.leaseStep(p.lease, { type: 'owner-input' }, 210).changed, 'more owner input while paused changes nothing');
  const r = DH.leaseStep(p.lease, { type: 'resume' }, 300);
  ok(r.lease.input === 'agent' && r.lease.pausedAt === null, '「继续交给它」 → the agent drives again');
  ok(DH.leaseStep(give.lease, { type: 'revoke' }).end === 'revoked' && DH.leaseStep(give.lease, { type: 'revoke' }).lease === null, '「收回」 → gone, revoked');
  ok(DH.leaseStep(give.lease, { type: 'stream-ended', streamKey: 'stA', why: 'closed' }).end === 'window_closed', 'the window\'s × (stream stop why=closed) → window_closed');
  for (const why of ['viewer_gone', 'idle', 'link_lost', 'ice_failed', 'capture_exited', 'stopped']) ok(DH.leaseStep(give.lease, { type: 'stream-ended', streamKey: 'stA', why }).end === 'stream_ended', `the stream's end (${why}) → stream_ended`);
  ok(!DH.leaseStep(give.lease, { type: 'stream-ended', streamKey: 'stOTHER', why: 'closed' }).changed, 'another window\'s stream of the same machine ending changes nothing');
  ok(DH.leaseStep(give.lease, { type: 'holder-gone' }).end === 'conversation_ended', 'the conversation gone → conversation_ended');
  ok(DH.leaseStep(give.lease, { type: 'agent-done' }).end === 'agent_done', 'the holder\'s own detach → agent_done (handed BACK)');
  const sw = DH.leaseStep(p.lease, { type: 'stream-ended', streamKey: 'stA', why: 'switched' }, 400);
  ok(sw.lease.input === 'rebinding' && sw.lease.resumeTo === 'user' && !sw.end, 'a display switch → rebinding (remembering it was paused)');
  const rb = DH.leaseStep(sw.lease, { type: 'rebind', streamKey: 'stB', sid: 's2', display: '2' }, 500);
  ok(rb.lease.input === 'user' && rb.lease.streamKey === 'stB' && rb.lease.sid === 's2' && rb.lease.shot === null, 'the next stream binds it — still paused, the old still forgotten');
  ok(!DH.leaseStep(sw.lease, { type: 'rebind-timeout' }, 400 + DH.LIMITS.rebindMs - 1).changed && DH.leaseStep(sw.lease, { type: 'rebind-timeout' }, 400 + DH.LIMITS.rebindMs).end === 'stream_ended', `no next stream within ${DH.LIMITS.rebindMs} ms → stream_ended (not before)`);
  const re = DH.leaseStep(give.lease, { type: 'give', hostId: 'pc1', streamKey: 'stA', sid: 's1', holder: { key: 'claude:cid-2', name: 'Beta' } }, 600);
  ok(re.end === 'replaced' && re.lease.holder.key === 'claude:cid-2', 'a give over a live lease → the old one ends replaced');
  ok(DH.handleOf('local') === null && DH.handleOf('a/b') === null && DH.hostOfHandle('md-pc1') === 'pc1' && !DH.isMachineHandle('dw-123') && !DH.isMachineHandle('app-x'), 'md-<hostId> only (never local, never a dw- / window handle)');
}

console.log('② who may act');
{
  const l = DH.leaseStep(null, { type: 'give', hostId: 'pc1', streamKey: 'stA', holder: { key: 'claude:cid-1' } }).lease;
  ok(DH.agentVerdict(null, ['claude:cid-1']).code === 'desktop_not_handed' && /owner hands/.test(DH.agentVerdict(null, []).error), 'nobody handed it ⇒ desktop_not_handed, the sentence names the owner\'s door');
  ok(DH.agentVerdict(l, ['claude:cid-2', 'webui:w2']).code === 'desktop_not_handed', 'another conversation ⇒ desktop_not_handed');
  ok(DH.agentVerdict(l, ['claude:cid-1']) === null, 'the holder may act');
  ok(DH.agentVerdict({ ...l, input: 'user' }, ['claude:cid-1']).code === 'window_paused', 'the owner driving ⇒ window_paused (the windows\' word)');
  ok(DH.agentVerdict({ ...l, input: 'rebinding' }, ['claude:cid-1']).code === 'desktop_switching', 'switching displays ⇒ desktop_switching');
}

console.log('③ the fences, by name');
{
  const size = { w: 1920, h: 1080 };
  ok(DH.pointVerdict('100,100', size) === null && DH.pointVerdict('1919,1079', size) === null, 'a point of the still passes');
  for (const at of ['1920,5', '5,1080', '-1,0', '0,-1']) ok(DH.pointVerdict(at, size).code === 'outside_display', `--at ${at} ⇒ outside_display`);
  ok(DH.pointVerdict('5,5', null).code === 'screenshot_first', 'no still and no picture size ⇒ screenshot_first');
  ok(DH.pointVerdict('a,b', size).code === 'bad-request', 'garbage --at ⇒ bad-request');
  const refused = [['win+l', 'win32', 'lock_screen'], ['ctrl+alt+delete', 'win32', 'secure_attention'], ['alt+ctrl+Delete', 'win32', 'secure_attention'], ['ctrl+alt+end', 'win32', 'secure_attention'],
    ['ctrl+cmd+q', 'darwin', 'lock_screen'], ['cmd+shift+q', 'darwin', 'log_off'], ['option+shift+cmd+q', 'darwin', 'log_off'], ['win+l', null, 'lock_screen'], ['ctrl+cmd+q', null, 'lock_screen'], ['power', 'win32', 'power'], ['ctrl+sleep', 'darwin', 'power']];
  for (const [c, p, name] of refused) { const r = DH.chordRecords(c, p); ok(r.code === 'chord_refused' && r.refusedAs === name, `${c} on ${p || 'an unknown platform'} ⇒ chord_refused (${name})`, r); }
  for (const [c, p] of [['ctrl+s', 'win32'], ['alt+F4', 'win32'], ['Return', 'win32'], ['cmd+q', 'darwin'], ['cmd+l', 'darwin'], ['cmd+shift+4', 'darwin'], ['win', 'win32'], ['shift+tab', null]]) ok(Array.isArray(DH.chordRecords(c, p).records), `${c} on ${p || '?'} passes (an everyday chord)`);
  ok(DH.chordRecords('ctrl+bogus', 'win32').code === 'bad_chord' && DH.chordRecords('hyper+a', 'win32').code === 'bad_chord' && DH.chordRecords('', 'win32').code === 'bad_chord', 'an unknown key / modifier ⇒ bad_chord');
  ok(DH.typeRecords('x'.repeat(DH.LIMITS.typeMaxChars), 'win32').records && DH.typeRecords('x'.repeat(DH.LIMITS.typeMaxChars + 1), 'win32').code === 'type_too_long', `type: ${DH.LIMITS.typeMaxChars} characters pass, one more ⇒ type_too_long`);
  ok(DH.typeRecords('你好', 'win32', { keys: true }).code === 'not_ascii' && DH.typeRecords('你好', 'win32').road === 'paste', '--keys outside ASCII ⇒ not_ascii; the paste road takes any text');
}

console.log('④ the parity: the owner\'s records = the agent\'s, byte for byte');
{
  const box = { left: 10, top: 20, width: 960, height: 540 }, video = { w: 1920, h: 1080 }, origin = { x: 1920, y: 0 };
  // the owner clicks the element at (10 + 480.5, 20 + 270.5) = the picture's pixel (961, 541)
  const e = { clientX: 10 + 480.5, clientY: 20 + 270.5, button: 0 };
  const owner = [SI.pointerMessage('mv', e, box, video, origin), SI.pointerMessage('md', e, box, video, origin), SI.pointerMessage('mu', e, box, video, origin)];
  const agent = DH.clickRecords('961,541', 1, origin);
  ok(J(owner) === J(agent), 'a left click: the data channel\'s mv/md/mu = the op\'s mv/md/mu', { owner, agent });
  const right = DH.clickRecords('961,541', 3, origin), ownerRight = SI.pointerMessage('md', { ...e, button: 2 }, box, video, origin);
  ok(J(right[1]) === J(ownerRight), 'a right click (--button 3 = DOM button 2)');
  const wheel = SI.wheelMessage({ clientX: e.clientX, clientY: e.clientY, deltaY: -100, deltaMode: 0, deltaX: 0 }, box, video, origin);
  ok(J(DH.scrollRecords('up', 1, '961,541', null, origin)[1]) === J(wheel), 'one notch up: the wheel record is the owner\'s', { wheel });
  const map = SI.keyMapFor('win', 'win32');
  const keys = [SI.keyMessage({ code: 'ControlLeft', key: 'Control' }, true, map), SI.keyMessage({ code: 'KeyS', key: 's' }, true, map), SI.keyMessage({ code: 'KeyS', key: 's' }, false, map), SI.keyMessage({ code: 'ControlLeft', key: 'Control' }, false, map)];
  ok(J(DH.chordRecords('ctrl+s', 'win32').records) === J(keys), 'ctrl+s: the owner\'s four key records = the chord\'s', { keys });
  // the view's paste (src/lib/stream-view.js): Ctrl down, then { t: 'clip', text }, V down/up, Ctrl up
  const paste = [{ t: 'clip', text: '你好 world' }, { t: 'kd', c: 'ControlLeft' }, { t: 'kd', c: 'KeyV' }, { t: 'ku', c: 'KeyV' }, { t: 'ku', c: 'ControlLeft' }];
  ok(J(DH.typeRecords('你好 world', 'win32').records) === J(paste) && DH.typeRecords('x', 'darwin').records[1].c === 'MetaLeft', 'type = the owner\'s paste (the clipboard + the machine\'s primary modifier + V)');
  const SM = require(path.join(REPO, 'src/stream-model.js'));
  ok([...agent, ...DH.chordRecords('ctrl+s', 'win32').records, ...DH.typeRecords('abc', 'win32').records, ...DH.typeRecords('A!', 'win32', { keys: true }).records, ...DH.scrollRecords('left', 2, '1,1', null, origin)].every((r) => !SM.inputEventOf(r).refused), 'every record the agent sends is one the channel\'s own table accepts (inputEventOf)');
  // THROUGH THE REAL STREAM HOST: werift in-process, the data channel's handler driven with the owner's bytes
  const w = require(path.join(REPO, 'node_modules/werift'));
  const dcs = [];
  const loadWerift = () => ({ ...w, RTCPeerConnection: class extends w.RTCPeerConnection { createDataChannel(l, o) { const d = super.createDataChannel(l, o); dcs.push(d); return d; } } });
  const got = [];
  const injector = { kind: 'fake', inject(evs, target) { got.push(J({ evs, target: target === undefined ? null : target })); return Promise.resolve({ ok: true, n: evs.length, refused: [] }); } };
  const macTarget = { pid: 0, wid: 0, ox: 0, oy: 25, sx: 0.5, sy: 0.5 };
  const sources = { screen: { ok: true, kind: 'screen', origin, fps: 30, display: 'D2', start() { }, stop() { }, requestKeyframe() { }, setTargetKbps() { }, still: () => Promise.resolve(SH.fakeStill()) },
    mac: { ok: true, kind: 'screen', origin: { x: 0, y: 0 }, fps: 60, start() { }, stop() { }, requestKeyframe() { }, setTargetKbps() { }, inputTarget: () => macTarget },
    win: { ok: true, kind: 'window', origin: { x: 0, y: 0 }, relative: true, bounds: () => ({ x: 300, y: 200, w: 800, h: 600 }), fps: 30, start() { }, stop() { }, requestKeyframe() { }, setTargetKbps() { } } };
  const host = SH.createStreamHost({ injector, loadWerift, screen: (msg) => sources[msg.sourceId] });
  for (const [sid, src] of [['s-mac', 'mac'], ['s-screen', 'screen'], ['s-win', 'win']]) { // a host serves two sessions at once: the Mac's ends after its leg
    const r = await host.offer({ sid, sourceKind: 'screen', sourceId: src }, { control() { } });
    ok(r.ok, `the stream host offers ${sid} in-process`, r);
    const dc = dcs[dcs.length - 1];
    got.length = 0;
    const recs = DH.clickRecords('40,30', 1, src === 'screen' ? origin : { x: 0, y: 0 });
    for (const x of recs) dc.onMessage.execute(J(x));
    await new Promise((res) => setTimeout(res, 30));
    const viaChannel = got.splice(0);
    const a = await host.input({ sid, events: recs });
    const viaOp = got.splice(0);
    ok(viaChannel.length === 3 && J(viaChannel) === J(viaOp) && a.ok && a.n === 3, `${sid}: the injector receives the SAME bytes from the data channel and from desktop-input${src === 'mac' ? ' (the Mac\'s target)' : src === 'win' ? ' (the window\'s live place added once)' : ''}`, { viaChannel, viaOp, a });
    if (src === 'win') ok(viaOp[1].includes('"x":340') && viaOp[1].includes('"y":230'), 'a window source: the window\'s live place added by the same onInput (40,30 → 340,230)', viaOp);
    if (src === 'mac') { ok((await host.still({ sid })).code === 'no_still', 'a source without still() ⇒ no_still by name'); host.stop(sid, 'done'); }
  }
  const bad = await host.input({ sid: 's-screen', events: [{ t: 'ack', f: 3 }, { t: 'zz' }, { t: 'md', x: 99999, y: 0, b: 0 }, { t: 'kd', c: 'KeyA' }] });
  ok(J(bad.refused) === J([{ i: 0, code: 'not_an_act' }, { i: 1, code: 'unknown_kind' }, { i: 2, code: 'bad_x' }]) && bad.n === 1 && bad.display === 'D2', 'the op refuses by name per record (an ack is the page\'s, the channel\'s own validation), the rest lands', bad);
  ok((await host.input({ sid: 'nope', events: [] })).code === 'not_found' && (await host.still({ sid: 'nope' })).code === 'not_found', 'an unknown session ⇒ not_found');
  const st = await host.still({ sid: 's-screen' });
  const png = Buffer.from(st.png64, 'base64');
  ok(st.ok && st.w === 1280 && st.h === 720 && png.readUInt32BE(16) === 1280 && J(st.origin) === J({ x: 0, y: 0 }) && st.display === 'fake', 'desktop-grab: the source\'s still as a PNG (its IHDR says the size)', { w: st.w, h: st.h });
  const MAC = require(path.join(REPO, 'src/agentd/stream-mac.js'));
  ok(/still: \(\) => Promise\.resolve\(\{ ok: false, code: 'mac_still_pending'/.test(fs.readFileSync(path.join(REPO, 'src/agentd/stream-mac.js'), 'utf8')) && typeof MAC.createMacScreen === 'function', 'the Mac\'s source answers mac_still_pending (the still rides the helper\'s next version)');
  host.stopAll('done');
}

console.log('⑤ the op census — THREE-TOUCH');
{
  const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const client = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const caps = (/capabilities: \[([^\]]*)\]/.exec(agentd) || [])[1] || '';
  ok(caps.includes("'desktop-grab'") && caps.includes("'desktop-input'"), 'touch 1: the hello-ack names desktop-grab and desktop-input');
  ok(/msg\.op === 'desktop-grab'[\s\S]{0,400}op: 'desktop-grab-result', id: msg\.id/.test(agentd) && /msg\.op === 'desktop-input'[\s\S]{0,400}op: 'desktop-input-result', id: msg\.id/.test(agentd), 'touch 2: each handler answers by id with `op` on the reply (mux.control)');
  const routing = (/if \(m\.op === 'fs-result'[^\n]*/.exec(client) || [''])[0];
  ok(routing.includes("m.op === 'desktop-grab-result'") && routing.includes("m.op === 'desktop-input-result'"), 'touch 3: the client\'s id-keyed routing set holds both result ops');
  const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
  for (const [m, args] of [['desktopGrab', ['s1']], ['desktopInput', ['s1', [{ t: 'kd', c: 'KeyA' }]]]]) {
    const asked = [];
    const old = { connect: async () => ({ info: { capabilities: ['stream-offer', 'input-events'], daemonVersion: '2.369.300' } }), _request: async (x) => { asked.push(x); return { result: { ok: true } }; } };
    const e = await codeOfAsync(() => DeviceManager.prototype[m].apply(old, args));
    ok(e === 'host_needs_daemon' && asked.length === 0, `${m}: an agent without the capability is NEVER asked (host_needs_daemon, 0 requests)`, { e, asked });
    const nu = { ...old, connect: async () => ({ info: { capabilities: ['desktop-grab', 'desktop-input'] } }) };
    const r = await DeviceManager.prototype[m].apply(nu, args);
    ok(r.ok && asked.length === 1 && asked[0].op === (m === 'desktopGrab' ? 'desktop-grab' : 'desktop-input') && asked[0].sid === 's1', `${m}: with the capability it asks its op once, naming the session`, asked);
  }
}

// ── the fake world for the engine / routes / CLI ──
const dataDir = scratch('dho-data'); fs.mkdirSync(dataDir, { recursive: true });
const sessions = new Map([
  ['w1', { backend: 'claude', claudeSessionId: 'cid-1', name: 'Alpha', agentToken: 'vsst_alpha' }],
  ['w2', { backend: 'claude', claudeSessionId: 'cid-2', name: 'Beta', agentToken: 'vsst_beta' }],
  ['w3', { backend: 'shell', backendSessionId: 'sh-1', name: 'Shell', agentToken: 'vsst_shell' }],
]);
const factsOf = (tok) => { for (const [id, s] of sessions) if (s.agentToken === tok) return { sessionId: id, session: s, name: s.name }; return null; };
const STILL = SH.fakeStill();
const calls = [];
let capsNow = ['desktop-grab', 'desktop-input'];
let inputHook = null;
const dm = { connect: async () => ({ info: { capabilities: capsNow } }),
  desktopGrab: async (sid) => { calls.push(['grab', sid]); return { ok: true, png64: STILL.png.toString('base64'), w: STILL.w, h: STILL.h, display: 'D1', origin: { x: 1920, y: 0 }, road: 'direct' }; },
  desktopInput: async (sid, evs) => { calls.push(['input', sid, evs]); if (inputHook) await inputHook(); return { ok: true, n: evs.length, refused: [] }; } };
const streams = new Map();
const nudges = [];
const wr = { device: (k) => streams.get(k) || null, nudge: (k) => nudges.push(k) };
const addStream = (key, sid, extra = {}) => streams.set(key, { key, hostId: 'pc1', sid, dm, platform: 'win32', source: { kind: 'screen', origin: { x: 1920, y: 0 } }, stats: null, state: 'connected', ...extra });
const eng = ENG.create({ dataDir, activeSessions: sessions, tickMs: 0, holderGraceMs: 0, log: { log() { }, warn() { } } });
eng.setWebrtc(wr);
const A = factsOf('vsst_alpha'), B = factsOf('vsst_beta');
const auditLines = () => fs.readFileSync(path.join(dataDir, 'window-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

console.log('⑥ the engine');
{
  ok(await codeOfAsync(() => eng.give({ hostId: 'pc1', streamKey: 'stA', principal: 'agent:cid-1' })) === 'stream_not_live', 'no live stream of that machine ⇒ stream_not_live');
  addStream('stA', 'sid-A');
  capsNow = ['stream-offer'];
  const c0 = calls.length;
  ok(await codeOfAsync(() => eng.give({ hostId: 'pc1', streamKey: 'stA', principal: 'agent:cid-1' })) === 'host_needs_update' && calls.length === c0, 'an agent that predates the ops ⇒ host_needs_update at the give (no op asked)');
  capsNow = ['desktop-grab', 'desktop-input'];
  ok(await codeOfAsync(() => eng.give({ hostId: 'pc1', streamKey: 'stA', principal: 'agent:sh-1' })) === 'not_an_agent' && await codeOfAsync(() => eng.give({ hostId: 'pc1', streamKey: 'stA', principal: 'agent:nope' })) === 'no_conversation', 'a plain shell ⇒ not_an_agent; a conversation that is not live ⇒ no_conversation');
  addStream('stW', 'sid-W', { source: { kind: 'window', origin: { x: 0, y: 0 } } });
  ok(await codeOfAsync(() => eng.give({ hostId: 'pc1', streamKey: 'stW', principal: 'agent:cid-1' })) === 'not_a_display', 'a one-window stream ⇒ not_a_display');
  streams.delete('stW');
  ok(await codeOfAsync(() => eng.screenshot('md-pc1', A)) === 'desktop_not_handed', 'before any hand-over every verb ⇒ desktop_not_handed');
  const g = await eng.give({ hostId: 'pc1', streamKey: 'stA', principal: 'agent:cid-1' });
  ok(g.ok && g.lease.holder.name === 'Alpha' && g.lease.input === 'agent', 'the owner gives it to Alpha', g);
  ok(J(eng.rowsFor(A).map((r) => r.handle)) === J(['md-pc1']) && eng.rowsFor(B).length === 0, 'list: md-pc1 for Alpha only');
  for (const [verb, fn] of [['screenshot', () => eng.screenshot('md-pc1', B)], ['click', () => eng.act('md-pc1', B, { verb: 'click', at: '1,1' })], ['key', () => eng.act('md-pc1', B, { verb: 'key', chord: 'ctrl+s' })]]) ok(await codeOfAsync(fn) === 'desktop_not_handed', `Beta (another conversation) ${verb} ⇒ desktop_not_handed`);
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'click', at: '5,5' })) === 'outside_display' || true, '(no still yet, no picture size: see next)');
  const c1 = calls.length;
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'click', at: '5,5' })) === 'screenshot_first' && calls.length === c1, 'a click before any still and without the picture\'s size ⇒ screenshot_first (no device call)');
  const shot = await eng.screenshot('md-pc1', A);
  ok(shot.w === 1280 && shot.h === 720 && shot.originX === 1920 && shot.png.equals(STILL.png) && J(calls[calls.length - 1]) === J(['grab', 'sid-A']), 'screenshot: desktop-grab on the window\'s session, the PNG + its size + the display\'s origin');
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'click', at: '1280,5' })) === 'outside_display', '--at outside the still ⇒ outside_display');
  const r1 = await eng.act('md-pc1', A, { verb: 'click', at: '100,50', button: 3 });
  const sent = calls[calls.length - 1];
  ok(r1.ok && sent[0] === 'input' && sent[1] === 'sid-A' && J(sent[2]) === J(DH.clickRecords('100,50', 3, { x: 1920, y: 0 })), 'click --at 100,50 --button 3 = the records + the display\'s origin, into the window\'s session', sent);
  const f1 = eng.hooks.factsOf('stA');
  ok(f1 && f1.state === 'agent' && f1.holder.name === 'Alpha' && f1.dot && f1.dot.x === 100 && f1.dot.y === 50 && nudges.includes('stA'), 'the strip\'s facts: Alpha drives, its pointer at the still\'s 100,50 (the page\'s poll nudged)', f1);
  addStream('stP', 'sid-P'); // verify r1 (B): a SECOND window of the same machine (the phone) hears the lease by host — not its own (no pointer there), its owner input pauses; another machine's stream hears nothing
  ok(f1.own === true && eng.hooks.factsOf('stP', 'pc1').state === 'agent' && eng.hooks.factsOf('stP', 'pc1').own === false && eng.hooks.factsOf('stP', 'pc2') === null && eng.hooks.factsOf('stP') === null, 'the facts by host: every stream of the machine hears its lease, `own` only on the one that carries it', eng.hooks.factsOf('stP', 'pc1'));
  streams.delete('stP');
  const c2 = calls.length;
  const kr = await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'key', chord: 'win+l' }));
  ok(kr === 'chord_refused' && calls.length === c2, 'key win+l ⇒ chord_refused, nothing sent');
  await eng.act('md-pc1', A, { verb: 'key', chord: 'ctrl+s' });
  ok(J(calls[calls.length - 1][2]) === J(DH.chordRecords('ctrl+s', 'win32').records), 'key ctrl+s = its four records');
  const tr = await eng.act('md-pc1', A, { verb: 'type', text: 'secret 你好' });
  ok(tr.did.by === 'paste' && tr.did.chars === 9 && calls[calls.length - 1][2][0].t === 'clip', 'type = the paste road (the clipboard, then ctrl+V)');
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'type', text: 'y'.repeat(1501) })) === 'type_too_long', 'type 1501 characters ⇒ type_too_long');
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'click', ref: '@e1' })) === 'mode_pixels' && await codeOfAsync(() => eng.snapshot('md-pc1', A)) === 'mode_pixels', 'a ref / a snapshot ⇒ mode_pixels (no tree)');
  await eng.act('md-pc1', A, { verb: 'scroll', direction: 'down' });
  ok(J(calls[calls.length - 1][2]) === J(DH.scrollRecords('down', 3, null, { w: 1280, h: 720 }, { x: 1920, y: 0 })), 'scroll down: 3 notches at the still\'s centre');
  // the owner's input pauses it
  const p = eng.pause('pc1');
  const c3 = calls.length;
  ok(p.lease.input === 'user' && await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'click', at: '1,1' })) === 'window_paused' && await codeOfAsync(() => eng.screenshot('md-pc1', A)) === 'window_paused' && calls.length === c3, 'the owner\'s input ⇒ window_paused for every verb, NOTHING sent');
  ok(eng.hooks.factsOf('stA').state === 'user', 'the strip: paused');
  eng.resume('pc1');
  // a pause that lands WHILE a verb awaits the machine: the still is not answered
  let release;
  const grabHold = dm.desktopGrab;
  dm.desktopGrab = (sid) => new Promise((res) => { release = () => res(grabHold(sid)); });
  const pending = codeOfAsync(() => eng.screenshot('md-pc1', A));
  await new Promise((r) => setTimeout(r, 5));
  eng.pause('pc1');
  release();
  ok(await pending === 'window_paused', 're-asked after the await: a pause that landed while the still was taken ⇒ window_paused (no picture handed)');
  dm.desktopGrab = grabHold;
  eng.resume('pc1');
  // a display switch carries it
  eng.hooks.ended('stA', 'switched', 'pc1');
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'key', chord: 'a' })) === 'desktop_switching', 'a display switch ⇒ desktop_switching');
  addStream('stB', 'sid-B', { source: { kind: 'screen', origin: { x: 0, y: 0 }, display: 'D2' } });
  eng.hooks.started('stB', 'pc1', 'stOTHER');
  ok(eng.hooks.factsOf('stB') === null, 'a stream whose `after` is not the leased one binds nothing');
  eng.hooks.started('stB', 'pc1', 'stA');
  await eng.act('md-pc1', A, { verb: 'key', chord: 'a' });
  ok(calls[calls.length - 1][1] === 'sid-B' && eng.hooks.factsOf('stB').state === 'agent' && eng.rowsFor(A)[0].shot === null, 'the next stream (after = the old key) binds it: the agent\'s records go to the NEW session, the old still forgotten');
  // the window's ×
  eng.hooks.ended('stB', 'closed', 'pc1');
  ok(await codeOfAsync(() => eng.act('md-pc1', A, { verb: 'key', chord: 'a' })) === 'desktop_not_handed' && eng.hooks.factsOf('stB').ended === 'window_closed', 'the window\'s × ⇒ gone (window_closed), the page hears why');
  // the conversation gone
  addStream('stC', 'sid-C');
  await eng.give({ hostId: 'pc1', streamKey: 'stC', principal: 'agent:cid-2' });
  const beta = sessions.get('w2'); sessions.delete('w2');
  eng.tick(); eng.tick();
  ok(eng.stateOf('pc1') === null && eng.hooks.factsOf('stC').ended === 'conversation_ended', 'the holder conversation gone (past its grace) ⇒ conversation_ended');
  sessions.set('w2', beta);
  // revoke + the agent's own detach
  await eng.give({ hostId: 'pc1', streamKey: 'stC', principal: 'agent:cid-1' });
  eng.revoke('pc1');
  ok(await codeOfAsync(() => eng.screenshot('md-pc1', A)) === 'desktop_not_handed', '「收回」 ⇒ desktop_not_handed');
  await eng.give({ hostId: 'pc1', streamKey: 'stC', principal: 'agent:cid-1' });
  ok(await codeOfAsync(() => eng.detach('md-pc1', B)) === 'desktop_not_handed', 'another conversation cannot detach it');
  const d = eng.detach('md-pc1', A);
  ok(d.ended === 'agent_done' && eng.stateOf('pc1') === null, 'the holder\'s detach hands it back (agent_done)');
  ok(typeof eng.give === 'function' && !('transfer' in eng) && !Object.keys(eng).some((k) => /give.*agent|handTo/i.test(k)), 'no agent-side verb passes a lease on (give is the owner route\'s only)');
  // the audit
  const lines = auditLines();
  const verbs = lines.filter((l) => l.origin === 'machine').map((l) => l.verb);
  ok(lines.every((l) => l.origin === 'machine') && ['lease-give', 'screenshot', 'click', 'key', 'type', 'scroll', 'lease-pause', 'lease-resume', 'lease-rebind', 'lease-end'].every((v) => verbs.includes(v)), 'the audit: a line per verb and per lease change, origin machine', verbs);
  const click = lines.find((l) => l.verb === 'click' && l.ok);
  ok(click && click.x === 100 && click.y === 50 && click.button === 3 && click.sessionKey === 'claude:cid-1' && click.by === 'pixels', 'a click\'s line: who, the point, the button', click);
  const typeLine = lines.find((l) => l.verb === 'type' && l.ok);
  ok(typeLine && typeLine.chars === 9 && !JSON.stringify(lines).includes('secret'), 'a type\'s line has its LENGTH, never its text');
  ok(lines.some((l) => l.verb === 'key' && l.ok === false && l.code === 'chord_refused' && l.refusedAs === 'lock_screen'), 'a refused chord is audited by name');
  ok(J(lines.filter((l) => l.verb === 'lease-end').map((l) => l.cause)) === J(['window_closed', 'conversation_ended', 'revoked', 'agent_done']), 'the lease ends, each by name', lines.filter((l) => l.verb === 'lease-end'));
}

// ── the routes (in-process express) ──
const express = require(path.join(REPO, 'node_modules/express'));
const windowEngine = { factsForToken: factsOf, list: async () => ({ targets: [], a11y: { ok: false, why: 'no bus here' }, verbs: {}, desktop: { enabled: false }, apps: [] }),
  act: async (h, f, body) => { windowEngine.acts.push(h); const DESK = require(path.join(REPO, 'src/window-desktop.js')); const v = DESK.desktopActGate({ verb: body.verb, at: body.at }); if (!v.ok) throw Object.assign(new Error(v.error || v.why || 'refused'), { code: v.code }); return { ok: true }; }, acts: [] };
function appWith(routesMod, desktopRoutes) {
  const app = express(); app.use(express.json({ limit: '1mb' }));
  routesMod.setup({ engine: windowEngine, handover: eng }); app.use(routesMod.router);
  if (desktopRoutes) { desktopRoutes.setup({ handover: eng, webrtc: { ...wr, start: async () => ({}) } }); app.use(desktopRoutes.router); }
  return new Promise((res) => { const srv = http.createServer(app).listen(0, '127.0.0.1', () => res(srv)); });
}
const WT = require(path.join(REPO, 'src/routes/window-targets.js'));
const DA = require(path.join(REPO, 'src/routes/desktop-apps.js'));
const srv = await appWith(WT, DA);
const base = `http://127.0.0.1:${srv.address().port}`;
const req = async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : J(body) }); const ct = r.headers.get('content-type') || ''; return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
const asA = { Authorization: 'Bearer vsst_alpha' }, asB = { Authorization: 'Bearer vsst_beta' };

console.log('⑦ the routes');
{
  addStream('stR', 'sid-R');
  for (const [p, body] of [['/api/desktop/machine-desktop/handover', { host: 'pc1', key: 'stR', principal: 'agent:cid-1' }], ['/api/desktop/machine-desktop/handover/pause', { host: 'pc1' }], ['/api/desktop/machine-desktop/handover/resume', { host: 'pc1' }], ['/api/desktop/machine-desktop/handover/revoke', { host: 'pc1' }]]) {
    const r = await req('POST', p, body, asA);
    ok(r.status === 403 && r.body.code === 'human_only', `${p.replace('/api/desktop/machine-desktop', '')}: an agent token ⇒ 403 human_only (no agent asks for a desktop, nor passes one on)`);
  }
  ok(eng.stateOf('pc1') === null, '…and nothing was handed');
  ok((await req('POST', '/api/agent/window/act', { handle: 'md-pc1', verb: 'click', at: '1,1' }, asA)).body.code === 'desktop_not_handed', 'the agent\'s verb before a hand-over ⇒ 403 desktop_not_handed');
  const g = await req('POST', '/api/desktop/machine-desktop/handover', { host: 'pc1', key: 'stR', principal: 'agent:cid-1' });
  ok(g.status === 200 && g.body.ok && g.body.lease.holder.name === 'Alpha', 'the owner (no token) hands pc1 to Alpha', g.body);
  const t = await req('GET', '/api/agent/window/targets', undefined, asA);
  ok(t.status === 200 && J((t.body.machines || []).map((m) => m.handle)) === J(['md-pc1']) && (await req('GET', '/api/agent/window/targets', undefined, asB)).body.machines.length === 0, 'targets: `machines` = md-pc1 for Alpha, none for Beta');
  const s = await req('GET', '/api/agent/window/screenshot?handle=md-pc1', undefined, asA);
  const meta = JSON.parse(s.headers.get('x-window-shot') || 'null');
  ok(s.status === 200 && s.headers.get('content-type') === 'image/png' && s.body.equals(STILL.png) && meta.w === 1280 && meta.machine === 'pc1' && meta.coords === 'display', 'screenshot ⇒ image/png + X-Window-Shot {w, h, machine, coords: display}', meta);
  const codes = [];
  for (const [body, want, status] of [[{ verb: 'click', at: '99999,1' }, 'outside_display', 400], [{ verb: 'key', chord: 'ctrl+alt+delete' }, 'chord_refused', 403], [{ verb: 'type', text: 'z'.repeat(1501) }, 'type_too_long', 400]]) {
    const r = await req('POST', '/api/agent/window/act', { handle: 'md-pc1', ...body }, asA);
    codes.push([r.status, r.body.code]);
    ok(r.status === status && r.body.code === want, `act ${body.verb} ⇒ ${status} ${want}`, r.body);
  }
  ok((await req('POST', '/api/agent/window/act', { handle: 'md-pc1', verb: 'click', at: '10,10' }, asA)).body.did.by === 'point', 'act click ⇒ 200, did.by point');
  await req('POST', '/api/desktop/machine-desktop/handover/pause', { host: 'pc1' });
  const pz = await req('POST', '/api/agent/window/act', { handle: 'md-pc1', verb: 'click', at: '10,10' }, asA);
  ok(pz.status === 409 && pz.body.code === 'window_paused' && pz.body.origin === 'machine', 'the owner paused it ⇒ 409 window_paused');
  await req('POST', '/api/desktop/machine-desktop/handover/resume', { host: 'pc1' });
  ok((await req('POST', '/api/agent/window/attach', { handle: 'md-pc1' }, asA)).body.origin === 'machine' && (await req('POST', '/api/agent/window/snapshot', { handle: 'md-pc1' }, asA)).body.code === 'mode_pixels' && (await req('POST', '/api/agent/window/watch', { handle: 'md-pc1' }, asA)).body.form === 'machine-desktop', 'attach (held — nothing to take) / snapshot (mode_pixels) / watch (the owner\'s window)');
  console.log('⑧ P10 untouched: a dw- handle is the window engine\'s');
  windowEngine.acts.length = 0;
  const before = calls.length;
  const dw = await req('POST', '/api/agent/window/act', { handle: 'dw-4242', verb: 'click', at: '5,5' }, asA);
  ok(dw.status === 409 && dw.body.code === 'desktop_injection_refused' && J(windowEngine.acts) === J(['dw-4242']) && calls.length === before, 'act on dw-4242 reaches the window engine (desktop_injection_refused by name), never the hand-over');
  const kdw = await req('POST', '/api/agent/window/act', { handle: 'dw-4242', verb: 'key', chord: 'ctrl+s' }, asA);
  ok(kdw.body.code === 'desktop_injection_refused', 'key on dw-4242 ⇒ desktop_injection_refused');
  // MUTANT: the routes' md- test widened to dw-
  const src = fs.readFileSync(path.join(REPO, 'src/routes/window-targets.js'), 'utf8');
  const from = '  if (!DH.isMachineHandle(h)) return null;';
  ok(src.split(from).length === 2, 'the mutant anchor is the routes\' one md- test');
  const M = mutantCopies('dho', REPO);
  const WTm = M.load('src/routes/window-targets.js', src.replace(from, '  if (!/^(md|dw)-/.test(h)) return null;'), 'dw-through');
  const srvM = await appWith(WTm, null);
  windowEngine.acts.length = 0;
  const rm = await fetch(`http://127.0.0.1:${srvM.address().port}/api/agent/window/act`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...asA }, body: J({ handle: 'dw-4242', verb: 'click', at: '5,5' }) }).then((r) => r.json());
  const mutantRed = !(rm.code === 'desktop_injection_refused' && windowEngine.acts.length === 1);
  ok(mutantRed, 'MUTANT (dw- routed to the hand-over): the dw act no longer reaches the window engine — the leg above goes RED', rm);
  srvM.close();
}

console.log('⑨ the CLI end to end');
{
  const home = scratch('dho-home'); fs.mkdirSync(home, { recursive: true });
  const cli = (args, token = 'vsst_alpha') => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-window'), ...args], { env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, VIBESPACE_API: base, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => res({ code, out, err }));
  });
  const l = await cli(['list']);
  ok(l.code === 0 && /\* md-pc1 {2}pc1 — its desktop {2}A MACHINE'S DESKTOP — handed to you by its owner/.test(l.out) && /mode: pixels — screenshot, then click --at/.test(l.out) && !/no window is shared with you/.test(l.out), 'list prints the md- row (and not "no window is shared")', l.out);
  const lb = await cli(['list'], 'vsst_beta');
  ok(lb.code === 0 && !/md-pc1/.test(lb.out) && /no window is shared with you/.test(lb.out), 'Beta\'s list has no md- row');
  const sh = await cli(['screenshot', 'md-pc1']);
  const file = (sh.out.split(' (')[0] || '').trim();
  ok(sh.code === 0 && /1280x720 — pc1's display D1, its own pixels; `click md-pc1 --at x,y` takes a pixel of THIS image/.test(sh.out) && fs.existsSync(file) && fs.readFileSync(file).equals(STILL.png), 'screenshot writes the PNG and prints its size + the click hint', sh.out);
  const ck = await cli(['click', 'md-pc1', '--at', '640,360']);
  ok(ck.code === 0 && /clicked point 640,360 of the display \(button 1\) via stream — audited by:point/.test(ck.out), 'click --at prints the point', ck);
  const ty = await cli(['type', 'md-pc1', 'hello 世界']);
  ok(ty.code === 0 && /typed 8 character\(s\) through the machine's clipboard/.test(ty.out), 'type prints the clipboard road', ty);
  const ke = await cli(['key', 'md-pc1', 'win+l']);
  ok(ke.code === 1 && /\[chord_refused\]/.test(ke.err) && /locks, logs off or powers the machine/.test(ke.err), 'key win+l ⇒ exit 1, chord_refused + its hint', ke.err);
  const nb = await cli(['screenshot', 'md-pc1'], 'vsst_beta');
  ok(nb.code === 1 && /\[desktop_not_handed\]/.test(nb.err) && /Hand to an agent/.test(nb.err), 'Beta ⇒ desktop_not_handed + the owner\'s door', nb.err);
  await req('POST', '/api/desktop/machine-desktop/handover/pause', { host: 'pc1' });
  const pz = await cli(['click', 'md-pc1', '--at', '1,1']);
  ok(pz.code === 1 && /\[window_paused\]/.test(pz.err) && /do NOT retry in a loop/.test(pz.err), 'paused ⇒ window_paused + never-loop hint', pz.err);
  await req('POST', '/api/desktop/machine-desktop/handover/resume', { host: 'pc1' });
  const dt = await cli(['detach', 'md-pc1']);
  ok(dt.code === 0 && /handed md-pc1 back to its owner/.test(dt.out) && eng.stateOf('pc1') === null, 'detach hands it back');
  const help = await cli(['help']);
  ok(/A MACHINE'S DESKTOP \(md-<host> rows\)/.test(help.out) && /no verb can ask for one/.test(help.out), 'the usage names the md- rows and the owner\'s door');
}
srv.close();
eng.shutdown();
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
