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
  'codex/device/reading': 'pick 2 — the three walkers carry rate_limits and the hub files the last one per thread',
  'codex/device/own-time': 'pick 2 — the walker row carries the record\'s own time',
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
    'agy-1': { id: 'agy-1', name: 'Agy A', type: 'subscription', backend: 'antigravity' },
  };
  const accounts = {
    get: (id) => ROSTER[id] || null, list: () => ({ accounts: Object.values(ROSTER) }),
    poolCurrentFor: () => null, poolCurrent: () => null, poolMembers: () => [],
    subCredsPath: (id) => path.join(dir, 'nope', id), sessionPoolLinkPath: () => path.join(dir, 'nope-link'),
  };
  const sessions = new Map();
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1,
    broadcastToSession() { }, serverNotice() { }, serverSetting() { return undefined; }, getAccounts: () => accounts, getHosts: () => null,
    getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
  });
  const harnesses = require(path.join(REPO, 'src/harnesses/index.js'));
  const SW = require(path.join(REPO, 'src/server/stream-wall.js'));
  const logs = [];
  const mkRoad = (door = null) => SW.createStreamWallRoad({ harnessOf: (id) => harnesses.get(id), cacheDir, door, now: () => Date.now(), log: (l) => logs.push(l) });
  const brain = require(path.join(REPO, 'src/server/session-brain.js')).create({ engine: eng, applyTaskToolUpdate() { }, updateSessionTodos() { }, getUsageHistory: () => ({ _cost: () => 0 }) });
  const session = (o) => { const s = { mode: 'chat', host: null, pty: { write() { } }, name: 'turn', ...o }; sessions.set(s._webuiId, s); return s; };
  return { dir, cacheDir, eng, harnesses, mkRoad, brain, session, logs, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } } };
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

/** THE DRIVERS: one stub turn per harness and road → what the store holds. `null` = this harness has no driver (a red leg). */
const DRIVERS = {
  claude: {
    async hub(w) { const s = w.session({ backend: 'claude', _webuiId: 'w-cl', _accountId: 'sub-1' }); const t0 = Date.now(); await w.eng.recordRateLimitEvent(s, claudeRec()); await sleep(30); return judge(w, 'sub-1', { t0, t1: Date.now(), stamp: 'arrival' }); },
    async device(w) { const s = w.session({ backend: 'claude', _webuiId: 'w-cld', host: 'h1', _accountId: 'sub-1' }); const t0 = Date.now(); w.brain.claudeSideEffects(s, 'w-cld', claudeRec()); await sleep(30); return judge(w, 'sub-1', { t0, t1: Date.now(), stamp: 'arrival' }); },
  },
  codex: {
    async hub(w) { const s = w.session({ backend: 'codex', _webuiId: 'w-cx', _accountId: 'cxs-1' }); const recAt = Date.now() - 2000; const t0 = Date.now(); await w.eng.recordCodexQuotaSignal(s, codexPayload(), { timestamp: new Date(recAt).toISOString() }); await sleep(30); return judge(w, 'cxs-1', { t0, t1: Date.now(), recAt, stamp: 'record' }); },
    // the paired machine's road for codex is its usage walk (chat on a dial device is refused; terminal mode has no wrapper): a
    // rollout whose token_count carries rate_limits, walked by the device's walker — does any reading reach the store?
    async device(w, REPO) {
      const home = path.join(w.dir, 'dev-home'), tid = 'cccccccc-0000-4000-8000-000000000001';
      const d = path.join(home, '.codex', 'sessions', '2026', '11', '15'); fs.mkdirSync(d, { recursive: true });
      const recAt = Date.now() - 2000, ts = new Date(recAt).toISOString();
      const rl = { primary: { used_percent: 12, window_minutes: 10080, resets_at: nowS() + 3 * 86400 }, secondary: null, plan_type: 'plus' };
      const rows = [
        { timestamp: ts, type: 'session_meta', payload: { id: tid, cwd: '/tmp/turn', cli_version: '0.153.4' } },
        { timestamp: ts, type: 'turn_context', payload: { turn_id: 't1', model: 'gpt-5.6-sol', cwd: '/tmp/turn' } },
        { timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, total_tokens: 15 }, total_token_usage: { total_tokens: 15 } }, rate_limits: rl } },
      ];
      fs.writeFileSync(path.join(d, `rollout-2026-11-15T00-00-00-${tid}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      const { runUsageWalk } = require(path.join(REPO, 'src/usage-walker.js'));
      const r = runUsageWalk({ home, cursorFile: path.join(w.dir, 'dev-cursor.json') });
      const events = (r.events || []).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const carried = events.filter((e) => e.be === 'codex' && (e.rl || e.rateLimits || e.rate_limits));
      // nothing files a device codex reading today: the store stays empty unless a later pick wires walker → ingest → store
      const j = judge(w, 'cxs-1-device-none', { t0: recAt, t1: Date.now(), recAt, stamp: 'record' });
      return { ...j, reading: carried.length > 0 && j.reading, carried: carried.length, events: events.length };
    },
  },
  antigravity: {
    async hub(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-ag', _accountId: 'agy-1', _spawnModel: 'gemini-4-argon-high' }); const recAt = Date.now() - 2000; const t0 = Date.now(); w.mkRoad(null).onRecord(s, agyNotice(new Date(recAt).toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return judge(w, 'agy-1', { t0, t1: Date.now(), recAt, stamp: 'record' }); },
    // the turn with NO wall: wall-only states nothing
    async hubPlain(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-ag2', _accountId: 'agy-2', _spawnModel: 'gemini-4-argon-high' }); const t0 = Date.now(); w.mkRoad(null).onRecord(s, plainEnd(new Date().toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return judge(w, 'agy-2', { t0, t1: Date.now(), stamp: 'record' }); },
    async device(w) { const s = w.session({ backend: 'antigravity', _webuiId: 'w-agd', host: 'h1', _accountId: null, _spawnModel: 'gemini-4-argon-high' }); const before = filesIn(w.cacheDir).length; w.mkRoad(null).onRecord(s, agyNotice(new Date().toISOString()), { modelOf: () => s._spawnModel }); await sleep(30); return { reading: filesIn(w.cacheDir).length > before, ownTime: false, others: [] }; },
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
export async function runTurnStatements({ REPO }) {
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
    if (D && D.replay) {
      const w = mkWorld(REPO); let r; try { r = await D.replay(w); } finally { w.cleanup(); }
      legs.push({ id: `${id}/hub/replay-reads-once`, green: r.reads === 1, why: `one vendor read per wall across a restart (reads: ${r.reads})`, detail: r });
    }
  }
  // the checker's (b) and (c): driven by pick 4 — named now, red until then (never a skip)
  legs.push({ id: 'claude/hub/replay-by-request', green: false, why: 'not driven yet: the replay at attach does not exist (pick 4)' });
  legs.push({ id: 'any/hub/skewed-never-wins', green: false, why: 'not driven yet: the store-at-own-time rule does not exist (pick 4)' });
  return legs;
}
