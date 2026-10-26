#!/usr/bin/env node
// THE GRANT MODEL (lane grants-unify, 2026-10-23 — the owner: 「权限系统要 unify 一下，不想引入太多复杂度」; the only
// concepts are 给谁 (`to`) and 除了 (`except`)). PURE src/grant-model.js, judged here alone:
//   ① the row and the write verdict — a malformed `to` entry is DROPPED (narrowing), a malformed `except` VOIDS the row
//     (widening is never a guess); every write refusal by name (WRITE_REFUSALS);
//   ② admits — rows ADD, an exception subtracts only ITS row, everyone needs a caller with a key, the most specific
//     entry is named, every refusal by name in its order (REFUSALS: groups_unreadable › unknown_shape › excepted ›
//     fork_pending › not_granted), names / namesNow / publicRow, the ONE conversation-key spelling;
//   ③ every legacy mapper DIFFERENTIAL — the pre-unify reader (GM.LEGACY) ≡ admits over the mapped row, over a probe
//     set, for every shape the census found (exit, browser, window, automation, channels, group visibility);
//   ④ CONTROLS — patched copies (an admits that ignores `except`; a reader that drops a malformed exception) turn ② red.
//   ⑤ lane browser-login: the `browser-login` door and its RESOURCE SHAPE (<origin>#<user> · <origin>#* · *) — the write refuses any
//     other (bad_resource), a stored row of another shape reads as unknown_shape (fail closed), the three scopes' rows ADD.
// Fast (PURE, in-process).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require('../src/grant-model.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d)}`.slice(0, 600)); } };
const J = JSON.stringify;
const row = (to, except = [], door = 'exit', resource = 'h:use') => ({ door, resource, to, except });

// ═══ ① the row and the write verdict ═══════════════════════════════════════
console.log('① the row and the write verdict');
{
  const src = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
  ok(!/\brequire\(|^\s*import\s/m.test(src), 'PURE: src/grant-model.js imports nothing');
  const n = GM.normRow(row([{ kind: 'group', id: 'tg-1' }, { kind: 'nope' }, { kind: 'conversation', key: '' }, { kind: 'group', id: 'tg-1' }, { kind: 'everyone', name: 'x' }]));
  ok(n.ok && J(n.row.to) === J([{ kind: 'group', id: 'tg-1' }, { kind: 'everyone' }]), 'a malformed / duplicate `to` entry is DROPPED (narrowing); everyone carries no name', n);
  ok(GM.normRow(row([{ kind: 'everyone' }], [{ kind: 'conversation', key: '' }])).code === 'unknown_shape', 'a malformed `except` entry VOIDS the row (unknown_shape — never read wider)');
  ok(GM.normRow(row([{ kind: 'everyone' }], [{ kind: 'everyone' }])).code === 'unknown_shape', 'everyone can never be an exception (the row is void)');
  ok(GM.normRow({ door: 'exit', resource: 'x', to: 'all' }).code === 'unknown_shape' && GM.normRow({ door: 'nope', resource: 'x', to: [] }).code === 'unknown_shape' && GM.normRow(null).code === 'unknown_shape', 'a `to` that is not a list, an unknown door, no row ⇒ unknown_shape');
  const codes = new Set();
  const w = (door, res, lists) => { const v = GM.validateWrite(door, res, lists); if (!v.ok) codes.add(v.code); return v; };
  ok(w('nope', 'x', {}).code === 'unknown_door', 'a door not in the enum ⇒ unknown_door (named)');
  ok(w('exit', '', {}).code === 'bad_resource' && w('exit', 'a\u0000b', {}).code === 'bad_resource', 'an empty / control-character resource ⇒ bad_resource');
  ok(w('exit', 'x', { to: 'all' }).code === 'bad_row' && w('exit', 'x', { to: [], except: 'm' }).code === 'bad_row', 'lists that are not lists ⇒ bad_row');
  ok(w('exit', 'x', { to: Array.from({ length: GM.LIST_MAX + 1 }, (_, i) => ({ kind: 'conversation', key: `c${i}` })) }).code === 'too_many', `more than ${GM.LIST_MAX} entries ⇒ too_many`);
  ok(w('exit', 'x', { to: [{ kind: 'session', id: 'x' }] }).code === 'bad_principal', 'an entry of no kind the model reads ⇒ bad_principal (strict at the write — never dropped quietly)');
  ok(w('exit', 'x', { to: [{ kind: 'everyone' }], except: [{ kind: 'everyone' }] }).code === 'bad_except', 'everyone as an exception ⇒ bad_except');
  ok(w('exit', 'x', { to: [{ kind: 'conversation', key: 'm1' }, { kind: 'group', id: 'g1' }], except: [{ kind: 'conversation', key: 'm1' }] }).code === 'except_conflicts', 'a principal both given and left out ⇒ except_conflicts (its own grant counts — the picker greys it «有自己的授权»)');
  ok(w('channel-reach', 'account:a', { to: [{ kind: 'group', id: 'g1', authority: 'root' }] }).code === 'bad_principal' && GM.validateWrite('channel-reach', 'account:a', { to: [{ kind: 'group', id: 'g1', authority: 'send', level: 'visible' }] }).ok && GM.validateWrite('channel-api', 'c', { to: [{ kind: 'group', id: 'g1', tier: 'read', perDay: 5 }] }).ok, "a door's own entry fields (ENTRY_FIELDS) are checked at the write; a bad value refuses the entry");
  ok(J(GM.normRow(row([{ kind: 'group', id: 'g1', authority: 'root' }, { kind: 'group', id: 'g2', authority: 'send' }], [], 'channel-reach', 'r')).row.to) === J([{ kind: 'group', id: 'g2', authority: 'send' }]), '…and at the read a bad value drops ITS entry (never read as some other setting)');
  ok(J([...codes].sort()) === J([...GM.WRITE_REFUSALS].sort()), `every write refusal is produced by name and WRITE_REFUSALS lists exactly them (${[...codes].sort().join(', ')})`);
  const v = GM.validateWrite('exit', 'h:use', { to: [{ kind: 'group', id: 'g1' }, { kind: 'group', id: 'g1' }], except: [{ kind: 'conversation', key: 'm1', name: 'Mo' }] }, { at: 7, by: 'user' });
  ok(v.ok && v.row.to.length === 1 && v.row.except[0].name === 'Mo' && v.row.at === 7 && v.row.by === 'user', 'a good write: duplicates collapsed, a display name kept, when / who stamped');
}

// ═══ ② admits ═══════════════════════════════════════════════════════════════
console.log('② admits — rows add, an exception subtracts only its row, every refusal by name');
const codesSeen = new Set();
const A = (rows, facts) => { const v = GM.admits(rows, facts); if (!v.ok) codesSeen.add(v.code); return v; };
{
  ok(A([row([{ kind: 'everyone' }])], { conversationKey: 'c1' }).via === 'everyone' && A([row([{ kind: 'everyone' }])], {}).code === 'not_granted', 'everyone admits a caller with a key — never one with none');
  ok(A([row([{ kind: 'group', id: 'g1' }])], { conversationKey: 'c1', groupIds: ['g1'] }).via === 'group' && A([row([{ kind: 'conversation', key: 'c1' }])], { conversationKeys: ['x', 'c1'] }).via === 'conversation', 'a group admits its member; a conversation its key (any of the caller\'s keys)');
  const spec = A([row([{ kind: 'everyone' }, { kind: 'group', id: 'g1' }, { kind: 'conversation', key: 'c1' }])], { conversationKey: 'c1', groupIds: ['g1'] });
  ok(spec.via === 'conversation' && spec.hits.length === 3, 'the most SPECIFIC admitting entry is named (its own > a group > everyone); `hits` = every one (a MAX door\'s input)', spec);
  const ex = A([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1', groupIds: ['g1'] });
  ok(!ex.ok && ex.code === 'excepted' && ex.entry.key === 'm1', 'a member LEFT OUT is refused `excepted`, naming the exception', ex);
  ok(A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g2' }])], { conversationKey: 'x', groupIds: ['g2'] }).code === 'excepted' && A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g2' }])], { conversationKey: 'y', groupIds: ['g3'] }).ok, 'a Task Group left out of All agents: its members refused, everyone else admitted');
  ok(A([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }]), row([{ kind: 'conversation', key: 'm1' }], [], 'exit', 'h:use')], { conversationKey: 'm1', groupIds: ['g1'] }).via === 'conversation', 'ROWS ADD: a member left out of its group\'s row but named by ANOTHER row is admitted by that one');
  ok(A([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }]), row([{ kind: 'group', id: 'g2' }])], { conversationKey: 'm1', groupIds: ['g1', 'g2'] }).via === 'group', 'an exception subtracts only ITS row: the same member through another group\'s row is admitted');
  ok(A([row([{ kind: 'group', id: 'g1' }])], { conversationKey: 'x', groupsUnreadable: true }).code === 'groups_unreadable' && A([row([{ kind: 'group', id: 'g1' }, { kind: 'conversation', key: 'x' }])], { conversationKey: 'x', groupsUnreadable: true }).ok, 'groups that cannot be read: a group row is UNDECIDED (groups_unreadable — never «not a member»); a direct hit still admits');
  ok(A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g9' }])], { conversationKey: 'x', groupsUnreadable: true }).code === 'groups_unreadable', '…and an exception by group the caller\'s groups cannot answer leaves the row undecided too (never admitted on a guess)');
  ok(A([{ door: 'exit', resource: 'h', to: 'x' }], { conversationKey: 'x' }).code === 'unknown_shape' && A([{ door: 'exit', resource: 'h', to: 'x' }, row([{ kind: 'everyone' }])], { conversationKey: 'x' }).ok, 'an unreadable row refuses BY NAME (unknown_shape) — and never hides another row that admits');
  ok(A([row([{ kind: 'group', id: 'g1' }])], { conversationKey: 'x', forkPending: true }).code === 'fork_pending' && A([], { conversationKey: 'x' }).code === 'not_granted', 'a fork still on its source\'s id ⇒ fork_pending; nothing ⇒ not_granted');
  const order = [
    A([row([{ kind: 'group', id: 'g1' }]), { door: 'exit', resource: 'h', to: 'x' }], { conversationKey: 'm1', groupsUnreadable: true }).code,
    A([{ door: 'exit', resource: 'h', to: 'x' }, row([{ kind: 'everyone' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1' }).code,
    A([row([{ kind: 'everyone' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1', forkPending: true }).code,
  ];
  ok(J(order) === J(['groups_unreadable', 'unknown_shape', 'excepted']), 'the refusal ORDER: groups_unreadable › unknown_shape › excepted › fork_pending › not_granted', order);
  ok(J([...codesSeen].sort()) === J([...GM.REFUSALS].sort()), `every refusal produced by name and REFUSALS lists exactly them (${[...codesSeen].sort().join(', ')})`);
  ok(GM.hitsOf([row([{ kind: 'group', id: 'g1', tier: 'read' }], [], 'channel-api', 'c'), row([{ kind: 'conversation', key: 'm1', tier: 'write-auto' }], [], 'channel-api', 'c')], { conversationKey: 'm1', groupIds: ['g1'] }).length === 2, 'hitsOf: every admitting entry of every row (a door that takes the MAX of a setting)');
  ok(GM.sharesGroup(['a', 'b'], ['b']) && !GM.sharesGroup(['a'], ['c']) && !GM.sharesGroup([], []), 'sharesGroup — msg-acl\'s same-group default, the one membership test outside admits, lives here');
  ok(J(GM.names(row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }]), { kind: 'conversation', key: 'm1' })) === J({ to: false, except: true }), 'names: is a principal in `to` / in `except` (the permissions window\'s «rows that name X»)');
  const now = GM.namesNow([{ kind: 'conversation', key: 'c1', name: 'old' }, { kind: 'conversation', key: 'gone', name: 'Gone' }, { kind: 'group', id: 'g1' }, { kind: 'group', id: 'g9', name: 'Old group' }, { kind: 'everyone' }], { sessions: [{ id: 'w1', name: 'Now', backendSessionId: 'c1' }], groups: [{ id: 'g1', title: 'Ops' }] });
  ok(now[0].name === 'Now' && now[1].absent === 'conversation' && now[2].name === 'Ops' && now[3].absent === 'group' && !now[4].absent, 'namesNow: a live conversation / listed group by its CURRENT name; a stored one not running / not listed says so; everyone is never absent', now);
  ok(GM.publicRow({ door: 'exit', resource: 'h', to: 'x' }).unknown === true && J(GM.publicRow(row([{ kind: 'group', id: 'g1', name: 'Ops' }]))) === J({ door: 'exit', resource: 'h:use', to: [{ kind: 'group', id: 'g1', name: 'Ops' }], except: [] }), 'publicRow: a readable row as stored (ids, kinds, names, settings); an unreadable one is `{unknown:true}`');
  ok(GM.keyFromSessionKey('claude:abc') === 'abc' && GM.keyFromSessionKey('codex:x-1') === 'x-1' && GM.keyFromSessionKey('webui:w1') === 'webui:w1' && GM.keyFromSessionKey('') === null && GM.keyFromSubject('session:c9') === 'c9' && GM.keyFromSubject('group:g') === null, 'ONE conversation-key spelling: the bare conversation id (`webui:<id>` before it has one) — exit / window `<backend>:<cid>`, automation `session:<cid>` map to it');
  ok(GM.conversationKeyOf({ backendSessionId: 'c1' }, 'w1') === 'c1' && GM.conversationKeyOf({}, 'w1') === 'webui:w1' && J(GM.conversationKeysOf({ backendSessionId: 'c1' }, 'w1')) === J(['c1', 'webui:w1']), 'a live session answers to its conversation id and to its webui key (a pending fork\'s own)');
}

// ═══ ③ every legacy mapper — DIFFERENTIAL ═══════════════════════════════════
console.log('③ the legacy mappers: the pre-unify reader ≡ admits over the mapped row, over every probe');
{
  const probes = [{ label: 'm1 (named)', key: 'm1', groups: [] }, { label: 'a member of g1', key: 'm2', groups: ['g1'] }, { label: 'an outsider', key: 'm3', groups: [] }, { label: 'a member of g2', key: 'm4', groups: ['g2'] }];
  const diff = (label, oldOf, newRows) => {
    const bad = probes.filter((p) => !!oldOf(p) !== GM.admits(newRows, { conversationKey: p.key, groupIds: p.groups }).ok).map((p) => p.label);
    ok(!bad.length, `${label}: old ≡ new for every probe`, bad);
  };
  // exit
  for (const g of [{ mode: 'nobody' }, { mode: 'everyone' }, { mode: 'only', who: [{ kind: 'session', id: 'claude:m1' }, { kind: 'group', id: 'g1' }] }, { mode: 'only', who: [{ kind: 'everyone', id: '*' }, { kind: 'group', id: 'g2' }] }]) {
    const m = GM.fromExitGrant(g);
    diff(`exit ${J(g)}`, (p) => GM.LEGACY.exit({ id: 'h', exit: { use: g, run: { mode: 'nobody' } } }, 'use', { sessionKeys: [`claude:${p.key}`], groupIds: p.groups }), m && m.to.length ? [row(m.to)] : []);
  }
  ok(GM.fromExitGrant({ mode: 'sometimes' }).unknown && GM.fromHostExit({ exit: { use: { mode: 'weird' } } }).use.unknown, 'an exit grant the old reader could not read ⇒ unknown (it refused it — so does the row: none)');
  const hx = GM.fromHostExit({ allowExit: true });
  ok(J(hx.use.to) === J([{ kind: 'everyone' }]) && J(hx.run.to) === J([{ kind: 'everyone' }]) && GM.fromHostExit({}).use === null && GM.fromHostExit({ exit: {} }).run === null && GM.fromExitGrant({ mode: 'nobody' }) === null, 'a pre-list `allowExit:true` ⇒ everyone / everyone; nothing / an exit without lists / nobody ⇒ no row (nobody)');
  const hosts = GM.rowsOfHosts([{ id: 'h1', exit: { use: { mode: 'everyone' }, run: { mode: 'only', who: [{ kind: 'group', id: 'g1' }], ask: true } } }, { id: 'h2', exit: { use: { mode: 'wat' } } }, { id: 'h3' }]);
  ok(hosts.rows.length === 2 && J(hosts.unknown) === J(['h2']) && J(hosts.asks) === J(['h1']), 'rowsOfHosts: a row per non-empty list, the unreadable named, «Ask me each time» carried', hosts);
  // verify F4: a STORED hub the old reader could not read (a spelled-out `default`, a junk mode) made the WHOLE access unknown —
  // both lists refused; the mapper says unknown (no row, named) and LEGACY.exit (which reads the record) refuses both
  const HP = require('../src/hub-act-policy.js');
  ok(J(GM.OLD_HUB_MODES) === J(HP.POLICIES), 'the old hub rule\'s copy = hub-act-policy POLICIES (the modes the old reader could read)', { model: GM.OLD_HUB_MODES, policy: HP.POLICIES });
  const lists = { use: { mode: 'everyone' }, run: { mode: 'only', who: [{ kind: 'group', id: 'g1' }] } };
  for (const hub of [{ mode: 'default' }, { mode: 'wat' }, 'junk', []]) {
    const hrec = { id: 'hd', exit: { ...lists, hub } }, mm = GM.fromHostExit(hrec), rr = GM.rowsOfHosts([hrec]);
    const ctx = { sessionKeys: ['claude:m2'], groupIds: ['g1'] };
    ok(mm.use.unknown && mm.run.unknown && !rr.rows.length && J(rr.unknown) === J(['hd']) && !GM.LEGACY.exit(hrec, 'use', ctx) && !GM.LEGACY.exit(hrec, 'run', ctx), `hub ${J(hub)}: the old reader could not read the record ⇒ both lists unknown (no row, named) and LEGACY.exit refuses both`, { mm, rr });
  }
  for (const hub of [undefined, null, { mode: 'nobody' }, { mode: 'everyone' }, { mode: 'ask' }]) {
    const hrec = { id: 'hk', exit: { ...lists, ...(hub === undefined ? {} : { hub }) } }, ctx = { sessionKeys: ['claude:m2'], groupIds: ['g1'] };
    ok(GM.rowsOfHosts([hrec]).rows.length === 2 && GM.LEGACY.exit(hrec, 'use', ctx) && GM.LEGACY.exit(hrec, 'run', ctx), `hub ${J(hub)}: readable by the old rule ⇒ both lists carried, LEGACY.exit admits`);
  }
  ok(!GM.LEGACY.exit({ id: 'hu', exit: { use: { mode: 'everyone' }, run: { mode: 'weird' } } }, 'use', { sessionKeys: ['claude:m1'] }) && GM.LEGACY.exit({ id: 'ha', allowExit: true }, 'run', { sessionKeys: ['claude:m1'] }) && !GM.LEGACY.exit({ id: 'hn' }, 'use', { sessionKeys: ['claude:m1'] }), 'LEGACY.exit reads the WHOLE record: an unreadable `run` refuses `use` too; a pre-list `allowExit:true` admits; nothing ⇒ nobody');
  // browser
  const bk = 'bk-0a0b0c0d';
  const resolveBrowserKey = (k) => (k === bk ? 'm1' : null);
  for (const p of [{ id: 'p1', owner: { kind: 'instance', id: null } }, { id: 'p2', owner: { kind: 'only', who: [{ kind: 'session', id: bk }, { kind: 'task', id: 'g1' }] } }, { id: 'p3', owner: { kind: 'session', id: bk } }, { id: 'p4', owner: { kind: 'task', id: 'g2' } }, { id: 'p5', legacy: true }, { id: 'p6' }, { id: 'p7', owner: { kind: 'instance', id: null, who: [{ kind: 'task', id: 'g2' }] } }]) {
    const m = GM.fromBrowserOwner(p, { resolveBrowserKey });
    const U = p.legacy || !p.owner || p.owner.kind === 'instance' ? { mode: 'all' } : p.owner.kind === 'only' ? { mode: 'only', who: p.owner.who.map((w) => ({ kind: w.kind, id: w.id })) } : { mode: 'only', who: [{ kind: p.owner.kind, id: p.owner.id }] };
    diff(`browser ${p.id} ${J(p.owner || (p.legacy ? 'legacy' : 'none'))}`, (pr) => GM.LEGACY.browser(U, { browserKey: pr.key === 'm1' ? bk : `bk-${pr.key}`, taskIds: pr.groups }), [row(m.to, [], 'browser-profile', p.id)]);
  }
  ok(GM.fromBrowserOwner({ ephemeral: true, owner: { kind: 'conversation', id: bk } }).ephemeral && GM.fromBrowserOwner({ owner: [] }).unknown && GM.fromBrowserOwner({ owner: { kind: 'weird' } }).unknown, 'an ephemeral record is no grant (its owner is its identity); an owner the old reader could not read ⇒ unknown');
  // verify F6 — ONE spelling of a browser key no binding names (the migration's): it stands for its own conversation
  const bp = GM.rowsOfBrowserProfiles([{ id: 'q1', owner: { kind: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f' }] } }, { id: 'q2', owner: { kind: 'session', id: 'bk-0e0e0e0e' } }]);
  ok(!bp.dropped.length && J(bp.rows.map((r) => r.to)) === J([[{ kind: 'conversation', key: 'bk-0f0f0f0f' }], [{ kind: 'conversation', key: 'bk-0e0e0e0e' }]]), 'rowsOfBrowserProfiles spells a key no binding names as ITS OWN conversation — the migration\'s spelling (pre-fix: dropped, while the migration carried it)', bp);
  const BPm = require('../src/browser-profiles.js');
  ok(['bk-0f0f0f0f', 'bk-0f0f0f0f.1', 'bk-0f0f0f0f.9999', 'bk-0f0f0f0f.12345', 'bk-0F0F0F0F.1', 'cid-1', ''].every((k) => GM.browserKeyResolver()(k) === BPm.parentKeyOf(k)), 'browserKeyResolver with no binding = browser-profiles parentKeyOf on every shape (a helper\'s key is its parent\'s — the old reader\'s collapse)');
  ok(J(GM.rowsOfBrowserProfiles([{ id: 'q4', owner: { kind: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f.2' }, { kind: 'session', id: 'bk-0f0f0f0f' }] } }]).rows[0].to) === J([{ kind: 'conversation', key: 'bk-0f0f0f0f' }]) && GM.LEGACY.browser({ mode: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f' }] }, { browserKey: 'bk-0f0f0f0f.3' }), 'a helper\'s key and its parent collapse into ONE entry (the parent\'s) — and the old reader\'s stand-in admits a helper of a listed parent');
  ok(GM.browserKeyResolver(() => 'cid-9')('bk-0f0f0f0f') === 'cid-9' && GM.browserKeyResolver(() => null)('bk-0f0f0f0f') === 'bk-0f0f0f0f' && GM.browserKeyResolver(() => { throw new Error('x'); })('bk-0f0f0f0f') === 'bk-0f0f0f0f' && GM.browserKeyResolver()('bk-0f0f0f0f') === 'bk-0f0f0f0f', 'browserKeyResolver: the bound conversation, else the key itself (a lookup that throws reads as unbound)');
  const bpBad = GM.rowsOfBrowserProfiles([{ id: 'q3', owner: { kind: 'only', who: [{ kind: 'session', id: 'not-a-key' }, { kind: 'task', id: 'g1' }] } }]);
  ok(bpBad.dropped.length === 1 && J(bpBad.rows[0].to) === J([{ kind: 'group', id: 'g1' }]), 'a malformed key is still dropped and NAMED (dropped) — the migration\'s equivalence check refuses that resource if a live conversation held it', bpBad);
  // window
  for (const rec of [{ rows: [{ principal: { kind: 'session', id: 'claude:m1' }, by: 'self-open' }, { principal: { kind: 'group', id: 'g1' }, by: 'user' }] }, { rows: [{ principal: { kind: 'everyone', id: '*' }, by: 'user' }] }, { rows: [] }]) {
    const m = GM.fromWindowRecord(rec);
    diff(`window ${J(rec.rows.map((r) => r.principal.kind))}`, (p) => GM.LEGACY.window(rec, { sessionKeys: [`claude:${p.key}`], groupIds: p.groups }), m.to.length ? [row(m.to, [], 'window', 'w')] : []);
  }
  ok(GM.fromWindowRecord({ rows: [{ principal: { kind: 'session', id: 'claude:m1' }, by: 'self-open', grantedAt: 5 }] }).to[0].origin === 'self-open', 'a window row keeps its origin (self-open / request / user) and when');
  // automation
  for (const g of [{ id: 'ag-1', subject: 'session:m1' }, { id: 'ag-2', subject: 'group:g1' }]) {
    const m = GM.fromAutomationGrant(g);
    diff(`automation use ${g.subject}`, (p) => GM.LEGACY.automationUse(g, [`session:${p.key}`, ...p.groups.map((x) => `group:${x}`)]), [row(m.to, [], 'automation-key-use', g.id)]);
  }
  for (const r of ['opened', 'instance', { taskGroups: ['g1', 'g2'] }]) {
    const m = GM.fromAutomationReach(r);
    diff(`automation reach ${J(r)}`, (p) => GM.LEGACY.automationReach(r, p.groups), m && !m.unknown ? [row(m.to, [], 'automation-key-reach', 'ag-1')] : []);
  }
  ok(GM.fromAutomationReach({ taskGroups: 'g1' }).unknown && GM.fromAutomationGrant({ subject: 'external' }) === null, 'a damaged reach ⇒ unknown (the old reader voided the grant); an outside caller is no conversation (its own rule)');
  const ak = GM.rowsOfAutomationGrants([{ id: 'ag-3', subject: 'group:g1', reach: 'instance' }, { id: 'ag-4', subject: 'external' }, { id: 'ag-5', subject: 'session:m1', reach: { taskGroups: 7 } }]);
  ok(ak.rows.length === 2 && ak.external === 1 && J(ak.unknown) === J(['ag-5']), 'rowsOfAutomationGrants: use + reach rows; the outside caller counted, the damaged named', ak);
  // channels
  for (const p of [{ kind: 'agent', id: 'm1' }, { kind: 'group', id: 'g1' }, { kind: 'everyone', id: '*' }]) {
    const e = GM.fromChannelPrincipal(p);
    diff(`channel ${p.kind}`, (pr) => GM.LEGACY.channel({ principal: p }, { kind: 'agent', id: pr.key, groups: pr.groups }), [row([e], [], 'channel-reach', 'account:a')]);
    ok(J(GM.toChannelPrincipal(e)) === J({ kind: p.kind, id: p.id, name: null }), `channel ${p.kind}: the channel spelling round-trips`);
  }
  ok(J(GM.fromChannelAccess([{ principal: { kind: 'group', id: 'g1' }, authority: 'send', createdAt: 4, createdBy: 'user' }, { principal: { kind: 'x' } }]).to) === J([{ kind: 'group', id: 'g1', authority: 'send', at: 4, by: 'user' }]), 'a grain\'s ACCESS list → entries with their authority (a malformed principal dropped)');
  ok(J(GM.fromChannelRows([{ principal: { kind: 'agent', id: 'm1' }, level: 'requestable' }, { principal: { kind: 'agent', id: 'm2' }, level: 'hidden' }]).to) === J([{ kind: 'conversation', key: 'm1', level: 'requestable' }]), 'reach rows → entries with their level (a `hidden` row grants nothing — not carried)');
  ok(J(GM.fromChannelApiRows([{ principal: { kind: 'group', id: 'g1' }, api: 'write-auto', perDay: 50 }, { principal: { kind: 'agent', id: 'm1' }, api: 'root' }]).to) === J([{ kind: 'group', id: 'g1', tier: 'write-auto', perDay: 50 }]) && GM.fromChannelWatchers([{ principal: { kind: 'everyone', id: '*' } }]).to[0].kind === 'everyone', 'raw-API rows → entries with their tier; watchers → who a notification may wake');
  // group visibility
  for (const lv of ['visible', 'messageable', 'none', null]) {
    const m = GM.fromGroupVisibility(lv, 'g1');
    diff(`group visibility ${lv}`, (p) => GM.LEGACY.groupVisibility(lv, 'g1', p.groups), m ? [row(m.to, [], 'group-visibility', 'g1')] : []);
  }
}

// ═══ ④ CONTROLS ═════════════════════════════════════════════════════════════
console.log('④ controls: patched copies of the model turn ② red');
{
  const MZ = mutantCopies('grant-model', REPO);
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
    const EX = "    if (x.kind === 'conversation' && F.keys.has(x.key)) return { state: 'excepted', row, entry: x };\n    if (x.kind === 'group') { if (F.groups.has(x.id)) return { state: 'excepted', row, entry: x }; if (F.unreadable) exceptUndecided = true; }\n";
    ok(src.split(EX).length === 2, 'CONTROL setup: the exception rung is found exactly once');
    const M1 = MZ.load('src/grant-model.js', src.replace(EX, ''), 'ignores-except');
    const v = M1.admits([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1', groupIds: ['g1'] });
    ok(v.ok, 'CONTROL (a): an admits that ignores `except` admits the member the owner left out — ② «excepted» would be red');
    const DROP = "    if (!n) return { ok: false, code: 'unknown_shape', why: 'an exception this release cannot read — the whole grant is refused rather than read wider' };\n";
    ok(src.split(DROP).length === 2, 'CONTROL setup: the void-on-a-bad-exception line is found exactly once');
    const M2 = MZ.load('src/grant-model.js', src.replace(DROP, '    if (!n) continue;\n'), 'drops-bad-except');
    ok(M2.admits([row([{ kind: 'everyone' }], [{ kind: 'conversation', key: '' }])], { conversationKey: 'x' }).ok, 'CONTROL (b): a reader that DROPS a malformed exception reads the row WIDER (admits) — ① «voids the row» would be red');
  } finally { try { fs.rmSync(MZ.dir, { recursive: true, force: true }); } catch { } }
}

// ═══ ⑤ lane browser-login: the door and its resource grammar ═══════════════════
console.log('⑤ lane browser-login: the browser-login door — its resource shape (one account · any account on a site · any site), fail closed');
{
  const W = (r) => GM.validateWrite('browser-login', r, { to: [{ kind: 'everyone' }] });
  const good = ['*', 'https://shop.example.test#*', 'https://shop.example.test:8443#alice.k+tag', 'http://localhost#dev', 'https://[::1]#v6'];
  const bad = ['shop.example.test#alice', 'https://shop.example.test', 'https://SHOP.example.test#a', 'https://shop.example.test#Alice', 'https://shop.example.test#a b', 'https://shop.example.test/p#a', '**', 'ftp://x.test#a', 'https://x.test#a#b'];
  ok(GM.DOORS.includes('browser-login') && GM.DOORS[GM.DOORS.length - 1] === 'browser-login', 'the door is in DOORS (a new door is a value in the enum, never a who-list of its own)');
  ok(good.every((r) => W(r).ok) && bad.every((r) => W(r).code === 'bad_resource'), 'the write takes <origin>#<user>, <origin>#* and * — and refuses every other shape bad_resource by name', { good: good.map((r) => [r, W(r).ok]), bad: bad.map((r) => [r, W(r).code]) });
  ok(GM.validateWrite('exit', 'Anything Goes:use', { to: [] }).ok && GM.resourceShapeOk('window', 'w-1') && !GM.resourceShapeOk('browser-login', 'w-1'), 'the other doors keep the general id rule (only browser-login has a shape of its own)');
  const odd = { door: 'browser-login', resource: 'shop.example.test#alice', to: [{ kind: 'everyone' }], except: [] };
  ok(GM.admits([odd], { conversationKeys: ['c1'] }).code === 'unknown_shape' && GM.publicRow(odd).unknown === true, 'a stored row of another shape is read FAIL CLOSED (unknown_shape — never «everyone»)');
  const C1 = { kind: 'conversation', key: 'c1' }, G = { kind: 'group', id: 'g1' };
  const rows = [{ door: 'browser-login', resource: 'https://shop.example.test#alice', to: [C1], except: [] }, { door: 'browser-login', resource: 'https://shop.example.test#*', to: [G], except: [{ kind: 'conversation', key: 'c2' }] }, { door: 'browser-login', resource: '*', to: [{ kind: 'everyone' }], except: [{ kind: 'conversation', key: 'c3' }] }];
  const v = (cid) => GM.admits(rows, { conversationKeys: [cid], groupIds: cid === 'c2' ? ['g1'] : [] });
  ok(v('c1').ok && v('c1').via === 'conversation' && v('c2').ok && v('c2').via === 'everyone' && !v('c3').ok && v('c3').code === 'excepted' && v('c4').ok && v('c4').via === 'everyone', 'the three scopes ADD: c1 by its account row, c2 left out of the site\'s wildcard but admitted by «any site», c3 left out of «any site» and in nothing else ⇒ excepted', ['c1', 'c2', 'c3', 'c4'].map((c) => [c, v(c).ok, v(c).via || v(c).code]));
}

console.log(fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
