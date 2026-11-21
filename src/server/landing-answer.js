'use strict';
// THE SETTINGS ANSWER AT THE LANDING (row B-ddf3 unit 2 line 1, lane bl-scratch, the coordinator's r1407 (b)). A settings write
// that moves a CLI-config row (or the Integration switch) changes the CLI's own files on this machine through the shipped helper
// (src/server/cli-config-runner.js): the write's answer waits for that LANDING — or says BY NAME that it did not land (refused,
// failed, or still writing past the bound: the landing still comes and is journalled). Never «applied» before it.
// answerAtLanding(res, body, landing, { boundMs, setTimer }) — `landing` is the change hook's return (a Promise, or null when
// no CLI-config row moved); the answer gains `cliConfig: { landed: true } | { landed: false, why }`.
const LANDING_BOUND_MS = 10000;
function answerAtLanding(res, body, landing, { boundMs = LANDING_BOUND_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!landing || typeof landing.then !== 'function') return res.json(body);
  let done = false, t = null;
  const say = (cliConfig) => { if (done) return; done = true; if (t) clearTimer(t); res.json({ ...body, cliConfig }); };
  t = setTimer(() => say({ landed: false, why: `the CLI config has not landed on this machine within ${boundMs / 1000} s (still writing)` }), boundMs);
  if (t && typeof t.unref === 'function') t.unref();
  landing.then((r) => {
    if (!r) return say({ landed: true });
    if (r.skipped) return say({ landed: false, why: r.refused ? (r.refused.line || r.refused.why || 'refused on this server') : r.settingsHeld ? 'the settings are held' : 'skipped' });
    const failed = r.error || (r.landing && r.landing.ok === false && r.landing.why) || Object.entries(r).filter(([, v]) => v && typeof v === 'object' && v.ok === false).map(([k, v]) => `${k}: ${v.error}`).join('; ');
    say(failed ? { landed: false, why: String(failed) } : { landed: true });
  }, (e) => say({ landed: false, why: (e && e.message) || String(e) }));
}
module.exports = { answerAtLanding, LANDING_BOUND_MS };
