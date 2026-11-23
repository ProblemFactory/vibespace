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
//     stays one group and nothing is renamed, a second start writes nothing; two accounts the release grouped by name split; a
//     row whose snapshot cannot be read seeds nothing; the sweep that comes BEFORE the landing judges nothing;
//  7. THE RETIRE (r3022 (1)), the sweep's alone: only a PROVEN split archives the bare name's file beside itself (dated, never
//     removed) after its rates entry is on disk, said once by kind and the rows' names and ids; one account, an unreadable row,
//     an unproven split and a sweep before the landing retire nothing; a crash inside the retire is finished by the next pass.
// RED CONTROLS: the release-keyed engine; a retire that archives before its rates entry is on disk; a retire on «unproven».
// RED CONTROL: a copy of the engine keyed by today's key (the release's grouping) — legs 1, 2 and 4 fail on it.
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

const AccountManager = (() => { const m = require(path.join(REPO, 'src/accounts.js')); return m.AccountManager || m; })();
const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
const engPath = path.join(REPO, 'src/server/usage-pool-engine.js');
const engMod = require(engPath);
// the RELEASE's grouping, for the red control: every member under its today's key, in file order
const MUT = mutantCopies('engine-identity-groups', REPO);
const engSrc = fs.readFileSync(engPath, 'utf8');
let todayMod = null, todayErr = null;
try { todayMod = require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, '  const judged = identityGroupsOf(members);\n', '  const judged = members.reduce((acc, x) => acc.set(x.today, [...(acc.get(x.today) || []), x]), new Map());\n', 'the release keying (RED)'))); } catch (e) { todayErr = e.message; }
ok(!todayErr && todayMod && typeof todayMod.create === 'function', 'RED CONTROL built: a copy of the engine grouped by today\'s key', todayErr || '');

// ── a made-up world: organisations and people are invented; no id or address of a real account ──
let n = 0;
const org = () => `${String(++n).padStart(8, '0')}-0000-4000-8000-0000000e1600`;
const personOf = (address) => 'p-' + address.split('@')[0] + '-made-up';
const credsAt = (dir) => path.join(dir, '.credentials.json'), cfgAt = (dir) => path.join(dir, '.claude.json');
const writeLogin = (dir, { address, orgId }) => {   // what a real Claude sign-in leaves: the token file + the identity in .claude.json
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: 'at-' + address, refreshToken: 'rt-' + address, expiresAt: Date.now() + 3600e3, refreshTokenExpiresAt: Date.now() + 29 * 86400e3 + (++n), scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }));
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
const world = async (rows, { update = false, land = true, beforeLanding = null, copies = {} } = {}) => {
  const root = tmpdir('vs-eig-'), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  let am = new AccountManager({ dataDir, onChange: () => { } });
  const ids = rows.map((r) => {
    if (r.machine) { writeCache(cacheDir, '__global__', r.cache); return '__global__'; }
    const id = am.createSubscription({}).id;
    if (r.as === 'token') writeToken(am.subDir(id)); else if (r.as) writeLogin(am.subDir(id), r.as);
    if (r.as) am.finalizeSubscription(id);
    writeCache(cacheDir, id, r.cache);
    return id;
  });
  if (update) {
    for (const id of ids) { const a = am.get(id); if (a) { delete a.loginTie; delete a.loginTieDropped; } }
    am._save(); await closeAm(am);
    am = new AccountManager({ dataDir, onChange: () => { } });
    if (beforeLanding) beforeLanding(am, ids);
  }
  if (land) await am.signinFactsSettled(null, { withinMs: 0 });
  const apps = [];
  const mk = (mod) => mod.create({ app: (apps[apps.length] = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }), rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: (k) => (k === 'accounts.cliSelfMeasure' ? false : undefined), getAccounts: () => am,   // the self-measure stays off: no CLI forked from a fast suite
    getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
  const eng = mk(engMod), app = apps[0], today = todayMod ? mk(todayMod) : null;
  const copy = Object.fromEntries(Object.entries(copies).map(([k, mod]) => { const e = mk(mod); return [k, { eng: e, app: apps[apps.length - 1] }]; }));
  return { am, ids, eng, app, today, copy, dataDir, close: () => closeAm(am) };
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
  const before = fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8');
  const again = new AccountManager({ dataDir: W.dataDir, onChange: () => { } }); await again.signinFactsSettled(null, { withinMs: 0 });
  ok([X, Y].every((id) => tieOf(again, id) && tieOf(again, id).seeded), '6. a second start keeps the seeded ties (a tie is never written over by a seed)');
  await closeAm(again);
  ok(fs.readFileSync(path.join(W.dataDir, 'accounts.json'), 'utf8') === before, '6. …and writes nothing: each row was seeded once');
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
  ok(fs.readdirSync(anchorsDir(W)).every((f) => !/^anchors-.*\.ndjson$/.test(f) || !f.includes('.retired-')), '7. the archive is listed by no anchors reader (its name does not end in .ndjson)');
  await sweep(W.eng);
  ok(stateOf(W, key).archived === 1 && said.length === 1, '7. a second pass finds no bare file and does nothing (no state of its own; one archive a split)', JSON.stringify({ archived: stateOf(W, key).archived, said: said.length }));
  await W.close(); }
{ const O = org(), acct = { address: 'keep@example.invalid', orgId: O }, W = await world([{ as: acct, cache: { ago: 60, u5: 0.3, orgId: O } }, { as: acct, cache: { ago: 30, u5: 0.3, orgId: O } }], { update: true }), key = `org:${O.toLowerCase()}`;
  plant(W, key); said.length = 0; await sweep(W.eng); const s = stateOf(W, key);
  ok(s.bare && s.archived === 0 && s.ratesHas && said.length === 0, '7. ONE account in two rows at the update: nothing split, nothing retired, nothing said', JSON.stringify({ ...s, said: said.length }));
  await W.close(); }
const REt = (() => { try { return require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, "      if (groupOfIdx.get(x.idx) !== groupOfIdx.get(y.idx) && x.rec && y.rec && x.rec.tie && y.rec.tie && same(x.rec, y.rec) === 'different') proven = true;\n", "      if (groupOfIdx.get(x.idx) !== groupOfIdx.get(y.idx)) proven = true;\n", 'a retire on «unproven» (RED)'))); } catch (e) { return { err: e.message }; } })();
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
const ROrder = (() => { try { return require(MUT.write('src/server/usage-pool-engine.js', anchored(engSrc, "      await usageEstimator.retireRates(s.key);\n      await fs.promises.rename(fp, fp + '.retired-' + new Date().toISOString().replace(/[-:]|\\.\\d+/g, ''));\n", "      await fs.promises.rename(fp, fp + '.retired-' + new Date().toISOString().replace(/[-:]|\\.\\d+/g, ''));\n      await usageEstimator.retireRates(s.key);\n", 'the archive before the rates entry (RED)'))); } catch (e) { return { err: e.message }; } })();
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

// ── the PURE grouping alone: a row with no record stands alone; «unproven» is apart ──
{ const G = engMod.identityGroupsOf([{ id: 'a', accountId: 'a', today: 'email:x', rec: null }, { id: 'b', accountId: 'b', today: 'email:x', rec: null }], { same: () => 'same' });
  ok(G.size === 2 && [...G.keys()].every((k) => k.startsWith('email:x/')), 'a row with NO record stands alone even beside one of its today\'s key (both take the split name)', JSON.stringify([...G.keys()]));
  const U = engMod.identityGroupsOf([{ id: 'a', accountId: 'a', today: 'org:o', rec: {} }, { id: 'b', accountId: 'b', today: 'org:o', rec: {} }], { same: () => 'unproven' });
  ok(U.size === 2, '«unproven» is APART (r3011 Q4)', U.size); }

report();
