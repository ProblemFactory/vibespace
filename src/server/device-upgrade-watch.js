'use strict';
/**
 * A STUCK DEVICE-AGENT UPGRADE REACHES THE USER (lane device-upgrade-stuck, 2026-10-03).
 *
 * The hub upgrades a device's agent at every hello whose version differs from the bundle it ships; the 2.330.0 loop
 * breaker gives up after 3 attempts and keeps the link (src/agentd/client.js). That give-up was a journal line and an
 * `agentd-upgrade-stuck` event — `_onUpgradeStuck` was never assigned — so the owner's Windows machine sat on agent
 * 2.369.199 (its self-upgrade cannot land on Windows) and every command read "exit 1" with nothing anywhere saying why.
 *
 * THE ONE DOOR for every transport (dial, ssh, the local daemon): `hosts.onAgentUpgrade(event, facts)` → here.
 *   stuck   ONE For-you item per (device, expected version) — the machine, from → to, what no longer works on the old
 *           agent when it is KNOWN (a Windows agent without run-shell: running commands), and the one step (rerun the
 *           install command). Re-armed when a NEWER expected version fails too (the older item is retracted as
 *           superseded); never re-filed for the same version (a dismissed item stays dismissed; a hub restart or the
 *           10-min retry cycle gives up again into the same ledger row).
 *   matched the device reported the expected version — the item is retracted (`system`), the row's line goes away.
 * `rowOf(hostKey)` → `{from, to, at, lost}` for the /api/hosts row (`agentUpgrade`), the machine row's line.
 * A DEVICE THAT NEVER CAME BACK (lane win-upgrade-pipe, 2026-10-04): the owner's Windows agent died in its 2.369.205
 * re-exec (named pipe EADDRINUSE) — the hub logged "upgrading (attempt 1/3)", the device never dialled back, and nothing
 * spoke (`stuck` needs a device that answers). `begun` arms a deadline per device (persisted: a hub restart keeps it),
 * every hello is `answered`; a device silent GONE_AFTER_MS after its upgrade began gets ONE For-you item per (machine,
 * version) — `sweep()` (a 30 s unref'd tick) files it, `answered` retracts it (`system`) when the device dials in.
 * The ledger is data/device-upgrades.json (atomic tmp+rename): it outlives the in-memory upgrade ledger and restarts.
 */
const fs = require('fs');
const path = require('path');
const XS = require('../exit-shell.js');

const INBOX_KEY = 'machines'; // the panel's jump lands on Manage Agents → Machines (src/lib/user-todos-actions.js)
const RESOLVED_BY = 'system';
const i18nKey = (s) => s;
// a healthy device re-dials within seconds of its re-exec (the Linux box: 17 s); 5 min of silence is a dead agent
const GONE_AFTER_MS = 5 * 60 * 1000;
const verOf = (v) => (typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(v) ? v : null);
const nameOf = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 80) || 'a machine';

/** What no longer works on the old agent, when it is KNOWN from its hello — 'commands' | null. */
function lostOf({ platform = null, capabilities = null } = {}) {
  return Array.isArray(capabilities) && !XS.canRunLine(platform, capabilities) ? 'commands' : null;
}
/** The item's words — English text + the same sentences as STRUCTURE (the client words them per device). */
function itemOf({ machine, from, to, lost }) {
  const m = nameOf(machine);
  const T = i18nKey('{machine}: its agent could not update ({from} → {to})');
  const D1 = i18nKey('VibeSpace tried 3 times to update the device agent on {machine} from {from} to {to}; it stayed at {from}.');
  const D2 = i18nKey('What does not work there until it is updated: running commands (vibespace-exit run) — this agent cannot run them on Windows.');
  const D3 = i18nKey("The one step: rerun the device's install command (Remote → {machine} → Pairing command). This item resolves itself when the device reports {to}.");
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  const p = { machine: m, from, to };
  const lines = [{ key: D1, params: p }, ...(lost === 'commands' ? [{ key: D2 }] : []), { key: D3, params: p }];
  return {
    text: fill(T, p),
    detail: lines.map((l) => fill(l.key, l.params || {})).join('\n'),
    i18n: { text: { key: T, params: p }, detail: lines },
  };
}

/** The never-came-back item's words — the same shape as itemOf. */
function goneItemOf({ machine, to }) {
  const m = nameOf(machine);
  const T = i18nKey('{machine} stopped answering after its upgrade to {to} began — rerun its install command (Remote → {machine} → Pairing command)');
  const D1 = i18nKey('VibeSpace started updating the device agent on {machine} to {to}; the device has not connected since. This item resolves itself when it connects again.');
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  const p = { machine: m, to };
  return { text: fill(T, p), detail: fill(D1, p), i18n: { text: { key: T, params: p }, detail: [{ key: D1, params: p }] } };
}

function create({ userTodos = null, dataDir, log = () => {}, now = () => Date.now(), bcast = () => {}, tickMs = 30000, goneAfterMs = GONE_AFTER_MS } = {}) {
  const file = path.join(dataDir, 'device-upgrades.json');
  let ledger = {}; // hostKey → { machine, from, to, at, lost, itemId, text }
  let gone = {}; // hostKey → { machine, to, at (the upgrade began), pending, filedFor, itemId, text } (lane win-upgrade-pipe)
  try { const j = JSON.parse(fs.readFileSync(file, 'utf-8')); if (j && j.devices && typeof j.devices === 'object') ledger = j.devices; if (j && j.gone && typeof j.gone === 'object') gone = j.gone; } catch { /* first run */ }
  const save = () => {
    try { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ version: 1, devices: ledger, gone }, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); }
    catch (e) { log(`[device-upgrade] ledger not written: ${e.message}`); }
  };
  /** Retract OUR item (never one the user already handled, never anyone else's). */
  const retract = (rec) => {
    if (!rec || !rec.itemId || !userTodos) return;
    try {
      const it = userTodos.get(rec.itemId);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === rec.text) userTodos.setStatus(rec.itemId, 'done', RESOLVED_BY);
    } catch (e) { log(`[device-upgrade] could not clear the For-you item: ${e.message}`); }
  };
  function stuck({ hostKey, machine, from, to, platform = null, capabilities = null } = {}) {
    const f = verOf(from), t = verOf(to), key = String(hostKey || '').slice(0, 160);
    if (!key || !f || !t || f === t) return null;
    const prev = ledger[key];
    const lost = lostOf({ platform, capabilities });
    if (prev && prev.to === t) { // the same (device, version): never a second item — refresh the row's facts only
      if (prev.from !== f || prev.lost !== lost) { prev.from = f; prev.lost = lost; save(); try { bcast(); } catch { } }
      return { filed: false, row: rowOf(key) };
    }
    if (prev) retract(prev); // a NEWER expected version failed too: the older item is superseded
    const rec = { machine: nameOf(machine), from: f, to: t, at: now(), lost, itemId: null, text: null };
    if (userTodos) {
      const w = itemOf(rec);
      try {
        const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: lost ? 'high' : 'normal', by: 'agent', sessionName: 'Machines' });
        if (it && it.id) { rec.itemId = it.id; rec.text = it.text; }
      } catch (e) { log(`[device-upgrade] For-you item not filed for ${rec.machine}: ${e.message}`); }
    }
    ledger[key] = rec; save();
    log(`[device-upgrade] ${rec.machine}: agent stays at ${f} (expected ${t})${lost ? ' — it cannot run commands there' : ''} — told the user (For you)`);
    try { bcast(); } catch { }
    return { filed: !!rec.itemId, row: rowOf(key) };
  }
  function matched({ hostKey, version } = {}) {
    const key = String(hostKey || '').slice(0, 160), rec = ledger[key];
    if (!rec) return false;
    retract(rec); delete ledger[key]; save();
    log(`[device-upgrade] ${rec.machine}: agent reports ${verOf(version) || '?'} — the stuck-upgrade item is resolved`);
    try { bcast(); } catch { }
    return true;
  }
  function rowOf(hostKey) {
    const r = ledger[String(hostKey || '')];
    return r ? { from: r.from, to: r.to, at: r.at, lost: r.lost || null } : null;
  }
  /** The hub STARTED an upgrade of this device: arm its deadline (re-armed by every attempt). */
  function begun({ hostKey, machine, to } = {}) {
    const key = String(hostKey || '').slice(0, 160), t = verOf(to);
    if (!key || !t) return false;
    gone[key] = { ...(gone[key] || {}), machine: nameOf(machine), to: t, at: now(), pending: true };
    save();
    return true;
  }
  /** The device answered (any hello): no deadline left, and an open never-came-back item resolves itself. */
  function answered({ hostKey } = {}) {
    const key = String(hostKey || '').slice(0, 160), g = gone[key];
    if (!g) return false;
    const had = !!g.itemId;
    retract(g);
    if (g.filedFor) { g.pending = false; g.itemId = null; g.text = null; } else delete gone[key];
    save();
    if (had) { log(`[device-upgrade] ${g.machine}: dialled in again — the never-came-back item is resolved`); try { bcast(); } catch { } }
    return had;
  }
  /** A device silent goneAfterMs after its upgrade began: ONE item per (machine, version). */
  function sweep() {
    let changed = false;
    for (const g of Object.values(gone)) {
      if (!g || !g.pending || now() - Number(g.at || 0) < goneAfterMs) continue;
      g.pending = false; changed = true;
      if (g.filedFor === g.to) { log(`[device-upgrade] ${g.machine}: silent again after its upgrade to ${g.to} began — already told the user for this version`); continue; }
      g.filedFor = g.to;
      if (userTodos) {
        const w = goneItemOf(g);
        try {
          const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'high', by: 'agent', sessionName: 'Machines' });
          if (it && it.id) { g.itemId = it.id; g.text = it.text; }
        } catch (e) { log(`[device-upgrade] For-you item not filed for ${g.machine}: ${e.message}`); }
      }
      log(`[device-upgrade] ${g.machine}: no dial-in ${Math.round((now() - g.at) / 1000)} s after its upgrade to ${g.to} began — told the user (For you)`);
    }
    if (changed) { save(); try { bcast(); } catch { } }
    return changed;
  }
  const tick = tickMs > 0 ? setInterval(sweep, tickMs) : null;
  if (tick && tick.unref) tick.unref();
  /** THE door (hosts.onAgentUpgrade): 'stuck' | 'matched' | 'begun' | 'answered'. */
  function onAgentUpgrade(event, facts) { return event === 'stuck' ? stuck(facts) : event === 'matched' ? matched(facts) : event === 'begun' ? begun(facts) : event === 'answered' ? answered(facts) : null; }
  return { stuck, matched, begun, answered, sweep, rowOf, onAgentUpgrade, ledger: () => JSON.parse(JSON.stringify(ledger)), gone: () => JSON.parse(JSON.stringify(gone)), stop: () => { if (tick) clearInterval(tick); }, INBOX_KEY };
}

module.exports = { create, itemOf, goneItemOf, lostOf, INBOX_KEY, RESOLVED_BY, GONE_AFTER_MS };
