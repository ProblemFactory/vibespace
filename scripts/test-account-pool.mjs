// Pooled pseudo-account (B-6217) — store-level e2e against a throwaway data dir.
// Guards the invariants the design rests on: the pool dir is ALWAYS a symlink,
// re-pointing is atomic and visible, spawn resolution follows it, deleting a
// pool never touches a real account's credentials, and refresh writes made
// through the pool land in the canonical account dir.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccountManager } = require(path.resolve('src/accounts.js'));

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pool-'));
let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

const am = new AccountManager({ dataDir: DATA });
const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'),
  JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });

const A = am.createSubscription({ name: 'Acct A' }).id; login(A);
const B = am.createSubscription({ name: 'Acct B' }).id; login(B);
const C = am.createSubscription({ name: 'Never logged in' }).id; // deliberately no creds

if (!am.poolSupported()) { console.log('SKIP — pooled accounts are unsupported on ' + process.platform); process.exit(0); }

const { id: P } = am.createPool({ name: 'Pool' });
ck('pool dir is a SYMLINK, never a real directory', fs.lstatSync(am.subDir(P)).isSymbolicLink());
ck('pool resolves to a logged-in member', [A, B].includes(am.poolCurrent(P)));
ck('member options exclude the never-logged-in account', !am.poolMembers(P).some((m) => m.id === C));

am.setPoolTarget(P, A);
ck('spawn env points at the POOL dir (so a re-point moves it)', am.resolveForSpawn(P).localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR === am.subDir(P));
ck('resolveForSpawn reports the real target', am.resolveForSpawn(P).poolTarget === A);
ck('identity reads through the symlink', am.readSubCreds(P).loggedIn === true);

// a credential refresh performed BY THE CLI through the pool path
const credThroughPool = path.join(am.subDir(P), '.credentials.json');
const tmp = credThroughPool + '.tmp';
fs.writeFileSync(tmp, JSON.stringify({ claudeAiOauth: { accessToken: 'rotated', refreshToken: 'r2', expiresAt: Date.now() + 36e5 } }));
fs.renameSync(tmp, credThroughPool);
ck('atomicWrite through the pool keeps it a symlink', fs.lstatSync(am.subDir(P)).isSymbolicLink());
ck('the refresh landed in the CANONICAL account dir', JSON.parse(fs.readFileSync(am.subCredsPath(A), 'utf-8')).claudeAiOauth.accessToken === 'rotated');

am.setPoolTarget(P, B);
ck('re-point switches the target', am.poolCurrent(P) === B);
ck('the same spawn path now resolves to B', fs.realpathSync(am.subDir(P)) === fs.realpathSync(am.subDir(B)));
ck('account A is untouched by the swap', JSON.parse(fs.readFileSync(am.subCredsPath(A), 'utf-8')).claudeAiOauth.accessToken === 'rotated');

// dropping the current target from the member list must re-point, not strand
am.updatePool(P, { members: [A] });
ck('narrowing members away from the target re-points to a valid member', am.poolCurrent(P) === A);
am.updatePool(P, { auto: true, hot: true });
const shown = am.list().accounts.find((x) => x.id === P);
ck('list() exposes pool state (current/members/auto/hot)', shown.pooled && shown.current === A && shown.auto && shown.hot && !!shown.currentName);

// a real dir must never be replaced by a pool symlink
fs.unlinkSync(am.subDir(P)); fs.mkdirSync(am.subDir(P));
let refused = false; try { am.setPoolTarget(P, B); } catch { refused = true; }
ck('refuses to replace a REAL directory with the pool symlink', refused);
fs.rmSync(am.subDir(P), { recursive: true, force: true }); fs.symlinkSync(am.subDir(A), am.subDir(P));

am.remove(P);
ck('removing the pool leaves the real account dir intact', fs.existsSync(am.subCredsPath(A)));
ck('removing the pool removes the symlink', !fs.existsSync(am.subDir(P)));

// ── Plan C: per-session links (2.315.0) ──────────────────────────────────────
var P2X; P2X = am.createPool({ name: 'P2' }).id; // the earlier block removed its pool
{
  const K1 = 'sess-100-1', K2 = 'sess-101-2';
  // session link created + readable; poolCurrentFor prefers it over the default
  const link = am.ensureSessionPoolLink(P2X, K1, B);
  ck('per-session link points at the chosen member', fs.readlinkSync(link) === am.subDir(B));
  ck('poolCurrentFor(session) = its own target', am.poolCurrentFor(P2X, K1) === B);
  ck('poolCurrentFor(other session) falls back to the default', am.poolCurrentFor(P2X, K2) === am.poolCurrent(P2X));
  // spawn with a sessionKey resolves to the per-session link, chooser wins
  const r = am.resolveForSpawn(P2X, 'claude', { sessionKey: K2, chooseMember: () => B });
  ck('sessionKey spawn env = the per-session link path', r.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR === am.sessionPoolLinkPath(P2X, K2));
  ck('sessionKey spawn reports the chosen member', r.poolTarget === B && r.sessionLink === true);
  ck('legacy spawn (no sessionKey) unchanged: pool default dir', am.resolveForSpawn(P2X, 'claude').localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR === am.subDir(P2X));
  // credential invariant: BOTH links resolve to the same real dir = same lock
  ck('two links to one member resolve to ONE real dir (single refresh lock)',
    fs.realpathSync(am.sessionPoolLinkPath(P2X, K1)) === fs.realpathSync(am.sessionPoolLinkPath(P2X, K2)));
  // re-point one session; the other must not move
  am.ensureSessionPoolLink(P2X, K1, A);
  ck('re-pointing one session leaves the other alone', am.poolCurrentFor(P2X, K1) === A && am.poolCurrentFor(P2X, K2) === B);
  ck('sessionPoolLinks lists both', am.sessionPoolLinks(P2X).length === 2);
  // sweep: only dead sessions' links drop
  const dropped = am.sweepSessionPoolLinks(new Set([K1]));
  ck('sweep unlinks only the dead session', dropped === 1 && am.sessionPoolLinks(P2X).length === 1 && am.poolCurrentFor(P2X, K1) === A);
  am.dropSessionPoolLink(P2X, K1);
  ck('dropSessionPoolLink removes it; fallback returns', am.poolCurrentFor(P2X, K1) === am.poolCurrent(P2X));
  // ── manual hot-switch sweeps live links (2.355.0, userW's inc-msz495u6:
  // plan C demoted the manual target change to new-sessions-only — the
  // default moved while every live session's link stayed on the old member)
  am.ensureSessionPoolLink(P2X, K1, A);
  am.ensureSessionPoolLink(P2X, K2, A);
  const sw = am.setPoolTarget(P2X, B, { sweepSessionLinks: true });
  ck('manual sweep repoints EVERY live session link', sw.swept === 2 && am.poolCurrentFor(P2X, K1) === B && am.poolCurrentFor(P2X, K2) === B);
  // the ENGINE path (no option) must keep per-session projections intact
  am.ensureSessionPoolLink(P2X, K1, A);
  am.setPoolTarget(P2X, B);
  ck('engine setPoolTarget never sweeps (projections survive)', am.poolCurrentFor(P2X, K1) === A);
  // remove(pool) clears the links dir but NEVER a member's real dir
  am.ensureSessionPoolLink(P2X, K1, B);
  am.remove(P2X);
  ck('pool removal clears links dir, member dirs intact',
    !fs.existsSync(am.poolLinksDir(P2X)) && fs.existsSync(am.subDir(A)) && fs.existsSync(am.subDir(B)));
}
// ── the removed-member wall (2026-09-28): membership is the CONFIGURED list, and
// the default re-point is the ENGINE's decision (list[0] only without one) ──
{
  const D2 = am.createSubscription({ name: 'Acct D' }).id; login(D2);
  const P3 = am.createPool({ name: 'P3' }).id;
  ck('poolMembership: an implicit pool lists EVERY same-backend subscription, signed in or not (C never finished its login)',
    [A, B, C, D2].every((x) => am.poolMembership(P3).includes(x)));
  am.updatePool(P3, { members: [A, B, C] });
  ck('poolMembership: an explicit pool lists exactly its members — a signed-out one included (its wall is the login, not the membership)',
    JSON.stringify(am.poolMembership(P3).sort()) === JSON.stringify([A, B, C].sort()));
  ck('…while poolMembers (the CANDIDATE list) stays logged-in only', !am.poolMembers(P3).some((m) => m.id === C));
  am.setPoolTarget(P3, A);
  let asked = null;
  am.updatePool(P3, { members: [B, D2] }, { chooseMember: (from, list) => { asked = { from, list: list.map((m) => m.id) }; return D2; } });
  ck('updatePool: dropping the default asks the chooser FROM the removed member, over the new candidates', asked && asked.from === A && JSON.stringify(asked.list) === JSON.stringify([B, D2]));
  ck('updatePool: …and re-points to the chooser\'s decision (D), not list[0] (B)', am.poolCurrent(P3) === D2);
  ck('updatePool: …recorded on the slot ledger as removed-from-pool', am.slotTransitions.all().some((r) => !r.sessionId && r.poolId === P3 && r.from === A && r.to === D2 && r.why === 'removed-from-pool'));
  am.setPoolTarget(P3, B);
  am.updatePool(P3, { members: [A, D2] }, { chooseMember: () => 'sub-not-a-member' });
  ck('updatePool: a chooser answer outside the list is refused — the no-engine fallback (list[0]) stands', am.poolCurrent(P3) === A);
  am.setPoolTarget(P3, A);
  am.updatePool(P3, { members: [D2, A] });
  ck('updatePool: a save that keeps the default re-points nothing (the chooser is not even asked)', am.poolCurrent(P3) === A);
  // ── manual priority (2026-09-28): validated, deduped, capped, pruned; auto is always true ──
  am.updatePool(P3, { members: [A, B, C, D2] });
  const P4 = am.createPool({ name: 'P4' }).id;
  ck('createPool: a new pool is AUTOMATIC (the whole-pool manual switch is retired) with an empty priority', am.get(P4).auto === true && JSON.stringify(am.get(P4).priority) === '[]');
  am.updatePool(P3, { priority: [B, A, B, C] });
  ck('priority: saved in order, deduped (a signed-out member may be listed — it is a member)', JSON.stringify(am.get(P3).priority) === JSON.stringify([B, A, C]));
  let bad = null; try { am.updatePool(P3, { priority: [A, 'sub-stranger'] }); } catch (e) { bad = e.message; }
  ck('priority: a non-member id is refused by name — and nothing is saved', /not a member of this pool: sub-stranger/.test(bad || '') && JSON.stringify(am.get(P3).priority) === JSON.stringify([B, A, C]));
  let bad2 = null; try { am.updatePool(P3, { priority: 'A' }); } catch (e) { bad2 = e.message; }
  ck('priority: a non-list is refused', /priority must be a list/.test(bad2 || ''));
  am.updatePool(P3, { members: [A, C, D2] });
  ck('priority: narrowing the membership prunes the order (B is gone from it)', JSON.stringify(am.get(P3).priority) === JSON.stringify([A, C]));
  am.updatePool(P3, { auto: false });
  ck('auto:false is IGNORED — the pool stays automatic-or-priority', am.get(P3).auto === true);
  const row = am.list().accounts.find((x) => x.id === P3);
  ck('list(): the pool row carries priority + placement (and auto:true for old clients)', row.placement === 'priority' && JSON.stringify(row.priority) === JSON.stringify([A, C]) && row.auto === true);
  am.updatePool(P3, { priority: [] });
  ck('priority: [] clears it — Placement = automatic', am.list().accounts.find((x) => x.id === P3).placement === 'automatic');
  am.get(P4).auto = false; am.get(P4).priority = undefined; am.setPoolTarget(P4, B);
  const mig = am.migrateManualPools();
  ck('migrateManualPools: a manual pool gets [its current target, …the rest in list order] and becomes auto', mig.length === 1 && mig[0].id === P4 && am.get(P4).priority[0] === B && am.get(P4).auto === true && am.poolCurrent(P4) === B);
  am.remove(P4);
  am.remove(P3); am.remove(D2);
}
// family projection (model-family.js)
{
  const { familyOfModel, projectCacheForFamily } = require(path.resolve('src/model-family.js'));
  ck('familyOfModel maps ids and bucket names alike', familyOfModel('claude-fable-5') === 'fable' && familyOfModel('Opus') === 'opus' && familyOfModel('weird-model') === null);
  const cache = { fiveHour: { utilization: 0.1 }, sevenDay: { utilization: 0.4 }, scopedWeekly: [{ name: 'Fable', utilization: 1 }, { name: 'Opus', utilization: 0.2 }, { name: 'Mystery', utilization: 0.9 }] };
  const proj = projectCacheForFamily(cache, 'opus');
  ck('projection drops OTHER known families, keeps own + unknown + 5h/7d',
    proj.scopedWeekly.length === 2 && proj.scopedWeekly.some((b) => b.name === 'Opus') && proj.scopedWeekly.some((b) => b.name === 'Mystery') && !!proj.fiveHour && !!proj.sevenDay);
  ck('null family = no projection (conservative)', projectCacheForFamily(cache, null).scopedWeekly.length === 3);
  ck('projection hands back the caps it set aside as `spareScoped` (B-8a65: view-only, the pool orders on it) — the cache itself is untouched',
    proj.spareScoped.length === 1 && proj.spareScoped[0].name === 'Fable' && !('spareScoped' in cache));
  ck('…a view with nothing to set aside carries an EMPTY spare list; a null family is the cache object itself',
    projectCacheForFamily({ ...cache, scopedWeekly: [cache.scopedWeekly[0], cache.scopedWeekly[2]] }, 'fable').spareScoped.length === 0 && projectCacheForFamily(cache, null) === cache);
}
fs.rmSync(DATA, { recursive: true, force: true });

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
