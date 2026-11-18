'use strict';
/**
 * B-5ce7 — THE MOUNTS' FOR-YOU ITEMS (ORCH): a parked mount with its door, a killed hung daemon, stranded files moved aside.
 * A PARKED MOUNT IS SAID, WITH ITS DOOR. The verdict that parks is src/mount-liveness.js's (`park` — a wedge:
 * the listing hung sweeps in a row while the provider answered each time); the state is src/mounts.js's persisted
 * `m.parked`. The owner's OneDrive (10-23/24) was torn down, reconnected two minutes later and wedged again within 10–30
 * minutes, three times a night, 20+ hub stalls between — a reconnect cannot cure a wedge, so nothing automatic reconnects a
 * parked mount. The person learns it HERE: ONE For-you item per parked mount (origin `server` — «This machine», beside the
 * mount-health notices), naming the mount, the cause and the count, with its door — action `mount-reconnect` (the For-you
 * window's Reconnect: POST /api/mounts/:id/reconnect, declared by its src/foryou-actions.js row). The item resolves itself
 * when the park ends — a Reconnect, any connect by the person, an Unmount, the record removed (src/mounts.js _unpark).
 */
const i18nKey = (s) => s;   // a DECLARED human-visible string (scripts/i18n-extract.mjs): zh + ja beside the mount-health entries
const ITEM_KEY = 'mounts';
const TYPE = 'mount-reconnect';
const TEXT = i18nKey('Storage {name} is kept disconnected: its listing hung {n} times in a row while {provider} answered');
// no provider label known: a WHOLE sentence of its own (translated as one) — never a protocol value or an English filler in a zh / ja one
const TEXT_NOPROV = i18nKey('Storage {name} is kept disconnected: its listing hung {n} times in a row while its provider answered');
const DETAIL = i18nKey('A reconnect usually hangs it again, so VibeSpace does not reconnect it by itself. Anything written into its folder meanwhile stays on this machine and is moved aside at the next connect. Press Reconnect when it should be tried again.');
// the merged B-f230 (the mount's STARTING state too): what the person must KNOW, said once and kept until it is over —
//   KILLED: the mount's own process stopped answering and was stopped to keep VibeSpace responsive (it reconnects by itself;
//           the notice resolves itself at the mount's next answer, a park, an Unmount, the record removed);
//   STRANDED: files written into the bare mount point while the storage was down were moved aside (never deleted) — the
//           person's to look at; dismissed by the person.
const KILLED = i18nKey('Storage {name} stopped answering and was disconnected to keep VibeSpace responsive — it reconnects by itself');
const STRANDED = i18nKey('Files written into {path} while storage {name} was disconnected were moved to {dest} — nothing was deleted');

/** The item's words (PURE): {text, detail, i18n} — the record's own name, the provider's label, the strikes. */
function itemOf(m, info = {}) {
  const provider = String(info.provider || '');
  const key = provider ? TEXT : TEXT_NOPROV;
  const params = { name: String((m && (m.name || m.id)) || ''), n: String(Number(info.strikes) || 2), ...(provider ? { provider } : {}) };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => params[k]);
  return { text: fill(key), detail: DETAIL, i18n: { text: { key, params }, detail: [{ key: DETAIL }] } };
}

function create({ getUserTodos, mountCount = () => 0, log = () => { } }) {
  const todos = () => { try { return getUserTodos(); } catch { return null; } };
  // the key's open cap SIZED BY ITS DOMAIN (the cure): up to three open items per mount (a park, a stopped process, stranded
  // files) — the store's default 20 refused a park item as 'full' past about seven mounts
  const cap = () => { let n = 0; try { n = Number(mountCount()) || 0; } catch { } return Math.max(20, 3 * n); };
  const openOf = (t, id) => (t.forSession([ITEM_KEY]) || []).filter((i) => i && i.action && i.action.type === TYPE && i.action.mountId === id);
  /** File (or re-file: the registry's identity `mountId` merges a repeat) the parked item. */
  function park(m, info) {
    const t = todos();
    if (!t || !m) return null;
    const it = itemOf(m, info);
    // ONE item per mount: the store merges by text unless an itemKey is given (adversarial r1 #18) — a re-park with another
    // strike count or a renamed mount updates the same item
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'high', by: 'agent', sessionName: 'Storage', text: it.text, detail: it.detail, i18n: it.i18n, action: { type: TYPE, mountId: m.id }, itemKey: `park:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** Resolve every open parked item of the record (its park ended). → how many. */
  function unpark(m, why) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    for (const i of openOf(t, m.id)) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch (e) { log(`[mounts] ${m.id}: the parked item ${i.id} was not resolved: ${e.message}`); } }
    return n;
  }
  const fill = (key, params) => key.replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
  /** The mount's own process was stopped because it stopped answering (the 'dead' teardown) — merged by its text. */
  function killed(m, info = {}) {
    const t = todos();
    if (!t || !m) return null;
    const params = { name: String(m.name || m.id) };
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Storage', text: fill(KILLED, params), i18n: { text: { key: KILLED, params } }, facts: { mountId: m.id, why: 'killed' }, itemKey: `killed:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** The mount answers again (or its supervision ended): its killed notice resolves itself. → how many. */
  function answered(m) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    for (const i of (t.forSession([ITEM_KEY]) || []).filter((x) => x && x.facts && x.facts.mountId === m.id && x.facts.why === 'killed')) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch { } }
    return n;
  }
  /** Stranded files moved aside before a mount (src/mounts.js _ensureMountpointDir's quarantine) — the person's to look at. */
  function stranded(m, info = {}) {
    const t = todos();
    if (!t || !m || !info.dest) return null;
    // ONE stranded notice per mount (adversarial r1 #15: each names a new folder, and the key's open items are capped): its
    // itemKey keeps one item, naming the latest folder; the earlier folders stay named in the journal lines of their quarantine
    const params = { path: String(info.path || ''), name: String(m.name || m.id), dest: String(info.dest) };
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Storage', text: fill(STRANDED, params), i18n: { text: { key: STRANDED, params } }, facts: { mountId: m.id, why: 'stranded' }, itemKey: `stranded:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** The record is REMOVED: every open item of it resolves (its park, a stopped process, stranded files). → how many. */
  function removed(m) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    for (const i of (t.forSession([ITEM_KEY]) || []).filter((x) => x && ((x.facts && x.facts.mountId === m.id) || (x.action && x.action.mountId === m.id)))) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch { } }
    return n;
  }
  return { park, unpark, killed, answered, stranded, removed };
}

module.exports = { create, itemOf, ITEM_KEY, TYPE, TEXT, TEXT_NOPROV, DETAIL, KILLED, STRANDED };
