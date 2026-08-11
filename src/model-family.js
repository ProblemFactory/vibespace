'use strict';
// Model-FAMILY vocabulary, ONE module (B-a612 step 0). This existed as three
// inline copies (usage-history._tier, usage-estimator.scopedFamily, the
// anchors' split) — a fourth copy is exactly the drift the CS rules ban, so
// new family logic lands here and the older copies migrate as they're touched.
// Families are COARSE on purpose: they only need to match the vendor's
// model-scoped weekly bucket names ("Fable", "Opus", "Sonnet"), which scope
// per family, never per point release.
function familyOfModel(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return null; // unknown family — callers must treat as "no projection"
}
function familyOfScopedBucket(name) { return familyOfModel(name); }

// Project an account's cache to ONE session's family: scoped buckets of OTHER
// known families stop counting against this session; 5h/7d always count
// (every request consumes them — the nested model), and a bucket whose name
// maps to NO family is KEPT (fail closed: unknown data must never relax a
// constraint). fam=null ⇒ no projection (the whole cache, today's semantics).
function projectCacheForFamily(cache, fam) {
  if (!cache || !fam || !Array.isArray(cache.scopedWeekly)) return cache;
  const scopedWeekly = cache.scopedWeekly.filter((b) => {
    const bf = familyOfScopedBucket(b?.name);
    return !bf || bf === fam;
  });
  return { ...cache, scopedWeekly };
}
module.exports = { familyOfModel, familyOfScopedBucket, projectCacheForFamily };
