'use strict';
/**
 * A STORED MESSAGE KEEPS LEARNING (lane channel-record-revisions, owner 2026-10-13: "userW刚才把那个消息撤回了，我们系统怎么
 * 完全没标记…应该标记撤回+折叠，包括消息编辑也提供一个展开编辑历史的方法") — PURE, CJS: the engine, the store's trim, the
 * browser bundle and the suites share ONE definition. Imports only src/channel-record.js.
 *
 *  V1 the stored record is the ORIGINAL and is never overwritten; an edit is an `rv` side line (one per `editedAt`), a
 *     recall the `fx` line's `recalled` flag (a flag never un-happens). Nothing a peer does deletes our copy.
 *  V2 `foldVersions(record, lines)` → the versions oldest → newest (the original first, a repeat of the previous text
 *     dropped); the CURRENT body = the newest. A recall keeps every version.
 *  V3 THE RECHECK (`planRecheck`): a stored message younger than RECHECK_FRESH_MS, or one a wake fired on younger than
 *     RECHECK_WOKE_MS, is re-read BY ID at most once per RECHECK_EVERY_MS, at most RECHECK_PER_PASS per account pass and
 *     RECHECK_PER_HOUR per account per sliding hour — woken-for first, then the newest; a recalled one is done. The
 *     owner's own Refresh (a forced pass) re-asks after RECHECK_FORCED_MS, inside the same hourly cap.
 *  V4 THE WOKEN-FOR LEDGER (lane channel-recall-ledger): `wokeKeyOf` = a row's key (the id the recheck asks with),
 *     `capWokeRows` = its fair bound (the conversation holding the most rows loses its oldest).
 */
const R = require('./channel-record.js');

const RECHECK_FRESH_MS = 24 * 3600e3;
const RECHECK_WOKE_MS = 7 * 24 * 3600e3;
const RECHECK_EVERY_MS = 3600e3;
const RECHECK_PER_PASS = 12;
/** The owner's own Refresh re-asks a message after RECHECK_FORCED_MS (a repeated press is not a flood) — still inside
 *  RECHECK_PER_HOUR. */
const RECHECK_FORCED_MS = 5e3;
const RECHECK_PER_HOUR = 240;
/** The newest versions a message keeps through the side log's trim (the original is the record itself). */
const VERSIONS_KEPT = 20;

/** V2: the versions of one message — `[{at, text, blocks?, original?, truncated?}]`, oldest first. */
function foldVersions(record, lines) {
  const r = record && typeof record === 'object' ? record : {};
  const out = [{ at: Number(r.at) || null, text: typeof r.text === 'string' ? r.text : '', ...(Array.isArray(r.blocks) ? { blocks: r.blocks } : {}), original: true }];
  const rv = (Array.isArray(lines) ? lines : []).filter((x) => x && x.k === 'rv' && Number(x.editedAt) > 0 && typeof x.text === 'string')
    .sort((a, b) => Number(a.editedAt) - Number(b.editedAt));
  for (const x of rv) {
    if (x.text === out[out.length - 1].text) continue;
    out.push({ at: Number(x.editedAt), text: x.text, ...(Array.isArray(x.blocks) ? { blocks: x.blocks } : {}), ...(x.truncated ? { truncated: true } : {}) });
  }
  return out;
}
/** When a message's recall was LEARNED: the earliest `fx` line naming it (null = not recalled). */
function recalledAtOf(lines) {
  let at = null;
  for (const x of Array.isArray(lines) ? lines : []) {
    if (!x || x.k !== 'fx' || !Array.isArray(x.facts) || !x.facts.some((f) => f && f.k === 'recalled' && f.v === true)) continue;
    const t = Number(x.at);
    if (t > 0 && (at === null || t < at)) at = t;
  }
  return at;
}
/** The facts a recheck learns, spelled HERE (the engine names no fact kind — test-channel-facts V7). */
const recallFacts = () => [{ k: 'recalled', v: true }];
const editFacts = (at) => [{ k: 'edited', v: Number(at) }];
/** The folded `edited` instant of a message's facts (0 = never edited). */
function editedAtOf(facts) { const f = (Array.isArray(facts) ? facts : []).find((x) => x && x.k === 'edited'); return (f && Number(f.v)) || 0; }
/** The store's trim: a message's `rv` lines, the newest VERSIONS_KEPT (each already judged when it was appended). */
function compactVersionLines(lines) {
  const xs = (Array.isArray(lines) ? lines : []).filter((x) => x && x.k === 'rv' && Number(x.editedAt) > 0);
  xs.sort((a, b) => Number(a.editedAt) - Number(b.editedAt));
  return xs.slice(-VERSIONS_KEPT);
}

/**
 * V3: which stored messages to re-read now. `items` = `[{key, at, wokeAt?, recalled?}]` (key = `${convId}\n${vendorId}`),
 * `last` = Map<key, the last recheck's ms>, `spent` = the account's recheck instants (any order). → the keys, in order.
 */
function planRecheck({ now, items = [], last = new Map(), spent = [], perPass = RECHECK_PER_PASS, perHour = RECHECK_PER_HOUR, forced = false } = {}) {
  const t = Number(now);
  if (!Number.isFinite(t)) return [];
  const room = Math.max(0, Math.min(perPass, perHour - (Array.isArray(spent) ? spent : []).filter((x) => Number(x) > t - 3600e3).length));
  if (!room) return [];
  const seen = new Set();
  const due = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it.key !== 'string' || seen.has(it.key) || it.recalled) continue;
    seen.add(it.key);
    const at = Number(it.at) || 0, woke = Number(it.wokeAt) || 0;
    const fresh = at > t - RECHECK_FRESH_MS;   // a vendor-skewed (future) stamp is still a stored message
    const wokeIn = woke > t - RECHECK_WOKE_MS;
    if (!fresh && !wokeIn) continue;
    const l = Number(last.get(it.key)) || 0;
    if (l && t - l < (forced ? RECHECK_FORCED_MS : RECHECK_EVERY_MS)) continue;
    due.push({ key: it.key, woke: wokeIn, at, l });
  }
  // woken-for first, then the least recently checked (never-checked first), then the newest
  due.sort((a, b) => (Number(b.woke) - Number(a.woke)) || (a.l - b.l) || (b.at - a.at));
  return due.slice(0, room).map((d) => d.key);
}

/** The agent's words (English, ours — the time is the only value): over the kept content. */
function agentRevisionLine({ recalledAt = null, versions = null } = {}, { iso = (ms) => new Date(ms).toISOString() } = {}) {
  const bits = [];
  if (recalledAt) bits.push(`[recalled at ${iso(recalledAt)} — the content below is the kept copy]`);
  if (Array.isArray(versions) && versions.length > 1) bits.push(`[edited: v${versions.length} of ${versions.length}; --versions shows all]`);
  return R.inertFrameLine(bits.join(' '));
}
/** The ONE next-turn note to a conversation a message was DELIVERED to (any road — a wake, a digest, the free next-turn
 *  stash), when that message is recalled (no peer words). "delivered", never "woken for" (lane boot-flush-next-turn: a
 *  next-turn watch is never woken, and its note said it was). */
function recallNoteText({ account = '', conversation = '', at = null } = {}, { iso = (ms) => new Date(ms).toISOString() } = {}) {
  const where = [account, conversation].filter(Boolean).join(' / ');
  return R.inertFrameLine(`The channel message delivered to you${at ? ` at ${iso(at)}` : ''}${where ? ` (${where})` : ''} was recalled by its sender. VibeSpace keeps its content (vibespace-channels read shows it marked).`);
}

/** THE WOKEN-FOR LEDGER'S KEY (lane channel-recall-ledger): a row is keyed by the message's REVISION key — the vendor
 *  id the by-id recheck asks with, the same for every version of the message (never the store's record id) — so a
 *  recall finds every conversation that holds any version of it. The engine's door writes it; the note looks it up. */
const WOKE_KEY_MAX = 512;
function wokeKeyOf(vid) { return vid === null || vid === undefined || vid === '' ? null : String(vid).slice(0, WOKE_KEY_MAX); }
/** The ledger's bound, FAIR (lane channel-recall-ledger): over `max` rows, the conversation holding the most rows loses
 *  its oldest first — a chatty next-turn watch never pushes another conversation's rows out (was: the newest `max`
 *  rows, whoever they named). Ties go to the conversation whose rows came first. */
function capWokeRows(rows, max) {
  const out = (Array.isArray(rows) ? rows : []).filter(Boolean);
  while (out.length > Math.max(0, max)) {
    const n = new Map();
    for (const w of out) n.set(w.cid, (n.get(w.cid) || 0) + 1);
    let top = null;
    for (const [cid, k] of n) if (top === null || k > n.get(top)) top = cid;
    let i = -1;
    for (let j = 0; j < out.length; j++) if (out[j].cid === top && (i < 0 || Number(out[j].at) < Number(out[i].at))) i = j;
    out.splice(i, 1);
  }
  return out;
}

module.exports = {
  RECHECK_FRESH_MS, RECHECK_WOKE_MS, RECHECK_EVERY_MS, RECHECK_FORCED_MS, RECHECK_PER_PASS, RECHECK_PER_HOUR, VERSIONS_KEPT,
  foldVersions, recalledAtOf, recallFacts, editFacts, editedAtOf, compactVersionLines, planRecheck, agentRevisionLine, recallNoteText,
  wokeKeyOf, capWokeRows,
};
