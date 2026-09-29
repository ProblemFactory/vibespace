// REACTIONS IN THE CHANNEL WINDOW (lane channel-threads, 2026-09-28 — the owner: "… 以及 reaction (附加在消息上的
// 表情)"; spec §4.2 W3 / §4.3). Two surfaces, one module:
//
//   · THE STRIP under a message: one chip per reaction — the vendor's emoji as CONTENT (a text glyph, or a custom
//     picture through OUR route `…/emoji/<key>` as `img.src`, else `:key:` as text — never a vendor URL, never
//     innerHTML), the count, `.rx-mine` (aria-pressed) when the account's user reacted, the who-list in the title
//     and on a long press; the `+` chip (the ONE chrome icon, SVG) opens the picker. A click toggles — the chip
//     flips when the ROUTE answers (never optimistically), disabled while in flight. The strip is patched IN PLACE
//     by key (PURE `chipPlan`): a count re-spelled, a key appended, a key removed — never a rebuilt strip under the
//     pointer (the a3 keyed-chips rule).
//   · THE PICKER: a popover (createPopover — the `data-popover` Esc protocol, an outside press closes it): a quick
//     row, a search box, a keyed grid (8 a row) of the keys the adapter's set LISTS (a key it does not list is never
//     offered — the vendor would refuse it anyway), arrows move, Enter picks.
import { createPopover, fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { icon, el } from './channel-chrome.js';
import { routeErrorText } from './channel-words.js';
import * as Rx from '../channel-reactions.js';
import { humanAge } from '../channel-caps.js';

/** How long a chip waits for its route before it gives up the in-flight state (the route answers first). */
const IN_FLIGHT_MAX_MS = 20e3;

/** "You, A, B and 2 more" — names only (`by[].id` keys the list, never shown; the owner is "You"). */
export function whoText(x) {
  const w = Rx.whoList(x, 3);
  const parts = [...(w.self ? [t('You')] : []), ...w.names];
  if (!parts.length) return x && x.count ? t('{n} reactions', { n: x.count }) : '';
  const names = parts.join(', ');
  return w.more ? t('{names} and {n} more', { names, n: w.more }) : names;
}

/** The chip's CONTENT (a reaction is content): glyph text / our picture / `:key:` text. */
function faceOf(x, adapterBase) {
  if (x.glyph) return el('span', 'rx-glyph', x.glyph);
  if (x.customImage && adapterBase) {
    const img = document.createElement('img');
    img.className = 'rx-img';
    img.alt = `:${x.key}:`;
    img.loading = 'lazy';
    img.src = `${adapterBase}/emoji/${encodeURIComponent(x.key)}?inline=1`;   // OUR route, as a property
    return img;
  }
  return el('span', 'rx-name', `:${x.key}:`);
}

/** ONE chip (a `<button>` keyed by `data-key`). */
function chipOf(x, ctx) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rx-chip' + (x.mine ? ' rx-mine' : '');
  b.dataset.key = x.key;
  b.setAttribute('aria-pressed', x.mine ? 'true' : 'false');
  b.appendChild(faceOf(x, ctx.adapterBase));
  b.appendChild(el('span', 'rx-n', String(x.count)));
  spellChip(b, x, ctx);
  b.onclick = (ev) => { ev.stopPropagation(); if (b.disabled) return; ctx.onToggle && ctx.onToggle(b, x.key); };
  // a long press (the product's contextmenu synthesis on touch) / a right click: the who-list, in a popover
  b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); showWho(b); });
  return b;
}
/** A chip whose face was drawn before the vocabulary arrived (`:key:` text) gets its glyph / picture in place. */
function refaceChip(b, x, adapterBase) {
  const face = b.firstElementChild;
  const want = x.glyph ? 'rx-glyph' : x.customImage && adapterBase ? 'rx-img' : 'rx-name';
  if (!face || face.classList.contains(want) || (want === 'rx-name')) return;
  face.replaceWith(faceOf(x, adapterBase));
}
/** THE VOCABULARY ARRIVED (the window's `emoji-set` load): every drawn chip still showing `:key:` whose key the set
 *  gives a glyph (or a custom picture) is re-faced in place — the chip node, its count and its handlers are kept. */
export function refaceStrips(root, set, adapterBase) {
  if (!root || !set || !Array.isArray(set.keys)) return 0;
  const byKey = new Map(set.keys.filter((k) => k && k.key).map((k) => [k.key, k]));
  let n = 0;
  for (const chip of root.querySelectorAll('.rx-chip:not(.rx-add)')) {
    const face = chip.firstElementChild;
    if (!face || !face.classList.contains('rx-name')) continue;
    const e = byKey.get(chip.dataset.key);
    if (!e || !(e.glyph || e.custom)) continue;
    refaceChip(chip, { key: e.key, glyph: e.glyph || null, customImage: e.custom ? `emoji:${e.key}` : null }, adapterBase);
    n++;
  }
  return n;
}
/** Re-spell a chip's facts in place (the count node, mine, the tooltip) — the node itself is kept. */
function spellChip(b, x, ctx) {
  refaceChip(b, x, ctx && ctx.adapterBase);
  const n = b.querySelector('.rx-n');
  if (n && n.textContent !== String(x.count)) n.textContent = String(x.count);
  b.classList.toggle('rx-mine', !!x.mine);
  b.setAttribute('aria-pressed', x.mine ? 'true' : 'false');
  const label = x.glyph || `:${x.key}:`;
  const who = whoText(x);
  const age = ctx.asOf ? humanAge(Math.max(0, (Date.now() - ctx.asOf) / 1000)) : '';
  b.title = [who ? `${label} ${who}` : label, age ? t('as of {age} ago', { age }) : ''].filter(Boolean).join(' · ');
  b.setAttribute('aria-label', `${x.label || x.key} ${x.count}${x.mine ? ` (${t('you')})` : ''}`);
  b._rx = x;
}
function showWho(chip) {
  const x = chip._rx;
  if (!x) return;
  const pop = createPopover(chip, 'rx-who');
  pop.appendChild(el('div', 'rx-who-head', `${x.glyph || `:${x.key}:`} ${x.count}`));
  // names only (the naive-user pass): the owner is "You", a reactor with no name here is counted, never an "unknown" row
  let rows = 0;
  if (x.mine === true) { pop.appendChild(el('div', 'rx-who-row', t('You'))); rows++; }
  for (const b of Array.isArray(x.by) ? x.by : []) if (b && b.self !== true && b.name) { pop.appendChild(el('div', 'rx-who-row', b.name)); rows++; }
  const more = Math.max(0, (Number(x.count) || 0) - rows);
  if (more > 0) pop.appendChild(el('div', 'rx-who-more', rows ? t('and {n} more', { n: more }) : t('{n} reactions', { n: more })));
}

/**
 * THE STRIP for a record (null when it has no reactions and none may be added; a system line never has one).
 * `ctx` = { offers: {react}, adapterBase, asOf, onToggle(chip, key), onAdd(anchor) }.
 */
export function renderReactionStrip(rec, ctx) {
  const list = Array.isArray(rec && rec.reactions) ? rec.reactions : [];
  const canAdd = !!(ctx && ctx.canAdd);
  if (!list.length && !canAdd) return null;
  const strip = el('div', 'chanmsg-rx');
  strip.dataset.vid = rec.vendorId || '';
  for (const x of list) strip.appendChild(chipOf(x, ctx));
  if (canAdd) strip.appendChild(addChip(ctx));
  return strip;
}
function addChip(ctx) {
  const a = document.createElement('button');
  a.type = 'button';
  a.className = 'rx-chip rx-add';
  a.appendChild(icon('plus', 11));
  sayWhyUnread(a, ctx);
  a.setAttribute('aria-label', t('Add reaction'));
  a.onclick = (ev) => { ev.stopPropagation(); ctx.onAdd && ctx.onAdd(a); };
  return a;
}
/** owner ruling (2026-09-28): while the account's sign-in cannot READ reactions the `+` says why, by name — the same
 *  sentence as the window's line and the account card (`ctx.readNote`); re-spelled in place on a patch. */
function sayWhyUnread(a, ctx) {
  const note = (ctx && ctx.readNote) || '';
  const title = note ? `${t('Add reaction')} — ${note}` : t('Add reaction');
  if (a.title !== title) a.title = title;
  if (note) a.dataset.rxReadNote = '1'; else delete a.dataset.rxReadNote;
}
/**
 * PATCH a drawn row's strip IN PLACE (spec §4.4): the kept chips re-spelled, new keys appended BEFORE the `+`,
 * gone keys removed — by `data-key`, never a rebuilt strip. A row with no strip yet gets one (after its body).
 */
export function patchReactionStrip(row, rec, list, ctx) {
  if (!row) return;
  let strip = row.querySelector(':scope > .chanmsg-rx');
  const canAdd = !!(ctx && ctx.canAdd);
  if (!strip) {
    if (!list.length && !canAdd) return;
    strip = renderReactionStrip({ ...rec, reactions: list }, ctx);
    if (strip) row.appendChild(strip);
    return;
  }
  const drawn = [...strip.querySelectorAll(':scope > .rx-chip:not(.rx-add)')];
  const plan = Rx.chipPlan(drawn.map((c) => c.dataset.key), list);
  const byKey = new Map(drawn.map((c) => [c.dataset.key, c]));
  for (const k of plan.remove) { const c = byKey.get(k); if (c) c.remove(); }
  const add = strip.querySelector(':scope > .rx-add');
  for (const x of list) {
    const c = byKey.get(x.key);
    if (c && c.isConnected) spellChip(c, x, ctx);
    else strip.insertBefore(chipOf(x, ctx), add || null);
  }
  if (!canAdd && add) add.remove();
  if (canAdd && add) sayWhyUnread(add, ctx);
  if (canAdd && !add) strip.appendChild(addChip(ctx));
  if (!list.length && !canAdd) strip.remove();
}

/**
 * THE TOGGLE: `mine ? DELETE : POST` — the chip disabled while in flight, flipped by the ROUTE's folded answer
 * (never optimistically — a refused add writes nothing), a refusal worded by its code.
 */
export async function toggleReaction({ base, vid, key, mine, chip, onList }) {
  if (chip) { chip.disabled = true; setTimeout(() => { if (chip.isConnected) chip.disabled = false; }, IN_FLIGHT_MAX_MS); }
  const url = `${base}/messages/${encodeURIComponent(vid)}/reactions`;
  const r = mine
    ? await fetchJson(`${url}/${encodeURIComponent(key)}`, { method: 'DELETE' })
    : await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  if (chip) chip.disabled = false;
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  if (onList) onList(Array.isArray(r.reactions) ? r.reactions : []);
  return r;
}

// ── THE PICKER ──────────────────────────────────────────────────────────────
const setCache = new Map();   // adapterBase → Promise of the set (for the session)
/** The adapter's vocabulary (`GET …/emoji-set`), cached for the window's session. */
export function loadEmojiSet(adapterBase) {
  if (!setCache.has(adapterBase)) {
    const p = fetchJson(`${adapterBase}/emoji-set`).then((r) => (r && !r.error ? r : Promise.reject(r)));
    p.catch(() => setCache.delete(adapterBase));
    setCache.set(adapterBase, p);
  }
  return setCache.get(adapterBase);
}
function pickOf(e, adapterBase) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rx-pick';
  b.dataset.key = e.key;
  b.title = e.label || e.key;
  b.setAttribute('aria-label', e.label || e.key);
  b.appendChild(faceOf({ key: e.key, glyph: e.glyph || null, customImage: e.custom ? `emoji:${e.key}` : null }, adapterBase));
  return b;
}
/**
 * OPEN THE PICKER at `anchor`: `set` = the vocabulary, `onPick(key)`; `replaces` = the glyph a one-reaction vendor
 * (Telegram) would replace. The grid holds ONLY the keys the set lists; Esc / an outside press closes it.
 */
export function openReactionPicker(anchor, { set, adapterBase, onPick, replaces = null } = {}) {
  const pop = createPopover(anchor, 'rx-picker');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', t('Add reaction'));
  if (replaces) pop.appendChild(el('div', 'rx-picker-note', t('Replaces your {glyph}', { glyph: replaces })));
  const keys = (set && Array.isArray(set.keys) ? set.keys : []);
  const quick = Rx.quickSet(set || {}).map((k) => keys.find((e) => e.key === k)).filter(Boolean);
  const qrow = el('div', 'rx-picker-quick');
  for (const e of quick) qrow.appendChild(pickOf(e, adapterBase));
  pop.appendChild(qrow);
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'rx-picker-search';
  search.placeholder = t('Search emoji');
  search.setAttribute('aria-label', t('Search emoji'));
  pop.appendChild(search);
  const grid = el('div', 'rx-picker-grid');
  pop.appendChild(grid);
  const drawn = new Map();   // key → button (the grid is KEYED: a search re-orders nothing, it hides / shows)
  for (const e of keys) { const b = pickOf(e, adapterBase); drawn.set(e.key, b); grid.appendChild(b); }
  const visible = () => [...qrow.children, ...[...grid.children].filter((b) => !b.hidden)];
  const done = (key) => { pop.remove(); onPick && onPick(key); };
  pop.addEventListener('click', (ev) => { const b = ev.target.closest('.rx-pick'); if (b && pop.contains(b)) { ev.stopPropagation(); done(b.dataset.key); } });
  search.addEventListener('input', () => {
    const hits = new Set(Rx.searchSet(set || {}, search.value, 1000).map((e) => e.key));
    for (const [k, b] of drawn) b.hidden = !hits.has(k);
  });
  // arrows move (8 a row in the grid), Enter picks
  pop.addEventListener('keydown', (ev) => {
    const list = visible();
    const i = list.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[ev.key];
    if (step !== undefined) {
      ev.preventDefault();
      const j = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + step));
      if (list[j]) list[j].focus();
    } else if (ev.key === 'Enter' && i >= 0) { ev.preventDefault(); done(list[i].dataset.key); }
  });
  requestAnimationFrame(() => { const first = visible()[0]; (first || search).focus(); });
  return pop;
}
