#!/usr/bin/env node
// THE ACCOUNT-RESET-DOOR DRILL (lane account-reset-door, the owner 2026-11-11: «我手动reset过帐号之后没法通知vibespace…» ·
// «这又是啥？？» · «我甚至试图这么切换也不行» · «你有办法探测到 reset 嘛？»). Every leg runs on THIS tree and, as its red
// controls, on git archives of master 5c77612ef (2.369.393) and of rounds 1 (18104c29c) and 2 (db0e0220b) — each probed
// first, a clone without one SKIPs its controls by name, §75. THE FAST ROW runs this tree's legs alone (the fast sum's cap
// had 0.68 s left); scripts/test-account-reset-door-controls.mjs (heavy) runs the same file WITH its red controls:
//   ① THE CLAIM IS A VIEW — a person's «I reset this» names its LANES (quota-model's limit ids); a claimed lane older than
//     the claim reads 'reset-unconfirmed', an unclaimed lane stays its reading, a lane read after the claim is itself.
//   ② ONE READING DOOR (ROOT 1) — the REAL pool engine after its own sweepUsageAnchors: the chooser, the verdict, the
//     per-session pass and the pool switch all see the claim, in either order, across ticks; the placement is said once
//     and only when the claim decided it; the estimate (the rings') starts at the claim.
//   ③ A LANE IS NAMED BY ITS LIMIT AND DATED BY ITS OWN WINDOW (ROOT 2) — each producer's real write shape (the panel, the
//     shipped statusline, a rate_limit_event, the CLI's limit banner, the stream wall) settles its own lane and no other;
//     a reset is compared on the raw pair, never a wall's mark or a late record stamped at arrival.
//   ④ THE STORE — refusals; a 7-day-only reading never settles a model cap; contradicted said once; confirmed; 7 days; a
//     reading that states no spend confirms nothing; the file shape-checked at load (dropped + said once), a flush on stop;
//     a reset seen is said once per (lane, reset ± 60 s), across a restart.
//   ⑤ THE DOOR — POST /api/accounts/:id/reset-claim through the REAL setupUsage: any Bearer 403, unknown 404, another
//     harness's row 409 by name, no reading 409, /api/usage serves the VIEW and never throws on a bad claims file, every
//     device told, no vendor call; ⟳'s whole answer is the pool's cause (the owner's morning: no «re-login»).
//   ⑥ A WALL IS NAMED BY WHAT IS TRUE NOW — the unlock drops the locked facts and re-sweeps.
//   ⑦ ONE SENTENCE PER SENTENCE — «Refresh all» groups by what it says; the server's door per cause = the client's.
//   ⑧ WIRING — every engine read of the usage cache is the door or a named stamp read; the lane's walls lift by lane.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'b19f0ecdb';   // master under this commit (2.369.396) — a sha the repository has
const K1R1 = 'b05ea2098';   // K1 round 1 (one basis per connected set of pools) — the per-pool leg's red tree (ref account-reset-door-k1r1)
const MERGED397 = 'c3215f7b5';
const REL397 = 'fd4acdc61';   // the 2.369.397 release (K1 rode it) — K2's and K3's red tree   // the .397 pre-bump tip (the door × relearn, the basis decided per call) — K1's red tree
const ROUND1 = '18104c29c'; // this lane's round 1 (its acceptance said: not accepted) — round 2's pins are red there
const ROUND3 = 'cedee3d11'; // round 3 (not accepted: the sibling fan-out wrote a refusal without its stamp…) — round 4's pins are red there
const ROUND4 = 'd0c5a8799'; // round 4 (not accepted: the status rule silenced a real reset after an honest 100 %) — round 5's pins are red there
const ROUND2 = 'db0e0220b'; // round 2 (not accepted: a refusal over a mark, a rejection's 100 %, a twin's bucket…) — round 3's pins are red there
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reset-door-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return !!c; }
const quiet = async (fn) => { const o = console.log, w = console.warn, e = console.error, lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = console.log; console.error = console.log; try { const r = await fn(); return { r, lines }; } finally { console.log = o; console.warn = w; console.error = e; } };

function archive(rev, tag) {
  try {
    if (spawnSync('git', ['cat-file', '-e', `${rev}^{commit}`], { cwd: REPO }).status !== 0) return null;
    const ar = spawnSync('git', ['archive', '--format=tar', rev, 'src', 'data/bin', 'package.json', 'public/style.css', 'scripts/ci.mjs'], { cwd: REPO, maxBuffer: 1 << 30 });   // + the two files the page leg reads (K3)
    if (ar.status !== 0) return null;
    const dst = path.join(ROOT, tag); fs.mkdirSync(dst, { recursive: true });
    if (spawnSync('tar', ['-x', '-C', dst], { input: ar.stdout, maxBuffer: 1 << 26 }).status !== 0) return null;
    fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules')), path.join(dst, 'node_modules'));
    const bv = path.join(REPO, 'src/lib/build-version.js');
    if (fs.existsSync(bv) && !fs.existsSync(path.join(dst, 'src/lib/build-version.js'))) fs.copyFileSync(bv, path.join(dst, 'src/lib/build-version.js'));
    return dst;
  } catch { return null; }
}
const reqOf = (T) => createRequire(path.join(T, 'package.json'));
const esm = (T, rel) => import(pathToFileURL(path.join(T, rel)).href);
const NOW = Date.now(), S = Math.floor(NOW / 1000), H = 3600e3, RC = S + 4 * 86400;
const FABLE = 'model:fable';
// THE LANE KEYS OF THE TREE UNDER TEST: round 1 (18104c29c) spelled them '5h' / '7d' / 'cap:<name>' — its red controls are
// asked in its own spelling, so each is red for what it does, never for a name
const K = (T) => { let q = null; try { q = reqOf(T)('./src/quota-model.js'); } catch { } return q && typeof q.laneOfBucket === 'function' ? { five: 'plan:5h', week: 'plan:7d', fable: FABLE } : { five: '5h', week: '7d', fable: 'cap:fable' }; };
// the owner's morning: a panel read 836 min ago left the Fable cap at 97 %, a turn re-read 5h/7d an hour ago
const reading = ({ at = NOW - H, capAt = NOW - 836 * 60e3, fable = 0.97, weekly = 0.08, five = 0.2 } = {}) => ({
  fetchedAt: at, scopedFetchedAt: capAt, source: 'on-demand',
  fiveHour: { utilization: five, resetsAt: S + 3600 }, sevenDay: { utilization: weekly, resetsAt: S + 3 * 86400 },
  scopedWeekly: [{ name: 'Fable', utilization: fable, resetsAt: RC }],
});
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });

// ── a store + the one write path, as the hub wires them (usage-routes: onVendorReset → noteResetSeen) ──────────────────
function writeWorld(T, { claimAt = NOW - 30 * 60e3, prev = reading() } = {}) {
  const r = reqOf(T);
  const W = r('./src/usage-cache-write.js'), C = r('./src/usage-reset-claim.js');
  const dir = fs.mkdtempSync(path.join(ROOT, 'cache-'));
  let t = claimAt; const lines = [];
  const store = C.create({ file: null, now: () => t, log: (l) => lines.push(String(l)) });
  const heard = [];
  const mine = (e) => !e.cacheDir || path.resolve(e.cacheDir) === path.resolve(dir);
  const offs = [typeof W.onVendorReset === 'function' ? W.onVendorReset((e) => { if (!mine(e)) return; heard.push(e); try { store.noteResetSeen(e.key, e.resets); } catch { } }) : () => { },
    typeof W.onLanesRead === 'function' ? W.onLanesRead((e) => { if (mine(e)) try { store.noteLanesRead(e.key, e.lanes); } catch { } }) : () => { }];
  const off = () => offs.forEach((f) => f());
  const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { };
  try { W.writeCacheObject({ cacheDir: dir, key: 'sub-a', obj: prev, measuredAt: prev.fetchedAt, source: prev.source, backend: 'claude' }); } finally { console.log = o; console.warn = w; }
  return { r, W, C, dir, store, heard, lines, off, at: (v) => { t = v; }, read: () => W.readCacheObject(dir, 'sub-a') };
}
const muted = (fn) => { const o = console.log, w = console.warn, e = console.error; console.log = () => { }; console.warn = () => { }; console.error = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; console.error = e; } };
const outcomes = (x) => x.store.outcomesOf('sub-a').map((o) => `${o.lane}:${o.state}`).sort().join(',');
// the producers' REAL write shapes
const PRODUCERS = {
  panel: (x, { fable, five = 0.21, weekly = 0.09, at = Date.now() }) => muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...x.read(), limits: undefined, fetchedAt: at, scopedFetchedAt: at, source: 'on-demand',
    fiveHour: { utilization: five, resetsAt: S + 3600 }, sevenDay: { utilization: weekly, resetsAt: S + 3 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: fable, resetsAt: RC }] }, measuredAt: at, source: 'on-demand', backend: 'claude', authoritativeScopes: ['model'],
    ...(typeof x.W.lanesReadAt === 'function' ? { stated: { fiveHour: {}, sevenDay: {}, scopedWeekly: [{ name: 'Fable' }] } } : {}) })),   // usage-routes' panel: `stated: cliPanel` (pinned)
  // the shipped statusline (data/bin/vibespace-usage) writes the file ITSELF; its reader compares it (usage-routes ingest)
  statusline: (x, { fable = null, overageIncluded = null, onlyScoped = false, T }) => {
    const before = x.read();
    const rl = onlyScoped ? {} : { five_hour: { used_percentage: 21, resets_at: S + 3600 }, seven_day: { used_percentage: 9, resets_at: S + 3 * 86400 } };
    if (fable != null) rl.model_scoped = [{ display_name: 'Fable', utilization: fable, resets_at: RC }];
    if (overageIncluded != null) rl.seven_day_overage_included = { used_percentage: overageIncluded, resets_at: RC };
    const env = { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', VIBESPACE_USAGE_CACHE: x.dir, VIBESPACE_ACCOUNT_KEY: 'sub-a', HOME: ROOT };
    const f = path.join(x.dir, 'sub-a.json'), old = new Date(Date.now() - 60e3); try { fs.utimesSync(f, old, old); } catch { }   // past its 8 s write throttle
    const p = spawnSync(process.execPath, [path.join(T, 'data/bin/vibespace-usage')], { input: JSON.stringify({ session_id: 's1', rate_limits: rl }), env, timeout: 10000 });
    const after = x.read();
    muted(() => { if (typeof x.W.noteDirectWrite === 'function') x.W.noteDirectWrite('sub-a', before, after, { cacheDir: x.dir }); else if (typeof x.W.noteVendorResets === 'function') x.W.noteVendorResets('sub-a', before, after); });
    return p.status;
  },
  'rate-limit-event': (x, { kind = 'fiveHour', utilization, resetsAt = S + 3600, status = 'allowed', source, now = Date.now(), scopedName = null }) => muted(() => x.r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: x.dir, key: 'sub-a', identityIds: ['sub-a'],
    ev: { kind, status, utilization, resetsAt, overage: {}, ...(scopedName ? { scopedName } : {}) }, now, ...(source ? { source } : {}) })),
  // the CLI's own limit banner: markLimitBanner's write (the scoped bucket bumped dead, fetchedAt now, limits dropped)
  banner: (x) => muted(() => { const c = { ...x.read() }; c.scopedWeekly = (c.scopedWeekly || []).map((b) => (/fable/i.test(b.name) ? { ...b, state: undefined, utilization: 1, status: 'limited' } : b)); c.fetchedAt = Date.now(); c.source = 'limit-banner'; delete c.limits;
    return x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: c, measuredAt: c.fetchedAt, source: 'limit-banner', backend: 'claude', ...(typeof x.W.lanesReadAt === 'function' ? { stated: [FABLE], refused: [FABLE] } : {}) }); }),   // the engine's markLimitBannerNow call (the wiring leg pins it)
  // the stream wall (src/server/stream-wall.js): ONE typed limit named by its id, the file's other fields carried
  'stream-wall': (x) => muted(() => { const q = x.r('./src/quota-model.js'); const prev = x.read(); const { limits: _l, source: _s, ...carried } = prev; const at = Date.now();
    const set = q.makeLimitSet({ identity: 'sub-a', fetchedAt: null, source: 'stream', limits: [q.makeLimit({ limitId: FABLE, name: FABLE, scope: 'model', source: 'stream', fetchedAt: at, windows: [{ kind: '7d', usedPct: 100, resetsAt: RC, measuredAt: at }] })] });
    return x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...carried, backend: 'claude', source: 'stream' }, set, measuredAt: at, source: 'stream', backend: 'claude', ...(typeof x.W.lanesReadAt === 'function' ? { stated: [FABLE], refused: [FABLE] } : {}) }); }),   // src/server/stream-wall.js's call (pinned)
};
const require_overlay = (T) => reqOf(T)('./src/usage-estimator.js').overlayCache;
const laneUsedOf = (w) => (w ? (w.usedPct ?? (w.utilization != null ? Math.round(w.utilization * 10000) / 100 : null)) : null);
const capOf = (q, v) => (v && Array.isArray(v.scopedWeekly) ? v.scopedWeekly.find((b) => /fable/i.test(b.name)) : null);
const capState = (q, v) => { const b = capOf(q, v); return b ? q.windowDisplay(b, Date.now()).state : 'none'; };

// ── the REAL pool engine (the storm harness shape): two members, Fable 100 % on both, the pool default on B ──────────────
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
  return { r, eng, am, P, id, sessions, arms, mkSession, tagOf, claim, cacheDir, est: app.locals.usageEstimator, linkOf: (sid) => tagOf(am.poolCurrentFor(P, sid)) };
}
// ── K1's world (主开发's rebuild drive-basis shape): a hot pool A, B, C (default A), 5h at 88 / 50 / 30 % read 2 h ago — A sits
// in the raw-usable / estimated-dead band (12 % left raw; 4 % by its burn: the estimate = the reading + 8 points; the hot line is
// 10 % left). `learning` = the member on its first learn (no estimate; basisRaw true for any set that holds it); `pool2` = a
// second pool listing only B (it shares B with the first)
function basisWorld(T, { learning = 'C', pool2 = false, onProbe = null, tags = ['A', 'B', 'C'], rd = {}, def = 'A', more = [], onFire = null } = {}) {
  const r = reqOf(T);
  const engMod = r('./src/server/usage-pool-engine.js'), { AccountManager } = r('./src/accounts.js'), { ClaudeCodeAdapter } = r('./src/adapters/claude-code.js');
  const root = fs.mkdtempSync(path.join(ROOT, 'basis-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  const am = new AccountManager({ dataDir }), id = {};
  for (const tag of tags) { id[tag] = am.createSubscription({ name: 'acct-' + tag.toLowerCase() }).id; fs.writeFileSync(path.join(am.subDir(id[tag]), '.credentials.json'), CREDS(id[tag]), { mode: 0o600 }); }
  const P = am.createPool({ name: 'pool-x', members: [id.A, id.B, id.C] }).id; am.setPoolTarget(P, id[def]); am.updatePool(P, { auto: true, hot: true });
  const P2 = pool2 ? am.createPool({ name: 'pool-y', members: [id.B] }).id : null;
  if (P2) { am.setPoolTarget(P2, id.B); am.updatePool(P2, { auto: true, hot: true }); }
  const extra = {}; // more pools: [name, member tags] — null = no member list (every subscription of the backend)
  for (const [nm, mem] of more) { extra[nm] = am.createPool({ name: nm, ...(mem ? { members: mem.map((t) => id[t]) } : {}) }).id; am.setPoolTarget(extra[nm], id[(mem || tags)[0]]); am.updatePool(extra[nm], { auto: true, hot: true }); }
  fs.mkdirSync(cacheDir, { recursive: true });
  const rd5 = (u5) => ({ fetchedAt: NOW - 2 * H, source: 'on-demand', fiveHour: { utilization: u5, resetsAt: S + 2 * 3600 }, sevenDay: { utilization: 0.08, resetsAt: S + 4 * 86400 } });
  const R = { A: 0.88, B: 0.5, C: 0.3, D: 0.4, ...rd };
  for (const t of tags) fs.writeFileSync(path.join(cacheDir, id[t] + '.json'), JSON.stringify(rd5(R[t])));
  const sessions = new Map(), arms = [];
  const autoResume = { armIfEnabled: (sid, s, until, why) => arms.push({ sid, why: String(why || '').slice(0, 100) }), noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget(sid, n, reason) { arms.push({ noPoolTarget: reason, sid }); }, statusFor: () => null, enabledFor: () => false, fireNow(sid, why) { if (onFire) onFire(sid, why); }, armedIds: () => [], refreshStatus() { } };
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => { }, serverSetting: () => undefined, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume, getQuotaProbe: () => (onProbe ? (t) => { onProbe(t); return false; } : null), getSessionMetaStore: () => null,
  });
  const est = app.locals.usageEstimator, st = { learning };
  est.basisRaw = (ids) => !!st.learning && (ids || []).includes(id[st.learning]);
  est.estimateFor = (aid, raw) => { if (st.learning && aid === id[st.learning]) return null; if (!raw || !raw.fiveHour) return null; return { fiveHour: { ...raw.fiveHour, utilization: raw.fiveHour.utilization + 0.08 }, sevenDay: raw.sevenDay, scopedWeekly: [] }; };
  const mkSession = (sid, member) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } }, _isStreaming: false, _turnState: 'idle', _spawnModel: 'claude-sonnet-4-5' }; sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, id[member], { why: 'drill' }); return s; };
  const mkDirect = (sid, tag) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: id[tag], name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } }, _isStreaming: false, _turnState: 'idle', _spawnModel: 'claude-sonnet-4-5' }; sessions.set(sid, s); return s; };
  const tagOf = (x) => Object.keys(id).find((k) => id[k] === x) || x;
  const viewOf = (rc, ts = ['A', 'B', 'C']) => ts.map((t) => { const c = rc(id[t]) || {}; return `${t}:${Math.round(((c.fiveHour || {}).utilization || 0) * 100)}${c.estimated ? 'e' : 'r'}`; }).join(' ');
  // the learn LANDS: nobody is learning any more, and the estimator says so the way it does when rates land (basisGen)
  const learnLands = () => { st.learning = null; est.basisGen = (est.basisGen || 0) + 1; };
  return { r, eng, am, P, P2, extra, id, sessions, arms, mkSession, mkDirect, tagOf, viewOf, st, est, learnLands, linkOf: (sid) => tagOf(am.poolCurrentFor(P, sid)), defaultOf: () => tagOf(am.poolCurrent(P)) };
}
async function enginePass(T, { switchFirst }) {
  const w = engineWorld(T);
  const lines = [];
  const run = async (fn) => { const q = await quiet(fn); lines.push(...q.lines); return q.r; };
  await run(() => w.eng.sweepUsageAnchors());          // the production state: every reading anchored (boot + 20 s, then each minute)
  const c = w.claim('A', [K(T).fable]);
  if (!c.ok) return { ok: false, detail: `the claim on ${K(T).fable} was refused: ${c.code}` };
  const out = { links: [] };
  const tick = async () => { await run(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true })); out.links.push(w.linkOf('s1')); };
  const choose = async () => { out.chooser = w.tagOf(await run(() => w.eng.poolChooserForModel(w.P, { model: 'claude-fable-5-1' }))); if (!w.sessions.has('s1')) w.mkSession('s1', out.chooser === 'A' || out.chooser === 'B' ? out.chooser : 'B'); };
  const verdict = async () => { const v = await run(() => w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5-1', session: w.sessions.get('s1') })); out.verdict = v && v.usable ? 'usable via ' + w.tagOf(v.viaId) : 'unusable'; };
  if (switchFirst) { w.mkSession('s1', 'A'); await tick(); await choose(); await verdict(); await tick(); await tick(); }
  else { await choose(); await verdict(); await tick(); await tick(); await tick(); }
  const view = w.eng.poolReadCache(w.P)(w.id.A);
  const fab = capOf(null, view);
  out.estFable = fab ? Math.round((Number(fab.utilization) || 0) * 100) : null;
  out.spawnSaid = lines.filter((l) => /spawn on .*on your reset claim/.test(l)).length;
  out.movedSaid = lines.filter((l) => /per-session switch .*on your reset claim/.test(l)).length;
  out.defaultSaid = lines.filter((l) => /auto-switch .*on your reset claim/.test(l)).length;
  out.noTarget = w.arms.filter((a) => a.noPoolTarget).length;
  out.w = w;
  return out;
}

// ── THE CENSUS OF EVERY READ OF THE USAGE CACHE (ROOT 1, r3) ─────────────────────────────────────────────────────────────
// A read site = a non-comment line that reads a file or calls a cache reader (readFileSync / readCacheObject /
// readRawUsageCache) and names the cache (USAGE_CACHE_DIR, cacheDir, usage-cache, cacheFileFor) — every spelling, every file
// under src/. Each file's count is a row with why; a file with no row and one site is red, a count that moved is red.
const CACHE_READ_ROWS = {
  'src/server/usage-pool-engine.js': [31, 'THE reading door (poolReadReading; poolReadCache over it) + reads of STAMPS and refusals, never a quota decision: the anchor sweep (persists readings), the api-window sidecar, readRawUsageCache (overage / credits facts, the spend guard, a held record\'s fetchedAt, the wall\'s lane by the stored number, reset credits, a refusal\'s spent window and untils), the writers\' bases (the banner and its twins, get_usage, the codex push), the freshness gate, ownReading'],
  'src/usage-routes.js': [17, 'the passive ingest (the files as stored — /api/usage views them), the models file, host readings, the remote statusline\'s base, the panel\'s base, the repair, the claim route\'s reading, writers\' bases'],
  'src/reading-repair.js': [13, 'the identity repair (its own reads and replace-writes)'],
  'src/usage-cache-write.js': [6, 'THE write path (its reader, its file, its sidecars)'],
  'src/rate-limit-capture.js': [4, 'the event\'s base and its twins\' (a writer)'],
  'src/weekly-lanes-unfold.js': [4, 'the weekly-lanes repair'],
  'src/server/migrations.js': [3, 'the boot migrations over the cache dir'],
  'src/quota-model-migrate.js': [2, 'the backfill migration'],
  'src/server/stream-wall.js': [2, 'the stream wall\'s own write base and its room line'],
  'src/server/account-usage-routes.js': [2, 'the accounts routes\' cache paths (an account removed: its files)'],
  'src/server/auto-cli-loop.js': [1, 'the auto-cli pacing: the stored fetchedAt / drift'],
  'src/window-stamp.js': [1, 'the established-window sidecar'],
  'src/agentd/agentd.js': [1, 'the DEVICE\'s own ~/.vibespace/usage-cache (the usage-scan op) — not the hub\'s'],
  'src/server/agent-tool-generators.js': [1, 'creates data/usage-cache for the shipped statusline'],
  'src/mounts.js': [5, 'another cache named cacheDir (the mounts\' own)'],
  'src/server/browser-keeper.js': [2, 'another cache named cacheDir (the browser\'s)'],
  'src/server/browser-display-config.js': [1, 'another cache named cacheDir (the browser\'s)'],
  'src/server/cli-env.js': [2, 'another cache named cacheDir (a CLI\'s)'],
};
// r4: EVERY TOUCH, not one spelling — a line that names the cache (USAGE_CACHE_DIR, usage-cache, cacheDir, a cache-file
// builder, a cache reader) and reads it, lists it or BUILDS A PATH into it (a read on the next line starts here), or that
// aliases the dir; async reads (readFile / fs.promises) count like sync ones
const CACHE_NAMED = /USAGE_CACHE_DIR|usage-cache|\bcacheDir\b|cacheFileFor\(|\bfileFor\(|readCacheObject\(|readRawUsageCache\(/;
const CACHE_TOUCH = /readFile|readdir|createReadStream|path\.join\(|cacheFileFor\(|\bfileFor\(|readCacheObject\(|readRawUsageCache\(|\bopen(Sync)?\(/;
const CACHE_ALIAS = /=\s*(?:[\w.]+\.)?USAGE_CACHE_DIR\s*[;,)]/;
// r5 (smaller 3): THE CACHE DIR UNDER ANOTHER NAME — a file's own aliases of it are collected first (an assignment, a
// DESTRUCTURED name `{ USAGE_CACHE_DIR: X } = …`, a FIELD of another name `this.k = cacheDir` / `{ k: USAGE_CACHE_DIR }`),
// then every line that touches a file through one of them counts as a read of the cache
const DIR_EXPR = String.raw`(?:[\w.]+\.)?(?:USAGE_CACHE_DIR|cacheDir)`;
const ALIAS_DEFS = [new RegExp(String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*` + DIR_EXPR + String.raw`\s*[;,)]`), new RegExp(String.raw`\b(?:this|\w+)\.(\w+)\s*=\s*` + DIR_EXPR + String.raw`\s*[;,)]`, 'g'), new RegExp(String.raw`\b(\w+)\s*:\s*` + DIR_EXPR + String.raw`\s*[,}]`, 'g')];
function aliasesOf(text) {
  const names = new Set(), fields = new Set();
  for (const l of text.split('\n')) {
    const t = l.trim(); if (t.startsWith('//') || t.startsWith('*')) continue;
    const v = ALIAS_DEFS[0].exec(l); if (v) names.add(v[1]);
    for (const m of l.matchAll(ALIAS_DEFS[1])) fields.add(m[1]);
    for (const m of l.matchAll(ALIAS_DEFS[2])) { if (/\{[^}]*\}\s*=/.test(l)) names.add(m[0].split(':')[1].trim().replace(/[,}]$/, '').trim()); else if (m[1] !== 'cacheDir') fields.add(m[1]); }
    const d = /\{([^}]*)\}\s*=/.exec(l); if (d) for (const part of d[1].split(',')) { const [k, alias] = part.split(':').map((x) => x && x.trim()); if (alias && /^(?:USAGE_CACHE_DIR|cacheDir)$/.test(k)) names.add(alias); }
  }
  for (const n of [...names]) if (!/^\w+$/.test(n) || /^(?:USAGE_CACHE_DIR|cacheDir)$/.test(n)) names.delete(n);
  return { names: [...names], fields: [...fields] };
}
const countReads = (text) => {
  const { names, fields } = aliasesOf(text);
  const via = names.length || fields.length ? new RegExp([...names.map((n) => String.raw`\b${n}\b`), ...fields.map((f) => String.raw`\.${f}\b`)].join('|')) : null;
  return text.split('\n').filter((l) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*')) && ((CACHE_NAMED.test(l) && CACHE_TOUCH.test(l)) || CACHE_ALIAS.test(l) || (via && CACHE_TOUCH.test(l) && via.test(l))); }).length;
};
const _censusOf = new Map();   // one walk of a tree's src/ per run; a planted scratch copy is counted in its file's place
function cacheReadCensus(T, swap = {}) {
  if (!_censusOf.has(T)) {
    const counts = {};
    // a checkout: `git grep` hands back only the lines that read (the fast row's budget); an archive (the controls): a walk
    // a checkout: `git grep -l` names the files that mention the cache at all (the fast row's budget) and each is read
    // WHOLE — its aliases' reads are on lines that do not name it (r5); an archive (the controls): a walk
    const g = fs.existsSync(path.join(T, '.git')) ? spawnSync('git', ['grep', '-I', '-l', '-E', 'USAGE_CACHE_DIR|usage-cache|cacheDir|cacheFileFor\\(|fileFor\\(|readCacheObject\\(|readRawUsageCache\\(', '--', 'src/*.js', 'src/**/*.js'], { cwd: T, encoding: 'utf8', maxBuffer: 1 << 26 }) : null;
    if (g && g.status === 0) {
      for (const rel of g.stdout.split('\n').filter(Boolean)) { const n = countReads(fs.readFileSync(path.join(T, rel), 'utf8')); if (n) counts[rel] = n; }
      _censusOf.set(T, counts);
    }
  }
  if (!_censusOf.has(T)) {
    const counts = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; } if (!e.name.endsWith('.js')) continue;
      const n = countReads(fs.readFileSync(p, 'utf8')); if (n) counts[path.relative(T, p).split(path.sep).join('/')] = n; } };
    walk(path.join(T, 'src'));
    _censusOf.set(T, counts);
  }
  const counts = { ..._censusOf.get(T) };
  for (const [rel, copy] of Object.entries(swap)) { const n = countReads(fs.readFileSync(copy, 'utf8')); if (n) counts[rel] = n; else delete counts[rel]; }
  const total = Object.values(counts).reduce((x, y) => x + y, 0);
  const bad = [];
  for (const [f, n] of Object.entries(counts)) { const row = CACHE_READ_ROWS[f]; if (!row) bad.push(`${f}: ${n} read(s) of the usage cache, no row`); else if (row[0] !== n) bad.push(`${f}: ${row[0]} → ${n} reads — classify the new read, then move the count`); }
  for (const f of Object.keys(CACHE_READ_ROWS)) if (!counts[f]) bad.push(`${f}: a dead row`);
  return { counts, total, bad };
}

// ── the legs: (T) → { ok, detail } ────────────────────────────────────────────────────────────────────────────────────
const LEGS = {
  async 'view'(T) {
    const q = reqOf(T)('./src/quota-model.js');
    if (typeof q.withResetClaim !== 'function') return { ok: false, detail: 'no reset claim view (quotaModel.withResetClaim)' };
    const raw = reading();
    const lanes = q.lanesOfReading(raw).map((x) => x.lane).join(',');
    const v = q.withResetClaim(raw, { lanes: { [K(T).fable]: { at: NOW - 1000 } } });
    const all = q.withResetClaim(raw, { lanes: { [K(T).five]: { at: NOW - 1000 }, [K(T).week]: { at: NOW - 1000 }, [K(T).fable]: { at: NOW - 1000 } } });
    const allStates = ['fiveHour', 'sevenDay'].map((k) => q.windowDisplay(all[k], NOW).state).concat(capState(q, all));
    const newer = q.withResetClaim({ ...raw, scopedFetchedAt: NOW }, { lanes: { [K(T).fable]: { at: NOW - 1000 } } });
    const refusal = q.withResetClaim({ ...raw, limits: [{ limitId: 'model:fable', name: 'Fable', scope: 'model', source: 'stream', fetchedAt: NOW, windows: [{ kind: '7d', usedPct: 100, resetsAt: RC, measuredAt: NOW - H, refusedAt: NOW }] }] }, { lanes: { [K(T).fable]: { at: NOW - 1000 } } });   // the vendor refused it after the claim
    const stored = JSON.stringify(raw) === JSON.stringify(reading());
    return { ok: lanes === `${K(T).five},${K(T).week},${K(T).fable}` && capState(q, v) === 'reset-unconfirmed' && q.windowDisplay(v.sevenDay, NOW).state === 'read' && v.resetClaims && v.resetClaims[K(T).fable] > 0
      && allStates.every((s) => s === 'reset-unconfirmed') && q.memberProofState(all, NOW) === 'reset-unconfirmed' && capState(q, newer) === 'reset-unconfirmed' && capState(q, refusal) === 'read' && stored,
    detail: `lanes ${lanes}; a Fable claim: cap ${capState(q, v)}, weekly ${q.windowDisplay(v.sevenDay, NOW).state}; the whole account: ${allStates.join('/')}; a cap whose stored age is after the claim (the store settles a claim, not an age): ${capState(q, newer)}; a cap the vendor refused after the claim: ${capState(q, refusal)}; the stored reading untouched: ${stored}` };
  },
  // ROOT 1 — the real engine after its own anchor sweep, the switch pass FIRST and the chooser first
  async 'engine'(T) {
    const a = await enginePass(T, { switchFirst: false }), b = await enginePass(T, { switchFirst: true });
    if (a.ok === false) return a;
    const stays = (p) => p.links.every((l) => l === 'A');
    const good = (p) => p.chooser === 'A' && p.verdict === 'usable via A' && stays(p) && p.movedSaid === 0 && p.noTarget === 0 && p.estFable != null && p.estFable < 5;
    const once = (p) => p.spawnSaid <= 1 && p.defaultSaid <= 1 && p.spawnSaid + p.defaultSaid >= 1;   // each act the claim decided said once — never per tick
    return { ok: good(a) && good(b) && once(a) && once(b) && a.spawnSaid === 1,
      detail: ['chooser first', 'switch first'].map((k, i) => { const p = [a, b][i]; return `${k}: chooser ${p.chooser} · verdict ${p.verdict} · link over 3 ticks ${p.links.join('→')} · spawn said ${p.spawnSaid}× · moves said ${p.movedSaid}× · default moved on the claim said ${p.defaultSaid}× · «no member» told ${p.noTarget}× · A's Fable estimate ${p.estFable}%`; }).join(' | ') };
  },
  // THE ESTIMATE AT THE CLAIM (the GO's notes): an anchor line is never written from a view; a claimed lane is estimated
  // from its claim; a reading NEWER than the claim is the anchor as it is; the memo never hands a view's answer to the bare
  // reading (a claim that settles or expires turns the view into the reading — its key moves with it)
  async 'estimate-at-claim'(T) {
    const w = engineWorld(T);
    const c = w.claim('A', [K(T).fable]);                       // the claim BEFORE the first sweep: the anchor is written after it
    if (!c.ok) return { ok: false, detail: `claim refused: ${c.code}` };
    await quiet(() => w.eng.sweepUsageAnchors());
    const E = w.eng.usageEstimator;
    const ident = E.resolveIdentity(w.id.A);
    const lines = ident && ident.identityKey ? E.lines(ident.identityKey) : [];
    const last = lines[lines.length - 1];
    const fabAnchor = last && last.buckets && (last.buckets.scopedWeekly || []).find((b) => /fable/i.test(b.name));
    const rawFable = (JSON.parse(fs.readFileSync(path.join(w.cacheDir, w.id.A + '.json'), 'utf8')).scopedWeekly || [])[0];
    const anchorRaw = !!fabAnchor && Math.round(Number(fabAnchor.u) * 100) === 100 && Number(fabAnchor.resetsAt) === Number(rawFable.resetsAt) && !fabAnchor.claimedAt;
    const now = Date.now();
    const view = w.eng.poolReadCache(w.P);   // the decision door
    const fabOf = (o) => { const b = capOf(null, o); return b ? Math.round((Number(b.utilization) || 0) * 100) : null; };
    const viewed = fabOf(view(w.id.A));
    const raw = JSON.parse(fs.readFileSync(path.join(w.cacheDir, w.id.A + '.json'), 'utf8'));
    const bare = fabOf(require_overlay(T)(raw, E.estimateFor(w.id.A, raw, now)));   // the SAME second: the bare reading's own estimate
    const viewedAgain = fabOf(view(w.id.A));
    // a real reading of the cap AFTER the claim (50 %): it settles the claim, and it is the anchor as it is
    await quiet(() => w.r('./src/usage-cache-write.js').writeCacheObject({ cacheDir: w.cacheDir, key: w.id.A, obj: { ...raw, limits: undefined, fetchedAt: now + 1000, scopedFetchedAt: now + 1000, scopedWeekly: [{ ...rawFable, utilization: 0.5 }] }, measuredAt: now + 1000, source: 'on-demand', backend: 'claude', stated: [K(T).fable] }));
    await quiet(() => w.eng.sweepUsageAnchors());
    const after = fabOf(w.eng.poolReadCache(w.P)(w.id.A));
    return { ok: anchorRaw && viewed === 0 && bare === 100 && viewedAgain === 0 && after === 50,
      detail: `the anchor swept after the claim is the READING (Fable ${fabAnchor ? Math.round(fabAnchor.u * 100) + ' %, its own reset ' + (Number(fabAnchor.resetsAt) === Number(rawFable.resetsAt)) : 'none'}); the decision's estimate under the claim ${viewed} %; the bare reading's in the same second ${bare} %; the claim's again ${viewedAgain} %; after a 50 % reading newer than the claim ${after} %` };
  },
  // MUST 8 — the placement line only when the claim decided it: the default A already serves (nobody else can) ⇒ no line
  async 'said-when-decided'(T) {
    const w = engineWorld(T, { def: 'A' });
    await quiet(() => w.eng.sweepUsageAnchors());
    const c = w.claim('A', [K(T).fable]);
    if (!c.ok) return { ok: false, detail: `claim refused: ${c.code}` };
    // B is also spent; with the claim A serves; without it nobody does and the chooser keeps its default A — the SAME place
    const q = await quiet(() => w.eng.poolChooserForModel(w.P, { model: 'claude-fable-5-1' }));
    const said = q.lines.filter((l) => /on your reset claim/.test(l)).length;
    return { ok: w.tagOf(q.r) === 'A' && said === 0, detail: `default A, everyone spent, a claim on A: placed on ${w.tagOf(q.r)}, «on your reset claim» said ${said}× (the readings would have placed it there too)` };
  },
  // MUST 3 — a seen reset lifts only the walls from ITS lane
  async 'walls-by-lane'(T) {
    const w = engineWorld(T);
    if (typeof w.eng.noteSessionWall !== 'function') return { ok: false, detail: 'session walls record no lane (noteSessionWall not lane-aware): a reset of any lane lifts every wall on the member' };
    const A = w.id.A, now = Date.now();
    w.eng.noteSessionWall('s-7d', A, now, K(T).week); w.eng.noteSessionWall('s-fab', A, now, K(T).fable); w.eng.noteSessionWall('s-unk', A, now, null);
    const W = w.r('./src/usage-cache-write.js');
    await quiet(() => W.noteVendorResets(A, reading({ capAt: NOW - H }), { ...reading({ at: NOW }), scopedWeekly: [{ name: 'Fable', utilization: 0.1, resetsAt: RC, asOf: NOW }] }));
    const left = ['s-7d', 's-fab', 's-unk'].filter((sid) => w.eng._sessionWalls.get(sid)?.has(A));
    return { ok: left.join(',') === 's-7d,s-unk', detail: `a Fable reset seen; walls left on the member: ${left.join(', ') || 'none'} (the weekly wall and the unknown one keep their 10 min)` };
  },
  // ROOT 2 (a) — a 5h-only rate_limit_event after a weekly claim, and a Fable banner after a whole-account claim
  async 'lane-a'(T) {
    const x = writeWorld(T);
    const r1 = x.store.claim('sub-a', [K(T).week], x.read()); if (!r1.ok) return { ok: false, detail: `claim refused: ${r1.code}` };
    x.at(NOW + 1000);
    PRODUCERS['rate-limit-event'](x, { kind: 'fiveHour', utilization: 0.3 });
    const v1 = x.store.viewOf('sub-a', x.read());
    const after5h = outcomes(x), still7d = !!x.store.get('sub-a');
    const y = writeWorld(T);
    y.store.claim('sub-a', 'all', y.read());
    y.at(NOW + 1000);
    PRODUCERS.banner(y);
    y.store.viewOf('sub-a', y.read());
    const afterBanner = outcomes(y), lanesLeft = Object.keys((y.store.get('sub-a') || {}).lanes || {}).sort().join(',');
    x.off(); y.off();
    return { ok: still7d && !after5h && afterBanner === `${K(T).fable}:contradicted` && lanesLeft === [K(T).five, K(T).week].sort().join(',') && !!v1,
      detail: `a 5h event after a weekly claim: outcomes [${after5h}], the weekly claim stands ${still7d}; a Fable banner after a whole-account claim: outcomes [${afterBanner}], still claimed [${lanesLeft}]` };
  },
  // ROOT 2 (b) — the shipped statusline's cap reading (asOf now, the file's scopedFetchedAt 14 h old)
  async 'lane-b'(T) {
    const x = writeWorld(T);
    x.store.claim('sub-a', [K(T).fable], x.read());
    x.at(NOW + 1000);
    const st = PRODUCERS.statusline(x, { fable: 97, T });
    const q = x.r('./src/quota-model.js');
    const v = x.store.viewOf('sub-a', x.read());
    const contra = outcomes(x), drawn = capState(q, v);
    const age = (q.lanesOfReading(x.read()).find((l) => l.lane === K(T).fable) || {}).at;
    const y = writeWorld(T);
    y.at(NOW + 1000);
    PRODUCERS.statusline(y, { fable: 10, T });
    const seen = y.heard.flatMap((e) => e.resets.map((r) => `${r.lane}:${r.before}->${r.after}`)).join(',');
    x.off(); y.off();
    return { ok: st === 0 && contra === `${K(T).fable}:contradicted` && drawn === 'read' && age > NOW - 60e3 && seen === `${K(T).fable}:97->10`,
      detail: `statusline exit ${st}; Fable still 97: outcomes [${contra}], drawn ${drawn}, the lane's age ${age ? Math.round((Date.now() - age) / 60e3) + ' min' : '?'}; Fable 97→10: reset seen [${seen}]` };
  },
  // ROOT 2 (c) — the CLI's own limit banner on a claimed cap settles it and brings the wall back at once
  async 'lane-c'(T) {
    const x = writeWorld(T);
    x.store.claim('sub-a', [K(T).fable], x.read());
    x.at(NOW + 1000);
    PRODUCERS.banner(x);
    const q = x.r('./src/quota-model.js'), P = x.r('./src/account-pool-auto.js'), F = x.r('./src/model-family.js');
    const v = x.store.viewOf('sub-a', x.read());
    const rem = P.accountRemaining(F.projectCacheForFamily(v, 'fable'), Math.floor(Date.now() / 1000));
    x.off();
    return { ok: outcomes(x) === `${K(T).fable}:contradicted` && !x.store.get('sub-a') && rem && rem.remaining === 0,
      detail: `after the banner: outcomes [${outcomes(x)}], claim left ${JSON.stringify(x.store.get('sub-a'))}, the pool's Fable room on the view ${JSON.stringify(rem)}` };
  },
  // ROOT 2 (d) — the stream wall's lane is the limit id
  async 'lane-d'(T) {
    const x = writeWorld(T);
    x.store.claim('sub-a', [K(T).fable], x.read());
    x.at(NOW + 1000);
    PRODUCERS['stream-wall'](x);
    x.store.viewOf('sub-a', x.read());
    const lanes = x.r('./src/quota-model.js').lanesOfReading(x.read()).map((l) => l.lane).join(',');
    x.off();
    return { ok: outcomes(x) === `${K(T).fable}:contradicted` && !x.store.get('sub-a'), detail: `after the stream wall: lanes [${lanes}], outcomes [${outcomes(x)}], claim left ${JSON.stringify(x.store.get('sub-a'))}` };
  },
  // ROOT 2 (e) — seven_day_overage_included IS the model-cap lane its reset names
  async 'lane-e'(T) {
    const x = writeWorld(T);
    x.store.claim('sub-a', [K(T).fable], x.read());
    x.at(NOW + 1000);
    PRODUCERS.statusline(x, { overageIncluded: 10, T });
    x.store.viewOf('sub-a', x.read());
    const q = x.r('./src/quota-model.js');
    const lanes = q.lanesOfReading(x.read()).map((l) => l.lane).join(',');
    const btn = typeof q.laneOfBucket === 'function' ? q.laneOfBucket(x.read(), 'scoped', 'Overage Included') : '(no laneOfBucket)';
    x.off();
    return { ok: !x.store.get('sub-a') && new RegExp(K(T).fable + ':(confirmed|reset-seen)').test(outcomes(x)) && !/overage/.test(lanes) && btn === K(T).fable,
      detail: `«Overage Included» at 10 % (Fable's reset): lanes [${lanes}], its row's lane ${btn}, outcomes [${outcomes(x)}], claim left ${JSON.stringify(x.store.get('sub-a'))}` };
  },
  // ROOT 2 (f) — a late record (made at 09:00, stamped at arrival) is no reset
  async 'lane-f'(T) {
    const x = writeWorld(T, { prev: { fetchedAt: NOW, source: 'on-demand', sevenDay: { utilization: 0.97, resetsAt: S + 3 * 86400, measuredAt: NOW } } });
    muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { fetchedAt: NOW + 5 * 60e3, source: 'rate-limit-event', sevenDay: { utilization: 0.40, resetsAt: S + 3 * 86400, measuredAt: NOW - 3 * H } }, measuredAt: NOW + 5 * 60e3, source: 'rate-limit-event', backend: 'claude' }));
    x.off();
    return { ok: x.heard.length === 0, detail: `a 09:00 record (40 %) written at 12:05 over a 12:00 reading (97 %): heard as a reset ${x.heard.length}×` };
  },
  // ROOT 2 (g) — a wall's mark followed by a real reading is no reset
  async 'lane-g'(T) {
    const x = writeWorld(T, { prev: { ...reading({ at: NOW - 120e3, capAt: NOW - 120e3, weekly: 0.6 }) } });
    PRODUCERS['rate-limit-event'](x, { kind: 'sevenDay', status: 'rejected', utilization: null, resetsAt: S + 3 * 86400, source: 'wall', now: Date.now() - 60e3 });
    PRODUCERS['rate-limit-event'](x, { kind: 'fiveHour', utilization: 0.3, now: Date.now() - 30e3 });   // a later window's write moves the limit's own source
    muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...x.read(), limits: undefined, fetchedAt: Date.now() + 1000, sevenDay: { utilization: 0.61, resetsAt: S + 3 * 86400 } }, source: 'on-demand', backend: 'claude' }));
    x.off();
    return { ok: x.heard.length === 0, detail: `a wall's 7d mark (100 %), a 5h event, then a real 61 %: heard as a reset ${x.heard.length}× ${JSON.stringify(x.heard.map((e) => e.resets))}` };
  },
  // each producer settles ITS lane and no other; the measuring ones show a reset
  async 'producers'(T) {
    const rows = [];
    for (const [name, own, other, spent, reset] of [
      ['panel', K(T).fable, null, { fable: 0.97 }, { fable: 0.10 }],
      ['statusline', K(T).fable, null, { fable: 97, T }, { fable: 10, T }],
      ['rate-limit-event', K(T).five, K(T).fable, { kind: 'fiveHour', utilization: 0.2 }, { kind: 'fiveHour', utilization: 0.02 }],
      ['banner', K(T).fable, K(T).week, {}, null],
      ['stream-wall', K(T).fable, K(T).week, {}, null],
    ]) {
      const x = writeWorld(T);
      const lanes = [own, ...(other ? [other] : [])];
      const c = x.store.claim('sub-a', lanes, x.read());
      x.at(NOW + 1000);
      PRODUCERS[name](x, spent);
      x.store.viewOf('sub-a', x.read());
      const settledOwn = x.store.outcomesOf('sub-a').some((o) => o.lane === own && o.state === 'contradicted');
      const otherStands = !other || !!((x.store.get('sub-a') || {}).lanes || {})[other];
      x.off();
      let shows = 'n/a';
      if (reset) {
        const y = writeWorld(T);
        y.at(NOW + 1000);
        PRODUCERS[name](y, reset);
        shows = y.heard.some((e) => e.resets.some((r) => r.lane === own)) ? 'yes' : 'no';
        y.off();
      }
      rows.push({ name, ok: c.ok && settledOwn && otherStands && shows !== 'no', text: `${name}: claim ${c.ok ? 'ok' : c.code} · its own lane ${own} contradicted ${settledOwn} · another lane (${other || '-'}) stands ${otherStands} · a reset shown ${shows}` });
    }
    return { ok: rows.every((r) => r.ok), detail: rows.map((r) => (r.ok ? '' : '✗ ') + r.text).join(' | ') };
  },
  // ── ROUND 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  // MUST 1 — A REFUSAL OF THE CLAIMED LANE CONTRADICTS THE CLAIM, WHATEVER THE STORE HELD: the owner's case — the cap was
  // already a wall's mark when the person claimed it; each refusing producer after the claim ends it at once
  async 'refusal-contradicts'(T) {
    const rows = [];
    for (const name of ['stream-wall', 'banner', 'rejected-event', 'wall']) {
      const x = writeWorld(T);
      PRODUCERS['rate-limit-event'](x, { kind: 'scoped', utilization: null, status: 'rejected', resetsAt: RC, source: 'wall', now: Date.now() - 120e3, scopedName: 'fable' });   // walled BEFORE the claim
      const c = x.store.claim('sub-a', [K(T).fable], x.read());
      x.at(Date.now() + 1000);
      if (name === 'stream-wall') PRODUCERS['stream-wall'](x);
      else if (name === 'banner') PRODUCERS.banner(x);
      else PRODUCERS['rate-limit-event'](x, { kind: 'scoped', utilization: null, status: 'rejected', resetsAt: RC, scopedName: 'fable', ...(name === 'wall' ? { source: 'wall' } : {}) });
      const out = outcomes(x), left = !!x.store.get('sub-a');
      x.off();
      rows.push({ name, ok: c.ok && out === `${K(T).fable}:contradicted` && !left, text: `${name}: ${c.ok ? '' : 'claim ' + c.code + ' · '}outcomes [${out}], claim left ${left}` });
    }
    // the REAL engine: walled before the claim, the claim makes A usable (one continue allowed), ONE refusal ends it (none after)
    const w = engineWorld(T);
    const cap = w.r('./src/rate-limit-capture.js');
    await quiet(() => cap.captureRateLimitEvent({ cacheDir: w.cacheDir, key: w.id.A, identityIds: [w.id.A], ev: { kind: 'scoped', scopedName: 'fable', status: 'rejected', utilization: null, resetsAt: RC, overage: {} }, now: Date.now() - 120e3, source: 'wall' }));
    await quiet(() => w.eng.sweepUsageAnchors());
    const cl = w.claim('A', [K(T).fable]);
    w.mkSession('s1', 'A');
    const v1 = (await quiet(() => w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5-1', session: w.sessions.get('s1') }))).r;
    await quiet(() => cap.captureRateLimitEvent({ cacheDir: w.cacheDir, key: w.id.A, identityIds: [w.id.A], ev: { kind: 'scoped', scopedName: 'fable', status: 'rejected', utilization: null, resetsAt: RC, overage: {} }, now: Date.now() + 1000 }));
    const v2 = (await quiet(() => w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5-1', session: w.sessions.get('s1') }))).r;
    const chooser2 = w.tagOf((await quiet(() => w.eng.poolChooserForModel(w.P, { model: 'claude-fable-5-1' }))).r);
    const engOk = cl.ok && v1 && v1.usable && w.tagOf(v1.viaId) === 'A' && !(v2 && v2.usable && w.tagOf(v2.viaId) === 'A') && chooser2 !== 'A';
    return { ok: rows.every((r) => r.ok) && engOk, detail: rows.map((r) => (r.ok ? '' : '✗ ') + r.text).join(' | ') + ` | the REAL engine, A walled before the claim: under the claim ${v1 && v1.usable ? 'usable via ' + w.tagOf(v1.viaId) : 'unusable'}; after ONE refused turn ${v2 && v2.usable ? 'usable via ' + w.tagOf(v2.viaId) : 'unusable'}, a new Fable spawn on ${chooser2}` };
  },
  // MUST 2 — A REJECTION'S 100 % IS A MARK, FROM EVERY WRITER: each rejection writer, then a real reading in the same window
  async 'rejection-is-a-mark'(T) {
    const rows = [];
    for (const [name, write, lane] of [
      ['a rejected 5h event (source rate-limit-event)', (x) => PRODUCERS['rate-limit-event'](x, { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: S + 3600, now: Date.now() - 60e3 }), 'plan:5h'],
      ['a rejected weekly event (source rate-limit-event)', (x) => PRODUCERS['rate-limit-event'](x, { kind: 'sevenDay', status: 'rejected', utilization: null, resetsAt: S + 3 * 86400, now: Date.now() - 60e3 }), 'plan:7d'],
      ['the wall\'s demotion (source wall)', (x) => PRODUCERS['rate-limit-event'](x, { kind: 'sevenDay', status: 'rejected', utilization: null, resetsAt: S + 3 * 86400, source: 'wall', now: Date.now() - 60e3 }), 'plan:7d'],
      ['the limit banner (Fable)', (x) => PRODUCERS.banner(x), FABLE],
      ['the stream wall (Fable)', (x) => PRODUCERS['stream-wall'](x), FABLE],
    ]) {
      const x = writeWorld(T);
      write(x);
      // then a REAL reading of that window at 61 %, the same reset
      const at = Date.now() + 2000, rd = x.read();
      const obj = { ...rd, limits: undefined, fetchedAt: at, scopedFetchedAt: at, source: 'on-demand',
        ...(lane === 'plan:5h' ? { fiveHour: { utilization: 0.61, resetsAt: S + 3600 } } : lane === 'plan:7d' ? { sevenDay: { utilization: 0.61, resetsAt: S + 3 * 86400 } } : { scopedWeekly: [{ name: 'Fable', utilization: 0.61, resetsAt: RC }] }) };
      muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj, measuredAt: at, source: 'on-demand', backend: 'claude', ...(typeof x.W.lanesReadAt === 'function' ? { stated: [lane] } : {}) }));
      const heard = x.heard.flatMap((e) => e.resets.map((r) => `${r.lane}:${r.before}->${r.after}`));
      x.off();
      rows.push({ ok: heard.length === 0, text: `${name} then 61 %: heard ${heard.length ? heard.join(',') : 'nothing'}` });
    }
    return { ok: rows.every((r) => r.ok), detail: rows.map((r) => (r.ok ? '' : '✗ ') + r.text).join(' | ') };
  },
  // MUST 3 — AN ORG TWIN'S BUCKET IS NOT THIS ACCOUNT'S READING: a 5h event (no seven_day in it) based on the freshest
  // SIBLING carries its stale 40 % week over this account's 97 %; neither a reset nor a settled claim
  async 'twin-not-measured'(T) {
    const x = writeWorld(T, { prev: { ...reading({ at: NOW - H, weekly: 0.97 }), sevenDay: { utilization: 0.97, resetsAt: S + 3 * 86400 } } });
    muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: '__global__', obj: { ...reading({ at: NOW - 30 * 60e3, weekly: 0.40 }) }, measuredAt: NOW - 30 * 60e3, source: 'on-demand', backend: 'claude' }));
    const c = x.store.claim('sub-a', [K(T).week], x.read());
    x.at(Date.now() + 1000);
    muted(() => x.r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: x.dir, key: 'sub-a', identityIds: ['sub-a', '__global__'], ev: { kind: 'fiveHour', status: 'allowed', utilization: 0.3, resetsAt: S + 3600, overage: {} }, now: Date.now() }));
    const heard = x.heard.filter((e) => e.key === 'sub-a').flatMap((e) => e.resets.map((r) => `${r.lane}:${r.before}->${r.after}`));
    const stands = !!(x.store.get('sub-a') || { lanes: {} }).lanes[K(T).week];
    const stored7d = Math.round(((x.read().sevenDay || {}).utilization || 0) * 100);
    x.off();
    return { ok: c.ok && !heard.length && stands, detail: `a 5h event over the twin's stale week (the file now says 7d ${stored7d} % — master's merge, unchanged): heard ${heard.join(',') || 'nothing'}, the weekly claim stands ${stands}` };
  },
  // MUST 4 — THE POPUP'S BUTTON CLAIMS THE ACCOUNT IT DRAWS: usage-meter's own resolver, the machine login linked to it
  async 'popup-key'(T) {
    const src = fs.readFileSync(path.join(T, 'src/lib/usage-meter.js'), 'utf8');
    const m = /\n  _claudeSelResolved\(\) \{\n([\s\S]*?)\n  \},\n/.exec(src);
    if (!m) return { ok: false, detail: 'no _claudeSelResolved in usage-meter.js' };
    let fn; try { fn = new Function('billingRow', m[1]); } catch (e) { return { ok: false, detail: 'the resolver did not compile: ' + e.message }; }
    const A = 'sub-aaaa';
    const self = { _accounts: { accounts: [{ id: A, backend: 'claude', type: 'subscription' }], defaultAccountId: A }, _usageGlobal: { accountId: A }, _usageAcctSel: 'auto', _accountUsage: { [A]: reading() }, _rateLimit: reading() };
    const r = fn.call(self, () => ({ usage: 'accounts' }));
    const usesDrawn = /const claimKey = this\._claudeSelResolved\(\)\.drawnKey;/.test(src);
    return { ok: !!r && r.drawnKey === A && r.target === '__global__' && usesDrawn, detail: `the machine login linked to the drawn account: the refresh key ${r && r.target}, the claim's key ${r && r.drawnKey} (the button posts it: ${usesDrawn})` };
  },
  // MUST 5 — THE SAME NUMBER AGAIN IS THE CONTRADICTION, FOR EVERY LANE: a ⟳ panel re-reads 5h / 7d / the cap unchanged
  async 'same-number'(T) {
    const rows = [];
    for (const lane of [K(T).five, K(T).week, K(T).fable]) {
      const x = writeWorld(T, { prev: reading({ at: NOW - 14 * H, capAt: NOW - 14 * H }) });
      x.store.claim('sub-a', [lane], x.read());
      x.at(Date.now() + 1000);
      const own = { fiveHour: { utilization: 0.2, resetsAt: S + 3600 }, sevenDay: { utilization: 0.08 + 0.89, resetsAt: S + 3 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 0.97, resetsAt: RC }] };
      // (the drill's world stores 7d at 8 %; re-read the SAME numbers the store holds)
      const rd = x.read(); own.sevenDay = { ...own.sevenDay, utilization: (rd.sevenDay || {}).utilization };
      const at = Date.now();
      muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...rd, ...own, limits: undefined, fetchedAt: at, scopedFetchedAt: at, source: 'on-demand' }, measuredAt: at, source: 'on-demand', backend: 'claude', authoritativeScopes: ['model'], ...(typeof x.W.lanesReadAt === 'function' ? { stated: own } : {}) }));
      const out = outcomes(x);
      x.off();
      rows.push({ ok: out === `${lane}:contradicted`, text: `${lane} re-read unchanged: [${out}]` });
    }
    // the shipped statusline's render of ONE window settles only that window
    const y = writeWorld(T);
    y.store.claim('sub-a', [K(T).five, K(T).week], y.read());
    y.at(Date.now() + 1000);
    PRODUCERS.statusline(y, { fable: 97, onlyScoped: true, T });
    const after = outcomes(y), stand = Object.keys((y.store.get('sub-a') || { lanes: {} }).lanes).sort().join(',');
    y.off();
    rows.push({ ok: !after && stand === [K(T).five, K(T).week].sort().join(','), text: `a statusline render of only the Fable cap: outcomes [${after}], still claimed [${stand}]` });
    return { ok: rows.every((r) => r.ok), detail: rows.map((r) => (r.ok ? '' : '✗ ') + r.text).join(' | ') };
  },
  // small 2 — A CLAIM LIFTS THE SESSION WALLS OF ITS LANE ON THAT MEMBER
  async 'claim-lifts-walls'(T) {
    const w = engineWorld(T);
    if (typeof w.eng.noteSessionWall !== 'function') return { ok: false, detail: 'no lane-aware session walls' };
    const A = w.id.A, now = Date.now();
    w.eng.noteSessionWall('s-fab', A, now, FABLE); w.eng.noteSessionWall('s-7d', A, now, 'plan:7d');
    await quiet(() => w.claim('A', [K(T).fable]));
    const left = ['s-fab', 's-7d'].filter((sid) => w.eng._sessionWalls.get(sid)?.has(A));
    return { ok: left.join(',') === 's-7d', detail: `a claim on A's Fable cap: walls left on A ${left.join(', ') || 'none'} (the weekly one keeps its 10 min)` };
  },
  // small 4 — a ⟳ that re-read a lane at the same number: when it was last STATED, for the age badge
  async 'lane-read-at'(T) {
    const x = writeWorld(T, { prev: reading({ at: NOW - 14 * H, capAt: NOW - 14 * H }) });
    if (typeof x.W.lanesReadAt !== 'function') { x.off(); return { ok: false, detail: 'no lanesReadAt: the badge says «read 14 h ago» beside a lane a ⟳ just read' }; }
    const rd = x.read(), at = Date.now();
    muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...rd, limits: undefined, fetchedAt: at, scopedFetchedAt: at, fiveHour: { utilization: 0.25, resetsAt: S + 3600 } }, measuredAt: at, source: 'on-demand', backend: 'claude', stated: rd }));
    const m = x.W.lanesReadAt('sub-a');
    x.off();
    const um = fs.readFileSync(path.join(T, 'src/lib/usage-meter.js'), 'utf8'), ma = fs.readFileSync(path.join(T, 'src/lib/manage-agents.js'), 'utf8');
    const drawn = /rl\.lanesReadAt/.test(um) && /u\.lanesReadAt\?\.\[x\.lane\]/.test(ma);
    return { ok: [FABLE, 'plan:7d', 'plan:5h'].every((l) => Number(m[l]) >= at) && drawn, detail: `after a ⟳ that changed only 5h: the lanes last stated ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round((Date.now() - v) / 1000) + ' s ago'])))}; the popup and the roster draw it: ${drawn}` };
  },
  // small 3 + 6 — the words: cli-unmeasured by its check's state, the claim's dialog says the refresh reads it
  async 'words-r3'(T) {
    let m; try { m = await esm(T, 'src/lib/account-wall-words.js'); } catch { return { ok: false, detail: 'no account-wall-words' }; }
    const P = reqOf(T)('./src/account-pool-auto.js');
    const st = (state) => ({ code: 'cli-unmeasured', cli: '2.1.999', ...(state ? { local: { state, typicalMin: 5 } } : {}) });
    const rows = ['checking', 'fail', 'cannot-run', null].map((state) => { const w = m.wallWords(st(state), { name: 'acct-x' }); const pool = P.unplaceableText(st(state)); return { state, door: w.door, server: typeof P.wallDoor === 'function' ? P.wallDoor(st(state)) : '?', relogin: /re-login/.test(pool), text: w.text }; });
    const ok1 = rows.every((r) => r.door === (r.relogin ? 'relogin' : null) && r.server === r.door && !/waits until VibeSpace has measured/.test(r.text));
    const cw = typeof m.claimConfirmWords === 'function' ? m.claimConfirmWords({ lane: FABLE }) : { message: '' };
    const ok2 = !/Nothing is sent to Anthropic/.test(cw.message) && /refresh/.test(cw.message);
    return { ok: ok1 && ok2, detail: rows.map((r) => `${r.state || 'no check'}: door ${r.door} (server ${r.server}; the pool's sentence ${r.relogin ? 'says re-login' : 'names none'})`).join(' · ') + ` · the claim's dialog «${cw.message.slice(0, 120)}»` };
  },
  // ── ROUND 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  // MUST — THE STAMP TRAVELS WITH THE REFUSAL: a rejection mirrored onto the identity TWIN (the capture's sibling loop) is a
  // mark there too — the twin's next real reading is no reset, a claim on the twin is contradicted; both directions
  async 'twin-refusal'(T) {
    const rows = [];
    for (const [primary, twin] of [['sub-a', '__global__'], ['__global__', 'sub-a']]) {
      const x = writeWorld(T, { prev: reading({ at: NOW - H, capAt: NOW - H }) });
      muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: '__global__', obj: reading({ at: NOW - H, capAt: NOW - H }), measuredAt: NOW - H, source: 'on-demand', backend: 'claude' }));
      const ct = x.store.claim(twin, [K(T).five], x.W.readCacheObject(x.dir, twin));
      x.at(Date.now() + 1000);
      muted(() => x.r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: x.dir, key: primary, identityIds: [primary, twin], ev: { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: S + 3600, overage: {} }, now: Date.now() - 60e3 }));
      const contra = x.store.outcomesOf(twin).map((o) => o.state).join(',');
      // the twin's next REAL reading at 61 % (a ⟳ of the twin)
      const at = Date.now() + 2000, rd = x.W.readCacheObject(x.dir, twin);
      muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: twin, obj: { ...rd, limits: undefined, fetchedAt: at, fiveHour: { utilization: 0.61, resetsAt: S + 3600 } }, measuredAt: at, source: 'on-demand', backend: 'claude', ...(typeof x.W.lanesReadAt === 'function' ? { stated: [K(T).five] } : {}) }));
      const heard = x.heard.filter((e) => e.key === twin).flatMap((e) => e.resets.map((r) => `${r.lane}:${r.before}->${r.after}`));
      x.off();
      rows.push({ ok: ct.ok && contra === 'contradicted' && !heard.length, text: `a rejection on ${primary} mirrored onto ${twin}: the twin's claim ${contra || 'stands'}; its next real reading heard as ${heard.join(',') || 'nothing'}` });
    }
    return { ok: rows.every((r) => r.ok), detail: rows.map((r) => (r.ok ? '' : '✗ ') + r.text).join(' | ') };
  },
  // small 1 — A FILE WRITTEN BEFORE THE STAMP: a rejected event's 100 % (status limited, source rate-limit-event, no
  // refusedAt) is a mark by what the record itself says; the first lower reading after the update is no reset
  async 'old-mark'(T) {
    const at0 = NOW - 120e3;
    const old = { fetchedAt: at0, source: 'rate-limit-event', fiveHour: { utilization: 1, status: 'limited', resetsAt: S + 3600 }, sevenDay: { utilization: 0.6, resetsAt: S + 3 * 86400 },
      limits: [{ limitId: 'plan', scope: 'plan', source: 'rate-limit-event', fetchedAt: at0, windows: [{ kind: '5h', usedPct: 100, status: 'limited', resetsAt: S + 3600, measuredAt: at0 }, { kind: '7d', usedPct: 60, resetsAt: S + 3 * 86400, measuredAt: at0 - 3600e3 }] }] };
    const q = reqOf(T)('./src/quota-model.js');
    const lane = (q.lanesOfReading(old) || []).find((l) => l.lane === K(T).five || l.lane === '5h') || {};
    const next = { ...old, limits: undefined, fetchedAt: NOW, source: 'on-demand', fiveHour: { utilization: 0.61, resetsAt: S + 3600 } };
    const seen = q.resetsSeen(old, next, NOW).map((r) => `${r.lane}:${r.before}->${r.after}`);
    return { ok: !!lane.mark && !seen.length, detail: `a stored rejected-event 100 % with no stamp: a mark ${!!lane.mark}; the first lower reading heard as ${seen.join(',') || 'nothing'}` };
  },
  // ── ROUND 5: A REFUSAL AND A READING ARE TOLD APART BY WHAT THE RECORD SAYS OF ITSELF ─────────────────────────────────
  // S4b: an HONEST 100 % from each reading producer (its real parser / write call), then 3 % at the same reset instant
  // through the same producer: the reset is said ONCE and the conversation's wall on that lane lifted — five producers ×
  // {the 5-hour window, the model cap}. (The OAuth answer, get_usage and the statusline write status «limited» at 100 %.)
  async 'honest-full'(T) {
    const w = engineWorld(T, { fableA: 0.3 });
    if (typeof w.eng.noteSessionWall !== 'function') return { ok: false, detail: 'no lane-aware session walls' };
    const r = w.r, W = r('./src/usage-cache-write.js'), QM = r('./src/quota-model.js'), A = w.id.A, dir = w.cacheDir;
    let CQ = null, AD = null; try { CQ = r('./src/harnesses/claude-quota.js'); } catch { } try { AD = r('./src/adapters/claude-code.js').ClaudeCodeAdapter; } catch { }
    const heard = [];
    if (typeof W.onVendorReset === 'function') W.onVendorReset((e) => { if (e && e.key === A) for (const x of e.resets || []) heard.push(`${x.lane}:${Math.round(x.before)}->${Math.round(x.after)}`); });
    const R5 = S + 2 * 3600, R7 = S + 3 * 86400, RF = RC, iso = (x) => new Date(x * 1000).toISOString();
    const base = () => ({ fetchedAt: NOW - H, scopedFetchedAt: NOW - H, source: 'on-demand', fiveHour: { utilization: 0.2, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: R7 }, scopedWeekly: [{ name: 'Fable', utilization: 0.3, resetsAt: RF }] });
    const P = {
      panel: (p5, pf) => { const at = Date.now(), prev = W.readCacheObject(dir, A) || {}; const cliPanel = QM.markScopedEnumeration({ fiveHour: { utilization: p5 / 100, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: R7 }, scopedWeekly: [{ name: 'Fable', utilization: pf / 100, resetsAt: RF }], fetchedAt: at }, true, 1);
        const merged = { ...prev, ...cliPanel, fetchedAt: at, scopedFetchedAt: at, source: 'on-demand' }; delete merged.limits;
        return W.writeCacheObject({ cacheDir: dir, key: A, obj: merged, source: 'on-demand', backend: 'claude', stated: cliPanel, authoritativeScopes: QM.authoritativeScopesOf(cliPanel) }); },
      oauth: (p5, pf) => { const at = Date.now(); const u = CQ.parseOAuthUsage({ five_hour: { utilization: p5, resets_at: iso(R5) }, seven_day: { utilization: 8, resets_at: iso(R7) }, seven_day_fable: { utilization: pf, resets_at: iso(RF) } }); u.source = 'on-demand'; u.scopedFetchedAt = at; u.fetchedAt = u.fetchedAt || at;
        return W.writeCacheObject({ cacheDir: dir, key: A, obj: u, source: 'on-demand', backend: 'claude', authoritativeScopes: QM.authoritativeScopesOf(u), absentWindows: QM.absentWindowsOf(u), stated: u }); },
      getusage: (p5, pf) => { const parsed = AD.parseGetUsageResponse({ rate_limits: { five_hour: { used_percentage: p5, resets_at: R5 }, seven_day: { used_percentage: 8, resets_at: R7 }, model_scoped: [{ display_name: 'Fable', utilization: pf, resets_at: RF }] } }); parsed.fetchedAt = Date.now(); parsed.source = parsed.source || 'control';
        return w.eng.writeUsageCacheForKey(A, parsed, { producer: 'ev:drill' }); },
      // the shipped statusline (data/bin/vibespace-usage), spawned: it writes the file itself; its reader compares the two
      statusline: (p5, pf) => { const f = path.join(dir, A + '.json'), before = JSON.parse(fs.readFileSync(f, 'utf8')); const old = new Date(Date.now() - 60e3); try { fs.utimesSync(f, old, old); } catch { }
        const rl = { five_hour: { used_percentage: p5, resets_at: R5 }, seven_day: { used_percentage: 8, resets_at: R7 }, model_scoped: [{ display_name: 'Fable', utilization: pf, resets_at: RF }] };   // the hook's model cap: a percent
        spawnSync(process.execPath, [path.join(T, 'data/bin/vibespace-usage')], { input: JSON.stringify({ session_id: 's1', rate_limits: rl }), env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', VIBESPACE_USAGE_CACHE: dir, VIBESPACE_ACCOUNT_KEY: A, HOME: ROOT }, timeout: 10000 });
        return W.noteDirectWrite(A, before, JSON.parse(fs.readFileSync(f, 'utf8')), { cacheDir: dir }); },
      // a paired machine's statusline through the mirror (usage-routes deviceLegG: the device's file merged, the write's args
      // as the route passes them — no `stated`; its measuredAt the device's fetchedAt), here under the member's own key
      mirror: (p5, pf) => { const at = Date.now(), prev = W.readCacheObject(dir, A) || {}; const j = { fetchedAt: at, source: 'statusline', fiveHour: { utilization: p5 / 100, status: p5 >= 100 ? 'limited' : 'allowed', resetsAt: R5, asOf: at }, sevenDay: { utilization: 0.08, status: 'allowed', resetsAt: R7, asOf: at }, scopedWeekly: [{ name: 'Fable', utilization: pf / 100, status: pf >= 100 ? 'limited' : 'allowed', resetsAt: RF, asOf: at }] };
        const merged = { ...prev, ...j, source: 'remote-statusline' }; delete merged.limits;
        return W.writeCacheObject({ cacheDir: dir, key: A, obj: merged, measuredAt: j.fetchedAt, source: 'remote-statusline', familyOf: r('./src/server/usage-pool-engine.js').familyOfScopedBucket || undefined, backend: 'claude' }); },
    };
    const rows = [];
    for (const prod of Object.keys(P)) for (const lane of [K(T).five, K(T).fable]) {
      fs.writeFileSync(path.join(dir, A + '.json'), JSON.stringify(base()));
      const sid = `s4b-${prod}-${lane}`, n0 = heard.length;
      w.eng.noteSessionWall(sid, A, Date.now(), lane);
      const [full, low] = lane === K(T).five ? [[100, 30], [3, 30]] : [[20, 100], [20, 3]];
      let thrown = null;
      await quiet(async () => { try { await P[prod](...full); await new Promise((res) => setTimeout(res, 3)); await P[prod](...low); } catch (e) { thrown = e.message; } });
      const said = heard.slice(n0).filter((h) => h.startsWith(lane + ':'));
      const lifted = !w.eng._sessionWalls.get(sid)?.has(A);
      rows.push({ ok: !thrown && said.length === 1 && /:100->3$/.test(said[0]) && lifted, text: `${prod} ${lane === K(T).five ? '5h' : 'cap'}: ${thrown ? 'threw ' + thrown : `said [${said.join(',')}], wall ${lifted ? 'lifted' : 'kept'}`}` });
    }
    return { ok: rows.every((x) => x.ok), detail: `an honest 100 %, then 3 % at the same reset instant — ${rows.filter((x) => x.ok).length}/10: ` + rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' | ') };
  },
  // THE UPDATE reads the SAFE way (law 4): a file written by 2.369.396 or earlier carries no word of its own — its 100 % is a
  // mark, whatever wrote it: a refusal's source, a mirrored 100 % with a reading's source, an honest 100 % (status «limited»
  // as master's parsers write it). Then a real 3 % (the OAuth answer's write): NOTHING is announced, the wall stays.
  async 'update-marks'(T) {
    const W = reqOf(T)('./src/usage-cache-write.js'), QM = reqOf(T)('./src/quota-model.js');
    const dir = fs.mkdtempSync(path.join(ROOT, 'upd-')), R5 = S + 2 * 3600, at0 = NOW - 600e3;
    const heard = []; if (typeof W.onVendorReset === 'function') W.onVendorReset((e) => { if (e && /^upd-/.test(e.key)) for (const x of e.resets || []) heard.push(`${e.key}:${x.lane}`); });
    const shapes = { 'upd-refusal': 'rate-limit-event', 'upd-mirror': 'remote-statusline', 'upd-honest': 'on-demand' };
    const rows = [];
    for (const [key, src] of Object.entries(shapes)) {
      const old = { fetchedAt: at0, source: src, fiveHour: { utilization: 1, status: key === 'upd-refusal' ? 'rejected' : 'limited', resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: S + 3 * 86400 },
        limits: [{ limitId: 'plan', scope: 'plan', source: src, fetchedAt: at0, windows: [{ kind: '5h', usedPct: 100, status: key === 'upd-refusal' ? 'rejected' : 'limited', resetsAt: R5, measuredAt: at0 }, { kind: '7d', usedPct: 8, resetsAt: S + 3 * 86400, measuredAt: at0 }] }] };
      fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(old));
      const mark = !!((QM.lanesOfReading(old) || []).find((x) => x.lane === K(T).five) || {}).mark;
      const n0 = heard.length;
      await quiet(() => { const u = { fetchedAt: NOW, source: 'on-demand', fiveHour: { utilization: 0.03, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: S + 3 * 86400 } }; return W.writeCacheObject({ cacheDir: dir, key, obj: u, source: 'on-demand', backend: 'claude', stated: u }); });
      rows.push({ ok: mark && heard.length === n0, text: `${key.slice(4)} (${src}): a mark ${mark}, announced ${heard.length - n0}` });
    }
    return { ok: rows.every((x) => x.ok), detail: 'files with no word of their own (shaped as master\'s writers leave them: no stamp, its status «limited» / «rejected»): ' + rows.map((x) => x.text).join(' · ') };
  },
  // LAW 3: the writers that leaned on the status rule keep their mark by the stamp — the capture's GUESSED 5h refusal, the
  // banner's guessed bump, the repair's replace write (the stamp travels through it) — and THE STAMP IS THE LAW: a refusal's
  // window carries `refusedAt`; a write of this tree at 100 % carries `statedAt` (a red control makes markRefused a no-op)
  async 'guess-and-replace'(T) {
    const r = reqOf(T), W = r('./src/usage-cache-write.js'), QM = r('./src/quota-model.js');
    const dir = fs.mkdtempSync(path.join(ROOT, 'gr-')), R5 = S + 2 * 3600;
    const seed = (key) => fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify({ fetchedAt: NOW - H, source: 'on-demand', fiveHour: { utilization: 0.4, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: S + 3 * 86400 } }));
    const win5 = (key) => { const o = W.readCacheObject(dir, key) || {}; for (const l of o.limits || []) for (const x of l.windows || []) if (l.limitId === 'plan' && x.kind === '5h') return x; return null; };
    const heard = []; if (typeof W.onVendorReset === 'function') W.onVendorReset((e) => { if (e && /^gr-/.test(e.key)) heard.push(e.key); });
    const out = [];
    // the capture's guessed 5h refusal (a rejection that names no window)
    seed('gr-guess');
    await quiet(() => r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: dir, key: 'gr-guess', identityIds: ['gr-guess'], ev: { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: R5, overage: {}, guessed: true }, now: NOW }));
    const g = win5('gr-guess');
    out.push({ ok: !!g && g.refusedAt != null, text: `the capture's guessed 5h: ${g ? `${laneUsedOf(g)} % refusedAt ${g.refusedAt != null}` : 'no window'}` });
    // the repair's replace write (reading-repair _writeCacheAtomic: limits deleted, replace) after a stamped refusal
    seed('gr-repl');
    await quiet(() => r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: dir, key: 'gr-repl', identityIds: ['gr-repl'], ev: { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: R5, overage: {} }, now: NOW }));
    const before = win5('gr-repl');
    await quiet(() => { const o = { ...W.readCacheObject(dir, 'gr-repl') }; delete o.limits; return W.writeCacheObject({ cacheDir: dir, key: 'gr-repl', obj: o, replace: true, source: o.source || null }); });
    const after = win5('gr-repl');
    out.push({ ok: !!before && before.refusedAt != null && !!after && after.refusedAt != null && after.statedAt != null, text: `the repair's replace: refusedAt ${before && before.refusedAt != null} → ${after && after.refusedAt != null}, statedAt kept ${after && after.statedAt != null}` });
    // then a real lower reading of each: nothing announced
    const n0 = heard.length;
    for (const key of ['gr-guess', 'gr-repl']) await quiet(() => { const u = { fetchedAt: NOW + 5, source: 'on-demand', fiveHour: { utilization: 0.03, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: S + 3 * 86400 } }; return W.writeCacheObject({ cacheDir: dir, key, obj: u, source: 'on-demand', backend: 'claude', stated: u }); });
    out.push({ ok: heard.length === n0, text: `a real 3 % after each: announced ${heard.length - n0}` });
    // the banner's guessed 5h bump (the engine's markLimitBanner on a banner that names no window)
    const ew = engineWorld(T, { fableA: 0.3 });
    const s1 = ew.mkSession('gb-1', 'A'); s1._isStreaming = true; s1._turnState = 'running';
    await quiet(() => ew.eng.markLimitBanner(s1, "You've reached your usage limit"));
    let gb = null; try { const o = JSON.parse(fs.readFileSync(path.join(ew.cacheDir, ew.id.A + '.json'), 'utf8')); for (const l of o.limits || []) for (const x of l.windows || []) if (l.limitId === 'plan' && x.kind === '5h') gb = x; } catch { }
    out.push({ ok: !!gb && laneUsedOf(gb) >= 100 && gb.refusedAt != null, text: `the banner's guessed bump: ${gb ? `${laneUsedOf(gb)} % refusedAt ${gb.refusedAt != null}` : 'no 5h window'}` });
    return { ok: out.every((x) => x.ok), detail: out.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // 主开发's green mutant on 4ea7d008f («a refusal's mark is never overtaken»): a lane REFUSED, then honestly READ at 100 %
  // later (a newer statement), then read at 3 % at the same reset — said once; and its mirror: read at 100 %, then
  // refused, then 61 % — nothing said (the later of the two stamps decides)
  async 'refusal-then-reading'(T) {
    const r = reqOf(T), W = r('./src/usage-cache-write.js');
    const dir = fs.mkdtempSync(path.join(ROOT, 'rtr-')), R5 = S + 2 * 3600, R7 = S + 3 * 86400;
    const heard = []; if (typeof W.onVendorReset === 'function') W.onVendorReset((e) => { if (e && /^rtr-/.test(e.key)) for (const x of e.resets || []) heard.push(`${e.key}:${x.lane}:${Math.round(x.before)}->${Math.round(x.after)}`); });
    const seed = (key) => fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify({ fetchedAt: NOW - H, source: 'on-demand', fiveHour: { utilization: 0.4, resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: R7 } }));
    const read = (key, five, at) => quiet(() => { const u = { fetchedAt: at, source: 'on-demand', fiveHour: { utilization: five, status: five >= 1 ? 'limited' : 'allowed', resetsAt: R5 }, sevenDay: { utilization: 0.08, resetsAt: R7 } }; return W.writeCacheObject({ cacheDir: dir, key, obj: u, measuredAt: at, source: 'on-demand', backend: 'claude', stated: u }); });
    const refuse = (key, at) => quiet(() => r('./src/rate-limit-capture.js').captureRateLimitEvent({ cacheDir: dir, key, identityIds: [key], ev: { kind: 'fiveHour', status: 'rejected', utilization: null, resetsAt: R5, overage: {} }, now: at }));
    seed('rtr-a'); await refuse('rtr-a', NOW); await read('rtr-a', 1, NOW + 1000); await read('rtr-a', 0.03, NOW + 2000);
    const a = heard.filter((h) => h.startsWith('rtr-a:'));
    seed('rtr-b'); await read('rtr-b', 1, NOW); await refuse('rtr-b', NOW + 1000); await read('rtr-b', 0.61, NOW + 2000);
    const b = heard.filter((h) => h.startsWith('rtr-b:'));
    return { ok: a.length === 1 && /plan:5h:100->3$/.test(a[0]) && b.length === 0, detail: `refused, then read at 100 %, then 3 %: said [${a.join(',')}] · read at 100 %, then refused, then 61 %: said [${b.join(',')}]` };
  },
  // THE MERGED SWITCH PASS (lane account-reset-door × usage-relearn-stepped round 4): it reads through the ONE door, and its
  // basis — raw or estimated — is decided ONCE for everything one decision compares. «cold»: a cold boot (A still learning,
  // both members listed) ⇒ the pass reads every member raw. «outside»: A has left the membership but still bills a
  // conversation, and is still learning ⇒ the basis is asked WITH A, and nobody is estimated beside it. Counted inside the
  // switch decision only (the sealed orders' snapshot is the membership's own decision).
  async 'switch-basis'(T) {
    const rows = [];
    for (const kase of ['cold', 'outside', 'default-outside']) {
      const w = engineWorld(T, { def: 'B', fableA: 0.3, fableB: 0.3 });
      const est = w.est;
      if (!est || typeof est.basisRaw !== 'function') return { ok: false, detail: 'no basis door (usageEstimator.basisRaw)' };
      if (kase !== 'default-outside') w.mkSession('s1', 'A');
      if (kase === 'outside') w.am.updatePool(w.P, { members: [w.id.B] });
      if (kase === 'default-outside') { w.am.updatePool(w.P, { members: [w.id.A] }); try { w.am.setPoolTarget(w.P, w.id.B, { why: 'drill' }); } catch { } } // the default's link on a member the pool no longer lists
      const learning = kase === 'default-outside' ? w.id.B : w.id.A, asked = [], estimated = [];
      const origEst = est.estimateFor.bind(est);
      est.basisRaw = (ids) => { asked.push([...(ids || [])]); return (ids || []).includes(learning); };
      est.estimateFor = (id, raw, nowMs) => { const st = new Error().stack || ''; if (st.includes('maybePoolAutoSwitchForPool') && !st.includes('pushSealedOrders')) estimated.push(id); return origEst(id, raw, nowMs); };
      await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const withA = asked.some((ids) => ids.includes(learning));
      rows.push({ ok: withA && estimated.length === 0, text: `${kase === 'cold' ? 'a cold boot, A still learning (both members)' : kase === 'outside' ? 'A outside the membership, still learning, billing s1' : 'the default\'s link on B, a member the pool no longer lists, B still learning (no conversation)'}: the basis asked ${withA ? 'WITH' : 'without'} ${w.tagOf(learning)}; estimated in the decision: ${estimated.length ? '[' + [...new Set(estimated.map(w.tagOf))].join(',') + '] beside raw — MIXED' : 'nobody (all raw)'}` });
    }
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // K1 (after .397; r2 13:12Z) — THE BASIS IS A FACT OF ONE POOL: a decision compares the members of ONE pool and every reading
  // in it stands on that pool's basis — what IT compares. C mid first learn, s1 linked to A in the raw-usable / estimated-dead
  // band: the pool's reader reads all raw; the chooser, the switch, the verdict and the pre-fire gate name the SAME member and
  // the continue is not held; a member scope asked for the pooled session answers like the pool scope; a pool that shares B
  // but compares no learner reads B estimated; a reader with no pool reads as the release. Nobody learning ⇒ the release's.
  async 'one-basis'(T) {
    const MODEL = 'claude-sonnet-4-5', rows = [];
    let QV = null; try { QV = reqOf(T)('./src/account-pool-auto.js').quotaVerdict; } catch { }
    for (const learning of ['C', null]) {
      const w = basisWorld(T, { learning, pool2: !!learning });
      const pool = w.viewOf(w.eng.poolReadCache(w.P)), none = w.viewOf(w.eng.poolReadCache(null));
      const s1 = w.mkSession('s1', 'A');
      const ch = w.tagOf((await quiet(() => w.eng.poolChooserForModel(w.P, { model: MODEL }))).r);
      await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const link = w.linkOf('s1');
      const v = (await quiet(() => w.eng.quotaVerdictFor(w.P, { model: MODEL, session: s1 }))).r || {};
      const nowSec = Math.floor(Date.now() / 1000), poolRc = w.eng.poolReadCache(w.P);
      const scopes = ['A', 'B', 'C'].map((t) => { const m = w.eng.quotaVerdictFor(w.id[t], { model: MODEL, session: s1 }) || {}; const p = QV ? QV(poolRc(w.id[t]), nowSec) || {} : {}; return { t, same: m.usable === p.usable, m: m.usable, p: p.usable }; });
      const fire = await quiet(() => w.eng.beforeAutoResumeFire('s1', s1));
      const fired = fire.r === true, held = w.arms.filter((x) => x.why).length;
      const linkAfter = w.linkOf('s1');
      const p2 = w.P2 ? w.viewOf(w.eng.poolReadCache(w.P2), ['B']) : null;
      const want = learning ? { pool: 'A:88r B:50r C:30r', member: 'A' } : { pool: 'A:96e B:58e C:38e', member: 'C' };
      const sameMember = ch === want.member && link === want.member && w.tagOf(v.viaId) === want.member && linkAfter === want.member;
      rows.push({ ok: pool === want.pool && none === (learning ? 'A:96e B:58e C:30r' : 'A:96e B:58e C:38e') && sameMember && scopes.every((x) => x.same) && fired && held === 0 && (!p2 || p2 === 'B:58e'),
        text: `${learning ? 'C on its first learn' : 'nobody learning'}: the pool reads ${pool}, a reader with no pool ${none}; chooser ${ch}, s1 ${link} after the pass, the verdict ${v.usable ? 'via ' + w.tagOf(v.viaId) : 'unusable'}; the pooled session's member scope = the pool scope ${scopes.map((x) => x.t + (x.same ? '=' : `≠(${x.m}/${x.p})`)).join(' ')}; the gate ${fired ? 'fired' : 'HELD'} (${held} re-arm${held === 1 ? '' : 's'}), s1 on ${linkAfter}${p2 ? `; a pool sharing B (no learner in it) reads ${p2}` : ''}` });
    }
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // K1, THE ONE INSTANT (主开发 12:24Z — «a learn that lands between the gate's verdict and the re-decision it forces»):
  // (a) the learn lands during the gate's probe — after the gate's own pass kept s1 on A raw, before its verdict: the verdict
  // reads the newer basis, the re-decision it forces moves s1 to C on that same basis, the continue goes to C (never held on
  // A); (b) a landing no gate asks about: the next read decides the basis again, the pool decides again in the next turn and
  // moves s1 (said once); (c) one synchronous run reads one basis even across the memo's second; the estimator's basisGen
  // moves when rates land and when a fold throws
  async 'basis-flip'(T) {
    const MODEL = 'claude-sonnet-4-5', rows = [], tick = () => new Promise((res) => setImmediate(res));
    { let w = null, s1 = null, keptBefore = null;
      w = basisWorld(T, { learning: 'C', onProbe: () => { keptBefore = w.linkOf('s1'); w.learnLands(); } });
      s1 = w.mkSession('s1', 'A');
      const fire = await quiet(async () => { const f = await w.eng.beforeAutoResumeFire('s1', s1); await tick(); await tick(); return f; }); // its flip's own re-decision runs here too
      const held = w.arms.filter((x) => x.why).length, after = w.linkOf('s1');
      rows.push({ ok: keptBefore === 'A' && fire.r === true && after === 'C' && held === 0, text: `a learn landing during the gate's probe: the gate's pass kept s1 on ${keptBefore}; the continue ${fire.r === true ? 'fired' : 'HELD'} on ${after} (${held} re-arm${held === 1 ? '' : 's'})` }); }
    { const w = basisWorld(T, { learning: 'C' }); w.mkSession('s1', 'A');
      await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const kept = w.linkOf('s1');
      const q = await quiet(async () => { w.learnLands(); w.eng.poolReadCache(w.P)(w.id.B); await tick(); await tick(); });
      const said = q.lines.filter((l) => /the pool decides again on that basis/.test(l)).length;
      rows.push({ ok: kept === 'A' && w.linkOf('s1') === 'C' && said === 1, text: `a landing no gate asks about: s1 kept on ${kept} raw, then on ${w.linkOf('s1')} the turn after the next read (said ${said}×)` }); }
    { const w = basisWorld(T, { learning: 'C' });
      const a1 = w.viewOf(w.eng.poolReadCache(w.P)), real = Date.now;
      let a2 = null, a3 = null;
      try { w.st.learning = null; Date.now = () => real() + 2000; a2 = w.viewOf(w.eng.poolReadCache(w.P)); await null; a3 = w.viewOf(w.eng.poolReadCache(w.P)); } finally { Date.now = real; }
      const g0 = w.est.basisGen || 0; let g1 = g0, g2 = g0;
      try { w.est._ratesLanded('ik-drill'); g1 = w.est.basisGen || 0; w.est._foldThrew('ik-drill', new Error('drill')); g2 = w.est.basisGen || 0; } catch { }
      rows.push({ ok: a1 === a2 && a2 === 'A:88r B:50r C:30r' && a3 === 'A:96e B:58e C:38e' && g1 === g0 + 1 && g2 === g1 + 1, text: `one run, one basis: ${a1} then, 2 s later in the same run, ${a2}; the next run ${a3}; basisGen ${g0} → ${g1} (rates landed) → ${g2} (a fold threw)` }); }
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // K1 r2 (主开发 13:12Z) — ONE POOL'S FACT, AND EVERY MECHANISM HOLDING IT ITS OWN ROW: (1) a learner in ANOTHER pool moves
  // nothing in this one; (2) a pool with no member list (every subscription — the learner too) reads raw, a listed pool beside
  // it estimated; (3) a conversation that runs directly on an account fires as the release does — HELD and re-armed on a member
  // its burn has spent; (4) a flip's pass is FORCED (a default switch just stamped the pool's 10 s gate); (5) a flip the pool's
  // own pass finds is said by it, no second pass; (6) a reader that finds a flip moves nothing inside its own run; (7) the
  // compared ids moving inside the memo's second build the fact again; (8) an estimated → raw flip is decided again too;
  // (9) a pass started inside the loop ends the loop's reuse of its own reads
  async 'pool-own'(T) {
    const MODEL = 'claude-sonnet-4-5', rows = [], tick = () => new Promise((res) => setImmediate(res)), n = (ls, re) => ls.filter((l) => re.test(l)).length, ABCD = ['A', 'B', 'C', 'D'];
    { const w = basisWorld(T, { learning: 'D', tags: ABCD, more: [['pool-q', ['B', 'D']]] }); const s1 = w.mkSession('s1', 'A');
      const ch = w.tagOf((await quiet(() => w.eng.poolChooserForModel(w.P, { model: MODEL }))).r);
      await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const v = (await quiet(() => w.eng.quotaVerdictFor(w.P, { model: MODEL, session: s1 }))).r || {}, f = await quiet(() => w.eng.beforeAutoResumeFire('s1', s1));
      const pv = w.viewOf(w.eng.poolReadCache(w.P)), qv = w.viewOf(w.eng.poolReadCache(w.extra['pool-q']), ['B', 'D']);
      rows.push({ ok: pv === 'A:96e B:58e C:38e' && qv === 'B:50r D:40r' && ch === 'C' && w.linkOf('s1') === 'C' && w.tagOf(v.viaId) === 'C' && f.r === true, text: `a learner in another pool (Q{B,D}, D learning): P reads ${pv} (Q ${qv}); P's chooser ${ch}, s1 on ${w.linkOf('s1')}, the verdict via ${w.tagOf(v.viaId)}, the gate ${f.r === true ? 'fired' : 'HELD'}` }); }
    { const w = basisWorld(T, { learning: 'D', tags: ABCD, more: [['pool-n', null]] });
      const pv = w.viewOf(w.eng.poolReadCache(w.P)), nv = w.viewOf(w.eng.poolReadCache(w.extra['pool-n']), ['A', 'D']);
      rows.push({ ok: pv === 'A:96e B:58e C:38e' && nv === 'A:88r D:40r', text: `a pool with no member list (every subscription, the learner D too) reads ${nv}; the listed pool beside it ${pv}` }); }
    { const w = basisWorld(T, { learning: 'C' }); const d1 = w.mkDirect('d1', 'A'); const f = await quiet(() => w.eng.beforeAutoResumeFire('d1', d1));
      const re = w.arms.filter((x) => x.sid === 'd1' && x.why).length;
      rows.push({ ok: f.r === false && re === 1, text: `a conversation directly on A (A in P, C learning; A 88 % read, 96 % by its burn): the continue ${f.r === true ? 'FIRED' : 'held'}, ${re} re-arm${re === 1 ? '' : 's'} — the release's` }); }
    { const w = basisWorld(T, { learning: 'C', rd: { B: 1.0 }, def: 'B' }); w.mkSession('s2', 'A');
      await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const def = w.defaultOf(), kept = w.linkOf('s2');
      await quiet(async () => { w.learnLands(); w.eng.poolReadCache(w.P)(w.id.A); await tick(); await tick(); });
      rows.push({ ok: def !== 'B' && kept === 'A' && w.linkOf('s2') !== 'A', text: `a flip right after a default switch (the default moved B→${def}, the pool's 10 s gate stamped): s2 kept on ${kept} raw, then on ${w.linkOf('s2')} — the flip's pass is forced` }); }
    { const w = basisWorld(T, { learning: 'C' }); w.mkSession('s1', 'A'); await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const q = await quiet(async () => { w.learnLands(); w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); await tick(); await tick(); });
      const own = n(q.lines, /this pass decides on that basis/), again = n(q.lines, /the pool decides again on that basis/);
      rows.push({ ok: own === 1 && again === 0 && w.linkOf('s1') === 'C', text: `a flip the pool's own pass finds: said by it ${own}×, a second pass ${again}×, s1 on ${w.linkOf('s1')}` }); }
    { const w = basisWorld(T, { learning: 'C' }); w.mkSession('s1', 'A'); await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      let inRun = null; await quiet(async () => { w.learnLands(); w.eng.poolReadCache(w.P)(w.id.B); inRun = w.linkOf('s1'); await tick(); await tick(); });
      rows.push({ ok: inRun === 'A' && w.linkOf('s1') === 'C', text: `a reader that finds a flip: s1 on ${inRun} when its run ends, on ${w.linkOf('s1')} the turn after` }); }
    for (const kase of ['pass', 'read']) {
      const w = basisWorld(T, { learning: 'D', tags: ABCD }); w.mkSession('s1', 'A');
      const q = await quiet(async () => { const warm = w.viewOf(w.eng.poolReadCache(w.P)); w.am.updatePool(w.P, { members: ABCD.map((t) => w.id[t]) });
        if (kase === 'pass') w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); else w.eng.poolReadCache(w.P)(w.id.B);
        await tick(); await tick(); return warm; });
      const said = n(q.lines, kase === 'pass' ? /this pass decides on that basis/ : /the pool decides again on that basis/);
      rows.push({ ok: q.r === 'A:96e B:58e C:38e' && w.linkOf('s1') === 'A' && said === 1, text: `D (learning) joins P inside the memo's second (warm: ${q.r}), then ${kase === 'pass' ? 'a pass' : 'a reader'}: s1 on ${w.linkOf('s1')}, the estimated → raw flip said ${said}×` });
    }
    { let w = null, nested = 0; w = basisWorld(T, { learning: null, rd: { A: 1.0 }, onFire: () => { if (nested++ === 0) w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); } });
      w.mkSession('s1', 'A'); w.mkSession('s2', 'A');
      const q = await quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
      const s2moves = n(q.lines, /per-session switch [^/]+\/s2:/);
      rows.push({ ok: nested >= 1 && s2moves === 1, text: `a pass started inside the loop (a fire whose gate ran at once): s2 moved ${s2moves}× (s1 → ${w.linkOf('s1')}, s2 → ${w.tagOf(w.am.poolCurrentFor(w.P, 's2'))})` }); }
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // K3 (主开发's read of the .397 tip — the page): a lane a PERSON marked reset says so in the claim dialog's words (never
  // «confirms when a session uses it»); the age mark's units are the interface's; the door's CSS stands on theme variables;
  // zh / ja name ⚙ → Update (since .397 no update arrives by itself); the row's stamp names the release the claim ships in
  async 'page-k3'(T) {
    const rows = [];
    let US = null, AW = null; try { US = await esm(T, 'src/lib/usage-source.js'); AW = await esm(T, 'src/lib/account-wall-words.js'); } catch (e) { return { ok: false, detail: `the page modules: ${e.message}` }; }
    const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
    const claimed = US.unconfirmedText({ unconfirmed: true, display: { resetAt: NOW - 60e3 }, reading: { claimedAt: NOW - 5 * 60e3 } }, { t: tt, nowMs: NOW });
    const rolled = US.unconfirmedText({ unconfirmed: true, display: { resetAt: NOW - 60e3 }, reading: {} }, { t: tt, nowMs: NOW });
    const zh = fs.readFileSync(path.join(T, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(T, 'src/lib/i18n-ja.js'), 'utf8');
    const KEY = 'marked reset by you at {time} — the next refresh confirms or corrects it';
    rows.push({ ok: claimed.startsWith('marked reset by you at') && /next refresh confirms or corrects it/.test(claimed) && !/session uses it/.test(claimed) && /session uses it/.test(rolled) && zh.includes(JSON.stringify(KEY) + ':') && ja.includes(JSON.stringify(KEY) + ':'),
      text: `a claimed lane's ring: «${claimed}»; a rolled one: «${rolled}»; zh / ja carry the claimed words ${zh.includes(JSON.stringify(KEY) + ':') && ja.includes(JSON.stringify(KEY) + ':')}` });
    const asked = []; const age = AW.staleLaneAge(NOW - 5 * H, NOW, NOW, { t: (k, p) => { asked.push(k); return tt('«' + k + '»', p); } });
    rows.push({ ok: age === '«5h»' && asked.includes('{n}h'), text: `a lane 5 h older than its siblings: «${age}» (through the interface's «{n}h»)` });
    // …and the interface's «{n}h» IS the interface's (主开发, .398 merged-tip read): minutes and days were translated, hours stayed «5h前读取»
    const unit = (src, k) => { const m = new RegExp(JSON.stringify(k).replace(/[{}]/g, '\\$&') + ': ("[^"]*")').exec(src); return m ? JSON.parse(m[1]) : null; };
    const U = ['{n}m', '{n}h', '{n}d'].map((k) => [unit(zh, k), unit(ja, k)]);
    // …and since the owner's word (hotfix 2.369.401, «不如还是继续用 h/d»): those units are a SENTENCE's; a MARK (a ring's badge, a row's
    // age) says m / h / d in every language through markT — the English key filled, no dictionary
    const markAge = typeof AW.markT === 'function' ? AW.staleLaneAge(NOW - 5 * H, NOW, NOW, { t: AW.markT }) : null;
    rows.push({ ok: U[1][0] === '{n}小时' && U[1][1] === '{n}時間' && U.every(([z, j]) => z && j && !/^\{n\}[mhd]$/.test(z) && !/^\{n\}[mhd]$/.test(j)) && markAge === '5h', text: `the SENTENCE units in zh / ja: ${U.map(([z, j]) => `${z} / ${j}`).join(' · ')} — none left as the English letter; a MARK: «${markAge}» in every language (markT)` });
    const css = fs.readFileSync(path.join(T, 'public/style.css'), 'utf8').split('\n').filter((l) => /\.usage-claim-btn \{|\.usage-stat-stale \{|\.usage-age-badge, \.acct-donut-age \{/.test(l));
    const literal = css.filter((l) => /#[0-9a-fA-F]{3,6}\b|border-radius: \d/.test(l));
    rows.push({ ok: css.length === 3 && !literal.length, text: `the door's CSS: ${css.length} rules, ${literal.length} with a literal colour or radius` });
    const lines = (src) => ['re-login these {n} accounts, or a VibeSpace update places them', 're-login {name}, or a VibeSpace update places it', 'those accounts wait for a VibeSpace update'].map((k) => { const i = src.indexOf(k + '": "'); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); });
    const named = [...lines(zh), ...lines(ja)], waits = named.filter((l) => /等 VibeSpace 更新|VibeSpace の更新を待/.test(l) || !l.includes('⚙'));
    rows.push({ ok: named.every(Boolean) && !waits.length, text: `zh / ja name ⚙ → Update: ${named.length - waits.length}/${named.length}` });
    const ci = fs.readFileSync(path.join(T, 'scripts/ci.mjs'), 'utf8');
    rows.push({ ok: /A PERSON'S RESET CLAIM \(2\.369\.397\)/.test(ci), text: `the row's stamp ${/A PERSON'S RESET CLAIM \(2\.369\.397\)/.test(ci) ? '2.369.397' : 'not the release it ships in'}` });
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // the smalls of round 5: «too low» toasted in every language; the journal's numbers rounded where said; the follow-up
  // refresh's own reason said; the mirror's census row says no device can write a refusal there
  async 'words-r5'(T) {
    const um = fs.readFileSync(path.join(T, 'src/lib/usage-meter.js'), 'utf8'), zh = fs.readFileSync(path.join(T, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(T, 'src/lib/i18n-ja.js'), 'utf8');
    const K1 = 'That limit is under 5 % — its next reading could show no reset, so it cannot be marked as reset', K2 = '{name} was not refreshed: {why}';
    const tooLow = /r\?\.code === 'too-low' \? t\('That limit is under 5 % —/.test(um) && zh.includes(JSON.stringify(K1) + ':') && ja.includes(JSON.stringify(K1) + ':');
    const reason = um.includes(`t('${K2}', { name, why: String(rr.error)`) && zh.includes(JSON.stringify(K2) + ':') && ja.includes(JSON.stringify(K2) + ':');
    let C; try { C = reqOf(T)('./src/usage-reset-claim.js'); } catch { C = null; }
    const lines = [];
    if (C) { const s1 = C.create({ file: null, now: () => NOW, log: (l) => lines.push(String(l)) }); s1.noteResetSeen('sub-r', [{ lane: K(T).five, before: 61, after: 55.00000000000001, resetsAt: S + 3600, readAt: NOW }]); }
    const rounded = lines.some((l) => /61% → 55% used/.test(l)) && !lines.some((l) => /55\.0000/.test(l));
    return { ok: tooLow && reason && rounded, detail: `«too low» toasted in en / zh / ja ${tooLow}; the refresh's own reason said ${reason}; the journal rounds where it says («${(lines.find((l) => /was reset/.test(l)) || '—').replace(/^.*was reset — /, '').slice(0, 40)}») ${rounded}` };
  },
  // small 2 — the ⟳'s first rung (a live session's get_usage) states what it read, like every producer
  async 'getusage-states'(T) {
    const eng = fs.readFileSync(path.join(T, 'src/server/usage-pool-engine.js'), 'utf8');
    const m = /return usageWrite\.writeCacheObject\(\{ cacheDir: USAGE_CACHE_DIR, key, obj: merged, source: parsed\.source \|\| null,[^\n]*/.exec(eng);
    return { ok: !!m && /stated: parsed/.test(m[0]), detail: `writeUsageCacheForKey's write: ${m ? (/stated: parsed/.test(m[0]) ? 'states its parse' : 'states nothing (round 2\'s inference)') : 'not found'}` };
  },
  // small 5 — the words
  async 'words-r4'(T) {
    const C = reqOf(T)('./src/usage-reset-claim.js');
    const s1 = C.create({ file: null, now: () => NOW, log: () => { } });
    const r6 = s1.claim('sub-a', [K(T).five], reading({ five: 0.06 }));
    if (typeof s1.noteLanesRead === 'function') s1.noteLanesRead('sub-a', [{ lane: K(T).five, at: NOW + 1, usedPct: 2 }]);
    const o6 = s1.outcomesOf('sub-a').map((o) => o.state).join(',');
    // a confirmed claim keeps its claimedAt when the same write also shows the reset
    const s2 = C.create({ file: null, now: () => NOW, log: () => { } });
    s2.claim('sub-b', [K(T).fable], reading());
    if (typeof s2.noteLanesRead === 'function') s2.noteLanesRead('sub-b', [{ lane: K(T).fable, at: NOW + 1, usedPct: 10 }]);
    s2.noteResetSeen('sub-b', [{ lane: K(T).fable, before: 97, after: 10, resetsAt: RC, readAt: NOW + 1 }]);
    const o2 = s2.outcomesOf('sub-b')[0] || {};
    const AR = reqOf(T)('./src/server/auto-resume.js');
    const card = typeof AR.claimContinueNotice === 'function' ? AR.claimContinueNotice({ label: 'acct-a' }).text : '(no claim card)';
    const ur = fs.readFileSync(path.join(T, 'src/usage-routes.js'), 'utf8'), eng = fs.readFileSync(path.join(T, 'src/server/usage-pool-engine.js'), 'utf8');
    const tooLow = /r\.code === 'too-low' \? 'that limit reads under 5 % used/.test(ur);
    const honest = !/the spend authorizer judged it/.test(eng) && /the spend authorizer decides whether it is sent/.test(eng);
    return { ok: r6.ok && o6 === 'confirmed' && o2.state === 'confirmed' && o2.claimedAt > 0 && /按你的重置声明/.test(card) && tooLow && honest,
      detail: `a claim at 6 % read again at 2 % ⇒ ${o6}; a confirmed claim whose write also shows the reset ⇒ ${o2.state} (claimedAt ${o2.claimedAt ? 'kept' : 'lost'}); the continue card «${card}»; «too low» worded ${tooLow}; the journal says the authorizer decides ${honest}` };
  },
  // MUST — EVERY writeCacheObject call by what its value can be: a refusal's goes through the refusal door (`refused`)
  async 'writes-census'(T) {
    const ROWS = {
      'src/rate-limit-capture.js': [2, 'the event and its twins — the refusal door: both carry `refused`', 2],
      'src/server/usage-pool-engine.js': [4, 'get_usage (stated), the codex push (another harness), the banner and its twins — the refusal door: both carry `refused`', 2],
      'src/server/stream-wall.js': [1, 'the stream wall — the refusal door (`refused`)', 1],
      'src/usage-routes.js': [9, 'the unsaid-change settle (the file itself), the panel and the OAuth answer (stated), host readings, the paired machine\'s mirror (the remote statusline: no device can write a refusal there — the device\'s file has one writer, the statusline hook), codex keys — measurements', 0],
      'src/usage-cache-write.js': [1, 'writeReading: a typed producer (its set states its windows)', 0],
      'src/quota-model-migrate.js': [1, 'a repair (replace)', 0],
      'src/reading-repair.js': [1, 'a repair (replace)', 0],
    };
    const bad = [];
    const counts = {};
    const walkFile = (p2) => {
      const rel = path.relative(T, p2).split(path.sep).join('/'); const L = fs.readFileSync(p2, 'utf8').split('\n');
      L.forEach((l, i) => { const t = l.trim(); if (t.startsWith('//') || t.startsWith('*') || /function writeCacheObject/.test(l) || !/writeCacheObject\(/.test(l)) return; const call = L.slice(i, i + 8).join('\n'); (counts[rel] = counts[rel] || { n: 0, refused: 0 }).n++; if (/\brefused\b/.test(call.split('});')[0])) counts[rel].refused++; });
    };
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p2 = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p2); continue; } if (e.name.endsWith('.js')) walkFile(p2); } };
    // a checkout: `git grep -l` names the files that call it (the fast row's budget), each read whole; an archive: a walk
    const g = fs.existsSync(path.join(T, '.git')) ? spawnSync('git', ['grep', '-I', '-l', '-F', 'writeCacheObject(', '--', 'src/*.js', 'src/**/*.js'], { cwd: T, encoding: 'utf8' }) : null;
    if (g && g.status === 0) for (const rel of g.stdout.split('\n').filter(Boolean)) walkFile(path.join(T, rel));
    else walk(path.join(T, 'src'));
    for (const [f, c] of Object.entries(counts)) { const row = ROWS[f]; if (!row) bad.push(`${f}: ${c.n} write(s), no row`); else { if (row[0] !== c.n) bad.push(`${f}: ${row[0]} → ${c.n} writes`); if (c.refused < row[2]) bad.push(`${f}: ${c.refused} of its ${row[2]} refusal writes carry \`refused\``); } }
    for (const f of Object.keys(ROWS)) if (!counts[f]) bad.push(`${f}: a dead row`);
    return { ok: !bad.length, detail: bad.length ? bad.join(' | ') : `${Object.values(counts).reduce((a, c) => a + c.n, 0)} writeCacheObject calls, each file on a row; the refusal door's 5 writes all carry \`refused\`` };
  },
  async 'store'(T) {
    let C; try { C = reqOf(T)('./src/usage-reset-claim.js'); } catch { return { ok: false, detail: 'no claim store (src/usage-reset-claim.js)' }; }
    const file = path.join(ROOT, `claims-${Math.random().toString(36).slice(2)}.json`);
    let t = NOW; const lines = [];
    const s = C.create({ file, now: () => t, log: (l) => lines.push(String(l)) });
    const bad = [s.claim('sub-a', ['model:nope'], reading()).code, s.claim('sub-a', [K(T).week], null).code, s.claim('../x', 'all', reading()).code].join(',');
    const r1 = s.claim('sub-a', [K(T).fable], reading());
    t += 1000;
    if (typeof s.noteLanesRead !== 'function') return { ok: false, detail: 'no statement door (noteLanesRead): a claim is settled by stored ages' };
    // a turn re-reads 5h / 7d only: it states no cap
    s.noteLanesRead('sub-a', [{ lane: K(T).five, at: t, usedPct: 21 }, { lane: K(T).week, at: t, usedPct: 9 }]);
    const stillClaimed = !!(s.viewOf('sub-a', reading()) || {}).resetClaims;
    // a stored reading NEWER than the claim states nothing by itself: the claim stands until a write states the lane
    const byAge = !!(s.viewOf('sub-a', { ...reading(), scopedFetchedAt: t + 5000, scopedWeekly: [{ name: 'Fable', utilization: 0.97, resetsAt: RC, asOf: t + 5000 }] }) || {}).resetClaims;
    t += 1000;
    s.noteLanesRead('sub-a', [{ lane: K(T).fable, at: t, usedPct: 97 }]);   // the cap STATED again, the same 97 %
    const contra = s.viewOf('sub-a', reading());
    const o1 = s.outcomesOf('sub-a');
    s.claim('sub-b', [K(T).fable], reading());
    t += 1000;
    s.noteLanesRead('sub-b', [{ lane: K(T).fable, at: t, usedPct: 2 }]);
    const o2 = s.outcomesOf('sub-b');
    // a statement of the lane with no spend confirms nothing (never «0 % used»)
    s.claim('sub-d', [K(T).fable], reading());
    t += 1000;
    s.noteLanesRead('sub-d', [{ lane: K(T).fable, at: t, usedPct: null }]);
    const noSpend = !!s.get('sub-d') && !s.outcomesOf('sub-d').length;
    // A REFUSAL of the lane contradicts it at once (MUST 1); a stored refusal newer than the claim ends it at a read
    s.claim('sub-e', [K(T).fable], reading());
    t += 1000;
    s.noteLanesRead('sub-e', [{ lane: K(T).fable, at: t, usedPct: 100, refused: true }]);
    const refusedOut = s.outcomesOf('sub-e').map((o) => o.state + (o.refused ? '/refused' : '')).join(',');
    s.claim('sub-f', [K(T).fable], reading());
    const stored = { ...reading(), limits: [{ limitId: 'model:fable', name: 'Fable', scope: 'model', source: 'wall', fetchedAt: t + 1000, windows: [{ kind: '7d', usedPct: 100, resetsAt: RC, measuredAt: NOW - H, refusedAt: t + 1000 }] }] };
    s.viewOf('sub-f', stored);
    const storedRefusal = s.outcomesOf('sub-f').map((o) => o.state).join(',');
    // a lane under 5 % can show no reset: nothing to claim (small 5)
    const low = s.claim('sub-g', [K(T).week], reading({ weekly: 0.03 })).code;
    s.dismiss('sub-a', K(T).fable);
    await s.flush();
    const back = C.create({ file, now: () => t, log: () => { } });
    const persisted = !!back.outcomesOf('sub-b').length && !back.outcomesOf('sub-a').length;
    let t2 = NOW; const s2 = C.create({ file: null, now: () => t2, log: () => { } });
    const r3 = s2.claim('sub-c', 'all', reading());
    t2 += 8 * 86400e3;
    s2.viewOf('sub-c', reading());
    const expired = !s2.get('sub-c');
    const said = lines.filter((l) => /not confirmed/.test(l)).length;
    return { ok: bad === 'bad-lane,no-reading,bad-key' && r1.ok && stillClaimed && byAge && !contra.resetClaims && o1.length === 1 && o1[0].state === 'contradicted' && said === 3
      && o2.length === 1 && o2[0].state === 'confirmed' && noSpend && refusedOut === 'contradicted/refused' && storedRefusal === 'contradicted' && low === 'too-low' && r3.ok && expired && persisted,
    detail: `refusals ${bad}; a 5h/7d statement leaves the cap claimed: ${stillClaimed}; a stored age alone settles nothing: ${byAge}; the cap stated again at 97 % ⇒ ${o1.map((o) => o.state)}; a cap stated at 2 % ⇒ ${o2.map((o) => o.state)}; a statement with no spend settles nothing: ${noSpend}; a refusal ⇒ ${refusedOut}; a stored refusal after the claim ⇒ ${storedRefusal}; a lane at 3 % ⇒ ${low}; said ${said}×; 8 days ⇒ ended: ${expired}; the file after a restart: ${persisted}` };
  },
  // MUST 5 — the claims file, shape-checked at load; a flush on the stop path
  async 'claims-file'(T) {
    let C; try { C = reqOf(T)('./src/usage-reset-claim.js'); } catch { return { ok: false, detail: 'no claim store' }; }
    const file = path.join(ROOT, `bad-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({ v: 1, claims: { 'sub-null': null, 'sub-str': { lanes: K(T).week }, 'sub-fut': { lanes: { [K(T).week]: { at: NOW + 3600e3, before: 90 } } }, 'sub-gone': { lanes: { [K(T).week]: { at: NOW - 1000, before: 90 } } }, 'sub-ok': { lanes: { [K(T).fable]: { at: NOW - 1000, before: 97 } } } } }));
    const lines = [];
    let s, threw = null;
    try { s = C.create({ file, now: () => NOW, log: (l) => lines.push(String(l)), known: (k) => k !== 'sub-gone' }); } catch (e) { threw = e.message; }
    if (!s) return { ok: false, detail: `the store threw at load: ${threw}` };
    let served = null;
    try { served = s.forClients(); for (const k of ['sub-null', 'sub-str', 'sub-ok', 'sub-gone']) s.viewOf(k, reading()); } catch (e) { threw = e.message; }
    const said = lines.filter((l) => /dropped \d+ malformed/.test(l)).length;
    const kept = served ? Object.keys(served).sort().join(',') : '';
    // small 7: the bad bytes are rewritten out (said once, not once a boot); the said-once memory is checked at load
    await s.flush();
    const rewritten = !/sub-null|sub-str|sub-fut/.test(fs.readFileSync(file, 'utf8'));
    const f3 = path.join(ROOT, `seen-${Math.random().toString(36).slice(2)}.json`), l3 = [];
    fs.writeFileSync(f3, JSON.stringify({ v: 1, claims: {}, seen: { 'sub-a': [{ lane: FABLE, resetsAt: 9e15 }, { lane: FABLE, resetsAt: RC }, 'junk'] } }));
    const s4 = C.create({ file: f3, now: () => NOW, log: (l) => l3.push(String(l)) });
    const seenOk = typeof s4.noteResetSeen === 'function' && s4.noteResetSeen('sub-a', [{ lane: FABLE, before: 97, after: 10, resetsAt: RC, readAt: NOW }]) === 0 && l3.some((l) => /seen sub-a: 2 not a reset instant/.test(l));
    // K2: A PERSON'S ACT IS ON DISK BEFORE ITS ANSWER — through the store writer (its own thread; never the main thread,
    // never the fs threadpool): the claim's persisted() resolves true once the file holds it, 0600
    const f2 = path.join(ROOT, `stop-${Math.random().toString(36).slice(2)}.json`);
    const s3 = C.create({ file: f2, now: () => NOW, log: () => { } });
    s3.claim('sub-s', [K(T).fable], reading());
    const flushed = typeof s3.persisted === 'function' && (await s3.persisted()) === true && fs.existsSync(f2) && /sub-s/.test(fs.readFileSync(f2, 'utf8'));
    const mode = flushed ? (fs.statSync(f2).mode & 0o777).toString(8) : '-';
    return { ok: !threw && kept === 'sub-ok' && said === 1 && rewritten && seenOk && flushed && mode === '600',
      detail: `threw ${threw || 'never'}; the claims served ${kept || '(none)'} (null / string lanes / future / removed account dropped); said ${said}×; the file rewritten without them ${rewritten}; the said-once memory checked at load (junk + an absurd instant said, the true one kept) ${seenOk}; the claim on disk when persisted() answers (the store writer) ${flushed} (mode ${mode})` };
  },
  // MUST 8 — «said once» per (lane, reset ± 60 s), across a restart; a write heard once
  async 'said-once'(T) {
    let C; try { C = reqOf(T)('./src/usage-reset-claim.js'); } catch { return { ok: false, detail: 'no claim store' }; }
    const file = path.join(ROOT, `seen-${Math.random().toString(36).slice(2)}.json`);
    const lines = [];
    const s = C.create({ file, now: () => NOW, log: (l) => lines.push(String(l)) });
    const r = (resetsAt) => [{ lane: K(T).fable, before: 97, after: 10, resetsAt, readAt: NOW }];
    s.noteResetSeen('sub-a', r(RC)); s.noteResetSeen('sub-a', r(RC + 30));
    await s.flush();
    const s2 = C.create({ file, now: () => NOW, log: (l) => lines.push(String(l)) });
    s2.noteResetSeen('sub-a', r(RC + 20));
    const said = lines.filter((l) => /was reset/.test(l)).length;
    // the write path and the statusline's reader: one write is compared once
    const x = writeWorld(T, { prev: reading({ capAt: NOW - H }) });
    muted(() => x.W.writeCacheObject({ cacheDir: x.dir, key: 'sub-a', obj: { ...x.read(), limits: undefined, fetchedAt: NOW, scopedFetchedAt: NOW, scopedWeekly: [{ name: 'Fable', utilization: 0.1, resetsAt: RC }] }, measuredAt: NOW, source: 'on-demand', backend: 'claude' }));
    const before = reading({ capAt: NOW - H });
    muted(() => { if (typeof x.W.noteDirectWrite === 'function') x.W.noteDirectWrite('sub-a', before, x.read(), { cacheDir: x.dir }); else x.W.noteVendorResets('sub-a', before, x.read()); });
    x.off();
    return { ok: said === 1 && x.heard.length === 1, detail: `one reset heard 3× (30 s / 20 s jitter, a restart between): said ${said}×; one write the write path compared, then its reader: heard ${x.heard.length}×` };
  },
  async 'route'(T) {
    const r = reqOf(T);
    const { AccountManager } = r('./src/accounts.js');
    const usageMod = r('./src/usage-routes.js');
    const root = fs.mkdtempSync(path.join(ROOT, 'hub-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const am = new AccountManager({ dataDir });
    let notified = 0; const on = am._onChange; am._onChange = (...a) => { notified++; try { on && on(...a); } catch { } };
    const id = am.createSubscription({ name: 'acct-route' }).id;
    const empty = am.createSubscription({ name: 'acct-empty' }).id;
    const cx = am.createCodexSubscription({ name: 'acct-cx' }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(reading()));
    fs.writeFileSync(path.join(cacheDir, cx + '.json'), JSON.stringify({ fetchedAt: NOW - H, source: 'codex-rate-limits', limitId: 'codex', fiveHour: { utilization: 0.99, usedPercent: 99, windowMinutes: 300, resetsAt: S + 3600 }, sevenDay: { utilization: 0.99, usedPercent: 99, windowMinutes: 10080, resetsAt: S + 3 * 86400 } }));
    const routes = {};
    const app = { get: (p, ...f) => { routes['GET ' + p] = f[f.length - 1]; }, post: (p, ...f) => { routes['POST ' + p] = f[f.length - 1]; }, put() { }, delete() { }, use() { }, locals: {} };
    const fetched = [];
    const nets = ['https', 'http'].map((m) => r(m));
    const reqs = nets.map((n) => n.request);
    nets.forEach((n) => { n.request = (...a) => { fetched.push(String(a[0] && (a[0].host || a[0].hostname || a[0]))); throw new Error('no vendor call in this drill'); }; });
    try {
      await quiet(() => usageMod.setupUsage({
        app, accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'codex'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'buffers'), probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/bin/false',
      }));
      const post = routes['POST /api/accounts/:id/reset-claim'];
      if (typeof post !== 'function') return { ok: false, detail: 'no POST /api/accounts/:id/reset-claim' };
      const call = (fn, req) => new Promise((res) => { const out = { code: 200 }; try { fn({ headers: {}, params: {}, body: {}, ...req }, { status(c) { out.code = c; return this; }, json(b) { out.body = b; res(out); return this; } }); } catch (e) { res({ code: 500, threw: e.message }); } });
      const agent = await call(post, { headers: { authorization: 'Bearer some-tool-token' }, params: { id }, body: { lanes: 'all' } });
      const unknown = await call(post, { params: { id: 'sub-nobody' }, body: { lanes: 'all' } });
      const none = await call(post, { params: { id: empty }, body: { lanes: 'all' } });
      const codex = (await quiet(() => call(post, { params: { id: cx }, body: { lanes: 'all' } }))).r;
      notified = 0;
      const okClaim = (await quiet(() => call(post, { params: { id }, body: { lanes: [K(T).fable] } }))).r;
      const toldDevices = notified > 0;
      const UW = r('./src/usage-cache-write.js'), lanesWas = UW.lanesReadAt;
      UW.lanesReadAt = (k) => (k === id ? { 'plan:7d': NOW - 60e3 } : {});   // a lane a write stated a minute ago (K3)
      let usage; try { usage = (await quiet(() => call(routes['GET /api/usage'], {}))).r; } finally { UW.lanesReadAt = lanesWas; }
      const inside = !!(usage.body && usage.body.accounts && usage.body.accounts[id] && usage.body.accounts[id].lanesReadAt && usage.body.accounts[id].lanesReadAt['plan:7d'] === NOW - 60e3);
      const q = r('./src/quota-model.js');
      const view = usage.body && usage.body.accounts && usage.body.accounts[id];
      const cap = capState(q, view);
      const stored = JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8')).scopedWeekly[0].resetsAt === RC;
      // K2 (主开发 22:40Z — the store writer's law F, «a failed act is SAID»): the writer answers FALSE for the claims file ⇒
      // the route answers 503 `not-durable` with the claim beside it, the claim is APPLIED (the reading shows it claimed), the
      // page's words say both facts; the dismissal the same
      const SW = r('./src/store-writer.js').storeWriter(), durWas = SW.durable;
      let nd = null, ndUsage = null, ndDismiss = null;
      try {
        SW.durable = (f, o) => (/usage-reset-claims\.json$/.test(String(f)) ? Promise.resolve(false) : durWas.call(SW, f, o));
        nd = (await quiet(() => call(post, { params: { id }, body: { lanes: [K(T).five] } }))).r;
        ndUsage = (await quiet(() => call(routes['GET /api/usage'], {}))).r;
        try { r('./src/usage-reset-claim.js').at(dataDir).noteLanesRead(id, [{ lane: K(T).fable, at: Date.now() + 5000, usedPct: 97 }]); } catch { }   // an outcome to dismiss (the Fable claim contradicted — read after the claim, on the real clock)
        ndDismiss = (await quiet(() => call(routes['POST /api/accounts/:id/reset-claim/dismiss'] || (() => { }), { params: { id }, body: { lane: K(T).fable } }))).r;
      } finally { SW.durable = durWas; }
      let AWW = null; try { AWW = await esm(T, 'src/lib/account-wall-words.js'); } catch { }
      const ndSaid = AWW && typeof AWW.claimAnsweredWords === 'function' && nd && nd.body ? AWW.claimAnsweredWords(nd.body, { what: 'the 5-hour window' }) : null;
      const ndWords = ndSaid ? [ndSaid.text, ndSaid.disk].filter(Boolean).join(' | ') : '';   // the page's toasts: marked, then not on disk yet
      const ndClaimed = !!(ndUsage && ndUsage.body && ndUsage.body.resetClaims && ndUsage.body.resetClaims[id] && Number(ndUsage.body.resetClaims[id].lanes[K(T).five]) > 0);
      const ndOk = !!(nd && nd.code === 503 && nd.body && nd.body.code === 'not-durable' && nd.body.ok === true && /not on disk yet/.test(String(nd.body.error))) && ndClaimed
        && /^Marked the 5-hour window as reset/.test(ndSaid ? ndSaid.text : '') && /not on disk yet/.test(ndSaid ? ndSaid.disk || '' : '') && !!(ndDismiss && ndDismiss.code === 503 && ndDismiss.body && ndDismiss.body.code === 'not-durable');
      am.placeWallOf = () => ({ code: 'cli-unmeasured', cli: '2.1.322' });
      const walled = (await quiet(() => call(post, { params: { id }, body: { lanes: [K(T).week] } }))).r;
      return { ok: agent.code === 403 && unknown.code === 404 && none.code === 409 && codex.code === 409 && codex.body && codex.body.code === 'no_claim_door' && okClaim.body && okClaim.body.ok && toldDevices && cap === 'reset-unconfirmed'
        && usage.body.resetClaims && usage.body.resetClaims[id] && inside && ndOk && stored && walled.body && walled.body.ok && walled.body.wall && walled.body.wall.code === 'cli-unmeasured' && fetched.length === 0,
      detail: `the lane's read-at inside the account's reading on /api/usage ${inside} · the writer answering false: the claim ${nd ? nd.code : '-'} ${nd && nd.body ? nd.body.code || 'no code' : ''}, applied ${ndClaimed}, the page says «${ndWords.slice(0, 150)}»; the dismissal ${ndDismiss ? ndDismiss.code : '-'} ${ndDismiss && ndDismiss.body ? ndDismiss.body.code || 'no code' : ''} · any Bearer ${agent.code} · unknown ${unknown.code} · no reading ${none.code} · a Codex row ${codex.code} ${codex.body && codex.body.code} · claim ${JSON.stringify(okClaim.body).slice(0, 70)} · every device told ${toldDevices} · /api/usage cap ${cap} · the cache untouched ${stored} · a non-quota wall said ${JSON.stringify(walled.body && walled.body.wall)} · vendor calls ${fetched.length}` };
    } finally { nets.forEach((n, i) => { n.request = reqs[i]; }); }
  },
  // MUST 5 — GET /api/usage never throws on a bad claims file
  async 'usage-survives'(T) {
    const r = reqOf(T);
    const { AccountManager } = r('./src/accounts.js');
    const root = fs.mkdtempSync(path.join(ROOT, 'hub2-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const am = new AccountManager({ dataDir });
    const id = am.createSubscription({ name: 'acct-bad' }).id;
    fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(reading()));
    fs.writeFileSync(path.join(dataDir, 'usage-reset-claims.json'), JSON.stringify({ v: 1, claims: { [id]: { lanes: K(T).week }, 'sub-x': null } }));
    const routes = {};
    const app = { get: (p, ...f) => { routes['GET ' + p] = f[f.length - 1]; }, post: (p, ...f) => { routes['POST ' + p] = f[f.length - 1]; }, put() { }, delete() { }, use() { }, locals: {} };
    await quiet(() => r('./src/usage-routes.js').setupUsage({ app, accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
      USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'codex'), META_DIR: path.join(dataDir, 'session-meta'),
      AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'buffers'), probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/bin/false' }));
    const get = routes['GET /api/usage'];
    const res = await quiet(() => new Promise((ok2) => { const o = { code: 200 }; try { get({ headers: {}, params: {}, query: {} }, { status(c) { o.code = c; return this; }, json(b) { o.body = b; ok2(o); return this; } }); } catch (e) { ok2({ code: 500, threw: e.message }); } }));
    const served = !!(res.r.body && res.r.body.resetClaims && typeof res.r.body.resetClaims === 'object');
    return { ok: res.r.code === 200 && !res.r.threw && !!(res.r.body && res.r.body.accounts && res.r.body.accounts[id]) && served, detail: `a claims file with a string «lanes» and a null entry: GET /api/usage ${res.r.code}${res.r.threw ? ' threw ' + res.r.threw : ''}, the claims served ${served}` };
  },
  // MUST 4 — the owner's morning: oat-only, the row's fact vault_locked, the pool's wall cli-unmeasured
  async 'refresh-answer'(T) {
    const r = reqOf(T);
    const { AccountManager } = r('./src/accounts.js');
    const root = fs.mkdtempSync(path.join(ROOT, 'oat-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const am = new AccountManager({ dataDir });
    const id = am.createSubscription({ name: 'acct-oat' }).id;
    am.setOat(id, 'sk-ant-oat01-' + 'y'.repeat(30));
    try { am.noteCliVersion('2.1.999'); } catch { }
    await am.oatFileSettled();
    am._oatFileFacts.set(id, { verdict: 'read-failed', code: 'vault_locked', at: Date.now() });
    const routes = {};
    const app = { get: (p, ...f) => { routes['GET ' + p] = f[f.length - 1]; }, post: (p, ...f) => { routes['POST ' + p] = f[f.length - 1]; }, put() { }, delete() { }, use() { }, locals: {} };
    const nets = ['https', 'http'].map((m) => r(m)); const reqs = nets.map((n) => n.request); let calls = 0;
    nets.forEach((n) => { n.request = () => { calls++; throw new Error('no vendor call'); }; });
    try {
      await quiet(() => r('./src/usage-routes.js').setupUsage({ app, accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'codex'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'buffers'), probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/bin/false' }));
      const res = (await quiet(() => new Promise((ok2) => { const o = { code: 200 }; routes['POST /api/usage/refresh']({ headers: {}, params: {}, body: { account: id }, ip: '127.0.0.1', socket: {} }, { status(c) { o.code = c; return this; }, json(b) { o.body = b; ok2(o); return this; }, set() { return this; } }); }))).r;
      const b = res.body || {};
      const pool = typeof am.placeWallOf === 'function' ? am.placeWallOf(id) : null;
      // THE POOL'S OWN SENTENCE decides the whole answer: its words, and `loginNeeded` exactly when that sentence's fix is a
      // re-login (r3: cli-unmeasured with no check running says «re-login, or a VibeSpace update places it»)
      const sentence = pool ? r('./src/account-pool-auto.js').unplaceableText(pool) : '';
      const login = /re-login/.test(sentence);
      const said = pool ? (login ? 'needs re-login to refresh usage — ' : 'not refreshed — ') + sentence : null;
      return { ok: !!pool && pool.code === 'cli-unmeasured' && b.wall && b.wall.code === 'cli-unmeasured' && !!b.loginNeeded === login && String(b.error) === said && calls === 0,
        detail: `the pool's cause ${JSON.stringify(pool)}; ⟳ answers loginNeeded ${!!b.loginNeeded}, wall ${JSON.stringify(b.wall)}, «${String(b.error).slice(0, 110)}»; vendor calls ${calls}` };
    } finally { nets.forEach((n, i) => { n.request = reqs[i]; }); }
  },
  async 'unlock'(T) {
    const r = reqOf(T);
    const { AccountManager } = r('./src/accounts.js');
    const am = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'acc-')) });
    const id = am.createSubscription({ name: 'acct-locked' }).id;
    if (typeof am.forgetVaultLockedFacts !== 'function' || typeof am.placeWallOf !== 'function') return { ok: false, detail: 'no forgetVaultLockedFacts / placeWallOf: a fact recorded while locked outlives the unlock (to the next 15-min sweep)' };
    am._oatFileFacts.set(id, { verdict: 'read-failed', code: 'vault_locked', at: Date.now() });
    const n = am.forgetVaultLockedFacts();
    const wsrc = fs.readFileSync(path.join(T, 'src/server/mounts-plugins-wiring.js'), 'utf8');
    const hook = /vault\.onUnlock\(\(\) => \{[^\n]*forgetVaultLockedFacts\(\);[^\n]*syncOatFiles/.test(wsrc);
    return { ok: n === 1 && !am._oatFileFacts.has(id) && hook, detail: `facts dropped at the unlock ${n}; the unlock hook re-sweeps ${hook}` };
  },
  async 'words'(T) {
    let m; try { m = await esm(T, 'src/lib/account-wall-words.js'); } catch { return { ok: false, detail: 'no src/lib/account-wall-words.js: each refusal is the server\'s English, one copy per account' }; }
    const items = Array.from({ length: 14 }, (_, i) => ({ wall: { code: 'vault-locked' }, name: `acct-${i}` }));
    const g = m.groupWalls(items);
    const zh = (await esm(T, 'src/lib/i18n-zh.js')), ja = (await esm(T, 'src/lib/i18n-ja.js'));
    const dict = (mod) => mod.default || mod.zh || mod.ja || Object.values(mod).find((v) => v && typeof v === 'object');
    const tz = (s, p) => String((dict(zh) || {})[s] || s).replace(/\{(\w+)\}/g, (x, k) => (p && p[k] !== undefined ? String(p[k]) : x));
    const tj = (s, p) => String((dict(ja) || {})[s] || s).replace(/\{(\w+)\}/g, (x, k) => (p && p[k] !== undefined ? String(p[k]) : x));
    const gz = m.groupWalls(items, { t: tz })[0], gj = m.groupWalls(items, { t: tj })[0];
    // six login causes that all say «needs a re-login» are ONE sentence
    const logins = ['no-file', 'logged-out', 'expired', 'no-login', 'unknown-x', 'oat-not-in-folder'].map((code, i) => ({ wall: { code, reason: 'not-written' }, name: `acct-l${i}` }));
    const gl = m.groupWalls(logins);
    // the server's door per cause = the client's (account-pool-auto wallDoor vs wallWords)
    const P = reqOf(T)('./src/account-pool-auto.js');
    const codes = ['vault-locked', 'cli-unmeasured', 'oat-not-in-folder', 'auth-failed', 'lapsed', 'held-out', 'oat-expired', 'oat-mismatch', 'unreadable', 'logged-out', 'no-file', 'expired'];
    const doors = typeof P.wallDoor === 'function' ? codes.flatMap((c) => ['pending', 'x'].map((reason) => ({ c, reason, s: P.wallDoor({ code: c, reason }), k: m.wallWords({ code: c, reason }).door }))).filter((d) => d.s !== d.k) : [{ c: 'no wallDoor' }];
    const english = codes.flatMap((c) => [1, 3].map((n) => m.wallWords({ code: c, cli: '2.1.322', reason: 'pending' }, { t: tz, n, name: 'acct-x' }).text)).filter((x) => /[a-z]{4,} [a-z]{3,}/.test(x.replace(/acct-x|Claude Code|VibeSpace|Anthropic/g, '')));
    const pm = await esm(T, 'src/lib/pool-priority-model.js');
    const gw = pm.gatherWords({ success: false, code: 'not_placeable', why: 'cli-unmeasured', wall: { code: 'cli-unmeasured', cli: '2.1.322' }, member: 'acct-p' }, tz, { memberName: 'acct-p' });
    const lw = typeof m.laneWords === 'function' ? [m.laneWords(K(T).five), m.laneWords(K(T).week), m.laneWords(K(T).fable)].join(' / ') : '';
    return { ok: g.length === 1 && g[0].n === 14 && g[0].door === 'unlock' && gz.text.startsWith('保险库已上锁——14 个账号的读数暂时无法刷新') && /解锁…/.test(gz.text) && /待你处理/.test(gz.text) && /保管庫/.test(gj.text)
      && gl.length === 1 && gl[0].n === 6 && !doors.length && !english.length && /2\.1\.322/.test(gw.text) && lw === 'the 5-hour limit / the weekly limit / the Fable weekly limit',
      detail: `14 refusals ⇒ ${g.length} sentence(s), door ${g[0] && g[0].door}; zh «${gz && gz.text}»; six login causes ⇒ ${gl.length} sentence(s) (${gl.map((x) => x.n).join('+')}); server/client doors that differ ${JSON.stringify(doors).slice(0, 160)}; English left in zh ${english.length}; lanes «${lw}»; the gather «${gw.text}»` };
  },
  async 'wiring'(T) {
    const rd = (f) => { try { return fs.readFileSync(path.join(T, f), 'utf8'); } catch { return ''; } };
    const eng = rd('src/server/usage-pool-engine.js'), um = rd('src/lib/usage-meter.js'), ma = rd('src/lib/manage-agents.js'), app = rd('src/lib/app.js'), rc = rd('src/usage-reset-claim.js'), ur = rd('src/usage-routes.js'), srv = rd('server.js'), kb = rd('docs/kb-api.md');
    // EVERY READ OF THE USAGE CACHE IN src/ (ROOT 1's census, r3: derived by grep — every file, every spelling — and each
    // file's count on a row with why; a NEW read anywhere moves a count or names a file with no row)
    const census = cacheReadCensus(T);
    const unrowed = census.bad;
    // RED CONTROL: four REAL lines planted in a scratch copy — three spellings in the engine, one in a file with no row
    const plants = [['src/server/usage-pool-engine.js', "const z1 = usageWrite.readCacheObject(USAGE_CACHE_DIR, k);"], ['src/server/usage-pool-engine.js', "const z2 = readRawUsageCache(k);"],
      ['src/server/usage-pool-engine.js', "const z3 = JSON.parse(fs.readFileSync(USAGE_CACHE_DIR + '/' + k + '.json', 'utf-8'));"], ['src/server/auto-resume.js', "const z4 = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, k + '.json'), 'utf-8'));"],
      ['src/server/usage-pool-engine.js', "fs.promises.readFile(path.join(USAGE_CACHE_DIR, k + '.json'), 'utf-8').then(() => {});"],   // an async read
      ['src/server/usage-pool-engine.js', "const zf = path.join(USAGE_CACHE_DIR, k + '.json');\n  const z6 = fs.readFileSync(zf, 'utf-8');"],   // a path built on another line
      ['src/server/auto-resume.js', "const DIR = d.USAGE_CACHE_DIR;\n  const z7 = fs.readFileSync(path.join(DIR, k), 'utf-8');"],   // a dir alias
      ['src/server/new-cache-reader.js', "const z8 = await require('fs').promises.readFile(require('path').join(cacheDir, k + '.json'), 'utf-8');"],   // a NEW file, fsp
      ['src/server/auto-resume.js', "const { USAGE_CACHE_DIR: CD } = d;\n  const z9 = fs.readFileSync(path.join(CD, k + '.json'), 'utf-8');"],   // r5: a DESTRUCTURED alias
      ['src/server/auto-resume.js', "const box = { root: d.USAGE_CACHE_DIR };\n  const z10 = fs.readFileSync(path.join(box.root, k + '.json'), 'utf-8');"]];   // r5: a FIELD of another name
    const plantedRed = plants.map(([f, line]) => { const copy = path.join(fs.mkdtempSync(path.join(ROOT, 'plant-')), path.basename(f));
      const orig = fs.existsSync(path.join(T, f)) ? fs.readFileSync(path.join(T, f), 'utf8') : '';
      fs.writeFileSync(copy, orig + '\nasync function plantedRead(k, cacheDir, d) {\n  ' + line + '\n  return k;\n}\n');   // the scratch copy, read in its file's place
      return cacheReadCensus(T, { [f]: copy }).bad.length > 0; });
    const pins = {
      oneDoor: !unrowed.length && plantedRed.every(Boolean),
      switchPassOnTheDoor: /poolBasisRaw\(poolId, \{ pass: true \}\);[^\n]*\n    const readCache = poolReadCache\(poolId, now\); \/\/ THE ONE DOOR/.test(eng),   // the door on the pool's basis, decided again at the pass's start (K1)
      sealedOrdersOnTheDoor: /const ownFileReading = poolReadReading\(\{ group: false \}\);/.test(eng) && /readCache: ownFileReading,/.test(eng),
      placementWhenDecided: /claimDecided\(/.test(eng) && /moved onto \$\{nameOf\(ds\.to\)\} on your reset claim/.test(eng),
      wallsByLane: /lane && lanes\.has\(lane\) && m\.delete\(id\)/.test(eng),
      refreshWorded: /r\.wall\) \{ const w = wallWords\(r\.wall/.test(um) && /_wallDoorAction\(w\.door(?:, \w+)?\)/.test(um),   // + the account the toast names (lane oat-add-door: the guided door opens on its row)
      laneActs: /claimBtn\(quotaModel\.laneOfBucket\(rl, 'scoped', sc\.name\)/.test(um) && /claimBtn\('plan:5h', v5\)/.test(um) && /I reset this account on Anthropic’s site…/.test(ma),
      staleLanesOwnWindow: /quotaModel\.lanesOfReading\(rl\)/.test(um) && /quotaModel\.lanesOfReading\(u\)/.test(ma),
      refreshAllGrouped: /groupWalls\(walled/.test(ma),
      liveOnDevices: /this\._usageNow\?\.\(\)/.test(app),
      noVendorInStore: rc !== '' && !/require\(['"](https?|node:https?|undici)['"]\)|fetch\(/.test(rc),
      ingestNewestWins: /if \(!_rateLimitCache \|\| \(u\.fetchedAt > \(_rateLimitCache\.fetchedAt \|\| 0\)\)\) \{ _rateLimitCache = u; writeUsageCache\(\); \}/.test(ur) && /usageWrite\.noteDirectWrite\(key, was, u, \{ cacheDir: USAGE_CACHE_DIR \}\)/.test(ur),
      routeOnTheRow: /if \(pressBearer\(req\.headers\)\) return res\.status\(403\)/.test(ur) && /oauthUsageAccount\(acct\)/.test(ur),
      onTheStoreWriter: /storeWriter\(\)/.test(rc) && /\.durable\(file\)/.test(rc) && !/\b(writeSync|renameSync|fsyncSync|openSync)\(|fs\.promises/.test(rc) && (ur.match(/resetClaims\.persisted\(\)/g) || []).length === 2,   // K2: the claims store writes through the store writer; both acts answer after it
      producersState: /backend: .claude., stated: cliPanel,/.test(ur) && /stated: u \}\);/.test(ur) && /stated: bannerLanes, refused: bannerLanes/.test(eng) && /stated: \[wallLane\], refused: \[wallLane\]/.test(rd('src/server/stream-wall.js')) && /passiveAnswer: passive, stated, refused,/.test(rd('src/rate-limit-capture.js')),
      statuslineStamps: /fiveHour: \{ \.\.\.five, asOf: now \}/.test(rd('data/bin/vibespace-usage')),
      continueSaysClaim: /a continue on \$\{toName\} was asked on your reset claim/.test(eng) && /按你的重置声明可用/.test(eng) && /fireNowOnClaim\?\.\(/.test(eng),
      kbApiRows: /`POST \/api\/accounts\/:id\/reset-claim`/.test(kb) && /`POST \/api\/accounts\/:id\/reset-claim\/dismiss`/.test(kb),
    };
    const bad = Object.entries(pins).filter(([, v]) => !v).map(([k]) => k);
    return { ok: !bad.length, detail: bad.length ? `missing: ${bad.join(', ')}${unrowed.length ? ' — the census: ' + unrowed.join(' | ') : ''}; planted controls red ${plantedRed.join('/')}` : `${census.total} reads of the usage cache in src/, each file on a row; 10 planted reads (sync, readCacheObject, readRawUsageCache, a concatenated path, async, a two-line read, a dir alias, a new file, a destructured alias, a field of another name) each RED; ` + Object.keys(pins).join(' · ') };
  },
};

const T0 = performance.now(), legMs = {};
const run = async (name, T) => { const t = performance.now(); try { return await LEGS[name](T); } catch (e) { return { ok: false, detail: `threw: ${(e && e.message) || e}` }; } finally { legMs[name] = (legMs[name] || 0) + (performance.now() - t); } };
say('this tree');
for (const leg of Object.keys(LEGS)) { const r = await run(leg, REPO); ok(r.ok, `${leg}: ${r.detail}`); }
const CONTROLS = process.env.RESET_DOOR_CONTROLS === '1';
// THE RED TREES COME FROM WHAT THE REPOSITORY HAS (r4): master, always; the lane's rounds 1 and 2 only on its own explicit
// switch (RESET_DOOR_ROUNDS=1 — they are not in any clone but the lane's); a control that cannot run is a COUNTED skip
const ROUNDS = process.env.RESET_DOOR_ROUNDS === '1';
let skipped = 0;
if (!CONTROLS) say(`RED CONTROLS — run by the heavy row test-account-reset-door-controls (this file with RESET_DOOR_CONTROLS=1): master ${BASE}`);
const R5 = ['honest-full', 'guess-and-replace', 'words-r5'];
const R4 = ['twin-refusal', 'old-mark', 'getusage-states', 'words-r4', 'writes-census', 'wiring'];
const R3 = ['view', 'refusal-contradicts', 'rejection-is-a-mark', 'twin-not-measured', 'popup-key', 'same-number', 'claim-lifts-walls', 'lane-read-at', 'words-r3', 'store', 'claims-file', 'refresh-answer', 'wiring'];
for (const [rev, tag, legs] of CONTROLS ? [[BASE, 'base', Object.keys(LEGS)], [MERGED397, 'merged397', ['one-basis', 'basis-flip']], [K1R1, 'k1r1', ['pool-own']], [REL397, 'rel397', ['claims-file', 'route', 'page-k3', 'wiring']], ...(ROUNDS ? [[ROUND1, 'round1', Object.keys(LEGS).filter((l) => l !== 'unlock')], [ROUND2, 'round2', R3], [ROUND3, 'round3', R4], [ROUND4, 'round4', R5]] : [])] : []) {
  const T = archive(rev, tag);
  say(`RED CONTROLS — ${legs.length} legs on ${rev}${tag === 'merged397' ? ' (the .397 pre-bump tip: the basis decided per call)' : tag === 'k1r1' ? ' (K1 round 1: one basis per connected set of pools)' : tag === 'rel397' ? ' (the 2.369.397 release: the claims store off the writer, the page before K3)' : tag === 'round1' ? ' (round 1: the legs round 2 adds or re-states)' : tag === 'round2' ? ' (round 2: the legs round 3 adds or re-states)' : tag === 'round3' ? ' (round 3: the legs round 4 adds or re-states)' : tag === 'round4' ? ' (round 4: the legs round 5 adds)' : ''}`);
  if (!T) { skipped += legs.length; say(`  SKIP ${legs.length} red controls — ${rev} is not in this clone (a depth-1 checkout): COUNTED, not passed`); continue; }
  for (const leg of legs) { const r = await run(leg, T); ok(!r.ok, `${rev} is RED at ${leg}: ${r.detail}`); }
}
// THE STAMP CARRIES THE LAW (r5): this tree with the refused-window writer made a no-op (a patch this suite carries — a tree
// of symlinks with src/quota-model.js rewritten): the named legs go RED; an anchor no longer in the file is a RED, not a skip
if (CONTROLS) {
  const QMSRC = fs.readFileSync(path.join(REPO, 'src/quota-model.js'), 'utf8'), ANCH = 'function markRefused(set, lanes, at) {\n';
  say('RED CONTROL — the stamp: markRefused made a no-op on this tree (a patch the suite carries)');
  if (ok(QMSRC.split(ANCH).length === 2, 'the patch «markRefused no-op» applies to this tree\'s quota-model.js (its anchor is there once)')) {
    // a COPY of src/ (a symlinked module resolves its requires from its real path, which would load the unpatched file)
    const M = path.join(ROOT, 'patch-m4'); fs.cpSync(path.join(REPO, 'src'), path.join(M, 'src'), { recursive: true });
    fs.writeFileSync(path.join(M, 'src/quota-model.js'), QMSRC.replace(ANCH, ANCH + '  return set;   // the patch: no refusal stamp\n'));
    for (const f of ['package.json', 'node_modules', 'data', 'server.js']) { try { fs.symlinkSync(path.join(REPO, f), path.join(M, f)); } catch { } }
    for (const leg of ['rejection-is-a-mark', 'twin-refusal', 'guess-and-replace']) { const r = await run(leg, M); ok(!r.ok, `with no refusal stamp ⇒ RED at ${leg}: ${r.detail}`); }
  }
  // THE MERGED PASS'S WRONG SIDES (lane account-reset-door × usage-relearn-stepped): patches of src/server/usage-pool-engine.js
  const ENGSRC = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const WRONG = [
    ['no-pass-ids', 'the basis without what the pass compares beyond the membership (the membership\'s basis alone)', "_passCompared.set(poolId, [...new Set(compared.filter((x) => typeof x === 'string' && x))].sort());", '_passCompared.set(poolId, []);', 'switch-basis'],
    ['default-not-compared', 'the default\'s current member left out of what the pass compares', 'passReads = new Map(), compared = [currentId];', 'passReads = new Map(), compared = [];', 'switch-basis'],
    ['no-basis', 'the door without a basis (estimated whatever is still learning)', 'raw = !!(ids.length && usageEstimator.basisRaw && usageEstimator.basisRaw(ids));', 'raw = false;', 'switch-basis'],
    ['verdict-no-pool', 'K1\'s wrong side: the verdict reads with no pool (the .397 tip\'s)', "const read = poolReadCache(a && a.type === 'pooled' ? scope : sessionPoolOf(session));", 'const read = poolReadCache(null);', 'one-basis'],
    ['no-gen', 'a learn that landed is not seen until the memo\'s second is up', 'if (m && m.sig === sig && m.gen === gen && (', 'if (m && m.sig === sig && (', 'basis-flip'],
    ['no-hold', 'the fact not held for the run that read it (the memo\'s second can split one decision)', 'm.gen === gen && (m.run === run ||', 'm.gen === gen && (false ||', 'basis-flip'],
    ['no-kick', 'a flip another reader finds is not decided again', 'if (pass) sayBasisFlip(poolId, raw, true); else setImmediate(() => redecideOnBasis(poolId, raw));', 'if (pass) sayBasisFlip(poolId, raw, true);', 'basis-flip'],
    ['kick-unforced', 'the flip\'s pass not forced (the pool\'s 10 s gate swallows it)', '    maybePoolAutoSwitchForPool(pid, { force: true });\n  } catch { }\n}', '    maybePoolAutoSwitchForPool(pid);\n  } catch { }\n}', 'pool-own'],
    ['kick-self', 'a flip the pool\'s own pass finds also schedules a second pass', 'if (pass) sayBasisFlip(poolId, raw, true); else setImmediate(', 'if (pass) { sayBasisFlip(poolId, raw, true); setImmediate(() => redecideOnBasis(poolId, raw)); } else setImmediate(', 'pool-own'],
    ['kick-sync', 'the flip decided inside the reader\'s own run', 'else setImmediate(() => redecideOnBasis(poolId, raw));', 'else redecideOnBasis(poolId, raw);', 'pool-own'],
    ['ids-unwatched', 'the memo kept when what the pool compares changed', 'if (m && m.sig === sig && m.gen === gen && (', 'if (m && m.gen === gen && (', 'pool-own'],
    ['only-landing', 'only raw → estimated flips decided again', 'if (m && m.raw !== raw) {', 'if (m && m.raw === true && raw === false) {', 'pool-own'],
    ['no-passgen', 'the loop reuses its reads after a pass started inside it', 'const pr = _passGen === passGen ? passReads.get(sid) : null;', 'const pr = passReads.get(sid);', 'pool-own'],
    ['lanes-outside', 'K3: the lane\'s read-at only top-level (the roster\'s loaders take the readings raw)', 'subscriptionSignedOut: _oauthSignedOut, subscriptionSignedOutCause: _oauthSignedOutCause, accounts: accountsOut,', 'subscriptionSignedOut: _oauthSignedOut, subscriptionSignedOutCause: _oauthSignedOutCause, accounts: viewedAccounts,', 'route', 'src/usage-routes.js'],
    ['claim-session-words', 'K3: a claimed lane says «confirms when a session uses it»', '  if (claimedAt > 0) return t(', '  if (false) return t(', 'page-k3', 'src/lib/usage-source.js'],
    ['not-durable-unsaid', 'K2: a claim not on disk answered as on disk (no code)', "const notDurable = () => res.status(503).json({ ...body, code: 'not-durable', error: NOT_DURABLE_WORDS });", 'const notDurable = () => res.json(body);', 'route', 'src/usage-routes.js'],
    ['page-unsaid', 'K2: the page says only «Marked … as reset» over a not-durable answer', "return r && r.code === 'not-durable' ? t('", "return r && r.code === 'never' ? t('", 'route', 'src/lib/account-wall-words.js'],
    ['units-raw', 'K3: the age mark\'s units raw', "return min < 120 ? t('{n}m', { n: min }) : min < 48 * 60 ? t('{n}h', { n: Math.round(min / 60) }) : t('{n}d', { n: Math.round(min / 1440) });", "return min < 120 ? `${min}m` : min < 48 * 60 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;", 'page-k3', 'src/lib/account-wall-words.js'],
    ['flip-silent', 'a flip said by nobody', "    console.log(`[pool] ${(p && p.name) || pid}: ${raw ?", "    if (0) console.log(`[pool] ${(p && p.name) || pid}: ${raw ?", 'pool-own'],
    ['local-copy', 'relearn\'s side alone: the pass\'s own reader (the bare file + the estimate — no claim view)', 'const readCache = poolReadCache(poolId, now); // THE ONE DOOR (ROOT 1) on the pool\'s basis', "const readCache = (id) => { let raw = null; try { raw = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { } try { return estOverlayCache(raw, usageEstimator.estimateFor(id, raw, now)); } catch { return raw; } };", 'engine'],
  ];
  say('RED CONTROLS — the merged switch pass\'s wrong sides (patches the suite carries on a copy of src/)');
  for (const [tag, what, from, to, leg, rel = 'src/server/usage-pool-engine.js'] of WRONG) {
    const SRC = fs.readFileSync(path.join(REPO, rel), 'utf8');
    if (!ok(SRC.split(from).length === 2, `the patch «${tag}» applies to this tree's ${path.basename(rel)} (its anchor is there once)`)) continue;
    const MW = path.join(ROOT, 'patch-' + tag); fs.cpSync(path.join(REPO, 'src'), path.join(MW, 'src'), { recursive: true });
    fs.writeFileSync(path.join(MW, rel), SRC.replace(from, to));
    for (const f of ['package.json', 'node_modules', 'data', 'server.js', 'public', 'scripts']) { try { fs.symlinkSync(path.join(REPO, f), path.join(MW, f)); } catch { } }
    const r = await run(leg, MW); ok(!r.ok, `${what} ⇒ RED at ${leg}: ${r.detail}`);
  }
  // 主开发's mutant on 4ea7d008f: a refusal's mark never overtaken by a newer statement
  const OVR = 'mark: refusedAt != null ? !(statedAt != null && statedAt > refusedAt) : ';
  say('RED CONTROL — a refusal\'s mark never overtaken (`refusedAt != null ? true`), a patch the suite carries');
  if (ok(QMSRC.split(OVR).length === 2, 'the patch «never overtaken» applies to this tree\'s quota-model.js (its anchor is there once)')) {
    const M2 = path.join(ROOT, 'patch-ovr'); fs.cpSync(path.join(REPO, 'src'), path.join(M2, 'src'), { recursive: true });
    fs.writeFileSync(path.join(M2, 'src/quota-model.js'), QMSRC.replace(OVR, 'mark: refusedAt != null ? true : '));
    for (const f of ['package.json', 'node_modules', 'data', 'server.js']) { try { fs.symlinkSync(path.join(REPO, f), path.join(M2, f)); } catch { } }
    const r = await run('refusal-then-reading', M2); ok(!r.ok, `a refusal's mark never overtaken ⇒ RED at refusal-then-reading: ${r.detail}`);
  }
}
say(`  [${(performance.now() - T0).toFixed(0)} ms — the slowest legs: ${Object.entries(legMs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}]`);
say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red controls SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0);
