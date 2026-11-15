// THE TURN-STATEMENT CONFORMANCE RUN (lane usage-every-change, law 1 — the owner 2026-11-14: «每次发生变动…都必须能跟踪新的用量是
// 多少，这样闲置再久也能知道准确的剩余用量»). For every registered harness, a STUB turn's quota statement is driven down BOTH roads —
// the hub's (its stream reaching the engine / the stream-wall road) and a paired machine's (the device feed, the device's usage
// walk) — and each leg is judged against the harness's OWN declaration (quota.turnStatement, src/harnesses/null-quota.js): a
// statement that states a reading must end as a reading ON THE BILLED ACCOUNT carrying the declared time (the record's own, or its
// arrival when the record has none); a road the harness declares it CANNOT state on, and a harness that states nothing, must
// store nothing. In-process, no CLI, no server, no vendor: the real engine (src/server/usage-pool-engine.js) over a stub roster,
// the real stream-wall road, the real walker over a fixture rollout. Legs red TODAY are named in OWED (test-harness-contract
// holds that table both ways: red while owed, green once cured — a leg not driven yet is red, never a skip).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** THE OWED TABLE — the legs red today, each with the pick that cures it. A cured leg leaves this table in the commit that cures it. */
export const OWED = Object.freeze({
  'codex/hub/own-time': 'pick 4 — a reading is stored at its record\'s own time (today: its arrival)',
  'antigravity/hub/replay-reads-once': 'pick 4 — a wall replayed after a restart never fires a second `agy -p /usage` (the one-per-wall ruling)',
  'claude/hub/replay-by-request': 'pick 4 — a replayed statement is filed by the request it answered (the readings-attribution choke point), never a borrowed stamp',
  'any/hub/skewed-never-wins': 'pick 4 — a skewed stream\'s stored reading never beats a newer one (the stream\'s clock offset first)',
});

const NEAR_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every stored time of one account cache (window measuredAt + the file's fetchedAt), and whether a reading is there at all. */
function storedOf(cacheDir, key) {
  let o = null; try { o = JSON.parse(fs.readFileSync(path.join(cacheDir, key + '.json'), 'utf8')); } catch { return null; }
  const times = [];
  for (const l of (o && o.limits) || []) for (const w of l.windows || []) if (Number.isFinite(w.measuredAt)) times.push(w.measuredAt);
  for (const k of ['fiveHour', 'sevenDay']) if (o && o[k] && Number.isFinite(o[k].measuredAt)) times.push(o[k].measuredAt);
  if (!times.length && Number.isFinite(o && o.fetchedAt)) times.push(o.fetchedAt);
  return { times, at: times.length ? Math.max(...times) : null };
}
const filesIn = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; } };

/** ONE world: a fresh cache dir, the real engine over a stub roster (the test-quota-source §6 pattern), the stream-wall road. */
function mkWorld(REPO) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turnstmt-'));
  const cacheDir = path.join(dir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const ROSTER = {
    'sub-1': { id: 'sub-1', name: 'Claude A', type: 'subscription', backend: 'claude' },
    'cxs-1': { id: 'cxs-1', name: 'Codex A', type: 'subscription', backend: 'codex' },
    'cxs-2': { id: 'cxs-2', name: 'Codex B', type: 'subscription', backend: 'codex' },
    'cxs-3': { id: 'cxs-3', name: 'Codex C', type: 'subscription', backend: 'codex' },
    'agy-1': { id: 'agy-1', name: 'Agy A', type: 'subscription', backend: 'antigravity' },
  };
  const accounts = {
    get: (id) => ROSTER[id] || null, list: () => ({ accounts: Object.values(ROSTER) }),
    poolCurrentFor: () => null, poolCurrent: () => null, poolMembers: () => [],
    subCredsPath: (id) => path.join(dir, 'nope', id), sessionPoolLinkPath: () => path.join(dir, 'nope-link'),
  };
  const sessions = new Map();
  let ledger = null; // the world's UsageHistory, once a leg makes one (ledgerOf)
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1,
    broadcastToSession() { }, serverNotice() { }, serverSetting() { return undefined; }, getAccounts: () => accounts, getHosts: () => null,
    getUsageHistory: () => ledger, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
  });
  const harnesses = require(path.join(REPO, 'src/harnesses/index.js'));
  const SW = require(path.join(REPO, 'src/server/stream-wall.js'));
  const logs = [];
  const mkRoad = (door = null) => SW.createStreamWallRoad({ harnessOf: (id) => harnesses.get(id), cacheDir, door, now: () => Date.now(), log: (l) => logs.push(l) });
  const brain = require(path.join(REPO, 'src/server/session-brain.js')).create({ engine: eng, applyTaskToolUpdate() { }, updateSessionTodos() { }, getUsageHistory: () => ({ _cost: () => 0 }) });
  const session = (o) => { const s = { mode: 'chat', host: null, pty: { write() { } }, name: 'turn', ...o }; sessions.set(s._webuiId, s); return s; };
  return { dir, cacheDir, eng, harnesses, mkRoad, brain, session, logs, setLedger: (uh) => { ledger = uh; }, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } } };
}

const nowS = () => Math.floor(Date.now() / 1000);
const claudeRec = () => ({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.42, resetsAt: nowS() + 3 * 86400 } });
const codexPayload = () => ({ type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 12, window_minutes: 10080, resets_at: nowS() + 3 * 86400 } } });
const agyNotice = (ts) => ({ ts, type: 'acp', kind: 'notice', level: 'error', text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 90h39m34s.', noticeKind: 'agy-error' });
const plainEnd = (ts) => ({ ts, type: 'acp', kind: 'prompt_end', promptId: 'p-1', stopReason: 'end_turn' });

/** A stored reading judged against a turn: on the billed key only, and at the declared time. */
function judge(w, key, { t0, t1, recAt, stamp }) {
  const st = storedOf(w.cacheDir, key);
  const others = filesIn(w.cacheDir).filter((k) => k !== key);
  const reading = !!(st && st.at != null);
  const ownTime = !reading ? false : stamp === 'record' ? st.times.some((t) => Math.abs(t - recAt) <= NEAR_MS) : st.times.some((t) => t >= t0 - NEAR_MS && t <= t1 + NEAR_MS);
  return { reading, ownTime, at: st && st.at, recAt, others };
}

/** A fixture codex rollout per thread on a paired machine's disk ({tid, parent?, stmts?: [{ago, used}]}) → its walk (the module
 *  the device daemon runs): the event lines, how many carried a statement, the newest statement's time. */
function walkedRollout(w, REPO, threads, { walk = true } = {}) {
  const home = path.join(w.dir, 'dev-home');
  const d = path.join(home, '.codex', 'sessions', '2026', '11', '15'); fs.mkdirSync(d, { recursive: true });
  let recAt = 0;
  for (const t of threads) {
    const stmts = t.stmts || [{ ago: 2000, used: 12 }];
    const t0 = new Date(Date.now() - 10000).toISOString();
    const meta = { id: t.tid, cwd: '/tmp/turn', cli_version: '0.153.4' };
    if (t.parent) meta.source = { subagent: { thread_spawn: { parent_thread_id: t.parent, depth: 1 } } };
    const rows = [{ timestamp: t0, type: 'session_meta', payload: meta }, { timestamp: t0, type: 'turn_context', payload: { turn_id: 't1', model: 'gpt-5.6-sol', cwd: '/tmp/turn' } }];
    let tot = 0;
    for (const st of stmts) {
      const at = Date.now() - st.ago; recAt = Math.max(recAt, at);
      // `kind`: 'heartbeat' = a token_count with no usage; 'repeat' = the last totals again (both book no row — the check's must 2)
      if (st.kind !== 'repeat' && st.kind !== 'heartbeat') tot += 15;
      const rl = { ...(st.lim ? { limit_id: st.lim } : {}), primary: { used_percent: st.used, window_minutes: 10080, resets_at: nowS() + 3 * 86400 }, secondary: null, plan_type: 'plus', ...(st.reached ? { rate_limit_reached_type: 'primary' } : {}) };
      const info = st.kind === 'heartbeat' ? null : { last_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, total_tokens: 15 }, total_token_usage: { total_tokens: tot } };
      rows.push({ timestamp: new Date(at).toISOString(), type: 'event_msg', payload: { type: 'token_count', info, rate_limits: rl } });
    }
    fs.writeFileSync(path.join(d, `rollout-2026-11-15T00-00-00-${t.tid}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  if (!walk) return { home, recAt };
  const { runUsageWalk } = require(path.join(REPO, 'src/usage-walker.js'));
  const r = runUsageWalk({ home, cursorFile: path.join(w.dir, 'dev-cursor.json'), codexSessionsDir: path.join(home, '.codex', 'sessions'), projectsDir: path.join(home, '.claude', 'projects') });
  const lines = (r.events || []).slice();
  const events = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { home, recAt, lines, text: lines.join('\n'), events: events.length, carried: events.filter((e) => e.be === 'codex' && e.rl).length };
}
/** One limit of an account's stored reading: its 7-day number, its own time, the file's time (null when the limit is not held) */
function limitOf(w, key, lim) {
  let o = null; try { o = JSON.parse(fs.readFileSync(path.join(w.cacheDir, key + '.json'), 'utf8')); } catch { return null; }
  const l = ((o && o.limits) || []).find((x) => x && x.limitId === lim); if (!l) return null;
  const wk = (l.windows || []).find((x) => x && x.kind === '7d') || {};
  return { pct: wk.usedPct == null ? null : Math.round(Number(wk.usedPct) * 100) / 100, at: Math.max(Number(l.fetchedAt) || 0, Number(wk.measuredAt) || 0), fileAt: Number(o.fetchedAt) || 0 };
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= NEAR_MS;
/** The hub's ledger (src/usage-history.js) in the world, its statements handed to the world's engine — server.js's one wiring */
function ledgerOf(w, REPO, home = null) {
  const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
  const uh = new UsageHistory({ dataDir: path.join(w.dir, 'hub-data'), homeDir: home || path.join(w.dir, 'hub-home') });
  uh.codexSessionsDir = path.join(home || path.join(w.dir, 'hub-home'), '.codex', 'sessions');
  uh.setStatementSink((st) => w.eng.fileCodexStatement(st));
  w.setLedger(uh);
  return uh;
}
/** One finished agy turn's `usage` record as the wrapper journals it (agy-turn-usage turnUsage: the turn = the delta road) */
const agyUsage = (at, sid = 'conv-agt') => ({ ts: new Date(at).toISOString(), type: 'acp', kind: 'usage', sessionId: sid, total: { input: 1500, output: 160, thinking: 70, cacheRead: 9000, total: 1660 }, turn: { input: 500, output: 60, thinking: 30, cacheRead: 4000, total: 560, calls: null }, last: null, model: 'gemini-4-argon-high', modelFrom: 'agy', durationSeconds: 5 });
/** The ledger's antigravity rows, read the way its readers read them — its aggregate (how many) and its id lookup (the rows
 *  asked for); never its shard files (a tool in scripts/ that lists them is a shard writer to test-cache-bounds §32) */
async function agyRowsOf(uh, rids = []) {
  const agg = await uh.aggregateAsync({ backend: 'antigravity' });
  const rows = []; for (const rid of rids) { const r = await uh.eventForRid(rid); if (r) rows.push(r); }
  return { n: Number(agg && agg.totals && agg.totals.requests) || 0, rows };
}
/** «matches 2» (the 02:55Z ruling): a statement whose weekly window contradicts its target and matches TWO other accounts is
 *  archived — the tie is never broken (no write anywhere). `matches` 1 is the control: the same world re-files to that one.
 *  `stampWindow(cacheDir, key, stamp)` establishes an account's window: the CALLER's (a suite) — the `.window-` stamp has ONE
 *  writer and its callers are a census (test-oat-identity §9a) that a tool in scripts/ may not join. */
function tieLeg(w, REPO, matches, stampWindow) {
  if (typeof stampWindow !== 'function') throw new Error('no stampWindow given — the tie legs need the suite\'s window stamper');
  const R1 = nowS() + 2 * 86400, R2 = nowS() + 5 * 86400;
  for (const k of ['cxs-1', 'cxs-2', 'cxs-3']) fs.writeFileSync(path.join(w.cacheDir, k + '.json'), JSON.stringify({ fetchedAt: 1 }));
  stampWindow(w.cacheDir, 'cxs-1', { sevenDay: R1 });
  stampWindow(w.cacheDir, 'cxs-2', { sevenDay: R2 });
  stampWindow(w.cacheDir, 'cxs-3', { sevenDay: matches === 2 ? R2 : R1 + 86400 });
  const r = w.eng.fileCodexStatement({ acct: 'cxs-1', ts: Date.now() - 2000, rl: { primary: { used_percent: 33, window_minutes: 10080, resets_at: R2 } } });
  const fetched = (k) => { try { return JSON.parse(fs.readFileSync(path.join(w.cacheDir, k + '.json'), 'utf8')).fetchedAt; } catch { return null; } };
  return { r, written: ['cxs-1', 'cxs-2', 'cxs-3'].filter((k) => fetched(k) !== 1) };
}

/** THE DRIVERS: one stub turn per harness and road → what the store holds. `null` = this harness has no driver (a red leg). */
const DRIVERS = {
  claude: {
    async hub(w) { const s = w.session({ backend: 'claude', _webuiId: 'w-cl', _accountId: 'sub-1' }); const t0 = Date.now(); await w.eng.recordRateLimitEvent(s, claudeRec()); await sleep(30); return judge(w, 'sub-1', { t0, t1: Date.now(), stamp: 'arrival' }); },
    async device(w) { const s = w.session({ backend: 'claude', _webuiId: 'w-cld', host: 'h1', _accountId: 'sub-1' }); const t0 = Date.now(); w.brain.claudeSideEffects(s, 'w-cld', claudeRec()); await sleep(30); return judge(w, 'sub-1', { t0, t1: Date.now(), stamp: 'arrival' }); },
  },
  codex: {
    async hub(w) { const s = w.session({ backend: 'codex', _webuiId: 'w-cx', _accountId: 'cxs-1' }); const recAt = Date.now() - 2000; const t0 = Date.now(); await w.eng.recordCodexQuotaSignal(s, codexPayload(), { timestamp: new Date(recAt).toISOString() }); await sleep(30); return judge(w, 'cxs-1', { t0, t1: Date.now(), recAt, stamp: 'record' }); },
    // the paired machine's road for codex is its usage walk (chat on a dial device is refused; terminal mode has no wrapper): a
    // rollout whose token_count carries rate_limits, walked by the device's walker, ingested by the hub's ledger
    // (ingestRemoteEvents for host 'h1'), its last statement filed by the engine's store-only door (fileCodexStatement)
    async device(w, REPO) {
      const tid = 'cccccccc-0000-4000-8000-000000000001';
      const x = walkedRollout(w, REPO, [{ tid }]);
      const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: tid, acct: 'cxs-1', ts: x.recAt - 60000 });
      await uh.ingestRemoteEvents('h1', 'Host one', x.text);
      return { ...judge(w, 'cxs-1', { t0: x.recAt, t1: Date.now(), recAt: x.recAt, stamp: 'record' }), carried: x.carried, events: x.events };
    },
    // the owner ladder of a walked statement (law 4), each a leg of its own
    extra: {
      // a thread VibeSpace spawned on the machine's OWN login (attributed, acct null) ⇒ THAT machine's login, never the hub's
      async 'device/host-own-login'(w, REPO) {
        const tid = 'cccccccc-0000-4000-8000-000000000002';
        const x = walkedRollout(w, REPO, [{ tid }]);
        const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: tid, acct: null, ts: x.recAt - 60000 });
        await uh.ingestRemoteEvents('h1', 'Host one', x.text);
        const host = storedOf(w.cacheDir, '__global_codex__.h1'), files = filesIn(w.cacheDir);
        return { green: !!(host && host.times.some((t) => Math.abs(t - x.recAt) <= NEAR_MS)) && files.length === 1, why: "a machine-login thread's statement is filed on '__global_codex__.h1' at its record's time, and nowhere else", detail: { files } };
      },
      // a subagent thread (its session_meta names its parent) ⇒ the parent thread's account
      async 'device/subagent-to-parent'(w, REPO) {
        const par = 'cccccccc-0000-4000-8000-00000000000a', kid = 'cccccccc-0000-4000-8000-00000000000b';
        const x = walkedRollout(w, REPO, [{ tid: kid, parent: par }]);
        const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: par, acct: 'cxs-2', ts: x.recAt - 60000 });
        await uh.ingestRemoteEvents('h1', 'Host one', x.text);
        const j = judge(w, 'cxs-2', { t0: x.recAt, t1: Date.now(), recAt: x.recAt, stamp: 'record' });
        return { green: j.reading && j.ownTime && !j.others.length, why: "a subagent's statement is filed on its parent's account", detail: j };
      },
      // a thread VibeSpace never saw (no attribution, no meta) ⇒ not tracked: nothing is filed anywhere (law 6)
      async 'device/unseen-not-tracked'(w, REPO) {
        const x = walkedRollout(w, REPO, [{ tid: 'cccccccc-0000-4000-8000-000000000003' }]);
        const uh = ledgerOf(w, REPO);
        await uh.ingestRemoteEvents('h1', 'Host one', x.text);
        const files = filesIn(w.cacheDir), said = uh._lastStatements || null;
        return { green: x.carried === 1 && files.length === 0 && !!said && said.untracked === 1 && said.filed === 0, why: 'an unseen thread files nothing and is counted as not tracked', detail: { files, said } };
      },
      // the hub's OWN walk over its own disk: the same statement, the same store
      async 'hub/walk-reading'(w, REPO) {
        const tid = 'cccccccc-0000-4000-8000-000000000004';
        const x = walkedRollout(w, REPO, [{ tid }], { walk: false });
        const uh = ledgerOf(w, REPO, x.home); uh.recordAttribution({ sid: tid, acct: 'cxs-1', ts: x.recAt - 60000 });
        await uh.scan({ force: true }); uh.flushCursors(); // the cursors on disk before the world is removed (no writer retry outlives it)
        const j = judge(w, 'cxs-1', { t0: x.recAt, t1: Date.now(), recAt: x.recAt, stamp: 'record' });
        return { green: j.reading && j.ownTime && !j.others.length, why: "the hub's walk files the thread's last statement on its account at the record's time", detail: j };
      },
      // THE CHECK'S MUST 2: a token_count that states rate limits but books no row — a heartbeat; the last totals again with
      // «limit reached» — is still its statement: filed at its own time (the number the owner sees at a wall), never a ledger row
      async 'device/statement-only-lines'(w, REPO) {
        const H = 'cccccccc-0000-4000-8000-0000000000d1', Q = 'cccccccc-0000-4000-8000-0000000000d2';
        const t0 = Date.now();
        const x = walkedRollout(w, REPO, [{ tid: H, stmts: [{ ago: 30000, used: 55 }, { ago: 20000, used: 58, kind: 'heartbeat' }] }, { tid: Q, stmts: [{ ago: 30000, used: 97 }, { ago: 20000, used: 97, kind: 'repeat', reached: true }] }]);
        const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: H, acct: 'cxs-1', ts: t0 - 120000 }); uh.recordAttribution({ sid: Q, acct: 'cxs-2', ts: t0 - 120000 });
        await uh.ingestRemoteEvents('h1', 'Host one', x.text);
        const h = limitOf(w, 'cxs-1', 'codex'), q = limitOf(w, 'cxs-2', 'codex');
        const agg = await uh.aggregateAsync({ backend: 'codex' });
        return { green: !!h && h.pct === 58 && near(h.at, t0 - 20000) && !!q && q.pct === 100 && near(q.at, t0 - 20000) && Number(agg && agg.totals && agg.totals.requests) === 2,
          why: "a heartbeat's statement (58 %) and a «limit reached» repeat's (100 %) are filed at their own time; the ledger still holds the two requests only", detail: { h, q, rows: agg && agg.totals && agg.totals.requests } };
      },
      // THE CHECK'S MUST 1: one account states TWO limit ids; each limit's last statement is filed at its own time, in BOTH orders
      async 'device/two-limits-both-orders'(w, REPO) {
        const P = 'codex', O = 'codex_bengalfox', res = {};
        for (const [acct, tid, stmts] of [
          // the limit met FIRST holds the walk's NEWEST statement — the plan in one order, the other limit in the other
          ['cxs-1', 'cccccccc-0000-4000-8000-0000000000c1', [{ ago: 50000, used: 30, lim: P }, { ago: 40000, used: 5, lim: O }, { ago: 20000, used: 41, lim: P }]],
          ['cxs-2', 'cccccccc-0000-4000-8000-0000000000c2', [{ ago: 50000, used: 5, lim: O }, { ago: 30000, used: 41, lim: P }, { ago: 20000, used: 9, lim: O }]],
        ]) {
          const t0 = Date.now();
          const x = walkedRollout(w, REPO, [{ tid, stmts }]);
          const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: tid, acct, ts: t0 - 120000 });
          await uh.ingestRemoteEvents('h1', 'Host one', x.text);
          const ago = (lim) => stmts.filter((q) => q.lim === lim).slice(-1)[0];
          const p = limitOf(w, acct, P), o = limitOf(w, acct, O);
          res[acct] = { p, o, said: uh._lastStatements, ok: !!p && !!o && p.pct === ago(P).used && o.pct === ago(O).used && near(p.at, t0 - ago(P).ago) && near(o.at, t0 - ago(O).ago) && near(p.fileAt, Math.max(p.at, o.at)) && uh._lastStatements && uh._lastStatements.filed === 2 };
          fs.rmSync(path.join(w.dir, 'dev-home'), { recursive: true, force: true }); fs.rmSync(path.join(w.dir, 'hub-data'), { recursive: true, force: true });
        }
        return { green: res['cxs-1'].ok && res['cxs-2'].ok, why: "both limits of one account are filed — each at its own last statement and its own time, whichever limit the walk met first; the file's time is the newest of them; the walk says «filed: 2»", detail: res };
      },
      // …and ACROSS WALKS: a later walk's statement older than the file (another limit's newer reading) is still its limit's news;
      // the same batch again is «no news», never «filed»
      async 'device/two-limits-across-walks'(w, REPO) {
        const X = 'cccccccc-0000-4000-8000-0000000000c3', Y = 'cccccccc-0000-4000-8000-0000000000c4';
        const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: X, acct: 'cxs-1', ts: Date.now() - 120000 }); uh.recordAttribution({ sid: Y, acct: 'cxs-1', ts: Date.now() - 120000 });
        const t0 = Date.now();
        const a = walkedRollout(w, REPO, [{ tid: X, stmts: [{ ago: 10000, used: 41, lim: 'codex' }] }]);
        await uh.ingestRemoteEvents('h1', 'Host one', a.text);
        const b = walkedRollout(w, REPO, [{ tid: Y, stmts: [{ ago: 30000, used: 9, lim: 'codex_bengalfox' }] }]); // X's rollout stays as written: the walk reads it again, unchanged
        await uh.ingestRemoteEvents('h1', 'Host one', b.text);
        const said2 = uh._lastStatements;
        await uh.ingestRemoteEvents('h1', 'Host one', b.text);
        const said3 = uh._lastStatements;
        const p = limitOf(w, 'cxs-1', 'codex'), o = limitOf(w, 'cxs-1', 'codex_bengalfox');
        return { green: !!p && !!o && p.pct === 41 && o.pct === 9 && near(o.at, t0 - 30000) && near(p.fileAt, t0 - 10000) && said2.filed === 1 && said2.noNews === 1 && said3.filed === 0 && said3.noNews === 2,
          why: "a later walk's statement of the OTHER limit, older than the file's time, is filed at its own time (the file keeps its newest); the same batch again says «no news: 2», never «filed»", detail: { p, o, said2, said3 } };
      },
      // the LAST statement of a thread is the one filed; a batch sent again (an older one) never moves it back
      async 'device/last-wins'(w, REPO) {
        const tid = 'cccccccc-0000-4000-8000-000000000005';
        const x = walkedRollout(w, REPO, [{ tid, stmts: [{ ago: 5000, used: 10 }, { ago: 2000, used: 30 }] }]);
        const uh = ledgerOf(w, REPO); uh.recordAttribution({ sid: tid, acct: 'cxs-1', ts: x.recAt - 60000 });
        await uh.ingestRemoteEvents('h1', 'Host one', x.text);
        const older = x.lines.filter((l) => /"o":/.test(l)).slice(0, 1).join('\n');
        await uh.ingestRemoteEvents('h1', 'Host one', older);
        let o = null; try { o = JSON.parse(fs.readFileSync(path.join(w.cacheDir, 'cxs-1.json'), 'utf8')); } catch { }
        const pct = o && o.sevenDay ? o.sevenDay.usedPercent : null;
        return { green: pct === 30 && Math.abs((Number(o && o.fetchedAt) || 0) - x.recAt) <= NEAR_MS, why: "the newest statement by the record's own time stays (30 %, not the resent 10 %)", detail: { pct, fetchedAt: o && o.fetchedAt, recAt: x.recAt } };
      },
    },
  },
  antigravity: {
    async hub(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-ag', _accountId: 'agy-1', _spawnModel: 'gemini-4-argon-high' }); const recAt = Date.now() - 2000; const t0 = Date.now(); w.mkRoad(null).onRecord(s, agyNotice(new Date(recAt).toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return judge(w, 'agy-1', { t0, t1: Date.now(), recAt, stamp: 'record' }); },
    // the turn with NO wall: wall-only states nothing
    async hubPlain(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-ag2', _accountId: 'agy-2', _spawnModel: 'gemini-4-argon-high' }); const t0 = Date.now(); w.mkRoad(null).onRecord(s, plainEnd(new Date().toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return judge(w, 'agy-2', { t0, t1: Date.now(), stamp: 'record' }); },
    async device(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-agd', host: 'h1', _accountId: null, _spawnModel: 'gemini-4-argon-high' }); const before = filesIn(w.cacheDir).length; w.mkRoad(null).onRecord(s, agyNotice(new Date().toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return { reading: filesIn(w.cacheDir).length > before, ownTime: false, others: [] }; },
    // pick 3 (law 5): a finished turn's own record → ONE ledger row on its named account; the screen counts them since a read
    extra: {
      async 'hub/turn-row'(w, REPO) {
        const uh = ledgerOf(w, REPO);
        const s = w.session({ backend: 'antigravity', _webuiId: 'w-agt', _accountId: 'agy-1', backendSessionId: 'conv-agt', _spawnModel: 'gemini-4-argon-high' });
        const rec = agyUsage(Date.now() - 2000);
        w.eng.noteTurnRow(s, rec); w.eng.noteTurnRow(s, rec); // the same record read twice before a walk
        await uh.scan({ force: true }); uh.flushCursors();
        w.eng.noteTurnRow(s, rec); // …and once more after it was committed
        await uh.scan({ force: true }); uh.flushCursors();
        const got = await agyRowsOf(uh, [`antigravity:conv-agt:${Date.parse(rec.ts)}:1660`]), r = got.rows[0] || {};
        return { green: got.n === 1 && got.rows.length === 1 && r.acct === 'agy-1' && r.ts === Date.parse(rec.ts) && r.i === 500 && r.cr === 4000 && r.o === 60 && r.sid === 'conv-agt' && filesIn(w.cacheDir).length === 0,
          why: "one ledger row per finished turn on its named account, at the record's time (the record read three times: one row) — and no reading is made of it", detail: { rows: got.n, r, files: filesIn(w.cacheDir) } };
      },
      // THE CHECK'S MUST 3: a booked turn row is not lost by a restart — the stop commits the rows that wait (server.js
      // shutdownNow → UsageHistory.flushTurnRows); the next process's ledger holds it once, and a walk after adds nothing
      async 'hub/turn-row-survives-restart'(w, REPO) {
        const uh = ledgerOf(w, REPO);
        const s = w.session({ backend: 'antigravity', _webuiId: 'w-agr2', _accountId: 'agy-1', backendSessionId: 'conv-agr2' });
        const rec = agyUsage(Date.now() - 2000, 'conv-agr2');
        w.eng.noteTurnRow(s, rec);
        const flushed = uh.flushTurnRows(); // what shutdownNow does — then the process is gone
        const uh2 = ledgerOf(w, REPO); // the next boot: a new history over the same data folder
        await uh2.scan({ force: true }); uh2.flushCursors();
        const got = await agyRowsOf(uh2, [`antigravity:conv-agr2:${Date.parse(rec.ts)}:1660`]);
        const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), stop = srv.slice(srv.indexOf('function shutdownNow()'), srv.indexOf('\n}\n', srv.indexOf('function shutdownNow()')));
        return { green: flushed === 1 && got.n === 1 && got.rows.length === 1 && /usageHistory\.flushTurnRows\(\)/.test(stop),
          why: 'a turn booked and not yet walked survives the stop (shutdownNow commits the queue) — one row in the next process, none added by its walk', detail: { flushed, n: got.n, wired: /usageHistory\.flushTurnRows\(\)/.test(stop) } };
      },
      async 'hub/turn-row-named-only'(w, REPO) {
        const uh = ledgerOf(w, REPO);
        const own = w.session({ backend: 'antigravity', _webuiId: 'w-ago', _accountId: null, backendSessionId: 'conv-ago' });
        const s = w.session({ backend: 'antigravity', _webuiId: 'w-agu', _accountId: 'agy-1', backendSessionId: 'conv-agu' });
        w.eng.noteTurnRow(own, agyUsage(Date.now() - 3000, 'conv-ago'));
        w.eng.noteTurnRow(s, { ...agyUsage(Date.now() - 2000, 'conv-agu'), turn: null });
        await uh.scan({ force: true }); uh.flushCursors();
        const got = await agyRowsOf(uh);
        return { green: got.n === 0, why: "the machine's own login (no account VibeSpace can name) and a turn agy could not split book nothing", detail: { rows: got.n } };
      },
      // THE SCREEN'S FACT through the REAL route: GET /api/usage's homeAccounts row says how many turns ran since the last read
      async 'hub/turns-since-on-screen'(w, REPO) {
        const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
        const am = new AccountManager({ dataDir: path.join(w.dir, 'am-data') });
        const a = am.createHomeSubscription('antigravity', { name: 'Agy turns' });
        const uh = ledgerOf(w, REPO);
        const readAt = Date.now() - 60000;
        fs.writeFileSync(path.join(w.cacheDir, a.id + '.json'), JSON.stringify({ fetchedAt: readAt, source: 'cli-usage', limits: [{ limitId: 'gemini', name: 'Gemini Models', windows: [{ kind: '7d', minutes: 10080, usedPct: 30, resetsAt: nowS() + 86400, measuredAt: readAt }] }] }));
        const s = w.session({ backend: 'antigravity', _webuiId: 'w-agn', _accountId: a.id, backendSessionId: 'conv-agn' });
        for (const at of [readAt - 30000, readAt + 10000, readAt + 20000]) w.eng.noteTurnRow(s, { ...agyUsage(at, 'conv-agn'), total: { input: 1500, output: 160, thinking: 70, cacheRead: 9000, total: at } });
        await uh.scan({ force: true }); uh.flushCursors();
        const routes = {};
        const app = { get: (p0, h) => { routes['GET ' + p0] = h; }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
        const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
        const quiet = console.log; console.log = () => { };
        try {
          setupUsage({ app, accounts: am, hosts: null, usageHistory: uh, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(w.dir, 'usage-cache.json'), USAGE_CACHE_DIR: w.cacheDir, CODEX_SESSIONS_DIR: path.join(w.dir, 'nocodex'), META_DIR: path.join(w.dir, 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(w.dir, 'buffers'), apiDerivedWindow: () => null, establishedWindows: () => null });
          const get = () => { const res = { body: null, json(o) { this.body = o; return this; }, status() { return this; } }; routes['GET /api/usage']({ query: {}, headers: {} }, res); return res.body && res.body.homeAccounts && res.body.homeAccounts[a.id]; };
          const first = get();
          let row = first; const until = Date.now() + 3000;
          while ((!row || row.turnsSince == null) && Date.now() < until) { await sleep(20); row = get(); }
          return { green: !!first && first.turnsSince === null && !!row && row.turnsSince === 2, why: 'the account\'s row says the turns since its last read — 2 (the one before the read not counted); not counted yet at the first ask (null, never 0)', detail: { first: first && first.turnsSince, now: row && row.turnsSince } };
        } finally { console.log = quiet; }
      },
    },
    // the checker's catch (a): a wall seen before a restart, replayed on a FRESH road (the restart's), must not read again
    async replay(w) {
      const reads = []; const door = { read: (key, o) => { reads.push([key, o]); return Promise.resolve({ ok: false }); } };
      const s = w.session({ backend: 'antigravity', _webuiId: 'w-agr', _accountId: 'agy-3', _spawnModel: 'gemini-4-argon-high' });
      const rec = agyNotice(new Date(Date.now() - 2000).toISOString());
      w.mkRoad(door).onRecord(s, rec, { modelOf: () => s._spawnModel }); await sleep(30);
      w.mkRoad(door).onRecord(s, rec, { modelOf: () => s._spawnModel }); await sleep(30); // the same wall, after the hub's restart
      return { reads: reads.length };
    },
  },
  opencode: {
    async hub(w) { const s = w.session({ backend: 'opencode', _webuiId: 'w-oc', _accountId: null }); const before = filesIn(w.cacheDir).length; w.mkRoad(null).onRecord(s, plainEnd(new Date().toISOString()), { modelOf: () => null }); await sleep(10); return { reading: filesIn(w.cacheDir).length > before, ownTime: false, others: [] }; },
    async device(w) { const s = w.session({ backend: 'opencode', _webuiId: 'w-ocd', host: 'h1', _accountId: null }); const before = filesIn(w.cacheDir).length; w.mkRoad(null).onRecord(s, plainEnd(new Date().toISOString()), { modelOf: () => null }); await sleep(10); return { reading: filesIn(w.cacheDir).length > before, ownTime: false, others: [] }; },
  },
  shell: {
    // a terminal has no stream consumer and no vendor: nothing to drive, nothing may be stored
    async hub() { return { reading: false, ownTime: false, others: [] }; },
    async device() { return { reading: false, ownTime: false, others: [] }; },
  },
};

/** Run every leg; each leg says whether it is green against the harness's own declaration. */
export async function runTurnStatements({ REPO, stampWindow = null }) {
  const legs = [];
  const H = require(path.join(REPO, 'src/harnesses/index.js'));
  const ids = typeof H.ids === 'function' ? H.ids() : Object.keys(H.HARNESSES);
  for (const id of ids) {
    const ts = H.get(id).quota.turnStatement;
    const D = DRIVERS[id];
    const states = ['every-response', 'on-change', 'wall-only'].includes(ts.cadence);
    for (const road of ['hub', 'device']) {
      if (!D || !D[road]) { legs.push({ id: `${id}/${road}/driven`, green: false, why: 'no stub turn for this harness on this road — a harness brings its driver' }); continue; }
      const w = mkWorld(REPO);
      let r; try { r = await D[road](w, REPO); } catch (e) { r = { err: e.message || String(e) }; } finally { w.cleanup(); }
      if (r.err) { legs.push({ id: `${id}/${road}/driven`, green: false, why: 'the driver threw: ' + r.err }); continue; }
      const cannot = ts.cannot && ts.cannot[road];
      if (cannot || !states) {
        legs.push({ id: `${id}/${road}/${cannot ? 'declared-cannot' : ts.cadence}`, green: !r.reading, why: cannot || ts.reason, detail: r });
        continue;
      }
      legs.push({ id: `${id}/${road}/reading`, green: r.reading && !(r.others || []).length, why: `a stated reading lands on the billed account only (others: ${(r.others || []).join(',') || 'none'})`, detail: r });
      legs.push({ id: `${id}/${road}/own-time`, green: !!r.ownTime, why: `the stored time is ${ts.stamp === 'record' ? "the record's own" : 'its arrival'}`, detail: r });
    }
    if (ts.cadence === 'wall-only' && D && D.hubPlain) {
      const w = mkWorld(REPO); let r; try { r = await D.hubPlain(w); } finally { w.cleanup(); }
      legs.push({ id: `${id}/hub/no-wall-no-reading`, green: !r.reading, why: 'a turn with no wall states nothing', detail: r });
    }
    for (const [name, fn] of Object.entries((D && D.extra) || {})) {
      const w = mkWorld(REPO); let r; try { r = await fn(w, REPO); } catch (e) { r = { green: false, why: 'the driver threw: ' + (e.message || e) }; } finally { w.cleanup(); }
      legs.push({ id: `${id}/${name}`, green: !!r.green, why: r.why, detail: r.detail });
    }
    if (D && D.replay) {
      const w = mkWorld(REPO); let r; try { r = await D.replay(w); } finally { w.cleanup(); }
      legs.push({ id: `${id}/hub/replay-reads-once`, green: r.reads === 1, why: `one vendor read per wall across a restart (reads: ${r.reads})`, detail: r });
    }
  }
  for (const m of [2, 1]) {
    const w = mkWorld(REPO); let r; try { r = tieLeg(w, REPO, m, stampWindow); } catch (e) { r = { err: e.message || String(e) }; } finally { w.cleanup(); }
    legs.push(m === 2
      ? { id: 'any/hub/tie-never-broken', green: !r.err && r.r && r.r.ok === false && r.r.why === 'archived' && r.written.length === 0, why: 'a window matching TWO other accounts is archived — never written to either, never to the target', detail: r }
      : { id: 'any/hub/tie-control-refiles', green: !r.err && r.r && r.r.ok === true && r.r.key === 'cxs-2' && r.written.join() === 'cxs-2', why: 'the control: matching ONE other account re-files there (the tie leg is not vacuous)', detail: r });
  }
  // the checker's (b) and (c): driven by pick 4 — named now, red until then (never a skip)
  legs.push({ id: 'claude/hub/replay-by-request', green: false, why: 'not driven yet: the replay at attach does not exist (pick 4)' });
  legs.push({ id: 'any/hub/skewed-never-wins', green: false, why: 'not driven yet: the store-at-own-time rule does not exist (pick 4)' });
  return legs;
}
