// THE USAGE WINDOW'S LEDGER NOTE (B-9428 r4, verify #1/#6): an answer that left rows out (a ledger file
// vanished during the read — `partial`) or that is a snapshot behind now (`asOf`, the walk's start) SAYS so
// under the totals — a server console line is not a report. PURE (imports nothing) + a tiny builder over the
// caller's document, so the window suite asserts the element.
export const LEDGER_NOTE_WORDS = {
  partial: '{n} rows from a missing ledger file were not counted — the ledger is being rebuilt',
  asOf: 'As of {time}',
};
export const AS_OF_LAG_MS = 60e3; // a walk answers as of its start; more than a minute behind now ⇒ the window says when
const hhmm = (ms) => { const x = new Date(ms); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
/** The notes an answer carries: [{kind, words, vars}] (empty = nothing to say). */
export function ledgerNote(d, now = Date.now()) {
  const out = [];
  if (d && d.partial && d.partial.missingRows > 0) out.push({ kind: 'partial', words: LEDGER_NOTE_WORDS.partial, vars: { n: d.partial.missingRows } });
  if (d && Number.isFinite(d.asOf) && now - d.asOf > AS_OF_LAG_MS) out.push({ kind: 'asof', words: LEDGER_NOTE_WORDS.asOf, vars: { time: hhmm(d.asOf) } });
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
