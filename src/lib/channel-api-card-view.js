// ONE RAW-API PROPOSAL = ONE CARD, drawn the same in the agent's chat (under its call row), the Outbox (one row per
// proposal, the card opens under it) and the API access… dialog (B-2198 part 2, docs/design-channel-raw-api.md §7).
// Words and fate come from the PURE model (src/channel-api-card.js); a card is KEYED by proposal id and patched in
// place only when its model's `sig` changes; every surface refetches the same records on `channel-api-updated`.
import * as C from '../channel-api-card.js';
import { fetchJson, showToast } from './utils.js';
import { t, resolveLang } from './i18n.js';
import { enterSubmits } from './chat-enter-keys.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const tw = (w) => (w ? t(w.key, w.params) : '');
const JSON_HDR = { 'Content-Type': 'application/json' };
// the tier as the dialog words it (the record carries its id: read / write-ask / write-auto / write-all; under an `everyone` row it is Read unless the user ticked write for All agents)
const TIER_WORD = { read: 'Read', 'write-ask': 'Read + write, ask each', 'write-auto': 'Read + write, auto (sensitive still asks)', 'write-all': 'Full trust (sensitive runs without asking)' };

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

// THE CARD GRAMMAR (docs/kb-patterns.md «Card grammar»; census scripts/test-card-grammar.mjs): the title says who does
// what to which NAMED thing; the policy is a chip; every raw string (method, URL, headers, body, sha256, bytes) lives
// under ONE collapsed 技术细节 fold marked data-fold="tech"; Approve needs no reason, Reject asks for one in a popover.
const OBJ = '\u0001';   // where the named object sits in a rendered title (split into a link / an id chip)

/** A row's words: a GENERATED row (src/api-call-words.generated.js) carries its own zh/en/ja phrase; a hand row an i18n key. */
const say = (w, params) => t(w.text ? w.text[resolveLang()] || w.text.en : w.key, params);
/** The title as plain text — `{object}` = its name, else its id shortened to 8 chars (the Outbox row, a tooltip). */
export function titleText(h) {
  const o = h.object;
  const what = say(h.what, { ...h.what.params, object: o ? o.name || o.short || '' : '' });
  return t(h.key, { ...h.params, what });
}
function objectNode(app, o) {
  if (o && o.name && o.conv && app && typeof app.openChannel === 'function') {
    const a = el('a', 'chan-api-obj', o.name); a.href = '#';
    a.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); app.openChannel(o.conv.adapterId, o.conv.convId); });
    return a;
  }
  if (o && o.name) return el('span', 'chan-api-obj', o.name);
  return el('span', 'chan-api-obj chan-api-objid', (o && o.short) || '');
}
/** The title as nodes — the object a link (opens its conversation) or an id chip; never the raw path. */
function titleEl(app, h) {
  const what = say(h.what, { ...h.what.params, object: OBJ });
  const [a, ...rest] = t(h.key, { ...h.params, what }).split(OBJ);
  const head = el('div', 'chan-api-head', a);
  if (rest.length && h.object) head.append(objectNode(app, h.object), rest.join(''));
  else if (rest.length) head.append(rest.join(''));
  return head;
}
const chip = (text, cls = '') => el('span', `chan-api-chip${cls ? ` ${cls}` : ''}`, text);

/** THE CARD — `prev` (the same proposal's element) is patched in place; a new element otherwise. `head: false` = the
 *  Outbox's expanded card (its row already carries the title, the policy chip and the outcome — never said twice). */
export function renderApiCard(rec, prev = null, { app = null, head = true } = {}) {
  const m = C.cardModel(rec);
  const sig = `${m.sig}|${head ? 1 : 0}`;
  if (prev && prev._sig === sig) return prev;
  const card = el('div', `chan-api-card chan-api-proposal chan-api-fate-${m.fate}`);
  card.dataset.key = m.id; card.dataset.fate = m.fate; card._sig = sig;
  if (head) card.appendChild(titleEl(app, m.head));
  if (m.note) card.appendChild(el('div', 'chan-api-note', `“${m.note}”`));
  const meta = el('div', 'chan-api-meta');
  if (m.sensitive && head) meta.appendChild(chip(tw(m.sensitive), 'chan-api-chip-warn'));
  if (m.tier) meta.appendChild(chip(t('Under the tier: {tier}', { tier: TIER_WORD[m.tier] ? t(TIER_WORD[m.tier]) : m.tier })));
  if (m.cred) meta.appendChild(chip(m.cred));
  if (head) meta.appendChild(el('span', 'chan-api-outcome', tw(m.outcome)));
  card.appendChild(meta);
  const tech = el('details', 'chan-api-tech'); tech.dataset.fold = 'tech';
  tech.appendChild(el('summary', '', t('Technical details')));
  tech.appendChild(el('code', 'chan-api-url', `${m.request.method} https://${m.request.host}${m.request.path}${m.request.query ? `?${m.request.query}` : ''}`));
  for (const h of m.headers) tech.appendChild(el('div', 'chat-status-dim chan-api-hdr', h));
  if (m.always) tech.appendChild(el('div', 'chat-status-dim chan-api-allowline', t('Allowed from then on: {shape}', { shape: m.always.params.shape })));
  if (m.body != null) {
    tech.appendChild(el('div', 'chat-status-dim chan-api-bodyline', t('Body · {size} · sha256 {sha}', { size: C.sizeText(m.bodyBytes), sha: String(m.bodySha || '').slice(0, 16) })));
    tech.appendChild(el('pre', 'chan-api-body', m.body + (m.bodyMore ? '…' : '')));
  }
  card.appendChild(tech);
  if (m.actionable) {
    const row = el('div', 'chan-api-actions');
    const b = (label, cls, fn) => { const x = el('button', cls, label); x.type = 'button'; x.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); row.appendChild(x); return x; };
    b(t('Approve'), 'mounts-btn mounts-btn-primary chan-api-approve', () => answerApiProposal(m.id, 'approve', { shown: rec.digest }));
    // D2: the button says the plain phrase; the exact shape it grants is the fold's 「以后放行：…」 line (verify r1 H2)
    if (m.always) b(t(m.always.key, { what: titleText({ key: '{what}', params: {}, what: m.always.what, object: m.head.object }) }), 'mounts-btn chan-api-always', () => answerApiProposal(m.id, 'approve', { shown: rec.digest, always: true }));
    b(t('Reject'), 'mounts-btn chan-api-reject', () => rejectPop(row, m.id));
    card.appendChild(row);
  }
  if (prev && prev.parentNode) prev.replaceWith(card);
  return card;
}
/** Reject's popover — the reason is optional and the agent reads it; Enter rejects, Esc closes. */
function rejectPop(row, id) {
  const had = row.querySelector('.chan-api-reject-pop');
  if (had) { had.remove(); return; }
  const pop = el('div', 'chan-api-reject-pop'); pop.setAttribute('role', 'dialog');
  const why = el('input', 'chan-api-why'); why.placeholder = t('Why (the agent reads it)'); why.setAttribute('aria-label', t('Why (the agent reads it)'));
  const go = el('button', 'mounts-btn chan-api-reject-go', t('Reject')); go.type = 'button';
  const no = el('button', 'mounts-btn chan-api-reject-cancel', t('Cancel')); no.type = 'button';
  go.addEventListener('click', (ev) => { ev.stopPropagation(); pop.remove(); answerApiProposal(id, 'reject', { reason: why.value.trim() || null }); });
  no.addEventListener('click', (ev) => { ev.stopPropagation(); pop.remove(); });
  why.addEventListener('keydown', (ev) => { if (enterSubmits(ev)) go.click(); else if (ev.key === 'Escape') pop.remove(); });
  pop.append(why, go, no);
  row.appendChild(pop);
  why.focus();
}

/** Place `recs` as keyed cards in `box` (reuse by data-key; drop the rest). */
export function placeApiCards(box, recs, opts = {}) {
  const have = new Map([...box.children].map((c) => [c.dataset.key, c]));
  recs.forEach((rec, i) => {
    const c = renderApiCard(rec, have.get(rec.id) || null, opts);
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
    const off = onApiCards(app, (all) => { if (!box.isConnected && box._seen) { off(); return; } box._seen = true; placeApiCards(box, all.filter((r) => box._ids.includes(r.id)), { app }); });
  }
  box._ids = ids;
  placeApiCards(box, records.filter((r) => ids.includes(r.id)), { app });
}

/** THE OUTBOX'S API section: one row per proposal (fate dot · short title · policy chip · outcome), its card opens
 *  under it without repeating the title. */
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
      if (!row) { row = el('button', 'chan-orow chan-api-orow'); row.type = 'button'; row.dataset.key = r.id; row.append(el('span', 'chan-dot'), el('span', 'chan-api-orow-head'), el('span', 'chan-api-chip chan-api-chip-warn chan-api-orow-chip'), el('span', 'chat-status-dim chan-api-orow-out')); row.addEventListener('click', () => { if (open.has(r.id)) open.delete(r.id); else open.add(r.id); draw(records); }); }
      row.dataset.fate = m.fate;
      row.querySelector('.chan-dot').className = `chan-dot chan-dot-${m.fate === 'pending' ? 'warn' : m.fate === 'ran' ? 'ok' : 'idle'}`;
      const set = (s, x) => { const n = row.querySelector(s); if (n.textContent !== x) n.textContent = x; };
      set('.chan-api-orow-head', titleText(m.head)); set('.chan-api-orow-chip', tw(m.sensitive)); set('.chan-api-orow-out', tw(m.outcome));
      row.querySelector('.chan-api-orow-chip').hidden = !m.sensitive;
      nodes.push(row);
      if (!seen.has(r.id)) { seen.add(r.id); if (m.actionable) open.add(r.id); }
      row.classList.toggle('chan-orow-open', open.has(r.id));
      if (open.has(r.id)) nodes.push(renderApiCard(r, have.get(r.id + '#card') || null, { app, head: false }));
    }
    nodes.forEach((n, i) => { if (list.children[i] !== n) list.insertBefore(n, list.children[i] || null); });
    while (list.children.length > nodes.length) list.lastChild.remove();
  };
  const off = onApiCards(app, draw);
  return { el: root, stop: off };
}
