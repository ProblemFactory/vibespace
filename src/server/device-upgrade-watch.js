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
 * The ledger is data/device-upgrades.json (the store writer's — written, synced and renamed on its thread, B-574d): it outlives the in-memory upgrade ledger and restarts.
 * A PUSH IS NEWS (lane device-act-audit): `begun` also files the URGENT `upgrade-pushed` item (src/server/device-alerts.js —
 * once per device and from → to; the hub's own daemon never), the third of the three events of design q-042 D10.
 * A REFUSED UPGRADE (lane device-bundle-signing, design q-042 D2): `refused` with the code —
 *   a device refused the bundle (bad-signature / unknown-key / version-mismatch / malformed / unsigned): ONE URGENT For-you
 *           item per (device, version, code) — the machine, from → to, the code, the key, who pushed. The hub never pushes
 *           that bundle again; a later `matched` drops the row but never retracts the item (a refusal stays a fact).
 *   unsigned-local-build — THIS hub will not push (its build is not the signed release): the row's line only, no item.
 *   downgrade (fix r2, verify-r1 RED-1) — the device refused a validly signed release OLDER than one it ran: the same
 *           urgent item in its own words (「有人向 <machine> 推送了旧版本 X」, who pushed).
 * A FIRST TRUST (fix r2, verify-r1 RED-2): `trusted` — a device that trusted NO release key pinned the key set of the first
 *   validly signed release: ONE URGENT item per (device, keys) naming the fingerprints, never retracted; no row change.
 */
const fs = require('fs');
const path = require('path');
const SR = require('../store-read.js');   // B-f276 (lane lg-remote-hardening, 主开发 r4718): device-upgrades.json under the store-read law…
const HOLD = require('../store-read-hold.js');   // …and its hold: a failed read held, never read as a first run
const XS = require('../exit-shell.js');

const INBOX_KEY = 'machines'; // the panel's jump lands on Manage Agents → Machines (src/lib/user-todos-actions.js)
const RESOLVED_BY = 'system';
const i18nKey = (s) => s;
// a healthy device re-dials within seconds of its re-exec (the Linux box: 17 s); 5 min of silence is a dead agent
const GONE_AFTER_MS = 5 * 60 * 1000;
const { verOf } = require('../agentd-signature.js'); // THE version grammar (one copy: the hello's verdict judges by it too)
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

const REFUSAL_CODES = ['bad-signature', 'unknown-key', 'version-mismatch', 'malformed', 'unsigned', 'downgrade'];
const keyOf = (k) => (typeof k === 'string' && /^[0-9a-f]{16}$/.test(k) ? k : null);
/** The refused-upgrade item's words (an URGENT item) — the same shape as itemOf. */
function refusedItemOf({ machine, from, to, code, keyId = null, by = null, floor = null }) {
  const m = nameOf(machine);
  if (code === 'downgrade') {
    const T = i18nKey('{machine}: someone pushed an OLDER agent version ({to}) — refused');
    const D1 = i18nKey('The device agent on {machine} runs {from} and has already run {floor}; it refused {to}, an older release. An older agent lands only as a rollback the release key signed. Nothing was installed; it keeps running {from}.');
    const D2 = i18nKey("The update was pushed by {by}. Replaying an old signed release is how a compromised VibeSpace would bring back a hole a newer release closed — check this VibeSpace's build and its log. A rollback on purpose is signed (sign-agentd --allow-downgrade-to). It will not send that update again.");
    const fillD = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
    const pD = { machine: m, from, to, floor: verOf(floor) || from, by: nameOf(by || 'this VibeSpace (the automatic update at the device\'s hello)') };
    return { text: fillD(T, pD), detail: [fillD(D1, pD), fillD(D2, pD)].join('\n'), i18n: { text: { key: T, params: pD }, detail: [{ key: D1, params: pD }, { key: D2, params: pD }] } };
  }
  const T = i18nKey('{machine} REFUSED an agent update ({from} → {to}): its release signature did not check ({code})');
  const D1 = i18nKey('The device agent on {machine} checked the update this VibeSpace sent ({from} → {to}) against the release keys it trusts and refused it: {code}{key}. Nothing was installed; it keeps running {from}.');
  const D2 = i18nKey("The update was pushed by {by}. A VibeSpace that sends an update without the release signature is misbuilt or compromised — check this VibeSpace's build (release/agentd/manifest.json, its log) before anything else. It will not send that update again.");
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  const p = { machine: m, from, to, code, key: keyId ? ` (key ${keyId})` : '', by: nameOf(by || 'this VibeSpace (the automatic update at the device\'s hello)') };
  return { text: fill(T, p), detail: [fill(D1, p), fill(D2, p)].join('\n'), i18n: { text: { key: T, params: p }, detail: [{ key: D1, params: p }, { key: D2, params: p }] } };
}

/** The first-trust item's words (an URGENT item, fix r2) — the same shape as itemOf. */
function trustedItemOf({ machine, from, to, keyIds = [], by = null }) {
  const m = nameOf(machine);
  const T = i18nKey('{machine} trusted a release key for the first time: {keys}');
  const D1 = i18nKey('The device agent on {machine} trusted no release key (it was installed from a VibeSpace build that carried none), so it trusted the key that signed this update ({from} → {to}): {keys}. From now on it lands only updates signed by that key or its signed successors.');
  const D2 = i18nKey("Pushed by {by}. If {keys} is not your release key (src/agentd/release-keys.js lists it), this machine now runs someone else's code: re-pair it (its install command resets the trust).");
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  const p = { machine: m, from, to, keys: keyIds.map(keyOf).filter(Boolean).join(', '), by: nameOf(by || 'this VibeSpace (the automatic update at the device\'s hello)') };
  return { text: fill(T, p), detail: [fill(D1, p), fill(D2, p)].join('\n'), i18n: { text: { key: T, params: p }, detail: [{ key: D1, params: p }, { key: D2, params: p }] } };
}

function create({ userTodos = null, dataDir, log = () => {}, now = () => Date.now(), bcast = () => {}, tickMs = 30000, goneAfterMs = GONE_AFTER_MS, alerts = null, held = () => false, writer = null } = {}) {
  const file = path.join(dataDir, 'device-upgrades.json');
  let ledger = {}; // hostKey → { machine, from, to, at, lost, itemId, text }
  let gone = {}; // hostKey → { machine, to, at (the upgrade began), pending, filedFor, itemId, text } (lane win-upgrade-pipe)
  // B-f276 THE STORE-READ LAW (主开发 r4718, slice machine-watch-ledgers, lane lg-remote-hardening; login-expiry.json's form): the release
  // read ANY failed read or torn bytes as a first run — the next upgrade event filed its For-you item again, lost the ids of the items it
  // retracts (a stuck, refused or never-came-back item left open for good) and the deadlines it arms, and saved that over the file. Now
  // through store-read's answer to the hold (src/store-read-hold.js, code `device_upgrades_unread`): HELD, every event that reads the
  // ledger files, retracts, arms and drops NOTHING (said once a hold) and nothing is written over the file; LIFTED, the ledger as at a
  // start (the next event of each device judges it); TORN, kept aside once, then empty (a re-filed item of the same words is the SAME
  // item in For you: its add matches by its text)
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function load(j) { ledger = {}; gone = {}; if (j && isObj(j.devices)) ledger = j.devices; if (j && isObj(j.gone)) gone = j.gone; }
  let heldSaid = false;
  const hold = HOLD.create({ file, valid: isObj, code: 'device_upgrades_unread', aside: (m) => file + '.corrupt-' + m,
    words: (h) => `the record of the machines' agent updates could not be read (${h && h.code}) — VibeSpace reads it again by itself every few minutes. Nothing was lost or changed: nothing is written over it, and an update event waits for it`,
    // r4775: the lift BROADCASTS after the owed events — while held every row answered «held» (its «update failed» line off an open
    // machines list); a lift that owes nothing would leave the list so until some later change
    log: (l) => log(`[device-upgrade] ${l}`), onLift: (v) => { load(v); heldSaid = false; heldUntil = now(); replayOwed(); try { bcast(); } catch { } } });
  // B-574d (主开发 r4760, lane lg-remote-hardening; login-expiry.json's form): the record is THE STORE WRITER's (save, below) — a suite's
  // own writer, else the process's. The release wrote an unsynced temp and renamed it ON THE LOOP at every event; the writer makes the
  // bytes at the write (the newest record), writes, syncs and renames on its thread, says a failed write and writes it again; one owed
  // at a stop is written by the hub's exit (the writer's exitFlush). A second watch over this file in ONE process (a suite's restart)
  // reads what the writer still OWES it, never the older file
  const SW = () => writer || require('../store-writer.js').storeWriter();
  const owedNow = () => { try { const w = SW(); return typeof w.owed === 'function' ? w.owed(file) : null; } catch { return null; } };
  { let read; const owedBytes = owedNow(); if (owedBytes != null) read = { text: owedBytes }; else try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: isObj });
    if (hold.start(a) === 'data') load(a.value); }
  /** HELD: an event over an unread ledger changes NOTHING now — said once a hold, nothing filed, retracted, armed or written — and is
   *  OWED: replayed in its order at the lift (a device's hello comes once: a restart is exactly when every device re-dials, inside the
   *  hold's first rung — dropped, a landed update's item would stay open and a re-dialed device be told «stopped answering»). At most
   *  OWED_MAX events are owed; past it the rest are counted and said (each device's next hello says its state again). → true when held */
  const owed = []; let owedDropped = 0; const OWED_MAX = 500;
  const heldNow = (what, replay = null) => {
    const h = hold.held(); if (!h) return false;
    if (replay) { if (owed.length < OWED_MAX) owed.push(replay); else owedDropped++; }
    if (!heldSaid) { heldSaid = true; log(`[device-upgrade] ${what} waits — the record of the machines' agent updates could not be read (${h.code || 'unread'}); nothing filed, retracted or written until it reads, then the events that came meanwhile are judged in their order`); }
    return true;
  };
  function replayOwed() {
    const q = owed.splice(0), lost = owedDropped; owedDropped = 0;
    if (q.length || lost) log(`[device-upgrade] the record reads again — ${q.length} event(s) that came while it could not be read judged now${lost ? `; ${lost} more were not kept (over ${OWED_MAX}): each device's next hello says its state again` : ''}`);
    for (const fn of q) { try { fn(); } catch (e) { log(`[device-upgrade] an owed event failed at the lift: ${e.message}`); } }
  }
  function save() {
    if (!hold.writable('a write of the machines\' agent updates record')) return;   // HELD: never over a file that could not be read
    try { SW().dirty(file, { name: 'device-upgrades.write', mode: 0o600, produce: () => JSON.stringify({ version: 1, devices: ledger, gone }, null, 2) }); }
    catch (e) { log(`[device-upgrade] ledger not written: ${e.message}`); }
  }
  /** the record as memory holds it is on disk — true when written, false when the writer's write failed or passed its bound (it stays
   *  owed); at once when nothing is owed (a suite's next life and its readers wait on it) */
  const whenWritten = () => { try { return Promise.resolve(SW().durable(file)).then((ok) => ok !== false, () => false); } catch { return Promise.resolve(false); } };
  /** Retract OUR item (never one the user already handled, never anyone else's — and never a REFUSAL's: a fact, not a state). */
  const retract = (rec) => {
    if (!rec || !rec.itemId || !userTodos || rec.refused) return;
    try {
      const it = userTodos.get(rec.itemId);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === rec.text) userTodos.setStatus(rec.itemId, 'done', RESOLVED_BY);
    } catch (e) { log(`[device-upgrade] could not clear the For-you item: ${e.message}`); }
  };
  function stuck({ hostKey, machine, from, to, platform = null, capabilities = null } = {}) {
    const f = verOf(from), t = verOf(to), key = String(hostKey || '').slice(0, 160);
    if (!key || !f || !t || f === t) return null;
    if (heldNow('a stuck update', () => stuck(arguments[0]))) return { filed: false, held: true, row: null };
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
    if (heldNow('an update that landed', () => matched(arguments[0]))) return false;
    const key = String(hostKey || '').slice(0, 160), rec = ledger[key];
    if (!rec) return false;
    if (userTodos && userTodos.isHeldUnread?.()) return false;   // B-44f3: For you held unread — «gone» is unread there: keep the record (its retract would be refused — the item would stay open for good); the next report after the read resolves it
    retract(rec); delete ledger[key]; save();
    log(`[device-upgrade] ${rec.machine}: agent reports ${verOf(version) || '?'} — the stuck-upgrade item is resolved`);
    try { bcast(); } catch { }
    return true;
  }
  function rowOf(hostKey) {
    { const h = hold.held(); if (h) return { held: h.code || 'unread' }; }   // B-f276 (r4718): HELD — answered by name, never an empty ledger's «nothing»
    const r = ledger[String(hostKey || '')];
    return r ? { from: r.from, to: r.to, at: r.at, lost: r.lost || null, ...(r.refused ? { refused: r.refused } : {}), ...(r.unsigned ? { unsigned: true } : {}) } : null;
  }
  /** lane device-bundle-signing: the upgrade was REFUSED — by the device (its signature did not check: ONE urgent item per
   *  (device, version, code)) or by this hub (`unsigned-local-build`: the row's line only). */
  function refused({ hostKey, machine, from, to, code, keyId = null, by = null, floor = null } = {}) {
    const f = verOf(from), t = verOf(to), key = String(hostKey || '').slice(0, 160);
    if (!key || !f || !t || f === t) return null;
    if (heldNow('a refused update', () => refused(arguments[0]))) return { filed: false, held: true, row: null };
    const prev = ledger[key];
    if (code === 'unsigned-local-build') {
      if (prev && prev.to === t && prev.unsigned) return { filed: false, row: rowOf(key) };
      if (prev) retract(prev);
      ledger[key] = { machine: nameOf(machine), from: f, to: t, at: now(), lost: null, unsigned: true, itemId: null, text: null }; save();
      log(`[device-upgrade] ${nameOf(machine)}: not upgraded ${f} → ${t} — this hub's agent build is not the signed release`);
      try { bcast(); } catch { }
      return { filed: false, row: rowOf(key) };
    }
    const c = REFUSAL_CODES.includes(code) ? code : 'bad-signature';
    if (prev && prev.to === t && prev.refused === c) return { filed: false, row: rowOf(key) };
    if (prev) retract(prev); // a stuck item for the same device is superseded (a refusal's item never is — retract)
    const rec = { machine: nameOf(machine), from: f, to: t, at: now(), lost: null, refused: c, keyId: keyOf(keyId), by: by ? nameOf(by) : null, ...(verOf(floor) ? { floor: verOf(floor) } : {}), itemId: null, text: null };
    if (userTodos) {
      const w = refusedItemOf({ ...rec, code: c });
      try {
        const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'urgent', by: 'agent', sessionName: 'Machines' });
        if (it && it.id) { rec.itemId = it.id; rec.text = it.text; }
      } catch (e) { log(`[device-upgrade] For-you item not filed for ${rec.machine}: ${e.message}`); }
    }
    ledger[key] = rec; save();
    log(`[device-upgrade] ${rec.machine}: REFUSED the agent update ${f} → ${t} (${c}${rec.keyId ? ', key ' + rec.keyId : ''}) — told the user (For you, urgent)`);
    try { bcast(); } catch { }
    return { filed: !!rec.itemId, row: rowOf(key) };
  }
  /** fix r2 (verify-r1 RED-2): a device that trusted NO release key pinned the first validly signed one — ONE URGENT item
   *  per (device, keys), never retracted (a fact, not a state); the machine row is untouched (the update landed). */
  const trustedSeen = new Set();
  function trusted({ hostKey, machine, from, to, keyIds = [], by = null } = {}) {
    const key = String(hostKey || '').slice(0, 160);
    const ids = (Array.isArray(keyIds) ? keyIds : []).map(keyOf).filter(Boolean).slice(0, 16);
    if (!key || !ids.length) return null;
    const seen = key + '|' + ids.join(',');
    if (trustedSeen.has(seen)) return { filed: false };
    trustedSeen.add(seen);
    let filed = false;
    if (userTodos) {
      const w = trustedItemOf({ machine, from: verOf(from) || '?', to: verOf(to) || '?', keyIds: ids, by });
      try { const it = userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency: 'urgent', by: 'agent', sessionName: 'Machines' }); filed = !!(it && it.id); } catch (e) { log(`[device-upgrade] For-you item not filed for ${nameOf(machine)}: ${e.message}`); }
    }
    log(`[device-upgrade] ${nameOf(machine)}: trusted release key ${ids.join(', ')} on first use (${from} → ${to}) — told the user (For you, urgent)`);
    try { bcast(); } catch { }
    return { filed };
  }
  /** The hub STARTED an upgrade of this device: arm its deadline (re-armed by every attempt). */
  function begun({ hostKey, machine, from = null, to } = {}, { alerted = false } = {}) {
    const key = String(hostKey || '').slice(0, 160), t = verOf(to);
    if (!key || !t) return false;
    // lane device-act-audit (design q-042 D10): a push of new code to a device is an URGENT For-you item, ONCE per (device,
    // from → to) — src/server/device-alerts.js (`upgrade-pushed`); a device's REFUSAL stays this module's own `refused` item
    // (int315: one item per refusal, never a second `upgrade-pushed` with `code: 'bad-signature'` beside it)
    if (!alerted) try { alerts?.file('upgrade-pushed', { hostKey: key, machine, from, to: t, by: 'system:device-upgrade' }); } catch (e) { log(`[device-upgrade] the pushed-update item was not filed: ${e.message}`); }
    // B-f276 (r4718): the push's alert is device-alerts' own store (filed above, at once); only the deadline waits for THIS record —
    // replayed at the lift, its deadline counts from the lift (as the sweep's silence does)
    if (heldNow('an update that began', () => begun(arguments[0], { alerted: true }))) return false;
    gone[key] = { ...(gone[key] || {}), machine: nameOf(machine), to: t, at: now(), pending: true };
    save();
    return true;
  }
  /** The device answered (any hello): no deadline left, and an open never-came-back item resolves itself. */
  function answered({ hostKey } = {}) {
    if (heldNow('a device that answered', () => answered(arguments[0]))) return false;
    const key = String(hostKey || '').slice(0, 160), g = gone[key];
    if (!g) return false;
    const had = !!g.itemId;
    retract(g);
    if (g.filedFor) { g.pending = false; g.itemId = null; g.text = null; } else delete gone[key];
    save();
    if (had) { log(`[device-upgrade] ${g.machine}: dialled in again — the never-came-back item is resolved`); try { bcast(); } catch { } }
    return had;
  }
  let heldUntil = now();   // the B-f276 remainder: the last sweep that met the hold (its silence is not the device's) — and its read r2 (N10): from this
  // process's start (a device cannot dial a hub that is down, nor one restarted meanwhile until it re-dials)
  /** A device silent goneAfterMs after its upgrade began: ONE item per (machine, version). */
  function sweep() {
    // the B-f276 remainder's cure (主开发 23:20Z): while the paired machines cannot be read, a device's dials are answered «wait»
    // (a 503) — its silence is the hub's, not the device's: nothing is judged (no «rerun its install command»), the next sweep after
    // the read judges it
    try { if (held()) { heldUntil = now(); return false; } } catch { }
    if (heldNow('the never-came-back sweep')) { heldUntil = now(); return false; }   // B-f276 (r4718): its OWN record unread — nothing judged until it reads, the silence counted from then
    let changed = false;
    for (const g of Object.values(gone)) {
      // its read S2: the silence is counted from the hold's END — the first sweep after the read races the device's own re-dial
      // (a healthy device told «rerun its install command», and that version's one telling spent)
      if (!g || !g.pending || now() - Math.max(Number(g.at || 0), heldUntil) < goneAfterMs) continue;
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
  /** THE door (hosts.onAgentUpgrade): 'stuck' | 'matched' | 'begun' | 'answered' | 'refused' | 'trusted'. */
  function onAgentUpgrade(event, facts) { return event === 'stuck' ? stuck(facts) : event === 'matched' ? matched(facts) : event === 'begun' ? begun(facts) : event === 'answered' ? answered(facts) : event === 'refused' ? refused(facts) : event === 'trusted' ? trusted(facts) : null; }
  return { stuck, matched, begun, answered, refused, trusted, sweep, rowOf, onAgentUpgrade, ledger: () => JSON.parse(JSON.stringify(ledger)), gone: () => JSON.parse(JSON.stringify(gone)), held: () => hold.held(), heldWords: () => hold.words(), readAgain: () => hold.again(), whenWritten, stop: () => { if (tick) clearInterval(tick); hold.stop(); }, INBOX_KEY };
}

module.exports = { create, itemOf, goneItemOf, refusedItemOf, trustedItemOf, REFUSAL_CODES, lostOf, INBOX_KEY, RESOLVED_BY, GONE_AFTER_MS };
