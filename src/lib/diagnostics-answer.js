'use strict';
// THE DIAGNOSTICS REPORT'S ANSWER, JUDGED BEFORE ANYTHING IS DRAWN (B-360d unit 2, round wn1wcd01u's must, the coordinator's r887).
// The two summaries are read in a worker with deadlines (src/telemetry.js): on a slow or hung data folder the routes answer 503
// with their words ({error}), and fetchJson hands that body back as data. The page checked only for nothing at all, so a failed
// read was drawn as an ALL-CLEAR («No errors recorded — nothing crashed in this window», empty tables, the fleet gone without a
// word). THE LAW: an answer that is no report is SAID — in plain words with what to do (wait a moment and open it again) — and
// never drawn; the fleet's block says its own failure in one line. PURE: no DOM, no fetch; the caller words it (t()).
/** the report's answer → null (a report: draw it) | { why } — a refusal: `why` = the route's own words, or null (nothing came back,
 *  or an answer with no report in it) */
function reportRefusal(d) {
  if (!d || typeof d !== 'object') return { why: null };
  if (d.error) return { why: String(d.error) };
  if (!Number.isFinite(d.total)) return { why: null };   // no report in it: never drawn as one
  return null;
}
/** the fleet's answer → null (draw the fleet block as before) | { say, why } — `say` false only for an instance that is no
 *  collector (it has no fleet to speak of) */
function fleetRefusal(c) {
  if (!c || typeof c !== 'object') return { say: true, why: null };
  if (c.error) return { say: c.collector !== false, why: String(c.error) };
  return null;
}
module.exports = { reportRefusal, fleetRefusal };
