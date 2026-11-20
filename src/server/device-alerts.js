'use strict';
/**
 * THE THREE EVENTS THAT WOULD HAVE SHOWN THE 2026-10-19 INCIDENT REACH THE OWNER (lane device-act-audit, design q-042 D10).
 *
 * What a stolen hub does to the paired machines starts with one of three things, and before this lane none of them said a
 * word anywhere but a journal line: a pairing command was MINTED (whoever runs it joins a machine to this hub), a device
 * DIALED IN FROM AN ADDRESS it never used (the token is somewhere else now), and the hub PUSHED NEW CODE to a device (a
 * hub that ships code owns the machine — src/agentd/client.js `_upgrade`). Each is ONE For-you item, urgent (a signed forward upgrade: a notice, decision 8 below):
 *   pairing-minted  {hostKey, machine, deviceId, by, from, generation} — who minted it (`by`: the owner's sign-in handle,
 *                   or `system:graduate`) and from which browser address; the one minter is src/server/dial-pairing.js
 *   new-address     {hostKey, machine, address, addressKey} — hosts.noteDial's known set (src/hosts.js `knownFrom`, keyed
 *                   by src/device-acts.js addressKeyOf: IPv4, an IPv6 /64); a relay / ingress (loopback) is never news
 *   upgrade-pushed  {hostKey, machine, from, to, by, code} — device-upgrade-watch's `begun` (every transport's door);
 *                   `code: 'bad-signature'` (lane device-bundle-signing) = the SAME kind, the refusal's words — that lane
 *                   only sets the code. This machine's own daemon (`local`) is the hub itself: never an item.
 * DECISION 8 (design q-044, lane foryou-folds): an upgrade whose signature PASSED (`code` empty) to a NEWER version is a
 * NOTICE (kind notice, normal — the grey count; a fleet roll of 18 machines filed 18 urgent rows) — a bad signature, a
 * DOWNGRADE (`to` older than `from`) or a version we cannot compare stays URGENT (`upgradeIsNotice`).
 * FILED ONCE PER EVENT: a dedup key per event (the pairing's generation, the address, from → to + code) in a bounded ledger
 * (data/device-alerts.json, atomic tmp + rename) — a hub restart, a retried upgrade, a re-dial never file it again.
 * RESOLVED BY THE OWNER'S CLICK: never retracted by the system (an urgent item that heals itself is one nobody read).
 * The words are STRUCTURE beside the English (`i18n` — the client words them in the device's language).
 */
const fs = require('fs');
const path = require('path');
const SR = require('../store-read.js'); // the store-read law: a ledger that cannot be read is HELD, never read as «first run»
const DA = require('../device-acts.js');

const INBOX_KEY = 'machines'; // the tray's jump lands on Manage Agents → Machines (the card's 「活动…」 is one click away)
const LEDGER_MAX = 500;
const KINDS = Object.freeze(['pairing-minted', 'new-address', 'upgrade-pushed']);
const i18nKey = (s) => s;
const nameOf = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 80) || 'a machine';
const verOf = (v) => (typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(v) ? v : '?');
const addrOf = (a) => String(a == null ? '' : a).replace(/[^0-9A-Za-z.:%\[\]-]/g, '').slice(0, 64) || '?';
const whoOf = (by) => (DA.validBy(by) ? by : 'nobody named');
const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));

/** Decision 8: a pushed upgrade is a NOTICE only when its signature passed (no `code`) and it goes FORWARD — every
 *  dotted number of `to` compared with `from`; a downgrade, an equal or an unreadable version stays urgent. */
const verParts = (v) => (/^\d+(\.\d+)*$/.test(String(v)) ? String(v).split('.').map(Number) : null);
function upgradeIsNotice(f = {}) {
  if (f.code) return false;
  const a = verParts(f.from), b = verParts(f.to);
  if (!a || !b) return false;
  for (let k = 0; k < Math.max(a.length, b.length); k++) { const x = a[k] || 0, y = b[k] || 0; if (y !== x) return y > x; }
  return false;
}

/** The item's words for one event → {key, text, detail, i18n, notice?} | null (an event that is not news). */
function itemOf(kind, f = {}) {
  const machine = nameOf(f.machine);
  if (kind === 'pairing-minted') {
    const p = { machine, by: whoOf(f.by), from: addrOf(f.from || 'this server'), generation: Number(f.generation) || 1 };
    const T = i18nKey('New pairing command for {machine} — made by {by} from {from}');
    const D1 = i18nKey('A pairing command for {machine} was made (pairing {generation}) by {by}, from the browser address {from}. Whoever runs it connects that machine to this VibeSpace.');
    const D2 = i18nKey("If you did not make it: Remote → {machine} → Pairing command → Generate a new command (it retires this one), then read the machine card's Activity….");
    return { key: `pair:${String(f.deviceId || f.hostKey || '').slice(0, 64)}:${p.generation}`, ...words(T, [D1, D2], p) };
  }
  if (kind === 'new-address') {
    const p = { machine, address: addrOf(f.address) };
    const T = i18nKey('{machine} connected from a new address: {address}');
    const D1 = i18nKey('{machine} connected to this VibeSpace from {address} — an address it has not connected from before.');
    const D2 = i18nKey("If that is not where the machine is: Remote → {machine} → Pairing command → Generate a new command, then read the machine card's Activity….");
    return { key: `addr:${String(f.hostKey || '').slice(0, 64)}:${String(f.addressKey || f.address || '').slice(0, 64)}`, ...words(T, [D1, D2], p) };
  }
  if (kind === 'upgrade-pushed') {
    if (String(f.hostKey || '') === 'local') return null; // the hub's own daemon: the hub itself
    const p = { machine, from: verOf(f.from), to: verOf(f.to), by: whoOf(f.by || 'system:device-upgrade') };
    const bad = f.code === 'bad-signature';
    const T = bad ? i18nKey('{machine} refused an agent update with a bad signature ({from} → {to})') : i18nKey('Agent update pushed to {machine}: {from} → {to}');
    const D1 = bad
      ? i18nKey('This VibeSpace sent {machine} a device agent ({from} → {to}, asked by {by}) that is not signed by the release key; the machine refused it and keeps running {from}.')
      : i18nKey('This VibeSpace sent {machine} a new device agent ({from} → {to}), asked by {by}; the machine runs it as soon as it lands.');
    const D2 = bad
      ? i18nKey("Someone may control this hub: read the machine card's Activity…, and rotate this hub's secrets before anything else.")
      : i18nKey("Expected after this VibeSpace was updated. An update you did not expect means someone else may control this hub — read the machine card's Activity….");
    return { key: `upg:${String(f.hostKey || '').slice(0, 64)}:${p.from}:${p.to}:${bad ? 'bad-signature' : 'ok'}`, ...words(T, [D1, D2], p), ...(upgradeIsNotice({ ...f, from: p.from, to: p.to }) ? { notice: true } : {}) };
  }
  return null;
}
function words(T, lines, p) {
  return { text: fill(T, p), detail: lines.map((l) => fill(l, p)).join('\n'), i18n: { text: { key: T, params: p }, detail: lines.map((l) => ({ key: l, params: p })) } };
}

// THE LEDGER OFF THE LOOP (lane lg-store-writes, 主开发 2026-11-20 03:10Z — its temp + rename held the owner's hub once in the
// first hour of 2.369.412): the bytes go to the store writer by name (made at the write; mode 0600). THE HOLD (the store-read law):
// the release read ANY failure as «first run» — an EMPTY ledger the next filing wrote over the file it could not read (every alert
// it had told would be told again). A read that failed, or bytes that are not the ledger, HOLD: the file is never written over (the
// save and its producer refuse), the alerts are STILL FILED (a security event is never kept from the person — deduped in memory
// meanwhile), read again off the loop; at the lift the file's keys and the ones filed meanwhile are merged and written. The ledger
// has no other reader; the hub's stop lands it with every store (the writer's exit flush). A crash between a filing and the
// ledger's landing files that alert once more at the next event — told twice, never missed.
const LEDGER_VALID = (j) => !!j && typeof j === 'object' && !Array.isArray(j) && !!j.seen && typeof j.seen === 'object' && !Array.isArray(j.seen);
function create({ userTodos = null, dataDir = null, log = () => {}, now = () => Date.now(), writer = null, unreadRetry = null } = {}) {
  const ledgerFile = dataDir ? path.join(dataDir, 'device-alerts.json') : null;
  let seen = {}; // dedup key → at (filed)
  let held = null, heldSaveSaid = false, heldT = null, heldTries = 0, heldP = null;
  const W = () => writer || require('../store-writer.js').storeWriter();
  function holdLedger(a) {
    held = { code: a.code, why: a.why };
    log(`[device-alerts] device-alerts.json could not be read (${a.code}: ${a.why}) — held: nothing is written over it, alerts are still filed, it is read again off the main loop`);
    retrySoon();
  }
  function retrySoon() {
    if (heldT || !held) return;
    const t = heldT = setTimeout(() => { heldT = null; readAgain().catch((e) => { log(`[device-alerts] the ledger's read again failed: ${(e && e.message) || e}`); retrySoon(); }); }, SR.retryDelay(++heldTries, unreadRetry || undefined));
    t.unref?.();
  }
  /** ONE read again of a held ledger, off the loop → lifted: the file's keys and the ones filed meanwhile, merged, written */
  async function readAgain() {
    if (!held || heldP) return;
    retrySoon();
    const p = heldP = fs.promises.readFile(ledgerFile, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
    const read = await p; heldP = null;
    if (!held) return;
    const a = SR.storeAnswer(read, { valid: LEDGER_VALID });
    if (a.state !== 'data') { held.code = a.state === 'missing' ? 'ENOENT' : a.code; return; }   // a file GONE since the hold stays held
    held = null; heldSaveSaid = false;
    if (heldT) { clearTimeout(heldT); heldT = null; }
    seen = { ...a.value.seen, ...seen };
    log(`[device-alerts] device-alerts.json read again: ${Object.keys(seen).length} key(s) — the hold is lifted`);
    save();
  }
  if (ledgerFile) {
    let read; try { read = { text: fs.readFileSync(ledgerFile, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: LEDGER_VALID });
    if (a.state === 'data') seen = a.value.seen;
    else if (a.state !== 'missing') holdLedger(a);   // a missing file is the first run; anything else HOLDS
  }
  const produce = () => { if (held) throw Object.assign(new Error('device-alerts.json is held (its read failed) — nothing is written over it until it reads'), { code: 'EHELD' }); return JSON.stringify({ version: 1, seen }, null, 2); };
  const save = () => {
    if (!ledgerFile) return;
    if (held) { if (!heldSaveSaid) { heldSaveSaid = true; log('[device-alerts] the ledger\'s write was refused: device-alerts.json could not be read, and nothing is written over it until it reads'); } return; }
    const keys = Object.keys(seen);
    if (keys.length > LEDGER_MAX) for (const k of keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - LEDGER_MAX)) delete seen[k];
    try { W().dirty(ledgerFile, { name: 'device-alerts.write', mode: 0o600, produce, onWritten: (ok, e) => { if (!ok) log(`[device-alerts] ledger not written: ${(e && (e.code || e.message)) || 'an error'} — kept in memory, the store writer retries`); } }); }
    catch (e) { log(`[device-alerts] ledger not written: ${e.message}`); }
  };
  /** File ONE item for an event (once per its key) — urgent, or a notice for a signed forward upgrade. → {filed, key, id} | null */
  function file(kind, facts = {}) {
    if (!KINDS.includes(kind)) return null;
    const w = itemOf(kind, facts);
    if (!w) return null;
    if (seen[w.key]) return { filed: false, key: w.key, again: true };
    seen[w.key] = now();
    let id = null;
    if (userTodos) {
      try {
        const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: w.notice ? 'normal' : 'urgent', ...(w.notice ? { kind: 'notice' } : {}), by: 'agent', sessionName: 'Machines' });
        id = it && it.id ? it.id : null;
      } catch (e) { log(`[device-alerts] ${kind} not filed: ${e.message}`); }
    }
    save();
    log(`[device-alerts] ${kind}: ${w.text} — told the owner (For you, ${w.notice ? 'a notice' : 'urgent'})`);
    return { filed: !!id, key: w.key, id };
  }
  return { file, seen: () => ({ ...seen }), held: () => !!held, INBOX_KEY };
}

module.exports = { create, itemOf, upgradeIsNotice, KINDS, INBOX_KEY };
