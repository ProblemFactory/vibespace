#!/usr/bin/env node
// THE POLLUTED LEGACY ANCHOR THAT NOTHING COULD HEAL (inc-mu6djxxt-8166, 2026-09-18,
// owner: "5h限额刷新不出来了" + the toast "已通过一个活动会话刷新额度——身份未验证:
// window matches no known account — archived"). One member's `.window-` anchor
// was a stamp the PRE-isolation panel left (source on-demand, no verifiedBy)
// naming a weekly reset the vendor never gave it; its API witness ring never
// filled (every session it hosted had been hot-switched, so the spawn-time
// OTel identity vetoed every candidate); the standing repair saw no evidence
// and kept the stamp; the isolated panel was "unverified" and never re-stamped;
// so every live reading of the member's TRUE window was archived as foreign —
// and the ⟳ route answered `success` for a reading it had just archived.
// Three fixes, each pinned here on the real modules:
//   ① reading-lag isolatedPanelAnchorVerdict (PURE) + usage-routes: with no API
//      witness, the isolated panel establishes / re-anchors / upgrades a LEGACY
//      anchor, archives the old one, never touches a verified one
//   ② the ⟳ route: a control reading the guard archived is a SKIPPED rung —
//      the route falls to the isolated panel instead of saying success
//   ③ apiWitnessEligibility: OTel disagreement vetoes only a session the pool
//      never re-pointed since spawn (a hot-switched session's OTel is spawn-time)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const tmp = [];
const mkd = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmp.push(d); return d; };
process.on('exit', () => { for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const RL = require(path.join(REPO, 'src/reading-lag.js'));
const L = require(path.join(REPO, 'src/server/usage-probe-log.js'));

// ── §1 the PURE verdict ──────────────────────────────────────────────────────
console.log('§1 isolatedPanelAnchorVerdict');
{
  const T = 1789930800; // the member's TRUE weekly reset (the isolated panel + its API agree)
  const LEGACY = { sevenDay: 1789920000, fiveHour: null, scoped: { fable: 1789920000 }, at: 1789692839577, source: 'on-demand' }; // the pre-fix stamp (another account's phase)
  const panel = { sevenDay: T, fiveHour: T - 14400, scoped: { fable: T } };
  const v = RL.isolatedPanelAnchorVerdict({ anchor: LEGACY, panelWindow: panel, apiWindow: null });
  ok('THE INCIDENT: a legacy anchor (no verifiedBy) that contradicts the isolated panel, no API witness ⇒ reanchor, reason names both windows', v.action === 'reanchor' && /legacy anchor 7d:1789920000/.test(v.reason) && /1789930800/.test(v.reason), JSON.stringify(v));
  ok('no anchor at all ⇒ stamp (the isolated panel establishes it)', RL.isolatedPanelAnchorVerdict({ anchor: null, panelWindow: panel }).action === 'stamp');
  ok('a legacy anchor that AGREES ⇒ upgrade (marked verified, nothing moves)', RL.isolatedPanelAnchorVerdict({ anchor: { ...LEGACY, sevenDay: T, scoped: { fable: T } }, panelWindow: panel }).action === 'upgrade');
  ok('NEGATIVE CONTROL: a VERIFIED anchor (an API run) that contradicts the panel is KEPT — only an API run may move it', RL.isolatedPanelAnchorVerdict({ anchor: { ...LEGACY, source: 'api', verifiedBy: 'rate-limit-events' }, panelWindow: panel }).action === 'keep');
  ok('NEGATIVE CONTROL: a phase-verified panel stamp is kept too', RL.isolatedPanelAnchorVerdict({ anchor: { ...LEGACY, verifiedBy: 'api-phase' }, panelWindow: panel }).action === 'keep');
  ok('NEGATIVE CONTROL: an API witness present ⇒ keep (the identity verdict governs)', RL.isolatedPanelAnchorVerdict({ anchor: LEGACY, panelWindow: panel, apiWindow: { sevenDay: T, scoped: {} } }).action === 'keep');
  ok('a panel with no weekly window decides nothing (a 5h window names a time, never an account)', RL.isolatedPanelAnchorVerdict({ anchor: LEGACY, panelWindow: { fiveHour: T - 14400, scoped: {} } }).action === 'keep');
  ok('the one-week roll is the same phase (weeklyNear) — an anchor a week older agrees', RL.isolatedPanelAnchorVerdict({ anchor: { ...LEGACY, sevenDay: T - 7 * 86400, scoped: { fable: T - 7 * 86400 } }, panelWindow: panel }).action === 'upgrade');
}

// ── §2 the isolated panel re-anchors through the REAL setupUsage ─────────────
console.log('§2 refreshViaCliPanel over a legacy anchor');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const usageMod = require(path.join(REPO, 'src/usage-routes.js'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (ms) => { const d = new Date(Date.now() + ms); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours() % 12 || 12}${d.getUTCHours() < 12 ? 'am' : 'pm'} (UTC)`; };
const panelText = `Current session: 25% used · resets ${at(3 * 3600e3)}\nCurrent week (all models): 20% used · resets ${at(3 * 86400e3)}\nCurrent week (Fable): 38% used · resets ${at(3 * 86400e3)}\n`;
const mkWorld = ({ apiWindow = null, probe = null } = {}) => {
  const root = mkd(`vs-anchor-heal-${process.pid}-`);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  const id = am.createSubscription({ name: 'Member M' }).id;
  fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } }));
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const bin = path.join(root, 'fake-claude');
  fs.writeFileSync(bin, `#!/bin/sh\ncat <<'EOF'\n${panelText}EOF\n`, { mode: 0o755 });
  const routes = {};
  const app = { get(p, h) { routes['GET ' + p] = h; }, post(p, h) { routes['POST ' + p] = h; }, put() { }, delete() { }, use() { }, locals: {} };
  let windowsFn = () => { const out = {}; try { out[id] = JSON.parse(fs.readFileSync(path.join(cacheDir, RL.windowSidecarName(id)), 'utf8')); } catch { } return out; };
  const u = usageMod.setupUsage({
    app, accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
    serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
    CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
    AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
    apiDerivedWindow: () => ({ window: apiWindow, ring: [], k: 3 }), establishedWindows: () => windowsFn(),
    probeUsageForAccountKey: probe || (async () => false), onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
  });
  const sidecar = () => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, RL.windowSidecarName(id)), 'utf8')); } catch { return null; } };
  const archive = () => { try { return fs.readFileSync(path.join(dataDir, 'archive', 'readings-foreign-usage-cache.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
  return { root, dataDir, am, id, cacheDir, u, routes, sidecar, archive, log: () => L.readProbeLog(dataDir) };
};
const LEGACY_STAMP = (sec) => ({ sevenDay: sec, fiveHour: null, scoped: { fable: sec }, at: Date.now() - 3 * 3600e3, source: 'on-demand' });
{
  const w = mkWorld();
  const foreign = Math.floor(Date.now() / 1000) + 2 * 86400 + 3600; // a phase 21 h off the panel's — another account's
  fs.writeFileSync(path.join(w.cacheDir, RL.windowSidecarName(w.id)), JSON.stringify(LEGACY_STAMP(foreign)));
  const okp = await w.u.refreshViaCliPanel(w.id);
  const sc = w.sidecar(), rec = w.log().pop(), arch = w.archive();
  ok('the panel writes (unverified numbers were always written) …', okp === true && rec && rec.outcome === 'written' && rec.identityVerified === false, JSON.stringify(rec && { o: rec.outcome, idv: rec.identityVerified }));
  ok('…and RE-ANCHORS the legacy sidecar from the isolated panel: verifiedBy isolated-panel, provisional, the panel\'s weekly reset', sc && sc.verifiedBy === 'isolated-panel' && sc.provisional === true && sc.sevenDay === rec.parsed.sevenDay.resetsAt && sc.scoped.fable === rec.parsed.sevenDay.resetsAt, JSON.stringify(sc));
  ok('…the probe record says so', /^reanchor \(legacy anchor/.test(rec.sidecar || ''), rec.sidecar);
  ok('…and the old anchor is ARCHIVED with a reason naming both windows (never destroyed)', arch.length === 1 && arch[0].migration === 'legacy-anchor-reanchored' && arch[0].key === w.id && arch[0].was.sevenDay === foreign && /contradicts the isolated panel/.test(arch[0].reason), JSON.stringify(arch));
  // the guard now accepts the member's TRUE window
  const d = RL.decideReadingTarget({ key: w.id, readingWindow: { sevenDay: rec.parsed.sevenDay.resetsAt, fiveHour: rec.parsed.fiveHour.resetsAt, scoped: { fable: rec.parsed.sevenDay.resetsAt } }, windows: { [w.id]: sc } });
  ok('the window guard now WRITES a live reading of the member\'s true window (the 5h reading refreshes again)', d.action === 'write', JSON.stringify(d));
}
{
  const w = mkWorld();
  const okp = await w.u.refreshViaCliPanel(w.id);
  const sc = w.sidecar(), rec = w.log().pop();
  ok('no anchor at all: the isolated panel ESTABLISHES it (stamp)', okp && sc && sc.verifiedBy === 'isolated-panel' && /^stamp \(/.test(rec.sidecar || ''), JSON.stringify({ sc, s: rec && rec.sidecar }));
  ok('…and nothing is archived (there was nothing to replace)', w.archive().length === 0);
}
{
  const w = mkWorld();
  fs.writeFileSync(path.join(w.cacheDir, RL.windowSidecarName(w.id)), JSON.stringify({ ...LEGACY_STAMP(Math.floor(Date.now() / 1000) + 3 * 86400), source: 'api', verifiedBy: 'rate-limit-events', n: 3 }));
  const before = w.sidecar();
  await w.u.refreshViaCliPanel(w.id);
  const sc = w.sidecar(), rec = w.log().pop();
  ok('NEGATIVE CONTROL: a VERIFIED (API-run) anchor is untouched by an unverified panel, even when it agrees', JSON.stringify(sc) === JSON.stringify(before) && /not-stamped \(identity unverified; the anchor is verified/.test(rec.sidecar || ''), rec && rec.sidecar);
}
{
  const foreignApi = { sevenDay: Math.floor(Date.now() / 1000) + 2 * 86400 + 3600, scoped: {} };
  const w = mkWorld({ apiWindow: foreignApi });
  fs.writeFileSync(path.join(w.cacheDir, RL.windowSidecarName(w.id)), JSON.stringify(LEGACY_STAMP(foreignApi.sevenDay)));
  const okp = await w.u.refreshViaCliPanel(w.id);
  const rec = w.log().pop();
  ok('NEGATIVE CONTROL: with an API witness that DISAGREES the panel is still refused outright (B-855a c1 unchanged) — nothing written, nothing re-anchored', okp === false && rec.outcome === 'write-refused' && w.sidecar().verifiedBy === undefined, JSON.stringify({ o: rec.outcome, sc: w.sidecar() }));
}

// ── §3 the ⟳ route: an archived control reading falls to the panel ───────────
console.log('§3 POST /api/usage/refresh ladder');
const call = async (w, body) => new Promise((resolve) => {
  const res = { status(c) { this._c = c; return this; }, json(o) { resolve({ status: this._c || 200, body: o }); } };
  w.routes['POST /api/usage/refresh']({ body }, res);
});
{
  const w = mkWorld({ probe: async () => ({ parsed: { fiveHour: { utilization: 0.25 } }, rung: 'control', sessionId: 'sess-1', target: null, identityVerified: false, why: 'window matches no known account — archived', skipped: [] }) });
  const r = await call(w, { account: w.id });
  ok('THE TOAST\'S SHAPE: the session answered but the guard ARCHIVED it ⇒ the route does NOT say success-via-session', r.body && r.body.via !== 'session', JSON.stringify(r.body));
  ok('…it falls to the isolated panel and answers via cli-panel', r.body && r.body.success === true && r.body.via === 'cli-panel' && r.body.rung === 'panel', JSON.stringify(r.body));
  ok('…listing the refused session as SKIPPED with the guard\'s reason', Array.isArray(r.body.skipped) && r.body.skipped.length === 1 && r.body.skipped[0].sessionId === 'sess-1' && /window guard archived/.test(r.body.skipped[0].why), JSON.stringify(r.body.skipped));
  ok('…and the panel probe actually ran (a written panel record)', w.log().some((x) => x.rung === 'panel' && x.outcome === 'written'));
}
{
  const w = mkWorld({ probe: async () => ({ parsed: { fiveHour: { utilization: 0.25 } }, rung: 'control', sessionId: 'sess-1', target: w0id(), identityVerified: true, why: 'answered by session sess-1; weekly window matches', skipped: [] }) });
  function w0id() { return w && w.id; }
  const r = await call(w, { account: w.id });
  ok('CONTROL: a session answer the guard WROTE still answers via session (no panel spawn)', r.body && r.body.success === true && r.body.via === 'session' && r.body.rung === 'control' && !w.log().some((x) => x.rung === 'panel'), JSON.stringify(r.body));
}

// ── §4 witness eligibility for a hot-switched session (REAL engine) ──────────
console.log('§4 apiWitnessEligibility: OTel disagreement vs a hot-switched session');
{
  const dir = mkd(`vs-anchor-heal-eng-${process.pid}-`);
  const cacheDir = path.join(dir, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const ROSTER = { 'pool-1': { id: 'pool-1', name: 'Pool', type: 'pooled' }, 'sub-1': { id: 'sub-1', name: 'Member M', type: 'subscription' }, 'sub-2': { id: 'sub-2', name: 'Member P', type: 'subscription' } };
  const accounts = {
    get(id) { return ROSTER[id] || null; }, list() { return { accounts: Object.values(ROSTER) }; },
    poolCurrentFor() { return null; }, poolCurrent() { return null; }, poolMembers() { return [ROSTER['sub-1'], ROSTER['sub-2']]; },
    subCredsPath(id) { return path.join(dir, 'nope', id); }, sessionPoolLinkPath() { return path.join(dir, 'nope-link'); },
  };
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(),
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting() { return undefined; }, getAccounts() { return accounts; }, getHosts() { return null; },
    getUsageHistory() { return null; }, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => null, getOtelIngest: () => null, getQuotaProbe: () => null,
  });
  const now = Date.now();
  const slot = { key: 'sub-1', slotOk: true, shadowed: false };
  const disagree = { agree: false, observed: 'sub-2' };
  const fresh = { _webuiId: 'sess-never', _accountId: 'pool-1', claudeSessionId: 'c-never', createdAt: now - 3 * 3600e3 };
  const e1 = eng.apiWitnessEligibility(fresh, slot, 'sub-1', disagree);
  ok('a session the pool NEVER re-pointed: OTel disagreement still vetoes (its OTel IS its identity)', e1.ok === false && /OTel observed/.test(e1.why), JSON.stringify(e1));
  // the pool moved this conversation 2 h ago (a pool-wide default move: sessionId null) — outside the 10-min lag shadow
  app.locals.slotTransitions.record({ sessionId: null, poolId: 'pool-1', from: 'sub-2', to: 'sub-1', at: now - 2 * 3600e3, why: 'test' });
  const switched = { _webuiId: 'sess-switched', _accountId: 'pool-1', claudeSessionId: 'c-switched', createdAt: now - 3 * 3600e3 };
  const e2 = eng.apiWitnessEligibility(switched, slot, 'sub-1', disagree);
  ok('THE INCIDENT: a session hot-switched since spawn: OTel disagreement is the spawn-time identity — the reading IS a witness candidate', e2.ok === true && /hot-switched/.test(e2.why), JSON.stringify(e2));
  const spawnedAfter = { _webuiId: 'sess-late', _accountId: 'pool-1', claudeSessionId: 'c-late', createdAt: now - 3600e3 };
  const e3 = eng.apiWitnessEligibility(spawnedAfter, slot, 'sub-1', disagree);
  ok('NEGATIVE CONTROL: a session spawned AFTER that move was never switched — the veto stands', e3.ok === false, JSON.stringify(e3));
  app.locals.slotTransitions.record({ sessionId: null, poolId: 'pool-1', from: 'sub-1', to: 'sub-2', at: now - 60e3, why: 'test' });
  const e4 = eng.apiWitnessEligibility({ ...switched, _webuiId: 'sess-recent', claudeSessionId: 'c-recent' }, slot, 'sub-1', disagree);
  ok('NEGATIVE CONTROL: a re-point inside the lag shadow (1 min ago) still vetoes through the re-point leg', e4.ok === false && /re-pointed/.test(e4.why), JSON.stringify(e4));
  const e5 = eng.apiWitnessEligibility(switched, { key: 'sub-1', slotOk: false }, 'sub-1', null);
  ok('the slot leg is untouched: an unvalidated slot is never a witness', e5.ok === false && /slot not validated/.test(e5.why));
}

// ── §5 wiring pins ───────────────────────────────────────────────────────────
console.log('§5 wiring pins');
{
  const ur = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  ok('usage-routes: the ⟳ route treats an archived control reading as a skipped rung (falls through)', /const viaWritten = parsedVia && !\(viaSession && typeof viaSession === 'object' && 'target' in viaSession && !viaSession\.target\);/.test(ur) && /if \(parsedVia\) skipped\.push\(/.test(ur));
  ok('usage-routes: the panel consults the PURE verdict before touching a sidecar, writes verifiedBy isolated-panel + provisional, archives a re-anchored legacy stamp', /isolatedPanelAnchorVerdict\(\{ anchor, panelWindow: w, apiWindow: idv\.apiWindow \|\| null \}\)/.test(ur) && /verifiedBy: 'isolated-panel', provisional: true/.test(ur) && /migration: 'legacy-anchor-reanchored'/.test(ur));
  ok('engine: the OTel leg asks switchedSinceSpawn, memoised per session (no new session field)', /corr\.agree === false && !switchedSinceSpawn\(session, now\)/.test(eng) && /const _switchedSince = new WeakMap\(\);/.test(eng) && /lastRepointRow\(session, \{ at: now, minAt: born \}\)/.test(eng));
  ok('ci.mjs runs this suite', /'test-window-anchor-heal'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')));
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
