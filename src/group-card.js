'use strict';
/**
 * A GROUP MESSAGE IS SEEN WHERE IT WAS HANDED OVER (lane group-report-card; the owner, 2026-09-28 22:45 PDT:
 * "怎么在那个对话里看不到你发了消息？"). PURE (imports nothing; CJS so the server's card door, the three normalizers
 * and the bundle's renderer share ONE spelling of every rule).
 *
 * A `vibespace-msg send <group>` without --wake rides the receiving member's next USER turn as a report inside the
 * hook injection (src/server/groups-engine.js `reportsForTurn` / `commitReports`). The agent read it; the human
 * looking at that conversation saw nothing. Now every group MESSAGE a report carries is a CARD in the chat, emitted
 * at the injection through the delivery ladder's card door (`deliver.emitPeerCard`), and a wake's card (the ladder's
 * own, after a successful post) says the same thing the same way:
 *
 *   THE CARD   `{fromName, text, kind: 'group', group: {id, name, at, from, self, via, more, cut}}` — `group.at` is
 *              the group RECORD's own instant (with `id` it is the card's key), `via` = 'report' (it rode a turn
 *              somebody typed) | 'wake' (it started a turn), `more` = the older messages of that group the report
 *              did not show (counted on its oldest card: "… and N more (vibespace-msg read <group>)"), `cut` = the
 *              agent saw this one cut short (the text IS what it saw).
 *   THE KEY    `<group id>:<record instant>` — a message carded once is never carded again in that conversation (a
 *              re-report after a restart whose marker write was lost, a wake over the same log range).
 *   THE RING   `session._groupCards` = `[{k, at, card}]`, oldest first, bounded (RING_MAX), persisted in the
 *              session meta (`groupCards`): a report card is PLACED by the rebuild after a restart (BY TIME —
 *              `placeAt`); a wake's card carries `recordedHead` (the start of the text the ladder posted): the CLI
 *              RECORDED that post, so the rebuild draws the transcript's own record AS the group card (upgraded in
 *              place — its id, its position), never a second card beside it.
 *
 * The renderer draws `peerGroup` (the sanitized `group`) as "<sender> → <group>" — a PEER's words, never a VibeSpace
 * notice (`peerVia` stays 'peer'). Gate: scripts/test-channel-groups.mjs §7.
 */

const GROUP_ID_RE = /^g-[0-9a-f]{8}$/;
const NAME_MAX = 120;
const TEXT_MAX = 4 * 1024;        // a report line is ≤ 400 characters (channel-groups LINE_MAX) — the card never grows the meta
const RECORDED_HEAD_MAX = 400;    // what a wake's ring entry keeps of the posted text: enough to find the transcript's record
const RING_MAX = 120;             // the newest keys + cards a conversation keeps (a meta record, not a log)
/** A rebuild places a group card this long AFTER the injection instant: the turn's own user record and the hook's
 *  attachment records are stamped around the hook call (either side of it), the reply's first record later — live
 *  the card sits under the user's message, and the rebuild must say the same. */
const PLACE_SLACK_MS = 2000;
const VIAS = Object.freeze(['report', 'wake']);

const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function oneLine(v, max) {
  const s = String(v == null ? '' : v).replace(CTRL_RE, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** The card's group facts, sanitized — `{id, name, at, from, self, via, more, cut}` or null (never markup: the
 *  renderer escapes every string; this bounds them and drops what is not a fact). */
function groupOf(g) {
  if (!g || typeof g !== 'object') return null;
  const id = String(g.id || '');
  if (!GROUP_ID_RE.test(id)) return null;
  const at = Number(g.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const more = Math.max(0, Math.min(1e6, Math.floor(Number(g.more) || 0)));
  return {
    id, name: oneLine(g.name, NAME_MAX) || id, at,
    from: oneLine(g.from, NAME_MAX) || null,
    self: g.self === true,
    via: VIAS.includes(g.via) ? g.via : 'report',
    more, cut: g.cut === true,
  };
}
/** THE KEY: one card per (group, record) in a conversation. */
function cardKey(g) { const x = groupOf(g); return x ? `${x.id}:${x.at}` : null; }
/** The card's message id in a normalizer — stable across rebuilds (the live op and the rebuild name the SAME card). */
function cardId(sessionId, g) { const x = groupOf(g); return x ? `${sessionId || 'view'}:gm:${x.id}:${x.at}` : null; }

/** A whole card as the door stores it — `{fromName, text, group, shownAt, recorded?, recordedHead?}` or null.
 *  `shownAt` = the injection instant (the door stamps it); `recorded` = the exact text the ladder posted (a wake: the
 *  CLI's transcript holds that record); `recordedHead` = its start, what the RING keeps of it. */
function normalizeCard(card, { now = 0 } = {}) {
  if (!card || typeof card !== 'object') return null;
  const group = groupOf(card.group);
  if (!group) return null;
  let text = String(card.text == null ? '' : card.text).replace(CTRL_RE, '');
  if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX - 1) + '…';
  if (!text.trim()) return null;
  const shownAt = Number(card.shownAt) > 0 ? Number(card.shownAt) : Number(now) || 0;
  // the SENDER is the group's own `from` (the ladder's card label is "<sender> · <group>" — for an older client)
  const fromName = group.self ? null : (group.from || oneLine(card.fromName, NAME_MAX) || null);
  const head = typeof card.recordedHead === 'string' ? card.recordedHead.trim().slice(0, RECORDED_HEAD_MAX) : '';
  return { fromName, text, group, shownAt, ...(typeof card.recorded === 'string' ? { recorded: card.recorded } : {}), ...(head ? { recordedHead: head } : {}), ...(card.cleared === true ? { cleared: true } : {}) };
}
/** The start of a posted text as the ring keeps it (`recordedHead`) — the rebuild finds the transcript's record by it. */
function recordedHeadOf(text) { return String(text == null ? '' : text).trim().slice(0, RECORDED_HEAD_MAX); }

/** THE RING. */
function ringHas(ring, key) { return !!key && Array.isArray(ring) && ring.some((e) => e && e.k === key); }
function ringAdd(ring, entry, max = RING_MAX) {
  ring.push(entry);
  if (ring.length > max) ring.splice(0, ring.length - max);
  return ring;
}
/** The ring's REPORT cards — the ones a rebuild places by time (a wake's card has its transcript record) —, oldest
 *  injection first. */
function ringCards(ring) {
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    const c = e && e.card ? normalizeCard(e.card) : null;
    if (c && c.shownAt > 0 && !c.recordedHead) out.push(c);
  }
  return out.sort((a, b) => a.shownAt - b.shownAt);
}
/** The ring's WAKE cards (`recordedHead`): the rebuild upgrades the transcript record that holds each post. */
function ringWakeCards(ring) {
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    const c = e && e.card ? normalizeCard(e.card) : null;
    if (c && c.recordedHead) out.push(c);
  }
  return out;
}
/**
 * "CLEAR CONTENT…" REACHES THE CARD (the .197 integration, lane-redact × lane group-report-card): a group message the
 * owner cleared loses its words in every ring that carded it — the entry keyed `keys` (THE KEY: `<group>:<record
 * instant>`) keeps its place, its group facts and its instant; its text becomes `text` (the stored sentence) and it is
 * marked `cleared` (the renderer words it in the device's language). A wake's entry keeps `recordedHead` (the CLI
 * recorded that post: the transcript's own record is what a rebuild upgrades — the transcript class). Returns the
 * entries it changed (already-cleared ones are not changed twice).
 */
function redactRing(ring, keys, text) {
  const want = new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String));
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    if (!e || !want.has(String(e.k)) || !e.card || e.card.cleared === true) continue;
    e.card = { ...e.card, text: String(text == null ? '' : text), cleared: true };
    out.push(e);
  }
  return out;
}
/** Where a rebuild places a card: its injection instant + the slack (records stamped before it come first). */
function placeAt(card) { return (Number(card && card.shownAt) || 0) + PLACE_SLACK_MS; }
/** Is this a group card (the door's ONE predicate — a ladder card with `group` is one too)? */
function isGroupCard(card) { return !!(card && typeof card === 'object' && card.group && GROUP_ID_RE.test(String(card.group.id || ''))); }

/** A waiting group message as the stash summary reads an entry (src/stash-summary.js kindOf: source 'group'): the
 *  sender's name as its label, `text` = "<sender> · <the message's first line>" — the Details row a preview draws. */
function pendingEntry(p) {
  if (!p || typeof p !== 'object') return null;
  const at = Number(p.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const first = String(p.text == null ? '' : p.text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const from = p.self ? null : (oneLine(p.from, NAME_MAX) || null);
  return { source: 'group', fromName: from, text: from ? `${from} · ${first}` : first, ts: at, groupId: String(p.groupId || '') };
}

module.exports = { GROUP_ID_RE, NAME_MAX, TEXT_MAX, RECORDED_HEAD_MAX, RING_MAX, PLACE_SLACK_MS, VIAS, groupOf, cardKey, cardId, normalizeCard, recordedHeadOf, ringHas, ringAdd, ringCards, ringWakeCards, redactRing, placeAt, isGroupCard, pendingEntry };
