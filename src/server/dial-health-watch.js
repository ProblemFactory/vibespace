'use strict';
/**
 * A REFUSAL THAT REPEATS NAMES ITS CAUSE (lane host-stale-dialer, B-6136, 2026-10-12). The owner's Macbook kept a second,
 * older VibeSpace agent (a leftover launchd job with a generation-1 token) dialing in beside its live one; the hub
 * refused it every 30 s for a day and only the journal knew. The verdict is PURE (src/dial-health.js); this module is
 * its three consequences:
 *   · the row       `hosts.dialHealthOf(h)` → the /api/hosts row's `dialHealth` (the line + the platform's stop recipe)
 *   · For you       ONE item per (host id, kind) — filed when the verdict first says second-dialer, retracted (`system`)
 *                   when it stayed clear CLEAR_MS; the ledger data/dial-health.json outlives a restart (never a second
 *                   item for the same episode, a dismissed one stays dismissed)
 *   · the journal   `shouldLog(deviceId, verdict)` — while the verdict holds, ONE line per LOG_EVERY_MS per host (the
 *                   first at once); any other refusal keeps the address budget (dial-pairing.js logRefusal)
 * A 60 s unref'd sweep re-judges every dial host: the knocking stops ⇒ the row's line goes and the clock starts.
 */
const fs = require('fs');
const OF = require('./owner-facts.js'); // lane agent-context-owner-facts (B-7960): a time the owner or an agent reads is in the owner's zone, named
const path = require('path');
const DH = require('../dial-health.js');

const INBOX_KEY = 'machines'; // the panel's jump lands on Manage Agents → Machines (src/lib/user-todos-actions.js)
const RESOLVED_BY = 'system';
const i18nKey = (s) => s;
const nameOf = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 80) || 'a machine';
const whenOf = (ms) => OF.when(Number(ms) || 0);

/** The item's words — English text + the same sentences as STRUCTURE (the client words them per device). */
function itemOf({ machine, from, since, every }) {
  const p = { machine: nameOf(machine), from: from || '?', since: whenOf(since), every: String(every || DH.DIAL_EVERY_S) };
  const T = i18nKey('{machine}: a second VibeSpace agent keeps dialing in with an old token');
  const D1 = i18nKey('Another VibeSpace agent is also dialing in from {from} with an old token (refused every {every} s since {since}) — stop the extra agent on that machine (launchd / scheduled task / a second install), or pair again');
  const D2 = i18nKey('The machine’s row (Remote → {machine}) has the command to find and stop it. This item resolves itself 10 minutes after the knocking stops.');
  const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
  return { text: fill(T), detail: `${fill(D1)}\n${fill(D2)}`, i18n: { text: { key: T, params: p }, detail: [{ key: D1, params: p }, { key: D2, params: p }] } };
}

function create({ userTodos = null, dataDir, log = () => {}, now = () => Date.now(), bcast = () => {}, hosts = null, tickMs = 60000 } = {}) {
  const file = path.join(dataDir, 'dial-health.json');
  let ledger = {}; // `<host id>|<kind>` → { machine, from, since, at, itemId, text, clearSince }
  try { const j = JSON.parse(fs.readFileSync(file, 'utf-8')); if (j && j.hosts && typeof j.hosts === 'object') ledger = j.hosts; } catch { /* first run */ }
  const save = () => {
    try { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ version: 1, hosts: ledger }, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); }
    catch (e) { log(`[dial-health] ledger not written: ${e.message}`); }
  };
  const lastLogAt = new Map(); // host id → the last journal line under the second-dialer verdict (in memory: a restart logs once more)
  const keyOf = (id) => `${String(id).slice(0, 160)}|${DH.SECOND}`;
  /** Retract OUR item (never one the user already handled, never anyone else's). */
  const retract = (rec) => {
    if (!rec || !rec.itemId || !userTodos) return;
    try {
      const it = userTodos.get(rec.itemId);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === rec.text) userTodos.setStatus(rec.itemId, 'done', RESOLVED_BY);
    } catch (e) { log(`[dial-health] could not clear the For-you item: ${e.message}`); }
  };
  /** Judge one dial host (its record + whether its link is live) and keep the ledger / the item in step. → the verdict. */
  function observe(h, { connected = false } = {}) {
    if (!h || !h.id) return { kind: 'none' };
    const d = h.dial && typeof h.dial === 'object' ? h.dial : {};
    const t = now();
    const v = DH.secondDialerVerdict({ lastAccept: d.lastAccept, lastRefusal: d.lastRefusal, connected, now: t });
    const key = keyOf(h.id), rec = ledger[key];
    if (v.kind === DH.SECOND) {
      if (!rec) {
        const r = { machine: nameOf(h.name), from: v.from, since: v.since, at: t, itemId: null, text: null, clearSince: null };
        if (userTodos) {
          const w = itemOf({ ...r, every: v.every });
          try {
            const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'normal', by: 'agent', sessionName: 'Machines' });
            if (it && it.id) { r.itemId = it.id; r.text = it.text; }
          } catch (e) { log(`[dial-health] For-you item not filed for ${r.machine}: ${e.message}`); }
        }
        ledger[key] = r; save();
        log(`[dial-health] ${r.machine}: a second agent with an old token dials in from ${v.from || '?'} while the device is connected — told the user (its row + For you)`);
        try { bcast(); } catch { }
      } else if (rec.clearSince) { rec.clearSince = null; save(); try { bcast(); } catch { } }
      return v;
    }
    if (rec && !rec.clearSince) { rec.clearSince = t; save(); try { bcast(); } catch { } } // the row's line goes now; the item waits CLEAR_MS
    else if (rec && DH.clearDue(rec.clearSince, t)) {
      retract(rec); delete ledger[key]; save();
      log(`[dial-health] ${rec.machine}: no second agent for ${Math.round(DH.CLEAR_MS / 60000)} min — the For-you item is resolved`);
    }
    return v;
  }
  /** The journal under the verdict: true ⇒ write this refusal's line (the first at once, then one per LOG_EVERY_MS). */
  function shouldLog(hostId, v) {
    if (!v || v.kind !== DH.SECOND) return true;
    const t = now();
    if (!DH.logDue(lastLogAt.get(hostId), t)) return false;
    lastLogAt.set(hostId, t);
    return true;
  }
  const rowOf = (h, connected) => DH.dialHealthRow(h, { connected, now: now() });
  const liveOf = (h) => !!(h && (h.transport === 'dial' ? h.online : h.dialLive));
  function sweep() {
    if (!hosts) return 0;
    let n = 0;
    for (const h of hosts.list()) if (h && h.deviceId) { observe(h, { connected: liveOf(h) }); n++; }
    return n;
  }
  let timer = null;
  if (hosts) {
    hosts.dialHealthOf = (h) => rowOf(h, !!hosts.dialOnline?.(h.deviceId));
    if (tickMs > 0) { timer = setInterval(() => { try { sweep(); } catch (e) { log(`[dial-health] sweep failed: ${e.message}`); } }, tickMs); timer.unref?.(); }
  }
  const byDevice = (deviceId) => { const h = hosts && hosts.findByDeviceId?.(deviceId); return h ? { h, v: observe(h, { connected: !!hosts.dialOnline?.(deviceId) }) } : null; };
  return { observe, shouldLog, rowOf, sweep, byDevice, stop: () => { if (timer) clearInterval(timer); timer = null; }, _ledger: () => ledger };
}

module.exports = { create, itemOf, INBOX_KEY };
