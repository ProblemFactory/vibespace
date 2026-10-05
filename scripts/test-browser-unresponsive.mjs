#!/usr/bin/env node
// lane browser-unresponsive (a fleet user's inc 2026-10-05: the shared "jarvis-work" answered 0 bytes for 80 min while every
// verb said "run the command again"): A BROWSER THAT DOES NOT ANSWER IS A NAMED STATE WITH ONE WAY OUT, NEVER A RETRY.
//   ① the PURE verdict table (src/browser-stuck.js browserAnswerVerdict)   ② the refusal words (en/zh/ja, since/minutes, the code flip)
//   ③ the restart admission table   ④ the REAL keeper on its REAL tick over a FAKE browser whose DevTools port accepts and never
//   answers (the measured shape): verdict ⇒ row fact + journal + ONE For-you ⇒ the agent's refusal flips ⇒ restart ⇒ the
//   other holder's card ⇒ cleared + resolved   ⑤ patched-copy controls (no verdict ⇒ "try again" forever; an ungated agent restart)
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const BS = require('../src/browser-stuck.js');
const TBS = require('../src/browser-tabs.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.UTC(2026, 9, 5, 16, 34, 0);

// ═══ ① THE PURE VERDICT TABLE ═══
console.log('— ① the verdict (browserAnswerVerdict)');
function table(V) {
  const r = {};
  r.answering = V.browserAnswerVerdict(null, { answered: true, at: T0 }).state === 'answering';
  const m1 = V.browserAnswerVerdict({ lastAnswerAt: T0 - 5000, since: null, asks: 0 }, { answered: false, at: T0 });
  r.oneMiss = m1.state === 'missing' && m1.next.since === T0 && m1.next.asks === 1 && m1.next.lastAnswerAt === T0 - 5000;
  const m2 = V.browserAnswerVerdict(m1.next, { answered: false, at: T0 + 30000 });
  r.twoUnder60 = m2.state === 'missing' && m2.next.asks === 2;
  const m3 = V.browserAnswerVerdict(m2.next, { answered: false, at: T0 + 60000 });
  r.hung = m3.state === 'unresponsive' && m3.next.since === T0 && m3.next.asks === 3;
  const one = V.browserAnswerVerdict(null, { answered: false, at: T0 }); const lone = V.browserAnswerVerdict({ ...one.next, asks: 0 }, { answered: false, at: T0 + 90000 });
  r.oneAskNever = lone.state === 'missing'; // ≥ 2 asks: one slow ask a minute apart is busy, not hung
  const c = V.browserAnswerVerdict(m3.next, { answered: true, at: T0 + 61000 });
  r.clears = c.state === 'answering' && c.cleared === true && c.next.since === null && c.next.lastAnswerAt === T0 + 61000;
  const g = V.browserAnswerVerdict(m3.next, { answered: false, at: T0 + 62000, pidAlive: false });
  r.goneIsClosed = g.state === 'closed' && g.next === null;
  return r;
}
const tb = table(BS);
ok(tb.answering, 'an answer ⇒ answering');
ok(tb.oneMiss, 'one miss ⇒ missing (since = that ask, lastAnswerAt kept, asks 1)');
ok(tb.twoUnder60, 'two misses under 60 s ⇒ still missing (busy ≠ hung)');
ok(tb.hung, '≥ 60 s across ≥ 2 asks while the pid lives ⇒ unresponsive {since, asks}');
ok(tb.oneAskNever, 'a single ask, however late, is never the verdict (≥ 2 asks)');
ok(tb.clears, 'an answer clears it (cleared, since null, lastAnswerAt = now)');
ok(tb.goneIsClosed, 'pid gone ⇒ closed (the closed path says it), never unresponsive');
ok(BS.UNRESPONSIVE_AFTER_MS === 60000 && BS.UNRESPONSIVE_MIN_ASKS === 2 && BS.ANSWER_ASK_MS === 3000, 'the numbers: 60 s, 2 asks, a 3 s ask');

// ═══ ② THE WORDS ═══
console.log('— ② the refusal words + the UI words');
const fact = { label: 'jarvis-work', since: T0, now: T0 + 87 * 60000, tabs: null };
const before = TBS.tabRefusalText('tabs_unreadable', { agent: true });
const after = TBS.tabRefusalText('tabs_unreadable', { agent: true, unresponsive: fact });
ok(/run the command again/.test(before), 'before the verdict (busy ≠ hung) the agent still reads tabs_unreadable\'s "run the command again"');
ok(/has not answered since 16:34 UTC \(87 min\)/.test(after) && /hung, not busy/.test(after) && /vibespace-browser restart/.test(after) && /Restart in the Browser panel/.test(after) && !/run the command again/.test(after), 'after it: the FACT (since 16:34, 87 min) + the recipe (restart / the user\'s Restart), never "try again"', after);
ok(TBS.TAB_REFUSALS.includes('browser_unresponsive') && TBS.tabRefusalText('browser_unresponsive', { agent: true, unresponsive: fact }) === after, 'browser_unresponsive is a closed-set refusal with the same words');
const routes = fs.readFileSync(new URL('../src/routes/browser.js', import.meta.url), 'utf8');
ok(/browser_unresponsive: 503, browser_answering: 409/.test(routes), 'the route STATUS names both codes');
const uw = BS.unresponsiveWords({ since: T0, label: 'jarvis-work', clock: '16:34' });
ok(uw.state === 'Not answering since 16:34' && uw.banner === 'jarvis-work has not answered since 16:34' && uw.action === 'Restart', 'the row\'s state word + the live banner + its Restart (en)', uw);
const zh = fs.readFileSync(new URL('../src/lib/i18n-zh.js', import.meta.url), 'utf8'), ja = fs.readFileSync(new URL('../src/lib/i18n-ja.js', import.meta.url), 'utf8');
const keys = ['Not answering since {clock}', 'browser not answering', '{label} has not answered since {clock}', 'The browser is not answering — Restart it from the Browser panel', 'Restart the browser that stopped answering — logins stay in the profile, its tabs are re-opened'];
ok(keys.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), 'every UI sentence has a zh and a ja entry');
const sw = BS.stuckWords({ state: 'unresponsive', why: 'browser', since: T0, label: 'jarvis-work', clock: '16:34' });
ok(sw.chip === 'browser not answering' && sw.line === uw.banner && sw.action === 'Restart', 'the chip / live banner (stuckWords) say the BROWSER, not "page not responding"');
const n = BS.unresponsiveNotice({ label: 'jarvis-work', since: T0, now: T0 + 87 * 60000 });
ok(/not answered since 16:34 UTC/.test(n.text) && /87 min/.test(n.detail) && /resolves itself/.test(n.detail), 'the For-you item\'s words (since, minutes, self-resolving)');

// ═══ ③ THE ADMISSION TABLE ═══
console.log('— ③ who may restart');
function admission(V) {
  const u = { since: T0, asks: 3 };
  return {
    user: V.restartAdmission({ by: 'user' }).ok && V.restartAdmission({ by: 'user', humanDriving: true }).ok,
    agentHung: V.restartAdmission({ by: 'agent', unresponsive: u }).ok,
    agentAnswering: V.restartAdmission({ by: 'agent', unresponsive: null }).code === 'browser_answering',
    agentDriven: V.restartAdmission({ by: 'agent', unresponsive: u, humanDriving: true }).code === 'take_over_first',
  };
}
const ad = admission(BS);
ok(ad.user, 'the user: always');
ok(ad.agentHung, 'an agent while the verdict stands: admitted');
ok(ad.agentAnswering, 'an agent while it answers: refused browser_answering');
ok(ad.agentDriven, 'an agent while a human drives: refused take_over_first');

// ═══ ④ THE REAL KEEPER ON ITS REAL TICK over a browser that accepts and never answers ═══
console.log('— ④ the real keeper over a hung DevTools port');
const ROOT = scratch('browser-unresponsive');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
// The fake agent-browser (the takeover suite's: a daemon that is a real `sleep`).
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
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + process.env.FAKE_CDP_PORT + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'get' && b === 'box') { out({ success: true, data: { x: 10, y: 20, width: 100, height: 30 } }); process.exit(0); }
if (a === 'record') { fs.appendFileSync(path.join(st, 'records.log'), JSON.stringify({ argv, ns, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n'); out({ success: true, data: {} }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
let hung = true; const socks = new Set();
const srv = net.createServer((s) => { socks.add(s); s.on('close', () => socks.delete(s)); s.on('error', () => { }); if (!hung) s.once('data', () => { const b = JSON.stringify({ Browser: 'Chrome/154.0.0.0' }); s.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${b.length}\r\nConnection: close\r\n\r\n${b}`); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
let keeper = null;
function cleanup() { try { keeper?.shutdown?.(); } catch { } for (const l of launches()) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } try { srv.close(); for (const s of socks) s.destroy(); } catch { } fs.rmSync(ROOT, { recursive: true, force: true }); }
process.on('exit', cleanup);
let clock = Date.now(); const now = () => clock;
const lines = []; const quiet = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
const todos = [], statuses = [];
const userTodos = { add: (k, it) => { const x = { id: 'ut-' + (todos.length + 1), status: 'open', ...it }; todos.push(x); return x; }, get: (id) => todos.find((x) => x.id === id) || null, setStatus: (id, st, by) => { statuses.push({ id, st, by }); const x = todos.find((y) => y.id === id); if (x) x.status = st; } };
const rtEnv = { FAKE_AB_STATE: AB_STATE, FAKE_CDP_PORT: String(PORT), PATH: PATH_ENV, HOME };
const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
keeper = K.create({ dataDir: path.join(ROOT, 'data'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null,
  liveKeys: () => new Set([KEY_A, KEY_B]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: quiet, now, install: false, tickMs: 100, answerAskMs: 250, userTodos });
const relaunch = []; keeper.onRelaunch((ev) => relaunch.push(ev));
const p = keeper.createProfile({ label: 'jarvis-work' }, { owner: { kind: 'instance', id: null } }); // int220: SHARED (the incident's case) — a second conversation holds it
try { keeper.updateProfile?.(p.id, {}); } catch { }
await keeper.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-a' });
let attachedB = true; try { await keeper.attach({ profileId: p.id, browserKey: KEY_B, sessionId: 'sess-b' }); } catch (e) { attachedB = false; }
ok(attachedB, 'a second conversation holds the shared browser (the restart below has another holder to tell)');
ok(keeper.browserOf(p.id) && keeper.browserOf(p.id).state === 'ready' && /:\d+\//.test(String(keeper.browserOf(p.id).cdpUrl || '')), 'the fake browser is ready, its CDP url on the hung loopback port', keeper.browserOf(p.id) && keeper.browserOf(p.id).state);
// the tick asks on its own; the injected clock moves 31 s between asks (each real ask times out after the gate's 250 ms)
const t0 = clock; let rounds = 0;
while (!keeper.browserOf(p.id).unresponsive && rounds < 12) { await sleep(450); clock += 31000; rounds++; }
const u = keeper.browserOf(p.id).unresponsive;
ok(u && u.since >= t0 && u.asks >= 2 && clock - u.since >= 60000, 'the REAL tick judged it: rec.unresponsive {since, asks ≥ 2} after ≥ 60 s of unanswered asks', { u, rounds });
ok(lines.some((l) => /not answering since \d\d:\d\d \(asks \d+, pid \d+ alive\) — browser_unresponsive; Restart offered/.test(l)), 'the journal line at the verdict', lines.filter((l) => /answer/.test(l)));
await sleep(450); clock += 31000; await sleep(450);
ok(todos.length === 1 && todos[0].action && todos[0].action.type === 'browser-restart' && todos[0].action.profileId === p.id && todos[0].origin === 'browser' && /has not answered since/.test(todos[0].text), 'ONE For-you item per (profile, since) — origin browser, its Restart act — not one per tick', todos.map((x) => x.text));
let ref = null; try { await keeper.agentTabAct({ browserKey: KEY_A, handle: '', argv: ['list'] }); } catch (e) { ref = e; }
ok(ref && ref.code === 'browser_unresponsive' && /has not answered since/.test(ref.message) && /vibespace-browser restart/.test(ref.message), 'the agent\'s `tab list` is refused browser_unresponsive with the fact + the recipe (never "run the command again")', ref && { code: ref.code, m: ref.message });
hung = false; // the relaunched browser answers
const r = await keeper.restartProfile(p.id, { by: 'agent', browserKey: KEY_A, sessionName: 'Research' });
ok(r && keeper.browserOf(p.id).state === 'ready' && !keeper.browserOf(p.id).unresponsive, 'an agent\'s restart while the verdict stands: stopped + started again, the fact cleared');
ok(statuses.some((s) => s.id === todos[0].id && s.st === 'done'), 'the For-you item resolved itself at the restart');
ok(attachedB ? relaunch.length === 1 && relaunch[0].browserKey === KEY_B && relaunch[0].outcome === 'restarted' && /restarted by the conversation "Research" because it had not answered since/.test(relaunch[0].text) : relaunch.length === 0, 'the OTHER holder is told by one card (the restarting conversation is not)', relaunch.map((e) => ({ k: e.browserKey, t: e.text })));
let ra = null; try { await keeper.restartProfile(p.id, { by: 'agent', browserKey: KEY_A }); } catch (e) { ra = e; }
ok(ra && ra.code === 'browser_answering', 'an agent restart of a browser that answers is refused browser_answering', ra && ra.code);
await sleep(600);
ok(!keeper.browserOf(p.id).unresponsive && todos.length === 1, 'answering: no verdict, no second item');

// ═══ ⑤ PATCHED-COPY CONTROLS (the suite's judges fail on the shipped bug shapes) ═══
console.log('— ⑤ patched-copy controls');
const MUT = path.join(ROOT, 'mut'); fs.mkdirSync(MUT, { recursive: true });
const bsSrc = fs.readFileSync(new URL('../src/browser-stuck.js', import.meta.url), 'utf8');
function mutant(name, from, to) { if (!bsSrc.includes(from)) return null; const f = path.join(MUT, name + '.js'); fs.writeFileSync(f, bsSrc.replace(from, to)); return require(f); }
const noVerdict = mutant('no-verdict', "return { state: hung ? 'unresponsive' : 'missing'", "return { state: false ? 'unresponsive' : 'missing'");
ok(noVerdict && table(noVerdict).hung === false && table(noVerdict).oneMiss === true, 'control: with no verdict the table\'s "≥ 60 s ⇒ unresponsive" row goes red (every refusal stays "run the command again")');
const ungated = mutant('ungated', "  if (by === 'user') return { ok: true };", "  return { ok: true };");
ok(ungated && admission(ungated).agentAnswering === false && admission(ungated).agentDriven === false, 'control: an ungated agent restart turns the "answering ⇒ refused" and "a human drives ⇒ refused" rows red');

console.log(`\n${fail ? '✗' : '✓'} test-browser-unresponsive: ${pass} passed, ${fail} failed`);
keeper.shutdown(); keeper = null;
process.exit(fail ? 1 : 0);
