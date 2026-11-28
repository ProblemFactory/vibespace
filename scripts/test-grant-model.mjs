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
//   ⑥ lane lg-group-parents (B-91a7, the owner's four rules of 2026-11-05): THE LINEAGE — a parent's group entry admits its
//     descendants' conversations (`inheritedGroupIds`), an entry marked «仅本组» (`only:true`) its own members only, a group
//     exception ALWAYS covers the descendants (`only` refused there), own beats inherited, the facts' sameness test,
//     prepared ≡ unprepared; CONTROLS — patched copies (no inherited hit · `only` ignored · an exception over own groups
//     only) turn ⑥ red.
// Fast (PURE, in-process).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // lane lg-group-parents (restack 415): the chain's controls by anchor (mutant-copy already loads scratch.mjs)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require('../src/grant-model.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d)}`.slice(0, 600)); } };
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
const row = (to, except = [], door = 'exit', resource = 'h:use') => ({ door, resource, to, except });

// ═══ ① the row and the write verdict ═══════════════════════════════════════
console.log('① the row and the write verdict');
{
  const src = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
  ok(!/\brequire\(|^\s*import\s/m.test(src), 'PURE: src/grant-model.js imports nothing');
  const n = GM.normRow(row([{ kind: 'group', id: 'tg-1' }, { kind: 'nope' }, { kind: 'conversation', key: '' }, { kind: 'group', id: 'tg-1' }, { kind: 'everyone', name: 'x' }]));
  ok(gateOf(n.ok) && J(n.row.to) === J([{ kind: 'group', id: 'tg-1' }, { kind: 'everyone' }]), 'a malformed / duplicate `to` entry is DROPPED (narrowing); everyone carries no name', n);
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
  ok(w('channel-reach', 'account:a', { to: [{ kind: 'group', id: 'g1', authority: 'root' }] }).code === 'bad_principal' && gateOf(GM.validateWrite('channel-reach', 'account:a', { to: [{ kind: 'group', id: 'g1', authority: 'send', level: 'visible' }] }).ok) && verdictOf(GM.validateWrite('channel-api', 'c', { to: [{ kind: 'group', id: 'g1', tier: 'read', perDay: 5 }] }).ok), "a door's own entry fields (ENTRY_FIELDS) are checked at the write; a bad value refuses the entry");
  ok(J(GM.normRow(row([{ kind: 'group', id: 'g1', authority: 'root' }, { kind: 'group', id: 'g2', authority: 'send' }], [], 'channel-reach', 'r')).row.to) === J([{ kind: 'group', id: 'g2', authority: 'send' }]), '…and at the read a bad value drops ITS entry (never read as some other setting)');
  ok(J([...codes].sort()) === J([...GM.WRITE_REFUSALS].sort()), `every write refusal is produced by name and WRITE_REFUSALS lists exactly them (${[...codes].sort().join(', ')})`);
  const v = GM.validateWrite('exit', 'h:use', { to: [{ kind: 'group', id: 'g1' }, { kind: 'group', id: 'g1' }], except: [{ kind: 'conversation', key: 'm1', name: 'Mo' }] }, { at: 7, by: 'user' });
  ok(gateOf(v.ok) && v.row.to.length === 1 && v.row.except[0].name === 'Mo' && v.row.at === 7 && v.row.by === 'user', 'a good write: duplicates collapsed, a display name kept, when / who stamped');
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
  ok(A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g2' }])], { conversationKey: 'x', groupIds: ['g2'] }).code === 'excepted' && verdictOf(A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g2' }])], { conversationKey: 'y', groupIds: ['g3'] }).ok), 'a Task Group left out of All agents: its members refused, everyone else admitted');
  ok(A([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }]), row([{ kind: 'conversation', key: 'm1' }], [], 'exit', 'h:use')], { conversationKey: 'm1', groupIds: ['g1'] }).via === 'conversation', 'ROWS ADD: a member left out of its group\'s row but named by ANOTHER row is admitted by that one');
  ok(A([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }]), row([{ kind: 'group', id: 'g2' }])], { conversationKey: 'm1', groupIds: ['g1', 'g2'] }).via === 'group', 'an exception subtracts only ITS row: the same member through another group\'s row is admitted');
  ok(A([row([{ kind: 'group', id: 'g1' }])], { conversationKey: 'x', groupsUnreadable: true }).code === 'groups_unreadable' && verdictOf(A([row([{ kind: 'group', id: 'g1' }, { kind: 'conversation', key: 'x' }])], { conversationKey: 'x', groupsUnreadable: true }).ok), 'groups that cannot be read: a group row is UNDECIDED (groups_unreadable — never «not a member»); a direct hit still admits');
  ok(A([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'g9' }])], { conversationKey: 'x', groupsUnreadable: true }).code === 'groups_unreadable', '…and an exception by group the caller\'s groups cannot answer leaves the row undecided too (never admitted on a guess)');
  ok(A([{ door: 'exit', resource: 'h', to: 'x' }], { conversationKey: 'x' }).code === 'unknown_shape' && verdictOf(A([{ door: 'exit', resource: 'h', to: 'x' }, row([{ kind: 'everyone' }])], { conversationKey: 'x' }).ok), 'an unreadable row refuses BY NAME (unknown_shape) — and never hides another row that admits');
  ok(A([row([{ kind: 'group', id: 'g1' }])], { conversationKey: 'x', forkPending: true }).code === 'fork_pending' && A([], { conversationKey: 'x' }).code === 'not_granted', 'a fork still on its source\'s id ⇒ fork_pending; nothing ⇒ not_granted');
  const order = [
    A([row([{ kind: 'group', id: 'g1' }]), { door: 'exit', resource: 'h', to: 'x' }], { conversationKey: 'm1', groupsUnreadable: true }).code,
    A([{ door: 'exit', resource: 'h', to: 'x' }, row([{ kind: 'everyone' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1' }).code,
    A([row([{ kind: 'everyone' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1', forkPending: true }).code,
  ];
  ok(J(order) === J(['groups_unreadable', 'unknown_shape', 'excepted']), 'the refusal ORDER: groups_unreadable › unknown_shape › excepted › fork_pending › not_granted', order);
  ok(J([...codesSeen].sort()) === J([...GM.REFUSALS].sort()), `every refusal produced by name and REFUSALS lists exactly them (${[...codesSeen].sort().join(', ')})`);
  ok(GM.hitsOf([row([{ kind: 'group', id: 'g1', tier: 'read' }], [], 'channel-api', 'c'), row([{ kind: 'conversation', key: 'm1', tier: 'write-auto' }], [], 'channel-api', 'c')], { conversationKey: 'm1', groupIds: ['g1'] }).length === 2, 'hitsOf: every admitting entry of every row (a door that takes the MAX of a setting)');
  ok(gateOf(GM.sharesGroup(['a', 'b'], ['b'])) && !GM.sharesGroup(['a'], ['c']) && !GM.sharesGroup([], []), 'sharesGroup — msg-acl\'s same-group default, the one membership test outside admits, lives here');
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
  ok(gateOf(GM.fromExitGrant({ mode: 'sometimes' }).unknown) && verdictOf(GM.fromHostExit({ exit: { use: { mode: 'weird' } } }).use.unknown), 'an exit grant the old reader could not read ⇒ unknown (it refused it — so does the row: none)');
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
    ok(gateOf(mm.use.unknown) && gateOf(mm.run.unknown) && !rr.rows.length && J(rr.unknown) === J(['hd']) && !GM.LEGACY.exit(hrec, 'use', ctx) && !GM.LEGACY.exit(hrec, 'run', ctx), `hub ${J(hub)}: the old reader could not read the record ⇒ both lists unknown (no row, named) and LEGACY.exit refuses both`, { mm, rr });
  }
  for (const hub of [undefined, null, { mode: 'nobody' }, { mode: 'everyone' }, { mode: 'ask' }]) {
    const hrec = { id: 'hk', exit: { ...lists, ...(hub === undefined ? {} : { hub }) } }, ctx = { sessionKeys: ['claude:m2'], groupIds: ['g1'] };
    ok(GM.rowsOfHosts([hrec]).rows.length === 2 && gateOf(GM.LEGACY.exit(hrec, 'use', ctx)) && verdictOf(GM.LEGACY.exit(hrec, 'run', ctx)), `hub ${J(hub)}: readable by the old rule ⇒ both lists carried, LEGACY.exit admits`);
  }
  ok(!GM.LEGACY.exit({ id: 'hu', exit: { use: { mode: 'everyone' }, run: { mode: 'weird' } } }, 'use', { sessionKeys: ['claude:m1'] }) && gateOf(GM.LEGACY.exit({ id: 'ha', allowExit: true }, 'run', { sessionKeys: ['claude:m1'] })) && !GM.LEGACY.exit({ id: 'hn' }, 'use', { sessionKeys: ['claude:m1'] }), 'LEGACY.exit reads the WHOLE record: an unreadable `run` refuses `use` too; a pre-list `allowExit:true` admits; nothing ⇒ nobody');
  // browser
  const bk = 'bk-0a0b0c0d';
  const resolveBrowserKey = (k) => (k === bk ? 'm1' : null);
  for (const p of [{ id: 'p1', owner: { kind: 'instance', id: null } }, { id: 'p2', owner: { kind: 'only', who: [{ kind: 'session', id: bk }, { kind: 'task', id: 'g1' }] } }, { id: 'p3', owner: { kind: 'session', id: bk } }, { id: 'p4', owner: { kind: 'task', id: 'g2' } }, { id: 'p5', legacy: true }, { id: 'p6' }, { id: 'p7', owner: { kind: 'instance', id: null, who: [{ kind: 'task', id: 'g2' }] } }]) {
    const m = GM.fromBrowserOwner(p, { resolveBrowserKey });
    const U = p.legacy || !p.owner || p.owner.kind === 'instance' ? { mode: 'all' } : p.owner.kind === 'only' ? { mode: 'only', who: p.owner.who.map((w) => ({ kind: w.kind, id: w.id })) } : { mode: 'only', who: [{ kind: p.owner.kind, id: p.owner.id }] };
    diff(`browser ${p.id} ${J(p.owner || (p.legacy ? 'legacy' : 'none'))}`, (pr) => GM.LEGACY.browser(U, { browserKey: pr.key === 'm1' ? bk : `bk-${pr.key}`, taskIds: pr.groups }), [row(m.to, [], 'browser-profile', p.id)]);
  }
  ok(gateOf(GM.fromBrowserOwner({ ephemeral: true, owner: { kind: 'conversation', id: bk } }).ephemeral) && gateOf(GM.fromBrowserOwner({ owner: [] }).unknown) && verdictOf(GM.fromBrowserOwner({ owner: { kind: 'weird' } }).unknown), 'an ephemeral record is no grant (its owner is its identity); an owner the old reader could not read ⇒ unknown');
  // verify F6 — ONE spelling of a browser key no binding names (the migration's): it stands for its own conversation
  const bp = GM.rowsOfBrowserProfiles([{ id: 'q1', owner: { kind: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f' }] } }, { id: 'q2', owner: { kind: 'session', id: 'bk-0e0e0e0e' } }]);
  ok(!bp.dropped.length && J(bp.rows.map((r) => r.to)) === J([[{ kind: 'conversation', key: 'bk-0f0f0f0f' }], [{ kind: 'conversation', key: 'bk-0e0e0e0e' }]]), 'rowsOfBrowserProfiles spells a key no binding names as ITS OWN conversation — the migration\'s spelling (pre-fix: dropped, while the migration carried it)', bp);
  const BPm = require('../src/browser-profiles.js');
  ok(verdictOf(['bk-0f0f0f0f', 'bk-0f0f0f0f.1', 'bk-0f0f0f0f.9999', 'bk-0f0f0f0f.12345', 'bk-0F0F0F0F.1', 'cid-1', ''].every((k) => GM.browserKeyResolver()(k) === BPm.parentKeyOf(k))), 'browserKeyResolver with no binding = browser-profiles parentKeyOf on every shape (a helper\'s key is its parent\'s — the old reader\'s collapse)');
  ok(J(GM.rowsOfBrowserProfiles([{ id: 'q4', owner: { kind: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f.2' }, { kind: 'session', id: 'bk-0f0f0f0f' }] } }]).rows[0].to) === J([{ kind: 'conversation', key: 'bk-0f0f0f0f' }]) && verdictOf(GM.LEGACY.browser({ mode: 'only', who: [{ kind: 'session', id: 'bk-0f0f0f0f' }] }, { browserKey: 'bk-0f0f0f0f.3' })), 'a helper\'s key and its parent collapse into ONE entry (the parent\'s) — and the old reader\'s stand-in admits a helper of a listed parent');
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
  ok(gateOf(GM.fromAutomationReach({ taskGroups: 'g1' }).unknown) && GM.fromAutomationGrant({ subject: 'external' }) === null, 'a damaged reach ⇒ unknown (the old reader voided the grant); an outside caller is no conversation (its own rule)');
  // lane key-grant-everyone: ALL AGENTS as an automation subject — ONE spelling (everyone:*), the model's own principal
  ok(J(GM.fromSubject('everyone:*')) === J({ kind: 'everyone' }) && J(GM.fromAutomationGrant({ subject: 'everyone:*' })) === J({ to: [{ kind: 'everyone' }] }) && GM.fromSubject('everyone') === null && GM.fromSubject('everyone:x') === null && GM.admits([{ door: 'automation-key-use', resource: 'ag-9', ...GM.fromAutomationGrant({ subject: 'everyone:*' }), except: [{ kind: 'conversation', key: 'm2' }] }], { conversationKey: 'm9' }).via === 'everyone',
    'fromSubject(everyone:*) ⇒ {kind:everyone} (its use row admits any conversation, its «除了» still subtracts); `everyone` / `everyone:x` map to nothing');
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
    const M1 = MZ.load('src/grant-model.js', editAnchor(src, EX, '', "src/grant-model.js"), 'ignores-except');
    const v = M1.admits([row([{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'm1' }])], { conversationKey: 'm1', groupIds: ['g1'] });
    ok(verdictOf(v.ok), 'CONTROL (a): an admits that ignores `except` admits the member the owner left out — ② «excepted» would be red');
    const DROP = "    if (!n) return { ok: false, code: 'unknown_shape', why: 'an exception this release cannot read — the whole grant is refused rather than read wider' };\n";
    ok(src.split(DROP).length === 2, 'CONTROL setup: the void-on-a-bad-exception line is found exactly once');
    const M2 = MZ.load('src/grant-model.js', editAnchor(src, DROP, '    if (!n) continue;\n', "src/grant-model.js"), 'drops-bad-except');
    ok(verdictOf(M2.admits([row([{ kind: 'everyone' }], [{ kind: 'conversation', key: '' }])], { conversationKey: 'x' }).ok), 'CONTROL (b): a reader that DROPS a malformed exception reads the row WIDER (admits) — ① «voids the row» would be red');
  } finally { try { fs.rmSync(MZ.dir, { recursive: true, force: true }); } catch { } }
}

// ═══ ⑤ lane browser-login: the door and its resource grammar ═══════════════════
console.log('⑤ lane browser-login: the browser-login door — its resource shape (one account · any account on a site · any site), fail closed');
{
  const W = (r) => GM.validateWrite('browser-login', r, { to: [{ kind: 'everyone' }] });
  const good = ['*', 'https://shop.example.test#*', 'https://shop.example.test:8443#alice.k+tag', 'http://localhost#dev', 'https://[::1]#v6'];
  const bad = ['shop.example.test#alice', 'https://shop.example.test', 'https://SHOP.example.test#a', 'https://shop.example.test#Alice', 'https://shop.example.test#a b', 'https://shop.example.test/p#a', '**', 'ftp://x.test#a', 'https://x.test#a#b'];
  ok(gateOf(GM.DOORS.includes('browser-login')) && GM.DOORS.indexOf('browser-login') === GM.DOORS.indexOf('group-visibility') + 1, 'the door is in DOORS (a new door is a value in the enum, never a who-list of its own)');   // lane vault-use-grants: `vault-use` follows it
  ok(gateOf(good.every((r) => W(r).ok)) && verdictOf(bad.every((r) => W(r).code === 'bad_resource')), 'the write takes <origin>#<user>, <origin>#* and * — and refuses every other shape bad_resource by name', { good: good.map((r) => [r, W(r).ok]), bad: bad.map((r) => [r, W(r).code]) });
  ok(gateOf(GM.validateWrite('exit', 'Anything Goes:use', { to: [] }).ok) && gateOf(GM.resourceShapeOk('window', 'w-1')) && !GM.resourceShapeOk('browser-login', 'w-1'), 'the other doors keep the general id rule (only browser-login has a shape of its own)');
  const odd = { door: 'browser-login', resource: 'shop.example.test#alice', to: [{ kind: 'everyone' }], except: [] };
  ok(GM.admits([odd], { conversationKeys: ['c1'] }).code === 'unknown_shape' && GM.publicRow(odd).unknown === true, 'a stored row of another shape is read FAIL CLOSED (unknown_shape — never «everyone»)');
  const C1 = { kind: 'conversation', key: 'c1' }, G = { kind: 'group', id: 'g1' };
  const rows = [{ door: 'browser-login', resource: 'https://shop.example.test#alice', to: [C1], except: [] }, { door: 'browser-login', resource: 'https://shop.example.test#*', to: [G], except: [{ kind: 'conversation', key: 'c2' }] }, { door: 'browser-login', resource: '*', to: [{ kind: 'everyone' }], except: [{ kind: 'conversation', key: 'c3' }] }];
  const v = (cid) => GM.admits(rows, { conversationKeys: [cid], groupIds: cid === 'c2' ? ['g1'] : [] });
  ok(gateOf(v('c1').ok) && v('c1').via === 'conversation' && gateOf(v('c2').ok) && v('c2').via === 'everyone' && !v('c3').ok && v('c3').code === 'excepted' && gateOf(v('c4').ok) && v('c4').via === 'everyone', 'the three scopes ADD: c1 by its account row, c2 left out of the site\'s wildcard but admitted by «any site», c3 left out of «any site» and in nothing else ⇒ excepted', ['c1', 'c2', 'c3', 'c4'].map((c) => [c, v(c).ok, v(c).via || v(c).code]));
}

// ═══ ⑥ lane lg-group-parents: THE LINEAGE (Task Group parents) ══════════════════
console.log('⑥ lane lg-group-parents: a child group uses what its parents are granted — «仅本组» narrows, an exception always covers descendants');
{
  // P = the parent, C = its child (facts: own [C], inherited [P]); G = the grandparent above P
  const P = { kind: 'group', id: 'tg-p' }, PONLY = { kind: 'group', id: 'tg-p', only: true }, Cg = { kind: 'group', id: 'tg-c' };
  const child = { conversationKey: 'k-child', groupIds: ['tg-c'], inheritedGroupIds: ['tg-p', 'tg-g'] };
  const parentOwn = { conversationKey: 'k-par', groupIds: ['tg-p'], inheritedGroupIds: ['tg-g'] };
  const legacy = { conversationKey: 'k-child', groupIds: ['tg-c'] };   // a door that passes no lineage (before its wiring, or rule ④'s doors)
  const L = (rows, facts) => GM.admits(rows, facts);
  const v1 = L([row([P])], child);
  ok(gateOf(v1.ok) && v1.via === 'group' && v1.entry.id === 'tg-p', 'rule ②: a row naming the PARENT admits a conversation of its CHILD (inherited, «含子组» is the default)', v1);
  ok(verdictOf(L([row([{ kind: 'group', id: 'tg-g' }])], child).ok), '…and of a grandchild (every ancestor the reader hands — a DAG, the union)');
  ok(!L([row([P])], legacy).ok && L([row([P])], legacy).code === 'not_granted', '…never without the fact: a facts builder that passes no inheritedGroupIds judges exactly as before (no ancestor guessed)');
  const v2 = L([row([PONLY])], child);
  ok(!v2.ok && v2.code === 'not_granted' && verdictOf(L([row([PONLY])], parentOwn).ok), '«仅本组» (`only:true`): the parent\'s own member is admitted, the child\'s conversation is not', [v2, L([row([PONLY])], parentOwn)]);
  const both = { conversationKey: 'k-both', groupIds: ['tg-c', 'tg-p'], inheritedGroupIds: ['tg-p'] };
  ok(verdictOf(L([row([PONLY])], both).ok), 'OWN beats inherited: a conversation directly in the parent too passes a «仅本组» entry (an id both own and inherited is own)');
  const v3 = L([row([{ kind: 'everyone' }], [P])], child);
  ok(!v3.ok && v3.code === 'excepted' && v3.entry.id === 'tg-p', 'rule ③: «everyone except the PARENT» leaves the CHILD\'s conversation out too (an exception covers descendants, always)', v3);
  ok(!L([row([Cg], [P])], child).ok && L([row([Cg], [P])], child).code === 'excepted', '…even when the row names the child itself in `to` (fail closed — a new subgroup never escapes an exclusion)');
  ok(gateOf(L([row([P], [Cg])], parentOwn).ok) && !L([row([P], [Cg])], child).ok, '«the parent except its child»: the parent\'s own member admitted, the child\'s conversation left out');
  ok(verdictOf(L([row([P], [Cg]), row([{ kind: 'conversation', key: 'k-child' }])], child).ok), 'ROWS ADD with the lineage too: the child\'s own direct row elsewhere still counts');
  ok(GM.validateWrite('exit', 'h:use', { to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'tg-p', only: true }] }).code === 'bad_except', 'the write refuses «仅本组» on an exception by name (bad_except — rule ③ has no opt-out)');
  const rx = GM.normRow(row([{ kind: 'everyone' }], [{ kind: 'group', id: 'tg-p', only: true }]));
  ok(gateOf(rx.ok) && rx.row.except[0].only === undefined && !L([rx.row], child).ok, '…and a stored exception carrying it reads WITHOUT it — it still covers the child (narrower, never wider)', rx);
  const w1 = GM.validateWrite('browser-profile', 'bp-1', { to: [PONLY, { kind: 'group', id: 'tg-x', only: false }] });
  ok(gateOf(w1.ok) && w1.row.to[0].only === true && !('only' in w1.row.to[1]), 'the write keeps `only:true` on a group entry; `false` is the default and is not stored', w1);
  ok(GM.validateWrite('exit', 'h:use', { to: [{ kind: 'group', id: 'tg-p', only: 'yes' }] }).code === 'bad_principal' && GM.validateWrite('exit', 'h:use', { to: [{ kind: 'conversation', key: 'k1', only: true }] }).code === 'bad_principal' && GM.validateWrite('exit', 'h:use', { to: [{ kind: 'everyone', only: true }] }).code === 'bad_principal', 'a flag the model cannot read (a non-boolean, or on a conversation / everyone) refuses the entry by name at the write');
  const rd = GM.normRow(row([{ kind: 'group', id: 'tg-p', only: 'yes' }, { kind: 'group', id: 'tg-q' }]));
  ok(gateOf(rd.ok) && J(rd.row.to) === J([{ kind: 'group', id: 'tg-q' }]), '…and at the read such an entry is DROPPED (never read as «含子组» — narrowing)', rd);
  ok(GM.publicRow(row([PONLY])).to[0].only === true, 'publicRow carries the flag (a page draws «仅本组» from the row itself)');
  const un = L([row([{ kind: 'group', id: 'tg-z' }])], { ...child, groupsUnreadable: true });
  ok(!un.ok && un.code === 'groups_unreadable', 'an unreadable Task Group store leaves the lineage undecided too — groups_unreadable, never not_granted');
  // the prepared road: same verdict, and the sameness test sees the new list
  const rowsL = [row([P]), row([PONLY], [], 'window', 'w-1'), row([{ kind: 'everyone' }], [P], 'exit', 'h:run')];
  const same = [child, parentOwn, legacy, both].every((f) => J(GM.admits(rowsL.map(GM.prepareRow), GM.prepareFacts(f))) === J(GM.admits(rowsL, f)));
  ok(verdictOf(same), 'prepared ≡ unprepared over the lineage cases (a kept row and kept facts judge exactly as fresh ones)');
  const inh = ['tg-p'], grp = ['tg-c'];
  const F1 = GM.prepareFacts({ conversationKey: 'k', groupIds: grp, inheritedGroupIds: inh });
  ok(GM.prepareFacts({ conversationKey: 'k', groupIds: grp, inheritedGroupIds: inh }, F1) === F1, 'prepareFacts answers the kept facts for the same arrays');
  const F2 = GM.prepareFacts({ conversationKey: 'k', groupIds: grp, inheritedGroupIds: ['tg-p', 'tg-g'] }, F1);
  ok(F2 !== F1 && verdictOf(F2.inherited.has('tg-g')), '…and fresh facts when the inherited list is another one (a parent added is never judged with the old lineage)');
  inh.push('tg-n');
  ok(GM.prepareFacts({ conversationKey: 'k', groupIds: grp, inheritedGroupIds: inh }, F1) !== F1, '…or the same array grown in place (its length is in the test)');
  ok(GM.sharesGroup(['tg-c'], ['tg-p']) === false, 'rule ④: «the same group» stays own groups only — a child and its parent are not one group (sharesGroup takes no lineage)');
  // the U1 adversarial read's findings, each a leg
  const rt = GM.fromChannelPrincipal(GM.toChannelPrincipal(PONLY));
  ok(gateOf(rt) && rt.only === true && !L([row([rt], [], 'channel-reach', 'account:a')], child).ok, 'read 1: «仅本组» rides the channel spelling both ways (toChannelPrincipal → fromChannelPrincipal keeps it; the child stays out)', rt);
  ok(gateOf(L([row([PONLY, P])], child).ok) && gateOf(L([row([P, PONLY])], child).ok) && GM.validateWrite('exit', 'h:use', { to: [PONLY, P] }).row.to[0].only === undefined && GM.normRow(row([PONLY, P])).row.to[0].only === undefined, 'read 3: the same group twice, «仅本组» and not — the union is the WIDER one in either order (no order decides)');
  const bad = L([row([{ kind: 'everyone' }], [P])], { conversationKey: 'k-child', groupIds: ['tg-c'], inheritedGroupIds: new Set(['tg-p']) });
  ok(!bad.ok && bad.code === 'groups_unreadable' && L([row([{ kind: 'everyone' }], [P])], { conversationKey: 'k-child', groupIds: ['tg-c'], inheritedGroupIds: 'tg-p' }).code === 'groups_unreadable', 'read 4: a lineage in a shape the model cannot read is UNREADABLE — «everyone except the parent» never reads it as «no ancestors»', bad);
  ok(GM.validateWrite('group-visibility', 'tg-x', { to: [{ kind: 'group', id: 'tg-x', level: 'visible', only: true }] }).code === 'bad_principal', 'read 7: the group-visibility door (rule ④, it never inherits) refuses the flag by name');
  const own1 = L([row([P, Cg])], child), par1 = L([row([P])], child);
  ok(own1.entry.id === 'tg-c' && !own1.inherited && par1.inherited === true && par1.entry.id === 'tg-p', 'read 8: the verdict names the caller\'s OWN group before a parent\'s, and says `inherited` when a parent\'s entry decided', [own1.entry, par1.inherited]);
  const wasRow = { to: [PONLY] };
  ok(GM.onlyCarried(wasRow, [{ ...P, only: null }]).to[0].only === true && GM.onlyCarried(wasRow, [{ ...P, only: null, mac: 'f'.repeat(64) }]).refused === 'group:tg-p', 'the U1 verdict: `only: null` is SILENT (carried; a marked entry refused) — only an explicit `false` widens');
  const gv = { door: 'group-visibility', resource: 'tg-p', to: [{ kind: 'group', id: 'tg-p', level: 'visible' }], except: [] };
  ok(!GM.admits([gv], child).ok && gateOf(GM.admits([gv], parentOwn).ok) && !GM.admits([GM.prepareRow(gv)], GM.prepareFacts(child)).ok, 'the U1 verdict: rule ④ holds IN THE MODEL — a group-visibility row never admits through the lineage, even when a caller hands it one');
  const gvx = { door: 'group-visibility', resource: 'tg-x', to: [{ kind: 'group', id: 'tg-x', level: 'visible' }], except: [P] };
  ok(GM.admits([gvx], { conversationKey: 'k', groupIds: ['tg-x', 'tg-c'], inheritedGroupIds: ['tg-p'] }).code === 'excepted', '…but its EXCEPTION still covers the descendants (rule ③ fails closed on every door — the U5a read, 5)');
  const VU = require('../src/vault-use-grant.js');
  const vm = { kind: 'group', id: 'tg-p', hosts: ['api.example.com'] };
  ok(VU.canonOf('secrets:secret:abc1234567#secret', { ...vm, only: true }, [], 2) !== VU.canonOf('secrets:secret:abc1234567#secret', vm, [], 2) && !VU.canonOf('secrets:secret:abc1234567#secret', vm, [], 2).includes('#only'), 'the U1 verdict: the vault canon\'s «仅本组» spelling, here in a FAST suite too (a member without the flag keeps its bytes)');
  ok(GM.onlyCarried(wasRow, [P]).to[0].only === true && GM.onlyCarried(wasRow, [{ ...P, only: false }]).to[0].only === false && GM.onlyCarried(wasRow, [{ ...P, mac: 'f'.repeat(64) }]).refused === 'group:tg-p' && GM.onlyCarried({ to: [P] }, [P]).to[0].only === undefined, 'read 2: onlyCarried — a write silent on the flag keeps it; only:false widens; a marked entry is refused; a row without the flag carries nothing');
  // the chain's cure (B): the verdict SAYS what the lineage decided, and ONE place words it for a door
  {
    const nameOf = (id) => ({ 'tg-p': 'Parent' })[id] || null;
    const through = L([row([P])], child), viaExc = L([row([{ kind: 'everyone' }], [P])], child), heldOnly = L([row([PONLY])], child), ownExc = L([row([{ kind: 'everyone' }], [{ kind: 'group', id: 'tg-c' }])], child), plain = L([row([{ kind: 'group', id: 'tg-z' }])], child);
    ok(viaExc.code === 'excepted' && viaExc.inherited === true && heldOnly.code === 'not_granted' && gateOf(heldOnly.only) && heldOnly.only.id === 'tg-p' && heldOnly.only.only === true && ownExc.code === 'excepted' && !ownExc.inherited && plain.code === 'not_granted' && !plain.only, 'the cure (B): an exception reached through a parent says `inherited`; a child held out by a «仅本组» entry is `not_granted` WITH that entry (`only`); an own exception and a plain refusal say neither', [viaExc, heldOnly.only, ownExc.inherited, plain.only]);
    const w = [GM.lineageWords(through, nameOf), GM.lineageWords(viaExc, nameOf), GM.lineageWords(heldOnly, nameOf), GM.lineageWords(ownExc, nameOf), GM.lineageWords(plain, nameOf), GM.lineageWords(L([row([P])], parentOwn), nameOf)];
    ok(w[0] === GM.LINEAGE_WORDS.through('Parent') && w[1] === GM.LINEAGE_WORDS.excepted('Parent') && w[2] === GM.LINEAGE_WORDS.only('Parent') && gateOf(w.slice(3).every((x) => x === '')) && gateOf(/parent Task Group "Parent"/.test(w[0])) && gateOf(/this group only/.test(w[2])) && verdictOf(GM.lineageWords(heldOnly, () => { throw new Error('x'); }).includes('"tg-p"')), 'the cure (B): lineageWords names the parent for an admit through it, an exception reached through it, a «仅本组» refusal — nothing for an own verdict; a name read that throws falls back to the id', w);
  }
  // CONTROLS — the change removed turns the legs above red
  const MZ = mutantCopies('grant-model', REPO);
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf-8');
    const HIT = "(F.groups.has(e.id) || (!e.only && toInherited && toInherited.has(e.id)))";
    const EXC = "    if (x.kind === 'group' && F.inherited && F.inherited.has(x.id)) return { state: 'excepted', row, entry: x, inherited: true };";   // the chain's cure (B): + it says it came through a parent
    ok(src.split(HIT).length === 2 && src.split(EXC).length === 2, 'CONTROL setup: the inherited hit and the inherited exception are each found exactly once');
    const M1 = MZ.load('src/grant-model.js', anchored(src, HIT, '(F.groups.has(e.id))', 'no-inherited-hit'), 'no-inherited-hit');   // stale-pins: kept (the mutant puts the release's own-only hit back)
    ok(!M1.admits([row([P])], child).ok, 'CONTROL (c): a model with no inherited hit refuses the child — ⑥ rule ② would be red');
    const M2 = MZ.load('src/grant-model.js', anchored(src, HIT, '(F.groups.has(e.id) || (toInherited && toInherited.has(e.id)))', 'ignores-only'), 'ignores-only');
    ok(verdictOf(M2.admits([row([PONLY])], child).ok), 'CONTROL (d): a model that ignores «仅本组» admits the child — ⑥ «仅本组» would be red');
    const M3 = MZ.load('src/grant-model.js', editAnchor(src, EXC, '', "src/grant-model.js"), 'except-own-only');
    ok(verdictOf(M3.admits([row([{ kind: 'everyone' }], [P])], child).ok), 'CONTROL (e): an exception judged over own groups only lets the child escape «everyone except the parent» — ⑥ rule ③ would be red');
    // the chain's cure (the U1fu read's should): the rule-④ guard — a model that lets the group-visibility door read the lineage
    // admits a child through its parent's visibility row (the leg «rule ④ holds IN THE MODEL» would be red)
    const G4 = "  const toInherited = row.door === 'group-visibility' ? null : F.inherited;";
    ok(src.split(G4).length === 2, 'CONTROL setup: the rule-④ guard is found exactly once');
    const M4 = MZ.load('src/grant-model.js', anchored(src, G4, '  const toInherited = F.inherited;', 'rule4-off'), 'rule4-off');
    ok(verdictOf(M4.admits([{ door: 'group-visibility', resource: 'tg-p', to: [{ kind: 'group', id: 'tg-p', level: 'visible' }], except: [] }], child).ok), 'CONTROL (rule ④): a model without the guard admits a child through its parent\'s visibility row — the rule-④ leg would be red');
  } finally { try { fs.rmSync(MZ.dir, { recursive: true, force: true }); } catch { } }
}

console.log(fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
