#!/usr/bin/env node
// A WINDOW'S AGE IS ITS OWN STAMP, ON BOTH SIDES (B-37bc, lane bl-keys-misc — the coordinator's r424 / r461). Step 1 measured
// it with the real engine's banner, the real shipped statusline and the page's age rule: a banner's fetchedAt dates no lane;
// the harm is the statusline's 5h-only render, which spreads the unrendered week forward with no stamp, after which the next
// write's lift dated it at the write's clock — a week read 14 h ago drew as just read, drew no age at all after a restart, and
// won the merge over a real, newer reading of it.
// THE LAW: (a) the write road projects each window's own instant into its legacy bucket (usage-cache-write → toLegacyView
// `stamps`); (b) the lift of a STORED legacy bucket dates it by THE ONE ORDER — its own stamp, a cap's scoped instant, the
// file's clock (quotaModel.bucketInstant, the read side's); a producer's object is this write's reading (what it only carried
// is the stored window again), and a bucket it RE-STATES carries no earlier stamp (rate-limit-capture `restated`; the
// banner's lane is refused, so it is this write's instant).
//   ① ONE ORDER: the read side and the write side date the same bucket to the same instant over a table (bare, stamped,
//      a render's asOf, cap only, a statusline file's restored plan); the order is written once (a census of quota-model)
//   ② THE STAMP ON THE FILE: a claude file's 5h / 7d / cap buckets carry their windows' instants; a codex file's none
//   ③ THE HARM (G / H): the real statusline renders the 5h only over a week read 14 h ago; the next write — the REAL engine's
//      5h banner, a plain 5h rate_limit_event, the banner's write shape — leaves the week and the cap their «14h»
//   ④ THE REVERSE HARM: a window this write re-measured is this write's, though the producer copied the stamped stored
//      bucket (the capture's re-stated bucket drops the projected measuredAt and an earlier render's asOf: its stated lane
//      is the event's instant); a producer's OWN older stamp stays its own (test-account-reset-door lane-f)
//   ⑤ FILES IN THE FIELD (D / E / F): a whole legacy file reads exactly as before; its next write keeps the cap's instant
//   ⑥ THE MONEY: the same render, then a real week reading measured 30 min ago — the file keeps the REAL reading
//   ⑦ THE RESTART: a second engine (a fresh process) over the same file draws the week «14h»
//   ⑧ A REFUSAL STAYS A REFUSAL (round wcslt7dwl item 1): a refused week spread forward by a 5h-only render keeps its refused
//      and stated marks — the stored lanes' mark (the held fall reads only unmarked ones), the next write's carryStamps, the
//      reset-seen rule on a lower reading
//   ⑨ A STATUS-ONLY EVENT CARRIES (item 2): no number, the same reset — the week keeps its stored instant and its «14h»
//   ⑩ CLAUDE FILES ONLY (item 4): a codex file written through the road is byte for byte the base projection's
//   ⑪ A READING'S STAMP NEVER MOVES BACKWARDS (B-37bc's follow, r639): a late event — measured before what the file already
//      states — changes nothing of that window (numbers, marks) nor the file's clocks; it may fill a window the file lacks
//   RED CONTROLS: anchored mutants of this tree's write road (a copy of its module closure), each red at its own legs
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { anchored } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-window-stamp-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let passed = 0, failed = 0;
// ITS OWN DEADLINE (the coordinator's r471: a run that can hang is bounded by seconds, said by name): the REAL pool engine
// arms timers that keep node alive, so this suite ends by process.exit — and if a leg never answers, this says which one
// and exits red long before any runner's deadline
let inLeg = 'the start';
const DEADLINE_MS = 60e3;
setTimeout(() => { console.log(`  ✗ DEADLINE: no answer within ${DEADLINE_MS / 1000} s — the suite was in «${inLeg}»`); process.exit(1); }, DEADLINE_MS).unref();
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900)}`); } return !!c; }
const quiet = async (fn) => { const o = console.log, w = console.warn, e = console.error; console.log = () => { }; console.warn = () => { }; console.error = () => { }; try { return await fn(); } finally { console.log = o; console.warn = w; console.error = e; } };
const reqOf = (T) => createRequire(path.join(T, 'package.json'));
const NOW = Date.now(), S = Math.floor(NOW / 1000), H = 3600e3, RC = S + 4 * 86400;
const MIN = (ms) => Math.round((Date.now() - ms) / 60000);
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
function engineWorld(T, { def = 'B', fableA = 1.0, fableB = 1.0 } = {}) {
  const r = reqOf(T);
  const engMod = r('./src/server/usage-pool-engine.js'), { AccountManager } = r('./src/accounts.js'), { ClaudeCodeAdapter } = r('./src/adapters/claude-code.js');
  let claimMod = null; try { claimMod = r('./src/usage-reset-claim.js'); } catch { }
  const root = fs.mkdtempSync(path.join(ROOT, 'eng-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  const am = new AccountManager({ dataDir });
  const id = {};
  for (const tag of ['A', 'B']) { id[tag] = am.createSubscription({ name: 'acct-' + tag.toLowerCase() }).id; fs.writeFileSync(path.join(am.subDir(id[tag]), '.credentials.json'), CREDS(id[tag]), { mode: 0o600 }); }
  const P = am.createPool({ name: 'pool-x' }).id;
  am.setPoolTarget(P, id[def]); am.updatePool(P, { auto: true, hot: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const rd = (fab, days) => ({ fetchedAt: NOW - H, scopedFetchedAt: NOW - 836 * 60e3, source: 'on-demand', fiveHour: { utilization: 0.2, resetsAt: S + 2 * 3600 }, sevenDay: { utilization: 0.08, resetsAt: S + days * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: fab, resetsAt: S + days * 86400 }] });
  fs.writeFileSync(path.join(cacheDir, id.A + '.json'), JSON.stringify(rd(fableA, 4)));
  fs.writeFileSync(path.join(cacheDir, id.B + '.json'), JSON.stringify(rd(fableB, 3)));
  const sessions = new Map(), arms = [];
  const autoResume = { armIfEnabled: (sid, s, until, why) => arms.push({ sid, why: String(why || '').slice(0, 80) }), noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget(sid, n, reason) { arms.push({ noPoolTarget: reason, sid }); }, statusFor: () => null, enabledFor: () => false, fireNow() { } };
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => { }, serverSetting: () => undefined, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume, getQuotaProbe: () => null, getSessionMetaStore: () => null,
  });
  const mkSession = (sid, member) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } }, _isStreaming: false, _turnState: 'idle', _spawnModel: 'claude-fable-5-1' }; sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, id[member], { why: 'drill' }); return s; };
  const tagOf = (x) => Object.keys(id).find((k) => id[k] === x) || x;
  const claim = (tag, lanes) => (claimMod ? claimMod.at(dataDir).claim(id[tag], lanes, JSON.parse(fs.readFileSync(path.join(cacheDir, id[tag] + '.json'), 'utf8'))) : { ok: false, code: 'no-module' });
  // the pool reads an estimate only where this instance's verdict is ON (usage-predict P5): this world's estimates are made — stated on
  if (app.locals.usageEstimator) app.locals.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });
  return { r, eng, am, P, id, sessions, arms, mkSession, tagOf, claim, cacheDir, est: app.locals.usageEstimator, linkOf: (sid) => tagOf(am.poolCurrentFor(P, sid)) };
}

// ── the tree's write road + the page's age rule (usage-meter.js: each lane at max(its window's instant, when the write
//    path last stated it), its words when more than 30 min older than the freshest — account-wall-words staleLaneAge) ──
const AW = await import(pathToFileURL(path.join(REPO, 'src/lib/account-wall-words.js')).href);
const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
const kitOf = (T) => { const r = reqOf(T); return { T, r, q: r('./src/quota-model.js'), W: r('./src/usage-cache-write.js'), C: r('./src/rate-limit-capture.js') }; };
let dirN = 0;
const mkDir = (tag) => { const d = path.join(ROOT, `${tag}-${++dirN}`); fs.mkdirSync(d, { recursive: true }); return d; };
function pageAges(k, dir, key, { restarted = false } = {}) {
  const rl = k.W.readCacheObject(dir, key) || {};
  const statedAt = restarted ? {} : ((typeof k.W.lanesReadAt === 'function' ? k.W.lanesReadAt(key) : {}) || {});
  const laneAt = new Map(k.q.lanesOfReading(rl).map((x) => [x.lane, Math.max(Number(x.at) || 0, Number(statedAt[x.lane]) || 0) || null]));
  return agesOf(laneAt);
}
function agesOf(laneAt) {
  const freshest = Math.max(0, ...[...laneAt.values()].map((v) => Number(v) || 0)), now = Date.now(), out = {};
  for (const [lane, at] of laneAt) out[lane] = { at, min: at ? MIN(at) : null, words: AW.staleLaneAge(at, freshest, now, { t: tt }) };
  return out;
}
const said = (a) => Object.entries(a).map(([l, x]) => `${l} ${x.min == null ? '—' : x.min + ' min'} «${x.words}»`).join(' · ');
// the producers' REAL write shapes (test-account-reset-door's PRODUCERS): a panel read, the capture, the banner's write
const panel = (k, dir, key, at, { five = 0.2, week = 0.08, fable = 0.5 } = {}) => quiet(() => k.W.writeCacheObject({ cacheDir: dir, key, obj: { fetchedAt: at, scopedFetchedAt: at, source: 'on-demand',
  fiveHour: { utilization: five, resetsAt: S + 3600 }, sevenDay: { utilization: week, resetsAt: S + 3 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: fable, resetsAt: RC }] }, measuredAt: at, source: 'on-demand', backend: 'claude', authoritativeScopes: ['model'],
  stated: { fiveHour: {}, sevenDay: {}, scopedWeekly: [{ name: 'Fable' }] } }));
const rle = (k, dir, key, ev, now) => quiet(() => k.C.captureRateLimitEvent({ cacheDir: dir, key, identityIds: [key], ev: { overage: {}, ...ev }, now }));
const bannerWrite = (k, dir, key, kind = 'fiveHour') => quiet(() => {   // usage-pool-engine markLimitBannerNow's write (a bump of the bucket, fetchedAt now, limits dropped)
  const c = { ...(k.W.readCacheObject(dir, key) || {}) }, lane = kind === 'sevenDay' ? 'plan:7d' : 'plan:5h';
  c[kind] = { ...(c[kind] || {}), state: undefined, utilization: 1, status: 'limited', resetsAt: (c[kind] && c[kind].resetsAt) || S + (kind === 'sevenDay' ? 24 : 5) * 3600 };
  c.fetchedAt = Date.now(); c.source = 'limit-banner'; delete c.limits;
  return k.W.writeCacheObject({ cacheDir: dir, key, obj: c, measuredAt: c.fetchedAt, source: 'limit-banner', backend: 'claude', stated: [lane], refused: [lane] });
});
// THE SHIPPED STATUSLINE (data/bin/vibespace-usage, the real file — it writes the file itself; its reader compares the write)
function statusline(k, dir, key, rateLimits = { five_hour: { used_percentage: 21, resets_at: S + 3600 } }) {
  const f = path.join(dir, key + '.json'), before = k.W.readCacheObject(dir, key), old = new Date(Date.now() - 60e3); try { fs.utimesSync(f, old, old); } catch { }   // past its 8 s write throttle
  const env = { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', VIBESPACE_USAGE_CACHE: dir, VIBESPACE_ACCOUNT_KEY: key, HOME: ROOT };
  const p = spawnSync(process.execPath, [path.join(k.T, 'data/bin/vibespace-usage')], { input: JSON.stringify({ session_id: 's1', rate_limits: rateLimits }), env, timeout: 10000 });
  const after = k.W.readCacheObject(dir, key);
  const o = console.log; console.log = () => { }; try { if (typeof k.W.noteDirectWrite === 'function') k.W.noteDirectWrite(key, before, after, { cacheDir: dir }); } finally { console.log = o; }
  return { status: p.status, after };
}
const lanesHeard = (k, dir) => { const heard = []; const off = typeof k.W.onLanesRead === 'function' ? k.W.onLanesRead((e) => { if (e && e.cacheDir && path.resolve(e.cacheDir) === path.resolve(dir)) for (const x of e.lanes || []) heard.push({ lane: x.lane, at: Number(x.at) || 0 }); }) : () => { }; return { heard, off }; };

const LEGS = {
  // ① THE ONE ORDER, over a table: the read side (lanesOfReading of the stored object) and the write side (the lift of the
  // stored object, the write road's prevSet) date each bucket to the same instant, and that instant is the one order's
  async 'one-order'(k) {
    const { q, W } = k;
    if (typeof q.bucketInstant !== 'function') return { ok: false, detail: 'no quotaModel.bucketInstant (the one order)' };
    const F = NOW - H, C = NOW - 836 * 60e3, M = NOW - 14 * H, A = NOW - 40 * 60e3;
    const b5 = { utilization: 0.2, resetsAt: S + 3600 }, b7 = { utilization: 0.08, resetsAt: S + 3 * 86400 }, bc = { name: 'Fable', utilization: 0.5, resetsAt: RC };
    const legacy = (x = {}) => ({ fetchedAt: F, scopedFetchedAt: C, source: 'on-demand', fiveHour: { ...b5, ...(x.p || {}) }, sevenDay: { ...b7, ...(x.p || {}) }, scopedWeekly: [{ ...bc, ...(x.c || {}) }] });
    const typedCap = q.makeLimit({ limitId: 'model:fable', name: 'Fable', scope: 'model', source: 'on-demand', fetchedAt: C, windows: [{ kind: '7d', usedPct: 50, resetsAt: RC, measuredAt: C }] });
    const rows = [
      ['bare (a whole legacy file: the plan by its clock, the cap by its scoped instant)', legacy(), { 'plan:5h': F, 'plan:7d': F, 'model:fable': C }],
      ['stamped (the write road\'s measuredAt on every bucket)', legacy({ p: { measuredAt: M }, c: { measuredAt: M } }), { 'plan:5h': M, 'plan:7d': M, 'model:fable': M }],
      ['a render\'s asOf on every bucket', legacy({ p: { asOf: A }, c: { asOf: A } }), { 'plan:5h': A, 'plan:7d': A, 'model:fable': A }],
      ['cap only (the plan stamped, the cap bare: its scoped instant)', legacy({ p: { measuredAt: M } }), { 'plan:5h': M, 'plan:7d': M, 'model:fable': C }],
      ['a statusline file (the plan dropped from `limits`: its 5h rendered, its week spread forward stamped; the cap typed)', { fetchedAt: NOW, source: 'passive', fiveHour: { ...b5, asOf: NOW }, sevenDay: { ...b7, measuredAt: M }, scopedWeekly: [{ ...bc }], limits: [typedCap] }, { 'plan:5h': NOW, 'plan:7d': M, 'model:fable': C }],
    ];
    const out = [];
    for (const [name, obj, want] of rows) {
      const readAt = Object.fromEntries(q.lanesOfReading(obj).map((x) => [x.lane, x.at]));
      let set = null; try { set = W.liftCacheObject(JSON.parse(JSON.stringify(obj)), { identity: 'k1', backend: 'claude' }); } catch (e) { out.push({ ok: false, text: `${name}: the lift threw ${e.message}` }); continue; }
      const writeAt = Object.fromEntries(q.lanesOfReading({ fetchedAt: obj.fetchedAt, limits: q.limitsOf(set) }).map((x) => [x.lane, x.at]));
      const bad = Object.keys(want).filter((l) => readAt[l] !== want[l] || writeAt[l] !== want[l]);
      out.push({ ok: !bad.length, text: `${name}: ${Object.keys(want).map((l) => `${l} read ${readAt[l] == null ? '—' : MIN(readAt[l])} / write ${writeAt[l] == null ? '—' : MIN(writeAt[l])} / the order ${MIN(want[l])} min`).join(' · ')}` });
    }
    // the order lives in ONE place: its steps are spelled once in quota-model, and both sides call it
    const QS = fs.readFileSync(path.join(k.T, 'src/quota-model.js'), 'utf8');
    const spelled = QS.split('posNum(b && b.asOf)').length - 1, chains = QS.split('?? posNum(obj.scopedFetchedAt)').length - 1;   // stale-pins: kept (an absence check: the copied chain must be gone)
    const readCalls = /put\('plan:5h', obj\.fiveHour, bucketInstant\(obj\.fiveHour, \{ fileAt: fileClock \}\)/.test(QS) && /bucketInstant\(s, \{ scopedAt: obj\.scopedFetchedAt, fileAt: obj\.fetchedAt \}\)/.test(QS);
    const writeCalls = /const dateOf = \(b, scopedAt = null\) => \(stored \? bucketInstant\(b, \{ scopedAt, fileAt: at \}\) : at\);/.test(QS);
    out.push({ ok: spelled === 1 && chains === 0 && readCalls && writeCalls, text: `the order spelled ${spelled}× (the asOf step), ${chains} copied chain(s) left; the read side calls it ${readCalls}, the write side ${writeCalls}` });
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // ② (a) THE STAMP ON THE FILE
  async 'file-stamp'(k) {
    const dir = mkDir('fs'), T0 = NOW - 2 * H;
    await panel(k, dir, 'acct-fs', T0);
    const f = k.W.readCacheObject(dir, 'acct-fs') || {};
    const got = { fiveHour: f.fiveHour && f.fiveHour.measuredAt, sevenDay: f.sevenDay && f.sevenDay.measuredAt, cap: f.scopedWeekly && f.scopedWeekly[0] && f.scopedWeekly[0].measuredAt };
    const typed = Object.fromEntries(k.q.lanesOfReading({ fetchedAt: f.fetchedAt, limits: f.limits || [] }).map((x) => [x.lane, x.at]));
    const claudeOk = got.fiveHour === T0 && got.sevenDay === T0 && got.cap === T0 && typed['plan:7d'] === T0;
    // every OTHER caller's view is unchanged (the default projection stamps nothing), and the write stamps a claude file only
    const set = k.W.liftCacheObject(f, { identity: 'acct-fs', backend: 'claude' }), plain = k.q.toLegacyView(set);
    const plainOk = !!plain.sevenDay && !('measuredAt' in plain.sevenDay) && !('measuredAt' in (plain.scopedWeekly || [{}])[0]);
    const US = fs.readFileSync(path.join(k.T, 'src/usage-cache-write.js'), 'utf8');
    const ruleOk = /const view = quotaModel\.toLegacyView\(merged, \{ stamps: !!require\('\.\/backend-caps\.js'\)\.capsOf\(backend \|\| backendOfCacheObject\(obj\)\)\.oauthUsage \}\);/.test(US);
    // …and the row the rule reads: Claude's own (`oauthUsage`, the legacy harness when none is named), no other harness's
    const BC = k.r('./src/backend-caps.js'), rowOk = !!BC.capsOf('claude').oauthUsage && !!BC.capsOf(null).oauthUsage && !BC.capsOf('codex').oauthUsage;
    return { ok: claudeOk && plainOk && ruleOk && rowOk, detail: `the declared row (claude ${!!BC.capsOf('claude').oauthUsage}, none named ${!!BC.capsOf(null).oauthUsage}, codex ${!!BC.capsOf('codex').oauthUsage}) · a claude panel read 2 h ago: the file's 5h ${got.fiveHour ? MIN(got.fiveHour) + ' min' : 'unstamped'}, week ${got.sevenDay ? MIN(got.sevenDay) + ' min' : 'unstamped'}, cap ${got.cap ? MIN(got.cap) + ' min' : 'unstamped'} (its typed week ${typed['plan:7d'] ? MIN(typed['plan:7d']) + ' min' : '—'}) · the default view ${plainOk ? 'carries no stamp' : 'STAMPED'} · the write stamps claude files only ${ruleOk}` };
  },
  // ③ THE HARM, G / H shapes (and the banner's write shape for the mutant trees — the engine's own banner runs below)
  async 'statusline-then-write'(k, how = 'capture') {
    const dir = mkDir('sl'), key = 'acct-sl-' + how;
    await panel(k, dir, key, NOW - 14 * H);
    const sl = statusline(k, dir, key);
    const before = pageAges(k, dir, key);
    if (how === 'capture') await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 2 * 3600 }, Date.now());
    else await bannerWrite(k, dir, key);
    const after = pageAges(k, dir, key);
    const keep = (a) => !!(a['plan:7d'] && a['plan:7d'].words === '14h' && a['model:fable'] && a['model:fable'].words === '14h');
    return { ok: !!(sl.status === 0 && keep(before) && keep(after) && after['plan:5h'] && after['plan:5h'].words === ''), detail: `the statusline (5h only) exited ${sl.status}; before the next write: ${said(before)} → after the ${how === 'capture' ? '5h rate_limit_event' : "banner's write"}: ${said(after)}` };
  },
  // ④ THE REVERSE HARM — (i) a re-measured window is this write's, though the producer copied the stored (stamped) bucket;
  //    (ii) the capture's re-stated bucket drops an earlier render's asOf
  async 'reverse'(k) {
    const out = [];
    { const dir = mkDir('rv'), key = 'acct-rv';
      await panel(k, dir, key, NOW - 14 * H);
      const stamped = (k.W.readCacheObject(dir, key) || {}).sevenDay;
      const L = lanesHeard(k, dir), t0 = Date.now();
      await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.3, resetsAt: S + 3 * 86400 }, t0);
      L.off();
      const f = k.W.readCacheObject(dir, key) || {};
      const typed7 = Object.fromEntries(k.q.lanesOfReading({ fetchedAt: f.fetchedAt, limits: f.limits || [] }).map((x) => [x.lane, x.at]))['plan:7d'];
      const heard7 = L.heard.filter((x) => x.lane === 'plan:7d').map((x) => x.at);
      const a = pageAges(k, dir, key);
      out.push({ ok: !!(stamped && stamped.measuredAt) && typed7 >= t0 && f.sevenDay && f.sevenDay.measuredAt >= t0 && heard7.length > 0 && heard7.every((x) => x >= t0) && a['plan:7d'].words === '',
        text: `the week re-measured now (a 7d rate_limit_event at 30 %) over a file whose week bucket was stamped ${stamped && stamped.measuredAt ? MIN(stamped.measuredAt) + ' min ago' : 'NOT'}: its window ${typed7 ? MIN(typed7) + ' min' : '—'}, its bucket ${f.sevenDay && f.sevenDay.measuredAt ? MIN(f.sevenDay.measuredAt) + ' min' : '—'}, stated at [${heard7.map(MIN).join(',')}] min, the page «${a['plan:7d'].words}»` }); }
    { const dir = mkDir('rva'), key = 'acct-rva';
      await panel(k, dir, key, NOW - 14 * H);
      const sl = statusline(k, dir, key);
      const f0 = JSON.parse(fs.readFileSync(path.join(dir, key + '.json'), 'utf8')), R = NOW - 40 * 60e3;
      f0.fiveHour.asOf = R; f0.fetchedAt = R; fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(f0));   // the render was 40 min ago
      const L = lanesHeard(k, dir), t0 = Date.now();
      await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.35, resetsAt: S + 3600 }, t0);
      L.off();
      const heard5 = L.heard.filter((x) => x.lane === 'plan:5h').map((x) => x.at);
      out.push({ ok: sl.status === 0 && heard5.length > 0 && heard5.every((x) => x >= t0), text: `a 5h rate_limit_event now over a render 40 min old (the statusline exited ${sl.status}): the event's stated 5h at [${heard5.map(MIN).join(',')}] min (the event's instant, never the render's asOf)` }); }
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // ⑤ FILES IN THE FIELD (step 1's D / E / F): a whole legacy file reads exactly as it did; its next write keeps the cap's own
  //    instant (D, E: the scoped instant; F: its asOf) — before this unit it took the file's clock
  async 'field'(k) {
    const out = [];
    for (const [name, x] of [['D/E (no stamp of its own)', {}], ['F (every bucket its own asOf)', { asOf: true }]]) {
      const dir = mkDir('fd'), key = 'acct-fd', F = NOW - H, C = NOW - 836 * 60e3;
      const o = { fetchedAt: F, scopedFetchedAt: C, source: 'on-demand', fiveHour: { utilization: 0.2, resetsAt: S + 2 * 3600 }, sevenDay: { utilization: 0.08, resetsAt: S + 4 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 0.5, resetsAt: S + 4 * 86400 }] };
      if (x.asOf) { o.fiveHour.asOf = F; o.sevenDay.asOf = F; o.scopedWeekly[0].asOf = C; }
      fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(o));
      const reads = Object.fromEntries(k.q.lanesOfReading(o).map((y) => [y.lane, y.at]));
      const asBefore = reads['plan:5h'] === F && reads['plan:7d'] === F && reads['model:fable'] === C;
      await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 2 * 3600 }, Date.now());
      const a = pageAges(k, dir, key);
      out.push({ ok: !!(asBefore && a['model:fable'] && a['model:fable'].at === C && a['plan:7d'] && a['plan:7d'].at === F), text: `${name}: read ${MIN(reads['plan:5h'])} / ${MIN(reads['plan:7d'])} / ${MIN(reads['model:fable'])} min (as before: ${asBefore}) → after a 5h rate_limit_event: ${said(a)}` });
    }
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // ⑥ THE MONEY: a real week reading measured 30 min ago reaches the hub after the statusline's 5h-only render — the merge's
  //    newest-measurement-wins decides by the window's own age, so the file keeps the REAL reading (and the pool reads it)
  async 'money'(k) {
    const dir = mkDir('mn'), key = 'acct-mn', AP = k.r('./src/account-pool-auto.js');
    await panel(k, dir, key, NOW - 14 * H, { week: 0.08 });
    const sl = statusline(k, dir, key);
    await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.5, resetsAt: S + 3 * 86400 }, Date.now() - 30 * 60e3);
    const f = k.W.readCacheObject(dir, key) || {}, wk = f.sevenDay && f.sevenDay.utilization;
    const rem = AP.bucketRemaining(f.sevenDay, Math.floor(Date.now() / 1000));
    return { ok: sl.status === 0 && wk === 0.5 && rem === 50, detail: `the week read 14 h ago at 8 %, the statusline's 5h render (exit ${sl.status}), then a week reading at 50 % measured 30 min ago: the file holds ${wk == null ? '—' : Math.round(wk * 100) + ' %'}, the pool reads the week ${rem} % left` };
  },
  // ⑦ THE RESTART: a second engine over the same file — a fresh process, so the write road's in-memory instants are gone
  async 'restart'(k, { engine = false } = {}) {
    const dir = mkDir('rs'), key = 'acct-rs';
    await panel(k, dir, key, NOW - 14 * H);
    const sl = statusline(k, dir, key);
    if (sl.status !== 0) return { ok: false, detail: `the statusline's render exited ${sl.status}` };
    const child = path.join(ROOT, 'second-engine.mjs');
    fs.writeFileSync(child, `import { createRequire } from 'module'; import path from 'path';
const [T, dir, key, withEngine] = process.argv.slice(2); const r = createRequire(path.join(T, 'package.json'));
const W = r('./src/usage-cache-write.js'), q = r('./src/quota-model.js');
let engine = 'not built';
if (withEngine === '1') { const o = console.log; console.log = () => {}; try { const am = new (r('./src/accounts.js').AccountManager)({ dataDir: path.join(dir, 'data') });
  r('./src/server/usage-pool-engine.js').create({ app: { get() {}, post() {}, put() {}, delete() {}, use() {}, locals: {} }, rootDir: dir, USAGE_CACHE_DIR: dir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() {}, serverNotice() {}, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => ({ device: async () => ({}) }), getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() {} }), recordUsageAttribution() {}, adapterRegistry: { get: () => r('./src/adapters/claude-code.js').ClaudeCodeAdapter }, getAutoResume: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => null });
  engine = 'built'; } catch (e) { engine = 'failed: ' + e.message; } finally { console.log = o; } }
const rl = W.readCacheObject(dir, key) || {}; const stated = W.lanesReadAt(key);
process.stdout.write(JSON.stringify({ engine, stated, lanes: q.lanesOfReading(rl).map((x) => [x.lane, x.at]) }), () => process.exit(0));
`);
    const p = spawnSync(process.execPath, [child, k.T, dir, key, engine ? '1' : '0'], { encoding: 'utf8', timeout: 30000 });
    let got = null; try { got = JSON.parse(String(p.stdout || '').trim().split('\n').pop()); } catch { }
    if (!got) return { ok: false, detail: `the second process answered nothing (rc ${p.status}): ${String(p.stderr || '').slice(0, 300)}` };
    const a = agesOf(new Map(got.lanes.map(([l, at]) => [l, Math.max(Number(at) || 0, Number((got.stated || {})[l]) || 0) || null])));
    return { ok: !!((!engine || got.engine === 'built') && Object.keys(got.stated || {}).length === 0 && a['plan:7d'] && a['plan:7d'].words === '14h' && a['model:fable'] && a['model:fable'].words === '14h'), detail: `a second ${engine ? 'engine' : 'process'} (${got.engine}, its in-memory stated instants: ${Object.keys(got.stated || {}).length}) over the file the statusline left: ${said(a)}` };
  },
  // ⑧ A REFUSAL STAYS A REFUSAL (the coordinator's round wcslt7dwl, item 1)
  async 'refusal-kept'(k) {
    const dir = mkDir('rk'), key = 'acct-rk', out = [];
    await panel(k, dir, key, NOW - 14 * H);
    await bannerWrite(k, dir, key, 'sevenDay');
    const sl = statusline(k, dir, key);   // the 5h only: the refused week is spread forward
    const laneOf = () => k.q.lanesOfReading(k.W.readCacheObject(dir, key) || {}).find((x) => x.lane === 'plan:7d') || {};
    const a = laneOf();
    out.push({ ok: sl.status === 0 && a.mark === true && a.refusedAt != null && a.usedPct >= 100, text: `the week refused, then the statusline's 5h render (exit ${sl.status}): the spread week reads mark ${a.mark}, refusedAt ${a.refusedAt ? 'kept' : 'LOST'}, ${a.usedPct} %` });
    await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 2 * 3600 }, Date.now());
    const b = laneOf();
    out.push({ ok: b.mark === true && b.refusedAt != null, text: `…after the next write (a 5h event): mark ${b.mark}, refusedAt ${b.refusedAt ? 'kept' : 'LOST'} (carryStamps)` });
    const heard = []; const off = typeof k.W.onVendorReset === 'function' ? k.W.onVendorReset((e) => { if (e && e.key === key) for (const x of e.resets || []) heard.push(x.lane); }) : () => { };
    await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.3, resetsAt: S + 3 * 86400 }, Date.now());
    off();
    out.push({ ok: !heard.includes('plan:7d'), text: `…then a lower week reading (30 %): a vendor reset said ${heard.includes('plan:7d') ? 'YES — the refusal read as a measurement' : 'no'}` });
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // ⑨ A STATUS-ONLY EVENT CARRIES (item 2): the same status, the same reset, no number — what it re-states is nothing
  async 'status-only'(k) {
    const dir = mkDir('so'), key = 'acct-so', T0 = NOW - 14 * H;
    await panel(k, dir, key, T0);
    await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.08, resetsAt: S + 3 * 86400 }, T0);   // the week read at T0 WITH its status (the claim key holds the status)
    await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 2 * 3600 }, NOW - H);   // a fresh 5h beside it
    await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', resetsAt: S + 3 * 86400 }, Date.now());
    const f = k.W.readCacheObject(dir, key) || {};
    const w7 = Object.fromEntries(k.q.lanesOfReading({ fetchedAt: f.fetchedAt, limits: f.limits || [] }).map((x) => [x.lane, x.at]))['plan:7d'];
    const a = pageAges(k, dir, key);
    return { ok: !!(w7 === T0 && f.sevenDay && f.sevenDay.measuredAt === T0 && a['plan:7d'] && a['plan:7d'].words === '14h'), detail: `a status-only 7d event over a week read 14 h ago: its window ${w7 ? MIN(w7) + ' min' : '—'}, its bucket ${f.sevenDay && f.sevenDay.measuredAt ? MIN(f.sevenDay.measuredAt) + ' min' : '—'}, the page «${a['plan:7d'] ? a['plan:7d'].words : '—'}»` };
  },
  // ⑪ A READING'S STAMP NEVER MOVES BACKWARDS (B-37bc's follow, the coordinator's r639) — the real capture and the real door
  async 'late-event'(k) {
    const out = [], T1 = NOW - 10 * 60e3, T0 = NOW - 30 * 60e3, R7 = S + 3 * 86400;
    const laneOf = (f, id) => k.q.lanesOfReading({ fetchedAt: f.fetchedAt, limits: f.limits || [] }).find((x) => x.lane === id) || {};
    { const dir = mkDir('le1'), key = 'acct-le1';   // the week read at T1 (40 %), then a week event measured at T0 (20 %)
      await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.4, resetsAt: R7 }, T1);
      const before = k.W.readCacheObject(dir, key) || {};
      const heard = []; const off = typeof k.W.onVendorReset === 'function' ? k.W.onVendorReset((e) => { if (e && e.key === key) for (const x of e.resets || []) heard.push(x.lane); }) : () => { };
      await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.2, resetsAt: R7 }, T0);
      off();
      const f = k.W.readCacheObject(dir, key) || {}, w = laneOf(f, 'plan:7d');
      out.push({ ok: !!(before.fetchedAt === T1 && f.fetchedAt === T1 && f.source === before.source && w.at === T1 && w.usedPct === 40 && f.sevenDay && f.sevenDay.utilization === 0.4 && !heard.length),
        text: `the week read 10 min ago at 40 %, then an event measured 30 min ago at 20 %: the week ${w.usedPct} % @${w.at ? MIN(w.at) : '—'} min, the file's clock ${f.fetchedAt ? MIN(f.fetchedAt) : '—'} min (was ${before.fetchedAt ? MIN(before.fetchedAt) : '—'}), its producer ${f.source === before.source ? 'kept' : 'MOVED to ' + f.source}, a reset said ${heard.length ? 'YES' : 'no'}` }); }
    { const dir = mkDir('le2'), key = 'acct-le2';   // a late REFUSAL of the week, older than its reading
      await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.4, resetsAt: R7 }, T1);
      await rle(k, dir, key, { kind: 'sevenDay', status: 'rejected', utilization: null, resetsAt: R7 }, T0);
      const x = k.q.lanesOfReading(k.W.readCacheObject(dir, key) || {}).find((y) => y.lane === 'plan:7d') || {};
      out.push({ ok: !!(x.usedPct === 40 && !x.mark && x.refusedAt == null), text: `a week refusal measured 30 min ago over the week read at 40 % 10 min ago: the week ${x.usedPct} %, mark ${!!x.mark}, refusedAt ${x.refusedAt == null ? 'none' : MIN(x.refusedAt) + ' min'}` }); }
    { const dir = mkDir('le3'), key = 'acct-le3';   // a late event for a window the file does NOT hold fills it, at its own instant
      await rle(k, dir, key, { kind: 'sevenDay', status: 'allowed', utilization: 0.4, resetsAt: R7 }, T1);
      const had5 = !!laneOf(k.W.readCacheObject(dir, key) || {}, 'plan:5h').lane;
      await rle(k, dir, key, { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 2 * 3600 }, T0);
      const f = k.W.readCacheObject(dir, key) || {}, w5 = laneOf(f, 'plan:5h');
      out.push({ ok: !!(!had5 && w5.usedPct === 30 && w5.at === T0 && f.fetchedAt === T1), text: `a 5h event measured 30 min ago over a file holding only the week (5h before: ${had5 ? 'held' : 'none'}): the 5h ${w5.usedPct} % @${w5.at ? MIN(w5.at) : '—'} min, the file's clock ${f.fetchedAt ? MIN(f.fetchedAt) : '—'} min` }); }
    { const dir = mkDir('le4'), key = 'acct-le4';   // the door for any producer: a whole panel read OLDER than the file
      await panel(k, dir, key, T1);
      const before = k.W.readCacheObject(dir, key) || {};
      await panel(k, dir, key, T0, { five: 0.05, week: 0.02, fable: 0.1 });
      const f = k.W.readCacheObject(dir, key) || {}, wf = laneOf(f, 'model:fable');
      out.push({ ok: !!(f.fetchedAt === T1 && f.scopedFetchedAt === before.scopedFetchedAt && wf.at === T1 && wf.usedPct === 50), text: `a panel read 30 min ago over one read 10 min ago: the file's clocks ${f.fetchedAt ? MIN(f.fetchedAt) : '—'} / scoped ${f.scopedFetchedAt ? MIN(f.scopedFetchedAt) : '—'} min, the cap ${wf.usedPct} % @${wf.at ? MIN(wf.at) : '—'} min` }); }
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // ⑩ CLAUDE FILES ONLY (item 4), by behaviour: a codex file written through the road holds no stamp, byte for byte what the
  //    base's projection writes (this tree's write road with its stamps taken out — the only projection change)
  async 'other-harness'(k, { base = null } = {}) {
    // ONE snapshot, parsed once, handed to both roads as the same bytes (a parse stamps its own clock)
    const od0 = k.r('./src/harnesses/codex-quota.js').signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: S + 3 * 86400 }, secondary: { used_percent: 20, window_minutes: 300, resets_at: S + 3600 } } } });
    od0.fetchedAt = NOW - 2 * H; od0.source = 'codex-rate-limits';
    const write = (kk) => { const dir = mkDir('oh'), key = 'acct-cx', cq = kk.r('./src/harnesses/codex-quota.js'), od = JSON.parse(JSON.stringify(od0));
      const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { };
      try { kk.W.writeCacheObject({ cacheDir: dir, key, obj: od, set: cq.limitSetFromSnapshot(od, { identity: key, source: 'codex-rate-limits' }), source: 'codex-rate-limits', backend: 'codex' }); } finally { console.log = o; console.warn = w; }
      return fs.readFileSync(path.join(dir, key + '.json'), 'utf8'); };
    const mine = write(k), ref = base ? write(base) : null;
    const stamped = /"measuredAt"\s*:/.test(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(mine)).filter(([f]) => f !== 'limits'))));
    let at = -1; if (ref != null && mine !== ref) { at = 0; while (at < mine.length && mine[at] === ref[at]) at++; }
    return { ok: !stamped && (ref == null || mine === ref), detail: `a codex file through the road: its buckets ${stamped ? 'STAMPED' : 'carry no stamp'}; ${ref == null ? 'no base copy given' : `byte for byte the base projection's: ${mine === ref} (${mine.length} / ${ref.length} bytes)${at >= 0 ? ` — first difference at ${at}: «${mine.slice(Math.max(0, at - 40), at + 40)}» vs «${ref.slice(Math.max(0, at - 40), at + 40)}»` : ''}`}` };
  },
};

say('THIS TREE');
for (const leg of ['one-order', 'file-stamp', 'reverse', 'field', 'money', 'refusal-kept', 'status-only', 'late-event']) { inLeg = leg; const r = await LEGS[leg](kitOf(REPO)); ok(r.ok, `${leg}: ${r.detail}`); }
{ inLeg = '③ H'; const r = await LEGS['statusline-then-write'](kitOf(REPO), 'capture'); ok(r.ok, `③ H — a plain write after the statusline: ${r.detail}`); }
{ inLeg = '③ banner shape'; const r = await LEGS['statusline-then-write'](kitOf(REPO), 'banner'); ok(r.ok, `③ the banner's write shape after the statusline: ${r.detail}`); }
{ inLeg = '⑦ restart'; const r = await LEGS.restart(kitOf(REPO), { engine: true }); ok(r.ok, `⑦ restart: ${r.detail}`); }
// ③ G — the REAL engine's 5h banner after the statusline (the reset-door suite's engineWorld, verbatim)
{
  inLeg = '③ G (the real engine)';
  const w = engineWorld(REPO, { def: 'B', fableA: 0.5 }), key = w.id.A, k = kitOf(REPO);
  fs.rmSync(path.join(w.cacheDir, key + '.json'), { force: true });
  await panel(k, w.cacheDir, key, NOW - 14 * H);
  const sl = statusline(k, w.cacheDir, key);
  const before = pageAges(k, w.cacheDir, key);
  const s = w.mkSession('ws-g', 'A'); s._isStreaming = true; s._turnState = 'running';
  await quiet(() => w.eng.markLimitBanner(s, "You've reached your 5-hour limit"));
  const after = pageAges(k, w.cacheDir, key);
  ok(!!(sl.status === 0 && after['plan:7d'] && after['plan:7d'].words === '14h' && after['model:fable'] && after['model:fable'].words === '14h' && after['plan:5h'] && after['plan:5h'].words === '' && (k.W.readCacheObject(w.cacheDir, key) || {}).source === 'limit-banner'),
    `③ G — the REAL engine's «You've reached your 5-hour limit» after the statusline's 5h render: before ${said(before)} → after ${said(after)}`);
}

// ── RED CONTROLS: a copy of this tree's write road (its static require closure) with ONE anchored edit each ──
function closureOf(T, roots) {
  const seen = new Set(), todo = [...roots], rx = /require\(\s*'(\.{1,2}\/[^']+)'\s*\)/g;
  while (todo.length) {
    let f = todo.pop(); if (seen.has(f)) continue;
    let p = path.join(T, f); if (!fs.existsSync(p) && fs.existsSync(p + '.js')) { f += '.js'; p += '.js'; }
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    seen.add(f);
    for (const m of fs.readFileSync(p, 'utf8').matchAll(rx)) { let t = path.normalize(path.join(path.dirname(f), m[1])); if (!/\.(js|json)$/.test(t)) t += '.js'; todo.push(t); }
  }
  return [...seen];
}
const CLOSURE = closureOf(REPO, ['src/usage-cache-write.js', 'src/rate-limit-capture.js', 'src/account-pool-auto.js']);
function mutantTree(tag, edits) {
  const M = path.join(ROOT, 'm-' + tag);
  for (const f of CLOSURE) { fs.mkdirSync(path.dirname(path.join(M, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(M, f)); }
  for (const [f, anchor, to] of edits) fs.writeFileSync(path.join(M, f), anchored(fs.readFileSync(path.join(M, f), 'utf8'), anchor, to, `${tag}: ${f}`));
  for (const f of ['package.json', 'node_modules', 'data']) { try { fs.symlinkSync(fs.realpathSync(path.join(REPO, f)), path.join(M, f)); } catch { } }
  return M;
}
const MUTANTS = [
  ['no-own-order', 'the lift of a stored object dates every window at the file\'s clock (the base\'s fromLegacy)', [['src/quota-model.js', 'const dateOf = (b, scopedAt = null) => (stored ? bucketInstant(b, { scopedAt, fileAt: at }) : at);', 'const dateOf = () => at;']],
    ['one-order', 'statusline-then-write', 'field', 'money']],
  ['no-stamps', 'the write road projects no window instant into the file\'s buckets', [['src/quota-model.js', 'if (stamps && posNum(w.measuredAt)) b.measuredAt = posNum(w.measuredAt);', ''], ['src/quota-model.js', 'if (stamps && posNum(w.measuredAt)) e.measuredAt = posNum(w.measuredAt);', '']],
    ['file-stamp', 'statusline-then-write', 'money', 'restart']],
  ['stamp-rides', 'the capture\'s re-stated bucket keeps the stored window\'s projected measuredAt', [['src/rate-limit-capture.js', 'delete c.asOf; delete c.measuredAt; delete c.refusedAt;', 'delete c.asOf; delete c.refusedAt;']],
    ['reverse']],
  ['asof-rides', 'the capture\'s re-stated bucket keeps an earlier render\'s asOf', [['src/rate-limit-capture.js', 'delete c.state; delete c.asOf; delete c.measuredAt;', 'delete c.state; delete c.measuredAt;']],
    ['reverse']],
  ['no-marks', 'the projection carries the instant but not the refused / stated marks', [['src/quota-model.js', '    if (stamps && posNum(w.refusedAt)) b.refusedAt = posNum(w.refusedAt);\n    if (stamps && posNum(w.statedAt)) b.statedAt = posNum(w.statedAt);\n', ''], ['src/quota-model.js', '    if (stamps && posNum(w.refusedAt)) e.refusedAt = posNum(w.refusedAt);       // …with its marks (round wcslt7dwl item 1)\n    if (stamps && posNum(w.statedAt)) e.statedAt = posNum(w.statedAt);\n', '']],
    ['refusal-kept']],
  ['no-carry', 'the write road keeps no unmeasured window (the carry rule out)', [['src/usage-cache-write.js', '    next = carryUnmeasuredLimits(prevSet, next);\n', '']],
    ['status-only']],
  // THE RELEASE'S BEHAVIOUR, one rule at a time (B-37bc's follow): the file's clocks step back with a late event; a late
  // refusal marks a newer reading
  ['clock-steps-back', 'the write door lets a late record move the file\'s clocks back (the release)', [['src/usage-cache-write.js', '  if (!replace && prevObj) {\n    if (out.fetchedAt !== undefined && quotaModel.laterInstant(', '  if (false) {\n    if (out.fetchedAt !== undefined && quotaModel.laterInstant(']],
    ['late-event']],
  ['marks-step-back', 'a refusal older than the window\'s reading still marks it (the release)', [['src/quota-model.js', '      if (laterInstant(w.measuredAt, t) !== t) return w;\n      moved = true;\n      return { ...w, refusedAt: laterInstant(w.refusedAt, t) };', '      moved = true;\n      return { ...w, refusedAt: t };']],
    ['late-event']],
];
{ inLeg = '⑩ other-harness'; const B = kitOf(mutantTree('base-projection', MUTANTS.find((m) => m[0] === 'no-stamps')[2]));
  const r = await LEGS['other-harness'](kitOf(REPO), { base: B }); ok(r.ok, `⑩ other-harness: ${r.detail}`); }
for (const [tag, what, edits, legs] of MUTANTS) {
  say(`RED CONTROL — ${tag}: ${what}`);
  let M = null; try { M = mutantTree(tag, edits); } catch (e) { ok(false, `${tag}: its patch applies to this tree (an anchor no longer in the file is red, never a skip)`, e.message); continue; }
  const k = kitOf(M);
  for (const leg of legs) { inLeg = `${tag} × ${leg}`; let r; try { r = await LEGS[leg](k); } catch (e) { r = { ok: true, threw: true, detail: 'threw: ' + e.message }; } ok(!r.ok && !r.threw, `${tag} is RED at ${leg}: ${r.detail}`); }
}
say(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
