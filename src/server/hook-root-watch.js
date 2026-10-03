'use strict';
/**
 * THE HOOK-ROOT WATCH (lane hook-root-guard verify r2, 2026-10-02) — what happens around an UNJUDGEABLE server root.
 *
 * r1 made a read error on `.git` the `unknown` verdict (refused, never cached). This module owns its consequences, which
 * r1 had left in server.js and to the hook-health probe (60 s after boot, then every 6 h — a session started during an NFS
 * stall got no hooks and its agent never learned the tools; the probe returned SILENTLY while the root stayed unjudgeable;
 * the notice was keyed in memory ⇒ one toast PER BOOT while nothing was wrong; a later registration was announced as
 * "broken … repaired", or not at all):
 *   sync()               — ensureAgentHooks({auto:true}) + the verdict's consequences: `unknown` ⇒ unknown(); ok ⇒ recovered()
 *   unknown(refused)     — the notice ONCE PER CAUSE (PURE serverRoot.unknownNoticeDue over the memo PERSISTED in
 *                          data/hook-root-notice.json — written only when a client SAW the toast) + arm()
 *   arm()                — ONE timer re-running sync() on PURE serverRoot.nextRejudgeDelay(attempt): 30 s, 60 s, 2, 5, 10,
 *                          30 min, then the cap for ever; reset by a recovery
 *   recovered()          — the memo removed; the registration that followed an earlier unknown (rootRecovery().registeredAfterError,
 *                          the ORCH's once-set fact) said ONCE (`hook-root-registered`, PURE registeredAfterErrorLine, i18n)
 *   probeMayRun()        — the probe's gate: an unjudgeable root arms the loop instead of a silent return
 *   saidRecoveryInstead  — after the probe's self-heal: the recovery, never "repaired", for a root that was never registered
 * Timers and the clock are injected (the gate runs the loop with fake ones); the words are server-root.js's.
 */
const fs = require('fs');
const path = require('path');
const serverRoot = require('../server-root.js');
const { writeJsonAtomic } = require('../channel-store.js'); // the ONE atomic data/*.json writer
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs): the client words the toast with t(key, params)
const UNKNOWN_KEY = i18nKey('VibeSpace could not tell which folder it runs from ({error}) — the agent hooks are not registered; it reads again with backoff (30 s to 30 min) and registers them as soon as it can.');
const REGISTERED_KEY = i18nKey('VibeSpace registered the agent hooks at {time} after an earlier read error ({error}) — sessions started since then have the tools; sessions started during the error pick them up after a restart or compaction.');
const MEMO_FILE = 'hook-root-notice.json';

function create({ dataDir, ensureAgentHooks, rootRecovery, ownerWriteRefusal, integrationEnabled = () => true, serverNotice, setTimer = setTimeout, now = Date.now, log = console.warn } = {}) {
  const memoFile = path.join(dataDir, MEMO_FILE);
  const st = { timer: null, attempt: 0, said: false, delays: [] };
  function arm() {
    if (st.timer) return null;
    const delay = serverRoot.nextRejudgeDelay(st.attempt++);
    st.delays.push(delay);
    st.timer = setTimer(() => { st.timer = null; try { sync(); } catch (e) { log('[integration] hook-root re-judge failed:', e && e.message); } }, delay);
    if (st.timer && typeof st.timer.unref === 'function') st.timer.unref();
    return delay;
  }
  function unknown(refused) {
    let memo = null; try { memo = JSON.parse(fs.readFileSync(memoFile, 'utf-8')); } catch { memo = null; }
    const due = serverRoot.unknownNoticeDue(memo, refused.why || refused.line);
    let posted = false;
    if (due.post) {
      const error = String(refused.why || '').replace(/^the server root could not be judged: /, '');
      const seen = serverNotice('hook-root-unknown', `${refused.line} — read again with backoff (30 s to 30 min); hooks register then.`, { level: 2, i18n: { key: UNKNOWN_KEY, params: { error } } });
      posted = Number(seen) > 0;
      if (posted) { try { writeJsonAtomic(memoFile, due.memo); } catch (e) { log('[integration] hook-root notice memo not written:', e && e.message); } }
    }
    arm();
    return { posted };
  }
  function recovered() {
    st.attempt = 0;
    try { if (fs.existsSync(memoFile)) fs.rmSync(memoFile, { force: true }); } catch { }
    const rec = typeof rootRecovery === 'function' ? rootRecovery() : null;
    if (rec && rec.registeredAfterError && !st.said) {
      st.said = true;
      const d = new Date(rec.registeredAfterError.at); const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const error = String(rec.registeredAfterError.error || '').slice(0, 200);
      serverNotice('hook-root-registered', serverRoot.registeredAfterErrorLine({ time, error }), { level: 1, i18n: { key: REGISTERED_KEY, params: { time, error } } });
      return { said: true };
    }
    return { said: false };
  }
  function sync() {
    const r = ensureAgentHooks({ auto: true });
    if (r && r.refused && r.refused.kind === 'unknown') unknown(r.refused);
    else if (r && !r.refused) recovered();
    return r;
  }
  function probeMayRun() {
    const r = typeof ownerWriteRefusal === 'function' ? ownerWriteRefusal() : null;
    if (!r) return true;
    if (r.kind === 'unknown' && integrationEnabled()) arm();
    return false;
  }
  function saidRecoveryInstead(info = {}, scriptMissing = false) {
    const rec = typeof rootRecovery === 'function' ? rootRecovery() : null;
    if (rec && rec.registeredAfterError && !info.stale && !scriptMissing) { recovered(); return true; }
    return false;
  }
  return { sync, arm, unknown, recovered, probeMayRun, saidRecoveryInstead, memoFile, _state: st };
}

module.exports = { create, UNKNOWN_KEY, REGISTERED_KEY, MEMO_FILE };
