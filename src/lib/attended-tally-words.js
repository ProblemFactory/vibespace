// THE ATTENDED TALLY, WORDED (B-64c1, 主开发 r590/r599). The spending ceiling counts only turns nobody typed; a turn a PERSON
// pressed is neither refused nor counted, and the guard keeps a day of them by reason (src/server/spend-guard.js snapshot()
// .attended — src/spend-authorizer.js producerCounts: {reason: count}, pruned to the last 24 h). ⚙ Diagnostics report shows
// them with THESE words: ONE section after the errors and events tables, a row per reason, «Other (…)» for a reason this
// page does not know. COUNTS ONLY: no conversation's name and no message's text — a diagnostics report is copied and sent.
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-spend-paths.mjs); the caller passes t / esc.

/** the reasons of src/spend-authorizer.js SPEND_REASONS marked `attended: true`, in a person's words */
const REASON_WORDS = Object.freeze({
  'outbox-wake-now': (t) => t('An outbox receipt delivered now'),
  'owner-channel-send': (t) => t('Your message to an agent from Channels'),
  'owner-group-wake': (t) => t('A group message you posted that woke its members'),
  'browser-handback': (t) => t('Browser control handed back, or a browser proposal approved'),
  'window-share-request': (t) => t('A window control request from a desktop app window'),
  'stash-handover': (t) => t('Waiting notices handed to a conversation now'),
  'group-handover': (t) => t('Waiting group messages handed to a running turn'),
  'held-deliver': (t) => t('A held channel digest delivered now'),
  'bulk-resume': (t) => t('Every conversation a limit stopped, resumed'),
});
export const ATTENDED_REASONS = Object.freeze(Object.keys(REASON_WORDS));

/** one reason in words — a reason this page does not know is said as «Other (<its code>)» */
export function reasonWords(reason, t) {
  const w = REASON_WORDS[reason];
  return w ? w(t) : t('Other ({reason})', { reason: String(reason == null ? '?' : reason).slice(0, 40) });
}

/** the tally's rows, largest first: [{reason, words, n}] — a count that is not a positive whole number is no row */
export function attendedRows(attended, t) {
  if (!attended || typeof attended !== 'object') return [];
  return Object.entries(attended)
    .map(([reason, v]) => ({ reason, n: Math.floor(Number(v)) }))
    .filter((r) => Number.isFinite(r.n) && r.n > 0)
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason))
    .map((r) => ({ ...r, words: reasonWords(r.reason, t) }));
}

/** ⚙ Diagnostics report: '' from a server that sends no tally (an older one); else ONE section — its title, the 24-hour count
 *  (or «None …»), a row per reason, and why these turns are not counted */
export function attendedSection(attended, { t, esc }) {
  if (!attended || typeof attended !== 'object') return '';
  const rows = attendedRows(attended, t);
  const n = rows.reduce((s, r) => s + r.n, 0);
  return `<h2>${esc(t('Turns a person pressed (not counted)'))}</h2>`
    + `<p><b>${esc(n ? t('{n} in the last 24 hours', { n }) : t('None in the last 24 hours.'))}</b></p>`
    + (rows.length ? `<table>${rows.map((r) => `<tr><td>${esc(r.words)}</td><td class="n">${r.n}</td></tr>`).join('')}</table>` : '')
    + `<p class="dim">${esc(t('The spending ceiling counts only turns nobody typed. A turn a person starts is neither refused nor counted; these are those turns, by how they were started.'))}</p>`;
}
