/**
 * end-proposal.js — PURE (CJS, imports nothing — the client bundle draws the card from it): THE PROPOSAL CARD (lane login-request-card, majordomo piece 3b).
 * The owner, 2026-11-16: an agent that may NOT end a conversation can at least PROPOSE the end to the person on a card. 主开发's piece
 * (2026-11-17 03:59Z): ONE card per proposer in For-you (a second proposal refreshes it), a row per conversation from the SAME builder
 * as conversations.list, rows with nothing running pre-selected, busy or unknown rows not; the press is the person's own Terminate and
 * ends only what the card showed truthfully — each row judged again at the press; the answer goes back to the proposer at its next
 * turn, free. No clock: a proposal never ends anything by itself, and nothing here reads the time except to stamp a row's drawing.
 */
'use strict';

// THE action type, spelled ONCE (its two kinds: action.kind 'end' | 'wake')
const TYPE = 'end-proposal';
const isProposal = (a) => !!a && typeof a === 'object' && a.type === TYPE;   // the press and the row ask this test
const MAX_TARGETS = 20;   // one card's rows (For-you's card holds 64 entries; twenty conversations is a page a person reads)
const WHY_MAX = 300;      // «one sentence of why» — the same bound piece 7's propose-wake judges (src/agent-routes.js proposeWake)
const KEY_RE = /^[\w.:-]{1,200}$/;   // the automation table's own id shape (src/automation-keys.js ID_RE)

/** The verb's targets → { ok, targets } | { ok:false, code:'bad_args', why }: an array, or ONE string of ids split on commas /
 *  blanks (the CLI's one positional); each an id the table takes; duplicates folded; 1..MAX_TARGETS. */
function targetsOf(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : null;
  if (!list) return { ok: false, code: 'bad_args', why: 'targets: one or more conversation ids or keys (a list, or one string split on commas)' };
  const out = [];
  for (const t of list) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (!s) continue;
    if (!KEY_RE.test(s)) return { ok: false, code: 'bad_args', why: `targets: «${s.slice(0, 40)}» is not a conversation id or key` };
    if (!out.includes(s)) out.push(s);
  }
  if (!out.length) return { ok: false, code: 'bad_args', why: 'targets: name at least one conversation' };
  if (out.length > MAX_TARGETS) return { ok: false, code: 'bad_args', why: `targets: at most ${MAX_TARGETS} conversations on one card` };
  return { ok: true, targets: out };
}

/** THE ROW the card draws, from a conversations.list row (the one builder): its key, name, idle stamp, memory, and the verdict's
 *  busy CODES with the counts a person's words need. `n` = the count a reason names (background tasks, held prompts, asks, jobs). */
function drawnRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  const v = Array.isArray(r.busy) ? { busy: r.busy } : { busy: [{ code: 'facts_unknown' }] };   // the list builder's own verdict (shapeRow carries `busy`); a row without one is unknown — never ticked (this module requires nothing: the client bundle draws the card)
  const n = (code) => {
    if (code === 'background') return Array.isArray(r.background) ? r.background.length : null;
    if (code === 'held') return Number.isFinite(r.heldPrompts) ? r.heldPrompts : null;
    if (code === 'asks') return Number.isFinite(r.asks) ? r.asks : null;
    if (code === 'job') return r.jobs && Array.isArray(r.jobs.items) ? r.jobs.items.filter((x) => !x || x.wakeGrant !== true).length : null;   // the jobs and schedules WITHOUT the person's grant (piece 7's reason)
    return null;
  };
  const busy = (v.busy || []).map((b) => { const c = String(b.code), k = n(c); return k !== null ? `${c}:${k}` : c; });   // FLAT strings «code» / «code:n» (a For-you card nests 4 deep at most)
  return { key: String(r.key || ''), name: typeof r.name === 'string' ? r.name.slice(0, 120) : '', ended: r.state === 'ended',
    idleSince: typeof r.idleSince === 'number' || typeof r.idleSince === 'string' ? r.idleSince : null,
    memBytes: Number.isFinite(r.memBytes) ? r.memBytes : null, busy, pick: !busy.length && r.state !== 'ended' };
}

/** One busy entry → { code, n } — a flat «code» / «code:n» string, or an object { code, n }. */
const busyOf = (b) => (typeof b === 'string' ? { code: b.split(':')[0], ...(/:\d+$/.test(b) ? { n: Number(b.slice(b.lastIndexOf(':') + 1)) } : {}) } : { code: String(b && b.code || ''), ...(b && Number.isFinite(b.n) ? { n: b.n } : {}) });
const codesOf = (d) => (d && Array.isArray(d.busy) ? d.busy.map((b) => busyOf(b).code) : []);

/** THE PRESS'S JUDGEMENT of one row: what the card DREW against the row NOW (the same builder, read at the press). →
 *  { verdict: 'end' } — nothing runs now that the card did not show (the person saw what is cut off);
 *  { verdict: 'changed', added:[codes], row } — something runs now that the card did not show: NOT ended, drawn again;
 *  { verdict: 'ended' } — it ended meanwhile (said, not an error); { verdict: 'gone' } — no row by that key any more. */
function pressVerdict(drawn, now) {
  if (!now) return { verdict: 'gone' };
  if (now.state === 'ended') return { verdict: 'ended' };
  const was = new Set(codesOf(drawn));
  const fresh = drawnRow(now);
  const added = codesOf(fresh).filter((c) => !was.has(c));
  const before = (code) => (drawn.busy || []).map(busyOf).find((x) => x.code === code) || {};
  const grew = (fresh.busy || []).map(busyOf).filter((b) => was.has(b.code) && Number.isFinite(b.n) && Number.isFinite(before(b.code).n) && before(b.code).n < b.n).map((b) => b.code);
  if (added.length || grew.length) return { verdict: 'changed', added: [...added, ...grew], row: fresh };
  return { verdict: 'end' };
}

/** WHAT WOULD BE CUT OFF, in the person's words (i18n KEYS + params; the screen words them): one line per busy code. */
const CUT_WORDS = Object.freeze({
  turn: 'A turn is running — it is cut off.',   // ui-words: the person's own words, said through t() by the card
  background: '{n} background tasks stop.',   // ui-words: the person's own words, said through t() by the card
  held: '{n} held prompts are dropped.',   // ui-words: the person's own words, said through t() by the card
  asks: '{n} open questions close unanswered.',   // ui-words: the person's own words, said through t() by the card
  goal: 'Its goal loop stops.',   // ui-words: the person's own words, said through t() by the card
  continue: 'The continue armed after a usage limit is dropped.',   // ui-words: the person's own words, said through t() by the card
  timer: 'It set a timer — whether one is still due cannot be seen.',   // ui-words: the person's own words, said through t() by the card
  browser: 'A person is using its browser.',   // ui-words: the person's own words, said through t() by the card
  handover: 'A hand-over to it is in flight.',   // ui-words: the person's own words, said through t() by the card
  job: '{n} jobs or schedules of it could not resume it.',   // ui-words: the person's own words, said through t() by the card
  turn_unknown: 'Unknown — a terminal conversation says nothing of its turn.',   // ui-words: the person's own words, said through t() by the card
  unknown: 'Unknown — VibeSpace cannot see whether something runs in it.',   // ui-words: the person's own words, said through t() by the card
});
function cutOffWords(busy) {
  const out = [];
  for (const x of Array.isArray(busy) ? busy : []) {
    const b = busyOf(x), code = b.code;
    const key = CUT_WORDS[code] ? code : /_unknown$/.test(code) ? 'unknown' : null;
    if (!key) continue;
    const words = { key: CUT_WORDS[key], ...(Number.isFinite(b.n) ? { params: { n: b.n } } : {}) };
    if (!out.some((w) => w.key === words.key)) out.push(words);
  }
  return out;
}

/** THE DRAWING A PRESS ANSWERS (主开发's cure, law 4 — a press acts only on what the person saw): a short stable signature of the
 *  card (its why and rows); the page sends the one it drew, the hub compares it with the card it holds — a card changed since is
 *  redrawn, never acted on. FNV-1a over the card's JSON (the same on both sides: this module is the client's and the hub's). */
function cardSig(card) {
  const s = JSON.stringify(card && typeof card === 'object' ? { why: card.why || '', rows: Array.isArray(card.rows) ? card.rows : [] } : null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The answer the proposer reads at its next turn (agent-facing English, the tree's rule for verb answers) — EVERY outcome with
 *  its true reason (law 5): an end that FAILED is a failure with its code, never «something started in it». */
function answerText({ terminated = [], kept = [], changed = [], failed = [], ended = [], granted = [], withdrawn = [] } = {}) {
  const list = (a) => a.map((r) => `${r.name || r.key} (${r.key})`).join(', ');
  const jobs = (a) => a.map((r) => `${r.name || r.id} (${r.id})`).join(', ');
  const parts = [];
  if (terminated.length) parts.push(`terminated: ${list(terminated)}`);
  if (kept.length) parts.push(`kept: ${list(kept)}`);
  if (changed.length) parts.push(`not ended — something started in it after the card was drawn: ${list(changed)}`);
  if (failed.length) parts.push(`not ended — the end failed: ${failed.map((r) => `${r.name || r.key} (${r.key}; ${r.failed || 'failed'}${r.why ? `: ${r.why}` : ''})`).join(', ')}`);   // B-f276 (r5074 (2)): a held engine's own words
  if (ended.length) parts.push(`already ended: ${list(ended)}`);
  if (granted.length) parts.push(`its jobs that may now wake it after the end: ${jobs(granted)}`);
  if (withdrawn.length) parts.push(`its jobs that may no longer wake it: ${jobs(withdrawn)}`);
  return `The person answered your proposal to end conversations — ${parts.join('; ') || 'nothing to do'}.`;
}

/** The wake card's answer to its proposer (agent-facing English) — each job with the conversation it wakes, every outcome said. */
function wakeAnswerText({ granted = [], withdrawn = [], unchanged = [], gone = [], moved = [], refused = [] } = {}) {
  const list = (a) => a.map((r) => `${r.name || r.id} (${r.id}${r.owner && r.owner.key ? `, wakes ${r.owner.key}` : ''})`).join(', ');
  const parts = [];
  if (granted.length) parts.push(`may now wake the conversation it belongs to after it is ended: ${list(granted)}`);
  if (withdrawn.length) parts.push(`may no longer wake it: ${list(withdrawn)}`);
  if (unchanged.length) parts.push(`kept as they were: ${list(unchanged)}`);
  if (gone.length) parts.push(`no longer exist (removed since the card was drawn): ${list(gone)}`);
  if (moved.length) parts.push(`not written — it now belongs to another conversation than the card showed: ${list(moved)}`);
  if (refused.length) parts.push(`not written — refused: ${refused.map((r) => `${r.name || r.id} (${r.id}; ${r.refused || 'refused'})`).join(', ')}`);
  return `The person answered your proposal about waking jobs — ${parts.join('; ') || 'nothing to do'}.`;
}

/** The refusal a proposal meets when the person already declined exactly these (law 8 — told once, nothing filed). */
function declinedText(kind, names, at) {
  const when = Number.isFinite(at) ? new Date(at).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : 'before';
  return kind === 'wake'
    ? `the person kept these jobs as they are at ${when}: ${names.join(', ')} — nothing was filed; propose again only when something about them differs`
    : `the person kept these conversations at ${when}: ${names.join(', ')} — nothing was filed; propose again only when something about them differs (what runs in one)`;
}

module.exports = { TYPE, isProposal, busyOf, MAX_TARGETS, WHY_MAX, targetsOf, drawnRow, pressVerdict, CUT_WORDS, cutOffWords, cardSig, answerText, wakeAnswerText, declinedText };
