#!/usr/bin/env node
// THE IDENTITY CENSUS (row B-87fd, the identity's own notion — 主开发 r1477 [3]: «the table first, as a census whose disagreeing
// doors are NAMED DEBT ROWS that only fall»). Every door of the product that decides «are these two account rows ONE account?»
// is asked on generated pairs whose TRUTH the generator knows (a seat = an account: its harness, its address, its organisation),
// and judged by two laws against that truth — never by the door's own conditions:
//   FALSE MERGE   the door says «same» for two accounts (two seats of one Team, one address in two organisations, strangers);
//   PROVEN SPLIT  the door says «different» for ONE account while both rows carry a fact of it (an address or the organisation).
// THE LAW OF REACH (round w02e4ftoy, 主开发 r1862): every JUDGED door is fed by the product's OWN caller-side functions — a real
// AccountManager whose rows are made, signed in and finished the product's way, over login files written as the CLI writes them
// (.credentials.json + the folder's .claude.json oauthAccount), its kept facts settled before a door reads them, the machine's own
// login read by the real subscriptionStatus over the scratch home. A door that cannot be reached so is UNJUDGED, with its reason —
// never judged through a copy. A pair shape no real sign-in can present to a door is UNREACHABLE there (printed, not judged).
// What a door gets wrong today is a DEBT row (door × law × pair kind), printed with one example pair. The census is GREEN while
// every failure is a listed row; it is RED for a failure no row names (a new debt) and for a row that no longer fails (it was
// cured: the row leaves — the table only falls). The unjudged list only falls too. Every fact here is MADE UP (example.invalid
// addresses, generated uuids) — r1477's standing word: a seat's or an organisation's id and a compared address are never a real
// one's, and nothing is read from a home but the scratch one this suite makes.
// SINCE UNIT 2 (row B-87fd): the ONE comparison — src/account-identity.js sameAccount over AccountManager.identityRecordOf — is a
// judged door with NO debt row (the target every door moves onto). Round wzkgs3nol's shoulds: each door's RIGHT answers are
// pinned per pair kind (a door that falls to «unproven» where it answers rightly today is red); two built-in MUTANT doors
// (always «same», always «unproven») prove the new-debt and the right-answer legs can fail; the doors are FOUND in the tree by
// fixed strings (a new caller of a known door shows by name); every usage cache is written through the product's own writer
// (src/usage-cache-write.js); each AccountManager is closed once its door answered.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST after node's own (§113, r1845 (2)): the suite runs on a temp home of its own before any of its code
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const cleanup = [];
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const HOME = tmpdir('vs-idc-home-');
process.env.HOME = HOME;                         // the machine's own login (subscriptionStatus) is read from THIS home
process.env.CODEX_HOME = path.join(HOME, '.codex');

// ── THE GENERATOR: pair kinds, each with its truth ──
let n = 0;
const uuid = () => { n++; const h = (n * 2654435761 >>> 0).toString(16).padStart(8, '0'); return `${h}-0000-4000-8000-${String(n).padStart(12, '0')}`; };
const addr = () => `seat${++n}@example.invalid`;
const seat = ({ org = undefined, address = undefined } = {}) => ({ address: address === undefined ? addr() : address, org: org === undefined ? uuid() : org });
const persons = new Map();   // ONE person per address — the CLI's accountUuid (one person holds a seat in each organisation)
const personOf = (address) => { if (!persons.has(address)) persons.set(address, uuid()); return persons.get(address); };
// a ROW: whether its folder holds a sign-in (the account's address + organisation, as the CLI writes them), a declared address (the
// person's backfill), a name the person gave it (renamed), and whether its usage cache names the organisation
const row = (acct, { signedIn = true, declared = null, renamed = null, orgInCache = true } = {}) => ({ acct, signedIn, declared, renamed, orgInCache: orgInCache && !!acct.org ? acct.org : null });
const KINDS = {
  'same-both-org': () => { const a = seat(); return { truth: 'same', x: row(a), y: row(a) }; },
  'same-one-org': () => { const a = seat(); return { truth: 'same', x: row(a), y: row(a, { orgInCache: false }) }; },
  'same-no-org': () => { const a = seat({ org: null }); return { truth: 'same', x: row(a), y: row(a) }; },
  'same-declared-conflict': () => { const a = seat(); return { truth: 'same', x: row(a), y: row(a, { declared: `typo-${a.address}` }) }; },
  'same-renamed': () => { const a = seat(); return { truth: 'same', x: row(a), y: row(a, { renamed: 'Work laptop' }) }; },   // r1862's should: a row the person renamed, no declared address
  'seats-one-org': () => { const o = uuid(); return { truth: 'different', x: row(seat({ org: o })), y: row(seat({ org: o })) }; },
  'seats-org-only': () => { const o = uuid(); return { truth: 'different', x: row(seat({ org: o }), { signedIn: false }), y: row(seat({ org: o }), { signedIn: false }) }; },   // two signed-out rows whose old caches name one organisation
  'one-address-two-orgs': () => { const m = addr(); return { truth: 'different', x: row(seat({ address: m })), y: row(seat({ address: m })) }; },
  'strangers': () => ({ truth: 'different', x: row(seat()), y: row(seat()) }),
  'strangers-renamed': () => ({ truth: 'different', x: row(seat()), y: row(seat(), { renamed: 'Work laptop' }) }),
};
const PAIRS = Object.entries(KINDS).flatMap(([kind, mk]) => [0, 1].map(() => ({ kind, ...mk() })));
const TRUTH = Object.fromEntries(Object.entries(KINDS).map(([k, mk]) => [k, mk().truth]));
const bothCarry = (p) => (p.x.signedIn || !!p.x.declared) && (p.y.signedIn || !!p.y.declared) || (!!p.x.orgInCache && !!p.y.orgInCache);
const lawOf = (p, answer) => (answer === 'same' && p.truth === 'different' ? 'false-merge' : answer === 'different' && p.truth === 'same' && bothCarry(p) ? 'proven-split' : null);
const brief = (p) => `${p.kind}: x{${p.x.signedIn ? 'signed in' : 'signed out'}, org ${p.x.orgInCache ? 'cached' : 'none'}} y{${p.y.signedIn ? 'signed in' : 'signed out'}${p.y.declared ? ', declared ≠ folder' : ''}${p.y.renamed ? ', renamed' : ''}, org ${p.y.orgInCache ? 'cached' : 'none'}}`;

// ── THE PRODUCT's OWN WORLD: a real AccountManager, rows made and finished its way, login files as the CLI writes them ──
const AccountManager = (() => { const m = require(path.join(REPO, 'src/accounts.js')); return m.AccountManager || m; })();
const writeLogin = (dir, acct) => {   // what a real Claude sign-in leaves in a folder: the token file + the identity in .claude.json (the person's accountUuid, the organisation's uuid)
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'at-idc', refreshToken: 'rt-idc', expiresAt: Date.now() + 3600e3 } }));
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude.json'), 'utf8')); } catch { cfg = {}; }
  cfg.oauthAccount = { emailAddress: acct.address, accountUuid: personOf(acct.address), ...(acct.org ? { organizationUuid: acct.org, organizationName: `Org ${acct.org.slice(0, 4)}` } : {}) };
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify(cfg));
};
const makeRow = (am, r) => {   // the row as the product makes it: created, signed in (or not), finished (named by its login), then the person's edits
  const id = am.createSubscription({}).id;
  if (r.signedIn) { writeLogin(am.subDir(id), r.acct); am.finalizeSubscription(id); }
  if (r.declared) am.setEmail(id, r.declared);
  if (r.renamed) am.rename(id, r.renamed);
  return id;
};
const settle = async (am) => { if (typeof am.signinFactsSettled === 'function') await am.signinFactsSettled(null, { withinMs: 0 }); };
// each manager is CLOSED once its door answered (its reads landed, its own file door's worker ended — round wzkgs3nol)
const closeAm = async (am) => { try { await am.displaySettled(); } catch { } try { am.close(); } catch { } };
// every usage cache is written through the PRODUCT's own writer (src/usage-cache-write.js writeCacheObject) — a refusal is red
const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
const writeCache = (cacheDir, key, obj) => { const w = usageWrite.writeCacheObject({ cacheDir, key, obj, measuredAt: obj.fetchedAt, source: obj.source || null, backend: 'claude' }); if (!w || !w.ok) throw new Error(`the product's cache writer refused ${key}: ${(w && w.why) || 'no answer'}`); };
const win = (at, u, days) => ({ utilization: u, resetsAt: Math.floor(at / 1000) + days * 86400 });

// ── THE DOORS — each answers 'same' | 'different' | 'unproven' | 'unreachable' for a pair, reached through the product's own chain ──
const DOORS = {};
// reloginResolve (src/accounts.js): row y is the record; the person presses «sign in again» (reloginBegin: its BEFORE), signs in into
// its folder, and the login is x's — the door on the ONE comparison since identity unit 3 («ask» answers «unproven» here)
DOORS.reloginResolve = async (p) => {
  if (!p.x.signedIn) return 'unreachable';   // a real sign-in always writes its address: a login with none is no person's
  const am = new AccountManager({ dataDir: tmpdir('vs-idc-relogin-'), onChange: () => { } });
  const id = makeRow(am, p.y);
  const begun = am.reloginBegin(id);
  writeLogin(am.subDir(id), p.x.acct);
  // the sign-in helper's own success for THIS press (written after the vendor's program wrote both files): the resolve judges only it
  fs.writeFileSync(path.join(am.subDir(id), '.vibespace-login-status.json'), JSON.stringify({ version: 1, state: 'success', attempt: begun && begun.attempt, updatedAt: Date.now() }));
  try { const r = am.reloginResolve(id); return r.outcome === 'same' ? 'same' : r.outcome === 'split' || r.outcome === 'moved' ? 'different' : 'unproven'; }
  finally { await closeAm(am); }
};
// evaluateOnHost (src/accounts.js): row y is the record; the paired machine's own login is x's — the probe's REPLY shape
// ({ subscription: { email } }, hostFactsKey 'subscription' in src/harnesses/claude.js), a remote answer, not a copy of a reader
DOORS.evaluateOnHost = async (p) => {
  if (!p.x.signedIn) return 'unreachable';
  const am = new AccountManager({ dataDir: tmpdir('vs-idc-host-'), onChange: () => { } });
  const id = makeRow(am, p.y);
  try { const v = am.evaluateOnHost(am.get(id), { subscription: { email: p.x.acct.address }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh' }, {}); return v && v.how === 'host-login' && v.linked ? 'same' : 'different'; }
  finally { await closeAm(am); }
};
// _usageGlobalLink (src/usage-routes.js setupUsage → GET /api/usage): the machine's own CLI login (x, read by the REAL
// subscriptionStatus from this suite's home) beside one named row (y) of a REAL AccountManager. setupUsage's own 30 s / 90 s
// intervals are never reached (report() ends the process; serverSetting null keeps the active poll off — no vendor call)
const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
DOORS._usageGlobalLink = async (p) => {
  if (!p.x.signedIn) return 'unreachable';   // the machine's login is a real sign-in
  const tmp = tmpdir('vs-idc-usage-'), cacheDir = path.join(tmp, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const am = new AccountManager({ dataDir: path.join(tmp, 'data'), onChange: () => { } });
  const id = makeRow(am, p.y);
  writeLogin(path.join(HOME, '.claude'), p.x.acct);   // the machine's ~/.claude/.credentials.json …
  fs.copyFileSync(path.join(HOME, '.claude', '.claude.json'), path.join(HOME, '.claude.json'));   // … and ~/.claude.json (where the CLI keeps it)
  await settle(am);
  const routes = {};
  const app = { get: (pt, h) => { routes[`GET ${pt}`] = h; }, post: (pt, h) => { routes[`POST ${pt}`] = h; }, locals: {} };
  setupUsage({ app, accounts: am, activeSessions: new Map(), serverSetting: () => null, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    USAGE_CACHE_FILE: path.join(tmp, 'usage.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(tmp, 'codex-sessions'), META_DIR: path.join(tmp, 'meta'),
    AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(tmp, 'buffers') });
  const at = Date.now();
  writeCache(cacheDir, '__global__', { fiveHour: win(at, 0.1, 0.2), sevenDay: win(at, 0.2, 5), fetchedAt: at, ...(p.x.orgInCache ? { orgUuid: p.x.orgInCache } : {}) });
  writeCache(cacheDir, id, { fiveHour: win(at, 0.1, 0.2), sevenDay: win(at, 0.2, 5), fetchedAt: at - 1000, ...(p.y.orgInCache ? { orgUuid: p.y.orgInCache } : {}) });
  const payload = await new Promise((resolve) => routes['GET /api/usage']({}, { json: resolve }));
  const link = payload && payload.globalLogin;
  await closeAm(am);
  return link && link.accountId === id ? 'same' : 'different';
};
// usageIdentityGroups (the pool engine's groups: readings, walls and probes shared across one «account»): ONE engine over every
// pair's rows in ONE real AccountManager (each pair's facts its own), its kept facts settled first
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const groupsWorld = async () => {
  const root = tmpdir('vs-idc-engine-'), dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir, onChange: () => { } });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const ids = new Map();
  PAIRS.forEach((p, i) => {
    for (const side of ['x', 'y']) {
      const r = p[side], id = makeRow(am, r);
      const at = Date.now() - 60e3;
      writeCache(cacheDir, id, { fetchedAt: at, source: 'cli-usage', fiveHour: win(at, 0.1, 0.2), sevenDay: win(at, 0.2, 5), ...(r.orgInCache ? { orgUuid: r.orgInCache } : {}) });
      ids.set(`${i}:${side}`, id);
    }
  });
  await settle(am);
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  let eng = null, err = null, groups = null;
  try {
    eng = engMod.create({ app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
      serverSetting: (k) => (k === 'accounts.cliSelfMeasure' ? false : undefined), getAccounts: () => am,   // the 60 s self-measure stays off: no CLI forked from a fast suite
      getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
      getAutoResume: () => null, getQuotaProbe: () => null });
    groups = eng.usageIdentityGroups();
  } catch (e) { err = e.message; }
  // identity unit 4: groups kept APART for want of proof answer «unproven» (the one comparison's own answer), apart by proof «different»
  const recs = new Map(); for (const id of ids.values()) { try { recs.set(id, am.identityRecordOf(id, { withinMs: 60000 })); } catch { recs.set(id, null); } }
  const { sameAccount: same1 } = require(path.join(REPO, 'src/account-identity.js'));
  await closeAm(am);   // the groups are computed: the engine has no stop (its timers end with the process at report())
  const groupOf = (id) => { if (!groups) return null; for (const [k, g] of groups) if (g && Array.isArray(g.accountIds) && g.accountIds.includes(id)) return k; return null; };
  return { err, answer: (p) => { const i = PAIRS.indexOf(p), x = ids.get(`${i}:x`), y = ids.get(`${i}:y`); const gx = groupOf(x), gy = groupOf(y); if (gx && gx === gy) return 'same'; return same1(recs.get(x), recs.get(y)) === 'unproven' ? 'unproven' : 'different'; } };
};
const gw = await groupsWorld();
ok(!gw.err, 'the pool engine builds over the census world (a real AccountManager, its facts settled) and answers its identity groups', gw.err || '');
DOORS.usageIdentityGroups = gw.answer;
// sameAccount (src/account-identity.js — THE ONE comparison, row B-87fd unit 2): ONE real AccountManager over every pair's rows,
// its kept facts settled, each row's record asked on the DECISION ROAD (AccountManager.identityRecordOf: the folder's own sign-in
// read by its harness's folderIdentityOf, the declared address) — the doors move onto it one by one
const { sameAccount } = require(path.join(REPO, 'src/account-identity.js'));
const sameWorld = async () => {
  const am = new AccountManager({ dataDir: tmpdir('vs-idc-same-'), onChange: () => { } });
  const ids = new Map();
  PAIRS.forEach((p, i) => { for (const side of ['x', 'y']) ids.set(`${i}:${side}`, makeRow(am, p[side])); });
  await settle(am);
  const out = new Map(PAIRS.map((p, i) => [p, sameAccount(am.identityRecordOf(ids.get(`${i}:x`)), am.identityRecordOf(ids.get(`${i}:y`)))]));
  await closeAm(am);
  return (p) => out.get(p);
};
DOORS.sameAccount = await sameWorld();

// ── THE DEBT TABLE: what each door gets wrong today (door × law × pair kind). A row LEAVES when its door is cured ──
const DEBT = [
  // (the engine's three rows LEFT with identity unit 4, 主开发 r3011: its groups ask the one comparison)
  // the machine login's link: the organisation first
  ['_usageGlobalLink', 'false-merge', 'seats-one-org'],
  // the record alone (a.email, or a name with «@»): one address in two organisations is one account; a declared address that differs
  // splits; a RENAMED row with no declared address has nothing to compare — the host check links none (reloginResolve's three rows
  // LEFT with identity unit 3: it asks the one comparison)
  ['evaluateOnHost', 'false-merge', 'one-address-two-orgs'], ['evaluateOnHost', 'proven-split', 'same-declared-conflict'], ['evaluateOnHost', 'proven-split', 'same-renamed'],
];
// doors not judged in-process — each with why (this list only falls too)
const UNJUDGED = {
  'usage-anchors identityKeyFor (alone)': 'a pure key: judged through its product caller, usageIdentityGroups — fed by hand it would be a copy of that caller',
  'oat-mint-model identityVerdict': 'its only caller rowIdentity (src/server/oat-mint.js) is a closure reached through a mint with a stand-in CLI — joins with its door unit (the pure verdict alone calls an organisation-only agreement a «match»: named for that unit)',
  'usage-routes _codexUsageGlobalLink': 'needs codex rows and the machine\'s codex login as codex writes them (auth.json\'s id_token) — joins with the codex door unit',
  'reading-repair identityCacheKeys': 'its group key copy reads the raw record address (no folder email); reached through established windows — joins the census with the record unit',
  'otel-ingest resolveOrg': 'reached only through the OTel ingest seam with a replay; books spend to the FIRST named member of an org — joins with the spend-booking door unit',
  'account-usage-routes duplicate → mergeSubscription': 'a route flow (finalize / host route) — joins with its door unit',
  'usage-routes panelIdentityVerdict': 'reached only through refreshViaCliPanel with a stand-in CLI — joins with its door unit',
  'client emailOf / manage-agents inline link': 'client code: the decision is inline (no callable decider) — joins with the accounts page unit',
};

// ONE judge for every door (the mutants below included): its answers per pair kind and its failures against the truth
const judge = async (door, ask) => {
  const found = new Map(), answers = {};   // 'door|law|kind' → example ; kind → [answer…]
  for (const p of PAIRS) {
    let a = null;
    try { a = await ask(p); } catch (e) { a = 'threw: ' + e.message; }
    answers[p.kind] = (answers[p.kind] || []).concat([a]);
    if (typeof a === 'string' && a.startsWith('threw')) { ok(false, `${door} answers every pair (it threw on ${p.kind})`, a); continue; }
    const law = lawOf(p, a);
    if (law) { const k = `${door}|${law}|${p.kind}`; if (!found.has(k)) found.set(k, brief(p)); }
  }
  return { found, answers };
};
const found = new Map();
const answers = {};
for (const [door, ask] of Object.entries(DOORS)) { const j = await judge(door, ask); answers[door] = j.answers; for (const [k, v] of j.found) found.set(k, v); }
console.log('── THE TABLE: each door\'s answers per pair kind (truth in brackets) ──');
for (const [door, byKind] of Object.entries(answers)) console.log(`  · ${door}: ${Object.entries(byKind).map(([k, v]) => `${k}[${TRUTH[k]}]=${[...new Set(v)].join('/')}`).join(' · ')}`);
const debtKeys = new Set(DEBT.map((r) => r.join('|')));
const newDebtOf = (fnd) => [...fnd.keys()].filter((k) => !debtKeys.has(k));
const newDebt = newDebtOf(found);
const curedRows = [...debtKeys].filter((k) => !found.has(k));
for (const k of [...found.keys()].filter((x) => debtKeys.has(x))) console.log(`  · DEBT ${k.replace(/\|/g, ' · ')} — e.g. ${found.get(k)}`);
ok(newDebt.length === 0, 'every door\'s failure against the truth is a NAMED debt row (none new)', newDebt.map((k) => `${k} — e.g. ${found.get(k)}`).join(' ; '));
ok(curedRows.length === 0, 'every debt row still fails — a cured door\'s row LEAVES the table (it only falls)', curedRows.join(' ; '));
ok(!DEBT.some((r) => r[0] === 'sameAccount') && ![...found.keys()].some((k) => k.startsWith('sameAccount|')), 'THE ONE COMPARISON owes nothing: sameAccount fails no law on any pair (no debt row, none found)', [...found.keys()].filter((k) => k.startsWith('sameAccount|')).join(' ; '));

// ── THE RIGHT ANSWERS, PINNED (round wzkgs3nol's should 4): per door, the pair kinds EVERY pair of which it answers as the truth
// is today. A door that falls to «unproven» (or anything else) on one is RED; a kind it newly answers rightly is red until its
// pin is written (the pin only rises)
const RIGHT = {
  // identity unit 3: the relogin on the one comparison — one-address-two-orgs and strangers-renamed now rightly DIFFERENT; same-no-org
  // falls to «unproven» (ask) by ruling (b): one address with no organisation named proves no account
  reloginResolve: ['same-both-org', 'same-one-org', 'same-renamed', 'seats-one-org', 'one-address-two-orgs', 'strangers', 'strangers-renamed'],
  evaluateOnHost: ['same-both-org', 'same-one-org', 'same-no-org', 'seats-one-org', 'strangers', 'strangers-renamed'],
  _usageGlobalLink: ['same-both-org', 'same-one-org', 'same-no-org', 'same-declared-conflict', 'same-renamed', 'one-address-two-orgs', 'strangers', 'strangers-renamed'],
  // identity unit 4 (主开发 r3011): the engine's groups on the one comparison — same-one-org, seats-one-org and seats-org-only now
  // right; same-no-org (an address with no organisation proves no account, Q4) and same-declared-conflict (ruling [1]) fall APART
  usageIdentityGroups: ['same-both-org', 'same-one-org', 'same-renamed', 'seats-one-org', 'one-address-two-orgs', 'strangers', 'strangers-renamed'],   // seats-org-only answers «unproven» (apart for want of a fact)
  // the one comparison: «unproven» on same-no-org (an address with no organisation), same-declared-conflict (nobody's twin until
  // the person resolves it) and seats-org-only (signed-out rows: no fact) — never wrong
  sameAccount: ['same-both-org', 'same-one-org', 'same-renamed', 'seats-one-org', 'one-address-two-orgs', 'strangers', 'strangers-renamed'],
};
const rightOf = (byKind) => Object.keys(KINDS).filter((k) => (byKind[k] || []).length > 0 && byKind[k].every((a) => a === TRUTH[k]));
const rightDrift = (door, byKind) => { const now = rightOf(byKind), pin = RIGHT[door] || []; return { lost: pin.filter((k) => !now.includes(k)), gained: now.filter((k) => !pin.includes(k)) }; };
for (const door of Object.keys(DOORS)) {
  const d = rightDrift(door, answers[door]);
  ok(d.lost.length === 0, `${door}: every pinned RIGHT answer still holds (${(RIGHT[door] || []).length} kinds) — none fell to «unproven» or worse`, d.lost.map((k) => `${k}: ${[...new Set(answers[door][k])].join('/')} (truth ${TRUTH[k]})`).join(' ; '));
  ok(d.gained.length === 0, `${door}: no kind answered rightly beyond its pin (a cure writes its pin: it only rises)`, d.gained.join(' ; '));
}
ok(Object.keys(RIGHT).length === Object.keys(DOORS).length && Object.keys(RIGHT).every((d) => d in DOORS), 'every judged door has its right-answer pin, and none other');

// ── THE MUTANT CONTROLS (round wzkgs3nol's should 3): the legs above CAN fail — judged by the same judge ──
{ const always = await judge('mutant-always-same', async () => 'same');
  const nd = newDebtOf(always.found), mustMerge = Object.keys(KINDS).filter((k) => TRUTH[k] === 'different');
  ok(mustMerge.length > 0 && mustMerge.every((k) => nd.includes(`mutant-always-same|false-merge|${k}`)), `MUTANT «always same»: the new-debt leg turns RED — a false merge on every «different» kind (${mustMerge.length})`, nd.join(' ; '));
  const unp = await judge('mutant-always-unproven', async () => 'unproven');
  const d = rightDrift('sameAccount', unp.answers);
  ok(unp.found.size === 0 && d.lost.length === RIGHT.sameAccount.length, `MUTANT «always unproven»: no law catches it (${unp.found.size} found) — the RIGHT pin does: all ${RIGHT.sameAccount.length} of sameAccount's pinned kinds lost`, d.lost.join(' ; ')); }

// ── THE DOORS FOUND IN THE TREE (round wzkgs3nol's should 1): every known «same account?» door by FIXED strings — its definition,
// its calls, the state it writes — counted per file over src/ (comment lines skipped). A new caller of a known door, or one
// gone, is RED by name: judge it here, or restate its row. (A door of a NEW name is not found so — a code walk is a later
// unit's; this census says that limit.) Each judged and unjudged door has its row, and no row is any other
const DOOR_MARKS = {
  reloginResolve: { 'reloginResolve(': { 'src/accounts.js': 2, 'src/server/account-usage-routes.js': 1 }, 'reloginBegin(': { 'src/accounts.js': 2, 'src/server/account-usage-routes.js': 1 }, 'reloginAnswer(': { 'src/accounts.js': 1, 'src/server/account-usage-routes.js': 1 }, 'beforeAfterVerdict(': { 'src/account-identity.js': 1, 'src/accounts.js': 1 } },   // + the press judging an unjudged success first, then pressing afresh (r2972 3): the same door
  evaluateOnHost: { 'evaluateOnHost(': { 'src/accounts.js': 1, 'src/ws-create.js': 2, 'src/routes/account-tails.js': 1, 'src/server/account-usage-routes.js': 1 } },
  _usageGlobalLink: { '_usageGlobalLink = ': { 'src/usage-routes.js': 4 } },
  usageIdentityGroups: { 'usageIdentityGroups(': { 'src/server/usage-pool-engine.js': 3 }, 'groupKeyOf(': { 'src/server/usage-pool-engine.js': 3 }, 'identityGroupsOf(': { 'src/server/usage-pool-engine.js': 2 } },   // + its PURE grouping (unit 4); groupKeyOf( 3: the release's key the B-6a92 door read is gone (r5264: the hold and its door read ONE notion, rowOwnOf)
  sameAccount: { 'sameAccount(': { 'src/account-identity.js': 2, 'src/accounts.js': 1, 'src/server/usage-pool-engine.js': 1 }, 'identityRecordOf(': { 'src/account-identity.js': 1, 'src/accounts.js': 6, 'src/server/usage-pool-engine.js': 4 } },   // + the move search's seeded read of an untied row (r2915); engine 4: + B-6a92's door at every press reading the kept facts (主开发 r5481 (2): the other rows' logins, the row's own identity on file — in memory, no file read; r5516 (3): the row's own harness)
  'usage-anchors identityKeyFor (alone)': { 'identityKeyFor(': { 'src/reading-repair.js': 1, 'src/usage-anchors.js': 1, 'src/server/usage-pool-engine.js': 1 } },
  // two of identityVerdict's four are a NAMESAKE: the mac helper's code-signing verdict (agentd), not an account door
  'oat-mint-model identityVerdict': { 'identityVerdict(': { 'src/oat-mint-model.js': 1, 'src/server/oat-mint.js': 1, 'src/mac-helper-identity.js': 1, 'src/agentd/stream-mac.js': 1 } },
  'usage-routes _codexUsageGlobalLink': { '_codexUsageGlobalLink = ': { 'src/usage-routes.js': 4 } },
  'reading-repair identityCacheKeys': { 'identityCacheKeys(': { 'src/reading-repair.js': 3 } },
  'otel-ingest resolveOrg': { 'resolveOrg(': { 'src/server/otel-ingest.js': 2 } },
  'account-usage-routes duplicate → mergeSubscription': { 'mergeSubscription(': { 'src/accounts.js': 1, 'src/server/account-usage-routes.js': 2 } },
  'usage-routes panelIdentityVerdict': { 'panelIdentityVerdict(': { 'src/usage-routes.js': 2 } },
  'client emailOf / manage-agents inline link': { 'machineLoginLinkHint(': { 'src/lib/manage-agents.js': 3 }, 'emailOf(': { 'src/lib/app.js': 1 } },
  // THE ONE LOGIN READER by a name (B-6a92 r7) — not a door: every identity site that reads a login by a name asks it
  'usage-probe-log loginOfAccount (the reader)': { 'loginOfAccount(': { 'src/server/usage-probe-log.js': 1, 'src/server/oat-mint.js': 1, 'src/usage-routes.js': 1, 'src/server/usage-pool-engine.js': 1 } },
};
{ const jsFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : jsFiles(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const texts = jsFiles(path.join(REPO, 'src')).map((f) => [path.relative(REPO, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')]);
  const countIn = (mark, txts) => { const out = {}; for (const [f, s] of txts) { const c = s.split(mark).length - 1; if (c) out[f] = c; } return out; };
  // THE DRIFT COMPARISON (one function: the census and its red control run the same)
  const driftOf = (txts) => { const drift = [];
  for (const [door, marks] of Object.entries(DOOR_MARKS)) for (const [mark, want] of Object.entries(marks)) {
    const got = countIn(mark, txts);
    for (const f of new Set([...Object.keys(want), ...Object.keys(got)])) if ((want[f] || 0) !== (got[f] || 0)) drift.push(`${door} · «${mark}» in ${f}: ${got[f] || 0} (row says ${want[f] || 0})${want[f] ? '' : ' — an UNLISTED caller: judge it, or name it in the row'}`);
  }
  return drift; };
  const drift = driftOf(texts);
  ok(texts.length > 100 && drift.length === 0, `THE DOORS FOUND IN THE TREE: every known door's fixed strings, file by file over ${texts.length} src files, as its row says — no unlisted caller`, drift.join(' ; '));
  const rowed = new Set(Object.keys(DOOR_MARKS)), named = [...Object.keys(DOORS), ...Object.keys(UNJUDGED)];
  ok(named.every((d) => rowed.has(d)) && [...rowed].filter((d) => !named.includes(d)).length === 1, 'every judged and unjudged door has its fixed-string row (and one reader row beside them)', { unrowed: named.filter((d) => !rowed.has(d)), extra: [...rowed].filter((d) => !named.includes(d)) });
  // RED CONTROL (round wvjd20mpa (6)): the SAME drift comparison over the tree plus ONE planted caller in a file no row names —
  // red by name, as an unlisted caller; the tree alone stays clean
  const plantedDrift = driftOf([...texts, ['src/planted-door.js', 'const v = am.reloginResolve(id);']]);
  ok(plantedDrift.length === 1 && plantedDrift[0].includes('src/planted-door.js') && plantedDrift[0].includes('UNLISTED'), 'RED CONTROL: the drift comparison itself, over the tree plus a planted «reloginResolve(» in a file no row names, says it by name (an UNLISTED caller)', plantedDrift); }
ok(Object.keys(DOORS).length === 5 && Object.keys(UNJUDGED).length === 8, 'the census judges 5 doors through the product\'s own chain (sameAccount the 5th, with NO debt row) and names 8 not reached so (each with its reason): the unjudged list only falls', JSON.stringify({ judged: Object.keys(DOORS), unjudged: Object.keys(UNJUDGED) }));
for (const [d, why] of Object.entries(UNJUDGED)) console.log(`  · UNJUDGED ${d} — ${why}`);
// the generator's own premises (a census that cannot fail proves nothing)
ok(PAIRS.filter((p) => p.truth === 'same').every((p) => p.x.acct === p.y.acct) && PAIRS.filter((p) => p.truth === 'different').every((p) => p.x.acct !== p.y.acct), 'the generator\'s truth is its facts: a «same» pair is one account in two rows, a «different» pair two accounts');
ok(PAIRS.some((p) => p.kind === 'one-address-two-orgs' && p.x.acct.address === p.y.acct.address && p.x.acct.org !== p.y.acct.org) && PAIRS.some((p) => p.kind === 'seats-one-org' && p.x.orgInCache === p.y.orgInCache && p.x.acct.address !== p.y.acct.address), 'the generator draws the two collapse risks (one address in two organisations; two seats of one organisation)');
ok(PAIRS.every((p) => [p.x, p.y].every((r) => /@example\.invalid$/.test(r.acct.address))), 'every address is made up (example.invalid) — nothing from a real home');
report();
