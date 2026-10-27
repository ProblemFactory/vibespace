// THE USAGE WINDOW'S LEDGER NOTE (B-9428 r4, verify #1/#6): an answer that left rows out (a ledger file
// vanished during the read — `partial`) or that is a snapshot behind now (`asOf`, the walk's start) SAYS so
// under the totals — a server console line is not a report. PURE (imports nothing) + a tiny builder over the
// caller's document, so the window suite asserts the element.
export const LEDGER_NOTE_WORDS = {
  partial: '{n} rows from a missing ledger file were not counted — the ledger is being rebuilt',
  asOf: 'As of {time}',
  // lane ledger-dedup-law F4: a machine's ingest PAUSED (its monthly file out of shape) — a state the window shows
  // r2: the words say what IS happening or what HAPPENED (the remedy's state), never a promise
  paused: 'Usage of {machine} is not being recorded: its ledger file {shard} is out of shape ({size}) — the repeated rows are being removed; recording resumes when that brings it back in shape',
  pausedFailed: 'Usage of {machine} is not being recorded: its ledger file {shard} is out of shape ({size}) — removing the repeated rows failed ({error}); tried again after {time}',
  pausedNotRewritten: 'Usage of {machine} is not being recorded: its ledger file {shard} is out of shape ({size}) — the file was not rewritten ({error}); tried again after {time}',
  pausedStill: 'Usage of {machine} is not being recorded: its ledger file {shard} is still out of shape ({size}) after the repeated rows were removed; checked again after {time}',
};
const PAUSED_WORDS = { failed: 'pausedFailed', 'not-rewritten': 'pausedNotRewritten', insufficient: 'pausedStill' };
export const AS_OF_LAG_MS = 60e3; // a walk answers as of its start; more than a minute behind now ⇒ the window says when
const hhmm = (ms) => { const x = new Date(ms); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
/** The notes an answer carries: [{kind, words, vars}] (empty = nothing to say). */
export function ledgerNote(d, now = Date.now()) {
  const out = [];
  if (d && d.partial && d.partial.missingRows > 0) out.push({ kind: 'partial', words: LEDGER_NOTE_WORDS.partial, vars: { n: d.partial.missingRows } });
  if (d && Number.isFinite(d.asOf) && now - d.asOf > AS_OF_LAG_MS) out.push({ kind: 'asof', words: LEDGER_NOTE_WORDS.asOf, vars: { time: hhmm(d.asOf) } });
  for (const p of (d && Array.isArray(d.ingestPaused) ? d.ingestPaused : []).slice(0, 4)) {
    const r = (p && p.remedy) || {}, words = LEDGER_NOTE_WORDS[PAUSED_WORDS[r.state] || 'paused'];
    out.push({ kind: 'paused', words, vars: { machine: String(p.hostName || p.host || ''), shard: String(p.shard || ''), size: `${((Number(p.size) || 0) / 2 ** 30).toFixed(2)} GiB`, error: String(r.code || r.error || '').slice(0, 120), time: r.nextAt ? hhmm(r.nextAt) : '' } });
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
