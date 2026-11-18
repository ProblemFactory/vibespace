'use strict';
// THE PROVIDER STORE (design q-053 r1 §1 + q-045 D10, lane provider-record): data/providers.json = { v: 1, providers: [record…] },
// written whole through writeJsonAtomic (tmp + rename, 0600) BEFORE a route answers. It holds the THIRD-PARTY records only:
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
const { writeJsonAtomic } = require('../channel-store.js');
const SB = require('../secret-box.js');

const STORES = new Map();   // data dir → its store (the Vault window's row names a provider key by its record's label)
const forDir = (dataDir) => STORES.get(path.resolve(String(dataDir || ''))) || null;
/** a vault answer's code → the words the routes speak (`vault_locked` / `vault_not_set_up` by name; anything else is unreadable) */
const vaultCode = (code) => (/vault_locked/.test(String(code || '')) ? 'vault_locked' : /not_set_up/.test(String(code || '')) ? 'vault_not_set_up' : 'key-unreadable');

function create({ dataDir, catalogOf = () => null, log = (m) => console.warn(m), vault = () => SB.vaultForDir(dataDir), now = () => Date.now() } = {}) {
  const file = path.join(dataDir, 'providers.json');
  let records = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const r of Array.isArray(raw && raw.providers) ? raw.providers : []) {
      const p = MP.normalizeProvider(r);
      const errors = MP.presetOf(p.id) ? [{ code: 'built-in-id' }] : MP.validateProvider(r);
      if (errors.length) { log(`[providers] skipped record ${JSON.stringify(String(p.id).slice(0, 80))}: ${errors.map((e) => e.code).join(', ')}`); continue; }
      records.push(p);
    }
  } catch (e) { if (e && e.code !== 'ENOENT') log(`[providers] ${file} unreadable (${e.code || e.message}) — no third-party providers`); }
  const save = () => writeJsonAtomic(file, { v: 1, providers: records }, { mode: 0o600 });
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
  /** the records → the file; a failed write puts memory back and says so (never a half-kept change) */
  const commit = (next) => {
    const was = records;
    records = next;
    try { save(); return { ok: true }; } catch (e) { records = was; return { ok: false, code: 'write-failed', error: e.message }; }
  };
  const thirdParty = (id) => records.find((r) => r.id === id) || null;
  const store = {
    file,
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
    add(input = {}) {
      const i = input && typeof input === 'object' ? input : {};
      const shipped = MP.shippedOf(i.preset);
      if (!shipped) return { ok: false, code: 'invalid', errors: [{ field: 'preset', code: 'preset-unknown' }] };
      const errors = [...MP.validateKey(i.key)];
      const draft = MP.draftOf(shipped.id, { region: i.region, baseUrl: i.baseUrl, label: i.label, model: i.model, wire: i.wire });
      if (shipped.baseRequired && !draft.baseUrl) errors.push({ field: 'baseUrl', code: 'base-url' });
      const id = `pv-${crypto.randomBytes(6).toString('hex')}`;
      const raw = { ...draft, id, keyRef: MP.keyRefOf(id), tail: MP.tailOf(i.key), createdAt: now() };
      errors.push(...MP.validateProvider(raw));
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const sealed = seal(id, i.key);
      if (!sealed.ok) return sealed;
      const p = MP.normalizeProvider(raw);
      const w = commit([...records, p]);
      if (!w.ok) { try { vault().secretDrop(MP.keyEntryOf(id)); } catch { } return w; }
      return { ok: true, provider: filled(p) };
    },
    /** a new key for a kept record (the roster's 换钥匙): sealed over the old one, the tail rewritten */
    rekey(id, key) {
      const p = thirdParty(id);
      if (!p) return { ok: false, code: MP.presetOf(id) ? 'built-in' : 'unknown' };
      const errors = MP.validateKey(key);
      if (errors.length) return { ok: false, code: 'invalid', errors };
      const old = store.keyOf(id);   // put back if the record's write fails (the tail must name the key the vault holds)
      const sealed = seal(id, key);
      if (!sealed.ok) return sealed;
      const next = { ...p, keyRef: MP.keyRefOf(id), tail: MP.tailOf(key) };
      const w = commit(records.map((r) => (r.id === id ? next : r)));
      if (!w.ok) { if (old.ok) seal(id, old.value); return w; }
      return { ok: true, provider: filled(next) };
    },
    /** the roster's rename / the default model / a SELF-HOSTED one's address or interface — validated whole like put.
     *  A new address sends the sealed key somewhere new: it is taken only WITH the key pasted again (`key` — the person
     *  shows they hold it, as an add does), and only where the preset lets the person name an address (adversarial read r1). */
    patch(id, change = {}) {
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
      const next = MP.normalizeProvider(moves ? { ...raw, tail: MP.tailOf(c.key) } : raw);
      const old = moves ? store.keyOf(id) : null;
      if (moves) { const sealed = seal(id, c.key); if (!sealed.ok) return sealed; }
      const w = commit(records.map((r) => (r.id === id ? next : r)));
      if (!w.ok) { if (old && old.ok) seal(id, old.value); return w; }
      return { ok: true, provider: filled(next) };
    },
    /** the record, then its sealed key (a locked vault forgets too — secretDrop needs no key) */
    remove(id) {
      const p = thirdParty(id);
      if (MP.presetOf(id)) return { ok: false, code: 'built-in' };
      const v0 = vault();
      // an ORPHANED key (its record gone: a crash between the seal and the write, a record skipped at load) — the Vault row's
      // Remove is this door, so it must still drop the entry (adversarial read r1)
      if (!p) {
        let had = false;
        try { had = !!v0 && typeof v0.secretNames === 'function' && v0.secretNames().some((n) => n.name === MP.keyEntryOf(id)); } catch { had = false; }
        if (!had) return { ok: false, code: 'unknown' };
        const d = v0.secretDrop(MP.keyEntryOf(id));
        return d && d.ok ? { ok: true, id, keyDropped: true, orphan: true } : { ok: false, code: 'key-unreadable' };
      }
      const w = commit(records.filter((r) => r.id !== id));
      if (!w.ok) return w;
      let keyDropped = true;
      try { const v = vault(); if (v && v.state() !== 'not_set_up') keyDropped = !!(v.secretDrop(MP.keyEntryOf(id)) || {}).ok; } catch { keyDropped = false; }
      if (!keyDropped) log(`[providers] ${id}: its vault entry could not be dropped — the record is gone all the same`);
      return { ok: true, id, keyDropped };
    },
    /** THE TEST'S RESULT (lane lg-providers U4, src/server/provider-test.js): the verdict per harness + lastTestAt */
    noteTested(id, harness, verdict, at) {
      const p = thirdParty(id);
      if (!p) return { ok: false, code: 'unknown' };
      const next = MP.normalizeProvider({ ...p, lastTestAt: at, tested: { ...(p.tested || {}), [harness]: { verdict, at } } });
      const w = commit(records.map((r) => (r.id === id ? next : r)));
      return w.ok ? { ok: true, provider: filled(next) } : w;
    },
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
