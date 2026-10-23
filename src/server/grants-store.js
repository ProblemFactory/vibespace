'use strict';
/**
 * THE GRANTS STORE — ORCH (lane grants-unify, 2026-10-23; the model is PURE src/grant-model.js). ONE file holds every
 * grant the owner gives agents — data/grants.json `{v, rows:[{door, resource, to, except, at, by}], syncVersion}` —
 * and ONE writer changes it (`set` / `remove`). Every door (browser profiles, automation keys, channels, machines'
 * exits, desktop windows, Task Group visibility) READS its rows here (`rowsFor`) and judges them with the model's
 * `admits`; none keeps a who-list of its own any more (their old fields stay on disk for one release, unread — the
 * migration `2026-10-grants-unify` carried them over).
 *
 *  · ATOMIC + SAID: a write lands on disk (tmp + rename, mode 0600) BEFORE `set` answers; a write that fails changes
 *    nothing in memory and is refused BY NAME (`not_written`) — the route says so to the person. `flush()` exists for
 *    the shutdown belt (server.js calls every StateSync store's flush on SIGINT / SIGTERM); nothing is ever pending.
 *  · LIVE: every change is mirrored into the server-owned `grants` StateSync store (key = door + NUL + resource, value
 *    = the public row) so every open client redraws at once (the multi-client law); a client's state-set into it is
 *    refused (`clientWrites:false`); its version persists here so a client never sees a rollback.
 *  · AUDITED: one line per write to data/grants-audit.jsonl — who, when, which row, the principals added / removed in
 *    `to` and in `except` (principal keys: ids, never a value — a grant holds none). Rotated at 4 MiB (one `.1`).
 *  · FAIL CLOSED: an unreadable grants.json (not missing — unparsable / unreadable) makes every `rowsFor` answer ONE
 *    row the model refuses BY NAME (`unknown_shape`) — never «nothing is granted, so nothing changes» silently and
 *    never «everyone»; every write is refused `store_unreadable` (a file we could not read is never overwritten).
 *  · THE READ API (stable — the permissions window and New Session's right column build on it):
 *      rowsFor(door, resource)       → [row]   — the rows of ONE resource (0 or 1 today; a list so a door may grow)
 *      rowsOfDoor(door)              → [row]   — every row of a door (a door that judges across resources: channels)
 *      rowsForPrincipal(facts)       → [{door, resource, ok, via, code, entry}] — every row that ADMITS the principal
 *                                      or EXCEPTS it («what may conversation X reach»; `facts` = admits' facts)
 *      whoMayUse(door, resource)     → {to, except} — «who may use resource Y» (the public row's two lists)
 *    `onChange(fn)` → fn({door, resource, row, was, by}) after each landed write (a door's live re-judge hook).
 */
const fs = require('fs');
const path = require('path');
const GM = require('../grant-model.js');
const { SyncStore } = require('../sync-store.js');

const AUDIT_ROTATE_BYTES = 4 * 1024 * 1024;
const STORE_REFUSALS = Object.freeze(['not_written', 'store_unreadable']);

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The server-owned mirror: no file of its own (the store persists), refuses client writes, flushes its owner. */
class GrantsSync extends SyncStore {
  constructor(wss, owner) { super('grants', null, wss, { clientWrites: false }); this.owner = owner; }
  flush() { this.owner.flush(); }
}

const keyOf = (door, resource) => GM.rowKey(door, resource);
const keysOf = (list) => (Array.isArray(list) ? list.map(GM.principalKey).filter(Boolean) : []);
const diff = (was, now) => ({ added: now.filter((k) => !was.includes(k)), removed: was.filter((k) => !now.includes(k)) });

function create({ dataDir, wss = { clients: new Set() }, now = () => Date.now(), log = () => { }, memory = false } = {}) {
  if (!dataDir && !memory) throw new Error('grants-store: dataDir is required (or memory: true — a store that keeps nothing on disk)');
  const file = memory ? null : path.join(dataDir, 'grants.json');
  const auditFile = memory ? null : path.join(dataDir, 'grants-audit.jsonl');
  const rows = new Map();          // door\0resource → the normalized row
  const bad = [];                  // rows on disk this release cannot read (kept, reported, never matched)
  let syncVersion = 0, unreadable = null;
  if (file) try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows)) throw new Error('not a grants document');
    syncVersion = Number(raw.syncVersion) || 0;
    for (const r of raw.rows) {
      const n = GM.normRow(r);
      if (n.ok) rows.set(keyOf(n.row.door, n.row.resource), n.row);
      else if (r && typeof r === 'object' && GM.DOORS.includes(r.door) && typeof r.resource === 'string') rows.set(keyOf(r.door, r.resource), r);   // judged as it is: admits refuses it by name
      else bad.push(r);
    }
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) { unreadable = `${path.basename(file)} could not be read (${e && e.code ? e.code : 'unparsable'}: ${e && e.message})`; log(`[grants] ${unreadable} — every grant is refused by name until it is repaired`); }
  }
  const api = {};
  const sync = new GrantsSync(wss, api);
  sync.version = syncVersion;
  for (const [k, r] of rows) sync.data[k] = GM.publicRow(r);
  const listeners = new Set();

  const docOf = (version) => ({ v: 1, rows: [...rows.values(), ...bad], syncVersion: version });
  const audit = (line) => {
    if (!auditFile) return;
    try {
      try { if (fs.statSync(auditFile).size > AUDIT_ROTATE_BYTES) fs.renameSync(auditFile, `${auditFile}.1`); } catch { }
      fs.appendFileSync(auditFile, JSON.stringify(line) + '\n', { mode: 0o600 });
    } catch (e) { log(`[grants] audit line not written: ${e && e.message}`); }
  };
  const copy = (r) => JSON.parse(JSON.stringify(r));
  const UNREADABLE_ROW = (door, resource) => ({ door, resource, to: null, unreadable: true });

  /** The rows of ONE resource. */
  api.rowsFor = (door, resource) => {
    if (unreadable) return [UNREADABLE_ROW(door, String(resource))];
    const r = rows.get(keyOf(door, String(resource)));
    return r ? [copy(r)] : [];
  };
  /** Every row of a door. */
  api.rowsOfDoor = (door) => {
    if (unreadable) return [UNREADABLE_ROW(door, '*')];
    const out = [];
    for (const r of rows.values()) if (r.door === door) out.push(copy(r));
    return out;
  };
  /** Every row that admits or excepts this principal — `facts` as `admits` takes them. */
  api.rowsForPrincipal = (facts = {}) => {
    const out = [];
    for (const r of rows.values()) {
      const v = GM.admits([r], facts);
      if (v.ok) out.push({ door: r.door, resource: r.resource, ok: true, via: v.via, entry: v.entry });
      else if (v.code === 'excepted' || v.code === 'groups_unreadable' || v.code === 'unknown_shape') out.push({ door: r.door, resource: r.resource, ok: false, code: v.code, ...(v.entry ? { entry: v.entry } : {}) });
    }
    return out;
  };
  /** «Who may use resource Y»: the row's two lists (empty when there is no row). */
  api.whoMayUse = (door, resource) => {
    const [r] = api.rowsFor(door, resource);
    if (!r) return { to: [], except: [] };
    const p = GM.publicRow(r);
    return p.unknown ? { unknown: true, why: p.why, to: [], except: [] } : { to: p.to, except: p.except };
  };
  api.health = () => ({ readable: !unreadable, why: unreadable, rows: rows.size, bad: bad.length, memory: !file });

  /** ONE landed write of one or more row changes `[{k, next, line}]`: memory, then the file (all or nothing — a failed
   *  write restores memory), then the mirror, the audit lines and the listeners. */
  function land(changes) {
    const was = changes.map((c) => rows.get(c.k));
    changes.forEach((c) => { if (c.next) rows.set(c.k, c.next); else rows.delete(c.k); });
    // the version the file records is the one the last broadcast below carries (SyncStore.set / delete bump it by one)
    try { if (file) writeJsonAtomic(file, docOf(sync.version + changes.length)); }
    catch (e) {
      changes.forEach((c, i) => { if (was[i]) rows.set(c.k, was[i]); else rows.delete(c.k); });
      return { ok: false, code: 'not_written', error: `the grant could not be saved (${e && e.code ? e.code : 'write failed'}) — nothing changed; try again` };
    }
    changes.forEach((c, i) => {
      if (c.next) sync.set(c.k, GM.publicRow(c.next)); else if (c.k in sync.data) sync.delete(c.k); else sync.version++;
      audit(c.line);
      for (const fn of listeners) { try { fn({ door: c.line.door, resource: c.line.resource, row: c.next ? copy(c.next) : null, was: was[i] ? copy(was[i]) : null, by: c.line.by }); } catch (e) { log(`[grants] a change listener threw: ${e && e.message}`); } }
    });
    return { ok: true };
  }
  /** The change one `{door, resource, to, except}` asks for → `{ok:true, change|null (nothing to do), row, was}` | a refusal. */
  function plan(door, resource, { to = [], except = [] } = {}, by, at) {
    const v = GM.validateWrite(door, resource, { to, except }, { at, by });
    if (!v.ok) return v;
    const k = keyOf(door, v.row.resource);
    const was = rows.get(k) || null;
    const removing = !v.row.to.length && !v.row.except.length;
    if (removing ? !was : (was && JSON.stringify({ to: was.to, except: was.except }) === JSON.stringify({ to: v.row.to, except: v.row.except }))) return { ok: true, change: null, row: was, was };
    const d = { to: diff(keysOf(was && was.to), removing ? [] : keysOf(v.row.to)), except: diff(keysOf(was && was.except), removing ? [] : keysOf(v.row.except)) };
    return { ok: true, row: removing ? null : v.row, was, change: { k, next: removing ? null : v.row, line: { at, by, op: removing ? 'remove' : 'set', door, resource: v.row.resource, to: d.to, except: d.except } } };
  }

  /**
   * THE ONE WRITER: the row of (door, resource) becomes `{to, except}`. An empty `to` with no `except` REMOVES the row
   * (no row = nobody — the same answer, one shape on disk). `by` = who wrote it ('user' — a cookie route — or
   * 'migration', or an agent's conversation key for a door an agent may write, e.g. a window it opened itself).
   * → `{ok:true, row, changed, was}` | `{ok:false, code, error}`.
   */
  api.set = (door, resource, lists = {}, by = 'user') => {
    if (unreadable) return { ok: false, code: 'store_unreadable', error: `${unreadable} — repair or move it aside first; nothing was written` };
    const p = plan(door, resource, lists, String(by || 'user'), now());
    if (!p.ok) return p;
    if (!p.change) return { ok: true, row: p.row ? copy(p.row) : null, changed: false, was: p.was ? copy(p.was) : null };
    const r = land([p.change]);
    if (!r.ok) return r;
    return { ok: true, row: p.row ? copy(p.row) : null, changed: true, was: p.was ? copy(p.was) : null };
  };
  /** Several rows in ONE landed write (all or nothing — a machine's two lists, a channel grain's access + watch): each
   *  `{door, resource, to, except}`. → `{ok:true, changed:[{door, resource}]}` | the first refusal (nothing written). */
  api.setMany = (list, by = 'user') => {
    if (unreadable) return { ok: false, code: 'store_unreadable', error: `${unreadable} — repair or move it aside first; nothing was written` };
    const at = now(), changes = [], seen = new Set();
    for (const it of Array.isArray(list) ? list : []) {
      const p = plan(it && it.door, it && it.resource, it || {}, String(by || 'user'), at);
      if (!p.ok) return { ...p, door: it && it.door, resource: it && it.resource };
      if (!p.change) continue;
      if (seen.has(p.change.k)) return { ok: false, code: 'bad_row', error: `${it.door} ${String(it.resource).slice(0, 80)} is written twice in one change` };
      seen.add(p.change.k); changes.push(p.change);
    }
    if (!changes.length) return { ok: true, changed: [] };
    const r = land(changes);
    if (!r.ok) return r;
    return { ok: true, changed: changes.map((c) => ({ door: c.line.door, resource: c.line.resource })) };
  };
  /** Remove the row of (door, resource) — nobody. → `{ok:true, changed, was}` | a refusal. */
  api.remove = (door, resource, by = 'user') => {
    if (unreadable) return { ok: false, code: 'store_unreadable', error: `${unreadable} — repair or move it aside first; nothing was written` };
    if (!GM.DOORS.includes(door)) return { ok: false, code: 'unknown_door', error: `no door "${String(door).slice(0, 40)}"` };
    const p = plan(door, resource, { to: [], except: [] }, String(by || 'user'), now());
    if (!p.ok) return p;
    if (!p.change) return { ok: true, changed: false, was: null };
    const r = land([p.change]);
    if (!r.ok) return r;
    return { ok: true, changed: true, was: p.was ? copy(p.was) : null };
  };
  /** Rows the MIGRATION carries over: only resources that hold no row yet (a row the owner already wrote wins). */
  api.seed = (list, by = 'migration') => {
    const all = Array.isArray(list) ? list : [];
    const fresh = all.filter((r) => r && !rows.has(keyOf(r.door, String(r.resource))));
    const w = api.setMany(fresh.map((r) => ({ door: r.door, resource: r.resource, to: r.to || [], except: r.except || [] })), by);
    if (!w.ok) throw new Error(`${w.door || ''} ${String(w.resource || '').slice(0, 80)}: ${w.error}`.trim());
    return { added: w.changed.length, kept: all.length - fresh.length };
  };
  /** Is data/grants.json on disk? (The boot's rollback check — verify F2: a store deleted after the migration ran.) */
  api.onDisk = () => !!file && fs.existsSync(file);
  /** The migration's first run leaves a store on disk even when it carried nothing (a fresh instance), so a LATER boot that
   *  finds none knows it was deleted — never silence. Writes the empty document only when no file is there and the
   *  store is readable; never a row, never an audit line. → whether it wrote. */
  api.ensureFile = () => {
    if (!file || unreadable || api.onDisk()) return false;
    try { writeJsonAtomic(file, docOf(sync.version)); return true; } catch (e) { log(`[grants] ${path.basename(file)} not created: ${e && e.message}`); return false; }
  };
  api.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  api.flush = () => { /* every write lands before `set` answers — nothing is ever pending */ };
  api.sync = sync;
  api.dataDir = dataDir ? path.resolve(dataDir) : null;
  api.file = file;
  api.auditFile = auditFile;
  return api;
}

// THE INSTANCE'S STORE — installed once at boot (server.js, before any door is built) and read by the doors that are not
// handed it (the keeper singleton pattern). Nothing installed (a suite that builds one door alone) ⇒ ONE in-memory store for
// the process: grants a door writes there are judged by the same model, nothing reaches a disk, and a grant written
// before nothing was installed is never read from anywhere else (a narrowing, never a widening). A suite that needs a file
// or isolation constructs its own with `create` and passes it in.
let current = null;
function install(s) { current = s; return s; }
function store() { return current || (current = create({ memory: true })); }
/** The store of a door that knows its data dir but was handed no store: the installed one when it holds that dir (the
 *  instance: every door's dir is data/), else ONE file-backed store per dir for the process (a suite's scratch world —
 *  never two writers on one file). No dir ⇒ `store()`. */
const byDir = new Map();
function forDir(dataDir) {
  if (!dataDir) return store();
  const d = path.resolve(dataDir);
  if (current && current.dataDir === d) return current;
  if (!byDir.has(d)) byDir.set(d, create({ dataDir: d }));
  return byDir.get(d);
}

module.exports = { create, install, store, forDir, STORE_REFUSALS, AUDIT_ROTATE_BYTES };
