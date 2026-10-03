'use strict';
/**
 * A MESSAGE'S FACTS — the words, the fold, the summary, the details, the chips and the agent's line (lane message-facts,
 * B-f066 — design 007, docs/design-communication-panel.zh.md §26). PURE, CJS — the adapters' contract, the engine, the
 * store's compaction and the browser bundle share ONE definition. Imports only channel-record (PURE → PURE), where the
 * SCHEMA lives beside the record (`FACT_TYPES`, `FACT_SCHEMA`, `validateFacts`) — this module words it.
 *
 * THE RULE THIS FILE EXISTS FOR: the renderer and the agent's printer know the seven VALUE TYPES, never a kind. A new
 * provider's fact (Slack's "edited", Telegram's "via bot", Outlook's importance) is ONE row of `FACT_KINDS` (+ its
 * schema row) with an existing type — no renderer code, no engine branch, no CLI change. Rows nobody emits are NOT
 * declared (the dead-row rule); the paper test in scripts/test-channel-facts.mjs maps Slack-, Telegram- and
 * Outlook-shaped messages onto these types and prints the rows they would add.
 *
 * Every string a fact carries was judged by the name door at ingest (`validateFacts`); the words here are OURS (the
 * labels, "me", "+3") and reach the person through `t` (the caller's — this module imports no dictionary) and the agent
 * in English, the whole line through `inertFrameLine` (the reactions line's rule).
 */
const R = require('./channel-record.js');

/** ONE ROW PER KIND: `type` / `levels` (the schema's, copied — the suite holds them equal), `label` (the details' key,
 *  an English dictionary key), `where` — `summary` (the one-line button's words, and a details row), `chip` (a chip
 *  after the summary; `detail: true` = a details row too) or `details` (a details row only) — `mutable` (a later `fx`
 *  may change it), `agent` — how the agent's line prints it: `line` (its words), `count` (its number only — the
 *  reactions rule "counts, never who") or `none`. `chip` words per level (`chipWords`) or a template (`chipWord`). */
const row = (k, o) => Object.freeze({ type: R.FACT_SCHEMA[k].type, ...(R.FACT_SCHEMA[k].levels ? { levels: R.FACT_SCHEMA[k].levels } : {}), mutable: false, agent: 'line', ...o });
const FACT_KINDS = Object.freeze({
  to: row('to', { label: 'To', where: 'summary', word: 'to {names}' }),
  cc: row('cc', { label: 'Cc', where: 'summary', word: 'cc {names}' }),
  bcc: row('bcc', { label: 'Bcc', where: 'details' }),
  'reply-to': row('reply-to', { label: 'Reply-To', where: 'details' }),
  sender: row('sender', { label: 'Sent by', where: 'details' }),
  list: row('list', { label: 'Mailing list', where: 'chip', detail: true, chipWord: 'mailing list {v}' }),
  'delivered-to': row('delivered-to', { label: 'Delivered to', where: 'details' }),
  subject: row('subject', { label: 'Subject', where: 'details' }),
  importance: row('importance', { label: 'Importance', where: 'chip', chipWords: Object.freeze({ low: 'low importance', high: 'high importance', urgent: 'urgent' }) }),
  automated: row('automated', { label: 'Automated', where: 'chip', chipWords: Object.freeze({ 'auto-reply': 'auto-reply', bulk: 'bulk mail', notification: 'automated' }) }),
  // lane message-facts-lark (B-f066 part 2): chips only. `chipBare` = the chip when the vendor names no party (a nameless
  // `v: {}`); a time chip's title carries its instant (the view words it); edited / recalled may arrive LATE (`fx`)
  via: row('via', { label: 'Via', where: 'chip', chipWord: 'via {v}' }),
  'forwarded-from': row('forwarded-from', { label: 'Forwarded from', where: 'chip', chipWord: 'forwarded from {v}', chipBare: 'forwarded' }),
  edited: row('edited', { label: 'Edited', where: 'chip', mutable: true, chipWord: 'edited' }),
  recalled: row('recalled', { label: 'Recalled', where: 'chip', mutable: true, chipWord: 'recalled' }),
});
const FACT_WHERE = Object.freeze(['summary', 'chip', 'details']);
const FACT_AGENT = Object.freeze(['line', 'count', 'none']);
/** How many names the summary spells before "+N"; how many parties a details row shows before its "+N" button. */
const SUMMARY_NAMES = 3;
const DETAIL_PARTIES = 8;
const CHIP_CHARS = 40;

const idT = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : String(s));
const tOf = (t) => (typeof t === 'function' ? t : idT);
const kindsOf = (facts) => (Array.isArray(facts) ? facts.filter((f) => f && typeof f === 'object' && Object.prototype.hasOwnProperty.call(FACT_KINDS, f.k)) : []);
const clip = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

/** verify r1 F1: a peer's words are ONE piece of a line WE print — the parties' `, `, the facts' ` · ` (and the dots that
 *  read like it), an address's `<…>`, a quote, our "+N". A display name holding one is QUOTED (RFC 5322's quoted-string:
 *  `"` and `\` escaped), so `a", evil@x, "b` / `Alice · reply-to: x@evil` / `Alice <ceo@corp>` stays ONE name in the
 *  agent's line, the summary, a tooltip and the details; a `line` value (a subject) holding a separator is quoted alike.
 *  (r0 quoted a comma alone, and `"` inside the name re-opened the list.) An address is never quoted: it has no space. */
const NAME_SPECIAL_RE = /[",<>\\·・•⋅‧]|\s\+\d/;
const LINE_SPECIAL_RE = /["\\·・•⋅‧]/;
const quoted = (s, re = NAME_SPECIAL_RE) => (re.test(s) ? `"${s.replace(/["\\]/g, '\\$&')}"` : s);
/** A party as the person reads it: the name first (real names before ids), "me" for the account's own address. */
function partyName(p, t) { const n = p.self ? tOf(t)('me') : (p.name || p.id || ''); return n === p.id ? n : quoted(n); }   // a name that could read as two people (or as our "+N"), quoted
/** "Name · address" (details) — the address alone when the name says nothing more. */
function partyFull(p, t) {
  const n = p.self ? tOf(t)('me') : p.name;
  return n && n !== p.id && p.id ? `${quoted(n)} · ${p.id}` : (p.id || (n ? quoted(n) : ''));
}
/** "Name <address>" (a tooltip, the agent's line) — `me` for the account's own. */
function partyAngle(p, me = 'me') {
  const n0 = p.self ? me : p.name;
  const n = n0 ? quoted(n0) : n0;   // verify r1 F1
  return n && p.id && n0 !== p.id ? `${n} <${p.id}>` : (p.id || n || '');
}
const partiesOf = (f) => (f.v && typeof f.v === 'object' && !Array.isArray(f.v) ? [f.v] : Array.isArray(f.v) ? f.v : []);
/** lane message-facts-lark: a `party` the vendor did not name (`v: {}` — the schema's `nameless` rows only). */
const unnamed = (p) => !(p && typeof p === 'object' && (p.id || p.name));

/**
 * THE FOLD (read time): the record's own facts, then each `fx` side record in `(at, sideKey)` order — per kind the LATER
 * one wins; a `flag` never un-happens (a recalled message stays recalled whatever a later copy says). Only declared
 * kinds survive; the answer is in `FACT_KIND_NAMES` order, a NEW list.
 */
function foldFacts(recordFacts, sides) {
  const by = new Map();
  for (const f of kindsOf(recordFacts)) by.set(f.k, f);
  const xs = (Array.isArray(sides) ? sides : []).filter((x) => x && x.k === 'fx' && Array.isArray(x.facts));
  const key = (x) => R.sideKey(x);
  xs.sort((a, b) => (Number(a.at) - Number(b.at)) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  for (const x of xs) for (const f of kindsOf(x.facts)) {
    const prev = by.get(f.k);
    if (prev && FACT_KINDS[f.k].type === 'flag' && prev.v === true) continue;
    by.set(f.k, f);
  }
  return R.FACT_KIND_NAMES.filter((k) => by.has(k) && FACT_KINDS[k]).map((k) => by.get(k));
}

/** THE SUMMARY — the one-line button: "to me, Alice Chen, Bob +3 · cc Carol" (names first; `title` = every address).
 *  null when the facts hold no summary kind. */
function summaryOf(facts, t) {
  const tr = tOf(t);
  const parts = [], titles = [];
  for (const f of kindsOf(facts)) {
    const row = FACT_KINDS[f.k];
    if (row.where !== 'summary') continue;
    const ps = partiesOf(f);
    const total = ps.length + (Number(f.more) || 0);
    let names;
    if (f.cut && !ps.length) names = tr('too long to list');
    else {
      const shown = ps.slice(0, SUMMARY_NAMES).map((p) => partyName(p, tr));
      names = shown.join(', ') + (total > shown.length ? ` +${total - shown.length}` : '');
    }
    parts.push(tr(row.word, { names }));
    titles.push(`${tr(row.label)}: ${f.cut && !ps.length ? tr('too long to list') : ps.map((p) => partyAngle(p, tr('me'))).join(', ') + (f.more ? ` +${f.more}` : '')}`);
  }
  return parts.length ? { text: parts.join(' · '), title: titles.join('\n') } : null;
}

/** THE CHIPS — "mailing list dev@…", "high importance", "automated" (`title` = the whole value). */
function chipsOf(facts, t) {
  const tr = tOf(t);
  const out = [];
  for (const f of kindsOf(facts)) {
    const row = FACT_KINDS[f.k];
    if (row.where !== 'chip') continue;
    let text = null, title = null;
    if (row.chipWords) { const w = row.chipWords[f.v]; text = w ? tr(w) : null; title = text; }
    else if (row.chipBare && row.type === 'party' && unnamed(f.v)) { text = tr(row.chipBare); title = text; }
    else if (row.chipWord) {
      const v = row.type === 'line' ? String(f.v) : row.type === 'party' ? partyName(f.v, tr) : row.type === 'count' ? String(f.v) : '';
      text = tr(row.chipWord, { v: clip(v, CHIP_CHARS) });
      title = tr(row.chipWord, { v });
    } else text = tr(row.label);
    if (text) out.push({ k: f.k, text, title: title || text, ...(row.type === 'time' ? { time: Number(f.v) } : {}) });   // + lane message-facts-lark: the instant a time chip's title words
  }
  return out;
}

/** THE DETAILS — a keyed list in the table's order: `{k, label, values:[{text, title}], more, cut}`; a party is
 *  "Name · address" (the address its title), a line its words, a level its chip word, a time an instant the caller
 *  words (`time: ms`). `DETAIL_PARTIES` are the ones shown before the row's "+N" (the caller expands in place). */
function detailRows(facts, t) {
  const tr = tOf(t);
  const out = [];
  for (const f of kindsOf(facts)) {
    const row = FACT_KINDS[f.k];
    if (!(row.where === 'summary' || row.where === 'details' || row.detail === true)) continue;
    let values;
    if (row.type === 'parties' || row.type === 'party') values = partiesOf(f).map((p) => ({ text: partyFull(p, tr), title: p.id || '' }));
    else if (row.type === 'line') values = [{ text: String(f.v), title: '' }];
    else if (row.type === 'level') values = [{ text: row.chipWords && row.chipWords[f.v] ? tr(row.chipWords[f.v]) : String(f.v), title: '' }];
    else if (row.type === 'time') values = [{ text: '', title: '', time: Number(f.v) }];
    else if (row.type === 'count') values = [{ text: String(f.v), title: '' }];
    else values = [];
    out.push({ k: f.k, label: tr(row.label), values, shown: DETAIL_PARTIES, more: Number(f.more) || 0, cut: f.cut === true, cutText: f.cut === true ? tr('too long to list') : '' });
  }
  return out;
}

/** THE AGENT'S COPY of a fact list, every string through the caller's doors (`name` / `id` / `line` — the engine's belt:
 *  peerName, agentId, agentText kind line); a `count` keeps its number, a level / time / flag its value. A NEW list. */
function mapFactStrings(facts, { name, id, line }) {
  const nm = typeof name === 'function' ? name : (v) => v;
  const ad = typeof id === 'function' ? id : (v) => v;
  const ln = typeof line === 'function' ? line : (v) => v;
  const party = (p) => (p && typeof p === 'object' ? { id: ad(String(p.id || '')) || '', name: nm(String(p.name || '')) || '', ...(p.self === true ? { self: true } : {}) } : null);
  return kindsOf(facts).filter((f) => FACT_KINDS[f.k].agent !== 'none').map((f) => {
    const type = FACT_KINDS[f.k].type;
    const o = { k: f.k };
    if (type === 'parties') { o.v = (Array.isArray(f.v) ? f.v : []).map(party).filter(Boolean); if (f.more) o.more = Number(f.more) || 0; if (f.cut === true) o.cut = true; }
    else if (type === 'party') o.v = party(f.v);
    else if (type === 'line') o.v = ln(String(f.v == null ? '' : f.v));
    else o.v = f.v;
    return o;
  });
}

/** THE AGENT'S LINE — one line under the message: `to: Alice Chen <alice@x>, me · cc: … · reply-to: desk@x · list: … ·
 *  importance: high` (the kind names are the keys an agent can rely on; a count prints its number). '' for none. */
function agentFactLines(facts) {
  const bits = [];
  for (const f of kindsOf(facts)) {
    const row = FACT_KINDS[f.k];
    if (row.agent === 'none') continue;
    let v;
    if (row.agent === 'count' || row.type === 'count') v = String(Number(f.v) || 0);
    else if (row.type === 'parties') v = f.cut === true && !(f.v || []).length ? '(too long to list)' : (f.v || []).map((p) => partyAngle(p)).join(', ') + (f.more ? ` +${f.more} more` : '');
    else if (row.type === 'party' && unnamed(f.v)) { bits.push(f.k); continue; }   // lane message-facts-lark: a party nobody named = the key alone
    else if (row.type === 'party') v = partyAngle(f.v || {});
    else if (row.type === 'time') v = new Date(Number(f.v)).toISOString();
    else if (row.type === 'flag') { bits.push(f.k); continue; }
    else if (row.type === 'line') v = quoted(String(f.v), LINE_SPECIAL_RE);   // verify r1 F1: a subject cannot spell ` · reply-to: …`
    else v = String(f.v);
    bits.push(`${f.k}: ${v}`);
  }
  return bits.length ? R.inertFrameLine(bits.join(' · ')) : '';
}

/** THE SIDE LOG'S COMPACTION of ONE message's `fx` lines (the store's trim): ONE line — the fold at the newest line's
 *  instant — or, when that would not pass `validateSide`, the newest four as they were. [] when it holds none. */
function compactFactLines(lines) {
  const xs = (Array.isArray(lines) ? lines : []).filter((x) => x && x.k === 'fx' && Number(x.at) > 0 && Array.isArray(x.facts));
  if (xs.length <= 1) return xs;
  const key = (x) => R.sideKey(x);
  xs.sort((a, b) => (Number(a.at) - Number(b.at)) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const last = xs[xs.length - 1];
  const v = R.validateSide({ k: 'fx', msg: last.msg, at: last.at, src: last.src, facts: foldFacts([], xs) });
  return v.ok ? [v.side] : xs.slice(-4);
}

module.exports = {
  FACT_KINDS, FACT_WHERE, FACT_AGENT, SUMMARY_NAMES, DETAIL_PARTIES,
  FACT_TYPES: R.FACT_TYPES, FACT_SCHEMA: R.FACT_SCHEMA, FACT_KIND_NAMES: R.FACT_KIND_NAMES, FACT_LIMITS: R.FACT_LIMITS, validateFacts: R.validateFacts,
  foldFacts, summaryOf, chipsOf, detailRows, mapFactStrings, agentFactLines, compactFactLines, partyFull, partyAngle,
};
