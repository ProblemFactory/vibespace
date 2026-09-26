'use strict';
/**
 * THE STALE-APPROVAL WORDS — PURE (imports nothing; CJS so the normalizer, the
 * handback announcer and the bundle share ONE spelling). Lane J r2 (the
 * 2026-09-25 naive-user study's S8-36): an approval card the agent queued for
 * a browser page command before — or while — the user drove its browser is
 * answered by the server with a deny whose message starts with `STALE_MARK`
 * (the code the model reads: browser_paused) and says what to do; the claude
 * normalizer reads the same message back (`staleFromDenyMessage`) so a
 * restart-rebuilt card still says why. Which cards are stale is decided in
 * src/browser-takeover.js (`browserApprovalVerdict`); this file is only the
 * words, kept apart because the message normalizer is bundled into the device
 * daemon and must not carry the browser CLI's name (test-architecture §52b).
 * Gate: scripts/test-browser-takeover.mjs (the lane J r2 table).
 */
const STALE_MOMENTS = Object.freeze(['takeover', 'handback']);
/** The deny's first words — the code the agent reads, and what a rebuilt
 *  history recognises the stale answer by. */
const STALE_MARK = 'browser_paused — ';
const whoOf = (label) => (label ? `the "${label}" browser` : 'your browser');

/** The deny the CLI hands the model. Starts with STALE_MARK (the code). */
function staleDenyText({ moment = 'takeover', label = null } = {}) {
  const m = STALE_MOMENTS.includes(moment) ? moment : 'takeover';
  const who = whoOf(label);
  return m === 'handback'
    ? `${STALE_MARK}this step was queued while the user drove ${who}, so it did NOT run: the page it was planned on has changed. Re-plan from the handback message (it names the page they left) and a fresh snapshot before any browser command.`
    : `${STALE_MARK}the user took over ${who} before this step ran, so it did NOT run (it was planned on a page that may now be different). Do not retry and do not queue browser commands — wait for the handback message, which names the page they left, then re-plan from a fresh snapshot.`;
}
/** A deny message → `{code:'browser_paused', moment}` when it is a stale
 *  answer (so a restart-rebuilt card keeps saying why), else null. */
function staleFromDenyMessage(message) {
  const t = typeof message === 'string' ? message : '';
  if (!t.startsWith(STALE_MARK)) return null;
  return { code: 'browser_paused', moment: /queued while the user drove/.test(t) ? 'handback' : 'takeover' };
}

module.exports = { STALE_MOMENTS, STALE_MARK, staleDenyText, staleFromDenyMessage };
