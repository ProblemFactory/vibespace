'use strict';
// THE PROVIDER STORE (design q-053 r1 §1 + q-045 D10, lane provider-record): data/providers.json = { v: 1, providers: [record…] },
// written whole by THE STORE WRITER (tmp + rename, 0600; durable before a person's act answers). It holds the THIRD-PARTY records only:
// the built-in ones (src/model-providers.js PRESETS — the first-party logins) are code, their rows listed at read time from
// the harness's own catalog (`catalogOf(harness)` = AVAILABLE_MODELS[harness], handed in). No secret lives here: a record's
// key is a VAULT ENTRY it names (`keyRef`), never a value. Every record is normalized + validated on the way in AND on load
// (a hand-edited record that fails is skipped BY NAME in the log, never half-read). ORCH tier; the rules are PURE.
// THE THIRD-PARTY ROAD (lane lg-providers, B-d578 U1): `add` makes a record from a SHIPPED preset and SEALS the pasted key in
// the vault FIRST (a hub secret `provider:<id>` — src/server/vault-engine.js; a locked or absent vault refuses by name and
// nothing is written), then writes the record (keyRef + the last four characters); `rekey` replaces the sealed value,
// `remove` drops the record and then its entry; `keyOf` is the ONE reader of the value (the spawn road and the Test).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MP = require('../model-providers.js');
const SB = require('../secret-box.js');
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // B-f276 family (主开发 r3000 / r3019): providers.json under the store-read law
const PROVIDERS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.providers === undefined || Array.isArray(v.providers));

const STORES = new Map();   // data dir → its store (the Vault window's row names a provider key by its record's label)
const forDir = (dataDir) => STORES.get(path.resolve(String(dataDir || ''))) || null;
/** a vault answer's code → the words the routes speak (`vault_locked` / `vault_not_set_up` by name; anything else is unreadable) */
const vaultCode = (code) => (/vault_locked/.test(String(code || '')) ? 'vault_locked' : /not_set_up/.test(String(code || '')) ? 'vault_not_set_up' : 'key-unreadable');

// THE WRITES (lane lg-providers U1 cure — the coordinator's (C)): every write of data/providers.json goes through THE STORE
// WRITER (src/store-writer.js — its own thread; the main loop never waits on the storage): a change marks the file dirty,
// the writer asks `produce()` for the bytes when it writes. A person's act (add / rekey / patch / remove / the Test's
// verdict) is DURABLE before its answer — `await durable()` — and when the writer answers that the write FAILED, memory is put
// back to what the file holds and the act is refused `write-failed`. Train 1's put / setModels / setListed mark the file and
// return; their callers await `durable()` before they answer.
function create({ dataDir, catalogOf = () => null, log = (m) => console.warn(m), vault = () => SB.vaultForDir(dataDir), now = () => Date.now(), writer = null, onLift = null } = {}) {
  const file = path.join(dataDir, 'providers.json');
  /** a read value's records — each normalized and validated (a record that fails is skipped BY NAME, never half-read) */
  const load = (raw) => {
    const out = [];
    for (const r of Array.isArray(raw && raw.providers) ? raw.providers : []) {
      const p = MP.normalizeProvider(r);
      const errors = MP.presetOf(p.id) ? [{ code: 'built-in-id' }] : MP.validateProvider(r);
      if (errors.length) { log(`[providers] skipped record ${JSON.stringify(String(p.id).slice(0, 80))}: ${errors.map((e) => e.code).join(', ')}`); continue; }
      out.push(p);
    }
    return out;
  };
  // THE STORE-READ LAW (B-f276 family, 主开发 r3000 / r3019 — src/store-read-hold.js). The release read ANY failure of this read as
  // «no third-party provider» and the person's next add wrote ONLY the new record over the file: every other provider's name,
  // address, interface, models, aliases, default and test verdicts gone, their sealed keys left in the vault named by nothing.
  // HELD: the list answers UNREAD (never «none»), every change is refused by name, nothing is written over it, a conversation that
  // names a provider is refused by name (never started on another one, nor on no provider's settings), and it is read again off the
  // loop; a restart while held reads the same file again. Torn bytes are kept aside once per content, then it starts empty — and
  // since a key the torn list named would then read as named by nothing, the ONE remover by this store's silence (the Vault row's
  // Remove of an «orphaned» key) refuses a key a kept copy still names (remove, below).
  let records = [];
  const hold = HOLD.create({
    file, valid: PROVIDERS_SHAPE, code: 'providers_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `providers.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. No model provider is lost: nothing is written over it, a conversation that names a provider waits, and adding or changing a provider is refused until it reads.`,
    log: (m) => log('[providers] ' + m),
    onLift: (v) => { records = load(v); try { onLift?.(); } catch { } },
  });
  let read0; try { read0 = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read0 = { error }; }
  const a0 = SR.storeAnswer(read0, { valid: PROVIDERS_SHAPE });
  if (hold.start(a0) === 'data') records = load(a0.value);
  /** a door's refusal while held → { ok: false, code, error } | null (it reads) */
  const heldNo = (what) => (hold.held() ? { ok: false, code: 'providers_unread', error: hold.refusal(what).message } : null);
  const W = () => writer || require('../store-writer.js').storeWriter();
  function save() { if (!hold.writable('a provider change')) return; W().dirty(file, { name: 'providers.write', produce: () => JSON.stringify({ v: 1, providers: records }), mode: 0o600, rank: 0 }); }   // store-timing's row (src/timed-sync.js); held: nothing written over the file
  /** the file as memory holds it, on disk — true when written, false when the writer's write failed (it stays owed) */
  const durable = async () => { try { return !!(await W().durable(file)); } catch { return false; } };
  // a harness-listed record's rows = that harness's catalog NOW (the built-ins; never stored)
  const filled = (p) => MP.withListed(p, MP.listerOf(p) ? catalogOf(MP.listerOf(p)) : null);
  const get = (id) => { const p = MP.presetOf(id) || records.find((r) => r.id === id); return p ? filled(p) : null; };
  /** seal `key` under the record's entry — { ok } | { ok: false, code: 'vault_locked' | 'vault_not_set_up' | 'key-unreadable' } */
  // (a not-set-up vault is ASKED all the same: its refusal raises the «set up the vault» ask — adversarial read r1)
  const seal = (id, key) => {
    const v = vault();
    if (!v || typeof v.secretPut !== 'function') return { ok: false, code: 'vault_not_set_up' };
    const r = v.secretPut(MP.keyEntryOf(id), String(key).trim());   // the box carries no words: the Vault row names it by its record
    return r && r.ok ? { ok: true } : { ok: false, code: vaultCode(r && r.code) };
  };
  /** the records → the file, DURABLE before the answer. `change` maps the records to the act's state, `undo` maps them
   *  back — ONLY the fields the act changed, and only where the record still holds the act's value (a write that came in
   *  between — Train 1's put / setModels / setListed — keeps its own); the writer's «failed» runs `undo` and marks the file
   *  again, so what it is owed is the state memory holds — never a half-kept change. The person's acts run ONE AT A TIME
   *  (`one`): a re-sealed old key is never another act's. */
  const commit = async (change, undo) => {
    records = change(records);
    save();
    if (await durable()) return { ok: true };
    records = undo(records);
    save();
    return { ok: false, code: 'write-failed' };
  };
  let chain = Promise.resolve();
  // THE KEY'S GENERATION (the chain cure's read, R2): a new key or a new address bumps it; a Test that started on an older one
  // writes no verdict (it tested what is no longer there) — memory only: a restart ends every Test anyway
  const gen = new Map();
  const bump = (id) => gen.set(id, (gen.get(id) || 0) + 1);
  const one = (fn) => { const run = chain.then(fn); chain = run.catch(() => { }); return run; };
  const put1 = (id, to) => (rs) => rs.map((r) => (r.id === id ? to : r));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const undoOf = (id, from, to) => (rs) => rs.map((r) => {
    if (r.id !== id) return r;
    const back = {};
    for (const k of Object.keys(to)) if (!same(from[k], to[k]) && same(r[k], to[k])) back[k] = from[k];
    return Object.keys(back).length ? { ...r, ...back } : r;
  });
  /** after a failed write of an act that SEALED a key: the old key sealed again (none before ⇒ the new one dropped); when the
   *  vault refuses (it locked meanwhile), the record keeps the act's fields — it names the key the vault holds — and is owed */
  const restoreKey = (id, old, redo) => {
    let back = false;
    try { back = old && old.ok ? seal(id, old.value).ok : !!(vault().secretDrop(MP.keyEntryOf(id)) || {}).ok; } catch { back = false; }
    if (back) return;
    records = redo(records);
    save();
    log(`[providers] ${id}: the old key could not be put back — the record keeps the new one (its write is owed)`);
  };
  const thirdParty = (id) => records.find((r) => r.id === id) || null;
  /** the kept copy of a torn providers.json (`providers.json.corrupt-*`, the hold's own aside) that names `id` → its basename | null —
   *  read off the loop, the newest twenty */
  async function keptCopyNaming(id) {
    const dir = path.dirname(file), head = path.basename(file) + '.corrupt-';
    let names = [];
    try { names = (await fs.promises.readdir(dir)).filter((n) => n.startsWith(head)).sort().slice(-20); } catch { return null; }
    for (const n of names.reverse()) { try { if ((await fs.promises.readFile(path.join(dir, n), 'utf8')).includes(JSON.stringify(String(id)))) return n; } catch { } }
    return null;
  }
  const store = {
    file,
    durable,
    /** does the VAULT hold this record's key (its names, no key read — a locked vault answers too) */
    /** the record's key generation (the Test captures it at its start) */
    generationOf: (id) => gen.get(id) || 0,
    /** (B-f276 family) the words a person reads while providers.json is held — null when it reads */
    unread: () => hold.words(),
    /** the hold's facts — {file, code, since} | null */
    held: () => hold.held(),
    /** (the start's read) a refused read or a re-read in flight: no caller may take the empty list for «no provider» */
    readClean: () => !hold.held(),
    hasKey(id) { try { const v = vault(); if (!v) return false; if (typeof v.hasEntry === 'function') return !!v.hasEntry(MP.keyEntryOf(id)); return typeof v.secretNames === 'function' && v.secretNames().some((n) => n.name === MP.keyEntryOf(id)); } catch { return false; } },   // the entry asked by name (no list built per row)
    list: () => [...MP.PRESETS, ...records].map(filled),
    /** the third-party records only (the wizard's roster) */
    thirdParty: () => records.map(filled),
    get,
    /** the provider an account rides (a roster row or an accounts.js record) — null for a harness with no account table */
    forAccount: (a) => { const id = MP.accountProviderId(a); return id ? get(id) : null; },
    /** owner-entered rows count only on a record the store keeps and nobody lists */
    editable: (id) => { const p = records.find((r) => r.id === id); return !!p && p.modelsSource !== 'listed'; },
    /** create / replace a third-party record (Train 2's wizard; the suites) — refused whole, by code, on any error */
    put(raw) {
      const h = heldNo('saving a model provider'); if (h) return h;
      const p = MP.normalizeProvider({ ...raw, id: raw && raw.id ? raw.id : `pv-${crypto.randomBytes(6).toString('hex')}` });
      const errors = MP.presetOf(p.id) ? [{ field: 'id', code: 'built-in-id' }] : MP.validateProvider({ ...raw, id: p.id });
      if (errors.length) return { ok: false, code: 'invalid', errors };
      records = [...records.filter((r) => r.id !== p.id), p];
      save();
      return { ok: true, provider: filled(p) };
    },
    /** THE ACCOUNT DIALOG'S SAVE: the configured rows (+ aliases, default) — a listed record refuses (its lister owns the
     *  rows); zero rows ⇒ the record says `none` (never an empty `configured`) */
    setModels(id, input) {
      const h = heldNo('saving a provider\'s models'); if (h) return h;
      const p = records.find((r) => r.id === id);
      if (!p) return { ok: false, code: MP.presetOf(id) ? 'listed' : 'unknown' };
      if (p.modelsSource === 'listed') return { ok: false, code: 'listed' };
      const v = MP.validateModels(p.kind, input);
      if (!v.ok) return { ok: false, code: 'invalid', errors: v.errors };
      const next = { ...p, models: v.value.models, aliases: v.value.aliases, defaultModel: v.value.defaultModel, modelsSource: v.value.models.length ? 'configured' : 'none', listedBy: null };
      records = records.map((r) => (r.id === id ? next : r));
      save();
      return { ok: true, provider: next };
    },
    /** THE LISTED-PROVIDER REFRESH's write (lane models-at-session, src/server/provider-models.js): the rows the provider's
     *  own /models answered + when — only on a record its provider lists. An alias whose row left the list is dropped (and
     *  named), a default that left it is cleared; the record is validated whole, like put, before the file is written. */
    setListed(id, rows, at) {
      const h = heldNo('saving a provider\'s listed models'); if (h) return h;
      const p = records.find((r) => r.id === id);
      if (!p) return { ok: false, code: MP.presetOf(id) ? 'not-listed' : 'unknown' };
      if (!(p.modelsSource === 'listed' && p.listedBy === 'provider-api')) return { ok: false, code: 'not-listed' };
      const list = Array.isArray(rows) ? rows : [];
      const lands = (to) => list.some((m) => m && m.id === to);
      const dropped = Object.keys(p.aliases || {}).filter((a) => !lands(p.aliases[a]));
      const aliases = Object.fromEntries(Object.entries(p.aliases || {}).filter(([, to]) => lands(to)));
      const raw = { ...p, models: list, aliases, defaultModel: lands(p.defaultModel) ? p.defaultModel : '', fetchedAt: at };
      const errors = MP.validateProvider(raw);
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const next = MP.normalizeProvider(raw);
      records = records.map((r) => (r.id === id ? next : r));
      save();
      return { ok: true, provider: next, droppedAliases: dropped };
    },
    /** THE WIZARD'S ADD: a shipped preset + the person's choices ({ preset, region?, baseUrl?, label?, model? }) + the pasted
     *  key → the key sealed in the vault FIRST, then the record written. Refused whole, by field, before anything is kept:
     *  an unknown preset, a bad key (an Anthropic subscription login by name), a preset that needs an address and has none,
     *  any record error; a locked / absent vault ⇒ its code, nothing written. */
    add(input = {}) { return one(async () => {
      const h = heldNo('adding a model provider'); if (h) return h;
      const i = input && typeof input === 'object' ? input : {};
      const shipped = MP.shippedOf(i.preset);
      if (!shipped) return { ok: false, code: 'invalid', errors: [{ field: 'preset', code: 'preset-unknown' }] };
      const errors = [...MP.validateKey(i.key)];
      const draft = MP.draftOf(shipped.id, { region: i.region, baseUrl: i.baseUrl, label: i.label, model: i.model, wire: i.wire });
      if (shipped.baseRequired && !draft.baseUrl) errors.push({ field: 'baseUrl', code: 'base-url' });
      // a preset's address is VibeSpace's, at the add as at the patch (the region picks among its own)
      if (!shipped.baseRequired && typeof i.baseUrl === 'string' && i.baseUrl.trim()) errors.push({ field: 'baseUrl', code: 'base-url-fixed' });
      const id = `pv-${crypto.randomBytes(6).toString('hex')}`;
      const raw = { ...draft, id, keyRef: MP.keyRefOf(id), tail: MP.tailOf(i.key), createdAt: now() };
      errors.push(...MP.validateProvider(raw));
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const sealed = seal(id, i.key);
      if (!sealed.ok) return sealed;
      const p = MP.normalizeProvider(raw);
      const w = await commit((rs) => [...rs, p], (rs) => rs.filter((r) => r.id !== id));
      if (!w.ok) { try { vault().secretDrop(MP.keyEntryOf(id)); } catch { } return w; }
      return { ok: true, provider: filled(p) };
    }); },
    /** a new key for a kept record (the roster's 换钥匙): sealed over the old one, the tail rewritten */
    rekey(id, key) { return one(async () => {
      const h = heldNo('a new key for a model provider'); if (h) return h;
      const p = thirdParty(id);
      if (!p) return { ok: false, code: MP.presetOf(id) ? 'built-in' : 'unknown' };
      const errors = MP.validateKey(key);
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const old = store.keyOf(id);   // put back if the record's write fails (the tail must name the key the vault holds)
      const sealed = seal(id, key);
      if (!sealed.ok) return sealed;
      bump(id);
      const next = { ...p, keyRef: MP.keyRefOf(id), tail: MP.tailOf(key), tested: {}, lastTestAt: null };   // a new key was never tested (the chain cure: the wizard never says «Works» for it)
      const w = await commit(put1(id, next), undoOf(id, p, next));
      if (!w.ok) { bump(id); restoreKey(id, old, undoOf(id, next, p)); return w; }   // the old key back: a Test pressed meanwhile tested the new one (the delta read, D3)
      return { ok: true, provider: filled(next) };
    }); },
    /** the roster's rename / the default model / a SELF-HOSTED one's address or interface — validated whole like put.
     *  A new address sends the sealed key somewhere new: it is taken only WITH the key pasted again (`key` — the person
     *  shows they hold it, as an add does), and only where the preset lets the person name an address (adversarial read r1). */
    patch(id, change = {}) { return one(async () => {
      const h = heldNo('changing a model provider'); if (h) return h;
      const p = thirdParty(id);
      if (!p) return { ok: false, code: MP.presetOf(id) ? 'built-in' : 'unknown' };
      const c = change && typeof change === 'object' ? change : {};
      const shipped = MP.shippedOf(p.preset);
      const moves = (typeof c.baseUrl === 'string' && (c.baseUrl.trim() || null) !== p.baseUrl) || (typeof c.wire === 'string' && c.wire !== p.wire);
      const errors = [];
      if (moves && !(shipped && shipped.baseRequired)) errors.push({ field: typeof c.baseUrl === 'string' ? 'baseUrl' : 'wire', code: 'base-url-fixed' });
      if (moves && shipped && shipped.baseRequired) errors.push(...MP.validateKey(c.key));
      const raw = { ...p, ...(typeof c.label === 'string' ? { label: c.label } : {}), ...(typeof c.baseUrl === 'string' ? { baseUrl: c.baseUrl.trim() || null } : {}), ...(typeof c.defaultModel === 'string' ? { defaultModel: c.defaultModel } : {}), ...(typeof c.wire === 'string' ? { wire: c.wire } : {}) };
      errors.push(...MP.validateProvider(raw));
      if (shipped && shipped.baseRequired && !raw.baseUrl) errors.push({ field: 'baseUrl', code: 'base-url' });
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const next = MP.normalizeProvider(moves ? { ...raw, tail: MP.tailOf(c.key), tested: {}, lastTestAt: null } : raw);   // a new address (and its key) was never tested
      const old = moves ? store.keyOf(id) : null;
      if (moves) { const sealed = seal(id, c.key); if (!sealed.ok) return sealed; bump(id); }
      const w = await commit(put1(id, next), undoOf(id, p, next));
      if (!w.ok) { if (moves) { bump(id); restoreKey(id, old, undoOf(id, next, p)); } return w; }
      return { ok: true, provider: filled(next) };
    }); },
    /** the record, then its sealed key (a locked vault forgets too — secretDrop needs no key) */
    remove(id) { return one(async () => {
      const h = heldNo('removing a model provider'); if (h) return h;   // held: no record is known — never «an orphaned key»
      const p = thirdParty(id);
      if (MP.presetOf(id)) return { ok: false, code: 'built-in' };
      const v0 = vault();
      // an ORPHANED key (its record gone: a crash between the seal and the write, a record skipped at load) — the Vault row's
      // Remove is this door, so it must still drop the entry (adversarial read r1)
      if (!p) {
        // THE REMOVER BY THIS STORE's SILENCE (r3019): torn bytes start the list empty — a key the torn list named reads as named by
        // nothing. A key a kept copy of the torn list still names is never removed as an orphan: refused by name, the copy named
        const kept = await keptCopyNaming(id);
        if (kept) { log(`[providers] ${id}: not removed — its key is named in ${kept}, the copy of a torn providers.json kept aside`); return { ok: false, code: 'providers_torn_named', copy: kept, error: "A damaged copy of the provider list that VibeSpace kept aside still names this key's provider — nothing was removed. Restore that copy in VibeSpace's data folder, or remove it there, first." }; }
        let had = false;
        try { had = !!v0 && typeof v0.secretNames === 'function' && v0.secretNames().some((n) => n.name === MP.keyEntryOf(id)); } catch { had = false; }
        if (!had) return { ok: false, code: 'unknown' };
        let d = null;
        try { d = v0.secretDrop(MP.keyEntryOf(id)); } catch { d = null; }
        return d && d.ok ? { ok: true, id, keyDropped: true, orphan: true } : { ok: false, code: 'key-unreadable' };
      }
      const at = records.indexOf(p);
      const w = await commit((rs) => rs.filter((r) => r !== p), (rs) => (rs.some((r) => r.id === id) ? rs : [...rs.slice(0, at), p, ...rs.slice(at)]));
      if (!w.ok) return w;
      gen.delete(id);   // its key generation goes with it (the chain cure's read: the map never grows past the live records)
      let keyDropped = true;
      try { const v = vault(); if (v && v.state() !== 'not_set_up') keyDropped = !!(v.secretDrop(MP.keyEntryOf(id)) || {}).ok; } catch { keyDropped = false; }
      if (!keyDropped) log(`[providers] ${id}: its vault entry could not be dropped — the record is gone all the same`);
      return { ok: true, id, keyDropped };
    }); },
    /** THE TEST'S RESULT (lane lg-providers U4, src/server/provider-test.js): the verdict per harness + lastTestAt */
    noteTested(id, harness, verdict, at, generation = null) { return one(async () => {
      const h = heldNo('a provider test\'s verdict'); if (h) return h;
      const p = thirdParty(id);
      if (!p) return { ok: false, code: 'unknown' };
      if (generation !== null && generation !== (gen.get(id) || 0)) return { ok: false, code: 'changed' };   // a new key / address since the Test began
      const next = MP.normalizeProvider({ ...p, lastTestAt: at, tested: { ...(p.tested || {}), [harness]: { verdict, at } } });
      const w = await commit(put1(id, next), undoOf(id, p, next));
      return w.ok ? { ok: true, provider: filled(next) } : w;
    }); },
    /** THE ONE READER of a provider's key value (the spawn road, the Test, the listed-model refresh) → { ok, value } |
     *  { ok: false, code: 'unknown' | 'no-key' | 'vault_locked' | 'vault_not_set_up' | 'key-unreadable' }. The value is
     *  the caller's to use once; it is never logged, answered or written. */
    keyOf(id) {
      const p = thirdParty(id);
      if (!p) return { ok: false, code: 'unknown' };
      if (MP.providerOfKeyRef(p.keyRef) !== id) return { ok: false, code: 'no-key' };
      const v = vault();
      if (!v || typeof v.secretGet !== 'function' || v.state() === 'not_set_up') return { ok: false, code: 'vault_not_set_up' };
      const g = v.secretGet(MP.keyEntryOf(id));
      if (!g || !g.ok) return { ok: false, code: vaultCode(g && g.code) };
      if (!g.value) return { ok: false, code: 'no-key' };
      let value;
      try { value = g.value.toString('utf8'); } finally { g.value.fill(0); }
      return { ok: true, value };
    },
  };
  STORES.set(path.resolve(dataDir), store);
  return store;
}

module.exports = { create, forDir };
