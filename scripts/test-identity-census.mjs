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
const writeLogin = (dir, acct) => {   // what a real Claude sign-in leaves in a folder: the token file + the identity in .claude.json
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'at-idc', refreshToken: 'rt-idc', expiresAt: Date.now() + 3600e3 } }));
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude.json'), 'utf8')); } catch { cfg = {}; }
  cfg.oauthAccount = { emailAddress: acct.address, ...(acct.org ? { organizationUuid: acct.org, organizationName: `Org ${acct.org.slice(0, 4)}` } : {}) };
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

// ── THE DOORS — each answers 'same' | 'different' | 'unproven' | 'unreachable' for a pair, reached through the product's own chain ──
const DOORS = {};
// reloginResolve (src/accounts.js): row y is the record; the person signs in again into its folder, and the login is x's
DOORS.reloginResolve = async (p) => {
  if (!p.x.signedIn) return 'unreachable';   // a real sign-in always writes its address: a login with none is no person's
  const am = new AccountManager({ dataDir: tmpdir('vs-idc-relogin-'), onChange: () => { } });
  const id = makeRow(am, p.y);
  writeLogin(am.subDir(id), p.x.acct);
  const r = am.reloginResolve(id);
  return r.outcome === 'same' ? 'same' : r.outcome === 'split' || r.outcome === 'moved' ? 'different' : 'unproven';
};
// evaluateOnHost (src/accounts.js): row y is the record; the paired machine's own login is x's (the probe's reply: its address)
DOORS.evaluateOnHost = async (p) => {
  if (!p.x.signedIn) return 'unreachable';
  const am = new AccountManager({ dataDir: tmpdir('vs-idc-host-'), onChange: () => { } });
  const id = makeRow(am, p.y);
  const v = am.evaluateOnHost(am.get(id), { subscription: { email: p.x.acct.address }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh' }, {});
  return v && v.how === 'host-login' && v.linked ? 'same' : 'different';
};
// _usageGlobalLink (src/usage-routes.js setupUsage → GET /api/usage): the machine's own CLI login (x, read by the REAL
// subscriptionStatus from this suite's home) beside one named row (y) of a REAL AccountManager
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
  fs.writeFileSync(path.join(cacheDir, '__global__.json'), JSON.stringify({ fiveHour: {}, sevenDay: {}, fetchedAt: at, ...(p.x.orgInCache ? { orgUuid: p.x.orgInCache } : {}) }));
  fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fiveHour: {}, sevenDay: {}, fetchedAt: at - 1000, ...(p.y.orgInCache ? { orgUuid: p.y.orgInCache } : {}) }));
  const payload = await new Promise((resolve) => routes['GET /api/usage']({}, { json: resolve }));
  const link = payload && payload.globalLogin;
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
      fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1 }, sevenDay: { utilization: 0.2 }, ...(r.orgInCache ? { orgUuid: r.orgInCache } : {}) }));
      ids.set(`${i}:${side}`, id);
    }
  });
  await settle(am);
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  let eng = null, err = null, groups = null;
  try {
    eng = engMod.create({ app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
      serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
      getAutoResume: () => null, getQuotaProbe: () => null });
    groups = eng.usageIdentityGroups();
  } catch (e) { err = e.message; }
  const groupOf = (id) => { if (!groups) return null; for (const [k, g] of groups) if (g && Array.isArray(g.accountIds) && g.accountIds.includes(id)) return k; return null; };
  return { err, answer: (p) => { const i = PAIRS.indexOf(p); const gx = groupOf(ids.get(`${i}:x`)), gy = groupOf(ids.get(`${i}:y`)); return gx && gx === gy ? 'same' : 'different'; }, stop: () => { try { eng && typeof eng.stop === 'function' && eng.stop(); } catch { } } };
};
const gw = await groupsWorld();
ok(!gw.err, 'the pool engine builds over the census world (a real AccountManager, its facts settled) and answers its identity groups', gw.err || '');
DOORS.usageIdentityGroups = gw.answer;

// ── THE DEBT TABLE: what each door gets wrong today (door × law × pair kind). A row LEAVES when its door is cured ──
const DEBT = [
  // the engine's group key is ORG FIRST: one account whose organisation only one cache names splits; two seats of one org merge
  ['usageIdentityGroups', 'proven-split', 'same-one-org'], ['usageIdentityGroups', 'false-merge', 'seats-one-org'], ['usageIdentityGroups', 'false-merge', 'seats-org-only'],
  // the machine login's link: the organisation first
  ['_usageGlobalLink', 'false-merge', 'seats-one-org'],
  // the record alone (a.email, or a name with «@»): one address in two organisations is one account; a declared address that differs
  // splits; a RENAMED row with no declared address has nothing to compare — relogin adopts any login, the host check links none
  ['reloginResolve', 'false-merge', 'one-address-two-orgs'], ['reloginResolve', 'proven-split', 'same-declared-conflict'], ['reloginResolve', 'false-merge', 'strangers-renamed'],
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

const found = new Map();   // 'door|law|kind' → example
const answers = {};
for (const [door, ask] of Object.entries(DOORS)) {
  answers[door] = {};
  for (const p of PAIRS) {
    let a = null;
    try { a = await ask(p); } catch (e) { a = 'threw: ' + e.message; }
    answers[door][p.kind] = (answers[door][p.kind] || []).concat([a]);
    if (typeof a === 'string' && a.startsWith('threw')) { ok(false, `${door} answers every pair (it threw on ${p.kind})`, a); continue; }
    const law = lawOf(p, a);
    if (law) { const k = `${door}|${law}|${p.kind}`; if (!found.has(k)) found.set(k, brief(p)); }
  }
}
gw.stop();
console.log('── THE TABLE: each door\'s answers per pair kind (truth in brackets) ──');
for (const [door, byKind] of Object.entries(answers)) console.log(`  · ${door}: ${Object.entries(byKind).map(([k, v]) => `${k}[${TRUTH[k]}]=${[...new Set(v)].join('/')}`).join(' · ')}`);
const debtKeys = new Set(DEBT.map((r) => r.join('|')));
const newDebt = [...found.keys()].filter((k) => !debtKeys.has(k));
const curedRows = [...debtKeys].filter((k) => !found.has(k));
for (const k of [...found.keys()].filter((x) => debtKeys.has(x))) console.log(`  · DEBT ${k.replace(/\|/g, ' · ')} — e.g. ${found.get(k)}`);
ok(newDebt.length === 0, 'every door\'s failure against the truth is a NAMED debt row (none new)', newDebt.map((k) => `${k} — e.g. ${found.get(k)}`).join(' ; '));
ok(curedRows.length === 0, 'every debt row still fails — a cured door\'s row LEAVES the table (it only falls)', curedRows.join(' ; '));
ok(Object.keys(DOORS).length === 4 && Object.keys(UNJUDGED).length === 8, 'the census judges 4 doors through the product\'s own chain and names 8 not reached so (each with its reason): the unjudged list only falls', JSON.stringify({ judged: Object.keys(DOORS), unjudged: Object.keys(UNJUDGED) }));
for (const [d, why] of Object.entries(UNJUDGED)) console.log(`  · UNJUDGED ${d} — ${why}`);
// the generator's own premises (a census that cannot fail proves nothing)
ok(PAIRS.filter((p) => p.truth === 'same').every((p) => p.x.acct === p.y.acct) && PAIRS.filter((p) => p.truth === 'different').every((p) => p.x.acct !== p.y.acct), 'the generator\'s truth is its facts: a «same» pair is one account in two rows, a «different» pair two accounts');
ok(PAIRS.some((p) => p.kind === 'one-address-two-orgs' && p.x.acct.address === p.y.acct.address && p.x.acct.org !== p.y.acct.org) && PAIRS.some((p) => p.kind === 'seats-one-org' && p.x.orgInCache === p.y.orgInCache && p.x.acct.address !== p.y.acct.address), 'the generator draws the two collapse risks (one address in two organisations; two seats of one organisation)');
ok(PAIRS.every((p) => [p.x, p.y].every((r) => /@example\.invalid$/.test(r.acct.address))), 'every address is made up (example.invalid) — nothing from a real home');
report();
