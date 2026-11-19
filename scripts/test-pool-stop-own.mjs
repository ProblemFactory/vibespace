#!/usr/bin/env node
// test-pool-stop-own — B-f4a1 (lane bl-accounts; the owner's word 2026-11-18 14:48 PT, on the coordinator's recommendation):
// A STOP RE-DECIDES ONLY ITS OWN CONVERSATION, never the whole pool. Before it, every stop of a pooled conversation
// (noteTurnEnd / noteTurnStopped → maybePoolAutoSwitch {stop}) ran the WHOLE pass, so S conversations' stops cost S² decisions,
// each a full one (B-403e's first line, from the production hub's witness). The decision itself is unchanged: the stop's one
// decision reads through the same decision door as the pass (one ask per file per run, src/run-reads.js) — 主开发 01:20Z (a).
//   ① THE COUNT — S conversations with their own links (plan C), S stops ⇒ S decisions of their own and NO pool-default
//      decision. RED control: the release's form (a stop passes no `only`, a copy built through scratch.mjs anchored()) ⇒ S².
//   ② A FOLLOWER OF THE POOL DEFAULT (no link of its own): its stop IS the default's one decision — as the release.
//   ③ EVERY OTHER ROAD KEEPS THE WHOLE POOL — the forced pass (the new-member wake, a login, a released reset hold, a basis
//      flip, the pre-fire re-decision, a member removed), the 30 s tick, a kick: S decisions + the default's one.
//   ④ A STOP STILL MOVES ITS OWN CONVERSATION when its member is walled; another walled conversation waits for its own stop
//      or the tick — and the tick moves it.
//   ⑤ THE MONEY GATES ARE NOT LOOSENED — one stand-in day (invented members, invented readings; never the owner's data) run
//      through the release's decision and this one: every hour each conversation stops, then the 30 s tick passes; the
//      refusals (conversation, reason) and the pool's blocked notices are the SAME SETS, and every hour ends on the SAME
//      placements. The day is proven to refuse at all (its walls are reached).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const turn = () => new Promise((r) => setImmediate(r));
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };

const ENG_REL = 'src/server/usage-pool-engine.js';
const ENG_SRC = fs.readFileSync(path.join(REPO, ENG_REL), 'utf8');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const MINE = require(path.join(REPO, ENG_REL));
const MU = mutantCopies('pool-stop-own', REPO);
// THE RELEASE'S FORM: a stop passes no `only` — the whole pass, as before this unit (the control of ① and the other side of ⑤)
const RELEASE = MU.load(ENG_REL, anchored(ENG_SRC, '    const only = stop && session._webuiId ? session._webuiId : null;\n', '    const only = null;\n', 'the release: a stop passes the whole pool'), 'release-whole-pool');

const tok = (k) => ['tok', k, 'x'.repeat(8)].join('-');
const loginBody = (k) => JSON.stringify({ claudeAiOauth: { accessToken: tok('a' + k), refreshToken: tok('r' + k), expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } });

/** THE STAND-IN POOL: S conversations over M members (invented names, fake tokens built here), a HOT auto pool */
function world({ S, M, own = true, engMod = MINE, tag = 'w' }) {
  const root = scratchDir('pool-stop-own-' + tag);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const ids = [];
  for (let i = 0; i < M; i++) {
    const id = am.createSubscription({ name: `Member ${String.fromCharCode(65 + i)}` }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), loginBody(i), { mode: 0o600 });
    ids.push(id);
  }
  const P = am.createPool({ name: 'stand-in' }).id;
  am.setPoolTarget(P, ids[0]);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const said = { refusals: new Set(), notices: new Set() };
  const sessions = new Map();
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice(key) { if (/^pool-blocked-/.test(String(key))) said.notices.add(String(key).replace(/-\d+$/, '').split(P).join('P')); },   // the pool's id is each world's own: said as P
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => ({ noteNoPoolTarget(sid, n, reason) { said.refusals.add(`${sid}:${reason}`); }, fireNow() { return false; }, fireNowOnClaim() { return false; } }),
    getQuotaProbe: () => null, getUserTodos: () => null,
  });
  for (let k = 0; k < S; k++) {
    const sid = 'conv-' + k;
    sessions.set(sid, { backend: 'claude', mode: 'chat', _webuiId: sid, claudeSessionId: 'cid-' + k, _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), _isStreaming: false, _turnState: 'idle', pty: { write() { } }, name: sid });
    if (own) am.ensureSessionPoolLink(P, sid, ids[k % M]);
  }
  /** the readings this hour: utilization per member (0..1), five-hour window */
  const readings = (util) => { const nowS = Math.floor(Date.now() / 1000); ids.forEach((id, i) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 30e3, source: 'on-demand', fiveHour: { utilization: util[i], resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 5 * 86400 } }))); };
  readings(ids.map((_, i) => 0.1 + 0.05 * i));
  // the gates and the dwell belt are WALL-CLOCK: wound back between events instead of slept through (the engine's own seams)
  const wind = () => { eng._poolAutoLast.clear(); eng._poolSwitchAt.clear(); eng._poolEvalAt.clear(); };
  const tally = () => ({ ...(eng._poolDecisions.get(P) || { session: 0, pool: 0 }) });
  const placements = () => [...sessions.keys()].map((sid) => `${sid}=${ids.indexOf(am.poolCurrentFor(P, sid))}`).join(' ');
  return { root, am, eng, P, ids, sessions, said, readings, wind, tally, placements };
}
const stopAll = async (w) => { for (const s of w.sessions.values()) { await turn(); w.wind(); quiet(() => w.eng.noteTurnStopped(s)); } };

console.log('① THE COUNT — S conversations with their own links, S stops ⇒ S decisions (the release: S²)');
for (const [S, M] of [[6, 3], [12, 4]]) {
  const w = world({ S, M, tag: `count-${S}` }), r = world({ S, M, engMod: RELEASE, tag: `count-rel-${S}` });
  if (!w || !r) { ok(false, 'the pool is supported here (AccountManager.poolSupported)'); break; }
  await stopAll(w); await stopAll(r);
  const a = w.tally(), b = r.tally();
  ok(a.session === S && a.pool === 0, `S=${S}: ${S} stops ⇒ ${S} decisions of their own conversations and no pool-default decision (${JSON.stringify(a)})`, a);
  ok(b.session === S * S && b.pool === S, `CONTROL S=${S}: the release's whole pass on every stop ⇒ S² = ${S * S} conversation decisions + ${S} default ones (${JSON.stringify(b)})`, b);
}

console.log('② A FOLLOWER OF THE POOL DEFAULT: its stop IS the default\'s one decision (as the release)');
{
  const S = 5, w = world({ S, M: 3, own: false, tag: 'follow' }), r = world({ S, M: 3, own: false, engMod: RELEASE, tag: 'follow-rel' });
  await stopAll(w); await stopAll(r);
  const a = w.tally(), b = r.tally();
  ok(a.session === 0 && a.pool === S && b.session === 0 && b.pool === S, `${S} followers' stops ⇒ ${S} default decisions, none per conversation — the same count as the release (${JSON.stringify(a)} / ${JSON.stringify(b)})`, { a, b });
}

console.log('③ EVERY OTHER ROAD KEEPS THE WHOLE POOL');
{
  const S = 6, w = world({ S, M: 3, tag: 'whole' });
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  const f = w.tally();
  ok(f.session === S && f.pool === 1, `the forced pass (the new-member wake, a login, a released reset hold, a basis flip, the pre-fire re-decision, a member removed) decides all ${S} and the default (${JSON.stringify(f)})`, f);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P));
  const t = w.tally();
  ok(t.session === 2 * S && t.pool === 2, `the 30 s tick's pass (no force, no kick) decides all ${S} and the default again (${JSON.stringify(t)})`, t);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { kick: true }));
  const k = w.tally();
  ok(k.session === 3 * S && k.pool === 3, `a per-record kick with its gate open decides all ${S} and the default (${JSON.stringify(k)})`, k);
}

console.log('④ A STOP STILL MOVES ITS OWN CONVERSATION; another walled one waits for its own stop or the tick');
{
  const w = world({ S: 2, M: 3, tag: 'move' });
  const [s0, s1] = [...w.sessions.values()];
  w.am.ensureSessionPoolLink(w.P, 'conv-1', w.ids[0]);   // both on member A
  await turn(); w.readings([1.0, 0.1, 0.2]);   // A is walled
  await turn(); w.wind(); quiet(() => w.eng.noteTurnStopped(s0));
  const after0 = w.placements();
  ok(w.am.poolCurrentFor(w.P, 'conv-0') !== w.ids[0] && w.am.poolCurrentFor(w.P, 'conv-1') === w.ids[0], `conv-0's stop moved conv-0 off the walled member; conv-1 (walled too, not stopped) waits (${after0})`, after0);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  ok(w.am.poolCurrentFor(w.P, 'conv-1') !== w.ids[0], `the whole pass then moves conv-1 too (${w.placements()})`, w.placements());
  void s1;
}

console.log('⑤ THE MONEY GATES ARE NOT LOOSENED — one stand-in day through the release\'s decision and this one');
{
  // members A, B, C over 12 «hours»: each spends, all three are walled a while, the five-hour window resets
  const DAY = [
    [0.10, 0.20, 0.30], [0.55, 0.20, 0.30], [0.97, 0.40, 0.30], [1.00, 0.80, 0.35], [1.00, 1.00, 0.60], [1.00, 1.00, 1.00],
    [1.00, 1.00, 1.00], [0.05, 1.00, 1.00], [0.10, 0.05, 1.00], [0.30, 0.10, 0.05], [0.96, 0.98, 0.99], [0.20, 0.20, 0.20],
  ];
  const S = 5, w = world({ S, M: 3, tag: 'day' }), r = world({ S, M: 3, engMod: RELEASE, tag: 'day-rel' });
  const hours = [];
  for (const util of DAY) {
    for (const x of [w, r]) { await turn(); x.readings(util); }
    for (const x of [w, r]) await stopAll(x);
    for (const x of [w, r]) { await turn(); x.wind(); quiet(() => x.eng.maybePoolAutoSwitchForPool(x.P)); }   // the 30 s tick
    hours.push({ util: util.join('/'), mine: w.placements(), release: r.placements() });
  }
  const differ = hours.filter((h) => h.mine !== h.release);
  ok(differ.length === 0, `every hour of the day ends on the SAME placements in both (${hours.length} hours)`, differ.slice(0, 3));
  const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  ok(w.said.refusals.size > 0 && [...w.said.refusals].some((x) => /:(?:all-rejected|stuck|no-members|all-logins-expired|all-lapsed)$/.test(x)), `CONTROL: the day reaches its walls — conversations are refused (${[...w.said.refusals].length} refusal(s): ${[...w.said.refusals].slice(0, 4).join(', ')})`, [...w.said.refusals]);
  ok(eq(w.said.refusals, r.said.refusals), `the SAME refusals for the same reasons — (conversation, reason) as sets (${w.said.refusals.size} / ${r.said.refusals.size})`, { mine: [...w.said.refusals], release: [...r.said.refusals] });
  ok(eq(w.said.notices, r.said.notices), `the pool's blocked notices are the same set (${[...w.said.notices].join(', ') || 'none'})`, { mine: [...w.said.notices], release: [...r.said.notices] });
}

report();
