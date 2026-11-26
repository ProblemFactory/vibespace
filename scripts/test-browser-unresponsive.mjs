#!/usr/bin/env node
// lane browser-unresponsive (a fleet user's inc 2026-10-05: the shared "jarvis-work" answered 0 bytes for 80 min while every
// verb said "run the command again"): A BROWSER THAT DOES NOT ANSWER IS A NAMED STATE WITH ONE WAY OUT, NEVER A RETRY.
//   ① the PURE verdict table (src/browser-stuck.js browserAnswerVerdict)   ② the refusal words (en/zh/ja, since/minutes, the code flip)
//   ③ the restart admission table   ④ the REAL keeper on its REAL tick over a FAKE browser whose DevTools port accepts and never
//   answers (the measured shape): verdict ⇒ row fact + journal + ONE For-you ⇒ the agent's refusal flips ⇒ restart ⇒ the
//   other holder's card ⇒ cleared + resolved   ⑤ patched-copy controls (no verdict ⇒ "try again" forever; an ungated agent restart)
//   ⑦ lane browser-daemon-survives-update (B-1574, userW's four freezes): A RESTART JUDGES THE PAGE'S ANSWERS — the PURE page
//   verdict + the admission rows, then the REAL keeper over a stub browser whose endpoint answers (/json/version, /json/list)
//   and whose pages accept a socket and never answer (the measured hung renderer): no verdict from the tick, the agent's
//   restart ADMITTED and journalled with why; one page answering ⇒ refused naming both; the driver's timeouts with every
//   page answering ⇒ admitted; a dialog ⇒ refused with its door; CONTROL the pre-fix keeper copy refuses browser_answering
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
// lane browser-daemon-survives-update: THE PAGE VERDICT (pageAnswerVerdict) + the admission rows that read it
{
  const A = { targetId: 'A1A1A1A1A1A1A1A1', url: 'https://mail.example/inbox' }, Bp = { targetId: 'B2B2B2B2B2B2B2B2', url: 'https://docs.example/d/1' };
  const pv = (list, pages, extra = {}) => BS.pageAnswerVerdict({ list, pages, ...extra });
  const rows = {
    unasked: BS.pageAnswerVerdict(null).state === 'unasked',
    noList: pv(false, [], { error: 'timeout' }).why === 'no-list' && pv(false, []).state === 'hung',
    noPages: pv(true, []).state === 'answering' && pv(true, []).why === 'no-pages',
    noneAnswered: pv(true, [{ ...A, answered: false, reached: true }, { ...Bp, answered: false }]).why === 'no-page-answered',
    oneAnswered: pv(true, [{ ...A, answered: true }, { ...Bp, answered: false }]).state === 'answering',
    bound: pv(true, [{ ...A, answered: false }], { boundMs: 400 }).boundMs === 400 && BS.pageAnswerVerdict({ list: true, pages: [] }).boundMs === BS.PAGE_ANSWER_MS,
  };
  ok(Object.values(rows).every(Boolean) && BS.PAGE_ANSWER_MS === 5000, 'the page verdict table: unasked / the list unanswered ⇒ hung / no page ⇒ answering / no page\'s renderer answered (its history did) ⇒ hung / one answered ⇒ answering; the bound (5 s) rides the verdict', rows);
  const hung = pv(true, [{ ...A, answered: false }, { ...Bp, answered: false }]), some = pv(true, [{ ...A, answered: true }, { ...Bp, answered: false }]), all = pv(true, [{ ...A, answered: true }, { ...Bp, answered: true }]);
  const ag = (o) => BS.restartAdmission({ by: 'agent', label: 'jarvis-work', ...o });
  const t = {
    pagesHung: ag({ pages: hung }).ok === true && ag({ pages: hung }).why === 'no-page-answered',
    listHung: ag({ pages: pv(false, [], { error: 'connect ECONNREFUSED 127.0.0.1:9' }) }).why === 'no-list',
    someAnswer: ag({ pages: some }).code === 'browser_answering',
    allAnswer: ag({ pages: all }).code === 'browser_answering',
    driver: ag({ pages: all, stuck: { state: 'unresponsive', why: 'timeouts', count: 3 } }).why === 'driver',
    driverNotOnSilent: ag({ pages: some, stuck: { state: 'unresponsive', why: 'timeouts', count: 3 } }).code === 'browser_answering',
    dialogHeld: ag({ pages: hung, stuck: { state: 'dialog' } }).code === 'browser_answering' && /a page dialog holds your tab/.test(ag({ pages: hung, stuck: { state: 'dialog' } }).error),
    humanFirst: ag({ pages: hung, humanDriving: true }).code === 'take_over_first',
    browserVerdictFirst: ag({ unresponsive: { since: T0, asks: 3 }, pages: all }).why === 'browser',
  };
  ok(Object.values(t).every(Boolean), 'the admission rows: no page answers (or no list) ⇒ admitted — WHATEVER the endpoint said; a page that answers ⇒ refused; every page answers but the agent\'s last commands timed out through the driver ⇒ admitted (driver); a dialog ⇒ held, refused; a person driving first; the keeper\'s own verdict first', t);
  const w = ag({ pages: some }).error;
  ok(/1 of 2 pages answered within 5 s \(A1A1A1A1 "https:\/\/mail\.example\/inbox"\); 1 did not \(B2B2B2B2 "https:\/\/docs\.example\/d\/1"\) — close a tab that does not answer: `vibespace-browser tab close <tab>`/.test(w), 'the refusal NAMES what answered and what did not, and the door for the one that did not', w);
}

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
const writeState = (s) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(s)); fs.renameSync(t, f); };   // the fake's state by a temp file of its own process and a rename: no verb's read meets a torn file when two of its processes run at once (lane bl-loop-b, 主开发 r5152)
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
// mirror-green-220: FAKE_CLOSER — the daemon is a real process whose chrome (a child holding the profile's lock) closes (the leg ends it between ticks); \`get cdp-url\` relaunches it in that daemon (0.38.1's heal) and names a port nobody listens on
if (process.env.FAKE_CLOSER === '1' && a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn(process.execPath, ['-e', process.env.FAKE_DAEMON_SRC], { detached: true, stdio: 'ignore', env: process.env }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; writeState(s); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: {} }); process.exit(0); }
if (process.env.FAKE_CLOSER === '1' && a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } try { process.kill(s.pid, 'SIGUSR2'); } catch { } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120); out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + process.env.FAKE_CDP_PORT + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; writeState(s); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
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
const probed = []; // lane browser-stderr-pipe: the pids the keeper asked /proc about
const lines = []; const quiet = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
const todos = [], statuses = [];
const userTodos = { add: (k, it) => { const x = { id: 'ut-' + (todos.length + 1), status: 'open', ...it }; todos.push(x); return x; }, get: (id) => todos.find((x) => x.id === id) || null, setStatus: (id, st, by) => { statuses.push({ id, st, by }); const x = todos.find((y) => y.id === id); if (x) x.status = st; } };
const rtEnv = { FAKE_AB_STATE: AB_STATE, FAKE_CDP_PORT: String(PORT), PATH: PATH_ENV, HOME };
const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
keeper = K.create({ dataDir: path.join(ROOT, 'data'), homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null,
  liveKeys: () => new Set([KEY_A, KEY_B]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: quiet, now, install: false, tickMs: 100, answerAskMs: 250, userTodos,
  stderrPipeProbe: async (pid) => { probed.push(pid); return { pid, fd2: 'pipe:[351497172]', wchans: ['anon_pipe_write', 'anon_pipe_write'] }; } }); // lane browser-stderr-pipe: the measured base facts
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
// lane browser-stderr-pipe: the verdict asked /proc WHY (once per run) — a Chrome blocked on its unread log pipe is NAMED
ok(probed.length === 1 && Number.isInteger(probed[0]) && keeper.browserOf(p.id).unresponsive.cause === 'stderr-pipe-full', 'the keeper names the cause: rec.unresponsive.cause = stderr-pipe-full (one /proc probe per run)', { probed, u: keeper.browserOf(p.id).unresponsive });
ok(lines.some((l) => /stderr-pipe-full — Chrome pid \d+ is blocked writing its log into pipe:\[351497172\] that nothing reads/.test(l)), 'the journal line names it (the incident bundle reads the journal)');
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
// B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file (then null: the control's own
// row reds too, nothing crashes)
function mutant(name, from, to) {
  const n = bsSrc.split(from).length - 1;
  if (n !== 1) { ok(false, `ANCHOR (${name}, src/browser-stuck.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the control builds nothing`); return null; }
  const f = path.join(MUT, name + '.js'); fs.writeFileSync(f, bsSrc.replace(from, to)); return require(f);
}
const noVerdict = mutant('no-verdict', "return { state: hung ? 'unresponsive' : 'missing'", "return { state: false ? 'unresponsive' : 'missing'");
ok(noVerdict && table(noVerdict).hung === false && table(noVerdict).oneMiss === true, 'control: with no verdict the table\'s "≥ 60 s ⇒ unresponsive" row goes red (every refusal stays "run the command again")');
const ungated = mutant('ungated', "  if (by === 'user') return { ok: true };", "  return { ok: true };");
ok(ungated && admission(ungated).agentAnswering === false && admission(ungated).agentDriven === false, 'control: an ungated agent restart turns the "answering ⇒ refused" and "a human drives ⇒ refused" rows red');

// ═══ ⑥ mirror-green-220: A CLOSED-AGAIN BROWSER INSIDE ITS RELAUNCH LOOP IS NEVER JUDGED UNRESPONSIVE ═══
// The .220 Actions mirror (heavy 3/4, twice): B-47f9's slow closer — a chrome that closes after every relaunch, 4 min apart on
// the keeper's clock, its DevTools port refusing — filed "has not answered since …" instead of the unstable notice: the
// misses of each RELAUNCHED chrome (another pid) were added to the closed one's. Fake clock, 14 leased ticks over a real
// daemon whose chrome keeps closing (ended between ticks): relaunched every tick, 0 verdicts, 0 notices; a patched copy without the guard files one.
// B-1217 (主开发 r5169, the 2.369.420 third hosted run's red then green): the leg used to end the chrome named LAST in the fake daemon's
// pid log — a log the daemon writes AFTER it spawns, so under load it lagged one relaunch: the leg ended a pid already dead while
// the keeper had recorded the new, LIVE chrome, which then refused two asks 4 min apart — a TRUE verdict of that world (the leg's,
// never the product's). PLACED by a hold of the log (scratch probe 0f10fc5b9, run 0f10fc5b9-20261126161003-UTC: the hosted red's
// exact shape twice). Now the leg ends EVERY chrome the daemon runs (its children, from the process table) and WAITS ON THAT FACT
// — each gone and reaped — before each tick; a tick where it does not hold within its bound is a NAMED SKIP, never judged.
console.log('— ⑥ a closed-again browser inside its relaunch loop (fake clock, 14 ticks)');
const CHROME_SRC = "const fs=require('fs'),path=require('path'),os=require('os');const d=(process.argv.find((x)=>x.startsWith('--user-data-dir='))||'').slice(16);fs.mkdirSync(d,{recursive:true});const L=path.join(d,'SingletonLock');try{fs.unlinkSync(L)}catch{}fs.symlinkSync(os.hostname()+'-'+process.pid,L);fs.writeFileSync(path.join(d,'DevToolsActivePort'),'1\\n/devtools/browser/x\\n');setInterval(()=>{},1e9);";
const DAEMON_SRC = "const {spawn}=require('child_process'),fs=require('fs'),path=require('path');let cur=null;const d=process.env.AGENT_BROWSER_PROFILE;const H=process.env.FAKE_LOG_HOLD||'';const go=()=>{cur=spawn(process.execPath,['-e',process.env.FAKE_CHROME_SRC,'--','--user-data-dir='+d],{stdio:'ignore',env:{}});const pid=cur.pid;const w=()=>{if(H&&fs.existsSync(H))return setTimeout(w,5);fs.appendFileSync(path.join(process.env.FAKE_AB_STATE,'chromes.log'),pid+'\\n');};w();};process.on('SIGUSR2',()=>{if(!cur||cur.exitCode!==null||cur.signalCode!==null)go();});go();setInterval(()=>{},1e9);";
const deadSrv = net.createServer(); await new Promise((r) => deadSrv.listen(0, '127.0.0.1', r)); const DEAD_PORT = deadSrv.address().port; await new Promise((r) => deadSrv.close(r));
const KEY_C = 'bk-0000000c';
const goneSoon = async (pid) => { for (let i = 0; i < 100 && fs.existsSync('/proc/' + pid); i++) await sleep(10); }; // dead AND reaped by its daemon
// B-1217: the chromes the daemon RUNS — its children from the process table (a zombie is not running; /proc/<pid>/task/<pid>/children,
// else a scan of /proc for the parent) — never the daemon's own pid log, which it writes after the spawn
const zombieP = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return t.slice(t.lastIndexOf(')') + 2)[0] === 'Z'; } catch { return false; } };
const kidsOf = (pid) => { let t = null; try { t = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8'); } catch { t = null; }
  if (t != null) return t.trim().split(/\s+/).filter(Boolean).map(Number);
  const out = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); if (Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]) === pid) out.push(Number(d)); } catch { /* gone */ } } return out; };
const runningKids = (pid) => kidsOf(pid).filter((k) => fs.existsSync('/proc/' + k) && !zombieP(k));
// B-1217 (主开发 r5231, THE KILL LAW): a signal goes ONLY to a pid that is, at the signal, a RUNNING child of a daemon that is ALIVE and is
// THIS leg's own — its environment carries the leg's own state folder (FAKE_AB_STATE=<st>): an identity, never a name or a pattern; the
// daemon itself is ended by the product's stop, and only if it still carries that identity after it is it ended here
const envOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0'); } catch { return null; } };
const ownDaemon = (pid, st) => Number.isInteger(pid) && pid > 1 && fs.existsSync('/proc/' + pid) && !zombieP(pid) && (envOf(pid) || []).includes('FAKE_AB_STATE=' + st);
const daemonsIn = (st) => { let t = ''; try { t = fs.readFileSync(path.join(st, 'launches.log'), 'utf8'); } catch { return []; } return t.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).pid).filter((d) => ownDaemon(d, st)); };
const ownRunning = (st) => daemonsIn(st).flatMap(runningKids);
const endOwnSync = (st, pid) => { if (!ownRunning(st).includes(pid)) return false; try { process.kill(pid, 'SIGKILL'); return true; } catch { return false; } };
const closerStates = new Set();   // every leg's state folder: at the suite's exit, what is still its own is ended by the same law
process.on('exit', () => { for (const st of closerStates) { try { for (const x of ownRunning(st)) endOwnSync(st, x); for (const d of daemonsIn(st)) { try { process.kill(d, 'SIGKILL'); } catch { /* gone */ } } } catch { /* best effort at exit */ } } });
async function closerLeg(Kmod, tag, ticks = 14, { killBy = 'running', lagAt = -1 } = {}) {
  const st = path.join(ROOT, 'closer-' + tag); fs.mkdirSync(st, { recursive: true }); closerStates.add(st);
  const HOLD = path.join(st, 'log-hold');   // B-1217: the PLACED lag — while it exists the daemon does not log the pid it spawned
  const env = { ...rtEnv, FAKE_AB_STATE: st, FAKE_CLOSER: '1', FAKE_CDP_PORT: String(DEAD_PORT), FAKE_CHROME_SRC: CHROME_SRC, FAKE_DAEMON_SRC: DAEMON_SRC, FAKE_LOG_HOLD: HOLD };
  let c = Date.now(); const items = [], jl = [];
  const store = { add: (k, it) => { const x = { id: 'uc-' + (items.length + 1), status: 'open', ...it }; items.push(x); return x; }, get: (id) => items.find((x) => x.id === id) || null, setStatus() { } };
  const jlog = (m) => jl.push(String(m));
  const kk = Kmod.create({ dataDir: path.join(st, 'data'), homeDir: HOME, env: () => env, broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null,
    liveKeys: () => new Set([KEY_C]), runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log: jlog, warn: jlog, error: jlog }, now: () => c, install: false, tickMs: 3600e3, answerAskMs: 250, userTodos: store });
  const r = { tag, killBy, verdicts: 0, skips: 0, judged: 0, lag: null };
  // r5231: the end of a chrome — only a running child of this leg's own live daemon, at the signal; then waited until gone and reaped
  const endOwn = async (pid) => { if (!endOwnSync(st, pid)) return false; await goneSoon(pid); return true; };
  const endAllRunning = async (rounds) => { const ended = []; for (let k = 0; k < rounds; k++) { const now = ownRunning(st); if (!now.length) break; for (const x of now) if (await endOwn(x) && !ended.includes(x)) ended.push(x); } return { ended, left: ownRunning(st) }; };
  try {
    const q = kk.createProfile({ label: 'Closer ' + tag }, { owner: { kind: 'instance', id: null } });
    await kk.attach({ profileId: q.id, browserKey: KEY_C, sessionId: 'sess-c' });
    const chromes = () => fs.readFileSync(path.join(st, 'chromes.log'), 'utf8').trim().split('\n').map(Number);
    for (let i = 0; i < ticks; i++) {
      const running = ownRunning(st), logged = chromes(), last = logged[logged.length - 1]; let ended = [], held = true;
      // the shipped end: the chrome the daemon's LOG names last — signalled only while it is a running child of this leg's own daemon
      // (r5231: under the placed lag it is not, so nothing is signalled; the live chrome is never ended either way)
      if (killBy === 'log') { if (await endOwn(last)) ended = [last]; }
      else {
        // THE FACT the tick judges: the browser is closed — every chrome the daemon runs ended AND reaped (its daemon has seen it go)
        for (let k = 0; k < 100; k++) { const now = ownRunning(st); if (!now.length) break; for (const x of now) if (await endOwn(x) && !ended.includes(x)) ended.push(x); }
        held = !ownRunning(st).length && !ended.some((x) => fs.existsSync('/proc/' + x));
      }
      // the placed lag's WITNESS: at the tick after it, the pid the log names is not a chrome the daemon was running
      if (i === lagAt + 1) { r.lag = { logged: last || null, running, inForce: running.length > 0 && !running.includes(last) }; try { fs.unlinkSync(HOLD); } catch { } }
      if (i === lagAt) fs.writeFileSync(HOLD, '');
      if (!held) { r.skips++; continue; }   // the browser was not closed before this tick: a NAMED SKIP — no tick of a world the leg did not make
      c += 4 * 60000; await kk.tick();
      r.judged++; if (kk.browserOf(q.id).unresponsive) r.verdicts++;
    }
    r.chromes = chromes().length;
    r.closed = (kk.browserOf(q.id).closed || {}).code || null;
    r.notices = items.filter((x) => x.action && x.action.type === 'browser-restart').map((x) => x.text);
    r.lines = jl.filter((l) => /not answering since/.test(l)).length;
    r.endSweep = await endAllRunning(5);   // r5231: BEFORE the product's stop — the daemon alive, its running children its own, each reaped
    await kk.stop(q.id).catch(() => { });
  } catch (e) { r.threw = String(e && e.stack); try { r.endSweep = await endAllRunning(5); } catch { /* the exit's own sweep follows */ } }
  kk.shutdown();
  try { fs.unlinkSync(HOLD); } catch { /* lifted */ }
  // the daemon is the product's stop's to end; one that still carries this leg's identity after it is ended here (and said)
  r.daemonsLeft = daemonsIn(st);
  for (const d of r.daemonsLeft) { try { process.kill(d, 'SIGKILL'); } catch { /* gone */ } await goneSoon(d); }
  return r;
}
const cl = await closerLeg(K, 'fixed');
const sayLeft = (x) => { if (x.endSweep && x.endSweep.left.length) console.log(`  NOTE ⑥ ${x.tag}: ${x.endSweep.left.length} chrome(s) of the leg still running after its end sweep`); if (x.daemonsLeft && x.daemonsLeft.length) console.log(`  NOTE ⑥ ${x.tag}: its daemon outlived the product's stop and was ended by its identity`); };
sayLeft(cl);
if (cl.skips) console.log(`  SKIP (named, counted): ⑥ ${cl.skips} of ${cl.skips + cl.judged} ticks — the browser was not closed before the tick within the bound (a chrome of the daemon still running); the leg ticked the other ${cl.judged}`);
ok(!cl.threw && cl.judged >= 6 && cl.chromes >= 6 && cl.verdicts === 0 && cl.notices.length === 0 && cl.lines === 0, `⑥ a closed-again browser inside its relaunch loop is never judged unresponsive: ${cl.chromes} chromes in 14 ticks 4 min apart (each relaunched one refused its ask; every chrome the daemon ran ended and reaped before the tick), ${cl.verdicts} verdicts over ${cl.judged} judged ticks, ${cl.notices.length} notices, ${cl.lines} journal lines (then \`${cl.closed}\`)`, cl);
// B-1217: the same with the daemon's pid log PLACED one relaunch behind at tick 3 — the leg ends what the daemon runs, not what it logged
const cg = await closerLeg(K, 'fixed-lag', 14, { lagAt: 3 });
sayLeft(cg);
if (cg.skips) console.log(`  SKIP (named, counted): ⑥ lag ${cg.skips} of ${cg.skips + cg.judged} ticks — the browser was not closed before the tick within the bound; the leg ticked the other ${cg.judged}`);
ok(!cg.threw && cg.judged >= 6 && !!cg.lag && cg.lag.inForce === true && cg.verdicts === 0 && cg.notices.length === 0 && cg.lines === 0, `⑥ B-1217: with the daemon's pid log placed one relaunch behind (its witness: the logged pid ${cg.lag && cg.lag.logged} was not among the chromes it ran, ${JSON.stringify(cg.lag && cg.lag.running)}) the leg still ends the browser and the keeper judges nothing (${cg.verdicts} verdicts over ${cg.judged} judged ticks)`, cg);
// RED (B-1217): the shipped kill — by the log — under the same placed lag: the live chrome is never ended and refuses two asks 4 min
// apart: one TRUE verdict of that world (the hosted red's shape); judged only on its witness that the lag was in force
const cr = await closerLeg(K, 'log-lag', 6, { killBy: 'log', lagAt: 3 });
if (!(cr.lag && cr.lag.inForce)) console.log(`  SKIP (named, counted): ⑥ RED — the placed lag was not in force at tick 4 (${JSON.stringify(cr.lag)}): no judgement`);
else ok(!cr.threw && cr.verdicts >= 1, `⑥ RED (B-1217): the shipped end by the daemon's pid log under the placed lag names the dead pid ${cr.lag.logged} (never signalled: it is no running chrome of the leg's daemon) while ${JSON.stringify(cr.lag.running)} runs, never ended — ${cr.verdicts} verdict(s): the leg's own world, never the product's`, cr);
// the control: the keeper's guard removed (the .220 shape — the asks chained across processes, a closed record asked)
const kSrc = fs.readFileSync(new URL('../src/server/browser-keeper.js', import.meta.url), 'utf8');
const SRV = path.dirname(new URL('../src/server/browser-keeper.js', import.meta.url).pathname);
const G_FROM = 'const v = BS.browserAnswerVerdict(replaced ? null : known, { answered, at, pidAlive: running });';
const G_TO = 'const v = BS.browserAnswerVerdict(known, { answered, at, pidAlive: Number.isInteger(pid) && F.pidAlive(pid) });';
if (kSrc.includes(G_FROM)) {
  const mf = path.join(MUT, 'keeper-unguarded.js');
  fs.writeFileSync(mf, kSrc.replace(G_FROM, G_TO).replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, rel) => 'require(' + JSON.stringify(path.resolve(SRV, rel)) + ')'));
  const cm = await closerLeg(require(mf), 'unguarded', 4);   // the cure's kill (every chrome the daemon runs)
  sayLeft(cm); if (cm.skips) console.log(`  SKIP (named, counted): ⑥ CONTROL ${cm.skips} of ${cm.skips + cm.judged} ticks — the browser was not closed before the tick; the control ticked the other ${cm.judged}`);
  ok(!cm.threw && cm.verdicts > 0 && cm.notices.length >= 1 && /has not answered since/.test(cm.notices[0]), `⑥ CONTROL: a keeper copy without the guard judges the closing-again browser unresponsive (${cm.verdicts} verdict ticks) and files "${cm.notices && cm.notices[0]}" — the leg above can go red`, cm);
} else ok(false, '⑥ CONTROL: the guarded verdict call was not found in src/server/browser-keeper.js');

// ═══ ⑦ lane browser-daemon-survives-update: THE REAL KEEPER — a restart judges the page's answers ═══
console.log('— ⑦ a restart judges the page\'s answers (a stub browser: its endpoint answers, its pages do not)');
{
  const http = require('http');
  const { WebSocketServer } = require('ws');
  const PAGES = [{ id: 'A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1', url: 'https://mail.example/inbox' }, { id: 'B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2', url: 'https://docs.example/d/1' }];
  const answering = new Set(); // the pages whose renderer answers; the rest accept a socket and say nothing (the measured hung renderer)
  let STUB = 0; const socks = new Set();
  const stub = http.createServer((req, res) => {
    const body = String(req.url).startsWith('/json/list') ? JSON.stringify(PAGES.map((x) => ({ id: x.id, type: 'page', url: x.url, title: x.url, webSocketDebuggerUrl: `ws://127.0.0.1:${STUB}/devtools/page/${x.id}` }))) : JSON.stringify({ Browser: 'Chrome/154.0.0.0' });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(body);
  });
  const wss = new WebSocketServer({ noServer: true });
  stub.on('upgrade', (req, sock, head) => { const id = String(req.url).split('/').pop(); wss.handleUpgrade(req, sock, head, (ws) => { socks.add(ws); ws.on('close', () => socks.delete(ws)); ws.on('message', (m) => { if (!answering.has(id)) return; let j = null; try { j = JSON.parse(String(m)); } catch { return; } ws.send(JSON.stringify({ id: j.id, result: j.method === 'Runtime.evaluate' ? { result: { type: 'number', value: 2 } } : { currentIndex: 0, entries: [] } })); }); }); });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r)); STUB = stub.address().port;
  async function pagesLeg(Kmod, tag, { answer = [], stuck = null } = {}) {
    const st = path.join(ROOT, 'pages-' + tag); fs.mkdirSync(st, { recursive: true });
    const env = { ...rtEnv, FAKE_AB_STATE: st, FAKE_CDP_PORT: String(STUB) };
    answering.clear(); for (const id of answer) answering.add(id);
    const jl = []; const jlog = (m) => jl.push(String(m));
    const kk = Kmod.create({ dataDir: path.join(st, 'data'), homeDir: HOME, env: () => env, broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null,
      liveKeys: () => new Set([KEY_A, KEY_B]), runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log: jlog, warn: jlog, error: jlog }, install: false, tickMs: 3600e3, answerAskMs: 250, pageAnswerMs: 400 });
    const r = { tag };
    try {
      const q = kk.createProfile({ label: 'jarvis-work' }, { owner: { kind: 'instance', id: null } });
      await kk.attach({ profileId: q.id, browserKey: KEY_A, sessionId: 'sess-a' });
      if (stuck) kk.setStuckSource((bk) => (bk === KEY_A ? { ...stuck, profileId: q.id } : null));
      await kk.tick(); await kk.tick();
      r.judged = !!kk.browserOf(q.id).unresponsive; r.pid0 = kk.browserOf(q.id).pid;
      const t0 = Date.now();
      try { await kk.restartProfile(q.id, { by: 'agent', browserKey: KEY_A, sessionName: 'Research' }); r.restarted = true; } catch (e) { r.refused = { code: e.code, message: e.message }; }
      r.ms = Date.now() - t0; r.pid1 = kk.browserOf(q.id).pid; r.state1 = kk.browserOf(q.id).state;
      r.lines = jl.filter((l) => /restart/.test(l));
      await kk.stop(q.id).catch(() => { });
    } catch (e) { r.threw = String(e && e.stack); }
    kk.shutdown();
    let t = ''; try { t = fs.readFileSync(path.join(st, 'launches.log'), 'utf8'); } catch { } for (const l of t.trim().split('\n').filter(Boolean)) { try { process.kill(JSON.parse(l).pid, 'SIGKILL'); } catch { } }
    return r;
  }
  const [A1, B2] = PAGES.map((x) => x.id);
  const silent = await pagesLeg(K, 'silent');
  ok(!silent.threw && !silent.judged && silent.restarted && silent.state1 === 'ready' && silent.pid1 !== silent.pid0 && silent.lines.some((l) => /restarted by the conversation "Research" — none of its 2 page\(s\) answered within 0\.4 s/.test(l)),
    `⑦ the endpoint answers, NO page does: the tick never judged it (its /json/version answers) — the agent's restart is ADMITTED on the pages' answers, the browser started again (daemon ${silent.pid0} → ${silent.pid1}, ${silent.ms} ms), the journal says why`, silent);
  const one = await pagesLeg(K, 'one', { answer: [A1] });
  ok(!one.threw && one.refused && one.refused.code === 'browser_answering' && /1 of 2 pages answered within 0\.4 s \(A1A1A1A1 "https:\/\/mail\.example\/inbox"\); 1 did not \(B2B2B2B2 "https:\/\/docs\.example\/d\/1"\)/.test(one.refused.message) && one.pid1 === one.pid0 && one.lines.some((l) => /restart refused browser_answering \(its pages: pages, 1 answered, 1 did not\)/.test(l)),
    '⑦ one page answers: refused browser_answering NAMING what answered and what did not (+ the tab-close door), nothing restarted, the journal says it', one);
  const drv = await pagesLeg(K, 'driver', { answer: [A1, B2], stuck: { state: 'unresponsive', why: 'timeouts', count: 3, since: Date.now() - 90000 } });
  ok(!drv.threw && drv.restarted && drv.lines.some((l) => /every page answered, but the agent's last commands timed out through the browser driver/.test(l)), '⑦ every page answers but the agent\'s last 3 commands timed out through the driver (the dialog watch\'s fact): ADMITTED — the page answers, its helper does not', drv);
  const dlg = await pagesLeg(K, 'dialog', { stuck: { state: 'dialog', since: Date.now() } });
  ok(!dlg.threw && dlg.refused && dlg.refused.code === 'browser_answering' && /a page dialog holds your tab: it is held, not hung/.test(dlg.refused.message) && /dialog accept/.test(dlg.refused.message), '⑦ a page dialog holds the tab (no page answers its renderer): held, not hung — refused with its own door, the dialog kept', dlg);
  const fine = await pagesLeg(K, 'all', { answer: [A1, B2] });
  ok(!fine.threw && fine.refused && /2 of 2 pages answered/.test(fine.refused.message), '⑦ every page answers: refused browser_answering (2 of 2 named)', fine.refused);
  // CONTROL — the pre-fix restart (a keeper copy that judges the keeper's own endpoint verdict alone): the incident's refusal
  const R_FROM = '        pages = BS.pageAnswerVerdict(await askPages(rec));\n';
  if (kSrc.includes(R_FROM)) {
    const mf = path.join(MUT, 'keeper-endpoint-only.js');
    fs.writeFileSync(mf, kSrc.replace(R_FROM, '').replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, rel) => 'require(' + JSON.stringify(path.resolve(SRV, rel)) + ')'));
    const ctl = await pagesLeg(require(mf), 'pre-fix');
    ok(!ctl.threw && ctl.refused && ctl.refused.code === 'browser_answering' && ctl.pid1 === ctl.pid0, `⑦ CONTROL: the pre-fix keeper (no page asked) refuses the same hung pages browser_answering — "${ctl.refused && ctl.refused.message}" — the leg above can go red`, ctl);
  } else ok(false, '⑦ CONTROL: the page ask was not found in src/server/browser-keeper.js');
  for (const x of socks) { try { x.terminate(); } catch { } }
  await new Promise((r) => stub.close(r));
}

console.log(`\n${fail ? '✗' : '✓'} test-browser-unresponsive: ${pass} passed, ${fail} failed`);
keeper.shutdown(); keeper = null;
process.exit(fail ? 1 : 0);
