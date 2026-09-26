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
//   ⑦ lane J r2 (the 2026-09-25 naive-user study): the keyboard while you
//      drive (ownership / key routes / reserved chords / paste / IME / focus
//      reclaim / one owner per client, and the focus guards' placement), the
//      text records, the TOP-aligned mapping (+ a centred-maths control), the
//      stale-approval verdict over the CLI's own verb table, and the REAL
//      normalizer + claude adapter + the one permission answer under the
//      takeover/handback sweep (a restart keeps the reason; a patched copy of
//      the announcer without the sweep leaves the card pending — the control);
//      the one-answer census and the wiring pin.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // lane H: copiesCensus; lane J r2: the stale sweep's patched-copy control
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
  // lane P verify (finding 3): the PASS verdict — the holder hands its controls to another view; the takeover goes on
  const ps = T.decidePass({ state: { ...t0.state, lastUserInputAt: 150, url: 'https://x.test/a' }, from: 7, to: 11, now: 300 });
  ok(ps.ok && ps.state.input === 'user' && ps.state.takenBy.viewerId === 11 && ps.state.takenAt === 100 && ps.state.lastUserInputAt === 150 && ps.state.url === 'https://x.test/a', 'pass: the holder hands the controls on — still user, the new holder named, takenAt / the idle clock / the url kept');
  ok(T.decidePass({ state: t0.state, from: 8, to: 11 }).code === 'not_holder' && T.decidePass({ state: hb.state, from: 7, to: 11 }).code === 'not_taken' && T.decidePass({ state: t0.state, from: 7, to: 7 }).code === 'bad-request' && T.decidePass({ state: t0.state, from: 7, to: null }).code === 'bad-request', 'pass: only the holder, only while taken over, only to ANOTHER view');
  const idle = T.idleHandbackVerdict({ state: { ...t0.state, lastUserInputAt: 1000 }, now: 1000 + 60000, idleMs: 60000 });
  ok(idle.lapsed && /no input for/.test(idle.why), 'the idle verdict lapses at the window');
  ok(!T.idleHandbackVerdict({ state: { ...t0.state, lastUserInputAt: 1000 }, now: 1000 + 59999, idleMs: 60000 }).lapsed, '…not one ms before');
  ok(!T.idleHandbackVerdict({ state: t0.state, now: 9e12, idleMs: 0 }).lapsed && /off/.test(T.idleHandbackVerdict({ state: t0.state, now: 9e12, idleMs: 0 }).why), '0 = never (a real choice, said)');
  ok(T.takeoverIdleMs(undefined) === T.DEFAULT_TAKEOVER_IDLE_MS && T.takeoverIdleMs('x') === T.DEFAULT_TAKEOVER_IDLE_MS && T.takeoverIdleMs(0) === 0 && T.takeoverIdleMs(5000) === T.MIN_TAKEOVER_IDLE_MS && T.takeoverIdleMs(120000) === 120000, 'the setting: unreadable ⇒ default, 0 ⇒ never, floor 30 s');
  ok(T.announceVerdict({ cause: 'explicit' }).deliver === true && T.announceVerdict({ cause: 'explicit' }).reason === 'browser-handback', 'an explicit handback DELIVERS under the declared reason');
  ok(T.announceVerdict({ cause: 'idle' }).deliver === false && T.announceVerdict({ cause: 'viewer-left' }).deliver === false, 'idle / viewer-left deliver NOTHING by default (zero-spend by construction)');
  ok(T.announceVerdict({ cause: 'idle', announceIdle: true }).deliver === true && T.announceVerdict({ cause: 'idle', announceIdle: true }).reason === 'browser-handback', '…and browser.announceIdleHandback ON routes it through the same reason');
  ok(T.announceVerdict({ cause: 'restart', announceIdle: true }).deliver === false && T.announceVerdict({ cause: 'detach', announceIdle: true }).deliver === false, 'restart / detach are state changes only, whatever the setting');
  // LANE H VERIFY r6 LOW 3: a panel Stop while the user drives ends the browser the takeover was on — a handback cause of its own
  ok(T.HANDBACK_CAUSES.includes('stop') && T.decideHandback({ state: t0.state, cause: 'stop', now: 200 }).cause === 'stop' && T.announceVerdict({ cause: 'stop', announceIdle: true }).deliver === false, 'r6 LOW 3: `stop` is a handback cause (a Stop while the user drives) — a state change, never a delivered turn, whatever the setting');
  const stopText = T.handbackText({ cause: 'stop', label: 'Work', url: 'https://x.test/p' });
  ok(/stopped the "Work" browser/.test(stopText) && /control is back with you/.test(stopText) && /next browser command starts it again/.test(stopText) && /https:\/\/x\.test\/p/.test(stopText) && !/Re-orient/.test(stopText), 'r6 LOW 3: …its words: the user stopped the browser, control is back, its pages are gone and the next command starts it again (the page they were on named)', stopText);
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
  ok(T.modeBadge({ mode: 'watch' }) === 'Agent is driving' && T.modeBadge({ mode: 'takeover', mine: true }) === 'You are driving — agent asked to pause' && T.modeBadge({ mode: 'takeover', mine: false }) === 'Another viewer is driving — agent asked to pause', 'the badge has three driving sentences, "asked to pause" because the lease cannot enforce more');
  // naive study 2 (finding 3): a view of a STOPPED browser read "Agent is driving" over about:blank — the fourth sentence wins over every mode
  ok(T.modeBadge({ mode: 'watch', stopped: true }) === 'Browser stopped' && T.modeBadge({ mode: 'takeover', mine: true, stopped: true }) === 'Browser stopped', '…and a fourth, "Browser stopped", for a view whose browser is not running — it never claims anybody drives');
  ok(T.modeBadge({ mode: 'watch', stopped: 'browser_stopped' }) === 'Browser stopped' && T.modeBadge({ mode: 'watch', stopped: 'browser_closed' }) === 'Browser closed' && T.modeBadge({ mode: 'takeover', mine: true, stopped: 'browser_unstable' }) === 'Browser keeps closing', 'lane H verify r5: …a view refused `browser_closed` says "Browser closed" and one refused `browser_unstable` "Browser keeps closing" — never that anybody drives');
  ok(T.modeBadge({ mode: 'watch', stopped: 'browser_unstable', unstable: 'failing' }) === 'Browser could not start' && T.modeBadge({ mode: 'watch', stopped: 'browser_unstable', unstable: null }) === 'Browser keeps closing', 'lane H verify r6 MINOR 1: …a view refused `browser_unstable` because every relaunch ask FAILED says "Browser could not start" (never "keeps closing")');
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
  // ── lane J (inc-muhgv0fb-9i4u "接管浏览器的时候鼠标操作位置不对"): the PICTURE vs the PAGE ──
  // Measured on agent-browser 0.32.0 (test-browser-live ⑤ re-measures it on the real rung): every frame's metadata and
  // every status say the CONFIGURED 1280×720; headless the page is 1280×577 in a 1280×577 JPEG, headed (a 2560×1440
  // screen, no window size) the page is 1265×1277 DOWNSCALED into a 713×720 JPEG. The judge below is the object-fit
  // arithmetic written HERE (never the product's helper): where on the element the page point (525, 275) — the centre
  // of 50 px grid cell (10, 5) — is drawn, then the product maps that client point back.
  {
    const whereDrawn = (el, picW, picH, cssW, cssH, x, y) => { const k = Math.min(el.width / picW, el.height / picH); const dw = picW * k, dh = picH * k; return { clientX: el.left + (el.width - dw) / 2 + x * dw / cssW, clientY: el.top + (el.height - dh) / 2 + y * dh / cssH }; };
    const PRE = (a) => S.pointerToDevice({ clientX: a.clientX, clientY: a.clientY, elRect: a.elRect, frameW: a.metaW, frameH: a.metaH }); // the pre-fix client: letterbox AND scale from the metadata's claim
    const META = { width: 1280, height: 720 };
    const SHAPES = [
      { name: 'headless default', pic: [1280, 577], page: { clientWidth: 1280, clientHeight: 577 }, css: [1280, 577] },
      { name: 'headed, downscaled (the owner\'s shape)', pic: [713, 720], page: { clientWidth: 1265, clientHeight: 1277 }, css: [1265, 1277] },
      { name: 'headed + a 15 px vertical scrollbar', pic: [713, 720], page: { clientWidth: 1250, clientHeight: 1277 }, css: [1265, 1277] },
      { name: 'emulated 1280×720 (metadata true)', pic: [1280, 720], page: null, css: [1280, 720] },
    ];
    const ELS = [{ name: '1400×800 live window', left: 12, top: 96, width: 1400, height: 800 }, { name: '700×900 live window', left: 1000, top: 60, width: 700, height: 900 }];
    const rows = [];
    for (const sh of SHAPES) for (const el0 of ELS) for (const zoom of [1, 1.25]) {
      const el = { left: el0.left * zoom, top: el0.top * zoom, width: el0.width * zoom, height: el0.height * zoom }; // a zoomed ancestor scales the viewport rect and the pointer alike
      const at = whereDrawn(el, sh.pic[0], sh.pic[1], sh.css[0], sh.css[1], 525, 275);
      const g = S.frameGeometry({ picW: sh.pic[0], picH: sh.pic[1], page: sh.page, meta: META });
      const got = S.pointerToDevice({ clientX: at.clientX, clientY: at.clientY, elRect: el, frameW: g.cssW, frameH: g.cssH, picW: g.picW, picH: g.picH });
      const pre = PRE({ ...at, elRect: el, metaW: META.width, metaH: META.height });
      const off = got ? Math.hypot(got.x - 525, got.y - 275) : Infinity;
      const preOff = pre ? Math.hypot(pre.x - 525, pre.y - 275) : Infinity;
      rows.push({ shape: sh.name, el: el0.name, zoom, source: g.source, got, off: Math.round(off * 10) / 10, pre, preOff: Number.isFinite(preOff) ? Math.round(preOff) : 'outside' });
      // the overlay's basis: the same page point placed back through deviceToViewport → toLocal lands on the same element-local px
      const v = S.deviceToViewport({ x: 525, y: 275, elRect: el, frameW: g.cssW, frameH: g.cssH, picW: g.picW, picH: g.picH });
      const loc = S.toLocal(v, el, el0.width, el0.height);
      const want = { left: (at.clientX - el.left) / zoom, top: (at.clientY - el.top) / zoom };
      if (Math.abs(loc.left - want.left) > 0.5 || Math.abs(loc.top - want.top) > 0.5) rows[rows.length - 1].overlayOff = [loc, want];
    }
    console.log('    lane J table (page point 525,275):\n' + rows.map((r) => `      ${r.shape} · ${r.el} · zoom ${r.zoom}: fixed ${JSON.stringify(r.got)} off ${r.off}px [${r.source}] · pre-fix ${JSON.stringify(r.pre)} off ${r.preOff}${r.overlayOff ? ' · OVERLAY DRIFT' : ''}`).join('\n'));
    ok(rows.every((r) => r.off <= 1), `lane J: every shape × window × zoom maps the drawn grid cell (10,5) back to its page point within 1 px (${rows.length} rows)`, JSON.stringify(rows.filter((r) => r.off > 1)));
    ok(rows.filter((r) => /downscaled|scrollbar/.test(r.shape)).every((r) => r.preOff === 'outside' || r.preOff > 100) && rows.filter((r) => /headless/.test(r.shape)).every((r) => r.preOff === 'outside' || r.preOff > 20), 'control: the PRE-FIX mapping (letterbox + scale from the metadata\'s 1280×720) is off by > 100 px on the owner\'s shape and > 20 px headless — or drops the click as "outside the picture"', JSON.stringify(rows.map((r) => [r.shape, r.el, r.preOff])));
    ok(rows.filter((r) => /emulated/.test(r.shape)).every((r) => r.preOff <= 1), 'control of the control: where the metadata IS the page (an emulated 1280×720), the old mapping was right — the fix changes nothing there');
    ok(rows.every((r) => !r.overlayOff), 'the agent cursor overlay and the pointer share ONE basis: device → viewport → the host\'s local px lands where the click was drawn, at zoom 1 and 1.25');
    ok(rows.find((r) => /owner/.test(r.shape)).source === 'page' && rows.find((r) => /headless/.test(r.shape)).source === 'page' && rows.find((r) => /emulated/.test(r.shape)).source === 'metadata', 'geometry sources: the page\'s reading when it fits the picture; the metadata only when ITS aspect is the picture\'s');
    // the ladder's rungs one by one
    let g = S.frameGeometry({ picW: 1280, picH: 577, page: null, meta: META });
    ok(g.source === 'picture' && g.cssW === 1280 && g.cssH === 577, 'no page reading + a metadata claim of another aspect (1280×720 vs a 1280×577 picture) ⇒ the picture 1:1, never the claim');
    g = S.frameGeometry({ picW: 1280, picH: 577, page: { clientWidth: 1265, clientHeight: 1277 }, meta: META });
    ok(g.source === 'picture', 'a STALE page reading (another size than the picture shows — the window changed since) is refused, not trusted');
    ok(S.pageViewportFor({ clientWidth: 1250, clientHeight: 1277 }, 713, 720) && Math.abs(S.pageViewportFor({ clientWidth: 1250, clientHeight: 1277 }, 713, 720).width - 1264.6) < 0.5 && S.pageViewportFor({ clientWidth: 1265, clientHeight: 1262 }, 713, 720).height > 1276, 'a scrollbar shrinks ONE side of the layout reading; the untouched side × the picture\'s aspect is the viewport (both orientations)');
    ok(S.pageViewportFor({ clientWidth: 1200, clientHeight: 1277 }, 713, 720) === null, '…but a gap wider than any scrollbar (> ' + S.SCROLLBAR_MAX_PX + ' px) is another size, refused');
    ok(S.frameGeometry({}) === null && S.frameGeometry({ meta: META }).source === 'metadata' && S.frameGeometry({ page: { clientWidth: 900, clientHeight: 500 } }).cssW === 900, 'before the first picture decodes: the page reading, else the metadata, else nothing');
    ok(S.pointerToDevice({ clientX: 50, clientY: 10, elRect: { left: 0, top: 0, width: 700, height: 900 }, frameW: 1265, frameH: 1277, picW: 713, picH: 720 }) === null, 'a pointer in the letterbox of the picture\'s OWN aspect maps to nothing');
    // the picture's size off the JPEG head, and the captured fixture was never 1280×720
    const FIXF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8')).server_to_client.frame;
    const js = S.jpegSize(FIXF.data);
    ok(js && js.width === 1280 && js.height === 577 && FIXF.metadata.deviceHeight === 720, `the checked-in 0.32.0 frame is a ${js && js.width}×${js && js.height} JPEG under a ${FIXF.metadata.deviceWidth}×${FIXF.metadata.deviceHeight} metadata claim — the evidence was in the fixture from the start`);
    ok(S.jpegSize('') === null && S.jpegSize('aGVsbG8gd29ybGQ=') === null && S.jpegSize(FIXF.data.slice(0, 40)) === null, 'jpegSize: not a JPEG / a head too short to hold the SOF ⇒ null (never a guess)');
    // which target's metrics, and what never reaches a viewer
    const tl = [{ id: 'n', type: 'page', url: 'chrome://newtab/', webSocketDebuggerUrl: 'ws://x/n' }, { id: 'a', type: 'page', url: 'https://a.example/', webSocketDebuggerUrl: 'ws://x/a' }, { id: 'b', type: 'page', url: 'https://b.example/', webSocketDebuggerUrl: 'ws://x/b' }, { id: 'w', type: 'service_worker', url: 'https://b.example/sw.js', webSocketDebuggerUrl: 'ws://x/w' }];
    ok(S.pickViewportTarget(tl, { activeUrl: 'https://b.example/' }).id === 'b' && S.pickViewportTarget(tl, { activeUrl: 'https://gone.example/' }).id === 'a' && S.pickViewportTarget([tl[3]], {}) === null, 'the viewport target: the ACTIVE tab\'s url, else the first ordinary page (never chrome://newtab, never a worker), else none');
    // the SIBLING reader of the same fact: the action trace stamps each saved frame with the size its positions are in —
    // the page's, from the same frameGeometry; the before/after dialog's dot then lands where the agent clicked
    {
      const TR = require('../src/browser-trace.js');
      const msg = { type: 'frame', data: FIXF.data, metadata: FIXF.metadata };
      const fixed = TR.frameMeta(msg, S.frameGeometry({ picW: js.width, picH: js.height, page: { clientWidth: 1280, clientHeight: 577 }, meta: { width: 1280, height: 720 } }));
      const pre = TR.frameMeta(msg);
      const dot = (f) => TR.overlayGeometry({ position: { kind: 'point', x: 525, y: 275 }, frame: f, drawn: { left: 0, top: 0, width: 640, height: 288.5 } });
      ok(fixed.w === 1280 && fixed.h === 577 && Math.abs(dot(fixed).top - 137.5) < 0.01 && Math.abs(dot(fixed).left - 262.5) < 0.01, 'the trace: a frame\'s size is the PAGE\'s (1280×577) and the dialog\'s dot for page (525,275) lands on the drawn picture\'s (262.5, 137.5)');
      ok(pre.h === 720 && Math.abs(dot(pre).top - 137.5) > 25, `control: stamped by the metadata alone (the pre-fix recorder) the dot sits ${Math.round(137.5 - dot(pre).top)} px too high on a 288 px thumbnail`);
      const recSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
      ok(/meta: T\.frameMeta\(msg, pageOf\(msg, relay\)\)/.test(recSrc) && /\(msg, _text, relay\) => onRecord\(tp, msg, relay\)/.test(recSrc), 'WIRING PIN: the recorder stamps every frame through pageOf with the tap\'s relay (the relay carries the page reading)');
    }
    ok(S.privateUpstream({ type: 'command', action: 'cdp_url' }) && S.privateUpstream({ type: 'result', action: 'cdp_url', data: { cdpUrl: 'ws://127.0.0.1:1/devtools/browser/x' } }) && !S.privateUpstream({ type: 'command', action: 'click' }) && !S.privateUpstream({ type: 'frame' }), 'the daemon\'s cdp_url command/result pair is private (never relayed); every other record is not');
  }
  const v = S.viewerMessageVerdict({ type: 'takeover' });
  ok(v.kind === 'takeover' && !v.forward && S.viewerMessageVerdict({ type: 'handback' }).kind === 'handback' && S.viewerMessageVerdict({ type: 'confirm', id: 'c_1', decision: 'deny' }).decision === 'deny' && S.viewerMessageVerdict({ type: 'confirm', id: 'c_1', decision: 'x' }).decision === 'confirm', 'the three control verbs are decided, never forwarded');
  ok(S.viewerMessageVerdict({ type: 'input_mouse' }, { mode: 'takeover', holder: 3, viewerId: 3 }).forward === true && S.viewerMessageVerdict({ type: 'input_mouse' }, { mode: 'takeover', holder: 3, viewerId: 4 }).refusal.code === 'watch-mode' && !/P3/.test(S.viewerMessageVerdict({ type: 'input_mouse' }, {}).refusal.error), 'input is forwarded only from the holder; the watch-mode refusal no longer says P3');
  ok(S.hello({}).protocol.input === 'holder-only' && S.hello({}).protocol.control.join(',') === 'takeover,handback,confirm,pass', 'the hello names the input rule and the control verbs');
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
  // LANE H VERIFY r2 L8: an AGENT's detach while the USER drives is REFUSED by name (browser_paused) — it would end the
  // user's takeover (a handback the agent caused) and, on a managed ephemeral, retire the browser under the user. The
  // USER's own detach (the UI route, `by: 'user'`) still ends it with a detach handback.
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 14 });
  const before = inputEvents.length;
  const leasesBefore = keeper.leasesFor(KEY_A).length;
  let dErr = null; try { keeper.detach({ profileId: p.id, browserKey: KEY_A }); } catch (e) { dErr = e; }
  ok(dErr && dErr.code === 'browser_paused' && /detach did NOT run/.test(dErr.message) && inputEvents.length === before && keeper.inputStateFor(KEY_A, p.id).input === 'user' && keeper.leasesFor(KEY_A).length === leasesBefore && leasesBefore === 1, `r2 L8: an agent's detach while the user drives is refused browser_paused BY NAME — no handback announced (${inputEvents.length - before} input events), the takeover and the lease stand`, dErr ? dErr.code + ' ' + dErr.message : 'no refusal');
  keeper.detach({ profileId: p.id, browserKey: KEY_A, by: 'user' });
  ok(inputEvents.length === before + 1 && inputEvents[before].cause === 'detach' && keeper.inputsFor(KEY_A).length === 0, 'the USER\'s own detach (the UI route) hands back with cause detach and drops the state');
  // CONTROL (scripts/mutant-copy.mjs): the pre-fix keeper — the agent's detach ends the user's takeover with a handback
  {
    const M8 = mutantCopies('browser-takeover-l8', REPO);
    const ksrc8 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const kmut8 = ksrc8.replace("    if (by !== 'user') { const paused = pausedVerdictFor(browserKey, inPid); if (paused) throw namedError(paused.code, detachPausedText(paused.error), { takenAt: paused.takenAt, lastUserInputAt: paused.lastUserInputAt }); }\n", '');
    if (kmut8 !== ksrc8) {
      const K8 = M8.load('src/server/browser-keeper.js', kmut8, 'detach-under-user');
      const ev8 = [];
      const k8 = K8.create({ dataDir: path.join(ROOT, 'data-l8'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => settings[k], liveKeys: () => new Set([KEY_A]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false });
      k8.onInput((ev) => ev8.push(ev));
      const p8 = k8.createProfile({ label: 'Work8' }, { owner: { kind: 'session', id: KEY_A } });
      await k8.attach({ profileId: p8.id, browserKey: KEY_A, sessionId: 'sess-1' });
      k8.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 81 });
      let e8 = null; try { k8.detach({ profileId: p8.id, browserKey: KEY_A }); } catch (e) { e8 = e; }
      ok(!e8 && ev8.some((e) => e.kind === 'handback' && e.cause === 'detach'), 'r2 L8 CONTROL: a keeper copy without the refusal lets the agent\'s detach end the user\'s takeover (a `detach` handback) — the leg above can go red', ev8.map((e) => e.kind + ':' + e.cause).join());
      await k8.stop(p8.id).catch(() => { }); k8.shutdown();
    } else ok(false, 'r2 L8 CONTROL: the refusal line was not found in src/server/browser-keeper.js');
    for (const r of copiesCensus(M8.files, M8.dir, REPO, { minCopies: 1, label: 'r2 L8 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
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

// LANE H VERIFY r6 LOW 3: a panel STOP while the user drives — r5 put Stop on every live named row (the unstable remedy), and
// `stop()` never touched the input side: the takeover outlived the browser it was taken on, so the browser the agent's next
// command started was already `browser_paused` for it (until the 10-min idle handback). Now the stop hands back (cause
// `stop`) and resolves the ended browser's pending confirmations `gone`.
{
  const stopLeg = async (Kmod, tag) => {
    const ev = [], cev = [];
    const kk = Kmod.create({ dataDir: path.join(ROOT, 'data-stop-' + tag), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => settings[k], liveKeys: () => new Set([KEY_A]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false });
    kk.onInput((e) => ev.push(e)); kk.onConfirmation((e) => cev.push(e));
    const r = { tag };
    let ps = null;
    try {
      ps = kk.createProfile({ label: 'Stop ' + tag }, { owner: { kind: 'session', id: KEY_A } });
      await kk.attach({ profileId: ps.id, browserKey: KEY_A, sessionId: 'sess-1' });
      r.pid0 = kk.browserOf(ps.id).pid;
      kk.takeover({ browserKey: KEY_A, profileId: ps.id, viewerId: 41, sessionId: 'sess-1' });
      kk.noteUserUrl(KEY_A, ps.id, 'https://x.test/stopped-here');
      kk.notePending({ browserKey: KEY_A, profileId: ps.id, sessionId: 'sess-1', confirmation: { id: 'c_stop', action: 'eval', at: clock, expiresAt: clock + T.CONFIRM_TTL_MS } });
      r.paused = kk.resolveFor({ browserKey: KEY_A }).code || 'ok';
      await kk.stop(ps.id, { why: 'user' });
      r.stopped = kk.browserOf(ps.id).state;
      const st = kk.inputStateFor(KEY_A, ps.id);
      r.after = { input: st.input, cause: st.handbackCause, url: st.url };
      r.hb = ev.filter((e) => e.kind === 'handback').map((e) => ({ cause: e.cause, url: e.url, sessionId: e.sessionId, profileId: e.profileId }));
      r.pending = kk.pendingFor(KEY_A, ps.id).length;
      r.resolved = cev.filter((e) => e.kind === 'resolved').map((e) => e.id + ':' + e.decision);
      r.leaseInput = (kk.leasesFor(KEY_A).find((l) => l.profileId === ps.id) || {}).input || null;
      // the agent's next command: a NEW browser — driven by the agent
      await kk.attach({ profileId: ps.id, browserKey: KEY_A, sessionId: 'sess-1' });
      r.pid1 = kk.browserOf(ps.id).pid;
      r.state1 = kk.browserOf(ps.id).state;
      const res = kk.resolveFor({ browserKey: KEY_A });
      r.resolve = res.ok ? 'ok' : res.code;
    } catch (e) { r.threw = String(e && e.stack); }
    if (ps) await kk.stop(ps.id).catch(() => { });
    kk.shutdown();
    return r;
  };
  const sl = await stopLeg(K, 'fix');
  ok(!sl.threw && sl.paused === 'browser_paused' && sl.stopped === 'stopped' && sl.after.input === 'agent' && sl.after.cause === 'stop' && sl.leaseInput === 'agent' && sl.hb.length === 1 && sl.hb[0].cause === 'stop' && sl.hb[0].url === 'https://x.test/stopped-here' && sl.hb[0].sessionId === 'sess-1', `r6 LOW 3: a Stop while the user drives HANDS BACK — input ${sl.after.input}, the lease mirrors it, ONE handback event with cause \`${sl.hb[0] ? sl.hb[0].cause : '-'}\` naming the page and the session (the announcer's input)`, sl);
  ok(!sl.threw && sl.pending === 0 && sl.resolved.includes('c_stop:gone'), 'r6 LOW 3: …and the ended browser\'s pending confirmation is resolved `gone` (the daemon that asked is gone — nothing can answer it)', sl.resolved);
  ok(!sl.threw && sl.state1 === 'ready' && sl.pid1 && sl.pid1 !== sl.pid0 && sl.resolve === 'ok', `r6 LOW 3: …the agent's next command starts a NEW browser (daemon ${sl.pid0} → ${sl.pid1}) and it is the agent's to drive (resolve: ${sl.resolve}), never browser_paused`, sl);
  const MS = mutantCopies('browser-takeover-stop', REPO);
  const ksrcS = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const HBS = '      handBackOnStop(profileId, p, why); // r6 LOW 3\n';
  if (ksrcS.split(HBS).length === 3) {
    const cs = await stopLeg(MS.load('src/server/browser-keeper.js', ksrcS.split(HBS).join(''), 'stop-no-handback'), 'ctl');
    ok(!cs.threw && cs.after.input === 'user' && cs.hb.length === 0 && cs.resolve === 'browser_paused', `r6 LOW 3 CONTROL: a keeper copy without the stop's handback keeps input ${cs.after.input} after the Stop, and the agent's next command on the NEW browser answers ${cs.resolve} — the leg above can go red`, cs);
  } else ok(false, 'r6 LOW 3 CONTROL: the two handBackOnStop call sites were not found in src/server/browser-keeper.js');
  for (const r of copiesCensus(MS.files, MS.dir, REPO, { minCopies: 1, label: 'r6 LOW 3 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
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
  const r3s = await ann.announce(ev('stop'));
  ok(!r3s.delivered && delivered.length === 1 && inbox.length === 1 && notices.length === 3 && notices[2].n.cause === 'stop' && /stopped/.test(T.renderHandbackNotice(notices[2].n)), 'r6 LOW 3: STOP ⇒ nothing delivered, no inbox item, the zero-spend notice queued (cause stop) — the conversation hears it on its next message');
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
  // lane P verify (finding 3, 2026-09-26): a FOLD-BACK of the window the user drives — the holder PASSES its control to
  // another view of the SAME browser before its window closes: the keeper stays 'user', the other view drives, and the
  // closing view hands NOTHING back (no viewer-left handback, no announcement, no inbox item)
  {
    const evs = []; const unIn = keeper.onInput((e) => evs.push(e));
    const e = viewer(PORT, `session=sess-1&profile=${p.id}`), f = viewer(PORT, `session=sess-1&profile=${p.id}`);
    await e.until((v) => !!v.last('hello')); await f.until((v) => !!v.last('hello'));
    const eId = e.last('hello').you, fId = f.last('hello').you;
    e.send({ type: 'takeover' });
    await f.until((v) => !!v.last('mode') && v.last('mode').mode === 'takeover');
    f.send({ type: 'pass', to: eId });
    await f.until((v) => v.by('refused').some((m) => m.code === 'not_holder'));
    ok(f.by('refused').some((m) => m.code === 'not_holder') && (keeper.inputStateFor(KEY_A, p.id).takenBy || {}).viewerId === eId, 'pass: only the view DRIVING may hand its control on (not_holder)', f.by('refused'));
    e.send({ type: 'pass', to: 987654 });
    await e.until((v) => v.by('refused').some((m) => m.code === 'no_such_viewer'));
    ok(e.by('refused').some((m) => m.code === 'no_such_viewer') && (keeper.inputStateFor(KEY_A, p.id).takenBy || {}).viewerId === eId, 'pass: only to a view of the SAME browser (no_such_viewer)', e.by('refused'));
    e.send({ type: 'pass', to: fId });
    await f.until((v) => !!v.last('mode') && v.last('mode').mine === true);
    const st1 = keeper.inputStateFor(KEY_A, p.id);
    ok(f.last('mode') && f.last('mode').mode === 'takeover' && f.last('mode').cause === 'pass' && st1.input === 'user' && (st1.takenBy || {}).viewerId === fId, 'pass: the other view now DRIVES (mode takeover, mine, cause pass) — the keeper still says user', { mode: f.last('mode'), st1 });
    e.ws.close();
    await sleep(200);
    ok(keeper.inputStateFor(KEY_A, p.id).input === 'user' && !evs.some((x) => x.kind === 'handback'), 'the view that passed its control closes: NOTHING is handed back to the agent (no viewer-left handback)', evs.map((x) => `${x.kind}:${x.cause}`));
    f.send({ type: 'input_mouse', eventType: 'mouseMoved', x: 3, y: 4 });
    await until(() => up.got.some((m) => m.x === 3 && m.y === 4));
    ok(up.got.some((m) => m.x === 3 && m.y === 4), 'the new holder\'s input is forwarded upstream');
    f.send({ type: 'handback' });
    await f.until((v) => v.last('mode') && v.last('mode').mode === 'watch');
    ok(keeper.inputStateFor(KEY_A, p.id).input === 'agent', '…and it hands back like any holder');
    unIn(); f.ws.close(); await sleep(50);
  }
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

// ═══ ④b lane J: the bridge reads the PAGE's viewport and never relays the CDP endpoint ═══
console.log('— ④b lane J: the page\'s viewport reading (first frame / picture / tab / takeover), replay, the private cdp_url pair');
{
  // a JPEG head that sizes itself (SOI + APP0 + SOF0 + EOI) — the bridge reads the picture's size off the SOF, never the metadata
  const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]).toString('base64');
  ok(S.jpegSize(jpeg(713, 720)).width === 713 && S.jpegSize(jpeg(713, 720)).height === 720, 'the crafted head sizes itself (713×720)');
  const up = await fakeUpstream();
  const calls = []; let answer = { ok: true, clientWidth: 1265, clientHeight: 1277, targetId: 'T1' };
  const stubKeeper = { setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }), streamPortFor: async () => ({ ok: true, port: up.port }), viewportFor: async (t, o) => { calls.push({ kind: t.kind, activeUrl: o.activeUrl }); return answer; } };
  const active = new Map([['sess-v', { _browserKey: KEY_A, name: 'v', _browserEnv: [`AGENT_BROWSER_SESSION=vs-${KEY_A}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY_A}`] }]]);
  const warns = [];
  const bridge = BS.create({ keeper: stubKeeper, activeSessions: active, requestAuthed: () => true, log: { warn: (m) => warns.push(String(m)), log() { } }, now });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const PORT = await freePort(); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r)); servers.push(srv);
  const tapped = [];
  const a = viewer(PORT, 'session=sess-v');
  await a.until((v) => v.by('status').some((m) => m.state === 'upstream-open'));
  await bridge.tap('sess-v', '', (m) => tapped.push(m));
  up.send({ type: 'tabs', tabs: [{ tabId: 't1', url: 'https://x.test/page', active: true }] });
  up.send({ type: 'frame', data: jpeg(713, 720), metadata: { deviceWidth: 1280, deviceHeight: 720, timestamp: 0 } });
  await a.until((v) => !!v.last('viewport'));
  const v1 = a.last('viewport');
  ok(calls.length === 1 && calls[0].kind === 'ephemeral' && calls[0].activeUrl === 'https://x.test/page' && v1.ok && v1.clientWidth === 1265 && v1.clientHeight === 1277 && v1.why === 'first-frame' && v1.picture.width === 713 && v1.picture.height === 720, 'the FIRST frame asks the keeper for the page\'s viewport under the active tab\'s url; every viewer gets {viewport 1265×1277, picture 713×720}', JSON.stringify({ calls, v1 }));
  for (let i = 0; i < 3; i++) up.send({ type: 'frame', data: jpeg(713, 720), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await sleep(150);
  ok(calls.length === 1, 'frames of the SAME picture size read nothing (one read per change, never per frame)');
  answer = { ok: true, clientWidth: 1280, clientHeight: 577 };
  up.send({ type: 'frame', data: jpeg(1280, 577), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await a.until((v) => v.by('viewport').length >= 2);
  ok(calls.length === 2 && a.last('viewport').why === 'picture' && a.last('viewport').clientHeight === 577 && bridge.stats()[0].picture.height === 577, 'a picture of another size re-reads the page (why: picture)');
  up.send({ type: 'tabs', tabs: [{ tabId: 't1', url: 'https://x.test/page', active: false }, { tabId: 't2', url: 'https://y.test/', active: true }] });
  await a.until((v) => v.by('viewport').length >= 3);
  ok(calls.length === 3 && a.last('viewport').why === 'tab' && calls[2].activeUrl === 'https://y.test/', 'another ACTIVE tab re-reads the page under ITS url (why: tab)');
  a.send({ type: 'takeover' });
  await a.until((v) => v.by('viewport').length >= 4);
  ok(calls.length === 4 && a.last('viewport').why === 'takeover', 'a takeover re-reads the page the moment input starts to matter (why: takeover)');
  const b = viewer(PORT, 'session=sess-v');
  await b.until((v) => !!v.last('viewport'));
  ok(b.last('viewport').ok && b.last('viewport').clientHeight === 577 && calls.length === 4, 'a LATE viewer is replayed the last good reading at once (no new read)');
  // the daemon's own cdp_url pair (the ephemeral viewport read asks it) never reaches a viewer or a tap
  const nA = a.msgs.length, nT = tapped.length;
  up.send({ type: 'command', id: 'r1', action: 'cdp_url', params: { action: 'cdp_url', id: 'r1' } });
  up.send({ type: 'result', id: 'r1', action: 'cdp_url', data: { cdpUrl: 'ws://127.0.0.1:9/devtools/browser/secret' } });
  up.send({ type: 'command', id: 'r2', action: 'click', params: { action: 'click', selector: '#x' } });
  await a.until((v) => v.msgs.slice(nA).some((m) => m.type === 'command' && m.action === 'click'));
  ok(!a.msgs.slice(nA).some((m) => m.action === 'cdp_url') && !JSON.stringify(a.msgs).includes('devtools/browser/secret') && !tapped.slice(nT).some((m) => m.action === 'cdp_url') && tapped.slice(nT).some((m) => m.action === 'click'), 'the cdp_url command/result pair is dropped before the fan-out AND the taps; the next ordinary command still flows');
  // a read that fails: said to the viewers typed, said ONCE in the journal
  answer = { ok: false, error: 'no CDP endpoint for this browser' };
  up.send({ type: 'frame', data: jpeg(900, 500), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await a.until((v) => v.last('viewport') && v.last('viewport').ok === false);
  up.send({ type: 'frame', data: jpeg(901, 500), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await a.until((v) => v.by('viewport').filter((m) => m.ok === false).length >= 2);
  ok(a.last('viewport').error === 'no CDP endpoint for this browser' && warns.filter((w) => /viewport could not be read/.test(w)).length === 1 && bridge.stats()[0].viewport.clientHeight === 577, 'a failed read reaches the viewers typed ({ok:false, error}), the journal ONCE, and the last good reading stays the relay\'s', JSON.stringify(warns));
  a.ws.close(); b.ws.close();
  await sleep(50);
  bridge.shutdown(); await up.close();
}
{
  // THE ORCH READER over a fake CDP endpoint: /json/list → the active page's socket → Page.getLayoutMetrics
  const VP = require('../src/server/browser-viewport.js');
  const port = await freePort();
  const asked = [];
  const hsrv = http.createServer((req, res) => {
    if (req.url === '/json/list') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 'NT', type: 'page', url: 'chrome://newtab/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/NT` }, { id: 'P1', type: 'page', url: 'https://x.test/page', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/P1` }])); return; }
    res.statusCode = 404; res.end();
  });
  const wss = new WebSocketServer({ server: hsrv });
  wss.on('connection', (ws, req) => { ws.on('message', (d) => { const m = JSON.parse(d); asked.push({ path: req.url, method: m.method }); ws.send(JSON.stringify({ id: m.id, result: { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: req.url.endsWith('/P1') ? 1265 : 1, clientHeight: req.url.endsWith('/P1') ? 1277 : 1 } } })); }); });
  await new Promise((r) => hsrv.listen(port, '127.0.0.1', r)); servers.push(hsrv);
  const r = await VP.readViewport(`ws://127.0.0.1:${port}/devtools/browser/abc`, { activeUrl: 'https://x.test/page' });
  ok(r.ok && r.clientWidth === 1265 && r.clientHeight === 1277 && r.targetId === 'P1' && asked.length === 1 && asked[0].path === '/devtools/page/P1' && asked[0].method === 'Page.getLayoutMetrics', 'readViewport: the ACTIVE page\'s socket, ONE Page.getLayoutMetrics, its layout viewport', JSON.stringify({ r, asked }));
  const dead = await VP.readViewport(`ws://127.0.0.1:${await freePort()}/devtools/browser/x`, { timeoutMs: 800 });
  ok(!dead.ok && typeof dead.error === 'string' && (await VP.readViewport('not a url')).ok === false, 'an endpoint that answers nothing ⇒ {ok:false, error}, bounded, never a throw');
  wss.close();
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
  // r2 L8: the agent's `detach` while the user drives — the route answers 409 browser_paused and the CLI prints it; the lease stands
  const dz = await post('/api/agent/browser/detach', {}, { Authorization: 'Bearer ' + TOKEN });
  const cliD = await runCli(['detach']);
  ok(dz.status === 409 && dz.json.code === 'browser_paused' && cliD.status === 1 && /\[browser_paused\]/.test(cliD.stderr) && keeper.leasesFor(KEY_A).some((l) => l.profileId === p.id) && keeper.inputStateFor(KEY_A, p.id).input === 'user', 'r2 L8: the agent\'s detach route answers 409 browser_paused and `vibespace-browser detach` exits 1 printing it — the lease and the takeover stand', JSON.stringify({ dz: dz.status, code: dz.json.code, cli: cliD.status, se: cliD.stderr.slice(0, 300) }));
  keeper.handback({ browserKey: KEY_A, profileId: p.id, cause: 'explicit' });
  const cli2 = await runCli(['watch']);
  ok(cli2.status === 0 && /browser_paused/.test(cli2.stdout) && /Take over/.test(cli2.stdout), '`watch` explains the takeover contract to the agent');
}

// ═══ ⑦ lane J r2: THE KEYBOARD WHILE YOU DRIVE · STALE APPROVALS · THE PICTURE'S PLACEMENT ═══
// The 2026-09-25 naive-user study (three operators, master 2.369.177): typed text vanished or landed in the CHAT
// COMPOSER ("tomsmithtomsmith…" — a password one Enter from sent); an approval queued before a takeover ran a stale
// step after the hand back (S8-36); the picture sat between two dark bands. The PURE tables, the real normalizer +
// adapter under the stale sweep (with a patched-copy control), and the one-answer census; the real rung is
// test-browser-live ⑥ (heavy).
console.log('— ⑦ lane J r2: keyboard ownership, the key routes, text records, top-aligned mapping, stale approvals');
{
  // ── keyboard ownership: only takeover + mine + connected + displayed + open ──
  const own = (o) => T.keyboardOwnership(o).owns;
  ok(own({ mode: 'takeover', mine: true }) && !own({ mode: 'watch', mine: true }) && !own({ mode: 'takeover', mine: false })
    && !own({ mode: 'takeover', mine: true, connected: false }) && !own({ mode: 'takeover', mine: true, displayed: false }) && !own({ mode: 'takeover', mine: true, closed: true }),
    'keyboardOwnership: ONLY a takeover of this viewer, on an open socket, on screen, in an open window owns the keyboard');
  ok(T.keyboardOwnership({ mode: 'takeover', mine: true, connected: false }).why === 'disconnected' && T.keyboardOwnership({ mode: 'takeover', mine: true, displayed: false }).why === 'hidden', '…and each refusal is named (disconnected / hidden)');
  // ── key routes ──
  const K = (key, o = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, keyCode: 0, ...o });
  const to = (k, o) => T.keyRoute(k, o).to;
  ok(['a', 'Z', '1', ' ', 'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'Home', 'PageDown', 'F5', 'Shift', 'Control', 'é'].every((k) => to(K(k)) === 'page'),
    'every ordinary key goes to the PAGE — Esc and Tab included (pages close their own dialogs with Esc; handing back is the button)');
  ok(T.keyRoute(K('\\', { ctrlKey: true })).to === 'app' && T.keyRoute(K('\\', { ctrlKey: true })).chord === 'command-mode' && T.keyRoute(K('ArrowLeft', { ctrlKey: true, altKey: true })).chord === 'desktop-switch' && T.keyRoute(K('ArrowRight', { ctrlKey: true, altKey: true })).to === 'app',
    'the reserved chords stay the app\'s: Ctrl+\\ (command mode) and Ctrl+Alt+←/→ (desktop switch)');
  ok(to(K('@', { ctrlKey: true, altKey: true })) === 'page' && to(K('a', { ctrlKey: true })) === 'page' && to(K('ArrowLeft', { ctrlKey: true })) === 'page', '…and nothing else: AltGr characters (Ctrl+Alt on Windows), Ctrl+A, Ctrl+← all go to the page');
  ok(new Set(T.RESERVED_CHORDS.map((c) => c.id)).size === 2 && T.RESERVED_CHORDS.every((c) => c.why && c.spell), `RESERVED_CHORDS is the closed, named list (${T.RESERVED_CHORDS.map((c) => c.spell).join(' · ')})`);
  ok(to(K('m'), { appMode: 'command' }) === 'app' && to(K('m')) === 'page', 'once the command-mode prefix is armed the next key is the window manager\'s');
  ok(to(K('v', { ctrlKey: true })) === 'paste' && to(K('v', { metaKey: true })) === 'paste' && to(K('Insert', { shiftKey: true })) === 'paste' && to(K('v', { ctrlKey: true, altKey: true })) === 'page',
    'the paste chord lets the browser raise `paste` (its TEXT is forwarded, never the chord)');
  ok(to(K('a', { isComposing: true })) === 'compose' && to(K('Process', { keyCode: 229 })) === 'compose' && to(K('Dead')) === 'compose', 'an IME composition / a dead key composes in the view\'s sink (compositionend forwards the text)');
  // ── focus: no editable element outside the view while it owns ──
  ok(T.focusVerdict({ owns: true, editable: true, insideView: false }) === 'reclaim' && T.focusVerdict({ owns: true, editable: true, insideView: true }) === 'allow'
    && T.focusVerdict({ owns: true, editable: false }) === 'allow' && T.focusVerdict({ owns: false, editable: true }) === 'allow',
    'focusVerdict: an editable element elsewhere (the chat composer, a terminal\'s textarea) is RECLAIMED while the view owns; its own sink, a button, or no ownership is left alone');
  ok(T.ownerOf([{ id: 'a', owns: true }, { id: 'b', owns: true }]) === 'b' && T.ownerOf([{ id: 'a', owns: true }, { id: 'b', owns: false }]) === 'a' && T.ownerOf([]) === null, 'ownerOf: two views driving on one client — the LAST claim that still owns wins');
  // the client registry (src/lib/keyboard-owner.js — ESM, the bundle's copy) over the same rule
  const KO = await import(path.join(REPO, 'src/lib/keyboard-owner.js'));
  let aOwns = true, bOwns = true;
  KO.claimKeyboard({ id: 'A', owns: () => aOwns }); KO.claimKeyboard({ id: 'B', owns: () => bOwns });
  const o1 = KO.keyboardOwner()?.id; bOwns = false; const o2 = KO.keyboardOwner()?.id; aOwns = false; const o3 = KO.keyboardOwned();
  KO.releaseKeyboard('A'); KO.releaseKeyboard('B');
  ok(o1 === 'B' && o2 === 'A' && o3 === false && KO.keyboardOwned() === false, 'keyboard-owner.js: ownership is RE-ASKED every time (a view that stops owning releases without bookkeeping); released claims are gone');
  // ── the focus guards sit where every attach / reconnect / window focus converges ──
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const focusBody = (file, head) => { const s = src(file); const i = s.indexOf(head); return i < 0 ? '' : s.slice(i, i + 400); };
  ok(/if \(keyboardOwned\(\)\) return;/.test(focusBody('src/lib/chat-input.js', '  focus() {')) && /if \(!keyboardOwned\(\)\) this\.terminal\.focus\(\)/.test(focusBody('src/lib/terminal.js', '  focus() {')),
    'ChatInput.focus (the attach path: ChatView.focus → here) and TerminalSession.focus stand down while a takeover owns the keyboard');
  ok(/chatView\.focus\(\)/.test(src('src/lib/session-lifecycle.js')) && /focus\(\) \{\n    if \(this\._chatInput\) this\._chatInput\.focus\(\);/.test(src('src/lib/chat-view.js')), '…and the two attach sites the study named (session-lifecycle chatView.focus) reach the guard through ChatView.focus → ChatInput.focus (never a per-site patch)');
  const LW = src('src/lib/browser-live-window.js');
  // each document listener's registration = the text from its `document.addEventListener('<ev>'` to the next one
  const docRegs = LW.split("document.addEventListener('").slice(1).map((chunk) => ({ ev: chunk.slice(0, chunk.indexOf("'")), body: chunk }));
  const KB_EVENTS = ['keydown', 'keyup', 'keypress', 'paste', 'beforeinput', 'compositionstart', 'compositionend', 'focusin'];
  ok(KB_EVENTS.every((ev) => docRegs.some((r) => r.ev === ev && /,\s*capture\);/.test(r.body))) && /const capture = \{ capture: true, signal: winInfo\._listenerCtl\?\.signal \}/.test(LW),
    'the live view\'s keyboard listeners are DOCUMENT-level, capture phase, and bound to the window\'s AbortController (keydown/keyup/keypress/paste/beforeinput/composition/focusin)');
  ok(!/root\.addEventListener\('keydown'/.test(LW) && !/FORWARDED_KEYS/.test(LW), '…and the pre-fix path (keys forwarded only while the view\'s own element had focus) is gone');

  // ── text a viewer hands the page ──
  const tr = S.textRecords('tomsmith');
  ok(tr.ok && tr.records.length === 1 && tr.records[0].type === 'input_keyboard' && tr.records[0].eventType === 'char' && tr.records[0].text === 'tomsmith', 'textRecords: a paste / composition becomes the stream server\'s `char` record (measured 0.38.1: a multi-character char inserts all of it)');
  const emoji = '😀'.repeat(S.TEXT_CHUNK + 1);
  const er = S.textRecords(emoji);
  ok(er.ok && er.records.length === 2 && er.records.every((r) => !/[\uD800-\uDBFF]$/.test(r.text)) && er.records.map((r) => r.text).join('') === emoji, 'textRecords chunks on CODE POINTS (never splitting a surrogate pair)');
  ok(S.textRecords('a\r\nb').records[0].text === 'a\nb' && S.textRecords('').code === 'empty' && S.textRecords('x'.repeat(S.TEXT_MAX + 1)).code === 'too_long', '…normalizes CRLF, refuses empty, and refuses (never trims) a paste past TEXT_MAX');
  ok(S.keyRecord({ key: 'F5', keyCode: 116 }).windowsVirtualKeyCode === 116 && S.keyRecord({ key: 'a' }).windowsVirtualKeyCode === 65 && S.keyRecord({ key: 'x', keyCode: 229 }).windowsVirtualKeyCode === 88, 'keyRecord takes the DOM\'s keyCode (F-keys were 0 before), never the IME\'s 229');
  // ── the picture is TOP-aligned; every conversion reads the same word ──
  const el = { left: 10, top: 20, width: 700, height: 900 };
  const dT = S.drawnRect(el, 1280, 577, 'top'), dC = S.drawnRect(el, 1280, 577);
  ok(S.LIVE_ALIGN === 'top' && dT.top === 20 && Math.round(dT.height) === Math.round(577 * 700 / 1280) && Math.round(dC.top - 20) === Math.round((900 - 577 * 700 / 1280) / 2), `drawnRect: top-aligned the picture starts at the pane's top (band above 0 px; centred it was ${Math.round(dC.top - 20)} px)`);
  const pT = S.pointerToDevice({ clientX: 10 + 525 * 700 / 1280, clientY: 20 + 275 * 700 / 1280, elRect: el, frameW: 1280, frameH: 577, align: 'top' });
  const vT = S.deviceToViewport({ x: 525, y: 275, elRect: el, frameW: 1280, frameH: 577, align: 'top' });
  ok(pT && pT.x === 525 && pT.y === 275 && Math.abs(vT.top - (20 + 275 * 700 / 1280)) < 0.01, 'pointerToDevice / deviceToViewport round-trip under the top alignment');
  const pC = S.pointerToDevice({ clientX: 10 + 525 * 700 / 1280, clientY: 20 + 275 * 700 / 1280, elRect: el, frameW: 1280, frameH: 577 });
  ok(pC === null || pC.y < 0 || Math.abs(pC.y - 275) > 100, `control: the same pointer through the CENTRED maths misses the drawn point (${pC ? `y ${pC.y}` : 'mapped outside'}) — the align word must match the CSS`);
  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/\.browser-live-img \{[^}]*object-position: 50% 0;/.test(css) && (LW.match(/align: LIVE_ALIGN/g) || []).length >= 3 && /drawnRect\(rectOf\(img\), g \? g\.picW : 0, g \? g\.picH : 0, LIVE_ALIGN\)/.test(LW),
    'the CSS says object-position 50% 0 and the live view passes LIVE_ALIGN to the pointer, the cursors and drawn() (one placement)');

  // ── STALE APPROVALS: the PURE verdict over the CLI's own verb table ──
  const VERBS = require('../src/browser-verbs.js');
  const V = (command, taken = { handles: [], isDefault: true }, extra = {}) => T.browserApprovalVerdict({ permission: { toolName: 'Bash', input: { command }, ...extra }, classify: VERBS.classify, taken });
  ok(V('vibespace-browser click @e3').stale && V('vibespace-browser -- get url').stale && V('cd /w && timeout 30 vibespace-browser fill @e2 "tom smith"').stale && V('node /x/data/bin/vibespace-browser open https://example.com').stale,
    'a pending PAGE command on the browser the user took is STALE (bare, `--` escape, after cd/timeout, through node)');
  ok(!V('vibespace-browser status').stale && !V('vibespace-browser help').stale && !V('echo vibespace-browser click').stale && !V('ls -la').stale && !V('grep vibespace-browser notes.md').stale,
    '…a non-page verb (status/help), a MENTION (echo/grep) and an unrelated command are not');
  const taken2 = { handles: ['bp-2', 'personal'], isDefault: false };
  ok(!V('vibespace-browser click @e1', taken2).stale && V('vibespace-browser --profile personal click @e1', taken2).stale && !V('vibespace-browser --profile work click @e1', taken2).stale,
    'the handle decides: the user took "personal" (not the default) — a bare command goes to the default and runs, `--profile personal` is stale, `--profile work` is not');
  ok(!V('vibespace-browser click @e1', undefined, { resolved: 'allowed' }).stale && !T.browserApprovalVerdict({ permission: { toolName: 'Read', input: { command: 'vibespace-browser click' } }, classify: VERBS.classify, taken: { isDefault: true } }).stale && V('vibespace-browser "click').stale,
    '…an answered card, a non-shell tool are never stale; a command that names the CLI but cannot be read (an unclosed quote) IS (deny costs one re-plan; a guess could act on a page)');
  ok(T.browserApprovalVerdict({ permission: { toolName: 'Bash', input: { command: ['vibespace-browser', 'click', '@e3'] } }, classify: VERBS.classify, taken: { isDefault: true } }).stale, 'an argv-array command (a codex approval shape) is read too');
  const dt = T.staleDenyText({ moment: 'takeover', label: 'Work' }), dh = T.staleDenyText({ moment: 'handback' });
  ok(dt.startsWith(T.STALE_MARK) && T.STALE_MARK.startsWith('browser_paused') && /the "Work" browser/.test(dt) && /did NOT run/.test(dt) && /wait for the handback/.test(dt) && /queued while the user drove your browser/.test(dh),
    'staleDenyText NAMES browser_paused first, says the step did NOT run and what to do (wait / re-plan from the handback)');
  ok(JSON.stringify(T.staleFromDenyMessage(dt)) === '{"code":"browser_paused","moment":"takeover"}' && T.staleFromDenyMessage(dh).moment === 'handback' && T.staleFromDenyMessage('User denied this action') === null,
    'staleFromDenyMessage reads the reason back (a restart-rebuilt card keeps it); a user\'s own Deny is not stale');

  // ── the REAL normalizer + the REAL claude adapter + THE one permission answer under the sweep ──
  const N = require('../src/normalizers.js');
  const { createAdapterRegistry } = require('../src/adapters/index.js');
  const { answerPermission } = require('../src/server/permission-answer.js');
  const reg = createAdapterRegistry({});
  const SID = '00000000-0000-4000-8000-00000000a7e2';
  const toolUse = (id, command) => ({ type: 'assistant', message: { id: 'msg_' + id, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_' + id, name: 'Bash', input: { command, description: 'x' } }], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } }, parent_tool_use_id: null, session_id: SID });
  const ctlReq = (id, command) => ({ type: 'control_request', request_id: 'req_' + id, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command, description: 'x' }, permission_suggestions: [], tool_use_id: 'toolu_' + id } });
  const CARDS = [['click', 'vibespace-browser click @e3'], ['ls', 'ls -la'], ['status', 'vibespace-browser status'], ['work', 'vibespace-browser --profile work fill @e1 hi']];
  const mkSession = (bk) => {
    const s = { mode: 'chat', backend: 'claude', buffer: '', _browserKey: bk, writes: [], name: 'lane-j' };
    s.pty = { write: (l) => { s.writes.push(l); } };
    s._normalizer = N.createMessageManager('claude', 'sess-lj2');
    s.edits = []; s._normalizer.onOp((op) => { if (op.op === 'edit' && op.fields && op.fields.permission) s.edits.push(op); });
    for (const [id, cmd] of CARDS) { N.feedLive(s, toolUse(id, cmd)); N.feedLive(s, ctlReq(id, cmd)); }
    return s;
  };
  const approvalsSeam = { pending: (s) => N.pendingPermissions(s), answer: (_id, s, data) => answerPermission(s, data, { adapterRegistry: reg, feedLive: N.feedLive }), note: (s, rid, staleBy) => N.notePermissionStale(s, rid, staleBy) };
  const mkKeeper = (atts = []) => { const fns = new Set(); return { fns, onInput: (fn) => { fns.add(fn); return () => fns.delete(fn); }, onConfirmation: () => () => {}, setFor: () => ({ attachments: atts }), profile: (id) => ({ id, label: id === 'bp-2' ? 'Personal' : 'Work' }), emit: (ev) => { for (const fn of fns) fn(ev); } }; };
  const permOf = (s, id) => s._normalizer.messages.find((m) => m.permission && m.permission.requestId === 'req_' + id)?.permission;
  const runSweep = (mod, s, atts, ev) => {
    const kp = mkKeeper(atts);
    const sessions = new Map([['sess-lj2', s]]);
    const h = mod.create({ keeper: kp, activeSessions: sessions, approvals: approvalsSeam, deliver: { deliverToConversation: async () => ({ ok: true }) }, log: { log() { }, warn() { } } });
    h.install();
    kp.emit({ sessionId: 'sess-lj2', browserKey: s._browserKey, profileId: null, state: {}, ...ev });
    h.shutdown();
  };
  {
    const s = mkSession('bk-0000lj21');
    ok(N.pendingPermissions(s).length === 4 && CARDS.every(([id]) => permOf(s, id) && !permOf(s, id).resolved), 'setup: four pending approval cards through the real normalizer (a browser click, `ls`, `vibespace-browser status`, a --profile work fill)');
    runSweep(H, s, [], { kind: 'takeover' });
    const cr = s.writes.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.type === 'control_response');
    ok(cr.length === 1 && cr[0].response.request_id === 'req_click' && cr[0].response.response.behavior === 'deny' && cr[0].response.response.message.startsWith('browser_paused — the user took over your browser'),
      'the TAKEOVER answers the pending browser click with a deny that NAMES browser_paused (one control_response on the session\'s stdin, the adapter\'s own frame)', JSON.stringify(s.writes).slice(0, 400));
    const pc = permOf(s, 'click');
    ok(pc.resolved === 'denied' && pc.staleBy && pc.staleBy.code === 'browser_paused' && pc.staleBy.moment === 'takeover' && s.edits.some((e) => e.fields.permission.requestId === 'req_click' && e.fields.permission.staleBy),
      'the card is resolved `denied` + staleBy {browser_paused, takeover}, and every client hears the edit');
    ok(!permOf(s, 'ls').resolved && !permOf(s, 'status').resolved && !permOf(s, 'work').resolved, '`ls`, `vibespace-browser status` and a command on another profile (no attachment named "work": the ephemeral browser was taken, a named handle goes elsewhere) stay pending');
    ok(s.buffer.includes('"request_id":"req_click"') && s.buffer.includes('browser_paused'), 'the answer is in the session buffer (a refresh keeps the resolution)');
    // a restart: a NEW normalizer rebuilt from the same records + the buffered answer keeps the reason (the deny text)
    const mm2 = N.createMessageManager('claude', 'sess-lj2b');
    for (const [id, cmd] of CARDS) { mm2.processLive(toolUse(id, cmd)); mm2.processLive(ctlReq(id, cmd)); }
    for (const l of s.buffer.split('\n').filter(Boolean)) mm2.processLive(JSON.parse(l));
    const p2 = mm2.messages.find((m) => m.permission && m.permission.requestId === 'req_click').permission;
    ok(p2.resolved === 'denied' && p2.staleBy && p2.staleBy.moment === 'takeover', 'REBUILT from the buffer (a server restart) the card still says why — the deny text carries the reason');
    // the HANDBACK moment: a browser card queued WHILE the user drove is stale too
    N.feedLive(s, toolUse('during', 'vibespace-browser snapshot -i')); N.feedLive(s, ctlReq('during', 'vibespace-browser snapshot -i'));
    runSweep(H, s, [], { kind: 'handback', cause: 'explicit', url: 'https://example.com/after' });
    const pd = permOf(s, 'during');
    const last = JSON.parse(s.writes[s.writes.length - 1]);
    ok(pd.resolved === 'denied' && pd.staleBy.moment === 'handback' && /queued while the user drove/.test(last.response.response.message), 'the HANDBACK answers a browser card queued during the takeover stale too ("queued while the user drove")');
  }
  {
    // profile-scoped: the user took "personal" (not the default) — only commands that land on it go stale
    const s = mkSession('bk-0000lj22');
    N.feedLive(s, toolUse('pers', 'vibespace-browser --profile personal click @e9')); N.feedLive(s, ctlReq('pers', 'vibespace-browser --profile personal click @e9'));
    runSweep(H, s, [{ profileId: 'bp-1', alias: 'work', isDefault: true }, { profileId: 'bp-2', alias: 'personal', isDefault: false }], { kind: 'takeover', profileId: 'bp-2' });
    ok(permOf(s, 'pers').resolved === 'denied' && !permOf(s, 'click').resolved && !permOf(s, 'work').resolved, 'a takeover of a NON-default attachment stales only the commands naming it (`--profile personal`); the bare click (→ the default) and `--profile work` run as asked');
    ok(/the "Personal" browser/.test(JSON.parse(s.writes[0]).response.response.message), '…and the deny names the profile the user took');
  }
  {
    // NEGATIVE CONTROL: the announcer with the sweep neutered at its ONE call site (a patched copy) leaves the stale card pending
    const MC = mutantCopies('browser-takeover-lj2', REPO);
    const HS = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
    const line = "      if (ev.kind === 'takeover' || ev.kind === 'handback') { try { sweepStale(ev, ev.kind); } catch (e) { log.warn?.(`[browser] stale-approval sweep failed — ${e && e.message}`); } }";
    ok(HS.split(line).length === 2, 'control setup: the sweep\'s one call site is found exactly once');
    const H0 = MC.load('src/server/browser-handback.js', HS.replace(line, '      /* NEGATIVE CONTROL: no stale sweep */'));
    const s = mkSession('bk-0000lj23');
    runSweep(H0, s, [], { kind: 'takeover' });
    ok(!permOf(s, 'click').resolved && s.writes.length === 0, 'NEGATIVE CONTROL: without the sweep the pre-takeover browser click stays PENDING after the takeover — Allow would run it on a page the user changed (the study\'s S8-36)');
  }
  {
    // harness-neutral: a normalizer whose deny carries no message still gets the card's reason through notePermissionStale;
    // and a rebuild in progress QUEUES the mark (the live-feed gate)
    const edits = [];
    const mm = { messages: [{ id: 'm1', permission: { requestId: 7, resolved: 'denied' } }], _emit: (op) => edits.push(op) };
    const s = { _normalizer: mm };
    ok(N.notePermissionStale(s, 7, { code: 'browser_paused', moment: 'takeover', at: 1 }) && mm.messages[0].permission.staleBy.moment === 'takeover' && edits.length === 1, 'notePermissionStale marks the card on any normalizer (codex / ACP decline carries no message) and emits the edit');
    const q = { _normalizer: mm, _rebuildQueue: [] };
    ok(N.notePermissionStale(q, 7, { code: 'browser_paused', moment: 'handback', at: 2 }) && q._rebuildQueue.length === 1 && q._rebuildQueue[0].kind === 'perm-stale', '…and mid-rebuild it is QUEUED behind the live-feed gate (drained in order)');
  }
  {
    // ONE answer path: the ws permission-response case and the sweep share answerPermission; nothing else formats + writes
    const wsSrc = src('src/ws-handler.js');
    const caseBody = wsSrc.slice(wsSrc.indexOf("case 'permission-response': {"), wsSrc.indexOf("case 'set-goal': {"));
    ok(/answerPermission\(activeSessions\.get\(data\.sessionId\), \{ \.\.\.data, denyMessage: undefined \}, \{ adapterRegistry, feedLive \}\)/.test(caseBody) && !/formatPermissionResponse/.test(caseBody), 'the ws permission-response case answers through THE one permission answer (src/server/permission-answer.js), and a CLIENT cannot name the deny\'s words (denyMessage is the server\'s: no client paints a card stale)');
    const rUser = JSON.parse(reg.get('claude').formatPermissionResponse({ requestId: 'r1', approved: false, denyMessage: undefined }));
    ok(rUser.response.response.message === 'User denied this action' && T.staleFromDenyMessage(rUser.response.response.message) === null, '…so a user\'s own Deny is the CLI\'s familiar sentence, never read back as stale');
    const callers = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (!['lib', 'agentd'].includes(e.name)) walk(rel); } else if (rel.endsWith('.js') && /formatPermissionResponse\s*\(/.test(fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''))) callers.push(rel); } };
    walk('src');
    const allowed0 = ['src/server/permission-answer.js', 'src/adapters/base.js', 'src/adapters/claude-code.js', 'src/adapters/codex.js', 'src/adapters/acp.js', 'src/adapters/shell.js'];
    ok(callers.includes('src/server/permission-answer.js') && callers.every((f) => allowed0.includes(f)), `census: formatPermissionResponse is called ONLY by the one answer (+ the adapters that define it): ${callers.join(', ')}`);
    ok(/approvals: \(\(\) => \{[\s\S]{0,400}answerPermission\(session, data, \{ adapterRegistry, feedLive: N\.feedLive \}\)/.test(src('src/server/mounts-plugins-wiring.js')) && /activeSessions, adapterRegistry,\n\}\);/.test(src('server.js')),
      'WIRING PIN: the announcer is handed the approvals seam over the one answer, and server.js hands the wiring the adapter registry');
  }
}

keeper.shutdown();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
