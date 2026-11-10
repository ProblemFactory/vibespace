'use strict';
// Model-FAMILY vocabulary, ONE module (B-a612 step 0). This existed as three
// inline copies (usage-history._tier, usage-estimator.scopedFamily, the
// anchors' split) — a fourth copy is exactly the drift the CS rules ban, so
// new family logic lands here and the older copies migrate as they're touched.
// Families are COARSE on purpose: they only need to match the vendor's
// model-scoped weekly bucket names ("Fable", "Opus", "Sonnet"), which scope
// per family, never per point release.
// THE FAMILIES THE INSTALLED CLAUDE CODE NAMES (lane cli-update-needs-nothing; acceptance r1 law C, r2 law C final).
// src/server/cli-model-catalog.js hands in the catalog's family PER MODEL — an exact id map, never a word («claude» beside
// «quill» never takes claude-quill-1 anywhere). A LANE IS A FACT ABOUT ONE ACCOUNT'S READING (the pool's standing rule: a
// reading speaks for its own credential slot): projectCacheForFamily gives a catalog family its lane only on a reading that
// carries a scoped bucket of that family's WHOLE name («Quill», «Quill 1»; never «Model cap», «Overage Included»); a reading
// without one is judged by every scoped cap it has (fail closed — a vendor may meter a new family under an existing cap, as
// it meters Mythos under Fable). No process-wide memory of names. The seed words run first and are never overridden.
const RESERVED = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype', '__proto__']);
const SEED_FAMILIES = new Set(['fable', 'opus', 'sonnet', 'haiku']);
let CATALOG_BY_ID = new Map(), CATALOG_FAMILIES = new Set();
const idCore = (m) => String(m || '').toLowerCase().trim().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '');
function setCatalogFamilies(map) {
  const byId = new Map(), fams = new Set();
  for (const [k, f] of Object.entries(map && typeof map === 'object' && !Array.isArray(map) ? map : {})) {
    if (typeof f !== 'string' || !/^[a-z][a-z0-9]{2,23}$/.test(f) || RESERVED.has(f) || RESERVED.has(k)) continue;
    byId.set(k, f); fams.add(f);
  }
  CATALOG_BY_ID = byId; CATALOG_FAMILIES = fams;
}
function familyOfModel(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  const cf = CATALOG_BY_ID.get(idCore(m)) || CATALOG_BY_ID.get(idCore(m).replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, ''));
  if (cf) return cf; // the catalog's family (its LANE is decided per reading: projectCacheForFamily)
  return null; // unknown family — callers must treat as "no projection"
}
function familyOfScopedBucket(name) {
  const seed = familyOfModel(name);
  if (seed) return seed;
  const whole = String(name || '').toLowerCase().trim().replace(/\s+v?\d+(?:\.\d+)*$/, '');
  if (CATALOG_FAMILIES.has(whole)) return whole; // a bucket whose WHOLE name is a catalog family
  return null;
}

// Project an account's cache to ONE session's family: scoped buckets of OTHER
// known families stop counting against this session; 5h/7d always count
// (every request consumes them — the nested model), and a bucket whose name
// maps to NO family is KEPT (fail closed: unknown data must never relax a
// constraint). fam=null ⇒ no projection (the whole cache, today's semantics).
// THE SPARE LANE (B-8a65): the caps set aside are handed back as `spareScoped`
// — the same door answers "which caps does this request NOT draw", so there is
// no second projection. A spare lane is not a constraint (nothing here counts
// it); the pool only ORDERS on it (account-pool-auto `spareLaneRemaining`).
// View-only: never written to data/usage-cache.
function projectCacheForFamily(cache, fam) {
  if (!cache || !fam || !Array.isArray(cache.scopedWeekly)) return cache;
  // a catalog family's lane exists only on a reading that names it — this account's; else every scoped cap judges (fail closed)
  if (!SEED_FAMILIES.has(fam) && !cache.scopedWeekly.some((b) => familyOfScopedBucket(b && b.name) === fam)) return cache;
  const scopedWeekly = [], spareScoped = [];
  for (const b of cache.scopedWeekly) {
    const bf = familyOfScopedBucket(b?.name);
    (!bf || bf === fam ? scopedWeekly : spareScoped).push(b);
  }
  return { ...cache, scopedWeekly, spareScoped };
}
module.exports = { familyOfModel, familyOfScopedBucket, projectCacheForFamily, setCatalogFamilies };
