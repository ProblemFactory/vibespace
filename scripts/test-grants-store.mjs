#!/usr/bin/env node
// THE GRANTS STORE (lane grants-unify, 2026-10-23) — src/server/grants-store.js, THE one file every "who may use this"
// lives in, and THE one writer; then every door reading it:
//   ① the writer — atomic (tmp + rename, 0600), read back by a new store; an empty row removes; setMany all or nothing;
//     seed adds only absent rows; every refusal by name (the model's WRITE_REFUSALS + the store's STORE_REFUSALS:
//     not_written — memory unchanged —, store_unreadable — every row refused by name, nothing written over the file);
//   ② the audit — one line per landed write (who, when, which row, the principal KEYS added / removed — no names), rotated;
//   ③ live — onChange after a landed write only; the server-owned StateSync mirror (`grants`, client writes refused);
//   ④ the read API (stable — the permissions window builds on it): rowsFor / rowsOfDoor / rowsForPrincipal / whoMayUse /
//     health, forDir (the installed store for its dir), a memory store keeps nothing;
//   ⑤ the channel rows (src/server/channels-grants.js): an exception rides only a Task Group / All agents entry;
//   ⑥ EVERY DOOR HONOURS AN EXCEPTION — a member of a granted Task Group left out is refused at each door's own reader
//     (exit, window, browser profile, automation use + reach, channel reach, group visibility) and NEVER WOKEN by a
//     channel notification (the real engine: a Task Group's round-robin, All agents' fan-out, a member left out of the
//     ACCESS) — while another member is;
//   ⑦ RED CONTROL — THE model's admits swapped for a patched copy that ignores `except`: every ⑥ leg goes red;
//   ⑧ «除了» LEAVES BY NAME ONLY (lane held-except-doors, 2026-10-31): the writer refuses a write that leaves a stored
//     exception out without naming it (`removeExcept`) — `except_unnamed`, nothing written (file, audit, memory), all or
//     nothing in setMany; `remove` names the whole row; and THE CENSUS — every call of a picker's `except(` and of
//     `pickToRow(` in src/lib passes `held` (the stored list a dialog keeps while its «除了» row is not offered), a planted
//     door without it red by name.
// Fast (in-process; one fake channel engine).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require('../src/grant-model.js');
const GS = require('../src/server/grants-store.js');
const CGM = require('../src/server/channels-grants.js');
const ROOT = scratch('grants-store');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d)}`.slice(0, 600)); } };
const J = JSON.stringify;
const dirOf = (n) => { const d = path.join(ROOT, n); fs.mkdirSync(d, { recursive: true }); return d; };
const G1 = { kind: 'group', id: 'g1' }, M1 = { kind: 'conversation', key: 'm1' };

// ═══ ① the writer ═══════════════════════════════════════════════════════════
console.log('① the ONE writer: atomic, all or nothing, every refusal by name');
{
  const d = dirOf('w');
  const st = GS.create({ dataDir: d, now: () => 1000 });
  const r1 = st.set('exit', 'h1:use', { to: [G1], except: [M1] }, 'user');
  const disk = JSON.parse(fs.readFileSync(path.join(d, 'grants.json'), 'utf-8'));
  ok(r1.ok && r1.changed && disk.rows.length === 1 && J(disk.rows[0].except) === J([M1]) && (fs.statSync(path.join(d, 'grants.json')).mode & 0o777) === 0o600 && !fs.readdirSync(d).some((f) => /\.tmp/.test(f)), 'a write lands on disk BEFORE it answers (tmp + rename, 0600, no temp left)', disk);
  const back = GS.create({ dataDir: d });
  ok(J(back.rowsFor('exit', 'h1:use')) === J(st.rowsFor('exit', 'h1:use')) && back.sync.version === st.sync.version, 'a new store over the same dir reads it back (rows and the mirror\'s version)');
  ok(st.set('exit', 'h1:use', { to: [G1], except: [M1] }).changed === false, 'the same row again changes nothing (no write, no line)');
  // lane held-except-doors: the row holds an exception (M1) — an empty write that does not NAME it is refused (⑧ is the law)
  ok(st.set('exit', 'h1:use', { to: [], except: [] }).code === 'except_unnamed' && st.rowsFor('exit', 'h1:use').length === 1, 'an empty write that leaves the row\'s exception out UNNAMED is refused except_unnamed (the row stays)');
  ok(st.set('exit', 'h1:use', { to: [], except: [], removeExcept: [M1] }).changed === true && st.rowsFor('exit', 'h1:use').length === 0, 'an empty `to` and `except` REMOVES the row (nobody — one shape)');
  st.set('window', 'w1', { to: [{ kind: 'everyone' }] });
  const before = fs.readFileSync(path.join(d, 'grants.json'), 'utf-8');
  const bad = st.setMany([{ door: 'window', resource: 'w2', to: [G1] }, { door: 'window', resource: 'w3', to: [{ kind: 'session', id: 'x' }] }]);
  ok(!bad.ok && bad.code === 'bad_principal' && bad.resource === 'w3' && fs.readFileSync(path.join(d, 'grants.json'), 'utf-8') === before && !st.rowsFor('window', 'w2').length, 'setMany is all or nothing: one bad row ⇒ refused naming it, the file byte-identical, no row written');
  const sd = st.seed([{ door: 'window', resource: 'w1', to: [G1] }, { door: 'window', resource: 'w4', to: [G1] }]);
  ok(sd.added === 1 && sd.kept === 1 && st.rowsFor('window', 'w1')[0].to[0].kind === 'everyone', 'seed adds only ABSENT rows (a row the owner already wrote wins)', sd);
  const codes = new Set();
  for (const [door, res, lists] of [['nope', 'x', {}], ['exit', 'x', { to: [{ kind: 'session', id: 'x' }] }], ['exit', 'x', { to: [G1], except: [{ kind: 'everyone' }] }], ['exit', 'x', { to: [M1], except: [M1] }], ['exit', '', {}]]) { const v = st.set(door, res, lists); if (!v.ok) codes.add(v.code); }
  ok(['unknown_door', 'bad_principal', 'bad_except', 'except_conflicts', 'bad_resource'].every((c) => codes.has(c)) && [...codes].every((c) => GM.WRITE_REFUSALS.includes(c)), `the model's refusals reach the writer by name (${[...codes].sort().join(', ')})`);
  // not_written: the file cannot be replaced (a directory sits where it goes) ⇒ refused, memory unchanged
  const d2 = dirOf('nw');
  const s2 = GS.create({ dataDir: d2 });
  s2.set('exit', 'h:use', { to: [G1] });
  fs.rmSync(path.join(d2, 'grants.json')); fs.mkdirSync(path.join(d2, 'grants.json', 'x'), { recursive: true });
  const nw = s2.set('exit', 'h:use', { to: [M1] });
  ok(!nw.ok && nw.code === 'not_written' && s2.rowsFor('exit', 'h:use')[0].to[0].kind === 'group', 'a write that cannot land ⇒ not_written by name, memory UNCHANGED (never «saved» in memory only)', nw);
  // store_unreadable: a torn grants.json ⇒ every row refused by name, every write refused, the file never written over
  const d3 = dirOf('torn');
  fs.writeFileSync(path.join(d3, 'grants.json'), '{"v":1,"rows":[{"door":"exit"');
  const s3 = GS.create({ dataDir: d3 });
  const rr = s3.rowsFor('exit', 'h:use');
  ok(!s3.health().readable && rr.length === 1 && GM.admits(rr, { conversationKey: 'x' }).code === 'unknown_shape' && s3.set('exit', 'h:use', { to: [G1] }).code === 'store_unreadable' && fs.readFileSync(path.join(d3, 'grants.json'), 'utf-8') === '{"v":1,"rows":[{"door":"exit"', 'an unreadable grants.json: every row is refused BY NAME (unknown_shape — never «nothing granted» silently, never everyone), every write store_unreadable, the file untouched');
  ok(J([...GS.STORE_REFUSALS].sort()) === J(['except_unnamed', 'not_written', 'store_unreadable']), 'STORE_REFUSALS names the store\'s own three (lane held-except-doors: + except_unnamed)');
}

// ═══ ② the audit ═══════════════════════════════════════════════════════════
console.log('② the audit: one line per landed write — who, when, which row, the keys that changed');
{
  const d = dirOf('audit');
  const st = GS.create({ dataDir: d, now: () => 42 });
  st.set('browser-profile', 'p1', { to: [{ ...G1, name: 'Ops team' }], except: [{ ...M1, name: 'Mo' }] }, 'user');
  st.set('browser-profile', 'p1', { to: [G1, { kind: 'conversation', key: 'c2' }], removeExcept: ['conversation:m1'] }, 'user');   // lane held-except-doors: the exception taken away BY NAME
  st.set('browser-profile', 'p1', { to: [G1, { kind: 'conversation', key: 'c2' }] }, 'user');   // no change ⇒ no line
  st.remove('browser-profile', 'p1', 'user');
  const lines = fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  ok(lines.length === 3 && lines[0].at === 42 && lines[0].by === 'user' && lines[0].door === 'browser-profile' && lines[0].resource === 'p1' && J(lines[0].to.added) === J(['group:g1']) && J(lines[0].except.added) === J(['conversation:m1']), 'a line per landed write: when, who, the row, the principal keys added', lines[0]);
  ok(J(lines[1].except.removed) === J(['conversation:m1']) && J(lines[1].to.added) === J(['conversation:c2']) && lines[2].op === 'remove', '…removed ones too; a removal is its own line', lines.slice(1));
  ok(!/Ops team|"Mo"|"name"/.test(fs.readFileSync(st.auditFile, 'utf-8')), 'no names in the audit — keys only');
  fs.writeFileSync(st.auditFile, 'x'.repeat(GS.AUDIT_ROTATE_BYTES + 1));
  st.set('window', 'w', { to: [G1] });
  ok(fs.existsSync(`${st.auditFile}.1`) && fs.statSync(`${st.auditFile}.1`).size > GS.AUDIT_ROTATE_BYTES && fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').length === 1, `rotated past ${GS.AUDIT_ROTATE_BYTES} bytes (one .1 kept)`);
}

// ═══ ③ live ═════════════════════════════════════════════════════════════════
console.log('③ live: the change hook and the server-owned mirror');
{
  const st = GS.create({ dataDir: dirOf('live') });
  const seen = [];
  const off = st.onChange((c) => seen.push(c));
  st.set('exit', 'h:use', { to: [G1] }, 'user');
  st.set('exit', 'h:use', { to: [G1] }, 'user');
  st.set('exit', 'h:use', { to: [{ kind: 'session', id: 'x' }] }, 'user');
  st.setMany([{ door: 'exit', resource: 'h:run', to: [G1] }, { door: 'window', resource: 'w', to: [M1] }], 'user');
  ok(seen.length === 3 && seen[0].door === 'exit' && seen[0].row.to[0].id === 'g1' && seen[0].was === null && seen[0].by === 'user', 'onChange fires once per LANDED row change (never for a no-op or a refusal), with the row, what it was and who', seen.map((s) => [s.door, s.resource]));
  off(); st.remove('exit', 'h:use');
  ok(seen.length === 3, 'an unsubscribed listener hears nothing more');
  const k = GM.rowKey('window', 'w');
  ok(st.sync.name === 'grants' && st.sync.clientWrites === false && st.sync.data[k] && st.sync.data[k].to[0].key === 'm1' && !(GM.rowKey('exit', 'h:use') in st.sync.data), 'the `grants` StateSync mirror: the public rows (a removal leaves it), a SERVER-OWNED store (client writes refused)');
  ok(typeof st.flush === 'function' && typeof st.sync.flush === 'function', 'flush exists for the shutdown belt (nothing is ever pending — a write lands before it answers)');
}

// ═══ ④ the read API ═════════════════════════════════════════════════════════
console.log('④ the read API (stable — the permissions window builds on it)');
{
  const d = dirOf('read');
  const st = GS.create({ dataDir: d });
  st.set('exit', 'h:use', { to: [G1], except: [M1] });
  st.set('window', 'w1', { to: [{ kind: 'everyone' }] });
  st.set('automation-key-use', 'ag-000000000001', { to: [M1] });
  ok(st.rowsFor('exit', 'h:use').length === 1 && st.rowsFor('exit', 'nope').length === 0 && st.rowsOfDoor('exit').length === 1, 'rowsFor(door, resource) → [row]; rowsOfDoor(door) → every row of a door');
  const mine = st.rowsForPrincipal({ conversationKey: 'm1', groupIds: ['g1'] });
  ok(mine.some((x) => x.door === 'exit' && !x.ok && x.code === 'excepted') && mine.some((x) => x.door === 'window' && x.ok && x.via === 'everyone') && mine.some((x) => x.door === 'automation-key-use' && x.ok && x.via === 'conversation'), 'rowsForPrincipal(facts) → every row that admits OR excepts the principal («what may conversation X reach»)', mine);
  ok(J(st.whoMayUse('exit', 'h:use')) === J({ to: [G1], except: [M1] }) && J(st.whoMayUse('exit', 'nope')) === J({ to: [], except: [] }), 'whoMayUse(door, resource) → the two lists («who may use resource Y»)');
  ok(st.health().readable && st.health().rows === 3, 'health() → readable + the row count');
  const inst = GS.install(GS.create({ dataDir: dirOf('inst') }));
  ok(GS.forDir(path.join(ROOT, 'inst')) === inst && GS.forDir(d) !== inst && GS.forDir(d) === GS.forDir(d) && GS.store() === inst, 'forDir: the INSTALLED store for its own dir; one store per other dir (a suite\'s); store() = the installed one');
  const mem = GS.create({ memory: true });
  mem.set('exit', 'h:use', { to: [G1] });
  ok(mem.rowsFor('exit', 'h:use').length === 1 && mem.file === null && mem.auditFile === null, 'a memory store keeps nothing on disk');
}

// ═══ ⑤ the channel rows ═════════════════════════════════════════════════════
console.log('⑤ the channel rows: an exception rides only a Task Group / All agents entry');
{
  const st = GS.create({ memory: true });
  const cg = CGM.create({ grants: st });
  st.set('channel-reach', 'account:a1', { to: [{ ...G1, authority: 'send' }, { kind: 'conversation', key: 'c9', authority: 'draft' }], except: [M1] });
  const acc = cg.accessOf('account:a1');
  ok(acc.length === 2 && acc[0].principal.kind === 'group' && acc[0].authority === 'send' && J(acc[0].except) === J([M1]) && J(acc[1].except) === J([]) && acc[1].principal.kind === 'agent' && acc[1].principal.id === 'c9', 'a grain\'s access in the channel spelling — the row\'s except on its GROUP entry only (a conversation named by itself is never left out of itself)', acc);
  const ACL = require('../src/channel-acl.js');
  const t = { key: 'a1/c1', adapterId: 'a1' };
  ok(ACL.effective({ kind: 'agent', id: 'm1', groups: ['g1'] }, t, cg.accountGrants('a1')).level === 'hidden' && ACL.effective({ kind: 'agent', id: 'm2', groups: ['g1'] }, t, cg.accountGrants('a1')).level === 'visible', 'channel reach: the member left out sees nothing of the account; another member does');
  ok(cg.hasAnyExcept() === true && CGM.create({ grants: GS.create({ memory: true }) }).hasAnyExcept() === false, 'the store answers whether ANY channel row leaves anybody out (no wake path re-asks reach otherwise)');
  st.set('channel-reach', 'account:a1', { to: [{ ...G1, authority: 'send' }], removeExcept: [M1] });   // lane held-except-doors: by name
  ok(cg.accessOf('account:a1')[0].except.length === 0, 'a change of the store is read at once (the door index is rebuilt on the change)');
}

// ═══ ⑥ every door honours an exception ══════════════════════════════════════
console.log('⑥ every door honours an exception — the member left out is refused (and never woken); another member is not');
const doorProbes = async () => {
  const out = {};
  const ctxOf = (cid) => ({ sessionKeys: [`claude:${cid}`], conversationKeys: [cid], groupIds: ['g1'] });
  const exitRow = { door: 'exit', resource: 'h:use', to: [G1], except: [M1] };
  const E = require('../src/exit-reach.js');
  const acc = E.exitAccessOf({ exit: {} }, { use: [exitRow], run: [] });
  out.exit = [E.exitVerdict(acc, 'use', ctxOf('m1')), E.exitVerdict(acc, 'use', ctxOf('m2'))];
  const R = require('../src/window-reach.js');
  const rec = R.recordOfRows('w1', 'reach', [{ door: 'window', resource: 'w1', to: [G1], except: [M1] }]);
  out.window = [R.reachFor(rec, ctxOf('m1')), R.reachFor(rec, ctxOf('m2'))].map((v) => ({ ok: v.level === 'exposed', code: v.excepted ? 'excepted' : null }));
  const B = require('../src/browser-profiles.js');
  const prof = { id: 'bp-0000c001', label: 'work', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000c001', to: [G1], except: [M1] }]) };
  out.browser = [B.mayAttach(prof, { browserKey: 'bk-00000001', conversationKeys: ['m1'], taskIds: ['g1'] }), B.mayAttach(prof, { browserKey: 'bk-00000002', conversationKeys: ['m2'], taskIds: ['g1'] })];
  const AK = require('../src/automation-keys.js');
  const verb = AK.SCOPES[0].verb;
  const key = { id: 'ak-00000000000a', name: 'k', scopes: [verb], digest: 'd', at: 1 };
  const grant = AK.grantOf({ id: 'ag-00000000000b', keyId: key.id, mode: 'always', at: 1, use: { door: 'automation-key-use', resource: 'ag-00000000000b', to: [G1], except: [M1] }, reachRow: null });
  const use = (cid) => AK.useVerdict({ key, grants: [grant], subject: `session:${cid}`, subjectGroups: ['g1'], verb, vaultState: 'unlocked' });
  out.automationUse = [use('m1'), use('m2')];
  const reach = (cid) => AK.reachVerdict({ keyId: key.id, caller: 'c0', target: { conversationId: cid, groups: ['g1'] }, grants: [], opened: [], reach: { taskGroups: ['g1'] }, reachRows: [{ door: 'automation-key-reach', resource: 'ag-1', to: [G1], except: [M1] }] });
  out.automationReach = [reach('m1'), reach('m2')];
  const st = GS.create({ memory: true });
  st.set('channel-reach', 'conversation:a1/c1', { to: [{ ...G1, authority: 'draft' }], except: [M1] });
  const cg = CGM.create({ grants: st });
  const ACL = require('../src/channel-acl.js');
  const lv = (cid) => ACL.effective({ kind: 'agent', id: cid, groups: ['g1'] }, { key: 'a1/c1', adapterId: 'a1' }, cg.conversationGrants('a1/c1')).level;
  out.channelReach = [{ ok: lv('m1') === 'visible' }, { ok: lv('m2') === 'visible' }];
  st.set('group-visibility', 'g1', { to: [{ ...G1, level: 'messageable' }], except: [M1] });
  const msgAcl = require('../src/msg-acl.js');
  const vis = (cid) => msgAcl.levelFor({ cid, groups: ['g1'] }, ['g-outside'], (g) => st.rowsFor('group-visibility', g));
  out.groupVisibility = [{ ok: vis('m1') !== 'none' }, { ok: vis('m2') !== 'none' }];
  // lane browser-login: a web login's «any account on this site» row (PURE src/browser-login.js fillVerdict asks GM.admits over its rows)
  const BLg = require('../src/browser-login.js');
  const lf = BLg.formOf({ surfaceId: 'surf-cred-1', pageOrigin: 'https://shop.example.test', fields: [{ fieldId: 'f-1', type: 'password' }] });
  const lrows = (res) => (res === 'https://shop.example.test#*' ? [{ door: 'browser-login', resource: res, to: [G1], except: [M1] }] : []);
  const loginV = (cid) => BLg.fillVerdict({ forms: [lf], entries: [{ origin: 'https://shop.example.test', user: 'alice' }], grantRows: lrows, facts: { conversationKeys: [cid], groupIds: ['g1'] }, vaultState: 'unlocked' });
  out.browserLogin = [loginV('m1'), loginV('m2')].map((x) => ({ ok: x.ok, code: x.ok ? null : x.grant }));
  out.wake = await wakeWorlds();
  return out;
};
// the REAL channel engine: who is woken (billed) when messages arrive
const { makeRecord, makeConversation } = require('../src/channel-record.js');
const CH = require('../src/channels/index.js');
const ENG = require('../src/server/channels-engine.js');
let worldN = 0;
async function world() {
  const A = 'gsx', OPS = 'ops';
  const recs = []; let seq = 0;
  const mint = (text) => makeRecord({ adapterId: A, convId: OPS, vendorId: `gsx-${++seq}`, at: Date.now() + seq, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: OPS, raw: {} });
  const mod = { kind: A, caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata' },
    create() { return { auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
      async listConversations() { return { conversations: [makeConversation({ id: OPS, vendorId: OPS, title: 'Ops room', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
      async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
      async history(convId, { anchor = null, limit = 50 } = {}) { let idx = 0; if (anchor) { const at = recs.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; } const pending = recs.slice(idx), page = pending.slice(0, limit); return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: true, complete: page.length === pending.length }; },
      async send() { return { ok: true, vendorMessageId: 'x', at: Date.now(), sentAs: 'user' }; }, async reconcile() { return { unknown: true }; } }; } };
  const ladder = { calls: [], async deliverToConversation(cid) { ladder.calls.push(cid); return { ok: true, lane: 'message' }; }, stashFor() { } };
  const dataDir = dirOf(`world-${++worldN}`);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), J({ v: 1, adapters: [{ id: A, kind: A, label: 'GSX', enabled: true, linkedAt: 1, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(mod);
  const live = [{ cid: 'm1', name: 'One', groups: ['g1'] }, { cid: 'm2', name: 'Two', groups: ['g1'] }];
  const base = Date.now(); let offset = 0;
  const e = ENG.create({ dataDir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos: { add() { return { id: 't' }; }, get() { return null; }, setStatus() {} }, serverSetting: () => undefined, liveSessions: () => live, now: () => base + offset });
  await e.pass(A, { force: true });
  const ingest = async (n) => { for (let i = 0; i < n; i++) { offset += 61e3; recs.push(mint(`GPU ${i}`)); await e.pass(A, { force: true }); await e.settleWakes(); } };
  return { e, A, C: { kind: 'conversation', convId: OPS }, ladder, ingest };
}
async function wakeWorlds() {
  const GRP = { kind: 'group', id: 'g1', name: 'Ops' }, ALL = { kind: 'everyone', id: '*' }, LEFT = [{ kind: 'conversation', key: 'm1' }];
  const out = {};
  // (a) a Task Group's round-robin: the watch row leaves m1 out
  const a = await world();
  await a.e.setAccess(a.A, a.C, [{ principal: GRP, authority: 'draft' }]);
  const sa = await a.e.setWatchers(a.A, a.C, [{ principal: GRP, notify: 'wake', mode: 'all', dailyWakeCap: 50 }], { except: LEFT });
  await a.ingest(4);
  // the member left out asks for its OWN (free, next-turn) watch: it never lifts the user's exception
  const own = await a.e.agentWatch({ kind: 'agent', id: 'm1', name: 'One', groups: ['g1'] }, `${a.A}/ops`, {});
  out.roundRobin = { set: sa.ok, calls: a.ladder.calls.slice(), ownWatch: own, stillLeftOut: a.e.conversationView(a.A, 'ops').own.watchExcept.some((x) => x.key === 'm1') };
  // (b) All agents' fan-out: the watch row leaves m1 out
  const b = await world();
  await b.e.setAccess(b.A, b.C, [{ principal: ALL, authority: 'draft' }]);
  const sb = await b.e.setWatchers(b.A, b.C, [{ principal: ALL, notify: 'wake', mode: 'all', dailyWakeCap: 50 }], { except: LEFT });
  await b.ingest(3);
  out.fanOut = { set: sb.ok, calls: b.ladder.calls.slice() };
  // (c) m1 left out of the group's ACCESS (the watch row has no exception): it may not read — it is never woken with the words
  const c = await world();
  const sc = await c.e.setAccess(c.A, c.C, [{ principal: GRP, authority: 'draft' }], { except: LEFT });
  await c.e.setWatchers(c.A, c.C, [{ principal: GRP, notify: 'wake', mode: 'all', dailyWakeCap: 50 }]);
  await c.ingest(4);
  out.accessLeftOut = { set: sc.ok, calls: c.ladder.calls.slice(), m1Reads: c.e.readFor({ kind: 'agent', id: 'm1', groups: ['g1'] }, c.A, 'ops', {}).ok === true, m2Reads: c.e.readFor({ kind: 'agent', id: 'm2', groups: ['g1'] }, c.A, 'ops', {}).ok === true };
  for (const w of [a, b, c]) { try { w.e.stop(); } catch { } }
  return out;
}
{
  const p = await doorProbes();
  const left = (v) => v && !v.ok;
  ok(left(p.exit[0]) && p.exit[0].code === 'excepted' && p.exit[1].ok, 'exit: the member left out is refused `excepted` (its words say where the owner lifts it); another member borrows the network', p.exit);
  ok(left(p.window[0]) && p.window[0].code === 'excepted' && p.window[1].ok, 'window: the member left out is not exposed (excepted); another member is');
  ok(left(p.browser[0]) && p.browser[0].code === 'excepted' && p.browser[1].ok, 'browser profile: the member left out is refused `excepted`; another member attaches', p.browser);
  ok(left(p.automationUse[0]) && p.automationUse[0].code === 'excepted' && p.automationUse[1].ok, 'automation key use: the member left out is refused `excepted`; another member uses the key', p.automationUse);
  ok(left(p.automationReach[0]) && p.automationReach[0].code === 'excepted' && p.automationReach[1].ok, 'automation key reach: a conversation left out of the grant\'s reach is refused `excepted`; another is reached', p.automationReach);
  ok(left(p.channelReach[0]) && p.channelReach[1].ok, 'channel reach: the member left out sees nothing (hidden — the uniform not-found); another member sees it');
  ok(left(p.groupVisibility[0]) && p.groupVisibility[1].ok, 'group visibility: the member left out is not exposed to outsiders; another member is');
  ok(left(p.browserLogin[0]) && p.browserLogin[0].code === 'excepted' && p.browserLogin[1].ok, 'web login (lane browser-login): the member left out of «any account on this site» gets no login filled (excepted); another member does', p.browserLogin);
  const w = p.wake;
  ok(w.roundRobin.set && w.roundRobin.calls.length >= 3 && w.roundRobin.calls.every((c) => c === 'm2'), `channel notification, a Task Group's round-robin: every wake goes to m2 — the member left out is never woken (never billed) (${J(w.roundRobin.calls)})`, w.roundRobin);
  ok(w.roundRobin.ownWatch && w.roundRobin.ownWatch.ok === false && w.roundRobin.ownWatch.code === 'excepted' && w.roundRobin.stillLeftOut, 'the member left out cannot write its OWN watch over the user\'s exception (refused `excepted`, the exception kept)', w.roundRobin.ownWatch);
  ok(w.fanOut.set && w.fanOut.calls.includes('m2') && !w.fanOut.calls.includes('m1'), `channel notification, All agents' fan-out: m2 is woken, m1 (left out) never (${J(w.fanOut.calls)})`, w.fanOut);
  ok(w.accessLeftOut.set && !w.accessLeftOut.m1Reads && w.accessLeftOut.m2Reads && w.accessLeftOut.calls.length >= 3 && w.accessLeftOut.calls.every((c) => c === 'm2'), `a member left out of the group's ACCESS can neither read nor be woken with the words (${J(w.accessLeftOut.calls)})`, w.accessLeftOut);
}

// ═══ ⑦ RED CONTROL ══════════════════════════════════════════════════════════
console.log('⑦ RED control: THE admits swapped for a patched copy that ignores `except` — every door lets the member in');
{
  const MZ = mutantCopies('grants-doors', REPO);
  const real = GM.admits;
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
    const EX = "    if (x.kind === 'conversation' && F.keys.has(x.key)) return { state: 'excepted', row, entry: x };\n    if (x.kind === 'group') { if (F.groups.has(x.id)) return { state: 'excepted', row, entry: x }; if (F.unreadable) exceptUndecided = true; }\n";
    ok(src.split(EX).length === 2, 'CONTROL setup: the exception rung is found exactly once');
    GM.admits = MZ.load('src/grant-model.js', src.replace(EX, ''), 'ignores-except').admits;
    const p = await doorProbes();
    const inAll = [['exit', p.exit[0].ok], ['window', p.window[0].ok], ['browser', p.browser[0].ok], ['automation use', p.automationUse[0].ok], ['automation reach', p.automationReach[0].ok], ['channel reach', p.channelReach[0].ok], ['group visibility', p.groupVisibility[0].ok], ['web login', p.browserLogin[0].ok],
      ['round-robin', p.wake.roundRobin.calls.includes('m1')], ['fan-out', p.wake.fanOut.calls.includes('m1')], ['access left out', p.wake.accessLeftOut.m1Reads]];
    ok(inAll.every(([, v]) => v), `CONTROL: every door admits / wakes the member the owner left out — each ⑥ leg would be red (${inAll.filter(([, v]) => !v).map(([k]) => k).join(', ') || 'all eleven'})`, inAll);
  } finally { GM.admits = real; try { fs.rmSync(MZ.dir, { recursive: true, force: true }); } catch { } }
}

// ═══ ⑧ «除了» leaves by name only ═══════════════════════════════════════════════
console.log('⑧ «除了» leaves by name only (lane held-except-doors): the ONE writer refuses an unnamed drop; every picker call passes `held`');
{
  const M2 = { kind: 'conversation', key: 'm2' };
  const d = dirOf('named');
  const st = GS.create({ dataDir: d, now: () => 7 });
  st.set('exit', 'h:use', { to: [G1], except: [M1, M2] });
  const disk = () => fs.readFileSync(path.join(d, 'grants.json'), 'utf-8'), audit = () => fs.readFileSync(st.auditFile, 'utf-8');
  const d0 = disk(), a0 = audit(), r0 = J(st.rowsFor('exit', 'h:use'));
  const un = st.set('exit', 'h:use', { to: [G1], except: [M2] });
  ok(!un.ok && un.code === 'except_unnamed' && un.principal === 'conversation:m1' && un.error === GM.EXCEPT_UNNAMED_WORDS && disk() === d0 && audit() === a0 && J(st.rowsFor('exit', 'h:use')) === r0, 'a write that leaves a stored exception out UNNAMED is refused except_unnamed (its principal, the sentence) — the file, the audit and memory unchanged', un);
  ok(st.set('exit', 'h:use', { to: [G1], except: [], removeExcept: ['conversation:m1'] }).code === 'except_unnamed', 'naming ONE of two exceptions it drops is still refused (the other one is named by the refusal)');
  ok(st.set('exit', 'h:use', { to: [], except: [] }).code === 'except_unnamed' && st.rowsFor('exit', 'h:use').length === 1, 'an empty write (no one, no exception) is refused too while the row holds exceptions — a removal names them');
  const w1 = st.set('exit', 'h:use', { to: [G1], except: [M2], removeExcept: ['conversation:m1'] });
  const line = audit().trim().split('\n').map((l) => JSON.parse(l)).pop();
  ok(w1.ok && w1.changed && J(st.rowsFor('exit', 'h:use')[0].except) === J([M2]) && J(line.except.removed) === J(['conversation:m1']), 'named by its principal KEY ⇒ written; the audit line says the key it removed', { w1, line });
  ok(st.set('exit', 'h:use', { to: [G1], except: [], removeExcept: [{ ...M2, name: 'Mo' }] }).ok && st.rowsFor('exit', 'h:use')[0].except.length === 0, 'named by the ENTRY itself (a name beside it is no matter) ⇒ written');
  st.set('exit', 'h:run', { to: [G1], except: [M1] });
  st.set('exit', 'h:use', { to: [G1], except: [M1] });
  const before = disk();
  const many = st.setMany([{ door: 'exit', resource: 'h:use', to: [G1], except: [M1] }, { door: 'exit', resource: 'h:run', to: [G1], except: [] }]);
  ok(!many.ok && many.code === 'except_unnamed' && many.resource === 'h:run' && disk() === before, 'setMany: one row dropping an exception unnamed refuses the WHOLE write (all or nothing), naming that row', many);
  ok(st.setMany([{ door: 'exit', resource: 'h:run', to: [G1], except: [], removeExcept: ['conversation:m1'] }]).ok && st.remove('exit', 'h:use').ok && !st.rowsFor('exit', 'h:use').length, 'setMany takes a named drop; `remove` (the resource is gone) names the whole row by its call');
  ok(GM.exceptUnnamed(null, [], []) === null && GM.exceptUnnamed({ except: [M1] }, [M1], []) === null && GM.exceptUnnamed({ except: [M1] }, [], [42, null, 'conversation:m1']) === null && GM.exceptUnnamed({ except: [M1, G1] }, [], ['group:g1']) === 'conversation:m1', 'GM.exceptUnnamed (PURE): no stored row ⇒ none; kept ⇒ none; junk names ignored; the first unnamed one by its key');
  // THE CENSUS — a dialog's Save writes `picker.except(…)` / `pickToRow(…)`; each call passes the stored list (`held`)
  const LIB = path.join(REPO, 'src/lib');
  const OWN = ['principal-picker.js', 'principal-picker-model.js'];   // the picker's own two files: they DEFINE the calls
  const stripC = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
  const argsAt = (s, i) => { let depth = 0; for (let j = i; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')') { depth--; if (!depth) return s.slice(i + 1, j); } } return s.slice(i + 1); };
  const census = (files) => {
    const calls = [], bad = [];
    for (const [f, src0] of files) {
      const s = stripC(src0);
      for (const m of s.matchAll(/(?:\.except|\bpickToRow)\(/g)) {
        const args = argsAt(s, m.index + m[0].length - 1);
        const at = `${f}:${s.slice(0, m.index).split('\n').length}`;
        calls.push(at);
        if (!/\bheld\b/.test(args)) bad.push(`${at} ${m[0]}${args.slice(0, 50)})`);
      }
    }
    return { calls, bad };
  };
  // only a file whose text names a call is stripped and read (a call cannot hide from the substring — the fast tier's sum)
  const libFiles = fs.readdirSync(LIB).filter((f) => f.endsWith('.js') && !OWN.includes(f)).map((f) => [`src/lib/${f}`, fs.readFileSync(path.join(LIB, f), 'utf-8')]).filter(([, t]) => t.includes('.except(') || t.includes('pickToRow('));
  const c = census(libFiles);
  const doors = [...new Set(c.calls.map((x) => x.split(':')[0]))].sort();
  ok(c.calls.length >= 12 && !c.bad.length && ['src/lib/browser-who-dialog.js', 'src/lib/channel-api-dialog.js', 'src/lib/channel-filter-editor.js', 'src/lib/exit-access-dialog.js', 'src/lib/task-detail.js', 'src/lib/vault-automation.js', 'src/lib/vault-use-row.js'].every((f) => doors.includes(f)), `THE CENSUS: every picker \`except(\` / \`pickToRow(\` call in src/lib passes \`held\` (${c.calls.length} calls in ${doors.length} files: ${doors.map((f) => f.replace('src/lib/', '')).join(', ')})`, c.bad);
  const BW = fs.readFileSync(path.join(LIB, 'browser-who-dialog.js'), 'utf-8');
  const plant = BW.replace('picker.except({ held: initialExcept });   // lane held-except-doors', 'picker.except();   // lane held-except-doors');
  const pc = census([['src/lib/browser-who-dialog.js', plant]]);
  ok(plant !== BW && pc.bad.length === 1 && /browser-who-dialog\.js:\d+ \.except\(\)/.test(pc.bad[0]), 'CONTROL: the browser door\'s Save planted back without `held` is red by name (its file:line)', pc.bad);
}

console.log('⑨ a Save over a row this release cannot read is a REPAIR (lane held-except-doors r4): it lands, and the audit names what it dropped');
{
  // three rows a newer release (or a hand edit) left: an entry from a newer release, a bad key, `everyone` among the exceptions —
  // kept «judged as it is» at load, published with no exception (no door can show one, so none can name one)
  const d = dirOf('repair');
  const CEE = { kind: 'conversation', key: 'cid-cee' };
  const TOK9 = `ghp_${'B2c3D4e5F6'.repeat(4).slice(0, 36)}`;
  const RAW = [
    { door: 'exit', resource: 'h1:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'agent-from-newer-release', id: 'x' }] },
    { door: 'exit', resource: 'h2:use', to: [G1], except: [{ kind: 'conversation', key: '-bad-key' }] },
    { door: 'exit', resource: 'h3:use', to: [G1], except: [{ kind: 'everyone' }] },
    { door: 'exit', resource: 'h4:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'agent-from-newer-release', id: 'y' }] },
    // r5: the audit names EXACTLY what a repair drops — 25 readable + 1 newer-release entry (Cee kept), and Cee + 1 (Cee kept)
    { door: 'exit', resource: 'h6:use', to: [{ kind: 'everyone' }], except: [CEE, ...Array.from({ length: 24 }, (_, i) => ({ kind: 'conversation', key: `cid-x${i + 1}` })), { kind: 'agent-from-newer-release', id: 'z' }] },
    { door: 'exit', resource: 'h7:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'agent-from-newer-release', id: 'w' }] },
    // r6: an `except` that is not a list at all (a newer release's shape), a token-shaped value inside it
    { door: 'exit', resource: 'h8:use', to: [G1], except: { list: [CEE], mode: 'newer', note: `ghp_${'A1b2C3d4E5'.repeat(4).slice(0, 36)}` } },
    // r7: a LIST entry from a newer release with a token-shaped field (built here, never a literal)
    { door: 'exit', resource: 'h9:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'agent-from-newer-release', id: 'v', token: TOK9 }] },
  ];
  fs.writeFileSync(path.join(d, 'grants.json'), J({ v: 1, rows: RAW, syncVersion: 1 }));
  const st = GS.create({ dataDir: d, now: () => 9 });
  const lines = () => { try { return fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const lastFor = (res) => lines().filter((l) => l.resource === res).pop() || null;
  ok(RAW.every((r) => GM.normRow(r).ok === false) && RAW.every((r) => st.rowsFor('exit', r.resource).length === 1 && GM.publicRow(st.rowsFor('exit', r.resource)[0]).unknown === true), 'setup: the exit rows this release cannot read — kept as they are, published as unknown (no exception any door could show)');
  const s1 = st.set('exit', 'h1:use', { to: [G1], except: [] });
  const l1 = lastFor('h1:use');
  ok(s1.ok && J(st.rowsFor('exit', 'h1:use')[0].to) === J([G1]) && !!l1 && !!l1.repaired && /repaired an unreadable row/.test(l1.repaired.note) && l1.repaired.dropped.some((x) => /cid-cee/.test(x)) && l1.repaired.dropped.some((x) => /agent-from-newer-release/.test(x)), 'set over an unreadable row (an entry from a newer release) LANDS — a repair; its audit line names what it dropped (fb98bebee: except_unnamed for ever)', { s1, l1 });
  const s2 = st.setMany([{ door: 'exit', resource: 'h2:use', to: [], except: [] }, { door: 'exit', resource: 'h2:run', to: [G1], except: [] }]);
  const l2 = lastFor('h2:use');
  ok(s2.ok && !st.rowsFor('exit', 'h2:use').length && !!l2 && !!l2.repaired && l2.repaired.dropped.some((x) => /-bad-key/.test(x)), 'setMany over an unreadable row (a bad key) LANDS with the other row — the audit names the drop', { s2, l2 });
  const s3 = st.remove('exit', 'h3:use');
  const l3 = lastFor('h3:use');
  ok(s3.ok && !st.rowsFor('exit', 'h3:use').length && !!l3 && !!l3.repaired && l3.repaired.dropped.some((x) => /everyone/.test(x)), 'remove over an unreadable row (`everyone` among the exceptions) lands — the audit names the drop', { s3, l3 });
  // THE DOOR: the machine dialog's own Save road for a list it could not read («save it again») — exitAccessOf → patchVerdict →
  // exitRows → setMany, as exit-proxy setAccess runs it
  const E = require('../src/exit-reach.js');
  const acc = E.exitAccessOf({ exit: { ask: false } }, { use: st.rowsFor('exit', 'h4:use'), run: st.rowsFor('exit', 'h4:run') });
  const v = E.patchVerdict(acc, { use: { mode: 'nobody' }, run: { mode: 'nobody' } }, { now: 9, by: 'user' });
  const w = v.ok ? st.setMany(E.exitRows(v.access, 'h4', v.removeExcept), 'user') : v;
  ok(v.ok && w.ok && !st.rowsFor('exit', 'h4:use').length && !!(lastFor('h4:use') || {}).repaired, 'the machine dialog\'s Save road over its unreadable list (Nobody, «save it again») LANDS — repaired, the drop named', { v: v.ok ? 'ok' : v, w });
  // r5 (主开发's acceptance of r4, MINOR): `dropped` = exactly what the write does not keep — never a kept one; past 20, «and N more»
  const s6 = st.set('exit', 'h6:use', { to: [{ kind: 'everyone' }], except: [CEE] });
  const d6 = ((lastFor('h6:use') || {}).repaired || {}).dropped || [];
  ok(s6.ok && d6.length === 21 && !d6.some((x) => /cid-cee/.test(x)) && d6[20] === 'and 5 more', 'a repair that keeps Cee and drops 25 lists 20 of them + «and 5 more» — never Cee (6f68c1a1d: the raw list cut at 20, Cee in it, no count)', d6);
  const s7 = st.set('exit', 'h7:use', { to: [{ kind: 'everyone' }], except: [CEE] });
  const d7 = ((lastFor('h7:use') || {}).repaired || {}).dropped || [];
  ok(s7.ok && d7.length === 1 && /agent-from-newer-release/.test(d7[0]), 'a repair that keeps Cee names ONLY the newer-release entry it drops', d7);
  // r6 (主开发's acceptance of r5, 3): a non-list `except` is dropped WHOLE — named as its raw shape, bounded, a secret masked
  const s8 = st.set('exit', 'h8:use', { to: [G1], except: [] });
  const d8 = ((lastFor('h8:use') || {}).repaired || {}).dropped || [];
  ok(s8.ok && d8.length === 1 && /^\(not a list\) /.test(d8[0]) && /"list"/.test(d8[0]) && /newer/.test(d8[0]) && !/ghp_A1b2/.test(d8[0]) && d8[0].length <= 214, 'a repair over an `except` that is NOT a list names it «(not a list) {…}» — bounded, the token masked (ddd6a46c2: dropped [] — every exception in it discarded, named nowhere)', d8);
  // r7 (主开发's acceptance of r6, 3): a dropped LIST entry goes through the same masker — every string the audit writes, by value
  const s9 = st.set('exit', 'h9:use', { to: [{ kind: 'everyone' }], except: [CEE] });
  const d9 = ((lastFor('h9:use') || {}).repaired || {}).dropped || [];
  const audit9 = fs.readFileSync(st.auditFile, 'utf-8');
  ok(s9.ok && d9.length === 1 && /agent-from-newer-release/.test(d9[0]) && /"token"/.test(d9[0]) && !d9[0].includes(TOK9.slice(0, 12)) && !audit9.includes(TOK9.slice(0, 12)) && d9[0].length <= 120, 'a repair that drops a LIST entry with a token-shaped field names the entry with the token MASKED — nowhere in the audit file in clear (e9fbc8a2c: written in clear to grants-audit.jsonl)', d9);
  // CONTROL: a row this release CAN read still refuses an exception left out unnamed
  st.set('exit', 'h5:use', { to: [G1], except: [CEE] });
  ok(st.set('exit', 'h5:use', { to: [G1], except: [] }).code === 'except_unnamed', 'CONTROL: over a readable row an exception left out unnamed is still refused except_unnamed');
}

console.log(fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
