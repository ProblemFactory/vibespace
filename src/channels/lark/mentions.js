'use strict';
// src/channels/lark/mentions.js — PURE (B-82c2, 2026-11-20): A MENTION IN A LARK PROPOSAL IS A REAL MENTION OR IT IS SAID.
// The owner met an agent's proposed message, edited and approved, whose @names went out as plain words: Lark declared no
// prepare step, so no name was ever decided. This module is Lark's half of the outbox's mention contract (Slack's road is the
// model: src/channels/slack.js prepareSend, src/channels/index.js's bound): which person an `@Name` is, decided against the
// people the conversation's own records hold and, only for a name not found there, the chat's member list; and the wire text
// that carries each decided mention in Lark's own form.
//
// LARK'S FORM (the published page, «Message content» / 消息内容介绍, text): «<at user_id="ou_xxx">user name(optional)</at>»
// for one person — «When @mentioning a single user, developers should enter open_id, union_id or user_id in user_id field»,
// «The value must be valid» — and «<at user_id="all"></at>» for everyone, which «must be enabled for the group». The send
// API's answer lists the mentions it took (`data.mentions`: key, id, id_type «目前仅支持 open_id», name): the receipt reads it.
// This module writes open_ids only (the id a record's mention carries, and the member list's `member_id_type=open_id`).

/** THE ID SHAPE this adapter states to the registry (its own; Slack states Slack's): an open_id, or `all` (everyone). */
const MENTION_ID = '^(?:ou_[0-9a-z]{8,64}|all)$';
const ID_RE = new RegExp(MENTION_ID);
/** The words that mean everyone in the chat — Lark's own (@所有人) and the English ones. */
const EVERYONE_WORDS = Object.freeze(['所有人', 'all', 'everyone']);
/** A typed tag (`<at user_id="…">label</at>`): decided like a name — a member's id keeps it, `all` is everyone, any other
 *  goes as its label in plain words (never a mention the card did not show). */
const TAG_RE = /<at\s+user_id\s*=\s*"([^"<>\s]{1,80})"\s*>([^<>\n]{0,80})<\/at>/g;
/** An `@` at a word start (the line's start, a space, or an opening / CJK punctuation mark); `a@b` is no mention. */
const AT_RE = /(?<![A-Za-z0-9._%+\-])@/g;   // round wke4s5jp9 (6): an at-sign starts an at-word UNLESS the character before it belongs to a mail address's first part — the closed list is of what does NOT start one (a CJK sentence with no space, a bracket, a bold mark, a slash: each starts one)
const NAME_MAX = 80, NAMES_MAX = 50, PEOPLE_MAX = 2000, MENTIONS_MAX = 50;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_RE = /[\p{L}\p{N}]/u;
const lower = (s) => String(s).toLocaleLowerCase('en');

/** The people a decision may name: `{id, name}` PAIRS with an open_id and a name (≤ PEOPLE_MAX). Round wn462wr7s: one person
 *  may be known by two names (the records' name, the name an earlier decision matched, the member list's) — each pair stays. */
function peopleOf(list) {
  const byPair = new Map();
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p.id !== 'string' || !/^ou_[0-9a-z]{8,64}$/.test(p.id)) continue;
    const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
    if (!name) continue;
    byPair.set(`${p.id}\n${lower(name)}`, { id: p.id, name });
    if (byPair.size >= PEOPLE_MAX) break;
  }
  return [...byPair.values()];
}
/** Does `rest` (the text after an `@`) begin with `name`, any case? (Where the name ENDS is judged apart: `endsHere` /
 *  `endsWhole`.) */
const beginsWith = (rest, name) => !!name && rest.length >= name.length && lower(rest.slice(0, name.length)) === lower(name);
/**
 * ROUND wfgpbe038 RULE A — ENDERS, NOT CONTINUERS. What may follow a name for the name to END there for sure, a CLOSED list:
 * the text's end, a line end, another at-sign (right after, or after spaces), a CJK sentence mark or closing bracket / quote
 * (always), an ASCII sentence mark or closing bracket / quote only when no letter or digit follows it (J.R., O'Brien).
 * EVERYTHING else — a space, a hyphen, a middle dot, a letter of any script, a digit, a symbol, an emoji, a character nobody
 * thought of — leaves the word open: an unlisted follower fails safe. `tail` = the text right after the name (≥ 8 characters
 * of it, or all that is left).
 */
const CJK_ENDERS = new Set([...'，。、；：！？）」』】》〉］｝〕']);
const ASCII_ENDERS = new Set([...',.;:!?)]}"\'”’…']);
const LINE_ENDS = new Set(['\n', '\r', '\u2028', '\u2029']);
const SPACE_RE = /^[ \t\u00a0\u3000]/;
function endsHere(tail) {
  const t = String(tail || '');
  if (!t) return true;
  const c = t[0];
  if (LINE_ENDS.has(c) || c === '@' || CJK_ENDERS.has(c)) return true;
  if (/^[ \t\u00a0\u3000]+@/.test(t)) return true;
  if (ASCII_ENDERS.has(c)) { const n = [...t.slice(1)][0]; return !n || !WORD_RE.test(n); }
  return false;
}
/** Over a WHOLE member list a name ALSO ends at a space, and a CJK name may abut CJK text (the whole list shows no longer
 *  name there); a joiner — a hyphen, a middle dot, an apostrophe before a letter, an underscore — never ends one. */
function endsWhole(tail, typed) {
  if (endsHere(tail)) return true;
  const c = [...String(tail)][0];
  if (SPACE_RE.test(c)) return true;
  return CJK_RE.test(c) && CJK_RE.test([...String(typed)].pop() || '');
}
/** Everyone's word ends only at an ender — over a whole list a space too; never a CJK abut, never a joiner (@all-hands). */
const everyoneEnds = (tail, whole) => endsHere(tail) || (whole && SPACE_RE.test([...String(tail)][0] || ''));
/** The text with each typed tag blanked (same length): an `@` inside a tag's label is the tag's, never a name of its own. */
const blankTags = (s) => s.replace(TAG_RE, (m) => ' '.repeat(m.length));
/** round wfgpbe038 (a small): CODE is no text — a fenced block (```…```) and a backtick span are blanked (same length, line ends
 *  kept), so `@Override` or a decorator in pasted code is no at-word: no read, no card row. */
const blankCode = (s) => String(s).replace(/```[\s\S]*?(?:```|$)/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
/** The word as WRITTEN at an at-sign (its plain or open words): the run up to a space or an ender — joiners and letters of any
 *  script kept («Jean-Pierre», «约翰·史密斯», «王伟强») — and, after a matched name, one more capitalised or CJK word after a
 *  space («Ann Lee»); ≤ 40 characters. */
function writtenWord(rest, from = 0) {
  const s = String(rest);
  let i = Math.min(Math.max(0, from), s.length);   // the matched name is written whole, spaces in it too
  const run = () => { while (i < s.length && i < 40 && !SPACE_RE.test(s[i]) && !LINE_ENDS.has(s[i]) && !endsHere(s.slice(i))) i++; };
  run();
  if (from > 0 && i === from && s[i] === ' ' && (/\p{Lu}/u.test(s[i + 1] || '') || CJK_RE.test(s[i + 1] || ''))) { i++; run(); }
  return s.slice(0, i).replace(/\s+$/, '');
}

/**
 * THE ONE DECISION (round wn462wr7s: one call for every road; round wfgpbe038: four rules that hold by construction). Fed three
 * things only: the `text`, the `known` people of this chat (`{id, name}` pairs: its records' people, an earlier decision's
 * mentions) and `members` — the member list AS ITS READ RECORDED IT, `{list, whole, why}` (whole = the read ended with no page
 * mark left, was not refused and not under a back-off; a caller never says it; a reason means not whole), or null (no read).
 * Per at-sign at a word start, outside code (at most AT_SEEN_MAX are read):
 *  - OVER A WHOLE LIST: the LONGEST known or listed name — or everyone's word — that begins the text there and ENDS there
 *    (`endsWhole`) decides: one person a mention, two refused (`unresolved`, said, never guessed), none plain words;
 *  - WITHOUT ONE (rule A): the longest name beginning there decides ONLY when an ENDER follows it (`endsHere`), and the
 *    mention is UNCHECKED (the card says the members were not checked, with the read's reason); anything else is OPEN;
 *  - a typed tag: a known or listed id = that mention, `all` = everyone, any other id = its label as words (plain over a whole
 *    list, else open).
 * Each decided place is RECORDED (rule D: `places` = the at-sign's offset, the typed length, the id; a typed tag's offset and
 * length) — the wire tags those places only, never a name matched again. `notifies[i]` names `mentions[i]` (one to one);
 * `unread` = at-words past the bounds (said on the card). → { mentions, notifies, unresolved, plain, open, openWhy, everyone,
 * unchecked, uncheckedWhy, places, unread }
 */
const AT_SEEN_MAX = 150;   // the scan reads at most this many at-signs (a bound by at-signs, never people × words)
function decideMentions({ text, known = null, members = null } = {}) {
  const s = String(text == null ? '' : text);
  const listed = members && Array.isArray(members.list) ? members.list : [];
  const whole = !!(members && members.whole === true && !members.why);
  // round wke4s5jp9 (3): over a WHOLE list the candidates are the MEMBERS only (rule B: the whole list decides) — a person known only
  // from the records (someone who left) is «not a member here», never a mention
  const ppl = peopleOf(whole ? listed : [...(Array.isArray(known) ? known : []), ...listed]);
  const ids = new Set(ppl.map((p) => p.id));
  const nameOf = new Map(ppl.map((p) => [p.id, p.name]));   // the name a mention notifies: the member list's, else the newest known
  for (const p of peopleOf(listed)) nameOf.set(p.id, p.name);
  const out = { mentions: [], notifies: [], unresolved: [], plain: [], open: [], openWhy: null, everyone: false, unchecked: [], uncheckedWhy: null, places: [], unread: 0, over: [] };
  const addMention = (name, id, place) => {   // one notify name a mention, in the same order; every decided PLACE recorded
    // round wke4s5jp9: past MENTIONS_MAX people in one message the rest go as plain words — their own row (`over`, «Past the
    // mark limit»), never a place on the wire
    const have = out.mentions.some((m) => m.id === id && m.name === name);
    if (!have && out.mentions.length >= MENTIONS_MAX) { if (!out.over.includes(name)) { if (out.over.length < NAMES_MAX) out.over.push(name); else out.unread++; } return; }
    out.places.push(place);
    if (id === 'all') out.everyone = true;
    else if (!whole && !out.unchecked.includes(name) && out.unchecked.length < NAMES_MAX) out.unchecked.push(name);   // decided without a whole list: the card says so
    if (have) return;
    out.mentions.push({ name, id });
    out.notifies.push(id === 'all' ? name : (nameOf.get(id) || name));
  };
  const add = (list, n) => { if (!n || list.includes(n)) return; if (list.length < NAMES_MAX) list.push(n); else out.unread++; };
  const code = blankCode(s);
  for (const m of code.matchAll(TAG_RE)) {
    const [all, id, label] = m;
    const place = { at: m.index, len: all.length, id, tag: true };
    if (id === 'all') addMention(EVERYONE_WORDS[0], 'all', place);
    else if (ids.has(id) && ID_RE.test(id)) addMention(label.trim() || nameOf.get(id) || id, id, place);
    else add(whole ? out.plain : out.open, label.trim() || id);   // an id nobody known holds: plain over a whole list, else open (the read decides it)
  }
  const scan = blankTags(code);
  const re = new RegExp(AT_RE.source, AT_RE.flags);
  let m, seen = 0;
  while ((m = re.exec(scan))) {
    if (++seen > AT_SEEN_MAX) { out.unread++; if (seen > 100000) break; continue; }   // past the bound: counted, said on the card
    const at = m.index + m[0].length;   // the character after the @
    const rest = scan.slice(at, at + NAME_MAX + 8);
    const tailOf = (len) => scan.slice(at + len, at + len + 8);
    const cands = [];
    for (const p of ppl) if (beginsWith(rest, p.name)) cands.push({ len: p.name.length, id: p.id });
    for (const w of EVERYONE_WORDS) if (beginsWith(rest, w)) cands.push({ len: w.length, id: 'all' });
    const ends = (c) => (c.id === 'all' ? everyoneEnds(tailOf(c.len), whole) : whole ? endsWhole(tailOf(c.len), rest.slice(0, c.len)) : endsHere(tailOf(c.len)));
    // round wke4s5jp9 MUST 2 — ONE SENTENCE FOR BOTH MODES: the LONGEST candidate name that begins here is the only one that may
    // decide; it decides when it ends here by its mode's enders; when it does not, the word is plain (a whole list) or open (none),
    // said on the card — A SHORTER NAME IS NEVER TRIED (@Ann Lee's draft never notifies Ann)
    const longest = cands.reduce((n, c) => Math.max(n, c.len), 0);
    const top = cands.filter((c) => c.len === longest);
    const best = longest && top.some(ends) ? longest : 0;
    if (!best) { add(whole ? out.plain : out.open, writtenWord(rest, longest)); continue; }
    const who = [...new Set(top.filter(ends).map((c) => c.id))];
    const typed = rest.slice(0, best);
    if (who.length === 1) addMention(typed, who[0], { at: at - 1, len: best, id: who[0] });
    else add(out.unresolved, typed);
  }
  out.plain = out.plain.filter(Boolean);
  const why = (members && typeof members.why === 'string' && members.why) || (members ? null : 'not-read');
  if (out.open.length) out.openWhy = why;
  if (out.unchecked.length) out.uncheckedWhy = why || 'members-partial';
  return out;
}
/** Does the text hold an at-word or a typed tag outside code (the member read is asked only then)? */
function hasAtWords(text) {
  const code = blankCode(String(text == null ? '' : text));
  TAG_RE.lastIndex = 0;
  if (TAG_RE.test(code)) { TAG_RE.lastIndex = 0; return true; }
  TAG_RE.lastIndex = 0;
  return new RegExp(AT_RE.source, AT_RE.flags.replace('g', '')).test(blankTags(code));
}

/**
 * THE WIRE TEXT (round wfgpbe038 RULE D): `text` with each DECIDED PLACE in Lark's form — the at-word at a place's offset becomes
 * `<at user_id="ou_…">typed</at>` (everyone: `<at user_id="all"></at>`), a typed tag at a decided place stays as typed, any other
 * typed tag goes as `@label` (plain words, as the card said). Nothing is matched by name again, so the wire cannot disagree
 * with the card; a place that no longer sits on an at-sign of this text is left as its characters (fail safe).
 */
function wireText(text, places) {
  const s = String(text == null ? '' : text);
  const ps = (Array.isArray(places) ? places : []).filter((p) => p && Number.isInteger(p.at) && p.at >= 0 && Number.isInteger(p.len) && p.len > 0 && typeof p.id === 'string' && ID_RE.test(p.id));
  const tagPlace = new Map(ps.filter((p) => p.tag === true).map((p) => [p.at, p]));
  const events = [];
  // round wke4s5jp9 (5): the typed tags are found in the text WITH its code — Lark's text body has no code form and the vendor parses
  // a tag anywhere: a tag that is not at a decided place goes as its label in plain words, inside a backtick span or a fence too
  for (const m of s.matchAll(TAG_RE)) events.push({ at: m.index, end: m.index + m[0].length, tag: true, id: m[1], label: m[2] });
  for (const p of ps) if (p.tag !== true) events.push({ at: p.at, end: p.at + 1 + p.len, tag: false, id: p.id });
  events.sort((a, b) => a.at - b.at);
  let out = '', from = 0;
  for (const e of events) {
    if (e.at < from) continue;
    if (e.tag) {
      const tp = tagPlace.get(e.at);
      out += s.slice(from, e.at) + (tp && tp.id === e.id ? s.slice(e.at, e.end) : `@${String(e.label).trim() || e.id}`);
    } else {
      if (s[e.at] !== '@' || e.end > s.length || /[\n\r]/.test(s.slice(e.at, e.end))) continue;   // not this text's place: its characters
      out += s.slice(from, e.at) + (e.id === 'all' ? '<at user_id="all"></at>' : `<at user_id="${e.id}">${s.slice(e.at + 1, e.end)}</at>`);
    }
    from = e.end;
  }
  return out + s.slice(from);
}

/** round wwb543hm7 MUST 2 — THE RECONCILE'S COMPARISON, one form on both sides: OUR wire (`<at user_id="X">label</at>` → «@{X}»)
 *  and a STORED Lark message (its per-message placeholders `@_user_N` / `@_all`, resolved through its own `mentions` list → «@{id}»);
 *  a landed message with a mention reads as landed whatever form the vendor stores the mention in. */
const canonWire = (text) => String(text == null ? '' : text).replace(TAG_RE, (all, id) => `@{${id}}`);
function canonVendor(text, mentions) {
  const byKey = new Map((Array.isArray(mentions) ? mentions : []).filter((m) => m && typeof m.key === 'string').map((m) => [m.key, m.key === '@_all' ? 'all' : String(m.id || '')]));
  return String(text == null ? '' : text).replace(/@_user_\d+|@_all/g, (k) => (byKey.has(k) ? `@{${byKey.get(k)}}` : k));   // round wn462wr7s: a typed placeholder no mention names stays the words it was
}
/** THE RECEIPT'S COUNT from Lark's own answer to the send: how many mentions it took (`data.mentions`), null when it did not say. */
function takenOf(answer) {
  const d = answer && typeof answer === 'object' ? (answer.data && typeof answer.data === 'object' ? answer.data : answer) : null;
  return d && Array.isArray(d.mentions) ? d.mentions.filter((x) => x && (typeof x.id === 'string' || typeof x.key === 'string')).length : null;
}

module.exports = { MENTION_ID, EVERYONE_WORDS, peopleOf, decideMentions, hasAtWords, wireText, takenOf, endsHere, endsWhole, canonWire, canonVendor, AT_SEEN_MAX };
