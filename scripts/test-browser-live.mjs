#!/usr/bin/env node
// AGENT BROWSER P2 — THE LIVE VIEW (docs/design-agent-browser-v2.md §4.2 /
// §4.4 / §3.7; §9's `test-browser-live` row, heavy tier).
//
//   ① the PURE rules (src/browser-stream.js) over the REAL captured shapes
//      (scripts/fixtures/browser-stream/session-0.32.0.json — one real
//      session, the design's first P2 task): stream-status parsing incl. the
//      "already enabled" exit-1 that is NOT a failure, the target ladder
//      (named > default > only > first > ephemeral > no-browser), the viewer
//      verdicts (config aggregated, input refused TYPED in Watch mode), the
//      per-viewer frame gate, the VNC backpressure numbers, and the DPI
//      helper at zoom 1 / 0.8 / 1.25 (viewport px in, device px out);
//   ② the REAL bridge (src/server/browser-stream.js) on a real http server
//      over a FAKE upstream speaking the fixture: cookie auth only (401 with
//      no cookie, before the upgrade), two viewers on ONE upstream connection
//      (fan-out; a late viewer replayed status/tabs + the last frame), the
//      maxFps sent upstream = the MAX across viewers, an `input_mouse` refused
//      with `watch-mode`, a SLOW viewer gets frames DROPPED while the fast one
//      keeps them, the upstream PAUSED past the high-water mark and RESUMED
//      under the low-water one, the relay torn down when the last viewer
//      leaves, a typed status when the upstream dies, a typed refusal for a
//      remote session / an unknown session / a session with no browser;
//   ③ the WINDOW in headless chrome on a worktree server (a fake claude, a
//      fake agent-browser whose `stream status` names the fake upstream's
//      port): frames drawn, the URL/tabs panes, the switcher strip for a
//      session with TWO attachments (switching reconnects to the other
//      profile's port), the viewer count, the DPI pointer helper at 375×667
//      and under a non-1 `--ui-scale`;
//   ④ the REAL binary (agent-browser ≥ 0.32 + a chrome): one headless
//      chromium on a scratch profile, the real `stream status --json`, the
//      real bridge, one real JPEG frame at a viewer — SKIPs with evidence.
// Heavy: chrome + a worktree server + (optionally) a real chromium; free ports,
// per-pid scratch paths only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const S = require('../src/browser-stream.js');
const BS = require('../src/server/browser-stream.js');
const F = require('../src/browser-facts.js');
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;           // a REAL 1280×720 JPEG frame
const JPEG = FRAME.data;
const ROOT = scratch('browser-live');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set();
const worktrees = new Set();
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  fs.rmSync(ROOT, { recursive: true, force: true });
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
}
let fakeHome = null;
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the PURE rules over the captured 0.32.0 shapes');
{
  const st = S.parseStreamStatus(FIX.cli['stream status --json'].json);
  ok(st.ok && st.enabled && st.port === FIX.cli['stream status --json'].json.data.port, `stream status → enabled with the port (${st.port})`);
  const en = S.parseStreamStatus(FIX.cli['stream enable --json (already enabled)'].json);
  ok(en.ok && en.alreadyEnabled && !en.error, '`stream enable` on an enabled session (exit 1, "already enabled") is NOT a failure');
  const bad = S.parseStreamStatus(FIX.cli['stream status --json (no browser yet, config broken)'].json);
  ok(!bad.ok && /Chrome exited/.test(bad.error), 'a launch failure inside `stream status` is a failure with the CLI\'s own reason');
  ok(S.streamPlan(st).step === 'ready' && S.streamPlan({ ok: true, enabled: false, port: null }).step === 'enable' && S.streamPlan(bad).step === 'failed', 'streamPlan: ready / enable / failed');
  ok(!S.parseStreamStatus(null).ok && !S.parseStreamStatus({ success: true, data: { enabled: true, port: 70000 } }).enabled, 'no JSON / an impossible port ⇒ not enabled');
  for (const t of ['status', 'tabs', 'frame', 'command', 'result']) ok(S.classifyUpstream(FIX.server_to_client[t]) === (t === 'frame' ? 'frame' : 'ordered'), `fixture ${t} classified ${t === 'frame' ? 'frame (latest-wins)' : 'ordered'}`);
  ok(S.classifyUpstream({ type: 'something-new' }) === 'ordered' && S.classifyUpstream('x') === 'invalid' && S.classifyUpstream({}) === 'invalid', 'an unknown type is relayed ordered (a newer upstream is not silenced); a non-record is invalid');
  ok(FRAME.metadata.deviceWidth === 1280 && FRAME.metadata.deviceHeight === 720 && Buffer.from(JPEG, 'base64').slice(0, 3).toString('hex') === 'ffd8ff' && FRAME.seq === undefined, 'the captured frame is a real JPEG with device dimensions in `metadata` and NO seq (0.32.0)');
  ok(FIX.origin['http://example.com'].startsWith('403') && FIX.origin.absent === 'accepted' && S.originHeaderFor(39927) === 'http://127.0.0.1:39927', 'origin rule pinned: foreign 403, loopback/absent accepted; the bridge presents a loopback Origin');

  // the target ladder
  const profiles = [{ id: 'bp-00000001', label: 'Work', dir: '/tmp/vs-example/work' }, { id: 'bp-00000002', label: 'Personal', dir: '/tmp/vs-example/personal' }];
  const att = (id, alias, isDefault) => ({ profileId: id, alias, label: profiles.find((p) => p.id === id).label, isDefault });
  const two = { attachments: [att('bp-00000001', 'work', false), att('bp-00000002', 'personal', true)] };
  let t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: two, profileRef: 'work', profiles });
  ok(t.ok && t.kind === 'attachment' && t.chosen === 'named' && t.profileId === 'bp-00000001' && t.ns === 'vs-bp-00000001' && t.sessionName === 'vs-bk-0000000a' && t.dir === '/tmp/vs-example/work', 'a handle names the pane: namespace = the profile\'s, session = the lease\'s tab (vs-<browserKey>)');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: two, profileRef: 'bp-00000001', profiles });
  ok(t.ok && t.chosen === 'named' && t.alias === 'work', 'a profile id names it too');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: two, profiles });
  ok(t.ok && t.chosen === 'default' && t.profileId === 'bp-00000002', 'no handle ⇒ the DEFAULT attachment');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: { attachments: [att('bp-00000001', 'work', false), att('bp-00000002', 'personal', false)] }, profiles });
  ok(t.ok && t.chosen === 'first' && t.profileId === 'bp-00000001', 'two attachments and no default ⇒ the FIRST (a view is not a command: no profile_required for a window)');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: { attachments: [att('bp-00000002', 'personal', false)] }, profiles });
  ok(t.ok && t.chosen === 'only', 'one attachment ⇒ it');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: two, profileRef: 'nope', profiles });
  ok(!t.ok && t.code === 'not_attached' && t.handles.join(',') === 'work,personal [default]', 'an unknown handle ⇒ not_attached listing the handles with the default marked');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: { attachments: [] }, envPairs: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a', 'AGENT_BROWSER_CONFIG=/tmp/vs-example/cfg.json', 'HOME=/nope'] });
  ok(t.ok && t.kind === 'ephemeral' && t.ns === 'vs-bk-0000000a' && t.envPairs.length === 3 && !t.envPairs.some((p) => p.startsWith('HOME=')), 'no attachment ⇒ the session\'s EPHEMERAL browser under its own AGENT_BROWSER_* pairs (and only those)');
  t = S.streamTargetFor({ browserKey: 'bk-0000000a', set: { attachments: [] }, envPairs: [] });
  ok(!t.ok && t.code === 'no-browser', 'no attachment and no pairs (rung none / integration off) ⇒ no-browser, typed');
  ok(!S.streamTargetFor({ browserKey: '' }).ok && S.streamTargetFor({ browserKey: '' }).code === 'no-key', 'no browser key ⇒ no-key');
  ok(JSON.stringify(S.pairsToEnv(['A=1', 'B=x=y', 'bad'])) === '{"A":"1","B":"x=y"}', 'pairsToEnv keeps the first = only');

  // viewer verdicts
  const vv = (m, o) => S.viewerMessageVerdict(m, o);
  ok(vv({ type: 'config', maxFps: 3 }).kind === 'config' && vv({ type: 'config', maxFps: 3 }).maxFps === 3 && !vv({ type: 'config', maxFps: 3 }).forward, 'config is per-viewer, never forwarded as-is');
  ok(S.clampFps(0) === S.MAX_FPS_CAP && S.clampFps(999) === S.MAX_FPS_CAP && S.clampFps(-1) === S.MAX_FPS_DEFAULT && S.clampFps('x') === S.MAX_FPS_DEFAULT && S.clampFps(0.4) === 1, 'fps clamp: 0 = uncapped ⇒ the cap; garbage ⇒ the default; ≥1');
  ok(S.maxFpsAcross([{ maxFps: 3 }, { maxFps: 20 }, {}]) === 20 && S.maxFpsAcross([]) === S.MAX_FPS_DEFAULT, 'the upstream maxFps is the MAX across viewers (a viewer without one counts the default)');
  const inp = vv({ type: 'input_mouse', x: 1, y: 1 }, { holder: null, viewerId: 7, mode: 'watch' });
  ok(inp.kind === 'input' && !inp.forward && inp.refusal.type === 'refused' && inp.refusal.code === 'watch-mode', 'input in Watch mode ⇒ refused, TYPED watch-mode');
  ok(vv({ type: 'input_keyboard' }, { holder: 3, viewerId: 7, mode: 'takeover' }).refusal.code === 'watch-mode' && vv({ type: 'input_keyboard' }, { holder: 7, viewerId: 7, mode: 'takeover' }).forward === true, 'takeover: forwarded ONLY from the holder (the P3 seam)');
  ok(vv({ type: 'ack', seq: 4 }).kind === 'ack' && vv({ type: 'ping' }).kind === 'ping' && vv({ type: 'weird' }).refusal.code === 'unknown-type' && vv('x').refusal.code === 'bad-message', 'ack consumed, ping local, unknown/bad refused typed');

  // frame gate + backpressure
  const L = S.BACKPRESSURE;
  ok(L.pauseAbove === 8 * 1024 * 1024 && L.resumeBelow === 1024 * 1024, 'the VNC bridge\'s numbers: pause above 8 MiB, resume under 1 MiB');
  ok(S.frameGate({ maxFps: 10, lastFrameAt: 0, bufferedAmount: 0 }, 1000) && !S.frameGate({ maxFps: 10, lastFrameAt: 950, bufferedAmount: 0 }, 1000) && S.frameGate({ maxFps: 10, lastFrameAt: 900, bufferedAmount: 0 }, 1000), 'a viewer\'s own fps cap gates its frames');
  ok(!S.frameGate({ maxFps: 60, lastFrameAt: 0, bufferedAmount: L.resumeBelow + 1 }, 5000) && S.frameGate({ maxFps: 60, lastFrameAt: 0, bufferedAmount: L.resumeBelow - 1 }, 5000), 'a viewer with more than the low-water mark still queued gets the frame DROPPED (latest-wins per viewer); under it, sent');
  ok(S.backpressureVerdict([0, L.pauseAbove + 1], false).pause && !S.backpressureVerdict([0, L.pauseAbove - 1], false).pause, 'pause when ANY viewer is over the mark');
  ok(!S.backpressureVerdict([L.resumeBelow + 1, 0], true).resume && S.backpressureVerdict([L.resumeBelow - 1, 0], true).resume, 'resume only when EVERY viewer is under the low-water mark');

  // DPI: viewport px in, device px out — at three zooms
  for (const zoom of [1, 0.8, 1.25]) {
    // an element 640×360 LAYOUT px drawn under body zoom ⇒ its viewport rect is scaled
    const el = { left: 100 * zoom, top: 50 * zoom, width: 640 * zoom, height: 360 * zoom };
    const centre = S.pointerToDevice({ clientX: (100 + 320) * zoom, clientY: (50 + 180) * zoom, elRect: el, frameW: 1280, frameH: 720 });
    ok(centre && centre.x === 640 && centre.y === 360, `zoom ${zoom}: the element's centre maps to the frame's centre (640,360)`);
    const corner = S.pointerToDevice({ clientX: (100 + 640) * zoom, clientY: (50 + 360) * zoom, elRect: el, frameW: 1280, frameH: 720 });
    ok(corner && corner.x === 1280 && corner.y === 720, `zoom ${zoom}: the bottom-right corner maps to (1280,720)`);
  }
  {
    // letterboxing: a 16:9 frame in a 4:3 box is drawn with bars top and bottom
    const el = { left: 0, top: 0, width: 400, height: 300 };
    const r = S.drawnRect(el, 1280, 720);
    ok(Math.round(r.width) === 400 && Math.round(r.height) === 225 && Math.abs(r.top - 37.5) < 0.01 && r.left === 0, 'drawnRect letterboxes (object-fit: contain) — 400×225 with 37.5px bars');
    ok(S.pointerToDevice({ clientX: 200, clientY: 10, elRect: el, frameW: 1280, frameH: 720 }) === null, 'a pointer in the letterbox bar maps to nothing (null), never to a clamped edge');
    ok(S.pointerToDevice({ clientX: 200, clientY: 150, elRect: el, frameW: 1280, frameH: 720 }).y === 360, '…and a pointer in the picture maps through the drawn rect, not the element rect');
  }
  ok(S.liveTitle({ label: 'Work', sessionName: 'refactor' }) === 'Work · refactor' && S.liveTitle({ sessionName: 'x', ephemeralWord: 'eph' }) === 'eph · x', 'the title names the pane\'s profile, then the session');
  const h = S.hello({ viewers: 2, target: t, mode: 'watch' });
  ok(h.type === 'hello' && h.viewers === 2 && h.mode === 'watch' && h.target === null && h.protocol.frames === 'latest-wins', 'hello carries viewers / mode / the target (null for a refused one) / the protocol');
}

// ═══ ② the REAL bridge over a FAKE upstream ══════════════════════════════
console.log('— ② the real bridge on a real http server, a fake upstream speaking the fixture');
/** A fake agent-browser stream server: the fixture's status + tabs on connect,
 *  then frames on demand (`blast(n, bytes)`) or on a timer; refuses a foreign
 *  Origin with 403 like the real one; records every config it receives. */
async function fakeUpstream({ fps = 0 } = {}) {
  const port = await freePort();
  const configs = [];
  const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1', verifyClient: (info, cb) => { const o = info.origin || ''; if (o && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(o)) cb(false, 403, 'Forbidden'); else cb(true); } });
  await new Promise((r) => wss.on('listening', r));
  const frameMsg = (pad = 0) => JSON.stringify({ ...FRAME, data: pad ? JPEG + 'A'.repeat(pad) : JPEG, metadata: { ...FRAME.metadata, timestamp: Date.now() } });
  let timer = null;
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(FIX.server_to_client.tabs));
    ws.send(JSON.stringify({ type: 'url', url: 'https://example.com/first', timestamp: Date.now() }));
    ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'config') configs.push(m); } catch { } });
    ws.on('close', () => clients.delete(ws));
  });
  if (fps) { timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(frameMsg()); }, 1000 / fps); }
  return {
    port, configs, clients,
    blast(n, pad = 0) { for (let i = 0; i < n; i++) for (const c of clients) if (c.readyState === 1 && c.bufferedAmount < 64 * 1024 * 1024) c.send(frameMsg(pad)); },
    send(obj) { for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify(obj)); },
    close() { if (timer) clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); },
  };
}
/** A viewer: the real `ws` client against the bridge, collecting messages. */
function viewer(port, q, { cookie = 'vs=1', pauseAfterOpen = false } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/browser/stream?${q}`, { headers: cookie ? { Cookie: cookie } : {}, maxPayload: 64 * 1024 * 1024 });
  const v = { ws, msgs: [], frames: 0, closed: null, status: null, opened: false };
  ws.on('open', () => { v.opened = true; if (pauseAfterOpen) ws.pause(); });
  ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'frame') v.frames++; else v.msgs.push(m); } catch { } });
  ws.on('close', (code) => { v.closed = code; });
  ws.on('unexpected-response', (_r, res) => { v.status = res.statusCode; });
  ws.on('error', () => { });
  v.byType = (t) => v.msgs.filter((m) => m.type === t);
  v.until = (pred, ms = 3000) => until(() => pred(v), ms);
  return v;
}
{
  const up = await fakeUpstream();
  const activeSessions = new Map();
  const set = { attachments: [{ profileId: 'bp-00000001', alias: 'work', label: 'Work', isDefault: true }, { profileId: 'bp-00000002', alias: 'personal', label: 'Personal', isDefault: false }] };
  const profiles = [{ id: 'bp-00000001', label: 'Work', dir: path.join(ROOT, 'w') }, { id: 'bp-00000002', label: 'Personal', dir: path.join(ROOT, 'p') }];
  const asked = [];
  const keeper = { setFor: () => set, list: () => ({ profiles }), streamPortFor: async (t) => { asked.push(t); await sleep(30); return t.profileId === 'bp-00000002' ? { ok: false, port: null, code: 'launch_failed', error: 'personal would not launch (fake)' } : { ok: true, port: up.port }; } };
  activeSessions.set('sess-1', { _browserKey: 'bk-0000000a', name: 'one' });
  activeSessions.set('sess-remote', { _browserKey: 'bk-0000000b', host: 'h1' });
  activeSessions.set('sess-nokey', {});
  const LIM = { pauseAbove: 256 * 1024, resumeBelow: 32 * 1024 };
  const bridge = BS.create({ keeper, activeSessions, requestAuthed: (req) => /(^|; )vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } }, limits: LIM });
  const srv = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => { if ((req.url || '').split('?')[0] === '/api/browser/stream') bridge.handleUpgrade(req, socket, head); else socket.destroy(); });
  const PORT = await freePort();
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

  // auth first, before the upgrade
  const noCookie = viewer(PORT, 'session=sess-1', { cookie: '' });
  await until(() => noCookie.status !== null || noCookie.closed !== null, 3000);
  ok(noCookie.status === 401 && !noCookie.opened, 'no cookie ⇒ 401 before the upgrade (never a socket that opens then dies)');

  // one viewer
  const a = viewer(PORT, 'session=sess-1');
  await a.until((v) => v.byType('status').some((m) => m.state === 'upstream-open'), 4000);
  const hello = a.byType('hello')[0];
  ok(hello && hello.viewers === 1 && hello.mode === 'watch' && hello.target.kind === 'attachment' && hello.target.profileId === 'bp-00000001' && hello.target.chosen === 'default', 'hello names the default attachment as the target, Watch mode, 1 viewer');
  ok(asked.length === 1 && asked[0].sessionName === 'vs-bk-0000000a' && asked[0].ns === 'vs-bp-00000001', 'the keeper was asked for the port ONCE, under the lease\'s session name in the profile\'s namespace');
  await a.until((v) => v.byType('tabs').length && v.byType('url').length, 3000);
  ok(a.byType('status').some((m) => m.connected === true && m.viewportWidth === 1280) && a.byType('tabs')[0].tabs[0].tabId === 't1' && a.byType('url')[0].url === 'https://example.com/first', 'the upstream status / tabs / url reach the viewer verbatim');
  ok(up.configs.length >= 1 && up.configs[up.configs.length - 1].maxFps === S.MAX_FPS_DEFAULT, `the bridge sent upstream config maxFps = the default (${S.MAX_FPS_DEFAULT}) on open`);
  up.blast(1);
  await a.until((v) => v.frames >= 1, 2000);
  ok(a.frames === 1, 'a frame reaches the viewer');

  // a second viewer on the SAME upstream connection: replay + fan-out
  const b = viewer(PORT, 'session=sess-1&profile=work');
  await b.until((v) => v.frames >= 1 && v.byType('tabs').length, 3000);
  ok(up.clients.size === 1 && asked.length === 1, 'the second viewer shares the ONE upstream connection (no second port ask, no second upstream client)');
  ok(b.frames === 1 && b.byType('tabs').length === 1 && b.byType('url').length === 1 && b.byType('hello')[0].viewers === 2, 'the late viewer is replayed the last status/tabs/url AND the last frame at once; its hello counts 2');
  await a.until((v) => v.byType('viewers').some((m) => m.n === 2), 2000);
  ok(a.byType('viewers').some((m) => m.n === 2), 'the first viewer hears the viewer count rise to 2');
  await sleep(120);                                            // past both viewers' fps gate (default 15 ⇒ 67 ms)
  up.blast(1);
  await until(() => a.frames === 2 && b.frames === 2, 2000);
  ok(a.frames === 2 && b.frames === 2, 'a new frame fans out to both');

  // maxFps: the max across viewers goes upstream
  const before = up.configs.length;
  a.ws.send(JSON.stringify({ type: 'config', maxFps: 30 }));
  await until(() => up.configs.length > before, 2000);
  ok(up.configs[up.configs.length - 1].maxFps === 30, 'viewer A asks 30 ⇒ upstream gets max(30, default 15) = 30');
  const before2 = up.configs.length;
  b.ws.send(JSON.stringify({ type: 'config', maxFps: 5 }));
  await b.until((v) => v.byType('config-ack').length, 2000);
  ok(up.configs.length === before2 && b.byType('config-ack')[0].maxFps === 5, 'viewer B asks 5 ⇒ nothing new upstream (30 is still the max); B is acked its own 5');
  const before3 = up.configs.length;
  a.ws.send(JSON.stringify({ type: 'config', maxFps: 2 }));
  await until(() => up.configs.length > before3, 2000);
  ok(up.configs[up.configs.length - 1].maxFps === 5, 'viewer A drops to 2 ⇒ upstream re-sent max(2, 5) = 5');

  // input refused, typed
  a.ws.send(JSON.stringify({ type: 'input_mouse', x: 1, y: 2, action: 'move' }));
  await a.until((v) => v.byType('refused').length, 2000);
  ok(a.byType('refused')[0].code === 'watch-mode' && a.byType('refused')[0].mode === 'watch', 'input_mouse in Watch mode ⇒ a typed watch-mode refusal to that viewer');
  a.ws.send('not json');
  await a.until((v) => v.byType('refused').length >= 2, 2000);
  ok(a.byType('refused')[1].code === 'bad-message', 'non-JSON ⇒ bad-message, typed');

  // per-viewer drop, THEN upstream backpressure — two mechanisms, two marks.
  // B pauses its socket; the loopback kernel buffers absorb the first few MB
  // before B's server-side bufferedAmount rises at all, so each phase blasts
  // ~50 KB frames every 20 ms (inside nobody's fps gate) until its own
  // condition holds.
  a.ws.send(JSON.stringify({ type: 'config', maxFps: 0 })); b.ws.send(JSON.stringify({ type: 'config', maxFps: 0 }));
  await sleep(50);
  b.ws.pause();
  const aBefore = a.frames;
  // phase 1: B climbs past the LOW-water mark (32 KiB) ⇒ frames are DROPPED for B, A keeps them, nothing pauses
  let blasted = 0, bStat = null;
  while (blasted < 800 && !((bStat = bridge.stats()[0]?.viewers.find((v) => v.id === 2)) && bStat.dropped > 0)) { up.blast(1, 40 * 1024); blasted++; await sleep(20); }
  const st0 = bridge.stats()[0];
  ok(bStat && bStat.dropped > 0 && bStat.bufferedAmount > LIM.resumeBelow, `the slow viewer gets frames DROPPED once it has more than ${LIM.resumeBelow} bytes queued (B: ${bStat && bStat.bufferedAmount} queued, ${bStat && bStat.dropped} dropped after ${blasted} frames)`);
  ok(st0 && st0.paused === false, 'and the upstream is NOT paused for that — one slow tab does not stall the others');
  ok(a.frames > aBefore, `the fast viewer kept receiving (${a.frames - aBefore} frames) while the slow one was dropped`);
  // phase 2: ORDERED records are never dropped (every viewer must see every
  // one), so a burst of big `console` records is the path a slow viewer's
  // queue really grows on — past the HIGH-water mark ⇒ the upstream PAUSES
  const aCons = a.byType('console').length;
  let st1 = null; blasted = 0;
  while (blasted < 200 && !(st1 = bridge.stats()[0])?.paused) { up.send({ type: 'console', level: 'log', text: 'x'.repeat(64 * 1024), timestamp: Date.now() }); blasted++; await sleep(20); }
  st1 = bridge.stats()[0]; bStat = st1 && st1.viewers.find((v) => v.id === 2);
  ok(st1 && st1.paused === true && bStat && bStat.bufferedAmount > LIM.pauseAbove, `the upstream is PAUSED once a viewer buffers past ${LIM.pauseAbove} bytes of ORDERED records (B: ${bStat && bStat.bufferedAmount} after ${blasted} console records)`);
  ok(a.byType('console').length > aCons, 'the fast viewer received the ordered records up to the pause');
  b.ws.resume();
  await until(() => !bridge.stats()[0]?.paused, 6000);
  ok(bridge.stats()[0] && bridge.stats()[0].paused === false, 'the upstream is RESUMED once every viewer drains under the low-water mark');
  up.blast(1);
  await until(() => b.frames > 2, 3000);
  ok(b.frames > 2, 'and frames flow to the slow viewer again');

  // a remote session, an unknown one, a session with no browser, a refused port
  const r1 = viewer(PORT, 'session=sess-remote'); await r1.until((v) => v.closed !== null, 3000);
  ok(r1.byType('status')[0]?.code === 'unsupported-host' && r1.closed === 1008, 'a REMOTE session is refused by name (unsupported-host) with a typed status before the close');
  const r2 = viewer(PORT, 'session=nope'); await r2.until((v) => v.closed !== null, 3000);
  ok(r2.byType('status')[0]?.code === 'not-found', 'an unknown session ⇒ not-found, typed');
  const r3 = viewer(PORT, 'session=sess-nokey'); await r3.until((v) => v.closed !== null, 3000);
  ok(r3.byType('status')[0]?.code === 'no-key', 'a session without a browser key ⇒ no-key, typed');
  const r4 = viewer(PORT, 'session=sess-1&profile=personal'); await r4.until((v) => v.closed !== null, 4000);
  ok(r4.byType('status').some((m) => m.code === 'launch_failed' && /would not launch/.test(m.error)) && r4.closed === 1011, 'a target whose browser cannot start ⇒ the keeper\'s own code + reason, then close 1011');
  const r5 = viewer(PORT, 'session=sess-1&profile=nope'); await r5.until((v) => v.closed !== null, 3000);
  ok(r5.byType('status')[0]?.code === 'not_attached' && r5.byType('status')[0].handles.length === 2, 'an unknown handle ⇒ not_attached listing the handles');

  // teardown: the last viewer leaving closes the upstream; the upstream dying tells the viewers
  b.ws.close(); await until(() => a.byType('viewers').some((m) => m.n === 1), 2000);
  ok(a.byType('viewers').some((m) => m.n === 1) && up.clients.size === 1, 'one viewer left ⇒ count 1, the upstream stays');
  a.ws.close(); await until(() => up.clients.size === 0, 3000);
  ok(up.clients.size === 0 && bridge.stats().length === 0, 'the last viewer leaving closes the upstream and forgets the relay');
  const c = viewer(PORT, 'session=sess-1');
  await c.until((v) => v.byType('status').some((m) => m.state === 'upstream-open'), 4000);
  ok(up.clients.size === 1, 'a new viewer reconnects a fresh upstream');
  for (const cl of up.clients) cl.terminate();
  await c.until((v) => v.closed !== null, 3000);
  ok(c.byType('status').some((m) => m.state === 'upstream-closed') && c.closed === 1001, 'the upstream dying ⇒ a typed upstream-closed status, then close 1001');
  // the session ending closes its relays with a reason
  const d = viewer(PORT, 'session=sess-1');
  await d.until((v) => v.byType('status').some((m) => m.state === 'upstream-open'), 4000);
  bridge.closeForSession('sess-1', 'the session ended');
  await d.until((v) => v.closed !== null, 3000);
  ok(d.byType('status').some((m) => m.state === 'ended' && /session ended/.test(m.error)) && bridge.viewerCount('sess-1') === 0, 'closeForSession ⇒ every viewer told why, then closed');
  bridge.shutdown();
  await up.close();
  srv.close();
}

// ═══ ③ headless chrome: the WINDOW on a worktree server ═══════════════════
console.log('— ③ the browser-live window in headless chrome (worktree server, fake claude + fake agent-browser)');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — the window leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  const upA = await fakeUpstream({ fps: 4 }), upB = await fakeUpstream({ fps: 4 });
  fakeHome = scratchHome('browser-live-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  // the fake claude: prints the real CLI's first two lines (a hook line + the init frame) then sleeps
  const SID = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });
  // the fake agent-browser: the P1 suites' shape + `stream status --json` naming the fake upstream of THIS namespace
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
const ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8'));
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { fs.appendFileSync(path.join(st, 'stream.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, profile: process.env.AGENT_BROWSER_PROFILE || null }) + '\\n'); const port = ports[ns] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  const booted = await until(() => journal.includes('Ready.'), 40000, 100);
  if (!ok(booted, 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  // two profiles, their fake namespaces → the two fake upstreams
  const work = (await j('POST', '/api/browser/profiles', { label: 'Work' })).json.profile;
  const pers = (await j('POST', '/api/browser/profiles', { label: 'Personal' })).json.profile;
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ ['vs-' + work.id]: upA.port, ['vs-' + pers.id]: upB.port }));
  // a live session through the real ws create (chat mode: the fake claude's stdout is parsed)
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'live-one' }));
  await until(() => msgs.some((m) => m.type === 'created'), 15000);
  const created = msgs.find((m) => m.type === 'created');
  if (!ok(created && created.sessionId, 'a chat session was created', journal.slice(-600))) return;
  const sessionId = created.sessionId;
  await sleep(1500);
  let att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Work' });
  ok(att.status === 200 && att.json.lease, 'attached Work', JSON.stringify(att.json).slice(0, 300));
  att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Personal' });
  ok(att.status === 200 && att.json.attachments.length === 2, 'attached Personal — the session holds TWO attachments');
  try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { }
  await j('POST', '/api/browser/pin', { sessionId, profile: 'Work' });
  // pin Work ⇒ the default; the strip shows both

  // headless chrome
  const chromeLog = [];
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  chrome.stderr.on('data', (d) => { if (chromeLog.length < 40) chromeLog.push(d.toString()); });
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target', chromeLog.join('').slice(0, 800))) return;
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => cdp.on('open', r));
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ready = await until(() => false, 0) || await (async () => { for (let i = 0; i < 120; i++) { try { if (await evaluate('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch { } await sleep(250); } return false; })();
  if (!ok(ready, 'the app booted in headless chrome')) return;
  await evaluate('window.app.ready');
  await evaluate('window.app.refreshBrowserProfiles()');
  const opened = await evaluate(`(() => { const w = window.app.openBrowserLive({ sessionId: ${JSON.stringify(sessionId)} }); return !!(w && w._browserLive); })()`);
  ok(opened, 'app.openBrowserLive({sessionId}) opens a browser-live window');
  const q = (js) => evaluate(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); const L = w && w._browserLive; ${js} })()`);
  const drawn = await (async () => { for (let i = 0; i < 60; i++) { if (await q('return !!(L && L.state().frames >= 1 && L.img().naturalWidth === 1280)')) return true; await sleep(200); } return false; })();
  ok(drawn, 'frames are DRAWN (the <img> decoded the 1280×720 JPEG through the cookie-authed bridge)');
  const st = await q('return L.state()');
  ok(st.target && st.target.profileId === work.id && st.target.chosen === 'default' && st.mode === 'watch', 'the pane shows the DEFAULT (pinned) attachment, Watch mode', JSON.stringify(st).slice(0, 300));
  ok(st.url === 'https://example.com/first' && st.tabs.length === 1 && st.tabs[0].tabId === 't1', 'the URL line and the tab list are filled from the stream');
  ok(await q("return L.el().querySelector('.browser-live-url').textContent.includes('example.com/first') && L.el().querySelectorAll('.browser-live-tab').length === 1"), 'the URL pane and the tabs pane render them (text, escaped)');
  ok(await q("return L.el().querySelectorAll('.browser-live-strip-tab').length === 2 && L.el().querySelector('.browser-live-strip-tab.active').textContent.trim().startsWith('Work')"), 'a session with TWO attachments grows the switcher strip: two tabs, Work active');
  const title = await q('return w.element.querySelector(".window-title")?.textContent || w.title || ""');
  ok(/Work/.test(title), `the title names the profile of the pane you are looking at (${JSON.stringify(title).slice(0, 60)})`);
  ok(await q("return getComputedStyle(L.el().querySelector('.browser-live-canvas')).zoom !== undefined"), 'the picture container carries the counter-zoom rule (zoom is a live CSS property)');
  // DPI pointer helper: at ui-scale 1 and 0.8, the image centre maps to (640,360)
  for (const scale of [1, 0.8]) {
    const r = await q(`document.documentElement.style.setProperty('--ui-scale', '${scale}'); document.body.style.zoom = '${scale}'; const img = L.img(); const rect = img.getBoundingClientRect(); const p = L.pointerAt({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }); document.body.style.zoom = ''; document.documentElement.style.removeProperty('--ui-scale'); return { p, w: rect.width };`);
    ok(r.p && r.p.x === 640 && r.p.y === 360, `ui-scale ${scale}: the picture's centre maps to device (640,360) (rect width ${Math.round(r.w)})`);
  }
  // a second viewer (a second window in the same page) ⇒ viewer count 2
  await evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sessionId)}, profileId: ${JSON.stringify(work.id)} })`);
  const two = await (async () => { for (let i = 0; i < 40; i++) { if (await q('return L.state().viewers === 2')) return true; await sleep(200); } return false; })();
  ok(two && upA.clients.size === 1, 'a second window on the same target is a second VIEWER on the ONE upstream connection (viewers = 2)');
  // switch the strip to Personal ⇒ reconnects to the other profile's port
  await q("L.el().querySelectorAll('.browser-live-strip-tab')[1].click(); return true;");
  const switched = await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return L.state().target && L.state().target.profileId === ${JSON.stringify(pers.id)} && L.state().frames >= 1`)) return true; await sleep(200); } return false; })();
  ok(switched && upB.clients.size === 1, 'clicking the strip\'s other tab reconnects the SAME window to the other profile\'s stream');
  const streamLog = fs.readFileSync(path.join(AB_STATE, 'stream.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(streamLog.every((l) => l.session === 'vs-' + created.browserKey || l.session === null || /^vs-bk-/.test(l.session)) && streamLog.some((l) => l.ns === 'vs-' + pers.id), 'the port was asked under the lease\'s session name in each profile\'s namespace');
  // openSpec replay: the window's spec names the action and the target
  const spec = await q('return w._openSpec || w.openSpec || null');
  ok(spec && spec.action === 'openBrowserLive' && spec.sessionId === sessionId, 'the window carries openSpec {action: openBrowserLive, sessionId} for layout replay', JSON.stringify(spec));
  // 375×667: a PHONE load (metrics set BEFORE the page boots — the window
  // manager lays windows out at boot, an emulation change after the fact
  // re-lays out nothing): the window opens full-screen, the strip fits the
  // viewport and the picture is still drawn
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?m=1` });
  const readyM = await (async () => { for (let i = 0; i < 120; i++) { try { if (await evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]); })()')) return true; } catch { } await sleep(250); } return false; })();
  if (ok(readyM, 'the app booted at 375×667')) {
    await evaluate('window.app.refreshBrowserProfiles()');
    await evaluate(`(() => { const w = window.app.openBrowserLive({ sessionId: ${JSON.stringify(sessionId)} }); return !!(w && w._browserLive); })()`);
    const drawnM = await (async () => { for (let i = 0; i < 60; i++) { if (await q('return !!(L && L.state().frames >= 1 && L.img().getBoundingClientRect().width > 0)')) return true; await sleep(200); } return false; })();
    ok(drawnM, 'at 375×667 the picture is drawn');
    ok(await q("const s = L.el().querySelector('.browser-live-strip'); const r = s && s.getBoundingClientRect(); return !!r && r.width > 0 && r.right <= 375.5 && L.el().querySelectorAll('.browser-live-strip-tab').length === 2"), 'at 375×667 the two-tab strip fits inside the viewport');
    ok(await q("const bar = L.el().querySelector('.browser-live-bar'); return bar.getBoundingClientRect().right <= 375.5"), 'at 375×667 the bar does not overflow the viewport');
  }
  try { cdp.close(); } catch { }
  try { chrome.kill('SIGKILL'); } catch { }
  await j('POST', `/api/browser/profiles/${work.id}/stop`); await j('POST', `/api/browser/profiles/${pers.id}/stop`);
  try { wsMain.close(); } catch { }
  await upA.close(); await upB.close();
  srv.kill('SIGKILL');
})().catch((e) => ok(false, 'the window leg threw', e && (e.stack || e.message)));

// ═══ ④ the REAL binary ═══════════════════════════════════════════════════
console.log('— ④ the real agent-browser: one headless chromium, the real stream server, the real bridge');
{
  let ver = null; try { ver = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { }
  const CHROME_ANY = CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  if (!ver) skip('agent-browser is not on PATH');
  else if (!/\b0\.(3[2-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(ver)) skip(`agent-browser ${ver} is below 0.32 — no stream server`);
  else if (!CHROME_ANY) skip('no chrome on this box for a real headless chromium');
  else await (async () => {
    const D = path.join(ROOT, 'real'); fs.mkdirSync(path.join(D, 'prof'), { recursive: true, mode: 0o700 }); fs.mkdirSync(path.join(D, 'sock'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(D, 'cfg.json'), JSON.stringify({ headed: false, args: '--no-sandbox,--disable-blink-features=AutomationControlled' }));
    const ns = 'vs-bk-' + crypto.randomBytes(4).toString('hex');
    const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_')) env[k] = v;
    const extraEnv = { AGENT_BROWSER_CONFIG: path.join(D, 'cfg.json'), AGENT_BROWSER_HEADED: '0', AGENT_BROWSER_SOCKET_DIR: path.join(D, 'sock') };
    const rt = F.createBrowserRuntime({ env, log: null });
    const launched = await rt.launch(ns, { dir: path.join(D, 'prof'), idleMs: 120000, headed: false, url: 'data:text/html,<title>live</title><h1>live</h1>', timeout: 90000 });
    // the runtime's launch merges its own pairs; the config must ride too
    const lr = launched.ok ? launched : await new Promise((r) => { const { execFile } = require('child_process'); execFile('agent-browser', ['open', 'data:text/html,<title>live</title><h1>live</h1>'], { env: { ...env, AGENT_BROWSER_SESSION: ns, AGENT_BROWSER_NAMESPACE: ns, AGENT_BROWSER_PROFILE: path.join(D, 'prof'), AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1', ...extraEnv }, timeout: 90000, encoding: 'utf8' }, (err, stdout, stderr) => r({ ok: !err, stdout, stderr })); });
    if (!lr.ok) { skip(`the real chromium did not launch here: ${String(lr.stderr || lr.stdout || lr.error || '').slice(0, 200)}`); return; }
    try {
      const port = await rt.streamPort(ns, { dir: path.join(D, 'prof'), session: ns, extraEnv });
      // THE LAUNCH SHAPE IS EVIDENCE (2026-09-21): on a box whose chromium exits before
      // DevToolsActivePort (exit 21 here — the sandbox/driver situation of the machine,
      // not the bridge under test) this leg SKIPs with the vendor's own words, as the
      // ci.mjs row promises; a stream server that answered without a port still FAILS
      if (!port.ok && /exited early|DevToolsActivePort|crash|exit code/i.test(String(port.error || ''))) { skip(`the real stream server's chromium did not launch on this box: ${String(port.error || '').replace(/\s+/g, ' ').slice(0, 180)}`); return; }
      if (!ok(port.ok && port.port, `the real stream port came back (${JSON.stringify(port).slice(0, 120)})`)) return;
      const activeSessions = new Map([['sess-real', { _browserKey: ns.slice(3) }]]);
      const keeper = { setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }), streamPortFor: async () => ({ ok: true, port: port.port }) };
      // no attachment ⇒ the ephemeral target needs pairs; hand the session its pairs
      activeSessions.get('sess-real')._browserEnv = [`AGENT_BROWSER_SESSION=${ns}`, `AGENT_BROWSER_NAMESPACE=${ns}`];
      const bridge = BS.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn() { }, log() { } } });
      const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
      srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
      const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
      const v = viewer(P, 'session=sess-real');
      await v.until((x) => x.frames >= 1, 15000);
      ok(v.frames >= 1 && v.byType('status').some((m) => m.viewportWidth > 0) && v.byType('tabs').length >= 1, `a REAL frame, status and tabs reached the viewer through the real bridge (${v.frames} frame(s))`);
      ok(v.byType('hello')[0]?.target?.kind === 'ephemeral', 'the target was the session\'s own (ephemeral) browser');
      bridge.shutdown(); srv.close();
    } finally { await rt.closeAll(ns, { dir: path.join(D, 'prof') }).catch(() => { }); }
  })().catch((e) => ok(false, 'the real-binary leg threw', e && (e.stack || e.message)));
}

done();
