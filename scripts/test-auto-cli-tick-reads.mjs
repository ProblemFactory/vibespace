#!/usr/bin/env node
// THE AUTO-CLI TICK'S LOGIN READS (prod-stall-202, 2026-10-03). Production (2.369.202) stopped its event loop for
// 6–15 s every one to two minutes. A CPU profile taken on the live process through the V8 inspector caught a 16.9 s
// stall: the auto-cli loop's 60 s tick asked projectionRereadFor once per claude account (13), each call resolved
// every live pooled conversation's billing member (25) through sessionBillingMember → validateBillingSlot →
// accounts.poolMembers, which reads EVERY member's login (13 × .credentials.json + .claude.json) synchronously —
// ~9 K readFileSync a tick over the NFS-backed data dir (100–1000 µs each), 10.1 s of the 16.9. The fix reads the
// ONE linked member's login (accounts.isPoolMember) and resolves who-bills-where ONCE per tick
// (projectionBillingIndex). This suite holds it, on a real AccountManager + the real engine + the real loop:
//   §1 isPoolMember ≡ poolMembers(pool).some(id) — every account, every login-file state, both member-list shapes,
//      and the same throw for a pool whose harness is not registered;
//   §2 the engine's answers are UNCHANGED against a patched copy with the fix reverted (sessionBillingMember,
//      fireIdentityFor, projectionRereadFor with and without the tick's index, maybePoolAutoSwitchForPool's moves)
//      across logins wiped / expired / unreadable / restored, hot and non-hot pools;
//   §3 one tick asks the same projections and spends the same refreshes as the reverted tick — also when a login
//      changes or turns unreadable MID-tick;
//   §4 the WORK (synchronous fs calls a tick makes) is linear in the conversations and the members, never their
//      product, and the LOOP leg (each fs call made 150 µs slow, the NFS shape) holds the tick's synchronous
//      segment under 250 ms — the reverted copy reads it red on both.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const ENGINE = path.join(REPO, 'src/server/usage-pool-engine.js');
const LOOP = path.join(REPO, 'src/server/auto-cli-loop.js');
const engMod = require(ENGINE);
const { createAutoCliLoop } = require(LOOP);
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tick-reads-'));
process.on('exit', () => { try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch { } });

// ── the patched copies: the fix reverted, every relative require re-pointed at the real tree ──
const patched = (name, file, edits) => {
  let txt = fs.readFileSync(file, 'utf8').replace(/require\('(\.\.?\/[^']+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(file), f))})`);
  for (const [a, b] of edits) { if (!txt.includes(a)) throw new Error(`patch anchor missing in ${name}: ${a.slice(0, 70)}`); txt = txt.replace(a, b); }
  const out = path.join(scratchDir, name); fs.writeFileSync(out, txt); return out;
};
const PRE_ENGINE = require(patched('engine-pre.js', ENGINE, [
  ["if (!accounts.isPoolMember(poolId, linkedId)) return", "if (!(accounts.poolMembers(poolId) || []).some((m) => m.id === linkedId)) return"],
  [`    const index = billing || projectionBillingIndex();
    if (!index) return null;
    const fams = new Set();
    for (const s of index.get(memberId) || []) fams.add(projectionFamilyFor(s, sessionModelFor(s)) || null);
`, `    const fams = new Set();
    for (const [, s] of activeSessions) {
      if ((s.backend || 'claude') !== 'claude' || s.host || !s._accountId) continue;
      const a = accounts.get(s._accountId);
      const on = a && a.type === 'pooled' ? sessionBillingMember(s, a.id).id : s._accountId;
      if (on !== memberId) continue;
      fams.add(projectionFamilyFor(s, sessionModelFor(s)) || null);
    }
`],
  ["const hot = accounts.poolsWithMember(memberId).some(", "const hot = memberPoolsOf(memberId).some("]]));
const PRE_LOOP = require(patched('loop-pre.js', LOOP, [["d.projectionRereadFor(a.id, now, billingIndex())", "d.projectionRereadFor(a.id, now)"]]));

// ── the world: production's shape — 13 logged-in members in one auto pool, 25 linked pooled conversations,
//    2 direct ones, a codex and a remote one the projection skips ──
let worldN = 0;
// `at` = the instant the world's readings and conversations are STAMPED from (B-403e follow-up 4: §4 hands its one instant, so on
// the LOOP's clock (T4) every world it builds has the same ages whatever the build took — the engine's own readers still read
// Date.now(); no threshold of theirs sits there; the other sections stamp from the clock, as before)
function mkWorld({ members = 13, pooled = 25, hot = true, explicit = true, engine = engMod, at = Date.now() } = {}) {
  const root = path.join(scratchDir, 'w' + (++worldN)), dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const am = new AccountManager({ dataDir });
  const ids = [];
  const login = (id, extra = {}) => {
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 864e5, subscriptionType: 'max', ...extra } }), { mode: 0o600 });
    fs.writeFileSync(path.join(am.subDir(id), '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: id + '@example.com', organizationName: 'org ' + id } }));
  };
  for (let i = 0; i < members; i++) { const id = am.createSubscription({ name: 'M' + i }).id; login(id); ids.push(id); }
  const P = am.createPool({ name: 'pool', ...(explicit ? { members: ids.slice() } : {}) }).id;
  am.setPoolTarget(P, ids[0]);
  am.updatePool(P, { auto: true, hot });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(at / 1000);
  ids.forEach((id, i) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: at - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.2 + 0.03 * i, resetsAt: nowS + 4 * 3600 }, sevenDay: { utilization: 0.3, resetsAt: nowS + 5 * 86400 } })));
  const sessions = new Map();
  const notices = [];
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engine.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t),
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => null, getQuotaProbe: () => null,
  });
  // a burn on every member, so a member with live conversations HAS a crossing to project (the answer compared below)
  eng.usageEstimator.burnFor = (id) => { const i = ids.indexOf(id); return i < 0 ? {} : { fiveHour: 0.0015 * (1 + (i % 4)), sevenDay: 0.0002 }; };
  eng.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });   // usage-predict law B3: this world's lanes are stated ON (the pool reads a burn only on an ON lane)
  const models = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-fable-5'];
  for (let k = 0; k < pooled; k++) {
    const sid = `sess-${worldN}-${k}`;
    sessions.set(sid, { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, _accountId: P, _servedModel: models[k % 3], _servedModelAt: at, createdAt: at - 6e5, name: 'c' + k });
    am.ensureSessionPoolLink(P, sid, ids[(k * 7) % members]);
  }
  sessions.set('direct-a', { backend: 'claude', mode: 'chat', host: null, _webuiId: 'direct-a', _accountId: ids[1], _servedModel: 'claude-opus-4-5', name: 'd1' });
  sessions.set('direct-b', { backend: 'claude', mode: 'chat', host: null, _webuiId: 'direct-b', _accountId: ids[2], _servedModel: 'claude-sonnet-4-5', name: 'd2' });
  sessions.set('codex-a', { backend: 'codex', mode: 'chat', host: null, _webuiId: 'codex-a', _accountId: ids[3], name: 'x' });
  sessions.set('remote-a', { backend: 'claude', mode: 'chat', host: 'h1', _webuiId: 'remote-a', _accountId: P, name: 'r' });
  const credsOf = (id) => path.join(am.subDir(id), '.credentials.json');
  return { root, dataDir, am, eng, sessions, ids, P, cacheDir, notices, login, credsOf };
}
// the login-file states a member can be in (each applied to member `id`, undone by w.login(id))
const STATES = {
  'logged in': () => { },
  'wiped (no accessToken)': (w, id) => fs.writeFileSync(w.credsOf(id), JSON.stringify({ claudeAiOauth: {} })),
  'expired access + refresh': (w, id) => w.login(id, { expiresAt: Date.now() - 864e5, refreshTokenExpiresAt: Date.now() - 36e5 }),
  'unreadable (garbage JSON)': (w, id) => fs.writeFileSync(w.credsOf(id), '{"claudeAiOauth": {"accessTok'),
  'unreadable (a directory)': (w, id) => { fs.rmSync(w.credsOf(id), { force: true }); fs.mkdirSync(w.credsOf(id)); },
  'missing': (w, id) => fs.rmSync(w.credsOf(id), { force: true }),
};
const restore = (w, id) => { try { fs.rmSync(w.credsOf(id), { recursive: true, force: true }); } catch { } w.login(id); };
const settle = (fn) => { try { return { v: fn() }; } catch (e) { return { threw: String(e && e.message) }; } };

// ── §1 the predicate ──
console.log('§1 isPoolMember ≡ poolMembers(pool).some(id)');
for (const explicit of [true, false]) {
  const w = mkWorld({ members: 5, pooled: 0, explicit });
  const extra = w.am.createSubscription({ name: 'outside' }).id; w.login(extra); // listed nowhere (explicit) / a member by default (null list)
  const probes = [...w.ids, extra, w.P, 'sub-nope', null, undefined, ''];
  let n = 0, bad = [];
  for (const [st, apply] of Object.entries(STATES)) {
    for (const victim of [w.ids[0], w.ids[3], extra]) {
      apply(w, victim);
      for (const id of probes) {
        n++;
        const a = settle(() => w.am.isPoolMember(w.P, id)), b = settle(() => (w.am.poolMembers(w.P) || []).some((m) => m.id === id));
        if (!isDeepStrictEqual(a, b)) bad.push(`${st}/${victim === extra ? 'outside' : 'member'}/${id}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      }
      restore(w, victim);
    }
  }
  ok(`§1 ${explicit ? 'explicit member list' : 'members:null (every subscription)'}: ${n} probes over ${Object.keys(STATES).length} login-file states — the same answer every time`, !bad.length, bad.slice(0, 3).join(' | '));
}
{
  const w = mkWorld({ members: 3, pooled: 0, explicit: false });
  // a pool whose harness is no longer registered (a plugin removed): both throw, and validateBillingSlot reads 'slot-unreadable' either way
  const rec = w.am.get(w.P); rec.backend = 'gone-plugin';
  w.am._state.accounts.find((x) => x.id === w.ids[0]).backend = 'gone-plugin';
  const a = settle(() => w.am.isPoolMember(w.P, w.ids[1])), b = settle(() => (w.am.poolMembers(w.P) || []).some((m) => m.id === w.ids[1]));
  ok('§1 a pool on an unregistered harness: isPoolMember throws exactly where poolMembers throws (a miss too)', !!a.threw && verdictOf(isDeepStrictEqual(a, b)), JSON.stringify([a, b]));
  const c = settle(() => w.am.isPoolMember(w.P, w.ids[0])), d = settle(() => (w.am.poolMembers(w.P) || []).some((m) => m.id === w.ids[0]));
  ok('§1 …and on a hit', !!c.threw && verdictOf(isDeepStrictEqual(c, d)), JSON.stringify([c, d]));
}

{
  const w = mkWorld({ members: 4, pooled: 0, explicit: true });
  const P2 = w.am.createPool({ name: 'second', members: [w.ids[1], w.ids[2]] }).id; w.am.updatePool(P2, { auto: true, hot: false });
  const P3 = w.am.createPool({ name: 'all' }).id; // members:null — every subscription
  const viaList = (id) => (w.am.list().accounts || []).filter((a) => a.type === 'pooled' && (w.am.poolMembers(a.id) || []).some((m) => m.id === id)).map((a) => ({ id: a.id, name: a.name, backend: a.backend, auto: a.auto, hot: a.hot }));
  let n = 0; const bad = [];
  for (const [st, apply] of Object.entries(STATES)) for (const victim of [w.ids[1], w.ids[3]]) {
    apply(w, victim);
    for (const id of [...w.ids, w.P, P2, P3, 'sub-nope', null]) { n++; const a = settle(() => w.am.poolsWithMember(id)), b = settle(() => viaList(id)); if (!isDeepStrictEqual(a, b)) bad.push(`${st}/${id}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }
    restore(w, victim);
  }
  ok(`§1 poolsWithMember ≡ list()'s pooled rows whose poolMembers hold the id (id, name, backend, auto, hot) — ${n} probes, 3 pools (explicit, hot/non-hot, members:null)`, !bad.length, bad.slice(0, 2).join(' | '));
  const acc = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  ok("§1 PIN: list()'s pooled row still says auto: true and hot: !!a.hot — the two literals poolsWithMember mirrors (change one ⇒ change both)", verdictOf(/return \{ \.\.\.base, pooled: true,[^\n]*auto: true,[^\n]*hot: !!a\.hot,/.test(acc)));
}

// ── §2 the engine's answers, fixed vs reverted, on ONE world (both engines read the same files and sessions) ──
console.log('§2 the engine answers the same as the reverted copy');
const NOW = () => Date.now();
const engineAnswers = (w, eng, viaIndex, now) => {
  const out = { billing: {}, fire: {}, proj: {} };
  for (const [sid, s] of w.sessions) {
    out.billing[sid] = settle(() => eng.sessionBillingMember(s, w.P));
    out.fire[sid] = settle(() => eng.fireIdentityFor(s));
  }
  const idx = viaIndex ? eng.projectionBillingIndex() : null;
  for (const id of [...w.ids, w.P, 'sub-nope', null]) out.proj[id] = settle(() => eng.projectionRereadFor(id, now, idx));
  return out;
};
for (const hot of [true, false]) {
  const w = mkWorld({ hot });
  const pre = PRE_ENGINE.create({ ...{}, app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: w.root, USAGE_CACHE_DIR: w.cacheDir, activeSessions: w.sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => w.am, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
  pre.usageEstimator.burnFor = w.eng.usageEstimator.burnFor;
  pre.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });   // usage-predict law B3: this world's lanes are stated ON (the pool reads a burn only on an ON lane)
  let rounds = 0, bad = [], projected = 0;
  for (const [st, apply] of Object.entries(STATES)) {
    for (const victim of [w.ids[0], w.ids[7]]) { // ids[0] holds linked conversations AND is the pool default; ids[7] holds linked conversations
      apply(w, victim);
      const now = Math.floor(NOW() / 60e3) * 60e3; // ONE instant for the round's three answers (each taking its own straddled a minute boundary now and then)
      const A = engineAnswers(w, pre, false, now), B = engineAnswers(w, w.eng, false, now), C = engineAnswers(w, w.eng, true, now);
      rounds++;
      if (!isDeepStrictEqual(A, B)) bad.push(`${st}: per-call ${JSON.stringify(Object.entries(A.proj).filter(([k, v]) => !isDeepStrictEqual(v, B.proj[k])).slice(0, 1))}`);
      if (!isDeepStrictEqual(A, C)) bad.push(`${st}: via index`);
      projected = Math.max(projected, Object.values(B.proj).filter((x) => x.v).length);
      restore(w, victim);
    }
  }
  ok(`§2 ${hot ? 'hot' : 'non-hot (held members)'} pool: ${rounds} login-file states × 29 conversations × 16 ids — sessionBillingMember, fireIdentityFor and projectionRereadFor (per call AND through one index) equal the reverted engine's`, !bad.length, bad.slice(0, 3).join(' | '));
  ok(`§2 ${hot ? 'hot' : 'non-hot'}: the compared projections are real crossings, not a column of nulls (${projected} members project)`, projected >= 5, String(projected));
}
{
  // maybePoolAutoSwitchForPool MOVES links: two identical worlds, one per engine, the same member signed out — the same moves
  const moves = (engine) => {
    const w = mkWorld({ engine, hot: true });
    w.eng.usageEstimator.burnFor = () => ({});
    w.eng.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });   // usage-predict law B3: this world's lanes are stated ON (the pool reads a burn only on an ON lane)
    fs.writeFileSync(path.join(w.cacheDir, w.ids[0] + '.json'), JSON.stringify({ fetchedAt: Date.now() - 30e3, source: 'cli-usage', fiveHour: { utilization: 0.99, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, sevenDay: { utilization: 0.5, resetsAt: Math.floor(Date.now() / 1000) + 4 * 86400 } }));
    STATES['wiped (no accessToken)'](w, w.ids[7]);
    try { w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); } catch (e) { return 'threw ' + e.message; }
    const name = (id) => (id && w.am.get(id)?.name) || id;
    return JSON.stringify({ target: name(w.am.poolCurrent(w.P)), links: [...w.sessions.keys()].map((sid) => name(w.am.poolCurrentFor(w.P, sid))), notices: w.notices.map((t) => String(t).replace(/sub-[0-9a-f]+|pool-[0-9a-f]+|sess-\d+-/g, '#')) });
  };
  const a = moves(PRE_ENGINE), b = moves(engMod);
  ok('§2 maybePoolAutoSwitchForPool (a member walled at 99 %, another signed out): the same target, the same 29 links, the same notices as the reverted engine', a === b, `${a.slice(0, 200)} ≠ ${b.slice(0, 200)}`);
  ok('§2 …and it MOVED something (the comparison is not of two idle pools)', !/"target":"M0"/.test(b) || verdictOf(/"links":\[(?!("M0",?)+\])/.test(b)), b.slice(0, 160));
}

// ── §3 one tick, fixed vs reverted: the same projections asked, the same refreshes spent ──
console.log('§3 one tick asks and spends the same as the reverted tick');
const T = Math.floor(Date.now() / 60e3) * 60e3; // one instant for every tick compared
async function runTick(w, eng, loopMod, { midTick = null } = {}) {
  const asked = [], spent = [];
  let n = 0;
  const loop = loopMod.createAutoCliLoop({
    serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined), accounts: w.am, autoCliReady: () => true,
    USAGE_CACHE_DIR: w.cacheDir, usageIdentityGroupsCached: () => eng.usageIdentityGroupsCached(),
    usageEstimator: { estimateFor: () => { if (midTick && ++n === 5) midTick(); return null; } },
    projectionRereadFor: (id, now, idx) => { const r = eng.projectionRereadFor(id, now, idx); asked.push([w.am.get(id)?.name, r]); return r; },
    projectionBillingIndex: eng.projectionBillingIndex, lastMemberReadAt: () => 0,
    usage: { refreshViaCliPanel: async (k) => { spent.push(w.am.get(k)?.name); return false; } },
    onMemberReadingFresh() { }, dataDir: path.join(w.root, 'loop-' + (eng === w.eng ? 'new' : 'pre')), now: () => T, rand: () => 0.5, log() { }, warn() { },
  });
  await loop.tick();
  return { asked, spent };
}
{
  for (const [label, mid] of [['no change', null], ['a member signs out after the 5th account', (w) => STATES['wiped (no accessToken)'](w, w.ids[7])], ['a login turns unreadable after the 5th account', (w) => STATES['unreadable (garbage JSON)'](w, w.ids[0])], ['a member signs back in after the 5th account', (w) => restore(w, w.ids[4])]]) {
    const w = mkWorld({ hot: true });
    const pre = PRE_ENGINE.create({ app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: w.root, USAGE_CACHE_DIR: w.cacheDir, activeSessions: w.sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => w.am, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
    pre.usageEstimator.burnFor = w.eng.usageEstimator.burnFor;
    pre.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });   // usage-predict law B3: this world's lanes are stated ON (the pool reads a burn only on an ON lane)
    if (/signs back in/.test(label)) STATES['wiped (no accessToken)'](w, w.ids[4]);
    const snap = () => Object.fromEntries(w.ids.map((id) => [id, fs.existsSync(w.credsOf(id)) && fs.statSync(w.credsOf(id)).isFile() ? fs.readFileSync(w.credsOf(id), 'utf8') : null]));
    const before = snap();
    const A = await runTick(w, pre, PRE_LOOP, { midTick: mid && (() => mid(w)) });
    for (const [id, txt] of Object.entries(before)) { if (txt == null) continue; fs.writeFileSync(w.credsOf(id), txt); } // the same files for the second run
    const B = await runTick(w, w.eng, { createAutoCliLoop }, { midTick: mid && (() => mid(w)) });
    const projected = B.asked.filter(([, r]) => r).length; // a member signed out when the tick began is not asked (12)
    ok(`§3 ${label}: ${B.asked.length} projections asked, ${projected} crossing, ${B.spent.length} refreshes — equal to the reverted tick`, gateOf(isDeepStrictEqual(A, B)) && B.asked.length === (/signs back in/.test(label) ? 12 : 13) && projected >= 5, JSON.stringify([A.asked.length, B.asked.length, projected, A.spent, B.spent]));
  }
}

// ── §4 the WORK and the LOOP ──
console.log('§4 work linear in conversations and members, the loop ≤ 1/5 of the reverted tick at 150 µs per fs call');
const FS_CALLS = ['readFileSync', 'statSync', 'lstatSync', 'readlinkSync', 'existsSync', 'readdirSync', 'realpathSync', 'openSync'];
// (B-403e) an ASK of the mount names a path: a read through a descriptor follows its open and is counted there — the
// helper reads a sign-in file's stat and text through ONE open (src/run-reads.js facts), where the release made a stat and a read
// B-403e: the run's memo (src/run-reads.js) answers a file asked twice in ONE synchronous run from its first ask, so a tick's
// members × accounts × conversations reads would collapse to one ask per file — on BOTH sides: the old tick put back into the
// tree would read green. A LEG THAT GUARDS THE CODE'S OWN WORK COUNTS THE CODE: both ticks run with every routed ask going to
// the mount (a copy of the helper whose ask is the call itself, swapped in for the measurement); the memo's own law is
// test-pool-pass-reads'.
const RR = require(path.join(REPO, 'src/run-reads.js'));
const RR_OFF = (() => { const src = fs.readFileSync(path.join(REPO, 'src/run-reads.js'), 'utf8'); const needle = 'function ask(kind, p, fn) {\n'; if (src.split(needle).length !== 2) throw new Error('the run-reads ask needle moved'); const f = path.join(scratchDir, 'run-reads-off.cjs'); fs.writeFileSync(f, editAnchor(src, needle, needle + '  return fn();\n', "src/run-reads.js")); return require(f); })();
// §4's ONE instant, taken before any of its worlds is built — and each world is STAMPED from it (mkWorld's `at`): its readings
// a minute before it and its conversations' times from it, every time (B-403e follow-up 4: before, the readings were stamped
// from the clock at each build, so their age at T4 was «about a minute» and moved with the build's own time)
const T4 = Date.now();
async function measureTick(shape, opts = {}) {
  const saved = {};
  for (const k of ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat', 'signature']) { saved[k] = RR[k]; RR[k] = RR_OFF[k]; }
  try { return await measureTick0(shape, opts); } finally { Object.assign(RR, saved); }
}
async function measureTick0(shape, { slowUs = 0, pre = false, due = false } = {}) {
  const w = mkWorld({ ...shape, engine: pre ? PRE_ENGINE : engMod, at: T4 });
  // B-403e follow-up (6): THE DUE TICK — member ids[0]'s reading and its last read two hours old: its refresh IS due
  const DUE_AGO = 2 * 36e5, dueId = due ? w.ids[0] : null, refreshed = [];
  if (due) { const f = path.join(w.cacheDir, dueId + '.json'); fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), fetchedAt: T4 - DUE_AGO })); }
  if (due && w.eng.usageFolder) await w.eng.usageFolder.refresh();   // B-360d U3: a write straight into the folder reaches the kept reply at its next refresh (before the counted tick)
  const orig = {}; let calls = 0, counting = true;   // B-403e: the count is the TICK's work — it ends when the tick's own promise settles
  for (const k of FS_CALLS) {
    orig[k] = fs[k];
    fs[k] = function (...a) { if (counting && typeof a[0] !== 'number') calls++; if (slowUs) { const end = performance.now() + slowUs / 1000; while (performance.now() < end); } return orig[k].apply(this, a); };
  }
  let gap = 0, last = performance.now();
  const probe = setInterval(() => { const t = performance.now(); gap = Math.max(gap, t - last); last = t; }, 1);
  await new Promise((r) => setTimeout(r, 5)); last = performance.now(); gap = 0;
  let syncMs = 0;
  try {
    const loop = (pre ? PRE_LOOP : { createAutoCliLoop }).createAutoCliLoop({
      serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined), accounts: w.am, autoCliReady: () => true,
      USAGE_CACHE_DIR: w.cacheDir, usageIdentityGroupsCached: () => w.eng.usageIdentityGroupsCached(), usageEstimator: { estimateFor: () => null },
      projectionRereadFor: w.eng.projectionRereadFor, projectionBillingIndex: w.eng.projectionBillingIndex, lastMemberReadAt: (id) => (id === dueId ? T4 - DUE_AGO : T4),
      usage: { refreshViaCliPanel: async (k) => { refreshed.push(k); return false; } }, onMemberReadingFresh() { }, dataDir: path.join(w.root, 'loop'), log() { }, warn() { },
      // B-574d: the pacing state goes through the store writer — its OWN main-thread cost (a first touch's temp sweep) is the writer's census's
      // (test-store-writer), not this tick's reads of the mount: a stand-in that lands at once keeps the count the PICK's
      storeWriter: { dirty() { }, durable() { return Promise.resolve(true); } },
      now: () => T4, rand: () => 0.5,   // B-403e: what §3 hands the tick — a count no clock or die can move
    });
    // B-360d: the folders' sign-in facts read and their push sent BEFORE the measured tick — the tick then confirms nothing new and
    // its count is its own (a push landing inside the tick's await added a list's own reads to one shape's count, one zone only).
    // THE REVERTED COPY'S MOVING COUNTS (37180 / 35751, the DUE tick 9843 / 4565 — round wldn7whag's (13)), the cause READ: this
    // world's store makes its OWN one-worker file door, and its settle SENT every folder's calls at once; a SafeFs call's deadline
    // starts when it is sent (src/safe-fs.js _send), so on a loaded machine the last ones in the worker's queue ended «timed out»
    // — those rows unreadable, the tick deciding nothing for them: fewer calls, more often in the longer reverted worlds. The
    // product's cure is the keeper's own (it reads at most two folders at a time); the reader's other candidate (a push or the
    // group memo landing inside the counting window) is closed by this settle + wait. The reverted copy stays judged by its bounds.
    await w.am.signinFactsSettled(); await new Promise((r) => setTimeout(r, 150));
    calls = 0; gap = 0; last = performance.now();
    const t0 = performance.now(); const p = loop.tick(); syncMs = performance.now() - t0;
    await p;
    counting = false;   // the 5 ms below is the loop-gap probe's, never the count's
    await new Promise((r) => setTimeout(r, 5));
  } finally { clearInterval(probe); for (const k of FS_CALLS) fs[k] = orig[k]; }
  return { calls, syncMs: Math.round(syncMs), gap: Math.round(gap), refreshed: refreshed.map((k) => (k === dueId ? 'the due member' : k)) };
}
{
  const base = await measureTick({ members: 13, pooled: 25 });
  const twoS = await measureTick({ members: 13, pooled: 50 });
  const twoM = await measureTick({ members: 26, pooled: 25 });
  const preBase = await measureTick({ members: 13, pooled: 25 }, { pre: true });
  const preTwoM = await measureTick({ members: 26, pooled: 25 }, { pre: true });
  console.log(`    fs calls per tick — fixed: ${base.calls} (×2 conversations ${twoS.calls}, ×2 members ${twoM.calls}); reverted: ${preBase.calls} (×2 members ${preTwoM.calls})`);
  // B-403e: EXACT — the tick's own work with the clock and rand fixed, the memo off, path-named asks: one number per shape
  // (measured alone on the test machine, both zones: 395 / 520 / 625; reverted 11073 / 41500 — B-360d, lane chrome-157: 231 / 356 / 305; B-360d part 3 U3, lane lg-group-parents: 219 / 344 / 280 — the usage folder's list and reads left the tick, it reads the kept reply;
  // reverted 9843 / 37180 on 3c00329ba, both zones: the tick reads the DECISION road's rows, which open no sign-in file on the loop)
  ok(`§4 WORK: production's shape (13 members, 25 pooled conversations) costs ${base.calls} synchronous fs calls a tick — exactly 219 (the release's bound 600; the reverted tick: ${preBase.calls})`, base.calls === 219, String(base.calls));
  ok(`§4 WORK: ×2 conversations ⇒ ×${(twoS.calls / base.calls).toFixed(2)}, ×2 members ⇒ ×${(twoM.calls / base.calls).toFixed(2)} — linear in each, never the product (bound 2.2)`, twoS.calls / base.calls <= 2.2 && twoM.calls / base.calls <= 2.2 && twoS.calls === 344 && twoM.calls === 280, `${twoS.calls}/${twoM.calls} vs ${base.calls} (exactly 344 / 280)`);
  ok(`§4 WORK control: the reverted tick reads RED — ${preBase.calls} calls (≥ 10× the fixed ${base.calls}), ×2 members ⇒ ×${(preTwoM.calls / preBase.calls).toFixed(2)} (members × accounts × conversations)`, preBase.calls >= 10 * base.calls && preTwoM.calls >= 10 * twoM.calls && preTwoM.calls / preBase.calls > 2, `${preBase.calls} / ${preTwoM.calls} (B-360d: the REVERTED copy is judged by its bounds — its counts moved between runs since the tick awaits its sign-in facts first (×2 members 37180 / 35751, the DUE tick 9843 / 4565; the cause not read); the FIXED tick's counts stay exact)`);
  // B-403e follow-up (6): THE DUE TICK on BOTH sides — one member's refresh due: each tick picks it and asks its refresh ONCE
  // (a stand-in that says no) — the pick RAN on both sides, and it asks the mount nothing more than the steady tick (equal counts)
  const due = await measureTick({ members: 13, pooled: 25 }, { due: true });
  const preDue = await measureTick({ members: 13, pooled: 25 }, { due: true, pre: true });
  console.log(`    the DUE tick (one member's refresh due) — fixed: ${due.calls} calls, asked ${JSON.stringify(due.refreshed)}; reverted: ${preDue.calls} calls, asked ${JSON.stringify(preDue.refreshed)}`);
  ok(`§4 DUE: one member's refresh due — BOTH ticks pick it and ask its refresh once (fixed ${JSON.stringify(due.refreshed)}, reverted ${JSON.stringify(preDue.refreshed)}); the fixed tick costs ${due.calls} calls — exactly 219, the steady tick's: the pick asks the mount NOTHING more (its work is the attempt saved before the spawn, a write, and the refresh itself) — the reverted ${preDue.calls}, ≥ 10× the fixed tick (the reverted copy by its bounds — B-360d)`, JSON.stringify(due.refreshed) === '["the due member"]' && JSON.stringify(preDue.refreshed) === '["the due member"]' && JSON.stringify(base.refreshed) === '[]' && due.calls === 219 && due.calls === base.calls && preDue.calls >= 10 * due.calls, JSON.stringify({ due, preDue }));
  const slow = await measureTick({ members: 13, pooled: 25 }, { slowUs: 150 });
  const preSlow = await measureTick({ members: 13, pooled: 25 }, { slowUs: 150, pre: true });
  console.log(`    150 µs per fs call — fixed: sync ${slow.syncMs} ms, longest loop gap ${slow.gap} ms; reverted: sync ${preSlow.syncMs} ms, gap ${preSlow.gap} ms`);
  // RELATIVE, never a wall-clock literal (lane mirror-flake-hardening: `< 250` judged the machine — the busy-waited
  // 150 µs per call and the tick's own work scale together on a slower runner): the fixed tick holds the loop at most a
  // fifth of what the reverted tick holds it in this same run (measured 79 vs 1768 ms here, 22 ×; the WORK census above
  // is the absolute half — calls, not milliseconds)
  // B-360d: the tick's FIRST step awaits the sign-in facts' confirmation (off the loop), so its synchronous work runs after that
  // await — the segment before it is ~0 ms on both copies and judges nothing; the loop's LONGEST GAP is the hold, on both
  ok(`§4 LOOP: every fs call 150 µs (the NFS-backed data dir) — the tick holds the loop at most ${slow.gap} ms (its longest gap): ≤ 1/5 of the reverted tick in this run (${preSlow.gap} ms)`, slow.gap * 5 <= preSlow.gap, JSON.stringify({ slow, preSlow }));
  ok(`§4 LOOP control: the reverted tick holds it ${preSlow.gap} ms (> 1 s — production's stall, scaled)`, preSlow.gap > 1000, JSON.stringify(preSlow));
}

// ── §5 the walker's account lookup: the record, the same fields list() carried ──
console.log('§5 resolveAccount reads the record, not list()');
{
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  // the resolver's FIRST line may carry its «held» answer (r3060 Q1: the one existing line changed, none added) — kept in the body
  const m0 = srv.match(/  resolveAccount: \(id\) => \{([^\n]*)\n([\s\S]*?)\n  \},\n\}\);/), m = m0 && [m0[0], (m0[1].trim() ? m0[1] + '\n' : '') + m0[2]];
  ok('§5 WIRING: server.js hands UsageHistory a resolveAccount that never calls accounts.list()', !!m && !/accounts\.list\(/.test(m[1]) && verdictOf(/accounts\.get\(id\)/.test(m[1])), m && m[1]);
  const resolveNew = m && new Function('accounts', 'require', `return (id) => {\n${m[1]}\n};`); // dc-ws-create: the ledger type is the descriptor's creds.ledgerType (require'd like server.js does)
  const w = mkWorld({ members: 3, pooled: 0 });
  w.am._state.accounts.push({ id: 'acct-k', name: 'key', type: 'api', tail: 'abcd1234', createdAt: 1 }, { id: 'acct-legacy', name: 'legacy', tail: 'zz' }, { id: 'cxs-1', name: 'codex', type: 'subscription', backend: 'codex', createdAt: 1 }, { id: 'oat-1', name: 'oat', type: 'oat', tail: 'q', createdAt: 1 });
  const resolveOld = (id) => { const a = (w.am.list().accounts || []).find((x) => x.id === id); if (!a) return null; return { type: a.backend === 'codex' ? 'codex-subscription' : a.type, name: a.name }; };   // B-ba7d: neither the list nor the resolver carries a key tail
  const fn = resolveNew && resolveNew(w.am, createRequire(path.join(REPO, 'server.js')));
  // r3197 (lens 3): the SERVER.JS wiring the usage history's wait rests on — its resolver answers «held» over a held store (a fast pin)
  const fnHeld = resolveNew && resolveNew({ held: () => ({ code: 'EIO', at: 1 }), get: () => null, providerRecordOf: () => null }, createRequire(path.join(REPO, 'server.js')));
  ok('§5 held: server.js\'s resolver answers { held: true } while the accounts list is unread (the history\'s walk waits on it)', !!fnHeld && !!(fnHeld('acct-k') || {}).held);
  const probes = [...w.ids, w.P, 'acct-k', 'acct-legacy', 'cxs-1', 'oat-1', 'nope', null];
  const bad = probes.filter((id) => !isDeepStrictEqual(settle(() => fn(id)), settle(() => resolveOld(id))));
  ok(`§5 the same {type, name, tail} as the list() row for ${probes.length} ids (subscription, pool, API key, legacy, codex, oat, unknown)`, !!fn && !bad.length, bad.map((id) => `${id}: ${JSON.stringify(settle(() => fn(id)))} vs ${JSON.stringify(settle(() => resolveOld(id)))}`).join(' | '));
  let reads = 0; const o = fs.readFileSync; fs.readFileSync = function (...a) { reads++; return o.apply(this, a); };
  try { for (let i = 0; i < 100; i++) fn(w.ids[i % 3]); } finally { fs.readFileSync = o; }
  ok(`§5 100 ledger lines resolve with ${reads} file reads (list() read every login per line)`, reads === 0, String(reads));
}

// ── §6 r3136 (主开发 r3146 (5)): THE AUTO USAGE CHECK asks no vendor probe for an account whose usage file's read FAILS — its
// answer could not be written (the write is refused): fewer vendor calls, never more. A file NOT THERE («never read») is probed
// as before (the bootstrap). Made-up accounts; the failed read is a PLACED refusal of that one read call (EIO), undone by the leg.
console.log('§6 r3136: no probe for an account whose usage file cannot be read; «never read» and a stale file are probed as before');
{
  // as §4's due tick: the world stamped from the loop's own instant, X's reading and its last read three hours old, the folder's kept
  // reply refreshed after each write straight into it (else the identity group's kept copy of X's reading stands in for the file)
  const w = mkWorld({ members: 4, pooled: 0, hot: true, at: T });
  const X = w.ids[0], fX = path.join(w.cacheDir, X + '.json'), nowS = Math.floor(T / 1000), AGO = 3 * 3600e3;
  fs.writeFileSync(fX, JSON.stringify({ fetchedAt: T - AGO, source: 'cli-usage', fiveHour: { utilization: 0.2, resetsAt: nowS + 4 * 3600 }, sevenDay: { utilization: 0.3, resetsAt: nowS + 3 * 86400 } }));
  const refreshFolder = async () => { if (w.eng.usageFolder) await w.eng.usageFolder.refresh(); };
  await refreshFolder();
  const tickOnce = async (tag) => {
    const spent = [];
    const loop = createAutoCliLoop({
      serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined), accounts: w.am, autoCliReady: () => true,
      USAGE_CACHE_DIR: w.cacheDir, usageIdentityGroupsCached: () => w.eng.usageIdentityGroupsCached(), usageEstimator: { estimateFor: () => null },
      projectionRereadFor: (id, now, idx) => w.eng.projectionRereadFor(id, now, idx), projectionBillingIndex: w.eng.projectionBillingIndex, lastMemberReadAt: (id) => (id === X ? T - AGO : T),
      usage: { refreshViaCliPanel: async (k) => { spent.push(k); return false; } },
      onMemberReadingFresh() { }, dataDir: path.join(w.root, 'loop-r3136-' + tag), now: () => T, rand: () => 0.5, log() { }, warn() { },
    });
    await loop.tick();
    return spent;
  };
  await w.am.signinFactsSettled(); await new Promise((r) => setTimeout(r, 150));   // as §4: a sign-in row not confirmed decides nothing
  const stale = await tickOnce('stale');
  const realRead = fs.readFileSync;
  fs.readFileSync = function (p0, ...a) { if (typeof p0 === 'string' && path.resolve(p0) === path.resolve(fX)) throw Object.assign(new Error('a placed refusal'), { code: 'EIO' }); return realRead.call(this, p0, ...a); };
  let refused = null;
  try { refused = await tickOnce('refused'); } finally { fs.readFileSync = realRead; }
  fs.writeFileSync(fX, '{"fiveHour":{"utilization":0.2,"resets');   // r3285 (8): TORN BYTES — the ordinary first read (its write starts the file again)
  await refreshFolder();
  const torn = await tickOnce('torn');
  fs.rmSync(fX, { force: true });
  await refreshFolder();
  const never = await tickOnce('never');
  ok('§6 r3136: a stale reading is probed; the SAME account whose usage file\'s read fails is NOT probed (its answer could not be written); a file not there («never read») is probed as before',
    gateOf(stale.includes(X)) && !!refused && !refused.includes(X) && verdictOf(never.includes(X)), JSON.stringify({ stale: stale.length, staleX: stale.includes(X), refusedX: refused && refused.includes(X), neverX: never.includes(X) }));
  ok('§6 r3285: TORN BYTES are probed as a first read (the probe\'s write keeps them aside and starts the file again) — never left unread for good',
    verdictOf(torn.includes(X)), JSON.stringify({ tornX: torn.includes(X) }));
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
