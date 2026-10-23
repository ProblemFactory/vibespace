// ONE RAW-API PROPOSAL = ONE CARD, drawn the same in the agent's chat (under its call row), the Outbox (one row per
// proposal, the card opens under it) and the API access… dialog (B-2198 part 2, docs/design-channel-raw-api.md §7).
// Words and fate come from the PURE model (src/channel-api-card.js); a card is KEYED by proposal id and patched in
// place only when its model's `sig` changes; every surface refetches the same records on `channel-api-updated`.
import * as C from '../channel-api-card.js';
import { runsOf } from '../outbox-census.js';   // lane outbox-window-scroll-filter: identical consecutive Outbox rows are ONE row ×n
import { fetchJson, showToast } from './utils.js';
import { t, resolveLang } from './i18n.js';
import { enterSubmits } from './chat-enter-keys.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const tw = (w) => (w ? t(w.key, w.params) : '');
const JSON_HDR = { 'Content-Type': 'application/json' };
// the tier as the dialog words it (the record carries its id: read / write-ask / write-auto / write-all; under an `everyone` row it is Read unless the user ticked write for All agents)
const TIER_WORD = { read: 'Read', 'write-ask': 'Read + write, ask each', 'write-auto': 'Read + write, auto (sensitive still asks)', 'write-all': 'Full trust (sensitive runs without asking)' };

/** Approve / Reject / 重新提交 — the same route from every surface; Approve and Resubmit name the frozen digest they were
 *  pressed on (Resubmit files the vendor's redirect target as a NEW card — nothing runs, B-fc37). */
export async function answerApiProposal(id, answer, { shown = null, always = false, reason = null } = {}) {
  const pid = encodeURIComponent(id), no = (e) => ({ ok: false, error: String((e && e.message) || e) });
  const r = answer === 'reject'
    ? await fetchJson(`/api/channels/api/proposals/${pid}/reject`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ reason }) }).catch(no)
    : answer === 'resubmit'
      ? await fetchJson(`/api/channels/api/proposals/${pid}/resubmit`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ shown }) }).catch(no)
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
/** The title as plain text — `{object}` = its name, else its id shortened to 8 chars (the Outbox row, a tooltip); THE
 *  words the For-you row says too (C.titleWords, PURE). */
export const titleText = (h) => C.titleWords(h, { t, lang: resolveLang() });
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
  // lane outbox-window-scroll-filter: the Outbox's row says a SHORT status — its card adds the reason when there is one
  else { const more = C.outcomeMore(rec); if (more) meta.appendChild(el('span', 'chan-api-outcome', tw(more))); }
  card.appendChild(meta);
  const tech = el('details', 'chan-api-tech'); tech.dataset.fold = 'tech';
  tech.appendChild(el('summary', '', t('Technical details')));
  tech.appendChild(el('code', 'chan-api-url', `${m.request.method} https://${m.request.host}${m.request.path}${m.request.query ? `?${m.request.query}` : ''}`));
  for (const h of m.headers) tech.appendChild(el('div', 'chat-status-dim chan-api-hdr', h));
  // lane outbox-window-scroll-filter: the Outbox row never carries an id, an HTTP status or a size — they are here
  if (!head && m.head.object && m.head.object.id) tech.appendChild(el('div', 'chat-status-dim chan-api-objline', t('Object id: {id}', { id: m.head.object.id })));
  if (!head && C.answerOf(rec)) tech.appendChild(el('div', 'chat-status-dim chan-api-answerline', tw(C.answerOf(rec))));
  if (m.always) tech.appendChild(el('div', 'chat-status-dim chan-api-allowline', t('Allowed from then on: {shape}', { shape: m.always.params.shape })));
  // B-fc37: where the vendor redirected the approved call (method + host + path) and why VibeSpace did not follow
  if (m.redirect) tech.appendChild(el('div', 'chat-status-dim chan-api-redirectline', t('The vendor redirected it ({status}) to {to} — not followed: {why}', { status: m.redirect.status || '3xx', to: m.redirect.to, why: tw(m.redirect.why) })));
  if (m.body != null) {
    tech.appendChild(el('div', 'chat-status-dim chan-api-bodyline', t('Body · {size} · sha256 {sha}', { size: C.sizeText(m.bodyBytes), sha: String(m.bodySha || '').slice(0, 16) })));
    tech.appendChild(el('pre', 'chan-api-body', m.body + (m.bodyMore ? '…' : '')));
  }
  card.appendChild(tech);
  if (m.resubmit) {
    // 重新提交: the vendor's target becomes a NEW card (its own words + chip), decided like any other — nothing runs now
    const row = el('div', 'chan-api-actions');
    const x = el('button', 'mounts-btn chan-api-resubmit', t('Resubmit')); x.type = 'button';
    x.addEventListener('click', (ev) => { ev.stopPropagation(); x.disabled = true; answerApiProposal(m.id, 'resubmit', { shown: rec.digest }); });
    row.appendChild(x);
    card.appendChild(row);
  }
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

/** A call row's cards: its own proposals, then each card resubmitted from them (重新提交) right after — under it. */
const rowCards = (ids, all) => { const more = C.chainIds(ids, all).filter((id) => !ids.includes(id)); return [...all.filter((r) => ids.includes(r.id)), ...more.map((id) => all.find((r) => r.id === id))]; };
/** THE CHAT: the cards of `ids` (the call rows' proposals) in ONE keyed box right after the call's touch box. */
export function chatApiCards(app, cardEl, ids) {
  let box = cardEl.querySelector(':scope .chat-api-cards');
  if (!ids.length) { if (box) box.remove(); return; }
  if (!box) {
    box = el('div', 'chat-api-cards');
    const touch = cardEl.querySelector('.chat-channel-touches');
    if (touch) touch.after(box); else cardEl.appendChild(box);
    box._ids = ids;
    const off = onApiCards(app, (all) => { if (!box.isConnected && box._seen) { off(); return; } box._seen = true; placeApiCards(box, rowCards(box._ids, all), { app }); });
  }
  box._ids = ids;
  placeApiCards(box, rowCards(ids, records), { app });
}

/** THE OUTBOX'S SECTION HEAD (lane outbox-window-scroll-filter) — both sections draw it: a dot (accent while one
 *  waits), the census's words, and — FOLDED under 「待审批」 (nothing of it waits) — 「在「全部」里看」, the one door to its
 *  rows. `paintSecHead` patches it in place; `onAll(key)` = the window's switch to 「全部」 at that section. */
export function outboxSecHead(key) {
  const h = el('div', 'chan-outbox-sec');
  h.dataset.sec = key;
  const all = el('button', 'jobs-btn chan-outbox-sec-all', t('See them in All'));
  all.type = 'button';
  all.hidden = true;
  all.addEventListener('click', (ev) => { ev.stopPropagation(); if (h._onAll) h._onAll(key); });
  h.append(el('span', 'chan-dot chan-dot-idle'), el('span', 'chan-outbox-sec-words'), all);
  return h;
}
export function paintSecHead(h, sec, words, onAll = null) {
  const dot = `chan-dot chan-dot-${sec.waiting ? 'attn' : 'idle'}`;
  if (h.firstElementChild.className !== dot) h.firstElementChild.className = dot;
  const w = h.querySelector('.chan-outbox-sec-words');
  if (w.textContent !== words) w.textContent = words;
  h.querySelector('.chan-outbox-sec-all').hidden = !sec.folded;
  h.classList.toggle('chan-outbox-sec-folded', !!sec.folded);
  h._onAll = onAll;
  return h;
}
/** An Outbox row's words: «<actor> · <action>» (the named object only) — C.rowWords in this device's language. */
export const rowText = (rm) => C.rowWords(rm, { t, lang: resolveLang() });

/** THE OUTBOX'S API section (lane outbox-window-scroll-filter — the owner's card law): one row per RUN of identical
 *  consecutive proposals — the fate dot · «actor · action» · the policy chip · «×n» · the short status — the card of
 *  each opens under it without repeating the row (its ids, the HTTP status and the size in its 技术细节 fold); a
 *  waiting one is its own row, its card open. `onRecords(records)` = the window: it takes every change and draws this
 *  section through `draw(section)` (the census's — src/outbox-census.js), INSIDE its one scrolling list. Without
 *  `onRecords` the section draws all its records itself (a suite's mount). */
export function apiOutboxSection(app, { onRecords = null, onAll = null } = {}) {
  const root = el('div', 'chan-api-outbox');
  root.dataset.sec = 'api';
  const head = outboxSecHead('api');
  const list = el('div', 'chan-api-outbox-list');
  root.append(head, list);
  const open = new Set(), seen = new Set();
  let last = null;
  const draw = (sec) => {
    const S = last = sec || { key: 'api', total: 0, waiting: 0, folded: false, items: [] };
    root.hidden = !S.total;
    paintSecHead(head, S, t('API calls · {a} awaiting you · {n}', { a: S.waiting, n: S.total }), onAll);
    const now = Date.now();
    const runs = S.folded ? [] : runsOf(S.items, (r) => C.rowModel(r, { now }).runKey);
    const have = new Map([...list.children].map((c) => [c.dataset.key + (c.classList.contains('chan-api-card') ? '#card' : ''), c]));
    const nodes = [];
    for (const run of runs) {
      const lead = run.items[0];
      const m = C.rowModel(lead, { now });
      let row = have.get(lead.id);
      if (!row || !row.classList.contains('chan-api-orow')) {
        row = el('button', 'chan-orow chan-api-orow'); row.type = 'button'; row.dataset.key = lead.id;
        row.append(el('span', 'chan-dot'), el('span', 'chan-api-orow-head'), el('span', 'chan-api-chip chan-api-chip-warn chan-api-orow-chip'), el('span', 'chan-api-orow-count'), el('span', 'chat-status-dim chan-api-orow-out'));
        row.addEventListener('click', () => {
          const ids = row._ids || [];
          const shut = ids.some((id) => open.has(id));
          for (const id of ids) { if (shut) open.delete(id); else open.add(id); }
          draw(last);
        });
      }
      row._ids = run.items.map((r) => r.id);
      row.dataset.fate = m.fate;
      row.dataset.count = String(run.items.length);
      row.querySelector('.chan-dot').className = `chan-dot chan-dot-${m.fate === 'pending' ? 'warn' : m.fate === 'ran' ? 'ok' : 'idle'}`;
      const set = (q, x) => { const n = row.querySelector(q); if (n.textContent !== x) n.textContent = x; };
      set('.chan-api-orow-head', rowText(m)); set('.chan-api-orow-chip', tw(m.chip)); set('.chan-api-orow-out', tw(m.status));
      set('.chan-api-orow-count', run.items.length > 1 ? `×${run.items.length}` : '');
      row.querySelector('.chan-api-orow-chip').hidden = !m.chip;
      row.querySelector('.chan-api-orow-count').hidden = run.items.length < 2;
      nodes.push(row);
      for (const r of run.items) if (!seen.has(r.id)) { seen.add(r.id); if (C.fateOf(r) === 'pending') open.add(r.id); }
      const isOpen = run.items.some((r) => open.has(r.id));
      row.classList.toggle('chan-orow-open', isOpen);
      row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) for (const r of run.items) nodes.push(renderApiCard(r, have.get(r.id + '#card') || null, { app, head: false }));
    }
    nodes.forEach((n, i) => { if (list.children[i] !== n) list.insertBefore(n, list.children[i] || null); });
    while (list.children.length > nodes.length) list.lastChild.remove();
  };
  let mine = [];
  const off = onApiCards(app, (all) => {
    mine = all;
    if (onRecords) onRecords(all);
    else draw({ key: 'api', total: all.length, waiting: all.filter((r) => C.fateOf(r) === 'pending').length, folded: false, items: all });
  });
  return { el: root, stop: off, draw, records: () => mine };
}
