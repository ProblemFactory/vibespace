#!/usr/bin/env node
// THE WEBRTC STREAM RUNG — fast, in-process (design q-041 r2 §2/§3 P1 + P1b, lane stream-p1a-transport). The PURE verdicts and
// the hub's half over a fake agent; the real daemon is test-stream-op, the page in Chrome is test-desktop-webrtc-chrome.
//   §1 the `webrtc` row of DISPLAY_BACKENDS: a `remote` row (off the local ladder), its needs = the AGENT's capability
//      (`agent:stream-offer`, never a binary probe), its recipe refuses a local bring-up by name
//   §2 streamRungVerdict: taken with a source (screen > fake), every "no" named — CONTROL: a table copy whose row needs
//      another capability refuses (the verdict reads the row)
//   §3 THE SIGNALING STATE MACHINE (streamStep): start → offer → answer → connecting → playing; refusals, the ICE-restart
//      budget (consecutive), ended / close, terminal states; every declared event is taken somewhere
//   §4 fallbackVerdict · §5 videoToSource (letterbox, origin, clamp) · §6 the input table (inputEventOf, wheelUnitsOf)
//   §4b NEVER SILENT (lane stream-fallback-never-silent): endingVerdict — a played stream's ending is never the VNC picture by itself
//   §7 the page's door (src/lib/stream-input.js): a Mac viewer's ⌘ is the machine's Ctrl (THE table, side kept), other keys
//      stay physical — CONTROL: an identity row keeps Meta (the door asks the map it is handed)
//   §8 statsOf over a getStats report pair · §9 the relay framing + candidates
//   §10 the packetizer over THE fixture (scripts/fixtures/stream/fake-desk-720p.h264): access units, key frames, FU-A sizes,
//       markers, a receiver's reassembly byte-identical
//   §11 THE injector (src/input-inject.js): scan codes, commands, the Linux stub's record; the RESIDENT script's protocol over
//       a fake PowerShell child (ready → ok / uipi / silence ⇒ uipi_blocked / injector_timeout by name)
//   §12 the hub's half (src/server/desktop-webrtc.js) over a fake agent + the REAL access layer's rung: refusals pass
//       through, the offer carries the relay's candidates, relay-only strips host candidates both ways, a datagram crosses
//       the relay framed (and only back to a peer that wrote first), the long poll wakes on a push, ended / stop / facts
//   §13 the three touches by source: handlers reply with `op`, the capabilities, the routing set, the push branch BEFORE
//       prevControl, the re-arm on reconnect
//   §14 THE UDP LEG (lane stream-relay-udp): the codec (PING / PONG under the session's HMAC, DATA, the 'VSR1' magic never a
//       STUN / DTLS / RTP first byte); the hub's half over a stand-in daemon socket — a forged PING and a replayed counter
//       dropped and counted, an authenticated one answered (PONG) and its address learned, the browser's datagrams go to it as
//       DATA once it says UP, its DATA reach only a browser that wrote first, a stray address is dropped, device-link frames
//       reach the browser and never turn the hub from its leg (lane stream-leg-flap), a muted hub never answers; the daemon's
//       half on an injected clock — UP at the first PONG, a PING every 15 s idle / 2 s while it carries the picture, a PING
//       unanswered 2 s = a miss (re-asked at once, a late PONG still counts), DOWN at three in a row, back UP on a PONG;
//       the firewall line (only a plain .exe path, no shell character), the direct-inbound verdict, the self-probe on this box
//   §14b THE PATH ELECTION (lane stream-leg-flap — the owner's Mac desktop went black 2026-10-20, the hub's journal: «relay via
//       the device link (the daemon spoke on the device link)» ⇄ «… udp leg (leg up)» three times in 20 s, both displays): a
//       FLAPPING fake daemon over real loopback UDP + a stand-in device link, the hub on an injected clock — the leg carries the
//       picture while the device link speaks too and the daemon says it heard no answer ⇒ ONE election, every browser datagram
//       on the leg; the leg dies ⇒ the device link after legDeadMs (6 s), one change; it returns ⇒ taken once; every datagram
//       of the daemon reaches the browser either way — RED CONTROL: the .330 rule (the path the daemon LAST spoke on) through
//       the same hub flips ≥ 3 times in the same 20 s; legElect's own table (PURE)
//   §14c THE DAEMON'S HYSTERESIS (lane stream-leg-flap): a lossy leg (every third PONG lost, a socket error) stays UP for a
//       minute while it carries the picture — RED CONTROL: one miss = DOWN (the .330 daemon: missMax 1) goes DOWN ≥ 3 times
//   §14d THE STALL (lane stream-leg-flap): stallStep — a playing picture that decodes nothing for stallMs while the machine
//       sends ⇒ stalled; a still screen (the machine sends nothing), a hidden page, a picture still decoding ⇒ never
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { scratch, deadPort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
const B = require(path.join(REPO, 'src/desktop-backends.js'));
const D = require(path.join(REPO, 'src/desktop-display.js'));
const I = require(path.join(REPO, 'src/input-inject.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');

console.log('§1 the webrtc row');
{
  const row = B.backendById('webrtc');
  ok(row && row.stream === 'webrtc' && row.remote === 'agent-webrtc' && row.wired === true && row.perWindow === false && row.ownsDisplay === false, 'the row: stream webrtc, remote agent-webrtc, wired, whole screen (perWindow false), the machine\'s own desktop (ownsDisplay false)', row);
  ok(same(row.needs, [['agent:stream-offer']]) && row.recipes['agent:stream-offer'] === 'agent-stream' && row.fit['agent:stream-offer'] === 'shared', 'its needs = the agent\'s capability as a pseudo-binary fact; its recipe and fit name that group');
  ok(B.BACKEND_IDS.includes('webrtc') && !B.LADDER_IDS.includes('webrtc'), 'in the table, off the local ladder (a `remote` row)');
  const every = Object.fromEntries(['xpra', 'Xvnc', 'Xvfb', 'x11vnc', 'Xtigervnc', 'xfreerdp', 'agent:stream-offer'].map((b) => [b, '/x/' + b]));
  ok(B.resolveBackend({ bins: every }, { backendPrefs: ['webrtc'] }).backend !== 'webrtc' && same(B.parseBackendPrefs('webrtc, xpra'), ['xpra']), 'a local launch never lands on it, not even when a preference names it');
  ok(!D.PROBE_BINS.includes('agent:stream-offer') && !D.PROBE_BINS.includes('stream-offer'), 'the hub never probes PATH for it (a name with a colon is a fact, not a file)');
  const e = await D.RECIPES['agent-stream']({}).then(() => null, (x) => x);
  ok(e && e.code === 'agent-stream' && /agent/.test(e.message), 'its recipe refuses a local bring-up by name (the agent brings the stream up)');
}

console.log('§2 streamRungVerdict');
{
  const v = (o) => SM.streamRungVerdict(o);
  ok(same(v({ capabilities: ['stream-offer'], desktop: true, fakeSource: '/x/a.h264' }), { take: true, source: 'fake', sourceId: '/x/a.h264', code: null, why: null }), 'an agent with the op + the instance\'s fake source ⇒ taken, the source\'s path handed on');
  ok(v({ capabilities: ['stream-offer', 'stream-screen'], desktop: true, platform: 'win32' }).source === 'screen' && v({ capabilities: ['stream-offer', 'stream-screen'], desktop: true, platform: 'win32', fakeSource: '/x/a.h264' }).source === 'fake' && v({ capabilities: ['stream-offer', 'stream-screen'], desktop: true, platform: 'darwin' }).code === 'agent_too_old' && v({ capabilities: ['stream-offer', 'stream-screen', 'stream-mac'], desktop: true, platform: 'darwin' }).source === 'screen', 'a Windows agent that captures its screen (lane stream-p1b-screen\'s capability) ⇒ the screen; an instance that names a fake source keeps it (an explicit override wins — the suites, demos); a Mac agent captures through its helper (lane stream-p3m-build: stream-mac ⇒ the screen; an older one ⇒ agent_too_old)');
  ok(v({ capabilities: ['display-facts'], desktop: true, fakeSource: '/x/a.h264' }).code === 'agent_too_old', 'an agent without the op ⇒ agent_too_old (it is never asked)');
  ok(v({ capabilities: ['stream-offer'], desktop: false, fakeSource: '/x/a.h264' }).code === 'not_desktop_machine', 'a Linux machine ⇒ not_desktop_machine');
  ok(v({ capabilities: ['stream-offer'], desktop: true }).code === 'no_screen_source', 'P1-A on a real machine: the op but no screen source ⇒ no_screen_source (the window shows the VNC picture)');
  const copy = B.DISPLAY_BACKENDS.map((r) => (r.id === 'webrtc' ? { ...r, needs: [['agent:stream-other']] } : r));
  ok(v({ capabilities: ['stream-offer'], desktop: true, fakeSource: '/x', table: copy }).code === 'agent_too_old', 'CONTROL: a table whose row needs another capability refuses the same agent — the verdict reads the row');
  ok(v({ capabilities: ['stream-offer'], desktop: true, fakeSource: '/x', table: B.DISPLAY_BACKENDS.map((r) => (r.id === 'webrtc' ? { ...r, wired: false } : r)) }).code === 'not_wired', 'an unwired row ⇒ not_wired');
}

console.log('§3 the signaling state machine');
{
  const run = (events, start = { state: 'idle', restarts: 0 }, opts) => events.reduce((acc, ev) => { const r = SM.streamStep(acc.st, typeof ev === 'string' ? { type: ev } : ev, opts); acc.trail.push(`${r.state}:${r.action}`); acc.st = r; acc.last = r; return acc; }, { st: start, trail: [], last: null });
  const happy = run(['start', 'offer', 'answered', 'connected', 'frame']);
  ok(same(happy.trail, ['starting:start', 'offered:answer', 'connecting:wait', 'connecting:none', 'playing:none']), 'start → offer → answer → connecting (ICE up, waiting for the first frame) → playing', happy.trail);
  ok(run(['start', { type: 'refused', code: 'agent_too_old' }]).last.code === 'agent_too_old' && run(['start', { type: 'refused', code: 'x' }]).last.action === 'fallback', 'a refused start falls back with the refusal\'s code');
  const sick = run(['start', 'offer', 'answered', 'failed', 'restart-offer', 'answered', 'failed', 'restart-offer', 'answered', 'failed']);
  ok(same(sick.trail.filter((x) => /:restart$|^fallback/.test(x)), ['restarting:restart', 'restarting:restart', 'fallback:fallback']) && sick.last.code === 'ice_failed', 'connecting fails: two ICE restarts (the budget), then the VNC picture (ice_failed)', sick.trail);
  const blip = run(['start', 'offer', 'answered', 'frame', 'disconnected', 'restart-offer', 'answered', 'connected', 'disconnected', 'restart-offer', 'answered', 'connected', 'disconnected']);
  ok(blip.last.state === 'restarting' && blip.last.restarts === 1, 'a restart that comes back plays again and resets the count — the budget is CONSECUTIVE (three blips, still streaming)', blip.trail);
  ok(run(['start', 'offer', 'answered', { type: 'ended', code: 'link_lost' }]).last.code === 'link_lost' && run(['start', 'offer', 'answered', 'frame', 'ended']).last.code === 'stream_ended', 'the machine ends it ⇒ fallback with its reason (stream_ended when it gave none)');
  ok(run(['start', 'offer', 'answered', 'timeout']).last.state === 'restarting' && run(['start', 'timeout']).last.code === 'start_timeout', 'a connect timeout is a sick connection (restart); a start that never answers falls back');
  const closed = run(['start', 'offer', 'close', 'frame', 'start']);
  ok(same(closed.trail.slice(2), ['stopped:dispose', 'stopped:none', 'stopped:none']), 'close ⇒ stopped; a terminal state takes nothing more', closed.trail);
  ok(run(['frame', 'answered']).last.state === 'idle', 'an event a state does not take changes nothing');
  const taken = new Set();
  for (const s of SM.STREAM_STATES) for (const e of SM.STREAM_EVENTS) { const r = SM.streamStep({ state: s, restarts: 0 }, { type: e }); if (r.state !== s || r.action !== 'none') taken.add(e); }
  ok(SM.STREAM_EVENTS.every((e) => taken.has(e)), `every declared event moves some state (${SM.STREAM_EVENTS.length} events × ${SM.STREAM_STATES.length} states)`, SM.STREAM_EVENTS.filter((e) => !taken.has(e)));
}

console.log('§4 fallbackVerdict · §5 videoToSource');
{
  ok(SM.fallbackVerdict({ pc: 'failed' }).event === 'failed' && !SM.fallbackVerdict({ pc: 'disconnected', since: 0, now: 3999 }).sick && SM.fallbackVerdict({ pc: 'disconnected', since: 0, now: 4000 }).event === 'disconnected' && !SM.fallbackVerdict({ pc: 'connected', since: 0, now: 1e9 }).sick, '`failed` is sick at once, `disconnected` after its 4 s grace, `connected` never');
  const box = { left: 10, top: 20, width: 640, height: 480 }, vid = { w: 1280, h: 720 };
  ok(same(SM.videoToSource({ x: 10 + 320, y: 20 + 240 }, box, vid), { x: 640, y: 360, inside: true }), 'the element\'s centre is the picture\'s centre (16:9 in 4:3: letterboxed top and bottom)');
  ok(same(SM.videoToSource({ x: 10, y: 20 + 60 }, box, vid), { x: 0, y: 0, inside: true }) && same(SM.videoToSource({ x: 10 + 5, y: 20 + 10 }, box, vid), { x: 10, y: 0, inside: false }), 'the letterbox: the picture starts 60 px down; a point above it clamps to row 0 and says inside: false');
  ok(same(SM.videoToSource({ x: 330, y: 260 }, box, vid, { x: -1920, y: 0 }), { x: -1280, y: 360, inside: true }), 'the source\'s origin is added (a display left of the primary has negative desktop x)');
  ok(SM.videoToSource({ x: 1, y: 1 }, box, { w: 0, h: 0 }) === null, 'nothing decoded yet ⇒ null (no input sent)');
}

console.log('§6 the input table');
{
  const good = [{ t: 'mv', x: 1, y: 2 }, { t: 'md', x: 1, y: 2, b: 2 }, { t: 'mu', x: 1, y: 2, b: 0 }, { t: 'wh', x: 1, y: 2, dx: 0, dy: -120 }, { t: 'kd', c: 'KeyA' }, { t: 'ku', c: 'ControlLeft' }, { t: 'clip', text: 'héllo' }, { t: 'ack', f: 4294967295 }];
  ok(good.every((e) => same(SM.inputEventOf(JSON.stringify(e)), e)) && same(Object.keys(SM.INPUT_KINDS).sort(), good.map((e) => e.t).sort()), `each of the ${good.length} kinds round-trips (a string from the data channel)`);
  const bad = [['x'.repeat(SM.STREAM_LIMITS.inputMaxBytes + 1), 'too_big'], ['{', 'not_json'], ['[1]', 'not_an_event'], ['{"t":"__proto__"}', 'unknown_kind'], ['{"t":"constructor"}', 'unknown_kind'], ['{"t":"kd","c":"Key A"}', 'bad_code'], ['{"t":"md","x":1,"y":1,"b":3}', 'bad_button'], ['{"t":"mv","x":40000,"y":1}', 'bad_x'], ['{"t":"mv","x":1,"y":"2"}', 'bad_y'], [JSON.stringify({ t: 'clip', text: 'a'.repeat(SM.STREAM_LIMITS.clipMaxChars + 1) }), 'bad_text'], ['{"t":"ack","f":-1}', 'bad_frame']];
  const got = bad.map(([raw]) => SM.inputEventOf(raw).refused);
  ok(same(got, bad.map((b) => b[1])), 'every malformed event is refused BY NAME (never guessed): ' + bad.map((b) => b[1]).join(', '), got);
  ok(SM.wheelUnitsOf(100, 0) === -120 && SM.wheelUnitsOf(-3, 1) === 120 && SM.wheelUnitsOf(1, 2) === -360 && SM.wheelUnitsOf(1e6, 0) === -1200, 'wheel: 100 px = one notch (down = negative, the desktop\'s convention), 3 lines = one, a page = three, clamped at ten');
}

console.log('§7 the page\'s door: src/lib/stream-input.js');
{
  const S = await import(path.join(REPO, 'src/lib/stream-input.js'));
  const mac = S.keyMapFor('mac', 'win32');
  ok(same(S.keyMessage({ key: 'Meta', code: 'MetaLeft' }, true, mac), { t: 'kd', c: 'ControlLeft' }) && same(S.keyMessage({ key: 'Meta', code: 'MetaRight' }, false, mac), { t: 'ku', c: 'ControlRight' }), 'a Mac viewer\'s ⌘ reaches a Windows machine as Ctrl, its side kept (THE table\'s mac>windows row)');
  ok(same(S.keyMessage({ key: 'a', code: 'KeyA' }, true, mac), { t: 'kd', c: 'KeyA' }) && same(S.keyMessage({ key: 'Control', code: 'ControlLeft' }, true, mac), { t: 'kd', c: 'ControlLeft' }), 'every other key is the physical key it is (Ctrl stays Ctrl)');
  ok(same(S.keyMessage({ key: 'Meta', code: 'MetaLeft' }, true, S.keyMapFor('windows', 'win32')), { t: 'kd', c: 'MetaLeft' }), 'a Windows viewer\'s Windows key stays the Windows key');
  ok(same(S.keyMessage({ key: 'Meta', code: 'MetaLeft' }, true, { shift: 'shift', control: 'control', alt: 'alt', meta: 'meta' }), { t: 'kd', c: 'MetaLeft' }), 'CONTROL: handed an identity row, ⌘ stays Meta — the door moves keys by the map it is handed');
  ok(S.viewerPlatform({ userAgentData: { platform: 'macOS' } }) === 'mac' && S.viewerPlatform({ platform: 'Win32' }) === 'windows', 'the viewer\'s platform from userAgentData, else navigator.platform');
  const box = { left: 0, top: 0, width: 640, height: 480 }, vid = { w: 1280, h: 720 };
  ok(same(S.pointerMessage('md', { clientX: 100, clientY: 60, button: 0 }, box, vid, { x: 0, y: 0 }), { t: 'md', x: 200, y: 0, b: 0 }) && S.pointerMessage('md', { clientX: 100, clientY: 10, button: 0 }, box, vid, { x: 0, y: 0 }) === null && S.pointerMessage('mv', { clientX: 100, clientY: 10 }, box, vid, { x: 0, y: 0 }).y === 0, 'a press in the picture is sent at its pixel; a press in the letterbox is not; a move there clamps');
  ok(same(S.wheelMessage({ clientX: 320, clientY: 240, deltaY: 100, deltaX: 0, deltaMode: 0 }, box, vid, { x: 0, y: 0 }), { t: 'wh', x: 640, y: 360, dx: 0, dy: -120 }) && S.wheelMessage({ clientX: 1, clientY: 100, deltaY: 0, deltaX: 0 }, box, vid, null) === null, 'the wheel: one notch at the pointer; no notch ⇒ nothing sent');
  const door = read('src/lib/stream-input.js'), view = read('src/lib/stream-view.js');
  ok(/^import \{[^}]*\bprimaryModifierMap\b[^}]*\bmodifierKeyOf\b[^}]*\} from '\.\/modifier-map\.js';/m.test(door) && /keyMapFor\(viewerPlatform\(\), r\.platform\)/.test(view) && (view.match(/keyMessage\(e, (true|false), map\)/g) || []).length >= 3, 'the view keys every press through the door with the machine\'s platform from the start answer');
}

console.log('§8 statsOf · §9 the relay');
{
  const rep = (o) => [{ id: 'T', type: 'transport', selectedCandidatePairId: 'P' }, { id: 'P', type: 'candidate-pair', remoteCandidateId: 'R', currentRoundTripTime: 0.012, nominated: true, state: 'succeeded' }, { id: 'R', type: 'remote-candidate', candidateType: o.rtype || 'host' }, { id: 'V', type: 'inbound-rtp', kind: 'video', framesDecoded: o.f, bytesReceived: o.b, totalDecodeTime: o.d, jitter: 0.004, packetsLost: 2, frameWidth: 1280, frameHeight: 720 }];
  const a = SM.statsOf(null, rep({ f: 100, b: 1e6, d: 0.2 }), 1000);
  const b = SM.statsOf(a, rep({ f: 130, b: 1.125e6, d: 0.26, rtype: 'relay' }), 2000);
  ok(a.rttMs === 12 && a.jitterMs === 4 && a.fps === null && a.kbps === null && a.path === 'direct', 'the first read: RTT 12 ms, jitter 4 ms, the path direct; fps/kbps wait for a second read', a);
  ok(b.fps === 30 && b.kbps === 1000 && b.decodeMs === 2 && b.path === 'relay' && b.lost === 2 && b.width === 1280, 'the second: 30 fps, 1000 kbps, 2 ms a frame to decode, the path via the relay', b);
  const f = SM.relayFrame('10.1.2.3', 50000, new Uint8Array([1, 2, 3]));
  const g = SM.relayFrame('127.0.0.1', 9, new Uint8Array(1500));
  const both = new Uint8Array([...f, ...g]);
  const u1 = SM.relayUnframe(both.subarray(0, 5)), u2 = SM.relayUnframe(both);
  ok(u1.frames.length === 0 && u1.rest.length === 5 && u2.frames.length === 2 && u2.frames[0].ip === '10.1.2.3' && u2.frames[0].port === 50000 && same([...u2.frames[0].payload], [1, 2, 3]) && u2.frames[1].payload.length === 1500 && u2.rest.length === 0, 'two datagrams framed, cut anywhere, read back whole (address, port, bytes)');
  ok(SM.relayFrame('::1', 1, new Uint8Array(1)) === null && SM.relayFrame('1.2.3.4', 1, new Uint8Array(1501)) === null && SM.relayUnframe(new Uint8Array([255, 255, 0, 0])).bad === true, 'an IPv6 peer, a datagram over 1500 bytes and an out-of-bounds length are refused (the stream is closed, never resynced by guessing)');
  const lines = SM.relayCandidates(['192.168.1.9', 'bad', '127.0.0.1'], 4000);
  const prio = (l) => Number(l.split(' ')[3]);
  ok(lines.length === 2 && lines.every((l) => / typ relay /.test(l)) && prio(lines[0]) < 2113937151 && prio(lines[0]) > prio(lines[1]), 'the relay\'s candidates: one per hub IPv4, typ relay, under any host candidate\'s priority', lines);
}

console.log('§10 the packetizer over THE fixture');
{
  const buf = fs.readFileSync(FIXTURE);
  const aus = H.accessUnits(H.splitNalus(buf));
  ok(buf.length < 2 * 1024 * 1024 && aus.length === 300 && aus.filter((a) => a.key).length === 10 && aus[0].key && H.keyIndexAfter(aus, 1) === 30 && H.keyIndexAfter(aus, 290) === 0, `the fixture: ${buf.length} bytes, 300 pictures, a key every 30 (the loop wraps to 0)`);
  ok(aus[0].nalus.map(H.typeOf).slice(0, 2).join() === '7,8' && aus.every((a) => a.nalus.every((n) => H.typeOf(n) !== H.NAL.aud)), 'a key picture carries its SPS + PPS first; no access unit delimiter is sent');
  let bigOk = true, markOk = true, roundOk = true, fus = 0;
  for (const au of aus) {
    const pl = H.rtpPayloads(au.nalus);
    if (!pl.every((p) => p.payload.length <= H.MAX_PAYLOAD)) bigOk = false;
    if (pl.filter((p) => p.marker).length !== 1 || !pl[pl.length - 1].marker) markOk = false;
    fus += pl.filter((p) => (p.payload[0] & 0x1f) === 28).length;
    const back = H.depacketize(pl.map((p) => p.payload));
    if (back.length !== au.nalus.length || !back.every((n, i) => Buffer.compare(n, au.nalus[i]) === 0)) roundOk = false;
  }
  ok(bigOk && markOk && roundOk, `every payload ≤ ${H.MAX_PAYLOAD} bytes, ONE marker per picture on its last packet, a receiver's reassembly byte-identical (the fixture's slices all fit: ${fus} FU-A)`);
  const big = Buffer.concat([Buffer.from([0x65]), Buffer.alloc(5000, 7)]), sps = Buffer.from([0x67, 1, 2]);
  const bp = H.rtpPayloads([sps, big]);
  const fu = bp.slice(1);
  ok(bp.length === 6 && bp[0].payload === sps && fu.every((p) => p.payload[0] === ((0x65 & 0xe0) | 28) && p.payload.length <= H.MAX_PAYLOAD) && (fu[0].payload[1] & 0x80) && (fu[4].payload[1] & 0x40) && !(fu[2].payload[1] & 0xc0) && fu.every((p) => (p.payload[1] & 0x1f) === 5) && same(bp.map((p) => p.marker), [false, false, false, false, false, true]) && Buffer.compare(H.depacketize(bp.map((p) => p.payload))[1], big) === 0, 'a 5 001-byte slice (an encoder\'s key frame): five FU-A fragments — start bit first, end bit last, its type kept, the marker on the very last — reassembled byte-identical');
  const four = H.splitNalus(Buffer.from([0, 0, 0, 1, 0x67, 1, 0, 0, 0, 1, 0x68, 2, 0, 0, 1, 0x65, 3, 0]));
  ok(same(four.map((n) => [...n]), [[0x67, 1], [0x68, 2], [0x65, 3]]), '3- and 4-byte start codes; a trailing zero belongs to the next start code');
}

console.log('§11 THE injector');
{
  ok(same(I.SCAN_CODES.KeyA, [0x1e, 0]) && same(I.SCAN_CODES.ArrowUp, [0x48, 1]) && same(I.SCAN_CODES.MetaLeft, [0x5b, 1]) && same(I.SCAN_CODES.NumpadEnter, [0x1c, 1]) && !('Pause' in I.SCAN_CODES), 'scan codes: KeyA 0x1e, the arrows and the Windows keys extended (E0), Pause (an E1 sequence) absent on purpose');
  ok(same(I.commandsOf({ t: 'md', x: 5, y: 6, b: 2 }).lines, ['M 5 6', 'D 2']) && same(I.commandsOf({ t: 'ku', c: 'Delete' }).lines, ['K 83 1 1']) && I.commandsOf({ t: 'kd', c: 'Pause' }).refused === 'unmapped_key' && same(I.commandsOf({ t: 'ack', f: 1 }).lines, []), 'commands: a press moves first, a key is its scan code (+ extended, + up), an unmapped key is refused, an ack injects nothing');
  ok(Buffer.from(I.commandsOf({ t: 'clip', text: 'hé' }).lines[0].slice(2), 'base64').toString('utf16le') === 'hé', 'clipboard text travels as base64 UTF-16LE (PowerShell\'s Unicode)');
  ok(/SendInput\(uint n, INPUT\[\] a, int size\)/.test(I.INPUT_PS) && /'D' \{ \$r = if \(-not \$script:Elevated -and \[VsInput\]::FrontElevated\(\)\) \{ 'uipi' \}/.test(I.INPUT_PS) && /public static string FrontClass\(\)/.test(I.INPUT_PS) && /\[Console\]::In\.ReadLine\(\)/.test(I.INPUT_PS) && /WriteLine\('ready'\)/.test(I.INPUT_PS) && /0x0001 \| 0x8000 \| 0x4000/.test(I.INPUT_PS), 'the resident script: SendInput compiled once, ready, one stdin line per command, absolute over the VIRTUAL desktop, UIPI asked before a press only when NOT elevated, the foreground class readable for the elevated fence');
  const dir = scratch('webrtc-inj'); fs.mkdirSync(dir, { recursive: true }); const stub = path.join(dir, 'stub.jsonl');
  try {
    const st = I.createInjector({ platform: 'linux', fs, stubFile: stub });
    const r = await st.inject([{ t: 'mv', x: 1, y: 2 }, { t: 'kd', c: 'KeyA' }, { t: 'kd', c: 'Pause' }]);
    ok(st.kind === 'stub' && r.n === 2 && same(r.refused.map((x) => x.code), ['unmapped_key']) && same(fs.readFileSync(stub, 'utf8').trim().split('\n').map((l) => JSON.parse(l).cmd), ['M 1 2', 'K 30 0 0']), 'Linux: the stub records what it would have sent; the unmapped key refused by name');
    const none = I.createInjector({ platform: 'linux', fs, stubFile: null });
    ok((await none.inject([{ t: 'mv', x: 1, y: 1 }])).n === 1 && fs.readdirSync(dir).length === 1, 'no stub file named ⇒ nothing recorded anywhere');
    const mac = await I.createInjector({ platform: 'darwin' }).inject([{ t: 'mv', x: 1, y: 1 }]);
    ok(mac.ok === false && mac.code === 'no_helper' && mac.refused[0].code === 'no_helper', 'macOS: its injector is the screen helper (lane stream-p3m-build) — none handed in ⇒ no_helper by name');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // the RESIDENT protocol over a fake PowerShell child
  const fakeSpawn = (answer) => { const spawned = []; const fn = (cmd, args) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stdout.setEncoding = () => { }; const lines = []; c.stdin = new EventEmitter(); c.stdin.write = (l) => { lines.push(l.trim()); const a = answer(l.trim()); if (a != null) setImmediate(() => c.stdout.emit('data', a + '\r\n')); return true; }; c.kill = () => { c.killed = true; }; spawned.push({ cmd, args, lines, c }); setImmediate(() => c.stdout.emit('data', 'ready\r\n')); return c; }; fn.spawned = spawned; return fn; };
  const sp = fakeSpawn((l) => (l.startsWith('D') ? 'uipi' : 'ok'));
  const win = I.createInjector({ platform: 'win32', spawn: sp });
  const w1 = await win.inject([{ t: 'mv', x: 10, y: 10 }, { t: 'md', x: 10, y: 10, b: 0 }, { t: 'kd', c: 'KeyA' }]);
  const argv = sp.spawned[0].args;
  ok(win.kind === 'sendinput' && sp.spawned.length === 1 && sp.spawned[0].cmd === 'powershell.exe' && argv.includes('-EncodedCommand') && Buffer.from(argv[argv.length - 1], 'base64').toString('utf16le') === I.INPUT_PS, 'Windows: ONE resident powershell.exe -EncodedCommand <THE script> (spawned at the first event, kept)');
  ok(same(sp.spawned[0].lines, ['M 10 10', 'M 10 10', 'D 0', 'K 30 0 0']) && w1.n === 2 && same(w1.refused.map((x) => x.code), ['uipi_blocked']), 'an elevated window in front: the press answers `uipi` ⇒ uipi_blocked by name; the move and the key went in', w1);
  const quiet = I.createInjector({ platform: 'win32', spawn: fakeSpawn(() => null), lineMs: 150, readyMs: 300 });
  const q = await quiet.inject([{ t: 'mv', x: 1, y: 1 }]);
  ok(q.n === 0 && q.refused[0].code === 'injector_timeout', 'a resident that stops answering ⇒ injector_timeout by name (and it is killed, respawned at the next event)');
  win.close(); quiet.close();
}

console.log('§12 the hub\'s half');
{
  const SDP = ['v=0', 'o=- 1 1 IN IP4 0.0.0.0', 's=-', 't=0 0', 'a=group:BUNDLE 0 1', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'a=candidate:1 1 udp 2116026367 192.168.9.9 50000 typ host generation 0', 'a=mid:0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=candidate:1 1 udp 2116026367 192.168.9.9 50000 typ host generation 0', 'a=mid:1', ''].join('\r\n');
  const fakeAgent = ({ caps = ['stream-offer'], platform = 'win32' } = {}) => {
    const calls = [], fwd = []; let push = null;
    const dm = { calls, fwd,
      status: () => ({ connected: true, info: { platform, capabilities: caps } }), desktopServe: async () => ({}),
      streamOffer: async (p, o) => { calls.push(['offer', p]); push = o.onPush; return p.iceRestart ? { ok: true, sid: p.sid, offer: { type: 'offer', sdp: SDP } } : { ok: true, sid: 'sid-1', offer: { type: 'offer', sdp: SDP }, source: { kind: p.sourceKind, origin: { x: 0, y: 0 } }, relayPort: p.relay ? 4242 : null, codec: { mimeType: 'video/H264' } }; },
      streamAnswer: async (sid, a) => { calls.push(['answer', sid, a]); return { ok: true }; },
      streamStop: async (sid) => { calls.push(['stop', sid]); return { stopped: true }; },
      tcpForward: async (port) => { const h = { port, written: [], write(b) { h.written.push(Buffer.from(b)); return true; }, close() { h.closed = true; } }; fwd.push(h); return h; },
      push: (m) => push && push(m) };
    return dm;
  };
  const hostsFor = (map) => ({ get: (h) => (map[h] ? { id: h, name: 'PC' } : null), isLocal: (h) => !h || h === 'local', deviceBounded: async (h) => map[h], connectedDevice: (h) => map[h] || null });
  const quiet = { log() { }, warn() { } };
  const old = fakeAgent({ caps: ['display-facts'] }), lin = fakeAgent({ platform: 'linux' });
  const accR = ACC.create({ hosts: hostsFor({ old, lin }), install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: quiet });
  const wrR = DW.create({ access: accR, log: quiet });
  const r1 = await wrR.start('old'), r2 = await wrR.start('lin'), r3 = await wrR.start('local');
  ok(!r1.take && r1.code === 'agent_too_old' && !r2.take && r2.code === 'not_desktop_machine' && !r3.take && r3.code === 'not_desktop_machine' && old.calls.length === 0 && lin.calls.length === 0, 'the rung\'s refusals pass through by name and NOTHING is asked of those agents (an old agent, a Linux machine, this hub)');
  const noFake = DW.create({ access: ACC.create({ hosts: hostsFor({ win: fakeAgent() }), install: false, env: () => ({}), log: quiet }), log: quiet });
  ok((await noFake.start('win')).code === 'no_screen_source', 'P1-A without a fake source: no_screen_source (the VNC picture, quietly)');
  wrR.shutdown(); noFake.shutdown();

  const win = fakeAgent();
  const acc = ACC.create({ hosts: hostsFor({ win }), install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: quiet });
  const wr = DW.create({ access: acc, log: quiet, ips: () => ['127.0.0.1'], pollMaxMs: 120000 }); // no poll returns on its own clock inside the suite's watchdog
  const s = await wr.start('win');
  const relayLine = (s.offer.sdp.match(/a=candidate:vsrelay0 [^\r\n]*/) || [''])[0];
  const relayPort = Number(relayLine.split(' ')[5]);
  const { relayLeg: leg0, ...ask0 } = win.calls[0][1] || {};
  ok(s.take && s.sid === 'sid-1' && same(ask0, { sourceKind: 'fake', sourceId: FIXTURE, maxKbps: null, relay: true }) && leg0 && leg0.port === relayPort && Buffer.from(leg0.key, 'base64').length === 32 && same(leg0.hosts, ['127.0.0.1']) && / 127\.0\.0\.1 \d+ typ relay /.test(relayLine) && / typ host /.test(s.offer.sdp) && win.fwd[0].port === 4242, 'taken: stream-offer asked with the fake source + relay + the UDP leg\'s spec (the relay\'s own port, a 32-byte key, the hub\'s addresses); the offer keeps its host candidates AND gains the relay\'s (its UDP port, forwarded to the agent\'s relay port 4242)', { call: win.calls[0], relayLine });
  // a datagram crosses the relay
  const peer = dgram.createSocket('udp4'); await new Promise((r) => peer.bind(0, '127.0.0.1', r));
  const got = []; peer.on('message', (m) => got.push(m));
  const h = win.fwd[0];
  h.onData(Buffer.from(SM.relayFrame('127.0.0.1', peer.address().port, new Uint8Array([9, 9]))));
  await sleep(50);
  ok(got.length === 0, 'the agent cannot make the relay send to a peer that never wrote to it first');
  peer.send(Buffer.from([1, 2, 3]), relayPort, '127.0.0.1');
  for (let i = 0; i < 40 && !h.written.length; i++) await sleep(10);
  const up = h.written.length ? SM.relayUnframe(new Uint8Array(h.written[0])).frames[0] : null;
  ok(up && up.ip === '127.0.0.1' && up.port === peer.address().port && same([...up.payload], [1, 2, 3]), 'a browser\'s datagram reaches the forward framed with its address', up);
  h.onData(Buffer.from(SM.relayFrame('127.0.0.1', peer.address().port, new Uint8Array([7, 8]))));
  for (let i = 0; i < 40 && !got.length; i++) await sleep(10);
  ok(got.length === 1 && same([...got[0]], [7, 8]), 'the agent\'s answer goes back out of the relay\'s port to that peer');
  peer.close();
  // the long poll
  const p0 = await wr.poll(s.key, 0, -1, 0);
  const waiting = wr.poll(s.key, p0.n, p0.seq, 120000); // a poll that did not WAKE would outlast the suite's watchdog — red, never a pass
  let woke = false; waiting.then(() => { woke = true; });
  await sleep(30);
  const before = woke;
  win.push({ op: 'stream-ice', sid: 'sid-1', candidate: { candidate: 'candidate:9 1 udp 1 192.168.9.9 50001 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
  const p1 = await waiting;
  ok(!before && p1.cands.length === 1 && p1.n === 1 && p1.seq > p0.seq, 'the long poll WAITS (nothing new), then wakes on the agent\'s pushed candidate and hands only the new one', p1);
  win.push({ op: 'stream-stats', sid: 'sid-1', stats: { fps: 30, kbps: 900 }, state: 'connected' });
  const p2 = await wr.poll(s.key, p1.n, p1.seq, 1000);
  ok(p2.state === 'connected' && p2.stats.fps === 30 && p2.cands.length === 0, 'the agent\'s numbers and state reach the page');
  await wr.answer(s.key, SDP);
  await wr.candidate(s.key, { candidate: 'candidate:5 1 udp 1 10.0.0.5 4000 typ host', sdpMid: '0', sdpMLineIndex: 0 });
  ok(win.calls.filter((c) => c[0] === 'answer').length === 2 && win.calls[1][2].answer.sdp === SDP && win.calls[2][2].candidate.candidate.includes('10.0.0.5'), 'the page\'s answer and its candidate reach the agent as they are (direct allowed)');
  const re = await wr.restart(s.key);
  ok(win.calls.some((c) => c[0] === 'offer' && c[1].iceRestart === true && c[1].sid === 'sid-1') && /typ relay/.test(re.offer.sdp), 'an ICE restart asks the agent for a restart offer of the SAME session; the relay\'s candidates ride it again');
  ok(same(wr.facts('win').map((f) => [f.sid, f.state, f.source.kind, f.codec.mimeType]), [['sid-1', 'connected', 'fake', 'video/H264']]), 'THE RECORD: the session\'s facts (sid, state, source, codec)');
  win.push({ op: 'stream-stats', sid: 'sid-1', state: 'closed', ended: 'link_lost' });
  const pe = await wr.poll(s.key, 0, p2.seq, 1000);
  ok(pe.ended === 'link_lost' && h.closed === true, 'the agent says it ended ⇒ the page hears `ended` (link_lost) and the relay is closed');
  const st = await wr.stop(s.key);
  ok(st.stopped && win.calls.some((c) => c[0] === 'stop' && c[1] === 'sid-1') && (await wr.poll(s.key, 0, -1, 0)).ended === 'not_found', 'stop: stream-stop on the agent; the key is gone (not_found)');
  wr.shutdown();
  // relay-only: both sides' host candidates are stripped
  const win2 = fakeAgent();
  const wr2 = DW.create({ access: ACC.create({ hosts: hostsFor({ win2 }), install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: quiet }), log: quiet, ips: () => ['127.0.0.1'], direct: false });
  const s2 = await wr2.start('win2');
  await wr2.answer(s2.key, SDP);
  const skipped = await wr2.candidate(s2.key, { candidate: 'candidate:5 1 udp 1 10.0.0.5 4000 typ host', sdpMid: '0', sdpMLineIndex: 0 });
  win2.push({ op: 'stream-ice', sid: 'sid-1', candidate: { candidate: 'candidate:9 1 udp 1 192.168.9.9 50001 typ host' } });
  ok(!/ typ host/.test(s2.offer.sdp) && /typ relay/.test(s2.offer.sdp) && !/ typ host/.test(win2.calls.find((c) => c[0] === 'answer')[2].answer.sdp) && skipped.skipped === 'host' && (await wr2.poll(s2.key, 0, -1, 0)).cands.length === 0, 'relay-only (direct: false): the offer, the answer and both sides\' trickled candidates keep no host candidate');
  wr2.shutdown();
  // the idle sweep
  const win3 = fakeAgent();
  let clock = 1e6;
  const wr3 = DW.create({ access: ACC.create({ hosts: hostsFor({ win3 }), install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: quiet }), log: quiet, now: () => clock, idleMs: 1000, sweepMs: 20, ips: () => [] });
  const s3 = await wr3.start('win3');
  clock += 1500; await sleep(80);
  ok(win3.calls.some((c) => c[0] === 'stop') && (await wr3.poll(s3.key, 0, -1, 0)).ended === 'not_found', 'a session no page polled for idleMs is stopped (the page closed without a word)');
  wr3.shutdown();
}

console.log('§13 the three touches, by source');
{
  const ad = read('src/agentd/agentd.js'), cl = read('src/agentd/client.js');
  const caps = (ad.match(/capabilities: \[([^\]]*)\]/) || [])[1] || '';
  ok(/'stream-offer'/.test(caps) && /'input-events'/.test(caps), '① the hello-ack names stream-offer and input-events (by content)');
  for (const op of ['stream-offer', 'stream-answer', 'stream-stop', 'stream-stats', 'input-events']) ok(new RegExp(`if \\(msg\\.op === '${op}'\\) \\{[\\s\\S]{0,900}?op: '${op}-result', id: msg\\.id`).test(ad) && new RegExp(`m\\.op === '${op}-result'`).test(cl), `① ${op}: the handler replies \`${op}-result\` by id; ② the client routes it by id`);
  const pushAt = cl.indexOf("if (m.op === 'stream-ice' || m.op === 'stream-stats')"), prevAt = cl.indexOf('prevControl(m);', pushAt);
  const branchStart = cl.lastIndexOf('mux.onControl = (m) => {', pushAt);
  ok(pushAt > 0 && branchStart > 0 && prevAt > pushAt && cl.slice(branchStart, pushAt).includes("m.op === 'stream-stats-result'"), '③ the pushes (stream-ice / stream-stats) have their own branch BEFORE prevControl — after the id-keyed routing set (stream-stats-result is a reply, stream-stats a push)');
  ok(/for \(const sid of \[\.\.\.\(this\._streamWatches\?\.keys\(\) \|\| \[\]\)\]\) this\._rearmStream\(sid\);/.test(cl) && /op: 'stream-stats', sid, watch: true/.test(cl), '③ a reconnect re-arms every stream session (stream-stats with watch: this link owns its pushes again)');
  ok(/if \(streamHost\) streamHost\.linkDead\(mux\);/.test(ad), 'the daemon makes a dead link\'s sessions orphans (their media keeps flowing) until the re-arm');
  for (const m of ['streamOffer', 'streamAnswer', 'streamStats', 'inputEvents']) ok(new RegExp(`async ${m}\\([^)]*\\) \\{\\n    const conn = await this\\.connect\\(\\);\\n    if \\(!conn\\.info\\?\\.capabilities\\?\\.includes\\?\\.\\('(stream-offer|input-events)'\\)\\)`).test(cl), `② ${m} refuses an agent without the capability BEFORE asking`);
}

console.log('§14 THE UDP LEG (lane stream-relay-udp)');
{
  const crypto = require('node:crypto');
  const SH = require(path.join(REPO, 'src/agentd/stream-host.js'));
  const macOf = (key) => (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, 16);
  const key = crypto.randomBytes(32), mac = macOf(key), nonce = crypto.randomBytes(8);
  // the codec
  const ping = SM.legControl(SM.LEG.PING, { flags: SM.LEG.UP, counter: 5, nonce, mac });
  const pp = SM.legParse(ping, mac), forged = SM.legParse(ping, macOf(crypto.randomBytes(32)));
  ok(ping.length === 34 && pp.type === 'ping' && pp.flags === SM.LEG.UP && pp.counter === 5 && pp.ok && Buffer.from(pp.nonce).equals(nonce) && forged.ok === false, 'a PING: 34 bytes (magic · type · flags · counter · nonce · 16-byte HMAC); it parses back and its mac holds only under the session\'s key');
  ok(same(SM.legPingVerdict({ lastCounter: 0 }, forged), { take: false, code: 'forged' }) && same(SM.legPingVerdict({ lastCounter: 5 }, pp), { take: false, code: 'replayed' }) && same(SM.legPingVerdict({ lastCounter: 4 }, pp), { take: true, code: null }), 'the hub\'s verdict: a wrong mac = forged, a counter not above the last = replayed, else taken');
  const dd = SM.legParse(SM.legData('10.1.2.3', 50000, new Uint8Array([1, 2, 3])));
  ok(dd.type === 'data' && dd.ip === '10.1.2.3' && dd.port === 50000 && same([...dd.payload], [1, 2, 3]) && SM.legData('::1', 1, new Uint8Array([1])) === null && SM.legData('1.2.3.4', 1, new Uint8Array(1501)) === null, 'DATA carries the browser\'s address + its datagram (relayFrame\'s bounds: IPv4, ≤ 1500 bytes)');
  ok([[0x00, 0x01], [0x01, 0x01], [0x16, 0xfe], [0x80, 0x60], [0x90, 0xc8]].every((h) => !SM.isLegPacket(new Uint8Array([...h, 0, 0, 0, 0]))) && SM.isLegPacket(ping), 'a STUN / DTLS / RTP / RTCP first byte is never the leg\'s magic (ONE hub socket tells them apart)');
  // the hub's half over a stand-in daemon socket
  const legAgent = () => {
    const calls = []; let push = null; const fwd = [];
    return { calls, fwd, _conn: null, status: () => ({ connected: true, info: { platform: 'win32', capabilities: ['display-facts', 'stream-offer', 'input-events'] } }), desktopServe: async () => ({}),
      streamOffer: async (p, o) => { calls.push(['offer', p]); push = o.onPush; return { ok: true, sid: 'sid-L', offer: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }, source: { kind: 'fake', origin: { x: 0, y: 0 } }, relayPort: 4243, codec: { mimeType: 'video/H264' } }; },
      streamAnswer: async () => ({ ok: true }), streamStop: async () => ({ stopped: true }),
      tcpForward: async (port) => { const h = { port, written: [], write(b) { h.written.push(Buffer.from(b)); return true; }, close() { h.closed = true; } }; fwd.push(h); return h; } };
  };
  let muted = false;
  const la = legAgent();
  const wrL = DW.create({ access: ACC.create({ hosts: { get: (h) => ({ id: h, name: 'PC' }), isLocal: () => false, deviceBounded: async () => la, connectedDevice: () => la }, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: { log() { }, warn() { } } }), log: { log() { }, warn() { } }, ips: () => ['127.0.0.1'], pollMaxMs: 120000, legMute: () => muted });
  const sL = await wrL.start('pcL');
  const spec = la.calls[0][1].relayLeg, lkey = Buffer.from(spec.key, 'base64'), lmac = macOf(lkey);
  const dmn = dgram.createSocket('udp4'); await new Promise((r) => dmn.bind(0, '127.0.0.1', r));
  const fromHub = []; dmn.on('message', (m, ri) => fromHub.push({ m, port: ri.port }));
  const br = dgram.createSocket('udp4'); await new Promise((r) => br.bind(0, '127.0.0.1', r));
  const toBr = []; br.on('message', (m) => toBr.push(m));
  const waitFor = async (f) => { for (let i = 0; i < 60 && !f(); i++) await sleep(10); return f(); };
  const rf = async () => (await wrL.poll(sL.key, 0, -1, 0)).relay;
  dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { counter: 1, nonce, mac: macOf(crypto.randomBytes(32)) })), spec.port, '127.0.0.1');
  await sleep(60);
  ok(fromHub.length === 0 && (await rf()).leg.forged === 1 && (await rf()).leg.addr === null, 'a PING under another key: dropped, counted (forged 1), NO answer, no address learned');
  dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { counter: 1, nonce, mac: lmac })), spec.port, '127.0.0.1');
  await waitFor(() => fromHub.length);
  const pong = fromHub.length ? SM.legParse(new Uint8Array(fromHub[0].m), lmac) : null;
  const r1 = await rf();
  ok(pong && pong.type === 'pong' && pong.ok && pong.counter === 1 && Buffer.from(pong.nonce).equals(nonce) && fromHub[0].port === spec.port && r1.leg.addr === `127.0.0.1:${dmn.address().port}` && r1.via === 'link', 'an authenticated PING: answered by a PONG under the same key (its counter + nonce echoed, from the relay\'s port); the daemon\'s address learned — still the device link until it says UP', { pong, r1 });
  dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { counter: 1, nonce, mac: lmac })), spec.port, '127.0.0.1');
  await sleep(60);
  ok(fromHub.length === 1 && (await rf()).leg.replayed === 1, 'the same PING again (its counter not above the last): dropped as replayed, unanswered');
  dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { flags: SM.LEG.UP, counter: 2, nonce, mac: lmac })), spec.port, '127.0.0.1');
  await waitFor(() => fromHub.length === 2);
  const r2 = await rf();
  br.send(Buffer.from([0x00, 0x01, 0x00, 0x00]), spec.port, '127.0.0.1'); // a browser's STUN-shaped datagram
  await waitFor(() => fromHub.length === 3);
  const asData = fromHub[2] ? SM.legParse(new Uint8Array(fromHub[2].m)) : null;
  ok(r2.via === 'udp' && asData && asData.type === 'data' && asData.ip === '127.0.0.1' && asData.port === br.address().port && same([...asData.payload], [0, 1, 0, 0]) && la.fwd[0].written.length === 0, 'a PING flagged UP ⇒ via udp: the browser\'s datagram reaches the daemon\'s socket as leg DATA with the browser\'s address — nothing went over the device link', { via: r2.via, asData });
  dmn.send(Buffer.from(SM.legData('127.0.0.1', br.address().port, new Uint8Array([7, 7]))), spec.port, '127.0.0.1');
  dmn.send(Buffer.from(SM.legData('127.0.0.1', 9, new Uint8Array([8, 8]))), spec.port, '127.0.0.1');
  await waitFor(() => toBr.length);
  const stray = dgram.createSocket('udp4'); await new Promise((r) => stray.bind(0, '127.0.0.1', r));
  stray.send(Buffer.from(SM.legData('127.0.0.1', br.address().port, new Uint8Array([6, 6]))), spec.port, '127.0.0.1');
  await sleep(60);
  ok(toBr.length === 1 && same([...toBr[0]], [7, 7]) && (await rf()).leg.stray === 1, 'the daemon\'s DATA reach the browser that wrote first (not port 9, which never wrote); DATA from any other address is dropped as stray', { toBr: toBr.map((b) => [...b]) });
  la.fwd[0].onData(Buffer.from(SM.relayFrame('127.0.0.1', br.address().port, new Uint8Array([5]))));
  await waitFor(() => toBr.length === 2);
  br.send(Buffer.from([0x00, 0x01, 0x00, 0x02]), spec.port, '127.0.0.1');
  await waitFor(() => fromHub.length === 4);
  const r3 = await rf();
  const asLeg = fromHub[3] ? SM.legParse(new Uint8Array(fromHub[3].m)) : null;
  ok(r3.via === 'udp' && toBr.length === 2 && la.fwd[0].written.length === 0 && asLeg && asLeg.type === 'data' && same([...asLeg.payload], [0, 1, 0, 2]) && r3.leg.held === 1 && r3.leg.changes.map((c) => c.via).join(',') === 'udp', 'the daemon spoke on the device link ⇒ its frame reaches the browser, and the hub STILL answers on the leg (lane stream-leg-flap: a second path speaking is never a reason to leave the first) — counted (held 1), no change on the record', r3);
  muted = true;
  dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { flags: SM.LEG.UP, counter: 3, nonce, mac: lmac })), spec.port, '127.0.0.1');
  await sleep(60);
  ok(fromHub.length === 4 && (await rf()).via === 'udp', 'a muted hub (the suites\' unreachable hub) leaves an authenticated PING unanswered (the election unchanged)');
  muted = false;
  await wrL.stop(sL.key); wrL.shutdown(); dmn.close(); br.close(); stray.close();
  const wrN = DW.create({ access: ACC.create({ hosts: { get: (h) => ({ id: h, name: 'PC' }), isLocal: () => false, deviceBounded: async () => la, connectedDevice: () => la }, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: { log() { }, warn() { } } }), log: { log() { }, warn() { } }, ips: () => ['127.0.0.1'], udpLeg: false });
  const sN = await wrN.start('pcN');
  ok(sN.take && !('relayLeg' in la.calls[la.calls.length - 1][1]) && (await wrN.poll(sN.key, 0, -1, 0)).relay.leg === null, 'udpLeg: false (the device-link control) asks the daemon for no leg');
  await wrN.stop(sN.key); wrN.shutdown();
  // the daemon's half on an injected clock (a stand-in socket: nothing is bound; the hub's port is one nothing answers)
  const HP = await deadPort();
  let clock = 1e6;
  const sent = [], handlers = {};
  const fakeSock = { on: (ev, f) => { handlers[ev] = f; }, send: (b, port, ip) => sent.push({ b: new Uint8Array(b), port, ip }), close() { }, address: () => ({ port: 1 }) };
  const hubKey = crypto.randomBytes(32), hmac = macOf(hubKey);
  const answer = (pkt, from = { address: '10.0.0.9', port: HP }) => { const q = SM.legParse(pkt, hmac); handlers.message(Buffer.from(SM.legControl(SM.LEG.PONG, { counter: q.counter, nonce: q.nonce, mac: hmac })), from); };
  const changes = [], fromLeg = [];
  ok(SH.createLeg({ port: HP, key: 'short', hosts: ['10.0.0.9'] }, { socket: fakeSock, timer: false }) === null && SH.createLeg({ port: 0, key: hubKey.toString('base64'), hosts: ['10.0.0.9'] }, { socket: fakeSock, timer: false }) === null, 'a spec without a 32-byte key or a port opens no leg');
  const g = SH.createLeg({ port: HP, key: hubKey.toString('base64'), hosts: ['10.0.0.9', '127.0.0.1', 'bad host!'] }, { extra: ['hub.example'], socket: fakeSock, timer: false, now: () => clock, onChange: (x) => changes.push(x.state), onData: (ip, port, payload) => fromLeg.push([ip, port, [...payload]]) });
  ok(g.state === 'probing' && same(sent.map((x) => `${x.ip}:${x.port}`), [`hub.example:${HP}`, `10.0.0.9:${HP}`, `127.0.0.1:${HP}`]) && SM.legParse(sent[0].b, hmac).ok && SM.legParse(sent[0].b, hmac).flags === 0, 'the first PING goes at once to the dialled host + each hub address (a malformed host skipped), authenticated, not flagged UP');
  clock += 120; answer(sent[1].b);
  const confirm = sent[sent.length - 1];
  ok(g.state === 'up' && g.facts().target === `10.0.0.9:${HP}` && g.facts().rttMs === 120 && same(changes, ['up']) && confirm.ip === '10.0.0.9' && SM.legParse(confirm.b, hmac).flags === SM.LEG.UP, 'the first authenticated PONG: UP — the hub\'s address locked (10.0.0.9), its rtt 120 ms, and a PING flagged UP goes at once (the hub switches without waiting 15 s)', g.facts());
  answer(confirm.b);
  handlers.message(Buffer.from(SM.legData('192.168.1.5', 50000, new Uint8Array([4, 2]))), { address: '10.0.0.66', port: HP });
  handlers.message(Buffer.from(SM.legData('192.168.1.5', 50000, new Uint8Array([4, 2]))), { address: '10.0.0.9', port: HP });
  ok(same(fromLeg, [['192.168.1.5', 50000, [4, 2]]]) && g.facts().stray === 1, 'the hub\'s DATA reach the shims; DATA from another address is stray (dropped)');
  const n0 = sent.length;
  clock += 14000; g.tick();
  const idleQuiet = sent.length === n0;
  clock += 1100; g.tick();
  ok(idleQuiet && sent.length === n0 + 1, 'idle (nothing sent on the leg): the next PING 15 s after the last — the keepalive that keeps the NAT / firewall state');
  answer(sent[sent.length - 1].b);
  ok(g.send('192.168.1.5', 50000, new Uint8Array([1])) === true && SM.legParse(sent[sent.length - 1].b).type === 'data', 'up: werift\'s datagram leaves as leg DATA to the hub');
  const n1 = sent.length;
  clock += 2100; g.tick();
  ok(sent.length === n1 + 1 && SM.legParse(sent[sent.length - 1].b, hmac).type === 'ping', 'while it carries the picture: a PING every 2 s');
  const p1 = sent[sent.length - 1];
  clock += 1000; g.tick();
  const quietWait = g.state === 'up' && sent.length === n1 + 1;
  clock += 1100; g.tick();
  const p2 = sent[sent.length - 1];
  ok(quietWait && g.state === 'up' && g.facts().misses === 1 && sent.length === n1 + 2 && SM.legParse(p2.b, hmac).flags === SM.LEG.UP && g.send('1.2.3.4', 1, new Uint8Array([1])) === true, 'that PING unanswered for 2 s: a MISS, not a verdict (lane stream-leg-flap) — the leg stays UP and carries the picture, the next PING (flagged UP) goes at once', g.facts());
  clock += 500; answer(p1.b);
  ok(g.state === 'up' && g.facts().misses === 0 && g.facts().missed === 1 && same(changes, ['up']), 'its PONG arriving 2.6 s late still counts: the run of misses ends (missed 1 on the record)', g.facts());
  const nm = sent.length;
  clock += 1600; g.tick(); // the PING asked at the miss, now 2.1 s old: miss 1 → the next at once
  clock += 2100; g.tick(); // miss 2
  const twoMisses = g.state === 'up' && g.facts().misses === 2 && sent.length === nm + 2;
  clock += 2100; g.tick(); // miss 3
  ok(twoMisses && g.state === 'down' && g.why === 'no_echo' && same(changes, ['up', 'down']) && g.send('1.2.3.4', 1, new Uint8Array([1])) === false, 'THREE PINGs in a row unanswered (legMissMax, 2 s each): DOWN (no_echo) — send() refuses, the device link carries the datagrams', g.facts());
  const n2 = sent.length;
  clock += 2000; g.tick(); // 4.1 s after the unanswered PING
  const waitReprobe = sent.length === n2;
  clock += 1000; g.tick(); // 5.1 s
  answer(sent[sent.length - 1].b);
  ok(waitReprobe && sent.length >= n2 + 1 && g.state === 'up' && same(changes, ['up', 'down', 'up']), 'down: re-asked 5 s after the last PING; a PONG brings the leg back UP (fail-back without a new session)');
  handlers.error(Object.assign(new Error('send ENOBUFS'), { code: 'ENOBUFS' }));
  ok(g.state === 'up' && g.facts().sendErrors === 1 && same(changes, ['up', 'down', 'up']), 'a socket error (a Mac\'s ENOBUFS under a burst) drops one datagram — counted, never a verdict: the leg stays UP', g.facts());
  g.close();
  // a fresh leg that never hears a PONG: DOWN 2 s after its first PING (the device link from the start)
  let c2 = 5e6; const s2 = [];
  const g2 = SH.createLeg({ port: HP, key: hubKey.toString('base64'), hosts: ['10.0.0.9'] }, { socket: { on() { }, send: (b) => s2.push(b), close() { } }, timer: false, now: () => c2 });
  for (let i = 0; i < 3; i++) { c2 += 500; g2.tick(); }
  const probing = g2.state;
  c2 += 600; g2.tick();
  ok(probing === 'probing' && s2.length === 4 && g2.state === 'down' && g2.why === 'no_echo', 'a leg that never hears a PONG: PINGs every 500 ms while probing, DOWN (no_echo) 2 s after the first — the device link carried it all along', { n: s2.length, state: g2.state });
  g2.close();
  // the firewall line + the verdicts
  ok(SM.firewallRuleCommand('C:\\Users\\me\\AppData\\Local\\vibespace\\node\\node.exe') === 'netsh advfirewall firewall add rule name="VibeSpace agent" dir=in action=allow program="C:\\Users\\me\\AppData\\Local\\vibespace\\node\\node.exe" protocol=UDP' && SM.firewallRuleCommand('C:\\Users\\张三\\node.exe') !== null, 'the admin line: netsh … program="<the agent\'s node.exe>" protocol=UDP (a non-ASCII user folder kept)');
  ok(['C:\\x"\\node.exe', 'C:\\a$b\\node.exe', 'C:\\%TEMP%\\node.exe', 'C:\\a;calc\\node.exe', 'C:\\a&b\\node.exe', '/usr/bin/node', 'C:\\node.cmd', '', null].every((x) => SM.firewallRuleCommand(x) === null), 'no line for a path a shell could act on (quote, $, %, ;, &), a non-Windows path or a non-.exe program');
  ok(same(SM.directInboundOf({ addrs: ['a', 'b'], reached: [] }), { verdict: 'blocked', addrs: 2, reached: 0 }) && SM.directInboundOf({ addrs: ['a'], reached: ['a'] }).verdict === 'open' && SM.directInboundOf({}).verdict === 'none', 'the direct-inbound verdict: blocked (none arrived) · open · none (no host address)');
  ok(SM.relayPathOf({ path: 'direct' }, { via: 'udp' }) === 'direct' && SM.relayPathOf({ path: 'relay' }, { via: 'udp' }) === 'udp' && SM.relayPathOf({ path: 'relay' }, { via: 'link' }) === 'link' && SM.relayPathOf({ path: 'relay' }, null) === 'relay' && SM.relayPathOf(null, { via: 'udp' }) === null, 'the strip\'s path: direct · udp · link · relay (the leg not heard yet)');
  const os = require('node:os');
  const mine = Object.values(os.networkInterfaces()).flat().filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal).map((a) => a.address);
  const pr = await SH.selfProbe([...mine, '127.0.0.1']);
  ok(mine.length ? pr.verdict === 'open' && pr.addrs === mine.length && pr.reached === mine.length : pr.verdict === 'none', `the self-probe on this box (no firewall in the way): ${pr.verdict} — ${pr.reached} of ${pr.addrs} host addresses reached in ${pr.ms} ms (loopback never counts)`, pr);
}

console.log('§14b THE PATH ELECTION (lane stream-leg-flap — the owner\'s Mac desktop went black 2026-10-20: the hub flipped leg ⇄ link 3× in 20 s)');
{
  const crypto = require('node:crypto');
  const macOf = (key) => (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, 16);
  // THE .330 RULE (the RED control): the hub forwards on the path the daemon LAST spoke on — a device-link frame or a PING
  // without UP leaves the leg, a PING flagged UP or leg DATA takes it back (src/server/desktop-webrtc.js at 2.369.330)
  const lastSpoke = (el, ev) => {
    const via = el && el.via === 'udp' ? 'udp' : 'link', keep = { via, aliveAt: (el && el.aliveAt) || 0, dataAt: (el && el.dataAt) || 0, changed: false, why: null };
    if (ev.type === 'up' || ev.type === 'data') return { ...keep, via: 'udp', aliveAt: ev.at, changed: via !== 'udp', why: ev.type === 'data' ? 'leg data' : 'leg up' };
    if (via === 'udp' && ev.type === 'link') return { ...keep, via: 'link', changed: true, why: 'the daemon spoke on the device link' };
    if (via === 'udp' && ev.type === 'quiet') return { ...keep, via: 'link', changed: true, why: 'the daemon hears no answer on its leg' };
    if (via === 'udp' && ev.type === 'judge' && ev.at - keep.aliveAt >= 35000) return { ...keep, via: 'link', changed: true, why: 'stale' };
    return keep;
  };
  const flapAgent = () => {
    const calls = []; const fwd = [];
    return { calls, fwd, _conn: null, status: () => ({ connected: true, info: { platform: 'darwin', capabilities: ['display-facts', 'stream-offer', 'input-events'] } }), desktopServe: async () => ({}),
      streamOffer: async (p) => { calls.push(['offer', p]); return { ok: true, sid: 'sid-F', offer: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }, source: { kind: 'fake', origin: { x: 0, y: 0 } }, relayPort: 4244, codec: { mimeType: 'video/H264' } }; },
      streamAnswer: async () => ({ ok: true }), streamStop: async () => ({ stopped: true }),
      tcpForward: async (port) => { const h = { port, written: [], write(b) { h.written.push(Buffer.from(b)); return true; }, close() { h.closed = true; } }; fwd.push(h); return h; } };
  };
  const waitFor = async (f) => { for (let i = 0; i < 300 && !f(); i++) await sleep(2); return f(); };
  /** THE FLAPPING FAKE DAEMON (the journal's Mac, 2 × 4K over a lossy leg): real loopback UDP for the leg and the browser, a
   *  stand-in device link, the hub on an injected clock in 250 ms steps. `plan(i)` = { leg: send leg DATA, link: send a
   *  device-link frame, ping: 'up' | 'quiet' | null }. → per step: the path that carried the browser's datagram to the daemon;
   *  the hub's «relay via» lines (step, text); what reached the browser. */
  async function flapRun(steps, plan, opts = {}) {
    let clock = 7e6, step = -1;
    const lines = [];
    const fa = flapAgent();
    const wr = DW.create({ access: ACC.create({ hosts: { get: (h) => ({ id: h, name: 'Mac' }), isLocal: () => false, deviceBounded: async () => fa, connectedDevice: () => fa }, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: { log() { }, warn() { } } }),
      log: { log: (m) => { if (/ relay via /.test(m)) lines.push([step, m]); }, warn() { } }, ips: () => ['127.0.0.1'], pollMaxMs: 120000, idleMs: 1e12, now: () => clock, ...opts });
    const s = await wr.start('mac-f');
    const spec = fa.calls[0][1].relayLeg, lmac = macOf(Buffer.from(spec.key, 'base64'));
    const dmn = dgram.createSocket('udp4'); await new Promise((r) => dmn.bind(0, '127.0.0.1', r));
    const br = dgram.createSocket('udp4'); await new Promise((r) => br.bind(0, '127.0.0.1', r));
    const path = []; let pongs = 0; const toBr = { leg: 0, link: 0 }; let linkSeen = 0;
    dmn.on('message', (m) => { const p = SM.legParse(new Uint8Array(m), lmac); if (p && p.type === 'pong') pongs++; else if (p && p.type === 'data' && p.payload[0] === 0xee) path[(p.payload[1] << 8) | p.payload[2]] = 'leg'; });
    br.on('message', (m) => { if (m[0] === 0xdd) toBr.leg++; else if (m[0] === 0xdc) toBr.link++; });
    const linkLanded = () => { const h = fa.fwd[0]; if (!h) return; for (; linkSeen < h.written.length; linkSeen++) { const u = SM.relayUnframe(new Uint8Array(h.written[linkSeen])); for (const f of u.frames) if (f.payload[0] === 0xee) path[(f.payload[1] << 8) | f.payload[2]] = 'link'; } };
    let counter = 0, sentLeg = 0, sentLink = 0;
    for (let i = 0; i < steps; i++) {
      step = i; clock += 250;
      const p = plan(i);
      br.send(Buffer.from([0xee, i >> 8, i & 255]), spec.port, '127.0.0.1'); // the browser's datagram (RTCP / STUN / input) first
      await waitFor(() => { linkLanded(); return path[i] !== undefined; });
      if (p.ping) { const want = pongs + 1; dmn.send(Buffer.from(SM.legControl(SM.LEG.PING, { flags: p.ping === 'up' ? SM.LEG.UP : 0, counter: ++counter, nonce: crypto.randomBytes(8), mac: lmac })), spec.port, '127.0.0.1'); await waitFor(() => pongs >= want); }
      if (p.leg) { sentLeg++; dmn.send(Buffer.from(SM.legData('127.0.0.1', br.address().port, new Uint8Array([0xdd, i >> 8, i & 255]))), spec.port, '127.0.0.1'); }
      if (p.link) { sentLink++; fa.fwd[0].onData(Buffer.from(SM.relayFrame('127.0.0.1', br.address().port, new Uint8Array([0xdc, i >> 8, i & 255])))); }
      await waitFor(() => toBr.leg === sentLeg && toBr.link === sentLink);
    }
    const facts = (await wr.poll(s.key, 0, -1, 0)).relay;
    await wr.stop(s.key); wr.shutdown(); dmn.close(); br.close();
    return { path, lines, toBr, sentLeg, sentLink, facts };
  }
  // the plan: 0 — the leg comes up (a PING, then one flagged UP); 1–79 (20 s) THE FLAP — the leg carries the picture (DATA every
  // step, a PING flagged UP every 2 s) and three times the daemon drops to its device link for 2.5 s (link frames; the first
  // step BOTH paths), then a PING not flagged UP and one flagged UP — the .330 daemon's one-lost-PONG round trip; 80–119 THE LEG
  // DIES (only the device link speaks); 120–159 THE LEG RETURNS (a PING flagged UP, DATA, PINGs every 2 s) while stale device-
  // link frames still arrive every third step
  const DOWN = [[16, 26], [40, 50], [64, 74]];
  const plan = (i) => {
    if (i === 0) return { leg: false, link: false, ping: 'quiet' };
    if (i < 80) {
      const w = DOWN.find(([a, b]) => i >= a && i < b);
      if (w) return { leg: i === w[0], link: true, ping: null };
      if (DOWN.some(([, b]) => i === b)) return { leg: false, link: false, ping: 'quiet' };
      return { leg: true, link: false, ping: i === 1 || DOWN.some(([, b]) => i === b + 1) || i % 8 === 0 ? 'up' : null };
    }
    if (i < 120) return { leg: false, link: true, ping: null };
    return { leg: true, link: i % 3 === 0, ping: i === 120 || i % 8 === 0 ? 'up' : null };
  };
  const A = await flapRun(160, plan);
  const B = await flapRun(80, plan, { elect: lastSpoke });
  const via = (r, a, b) => r.path.slice(a, b + 1);
  const count = (xs, v) => xs.filter((x) => x === v).length;
  const flapLines = (r) => r.lines.filter(([i]) => i >= 2 && i < 80);
  ok(B.lines.length >= 1 && flapLines(B).length >= 3 && count(via(B, 2, 79), 'link') >= 10, `RED CONTROL — the .330 rule (the path the daemon LAST spoke on) through the same hub: ${flapLines(B).length} «relay via» flips in 20 s after the election (≥ 3), ${count(via(B, 2, 79), 'link')} of the browser's 78 datagrams went over the device link`, B.lines.map(([i, m]) => `${i}: ${m.replace(/^.*relay via /, '')}`));
  ok(A.lines.length >= 1 && A.lines[0][0] === 1 && /udp leg 127\.0\.0\.1:\d+ \(leg up\)$/.test(A.lines[0][1]) && flapLines(A).length === 0 && count(via(A, 2, 79), 'leg') === 78, `THE FLAP ⇒ ONE election: the leg taken at its first PING flagged UP, then ${flapLines(A).length} flips in 20 s while the device link spoke three times and the daemon three times said it heard no answer — all 78 of the browser's datagrams rode the leg`, A.lines.map(([i, m]) => `${i}: ${m.replace(/^.*relay via /, '')}`));
  const died = A.lines.filter(([i]) => i >= 80 && i < 120), dieAt = 79 + SM.STREAM_LIMITS.legDeadMs / 250;
  ok(died.length === 1 && died[0][0] === dieAt && / the device link \(the leg was silent 6 s\)$/.test(died[0][1]) && count(via(A, 80, dieAt - 1), 'leg') === dieAt - 80 && count(via(A, dieAt, 119), 'link') === 120 - dieAt, `THE LEG DIES ⇒ the device link after the silence bound (legDeadMs ${SM.STREAM_LIMITS.legDeadMs} ms = 3 × the 2 s PING of a leg carrying the picture): the browser's datagrams rode the leg ${dieAt - 80} more steps, then the link — one change`, died);
  const back = A.lines.filter(([i]) => i >= 120);
  ok(back.length === 1 && back[0][0] === 120 && /\(leg up\)$/.test(back[0][1]) && count(via(A, 121, 159), 'leg') === 39 && A.lines.length === 3, 'THE LEG RETURNS ⇒ taken ONCE at its PING flagged UP; the stale device-link frames every third step change nothing — 3 changes in 40 s on the whole record', A.lines.map(([i, m]) => `${i}: ${m.replace(/^.*relay via /, '')}`));
  ok(A.toBr.leg === A.sentLeg && A.toBr.link === A.sentLink && A.sentLink > 50, `frames keep flowing: every datagram the daemon sent reached the browser — ${A.toBr.leg} over the leg, ${A.toBr.link} over the device link — whichever way the hub answers`, { toBr: A.toBr, sentLeg: A.sentLeg, sentLink: A.sentLink });
  ok(A.facts && A.facts.via === 'udp' && A.facts.leg.held >= 20 && A.facts.leg.quiet === 4, `the record: via udp; the device link spoke ${A.facts && A.facts.leg.held} times while the leg stayed elected (held), 4 PINGs not flagged UP (quiet) — counted, never obeyed`, A.facts && A.facts.leg);
}

console.log('§14c THE DAEMON\'S HYSTERESIS (lane stream-leg-flap — a lossy leg is not a dead one)');
{
  const crypto = require('node:crypto');
  const SH = require(path.join(REPO, 'src/agentd/stream-host.js'));
  const macOf = (key) => (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, 16);
  const HP = await deadPort();
  /** A minute of the picture on the leg (a datagram every 250 ms), every third PONG lost, one socket error at 25 s. */
  function lossyMinute(missMax) {
    let clock = 3e6; const sent = [], handlers = {}, changes = [];
    const sock = { on: (ev, f) => { handlers[ev] = f; }, send: (b, port, ip) => sent.push({ b: new Uint8Array(b), port, ip }), close() { }, address: () => ({ port: 1 }) };
    const key = crypto.randomBytes(32), hmac = macOf(key);
    const g = SH.createLeg({ port: HP, key: key.toString('base64'), hosts: ['10.0.0.9'] }, { socket: sock, timer: false, now: () => clock, onChange: (x) => changes.push(x.state), ...(missMax ? { missMax } : {}) });
    const answer = (pkt) => { const q = SM.legParse(pkt, hmac); handlers.message(Buffer.from(SM.legControl(SM.LEG.PONG, { counter: q.counter, nonce: q.nonce, mac: hmac })), { address: '10.0.0.9', port: HP }); };
    answer(sent[0].b);
    let pings = 0, onLeg = 0, offLeg = 0, seen = 1;
    for (let i = 0; i < 240; i++) {
      clock += 250;
      if (g.send('192.168.1.5', 50000, new Uint8Array([1]))) onLeg++; else offLeg++;
      if (i === 100) handlers.error(Object.assign(new Error('send ENOBUFS'), { code: 'ENOBUFS' }));
      g.tick();
      for (; seen < sent.length; seen++) { const p = SM.legParse(sent[seen].b, hmac); if (p && p.type === 'ping' && ++pings % 3 !== 0) answer(sent[seen].b); }
    }
    g.close();
    return { downs: changes.filter((c) => c === 'down').length, onLeg, offLeg, pings, facts: g.facts() };
  }
  const M = lossyMinute(1), S = lossyMinute(0);
  ok(M.downs >= 3 && M.offLeg > 0, `RED CONTROL — one miss = DOWN (the .330 daemon: missMax 1): ${M.downs} DOWNs in a minute of every third PONG lost, ${M.offLeg} of 240 datagrams went over the device link`, M.facts);
  ok(S.downs === 0 && S.offLeg === 0 && S.onLeg === 240 && S.facts.missed >= 10 && S.facts.misses <= 1 && S.facts.sendErrors === 1 && S.facts.state === 'up' && SM.STREAM_LIMITS.legMissMax === 3, `THE SAME LOSSY MINUTE (${S.facts.missed} of ${S.pings} PONGs lost, a socket error): the leg stays UP and carries all 240 datagrams — a miss is re-asked at once, three in a row never came`, S.facts);
}

console.log('§14d legElect (PURE) · THE STALL (lane stream-leg-flap): stallStep');
{
  const E = SM.legElect, D = SM.STREAM_LIMITS.legDeadMs, I = SM.STREAM_LIMITS.legStaleMs;
  const up = E({ via: 'link' }, { type: 'up', at: 1000 }), dat = E({ via: 'link' }, { type: 'data', at: 1000 });
  ok(up.via === 'udp' && up.changed && up.why === 'leg up' && dat.via === 'udp' && dat.why === 'leg data' && !E(up, { type: 'up', at: 1500 }).changed, 'the device link ⇒ the leg at its first sign of life (a PING flagged UP: «leg up», its DATA: «leg data»), ONCE — the next sign changes nothing');
  const carrying = E(E({ via: 'link' }, { type: 'data', at: 1000 }), { type: 'up', at: 3000 });
  const held = ['link', 'quiet'].map((t) => E(carrying, { type: t, at: 3100 }));
  ok(held.every((x) => x.via === 'udp' && !x.changed && x.aliveAt === 3000), 'the leg elected: the device link speaking and a PING not flagged UP leave it where it is (no sign of life either — the clock keeps 3000)');
  const j1 = E(carrying, { type: 'judge', at: 3000 + D - 1 }), j2 = E(carrying, { type: 'judge', at: 3000 + D });
  ok(D === 6000 && D === SM.STREAM_LIMITS.legMissMax * SM.STREAM_LIMITS.legLiveMs && !j1.changed && j2.via === 'link' && j2.changed && j2.why === 'the leg was silent 6 s', `a leg that carried the picture: dead after legDeadMs (${D} ms = legMissMax × legLiveMs: three of its PING periods) of silence — not a millisecond before`);
  const idle = E({ via: 'link' }, { type: 'up', at: 1000 });
  ok(!E(idle, { type: 'judge', at: 1000 + D }).changed && E(idle, { type: 'judge', at: 1000 + I }).via === 'link' && I > 2 * SM.STREAM_LIMITS.legKeepaliveMs, `an idle leg (PINGs every ${SM.STREAM_LIMITS.legKeepaliveMs / 1000} s, no DATA): never judged on the carrying bound — dead after legStaleMs (${I / 1000} s, two keepalives + 5 s)`);
  ok(['link', 'quiet', 'judge'].every((t) => !E({ via: 'link', aliveAt: 0 }, { type: t, at: 1e9 }).changed), 'on the device link: nothing but a sign of life on the leg changes the election');
  const T = SM.STREAM_LIMITS.stallMs;
  const s0 = SM.stallStep(null, { playing: true, pageFrames: 10, agentFrames: 100, now: 0 });
  const s1 = SM.stallStep(s0.w, { playing: true, pageFrames: 10, agentFrames: 400, now: T - 1 }), s2 = SM.stallStep(s0.w, { playing: true, pageFrames: 10, agentFrames: 460, now: T });
  ok(T === 12000 && !s1.stalled && s2.stalled && s2.ms === T, `a PLAYING picture that decoded nothing for stallMs (${T} ms) while the machine sent 360 pictures: STALLED — not a millisecond before`);
  const still = SM.stallStep(s0.w, { playing: true, pageFrames: 10, agentFrames: 100, now: T * 5 }), moved = SM.stallStep(s0.w, { playing: true, pageFrames: 11, agentFrames: 460, now: T - 1 });
  const after = SM.stallStep(moved.w, { playing: true, pageFrames: 11, agentFrames: 470, now: T + 50 });
  ok(!still.stalled && !moved.stalled && moved.w.at === T - 1 && !after.stalled, 'a still screen (the machine sent nothing either) never stalls; a decoded frame re-arms the watch (12 s from it)');
  const hid = SM.stallStep(s0.w, { playing: true, visible: false, pageFrames: 10, agentFrames: 460, now: T * 2 }), off = SM.stallStep(s0.w, { playing: false, pageFrames: 10, agentFrames: 460, now: T * 2 });
  const noAgent = SM.stallStep(SM.stallStep(null, { playing: true, pageFrames: 10, agentFrames: null, now: 0 }).w, { playing: true, pageFrames: 10, agentFrames: null, now: T * 2 });
  ok(!hid.stalled && hid.w.at === T * 2 && !off.stalled && off.w === null && !noAgent.stalled, 'a hidden page re-arms (a background tab is not judged); not playing = no watch; no machine numbers yet = never stalled');
}

console.log('§4b NEVER SILENT (lane stream-fallback-never-silent — incident inc-mvf7z2a3-9sxi): endingVerdict');
{
  const T = 5e6, V = (o) => SM.endingVerdict({ now: T, ...o });
  const a = V({ played: false }), b = V({ played: false, gone: true, named: true });
  ok(a.act === 'fallback' && b.act === 'fallback', 'never played ⇒ the rung\'s old answer (fallback: the VNC picture, a replayed window asks first) — before the first picture nothing changes');
  const r = V({ played: true }), m = V({ played: true, step: 1, at: T - 3000, gone: true, named: true }), k = V({ played: true, step: 1, at: T - 3000 }), k2 = V({ played: true, step: 1, at: T - 3000, gone: true, named: false }), k3 = V({ played: true, step: 2, at: T - 3000, gone: true, named: true }), k4 = V({ played: true, step: 3, at: T - 3000 });
  ok(r.act === 'retry' && r.step === 1 && r.at === T && m.act === 'main' && m.step === 2 && k.act === 'ask' && k2.act === 'ask' && k3.act === 'ask' && k4.act === 'ask', 'played ⇒ NEVER the VNC picture by itself: the same source again (retry), then — the display gone and the stream named one — the main display once, then the ask (重试 · 显示 VNC 画面); an ending of the main display or of any other code goes to the ask');
  const again = V({ played: true, step: 3, at: T - SM.NEVER_SILENT.windowMs }), near = V({ played: true, step: 3, at: T - SM.NEVER_SILENT.windowMs + 1 });
  ok(again.act === 'retry' && again.at === T && near.act === 'ask' && SM.NEVER_SILENT.retryMs === 1000, 'an ending a minute (NEVER_SILENT.windowMs) after the last retry starts the ladder again; the retry waits NEVER_SILENT.retryMs (1 s)');
  const acts = []; let st = { played: true, step: 0, at: 0 };
  for (const [now, gone] of [[T, false], [T + 2000, false], [T + 4000, false], [T + 6000, true]]) { const x = SM.endingVerdict({ ...st, now, gone, named: true }); acts.push(x.act); st = { played: true, step: x.step, at: x.at }; }
  ok(same(acts, ['retry', 'ask', 'ask', 'ask']) && !acts.includes('fallback'), 'a stream that keeps ending (the window carries step/at): retry once, then the ask every time — the verdict never answers fallback once a picture played', acts);
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
