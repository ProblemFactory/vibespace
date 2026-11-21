'use strict';
/**
 * B-e7c0 ON A PAIRED MACHINE (lane lg-rewind; ruled 2026-11-21 00:26Z, r723) — THE HUB'S ONE ASK of a paired machine's agent to
 * merge the person's own settings file THERE (op `settings-merge`: src/machine-probes.js settingsMergeOp, the merge
 * src/settings-merge.js deviceMergeOf — the one rule both sides run). Asked by the create (src/ws-create.js) only for a start that
 * sets that file aside today (a subscription pick; the machine's helper named or unread). ONE ask, bounded WHOLE by
 * BILLPICK.DEVICE_MERGE_MS (4 s: the agent's connection and its answer together), never retried. The layer is exactly the argv's
 * inline `--settings` — what the set-aside start carries today, no widening; only the merged file's PATH comes back into the line,
 * and only one of the device's own shape (absolute, ending /<id>.settings, no control character). No agent, an agent without the op
 * (DeviceManager.settingsMerge refuses before any request: an unknown op hangs), a refusal (the machine's own policy's too), a bad
 * layer, no answer in time ⇒ {refused: reason} — the create keeps the release's set-aside, said as today.
 */
const BILLPICK = require('../settings-merge.js');

async function askDeviceMerge({ hosts, hostId, id, args, cwd = null, ownFile = null, by = 'system:spawn', boundMs = BILLPICK.DEVICE_MERGE_MS } = {}) {
  const layer = BILLPICK.settingsLayerOf(args);
  if (!layer) return { refused: 'no-inline-settings' };
  const lr = BILLPICK.layerRefusal(layer);
  if (lr) return { refused: lr };
  if (typeof id !== 'string' || !BILLPICK.MERGE_SID_RE.test(id)) return { refused: 'bad-sid' };
  let timer = null;
  const late = new Promise((r) => { timer = setTimeout(() => r({ refused: 'late' }), boundMs); if (timer.unref) timer.unref(); });
  const ask = (async () => {
    const dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(hostId, boundMs) : null;
    if (!dm || typeof dm.settingsMerge !== 'function') return { refused: 'no-agent' };
    const r = await dm.settingsMerge({ sid: id, cwd, ownFile, layer, by, timeoutMs: boundMs });
    const p = r && r.ok === true && typeof r.path === 'string' ? r.path : '';
    if (!(p.startsWith('/') && p.endsWith(`/${id}.settings`) && !/[\0\n\r]/.test(p))) return { refused: String((r && r.reason) || 'refused').slice(0, 60) };
    return { args: BILLPICK.withSettingsPath(args, p), dropped: Array.isArray(r.dropped) ? r.dropped.map(String).slice(0, 64) : [], path: p };
  })().catch((e) => ({ refused: String((e && (e.code || e.message)) || 'failed').slice(0, 60) }));
  try { return await Promise.race([ask, late]); } finally { clearTimeout(timer); }
}

module.exports = { askDeviceMerge };
