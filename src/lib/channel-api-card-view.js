// ONE RAW-API PROPOSAL = ONE CARD, drawn the same in the agent's chat (under its call row), the Outbox (one row per
// proposal, the card opens under it) and the API access… dialog (B-2198 part 2, docs/design-channel-raw-api.md §7).
// Words and fate come from the PURE model (src/channel-api-card.js); a card is KEYED by proposal id and patched in
// place only when its model's `sig` changes; every surface refetches the same records on `channel-api-updated`.
import * as C from '../channel-api-card.js';
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const tw = (w) => (w ? t(w.key, w.params) : '');
const JSON_HDR = { 'Content-Type': 'application/json' };
// the tier as the dialog words it (the record carries its id: read / write-ask / write-auto; under an `everyone` row it is Read unless the user ticked write for All agents)
const TIER_WORD = { read: 'Read', 'write-ask': 'Read + write, ask each', 'write-auto': 'Read + write, auto (sensitive still asks)' };

/** Approve / Reject — the same route from every surface; the Approve names the frozen digest it was pressed on. */
export async function answerApiProposal(id, answer, { shown = null, always = false, reason = null } = {}) {
  const pid = encodeURIComponent(id), no = (e) => ({ ok: false, error: String((e && e.message) || e) });
  const r = answer === 'reject'
    ? await fetchJson(`/api/channels/api/proposals/${pid}/reject`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ reason }) }).catch(no)
    : await fetchJson(`/api/channels/api/proposals/${pid}/approve`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ shown, always }) }).catch(no);
  if (!r || !r.ok) showToast(r && r.code === 'not-pending' ? t('That request was already decided') : (r && r.error) || t('server unreachable'), { type: 'error' });
  refreshApiCards();
  return !!(r && r.ok);
}

/** THE CARD — `prev` (the same proposal's element) is patched in place; a new element otherwise. */
export function renderApiCard(rec, prev = null) {
  const m = C.cardModel(rec);
  if (prev && prev._sig === m.sig) return prev;
  const card = el('div', `chan-api-card chan-api-proposal chan-api-fate-${m.fate}`);
  card.dataset.key = m.id; card.dataset.fate = m.fate; card._sig = m.sig;
  card.appendChild(el('div', 'chan-api-head', tw(m.head)));
  card.appendChild(el('div', 'chan-api-outcome', tw(m.outcome)));
  const req = el('div', 'chan-api-req');
  req.appendChild(el('code', '', `${m.request.method} ${m.request.host}${m.request.path}${m.request.query ? `?${m.request.query}` : ''}`));
  for (const h of m.headers) req.appendChild(el('div', 'chat-status-dim chan-api-hdr', h));
  card.appendChild(req);
  if (m.body != null) {
    const d = el('details', 'chan-api-body'); d.open = m.actionable;
    d.appendChild(el('summary', '', t('Body · {size} · sha256 {sha}', { size: C.sizeText(m.bodyBytes), sha: String(m.bodySha || '').slice(0, 16) })));
    d.appendChild(el('pre', '', m.body + (m.bodyMore ? '…' : '')));
    card.appendChild(d);
  }
  if (m.tier) card.appendChild(el('div', 'chat-status-dim chan-api-tier', t('Under the tier: {tier}', { tier: TIER_WORD[m.tier] ? t(TIER_WORD[m.tier]) : m.tier })));
  if (m.sensitive) card.appendChild(el('div', 'chat-status-dim chan-api-sensitive', tw(m.sensitive)));
  if (m.actionable) {
    const row = el('div', 'chan-api-actions');
    const b = (label, cls, fn) => { const x = el('button', cls, label); x.type = 'button'; x.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); row.appendChild(x); return x; };
    b(t('Approve'), 'mounts-btn mounts-btn-primary chan-api-approve', () => answerApiProposal(m.id, 'approve', { shown: rec.digest }));
    if (m.always) b(tw(m.always), 'mounts-btn chan-api-always', () => answerApiProposal(m.id, 'approve', { shown: rec.digest, always: true }));
    const why = el('input', 'chan-api-why'); why.placeholder = t('Why (the agent reads it)'); why.setAttribute('aria-label', t('Why (the agent reads it)'));
    row.appendChild(why);
    b(t('Reject'), 'mounts-btn chan-api-reject', () => answerApiProposal(m.id, 'reject', { reason: why.value || null }));
    card.appendChild(row);
  }
  if (prev && prev.parentNode) prev.replaceWith(card);
  return card;
}

/** Place `recs` as keyed cards in `box` (reuse by data-key; drop the rest). */
export function placeApiCards(box, recs) {
  const have = new Map([...box.children].map((c) => [c.dataset.key, c]));
  recs.forEach((rec, i) => {
    const c = renderApiCard(rec, have.get(rec.id) || null);
    have.delete(rec.id);
    if (box.children[i] !== c) box.insertBefore(c, box.children[i] || null);
  });
  for (const c of have.values()) c.remove();
}

// ── THE SHARED RECORDS (one fetch, every mounted surface patched) ──
let records = [], inflight = null, wired = false;
const listeners = new Set();
export function refreshApiCards() {
  if (!inflight) inflight = fetchJson('/api/channels/api').then((r) => { records = (r && r.cards) || []; for (const fn of listeners) { try { fn(records); } catch {} } }).catch(() => {}).finally(() => { inflight = null; });
  return inflight;
}
/** Follow the records (fn(records) now and on every change); returns the unsubscribe. */
export function onApiCards(app, fn) {
  if (!wired && app && app.ws && app.ws.onGlobal) { wired = true; app.ws.onGlobal((msg) => { if (msg && msg.type === 'channel-api-updated') refreshApiCards(); }); }
  listeners.add(fn);
  if (records.length) fn(records);
  refreshApiCards();
  return () => listeners.delete(fn);
}

/** THE CHAT: the cards of `ids` (the call rows' proposals) in ONE keyed box right after the call's touch box. */
export function chatApiCards(app, cardEl, ids) {
  let box = cardEl.querySelector(':scope .chat-api-cards');
  if (!ids.length) { if (box) box.remove(); return; }
  if (!box) {
    box = el('div', 'chat-api-cards');
    const touch = cardEl.querySelector('.chat-channel-touches');
    if (touch) touch.after(box); else cardEl.appendChild(box);
    box._ids = ids;
    const off = onApiCards(app, (all) => { if (!box.isConnected && box._seen) { off(); return; } box._seen = true; placeApiCards(box, all.filter((r) => box._ids.includes(r.id))); });
  }
  box._ids = ids;
  placeApiCards(box, records.filter((r) => ids.includes(r.id)));
}

/** THE OUTBOX'S API section: one row per proposal (fate dot · head · outcome), its card opens under it. */
export function apiOutboxSection(app) {
  const root = el('div', 'chan-api-outbox');
  const head = el('div', 'chan-outbox-sec', '');
  const list = el('div', 'chan-api-outbox-list');
  root.append(head, list);
  const open = new Set(), seen = new Set();
  const draw = (all) => {
    root.hidden = !all.length;
    const waiting = all.filter((r) => C.fateOf(r) === 'pending').length;
    const words = t('API calls · {a} awaiting you · {n}', { a: waiting, n: all.length });
    if (head.textContent !== words) head.textContent = words;
    const have = new Map([...list.children].map((c) => [c.dataset.key + (c.classList.contains('chan-api-card') ? '#card' : ''), c]));
    const nodes = [];
    for (const r of all) {
      const m = C.cardModel(r);
      let row = have.get(r.id);
      if (!row) { row = el('button', 'chan-orow chan-api-orow'); row.type = 'button'; row.dataset.key = r.id; row.append(el('span', 'chan-dot'), el('span', 'chan-api-orow-head'), el('span', 'chat-status-dim chan-api-orow-out')); row.addEventListener('click', () => { if (open.has(r.id)) open.delete(r.id); else open.add(r.id); draw(records); }); }
      row.dataset.fate = m.fate;
      row.querySelector('.chan-dot').className = `chan-dot chan-dot-${m.fate === 'pending' ? 'warn' : m.fate === 'ran' ? 'ok' : 'idle'}`;
      const set = (s, x) => { const n = row.querySelector(s); if (n.textContent !== x) n.textContent = x; };
      set('.chan-api-orow-head', tw(m.head)); set('.chan-api-orow-out', tw(m.outcome));
      nodes.push(row);
      if (!seen.has(r.id)) { seen.add(r.id); if (m.actionable) open.add(r.id); }
      if (open.has(r.id)) nodes.push(renderApiCard(r, have.get(r.id + '#card') || null));
    }
    nodes.forEach((n, i) => { if (list.children[i] !== n) list.insertBefore(n, list.children[i] || null); });
    while (list.children.length > nodes.length) list.lastChild.remove();
  };
  const off = onApiCards(app, draw);
  return { el: root, stop: off };
}
