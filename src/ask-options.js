'use strict';
/**
 * PURE (imports nothing; CJS so the browser bundle and any server reader share ONE spelling) — THE OPTIONS OF AN ASK
 * (lane foryou-honest, the stress evaluation's P2-3, 2026-10-25). 21 of 21 agent questions on the demo carried their
 * choices as PROSE in the detail («A 三处都改；B 只改退款；…；H 先开会讨论», «是 / 否», «A / B / C») with options=null:
 * no surface ever drew a chip, an eight-choice question was answered by typing «H» into a reply box, and the Duo's list
 * column spent 44 px a question on four verbs that were never the options.
 *
 *   optionsOf(detail, question) — the detail's options as labels ([] = not an option list). A chip is drawn only when the
 *                                detail is a CHOICE (acceptance round 2, 主开发 2026-10-25: a numbered PLAN — an agent's
 *                                steps — became reply chips, and a tap posted a fragment of the plan as the person's reply):
 *                                  lettered  «A …；B …；C …» — consecutive LETTERS A, B, C… (never bare numbers), the whole
 *                                            detail (an optional lead-in ending in a colon or a question mark first),
 *                                            split at ；/ ; / a line break, each starting with its letter (+ a space,
 *                                            . 、 ) : ：), 2–OPTIONS_MAX of them, each ≤ LABEL_MAX chars — or ONE line of
 *                                            items with no separator («A) 北京 B) 上海»), split at its markers when each is
 *                                            A) A） A、 A: A： + a space or a CJK char (never «A.» / «A »: on a running line
 *                                            those are a sentence's own words — «A. do x B. do y» stays prose)
 *                                  numbered  «1. 北京 2. 上海 — 选哪个？» — 1, 2, 3… each with its delimiter (. ) 、 : ：), on
 *                                            one line or one per line, ONLY when the detail's words around them carry a
 *                                            choice cue (选 / 哪 / 还是 / which / choose / pick / option / «or …?») or the
 *                                            question points at them (选 / 哪 / which / choose / pick / option), and every
 *                                            item is one line ≤ NUMBERED_MAX chars — a plan («1. back up 2. migrate
 *                                            3. verify») stays prose; the words after the list start only at a new line or
 *                                            a dash followed by a cue, so an option's own «— safe» stays its own
 *                                  short     «是 / 否» · «A / B / C» · «yes | no» — tokens split at / or |, spaced, or
 *                                            unspaced only when every token is CJK or one letter (a path never parses),
 *                                            ONLY when the whole detail is ONE line ≤ SHORT_MAX chars of 2–3 parts and a
 *                                            question mark stands in the question or the detail (a sentence never parses)
 *                                One trailer rule on every form (acceptance rounds 3–4): the words after the last option
 *                                begin at a dash whose own words carry a choice cue («A 北京；B 上海 — 选哪个？»,
 *                                «deploy / rollback / wait — which?») — they are never part of the last chip
 *                                Each label distinct — anything else is NO parse (prose stays prose; a chip is never a
 *                                guess; the person types). A label is the option's own words («A 三处都改») — the reply a
 *                                chip sends IS the label, so the agent reads what was chosen.
 *   askOptions(item, detail)   — what a For-you surface draws as chips: the agent's EXPLICIT `options[]` (vibespace-ask
 *                                --options) win; else the parse of an ASK's detail (`detail` = the words the surface
 *                                shows; defaults to item.detail) beside its question (item.text). A producer's item (an
 *                                action, a card, i18n words, a notice, a job's form) or a cleared one parses nothing.
 */

const OPTIONS_MAX = 10;
const LABEL_MAX = 120;
const NUMBERED_MAX = 60;
const SHORT_MAX = 60;
const SHORT_PARTS = 3;

const SEP = /\s*(?:[；;]|\r?\n)\s*/;
const LEAD_END = /[：:?？]\s*$/;
const TRAIL = /[\s。.;；，,]+$/;
const CUE = /选|哪|还是|\b(?:which|choose|pick|options?)\b|\bor\b[^?？]*[?？]/i; // the words of a CHOICE around numbered items
const ASKS = /选|哪|\b(?:which|choose|pick|options?)\b/i; // …and in the QUESTION the words that point AT a list (never 还是 /
// «or …?», which name their own alternatives: «按这个计划做，还是先等等？» over a plan is go-or-wait, not a pick of a step)
const NUM = /(^|[\s；;，,])[(（]?(\d{1,2})[)）.、:：]\s*/g; // «1.» «2)» «(3)» «4、» at the start or after a space / a separator
const DASH = /\s+[—–]+\s*|\s*——\s*|\s+-{1,2}\s+/g; // a dash between words: « — » «——» « - » « -- »
const CJK = /^[㐀-鿿豈-﫿぀-ヿ가-힯]+$/;
const MARK = /(^|[\s，,：:?？])[(（]?([A-Z])[)）、:：](?=\s|[㐀-鿿豈-﫿぀-ヿ가-힯])/g; // «A)» «B）» «C、» «D:» «E：» inside ONE line

/** Does `part` open with the k-th letter (A, B, C…) and a delimiter? → the rest's start index, else -1. */
function labelAt(part, k) {
  const m = /^[(（]?([A-Z])(?:[)）.、:：]\s*|\s+)/.exec(part);
  return m && m[1] === String.fromCharCode(65 + k) && part.length > m[0].length ? m[0].length : -1;
}
function bounded(labels, len = LABEL_MAX) {
  if (labels.length < 2 || labels.length > OPTIONS_MAX) return [];
  if (labels.some((l) => !l || l.length > len)) return [];
  if (new Set(labels).size !== labels.length) return [];
  return labels;
}
function lettered(s) {
  const parts = s.split(SEP).filter((p) => p !== '');
  if (parts.length < 2) return [];
  // a lead-in: its own part ending in a colon / a question mark («Pick one:», then A… on the next line), or the head of
  // the first part up to the colon right before its A («选项很多：A 三处都改»)
  if (labelAt(parts[0], 0) < 0) {
    const m = /^(.*?[：:]\s*)(?=[(（]?A(?:[)）.、:：]|\s))/.exec(parts[0]);
    if (m && m[1].length < parts[0].length) parts[0] = parts[0].slice(m[1].length);
    else if (LEAD_END.test(parts[0])) parts.shift();
    else return [];
  }
  const out = [];
  for (let k = 0; k < parts.length; k++) {
    const at = labelAt(parts[k], k);
    if (at < 0) return [];
    const p = k + 1 < parts.length ? parts[k] : parts[k].slice(0, trailerAt(parts[k], at)); // the last: up to the words after the list
    out.push(p.replace(TRAIL, '').trim());
  }
  return bounded(out);
}
/** ONE line of lettered items with no separator between them («A) 北京 B) 上海», after an optional lead-in ending in a colon
 *  or a question mark), split at the markers a running line can carry (MARK — never «A.» / «A », a sentence's words) */
function letteredLine(s) {
  const at = []; // each label's start and where its words begin — A, B, C… in order
  for (const m of s.matchAll(MARK)) if (m[2] === String.fromCharCode(65 + at.length)) at.push({ i: m.index + m[1].length, body: m.index + m[0].length });
  if (at.length < 2 || /[；;\r\n]/.test(s.slice(at[0].i))) return [];
  const lead = s.slice(0, at[0].i).trim();
  if (lead && !LEAD_END.test(lead)) return [];
  const tail = trailerAt(s, at[at.length - 1].body);
  const out = [];
  for (let k = 0; k < at.length; k++) {
    const end = k + 1 < at.length ? at[k + 1].i : tail;
    if (!s.slice(at[k].body, end).replace(TRAIL, '').trim()) return [];
    out.push(s.slice(at[k].i, end).replace(TRAIL, '').trim());
  }
  return bounded(out);
}
/** Where the words AFTER a numbered list begin (s.length = none), from the last item's words at `from`: only at a NEW LINE,
 *  or at a dash whose own words (up to the next dash) carry a choice cue («… 2. 上海 — 选哪个？») — a dash inside an
 *  option's words («2. slow — safe») is the option's own, on the last item as on every other (acceptance round 3) */
function trailerAt(s, from) {
  const nl = /\r?\n/.exec(s.slice(from));
  const end = nl ? from + nl.index : s.length;
  const dashes = [...s.slice(from, end).matchAll(DASH)];
  for (let k = 0; k < dashes.length; k++) {
    const own = s.slice(from + dashes[k].index + dashes[k][0].length, k + 1 < dashes.length ? from + dashes[k + 1].index : end);
    if (CUE.test(own)) return from + dashes[k].index;
  }
  return end;
}
function numbered(s, question) {
  const at = []; // each label's start and where its words begin — 1, 2, 3… in order
  for (const m of s.matchAll(NUM)) if (Number(m[2]) === at.length + 1) at.push({ i: m.index + m[1].length, body: m.index + m[0].length });
  if (at.length < 2) return [];
  const tail = trailerAt(s, at[at.length - 1].body);
  const out = [];
  for (let k = 0; k < at.length; k++) {
    const end = k + 1 < at.length ? at[k + 1].i : tail;
    const words = s.slice(at[k].body, end).replace(TRAIL, '').trim();
    if (!words || /[\r\n]/.test(words)) return [];
    out.push(s.slice(at[k].i, end).replace(TRAIL, '').trim());
  }
  // a list with no choice around it — in the QUESTION (vibespace-ask's own shape: «选哪个城市？» over «1. 北京\n2. 上海») or
  // in the detail's words before / after it — is a PLAN: never chips
  if (!ASKS.test(String(question || '')) && !CUE.test(s.slice(0, at[0].i) + ' ' + s.slice(tail))) return [];
  return bounded(out, NUMBERED_MAX);
}
function short(s, question) {
  if (/[\r\n]/.test(s)) return [];
  if (s.length > SHORT_MAX || !/[?？]/.test(String(question || '') + s)) return []; // a one-line sentence is no choice
  const sep = s.includes('|') ? '|' : '/';
  const tail = trailerAt(s, s.indexOf(sep) + 1); // the words after the parts: a dash whose own words ask («… / wait — which?»)
  const raw = s.slice(0, tail).replace(/[?？]\s*$/, '').split(sep);
  if (raw.length < 2 || raw.length > SHORT_PARTS) return [];
  const toks = raw.map((x) => x.trim());
  if (toks.some((x) => !x || /[，,。.!?？！:：;；]/.test(x) || x.length > LABEL_MAX)) return [];
  const spaced = raw.slice(0, -1).every((x) => /\s$/.test(x)) && raw.slice(1).every((x) => /^\s/.test(x));
  if (!spaced && !toks.every((x) => CJK.test(x) || /^[A-Za-z]$/.test(x))) return [];
  return bounded(toks);
}
/** The detail's options ([] = not an option list) beside its question — see the header. */
function optionsOf(detail, question = '') {
  const s = typeof detail === 'string' ? detail.trim() : '';
  if (!s) return [];
  const a = lettered(s);
  if (a.length) return a;
  const l = letteredLine(s);
  if (l.length) return l;
  const n = numbered(s, question);
  return n.length ? n : short(s, question);
}
/** The chips a For-you surface draws for `item`: explicit options win; else an ask's detail parsed. */
function askOptions(item, detail) {
  if (!item || typeof item !== 'object') return [];
  if (Array.isArray(item.options) && item.options.length) return item.options.map((o) => String(o));
  if (item.clearedAt || item.kind === 'notice' || item.action || item.card || item.jobId || (item.i18n && (item.i18n.text || item.i18n.detail))) return [];
  return optionsOf(detail === undefined ? item.detail : detail, typeof item.text === 'string' ? item.text : '');
}

module.exports = { OPTIONS_MAX, LABEL_MAX, NUMBERED_MAX, SHORT_MAX, optionsOf, askOptions };
