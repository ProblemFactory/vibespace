#!/usr/bin/env node
// THE IDENTITY's ONE RECORD AND ONE COMPARISON (row B-87fd, unit 2 — src/account-identity.js, PURE). The step order, the conflict
// rule (r1477 [1]: a declared address that differs from the folder's is nobody's twin), and the laws over generated pairs whose
// TRUTH the generator knows — never a FALSE MERGE, never a PROVEN SPLIT, «unproven» only where no fact can tell. Every fact here is
// made up (example.invalid addresses, generated ids): a seat's or an organisation's id and a compared address are never a real one's.
// THE FOLDER's READ: each harness's folderIdentityOf over a sign-in folder as its CLI writes it, the kept facts' landing and
// AccountManager.identityRecordOf on the decision road — and the ids never leave memory (no row, push, finalize answer).
// ROUND wvjd20mpa's follow: strings only, the address alone case-folded, the seat's two parts kept apart, null for nothing handed;
// no default reader; ONE parse a landing; a config naming another login (or beside a long-lived token) names no seat; malformed
// files and tokens ⇒ null; a codex row through the product; a planted «one address is the same account» mutant.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113); anchored(): the red controls' edits, by their anchors
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
// A HOME OF ITS OWN, said (scratch.mjs re-homes the suite too): AccountManager's home readers read only this
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acid-home-'));
process.env.HOME = HOME;
process.env.CODEX_HOME = path.join(HOME, '.codex');
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { } });
const { identityRecordOf: R, sameAccount } = require(path.join(REPO, 'src/account-identity.js'));

// ── THE STEP ORDER, case by case ──
const c = (h, auth, declared = null) => R({ harness: h, declared, auth });
ok(sameAccount(c('claude', { email: 'a@example.invalid' }), c('codex', { email: 'a@example.invalid' })) === 'different', '1 a different harness ⇒ different, whatever the address');
ok(sameAccount(c('claude', { email: 'a@example.invalid' }, 'typo@example.invalid'), c('claude', { email: 'a@example.invalid' })) === 'unproven', '2 a row whose declared address differs from its folder\'s is NOBODY\'s twin — unproven, even beside its own folder\'s twin');
ok(R({ harness: 'claude', declared: 'typo@example.invalid', auth: { email: 'a@example.invalid' } }).conflict === true && R({ harness: 'claude', declared: 'A@Example.invalid', auth: { email: 'a@example.invalid' } }).conflict === false, '…the conflict is a DIFFERENT address, not a different case');
ok(sameAccount(c('claude', { seat: 's1', orgId: 'O1', email: 'a@example.invalid' }), c('claude', { seat: 's1', orgId: 'O1', email: 'b@example.invalid' })) === 'same' && sameAccount(c('claude', { seat: 's1', orgId: 'O1', email: 'a@example.invalid' }), c('claude', { seat: 's2', orgId: 'O1', email: 'a@example.invalid' })) === 'different', '3 both carry a seat ⇒ the seat decides alone (the same person in the same organisation ⇒ same; two persons ⇒ different, one address or not)');
ok(sameAccount(c('claude', { seat: 's1', orgId: 'O1' }), c('claude', { seat: 's1', orgId: 'O2' })) === 'different', '…a seat is the PAIR (person, organisation): one person in two organisations holds two seats ⇒ different');
ok(c('claude', { seat: 's1', email: 'a@example.invalid' }).seat === null, '…no organisation, no seat: a person\'s id alone is no seat');
ok(sameAccount(c('codex', { seat: 'a/b', orgId: 'c' }), c('codex', { seat: 'a', orgId: 'b/c' })) === 'different', '…the pair is compared PART BY PART (round wvjd20mpa (3)): a joined «a/b/c» would read both as one seat');
ok(sameAccount(c('codex', { seat: 'user-AbC1', orgId: 'ws-1' }), c('codex', { seat: 'user-abc1', orgId: 'ws-1' })) === 'different' && sameAccount(c('codex', { email: 'a@example.invalid', orgId: 'ws-A' }), c('codex', { email: 'a@example.invalid', orgId: 'ws-a' })) === 'different', '…a seat\'s and an organisation\'s id keep their CASE (codex user ids are mixed case): two ids that differ only in case are two');
ok(sameAccount(c('claude', { email: 'A@Example.invalid', orgId: 'O1' }), c('claude', { email: 'a@example.invalid', orgId: 'O1' })) === 'same' && sameAccount(c('claude', { email: 'a@example.invalid' }), c('claude', { email: 'b@example.invalid' })) === 'different', '4 both carry an address: one address (the ADDRESS alone case-folded) under ONE named organisation ⇒ same; two addresses ⇒ different');
ok(sameAccount(c('claude', { email: 'a@example.invalid', orgId: 'o1' }), c('claude', { email: 'a@example.invalid', orgId: 'o2' })) === 'different' && sameAccount(c('claude', { email: 'a@example.invalid', orgId: 'o1' }), c('claude', { email: 'a@example.invalid' })) === 'unproven', '…one address in two named organisations is two accounts; an organisation one row does not name ⇒ unproven (a false merge moves money, a missed one costs a turn)');
ok(sameAccount(c('claude', { orgId: 'o1' }), c('claude', { orgId: 'o1' })) === 'unproven' && sameAccount(c('claude', {}), c('claude', {})) === 'unproven', '5 an organisation alone (two seats of one Team look exactly like this), or nothing ⇒ unproven — never merged');
ok(sameAccount(c('claude', { seat: 's1', orgId: 'O1' }), c('claude', { email: 'a@example.invalid' })) === 'unproven', '…a seat on one side and an address on the other prove nothing together ⇒ unproven');
ok(sameAccount(null, c('claude', {})) === 'unproven', 'a missing record ⇒ unproven');
{ const typedOnly = (declared) => R({ harness: 'claude', declared, auth: { orgId: 'O1' } });   // a signed-out row: its folder names no address
  ok(typedOnly('typo-a@example.invalid').address === null && typedOnly('typo-a@example.invalid').conflict === false
    && sameAccount(typedOnly('typo-a@example.invalid'), c('claude', { email: 'a@example.invalid', orgId: 'O1' })) === 'unproven'
    && sameAccount(typedOnly('b@example.invalid'), c('claude', { email: 'b@example.invalid', orgId: 'O1' })) === 'unproven',
    'a TYPED address no folder confirms decides nothing — its typo splits no account, a colleague\'s address typed onto a signed-out row merges none (gate 1\'s find)'); }
// STRINGS ONLY, and nothing handed is no record (round wvjd20mpa (3), (4))
{ let threw = null, rs = [];
  try { rs = [R(null), R(), R('claude'), R(42)]; } catch (e) { threw = e.message; }
  ok(!threw && rs.every((x) => x === null), 'identityRecordOf with nothing handed (null, none, not an object) ⇒ null, never a throw', threw);
  const obj = c('claude', { seat: {}, orgId: {}, email: {} }), num = c('claude', { seat: 7, orgId: 7, email: 7 });
  ok([obj, num].every((x) => x.seat === null && x.org === null && x.address === null) && sameAccount(obj, c('claude', { seat: {}, orgId: {}, email: {} })) === 'unproven', 'STRINGS ONLY: an object or a number is no fact (two objects never read «same» as «[object Object]»)');
  ok(R({ harness: {}, auth: { email: 'a@example.invalid' } }).harness === null && R({ harness: 'claude', auth: 'not-an-object' }).address === null, '…a harness that is no string is none; facts that are no object are none'); }
ok(JSON.stringify(Object.keys(R({ harness: 'claude', declared: null, auth: { email: 'a@example.invalid', seat: 'S', orgId: 'O', accessToken: 'never-kept' } })).sort()) === JSON.stringify(['address', 'conflict', 'harness', 'org', 'seat']), 'the record carries exactly its five facts (nothing else of the folder\'s auth — no token)');

// ── THE LAWS over generated pairs (seeded): the truth is the generator's — over a module (the product's, or a planted copy) ──
const lawsOver = (mod) => {
  let seed = 0x87fd; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let n = 0; const id = (p) => `${p}${++n}`;
  const persons = new Map();   // ONE person per address (its id as the folder names it): one person holds a seat in each organisation
  const personOf = (m) => { if (!persons.has(m)) persons.set(m, id('Person-')); return persons.get(m); };
  const account = ({ org = undefined, address = undefined } = {}) => { const m = address === undefined ? `${id('u')}@example.invalid` : address; return { harness: 'claude', seat: personOf(m), address: m, org: org === undefined ? id('Org-') : org }; };
  // a ROW shows a subset of its account's facts; `declared` may be its own address (a backfill), a typo, the OTHER row's account's
  // address (a colleague's, typed onto it), or none
  const rowOf = (a, other) => {
    const showSeat = rnd() < 0.5, showAddr = rnd() < 0.7, showOrg = !!a.org && rnd() < 0.6;
    const d = rnd(); const declared = d < 0.12 ? `typo-${a.address}` : d < 0.2 ? other.address : d < 0.3 ? a.address.toUpperCase() : null;
    return { record: mod.identityRecordOf({ harness: a.harness, declared, auth: { ...(showSeat ? { seat: a.seat } : {}), ...(showAddr ? { email: a.address } : {}), ...(showOrg ? { orgId: a.org } : {}) } }), account: a };
  };
  const KINDS = [
    () => { const a = account(); return [a, a]; },                                        // one account in two rows
    () => { const o = id('Org-'); return [account({ org: o }), account({ org: o })]; },   // two seats of one organisation
    () => { const m = `${id('u')}@example.invalid`; return [account({ address: m }), account({ address: m })]; },   // one person (one address) in two organisations
    () => [account(), account()],                                                          // strangers
    () => { const a = account({ org: null }); return [a, a]; },                            // one account with no organisation
  ];
  const viol = { falseMerge: [], provenSplit: [], wrongUnproven: [] };
  let pairs = 0;
  for (let i = 0; i < 4000; i++) {
    const [ax, ay] = KINDS[i % KINDS.length]();
    const x = rowOf(ax, ay), y = rowOf(ay, ax);
    const truth = ax === ay ? 'same' : 'different';
    const v = mod.sameAccount(x.record, y.record);
    pairs++;
    const conflict = x.record.conflict || y.record.conflict;
    const fact = !conflict && ((x.record.seat && y.record.seat) || (x.record.address && y.record.address && x.record.org && y.record.org));
    if (v === 'same' && truth === 'different') viol.falseMerge.push(i);
    if (v === 'different' && truth === 'same') viol.provenSplit.push(i);
    if (v === 'unproven' && fact) viol.wrongUnproven.push(i);
    if (truth === 'same' && fact && v !== 'same') viol.provenSplit.push(i);
  }
  return { viol, pairs, KINDS };
};
const { viol, pairs, KINDS } = lawsOver({ identityRecordOf: R, sameAccount });
console.log(`  · ${pairs} generated pairs (5 kinds), seed 0x87fd — false merges ${viol.falseMerge.length}, proven splits ${viol.provenSplit.length}, «unproven» with a fact ${viol.wrongUnproven.length}`);
ok(viol.falseMerge.length === 0, 'NEVER A FALSE MERGE: «same» only for one account (no two seats, no one-address-two-organisations, no strangers)', viol.falseMerge.slice(0, 5).join(','));
ok(viol.provenSplit.length === 0, 'NEVER A PROVEN SPLIT: one account whose two rows both carry a seat, or both an address AND an organisation (no conflict), is «same»', viol.provenSplit.slice(0, 5).join(','));
ok(viol.wrongUnproven.length === 0, '«UNPROVEN» ONLY WITHOUT A FACT: a conflict, or neither a shared seat nor a shared address with both organisations named', viol.wrongUnproven.slice(0, 5).join(','));
// the generator's own premises (laws that cannot fail prove nothing)
{ const one = KINDS[0](), two = KINDS[1](), addr = KINDS[2]();
  ok(one[0] === one[1] && two[0].org === two[1].org && two[0].seat !== two[1].seat && addr[0].address === addr[1].address && addr[0].seat === addr[1].seat && addr[0].org !== addr[1].org, 'the generator draws one account in two rows, two seats of one organisation, and ONE person (one address, one person id) in two organisations'); }
// RED CONTROLS — the laws CAN fail, each a planted copy of the module through the same laws
const plantedModule = (anchor, to, name) => { const src = fs.readFileSync(path.join(REPO, 'src/account-identity.js'), 'utf8'); const planted = anchored(src, anchor, to, name); const m = { exports: {} }; new Function('module', 'exports', planted)(m, m.exports); return m.exports; };
{ const v2 = lawsOver(plantedModule('    address: folderAddress,\n', '    address: typed || folderAddress,\n', 'the typed-first address (RED control)')).viol;
  ok(v2.provenSplit.length > 0, `RED CONTROL (refinement a): the typed-first copy breaks «never a proven split» (${v2.provenSplit.length} pairs; false merges ${v2.falseMerge.length})`, { split: v2.provenSplit.length, merge: v2.falseMerge.length }); }
{ const v3 = lawsOver(plantedModule("    if (x.org && y.org) return x.org === y.org ? 'same' : 'different';\n    return 'unproven';\n", "    return 'same';\n", '«one address is the same account» (RED control)')).viol;
  ok(v3.falseMerge.length > 0, `RED CONTROL (refinement b, round wvjd20mpa (6)): a copy where ONE ADDRESS IS THE SAME ACCOUNT breaks «never a false merge» (${v3.falseMerge.length} pairs: one address in two organisations)`, v3.falseMerge.length); }

// ── WHO A SIGN-IN FOLDER IS SIGNED IN AS: the harnesses' own readers over folders written as their CLIs write them ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acid-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const PERSON = '0000a001-0000-4000-8000-00000000a001', ORG = '0000b001-0000-4000-8000-00000000b001', ORG2 = '0000b002-0000-4000-8000-00000000b002';   // made up
const PERSON_Y = '0000a002-0000-4000-8000-00000000a002';
let dn = 0; const folder = () => path.join(TMP, `f${++dn}`);
const claudeLogin = (dir, { email = 'p1@example.invalid', person = PERSON, org = ORG, token = true, refresh = true, credEmail = null, mark = false } = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { ...(token ? { accessToken: 'at-acid' } : {}), ...(token && refresh ? { refreshToken: 'rt-acid' } : {}), expiresAt: Date.now() + 3600e3, ...(credEmail ? { email: credEmail } : {}) }, ...(mark ? { vibespaceOat: { id: 'made-up' } } : {}) }));
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, ...(person !== null ? { accountUuid: person } : {}), ...(org !== null ? { organizationUuid: org, organizationName: 'Org A' } : {}) } }));
  return dir;
};
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const codexLogin = (dir, { email = 'c1@example.invalid', user = 'user-acid1', ws = 'ws-acid1', userKey = 'chatgpt_user_id', idToken = true } = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  const claims = { email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro', ...(user !== null ? { [userKey]: user } : {}), ...(ws !== null ? { chatgpt_account_id: ws } : {}) } };
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a-acid', ...(idToken ? { id_token: jwt(claims) } : {}) } }));
  return dir;
};
const rd = { facts: (p) => { const st = fs.statSync(p); return { text: fs.readFileSync(p, 'utf8'), mtimeMs: st.mtimeMs, size: st.size }; }, readText: (p) => fs.readFileSync(p, 'utf8') };   // a plain reader (run-reads' shape)
const { get: harnessOf } = require(path.join(REPO, 'src/harnesses'));
const CL = harnessOf('claude').creds, CX = harnessOf('codex').creds;
const rec = (h, f) => R({ harness: h, declared: null, auth: f });
ok(typeof CL.folderIdentityOf === 'function' && typeof CX.folderIdentityOf === 'function', 'claude and codex each declare folderIdentityOf on their creds descriptor');
{ const d1 = claudeLogin(folder()), f1 = CL.folderIdentityOf(d1, rd);
  ok(f1 && f1.email === 'p1@example.invalid' && f1.seat === PERSON && f1.orgId === ORG, 'claude: the folder\'s .claude.json oauthAccount names the person and the organisation — kept apart', f1);
  ok(CL.folderIdentityOf(d1) === null && CL.folderIdentityOf(d1, null) === null, 'claude: NO DEFAULT READER — without the handed snapshot ⇒ null (never a synchronous read of the folder)');
  const f2 = CL.folderIdentityOf(claudeLogin(folder(), { org: null }), rd);
  ok(f2 && f2.orgId === null && rec('claude', f2).seat === null && f2.email === 'p1@example.invalid', 'claude: a record naming no organisation names NO seat in the record (the address stays)', f2);
  ok(CL.folderIdentityOf(claudeLogin(folder(), { token: false }), rd) === null && CL.folderIdentityOf(folder(), rd) === null, 'claude: no sign-in (no token, or no folder) ⇒ null — no claim');
  const same = CL.folderIdentityOf(claudeLogin(folder()), rd), other = CL.folderIdentityOf(claudeLogin(folder(), { org: ORG2 }), rd);
  ok(sameAccount(rec('claude', f1), rec('claude', same)) === 'same' && sameAccount(rec('claude', f1), rec('claude', other)) === 'different', 'claude: one login in two folders ⇒ same; ONE person in two organisations ⇒ two seats ⇒ different');
  // (5) A CONFIG NAMING ANOTHER LOGIN THAN THE CREDENTIALS DO
  const mis = CL.folderIdentityOf(claudeLogin(folder(), { credEmail: 'cred@example.invalid' }), rd);
  ok(mis && mis.email === 'cred@example.invalid' && mis.seat === null && mis.orgId === null, 'claude (round wvjd20mpa (5)): the credentials\' own address and the config\'s differ ⇒ the config is another login\'s: NO seat, NO organisation (the credentials\' address stays)', mis);
  const caseOnly = CL.folderIdentityOf(claudeLogin(folder(), { credEmail: 'P1@Example.invalid' }), rd);
  ok(caseOnly && caseOnly.seat === PERSON && caseOnly.orgId === ORG, '…the same address in another case is the same login (the seat stays)', caseOnly);
  // (5) A LONG-LIVED TOKEN beside an old login's config: ours (the mark) or one pasted — no refresh token, no seat from the config
  const ours = CL.folderIdentityOf(claudeLogin(folder(), { refresh: false, mark: true, person: PERSON_Y }), rd), pasted = CL.folderIdentityOf(claudeLogin(folder(), { refresh: false, person: PERSON_Y }), rd);
  const realY = CL.folderIdentityOf(claudeLogin(folder(), { person: PERSON_Y }), rd);
  ok(ours === null && pasted === null && sameAccount(rec('claude', ours), rec('claude', realY)) === 'unproven', 'claude (round wvjd20mpa (5)): a long-lived token (ours, or pasted) names no seat from the config — beside an old login of Y it is NOT «same» as Y (the false merge this row ends)', { ours, pasted });
  // malformed: not JSON, ids that are no strings, a file the keeper refused (E2BIG) ⇒ null or no id, never a throw
  const badCreds = folder(); fs.mkdirSync(badCreds, { recursive: true }); fs.writeFileSync(path.join(badCreds, '.credentials.json'), '{not json');
  const badCfg = claudeLogin(folder()); fs.writeFileSync(path.join(badCfg, '.claude.json'), 'not json either');
  const badIds = CL.folderIdentityOf(claudeLogin(folder(), { person: 42, org: { x: 1 } }), rd);
  const e2big = { facts: () => { throw Object.assign(new Error('too large'), { code: 'E2BIG' }); }, readText: () => { throw Object.assign(new Error('too large'), { code: 'E2BIG' }); } };
  let threw = null, got = [];
  try { got = [CL.folderIdentityOf(badCreds, rd), CL.folderIdentityOf(badCfg, rd), CL.folderIdentityOf(d1, e2big)]; } catch (e) { threw = e.message; }
  ok(!threw && got.every((x) => x === null) && badIds && badIds.seat === null && badIds.orgId === null && badIds.email === 'p1@example.invalid', 'claude: malformed files (not JSON), a refused file (E2BIG) ⇒ null; ids that are no strings ⇒ no seat, no organisation — never a throw', { threw, got, badIds });
  const pa = JSON.stringify(CL.parseAuth(d1, rd));
  ok(JSON.parse(pa).loggedIn === true && !pa.includes(PERSON) && !pa.includes(ORG), 'claude: parseAuth\'s answer (finalize spreads it to the person\'s page) carries neither id', pa); }
{ const d1 = codexLogin(folder()), f1 = CX.folderIdentityOf(d1, rd);
  ok(f1 && f1.email === 'c1@example.invalid' && f1.seat === 'user-acid1' && f1.orgId === 'ws-acid1', 'codex: the id_token names the ChatGPT user and its workspace — kept apart', f1);
  ok(CX.folderIdentityOf(d1) === null, 'codex: NO DEFAULT READER — without the handed snapshot ⇒ null (never a synchronous read of the folder)');
  ok(CX.folderIdentityOf(codexLogin(folder(), { userKey: 'user_id' }), rd).seat === 'user-acid1', 'codex: user_id when the token has no chatgpt_user_id');
  const f3 = CX.folderIdentityOf(codexLogin(folder(), { ws: null }), rd);
  ok(f3 && f3.orgId === null && rec('codex', f3).seat === null, 'codex: a token naming no workspace names NO seat in the record', f3);
  ok(CX.folderIdentityOf(codexLogin(folder(), { idToken: false }), rd) === null, 'codex: no id_token ⇒ null — no person named');
  const badJson = folder(); fs.mkdirSync(badJson, { recursive: true }); fs.writeFileSync(path.join(badJson, 'auth.json'), '{not json');
  const badTok = folder(); fs.mkdirSync(badTok, { recursive: true }); fs.writeFileSync(path.join(badTok, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a', id_token: 'not-a-token' } }));
  const numTok = folder(); fs.mkdirSync(numTok, { recursive: true }); fs.writeFileSync(path.join(numTok, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a', id_token: 5 } }));
  const badIds = CX.folderIdentityOf(codexLogin(folder(), { user: 7, ws: { x: 1 } }), rd);
  let threw = null, got = [];
  try { got = [CX.folderIdentityOf(badJson, rd), CX.folderIdentityOf(badTok, rd), CX.folderIdentityOf(numTok, rd)]; } catch (e) { threw = e.message; }
  ok(!threw && got.every((x) => x === null) && badIds && badIds.seat === null && badIds.orgId === null && badIds.email === 'c1@example.invalid', 'codex: a file that is not JSON, a token that is no JWT (or no string) ⇒ null; ids that are no strings ⇒ no seat, no workspace — never a throw', { threw, got, badIds });
  const pa = JSON.stringify(CX.parseAuth(d1, rd));
  ok(JSON.parse(pa).loggedIn === true && !pa.includes('user-acid1') && !pa.includes('ws-acid1'), 'codex: parseAuth\'s answer carries neither id', pa); }

// ── ONE PARSE A LANDING (round wvjd20mpa (1)): the kept facts' landing parses the folder's settings text ONCE — the harness's parse and
// its identity read share it (that file grows with a folder's history: megabytes on an old one)
{ const DISPLAY = require(path.join(REPO, 'src/account-display-facts.js'));
  const door = { call: async (op, a) => { if (op === 'stat') { const st = fs.statSync(a.path); return { isFile: st.isFile(), mtimeMs: st.mtimeMs, size: st.size }; } if (op === 'readText') return fs.readFileSync(a.path, 'utf8'); throw new Error(`no ${op} here`); } };
  const K = DISPLAY.create({ safeFs: () => door });
  const dir = claudeLogin(folder());   // the credentials carry no address: parseClaudeAuth opens the settings file too
  const cfgText = fs.readFileSync(path.join(dir, '.claude.json'), 'utf8');
  const countParses = async (fn) => { let n = 0; const P = JSON.parse; JSON.parse = function (s, ...rest) { if (s === cfgText) n++; return P.call(this, s, ...rest); }; try { await fn(); } finally { JSON.parse = P; } return n; };
  const landing = await countParses(() => K.refresh(dir, CL.displayFiles(dir), (r) => CL.parseAuth(dir, r), { keep: CL.displayKeep, identity: (r) => CL.folderIdentityOf(dir, r) }));
  const two = await countParses(async () => { CL.parseAuth(dir, rd); CL.folderIdentityOf(dir, rd); });
  const ident = K.identityOf(dir);
  ok(landing === 1 && ident && ident.seat === PERSON && K.get(dir).auth.email === 'p1@example.invalid', `ONE PARSE A LANDING: the settings text parsed ${landing} time(s) while parseAuth AND folderIdentityOf both read it (the landing's reader shares its parse)`, { landing, ident: !!ident });
  ok(two === 2, `RED CONTROL: the same two readers over a reader with no shared parse parse it ${two} times — the count above would see a second one`, two); }

// ── THE DECISION ROAD: a real AccountManager, rows signed in and finished the product's way, the kept facts settled ──
{ const AccountManager = (() => { const m = require(path.join(REPO, 'src/accounts.js')); return m.AccountManager || m; })();
  const pushes = [];
  const am = new AccountManager({ dataDir: path.join(TMP, 'data'), onChange: (rows) => { try { pushes.push(JSON.stringify(rows)); } catch { } } });
  const row = (opts) => { const id = am.createSubscription({}).id; claudeLogin(am.subDir(id), opts); return { id, fin: am.finalizeSubscription(id) }; };
  const a1 = row(), a2 = row(), a3 = row({ org: ORG2 }), a4 = row();
  am.setEmail(a4.id, 'typo@example.invalid');   // the person typed another address: nobody's twin until resolved
  const a5 = am.createSubscription({}).id;      // never signed in
  const cx = am.createCodexSubscription({}).id;  // a CODEX row through the product (round wvjd20mpa (6))
  codexLogin(am.codexSubDir(cx), { email: 'c9@example.invalid', user: 'user-AcId9', ws: 'ws-AcId9' });
  const cxFin = am.finalizeCodexSubscription(cx);
  await am.signinFactsSettled(null, { withinMs: 0 });
  const r = (id, o) => am.identityRecordOf(id, o);
  ok(r(a1.id) && r(a1.id).seat === PERSON && r(a1.id).org === ORG && r(a1.id).harness === 'claude', 'AccountManager.identityRecordOf: the row\'s record — its folder\'s person and organisation read with the kept facts, its harness', r(a1.id) && Object.keys(r(a1.id)));
  ok(sameAccount(r(a1.id), r(a2.id)) === 'same' && sameAccount(r(a1.id), r(a3.id)) === 'different' && sameAccount(r(a1.id), r(a4.id)) === 'unproven' && r(a4.id).conflict === true, 'through the product: one login in two rows ⇒ same; one person in two organisations ⇒ different; a declared address ≠ the folder\'s ⇒ unproven (conflict)');
  ok(r(cx) && r(cx).harness === 'codex' && r(cx).seat === 'user-AcId9' && r(cx).org === 'ws-AcId9' && r(cx).address === 'c9@example.invalid' && sameAccount(r(cx), r(a1.id)) === 'different', 'a CODEX row through the product: its id_token\'s user and workspace (their case kept), its address — and never «same» as a claude row', r(cx) && Object.keys(r(cx)));
  ok(r(a5) && r(a5).seat === null && r(a5).address === null && sameAccount(r(a5), r(a1.id)) === 'unproven', 'a row never signed in has no fact ⇒ unproven');
  let threw = null, none = 'unset';
  try { none = am.identityRecordOf(); } catch (e) { threw = e.message; }
  ok(r('no-such-row') === null && !threw && none === null && r(a1.id, { since: Date.now() + 60e3 }) === null, 'no claim (null, never a throw) for nothing handed, a gone row, or facts not confirmed within the decider\'s bound (the decision road)', threw);
  // THE IDS STAY IN MEMORY (r1477's standing word): nothing the product shows or sends carries a seat's or an organisation's id
  await am.displaySettled();
  const shown = [JSON.stringify(am.list()), JSON.stringify(am.decisionList({ withinMs: 60e3 })), JSON.stringify(am.rowOf(a1.id)), JSON.stringify(am.rowOf(cx)), JSON.stringify(am.signinFacts(a1.id, { withinMs: 60e3 })), JSON.stringify(am.signinFacts(cx, { withinMs: 60e3 })),
    JSON.stringify(a1.fin), JSON.stringify(a3.fin), JSON.stringify(cxFin), JSON.stringify(am._display.get(am._acctDir('claude', a1.id))), JSON.stringify(am._display.get(am._acctDir('codex', cx))), ...pushes].join('\n');
  const ids = [PERSON, ORG, ORG2, 'user-AcId9', 'ws-AcId9'];
  ok(JSON.stringify(r(a1.id)).includes(PERSON) && JSON.stringify(r(a3.id)).includes(ORG2) && JSON.stringify(r(cx)).includes('ws-AcId9'), 'premise: the records themselves hold the ids (the search below would see them)');
  ok(!ids.some((v) => shown.includes(v)), `THE IDS STAY IN MEMORY: no list row, decision row, signinFacts answer, finalize answer (claude and codex), kept-facts answer or accounts push (${pushes.length}) carries a seat or organisation id`, ids.filter((v) => shown.includes(v)));
  ok(!('identity' in am._display.get(am._acctDir('claude', a1.id))), 'the keeper\'s get() answer has no identity field (identityOf is its own accessor)');
  am.close(); }

// PURE: the module imports nothing and opens nothing
{ const src = fs.readFileSync(path.join(REPO, 'src/account-identity.js'), 'utf8');
  ok(!/\brequire\(|^\s*import\s/m.test(src) && !/\bfs\.|process\.env/.test(src), 'PURE: src/account-identity.js imports nothing, reads no file, no environment'); }
report();
