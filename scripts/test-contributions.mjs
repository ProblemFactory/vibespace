#!/usr/bin/env node
// CONTRIBUTION REGISTRIES gate (Plugin Ph1 — docs/design-harness-plugins.md
// §3.2 `commands[]` + `menus[] {where, when, group}` + `keybindings[]`, and the
// ws-handler `default:` that replaced the silent fallthrough of §3.1).
//
//   A. FUNCTIONAL — src/lib/contributions.js imported in plain node (it must
//      be DOM-free at import, like window-types.js): register commands / menu
//      items / keybindings, assert dispatch, ordering (navigation → group →
//      order → registration), `when` filtering (item AND command, a throwing
//      when hides), separator collapse, empty-submenu drop, expand, the LOUD
//      paths (duplicate/malformed registrations throw, runCommand of an unknown
//      id throws, an unknown command on a menu item / keybinding warns once and
//      is skipped), the TREE fields (`submenu:true` heads + `parent`: loud
//      validation, lazy resolution that FALLS TO TOP LEVEL, empty / hidden
//      heads, expand inside a head, the two-level ceiling, plugin-style
//      parents), chord parsing + STRICT matching, dispatcher precedence,
//      dispose() + AbortSignal-scoped removal (a plugin's contributions leave
//      with it).
//   B. IDENTITY — the three migrated core menus (session-card / window / gear)
//      are diffed against a VERBATIM copy of the pre-registry hand-built
//      builders over a state matrix: byte-identical labels, separators,
//      disabled flags, submenu children, styles, onAction kinds, icons, danger.
//      Since 2.369.124 the gear menu is a TREE (docs/design-gear-menu-
//      hierarchy.md): B3 replays the block into a nested fixture over the
//      same 16 states, keeps the legacy flat list as the CENSUS baseline
//      (every old row lands in exactly one head or at the top level, none
//      twice, none lost; the additions are named), pins the top-level row
//      budget, the single danger row and the action→method map over the
//      flattened tree, and reads the four external owners' specs OFF THE
//      SOURCE so the fixture follows what channels-panel / channel-outbox /
//      integrations-window / desktop-app-launcher actually register.
//      Command mode: every single-key action is a command that drives the same
//      wm/desktopManager/app calls (wraparound intact, active-window guards).
//   C. WS DEFAULT — the REAL registerWsHandler on a fake wss: an unknown type
//      answers {type:'error', code:'unknown-type'} with NO sessionId (a
//      session-scoped error frame is what flips a live window read-only),
//      echoes reqId, counts telemetry, rate-limits its log.
//   D. WIRING PINS — the call sites actually render from the registry, the
//      legacy builders are gone, the client's ws `error` consumers stay
//      id-gated, the plugin host API exposes the three register* calls under
//      the plugin's signal, docs + ci carry it (the 2.355.0 unstaged-wiring class).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const J = (v) => JSON.stringify(v);
const throws = (fn) => { try { fn(); return false; } catch (e) { return String(e.message || e); } };
const captureWarns = (fn) => { const out = []; const o = console.warn; console.warn = (...a) => out.push(a.map(String).join(' ')); try { fn(); } finally { console.warn = o; } return out; };

// The registry imports telemetry-client → build-version.js, which `npm run
// build` GENERATES (gitignored); ci.mjs builds before any suite runs.
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) {
  console.error('src/lib/build-version.js is missing — run `npm run build` first (it is a generated file)');
  process.exit(1);
}

console.log('contributions — A. functional (node, DOM-free)');
ok(typeof document === 'undefined' && typeof window === 'undefined', 'harness has no DOM (the import below must not need one)');
const C = await import('../src/lib/contributions.js');
const { registerCommand, runCommand, hasCommand, getCommand, commandTitle, listCommands, registerMenuItem, unregisterMenuItem, menuItems, listMenus, listMenuItems,
  registerKeybinding, resolveKeybinding, installKeybindings, parseKey, keyMatches, listKeybindings } = C;
ok([registerCommand, runCommand, registerMenuItem, menuItems, registerKeybinding, installKeybindings, parseKey, keyMatches].every((f) => typeof f === 'function'), 'module exports the registry API');
ok(listCommands().length === 0 && listMenus().length === 0 && listKeybindings().length === 0, 'a bare import registers nothing (core registers in its owning modules, not here)');

// ── commands ──
{
  const calls = [];
  const dispose = registerCommand({ id: 'x.a', title: 'A', run: (ctx) => { calls.push(ctx.v); return 'ran'; } });
  ok(typeof dispose === 'function', 'registerCommand returns dispose()');
  ok(runCommand('x.a', { v: 1 }) === 'ran' && J(calls) === J([1]), 'runCommand passes ctx and returns the run result');
  ok(/duplicate command 'x.a'/.test(throws(() => registerCommand({ id: 'x.a', run() {} }))), 'duplicate command id THROWS (no silent override)');
  ok(/run/.test(throws(() => registerCommand({ id: 'x.b' }))), 'registerCommand without run() THROWS');
  ok(/id/.test(throws(() => registerCommand({ run() {} }))), 'registerCommand without id THROWS');
  ok(/when/.test(throws(() => registerCommand({ id: 'x.c', run() {}, when: 'nope' }))), 'non-function when THROWS');
  ok(/title/.test(throws(() => registerCommand({ id: 'x.d', run() {}, title: 42 }))), 'non-string/function title THROWS');
  const msg = throws(() => runCommand('nope.missing'));
  ok(/unknown command 'nope.missing'/.test(msg) && /x\.a/.test(msg), 'runCommand of an unknown id THROWS and names what IS registered (loud, never a fallthrough)');
  registerCommand({ id: 'x.t', title: (c) => 'T for ' + c.who, run() {}, when: (c) => !!c.on });
  ok(commandTitle('x.t', { who: 'q' }) === 'T for q' && commandTitle('x.a') === 'A' && commandTitle('zzz') === '', 'commandTitle resolves string + fn(ctx) titles');
  ok(getCommand('x.t')?.id === 'x.t' && getCommand('nope') === null && hasCommand('x.a'), 'getCommand / hasCommand');
  calls.length = 0; runCommand('x.t', { on: false });
  ok(true, 'runCommand does NOT consult `when` (VS Code semantics: when gates surfaces, executeCommand runs)');
  dispose();
  ok(!hasCommand('x.a'), 'dispose() removes the command');
  const ac = new AbortController();
  registerCommand({ id: 'x.sig', run() {}, signal: ac.signal });
  ok(hasCommand('x.sig'), 'signal-scoped command registered');
  ac.abort();
  ok(!hasCommand('x.sig'), 'aborting the signal unregisters the command (plugin deactivate)');
  registerCommand({ id: 'x.dead', run() {}, signal: AbortSignal.abort() });
  ok(!hasCommand('x.dead'), 'an already-aborted signal registers nothing');
}

// ── menus: ordering ──
{
  registerCommand({ id: 'm.b', title: 'B', run() {} });
  registerCommand({ id: 'm.a', title: 'A', run() {} });
  registerCommand({ id: 'm.c', title: (c) => 'C for ' + c.who, run() {} });
  registerMenuItem({ menu: 'm', command: 'm.b', group: '2_late', order: 5 });
  registerMenuItem({ menu: 'm', command: 'm.a', group: '1_mid', order: 20 });
  registerMenuItem({ menu: 'm', label: 'nav-2', group: 'navigation', order: 2, run() {} });
  registerMenuItem({ menu: 'm', label: 'nav-1', group: 'navigation', order: 1, run() {} });
  registerMenuItem({ menu: 'm', command: 'm.c', group: '1_mid', order: 10 });
  registerMenuItem({ menu: 'm', label: 'seq-a', group: '1_mid', order: 10, run() {} }); // same order → registration seq
  registerMenuItem({ menu: 'm', label: 'no-group', run() {} });                            // group '' sorts before '1_mid' but after navigation
  const labels = menuItems('m', { who: 'q' }).map((i) => (i.separator ? '|' : i.label));
  ok(J(labels) === J(['nav-1', 'nav-2', 'no-group', 'C for q', 'seq-a', 'A', 'B']), 'sorted by group (navigation first, then lexicographic), order, then registration seq', J(labels));
  ok(menuItems('m').every((i) => typeof i.action === 'function' && typeof i.id === 'string'), 'every rendered item has an action and an id');
  ok(J(listMenuItems('m').slice(0, 2)) === J(['m/m.b', 'm/m.a']), 'item id defaults to `${menu}/${command}`');
  ok(/duplicate menu item 'm\/m\.b'/.test(throws(() => registerMenuItem({ menu: 'm', command: 'm.b' }))), 'a second item for the same command without an explicit id THROWS');
  registerMenuItem({ menu: 'm', command: 'm.b', id: 'm/b-again', group: '3' });
  ok(listMenuItems('m').includes('m/b-again'), '…and registers with an explicit id');
  ok(menuItems('nope').length === 0, 'unknown menu → []');
}

// ── menus: when / fields / children / expand / separators ──
{
  registerCommand({ id: 'w.hidden', title: 'H', run() {}, when: (c) => !!c.showHidden });
  registerMenuItem({ menu: 'w', command: 'w.hidden', order: 1 });
  registerMenuItem({ menu: 'w', label: (c) => 'lbl-' + c.n, order: 2, when: (c) => c.n > 0, run() {}, disabled: (c) => c.n > 5, style: 'color:red', tooltip: (c) => 'tip' + c.n, icon: '<svg/>', danger: true, kind: 'k', keepOpen: true, decorate: () => {}, labelHtml: (c) => '<b>' + c.n + '</b>' });
  registerMenuItem({ menu: 'w', label: 'throws', order: 3, when: () => { throw new Error('boom'); }, run() {} });
  let w0, warns;
  warns = captureWarns(() => { w0 = menuItems('w', { n: 0 }); menuItems('w', { n: 0 }); });
  ok(w0.length === 0, 'when=false (item) and command.when=false items are hidden; a throwing when() hides', J(w0));
  ok(warns.length === 1 && /when\(\) threw: boom/.test(warns[0]), 'a throwing when() warns ONCE (never crashes the menu)', J(warns));
  const w1 = menuItems('w', { n: 7, showHidden: true });
  ok(J(w1.map((i) => [i.label, i.disabled, i.title])) === J([['H', undefined, undefined], ['lbl-7', true, 'tip7']]), 'command.when=true shows it; lazy label/disabled/tooltip evaluate per ctx', J(w1));
  ok(w1[1].style === 'color:red' && w1[1].icon === '<svg/>' && w1[1].danger === true && w1[1].kind === 'k' && w1[1].keepOpen === true && typeof w1[1].decorate === 'function' && w1[1].labelHtml === '<b>7</b>', 'style/icon/danger/kind/keepOpen/decorate/labelHtml pass through to the rendered item');
  ok(w1[0].command === 'w.hidden' && !('style' in w1[0]) && !('icon' in w1[0]), 'absent fields stay absent (showContextMenu reads presence)');
  const w2 = menuItems('w', { n: 2, showHidden: true });
  ok(w2[1].disabled === undefined, 'disabled(ctx)=false leaves the item enabled');

  // label override receives (ctx, commandTitle)
  registerCommand({ id: 'w.t', title: 'Title', run() {} });
  registerMenuItem({ menu: 'w2', command: 'w.t', label: (c, title) => '⟳ ' + title + (c.x || '') });
  ok(menuItems('w2', { x: '!' })[0].label === '⟳ Title!', 'label(ctx, title) can decorate the command title');

  // command icon flows to the item unless overridden
  registerCommand({ id: 'w.i', title: 'I', run() {}, icon: '<svg id="cmd"/>' });
  registerMenuItem({ menu: 'w3', command: 'w.i' });
  registerMenuItem({ menu: 'w3', command: 'w.i', id: 'w3/i2', icon: '<svg id="item"/>' });
  ok(menuItems('w3').map((i) => i.icon).join(',') === '<svg id="cmd"/>,<svg id="item"/>', 'command icon is the default; the item icon overrides it');

  // separators: explicit contributions; leading/trailing/doubled collapse
  registerMenuItem({ menu: 's', separator: true, group: '0', order: 0 });
  registerMenuItem({ menu: 's', label: 'a', group: '0', order: 1, run() {} });
  registerMenuItem({ menu: 's', separator: true, group: '0', order: 2 });
  registerMenuItem({ menu: 's', separator: true, group: '0', order: 3 });
  registerMenuItem({ menu: 's', label: 'gone', group: '0', order: 4, when: () => false, run() {} });
  registerMenuItem({ menu: 's', label: 'b', group: '1', order: 0, run() {} });
  registerMenuItem({ menu: 's', separator: true, group: '1', order: 1 });
  registerMenuItem({ menu: 's', label: 'tail-hidden', group: '1', order: 2, when: () => false, run() {} });
  const sl = menuItems('s').map((i) => (i.separator ? '|' : i.label));
  ok(J(sl) === J(['a', '|', 'b']), 'separators are explicit contributions; leading/doubled/trailing collapse', J(sl));
  ok(/separator/.test(throws(() => registerMenuItem({ menu: 's', separator: true, command: 'm.a' }))), 'a separator with a command THROWS');

  // children (submenu): fn or array; EMPTY → item dropped (VS Code hides empty submenus)
  registerMenuItem({ menu: 'c', label: 'parent', children: (c) => c.kids.map((k) => ({ label: k, action() {} })) });
  registerMenuItem({ menu: 'c', label: 'static', children: [{ label: 'k1', action() {} }] });
  const c1 = menuItems('c', { kids: ['x', 'y'] });
  ok(c1.length === 2 && J(c1[0].children.map((k) => k.label)) === J(['x', 'y']) && c1[1].children[0].label === 'k1', 'children(ctx) / children[] build submenu items');
  ok(menuItems('c', { kids: [] }).length === 1 && menuItems('c', { kids: [] })[0].label === 'static', 'an EMPTY children result drops the item');

  // expand: dynamic rows spliced inline
  registerMenuItem({ menu: 'e', label: 'head', group: '0', run() {} });
  registerMenuItem({ menu: 'e', separator: true, group: '1', order: 0 });
  registerMenuItem({ menu: 'e', expand: (c) => c.rows.map((r) => ({ label: r, action() {} })), group: '1', order: 10 });
  registerMenuItem({ menu: 'e', separator: true, group: '2', order: 0 });
  registerMenuItem({ menu: 'e', label: 'tail', group: '2', order: 10, run() {} });
  ok(J(menuItems('e', { rows: ['p1', 'p2'] }).map((i) => (i.separator ? '|' : i.label))) === J(['head', '|', 'p1', 'p2', '|', 'tail']), 'expand(ctx) splices rows at its group/order');
  ok(J(menuItems('e', { rows: [] }).map((i) => (i.separator ? '|' : i.label))) === J(['head', '|', 'tail']), 'an empty expand leaves ONE rule (doubled separators collapse)');

  // inline run item / validation
  ok(/label/.test(throws(() => registerMenuItem({ menu: 'v', run() {} }))), 'an inline item without a label THROWS');
  ok(/OR/.test(throws(() => registerMenuItem({ menu: 'v', command: 'm.a', run() {}, id: 'v/x' }))), 'command + run together THROWS');
  ok(/needs a/.test(throws(() => registerMenuItem({ menu: 'v', label: 'nothing' }))), 'an item with no command/run/children/expand/separator THROWS');
  ok(/menu/.test(throws(() => registerMenuItem({ command: 'm.a' }))), 'missing menu THROWS');
  ok(/order/.test(throws(() => registerMenuItem({ menu: 'v', command: 'm.a', order: 'x', id: 'v/o' }))), 'non-numeric order THROWS');

  // unknown command reference → dropped, warned once, telemetry
  registerMenuItem({ menu: 'u', command: 'ghost.cmd' });
  registerMenuItem({ menu: 'u', label: 'real', run() {} });
  let u1, u2;
  const uw = captureWarns(() => { u1 = menuItems('u'); u2 = menuItems('u'); });
  ok(u1.length === 1 && u2.length === 1 && u1[0].label === 'real', 'an item naming an unknown command is DROPPED (not rendered dead)');
  ok(uw.filter((m) => /unknown command 'ghost\.cmd'/.test(m)).length === 1 && /registered:/.test(uw[0]), '…and reported once, naming what IS registered', J(uw));

  // dispose + unregister + signal
  const d = registerMenuItem({ menu: 'd', label: 'x', run() {} });
  ok(menuItems('d').length === 1, 'registered'); d();
  ok(menuItems('d').length === 0, 'dispose() removes the menu item');
  const ac = new AbortController();
  registerMenuItem({ menu: 'd', label: 'sig', run() {}, signal: ac.signal });
  registerMenuItem({ menu: 'd', label: 'stay', run() {}, id: 'd/stay' });
  ac.abort();
  ok(J(menuItems('d').map((i) => i.label)) === J(['stay']), 'aborting the signal removes only that plugin\'s items');
  ok(unregisterMenuItem('d/stay') === true && unregisterMenuItem('d/stay') === false && menuItems('d').length === 0, 'unregisterMenuItem by id (idempotent)');
}

// ── menus: the TREE — submenu heads + parent (2.369.124, docs/design-gear-menu-hierarchy.md §2c) ──
{
  // registration is LOUD wherever the chain is already known
  ok(/explicit `id`/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, label: 'H' }))), 'a submenu head without an explicit id THROWS');
  ok(/needs a `label`/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h0' }))), 'a head without a label THROWS');
  ok(/carries no command/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h1', label: 'H', run() {} }))), 'a head with an inline run THROWS');
  ok(/carries no command/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h2', label: 'H', command: 'm.a' }))), 'a head with a command THROWS');
  ok(/carries no command/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h3', label: 'H', expand: () => [] }))), 'a head with expand THROWS');
  ok(/children/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h4', label: 'H', children: [] }))), 'a head with static children THROWS (members come through parent)');
  ok(/separator/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h5', label: 'H', separator: true }))), 'a separator head THROWS');
  ok(/`submenu` must be a boolean/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: 'yes', id: 'tree/h6', label: 'H' }))), 'a non-boolean submenu THROWS');
  ok(/`parent` must be a head id string/.test(throws(() => registerMenuItem({ menu: 'tree', label: 'x', run() {}, parent: 42 }))), 'a non-string parent THROWS');
  ok(/own parent/.test(throws(() => registerMenuItem({ menu: 'tree', id: 'tree/self', label: 'x', run() {}, parent: 'tree/self' }))), 'an item that is its own parent THROWS');
  ok(/`panel` must be a function/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h7', label: 'H', panel: 'x' }))) && /`caption`/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/h8', label: 'H', caption: 1 }))) && /`checked`/.test(throws(() => registerMenuItem({ menu: 'tree', label: 'x', run() {}, checked: 'y' }))), 'panel / caption / checked hints are validated');
  registerMenuItem({ menu: 'tree', id: 'tree/plain', label: 'plain', run() {}, order: 1 });
  ok(/not a `submenu:true` head/.test(throws(() => registerMenuItem({ menu: 'tree', label: 'x', run() {}, parent: 'tree/plain' }))), 'a parent that is a registered NON-head THROWS at registration (the chain is known — loud)');
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/A', label: 'A', order: 10 });
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/B', label: 'B', parent: 'tree/A', order: 3 });
  ok(/two levels/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/C', label: 'C', parent: 'tree/B' }))), 'a head under a head under a head THROWS (two levels at most)');
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/E', label: 'E', parent: 'tree/D' }); // D is registered LATER (lazy) …
  ok(/two levels/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/D', label: 'D', parent: 'tree/A' }))), '…and the ceiling is checked from BELOW too: filing D under A while E already sits under D THROWS');
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/D', label: 'D', order: 20 });
  ok(/is in menu 'tree', not 'other'/.test(throws(() => registerMenuItem({ menu: 'other', label: 'x', run() {}, parent: 'tree/A' }))), 'a parent from ANOTHER menu THROWS');
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/F', label: 'F', parent: 'tree/G', order: 30 });
  ok(/cycle/.test(throws(() => registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/G', label: 'G', parent: 'tree/F' }))), 'a parent cycle THROWS when the edge that closes it is registered');

  // resolution is LAZY and never drops a row
  registerMenuItem({ menu: 'tree', label: 'a1', run() {}, parent: 'tree/A', order: 2 });
  registerMenuItem({ menu: 'tree', label: 'a0', run() {}, parent: 'tree/A', order: 1 });
  registerMenuItem({ menu: 'tree', separator: true, parent: 'tree/A', order: 5 });
  registerMenuItem({ menu: 'tree', expand: (c) => c.rows.map((r) => ({ label: r, action() {} })), parent: 'tree/A', order: 6 });
  registerMenuItem({ menu: 'tree', label: 'b0', run() {}, parent: 'tree/B' });
  registerMenuItem({ menu: 'tree', label: 'e0', run() {}, parent: 'tree/E' });
  registerMenuItem({ menu: 'tree', label: 'f0', run() {}, parent: 'tree/F' });
  registerMenuItem({ menu: 'tree', label: 'orphan', run() {}, parent: 'tree/nope', order: 40 });
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/hidden', label: 'Hid', when: () => false, order: 50 });
  registerMenuItem({ menu: 'tree', label: 'h0', run() {}, parent: 'tree/hidden', order: 55 });
  registerMenuItem({ menu: 'tree', submenu: true, id: 'tree/empty', label: 'Empty', order: 60 });
  registerMenuItem({ menu: 'tree', label: 'gone', run() {}, parent: 'tree/empty', when: () => false });
  registerMenuItem({ menu: 'tree', label: 'plug', run() {}, parent: 'plugin:x:head' });
  registerMenuItem({ menu: 'tree', submenu: true, id: 'plugin:x:head', label: 'PH', order: 70 });
  const flat = (items, d = 0) => items.flatMap((i) => (i.separator ? ['>'.repeat(d) + '|'] : ['>'.repeat(d) + i.label, ...(i.children ? flat(i.children, d + 1) : [])]));
  let tr, tr0;
  const tw = captureWarns(() => { tr = menuItems('tree', { rows: ['p1'] }); tr0 = menuItems('tree', { rows: [] }); menuItems('tree', { rows: [] }); });
  ok(J(flat(tr)) === J(['plain', 'A', '>a0', '>a1', '>B', '>>b0', '>|', '>p1', 'D', '>E', '>>e0', 'F', '>f0', 'orphan', 'h0', 'PH', '>plug']),
    'members land in their head (sorted, separators collapsed, expand spliced INTO the head, two levels), an unknown / hidden parent surfaces the row at TOP LEVEL (never dropped), an EMPTY head drops itself, a plugin-style head id works', J(flat(tr)));
  ok(J(flat(tr0)) === J(['plain', 'A', '>a0', '>a1', '>B', '>>b0', 'D', '>E', '>>e0', 'F', '>f0', 'orphan', 'h0', 'PH', '>plug']), 'an empty expand inside a head leaves no trailing rule', J(flat(tr0)));
  ok(tw.filter((m) => /names parent/.test(m)).length === 3 && tw.some((m) => /'tree\/F' names parent 'tree\/G' which is not registered/.test(m)) && tw.some((m) => /'orphan'.*not registered/.test(m) || /names parent 'tree\/nope' which is not registered/.test(m)) && tw.some((m) => /parent 'tree\/hidden' which is hidden or not a head/.test(m)),
    'each unresolved parent is reported ONCE per process (three rows, three warnings over three builds), naming the row, the parent and why', J(tw));
  ok(tr.filter((i) => i.submenu).every((i) => !i.action && Array.isArray(i.children)) && tr.find((i) => i.label === 'A').children.find((k) => k.label === 'B').submenu === true, 'heads carry submenu:true + children and NO action; a nested head is a head');
  ok(J(listMenuItems('tree').filter((i) => i === 'tree/A' || i === 'tree/B')) === J(['tree/A', 'tree/B']), 'heads are ordinary registrations (listMenuItems, dispose, signal all apply)');
  // renderer hints on heads / choice rows pass through; a panel head survives with no members
  const panelFn = () => ({ el: true });
  registerMenuItem({ menu: 'tree2', submenu: true, id: 'tree2/p', label: 'P', panel: panelFn, caption: (c) => 'cap' + c.n, keepOpen: true });
  registerMenuItem({ menu: 'tree2', label: 'radio', run() {}, checked: (c) => c.n > 1 });
  registerMenuItem({ menu: 'tree2', label: 'plainrow', run() {} });
  const t2 = menuItems('tree2', { n: 2 });
  ok(t2[0].submenu === true && t2[0].panel === panelFn && t2[0].caption === 'cap2' && t2[0].keepOpen === true && J(t2[0].children) === '[]', 'a head with a panel is shown even with no members (the panel is its content); panel / caption / keepOpen pass through');
  ok(t2[1].checked === true && menuItems('tree2', { n: 0 })[1].checked === false && !('checked' in t2[2]), 'checked(ctx) becomes a boolean on choice rows and stays absent elsewhere');
  ok(!('panel' in t2[1]) && !('caption' in t2[1]), 'hints stay absent where not given');
  // verifier r2 (2026-09-21): the caption is LIVE — a FUNCTION caption also
  // rides through unresolved so the renderer can re-evaluate it after a change
  // made inside the head's own members; a string caption has nothing to refresh
  ok(typeof t2[0].captionOf === 'function' && t2[0].captionOf({ n: 7 }) === 'cap7' && t2[0].caption === 'cap2', 'a FUNCTION caption ALSO rides through as `captionOf` (re-evaluable by the renderer) beside its resolved string');
  registerMenuItem({ menu: 'tree2', submenu: true, id: 'tree2/s', label: 'S', panel: panelFn, caption: 'static' });
  const t2s = menuItems('tree2', { n: 2 }).find((i) => i.id === 'tree2/s');
  ok(t2s && t2s.caption === 'static' && !('captionOf' in t2s), 'a STRING caption carries no captionOf (nothing to re-evaluate)');
  // dispose of a head: its members surface at top level on the next build (reported once)
  unregisterMenuItem('tree/A');
  let trA; const twA = captureWarns(() => { trA = menuItems('tree', { rows: [] }); });
  ok(J(flat(trA).slice(0, 5)) === J(['plain', 'a0', 'a1', 'B', '>b0']) && twA.some((m) => /'tree\/B' names parent 'tree\/A' which is not registered/.test(m)), 'unregistering a head surfaces its members at the top level (never lost)', J(flat(trA)));
}

// ── keybindings ──
{
  ok(J(parseKey('Ctrl+Shift+K')) === J({ ctrl: true, alt: false, shift: true, meta: false, mod: false, key: 'k' }), 'parseKey: ctrl+shift+k');
  ok(parseKey('cmd+esc').meta && parseKey('cmd+esc').key === 'escape' && parseKey('alt+ArrowLeft').key === 'arrowleft' && parseKey('alt+left').key === 'arrowleft' && parseKey('ctrl++').key === '+' && parseKey('+').key === '+' && parseKey('mod+k').mod, 'parseKey: aliases (cmd→meta, esc→escape, left→arrowleft, ctrl++ → plus, mod)');
  ok(/unknown modifier 'hyper'/.test(throws(() => parseKey('hyper+k'))) && /key/.test(throws(() => parseKey('ctrl+'))) && /key/.test(throws(() => parseKey('ctrl'))) && throws(() => parseKey('')), 'parseKey: unknown modifier / trailing + / modifier-only / empty THROW');
  const ev = (o) => ({ key: 'k', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, target: { closest: () => null }, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; }, ...o });
  const ck = parseKey('ctrl+k');
  ok(keyMatches(ck, ev({ ctrlKey: true })) && !keyMatches(ck, ev({ ctrlKey: true, shiftKey: true })) && !keyMatches(ck, ev({ ctrlKey: true, altKey: true })) && !keyMatches(ck, ev({ metaKey: true })) && !keyMatches(ck, ev({})) && keyMatches(ck, ev({ ctrlKey: true, key: 'K' })),
    'keyMatches is STRICT: ctrl+k matches only ctrl+k (not ctrl+shift+k / ctrl+alt+k / meta+k / plain k); case-insensitive key');
  const mk = parseKey('mod+k');
  ok(keyMatches(mk, ev({ ctrlKey: true })) && keyMatches(mk, ev({ metaKey: true })) && keyMatches(mk, ev({ ctrlKey: true, metaKey: true })) && !keyMatches(mk, ev({})) && !keyMatches(mk, ev({ ctrlKey: true, shiftKey: true })), 'mod = ctrl OR meta (the app\'s `(e.ctrlKey || e.metaKey)` convention), other modifiers still exact');

  const fired = [];
  registerCommand({ id: 'kb.one', run: (ctx) => fired.push(['one', ctx.tag, ctx.event?.key]) });
  registerCommand({ id: 'kb.two', run: () => fired.push(['two']) });
  registerCommand({ id: 'kb.gated', run: () => fired.push(['gated']), when: (c) => !!c.allow });
  ok(/command/.test(throws(() => registerKeybinding({ key: 'ctrl+k' }))) && /key/.test(throws(() => registerKeybinding({ key: 'ctrl+', command: 'kb.one' }))), 'registerKeybinding without a command / with a malformed key THROWS at registration');
  const b1 = registerKeybinding({ key: 'ctrl+k', command: 'kb.one' });
  ok(/duplicate binding/.test(throws(() => registerKeybinding({ key: 'Ctrl+K', command: 'kb.one' }))), 'duplicate key→command pair THROWS');
  ok(resolveKeybinding(ev({ ctrlKey: true }), { tag: 't' })?.command === 'kb.one', 'resolveKeybinding finds the binding');
  ok(resolveKeybinding(ev({ ctrlKey: true, shiftKey: true }), {}) === null && resolveKeybinding(ev({ ctrlKey: true, isComposing: true }), {}) === null && resolveKeybinding(ev({ ctrlKey: true, keyCode: 229 }), {}) === null, 'non-matching chord / IME composition → null');
  registerKeybinding({ key: 'ctrl+k', command: 'kb.two' });
  ok(resolveKeybinding(ev({ ctrlKey: true }), {})?.command === 'kb.two', 'LATER registration wins (VS Code precedence)');
  registerKeybinding({ key: 'ctrl+k', command: 'kb.gated' });
  ok(resolveKeybinding(ev({ ctrlKey: true }), { allow: false })?.command === 'kb.two' && resolveKeybinding(ev({ ctrlKey: true }), { allow: true })?.command === 'kb.gated', 'a binding whose command.when is false is skipped and the next candidate resolves');
  registerKeybinding({ key: 'ctrl+k', command: 'kb.one', when: (c) => c.event.shiftKey === false && c.mode === 'x' });
  ok(resolveKeybinding(ev({ ctrlKey: true }), { mode: 'y', allow: true })?.command === 'kb.gated' && resolveKeybinding(ev({ ctrlKey: true }), { mode: 'x', allow: true })?.command === 'kb.one', 'binding when(ctx) sees ctx + event');
  const inTerm = () => ev({ ctrlKey: true, target: { closest: (sel) => (sel === '.xterm' ? {} : null) } });
  ok(resolveKeybinding(inTerm(), { mode: 'x', allow: true }) === null, 'events inside .xterm never match by default (terminals own their keys)');
  registerKeybinding({ key: 'ctrl+k', command: 'kb.two', inTerminal: true });
  ok(resolveKeybinding(inTerm(), {})?.command === 'kb.two', 'inTerminal:true opts a binding into terminal events');
  const unknownRef = registerKeybinding({ key: 'ctrl+j', command: 'kb.missing' });
  let r; const kw = captureWarns(() => { r = resolveKeybinding(ev({ ctrlKey: true, key: 'j' }), {}); resolveKeybinding(ev({ ctrlKey: true, key: 'j' }), {}); });
  ok(r === null && kw.length === 1 && /kb\.missing/.test(kw[0]), 'a binding to an unknown command never fires and is reported once', J(kw));
  unknownRef();
  ok(!listKeybindings().some((b) => b.command === 'kb.missing') && listKeybindings().some((b) => b.key === 'ctrl+k' && b.command === 'kb.two'), 'dispose() removes the binding; listKeybindings reports registrations');
  b1();

  // installKeybindings on a real EventTarget under an AbortSignal (bubble phase, defaultPrevented respected)
  const hits = [];
  registerCommand({ id: 'd.cmd', run: (ctx) => hits.push([ctx.from, ctx.event.type]) });
  registerCommand({ id: 'd.boom', run: () => { throw new Error('kaboom'); } });
  registerKeybinding({ key: 'ctrl+shift+p', command: 'd.cmd' });
  registerKeybinding({ key: 'ctrl+shift+b', command: 'd.boom' });
  const target = new EventTarget();
  const ac = new AbortController();
  const mkEvt = (key, o = {}) => Object.assign(new Event('keydown', { cancelable: true }), { key, ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, ...o });
  ok(/EventTarget/.test(throws(() => installKeybindings(null))) && /getCtx/.test(throws(() => installKeybindings(target, { getCtx: 1 }))), 'installKeybindings validates target + getCtx');
  const uninstall = installKeybindings(target, { signal: ac.signal, getCtx: () => ({ from: 'doc' }) });
  const de1 = mkEvt('P'); target.dispatchEvent(de1);
  ok(J(hits) === J([['doc', 'keydown']]) && de1.defaultPrevented, 'ONE listener routes keydown → registry (getCtx supplies ctx, event rides along, default prevented)');
  const de2 = mkEvt('P'); de2.preventDefault(); target.dispatchEvent(de2);
  ok(hits.length === 1, 'an already-consumed key (defaultPrevented — an element\'s own shortcut) is left alone');
  const errs = []; const oe = console.error; console.error = (...a) => errs.push(a.map(String).join(' '));
  const de3 = mkEvt('B'); target.dispatchEvent(de3);
  console.error = oe;
  ok(de3.defaultPrevented && errs.some((m) => /d\.boom.*failed/.test(m)), 'a throwing command is logged, never propagated into the event loop');
  ac.abort();
  const de4 = mkEvt('P'); target.dispatchEvent(de4);
  ok(hits.length === 1 && !de4.defaultPrevented, 'aborting the signal removes the dispatcher (app-lifetime AbortController)');
  ok(typeof uninstall === 'function', 'installKeybindings returns an uninstall()');
  const pac = new AbortController();
  registerKeybinding({ key: 'ctrl+shift+q', command: 'd.cmd', signal: pac.signal });
  ok(listKeybindings().some((b) => b.key === 'ctrl+shift+q'), 'signal-scoped binding registered');
  pac.abort();
  ok(!listKeybindings().some((b) => b.key === 'ctrl+shift+q'), 'aborting the signal removes the binding (plugin deactivate)');
}

// ── B. identity: migrated menus vs VERBATIM copies of the legacy builders ──
console.log('contributions — B. migrated core menus ≡ legacy builders');
// Each owning module keeps its registrations in a self-contained
// `export function registerX() { … } registerX(); // end registerX` block that
// closes over a known set of names; the block is extracted from the SOURCE and
// replayed here with those names injected (the modules themselves need the
// DOM at import). A new closed-over name = ReferenceError = red.
const extract = (file, fnName) => {
  const src = read(file);
  const start = src.indexOf(`export function ${fnName}() {`);
  const end = src.indexOf(`// end ${fnName}`);
  if (start < 0 || end < 0) throw new Error(`${file}: cannot extract ${fnName} (missing "export function ${fnName}() {" or "// end ${fnName}")`);
  return src.slice(start, end).replace('export function', 'function');
};
const id = (s) => s;
const cartesian = (...sets) => sets.reduce((acc, set) => acc.flatMap((a) => set.map((v) => [...a, v])), [[]]);
const project = (items, parentKind) => items.map((i) => (i.separator ? { sep: 1 } : {
  label: i.label, ...(i.disabled ? { disabled: true } : {}), ...(i.style ? { style: i.style } : {}),
  ...((i.kind || parentKind) ? { kind: i.kind || parentKind } : {}), ...(i.danger ? { danger: true } : {}), ...(i.icon ? { icon: i.icon } : {}),
  ...(i.children ? { children: i.children.map((k) => ({ label: k.label, ...(k.disabled ? { disabled: true } : {}), ...(i.kind ? { kind: i.kind } : {}) })) } : {}),
}));

// B1. session-card menu
{
  const backendFeatureCaps = (b) => ({ fork: b !== 'shell' });
  const copyCalls = [];
  new Function('registerCommand', 'registerMenuItem', 'tr', 'backendFeatureCaps', 'copyText', 'showConfirmDialog', extract('src/lib/session-card.js', 'registerSessionCardMenu'))(
    registerCommand, registerMenuItem, id, backendFeatureCaps, (t) => copyCalls.push(t), async () => false);
  ok(listMenuItems('session-card').length >= 20 && hasCommand('session.restart') && hasCommand('session.properties') && hasCommand('session.locate'), 'session-card block registers the session.* commands + the card menu');
  // VERBATIM legacy builder (pre-registry session-card.js contextmenu handler, 2.369.37), projected
  const legacy = (s, state, app) => {
    const tr = id; const items = [];
    if (s.status === 'live' && s.webuiId) {
      items.push({ label: tr('Focus window') });
      items.push({ label: '⟳ ' + tr('Restart (Terminate + Resume)') });
    } else if (s.status === 'tmux') {
      items.push({ label: tr('View (tmux)') });
    } else if (s.status === 'stopped') {
      items.push({ label: tr('Resume in Chat') });
      items.push({ label: tr('Resume in Terminal') });
    }
    items.push({ label: tr('View History') });
    if (backendFeatureCaps(s.backend || 'claude').fork && s.status !== 'external') items.push({ label: tr('Fork…') });
    items.push({ separator: true });
    items.push({ label: state.isStarred(s) ? tr('Unstar') : tr('Star') });
    items.push({ label: state.isArchived(s) ? tr('Unarchive') : tr('Archive') });
    items.push({ label: tr('Rename…') });
    items.push({ label: tr('Set status…') });
    const groups = (state._tasks || []).filter(t => !t.archived);
    if (groups.length) {
      const explicitIds = new Set((state._getSessionTasks?.(s) || []).map(t => t.id));
      const folderIds = new Set((state._getSessionTaskGroups?.(s) || []).map(t => t.id));
      items.push({
        label: tr('Task Groups'),
        children: groups.map(t => ({
          label: (explicitIds.has(t.id) ? '✓ ' : folderIds.has(t.id) ? '◇ ' : ' ') + t.title + (!explicitIds.has(t.id) && folderIds.has(t.id) ? tr(' (folder)') : ''),
          disabled: !explicitIds.has(t.id) && folderIds.has(t.id),
        })),
      });
    }
    items.push({ separator: true });
    items.push({ label: tr('Copy session ID') });
    items.push({ label: tr('Copy path') });
    if (s.cwd) items.push({ label: tr('Open working directory') });
    if (s.webuiId) {
      items.push({ label: tr('Find window') });
      items.push({ label: tr('Go to window') });
      if (!app.isMobile) items.push({ label: tr('Move window…') });
    }
    items.push({ separator: true });
    if ((s.backend || 'claude') === 'claude' || s.backend === 'codex') items.push({ label: tr('Switch billing…') });
    if (s.status === 'stopped' && !s.host) items.push({ label: tr('Rescue transcript…') });
    items.push({ label: tr('Properties…') });
    if (s.status !== 'stopped') items.push({ label: tr('Terminate'), style: 'color: var(--red, #e55)' });
    return items;
  };
  const groupsSets = [[], [{ id: 'g1', title: 'Alpha' }, { id: 'g2', title: 'Beta', archived: true }, { id: 'g3', title: 'Gamma' }, { id: 'g4', title: 'Delta' }]];
  let n = 0, bad = null;
  for (const [status, webuiId, host, cwd, backend, starred, archived, groups, isMobile] of cartesian(
    ['live', 'tmux', 'stopped', 'external'], [null, 'sess-1'], [null, 'h1'], [null, '/w'], ['claude', 'codex', 'shell', undefined], [false, true], [false, true], groupsSets, [false, true])) {
    const s = { status, webuiId, host, cwd, backend, sessionId: 'abc', name: 'N', pid: 1, tmuxTarget: 't', webuiName: 'W', webuiMode: 'chat' };
    const state = { isStarred: () => starred, isArchived: () => archived, _tasks: groups, _getSessionTasks: () => groups.filter((g) => g.id === 'g1'), _getSessionTaskGroups: () => groups.filter((g) => g.id === 'g3'), getSessionConfig: () => ({}) };
    const app = { isMobile };
    const ctx = { app, state, settings: null, s, card: {}, event: { clientX: 1, clientY: 2 }, displayName: 'D', customName: '', originalName: 'N', onRename() {}, agentOpts: {} };
    const got = J(project(menuItems('session-card', ctx))), want = J(project(legacy(s, state, app)));
    n++;
    if (got !== want && !bad) bad = { status, webuiId, host, cwd, backend, isMobile, groups: groups.length, got, want };
  }
  ok(!bad, `session-card menu: registry output ≡ legacy builder over ${n} session states (labels/separators/disabled/submenu/style)`, bad && `first diff ${J({ ...bad, got: undefined, want: undefined })}\n    got  ${bad.got}\n    want ${bad.want}`);
  // actions are wired to the SAME app/state handlers with the SAME arguments the legacy menu used
  const calls = [];
  const app = new Proxy({ isMobile: false }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])) });
  const s = { status: 'live', webuiId: 'sess-1', cwd: '/w', sessionId: 'abc', name: 'N', webuiName: 'W', webuiMode: 'chat', host: 'h1' };
  const state = { isStarred: () => false, isArchived: () => false, _tasks: [], getSessionConfig: () => ({ account: 'acct-1' }), toggleStar: () => calls.push(['toggleStar']), _showSessionStatusPopover: (card, ss) => calls.push(['status', card === cardEl, ss === s]) };
  const cardEl = {};
  const ctx = { app, state, s, card: cardEl, event: { clientX: 1, clientY: 2 }, displayName: 'D', customName: 'C', originalName: 'N', onRename: (ss, orig) => calls.push(['rename', ss === s, orig]), agentOpts: { backend: 'claude' } };
  const items = menuItems('session-card', ctx);
  const click = (label) => items.find((i) => i.label === label).action();
  click('Focus window'); click('Star'); click('Switch billing…'); click('Rename…'); click('Set status…'); click('Copy path'); click('Open working directory'); click('Properties…'); click('Go to window'); click('View History');
  ok(J(calls) === J([['attachSession', 'sess-1', 'W', '/w', { mode: 'chat', backend: 'claude' }], ['toggleStar'], ['showBillingSwitcher', s, { x: 1, y: 2 }], ['rename', true, 'N'], ['status', true, true], ['openFileExplorer', '/w', { host: 'h1' }], ['openSessionProps', s], ['goToWindow', 'sess-1'], ['viewSession', 'abc', '/w', 'C', { backend: 'claude' }]]) && J(copyCalls) === J(['/w']),
    'session-card actions call the same app/state handlers with the same arguments', J(calls));
  const stoppedItems = menuItems('session-card', { ...ctx, s: { ...s, status: 'stopped', webuiId: null } });
  calls.length = 0; stoppedItems.find((i) => i.label === 'Resume in Terminal').action();
  ok(J(calls) === J([['resumeSession', 'abc', '/w', 'C', { mode: 'terminal', accountId: 'acct-1', backend: 'claude' }]]), 'Resume in Terminal reads the per-session account config at click time (legacy cfgA)', J(calls));
}

// B2. window menu (title bar / taskbar / window list)
{
  const switchWindowItems = () => [{ label: 'W-other' }, { label: '(no windows)', disabled: true }];
  new Function('registerCommand', 'registerMenuItem', 't', 'switchWindowItems', extract('src/lib/taskbar.js', 'registerWindowMenu'))(registerCommand, registerMenuItem, id, switchWindowItems);
  ok(hasCommand('window.close') && hasCommand('window.move') && hasCommand('window.terminateSession'), 'taskbar block registers the window.* commands + the window menu');
  // VERBATIM legacy builder (pre-registry taskbar.js showWindowContextMenu, 2.369.37), labels + act kinds
  const legacy = (app, id_, win, sess, { closeLabel = null, switchSubmenu = false } = {}) => {
    const t = id;
    closeLabel = closeLabel || '✕ ' + t('Close');
    const act = (kind) => kind;
    const menuItems = [];
    if (switchSubmenu) {
      menuItems.push({ label: t('Switch window'), children: switchWindowItems(app, id_) });
      menuItems.push({ separator: true });
    }
    menuItems.push(
      { label: '✥ ' + t('Move'), kind: act('move') },
      { label: win.isMinimized ? '□ ' + t('Restore') : '– ' + t('Minimize'), kind: act('minimize') },
    );
    if (sess) {
      const sb = app.sidebar;
      menuItems.push({ label: t('Rename…'), kind: act('rename') });
      const groups = (sb?._tasks || []).filter((tg) => !tg.archived);
      if (groups.length) {
        const explicitIds = new Set((sb._getSessionTasks?.(sess) || []).map((tg) => tg.id));
        const folderIds = new Set((sb._getSessionTaskGroups?.(sess) || []).map((tg) => tg.id));
        menuItems.push({
          label: t('Task Groups'),
          children: groups.map((tg) => ({
            label: (explicitIds.has(tg.id) ? '✓ ' : folderIds.has(tg.id) ? '◇ ' : ' ') + tg.title + (!explicitIds.has(tg.id) && folderIds.has(tg.id) ? t(' (folder)') : ''),
            disabled: !explicitIds.has(tg.id) && folderIds.has(tg.id),
            kind: act('groups'),
          })),
        });
      }
    }
    if (sess) {
      menuItems.push({ separator: true });
      if (sess.status === 'live') {
        menuItems.push({ label: '⟳ ' + t('Restart session'), kind: act('restart') });
        menuItems.push({ label: t('Terminate session'), kind: act('terminate'), style: 'color:var(--red, #e55)' });
      } else if (sess.sessionId) {
        menuItems.push({ label: t('Resume session'), kind: act('resume') });
      }
      menuItems.push({ label: t('Locate in sidebar'), kind: act('locate') });
      menuItems.push({ label: t('Session properties…'), kind: act('props') });
      menuItems.push({ separator: true });
    }
    const deskItems = (app.desktopManager?.getDesktopMenuItems(id_) || []).map(d => ({ ...d, kind: act('desktop') }));
    if (deskItems.length) menuItems.push({ label: '➤ ' + t('Move to Desktop'), children: deskItems });
    menuItems.push({ label: closeLabel, kind: act('close'), style: 'color:var(--red, #e55)' });
    return menuItems;
  };
  // legacy projection: children carry their own act kind (the act() wrapper), parents none
  const projectLegacy = (items) => items.map((i) => (i.separator ? { sep: 1 } : {
    label: i.label, ...(i.disabled ? { disabled: true } : {}), ...(i.style ? { style: i.style } : {}), ...(i.kind ? { kind: i.kind } : {}),
    ...(i.children ? { children: i.children.map((k) => ({ label: k.label, ...(k.disabled ? { disabled: true } : {}), ...(k.kind ? { kind: k.kind } : {}) })) } : {}),
  }));
  // registry projection: the parent carries the kind, children inherit it (wrapAct) — strip the parent's for the diff
  const projectRegistry = (items) => items.map((i) => (i.separator ? { sep: 1 } : {
    label: i.label, ...(i.disabled ? { disabled: true } : {}), ...(i.style ? { style: i.style } : {}), ...(i.kind && !i.children ? { kind: i.kind } : {}),
    ...(i.children ? { children: i.children.map((k) => ({ label: k.label, ...(k.disabled ? { disabled: true } : {}), ...(i.kind ? { kind: i.kind } : {}) })) } : {}),
  }));
  const sessSet = [null, { status: 'live', webuiId: 'w1', sessionId: 'abc', name: 'N' }, { status: 'stopped', sessionId: 'abc', name: 'N' }, { status: 'stopped', name: 'N' }, { status: 'external', sessionId: 'abc', name: 'N' }];
  const groupsSets = [[], [{ id: 'g1', title: 'Alpha' }, { id: 'g2', title: 'Beta', archived: true }, { id: 'g3', title: 'Gamma' }]];
  let n = 0, bad = null;
  for (const [sess, groups, desks, isMinimized, switchSubmenu, closeLabel] of cartesian(sessSet, groupsSets, [0, 2], [false, true], [false, true], [null, '✕ Close group'])) {
    const win = { isMinimized };
    const app = {
      sidebar: { _tasks: groups, _getSessionTasks: () => groups.filter((g) => g.id === 'g1'), _getSessionTaskGroups: () => groups.filter((g) => g.id === 'g3') },
      desktopManager: { getDesktopMenuItems: () => Array.from({ length: desks }, (_, i) => ({ label: 'Desk ' + i, action() {} })) },
      wm: { windows: new Map([['win-1', win]]) },
    };
    const ctx = { app, id: 'win-1', win, s: sess, switchSubmenu, closeLabel: closeLabel || '✕ Close' };
    const got = J(projectRegistry(menuItems('window', ctx))), want = J(projectLegacy(legacy(app, 'win-1', win, sess, { closeLabel, switchSubmenu })));
    n++;
    if (got !== want && !bad) bad = { sess, groups: groups.length, desks, isMinimized, switchSubmenu, closeLabel, got, want };
  }
  ok(!bad, `window menu: registry output ≡ legacy builder over ${n} states (labels/separators/kinds/submenus/close label)`, bad && `first diff ${J({ ...bad, got: undefined, want: undefined })}\n    got  ${bad.got}\n    want ${bad.want}`);
  const plain = menuItems('window', { app: { sidebar: null, wm: { windows: new Map() } }, id: 'x', win: {}, s: null, switchSubmenu: false, closeLabel: '✕ Close' });
  ok(J(plain.map((i) => (i.separator ? '|' : i.label))) === J(['✥ Move', '– Minimize', '✕ Close']), 'no-session window menu has NO rule between Minimize and Close (the case VS Code\'s auto-separator rule cannot express — separators are explicit)');
  // window actions drive the same wm/app calls
  const calls = [];
  const app = new Proxy({ wm: new Proxy({ windows: new Map([['win-1', { isMinimized: true }]]) }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push(['wm.' + k, ...a])) }), sidebar: { _tasks: [], renameSession: (s, nm) => calls.push(['renameSession', s.name, nm]) }, desktopManager: { getDesktopMenuItems: () => [] } }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])) });
  const sess = { status: 'live', webuiId: 'w1', sessionId: 'abc', name: 'N' };
  const items = menuItems('window', { app, id: 'win-1', win: app.wm.windows.get('win-1'), s: sess, switchSubmenu: false, closeLabel: '✕ Close' });
  for (const l of ['✥ Move', '□ Restore', 'Rename…', '⟳ Restart session', 'Terminate session', 'Locate in sidebar', 'Session properties…', '✕ Close']) items.find((i) => i.label === l).action();
  ok(J(calls) === J([['wm.startMoveMode', 'win-1'], ['wm.restore', 'win-1'], ['renameSession', 'N', 'N'], ['restartConversationInPlace', sess], ['killSession', 'w1'], ['locateSessionInSidebar', 'abc'], ['openSessionProps', sess], ['wm.closeWindow', 'win-1']]),
    'window actions call the same wm/app handlers with the same arguments (session ops via the shared session.* commands)', J(calls));
  ok(J(items.map((i) => i.kind).filter(Boolean)) === J(['move', 'minimize', 'rename', 'restart', 'terminate', 'locate', 'props', 'close']), 'every window item carries its onAction kind');
}

// B3. gear menu — a TREE FIXTURE over the 16-state matrix + the flatten CENSUS against the legacy flat list
{
  const GEAR_ICONS = { key: 'I.key', puzzle: 'I.puzzle', brush: 'I.brush', tour: 'I.tour', out: 'I.out', exp: 'I.exp', imp: 'I.imp', lock: 'I.lock', chart: 'I.chart', pulse: 'I.pulse', globe: 'I.globe', sliders: 'I.sliders', wrench: 'I.wrench', chat: 'I.chat', cog: 'I.cog', help: 'I.help', check: 'I.check' };
  const PLUGIN_ICON = 'I.plugin';
  const calls = [];
  const panels = [];
  new Function('registerMenuItem', 't', 'getLangPref', 'setLang', 'fetchJson', 'GEAR_ICONS', 'PLUGIN_ICON', 'buildAppearancePanel', 'appearanceCaption', extract('src/lib/gear-menu.js', 'registerGearMenu'))(
    registerMenuItem, id, () => 'zh', (code) => calls.push(['setLang', code]), () => Promise.resolve({}), GEAR_ICONS, PLUGIN_ICON, (app, pop) => { panels.push([app, pop]); return { panel: true }; }, (app) => 'cap:' + app._fontSize);
  // The four rows OTHER modules file under the heads — their specs are READ
  // OFF THE SOURCE (parent / order / label / gated-or-not) so the fixture
  // follows what the owners register, not a typed copy of it.
  const ownerSpec = (file) => {
    const src = read(file);
    const i = src.indexOf("menu: 'gear'");
    if (i < 0) throw new Error(file + ': no gear registration');
    const blk = src.slice(src.lastIndexOf('registerMenuItem({', i), src.indexOf('});', i));
    const g = (k) => (blk.match(new RegExp(`\\b${k}: '([^']+)'`)) || [])[1];
    const o = blk.match(/\border: (\d+)/);
    const lab = blk.match(/label: \(\) => t\('([^']+)'\)/);
    return { file, parent: g('parent'), group: g('group'), order: o ? Number(o[1]) : 0, label: lab && lab[1], gated: /\bwhen:/.test(blk) };
  };
  const owners = ['src/lib/channels-panel.js', 'src/lib/channel-outbox.js', 'src/lib/integrations-window.js', 'src/lib/desktop-app-launcher.js'].map(ownerSpec);
  // 2.369.125 (docs/design-mobile-gaps.md #2): the Channels row lost its `when` gate — on a phone the rail is never built, so a gated row meant NO entry point; focusChannelsPanel now falls back to a window
  ok(J(owners.map((o) => [o.label, o.parent, o.order, o.gated])) === J([['Channels…', 'comm', 10, false], ['Outbox…', 'comm', 20, false], ['Integrations…', 'comm', 30, false], ['Desktop apps…', 'tools', 30, true]]),
    'the four external owners file under comm / tools with DISTINCT orders (the two order-45 twins are gone; Desktop apps stays gated, Channels is ungated since 2.369.125 — its window fallback)', J(owners));
  ok(owners.every((o) => !o.group), 'owner rows carry no `group` — inside a head, group sorts BEFORE order, so a grouped member would sink below every ungrouped core row');
  for (const o of owners) registerMenuItem({ menu: 'gear', id: 'owner/' + o.label, parent: o.parent, order: o.order, label: o.label,
    when: o.gated ? ((c) => (o.label === 'Desktop apps…' ? !!c.app._desktopAppsAvailable : !!c.app._railEl)) : undefined, run: (c) => c.app['owner:' + o.label]?.() });

  // VERBATIM legacy row list (pre-registry app.js _showGlobalSettings, 2.369.37): [icon, label, danger] + seps — the CENSUS baseline
  const legacy = (app) => {
    const t = id; const I = GEAR_ICONS; const rows = [];
    const item = (svg, label, _fn, danger = false) => rows.push({ icon: svg, label, danger });
    const sep = () => rows.push({ sep: 1 });
    if (!app.isMobile) item(I.brush, t('Customize UI…'));
    { const I_globe = I.globe; const pref = 'zh'; const cur = { auto: t('Auto (system)'), en: 'English', zh: '中文', ja: '日本語' }[pref] || pref; item(I_globe, `${t('Language')}: ${cur}`); }
    sep();
    item(I.key, t('Manage agents…')); item(I.puzzle, t('Plugins…')); item(I.chart, t('Usage…')); item(I.chart, t('Background Work…'));
    item(I.pulse, t('Diagnostics report…')); item(I.alert || I.pulse, t('Report a problem…')); item(I.exp || I.pulse, t('Restore a previous layout…'));
    sep();
    item(I.exp, t('Backup & migrate…')); item(I.lock, app._authEnabled ? t('Change password…') : t('Set password…'));
    if (app._repoDir) item(I.key, t('Update VibeSpace…'));
    const pluginWins = app.pluginClient?.contributedWindows?.() || [];
    if (pluginWins.length) { sep(); for (const w of pluginWins) item(PLUGIN_ICON, w.title); }
    sep(); item(I.tour, t('Welcome tour'));
    if (app._authEnabled) item(I.out, t('Sign out'), null, true);
    return rows;
  };
  // THE TREE FIXTURE (docs/design-gear-menu-hierarchy.md §2a): five heads + three direct rows
  const tree = (app) => {
    const t = id; const I = GEAR_ICONS;
    const row = (icon, label, extra = {}) => ({ ...(icon !== undefined ? { icon } : {}), label, ...extra });
    const SEP = { sep: 1 };
    const language = row(I.globe, `${t('Language')}: 中文`, { children: [row(undefined, t('Auto (system)'), { checked: false }), row(undefined, 'English', { checked: false }), row(undefined, '中文', { checked: true }), row(undefined, '日本語', { checked: false })] });
    const appearance = row(I.sliders, t('Appearance'), { caption: 'cap:' + app._fontSize, panel: true, children: [...(app.isMobile ? [] : [row(I.brush, t('Customize UI…'))]), language] });
    const pluginWins = app.pluginClient?.contributedWindows?.() || [];
    const tools = row(I.wrench, t('Tools'), { children: [row(I.chart, t('Usage…')), row(I.chart, t('Background Work…')), row(undefined, t('Desktop apps…')), row(I.puzzle, t('Plugins…')), ...(pluginWins.length ? [SEP, ...pluginWins.map((w) => row(PLUGIN_ICON, w.title))] : [])] });
    const comm = row(I.chat, t('Communication'), { children: [row(undefined, t('Channels…')), row(undefined, t('Outbox…')), row(undefined, t('Integrations…'))] });
    const system = row(I.cog, t('System'), { children: [row(I.alert || I.pulse, t('Report a problem…')), row(I.pulse, t('Diagnostics report…')), SEP, row(I.exp || I.pulse, t('Restore a previous layout…')), row(I.exp, t('Backup & migrate…')), row(I.lock, app._authEnabled ? t('Change password…') : t('Set password…'))] });
    const help = row(I.help, t('Help'), { children: [row(I.tour, t('Welcome tour')), row(I.cog, t('All Settings...'))] });
    return [appearance, SEP, row(I.key, t('Manage agents…')), tools, comm, system, ...(app._repoDir ? [row(I.key, t('Update VibeSpace…'))] : []), help, ...(app._authEnabled ? [SEP, row(I.out, t('Sign out'), { danger: true })] : [])];
  };
  const proj = (items) => items.map((i) => (i.separator ? { sep: 1 } : { ...(i.icon !== undefined ? { icon: i.icon } : {}), label: i.label, ...(i.danger ? { danger: true } : {}), ...(i.checked !== undefined ? { checked: i.checked } : {}), ...(i.caption ? { caption: i.caption } : {}), ...(i.panel ? { panel: true } : {}), ...(i.children ? { children: proj(i.children) } : {}) }));
  const flatten = (items) => items.flatMap((i) => (i.sep ? [] : [i.label, ...(i.children ? flatten(i.children) : [])]));
  // every label the tree ADDS beyond the legacy flat list — the five heads, the
  // four owner rows (never in gear-menu.js), the four Language choices and
  // All Settings (a quick-pref link before, a Help row now)
  const ADDED = [id('Appearance'), id('Tools'), id('Communication'), id('System'), id('Help'), 'Channels…', 'Outbox…', 'Integrations…', 'Desktop apps…', 'Auto (system)', 'English', '中文', '日本語', 'All Settings...'];
  let n = 0, bad = null, census = null, budget = null, dangers = null;
  for (const [isMobile, _repoDir, _authEnabled, nPlugins] of cartesian([false, true], [null, '/repo'], [false, true], [0, 2])) {
    const wins = Array.from({ length: nPlugins }, (_, i) => ({ pluginId: 'p', windowId: 'w' + i, title: 'Plugin win ' + i }));
    const app = { isMobile, _repoDir, _authEnabled, _fontSize: 14, _railEl: {}, _desktopAppsAvailable: true, pluginClient: { contributedWindows: () => wins, open: () => {} } };
    const items = menuItems('gear', { app, pop: {} });
    const got = J(proj(items)), want = J(tree(app));
    n++;
    if (got !== want && !bad) bad = { isMobile, _repoDir, _authEnabled, nPlugins, got, want };
    // CENSUS: flatten(tree) as a SET ≡ legacy labels ∪ ADDED; none twice; none lost
    const gotFlat = flatten(proj(items));
    const wantSet = new Set([...legacy(app).filter((r) => !r.sep).map((r) => r.label), ...ADDED]);
    const gotSet = new Set(gotFlat);
    const missing = [...wantSet].filter((l) => !gotSet.has(l)), extra = [...gotSet].filter((l) => !wantSet.has(l)), dup = gotFlat.filter((l, i) => gotFlat.indexOf(l) !== i);
    if ((missing.length || extra.length || dup.length) && !census) census = { isMobile, _repoDir, _authEnabled, nPlugins, missing, extra, dup };
    const topRows = items.filter((i) => !i.separator).length;
    if (topRows > 9 && !budget) budget = { isMobile, _repoDir, _authEnabled, nPlugins, topRows };
    const dangerCount = (list) => list.reduce((n, i) => n + (i.danger ? 1 : 0) + (i.children ? dangerCount(i.children) : 0), 0);
    const nDanger = dangerCount(proj(items));
    if (nDanger !== (_authEnabled ? 1 : 0) && !dangers) dangers = { isMobile, _repoDir, _authEnabled, nPlugins, nDanger };
  }
  ok(!bad, `gear menu: registry tree ≡ the TREE FIXTURE over ${n} states (icon/label/danger/checked/caption/panel/separators per level, incl. the plugin-windows block under Tools)`, bad && `first diff ${J({ ...bad, got: undefined, want: undefined })}\n    got  ${bad.got}\n    want ${bad.want}`);
  ok(!census, `CENSUS over ${n} states: every legacy row lands in exactly one head or at the top level, none twice, none lost; the additions are exactly the named ones`, census && J(census));
  ok(!budget, 'top-level row budget: ≤ 9 rows in every state (8 at most: Appearance / Manage agents / Tools / Communication / System / Update / Help / Sign out)', budget && J(budget));
  ok(!dangers, 'exactly one danger row (Sign out) when auth is on, none when it is off — at any depth', dangers && J(dangers));
  ok(panels.length === 0, 'menuItems() passes the Appearance panel BUILDER through untouched — the renderer calls it, the registry never does');
  const rows = menuItems('gear', { app: { isMobile: false, _repoDir: '/r', _authEnabled: true, _fontSize: 14, _railEl: {}, _desktopAppsAvailable: true }, pop: {} });
  const heads = Object.fromEntries(rows.filter((r) => r.submenu).map((r) => [r.id, r]));
  ok(J(Object.keys(heads)) === J(['appearance', 'tools', 'comm', 'system', 'help']), 'the five heads carry the ids plugins may name in `parent` (plugin-client CORE_MENU_HEADS)', J(Object.keys(heads)));
  ok(typeof heads.appearance.panel === 'function' && heads.appearance.keepOpen === true && heads.appearance.caption === 'cap:14', 'the Appearance head is a PANEL head (panel + keepOpen + live caption)');
  const language = heads.appearance.children.find((k) => k.submenu);
  ok(language && language.id === 'language' && language.children.length === 4 && language.children.filter((k) => k.checked).length === 1 && language.children.find((k) => k.checked).label === '中文' && !language.decorate,
    'Language is a nested head (the two-level ceiling) with four choice rows, ✓ via `checked` on the current one — the legacy decorate/showContextMenu detour is gone');
  ok(typeof rows.find((r) => r.label === 'Update VibeSpace…').decorate === 'function' && !rows.find((r) => r.label === 'Update VibeSpace…').submenu, 'Update stays a DIRECT row with decorate() (its two-line version label is the update indicator)');
  ok(rows.find((r) => r.label === 'Sign out').danger === true && rows.filter((r) => r.danger).length === 1, 'Sign out is the only top-level danger row');
  const app = new Proxy({ isMobile: false, _repoDir: '/r', _authEnabled: false, _fontSize: 14, _railEl: {}, _desktopAppsAvailable: true, _customize: { enter: () => calls.push(['customize']) }, _settingsUI: { open: () => calls.push(['settingsOpen']) }, pluginClient: { contributedWindows: () => [{ pluginId: 'p', windowId: 'w', title: 'PW' }], open: (p, w) => calls.push(['pluginOpen', p, w]) } }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])) });
  const leaves = (items) => items.flatMap((i) => (i.separator ? [] : (i.children ? leaves(i.children) : [i])));
  const r2 = leaves(menuItems('gear', { app, pop: {} }));
  calls.length = 0;
  for (const l of ['Customize UI…', 'Auto (system)', 'English', '中文', '日本語', 'Manage agents…', 'Usage…', 'Background Work…', 'Desktop apps…', 'Plugins…', 'PW', 'Channels…', 'Outbox…', 'Integrations…', 'Report a problem…', 'Diagnostics report…', 'Restore a previous layout…', 'Backup & migrate…', 'Set password…', 'Update VibeSpace…', 'Welcome tour', 'All Settings...']) r2.find((i) => i.label === l).action();
  ok(J(calls) === J([['customize'], ['setLang', 'auto'], ['setLang', 'en'], ['setLang', 'zh'], ['setLang', 'ja'], ['_showAgentsDialog'], ['openUsage'], ['openJobs'], ['owner:Desktop apps…'], ['openPluginsDialog'], ['pluginOpen', 'p', 'w'], ['owner:Channels…'], ['owner:Outbox…'], ['owner:Integrations…'], ['captureIncident'], ['_openDiagnostics'], ['_showLayoutHistory'], ['_showTransferDialog'], ['_showPasswordDialog'], ['_showUpdateConfirmDialog'], ['_showOnboarding', true], ['settingsOpen']]),
    'every leaf of the tree calls the same app method the legacy row did (+ the four Language choices → setLang, All Settings → _settingsUI.open)', J(calls));
  ok(r2.every((i) => typeof i.action === 'function') && menuItems('gear', { app, pop: {} }).filter((i) => i.submenu).every((i) => !i.action), 'every leaf has an action; no head has one');
  const gm = read('src/lib/gear-menu.js');
  ok(gm.includes(`globe: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-1.8 1.8-2.7 4-2.7 6.5S6.2 12.7 8 14.5c1.8-1.8 2.7-4 2.7-6.5S9.8 3.3 8 1.5z"/></svg>'`), 'the globe icon is the legacy I_globe SVG verbatim');
  ok(!/showContextMenu\(/.test(gm) && !/import \{[^}]*\bshowContextMenu\b[^}]*\} from '\.\/utils\.js'/.test(gm) && !/\(pref === code \? '✓ ' : '  '\)/.test(gm), 'the Language showContextMenu detour + its ✓ / figure-space glyph pad are retired (the renderer draws the check from `checked`)');
  ok(/checked: \(\) => getLangPref\(\) === code/.test(gm) && /run: \(\) => setLang\(code\)/.test(gm), 'each Language choice row reads its ✓ from getLangPref() and switches through setLang()');
}

// B4. command-mode commands + palette command
{
  const dialogs = [];
  new Function('registerCommand', 'showInputDialog', extract('src/lib/command-mode.js', 'registerCommandModeCommands'))(registerCommand, (o) => { dialogs.push(o); return Promise.resolve('3x2'); });
  const want = ['commandMode.toggle', 'activeWindow.snapLeft', 'activeWindow.snapRight', 'activeWindow.snapTop', 'activeWindow.snapBottom', 'activeWindow.toggleMaximize', 'activeWindow.close', 'activeWindow.cycle', 'layout.freeform', 'layout.customGrid', 'session.new', 'sidebar.toggle', 'browser.open', 'explorer.open', 'desktop.next', 'desktop.previous', 'activeWindow.moveToNextDesktop', 'activeWindow.moveToPreviousDesktop'];
  ok(want.every((w) => hasCommand(w)), 'command-mode registers every single-key action as a command', want.filter((w) => !hasCommand(w)).join(','));
  const cm = read('src/lib/command-mode.js');
  const routed = want.filter((w) => w !== 'commandMode.toggle').filter((w) => !new RegExp(`case '[^']+': (?:this\\.exit\\(\\); )?runCommand\\('${w.replace('.', '\\.')}'`).test(cm));
  ok(routed.length === 0 && /runCommand\('commandMode\.toggle', cctx\)/.test(cm) && /runCommand\(e\.key === 'ArrowRight' \? 'desktop\.next' : 'desktop\.previous', cctx\)/.test(cm), 'every command-mode switch case + Ctrl+\\ + Ctrl+Alt+arrows route through runCommand (no inline twin of a registered command)', routed.join(','));
  const calls = [];
  const wm = { activeWindowId: 'w1', windows: new Map([['w1', { id: 'w1' }], ['w2', { id: 'w2', isMinimized: true }]]), snapToHalf: (...a) => calls.push(['snap', ...a]), toggleMaximize: (i) => calls.push(['max', i]), closeWindow: (i) => calls.push(['close', i]), applyLayout: (l) => calls.push(['layout', l]), setGrid: (a, b) => calls.push(['grid', a, b]), restore: (i) => calls.push(['restore', i]), focusWindow: (i) => calls.push(['focus', i]) };
  const dm = { desktops: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }], activeDesktopId: 'd3', switchTo: (d) => calls.push(['switch', d]), moveWindowToDesktop: (w, d) => calls.push(['move', w, d]) };
  const app = { wm, desktopManager: dm, sessions: new Map(), sidebar: { toggle: () => calls.push(['sidebar']) }, showNewSessionDialog: () => calls.push(['new']), openBrowser: () => calls.push(['browser']), openFileExplorer: () => calls.push(['explorer']), _commandMode: { toggle: () => calls.push(['toggle']) } };
  for (const c of ['activeWindow.snapLeft', 'activeWindow.snapBottom', 'activeWindow.toggleMaximize', 'activeWindow.close', 'activeWindow.cycle', 'layout.freeform', 'session.new', 'sidebar.toggle', 'browser.open', 'explorer.open', 'desktop.next', 'desktop.previous', 'activeWindow.moveToNextDesktop', 'activeWindow.moveToPreviousDesktop', 'commandMode.toggle']) runCommand(c, { app });
  ok(J(calls) === J([['snap', 'w1', 'left'], ['snap', 'w1', 'bottom'], ['max', 'w1'], ['close', 'w1'], ['restore', 'w2'], ['layout', 'freeform'], ['new'], ['sidebar'], ['browser'], ['explorer'], ['switch', 'd1'], ['switch', 'd2'], ['move', 'w1', 'd1'], ['move', 'w1', 'd2'], ['toggle']]),
    'command-mode commands drive the same wm/desktopManager/app calls (wraparound desktop math + minimized-cycle restore intact)', J(calls));
  calls.length = 0; runCommand('layout.customGrid', { app });
  await new Promise((r) => setTimeout(r, 0));
  ok(dialogs.length === 1 && dialogs[0].title === 'Custom Grid' && J(calls) === J([['grid', 3, 2]]), 'layout.customGrid asks via showInputDialog and applies "3x2"');
  wm.activeWindowId = null; calls.length = 0;
  runCommand('activeWindow.snapLeft', { app }); runCommand('activeWindow.close', { app }); runCommand('activeWindow.moveToNextDesktop', { app }); runCommand('activeWindow.toggleMaximize', { app });
  ok(calls.length === 0, 'active-window commands are no-ops without an active window (legacy `if (activeWin)` guards)', J(calls));
  dm.desktops = [{ id: 'd1' }]; runCommand('desktop.next', { app });
  ok(calls.length === 0, 'desktop.next is a no-op with a single desktop (legacy guard)');
}

// ── C. ws-handler default: the REAL handler on a fake wss ──
console.log('contributions — C. ws-handler unknown-type default');
{
  const { registerWsHandler, WS_CTX_CONTRACT } = require(path.join(repo, 'src/ws-handler.js'));
  ok(WS_CTX_CONTRACT.includes('telemetry'), "'telemetry' is in WS_CTX_CONTRACT (the default case counts through it)");
  const recorded = [];
  const telemetry = { record: (ev) => recorded.push(ev) };
  const ctx = new Proxy({ telemetry, activeSessionsPayload: () => [], serverNotice: () => {} }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const handlers = {};
  const wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { handlers[ev] = fn; } };
  registerWsHandler(wss, ctx);
  const sent = [];
  const wsHandlers = {};
  const ws = { send: (s) => sent.push(JSON.parse(s)), on: (ev, fn) => { wsHandlers[ev] = fn; } };
  handlers.connection(ws);
  const warned = captureWarnsAsync();
  await wsHandlers.message(JSON.stringify({ type: 'totally-bogus', sessionId: 'sess-9', reqId: 'r1' }));
  await wsHandlers.message(JSON.stringify({ type: 'totally-bogus', sessionId: 'sess-9' }));
  await wsHandlers.message(JSON.stringify({ type: 'another-bogus' }));
  await wsHandlers.message(JSON.stringify({ nope: 1 }));
  const warns = warned.stop();
  const replies = sent.filter((m) => m.type === 'error');
  ok(replies.length === 4 && replies.every((r) => r.code === 'unknown-type'), 'unknown type → {type:error, code:unknown-type} reply to the sender (4/4)', J(replies));
  ok(replies.every((r) => !('sessionId' in r)), 'the reply NEVER carries sessionId (a session-scoped error frame flips a live window read-only / exited)', J(replies));
  ok(replies[0].reqId === 'r1' && !('reqId' in replies[1]), 'reqId is echoed when present (ws.request callers fail fast instead of hanging)');
  ok(/Unknown message type: totally-bogus/.test(replies[0].message) && replies[0].unknownType === 'totally-bogus' && replies[3].unknownType === 'undefined', 'message names the type (capped) and unknownType is machine-readable');
  ok(recorded.filter((e) => e.name === 'ws-unknown-type').length === 4 && recorded[0].detail === 'totally-bogus' && recorded[0].kind === 'event', "telemetry counts every occurrence as event 'ws-unknown-type' with the type as detail");
  ok(warns.filter((m) => /"totally-bogus"/.test(m)).length === 1 && warns.filter((m) => /"another-bogus"/.test(m)).length === 1, 'log is rate-limited: one line per type per 10 minutes, not per message', J(warns));
  ok(replies.every((r) => !/Internal error/.test(r.message)), 'the reply is a proper protocol error (the Internal-error catch path is not what answered)');
  ok(sent[0].type === 'active-sessions', 'the connection still opens normally (active-sessions first)');
}
function captureWarnsAsync() { const out = []; const o = console.warn; console.warn = (...a) => out.push(a.map(String).join(' ')); return { stop: () => { console.warn = o; return out; } }; }

// ── D. wiring pins ──
console.log('contributions — D. wiring pins');
{
  const sc = read('src/lib/session-card.js');
  ok(/showContextMenu\(e\.clientX, e\.clientY, menuItems\('session-card', ctx\)\)/.test(sc), "session-card right-click renders menuItems('session-card', ctx)");
  ok(!/items\.push\(\{ label: tr\('Focus window'\)/.test(sc) && !/items\.push\(\{ label: tr\('Terminate'\)/.test(sc), 'session-card legacy items.push builder is gone');
  ok(/^registerSessionCardMenu\(\);/m.test(sc) && /from '\.\/contributions\.js'/.test(sc), 'session-card registers at module load and imports the registry');
  const tb = read('src/lib/taskbar.js');
  ok(/contribMenuItems\('window', ctx\)\.map\(\(it\) => wrapAct\(it\)\)/.test(tb) && /onAction\?\.\(kind\)/.test(tb) && /item\.children\.map\(\(ch\) => wrapAct\(ch, kind\)\)/.test(tb), "window menu renders contribMenuItems('window', ctx); wrapAct fires onAction(kind) for items AND submenu children");
  ok(!/menuItems\.push\(\s*\{ label: '\\u2725 ' \+ t\('Move'\)/.test(tb) && !/menuItems\.push\(\{ label: t\('Locate in sidebar'\)/.test(tb) && /^registerWindowMenu\(\);/m.test(tb), 'window menu legacy builder is gone; registers at module load');
  ok((tb.match(/showWindowContextMenu\(app, /g) || []).length >= 3 && /showWindowContextMenu\(this\._app, winInfo\.id/.test(read('src/lib/window.js')), 'all four window-menu entry points (taskbar item, group, window list, title bar) still go through showWindowContextMenu');
  const ap = read('src/lib/app.js');
  ok(/pop\.append\(buildGearMenu\(this, pop\)\);/.test(ap) && !/item\(I\.key, t\('Manage agents/.test(ap) && !/menu\.className = 'gs-menu'/.test(ap), 'gear menu renders via buildGearMenu(this, pop) (app.js inline row list gone)');
  // 2.369.124: the quick prefs left app.js for appearance-panel.js and are the Appearance head's panel
  const apn = read('src/lib/appearance-panel.js');
  ok(!/themeSel\.id = 'global-theme-select'|settings-all-link|font-size-ctrl|mkPctRow/.test(ap) && /themeSel\.id = 'global-theme-select'/.test(apn) && /settings-all-link/.test(apn) && /const mkPctRow = /.test(apn) && /export function buildAppearancePanel\(app, pop\)/.test(apn) && /export function appearanceCaption\(app\)/.test(apn),
    'the eleven quick-pref elements live in appearance-panel.js (buildAppearancePanel + appearanceCaption), none remain inline in _showGlobalSettings');
  ok(/pop\.remove\(\); app\._settingsUI\.open\(\);/.test(apn) && /localStorage\.setItem\('termFontSize', app\._fontSize\)/.test(apn) && /session\.applyOverride\('fontSize', null\)/.test(apn) && /if \(fontSel\.selectedIndex === -1\)/.test(apn),
    'the moved builders kept their invariants verbatim (All Settings closes the popover first; font size through applyOverride; the stale-font select rescue)');
  const gmSrc = read('src/lib/gear-menu.js');
  ok(/import \{ buildAppearancePanel, appearanceCaption \} from '\.\/appearance-panel\.js'/.test(gmSrc) && /panel: \(c\) => buildAppearancePanel\(c\.app, c\.pop\)/.test(gmSrc) && /caption: \(c\) => appearanceCaption\(c\.app\)/.test(gmSrc), 'gear-menu wires the panel + caption onto the Appearance head');
  ok(/sub\.dataset\.popover = '1'/.test(gmSrc) && /e\.preventDefault\(\); e\.stopPropagation\(\);/.test(gmSrc) && /if \(!open\.length\) return;/.test(gmSrc) && /matchMedia\('\(hover: none\)'\)/.test(gmSrc) && /HOVER_INTENT_MS = 120/.test(gmSrc),
    'renderer protocol pins: a flyout carries data-popover (outside-click child rule), Esc is popover-local with stopPropagation ONLY while a flyout is open, the mode switch reads hover:none, hover intent is 120 ms');
  ok(/for \(const ev of \['click', 'change', 'input'\]\) sub\.addEventListener\(ev, refreshCaption\)/.test(gmSrc) && /cap\.textContent = String\(v \?\? ''\)/.test(gmSrc) && /if \(isFn\(reg\.caption\)\) item\.captionOf = reg\.caption;/.test(read('src/lib/contributions.js')),
    'WIRING PIN (verifier r2): the registry hands a function caption through as captionOf AND the renderer re-evaluates it on click/change/input bubbling out of the head\'s members — the LIVE caption (a pure pass-through with no consumer is the 2.355.0 unstaged-wiring class)');
  const pcs = read('src/lib/plugin-client.js');
  ok(/export const CORE_MENU_HEADS = \['appearance', 'tools', 'comm', 'system', 'help'\]/.test(pcs) && /const parent = spec\.parent === undefined \|\| spec\.parent === null \? undefined : pluginParentId\(spec\.parent\)/.test(pcs) && /return registerMenuItem\(\{ \.\.\.spec, command, id: itemId, parent, signal: ctl\.signal \}\)/.test(pcs),
    'plugin-client passes parent/submenu through under the namespace rule (a core head or one of the plugin\'s own prefixed heads)');
  ok(/if \(spec\.submenu && \(typeof spec\.id !== 'string' \|\| !\/\^\[a-z0-9-\]\+\$\/\.test\(spec\.id\)\)\) throw new Error\('api\.registerMenuItem: a `submenu:true` head needs an explicit `id` slug/.test(pcs)
    && pcs.indexOf('head needs an explicit `id` slug') < pcs.indexOf("const itemId = `plugin:${id}:${spec.id || spec.command || 'item-' + (++pluginItemSeq)}`"),
    'plugin-client REFUSES a `submenu:true` head without an explicit id slug BEFORE the host\'s generated item-N id can smuggle it past the registry\'s explicit-id rule (verifier r2 nit)');
  const css = read('public/style.css');
  ok(/\.gs-flyout \{[^}]*right: 100%/.test(css) && /\.gs-acc \.gs-sub \{[^}]*padding-left: 22px/.test(css) && /@media \(hover: none\) \{[\s\S]*\.gs-menu-item \{ min-height: 44px;/.test(css) && !/\.gs-flyout \{[^}]*#[0-9a-f]{3}/i.test(css),
    'CSS: the flyout opens LEFT, the accordion indents + borders its members, touch rows are ≥ 44 px, theme vars only');
  ok(/app\._showGlobalSettings\(gear\)/.test(read('src/lib/mobile-nav.js')), 'mobile gear shares the same menu (mobile-nav → _showGlobalSettings)');
  ok(/this\._contribCtl = new AbortController\(\);/.test(ap) && /installKeybindings\(document, \{ signal: this\._contribCtl\.signal, getCtx: \(\) => \(\{ app: this \}\) \}\)/.test(ap), 'app installs ONE keybinding dispatcher under an app-lifetime AbortController');
  const gm = read('src/lib/gear-menu.js');
  ok(/^registerGearMenu\(\);/m.test(gm) && /el\.innerHTML = `<span class="gs-menu-icon">\$\{svg\}<\/span><span>\$\{escHtml\(label\)\}<\/span>`/.test(gm), 'gear-menu registers at module load; the row label is escHtml()ed (plugin window titles reach it)');
  const pal = read('src/lib/session-palette.js');
  ok(/registerCommand\(\{ id: 'session\.palette'/.test(pal) && /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 'k' && !e\.target\.closest\?\.\('\.xterm'\)/.test(pal) && /runCommand\('session\.palette', \{ app \}\)/.test(pal) && /\}, true\);/.test(pal),
    "palette registers command 'session.palette'; the lenient capture-phase Ctrl+K check stays byte-identical and routes through runCommand");
  const cm = read('src/lib/command-mode.js');
  ok(/\}, true\); \/\/ capture phase/.test(cm) && /toggle\(\) \{ if \(this\._cmdMode\) this\.exit\(\); else this\.enter\(\); \}/.test(cm) && /^registerCommandModeCommands\(\);/m.test(cm), 'command-mode keeps its capture-phase prefix dispatch (listener order is load-bearing) and exposes toggle()');
  ok(!/registerKeybinding\(/.test(cm) && !/registerKeybinding\(/.test(pal), 'core key chords are NOT registerKeybinding chords (modifier-lenient checks + capture order would change behaviour) — commands only');
  // …but a NEW core chord does use the registry, and chat-view.js is the first
  // (2026-09-07, the Alt+Enter steer chord). It is the pattern a future one
  // copies: ONE module-scope command behind hasCommand() (registerCommand
  // THROWS on a duplicate id, so a per-instance registration dies on the second
  // window) + a PER-INSTANCE keybinding carrying that instance's signal and a
  // `when` that scopes the chord — which is also what makes N simultaneous
  // registrations of one chord legal.
  const cvv = read('src/lib/chat-view.js');
  ok(/registerKeybinding\(\{\s*\n\s*key: 'alt\+enter',\s*\n\s*command: STEER_NOW_COMMAND,/.test(cvv) && /if \(!hasCommand\(STEER_NOW_COMMAND\)\) \{/.test(cvv) && /signal: winInfo\?\._listenerCtl\?\.signal,/.test(cvv) && /when: \(ctx\) => steerTargetView\(ctx\) === this/.test(cvv),
    "chat-view registers the FIRST core registry chord: command once at module scope, keybinding per view (signal + when)");
  ok(/export const STEER_NOW_COMMAND = 'chat\.steerNow';/.test(cvv) && /onSteerChord: \(\) => runCommand\(STEER_NOW_COMMAND, \{ view: this \}\)/.test(cvv),
    "…and its in-app caller routes through runCommand with the same id (keyboard, button and plugin run ONE verb)");
  ok(/### contributions\.js/.test(read('docs/kb-file-structure.md')) && /THE FIRST CORE `registerKeybinding` CHORD/.test(read('docs/kb-file-structure.md')),
    'the kb essay records that pattern where the next author will look for it');
  const wsh = read('src/ws-handler.js');
  const defIdx = wsh.indexOf('        default: {');
  const def = wsh.slice(defIdx, defIdx + 1600);
  ok(defIdx > 0 && def.includes("code: 'unknown-type'") && def.includes('noteUnknownWsType(telemetry, data?.type)'), 'handleMessage switch has a default case that replies code:unknown-type');
  const sendIdx = def.indexOf('ws.send(');
  ok(sendIdx > 0 && !/sessionId/.test(def.slice(sendIdx, sendIdx + 260)), 'the default reply object literal has no sessionId key');
  ok(/registerWsHandler\(wss, \{[\s\S]*?\btelemetry\b[\s\S]*?\n\}\);/.test(read('server.js')), 'server.js passes telemetry into registerWsHandler');
  // client: every ws `error` consumer is id-gated, so a sessionId-less error can never flip a window
  const cv = read('src/lib/chat-view.js');
  const cvLines = cv.split('\n');
  const cvErr = cvLines.map((l, i) => ({ l, i })).filter(({ l }) => /msg\.type === 'error'/.test(l));
  // gated on the same line (`&& msg.sessionId === sessionId`) or by an early
  // return within the three lines above (the view-only rescue handler's
  // `if (msg.sessionId !== viewId) return;`)
  const gated = ({ l, i }) => /msg\.sessionId === /.test(l) || cvLines.slice(Math.max(0, i - 3), i).some((p) => /if \(msg\.sessionId !== \w+\) return;/.test(p));
  ok(cvErr.length >= 3 && cvErr.every(gated), 'chat-view error branches are sessionId-gated (attach-failed / rescue paths unreachable by a bare error frame)', J(cvErr.filter((x) => !gated(x)).map((x) => x.l)));
  const term = read('src/lib/terminal.js');
  const onIdx = term.indexOf('this.ws.on(sessionId, (msg) => {'), errIdx = term.indexOf("msg.type === 'error' && !winInfo.exited");
  ok(onIdx > 0 && errIdx > onIdx && !term.slice(onIdx, errIdx).includes('onGlobal('), "terminal's error branch lives inside the PER-SESSION ws.on(sessionId) handler (never sees a sessionId-less frame)");
  const sl = read('src/lib/session-lifecycle.js');
  const slErr = [...sl.matchAll(/msg\.type === 'error'\)?[^\n]*/g)].map((m) => m[0]);
  ok(slErr.length >= 4 && slErr.every((l) => /msg\.(reqId|sessionId) === /.test(l)), 'session-lifecycle error handlers are reqId/sessionId/viewId/virtualId-gated', J(slErr));
  ok(/if \(d\.sessionId\) \[\.\.\.\(this\.handlers\.get\(d\.sessionId\)/.test(read('src/lib/ws.js')), 'ws.js routes session-scoped handlers by d.sessionId only');
  // plugin host API
  const pc = read('src/lib/plugin-client.js');
  ok(/registerCommand: \(\{ id: slug, title, run, when, icon \} = \{\}\) =>/.test(pc) && /id: `plugin:\$\{id\}:\$\{slug\}`, title, run, when, icon, signal: ctl\.signal/.test(pc), 'host api.registerCommand namespaces the id and binds it to the plugin signal');
  ok(/registerMenuItem: \(spec = \{\}\) =>/.test(pc) && /registerMenuItem\(\{ \.\.\.spec, command, id: itemId, parent, signal: ctl\.signal \}\)/.test(pc) && /registerKeybinding: \(\{ key, command, when, inTerminal \} = \{\}\) => registerKeybinding\(\{ key, command: pluginCommandId\(command\), when, inTerminal, signal: ctl\.signal \}\)/.test(pc),
    'host api.registerMenuItem / api.registerKeybinding are plugin-scoped (namespaced id, signal-bound)');
  ok(/runCommand: \(cid, ctx\) => runCommand\(pluginCommandId\(cid\), ctx\)/.test(pc) && /from '\.\/contributions\.js'/.test(pc), 'host api.runCommand resolves own slugs vs full ids');
  const contrib = read('src/lib/contributions.js');
  const imports = [...contrib.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  ok(J(imports) === J(['./telemetry-client.js']), `contributions.js imports only telemetry-client (DOM-free at import) — got ${imports.join(',')}`);
  ok(/track\('event', 'command-unknown'/.test(contrib) && /track\('event', 'menu-unknown-command'/.test(contrib) && /track\('event', 'keybinding-unknown-command'/.test(contrib) && /track\('event', 'command-failed'/.test(contrib), 'every unknown/failed path is telemetered');
  const libFiles = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js') && f !== 'contributions.js' && f !== 'build-version.js');
  const users = libFiles.filter((f) => /\b(registerCommand|registerMenuItem|registerKeybinding|menuItems|runCommand|installKeybindings)\(/.test(read('src/lib/' + f)));
  ok(users.length >= 6 && users.every((f) => /from '\.\/contributions\.js'/.test(read('src/lib/' + f))), `every module calling the registry imports contributions.js (${users.join(', ')}) — a bare call is the 2.330.1 free-variable class`, users.filter((f) => !/from '\.\/contributions\.js'/.test(read('src/lib/' + f))).join(','));
  ok(/'test-contributions'/.test(read('scripts/ci.mjs')), 'ci.mjs SUITES carries this suite');
  ok(/api\.registerCommand/.test(read('docs/plugins.md')) && /api\.registerMenuItem/.test(read('docs/plugins.md')) && /api\.registerKeybinding/.test(read('docs/plugins.md')), 'docs/plugins.md documents the three Ph1 host API calls');
  ok(/### contributions\.js/.test(read('docs/kb-file-structure.md')), 'kb-file-structure.md carries the contributions.js essay');
  ok(/unknown-type/.test(read('docs/kb-api.md')), 'kb-api.md documents the unknown-type error reply');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
// telemetry-client armed a flush timer on the unknown-command events — exit explicitly
process.exit(fail ? 1 : 0);
