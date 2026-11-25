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
import { scratch, anchored } from './scratch.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane lg-group-parents (restack 415): the engine with its families, for the live-mark control
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require('../src/grant-model.js');
const GS = require('../src/server/grants-store.js');
const CGM = require('../src/server/channels-grants.js');
const ROOT = scratch('grants-store');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d)}`.slice(0, 600)); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  ok(J([...GS.STORE_REFUSALS].sort()) === J(['except_unnamed', 'not_written', 'only_unnamed', 'store_unreadable']), 'STORE_REFUSALS names the store\'s own four (lane held-except-doors: + except_unnamed; lane lg-group-parents: + only_unnamed)');
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
  // lane browser-login (r22 pivot): a web login's «any account on this site» row (PURE src/browser-login.js fillVerdict asks GM.admits over its rows)
  const BLg = require('../src/browser-login.js');
  const spec = BLg.parseVaultFillSpec('shop.example.test/password');
  const lrows = (res) => (res === 'https://shop.example.test#*' ? [{ door: 'browser-login', resource: res, to: [G1], except: [M1] }] : []);
  const loginV = (cid) => BLg.fillVerdict({ tabOrigin: 'https://shop.example.test', spec, entries: [{ origin: 'https://shop.example.test', user: 'alice', hasCurrent: true }], grantRows: lrows, facts: { conversationKeys: [cid], groupIds: ['g1'] }, vaultState: 'unlocked' });
  out.browserLogin = [loginV('m1'), loginV('m2')].map((x) => ({ ok: x.ok, code: x.ok ? null : x.grant }));
  out.wake = await wakeWorlds();
  return out;
};
// the REAL channel engine: who is woken (billed) when messages arrive
const { makeRecord, makeConversation } = require('../src/channel-record.js');
const CH = require('../src/channels/index.js');
const ENG = require('../src/server/channels-engine.js');
let worldN = 0;
async function world({ live: liveIn = null, eng = ENG, seed = null } = {}) {   // B-1e96: + `eng` (a red control's engine copy), `seed(store)` (rows written before the boot)   // lane lg-group-parents (cure 3's read): + the live sessions a leg needs
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
  const live = liveIn || [{ cid: 'm1', name: 'One', groups: ['g1'] }, { cid: 'm2', name: 'Two', groups: ['g1'] }];
  const base = Date.now(); let offset = 0;
  const gsSeed = seed ? GS.create({ dataDir }) : null;
  if (gsSeed) seed(gsSeed);
  const e = eng.create({ ...(gsSeed ? { grants: gsSeed } : {}), dataDir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos: { add() { return { id: 't' }; }, get() { return null; }, setStatus() {} }, serverSetting: () => undefined, liveSessions: () => live, now: () => base + offset });
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
    GM.admits = MZ.load('src/grant-model.js', editAnchor(src, EX, '', "src/grant-model.js"), 'ignores-except').admits;
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
  const PW10 = ['hunter', '2-plain-words-', 'not-a-token'].join(''), TOK11 = `ghp_${'C3d4E5f6G7'.repeat(4).slice(0, 36)}`;
  const DEEP11 = Array.from({ length: 9 }).reduce((inner, _, i) => ({ [`l${9 - i}`]: inner }), { t: TOK11 });
  const PEMBODY12 = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC'.repeat(2), PEM12 = [['-----BEGIN ', 'PRIVATE KEY-----'].join(''), PEMBODY12, ['-----END ', 'PRIVATE KEY-----'].join('')].join('\n');
  const PW14 = ['s3cr3t', '-netrc-', 'value'].join(''), NETRC14 = `machine h\nlogin u\npassword ${PW14}`;
  const BS_N = String.fromCharCode(92) + 'n';   // the two characters \ and n
  const PEM16 = PEM12.split('\n').join(BS_N), PW18 = ['an0ther', '-netrc-', 'value'].join(''), NETRC18 = ['machine h', 'login u', `password ${PW18}`].join(BS_N);
  const KEY19 = ['plain', '-words-', 'config-key-value'].join('');
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
    // r8: a non-list `except` with a secret BY NAME (no token shape), and a list entry with a token NINE levels down
    { door: 'exit', resource: 'h10:use', to: [G1], except: { list: [CEE], password: PW10, mode: 'newer' } },
    { door: 'exit', resource: 'h11:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'x-newer', n: DEEP11 }] },
    // r9: line-shaped secrets (a PEM block, a .netrc «password …») in a non-list `except` and in a list entry
    { door: 'exit', resource: 'h12:use', to: [G1], except: { list: [CEE], note: PEM12, mode: 'newer' } },
    { door: 'exit', resource: 'h13:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'x-newer', note: PEM12 }] },
    { door: 'exit', resource: 'h14:use', to: [G1], except: { list: [CEE], netrc: NETRC14 } },
    { door: 'exit', resource: 'h15:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'x-newer', note: NETRC14 }] },
    // r10: the same spelled with LITERAL backslash-n (a .env line, JSON-in-a-string), and a `key` that is not a conversation's own
    { door: 'exit', resource: 'h16:use', to: [G1], except: { list: [CEE], note: PEM16, mode: 'newer' } },
    { door: 'exit', resource: 'h17:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'x-newer', note: PEM16 }] },
    { door: 'exit', resource: 'h18:use', to: [G1], except: { list: [CEE], netrc: NETRC18 } },
    { door: 'exit', resource: 'h19:use', to: [G1], except: { list: [CEE], config: { key: KEY19 }, mode: 'newer' } },
    { door: 'exit', resource: 'h20:use', to: [{ kind: 'everyone' }], except: [CEE, { kind: 'x-newer', key: KEY19 }] },
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
  // r8 (主开发's acceptance of r7, MINOR): r7's per-string masker wrote a secret BY NAME in clear (redactSecrets' name rules need the
  // field next to its value) and skipped anything below depth 8 — the whole text is masked, a readable entry named by its key
  const s10 = st.set('exit', 'h10:use', { to: [G1], except: [] });
  const d10 = ((lastFor('h10:use') || {}).repaired || {}).dropped || [];
  const s11 = st.set('exit', 'h11:use', { to: [{ kind: 'everyone' }], except: [CEE] });
  const d11 = ((lastFor('h11:use') || {}).repaired || {}).dropped || [];
  const audit11 = fs.readFileSync(st.auditFile, 'utf-8');
  ok(s10.ok && d10.length === 1 && /^\(not a list\) /.test(d10[0]) && /"password"/.test(d10[0]) && !d10[0].includes(PW10) && !audit11.includes(PW10), 'a non-list `except` with a secret BY NAME («password», no token shape): masked — nowhere in the audit file in clear (d0b61c909: written in clear)', d10);
  ok(s11.ok && d11.length === 1 && /x-newer/.test(d11[0]) && !audit11.includes(TOK11.slice(0, 12)), 'a dropped list entry with a token NINE levels down: masked — nowhere in the audit file (d0b61c909: below depth 8 written as-is)', d11);
  ok(((lastFor('h1:use') || {}).repaired || {}).dropped.includes('conversation:cid-cee'), 'a dropped entry this release can read is named by its principal key («conversation:cid-cee») — a conversation\'s key is never masked as a secret', (lastFor('h1:use') || {}).repaired);
  // r9 (主开发's acceptance of r8, MAJOR 1 + MINOR 2): r8 masked the whole JSON text only — a newline there is the two characters
  // \n, so the line rules (a PEM block, a .netrc «password …») never fired; and «"key": «redacted»» hid which conversations went
  const audit15 = () => fs.readFileSync(st.auditFile, 'utf-8');
  for (const [res, to, ex, what] of [['h12:use', [G1], [], 'a PEM block in a non-list `except`'], ['h13:use', [{ kind: 'everyone' }], [CEE], 'a PEM block in a dropped list entry']]) {
    const w = st.set('exit', res, { to, except: ex });
    const dd = ((lastFor(res) || {}).repaired || {}).dropped || [];
    ok(w.ok && dd.length === 1 && /PRIVATE KEY/.test(dd[0]) && !dd[0].includes(PEMBODY12.slice(0, 16)) && !audit15().includes(PEMBODY12.slice(0, 16)), `${what}: the key body MASKED — nowhere in the audit file (dd04ecdae: written in clear)`, dd);
  }
  for (const [res, to, ex, what] of [['h14:use', [G1], [], 'a .netrc block in a non-list `except`'], ['h15:use', [{ kind: 'everyone' }], [CEE], 'a .netrc block in a dropped list entry']]) {
    const w = st.set('exit', res, { to, except: ex });
    const dd = ((lastFor(res) || {}).repaired || {}).dropped || [];
    ok(w.ok && dd.length === 1 && /password «redacted»/.test(dd[0]) && !audit15().includes(PW14), `${what}: «password «redacted»» — the password nowhere in the audit file (dd04ecdae: written in clear)`, dd);
  }
  // r10 (主开发's acceptance of r9): a PEM / .netrc spelled with LITERAL \n — the line rules split on real newlines only (r9 and
  // the base wrote both in clear); and r9's identifier exemption held at every depth (a nested config `key` was written in clear)
  for (const [res, to, ex, what, secret] of [['h16:use', [G1], [], 'a PEM block spelled with literal \\n in a non-list `except`', PEMBODY12.slice(0, 16)], ['h17:use', [{ kind: 'everyone' }], [CEE], 'a PEM block spelled with literal \\n in a dropped list entry', PEMBODY12.slice(0, 16)], ['h18:use', [G1], [], 'a .netrc block spelled with literal \\n', PW18], ['h19:use', [G1], [], 'a nested `config.key` (not a conversation\'s own key)', KEY19], ['h20:use', [{ kind: 'everyone' }], [CEE], 'a `key` on a newer release\'s entry (not a conversation\'s own key)', KEY19]]) {
    const w = st.set('exit', res, { to, except: ex });
    const dd = ((lastFor(res) || {}).repaired || {}).dropped || [];
    ok(w.ok && dd.length === 1 && !dd[0].includes(secret) && !audit15().includes(secret) && (res !== 'h19:use' || dd[0].includes('"key":"cid-cee"')) && (res !== 'h18:use' || /password «redacted»/.test(dd[0])), `${what}: MASKED — nowhere in the audit file${res === 'h19:use' ? ' (Cee\'s own key still named)' : ''} (c8e4d101b: written in clear)`, dd);
  }
  const d8k = ((lastFor('h8:use') || {}).repaired || {}).dropped || [];
  ok(d8k.length === 1 && d8k[0].includes('"key":"cid-cee"'), 'a non-list `except` {list: [Cee], mode: newer}: the audit names the conversation it dropped («"key":"cid-cee"» — an identifier field is no secret name; dd04ecdae: «"key":"«redacted»"»)', d8k);
  // CONTROL: a row this release CAN read still refuses an exception left out unnamed
  st.set('exit', 'h5:use', { to: [G1], except: [CEE] });
  ok(st.set('exit', 'h5:use', { to: [G1], except: [] }).code === 'except_unnamed', 'CONTROL: over a readable row an exception left out unnamed is still refused except_unnamed');
}

// ═══ ⑪ lane lg-group-parents: every door honours the LINEAGE ═══════════════════════
console.log('⑪ lane lg-group-parents: every wired door — a parent\'s grant admits its child\'s conversation, «仅本组» does not, a parent\'s «除了» leaves it out; group-visibility never inherits; THE CENSUS');
{
  const P = { kind: 'group', id: 'tg-p' }, PO = { ...P, only: true }, EV = { kind: 'everyone' };
  // the child's conversation (own group tg-c, parent tg-p) and the parent's own member
  const kid = { sessionKeys: ['claude:k1'], conversationKeys: ['k1'], groupIds: ['tg-c'], inheritedGroupIds: ['tg-p'] };
  const par = { sessionKeys: ['claude:p1'], conversationKeys: ['p1'], groupIds: ['tg-p'], inheritedGroupIds: [] };
  const E = require('../src/exit-reach.js');
  const ex = (to, except = []) => E.exitAccessOf({ exit: {} }, { use: [{ door: 'exit', resource: 'h:use', to, except }], run: [] });
  const eok = (acc, c) => !!E.exitVerdict(acc, 'use', c).ok;
  ok(eok(ex([P]), kid) && !eok(ex([PO]), kid) && eok(ex([PO]), par) && !eok(ex([EV], [P]), kid) && eok(ex([EV], [P]), { ...kid, inheritedGroupIds: [] }), 'exit: the parent\'s row admits the child; «仅本组» admits only the parent\'s own; «All except the parent» leaves the child out (and, without the lineage, would not — the leg can fail)');
  const R = require('../src/window-reach.js');
  const wr = (to, except = []) => R.recordOfRows('w1', 'reach', [{ door: 'window', resource: 'w1', to, except }]);
  const wok = (rec, c) => R.reachFor(rec, c).level === 'exposed';
  ok(wok(wr([P]), kid) && !wok(wr([PO]), kid) && wok(wr([PO]), par) && !wok(wr([EV], [P]), kid), 'window: the same four answers');
  const B = require('../src/browser-profiles.js');
  // the exit door's caller facts: the REAL ExitProxyManager.ctxFor asks the ONE reader's lineage
  const { ExitProxyManager } = require('../src/exit-proxy.js');
  const xp = new ExitProxyManager({ hosts: { list: () => [], get: () => null }, log: () => { }, groupsOf: () => [{ id: 'tg-c' }], lineageOf: (ids) => (ids.includes('tg-c') ? ['tg-p'] : []), grants: GS.create({ memory: true }) });
  const xc = xp.ctxFor({ claudeSessionId: 'k1', backend: 'claude' }, 'w-k1');
  const xbad = new ExitProxyManager({ hosts: { list: () => [], get: () => null }, log: () => { }, groupsOf: () => [{ id: 'tg-c' }], lineageOf: () => { throw new Error('store gone'); }, grants: GS.create({ memory: true }) }).ctxFor({ claudeSessionId: 'k1', backend: 'claude' }, 'w-k1');
  ok(J(xc.groupIds) === J(['tg-c']) && J(xc.inheritedGroupIds) === J(['tg-p']) && xbad.unreadable === true, 'exit: ctxFor hands the lineage (own groups stay own); a lineage that throws is UNREADABLE, never «no parents»', { xc, xbad });
  // the chain's cure (B): the U3a doors SAY what the lineage decided — exit, window, vault-use, each through ONE mapper over the
  // model's words (GM.lineageWords); the doors hand them (the store's belted name door, tasks.lineageNameOf)
  {
    const nm = (id) => ({ 'tg-p': 'Parent' })[id] || null;
    const W3 = [GM.LINEAGE_WORDS.through('Parent'), GM.LINEAGE_WORDS.excepted('Parent'), GM.LINEAGE_WORDS.only('Parent'), ''];
    const xw = (acc, c) => E.lineageOfVerdict(E.exitVerdict(acc, 'use', c), nm);
    const xs = [xw(ex([P]), kid), xw(ex([EV], [P]), kid), xw(ex([PO]), kid), xw(ex([P]), par)];
    ok(J(xs) === J(W3), 'exit: through the parent / left out through it / held out by «仅本组» — and nothing for the parent\'s own member', xs);
    const sNot = E.refusalText('not_granted', { machine: 'box', grant: 'use', lineage: xs[2] }), sExc = E.refusalText('excepted', { machine: 'box', grant: 'use', lineage: xs[1] });
    ok(sNot.includes('as "this group only"') && sNot.includes('Who can use it') && sExc.includes('left out through its parent Task Group "Parent"') && !/parent/i.test(E.refusalText('not_granted', { machine: 'box', grant: 'use' })), 'exit: the refusal names the «仅本组» entry / the parent\'s exception AND the door that changes it (the machine row\'s «Who can use it»)', [sNot, sExc]);
    const ww = (rec, c) => R.lineageOfReach(R.reachFor(rec, c), nm);
    const ws = [ww(wr([P]), kid), ww(wr([EV], [P]), kid), ww(wr([PO]), kid), ww(wr([P]), par)];
    ok(J(ws) === J(W3), 'window: the same three words, nothing for the parent\'s own member', ws);
    const VU2 = require('../src/vault-use-grant.js');
    const vrow = (to) => [{ door: 'vault-use', resource: 'secrets:secret:abc1234567#secret', to, except: [] }];
    const vm = { kind: 'group', id: 'tg-p', hosts: ['api.example.com'] };
    const vOut = VU2.useVerdict(vrow([vm]), kid, { hosts: ['other.example.org'], destinationKnown: true, now: 1 });
    const vOnly = VU2.useVerdict(vrow([{ ...vm, only: true }]), kid, { hosts: ['api.example.com'], destinationKnown: true, now: 1 });
    const vOwn = VU2.useVerdict(vrow([vm]), par, { hosts: ['other.example.org'], destinationKnown: true, now: 1 });
    const vl = VU2.standingLines([vOut, vOnly], { nameOf: nm }), vlOwn = VU2.standingLines([vOwn], { nameOf: nm });
    ok(vOut.code === 'outside_hosts' && vOut.member && vOut.member.inherited === true && vOnly.code === 'not_granted' && vOnly.only === 'group:tg-p' && vl.some((l) => /through its parent Task Group "Parent"/i.test(l)) && vl.some((l) => l.includes('as "this group only"') && l.includes('Vault window')) && vlOwn.length === 1 && !/parent/i.test(vlOwn[0]), 'vault-use: the card\'s standing line says a standing approval held through the parent, and names the «仅本组» entry that holds the child out with its door — nothing of a parent for the parent\'s own member', [vl, vlOwn]);
    const xpSrc = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf-8'), weSrc = fs.readFileSync(path.join(REPO, 'src/server/window-targets-engine.js'), 'utf-8'), srvSrc = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8'), vrSrc = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf-8');
    ok((xpSrc.match(/lineage: E\.lineageOfVerdict\(j\.verdict, this\.groupNameOf\)/g) || []).length === 2 && /\.map\(\(x\) => \(x && x\.ok \? E\.lineageOfVerdict\(x, this\.groupNameOf\) : ''\)\)/.test(xpSrc) && (weSrc.match(/R\.lineageOfReach\((?:v|rv), groupNameOf\)/g) || []).length === 3 && (srvSrc.match(/groupNameOf: \(id\) => tasks\.lineageNameOf\(id\)/g) || []).length === 2 && /VUG\.standingLines\(\[\.\.\.standing\.values\(\)\], \{ always: !!shape\.always, nameOf: groupNameOf \}\)/.test(vrSrc), 'the doors hand the words: exit\'s two refusals and its list, window\'s two refusals and its list, the vault card\'s standing lines — wired to the store\'s ONE name door');
  }
  // rule ④: the group-visibility door never inherits
  const st = GS.create({ memory: true });
  st.set('group-visibility', 'tg-p', { to: [{ ...P, level: 'messageable' }] });
  const msgAcl = require('../src/msg-acl.js');
  ok(msgAcl.levelFor({ cid: 'k1', groups: ['tg-c'], inheritedGroups: ['tg-p'] }, ['g-out'], (g) => st.rowsFor('group-visibility', g)) === 'none' && msgAcl.levelFor({ cid: 'p1', groups: ['tg-p'] }, ['g-out'], (g) => st.rowsFor('group-visibility', g)) === 'messageable', 'rule ④: a public PARENT never shows its child\'s members (group-visibility reads own groups only)');
  // the producers: the server hands the exit and window doors the ONE reader; vault-use's facts carry it
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8'), wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8'), eng = fs.readFileSync(path.join(REPO, 'src/server/window-targets-engine.js'), 'utf-8');
  ok((server.match(/lineageOf: \(ids\) => tasks\.grantGroupsOf\(ids\)\.inherited/g) || []).length === 3 && /broadcast: leaseBroadcast, groupsOf, lineageOf, log \}\)/.test(fs.readFileSync(path.join(REPO, 'src/server/window-live-wiring.js'), 'utf-8')) && /inheritedGroupIds = \(lineageOf\(groupIds\) \|\| \[\]\)\.map\(String\)/.test(eng) && /const ids = grantMemberIds\(tasks, \{[^\n]*?\}\); const gg = tasks\.grantGroupsOf\(ids\); groupIds = gg\.ids; inheritedGroupIds = gg\.inherited; if \(ids\.unread\) groupsUnreadable = true;/.test(wiring) && /groupIds, inheritedGroupIds, groupsUnreadable, turnBy:/.test(wiring), 'the producers: server.js hands exit + window + the channels wiring (B-4852) the ONE reader (tasks.grantGroupsOf); the window engine asks it; vaultUseFacts carries it (vault-run-door spreads those facts into every vault-use verdict)');
  // THE CENSUS: every facts builder that names a caller's groups in a file that asks the grant model carries the lineage, or
  // is NAMED here — exempt (with why) or PENDING (the unit that wires it). A stale entry is red too (the table stays true).
  const EXEMPT = [
    ['src/msg-acl.js', 'groupIds: (target.groups || []).filter(Boolean)', 'rule ④: group-visibility and «the same group» stay own groups only'],
    ['src/server/grants-migration.js', '*', 'the one migration\'s legacy-equivalence probes (pre-lineage readers by design)'],
    ['src/server/vault-run-door.js', 'const facts = { ...uf, conversationKeys:', 'spreads vaultUseFacts — its inheritedGroupIds ride in `...uf`'],
    ['src/automation-keys.js', 'const callerSubjects = (conversationId, groupIds = []) =>', 'the legacy subject list (session:<cid> + group:<gid>) — exported for GM.LEGACY\'s migration probes, no door calls it'],
    ['src/server/window-targets-engine.js', "const ctx = facts ? ctxOf(facts) : { sessionKeys: [], groupIds: [] };", 'no caller: nothing to inherit'],
    ['src/server/window-targets-engine.js', 'const c = needGroups ? ctxOf({ sessionId: id, session: s })', 'a row that needs groups (a group row, or a Task Group left out) asks ctxOf (which carries it); the rest ask no groups (the train\'s follow-owed should 4)'],
    ['src/channel-filter.js', "to: fromKeys, except: viaExceptOf(except) }], { conversationKey: str(cid), groupIds: Array.isArray(s.groups) ? s.groups.map(str) : [], inheritedGroupIds: [] }", 'the via judge\'s KEY-only groups (no access row: no «仅本组» to read) judge OWN groups only, as the release did — the rows are judged with the lineage (the chain\'s cure (D))'],
    ['src/channel-filter.js', "to: [{ kind: 'group', id: str(row.via) }], except: [] }], { conversationKey: str(row.principal.id)", 'the «via» shortcut (memberStill) judges OWN groups only, as memberVia'],
  ];
  const PENDING = [];   // lane lg-group-parents U3d: every door is wired (the automation doors last, on B-3190's tip)
  const listed = [...EXEMPT, ...PENDING];
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const ASKS = /grant-model(?:\.js)?'\)|GM\.(?:admits|prepareFacts|hitsOf)\(/;
  // U3b: every file is read — a facts-shaped line (groupIds beside a caller's keys or the fault flag) counts in a file that never
  // imports the model too (src/routes/browser.js builds a web login's facts for src/browser-login.js). THE LINE TEST (the U3a
  // read, 5): `groupIds:` or the shorthand `{ …, groupIds, … }` names a caller's groups; it CARRIES the lineage only when the
  // code (its trailing comment cut) names `inheritedGroupIds` with a value other than a hard-coded `[]`.
  const all = [...walk('src'), 'server.js'].filter((f) => f !== 'src/grant-model.js');
  const FACTS = /\b(?:conversationKeys?|groupsUnreadable|sessionKeys)\b/;
  const codeOf = (l) => l.replace(/\s\/\/\s.*$/, '').replace(/\/\*.*?\*\//g, '');
  const namesGroups = (c) => /\bgroupIds\s*:/.test(c) || /[{,]\s*groupIds\s*[,}]/.test(c);
  const carries = (c) => /\binheritedGroupIds\b/.test(c) && !/[{,]\s*inheritedGroupIds\s*:\s*\[\s*\]/.test(c);   // a KEY hard-coded to [] carries nothing (`x.inheritedGroupIds : []`, a ternary's else, is not a key)
  const censusOf = (texts) => {
    const bare = [], used = new Set();
    for (const [f, src] of texts) {
      const asks = ASKS.test(src);
      src.split('\n').forEach((l, i) => {
        if (/^\s*(\*|\/\/)/.test(l)) return;
        const c = codeOf(l);
        if (!namesGroups(c) || carries(c) || !(asks || FACTS.test(c))) return;
        const hit = listed.findIndex(([lf, needle]) => lf === f && (needle === '*' || l.includes(needle)));
        if (hit >= 0) used.add(hit); else bare.push(`${f}:${i + 1}`);
      });
    }
    return { bare, used };
  };
  const texts = all.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf-8')]);
  const files = texts.filter(([, s]) => ASKS.test(s)).map(([f]) => f);
  const { bare, used } = censusOf(texts);
  ok(files.length >= 15 && files.includes('src/exit-reach.js') && files.includes('src/window-reach.js') && files.includes('src/server/mounts-plugins-wiring.js') && texts.length > 300, `the census reads every source file (${texts.length}; ${files.length} ask the grant model)`);
  ok(bare.length === 0, 'CENSUS: every facts builder naming a caller\'s groups carries inheritedGroupIds — or is named exempt / pending', bare);
  const stale = listed.filter((_, i) => !used.has(i)).map(([f, n]) => `${f} «${n.slice(0, 60)}»`);
  ok(stale.length === 0, `CENSUS: every named entry still names a line (${EXEMPT.length} exempt, ${PENDING.length} pending: ${[...new Set(PENDING.map((p) => p[2].split(' ')[0]))].join(', ')})`, stale);
  // U3d: the automation doors — a key's USE (a parent's grant serves the child's conversation; «仅本组» does not; a parent's «除了»
  // leaves it out) and its REACH (a target in a child of a reached group)
  {
    const AK2 = require('../src/automation-keys.js');
    const verb2 = AK2.SCOPES[0].verb;
    const key2 = { id: 'ak-00000000000c', name: 'k2', scopes: [verb2], digest: 'd', at: 1 };
    const g2 = (to, except = []) => AK2.grantOf({ id: 'ag-00000000000d', keyId: key2.id, mode: 'always', at: 1, use: { door: 'automation-key-use', resource: 'ag-00000000000d', to, except }, reachRow: null });
    const use2 = (grant, inh) => AK2.useVerdict({ key: key2, grants: [grant], subject: 'session:k1', subjectGroups: ['tg-c'], subjectInherited: inh, verb: verb2, vaultState: 'unlocked' }).ok;
    ok(use2(g2([P]), ['tg-p']) && !use2(g2([P]), []) && !use2(g2([PO]), ['tg-p']) && !use2(g2([EV], [P]), ['tg-p']), 'automation-key-use: a parent\'s grant serves the child\'s conversation (with the lineage only); «仅本组» does not; «All except the parent» leaves it out');
    const reach2 = (inh) => AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: { conversationId: 'k1', groups: ['tg-c'], inherited: inh }, grants: [], opened: [], reach: { taskGroups: ['tg-p'] }, reachRows: [{ door: 'automation-key-reach', resource: 'ag-1', to: [P], except: [] }] });
    ok(reach2(['tg-p']).ok && !reach2([]).ok, 'automation-key-reach: a key reaching the parent reaches a conversation of its child (the target\'s lineage)', [reach2(['tg-p']), reach2([])]);
    // + piece 6's stop door (browsers.stop, re-landed onto 2.369.414): conversation-ops' lineageOfIds(gl) 2 → 3, reach(targetOf( 5 → 6
    const wSrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8'), opsSrc = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf-8'), aeSrc = fs.readFileSync(path.join(REPO, 'src/server/automation-engine.js'), 'utf-8');
    ok(/const ids = grantMemberIds\(tasks, \{ sessionKey: sessionStatusKey\(s, id\)[^\n]*?const gg = tasks\.grantGroupsOf\(ids\); return \{ ids: gg\.ids, inherited: gg\.inherited, unreadable: !!ids\.unread \};/.test(wSrc) && /groups: g\.ids, inherited: g\.inherited \|\| \[\]/.test(wSrc) && /inherited = tasks \? tasks\.grantGroupsOf\(groups\)\.inherited : null;/.test(wSrc) && /lineageOf: \(ids\) => \{ const tk = getTasks && getTasks\(\); if \(!tk\) throw new Error\('the Task Group store is not ready'\); return tk\.grantGroupsOf\(ids\)\.inherited; \}/.test(wSrc) && (opsSrc.match(/lineageOfIds\(gl\)/g) || []).length === 3 && (opsSrc.match(/reach\(targetOf\(/g) || []).length === 6 && (aeSrc.match(/subjectInherited: inherited,/g) || []).length === 3 && /inherited: lineageIn\(caller\.inherited\),/.test(aeSrc) && (aeSrc.match(/lineageIn\(/g) || []).length === 4, 'the automation producers: the caller and every target (live or stopped) carry the lineage from the ONE reader; the engine hands it to every use / pick verdict and records it on an ask');
    // the U3d read (1): a parent's grant never outranks the caller's own group's — ONE order (grant-model specificityOf)
    ok(GM.specificityOf('group', true) < GM.specificityOf('group') && GM.specificityOf('group', true) > GM.specificityOf('everyone') && GM.specificityOf('conversation', true) === GM.specificityOf('conversation') && GM.specificityOf('group', 'yes') === GM.specificityOf('group'), 'the rank: a parent\'s group entry sits below the caller\'s own group and above All agents (only `true` says so; a conversation\'s rank is its own)');
    const kOld = { id: 'ak-00000000001a', name: 'parent-key', scopes: [verb2], digest: 'd', at: 1 }, kNew = { id: 'ak-00000000001b', name: 'own-key', scopes: [verb2], digest: 'd', at: 2 };
    const gOf = (k, id, to, reach) => AK2.grantOf({ id, keyId: k.id, mode: 'always', at: 1, reach, use: { door: 'automation-key-use', resource: id, to, except: [] }, reachRow: null });
    const pickScene = () => AK2.pickKey({ keys: [kOld, kNew], grants: [gOf(kOld, 'ag-00000000001a', [P], 'instance'), gOf(kNew, 'ag-00000000001b', [{ kind: 'group', id: 'tg-c' }], 'opened')], subject: 'session:k1', subjectGroups: ['tg-c'], subjectInherited: ['tg-p'], verb: verb2 });
    const pk = pickScene();
    ok(pk.ok && pk.key && pk.key.id === kNew.id, 'pickKey: the key granted to the caller\'s OWN group wins over an older key granted to its parent (the parent\'s instance reach never rides in its place)', pk);
    {
      const real = GM.specificityOf;
      GM.specificityOf = (kind) => real(kind);   // CONTROL: the order without the parent's step
      let pc = null;
      try { pc = pickScene(); } finally { GM.specificityOf = real; }
      ok(pc && pc.ok && pc.key && pc.key.id === kOld.id, 'CONTROL: an order that ranks a parent\'s group as the caller\'s own picks the OLDER parent key — the leg above would be red', pc);
    }
    // the U3d read (2, 3): a target whose groups or lineage could not be read — or a lineage that is no list — refuses by name
    const rx = (t) => AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: { conversationId: 'k1', groups: ['tg-c'], ...t }, opened: [], reach: 'instance', reachRows: [{ door: 'automation-key-reach', resource: 'ag-1', to: [EV], except: [P] }] });
    ok(rx({ inherited: ['tg-p'] }).code === 'excepted' && rx({ inherited: [] }).ok && rx({ inherited: [], groupsUnreadable: true }).code === 'groups_unreadable' && rx({ inherited: 'tg-p' }).code === 'groups_unreadable', 'automation-key-reach: «everyone except the parent» leaves the child\'s conversation out; a target whose lineage could not be read (or is no list) is refused groups_unreadable, never reached', [rx({ inherited: ['tg-p'] }), rx({ inherited: [], groupsUnreadable: true }), rx({ inherited: 'tg-p' })]);
    const ux = (inh) => AK2.useVerdict({ key: key2, grants: [g2([EV], [P])], subject: 'session:k1', subjectGroups: ['tg-c'], subjectInherited: inh, verb: verb2, vaultState: 'unlocked' });
    ok(ux('tg-p').code === 'groups_unreadable' && ux(['tg-p']).code === 'excepted' && ux([]).ok, 'automation-key-use: a lineage handed as no list is unreadable (the model\'s reading), never «no parents»', [ux('tg-p'), ux(['tg-p'])]);
    // the chain's cure (B): a key refused by a «仅本组» entry says WHICH (its card names it with its door); the key list says «through
    // its parent Task Group X»
    const uo = AK2.useVerdict({ key: key2, grants: [g2([PO])], subject: 'session:k1', subjectGroups: ['tg-c'], subjectInherited: ['tg-p'], verb: verb2, vaultState: 'unlocked' });
    const uz = AK2.useVerdict({ key: key2, grants: [g2([{ kind: 'group', id: 'tg-z' }])], subject: 'session:k1', subjectGroups: ['tg-c'], subjectInherited: ['tg-p'], verb: verb2, vaultState: 'unlocked' });
    ok(uo.code === 'not_granted' && uo.only && uo.only.id === 'tg-p' && uz.code === 'not_granted' && !uz.only, 'automation-key-use (the cure (B)): a key refused by a «仅本组» entry says which (`only`), a plain refusal does not', [uo, uz]);
    const aeSrc2 = fs.readFileSync(path.join(REPO, 'src/server/automation-engine.js'), 'utf-8'), apiSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-api'), 'utf-8');
    ok(/const r = await ask\(\{ key, caller, verb, signal, args: v0\.args, only: verdict\.only \|\| null \}\);/.test(aeSrc2) && /detail: \[\.\.\.\(onlyLine \? \[onlyLine\] : \[\]\)/.test(aeSrc2) && /const throughOf = \(g\) => \{ const v = GM\.admits\(\[A\.useRowOf\(g\)\]\.filter\(Boolean\), facts\); return GM\.lineageWords\(v, groupNameOf\); \};/.test(aeSrc2) && /\$\{v\.through \? ` \(\$\{v\.through\}\)` : ''\}/.test(apiSrc), 'automation (the cure (B)): the ask card carries the «仅本组» line, the key list (and vibespace-api keys) the through-a-parent words');
    // the producer: conversation-ops hands the reach a target whose lineage read threw as unreadable; the stopped target's
    // lineage is the one the wiring read (the U3d read, 7)
    {
      const OPS2 = require('../src/server/conversation-ops.js');
      const seen = [];
      const verbsOf = (lineageOf, deadOf = () => null) => OPS2.automationVerbs({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', name: 'child' }]]), groupsOf: () => ['tg-c'], lineageOf, deadOf, archive: () => ({ ok: true }) });
      const ctx = { caller: { conversationId: 'c0' }, keyId: key2.id, reach: (t) => { seen.push(t); return { ok: false, code: 'not_granted', why: 'stop here' }; } };
      await verbsOf(() => { throw new Error('the store'); })['conversations.end']({ target: 'w-0001' }, ctx);
      await verbsOf(() => ['tg-p'])['conversations.end']({ target: 'w-0001' }, ctx);
      await verbsOf(() => ['tg-x'], () => ({ conversationId: 'k9', sessionKey: 'claude:k9', name: 'ended', groups: ['tg-c'], inherited: ['tg-p'] }))['conversations.archive']({ target: 'k9' }, ctx);
      await verbsOf(() => ['tg-x'], () => ({ conversationId: 'k9', sessionKey: 'claude:k9', name: 'ended', groups: ['tg-c'], inherited: null }))['conversations.archive']({ target: 'k9' }, ctx);
      ok(seen.length === 4 && seen[0].groupsUnreadable === true && J(seen[0].inherited) === '[]' && !seen[1].groupsUnreadable && J(seen[1].inherited) === '["tg-p"]' && J(seen[2].inherited) === '["tg-p"]' && !seen[2].groupsUnreadable && seen[3].groupsUnreadable === true, 'conversation-ops: a lineage read that throws hands the reach an UNREADABLE target; a stopped target is judged with the lineage the wiring read (its own, never re-read), and one read as null is unreadable', seen);
      // the chain's cure (the U3d read's should): a target whose OWN Task Groups could not be read is unreadable too (was «in no group»)
      const seenG = [];
      await OPS2.automationVerbs({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', name: 'child' }]]), groupsOf: () => { throw new Error('the store'); }, lineageOf: () => ['tg-p'] })['conversations.end']({ target: 'w-0001' }, { ...ctx, reach: (t) => { seenG.push(t); return { ok: false, code: 'not_granted', why: 'stop here' }; } });
      const mpwSrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
      ok(seenG.length === 1 && seenG[0].groupsUnreadable === true && /const automationGroupsStrict = \(s, id\) => \{ const g = automationGroupsRead\(s, id\); if \(g\.unreadable\) throw/.test(mpwSrc) && /groupsOf: automationGroupsStrict,/.test(mpwSrc), 'conversation-ops (the cure): a reach target whose own Task Groups could not be read is handed to the reach UNREADABLE — the wiring\'s strict read throws', seenG);
    }
    // THE MEETING (restack 415): the 2.369.414 train's new reach doors — conversations.list, conversations.resume (a live target and
    // an ended one), conversations.propose's rows, jobs.wakeGrant's owner — each hands the reach the target's ANCESTORS. Judged by the
    // REAL reach (automation-key-reach): «everyone except the parent» leaves the child's conversation out at every door, a grant to the
    // parent reaches it, a lineage read that throws is refused unreadable by name. RED: each door with its ancestors planted as []
    // (the train's own reading). Every verdict judged is printed.
    {
      const EPS = require('../src/server/end-proposals.js'), DWV = require('../src/server/delivery-wake.js');
      const EXC = [{ door: 'automation-key-reach', resource: 'ag-1', to: [EV], except: [P] }], PAR = [{ door: 'automation-key-reach', resource: 'ag-1', to: [P] }];
      const READS = () => ['tg-p'], THROWS = () => { throw new Error('the Task Group store'); };
      const doors = async (mods, rows, lineageOf) => {
        const judged = [], filed = [];
        let granted = 0;
        const reach = (t) => { const v = AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: t, opened: [], reach: 'instance', reachRows: rows }); judged.push(v.ok ? 'ok' : v.code); return v; };
        const ctx = { caller: { conversationId: 'c0', sessionKey: 'claude:c0', name: 'Manager' }, keyId: key2.id, reach };
        const listFacts = { list: async () => ({ at: 1, machine: null, desktops: [], conversations: [{ key: 'claude:k1', id: 'w-0001', name: 'child', groups: ['tg-c'], state: 'idle' }], browsers: [], pass: 1 }) };
        const recorded = (() => { try { return lineageOf(['tg-c']); } catch { return null; } })();   // what the wiring's endedKeyOf reads with the record
        const ops = mods.ops.automationVerbs({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', backend: 'claude', name: 'child' }]]), groupsOf: () => ['tg-c'], lineageOf, listFacts,
          deadOf: (t) => (t === 'k9' ? { conversationId: 'k9', sessionKey: 'claude:k9', name: 'ended', groups: ['tg-c'], inherited: recorded } : null) });
        const eps = mods.eps.create({ userTodos: { idsWhere: () => [], get: () => null, add: (k, it) => { filed.push(it); return { id: 'td-1' }; } }, listFacts, lineageOf });
        const jm = { ready: true, jobs: new Map([['j-1', { id: 'j-1', owner: { conversation: { id: 'k1' } } }]]), changeWakeGrants: async () => { granted++; return { ok: true, rows: [{ ok: true, changed: true }] }; } };
        const dw = mods.dw.automationVerbs({ jobs: () => jm, ownerFactsOf: () => ({ groups: ['tg-c'], inherited: recorded }) });   // restack 416: the wiring's ONE read (groups and ancestors)
        const list = await ops['conversations.list']({}, ctx);
        const live = await ops['conversations.resume']({ target: 'w-0001' }, ctx), ended = await ops['conversations.resume']({ target: 'k9' }, ctx);
        let prop; try { prop = await eps.propose({ targets: ['k1'], why: 'its work is done' }, ctx); } catch (e) { prop = { threw: String((e && e.message) || e) }; }
        const wake = await dw['jobs.wakeGrant']({ job: 'j-1', grant: true }, ctx);
        return { judged, listed: (list.conversations || []).some((c) => c.key === 'claude:k1'), listHeld: list.groupsUnreadable === true, live: live.code, ended: ended.code, propose: prop.ok === true ? 'filed' : prop.code || prop.threw, filed: filed.length, wake: wake.ok === true ? 'granted' : wake.code, granted };
      };
      const REAL = { ops: require('../src/server/conversation-ops.js'), eps: EPS, dw: DWV };
      const MM = mutantCopies('restack-415-doors', REPO);
      try {
        const opsSrc = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf-8'), epSrc = fs.readFileSync(path.join(REPO, 'src/server/end-proposals.js'), 'utf-8'), dwSrc = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf-8');
        let o = anchored(opsSrc, ' : lineageOfIds(Array.isArray(r.groups) ? r.groups : []))); } catch { v = null; } }', ' : [])); } catch { v = null; } }', 'list-no-ancestors');
        o = anchored(o, "}, glr === null ? null : lineageOfIds(glr)));   // the hold's fact (as the end verb's)", "}, []));   // the hold's fact (as the end verb's)", 'resume-live-no-ancestors');
        o = anchored(o, '}, d.inherited !== undefined ? d.inherited : lineageOfIds(Array.isArray(d.groups) ? d.groups : [])));   // the hold\'s fact: an ended', "}, []));   // the hold's fact: an ended", 'resume-ended-no-ancestors');
        const RED = {
          ops: MM.load('src/server/conversation-ops.js', o, 'doors-no-ancestors'),
          eps: MM.load('src/server/end-proposals.js', anchored(epSrc, '...lineageFacts(r.groupsUnreadable === true ? null : (Array.isArray(r.groups) ? r.groups : [])), ', '', 'propose-no-ancestors'), 'propose-no-ancestors'),
          dw: MM.load('src/server/delivery-wake.js', anchored(dwSrc, 'inherited: inherited || [], ...(inherited === null ? { groupsUnreadable: true } : {}), ', '', 'wake-no-ancestors'), 'wake-no-ancestors'),
        };
        const exc = await doors(REAL, EXC, READS), thr = await doors(REAL, EXC, THROWS), par = await doors(REAL, PAR, READS), excR = await doors(RED, EXC, READS), parR = await doors(RED, PAR, READS);
        for (const [n, x] of [['except-parent', exc], ['except-parent, lineage throws', thr], ['grant to the parent', par], ['RED except-parent', excR], ['RED grant to the parent', parR]]) console.log(`    judged (${n}): ${J(x)}`);
        ok(J(exc.judged) === J(Array(5).fill('excepted')) && !exc.listed && exc.live === 'excepted' && exc.ended === 'excepted' && exc.propose === 'not_visible' && exc.filed === 0 && exc.wake === 'excepted' && exc.granted === 0,
          'the train\'s new doors: a key «everyone except the parent» leaves the CHILD\'s conversation out — not listed, neither resumed (live, ended), not drawn on a proposal card, its job\'s wake grant refused', exc);
        ok(J(thr.judged) === J(Array(5).fill('groups_unreadable')) && !thr.listed && thr.listHeld && thr.live === 'groups_unreadable' && thr.ended === 'groups_unreadable' && thr.propose === 'groups_unreadable' && thr.filed === 0 && thr.wake === 'groups_unreadable' && thr.granted === 0,
          'the same doors, a lineage read that THROWS: refused groups_unreadable by name at each (the list SAYS it), never «no parents»', thr);
        ok(J(par.judged) === J(Array(5).fill('ok')) && par.listed && par.live === 'not_ended' && par.propose === 'filed' && par.filed === 1 && par.wake === 'granted' && par.granted === 1,
          'the same doors, a key granted to the PARENT group: the child\'s conversation is listed, judged for a resume, drawn on the card, its job\'s wake granted', par);
        ok(J(excR.judged) === J(Array(5).fill('ok')) && excR.listed && excR.propose === 'filed' && excR.wake === 'granted',
          'RED CONTROL: the doors without the ancestors (the train\'s reading) — «everyone except the parent» REACHES the child at every door (listed, filed, wake granted): the harm the meeting closes', excR);
        ok(J(parR.judged) === J(Array(5).fill('not_granted')) && !parR.listed && parR.filed === 0 && parR.granted === 0,
          'RED CONTROL: without the ancestors a grant to the parent reaches the child at NO door', parR);
      } finally { try { fs.rmSync(MM.dir, { recursive: true, force: true }); } catch { } }
      const mpw = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
      ok(/const endProposals = require\('\.\/end-proposals\.js'\)\.create\(\{[^\n]*\n  lineageOf: \(ids\) => \{ const tk = getTasks && getTasks\(\); if \(!tk\) throw new Error\('the Task Group store is not ready'\); return tk\.grantGroupsOf\(ids\)\.inherited; \},/.test(mpw)
        && /automationVerbs\(\{ jobs: [^\n]*ownerFactsOf: \(cid\) => \{ const k = endedKeyOf\(cid\); return k \? \{ groups: Array\.isArray\(k\.groups\) \? k\.groups : \[\], inherited: k\.inherited, \.\.\.\(k\.inherited === null \? \{ groupsUnreadable: true \} : \{\}\) \} : null; \},/.test(mpw),
        'the wiring hands both new doors the ONE reader: the proposals its grantGroupsOf (no store ⇒ it throws: unknown), the wake verb the ended record\'s groups AND lineage in ONE read (endedKeyOf — restack 416)');
      // piece 6 (browsers.stop, re-landed onto 2.369.414 — 主开发 r968): the STOP's reach door hands the SAME target (targetOf: the
      // groups hold's fact and the lineage of the holder's groups). Judged by the REAL reach: «everyone except the parent» does not stop
      // a browser held by the CHILD's conversation, a grant to the parent does, a lineage read that throws refuses groups_unreadable BY
      // NAME. RED (anchored): the stop's door with its ancestors planted as [] — «everyone except the parent» STOPS the child's browser.
      {
        const stopDoor = async (O, rows, lineageOf) => {
          const judged = []; let stopped = 0;
          const reach = (t) => { const v = AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: t, opened: [], reach: 'instance', reachRows: rows }); judged.push(v.ok ? 'ok' : v.code); return v; };
          const ctx = { caller: { conversationId: 'c0', sessionKey: 'claude:c0', name: 'Manager' }, keyId: key2.id, reach };
          const row = { id: 'bp-0000c0f1', kind: 'own', name: 'child', holders: [{ browserKey: 'vs-bk-cccccccccccc', sessionId: 'w-0001', turn: 'idle' }], takenOver: false, viewers: 0, personBrowsing: false, inFlight: null, tabsKept: true };
          const ops = O.automationVerbs({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', backend: 'claude', name: 'child' }]]), groupsOf: () => ['tg-c'], lineageOf,
            browsers: { rows: () => [row], stop: async () => { stopped++; return { freed: true }; } } });
          const r = await ops['browsers.stop']({ id: row.id }, ctx);
          return { judged, code: r.ok ? 'stopped' : r.code, why: r.why || null, stopped };
        };
        const SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf-8');
        const STOP_AT = "}, glr === null ? null : lineageOfIds(gl))); } catch { v = null; }   // the stop's reach (as the end verb's)";
        ok(SRC.split(STOP_AT).length === 2, 'control setup: the stop\'s reach door (its lineage) is found once');
        const MS = mutantCopies('stop-door-415', REPO);
        try {
          const REDO = MS.load('src/server/conversation-ops.js', anchored(SRC, STOP_AT, "}, [])); } catch { v = null; }   // the stop's reach (as the end verb's)", 'stop-no-ancestors'), 'stop-no-ancestors');
          const OPSR = require('../src/server/conversation-ops.js');
          const exc = await stopDoor(OPSR, EXC, READS), thr = await stopDoor(OPSR, EXC, THROWS), par = await stopDoor(OPSR, PAR, READS), excR = await stopDoor(REDO, EXC, READS), parR = await stopDoor(REDO, PAR, READS);
          for (const [n, x] of [['stop, except-parent', exc], ['stop, lineage throws', thr], ['stop, grant to the parent', par], ['RED stop, except-parent', excR], ['RED stop, grant to the parent', parR]]) console.log(`    judged (${n}): ${J(x)}`);
          ok(J(exc.judged) === J(['excepted']) && exc.code === 'excepted' && /left that conversation out of this grant/.test(exc.why || '') && !/not yours/.test(exc.why || '') && exc.stopped === 0, 'the STOP door: a key «everyone except the parent» does not stop a browser held by the CHILD\'s conversation — refused in the EXCEPTION\'s own words (excepted, round wztkervx5 (a)), nothing stopped', exc);
          ok(J(thr.judged) === J(['groups_unreadable']) && thr.code === 'groups_unreadable' && thr.stopped === 0, 'the STOP door, a lineage read that THROWS: refused groups_unreadable BY NAME (never «it is not yours»), nothing stopped', thr);
          ok(J(par.judged) === J(['ok']) && par.code === 'stopped' && par.stopped === 1, 'the STOP door, a key granted to the PARENT group: the child\'s browser nobody uses is stopped', par);
          ok(J(excR.judged) === J(['ok']) && excR.code === 'stopped' && excR.stopped === 1, 'RED CONTROL: the stop door without the ancestors — «everyone except the parent» STOPS the child\'s browser: the harm the law closes', excR);
          ok(J(parR.judged) === J(['not_granted']) && parR.code === 'not_granted' && parR.stopped === 0, 'RED CONTROL: without the ancestors a grant to the parent stops none', parR);
        } finally { try { fs.rmSync(MS.dir, { recursive: true, force: true }); } catch { } }
      }
    }
    // restack 416 — 主开发 r311 (a): a list / propose ROW whose own Task Groups are still being read (the facts builder's mark, from the
    // wiring's STRICT read) is refused unreadable BY NAME at both doors — never «in no group»; (b): a door wired with NO lineage reader
    // reads the groups it holds as UNKNOWN, and no group as no ancestors (a fact). RED (anchored): the doors that ignore the row's mark list
    // and draw it; the conversation doors' old default («no parents») lists a child of the excepted parent. Every verdict judged is printed.
    {
      const EPS6 = require('../src/server/end-proposals.js'), DWV6 = require('../src/server/delivery-wake.js'), OPS6 = require('../src/server/conversation-ops.js');
      const EXC6 = [{ door: 'automation-key-reach', resource: 'ag-1', to: [EV], except: [P] }];
      const rowDoors = async (mods, row, lineageOf) => {
        const judged = [], filed = [];
        const reach = (t) => { const v = AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: t, opened: [], reach: 'instance', reachRows: EXC6 }); judged.push(v.ok ? 'ok' : v.code); return v; };
        const ctx = { caller: { conversationId: 'c0', sessionKey: 'claude:c0', name: 'Manager' }, keyId: key2.id, reach };
        const listFacts = { list: async () => ({ at: 1, machine: null, desktops: [], conversations: [row], browsers: [], pass: 1 }) };
        const hook = typeof lineageOf === 'function' ? { lineageOf } : {};
        const ops = mods.ops.automationVerbs({ activeSessions: new Map(), listFacts, ...hook });
        const eps = mods.eps.create({ userTodos: { idsWhere: () => [], get: () => null, add: (k, it) => { filed.push(it); return { id: 'td-1' }; } }, listFacts, ...hook });
        const list = await ops['conversations.list']({}, ctx);
        let prop; try { prop = await eps.propose({ targets: ['k1'], why: 'its work is done' }, ctx); } catch (e) { prop = { threw: String((e && e.message) || e) }; }
        return { judged, listed: (list.conversations || []).some((c) => c.key === 'claude:k1'), listHeld: list.groupsUnreadable === true, propose: prop.ok === true ? 'filed' : prop.code || prop.threw, filed: filed.length };
      };
      const row = (more) => ({ key: 'claude:k1', id: 'w-0001', name: 'child', groups: [], state: 'idle', ...more });
      const NOREADER = null, READS6 = () => ['tg-p'];
      const MM6 = mutantCopies('restack-416-rows', REPO);
      try {
        const opsSrc6 = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf-8'), epSrc6 = fs.readFileSync(path.join(REPO, 'src/server/end-proposals.js'), 'utf-8');
        const RED6 = {
          ops: MM6.load('src/server/conversation-ops.js', anchored(opsSrc6, '}, r.groupsUnreadable === true ? null : lineageOfIds(', '}, lineageOfIds(', 'list-ignores-row-mark'), 'list-ignores-row-mark'),   // stale-pins: kept (the mutant restores the list line without the row mark)
          eps: MM6.load('src/server/end-proposals.js', anchored(epSrc6, '...lineageFacts(r.groupsUnreadable === true ? null : (Array.isArray(r.groups) ? r.groups : [])), ', '...lineageFacts(Array.isArray(r.groups) ? r.groups : []), ', 'propose-ignores-row-mark'), 'propose-ignores-row-mark'),   // stale-pins: kept (the mutant restores the propose line without the row mark)
        };
        const RED6b = { ops: MM6.load('src/server/conversation-ops.js', anchored(opsSrc6, "if (typeof lineageOf !== 'function') return null; try {", "if (typeof lineageOf !== 'function') return []; try {", 'ops-no-reader-no-parents'), 'ops-no-reader-no-parents'), eps: MM6.load('src/server/end-proposals.js', anchored(epSrc6, "if (typeof lineageOf !== 'function') return { inherited: [], groupsUnreadable: true }; let l = null;", "if (typeof lineageOf !== 'function') return { inherited: [] }; let l = null;", 'propose-no-reader-no-parents'), 'propose-no-reader-no-parents') };   // stale-pins: kept (the mutants restore the old «no parents» defaults)
        const REAL6 = { ops: OPS6, eps: EPS6 };
        const aMine = await rowDoors(REAL6, row({ groupsUnreadable: true }), READS6), aRed = await rowDoors(RED6, row({ groupsUnreadable: true }), READS6);
        const bHeld = await rowDoors(REAL6, row({ groups: ['tg-c'] }), NOREADER), bNone = await rowDoors(REAL6, row({ groups: [] }), NOREADER), bRed = await rowDoors(RED6b, row({ groups: ['tg-c'] }), NOREADER);
        const asked6 = [];
        const jm6 = { ready: true, jobs: new Map([['j-6', { id: 'j-6', owner: { conversation: { id: 'k1' } } }]]), changeWakeGrants: async () => ({ ok: true, rows: [{ ok: true, changed: true }] }) };
        const wake6 = async (groupsOf) => { const r = await DWV6.automationVerbs({ jobs: () => jm6, groupsOf })['jobs.wakeGrant']({ job: 'j-6', grant: true }, { caller: {}, keyId: key2.id, reach: (t) => { asked6.push(t.groupsUnreadable === true ? 'unreadable' : 'read'); return AK2.reachVerdict({ keyId: key2.id, caller: 'c0', target: t, opened: [], reach: 'instance', reachRows: EXC6 }); } }); return r.ok ? 'granted' : r.code; };
        const wHeld = await wake6(() => ['tg-c']), wNone = await wake6(() => []);
        for (const [n, x] of [['(a) a row still being read', aMine], ['(a) RED: the doors ignore the mark', aRed], ['(b) groups, no reader wired', bHeld], ['(b) no group, no reader wired', bNone], ['(b) RED: the old «no parents» default', bRed]]) console.log(`    judged ${n}: ${J(x)}`);
        console.log(`    judged (b) the wake verb, no reader wired: groups ⇒ ${wHeld}, no group ⇒ ${wNone} (the reach saw ${J(asked6)})`);
        ok(J(aMine.judged) === J(['groups_unreadable', 'groups_unreadable']) && !aMine.listed && aMine.listHeld && aMine.propose === 'groups_unreadable' && aMine.filed === 0,
          'restack 416 (a): a list / propose row whose own Task Groups are still being read is refused unreadable BY NAME at both doors (the list SAYS it), never listed or drawn as «in no group»', aMine);
        ok(J(aRed.judged) === J(['ok', 'ok']) && aRed.listed && aRed.propose === 'filed' && aRed.filed === 1, 'RED CONTROL (a): doors that ignore the row\'s mark list it and draw it on an end card for «everyone except the parent» (the release\'s gap)', aRed);
        ok(J(bHeld.judged) === J(['groups_unreadable', 'groups_unreadable']) && !bHeld.listed && bHeld.listHeld && bHeld.propose === 'groups_unreadable' && J(bNone.judged) === J(['ok', 'ok']) && bNone.listed && bNone.propose === 'filed' && wHeld === 'groups_unreadable' && wNone === 'granted' && J(asked6) === J(['unreadable', 'read']),
          'restack 416 (b): a door wired with NO lineage reader reads the groups it holds as UNKNOWN (list, propose, the wake verb refuse by name) — and no group as no ancestors (served)', { bHeld, bNone, wHeld, wNone, asked6 });
        ok(J(bRed.judged) === J(['ok', 'ok']) && bRed.listed && bRed.propose === 'filed', 'RED CONTROL (b): the doors\' old default («no parents» when no reader is wired) lists a conversation in a group and draws it on an end card for «everyone except the parent» — its groups\' ancestors were never read', bRed);
      } finally { try { fs.rmSync(MM6.dir, { recursive: true, force: true }); } catch { } }
      const cfx6 = fs.readFileSync(path.join(REPO, 'src/server/conversation-facts.js'), 'utf-8'), mpw6 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8'), co6 = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf-8'), cards6 = fs.readFileSync(path.join(REPO, 'src/server/channel-api-cards.js'), 'utf-8');
      ok(/const gRead = \(\(\) => \{ if \(typeof groupsOf !== 'function'\) return \[\]; try \{ const g = groupsOf\(s, id\); return Array\.isArray\(g\) \? g : \[\]; \} catch \{ return null; \} \}\)\(\);/.test(cfx6) && /groups: gRead \|\| \[\], \.\.\.\(gRead === null \? \{ groupsUnreadable: true \} : \{\}\),/.test(cfx6)
        && /return CFX\.create\(\{ activeSessions, groupsOf: automationGroupsStrict /.test(mpw6) && !/automationGroupsOf/.test(mpw6)   // stale-pins: kept (an absence check: the unused non-strict reader is gone)
        && (co6.match(/\|\| \(live && \(live\.inherited === null \|\| live\.groupsUnread === true\)\) \? \{ groupsUnreadable: true \} : \{\}\)/g) || []).length === 2
        && /inherited = tasks \? tasks\.grantGroupsOf\(groups\)\.inherited : null;/.test(mpw6)
        && /inheritedGroups: p\.principal\.inheritedGroups === null \? null : \(p\.principal\.inheritedGroups \|\| \[\]\)/.test(cards6),
        'restack 416 (a), (c), (d), (e): the facts builder marks a row whose strict read throws and the list reads strictly; the outbound road\'s two principals read a live row\'s null lineage or «still being read» mark as unreadable; the ended record with no store is unknown; a recorded null lineage stays null on the card\'s road');
    }
  }
  // the chain's cure (E, the U3c read): an API proposal's approve judges the LIVE lineage while its conversation runs — the real
  // engine's ONE tier judge (apiTierFor), a parent group's grant, the recorded principal of a proposal filed earlier
  {
    const ENGL = require('../src/server/channels-engine.js'), FA = require('../src/channel-api.js');
    const dE = dirOf(`api-live-${++worldN}`); fs.mkdirSync(dE, { recursive: true });
    let liveL = [{ cid: 'k1', name: 'Child', groups: ['tg-c'], inherited: ['tg-p'] }];
    const engL = ENGL.create({ dataDir: dE, log: { log() {}, info() {}, warn() {}, error() {} }, fetch: async () => { throw new Error('no network in this suite'); }, liveSessions: () => liveL });
    const wL = await engL.setApiGrants('lark-y', [FA.apiGrant({ principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, cred: 'lark-y', tier: 'write-ask', at: 1 })], { by: 'user' });
    const recorded = { kind: 'agent', id: 'k1', name: 'Child', groups: ['tg-c'], inheritedGroups: ['tg-p'] };   // as the proposal recorded it at filing
    const tFiled = engL.apiTierFor(recorded, 'lark-y').tier;
    liveL = [{ cid: 'k1', name: 'Child', groups: ['tg-c'], inherited: [] }];   // the owner took P away as C's parent
    const tLive = engL.apiTierFor(recorded, 'lark-y').tier;
    liveL = [];   // the conversation ended: the engine of the release (no lineage reader) keeps the recorded lineage
    const tEnded = engL.apiTierFor(recorded, 'lark-y').tier;
    // restack 415 — the train's «still being read» mark (B-43bc: the roster's `groupsUnread`): a RUNNING conversation whose Task Groups
    // are still being read is UNKNOWN to the tier — never «in no group» («All agents except C's own group» would serve C). RED (anchored,
    // its plant proven by anchored()): the engine whose live reader drops the mark serves it
    {
      const MARK = '(s.inherited === null ? null : []), ...(s.groupsUnread === true ? { groupsUnreadable: true } : {}) } : null;';
      const MU5 = mutantCopies('restack-415-live-mark', REPO);
      try {
        const ENGR = MU5.load('src/server/channels-engine.js', anchored(engineSource(REPO), MARK, '(s.inherited === null ? null : []) } : null;', 'live-mark-dropped'), 'live-mark-dropped');   // stale-pins: kept (the mutant restores the reader's line without the mark)
        const tierOf = async (E, tag) => {
          const d = dirOf(`api-unread-${tag}-${++worldN}`); fs.mkdirSync(d, { recursive: true });
          const e = E.create({ dataDir: d, log: { log() {}, info() {}, warn() {}, error() {} }, fetch: async () => { throw new Error('no network in this suite'); }, liveSessions: () => [{ cid: 'k1', name: 'Child', groups: [], inherited: [], groupsUnread: true }] });
          const w = await e.setApiGrants('lark-y', [FA.apiGrant({ principal: { kind: 'everyone', id: '*' }, cred: 'lark-y', tier: 'read', at: 1 })], { by: 'user', except: [{ kind: 'group', id: 'tg-c' }] });
          return { set: w.ok === true, tier: e.apiTierFor(recorded, 'lark-y').tier };
        };
        const uMine = await tierOf(ENGL, 'mine'), uRed = await tierOf(ENGR, 'red');
        console.log(`    judged (a running conversation still being read, «All agents except tg-c»): mine ${J(uMine)} · RED ${J(uRed)}`);
        ok(uMine.set && uMine.tier === 'none', 'restack 415: a RUNNING conversation whose Task Groups are still being read (the roster\'s groupsUnread) gets NO tier from «All agents except its own group» — unknown, never «in no group»', uMine);
        ok(uRed.set && uRed.tier === 'read', 'RED CONTROL: a live reader that drops the mark judges it «in no group» — «All agents except its own group» SERVES it (the harm)', uRed);
      } finally { try { fs.rmSync(MU5.dir, { recursive: true, force: true }); } catch { } }
    }
    ok(wL.ok && tFiled === 'write-ask' && tLive === 'none' && tEnded === 'write-ask', 'cure (E): the API tier of a recorded principal is judged with the LIVE lineage while its conversation runs (a parent removed since ⇒ none); an engine with no lineage reader keeps the recorded one for an ended conversation (the RED control of B-4852 below: the plant is the missing reader)', { wL: wL.ok, tFiled, tLive, tEnded });
    // B-4852: the engine as the hub builds it — WITH the Task Group store's lineage reader: an ENDED conversation's recorded own groups are
    // re-read NOW (a parent removed since no longer counts; one kept still does); a read that throws judges own groups alone
    let lineageNow = (ids) => (ids.includes('tg-c') ? ['tg-p'] : []);
    const dE2 = dirOf(`api-ended-${++worldN}`); fs.mkdirSync(dE2, { recursive: true });
    const engE = ENGL.create({ dataDir: dE2, log: { log() {}, info() {}, warn() {}, error() {} }, fetch: async () => { throw new Error('no network in this suite'); }, liveSessions: () => [], lineageOf: (ids) => lineageNow(ids) });
    const wE = await engE.setApiGrants('lark-y', [FA.apiGrant({ principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, cred: 'lark-y', tier: 'write-ask', at: 1 })], { by: 'user' });
    const eKept = engE.apiTierFor(recorded, 'lark-y').tier;
    lineageNow = () => [];   // the owner took P away as C's parent, after the conversation ended
    const eRemoved = engE.apiTierFor(recorded, 'lark-y').tier;
    lineageNow = () => { throw new Error('the store'); };
    const eThrew = engE.apiTierFor(recorded, 'lark-y').tier;
    const ownGrant = await engE.setApiGrants('lark-y', [FA.apiGrant({ principal: { kind: 'group', id: 'tg-c', name: 'Child' }, cred: 'lark-y', tier: 'read', at: 2 })], { by: 'user' });
    const eOwn = engE.apiTierFor(recorded, 'lark-y').tier;
    const srvE = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8'), cwE = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf-8');
    ok(wE.ok && eKept === 'write-ask' && eRemoved === 'none' && eThrew === 'none' && ownGrant.ok && eOwn === 'read' && /userTodos, lineageOf: \(ids\) => tasks\.grantGroupsOf\(ids\)\.inherited, readUserState:/.test(srvE) && /liveSessions, lineageOf, readMembership, mountClients,/.test(cwE), 'B-4852: an ENDED conversation\'s API proposal is judged with its recorded own groups\' ancestors read NOW — a kept parent still counts, a removed one no longer does, a lineage read that throws is UNKNOWN — a parent\'s grant undecided (refused by name), the own group\'s grant still serves; server.js hands the ONE reader to the channels engine', { eKept, eRemoved, eThrew, eOwn });
  }
  // the chain's cure (B): `vibespace-channels status` never says «as a member of group P» for a conversation only in a child of P
  {
    const caSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8'), chCli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf-8');
    ok(/const viaParent = r\.principal\.kind === 'group' && \(F\.rowVerdict\(r, ctx\) \|\| \{\}\)\.inherited === true;/.test(caSrc) && /\.\.\.\(viaParent \? \{ inherited: true \} : \{\}\), as: \{ kind: r\.principal\.kind/.test(caSrc) && /a\.inherited \? ` \(through its parent Task Group \$\{a\.as\.name \|\| a\.as\.id\}\)` : ` \(as a member of group/.test(chCli), 'channels (the cure (B)): an access row reached through the lineage is marked, and the status line says «through its parent Task Group», never «as a member»');
  }
  // the cure's cure (a should of its read taken): `status` reads THE model's mark — rowVerdict is rowNames' verdict itself
  {
    const CF5 = require('../src/channel-filter.js');
    const kidCtx = { kind: 'agent', id: 'k1', groups: ['tg-c'], inheritedGroups: ['tg-p'] };
    const rv5 = typeof CF5.rowVerdict === 'function' ? CF5.rowVerdict : () => undefined;   // a tree without it: red BY NAME below, never a throw
    const vPar = rv5({ principal: { kind: 'group', id: 'tg-p', name: 'Parent' } }, kidCtx), vOwn = rv5({ principal: { kind: 'group', id: 'tg-c', name: 'Child' } }, kidCtx);
    const vOnly = rv5({ principal: { kind: 'group', id: 'tg-p', name: 'Parent', only: true } }, kidCtx);
    ok(!!vPar && vPar.ok && vPar.inherited === true && !!vOwn && vOwn.ok && !vOwn.inherited && !!vOnly && !vOnly.ok && CF5.rowNames({ principal: { kind: 'group', id: 'tg-p' } }, kidCtx) === true && rv5({ principal: { kind: 'group', id: 'tg-p' } }, { kind: 'user', id: 'u' }) === null, 'channels status (the cure\'s cure): rowVerdict — rowNames\' verdict itself — marks a parent\'s row reached through the lineage `inherited`, never an own group\'s; «仅本组» holds the child out; rowNames reads the same verdict', { vPar, vOwn: vOwn && vOwn.ok, vOnly: vOnly && vOnly.code });
  }
  // the chain's cure (C, U5c is part of the row): the «仅本组» switch on the exit and window dialogs, each write carrying it to the ONE writer
  {
    const EXR = require('../src/exit-reach.js'), WRR = require('../src/window-reach.js');
    // exit: the dialog's group row says only:true / only:false; the write path keeps it to the stored row; the list's stamp sees a flip
    const wp = [EXR.whoPrincipal({ kind: 'group', id: 'tg-p', only: true }), EXR.whoPrincipal({ kind: 'group', id: 'tg-p', only: false }), EXR.whoPrincipal({ kind: 'group', id: 'tg-p' }), EXR.whoPrincipal({ kind: 'group', id: 'tg-p', only: 'yes' })];
    const pv = EXR.patchVerdict(null, { use: { mode: 'only', who: [{ kind: 'group', id: 'tg-p', only: true }] }, run: { mode: 'nobody' } });
    const acc1 = pv.ok ? pv.access : null;
    const rows1 = acc1 && acc1.use ? EXR.exitRows(acc1, 'h1') : [];
    const stampOn = acc1 && acc1.use ? EXR.exitStamp(acc1) : '', stampOff = acc1 && acc1.use ? EXR.exitStamp({ ...acc1, use: { ...acc1.use, who: acc1.use.who.map((w) => ({ kind: w.kind, id: w.id })) } }) : '';
    ok(wp[0].only === true && wp[1].only === false && !('only' in wp[2]) && !('only' in wp[3]) && pv.ok && rows1.length && rows1[0].to[0].only === true && stampOn !== stampOff, 'exit (the cure (C)): the dialog\'s «仅本组» (true / switched off false) rides whoPrincipal → the stored row; the list\'s stamp sees a flip', { wp, pv: pv.ok, to: rows1[0] && rows1[0].to, same: stampOn === stampOff });
    // window: ONE verb switches the shared group's entry; on narrows, off widens; not a group / not shared refuses by name
    const rec0 = WRR.recordOfRows('w1', 'reach', [{ door: 'window', resource: 'w1', to: [P], except: [] }]);
    const on = WRR.setOnly(rec0, { kind: 'group', id: 'tg-p' }, true), off = WRR.setOnly(on.record, { kind: 'group', id: 'tg-p' }, false);
    const kidW = { sessionKeys: ['claude:k1'], conversationKeys: ['k1'], groupIds: ['tg-c'], inheritedGroupIds: ['tg-p'] };
    ok(on.ok && on.changed && WRR.reachFor(on.record, kidW).level === 'hidden' && off.ok && off.changed && WRR.reachFor(off.record, kidW).level === 'exposed' && !WRR.setOnly(rec0, { kind: 'group', id: 'tg-z' }, true).ok && !WRR.setOnly(rec0, { kind: 'everyone', id: '*' }, true).ok && JSON.stringify(WRR.pickerModel({ record: on.record }).onlyKeys) === '["group:tg-p"]', 'window (the cure (C)): setOnly on narrows the shared group to itself (the child is hidden), off includes its child groups again; a group not shared / not a group refuses; the picker model answers the switch\'s stored state');
    const exD = fs.readFileSync(path.join(REPO, 'src/lib/exit-access-dialog.js'), 'utf-8'), wsD = fs.readFileSync(path.join(REPO, 'src/lib/window-share.js'), 'utf-8'), wte = fs.readFileSync(path.join(REPO, 'src/server/window-targets-engine.js'), 'utf-8'), dar = fs.readFileSync(path.join(REPO, 'src/routes/desktop-apps.js'), 'utf-8');
    ok(/only: \{ keys: pick\.only \|\| \[\] \} \}\);/.test(exD) && /sw\.includes\(k\) \? \{ only: true \} : s\.onlyWas\.includes\(k\) \? \{ only: false \} : \{\}\)/.test(exD) && /return w && w\.kind === 'group' \? \{ kind: 'group', id: w\.id \} : w;/.test(exD)
      && /only: onOnly \? \{ keys: \(model\.onlyKeys \|\| \[\]\)\.slice\(\) \} : null,/.test(wsD) && /fetchJson\(`\$\{base\}\/only`, \{ method: 'PUT'/.test(wsD)
      && /const to = widenGroup \? row\.to\.map\(\(e\) => \(e\.kind === 'group' && e\.id === widenGroup \? \{ \.\.\.e, only: false \} : e\)\) : row\.to;/.test(wte) && /putReach\(rec\.id, s\.record, 'user', \[\], on === true \? null : p\.id\);/.test(wte)
      && /router\.put\('\/api\/desktop\/apps\/:id\/reach\/only'/.test(dar), 'the exit and window dialogs offer the switch and carry it: exit\'s Save (only:true / only:false, never on an exception), window\'s ONE verb (off said explicitly to the writer)');
  }
  // the chain's cure (C): the «仅本组» switch on the vault-use and channel dialogs, each write carrying it to the ONE writer
  {
    const VU3 = require('../src/vault-use-grant.js'), ACL3 = require('../src/channel-acl.js'), CF3 = require('../src/channel-filter.js');
    const sm = [VU3.scopedMember({ kind: 'group', id: 'tg-p', only: true, scopes: [] }), VU3.scopedMember({ kind: 'group', id: 'tg-p', only: false, scopes: [] }), VU3.scopedMember({ kind: 'group', id: 'tg-p', scopes: [] })];
    const vRow0 = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf-8');
    const flipPin = (vRow0.match(/sigOf\((?:scopesOfM\(m\)|Array\.isArray\(m\.scopes\) \? m\.scopes : \[\])\) \+ \(m\.only === true \? '#only' : ''\)/g) || []).length;
    ok(sm[0].only === true && sm[1].only === false && !('only' in sm[2]) && flipPin === 2, 'vault-use (the cure (C)): a rebuilt member keeps the «仅本组» it says (a silent one would be refused only_unnamed); rowChanged counts a flag-only change as a change', { sm, flipPin });
    const vg = [ACL3.validateGrant({ principal: { kind: 'group', id: 'tg-p', only: true }, scope: { kind: 'conversation', id: 'a1/c1' }, level: 'visible', origin: 'user' }), ACL3.validateGrant({ principal: { kind: 'group', id: 'tg-p', only: false }, scope: { kind: 'conversation', id: 'a1/c1' }, level: 'visible', origin: 'user' }), ACL3.validateGrant({ principal: { kind: 'agent', id: 'k1', only: true }, scope: { kind: 'conversation', id: 'a1/c1' }, level: 'visible', origin: 'user' })];
    const fc = [GM.fromChannelPrincipal({ kind: 'group', id: 'tg-p', only: true }), GM.fromChannelPrincipal({ kind: 'group', id: 'tg-p', only: false }), GM.fromChannelPrincipal({ kind: 'group', id: 'tg-p' })];
    ok(vg[0].ok && vg[0].grant.principal.only === true && vg[1].grant.principal.only === false && !('only' in vg[2].grant.principal) && fc[0].only === true && fc[1].only === false && !('only' in fc[2]) && typeof CF3.validateWatchers === 'function', 'channels (the cure (C)): validateGrant and the channel spelling keep a group\'s «仅本组» (true, or false = switched off — the ONE writer widens only then); never on an agent');
    const vRow = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf-8'), reE = fs.readFileSync(path.join(REPO, 'src/lib/channel-reach-editor.js'), 'utf-8'), apD = fs.readFileSync(path.join(REPO, 'src/lib/channel-api-dialog.js'), 'utf-8'), feE = fs.readFileSync(path.join(REPO, 'src/lib/channel-filter-editor.js'), 'utf-8'), caS = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8'), cfS = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    ok(/only: \{ keys: \(stored\.only \|\| \[\]\)\.slice\(\) \}/.test(vRow) && /\{ held: exNow, only: typeof picker\.onlyKeys === 'function' \? picker\.onlyKeys\(\) : null, onlyWas \}/.test(vRow) && /onlyWas = \(stored\.only \|\| \[\]\)\.slice\(\)/.test(vRow) && /\{ name: 'only', read: \(\) => \(picker && typeof picker\.onlyKeys === 'function' \? picker\.onlyKeys\(\) \|\| \[\] : \[\]\)/.test(vRow)
      && /api\(`\$\{base\}\/reach`, \{ principal: \{ \.\.\.g\.principal, only: !on \}, level: g\.level \}\)/.test(reE)
      && /only: \{ keys: rows\.filter\(\(r\) => r\.onlyWas\)\.map\(\(r\) => r\.key\) \}/.test(apD) && /principal: onlyWire\(r\)/.test(apD)
      && /only: \{ keys: \[\.\.\.onlyWas\] \}/.test(feE) && /only: \{ keys: whoOnlyWas \? \[key\] : \[\] \}/.test(feE) && /principal: \{ kind: p\.kind, id: p\.id, name: p\.name, \.\.\.wOnly \}/.test(feE)
      && (caS.match(/\.\.\.\((?:row|w)\.principal\.only === true \? \{ only: true \} : \{\}\)/g) || []).length === 2
      && /\.\.\.\(p\.kind === 'group' && typeof p\.only === 'boolean' \? \{ only: p\.only \} : \{\}\)/.test(cfS), 'the vault-use and channel dialogs offer the switch and carry it (the reach row, the access list, the watcher, the raw-API tiers; B-f212 r513: the vault-use dialog\'s «仅本组» is a row of its field table, its onlyWas the stored row as last landed); the views carry the stored flag back');
  }
  // the chain's cure (C): «仅本组» on the automation key's «Grant … to» dialog — an added grant carries it, a kept one flips by ONE verb
  {
    const aeC = fs.readFileSync(path.join(REPO, 'src/server/automation-engine.js'), 'utf-8'), arC = fs.readFileSync(path.join(REPO, 'src/routes/automation.js'), 'utf-8'), vaC = fs.readFileSync(path.join(REPO, 'src/lib/vault-automation.js'), 'utf-8'), vwC = fs.readFileSync(path.join(REPO, 'src/lib/value-words.js'), 'utf-8');
    ok(/const use = use1 && \/\^group:\/\.test\(s\) && Array\.isArray\(only\) && only\.map\(String\)\.includes\(s\)/.test(aeC) && /function setOnly\(grantId, on, \{ by = 'user' \} = \{\}\) \{/.test(aeC) && /const to = n\.row\.to\.map\(\(e\) => \(e\.kind === 'group' \? \{ \.\.\.e, only: on === true \} : e\)\);/.test(aeC) && /\.\.\.\(onlyOf\(g\.use\) \? \{ only: true \} : \{\}\)/.test(aeC)
      && /app\.post\('\/api\/automation\/grants\/:grantId\/only', person\(\(req\) => engine\.setOnly\(/.test(arC) && /\.\.\.\(Array\.isArray\(body\(req\)\.only\) \? \{ only: body\(req\)\.only \} : \{\}\)/.test(arC)
      && /only: \{ keys: always\.filter\(\(g\) => g\.only === true/.test(vaC) && /`\/api\/automation\/grants\/\$\{encodeURIComponent\(g\.id\)\}\/only`/.test(vaC) && /'key\.only': i18nKey\('changed «this group only»'\)/.test(vwC), 'automation (the cure (C)): the key dialog offers the switch; an added grant carries it, a kept grant flips by ONE verb (off said explicitly to the writer); the listing carries the stored flag; the audit line has its words');
  }
  // B-fbd6 ITEM 3 (主开发 r4365): THE WAKE RE-PICKS AS THE SAVE DOES — a watcher stored through a group (here the parent tg-p) whose
  // row now leaves it out (its «除了» names the child group), while ANOTHER row (the child group's own) admits it: the save admits
  // it (viaJudge over every group row), so the wake does too; with no other row it stays stopped. RED: the wake that judges the
  // stored group's row alone (the release: stopped in silence, the row listed and inert)
  {
    const CF3 = require('../src/channel-filter.js');
    const members3 = [{ cid: 'k1', groups: ['tg-y'], inherited: ['tg-p'] }];
    const stored3 = { principal: { kind: 'agent', id: 'k1' }, via: 'tg-p' };
    const pRow3 = { row: { principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, authority: 'draft', except: [{ kind: 'group', id: 'tg-y', name: 'Kid' }] }, source: 'grant' };
    const yRow3 = { row: { principal: { kind: 'group', id: 'tg-y', name: 'Kid' }, authority: 'draft' }, source: 'conversation' };
    const w3 = { principal: { kind: 'agent', id: 'k1' }, notify: 'wake', mode: 'all', dailyWakeCap: 50 };
    const save3 = CF3.validateWatchers([w3], [yRow3.row], { inherited: [{ principal: pRow3.row.principal, authority: 'draft', via: 'grant', except: pRow3.row.except }], members: members3 });   // line 999 (b): the parent row ABOVE, with its own «除了» (the product's grant row), the child group's row this grain's
    const judge3 = (CFm) => ({ both: CFm.memberStill(stored3, members3, { rows: [pRow3, yRow3] }), pOnly: CFm.memberStill(stored3, members3, { rows: [pRow3] }), gone: CFm.memberStill(stored3, [{ cid: 'k1', groups: [], inherited: [] }], { rows: [pRow3, yRow3] }) });
    const r3 = judge3(CF3);
    ok(save3.ok === true && save3.watchers[0].via === 'tg-y' && r3.both === true && r3.pOnly === false && r3.gone === false, `B-fbd6 item 3: stored through the parent whose row now leaves its child out, another row (the child's own) admitting it — the save admits it (via ${save3.ok ? save3.watchers[0].via : save3.code}) and so does the wake (${r3.both}); with no other row it stays stopped (${r3.pOnly}); out of every group, stopped (${r3.gone})`, { save: save3.ok ? save3.watchers[0] : save3, r3 });
    const SRC3 = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    const REPICK3 = "    const v = viaJudge(new Set(viaRowOf(repickRows).map((p) => `group:${p.id}`)), s, row.principal.id, repickRows, except);\n    return !!(v && v.ok && v.entry && v.entry.kind === 'group');\n";
    const M3 = mutantCopies('fbd6-repick', REPO);
    const red3 = judge3(M3.load('src/channel-filter.js', anchored(SRC3, REPICK3, '    return false;\n', 'the wake that judges the stored group alone'), 'fbd6-stored-only'));
    ok(red3.both === false && red3.pOnly === false, `B-fbd6 item 3 RED CONTROL: the wake that judges the stored group's row alone — the member another row admits is stopped (${red3.both}) — the leg above would go red`, red3);
  }
  // B-fbd6 LINE 999's MUST (主开发 r4431): THE RE-PICK JUDGES OVER THE ROWS ITS OWN SAVE READS. An ACCOUNT-grain via watcher (saved
  // through the parent tg-p, its session in the child tg-y), the account's tg-p row now excepting the child, ONE conversation's own
  // tg-y row admitting it: the wake hands the re-pick the account's rows and the account-scope grants only (F.repickRowsOf) — NOT
  // woken, as saving it at the account now refuses. A rule's item reads that rule's rows, the account's and the account-scope grants;
  // a conversation's every row. RED: a re-pick over the whole conversation's rows (it wakes the session)
  {
    const CFm = require('../src/channel-filter.js');
    const mem = [{ cid: 'k1', groups: ['tg-y'], inherited: ['tg-p'] }];
    const stored = { principal: { kind: 'agent', id: 'k1' }, via: 'tg-p' };
    const KID = [{ kind: 'group', id: 'tg-y', name: 'Kid' }];
    const acctP = { row: { principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, authority: 'draft', except: KID }, source: 'account', patternId: null, why: [] };
    const convY = { row: { principal: { kind: 'group', id: 'tg-y', name: 'Kid' }, authority: 'draft' }, source: 'conversation', patternId: null, why: [] };
    const ruleR1 = { row: { principal: { kind: 'group', id: 'tg-q', name: 'Q' }, authority: 'draft' }, source: 'pattern', patternId: 'r1', why: [] };
    const ruleR2 = { row: { principal: { kind: 'group', id: 'tg-z', name: 'Z' }, authority: 'draft' }, source: 'pattern', patternId: 'r2', why: [] };
    const gAcct = { principal: { kind: 'group', id: 'tg-a', name: 'A' }, via: 'account', except: [] }, gConv = { principal: { kind: 'group', id: 'tg-c', name: 'C' }, via: 'grant', except: [] };
    const access = [convY, ruleR1, ruleR2, acctP], grants = [gAcct, gConv];
    const wM = { principal: { kind: 'agent', id: 'k1' }, notify: 'wake', mode: 'all', dailyWakeCap: 50 };
    const judgeM = (CFx) => {
      const acctRows = CFx.repickRowsOf({ watcher: stored, source: 'account', patternId: null }, access, grants);
      const ruleRows = CFx.repickRowsOf({ watcher: stored, source: 'pattern', patternId: 'r1' }, access, grants);
      const convRows = CFx.repickRowsOf({ watcher: stored, source: 'conversation', patternId: null }, access, grants);
      return { acctRows, ruleRows, convRows, woken: CFx.memberStill(stored, mem, { rows: [...access, ...grants], repickRows: acctRows }) };
    };
    const rM = judgeM(CFm);
    const saveAcct = CFm.validateWatchers([wM], [acctP.row], { members: mem, except: KID });   // the account save now: its row, the grain's «除了» on it (accessOf's)
    ok(rM.acctRows.length === 2 && rM.acctRows.includes(acctP) && rM.acctRows.includes(gAcct) && rM.ruleRows.length === 3 && rM.ruleRows.includes(ruleR1) && !rM.ruleRows.includes(ruleR2) && rM.convRows.length === 6 && rM.woken === false && saveAcct.ok === false,
      `B-fbd6 line 999's MUST: an ACCOUNT watcher's re-pick reads the account's rows and the account-scope grants (${rM.acctRows.length}), a rule's that rule's rows too (${rM.ruleRows.length}), a conversation's every row (${rM.convRows.length}); the account watcher whose account row now excepts the child is NOT woken through one conversation's own row (${rM.woken}) — as its save at the account refuses (${saveAcct.ok ? 'ok' : saveAcct.code})`, { rM: { woken: rM.woken, acct: rM.acctRows.length, rule: rM.ruleRows.length, conv: rM.convRows.length }, saveAcct: saveAcct.ok ? 'ok' : saveAcct.code });
    const SRCM = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    const ALLROWS = "  if (!item || !item.source || item.source === 'conversation') return [...acc, ...gr];\n";
    const MM = mutantCopies('fbd6-repick-grain', REPO);
    const redM = judgeM(MM.load('src/channel-filter.js', anchored(SRCM, ALLROWS, '  return [...acc, ...gr];\n', 'a re-pick over the whole conversation\'s rows'), 'fbd6-repick-all-rows'));
    ok(redM.woken === true, `B-fbd6 line 999's MUST RED CONTROL: a re-pick over the whole conversation's rows — the account watcher is WOKEN through the conversation's own tg-y row (${redM.woken}) — the leg above would go red`, { woken: redM.woken });
    // (a) ONE TABLE THROUGH THE NEW BRANCH (the stored group tg-x no longer has the session; the re-pick decides): what held only by
    // reading — a member named in the grain's «除了» while another group row of that grain would admit it; a «only this group» row
    // reached only through the re-pick (a child group's member); a member whose groups cannot be read. Each NOT woken, its twin woken
    const viaX = { principal: { kind: 'agent', id: 'k1' }, via: 'tg-x' };
    const xRow = { row: { principal: { kind: 'group', id: 'tg-x', name: 'X' }, authority: 'draft' }, source: 'conversation' };
    const gRow = (id, extra = {}) => ({ row: { principal: { kind: 'group', id, name: id, ...(extra.only ? { only: true } : {}) }, authority: 'draft', ...(extra.except ? { except: extra.except } : {}) }, source: 'conversation' });
    const memOk = [{ cid: 'k1', groups: ['tg-y'], inherited: ['tg-p'] }], memUnread = [{ cid: 'k1', groups: ['tg-y'], inherited: null }];
    const tableA = [
      ['the grain\'s «除了» names the member, another group row would admit it', CFm.memberStill(viaX, memOk, { rows: [xRow, gRow('tg-y', { except: [{ kind: 'agent', id: 'k1' }] })] }), CFm.memberStill(viaX, memOk, { rows: [xRow, gRow('tg-y')] })],
      ['a «only this group» row reached only through the re-pick (a child group\'s member)', CFm.memberStill(viaX, memOk, { rows: [xRow, gRow('tg-p', { only: true })] }), CFm.memberStill(viaX, memOk, { rows: [xRow, gRow('tg-p')] })],
      ['the member\'s groups cannot be read while the stored row refuses', CFm.memberStill(viaX, memUnread, { rows: [xRow, gRow('tg-p')] }), CFm.memberStill(viaX, memOk, { rows: [xRow, gRow('tg-p')] })],
    ];
    ok(tableA.every(([, no, twin]) => no === false && twin === true), `B-fbd6 line 999 (a): through the re-pick — ${tableA.map(([w, no, twin]) => `${w}: ${no ? 'WOKEN' : 'not woken'} (its twin ${twin ? 'woken' : 'NOT woken'})`).join('; ')}`, tableA);
  }
  // the chain's cure (D, the U3c read): a CHILD of an access-holding parent reads there — so it may be a watcher there (at the save
  // and at every wake); a parent's «仅本组» access refuses it and says THAT
  {
    const CFD = require('../src/channel-filter.js');
    const accP = [{ principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, authority: 'draft' }], accPO = [{ principal: { kind: 'group', id: 'tg-p', name: 'Parent', only: true }, authority: 'draft' }];
    const membersD = [{ cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }, { cid: 'k2', groups: ['tg-z'], inherited: [] }];
    const wD = (id) => ({ principal: { kind: 'agent', id }, notify: 'wake', mode: 'all', dailyWakeCap: 50 });
    const okKid = CFD.validateWatchers([wD('k1')], accP, { members: membersD }), noOnly = CFD.validateWatchers([wD('k1')], accPO, { members: membersD }), noStranger = CFD.validateWatchers([wD('k2')], accP, { members: membersD });
    ok(okKid.ok && okKid.watchers[0].via === 'tg-p' && !noOnly.ok && noOnly.code === 'watcher-needs-access' && /as "this group only"/.test(noOnly.error) && /"Parent"/.test(noOnly.error) && !noStranger.ok && !/parent/i.test(noStranger.error), 'channels (the cure (D)): a child of the access-holding parent is a watcher «via» the parent; a «仅本组» access refuses it and SAYS so (the parent named); a stranger is refused as before', [okKid.ok && okKid.watchers[0].via, noOnly.error, noStranger.error]);
    const viaRow = { principal: { kind: 'agent', id: 'k1' }, via: 'tg-p' };
    ok(CFD.memberStill(viaRow, membersD, { rows: accP }) === true && CFD.memberStill(viaRow, membersD, { rows: accPO }) === false && CFD.memberStill(viaRow, [{ cid: 'k1', groups: ['tg-c'], inherited: [] }], { rows: accP }) === false, 'channels (the cure (D)): the wake re-judges the via watcher with the access rows and the lineage — a parent switched to «仅本组», or a lineage gone, stops it');
    // after the cure's read: the WAKE hands effectiveGrants' wrapped rows ({row, source}); the grain's «除了» on the parent leaves the
    // child out at the save (rule ③), said so; a group known only as a KEY (a hand-written reach grant) stays a via group beside rows
    const wrapped = accP.map((row) => ({ row, source: 'conversation', patternId: null, why: [] }));
    const exP = CFD.validateWatchers([wD('k1')], accP, { members: membersD, except: [{ kind: 'group', id: 'tg-p' }] });
    const keyOnly = CFD.validateWatchers([wD('k3')], accP, { inherited: ['group:tg-q'], members: [...membersD, { cid: 'k3', groups: ['tg-q'], inherited: [] }] });
    ok(CFD.memberStill(viaRow, membersD, { rows: wrapped }) === true && !exP.ok && /left out through its parent Task Group "Parent"/.test(exP.error) && keyOnly.ok && keyOnly.watchers[0].via === 'tg-q', 'channels (the cure (D), its read): the wake\'s wrapped rows are read through; a parent left out of the access list leaves the child out (said so); a key-only group stays a via group beside the rows', [exP.error, keyOnly.ok && keyOnly.watchers[0].via]);
    const caD = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8');
    ok(/F\.memberStill\(it\.watcher, members, \{ rows: viaRows, repickRows: F\.repickRowsOf\(it, e0\.access, grantRows\) \}\)/.test(caD) && /const grantRows = hasVia \? visibleRowsOf\(grants\) : null;\n    const viaRows = hasVia \? \[\.\.\.e0\.access, \.\.\.grantRows\] : null;/.test(caD), 'channels (the cure (D)): the wake hands the grain\'s access rows to the re-judge (B-1e96: and the grant rows after them)');
    // CONTROL: the release's via judge (own groups only, from key strings) refuses the child — the leg above would be red
    const MD = mutantCopies('cure-d-via', REPO);
    try {
      const fsrc = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
      const CUTD = '    const via = !keys.has(k) && v.watcher.principal.kind === \'agent\' ? memberVia(keys, v.watcher.principal.id, members, { rows: accessRows, except }) : null;';
      ok(fsrc.split(CUTD).length === 2, 'CONTROL setup: the via line hands the access rows, exactly once');
      const CFx = MD.load('src/channel-filter.js', anchored(fsrc, CUTD, '    const via = !keys.has(k) && v.watcher.principal.kind === \'agent\' ? memberVia(keys, v.watcher.principal.id, members) : null;', 'via-own-only'), 'via-own-only');   // stale-pins: kept (the mutant restores the release's own-only via line)
      const cx = CFx.validateWatchers([wD('k1')], accP, { members: membersD });
      ok(!cx.ok && cx.code === 'watcher-needs-access', 'CONTROL: a via judge without the access rows (own groups only) refuses the child — the leg above would be red', cx);
    } finally { try { fs.rmSync(MD.dir, { recursive: true, force: true }); } catch { } }
  }
  // the cure's own read: a group leaving the pick forgets its switch; only a still-picked group fires the window switch; the switch
  // routes refuse a missing flag (never «off»); the unsaved guards count a press; exit's list words come from an ADMIT only; a
  // parents change names the old and new ancestors
  {
    const R = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
    const pp = R('src/lib/principal-picker.js'), ws = R('src/lib/window-share.js'), wte2 = R('src/server/window-targets-engine.js'), ae2 = R('src/server/automation-engine.js'), ex2 = R('src/lib/exit-access-dialog.js'), va2 = R('src/lib/vault-automation.js'), xp2 = R('src/exit-proxy.js'), tg2 = R('src/task-groups.js');
    ok(/const keepOnlyPicked = \(\) => \{ for \(const k of \[\.\.\.onlySet\]\) if \(!sel\.includes\(k\)\) onlySet\.delete\(k\); \};/.test(pp) && (pp.match(/keepOnlyPicked\(\);/g) || []).length === 3
      && /stillPicked\.has\(k\) && byKeyO\.get\(k\)\) st\.onOnly\(byKeyO\.get\(k\)\.ref\.row, false\)/.test(ws)
      && /if \(typeof on !== 'boolean'\) throw namedError\('bad_principal'/.test(wte2) && /if \(typeof on !== 'boolean'\) return named\('bad_args'/.test(ae2)
      && /s\.picker && typeof s\.picker\.onlyKeys === 'function' \? \(s\.picker\.onlyKeys\(\) \|\| \[\]\)\.slice\(\)\.sort\(\) : null\]; \}\)/.test(ex2) && /plan\(v\.fresh, 'subject'\), picker && typeof picker\.onlyKeys === 'function'/.test(va2)
      && /\.map\(\(x\) => \(x && x\.ok \? E\.lineageOfVerdict\(x, this\.groupNameOf\) : ''\)\)/.test(xp2)
      && /const ancMoved = parents !== undefined \? \[\.\.\.new Set\(\[\.\.\.ancBefore, \.\.\.this\.ancestorsOf\(\[t\.id\]\)\]\)\] : \[\];/.test(tg2), 'the cure\'s own read: each of its taken findings is in the tree (the picker, the window switch, the routes, the unsaved guards, the exit list, the change notice)');
    // a parents change names the old and the new ancestor
    const dA = dirOf(`anc-${++worldN}`); fs.mkdirSync(dA, { recursive: true });
    const { TaskGroupManager: TGM } = require('../src/task-groups.js');
    const seenA = []; const sA = new TGM({ dataDir: dA, onChange: (e) => seenA.push(...((e && e.ids) || [])) });
    const PA = sA.create({ title: 'PA' }), QA = sA.create({ title: 'QA' }), CA = sA.create({ title: 'CA', parents: [PA.id] });
    seenA.length = 0; sA.update(CA.id, { parents: [QA.id] });
    ok(seenA.includes(CA.id) && seenA.includes(PA.id) && seenA.includes(QA.id), 'the change notice of a parents move names the old parent and the new one (their derived descendants moved)', seenA);
  }
  // the cure's cure: (MUST) the Share dialog re-reads «仅本组» from the store at EVERY draw — a second client's change, a press that
  // failed (its redraw from the unchanged view puts the chip back); (1) each access row judged with its OWN «除了» — at the save (a
  // child left out at the ACCOUNT grain is refused at the conversation grain, said so) and at the wake (the via row's own)
  {
    const pp3 = fs.readFileSync(path.join(REPO, 'src/lib/principal-picker.js'), 'utf-8'), ws3 = fs.readFileSync(path.join(REPO, 'src/lib/window-share.js'), 'utf-8');
    const drawPart = ws3.slice(ws3.indexOf('  st.onToggle = onToggle;'), ws3.indexOf('  st.picker.setBusy(busy);'));
    ok(/setOnly: \(keys\) => \{ if \(!onlyOffered\) return; const before = new Set\(onlySet\); onlySet\.clear\(\);[^\n]*if \(before\.has\(k\) !== onlySet\.has\(k\)\) chipNodes\.delete\(k\); drawChips\(\); \},/.test(pp3) && /if \(onOnly && !busy && typeof st\.picker\.setOnly === 'function'\) \{ st\.picker\.setOnly\(model\.onlyKeys \|\| \[\]\); st\.onlyNow = new Set/.test(drawPart), 'the Share dialog (the cure\'s cure, MUST): every draw — not only the first; the busy one before the call excepted — hands the picker the store\'s «仅本组» (ONE setter), and a chip whose state changed is drawn again (a source pin here; test-held-except-doors ㉖ drives the REAL dialog\'s picker over a fake DOM)');
    const CF4 = require('../src/channel-filter.js');
    const exC = [{ kind: 'group', id: 'tg-c' }];
    const acctRowExC = { principal: { kind: 'group', id: 'tg-p', name: 'Parent' }, authority: 'draft', except: exC };   // the ACCOUNT grain's row, its own «除了»
    const membersE = [{ cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }];
    const wE = { principal: { kind: 'agent', id: 'k1' }, notify: 'wake', mode: 'all', dailyWakeCap: 50 };
    const atConv = CF4.validateWatchers([wE], [], { inherited: [acctRowExC], members: membersE });
    const atConvOk = CF4.validateWatchers([wE], [], { inherited: [{ ...acctRowExC, except: [] }], members: membersE });
    const wakeRow = { principal: { kind: 'agent', id: 'k1' }, via: 'tg-p' };
    ok(!atConv.ok && /left out through its parent Task Group "Parent"|has no access here/.test(atConv.error) && atConvOk.ok && atConvOk.watchers[0].via === 'tg-p' && CF4.memberStill(wakeRow, membersE, { rows: [{ row: acctRowExC, source: 'account' }] }) === false && CF4.memberStill(wakeRow, membersE, { rows: [{ row: { ...acctRowExC, except: [] }, source: 'account' }] }) === true, 'channels (the cure\'s cure (1)): a child left out at the ACCOUNT grain is refused at the conversation grain (never a silent row) and is not woken; without that «除了» it is a watcher via the parent and woken', atConv.error);
  }
  // cure 3 (the cure's cure's read, MUST): the via judge keeps ONE row per group in the store's precedence (this grain's, then a
  // rule's, then the account's) — the save judges the row the wake keeps (one per principal, the finest grain's)
  {
    const CF6 = require('../src/channel-filter.js');
    const P6 = { kind: 'group', id: 'tg-p', name: 'Parent' }, X6 = [{ kind: 'group', id: 'tg-c' }];
    const convP6 = { principal: P6, authority: 'draft' }, acctP6 = { principal: P6, authority: 'draft', except: [] };
    const members6 = [{ cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }];
    const w6 = { principal: { kind: 'agent', id: 'k1' }, notify: 'wake', mode: 'all', dailyWakeCap: 50 };
    const atSave6 = CF6.validateWatchers([w6], [convP6], { inherited: [acctP6], members: members6, except: X6 });
    ok(!atSave6.ok && /left out through its parent Task Group "Parent"|has no access here/.test(String(atSave6.error || '')), 'cure 3 (THE MUST): P on the account with no «除了», P on the conversation with X left out — a member of X is refused at the SAVE by name (the conversation\'s row decides, as at the wake); never a notification saved that never fires', atSave6.error || atSave6);
    const atWake6 = CF6.memberStill({ principal: { kind: 'agent', id: 'k1' }, via: 'tg-p' }, members6, { rows: [{ row: { ...convP6, except: X6 }, source: 'conversation' }] });
    ok(atWake6 === false, 'cure 3: …and the wake (the effective grants\' one row per principal — the conversation\'s, with its own «除了») does not wake it: the save and the wake judge the same row');
    const ruleP6 = { principal: P6, authority: 'draft', except: X6 };
    const ruleFirst6 = CF6.validateWatchers([w6], [], { inherited: [ruleP6, acctP6], members: members6, except: [] });
    const acctFirst6 = CF6.validateWatchers([w6], [], { inherited: [acctP6, ruleP6], members: members6, except: [] });
    ok(!ruleFirst6.ok && acctFirst6.ok, 'cure 3: the FIRST row per group decides — the callers list them in the store\'s precedence (a rule\'s row before the account\'s), never a union over grains', { ruleFirst: ruleFirst6.ok, acctFirst: acctFirst6.ok });
    const ca6 = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8');
    ok(/return \[\.\.\.pats, \.\.\.acc, \.\.\.grants\];/.test(ca6) && /for \(const pa of rankedPatternsOf\(en\.adapterId\)\) if \(pa && pa\.pattern && pa\.id !== skipRule/.test(ca6) && /const rankedPatternsOf = \(adapterId\) => F\.rankPatterns\(rawPatternsOf\(adapterId\)\);/.test(ca6) && /const ranked = rankPatterns\(\(Array\.isArray\(patterns\) \? patterns : \[\]\)\.filter\(\(x\) => x && x\.pattern\)\);/.test(fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8')) && JSON.stringify(CF6.rankPatterns([{ id: 'b', createdAt: 5 }, { id: 'c' }, { id: 'a', createdAt: 5 }, null]).map((x) => x.id)) === JSON.stringify(['c', 'a', 'b']), 'cure 3: the server lists the rows above a conversation in the store\'s precedence — the matching rules before the account, ranked by ONE function (F.rankPatterns: oldest first, a missing time first, then id) that effectiveGrants reads too');
  }
  // cure 3 (b): the editor judges a Notify… save from the SAME rows as the server — its rows above carry each row's own «除了»
  // (the real engine's conversation view), a rule's listed before the account's
  {
    const wb6 = await world();
    const GRP6 = { kind: 'group', id: 'g1', name: 'Ops' };
    const sa6 = await wb6.e.setAccess(wb6.A, { kind: 'account' }, [{ principal: GRP6, authority: 'draft' }], { except: [{ kind: 'conversation', key: 'm1' }] });
    const el6 = ((wb6.e.conversationView(wb6.A, 'ops') || {}).eligibleAbove) || [];
    const g6 = el6.find((r) => r && r.principal && r.principal.kind === 'group' && r.principal.id === 'g1') || null;
    ok(!!sa6 && sa6.ok === true && !!g6 && g6.via === 'account' && Array.isArray(g6.except) && JSON.stringify(g6.except).includes('m1'), 'cure 3 (b): the editor\'s rows above carry the row\'s OWN «除了» (the account\'s Task Group, m1 left out) — the page and the server judge from the same rows', { set: sa6 && sa6.ok, row: g6 });
    const ca7 = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8');
    const ev7 = ca7.slice(ca7.indexOf('  function eligibleAboveView(en) {'), ca7.indexOf('  function grainView('));
    ok(ev7.indexOf("add(r.principal, 'pattern', r.except)") > 0 && ev7.indexOf("add(r.principal, 'pattern', r.except)") < ev7.indexOf("add(r.principal, 'account', r.except)") && /\.\.\.\(p\.kind === 'group' && p\.only === true \? \{ only: true \} : \{\}\) \}, via, \.\.\.\(Array\.isArray\(ex\) \? \{ except: \[\.\.\.ex\] \} : \{\}\)/.test(ev7), 'cure 3 (b): a rule\'s rows before the account\'s (the first per principal is the one in effect), each with its «除了» and «仅本组»');
    try { wb6.e.stop(); } catch { }
  }
  // cure 3's read (a should taken): the save and the wake on ONE real engine — P holds the account (no «除了») and the conversation
  // (child X left out): a member of X is refused at the save by name; a member of the other child Y is saved via P and WOKEN
  {
    const P8 = { kind: 'group', id: 'tg-p', name: 'Parent' };
    const w8 = await world({ live: [{ cid: 'kx', name: 'KidX', groups: ['tg-x'], inherited: ['tg-p'] }, { cid: 'ky', name: 'KidY', groups: ['tg-y'], inherited: ['tg-p'] }] });
    const a8 = await w8.e.setAccess(w8.A, { kind: 'account' }, [{ principal: P8, authority: 'draft' }]);
    const c8 = await w8.e.setAccess(w8.A, w8.C, [{ principal: P8, authority: 'draft' }], { except: [{ kind: 'group', id: 'tg-x' }] });
    const wOf8 = (cid, name) => ({ principal: { kind: 'agent', id: cid, name }, notify: 'wake', mode: 'all', dailyWakeCap: 50 });
    const sx8 = await w8.e.setWatchers(w8.A, w8.C, [wOf8('kx', 'KidX')]);
    const sy8 = await w8.e.setWatchers(w8.A, w8.C, [wOf8('ky', 'KidY')]);
    await w8.ingest(2);
    ok(!!a8 && a8.ok === true && !!c8 && c8.ok === true && !!sx8 && sx8.ok === false && /left out through its parent Task Group "Parent"|has no access here/.test(String(sx8.error || '')) && !!sy8 && sy8.ok === true && w8.ladder.calls.includes('ky') && !w8.ladder.calls.includes('kx'), 'cure 3 (the save and the wake on ONE real engine): P on the account and on the conversation with X left out — a member of X is refused at the save by name; a member of Y is saved via P and woken', { a8: a8 && a8.ok, c8: c8 && c8.ok, sx8, sy8: sy8 && sy8.ok, calls: w8.ladder.calls });
    try { w8.e.stop(); } catch { }
  }
  // B-1e96: a GRANT row (a hand-written visible grant here; an approved request is a row of the same store; a pre-unify
  // account grant) is judged the same way on the page, at the save and at the wake — ONE shape (channels-access visibleRowsOf):
  // the principal with its «仅本组», the row's OWN «除了», judged with the member's lineage. Over the real engine; every red
  // control an engine copy through the anchored helper (it fails by name when its line moved)
  {
    const CF9 = require('../src/channel-filter.js');
    const P9 = { kind: 'group', id: 'tg-p', name: 'Parent' };
    const KIDY = { cid: 'ky', name: 'KidY', groups: ['tg-y'], inherited: ['tg-p'] }, DIRECT = { cid: 'kd', name: 'Direct', groups: ['tg-p'], inherited: [] };
    const wOf9 = (m) => ({ principal: { kind: 'agent', id: m.cid, name: m.name }, notify: 'wake', mode: 'all', dailyWakeCap: 50 });
    // ONE scene: the rows written, the PAGE's judgement (the conversation view's own rows + rows above, as the editor hands them),
    // the SAVE, two passes (the WAKE) → what each said
    // round wg5m3njdx: `rowExcept` = the GRANT ROW's OWN «除了» written at once, `rowExceptLater` = after the save (the wake's
    // road), `rule` = the save on a new RULE grain (a title rule that matches this chat) instead of the conversation
    const REACH9 = 'conversation:gsx/ops#user';
    const scene = async (eng, { m, grant = P9, access = null, accountUser = null, grain = null, after = null, rowExcept = null, rowExceptLater = null, rule = false }) => {
      let gs9 = null;
      const seed = (accountUser || rowExcept || rowExceptLater) ? (gs) => { gs9 = gs; if (accountUser) gs.set('channel-reach', 'account:gsx#user', { to: [accountUser], except: [] }, 'user'); } : null;
      const withExcept = (ex) => { const [r] = gs9.rowsFor('channel-reach', REACH9); return gs9.set('channel-reach', REACH9, { to: r.to, except: ex }, 'user'); };
      const w = await world({ live: [m], eng, seed });
      const a = access ? await w.e.setAccess(w.A, w.C, access.rows, { except: access.except }) : { ok: true };
      const g0 = grant ? await w.e.setReach(w.A, 'ops', { principal: grant, level: 'visible' }) : { ok: true };
      const g = g0 && g0.ok === true && rowExcept ? withExcept(rowExcept) : g0;
      const v = w.e.conversationView(w.A, 'ops') || {}, own = v.own || {};
      const page = CF9.validateWatchers([wOf9(m)], own.access || [], { inherited: v.eligibleAbove || [], members: [{ cid: m.cid, groups: m.groups, inherited: m.inherited }], except: own.except || [] });
      const save = rule ? await w.e.setGrain(w.A, { kind: 'pattern' }, { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, access: [{ principal: { kind: 'group', id: 'tg-z', name: 'Other' }, authority: 'draft' }], watchers: [wOf9(m)] }) : await w.e.setWatchers(w.A, grain || w.C, [wOf9(m)]);   // a new rule names an access row of its own (another group's): the member's admission is the account's grant rows'
      if (after) await after(w);   // a write between the save and the passes (the wake judges what is there THEN)
      const later = rowExceptLater ? withExcept(rowExceptLater) : null;
      await w.ingest(2);
      const out = { refusedWrites: [a, g, later].filter((x) => x && x.ok === false).map((x) => x.code || x.error), wrote: !!a && a.ok === true && !!g && g.ok === true && (!later || later.ok === true), page: page.ok === true ? (page.watchers[0].via || 'own') : 'refused', save: save && save.ok === true ? 'ok' : String((save && save.error) || 'refused'), woke: w.ladder.calls.includes(m.cid) };
      try { w.e.stop(); } catch { }
      return out;
    };
    const ACC_A = { rows: [{ principal: { kind: 'group', id: 'tg-z', name: 'Other' }, authority: 'draft' }], except: [{ kind: 'conversation', key: 'kd' }] };
    const S_LIN = { m: KIDY }, S_OWNEX = { m: DIRECT, access: ACC_A }, S_ONLY = { m: KIDY, grant: { ...P9, only: true } }, S_ACCT = { m: KIDY, grant: null, accountUser: { kind: 'group', id: 'tg-p' }, grain: { kind: 'account' } };
    const S_ONLY_LATER = { m: KIDY, after: (w) => w.e.setReach(w.A, 'ops', { principal: { ...P9, only: true }, level: 'visible' }) };   // saved through the plain grant; the grant then marked «仅本组»
    // round wg5m3njdx 1: the GRANT ROW'S OWN «除了» REFUSES — the member it names (a session of the granted group; a child group
    // under the granted parent) refused on the page, at the save, and at the wake (saved through the plain row, the «除了» written after)
    const EX_DIRECT = [{ kind: 'conversation', key: 'kd', name: 'Direct' }], EX_KID = [{ kind: 'group', id: 'tg-y', name: 'Kid' }];
    const S_EXC_CONV = { m: DIRECT, rowExcept: EX_DIRECT }, S_EXC_KID = { m: KIDY, rowExcept: EX_KID }, S_EXC_LATER = { m: KIDY, rowExceptLater: EX_KID };
    // round wg5m3njdx 2: THE RULE GRAIN — a rule's save reads the account's grants as ROWS (siteInheritedOf's rule branch)
    const S_RULE = { m: KIDY, grant: null, accountUser: { kind: 'group', id: 'tg-p' }, rule: true };
    const lin = await scene(ENG, S_LIN), ownEx = await scene(ENG, S_OWNEX), only = await scene(ENG, S_ONLY), acct = await scene(ENG, S_ACCT), onlyLater = await scene(ENG, S_ONLY_LATER);
    ok(lin.wrote && lin.page === 'tg-p' && lin.save === 'ok' && lin.woke, 'B-1e96: a parent\'s visible grant here — a member of its CHILD group is admitted on the page (via the parent), at the SAVE and at the WAKE: one shape of grant row, judged with the lineage', lin);
    ok(ownEx.wrote && ownEx.page === 'tg-p' && ownEx.save === 'ok' && ownEx.woke, 'B-1e96 (a) (a regression of the chain\'s cure (D), cured before release): a session of the granted group is not refused because THIS chat\'s access row leaves it out of ANOTHER group — a grant row is judged by its own «除了», as the read door judges it', ownEx);
    ok(only.wrote && only.page === 'refused' && /has no access here|left out/.test(only.save) && !only.woke, 'B-1e96 (b): the parent\'s grant marked «仅本组» — its child group\'s member refused on the page and at the save (the flag rides the row)', only);
    ok(onlyLater.wrote && onlyLater.save === 'ok' && !onlyLater.woke, 'B-1e96 (b) at the WAKE: saved through the parent\'s plain grant, the grant then marked «仅本组» — the wake re-judges the row and does not wake the child\'s member', onlyLater);
    ok(acct.wrote && acct.save === 'ok' && acct.woke, 'B-1e96: an ACCOUNT save reads the account\'s grants as rows too — a pre-unify account grant to the parent: its child\'s member saved on the account and woken', acct);
    const exConv = await scene(ENG, S_EXC_CONV), exKid = await scene(ENG, S_EXC_KID), exLater = await scene(ENG, S_EXC_LATER), ruleS = await scene(ENG, S_RULE);
    ok(exConv.wrote && exConv.page === 'refused' && /has no access here|left out/.test(exConv.save) && !exConv.woke, `B-1e96 (round wg5m3njdx 1): the grant row's OWN «除了» names a session of the granted group — refused on the page (${exConv.page}), at the save (${exConv.save.slice(0, 80)}), not woken (${exConv.woke})`, exConv);
    ok(exKid.wrote && exKid.page === 'refused' && /has no access here|left out/.test(exKid.save) && !exKid.woke, `B-1e96 (round wg5m3njdx 1): the grant row's OWN «除了» names a CHILD group under the granted parent — its member refused on the page (${exKid.page}), at the save (${exKid.save.slice(0, 80)}), not woken (${exKid.woke})`, exKid);
    ok(exLater.wrote && exLater.save === 'ok' && !exLater.woke, `B-1e96 (round wg5m3njdx 1) at the WAKE: saved through the parent's plain grant row, the row's own «除了» then naming the child group — the wake re-judges the row and does not wake (save ${exLater.save}, woken ${exLater.woke})`, exLater);
    ok(ruleS.wrote && ruleS.save === 'ok', `B-1e96 (round wg5m3njdx 2): a RULE save reads the account's grants as ROWS — a pre-unify account grant to the parent admits its child's member on a new title rule (save ${ruleS.save}; woken ${ruleS.woke})`, ruleS);
    // B-fbd6 ITEM 6 (主开发 r4365): ONE READ OF THE CONVERSATION's GRANTS A WAKE — the grants store's reads counted over the same
    // pass (the scene's wake of a via watcher, the counter set at its last write): the cured wake reads them fewer times than the
    // release's form (effectiveFor's keys and the via judge's rows each a read); the same member woken by both
    {
      const CGM6 = require('../src/server/channels-grants.js');
      const create6 = CGM6.create;
      let reads6 = 0;
      CGM6.create = (o) => { const cg = create6(o); const f6 = cg.conversationGrants; cg.conversationGrants = (k) => { reads6 += 1; return f6(k); }; return cg; };
      try {
        const count6 = async (eng) => { const r = await scene(eng, { ...S_LIN, after: () => { reads6 = 0; } }); return { woke: r.woke, reads: reads6 }; };
        const cur6 = await count6(ENG);
        const ES6 = engineSource(REPO), M6 = mutantCopies('fbd6-wake-reads', REPO);
        const two6 = anchored(anchored(ES6, "    const grants = grantsOfConversation(en);   // B-fbd6 item 6 (主开发 r4365): ONE read of the conversation's grants a wake — effectiveFor's keys and the via judge's rows\n    const e0 = effectiveFor(en, grants);\n", '    const e0 = effectiveFor(en);\n', 'the wake reads the grants for effectiveFor'), '    const grantRows = hasVia ? visibleRowsOf(grants) : null;', '    const grantRows = hasVia ? visibleRowsOf(grantsOfConversation(en)) : null;', 'and again for the via rows');   // stale-pins: kept (the red control restores the release's two reads)
        const rel6 = await count6(M6.load('src/server/channels-engine.js', two6, 'fbd6-two-reads'));
        ok(cur6.woke && rel6.woke && cur6.reads > 0 && cur6.reads < rel6.reads, `B-fbd6 item 6: the wake reads the conversation's grants ONCE — over the same pass ${cur6.reads} reads of the grants store against ${rel6.reads} in the release's form (two reads a wake), the member woken by both (${cur6.woke} / ${rel6.woke})`, { cur6, rel6 });
      } finally { CGM6.create = create6; }
    }
    // RED CONTROLS
    const M9 = mutantCopies('b1e96-grant-rows', REPO);
    try {
      const ES9 = engineSource(REPO);
      const copy = (anchor, to, name) => M9.load('src/server/channels-engine.js', anchored(ES9, anchor, to, name), name.replace(/\W+/g, '-'));
      const keys9 = await scene(copy('    const grants = visibleRowsOf(grantsOfConversation(en, undefined, { skipAccount, skipRule }), skipOwn ?', '    const grants = visibleKeysOf(grantsOfConversation(en, undefined, { skipAccount, skipRule }), skipOwn ?', 'B-1e96 the save reads the grants as keys'), S_LIN);   // stale-pins: kept (the control restores the release's line)
      ok(keys9.page === 'tg-p' && /has no access here|left out/.test(keys9.save) && !keys9.woke, 'B-1e96 RED CONTROL: the save reading the grants as KEYS (the release: own groups only) — the page says yes, the save refuses by name', keys9);
      const wake9 = await scene(copy('{ rows: viaRows, repickRows: F.repickRowsOf(it, e0.access, grantRows) }', '{ rows: e0.access, repickRows: e0.access }', 'B-1e96 the wake without the grant rows'), S_LIN);   // stale-pins: kept (the control restores the chain's line before this unit)
      ok(wake9.save === 'ok' && !wake9.woke, 'B-1e96 RED CONTROL: the wake re-judging without the grant rows — saved via the parent, never woken (the save and the wake judge the same row)', wake9);
      const ex9 = await scene(copy(", except: Array.isArray(g.except) ? g.except : [] });", ' });', 'B-1e96 a grant row without its own except'), S_OWNEX);
      ok(/has no access here|left out/.test(ex9.save) && !ex9.woke, 'B-1e96 RED CONTROL (a): a grant row without its OWN «除了» falls back to this grain\'s — the session left out of another group is refused (the chain\'s regression)', ex9);
      const onlyWake9 = await scene(copy('    const grantRows = hasVia ? visibleRowsOf(grants) : null;', '    const grantRows = hasVia ? visibleRowsOf(grants).map((r) => ({ ...r, principal: { ...r.principal, only: false } })) : null;', 'B-1e96 the wake drops the only flag'), S_ONLY_LATER);
      ok(onlyWake9.save === 'ok' && onlyWake9.woke, 'B-1e96 RED CONTROL (b) at the wake: the wake\'s grant rows without their «仅本组» — the child\'s member is woken through a grant now for the parent\'s own members only', onlyWake9);
      const only9 = await scene(copy("...(p.kind === 'group' && p.only === true ? { only: true } : {}) }, via: g.scope", '}, via: g.scope', 'B-1e96 a grant row without its only flag'), S_ONLY);
      ok(only9.save === 'ok' && only9.woke, 'B-1e96 RED CONTROL (b): a grant row that drops its «仅本组» — the child\'s member is saved and woken through a parent that reaches its own members only', only9);
      const acct9 = await scene(copy('    if (site.kind === \'account\') return acctRows(true);', "    if (site.kind === 'account') return accountGrantKeys(aid, { skipAccess: true });", 'B-1e96 the account save reads keys'), S_ACCT);   // stale-pins: kept (the control restores the release's line)
      ok(/has no access here|left out/.test(acct9.save) && !acct9.woke, 'B-1e96 RED CONTROL: the account save reading the account\'s grants as KEYS (the release) — the child\'s member refused there', acct9);
      // THE WAKE READS THE ROW'S «除了» TWICE — two guards, each refusing alone: the via judge's grant rows (visibleRowsOf) and,
      // with an «除了» anywhere, the named watcher's read re-judge (wakeAdmitOf: may it still SEE this conversation). The copy
      // takes BOTH out (the rows read without their own «除了», the re-judge skipped); in this scene the save ran BEFORE the
      // «除了» was written, so only the wake differs
      const ESX = anchored(anchored(ES9, ", except: Array.isArray(g.except) ? g.except : [] });", ' });', 'B-1e96 the wake: grant rows without their own except'),
        '    if (anyExcept) e = { ...e, watchers: e.watchers.filter((it) => {', '    if (false) e = { ...e, watchers: e.watchers.filter((it) => {', 'B-1e96 the wake: the named watcher\'s read re-judge skipped');
      const exWake9 = await scene(M9.load('src/server/channels-engine.js', ESX, 'b1e96-wake-without-except'), S_EXC_LATER);
      ok(exWake9.save === 'ok' && exWake9.woke, `B-1e96 RED CONTROL (round wg5m3njdx 1): the WAKE's two reads of the row's «除了» taken out (its grant rows read without it, the named watcher's read re-judge skipped; the save ran before it was written) — the child's member is woken through a row that leaves its group out (woken ${exWake9.woke})`, exWake9);
      const rule9 = await scene(copy('    return [...CG.accessOf(CG.RES.account(aid)), ...acctRows(false)];', '    return [...CG.accessOf(CG.RES.account(aid)), ...accountGrantKeys(aid)];', 'B-1e96 the rule save reads keys'), S_RULE);   // stale-pins: kept (the control restores the release's line)
      ok(rule9.save !== 'ok' && /agent|access|left out/i.test(rule9.save), `B-1e96 RED CONTROL (round wg5m3njdx 2): the RULE save reading the account's grants as KEYS (the release) — the child's member refused there («${rule9.save.slice(0, 100)}»)`, rule9);
    } finally { try { fs.rmSync(M9.dir, { recursive: true, force: true }); } catch { } }
    // (c) the Notify… editor offers a member only where the SAVE admits it — F.memberVia over the save's keys, rows and «除了»,
    // the facts the server's (own groups + the copy's `ancestors`, the store's own walk), a child labelled under its parent
    const ed = fs.readFileSync(path.join(REPO, 'src/lib/channel-filter-editor.js'), 'utf-8');
    const tgv = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf-8');
    const cfSrc5 = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    ok(/const offered = F\.memberOffer\(\{ access: st\.access, eligibleAbove: st\.eligibleAbove \|\| \[\], except: st\.except \|\| \[\], roster: rosterFromApp\(app, \{ groups: false \}\), ancestorsOf: ancestorsOfGroup, taken: principals\.map\(\(x\) => x\.value\) \}\);/.test(ed)
      && /const keys = eligibleKeys\(\{ access: acc, inherited: above \}\);/.test(cfSrc5)
      && /const rows = \[\.\.\.acc\.map\(\(row\) => \(\{ row, except: ex \}\)\), \.\.\.above\];/.test(cfSrc5)
      && /const via = memberVia\(keys, s\.id, \[\{ cid: s\.id, groups: own, inherited: up \}\], \{ rows, except: ex \}\);/.test(cfSrc5)
      && /const members = principals\.filter\(\(p\) => p\.via\)\.map\(\(p\) => \(\{ cid: p\.id, groups: p\.groupIds \|\| \[p\.via\], inherited: p\.inherited \|\| \[\] \}\)\);/.test(ed)
      && /ancestors: this\.ancestorsOf\(\[t\.id\]\)/.test(tgv), 'B-1e96 (c): the Notify… editor offers a member through F.memberOffer (memberVia over the save\'s keys, rows and «除了»), with the server\'s member facts (the copy\'s `ancestors` — the store\'s own walk, never a second one)');
    // B-fbd6 ITEM 5 (主开发 r4365): THE OFFER EQUALS WHAT THE SAVE ADMITS — F.memberOffer (the editor's one function) against
    // validateWatchers, session by session over a table of grains: a parent's plain row (its child group's member offered «under»
    // it), its «仅本组» row, this grain's «除了» naming the child group, a row above with its own «除了»; every session offered
    // exactly when the save admits it, through the same group, the label's child group named. RED: an offer that reads this
    // grain's rows without their «除了»
    {
      const CF5 = require('../src/channel-filter.js');
      const par5 = { kind: 'group', id: 'tg-p', name: 'Parent' };
      const roster5 = [{ id: 'k1', key: 'agent:k1', name: 'Kid one', groupIds: ['tg-y'] }, { id: 'k2', key: 'agent:k2', name: 'Parent one', groupIds: ['tg-p'] }, { id: 'k3', key: 'agent:k3', name: 'Other', groupIds: ['tg-z'] }];
      const up5 = (id) => (id === 'tg-y' ? ['tg-p'] : []);
      const grains5 = {
        plain: { access: [{ principal: par5, authority: 'draft' }] },
        only: { access: [{ principal: { ...par5, only: true }, authority: 'draft' }] },
        excepted: { access: [{ principal: par5, authority: 'draft' }], except: [{ kind: 'group', id: 'tg-y', name: 'Kid' }] },
        above: { access: [], eligibleAbove: [{ principal: par5, authority: 'draft', via: 'account', except: [{ kind: 'group', id: 'tg-y', name: 'Kid' }] }] },
      };
      const table5 = (CFm) => Object.fromEntries(Object.entries(grains5).map(([name, gr]) => {
        const offer = CFm.memberOffer({ access: gr.access, eligibleAbove: gr.eligibleAbove || [], except: gr.except || [], roster: roster5, ancestorsOf: up5 });
        const rows = roster5.map((s) => {
          const own = s.groupIds, up = [...new Set(own.flatMap(up5))].filter((x) => !own.includes(x));
          const v = CF5.validateWatchers([{ principal: { kind: 'agent', id: s.id }, notify: 'wake', mode: 'all', dailyWakeCap: 50 }], gr.access, { inherited: gr.eligibleAbove || [], members: [{ cid: s.id, groups: own, inherited: up }], except: gr.except || [] });
          const o = offer.find((x) => x.id === s.id) || null;
          return { id: s.id, offered: !!o, via: o ? o.via : null, child: o ? o.child : null, saved: v.ok === true, savedVia: v.ok === true ? v.watchers[0].via || null : null };
        });
        return [name, rows];
      }));
      const t5 = table5(CF5), same5 = (t) => Object.values(t).every((rows) => rows.every((r) => r.offered === r.saved && r.via === r.savedVia));
      const k1 = (t, g) => t[g].find((r) => r.id === 'k1');
      ok(same5(t5) && k1(t5, 'plain').offered && k1(t5, 'plain').child === 'tg-y' && !k1(t5, 'only').offered && !k1(t5, 'excepted').offered && !k1(t5, 'above').offered && t5.plain.find((r) => r.id === 'k3').offered === false,
        `B-fbd6 item 5: the Notify editor's offer equals what the save admits, session by session, over four grains (plain: ${t5.plain.filter((r) => r.offered).map((r) => r.id + '/' + r.via + (r.child ? ' under, in ' + r.child : '')).join(', ')}; only: ${t5.only.filter((r) => r.offered).map((r) => r.id).join(', ') || 'none'}; excepted: ${t5.excepted.filter((r) => r.offered).map((r) => r.id).join(', ') || 'none'}; above: ${t5.above.filter((r) => r.offered).map((r) => r.id).join(', ') || 'none'})`, t5);
      const OFFER5 = '  const rows = [...acc.map((row) => ({ row, except: ex })), ...above];\n';
      const M5 = mutantCopies('fbd6-offer', REPO);
      const r5 = table5(M5.load('src/channel-filter.js', anchored(cfSrc5, OFFER5, '  const rows = [...acc.map((row) => ({ row, except: [] })), ...above];\n', 'an offer without this grain\'s «除了»'), 'fbd6-offer-no-except'));
      ok(!same5(r5) && k1(r5, 'excepted').offered === true, `B-fbd6 item 5 RED CONTROL: an offer that reads this grain's rows without their «除了» — the child group's member offered where the save refuses it (${k1(r5, 'excepted').offered} / saved ${k1(r5, 'excepted').saved}) — the leg above would go red`, r5.excepted);
    }
  }
  // restack 411 (主开发 20:18Z, the meeting ruled (A)): the release's web-login «by what» facts carry the ancestors — a child's
  // conversation and a child group are drawn admitted by the parent's row; a row for «this group only» does not admit them
  {
    const BLw = require('../src/browser-login.js');
    const subjW = { sessions: [{ subject: 'session:k1', groupIds: ['tg-c'], inheritedGroupIds: ['tg-p'] }], groups: [{ subject: 'group:tg-c', inheritedGroupIds: ['tg-p'] }] };
    const rowsW = (entry) => ({ thisAccount: [{ door: BLw.DOOR, resource: 'https://shop.example.test#ada', to: [entry], except: [] }], anyAccount: [], anySite: [] });
    const bw = BLw.byWhatOf({ rows: rowsW({ kind: 'group', id: 'tg-p' }), subjects: BLw.byWhatSubjects(subjW) });
    const bwOnly = BLw.byWhatOf({ rows: rowsW({ kind: 'group', id: 'tg-p', only: true }), subjects: BLw.byWhatSubjects(subjW) });
    ok(J(bw['conversation:k1']) === J(['this-account']) && J(bw['group:tg-c']) === J(['this-account']) && !bwOnly['conversation:k1'] && !bwOnly['group:tg-c'], 'web logins «by what» (restack 411, ruled (A)): a child\'s conversation and a child group are drawn admitted by the parent\'s row; a row for «this group only» admits neither', { bw, bwOnly });
    const mpw = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
    ok(/\.\.\.\(\(gr\) => \(\{ groupIds: gr\.ids, inheritedGroupIds: Array\.isArray\(gr\.inherited\) \? gr\.inherited : \[\], \.\.\.\(gr\.unreadable \? \{ groupsUnreadable: true \} : \{\}\) \}\)\)\(automationGroupsRead\(s, id\)\)/.test(mpw) && /name: t\.title \|\| t\.id, inheritedGroupIds: tasks\.grantGroupsOf\(\[t\.id\]\)\.inherited \}\)\)/.test(mpw), 'web logins «by what»: the subjects producer hands each session its ancestors and each group its own, from the ONE reader');
    // CONTROL — it proves its plant first: «by what» without the session's ancestors draws the child conversation as NOT admitted
    const MW = mutantCopies('restack-by-what', REPO);
    try {
      const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf-8');
      const CUTW = ', inheritedGroupIds: Array.isArray(s.inheritedGroupIds) ? s.inheritedGroupIds.map(String) : [], ...(s.groupsUnreadable === true';   // restack 415: the train's hold mark follows the ancestors
      const mutW = anchored(bsrc, CUTW, ', ...(s.groupsUnreadable === true', 'by-what-own-groups');
      ok(bsrc.split(CUTW).length === 2 && mutW !== bsrc && !mutW.includes('s.inheritedGroupIds'), 'CONTROL plant: the session facts\' ancestors are cut, exactly once — the plant is where it claims');
      const BLx = MW.load('src/browser-login.js', mutW, 'by-what-own-groups');
      const bx = BLx.byWhatOf({ rows: rowsW({ kind: 'group', id: 'tg-p' }), subjects: BLx.byWhatSubjects(subjW) });
      ok(!bx['conversation:k1'] && J(bx['group:tg-c']) === J(['this-account']), 'CONTROL: «by what» without the session\'s ancestors draws the child conversation as NOT admitted by the parent\'s row — the leg above would be red', bx);
    } finally { try { fs.rmSync(MW.dir, { recursive: true, force: true }); } catch { } }
  }
  // restack 412 — the meeting with block 1's «What it may use»: its facts carry the ancestors (the ONE reader the wiring hands) and every
  // door hears them; a parent's 「除了」 is named for a child at the browser door; RED control (its plant proven first): no reader ⇒ no ancestors
  {
    const MU = require('../src/server/may-use.js');
    const seenF = [];
    const doorStub = { mayUseFor: (f) => { seenF.push(f); return []; } };
    const mkMU = (lineageOf) => MU.create({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', backend: 'claude', cwd: '/tmp/x' }]]), sessionKeyOf: () => 'claude:k1', addressableId: () => 'k1', groupsOf: () => [{ id: 'tg-c', title: 'Child' }], ...(lineageOf ? { lineageOf } : {}), doors: { automation: doorStub, exits: () => doorStub, windows: () => doorStub, vaultUse: doorStub, logins: doorStub } });
    const fr = await mkMU((ids) => (ids.includes('tg-c') ? ['tg-p'] : [])).factsOf('claude:k1', { webuiId: 'w-0001' });
    const ans = fr.ok ? mkMU((ids) => (ids.includes('tg-c') ? ['tg-p'] : [])).answersOf(fr.facts) : null;
    const frThrew = await mkMU(() => { throw new Error('the store'); }).factsOf('claude:k1', { webuiId: 'w-0001' });
    ok(fr.ok && J(fr.facts.inheritedGroupIds) === J(['tg-p']) && J(fr.facts.groupIds) === J(['tg-c']) && !!ans && seenF.length >= 3 && seenF.every((f) => J(f.inheritedGroupIds) === J(['tg-p'])) && frThrew.ok && frThrew.facts.groupsUnreadable === true && J(frThrew.facts.inheritedGroupIds) === J([]), 'what it may use (restack 412): the facts carry the ancestors from the ONE reader and every door hears them; a lineage that cannot be read is unreadable, never «no parents»', { inh: fr.facts && fr.facts.inheritedGroupIds, doors: seenF.length });
    const BPx = require('../src/browser-profiles.js');
    const profEx = { id: 'bp-0000e001', label: 'shop', grantUse: BPx.useOfRows([{ door: 'browser-profile', resource: 'bp-0000e001', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'tg-p' }] }]) };
    const exOf = BPx.exceptEntryOf(profEx, { conversationKeys: ['k1'], taskIds: ['tg-c'], inheritedTaskIds: ['tg-p'] }), exNoLine = BPx.exceptEntryOf(profEx, { conversationKeys: ['k1'], taskIds: ['tg-c'] });
    const mpw2 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8'), bk2 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf-8');
    ok(!!exOf && exOf.kind === 'group' && exOf.id === 'tg-p' && exNoLine === null && /lineageOf: \(ids\) => \{ const tasks = getTasks \? getTasks\(\) : null; if \(!tasks\) throw new Error\('the Task Group store is not ready'\); return tasks\.grantGroupsOf\(ids\)\.inherited; \}, noAgentOf:/.test(mpw2) && /const v = mayAttachL\(p, \{ browserKey: String\(browserKey \|\| ''\), conversationKeys,/.test(bk2) && /B\.exceptEntryOf\(p, \{ conversationKeys, taskIds, inheritedTaskIds: lineOf\(taskIds\)\.inherited, groupsUnreadable \}\)/.test(bk2), 'what it may use: a parent\'s 「除了」 is named for its child with the lineage (and not without it); the wiring hands the ONE reader; the keeper answers through mayAttachL', { exOf, exNoLine });
    // RED CONTROL — the plant first: a may-use with NO lineage reader (the block's own) hands its doors no ancestors
    const frNo = await mkMU(null).factsOf('claude:k1', { webuiId: 'w-0001' });
    ok(frNo.ok && !('inheritedGroupIds' in frNo.facts && frNo.facts.inheritedGroupIds.length), 'CONTROL: may-use without the reader (the plant: no lineageOf) hands no ancestors — the leg above would be red', frNo.facts && frNo.facts.inheritedGroupIds);
  }
  // restack 412 (主开发 03:48Z, the may-use meeting ruled as carried): THROUGH A REAL DOOR — may-use fed to the channels engine's own
  // mayUseFor: a child's conversation is shown the parent's account grant; a «this group only» row is not shown; RED control below
  {
    const P10 = { kind: 'group', id: 'tg-p', name: 'Parent' };
    const w10 = await world({ live: [{ cid: 'k1', name: 'Kid', groups: ['tg-c'], inherited: ['tg-p'] }] });
    const MU10 = require('../src/server/may-use.js');
    const mk10 = (lineageOf) => MU10.create({ activeSessions: new Map([['w-0001', { claudeSessionId: 'k1', backend: 'claude', cwd: '/tmp/x' }]]), sessionKeyOf: () => 'claude:k1', addressableId: () => 'k1', groupsOf: () => [{ id: 'tg-c', title: 'Child' }], ...(lineageOf ? { lineageOf } : {}), doors: { channels: () => w10.e } });
    const stateOf = async (mu) => { const fr = await mu.factsOf('claude:k1', { webuiId: 'w-0001' }); if (!fr.ok) return { fr, st: 'facts-failed' }; const r = mu.answersOf(fr.facts); const a = (r.accounts || []).find((x) => x && x.id === w10.A); return { fr, st: a ? a.state : 'no-row', groups: a ? a.groups : null }; };
    const line10 = (ids) => (ids.includes('tg-c') ? ['tg-p'] : []);
    const g10 = await w10.e.setAccess(w10.A, { kind: 'account' }, [{ principal: P10, authority: 'draft' }]);
    const shown = await stateOf(mk10(line10));
    const o10 = await w10.e.setAccess(w10.A, { kind: 'account' }, [{ principal: { ...P10, only: true }, authority: 'draft' }]);
    const onlyRow = await stateOf(mk10(line10));
    ok(!!g10 && g10.ok === true && shown.st === 'granted' && J(shown.groups) === J(['tg-p']) && !!o10 && o10.ok === true && onlyRow.st === 'none', 'what it may use THROUGH A REAL DOOR (the channels engine): a child\'s conversation is shown the parent\'s account grant; a row for «this group only» is not shown', { shown: shown.st, onlyRow: onlyRow.st });
    // RED CONTROL — the plant first (the lineage dropped at the facts: a may-use with no reader), then the verdict: the child is shown as refused
    await w10.e.setAccess(w10.A, { kind: 'account' }, [{ principal: P10, authority: 'draft' }]);
    const dropped = await stateOf(mk10(null));
    ok(dropped.fr.ok && J(dropped.fr.facts.inheritedGroupIds) === J([]), 'CONTROL plant: the facts carry NO ancestors (the lineage dropped at the facts) — the plant is where it claims', dropped.fr.facts && dropped.fr.facts.inheritedGroupIds);
    ok(dropped.st === 'none', 'CONTROL: with the lineage dropped at the facts the same child is shown as REFUSED by that door — the leg above would be red', dropped.st);
    try { w10.e.stop(); } catch { }
  }
  // the restack's owed cure (主开发 05:22Z): a lineage that cannot be read is UNKNOWN by name, never «no parents» — a site whose reader
  // throws (the roster pass) answers null; the channel facts read null as unreadable, so an «everyone except P» row never admits P's child
  {
    const RP = require('../src/server/roster-pass.js'), CF11 = require('../src/channel-filter.js'), ACL11 = require('../src/channel-acl.js');
    const sess11 = new Map([['w-0001', { claudeSessionId: 'k1', name: 'Kid', cwd: '/tmp/x' }]]);
    const rosterOf = (grantGroupsOf) => RP.sessionRoster({ sessions: () => sess11, tasks: () => ({ groupsForSession: () => [{ id: 'tg-c' }], grantGroupsOf }), addressableId: () => 'k1', statusKey: () => 'claude:k1' }).build();
    const rThrew = rosterOf(() => { throw new Error('the store'); }), rRead = rosterOf(() => ({ ids: ['tg-c'], inherited: ['tg-p'] }));
    const everyoneExceptP = { principal: { kind: 'everyone', id: '*' }, authority: 'draft', except: [{ kind: 'group', id: 'tg-p' }] };
    const ctxOf = (inh) => ({ kind: 'agent', id: 'k1', groups: ['tg-c'], inheritedGroups: inh });
    const unknownNamed = CF11.rowNames(everyoneExceptP, ctxOf(null)), readNamed = CF11.rowNames(everyoneExceptP, ctxOf(['tg-p'])), emptyNamed = CF11.rowNames(everyoneExceptP, ctxOf([]));
    const mpw11 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8'), ar11 = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
    ok(rThrew.length === 1 && rThrew[0].inherited === null && J(rRead[0].inherited) === J(['tg-p']) && unknownNamed === false && readNamed === false
      && (mpw11.match(/if \(!(?:tk|tasks)\) throw new Error\('the Task Group store is not ready'\); return (?:tk|tasks)\.grantGroupsOf\(ids\)\.inherited;/g) || []).length === 5   /* restack 415: + the end proposals' hook */
      && /catch \{ inheritedGroups = null; \}/.test(ar11) && /\.inherited; \} catch \{ return null; \} \}\)\(\)/.test(ar11) && typeof ACL11 === 'object',
      'the restack\'s cure: a lineage read that throws is UNKNOWN (the roster answers null; an «everyone except P» row never names P\'s child on it); the three hooks throw without a store (may-use\'s already did); the channel principals answer null', { rThrew: rThrew[0] && rThrew[0].inherited, unknownNamed, readNamed });
    // RED CONTROL — the plant first: the OLD fallback («no parents», []) — the same child IS named by the «everyone except P» row (more access)
    ok(J(ctxOf([]).inheritedGroups) === J([]) && emptyNamed === true, 'CONTROL: with the old «no parents» fallback ([]) the child of P IS named by «everyone except P» — the harm the cure closes (the leg above would be red)', emptyNamed);
  }
  // CONTROL: a planted file through the SAME census — each spelling the read found blind is caught; a carrying line is not
  const planted = [['src/planted.js', [
    "const GM = require('./grant-model.js');",
    'const a = { conversationKeys: keys, groupIds: ctx.groupIds };',
    'const b = { conversationKeys, groupIds, groupsUnreadable };',
    'const c = { conversationKeys: keys, groupIds: g, inheritedGroupIds: [] };',
    'const d = { conversationKeys: keys, groupIds: g };   // inheritedGroupIds rides elsewhere',
    'const e = { conversationKeys: keys, groupIds: g, inheritedGroupIds: inh };',
    'const f = { conversationKeys: keys, groupIds: g, inheritedGroupIds: Array.isArray(x.inheritedGroupIds) ? x.inheritedGroupIds : [] };',
  ].join('\n')]];
  const pc = censusOf(planted).bare;
  ok(J(pc) === J(['src/planted.js:2', 'src/planted.js:3', 'src/planted.js:4', 'src/planted.js:5']), 'CONTROL: the census catches a bare builder, the shorthand, a hard-coded empty lineage and a lineage named only in a comment — and passes the one that carries it', pc);
  // U3b: the browser doors — the PURE verdict, the keeper's ONE helper, the routes' own judgements, the web login
  const prof = { id: 'bp-0000d001', label: 'team', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000d001', to: [P], except: [] }]) };
  const profOnly = { id: 'bp-0000d002', label: 'own', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000d002', to: [PO], except: [] }]) };
  const profX = { id: 'bp-0000d003', label: 'all-but', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000d003', to: [EV], except: [P] }]) };
  const bm = (p, inh) => B.mayAttach(p, { browserKey: 'bk-0000000k', conversationKeys: ['k1'], taskIds: ['tg-c'], inheritedTaskIds: inh }).ok;
  ok(bm(prof, ['tg-p']) && !bm(prof, []) && !bm(profOnly, ['tg-p']) && !bm(profX, ['tg-p']) && bm(profX, []), 'browser-profile: the parent\'s «Who can use it» admits the child (with the lineage only); «仅本组» does not; «All except the parent» leaves it out');
  // the chain's cure (B): the browser door SAYS what the lineage decided — the agent's «used by» line, the two refusals
  const nmB = (id) => ({ 'tg-p': 'Parent' })[id] || null;
  const bfx = { browserKey: 'bk-0000000k', conversationKeys: ['k1'], taskIds: ['tg-c'], inheritedTaskIds: ['tg-p'], nameOf: nmB };
  const b1 = B.mayAttach(prof, bfx), b2 = B.mayAttach(profOnly, bfx), b3 = B.mayAttach(profX, bfx), bOwn = B.mayAttach(prof, { ...bfx, taskIds: ['tg-p'], inheritedTaskIds: [] });
  ok(b1.ok && b1.through === GM.LINEAGE_WORDS.through('Parent') && !b2.ok && b2.error.includes('as "this group only"') && b2.only && b2.only.id === 'tg-p' && !b3.ok && b3.code === 'excepted' && b3.error.includes('left out through its parent Task Group "Parent"') && bOwn.ok && !bOwn.through && B.agentUseOf(prof, bfx).through === b1.through, 'browser-profile (the cure (B)): the agent\'s line says «through its parent Task Group X»; the not-owner refusal names the «仅本组» entry, the excepted one the parent — nothing for the parent\'s own member', [b1.through, b2.error, b3.error]);
  const keeperSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf-8'), routesSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf-8');
  ok((keeperSrc.match(/B\.mayAttach\(/g) || []).length === 1 && /const mayAttachL = \(p, f\) => \{ const l = lineOf\(f && f\.taskIds\); return B\.mayAttach\(p, \{ \.\.\.f, inheritedTaskIds: l\.inherited,/.test(keeperSrc) && (keeperSrc.match(/B\.decideAttach\(/g) || []).length === 1 && /B\.decideAttach\(\{[^\n]*inheritedTaskIds: line\.inherited/.test(keeperSrc), 'the keeper judges a caller ONLY through mayAttachL (the lineage asked for the ids it judges) — its one decideAttach too');
  ok((routesSrc.match(/inheritedTaskIds = \(ctx\.lineageOf\(taskIds\) \|\| \[\]\)\.map\(String\)/g) || []).length === 2 && /const agentFactsOf = \(f\) => \(\{ browserKey: f\.browserKey, taskIds: f\.taskIds, inheritedTaskIds: f\.inheritedTaskIds \|\| \[\]/.test(routesSrc) && !/B\.mayAttach\((?!named, agentFactsOf\(f\)\))/.test(routesSrc), 'the routes: a live and a job caller\'s facts carry the lineage; the one direct mayAttach takes agentFactsOf (which carries it)');
  ok(/groupLineageOf: \(ids\) => \{ const tasks = getTasks \? getTasks\(\) : null; if \(!tasks\) throw new Error\('the Task Group store is not ready'\); return tasks\.grantGroupsOf\(ids\)\.inherited; \}/.test(wiring) && /lineageOf: \(ids\) => \{ const tasks = getTasks \? getTasks\(\) : null; if \(!tasks\) throw new Error\('the Task Group store is not ready'\); return tasks\.grantGroupsOf\(ids\)\.inherited; \},   \/\/ lane lg-group-parents U3b: the routes/.test(wiring), 'the wiring hands the keeper and the routes the ONE reader');
  const BLg = require('../src/browser-login.js');
  const spec = BLg.parseVaultFillSpec('shop.example.test/password');
  const lr = (rows) => (res) => (res === 'https://shop.example.test#*' ? rows : []);
  const fill = (rows, inh) => BLg.fillVerdict({ tabOrigin: 'https://shop.example.test', spec, entries: [{ origin: 'https://shop.example.test', user: 'alice', hasCurrent: true }], grantRows: lr(rows), facts: { conversationKeys: ['k1'], groupIds: ['tg-c'], inheritedGroupIds: inh }, vaultState: 'unlocked' }).ok;
  ok(fill([{ door: 'browser-login', resource: 'https://shop.example.test#*', to: [P], except: [] }], ['tg-p']) && !fill([{ door: 'browser-login', resource: 'https://shop.example.test#*', to: [PO], except: [] }], ['tg-p']), 'browser-login: a parent\'s web-login row fills for the child; «仅本组» does not');
  // U5b: the browser profile door carries «仅本组» from the PATCH to the row and back to the dialog
  const usv = B.useShapeVerdict({ mode: 'only', who: [{ kind: 'task', id: 'T-p1', only: true }, { kind: 'task', id: 'T-p2', only: false }, { kind: 'task', id: 'T-p3' }], except: [{ kind: 'task', id: 'T-p4', only: true }] });
  ok(usv.ok && usv.rows[0].only === true && usv.rows[1].only === false && !('only' in usv.rows[2]) && !('only' in (usv.except[0] || {})), 'U5b: the browser PATCH shape keeps a picked group\'s switch (true / false / unsaid) and never puts it on an exception', usv);
  const wv = B.whoMayUse({ id: 'bp-0000d009', label: 'x', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000d009', to: [PO], except: [] }]) });
  ok(JSON.stringify(wv).includes('"only":true'), 'U5b: the panel\'s reading of a stored «仅本组» group keeps the flag (the dialog draws the switch on from it)', wv);
  const stOf = (to) => B.useStamp({ id: 'bp-0000d00a', label: 'x', grantUse: B.useOfRows([{ door: 'browser-profile', resource: 'bp-0000d00a', to, except: [] }]) });
  ok(stOf([PO]) !== stOf([P]) && stOf([P]) === stOf([{ kind: 'group', id: 'tg-p' }]), 'the U5b read (BLOCKER 2): the list\'s change stamp sees «仅本组» (a flag-only change writes; a row without it keeps its bytes)');
  const trSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf-8');
  ok(/else rows\.push\(\{ kind: 'task', id: r\.id, \.\.\.\(r\.only === true \|\| r\.only === false \? \{ only: r\.only \} : \{\}\) \}\);/.test(trSrc) && /unreadable: f === undefined, \.\.\.\(w\.only === true \? \{ only: true \} : \{\}\) \};/.test(trSrc), 'the U5b read (BLOCKERS 1, 3): the dialog\'s own PATCH route carries the switch to the store, and its view carries the stored flag back');
  const BWM = await import(new URL('../src/lib/browser-who-model.js', import.meta.url).href).catch(() => null);
  const pr = BWM && BWM.pickerRows({ use: { mode: 'only', who: [{ kind: 'task', id: 'tg-p', title: 'P', only: true }] } }, { groups: [{ id: 'tg-p', title: 'P' }] });
  ok(!!pr && pr.wire.get('task:tg-p') && pr.wire.get('task:tg-p').only === true, 'U5b: the dialog\'s wire of a stored «仅本组» group carries it', pr && [...pr.wire]);
  // the chain's cure (B1): the agent-browser panel's «Who can use it» chip says what a Task Group entry admits (and its tooltip)
  const wc = BWM && BWM.whoChips({ mode: 'only', who: [{ kind: 'task', id: 'tg-p', title: 'Parent' }, { kind: 'task', id: 'tg-q', title: 'Q', only: true }] }, { t: (x) => x, taskOf: () => null });
  const tvSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf-8');
  ok(!!wc && wc.chips[0].only === false && /in its child groups, now or later/.test(wc.chips[0].tooltip) && wc.chips[1].only === true && /its child groups are not included/.test(wc.chips[1].tooltip) && /if \(c\.kind === 'task' && !c\.dead\) n\.appendChild\(chromeEl\('span', 'bprof-who-reach', c\.only \? t\('this group only'\) : t\('and its child groups'\)\)\);/.test(tvSrc), 'the panel (the cure (B1)): a Task Group chip says «and its child groups» / «this group only», its tooltip what it admits', wc && wc.chips.map((c) => [c.only, c.tooltip]));
  // U3c: the channel doors — reach (the ACL over the ONE store's rows), watch (the wake admission), a group's members (round-robin / via)
  const ACL = require('../src/channel-acl.js');
  const chLevel = (to, except, ctx) => { const s2 = GS.create({ memory: true }); s2.set('channel-reach', 'conversation:a1/c1', { to, except }); return ACL.effective(ctx, { key: 'a1/c1', adapterId: 'a1' }, CGM.create({ grants: s2 }).conversationGrants('a1/c1')).level; };
  const kidCtx = { kind: 'agent', id: 'k1', groups: ['tg-c'], inheritedGroups: ['tg-p'] }, parCtx = { kind: 'agent', id: 'p1', groups: ['tg-p'] };
  ok(chLevel([{ ...P, authority: 'draft' }], [], kidCtx) === 'visible' && chLevel([{ ...P, authority: 'draft' }], [], { ...kidCtx, inheritedGroups: [] }) !== 'visible' && chLevel([{ ...PO, authority: 'draft' }], [], kidCtx) !== 'visible' && chLevel([{ ...PO, authority: 'draft' }], [], parCtx) === 'visible' && chLevel([{ kind: 'everyone', authority: 'draft' }], [P], kidCtx) !== 'visible', 'channel-reach: a parent\'s access reaches the child (only with the lineage); «仅本组» only the parent\'s own; «All except the parent» leaves the child out');
  const s3 = GS.create({ memory: true });
  s3.set('channel-watch', 'conversation:a1/c1', { to: [P], except: [] });
  const cg3 = CGM.create({ grants: s3 });
  ok(cg3.wakeAdmits('conversation:a1/c1', { kind: 'group', id: 'tg-p' }, { cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }) && !cg3.wakeAdmits('conversation:a1/c1', { kind: 'group', id: 'tg-p' }, { cid: 'k1', groups: ['tg-c'] }), 'channel-watch: a parent\'s notification wakes the child\'s conversation (with the lineage)');
  const CF = require('../src/channel-filter.js');
  ok(!CF.memberStill({ via: 'tg-p', principal: { kind: 'agent', id: 'k1' } }, [{ cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }]) && CF.memberStill({ via: 'tg-p', principal: { kind: 'agent', id: 'k1' } }, [{ cid: 'k1', groups: ['tg-p'] }]) && CF.memberVia(new Set(['group:tg-p']), 'k1', [{ cid: 'k1', groups: ['tg-c'], inherited: ['tg-p'] }]) === null, 'the U3c read (MAJOR 4): the «via» shortcut judges OWN groups only (the release\'s answer — its entries cannot carry «仅本组»)');
  // the U3c read (BLOCKER 1): every reach / API grant the ACL reads keeps «仅本组»
  const s4 = GS.create({ memory: true });
  s4.set('channel-reach', 'conversation:a1/c1', { to: [{ ...PO, authority: 'draft' }] });
  s4.set('channel-api', 'acct-1', { to: [{ ...PO, tier: 'write-auto' }] });
  const cg4 = CGM.create({ grants: s4 });
  const rg = cg4.conversationGrants('a1/c1'), ag = cg4.apiGrants();
  ok(rg[0] && rg[0].principal.only === true && ag[0] && ag[0].principal.only === true && ACL.effective(kidCtx, { key: 'a1/c1', adapterId: 'a1' }, rg).level !== 'visible', 'the U3c read (BLOCKER 1): the reach and API grants keep «仅本组» — the child is not let in through a «仅本组» parent', { rg: rg[0] && rg[0].principal, ag: ag[0] && ag[0].principal });
  // the U3c read (BLOCKER 2): the fan-out hands each target its lineage
  const seenTg = [];
  CF.fanOutWatchers({ watchers: [{ watcher: { principal: { kind: 'everyone', id: '*' }, mode: 'all' } }] }, [{ cid: 'k1', name: 'K', groups: ['tg-c'], inherited: ['tg-p'] }], { admit: (item, tg) => { seenTg.push(tg); return true; } });
  ok(seenTg.length === 1 && JSON.stringify(seenTg[0].inherited) === JSON.stringify(['tg-p']), 'the U3c read (BLOCKER 2): fanOutWatchers hands admit a target that carries its lineage', seenTg);
  const accSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8'), engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  ok(/admit\(it\)\(m\.cid, m\.groups, m\.inherited\)/.test(accSrc) && /admit\(item\)\(tg\.cid, tg\.groups, tg\.inherited\)/.test(accSrc) && /groups: x\.groups, inherited: x\.inherited, \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\) \}\)\) : null;/.test(accSrc) && /\(cid, gs, ih\) => held\.every\(\(h\) => h\.admit\(cid, gs, ih\)\)/.test(engSrc) && (engSrc.match(/to: \[GM\.fromChannelPrincipal\(w\.principal\)\]\.filter\(Boolean\), except: \[\] \}\]/g) || []).length === 2, 'the U3c read (BLOCKER 3, MAJOR 4): the named-watcher re-judge, the fan-out admit, the stored fan watcher and the digest all hand the lineage; a group watcher\'s own entry keeps «仅本组»');
  const RP = require('../src/server/roster-pass.js');
  const fakeTasks = { groupsForSession: () => [{ id: 'tg-c' }], grantGroupsOf: (ids) => ({ ids, inherited: ids.includes('tg-c') ? ['tg-p'] : [] }), rev: () => 1 };
  const rb = typeof RP.createRosterBuild === 'function' ? RP.createRosterBuild : null;
  const rsrc = fs.readFileSync(path.join(REPO, 'src/server/roster-pass.js'), 'utf-8'), asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8'), osrc = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf-8'), apisrc = fs.readFileSync(path.join(REPO, 'src/server/channel-api.js'), 'utf-8'), esrc2 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  ok(/inherited = tk && typeof tk\.grantGroupsOf === 'function' \? tk\.grantGroupsOf\(groups\)\.inherited : \[\]/.test(rsrc) && /return \{ cid, name: s\.name \|\| null, groups, inherited,/.test(rsrc) && /inheritedGroups = tasks\.grantGroupsOf\(myGroups\)\.inherited/.test(asrc) && /groups: myGroups, inheritedGroups,/.test(asrc) && (esrc2.match(/inheritedGroups: inheritedOfSession\(cid\)/g) || []).length === 2 && /drafterInherited/.test(osrc) && /const judgedCtx = \(pr\) => \(\{[^\n]*inheritedGroups: pr\.inheritedGroups === null \? null : \(pr\.inheritedGroups \|\| \[\]\)/.test(apisrc) && /const shapeCtx = \(s\) => \{[^\n]*inheritedGroups: s\.inheritedGroups === null \? null : \(s\.inheritedGroups \|\| \[\]\)/.test(apisrc)   /* restack 415: the release's two ctx builders carry it */, 'the channel producers: the roster and the agent\'s channel principal ask the ONE reader; the engine\'s hearers, a draft, a stash and an API proposal carry the lineage (a stored one beside the groups it stored)');
  void rb; void fakeTasks;
}

// ═══ ⑩ lane lg-group-parents: «仅本组» leaves by name only ═══════════════════════
console.log('⑩ lane lg-group-parents: «仅本组» (only:true) leaves by name only — a write silent on the flag keeps it; the audit names a flip');
{
  const d = dirOf('only');
  const st = GS.create({ dataDir: d, now: () => 77 });
  const PO = { kind: 'group', id: 'g1', only: true };
  ok(st.set('browser-profile', 'p9', { to: [PO] }, 'user').ok && st.rowsFor('browser-profile', 'p9')[0].to[0].only === true, 'a «仅本组» entry is written with its flag');
  const r2 = st.set('browser-profile', 'p9', { to: [G1, M1] }, 'user');   // a dialog / verb that never knew the flag
  const back = st.rowsFor('browser-profile', 'p9')[0].to;
  ok(r2.ok && back.find((e) => e.id === 'g1').only === true && back.some((e) => e.key === 'm1'), 'a later write that names the group WITHOUT the flag KEEPS it (carried — never re-read wider)', back);
  const rn = st.set('browser-profile', 'p9', { to: [{ ...G1, only: null }, M1] }, 'user');
  ok(rn.ok && st.rowsFor('browser-profile', 'p9')[0].to.find((e) => e.id === 'g1').only === true, 'the U1 verdict: a write that sends only:null is SILENT on the flag — it keeps «仅本组»');
  const r3 = st.set('browser-profile', 'p9', { to: [{ ...G1, only: false }, M1] }, 'user');
  ok(r3.ok && st.rowsFor('browser-profile', 'p9')[0].to.find((e) => e.id === 'g1').only === undefined, 'only an explicit only:false widens it');
  const lines = fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.resource === 'p9');
  ok(lines.length === 3 && J(lines[0].to.added) === J(['group:g1 (only)']) && J(lines[2].to.removed) === J(['group:g1 (only)']) && J(lines[2].to.added) === J(['group:g1']), 'the audit names the flag: «group:g1 (only)» added, then removed for «group:g1» (a widening is never a silent line)', lines.map((l) => l.to));
  const MAC = 'a'.repeat(64), RES = 'pw:e1#password';
  ok(st.set('vault-use', RES, { to: [{ ...PO, mac: MAC }] }, 'user').ok, 'a vault-use «仅本组» member with the vault\'s mark is written');
  const r5 = st.set('vault-use', RES, { to: [{ ...G1, mac: MAC }] }, 'user');
  ok(!r5.ok && r5.code === 'only_unnamed' && st.rowsFor('vault-use', RES)[0].to[0].only === true, 'a MARKED entry written silent on the flag is refused only_unnamed, nothing written (its mark is over the flag — the vault door must say it)', r5);
  // CONTROL: the writer without the carry re-reads the entry wider
  const MZ = mutantCopies('grants-store-only', REPO);
  try {
    const gsrc = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
    const CARRY = "      out.push({ ...e, only: true }); moved = true;\n";
    ok(gsrc.split(CARRY).length === 2, 'CONTROL setup: the carry line is found exactly once');
    const MG = MZ.load('src/grant-model.js', editAnchor(gsrc, CARRY, '      out.push(e);\n', "src/grant-model.js"), 'no-carry');
    const was = { to: [PO] };
    ok(MG.onlyCarried(was, [G1]).to[0].only === undefined && GM.onlyCarried(was, [G1]).to[0].only === true, 'CONTROL: a model without the carry hands the silent write on WIDER — ⑩ «KEEPS it» would be red');
  } finally { try { fs.rmSync(MZ.dir, { recursive: true, force: true }); } catch { } }
}

console.log(fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
