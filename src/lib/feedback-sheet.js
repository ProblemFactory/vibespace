// AGENT FEEDBACK — THE OWNER'S SHEET (lane agent-feedback, the owner 2026-10-18: "当然也要在界面里有一个地方能让我看到这些
// 被 report 的结果"). ⚙ System ▸ Agent feedback… wears the OPEN count; it opens a modal sheet listing every report an agent
// sent with `vibespace-feedback`, newest first: time · the conversation (+ its Task Group) · kind / about chips · ×count ·
// the text (two lines; a click opens the rest) · Mark handled / Reopen; a filter Open / Handled / All. The rows come from
// the `feedback` StateSync store (src/server/feedback-store.js mirrors every change into it) as KEYED rows (data-id)
// patched in place on each change — two windows see one report live, an expanded row stays expanded. A Mark handled
// applies the server's answer at once (never waits for the broadcast echo). Every string an agent wrote is textContent,
// never HTML (the XSS law): the sheet builds nodes, it never assigns markup.
import { registerMenuItem } from './contributions.js';
import { createModalShell, getStateSync, showToast } from './utils.js';
import { SHEET_ROOTS } from './form-yield.js'; // PURE (lane dialog-yield r2): the ONE dialog predicate set
import { t, deviceLocale } from './i18n.js';
import { MAINTAINER_BY } from '../feedback-model.js';   // PURE — lane fleet-feedback-marks: a mark the instance's maintainer key made

const STORE = 'feedback';
const ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/><path d="M8 5.5v2.2M8 9.2v.1"/></svg>';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const newest = (a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0) || (Number(b.at) || 0) - (Number(a.at) || 0);
const whenText = (at) => { try { return new Date(Number(at) || 0).toLocaleString(deviceLocale(), { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return new Date(Number(at) || 0).toISOString(); } };

/** the reports this window knows (id → row): the store's copy, plus an answer applied before its echo arrives */
const view = new Map();
const watchers = new Set();   // (id, row|null) — the open sheet and the gear row's count
let loading = null, listening = false;
function adopt(id, row) {
  if (row && typeof row === 'object' && row.id) view.set(id, row); else view.delete(id);
  for (const w of [...watchers]) { try { w(id, view.get(id) || null); } catch (e) { console.warn('[feedback] a watcher threw', e); } }
}
/** load the store (a gear-menu open, the sheet): resolves true when this window holds the server's reports. A failed
 *  first load is asked again next time — the reconnect's resync may have brought the rows in since (the listener stays) */
function ensureLoaded() {
  if (loading) return loading;
  const sync = getStateSync();
  if (!sync) return Promise.resolve(false);
  const p = Promise.resolve(sync.init(STORE));
  if (!listening && sync.stores && sync.stores[STORE]) { listening = true; sync.on(STORE, '*', (value, key) => adopt(key, value || null)); }
  loading = p.then((ok) => {
    for (const [id, row] of Object.entries(sync.getAll(STORE))) if (row && typeof row === 'object') view.set(id, row);
    if (ok === false) loading = null;
    return ok !== false || view.size > 0;
  }).catch(() => { loading = null; return view.size > 0; });
  return loading;
}
const openCount = () => [...view.values()].filter((r) => r.status !== 'handled').length;

/** ONE row painter (keyed — an existing node is re-worded in place; its expanded state kept) */
function paintRow(node, r, act) {
  node.dataset.id = r.id;
  node.dataset.status = r.status === 'handled' ? 'handled' : 'open';
  node.textContent = '';
  const head = el('div', 'fb-row-head');
  head.append(el('span', 'fb-when', whenText(r.lastAt || r.at)));
  const who = el('span', 'fb-who', (r.session && r.session.name) || t('an agent'));
  if (r.session && r.session.id) who.title = r.session.id;
  head.append(who);
  if (r.group && r.group.name) head.append(el('span', 'fb-group', r.group.name));
  head.append(el('span', 'fb-chip fb-kind', r.kind || 'other'));
  if (r.about) head.append(el('span', 'fb-chip fb-about', r.about));
  // lane feedback-forward: a report another instance forwarded wears that instance's name (the maintainer's ONE inbox)
  if (r.origin && r.origin.instance) { const o = el('span', 'fb-chip fb-origin', r.origin.instance); o.title = t('Forwarded from {instance}', { instance: r.origin.instance }); head.append(o); }
  if ((Number(r.count) || 1) > 1) { const c = el('span', 'fb-count', `×${r.count}`); c.title = t('Reported {n} times', { n: r.count }); head.append(c); }
  const btn = el('button', 'btn-cancel fb-act', r.status === 'handled' ? t('Reopen') : t('Mark handled'));
  btn.type = 'button';
  btn.onclick = (e) => { e.stopPropagation(); act(r, btn); };
  head.append(btn);
  const text = el('div', 'fb-text', r.text || '');
  text.title = t('Click to show it all');
  text.onclick = () => node.classList.toggle('fb-open');
  // lane feedback-handled-verb: a report the maintainer marked through vibespace-api names the release and the conversation
  const handled = r.status !== 'handled' || !r.handledAt ? ''
    : r.handledVersion ? t('handled in {version} by {who}, {when}', { version: r.handledVersion, who: r.handledBy === MAINTAINER_BY ? t('the maintainers') : r.handledBy || t('an agent'), when: whenText(r.handledAt) })
      : t('handled {when}', { when: whenText(r.handledAt) });
  const meta = el('div', 'fb-meta', [r.harness, r.instance && r.instance.name, r.instance && r.instance.version ? 'v' + r.instance.version : '', handled].filter(Boolean).join(' · '));
  node.append(head, text, meta);
  if (r.status === 'handled' && r.handledNote) node.append(el('div', 'fb-handled-note', r.handledNote));   // text, never HTML
  return node;
}

/** Open the sheet. Resolves with its handle once drawn. */
async function openFeedbackSheet() {
  // one subject: the agents’ one feedback list
  const { body, close, raised } = createModalShell({ id: 'feedback-sheet', title: t('Agent feedback'), dialogClass: 'fb-dialog', bodyClass: 'fb-body', escapeToClose: true, onClose: () => watchers.delete(watch), kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const sheet = body.closest(SHEET_ROOTS); if (sheet) sheet.dataset.popover = '1'; // the global Esc protocol: the SHEET (the phone tier) is ours — Esc closes it first; a form window closes on an Escape inside it (lane dialog-yield)
  body.textContent = t('Loading…');
  let watch = () => { };
  if (!(await ensureLoaded())) { body.textContent = t('Could not load the feedback list'); return null; }
  if (!body.isConnected) return null; // closed while it loaded
  body.textContent = '';
  body.append(el('p', 'agents-note fb-note', t('What agents reported with vibespace-feedback — a command, a flow, a screen or a manual that felt wrong. Newest first; a repeat within a day is counted on its row.')));
  const bar = el('div', 'fb-filter');
  bar.setAttribute('role', 'tablist');
  const tabs = {};
  let filter = 'open';
  for (const [k, label] of [['open', () => t('Open ({n})', { n: openCount() })], ['handled', () => t('Handled ({n})', { n: view.size - openCount() })], ['all', () => t('All ({n})', { n: view.size })]]) {
    const b = el('button', 'fb-tab', '');
    b.type = 'button';
    b.dataset.filter = k;
    b.setAttribute('role', 'tab');
    b.onclick = () => { filter = k; redraw(); };
    b._label = label;
    tabs[k] = b;
    bar.append(b);
  }
  const list = el('div', 'fb-list');
  list.setAttribute('role', 'list');
  const empty = el('p', 'agents-note fb-empty');
  body.append(bar, list, empty);
  const rows = new Map();   // id → node
  const act = async (r, btn) => {
    const status = r.status === 'handled' ? 'open' : 'handled';
    btn.disabled = true;
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.report) throw new Error(d.error || `HTTP ${res.status}`);
      adopt(d.report.id, d.report); // the answer, now — the broadcast echo re-paints the same row
    } catch (e) {
      btn.disabled = false;
      showToast(t('Could not change the report') + (e && e.message ? ` — ${e.message}` : ''), { type: 'error' });
    }
  };
  const visible = (r) => filter === 'all' || (filter === 'handled' ? r.status === 'handled' : r.status !== 'handled');
  /** KEYED, IN PLACE: every report this filter shows has one node, in newest-first order; the rest have none */
  function redraw() {
    const want = [...view.values()].filter(visible).sort(newest);
    const keep = new Set(want.map((r) => r.id));
    for (const [id, node] of rows) if (!keep.has(id)) { node.remove(); rows.delete(id); }
    let prev = null;
    for (const r of want) {
      let node = rows.get(r.id);
      if (!node) { node = el('div', 'fb-row'); node.setAttribute('role', 'listitem'); rows.set(r.id, node); }
      if (node._row !== r) { paintRow(node, r, act); node._row = r; }
      const at = prev ? prev.nextSibling : list.firstChild;
      if (at !== node) list.insertBefore(node, at);
      prev = node;
    }
    for (const [k, b] of Object.entries(tabs)) { b.textContent = b._label(); b.setAttribute('aria-selected', String(k === filter)); b.classList.toggle('active', k === filter); }
    empty.textContent = want.length ? '' : (view.size === 0 ? t('No reports yet — when a tool or a flow feels wrong to an agent, it sends one with vibespace-feedback.') : filter === 'open' ? t('Nothing open — every report is handled.') : t('No reports here.'));
    empty.style.display = want.length ? 'none' : '';
  }
  // the global Esc removes a [data-popover] node without its onClose — a watcher whose list left the page drops itself
  watch = () => { if (!list.isConnected) { watchers.delete(watch); return; } redraw(); };
  watchers.add(watch);
  redraw();
  return { close, rows, redraw };
}

// ⚙ System ▸ Agent feedback… (order 25: after Diagnostics report… 20, before the rule at 30) — the open count beside it
registerMenuItem({
  menu: 'gear', parent: 'system', order: 25, id: 'agent-feedback', icon: ICON, // gear-menu.js head 'system'
  label: () => t('Agent feedback…'),
  run: () => { openFeedbackSheet(); },
  decorate: (row) => {
    const n = el('span', 'gs-count fb-gear-count', '');
    row.append(n);
    const paint = () => { const c = openCount(); n.textContent = c ? String(c) : ''; n.title = c ? t('{n} open', { n: c }) : ''; };
    const w = () => { if (!n.isConnected) { watchers.delete(w); return; } paint(); };
    watchers.add(w);
    ensureLoaded().then(paint);
  },
});
