'use strict';
// THE SETTINGS ANSWER AT THE LANDING (row B-ddf3 unit 2 line 1, lane bl-scratch, the coordinator's r1407 (b)). A settings write
// that moves a CLI-config row (or the Integration switch) changes the CLI's own files on this machine through the shipped helper
// (src/server/cli-config-runner.js): the write's answer waits for that LANDING — or says BY NAME that it did not land (refused,
// failed, or still writing past the bound: the landing still comes and is journalled). Never «applied» before it.
// answerAtLanding(res, body, landing, { boundMs, setTimer }) — `landing` is the change hook's return (a Promise, or null when
// no CLI-config row moved); the answer gains `cliConfig: { landed: true } | { landed: false, why }`.
const LANDING_BOUND_MS = 10000;
/** WHAT DID NOT LAND, by name, in any shape a CLI-config change answers — null = landed. The shapes: harness-config-sync
 *  syncCliConfig's `{ receipts, files, landing }` / `{ error }` / a refusal `{ skipped, refused | settingsHeld }`; a runner
 *  landing `{ ok, why }` (the Integration switch's removal); the hook registration's per-file answers `{ claude: { ok, error,
 *  missing } }` (a CLI that has not run on this machine — `missing: 'no-dir'` — is no failure: nothing of it was asked); an
 *  array of these (the switch's own write beside the rows'). */
function notLanded(r) {
  if (!r || typeof r !== 'object') return null;
  if (Array.isArray(r)) { const w = r.map(notLanded).filter(Boolean); return w.length ? w.join('; ') : null; }
  if (r.skipped) return r.refused ? String(r.refused.line || r.refused.why || 'refused on this server') : r.settingsHeld ? 'the settings are held' : r.optOutUnread && r.error ? String(r.error) : 'skipped';   // B-f276 (s1126): an unread opt-out mark says why
  if (r.error) return String(r.error);
  if (r.ok === false) return String(r.why || 'not applied');
  if (r.landing && r.landing.ok === false) return String(r.landing.why || 'not applied');
  if ('ok' in r || 'receipts' in r) return null;
  const bad = Object.entries(r).filter(([, v]) => v && typeof v === 'object' && v.ok === false && v.missing !== 'no-dir');
  return bad.length ? bad.map(([k, v]) => `${k}: ${v.error || v.why || 'not applied'}`).join('; ') : null;   // r1813: a nested landing carries `why`
}
function answerAtLanding(res, body, landing, { boundMs = LANDING_BOUND_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!landing || typeof landing.then !== 'function') return res.json(body);
  let done = false, t = null;
  const say = (cliConfig) => { if (done) return; done = true; if (t) clearTimer(t); res.json({ ...body, cliConfig }); };
  t = setTimer(() => say({ landed: false, why: `the CLI config has not landed on this machine within ${boundMs / 1000} s (still writing)` }), boundMs);
  if (t && typeof t.unref === 'function') t.unref();
  landing.then((r) => { const why = notLanded(r); say(why ? { landed: false, why } : { landed: true }); }, (e) => say({ landed: false, why: (e && e.message) || String(e) }));
}
module.exports = { answerAtLanding, notLanded, LANDING_BOUND_MS };
