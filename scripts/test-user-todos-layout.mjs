#!/usr/bin/env node
// test-user-todos-layout — the "For you" popup keeps every row in its slot while
// it is open (inc-mtw02kbq-kj96: a ✓ re-rendered the list, the resolved row left
// its group, the rows below slid up under the pointer, and the next rapid click
// hit the wrong item). PURE src/lib/user-todos-layout.js + a wiring pin.
// ⑪ (B-328d): notices by ORIGIN — the closed producer set (src/inbox-origin.js),
// the legacy read-time rung, groups / chips / tab counts, the HELD filter (r2),
// the store's origin field (REQUIRED since r2 — a filing naming none throws),
// and THE CENSUS: every two-argument .add( / ?.add( on any receiver under src/
// and server.js declares a literal origin, the one its file produces (grep-
// derived, with planted/patched/evasion controls — an unwired site FAILS here).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { openLayout, nextLayout, entriesFor } = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
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
ok(/if \(popup\.classList\.contains\('hidden'\)\) \{ layout = null; return; \}/.test(panel) && /\n\s*layout = layout \? nextLayout\(layout, todos\) : openLayout\(gs\);/.test(panel), 'visible ⇒ nextLayout/openLayout; hidden ⇒ the layout is dropped so the next open re-sorts');
ok(/if \(!popup\.classList\.contains\('hidden'\)\) \{ layout = null; popup\.replaceChildren\(\); \}/.test(panel), '…and every OPEN starts from a fresh sorted layout (a close by Esc / outside tap never ran renderPanel, so the old layout used to survive into the next open)');
ok(/entriesFor\(layout, todos\)/.test(panel) && /ut-item-inplace/.test(fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-row.js'), 'utf8')), 'rows are rendered from the layout, a resolved one in place with the ut-item-inplace class (THE row renderer)');
ok(/todos\.resolved\.filter\(\(i\) => !inPlace\.has\(i\.id\)\)/.test(panel), 'the "Recently resolved" tail skips rows still holding their slot above');


console.log('⑤ NOTICES (2.369.118, owner: spend notices are DISTRACTING beside real asks) — a producer-declared kind, its own section, a grey count');
{
  const { isNotice, splitNotices, badgeCounts } = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const n1 = it('n1', 'accounts', { kind: 'notice', sessionName: 'Spending' }), n2 = it('n2', 'accounts', { kind: 'notice' });
  const a1 = it('a1', 'accounts', { urgency: 'high' }), a2 = it('a2', 'S1'), legacy = it('old', 'S1'); // an older item has NO kind ⇒ action
  ok(isNotice(n1) && !isNotice(a1) && !isNotice(legacy) && !isNotice(null), 'isNotice reads the declared kind only (no kind = action, null safe)');
  const rows = [['accounts', [{ item: a1, resolved: false }, { item: n1, resolved: false }, { item: n2, resolved: true }], 2], ['S1', [{ item: a2, resolved: false }, { item: legacy, resolved: false }], 2], ['N', [{ item: it('n3', 'N', { kind: 'notice' }), resolved: false }], 1]];
  const { action, notices } = splitNotices(rows);
  eq(action.map(([k, es, c]) => `${k}:${es.map((e) => e.item.id).join(',')}:${c}`), ['accounts:a1:1', 'S1:a2,old:2'], 'action groups keep their order; openCount is recounted over ACTION rows; an all-notice group vanishes from the ask list');
  eq(notices.map((e) => `${e.key}:${e.item.id}${e.resolved ? '✓' : ''}`), ['accounts:n1', 'accounts:n2✓', 'N:n3'], 'notices are flat, in order, carrying their group key and the in-place resolved mark');
  const bc = badgeCounts([a1, n1, a2, n2, legacy]);
  eq([bc.action.map((i) => i.id), bc.notices], [['a1', 'a2', 'old'], 2], 'badgeCounts: the red/yellow/accent segments come from action items only; notices are the grey count');
  eq(badgeCounts([]).notices, 0, 'empty is 0/0');
  // wiring pins — the 2.355.0 lesson
  const store = fs.readFileSync(path.join(ROOT, 'src/user-todos.js'), 'utf8');
  ok(/const KINDS = \['action', 'notice'\]/.test(store) && /kind must be one of/.test(store) && /kind: kind \|\| 'action'/.test(store), 'the store validates kind and defaults it to action');
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  ok(/import \{[^}]*splitNotices, badgeCounts[^}]*\} from '\.\/user-todos-layout\.js'/.test(panel) && /badgeCounts\(todos\.open\)/.test(panel) && /splitNotices\(allRows\)/.test(panel) && /ut-seg-notice/.test(panel) && /ut-notice-head/.test(panel), 'the panel counts the badge with badgeCounts and renders the notice section from splitNotices');
  const guard = fs.readFileSync(path.join(ROOT, 'src/server/spend-guard.js'), 'utf8');
  ok(/sessionName: 'Spending', kind: 'notice'/.test(guard), "spend-guard's inbox item is declared a notice at the producer");
  const ask = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-ask'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8');
  ok(/--notice/.test(ask) && /add: \{ text, detail, urgency, kind(?:, options)? \}/.test(ask) && /kind: add\.kind \|\| null/.test(routes), 'vibespace-ask --notice reaches the store through the agent route');
  const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
  ok(/\.ut-count\.ut-seg-notice \{[^}]*var\(--text-dim\)/.test(css) && !/\.ut-count\.ut-seg-notice \{[^}]*#[0-9a-f]{3}/i.test(css), 'the grey segment uses theme vars, no literal colour');
}

console.log('⑥ THE RUNNING DOT (design-user-inbox-reply D1.7) — PURE liveDotState over the active-sessions payload\'s facts');
{
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  ok(typeof L.liveDotState === 'function' && L.LIVE_DOT_WHY && typeof L.LIVE_DOT_WHY === 'object', 'the layout exports liveDotState + its sentence table');
  const rowsD = [
    [{ live: true, mode: 'chat', turn: 'idle' }, 'idle', 'live + idle ⇒ idle (hollow green)'],
    [{ live: true, mode: 'chat', turn: 'running' }, 'running', 'live + mid-turn ⇒ running (filled green)'],
    [{ live: true, mode: 'chat', turn: 'waiting' }, 'waiting', "live + the harness's requires_action ⇒ waiting (amber)"],
    [{ live: true, mode: 'chat', turn: 'running', remoteState: 'reconnecting' }, 'unreachable', 'a remoteState beats the turn ⇒ unreachable'],
    [null, 'off', 'not in the live list ⇒ off'],
    [{ live: false, mode: 'chat', turn: 'running' }, 'off', 'live:false ⇒ off whatever the turn says'],
    [{ live: true, mode: 'terminal', turn: 'idle' }, 'idle', 'a terminal session keeps its dot (it IS running)'],
    [{ live: true, mode: 'chat' }, 'idle', 'no turn column (an older server) ⇒ idle, never a false "running"'],
    [{ live: true, mode: 'chat', turn: 'bogus' }, 'idle', 'an unknown turn value ⇒ idle'],
  ];
  for (const [fact, want, m] of rowsD) eq(L.liveDotState ? L.liveDotState(fact) : null, want, m);
  ok(L.LIVE_DOT_WHY && ['running', 'idle', 'waiting', 'unreachable', 'off'].every((k) => typeof L.LIVE_DOT_WHY[k] === 'string' && L.LIVE_DOT_WHY[k]), 'every dot state has one tooltip sentence');
}

console.log('⑦ THE REPLY BUTTON — PURE replyButtonState = the ONE replyVerdict projected onto {show, enabled, why, code}');
{
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const { createRequire } = await import('node:module');
  const IR = createRequire(import.meta.url)(path.join(ROOT, 'src/inbox-reply.js'));
  const item = (over = {}) => ({ id: 'ut-0123456789', sessionKey: 'claude:abc', text: 'q', ...over });
  const live = (over = {}) => ({ live: true, mode: 'chat', remoteState: null, turn: 'idle', ...over });
  const rowsR = [
    [item(), live(), { show: true, enabled: true, why: '', code: null }, 'live chat, idle ⇒ enabled'],
    [item(), live({ turn: 'running' }), { show: true, enabled: true, why: '', code: null }, 'mid-turn is NOT disabled (the session queues it)'],
    [item(), null, { show: true, enabled: false, why: IR.REPLY_WHY.no_live_session, code: 'no_live_session' }, 'not running ⇒ disabled with the "Agent not running" sentence'],
    [item(), live({ mode: 'terminal' }), { show: true, enabled: false, why: IR.REPLY_WHY.not_chat, code: 'not_chat' }, 'a terminal session ⇒ disabled not_chat (the dot still says it runs)'],
    [item(), live({ remoteState: 'reconnecting' }), { show: true, enabled: false, why: IR.REPLY_WHY.host_unreachable, code: 'host_unreachable' }, 'host unreachable ⇒ disabled'],
    [item({ sessionKey: 'accounts' }), live(), { show: false, enabled: false, why: IR.REPLY_WHY.no_session, code: 'no_session' }, 'an accounts item ⇒ NO button (Manage Agents answers it)'],
    [item({ sessionKey: 'jobs' }), null, { show: false, enabled: false, why: IR.REPLY_WHY.no_session, code: 'no_session' }, 'the jobs bucket ⇒ no button'],
    [item({ jobId: 'job-1' }), live(), { show: false, enabled: false, why: IR.REPLY_WHY.job_item, code: 'job_item' }, 'a job-borne item ⇒ no button (the job panel answers it)'],
  ];
  for (const [it_, fact, want, m] of rowsR) eq(L.replyButtonState ? L.replyButtonState(it_, fact) : null, want, m);
  // the client and the server agree by construction: every disabled sentence IS the verdict's
  const verdictOf = (it_, fact) => IR.replyVerdict({ item: it_, session: fact ? { live: fact.live !== false, mode: fact.mode, remoteState: fact.remoteState || null } : null });
  ok(rowsR.every(([it_, fact]) => { const v = verdictOf(it_, fact); const b = L.replyButtonState ? L.replyButtonState(it_, fact) : {}; return v.ok === b.enabled && (v.ok || v.code === b.code); }), 'every row agrees with the server\'s replyVerdict fed the same projection');

  console.log('   wiring pins');
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  const rowSrc = fs.existsSync(path.join(ROOT, 'src/lib/user-todos-row.js')) ? fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-row.js'), 'utf8') : '';
  ok(/from '\.\/user-todos-row\.js'/.test(panel), 'the panel imports THE row renderer (src/lib/user-todos-row.js)');
  ok(/export function renderRow\(/.test(rowSrc) && /export function patchRow\(/.test(rowSrc), 'the row file exports renderRow + patchRow');
  ok(!/class="ut-item[ "]/.test(panel) && !/itemHtml|resolvedInPlaceHtml/.test(panel), 'the panel holds no second `ut-item` row template (one renderer, one spelling)');
  ok(!/popup\.innerHTML\s*=/.test(panel), 'no `popup.innerHTML =` anywhere in the panel — the inbox reconciles keyed rows (a reply box survives a broadcast)');
  ok(/replyButtonState\(/.test(panel) && /liveDotState\(/.test(panel), 'the panel draws the reply button and the dot through the PURE projections');
  ok(/msg\.type === 'active-sessions'/.test(panel) && /patchLive\(/.test(panel), 'the panel subscribes to active-sessions and patches the live facts in place');
  const sb = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar.js'), 'utf8');
  const facts = (/const LIVE_SESSION_FACTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(sb) || [])[1] || '';
  ok(/(^|[^\w])turn: \{ digest: null \}/m.test(facts), 'LIVE_SESSION_FACTS carries `turn` with `digest: null` (carried-only: a fact that flips twice per turn must not re-render the list)');
  ok(/'\/api\/user-todos\/' ?\+|\/api\/user-todos\/\$\{encodeURIComponent\(id\)\}\/reply/.test(panel), 'the reply POSTs /api/user-todos/:id/reply');
  ok(/Could not reply: \{why\}/.test(panel) && /Reply sent/.test(panel), 'both outcomes reach the user as a toast (no silent failure)');
}

console.log('⑧ THE MINI INBOX (design-user-inbox-reply §3, chunk 3) — one session\'s badge + its popover rows');
{
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const K = ['claude:live', 'webui:sess-1'];
  const open = [it('a', 'claude:live', { urgency: 'normal' }), it('b', 'webui:sess-1', { urgency: 'high' }), it('n', 'claude:live', { kind: 'notice', urgency: 'urgent' }), it('x', 'claude:other', { urgency: 'urgent' })];
  eq(L.inboxBadgeFor ? L.inboxBadgeFor(open, K) : null, { count: 2, urgency: 'high' }, 'the badge counts the ACTION items under EITHER key (a and b), worst urgency high — the notice and the other session\'s urgent ask do not count');
  eq(L.inboxBadgeFor ? L.inboxBadgeFor([open[2]], K) : null, { count: 0, urgency: '' }, 'a session with only notices ⇒ no badge');
  eq(L.inboxBadgeFor ? L.inboxBadgeFor(open, []) : null, { count: 0, urgency: '' }, 'no keys (not a session window) ⇒ no badge');
  eq(L.inboxBadgeFor ? L.inboxBadgeFor([it('l', 'claude:live', { urgency: 'low' }), it('u', 'claude:live', { urgency: undefined })], K) : null, { count: 2, urgency: 'normal' }, 'a missing urgency reads normal (the store\'s default)');
  const ids = (r) => r.entries.map((e) => e.item.id + (e.resolved ? '✓' : '') + (e.notice ? '!' : ''));
  let t0 = { open, resolved: [] };
  let m = L.miniInboxEntries ? L.miniInboxEntries(null, t0, K) : { layout: null, entries: [] };
  eq(ids(m), ['a', 'b', 'n!'], 'a fresh open lists this session\'s rows only, in store order, the notice marked');
  // ✓ on a from the popover, and a new ask arrives for the session and one for another session
  let t1 = { open: [open[1], open[2], open[3], it('c', 'claude:live'), it('y', 'claude:other')], resolved: [it('a', 'claude:live', { status: 'done' })] };
  m = L.miniInboxEntries(m.layout, t1, K);
  eq(ids(m), ['a✓', 'b', 'n!', 'c'], 'while open: a resolved row keeps its slot, the new ask appends, the other session\'s never enters');
  // closed and reopened ⇒ a fresh sorted list without the resolved row
  eq(ids(L.miniInboxEntries(null, t1, K)), ['b', 'n!', 'c'], 'a fresh open drops what was resolved');
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  const win = fs.readFileSync(path.join(ROOT, 'src/lib/window.js'), 'utf8');
  const tg = fs.readFileSync(path.join(ROOT, 'src/lib/tab-group.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8');
  ok(/inboxBadgeFor\(todos\.open, keys\)/.test(panel) && /app\.wm\.setInboxBadge\(/.test(panel), 'wiring: the panel counts through inboxBadgeFor and hands the result to wm.setInboxBadge');
  ok(/miniInboxEntries\(mini\.layout, todos, mini\.keys\)/.test(panel) && /reconcileRows\(mini\.rows, entries, null, miniCtx\)/.test(panel), 'wiring: the popover lays out through miniInboxEntries and reconciles through THE row renderer');
  ok(/createPopover\(anchor, 'ut-mini-popover'\)/.test(panel), 'wiring: the popover is a createPopover (data-popover ⇒ the layered Escape)');
  ok(/if \(mini\) return; \/\/ the mini inbox lives in this session's own window/.test(panel), 'wiring: a row click in the popover never jumps');
  ok(/renderPanel\(\); renderMini\(\); scheduleBadges\(\);/.test(panel) && /patchLive\(\); scheduleBadges\(\);/.test(panel), 'wiring: every user-todos broadcast repaints the popover + badges; every active-sessions recounts the badges');
  ok(/setInboxBadge\(id, badge\) \{/.test(win) && /_placeInboxBadge\(win\) \{/.test(win), 'window.js owns setInboxBadge + the standalone placement');
  ok(/_inboxBadgeEl\(winId, badge\) \{/.test(tg) && /tab\.appendChild\(this\._inboxBadgeEl\(tabWinId, tabWin\._inboxBadge\)\)/.test(tg) && (tg.match(/this\._placeInboxBadge\(/g) || []).length >= 2, 'tab-group.js draws the badge on the tab and restores the standalone one on detach + ungroup');
  ok(/num\.textContent = (String\(n\)|inboxCountText\(n\))/.test(tg) && !/innerHTML = [^;]*badge\.count/.test(tg), 'the badge count is TEXT (textContent — since lane G through inboxCountText, capped at 99+), never markup');
  ok(/this\._syncInboxBadges\?\.\(\)/.test(appSrc), 'app.js recounts on every window change (a window opened / closed / re-tabbed gets its badge)');
}

console.log('⑨ FLOOD FOLDING (design-user-inbox-reply §4 d, chunk 4) — PURE foldGroup: only the newest 5 open rows show; folding HIDES, never moves');
{
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  ok(typeof L.foldGroup === 'function' && L.FOLD_MAX === 5, 'the layout exports foldGroup + FOLD_MAX = 5');
  const fg = L.foldGroup || (() => ({ visible: [], hidden: [] }));
  // a group's entries in LAYOUT order (the store sorts newest first within a tier)
  const E = (n, resolvedAt = []) => Array.from({ length: n }, (_, k) => ({ item: it('r' + k, 'S', { createdAt: 1000 - k }), resolved: resolvedAt.includes(k) }));
  const ids = (xs) => xs.map((e) => e.item.id + (e.resolved ? '✓' : ''));
  const vh = (r) => [ids(r.visible), ids(r.hidden)];
  eq(vh(fg(E(5), { max: 5 })), [['r0', 'r1', 'r2', 'r3', 'r4'], []], '5 open ⇒ nothing hidden');
  eq(vh(fg(E(6), { max: 5 })), [['r0', 'r1', 'r2', 'r3', 'r4'], ['r5']], '6 open ⇒ the oldest (r5) hidden, the newest 5 visible in layout order');
  {
    const r = fg(E(53, [1, 3, 5]), { max: 5 });
    eq(ids(r.visible), ['r0', 'r1✓', 'r2', 'r3✓', 'r4', 'r5✓', 'r6', 'r7'], '50 open + 3 resolved-in-place among the newest ⇒ the resolved rows keep their slots between the 5 newest open rows');
    eq([r.hidden.length, r.hidden.filter((e) => !e.resolved).length], [45, 45], '…hidden = the 45 older open rows');
  }
  {
    const r = fg(E(53, [1, 3, 50]), { max: 5 });
    eq([r.visible.length, r.hidden.filter((e) => e.resolved).map((e) => e.item.id)], [7, ['r50']], 'a resolved row among the OLDER rows is hidden with them');
  }
  eq(vh(fg(E(8), { max: 5, expanded: true })), [['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], []], 'expanded ⇒ everything, in layout order');
  eq(vh(fg(E(9, [0, 1, 2, 3, 4, 5, 6, 7, 8]), { max: 5 })), [['r0✓', 'r1✓', 'r2✓', 'r3✓', 'r4✓', 'r5✓', 'r6✓', 'r7✓', 'r8✓'], []], 'a resolved-only group ⇒ nothing folded');
  eq(vh(fg([], { max: 5 })), [[], []], 'an empty group ⇒ nothing');
  eq(vh(fg(E(7))), [['r0', 'r1', 'r2', 'r3', 'r4'], ['r5', 'r6']], 'max defaults to FOLD_MAX (5)');
  console.log('   the slot law while the popup is open (`prev` = what the last paint showed / hid)');
  {
    const first = fg(E(30), { max: 5 });
    const prev = { shown: new Set(first.visible.map((e) => e.item.id)), hidden: new Set(first.hidden.map((e) => e.item.id)) };
    // ✓ on r1 (visible): r1 stays in its slot, the next open row (r5) is revealed BELOW
    const r1 = fg(E(30, [1]), { max: 5, prev });
    eq(ids(r1.visible), ['r0', 'r1✓', 'r2', 'r3', 'r4', 'r5'], 'a ✓ on a visible row keeps it in its slot; the next older open row appears below it (nothing above moves)');
    // Mark all seen: every row resolved ⇒ the shown rows stay, the hidden (now resolved) rows stay hidden
    const all = fg(E(30, Array.from({ length: 30 }, (_, k) => k)), { max: 5, prev });
    eq([ids(all.visible), all.hidden.length], [['r0✓', 'r1✓', 'r2✓', 'r3✓', 'r4✓'], 25], "'Mark all seen' on a folded group: the 5 shown rows strike in place, the 25 resolved-while-hidden rows stay folded (they do not flood out below)");
    // a reopen above the cut must not push a shown row out from under the pointer
    const re = fg(E(30, [1]), { max: 5, prev: { shown: new Set(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']), hidden: new Set() } });
    eq(ids(re.visible), ['r0', 'r1✓', 'r2', 'r3', 'r4', 'r5'], 'a row the last paint showed is never hidden again while the popup is open');
    const back = fg(E(30), { max: 5, prev: { shown: new Set(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']), hidden: new Set() } });
    eq(ids(back.visible), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'], '…even when a ↺ makes it the 6th open row');
    // an arrival while open appends at the end of the group (nextLayout) ⇒ it joins the fold, it never displaces a shown row
    const arr = [...E(30), { item: it('new', 'S', { createdAt: 5000 }), resolved: false }];
    const a = fg(arr, { max: 5, prev });
    eq([ids(a.visible), a.hidden.length, (a.hidden[a.hidden.length - 1] || { item: {} }).item.id], [['r0', 'r1', 'r2', 'r3', 'r4'], 26, 'new'], 'an arrival while open joins the fold count ("26 more…") instead of pushing a shown row out');
  }
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  ok(/import \{[^}]*\bfoldGroup\b[^}]*\} from '\.\/user-todos-layout\.js'/.test(panel) && /foldGroup\(entries, \{ max: FOLD_MAX, expanded: /.test(panel), 'wiring: the panel folds every group through foldGroup');
  ok(/'ut-fold'/.test(panel) && /t\('\{n\} more…', \{ n: fold\.hidden\.length \}\)/.test(panel), "wiring: the expander row is .ut-fold worded '{n} more…' with the hidden count");
  ok(/reconcileRows\(g, fold\.visible, bar\)/.test(panel), 'wiring: only the visible rows are reconciled into the group');
  ok(/folds = new Map\(\)/.test(panel) && (panel.match(/folds\.clear\(\)/g) || []).length >= 2, 'wiring: the fold state lives in the panel only while open (cleared on close and on every open)');
}

console.log('⑩ MARK ALL SEEN + THE BOARD CHIP (chunk 4) — wiring');
{
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  ok(/'ut-seen-all'/.test(panel) && /'\/api\/user-todos\/resolve-many'/.test(panel) && /status: 'dismissed'/.test(panel), "the group head's 'Mark all seen' POSTs /api/user-todos/resolve-many with status dismissed");
  ok(/Could not update \{n\} items: \{why\}/.test(panel), 'a failed mark-all reaches the user as a toast naming the reason');
  ok(/'ut-board'/.test(panel) && /_sessionStatuses/.test(panel) && /msg\.type === 'session-status-updated'/.test(panel), 'the board chip reads app.sidebar._sessionStatuses and is patched on session-status-updated');
  ok(L_BOARD_OK(panel), "the chip's words are t()'d board states (needs input / blocked / review / working)");
}
function L_BOARD_OK(src) { return ["t('needs input')", "t('blocked')", "t('review')", "t('working')"].every((k) => src.includes(k)); }

console.log('⑪ NOTICES BY ORIGIN (B-328d) — the closed producer set, the legacy rung, groups / chips / tab counts, the store, and THE CENSUS of every add() site');
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const O = req(path.join(ROOT, 'src/inbox-origin.js'));
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const SET = ['spend', 'login', 'pool', 'jobs', 'channels', 'browser', 'agent'];
  eq(O.INBOX_ORIGINS, SET, 'the closed set = exactly the producers that file, in display order (mounts has no producer — the browser-switch proposal in mounts-plugins-wiring.js is the BROWSER\'s; r2: no system — nothing has ever filed with by:system)');
  ok(Object.isFrozen(O.INBOX_ORIGINS) && Object.isFrozen(O.ORIGIN_LABELS), 'the set and its words are frozen');
  eq(Object.keys(O.ORIGIN_LABELS), SET, 'one label per origin, no extra');
  ok(!('DEFAULT_ORIGIN' in O), 'r2: there is NO default origin (the store refuses a filing that names none)');
  eq(['spend', 'agent'].map((x) => O.normalizeOrigin(x)), ['spend', 'agent'], 'normalizeOrigin: a member ⇒ itself');
  for (const none of [null, undefined, '']) {
    let msg = '';
    try { O.normalizeOrigin(none); } catch (e) { msg = e.message; }
    ok(msg === 'origin required (one of spend/login/pool/jobs/channels/browser/agent)', `normalizeOrigin(${JSON.stringify(none)}) THROWS "origin required" naming the set (r2: fail closed, never a default)`, msg);
  }
  for (const bad of ['mounts', 'system', 'SPEND', ' spend', 5, {}, ['spend']]) {
    let msg = '';
    try { O.normalizeOrigin(bad); } catch (e) { msg = e.message; }
    ok(msg === 'origin must be one of spend/login/pool/jobs/channels/browser/agent', `normalizeOrigin(${JSON.stringify(bad)}) THROWS naming the set`);
  }
  ok(JSON.stringify(L.INBOX_ORIGINS) === JSON.stringify(O.INBOX_ORIGINS) && JSON.stringify(L.ORIGIN_LABELS) === JSON.stringify(O.ORIGIN_LABELS), 'the layout re-exports THE set (one spelling)');
  const laySrc = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-layout.js'), 'utf8');
  ok(/import \{ INBOX_ORIGINS, ORIGIN_LABELS \} from '\.\.\/inbox-origin\.js';/.test(laySrc) && !/\['spend', 'login'/.test(laySrc), '…imported from src/inbox-origin.js, never a second array literal');

  console.log('   originOf — a declared origin, else THE legacy rung (never extended)');
  const rowsO = [
    [{ origin: 'login', sessionName: 'Spending' }, 'login', 'a DECLARED origin wins over every legacy fact'],
    [{ origin: 'pool' }, 'pool', 'a declared pool item'],
    [{ sessionName: 'Spending', by: 'agent' }, 'spend', "legacy: sessionName 'Spending' ⇒ spend (spend-guard froze that name on every item)"],
    [{ sessionName: 'Channels', by: 'agent' }, 'channels', "legacy: sessionName 'Channels' ⇒ channels"],
    [{ sessionName: 'Manage Agents', by: 'system' }, 'agent', "legacy: by 'system' ⇒ agent (r2: no system row — nothing has ever filed with by:'system')"],
    [{ sessionName: 'my session', by: 'agent' }, 'agent', 'legacy: anything else ⇒ agent'],
    [{ sessionName: 'Manage Agents', by: 'agent' }, 'agent', "legacy: the login watch's old items are NOT guessed (the rung reads only the two sessionName facts)"],
    [{ origin: 'system', sessionName: 'Spending' }, 'spend', "an origin 'system' (the dropped row) reads through the rung like any stranger"],
    [{ origin: 'mounts', sessionName: 'Spending' }, 'spend', 'an origin outside the set reads through the legacy rung'],
    [{ origin: '"><img src=x onerror=1>' }, 'agent', 'a hostile origin string is never an origin'],
    [null, 'agent', 'null-safe'],
  ];
  for (const [item, want, m] of rowsO) eq(L.originOf(item), want, m);
  ok(/export function originOf\(item\) \{\n  if \(!item\) return 'agent';\n  if \(typeof item\.origin === 'string' && INBOX_ORIGINS\.includes\(item\.origin\)\) return item\.origin;\n  if \(item\.sessionName === 'Spending'\) return 'spend';\n  if \(item\.sessionName === 'Channels'\) return 'channels';\n  return 'agent';\n\}/.test(laySrc), 'the legacy rung is exactly three rows (pinned — a new producer DECLARES, it never gets a row here)');

  console.log('   noticeGroups / noticeChips / noticeFilterFor');
  const N = (id, extra = {}, resolved = false) => ({ item: { id, sessionKey: 'k', text: id, kind: 'notice', ...extra }, resolved });
  const notices = [N('a1', { origin: 'agent' }), N('s1', { origin: 'spend' }), N('c1', { origin: 'channels' }), N('s2', { sessionName: 'Spending' }), N('l1', { origin: 'login' }, true), N('a2', {}), N('s3', { origin: 'spend' }, true)];
  const G = (gs) => gs.map((g) => `${g.origin}:${g.entries.map((e) => e.item.id + (e.resolved ? '✓' : '')).join(',')}:${g.open}/${g.total}${g.shown ? '' : ':hidden'}`);
  eq(G(L.noticeGroups(notices)), ['spend:s1,s2,s3✓:2/3', 'login:l1✓:0/1', 'channels:c1:1/1', 'agent:a1,a2:2/2'], "fixed origin order; each group keeps its entries in LAYOUT order (a legacy 'Spending' row joins spend); open/total count in-place resolved rows");
  eq(G(L.noticeGroups(notices, 'spend')), ['spend:s1,s2,s3✓:2/3', 'login:l1✓:0/1:hidden', 'channels:c1:1/1:hidden', 'agent:a1,a2:2/2:hidden'], 'a filter HIDES the other groups — every group is still returned (the panel keeps their nodes)');
  eq(G(L.noticeGroups(notices, 'pool')).every((g) => !g.endsWith(':hidden')), true, 'a filter whose origin has no notice ⇒ everything shown');
  eq(G(L.noticeGroups(notices, 'all', { prev: ['agent', 'spend'] })), ['agent:a1,a2:2/2', 'spend:s1,s2,s3✓:2/3', 'login:l1✓:0/1', 'channels:c1:1/1'], 'while open (prev = the last paint): the listed groups keep their slots, new origins APPEND in set order (the slot law for groups)');
  eq(G(L.noticeGroups([N('s1', { origin: 'spend' })], 'all', { prev: ['agent', 'spend'] })), ['spend:s1:1/1'], 'a prev origin no longer present is dropped');
  eq(L.noticeGroups([], 'spend'), [], 'no notices ⇒ no groups');
  eq(L.noticeGroups(notices).map((g) => g.label), ['Spending', 'Login expiry', 'Channels', 'Agents'], 'each group carries its English t() key');
  eq(L.noticeChips(notices).map((c) => `${c.origin}:${c.count}`), ['all:5', 'spend:2', 'login:0', 'channels:1', 'agent:2'], "chips: 'all' first with the total OPEN, then every PRESENT origin with its open count (an all-resolved origin keeps its chip at 0 while its rows hold their slots)");
  eq(L.noticeChips(notices, { prev: ['agent'] }).map((c) => c.origin), ['all', 'agent', 'spend', 'login', 'channels'], 'chips follow the groups\' order');
  eq(L.noticeChips([]).map((c) => `${c.origin}:${c.count}`), ['all:0'], 'no notices ⇒ only the all chip (the panel hides a strip of ≤ 2)');
  eq(['all', null, '', 'spend', 'pool', 'bogus'].map((f) => L.noticeFilterFor(f, notices)), ['all', 'all', 'all', 'spend', 'all', 'all'], 'noticeFilterFor: the stored filter while its origin is present, else all');
  console.log('   the HELD filter (r2) — the answer at open is held and stored; an arrival never changes the filter in force');
  {
    // the verifier's S5: Login expiry chosen, its notice dismissed, the popup reopened (a resolved row is not in an open's layout)
    const atOpen = [N('s1', { origin: 'spend' }), N('c1', { origin: 'channels' }), N('a1', { origin: 'agent' })];
    const held = L.noticeFilterFor('login', atOpen);
    eq(held, 'all', 'at open: a stored choice whose origin has no notice resolves to all — the panel HOLDS this answer (and stores it)');
    const arrived = [...atOpen, N('l9', { origin: 'login' })];
    const shownOf = (gs) => gs.filter((g) => g.shown).map((g) => g.origin);
    const order = ['spend', 'channels', 'agent'];
    eq(shownOf(L.noticeGroups(arrived, held, { prev: order })), ['spend', 'channels', 'agent', 'login'], 'a login notice ARRIVING under the held all keeps every group shown (its group appends)');
    eq(L.noticeFilterFor(held, arrived), 'all', '…and the held filter stays all through the arrival (only a chip click chooses)');
    eq(shownOf(L.noticeGroups(arrived, 'login', { prev: order })), ['login'], "control: the STORED choice re-applied at the arrival (r1's panel) shows ONLY login — every other group vanishes under an active All chip (the verifier's flip)");
  }

  console.log('   tabCounts — the Inbox tab (actions + the grey notices) and the Notifications tab (unread since the last look)');
  const open = [it('x1', 'S', { urgency: 'high' }), it('x2', 'S', { urgency: 'low' }), it('n1', 'accounts', { kind: 'notice', urgency: 'urgent' }), it('n2', 'S', { kind: 'notice' })];
  const hist = [{ ts: 100, m: 'a' }, { ts: 200, m: 'b' }, { ts: 300, m: 'c' }, { m: 'no ts' }, null];
  eq(L.tabCounts(open, hist, 150), { inbox: { action: 2, notice: 2, urgency: 'high' }, history: { unread: 2 } }, 'actions 2 (worst high — an urgent NOTICE never colours it), notices 2, two toasts newer than the last look (an entry without ts never counts)');
  eq(L.tabCounts(open, hist, 300).history.unread, 0, 'a look at/after the newest toast ⇒ 0');
  eq([null, undefined, 'garbage'].map((s) => L.tabCounts([], hist, s).history.unread), [3, 3, 3], 'never looked (null / garbage) ⇒ every stamped toast counts (the panel stamps the key at install)');
  eq(L.tabCounts([], null, 0), { inbox: { action: 0, notice: 0, urgency: '' }, history: { unread: 0 } }, 'empty ⇒ zeros, no urgency');
  eq(L.tabCounts([it('u', 'S', { urgency: 'urgent' }), it('m', 'S', {})], [], 0).inbox, { action: 2, notice: 0, urgency: 'urgent' }, 'the worst tier colours the Inbox pill (the taskbar badge\'s rule)');
  eq(L.tabCounts(open, [], 0).inbox.action, L.badgeCounts(open).action.length, 'the Inbox count IS the taskbar badge\'s action count');

  console.log('   the MINI INBOX badge keeps excluding notices (whatever their origin)');
  const K = ['claude:live'];
  const mixed = [it('q', 'claude:live', { urgency: 'normal' }), it('ns', 'claude:live', { kind: 'notice', origin: 'spend', urgency: 'urgent' }), it('na', 'claude:live', { kind: 'notice', origin: 'agent', urgency: 'high' })];
  eq(L.inboxBadgeFor(mixed, K), { count: 1, urgency: 'normal' }, 'the badge counts the one ask; a spend notice and an agent notice under the same key never count nor colour it');
  eq(L.inboxBadgeFor(mixed.slice(1), K), { count: 0, urgency: '' }, 'notices only ⇒ no badge');

  console.log('   the store — origin is REQUIRED (r2: fail closed, no default), validated, kept on a re-file, carried by snapshot + broadcast');
  {
    const os = await import('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ut-origin-'));
    try {
      const { UserTodoManager } = req(path.join(ROOT, 'src/user-todos.js'));
      const casts = [];
      const m = new UserTodoManager({ dataDir: dir, onChange: (snap) => casts.push(snap), expirySweepMs: 0 });
      const a = m.add('accounts', { text: 'spend warning', kind: 'notice', origin: 'spend' });
      eq(a.origin, 'spend', 'a declared origin is stored');
      let msg = '';
      const n0 = m.snapshot().open.length;
      const c0 = casts.length;
      for (const none of [undefined, null, '']) {
        msg = '';
        try { m.add('accounts', { text: 'an undeclared producer', kind: 'notice', sessionName: 'Manage Agents', origin: none }); } catch (e) { msg = e.message; }
        ok(msg === 'origin required (one of spend/login/pool/jobs/channels/browser/agent)' && m.snapshot().open.length === n0 && casts.length === c0, `r2 FAIL CLOSED: a filing naming no origin (${JSON.stringify(none)}) THROWS "origin required" and files nothing, broadcasts nothing (it used to land under Agents silently)`, msg);
      }
      eq(m.add('claude:x', { text: 'an ask', origin: 'agent' }).origin, 'agent', "the agent route's shape declares 'agent' explicitly");
      msg = '';
      const n1 = m.snapshot().open.length;
      try { m.add('claude:x', { text: 'typo', origin: 'mounts' }); } catch (e) { msg = e.message; }
      ok(/origin must be one of spend\/login\/pool\/jobs\/channels\/browser\/agent$/.test(msg) && m.snapshot().open.length === n1, 'a value outside the set THROWS by name and files nothing');
      const re = m.add('accounts', { text: 'spend warning', kind: 'notice', origin: 'login', urgency: 'high' });
      eq([re.id === a.id, re.origin, re.urgency], [true, 'spend', 'high'], 'a re-file of the same item KEEPS its declared origin (other fields still merge)');
      // a LEGACY item on disk (no origin) re-filed by a declaring producer takes the declaration
      const legacy = { id: 'ut-00000000ee', sessionKey: 'accounts', text: 'old spend warning', status: 'open', kind: 'notice', by: 'agent', sessionName: 'Spending', createdAt: 1 };
      fs.writeFileSync(path.join(dir, 'user-todos.json'), JSON.stringify({ items: [legacy] }));
      const m2 = new UserTodoManager({ dataDir: dir, onChange: (snap) => casts.push(snap), expirySweepMs: 0 });
      eq(m2.get('ut-00000000ee').origin, undefined, 'a legacy item loads WITHOUT origin (no migration — the read-time rung classifies it)');
      eq(L.originOf(m2.snapshot().open[0]), 'spend', '…and the read-time rung puts it under Spending');
      m2.add('accounts', { text: 'old spend warning', kind: 'notice', origin: 'spend' });
      eq(m2.get('ut-00000000ee').origin, 'spend', 'a re-file with a declaration stamps the legacy item');
      const last = casts[casts.length - 1];
      ok(last && last.open.some((i) => i.id === 'ut-00000000ee' && i.origin === 'spend'), 'the broadcast snapshot carries origin');
      m.stop(); m2.stop();
      // r2 (verifier, pre-existing): stop() is the manager's last act — a debounced
      // write pending at stop() is flushed NOW; its 500 ms timer used to outlive
      // stop() and fire into a data dir the owner had already removed (ENOENT)
      const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ut-stop-'));
      const m3 = new UserTodoManager({ dataDir: sdir, expirySweepMs: 0 });
      m3.add('claude:s', { text: 'pending at stop', origin: 'agent' });
      const pendingBefore = m3._writeTimer !== null && !fs.existsSync(path.join(sdir, 'user-todos.json'));
      m3.stop();
      let onDisk = null;
      try { onDisk = JSON.parse(fs.readFileSync(path.join(sdir, 'user-todos.json'), 'utf8')); } catch { }
      ok(pendingBefore && m3._writeTimer === null && m3._expiryTimer === null && !!onDisk && onDisk.items.some((i) => i.text === 'pending at stop'), 'stop() clears BOTH timers and flushes the pending write before it returns (the owner may remove the dir right after)', { pendingBefore, timer: m3._writeTimer !== null, onDisk: !!onDisk });
      fs.rmSync(sdir, { recursive: true, force: true });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log('   THE CENSUS — every two-argument .add( / ?.add( on ANY receiver in src/ + server.js (the store\'s add(sessionKey, options) shape) declares a literal origin, the right one for its file');
  // the file → origin table: a NEW producer file fails here until it is added
  // WITH its origin (and the origin to src/inbox-origin.js if it is a new one)
  const PRODUCERS = {
    'src/server/spend-guard.js': 'spend',
    'src/server/login-expiry-watch.js': 'login',
    'src/server/usage-pool-engine.js': 'pool',
    'src/server/jobs-wiring.js': 'jobs',
    'src/server/channels-engine.js': 'channels',
    'src/server/browser-handback.js': 'browser',
    'src/server/mounts-plugins-wiring.js': 'browser', // the browser routes' switch PROPOSAL (this file only wires them)
    'src/agent-routes.js': 'agent',
  };
  // r2: no exemptions — every origin of the closed set has a producer (the
  // `system` row was dropped: nothing has ever filed with by:'system')
  const NO_PRODUCER = {};
  // the DOM's classList.add(a, b) is the only other two-argument add in the tree
  const NOT_THE_STORE = /\bclassList\s*$/;
  /** skip a template literal starting at src[i] === '`' (with ${…} nesting) */
  const skipTpl = (src, i) => {
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') return i + 1;
      if (c === '$' && src[i + 1] === '{') {
        i += 2; let d = 1;
        while (i < src.length && d > 0) {
          const q = src[i];
          if (q === "'" || q === '"') { let j = i + 1; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } i = j + 1; continue; }
          if (q === '`') { i = skipTpl(src, i); continue; }
          if (q === '{') d++; else if (q === '}') d--;
          i++;
        }
        continue;
      }
      i++;
    }
    return i;
  };
  /** The call's TOP-LEVEL text: depth 1 (the arguments) + depth 2 (the options
   *  object's own keys); deeper structures, comments and template bodies are
   *  dropped, single/double-quoted strings kept — so a nested `origin:` (an
   *  action payload's, say) can never satisfy the census for the item. */
  const topLevelOf = (src, open) => {
    let i = open, depth = 0, out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === "'" || c === '"') { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } if (depth <= 2) out += src.slice(i, j + 1); i = j + 1; continue; }
      if (c === '`') { i = skipTpl(src, i); if (depth <= 2) out += '``'; continue; }
      if ('([{'.includes(c)) { depth++; if (depth <= 2) out += c; i++; continue; }
      if (')]}'.includes(c)) { if (depth <= 2) out += c; depth--; i++; if (depth === 0) return out; continue; }
      if (depth <= 2) out += c;
      i++;
    }
    return out;
  };
  /** the number of TOP-LEVEL arguments in a call's topLevelOf text (a comma
   *  inside a quoted string or a nested structure never counts) */
  const argCountOf = (top) => {
    let depth = 0, n = 0, any = false;
    const body = top.slice(1, -1);
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "'" || c === '"') { let j = i + 1; while (j < body.length && body[j] !== c) { if (body[j] === '\\') j++; j++; } i = j; any = true; continue; }
      if ('([{'.includes(c)) { depth++; any = true; continue; }
      if (')]}'.includes(c)) { depth--; continue; }
      if (depth === 0 && c === ',') n++; else if (!/\s/.test(c)) any = true;
    }
    return any ? n + 1 : 0;
  };
  /** files = {rel: text} → {sites:[{rel, line, origin}], problems:[string]}
   *  r2 (verifier): the match was `\b(\w*[Tt]odos)\.add\(` — an ALIASED store
   *  (`const inbox = userTodos; inbox.add(…)`) and optional chaining
   *  (`userTodos?.add(…)`) both evaded it. It now counts EVERY two-argument
   *  `.add(` / `?.add(` on any receiver (the store's `add(sessionKey, options)`
   *  shape; a Set's add(x) takes one), except a DOM `classList.add(a, b)` and a
   *  comment line. The store's own throw ("origin required") is the first guard. */
  const census = (files, origins = O.INBOX_ORIGINS) => {
    const sites = [], problems = [];
    for (const [rel, src] of Object.entries(files)) {
      for (const mm of src.matchAll(/(\??\.)add\(/g)) {
        const open = mm.index + mm[0].length - 1;
        const lineStart = src.lastIndexOf('\n', mm.index) + 1;
        if (/^\s*(\/\/|\/?\*)/.test(src.slice(lineStart, mm.index))) continue; // prose in a comment block
        if (NOT_THE_STORE.test(src.slice(Math.max(0, mm.index - 40), mm.index))) continue;
        const top = topLevelOf(src, open);
        if (argCountOf(top) < 2) continue; // add(x): a Set, a listener registry — not the store's shape
        const line = src.slice(0, mm.index).split('\n').length;
        const om = /(?:^|[{,\s])origin:\s*'([^']*)'/.exec(top);
        const where = `${rel}:${line}`;
        if (!om) { problems.push(`${where} files an inbox item WITHOUT a literal origin`); continue; }
        const origin = om[1];
        sites.push({ rel, line, origin });
        if (!origins.includes(origin)) problems.push(`${where} declares origin '${origin}' — not in the closed set (src/inbox-origin.js)`);
        if (!(rel in PRODUCERS)) problems.push(`${where} is a producer the census does not know — add ${rel} to PRODUCERS with its origin`);
        else if (PRODUCERS[rel] !== origin) problems.push(`${where} declares '${origin}', its file is the '${PRODUCERS[rel]}' producer`);
      }
    }
    for (const o of origins) if (!(o in NO_PRODUCER) && !sites.some((x) => x.origin === o)) problems.push(`origin '${o}' has no producer site — a dead row in the closed set`);
    for (const rel of Object.keys(PRODUCERS)) if (!sites.some((x) => x.rel === rel)) problems.push(`${rel} is in PRODUCERS but files nothing — a dead row`);
    return { sites, problems };
  };
  const files = {};
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } };
  walk('src');
  files['server.js'] = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const C = census(files);
  console.log('     sites: ' + C.sites.map((x) => `${x.rel.replace(/^src\//, '')}:${x.line}=${x.origin}`).join(' · '));
  ok(C.sites.length >= 12, `the census scope is non-vacuous (${C.sites.length} sites; 12 when this shipped)`);
  ok(C.problems.length === 0, 'every site declares a literal origin of the closed set, the one its file produces; every origin has a producer; every PRODUCERS row files', C.problems);
  eq(C.sites.length, 12, 'the widened match finds exactly the 12 declared sites (every classList.add(a, b) excluded, no other two-argument add in the tree)');
  eq(C.sites.filter((x) => x.rel === 'src/server/channels-engine.js').length, 5, 'channels-engine files from five sites — all five declared');
  console.log('   negative controls (the census must be able to go red)');
  const drop = { ...files, 'src/server/spend-guard.js': files['src/server/spend-guard.js'].split("origin: 'spend', ").join('') };
  const cDrop = census(drop);
  ok(cDrop.problems.some((p) => /spend-guard\.js:\d+ files an inbox item WITHOUT a literal origin/.test(p)) && cDrop.problems.some((p) => /origin 'spend' has no producer site/.test(p)), 'a spend-guard copy without its origin ⇒ the site is named AND spend becomes a dead row', cDrop.problems);
  const planted = { ...files, 'src/server/new-producer.js': "function f(userTodos) {\n  userTodos.add('accounts', { text: 'x', origin: 'spend' });\n}\n" };
  ok(census(planted).problems.some((p) => /new-producer\.js:2 is a producer the census does not know/.test(p)), 'a planted producer in an unknown file is named');
  const wrong = { ...files, 'src/server/jobs-wiring.js': files['src/server/jobs-wiring.js'].split("origin: 'jobs'").join("origin: 'agent'") };
  ok(census(wrong).problems.some((p) => /jobs-wiring\.js:\d+ declares 'agent', its file is the 'jobs' producer/.test(p)), 'a producer declaring somebody else\'s origin is named');
  const nested = { 'src/x.js': "userTodos.add('k', { text: 't', action: { type: 'a', origin: 'spend' } });\n" };
  ok(census(nested).problems.some((p) => /src\/x\.js:1 files an inbox item WITHOUT a literal origin/.test(p)), 'a NESTED origin (an action payload\'s) does not satisfy the census');
  const typo = { ...files, 'src/server/login-expiry-watch.js': files['src/server/login-expiry-watch.js'].split("origin: 'login'").join("origin: 'logins'") };
  ok(census(typo).problems.some((p) => /declares origin 'logins' — not in the closed set/.test(p)), 'an origin outside the set is named');
  ok(census(files, [...O.INBOX_ORIGINS, 'mounts']).problems.some((p) => /origin 'mounts' has no producer site/.test(p)), "an origin with no producer (the task's 'mounts') would be a dead row");
  ok(census(files, [...O.INBOX_ORIGINS, 'system']).problems.some((p) => /origin 'system' has no producer site/.test(p)), "r2: the dropped 'system' row, put back, is a dead row by name (no exemption table any more)");
  // r2 — the verifier's two evasions (each was ALL PASS under the old `\w*[Tt]odos\.add\(` match) + a variable options object
  const OLD = /\b(\w*[Tt]odos)\.add\(/;
  const evasions = {
    'an ALIASED store': ['src/server/alias-producer.js', "function f(userTodos) {\n  const inbox = userTodos;\n  inbox.add('accounts', { text: 'x' });\n}\n", /alias-producer\.js:3 files an inbox item WITHOUT a literal origin/],
    'optional chaining': ['src/server/optional-producer.js', "function f(userTodos) {\n  userTodos?.add('accounts', { text: 'x' });\n}\n", /optional-producer\.js:2 files an inbox item WITHOUT a literal origin/],
    'an options object from a variable': ['src/server/variable-producer.js', "function f(deps, opts) {\n  deps.store.add('accounts', opts);\n}\n", /variable-producer\.js:2 files an inbox item WITHOUT a literal origin/],
  };
  for (const [what, [rel, text, re]] of Object.entries(evasions)) {
    const pr = census({ ...files, [rel]: text }).problems;
    ok(pr.some((p) => re.test(p)), `evasion ${what} ⇒ RED by name`, pr);
    ok(!OLD.test(text), `…and the r1 match could not see it (${what}: it was ALL PASS)`);
  }
  const benign = { 'src/lib/x.js': "el.classList.add('a', 'b');\nseen.add(id);\nseen.add('a, b');\nlisteners.add(fn);\n// prose about store.add(key, opts) in a comment\n" };
  ok(census(benign, O.INBOX_ORIGINS).sites.length === 0 && !census(benign).problems.some((p) => /src\/lib\/x\.js/.test(p)), 'the benign adds are not sites: a DOM classList.add(a, b), a Set/registry add(x) (a comma inside its string is no second argument), prose in a comment');

  console.log('   wiring pins — the panel draws the groups, chips and tab counts through the PURE functions, keyed in place');
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  ok(/import \{[^}]*\bnoticeGroups, noticeChips, noticeFilterFor, tabCounts, NOTICE_FILTER_KEY, HISTORY_SEEN_KEY\b[^}]*\} from '\.\/user-todos-layout\.js'/.test(panel), 'the panel imports the four PURE functions + the two per-device keys');
  eq([L.NOTICE_FILTER_KEY, L.HISTORY_SEEN_KEY], ['vibespace.ut-notice-filter', 'vibespace.ut-history-seen'], 'the per-device localStorage keys');
  ok(/const groups = noticeGroups\(entries, noticeFilter, \{ prev: noticeOrder \}\);/.test(panel) && /noticeOrder = groups\.map\(\(g\) => g\.origin\);/.test(panel), 'the groups are laid out by noticeGroups with the last paint\'s order (append-only while open)');
  ok(/const disp = g\.shown \? '' : 'none';/.test(panel) && /reconcileRows\(el, g\.entries, head\);/.test(panel), 'a filtered-out group is HIDDEN (display), its rows still reconciled through THE row reconciler — never removed');
  ok(/renderNotices\(nBox, notices\.map\(/.test(panel) && !/ut-notice-rows/.test(panel), 'the flat notice list is gone: the Notices area renders through renderNotices');
  ok(/const disp = chips\.length > 2 \? '' : 'none';/.test(panel), 'the chip strip hides when only one origin is present (nothing to filter)');
  ok(/localStorage\.setItem\(NOTICE_FILTER_KEY, noticeFilter\)/.test(panel) && /localStorage\.getItem\(NOTICE_FILTER_KEY\)/.test(panel), 'the filter is persisted per device');
  ok(/if \(knownIds !== null\) \{ const eff = noticeFilterFor\(noticeFilter, entries\); if \(eff !== noticeFilter\) setNoticeFilter\(eff\); \}\n    const groups = noticeGroups\(entries, noticeFilter, \{ prev: noticeOrder \}\);/.test(panel), 'r2 THE HELD FILTER: before the groups are laid out, the filter goes through noticeFilterFor and its answer BECOMES the filter (held + stored) — an arrival never re-applies a stored choice');
  ok(/patchChips\(nBox\.querySelector\(':scope > \.ut-chips'\), noticeChips\(entries, \{ prev: noticeOrder \}\), noticeFilter\);/.test(panel) && (panel.match(/noticeFilterFor\(/g) || []).length === 1, '…the strip marks the HELD filter (the one call of noticeFilterFor is the hold — no second derivation that could disagree)');
  ok(/noticeFilter = readFilter\(\); \/\/ …read afresh from the device on every open/.test(panel), '…read afresh from the device on every open (then held)');
  ok(/if \(tb\) \{ if \(tb\.dataset\.tab !== tab\) \{ tab = tb\.dataset\.tab; renderPanel\(\); \} return; \}/.test(panel) && !/popup\.replaceChildren\(tabsEl\(\)/.test(panel), 'a tab click switches the PAGE; the tabs are never rebuilt (no replaceChildren(tabsEl(), …))');
  ok(/const c = tabCounts\(todos\.open, getToastHistory\(\), histSeen\(\)\);/.test(panel) && /ut-tab-n\[data-n="\$\{k\}"\]/.test(panel), 'the tab counts come from tabCounts and patch keyed `.ut-tab-n[data-n]` spans');
  ok(/window\.addEventListener\('vs-toast', \(\) => \{ if \(popup\.classList\.contains\('hidden'\)\) return; if \(tab === 'history'\) renderPanel\(\); else patchTabs\(\); \}\);/.test(panel), 'a toast patches the Notifications count in place (or refreshes the page being read)');
  ok(/markHistorySeen\(\); \/\/ the page is being LOOKED AT/.test(panel) && /if \(histSeen\(\) == null\) markHistorySeen\(\);/.test(panel), 'showing the Notifications page stamps the last look; a device that never looked is stamped at install');
  ok(/btn\.title = actionWords\(action\)/.test(panel) && /const words = actionWords\(action\); \/\/ the taskbar badge's own sentence/.test(panel), 'the Inbox tab\'s count and the taskbar badge share ONE sentence (actionWords)');
  const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
  ok(/\.ut-chip \{[^}]*var\(--border\)/.test(css) && /\.ut-chip\.on \{[^}]*var\(--accent\)/.test(css) && !/\.ut-chip[^{]*\{[^}]*#[0-9a-f]{3}/i.test(css) && /#user-todos-popup \.ut-chip \{ min-height: 36px;/.test(css), 'the chips use theme vars only and are ≥ 36 px on the phone sheet');
  const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  const KEYS = [...Object.values(O.ORIGIN_LABELS), 'All', 'Notices by source', 'Show all notices', 'Show only {source} notices', '{n} unread', 'Inbox', 'Notifications'];
  ok(KEYS.every((k) => zh.includes(`  ${JSON.stringify(k)}: `) && ja.includes(`  ${JSON.stringify(k)}: `)), 'every origin label and every new chrome string has a zh AND a ja entry', KEYS.filter((k) => !zh.includes(`  ${JSON.stringify(k)}: `) || !ja.includes(`  ${JSON.stringify(k)}: `)));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
