'use strict';
// THE PATH FIELD'S ANSWER ON THIS MACHINE (lane path-field — GET /api/dir-complete with `bases` / `q` / `probe`): the
// folders the field needs for one text, listed through the SafeFs pool (a hung mount never answers a stat on the loop),
// as the listing PURE src/path-candidates.js sliceListing builds (the host rung builds the same from its machine).
//   · a LISTING CACHE per folder with mtime invalidation: a folder listed < 2 s ago is reused as is; older, the worker
//     states it and a same mtime keeps the cached listing (`known` → `same`)
//   · the FOLDER INDEX the fuzzy search walks (home + bases outside it, 4 levels, ≤ 6000 folders, dot / dependency
//     folders, the instance's own checkout + data dir and every mount skipped) is kept 30 s and refreshed BEHIND an
//     answer once stale — a keystroke never waits for a walk it already has
//   · the whole answer within the budget (500 ms the brief's): what is not there by then is `partial`, and the work
//     still lands in the caches for the next keystroke
//   · `self` = the exclusion facts (isExcludedPath): the checkout the server runs from, its data dir, and every folder of
//     the home whose package.json names vibespace (kept 60 s)
const path = require('path');
const os = require('os');
const PC = require('../path-candidates.js');

const LIST_FRESH_MS = 2000;
const INDEX_TTL_MS = 30e3;
const SELF_TTL_MS = 60e3;
const MAX_LIST = 14;
const MAX_PROBES = 40;
/* B-0f3d (lane bl-tests-a, after B-08d5): a PROBE (a recent conversation's folder, a Task Group's folder) that did not answer inside the
   budget — a stale or hung storage mount — is not asked again for this long, nor any path UNDER it: the listing a person typed is never
   held by it, and a hung mount is not asked (a file worker held up to its deadline) on every keystroke; a probe that answers late after
   all is unmarked the moment it answers; a probe call that FAILS is late for that reply only. The reply names its late probes
   (`probesLate`, in the field's own words). The field's OWN text's path (`own`) is never among them: it is decided inside the listing's race */
const PROBE_LATE_MS = 30e3;

function create({ call, home = os.homedir(), repoDir = path.resolve(__dirname, '..', '..'), dataDir = null, mounts = () => [], now = Date.now } = {}) {
  const listCache = new Map();   // abs → { at, entry }
  const indexCache = new Map();  // key → { at, dirs, links, p }
  let selfCache = { at: 0, v: null, p: null };
  const lateProbes = new Map();  // abs → when its probe ran out of the budget (PROBE_LATE_MS)
  const dataRoot = dataDir || path.join(repoDir, 'data');

  async function listDirs(abs, { files = false, pkg = false } = {}) {
    const t = now();
    const out = []; const ask = [];
    for (const p of abs) {
      const c = listCache.get(p);
      if (c && t - c.at < LIST_FRESH_MS && (!files || c.entry.files) && (!pkg || c.pkg)) out.push(c.entry);
      else ask.push({ path: p, known: c && (!files || c.entry.files) && (!pkg || c.pkg) ? c.entry.mtime : undefined });
    }
    if (ask.length) {
      const r = await call('dirSlice', { dirs: ask, files, pkg });
      for (const d of (r && r.dirs) || []) {
        const c = listCache.get(d.path);
        if (d.same && c) { c.at = now(); out.push(c.entry); continue; }
        if (d.exists && d.isDir !== false && Array.isArray(d.kids)) listCache.set(d.path, { at: now(), entry: d, pkg });
        else listCache.delete(d.path);
        out.push(d);
      }
      if (listCache.size > 2000) for (const k of [...listCache.keys()].slice(0, 500)) listCache.delete(k);
    }
    return out;
  }

  /** The exclusion facts — never blocks on a fresh walk twice (one in flight). */
  function self() {
    const t = now();
    if (selfCache.v && t - selfCache.at < SELF_TTL_MS) return Promise.resolve(selfCache.v);
    if (selfCache.p) return selfCache.p;
    selfCache.p = listDirs([home], { pkg: true }).then((ds) => {
      const roots = [repoDir, dataRoot];
      for (const d of ds) for (const k of d.kids || []) if (k.pkg === PC.SELF_PACKAGE) roots.push(path.join(home, k.name));
      selfCache = { at: now(), v: { home, roots: [...new Set(roots)] }, p: null };
      return selfCache.v;
    }).catch(() => { selfCache.p = null; return { home, roots: [repoDir, dataRoot] }; });
    return selfCache.p;
  }

  function index(roots, skip) {
    const key = roots.join('\n');
    const t = now();
    const c = indexCache.get(key);
    const walk = () => {
      const p = call('dirIndex', { roots, depth: 4, max: 6000, budgetMs: 350, skip }).then((r) => {
        indexCache.set(key, { at: now(), dirs: (r && r.dirs) || [], links: (r && r.links) || [], partial: !!(r && r.partial), p: null });
        if (indexCache.size > 24) indexCache.delete(indexCache.keys().next().value);
        return indexCache.get(key);
      }).catch(() => { const e = indexCache.get(key); if (e) e.p = null; return e || null; });
      if (c) c.p = p; else indexCache.set(key, { at: 0, dirs: null, links: [], p });
      return p;
    };
    if (c && c.dirs && t - c.at < INDEX_TTL_MS) return Promise.resolve(c);
    if (c && c.dirs) { if (!c.p) walk(); return Promise.resolve(c); }   // stale: answer from it, refresh behind
    return c && c.p ? c.p : walk();
  }

  /** One answer. `text` = what the field holds; `bases` / `probe` = paths (`~/…` or absolute); `q` = the fuzzy words.
   *  → { listing, self, took, partial } */
  async function slice({ text = '', bases = [], probe = [], own = '', q = '', kind = 'folder', budgetMs = 450 } = {}) {
    const t0 = now();
    const files = kind === 'file';
    const abs = (p) => PC.fromTilde(home, String(p || '').trim()).replace(/(.)\/+$/, '$1');
    const baseList = (Array.isArray(bases) ? bases : []).map(String).filter((p) => p && (p.startsWith('/') || p.startsWith('~'))).slice(0, 12);
    const ask = PC.sliceAsk(text, baseList.map((p) => ({ path: PC.toTilde(home, abs(p)) })));
    const toList = [...new Set(ask.list.map(abs))].slice(0, MAX_LIST);
    const probeIn = (Array.isArray(probe) ? probe : []).map(String).filter((p) => p.startsWith('/') || p.startsWith('~'));
    const sentAs = new Map();   // abs → the strings the field sent for it (a late probe is named back in the field's own words)
    for (const p of probeIn) { const a = abs(p); if (!sentAs.has(a)) sentAs.set(a, []); sentAs.get(a).push(p); }
    // the field's OWN text's path (`own`): its existence is decided INSIDE the listing's race (a folder past the listing's 400 entries is
    // known only by its probe) — never batched with the auxiliary probes, never «late» on its own
    const ownAbs = own && (String(own).startsWith('/') || String(own).startsWith('~')) ? abs(own) : '';
    const probes = [...sentAs.keys()].filter((a) => a !== ownAbs).slice(0, MAX_PROBES);
    const fuzzy = String(q || '').trim();
    const mountRows = [];
    try { for (const m of mounts() || []) if (m && m.path && m.mounted) mountRows.push({ path: m.path, label: m.label || m.source || m.name || '' }); } catch { }
    let partial = false;
    const deadline = new Promise((r) => setTimeout(() => r('late'), Math.max(50, budgetMs)));
    const work = (async () => {
      const me = await self();
      const listed = await listDirs(toList, { files });
      /* exactly one folder starts with the typed last segment → list it too (the field shows what is inside; Tab goes in) */
      const last = /\s/.test(text) || !String(text).includes('/') ? '' : String(text).slice(String(text).lastIndexOf('/') + 1).toLowerCase();
      if (last) {
        const one = [];
        for (const d of listed) { const hits = (d.kids || []).filter((k) => !k.link && k.name.toLowerCase().startsWith(last)); if (hits.length === 1) one.push(path.join(d.path, hits[0].name)); }
        if (one.length) listed.push(...await listDirs([...new Set(one)].slice(0, 4), { files }));
      }
      let idx = null;
      if (fuzzy) {
        const roots = [home, ...baseList.map(abs).filter((p) => !(p === home || p.startsWith(home + '/')))];
        const skip = [...me.roots, ...mountRows.map((m) => m.path)];
        idx = await index([...new Set(roots)], skip);
      }
      const ownPr = ownAbs ? (((await call('dirSlice', { dirs: [], probes: [ownAbs] })) || {}).probes || []) : [];
      return { me, listed, idx, ownPr };
    })();
    const got = await Promise.race([work, deadline]);
    let me, listed = [], idx = null, pr = [], ownPr = [];
    const late = new Set();   // abs paths whose probe ran out of the budget (or was skipped as late)
    if (got === 'late') { partial = true; me = selfCache.v || { home, roots: [repoDir, dataRoot] }; work.catch(() => {}); }
    else ({ me, listed, idx, ownPr } = got);
    // B-0f3d: the PROBES race what is left of the SAME budget on their own — a probe that hangs (a stale mount) never throws the finished
    // listing away (the reply was partial with nothing listed, so an existing healthy folder typed by hand read as not answered); the
    // reply says `probesLate` (the field marks none of them asked), and a late probe is skipped for PROBE_LATE_MS
    if (got !== 'late' && probes.length) {
      const t1 = now();
      for (const [q, at] of lateProbes) if (t1 - at >= PROBE_LATE_MS) lateProbes.delete(q);   // bounded: a mark lives PROBE_LATE_MS
      // a probe AT or UNDER a path marked late is skipped (the name rows under a hung Task Group folder change with every keystroke)
      const underLate = (p) => { for (const q of lateProbes.keys()) if (p === q || p.startsWith(q.endsWith('/') ? q : q + '/')) return true; return false; };
      const ask = probes.filter((p) => { if (underLate(p)) { late.add(p); return false; } return true; });
      if (ask.length) {
        const pw = call('dirSlice', { dirs: [], probes: ask }).then((r) => (r && r.probes) || [], () => null);   // a call that fails is late, never the listing's end
        const pg = await Promise.race([pw, deadline]);
        if (pg === null) for (const p of ask) late.add(p);   // the call FAILED: late for this reply only (a failure is no hang — no mark)
        else if (pg === 'late') {
          const at = now();
          for (const p of ask) { late.add(p); lateProbes.set(p, at); }
          // slow, not hung: the moment it answers, its marks go — the next ask probes it again (never 30 s of a healthy probe called late)
          pw.then((r) => { if (r) for (const p of ask) if (lateProbes.get(p) === at) lateProbes.delete(p); });
        } else { pr = pg; for (const p of ask) lateProbes.delete(p); }
      }
    }
    const probesLate = [...late].flatMap((a) => sentAs.get(a) || [a]);
    const listing = PC.sliceListing({ home, machine: null, dirs: listed, probes: [...(ownPr || []), ...pr], index: idx && idx.dirs ? idx : null, mounts: mountRows, q: fuzzy });
    return { listing, self: me, took: now() - t0, partial: partial || !!(idx && idx.partial), ...(probesLate.length ? { probesLate } : {}) };
  }

  return { slice, self, _caches: { listCache, indexCache } };
}

module.exports = { create, LIST_FRESH_MS, INDEX_TTL_MS, SELF_TTL_MS };
