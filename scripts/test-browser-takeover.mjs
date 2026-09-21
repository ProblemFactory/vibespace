#!/usr/bin/env node
// AGENT BROWSER P3 — TAKEOVER / HANDBACK / IDLE / --confirm-actions, and the
// §4.3.1 SPEND WIRING (docs/design-agent-browser-v2.md §4.3 / §4.3.1). FAST.
//
//   ① PURE (src/browser-takeover.js): the input-state transitions (a second
//      live viewer is `held`, the same viewer is idempotent, any viewer may hand
//      back), the idle verdict (0 = never), the three announce moments, the
//      typed browser_paused refusal, the handback text carrying the URL, the
//      confirmation reader over the documented 0.32.0 shape, the agent cursor
//      off a `command` mirror, the badge's three sentences; the CDP-shaped
//      input records + the inverse DPI mapping (src/browser-stream.js).
//   ② THE REAL KEEPER over a fake `agent-browser` (a real `sleep` daemon):
//      takeover flips the lease's input side and `resolveFor` refuses the
//      agent's command with `browser_paused` (a child handle is NOT paused),
//      the same viewer again is idempotent, another viewer is `held`, handback
//      re-opens `resolveFor`, an idle takeover lapses on the keeper's OWN tick
//      with an injected clock (and 0 never lapses), detach drops the state
//      with a `detach` handback, a `confirmation_required` mirror lands in the
//      registry and `answerConfirmation` runs the CLI's own `confirm <id>`
//      under the lease's session (a gone id is `no_confirmation`).
//   ③ THE ANNOUNCER (src/server/browser-handback.js) against a fake ladder:
//      explicit ⇒ delivered ONCE, `spendReason: 'browser-handback'`,
//      `kind: 'notification'`, the URL in the text; idle (default) ⇒ NOTHING
//      delivered, ONE inbox item, the zero-spend notice queued; idle with
//      browser.announceIdleHandback ON ⇒ delivered under the same reason;
//      viewer-left ⇒ nothing, no inbox item; a REFUSED delivery ⇒ stashed +
//      noticed (nothing lost); the reason is DECLARED in SPEND_REASONS and the
//      literal at the site equals the PURE constant; the census's row exists.
//   ④ THE REAL BRIDGE over a fake upstream: `takeover` ⇒ `mode` to every
//      viewer with `mine` only for the holder; the holder's `input_mouse` is
//      forwarded upstream, another viewer's is refused `watch-mode`; a second
//      `takeover` is `held`; `handback` ⇒ watch for all; the HOLDER'S SOCKET
//      CLOSING hands back (`viewer-left`); a `confirmation_required` result
//      reaches viewers as a typed `confirmation` and is replayed to a late
//      one; a viewer's `confirm` is acked through the keeper.
//   ⑤ THE ROUTES in-process: POST /api/browser/handback (409 not_taken when
//      nobody drives; ok after a takeover), POST /api/browser/confirm;
//      /api/agent/browser/resolve answers 409 browser_paused with takenAt.
//   ⑥ THE SHIPPED CLI: `vibespace-browser -- snapshot` exits 1 and prints
//      `[browser_paused]` + the waiting instruction (never a retry).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const T = require('../src/browser-takeover.js');
const S = require('../src/browser-stream.js');
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const BS = require('../src/server/browser-stream.js');
const H = require('../src/server/browser-handback.js');
const A = require('../src/spend-authorizer.js');
const { WebSocket, WebSocketServer } = require('ws');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 3000, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };

// ── scratch world ──
const ROOT = scratch('browser-takeover');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
// The FAKE agent-browser (the handles suite's, plus `confirm`/`deny` which log
// the env they ran under — the suite asserts the lease's SESSION name).
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
if (a === 'confirm' || a === 'deny') { fs.appendFileSync(path.join(st, 'confirms.log'), JSON.stringify({ verb: a, id: b, ns, session: process.env.AGENT_BROWSER_SESSION || null, profile: process.env.AGENT_BROWSER_PROFILE || null }) + '\\n'); if (b === 'c_gone') { out({ success: false, data: null, error: 'No pending confirmation' }); process.exit(1); } out({ success: true, data: { confirmed: a === 'confirm', id: b }, error: null }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const confirms = () => { try { return fs.readFileSync(path.join(AB_STATE, 'confirms.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const spawnedPids = new Set();
function reapAll() { for (const l of launches()) if (l.pid) spawnedPids.add(l.pid); for (const pid of spawnedPids) { try { process.kill(pid, 'SIGKILL'); } catch { } } }
const servers = [];
function cleanup() { reapAll(); for (const s of servers) { try { s.close(); } catch { } } fs.rmSync(ROOT, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
const rtEnv = { FAKE_AB_STATE: AB_STATE, PATH: PATH_ENV, HOME };
const F = require('../src/browser-facts.js');
let clock = 1_000_000;
const now = () => clock;

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the input side, the three moments, the refusal, the confirmation reader (PURE)');
{
  const t0 = T.decideTakeover({ state: null, viewerId: 7, now: 100 });
  ok(t0.ok && t0.state.input === 'user' && t0.state.takenBy.viewerId === 7 && t0.state.takenAt === 100 && !t0.already, 'a first takeover flips the side to user and records who/when');
  ok(T.decideTakeover({ state: t0.state, viewerId: 7, now: 200 }).already === true, 'the same viewer again is idempotent');
  const held = T.decideTakeover({ state: t0.state, viewerId: 8, now: 200 });
  ok(!held.ok && held.code === 'held' && held.holder.viewerId === 7, 'another viewer while the holder is alive ⇒ typed `held` naming the holder');
  ok(T.decideTakeover({ state: t0.state, viewerId: 8, now: 200, holderAlive: false }).ok, '…but a holder whose socket is gone never blocks');
  ok(T.decideTakeover({ state: null, viewerId: null }).code === 'bad-request', 'a takeover needs a viewer');
  const hb = T.decideHandback({ state: t0.state, viewerId: 9, cause: 'explicit', now: 5100, url: 'https://x.test/login' });
  ok(hb.ok && hb.state.input === 'agent' && hb.state.url === 'https://x.test/login' && hb.heldMs === 5000 && hb.byHolder === false && hb.cause === 'explicit', 'any viewer may hand back; the URL and the held span ride the state');
  ok(T.decideHandback({ state: hb.state, cause: 'explicit' }).code === 'not_taken', 'a handback with nobody driving is `not_taken`');
  ok(T.decideHandback({ state: t0.state, cause: 'bogus' }).cause === 'explicit', 'an unknown cause is spelled explicit (never a fourth word)');
  const idle = T.idleHandbackVerdict({ state: { ...t0.state, lastUserInputAt: 1000 }, now: 1000 + 60000, idleMs: 60000 });
  ok(idle.lapsed && /no input for/.test(idle.why), 'the idle verdict lapses at the window');
  ok(!T.idleHandbackVerdict({ state: { ...t0.state, lastUserInputAt: 1000 }, now: 1000 + 59999, idleMs: 60000 }).lapsed, '…not one ms before');
  ok(!T.idleHandbackVerdict({ state: t0.state, now: 9e12, idleMs: 0 }).lapsed && /off/.test(T.idleHandbackVerdict({ state: t0.state, now: 9e12, idleMs: 0 }).why), '0 = never (a real choice, said)');
  ok(T.takeoverIdleMs(undefined) === T.DEFAULT_TAKEOVER_IDLE_MS && T.takeoverIdleMs('x') === T.DEFAULT_TAKEOVER_IDLE_MS && T.takeoverIdleMs(0) === 0 && T.takeoverIdleMs(5000) === T.MIN_TAKEOVER_IDLE_MS && T.takeoverIdleMs(120000) === 120000, 'the setting: unreadable ⇒ default, 0 ⇒ never, floor 30 s');
  ok(T.announceVerdict({ cause: 'explicit' }).deliver === true && T.announceVerdict({ cause: 'explicit' }).reason === 'browser-handback', 'an explicit handback DELIVERS under the declared reason');
  ok(T.announceVerdict({ cause: 'idle' }).deliver === false && T.announceVerdict({ cause: 'viewer-left' }).deliver === false, 'idle / viewer-left deliver NOTHING by default (zero-spend by construction)');
  ok(T.announceVerdict({ cause: 'idle', announceIdle: true }).deliver === true && T.announceVerdict({ cause: 'idle', announceIdle: true }).reason === 'browser-handback', '…and browser.announceIdleHandback ON routes it through the same reason');
  ok(T.announceVerdict({ cause: 'restart', announceIdle: true }).deliver === false && T.announceVerdict({ cause: 'detach', announceIdle: true }).deliver === false, 'restart / detach are state changes only, whatever the setting');
  const paused = T.browserPausedRefusal({ state: t0.state, label: 'Work', handles: ['work'], now: 60100, idleMs: 600000 });
  ok(!paused.ok && paused.code === 'browser_paused' && /took over the "Work" browser 60 s ago/.test(paused.error) && /did NOT run/.test(paused.error) && /10 min/.test(paused.error) && /Do not retry/.test(paused.error) && paused.takenAt === 100, 'the paused refusal names who/when, that the command did not run, when control returns, and forbids a loop');
  ok(/explicitly$|explicitly\)/.test(T.browserPausedRefusal({ state: t0.state, idleMs: 0 }).error) && !/after/.test(T.browserPausedRefusal({ state: t0.state, idleMs: 0 }).error.split('Wait')[1]), 'with idle handback off the refusal promises only the explicit handback');
  const text = T.handbackText({ cause: 'explicit', label: 'Work', url: 'https://x.test/after-login', heldMs: 90000 });
  ok(/handed the "Work" browser back to you after 2 min/.test(text) && /Current URL: https:\/\/x\.test\/after-login/.test(text) && /Re-orient/.test(text), 'the announcement carries the URL first and the re-orient instruction');
  ok(/lapsed \(no input for 10 min\)/.test(T.handbackText({ cause: 'idle', idleMs: 600000 })) && /unknown \(read it/.test(T.handbackText({ cause: 'idle', idleMs: 600000 })), 'an idle announcement says it lapsed and, with no URL, says how to read it');
  ok(/<system-reminder>/.test(T.renderHandbackNotice(T.handbackNotice({ cause: 'idle', url: 'u' }))) && T.handbackNotice({ cause: 'nope' }).cause === 'idle' && T.handbackNotice({ cause: 'explicit' }).kind === 'browser-handback', 'the zero-spend notice is a typed kind rendered as a system reminder');
  const item = T.idleInboxItem({ label: 'Work', idleMs: 600000, url: 'https://x.test', sessionName: 'one' });
  ok(/lapsed after 10 min/.test(item.text) && /\(one\)/.test(item.text) && /Nothing was sent to the agent/.test(item.detail) && item.urgency === 'low', 'the idle inbox item says the takeover lapsed and that nothing was sent');
  // --confirm-actions: the documented 0.32.0 answer shape, both nestings, and the error-text fallback
  const c1 = T.confirmationFromUpstream({ type: 'result', action: 'eval', id: 'r1', success: false, confirmation_required: true, confirmation_id: 'c_8f3a1234', timestamp: 5000 });
  ok(c1 && c1.id === 'c_8f3a1234' && c1.action === 'eval' && c1.expiresAt === 5000 + T.CONFIRM_TTL_MS && c1.commandId === 'r1', 'a top-level confirmation_required result is read (id, action, the 60 s ttl)');
  ok(T.confirmationFromUpstream({ type: 'result', action: 'download', data: { confirmation_required: true, confirmation_id: 'c_1', category: 'download' } }, 1).category === 'download', '…and a data-nested one');
  ok(T.confirmationFromUpstream({ type: 'result', action: 'click', success: false, error: 'Action requires confirmation: run agent-browser confirm c_abcd12' }, 1)?.id === 'c_abcd12', '…and the id inside an error text');
  ok(T.confirmationFromUpstream({ type: 'result', action: 'click', success: true, data: { ok: true } }, 1) === null && T.confirmationFromUpstream({ type: 'frame' }) === null, 'an ordinary result / a frame is not a confirmation');
  ok(T.confirmationResolvedFromUpstream({ type: 'command', action: 'confirm', params: { id: 'c_1' } })?.decision === 'confirm' && T.confirmationResolvedFromUpstream({ type: 'command', action: 'deny', params: { args: ['c_2'] } })?.id === 'c_2' && T.confirmationResolvedFromUpstream({ type: 'command', action: 'click', params: {} }) === null, 'a confirm/deny command resolves its id');
  ok(T.decisionArgv('c_1', 'deny').argv.join(' ') === 'deny c_1' && T.decisionArgv('c_1', 'yes').code === 'bad-request' && T.decisionArgv('../x', 'confirm').code === 'bad-request', 'an answer becomes upstream\'s own verb; a bad decision/id is refused before any spawn');
  ok(T.decisionVerdict({ success: false, error: 'No pending confirmation' }).code === 'no_confirmation' && T.decisionVerdict({ success: true }).ok && T.decisionVerdict(null).code === 'unavailable', 'the daemon\'s answers are typed (gone / ok / no answer)');
  const cv = T.confirmationView(c1, 5000 + 59000);
  ok(cv.remainingMs === 1000 && !cv.expired && T.confirmationView(c1, 5000 + 60000).expired, 'the card counts down to the auto-deny');
  // the agent cursor + the badge
  ok(JSON.stringify(T.agentCursorFromCommand({ type: 'command', action: 'click', params: { x: 10.4, y: 20 }, timestamp: 9 })) === JSON.stringify({ action: 'click', x: 10.4, y: 20, at: 9 }), 'a pointer command with coordinates is the cursor');
  ok(T.agentCursorFromCommand({ type: 'command', action: 'click', params: { selector: '#go' } })?.x === null && T.agentCursorFromCommand({ type: 'command', action: 'snapshot', params: {} }) === null && T.agentCursorFromCommand({ type: 'result', action: 'click', params: { x: 1, y: 1 } }) === null, 'a selector click keeps the label with no point; a non-pointer command / a result is nothing');
  ok(T.agentCursorFromCommand({ type: 'command', action: 'input_touch', params: { touchPoints: [{ x: 3, y: 4 }] } })?.y === 4, 'a touch command\'s first point is the cursor');
  ok(T.modeBadge({ mode: 'watch' }) === 'Agent is driving' && T.modeBadge({ mode: 'takeover', mine: true }) === 'You are driving — agent asked to pause' && T.modeBadge({ mode: 'takeover', mine: false }) === 'Another viewer is driving — agent asked to pause', 'the badge has exactly three sentences, "asked to pause" because the lease cannot enforce more');
  ok(T.inputSummary([{ input: 'agent' }, { input: 'user', takenAt: 5 }], true).input === 'user' && T.inputSummary([], true).input === 'agent' && T.inputSummary([], false) === null, 'the published summary: user while anybody drives, agent with a browser, null without');
  // the CDP-shaped input records + the inverse DPI mapping
  ok(JSON.stringify(S.mouseRecord({ kind: 'down', pt: { x: 100.4, y: 200 }, button: 2, modifiers: 8 })) === JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 100, y: 200, button: 'right', clickCount: 1, modifiers: 8 }), 'input_mouse press = the README\'s shape (button words, clickCount 1, rounded px)');
  ok(S.mouseRecord({ kind: 'move', pt: { x: 1, y: 2 } }).eventType === 'mouseMoved' && S.mouseRecord({ kind: 'move', pt: { x: 1, y: 2 } }).button === 'none' && S.mouseRecord({ kind: 'up', pt: { x: 1, y: 2 } }).eventType === 'mouseReleased' && S.mouseRecord({ kind: 'down', pt: null }) === null, 'move/up/null-point');
  ok(S.wheelRecord({ pt: { x: 5, y: 6 }, deltaY: 120 }).eventType === 'mouseWheel' && S.wheelRecord({ pt: { x: 5, y: 6 }, deltaY: 120 }).deltaY === 120, 'input_mouse wheel carries the deltas');
  const kd = S.keyRecord({ kind: 'down', key: 'Enter', code: 'Enter', modifiers: 2 });
  ok(kd.type === 'input_keyboard' && kd.eventType === 'keyDown' && kd.text === '\r' && kd.windowsVirtualKeyCode === 13 && kd.modifiers === 2 && S.keyRecord({ kind: 'up', key: 'a' }).text === undefined && S.keyRecord({ kind: 'down', key: 'a' }).text === 'a', 'input_keyboard: text only on keyDown of a printable/Enter key, the vk code, the modifier bitmask');
  ok(S.modifiersOf({ altKey: true, shiftKey: true }) === 9 && S.modifiersOf({ ctrlKey: true, metaKey: true }) === 6, 'the modifier bitmask is CDP\'s (alt 1, ctrl 2, meta 4, shift 8)');
  ok(S.touchRecord({ kind: 'start', pt: { x: 1, y: 2 } }).touchPoints.length === 1 && S.touchRecord({ kind: 'end', pt: { x: 1, y: 2 } }).touchPoints.length === 0, 'input_touch start carries the point, end carries none');
  const rect = { left: 10, top: 20, width: 640, height: 360 };
  const dev = S.pointerToDevice({ clientX: 330, clientY: 200, elRect: rect, frameW: 1280, frameH: 720 });
  const back = S.deviceToViewport({ x: dev.x, y: dev.y, elRect: rect, frameW: 1280, frameH: 720 });
  ok(dev.x === 640 && dev.y === 360 && Math.round(back.left) === 330 && Math.round(back.top) === 200, 'deviceToViewport is pointerToDevice\'s inverse (the agent cursor lands where the click was)');
  ok(S.deviceToViewport({ x: 1, y: 1, elRect: rect, frameW: 0, frameH: 0 }) === null, '…and null before a frame has a size');
  const v = S.viewerMessageVerdict({ type: 'takeover' });
  ok(v.kind === 'takeover' && !v.forward && S.viewerMessageVerdict({ type: 'handback' }).kind === 'handback' && S.viewerMessageVerdict({ type: 'confirm', id: 'c_1', decision: 'deny' }).decision === 'deny' && S.viewerMessageVerdict({ type: 'confirm', id: 'c_1', decision: 'x' }).decision === 'confirm', 'the three control verbs are decided, never forwarded');
  ok(S.viewerMessageVerdict({ type: 'input_mouse' }, { mode: 'takeover', holder: 3, viewerId: 3 }).forward === true && S.viewerMessageVerdict({ type: 'input_mouse' }, { mode: 'takeover', holder: 3, viewerId: 4 }).refusal.code === 'watch-mode' && !/P3/.test(S.viewerMessageVerdict({ type: 'input_mouse' }, {}).refusal.error), 'input is forwarded only from the holder; the watch-mode refusal no longer says P3');
  ok(S.hello({}).protocol.input === 'holder-only' && S.hello({}).protocol.control.join(',') === 'takeover,handback,confirm', 'the hello names the input rule and the control verbs');
}

// ═══ ② THE REAL KEEPER ════════════════════════════════════════════════════
console.log('— ② the real keeper: browser_paused, idle on its own tick, detach, the confirmation registry');
const settings = { 'browser.takeoverIdleMs': 30000, 'browser.idleTimeoutMs': 600000 };
const inputEvents = [], confEvents = [];
const keeper = K.create({
  dataDir: DATA, homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => settings[k], serverNotice: null, getTelemetry: () => null,
  liveKeys: () => new Set([KEY_A, KEY_B]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }),
  log: { log() { }, warn() { }, error() { } }, now, install: false,
});
keeper.onInput((ev) => inputEvents.push(ev));
keeper.onConfirmation((ev) => confEvents.push(ev));
{
  const p = keeper.createProfile({ label: 'Work' }, { owner: { kind: 'session', id: KEY_A } });
  await keeper.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-1' });
  const child = keeper.newChild({ browserKey: KEY_A, sessionId: 'sess-1' });
  ok(keeper.resolveFor({ browserKey: KEY_A }).ok, 'before any takeover the agent\'s bare command resolves');
  ok(keeper.inputStateFor(KEY_A, p.id).input === 'agent' && keeper.inputSummaryFor(KEY_A).input === 'agent', 'the input side starts on the agent');
  const t1 = keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 11, sessionId: 'sess-1' });
  ok(t1.ok && !t1.already && keeper.inputStateFor(KEY_A, p.id).input === 'user' && keeper.leasesFor(KEY_A)[0].input === 'user', 'a takeover flips the state AND the lease\'s mirrored `input`');
  ok(inputEvents.length === 1 && inputEvents[0].kind === 'takeover' && inputEvents[0].sessionId === 'sess-1', 'the takeover is emitted once to the subscribers');
  const r = keeper.resolveFor({ browserKey: KEY_A });
  ok(!r.ok && r.code === 'browser_paused' && /took over the "Work" browser/.test(r.error) && r.takenAt === clock, 'resolveFor refuses the agent\'s command with the typed browser_paused');
  const rc = keeper.resolveFor({ browserKey: KEY_A, handle: child.handle });
  ok(rc.ok && rc.kind === 'child', 'a child handle is its own browser — never paused by the parent\'s takeover');
  ok(keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 11 }).already === true && inputEvents.length === 1, 'the same viewer again is idempotent and emits nothing');
  const held = keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 12 });
  ok(!held.ok && held.code === 'held', 'another viewer is `held`');
  ok(keeper.noteUserInput(KEY_A, p.id, clock + 5) === true && keeper.inputStateFor(KEY_A, p.id).lastUserInputAt === clock + 5, 'the holder\'s input restarts the idle clock');
  ok(keeper.noteUserUrl(KEY_A, p.id, 'https://x.test/cart') && keeper.inputStateFor(KEY_A, p.id).url === 'https://x.test/cart', 'the url mirror is remembered for the handback');
  ok(keeper.inputSummaryFor(KEY_A).input === 'user' && keeper.statusFor(KEY_A).input.input === 'user' && keeper.statusFor(KEY_A).inputs.length === 1, 'the summary and the status route say user');
  // idle: the keeper's OWN tick with the injected clock
  clock += 29000; await keeper.tick();
  ok(keeper.inputStateFor(KEY_A, p.id).input === 'user', '29 s after the last input the takeover stands');
  clock += 2000; await keeper.tick();
  const st = keeper.inputStateFor(KEY_A, p.id);
  ok(st.input === 'agent' && st.handbackCause === 'idle' && st.url === 'https://x.test/cart', '31 s after it the tick hands back with cause idle, carrying the url');
  ok(inputEvents.length === 2 && inputEvents[1].kind === 'handback' && inputEvents[1].cause === 'idle' && inputEvents[1].url === 'https://x.test/cart', '…and emits the handback with its cause');
  ok(keeper.resolveFor({ browserKey: KEY_A }).ok, 'after the handback the agent\'s command resolves again');
  // 0 = never
  settings['browser.takeoverIdleMs'] = 0;
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 13 });
  clock += 3600_000; await keeper.tick();
  ok(keeper.inputStateFor(KEY_A, p.id).input === 'user', 'with the window at 0 an hour idle never lapses');
  settings['browser.takeoverIdleMs'] = 30000;
  const hb = keeper.handback({ browserKey: KEY_A, profileId: p.id, viewerId: null, cause: 'explicit', url: 'https://x.test/done', sessionId: 'sess-1' });
  ok(hb.ok && hb.cause === 'explicit' && !hb.byHolder && keeper.inputStateFor(KEY_A, p.id).input === 'agent', 'an explicit handback by a non-holder (the card) is accepted and says so');
  ok(keeper.handback({ browserKey: KEY_A, profileId: p.id }).code === 'not_taken', 'a second handback is not_taken');
  // detach drops the state (with a detach handback when taken)
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 14 });
  const before = inputEvents.length;
  keeper.detach({ profileId: p.id, browserKey: KEY_A });
  ok(inputEvents.length === before + 1 && inputEvents[before].cause === 'detach' && keeper.inputsFor(KEY_A).length === 0, 'detach hands back with cause detach and drops the state');
  // the ephemeral browser (no lease) has an input side too
  const te = keeper.takeover({ browserKey: KEY_B, profileId: null, viewerId: 21, sessionId: 'sess-2' });
  ok(te.ok && keeper.inputStateFor(KEY_B, null).input === 'user' && keeper.resolveFor({ browserKey: KEY_B }).code === 'browser_paused', 'the EPHEMERAL browser (no lease) can be taken over and pauses the agent');
  keeper.handback({ browserKey: KEY_B, profileId: null, cause: 'viewer-left' });
  // the confirmation registry + the CLI's own confirm under the lease's session
  await keeper.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-1' });
  const view = keeper.notePending({ browserKey: KEY_A, profileId: p.id, sessionId: 'sess-1', confirmation: { id: 'c_ok', action: 'eval', category: null, at: clock, expiresAt: clock + T.CONFIRM_TTL_MS } });
  ok(view && view.type === 'confirmation' && view.remainingMs === T.CONFIRM_TTL_MS && keeper.pendingFor(KEY_A, p.id).length === 1 && confEvents.length === 1 && confEvents[0].kind === 'pending', 'a pending confirmation is registered and emitted once');
  keeper.notePending({ browserKey: KEY_A, profileId: p.id, confirmation: { id: 'c_ok', action: 'eval', at: clock, expiresAt: clock + T.CONFIRM_TTL_MS } });
  ok(confEvents.length === 1, '…re-noting the same id emits nothing');
  const ans = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_ok', decision: 'confirm' });
  const cl = confirms();
  ok(ans.ok && ans.decision === 'confirm' && cl.length === 1 && cl[0].verb === 'confirm' && cl[0].id === 'c_ok' && cl[0].session === 'vs-' + KEY_A && cl[0].ns === B.sessionNameFor(p.id), 'the answer runs the CLI\'s own `confirm <id>` under the lease\'s session in the profile\'s namespace');
  ok(keeper.pendingFor(KEY_A, p.id).length === 0 && confEvents.length === 2 && confEvents[1].kind === 'resolved' && confEvents[1].decision === 'confirm', '…and the registry forgets it, emitting resolved');
  const gone = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_gone', decision: 'deny' });
  ok(!gone.ok && gone.code === 'no_confirmation', 'a gone id is the typed no_confirmation (the daemon\'s own words)');
  ok((await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c 1', decision: 'confirm' })).code === 'bad-request' && confirms().length === 2, 'a malformed id never reaches a spawn');
  keeper.notePending({ browserKey: KEY_A, profileId: p.id, confirmation: { id: 'c_old', action: 'eval', at: clock, expiresAt: clock + 100 } });
  clock += 200; await keeper.tick();
  ok(keeper.pendingFor(KEY_A, p.id).length === 0 && confEvents.at(-1).decision === 'expired', 'a confirmation past the daemon\'s ttl is swept by the tick as expired');
}

// ═══ ③ THE ANNOUNCER against a fake ladder ═══════════════════════════════
console.log('— ③ the announcer: three moments, one billed site, a refusal loses nothing');
{
  const delivered = [], stashed = [], notices = [], inbox = [];
  let refuse = false;
  const deliver = { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return refuse ? { ok: false, reason: 'spend budget: hour cap', refused: 'spend' } : { ok: true, via: 'cli-inbox' }; }, stashFor: (cid, env) => stashed.push({ cid, env }) };
  const active = new Map([['sess-1', { _browserKey: KEY_A, claudeSessionId: 'conv-1', name: 'one' }], ['sess-noid', { _browserKey: KEY_B, name: 'two' }]]);
  const settings2 = { 'browser.announceIdleHandback': false };
  const ann = H.create({ keeper, deliver, serverSetting: (k) => settings2[k], userTodos: { add: (key, item) => inbox.push({ key, item }) }, activeSessions: active, sessionKeyFor: (s, id) => 'key:' + id, notice: (id, s, n) => notices.push({ id, n }), log: { log() { }, warn() { } } });
  const ev = (cause, extra = {}) => ({ kind: 'handback', browserKey: KEY_A, profileId: null, sessionId: 'sess-1', cause, url: 'https://x.test/after', heldMs: 4000, ...extra });
  const r1 = await ann.announce(ev('explicit'));
  ok(r1.delivered && delivered.length === 1 && delivered[0].cid === 'conv-1' && delivered[0].opts.spendReason === 'browser-handback' && delivered[0].opts.kind === 'notification' && /Current URL: https:\/\/x\.test\/after/.test(delivered[0].text) && notices.length === 0 && inbox.length === 0, 'EXPLICIT ⇒ delivered ONCE through the ladder under browser-handback, kind notification, the URL in the text — no notice, no inbox item');
  const r2 = await ann.announce(ev('idle'));
  ok(!r2.delivered && delivered.length === 1 && r2.inbox && inbox.length === 1 && /lapsed/.test(inbox[0].item.text) && inbox[0].key === 'key:sess-1' && r2.noticed && notices.length === 1 && notices[0].n.kind === 'browser-handback' && notices[0].n.cause === 'idle', 'IDLE (default) ⇒ nothing delivered, ONE inbox item under the session\'s key, the zero-spend notice queued');
  const r3 = await ann.announce(ev('viewer-left'));
  ok(!r3.delivered && delivered.length === 1 && inbox.length === 1 && notices.length === 2, 'VIEWER-LEFT ⇒ nothing delivered, no inbox item, the notice queued');
  settings2['browser.announceIdleHandback'] = true;
  const r4 = await ann.announce(ev('idle'));
  ok(r4.delivered && delivered.length === 2 && delivered[1].opts.spendReason === 'browser-handback' && /lapsed/.test(delivered[1].text) && inbox.length === 2, 'IDLE with browser.announceIdleHandback ON ⇒ delivered under the same reason (the inbox item is still filed)');
  settings2['browser.announceIdleHandback'] = false;
  refuse = true;
  const r5 = await ann.announce(ev('explicit'));
  ok(!r5.delivered && r5.stashed && stashed.length === 1 && stashed[0].cid === 'conv-1' && /Current URL/.test(stashed[0].env.text) && r5.noticed && /spend budget/.test(r5.why), 'a REFUSED delivery loses nothing: stashed on the ladder\'s own stash + the notice queued, the reason journalled');
  refuse = false;
  const r6 = await ann.announce(ev('explicit', { sessionId: 'sess-noid', browserKey: KEY_B }));
  ok(!r6.delivered && r6.noticed && /no id yet/.test(r6.why) && delivered.length === 3, 'a conversation with no id yet gets the notice (nothing to deliver into), never a throw — the ladder saw r1, r4 and the REFUSED r5, nothing more');
  ok(!(await ann.announce(ev('explicit', { sessionId: 'sess-gone', browserKey: 'bk-deadbeef' }))).delivered, 'no live session ⇒ nothing delivered');
  ok(ann.noteConfirmation({ kind: 'pending', browserKey: KEY_A, sessionId: 'sess-1', profileId: null, confirmation: { id: 'c_1', action: 'download' } }) && /confirm "download"/.test(inbox.at(-1).item.text) && /auto-denies/.test(inbox.at(-1).item.detail), 'a pending confirmation files ONE inbox item pointing at the live view');
  // the declaration, the literal and the census row
  ok(A.SPEND_REASONS['browser-handback'] && A.SPEND_REASONS['browser-handback'].turn === true && T.SPEND_REASON === 'browser-handback', 'the reason is DECLARED in SPEND_REASONS as a turn and equals the PURE constant');
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  ok((src.match(/deliverToConversation\s*\(/g) || []).length === 1 && /spendReason: 'browser-handback'/.test(src), 'the announcer has exactly ONE ladder site and passes the reason as the literal the census reads');
  const census = fs.readFileSync(path.join(REPO, 'scripts/test-spend-paths.mjs'), 'utf8');
  ok(/file: 'src\/server\/browser-handback\.js', prim: 'deliver-ladder'/.test(census), 'test-spend-paths lists (browser-handback.js, deliver-ladder) with its reason');
  ok(/'browser-handback': \(n\) => require\('\.\/browser-takeover'\)/.test(fs.readFileSync(path.join(REPO, 'src/session-status.js'), 'utf8')), 'session-status renders the browser-handback notice kind');
  const schema = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
  ok(/'browser\.announceIdleHandback': \{[\s\S]*?default: false/.test(schema) && /'browser\.takeoverIdleMs': \{[\s\S]*?default: 600000/.test(schema), 'the settings exist with the design\'s defaults (announce OFF, 10 min idle)');
  // the wiring pin: the keeper's handback reaches the announcer's ladder call
  const ann2 = H.create({ keeper, deliver, serverSetting: () => undefined, activeSessions: active, sessionKeyFor: () => 'k', notice: () => { }, log: { log() { }, warn() { } } });
  ann2.install();
  const n0 = delivered.length;
  keeper.takeover({ browserKey: KEY_A, profileId: null, viewerId: 31, sessionId: 'sess-1' });
  keeper.handback({ browserKey: KEY_A, profileId: null, cause: 'explicit', url: 'https://x.test/wired', sessionId: 'sess-1' });
  await until(() => delivered.length === n0 + 1, 2000);
  ok(delivered.length === n0 + 1 && /wired/.test(delivered[n0].text), 'WIRING: the keeper\'s handback event reaches the announcer\'s ladder call');
  ann2.shutdown();
}

// ═══ ④ THE REAL BRIDGE over a fake upstream ═══════════════════════════════
console.log('— ④ the bridge: takeover/handback/held/viewer-left, forwarded input, confirmation records');
async function fakeUpstream() {
  const port = await freePort();
  const got = []; const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => { clients.add(ws); ws.send(JSON.stringify({ type: 'status', connected: true, engine: 'chrome', viewportWidth: 1280, viewportHeight: 720 })); ws.send(JSON.stringify({ type: 'url', url: 'https://x.test/page' })); ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type !== 'config') got.push(m); } catch { } }); ws.on('close', () => clients.delete(ws)); });
  return { port, got, send(o) { for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify(o)); }, close() { for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}
function viewer(port, q) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/browser/stream?${q}`, { headers: { Cookie: 'vs=1' } });
  const v = { ws, msgs: [], closed: null, opened: false };
  ws.on('open', () => { v.opened = true; });
  ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type !== 'frame') v.msgs.push(m); } catch { } });
  ws.on('close', (c) => { v.closed = c; });
  ws.on('error', () => { });
  v.by = (t) => v.msgs.filter((m) => m.type === t);
  v.last = (t) => v.by(t).at(-1) || null;
  v.send = (o) => ws.send(JSON.stringify(o));
  v.until = (p, ms = 3000) => until(() => p(v), ms);
  return v;
}
{
  const up = await fakeUpstream();
  const active = new Map([['sess-1', { _browserKey: KEY_A, name: 'one' }]]);
  const p = keeper.profile(keeper.list().profiles[0].id);
  const origPort = keeper.streamPortFor;
  keeper.streamPortFor = async () => ({ ok: true, port: up.port, error: null, code: null });
  const bridge = BS.create({ keeper, activeSessions: active, requestAuthed: (req) => /vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } }, now });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const PORT = await freePort(); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r)); servers.push(srv);
  const a = viewer(PORT, `session=sess-1&profile=${p.id}`);
  await a.until((v) => !!v.last('hello') && v.by('status').some((m) => m.state === 'upstream-open'));
  const b = viewer(PORT, `session=sess-1&profile=${p.id}`);
  await b.until((v) => !!v.last('hello'));
  ok(a.last('hello').mode === 'watch' && a.last('hello').you && a.last('hello').mine === false && a.last('hello').protocol.input === 'holder-only', 'hello: watch mode, our viewer id, mine=false');
  a.send({ type: 'input_mouse', eventType: 'mouseMoved', x: 1, y: 1 });
  await a.until((v) => v.by('refused').length >= 1);
  ok(a.last('refused').code === 'watch-mode' && up.got.length === 0, 'in Watch mode an input is refused typed and reaches no upstream');
  a.send({ type: 'takeover' });
  await a.until((v) => !!v.last('mode-ack'));
  await b.until((v) => !!v.last('mode'));
  ok(a.last('mode-ack').ok && a.last('mode-ack').mine === true && a.last('mode').mode === 'takeover' && a.last('mode').mine === true && a.last('mode').cause === 'takeover', 'the holder gets mode-ack + a mode record with mine=true');
  ok(b.last('mode').mode === 'takeover' && b.last('mode').mine === false && b.last('mode').holder === a.last('hello').you, 'the other viewer gets the same mode record with mine=false and the holder\'s id');
  ok(keeper.inputStateFor(KEY_A, p.id).input === 'user' && keeper.resolveFor({ browserKey: KEY_A }).code === 'browser_paused', 'the keeper owns it: the agent\'s command is refused while the viewer drives');
  a.send({ type: 'input_mouse', eventType: 'mousePressed', x: 100, y: 200, button: 'left', clickCount: 1 });
  await until(() => up.got.length === 1);
  ok(up.got.length === 1 && up.got[0].eventType === 'mousePressed' && up.got[0].x === 100, 'the holder\'s input_mouse is forwarded upstream verbatim');
  b.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA' });
  await b.until((v) => v.by('refused').length >= 1);
  ok(b.last('refused').code === 'watch-mode' && /another viewer holds/.test(b.last('refused').error) && up.got.length === 1, 'the other viewer\'s input is refused (another viewer holds the controls) and not forwarded');
  b.send({ type: 'takeover' });
  await b.until((v) => v.by('refused').length >= 2);
  ok(b.last('refused').code === 'held', 'a second takeover while the holder is live is `held`');
  b.send({ type: 'handback' });
  await a.until((v) => v.by('mode').length >= 2);
  await b.until((v) => !!v.last('mode-ack'));
  ok(a.last('mode').mode === 'watch' && a.last('mode').cause === 'explicit' && a.last('mode').url === 'https://x.test/page' && b.last('mode-ack').ok && keeper.inputStateFor(KEY_A, p.id).input === 'agent', 'any viewer may hand back: everybody is back in watch, the record carries the url the upstream mirrored');
  // viewer-left: the holder's socket closes ⇒ handback
  a.send({ type: 'takeover' });
  await b.until((v) => v.by('mode').length >= 3 && v.last('mode').mode === 'takeover');
  a.ws.close();
  await b.until((v) => v.by('mode').length >= 4 && v.last('mode').mode === 'watch');
  ok(b.last('mode').cause === 'viewer-left' && keeper.inputStateFor(KEY_A, p.id).input === 'agent', 'the holder\'s window closing hands back with cause viewer-left');
  // confirmation: the upstream's result mirror ⇒ typed records, replayed to a late viewer, answered through the keeper
  up.send({ type: 'result', action: 'eval', id: 'r9', success: false, confirmation_required: true, confirmation_id: 'c_ok', timestamp: clock });
  await b.until((v) => !!v.last('confirmation'));
  ok(b.last('confirmation').id === 'c_ok' && b.last('confirmation').action === 'eval' && b.last('confirmation').remainingMs > 0 && keeper.pendingFor(KEY_A, p.id).length === 1, 'a confirmation_required result reaches the viewer as a typed confirmation and the keeper\'s registry');
  const c = viewer(PORT, `session=sess-1&profile=${p.id}`);
  await c.until((v) => !!v.last('confirmation'));
  ok(c.last('confirmation').id === 'c_ok', 'a late viewer is replayed the pending confirmation');
  const nConf = confirms().length;
  c.send({ type: 'confirm', id: 'c_ok', decision: 'deny' });
  await c.until((v) => !!v.last('confirmation-ack'));
  await b.until((v) => !!v.last('confirmation-resolved'));
  ok(c.last('confirmation-ack').ok && confirms().length === nConf + 1 && confirms().at(-1).verb === 'deny' && b.last('confirmation-resolved').id === 'c_ok' && keeper.pendingFor(KEY_A, p.id).length === 0, 'a viewer\'s confirm runs the CLI\'s deny under the lease, acks it, and every viewer sees it resolved');
  b.ws.close(); c.ws.close();
  await sleep(50);
  keeper.streamPortFor = origPort;
  bridge.shutdown(); await up.close();
}

// ═══ ⑤ THE ROUTES + ⑥ THE CLI ═══════════════════════════════════════════════
console.log('— ⑤ the routes in-process and ⑥ the shipped CLI\'s refusal');
{
  const R = require('../src/routes/browser.js');
  const TOKEN = 'vsst_' + 'a'.repeat(24);
  const active = new Map([['sess-1', { agentToken: TOKEN, _browserKey: KEY_A, name: 'one', _browserEnv: [] }]]);
  const app = express(); app.use(express.json());
  R.setup({ keeper, activeSessions: active, browserEnv: () => null, notice: () => { } });
  app.use(R.router);
  const srv = http.createServer(app); const PORT = await freePort(); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r)); servers.push(srv);
  const API = `http://127.0.0.1:${PORT}`;
  const post = async (p, body, headers = {}) => { const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
  const p = keeper.profile(keeper.list().profiles[0].id);
  const h0 = await post('/api/browser/handback', { sessionId: 'sess-1' });
  ok(h0.status === 409 && h0.json.code === 'not_taken', 'POST /handback with nobody driving ⇒ 409 not_taken');
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 41, sessionId: 'sess-1' });
  const rz = await post('/api/agent/browser/resolve', { handle: '', wrapper: true }, { Authorization: 'Bearer ' + TOKEN });
  ok(rz.status === 409 && rz.json.code === 'browser_paused' && rz.json.takenAt > 0 && /did NOT run/.test(rz.json.error), 'the agent\'s /resolve answers 409 browser_paused with takenAt');
  const h1 = await post('/api/browser/handback', { sessionId: 'sess-1' });
  ok(h1.status === 200 && h1.json.ok && h1.json.cause === 'explicit' && h1.json.profileId === p.id && h1.json.input.input === 'agent', 'POST /handback finds the taken browser and hands it back (explicit)');
  ok((await post('/api/agent/browser/resolve', { handle: '' }, { Authorization: 'Bearer ' + TOKEN })).status === 200, '…and /resolve is open again');
  keeper.notePending({ browserKey: KEY_A, profileId: p.id, confirmation: { id: 'c_ok', action: 'eval', at: clock, expiresAt: clock + T.CONFIRM_TTL_MS } });
  const c1 = await post('/api/browser/confirm', { sessionId: 'sess-1', id: 'c_ok', decision: 'confirm' });
  ok(c1.status === 200 && c1.json.ok && c1.json.decision === 'confirm' && c1.json.pending.length === 0, 'POST /confirm answers through the keeper and returns what is still pending');
  const c2 = await post('/api/browser/confirm', { sessionId: 'sess-1', id: 'c_gone', decision: 'deny' });
  ok(c2.status === 404 && c2.json.code === 'no_confirmation', 'a gone id is 404 no_confirmation');
  ok((await post('/api/browser/handback', { sessionId: 'sess-1', host: 'h1' })).json.code === 'unsupported-host', 'a non-local host is refused by name');
  // ⑥ the shipped CLI
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 42, sessionId: 'sess-1' });
  // ASYNC on purpose: the routes are served by THIS process, so a spawnSync
  // here blocks the very event loop the CLI's HTTP call needs (measured: 20 s
  // ETIMEDOUT with empty output — the pin suite's cli() helper is async for
  // the same reason).
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN };
  const runCli = (argv) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...argv], { env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    ch.stdout.on('data', (d) => { stdout += d; }); ch.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 20000);
    ch.on('close', (status, signal) => { clearTimeout(t); resolve({ status, signal, stdout, stderr }); });
    ch.on('error', (e) => { clearTimeout(t); resolve({ status: null, signal: null, stdout, stderr, error: e }); });
  });
  const cli = await runCli(['--', 'snapshot']);
  ok(cli.status === 1 && /\[browser_paused\]/.test(cli.stderr) && /wait for the handback/.test(cli.stderr) && /taken over at:/.test(cli.stderr), 'vibespace-browser -- snapshot exits 1 printing [browser_paused], when it was taken over, and the waiting instruction', `status ${cli.status} signal ${cli.signal} error ${cli.error && cli.error.message} stderr ${JSON.stringify((cli.stderr || '').slice(0, 400))} stdout ${JSON.stringify((cli.stdout || '').slice(0, 200))}`);
  keeper.handback({ browserKey: KEY_A, profileId: p.id, cause: 'explicit' });
  const cli2 = await runCli(['watch']);
  ok(cli2.status === 0 && /browser_paused/.test(cli2.stdout) && /Take over/.test(cli2.stdout), '`watch` explains the takeover contract to the agent');
}

keeper.shutdown();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
