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
// THE SPLIT (the paired machine's folder listing, 主开发 r1508 / r1636 / r1651: «THE MACHINE COLLECTS, THE HUB SHAPES»): this file keeps
// what is the HUB's — the PLAN (what a text asks for: the candidates in the bases' order, the folders to list, the probes, the index
// roots: PURE path-candidates sliceAsk / textCandidates) and the SHAPE (the verdict and its words, the listing, every flag: PURE
// textVerdict / sliceListing) — ONE shaper for both roads. The FACTS are collected where they live by src/dir-collect.js (its counters,
// marks, caches and the kids' facts — the B-d833 / B-5561 / B-1c27 laws are written there): here over the SafeFs pool, on a paired
// machine by that machine's own agent (src/hosts.js dirSlice, over the `dir-collect` op).
const path = require('path');
const os = require('os');
const PC = require('../path-candidates.js');
const DC = require('../dir-collect.js');
const { NO_IDLE, NO_WORKER } = require('../safe-fs.js');
// M1: the pool has no worker free for the call — every worker busy (NO_IDLE), or every live one looking (NO_WORKER, bl-machines-a's
// folder-rule look): asked again inside the bound, never «could not be read»
const poolBusy = (err) => !!err && (err.code === NO_IDLE.code || err.code === NO_WORKER.code);

/** THE PLAN of one answer, in the machine's own paths (`home` = THAT machine's home: this hub's, or a paired machine's from its hello).
 *  `text` = what the field holds; `bases` / `probe` = paths (`~/…` or absolute); `q` = the fuzzy words; `press` = a person's press is
 *  waiting for it (R-i); `late` = the page's quiet re-ask (r1633: the late-facts wait where the facts live). → { wire (what the collector is asked: src/dir-collect.js collect), text, tAll, allBases, sentAs, candAbs,
 *  fuzzy (the words), home } — the rest stays here for the shape */
function plan({ text = '', bases = [], probe = [], q = '', kind = 'folder', budgetMs = 450, press = false, late = false } = {}, home) {
  const abs = (p) => PC.fromTilde(home, String(p || '').trim()).replace(/(.)\/+$/, '$1');
  const allBases = (Array.isArray(bases) ? bases : []).map(String).filter((p) => p && (p.startsWith('/') || p.startsWith('~')));
  const tAll = allBases.map((p) => ({ path: PC.toTilde(home, abs(p)) }));
  const baseList = allBases.slice(0, 12);
  const ask = PC.sliceAsk(text, tAll.slice(0, 12));
  // every base the field sent (asked ONE AT A TIME — no cut: an «absent» needs every candidate answered), in the ~ form under the home
  const cands = PC.textCandidates(text, tAll).map((c) => { const a = abs(c); return { c: PC.toTilde(home, a), a }; });
  const candAbs = new Set(cands.map((x) => x.a));
  const rows = [...new Set(ask.list.map(abs))].slice(0, DC.MAX_LIST);
  const sentAs = new Map();
  for (const p of (Array.isArray(probe) ? probe : []).map(String).filter((x) => x.startsWith('/') || x.startsWith('~'))) { const a = abs(p); if (!sentAs.has(a)) sentAs.set(a, []); sentAs.get(a).push(p); }
  const probes = [...sentAs.keys()].filter((a) => !candAbs.has(a)).slice(0, DC.MAX_PROBES);
  const fuzzy = String(q || '').trim();
  const roots = fuzzy ? [...new Set([home, ...baseList.map(abs).filter((p) => !(p === home || p.startsWith(home + '/')))])] : [];
  const t = String(text);
  const seg = /\s/.test(t) ? '' : t.trim().slice(t.trim().lastIndexOf('/') + 1).toLowerCase();
  const lastSeg = /\s/.test(t) || !t.includes('/') ? '' : t.slice(t.lastIndexOf('/') + 1).toLowerCase();
  return { wire: { cands, rows, probes, roots, fuzzy: !!fuzzy, files: kind === 'file', press: !!press, budgetMs, seg, lastSeg, ...(late ? { late: true } : {}) }, text: t, tAll, allBases, sentAs, candAbs, fuzzy, home };
}

/** THE SHAPE of one answer — the plan (above) and the collector's facts (src/dir-collect.js collect: JSON-safe, from either road) →
 *  { listing, self, took, partial, verdict?, factsLate?, rowsLate?, rowsUnread?, sourcesUnread?, probesLate?, probesFailed?, sourcesLate? }
 *  — `verdict` = the text's (PURE textVerdict: { kind: 'exists' | 'absent' | 'late' | 'skipped' | 'failed', path?, completed?, until?,
 *  err?, base? }). `machine` / `localized` = a paired machine's listing (its id, a Mac's display names); `now` = THIS hub's clock (a
 *  paired machine's marks are rebased to it before: src/hosts.js) */
function shape(P, F, { machine = null, localized = null, took = 0, now = Date.now } = {}) {
  const w = P.wire, cands = w.cands, answers = Array.isArray(F.answers) ? F.answers : [];
  const okOf = (r) => (r && r.ok ? r.ok : null);
  const isLate = (r) => !!r && r.late === true;
  // r1651 (b): an index root a paired machine HOLDS (newer than the hub's copy, which it has none of): not a source that did not answer —
  // a fact on its way: the rows say «still looking», the page asks once more, quietly, and that reply carries it (src/hosts.js)
  const isHeld = (r) => !!r && r.held === true;
  const listR = Array.isArray(F.rows) ? F.rows : [], auxR = Array.isArray(F.probes) ? F.probes : [], idxR = Array.isArray(F.index) ? F.index : [];
  const text = P.text;
  const verdict = cands.length ? { ...PC.textVerdict(answers) } : null;
  if (verdict) {
    if (verdict.kind === 'skipped') verdict.retryIn = Math.max(0, verdict.until - now());   // relative: the page's clock is not ours
    if (verdict.kind === 'exists') verdict.literal = !verdict.completed && verdict.path === cands[0].c;   // L6: the text's own first candidate (an absolute / ~ text has one)
    if (verdict.kind === 'absent') { const fa = answers.find((x) => !x.parentAbsent) || answers[0]; if (fa) verdict.missing = { path: fa.path, parentExists: !fa.parentAbsent }; }   // where it would be, and whether the folder above is there
  }
  if (verdict && (verdict.kind === 'late' || verdict.kind === 'skipped' || verdict.kind === 'failed') && !/^[~/]/.test(String(text).trim())) { const j = P.tAll.findIndex((b) => PC.joinPath(b.path, String(text).trim()) === verdict.path); if (j >= 0) verdict.base = P.allBases[j]; }   // R-j: the base that did not answer, in the field's own form
  // the probes SENT that this reply does not answer (never marked asked by the field): late / skipped → probesLate, an error → probesFailed
  const state = new Map();
  w.probes.forEach((a, i) => { const r = auxR[i]; if (isLate(r) || (r && r.skipped) || (r && r.failed != null) || (r && 'ok' in r && !r.ok)) state.set(a, 'late'); else { const f = okOf(r); if (f && f.err) state.set(a, 'failed'); } });   // (an answer that omits the probe: late)
  for (const x of cands) if (P.sentAs.has(x.a)) { const an = answers.find((y) => y.path === x.c); if (!an || an.answer === 'late' || an.answer === 'skipped') state.set(x.a, 'late'); else if (an.answer === 'failed') state.set(x.a, 'failed'); }
  for (const a of P.sentAs.keys()) if (!P.candAbs.has(a) && !w.probes.includes(a)) state.set(a, 'late');
  const named = (st) => [...P.sentAs].filter(([a]) => state.get(a) === st).flatMap(([, ss]) => ss);
  const probesLate = named('late'), probesFailed = named('failed');
  // a row source still out is LATE (the list: still looking); one a dead folder's mark answered — the pool's deadline ended it, or a dead
  // entrance above it — could NOT BE READ (the list says so; never «no folders»)
  const sourcesLate = [...w.rows.filter((_, i) => isLate(listR[i])), ...w.roots.filter((_, i) => isLate(idxR[i]))];
  const sourcesUnread = [...w.rows.filter((_, i) => listR[i] && listR[i].skipped), ...w.roots.filter((_, i) => idxR[i] && idxR[i].skipped)];
  let idx = null, idxPartial = false;
  if (P.fuzzy) {
    const es = idxR.filter((r) => !isHeld(r)).map(okOf);
    idxPartial = es.some((e) => !e || e.partial);
    if (es.some(Boolean)) { idx = { dirs: [], links: [] }; for (const e of es) if (e) { idx.dirs.push(...(e.dirs || [])); idx.links.push(...(e.links || [])); } }
  }
  // the line's own facts land in the listing too (a candidate's stat, a level's «a folder»): its resolution's facts
  const facts = [...answers.flatMap((x) => [x.stat && x.stat.exists ? x.stat : null, x.stat && x.stat.one && x.stat.one.exists ? x.stat.one : null]).filter(Boolean), ...auxR.map(okOf).filter(Boolean)];
  const listing = PC.sliceListing({ home: F.home || P.home, machine, dirs: Array.isArray(F.listed) ? F.listed : [], probes: facts, index: idx, mounts: (Array.isArray(F.mounts) ? F.mounts : []).filter((m) => !m.blocked), ...(localized ? { localized } : {}), q: P.fuzzy });
  const heldIdx = idxR.some(isHeld), factsLate = !!F.factsLate || heldIdx;
  // `partial`: the verdict NEEDS a source that did not answer (asked again, bounded); a search's rows when an index root is late or cut.
  // `rowsLate`: a source the rows for this text come from did not answer (the list says «still looking», never «no match» — P8)
  const partial = verdict ? verdict.kind === 'late' : !!(P.fuzzy && idxPartial);
  // (a paired machine's reply CUT to its byte cap — src/dir-collect.js cutToCap — is never whole: its rows say «still looking»)
  const rowsLate = sourcesLate.length > 0 || !!(P.fuzzy && idxPartial) || !!F.cut || heldIdx, rowsUnread = sourcesUnread.length > 0;
  return { listing, self: F.me, took, partial, ...(factsLate ? { factsLate: true } : {}), ...(verdict ? { verdict } : {}), ...(rowsLate ? { rowsLate: true } : {}), ...(rowsUnread ? { rowsUnread: true, sourcesUnread } : {}), ...(probesLate.length ? { probesLate } : {}), ...(probesFailed.length ? { probesFailed } : {}), ...(sourcesLate.length ? { sourcesLate } : {}) };
}

/** THIS hub's answer (GET /api/dir-complete): one collector over the SafeFs pool (`call`), the plan and the shape around it. The
 *  exclusion roots of this instance (its checkout, its data dir) are the collector's own roots. `DCm` = the collector module (a suite's
 *  patched copy; the real one otherwise). → { slice, self, selfWhole, stats, _caches, _counters } */
function create({ call, home = os.homedir(), repoDir = path.resolve(__dirname, '..', '..'), dataDir = null, mounts = () => [], now = Date.now, DCm = DC } = {}) {
  const dataRoot = dataDir || path.join(repoDir, 'data');
  const c = DCm.create({ call, home, roots: [repoDir, dataRoot], mounts, now, poolBusy });
  async function slice(args = {}) {
    const t0 = now();
    const P = plan(args, home);
    const F = await c.collect(P.wire, { signal: args.signal || null });
    return shape(P, F, { took: now() - t0, now });
  }
  return { slice, self: c.self, selfWhole: c.selfWhole, folderMade: c.folderMade /* r4927: the collector's one door */, stats: c.stats, _caches: c._caches, _counters: c._counters };
}

module.exports = { create, plan, shape, poolBusy, LIST_FRESH_MS: DC.LIST_FRESH_MS, INDEX_TTL_MS: DC.INDEX_TTL_MS, SELF_TTL_MS: DC.SELF_TTL_MS, PROBE_LATE_MS: DC.PROBE_LATE_MS, LANDED_FRESH_MS: DC.LANDED_FRESH_MS, LINE_SLOTS: DC.LINE_SLOTS, ROW_SLOTS: DC.ROW_SLOTS, FACT_SLOTS: DC.FACT_SLOTS, KID_FACTS: DC.KID_FACTS, LINK_FACTS: DC.LINK_FACTS };
