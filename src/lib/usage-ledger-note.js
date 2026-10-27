// THE USAGE WINDOW'S LEDGER NOTE (B-9428 r4, verify #1/#6): an answer that left rows out (a ledger file
// vanished during the read — `partial`) or that is a snapshot behind now (`asOf`, the walk's start) SAYS so
// under the totals — a server console line is not a report. PURE (imports nothing) + a tiny builder over the
// caller's document, so the window suite asserts the element.
export const LEDGER_NOTE_WORDS = {
  partial: '{n} rows from a missing ledger file were not counted — the ledger is being rebuilt',
  asOf: 'As of {time}',
  // lane ledger-dedup-law F4: a machine's ingest PAUSED (its monthly file out of shape) — a state the window shows
  // r2: the words say what IS happening or what HAPPENED (the remedy's state), never a promise — r3: a row for EVERY state
  // the remedy can be in (src/usage-history.js REMEDY_STATES), none of them a fallback to «the repeated rows are being removed»
  pausedRunning: 'Usage of {machine} for {month} is held: its ledger file {shard} is out of shape ({size}) — the repeated rows are being removed; recording resumes when that brings it back in shape',
  pausedJudging: 'Usage of {machine} for {month} is held: its ledger file {shard} was judged out of shape by its index ({size}) — judged again by it after the ledger loads',
  pausedFailed: 'Usage of {machine} for {month} is held: its ledger file {shard} is out of shape ({size}) — removing the repeated rows failed ({error}); tried again after {time}',
  pausedNotRewritten: 'Usage of {machine} for {month} is held: its ledger file {shard} is out of shape ({size}) — the file was not rewritten ({error}); tried again after {time}',
  pausedStill: 'Usage of {machine} for {month} is held: its ledger file {shard} is still out of shape ({size}) after the repeated rows were removed; checked again after {time}',
  pausedProvenOver: 'Usage of {machine} for {month} is held: its ledger file {shard} is over 2 GiB ({size}) and already deduplicated — the month\'s file needs splitting or its bound raising; VibeSpace does not try again',
  pausedIds: 'Usage of {machine} for {month} is held: its ledger file {shard} holds more distinct records than the index keeps ({size}) — the month\'s file needs splitting or its bound raising; VibeSpace does not try again',
  pausedNone: 'Usage of {machine} for {month} is held: its ledger file {shard} is out of shape ({size}) — recording stays paused while it is',
  // r4: a pause is ONE month's (its other months are recorded as usual) — what is held, the bound, what was dropped past it
  pausedHeld: '{held} events of {machine} for {month} held until its file is back in shape (at most {bound}; then recorded, in order) — its other months are recorded as usual',
  pausedDropped: 'Past the bound, the {dropped} oldest held events of {machine} for {month} were dropped — counted, never recorded',
};
/** The remedy's state → its words (a state this window does not know is said as `none`: paused, no claim). */
export const PAUSED_WORDS = { running: 'pausedRunning', judging: 'pausedJudging', failed: 'pausedFailed', 'not-rewritten': 'pausedNotRewritten', insufficient: 'pausedStill', 'proven-over': 'pausedProvenOver', ids: 'pausedIds', none: 'pausedNone' };
export const AS_OF_LAG_MS = 60e3; // a walk answers as of its start; more than a minute behind now ⇒ the window says when
const hhmm = (ms) => { const x = new Date(ms); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
/** The notes an answer carries: [{kind, words, vars}] (empty = nothing to say). */
export function ledgerNote(d, now = Date.now()) {
  const out = [];
  if (d && d.partial && d.partial.missingRows > 0) out.push({ kind: 'partial', words: LEDGER_NOTE_WORDS.partial, vars: { n: d.partial.missingRows } });
  if (d && Number.isFinite(d.asOf) && now - d.asOf > AS_OF_LAG_MS) out.push({ kind: 'asof', words: LEDGER_NOTE_WORDS.asOf, vars: { time: hhmm(d.asOf) } });
  for (const p of (d && Array.isArray(d.ingestPaused) ? d.ingestPaused : []).slice(0, 4)) {
    const r = (p && p.remedy) || {}, words = LEDGER_NOTE_WORDS[(Object.prototype.hasOwnProperty.call(PAUSED_WORDS, r.state) && PAUSED_WORDS[r.state]) || 'pausedNone'];
    const month = String(p.month || (/(\d{4}-\d{2})/.exec(String(p.shard || '')) || [])[1] || '');
    const vars = { machine: String(p.hostName || p.host || ''), month, shard: String(p.shard || ''), size: `${((Number(p.size) || 0) / 2 ** 30).toFixed(2)} GiB`, error: String(r.code || r.error || '').slice(0, 120), time: r.nextAt ? hhmm(r.nextAt) : '', held: String(Number(p.held) || 0), dropped: String(Number(p.dropped) || 0), bound: `${Math.round((Number(p.holdMax) || 64 * 2 ** 20) / 2 ** 20)} MiB` };
    out.push({ kind: 'paused', words, vars });
    if (Number(p.held) > 0) out.push({ kind: 'paused', words: LEDGER_NOTE_WORDS.pausedHeld, vars });
    if (Number(p.dropped) > 0) out.push({ kind: 'paused', words: LEDGER_NOTE_WORDS.pausedDropped, vars });
  }
  return out;
}
/** The element under the totals (null when there is nothing to say); `t` = the window's translator. */
export function ledgerNoteEl(doc, d, t, now = Date.now()) {
  const notes = ledgerNote(d, now);
  if (!notes.length) return null;
  const el = doc.createElement('div');
  el.className = 'usage-ledger-note';
  for (const n of notes) {
    const line = doc.createElement('div');
    line.className = 'usage-ledger-note-' + n.kind;
    line.textContent = t(n.words, n.vars);
    el.appendChild(line);
  }
  return el;
}
