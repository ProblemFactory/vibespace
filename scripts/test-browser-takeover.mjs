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
//   ⑧ THE OWNER'S RULING (2026-09-27, "直接打断所有脚本和agent操作，告知agent发生了
//      打断，交还时提醒它重新运行"): PURE src/browser-interrupt.js — what was in flight
//      is a function of the trace ring + the takeover instant (launch / the
//      recorder's probe are no operation; a result after the instant keeps it in
//      flight), the cycle (a second takeover merges, never double-counts; the
//      handback closes it), the words; the REAL recorder's ring + the REAL keeper
//      (the event carries the trace's verbs, a refused verb joins the re-run list);
//      the announcer — ONE card (the ladder's card path, kind notification, never a
//      delivery) + ONE zero-spend notice per cycle, the explicit handback's text
//      ends "Re-run what was interrupted: …" once, a cycle with nothing in flight
//      and nothing refused is byte-identical to before, the idle item carries the
//      list; CONTROL: an announcer copy without the takeover card stays silent. The
//      shipped CLI end to end (⑥): a verb running when the user takes over prints
//      [browser_interrupted] and exits 1.
//   ⑦ lane J r2 (the 2026-09-25 naive-user study): the keyboard while you
//      drive (ownership / key routes / reserved chords / paste / IME / focus
//      reclaim / one owner per client, and the focus guards' placement), the
//      text records, the TOP-aligned mapping (+ a centred-maths control), the
//      stale-approval verdict over the CLI's own verb table, and the REAL
//      normalizer + claude adapter + the one permission answer under the
//      takeover/handback sweep (a restart keeps the reason; a patched copy of
//      the announcer without the sweep leaves the card pending — the control);
//      the one-answer census and the wiring pin. lane takeover-keyboard (userW
//      inc-mum339id-1zsb): the user's OWN press yields — focusVerdict +
//      byUserPress, userPressFocus (window / trust / same input), ownership's
//      `yielded`, yieldAfter, keyboardYielded + the change signal, and five
//      patched-copy controls each failing exactly its rows (the client model
//      is scripts/test-takeover-keyboard.mjs, the chrome leg
//      test-browser-live-input ⑥).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81) // lane H: copiesCensus; lane J r2: the stale sweep's patched-copy control
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
if (a === 'wait') { setTimeout(() => { out({ success: true, data: { waited: Number(b) || 0 } }); process.exit(0); }, Number(b) || 0); return; }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
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
  // lane browser-resume B (§3.9, the owner's ruling 2): "Hand back and continue" — the between-turns twin: its stash entry
  // is the ONE carrier (never a delivered turn, never the notice beside it), whatever the setting
  ok(T.HANDBACK_CAUSES.includes('continue') && T.decideHandback({ state: t0.state, cause: 'continue', now: 200 }).cause === 'continue' && T.announceVerdict({ cause: 'continue', announceIdle: true }).deliver === false && T.announceVerdict({ cause: 'continue' }).notice === false && T.handbackWakes({ own: true, ownRerun: ['click'] }) === 1, 'lane browser-resume B: `continue` is a handback cause — never delivered, no notice beside the stash (the explicit Hand back still wakes 1)');
  const stopText = T.handbackText({ cause: 'stop', label: 'Work', url: 'https://x.test/p' });
  ok(/stopped the "Work" browser/.test(stopText) && /control is back with you/.test(stopText) && /next browser command starts it again/.test(stopText) && /https:\/\/x\.test\/p/.test(stopText) && !/Re-orient/.test(stopText), 'r6 LOW 3: …its words: the user stopped the browser, control is back, its pages are gone and the next command starts it again (the page they were on named)', stopText);
  const paused = T.browserPausedRefusal({ state: t0.state, label: 'Work', handles: ['work'], now: 60100, idleMs: 600000 });
  ok(!paused.ok && paused.code === 'browser_paused' && /took over your window of the "Work" browser 60 s ago/.test(paused.error) && /did NOT run/.test(paused.error) && /10 min/.test(paused.error) && /Do not retry/.test(paused.error) && paused.takenAt === 100, 'the paused refusal names who/when, that the command did not run, when control returns, and forbids a loop');
  ok(/explicitly$|explicitly\)/.test(T.browserPausedRefusal({ state: t0.state, idleMs: 0 }).error) && !/after/.test(T.browserPausedRefusal({ state: t0.state, idleMs: 0 }).error.split('Wait')[1]), 'with idle handback off the refusal promises only the explicit handback');
  const text = T.handbackText({ cause: 'explicit', label: 'Work', url: 'https://x.test/after-login', heldMs: 90000 });
  ok(/handed your window of the "Work" browser back to you after 2 min/.test(text) && /Current URL: https:\/\/x\.test\/after-login/.test(text) && /Re-orient/.test(text), 'the announcement carries the URL first and the re-orient instruction');
  ok(/lapsed \(no input for 10 min\)/.test(T.handbackText({ cause: 'idle', idleMs: 600000 })) && /unknown \(read it/.test(T.handbackText({ cause: 'idle', idleMs: 600000 })), 'an idle announcement says it lapsed and, with no URL, says how to read it');
  ok(/<system-reminder>/.test(T.renderHandbackNotice(T.handbackNotice({ cause: 'idle', url: 'u' }))) && T.handbackNotice({ cause: 'nope' }).cause === 'idle' && T.handbackNotice({ cause: 'explicit' }).kind === 'browser-handback', 'the zero-spend notice is a typed kind rendered as a system reminder');
  const item = T.idleInboxItem({ label: 'Work', idleMs: 600000, url: 'https://x.test', sessionName: 'one' });
  ok(/lapsed after 10 min/.test(item.text) && /\(one\)/.test(item.text) && /Nothing was sent to the agent/.test(item.detail) && item.urgency === 'low', 'the idle inbox item says the takeover lapsed and that nothing was sent');
  // --confirm-actions: the documented 0.32.0 answer shape, both nestings, and the error-text fallback
  const c1 = T.confirmationFromUpstream({ type: 'result', action: 'eval', id: 'r1', success: false, confirmation_required: true, confirmation_id: 'c_8f3a1234', timestamp: 5000 });
  ok(c1 && c1.id === 'c_8f3a1234' && c1.action === 'eval' && c1.expiresAt === 5000 + T.CONFIRM_TTL_MS && c1.commandId === 'r1', 'a top-level confirmation_required result is read (id, action, the 60 s ttl)');
  ok(T.confirmationFromUpstream({ type: 'result', action: 'download', data: { confirmation_required: true, confirmation_id: 'c_1', category: 'download' } }, 1).category === 'download', '…and a data-nested one');
  // r6 A-F8: STRUCTURED FIELDS ONLY — an id / a flag spelled inside an error string is never a card (probe2's forge: a click
  // whose error echoes the pending upload's id parsed as {id: the upload, action: 'click'})
  ok(T.confirmationFromUpstream({ type: 'result', action: 'click', success: false, error: 'Action requires confirmation: run agent-browser confirm c_abcd12' }, 1) === null, 'r6 A-F8: an id inside an ERROR TEXT is never read as a confirmation (structured fields only)');
  ok(T.confirmationFromUpstream({ type: 'result', id: 'cmd2', action: 'click', success: false, error: 'Element not found: text=requires confirmation c_9f3a1b2c' }, 2000) === null, 'r6 A-F8: probe2\'s forged record (a click whose error echoes the pending upload\'s id) is NOT a confirmation');
  ok(T.confirmationFromUpstream({ type: 'command', action: 'click', confirmation_required: true, confirmation_id: 'c_1' }, 1) === null && T.confirmationFromUpstream({ action: 'click', confirmation_required: true, confirmation_id: 'c_1' }, 1) === null && T.confirmationFromUpstream({ type: 'result', action: 'x', confirmation_required: true, confirmation_id: 'c 1; rm' }, 1) === null, 'r6 A-F8: only a `result` record is one (a command / an untyped object is not), and an id the answer could never name is no card');
  const cUp = T.confirmationFromUpstream({ type: 'result', id: 'cmd1', action: 'upload', success: true, data: { confirmation_required: true, confirmation_id: 'c_9f3a1b2c', category: 'upload' } }, 1000, { command: { type: 'command', id: 'cmd1', action: 'upload', params: { selector: '#file', files: ['/home/u/.ssh/id_rsa'] } } });
  ok(cUp && cUp.id === 'c_9f3a1b2c' && cUp.action === 'upload' && cUp.target === '#file · /home/u/.ssh/id_rsa', 'r6 A-F8: the card names its TARGET off the paired command record (selector + the FILE being uploaded)', JSON.stringify(cUp));
  ok(T.confirmationFromUpstream({ type: 'result', id: 'x', action: 'navigate', data: { confirmation_required: true, confirmation_id: 'c_2' } }, 1, { command: { type: 'command', id: 'other', params: { url: 'https://evil.test' } } }).target === null, 'r6 A-F8: a command record under ANOTHER id never lends its target');
  ok(T.confirmationTarget({ params: { url: 'https://x.test/\u202Etxt.exe', value: 'secret-pw' } }) === 'https://x.test/⟨U+202E⟩txt.exe' && T.confirmationTarget({ params: { script: 'a'.repeat(300) } }).length <= 202 && T.confirmationTarget({ data: { description: 'plugin:vault credential.read my-app' } }) === 'plugin:vault credential.read my-app' && T.confirmationTarget({}) === null, 'r6 A-F8: the target is one visible line — a bidi override is SHOWN (⟨U+202E⟩), a fill value never, a script cut, upstream\'s own description when no params');
  const dUp = T.confirmationDigest(cUp);
  ok(/^[0-9a-f]{16}$/.test(dUp) && dUp === T.confirmationDigest({ ...cUp, at: 5, expiresAt: 9 }) && dUp !== T.confirmationDigest({ ...cUp, action: 'click' }) && dUp !== T.confirmationDigest({ ...cUp, target: '#file · /tmp/ok.txt' }) && dUp !== T.confirmationDigest({ ...cUp, id: 'c_9f3a1b2d' }), 'r6 A-F8: the digest covers exactly what the card shows (id, action, category, target) — not the clock');
  ok(T.confirmationView(cUp, 1000).digest === dUp && T.confirmationView(cUp, 1000).target === cUp.target, 'r6 A-F8: the view record carries the target and its digest');
  const forged = { ...cUp, action: 'click', target: null };
  ok(T.pendingNoteVerdict(null, cUp).kind === 'new' && T.pendingNoteVerdict(cUp, { ...cUp, at: 7 }).kind === 'same' && T.pendingNoteVerdict(cUp, forged).kind === 'conflict' && /first is kept/.test(T.pendingNoteVerdict(cUp, forged).error), 'r6 A-F8: FIRST WRITE WINS — a re-mirror is `same`, other content under a held id is a `conflict` (kept, said)');
  const gOk = T.answerGate({ entry: cUp, decision: 'confirm', shown: dUp, now: 2000 });
  const gTable = [
    ['no entry', T.answerGate({ entry: null, decision: 'deny', now: 2000 }).code, 'no_confirmation'],
    ['expired', T.answerGate({ entry: cUp, decision: 'confirm', shown: dUp, now: cUp.expiresAt }).code, 'no_confirmation'],
    ['confirm, no digest', T.answerGate({ entry: cUp, decision: 'confirm', now: 2000 }).code, 'shown_required'],
    ['confirm, the forged card\'s digest', T.answerGate({ entry: cUp, decision: 'confirm', shown: T.confirmationDigest(forged), now: 2000 }).code, 'confirmation_changed'],
    ['deny, no digest', T.answerGate({ entry: cUp, decision: 'deny', now: 2000 }).ok, true],
  ];
  ok(gOk.ok && gTable.every(([, got, want]) => got === want), 'r6 A-F8 answerGate: pending HERE or no_confirmation; a Confirm carries the digest of its card (missing ⇒ shown_required, another ⇒ confirmation_changed); a Deny needs only the pending entry', JSON.stringify(gTable));
  // ⑤ the card's rows never move up under the pointer
  let sl = T.confirmSlots([], ['a', 'b', 'c']);
  sl = T.confirmSlots(sl, ['b', 'c']);
  const s1 = sl.map((x) => x.id + (x.gone ? '†' : '')).join();
  sl = T.confirmSlots(sl, ['b', 'c', 'd']);
  const s2 = sl.map((x) => x.id + (x.gone ? '†' : '')).join();
  sl = T.confirmSlots(sl, ['a', 'b']);
  const s3 = sl.map((x) => x.id + (x.gone ? '†' : '')).join();
  ok(s1 === 'a†,b,c' && s2 === 'a†,b,c,d' && s3 === 'a†,b' && T.confirmSlots(T.confirmSlots([], ['x']), []).length === 0, 'r6 A-F8 ⑤ confirmSlots: a row that goes keeps its slot while a live row sits below it (b and c never move up), a new row joins at the END, trailing tombstones go, a gone id never revives', JSON.stringify({ s1, s2, s3 }));
  // r6 A-F9 (money): the count ONE explicit Hand back spends — the announcer's own verdict per conversation
  ok(T.handbackWakes({}) === 1 && T.handbackWakes({ siblings: [{ rerun: [] }, { rerun: ['fill'] }, { rerun: ['open', 'click'] }] }) === 3 && T.handbackWakes({ own: false, siblings: [{ rerun: [] }] }) === 0, 'r6 A-F9 handbackWakes: the primary + each sibling with something to re-run (a sibling with nothing is the free notice)');
  ok(T.handbackWakeEcho({ wakes: 3 }).ok && T.handbackWakeEcho({ wakes: 3, expect: 3 }).ok && T.handbackWakeEcho({ wakes: 3, expect: 1 }).code === 'wake_count_changed' && T.handbackWakeEcho({ wakes: 3, expect: 1 }).wakes === 3 && /nothing was handed back/.test(T.handbackWakeEcho({ wakes: 3, expect: 1 }).error) && T.handbackWakeEcho({ wakes: 1, expect: 'x' }).code === 'wake_count_changed', 'r6 A-F9 handbackWakeEcho: the count shown must be the count spent (absent = not checked; another ⇒ wake_count_changed with the count now)');
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
  ok(S.hello({}).protocol.input === 'holder-only' && S.hello({}).protocol.control.join(',') === 'takeover,handback,confirm,pass,claim', 'the hello names the input rule and the control verbs (+ `claim`, B-6ae8: "Continue here" on the user\'s own browsing window)');
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
  ok(!r.ok && r.code === 'browser_paused' && /took over the shared window of the "Work" browser \(your tab is in it\)/.test(r.error) && r.takenAt === clock, 'resolveFor refuses the agent\'s command with the typed browser_paused (verify r2 ⑦: this lease has no window of its own — the words name the shared one)');
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
  // r6 A-F8: a Confirm names the card it was pressed on — without the digest, or with another, NOTHING reaches upstream
  const okShown = keeper.pendingFor(KEY_A, p.id)[0].digest;
  const noShown = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_ok', decision: 'confirm' });
  const badShown = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_ok', decision: 'confirm', shown: T.confirmationDigest({ id: 'c_ok', action: 'click' }) });
  ok(noShown.code === 'shown_required' && badShown.code === 'confirmation_changed' && badShown.digest === okShown && confirms().length === 0 && keeper.pendingFor(KEY_A, p.id).length === 1, 'r6 A-F8: a Confirm without the card\'s digest is shown_required, with another card\'s digest confirmation_changed — zero spawns, the confirmation still pending', JSON.stringify({ noShown, badShown }));
  const ans = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_ok', decision: 'confirm', shown: okShown });
  const cl = confirms();
  ok(ans.ok && ans.decision === 'confirm' && cl.length === 1 && cl[0].verb === 'confirm' && cl[0].id === 'c_ok' && cl[0].session === 'vs-' + KEY_A && cl[0].ns === B.sessionNameFor(p.id), 'the answer runs the CLI\'s own `confirm <id>` under the lease\'s session in the profile\'s namespace');
  ok(keeper.pendingFor(KEY_A, p.id).length === 0 && confEvents.length === 2 && confEvents[1].kind === 'resolved' && confEvents[1].decision === 'confirm', '…and the registry forgets it, emitting resolved');
  const gone = await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c_gone', decision: 'deny' });
  ok(!gone.ok && gone.code === 'no_confirmation' && confirms().length === 1, 'r6 A-F8: an id NOT pending for this browser is the typed no_confirmation BEFORE any spawn (nothing sent upstream)', JSON.stringify(gone));
  ok((await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: 'c 1', decision: 'confirm' })).code === 'bad-request' && confirms().length === 1, 'a malformed id never reaches a spawn');
  // r6 A-F8: FIRST WRITE WINS on the keeper — probe2's shape: the real pending upload, then a record under its id that says `click`
  confEvents.length = 0;
  const upl = T.confirmationFromUpstream({ type: 'result', id: 'cmd1', action: 'upload', data: { confirmation_required: true, confirmation_id: 'c_9f3a1b2c', category: 'upload' }, timestamp: clock }, clock, { command: { type: 'command', id: 'cmd1', action: 'upload', params: { selector: '#file', files: ['/home/u/secret.pdf'] } } });
  keeper.notePending({ browserKey: KEY_A, profileId: p.id, sessionId: 'sess-1', confirmation: upl });
  const fv = keeper.notePending({ browserKey: KEY_A, profileId: p.id, sessionId: 'sess-1', confirmation: { ...upl, action: 'click', target: null } });
  const pend = keeper.pendingFor(KEY_A, p.id);
  ok(fv.conflict === true && fv.action === 'upload' && pend.length === 1 && pend[0].action === 'upload' && pend[0].target === '#file · /home/u/secret.pdf' && confEvents.map((e) => e.kind).join() === 'pending,conflict' && confEvents[1].attempted.action === 'click', 'r6 A-F8: a second record under a held id with other content changes NOTHING (the upload\'s card stays, target and all) — the conflict is emitted, never a second `pending`', JSON.stringify({ fv, pend, ev: confEvents.map((e) => e.kind) }));
  const forgedShown = T.confirmationDigest({ ...upl, action: 'click', target: null });
  ok((await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: upl.id, decision: 'confirm', shown: forgedShown })).code === 'confirmation_changed' && confirms().length === 1, 'r6 A-F8: a Confirm pressed on a card that showed "click" never confirms the upload (confirmation_changed, zero spawns)');
  ok((await keeper.answerConfirmation({ browserKey: KEY_B, profileId: null, id: upl.id, decision: 'confirm', shown: pend[0].digest, envPairs: ['AGENT_BROWSER_SESSION=vs-x'] })).code === 'no_confirmation' && confirms().length === 1, 'r6 A-F8: the same id answered from ANOTHER conversation\'s browser is no_confirmation (pending for THIS browser key only) — zero spawns');
  ok((await keeper.answerConfirmation({ browserKey: KEY_A, profileId: p.id, id: upl.id, decision: 'deny' })).ok && confirms().at(-1).verb === 'deny' && confirms().at(-1).id === upl.id && keeper.pendingFor(KEY_A, p.id).length === 0, 'r6 A-F8: a Deny of the pending upload runs upstream\'s own deny (a Deny needs no digest — it runs nothing)');
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
  ok(!r5.delivered && r5.stashed && stashed.length === 1 && stashed[0].cid === 'conv-1' && /Current URL/.test(stashed[0].env.text) && !r5.noticed && notices.length === 3 && /spend budget/.test(r5.why), 'a REFUSED delivery loses nothing: stashed on the ladder\'s own stash (the words ride the next prompt), the reason journalled — and NO second carrier (the owner\'s ruling, 2026-09-27: one handback per cycle; the notice rode the same prompt and the agent read it twice)');
  {
    const noStash = H.create({ keeper, deliver: { deliverToConversation: deliver.deliverToConversation }, serverSetting: (k) => settings2[k], activeSessions: active, sessionKeyFor: (s, id) => 'key:' + id, notice: (id, s, n) => notices.push({ id, n }), log: { log() { }, warn() { } } });
    const r5b = await noStash.announce(ev('explicit'));
    ok(!r5b.delivered && !r5b.stashed && r5b.noticed && notices.length === 4, '…a refused delivery the stash cannot take (no stash on this ladder) is carried by the zero-spend notice instead — never lost');
  }
  refuse = false;
  const r6 = await ann.announce(ev('explicit', { sessionId: 'sess-noid', browserKey: KEY_B }));
  ok(!r6.delivered && r6.noticed && /no id yet/.test(r6.why) && delivered.length === 4, 'a conversation with no id yet gets the notice (nothing to deliver into), never a throw — the ladder saw r1, r4, the REFUSED r5 and r5b, nothing more');
  ok(!(await ann.announce(ev('explicit', { sessionId: 'sess-gone', browserKey: 'bk-deadbeef' }))).delivered, 'no live session ⇒ nothing delivered');
  // lane channel-withdraw verify r6: a PENDING FORK carries its parent's conversation id — a handback delivered by that id
  // would open a billed turn on the PARENT; it gets the notice (its next message), like a conversation with no id yet
  {
    active.set('sess-fork', { _browserKey: 'bk-f0f0f0f0', claudeSessionId: 'conv-1', backendSessionId: 'conv-1', name: 'one (fork)', _forkRequested: true, _forkSourceId: 'conv-1' });
    const nBefore = delivered.length, notBefore = notices.length;
    const rf = await ann.announce(ev('explicit', { sessionId: 'sess-fork', browserKey: 'bk-f0f0f0f0' }));
    ok(!rf.delivered && rf.noticed && /no id yet/.test(rf.why) && delivered.length === nBefore && notices.length === notBefore + 1 && notices.at(-1).id === 'sess-fork', 'a pending fork\'s handback is never delivered by its PARENT\'s conversation id — the zero-spend notice rides the fork\'s own next message');
    const { mutantCopies: mcF, copiesCensus: ccF } = await import('./mutant-copy.mjs');
    const MF = mcF('takeover-fork-r6', REPO);
    const hsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
    const CID = '  const conversationIdOf = (s) => addressableId(s);';
    ok(hsrc.split(CID).length === 2, 'the announcer reads the session\'s conversation id through addressableId, once');
    const Hc = MF.load('src/server/browser-handback.js', hsrc.replace(CID, "  const conversationIdOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;"), 'handback-rawcid');
    const deliveredC = [];
    const annC = Hc.create({ keeper, deliver: { deliverToConversation: async (cid, text, opts) => { deliveredC.push({ cid, opts }); return { ok: true }; }, stashFor: () => ({ stored: true }) }, serverSetting: (k) => settings2[k], activeSessions: active, sessionKeyFor: (s, id) => 'key:' + id, notice: () => {}, log: { log() { }, warn() { } } });
    const rfc = await annC.announce(ev('explicit', { sessionId: 'sess-fork', browserKey: 'bk-f0f0f0f0' }));
    ok(rfc.delivered && deliveredC.length === 1 && deliveredC[0].cid === 'conv-1' && deliveredC[0].opts.spendReason === 'browser-handback', 'CONTROL: the raw-id copy delivers the fork\'s handback into the PARENT\'s conversation (a billed turn on the wrong session) — the leg would go red');
    for (const r of ccF(MF.files, MF.dir, REPO, { minCopies: 1, label: 'r6 fork handback ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
    active.delete('sess-fork');
  }
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
  // r6 A-F8 on the WIRED path: the command record pairs with its result (the card names the FILE), an error-string echo is
  // nothing, a structured forge under the held id changes nothing (said as `confirmation-conflict`, never a resolve), and a
  // Confirm pressed on another card's content runs nothing — the card's own digest runs upstream's confirm
  up.send({ type: 'command', id: 'cmdU', action: 'upload', params: { selector: '#file', files: ['/home/u/secret.pdf'] } });
  up.send({ type: 'result', id: 'cmdU', action: 'upload', success: true, data: { confirmation_required: true, confirmation_id: 'c_up1', category: 'upload' }, timestamp: clock });
  await b.until((v) => v.by('confirmation').some((m) => m.id === 'c_up1'));
  const cardU = b.by('confirmation').find((m) => m.id === 'c_up1');
  ok(cardU && cardU.target === '#file · /home/u/secret.pdf' && cardU.digest === T.confirmationDigest(cardU) && c.by('confirmation').some((m) => m.id === 'c_up1' && m.target === cardU.target), 'r6 A-F8 bridge: the confirmation record every viewer gets names the TARGET off the paired command (the file) and carries its digest', JSON.stringify(cardU));
  up.send({ type: 'result', id: 'cmdX', action: 'click', success: false, error: 'Element not found: text=requires confirmation c_up1' });
  up.send({ type: 'result', id: 'cmdY', action: 'click', success: true, data: { confirmation_required: true, confirmation_id: 'c_up1' } });
  await b.until((v) => v.by('confirmation-conflict').length >= 1);
  await sleep(60);
  ok(b.by('confirmation').filter((m) => m.id === 'c_up1').length === 1 && keeper.pendingFor(KEY_A, p.id).find((x) => x.id === 'c_up1').action === 'upload' && b.last('confirmation-conflict').id === 'c_up1' && b.last('confirmation-conflict').attempted.action === 'click' && !b.by('confirmation-resolved').some((m) => m.id === 'c_up1'), 'r6 A-F8 bridge: the error-string echo is nothing; the structured forge under the held id repaints NO card (one confirmation record, the keeper still says upload) — viewers get `confirmation-conflict`, never a resolve', JSON.stringify(b.msgs.filter((m) => /confirmation/.test(m.type)).map((m) => m.type + ':' + m.id + ':' + (m.action || (m.attempted && m.attempted.action) || ''))));
  const nC = confirms().length;
  b.send({ type: 'confirm', id: 'c_up1', decision: 'confirm', shown: T.confirmationDigest({ ...cardU, action: 'click', target: null }) });
  await b.until((v) => v.by('confirmation-ack').some((m) => m.id === 'c_up1'));
  const ackBad = b.by('confirmation-ack').filter((m) => m.id === 'c_up1').at(-1);
  ok(ackBad && !ackBad.ok && ackBad.code === 'confirmation_changed' && confirms().length === nC, 'r6 A-F8 bridge: a Confirm carrying the digest of a card that said "click" is refused confirmation_changed — upstream never asked', JSON.stringify(ackBad));
  b.send({ type: 'confirm', id: 'c_up1', decision: 'confirm', shown: cardU.digest });
  await b.until((v) => v.by('confirmation-ack').some((m) => m.id === 'c_up1' && m.ok));
  ok(confirms().length === nC + 1 && confirms().at(-1).verb === 'confirm' && confirms().at(-1).id === 'c_up1' && keeper.pendingFor(KEY_A, p.id).length === 0, 'r6 A-F8 bridge: the Confirm carrying the digest of the card it was pressed on runs upstream\'s own `confirm c_up1`');
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
  const c0 = await post('/api/browser/confirm', { sessionId: 'sess-1', id: 'c_ok', decision: 'confirm' });
  const c0b = await post('/api/browser/confirm', { sessionId: 'sess-1', id: 'c_ok', decision: 'confirm', shown: '0000000000000000' });
  ok(c0.status === 400 && c0.json.code === 'shown_required' && c0b.status === 409 && c0b.json.code === 'confirmation_changed' && c0b.json.digest === keeper.pendingFor(KEY_A, p.id)[0].digest, 'r6 A-F8: POST /confirm without the card\'s digest is 400 shown_required; with another 409 confirmation_changed (+ the current digest) — nothing sent', JSON.stringify({ c0: c0.json, c0b: c0b.json }));
  const c1 = await post('/api/browser/confirm', { sessionId: 'sess-1', id: 'c_ok', decision: 'confirm', shown: keeper.pendingFor(KEY_A, p.id)[0].digest });
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
  ok(cli2.status === 0 && /browser_paused/.test(cli2.stdout) && /Take over/.test(cli2.stdout) && /INTERRUPTS/.test(cli2.stdout) && /browser_interrupted/.test(cli2.stdout) && /what to re-run/.test(cli2.stdout), '`watch` explains the takeover contract to the agent — a takeover INTERRUPTS (browser_interrupted), the handback names what to re-run');
  // ⑧ END TO END (the owner's ruling, 2026-09-27 — "告知agent发生了打断"): a verb RUNNING when the user takes over ends
  // with [browser_interrupted], exit 1 — on the server's clock (the /resolve instant rides the audit)
  const cliW = runCli(['wait', '1500']);
  await until(() => keeper.statusFor(KEY_A) && true, 100); await sleep(700);
  keeper.takeover({ browserKey: KEY_A, profileId: p.id, viewerId: 43, sessionId: 'sess-1' });
  const w = await cliW;
  ok(w.status === 1 && /The user took over your window of this browser — your operation was interrupted\. Wait for the handback, then run it again\. \[browser_interrupted\]/.test(w.stderr) && /taken over at:/.test(w.stderr) && /the user still drives/.test(w.stderr) && /not shared instance-wide/.test(w.stderr) && /"waited":1500/.test(w.stdout), '⑧ E2E: `vibespace-browser wait 1500` running when the user takes over prints THE sentence [browser_interrupted], when, that they still drive, that nothing stood between it and the page (it ran to its end) — and exits 1 like any refusal', JSON.stringify({ st: w.status, se: w.stderr.slice(0, 700), so: w.stdout.slice(0, 200) }));
  keeper.handback({ browserKey: KEY_A, profileId: p.id, cause: 'explicit' });
  clock += 1000; // (the keeper's injected clock: this command resolves AFTER that takeover)
  const w2 = await runCli(['wait', '10']);
  ok(w2.status === 0 && !/browser_interrupted/.test(w2.stderr), '⑧ …a verb nobody interrupted exits 0 and says nothing of it (a takeover BEFORE its /resolve is not an interruption of it)', w2.stderr.slice(0, 300));
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
  // ── lane takeover-keyboard (userW inc-mum339id-1zsb, 2026-09-28): the chat beside the live view, Take over, three presses on
  // the chat composer — the typing went to the PAGE. The user's OWN press on a text box YIELDS the keys; a script's focus
  // (lane J r2's password case) is reclaimed exactly as before. ──
  const FV_ROWS = [
    [{ owns: true, editable: true, insideView: false, byUserPress: true }, 'yield', 'the user pressed the composer (userW)'],
    [{ owns: true, editable: true, insideView: false, byUserPress: false }, 'reclaim', 'a script focused the composer while a password is typed (lane J r2)'],
    [{ owns: true, editable: true, insideView: false }, 'reclaim', 'no press fact at all (fails closed)'],
    [{ owns: true, editable: true, insideView: true, byUserPress: true }, 'allow', 'the view\'s own sink'],
    [{ owns: true, editable: false, insideView: false, byUserPress: true }, 'allow', 'a button / a non-editable'],
    [{ owns: false, editable: true, insideView: false, byUserPress: true }, 'allow', 'not owning (watch / yielded / another viewer)'],
    [{ owns: false, editable: true, insideView: false, byUserPress: false }, 'allow', 'not owning, no press'],
    // verify r2 (H1): the takeover MINE while the view does not drive (minimized / another desktop / reconnecting)
    [{ owns: false, mine: true, editable: true, insideView: false, byUserPress: true }, 'yield', 'mine but not driving: the user pressed the composer (H1)'],
    [{ owns: false, mine: true, editable: true, insideView: false, byUserPress: false }, 'allow', 'mine but not driving: a script\'s focus (the return moves the caret)'],
    [{ owns: false, mine: true, editable: false, insideView: false, byUserPress: true }, 'allow', 'mine but not driving: a button'],
    [{ owns: true, mine: true, editable: true, insideView: false, byUserPress: false }, 'reclaim', 'driving and mine: a script\'s focus is still reclaimed'],
  ];
  const fvBad = (TT) => FV_ROWS.filter(([o, want]) => TT.focusVerdict(o) !== want).map((r) => r[2]);
  ok(fvBad(T).length === 0, `focusVerdict + byUserPress: the user's press ⇒ 'yield', a script's focus ⇒ 'reclaim' (the password guard), the sink / a button / not owning ⇒ 'allow' (${FV_ROWS.length} rows)`, fvBad(T).join(' | '));
  const UP_ROWS = [
    [{ press: { at: 1000, trusted: true }, sameInput: true, focusAt: 1000 }, true, 'pressed', 'the mousedown\'s own focus (same task)'],
    [{ press: { at: 1000, trusted: true }, sameInput: true, focusAt: 1000 + T.USER_PRESS_MS }, true, 'pressed', 'at the window\'s edge'],
    [{ press: { at: 1000, trusted: true }, sameInput: true, focusAt: 1001 + T.USER_PRESS_MS }, false, 'stale press', 'one ms past the window'],
    [{ press: { at: 1000, trusted: true }, sameInput: true, focusAt: 999 }, false, 'stale press', 'a focus BEFORE the press'],
    [{ press: { at: NaN, trusted: true }, sameInput: true, focusAt: 5 }, false, 'stale press', 'an unreadable press time'],
    [{ press: { at: 1000, trusted: false }, sameInput: true, focusAt: 1001 }, false, 'synthetic press', 'a script-dispatched pointerdown'],
    [{ press: { at: 1000 }, sameInput: true, focusAt: 1001 }, false, 'synthetic press', 'trust not proven'],
    [{ press: { at: 1000, trusted: true }, sameInput: false, focusAt: 1001 }, false, 'pressed elsewhere', 'a press on the picture / a taskbar button, then a script focus'],
    [{ press: null, sameInput: true, focusAt: 1001 }, false, 'no press', 'a script\'s .focus()'],
    [{}, false, 'no press', 'nothing given'],
  ];
  const upBad = (TT) => UP_ROWS.filter(([o, by, why]) => { const r = TT.userPressFocus(o); return r.byUserPress !== by || r.why !== why; }).map((r) => r[3]);
  ok(T.USER_PRESS_MS === 250 && upBad(T).length === 0, `userPressFocus: ONLY the user's own trusted press on THAT text box within ${T.USER_PRESS_MS} ms is a press — a script's focus, a synthetic press, a press elsewhere, a stale press are not, each named (${UP_ROWS.length} rows)`, upBad(T).join(' | '));
  ok(!own({ mode: 'takeover', mine: true, yielded: true }) && T.keyboardOwnership({ mode: 'takeover', mine: true, yielded: true }).why === 'yielded' && own({ mode: 'takeover', mine: true, yielded: false })
    && T.keyboardOwnership({ mode: 'watch', mine: true, yielded: true }).why === 'watch' && T.keyboardOwnership({ mode: 'takeover', mine: true, connected: false, yielded: true }).why === 'disconnected',
    'keyboardOwnership: a YIELDED view owns no keys (why "yielded") — the takeover itself is untouched; the older refusals keep their names first');
  const YA_ROWS = [[false, 'yield', true], [true, 'yield', true], [true, 'press-view', false], [true, 'claim', false], [true, 'release', false], [false, 'press-view', false], [true, 'key', true], [false, 'key', false], [true, undefined, true], [true, 'homeless', false]];
  ok(YA_ROWS.every(([y, ev, w]) => T.yieldAfter(y, ev) === w) && T.YIELD_EVENTS.join() === 'yield,press-view,claim,release,homeless', 'yieldAfter: a yield holds until a press INSIDE the view, a fresh claim, the release or (verify r2) its home gone — any other event keeps it');
  // verify r2 (H1b'): a yield made while the view was off screen whose HOME is gone when the view drives again ends
  const YH_ROWS = [
    [{ yielded: true, drivesNow: true, drovePrev: false, homeVisible: false }, 'end', 'back on the view\'s desktop, the pressed chat box on the other one (measured: keys went nowhere, the chip said "in the chat box")'],
    [{ yielded: true, drivesNow: true, drovePrev: false, homeVisible: true }, 'keep', 'restored with the pressed chat box visible and focused (H1a) — the caret\'s home wins'],
    [{ yielded: true, drivesNow: true, drovePrev: true, homeVisible: false }, 'keep', 'driving all along, the caret left the box (a click on the message list) — never ended in place'],
    [{ yielded: true, drivesNow: false, drovePrev: true, homeVisible: false }, 'keep', 'going off screen'],
    [{ yielded: false, drivesNow: true, drovePrev: false, homeVisible: false }, 'keep', 'nothing yielded'],
    [{}, 'keep', 'nothing given'],
  ];
  const yhBad = (TT) => YH_ROWS.filter(([a, want]) => { let got; try { got = TT.yieldHomeVerdict(a); } catch { return true; } return got !== want; }).map((r) => r[2]);
  ok(yhBad(T).length === 0, `yieldHomeVerdict (verify r2): a yield ends when the view comes back to driving and its home is not a visible, focused text box (${YH_ROWS.length} rows)`, yhBad(T).join(' | '));
  {
    const MY = mutantCopies('browser-takeover-home', REPO);
    const TS5 = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const c = { tag: 'yh-always-keep', from: "  return homeVisible ? 'keep' : 'end';", to: "  return 'keep';" };
    const found = TS5.split(c.from).length === 2;
    const Tm = found ? MY.load('src/browser-takeover.js', TS5.replace(c.from, c.to), c.tag) : null;
    ok(found && JSON.stringify(yhBad(Tm)) === JSON.stringify([YH_ROWS[0][2]]), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly the homeless row`, JSON.stringify({ found, bad: Tm && yhBad(Tm) }));
    for (const r of copiesCensus(MY.files, MY.dir, REPO, { minCopies: 1, label: '⑦ yield home ' })) ok(r.pass, r.name, r.detail);
  }
  // verify r2 (H1): ONE ownership transition — measured on cd867c05: a view restored with the caret in the composer took
  // the next key for the page and said nothing until then
  const KT_ROWS = [
    [{ was: null, now: { owns: true } }, { changed: true, moveCaret: false, release: false }, 'the first judgement redraws'],
    [{ was: null, now: { owns: true }, caretOutside: true }, { changed: true, moveCaret: true, release: false }, 'the first judgement, owning, a caret outside'],
    [{ was: { owns: false }, now: { owns: true }, caretOutside: true }, { changed: true, moveCaret: true, release: false }, 'restored with a SCRIPT\'s caret in the composer (H1b): the caret moves'],
    [{ was: { owns: false }, now: { owns: true }, caretOutside: false }, { changed: true, moveCaret: false, release: false }, 'restored with the caret in the sink / on the body'],
    [{ was: { owns: false, yielded: false }, now: { owns: false, yielded: true }, caretOutside: true }, { changed: true, moveCaret: false, release: false }, 'restored while yielded (H1a): redrawn, the caret stays the user\'s'],
    [{ was: { owns: true }, now: { owns: false }, caretOutside: true }, { changed: true, moveCaret: false, release: true }, 'hidden: redrawn, the keys held in the page let go (H3)'],
    [{ was: { owns: true, yielded: false }, now: { owns: false, yielded: true } }, { changed: true, moveCaret: false, release: true }, 'a yield: the keys held in the page let go (r1 K4, now also here)'],
    [{ was: { owns: true }, now: { owns: true }, caretOutside: true }, { changed: false, moveCaret: false, release: false }, 'no transition: nothing (the belt\'s case, not this one)'],
    [{ was: { owns: false, yielded: true }, now: { owns: false, yielded: true } }, { changed: false, moveCaret: false, release: false }, 'no transition while yielded'],
    [{}, { changed: true, moveCaret: false, release: false }, 'nothing given'],
    // lane dialog-keys: a dialog the user opened takes the keys / gives them back — a transition like any other
    [{ was: { owns: true }, now: { owns: false, dialog: true }, caretOutside: false }, { changed: true, moveCaret: false, release: true }, 'a dialog he opened takes the keys: redrawn, the keys held in the page let go'],
    [{ was: { owns: false, yielded: true }, now: { owns: false, yielded: true, dialog: true } }, { changed: true, moveCaret: false, release: false }, 'a dialog opened from a yield: redrawn (the chip says the dialog)'],
    [{ was: { owns: false, dialog: true }, now: { owns: true, dialog: false }, caretOutside: false }, { changed: true, moveCaret: false, release: false }, 'the dialog closed: the keys are the page\'s again, redrawn'],
    [{ was: { owns: false, dialog: true }, now: { owns: false, dialog: true } }, { changed: false, moveCaret: false, release: false }, 'no transition while a dialog holds'],
  ];
  // verify r2 (Q1): a reclaim the user's OWN press elsewhere caused is SAID (rate-limited); a script's focus never is
  const RC_ROWS = [
    [{ why: 'pressed elsewhere', press: { at: 1000, trusted: true }, focusAt: 1010 }, true, 'the expand button focused the box (a press of his, elsewhere, fresh)'],
    [{ why: 'pressed elsewhere', press: { at: 1000, trusted: true }, focusAt: 1010, lastCueAt: 1010 - T.RECLAIM_CUE_MS + 1 }, false, 'said less than RECLAIM_CUE_MS ago'],
    [{ why: 'pressed elsewhere', press: { at: 1000, trusted: true }, focusAt: 1010, lastCueAt: 1010 - T.RECLAIM_CUE_MS }, true, 'said exactly RECLAIM_CUE_MS ago'],
    [{ why: 'pressed elsewhere', press: { at: 1000, trusted: true }, focusAt: 1001 + T.USER_PRESS_MS }, false, 'a stale press elsewhere (a message arriving later)'],
    [{ why: 'pressed elsewhere', press: { at: 1000, trusted: false }, focusAt: 1010 }, false, 'a synthetic press elsewhere'],
    [{ why: 'no press', press: null, focusAt: 1010 }, false, 'a script\'s focus — the password guard stays unsaid'],
    [{ why: 'synthetic press', press: { at: 1000, trusted: false }, focusAt: 1010 }, false, 'a synthetic press on the box'],
    [{}, false, 'nothing given'],
  ];
  const rcBad = (TT) => RC_ROWS.filter(([a, want]) => { let got; try { got = TT.reclaimCue(a); } catch { return true; } return got !== want; }).map((r) => r[2]);
  ok(T.RECLAIM_CUE_MS === 6000 && rcBad(T).length === 0, `reclaimCue (verify r2, Q1): a reclaim caused by the user's own fresh press on something else is said, at most every ${T.RECLAIM_CUE_MS} ms; a script's focus never (${RC_ROWS.length} rows)`, rcBad(T).join(' | '));
  {
    const MQ = mutantCopies('browser-takeover-cue', REPO);
    const TS4 = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const QCTL = [
      { tag: 'rc-no-limit', from: '  return !(lastCueAt != null && Number(focusAt) - Number(lastCueAt) < everyMs);', to: '  return true;', red: ['said less than RECLAIM_CUE_MS ago'] },
      { tag: 'rc-any-reclaim', from: "  if (why !== 'pressed elsewhere' || !press || press.trusted !== true) return false;", to: "  if (!press) return why === 'no press';", red: ['a synthetic press elsewhere', 'a script\'s focus — the password guard stays unsaid', 'a synthetic press on the box'] },
    ];
    for (const c of QCTL) {
      const found = TS4.split(c.from).length === 2;
      const Tm = found ? MQ.load('src/browser-takeover.js', TS4.replace(c.from, c.to), c.tag) : null;
      const bad = Tm ? rcBad(Tm) : null;
      ok(found && JSON.stringify(bad) === JSON.stringify(c.red), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly ${c.red.join(' · ')}`, JSON.stringify({ found, bad }));
    }
    for (const r of copiesCensus(MQ.files, MQ.dir, REPO, { minCopies: QCTL.length, label: '⑦ reclaim cue ' })) ok(r.pass, r.name, r.detail);
  }
  const ktBad = (TT) => KT_ROWS.filter(([a, want]) => { let got; try { got = TT.keyboardTransition(a); } catch { return true; } return !got || got.changed !== want.changed || got.moveCaret !== want.moveCaret || got.release !== want.release; }).map((r) => r[2]);
  ok(typeof T.keyboardTransition === 'function' && ktBad(T).length === 0, `keyboardTransition (verify r2, H1 / H3): every ownership change redraws at once; keys moving to the page while a caret sits outside the view move the caret; keys leaving the page let go of what is held there (${KT_ROWS.length} rows)`, ktBad(T).join(' | '));
  {
    const MT = mutantCopies('browser-takeover-transition', REPO);
    const TS3 = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const TCTL = [
      { tag: 'kt-no-move', from: 'moveCaret: n.owns && !w.owns && !!caretOutside,', to: 'moveCaret: false,', red: ['the first judgement, owning, a caret outside', 'restored with a SCRIPT\'s caret in the composer (H1b): the caret moves'] },
      { tag: 'kt-owns-only', from: '  const changed = !was || w.owns !== n.owns || w.yielded !== n.yielded || w.dialog !== n.dialog;', to: '  const changed = !was || w.owns !== n.owns;', red: ['restored while yielded (H1a): redrawn, the caret stays the user\'s', 'a dialog opened from a yield: redrawn (the chip says the dialog)'] },
      { tag: 'kt-no-dialog', from: ' || w.dialog !== n.dialog;', to: ';', red: ['a dialog opened from a yield: redrawn (the chip says the dialog)'] }, // lane dialog-keys
      { tag: 'kt-no-release', from: 'release: w.owns && !n.owns };', to: 'release: false };', red: ['hidden: redrawn, the keys held in the page let go (H3)', 'a yield: the keys held in the page let go (r1 K4, now also here)', 'a dialog he opened takes the keys: redrawn, the keys held in the page let go'] }, // verify r2 (H3); lane dialog-keys: a dialog taking the keys lets go too
    ];
    for (const c of TCTL) {
      const found = TS3.split(c.from).length === 2;
      const Tm = found ? MT.load('src/browser-takeover.js', TS3.replace(c.from, c.to), c.tag) : null;
      const bad = Tm ? ktBad(Tm) : null;
      ok(found && JSON.stringify(bad) === JSON.stringify(c.red), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly ${c.red.join(' · ')}`, JSON.stringify({ found, bad }));
    }
    for (const r of copiesCensus(MT.files, MT.dir, REPO, { minCopies: TCTL.length, label: '⑦ transitions ' })) ok(r.pass, r.name, r.detail);
  }
  // ── lane dialog-keys (the owner's "ok", 2026-09-30, on takeover-keyboard r4's proposal): A DIALOG YOUR OWN ACT OPENED TAKES
  // THE KEYS; one that opens by itself never does (before: verify r3 F4 — Delete → the confirm → Enter put a line break into the
  // PAGE, the file kept). The PURE tables + a patched copy per rule; the DOM-mini is test-takeover-keyboard, the real rung
  // test-browser-live-input ⑦. ──
  ok(T.keyboardOwnership({ mode: 'takeover', mine: true, dialog: true }).why === 'dialog' && !own({ mode: 'takeover', mine: true, dialog: true }) && T.keyboardOwnership({ mode: 'takeover', mine: true, dialog: true, yielded: true }).why === 'dialog'
    && T.keyboardOwnership({ mode: 'takeover', mine: true, connected: false, dialog: true }).why === 'disconnected' && own({ mode: 'takeover', mine: true, dialog: false }),
    'keyboardOwnership: while a dialog the user opened HOLDS the keys the view owns none (why "dialog", over a yield); the older refusals keep their names first');
  const DV_ROWS = [
    [{ owns: true, byUserPress: true }, 'take', 'THE RULE: his own fresh act opened it while the keys are the page\'s (Delete → the confirm)'],
    [{ owns: true, byUserPress: false }, 'reclaim', 'THE PASSWORD GUARD: it opened by itself while the keys are the page\'s'],
    [{ owns: true }, 'reclaim', 'no opener fact at all (fails closed)'],
    [{ owns: false, yielded: true, byUserPress: true }, 'take', 'yielded to the composer, his press opened it (the keys return to the composer)'],
    [{ owns: false, yielded: true, byUserPress: false }, 'allow', 'yielded, it opened by itself — the keys are not the page\'s'],
    [{ owns: false, held: true, byUserPress: true }, 'take', 'a dialog he opened holds the keys, his act there opens another (the newest holds)'],
    [{ owns: false, held: true, byUserPress: false }, 'allow', 'a dialog holds the keys, another opens by itself — not the page\'s keys'],
    [{ owns: true, held: true, byUserPress: false }, 'allow', 'a held dialog wins over an owns fact'],
    [{ owns: false, byUserPress: true }, 'take', 'his press, the view off screen (the dialog holds the keys when it comes back)'],
    [{ owns: false, byUserPress: false }, 'allow', 'off screen, by itself — not the view\'s to decide'],
    [{ owns: true, byUserPress: true, opener: 'page' }, 'allow', 'the agent\'s PAGE dialog on the view\'s own bar — never an app modal'],
    [{ owns: true, byUserPress: false, opener: 'page' }, 'allow', 'the page\'s dialog, by itself'],
    [{ owns: true, byUserPress: true, opener: 'nonsense' }, 'allow', 'an unknown opener is no app modal'],
    [{}, 'allow', 'nothing given'],
  ];
  const dvBad = (TT) => DV_ROWS.filter(([a, want]) => { let got; try { got = TT.dialogVerdict(a); } catch { return true; } return got !== want; }).map((r) => r[2]);
  ok(typeof T.dialogVerdict === 'function' && JSON.stringify(T.DIALOG_OPENERS) === '["app","page"]' && dvBad(T).length === 0, `dialogVerdict (lane dialog-keys): the user's own act ⇒ 'take'; a modal that opens by itself while the keys are the page's ⇒ 'reclaim' (the password guard); the page's own dialog never an app modal (${DV_ROWS.length} rows)`, dvBad(T).join(' | '));
  const DO_ROWS = [
    [{ press: { at: 1000, trusted: true }, openAt: 1000 }, true, 'pressed', 'opened in the press\'s own task'],
    [{ press: { at: 1000, trusted: true }, openAt: 1000 + T.USER_PRESS_MS }, true, 'pressed', 'at the window\'s edge'],
    [{ press: { at: 1000, trusted: true }, openAt: 1001 + T.USER_PRESS_MS }, false, 'stale press', 'one ms past the window (a slow fetch)'],
    [{ press: { at: 1000, trusted: true }, openAt: 999 }, false, 'stale press', 'opened BEFORE the press'],
    [{ press: { at: NaN, trusted: true }, openAt: 5 }, false, 'stale press', 'an unreadable press time'],
    [{ press: { at: 1000, trusted: false }, openAt: 1001 }, false, 'synthetic press', 'a script-dispatched pointerdown (isTrusted false)'],
    [{ press: { at: 1000 }, openAt: 1001 }, false, 'synthetic press', 'trust not proven'],
    [{ press: { at: 1000, trusted: true, picture: true }, openAt: 1050 }, false, 'pressed the page', 'a press on the picture went to the page'],
    [{ press: null, openAt: 1001 }, false, 'no press', 'nothing pressed (a broadcast, a timer)'],
    [{}, false, 'no press', 'nothing given'],
  ];
  const doBad = (TT) => DO_ROWS.filter(([a, by, why]) => { let got; try { got = TT.dialogOpener(a); } catch { return true; } return !got || got.byUserPress !== by || got.why !== why; }).map((r) => r[3]);
  ok(doBad(T).length === 0, `dialogOpener (lane dialog-keys): ONLY the user's own TRUSTED act on the app within ${T.USER_PRESS_MS} ms of the open — a synthetic press, a press on the picture (the page's), a stale one, none: not his, each named (${DO_ROWS.length} rows)`, doBad(T).join(' | '));
  const DR_ROWS = [
    [{ left: 0, base: { to: 'sink' } }, 'sink', 'the only dialog closed, the view owned the keys: the page'],
    [{ left: 0, base: { to: 'yield', valid: true } }, 'yield', 'opened from a yield: back to the composer'],
    [{ left: 0, base: { to: 'yield', valid: false } }, 'stay', 'the composer gone / hidden: move nothing (the yield\'s home rule answers)'],
    [{ left: 1, back: { valid: true }, base: { to: 'sink' } }, 'back', 'the newest closed: back to the older dialog\'s field'],
    [{ left: 1, back: { valid: false }, base: { to: 'sink' } }, 'older', 'the newest closed, the older\'s field went (re-rendered / in a removed dialog): the older dialog\'s OWN field, never <body> (verify r1)'],
    [{ left: 0, back: { valid: true }, base: { to: 'sink' } }, 'sink', 'the last one closed: the base, whatever its back'],
    [{ left: 0 }, 'stay', 'no base (released)'],
    [{}, 'stay', 'nothing given'],
  ];
  const drBad = (TT) => DR_ROWS.filter(([a, want]) => { let got; try { got = TT.dialogReturn(a); } catch { return true; } return got !== want; }).map((r) => r[2]);
  ok(drBad(T).length === 0, `dialogReturn (lane dialog-keys): a close gives the keys back where they were — the page, the composer, the older dialog — never an orphan (${DR_ROWS.length} rows)`, drBad(T).join(' | '));
  const DC_ROWS = [
    [{ verdict: 'reclaim', at: 10000 }, true, 'a dialog that opened by itself, first time'],
    [{ verdict: 'reclaim', at: 10000, lastCueAt: 10000 - T.RECLAIM_CUE_MS + 1 }, false, 'said less than RECLAIM_CUE_MS ago (one limiter with the Q1 cue)'],
    [{ verdict: 'reclaim', at: 10000, lastCueAt: 10000 - T.RECLAIM_CUE_MS }, true, 'said exactly RECLAIM_CUE_MS ago'],
    [{ verdict: 'take', at: 10000 }, false, 'a dialog he opened is never told typing still goes to the browser'],
    [{ verdict: 'allow', at: 10000 }, false, 'allowed — nothing to say'],
    [{}, false, 'nothing given'],
  ];
  const dcBad = (TT) => DC_ROWS.filter(([a, want]) => { let got; try { got = TT.dialogReclaimCue(a); } catch { return true; } return got !== want; }).map((r) => r[2]);
  ok(dcBad(T).length === 0, `dialogReclaimCue (lane dialog-keys): a modal that opened by itself and was taken back is said once per ${T.RECLAIM_CUE_MS} ms; a dialog he opened never (${DC_ROWS.length} rows)`, dcBad(T).join(' | '));
  {
    const MD = mutantCopies('browser-takeover-dialog', REPO);
    const TSD = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const DCTL = [
      { tag: 'dv-no-take', from: "  if (byUserPress) return 'take';\n", to: '', bad: dvBad, red: ['THE RULE: his own fresh act opened it while the keys are the page\'s (Delete → the confirm)', 'yielded to the composer, his press opened it (the keys return to the composer)', 'a dialog he opened holds the keys, his act there opens another (the newest holds)', 'his press, the view off screen (the dialog holds the keys when it comes back)'] },
      { tag: 'dv-script-takes', from: "  return owns && !yielded && !held ? 'reclaim' : 'allow';", to: "  return 'take';", bad: dvBad, red: ['THE PASSWORD GUARD: it opened by itself while the keys are the page\'s', 'no opener fact at all (fails closed)', 'yielded, it opened by itself — the keys are not the page\'s', 'a dialog holds the keys, another opens by itself — not the page\'s keys', 'a held dialog wins over an owns fact', 'off screen, by itself — not the view\'s to decide', 'nothing given'] },
      { tag: 'dv-page-taken', from: "  if (opener !== 'app') return 'allow';\n", to: '', bad: dvBad, red: ['the agent\'s PAGE dialog on the view\'s own bar — never an app modal', 'the page\'s dialog, by itself', 'an unknown opener is no app modal'] },
      { tag: 'do-no-trust', from: "    : p.trusted !== true ? 'synthetic press'      // the browser's own isTrusted, never a flag a script could set\n", to: '', bad: doBad, red: ['a script-dispatched pointerdown (isTrusted false)', 'trust not proven'] },
      { tag: 'do-no-picture', from: "      : p.picture ? 'pressed the page'\n", to: '', bad: doBad, red: ['a press on the picture went to the page'] },
      { tag: 'do-no-window', from: "        : !(Number.isFinite(since) && since >= 0 && since <= windowMs) ? 'stale press'\n", to: '', bad: doBad, red: ['one ms past the window (a slow fetch)', 'opened BEFORE the press', 'an unreadable press time'] },
      { tag: 'dr-no-back', from: "  if (Number(left) > 0) return back && back.valid ? 'back' : 'older';", to: "  if (Number(left) > 0) return 'stay';", bad: drBad, red: ['the newest closed: back to the older dialog\'s field', 'the newest closed, the older\'s field went (re-rendered / in a removed dialog): the older dialog\'s OWN field, never <body> (verify r1)'] },
      { tag: 'dr-yield-blind', from: "  return base.to === 'yield' && base.valid ? 'yield' : 'stay';", to: "  return base.to === 'yield' ? 'yield' : 'stay';", bad: drBad, red: ['the composer gone / hidden: move nothing (the yield\'s home rule answers)'] },
      { tag: 'dc-no-limit', from: '  return !(lastCueAt != null && Number(at) - Number(lastCueAt) < everyMs);', to: '  return true;', bad: dcBad, red: ['said less than RECLAIM_CUE_MS ago (one limiter with the Q1 cue)'] },
      { tag: 'dc-any-verdict', from: "  if (verdict !== 'reclaim') return false;\n", to: '', bad: dcBad, red: ['a dialog he opened is never told typing still goes to the browser', 'allowed — nothing to say', 'nothing given'] },
    ];
    for (const c of DCTL) {
      const found = TSD.split(c.from).length === 2;
      const Tm = found ? MD.load('src/browser-takeover.js', TSD.replace(c.from, c.to), c.tag) : null;
      const got = Tm ? c.bad(Tm) : null;
      ok(found && JSON.stringify(got) === JSON.stringify(c.red), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly ${c.red.join(' · ')}`, JSON.stringify({ found, got }));
    }
    for (const r of copiesCensus(MD.files, MD.dir, REPO, { minCopies: DCTL.length, label: '⑦ dialog-keys ' })) ok(r.pass, r.name, r.detail);
  }
  // the client registry: keyboardYielded + the change signal
  {
    let oY = true, yY = false; const seen = [];
    const off = KO.onKeyboardChange(() => seen.push(KO.keyboardYielded()));
    const offBad = KO.onKeyboardChange(() => { throw new Error('a broken subscriber'); });
    KO.claimKeyboard({ id: 'Y', owns: () => oY, yielded: () => yY });
    KO.keyboardChanged();                       // the view owns ⇒ not yielded
    oY = false; yY = true; KO.keyboardChanged(); // the user pressed the composer ⇒ yielded (nobody owns)
    KO.claimKeyboard({ id: 'Z', owns: () => true }); KO.keyboardChanged(); // another view owns ⇒ nobody reads it as yielded
    KO.releaseKeyboard('Z'); off(); offBad(); KO.keyboardChanged();       // unsubscribed ⇒ no further call
    const stillYielded = KO.keyboardYielded();
    KO.releaseKeyboard('Y');
    ok(seen.join() === 'false,true,false' && stillYielded === true && KO.keyboardYielded() === false && KO.keyboardOwned() === false,
      'keyboard-owner.js: keyboardYielded() = nobody owns AND a driving view yielded; onKeyboardChange / keyboardChanged re-read (a throwing subscriber never stops the rest; an unsubscribed one is never called)', JSON.stringify({ seen, stillYielded }));
  }
  // PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): each rule removed turns ITS row red
  {
    const MK = mutantCopies('browser-takeover-tkbd', REPO);
    const TS = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const CTL = [
      { tag: 'prefix-no-yield', from: "  return byUserPress ? 'yield' : 'reclaim';", to: "  return 'reclaim';", fv: ['the user pressed the composer (userW)'], up: [] },
      { tag: 'guard-gone', from: "  return byUserPress ? 'yield' : 'reclaim';", to: "  return 'yield';", fv: ['a script focused the composer while a password is typed (lane J r2)', 'no press fact at all (fails closed)', 'driving and mine: a script\'s focus is still reclaimed'], up: [] },
      { tag: 'no-window', from: "  if (!(Number.isFinite(age) && age >= 0 && age <= windowMs)) return { byUserPress: false, why: 'stale press' };\n", to: '', fv: [], up: ['one ms past the window', 'a focus BEFORE the press', 'an unreadable press time'] },
      { tag: 'no-trust', from: "  if (press.trusted !== true) return { byUserPress: false, why: 'synthetic press' };\n", to: '', fv: [], up: ['a script-dispatched pointerdown', 'trust not proven'] },
      { tag: 'no-same-input', from: "  if (!sameInput) return { byUserPress: false, why: 'pressed elsewhere' };\n", to: '', fv: [], up: ['a press on the picture / a taskbar button, then a script focus'] },
      { tag: 'h1-prefix', from: "  if (!owns) return byUserPress && mine ? 'yield' : 'allow';", to: "  if (!owns) return 'allow';", fv: ['mine but not driving: the user pressed the composer (H1)'], up: [] }, // verify r2 (H1)
    ];
    for (const c of CTL) {
      const found = TS.split(c.from).length === 2;
      const Tm = found ? MK.load('src/browser-takeover.js', TS.replace(c.from, c.to), c.tag) : null;
      const fb = Tm ? fvBad(Tm) : null, ub = Tm ? upBad(Tm) : null;
      ok(found && JSON.stringify(fb) === JSON.stringify(c.fv) && JSON.stringify(ub) === JSON.stringify(c.up), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly its rows — ${[...c.fv, ...c.up].join(' · ')}`, JSON.stringify({ found, fb, ub }));
    }
    for (const r of copiesCensus(MK.files, MK.dir, REPO, { minCopies: CTL.length, label: '⑦ takeover-keyboard ' })) ok(r.pass, r.name, r.detail);
  }
  // verify r1 (K4): a yield RELEASES in the page what is still held there — measured in chrome on cf24cf01: Shift held across
  // a press on the composer, the page logged the Shift keydown and never its keyup (a held "x" the same)
  {
    const HR_ROWS = [
      [[], [], 'nothing held — nothing sent'],
      [[{ key: 'Shift', code: 'ShiftLeft', keyCode: 16 }], [['Shift', 'ShiftLeft', 16, 0]], 'Shift held across the press (the chrome finding)'],
      [[{ key: 'Shift', code: 'ShiftLeft', keyCode: 16 }, { key: 'X', code: 'KeyX', keyCode: 88 }], [['X', 'KeyX', 88, 8], ['Shift', 'ShiftLeft', 16, 0]], 'Shift+X held: the X first, still carrying Shift, then Shift'],
      [[{ key: 'Control', code: 'ControlLeft', keyCode: 17 }, { key: 'Alt', code: 'AltLeft', keyCode: 18 }, { key: 'k', code: 'KeyK', keyCode: 75 }], [['k', 'KeyK', 75, 3], ['Alt', 'AltLeft', 18, 2], ['Control', 'ControlLeft', 17, 0]], 'Ctrl+Alt+k: the last pressed first, each with what is still held'],
      [[{ key: 'x', code: 'KeyX', keyCode: 88 }], [['x', 'KeyX', 88, 0]], 'a held letter (the page would keep it down)'],
      [[null, { key: '' }, { code: 'KeyQ' }, { key: 'Meta', code: 'MetaLeft' }], [['Meta', 'MetaLeft', 0, 0]], 'unreadable rows are skipped, a missing keyCode is 0'],
    ];
    const hrBad = (TT) => HR_ROWS.filter(([held, want]) => { let got; try { got = TT.heldReleases(held).map((r) => [r.key, r.code, r.keyCode, r.modifiers, r.kind]); } catch { return true; } return JSON.stringify(got) !== JSON.stringify(want.map((w) => [...w, 'up'])); }).map((r) => r[2]);
    ok(hrBad(T).length === 0 && JSON.stringify(T.heldReleases(undefined)) === '[]', `heldReleases: a yield releases in the page every key still held there, the last pressed first, each carrying the modifiers still held (${HR_ROWS.length} rows)`, hrBad(T).join(' | '));
    const MH = mutantCopies('browser-takeover-held', REPO);
    const TS2 = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
    const HCTL = [
      { tag: 'held-dropped', from: "  for (let i = list.length - 1; i >= 0; i--) {", to: "  for (let i = list.length - 1; i >= list.length; i--) {", red: HR_ROWS.filter(([h, w]) => w.length).map((r) => r[2]) },
      { tag: 'held-no-mods', from: "    for (let j = 0; j < i; j++) modifiers |= MODIFIER_KEY_BITS[list[j].key] || 0;\n", to: '', red: ['Shift+X held: the X first, still carrying Shift, then Shift', 'Ctrl+Alt+k: the last pressed first, each with what is still held'] },
    ];
    for (const c of HCTL) {
      const found = TS2.split(c.from).length === 2;
      const Tm = found ? MH.load('src/browser-takeover.js', TS2.replace(c.from, c.to), c.tag) : null;
      const bad = Tm ? hrBad(Tm) : null;
      ok(found && JSON.stringify(bad) === JSON.stringify(c.red), `NEGATIVE CONTROL (${c.tag}): the patched copy fails exactly ${c.red.length} row(s)`, JSON.stringify({ found, bad }));
    }
    for (const r of copiesCensus(MH.files, MH.dir, REPO, { minCopies: HCTL.length, label: '⑦ held releases ' })) ok(r.pass, r.name, r.detail);
  }
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
  // lane live-input: the browser REFUSES a key event's text of 4+ UTF-16 units (measured, Chromium 151) — the records are
  // ≤ 3 units each (the full table + the real-binary legs: scripts/test-live-input.mjs, scripts/test-browser-live-input.mjs)
  const tr = S.textRecords('tomsmith');
  ok(tr.ok && tr.records.length === 3 && tr.records.every((r) => r.type === 'input_keyboard' && r.eventType === 'char' && r.text.length <= S.CHAR_TEXT_MAX_UNITS) && tr.records.map((r) => r.text).join('') === 'tomsmith', 'textRecords: a paste / composition becomes the stream server\'s `char` records of at most 3 UTF-16 units (Chrome refuses a longer key text)');
  const emoji = '😀'.repeat(7);
  const er = S.textRecords(emoji);
  ok(er.ok && er.records.length === 7 && er.records.every((r) => !/[\uD800-\uDBFF]$/.test(r.text)) && er.records.map((r) => r.text).join('') === emoji, 'textRecords chunks on CODE POINTS (never splitting a surrogate pair)');
  ok(S.textRecords('a\r\nb').records.map((r) => r.text).join('') === 'a\nb' && S.textRecords('').code === 'empty' && S.textRecords('x'.repeat(S.TEXT_MAX + 1)).code === 'too_long', '…normalizes CRLF, refuses empty, and refuses (never trims) a paste past TEXT_MAX');
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
    // lane S1 verify r3: the ws case is ONE lookup into the ask's transition table (helper-asks.answerFrame), which alone calls THE one
    // permission answer — and strips a CLIENT frame's denyMessage (only the server-side sweep passes `serverDeny`)
    ok(/require\('\.\/server\/helper-asks'\)\.answerFrame\(data, \{ activeSessions, adapterRegistry, feedLive \}\)/.test(caseBody) && !/formatPermissionResponse|answerPermission\(/.test(caseBody) && !/denyMessage/.test(caseBody.replace(/^\s*\/\/.*$/gm, ''))
      // verify r6 F6: a client frame now passes through answerFromRecord (the server's own record decides the input) — still
      // with its denyMessage stripped; only the server-side sweep (`serverDeny`) keeps the frame it built
      && /const shaped = serverDeny \? \{ ok: true, data: \{ \.\.\.data \} \} : answerFromRecord\(recordOf\(target\.session, data\.requestId\), \{ \.\.\.data, denyMessage: undefined \}\);/.test(src('src/server/helper-asks.js'))
      && /answerPermission\(target\.session, shaped\.data, \{ adapterRegistry, feedLive \}\)/.test(src('src/server/helper-asks.js')),
      'the ws permission-response case answers through THE one permission answer (src/server/permission-answer.js, behind the ask table\'s lookup), and a CLIENT cannot name the deny\'s words (denyMessage is the server\'s: no client paints a card stale)');
    const rUser = JSON.parse(reg.get('claude').formatPermissionResponse({ requestId: 'r1', approved: false, denyMessage: undefined }));
    ok(rUser.response.response.message === 'User denied this action' && T.staleFromDenyMessage(rUser.response.response.message) === null, '…so a user\'s own Deny is the CLI\'s familiar sentence, never read back as stale');
    const callers = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (!['lib', 'agentd'].includes(e.name)) walk(rel); } else if (rel.endsWith('.js') && /formatPermissionResponse\s*\(/.test(fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''))) callers.push(rel); } };
    walk('src');
    const allowed0 = ['src/server/permission-answer.js', 'src/adapters/base.js', 'src/adapters/claude-code.js', 'src/adapters/codex.js', 'src/adapters/acp.js', 'src/adapters/shell.js'];
    ok(callers.includes('src/server/permission-answer.js') && callers.every((f) => allowed0.includes(f)), `census: formatPermissionResponse is called ONLY by the one answer (+ the adapters that define it): ${callers.join(', ')}`);
    // lane S1 verify r3: the seam's deny is a LOOKUP into the ask's transition table (helper-asks.answerFrame, serverDeny keeps
    // the sweep's browser_paused words) — the one answer is still the only writer (the census above)
    ok(/approvals: \(\(\) => \{[\s\S]{0,900}HA\.answerFrame\(\{ \.\.\.data, sessionId \}, \{ activeSessions, adapterRegistry, feedLive: N\.feedLive \}, \{ serverDeny: true \}\)/.test(src('src/server/mounts-plugins-wiring.js')) && /activeSessions, adapterRegistry,\n\}\);/.test(src('server.js')),
      'WIRING PIN: the announcer is handed the approvals seam over the one answer (through the ask table\'s lookup, verify r3), and server.js hands the wiring the adapter registry');
  }
}

// ═══ ⑧ THE OWNER'S RULING (2026-09-27): a takeover interrupts, tells, and the handback reminds ═══
console.log('— ⑧ the owner\'s ruling: in flight = PURE(trace, instant); one cycle per takeover → handback; one card + one notice at the takeover (free), one re-run reminder at the handback');
{
  const I = require('../src/browser-interrupt.js');
  // PURE: in flight at the instant
  const log = [];
  for (const r of [
    { kind: 'command', id: 'L1', action: 'launch', at: 100 }, { kind: 'result', id: 'L1', action: 'launch', at: 105 },
    { kind: 'command', id: 'c1', action: 'fill', at: 110 },
    { kind: 'command', id: 'c2', action: 'navigate', at: 120 }, { kind: 'result', id: 'c2', action: 'navigate', at: 150 },
    { kind: 'command', id: 'c3', action: 'evaluate', at: 160 },
    { kind: 'command', id: 'bx', action: 'boundingbox', at: 170 },
    { kind: 'result', id: 'c3', action: 'evaluate', at: 205 },
    { kind: 'command', id: 'c4', action: 'click', at: 230 },
  ]) I.noteRecord(log, r);
  const at200 = I.inFlightAt(log, 200);
  ok(at200.map((x) => x.verb).join() === 'fill,eval' && at200.map((x) => x.id).join() === 'c1,c3', '⑧ PURE inFlightAt(ring, 200): fill (no result yet) and eval (its result lands AFTER the instant — the interrupted call\'s own error) were in flight; the finished navigation, the launch pair, the recorder\'s boundingbox probe and a click issued after the instant were not', JSON.stringify(at200));
  ok(I.inFlightAt(log, 210).map((x) => x.verb).join() === 'fill' && I.inFlightAt(log, 99).length === 0 && I.inFlightAt(log, 231).map((x) => x.verb).join() === 'fill,click', '⑧ …the same ring at other instants answers by the instant alone (a PURE function of the trace + the instant)');
  ok(log.length === 6 && !log.some((r) => r.action === 'launch' || r.action === 'boundingbox') && I.verbOfAction('navigate') === 'open' && I.verbOfAction('evaluate') === 'eval' && I.verbOfAction('fill') === 'fill', '⑧ the ring keeps no `launch` pair and no probe; the daemon\'s action names read as the verbs the agent typed (navigate → open, evaluate → eval)', JSON.stringify(log));
  const big = []; for (let i = 0; i < 200; i++) I.noteRecord(big, { kind: 'command', id: 'x' + i, action: 'click', at: i });
  ok(big.length === 64 && big[0].id === 'x136', '⑧ the ring is bounded (64, oldest out)');
  // the cycle
  const o1 = I.openInterruption(null, { takenAt: 200, inFlight: at200, aborted: [{ method: 'Runtime.evaluate', sessionId: 'S' }] });
  ok(o1.fresh && o1.cycle.takeovers === 1 && I.operationsOf(o1.cycle).n === 2 && I.operationsOf(o1.cycle).verbs.join() === 'fill,eval', '⑧ a takeover OPENS a cycle: the trace\'s operations are what was interrupted (the aborted CDP methods are the same operations, not counted again)');
  const o2 = I.openInterruption(o1.cycle, { takenAt: 400, inFlight: [{ id: 'c1', verb: 'fill', at: 110 }, { id: 'c9', verb: 'hover', at: 390 }], aborted: [] });
  ok(!o2.fresh && o2.cycle.takeovers === 2 && I.operationsOf(o2.cycle).n === 3 && I.operationsOf(o2.cycle).verbs.join() === 'fill,eval,hover' && o2.cycle.openedAt === 200, '⑧ a SECOND takeover before the handback MERGES: not fresh (no second card), the same operation (c1) never counted twice');
  const r1 = I.noteRefused(I.noteRefused(o2.cycle, { verb: 'click', at: 410 }), { verb: 'fill', at: 420 });
  ok(I.interruptedVerbs(r1).join() === 'fill,eval,hover,click', '⑧ the re-run list: what was interrupted, then what the agent tried meanwhile — each verb once, in order');
  const closed = I.closeInterruption(r1, { at: 500 });
  ok(closed.closedAt === 500 && I.noteRefused(closed, { verb: 'scroll' }) === closed && I.openInterruption(closed, { takenAt: 600 }).fresh === true, '⑧ the handback CLOSES it: a closed cycle takes no refusal, the next takeover opens a NEW one');
  const next = I.openInterruption(closed, { takenAt: 600, inFlight: I.inFlightAt(log, 600) }).cycle;
  ok(I.operationsOf(next).verbs.join() === 'click' && I.openInterruption(I.closeInterruption(next, { at: 700 }), { takenAt: 800, inFlight: I.inFlightAt(log, 800) }).cycle.inFlight.length === 0, '⑧ a command whose result the trace never got (fill) is told ONCE: the next cycle counts only what it had not counted (click), the one after nothing');
  ok(I.inFlightAt(log, 110 + I.IN_FLIGHT_MAX_MS).map((x) => x.verb).join() === 'fill,click' && I.inFlightAt(log, 111 + I.IN_FLIGHT_MAX_MS).map((x) => x.verb).join() === 'click', `⑧ a command "in flight" longer than ${I.IN_FLIGHT_MAX_MS / 60000} min at the instant is a lost result, never an interruption`);
  const onlyCdp = I.openInterruption(null, { takenAt: 1, aborted: [{ method: 'Runtime.evaluate' }, { method: 'Runtime.evaluate' }, { method: 'Input.insertText' }] }).cycle;
  ok(I.operationsOf(onlyCdp).n === 2 && I.operationsOf(onlyCdp).verbs.join() === 'Runtime.evaluate,Input.insertText' && I.interruptedVerbs(I.openInterruption(null, { takenAt: 1 }).cycle).length === 0 && I.interruptedVerbs(null).length === 0, '⑧ with no trace of the browser the aborted methods name what was cut; nothing in flight and nothing refused ⇒ an empty re-run list');
  // the words
  ok(I.takeoverText({ label: 'Work', n: 2, verbs: ['fill', 'eval'] }) === 'The user took over your window of the "Work" browser; 2 operations were interrupted: fill, eval. Wait for the handback, then run them again.' && I.takeoverText({ n: 1, verbs: ['eval'] }) === 'The user took over your browser; 1 operation was interrupted: eval. Wait for the handback, then run it again.' && I.takeoverText({ label: 'Work' }) === 'The user took over your window of the "Work" browser; nothing of yours was running there. Wait for the handback before using it again.', '⑧ the takeover\'s words: the agent\'s WINDOW of the browser (lane browser-windows), how many, which — or that nothing was running');
  ok(I.rerunSentence([]) === '' && I.rerunSentence(['fill', 'eval', 'fill']) === 'Re-run what was interrupted: fill, eval — read the page first; refs from before the takeover are stale.' && I.INTERRUPTED_TEXT === 'The user took over your window of this browser — your operation was interrupted. Wait for the handback, then run it again.' && T.INTERRUPTED_TEXT === I.INTERRUPTED_TEXT && T.INTERRUPTED_CODE === 'browser_interrupted', '⑧ the re-run sentence (empty when there is nothing), THE interrupted sentence (one spelling, re-exported by the takeover model)');
  const base = { cause: 'explicit', label: 'Work', url: 'https://x.test/p', heldMs: 12000 };
  ok(T.handbackText(base) === T.handbackText({ ...base, rerun: [] }) && T.handbackText({ ...base, rerun: ['fill', 'eval'] }) === T.handbackText(base) + ' Re-run what was interrupted: fill, eval — read the page first; refs from before the takeover are stale.', '⑧ the handback\'s words: byte-identical when nothing is to re-run; otherwise the reminder is said LAST, once');
  ok(T.handbackText({ ...base, target: 'window', handle: 'w1', rerun: ['fill'] }) === T.handbackText({ ...base, target: 'window', handle: 'w1' }) && /Its open pages are closed[\s\S]*Re-run what was interrupted: fill/.test(T.handbackText({ ...base, cause: 'stop', rerun: ['fill'] })), '⑧ a window target carries no browser re-run list; a STOP handback still names what to re-run');
  const hn = T.handbackNotice({ cause: 'idle', label: 'Work', rerun: ['eval'] });
  ok(hn.rerun.join() === 'eval' && /Re-run what was interrupted: eval/.test(T.renderHandbackNotice(hn)) && !('rerun' in T.handbackNotice({ cause: 'idle' })), '⑧ the zero-spend handback notice carries the list (absent when empty) and renders it');
  const ii = T.idleInboxItem({ label: 'Work', rerun: ['fill', 'eval'] });
  ok(/Interrupted when you took over — the agent is told to re-run: fill, eval\./.test(ii.detail) && !/Interrupted/.test(T.idleInboxItem({ label: 'Work' }).detail), '⑧ the idle handback\'s For-you item carries the same list (and says nothing of it when empty)');
  const tn = T.takeoverNotice({ label: 'Work', n: 2, verbs: ['fill', 'eval'], at: 5 });
  const SS = require('../src/session-status.js');
  ok(tn.kind === 'browser-takeover' && T.renderTakeoverNotice(tn) === '<system-reminder>\n' + I.takeoverText({ label: 'Work', n: 2, verbs: ['fill', 'eval'] }) + '\n</system-reminder>' && SS.NOTICE_KINDS.includes('browser-takeover'), '⑧ the takeover\'s zero-spend notice is a registered kind (session-status) rendering the same words');
  { fs.mkdirSync(path.join(ROOT, 'status8'), { recursive: true }); const st = new SS.SessionStatusManager({ dataDir: path.join(ROOT, 'status8'), onChange: () => { } }); st.pushNotice('k8', tn); const got = st.consumeNotices('k8'); ok(got.length === 1 && SS.SessionStatusManager.renderNotices(got).includes('2 operations were interrupted: fill, eval'), '⑧ …pushNotice accepts it and the prompt-context renderer says it'); }
  // the REAL recorder's ring + the REAL keeper: the takeover event carries the trace's verbs; a refused verb joins the re-run list
  const R = require('../src/server/browser-trace.js');
  const rec = R.create({ dataDir: path.join(ROOT, 'trace8'), homeDir: HOME, keeper, bridge: { tap: async () => ({ ok: false }) }, serverSetting: () => undefined, log: { log() { }, warn() { } }, now: () => clock }); // ONE clock with the keeper (production: both Date.now)
  rec.install();
  const p8 = keeper.profile(keeper.list().profiles[0].id);
  const tp = { key: `sess-1|${p8.id}`, sessionId: 'sess-1', profileId: p8.id, browserKey: KEY_A, pending: new Map(), frames: [], timers: new Set(), ops: [], lastUrl: '', entries: 0 };
  rec._taps.set(tp.key, tp);
  const t8 = clock;
  rec._onRecord(tp, { type: 'command', id: 'k1', action: 'launch' }); rec._onRecord(tp, { type: 'result', id: 'k1', action: 'launch' });
  rec._onRecord(tp, { type: 'command', id: 'k2', action: 'fill', params: { selector: '@e1', value: 'x' } });
  rec._onRecord(tp, { type: 'command', id: 'k3', action: 'evaluate', params: {} });
  const ev8 = []; const unsub8 = keeper.onInput((e) => ev8.push(e));
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 81, sessionId: 'sess-1' });
  const tk8 = ev8.find((e) => e.kind === 'takeover');
  ok(tk8 && tk8.interruption.fresh && tk8.interruption.n === 2 && tk8.interruption.verbs.join() === 'fill,eval' && keeper.interruptionOf(KEY_A, p8.id).n === 2, '⑧ REAL recorder + keeper: the takeover event carries what the TRACE saw in flight (fill, eval — the launch pair is no operation)', JSON.stringify(tk8 && tk8.interruption));
  keeper.resolveFor({ browserKey: KEY_A, verb: 'click' });
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 82, sessionId: 'sess-1', holderAlive: false });
  ok(ev8.filter((e) => e.kind === 'takeover').length === 2 && ev8.filter((e) => e.kind === 'takeover')[1].interruption.fresh === false && keeper.interruptionOf(KEY_A, p8.id).n === 2, '⑧ a second viewer\'s takeover before the handback: not fresh, still 2 (no double count)');
  const hb8 = keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'explicit', url: 'https://x.test/8', sessionId: 'sess-1' });
  ok(hb8.rerun.join() === 'fill,eval,click' && ev8.find((e) => e.kind === 'handback').rerun.join() === 'fill,eval,click' && keeper.interruptionOf(KEY_A, p8.id) === null, '⑧ the handback carries the re-run list (what was cut + what was refused) and closes the cycle');
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 83, sessionId: 'sess-1' });
  const hb8b = keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'explicit', sessionId: 'sess-1' });
  ok(hb8b.rerun.length === 0 && ev8.filter((e) => e.kind === 'takeover')[2].interruption.fresh === true && ev8.filter((e) => e.kind === 'takeover')[2].interruption.n === 0, '⑧ the next cycle starts fresh: nothing in flight (the old operations are not re-counted), nothing to re-run');
  unsub8();
  ok(clock === t8, '(the injected clock did not move)');
  // THE ANNOUNCER: one card + one zero-spend notice per cycle, one reminder at the handback
  const delivered = [], cards = [], notices = [], inbox = [];
  const deliver = { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true, via: 'cli-inbox' }; }, stashFor: () => { }, emitPeerCard: (cid, card) => { cards.push({ cid, card }); } };
  const active = new Map([['sess-1', { _browserKey: KEY_A, claudeSessionId: 'conv-8', name: 'eight' }]]);
  const ann = H.create({ keeper, deliver, serverSetting: () => undefined, userTodos: { add: (key, item) => inbox.push({ key, item }) }, activeSessions: active, sessionKeyFor: (s, id) => 'key:' + id, notice: (id, s, n) => notices.push({ id, n }), log: { log() { }, warn() { } } });
  ann.install();
  rec._onRecord(tp, { type: 'command', id: 'k5', action: 'fill', params: {} });
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 84, sessionId: 'sess-1' });
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 85, sessionId: 'sess-1', holderAlive: false });
  ok(cards.length === 1 && cards[0].cid === 'conv-8' && cards[0].card.fromName === H.FROM_NAME && cards[0].card.kind === 'notification' && /^The user took over the shared window of the "Work" browser \(your tab is in it\); 1 operation was interrupted: fill\. /.test(cards[0].card.text) && delivered.length === 0, '⑧ the takeover TELLS: ONE conversation card per cycle (the second viewer\'s takeover says nothing more), VibeSpace\'s sender, kind notification — and NOTHING is delivered (no billed turn)', JSON.stringify(cards));
  ok(notices.filter((x) => x.n.kind === 'browser-takeover').length === 1 && notices[0].n.verbs.join() === 'fill' && notices[0].id === 'sess-1', '⑧ …and ONE zero-spend `browser-takeover` notice the agent reads at its next turn');
  keeper.resolveFor({ browserKey: KEY_A, verb: 'snapshot' });
  keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'explicit', url: 'https://x.test/done', sessionId: 'sess-1' });
  await until(() => delivered.length === 1, 2000);
  ok(delivered.length === 1 && delivered[0].opts.spendReason === 'browser-handback' && delivered[0].opts.kind === 'notification' && delivered[0].text.endsWith('Re-run what was interrupted: fill, snapshot — read the page first; refs from before the takeover are stale.') && (delivered[0].text.match(/Re-run what was interrupted/g) || []).length === 1, '⑧ the EXPLICIT handback is delivered ONCE under browser-handback (the spend site unchanged) and ends with ONE re-run reminder: what was cut, then what was refused', delivered[0] && delivered[0].text);
  // a cycle with NOTHING in flight and nothing refused: the handback is byte-identical to before
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 86, sessionId: 'sess-1' });
  ok(cards.length === 2 && /nothing of yours was running there/.test(cards[1].card.text), '⑧ a takeover with nothing in flight still tells (a card saying nothing was running)');
  keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'explicit', url: 'https://x.test/idle', sessionId: 'sess-1' });
  await until(() => delivered.length === 2, 2000);
  ok(delivered.length === 2 && delivered[1].text === T.handbackText({ cause: 'explicit', label: 'Work', url: 'https://x.test/idle', heldMs: 0, shared: true }) && !/Re-run/.test(delivered[1].text), '⑧ …and its handback carries NO re-run sentence (byte-identical to the pre-ruling words; verify r2 ⑦: of the shared window this lease is in)', delivered[1] && delivered[1].text);
  // idle: the For-you item and the notice carry the list
  rec._onRecord(tp, { type: 'command', id: 'k6', action: 'evaluate', params: {} });
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 87, sessionId: 'sess-1' });
  keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'idle', url: 'https://x.test/lapsed', sessionId: 'sess-1' });
  await until(() => inbox.length === 1, 2000);
  const hbN = notices.filter((x) => x.n.kind === 'browser-handback').at(-1);
  ok(inbox.length === 1 && /re-run: eval\./.test(inbox[0].item.detail) && hbN && hbN.n.rerun.join() === 'eval' && delivered.length === 2, '⑧ an IDLE handback: nothing delivered, the For-you item and the zero-spend notice carry the re-run list (eval — the fill whose result the trace never got was told at the earlier cycle, never again)', JSON.stringify([inbox[0] && inbox[0].item.detail, hbN && hbN.n]));
  ann.shutdown();
  // the wired card path: the LIVE session's chat (normalizers.feedPeerCard) — a conversation with NO id yet still sees the card
  {
    const N = require('../src/normalizers.js');
    const got = [];
    const sNoId = { _browserKey: KEY_A, name: 'no-id', _normalizer: { injectPeerCard: (c) => got.push(c) } };
    const activeN = new Map([['sess-1', sNoId]]);
    const annN = H.create({ keeper, deliver: { deliverToConversation: async () => ({ ok: false, reason: 'x' }) }, emitCard: (session, card) => N.feedPeerCard(session, card), serverSetting: () => undefined, activeSessions: activeN, sessionKeyFor: (s, id) => 'key:' + id, notice: () => { }, log: { log() { }, warn() { } } });
    const out = annN.announceTakeover({ kind: 'takeover', browserKey: KEY_A, profileId: p8.id, sessionId: 'sess-1', cause: null, interruption: { fresh: true, n: 1, verbs: ['eval'] } });
    ok(out.carded && got.length === 1 && got[0].fromName === H.FROM_NAME && got[0].kind === 'notification' && /1 operation was interrupted: eval/.test(got[0].text) && /emitCard: \(session, card\) => require\('\.\.\/normalizers'\)\.feedPeerCard\(session, card\)/.test(fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8')), '⑧ WIRED: the takeover card goes into the LIVE session\'s chat (normalizers.feedPeerCard, display only) — a conversation with no id yet sees it too', JSON.stringify(got));
  }
  // CONTROL: an announcer copy without the takeover card (the pre-ruling announcer: take-over "delivers nothing") stays silent
  const REPO8 = path.resolve(REPO);
  const M8 = mutantCopies('takeover-interrupt', REPO8);
  const hsrc = fs.readFileSync(path.join(REPO8, 'src/server/browser-handback.js'), 'utf8');
  const hAnchor = "      if (ev.kind === 'takeover') { try { announceTakeover(ev); } catch (e) { log.warn?.(`[browser] takeover announce failed — ${e && e.message}`); } return; }\n";
  ok(hsrc.split(hAnchor).length === 2, '⑧ control setup: the takeover moment is wired once');
  const Hc = M8.load('src/server/browser-handback.js', hsrc.replace(hAnchor, ''), 'no-takeover-card');
  const cardsC = [], noticesC = [];
  const annC = Hc.create({ keeper, deliver: { ...deliver, emitPeerCard: (cid, card) => cardsC.push(card) }, serverSetting: () => undefined, activeSessions: active, sessionKeyFor: (s, id) => 'key:' + id, notice: (id, s, n) => noticesC.push(n), log: { log() { }, warn() { } } });
  annC.install();
  rec._onRecord(tp, { type: 'command', id: 'k7', action: 'fill', params: {} });
  keeper.takeover({ browserKey: KEY_A, profileId: p8.id, viewerId: 88, sessionId: 'sess-1' });
  ok(cardsC.length === 0 && noticesC.length === 0, '⑧ CONTROL (the pre-ruling announcer: the takeover moment wired out, in a copy): the fill it cut is told to NOBODY — no card, no notice; the wiring is the telling');
  keeper.handback({ browserKey: KEY_A, profileId: p8.id, cause: 'viewer-left', sessionId: 'sess-1' });
  annC.shutdown();
  for (const r of copiesCensus(M8.files, M8.dir, REPO8, { minCopies: 1, label: '⑧ ' })) ok(r.pass, r.name, r.detail);
  rec.shutdown();
}

// ═══ ⑨ VERIFY r6 (S2): a takeover is of the BROWSER — the sibling conversations on a shared profile; the audit join; the terminate count ═══
console.log('— ⑨ verify r6: every conversation leased on the taken browser is taken over WITH it (its own cycle, card, reminder); the audit joins only an OPEN cycle; a page script stopped is said');
{
  const KEY_S1 = 'bk-00000091', KEY_S2 = 'bk-00000092', KEY_S3 = 'bk-00000093';
  const set9 = { 'browser.takeoverIdleMs': 30000, 'browser.idleTimeoutMs': 600000 };
  const logs9 = [];
  const k9 = K.create({ dataDir: path.join(ROOT, 'data9'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => set9[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_S1, KEY_S2, KEY_S3]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log: (l) => logs9.push(String(l)), warn() { }, error() { } }, now, install: false });
  const ev9 = []; k9.onInput((e) => ev9.push(e));
  const shared = k9.createProfile({ label: 'Shared9' }, { owner: { kind: 'instance', id: null } }); // an owner-shared (cooperative) profile: three conversations may lease it
  await k9.attach({ profileId: shared.id, browserKey: KEY_S1, sessionId: 'sess-91' });
  await k9.attach({ profileId: shared.id, browserKey: KEY_S2, sessionId: 'sess-92' });
  await k9.attach({ profileId: shared.id, browserKey: KEY_S3, sessionId: 'sess-93' });
  const own = k9.createProfile({ label: 'Own9' }, { owner: { kind: 'session', id: KEY_S1 } });
  await k9.attach({ profileId: own.id, browserKey: KEY_S1, sessionId: 'sess-91' });
  // the real recorder: S2's fill is in flight when S1's user takes over
  const R9 = require('../src/server/browser-trace.js');
  const rec9 = R9.create({ dataDir: path.join(ROOT, 'trace9'), homeDir: HOME, keeper: k9, bridge: { tap: async () => ({ ok: false }) }, serverSetting: () => undefined, log: { log() { }, warn() { } }, now: () => clock });
  rec9.install();
  const tp92 = { key: `sess-92|${shared.id}`, sessionId: 'sess-92', profileId: shared.id, browserKey: KEY_S2, pending: new Map(), frames: [], timers: new Set(), ops: [], lastUrl: '', entries: 0 };
  rec9._taps.set(tp92.key, tp92);
  rec9._onRecord(tp92, { type: 'command', id: 'f1', action: 'fill', params: {} });
  // the announcer over the three sessions
  const cards9 = [], notices9 = [], delivered9 = [];
  const active9 = new Map([['sess-91', { _browserKey: KEY_S1, claudeSessionId: 'conv-91', name: 'one' }], ['sess-92', { _browserKey: KEY_S2, claudeSessionId: 'conv-92', name: 'two' }], ['sess-93', { _browserKey: KEY_S3, claudeSessionId: 'conv-93', name: 'three' }]]);
  const ann9 = H.create({ keeper: k9, deliver: { deliverToConversation: async (cid, text, opts) => { delivered9.push({ cid, text, opts }); return { ok: true, via: 'x' }; }, stashFor: () => { }, emitPeerCard: (cid, card) => cards9.push({ cid, card }) }, serverSetting: () => undefined, activeSessions: active9, sessionKeyFor: (s, id) => 'key:' + id, notice: (id, s, n) => notices9.push({ id, n }), log: { log() { }, warn() { } } });
  ann9.install();
  const t9 = k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 911, sessionId: 'sess-91' });
  const st2 = k9.inputStateFor(KEY_S2, shared.id), st3 = k9.inputStateFor(KEY_S3, shared.id);
  ok(t9.ok && st2.input === 'user' && st2.takenBy.viewerId === 911 && st3.input === 'user' && st3.takenBy.viewerId === 911, '⑨ the siblings (S2, S3) are taken over WITH S1 by the same viewer — a takeover is of the BROWSER', JSON.stringify({ st2, st3 }));
  const heldS3 = k9.takeover({ browserKey: KEY_S3, profileId: shared.id, viewerId: 933, sessionId: 'sess-93' });
  ok(!heldS3.ok && heldS3.code === 'held' && heldS3.holder.viewerId === 911, '⑨ S3\'s own viewer clicking Take over now is `held` (one user drives one browser — never taken from them)');
  ok(k9.inputStateFor(KEY_S1, own.id).input === 'agent', '⑨ S1\'s OTHER profile (its own) is untouched — the takeover is of the shared browser, not of the conversation');
  const tk2 = ev9.find((e) => e.kind === 'takeover' && e.browserKey === KEY_S2);
  ok(tk2 && tk2.sibling === KEY_S1 && tk2.sessionId === 'sess-92' && tk2.interruption.fresh && tk2.interruption.n === 1 && tk2.interruption.verbs.join() === 'fill', '⑨ the sibling\'s takeover event names the primary (`sibling`), its own session, and what the TRACE saw in flight for IT (fill)', JSON.stringify(tk2 && tk2.interruption));
  ok(cards9.filter((c) => c.cid === 'conv-92').length === 1 && /1 operation was interrupted: fill/.test(cards9.find((c) => c.cid === 'conv-92').card.text) && cards9.filter((c) => c.cid === 'conv-91').length === 1 && /nothing of yours was running/.test(cards9.find((c) => c.cid === 'conv-91').card.text) && cards9.filter((c) => c.cid === 'conv-93').length === 1 && /nothing of yours was running/.test(cards9.find((c) => c.cid === 'conv-93').card.text), '⑨ each conversation gets ITS OWN card: S2\'s names S2\'s fill, S1\'s and S3\'s say nothing of theirs was running', JSON.stringify(cards9.map((c) => c.cid + ':' + c.card.text.slice(0, 60))));
  ok(notices9.filter((x) => x.n.kind === 'browser-takeover' && x.id === 'sess-92').length === 1, '⑨ …and its own zero-spend notice');
  // a FOURTH conversation attaching while the user drives is paused from birth (it joins the takeover; its own card)
  const KEY_S4 = 'bk-00000094';
  active9.set('sess-94', { _browserKey: KEY_S4, claudeSessionId: 'conv-94', name: 'four' }); // the announcer reads the live map
  await k9.attach({ profileId: shared.id, browserKey: KEY_S4, sessionId: 'sess-94' });
  const st4 = k9.inputStateFor(KEY_S4, shared.id);
  ok(st4.input === 'user' && st4.takenBy.viewerId === 911 && !k9.resolveFor({ browserKey: KEY_S4, verb: 'open' }).ok && cards9.some((c) => c.cid === 'conv-94' && /nothing of yours was running/.test(c.card.text)) && logs9.some((l) => /bk-00000094 on .*: attached while the user drives this browser \(from bk-00000091/.test(l)), '⑨ a conversation ATTACHING while the user drives is paused from birth (the same viewer), refused at /resolve, told by its own card — never a fresh seat beside the user', JSON.stringify({ st4, r: k9.resolveFor({ browserKey: KEY_S4, verb: 'open' }).code }));
  const r2 = k9.resolveFor({ browserKey: KEY_S2, verb: 'click' });
  const r1 = k9.resolveFor({ browserKey: KEY_S1, handle: shared.id, verb: 'scroll' }); // S1 holds two attachments: the shared one by handle
  ok(!r2.ok && r2.code === 'browser_paused' && !r1.ok && r1.code === 'browser_paused', '⑨ while the user drives, BOTH conversations\' page verbs are refused browser_paused (each noted on its OWN cycle)');
  ok(logs9.some((l) => /bk-00000092 on .*: taken over WITH bk-00000091/.test(l)), '⑨ the journal says the sibling was taken over WITH the primary');
  // the idle clock is the holder's: S1's input at +29 s keeps S2 too; both lapse together at +31 s after the last input
  clock += 29000; k9.noteUserInput(KEY_S1, shared.id, clock); await k9.tick();
  ok(k9.inputStateFor(KEY_S2, shared.id).input === 'user' && k9.inputStateFor(KEY_S2, shared.id).lastUserInputAt === clock, '⑨ the holder\'s input restarts the SIBLING\'s idle clock too (one user drives one browser)');
  // a pass (fold-back) moves the holder of the siblings with it
  const ps = k9.passControl({ browserKey: KEY_S1, profileId: shared.id, from: 911, to: 912, sessionId: 'sess-91' });
  ok(ps.ok && [KEY_S2, KEY_S3, KEY_S4].every((k) => k9.inputStateFor(k, shared.id).takenBy.viewerId === 912), '⑨ a pass (fold-back) moves every sibling\'s holder with the primary\'s');
  // the handback from S1's view hands the sibling back too — each with ITS OWN reminder (S2's fill + click; never S1's scroll)
  // r6 A-F9 (money): the Hand back control's count = the billed turns this handback starts — S1 (the primary), S2 (its fill
  // cut + its click refused), S4 (its open refused); S3 had nothing ⇒ the free notice. A press carrying another count hands
  // NOTHING back (the channels expectWakes precedent)
  const w9 = k9.handbackWakesFor(KEY_S1, shared.id);
  const ev9n = ev9.length;
  const stale9 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 912, cause: 'explicit', url: 'https://x/one', sessionId: 'sess-91', expectWakes: 1 });
  await sleep(40);
  ok(w9 === 3 && !stale9.ok && stale9.code === 'wake_count_changed' && stale9.wakes === 3 && [KEY_S1, KEY_S2, KEY_S3, KEY_S4].every((k) => k9.inputStateFor(k, shared.id).input === 'user') && ev9.length === ev9n && delivered9.length === 0, 'r6 A-F9: handbackWakesFor says 3 (S1 + S2 + S4 — S3 had nothing); a Hand back whose control said 1 is refused wake_count_changed {wakes: 3} — nobody handed back, nothing delivered', JSON.stringify({ w9, stale9 }));
  const hb1 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 912, cause: 'explicit', url: 'https://x/one', sessionId: 'sess-91', expectWakes: w9 });
  await until(() => delivered9.length === 3, 2000);
  ok(hb1.ok && delivered9.length === w9, 'r6 A-F9: the press carrying the count it showed hands back — and the announcer delivered EXACTLY that many billed turns (the count is the announcer\'s own rule)', JSON.stringify({ w9, delivered: delivered9.map((d) => d.cid) }));
  const d2 = delivered9.find((d) => d.cid === 'conv-92'), d1 = delivered9.find((d) => d.cid === 'conv-91');
  // verify r7 (spend): S3 had NOTHING interrupted or refused — its mirrored handback is the zero-spend notice, never a billed wake
  ok(hb1.ok && hb1.rerun.join() === 'scroll' && [KEY_S2, KEY_S3, KEY_S4].every((k) => k9.inputStateFor(k, shared.id).input === 'agent') && delivered9.length === 3 && !delivered9.some((d) => d.cid === 'conv-93') && notices9.some((x) => x.id === 'sess-93' && x.n.kind === 'browser-handback'), '⑨ the handback from S1\'s view hands every sibling back with it — four conversations, THREE delivered (S1 the primary, S2 with its cut fill, S4 with its refused open — each through the one ladder site); S3, with nothing of its own to re-run, gets the zero-spend notice (verify r7)', JSON.stringify({ delivered: delivered9.map((d) => d.cid), notices: notices9.filter((x) => x.n.kind === 'browser-handback').map((x) => x.id) }));
  ok(d2 && /Re-run what was interrupted: fill, click/.test(d2.text) && !/scroll/.test(d2.text) && d1 && /Re-run what was interrupted: scroll/.test(d1.text) && !/fill/.test(d1.text) && d2.opts.spendReason === 'browser-handback', '⑨ each conversation is reminded of ITS OWN verbs through the SAME ladder site (browser-handback) — S2: fill, click; S1: scroll; nothing crosses', JSON.stringify(delivered9.map((d) => d.cid + ': ' + d.text.slice(-90))));
  const hb2 = ev9.find((e) => e.kind === 'handback' && e.browserKey === KEY_S2);
  ok(hb2 && hb2.cause === 'explicit' && hb2.sessionId === 'sess-92' && hb2.rerun.join() === 'fill,click', '⑨ the sibling\'s handback event carries its own session and re-run list');
  // an ephemeral key has no siblings; a `stop` of the profile hands every state back once
  ok(k9.takeover({ browserKey: KEY_S1, profileId: null, viewerId: 950, sessionId: 'sess-91' }).ok && k9.inputStateFor(KEY_S2, shared.id).input === 'agent', '⑨ a takeover of the conversation\'s EPHEMERAL browser takes no sibling (an ephemeral record is one conversation\'s)');
  k9.handback({ browserKey: KEY_S1, profileId: null, viewerId: 950, cause: 'explicit', sessionId: 'sess-91' });
  // THE AUDIT JOIN (r5's fix, r6 pinned): a verb whose audit lands AFTER the handback joins nothing (order A) — the CLI's own
  // line says control is back; one whose audit lands while the user drives AGAIN joins that OPEN cycle (order B) — the CLI's
  // line said "wait for the handback (it names what to re-run)", so it does, once; the same audit repeated names it once
  {
    const since = clock; clock += 5;
    k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 960, sessionId: 'sess-91' }); clock += 5;
    const h1 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 960, cause: 'explicit', sessionId: 'sess-91' }); clock += 2000;
    const auA = k9.interruptionFor({ browserKey: KEY_S1, profileId: shared.id, since, verb: 'fill' }); clock += 1000;
    k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 961, sessionId: 'sess-91' }); clock += 5;
    const h2 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 961, cause: 'explicit', sessionId: 'sess-91' }); clock += 5;
    ok(auA && auA.handedBackAt > 0 && h1.rerun.length === 0 && h2.rerun.length === 0, '⑨ order A: the audit says interrupted + handed back; it joins NEITHER the closed cycle nor the next one');
    const since2 = clock; clock += 5;
    k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 962, sessionId: 'sess-91' }); clock += 5;
    const h3 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 962, cause: 'explicit', sessionId: 'sess-91' }); clock += 1000;
    k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 963, sessionId: 'sess-91' }); clock += 5;
    const auB = k9.interruptionFor({ browserKey: KEY_S1, profileId: shared.id, since: since2, verb: 'fill' });
    const auB2 = k9.interruptionFor({ browserKey: KEY_S1, profileId: shared.id, since: since2, verb: 'fill' }); clock += 5;
    const h4 = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 963, cause: 'explicit', sessionId: 'sess-91' }); clock += 5;
    ok(auB && auB.input === 'user' && auB.handedBackAt === 0 && auB2 && h3.rerun.length === 0 && h4.rerun.join() === 'fill', '⑨ order B: an audit landing while the user drives AGAIN joins that OPEN cycle (the CLI said the handback names it) — once, even audited twice');
  }
  // `terminated` in the view: one per CDP session that had an aborted SCRIPT call (the mediator's plan) — the toast's "a script running in the page was stopped"
  const I9 = require('../src/browser-interrupt.js');
  const v9 = I9.interruptionView(I9.openInterruption(null, { takenAt: 1, aborted: [{ method: 'Runtime.evaluate', sessionId: 'S1' }, { method: 'Input.insertText', sessionId: 'S1' }, { method: 'Runtime.callFunctionOn', sessionId: 'S1' }, { method: 'Runtime.evaluate', sessionId: 'S2' }, { method: 'Page.reload', sessionId: 'S3' }] }).cycle);
  ok(v9.terminated === 2 && I9.interruptionView(I9.openInterruption(null, { takenAt: 1, aborted: [{ method: 'Input.insertText', sessionId: 'S1' }] }).cycle).terminated === 0, '⑨ interruptionView.terminated counts the sessions a terminateExecution went to (script calls only, one per session)');
  const bsSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8'), lwSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/terminated: ev\.interruption\.terminated \|\| 0/.test(bsSrc) && /A script running in the page was stopped with it\./.test(lwSrc) && ['zh', 'ja'].every((l) => fs.readFileSync(path.join(REPO, `src/lib/i18n-${l}.js`), 'utf8').includes('"A script running in the page was stopped with it."')), '⑨ WIRED: the mode record carries `terminated` and the live view\'s takeover toast says a page script was stopped (zh + ja)');
  // ═ VERIFY r7 (S2): ONE BROWSER, ONE HOLDER — across leases, and on the WIRED path ═
  {
    // (a) S2's OWN viewer drives (S1, S3, S4 taken with it); S1's viewer clicking Take over is `held` naming S2's holder
    const holdersOf = () => new Set([KEY_S1, KEY_S2, KEY_S3, KEY_S4].map((kk) => { const s = k9.inputStateFor(kk, shared.id); return s.input === 'user' && s.takenBy ? s.takenBy.viewerId : null; }).filter((x) => x !== null));
    const t2 = k9.takeover({ browserKey: KEY_S2, profileId: shared.id, viewerId: 921, sessionId: 'sess-92' });
    ok(t2.ok && [...holdersOf()].join() === '921', '⑨ r7 setup: S2\'s own viewer drives — S1, S3, S4 taken with it (one holder: 921)', JSON.stringify([...holdersOf()]));
    const t1 = k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 922, sessionId: 'sess-91' });
    ok(!t1.ok && t1.code === 'held' && t1.holder.viewerId === 921 && t1.heldBy === KEY_S2 && [...holdersOf()].join() === '921', '⑨ r7: S1\'s viewer clicking Take over while S2\'s LIVE viewer drives the same browser is `held` naming that holder (heldBy the sibling) — never a second holder of one Chrome', JSON.stringify(t1));
    const cardsBefore = cards9.length;
    // (b) that holder's socket is GONE (the bridge's fact across every relay): S1's viewer takes the browser WHOLE — every sibling re-seized by 922, no new card (their cycles go on)
    const t1b = k9.takeover({ browserKey: KEY_S1, profileId: shared.id, viewerId: 922, sessionId: 'sess-91', viewerAlive: (id) => id !== 921 });
    ok(t1b.ok && [...holdersOf()].join() === '922' && cards9.length === cardsBefore, '⑨ r7: a holder whose socket is gone never blocks — the new viewer re-seizes the browser WHOLE (S2, S3, S4 move with S1 to 922), no second card (the same takeover goes on)', JSON.stringify({ holders: [...holdersOf()], cards: cards9.length - cardsBefore }));
    delivered9.length = 0; notices9.length = 0;
    const hb = k9.handback({ browserKey: KEY_S1, profileId: shared.id, viewerId: 922, cause: 'explicit', sessionId: 'sess-91' });
    await sleep(80);
    ok(hb.ok && holdersOf().size === 0, '⑨ r7: …and one handback releases all four');
    // (c) THE SPEND RULE (PURE): a sibling's mirrored handback with nothing of its own to re-run is a zero-spend notice, never a billed wake
    ok(T.announceVerdict({ cause: 'explicit', sibling: true, rerun: [] }).deliver === false && T.announceVerdict({ cause: 'explicit', sibling: true, rerun: ['fill'] }).deliver === true && T.announceVerdict({ cause: 'explicit', sibling: false, rerun: [] }).deliver === true && T.announceVerdict({ cause: 'explicit' }).deliver === true && T.announceVerdict({ cause: 'idle', sibling: true, rerun: ['fill'] }).deliver === false, '⑨ r7 PURE announceVerdict: a MIRRORED (sibling) explicit handback delivers only with something to re-run; the primary\'s explicit handback delivers as before; idle stays zero-spend');
    ok(delivered9.map((d) => d.cid).join() === 'conv-91' && notices9.filter((n) => n.n.kind === 'browser-handback').map((n) => n.id).sort().join() === 'sess-92,sess-93,sess-94', '⑨ r7 WIRED: that handback delivered ONE turn (the primary) — the three siblings, nothing of theirs interrupted or refused, got the zero-spend notice (one click never wakes every conversation on the browser)', JSON.stringify({ delivered: delivered9.map((d) => d.cid), notices: notices9.map((n) => n.id + ':' + n.n.kind) }));
    // (d) THE WIRED PATH: the real bridge over a fake upstream — two views of two conversations on the one browser
    const up9 = await fakeUpstream();
    k9.streamPortFor = async () => ({ ok: true, port: up9.port, error: null, code: null });
    const bridge9 = BS.create({ keeper: k9, activeSessions: active9, requestAuthed: (req) => /vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } }, now });
    const srv9 = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
    srv9.on('upgrade', (req, socket, head) => bridge9.handleUpgrade(req, socket, head));
    const PORT9 = await freePort(); await new Promise((r) => srv9.listen(PORT9, '127.0.0.1', r)); servers.push(srv9);
    const v1 = viewer(PORT9, `session=sess-91&profile=${shared.id}`), v2 = viewer(PORT9, `session=sess-92&profile=${shared.id}`);
    await v1.until((v) => !!v.last('hello')); await v2.until((v) => !!v.last('hello'));
    v2.send({ type: 'takeover' }); await v2.until((v) => !!v.last('mode-ack'));
    await v1.until((v) => !!v.last('mode') && v.last('mode').mode === 'takeover');
    ok(v1.last('mode').holder === v2.last('hello').you && v1.last('mode').mine === false, '⑨ r7 bridge: S2\'s view takes over — S1\'s view is told the browser is driven (holder = S2\'s viewer, not mine)');
    v1.send({ type: 'takeover' }); await v1.until((v) => v.by('refused').length >= 1 || !!v.last('mode-ack'));
    ok(v1.last('refused') && v1.last('refused').code === 'held' && v1.last('refused').holder === v2.last('hello').you && !v1.last('mode-ack') && k9.inputStateFor(KEY_S1, shared.id).takenBy.viewerId === v2.last('hello').you, '⑨ r7 bridge: S1\'s view clicking Take over is `held` ON THE WIRED PATH (the holder sits on ANOTHER relay — its liveness is read across every relay)', JSON.stringify(v1.last('refused')));
    up9.got.length = 0;
    v1.send({ type: 'input_mouse', eventType: 'mousePressed', x: 11, y: 11, button: 'left', clickCount: 1 }); v2.send({ type: 'input_mouse', eventType: 'mousePressed', x: 22, y: 22, button: 'left', clickCount: 1 });
    await until(() => up9.got.length >= 1, 1500); await sleep(100);
    ok(up9.got.length === 1 && up9.got[0].x === 22, '⑨ r7 bridge: exactly ONE view\'s input reaches the browser (the holder\'s)', JSON.stringify(up9.got.map((g) => g.x)));
    // r6 A-F9 on the WIRED path: the driving view is told the count (the mode record, then `handback-wakes` as the siblings
    // join); its Hand back carrying another count is refused by name with the count now — the browser stays driven
    await sleep(60);
    const w92 = k9.handbackWakesFor(KEY_S2, shared.id);
    const lastCount = v2.msgs.filter((m) => m.type === 'mode' || m.type === 'handback-wakes').at(-1);
    ok(lastCount && lastCount.wakes === w92 && w92 >= 1 && Number.isInteger(v2.last('mode').wakes), 'r6 A-F9 bridge: the driving view\'s last count (mode / handback-wakes) is the keeper\'s count for a Hand back from it', JSON.stringify({ w92, lastCount }));
    v2.send({ type: 'handback', expectWakes: w92 + 5 });
    await v2.until((v) => v.by('refused').some((m) => m.code === 'wake_count_changed'));
    const rw = v2.by('refused').find((m) => m.code === 'wake_count_changed');
    ok(rw && rw.wakes === w92 && k9.inputStateFor(KEY_S2, shared.id).input === 'user', 'r6 A-F9 bridge: a Hand back carrying another count is refused wake_count_changed {wakes} — the browser stays driven', JSON.stringify(rw));
    v2.ws.close();
    await until(() => k9.inputStateFor(KEY_S1, shared.id).input === 'agent' && k9.inputStateFor(KEY_S2, shared.id).input === 'agent', 3000);
    ok(k9.inputStateFor(KEY_S1, shared.id).input === 'agent' && k9.inputStateFor(KEY_S2, shared.id).input === 'agent', '⑨ r7 bridge: the holder\'s window closing (viewer-left) hands the browser back — S1 with S2');
    v1.ws.close(); await sleep(30); await up9.close();
  }
  ann9.shutdown(); rec9.shutdown(); k9.shutdown();
  // CONTROL (scripts/mutant-copy.mjs): the r5 keeper — the sibling call wired out: S2 keeps driving under the user's hands, told nothing
  const M9 = mutantCopies('takeover-siblings', REPO);
  const ksrc9 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const line9 = "      if (profileId) siblingTakeover({ browserKey, profileId, viewerId, at, alive });\n";
  ok(ksrc9.split(line9).length === 2, '⑨ control setup: the sibling takeover is wired once');
  const K9c = M9.load('src/server/browser-keeper.js', ksrc9.replace(line9, ''), 'no-siblings');
  const kc = K9c.create({ dataDir: path.join(ROOT, 'data9c'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => set9[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_S1, KEY_S2]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false });
  const sc = kc.createProfile({ label: 'Shared9c' }, { owner: { kind: 'instance', id: null } });
  await kc.attach({ profileId: sc.id, browserKey: KEY_S1, sessionId: 'sess-91' }); await kc.attach({ profileId: sc.id, browserKey: KEY_S2, sessionId: 'sess-92' });
  const evc = []; kc.onInput((e) => evc.push(e));
  kc.takeover({ browserKey: KEY_S1, profileId: sc.id, viewerId: 971, sessionId: 'sess-91' });
  // integration 2.369.192: master's S5 one-driver layer (owner ruling A (2)) now refuses S2's NEXT command browser_busy "the
  // user drives it" in this copy — a refusal with no interrupt of what S2 had in flight, no cycle, no card, no reminder —
  // so the control reads the facts the sibling call alone makes: S2 not paused, not taken, told nothing
  const rc9 = kc.resolveFor({ browserKey: KEY_S2, verb: 'click' });
  ok(kc.inputStateFor(KEY_S2, sc.id).input === 'agent' && rc9.code !== 'browser_paused' && evc.filter((e) => e.kind === 'takeover').length === 1, '⑨ CONTROL (the sibling call wired out, in a copy): the other conversation is not taken over, never paused and told nothing (its next command meets only S5\'s browser_busy) — the wiring is the rule', { input: kc.inputStateFor(KEY_S2, sc.id).input, code: rc9.code || 'ok' });
  kc.shutdown();
  // CONTROL r7 (the keeper half): the keeper IGNORES the bridge's cross-relay liveness fact (the r6 keeper: `holderAlive`
  // alone, which the bridge reads PER RELAY — false for a holder on another relay) ⇒ a second view takes a browser a LIVE
  // viewer is driving; the real keeper, handed the same arguments, is `held`
  const aliveLine9 = "    const alive = typeof viewerAlive === 'function' ? (id) => { try { return !!viewerAlive(id); } catch { return holderAlive; } } : () => holderAlive;\n";
  ok(ksrc9.split(aliveLine9).length === 2, '⑨ r7 control setup: the keeper consults the cross-relay liveness fact once');
  const mkPair = async (Kimpl, name) => {
    const kx = Kimpl.create({ dataDir: path.join(ROOT, name), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => set9[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_S1, KEY_S2]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false });
    const sx = kx.createProfile({ label: 'Shared-' + name }, { owner: { kind: 'instance', id: null } });
    await kx.attach({ profileId: sx.id, browserKey: KEY_S1, sessionId: 'sess-91' }); await kx.attach({ profileId: sx.id, browserKey: KEY_S2, sessionId: 'sess-92' });
    kx.takeover({ browserKey: KEY_S2, profileId: sx.id, viewerId: 981, sessionId: 'sess-92' }); // S2's own view drives; S1 taken with it
    // S1's view: the bridge's per-relay reading says "no holder here" (holderAlive false) while the cross-relay fact says 981 is live
    const t = kx.takeover({ browserKey: KEY_S1, profileId: sx.id, viewerId: 982, sessionId: 'sess-91', holderAlive: false, viewerAlive: (id) => id === 981 });
    const out = { ok: t.ok, code: t.code, s1: kx.inputStateFor(KEY_S1, sx.id).takenBy.viewerId, s2: kx.inputStateFor(KEY_S2, sx.id).takenBy.viewerId };
    kx.shutdown(); return out;
  };
  const real9 = await mkPair(K, 'data9r');
  ok(!real9.ok && real9.code === 'held' && real9.s1 === 981 && real9.s2 === 981, '⑨ r7 the REAL keeper: with the per-relay reading false but the cross-relay fact live, the second view is `held` (981 keeps the browser)', JSON.stringify(real9));
  const K9h = M9.load('src/server/browser-keeper.js', ksrc9.replace(aliveLine9, '    const alive = () => holderAlive; // MUTANT r7: the cross-relay fact ignored\n'), 'no-alive');
  const mut9 = await mkPair(K9h, 'data9h');
  ok(mut9.ok && mut9.s1 === 982 && mut9.s2 === 982, '⑨ CONTROL r7 (the cross-relay fact ignored, in a copy): the second view TAKES the browser from a live viewer (981 → 982 on both leases) — consulting the fact is the rule', JSON.stringify(mut9));
  // CONTROL r7 (the bridge half): a bridge copy reading the holder's liveness PER RELAY (the r6 bridge, no cross-relay fact for the keeper) ⇒ a second view takes a browser a LIVE viewer is driving
  {
    const bsSrc9 = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
    const bsLine9 = "    const holderAlive = relay.holder !== null && viewerAlive(relay.holder);\n";
    ok(bsSrc9.split(bsLine9).length === 2 && bsSrc9.split('holderAlive, viewerAlive });').length === 2, '⑨ r7 control setup: the bridge reads the holder\'s liveness across every relay, once, and hands the keeper the fact');
    const BS9c = M9.load('src/server/browser-stream.js', bsSrc9.replace(bsLine9, "    const holderAlive = relay.holder !== null && relay.viewers.has(relay.holder);\n").replace('holderAlive, viewerAlive });', 'holderAlive });'), 'per-relay');
    const kb = K.create({ dataDir: path.join(ROOT, 'data9b'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => set9[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_S1, KEY_S2]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false });
    const sb = kb.createProfile({ label: 'Shared9b' }, { owner: { kind: 'instance', id: null } });
    await kb.attach({ profileId: sb.id, browserKey: KEY_S1, sessionId: 'sess-91' }); await kb.attach({ profileId: sb.id, browserKey: KEY_S2, sessionId: 'sess-92' });
    const upb = await fakeUpstream();
    kb.streamPortFor = async () => ({ ok: true, port: upb.port, error: null, code: null });
    const activeB = new Map([['sess-91', { _browserKey: KEY_S1, name: 'one' }], ['sess-92', { _browserKey: KEY_S2, name: 'two' }]]);
    const bridgeB = BS9c.create({ keeper: kb, activeSessions: activeB, requestAuthed: (req) => /vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } }, now });
    const srvB = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
    srvB.on('upgrade', (req, socket, head) => bridgeB.handleUpgrade(req, socket, head));
    const PORTB = await freePort(); await new Promise((r) => srvB.listen(PORTB, '127.0.0.1', r)); servers.push(srvB);
    const w1 = viewer(PORTB, `session=sess-91&profile=${sb.id}`), w2 = viewer(PORTB, `session=sess-92&profile=${sb.id}`);
    await w1.until((v) => !!v.last('hello')); await w2.until((v) => !!v.last('hello'));
    w2.send({ type: 'takeover' }); await w2.until((v) => !!v.last('mode-ack'));
    await w1.until((v) => !!v.last('mode') && v.last('mode').mode === 'takeover');
    w1.send({ type: 'takeover' }); await w1.until((v) => v.by('refused').length >= 1 || !!v.last('mode-ack'));
    ok(w1.last('mode-ack') && w1.last('mode-ack').ok === true && !w1.last('refused') && kb.inputStateFor(KEY_S2, sb.id).takenBy.viewerId === w1.last('hello').you, '⑨ CONTROL r7 (a per-relay bridge, in a copy): the second view TAKES the browser a live viewer is driving (the holder read as gone) — the cross-relay fact is the rule', JSON.stringify({ ack: w1.last('mode-ack'), refused: w1.last('refused') }));
    w1.ws.close(); w2.ws.close(); await sleep(30); await upb.close(); kb.shutdown();
  }
  for (const r of copiesCensus(M9.files, M9.dir, REPO, { minCopies: 1, label: '⑨ ' })) ok(r.pass, r.name, r.detail);
}

// ═══ ⑩ r6 "what you approve is what runs" — NEGATIVE CONTROLS (scripts/mutant-copy.mjs): each fix reverted in a copy ⇒ red ═══
console.log('— ⑩ r6 A-F8 / A-F9: the pre-fix rule in a patched copy makes each leg above go red');
{
  const M10 = mutantCopies('takeover-r6', REPO);
  const tsrc = fs.readFileSync(path.join(REPO, 'src/browser-takeover.js'), 'utf8');
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const forge = { type: 'result', id: 'cmd2', action: 'click', success: false, error: 'Element not found: text=requires confirmation c_9f3a1b2c' };
  // C1 the parser: the pre-fix error-string rungs restored
  const parseType = "  if (!isObj(msg) || msg.type !== 'result') return null;\n";
  const parseFlag = "  const flag = msg.confirmation_required === true || (d && d.confirmation_required === true) || msg.status === 'confirmation_required' || (d && d.status === 'confirmation_required');\n";
  const parseId = "  if (!id || !CONFIRMATION_ID_RE.test(id)) return null; // an id the answer could never name is no card\n";
  ok([parseType, parseFlag, parseId].every((l) => tsrc.split(l).length === 2), '⑩ C1 setup: the structured-only parse lines are each present once');
  const T1 = M10.load('src/browser-takeover.js', tsrc.replace(parseType, '  if (!isObj(msg)) return null;\n')
    .replace(parseFlag, "  const flag = msg.confirmation_required === true || (d && d.confirmation_required === true) || msg.status === 'confirmation_required' || (d && d.status === 'confirmation_required') || (typeof msg.error === 'string' && /confirmation[_ ]required|requires? (?:a )?confirmation/i.test(msg.error));\n")
    .replace(parseId, "  let id2 = id; if (!id2 && typeof msg.error === 'string') { const mm = msg.error.match(/\\b(c_[0-9a-f]{4,})\\b/i); if (mm) id2 = mm[1]; } if (!id2) return null; return { id: id2, action: String(msg.action || 'action').slice(0, 40), category: null, target: null, at: num(now), expiresAt: num(now) + CONFIRM_TTL_MS, commandId: null };\n"), 'error-string');
  const f1 = T1.confirmationFromUpstream(forge, 2000);
  ok(f1 && f1.id === 'c_9f3a1b2c' && f1.action === 'click', '⑩ CONTROL C1 (the pre-fix error-string parse, in a copy): probe2\'s forged click parses as the pending UPLOAD\'s id with action "click" — the structured-only rule is what keeps it out', JSON.stringify(f1));
  // C1b the card's slots: the pre-fix card rebuilt its rows from the live ids alone — a row that goes shifts the rest up
  const slotLine = "  while (out.length && out[out.length - 1].gone) out.pop();\n";
  ok(tsrc.split(slotLine).length === 2, '⑩ C1b setup: the trailing-tombstone rule is present once');
  const T1b = M10.load('src/browser-takeover.js', tsrc.replace(slotLine, '  for (let i = out.length - 1; i >= 0; i--) if (out[i].gone) out.splice(i, 1);\n'), 'no-slots');
  const sb = T1b.confirmSlots(T1b.confirmSlots([], ['a', 'b', 'c']), ['b', 'c']).map((x) => x.id).join();
  ok(sb === 'b,c', '⑩ CONTROL C1b (rows rebuilt from the live ids, in a copy): the expired row\'s slot is taken by the next one (b moves up under the pointer) — keeping the slot is the rule', sb);
  // a keeper factory for the copies (the ephemeral browser: no attach needed — its answer runs under the spawn pairs)
  const mkK = (Kimpl, name, extra = {}) => Kimpl.create({ dataDir: path.join(ROOT, name), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => settings[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_A, KEY_B, 'bk-000000a1', 'bk-000000a2']), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, now, install: false, ...extra });
  const upl = T.confirmationFromUpstream({ type: 'result', id: 'cmd1', action: 'upload', data: { confirmation_required: true, confirmation_id: 'c_ctl01', category: 'upload' }, timestamp: clock }, clock, { command: { type: 'command', id: 'cmd1', params: { selector: '#f', files: ['/x/secret'] } } });
  const PAIRS = ['AGENT_BROWSER_SESSION=vs-ctl'];
  const firstWriteLeg = async (Kimpl, name) => {
    const kx = mkK(Kimpl, name);
    kx.notePending({ browserKey: KEY_B, profileId: null, sessionId: 'sess-2', confirmation: upl });
    kx.notePending({ browserKey: KEY_B, profileId: null, sessionId: 'sess-2', confirmation: { ...upl, action: 'click', target: null } });
    const out = kx.pendingFor(KEY_B, null).map((x) => x.action).join();
    kx.shutdown(); return out;
  };
  const gateLeg = async (Kimpl, name) => {
    const kx = mkK(Kimpl, name);
    kx.notePending({ browserKey: KEY_B, profileId: null, sessionId: 'sess-2', confirmation: upl });
    const n0 = confirms().length;
    const unknown = await kx.answerConfirmation({ browserKey: KEY_B, profileId: null, id: 'c_nothere', decision: 'confirm', envPairs: PAIRS });
    const forged = await kx.answerConfirmation({ browserKey: KEY_B, profileId: null, id: upl.id, decision: 'confirm', shown: T.confirmationDigest({ ...upl, action: 'click', target: null }), envPairs: PAIRS });
    const spawned = confirms().slice(n0).map((c) => c.verb + ' ' + c.id);
    kx.shutdown(); return { unknown: unknown.ok || unknown.code, forged: forged.ok || forged.code, spawned };
  };
  // the REAL keeper through the same legs (the legs are the controls' twins)
  const realFW = await firstWriteLeg(K, 'data10fw');
  const realGate = await gateLeg(K, 'data10g');
  ok(realFW === 'upload' && realGate.unknown === 'no_confirmation' && realGate.forged === 'confirmation_changed' && realGate.spawned.length === 0, '⑩ the REAL keeper over the control legs: the upload stays the card, an unknown id and a forged-card Confirm spawn nothing', JSON.stringify({ realFW, realGate }));
  // C2 first write wins reverted: the pre-fix notePending (the second record overwrites, silently)
  const nvLine = "    const nv = T.pendingNoteVerdict(held, confirmation);\n";
  ok(ksrc.split(nvLine).length === 2, '⑩ C2 setup: notePending asks pendingNoteVerdict once');
  const K2 = M10.load('src/server/browser-keeper.js', ksrc.replace(nvLine, "    const nv = { kind: 'new' }; // MUTANT: the pre-fix overwrite\n"), 'overwrite');
  const mutFW = await firstWriteLeg(K2, 'data10fwm');
  ok(mutFW === 'click', '⑩ CONTROL C2 (the pre-fix overwrite, in a copy): the forged record REPLACES the upload\'s card with "click" — first write wins is the rule', mutFW);
  // C3 the answer's gate removed: an id pending nowhere and a Confirm pressed on another card both reach upstream
  const gateLine = "    if (!gate.ok) { log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: ${a.decision} ${a.id} refused before upstream — ${gate.code}`); return gate; }\n";
  ok(ksrc.split(gateLine).length === 2, '⑩ C3 setup: answerConfirmation refuses on the gate once');
  const K3 = M10.load('src/server/browser-keeper.js', ksrc.replace(gateLine, ''), 'no-gate');
  const mutGate = await gateLeg(K3, 'data10gm');
  ok(mutGate.spawned.includes('confirm c_nothere') && mutGate.spawned.includes('confirm ' + upl.id), '⑩ CONTROL C3 (the answer\'s gate removed, in a copy): `confirm c_nothere` and the forged-card `confirm ' + upl.id + '` both reach upstream — the gate is the rule', JSON.stringify(mutGate));
  // C4 the Hand back echo removed: a press whose control said 1 hands back (and wakes 2)
  const echoLine = "    if (d.cause === 'explicit' && mirror) { const echo = T.handbackWakeEcho({ wakes: handbackWakesFor(browserKey, profileId), expect: expectWakes }); if (!echo.ok) { log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: handback refused (${echo.code}: ${echo.wakes} wake(s), the control said ${expectWakes})`); return echo; } }\n";
  ok(ksrc.split(echoLine).length === 2, '⑩ C4 setup: the explicit handback checks the echo once');
  const echoLeg = async (Kimpl, name) => {
    const kx = mkK(Kimpl, name);
    const sx = kx.createProfile({ label: 'Shared-' + name }, { owner: { kind: 'instance', id: null } });
    await kx.attach({ profileId: sx.id, browserKey: 'bk-000000a1', sessionId: 'sess-a1' }); await kx.attach({ profileId: sx.id, browserKey: 'bk-000000a2', sessionId: 'sess-a2' });
    kx.takeover({ browserKey: 'bk-000000a1', profileId: sx.id, viewerId: 1001, sessionId: 'sess-a1' });
    kx.resolveFor({ browserKey: 'bk-000000a2', verb: 'click' }); // the sibling's agent is refused while the user drives ⇒ it has something to re-run
    const wakes = kx.handbackWakesFor('bk-000000a1', sx.id);
    const r = kx.handback({ browserKey: 'bk-000000a1', profileId: sx.id, viewerId: 1001, cause: 'explicit', sessionId: 'sess-a1', expectWakes: 1 });
    const out = { wakes, ok: r.ok, code: r.code || null, input: kx.inputStateFor('bk-000000a1', sx.id).input };
    await kx.stop(sx.id).catch(() => { }); kx.shutdown(); return out;
  };
  const realEcho = await echoLeg(K, 'data10e');
  ok(realEcho.wakes === 2 && !realEcho.ok && realEcho.code === 'wake_count_changed' && realEcho.input === 'user', '⑩ the REAL keeper: a sibling with a refused click makes the count 2; a press that said 1 is refused, still driven', JSON.stringify(realEcho));
  const K4 = M10.load('src/server/browser-keeper.js', ksrc.replace(echoLine, ''), 'no-echo');
  const mutEcho = await echoLeg(K4, 'data10em');
  ok(mutEcho.ok === true && mutEcho.input === 'agent', '⑩ CONTROL C4 (the echo removed, in a copy): the press whose control said 1 hands back — 2 billed turns under a button that said 1; the echo is the rule', JSON.stringify(mutEcho));
  // WIRING PINS: the bridge pairs the command with its result and hands the keeper's view (never the raw parse) to the viewers;
  // the live view sends the digest of the row it drew and the count its button said
  const bs = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8'), lw = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/T\.confirmationFromUpstream\(msg, now\(\), \{ command: /.test(bs) && /if \(!unsubConfirm && view && !view\.conflict\) broadcast\(relay, view\)/.test(bs) && /else if \(ev\.kind === 'conflict'\) broadcast\(r, \{ type: 'confirmation-conflict'/.test(bs) && /shown: v\.shown/.test(bs) && /handbackFor\(relay, viewer\.id, 'explicit', v\.expectWakes\)/.test(bs), 'WIRING PIN (r6): the bridge pairs command → result, broadcasts only the keeper\'s first-written view, says a conflict as its own record, passes the digest and the count through');
  ok(/send\(\{ type: 'confirm', id, decision, shown: confirmationDigest\(c\) \}\)/.test(lw) && /st\.confirmSlots = confirmSlots\(/.test(lw) && !/confirms\.innerHTML = ''/.test(lw) && /expectWakes: st\.wakes/.test(lw) && /t\('Hand back \(wakes \{n\}\)'/.test(lw), 'WIRING PIN (r6): the live view confirms with the digest of the row it drew, keeps KEYED slots (no whole-card rebuild), and its Hand back carries and says the count');
  for (const r of copiesCensus(M10.files, M10.dir, REPO, { minCopies: 4, label: '⑩ ' })) ok(r.pass, r.name, r.detail);
}

keeper.shutdown();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
