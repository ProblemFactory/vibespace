#!/usr/bin/env node
// test-automation-keys — FAST (in-process: PURE + the engine over a REAL vault engine and For-you store + the doors on a
// loopback express app). Design q-046 L1 (lane automation-keys-core; the owner 2026-10-19: VibeSpace's own automation keys,
// sealed in the vault, GRANTED per key × subject, never a value in an agent's hands).
//   ① the closed table, the record and grant shapes (named fields only — a planted `value` never survives)
//   ② THE VERDICT TABLE — every code (vault_locked · not_granted · key_revoked · verb_not_in_scope · subject_ended ·
//      once_spent) + ok (always / once / a Task Group's grant) + the external / internal wall (a generated property)
//   ③ MUTANT: a verdict that ignores revokedAt ⇒ RED · ④ MUTANT: an `external` caller judged by internal grants ⇒ RED
//   ⑤ mintPlan: the value / its digest never equal, the record holds no value, bad names / verbs refused
//   ⑥ pickKey: a granted key wins, the ONE scoped key is asked for, several ⇒ key_ambiguous, a named key
//   ⑦ THE ENGINE (a real vault, a real For-you store): mint (the value sealed as apikey:<id>, never returned, in no file),
//      the first-use card (urgent, origin vault, ONE per pair, 60 s) · once / always / deny / quiet / expiry / closed by
//      another door · revoke (the entry leaves the vault) · the lock answers every waiting call 423 · ONE audit line a use
//   ⑧ THE DOORS (loopback): an agent's vsst_ calls, a job's jbt_ ⇒ session_only, every owner door refuses a bearer
//      (human_only) — no agent route writes a grant; locked ⇒ 423
//   ⑨ THE RENAME SEAM (src/server/conversation-ops.js — the ws case's body, moved whole) + the verb's REACH
//   ⑩ wiring pins
//   ⑪ THE LIMITS (lane automation-open-limits — the q-048 verify's M2): openLimitsVerdict's table over real folders (each
//      field's code; `/`, `/tmp/../etc`, `..` out, a link out, a prefix sibling ⇒ cwd_outside_roots; a link in ⇒ its real
//      path), limits: null = the old behaviour, a damaged value narrows, limitsPlan's named refusals · ⑪b MUTANTS (a
//      lexical-only check, a slash-less prefix) ⇒ RED
//   ⑫ THE JUDGE on the engine over the REAL conversation-ops seam: outside ⇒ refused + audited, the spend guard never
//      asked, nothing spawned, a once-grant unspent, no card; inside ⇒ authorize → spawn (the REAL folder) → note; the
//      default account judged; limits edited while a card waits; the old key = old behaviour until the first edit ·
//      ⑫b MUTANT: the judge after the authorizer ⇒ the refused open was CHARGED ⇒ RED
//   ⑬ the doors (mint with limits, 边界… / 审计… person-only, the agent's refusal names the limits) · ⑭ window + CLI pins
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = (rel) => require(path.join(ROOT, rel));
const A = R('src/automation-keys.js');
const ENG = R('src/server/automation-engine.js');
const VE = R('src/server/vault-engine.js');
const { UserTodoManager } = R('src/user-todos.js');
const OPS = R('src/server/conversation-ops.js');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const M = mutantCopies('automation-keys', ROOT);
const SRC = fs.readFileSync(path.join(ROOT, 'src/automation-keys.js'), 'utf8');
const TMP = scratch('automation-keys');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const NOW = Date.UTC(2026, 9, 19, 22, 0);
const K = (o = {}) => ({ id: 'ak-000000000001', name: 'dispatch', scopes: ['conversations.rename', 'conversations.open'], createdAt: NOW, createdBy: 'user', revokedAt: null, lastUsedAt: null, digest: 'a'.repeat(64), ...o });
// lane automation-open-limits: an opening key is minted WITH limits (the owner picks); /tmp holds the legs' opens
const OPEN_LIMITS = { cwdRoots: ['/tmp'], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] };
const G = (o = {}) => ({ id: 'ag-00000000000' + (o.n || 1), keyId: 'ak-000000000001', subject: 'session:conv-1', mode: 'always', at: NOW, by: 'user', spentAt: null, ...o });

console.log('① the closed table, the record and the grant');
{
  eq(A.VERBS, ['conversations.open', 'conversations.rename', 'conversations.bind', 'conversations.end', 'groups.invite', 'conversations.status'], 'the closed table: the five verbs the dispatcher needs, in order (+ lane automation-verbs\' conversations.status, a READ: the ids an open reports a moment later)');
  ok(A.SCOPES.every((s) => (s.verb === 'conversations.status' ? s.layer === 'read' : s.layer === 'act') && typeof s.args === 'function' && typeof s.label === 'string') && A.SCOPES.filter((s) => s.billed).map((s) => s.verb).join() === 'conversations.open' && Object.isFrozen(A.SCOPES), 'each row {verb, layer act, billed, args validator, label}; only conversations.open is billed (a turn nobody typed — L2 wires it through the spend guard)');
  eq([A.CODES.vault_locked, A.CODES.not_granted, A.CODES.verb_not_wired, A.CODES.bad_args, A.CODES.session_only], [423, 403, 501, 400, 403], 'the door\'s statuses: locked 423 · a refusal 403 · not wired 501 · bad args 400');
  const planted = A.keyOf({ ...K(), value: 'vsak_' + 'x'.repeat(43), secret: 'y' });
  ok(planted && !('value' in planted) && !('secret' in planted) && !JSON.stringify(planted).includes('vsak_'), 'keyOf copies NAMED fields only — a planted `value` never survives into a record');
  const pub = A.publicKey(K());
  ok(pub && !('digest' in pub) && pub.name === 'dispatch', 'publicKey (what a page / an agent sees) carries no digest');
  ok(A.grantOf(G()) && !A.grantOf(G({ subject: 'everyone' })) && !A.grantOf(G({ mode: 'forever' })) && A.isSubject('group:T-1') && A.isSubject('external') && !A.isSubject('session:'), 'a grant names a subject session:<id> | group:<task id> | external and a mode always | once — anything else is no grant');
  eq(A.SCOPES[1].args({ name: '  Lane X  ', target: 'claude:abc' }), { ok: true, args: { name: 'Lane X', target: 'claude:abc' } }, 'conversations.rename args: the name trimmed, an optional target id');
  ok(A.SCOPES[1].args({ name: 'x', extra: 1 }).code === 'bad_args' && A.SCOPES[1].args({}).code === 'bad_args' && A.SCOPES[1].args({ name: 'x'.repeat(121) }).code === 'bad_args', 'unknown arguments, a missing name, an over-long name: refused by name (bad_args)');
  eq(A.identityOf('ak-000000000001'), 'automation:ak-000000000001', 'identityOf = the spend identity a billed verb will be charged to (L2)');
}

console.log('② THE VERDICT TABLE — every code, in its order');
const T = [
  ['locked', { key: K(), grants: [G()], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'locked' }, 'vault_locked'],
  ['not set up', { key: K(), grants: [G()], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'not_set_up' }, 'vault_locked'],
  ['no key', { key: null, grants: [G()], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['revoked', { key: K({ revokedAt: NOW }), grants: [G()], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'key_revoked'],
  ['verb outside its scope', { key: K(), grants: [G()], subject: 'session:conv-1', verb: 'groups.invite', vaultState: 'unlocked' }, 'verb_not_in_scope'],
  ['an unknown verb', { key: K(), grants: [G()], subject: 'session:conv-1', verb: 'files.delete', vaultState: 'unlocked' }, 'verb_not_in_scope'],
  ['the caller ended', { key: K(), grants: [G()], subject: 'session:conv-1', subjectLive: false, verb: 'conversations.rename', vaultState: 'unlocked' }, 'subject_ended'],
  ['no grant', { key: K(), grants: [G({ subject: 'session:conv-2' })], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['another key\'s grant', { key: K(), grants: [G({ keyId: 'ak-000000000002' })], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['a once grant spent', { key: K(), grants: [G({ mode: 'once', spentAt: NOW })], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'once_spent'],
  ['always', { key: K(), grants: [G()], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'ok:always'],
  ['a fresh once (spent by this use)', { key: K(), grants: [G({ mode: 'once' })], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'ok:once'],
  ['its Task Group\'s grant', { key: K(), grants: [G({ subject: 'group:T-7' })], subject: 'session:conv-1', subjectGroups: ['T-7'], verb: 'conversations.rename', vaultState: 'unlocked' }, 'ok:always'],
  ['a group it is not in', { key: K(), grants: [G({ subject: 'group:T-8' })], subject: 'session:conv-1', subjectGroups: ['T-7'], verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['an outside caller, an internal grant', { key: K(), grants: [G(), G({ n: 2, subject: 'group:T-7' })], subject: 'external', subjectGroups: ['T-7'], verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['a conversation, an external grant', { key: K(), grants: [G({ subject: 'external' })], subject: 'session:conv-1', verb: 'conversations.rename', vaultState: 'unlocked' }, 'not_granted'],
  ['an outside caller, an external grant', { key: K(), grants: [G({ subject: 'external' })], subject: 'external', verb: 'conversations.rename', vaultState: 'unlocked' }, 'ok:always'],
];
const verdictWord = (v) => (v.ok ? `ok:${v.grant.mode}` : v.code);
const runTable = (mod) => T.filter(([, input, want]) => verdictWord(mod.useVerdict(input)) !== want).map(([n]) => n);
{
  const bad = runTable(A);
  ok(!bad.length, `the ${T.length}-row table: every code and every allowed shape, in the verdict's order (vault › key › scope › caller › grant)`, bad);
  ok(A.useVerdict(T[11][1]).spend === true && A.useVerdict(T[10][1]).spend === false, 'a once grant is SPENT by the use it lets through (spend: true); an always grant is not');
  // THE WALL, generated: an outside caller is never let through by a conversation's or a group's grant, and the reverse
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const SUBJ = ['session:conv-1', 'session:conv-2', 'group:T-7', 'group:T-8', 'external'];
  let leaks = 0;
  for (let i = 0; i < 400; i++) {
    const grants = Array.from({ length: 1 + rnd(3) }, (_, k) => G({ n: k + 1, subject: SUBJ[rnd(SUBJ.length)], mode: rnd(2) ? 'always' : 'once', spentAt: rnd(3) ? null : NOW }));
    const ext = A.useVerdict({ key: K(), grants, subject: 'external', subjectGroups: ['T-7'], verb: 'conversations.rename', vaultState: 'unlocked' });
    const own = A.useVerdict({ key: K(), grants, subject: 'session:conv-1', subjectGroups: ['T-7'], verb: 'conversations.rename', vaultState: 'unlocked' });
    if (ext.ok && ext.grant.subject !== 'external') leaks++;
    if (own.ok && own.grant.subject === 'external') leaks++;
  }
  ok(leaks === 0, 'THE WALL over 400 generated grant sets: an outside caller passes only on an `external` grant, a conversation never on one');
}

console.log('③ MUTANT — a verdict that ignores revokedAt');
{
  const needle = "  if (k.revokedAt) return { ok: false, code: 'key_revoked' };";
  ok(SRC.split(needle).length === 2, 'ANCHOR: the revoked check is spelled once');
  const Mx = M.load('src/automation-keys.js', SRC.replace(needle, ''), 'no-revoke');
  const red = runTable(Mx);
  ok(red.includes('revoked'), `MUTANT RED: without it a revoked key still runs (the table's "revoked" row goes ${verdictWord(Mx.useVerdict(T[3][1]))})`, red);
}

console.log('④ MUTANT — an outside caller judged by the internal grants');
{
  const needle = "  const mine = external ? ['external'] : callerSubjects(str(subject).slice('session:'.length), subjectGroups);";
  ok(SRC.split(needle).length === 2, 'ANCHOR: the external / internal split is spelled once');
  const Mx = M.load('src/automation-keys.js', SRC.replace(needle, "  const mine = external ? ['external', ...(Array.isArray(grants) ? grants : []).map((g) => g && g.subject)] : callerSubjects(str(subject).slice('session:'.length), subjectGroups);"), 'external-wide');
  const red = runTable(Mx);
  ok(red.includes('an outside caller, an internal grant'), 'MUTANT RED: an `external` caller let through by a conversation\'s grant — the wall row goes red', red);
}

console.log('⑤ mintPlan — a value for the vault, a digest for the record, never one in the other');
{
  const logs = [];
  const p = A.mintPlan({ name: 'Lane dispatch', scopes: ['conversations.rename', 'conversations.open', 'conversations.rename'], limits: OPEN_LIMITS, by: 'user', now: NOW, randomBytes: crypto.randomBytes, sha256 });
  ok(p.ok && A.VALUE_RE.test(p.value) && A.KEY_ID_RE.test(p.record.id) && p.entry === `apikey:${p.record.id}`, 'vsak_ + 43 base64url characters (32 random bytes) · an ak- id · the vault entry apikey:<id>');
  ok(p.record.digest === sha256(p.value) && p.record.digest !== p.value && !JSON.stringify(p.record).includes(p.value) && !('value' in p.record), 'the record keeps sha256(value) only — never the value');
  eq(p.record.scopes, ['conversations.open', 'conversations.rename'], 'its verbs deduped, in the table\'s order');
  const p2 = A.mintPlan({ name: 'x', scopes: ['conversations.rename'], randomBytes: crypto.randomBytes, sha256 });
  ok(p2.value !== p.value && p2.record.id !== p.record.id, 'two keys never share a value or an id');
  ok(A.mintPlan({ name: '', scopes: ['conversations.rename'], randomBytes: crypto.randomBytes, sha256 }).code === 'bad_args' && A.mintPlan({ name: 'x', scopes: [], randomBytes: crypto.randomBytes, sha256 }).code === 'bad_args' && A.mintPlan({ name: 'x', scopes: ['files.delete'], randomBytes: crypto.randomBytes, sha256 }).code === 'bad_args', 'no name, no verb, a verb outside the table: refused by name');
  let threw = false; try { A.mintPlan({ name: 'x', scopes: ['conversations.rename'] }); } catch { threw = true; }
  ok(threw && !/require\(/.test(SRC), 'the randomness and the hash are INJECTED — the module imports nothing (the Vault window bundles it)');
  void logs;
}

console.log('⑥ pickKey — which key a call uses');
{
  const k1 = K(), k2 = K({ id: 'ak-000000000002', name: 'other', createdAt: NOW + 1 }), k3 = K({ id: 'ak-000000000003', name: 'old', revokedAt: NOW });
  const base = { keys: [k1, k2, k3], subject: 'session:conv-1', verb: 'conversations.rename' };
  ok(A.pickKey({ ...base, grants: [G({ keyId: k2.id })] }).key.id === k2.id && !A.pickKey({ ...base, grants: [G({ keyId: k2.id })] }).ask, 'a key a grant already covers wins (no ask)');
  ok(A.pickKey({ keys: [k1, k3], grants: [], subject: 'session:conv-1', verb: 'conversations.rename' }).ask === true, 'no grant, ONE live key holds the verb ⇒ that key, asked for (the first-use card)');
  const amb = A.pickKey({ ...base, grants: [] });
  ok(amb.code === 'key_ambiguous' && amb.names.join() === 'dispatch,other', 'no grant, several live keys hold it ⇒ key_ambiguous with their names (name one with --key)');
  ok(A.pickKey({ ...base, grants: [], verb: 'groups.invite' }).code === 'not_granted' && A.pickKey({ ...base, grants: [], want: 'nope' }).code === 'not_found' && A.pickKey({ ...base, grants: [], want: 'old' }).key.id === k3.id, 'no key holds the verb ⇒ not_granted · a named key that is not there ⇒ not_found · a named revoked key is picked (the verdict then says key_revoked)');
}

console.log('⑦ THE ENGINE — a real vault, a real For-you store');
const CHEAP = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery staple';
const mkWorld = async (tag, { timers, verbs = null } = {}) => {
  const dir = path.join(TMP, tag); fs.mkdirSync(dir, { recursive: true });
  const vault = VE.create({ dataDir: dir, kdf: CHEAP, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  await vault.setup(PW, {});
  let clock = NOW;
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3, now: () => clock });   // ONE clock: the card's 60 s is the store's too
  const renamed = [];
  const engine = ENG.create({ dataDir: dir, vault, userTodos, now: () => clock, timers, verbs: verbs || { 'conversations.rename': (args, ctx) => { renamed.push({ args, key: ctx.keyId, reach: ctx.reach('conv-1', []) }); return { ok: true, name: args.name }; } } });
  return { dir, vault, userTodos, engine, renamed, tick: (ms) => { clock += ms; }, now: () => clock };
};
const caller = (o = {}) => ({ conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Worker one', live: true, groups: [], ...o });
const cards = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'automation-ask');
const auditOf = (w) => { try { return fs.readFileSync(path.join(w.dir, A.AUDIT_FILE), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const hitsIn = (dir, needles) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const b = fs.readFileSync(p); const s = b.toString('latin1'); for (const n of needles) for (const form of [n, Buffer.from(n).toString('hex'), Buffer.from(n).toString('base64')]) if (s.includes(form)) out.push(path.relative(dir, p)); } } }; walk(dir); return [...new Set(out)]; };
{
  const w = await mkWorld('engine');
  const m = w.engine.mint({ name: 'dispatch', scopes: ['conversations.rename', 'conversations.open'], limits: OPEN_LIMITS, by: 'user' });
  ok(m.ok && m.key && !JSON.stringify(m).includes('vsak_') && !('digest' in m.key), 'mint answers the key\'s public fields — never its value, never its digest');
  const value = w.vault.secretGet(`apikey:${m.key.id}`).value.toString();
  ok(A.VALUE_RE.test(value), 'the value is the vault entry apikey:<id> (only the vault holds it)');
  const st = JSON.parse(fs.readFileSync(path.join(w.dir, A.STORE_FILE), 'utf8'));
  ok(st.keys[0].digest === sha256(value) && (fs.statSync(path.join(w.dir, A.STORE_FILE)).mode & 0o777) === 0o600, 'data/automation-keys.json: the digest only, mode 0600');
  ok(w.engine.mint({ name: 'dispatch', scopes: ['conversations.rename'] }).code === 'bad_args', 'a second live key with the same name is refused (names tell keys apart)');
  // THE FIRST-USE CARD
  const p1 = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'Lane one' } });
  await new Promise((r) => setImmediate(r));
  const c1 = cards(w);
  ok(c1.length === 1 && c1[0].urgency === 'urgent' && c1[0].origin === 'vault' && c1[0].action.keyId === m.key.id && c1[0].action.verb === 'conversations.rename' && c1[0].sessionKey === 'claude:conv-1' && c1[0].expiresAt === w.now() + A.ASK_TTL_MS,
    'no grant ⇒ ONE urgent For-you card (origin vault, filed under the asking conversation, 60 s) — the call waits', c1.map((i) => ({ o: i.origin, u: i.urgency, a: i.action })));
  const p1b = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'Lane one b' } });
  await new Promise((r) => setImmediate(r));
  ok(cards(w).length === 1 && w.engine.listAsks()[0].waiting === 2, 'a second call of the same pair JOINS the card (one card per key × conversation)');
  const a1 = w.engine.answer(c1[0].action.askId, { answer: 'always', answeredBy: 'user' });
  const [r1, r1b] = await Promise.all([p1, p1b]);
  ok(a1.ok && a1.state === 'always' && r1.ok && r1b.ok && w.renamed.length === 2 && w.renamed[0].reach === true, 'Always ⇒ both waiting calls run; the key is now granted to the conversation');
  ok(!cards(w).length && w.engine.list().keys[0].grants.some((g) => g.subject === 'session:conv-1' && g.mode === 'always'), 'the card is gone, the grant is listed (the Vault window shows it)');
  const r2 = await w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'Lane two' } });
  ok(r2.ok && !cards(w).length, 'granted ⇒ the next call runs at once, nothing asked');
  ok((await w.engine.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/tmp' } })).code === 'verb_not_wired', 'a listed verb not wired yet ⇒ 501 verb_not_wired (L2)');
  ok((await w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: '' } })).code === 'bad_args' && (await w.engine.use({ caller: caller(), verb: 'files.delete', args: {} })).code === 'unknown_verb', 'bad arguments ⇒ bad_args; a verb outside the table ⇒ unknown_verb');
  ok((await w.engine.use({ caller: caller({ live: false }), verb: 'conversations.rename', args: { name: 'x' } })).code === 'subject_ended', 'a conversation that stopped running ⇒ subject_ended');
  const keys = w.engine.keysFor(caller());
  ok(keys.length === 1 && keys[0].name === 'dispatch' && !JSON.stringify(keys).includes(value) && !JSON.stringify(keys).includes(sha256(value)), 'keysFor: the keys this conversation may use — names + verbs, no value, no digest');
  // ONCE
  const p3 = w.engine.use({ caller: caller({ conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Worker two' }), verb: 'conversations.rename', args: { name: 'x' } });
  await new Promise((r) => setImmediate(r));
  w.engine.answer(cards(w)[0].action.askId, { answer: 'once' });
  ok((await p3).ok, 'Allow once ⇒ that call runs');
  const p4 = w.engine.use({ caller: caller({ conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Worker two' }), verb: 'conversations.rename', args: { name: 'y' } });
  await new Promise((r) => setImmediate(r));
  ok(cards(w).length === 1, '…its grant is SPENT — the next call asks again');
  w.engine.answer(cards(w)[0].action.askId, { answer: 'deny' });
  ok((await p4).code === 'ask_denied', 'Deny ⇒ ask_denied');
  ok((await w.engine.use({ caller: caller({ conversationId: 'conv-2', sessionKey: 'claude:conv-2' }), verb: 'conversations.rename', args: { name: 'z' } })).code === 'ask_quiet' && !cards(w).length, 'a call right after a refusal ⇒ ask_quiet, no new card (10 minutes)');
  w.tick(A.ASK_QUIET_MS + 1);
  const p5 = w.engine.use({ caller: caller({ conversationId: 'conv-2', sessionKey: 'claude:conv-2' }), verb: 'conversations.rename', args: { name: 'z' } });
  await new Promise((r) => setImmediate(r));
  ok(cards(w).length === 1, '10 minutes later it asks again');
  const it5 = cards(w)[0];
  w.userTodos.setStatus(it5.id, 'done', 'user');
  ok((await p5).code === 'ask_denied', 'the card closed by another door (its ✓) settles the call refused — the item and the ask are ONE state');
  // the audit
  const lines = auditOf(w);
  const uses = lines.filter((l) => l.verb === 'conversations.rename');
  ok(lines.length >= 10 && uses.every((l) => l.subject && l.verb && 'ok' in l && l.args && !JSON.stringify(l).includes(value)) && uses.filter((l) => l.ok).length === 4 && lines.some((l) => l.verb === 'key.mint') && lines.some((l) => l.verb === 'key.grant'),
    `ONE audit line per use (${uses.length} renames, 4 ok) + the owner's acts (mint, grant) — names and ids only, never the value`, uses.map((l) => [l.ok, l.code, l.ask]));
  const own = lines.filter((l) => l.subject === 'session:conv-1').length;
  ok(w.engine.auditFor(caller(), {}).every((l) => l.subject === 'session:conv-1') && w.engine.auditFor(caller(), {}).length === own && own > 0 && own < lines.length, `auditFor: THIS conversation's own lines only (${own} of ${lines.length})`);
  ok((fs.statSync(path.join(w.dir, A.AUDIT_FILE)).mode & 0o777) === 0o600, 'data/automation-audit.jsonl is 0600');
  // the value is in NO file (raw / hex / base64)
  ok(!hitsIn(w.dir, [value]).length, 'THE VALUE IS IN NO FILE under the data dir (raw / hex / base64) — only the vault\'s ciphertext holds it', hitsIn(w.dir, [value]));
  // REVOKE
  const rv = w.engine.revoke(m.key.id, { by: 'user' });
  ok(rv.ok && w.vault.secretGet(`apikey:${m.key.id}`).value === null && !w.engine.list().keys[0].grants.length, 'revoke: the value leaves the vault, every grant goes');
  ok((await w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'x' }, want: m.key.id })).code === 'key_revoked' && (await w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'x' } })).code === 'not_granted', 'a revoked key ⇒ key_revoked by name; unnamed, no live key holds the verb ⇒ not_granted');
  // THE LOCK
  const m2 = w.engine.mint({ name: 'second', scopes: ['conversations.rename'] });
  const p6 = w.engine.use({ caller: caller({ conversationId: 'conv-3', sessionKey: 'claude:conv-3' }), verb: 'conversations.rename', args: { name: 'q' } });
  await new Promise((r) => setImmediate(r));
  w.vault.lock('door');
  ok((await p6).code === 'vault_locked' && (await w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'q' } })).code === 'vault_locked' && w.engine.mint({ name: 'x', scopes: ['conversations.rename'] }).code === 'vault_locked',
    'THE LOCK: a call waiting on a card answers 423 vault_locked at once; every later call and a mint too');
  void m2;
}
{
  const fired = [];
  const w = await mkWorld('expiry', { timers: { set: (fn) => { fired.push(fn); return fired.length; }, clear: () => { } } });
  w.engine.mint({ name: 'k', scopes: ['conversations.rename'] });
  const p = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'x' } });
  await new Promise((r) => setImmediate(r));
  fired.forEach((f) => f());
  ok((await p).code === 'ask_expired' && !cards(w).length, 'no answer in 60 s ⇒ ask_expired; the card resolves expired');
  ok(w.engine.answer('f'.repeat(32), { answer: 'always' }).code === 'ask_unknown', 'an answer to an unknown card ⇒ ask_unknown');
}
// q-048 verify (the Fable desk, 2026-10-20): M1 a caller that went away while its card waited · M3 one card per verb
{
  const ran = [];
  const w = await mkWorld('ask-gone', { verbs: {
    'conversations.rename': (args) => { ran.push(`rename:${args.name}`); return { ok: true, name: args.name }; },
    'conversations.open': (args) => { ran.push(`open:${args.name}`); return { ok: true, conversationId: 'conv-9' }; },
  } });
  w.engine.mint({ name: 'k', scopes: ['conversations.rename', 'conversations.open'], limits: OPEN_LIMITS });
  const turn = () => new Promise((r) => setImmediate(r));
  // M1: the caller disconnects mid-card (its request's signal aborts) ⇒ withdrawn; the card closes; an Always runs NOTHING
  const gone = new AbortController();
  const pg = w.engine.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/tmp', name: 'ghost worker' }, signal: gone.signal });
  await turn();
  const cg = cards(w);
  ok(cg.length === 1 && cg[0].action.verb === 'conversations.open', 'M1 setup: the open waits on its card');
  gone.abort();
  const rg = await pg;
  const ag = w.engine.answer(cg[0].action.askId, { answer: 'always', answeredBy: 'user' });
  const itg = w.userTodos.get(cg[0].id);
  ok(rg.code === 'caller_gone' && A.CODES.caller_gone === 410 && ag.code === 'ask_settled' && !ran.length && !cards(w).length && itg.status === 'done' && itg.resolvedBy === 'ask-over' && !w.engine.list().keys[0].grants.length,
    'M1: the caller went away ⇒ caller_gone (410), its card closed (ask-over); the owner\'s Always then ⇒ ask_settled — NOTHING ran, no grant written', { rg, ag, ran, item: itg && { status: itg.status, by: itg.resolvedBy } });
  const lg = auditOf(w).filter((l) => l.verb === 'conversations.open');
  ok(lg.length === 1 && lg[0].ok === false && lg[0].code === 'caller_gone' && lg[0].ask === 'gone', 'M1: the audit says caller_gone (one line, ask gone)', lg);
  // two calls on one card, ONE goes away: the card stays for the other, whose answer still runs it
  const g2 = new AbortController();
  const pa = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'stays' } });
  const pb = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'leaves' }, signal: g2.signal });
  await turn();
  g2.abort();
  const rb = await pb;
  ok(rb.code === 'caller_gone' && cards(w).length === 1 && w.engine.listAsks()[0].waiting === 1, 'M1: of two calls on one card the one that went away is withdrawn — the card stays for the other (1 waiting)');
  w.engine.answer(cards(w)[0].action.askId, { answer: 'once' });
  ok((await pa).ok && ran.join() === 'rename:stays', 'M1: …and Allow once runs ONLY the call still waiting', ran);
  const pre = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'never' }, signal: AbortSignal.abort() });
  ok((await pre).code === 'caller_gone' && !cards(w).length, 'M1: a call already gone files no card at all');
  // M3: two verbs waiting ⇒ TWO cards; each answer releases only its own
  const po = w.engine.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/tmp', name: 'billed' } });
  const pr = w.engine.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'renamed' } });
  await turn();
  const two = cards(w);
  ok(two.length === 2 && two.map((c) => c.action.verb).sort().join() === 'conversations.open,conversations.rename' && two.every((c) => c.text.includes(c.action.verb)), 'M3: an open and a rename waiting ⇒ TWO cards, each naming its own verb', two.map((c) => c.text));
  w.engine.answer(two.find((c) => c.action.verb === 'conversations.rename').action.askId, { answer: 'always' });
  ok((await pr).ok && ran.includes('rename:renamed') && !ran.includes('open:billed') && cards(w).length === 1 && cards(w)[0].action.verb === 'conversations.open',
    'M3: Always on the RENAME card runs the rename only — the billed open still waits on its own card', { ran, left: cards(w).map((c) => c.action.verb) });
  w.engine.answer(cards(w)[0].action.askId, { answer: 'deny' });
  ok((await po).code === 'ask_denied' && !ran.includes('open:billed'), 'M3: …and the open\'s own Deny refuses it (the rename\'s Always never released it)', ran);
  // the MUTANT: the pair without the verb (the shipped 08070c47 shape) ⇒ one card, and the Always releases the open
  const ESRC = fs.readFileSync(path.join(ROOT, 'src/server/automation-engine.js'), 'utf8');
  const needle = 'const pairOf = (keyId, subject, verb) => `${keyId}|${subject}|${verb}`;';
  ok(ESRC.split(needle).length === 2, 'ANCHOR: the card\'s pair is spelled once');
  const MX = M.load('src/server/automation-engine.js', ESRC.replace(needle, 'const pairOf = (keyId, subject) => `${keyId}|${subject}`;').replace("grant(q.keyId, [q.subject], { by: answeredBy, mode: a === 'always' ? 'always' : 'once', fromAsk: true })", "grant(q.keyId, [q.subject], { by: answeredBy, mode: a === 'always' ? 'always' : 'once' })"), 'one-card');
  const ranX = [];
  const wx = await mkWorld('ask-one-card', { verbs: { 'conversations.rename': () => { ranX.push('rename'); return { ok: true }; }, 'conversations.open': () => { ranX.push('open'); return { ok: true }; } } });
  const ex = MX.create({ dataDir: wx.dir, vault: wx.vault, userTodos: wx.userTodos, now: wx.now, verbs: { 'conversations.rename': () => { ranX.push('rename'); return { ok: true }; }, 'conversations.open': () => { ranX.push('open'); return { ok: true }; } } });
  ex.mint({ name: 'k', scopes: ['conversations.rename', 'conversations.open'], limits: OPEN_LIMITS });
  const xr = ex.use({ caller: caller(), verb: 'conversations.rename', args: { name: 'x' } });
  const xo = ex.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/tmp', name: 'rider' } });
  await turn();
  const xc = cards(wx);
  if (xc.length) ex.answer(xc[0].action.askId, { answer: 'always' });
  await Promise.all([xr, xo]);
  ok(xc.length === 1 && ranX.includes('open'), `MUTANT RED: with the pair key × conversation (08070c47) the open rides the rename's ONE card (${xc.length} card) and its Always runs the billed open too (${ranX.join(', ')})`, { cards: xc.length, ran: ranX });
}

console.log('⑧ THE DOORS — an agent calls with its own token; every owner door refuses a bearer');
{
  const express = require(path.join(ROOT, 'node_modules/express'));
  const w = await mkWorld('doors');
  await w.vault.unlock(PW, {});
  const app = express(); app.use(express.json());
  const tokens = { vsst_good: caller() };
  require(path.join(ROOT, 'src/routes/automation.js')).registerAutomationRoutes(app, { engine: w.engine, callerOf: (t) => tokens[t] || null, subjects: () => ({ sessions: [{ subject: 'session:conv-1', name: 'Worker one' }], groups: [] }) });
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const page = { 'Content-Type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' };
  const go = async (method, p, { headers = {}, body } = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const mint = await go('POST', '/api/automation/keys', { headers: page, body: { name: 'door key', scopes: ['conversations.rename'] } });
  ok(mint.status === 200 && mint.body.key && !JSON.stringify(mint.body).includes('vsak_'), 'a person on this page mints (the answer: no value)');
  const asAgent = await go('POST', '/api/automation/keys', { headers: { ...page, Authorization: 'Bearer vsst_good' }, body: { name: 'mine', scopes: ['conversations.rename'] } });
  const grantAgent = await go('POST', `/api/automation/keys/${mint.body.key.id}/grants`, { headers: { ...page, Authorization: 'Bearer vsst_good' }, body: { subjects: ['session:conv-1'] } });
  const listAgent = await go('GET', '/api/automation/keys', { headers: { Authorization: 'Bearer vsst_good' } });
  ok(asAgent.status === 403 && asAgent.body.code === 'human_only' && grantAgent.body.code === 'human_only' && listAgent.body.code === 'human_only', 'an agent\'s token on an owner door (mint, GRANT, list) ⇒ 403 human_only — an agent never writes a grant');
  const cross = await go('POST', `/api/automation/keys/${mint.body.key.id}/grants`, { headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, body: { subjects: ['session:conv-1'] } });
  ok(cross.status === 403 && cross.body.code === 'cross_site', 'another site ⇒ 403 cross_site');
  ok((await go('POST', `/api/automation/keys/${mint.body.key.id}/grants`, { headers: page, body: { subjects: ['external'] } })).body.code === 'bad_args', 'external is not grantable in L1 (the outside door is L3)');
  const g = await go('POST', `/api/automation/keys/${mint.body.key.id}/grants`, { headers: page, body: { subjects: ['session:conv-1'] } });
  ok(g.status === 200 && g.body.added.length === 1, 'a person grants it to a conversation');
  const use = await go('POST', '/api/agent/automation/conversations.rename', { headers: { Authorization: 'Bearer vsst_good' }, body: { name: 'Door rename' } });
  ok(use.status === 200 && use.body.ok && use.body.key === 'door key' && w.renamed.some((x) => x.args.name === 'Door rename'), 'the agent calls the verb with its OWN token — the hub judged the grant and ran it');
  const job = await go('POST', '/api/agent/automation/conversations.rename', { headers: { Authorization: 'Bearer jbt_x' }, body: { name: 'x' } });
  const none = await go('POST', '/api/agent/automation/conversations.rename', { body: { name: 'x' } });
  ok(job.status === 403 && job.body.code === 'session_only' && none.status === 401, 'a job\'s jbt_ ⇒ 403 session_only (L1: conversations only) · no token ⇒ 401');
  const keys = await go('GET', '/api/agent/automation/keys', { headers: { Authorization: 'Bearer vsst_good' } });
  ok(keys.body.keys.length === 1 && !JSON.stringify(keys.body).includes('vsak_'), 'GET /api/agent/automation/keys: names + verbs (no value)');
  const lst = await go('GET', '/api/automation/keys', { headers: page });
  ok(lst.status === 200 && lst.body.keys[0].grants.length === 1 && lst.body.subjects.sessions.length === 1 && !JSON.stringify(lst.body).match(/vsak_|"digest"/), 'GET /api/automation/keys (a person): keys + grants + the picker\'s subjects — never a value, never a digest');
  // q-048 verify M1 THROUGH THE DOOR: a caller whose request closes while its card waits (its CLI killed) is withdrawn —
  // the owner's later Always runs nothing; the audit says caller_gone
  tokens.vsst_gone = caller({ conversationId: 'conv-5', sessionKey: 'claude:conv-5', name: 'Worker five' });
  const cut = new AbortController();
  const hung = fetch(base + '/api/agent/automation/conversations.rename', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_gone' }, body: JSON.stringify({ name: 'Ghost rename' }), signal: cut.signal }).catch((e) => e.name);
  let card5 = null;
  for (let i = 0; i < 200 && !card5; i++) { await new Promise((r) => setTimeout(r, 5)); card5 = cards(w).find((c) => c.action.subject === 'session:conv-5') || null; }
  cut.abort();
  let audit5 = [];
  for (let i = 0; i < 200 && !audit5.length; i++) { await new Promise((r) => setTimeout(r, 5)); audit5 = auditOf(w).filter((l) => l.subject === 'session:conv-5'); }
  const late = card5 ? w.engine.answer(card5.action.askId, { answer: 'always' }) : null;
  ok(card5 && (await hung) === 'AbortError' && audit5.length === 1 && audit5[0].code === 'caller_gone' && late && late.code === 'ask_settled' && !w.renamed.some((x) => x.args.name === 'Ghost rename') && !cards(w).some((c) => c.action.subject === 'session:conv-5'),
    'M1 THROUGH THE DOOR: the caller\'s request closed mid-card ⇒ withdrawn (audit caller_gone), the card closed; the owner\'s Always then ⇒ ask_settled, nothing renamed', { card: !!card5, audit5, late });
  // the MUTANT door (08070c47's: the call never told its request closed) ⇒ the card outlives the caller and the Always RUNS it
  const RSRC = fs.readFileSync(path.join(ROOT, 'src/routes/automation.js'), 'utf8');
  const rNeedle = ', signal: gone.signal }));';
  ok(RSRC.split(rNeedle).length === 2, 'ANCHOR: the door hands the call its request\'s signal once');
  const appX = express(); appX.use(express.json());
  M.load('src/routes/automation.js', RSRC.replace(rNeedle, ' }));'), 'no-signal').registerAutomationRoutes(appX, { engine: w.engine, callerOf: (t) => tokens[t] || null });
  const srvX = http.createServer(appX); await new Promise((r) => srvX.listen(0, '127.0.0.1', r));
  tokens.vsst_gone6 = caller({ conversationId: 'conv-6', sessionKey: 'claude:conv-6', name: 'Worker six' });
  const cut6 = new AbortController();
  const hung6 = fetch(`http://127.0.0.1:${srvX.address().port}/api/agent/automation/conversations.rename`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_gone6' }, body: JSON.stringify({ name: 'Ghost rename six' }), signal: cut6.signal }).catch((e) => e.name);
  let card6 = null;
  for (let i = 0; i < 200 && !card6; i++) { await new Promise((r) => setTimeout(r, 5)); card6 = cards(w).find((c) => c.action.subject === 'session:conv-6') || null; }
  cut6.abort(); await hung6;
  // the fixed door's effect, waited for the same way (≤ 1 s) — here it never comes: no caller_gone line, the card still up
  let audit6 = [];
  for (let i = 0; i < 200 && !audit6.length; i++) { await new Promise((r) => setTimeout(r, 5)); audit6 = auditOf(w).filter((l) => l.subject === 'session:conv-6'); }
  const stillUp = !audit6.length && cards(w).some((c) => c.action.subject === 'session:conv-6');
  if (card6) w.engine.answer(card6.action.askId, { answer: 'always' });
  let ran6 = false;
  for (let i = 0; i < 200 && !ran6; i++) { await new Promise((r) => setTimeout(r, 5)); ran6 = w.renamed.some((x) => x.args.name === 'Ghost rename six'); }
  ok(card6 && stillUp && ran6, 'MUTANT RED: a door that never tells the call its request closed ⇒ the card outlives the caller and the owner\'s Always RUNS it (the ghost rename happened)', { card: !!card6, stillUp, ran6 });
  srvX.close();
  w.vault.lock('door');
  const locked = await go('POST', '/api/agent/automation/conversations.rename', { headers: { Authorization: 'Bearer vsst_good' }, body: { name: 'x' } });
  ok(locked.status === 423 && locked.body.code === 'vault_locked', 'LOCKED ⇒ the door answers 423 vault_locked');
  srv.close();
}

console.log('⑨ THE RENAME SEAM — the ws case\'s body, moved whole; the verb\'s REACH');
{
  const sessions = new Map([['w1', { name: 'old', backend: 'claude', backendSessionId: 'conv-1', sockName: 'cw-1', mode: 'chat', status: 'live' }], ['w2', { name: 'two', backend: 'claude', backendSessionId: 'conv-2', mode: 'chat', status: 'live' }]]);
  const custom = [], metas = [], bc = [];
  const deps = { activeSessions: sessions, setCustomName: (k, n) => custom.push([k, n]), writeSessionMeta: (s, m) => metas.push([s, m.name]), readSessionMeta: () => ({ agentToken: 'kept' }), broadcastActiveSessions: () => bc.push(1), getSessionKey: (s) => `${s.backend}:${s.backendSessionId}` };
  const r = OPS.renameSession(deps, { webuiId: 'w1', name: '  Fresh  ' });
  ok(r.ok && sessions.get('w1').name === 'Fresh' && sessions.get('w1')._nameExplicit && custom[0].join() === 'claude:conv-1,Fresh' && metas[0].join() === 'cw-1,Fresh' && bc.length === 1, 'renameSession: the name set, explicit, stored as the custom name, the meta written, broadcast — the ws case\'s behaviour');
  ok(OPS.renameSession(deps, { webuiId: 'nope', name: 'x' }).code === 'not_found', 'an unknown target ⇒ not_found (the ws case breaks there, as before)');
  OPS.provide({ rename: (data) => OPS.renameSession(deps, data) });
  const V = OPS.automationVerbs({ activeSessions: sessions, groupsOf: (s) => (s.backendSessionId === 'conv-2' ? ['T-9'] : []) });
  const ctx = (reach) => ({ caller: { conversationId: 'conv-1' }, reach });
  ok(V['conversations.rename']({ name: 'Self' }, ctx(() => true)).ok && sessions.get('w1').name === 'Self', 'the verb renames the CALLER by default');
  ok(V['conversations.rename']({ name: 'Other', target: 'conv-2' }, ctx((cid, groups) => cid === 'conv-1' || groups.includes('T-9'))).ok && sessions.get('w2').name === 'Other', 'another conversation the key reaches (here through its Task Group) is renamed');
  const no = V['conversations.rename']({ name: 'Nope', target: 'conv-2' }, ctx((cid) => cid === 'conv-1'));
  ok(no.code === 'not_granted' && sessions.get('w2').name === 'Other', 'one the key does NOT reach ⇒ not_granted, untouched');
  OPS.provide(null);
  ok(OPS.callOp('rename', {}).code === 'not_ready', 'before the ws handler registered ⇒ not_ready');
}

console.log('⑪ THE LIMITS — openLimitsVerdict: each field\'s code, `..` and symlink escapes, a key minted before limits');
const LROOT = path.join(TMP, 'lim-root'), LOUT = path.join(TMP, 'lim-out'), IN = path.join(LROOT, 'wt-a');
fs.mkdirSync(path.join(IN, 'deep'), { recursive: true }); fs.mkdirSync(LOUT, { recursive: true }); fs.mkdirSync(LROOT + '-evil', { recursive: true });
fs.symlinkSync(LOUT, path.join(LROOT, 'escape'));          // a link INSIDE the root to a folder outside it
fs.symlinkSync(IN, path.join(LOUT, 'back-in'));            // a link OUTSIDE the root to a folder inside it
const RP = (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
const POOL = 'pool-d1e27705257c';
const LIMS = { cwdRoots: [LROOT], accounts: [POOL], permissionModes: ['default', 'bypassPermissions'], models: ['opus', 'default'], modes: ['chat'] };
const OK_SPEC = { cwd: IN, accountId: POOL };
const LT = [
  ['inside a root', OK_SPEC, 'ok'],
  ['the root itself', { ...OK_SPEC, cwd: LROOT }, 'ok'],
  ['a folder below', { ...OK_SPEC, cwd: path.join(IN, 'deep') }, 'ok'],
  ['a link outside pointing in (opened at its real path)', { ...OK_SPEC, cwd: path.join(LOUT, 'back-in') }, 'ok'],
  ['`..` out and back in', { ...OK_SPEC, cwd: `${LOUT}/../${path.basename(LROOT)}/wt-a` }, 'ok'],
  ['/', { ...OK_SPEC, cwd: '/' }, 'cwd_outside_roots'],
  ['/etc', { ...OK_SPEC, cwd: '/etc' }, 'cwd_outside_roots'],
  ['/tmp/../etc', { ...OK_SPEC, cwd: '/tmp/../etc' }, 'cwd_outside_roots'],
  ['`..` out of the root', { ...OK_SPEC, cwd: `${IN}/../../${path.basename(LOUT)}` }, 'cwd_outside_roots'],
  ['a link inside the root pointing out', { ...OK_SPEC, cwd: path.join(LROOT, 'escape') }, 'cwd_outside_roots'],
  ['a sibling sharing the root\'s prefix (lim-root-evil)', { ...OK_SPEC, cwd: LROOT + '-evil' }, 'cwd_outside_roots'],
  ['a folder that does not exist', { ...OK_SPEC, cwd: path.join(LROOT, 'nope') }, 'cwd_outside_roots'],
  ['a relative cwd', { ...OK_SPEC, cwd: 'wt-a' }, 'cwd_outside_roots'],
  ['another account', { ...OK_SPEC, accountId: 'someone-elses-account' }, 'account_not_allowed'],
  ['no account named, no default ⇒ the CLI\'s own login, not listed', { cwd: IN }, 'account_not_allowed'],
  ['bypassPermissions (listed)', { ...OK_SPEC, permissionMode: 'bypassPermissions' }, 'ok'],
  ['plan (not listed)', { ...OK_SPEC, permissionMode: 'plan' }, 'permission_not_allowed'],
  ['opus (listed)', { ...OK_SPEC, model: 'opus' }, 'ok'],
  ['no model named ⇒ default (listed)', { ...OK_SPEC }, 'ok'],
  ['gpt-9000', { ...OK_SPEC, model: 'gpt-9000' }, 'model_not_allowed'],
  ['terminal (not listed)', { ...OK_SPEC, mode: 'terminal' }, 'mode_not_allowed'],
];
const limWord = (v) => (v.ok ? 'ok' : v.code);
const runLimits = (mod, lims = LIMS) => LT.filter(([, spec, want]) => limWord(mod.openLimitsVerdict(lims, spec, { realpath: RP })) !== want).map(([n, spec]) => `${n}: ${limWord(mod.openLimitsVerdict(lims, spec, { realpath: RP }))}`);
{
  const bad = runLimits(A);
  ok(!bad.length, `the ${LT.length}-row limits table: inside / below / a link in ⇒ ok; /, /etc, /tmp/../etc, \`..\` out, a link out, a prefix sibling, a missing or relative folder ⇒ cwd_outside_roots; then account_not_allowed · permission_not_allowed · model_not_allowed · mode_not_allowed`, bad);
  eq(Object.values(A.LIMIT_CODES), ['cwd_outside_roots', 'account_not_allowed', 'permission_not_allowed', 'model_not_allowed', 'mode_not_allowed'], 'ONE code per field (folders › accounts › permission modes › models › modes)');
  ok(Object.values(A.LIMIT_CODES).every((c) => A.CODES[c] === 403), 'each limits code answers 403 at the door');
  const viaLink = A.openLimitsVerdict(LIMS, { ...OK_SPEC, cwd: path.join(LOUT, 'back-in') }, { realpath: RP });
  ok(viaLink.ok && viaLink.cwd === RP(IN), 'a folder reached through a link is opened at its REAL path (the judged path is the spawned one)', viaLink);
  const out = A.openLimitsVerdict(LIMS, { ...OK_SPEC, cwd: path.join(LROOT, 'escape') }, { realpath: RP });
  ok(out.field === 'cwdRoots' && out.why.includes(`really ${RP(LOUT)}`) && out.why.includes(LROOT), 'the refusal names the real folder and the key\'s folders', out);
  const first = A.openLimitsVerdict(LIMS, { cwd: '/etc', accountId: 'x', permissionMode: 'plan', model: 'gpt-9000', mode: 'terminal' }, { realpath: RP });
  ok(first.code === 'cwd_outside_roots', 'everything wrong at once ⇒ the FIRST field\'s code (the folder)', first);
  const old = A.openLimitsVerdict(null, { cwd: '/', accountId: 'anyone', permissionMode: 'bypassPermissions', model: 'gpt-9000', mode: 'terminal' }, { realpath: RP });
  ok(!old.ok && old.code === 'cwd_outside_roots', 'limits: null (a key minted before limits) ⇒ now REFUSED (q-049 M1): it reads as a fresh key with no folders, so every open is cwd_outside_roots until the owner sets bounds — fail closed', old);
  const fresh0 = A.keyOf(K()).limits;
  ok(fresh0 && fresh0.cwdRoots.length === 0 && fresh0.accounts.length === 0 && fresh0.permissionModes[0] === 'default' && fresh0.models === 'any' && JSON.stringify(A.publicKey(K()).limits) === JSON.stringify(fresh0) && JSON.stringify(A.keyOf({ ...K(), limits: null }).limits) === JSON.stringify(fresh0), 'a record with no (or null) limits reads as a FRESH key\'s limits — no folders, so every open is refused until the owner sets them (q-049 M1: a missing field never widens a key)');
  ok(!A.openLimitsVerdict(A.keyOf(K()).limits, { cwd: '/etc' }, { realpath: RP }).ok, 'end-to-end (q-049 M1): a pre-limits key read off a record REFUSES an open — keyOf gives it a fresh key\'s folderless limits, the judge refuses /etc');
  const damaged = A.keyOf({ ...K(), limits: 'garbage' }).limits;
  ok(damaged && damaged.cwdRoots.length === 0 && damaged.accounts.length === 0 && !A.openLimitsVerdict(damaged, OK_SPEC, { realpath: RP }).ok, 'a DAMAGED limits value narrows to a fresh key\'s (no folder, no account) — a broken record never widens a key', damaged);
  const lexical = A.openLimitsVerdict({ ...LIMS, cwdRoots: ['/srv/x'] }, { ...OK_SPEC, cwd: '/srv/x/../x/y' });
  ok(lexical.ok && lexical.cwd === '/srv/x/y', 'without an injected realpath (the browser bundle) the lexical fold stands in');
  // the owner's pick (limitsPlan — the mint and 边界… doors)
  const plan = A.limitsPlan({ cwdRoots: ['/a/../b/', '/b'], accounts: 'any' }, ['conversations.open']);
  eq(plan.limits, { cwdRoots: ['/b'], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] }, 'limitsPlan: the folders folded + deduped; a field left out takes a fresh key\'s default (the harness\'s own permission mode, any model, chat)');
  const refusals = [
    [{ cwdRoots: ['/x'], accounts: 'any', bogus: 1 }, /unknown limit "bogus"/],
    [{ cwdRoots: ['relative'], accounts: 'any' }, /"relative" is not an absolute folder/],
    [{ cwdRoots: ['/x'], accounts: ['bad id!'] }, /accounts: "bad id!" is not an account/],
    [{ cwdRoots: ['/x'], accounts: 'any', modes: ['chat', 'shell'] }, /modes: "shell" is not chat or terminal/],
    [{ accounts: 'any' }, /at least one folder/],
    [{ cwdRoots: ['/x'] }, /names the accounts/],
    [{ cwdRoots: ['/x'], accounts: 'any', permissionModes: [] }, /at least one permission mode/],
    [{ cwdRoots: ['/x'], accounts: 'any', models: [] }, /names its models/],
    [{ cwdRoots: ['/x'], accounts: 'any', modes: [] }, /chat, terminal or both/],
    [null, /the limits are an object/],
  ];
  const missed = refusals.filter(([pick, re]) => { const r = A.limitsPlan(pick, ['conversations.open']); return r.ok || r.code !== 'bad_args' || !re.test(r.why); }).map(([pick]) => JSON.stringify(pick));
  ok(!missed.length, `limitsPlan refuses BY NAME (bad_args): an unknown field, a relative folder, a malformed account / mode, and — for a key that opens — no folder, no account, no permission mode, no model, no mode (${refusals.length} picks)`, missed);
  ok(A.limitsPlan({}, ['conversations.rename']).ok, 'a key that never opens needs no folder or account');
  const mp = A.mintPlan({ name: 'opener', scopes: ['conversations.open'], randomBytes: crypto.randomBytes, sha256 });
  const mp2 = A.mintPlan({ name: 'opener', scopes: ['conversations.open'], limits: LIMS, randomBytes: crypto.randomBytes, sha256 });
  ok(mp.code === 'bad_args' && /at least one folder/.test(mp.why) && mp2.ok && JSON.stringify(mp2.record.limits) === JSON.stringify(A.limitsOf(LIMS)), 'mintPlan: a fresh opening key without a pick ⇒ refused by name (the owner picks); with one ⇒ the record carries it', { mp, lim: mp2.record && mp2.record.limits });
  ok(A.mintPlan({ name: 'x', scopes: ['conversations.open'], limits: null, randomBytes: crypto.randomBytes, sha256 }).code === 'bad_args', 'a NEW opening key can never be minted with no bounds (limits: null ⇒ bad_args — the owner must pick a folder)');
  ok(A.limitsWords(LIMS) === `folders ${LROOT} · accounts ${POOL} · permission modes default, bypassPermissions · models opus, default · modes chat` && /refused until/.test(A.limitsWords(null)), 'limitsWords: names only; a null (pre-limits) key words the fail-closed state', A.limitsWords(LIMS));
}
console.log('⑪b MUTANTS — a lexical-only folder check; a root prefix without its slash');
{
  const LSRC = fs.readFileSync(path.join(ROOT, 'src/automation-keys.js'), 'utf8');
  const n1 = "  const cwd = typeof realpath === 'function' ? real(str(s.cwd)) : normPath(s.cwd);";
  ok(LSRC.split(n1).length === 2, 'ANCHOR: the cwd\'s real path is read once');
  const M1x = M.load('src/automation-keys.js', LSRC.replace(n1, '  const cwd = normPath(s.cwd);'), 'lim-lexical');
  const r1 = runLimits(M1x);
  ok(r1.some((x) => x.startsWith('a link inside the root pointing out')), 'MUTANT RED: a lexical-only check lets a link inside the root out of it (the symlink row goes ok)', r1);
  const n2 = "const within = (p, root) => root === '/' || p === root || p.startsWith(root + '/');";
  ok(LSRC.split(n2).length === 2, 'ANCHOR: the containment rule is spelled once');
  const M2x = M.load('src/automation-keys.js', LSRC.replace(n2, "const within = (p, root) => p.startsWith(root);"), 'lim-prefix');
  const r2 = runLimits(M2x);
  ok(r2.some((x) => x.startsWith('a sibling sharing the root')), 'MUTANT RED: a bare startsWith lets lim-root-evil pass as lim-root', r2);
}

console.log('⑫ THE JUDGE — in use(): after the grant, BEFORE the grant is spent, the spend authorizer and the spawn');
const LIM_OPEN = { cwdRoots: [LROOT], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] };
/** The REAL conversation-ops seam (forDeps) over a recording create path + a recording spend guard. */
const judgeRig = () => {
  const calls = [];
  const sessions = new Map();
  const spendGuard = { authorize: (o) => { calls.push(['authorize', o.identity && o.identity.key]); return { ok: true, hold: 'h' + calls.length }; }, note: () => { calls.push(['note']); }, release: () => { calls.push(['release']); } };
  const handleCreate = (ws, frame) => {
    calls.push(['spawn', frame.cwd, frame.permissionMode || null, frame.accountId || null]);
    const id = `sess-${calls.length}-1`;
    sessions.set(id, { backend: 'claude', backendSessionId: `conv-w${calls.length}`, name: frame.name || null, cwd: frame.cwd, mode: frame.mode, clients: new Set([ws]) });
    ws.send(JSON.stringify({ type: 'created', sessionId: id, reqId: frame.reqId, name: frame.name || null, cwd: frame.cwd, mode: frame.mode }));
  };
  const ops = OPS.forDeps({ handleCreate, activeSessions: sessions, getSessionKey: (s) => `claude:${s.backendSessionId}`, spendGuard,
    specTables: () => ({ backends: ['claude'], chatBackends: ['claude'], byBackend: { claude: { models: ['opus'], modelFree: true, efforts: [], effortFree: false, permissionModes: ['bypassPermissions', 'plan'] } } }) });
  return { calls, sessions, verbs: OPS.automationVerbs({ activeSessions: sessions, ops, waitMs: 0 }) };
};
const judgeEngine = (mod, w, rig, openFacts = {}) => mod.create({ dataDir: w.dir, vault: w.vault, userTodos: w.userTodos, now: w.now, verbs: rig.verbs, openFacts });
const grantsOf = (w) => JSON.parse(fs.readFileSync(path.join(w.dir, A.STORE_FILE), 'utf8')).grants;
{
  const rig = judgeRig();
  const w = await mkWorld('judge');
  const e = judgeEngine(ENG, w, rig);
  const k = e.mint({ name: 'limited', scopes: ['conversations.open'], limits: LIM_OPEN });
  ok(k.ok && JSON.stringify(k.key.limits) === JSON.stringify(A.limitsOf(LIM_OPEN)), 'mint with limits: the key\'s public record carries them (names only)', k);
  e.grant(k.key.id, ['session:conv-1']);
  const r1 = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: LOUT, name: 'outside' } });
  ok(r1.code === 'cwd_outside_roots' && !rig.calls.length && JSON.stringify(r1.limits) === JSON.stringify(k.key.limits) && r1.field === 'cwdRoots',
    'an open OUTSIDE the key\'s folder ⇒ cwd_outside_roots carrying the key\'s limits — the spend guard never asked, nothing spawned', { r1, calls: rig.calls });
  const r2 = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: IN, permission: 'bypassPermissions' } });
  ok(r2.code === 'permission_not_allowed' && !rig.calls.length, 'bypassPermissions on a key that lists only the harness\'s own ⇒ permission_not_allowed, nothing charged', r2);
  const r3 = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: path.join(LOUT, 'back-in'), name: 'inside' } });
  eq(rig.calls.map((c) => c[0]), ['authorize', 'spawn', 'note'], 'an open INSIDE ⇒ the order: the spend authorizer, the spawn, the charge');
  ok(r3.ok && rig.calls[1][1] === RP(IN), 'the spawn got the REAL folder the judge passed (a link outside pointing in ⇒ its target), not the asked path', { r3: r3.ok, spawn: rig.calls[1] });
  const lines = auditOf(w).filter((l) => l.verb === 'conversations.open');
  ok(lines.length === 3 && lines[0].code === 'cwd_outside_roots' && lines[0].args.cwd === LOUT && lines[1].code === 'permission_not_allowed' && lines[2].ok, 'the audit: each refused open with its code and the asked folder; the allowed one ok', lines.map((l) => [l.ok, l.code, l.args.cwd]));
  // a ONCE grant is not spent by a refused open
  const k2 = e.mint({ name: 'once-limited', scopes: ['conversations.open'], limits: LIM_OPEN });
  e.grant(k2.key.id, ['session:conv-4'], { mode: 'once' });
  const before = rig.calls.length;
  const r4 = await e.use({ caller: caller({ conversationId: 'conv-4', sessionKey: 'claude:conv-4' }), verb: 'conversations.open', args: { cwd: '/etc' }, want: k2.key.id });
  ok(r4.code === 'cwd_outside_roots' && rig.calls.length === before && grantsOf(w).find((g) => g.keyId === k2.key.id).spentAt === null, 'a refused open never SPENDS a once-grant (judged before the grant is spent)', r4);
  // an UNGRANTED caller: no card for an open its key may not make
  const r5 = await e.use({ caller: caller({ conversationId: 'conv-5', sessionKey: 'claude:conv-5' }), verb: 'conversations.open', args: { cwd: '/etc' }, want: k.key.id });
  ok(r5.code === 'cwd_outside_roots' && !cards(w).length, 'no grant + an open outside the limits ⇒ refused at once, NO first-use card (the owner is never asked about it)', r5);
  // the limits edited while a card waits ⇒ judged again after the answer
  const p6 = e.use({ caller: caller({ conversationId: 'conv-6', sessionKey: 'claude:conv-6' }), verb: 'conversations.open', args: { cwd: IN }, want: k.key.id });
  await new Promise((r) => setImmediate(r));
  const c6 = cards(w);
  const narrowed = e.setLimits(k.key.id, { ...LIM_OPEN, cwdRoots: [LOUT] }, { by: 'user' });
  if (c6.length) e.answer(c6[0].action.askId, { answer: 'always' });
  const r6 = await p6;
  ok(c6.length === 1 && narrowed.ok && r6.code === 'cwd_outside_roots' && rig.calls.length === before, 'the owner narrows the folders WHILE the card waits, then answers Always ⇒ the open is judged by the limits as they stand now: refused, nothing spawned', { cards: c6.length, narrowed: narrowed.ok, r6 });
  // the EFFECTIVE account: an open that names none is judged by the default the create path would bill
  const k3 = e.mint({ name: 'pool-only', scopes: ['conversations.open'], limits: { ...LIM_OPEN, accounts: [POOL] } });
  e.grant(k3.key.id, ['session:conv-1']);
  const eDefault = (id) => judgeEngine(ENG, w, rig, { defaults: () => ({ accountId: id, model: null }) });
  const r7 = await eDefault(POOL).use({ caller: caller(), verb: 'conversations.open', args: { cwd: IN }, want: k3.key.id });
  const r8 = await eDefault('pool-other').use({ caller: caller(), verb: 'conversations.open', args: { cwd: IN }, want: k3.key.id });
  ok(r7.ok && r8.code === 'account_not_allowed' && /pool-other/.test(r8.why), 'no --pool ⇒ the hub\'s DEFAULT account is what is judged: the listed pool opens, another default ⇒ account_not_allowed', { r7: r7.ok, r8 });
  // 边界… — the owner's edit
  ok(e.setLimits(k.key.id, { cwdRoots: ['rel'] }).code === 'bad_args' && e.setLimits('ak-ffffffffffff', LIM_OPEN).code === 'not_found', 'setLimits: a bad pick refused by name; an unknown key not_found');
  const lastEdit = auditOf(w).filter((l) => l.verb === 'key.limits');
  ok(lastEdit.length === 1 && lastEdit[0].ok && lastEdit[0].subject === 'owner', 'an edit is audited key.limits (the owner)', lastEdit);
}
{
  // q-049 M1 — a key minted BEFORE limits (its record has no `limits` field) now reads as a FRESH key (no folders) and
  // REFUSES every open until the owner sets its bounds. The RED→GREEN that proves M1 (2.369.323 opened anything, anywhere).
  const rig = judgeRig();
  const w = await mkWorld('judge-old');
  const e0 = judgeEngine(ENG, w, rig);
  const m = e0.mint({ name: 'old', scopes: ['conversations.open'], limits: LIM_OPEN });
  const st = JSON.parse(fs.readFileSync(path.join(w.dir, A.STORE_FILE), 'utf8'));
  delete st.keys[0].limits;   // the shape 2.369.323 wrote — no `limits` field at all
  st.grants = [{ id: 'ag-0000000000aa', keyId: m.key.id, subject: 'session:conv-1', mode: 'always', at: NOW, by: 'user', spentAt: null }];
  fs.writeFileSync(path.join(w.dir, A.STORE_FILE), JSON.stringify(st), { mode: 0o600 });
  const e = judgeEngine(ENG, w, rig);
  const freshLimits = e.list().keys[0].limits;
  ok(freshLimits && freshLimits.cwdRoots.length === 0 && freshLimits.permissionModes[0] === 'default' && freshLimits.models === 'any', 'q-049 M1: a record with no `limits` field reads as a FRESH key — no folders (the window flags it 「Limits not set」), not null', freshLimits);
  const r = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/', permission: 'bypassPermissions', mode: 'terminal' } });
  ok(r.code === 'cwd_outside_roots' && !rig.calls.some((c) => c[0] === 'spawn'), 'q-049 M1 (fail CLOSED): a key minted before limits now REFUSES `/` — no folders set, nothing spawned (2.369.323 opened it)', { r: r.ok || r.code, calls: rig.calls.map((c) => c[0]) });
  const set = e.setLimits(m.key.id, LIM_OPEN);
  const r2in = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: IN } });
  const r2out = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: '/' } });
  ok(set.ok && set.key.limits && r2in.ok && r2out.code === 'cwd_outside_roots', 'the owner\'s first edit sets them ⇒ from then on judged: inside the folder opens, `/` still refused', { r2in: r2in.ok || r2in.code, r2out: r2out.code });
  const rv = e.revoke(m.key.id);
  ok(rv.ok && e.setLimits(m.key.id, LIM_OPEN).code === 'key_revoked', 'a revoked key\'s limits are not editable (key_revoked)');
}
console.log('⑫b MUTANT — the limits judged AFTER the spend authorizer (inside the act)');
{
  const ESRC = fs.readFileSync(path.join(ROOT, 'src/server/automation-engine.js'), 'utf8');
  const judge = `    let runArgs = v0.args;
    if (verb === 'conversations.open') {
      const lim = limitsJudge(keyById(key.id) || key, v0.args);
      if (!lim.ok) return done(lim, key.id, asked ? { ask: asked } : {});
      runArgs = lim.args;
    }`;
  const act = '    try { result = await impl(runArgs, { caller, keyId: key.id, identity: A.identityOf(key.id), grant: verdict.grant, reach }); }';
  ok(ESRC.split(judge).length === 2 && ESRC.split(act).length === 2, 'ANCHOR: the judge and the act are each spelled once');
  const MX = M.load('src/server/automation-engine.js', ESRC.replace(judge, '    let runArgs = v0.args;').replace(act, `    try { result = await impl(runArgs, { caller, keyId: key.id, identity: A.identityOf(key.id), grant: verdict.grant, reach }); if (verb === 'conversations.open') { const lim = limitsJudge(keyById(key.id) || key, v0.args); if (!lim.ok) result = lim; } }`), 'limits-after');
  const rig = judgeRig();
  const w = await mkWorld('judge-mutant');
  const e = judgeEngine(MX, w, rig);
  const k = e.mint({ name: 'limited', scopes: ['conversations.open'], limits: LIM_OPEN });
  e.grant(k.key.id, ['session:conv-1']);
  const r = await e.use({ caller: caller(), verb: 'conversations.open', args: { cwd: LOUT } });
  ok(r.code === 'cwd_outside_roots' && rig.calls.some((c) => c[0] === 'authorize') && rig.calls.some((c) => c[0] === 'spawn'),
    `MUTANT RED: the same refusal judged after the act — the open was CHARGED and SPAWNED first (${rig.calls.map((c) => c[0]).join(' → ')}): a refused open must never be charged`, { r: r.code, calls: rig.calls });
}

console.log('⑬ THE DOORS — mint with limits, 边界… (a person\'s), 审计…, the agent\'s refusal names the limits');
{
  const express = require(path.join(ROOT, 'node_modules/express'));
  const rig = judgeRig();
  const w = await mkWorld('limit-doors', { verbs: rig.verbs });
  const app = express(); app.use(express.json());
  const tokens = { vsst_lim: caller() };
  require(path.join(ROOT, 'src/routes/automation.js')).registerAutomationRoutes(app, { engine: w.engine, callerOf: (t) => tokens[t] || null, limitChoices: () => ({ accounts: [{ id: POOL, name: 'Pool one', backend: 'claude', type: 'pooled' }], permissionModes: [{ backend: 'claude', value: 'default', label: 'Default' }], models: [] }) });
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const page = { 'Content-Type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' };
  const go = async (method, p, { headers = {}, body } = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const none = await go('POST', '/api/automation/keys', { headers: page, body: { name: 'no pick', scopes: ['conversations.open'] } });
  ok(none.status === 400 && none.body.code === 'bad_args' && /at least one folder/.test(none.body.error), 'a person mints an opening key WITHOUT limits ⇒ 400 bad_args naming what to pick', none.body);
  const mint = await go('POST', '/api/automation/keys', { headers: page, body: { name: 'door limited', scopes: ['conversations.open'], limits: LIM_OPEN } });
  ok(mint.status === 200 && mint.body.key.limits && mint.body.key.limits.cwdRoots[0] === LROOT, 'a person mints it WITH limits', mint.body);
  const id = mint.body.key.id;
  await go('POST', `/api/automation/keys/${id}/grants`, { headers: page, body: { subjects: ['session:conv-1'] } });
  const lst = await go('GET', '/api/automation/keys', { headers: page });
  ok(lst.body.limitChoices && lst.body.limitChoices.accounts[0].id === POOL && lst.body.keys[0].limits, 'GET /api/automation/keys carries the limit pickers\' choices and each key\'s limits');
  const refused = await go('POST', '/api/agent/automation/conversations.open', { headers: { Authorization: 'Bearer vsst_lim' }, body: { cwd: '/etc', name: 'x' } });
  ok(refused.status === 403 && refused.body.code === 'cwd_outside_roots' && JSON.stringify(refused.body.limits) === JSON.stringify(mint.body.key.limits) && /outside this key's folders/.test(refused.body.error) && !rig.calls.length,
    'the agent\'s open outside ⇒ 403 cwd_outside_roots, the error naming it, the answer carrying the key\'s limits — nothing spawned', refused.body);
  const asAgent = await go('POST', `/api/automation/keys/${id}/limits`, { headers: { ...page, Authorization: 'Bearer vsst_lim' }, body: { limits: { ...LIM_OPEN, cwdRoots: ['/'] } } });
  const auditAgent = await go('GET', `/api/automation/keys/${id}/audit`, { headers: { Authorization: 'Bearer vsst_lim' } });
  ok(asAgent.status === 403 && asAgent.body.code === 'human_only' && auditAgent.body.code === 'human_only', '边界… and 审计… refuse an agent\'s token (human_only) — an agent never widens its own key');
  const edit = await go('POST', `/api/automation/keys/${id}/limits`, { headers: page, body: { limits: { ...LIM_OPEN, cwdRoots: [LROOT, LOUT] } } });
  ok(edit.status === 200 && edit.body.key.limits.cwdRoots.length === 2, 'a person edits them (边界…)', edit.body);
  const au = await go('GET', `/api/automation/keys/${id}/audit`, { headers: page });
  const refusedLine = au.body.lines && au.body.lines.find((l) => l.verb === 'conversations.open');
  ok(au.status === 200 && refusedLine && refusedLine.ok === false && refusedLine.code === 'cwd_outside_roots' && refusedLine.args.cwd === '/etc' && au.body.lines[0].verb === 'key.limits',
    '审计… (the owner\'s audit view): the refused open with its code and folder; newest first (the edit on top)', au.body.lines && au.body.lines.map((l) => [l.verb, l.ok, l.code]));
  srv.close();
}

console.log('⑭ THE WINDOW + THE CLI (text pins) — the 「未设边界」 chip, the limits only while open is ticked, no greyed control');
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const va = read('src/lib/vault-automation.js');
  ok(/if \(!key\.limits\.cwdRoots\.length\) \{\n\s+const chip = el\('span', 'vw-ak-unbounded', t\('Limits not set'\)\);/.test(va), 'THE CHIP (q-049 M1): an open key with no folders draws 「Limits not set」 (vw-ak-unbounded) — a pre-limits key reads as folderless and refuses every open');
  ok(/const limB = opens \? el\('button', 'vw-btn vw-ak-limits-edit', t\('Limits…'\)\) : null;/.test(va) && /const syncLim = \(\) => \{ limWrap\.hidden = !\(openCb && openCb\.checked\); \};/.test(va), '边界… on a key that opens; the mint dialog\'s limits shown only while 开一个对话 is ticked (absent, never greyed)');
  ok(!/\.disabled\s*=|setAttribute\('disabled'/.test(va), 'no control in the automation section is ever disabled (the owner\'s rule: no greyed controls)');
  const zhSrc = read('src/lib/i18n-zh.js'), jaSrc = read('src/lib/i18n-ja.js');
  ok(zhSrc.includes('"Limits not set": "未设边界"') && zhSrc.includes('"Limits…": "边界…"') && jaSrc.includes('"Limits not set": "制限未設定"') && jaSrc.includes('"Limits…": "制限…"'), 'zh 「未设边界」/「边界…」 · ja 「制限未設定」/「制限…」');
  const CLI = R('data/bin/vibespace-api');
  ok(CLI.limitsWords(LIM_OPEN) === `folders ${LROOT} · accounts any · permission modes default · models any · modes chat` && /refused until/.test(CLI.limitsWords(null)), 'the CLI words a key\'s limits (names only); a pre-limits key words the fail-closed state');
  ok(/\\n  this key's limits: \$\{limitsWords\(data\.limits\)\}/.test(read('data/bin/vibespace-api')), 'the CLI\'s refusal line carries "this key\'s limits: …" whenever the hub sent them');
}

console.log('⑩ wiring pins');
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ws = read('src/ws-handler.js'), wire = read('src/server/mounts-plugins-wiring.js');
  ok(/rename: \(data\) => ConversationOps\.renameSession\(\{ activeSessions, setCustomName, writeSessionMeta, readSessionMeta, broadcastActiveSessions, getSessionKey \}, data\),/.test(ws) && /convOps\.renameConversation\(data, data\.name, byOfWs\(ws\)\);[^\n]*\n\s+break;/.test(ws) && /ConversationOps\.provide\(convOpsOwn\);/.test(ws) && !/const trimmedName/.test(ws), 'the ws rename case calls THE function (its body lives in conversation-ops.js only — lane automation-verbs: through the renameConversation seam) and hands it to the automation door');
  ok(/openFacts: \{ defaults: \(backend\) => require\('\.\/conversation-ops\.js'\)\.openDefaults\(backend, \{ accounts: getAccounts\(\), \.\.\.automationSettings \}\) \}/.test(wire) && /limitChoices: \(\) => require\('\.\/conversation-ops\.js'\)\.limitChoices\(\{ accounts: getAccounts\(\) \}\)/.test(wire), 'lane automation-open-limits wiring: the engine judges over the account store\'s default + the instance\'s default model; the doors hand the pickers\' choices');
  ok(/require\('\.\/automation-engine\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), vault, userTodos,/.test(wire) && /registerAutomationRoutes\(app, \{ engine: automation,/.test(wire) && /automation: \(\) => automation,/.test(wire), 'the hub wires the engine (the vault, For you), its doors, and its rows in the Vault window');
  ok(VE.isSecretName('apikey:ak-000000000001') && R('src/vault.js').SECRETS_AT_REST.some((r) => r.entry === 'apikey:<key id>') && R('src/vault-inventory.js').GROUP_IDS.includes('automation') && R('src/vault-inventory.js').revealableOf('automation', 'apikey:ak-000000000001'),
    'the vault: apikey:<id> is a secret entry, SECRETS_AT_REST names it, the window lists «Automation keys» (revealable — only to hand to an outside party)');
  const routes = read('src/routes/automation.js');
  ok(!/app\.(post|delete|put|patch)\('\/api\/agent\/automation\/[^']*grant/.test(routes) && (routes.match(/app\.(get|post|delete)\('\/api\/automation\//g) || []).length === 8 && (routes.match(/person\(/g) || []).length >= 8, 'NO agent route writes a grant; the eight owner doors (+ 边界…, 审计… — lane automation-open-limits) are person-only');
  ok(/name: 'test-automation-keys', tier: 'fast'/.test(read('scripts/ci.mjs')), 'this suite has its tier row');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
