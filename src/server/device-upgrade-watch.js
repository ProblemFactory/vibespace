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
 * The ledger is data/device-upgrades.json (atomic tmp+rename): it outlives the in-memory upgrade ledger and restarts.
 */
const fs = require('fs');
const path = require('path');
const XS = require('../exit-shell.js');

const INBOX_KEY = 'machines'; // the panel's jump lands on Manage Agents → Machines (src/lib/user-todos-actions.js)
const RESOLVED_BY = 'system';
const i18nKey = (s) => s;
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

function create({ userTodos = null, dataDir, log = () => {}, now = () => Date.now(), bcast = () => {} } = {}) {
  const file = path.join(dataDir, 'device-upgrades.json');
  let ledger = {}; // hostKey → { machine, from, to, at, lost, itemId, text }
  try { const j = JSON.parse(fs.readFileSync(file, 'utf-8')); if (j && j.devices && typeof j.devices === 'object') ledger = j.devices; } catch { /* first run */ }
  const save = () => {
    try { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ version: 1, devices: ledger }, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); }
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
  /** THE door (hosts.onAgentUpgrade): 'stuck' | 'matched'. */
  function onAgentUpgrade(event, facts) { return event === 'stuck' ? stuck(facts) : event === 'matched' ? matched(facts) : null; }
  return { stuck, matched, rowOf, onAgentUpgrade, ledger: () => JSON.parse(JSON.stringify(ledger)), INBOX_KEY };
}

module.exports = { create, itemOf, lostOf, INBOX_KEY, RESOLVED_BY };
