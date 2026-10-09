// THE DELIVERABLE CARD + THE ARTIFACTS LIST — the DOM half (lane artifacts-model; the rows are src/artifacts.js, the
// server's registry src/server/artifact-registry.js). The server sends the BLOCK (cardBlock: the row's facts, never
// markup); the words are t() over the PURE `cardFacts`; every string lands through textContent (a path is the agent's).
// ONE element per deliverable, PATCHED IN PLACE (the live-card rule: a card re-created per update blinks): a later
// write / edit rewrites its keyed children's text. One click = open the file in its kind's viewer BESIDE the chat
// (`from`: the same door a Cmd+click on a path takes — no Cmd needed).
import { t, resolveLang } from './i18n.js';
import { getFileIcon } from './file-types.js';
import { agoText } from './user-todos-row.js';
import { cardFacts, kindWord } from '../artifacts.js';
import { UI_ICONS } from './icons.js';
import { absUrl, showContextMenu, copyText } from './utils.js';
import { replayOpenSpec } from './window-types.js'; // lane artifacts-services-url: "Show in Ports" = the Ports window's own open action
import { listPlan, rowsOfView, rowWords, countLine, markOf, viewFrom, GROUPS, SORTS } from './artifacts-list-model.js'; // lane artifacts-list-scale: the list's PURE model (the popover and the window share it)

const lang = () => { try { const l = resolveLang(); return l === 'zh' || l === 'ja' ? l : 'en'; } catch { return 'en'; } }; // the house language (i18n.js) — <html lang> is never set (the real-Opus zh run read "Document")
const div = (cls) => { const n = document.createElement('div'); n.className = cls; return n; };
const span = (cls) => { const n = document.createElement('span'); n.className = cls; return n; };

/** "Edited 3 times · 2min ago · last by you" (the card's meta line and the list row's words). */
/** lane artifacts-services-url: a service row's link = the ROW's url (the server's ladder, src/artifacts.js serviceLink:
 *  the port's published forward, else this instance's /proxy/) — the client never builds a host:port; a relative proxy
 *  url resolves through absUrl (the instance URL when one is mapped), never location.origin. */
export const serviceHref = (b) => absUrl((b && b.url) || '');
/** The Web view's open: a proxied row opens its TARGET in proxy mode (the Web view loads /proxy/<target>), else its url. */
export const serviceOpenSpec = (b) => (b && b.via === 'proxy' && b.target ? { url: b.target, proxy: true } : { url: serviceHref(b), proxy: false });
/** The small word beside the url: how the link reaches the service. */
export const serviceViaText = (b) => (b && b.via === 'published' ? t('Published') : b && b.via === 'proxy' ? t('Through this VibeSpace') : t('Only on its machine'));
/** ⋯ "Show in Ports": the Ports window (its forward row — data-forward-id — scrolled to and flashed once it renders; a
 *  port not yet forwarded is in its scan list, where the existing Forward / Publish acts are). */
export function showInPorts(app, forwardId) {
  if (!app) return;
  replayOpenSpec(app, { action: 'openPorts' });
  let tries = 0;
  const find = () => {
    const r = forwardId && document.querySelector(`.rail-panel-ports .ports-row[data-forward-id="${CSS.escape(String(forwardId))}"]`);
    if (r) { r.scrollIntoView({ block: 'nearest' }); r.classList.add('ports-row-flash'); setTimeout(() => r.classList.remove('ports-row-flash'), 1600); }
    else if (forwardId && ++tries < 30) setTimeout(find, 100); // the panel paints after its /api/port-forwards read
  };
  find();
}
const stamp = (ts) => { try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export function artifactMetaText(b) {
  const f = cardFacts(b);
  if (f.kind === 'service') return f.state === 'stopped' ? t('Stopped at {time}', { time: stamp(f.stoppedAt) }) : `${t('Running')} · ${t('since {ago}', { ago: agoText(f.since || f.lastAt, t) })}`;
  const upload = f.kind === 'upload' && f.byUser && !f.changes; // lane artifacts-registries: the registries' rows say their store's fact
  const parts = [f.state === 'unpublished' ? t('Unpublished') : f.state === 'published' ? t('Published') : upload ? t('Attached by you') : f.changes ? t('Changed {n} times', { n: f.changes }) : t('Written by the agent')];
  if (f.lastAt) parts.push(agoText(f.lastAt, t));
  if (f.byUser && !upload) parts.push(t('last by you'));
  // lane artifacts-handover: WHO made it for this conversation, and whom the helper handed it to
  if (f.via && f.via.kind === 'handover') parts.unshift(t('Handed over by {name}', { name: f.via.from.name || f.via.from.cid }));
  else if (f.via && f.via.kind === 'subagent') parts.push(t('By subagent {name}', { name: f.via.name }));
  if (f.handedTo.length) parts.push(t('Handed to {names}', { names: f.handedTo.join(', ') }));
  return parts.join(' · ');
}

/** ⋯ on a service: copy the link / open it in a new tab / show it in Ports / copy the machine-local address / show its job. */
const serviceItems = (b, { showJob = null, showPorts = null } = {}) => [
  { label: t('Copy URL'), action: () => copyText(serviceHref(b)) },
  { label: t('Open in a new tab'), action: () => window.open(serviceHref(b), '_blank', 'noopener') },
  { label: t('Show in Ports'), action: () => showPorts && showPorts(b.forwardId || null) },
  { label: t('Copy the machine-local address'), action: () => copyText(b.localUrl || '') },
  { label: t('Show the job'), action: () => showJob && showJob(b.jobId) },
];
function serviceMenu(e, b, opts) {
  e.preventDefault(); e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.left, r.bottom, serviceItems(b, opts));
}
export function renderArtifactCard(msg, { open = null, showJob = null, showPorts = null } = {}) {
  const el0 = div('chat-msg chat-msg-system chat-vs-notice chat-artifact-card');
  el0.tabIndex = 0;
  el0.setAttribute('role', 'button');
  const head = div('chat-vs-notice-head');
  const ic = span('chat-artifact-ic'); ic.setAttribute('aria-hidden', 'true');
  head.append(ic, span('chat-vs-notice-title chat-artifact-name'), span('chat-artifact-kind chat-status-dim'));
  const service = (msg && msg.content && msg.content[0] && msg.content[0].kind) === 'service';
  const where = div(service ? 'chat-artifact-path chat-artifact-url chat-status-dim' : 'chat-artifact-path chat-status-dim'); // a URL is not a path: LTR, END-truncated (chat.css)
  if (service) where.append(span('chat-artifact-href'), span('chat-artifact-via'));
  el0.append(head, where, div('chat-artifact-meta chat-status-dim'));
  if (service) {
    const more = document.createElement('button'); more.type = 'button'; more.className = 'chat-artifact-more'; more.textContent = '⋯'; more.title = t('More');
    more.addEventListener('click', (e) => serviceMenu(e, el0._rawMsg.content[0], { showJob, showPorts }));
    more.addEventListener('keydown', (e) => e.stopPropagation());
    head.appendChild(more);
  }
  const go = (e) => { e.preventDefault(); e.stopPropagation(); const b = el0._rawMsg && el0._rawMsg.content && el0._rawMsg.content[0]; if (b && open) open(b); };
  el0.addEventListener('click', go);
  el0.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  patchArtifactCard(el0, msg);
  return el0;
}

/** THE PATCH (every later write / edit): the same element, its keyed children's text. */
export function patchArtifactCard(el0, msg) {
  const b = msg && msg.content && msg.content[0];
  if (!el0 || !b) return;
  el0._rawMsg = msg;
  el0.dataset.key = String(b.key || '');
  el0.dataset.kind = String(b.kind || 'other');
  if (b.kind === 'service') el0.dataset.state = b.state || 'running'; // stopped ⇒ greyed (chat.css)
  const set = (sel, v) => { const n = el0.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  const ic = el0.querySelector('.chat-artifact-ic');
  if (ic && ic.dataset.name !== b.name) { ic.innerHTML = (b.kind === 'service' ? UI_ICONS.globe : getFileIcon(b.name || '')) || ''; ic.dataset.name = b.name || ''; } // the icon table's own SVG (trusted), keyed by name
  set('.chat-artifact-name', b.name || '');
  set('.chat-artifact-kind', kindWord(b.kind, lang()));
  if (b.kind === 'service') { set('.chat-artifact-href', serviceHref(b)); set('.chat-artifact-via', serviceViaText(b)); } // lane artifacts-services-url: the url as it reads, LTR (the .223 rtl box painted its trailing "/" first: "/http://…")
  else set('.chat-artifact-path', b.path ? '\u200e' + b.path : ''); // LRM: the row is direction:rtl (front-truncate) — without it the path's leading "/" is drawn at its END (the real-Opus e2e shot)
  set('.chat-artifact-meta', artifactMetaText(b));
  el0.title = b.kind === 'service' ? `${t('Open {url} in the Web view', { url: serviceHref(b) })} · ${serviceViaText(b)}${b.publishedBy ? ' · ' + b.publishedBy : ''}` : t('Open {name} beside the chat', { name: b.name || '' });
}

// ── THE LIST AT SCALE (lane artifacts-list-scale, design 021 E1–E9; owner 2026-10-07: 43 deliverables + 174 code rows ran
// off the viewport in ONE order). The chip's popover is BOUNDED (chat.css .chat-artifacts-panel) with a sticky top bar:
// the filter (`/` focuses it, Esc clears then closes), group ▾ (kind · helper · day) and sort ▾ (changed · name · edits)
// remembered on this device (`vs-artifacts-view`, the vs-doc-comments precedent), the count line; then the 最近 band and
// the collapsible group heads (code collapsed by default). Every row is KEYED and PATCHED IN PLACE — a filter keystroke,
// a group switch or a live refresh moves / inserts / removes row nodes, never rebuilds one. The ⤢ opens the Artifacts
// WINDOW (src/lib/artifacts-window.js) — the same PURE model (src/lib/artifacts-list-model.js) at full size.
const VIEW_KEY = 'vs-artifacts-view';
export function loadArtifactsView() { try { return viewFrom(JSON.parse(localStorage.getItem(VIEW_KEY) || 'null')); } catch { return viewFrom(null); } }
export function saveArtifactsView(v) { try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewFrom(v))); } catch { } }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUP_WORDS = { kind: 'By kind', helper: 'By helper', day: 'By day' };
const SORT_WORDS = { changed: 'Recently changed', name: 'Name', edits: 'Times changed' };
export const artifactRowIcon = (b) => (b.kind === 'service' ? UI_ICONS.globe : getFileIcon(b.name || '')) || '';
/** The row's words through the model (E6): {kind, helper, edits, ago}. */
export const artifactRowWords = (b) => rowWords(b, { t, kindWord: (k) => kindWord(k, lang()), ago: (ts) => agoText(ts, t) });
/** The name with the filter's match in ONE <mark> — text nodes only (a name is the agent's; never markup). */
export function setArtifactName(el, name, q) {
  const m = markOf(name, q), key = m ? m.join(':') : '';
  if (el._afName === name && el._afMark === key) return;
  el._afName = name; el._afMark = key;
  if (!m) { el.textContent = name; return; }
  el.textContent = '';
  const mk = document.createElement('mark'); mk.textContent = name.slice(m[0], m[1]);
  el.append(document.createTextNode(name.slice(0, m[0])), mk, document.createTextNode(name.slice(m[1])));
}
/** Open a helper conversation by its id (a hand-over's `from.cid`): live ⇒ attach, else the read-only view. */
function openConversation(app, cid, name) {
  const s = (app.sidebar?._allSessions || []).find((x) => (x.backendSessionId || x.claudeSessionId || x.sessionId) === cid) || null;
  if (s && s.webuiId) app.attachSession(s.webuiId, s.webuiName || name, s.cwd, { mode: s.webuiMode, backend: s.backend || 'claude', backendSessionId: cid });
  else if (app.viewSession) app.viewSession(cid, (s && s.cwd) || '', name || cid.slice(0, 8), { backend: (s && s.backend) || 'claude', backendSessionId: cid });
}
/** THE ⋯ (E7): open beside · show in Files · copy path · (hand-over) open the helper's conversation; a service keeps its
 *  five. "Open the helper's record" is ABSENT: a subagent row carries only the helper's name (src/artifacts.js viaOf), no
 *  door to its transcript — absent, never greyed (spec E7). */
export function artifactRowMenu(b, { onOpen = null, app = null } = {}) {
  if (b.kind === 'service') return serviceItems(b, { showJob: (id) => app?.openJobs?.({ focusJobId: id }), showPorts: (fid) => showInPorts(app, fid) });
  const dir = String(b.path || '').replace(/\/[^/]*$/, '') || '/';
  const items = [{ label: t('Open beside'), action: () => onOpen && onOpen(b) }];
  if (app && app.openFileExplorer && b.path) items.push({ label: t('Show in Files'), action: () => app.openFileExplorer(dir, { host: b.host || undefined }) });
  items.push({ label: t('Copy path'), action: () => copyText(b.path || '') });
  const v = b.via;
  if (app && v && v.kind === 'handover' && v.from && v.from.cid) items.push({ separator: true }, { label: t("Open {name}'s conversation", { name: v.from.name || v.from.cid.slice(0, 8) }), action: () => openConversation(app, v.from.cid, v.from.name || '') });
  return items;
}
function rowMenuAt(e, b, opts) {
  e.preventDefault(); e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.left, r.bottom, artifactRowMenu(b, opts));
}
/** ONE row (E6), keyed; `patchArtifactRow` rewrites only what changed. */
function artifactRow(b, opts) {
  const it = div('chat-status-dropdown-item chat-artifact-row');
  it.tabIndex = -1; it.setAttribute('role', 'option');
  const ic = span('chat-artifact-ic'); ic.setAttribute('aria-hidden', 'true');
  const body = div('af-body'); body.append(span('chat-artifact-name'), div('chat-status-dim chat-artifact-meta'));
  const right = div('af-right'); const ago = span('af-ago chat-status-dim');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'chat-artifact-more'; more.innerHTML = UI_ICONS.more || ''; more.title = t('More'); more.setAttribute('aria-label', t('More'));
  more.addEventListener('click', (e) => rowMenuAt(e, it._afRow, opts));
  right.append(ago, more);
  it.append(ic, body, right);
  it.addEventListener('click', (ev) => { ev.stopPropagation(); if (opts.close) opts.close(); if (opts.onOpen) opts.onOpen(it._afRow); });
  return it;
}
export function patchArtifactRow(it, b, q) {
  it._afRow = b;
  if (it.dataset.key !== b.key) it.dataset.key = b.key;
  if (it.dataset.kind !== b.kind) it.dataset.kind = b.kind;
  if (b.kind === 'service') { const s = b.state || 'running'; if (it.dataset.state !== s) it.dataset.state = s; } else if (it.dataset.state) delete it.dataset.state;
  const ic = it.querySelector('.chat-artifact-ic');
  if (ic && ic.dataset.name !== b.name) { ic.innerHTML = artifactRowIcon(b); ic.dataset.name = b.name || ''; } // the icon table's own SVG (trusted), keyed by name
  setArtifactName(it.querySelector('.chat-artifact-name'), b.name || '', q);
  const w = artifactRowWords(b);
  const set = (sel, v) => { const n = it.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  set('.chat-artifact-meta', [w.kind, w.helper, w.edits].filter(Boolean).join(' · '));
  set('.af-ago', w.ago);
  const title = [b.kind === 'service' ? serviceHref(b) : '\u200e' + (b.path || ''), w.helper].filter(Boolean).join('\n'); // the path whole (the meta line ellipsizes a long helper)
  if (it.title !== title) it.title = title;
}
const button = (cls, title) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; };
/** The menu of a ▾ (group / sort): the current one checked (the house chan-menu-check). */
function pickMenu(e, words, cur, pick) {
  e.preventDefault(); e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.left, r.bottom, Object.keys(words).map((k) => ({ labelHtml: `<span class="chan-menu-check${k === cur ? ' chan-menu-check-on' : ''}">${k === cur ? UI_ICONS.check || '' : ''}</span>${esc(t(words[k]))}`, label: t(words[k]), action: () => pick(k) })));
}
const dayWords = (d) => {
  const at = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  return !d ? t('No date') : d === at(0) ? t('Today') : d === at(1) ? t('Yesterday') : d;
};
/** A group head's words: the kind's word · the helper (the main conversation) · the day. */
export const artifactHeadWords = (h) => (h.group === 'recent' ? t('Recent') : h.group === 'kind' ? kindWord(h.label, lang()) : h.group === 'helper' ? (h.label || t('Main conversation')) : dayWords(h.label));

/** THE POPOVER (`renderArtifactList(box, v, {onOpen, close, app, onExpand})` keeps its signature): mounts the bounded
 *  list into `box` and returns its controller {update(v)} (also `box._afList` — the chip's live refresh patches it). */
export function renderArtifactList(box, v, { onOpen = null, close = null, app = null, onExpand = null } = {}) {
  const st = { v, q: '', view: loadArtifactsView() };
  const opts = { onOpen, close, app };
  box.classList.add('chat-artifacts-panel');
  const top = div('af-top');
  const search = div('af-search');
  const sic = span('af-search-ic'); sic.setAttribute('aria-hidden', 'true'); sic.innerHTML = UI_ICONS.search || '';
  const input = document.createElement('input'); input.type = 'search'; input.className = 'af-filter'; input.placeholder = t('Filter: name / path / helper…'); input.setAttribute('aria-label', t('Filter: name / path / helper…')); input.maxLength = 80; input.spellcheck = false;
  const key = span('af-key'); key.textContent = '/';
  search.append(sic, input, key);
  if (onExpand) { const ex = button('af-expand', t('Open in a window')); ex.innerHTML = UI_ICONS.expand || ''; ex.addEventListener('click', (e) => { e.stopPropagation(); if (close) close(); onExpand(); }); search.appendChild(ex); }
  const ctl = div('af-ctl');
  const gBtn = button('af-pick af-group', t('Group by')), sBtn = button('af-pick af-sort', t('Sort by'));
  const count = span('af-count chat-status-dim');
  ctl.append(gBtn, sBtn, count);
  top.append(search, ctl);
  // lane artifacts-auto-open-quiet: the switch WHERE the automatic open happens — the same setting as Settings → Chat
  // (artifacts.autoOpenDocs, live-applied and synced like every setting); re-read on every draw
  let auto = null;
  if (app && app.settings) {
    auto = document.createElement('label'); auto.className = 'af-auto chat-status-dim';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'af-auto-cb';
    cb.addEventListener('change', (e) => { e.stopPropagation(); app.settings.set('artifacts.autoOpenDocs', cb.checked); });
    auto.addEventListener('click', (e) => e.stopPropagation());
    const word = span('af-auto-word'); word.textContent = t('Open new documents automatically');
    auto.append(cb, word);
    top.appendChild(auto);
  }
  const list = div('af-list'); list.setAttribute('role', 'listbox');
  box.append(top, list);
  const rowEls = new Map(), headEls = new Map();
  const notes = { empty: div('chat-status-dropdown-note af-empty'), none: div('chat-status-dropdown-note af-none'), full: div('chat-status-dropdown-note af-full') };
  notes.empty.textContent = t('No matching artifacts');
  notes.none.textContent = t('No documents yet — only code.');
  notes.full.textContent = t('The list keeps the newest {n} files.', { n: 500 });
  const pickLabel = (b, word) => { const want = `${t(word)}\u0001`; if (b._afWord === want) return; b._afWord = want; b.textContent = ''; const s = span('af-pick-word'); s.textContent = t(word); const c = span('af-pick-ic'); c.setAttribute('aria-hidden', 'true'); c.innerHTML = UI_ICONS.chevronDown || ''; b.append(s, c); };
  const save = () => saveArtifactsView(st.view);
  const toggle = (k) => { const c = st.view.collapsed[st.view.group]; const i = c.indexOf(k); if (i >= 0) c.splice(i, 1); else c.push(k); save(); draw(); };
  const headEl = (s) => {
    let h = headEls.get(s.key);
    if (!h) {
      h = div('chat-artifact-head chat-status-dim' + (s.key === 'recent' ? ' af-head-recent' : ''));
      h.dataset.group = s.key; h.setAttribute('role', 'button'); h.tabIndex = -1;
      const ic = span('af-head-ic'); ic.setAttribute('aria-hidden', 'true'); if (s.key === 'recent') ic.innerHTML = UI_ICONS.clock || '';
      h.append(ic, span('af-head-word'), span('af-head-chev'));
      h.addEventListener('click', (e) => { e.stopPropagation(); if (!st.q) toggle(s.key); });
      headEls.set(s.key, h);
    }
    const words = `${artifactHeadWords(s.head)} · ${s.head.count}`;
    const w = h.querySelector('.af-head-word'); if (w.textContent !== words) w.textContent = words;
    const chev = s.open ? 'open' : 'shut';
    if (h.dataset.fold !== chev) { h.dataset.fold = chev; h.setAttribute('aria-expanded', String(s.open)); h.querySelector('.af-head-chev').innerHTML = (s.open ? UI_ICONS.chevronDown : UI_ICONS.chevronRight) || ''; }
    return h;
  };
  const rowEl = (section, b, q) => {
    const k = section + '\u0001' + b.key;
    let it = rowEls.get(k);
    if (!it) { it = artifactRow(b, opts); rowEls.set(k, it); }
    patchArtifactRow(it, b, q);
    return it;
  };
  function draw() {
    const plan = listPlan(st.v, { q: st.q, group: st.view.group, sort: st.view.sort, collapsed: st.view.collapsed[st.view.group] });
    const want = [];
    if (!st.q && !(st.v && Array.isArray(st.v.items) && st.v.items.length)) want.push(notes.none);
    for (const s of plan.sections) {
      want.push(headEl(s));
      if (s.open) for (const b of s.rows) want.push(rowEl(s.key === 'recent' ? 'r' : 'g', b, plan.q));
    }
    if (plan.empty) want.push(notes.empty);
    if (st.v && st.v.full) want.push(notes.full); // the eviction note stays LAST
    let cur = list.firstChild; // THE PATCH: reuse, move, insert, remove — never a rebuild
    for (const n of want) { if (n === cur) { cur = cur.nextSibling; continue; } list.insertBefore(n, cur); }
    while (cur) { const nx = cur.nextSibling; cur.remove(); cur = nx; }
    const c = countLine(plan.count, t); if (count.textContent !== c) count.textContent = c;
    pickLabel(gBtn, GROUP_WORDS[st.view.group]); pickLabel(sBtn, SORT_WORDS[st.view.sort]);
    if (auto) { const on = (app.settings.get('artifacts.autoOpenDocs') ?? true) !== false; const cb = auto.firstChild; if (cb.checked !== on) cb.checked = on; }
  }
  gBtn.addEventListener('click', (e) => pickMenu(e, GROUP_WORDS, st.view.group, (g) => { if (GROUPS.includes(g)) { st.view.group = g; save(); draw(); } }));
  sBtn.addEventListener('click', (e) => pickMenu(e, SORT_WORDS, st.view.sort, (s) => { if (SORTS.includes(s)) { st.view.sort = s; save(); draw(); } }));
  input.addEventListener('input', () => { st.q = input.value; draw(); list.scrollTop = 0; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.isComposing && input.value) { e.stopPropagation(); input.value = ''; st.q = ''; draw(); } // Esc clears; the next Esc closes (the data-popover protocol)
    else if (e.key === 'ArrowDown') { e.preventDefault(); const r = list.querySelector('.chat-artifact-row'); if (r) r.focus(); }
  });
  box.addEventListener('keydown', (e) => {
    if (e.target === input) return;
    if (e.key === '/') { e.preventDefault(); input.focus(); return; }
    const rows = [...list.querySelectorAll('.chat-artifact-row')], i = rows.indexOf(e.target);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); if (i === 0 && e.key === 'ArrowUp') input.focus(); }
    else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); rows[i].click(); }
  });
  draw();
  const ctrl = {
    update(nv) { st.v = nv; const live = new Set(rowsOfView(nv).map((b) => b.key)); for (const [k, el] of rowEls) if (!live.has(k.slice(k.indexOf('\u0001') + 1))) { rowEls.delete(k); el.remove(); } draw(); },
    draw, state: st, input, list,
  };
  box._afList = ctrl;
  return ctrl;
}

// ── THE LIVE RELAY (the ⤢ window follows the conversation): every chat view's Artifacts refresh (the chip's path — a
// card's birth / patch, an attach) hands its fresh view here; an open Artifacts window of that conversation listens. ──
const AF_LISTENERS = new Map(); // sessionId → Set(fn)
export function publishArtifacts(sessionId, v) { for (const fn of [...(AF_LISTENERS.get(sessionId) || [])]) { try { fn(v); } catch { } } }
export function onArtifacts(sessionId, fn) {
  if (!AF_LISTENERS.has(sessionId)) AF_LISTENERS.set(sessionId, new Set());
  AF_LISTENERS.get(sessionId).add(fn);
  return () => { const s = AF_LISTENERS.get(sessionId); if (s) { s.delete(fn); if (!s.size) AF_LISTENERS.delete(sessionId); } };
}
