#!/usr/bin/env node
// THE IDENTITY's ONE RECORD AND ONE COMPARISON (row B-87fd, unit 2 — src/account-identity.js, PURE). The step order, the conflict
// rule (r1477 [1]: a declared address that differs from the folder's is nobody's twin), and the laws over generated pairs whose
// TRUTH the generator knows — never a FALSE MERGE, never a PROVEN SPLIT, «unproven» only where no fact can tell. Every fact here is
// made up (example.invalid addresses, generated ids): a seat's or an organisation's id and a compared address are never a real one's.
// THE FOLDER's READ (commit 2): each harness's folderIdentityOf over a sign-in folder as its CLI writes it, the kept facts' landing
// and AccountManager.identityRecordOf on the decision road — and the ids never leave memory (no row, push, finalize answer).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113); anchored(): the red control's one edit, by its anchor
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const { identityRecordOf: R, sameAccount } = require(path.join(REPO, 'src/account-identity.js'));

// ── THE STEP ORDER, case by case ──
const c = (h, auth, declared = null) => R({ harness: h, declared, auth });
ok(sameAccount(c('claude', { email: 'a@example.invalid' }), c('codex', { email: 'a@example.invalid' })) === 'different', '1 a different harness ⇒ different, whatever the address');
ok(sameAccount(c('claude', { email: 'a@example.invalid' }, 'typo@example.invalid'), c('claude', { email: 'a@example.invalid' })) === 'unproven', '2 a row whose declared address differs from its folder\'s is NOBODY\'s twin — unproven, even beside its own folder\'s twin');
ok(R({ harness: 'claude', declared: 'typo@example.invalid', auth: { email: 'a@example.invalid' } }).conflict === true && R({ harness: 'claude', declared: 'A@Example.invalid', auth: { email: 'a@example.invalid' } }).conflict === false, '…the conflict is a DIFFERENT address, not a different case');
ok(sameAccount(c('claude', { seat: 's1', email: 'a@example.invalid' }), c('claude', { seat: 's1', email: 'b@example.invalid' })) === 'same' && sameAccount(c('claude', { seat: 's1', email: 'a@example.invalid' }), c('claude', { seat: 's2', email: 'a@example.invalid' })) === 'different', '3 both carry a seat ⇒ the seat decides alone (same seat ⇒ same; two seats ⇒ different, one address or not)');
ok(sameAccount(c('claude', { email: 'A@Example.invalid', orgId: 'O1' }), c('claude', { email: 'a@example.invalid', orgId: 'o1' })) === 'same' && sameAccount(c('claude', { email: 'a@example.invalid' }), c('claude', { email: 'b@example.invalid' })) === 'different', '4 both carry an address: one address under ONE named organisation ⇒ same (case-folded); two addresses ⇒ different');
ok(sameAccount(c('claude', { email: 'a@example.invalid', orgId: 'o1' }), c('claude', { email: 'a@example.invalid', orgId: 'o2' })) === 'different' && sameAccount(c('claude', { email: 'a@example.invalid', orgId: 'o1' }), c('claude', { email: 'a@example.invalid' })) === 'unproven', '…one address in two named organisations is two accounts; an organisation one row does not name ⇒ unproven (a false merge moves money, a missed one costs a turn — r1477 [1])');
ok(sameAccount(c('claude', { orgId: 'o1' }), c('claude', { orgId: 'o1' })) === 'unproven' && sameAccount(c('claude', {}), c('claude', {})) === 'unproven', '5 an organisation alone (two seats of one Team look exactly like this), or nothing ⇒ unproven — never merged');
ok(sameAccount(c('claude', { seat: 's1' }), c('claude', { email: 'a@example.invalid' })) === 'unproven', '…a seat on one side and an address on the other prove nothing together ⇒ unproven');
ok(sameAccount(null, c('claude', {})) === 'unproven', 'a missing record ⇒ unproven');
{ const typedOnly = (declared) => R({ harness: 'claude', declared, auth: { orgId: 'O1' } });   // a signed-out row: its folder names no address
  ok(typedOnly('typo-a@example.invalid').address === null && typedOnly('typo-a@example.invalid').conflict === false
    && sameAccount(typedOnly('typo-a@example.invalid'), c('claude', { email: 'a@example.invalid', orgId: 'O1' })) === 'unproven'
    && sameAccount(typedOnly('b@example.invalid'), c('claude', { email: 'b@example.invalid', orgId: 'O1' })) === 'unproven',
    'a TYPED address no folder confirms decides nothing — its typo splits no account, a colleague\'s address typed onto a signed-out row merges none (gate 1\'s find)'); }
ok(JSON.stringify(Object.keys(R({ harness: 'claude', declared: null, auth: { email: 'a@example.invalid', seat: 'S', orgId: 'O', accessToken: 'never-kept' } })).sort()) === JSON.stringify(['address', 'conflict', 'harness', 'org', 'seat']), 'the record carries exactly its five facts (nothing else of the folder\'s auth — no token)');

// ── THE LAWS over generated pairs (seeded): the truth is the generator's — over a module (the product's, or a planted copy) ──
const lawsOver = (mod) => {
  let seed = 0x87fd; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let n = 0; const id = (p) => `${p}${++n}`;
  const account = ({ org = undefined, address = undefined } = {}) => ({ harness: 'claude', seat: id('seat-'), address: address === undefined ? `${id('u')}@example.invalid` : address, org: org === undefined ? id('org-') : org });
  // a ROW shows a subset of its account's facts; `declared` may be its own address (a backfill), a typo, the OTHER row's account's
  // address (a colleague's, typed onto it), or none
  const rowOf = (a, other) => {
    const showSeat = rnd() < 0.5, showAddr = rnd() < 0.7, showOrg = !!a.org && rnd() < 0.6;
    const d = rnd(); const declared = d < 0.12 ? `typo-${a.address}` : d < 0.2 ? other.address : d < 0.3 ? a.address.toUpperCase() : null;
    return { record: mod.identityRecordOf({ harness: a.harness, declared, auth: { ...(showSeat ? { seat: a.seat } : {}), ...(showAddr ? { email: a.address } : {}), ...(showOrg ? { orgId: a.org } : {}) } }), account: a };
  };
  const KINDS = [
    () => { const a = account(); return [a, a]; },                                        // one account in two rows
    () => { const o = id('org-'); return [account({ org: o }), account({ org: o })]; },   // two seats of one organisation
    () => { const m = `${id('u')}@example.invalid`; return [account({ address: m }), account({ address: m })]; },   // one address in two organisations
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
  ok(one[0] === one[1] && two[0].org === two[1].org && two[0].seat !== two[1].seat && addr[0].address === addr[1].address && addr[0].org !== addr[1].org, 'the generator draws one account in two rows, two seats of one organisation and one address in two organisations'); }
// ── WHO A SIGN-IN FOLDER IS SIGNED IN AS (commit 2): the harnesses' own readers over folders written as their CLIs write them ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acid-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const PERSON = '0000a001-0000-4000-8000-00000000a001', ORG = '0000b001-0000-4000-8000-00000000b001', ORG2 = '0000b002-0000-4000-8000-00000000b002';   // made up
let dn = 0; const folder = () => path.join(TMP, `f${++dn}`);
const claudeLogin = (dir, { email = 'p1@example.invalid', person = PERSON, org = ORG, token = true, credEmail = null } = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { ...(token ? { accessToken: 'at-acid', refreshToken: 'rt-acid' } : {}), expiresAt: Date.now() + 3600e3, ...(credEmail ? { email: credEmail } : {}) } }));
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, ...(person ? { accountUuid: person } : {}), ...(org ? { organizationUuid: org, organizationName: 'Org A' } : {}) } }));
  return dir;
};
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const codexLogin = (dir, { email = 'c1@example.invalid', user = 'user-acid1', ws = 'ws-acid1', userKey = 'chatgpt_user_id', idToken = true } = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  const claims = { email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro', ...(user ? { [userKey]: user } : {}), ...(ws ? { chatgpt_account_id: ws } : {}) } };
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a-acid', ...(idToken ? { id_token: jwt(claims) } : {}) } }));
  return dir;
};
const rd = { facts: (p) => { const st = fs.statSync(p); return { text: fs.readFileSync(p, 'utf8'), mtimeMs: st.mtimeMs, size: st.size }; }, readText: (p) => fs.readFileSync(p, 'utf8') };   // a plain reader (run-reads' shape)
const { get: harnessOf } = require(path.join(REPO, 'src/harnesses'));
const CL = harnessOf('claude').creds, CX = harnessOf('codex').creds;
ok(typeof CL.folderIdentityOf === 'function' && typeof CX.folderIdentityOf === 'function', 'claude and codex each declare folderIdentityOf on their creds descriptor');
{ const d1 = claudeLogin(folder()), f1 = CL.folderIdentityOf(d1, rd);
  ok(f1 && f1.email === 'p1@example.invalid' && f1.seat === `${PERSON}/${ORG}` && f1.orgId === ORG, 'claude: the folder\'s .claude.json oauthAccount names the seat — the person\'s account IN its organisation', f1);
  const f2 = CL.folderIdentityOf(claudeLogin(folder(), { org: null }), rd);
  ok(f2 && f2.seat === null && f2.orgId === null && f2.email === 'p1@example.invalid', 'claude: a record naming no organisation names NO seat (the address stays)', f2);
  ok(CL.folderIdentityOf(claudeLogin(folder(), { token: false }), rd) === null && CL.folderIdentityOf(folder(), rd) === null, 'claude: no sign-in (no token, or no folder) ⇒ null — no claim');
  ok(CL.folderIdentityOf(claudeLogin(folder(), { credEmail: 'cred@example.invalid' }), rd).email === 'cred@example.invalid', 'claude: the credentials\' own address first, as parseClaudeAuth reads it');
  const same = CL.folderIdentityOf(claudeLogin(folder()), rd), other = CL.folderIdentityOf(claudeLogin(folder(), { org: ORG2 }), rd);
  const rec = (f) => R({ harness: 'claude', declared: null, auth: f });
  ok(sameAccount(rec(f1), rec(same)) === 'same' && sameAccount(rec(f1), rec(other)) === 'different', 'claude: one login in two folders ⇒ same; ONE person in two organisations ⇒ two seats ⇒ different');
  const pa = JSON.stringify(CL.parseAuth(d1, rd));
  ok(JSON.parse(pa).loggedIn === true && !pa.includes(PERSON) && !pa.includes(ORG), 'claude: parseAuth\'s answer (finalize spreads it to the person\'s page) carries neither id', pa); }
{ const d1 = codexLogin(folder()), f1 = CX.folderIdentityOf(d1, rd);
  ok(f1 && f1.email === 'c1@example.invalid' && f1.seat === 'user-acid1/ws-acid1' && f1.orgId === 'ws-acid1', 'codex: the id_token names the seat — the ChatGPT user IN its workspace', f1);
  ok(CX.folderIdentityOf(codexLogin(folder(), { userKey: 'user_id' }), rd).seat === 'user-acid1/ws-acid1', 'codex: user_id when the token has no chatgpt_user_id');
  const f3 = CX.folderIdentityOf(codexLogin(folder(), { ws: null }), rd);
  ok(f3 && f3.seat === null && f3.orgId === null, 'codex: a token naming no workspace names NO seat', f3);
  ok(CX.folderIdentityOf(codexLogin(folder(), { idToken: false }), rd) === null, 'codex: no id_token ⇒ null — no person named');
  const pa = JSON.stringify(CX.parseAuth(d1, rd));
  ok(JSON.parse(pa).loggedIn === true && !pa.includes('user-acid1') && !pa.includes('ws-acid1'), 'codex: parseAuth\'s answer carries neither id', pa); }

// ── THE DECISION ROAD: a real AccountManager, rows signed in and finished the product's way, the kept facts settled ──
{ const AccountManager = (() => { const m = require(path.join(REPO, 'src/accounts.js')); return m.AccountManager || m; })();
  const pushes = [];
  const am = new AccountManager({ dataDir: path.join(TMP, 'data'), onChange: (rows) => { try { pushes.push(JSON.stringify(rows)); } catch { } } });
  const row = (opts) => { const id = am.createSubscription({}).id; claudeLogin(am.subDir(id), opts); return { id, fin: am.finalizeSubscription(id) }; };
  const a1 = row(), a2 = row(), a3 = row({ org: ORG2 }), a4 = row();
  am.setEmail(a4.id, 'typo@example.invalid');   // the person typed another address: nobody's twin until resolved
  const a5 = am.createSubscription({}).id;      // never signed in
  await am.signinFactsSettled(null, { withinMs: 0 });
  const r = (id, o) => am.identityRecordOf(id, o);
  ok(r(a1.id) && r(a1.id).seat === `${PERSON}/${ORG}`.toLowerCase() && r(a1.id).harness === 'claude', 'AccountManager.identityRecordOf: the row\'s record — its folder\'s seat read with the kept facts, its harness', r(a1.id) && Object.keys(r(a1.id)));
  ok(sameAccount(r(a1.id), r(a2.id)) === 'same' && sameAccount(r(a1.id), r(a3.id)) === 'different' && sameAccount(r(a1.id), r(a4.id)) === 'unproven' && r(a4.id).conflict === true, 'through the product: one login in two rows ⇒ same; one person in two organisations ⇒ different; a declared address ≠ the folder\'s ⇒ unproven (conflict)');
  ok(r(a5) && r(a5).seat === null && r(a5).address === null && sameAccount(r(a5), r(a1.id)) === 'unproven', 'a row never signed in has no fact ⇒ unproven');
  ok(r('no-such-row') === null && r(a1.id, { since: Date.now() + 60e3 }) === null, 'no claim (null) for a gone row, or facts not confirmed within the decider\'s bound (the decision road)');
  // THE IDS STAY IN MEMORY (r1477's standing word): nothing the product shows or sends carries a seat's or an organisation's id
  await am.displaySettled();
  const shown = [JSON.stringify(am.list()), JSON.stringify(am.decisionList({ withinMs: 60e3 })), JSON.stringify(am.rowOf(a1.id)), JSON.stringify(am.signinFacts(a1.id, { withinMs: 60e3 })), JSON.stringify(a1.fin), JSON.stringify(a3.fin), JSON.stringify(am._display.get(am._acctDir('claude', a1.id))), ...pushes].join('\n');
  const ids = [PERSON, ORG, ORG2];
  ok(JSON.stringify(r(a1.id)).includes(PERSON) && JSON.stringify(r(a3.id)).includes(ORG2), 'premise: the record itself holds the ids (the search below would see them)');
  ok(!ids.some((v) => shown.includes(v)), `THE IDS STAY IN MEMORY: no list row, decision row, signinFacts answer, finalize answer, kept-facts answer or accounts push (${pushes.length}) carries a seat or organisation id`, ids.filter((v) => shown.includes(v)).length);
  ok(!('identity' in am._display.get(am._acctDir('claude', a1.id))), 'the keeper\'s get() answer has no identity field (identityOf is its own accessor)');
  am.close(); }

// RED CONTROL — the laws CAN fail: a planted copy whose address is the TYPED one first (the shape as first said) splits one account
// on a typo no folder can check (and may merge two on a colleague's address typed onto a signed-out row)
{ const src = fs.readFileSync(path.join(REPO, 'src/account-identity.js'), 'utf8');
  const planted = anchored(src, '    address: folderAddress,\n', '    address: typed || folderAddress,\n', 'the typed-first address (RED control)');
  const m = { exports: {} }; new Function('module', 'exports', planted)(m, m.exports);
  const v2 = lawsOver(m.exports).viol;
  ok(planted !== src && v2.provenSplit.length > 0, `RED CONTROL: the typed-first copy breaks «never a proven split» (${v2.provenSplit.length} pairs; false merges ${v2.falseMerge.length})`, { split: v2.provenSplit.length, merge: v2.falseMerge.length }); }
// PURE: the module imports nothing and opens nothing
{ const src = fs.readFileSync(path.join(REPO, 'src/account-identity.js'), 'utf8');
  ok(!/\brequire\(|^\s*import\s/m.test(src) && !/\bfs\.|process\.env/.test(src), 'PURE: src/account-identity.js imports nothing, reads no file, no environment'); }
report();
