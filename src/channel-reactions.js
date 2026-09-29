'use strict';
/**
 * REACTIONS — THE FOLD, THE VOCABULARY, THE WORDS — PURE (lane channel-threads,
 * 2026-09-28; the owner: "… 以及 reaction (附加在消息上的表情)").
 *
 * Imports only src/channel-record.js (the schema + bounds live beside the
 * record). CJS so the engine (the read shape, the agent's text, the stash
 * digest line), the bundle (the chips, the picker) and the suites share ONE
 * spelling.
 *
 * A reaction is a MUTABLE fact about an IMMUTABLE message. The message log is
 * append-only, so the facts land in the conversation's SIDE log — a `delta`
 * per event (an add / a remove by one actor), a `snapshot` per vendor list
 * answer — and every reader FOLDS them at read time:
 *  F1 in `(at, sideKey)` order; a snapshot REPLACES the message's state (keys
 *     not in it are gone); a delta ADJUSTS: `add` ⇒ +1 and the actor to the
 *     front of `by` (deduped, cut to BY_MAX; an actor already listed is not
 *     counted twice), `remove` ⇒ −1 (floor 0; a key at 0 is dropped) and the
 *     actor leaves `by`.
 *  F2 a delta OLDER than the newest snapshot is ignored (the snapshot holds
 *     its effect — or its undoing); a NEWER one applies on top.
 *  F3 `mine` = the account's own user is in `by`, OR its newest delta for the
 *     key is an `add` newer than the last snapshot (a snapshot cut to 20 ids
 *     may not list it).
 *  F4 `count` ≤ 1e6 and ≥ `by.length`; `byTruncated` = count − by.length.
 *  F5 total: a malformed line contributes nothing and throws nothing.
 *  F6 `glyph` / `label` from the ADAPTER's declared vocabulary; a key it does
 *     not know is drawn as `:key:` text — never nothing, never a vendor image.
 * Keys come out in FIRST-APPEARANCE order, so a re-fold of the same input is
 * the same list and the window's keyed chips never reorder under the pointer.
 *
 * IDENTITY (§6.4): the `by` names are the OWNER's to see (the reactors are
 * members of a conversation the owner reads); an AGENT's view is counts and
 * whether the account's user reacted — `forAgent` strips `by`, and the
 * agent's words never name a reactor.
 */
const R = require('./channel-record.js');

const BY_MAX = R.REACTION_BY_MAX;
/** The picker's quick row. */
const QUICK_MAX = 24;
/** A digest line per message per hour, at most this many per conversation per turn (§5.4). */
const DIGEST_LINES_MAX = 5;

/** `u1f44d` / `u1f468-200d-1f4bb`: our key for a UNICODE glyph (a vendor whose
 *  vocabulary is the emoji itself — Telegram) — an identifier in the key
 *  alphabet, derived from the glyph and back. */
function unicodeKeyOf(glyph) {
  if (!R.isReactionGlyph(glyph)) return null;
  const cps = [];
  for (const ch of glyph) cps.push(ch.codePointAt(0).toString(16));
  const k = 'u' + cps.join('-');
  return R.isReactionKey(k) ? k : null;
}
function glyphOfUnicodeKey(key) {
  if (typeof key !== 'string' || !/^u[0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,7}$/.test(key)) return null;
  let s = '';
  for (const h of key.slice(1).split('-')) { const n = parseInt(h, 16); if (!(n > 0 && n <= 0x10ffff)) return null; s += String.fromCodePoint(n); }
  return R.isReactionGlyph(s) ? s : null;
}

/**
 * THE KEY OF A PICK: a vocabulary key as it stands (case kept — L9: a vendor's
 * names are mixed-case identifiers and case sensitivity is not confirmed, so
 * a key's case is never changed), or a unicode glyph turned into its `u…`
 * key. null = not a reaction (the route answers `bad-emoji`).
 */
function reactionKeyOf(input) {
  if (typeof input !== 'string' || !input) return null;
  if (R.isReactionKey(input)) return input;
  return unicodeKeyOf(input);
}

/**
 * F6 — a key's glyph + label from the adapter's declared vocabulary
 * (`{keys:[{key, glyph, label, custom}]}`): exact first; a case-insensitive
 * match for DISPLAY only; a `u…` key's own glyph; else `{glyph:null,
 * label:key}` (the chip draws `:key:`). A custom key is drawn as a picture
 * through OUR route (`emoji:<key>`), never a vendor URL.
 */
function emojiOf(vocabulary, key) {
  const keys = vocabulary && Array.isArray(vocabulary.keys) ? vocabulary.keys : [];
  let hit = null;
  for (const e of keys) if (e && e.key === key) { hit = e; break; }
  if (!hit && typeof key === 'string') { const lk = key.toLowerCase(); for (const e of keys) if (e && typeof e.key === 'string' && e.key.toLowerCase() === lk) { hit = e; break; } }
  if (hit) {
    const glyph = R.isReactionGlyph(hit.glyph) ? hit.glyph : null;
    return { glyph, label: R.peerName(String(hit.label || key), R.REACTION_LABEL_MAX) || String(key || '').slice(0, R.REACTION_LABEL_MAX), customImage: hit.custom === true ? `emoji:${hit.key}` : null };
  }
  const g = glyphOfUnicodeKey(key);
  return { glyph: g, label: String(key || '').slice(0, R.REACTION_LABEL_MAX), customImage: null };
}

/** The picker's quick row: the adapter's own `quick` (only keys the set
 *  lists), else the first QUICK_MAX of the set. */
function quickSet(set, n = QUICK_MAX) {
  const keys = set && Array.isArray(set.keys) ? set.keys.filter((e) => e && R.isReactionKey(e.key)) : [];
  const known = new Set(keys.map((e) => e.key));
  const q = set && Array.isArray(set.quick) ? set.quick.filter((k) => known.has(k)) : [];
  const out = q.length ? q : keys.map((e) => e.key);
  return out.slice(0, Math.max(1, n));
}

/** Search the picker's set (substring over label + key; bounded input). */
function searchSet(set, q, n = 200) {
  const keys = set && Array.isArray(set.keys) ? set.keys : [];
  const s = String(q || '').slice(0, 64).trim().toLowerCase();
  if (!s) return keys.slice(0, n);
  return keys.filter((e) => e && (String(e.key || '').toLowerCase().includes(s) || String(e.label || '').toLowerCase().includes(s))).slice(0, n);
}

/**
 * THE FOLD (F1–F6). `side` = every side record of ONE message, any order
 * (`k:'rx'` only are read; anything else contributes nothing). `selfId` = the
 * account's own user id as its token records it (never stored — a
 * re-authorization as another person changes "mine" honestly). `names` =
 * `Map<id, name>` of the conversation's members (a snapshot lists ids only).
 * → the read-shape list, validated by `validateReactions`.
 */
function foldReactions(side, { selfId = null, byMax = BY_MAX, names = null, vocabulary = null } = {}) {
  const lines = [];
  for (const x of Array.isArray(side) ? side : []) {
    if (!x || typeof x !== 'object' || x.k !== 'rx') continue;
    if (x.form !== 'delta' && x.form !== 'snapshot') continue;                         // F5
    if (x.form === 'delta' && (!R.isReactionKey(x.key) || !x.actor || !x.actor.id || (x.op !== 'add' && x.op !== 'remove'))) continue;
    if (!(Number(x.at) > 0)) continue;
    lines.push(x);
  }
  const keyOf = (x) => R.sideKey(x);
  lines.sort((a, b) => (Number(a.at) - Number(b.at)) || (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));   // F1
  let snapAt = 0;
  let snap = null;
  for (const x of lines) if (x.form === 'snapshot' && Number(x.at) >= snapAt) { snapAt = Number(x.at); snap = x; }
  // FIRST APPEARANCE of what CONTRIBUTES: the newest snapshot's keys in the vendor's order, then each key an `add`
  // newer than it brings — the same order the side log's compaction writes, so a trim never reorders the chips
  const order = new Map();
  const seeOrder = (k) => { if (!order.has(k)) order.set(k, order.size); };
  if (snap) for (const e of Array.isArray(snap.list) ? snap.list : []) { if (e && R.isReactionKey(e.key)) seeOrder(e.key); }
  for (const x of lines) if (x.form === 'delta' && x.op === 'add' && !(snap && Number(x.at) <= snapAt)) seeOrder(x.key);
  const state = new Map();   // key -> {count, by: [ids], mineDelta: null|'add'|'remove'}
  const nameOf = new Map();
  if (snap) {
    for (const e of Array.isArray(snap.list) ? snap.list : []) {
      if (!e || !R.isReactionKey(e.key)) continue;
      const by = (Array.isArray(e.by) ? e.by : []).map(String).filter(Boolean).slice(0, byMax);
      const count = Math.max(by.length, Math.min(R.REACTION_COUNT_MAX, Math.floor(Number(e.count) || 0)));
      if (count > 0) state.set(e.key, { count, by, mineDelta: null });
    }
  }
  for (const x of lines) {
    if (x.form !== 'delta') continue;
    if (snap && Number(x.at) <= snapAt) continue;                                         // F2
    const actor = String(x.actor.id);
    if (x.actor.name) nameOf.set(actor, R.peerName(String(x.actor.name), 200) || '');
    let s = state.get(x.key);
    if (x.op === 'add') {
      if (!s) { s = { count: 0, by: [], mineDelta: null }; state.set(x.key, s); }
      const had = s.by.indexOf(actor);
      if (had >= 0) s.by.splice(had, 1); else s.count = Math.min(R.REACTION_COUNT_MAX, s.count + 1);
      s.by.unshift(actor);
      if (s.by.length > byMax) s.by.length = byMax;
    } else if (s) {
      s.count = Math.max(0, s.count - 1);
      const had = s.by.indexOf(actor);
      if (had >= 0) s.by.splice(had, 1);
    }
    if (s && selfId && actor === String(selfId)) s.mineDelta = x.op;                   // F3's tie-breaker (newest wins: lines are in order)
    if (s && s.count <= 0) state.delete(x.key);
  }
  const out = [];
  for (const [key, s] of state) {
    if (!(s.count > 0)) continue;
    const count = Math.max(s.by.length, s.count);                                        // F4
    const mine = !!selfId && (s.mineDelta === 'add' || (s.mineDelta !== 'remove' && s.by.includes(String(selfId))));
    const e = emojiOf(vocabulary, key);
    const by = s.by.map((id) => ({ id, name: (names && typeof names.get === 'function' && names.get(id)) || nameOf.get(id) || '', ...(selfId && id === String(selfId) ? { self: true } : {}) }));
    out.push({ key, glyph: e.glyph, label: e.label, count, mine, by, byTruncated: Math.max(0, count - by.length), customImage: e.customImage });
  }
  out.sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
  return R.validateReactions(out).reactions;
}

/**
 * THE SIDE LOG'S COMPACTION (the store's `trimSide`, invariant 8): every side line of ONE message → the lines to
 * keep. Its reaction lines (more than one) fold into ONE snapshot at the newest line's instant — the same F1 / F2
 * arithmetic as `foldReactions`, the reactors' ids kept newest-first with their reaction ids (our own id is what an
 * unreact needs) — and only its NEWEST thread stat is kept. A message then holds at most two lines, whatever its
 * history. Total: malformed lines vanish.
 */
function compactSide(lines) {
  const rx = [], th = [];
  for (const x of Array.isArray(lines) ? lines : []) {
    if (!x || typeof x !== 'object' || !(Number(x.at) > 0)) continue;
    if (x.k === 'th') th.push(x);
    else if (x.k === 'rx' && (x.form === 'snapshot' || (x.form === 'delta' && R.isReactionKey(x.key) && x.actor && x.actor.id && (x.op === 'add' || x.op === 'remove')))) rx.push(x);
  }
  const out = [];
  if (rx.length <= 1) out.push(...rx);
  else {
    const kf = (x) => R.sideKey(x);
    rx.sort((a, b) => (Number(a.at) - Number(b.at)) || (kf(a) < kf(b) ? -1 : kf(a) > kf(b) ? 1 : 0));
    let snap = null;
    for (const x of rx) if (x.form === 'snapshot') snap = x;
    // the snapshot's keys in the vendor's order, then each key a newer add brings — the same first-appearance order
    // the fold draws. (verify r1: `order` was an ARRAY scanned per delta — quadratic in distinct keys: 4 000 keys
    // 10 ms, 16 000 keys 143 ms — on the append path since the growth compaction; a Set answers in O(1).)
    const state = new Map();
    const order = new Set();   // first appearance, never removed (a key that fell to 0 and came back keeps its place)
    if (snap) for (const e of Array.isArray(snap.list) ? snap.list : []) {
      if (!e || !R.isReactionKey(e.key)) continue;
      const by = (Array.isArray(e.by) ? e.by : []).map((id, i) => ({ id: String(id), rid: Array.isArray(e.rids) && e.rids[i] ? String(e.rids[i]) : '' })).filter((b) => b.id).slice(0, BY_MAX);
      const count = Math.max(by.length, Math.floor(Number(e.count) || 0));
      if (count > 0) { state.set(e.key, { count, by }); order.add(e.key); }
    }
    const snapAt = snap ? Number(snap.at) : 0;
    let truncated = !!(snap && snap.truncated);
    for (const x of rx) {
      if (x.form !== 'delta' || (snap && Number(x.at) <= snapAt)) continue;
      const actor = String(x.actor.id);
      let s = state.get(x.key);
      if (x.op === 'add') {
        if (!s) { s = { count: 0, by: [] }; state.set(x.key, s); order.add(x.key); }
        const had = s.by.findIndex((b) => b.id === actor);
        if (had >= 0) s.by.splice(had, 1); else s.count += 1;
        s.by.unshift({ id: actor, rid: x.rid ? String(x.rid) : '' });
        if (s.by.length > BY_MAX) { s.by.length = BY_MAX; truncated = true; }
      } else if (s) {
        s.count = Math.max(0, s.count - 1);
        const had = s.by.findIndex((b) => b.id === actor);
        if (had >= 0) s.by.splice(had, 1);
        if (s.count <= 0) state.delete(x.key);
      }
    }
    const last = rx[rx.length - 1];
    // the read shape never shows more than REACTIONS_MAX keys (validateReactions refuses the rest), so the compacted
    // snapshot keeps the first REACTIONS_MAX in order and says `truncated` — a line stays within its bound
    const list = [];
    for (const k of order) { const s = state.get(k); if (!s) continue; if (list.length >= R.REACTIONS_MAX) { truncated = true; break; } list.push({ key: k, count: Math.max(s.by.length, s.count), by: s.by.map((b) => b.id), rids: s.by.map((b) => b.rid) }); }
    out.push({ k: 'rx', msg: String(last.msg), at: Number(last.at), form: 'snapshot', src: 'list', list, ...(truncated ? { truncated: true } : {}) });
  }
  if (th.length) { let newest = th[0]; for (const x of th) if (Number(x.at) >= Number(newest.at)) newest = x; out.push(newest); }
  return out;
}

/** The OWN reaction ids a snapshot names for the account's user (the unreact
 *  needs the vendor's `reaction_id`; never served to a client — §6.4). */
function myRidsOf(snapshot, selfId) {
  const out = {};
  if (!snapshot || snapshot.form !== 'snapshot' || !selfId) return out;
  for (const e of Array.isArray(snapshot.list) ? snapshot.list : []) {
    if (!e || !Array.isArray(e.by)) continue;
    const i = e.by.indexOf(String(selfId));
    if (i >= 0 && Array.isArray(e.rids) && e.rids[i]) out[e.key] = String(e.rids[i]);
  }
  return out;
}

/** §6.4 — what an AGENT may see of a reaction list: counts and whether the
 *  ACCOUNT's user reacted. Never `by`, never `byTruncated`, never an id. */
function forAgent(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({ key: x.key, glyph: x.glyph || null, label: x.label || x.key, count: Number(x.count) || 0, mine: x.mine === true }));
}

/** One reaction as text: the glyph when known, `:key:` otherwise. */
function reactionText(x) { return (x && x.glyph) || `:${(x && x.key) || '?'}:`; }

/**
 * §1.8 / §6.4 — the agent's line: `reactions: 👍 3 (the account owner) ·
 * :party_parrot: 1`. NEVER a reactor's name (the argument is stripped first,
 * whatever it carries). Frame-inert. '' when there is none.
 */
function agentReactionsLine(list) {
  const xs = forAgent(list).filter((x) => x.count > 0);
  if (!xs.length) return '';
  return R.inertFrameLine('reactions: ' + xs.map((x) => `${reactionText(x)} ${x.count}${x.mine ? ' (the account owner)' : ''}`).join(' · '));
}

/**
 * §5.4 — THE DIGEST LINE for the drafting agent's next-turn stash: reactions
 * on a message it SENT from here, as ONE line: `👍 ×3 · 🎉 ×1 on your reply in
 * <conversation>` (the title neutered + clipped; never a name). '' for none.
 */
function reactionDigestLine(list, { title = '' } = {}) {
  const xs = forAgent(list).filter((x) => x.count > 0);
  if (!xs.length) return '';
  const where = String(title || '').slice(0, 1024).replace(/[\r\n\t]+/g, ' ').slice(0, 120);   // bound before the parse (a title is ≤ 300 at ingest; the cut here is the belt)
  return R.inertFrameLine(`${xs.map((x) => `${reactionText(x)} ×${x.count}`).join(' · ')} on your reply in ${where || 'a conversation'}`);
}

/** The window's hover / long-press words: "You, A, B and 2 more" as STRUCTURE
 *  (the client words "you" and "and N more" with its own t). NAMES ONLY (the
 *  naive-user pass, 2026-09-28 — the titles read "👌 u-me, Ada, Brook and 7
 *  more": the account owner's own id, and the id of every reactor the
 *  conversation has no name for, an `ou_…` on Lark): the owner is `self` (the
 *  fold's mark, or `mine`), a reactor with no name is COUNTED in `more`, an id
 *  is never shown. `max` bounds everything drawn, the owner included. */
function whoList(x, max = 3) {
  const all = x && Array.isArray(x.by) ? x.by : [];
  const self = !!(x && x.mine === true);
  const named = all.filter((b) => b && b.self !== true && b.name).map((b) => b.name);
  const shown = named.slice(0, Math.max(0, Math.max(1, max) - (self ? 1 : 0)));
  const more = Math.max(0, (Number(x && x.count) || 0) - shown.length - (self ? 1 : 0));
  return { self, names: shown, more };
}

/** The reaction strip's KEYED patch plan (the a3 keyed-chips rule): which
 *  drawn keys stay (count / mine re-spelled in place), which are new
 *  (appended), which are gone (removed) — never a rebuilt strip. */
function chipPlan(drawnKeys, list) {
  const next = (Array.isArray(list) ? list : []).map((x) => x.key);
  const had = new Set(Array.isArray(drawnKeys) ? drawnKeys : []);
  const want = new Set(next);
  return { keep: next.filter((k) => had.has(k)), add: next.filter((k) => !had.has(k)), remove: [...had].filter((k) => !want.has(k)) };
}

module.exports = {
  BY_MAX, QUICK_MAX, DIGEST_LINES_MAX,
  unicodeKeyOf, glyphOfUnicodeKey, reactionKeyOf, emojiOf, quickSet, searchSet, foldReactions, compactSide, myRidsOf, forAgent, reactionText,
  agentReactionsLine, reactionDigestLine, whoList, chipPlan,
};
