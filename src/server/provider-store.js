'use strict';
// THE PROVIDER STORE (design q-053 r1 §1 + q-045 D10, lane provider-record): data/providers.json = { v: 1, providers: [record…] },
// written whole through writeJsonAtomic (tmp + rename, 0600) BEFORE a route answers. It holds the THIRD-PARTY records only:
// the built-in ones (src/model-providers.js PRESETS — the first-party logins) are code, their rows listed at read time from
// the harness's own catalog (`catalogOf(harness)` = AVAILABLE_MODELS[harness], handed in). No secret lives here: a record's
// key is a VAULT ENTRY it names (`keyRef`), never a value. Every record is normalized + validated on the way in AND on load
// (a hand-edited record that fails is skipped BY NAME in the log, never half-read). ORCH tier; the rules are PURE.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MP = require('../model-providers.js');
const { writeJsonAtomic } = require('../channel-store.js');

function create({ dataDir, catalogOf = () => null, log = (m) => console.warn(m) } = {}) {
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
  return {
    file,
    list: () => [...MP.PRESETS, ...records].map(filled),
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
  };
}

module.exports = { create };
