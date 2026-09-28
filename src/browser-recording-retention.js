'use strict';
/**
 * THE VIDEO RECORDINGS' OWN BOUND — PURE (imports nothing). The per-profile
 * screencast (D7 opt-in, `record start` at 30 fps) keeps the bound it always
 * had: 7 days or 200 MB per profile, whichever bites first, oldest first. It
 * lives here, apart from the action trace, because the trace is kept by SIZE
 * ONLY (the owner, 2026-09-27 — src/browser-trace.js `traceSizePlan`: no age
 * rule anywhere in the trace) while a recording is a video file with its own
 * storage bill; the rule moved here verbatim from the pre-2026-09-27
 * `traceRetentionPlan`. Every removal names its rule, every kept group says
 * what it holds.
 */
const RECORDING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECORDING_BYTES_PER_PROFILE = 200 * 1024 * 1024;

/** The plan over grouped files (`groups` = [{key, entries:[{id, at, bytes}]}]): age first, then size, oldest first. */
function recordingRetentionPlan({ groups = [], now, retentionMs = RECORDING_RETENTION_MS, bytesPerGroup = RECORDING_BYTES_PER_PROFILE } = {}) {
  const t = Number(now) || 0;
  const remove = [], kept = [];
  for (const g of groups) {
    const key = String(g.key || '');
    const entries = [...(g.entries || [])].filter((e) => e && e.id).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    let bytes = 0;
    const alive = [];
    for (const e of entries) {
      const age = t - (Number(e.at) || 0);
      if (age > retentionMs) { remove.push({ key, id: e.id, bytes: Number(e.bytes) || 0, why: `recording older than ${Math.round(retentionMs / 86400000)} d (${Math.round(age / 86400000)} d)` }); continue; }
      alive.push(e); bytes += Number(e.bytes) || 0;
    }
    while (alive.length && bytes > bytesPerGroup) {
      const e = alive.shift();
      bytes -= Number(e.bytes) || 0;
      remove.push({ key, id: e.id, bytes: Number(e.bytes) || 0, why: `recordings over ${Math.round(bytesPerGroup / 1048576)} MB for this profile (oldest first)` });
    }
    kept.push({ key, n: alive.length, bytes, why: alive.length ? `${alive.length} recording(s), ${Math.round(bytes / 1024)} KB` : 'empty' });
  }
  return { remove, kept, bytesRemoved: remove.reduce((s, r) => s + r.bytes, 0) };
}

module.exports = { RECORDING_RETENTION_MS, RECORDING_BYTES_PER_PROFILE, recordingRetentionPlan };
