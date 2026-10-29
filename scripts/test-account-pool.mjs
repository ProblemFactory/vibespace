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
// THE TOKEN SLOT (lane pool-oat-materialize, q-035 A): a member with no usable login whose long-lived token was
// materialized into its folder is placed like any member — the pool dir re-points onto it and reads its token file
{
  const amT = new AccountManager({ dataDir: path.join(DATA, 'tok') });
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const X = amT.createSubscription({ name: 'Login X' }).id;
  fs.writeFileSync(path.join(amT.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
  const T = amT.createSubscription({ name: 'Token T' }).id; // a WIPED login (the CLI blanked its tokens, kept the shape)
  fs.writeFileSync(path.join(amT.subDir(T), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
  const tok = ['sk', '-ant-oat01-'].join('') + 'POOLfake_' + 'z'.repeat(40);
  const PT = amT.createPool({ name: 'Tok pool' }).id;
  amT.setOat(T, tok); // no CLI version known: the gate is shut
  await amT.oatFileSettled(); // the file act runs on the store's queue, off the loop's back (verify r1 F13)
  ck('token slot: gate shut (no measured CLI) ⇒ the member stays out of the pool (today\'s escape)', !amT.poolMembers(PT).some((m) => m.id === T));
  amT.noteCliVersion('2.1.296 (Claude Code)');
  await amT.oatFileSettled();
  ck('token slot: the measured CLI ⇒ the token is in its folder and it is a pool candidate', amT.readSubCreds(T).oatFile === true && amT.poolMembers(PT).some((m) => m.id === T));
  amT.setPoolTarget(PT, T);
  ck('token slot: the pool dir re-points onto it and resolves through to its token file (no login in it)', amT.poolCurrent(PT) === T && amT.readSubCreds(PT).oatFile === true && amT.resolveForSpawn(PT).poolTarget === T);
  amT.setPoolTarget(PT, X);
  ck('token slot: …and back onto the login member — the ordinary re-point both ways', amT.poolCurrent(PT) === X && !amT.readSubCreds(PT).oatFile && amT.readSubCreds(PT).loggedIn);
  // verify r1 F5: the hub's CLI moves to a KNOWN unmeasured version while a conversation's link names T
  const lk = amT.ensureSessionPoolLink(PT, 'sess-7-1791900000000', T, { why: 'spawn' });
  amT.noteCliVersion('2.1.300 (Claude Code)');
  await amT.oatFileSettled();
  ck('token slot (F5): an unmeasured CLI ⇒ T is no candidate for a NEW placement (poolMembers / isPoolMember agree) …', !amT.poolMembers(PT).some((m) => m.id === T) && !amT.isPoolMember(PT, T) && amT.resolveForSpawn(PT, 'claude', { sessionKey: 'sess-8-1791900000000' }).poolTarget === X);
  ck('…while the conversation linked to it keeps its token file (the running process is the measured binary)', fs.existsSync(path.join(lk, '.credentials.json')) && amT.readSubCreds(T).oatFile === true);
  amT.dropSessionPoolLink(PT, 'sess-7-1791900000000'); amT.dropSessionPoolLink(PT, 'sess-8-1791900000000');
  await amT.syncOatFiles();
  // lane pool-silent-members R1 (inc-mvsjhna7): a CLI update never shrinks a pool in silence — the file STAYS, and the
  // pool's roster names T with the store's reason (90c995a3 took it back here and T read «not logged in»)
  ck('…and the last link gone, the next sweep KEEPS the file (R1: never taken back for a version reason)', fs.existsSync(path.join(amT.subDir(T), '.credentials.json')) && amT.readSubCreds(T).oatFile === true);
  const rosT = amT.poolRoster(PT);
  ck('…T is no candidate, but the pool\'s ROSTER lists every member: X placeable, T unplaceable WITH its reason (cli-unmeasured · CLI 2.1.300 · its file there)', JSON.stringify(rosT.map((r) => [r.name, r.placeable])) === JSON.stringify([['Login X', true], ['Token T', false]]) && rosT[1].why.code === 'cli-unmeasured' && rosT[1].why.cli === '2.1.300' && rosT[1].why.file === true, JSON.stringify(rosT));
  ck('…poolRoster and poolMembership name the same members, in the same order (the roster is the membership, never the candidate list)', JSON.stringify(rosT.map((r) => r.id)) === JSON.stringify(amT.poolMembership(PT)));
  // lane oat-in-file-2-1-306: 2.1.306 is measured too (2026-10-21, the verdicts 2.1.296 has) ⇒ no escape on it
  amT.noteCliVersion('2.1.306 (Claude Code)');
  await amT.oatFileSettled();
  ck('token slot: the hub moves on to 2.1.306 (measured) ⇒ the token is back in T\'s folder and T is a pool candidate again — not escaped', amT.readSubCreds(T).oatFile === true && amT.poolMembers(PT).some((m) => m.id === T) && amT.isPoolMember(PT, T));
  amT.setPoolTarget(PT, T);
  ck('…the pool dir re-points onto it and resolves through to its token file, as on 2.1.296', amT.poolCurrent(PT) === T && amT.readSubCreds(PT).oatFile === true && amT.resolveForSpawn(PT).poolTarget === T);
  // lane cli-2-1-307-records: the hub's CLI AUTO-UPDATED to 2.1.307 (measured 2026-10-22, the verdicts 2.1.306 has) ⇒ still no escape
  amT.noteCliVersion('2.1.307 (Claude Code)');
  await amT.oatFileSettled();
  ck('token slot: the hub auto-updates to 2.1.307 (measured) ⇒ T keeps its token file and stays a pool candidate, the pool dir still resolving through to it — not escaped', amT.readSubCreds(T).oatFile === true && amT.poolMembers(PT).some((m) => m.id === T) && amT.isPoolMember(PT, T) && amT.poolCurrent(PT) === T && amT.readSubCreds(PT).oatFile === true && amT.resolveForSpawn(PT).poolTarget === T);
  // lane cli-2-1-308-records: the hub's CLI AUTO-UPDATED again, to 2.1.308 (measured 2026-10-22, the verdicts 2.1.307 has) ⇒ still no escape
  amT.noteCliVersion('2.1.308 (Claude Code)');
  await amT.oatFileSettled();
  ck('token slot: the hub auto-updates to 2.1.308 (measured) ⇒ T keeps its token file and stays a pool candidate, the pool dir still resolving through to it — not escaped', amT.readSubCreds(T).oatFile === true && amT.poolMembers(PT).some((m) => m.id === T) && amT.isPoolMember(PT, T) && amT.poolCurrent(PT) === T && amT.readSubCreds(PT).oatFile === true && amT.resolveForSpawn(PT).poolTarget === T);
}
{
  // RED CONTROL (lane oat-in-file-2-1-306, the base): over the one-version fixture (2.1.296 only) the same member on 2.1.306 is escaped
  const FX = JSON.parse(fs.readFileSync(path.resolve('scripts/fixtures/oat-in-file.json'), 'utf8'));
  const one = path.join(DATA, 'fx-2.1.296-only.json'); fs.writeFileSync(one, JSON.stringify(FX.versions['2.1.296']));
  const amB = new AccountManager({ dataDir: path.join(DATA, 'tok-base'), oatFixture: one });
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const X = amB.createSubscription({ name: 'Login X' }).id;
  fs.writeFileSync(path.join(amB.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
  const T = amB.createSubscription({ name: 'Token T' }).id;
  fs.writeFileSync(path.join(amB.subDir(T), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
  const PB = amB.createPool({ name: 'Tok pool' }).id;
  amB.setOat(T, ['sk', '-ant-oat01-'].join('') + 'POOLfake_' + 'y'.repeat(40));
  amB.noteCliVersion('2.1.306 (Claude Code)');
  await amB.oatFileSettled();
  ck('RED CONTROL (the base): over the one-version fixture (2.1.296 only) the same oat-only member on 2.1.306 stays out of the pool and its folder holds no token (today\'s escape)', !amB.poolMembers(PB).some((m) => m.id === T) && !amB.isPoolMember(PB, T) && amB.readSubCreds(T).oatFile !== true && amB.poolMembers(PB).some((m) => m.id === X));
}
{
  // RED CONTROL (lane cli-2-1-307-records, the .340 base): over the two-version fixture (2.1.296 + 2.1.306) the same member on 2.1.307 is escaped
  const FX = JSON.parse(fs.readFileSync(path.resolve('scripts/fixtures/oat-in-file.json'), 'utf8'));
  const { '2.1.307': _measured307, '2.1.308': _measured308, '2.1.312': _m312a, ...two } = FX.versions;
  const twoF = path.join(DATA, 'fx-2.1.296-2.1.306.json'); fs.writeFileSync(twoF, JSON.stringify({ versions: two }));
  const amB = new AccountManager({ dataDir: path.join(DATA, 'tok-base-307'), oatFixture: twoF });
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const X = amB.createSubscription({ name: 'Login X' }).id;
  fs.writeFileSync(path.join(amB.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
  const T = amB.createSubscription({ name: 'Token T' }).id;
  fs.writeFileSync(path.join(amB.subDir(T), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
  const PB = amB.createPool({ name: 'Tok pool' }).id;
  amB.setOat(T, ['sk', '-ant-oat01-'].join('') + 'POOLfake_' + 'w'.repeat(40));
  amB.noteCliVersion('2.1.307 (Claude Code)');
  await amB.oatFileSettled();
  ck('RED CONTROL (the .340 base): over the two-version fixture (2.1.296 + 2.1.306) the same oat-only member on 2.1.307 stays out of the pool and its folder holds no token — the escape the hub\'s auto-update brought', !!_measured307 && Object.keys(two).join() === '2.1.296,2.1.306' && !amB.poolMembers(PB).some((m) => m.id === T) && !amB.isPoolMember(PB, T) && amB.readSubCreds(T).oatFile !== true && amB.poolMembers(PB).some((m) => m.id === X));
}
{
  // RED CONTROL (lane cli-2-1-308-records, the .341 base): over the three-version fixture (2.1.296 + 2.1.306 + 2.1.307) the same member on 2.1.308 is escaped
  const FX = JSON.parse(fs.readFileSync(path.resolve('scripts/fixtures/oat-in-file.json'), 'utf8'));
  const { '2.1.308': _measured308, '2.1.312': _m312b, ...three } = FX.versions;
  const threeF = path.join(DATA, 'fx-2.1.296-2.1.306-2.1.307.json'); fs.writeFileSync(threeF, JSON.stringify({ versions: three }));
  const amB = new AccountManager({ dataDir: path.join(DATA, 'tok-base-308'), oatFixture: threeF });
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const X = amB.createSubscription({ name: 'Login X' }).id;
  fs.writeFileSync(path.join(amB.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
  const T = amB.createSubscription({ name: 'Token T' }).id;
  fs.writeFileSync(path.join(amB.subDir(T), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
  const PB = amB.createPool({ name: 'Tok pool' }).id;
  amB.setOat(T, ['sk', '-ant-oat01-'].join('') + 'POOLfake_' + 'v'.repeat(40));
  amB.noteCliVersion('2.1.308 (Claude Code)');
  await amB.oatFileSettled();
  ck('RED CONTROL (the .341 base): over the three-version fixture (2.1.296 + 2.1.306 + 2.1.307) the same oat-only member on 2.1.308 stays out of the pool and its folder holds no token — the escape the second auto-update brought', !!_measured308 && Object.keys(three).join() === '2.1.296,2.1.306,2.1.307' && !amB.poolMembers(PB).some((m) => m.id === T) && !amB.isPoolMember(PB, T) && amB.readSubCreds(T).oatFile !== true && amB.poolMembers(PB).some((m) => m.id === X));
}
{
  // lane pool-silent-members R1: 2.1.312 measured 2026-10-28 (the loopback rung) ⇒ no escape on it; over the .360 base's
  // four-version fixture (2.1.296 – 2.1.308) the same member on 2.1.312 is out of the pool — and, since R1, NAMED for it
  const FX = JSON.parse(fs.readFileSync(path.resolve('scripts/fixtures/oat-in-file.json'), 'utf8'));
  const { '2.1.312': measured312, ...four } = FX.versions;
  const run = async (tag, fxPath) => {
    const amB = new AccountManager({ dataDir: path.join(DATA, 'tok-312-' + tag), ...(fxPath ? { oatFixture: fxPath } : {}) });
    const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
    const X = amB.createSubscription({ name: 'Login X' }).id;
    fs.writeFileSync(path.join(amB.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
    const T = amB.createSubscription({ name: 'Token T' }).id;
    fs.writeFileSync(path.join(amB.subDir(T), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
    const PB = amB.createPool({ name: 'Tok pool' }).id;
    amB.setOat(T, ['sk', '-ant-oat01-'].join('') + 'POOLfake_' + 'u'.repeat(40));
    amB.noteCliVersion('2.1.312 (Claude Code)');
    await amB.oatFileSettled();
    const why = amB.poolRoster(PB).find((r) => r.id === T)?.why || null;
    return { cand: amB.poolMembers(PB).some((m) => m.id === T), member: amB.isPoolMember(PB, T), file: amB.readSubCreds(T).oatFile === true, why };
  };
  const now = await run('now', null);
  ck('token slot: the hub auto-updated to 2.1.312 (measured 2026-10-28) ⇒ T\'s token is in its folder and T is a pool candidate — not escaped', now.cand && now.member && now.file && now.why === null, JSON.stringify(now));
  const fourF = path.join(DATA, 'fx-to-2.1.308.json'); fs.writeFileSync(fourF, JSON.stringify({ versions: four }));
  const base = await run('base', fourF);
  ck('RED CONTROL (the .360 base, 90c995a3): over the four-version fixture (2.1.296 – 2.1.308) the same member on 2.1.312 stays out of the pool, its folder holding no token — and the roster NAMES it: no credential file in its folder (CLI 2.1.312 unmeasured)', !!measured312 && Object.keys(four).join() === '2.1.296,2.1.306,2.1.307,2.1.308' && !base.cand && !base.member && !base.file && base.why && base.why.code === 'cli-unmeasured' && base.why.cli === '2.1.312' && base.why.file === false, JSON.stringify(base));
}
{
  // THE ONE ANSWER (R2): _unplaceableWhy is null EXACTLY when _placeable is true — over every shape a member can be in
  const amW = new AccountManager({ dataDir: path.join(DATA, 'why-census') });
  amW.noteCliVersion('2.1.300 (Claude Code)'); // a known unmeasured CLI: the token-file shapes are all refused
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const mk = (name, creds, oat) => { const id = amW.createSubscription({ name }).id; if (creds) fs.writeFileSync(path.join(amW.subDir(id), '.credentials.json'), JSON.stringify(creds), { mode: 0o600 }); if (oat) amW.setOat(id, ['sk', '-ant-oat01-'].join('') + 'WHYfake_' + oat.repeat(40)); return id; };
  const ids = [
    mk('live', { claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }),
    mk('wiped', { claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }),
    mk('nofile', null),
    mk('nofile+oat', null, 'p'),
    mk('wiped+oat', { claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }, 'q'),
    mk('ourfile', { claudeAiOauth: { accessToken: ['sk', '-ant-oat01-'].join('') + 'WHYfake_' + 'r'.repeat(40), expiresAt: Date.now() + 300 * 864e5, ...SH }, vibespaceOat: { v: 1 } }, 'r'),
  ];
  await amW.oatFileSettled();
  const rows = ids.map((id) => ({ name: amW.get(id).name, placeable: amW._placeable('claude', id), why: amW._unplaceableWhy('claude', id) }));
  ck('R2: _unplaceableWhy(id) is null ⇔ _placeable(id) — one answer over a live login, a wiped one, no file, a token with no file, a token over a wiped login, our token file', rows.every((r) => r.placeable === (r.why === null)) && rows[0].placeable === true && rows.slice(1).every((r) => r.why && typeof r.why.code === 'string'), JSON.stringify(rows));
  ck('R2: …each refusal says its own fact (wiped ⇒ logged-out, no file ⇒ no-file, a token with no file on an unmeasured CLI ⇒ cli-unmeasured · file:false)', rows[1].why.code === 'logged-out' && rows[2].why.code === 'no-file' && rows[3].why.code === 'cli-unmeasured' && rows[3].why.file === false && rows[4].why.code === 'cli-unmeasured', JSON.stringify(rows.map((r) => [r.name, r.why && r.why.code])));
}
{
  // (lane pool-silent-members acceptance r2) THE LOCKED VAULT IS THE WALL, NEVER THE LOGIN. The deploy of this very fix
  // restarts the hub and the vault locks: a member whose token file 90c995a3's sweep took away (a valid long-lived token,
  // NO file — the CLI measured now) cannot be re-materialized until the owner unlocks. 9d53db09's roster said
  // «long-lived token only, not written to its folder (key-unreadable) — re-login»: six needless logins.
  const APA = require(path.resolve('src/account-pool-auto.js'));
  const Module = require('node:module');
  const run = async (AM, tag) => {
    const am = new AM({ dataDir: path.join(DATA, 'vault-locked-' + tag) });
    const X = am.createSubscription({ name: 'Login X' }).id;
    fs.writeFileSync(path.join(am.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }), { mode: 0o600 });
    const T = am.createSubscription({ name: 'Token V' }).id;
    const P = am.createPool({ name: 'V pool' }).id;
    am.noteCliVersion('2.1.312 (Claude Code)');
    am.setOat(T, ['sk', '-ant-oat01-'].join('') + 'VAULTfake_' + 'v'.repeat(40));
    await am.oatFileSettled();
    const cf = path.join(am.subDir(T), '.credentials.json');
    fs.rmSync(cf, { force: true }); // the take-back 90c995a3's 2.1.312 sweep made
    // A RESTART before its first sweep: no refusal is known yet for the member — never «re-login»
    const am2 = new AM({ dataDir: path.join(DATA, 'vault-locked-' + tag) });
    const pending = am2.poolRoster(P).find((r) => r.id === T)?.why || null;
    am2._key = () => { throw Object.assign(new Error('the vault is locked'), { code: 'key-unreadable:vault_locked' }); }; // …and the vault locked
    await am2.syncOatFiles();
    const locked = am2.poolRoster(P).find((r) => r.id === T)?.why || null;
    return { pending, locked, file: fs.existsSync(cf) };
  };
  const r = await run(AccountManager, 'now');
  ck('r2 (b): a locked vault (the restart this deploy makes) ⇒ the token-only member\'s roster reason is the VAULT — {code: vault-locked}: «the vault is locked — its long-lived token is kept and written to its folder once it opens (Unlock… at the top of the page; For you names what is waiting on it)»', !!r.locked && r.locked.code === 'vault-locked' && APA.unplaceableText(r.locked) === 'the vault is locked — its long-lived token is kept and written to its folder once it opens (Unlock… at the top of the page; For you names what is waiting on it)' && r.file === false);
  ck('r2 (b): …and before the restarted hub\'s first sweep (no refusal known yet) it reads «not written to its folder yet» — never «re-login»', !!r.pending && r.pending.code === 'oat-not-in-folder' && r.pending.reason === 'pending' && !/re-login/.test(APA.unplaceableText(r.pending)));
  const file = path.resolve('src/accounts.js'), src = fs.readFileSync(file, 'utf8'), cut = "      if (f && f.code === 'vault_locked') return { code: 'vault-locked' };\n";
  ck('RED CONTROL (b): the patch (the vault code dropped — 9d53db09\'s _unplaceableWhy) hits', src.includes(cut));
  if (src.includes(cut)) {
    const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src.replace(cut, ''), file);
    const rc = await run(m.exports.AccountManager, 'mut');
    ck('RED CONTROL (b): without the vault code the same locked vault is told «… (key-unreadable) — re-login» — the wrong remedy', !!rc.locked && rc.locked.code === 'oat-not-in-folder' && /\(key-unreadable\) — re-login$/.test(APA.unplaceableText(rc.locked)));
  }
}
// THE PROVIDER OF A POOL MEMBER (q-053 P0b): every member names its provider (a LABEL — readings stay the slot's); the
// pool's crossProvider setting (never by default, the owner's decision ①) is validated and listed.
{
  const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-poolprov-'));
  const amP = new AccountManager({ dataDir: D2 });
  if (amP.poolSupported()) {
    const CR = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
    const a1 = amP.createSubscription({ name: 'One' }).id, a2 = amP.createSubscription({ name: 'Two' }).id;
    for (const x of [a1, a2]) fs.writeFileSync(path.join(amP.subDir(x), '.credentials.json'), CR(x), { mode: 0o600 });
    const pp = amP.createPool({ name: 'Prov' }).id;
    const ms = amP.poolMembers(pp);
    ck('provider: every member names its provider — a claude subscription = the first-party subscription read off its harness\'s creds row — Claude subscription {id, kind, label}', ms.length === 2 && ms.every((m) => m.provider && m.provider.kind === 'subscription' && m.provider.label === 'Claude subscription' && m.provider.id === 'pv-claude-subscription'));
    ck('provider: with no provider store wired every account answers its harness\'s own subscription — never null for a known account', amP.memberProviderOf(a2).label === 'Claude subscription' && amP.memberProviderOf('nope') === null);
    amP.setProviderLookup((acct) => (acct.id === a2 ? { id: 'pv-other', kind: 'openrouter', label: 'OpenRouter', models: [{ id: 'x/y' }] } : null));
    ck('provider: …with the provider store\'s lookup it is that record (models included — the decisions read them)', amP.memberProviderOf(a2).label === 'OpenRouter' && amP.memberProviderOf(a2).models.length === 1 && amP.poolMembers(pp).find((m) => m.id === a2).provider.label === 'OpenRouter');
    const cur = amP.poolCurrentFor(pp, null, { withProvider: true });
    ck('provider: poolCurrentFor answers {memberId, provider} on ask; its plain answer is the id as before', cur && cur.memberId === amP.poolCurrent(pp) && cur.provider.label && amP.poolCurrentFor(pp, null) === amP.poolCurrent(pp));
    const row0 = amP.list().accounts.find((x) => x.id === pp);
    ck('provider: a pool lists crossProvider "never" by default (the owner\'s decision ①) and the current member\'s provider', row0.crossProvider === 'never' && row0.currentProvider && row0.currentProvider.kind);
    amP.updatePool(pp, { crossProvider: 'allow' });
    ck('provider: updatePool sets it (allow) and the list says so', amP.list().accounts.find((x) => x.id === pp).crossProvider === 'allow' && amP.get(pp).crossProvider === 'allow');
    let err = null; try { amP.updatePool(pp, { crossProvider: true }); } catch (e) { err = e.message; }
    ck('provider: anything but never / allow is refused by name — the setting unchanged', err === "crossProvider must be 'never' or 'allow'" && amP.get(pp).crossProvider === 'allow');
    amP.updatePool(pp, { hot: true });
    ck('provider: an update that does not name it leaves it alone', amP.get(pp).crossProvider === 'allow');
  } else ck('provider SKIP — pools unsupported on this platform', true);
  fs.rmSync(D2, { recursive: true, force: true });
}
// A DELETED MEMBER'S CONVERSATIONS NEVER LAND ON ANOTHER PROVIDER (lane pool-provider-latents, design q-055 M2): the
// store's heal is a HOT re-point — onto a member of the deleted account's OWN provider only (the engine's pick only when
// it is one); nobody of that provider left ⇒ UNPLACED: the link unlinked, a persisted mark, billing nobody (never the
// default). MUTANT: the old re-point (the engine's pick / the default of ANY provider) ⇒ RED.
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const MU = mutantCopies('pool-unplaced', path.resolve('.'));
  const DS = { id: 'pv-deepseek', kind: 'openai-chat', label: 'DeepSeek', models: [{ id: 'deepseek-chat' }] };
  const CR = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
  // One, Two = DeepSeek; Three = the Claude subscription. The default on Three, conversation sa on One, sb on Three.
  const GONE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-poolgone-'));
  const world = (AM = AccountManager, { defOn = 'three' } = {}) => {
    const D3 = fs.mkdtempSync(path.join(GONE, 'w-'));
    const am3 = new AM({ dataDir: D3 });
    const one = am3.createSubscription({ name: 'One' }).id, two = am3.createSubscription({ name: 'Two' }).id, three = am3.createSubscription({ name: 'Three' }).id;
    for (const x of [one, two, three]) fs.writeFileSync(path.join(am3.subDir(x), '.credentials.json'), CR(x), { mode: 0o600 });
    am3.setProviderLookup((acct) => (acct.id === one || acct.id === two ? DS : null));
    const pp = am3.createPool({ name: 'Mixed' }).id;
    am3.setPoolTarget(pp, defOn === 'one' ? one : three);
    am3.ensureSessionPoolLink(pp, 'sa', one, { why: 'spawn' }); am3.ensureSessionPoolLink(pp, 'sb', three, { why: 'spawn' });
    const engineSays = (to) => ({ chooseDefault: () => to, chooseLink: () => to }); // an engine pick of ANOTHER provider (never taken)
    return { D3, am: am3, one, two, three, pp, engineSays };
  };
  const ww = world();
  if (!ww.am.poolSupported()) ck('unplaced SKIP — pools unsupported on this platform', true);
  else {
    const { am: m, one, two, three, pp } = ww;
    const quiet = (f) => { const w0 = console.warn; console.warn = () => { }; try { return f(); } finally { console.warn = w0; } };
    quiet(() => m.remove(one, ww.engineSays(three)));
    ck('unplaced: a DeepSeek member deleted while another DeepSeek member is left ⇒ its conversation moves to THAT one — the engine\'s pick of the Claude member is refused', m.poolCurrentFor(pp, 'sa') === two);
    ck('unplaced: …nothing is marked, the Claude conversation and the default untouched', !m.unplacedOf(pp, 'sa') && m.poolCurrentFor(pp, 'sb') === three && m.poolCurrent(pp) === three);
    ck('unplaced: the deleted member\'s provider and name are remembered (goneProviderOf / goneNameOf — the engine\'s verdicts name it)', m.goneProviderOf(one)?.label === 'DeepSeek' && m.goneNameOf(one) === 'One' && m.memberProviderOf(one) === null);
    quiet(() => m.remove(two, ww.engineSays(three)));
    const mark = m.unplacedOf(pp, 'sa');
    ck('unplaced: the LAST DeepSeek member deleted ⇒ the conversation is UNPLACED — its link gone, it bills nobody (never the Claude default)', m.poolCurrentFor(pp, 'sa') === null && !fs.existsSync(m.sessionPoolLinkPath(pp, 'sa')) && mark && mark.member === two && mark.name === 'Two' && mark.provider.label === 'DeepSeek', JSON.stringify(mark));
    ck('unplaced: …listed among the pools the delete route decides at once; the Claude conversation untouched', m.unplacedPools().includes(pp) && m.poolCurrentFor(pp, 'sb') === three);
    const re = new AccountManager({ dataDir: ww.D3 });
    ck('unplaced: the mark is PERSISTED — a restart reads the conversation unplaced, its provider and member (goneProviderOf from the mark)', re.unplacedOf(pp, 'sa')?.member === two && re.goneProviderOf(two)?.label === 'DeepSeek' && re.poolCurrentFor(pp, 'sa') === null);
    m.noteUnplacedAsked(pp, 'sa', 'ut-9');
    ck('unplaced: noteUnplacedAsked keeps that the owner was asked (once, persisted)', !!m.unplacedOf(pp, 'sa').asked && m.unplacedOf(pp, 'sa').todoId === 'ut-9' && !!new AccountManager({ dataDir: ww.D3 }).unplacedOf(pp, 'sa').asked);
    m.ensureSessionPoolLink(pp, 'sa', three, { why: 'cross-provider' });
    ck('unplaced: a placement (the owner\'s Allow, a pin, its own provider) writes the link again and CLEARS the mark', m.poolCurrentFor(pp, 'sa') === three && !m.unplacedOf(pp, 'sa') && !m.unplacedPools().includes(pp));
    // the DEFAULT, and the sweep
    const wd = world(AccountManager, { defOn: 'one' });
    quiet(() => { wd.am.remove(wd.two, wd.engineSays(wd.three)); wd.am.remove(wd.one, wd.engineSays(wd.three)); });
    ck('unplaced: the DEFAULT on the last DeepSeek member ⇒ UNPLACED too (unlinked + marked) — never re-pointed onto the Claude member', wd.am.poolCurrent(wd.pp) === null && wd.am.unplacedOf(wd.pp, null)?.member === wd.one && wd.am.unplacedOf(wd.pp, 'sa')?.member === wd.one);
    wd.am.setPoolTarget(wd.pp, wd.three);
    ck('unplaced: …setting the default again clears ITS mark (the conversation\'s stays)', !wd.am.unplacedOf(wd.pp, null) && !!wd.am.unplacedOf(wd.pp, 'sa'));
    wd.am.sweepSessionPoolLinks(new Set(['sb']));
    ck('unplaced: the boot sweep drops the mark of a conversation that no longer exists', !wd.am.unplacedOf(wd.pp, 'sa'));
    // ONE PROVIDER: the heal is the old one (the engine's pick, else the default)
    const w1p = (() => { const D4 = fs.mkdtempSync(path.join(GONE, 'one-')); const a4 = new AccountManager({ dataDir: D4 }); const x = a4.createSubscription({ name: 'X' }).id, y = a4.createSubscription({ name: 'Y' }).id; for (const q of [x, y]) fs.writeFileSync(path.join(a4.subDir(q), '.credentials.json'), CR(q), { mode: 0o600 }); const p4 = a4.createPool({ name: 'One provider' }).id; a4.setPoolTarget(p4, x); a4.ensureSessionPoolLink(p4, 'sx', x, { why: 'spawn' }); quiet(() => a4.remove(x, {})); return { a4, p4, y, D4 }; })();
    ck('unplaced: a ONE-provider pool heals exactly as before — the default and the link onto the member left, nothing marked', w1p.a4.poolCurrent(w1p.p4) === w1p.y && w1p.a4.poolCurrentFor(w1p.p4, 'sx') === w1p.y && !w1p.a4.unplacedPools().length);
    // RED MUTANT: the heal without its provider filter (the old re-point)
    const src = fs.readFileSync(path.resolve('src/accounts.js'), 'utf8');
    const ANCH = "const sameProv = (mid) => goneKey == null || this._providerKeyOf(this.memberProviderOf(mid)) === goneKey;";
    ck('unplaced mutant: the anchor (the heal\'s provider filter) hits once', src.split(ANCH).length === 2);
    if (src.split(ANCH).length === 2) {
      const { AccountManager: Old } = MU.load('src/accounts.js', src.replace(ANCH, 'const sameProv = () => true; // PATCHED: the old re-point'), 'old-repoint');
      const wm = world(Old);
      quiet(() => { wm.am.remove(wm.one, wm.engineSays(wm.three)); });
      ck('unplaced mutant RED: the old re-point follows the engine\'s pick onto the CLAUDE member — the DeepSeek conversation moved hot, no mark (the silent cross-provider move)', wm.am.poolCurrentFor(wm.pp, 'sa') === wm.three && !wm.am.unplacedOf(wm.pp, 'sa'));
      const wm2 = world(Old);
      quiet(() => { wm2.am.remove(wm2.two, {}); wm2.am.remove(wm2.one, {}); });
      ck('unplaced mutant RED: …and with no engine at all, onto the Claude DEFAULT', wm2.am.poolCurrentFor(wm2.pp, 'sa') === wm2.three);
    }
    for (const r of copiesCensus(MU.files, MU.dir, path.resolve('.'), { minCopies: 1, label: 'unplaced: ' })) ck(r.name, r.pass);
  }
  fs.rmSync(GONE, { recursive: true, force: true });
}
fs.rmSync(DATA, { recursive: true, force: true });

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
