#!/usr/bin/env node
// test-user-todos-layout — the "For you" popup keeps every row in its slot while
// it is open (inc-mtw02kbq-kj96: a ✓ re-rendered the list, the resolved row left
// its group, the rows below slid up under the pointer, and the next rapid click
// hit the wrong item). PURE src/lib/user-todos-layout.js + a wiring pin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { openLayout, nextLayout, entriesFor } = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)})`);
const it = (id, sessionKey, extra = {}) => ({ id, sessionKey, text: id, urgency: 'normal', createdAt: 1, ...extra });
const rows = (layout, todos) => entriesFor(layout, todos).flatMap((g) => g.entries.map((e) => `${g.key}:${e.item.id}${e.resolved ? '✓' : ''}`));

console.log('① the incident: four rapid ✓ at one screen slot must hit four DIFFERENT rows only if the rows MOVE — they must not');
let todos = { open: [it('a', 'S1'), it('b', 'S1'), it('c', 'S1'), it('d', 'S2')], resolved: [] };
let layout = openLayout([['S1', todos.open.slice(0, 3)], ['S2', [todos.open[3]]]]);
eq(rows(layout, todos), ['S1:a', 'S1:b', 'S1:c', 'S2:d'], 'open: the sorted groups become the layout');
// ✓ on b → the store moves it to resolved, the broadcast re-renders
todos = { open: [it('a', 'S1'), it('c', 'S1'), it('d', 'S2')], resolved: [it('b', 'S1', { status: 'done' })] };
layout = nextLayout(layout, todos);
eq(rows(layout, todos), ['S1:a', 'S1:b✓', 'S1:c', 'S2:d'], 'after ✓ on b: b stays in its slot (resolved in place), a/c/d do not move');
eq(entriesFor(layout, todos).map((g) => g.openCount), [2, 1], 'the group count shows OPEN rows only');
// ✓ on c and a too → the whole group is resolved but keeps its slot
todos = { open: [it('d', 'S2')], resolved: [it('b', 'S1', { status: 'done' }), it('c', 'S1', { status: 'done' }), it('a', 'S1', { status: 'done' })] };
layout = nextLayout(layout, todos);
eq(rows(layout, todos), ['S1:a✓', 'S1:b✓', 'S1:c✓', 'S2:d'], 'a fully resolved group keeps its slot; d never moved');
// ↺ on b → back to open, same slot
todos = { open: [it('b', 'S1'), it('d', 'S2')], resolved: [it('c', 'S1', { status: 'done' }), it('a', 'S1', { status: 'done' })] };
layout = nextLayout(layout, todos);
eq(rows(layout, todos), ['S1:a✓', 'S1:b', 'S1:c✓', 'S2:d'], 'reopen puts the row back in the SAME slot');

console.log('② arrivals append, never insert; purged ids leave; close rebuilds');
todos = { open: [it('b', 'S1'), it('d', 'S2'), it('e', 'S1', { urgency: 'high' }), it('f', 'S3')], resolved: [it('c', 'S1', { status: 'done' })] };
layout = nextLayout(layout, todos);
eq(rows(layout, todos), ['S1:b', 'S1:c✓', 'S1:e', 'S2:d', 'S3:f'], 'a new HIGH item appends at the END of its group (no re-sort while open); a new group appends at the end; a purged id (a) is gone');
const fresh = openLayout([['S1', [it('e', 'S1', { urgency: 'high' }), it('b', 'S1')]], ['S3', [it('f', 'S3')]], ['S2', [it('d', 'S2')]]]);
eq(rows(fresh, todos), ['S1:e', 'S1:b', 'S3:f', 'S2:d'], 'the next OPEN rebuilds from the sorted groups (urgency first)');

console.log('③ NEGATIVE CONTROL: the pre-fix render (groups built from todos.open only) moves the rows');
const preFix = (todos) => { const g = new Map(); for (const i of todos.open) (g.get(i.sessionKey) || g.set(i.sessionKey, []).get(i.sessionKey)).push(i); return [...g.entries()].flatMap(([k, items]) => items.map((i) => `${k}:${i.id}`)); };
const before = preFix({ open: [it('a', 'S1'), it('b', 'S1'), it('c', 'S1'), it('d', 'S2')] });
const after = preFix({ open: [it('a', 'S1'), it('c', 'S1'), it('d', 'S2')] });
ok(before[2] === 'S1:c' && after[2] === 'S2:d' && before[1] === 'S1:b' && after[1] === 'S1:c',
  `the pre-fix list slides c into b's slot and d into c's — the second rapid click lands on the wrong row (${before.join(',')} → ${after.join(',')})`);

console.log('④ WIRING PIN: the panel uses the layout while the popup is visible and resets it when hidden');
const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
ok(/from '\.\/user-todos-layout\.js'/.test(panel), 'the panel imports the PURE layout');
ok(/if \(popup\.classList\.contains\('hidden'\)\) layout = null;\s*\n\s*else layout = layout \? nextLayout\(layout, todos\) : openLayout\(gs\);/.test(panel), 'visible ⇒ nextLayout/openLayout; hidden ⇒ the layout is dropped so the next open re-sorts');
ok(/entriesFor\(layout, todos\)/.test(panel) && /ut-item-inplace/.test(panel), 'rows are rendered from the layout, a resolved one in place with the ut-item-inplace class');
ok(/todos\.resolved\.filter\(\(i\) => !inPlace\.has\(i\.id\)\)/.test(panel), 'the "Recently resolved" tail skips rows still holding their slot above');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
