#!/usr/bin/env node
// test-inbox-window-model — the For-you WINDOW's rules (docs/design-user-inbox-reply.md §9,
// 2026-09-27; the owner: long agent messages cannot be reviewed in the ~400 px popup).
// PURE src/lib/inbox-window-layout.js (imports nothing, DOM-free) as TABLES, each rule
// beside a patched copy of the module that breaks it (scripts/mutant-copy.mjs — outside
// the checkout), then the WIRING PINS (the window really calls every function; the popup's
// three ⤢ and the ⚙ row are the doors; the viewer modal is gone; every verb is THE model's):
//   ① nextSelection — the mail-client rule (next open below, else previous open above, else none)
//   ② holdSelection — the selection survives a broadcast / a filter while its row is listed
//   ③ paneMode      — one pane below NARROW_PX (the ONE threshold), unmeasured ⇒ keep, touch rows ≥ 36
//   ④ scopeRows     — tab · session scope (a key or a session's keys) · every filter term
//   ⑤ itemView      — the pane as STRUCTURE: meta words, chips, the reply verdict (fed the REAL
//                     replyButtonState), the action row, Copy's text; hostile strings verbatim
//   ⑥ the patched-copy census (nothing written into src/)
//   ⑦ wiring pins + i18n + the ci.mjs row
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'src/lib/inbox-window-layout.js';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const L = await import(pathToFileURL(path.join(ROOT, REL)).href);
const U = await import(pathToFileURL(path.join(ROOT, 'src/lib/user-todos-layout.js')).href);
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const J = JSON.stringify;
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
const M = mutantCopies('inbox-window-model', ROOT);
/** A patched copy of the PURE module with ONE named edit (the edit must apply). */
const mutant = async (tag, from, to) => {
  if (!SRC.includes(from)) { ok(false, `control ${tag}: the edit applies to the real module`, from); return null; }
  return import(pathToFileURL(M.write(REL, SRC.split(from).join(to), tag)).href);
};
const E = (id, { resolved = false, notice = false, key = 'claude:s1', text, detail = null, options = null } = {}) => ({ item: { id, sessionKey: key, text: text ?? id, detail, options, status: resolved ? 'done' : 'open', urgency: 'normal', createdAt: 1 }, resolved, notice, key });

console.log('imports nothing, DOM-free');
ok(!/^\s*(import|export)\s[^;]*\bfrom\s/m.test(SRC) && !/\brequire\(/.test(SRC) && !/\b(document|window)\./.test(SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'src/lib/inbox-window-layout.js imports nothing and touches no DOM');
ok(typeof L.NARROW_PX === 'number' && L.NARROW_PX >= 480 && L.NARROW_PX <= 800 && L.TOUCH_ROW_PX === 36 && J(L.TABS) === J(['actions', 'notices']), `the constants: NARROW_PX ${L.NARROW_PX}, TOUCH_ROW_PX 36, TABS actions|notices`);

console.log('① nextSelection — THE MAIL-CLIENT RULE');
const NEXT = [
  // [label, entries, resolvedId, want]
  ['the next open row below', [E('a'), E('b'), E('c')], 'b', 'c'],
  ['the last row ⇒ the previous open row above', [E('a'), E('b'), E('c')], 'c', 'b'],
  ['rows resolved in place are skipped (below)', [E('a'), E('b'), E('c', { resolved: true }), E('d')], 'b', 'd'],
  ['rows resolved in place are skipped (above)', [E('a'), E('b', { resolved: true }), E('c')], 'c', 'a'],
  ['nothing open left ⇒ null', [E('a', { resolved: true }), E('b'), E('c', { resolved: true })], 'b', null],
  ['the only row ⇒ null', [E('a')], 'a', null],
  ['the resolved row itself is skipped even while the list still shows it open (before the broadcast)', [E('a'), E('b')], 'a', 'b'],
  ['an id the list does not hold ⇒ the first open row', [E('a', { resolved: true }), E('b'), E('c')], 'zz', 'b'],
  ['…and none open ⇒ null', [E('a', { resolved: true })], 'zz', null],
  ['an empty list ⇒ null', [], 'a', null],
  ['a garbage list ⇒ null', null, 'a', null],
  ['groups are one flat display order (a notice row counts like any row)', [E('a', { key: 'k1' }), E('b', { key: 'k2', notice: true }), E('c', { key: 'k2' })], 'a', 'b'],
];
for (const [label, entries, id, want] of NEXT) ok(L.nextSelection(entries, id) === want, `${label} → ${J(want)}`, L.nextSelection(entries, id));
{
  const noNext = await mutant('next-first-open', 'for (let k = at + 1; k < list.length; k++) if', 'for (let k = at + 1; k < -1; k++) if');
  const takeResolved = await mutant('next-takes-resolved', 'for (let k = at + 1; k < list.length; k++) if (isOpenEntry(list[k]) &&', 'for (let k = at + 1; k < list.length; k++) if (');
  const rows = (m) => NEXT.filter(([, entries, id, want]) => m.nextSelection(entries, id) !== want).map(([label]) => label);
  ok(noNext && rows(noNext).includes('the next open row below'), `control: a copy without the "next below" leg picks the row ABOVE (${noNext ? rows(noNext).length : '?'} table rows red)`, noNext && rows(noNext));
  ok(takeResolved && rows(takeResolved).includes('rows resolved in place are skipped (below)'), `control: a copy that does not skip resolved rows selects a struck row (${takeResolved ? rows(takeResolved).length : '?'} table rows red)`, takeResolved && rows(takeResolved));
}

console.log('② holdSelection — the selection survives what does not remove its row');
const HOLD = [
  ['still listed and open ⇒ kept', [E('a'), E('b')], 'b', 'b'],
  ['still listed but resolved IN PLACE (another client\'s ✓) ⇒ kept — the reader is never moved', [E('a'), E('b', { resolved: true })], 'b', 'b'],
  ['no longer listed (filtered / purged) ⇒ the first OPEN row', [E('a', { resolved: true }), E('b'), E('c')], 'zz', 'b'],
  ['nothing selected ⇒ the first open row', [E('a'), E('b')], null, 'a'],
  ['nothing open ⇒ null (a struck row is never selected by itself)', [E('a', { resolved: true })], null, null],
  ['an empty list ⇒ null', [], 'a', null],
];
for (const [label, entries, id, want] of HOLD) ok(L.holdSelection(entries, id) === want, `${label} → ${J(want)}`, L.holdSelection(entries, id));
{
  const openOnly = await mutant('hold-open-only', 'if (selectedId != null && list.some((e) => idOf(e) === selectedId)) return selectedId;', 'if (selectedId != null && list.some((e) => idOf(e) === selectedId && !e.resolved)) return selectedId;');
  const bad = openOnly ? HOLD.filter(([, entries, id, want]) => openOnly.holdSelection(entries, id) !== want).map(([l]) => l) : [];
  ok(bad.length === 1 && /another client/.test(bad[0]), 'control: a copy that holds only OPEN rows moves the reader off an item another client resolved', bad);
}

console.log('③ paneMode — one pane or two');
const N = L.NARROW_PX;
const PANE = [
  [0, false, null], [NaN, false, null], [-5, false, null], [undefined, false, null],
  [390, false, { mode: 'single', rowMin: 0 }], [N - 1, false, { mode: 'single', rowMin: 0 }],
  [N, false, { mode: 'split', rowMin: 0 }], [1280, false, { mode: 'split', rowMin: 0 }],
  [390, true, { mode: 'single', rowMin: 36 }], [1280, true, { mode: 'split', rowMin: 36 }],
];
for (const [w, touch, want] of PANE) ok(J(L.paneMode(w, { touch })) === J(want), `paneMode(${w}, {touch: ${touch}}) → ${J(want)}`, L.paneMode(w, { touch }));
ok(J(L.paneMode(700)) === J({ mode: 'split', rowMin: 0 }), 'no options ⇒ not touch');
{
  const noSingle = await mutant('pane-never-single', "mode: w < NARROW_PX ? 'single' : 'split'", "mode: 'split'");
  const noHold = await mutant('pane-no-hold', 'if (!Number.isFinite(w) || w <= 0) return null;', '');
  const redS = noSingle ? PANE.filter(([w, touch, want]) => J(noSingle.paneMode(w, { touch })) !== J(want)).length : 0;
  const redH = noHold ? PANE.filter(([w, touch, want]) => J(noHold.paneMode(w, { touch })) !== J(want)).length : 0;
  ok(redS >= 3, `control: a copy with no narrow verdict keeps two panes on a phone (${redS} rows red)`);
  ok(redH >= 3, `control: a copy that judges an UNMEASURED window flips a minimized window to one pane (${redH} rows red)`);
}

console.log('④ scopeRows — the list the left pane shows');
const ROWS = [
  E('a1', { key: 'claude:s1', text: 'Deploy the API?', detail: 'staging first' }),
  E('a2', { key: 'webui:w1', text: 'Pick a colour', options: ['Teal', 'Amber'] }),
  E('n1', { key: 'accounts', text: 'Login ends in 20 h', notice: true }),
  E('a3', { key: 'claude:s2', text: 'Rename the column?', resolved: true }),
];
const ids = (r) => r.map((e) => e.item.id);
const SCOPE = [
  ['tab actions ⇒ no notice rows, order kept', { tab: 'actions' }, ['a1', 'a2', 'a3']],
  ['tab notices ⇒ only notice rows', { tab: 'notices' }, ['n1']],
  ['no tab ⇒ both', {}, ['a1', 'a2', 'n1', 'a3']],
  ['a session key', { tab: 'actions', sessionKey: 'claude:s1' }, ['a1']],
  ['a session\'s KEYS (its <backend>:<id> and its webui:<id> twin)', { tab: 'actions', sessionKey: ['claude:s1', 'webui:w1'] }, ['a1', 'a2']],
  ['an empty key list ⇒ every session', { tab: 'actions', sessionKey: [] }, ['a1', 'a2', 'a3']],
  ['a query term, case-insensitive, in the detail', { query: 'STAGING' }, ['a1']],
  ['EVERY term must match (AND)', { query: 'deploy staging' }, ['a1']],
  ['…a term that does not match drops the row', { query: 'deploy colour' }, []],
  ['an option label is searchable', { query: 'amber' }, ['a2']],
  ['whitespace only ⇒ no filter', { query: '   ' }, ['a1', 'a2', 'n1', 'a3']],
  ['resolved rows are filtered like any row', { query: 'rename' }, ['a3']],
];
for (const [label, opts, want] of SCOPE) ok(J(ids(L.scopeRows(ROWS, opts))) === J(want), `${label} → ${J(want)}`, ids(L.scopeRows(ROWS, opts)));
ok(J(ids(L.scopeRows(ROWS, { query: 'agent-words', textOf: (i) => (i.id === 'a2' ? 'the agent-words the device reads' : '') }))) === J(['a2']), 'textOf is the caller\'s words (the device\'s own t() of an i18n item, the session\'s display name)');
ok(J(L.scopeRows(null, {})) === '[]' && J(ids(L.scopeRows([null, { item: null }, ROWS[0]], {}))) === J(['a1']), 'garbage entries are skipped');
{
  const anyTerm = await mutant('scope-any-term', 'if (!terms.every((w) => hay.includes(w))) return false;', 'if (!terms.some((w) => hay.includes(w))) return false;');
  const bad = anyTerm ? SCOPE.filter(([, opts, want]) => J(ids(anyTerm.scopeRows(ROWS, opts))) !== J(want)).map(([l]) => l) : [];
  ok(bad.length === 1 && /does not match drops/.test(bad[0]), 'control: a copy that ORs the terms lets a half-matching row through', bad);
  const noScope = await mutant('scope-no-session', 'if (ks.size && !ks.has(e.item.sessionKey)) return false;', '');
  const bad2 = noScope ? SCOPE.filter(([, opts, want]) => J(ids(noScope.scopeRows(ROWS, opts))) !== J(want)).map(([l]) => l) : [];
  ok(bad2.length === 2, 'control: a copy without the session scope lists every session\'s rows under "this session"', bad2);
}

console.log('④b rowPreview — the list row\'s one-line cut of a detail (the pane has the whole text)');
const PREV = [
  ['the first non-blank line, bold marks dropped', '\n\nMARK — **please review before Friday.**\nsecond line', 160, 'MARK — please review before Friday.'],
  ['a heading mark dropped', '## The plan', 160, 'The plan'],
  ['a list mark dropped', '- first, the dry run', 160, 'first, the dry run'],
  ['a numbered mark dropped', '2) the canary', 160, 'the canary'],
  ['a quote mark and backticks dropped', '> run `npm test` first', 160, 'run npm test first'],
  ['snake_case stays words (a lone _ is not a mark)', 'rename user_id to owner_id', 160, 'rename user_id to owner_id'],
  ['__emphasis__ marks dropped at the word\'s edges', 'this is __really__ urgent', 160, 'this is really urgent'],
  ['a dunder INSIDE an identifier stays (the r0 preview printed window.xss)', '</div><img src=y onerror=window.__xss=3>', 160, '</div><img src=y onerror=window.__xss=3>'],
  ['cut at max with an ellipsis', 'x'.repeat(50), 20, 'x'.repeat(19) + '…'],
  ['nothing ⇒ empty', null, 160, ''],
];
for (const [label, d, max, want] of PREV) ok(L.rowPreview(d, max) === want, `${label} → ${J(want)}`, L.rowPreview(d, max));
{
  const raw = await mutant('preview-raw', ".replace(/\\*\\*|`/g, '')", '');
  const greedy = await mutant('preview-greedy-dunder', ".replace(/\\*\\*|`/g, '').replace(/(^|[\\s(])__(?=\\S)|(?<=\\S)__(?=[\\s).,;:!?]|$)/g, '$1')", ".replace(/\\*\\*|__|`/g, '')");
  ok(greedy && greedy.rowPreview('</div><img src=y onerror=window.__xss=3>', 160) === '</div><img src=y onerror=window.xss=3>', 'control: the first cut (every `__` dropped) mangles an identifier — the dunder row can go red');
  const bad = raw ? PREV.filter(([, d, max, want]) => raw.rowPreview(d, max) !== want).length : 0;
  ok(bad >= 2, `control: a copy that keeps the marks shows "**" / backticks in the row (${bad} rows red)`);
}

console.log('⑤ itemView — the pane as STRUCTURE (fed the REAL replyButtonState)');
const tt = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? String(p[k]) : `{${k}}`)) : s);
const T = (s, p) => '«' + tt(s, p) + '»'; // a marking t(): every word the pane shows must come through it
const chat = { live: true, mode: 'chat', remoteState: null, turn: 'idle' };
const ctx = (item, extra = {}) => ({
  t: T, words: item.text, detail: item.detail || '', name: 'my session', origin: { origin: 'agent', label: 'Agents' }, notice: item.kind === 'notice',
  reply: U.replyButtonState(item, extra.fact === undefined ? chat : extra.fact), ago: (ts) => `ago(${ts})`, expires: (ts) => (ts ? `exp(${ts})` : ''), resolvedBy: (by) => (by ? `by(${by})` : ''), ...extra,
});
const it = (x = {}) => ({ id: 'ut-1', sessionKey: 'claude:s1', text: 'Ship it?', detail: 'line one\n\nline two', urgency: 'high', kind: 'action', options: null, reply: null, status: 'open', createdAt: 100, resolvedAt: null, resolvedBy: null, ...x });
{
  const v = L.itemView(it({ options: ['Yes', 'No'] }), ctx(it({ options: ['Yes', 'No'] })));
  ok(J(v.actions) === J(['reply', 'done', 'dismiss', 'copy']) && v.reply.show && v.reply.enabled && v.reply.why === '', 'an open ask of a live chat session ⇒ Reply · Mark done · Dismiss · Copy, the box enabled', v);
  ok(J(v.options) === J([{ idx: 0, label: 'Yes' }, { idx: 1, label: 'No' }]), 'its option chips, addressed by INDEX');
  ok(J(v.meta) === J([{ kind: 'urgency', text: '«high»' }, { kind: 'age', text: 'ago(100)' }, { kind: 'origin', text: '«Agents»' }]), 'the meta words: urgency (t), age (the injected word), the producer (t of its label) — in that order', v.meta);
  ok(v.title === 'Ship it?' && v.detail === 'line one\n\nline two' && v.name === 'my session' && v.status === 'open' && v.urgency === 'high' && !v.resolved, 'title / detail / name verbatim, open, high');
  ok(v.copy === 'Ship it?\n\nline one\n\nline two', 'Copy = the title + the WHOLE detail', v.copy);
}
{
  const item = it();
  const v = L.itemView(item, ctx(item, { fact: null }));
  ok(v.reply.show && !v.reply.enabled && v.reply.why === 'Agent not running — open the session, then reply' && J(v.actions) === J(['reply', 'done', 'dismiss', 'copy']), 'a stopped session ⇒ the box is DRAWN disabled and says why (the real verdict\'s sentence)', v.reply);
  const term = L.itemView(item, ctx(item, { fact: { live: true, mode: 'terminal' } }));
  ok(!term.reply.enabled && term.reply.why === 'Terminal session — reply in its window', 'a terminal session ⇒ disabled, "reply in its window"', term.reply);
}
{
  const note = it({ sessionKey: 'accounts', kind: 'notice', expiresAt: 5000, text: 'Login ends' });
  const v = L.itemView(note, ctx(note, { origin: { origin: 'login', label: 'Login expiry' } }));
  ok(!v.reply.show && v.reply.why === '' && J(v.actions) === J(['done', 'dismiss', 'copy']) && J(v.options) === '[]', 'a notice not from a session (no_session) ⇒ no box, no chips, and NO sentence (noise on every notice)', v);
  ok(J(v.meta) === J([{ kind: 'notice', text: '«notice»' }, { kind: 'age', text: 'ago(100)' }, { kind: 'expires', text: 'exp(5000)' }, { kind: 'origin', text: '«Login expiry»' }]) && v.urgency === '', 'its meta: notice · age · expires · the producer', v.meta);
  const card = it({ action: { type: 'helper-ask', requestId: 'r1' } });
  const vc = L.itemView(card, ctx(card));
  ok(!vc.reply.show && vc.reply.why === U.replyButtonState(card, chat).why && /helper/.test(vc.reply.why), 'a helper\'s ask (card_item) ⇒ no box, and the pane SAYS where it is answered', vc.reply);
  const job = it({ jobId: 'job-1' });
  ok(/job panel/.test(L.itemView(job, ctx(job)).reply.why) && !L.itemView(job, ctx(job)).reply.show, 'a Background Work item ⇒ no box, "answer it in the job panel"');
}
{
  const done = it({ status: 'done', resolvedBy: 'reply', resolvedAt: 900, reply: { text: 'x'.repeat(300), at: 900 }, options: ['Yes', 'No'] });
  const v = L.itemView(done, ctx(done));
  ok(J(v.actions) === J(['reopen', 'copy']) && !v.reply.show && J(v.options) === '[]' && v.resolved && v.status === 'done', 'a resolved item ⇒ Reopen · Copy only; no box, no chips', v);
  ok(v.replied === 'x'.repeat(300), 'the WHOLE reply (a row shows 80 chars)', v.replied && v.replied.length);
  ok(J(v.meta) === J([{ kind: 'status', text: '«done»' }, { kind: 'by', text: 'by(reply)' }, { kind: 'age', text: 'ago(100)' }, { kind: 'resolved-at', text: 'ago(900)' }, { kind: 'origin', text: '«Agents»' }]), 'its meta: done · by your reply · filed · resolved', v.meta);
  ok(v.copy.endsWith('\n\n---\n\n«You replied: ' + 'x'.repeat(300) + '»'), 'Copy carries the reply too');
  const dis = it({ status: 'dismissed', resolvedAt: 5 });
  ok(L.itemView(dis, ctx(dis)).meta[0].text === '«dismissed»' && L.itemView(dis, ctx(dis)).status === 'dismissed', 'a dismissed item says dismissed');
  const inPlace = it();
  ok(J(L.itemView(inPlace, ctx(inPlace, { resolved: true })).actions) === J(['reopen', 'copy']), 'the ENTRY\'s resolved view wins (a row resolved in place before the item object says so)');
}
{
  const rc = it({ action: { type: 'reset-credit', accountKey: 'acct-1', sessionId: 'w1' } });
  const v = L.itemView(rc, ctx(rc, { fact: null }));
  ok(v.actions.includes('producer') && J(v.producer) === J({ type: 'reset-credit', accountKey: 'acct-1', sessionId: 'w1' }), 'a reset-credit ask ⇒ the producer\'s action (its facts, not a verb)', v);
  const unknown = it({ action: { type: 'something-new', accountKey: 'a' } });
  ok(!L.itemView(unknown, ctx(unknown)).actions.includes('producer'), 'an action type this client does not own ⇒ no button');
}
{
  const H = '<img src=x onerror=window.__xss=1>';
  const hostile = it({ text: H, detail: '</div><script>1</script>', options: ['"><svg onload=1>'] });
  const v = L.itemView(hostile, ctx(hostile, { name: '<b>n</b>' }));
  ok(v.title === H && v.detail === '</div><script>1</script>' && v.options[0].label === '"><svg onload=1>' && v.name === '<b>n</b>', 'hostile strings pass VERBATIM (structure, not markup — the painter escapes: textContent / the escaping markdown renderer)');
}
{
  // the verify round (2026-09-27): a RESOLVED item's snapshot carries a 300-char preview — the pane says so while the rest loads, and names a failure
  const prev = it({ detail: 'p'.repeat(300), detailTruncated: true });
  ok(L.itemView(it(), ctx(it())).cut === null && L.itemView(it(), ctx(it(), { detailState: 'whole' })).cut === null, 'a whole detail ⇒ no cut sentence');
  const loading = L.itemView(prev, ctx(prev, { detailState: 'loading' }));
  ok(!!loading.cut && loading.cut.state === 'loading' && loading.cut.text === '«Showing the first 300 characters — loading the rest…»', 'a previewed detail while the rest loads ⇒ "Showing the first 300 characters — loading the rest…" (through t)', loading.cut);
  const failed = L.itemView(prev, ctx(prev, { detailState: 'failed', loadError: 'server unreachable' }));
  ok(!!failed.cut && failed.cut.state === 'failed' && failed.cut.text === '«Could not load the rest of the text: server unreachable»', 'a failed load names its reason under the text (never silent)', failed.cut);
  ok(L.itemView(prev, ctx(prev, { detailState: 'garbage' })).cut === null && loading.copy.endsWith('p'.repeat(300)), 'an unknown state reads as whole; Copy carries what the pane holds (the window loads the rest before copying)');
  const noCut = await mutant('view-no-cut', "const cut = state === 'whole' ? null", "const cut = null; const _cutUnused = state === 'whole' ? null");
  ok(!!noCut && noCut.itemView(prev, ctx(prev, { detailState: 'loading' })).cut === null, 'control: a copy without the cut sentence shows 300 chars as if they were all');
}
{
  const resolvedOffers = await mutant('view-resolved-offers-done', "const actions = resolved ? ['reopen', 'copy']", "const actions = resolved ? ['reopen', 'done', 'copy']");
  const done = it({ status: 'done' });
  ok(resolvedOffers && J(resolvedOffers.itemView(done, ctx(done)).actions) !== J(['reopen', 'copy']), 'control: a copy that offers Mark done on a resolved item fails the resolved row');
  const noiseNote = await mutant('view-no-session-noise', "why: rs.code && rs.code !== 'no_session' ? String(rs.why || '') : ''", "why: String(rs.why || '')");
  const note = it({ sessionKey: 'accounts', kind: 'notice' });
  ok(noiseNote && noiseNote.itemView(note, ctx(note)).reply.why !== '', 'control: a copy without the no_session rule prints "nothing to reply to" on every notice');
}

console.log('⑥ the patched copies live outside the checkout');
for (const row of copiesCensus(M.files, M.dir, ROOT, { minCopies: 12, label: '⑥ ' })) ok(row.pass, row.name, row.detail);

console.log('⑦ wiring pins — the window really calls every rule; the doors; THE model\'s verbs');
{
  const w = read('src/lib/inbox-window.js');
  ok(/import \{ TABS, nextSelection, holdSelection, paneMode, scopeRows, rowPreview, itemView \} from '\.\/inbox-window-layout\.js';/.test(w) && /const sub = rowPreview\(model\.detailOf\(i\), 160\);/.test(w), 'inbox-window.js imports the six rules + TABS from the PURE module (the row\'s cut form is rowPreview)');
  ok(/const next = nextSelection\(st\.display, id\);/.test(w) && /if \(await model\.setStatus\(id, a === 'done' \? 'done' : 'dismissed'\)\) advance\(id\);/.test(w) && /if \(ok && wasOpen\) advance\(c\.id\);/.test(w),
    'the mail-client rule runs after THIS client\'s Mark done / Dismiss succeeded and after a reply that resolved an OPEN item');
  ok(/st\.selected = holdSelection\(st\.display, st\.selected\);/.test(w), 'every render holds the selection through holdSelection');
  ok(/const m = paneMode\(root\.clientWidth, \{ touch \}\);/.test(w) && /if \(!m\) return;/.test(w) && /root\.classList\.toggle\('iw-single', m\.mode === 'single'\)/.test(w) && /--iw-row-min/.test(w), 'the pane mode is paneMode over the MEASURED width (unmeasured ⇒ kept), a class + the touch row floor');
  ok(/scopeRows\(entries, \{ sessionKey: keys, query: st\.query, tab: st\.tab, textOf \}\)/.test(w) && /const keys = st\.scopeKey \? model\.keysFor\(st\.scopeKey\) : null;/.test(w), 'the list is scopeRows over the tab, the SESSION\'S keys (model.keysFor) and the filter');
  ok(/itemView\(it, \{/.test(w) && /reply: model\.replyState\(it\)/.test(w), 'the pane is itemView fed THE model\'s reply verdict');
  ok(/st\.layout = st\.layout \? nextLayout\(st\.layout, todos\) : openLayout\(sortGroups\(todos\.open\)\);/.test(w) && /splitNotices\(entriesFor\(layout, todos\)/.test(w) && /noticeGroups\(ns, 'all', \{ prev: st\.noticeOrder \}\)/.test(w),
    'the list is the popup\'s order: sortGroups → openLayout, nextLayout on every broadcast (resolved rows keep their slot), splitNotices, noticeGroups');
  const panel = read('src/lib/user-todos-panel.js');
  ok(/const gs = sortGroups\(todos\.open\);/.test(panel) && /layout = layout \? nextLayout\(layout, todos\) : openLayout\(gs\);/.test(panel) && !/const gs = \[\.\.\.groups\.entries\(\)\]\.sort/.test(panel), '…the SAME sortGroups the popup lays out by (moved out of the panel — one implementation)');
  ok(/reconcileKeyed\(box, entries, \{/.test(w) && /reconcileKeyed\(container, entries, \{/.test(panel) && /export function reconcileKeyed\(/.test(read('src/lib/user-todos-row.js')), 'rows are keyed and patched in place by THE reconciler both surfaces use');
  // the verbs: every one THE model's (the same routes the popup calls) — the window has no fetch of its own
  ok(/model\.setStatus\(id, 'open'\)/.test(w) && /model\.postReply\(c\.id, body\)/.test(w) && /model\.runAction\(it\)/.test(w) && /model\.jump\(it\.sessionKey, it\)/.test(w) && !/fetchJson|fetch\(/.test(w),
    'every verb is THE model\'s (setStatus / postReply / runAction / jump); the window holds no fetch of its own');
  const acts = read('src/lib/user-todos-actions.js');
  ok(/export function inboxModel\(app\) \{\s*if \(app\._inboxModel\) return app\._inboxModel;/.test(acts) && /const model = inboxModel\(app\);/.test(panel) && /const model = inboxModel\(app\);/.test(w), 'ONE model per app, memoized — the popup and the window share it');
  ok(/model\.on\('todos', \(\) => render\(\), \{ signal \}\)/.test(w) && /model\.on\('live', \(\) => \{/.test(w) && /model\.on\('status', \(\) => patchBoardPane\(\), \{ signal \}\)/.test(w), 'the window follows the three broadcasts (todos / live / status) and unsubscribes with its own listener signal');
  // the reply box keeps its node across broadcasts; Enter / Ctrl+Enter send, Shift+Enter is a newline, Esc returns to the list
  ok(/if \(!st\.cur \|\| st\.cur\.id !== id\) \{/.test(w) && /if \(e\.key === 'Enter' && !e\.shiftKey && !e\.isComposing && e\.keyCode !== 229\) \{ e\.preventDefault\(\); sendReply\(ta\.value\); \}/.test(w)
    && /if \(e\.key === 'Escape' && !e\.isComposing\) \{/.test(w) && /e\.key === 'ArrowDown' \|\| e\.key === 'j'/.test(w) && /e\.key === 'ArrowUp' \|\| e\.key === 'k'/.test(w), 'the pane is rebuilt only when the selected id changes (a typed reply survives); the keys: ↑/↓ j/k · Enter · Esc · (Ctrl/Cmd+)Enter');
  // XSS: item strings are TEXT; markdown through the escaping renderer + DOMPurify; the only innerHTML writes are those two
  const inner = [...w.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  ok(J(inner) === J(['DOMPurify.sanitize(inline ? md.parseInline(s) : md.parse(s))', 'icon']) && /const md = new Marked\(\{ gfm: true, breaks: true, renderer: \{ html\(h\) \{ return escHtml\(/.test(w) && /b\.append\(mk\('span', 'iw-act-label', label\)\)/.test(w),
    'XSS: exactly two innerHTML writes — the sanitized markdown (raw HTML ESCAPED by the renderer first) and a UI_ICONS constant; every other item string is textContent', inner);
  ok(/for \(const a of el\.querySelectorAll\('a\[href\]'\)\) \{ a\.target = '_blank'; a\.rel = 'noopener noreferrer'; \}/.test(w), 'a link in an item opens beside the workspace, never in place of it');
  // the window type + the doors
  ok(/registerWindowType\(\{\s*type: 'inbox', label: 'For you', singleton: true, icon: ICON,\s*action: 'openInbox',/.test(w) && /app\.openInbox\(\{ itemId: spec && spec\.itemId, sessionKey: spec && spec\.sessionKey, syncId \}\)/.test(w), "registered: type 'inbox', singleton, openSpec action 'openInbox' replayed with its itemId / sessionKey / syncId");
  ok(/app\.wm\.revealWindow\(id, \{ replay: !!syncId \}\);\s*if \(!syncId && w\._inbox\) w\._inbox\.show\(\{ itemId, sessionKey \}\);/.test(w), 'an open window is REVEALED (a replay only raises) and re-pointed by a user\'s door, never by a replay');
  ok(/openInbox\(opts\) \{ return openInboxWindow\(this, opts \|\| \{\}\); \}/.test(read('src/lib/app.js')), 'app.openInbox is THE door (app.js)');
  ok(/if \(e\.target\.closest\('\.ut-tabs > \.ut-open-win'\)\) \{ hidePopup\(\); app\.openInbox\(\); return; \}/.test(panel), 'door (a): the popup\'s ⤢ opens the whole inbox');
  ok(/else \{ hidePopup\(\); app\.openInbox\(\{ itemId: rec\.id \}\); \}/.test(panel) && /app\.openInbox\(\{ itemId: rec\.id, sessionKey: rec\.sessionKey \}\)/.test(panel), 'door (b): a row\'s ⤢ opens the window ON that item (the mini inbox\'s scoped to its session)');
  ok(/if \(e\.target\.closest\('\.ut-mini-head > \.ut-open-win'\)\) \{ pop\.remove\(\); app\.openInbox\(\{ sessionKey: primaryKey\(mini\?\.keys \|\| keys\) \}\); return; \}/.test(panel), 'door (c): the mini inbox\'s head ⤢ opens the window scoped to that session');
  ok(/menu: 'gear', parent: 'comm', order: 5, icon: ICON,/.test(w) && /label: \(\) => t\('For you…'\),\s*run: \(c\) => c\.app\.openInbox\(\),/.test(w), 'door (d): ⚙ Communication ▸ For you…');
  // the viewer modal is retired — one door
  const css = read('public/style.css');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1'); // comments may NAME the retired viewer
  ok(!/openViewer|createModalShell|ut-viewer/.test(code(panel)) && !/\.ut-viewer/.test(css) && !/Open in viewer \(copyable, rendered\)/.test(read('src/lib/user-todos-row.js') + read('src/lib/i18n-zh.js') + read('src/lib/i18n-ja.js')), 'the read-only viewer modal is gone (no openViewer / #ut-viewer / .ut-viewer-* CSS / its title key)');
  // the verify round (2026-09-27): the dead tail head, the scoped empty hint, the scope candidate, a navigation re-sorts, an empty Reply focuses the box, a previewed detail loads with its sentence
  ok(/if \(st\.tailOpen && st\.selected && st\.tailIds\.has\(st\.selected\)\) st\.selected = null;/.test(w) && /st\.tailIds = new Set\(tailRowsIn\.map\(\(e\) => e\.item\.id\)\);/.test(w), 'closing the resolved tail while one of its rows is selected moves the selection off it (the head was dead: render re-opened the tail around the selection)');
  ok(/: st\.scopeKey \? \(st\.tab === 'notices' \? t\('No notices for this session\.'\) : t\('No open items for this session\.'\)\)/.test(w), 'under a session scope the empty hint names the scope ("Nothing needs you right now" would be a lie)');
  ok(/const selKey = sel && typeof sel\.sessionKey === 'string' && \(sel\.sessionKey\.includes\(':'\) \|\| sel\.sessionKey === 'jobs'\) \? sel\.sessionKey : null;/.test(w) && /const cand = st\.scopeKey \|\| selKey;/.test(w), 'the scope candidate is a SESSION (or Background Work) — never an instance-level `accounts` notice\'s first name');
  ok(/st\.tab = tb\.dataset\.tab; st\.noticeOrder = null; st\.layout = null; render\(\);/.test(w) && /st\.scopeKey = sb\.dataset\.scope === 'all' \? null : \(sb\.dataset\.key \|\| null\); st\.layout = null; render\(\);/.test(w) && /if \(id\) st\.pendingItem = id;\s*\n\s*st\.layout = null;/.test(w), 'a tab / scope switch and every door re-sort the list (a navigation is a new view; the append-only slots hold between navigations)');
  ok(/if \(!String\(txt\)\.trim\(\)\) \{ if \(st\.cur && !st\.cur\.ta\.disabled\) st\.cur\.ta\.focus\(\); return; \}/.test(w), 'Reply with an empty box puts the cursor in the box instead of doing nothing');
  ok(/if \(it\.detailTruncated\) loadDetail\(id\);/.test(w) && /model\.ensureDetail\(id\)\.then\(\(\{ error \}\) => \{ if \(error\) \{ st\.loadErr = \{ id, why: error \};/.test(w) && /detailState: !it\.detailTruncated \? 'whole' : \(st\.loadErr && st\.loadErr\.id === it\.id \? 'failed' : 'loading'\)/.test(w) && /const \{ error \} = await model\.ensureDetail\(id\);/.test(w) && /c\.cutLine\.textContent !== cutTxt/.test(w), 'a previewed detail (a resolved item\'s snapshot) is loaded whole through the model when shown and before Copy; the pane says loading / the failure by name (textContent)');
  ok(/\.iw-detail-cut \{[^}]*var\(--text-dim\)/.test(css) && /\.iw-detail-cut\[data-state="failed"\] \{[^}]*var\(--red, #e55\)/.test(css), 'the cut line uses theme vars');
  // i18n: every new word has zh + ja
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const NEW = ['For you…', 'Open as a window', "Open this session's inbox as a window", 'Open in the For-you window', 'Only this session: {name}', '{n} options', 'Mark done', 'inbox::Dismiss', 'inbox::Actions', 'Copy the whole item', 'Select an item to read it here.', 'No notices right now.',
    'No open items for this session.', 'No notices for this session.', 'Showing the first {n} characters — loading the rest…', 'Could not load the rest of the text: {why}'];
  const missing = NEW.filter((k) => !zh.includes('  ' + J(k) + ':') || !ja.includes('  ' + J(k) + ':'));
  ok(!missing.length, `every new word (${NEW.length}) has a zh + a ja entry`, missing);
  ok(/tc\('inbox', 'Actions'\)/.test(w) && /tc\('inbox', 'Dismiss'\)/.test(w), '"Actions" / "Dismiss" are contexted (tc) — the plain keys mean other things (操作 / 关闭)');
  ok(/\{ name: 'test-inbox-window-model', tier: 'fast'/.test(read('scripts/ci.mjs')), 'ci.mjs carries this suite in the fast tier');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
