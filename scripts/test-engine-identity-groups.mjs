// test-engine-identity-groups.mjs — B-87fd identity unit 4 (主开发 r3011): the pool engine's identity groups ask the ONE comparison.
// The REAL pool engine (src/server/usage-pool-engine.js create) over made-up worlds of rows in a REAL AccountManager: sign-ins
// written as the CLI writes them, every usage cache through the product's own writer, the kept facts settled. Its legs:
//  1. THE MONEY LAW (r3011 (1)): a pool decision about one seat is never made on another seat's reading — and its mirror: a row
//     that stood in a group and now stands alone serves its OWN reading at once, never «unknown» for a time;
//  2. one account whose organisation only one cache names is ONE group;
//  3. a machine login joins only the one group that holds its today's key, else it stands alone;
//  4. the names: a group keeps today's name; a split today's name is nobody's bare (each piece takes its oldest row's id); a merge
//     keeps the precedence name; no name carries a seat;
//  5. the spend slot (data/spend-budget.json's key, r3011 (3)) is the same under today's keying and the one comparison;
//  6. THE UPDATE (r3022 (2)): rows signed in before the tie existed are SEEDED at their first landing — one account in two rows
//     stays one group and nothing is renamed; a second start, its folder now signed in as ANOTHER account, writes nothing and
//     keeps the seeded tie; a seed with no deadline is never seeded again after a restart (主开发 r3311 (1): the mark persisted);
//     a dropped tie is not seeded by the next landing; two accounts the release grouped by name split; a row whose snapshot
//     cannot be read seeds nothing; the sweep that comes BEFORE the landing judges nothing;
//  7. THE RETIRE (r3022 (1)), the sweep's alone: only a PROVEN split archives the bare name's file beside itself (dated, never
//     removed) after its rates entry is on disk, said once by kind and the rows' names and ids; one account, an unreadable row,
//     an unproven split, a sweep before the landing and the accounts list HELD retire nothing; a crash inside the retire is
//     finished by the next pass; the kept lines are read again; the archive is read by the real listers; a rates file that does
//     not parse is read as empty and said once;
//  8. «LANDED» IS LANDED ONCE (主开发 r3311 MUST 1): two seats split, then their kept facts aged past the bound with no re-read —
//     still apart, the names unchanged, seat A usable on its own reading, nothing filed under the bare name, no second archive;
//  9. THE PACING MEMORY (r3311 MUST 2, §ban-safety): the REAL automatic check with a counted stand-in for the probe over four
//     hours — two unproven rows of one address are asked as often as the release asked them, the ask ROTATING so each row is
//     asked (r3680); three rows joined by the union, every one asked; two seats proven different each keep their own cadence;
//     a groups memo built before a landing is dropped at it (r3680); 10. two pieces of a long split name never share one file.
// RED CONTROLS (each a copy with one named edit, built and run): the release-keyed engine (legs 1, 2 and 4 fail on it — legs 3
// and 5 are PINS: their law did not move); a retire that archives before its rates entry is on disk; a retire on «unproven»; a
// retire that reads no kept line again; «landed» as «confirmed in the last 60 s»; an engine with no pacing memory; a loop whose pick
// does not rotate; a memo that outlives a landing; a store whose
// seed asks no tie / no mark / no drop; an estimator that refuses a rates file that does not parse.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST after node's own (§113): the suite runs on a temp home of its own before any of its code
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const cleanup = [];
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
process.env.HOME = tmpdir('vs-eig-home-');

const { waitEverySave } = require(path.join(REPO, 'scripts/lib/accounts-landed.cjs'));   // B-574d (line 832 on the 2.369.418 train): accounts.json is the store writer's — a second store over the same data (a restart) reads what the first one's saves wrote: each save waited for here (the suite's thread)
const AccountManager = waitEverySave((() => { const m = require(path.join(REPO, 'src/accounts.js')); return m.AccountManager || m; })());
const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
const engPath = path.join(REPO, 'src/server/usage-pool-engine.js');
const engMod = require(engPath);
// the RELEASE's grouping, for the red control: every member under its today's key, in file order
const MUT = mutantCopies('engine-identity-groups', REPO);
const engSrc = fs.readFileSync(engPath, 'utf8');
let todayMod = null, todayErr = null;
try { todayMod = require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, '  const judged = identityGroupsOf(members);\n', '  const judged = members.reduce((acc, x) => acc.set(x.today, [...(acc.get(x.today) || []), x]), new Map());\n', 'the release keying (RED)'))); } catch (e) { todayErr = e.message; }
ok(!todayErr && todayMod && typeof todayMod.create === 'function', 'RED CONTROL built: a copy of the engine grouped by today\'s key', todayErr || '');
const redCopy = (file, src, edits, label) => { try { let t = src; for (const [a, b] of edits) t = anchored(t, a, b, label); return require(MUT.write(file, t)); } catch (e) { return { err: e.message }; } };
const LANDED = ["        try { const f = accounts.signinFacts(accountId, { since: 0 }); landed = f.state === 'read' || f.why !== 'not-read-yet'; } catch { landed = false; }\n        if (landed) { try { rec = accounts.identityRecordOf(accountId, { since: 0 }); } catch { rec = null; } }\n",
  "        try { const f = accounts.signinFacts(accountId, { withinMs: 60000 }); landed = f.state === 'read' || f.why !== 'not-read-yet'; } catch { landed = false; }\n        if (landed) { try { rec = accounts.identityRecordOf(accountId, { withinMs: 60000 }); } catch { rec = null; } }\n"];
const R60 = redCopy('src/server/usage-pool-engine.js', engSrc, [LANDED], '«landed» = confirmed in the last 60 s (RED)');
const RNoPace = redCopy('src/server/usage-pool-engine.js', engSrc, [["  Object.defineProperty(groups, 'pacing', { value: judged.pacing || null, enumerable: false });\n", '']], 'no pacing memory (RED)');
const RNoReread = redCopy('src/server/usage-pool-engine.js', engSrc, [["      try { require('../usage-anchors.js').noteAnchorsRewritten(usageAnchors.dir); } catch { }\n", '']], 'no kept line read again (RED)');
const accPath = path.join(REPO, 'src/accounts.js'), accSrc = fs.readFileSync(accPath, 'utf8');
const GUARD = "    if (!a || a.loginTieDropped || a.loginTieSeeded || this._hasTie(id) || !o || typeof o !== 'object') return;\n";
const amOf = (m) => (m && !m.err ? waitEverySave(m.AccountManager || m) : m);
const AMNoGuard = amOf(redCopy('src/accounts.js', accSrc, [[GUARD, "    if (!a || !o || typeof o !== 'object') return;\n"]], 'a seed over a tie (RED)'));
const AMNoMark = amOf(redCopy('src/accounts.js', accSrc, [[GUARD, "    if (!a || a.loginTieDropped || this._hasTie(id) || !o || typeof o !== 'object') return;\n"]], 'a seed with no mark (RED)'));
const AMNoDrop = amOf(redCopy('src/accounts.js', accSrc, [[GUARD, "    if (!a || a.loginTieSeeded || this._hasTie(id) || !o || typeof o !== 'object') return;\n"]], 'a seed over a drop (RED)'));
const RStandIn = redCopy('src/server/usage-pool-engine.js', engSrc, [["g.accountIds.includes(id) && g.cache && g.accountId !== id && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)", "g.accountIds.includes(id) && g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)"]], 'the group\'s copy of the row\'s own reading stands in (RED)');
const loopPath = path.join(REPO, 'src/server/auto-cli-loop.js');
const LoopNoRotate = redCopy('src/server/auto-cli-loop.js', fs.readFileSync(loopPath, 'utf8'), [["list.push({ key: a.id, fetchedAt: raw?.fetchedAt || 0, ownFetchedAt, lastAttemptAt:", "list.push({ key: a.id, fetchedAt: raw?.fetchedAt || 0, lastAttemptAt:"]], 'no rotation inside a pacing set (RED)');
const RMemo = redCopy('src/server/usage-pool-engine.js', engSrc, [["  if (!_identGroupsMemo.groups || Date.now() - _identGroupsMemo.at > 30000 || _identGroupsMemo.landed !== landed) {\n", "  if (!_identGroupsMemo.groups || Date.now() - _identGroupsMemo.at > 30000) {\n"]], 'a memo that outlives a landing (RED)');
const estPath = path.join(REPO, 'src/usage-estimator.js');
const EstOld = redCopy('src/usage-estimator.js', fs.readFileSync(estPath, 'utf8'), [["      if (text) { try { all = JSON.parse(text); } catch { all = {}; if (!this._ratesUnparsedSaid) { this._ratesUnparsedSaid = true; console.warn('[usage-estimator] rates.json does not parse: read as empty, as its other writer reads it (each usage history learns its rates again from its readings)'); } } }\n", '      if (text) all = JSON.parse(text);\n']], 'a rates file that does not parse refused (RED)');
for (const [label, m] of [['«landed» as confirmed in the last 60 s', R60], ['no pacing memory', RNoPace], ['no kept line read again', RNoReread], ['a seed over a tie', AMNoGuard], ['a seed with no mark', AMNoMark], ['a seed over a drop', AMNoDrop], ['a rates file that does not parse refused', EstOld], ['no rotation inside a pacing set', LoopNoRotate], ['a memo that outlives a landing', RMemo], ['the group\'s copy of the row\'s own reading stands in', RStandIn]]) ok(m && !m.err, `RED CONTROL built: ${label}`, (m && m.err) || '');

// ── a made-up world: organisations and people are invented; no id or address of a real account ──
let n = 0;
const org = () => `${String(++n).padStart(8, '0')}-0000-4000-8000-0000000e1600`;
const personOf = (address) => 'p-' + address.split('@')[0] + '-made-up';
const credsAt = (dir) => path.join(dir, '.credentials.json'), cfgAt = (dir) => path.join(dir, '.claude.json');
const writeLogin = (dir, { address, orgId, noRte = false }) => {   // what a real Claude sign-in leaves: the token file + the identity in .claude.json (`noRte`: an older CLI's, no deadline on its refresh)
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: 'at-' + address, refreshToken: 'rt-' + address, expiresAt: Date.now() + 3600e3, ...(noRte ? {} : { refreshTokenExpiresAt: Date.now() + 29 * 86400e3 + (++n) }), scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }));
  fs.writeFileSync(cfgAt(dir), JSON.stringify({ oauthAccount: { emailAddress: address, accountUuid: personOf(address), organizationUuid: orgId, organizationName: 'Org' } }));
};
const writeToken = (dir) => {   // a long-lived token (ours): law 5 — it names no seat
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: ['made-up', 'long-lived'].join('-'), expiresAt: Date.now() + 300 * 86400e3, scopes: ['user:inference'], subscriptionType: 'max' }, vibespaceOat: { id: 'made-up' } }));
};
const win = (at, u, hours) => ({ utilization: u, resetsAt: Math.floor(at / 1000) + Math.round(hours * 3600) });
const writeCache = (cacheDir, key, { ago, u5, orgId = null }) => {
  const at = Date.now() - ago * 1000;
  const obj = { fetchedAt: at, source: 'cli-usage', fiveHour: win(at, u5, 3), sevenDay: win(at, 0.2, 100), ...(orgId ? { orgUuid: orgId } : {}) };
  const w = usageWrite.writeCacheObject({ cacheDir, key, obj, measuredAt: at, source: 'cli-usage', backend: 'claude' });
  if (!w || !w.ok) throw new Error(`the product's cache writer refused ${key}`);
};
/** rows: [{ as: { address, orgId } | 'token' | null, cache: { ago, u5, orgId? }, machine?: true }] → the world, one real store, the
 *  real engine and its release-keyed copy over the SAME store and caches */
const closeAm = async (am) => { try { await am.displaySettled(); } catch { } try { am.close(); } catch { } };
/** `update: true` = THE UPDATE: the rows were signed in before the tie existed (their record holds none) and the hub starts again
 *  on the same data (`beforeLanding(am, ids)` runs on the new store before anything lands); `land: false` = the engine is built
 *  before the new store's first landing */
const world = async (rows, { update = false, land = true, beforeLanding = null, copies = {}, AM = AccountManager, held = false } = {}) => {
  const root = tmpdir('vs-eig-'), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  let am = new AM({ dataDir, onChange: () => { } });
  const ids = rows.map((r) => {
    if (r.machine) { writeCache(cacheDir, '__global__', r.cache); return '__global__'; }
    const id = am.createSubscription({}).id;
    if (r.as === 'token') writeToken(am.subDir(id)); else if (r.as) writeLogin(am.subDir(id), r.as);
    if (r.as) am.finalizeSubscription(id);
    writeCache(cacheDir, id, r.cache);
    return id;
  });
  if (update) {
    for (const id of ids) { const a = am.get(id); if (a) { delete a.loginTie; delete a.loginTieDropped; delete a.loginTieSeeded; } }
    am._save(); await closeAm(am);
    am = new AM({ dataDir, onChange: () => { } });
    if (beforeLanding) beforeLanding(am, ids);
  }
  if (held) {   // THE LIST HELD (bl-windows' accounts.held()): a hub start whose read of accounts.json is refused (mode 000)
    am._save(); await closeAm(am); fs.chmodSync(path.join(dataDir, 'accounts.json'), 0o000);
    am = new AM({ dataDir, onChange: () => { } });
  }
  if (land) await am.signinFactsSettled(null, { withinMs: 0 });
  const apps = [];
  const mk = (mod) => mod.create({ app: (apps[apps.length] = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }), rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: (k) => (k === 'accounts.cliSelfMeasure' ? false : undefined), getAccounts: () => am,   // the self-measure stays off: no CLI forked from a fast suite
    getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
  const eng = mk(engMod), app = apps[0], today = todayMod ? mk(todayMod) : null;
  const copy = Object.fromEntries(Object.entries(copies).map(([k, mod]) => { const e = mk(mod); return [k, { eng: e, app: apps[apps.length - 1] }]; }));
  return { am, ids, eng, app, today, copy, dataDir, cacheDir, close: async () => { await closeAm(am); if (held) { try { fs.chmodSync(path.join(dataDir, 'accounts.json'), 0o600); } catch { } } } };
};
const groupOf = (e, id) => { for (const [, g] of e.usageIdentityGroups()) if (g.accountIds.includes(id)) return g.accountIds.slice().sort().join(','); return id; };   // the groups asked NOW (the engine's 30 s memo would answer an older ask)
const usableOf = (e, id) => { try { const v = e.quotaVerdictFor(id); return v ? v.usable : 'no-verdict'; } catch (err) { return 'threw: ' + err.message; } };
const namesOf = (e) => [...e.usageIdentityGroups().keys()];

// ── 1. THE MONEY LAW: two seats of ONE organisation; seat B's reading is fresher and spent, seat A's own is healthy ──
{ const O = org(), W = await world([{ as: { address: 'seat-a@example.invalid', orgId: O }, cache: { ago: 120, u5: 0.05, orgId: O } }, { as: { address: 'seat-b@example.invalid', orgId: O }, cache: { ago: 10, u5: 1, orgId: O } }]);
  const [A, B] = W.ids;
  ok(groupOf(W.eng, A) === A && groupOf(W.eng, B) === B, '1. two seats of one organisation are TWO groups (each its own reading, walls and learning)', JSON.stringify([groupOf(W.eng, A), groupOf(W.eng, B)]));
  ok(usableOf(W.eng, A) === true && usableOf(W.eng, B) === false, '1. THE MONEY LAW: the decision about seat A is made on A\'s own reading (usable), never on seat B\'s fresher spent one; B\'s is B\'s (not usable)', JSON.stringify({ A: usableOf(W.eng, A), B: usableOf(W.eng, B) }));
  if (W.today) ok(groupOf(W.today, A) === [A, B].sort().join(',') && usableOf(W.today, A) === false, 'RED: under today\'s keying the two seats are ONE group and seat A is judged on seat B\'s spent reading (not usable)', JSON.stringify({ group: groupOf(W.today, A), A: usableOf(W.today, A) }));
  const names = namesOf(W.eng), lo = O.toLowerCase();
  ok(names.length === 2 && names.includes(`org:${lo}/${A}`) && names.includes(`org:${lo}/${B}`), '4. a SPLIT today\'s name is nobody\'s bare: each seat\'s group takes it with its oldest row\'s id', JSON.stringify(names.map((x) => x.replace(lo, '<org>'))));
  ok(names.every((x) => !x.includes(personOf('seat-a@example.invalid')) && !x.includes(personOf('seat-b@example.invalid'))), '4. no group\'s name carries a seat (the person\'s id stays in memory, r1477)');
  // 5. the spend slot: the key data/spend-budget.json counts under is the session's own cache key, the same under both groupings
  const slot = (e, id) => { try { return e.wallKeyFor({ _accountId: id, backend: 'claude', _webuiId: 'eig-' + id }); } catch (err) { return 'threw: ' + err.message; } };
  ok([A, B].every((id) => slot(W.eng, id) === id && (!W.today || slot(W.today, id) === id)), '5. the spend slot (data/spend-budget.json\'s key) is each row\'s own, the same under today\'s keying and the one comparison — nothing of its reading moves', JSON.stringify([A, B].map((id) => [slot(W.eng, id) === id, W.today ? slot(W.today, id) === id : null])));
  await W.close(); }

// ── 1′. THE MIRROR: a long-lived-token row (no seat) beside a signed-in row of its organisation — it now stands ALONE, and its own
// reading serves at once ──
{ const O = org(), W = await world([{ as: { address: 'signed@example.invalid', orgId: O }, cache: { ago: 10, u5: 1, orgId: O } }, { as: 'token', cache: { ago: 120, u5: 0.05, orgId: O } }]);
  const [S, T] = W.ids;
  ok(groupOf(W.eng, T) === T && usableOf(W.eng, T) === true, '1′. the MIRROR: a token row that stood in a group now stands alone and its OWN reading serves at once (usable on its own healthy numbers, never «unknown»)', JSON.stringify({ group: groupOf(W.eng, T) === T, T: usableOf(W.eng, T) }));
  if (W.today) ok(groupOf(W.today, T) === [S, T].sort().join(','), 'RED: under today\'s keying the token row shared the signed-in row\'s group (the organisation on its cache)', groupOf(W.today, T));
  await W.close(); }

// ── 2. ONE account whose organisation only one cache names — and the merge keeps the precedence name ──
{ const O = org(), acct = { address: 'one@example.invalid', orgId: O }, W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3 } }]);
  const [X, Y] = W.ids;
  ok(groupOf(W.eng, X) === [X, Y].sort().join(','), '2. one account in two rows, its organisation on one cache only: ONE group', groupOf(W.eng, X));
  if (W.today) ok(groupOf(W.today, X) === X, 'RED: under today\'s keying it split (an organisation key and an address key)', groupOf(W.today, X));
  ok(JSON.stringify(namesOf(W.eng)) === JSON.stringify([`org:${O.toLowerCase()}`]), '4. a MERGE keeps the precedence name (the organisation\'s, before the address\'s); nothing of the other is summed into it', JSON.stringify(namesOf(W.eng).length));
  await W.close(); }

// ── 3. THE MACHINE LOGIN: today's key, joining only the one group that holds it ──
{ const O = org(), W = await world([{ machine: true, cache: { ago: 5, u5: 0.2, orgId: O } }, { as: { address: 'me@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.2, orgId: O } }]);
  const [G, R] = W.ids;
  ok(groupOf(W.eng, G) === [G, R].sort().join(',') && JSON.stringify(namesOf(W.eng)) === JSON.stringify([`org:${O.toLowerCase()}`]), '3. the machine login joins the ONE group holding its today\'s key, and that group keeps today\'s name', JSON.stringify({ group: groupOf(W.eng, G) }));
  await W.close(); }
{ const O = org(), W = await world([{ machine: true, cache: { ago: 5, u5: 0.2, orgId: O } }, { as: { address: 'two-a@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.2, orgId: O } }, { as: { address: 'two-b@example.invalid', orgId: O }, cache: { ago: 50, u5: 0.2, orgId: O } }]);
  const [G] = W.ids;
  ok(groupOf(W.eng, G) === G && namesOf(W.eng).includes(`org:${O.toLowerCase()}/__global__`), '3. with two seats on its key the machine login stands ALONE (nobody\'s bare name: its own id beside it)', JSON.stringify({ group: groupOf(W.eng, G) === G, names: namesOf(W.eng).length }));
  await W.close(); }

// ── 6. THE UPDATE (r3022 (2)): rows signed in before the tie existed ──
const tieOf = (am, id) => { const a = am.get(id); return a && a.loginTie ? { seeded: !!a.loginTie.seeded } : null; };
{ const O = org(), acct = { address: 'span@example.invalid', orgId: O }, W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true });
  const [X, Y] = W.ids;
  ok([X, Y].every((id) => tieOf(W.am, id) && tieOf(W.am, id).seeded && W.am.identityRecordOf(id).tie === 'seeded'), '6. the update: each row with no tie is SEEDED at its first landing, and its record says the tie was seeded (not proven at a press)', JSON.stringify([X, Y].map((id) => [tieOf(W.am, id), (W.am.identityRecordOf(id) || {}).tie])));
  ok(groupOf(W.eng, X) === [X, Y].sort().join(',') && JSON.stringify(namesOf(W.eng)) === JSON.stringify([`org:${O.toLowerCase()}`]), '6. …so one account in two rows stays ONE group under today\'s name: the update splits nothing and renames nothing', JSON.stringify({ group: groupOf(W.eng, X), names: namesOf(W.eng).length }));
  await W.close();
  const before = fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8'), rteY = JSON.parse(before).accounts.find((a) => a.id === Y).loginTie.rte;
  writeLogin(W.am.subDir(Y), { address: 'another@example.invalid', orgId: org() });   // a sign-in inside a conversation: Y's folder now holds ANOTHER account
  const redDir = tmpdir('vs-eig-red-'); fs.cpSync(W.dataDir, redDir, { recursive: true });
  const again = new AccountManager({ dataDir: W.dataDir, onChange: () => { } }); await again.signinFactsSettled(null, { withinMs: 0 });
  ok([X, Y].every((id) => tieOf(again, id) && tieOf(again, id).seeded) && again.get(Y).loginTie.rte === rteY, '6. a second start, Y\'s folder now signed in as ANOTHER account, keeps the seeded ties (a tie is never written over by a seed)', JSON.stringify({ Y: tieOf(again, Y), same: again.get(Y).loginTie && again.get(Y).loginTie.rte === rteY }));
  await closeAm(again);
  ok(fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8') === before, '6. …and writes nothing: each row was seeded once');
  if (!AMNoGuard.err) { const red = new AMNoGuard({ dataDir: redDir, onChange: () => { } }); await red.signinFactsSettled(null, { withinMs: 0 }); await closeAm(red); ok(fs.readFileSync(path.join(redDir, 'accounts.json'), 'utf8') !== before, 'RED: a store whose seed asks for no tie writes Y\'s tie over from the other account\'s sign-in'); }
  const later = new AccountManager({ dataDir: W.dataDir, onChange: () => { } }); await later.signinFactsSettled(null, { withinMs: 0 });
  writeLogin(later.subDir(X), acct); later.finalizeSubscription(X);
  ok(tieOf(later, X) && !tieOf(later, X).seeded && later.identityRecordOf(X).tie === 'proven', '6. a later sign-in through the product replaces the seeded tie by a PROVEN one', JSON.stringify(tieOf(later, X)));
  await closeAm(later); }
{ const O = org(), W = await world([{ as: { address: 'mixed-a@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: { address: 'mixed-b@example.invalid', orgId: O }, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true });
  const [X, Y] = W.ids;
  ok(groupOf(W.eng, X) === X && groupOf(W.eng, Y) === Y && namesOf(W.eng).every((x) => x.includes('/')), '6. THE TRUE CORRECTION: two rows the release grouped by name whose folders are DIFFERENT accounts seed different ties and SPLIT (nobody keeps the name bare)', JSON.stringify({ X: groupOf(W.eng, X) === X, Y: groupOf(W.eng, Y) === Y }));
  await W.close(); }
if (typeof process.getuid === 'function' && process.getuid() !== 0) {   // a PLACED REFUSAL: a credentials file that cannot be opened (mode 000 — root opens it anyway)
  const O = org(), acct = { address: 'refused@example.invalid', orgId: O };
  let refused = null;
  const W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true, beforeLanding: (am, ids) => { refused = credsAt(am.subDir(ids[1])); fs.chmodSync(refused, 0o000); } });
  const [X, Y] = W.ids, why = W.am.signinFacts(Y, { withinMs: 60000 }).why;
  ok(why === 'unreadable' && !tieOf(W.am, Y) && tieOf(W.am, X) && tieOf(W.am, X).seeded, '6. a row whose snapshot could not be read seeds NOTHING (it stays unproven); its readable twin is seeded', JSON.stringify({ why: why || null, Y: tieOf(W.am, Y), X: tieOf(W.am, X) }));
  ok(groupOf(W.eng, Y) === Y, '6. …and the unreadable row, found unreadable, stands apart (unproven is apart)', groupOf(W.eng, Y));
  try { fs.chmodSync(refused, 0o600); } catch { }
  await W.close(); }
{ const O = org(), W = await world([{ as: { address: 'first-a@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: { address: 'first-b@example.invalid', orgId: O }, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true, land: false });
  const [X, Y] = W.ids;
  const early = { group: groupOf(W.eng, X), names: namesOf(W.eng), tied: [X, Y].map((id) => tieOf(W.am, id)) };
  ok(early.group === [X, Y].sort().join(',') && JSON.stringify(early.names) === JSON.stringify([`org:${O.toLowerCase()}`]), '6. THE SWEEP COMES FIRST: before the rows\' first landing nothing is judged — the name keeps its rows together as the release had them', JSON.stringify({ group: early.group === [X, Y].sort().join(','), names: early.names.length }));
  await W.am.signinFactsSettled(null, { withinMs: 0 });
  ok(groupOf(W.eng, X) === X && groupOf(W.eng, Y) === Y, '6. …and once both have landed (each seeded from its own snapshot) the two accounts are judged apart', JSON.stringify([groupOf(W.eng, X), groupOf(W.eng, Y)].map((g) => g.split(',').length)));
  await W.close(); }

// ── 6. SEEDED ONCE, a restart included (主开发 r3311 (1)): a seed whose credentials carry no deadline keeps its tie in memory only —
// the MARK on the row keeps it from a second seed when, after a restart, its folder holds another account's sign-in ──
{ const O = org(), acct = { address: 'old-cli@example.invalid', orgId: O, noRte: true }, W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true });
  const [X] = W.ids, a0 = W.am.get(X), rec0 = W.am.identityRecordOf(X);
  ok(a0.loginTieSeeded === true && !a0.loginTie && rec0 && rec0.tie === 'seeded', '6. a seed with no deadline on its refresh: seeded at the landing (its tie in memory), the MARK kept on the row', JSON.stringify({ mark: a0.loginTieSeeded, tie: !!a0.loginTie, kind: rec0 && rec0.tie }));
  await W.close();
  writeLogin(W.am.subDir(X), { address: 'someone-else@example.invalid', orgId: org(), noRte: true });   // after the restart its folder holds ANOTHER account
  const before = fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8'), redDir = tmpdir('vs-eig-red-'); fs.cpSync(W.dataDir, redDir, { recursive: true });
  const again = new AccountManager({ dataDir: W.dataDir, onChange: () => { } }); await again.signinFactsSettled(null, { withinMs: 0 });
  const rec1 = again.identityRecordOf(X);
  ok(rec1 && rec1.tie === null && rec1.seat == null && fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8') === before, '6. …after a restart it is NEVER seeded again: untied, its record names no seat (unproven, apart), nothing written', JSON.stringify({ tie: rec1 && rec1.tie, seat: !!(rec1 && rec1.seat) }));
  await closeAm(again);
  if (!AMNoMark.err) { const red = new AMNoMark({ dataDir: redDir, onChange: () => { } }); await red.signinFactsSettled(null, { withinMs: 0 }); const r = red.identityRecordOf(X); ok(!!(r && r.tie === 'seeded' && r.seat), 'RED: a store whose seed keeps no mark seeds the row again — from the OTHER account\'s sign-in', JSON.stringify({ tie: r && r.tie, seat: !!(r && r.seat) })); await closeAm(red); } }
// ── 6. A DROPPED TIE is not seeded by the next landing (r3022 (2)(a): the next press seeds it) ──
const touch = (f) => { const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t); };   // the folder changed: its next read lands (a parse), not a confirmation
for (const [AM, red] of [[AccountManager, false], ...(AMNoDrop.err ? [] : [[AMNoDrop, true]])]) {
  const O = org(), W = await world([{ as: { address: 'dropped@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.3, orgId: O } }], { AM });
  const [X] = W.ids;
  W.am._dropLoginTie(X); touch(credsAt(W.am.subDir(X))); await W.am.signinFactsSettled(null, { withinMs: 0 });
  const t = tieOf(W.am, X), kind = (W.am.identityRecordOf(X) || {}).tie || null;
  if (!red) ok(!t && kind === null && W.am.get(X).loginTieDropped === true, '6. a DROPPED tie stays dropped through the next landing (no seed: the next press seeds it)', JSON.stringify({ tie: t, kind }));
  else ok(kind === 'seeded', 'RED: a store whose seed asks for no drop seeds the dropped row at its next landing', JSON.stringify({ kind }));
  await W.close(); }

// ── 7. THE RETIRE (r3022 (1)) — the sweep's alone ──
const UA = require(path.join(REPO, 'src/usage-anchors.js'));
const anchorsDir = (W) => path.join(W.dataDir, 'usage-anchors');
const bareOf = (W, key) => path.join(anchorsDir(W), 'anchors-' + UA.anchorSlug(key) + '.ndjson');
const plant = (W, key) => {   // the bare name's history as the release wrote it (made-up anchors) and its rates entry, beside another's
  fs.mkdirSync(anchorsDir(W), { recursive: true });
  const at = Date.now() - 3600e3;
  fs.writeFileSync(bareOf(W, key), [0, 1].map((i) => JSON.stringify({ fetchedAt: at + i * 60e3, identityKey: key, accountId: null })).join('\n') + '\n');
  fs.writeFileSync(path.join(anchorsDir(W), 'rates.json'), JSON.stringify({ [key]: { computedAt: at, nAnchors: 2, buckets: {} }, 'acct:someone-else': { computedAt: at, nAnchors: 1, buckets: {} } }));
  // a rewrite from outside the estimator is followed by its reload, as server.js does after the boot's migrations (reloadRates)
  for (const a of [W.app, ...Object.values(W.copy || {}).map((c) => c.app)]) { try { a.locals.usageEstimator.reloadRates(); } catch { } }
};
const stateOf = (W, key) => {
  const name = path.basename(bareOf(W, key)), files = fs.readdirSync(anchorsDir(W));
  let rates = null; try { rates = JSON.parse(fs.readFileSync(path.join(anchorsDir(W), 'rates.json'), 'utf8')); } catch { }
  return { bare: files.includes(name), archived: files.filter((f) => f.startsWith(name + '.retired-')).length, ratesHas: !!(rates && key in rates), otherKept: !!(rates && 'acct:someone-else' in rates) };
};
const said = [];
const sweep = async (e) => { const was = console.log; console.log = (...a) => { const s = a.join(' '); if (s.startsWith('[usage] ')) said.push(s); else was(...a); }; try { await e.sweepUsageAnchors(); } finally { console.log = was; } };
const twoSeats = (tag) => { const O = org(); return { O, rows: [{ as: { address: `${tag}-a@example.invalid`, orgId: O }, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: { address: `${tag}-b@example.invalid`, orgId: O }, cache: { ago: 30, u5: 0.3, orgId: O } }] }; };
{ const { O, rows } = twoSeats('ret'), W = await world(rows, { update: true }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0;
  await sweep(W.eng); const s1 = stateOf(W, key), line = said.slice();
  ok(!s1.bare && s1.archived === 1 && !s1.ratesHas && s1.otherKept, '7. a PROVEN split at the update: the bare name\'s file is ARCHIVED beside itself under a dated name and its rates entry dropped (another\'s kept)', JSON.stringify(s1));
  ok(line.length === 1 && line[0].includes("an organisation's shared usage history") && !line[0].includes(O) && !line[0].includes('@') && W.ids.every((id) => line[0].includes(id)), '7. …said ONCE in the journal by its kind and its rows\' ids — never the organisation\'s id, never an address', JSON.stringify({ n: line.length, hasOrg: line.some((l) => l.includes(O)), hasAt: line.some((l) => l.includes('@')) }));
  { // THE REAL LISTERS over a folder holding the archive alone (r3311 (6)): the repair's and the sweep's store read nothing of it
    const arch = fs.readdirSync(anchorsDir(W)).find((f) => f.includes('.retired-')), root2 = tmpdir('vs-eig-arch-'), d2 = path.join(root2, 'data', 'usage-anchors');
    fs.mkdirSync(d2, { recursive: true }); fs.copyFileSync(path.join(anchorsDir(W), arch), path.join(d2, arch));
    const n2 = await require(path.join(REPO, 'src/reading-repair.js')).prefetchAnchorRows(d2);
    const st = new UA.UsageAnchors({ dataDir: path.join(root2, 'data') }), primed = await st.prime(), last = st.lastAnchor(key);
    ok(n2 === 0 && primed === true && last === null && st.syncReads === 0, '7. the archive is read by NONE of the real listers: the repair\'s prefetch reads 0 files, the sweep\'s store primes with nothing of it', JSON.stringify({ repair: n2, primed, last: !!last, syncReads: st.syncReads })); }
  await sweep(W.eng);
  ok(stateOf(W, key).archived === 1 && said.length === 1, '7. a second pass finds no bare file and does nothing (no state of its own; one archive a split)', JSON.stringify({ archived: stateOf(W, key).archived, said: said.length }));
  await W.close(); }
{ const O = org(), acct = { address: 'keep@example.invalid', orgId: O }, W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0; await sweep(W.eng); const s = stateOf(W, key);
  ok(s.bare && s.archived === 0 && s.ratesHas && said.length === 0, '7. ONE account in two rows at the update: nothing split, nothing retired, nothing said', JSON.stringify({ ...s, said: said.length }));
  await W.close(); }
const REt = (() => { try { return require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, "      if (groupOfIdx.get(x.idx) !== groupOfIdx.get(y.idx) && provenApart(x, y)) proven = true;\n", "      if (groupOfIdx.get(x.idx) !== groupOfIdx.get(y.idx)) proven = true;\n", 'a retire on «unproven» (RED)'))); } catch (e) { return { err: e.message }; } })();
{ const O = org(), W = await world([{ as: { address: 'token-twin@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: 'token', cache: { ago: 30, u5: 0.3, orgId: O } }], { copies: REt.err ? {} : { unproven: REt } }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0; await sweep(W.eng); const s = stateOf(W, key);
  ok(s.bare && s.archived === 0 && s.ratesHas && said.length === 0, '7. an UNPROVEN split (a long-lived-token row beside a signed-in one: no seat to compare) retires NOTHING — it stands apart, its history kept', JSON.stringify({ ...s, said: said.length }));
  if (!REt.err) { said.length = 0; await sweep(W.copy.unproven.eng); ok(stateOf(W, key).archived === 1, 'RED: a copy whose retire does not ask for a PROVEN split archives that history', JSON.stringify(stateOf(W, key))); } else ok(false, 'RED CONTROL built: a retire on «unproven»', REt.err);
  await W.close(); }
if (typeof process.getuid === 'function' && process.getuid() !== 0) {
  const O = org(), acct = { address: 'shut@example.invalid', orgId: O }; let refused = null;
  const W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true, beforeLanding: (am, ids) => { refused = credsAt(am.subDir(ids[1])); fs.chmodSync(refused, 0o000); } }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0; await sweep(W.eng); const s = stateOf(W, key);
  ok(s.bare && s.archived === 0 && said.length === 0, '7. a row whose snapshot could not be read: the retire has not happened and the pass ends without a word', JSON.stringify({ ...s, said: said.length }));
  try { fs.chmodSync(refused, 0o600); } catch { }
  await W.close(); }
{ const { O, rows } = twoSeats('early'), W = await world(rows, { update: true, land: false }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0; await sweep(W.eng); const s0 = stateOf(W, key);
  await W.am.signinFactsSettled(null, { withinMs: 0 }); await sweep(W.eng); const s1 = stateOf(W, key);
  ok(s0.bare && s0.archived === 0 && !s1.bare && s1.archived === 1 && said.length === 1, '7. THE SWEEP BEFORE THE LANDING retires nothing; once both rows landed (seeded, different) the next pass retires the name once', JSON.stringify({ before: s0, after: s1, said: said.length }));
  await W.close(); }
const ROrder = (() => { try { return require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, "      await usageEstimator.retireRates(s.key);\n      await fs.promises.rename(fp, fp + '.retired-' + new Date().toISOString().replace(/[-:]/g, ''));\n", "      await fs.promises.rename(fp, fp + '.retired-' + new Date().toISOString().replace(/[-:]/g, ''));\n      await usageEstimator.retireRates(s.key);\n", 'the archive before the rates entry (RED)'))); } catch (e) { return { err: e.message }; } })();
{ const { O, rows } = twoSeats('crash'), W = await world(rows, { update: true }), key = `org:${O.toLowerCase()}`;
  // (i) the archive refused once, AFTER the rates entry was dropped: the next pass finishes it
  plant(W, key); said.length = 0;
  const rename = fs.promises.rename; let once = true;
  fs.promises.rename = async (...a) => { if (once && String(a[0]).endsWith('.ndjson')) { once = false; throw Object.assign(new Error('a refused rename (placed)'), { code: 'EIO' }); } return rename(...a); };
  try { await sweep(W.eng); } finally { fs.promises.rename = rename; }
  const c1 = stateOf(W, key); await sweep(W.eng); const c2 = stateOf(W, key);
  ok(c1.bare && !c1.ratesHas && said.length === 1 && !c2.bare && c2.archived === 1, '7. A CRASH INSIDE THE RETIRE (the archive refused after the rates entry was on disk): no word, the bare file still there — the next pass finishes it, said once', JSON.stringify({ first: c1, second: c2, said: said.length }));
  await W.close(); }
{ const { O, rows } = twoSeats('crash2'), W = await world(rows, { update: true, copies: ROrder.err ? {} : { order: ROrder } }), key = `org:${O.toLowerCase()}`;
  // (ii) the rates write refused once: nothing archived, the next pass does both (each world its own estimator: the one writer)
  plant(W, key); said.length = 0;
  const est = W.app.locals.usageEstimator, real = est.retireRates.bind(est); let fail = true;
  est.retireRates = async (k) => { if (fail) { fail = false; throw new Error('the rates file was not written (placed)'); } return real(k); };
  await sweep(W.eng); const d1 = stateOf(W, key); await sweep(W.eng); const d2 = stateOf(W, key);
  ok(d1.bare && d1.ratesHas && !d2.bare && !d2.ratesHas && said.length === 1, '7. …and a rates write refused: nothing archived, the next pass drops it and archives', JSON.stringify({ first: d1, second: d2, said: said.length }));
  await W.close(); }
{ const { O, rows } = twoSeats('crash3'), W = await world(rows, { update: true, copies: ROrder.err ? {} : { order: ROrder } }), key = `org:${O.toLowerCase()}`;
  if (!ROrder.err) {
    plant(W, key);
    const oe = W.copy.order.app.locals.usageEstimator; let f2 = true; const r2 = oe.retireRates.bind(oe);
    oe.retireRates = async (k) => { if (f2) { f2 = false; throw new Error('the rates file was not written (placed)'); } return r2(k); };
    await sweep(W.copy.order.eng); await sweep(W.copy.order.eng); const o = stateOf(W, key);
    ok(!o.bare && o.ratesHas, 'RED: a copy that archives BEFORE its rates entry is on disk leaves that entry for ever after the same refused write (no bare file left to tell)', JSON.stringify(o));
  } else ok(false, 'RED CONTROL built: the archive before the rates entry', ROrder.err);
  await W.close(); }

// ── 7. the accounts list HELD (unread): no named row is grouped, so nothing is proven, retired or said ──
if (typeof process.getuid === 'function' && process.getuid() !== 0) {
  const { O, rows } = twoSeats('held'), W = await world(rows, { held: true }), key = `org:${O.toLowerCase()}`;
  const h = typeof W.am.held === 'function' ? W.am.held() : null;
  plant(W, key); said.length = 0; await sweep(W.eng); const s = stateOf(W, key);
  ok(!!h && s.bare && s.archived === 0 && s.ratesHas && said.length === 0, '7. the accounts list HELD: nothing retired, nothing archived, nothing said', JSON.stringify({ held: !!h, ...s, said: said.length }));
  await W.close(); }
// ── 7. step (3): the KEPT LINES read again — the sweep's store never serves the archived file's last line for the bare name ──
for (const [mod, red] of [[null, false], ...(RNoReread.err ? [] : [[RNoReread, true]])]) {
  const { O, rows } = twoSeats(red ? 'reread-red' : 'reread'), W = await world(rows, { copies: mod ? { m: mod } : {} }), key = `org:${O.toLowerCase()}`;
  const e = mod ? W.copy.m.eng : W.eng;
  plant(W, key);
  let was = null; for (let i = 0; i < 3 && !was; i++) { await e.usageAnchors.prime(); was = e.usageAnchors.lastAnchor(key); }   // the engine's own boot prime may be in flight (it listed the folder before the plant): the next one lists the planted file
  said.length = 0; await sweep(e); const now = e.usageAnchors.lastAnchor(key), st = stateOf(W, key);
  if (!red) ok(!!was && st.archived === 1 && now === null, '7. step (3): once the file is archived the kept lines are read again — the bare name has no last line', JSON.stringify({ was: !!was, archived: st.archived, now: !!now }));
  else ok(!!now && st.archived === 1, 'RED: a retire that reads no kept line again still serves the archived file\'s last line for the bare name', JSON.stringify({ now: !!now }));
  await W.close(); }
// ── 7. a rates file that DOES NOT PARSE (r3311 (3)): read as empty, as its other writer reads it — the retire goes on, said once ──
for (const red of [false, ...(EstOld.err ? [] : [true])]) {
  const { O, rows } = twoSeats(red ? 'torn-red' : 'torn'), W = await world(rows), key = `org:${O.toLowerCase()}`;
  plant(W, key); fs.writeFileSync(path.join(anchorsDir(W), 'rates.json'), '{"not json');
  const est = W.app.locals.usageEstimator; est.reloadRates();
  if (red) est.retireRates = EstOld.UsageEstimator.prototype.retireRates.bind(est);
  const warned = [], ww = console.warn; console.warn = (...a) => { const t = a.join(' '); if (t.startsWith('[usage-estimator]')) warned.push(t); else ww(...a); };
  said.length = 0;
  try { await sweep(W.eng); await sweep(W.eng); } finally { console.warn = ww; }
  const st = stateOf(W, key);
  if (!red) ok(st.archived === 1 && !st.bare && warned.length === 1 && said.length === 1, '7. a rates file that does not parse: read as empty (as _persistRates reads it), the retire done and the file\'s state said ONCE', JSON.stringify({ archived: st.archived, warned: warned.length, said: said.length }));
  else ok(st.bare && st.archived === 0, 'RED: a retire that refuses a rates file that does not parse fails at every pass without a word', JSON.stringify(st));
  await W.close(); }

// ── 8. «LANDED» IS LANDED ONCE (主开发 r3311 MUST 1): the kept facts age past the 60 s bound with no re-read ──
{ const O = org(), W = await world([{ as: { address: 'aged-a@example.invalid', orgId: O }, cache: { ago: 120, u5: 0.05, orgId: O } }, { as: { address: 'aged-b@example.invalid', orgId: O }, cache: { ago: 10, u5: 1, orgId: O } }], { copies: R60.err ? {} : { r60: R60 } }), key = `org:${O.toLowerCase()}`;
  const [A, B] = W.ids;
  plant(W, key); said.length = 0; await sweep(W.eng);
  const names0 = namesOf(W.eng).sort(), s0 = stateOf(W, key);
  const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
  try {
    const age = async () => { await W.am.displaySettled(); skew += 61000; };   // every kept confirmation now older than the bound, no read in flight
    await age();
    const premise = W.am.signinFacts(A, { withinMs: 60000 }).why;
    const g = { A: groupOf(W.eng, A) === A, B: groupOf(W.eng, B) === B, names: JSON.stringify(namesOf(W.eng).sort()) === JSON.stringify(names0), usableA: usableOf(W.eng, A) };
    const r = W.copy.r60 ? { merged: groupOf(W.copy.r60.eng, A) === [A, B].sort().join(','), usableA: usableOf(W.copy.r60.eng, A) } : null;
    ok(s0.archived === 1 && premise === 'not-read-yet' && g.A && g.B && g.names && g.usableA === true, '8. LANDED ONCE: the two seats\' kept facts aged past the bound (not re-read) — still apart, the names unchanged, seat A usable on its OWN reading', JSON.stringify({ archived: s0.archived, premise, ...g }));
    if (r) ok(r.merged && r.usableA === false, 'RED: «landed» as «confirmed in the last 60 s» puts the two seats back in one group — seat A judged on seat B\'s spent reading', JSON.stringify(r));
    await age(); writeCache(W.cacheDir, B, { ago: 0, u5: 1, orgId: O });   // a fresh reading while the facts are aged
    await sweep(W.eng); const s1 = stateOf(W, key);
    await W.am.signinFactsSettled(null, { withinMs: 0 }); await sweep(W.eng); const s2 = stateOf(W, key);
    ok(!s1.bare && s1.archived === 1 && !s2.bare && s2.archived === 1 && said.length === 1, '8. …and the sweep over the aged facts files NOTHING under the bare name: no file made again, no second archive, said once', JSON.stringify({ aged: s1, after: s2, said: said.length }));
    if (W.copy.r60) {
      await age(); writeCache(W.cacheDir, B, { ago: 0, u5: 1, orgId: O }); await sweep(W.copy.r60.eng); const t1 = stateOf(W, key);
      await W.am.signinFactsSettled(null, { withinMs: 0 }); await sweep(W.copy.r60.eng); const t2 = stateOf(W, key);
      ok(t1.bare && t2.archived === 2 && said.length === 2, 'RED: …the copy files the merged group under the bare name again and RETIRES IT AGAIN (a second archive, said twice)', JSON.stringify({ aged: t1, after: t2, said: said.length }));
    }
  } finally { Date.now = realNow; }
  await W.close(); }

// ── 9. THE PACING MEMORY (主开发 r3311 MUST 2, §ban-safety): the REAL automatic check (src/server/auto-cli-loop.js), its probe a
// counted stand-in, four hours in five-minute ticks over each engine's own groups ──
const loopMod = require(path.join(REPO, 'src/server/auto-cli-loop.js'));
const paceRun = async (rows, which, lm = loopMod) => {
  const W = await world(rows, { copies: which === 'nopace' ? { nopace: RNoPace } : {} }), e = which === 'nopace' ? W.copy.nopace.eng : which === 'release' ? W.today : W.eng, asked = [];
  const orgOf = new Map(W.ids.map((id, i) => [id, rows[i].cache.orgId || null]));
  const realNow = Date.now; let T = realNow(); Date.now = () => T;
  try {
    const loop = lm.createAutoCliLoop({
      now: () => T, rand: () => 0.5, dataDir: tmpdir('vs-eig-pace-'), USAGE_CACHE_DIR: W.cacheDir, metric() { },
      serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined), accounts: W.am, autoCliReady: () => true,
      usageIdentityGroupsCached: () => e.usageIdentityGroupsCached(), usageEstimator: { estimateFor: () => null }, projectionRereadFor: () => null, lastMemberReadAt: () => 0,
      usage: { refreshViaCliPanel: async (k) => { asked.push(k); writeCache(W.cacheDir, k, { ago: 0, u5: 0.2, orgId: orgOf.get(k) }); return true; } },   // THE STAND-IN: counted; its reading lands as a probe's would
      onMemberReadingFresh() { }, log() { }, warn() { },
    });
    for (let m = 0; m < 240; m += 5) { await e.usageFolder.fresh(); await loop.tick(); T += 5 * 60e3; }
  } finally { Date.now = realNow; }
  const ids = W.ids; await W.close();
  return { n: asked.length, each: ids.map((id) => asked.filter((k) => k === id).length) };
};
{ const one = { address: 'pace@example.invalid', orgId: null }, rows = [{ as: one, cache: { ago: 60, u5: 0.2 } }, { as: one, cache: { ago: 30, u5: 0.2 } }];
  const cure = await paceRun(rows, 'eng'), rel = await paceRun(rows, 'release'), nop = RNoPace.err ? null : await paceRun(rows, 'nopace');
  ok(rel.n > 0 && cure.n === rel.n, '9. two UNPROVEN rows of one address (no organisation): the automatic check asks as often as the release asked (one pacing memory)', JSON.stringify({ cure: cure.n, release: rel.n }));
  ok(cure.each.every((x) => x > 0), '9. …and the ask ROTATES inside the set (主开发 r3680): EACH row is asked (the one whose own reading is oldest), so neither row\'s own reading freezes', JSON.stringify(cure.each));
  if (nop) ok(nop.n > rel.n, 'RED: an engine with no pacing memory asks about the two rows more often than the release (each on its own cadence)', JSON.stringify({ nopace: nop.n, release: rel.n }));
  if (!LoopNoRotate.err) { const stuck = await paceRun(rows, 'eng', LoopNoRotate); ok(stuck.n === rel.n && stuck.each.some((x) => x === 0), 'RED: the loop without its rows\' own reading ages (the uncured pick) asks the first row every time — the other row\'s reading never refreshes', JSON.stringify(stuck.each)); } }
{ // THREE rows of one address: A and B unproven, B and C unproven, A and C PROVEN different (two organisations' seats) — one pacing set by the
  // union: the count stays the release's, and every member is asked, the proven-different one too (r3680)
  const x = 'trio@example.invalid', rows = [{ as: { address: x, orgId: org() }, cache: { ago: 90, u5: 0.2 } }, { as: { address: x, orgId: null }, cache: { ago: 60, u5: 0.2 } }, { as: { address: x, orgId: org() }, cache: { ago: 30, u5: 0.2 } }];
  const cure = await paceRun(rows, 'eng'), rel = await paceRun(rows, 'release');
  ok(rel.n > 0 && cure.n === rel.n && cure.each.every((n) => n > 0), '9. THREE rows, the first and the last proven different, one set by the union: the count is the release\'s and EVERY member is asked', JSON.stringify({ cure: cure.each, release: rel.n })); }
{ const { rows } = twoSeats('pace2');
  const cure = await paceRun(rows, 'eng'), rel = await paceRun(rows, 'release'), nop = RNoPace.err ? null : await paceRun(rows, 'nopace');
  ok(cure.each.every((x) => x > 0) && (!nop || cure.n === nop.n) && cure.n > rel.n, '9. two seats PROVEN different: each keeps its own cadence (asked as two accounts are)', JSON.stringify({ cure: cure.each, nopace: nop && nop.n, release: rel.n })); }

// ── 8. THE MEMO NEVER OUTLIVES A LANDING (主开发 r3680): a groups memo built before the rows landed (the release's grouping) is dropped
// by the store's landing count, so the next decision reads the judged groups at once ──
for (const [mod, red] of [[null, false], ...(RMemo.err ? [] : [[RMemo, true]])]) {
  const { rows } = twoSeats(red ? 'memo-red' : 'memo'), W = await world(rows, { update: true, land: false, copies: mod ? { m: mod } : {} });
  const e = mod ? W.copy.m.eng : W.eng, [X, Y] = W.ids;
  const cachedGroupOf = (id) => { for (const [, g] of e.usageIdentityGroupsCached()) if (g.accountIds.includes(id)) return g.accountIds.slice().sort().join(','); return id; };
  const before = cachedGroupOf(X);
  await W.am.signinFactsSettled(null, { withinMs: 0 });
  const after = cachedGroupOf(X);
  if (!red) ok(before === [X, Y].sort().join(',') && after === X, '8. a memo built BEFORE the landing (the release\'s grouping) is dropped AT the landing: the next ask reads the two seats apart at once', JSON.stringify({ before: before.split(',').length, after: after.split(',').length }));
  else ok(after === [X, Y].sort().join(','), 'RED: a memo kept for its 30 s past the landing still serves the two seats as one group', JSON.stringify({ after: after.split(',').length }));
  await W.close(); }

// ── 10. two pieces of a LONG split name never share one anchors file (主开发 r3311 (2): the slug keeps the id, cutting the base) ──
{ const long = 'email:' + 'a-very-long-made-up-address-'.repeat(3) + '@example.invalid', ids = ['sub-aaaaaaaa', 'sub-bbbbbbbb'];
  const G = engMod.identityGroupsOf(ids.map((id) => ({ id, accountId: id, today: long, rec: {} })), { same: () => 'unproven' });
  const slugs = [...G.keys()].map((k) => UA.anchorSlug(k)), naive = ids.map((id) => UA.anchorSlug(long + '/' + id));
  ok(naive[0] === naive[1], 'PREMISE: the release spelling cuts a long split name\'s id off (both pieces one file)', JSON.stringify(naive.map((x) => x.length)));
  ok(G.size === 2 && slugs[0] !== slugs[1] && ids.every((id, i) => slugs[i].endsWith('_' + id)), '10. each piece keeps its own id inside the anchors file\'s name (the base gives up its end)', JSON.stringify(slugs.map((x) => x.slice(-14)))); }

// ── 11. A GROUP's CACHED READING STANDS IN ONLY FOR A SIBLING's (主开发 r3840): the row's OWN file gone while the groups' memo still
// holds its last reading — the row's live read decides: «no usage data» (the usage reading file's law: a file NOT THERE is no reading);
// a SIBLING's fresher reading still stands in while the row's own file reads, as before ──
for (const [mod, red] of [[null, false], ...(RStandIn.err ? [] : [[RStandIn, true]])]) {
  const O = org(), W = await world([{ as: { address: red ? 'gone-red@example.invalid' : 'gone@example.invalid', orgId: O }, cache: { ago: 60, u5: 0.1, orgId: O } }], { copies: mod ? { m: mod } : {} });
  const e = mod ? W.copy.m.eng : W.eng, [X] = W.ids;
  writeCache(W.cacheDir, X, { ago: 0, u5: 1, orgId: O });   // the row's last reading: spent
  await e.usageFolder.fresh();   // the folder's reply: the memo is built again over the spent reading
  const before = usableOf(e, X);
  fs.rmSync(path.join(W.cacheDir, X + '.json'));   // its own file GONE; the memo still holds its last reading
  let after = null; try { after = e.quotaVerdictFor(X); } catch (err) { after = { threw: err.message }; }
  if (!red) ok(before === false && !!after && after.usable !== false && !after.readingUnread, '11. the row\'s OWN file gone while the memo holds its last (spent) reading: the live read decides — «no usage data», never the memo\'s copy standing in', JSON.stringify({ before, after: after && { usable: after.usable, reason: after.reason } }));
  else ok(!!after && after.usable === false, 'RED: the stand-in as it was — the memo\'s copy of the deleted file\'s spent reading still holds the row', JSON.stringify({ after: after && { usable: after.usable } }));
  await W.close(); }
{ const O = org(), acct = { address: 'pair@example.invalid', orgId: O }, W = await world([{ as: acct, cache: { ago: 120, u5: 0.1, orgId: O } }, { as: acct, cache: { ago: 10, u5: 1, orgId: O } }]);
  const [X, Y] = W.ids;
  ok(groupOf(W.eng, X) === [X, Y].sort().join(',') && usableOf(W.eng, X) === false, '11. …a SIBLING\'s fresher reading still stands in while the row\'s own file reads (one account in two rows: X is judged on Y\'s fresher spent reading, as before)', JSON.stringify({ group: groupOf(W.eng, X) === [X, Y].sort().join(','), X: usableOf(W.eng, X) }));
  await W.close(); }

// ── the PURE grouping alone: a row with no record stands alone; «unproven» is apart ──
{ const G = engMod.identityGroupsOf([{ id: 'a', accountId: 'a', today: 'email:x', rec: null }, { id: 'b', accountId: 'b', today: 'email:x', rec: null }], { same: () => 'same' });
  ok(G.size === 2 && [...G.keys()].every((k) => k.startsWith('email:x/')), 'a row with NO record stands alone even beside one of its today\'s key (both take the split name)', JSON.stringify([...G.keys()]));
  const U = engMod.identityGroupsOf([{ id: 'a', accountId: 'a', today: 'org:o', rec: {} }, { id: 'b', accountId: 'b', today: 'org:o', rec: {} }], { same: () => 'unproven' });
  ok(U.size === 2, '«unproven» is APART (r3011 Q4)', U.size); }

report();
