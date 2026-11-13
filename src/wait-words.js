'use strict';
// PURE (imports nothing; CJS) — THE WORDS OF A WAIT (lane queued-is-not-woke laws 2 + 3, SHAPE C — 主开发's rulings 2026-11-13
// 13:35Z / 13:42Z). Every sentence is a fact the hub READ AT THAT MOMENT from its own record: how many messages it has NOT
// HANDED to a conversation in a running turn (no count where its read reached its bound — then «since at least» the oldest it
// saw), the oldest one's instant, the opening of the turn running NOW where a record states it (else «in a turn» — claude
// always), and a «waiting for you» card open (the chip's own fact). Never a verdict about a turn.
//  · the SENDER, at SENDER_MS of its own oldest message not handed: ONE entry naming every such member (src/server/wait-watch.js
//    files it in the ladder's keyed slot — one per sender, replaced in place, filed again only when the set of members changes);
//  · the OWNER, at OWNER_MS of the conversation's oldest: ONE For-you item for that conversation and that turn.

const MIN = 60e3;
const SENDER_MS = 60 * MIN;    // the sender is told at one hour
const OWNER_MS = 240 * MIN;    // the owner's ONE item at four hours — a constant, not a setting
const TICK_MS = 5 * MIN;       // the sweep (ages are in hours — 主开发 13:42Z b)

/** THE SENDER'S ONE ENTRY (a free next-turn line — never a wake): `members` = [{name, n (null at the bound), oldestText,
 *  openedText, card}], each a member ITS messages wait for, times as owner-facts.when wrote them (the zone named) */
function senderEntry(members = []) {
  const part = (m) => {
    const count = m.n == null ? `since at least ${m.oldestText}` : m.n === 1 ? `1, sent at ${m.oldestText}` : `${m.n}, the oldest sent at ${m.oldestText}`;
    const turn = m.openedText ? `in a turn since ${m.openedText}` : 'in a turn';
    return `to ${m.name} (${count}; ${turn}${m.card ? '; a waiting-for-you card is open in it' : ''})`;
  };
  return `(VibeSpace) Your group messages have not been handed yet: ${members.map(part).join('; ')}.`;
}

// THE OWNER'S ITEM: dictionary keys (zh / ja); each instant a param the client says in the viewer's zone ({at}). What it counts
// is group messages; at the read's bound it says no count and «since at least».
const OWNER_TEXT = Object.freeze({
  one: '1 group message has not been handed to {name} yet — sent at {since}',
  many: '{n} group messages have not been handed to {name} yet — the oldest sent at {since}',
  atLeast: 'Group messages have not been handed to {name} yet — since at least {since}',
});
const OWNER_LINES = Object.freeze({ opened: 'Its turn opened at {opened}.', inTurn: 'It is in a turn.', card: 'A waiting-for-you card is open in it.' });
const hhmm = (at) => { const d = new Date(Number(at)); return Number.isFinite(d.getTime()) && Number(at) > 0 ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''; };
const opened = (at) => Number.isFinite(Number(at)) && Number(at) > 0;

/** the owner's item as the record says it (English, UTC named) and as each viewer reads it (i18n: keys + params) */
function ownerWords({ name, n = null, since, openedAt = null, card = false } = {}) {
  const key = n == null ? OWNER_TEXT.atLeast : n === 1 ? OWNER_TEXT.one : OWNER_TEXT.many;
  const turnKey = opened(openedAt) ? OWNER_LINES.opened : OWNER_LINES.inTurn;
  // ONE pass with a function: a name holding «{since}» or a «$» pattern never corrupts the text
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (x in p ? p[x] : m));
  const text = fill(key, { n: String(n), name: String(name), since: hhmm(since) });
  const detail = [fill(turnKey, { opened: hhmm(openedAt) }), card ? OWNER_LINES.card : ''].filter(Boolean).join(' ');
  const i18n = {
    text: { key, params: { ...(n == null ? {} : { n }), name: String(name), since: { at: Number(since) } } },
    detail: [turnKey === OWNER_LINES.opened ? { key: turnKey, params: { opened: { at: Number(openedAt) } } } : { key: turnKey }, ...(card ? [{ key: OWNER_LINES.card }] : [])],
  };
  return { text, detail, i18n };
}

module.exports = { SENDER_MS, OWNER_MS, TICK_MS, hhmm, senderEntry, OWNER_TEXT, OWNER_LINES, ownerWords };
