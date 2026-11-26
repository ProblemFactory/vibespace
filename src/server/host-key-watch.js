'use strict';
/**
 * A MACHINE WHOSE SSH HOST KEY CHANGED IS SAID (lane lg-remote-hardening, B-7f0b — design q-042 D6/D10: «指纹变 ⇒ 拒 +
 * For-you 紧急»). ssh refuses a key it will not trust — the record's pin (src/host-keys.js) or, unpinned, the key the hub
 * user's own known_hosts holds — and the hub's road names it `host-key-changed` (hosts.onHostKeyRefused). This module is
 * its consequence: ONE urgent For-you item per (machine, fingerprint shown) — the For-you items themselves are the ledger
 * (a restart reads them: never a second item for the same episode). The item carries `action` {type: 'host-key', hostId, kind}:
 * the machine by its record's id (a rename never strands it: a pin, an unpin or a removal finds it by the id), and a DECLARED door (src/foryou-actions.js `opens`) — pressing
 * it opens THAT machine's Host key… dialog (主开发's verdict of 2026-11-18: Manage Agents → Machines has no key control). The
 * item is retracted (`system`) when the person pins again or removes the pin, removes the machine, or an import drops it
 * (hosts.onHostKeyPinned(h, kind)) — the episode is then theirs, decided.
 * Kind `device` (lane lg-remote-hardening, D3): a machine's AGENT did not prove the device key its record pins (another key,
 * none) — the same item with kind 'device' in its action and its own words (pair again / forget the key), resolved by a new
 * pairing or a forget.
 */

const INBOX_KEY = 'machines'; // the Machines group of For you (its key alone would land on Manage Agents — the action opens the dialog)
const RESOLVED_BY = 'system';
const i18nKey = (s) => s;
const DF = require('../dial-facts.js'); // pairingDoorOf: the door a machine's row draws (PURE)
const nameOf = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 80) || 'a machine';

/** The item's words — English text + the same sentences as STRUCTURE (the client words them per device). `kind` 'device'
 *  (lane lg-remote-hardening, D3) = the machine's AGENT answered with another device key (or none) than its record pins. */
function itemOf({ machine, fp, pinned, kind = 'ssh', code = null, door = 'pairing', jump = null, pinLine = null }) {
  const p = { machine: nameOf(machine), fp: String(fp || '').slice(0, 80) || '?', ...(jump ? { jump: String(jump).slice(0, 120) } : {}) };
  // unit 3's cure: the doors named are the ones the machine's ROW draws (dial-facts pairingDoorOf — the row reads it too):
  // `dial` = the row draws «Pairing command…»; `dials` = the machine dials in with a pairing token (that row, or an ssh row
  // upgraded to dial-out)
  const dial = door === 'pairing', dials = door !== 'none';
  if (kind === 'device' && /^hub[-_]/.test(String(code || ''))) {
    // D3 half b: the MACHINE refused THIS hub's key (or this hub lost its own) — the mirror of a device key refused
    const TH = i18nKey('{machine}: it refused this hub\'s key — VibeSpace did not connect');
    const DH1 = code === 'hub_identity_lost'
      ? i18nKey('{machine} pins this hub\'s key, and this hub lost it. Make a new hub key (Remote → {machine} → Host key…), then pair every machine again.')
      : code === 'hub_identity_unavailable' ? i18nKey('{machine} pins this hub\'s key, and this hub could not read it to prove it. Its link is refused until it can; it is read again when this machine next greets the hub (at most every five minutes). Check that VibeSpace can read its own key file (its owner, its permissions, the storage it is on).') // the third read: no door on the row (the hub's own key)
      : dial ? i18nKey('{machine} pins the key of the hub it was paired with, and this hub did not prove it. Something may be posing as this hub to it, or it was paired with another hub. If you paired it with this hub, pair it again (Remote → {machine} → Pairing command…).')
        : code !== 'hub-key-mismatch' && dials ? i18nKey('{machine} refused this hub\'s proof of its key. Make a new pairing: Remote → {machine} → Dial-out → Remove dial-out, then Upgrade to dial-out.') // the third read: «Let it pin» is drawn for a mismatch only
        : i18nKey("{machine} pins the key of the hub it was set up with, and this hub did not prove it. Something may be posing as this hub to it, or it was set up from another hub. If you set it up from this hub, let it pin this hub's key again (Remote → {machine} → Host key… → Let it pin this hub's key)."); // unit 5's cure: an ssh machine's door is on ITS road
    const fillH = (x) => x.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
    return { text: fillH(TH), detail: fillH(DH1), i18n: { text: { key: TH, params: p }, detail: [{ key: DH1, params: p }] } };
  }
  if (kind === 'device') {
    const TD = i18nKey('{machine}: its agent did not prove the device key VibeSpace pinned — VibeSpace did not connect');
    const DD1 = code === 'device-key-shape'
      ? i18nKey('{machine} answered with no usable device key and signature.')
      : code === 'device-key-missing'
      ? (dials
        ? i18nKey('{machine} answered without proving its device key. Its key file (state/identity.pem in its agent\'s folder) may be empty or unreadable, its agent may be older than the key, or something may be dialing in with its pairing token.')
        : i18nKey('{machine} answered without proving its device key. Its key file (state/identity.pem in its agent\'s folder) may be empty or unreadable, or its agent may be older than the key.'))
      : (dials
        ? i18nKey('{machine} answered with the device key {fp}, not the key VibeSpace pinned at its first connection. Something may be dialing in with its pairing token, or the machine was reinstalled.')
        : i18nKey('{machine} answered with the device key {fp}, not the key VibeSpace pinned at its first connection. Its agent was reinstalled, or something else answers for it on its ssh road.'));
    const DD2 = dial
      ? i18nKey('If you did not reinstall it, make a new pairing command (Remote → {machine} → Pairing command…): it stops whoever holds the old one. If you reinstalled it yourself, forget its key (Remote → {machine} → Host key…): the next agent that proves a key is pinned, and VibeSpace tells you which. Until then this hub\'s link to its agent is refused.')
      : dials
      ? i18nKey('If you did not reinstall it, make it dial out again (Remote → {machine} → Dial-out → Remove dial-out, then Upgrade to dial-out): that makes a new pairing and stops whoever holds the old one. If you reinstalled it yourself, forget its key (Remote → {machine} → Host key…): the next agent that proves a key is pinned, and VibeSpace tells you which. Until then its dial-out link is refused; its ssh road still works.')
      : i18nKey('If you reinstalled its agent yourself, forget its key (Remote → {machine} → Host key…): the next agent that proves a key is pinned, and VibeSpace tells you which. Until then this hub\'s link to its agent is refused.');
    // the record ASKS for a proof (its key was forgotten) and none came: «Let in without a key» lets in an agent that cannot prove one
    const DD3 = code === 'device-key-missing' && !pinned ? i18nKey('If its agent cannot prove a key (an empty or unreadable key file, an agent older than the key), let it in without one: Remote → {machine} → Host key… → Let in without a key.') : null;
    const ds = [DD1, DD2, DD3].filter(Boolean);
    const fillD = (x) => x.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
    return { text: fillD(TD), detail: ds.map(fillD).join('\n'), i18n: { text: { key: TD, params: p }, detail: ds.map((key) => ({ key, params: p })) } };
  }
  // r3431 (B-7f0b's remainder): the key ssh refused was the machine's JUMP HOST's — its own words, the same door (the machine's row)
  if (jump) {
    // r3688: a pin file with no line for the hop (removed or emptied by hand) is said as that, never as a changed key
    const TJ = pinLine === 'none' ? i18nKey('{machine}: its jump host\'s ssh host key could not be checked — VibeSpace did not connect') : i18nKey('{machine}: its jump host\'s ssh host key changed — VibeSpace did not connect');
    const DJ1 = pinLine === 'none' ? i18nKey('{machine}\'s jump host {jump}: the file that holds the key pinned for it has no line for it, so ssh had no key to check. A start of VibeSpace writes it again from the record.') : pinned
      ? i18nKey('{machine}\'s jump host {jump} showed the key {fp}, which is not the key pinned for it. Someone may be between this VibeSpace and the jump host, or the jump host was reinstalled.')
      : i18nKey('{machine}\'s jump host {jump} showed the key {fp}, which is not the key this VibeSpace saw before. Someone may be between this VibeSpace and the jump host, or the jump host was reinstalled.');
    const DJ2 = i18nKey('Compare the key on the jump host itself (its command is under Technical details). If it matches, pin it in Remote → {machine} → Host key…; until then nothing connects to the machine.');
    const fillJ = (x) => x.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
    return { text: fillJ(TJ), detail: [DJ1, DJ2].map(fillJ).join('\n'), i18n: { text: { key: TJ, params: p }, detail: [DJ1, DJ2].map((key) => ({ key, params: p })), fold: [{ key: i18nKey('On the jump host: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub') }] } };
  }
  const T = pinLine === 'none' ? i18nKey('{machine}: its ssh host key could not be checked — VibeSpace did not connect') : i18nKey('{machine}: its ssh host key changed — VibeSpace did not connect');
  const D1 = pinLine === 'none' ? i18nKey('{machine}: the file that holds the key pinned for it has no line for it, so ssh had no key to check. A start of VibeSpace writes it again from the record.') : pinned
    ? i18nKey('{machine} showed the key {fp}, which is not the key pinned for it. Someone may be between this VibeSpace and the machine, or the machine was reinstalled.')
    : i18nKey('{machine} showed the key {fp}, which is not the key this VibeSpace saw before. Someone may be between this VibeSpace and the machine, or the machine was reinstalled.');
  const D2 = i18nKey('Compare the key on the machine itself (its command is under Technical details). If it matches, pin it in Remote → {machine} → Host key…; until then nothing connects to it.');
  const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
  const ds = [D1, D2];
  return { text: fill(T), detail: ds.map(fill).join('\n'), i18n: { text: { key: T, params: p }, detail: ds.map((key) => ({ key, params: p })), fold: [{ key: i18nKey('On the machine: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub') }] } };
}

function create({ userTodos = null, hosts = null, log = () => {}, bcast = () => {} } = {}) {
  // the For-you items ARE the ledger (no file of this module's own — a store write on the main thread is a debt the tree
  // ratchets down): an episode = an OPEN item of ours (its words' key says the kind) for this machine (its action names the
  // record's id) and the key it showed
  const ours = (hostId, kind) => {
    if (!userTodos || !userTodos._state || !Array.isArray(userTodos._state.items)) return [];
    // r3688's cure: the JUMP HOST's items (r3431) and a missing pin line's are ssh items of that machine too — said once, decided together
    const T = kind === 'device' ? /^\{machine\}: (?:its agent did not prove|it refused this hub)/ : /^\{machine\}: its (?:jump host's )?ssh host key (?:changed|could not be checked)/;
    return userTodos._state.items.filter((it) => it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.action && it.action.hostId === String(hostId) && it.i18n && it.i18n.text && T.test(String(it.i18n.text.key || '')));
  };
  // the notice that the open pin took a key: a refusal or a proof never takes it (it is the only word naming that key); a
  // removal, a new pairing or a Forget does, and a new notice replaces the old one
  const notices = (hostId) => (!userTodos || !userTodos._state || !Array.isArray(userTodos._state.items)) ? [] : userTodos._state.items.filter((it) => it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.action && it.action.hostId === String(hostId) && it.i18n && it.i18n.text && /^\{machine\}: VibeSpace pinned its new device key/.test(String(it.i18n.text.key || '')));
  const retract = (it) => { try { userTodos.setStatus(it.id, 'done', RESOLVED_BY); } catch (e) { log(`[host-key] could not clear the For-you item: ${e.message}`); } };
  /** ssh refused the key a machine showed (`err` = the road's host-key-changed refusal). → true when an item was filed. */
  function refused(h, err) {
    if (!h || !h.id || !userTodos) return false;
    if (err && err.code === 'host-key-name') return false; // a pin that cannot be used is said on its row (by name), never as a changed key
    const fp = (err && err.fp) || null;
    const kind = err && err.kind === 'device' ? 'device' : 'ssh';
    const machine = nameOf(h.name);
    const w = itemOf({ machine, fp, pinned: !!(err && err.pinned), kind, code: (err && err.code) || null, door: DF.pairingDoorOf(h), jump: (kind === 'ssh' && err && err.jump) || null, pinLine: (kind === 'ssh' && err && err.pinLine) || null }); // the door the row draws
    const open = ours(h.id, kind);
    if (open.some((it) => it.text === w.text && it.detail === w.detail)) return false; // the same episode: said once (a restart reads the same items)
    for (const it of open) retract(it); // another key / another refusal: the old item goes, ONE new one says this one
    if (!file(h, w, 'urgent', kind)) return false;
    log(kind === 'device' ? `[host-key] ${machine}: its agent did not prove the pinned device key (${fp || 'no key shown'}) — told the user (For you, urgent)` : `[host-key] ${machine}: ssh refused the host key it showed (${fp || 'no fingerprint said'}) — told the user (For you, urgent)`);
    try { bcast(); } catch { }
    return true;
  }
  // ONE filing door for both items (the For-you census counts a producer's add sites)
  function file(h, w, urgency, kind) {
    try { userTodos.add(INBOX_KEY, { origin: 'machines', text: w.text, detail: w.detail, i18n: w.i18n, urgency, by: 'agent', sessionName: 'Machines', action: { type: 'host-key', hostId: String(h.id), kind } }); return true; }
    catch (e) { const machine = nameOf(h.name); log(`[host-key] For-you item not filed for ${machine}: ${e.message}`); return false; }
  }
  /** unit 3's cure: the person forgot a machine's device key and the next agent's proof was pinned — WHICH key is told (a
   *  notice, not urgent: the person opened that pin themselves). A refusal or a proof does not take it. */
  function learned(h, facts = {}) {
    if (!h || !h.id || !userTodos) return false;
    const machine = nameOf(h.name);
    const w = learnedItemOf({ machine, fp: facts.fp, door: DF.pairingDoorOf(h) });
    const older = notices(h.id);
    if (!file(h, w, 'normal', 'device')) return false;
    for (const it of older) retract(it); // ONE notice per machine: the newest key (filed first, so a failed filing loses none)
    log(`[host-key] ${machine}: the device key ${facts.fp || '?'} was pinned after the person forgot the old one — told the user (For you)`);
    try { bcast(); } catch { }
    return true;
  }
  /** The person pinned again / removed the pin / re-paired / removed the machine (or an import dropped it): the episode is
   *  decided — our items of that kind go. */
  function decided(h, kind = 'ssh', { notice = false, part = null } = {}) {
    if (!h || !h.id || !userTodos) return false;
    const name = nameOf(h.name);
    // r3873 (4): a pin of ONE of a machine's two keys (part 'machine' | 'hop') decides that key's item only — the other stays while it is
    // refused; a both pin, an unpin, a removal or a new pairing (no part) decides every item of the kind
    const isHopItem = (it) => /^\{machine\}: its jump host's /.test(String((it.i18n && it.i18n.text && it.i18n.text.key) || ''));
    const items = ours(h.id, kind).filter((it) => kind !== 'ssh' || (part !== 'machine' && part !== 'hop') || (part === 'hop') === isHopItem(it)).concat(kind === 'device' && notice ? notices(h.id) : []); // the notice: only a removal, a new pairing or a Forget
    for (const it of items) retract(it);
    if (items.length) log(`[host-key] ${name}: decided by the person — the For-you item is resolved`);
    return items.length > 0;
  }
  if (hosts) {
    hosts.onHostKeyRefused = (h, err) => refused(h, err); hosts.onHostKeyPinned = (h, kind, o) => decided(h, kind, o); // the kind passes through (a removal resolves both)
    hosts.onDeviceKeyLearned = (h, f) => learned(h, f); // unit 3's cure
    // the reader's note 11: a machine removed takes its item with it — hosts.remove() says it (onHostKeyPinned) while it still has the name
  }
  return { refused, decided, learned, itemOf };
}

/** unit 3's cure: the notice that the open pin took a key (after the person forgot the old one) — its words name the key */
function learnedItemOf({ machine, fp, door = 'pairing' }) {
  const p = { machine: nameOf(machine), fp: String(fp || '').slice(0, 80) || '?' };
  const T = i18nKey('{machine}: VibeSpace pinned its new device key {fp}');
  const D = door === 'pairing'
    ? i18nKey('You forgot its old key, and the first agent that answered after that proved this one, so it is pinned now. If that was your reinstall, nothing is left to do; if not, make a new pairing command (Remote → {machine} → Pairing command…), which stops whoever holds the old one, and forget its key again.')
    : door === 'dial-out'
    ? i18nKey('You forgot its old key, and the first agent that answered after that proved this one, so it is pinned now. If that was your reinstall, nothing is left to do; if not, make it dial out again (Remote → {machine} → Dial-out → Remove dial-out, then Upgrade to dial-out), which stops whoever holds the old pairing, and forget its key again.')
    : i18nKey('You forgot its old key, and the first agent that answered after that proved this one, so it is pinned now. If that was your reinstall, nothing is left to do; if not, forget its key again (Remote → {machine} → Host key…): something that reaches its agent over ssh proved this key.');
  const fill = (x) => x.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
  return { text: fill(T), detail: fill(D), i18n: { text: { key: T, params: p }, detail: [{ key: D, params: p }] } };
}

module.exports = { create, itemOf, learnedItemOf, INBOX_KEY };
