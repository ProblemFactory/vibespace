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
//   ③b LANE H (2026-09-25 — the owner watched an agent's ephemeral browser
//      start and saw nothing): a chat session with NO attachment, its chat
//      window open; the session's first `vibespace-browser open <url>` (the
//      SHIPPED CLI, as the agent) ⇒ within 5 s a `browser-live` window is BORN
//      beside the chat in ONE split chain (silently), streaming THAT browser
//      (EPHEMERAL_REF); the recorder's viewer-less tap files the navigation
//      under data/browser-trace/ephemeral and the tool card's Browser actions
//      row shows its thumbnail; the status chip and the session card say
//      "Agent browser · (ephemeral) <session>"; the browser stopping greys the
//      view (`browser_stopped`, never a relaunch by the view) and its next
//      verb reconnects it. CONTROL: the same server with a keeper copy whose
//      holder rows drop the ephemeral ⇒ no window, no trace, no card chip.
//   ④ lane P verify: the REAL binary + the REAL keeper — a live view of a conversation with no browser
//      yet starts nothing (session info stays inactive; the as-shipped `stream status` spawning a daemon is
//      the live control); then the REAL binary (agent-browser ≥ 0.32 + a chrome): one headless
//      chromium on a scratch profile, the real `stream status --json`, the
//      real bridge, one real JPEG frame at a viewer — SKIPs with evidence;
//   ⑤ lane J (inc-muhgv0fb-9i4u "接管浏览器的时候鼠标操作位置不对"): the REAL
//      rung end to end — a session's own ephemeral browser (headless, and
//      HEADED on its own 2560×1440 Xvfb: the owner's shape) opened by the real
//      `vibespace-browser open`, the live view in chrome as the owner's client
//      (1920×963, DPR 2/1, UI scale 100/125 %, the window 1400×800 and 700×900),
//      Take over, a real click where grid cell (10,5) is DRAWN lands on page
//      (525,275) within 2 px (the page reports it); the CONTROL is the pre-fix
//      belief ("the metadata IS the frame") in a patched copy, through the same
//      socket — 71 px headless, 132 px or dropped headed; then a new tab and a
//      `set viewport` re-read; the leg reaps the daemons it started.
//   ⑥ lane J r2 (the 2026-09-25 naive-user study, three operators: typed text
//      vanished or landed in the CHAT COMPOSER — "tomsmithtomsmith…", a password
//      one Enter from sent — an approval queued before a takeover ran a stale
//      step, a click that reached nothing looked like a frozen picture, the
//      picture sat between dark bands): on the same real rung — the fake claude
//      queues a browser `click` approval at spawn, the FIRST takeover answers it
//      stale (the CLI's stdin receives a deny naming browser_paused) and the
//      chat card says why; the picture's band above measured in PIXELS (0 px;
//      the pre-fix centred CSS as the control: > 100 px); a click on a form
//      input ripples at the page point it reached and the bar echoes it; the
//      chat window is ATTACHED (session-lifecycle's chatView.focus) and its
//      composer focused by hand, then "tomsmith", an IME commit and a paste are
//      typed into the client ⇒ the PAGE's input holds all of it and the
//      composer is empty; the CONTROL is the same client rebuilt with the
//      keyboard owner neutered (one edit, esbuild in the leg's worktree) ⇒ the
//      composer gets "tomsmith" and the page gets nothing.
// Heavy: chrome + a worktree server + (optionally) a real chromium; free ports,
// per-pid scratch paths only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
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
const FRAME = FIX.server_to_client.frame;           // a REAL 0.32.0 frame: a 1280×577 JPEG under a 1280×720 metadata claim (lane J)
const JPEG = FRAME.data;
const ROOT = scratch('browser-live');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set();
const worktrees = new Set();
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // ③'s session outlives the SIGKILLed server by design (dtach master + wrapper + the fake claude's `sleep`): end every
  // process whose environment or cwd names this suite's root — the scratch reaper found them after every run (lane H verify r1)
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { if (Number(d) === process.pid) continue; try { const cwd = fs.readlinkSync(`/proc/${d}/cwd`); if (cwd.startsWith(ROOT + '/') || fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(ROOT + '/')) process.kill(Number(d), 'SIGKILL'); } catch { /* not ours / gone */ } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  fs.rmSync(ROOT, { recursive: true, force: true });
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
  for (const h of extraHomes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } }
}
let fakeHome = null;
const extraHomes = [];
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
/** The REAL agent-browser daemons a leg started outlive `close --all` (children gone, the daemon stays — 90 of them were
 *  found alive from earlier runs): killed by their OWN environment's session name — evidence, never a process name. */
function reapDaemons(sessionNames, { cwdUnder = null } = {}) {
  const killed = [];
  let pids = []; try { pids = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)); } catch { return killed; }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    let envs = ''; try { envs = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
    const m = /(?:^|\0)AGENT_BROWSER_SESSION=([^\0]*)/.exec(envs);
    // a browser the daemon started carries none of its env — it carries the cwd of whoever launched the daemon: the suite's
    // OWN worktree server (`cwdUnder`), so that is the second piece of evidence
    let cwd = ''; if (cwdUnder) { try { cwd = fs.readlinkSync(`/proc/${pid}/cwd`).replace(/ \(deleted\)$/, ''); } catch { } }
    if ((m && sessionNames.has(m[1])) || (cwdUnder && (cwd === cwdUnder || cwd.startsWith(cwdUnder + '/')))) { try { process.kill(Number(pid), 'SIGKILL'); killed.push(Number(pid)); } catch { } }
  }
  // a SIGKILL is asynchronous: wait (bounded) until they are gone, so a dying GPU process writes nothing into a dir we remove next
  const t0 = Date.now();
  while (killed.some((p) => fs.existsSync(`/proc/${p}`)) && Date.now() - t0 < 3000) { const x = Date.now(); while (Date.now() - x < 25) { /* spin */ } }
  return killed;
}
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
  { const js = S.jpegSize(JPEG); ok(js && js.width === 1280 && js.height === 577 && FRAME.metadata.timestamp === 0, `lane J: the captured JPEG itself is ${js && js.width}×${js && js.height} while its metadata claims 1280×720 (timestamp 0 — synthesized by the stream server): the metadata is not the picture`); }
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
  // NAIVE STUDY 2 (2026-09-25) — the pure halves of findings 2, 3 and 4, each with a mutant-copy control below
  {
    const V = [{ id: 'win-blive-s1', sessionId: 's1', profileRef: S.EPHEMERAL_REF, connected: true }, { id: 'w-x', sessionId: 's2', profileRef: 'work', connected: false }];
    const p1 = S.liveViewPlan({ views: V, sessionId: 's1' }), p2 = S.liveViewPlan({ views: V, sessionId: 's2' }), p3 = S.liveViewPlan({ views: V, sessionId: 's2', profileId: 'personal' }), p4 = S.liveViewPlan({ views: V, sessionId: 's3' }), p5 = S.liveViewPlan({ views: V, sessionId: 's1', syncId: 'restored-7' });
    ok(p1.act === 'focus' && p1.id === 'win-blive-s1' && !p1.switchTo && !p1.reconnect && p2.act === 'focus' && p2.reconnect === true && p3.act === 'focus' && p3.switchTo === 'personal' && !p3.reconnect && p4.act === 'create' && p4.syncId === 'win-blive-s3' && p5.act === 'create' && p5.syncId === 'restored-7', 'finding 2: a MANUAL open FOCUSES the session\'s existing view (switching its pane when another is asked, reconnecting it when down); none ⇒ ONE new window under the auto-bind\'s id win-blive-<session>; a replay\'s own syncId is left alone', JSON.stringify({ p1, p2, p3, p4, p5 }));
    const dig = { browsers: { 'bp-00000001': { state: 'ready' }, 'bp-00000002': { state: 'stopped' } }, ephemerals: [{ browserKey: 'bk-0000000a', state: 'ready' }, { browserKey: 'bk-0000000b', state: 'stopped' }] };
    ok(S.viewTargetRunning({ target: { kind: 'attachment', profileId: 'bp-00000001' }, digest: dig }) === true && S.viewTargetRunning({ target: { kind: 'attachment', profileId: 'bp-00000002' }, digest: dig }) === false && S.viewTargetRunning({ target: { kind: 'ephemeral', ns: 'vs-bk-0000000a' }, digest: dig }) === true && S.viewTargetRunning({ target: { kind: 'ephemeral', ns: 'vs-bk-0000000b' }, digest: dig }) === false && S.viewTargetRunning({ target: null, digest: dig }) === null, 'finding 3: a STOPPED view resumes only when the digest says ITS browser runs again (a view never starts one)');
    const ht = S.hello({ target: S.streamTargetFor({ browserKey: 'bk-0000000a', envPairs: ['AGENT_BROWSER_SESSION=vs-bk-0000000a'], profileRef: S.EPHEMERAL_REF }) });
    ok(ht.target && ht.target.ns === 'vs-bk-0000000a', 'the hello names the target\'s namespace (what a stopped ephemeral view waits for)');
    const ck = S.childRefFor('bk-0000000a.2');
    const tc = S.streamTargetFor({ browserKey: 'bk-0000000a', profileRef: ck, childPairs: ['AGENT_BROWSER_SESSION=vs-bk-0000000a.2', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a.2'] });
    ok(tc.ok && tc.kind === 'ephemeral' && tc.child === true && tc.browserKey === 'bk-0000000a.2' && tc.ns === 'vs-bk-0000000a.2' && tc.envPairs.length === 2 && S.streamTargetFor({ browserKey: 'bk-0000000a', profileRef: ck }).code === 'no-browser' && S.streamTargetFor({ browserKey: 'bk-0000000b', profileRef: ck, childPairs: ['AGENT_BROWSER_SESSION=x'] }).code === 'not_attached' && S.childKeyOfRef('~child:bk-0000000a.x') === null, 'finding 4: `~child:<key>` names a SUB-AGENT\'s browser only with its own pairs (the recorder\'s tap); no pairs (a viewer) ⇒ no-browser; another conversation\'s child ⇒ not_attached');
    // controls: the pre-fix rules in patched copies of the PURE module
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MS = mutantCopies('browser-live-pure', repo);
    const ssrc = fs.readFileSync(path.join(repo, 'src/browser-stream.js'), 'utf8');
    const m1 = ssrc.replace("  if (syncId) return { act: 'create', syncId };", "  return { act: 'create', syncId: syncId || null };");
    const m2 = ssrc.replace("  if (String(profileRef || '').startsWith(CHILD_REF_PREFIX)) {", "  if (false) {");
    const S1 = m1 !== ssrc ? MS.load('src/browser-stream.js', m1, 'open-new') : null, S2 = m2 !== ssrc ? MS.load('src/browser-stream.js', m2, 'no-child') : null;
    ok(S1 && S1.liveViewPlan({ views: V, sessionId: 's1' }).act === 'create', 'CONTROL: the pre-fix open (every click creates a window) in a patched copy ⇒ the focus leg goes red');
    ok(S2 && S2.streamTargetFor({ browserKey: 'bk-0000000a', profileRef: ck, childPairs: ['AGENT_BROWSER_SESSION=vs-bk-0000000a.2'] }).child !== true, 'CONTROL: a copy without the child ref resolves `~child:` to something else (not the helper\'s browser) ⇒ the finding-4 leg goes red');
    const { copiesCensus } = await import('./mutant-copy.mjs');
    for (const r of copiesCensus(MS.files, MS.dir, repo, { minCopies: 2, label: '① naive study 2 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
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
  ok(b.byType('status').some((m) => m.state === 'upstream-open'), 'the late viewer is told the upstream is ALREADY open (2.369.180: lane H\'s recorder taps a relay before any view joins; lane J\'s keyboard ownership reads `connected` off this record)');
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

/** The fake agent-browser the chrome legs share (③ and ③b): the P1 suites' shape, `stream status --json` naming
 *  the fake upstream of THIS namespace (ports.json), `open` of any url (logged to opens.log — lane H reads it). */
const FAKE_AB_SOURCE = () => `#!${process.execPath}
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
`;

// ═══ ②b MULTIVIEW §4 (B-89d0): a HELPER's browser is watchable — a child relay over the fake upstream ═══
console.log('— ②b MULTIVIEW: a helper\'s browser through the real bridge (its OWN pairs, its OWN takeover key, a picture)');
{
  const upKid = await fakeUpstream(), upOwn = await fakeUpstream();
  const bk = 'bk-0000000c', kid = bk + '.1';
  const parentPairs = [`AGENT_BROWSER_SESSION=vs-${bk}`, `AGENT_BROWSER_NAMESPACE=vs-${bk}`];
  const kidPairs = [`AGENT_BROWSER_SESSION=vs-${kid}`, `AGENT_BROWSER_NAMESPACE=vs-${kid}`];
  const asked = [], inputs = [], viewersNoted = [];
  const keeper = {
    setFor: () => ({ attachments: [], children: [{ handle: kid, since: 1 }], handles: [] }), list: () => ({ profiles: [] }),
    pairsForKey: (h) => (h === kid ? kidPairs : null),
    streamPortFor: async (t) => { asked.push(t); return t.kind === 'child' ? { ok: true, port: upKid.port } : t.kind === 'ephemeral' ? { ok: true, port: upOwn.port } : { ok: false, code: 'x', error: 'x' }; },
    takeover: ({ browserKey, profileId, viewerId }) => { inputs.push({ browserKey, profileId, viewerId }); return { ok: true, state: { input: 'user', takenAt: Date.now(), takenBy: { viewerId } } }; },
    noteViewers: (bkey, pid, n) => viewersNoted.push({ bkey, pid, n }),
  };
  const activeSessions = new Map([['sess-k', { _browserKey: bk, _browserEnv: parentPairs, name: 'kids' }]]);
  const bridge = BS.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn() { }, log() { } } });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
  const vk = viewer(P, `session=sess-k&profile=${encodeURIComponent(kid)}`);
  await vk.until((v) => v.byType('status').some((m) => m.state === 'upstream-open'), 4000);
  upKid.blast(1);
  await vk.until((v) => v.frames >= 1, 3000);
  const hk = vk.byType('hello')[0];
  ok(hk && hk.target && hk.target.kind === 'child' && hk.target.handle === kid && vk.frames >= 1 && upKid.clients.size === 1 && upOwn.clients.size === 0, 'a viewer asking for the helper\'s handle gets hello kind:"child" and the HELPER\'s picture (its upstream, not the parent\'s)', JSON.stringify(hk && hk.target));
  ok(asked.length === 1 && asked[0].kind === 'child' && asked[0].ns === 'vs-' + kid && !('envPairs' in asked[0]), 'the keeper is asked for the CHILD target (ns vs-<handle>), which carries no pairs of the parent');
  const rel = bridge._relays.get('sess-k|child:' + kid);
  ok(rel && rel.browserKey === kid && JSON.stringify(rel.envPairs) === JSON.stringify(kidPairs), 'the relay answers under the helper\'s OWN recorded pairs, keyed on its handle (never the parent\'s pairs)', rel && JSON.stringify({ bk: rel.browserKey, pairs: rel.envPairs }));
  vk.ws.send(JSON.stringify({ type: 'takeover' }));
  await vk.until((v) => v.byType('mode-ack').length || v.byType('mode').length, 2000);
  ok(inputs.length === 1 && inputs[0].browserKey === kid && inputs[0].profileId === null, 'a takeover of the helper\'s browser asks the keeper under the HELPER\'s key (it pauses the helper — never the parent)', JSON.stringify(inputs));
  ok(viewersNoted.some((x) => x.bkey === kid && x.n === 1), 'the bridge tells the keeper a live view WATCHES the helper\'s browser (so it is not released under the user)');
  const vo = viewer(P, 'session=sess-k');
  await vo.until((v) => v.byType('status').some((m) => m.state === 'upstream-open'), 4000);
  ok(vo.byType('hello')[0]?.target?.kind === 'ephemeral' && upOwn.clients.size === 1 && bridge._relays.size === 2, 'the parent\'s own browser is a SEPARATE relay beside it (two targets, two upstreams)');
  vk.ws.close(); vo.ws.close();
  await until(() => bridge._relays.size === 0, 3000);
  ok(viewersNoted.some((x) => x.bkey === kid && x.n === 0), 'the last viewer leaving tells the keeper nobody watches any more');
  bridge.shutdown(); srv.close(); await upKid.close(); await upOwn.close();
}

// ═══ ③ headless chrome: the WINDOW on a worktree server ═══════════════════
console.log('— ③ the browser-live window in headless chrome (worktree server, fake claude + fake agent-browser)');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — the window leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  const upA = await fakeUpstream({ fps: 4 }), upB = await fakeUpstream({ fps: 4 });
  // MULTIVIEW: the session's OWN browser and its helper's, each on its own fake upstream
  const upC = await fakeUpstream({ fps: 4 }), upD = await fakeUpstream({ fps: 4 });
  fakeHome = scratchHome('browser-live-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  // the fake claude: prints the real CLI's first two lines (a hook line + the init frame) then sleeps
  const SID = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });
  // the fake agent-browser: the P1 suites' shape + `stream status --json` naming the fake upstream of THIS namespace
  fs.writeFileSync(path.join(BIN, 'agent-browser'), FAKE_AB_SOURCE(), { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  // MULTIVIEW (design-browser-multiview §2 A1 / §4): BEFORE the attachments, the agent's first page verb records the
  // session's OWN ephemeral browser and a helper mints a child handle and browses in ITS own — through the real agent
  // routes with the session's own token (read from its meta). The conversation's cap is raised to 6 through the real
  // route first (the default 3 would refuse the fourth, by design).
  const metaDir = path.join(wt, 'data', 'session-meta');
  const metaAll = () => { const out = []; try { for (const f of fs.readdirSync(metaDir)) { try { out.push(JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'))); } catch { } } } catch { } return out; };
  // the session's own meta names its webui id + its browser key + its agent token
  const meta = await (async () => { for (let i = 0; i < 40; i++) { const m = metaAll().find((x) => x.agentToken && x.browserKey && (x.webuiId === sessionId || x.id === sessionId || metaAll().length === 1)); if (m) return m; await sleep(150); } return null; })();
  const bk = (meta && meta.browserKey) || created.browserKey;
  if (!meta) console.log('    (debug) session-meta: ' + JSON.stringify(metaAll().map((m) => Object.keys(m).filter((k) => k !== 'agentToken'))).slice(0, 600));
  const TOKEN = meta && meta.agentToken;
  const aj = async (p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body || {}) }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const KID1 = bk + '.1';
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ ['vs-' + work.id]: upA.port, ['vs-' + pers.id]: upB.port, ['vs-' + bk]: upC.port, ['vs-' + KID1]: upD.port }));
  const capR = await j('POST', '/api/browser/cap', { sessionId, cap: 6 });
  ok(capR.status === 200 && capR.json.cap === 6 && capR.json.origin === 'conversation', 'MULTIVIEW D4: the conversation\'s own browser cap is raised to 6 through POST /api/browser/cap', JSON.stringify(capR.json).slice(0, 200));
  const own = TOKEN ? await aj('/api/agent/browser/resolve', { argv: ['snapshot'] }) : { status: 0, json: null };
  ok(!!TOKEN && own.status === 200 && own.json.kind === 'ephemeral', 'MULTIVIEW: the agent\'s first page verb records the session\'s OWN browser (kind ephemeral)', JSON.stringify(own.json || meta).slice(0, 300));
  const nc = TOKEN ? await aj('/api/agent/browser/new-child', {}) : { json: null };
  const kidR = TOKEN ? await aj('/api/agent/browser/resolve', { handle: KID1, argv: ['snapshot'] }) : { status: 0, json: null };
  ok(nc.json && nc.json.handle === KID1 && kidR.status === 200 && kidR.json.kind === 'child', 'MULTIVIEW: a helper mints its handle and browses in ITS OWN browser', JSON.stringify(kidR.json || nc.json).slice(0, 300));
  let att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Work' });
  ok(att.status === 200 && att.json.lease, 'attached Work', JSON.stringify(att.json).slice(0, 300));
  att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Personal' });
  ok(att.status === 200 && att.json.attachments.length === 2, 'attached Personal — the session holds TWO attachments');
  try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { }
  // lane L r5 F1 (b) — THE KEEPER'S FRAME: the server runs from the worktree (its checkout); every daemon its keeper
  // launched (the fake `open`'s detached child, which keeps the cwd it was started in — as the real daemon does) runs
  // in the runtime's private directory, never the checkout (r4: the server's WorkingDirectory, so a relative
  // `pdf ./data/bin/vibespace-hook.mjs` landed in the checkout)
  {
    let dpids = []; try { dpids = fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n').map(Number).filter(Boolean); } catch { }
    const cwds = dpids.map((pid) => { try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; } });
    const wtReal = fs.realpathSync(wt);
    ok(dpids.length >= 1 && cwds.every((c) => c && c === F.runDir().dir && c !== wtReal && !c.startsWith(wtReal + '/') && !wtReal.startsWith(c + '/')), `lane L r5 F1(b): the worktree server's KEEPER launched ${dpids.length} daemon(s), each running in the private directory (${[...new Set(cwds)].join(', ')}) — never its checkout ${wtReal}`, JSON.stringify({ dpids, cwds }));
  }
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
  // MULTIVIEW §2 A1: the strip lists EVERY browser of the session — two attachments, its own, its helper's
  const stripOk = await (async () => { for (let i = 0; i < 40; i++) { if (await q("return L.el().querySelectorAll('.browser-live-strip-tab').length === 4")) return true; await sleep(150); } return false; })();
  const stripRows = await q("return [...L.el().querySelectorAll('.browser-live-strip-tab')].map((b) => ({ ref: b.dataset.ref, kind: b.dataset.kind, text: b.textContent.trim(), active: b.classList.contains('active') }))");
  ok(stripOk && stripRows.map((r) => r.kind).join() === 'attachment,attachment,ephemeral,child' && stripRows[0].active && stripRows[0].text.startsWith('Work') && /^This session/.test(stripRows[2].text) && /Helper 1/.test(stripRows[3].text) && stripRows[3].ref === KID1, 'MULTIVIEW: the strip shows FOUR tabs — Work (default, active), Personal, this conversation\'s own browser, Helper 1 (no witness from a fake claude ⇒ numbered)', JSON.stringify(stripRows));
  ok(await q("return /\\d\\/6/.test(L.el().querySelector('.browser-live-strip-cap').textContent)"), 'MULTIVIEW D4: the own/cap chip reads N/6 (the conversation\'s raised cap)');
  const title = await q('return w.element.querySelector(".window-title")?.textContent || w.title || ""');
  ok(/Work/.test(title), `the title names the profile of the pane you are looking at (${JSON.stringify(title).slice(0, 60)})`);
  ok(await q("return getComputedStyle(L.el().querySelector('.browser-live-canvas')).zoom !== undefined"), 'the picture container carries the counter-zoom rule (zoom is a live CSS property)');
  // DPI pointer helper: at ui-scale 1 and 0.8, the image centre maps to the PAGE's centre. The fixture's frame is the
  // real 0.32.0 capture — a 1280×577 JPEG under a 1280×720 metadata claim (lane J: the page is 1280×577; the fake
  // upstream has no CDP to read, so the view maps by the picture 1:1) ⇒ (640, 289), never the claim's (640, 360)
  for (const scale of [1, 0.8]) {
    const r = await q(`document.documentElement.style.setProperty('--ui-scale', '${scale}'); document.body.style.zoom = '${scale}'; const img = L.img(); const rect = img.getBoundingClientRect(); const d = L.drawn(); const p = L.pointerAt({ clientX: d.left + d.width / 2, clientY: d.top + d.height / 2 }); document.body.style.zoom = ''; document.documentElement.style.removeProperty('--ui-scale'); return { p, w: rect.width, g: L.geometry() };`); // lane J r2: the DRAWN picture's centre (top-aligned — no longer the element's centre)
    ok(r.p && r.p.x === 640 && r.p.y === 289 && r.g.source === 'picture', `ui-scale ${scale}: the picture's centre maps to the page's centre (640,289) — the picture's 1280×577, not the metadata's 1280×720 (rect width ${Math.round(r.w)}, geometry ${r.g && r.g.source})`, JSON.stringify(r));
  }
  // a second viewer (a second window in the same page) ⇒ viewer count 2 — opened the way a layout REPLAY / another client's
  // window is (an explicit syncId): a MANUAL open now goes to the session's existing view (naive study 2, finding 2)
  await evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sessionId)}, profileId: ${JSON.stringify(work.id)}, syncId: 'win-blive-second-viewer' })`);
  const two = await (async () => { for (let i = 0; i < 40; i++) { if (await q('return L.state().viewers === 2')) return true; await sleep(200); } return false; })();
  ok(two && upA.clients.size === 1, 'a second window on the same target is a second VIEWER on the ONE upstream connection (viewers = 2)');
  // switch the strip to Personal ⇒ reconnects to the other profile's port
  await q("L.el().querySelectorAll('.browser-live-strip-tab')[1].click(); return true;");
  const switched = await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return L.state().target && L.state().target.profileId === ${JSON.stringify(pers.id)} && L.state().frames >= 1`)) return true; await sleep(200); } return false; })();
  ok(switched && upB.clients.size === 1, 'clicking the strip\'s other tab reconnects the SAME window to the other profile\'s stream');
  // MULTIVIEW: the helper's tab shows the HELPER's picture (its own upstream), then back to Personal
  await q(`[...L.el().querySelectorAll('.browser-live-strip-tab')].find((b) => b.dataset.ref === ${JSON.stringify(KID1)}).click(); return true;`);
  const onKid = await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return L.state().target && L.state().target.kind === 'child' && L.state().target.handle === ${JSON.stringify(KID1)} && L.state().frames >= 1`)) return true; await sleep(200); } return false; })();
  ok(onKid && upD.clients.size === 1, 'MULTIVIEW §4: clicking Helper 1 shows the HELPER\'s picture — its own upstream (a helper\'s browser is watchable)');
  await q(`[...L.el().querySelectorAll('.browser-live-strip-tab')].find((b) => b.dataset.profileId === ${JSON.stringify(pers.id)}).click(); return true;`);
  await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return L.state().target && L.state().target.profileId === ${JSON.stringify(pers.id)} && L.state().connected`)) return; await sleep(200); } })();
  // MULTIVIEW §2 (a): a NEW browser mid-TAKEOVER is a new tab at the tail — never a switch of the pane you drive
  await q("L.send({ type: 'takeover' }); return true;");
  const taking = await (async () => { for (let i = 0; i < 40; i++) { if (await q('return L.state().mode === "takeover" && L.state().mine')) return true; await sleep(150); } return false; })();
  ok(taking, 'MULTIVIEW: the user takes over Personal in this window');
  await q('window.__vsWs0 = L.ws(); return true;');
  const nc2 = await aj('/api/agent/browser/new-child', {});
  let kid2 = await aj('/api/agent/browser/resolve', { handle: nc2.json && nc2.json.handle, argv: ['snapshot'] });
  if (kid2.status === 409 && kid2.json && kid2.json.code === 'profile_changed') kid2 = await aj('/api/agent/browser/resolve', { handle: nc2.json && nc2.json.handle, argv: ['snapshot'] }); // the user's attaches moved the set: told once
  ok(nc2.json && nc2.json.handle === bk + '.2' && kid2.status === 200 && kid2.json.kind === 'child', 'MULTIVIEW: meanwhile a SECOND helper starts its own browser', JSON.stringify(kid2.json).slice(0, 200));
  const grew = await (async () => { for (let i = 0; i < 50; i++) { if (await q("return L.el().querySelectorAll('.browser-live-strip-tab').length === 5")) return true; await sleep(150); } return false; })();
  const after = await q(`return { refs: [...L.el().querySelectorAll('.browser-live-strip-tab')].map((b) => b.dataset.ref), target: L.state().target && L.state().target.profileId, mode: L.state().mode, mine: L.state().mine, sameWs: L.ws() === window.__vsWs0, active: L.el().querySelector('.browser-live-strip-tab.active')?.dataset.ref }`);
  ok(grew && after.refs[4] === bk + '.2' && after.target === pers.id && after.active === pers.id && after.mode === 'takeover' && after.mine && after.sameWs, 'MULTIVIEW: the new helper\'s browser is a NEW TAB AT THE TAIL — the pane you drive stays Personal, still yours, on the SAME socket (never switched, never reconnected)', JSON.stringify(after));
  await q("L.send({ type: 'handback' }); return true;");
  await (async () => { for (let i = 0; i < 40; i++) { if (await q('return L.state().mode === "watch"')) return; await sleep(150); } })();
  // lane P verify (finding 1, 2026-09-26): a click on a HOLLOW attachment tab never starts its browser — P2's "viewing a
  // held lease starts it" launched a Chromium nobody asked for. Stop Personal (its row turns hollow), watch Work, click
  // Personal: no `open` reaches the binary, the keeper never asks its stream port, the view reads Released; the next
  // command on it (an attach) starts it and the view picks it up by itself.
  {
    const pidsNow = () => { try { return fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
    const streamAsks = () => { try { return fs.readFileSync(path.join(AB_STATE, 'stream.log'), 'utf8').trim().split('\n').filter((l) => l.includes('"vs-' + pers.id + '"')).length; } catch { return 0; } };
    await q(`[...L.el().querySelectorAll('.browser-live-strip-tab')].find((b) => b.dataset.profileId === ${JSON.stringify(work.id)}).click(); return true;`);
    await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return L.state().target && L.state().target.profileId === ${JSON.stringify(work.id)} && L.state().connected`)) return; await sleep(200); } })();
    const stopR = await j('POST', `/api/browser/profiles/${pers.id}/stop`);
    const hollow = await (async () => { for (let i = 0; i < 50; i++) { const v = await q(`const b = [...L.el().querySelectorAll('.browser-live-strip-tab')].find((x) => x.dataset.profileId === ${JSON.stringify(pers.id)}); return b ? { released: b.classList.contains('state-released'), title: b.title } : null;`); if (v && v.released) return v; await sleep(150); } return null; })();
    ok(stopR.status === 200 && hollow && /Released — the next command starts it again/.test(hollow.title), 'lane P verify: Personal stopped ⇒ its tab is HOLLOW ("Released — the next command starts it again")', JSON.stringify({ stop: stopR.status, hollow }));
    const p0 = pidsNow(), s0 = streamAsks();
    await q(`[...L.el().querySelectorAll('.browser-live-strip-tab')].find((b) => b.dataset.profileId === ${JSON.stringify(pers.id)}).click(); return true;`);
    const rel = await (async () => { for (let i = 0; i < 50; i++) { const v = await q('const s = L.state(); return { released: s.released, status: s.statusText, profileId: s.target && s.target.profileId };'); if (v && v.released) return v; await sleep(150); } return null; })();
    await sleep(600);
    ok(rel && rel.released && /Released — the next command starts it again/.test(rel.status || '') && pidsNow() === p0 && streamAsks() === s0, 'lane P verify: a CLICK on the hollow attachment tab starts nothing — no `open` reached the binary, no stream port was asked for it, the view reads Released', JSON.stringify({ rel, opens: pidsNow() - p0, asks: streamAsks() - s0 }));
    const re = await j('POST', '/api/browser/attach', { sessionId, profile: 'Personal' });
    try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { }
    const picked = await (async () => { for (let i = 0; i < 60; i++) { if (await q(`return !L.state().released && L.state().target && L.state().target.profileId === ${JSON.stringify(pers.id)} && L.state().connected`)) return true; await sleep(200); } return false; })();
    ok(re.status === 200 && pidsNow() === p0 + 1 && picked, 'lane P verify: the next command on it (an attach) starts it — ONE open — and the view picks it up by itself', JSON.stringify({ attach: re.status, opens: pidsNow() - p0 }));
  }
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
    const phoneStrip = await (async () => { for (let i = 0; i < 40; i++) { const v = await q("const s = L.el().querySelector('.browser-live-strip'); const r = s && s.getBoundingClientRect(); const tabs = [...L.el().querySelectorAll('.browser-live-strip-tab')]; const shown = tabs.filter((b) => b.style.display !== 'none'); const more = L.el().querySelector('.browser-live-strip-more'); return { ok: !!r && r.width > 0 && r.right <= 375.5 && tabs.length === 5 && shown.every((b) => b.getBoundingClientRect().right <= r.right + 0.5), shown: shown.length, folded: L.state().stripFolded.length, more: more && more.style.display !== 'none' ? more.textContent : null, current: L.state().currentRef, shownRefs: shown.map((b) => b.dataset.ref) };"); if (v && v.ok && v.folded > 0) return v; await sleep(150); } return null; })();
    ok(phoneStrip && phoneStrip.folded > 0 && phoneStrip.more === '▾+' + phoneStrip.folded && phoneStrip.shownRefs.includes(phoneStrip.current), 'at 375×667 the five-tab strip FOLDS into ▾+N inside the viewport — the tab you look at stays', JSON.stringify(phoneStrip));
    ok(await q("const bar = L.el().querySelector('.browser-live-bar'); return bar.getBoundingClientRect().right <= 375.5"), 'at 375×667 the bar does not overflow the viewport');
  }
  try { cdp.close(); } catch { }
  try { chrome.kill('SIGKILL'); } catch { }
  await j('POST', `/api/browser/profiles/${work.id}/stop`); await j('POST', `/api/browser/profiles/${pers.id}/stop`);
  try { wsMain.close(); } catch { }
  await upA.close(); await upB.close(); await upC.close(); await upD.close();
  srv.kill('SIGKILL');
})().catch((e) => ok(false, 'the window leg threw', e && (e.stack || e.message)));

// ═══ ③b LANE H: the ephemeral browser shows itself ════════════════════════
/**
 * ONE worktree server + ONE headless chrome page, a chat session with no attachment, the agent's first
 * `vibespace-browser open` — and what the page shows within 5 s. `mutate` patches the WORKTREE's keeper
 * copy (a scratch checkout, never this one) so its holder rows drop the ephemeral: the negative control.
 * Returns the observations; asserts nothing itself (the caller judges both runs).
 */
async function ephemeralLeg({ tag, mutate = false, clientPrefix = false }) {
  // an ASYNC predicate (a CDP evaluate) — `until` would take the pending promise itself for a yes
  const untilA = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
  const obs = { tag };
  const R2 = path.join(ROOT, 'eph-' + tag); fs.mkdirSync(R2, { recursive: true });
  const home = scratchHome('browser-live-eph-' + tag + '-home', fs); extraHomes.push(home);
  const wt2 = path.join(R2, 'wt'), BIN2 = path.join(R2, 'bin'), AB2 = path.join(R2, 'ab-state');
  fs.mkdirSync(BIN2, { recursive: true }); fs.mkdirSync(AB2, { recursive: true });
  const up = await fakeUpstream({ fps: 4 });
  // a random id like the suite's other legs (③ / ④): this server runs under its own scratch HOME and nothing here writes
  // a transcript, so it is not a fixture CARRIER (test-fixture-isolation (c): a suite that mints the fixture family must be a transcript
  // writer with its own ~/.claude census — lane H's first cut minted one here and that census went red, 2.369.180)
  const SID2 = crypto.randomUUID();
  const hook2 = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID2, hook_name: 'SessionStart' });
  const init2 = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID2, cwd: R2, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  // the fake claude: the real CLI's first two lines, its ENV to a file (the suite runs the agent's CLI with it),
  // then every emit-<pid>-* file the suite writes is printed as the CLI's own stdout (a tool card, its result)
  // (a probe — `--version` — answers and exits; a session lives at most 600 s like ③'s `exec sleep 600`: never a loop that outlives the suite)
  fs.writeFileSync(path.join(BIN2, 'claude'), `#!/bin/sh\ncase " $* " in *" --version "*) echo '2.1.281 (Claude Code)'; exit 0;; esac\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hook2}' '${init2}';; esac\nenv > "$FAKE_AB_STATE/claude-env-$$"\ni=0; while [ $i -lt 3000 ]; do for f in "$FAKE_AB_STATE"/emit-$$-*; do [ -f "$f" ] || continue; cat "$f"; rm -f "$f"; done; sleep 0.2; i=$((i+1)); done\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN2, 'agent-browser'), FAKE_AB_SOURCE(), { mode: 0o755 });
  fs.writeFileSync(path.join(AB2, 'ports.json'), '{}');
  const PORT2 = await freePort(), CDP2 = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt2, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt2);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt2, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt2, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt2, 'node_modules'));
  if (mutate) {
    const kf = path.join(wt2, 'src/server/browser-keeper.js');
    const src = fs.readFileSync(kf, 'utf8');
    const mut = src.replace('const holders = (leases) => B.holderRows({ leases, profiles: reg.profiles, browsers: reg.browsers, view: leaseView });', 'const holders = (leases) => B.holderRows({ leases, profiles: reg.profiles, browsers: reg.browsers, view: leaseView }).filter((r) => !r.ephemeral);');
    obs.mutated = mut !== src;
    fs.writeFileSync(kf, mut);
  }
  if (clientPrefix) {
    // naive study 2 CONTROL: the PRE-FIX client in this leg's OWN scratch worktree (never the checkout, §51) — a manual open
    // creates a window every time (finding 2) and a stopped browser's view keeps the driving badge (finding 3); bundle rebuilt here
    const cf = path.join(wt2, 'src/lib/browser-live-window.js');
    const csrc = fs.readFileSync(cf, 'utf8');
    const cmut = csrc.replace('  const plan = liveViewPlan({ views, sessionId, profileId, syncId: syncId || null });', "  const plan = { act: 'create', syncId: syncId || null };").replace("        if (m.state === 'error' && m.code === 'browser_stopped') {", '        if (false) {');
    obs.clientMutated = cmut !== csrc && (cmut.match(/if \(false\) \{/g) || []).length >= 1 && cmut.includes("const plan = { act: 'create'");
    fs.writeFileSync(cf, cmut);
    try { execFileSync(path.join(wt2, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wt2, stdio: 'ignore', timeout: 120000 }); obs.rebuilt = true; } catch (e) { obs.rebuilt = false; obs.rebuildErr = String(e && e.message).slice(0, 300); }
  }
  const env2 = { ...process.env, PATH: BIN2 + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN2, 'claude'), FAKE_AB_STATE: AB2 };
  for (const k of Object.keys(env2)) if (k.startsWith('AGENT_BROWSER_')) delete env2[k];
  let journal2 = '';
  const srv2 = spawn('node', ['server.js'], { cwd: wt2, env: { ...env2, ...VNC_ENV, PORT: String(PORT2), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv2);
  srv2.stdout.on('data', (d) => { journal2 += d; }); srv2.stderr.on('data', (d) => { journal2 += d; });
  const chromeLog2 = [];
  let chrome2 = null, cdp2 = null, wsMain2 = null;
  try {
    obs.booted = await until(() => journal2.includes('Ready.'), 40000, 100);
    if (!obs.booted) { obs.journal = journal2.slice(-800); return obs; }
    wsMain2 = new WebSocket(`ws://127.0.0.1:${PORT2}/ws`);
    const msgs2 = []; wsMain2.on('message', (d) => { try { msgs2.push(JSON.parse(d)); } catch { } });
    await new Promise((r, e) => { wsMain2.on('open', r); wsMain2.on('error', e); });
    wsMain2.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: R2, cols: 80, rows: 24, reqId: 'e1', name: 'eph-one' }));
    await until(() => msgs2.some((m) => m.type === 'created'), 15000);
    const created2 = msgs2.find((m) => m.type === 'created');
    obs.created = !!(created2 && created2.sessionId);
    if (!obs.created) { obs.journal = journal2.slice(-800); return obs; }
    const sid = created2.sessionId;
    obs.sessionId = sid;
    // the agent's environment, off the fake claude (its AGENT_BROWSER_SESSION names this conversation's browser key)
    let agentEnv = null, claudePid = null;
    await until(() => {
      for (const n of fs.readdirSync(AB2).filter((x) => x.startsWith('claude-env-'))) {
        const t = fs.readFileSync(path.join(AB2, n), 'utf8');
        if (/^AGENT_BROWSER_SESSION=vs-bk-/m.test(t) && t.includes('VIBESPACE_SESSION_TOKEN=')) { agentEnv = {}; for (const line of t.split('\n')) { const i = line.indexOf('='); if (i > 0) agentEnv[line.slice(0, i)] = line.slice(i + 1); } claudePid = n.slice('claude-env-'.length); return true; }
      }
      return false;
    }, 15000, 100);
    obs.agentEnv = !!agentEnv;
    if (!agentEnv) { obs.journal = journal2.slice(-800); return obs; }
    const bk = agentEnv.AGENT_BROWSER_SESSION.slice(3);
    obs.browserKey = bk;
    fs.writeFileSync(path.join(AB2, 'ports.json'), JSON.stringify({ ['vs-' + bk]: up.port }));
    // headless chrome on the app, the chat window open on the desktop you are looking at
    chrome2 = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP2}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(R2, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    procs.add(chrome2);
    chrome2.stderr.on('data', (d) => { if (chromeLog2.length < 40) chromeLog2.push(d.toString()); });
    let target = null;
    for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP2}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!target) { obs.chrome = chromeLog2.join('').slice(0, 400); return obs; }
    cdp2 = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => cdp2.on('open', r));
    let seq2 = 0; const pend2 = new Map();
    cdp2.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend2.has(m.id)) { pend2.get(m.id)(m); pend2.delete(m.id); } });
    const send2 = (method, params = {}) => new Promise((r) => { const id = ++seq2; pend2.set(id, r); cdp2.send(JSON.stringify({ id, method, params })); });
    const ev2 = async (expr) => { const r = await send2('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
    await send2('Page.enable'); await send2('Runtime.enable');
    await send2('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await send2('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send2('Page.navigate', { url: `http://127.0.0.1:${PORT2}/` });
    obs.appBooted = await (async () => { for (let i = 0; i < 120; i++) { try { if (await ev2('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]); })()')) return true; } catch { } await sleep(250); } return false; })();
    if (!obs.appBooted) return obs;
    await ev2('window.app.refreshBrowserProfiles()');
    // the page records every toast it shows (the auto-bind is SILENT: no Undo toast)
    await ev2(`(() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /toast/.test(n.className || '')) window.__toasts.push(n.textContent || ''); }).observe(document.body, { childList: true, subtree: true }); return true; })()`);
    await ev2(`window.app.attachSession(${JSON.stringify(sid)}, 'eph-one', ${JSON.stringify(R2)}, { mode: 'chat', backend: 'claude' })`);
    const W = (js) => ev2(`(() => { const app = window.app, wm = app.wm; const byType = (t) => [...wm.windows.values()].filter((w) => w.type === t); const chat = () => byType('chat')[0] || null; const live = () => byType('browser-live')[0] || null; ${js} })()`);
    obs.chatUp = await untilA(() => W(`const c = chat(); return !!(c && app.sessions.get(c.id) && app.sessions.get(c.id).sessionId === ${JSON.stringify(sid)});`), 15000, 150);
    if (!obs.chatUp) return obs;
    obs.chatId = await W('return chat().id;');
    obs.liveBefore = await W('return byType("browser-live").length;');
    // the agent's tool call starts (the card the Browser actions row rides), then the agent runs the SHIPPED CLI
    const emit = (lines) => { const f = path.join(AB2, `emit-${claudePid}-${Date.now()}-${Math.random().toString(16).slice(2)}`); fs.writeFileSync(f + '.part', lines.map((l) => JSON.stringify(l)).join('\n') + '\n'); fs.renameSync(f + '.part', f); };
    const URL1 = 'https://example.com/lane-h-' + tag;
    emit([{ type: 'assistant', message: { id: 'msg_laneh_' + tag, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_laneh_' + tag, name: 'Bash', input: { command: 'vibespace-browser open ' + URL1, description: 'Open the page' } }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }, parent_tool_use_id: null, session_id: SID2, uuid: crypto.randomUUID() }]);
    await sleep(700);
    const t0 = Date.now();
    const cliRun = await new Promise((resolve) => { const { execFile } = require('child_process'); execFile(process.execPath, [path.join(wt2, 'data/bin/vibespace-browser'), 'open', URL1], { env: agentEnv, cwd: R2, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })); });
    obs.cli = { status: cliRun.status, stderr: cliRun.stderr.slice(0, 600) };
    // the stream server mirrors the command the daemon ran (the captured shapes), frames keep flowing (fps 4)
    const cmdId = 'r' + Date.now();
    up.send({ type: 'command', id: cmdId, action: 'navigate', params: { action: 'navigate', url: URL1 }, timestamp: Date.now() });
    await sleep(80);
    up.send({ type: 'result', id: cmdId, action: 'navigate', success: false, data: { url: URL1 }, duration_ms: 40, timestamp: Date.now() });
    up.send({ type: 'url', url: URL1, timestamp: Date.now() });
    // within 5 s of the CLI starting: the live view, born in the chat's chain
    obs.bound = await untilA(() => W(`const l = live(); return !!(l && l._tabChain && l._tabChain.layout === 'split');`), Math.max(500, 5000 - (Date.now() - t0)), 100);
    obs.boundMs = Date.now() - t0;
    if (obs.bound) {
      obs.chain = await W(`const l = live(), c = chat(); const ch = c._tabChain; return { same: l._tabChain === ch, host: ch.tabs[0], pair: ch.split && ch.split.pair, liveId: l.id, syncId: l.id, target: l._browserLive.state().target, spec: l._openSpec || null };`);
      obs.frames = await untilA(() => W('const l = live(); return !!(l && l._browserLive.state().frames >= 1 && l._browserLive.img().naturalWidth === 1280);'), 10000, 150);
    }
    // naive study 2 (finding 2): the user opens the live view BY HAND — the status-bar chip's "Open live view", twice
    if (!mutate) {
      // the focus starts somewhere ELSE (a probe window outside the chat's chain) — "Open live view" must bring the ONE view forward
      await W("const pw = app.wm.createWindow({ title: 'probe', type: 'probe' }); window.__probeWin = pw.id; return true;");
      const openByHand = async () => {
        await W('app.wm.focusWindow(window.__probeWin); return true;');
        await W("document.querySelector('.chat-status-browser') && document.querySelector('.chat-status-browser').click(); return true;");
        const got = await untilA(() => W("return !!document.querySelector('.chat-status-browser-live');"), 4000, 100);
        if (got) await W("document.querySelector('.chat-status-browser-live').click(); return true;");
        await sleep(400);
        return got;
      };
      obs.menuFound = await openByHand();
      obs.menuFound2 = await openByHand();
      obs.liveAfterOpens = await W('return byType("browser-live").length;');
      // in a split chain the chain's host takes the focus (both panes show): the active window is IN the live view's chain, never the probe
      obs.activeIsLive = await W('const a = app.wm.activeWindowId; return a !== window.__probeWin && byType("browser-live").some((w) => w.id === a || (w._tabChain && w._tabChain.tabs.includes(a)));');
      await W('try { app.wm.closeWindow(window.__probeWin); } catch { } return true;');
    }
    emit([{ type: 'user', message: { role: 'user', content: [{ tool_use_id: 'toolu_laneh_' + tag, type: 'tool_result', content: '{"success":true}', is_error: false }] }, parent_tool_use_id: null, session_id: SID2, uuid: crypto.randomUUID() }]);
    // the recorder's entry on disk (no viewer was needed — it was armed at the start)
    const idx = path.join(wt2, 'data', 'browser-trace', 'ephemeral', 'index.ndjson');
    const readIdx = () => { try { return fs.readFileSync(idx, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    await until(() => readIdx().length > 0, mutate ? 4000 : 10000, 150);
    obs.entries = readIdx();
    // the tool card's Browser actions row: a thumbnail drawn from the entry's frame
    // the row's thumbnail names the ENTRY's frame (thumbs are loading=lazy — a content-visibility card may not have
    // fetched it yet — so the frame is fetched here from the page, with the page's own cookie, and judged as a JPEG)
    obs.thumb = await untilA(() => W(`const el = document.querySelector('.chat-browser-trace'); return !!(el && [...el.querySelectorAll('img.browser-trace-thumb-img')].some((i) => /\\/api\\/browser\\/actions\\/tr-[0-9a-f]+\\/frame\\/(after|before)$/.test(i.getAttribute('src') || '')));`), mutate ? 4000 : 12000, 250);
    if (obs.thumb) obs.thumbFrame = await ev2(`(async () => { const i = [...document.querySelectorAll('.chat-browser-trace img.browser-trace-thumb-img')][0]; const r = await fetch(i.getAttribute('src')); const b = new Uint8Array(await r.arrayBuffer()); return { src: i.getAttribute('src'), status: r.status, type: r.headers.get('content-type'), magic: b.length > 2 ? b[0].toString(16) + b[1].toString(16) : '', bytes: b.length }; })()`);
    obs.traceRow = await W(`const el = document.querySelector('.chat-browser-trace'); return el ? { text: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200), ts: el.dataset.traceTs || null, imgs: [...el.querySelectorAll('img')].map((i) => i.src.replace(location.origin, '')).slice(0, 4) } : null;`);
    obs.rowName = await W(`const r = (app.sidebar._allSessions || []).find((x) => x.webuiId === ${JSON.stringify(sid)}); return r ? (r.webuiName || r.name || '') : null;`);
    // the chips
    await untilA(() => W(`return !!document.querySelector('.chat-status-browser');`), 6000, 200);
    obs.statusChip = await W(`const c = document.querySelector('.chat-status-browser'); return c ? c.textContent.replace(/\\s+/g, ' ').trim() : null;`);
    await untilA(() => W(`return !!document.querySelector('.sess-browser-chip');`), mutate ? 3000 : 12000, 250);
    obs.cardChip = await W(`const c = document.querySelector('.sess-browser-chip'); return c ? c.textContent.replace(/\\s+/g, ' ').trim() : null;`);
    obs.toasts = await ev2('window.__toasts.slice()');
    obs.liveWindows = await W('return byType("browser-live").length;');
    if (!mutate && obs.bound) {
      // the browser STOPS (its daemon and its stream server with it): the view greys by name, and the view never relaunches it
      const eph = (await (await fetch(`http://127.0.0.1:${PORT2}/api/browser/profiles`)).json()).ephemerals.find((e) => e.browserKey === bk);
      await fetch(`http://127.0.0.1:${PORT2}/api/browser/profiles/${eph.profileId}/stop`, { method: 'POST' });
      for (const cl of up.clients) cl.terminate();
      const streamAsks = () => { try { return fs.readFileSync(path.join(AB2, 'stream.log'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
      obs.greyed = await untilA(() => W(`const s = live()._browserLive.state(); return !s.connected && !!s.error && s.error.code === 'browser_stopped';`), 20000, 250);
      obs.greyedText = await W(`const e = live()._browserLive.el().querySelector('.browser-live-status'); return e ? e.textContent : null;`);
      // naive study 2 (finding 3): the stopped view keeps its LAST frame (greyed) and never says anybody drives
      obs.stoppedView = await W(`const L = live()._browserLive, s = L.state(), img = L.img(); return { stopped: s.stopped, badge: s.badge, frameKept: !!img.getAttribute('src') && img.naturalWidth === 1280, rootStopped: L.el().classList.contains('stopped') };`);
      const asksAtGrey = streamAsks();
      obs.daemons = (() => { try { return fs.readFileSync(path.join(AB2, 'vs-' + bk + '.json'), 'utf8'); } catch { return null; } })();
      // its next verb: the holder row returns ⇒ the SAME view reconnects (no second window)
      const again = await new Promise((resolve) => { const { execFile } = require('child_process'); execFile(process.execPath, [path.join(wt2, 'data/bin/vibespace-browser'), 'open', URL1 + '/again'], { env: agentEnv, cwd: R2, encoding: 'utf8', timeout: 30000 }, (err) => resolve(err ? err.code : 0)); });
      obs.again = again;
      obs.reconnected = await untilA(() => W(`const s = live()._browserLive.state(); return s.connected && byType('browser-live').length === 1;`), 10000, 200);
      obs.resumed = await W(`const s = live()._browserLive.state(); return { stopped: s.stopped, badge: s.badge };`);
      obs.streamAsksGreyToAgain = streamAsks() - asksAtGrey;
    }
    return obs;
  } finally {
    // the fake browser daemons (a `sleep` each, spawned detached by the fake `open`) — every one this leg started
    try { for (const l of fs.readFileSync(path.join(AB2, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { } } } } catch { }
    try { cdp2?.close(); } catch { }
    try { chrome2?.kill('SIGKILL'); } catch { }
    try { wsMain2?.close(); } catch { }
    try { srv2.kill('SIGKILL'); } catch { }
    // the leg's sessions outlive a SIGKILLed server by design (dtach) — end every process under this leg's scratch root
    // (dtach masters, the wrapper, the fake claude, the fake browser daemons): a suite ends what it starts
    try { execFileSync('pkill', ['-KILL', '-f', R2 + '/'], { stdio: 'ignore' }); } catch { /* none left */ }
    // …and every process whose ENVIRONMENT names this leg's root: a fake daemon's cmdline is a bare `sleep 600`, which the
    // pattern above never matched (the control leg leaked one per run — found by the scratch reaper's dry run, lane H verify r1)
    for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { if (Number(d) === process.pid) continue; try { if (fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(R2 + '/')) process.kill(Number(d), 'SIGKILL'); } catch { /* not ours / gone */ } }
    await up.close();
    obs.journalTail = journal2.split('\n').filter((l) => /\[browser|\[browser-trace\]|browser-live/.test(l)).slice(-12).join('\n');
  }
}
console.log('— ③b lane H: the agent\'s ephemeral browser shows itself (live view beside the chat, the action trace, the chips) — and the control');
if (!CHROME) skip('no chrome/chromium on this box — the lane H leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  const o = await ephemeralLeg({ tag: 'real' });
  if (!ok(o.booted && o.created && o.agentEnv && o.appBooted && o.chatUp, 'lane H: a worktree server, a chat session with NO attachment, its chat window open in headless chrome, the agent\'s env read', JSON.stringify(o).slice(0, 900))) return;
  ok(o.liveBefore === 0 && o.cli.status === 0, 'the agent ran the SHIPPED `vibespace-browser open <url>` — its first browser command (no live view existed before it)', JSON.stringify(o.cli));
  ok(o.bound && o.boundMs <= 5000, `within 5 s a browser-live window appeared, BORN in the chat window's chain as a split (${o.boundMs} ms)`, o.journalTail);
  ok(o.chain && o.chain.same && o.chain.host === o.chatId && o.chain.pair && o.chain.pair[0] === o.chatId && o.chain.pair[1] === o.chain.liveId && o.chain.liveId === 'win-blive-' + o.sessionId, 'ONE chain: [chat, live], the chat the host, the deterministic syncId win-blive-<session>', JSON.stringify(o.chain));
  ok(o.chain && o.chain.target && o.chain.target.kind === 'ephemeral' && o.chain.spec && o.chain.spec.profileId === S.EPHEMERAL_REF, 'the view streams THAT browser: target kind ephemeral, its openSpec names EPHEMERAL_REF (a replay reopens the same pane)', JSON.stringify(o.chain));
  ok(o.frames, 'frames are DRAWN in the bound pane (the fake stream server through the bridge)');
  ok(!(o.toasts || []).some((t) => /Undo|side by side/i.test(t)), 'the auto-bind is SILENT — no Undo / side-by-side toast (split UX: only a user\'s own bind announces)', JSON.stringify(o.toasts));
  const e0 = (o.entries || [])[0];
  ok(o.entries && o.entries.length >= 1 && e0.action === 'navigate' && e0.sessionId === o.sessionId && /lane-h-real/.test(JSON.stringify(e0)) && e0.profileId === null, `data/browser-trace/ephemeral holds the navigation (${(o.entries || []).length} entr${(o.entries || []).length === 1 ? 'y' : 'ies'}) — recorded by the viewer-less tap armed at the browser's start`, JSON.stringify(e0).slice(0, 400));
  ok(o.thumb && o.thumbFrame && o.thumbFrame.status === 200 && /image\/jpeg/.test(o.thumbFrame.type || '') && o.thumbFrame.magic === 'ffd8' && (o.entries || []).some((e) => o.thumbFrame.src.includes('/' + e.id + '/')) && /1 action/.test((o.traceRow && o.traceRow.text) || ''), `the tool card's Browser actions row shows the entry's thumbnail — "${o.traceRow && o.traceRow.text}", ${o.thumbFrame && o.thumbFrame.src} = ${o.thumbFrame && o.thumbFrame.bytes} bytes of JPEG`, JSON.stringify({ row: o.traceRow, frame: o.thumbFrame }));
  ok(!!o.rowName && o.statusChip === 'Agent browser · (ephemeral) ' + o.rowName, `the status-bar chip: "${o.statusChip}" (the session is "${o.rowName}")`);
  ok(!!o.rowName && o.cardChip === 'Agent browser · (ephemeral) ' + o.rowName, `the session card's chip: "${o.cardChip}"`);
  ok(o.greyed && /^Stopped — the agent's next browser command starts it again/.test(o.greyedText || ''), `the browser stopped ⇒ the view GREYS by name (browser_stopped: "${String(o.greyedText || '').slice(0, 120)}")`);
  ok(o.stoppedView && o.stoppedView.stopped === true && o.stoppedView.badge === 'Browser stopped' && o.stoppedView.frameKept && o.stoppedView.rootStopped, 'naive study 2 (finding 3): the stopped view keeps its LAST frame (greyed) and the badge says "Browser stopped" — never "Agent is driving" over a blank page as if a new browser had started', JSON.stringify(o.stoppedView));
  ok(o.menuFound && o.menuFound2 && o.liveAfterOpens === 1 && o.activeIsLive, `naive study 2 (finding 2): "Open live view" from the status-bar chip, clicked twice, FOCUSES the one live view — ${o.liveAfterOpens} window(s) (every click opened a new one)`, JSON.stringify({ menu: [o.menuFound, o.menuFound2], windows: o.liveAfterOpens, active: o.activeIsLive }));
  ok(o.again === 0 && o.reconnected && o.resumed && o.resumed.stopped === false && o.resumed.badge === 'Agent is driving', 'its next verb restarts it ⇒ the SAME view reconnects (the holder row returned; still one window) and the stopped state clears', JSON.stringify(o.resumed));
  const c = await ephemeralLeg({ tag: 'mut', mutate: true });
  ok(c.mutated && c.booted && c.created && c.chatUp && c.cli && c.cli.status === 0, 'CONTROL: the same world on a server whose keeper copy drops the ephemeral from its holder rows (the pre-lane digest); the agent\'s command still runs', JSON.stringify(c).slice(0, 600));
  ok(!c.bound && c.liveWindows === 0, 'CONTROL: …no live view appears (the auto-bind had no row to open on) — the leg above can go red', JSON.stringify({ bound: c.bound, windows: c.liveWindows }));
  ok((c.entries || []).length === 0 && !c.thumb, 'CONTROL: …and NOTHING is recorded (the recorder arms only on a holder row) — the trace leg can go red', JSON.stringify(c.entries).slice(0, 200));
  ok(!c.cardChip, 'CONTROL: …and the card has no Agent browser chip (browserLive comes from the same rows)', String(c.cardChip));
  const u = await ephemeralLeg({ tag: 'ui', clientPrefix: true });
  ok(u.clientMutated && u.rebuilt && u.booted && u.chatUp && u.bound, 'CONTROL (naive study 2): the same world with the PRE-FIX live-view client (a manual open always creates; no stopped state), its bundle rebuilt in the leg\'s own worktree', JSON.stringify(u).slice(0, 600));
  ok(u.menuFound && u.liveAfterOpens >= 3, `CONTROL: …"Open live view" twice opens ${u.liveAfterOpens} windows (the auto-bound one + one per click) — the finding-2 leg can go red`);
  ok(u.stoppedView && u.stoppedView.badge === 'Agent is driving' && !u.stoppedView.stopped, `CONTROL: …and the stopped browser's view says "${u.stoppedView && u.stoppedView.badge}" — the finding-3 leg can go red`, JSON.stringify(u.stoppedView));
})().catch((e) => ok(false, 'the lane H leg threw', e && (e.stack || e.message)));

// ═══ ④ the REAL binary ═══════════════════════════════════════════════════
console.log('— ④ the real agent-browser: one headless chromium, the real stream server, the real bridge');
{
  // the REAL binary, resolved the way the server resolves it (the VibeSpace shim is first on every session's PATH and
  // exits 2 — a bare `agent-browser --version` made this leg SKIP whenever the suite ran inside a VibeSpace session)
  let ver = null; try { const rb = F.binaryResolver('agent-browser', process.env)(); ver = rb ? execFileSync(rb, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim() : null; } catch { }
  const CHROME_ANY = CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  // lane P verify (finding 2, 2026-09-26): the live view of a conversation that has NOT opened its browser yet — the
  // REAL binary, the REAL keeper, no record: `no-browser` (not-started) and `session info` under its pairs still says
  // active:false, no process under its socket dir. CONTROL: the as-shipped `stream status` under the same pairs SPAWNS a
  // background daemon (measured on 0.38.1) — reaped by its own scratch socket dir in its environ.
  if (ver && /\b0\.(3[2-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(ver)) await (async () => {
    const K = require('../src/server/browser-keeper.js');
    const D = path.join(ROOT, 'real-norecord'); fs.mkdirSync(path.join(D, 'sock'), { recursive: true, mode: 0o700 }); fs.mkdirSync(path.join(D, 'data'), { recursive: true });
    const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_')) env[k] = v;
    env.HOME = path.join(D, 'home'); fs.mkdirSync(env.HOME, { recursive: true }); // never the user's ~/.agent-browser
    const ns = 'vs-bk-' + crypto.randomBytes(4).toString('hex');
    const pairs = [`AGENT_BROWSER_SESSION=${ns}`, `AGENT_BROWSER_NAMESPACE=${ns}`, `AGENT_BROWSER_SOCKET_DIR=${path.join(D, 'sock')}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=60000'];
    const rt = F.createBrowserRuntime({ env, log: null });
    const underD = () => { const out = []; for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try { if (fs.readFileSync(`/proc/${pid}/environ`, 'utf8').includes(path.join(D, 'sock'))) out.push(Number(pid)); } catch { } } return out; };
    const reap = () => { for (const pid of underD()) { try { process.kill(pid, 'SIGTERM'); } catch { } } };
    try {
      const keeper = K.create({ dataDir: path.join(D, 'data'), homeDir: path.join(D, 'home'), env: () => env, runtime: rt, facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3 });
      const v = await keeper.streamPortFor({ ok: true, kind: 'ephemeral', sessionName: ns, envPairs: pairs });
      await sleep(500);
      const info = await rt.info(null, { extraEnv: S.pairsToEnv(pairs) });
      ok(!v.ok && v.code === 'no-browser' && v.state === 'not-started' && info.ok && !info.active && underD().length === 0, `lane P verify (REAL ${ver}): a live view of a conversation with no browser yet starts NOTHING — no-browser, \`session info\` active:false, no process under its socket dir`, JSON.stringify({ v, active: info.active, procs: underD() }));
      keeper.shutdown();
      const ctl = await rt.streamPort(null, { extraEnv: S.pairsToEnv(pairs) });
      await sleep(500);
      const info2 = await rt.info(null, { extraEnv: S.pairsToEnv(pairs) });
      ok(info2.active && underD().length >= 1, `lane P verify CONTROL (REAL ${ver}): the as-shipped \`stream status\` under the same pairs spawns a background daemon nobody recorded (port ${ctl.port}, pid ${info2.pid}) — the leg above is red on it`, JSON.stringify({ ctl, active: info2.active, procs: underD() }));
    } finally {
      await rt.closeAll(null, { extraEnv: S.pairsToEnv(pairs) }).catch(() => { });
      await sleep(300); reap();
    }
  })().catch((e) => ok(false, 'the real no-record leg threw', e && (e.stack || e.message)));
  // lane P verify r2 (F2, 2026-09-26): a live view picked up WHILE the keeper's `open` launches the conversation's
  // browser — the REAL binary, the REAL keeper. MEASURED on 0.38.1 (the real keeper, 2 × 2 × 2 runs): the binary
  // SERIALIZES a concurrent `stream status` behind `open`, and what RESTARTS the daemon (`restartedBackground:true`,
  // a new pid carrying the client's idle) is a client whose AGENT_BROWSER_IDLE_TIMEOUT_MS differs from the one the
  // daemon was launched with — the keeper's launch passed the SETTING while every client of that daemon (the
  // agent's verbs, the view) runs under the spawn PAIRS. So the pairs are spawned under 900000 and the setting is
  // now 600000: the view arrives mid-launch, then the agent's own verb runs under its pairs ⇒ neither restarts the
  // daemon, the recorded pid is still THE daemon and carries the idle the launch passed (the pairs'), and
  // `stream status` began after `open` ended. CONTROL: the pre-fix launch (patched copy: the setting) ⇒ the view's
  // `stream status` restarts the daemon the keeper just launched and recorded. Every process is reaped by its
  // scratch socket dir in its environ / cmdline.
  if (ver && /\b0\.(3[2-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(ver)) await (async () => {
    const K0 = require('../src/server/browser-keeper.js');
    const B = require('../src/browser-profiles.js');
    const envBase = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_')) envBase[k] = v;
    const realBin = F.binaryResolver('agent-browser', envBase)();
    if (!realBin) { skip('F2 real leg: no real agent-browser binary resolves on PATH (only a shim)'); return; }
    const exeName = path.basename(fs.realpathSync(realBin));
    const MKL = mutantCopies('browser-live-r2', repo);
    const ksrc = fs.readFileSync(path.join(repo, 'src/server/browser-keeper.js'), 'utf8');
    const W2 = '        const launchIdle = B.pairsIdleMs(pairs) ?? idleMs();\n';
    ok(ksrc.includes(W2), 'F2 real leg setup: the launch\'s pairs idle is found in src/server/browser-keeper.js');
    const run = async (Kmod, tag, pairIdle = 900000) => {
      const D = path.join(ROOT, 'real-r2-' + tag);
      for (const d of ['sock', 'data', 'home']) fs.mkdirSync(path.join(D, d), { recursive: true, mode: 0o700 });
      const env = { ...envBase, HOME: path.join(D, 'home') }; // never the user's ~/.agent-browser
      const calls = [];
      const { execFile } = require('child_process');
      const rt = F.createBrowserRuntime({ cmd: realBin, env, execFileImpl: (bin, args, opts, cb) => { const c = { args: args.join(' '), begin: Date.now(), end: null, out: '' }; calls.push(c); return execFile(bin, args, opts, (err, so, se) => { c.end = Date.now(); c.out = String(so || ''); cb(err, so, se); }); } });
      const KEY = 'bk-' + crypto.randomBytes(4).toString('hex');
      const pairs = [...B.browserEnvFor({ browserKey: KEY, variant: B.VARIANTS.N, idleMs: pairIdle }), `AGENT_BROWSER_SOCKET_DIR=${path.join(D, 'sock')}`];
      const underD = () => { const out = []; for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try { const e = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); if (!e.includes(path.join(D, 'sock'))) continue; let exe = ''; try { exe = path.basename(fs.readlinkSync(`/proc/${pid}/exe`)); } catch { } out.push({ pid: Number(pid), exe, idle: (e.split('\0').find((x) => x.startsWith('AGENT_BROWSER_IDLE_TIMEOUT_MS=')) || '=').split('=')[1] || null }); } catch { } } return out; };
      const keeper = Kmod.create({ dataDir: path.join(D, 'data'), homeDir: path.join(D, 'home'), env: () => env, runtime: rt, facts: F.createBrowserFacts({ env }), serverSetting: (k) => ({ 'browser.idleTimeoutMs': 600000 })[k], log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3, liveKeys: () => new Set([KEY]) });
      try {
        const pend = keeper.ensureEphemeral({ browserKey: KEY, sessionId: 'sess-r2', envPairs: pairs, sessionName: 'r2' });
        await until(() => calls.some((c) => /^open /.test(c.args)), 15000, 10);
        await sleep(150);
        const mid = (keeper.ephemeralFor(KEY) || {}).state;
        const v = await keeper.streamPortFor({ ok: true, kind: 'ephemeral', sessionName: 'vs-' + KEY, envPairs: pairs });
        let settled = null; try { settled = await pend; } catch (e) { settled = { error: e && e.message }; }
        if (settled && settled.error) return { launchFailed: settled.error };
        // the agent's own next verb — the real binary under the session's spawn pairs
        const verbOut = await new Promise((r) => execFile(realBin, ['open', 'data:text/html,<title>r2</title>', '--json'], { env: { ...env, ...S.pairsToEnv(pairs), AGENT_BROWSER_JSON: '1' }, timeout: 60000, encoding: 'utf8' }, (_e, so, se) => r(String(so || se || ''))));
        await sleep(800);
        const open = calls.find((c) => /^open /.test(c.args));
        const ss = calls.filter((c) => /^stream status/.test(c.args));
        const rec = keeper.browserOf((keeper.ephemeralFor(KEY) || {}).profileId) || {};
        const daemons = underD().filter((p) => p.exe === exeName);
        return { mid, v, launchIdle: rec.idleMs, recordedPid: rec.pid, daemons, ssAfterOpen: ss.length > 0 && ss.every((c) => c.begin >= open.end), ssRestarted: ss.some((c) => /"restartedBackground":\s*true/.test(c.out)), verbRestarted: /"restartedBackground":\s*true/.test(verbOut), order: calls.map((c) => c.args.split(' ').slice(0, 2).join(' ')) };
      } finally {
        await rt.closeAll(null, { extraEnv: S.pairsToEnv(pairs) }).catch(() => { });
        keeper.shutdown();
        await sleep(400);
        for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try { const e = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); const c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); if (e.includes(D) || c.includes(D)) process.kill(Number(pid), 'SIGKILL'); } catch { } }
      }
    };
    const r = await run(K0, 'fix');
    if (r.launchFailed) { skip(`F2 real leg: the real browser did not launch on this box: ${String(r.launchFailed).replace(/\s+/g, ' ').slice(0, 180)}`); return; }
    ok(r.mid === 'starting' && r.v.ok && r.ssAfterOpen, `lane P verify r2 F2 (REAL ${ver}): a view picked up mid-launch asks \`stream status\` only after \`open\` ended (${r.order.join(' → ')})`, JSON.stringify(r));
    ok(!r.ssRestarted && !r.verbRestarted && r.daemons.length === 1 && r.daemons[0].pid === r.recordedPid && r.launchIdle === 900000 && r.daemons[0].idle === '900000', `lane P verify r2 F2 (REAL ${ver}): neither the view's \`stream status\` nor the agent's own verb restarts the daemon (restartedBackground never true) — ONE daemon, the RECORDED pid, carrying the idle the launch passed (the pairs' ${r.launchIdle})`, JSON.stringify(r));
    // the product's DEFAULT shape (the setting unchanged since the spawn: the pairs name the setting's 600000)
    const rd = await run(K0, 'default', 600000);
    if (rd.launchFailed) skip(`F2 real leg (default shape): the real browser did not launch: ${String(rd.launchFailed).slice(0, 160)}`);
    else ok(rd.mid === 'starting' && rd.v.ok && rd.ssAfterOpen && !rd.ssRestarted && !rd.verbRestarted && rd.daemons.length === 1 && rd.daemons[0].pid === rd.recordedPid && rd.launchIdle === 600000 && rd.daemons[0].idle === '600000', `lane P verify r2 F2 (REAL ${ver}, the default shape): the view mid-launch, then the agent's verb — ONE daemon, the recorded pid, carrying the 600000 the launch passed, never restarted (${rd.order.join(' → ')})`, JSON.stringify(rd));
    if (ksrc.includes(W2)) {
      const rc = await run(MKL.load('src/server/browser-keeper.js', ksrc.replace(W2, '        const launchIdle = idleMs();\n'), 'launch-idle-setting'), 'ctl');
      if (rc.launchFailed) skip(`F2 real CONTROL: the real browser did not launch: ${String(rc.launchFailed).slice(0, 160)}`);
      else ok(rc.ssRestarted && !rc.daemons.some((d) => d.pid === rc.recordedPid), `lane P verify r2 F2 CONTROL (REAL ${ver}): the pre-fix launch (the setting, 600000) under pairs naming 900000 — the view's \`stream status\` RESTARTS the daemon the keeper just launched (restartedBackground:true; the recorded pid ${rc.recordedPid} is gone, the survivor carries ${rc.daemons.map((d) => d.idle).join()}) — the leg above is red on it`, JSON.stringify(rc));
    }
    for (const c of copiesCensus(MKL.files, MKL.dir, repo, { label: 'browser-live r2 controls: ' })) ok(c.pass, c.name, c.detail);
  })().catch((e) => ok(false, 'the F2 real leg threw', e && (e.stack || e.message)));
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
    // lane L r5: the config rides the runtime's launch itself (the runtime path is the keeper's — its cwd is what ⑤ below asserts)
    const launched = await rt.launch(ns, { dir: path.join(D, 'prof'), idleMs: 120000, headed: false, url: 'data:text/html,<title>live</title><h1>live</h1>', timeout: 90000, extraEnv });
    // the runtime's launch merges its own pairs; the config must ride too
    const lr = launched.ok ? launched : await new Promise((r) => { const { execFile } = require('child_process'); execFile('agent-browser', ['open', 'data:text/html,<title>live</title><h1>live</h1>'], { env: { ...env, AGENT_BROWSER_SESSION: ns, AGENT_BROWSER_NAMESPACE: ns, AGENT_BROWSER_PROFILE: path.join(D, 'prof'), AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1', ...extraEnv }, timeout: 90000, encoding: 'utf8' }, (err, stdout, stderr) => r({ ok: !err, stdout, stderr })); });
    if (!lr.ok) { skip(`the real chromium did not launch here: ${String(lr.stderr || lr.stdout || lr.error || '').slice(0, 200)}`); reapDaemons(new Set([ns])); return; }
    try {
      // lane L r5 F1 (b): the REAL daemon the runtime launched runs in the runtime's private directory — never the
      // checkout this suite (and, in production, the server) runs from
      {
        const inf = await rt.info(ns, { dir: path.join(D, 'prof'), extraEnv });
        let dcwd = null; try { dcwd = fs.readlinkSync(`/proc/${inf.pid}/cwd`); } catch { }
        const co = fs.realpathSync(repo);
        ok(launched.ok && inf.pid && dcwd === F.runDir().dir && dcwd !== co && !dcwd.startsWith(co + '/') && !co.startsWith(dcwd + '/'), `lane L r5 F1(b): the REAL daemon (pid ${inf.pid}) launched through the runtime runs in ${dcwd} — not the checkout ${co}`, JSON.stringify({ launched: launched.ok, launchErr: String(launched.stderr || launched.error || '').slice(0, 200), pid: inf.pid, dcwd }));
      }
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
      // lane H: THE RECORDER over the REAL stream server — a viewer-less-style tap on the session's own ephemeral
      // browser (EPHEMERAL_REF), then a REAL command the daemon runs: its own `command` / `result` mirrors are the
      // trace entry (the owner's first `open` was never recorded)
      {
        const TRC = require('../src/server/browser-trace.js');
        const tdir = path.join(D, 'trace-data'); fs.mkdirSync(tdir, { recursive: true });
        const bk = ns.slice(3);
        const tk = { ...keeper, holdersFor: () => [{ ephemeral: true, child: false, browserKey: bk, sessionId: 'sess-real' }], browserOf: () => null, leasesOn: () => [] };
        const trc = TRC.create({ dataDir: tdir, keeper: tk, bridge, serverSetting: () => undefined, runtime: rt, log: { log() { }, warn() { } }, sweepEveryMs: 0 });
        const armed = await trc.watch({ sessionId: 'sess-real', profileId: null, browserKey: bk });
        ok(armed.ok, 'lane H (real binary): the recorder armed a tap on the session\'s own ephemeral browser (EPHEMERAL_REF)', JSON.stringify(armed));
        const OPEN = 'data:text/html,<title>traced-real</title><h1>traced</h1>';
        const ran = await rt.exec(ns, ['open', OPEN], { dir: path.join(D, 'prof'), session: ns, extraEnv, timeout: 30000 });
        let es = [];
        for (let i = 0; i < 80 && !es.length; i++) { await sleep(100); es = trc.list({ sessionId: 'sess-real', profileId: null }); }
        const e0 = es[0];
        ok(ran.ok && e0 && ['open', 'navigate'].includes(e0.action) && /traced-real/.test(JSON.stringify(e0)) && e0.after && fs.existsSync(path.join(tdir, 'browser-trace', 'ephemeral', e0.after.file)), `lane H (real binary ${String(ver || '').trim()}): the daemon's own mirror of a REAL \`open\` is RECORDED under browser-trace/ephemeral (action ${e0 && e0.action}, an after-frame on disk)`, JSON.stringify({ ran: ran.ok, stderr: String(ran.stderr || '').slice(0, 200), e0 }).slice(0, 600));
        trc.shutdown();
      }
      bridge.shutdown(); srv.close();
    } finally {
      // lane H (+ lane L r5): close under the SAME socket root + config the browser was launched with (the daemon lives under extraEnv's socket dir) — without `extraEnv` the close
      // asked another root's daemon and every run leaked this one (and, once the launch worked, its Chrome)
      // lane J: then reap the namespace's daemons, twice: `close --all` may itself start a daemon that registers a beat later
      await rt.closeAll(ns, { dir: path.join(D, 'prof'), extraEnv }).catch(() => { });
      reapDaemons(new Set([ns])); await sleep(600); reapDaemons(new Set([ns]));
    }
  })().catch((e) => ok(false, 'the real-binary leg threw', e && (e.stack || e.message)));
}

// ═══ ⑤ lane J: TAKEOVER CLICKS LAND WHERE YOU CLICK — the real rung ═══════
// inc-muhgv0fb-9i4u (2026-09-25, owner: "接管浏览器的时候鼠标操作位置不对"): the
// owner took over the agent's ephemeral (rung D, HEADED) browser from a Mac at
// DPR 2 and clicks landed off. Measured cause: 0.32.0's frame metadata and
// status say the CONFIGURED 1280×720; the page is 1280×577 headless and, headed
// on a 2560×1440 screen with no window size, 1265×1277 downscaled into a 713×720
// JPEG — the view letterboxed and scaled by the claim. This leg is the owner's
// path end to end: a worktree server, a session whose spawn pairs name its own
// browser, `vibespace-browser open` (ensureEphemeral → the REAL agent-browser),
// the live view in headless chrome emulated as the owner's client (1920×963,
// DPR 2 and 1, UI scale 100 % and 125 %, the window 1400×800 and 700×900 so the
// picture letterboxes both ways), Take over, a REAL click where grid cell
// (10,5) is DRAWN (the judge's own object-fit arithmetic over the page's own
// innerWidth/innerHeight) — and the page reports where it landed. The CONTROL
// is the pre-fix mapping in a patched copy of src/browser-stream.js fed the
// same inputs the pre-fix window had (the metadata's claim), sent through the
// same socket: the owner's offset, measured. Then a new tab and a resized
// viewport. SKIPs with evidence without chrome / dtach / the real binary / Xvfb.
console.log('— ⑤ lane J: the real rung — a real agent browser (headless and headed), the live view as the owner\'s client, a click on grid cell (10,5)');
await (async () => {
  const REAL_AB = (() => { try { const r = F.binaryResolver('agent-browser', process.env); return r ? r() : null; } catch { return null; } })();
  let abVer = null; if (REAL_AB) { try { abVer = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { } }
  const XVFB = ['/usr/bin/Xvfb', '/usr/local/bin/Xvfb'].find((p) => fs.existsSync(p)) || null;
  const realBrowsers = path.join(os.homedir(), '.agent-browser', 'browsers');
  if (!CHROME) return skip('⑤ no chrome/chromium for the client');
  if (!dtachOk) return skip('⑤ dtach is not installed — a local session cannot be created here');
  if (!REAL_AB || !abVer) return skip(`⑤ the real agent-browser is not resolvable here (${REAL_AB || 'only the VibeSpace shim / nothing on PATH'})`);
  if (!/\b0\.(3[2-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(abVer)) return skip(`⑤ agent-browser ${abVer} is below 0.32 — no stream server`);
  if (!fs.existsSync(realBrowsers)) return skip(`⑤ the real agent-browser has no installed browser under ${realBrowsers} (the leg never downloads one)`);
  const M = mutantCopies('browser-live', repo);
  // THE CONTROL: the pre-fix belief — "the frame's metadata IS the frame" — as ONE edit to frameGeometry in a patched
  // copy of src/browser-stream.js: the claim becomes both the picture (the letterbox) and the page (the scale). The
  // control runs the fixed client's own two calls (frameGeometry → pointerToDevice) through the patched module.
  const SRC = fs.readFileSync(path.join(repo, 'src/browser-stream.js'), 'utf8');
  const S0 = M.load('src/browser-stream.js', SRC.replace('  const pw = posNum(picW), ph = posNum(picH);\n', '  if (meta && meta.width && meta.height) return { picW: meta.width, picH: meta.height, cssW: meta.width, cssH: meta.height, source: \'metadata\' };\n  const pw = posNum(picW), ph = posNum(picH);\n'));
  { const arg = { picW: 713, picH: 720, page: { clientWidth: 1265, clientHeight: 1277 }, meta: { width: 1280, height: 720 } };
    ok(S0.frameGeometry(arg).cssW === 1280 && S0.frameGeometry(arg).picW === 1280 && S.frameGeometry(arg).cssW === 1265 && S.frameGeometry(arg).picW === 713, 'control: the patched copy really believes the metadata (census of the patch: 1280×720 for the picture AND the page)', JSON.stringify([S0.frameGeometry(arg), S.frameGeometry(arg)])); }
  const HOME5 = scratchHome('browser-live-real', fs);
  const cleanupHome5 = () => { try { fs.rmSync(HOME5, { recursive: true, force: true }); } catch { } };
  process.on('exit', cleanupHome5);
  fs.mkdirSync(path.join(HOME5, '.agent-browser'), { recursive: true });
  fs.symlinkSync(realBrowsers, path.join(HOME5, '.agent-browser', 'browsers')); // the INSTALLED browser, read-only use; never a download, never the owner's profiles
  const D5 = path.join(ROOT, 'real5'); const BIN5 = path.join(D5, 'bin'); const ENVS = path.join(D5, 'envs'); fs.mkdirSync(BIN5, { recursive: true }); fs.mkdirSync(ENVS, { recursive: true });
  const SID5 = crypto.randomUUID();
  const hook5 = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID5, hook_name: 'SessionStart' });
  const init5 = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID5, cwd: D5, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  // the fake claude writes its whole environment (the spawn pairs + the session token) where the suite can read it
  // (a SESSION only: the server's own probes of the CLI get a version line and an exit — a probe that sleeps outlives the suite)
  // lane J r2 (⑥): the agent QUEUES an approval for a browser page command at spawn (a tool_use + the CLI's
  // can_use_tool control_request — the claude stream-json shapes), and everything the server writes to its stdin
  // (the stale deny) is kept as evidence in <pid>.stdin
  const toolUse5 = JSON.stringify({ type: 'assistant', message: { id: 'msg_lj2_click', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_lj2_click', name: 'Bash', input: { command: 'vibespace-browser click @e3', description: 'Press the button' } }], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } }, parent_tool_use_id: null, session_id: SID5 });
  const ctlReq5 = JSON.stringify({ type: 'control_request', request_id: 'req_lj2_click', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'vibespace-browser click @e3', description: 'Press the button' }, permission_suggestions: [], tool_use_id: 'toolu_lj2_click' } });
  fs.writeFileSync(path.join(BIN5, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n%s\\n%s\\n' '${hook5}' '${init5}' '${toolUse5}' '${ctlReq5}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
  // the grid page + the collector: the page reports its own viewport and every mousedown, same-origin (loopback)
  const vps = new Map(), clicks = [], kbds = new Map();
  // lane J r2 (⑥): a form page — an input at page (20,20) 300×40 reporting every value it holds, and every mousedown
  const form = (n) => `<!doctype html><title>form ${n}</title><style>html,body{margin:0;background:#fff}</style><input id=u autocomplete=off style="position:absolute;left:20px;top:20px;width:300px;height:40px;font-size:18px;box-sizing:border-box"><script>const N=${JSON.stringify(n)};const rep=(p)=>fetch(p,{cache:'no-store'}).catch(()=>{});const u=document.getElementById('u');u.addEventListener('input',()=>rep('/kbd?n='+N+'&v='+encodeURIComponent(u.value)));addEventListener('mousedown',(e)=>rep('/click?n='+N+'&x='+e.clientX+'&y='+e.clientY));const vp=()=>rep('/vp?n='+N+'&w='+innerWidth+'&h='+innerHeight+'&dpr='+devicePixelRatio);addEventListener('load',vp);addEventListener('resize',vp);setInterval(vp,1500);</script>`;
  const grid = (n) => `<!doctype html><title>grid ${n}</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff}body{background-image:linear-gradient(#999 1px,transparent 1px),linear-gradient(90deg,#999 1px,transparent 1px);background-size:50px 50px}</style><script>const N=${JSON.stringify(n)};const rep=(p)=>fetch(p,{cache:'no-store'}).catch(()=>{});const vp=()=>rep('/vp?n='+N+'&w='+innerWidth+'&h='+innerHeight+'&dpr='+devicePixelRatio);addEventListener('load',vp);addEventListener('resize',vp);setInterval(vp,1500);addEventListener('mousedown',(e)=>rep('/click?n='+N+'&x='+e.clientX+'&y='+e.clientY));</script>`;
  const col = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/grid') { res.setHeader('Content-Type', 'text/html'); res.end(grid(u.searchParams.get('n') || '')); return; }
    if (u.pathname === '/form') { res.setHeader('Content-Type', 'text/html'); res.end(form(u.searchParams.get('n') || '')); return; }
    if (u.pathname === '/kbd') kbds.set(u.searchParams.get('n'), u.searchParams.get('v'));
    if (u.pathname === '/vp') vps.set(u.searchParams.get('n'), { w: Number(u.searchParams.get('w')), h: Number(u.searchParams.get('h')), dpr: Number(u.searchParams.get('dpr')), at: Date.now() });
    if (u.pathname === '/click') clicks.push({ n: u.searchParams.get('n'), x: Number(u.searchParams.get('x')), y: Number(u.searchParams.get('y')), at: Date.now() });
    res.statusCode = 204; res.end();
  });
  const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
  const procs5 = [];
  const sessionNames = new Set(), createdIds = [];
  let wsKill = null; // the leg's own ws: its sessions are KILLED through the server before it goes (a dtach session outlives a SIGKILLed server by design)
  let xvfb = null, DISPLAY_N = null;
  const results = [];
  try {
    const wt = path.join(ROOT, 'wt5');
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore', env: gitEnvFrom(process.env) }); worktrees.add(wt);
    for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
    if (XVFB) {
      // our own X server, 2560×1440 like the owner's screen; Xvfb picks a free display itself (-displayfd) and is ended
      // with SIGTERM so it removes its own lock (a SIGKILL strands /tmp/.X<n>-lock for every later run)
      xvfb = spawn(XVFB, ['-displayfd', '3', '-screen', '0', '2560x1440x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
      procs.add({ kill: () => { try { xvfb.kill('SIGTERM'); } catch { } } });
      const d = await new Promise((res) => { let b = ''; xvfb.stdio[3].on('data', (x) => { b += x; if (/\n/.test(b)) res(b.trim()); }); xvfb.on('exit', () => res(null)); setTimeout(() => res(null), 10000); });
      DISPLAY_N = d && /^\d+$/.test(d) ? Number(d) : null;
    }
    const PATH5 = `${BIN5}:${path.dirname(REAL_AB)}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
    const baseEnv = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && k !== 'WAYLAND_DISPLAY') baseEnv[k] = v;
    Object.assign(baseEnv, { PATH: PATH5, CLAUDE_CMD: path.join(BIN5, 'claude'), HOME: HOME5, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' });
    if (DISPLAY_N !== null) baseEnv.DISPLAY = `:${DISPLAY_N}`; else delete baseEnv.DISPLAY;
    const PORT5 = await freePort(), CDP5 = await freePort();
    let journal = '';
    const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT5) }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv); procs5.push(srv);
    srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
    if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), '⑤ the worktree server booted (real agent-browser on its PATH)', journal.slice(-600))) return;
    const wsMain = new WebSocket(`ws://127.0.0.1:${PORT5}/ws`);
    const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
    wsKill = wsMain;
    // the client: headless chrome as the owner's Mac (1920×963, DPR 2)
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP5}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(D5, 'client')}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
    procs.add(chrome); procs5.push(chrome);
    let target = null;
    for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP5}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, '⑤ the client chrome exposed a page target')) return;
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => cdp.on('open', r));
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
    const metrics = (dsf) => send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 963, deviceScaleFactor: dsf, mobile: false });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await metrics(2);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT5}/` });
    const ready = await (async () => { for (let i = 0; i < 160; i++) { try { if (await evaluate('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch { } await sleep(250); } return false; })();
    if (!ok(ready, '⑤ the app booted in the client chrome (1920×963, DPR 2)')) return;
    await evaluate('window.app.ready');
    /** ⑥ lane J r2 on the real rung (headless shape): letterbox pixels, input feedback, THE KEYBOARD, the stale card, and the control. */
    const laneJ2 = async ({ q, clickOnce, created, vb }) => {
      const sid = created.sessionId;
      // ── the letterbox, in PIXELS: the band above the picture (the pane at 700×900, DPR 1, UI 100 %) ──
      const band = async () => {
        await metrics(1);
        await evaluate(`(() => { document.body.style.zoom = ''; document.documentElement.style.removeProperty('--ui-scale'); return true; })()`);
        await q(`const el = w.element; w.gridBounds = null; window.app.wm.focusWindow?.(w.id); el.style.left = '24px'; el.style.top = '12px'; el.style.width = '700px'; el.style.height = '900px'; w.onResize && w.onResize(); return true;`);
        await sleep(400);
        const r = await q(`const c = L.el().querySelector('.browser-live-canvas').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height };`);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
        return evaluate(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.result && shot.result.data || '')}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const W = c.width, H = c.height; const d = x.getImageData(0, 0, W, H).data; const px = (xx, yy) => { const i = (yy * W + xx) * 4; return [d[i], d[i + 1], d[i + 2]]; }; const cx = Math.floor(W * 0.37); const white = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235; let top = -1, bottom = -1; for (let yy = 0; yy < H; yy++) if (white(px(cx, yy))) { if (top < 0) top = yy; bottom = yy; } return { W, H, top, bottom, above: top, below: bottom < 0 ? H : H - 1 - bottom }; })()`);
        // the page is a white grid (#999 lines every 50 page px); the pane's own background, the focus ring and the
        // bar are not white — so the first and last WHITE rows of one column are the drawn picture's top and bottom
      };
      const b1 = await band();
      ok(b1 && b1.top >= 0 && b1.above <= 3 && b1.below > 100, `⑥ the letterbox measured in pixels: the picture starts ${b1 && b1.above} px from the pane's top (a ${b1 && b1.W}×${b1 && b1.H} pane; ${b1 && b1.below} px of spare room all BELOW it, none above)`, JSON.stringify(b1));
      await q(`L.img().style.objectPosition = '50% 50%'; return true;`); // CONTROL: the pre-fix CSS (object-fit's centred default)
      const b0 = await band();
      await q(`L.img().style.objectPosition = ''; return true;`);
      ok(b0 && b0.above > 100 && Math.abs(b0.above - b0.below) <= 6, `⑥ control: the pre-fix centred picture measures ${b0 && b0.above} px of band ABOVE and ${b0 && b0.below} below with the same measure (the study's "a third of the pane")`, JSON.stringify(b0));
      // ── a form page; the user takes over and clicks its input ──
      await q('L.send({ type: "handback" }); return true;');
      await sleep(300);
      const fo = await vb(['open', `http://127.0.0.1:${CP}/form?n=kb1`]);
      await until(() => vps.has('kb1'), 20000, 100);
      ok(fo.ok && vps.has('kb1'), `⑥ the agent opened a form page (${vps.get('kb1') ? vps.get('kb1').w + '×' + vps.get('kb1').h : 'no report'})`, (fo.stderr || fo.stdout).slice(0, 300));
      await (async () => { for (let i = 0; i < 60; i++) { const g = await q('const g = L.geometry(); return g && { w: g.cssW, h: g.cssH }'); const v = vps.get('kb1'); if (g && v && Math.abs(g.w - v.w) <= 1 && Math.abs(g.h - v.h) <= 1) return; await sleep(150); } })();
      await sleep(600); // a frame of the form page
      await q('L.send({ type: "takeover" }); return true;');
      const mineAgain = await (async () => { for (let i = 0; i < 50; i++) { if (await q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard()')) return true; await sleep(100); } return false; })();
      ok(mineAgain, '⑥ Take over ⇒ this view OWNS the keyboard (the claim, the ring, "Typing goes to the browser")');
      const own0 = await q(`const s = L.state(); return { chip: s.kbdChip, ring: L.el().classList.contains('kbd-owned'), sink: document.activeElement === L.kbd(), text: L.el().querySelector('.browser-live-kbd-chip').textContent };`);
      ok(own0.chip && own0.ring && own0.sink && /Typing goes to the browser/.test(own0.text), `⑥ …the bar says "${own0.text}", the picture wears the ring, and focus sits in the view's own sink`, JSON.stringify(own0));
      const sent0 = await q('return L.state().sent');
      const hit = await clickOnce({ dsf: 1, scale: 1, win: [1000, 800], px: 170, py: 40, n: 'kb1' });
      ok(!hit.lost && hit.off <= 2, `⑥ a click on the form's input lands on it (${hit.lost ? 'LOST' : `(${hit.x},${hit.y}), off ${hit.off.toFixed(1)} px`})`);
      const fb = await q(`const s = L.state(); const rp = s.ripples[s.ripples.length - 1] || null; const canvas = L.el().querySelector('.browser-live-canvas'); const cr = canvas.getBoundingClientRect(); const d = L.drawn(); const g = L.geometry(); const exp = { left: (d.left + 170 * d.width / g.cssW - cr.left) * canvas.clientWidth / cr.width, top: (d.top + 40 * d.height / g.cssH - cr.top) * canvas.clientHeight / cr.height }; return { rp, exp, echo: s.echo, sent: s.sent, you: s.youShown, youPt: s.youPt };`);
      ok(fb.rp && Math.abs(fb.rp.x - 170) <= 2 && Math.abs(fb.rp.y - 40) <= 2 && Math.abs(fb.rp.left - fb.exp.left) <= 2 && Math.abs(fb.rp.top - fb.exp.top) <= 2,
        `⑥ the click RIPPLES at the page point it was sent to — (${fb.rp && fb.rp.x},${fb.rp && fb.rp.y}) drawn at (${fb.rp && Math.round(fb.rp.left)},${fb.rp && Math.round(fb.rp.top)}) in the picture, where the page got it`, JSON.stringify(fb));
      ok(fb.sent === sent0 + 1 && /^input sent · \d+$/.test(fb.echo || '') && fb.you && fb.youPt && Math.abs(fb.youPt.x - 170) <= 2, `⑥ …the bar echoes "${fb.echo}" and the "you" marker shows where the page has your pointer`, JSON.stringify(fb));
      // ── the steal: the session's chat window is ATTACHED (session-lifecycle: chatView.focus()), then its composer focused by hand ──
      const composerQ = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); const cv = cw && window.app.sessions.get(cw.id); const ta = cv && cv._chatInput && cv._chatInput._textarea;`;
      const steal = async () => {
        await evaluate(`(() => { const has = [...window.app.wm.windows.values()].some((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); if (!has) window.app.attachSession(${JSON.stringify(sid)}, 'live-hl', ${JSON.stringify(D5)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
        const hasComposer = await (async () => { for (let i = 0; i < 100; i++) { if (await evaluate(`(() => { ${composerQ} return !!ta; })()`)) return true; await sleep(150); } return false; })();
        await sleep(500);
        // the attach path's own call (session-lifecycle.js), then a raw focus on the composer (the ~70 other .focus() sites)
        const after1 = await evaluate(`(() => { ${composerQ} cv.focus(); return { onComposer: document.activeElement === ta, cls: document.activeElement && document.activeElement.className }; })()`);
        const after2 = await evaluate(`(async () => { ${composerQ} ta.focus(); await new Promise((r) => setTimeout(r, 50)); return { onComposer: document.activeElement === ta, cls: document.activeElement && document.activeElement.className }; })()`);
        return { hasComposer, after1, after2 };
      };
      const st1 = await steal();
      ok(st1.hasComposer, '⑥ the session\'s chat window is attached — a live composer exists on the page');
      ok(!st1.after1.onComposer && !st1.after2.onComposer && /browser-live-kbd/.test(st1.after2.cls || ''), `⑥ neither the attach's chatView.focus() nor a raw composer.focus() takes the keyboard while you drive (focus is back in "${st1.after2.cls}")`, JSON.stringify(st1));
      const rc = await q('return L.state().reclaims');
      ok(rc >= 1, `⑥ …the raw focus was RECLAIMED (${rc} reclaim(s)) — the backstop for every focus site the guard does not sit on`);
      // ── type into the CLIENT: real key events, an IME commit, a paste ──
      const typeKeys = async (text) => { for (const ch of text) { const up = ch.toUpperCase(); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Key' + up, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: up.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + up, windowsVirtualKeyCode: up.charCodeAt(0) }); } };
      await typeKeys('tomsmith');
      await until(() => kbds.get('kb1') === 'tomsmith', 8000, 50);
      const comp1 = await evaluate(`(() => { ${composerQ} return ta ? ta.value : null; })()`);
      ok(kbds.get('kb1') === 'tomsmith' && comp1 === '', `⑥ "tomsmith" typed with the composer attached and focused by hand: the PAGE's input holds "${kbds.get('kb1')}", the chat composer holds ${JSON.stringify(comp1)} — nothing typed while you drive reaches a chat box`);
      await send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 }).catch(() => null);
      await send('Input.insertText', { text: '日本' });
      await until(() => /日本$/.test(kbds.get('kb1') || ''), 6000, 50);
      await evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', '!Pw'); (document.activeElement || document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
      await until(() => /!Pw$/.test(kbds.get('kb1') || ''), 6000, 50);
      const comp2 = await evaluate(`(() => { ${composerQ} return ta ? ta.value : null; })()`);
      ok(kbds.get('kb1') === 'tomsmith日本!Pw' && comp2 === '', `⑥ an IME commit ("日本") and a paste ("!Pw") reach the page as TEXT (${JSON.stringify(kbds.get('kb1'))}); the composer is still ${JSON.stringify(comp2)}`);
      const fin = await q('const s = L.state(); return { sent: s.sent, echo: s.echo }');
      ok(fin.sent >= sent0 + 11, `⑥ every act was echoed: ${fin.sent - sent0} input(s) sent since the takeover ("${fin.echo}")`);
      // ── the stale card, where the user looks ──
      const card = await (async () => { for (let i = 0; i < 40; i++) { const c = await evaluate(`(() => { ${composerQ} const el = cw && cw.element.querySelector('.chat-permission-stale'); return el ? el.textContent : null; })()`); if (c) return c; await sleep(150); } return null; })();
      ok(card && /Not run — you took over the browser, so this step went stale/.test(card) && !(await evaluate(`(() => { ${composerQ} return !!(cw && cw.element.querySelector('.chat-perm-allow')); })()`)),
        `⑥ the chat card of the queued click says so — "${card}" — and offers no Allow`);
      // ── CONTROL: the same client with the keyboard owner neutered (one edit, rebuilt here) ⇒ the composer gets it ──
      await q('L.send({ type: "handback" }); return true;');
      await sleep(300);
      const KO = path.join(wt, 'src/lib/keyboard-owner.js');
      const koSrc = fs.readFileSync(KO, 'utf8');
      const mark = 'export function keyboardOwner() {\n';
      if (!ok(koSrc.split(mark).length === 2, '⑥ control setup: keyboard-owner.js carries its owner function exactly once')) return;
      fs.copyFileSync(path.join(wt, 'public/bundle.js'), path.join(wt, 'public/bundle.js.lanej2'));
      fs.writeFileSync(KO, koSrc.replace(mark, mark + '  return null; // NEGATIVE CONTROL: nobody owns the keyboard (the pre-fix client)\n'));
      let built = true; try { execFileSync('npx', ['esbuild', 'src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wt, stdio: 'ignore', timeout: 120000 }); } catch { built = false; }
      const restore = async () => {
        fs.writeFileSync(KO, koSrc); fs.copyFileSync(path.join(wt, 'public/bundle.js.lanej2'), path.join(wt, 'public/bundle.js')); fs.rmSync(path.join(wt, 'public/bundle.js.lanej2'), { force: true });
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT5}/` });
        for (let i = 0; i < 160; i++) { try { if (await evaluate('!!(window.app && window.app.wm && window.app.sidebar)')) break; } catch { } await sleep(250); }
        try { await evaluate('window.app.ready'); } catch { }
      };
      try {
        if (!ok(built, '⑥ control: the neutered client was rebuilt')) return;
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT5}/` });
        let up = false; for (let i = 0; i < 160 && !up; i++) { try { up = await evaluate('!!(window.app && window.app.wm && window.app.sidebar)'); } catch { } if (!up) await sleep(250); }
        await evaluate('window.app.ready');
        if (!ok(up, '⑥ control: the neutered client booted')) return;
        await evaluate(`(() => { if (![...window.app.wm.windows.values()].some((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})) window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)} }); return true; })()`);
        await (async () => { for (let i = 0; i < 100; i++) { if (await q('return !!(L && L.state().frames >= 1 && L.geometry())')) return; await sleep(150); } })();
        await q('L.send({ type: "takeover" }); return true;');
        await (async () => { for (let i = 0; i < 50; i++) { if (await q('return L.state().mode === "takeover" && L.state().mine')) return; await sleep(100); } })();
        const before = kbds.get('kb1');
        const hitC = await clickOnce({ dsf: 1, scale: 1, win: [1000, 800], px: 170, py: 40, n: 'kb1' });
        const stC = await steal();
        await typeKeys('tomsmith');
        await sleep(1500);
        const compC = await evaluate(`(() => { ${composerQ} return ta ? ta.value : null; })()`);
        ok(!hitC.lost && stC.after1.onComposer && compC === 'tomsmith' && kbds.get('kb1') === before,
          `⑥ NEGATIVE CONTROL (the keyboard owner neutered — the pre-fix client): the attach puts the caret in the composer and "tomsmith" lands in the CHAT COMPOSER (${JSON.stringify(compC)}) while the page keeps ${JSON.stringify(kbds.get('kb1'))} — the study's password-in-the-chat-box`, JSON.stringify({ hitC, stC, compC, page: kbds.get('kb1') }));
        await evaluate(`(() => { ${composerQ} if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`); // never sent: cleared in place
        await q('L.send({ type: "handback" }); return true;');
      } finally { await restore(); }
      // back on the real client for what follows (the headed shape)
      await evaluate(`(() => { if (![...window.app.wm.windows.values()].some((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})) window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)} }); return true; })()`);
      await (async () => { for (let i = 0; i < 60; i++) { if (await q('return !!(L && L.state().frames >= 1)')) return; await sleep(150); } })();
    };
    const SHAPES = [
      { name: 'headless (the default config)', key: 'hl', config: { headed: false, args: '--no-sandbox,--disable-blink-features=AutomationControlled' } },
      { name: 'HEADED on a 2560×1440 screen (the owner\'s shape)', key: 'hd', config: { headed: true, args: '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=x11' }, needsDisplay: true },
    ];
    for (const shape of SHAPES) {
      if (shape.needsDisplay && DISPLAY_N === null) { skip(`⑤ ${shape.name}: no Xvfb (or no free display) for a headed browser`); continue; }
      fs.writeFileSync(path.join(HOME5, '.agent-browser', 'config.json'), JSON.stringify(shape.config));
      const envBefore = new Set(fs.readdirSync(ENVS));
      const nCreated = msgs.filter((m) => m.type === 'created').length;
      wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: D5, cols: 80, rows: 24, reqId: 'r5-' + shape.key, name: 'live-' + shape.key }));
      await until(() => msgs.filter((m) => m.type === 'created').length > nCreated, 20000);
      const created = msgs.filter((m) => m.type === 'created').length > nCreated ? msgs.filter((m) => m.type === 'created').at(-1) : null;
      if (!ok(created && created.sessionId, `⑤ ${shape.name}: a chat session was created`, journal.slice(-500))) continue;
      createdIds.push(created.sessionId);
      await until(() => fs.readdirSync(ENVS).some((f) => !envBefore.has(f) && f.endsWith('.env')), 15000, 100);
      const envFile = fs.readdirSync(ENVS).find((f) => !envBefore.has(f) && f.endsWith('.env'));
      const stdinFile = path.join(ENVS, envFile.replace(/\.env$/, '.stdin')); // lane J r2: what the server wrote to the fake CLI
      const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
      const pairs = Object.fromEntries(Object.entries(senv).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
      if (pairs.AGENT_BROWSER_SESSION) sessionNames.add(pairs.AGENT_BROWSER_SESSION);
      if (!ok(pairs.AGENT_BROWSER_SESSION && senv.VIBESPACE_SESSION_TOKEN && senv.VIBESPACE_API, `⑤ ${shape.name}: the session was spawned with its own browser pairs (rung ${senv.VIBESPACE_BROWSER_VARIANT || '?'})`, JSON.stringify(Object.keys(pairs)))) continue;
      const vb = (args, timeout = 120000) => new Promise((resolve) => { const { execFile } = require('child_process'); execFile(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), ...args], { env: { ...baseEnv, ...pairs, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN }, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), code: err && err.code })); });
      const tag = shape.key + '1';
      const opened = await vb(['open', `http://127.0.0.1:${CP}/grid?n=${tag}`]);
      if (!opened.ok && /exited early|DevToolsActivePort|crash|exit code|Missing X server|cannot open display/i.test(opened.stderr + opened.stdout)) { skip(`⑤ ${shape.name}: the real chromium did not launch here: ${(opened.stderr || opened.stdout).replace(/\s+/g, ' ').slice(0, 200)}`); continue; }
      if (!ok(opened.ok, `⑤ ${shape.name}: \`vibespace-browser open\` started the session's own ephemeral browser on the grid page`, (opened.stderr || opened.stdout).slice(0, 400))) continue;
      await until(() => vps.has(tag), 20000, 100);
      const truth = vps.get(tag);
      if (!ok(truth && truth.w > 0, `⑤ ${shape.name}: the page reports its own viewport (${truth ? truth.w + '×' + truth.h + ' @' + truth.dpr : 'none'})`)) continue;
      // the live view
      const opened2 = await evaluate(`(() => { const w = window.app.openBrowserLive({ sessionId: ${JSON.stringify(created.sessionId)} }); w.gridBounds = null; return !!(w && w._browserLive); })()`);
      ok(opened2, `⑤ ${shape.name}: the live view opened`);
      const q = (js) => evaluate(`(() => { const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(created.sessionId)})[0]; const L = w && w._browserLive; ${js} })()`);
      const live = await (async () => { for (let i = 0; i < 150; i++) { const st = await q('const g = L && L.geometry(); return L ? { frames: L.state().frames, nat: L.img().naturalWidth, src: g && g.source } : null'); if (st && st.frames >= 1 && st.nat > 0 && st.src === 'page') return st; await sleep(200); } return q('const g = L && L.geometry(); return L ? { frames: L.state().frames, nat: L.img().naturalWidth, src: g && g.source, err: L.state().error } : null'); })();
      if (!ok(live && live.frames >= 1 && live.src === 'page', `⑤ ${shape.name}: frames drawn and the page's own viewport read (geometry source "${live && live.src}")`, JSON.stringify(live))) continue;
      const geo0 = await q('return { g: L.geometry(), claim: L.frameClaim() }');
      ok(Math.abs(geo0.g.cssW - truth.w) <= 1 && Math.abs(geo0.g.cssH - truth.h) <= 1, `⑤ ${shape.name}: the view's page size ${Math.round(geo0.g.cssW)}×${Math.round(geo0.g.cssH)} IS the page's (${truth.w}×${truth.h}); the picture is ${geo0.g.picW}×${geo0.g.picH}; the stream's metadata claims ${geo0.claim && geo0.claim.width}×${geo0.claim && geo0.claim.height}`);
      shape.picture = `${geo0.g.picW}×${geo0.g.picH}`; shape.page = `${truth.w}×${truth.h}`; shape.claim = geo0.claim ? `${geo0.claim.width}×${geo0.claim.height}` : '?';
      // ⑥: the approval must be QUEUED before the takeover (the study's order) — judged on its terminal signal, never a
      // sleep: the server's own normalizer published the pending card (the creator's socket hears every `msg` op)
      {
        const queued = () => msgs.some((m) => m.type === 'msg' && m.sessionId === created.sessionId && m.op === 'edit' && m.fields && m.fields.permission && m.fields.permission.requestId === 'req_lj2_click' && !m.fields.permission.resolved);
        await until(queued, 15000, 50);
        ok(queued(), `⑥ ${shape.name}: the agent's approval for \`vibespace-browser click @e3\` is pending on the server (its card published) BEFORE the takeover`);
      }
      await q('L.send({ type: "takeover" }); return true;');
      if (!ok(await (async () => { for (let i = 0; i < 50; i++) { if (await q('return L.state().mode === "takeover" && L.state().mine')) return true; await sleep(100); } return false; })(), `⑤ ${shape.name}: Take over — this viewer drives`)) continue;
      {
        // ⑥ lane J r2: the approval the agent queued at spawn (a browser `click`) is answered STALE by this takeover
        const denied = () => { try { return fs.readFileSync(stdinFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((x) => x && x.type === 'control_response' && x.response && x.response.request_id === 'req_lj2_click') || null; } catch { return null; } };
        await until(() => !!denied(), 8000, 100);
        const d = denied();
        ok(d && d.response.response.behavior === 'deny' && /^browser_paused — the user took over your browser before this step ran, so it did NOT run/.test(d.response.response.message),
          `⑥ ${shape.name}: the TAKEOVER answered the approval the agent queued before it (vibespace-browser click @e3) — the CLI's stdin received a deny naming browser_paused, never a stale Allow`, d ? JSON.stringify(d).slice(0, 300) : `stdin: ${fs.existsSync(stdinFile) ? JSON.stringify(fs.readFileSync(stdinFile, 'utf8').slice(0, 300)) : 'no file'} · journal: ${journal.split('\n').filter((l) => /approval|stale|took over|handed back/i.test(l)).slice(-6).join(' | ').slice(0, 1500)}`);
      }
      /** One click where page point (px, py) is DRAWN, by the judge's own object-fit arithmetic over the page's reported viewport. */
      const clickOnce = async ({ dsf, scale, win, px = 525, py = 275, n = tag, control = false }) => {
        await metrics(dsf);
        await evaluate(`(() => { document.body.style.zoom = ${scale} === 1 ? '' : '${scale}'; document.documentElement.style.setProperty('--ui-scale', '${scale}'); return true; })()`);
        // the live window at the requested VIEWPORT size (layout px = viewport px / the UI scale)
        await q(`const s = ${scale}; const el = w.element; w.gridBounds = null; window.app.wm.focusWindow?.(w.id); el.style.left = (24 / s) + 'px'; el.style.top = (12 / s) + 'px'; el.style.width = (${win[0]} / s) + 'px'; el.style.height = (${win[1]} / s) + 'px'; w.onResize && w.onResize(); return true;`);
        await sleep(250);
        const t0 = vps.get(n);
        const g = await q('const r = L.img().getBoundingClientRect(); const op = getComputedStyle(L.img()).objectPosition; return { left: r.left, top: r.top, width: r.width, height: r.height, natW: L.img().naturalWidth, natH: L.img().naturalHeight, claim: L.frameClaim(), page: L.pageReading(), op };');
        const k = Math.min(g.width / g.natW, g.height / g.natH); const dw = g.natW * k, dh = g.natH * k;
        // the judge's own object-fit arithmetic over the RENDERED object-position (the browser's computed CSS — never our
        // LIVE_ALIGN constant): lane J r2 top-aligns the picture, so the drawn picture no longer sits in the element's middle
        const frac = (v, room) => (/%$/.test(v) ? parseFloat(v) / 100 : room ? parseFloat(v) / room : 0.5);
        const [opx = '50%', opy = '50%'] = String(g.op || '').split(/\s+/);
        const cx = g.left + (g.width - dw) * frac(opx, g.width - dw) + px * dw / t0.w, cy = g.top + (g.height - dh) * frac(opy, g.height - dh) + py * dh / t0.h;
        const before = clicks.length;
        if (!control) {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
        } else {
          // the PRE-FIX client: the same pointer through the same two calls of the PATCHED module, sent through the same socket
          const g0 = S0.frameGeometry({ picW: g.natW, picH: g.natH, page: g.page, meta: g.claim });
          const pre = g0 && S0.pointerToDevice({ clientX: cx, clientY: cy, elRect: { left: g.left, top: g.top, width: g.width, height: g.height }, frameW: g0.cssW, frameH: g0.cssH, picW: g0.picW, picH: g0.picH });
          if (!pre) return { dropped: true };
          await q(`L.send(${JSON.stringify(S.mouseRecord({ kind: 'down', pt: pre }))}); L.send(${JSON.stringify(S.mouseRecord({ kind: 'up', pt: pre }))}); return true;`);
        }
        await until(() => clicks.length > before, 4000, 25);
        const c = clicks.slice(before).find((x) => x.n === n);
        return c ? { x: c.x, y: c.y, dx: c.x - px, dy: c.y - py, off: Math.hypot(c.x - px, c.y - py) } : { lost: true };
      };
      for (const dsf of [2, 1]) for (const scale of [1, 1.25]) for (const win of [[1400, 800], [700, 900]]) {
        const fixed = await clickOnce({ dsf, scale, win });
        const pre = await clickOnce({ dsf, scale, win, control: true });
        results.push({ kind: 'combo', shape: shape.name, dsf, scale, win: win.join('×'), fixed, pre });
      }
      const mine = results.filter((r) => r.kind === 'combo' && r.shape === shape.name);
      console.log(`    ⑤ ${shape.name}: page ${shape.page}, picture ${shape.picture}, metadata claims ${shape.claim} — click on grid cell (10,5) = page (525,275):\n` + mine.map((r) => `      DSF ${r.dsf} · UI ${Math.round(r.scale * 100)}% · window ${r.win}: FIXED ${r.fixed.lost ? 'LOST' : `(${r.fixed.x},${r.fixed.y}) off ${r.fixed.off.toFixed(1)}px`} · PRE-FIX ${r.pre.dropped ? 'dropped (mapped outside the picture)' : r.pre.lost ? 'LOST' : `(${r.pre.x},${r.pre.y}) off ${r.pre.off.toFixed(0)}px`}`).join('\n'));
      ok(mine.length === 8 && mine.every((r) => !r.fixed.lost && r.fixed.off <= 2), `⑤ ${shape.name}: at DPR 2/1 × UI scale 100/125 % × a 1400×800 and a 700×900 window, the click lands within 2 px of the drawn grid cell (worst ${Math.max(...mine.map((r) => (r.fixed.lost ? Infinity : r.fixed.off))).toFixed(1)} px)`, JSON.stringify(mine.filter((r) => r.fixed.lost || r.fixed.off > 2)));
      ok(mine.every((r) => r.pre.dropped || (!r.pre.lost && r.pre.off > 20)), `⑤ ${shape.name}: control — the PRE-FIX mapping (the metadata's ${shape.claim}) misses by > 20 px or drops the click, on the same rung (worst ${Math.max(...mine.map((r) => (r.pre.dropped || r.pre.lost ? 0 : r.pre.off))).toFixed(0)} px)`, JSON.stringify(mine.map((r) => r.pre)));
      if (shape.key === 'hl') {
        // the ephemeral browser's viewport after the agent opens a tab and after it resizes the page
        await q('L.send({ type: "handback" }); return true;');
        await sleep(300);
        const tabRes = await vb(['tab', 'new', `http://127.0.0.1:${CP}/grid?n=hl2`]);
        await until(() => vps.has('hl2'), 20000, 100);
        const setRes = tabRes.ok ? await vb(['set', 'viewport', '1000', '700']) : { ok: false };
        await until(() => vps.get('hl2') && vps.get('hl2').w === 1000, 15000, 100);
        const tv = vps.get('hl2');
        const settled = await (async () => { for (let i = 0; i < 100; i++) { const g = await q('const g = L.geometry(); return g && { w: g.cssW, h: g.cssH, src: g.source, nat: L.img().naturalWidth }'); if (g && tv && Math.abs(g.w - tv.w) <= 1 && Math.abs(g.h - tv.h) <= 1 && g.src !== 'picture-stale') return g; await sleep(150); } return null; })();
        ok(tabRes.ok && setRes.ok && tv && tv.w === 1000 && settled, `⑤ a NEW TAB then \`set viewport 1000 700\`: the view re-reads the page (${settled ? Math.round(settled.w) + '×' + Math.round(settled.h) + ' from ' + settled.src : 'no'}; the page says ${tv ? tv.w + '×' + tv.h : '?'})`, JSON.stringify({ tab: tabRes.stderr.slice(0, 200), set: setRes.stderr && setRes.stderr.slice(0, 200) }));
        await q('L.send({ type: "takeover" }); return true;');
        await sleep(300);
        const after = await clickOnce({ dsf: 2, scale: 1.25, win: [700, 900], n: 'hl2' });
        results.push({ kind: 'combo-extra', fixed: after });
        ok(!after.lost && after.off <= 2, `⑤ …and a click on grid cell (10,5) of the new tab at its new viewport lands within 2 px (${after.lost ? 'LOST' : `(${after.x},${after.y}) off ${after.off.toFixed(1)} px`})`);
        await laneJ2({ q, clickOnce, created, vb });
      }
      await q('L.send({ type: "handback" }); return true;');
      await sleep(200);
      await vb(['close'], 30000).catch(() => { });
    }
    try { cdp.close(); } catch { }
  } finally {
    if (wsKill && wsKill.readyState === 1) { for (const id of createdIds) { try { wsKill.send(JSON.stringify({ type: 'kill', sessionId: id })); } catch { } } await sleep(1200); try { wsKill.close(); } catch { } }
    for (const p of procs5.reverse()) { try { p.kill('SIGKILL'); } catch { } }
    if (xvfb) { try { xvfb.kill('SIGTERM'); } catch { } await new Promise((r) => { if (xvfb.exitCode !== null || xvfb.signalCode) r(); else { xvfb.once('exit', r); setTimeout(r, 3000); } }); }
    await new Promise((r) => col.close(() => r()));
    // the REAL daemons this leg's sessions started (the keeper launched them, detached) and their browsers — every
    // process still standing in the leg's own worktree (the server's cwd, inherited by the daemons and their chromes)
    reapDaemons(sessionNames, { cwdUnder: path.join(ROOT, 'wt5') });
    cleanupHome5();
  }
})().catch((e) => ok(false, '⑤ the real-rung leg threw', e && (e.stack || e.message)));

done();
