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
const { NO_IDLE } = require('../safe-fs.js');
// B-d833's remainder: EVERY call of the field runs on an IDLE worker or not at all (SafeFs `idleOnly`) — a healthy folder's check
// sent into a worker held by a hung, slower call waited there, ran out ITS OWN deadline and was marked dead for 30 s. A call the pool
// refuses (every worker busy) is LATE: still looking, asked again by the field — never a mark, never «could not be read»
const IDLE_ONLY = Object.freeze({ idleOnly: true });
// …ITS M1 (lane bl-chat-c's fresh read; the coordinator's r1507): idleOnly alone refused a healthy folder whenever every worker had a
// call in flight — the field's own counters can fill four workers and every file route shares the pool, so ordinary load answered
// LATE, three partial replies made the page say «did not answer» and a person's press was refused. A call the pool refuses for NO
// IDLE WORKER is ASKED AGAIN every REASK_MS until a worker frees, up to the reply's soft bound — never sent into a busy worker (the
// hung-call harm stays cured), LATE only when none freed within the bound, no mark either way. THE WAITING ENDS WITH ITS FIELD: the
// reply's `signal` (the page aborted: a field removed, a text that moved — the route's response closed) stops the re-asks. COUNTED
// (stats().noIdle: refused · reasked · freed · late) and said in the journal at most once a minute when it moved.
const REASK_MS = 25;

const LIST_FRESH_MS = 2000;
const INDEX_TTL_MS = 30e3;
const SELF_TTL_MS = 60e3;
const MAX_LIST = 14;
const MAX_PROBES = 40;
/* B-d833 (lane bl-tests-a), ITS FOURTH SHAPE — the coordinator's ruling 2026-11-20 03:24Z / 03:38Z, the table work/b-d833-shape4-table.md
   (three rounds of reads: the line borrowed the rows' calls; the page kept a second resolver). THE LINE AND THE ROWS NEVER SHARE A SLOT:
   · THE LINE asks STATS ONLY, of the typed chain (R-a): per candidate ONE call (src/safe-fs-worker.js pathStat — a BARE stat; when
     absent, in the same call, the NAMES in its parent that start with the typed last segment — names only: the one match is stated by
     the hub under its own name, a level like any other). No listing,
     walk, index or row call is ever a source of the verdict. CANDIDATES ONE AT A TIME in the bases' order (R-b): the next only when the
     one before answered absent (or only completes); stop at the first exact hit or the first that does not answer.
   · EVERY CALL GOES DOWN ITS CHAIN (R-c): a path is asked only when each level above it answered «a folder» within LIST_FRESH_MS (the
     home and the root are given) — each path ONE bare stat under ONE key (`stat:<path>`), joined by every asker: the line's own call for
     a candidate, a level of any chain, a row source's own folder (a listing, a probe and a walk state their folder first). The first level that does not
     answer is the dead thing's ENTRANCE: one call; when the pool's DEADLINE ends it (`safeFsTimeout`) its mark speaks for everything
     below it for PROBE_LATE_MS, and every source there answers SKIPPED with the time the mark ends (R-i) — never «late». A person's
     PRESS sends the entrance's one call ONCE per window (it is attended: never answered from a mark alone). The walk and the row
     listings take the known entrances (marked, or still out) and the hub's mounts as skips: a listing names such a kid, never states it
     (since B-5561 a listing states NO kid: names and types only — the walk keeps its skip).
     At its GRANT a queued call is judged again: a mark set while it waited answers it, and a call queued past QUEUE_MAX_MS is dropped.
   · TWO COUNTERS (R-d): the line has LINE_SLOTS of its own, the rows ROW_SLOTS. A call counts in its first asker's counter; a later
     asker joins it only once it is SENT (a queued call is no call); at its grant a queued call joins one sent by then. No inline run
     (the pool's own rule since B-3b03); no stall release (a hung call keeps its slot until the pool's deadline). The rows are best effort.
   · the rows' own calls (a base's listing, an auxiliary probe, an index root) keep their OWN-KEY marks: a late one still out is JOINED,
     one the pool's deadline ended is not sent again for PROBE_LATE_MS (answered «skipped»; the list says it is still looking). SLOW, NOT HUNG
     (2.369.413's law, kept): a probe's fact is KEPT PROBE_LATE_MS when its call lands and remembers whether that call went LATE (past
     the budget of the ask that sent it); it is USED while fresh (< LANDED_FRESH_MS), past that ONLY for a path whose last call went late
     — answered with it, refreshed by ONE call behind it; a landing never writes over a fact sent later; only the pool's DEADLINE keeps a
     mark (any other failure is no hang). The field's own path is a line candidate: it never reads a kept fact. */
const PROBE_LATE_MS = 30e3;
const LANDED_FRESH_MS = 2000;
const LINE_SLOTS = 2;
const ROW_SLOTS = 1;
/* B-5561 — A LISTING NEVER TOUCHES ITS KIDS' INSIDES (the coordinator's ruling r1203): the worker lists names and types only; each kid's
   facts (a folder's git and package.json name, a symlink's kind and target) come from THE KID'S OWN CALL — under its path's one key
   (`stat:<kid>`, joined by the line and every level: a dead kid is ONE call whoever asks), in a counter of their own (FACT_SLOTS),
   asked BEHIND the answer (never waited: the line and the rows never wait on them), kept PROBE_LATE_MS. Which kids, per answer: the
   folder kids the rows are about (the typed last segment's; every kid when it is empty) — at most KID_FACTS —, the symlink kids the rows
   are about — at most LINK_FACTS (the rest when typed) —, and the home's folder kids for the self facts. A fact asked and not landed
   when the answer is built: `factsLate` (the page asks once more, quietly — bl-chat-c's). The page's listing keeps its shape: a kid
   carries its git and its link from its kept facts, so a badge or a symlink row arrives with the answer after its call lands. */
const FACT_SLOTS = 2;   // S3 (r1507): two — one dead kid holds one slot (at the pool's own deadline), never every page's facts
const KID_FACTS = 12;
const LINK_FACTS = 12;
const SELF_FACTS = 24;  // S2 (r1507): a home folder's own facts asked at most 24 a reply (the rest the next ask)
const SELF_KEEP_MS = 10 * 60e3; // …and KEPT while the home's own time (its listing's mtime) has not moved, at most this long
const QUEUE_MAX_MS = 2000;   // a row call still queued this long after it was asked for is dropped (no burst of stale calls)
const LATE = Object.freeze({ late: true });

function create({ call, home = os.homedir(), repoDir = path.resolve(__dirname, '..', '..'), dataDir = null, mounts = () => [], now = Date.now } = {}) {
  const listCache = new Map();   // abs → { at, entry }
  const kidFacts = new Map();    // abs → { at, f }: a kid's own facts (B-5561: pathStat `facts`), kept PROBE_LATE_MS
  const selfFacts = new Map();   // a home folder → { at, pkg, homeAt }: its package.json name for `self`, kept while the home's mtime holds (S2)
  const indexCache = new Map();  // root + skip → { at, dirs, links, partial, p }
  let selfCache = { at: 0, v: null, p: null };
  const known = new Map();       // abs → { at, stat }: a bare stat answered < LIST_FRESH_MS ago (a level's «a folder», a candidate's facts)
  const landed = new Map();      // abs → { at, sentAt, late, fact }: a row probe's facts (kept PROBE_LATE_MS; `late` = its call went late)
  const sent = new Map();        // key → { path, entrance, at, hungAt, p } — calls SENT, and the DEADLINE MARK of each that hung (30 s)
  const pressed = new Map();     // entrance path → when a person's press last went through its mark (ONCE per window)
  let mountPaths = [];           // the hub's mounted rows, as last read (a listing names them, never states inside them)
  const queued = new Map();      // counter + key → its promise (a call waiting for its counter's slot)
  const busy = { refused: 0, reasked: 0, freed: 0, late: 0 }; // M1: the pool found busy — calls refused, re-asks, freed, ended late
  let busySaid = { at: 0, reasked: 0, late: 0 };
  const dataRoot = dataDir || path.join(repoDir, 'data');
  const C = { line: { cap: LINE_SLOTS, busy: 0, q: [] }, rows: { cap: ROW_SLOTS, busy: 0, q: [] }, facts: { cap: FACT_SLOTS, busy: 0, q: [] } };
  const pump = (c) => { while (c.busy < c.cap && c.q.length) c.q.shift()(); };
  const grant = (c) => new Promise((res) => { c.q.push(() => { c.busy++; let held = true; res(() => { if (!held) return; held = false; c.busy--; pump(c); }); }); pump(c); });
  const under = (p, q) => p === q || p.startsWith(q === '/' ? '/' : q + '/');
  const given = (p) => p === home || p === '/' || home.startsWith(p === '/' ? '/' : p + '/');   // the home, the root and the home's ancestors
  const markEnd = (m) => m.hungAt + PROBE_LATE_MS;
  /* the hung ENTRANCE at or above p (the pool's deadline ended its call) — its mark speaks for everything below it */
  function entranceAbove(p, t, except = null) { for (const m of sent.values()) if (m !== except && m.entrance && m.hungAt != null && t - m.hungAt < PROBE_LATE_MS && under(p, m.path)) return m; return null; }
  /* ONE CALL: joined while it is SENT; queued in its asker's counter otherwise; at the grant it joins a call sent by then */
  function once(key, cn, p, run, { entrance = false, born = now(), through = null, boundAt = 0, signal = null }) {
    const t = now(), s0 = sent.get(key);
    if (s0 && s0.hungAt == null && t - s0.at < PROBE_LATE_MS) return s0.p;
    if (s0 && s0 !== through && s0.hungAt != null && t - s0.hungAt < PROBE_LATE_MS) return Promise.resolve({ skipped: markEnd(s0), at: p });   // its OWN deadline mark: never sent again inside the window
    const qk = cn + '\n' + key;
    if (queued.has(qk)) return queued.get(qk);
    const qp = grant(C[cn]).then((free) => {
      queued.delete(qk);
      const t1 = now(), s1 = sent.get(key);
      if (s1 && s1.hungAt == null) { free(); return s1.p; }   // sent by the other counter meanwhile: joined, the slot given back
      // at its GRANT a call is judged again: a mark set while it waited (its own, or a dead entrance above it) and an age nobody waits for
      if (s1 && s1 !== through && s1.hungAt != null && t1 - s1.hungAt < PROBE_LATE_MS) { free(); return { skipped: markEnd(s1), at: p }; }
      const m = entranceAbove(p, t1, through); if (m) { free(); return { skipped: markEnd(m), at: m.path }; }
      if (t1 - born > QUEUE_MAX_MS) { free(); return null; }
      const e = { key, path: p, entrance, at: t1, hungAt: null, p: null };
      // M1: refused for no idle worker ⇒ asked again until a worker frees, up to the reply's bound (`boundAt`, the real clock) or its
      // field's end (`signal`); a call with no bound (a kid's facts, behind every answer) is LATE at once, as before
      let reasked = 0;
      const attempt = () => Promise.resolve().then(run).then((r) => { if (reasked) busy.freed++; return r; }, (err) => {
        if (!(err && err.code === NO_IDLE.code)) throw err;
        if (!reasked) busy.refused++;
        if ((signal && signal.aborted) || !(Date.now() + REASK_MS <= boundAt)) { busy.late++; throw err; }
        reasked++; busy.reasked++;
        return new Promise((res) => setTimeout(res, REASK_MS)).then(attempt);
      });
      e.p = attempt().then(
        (r) => { free(); if (sent.get(key) === e) sent.delete(key); return { ok: r }; },
        (err) => { free(); if (sent.get(key) === e) { if (err && err.safeFsTimeout) e.hungAt = now(); else sent.delete(key); } if (err && err.code === NO_IDLE.code) return LATE; return { failed: String((err && (err.message || err.code)) || err || 'failed').slice(0, 200) }; });
      sent.set(key, e);
      return e.p;
    });
    queued.set(qk, qp);
    return qp;
  }
  /* a source under a hung entrance: SKIPPED (with the time its mark ends) — but a PRESS sends the entrance's one call once in the window */
  function skippedFor(p, t, press) {
    const m = entranceAbove(p, t);
    if (!m) return null;
    const pa = pressed.get(m.path);
    // the press goes through ONCE per window — its mark STAYS (a listing built meanwhile still skips the folder) until the press's own
    // call is SENT and takes its place
    if (press && m.path === p && !(pa != null && t - pa < PROBE_LATE_MS)) { pressed.set(m.path, t); return { through: m }; }
    return { skipped: markEnd(m), at: m.path };
  }
  /* ONE LEVEL's bare stat → { ok: stat } | { skipped } | null (no answer in time) | { failed } (the pool failed: late) */
  function levelStat(p, cn, o) {
    const t = now(), k = known.get(p);
    if (k && t - k.at < LIST_FRESH_MS) return Promise.resolve({ ok: k.stat });
    const sk = skippedFor(p, t, o.press); if (sk && sk.skipped) return Promise.resolve(sk);
    return once('stat:' + p, cn, p, () => call('pathStat', { path: p }, IDLE_ONLY).then((r) => { const st = r && r.stat; if (st && !st.err) noteKnown(p, st); return st; }), { ...o, entrance: true, through: sk && sk.through });
  }
  /* THE DESCENT: every level above `p` (to `p` itself when `self`) answered «a folder» — else where it stopped and why */
  async function descend(p, cn, o, self) {
    if (given(p)) return null;
    const root = under(p, home) ? home : '/';
    const segs = p.slice(root === '/' ? 1 : root.length + 1).split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < segs.length - (self ? 0 : 1); i++) {
      cur = cur === '/' ? '/' + segs[i] : cur + '/' + segs[i];
      const r = await raceOf(levelStat(cur, cn, o), o.untilSoft);
      if (r === LATE || !r) return { late: true, at: cur };
      if (r.skipped) return { skipped: r.skipped, at: cur };
      if (r.failed != null) return { late: true, at: cur };   // the pool failed the call: not an answer
      const st = r.ok || {};
      if (st.err) return { failed: st.err, at: cur };
      if (!st.exists || st.isDir === false) return { absent: true, at: cur, st };
    }
    return null;
  }
  const raceOf = (p, untilSoft) => Promise.race([Promise.resolve(p).then((r) => r || LATE), untilSoft]);
  const noteKnown = (p, st) => { known.set(p, { at: now(), stat: st }); if (known.size > 2000) for (const k of [...known.keys()].slice(0, 500)) known.delete(k); };
  /* (a LISTING states no kid at all since B-5561 — names and types only —, so it needs no skip list: a known dead folder, a mount, a path
     this ask states by its own call is NAMED by every listing, never crossed) */
  /* B-5561: A KID'S OWN FACTS — kept, and asked behind an answer (never waited for). → true when asked (it may still land) */
  const factOf = (p, t = now()) => { const k = kidFacts.get(p); return k && t - k.at < PROBE_LATE_MS ? k.f : null; };
  function askFacts(p) {
    const t = now();
    if (factOf(p, t) || mountPaths.includes(p) || entranceAbove(p, t)) return false;   // kept · a mount (named, never stated) · under a dead mark
    once('stat:' + p, 'facts', p, () => call('pathStat', { path: p, facts: true }, IDLE_ONLY).then((x) => {
      const st = x && x.stat;
      if (st && st.facts && !st.err) {
        kidFacts.set(p, { at: now(), f: st }); noteKnown(p, st); if (kidFacts.size > 4000) for (const k of [...kidFacts.keys()].slice(0, 1000)) kidFacts.delete(k);
        if (path.dirname(p) === home) { const h = listCache.get(home); selfFacts.set(p, { at: now(), pkg: st.pkg || null, homeAt: h ? h.entry.mtime : null }); } // S2: the self fact, beside the home's time
      }
      return st;
    }), { entrance: true, born: t });
    return true;
  }
  /* a listing's kids WITH their kept facts (the page's shape: kids [{ name, git, link? }]): a folder kid's git; a symlink kid by its own
     stat — to a folder: a LINK with its target; to a file: a file of the folder; dangling: no row; not stated yet: named, no row */
  function withFacts(d) {
    if (!d || !Array.isArray(d.kids)) return d;
    const t = now(), kids = [], fl = Array.isArray(d.files) ? d.files.slice() : null;
    let fc = d.fileCount;
    for (const k of d.kids) {
      const f = factOf(path.join(d.path, k.name), t);
      if (k.link == null) { kids.push(f && f.git ? { ...k, git: true } : k); continue; }
      if (!f) { kids.push(k); continue; }
      if (!f.exists) continue;
      if (f.isDir) { kids.push({ name: k.name, git: !!f.git, link: f.link || '' }); continue; }
      if (fc != null) fc++;
      if (fl) fl.push({ name: k.name, size: f.size || 0, mtime: f.mtime || 0 });
    }
    return { ...d, kids, ...(fl ? { files: fl } : {}), fileCount: fc };
  }
  /* THE LINE: one candidate — its chain, then its ONE own call (the stat; absent ⇒ the names under the typed prefix), then the one match's
     stat under the MATCH's own key */
  async function lineAnswer(c, a, o) {
    if (!given(a)) {
      const d = await descend(a, 'line', o, false);
      if (d) return { path: c, ...(d.absent ? { answer: 'absent', parentAbsent: d.at } : d.skipped ? { answer: 'skipped', until: d.skipped, at: d.at } : d.failed != null ? { answer: 'failed', err: d.failed } : { answer: 'late', at: d.at }) };
    }
    const t = now(), k = known.get(a);
    let st = k && t - k.at < LIST_FRESH_MS && k.stat.exists ? k.stat : null;   // a fresh «it is there» stands; an absence is asked again (its names)
    if (!st) {
      const sk = skippedFor(a, t, o.press); if (sk && sk.skipped) return { path: c, answer: 'skipped', until: sk.skipped, at: sk.at };
      // ONE KEY per path: the line's own call IS that path's level stat (joined either way); a level's bare stat joined (no names) that
      // says absent is followed by the line's own, with the names — the folder answered, so it is no second call into a dead thing
      const own = () => once('stat:' + a, 'line', a, () => call('pathStat', { path: a, names: path.basename(a), files: o.files }, IDLE_ONLY).then((x) => { const s1 = x && x.stat; if (s1 && s1.exists && !s1.err) noteKnown(a, s1); return s1; }), { ...o, entrance: true, through: sk && sk.through });
      let r = await raceOf(own(), o.untilSoft);
      if (r && r !== LATE && r.ok && !r.ok.exists && !r.ok.err && r.ok.names === undefined) r = await raceOf(own(), o.untilSoft);
      if (r === LATE || !r) return { path: c, answer: 'late', at: a };
      if (r.skipped) return { path: c, answer: 'skipped', until: r.skipped, at: r.at || a };
      if (r.failed != null) return { path: c, answer: 'late', at: a };
      st = r.ok || {};
      // THE ONE MATCH is stated by the hub, under ITS OWN name, through the door every level uses (the worker answers names only): it
      // joins a call already out, obeys the marks above it and its own, sits in every skip list, passes the pool's blocked check — one
      // dead folder is one call whatever prefix of it is typed (R-c; the read of the fourth shape, 2026-11-20 11:34Z)
      if (!st.exists && !st.err && Array.isArray(st.names) && st.names.length === 1) {
        const mp = path.join(path.dirname(a), st.names[0]);
        const mr = await raceOf(levelStat(mp, 'line', o), o.untilSoft);
        if (mr === LATE || !mr || mr.failed != null) return { path: c, answer: 'late', at: mp };
        if (mr.skipped) return { path: c, answer: 'skipped', until: mr.skipped, at: mr.at || mp };
        st = { ...st, one: mr.ok };
      }
    }
    const ans = PC.lineAnswerOf(st, { files: o.files });
    return { path: c, ...ans, stat: st, ...(ans.completed ? { completed: PC.toTilde(home, ans.completed) } : {}) };
  }

  /* ── THE ROWS (best effort, their own slot): a folder listed / a path stated / a root walked — each down its chain first ── */
  function listOne(a, { files = false, ...o }) {
    const c = listCache.get(a);
    if (c && (!files || c.entry.files) && now() - c.at < LIST_FRESH_MS) return Promise.resolve({ ok: c.entry });
    return once(`list:${files ? 'f' : ''}:${a}`, 'rows', a, () => {
      const c0 = listCache.get(a), base = c0 && (!files || c0.entry.files) ? c0 : null;   // `same` answers THIS entry
      // B-1c27: a RACY listing (read within a timestamp tick of the folder's mtime — a kid made in that tick left the mtime as it was)
      // is never kept by its mtime: no `known`, the folder is listed again
      return call('dirSlice', { path: a, dirs: [{ path: a, known: base && !base.entry.racy ? base.entry.mtime : undefined }], files }, IDLE_ONLY).then((r) => {
        const d = ((r && r.dirs) || [])[0] || null;
        if (!d) return null;
        if (d.same) { if (!base) return null; listCache.set(a, { at: now(), entry: base.entry }); return base.entry; }
        if (d.exists && d.isDir !== false && Array.isArray(d.kids)) listCache.set(a, { at: now(), entry: d });
        else listCache.delete(a);
        if (listCache.size > 2000) for (const k of [...listCache.keys()].slice(0, 500)) listCache.delete(k);
        return d;
      });
    }, o);
  }
  function keptProbe(a, o) {
    const t = now(), l = landed.get(a);
    if (!l || t - l.at >= PROBE_LATE_MS || !(t - l.at < LANDED_FRESH_MS || l.late)) return null;
    if (t - l.at >= LANDED_FRESH_MS) { const s0 = sent.get('probe:' + a); if (!(s0 && s0.hungAt == null)) rowSource(a, o, () => probeOne(a, o), true); }   // the refresh, behind (not waited for)
    return Promise.resolve({ ok: l.fact });
  }
  function probeOne(a, o) {
    return once('probe:' + a, 'rows', a, () => {
      const at = now();
      return call('dirSlice', { path: a, dirs: [], probes: [a] }, IDLE_ONLY).then((r) => {
        const f = ((r && r.probes) || [])[0] || null, t2 = now();
        if (f && !f.err) {
          const cur = landed.get(a);
          if (!cur || cur.sentAt <= at) landed.set(a, { at: t2, sentAt: at, late: t2 - at >= o.budget, fact: f });   // never over a newer fact
          if (landed.size > 2000) for (const k of [...landed.keys()].slice(0, 500)) landed.delete(k);
        }
        return f;
      });
    }, o);
  }
  /* a row source: its chain first, TO ITSELF (a bare stat of the folder — the same key as the line's — before its probe, listing or walk:
     a dead folder is met ONCE, by that stat, and everything under it joins it), then its own call: SKIPPED / late / null / { ok } */
  async function rowSource(a, o, run, probe = false) {
    const sk = skippedFor(a, now(), false); if (sk) return sk;
    const d = await descend(a, 'rows', o, true);
    // a PROBE's chain answers its facts itself: the path there but a file (its own stat), or the machine's own error on the way (NOT KNOWN,
    // said as such — probesFailed); a listing or a walk there has no rows (never «still looking» about an error)
    if (d && probe && d.failed != null) return { ok: { path: a, exists: false, err: d.failed } };
    if (d && probe && d.absent && d.at === a && d.st && d.st.exists) return { ok: d.st };
    if (d) return d.skipped ? { skipped: d.skipped } : d.absent || d.failed != null ? null : LATE;
    return raceOf(run(), o.untilSoft);
  }

  /** The exclusion facts — never blocks on a fresh walk twice (one in flight). */
  function self() {
    const t = now();
    if (selfCache.v && t - selfCache.at < SELF_TTL_MS) return Promise.resolve(selfCache.v);
    if (selfCache.p) return selfCache.p;
    selfCache.p = Promise.resolve(listOne(home, {})).then((r) => {
      const d = r && r.ok;
      if (!d) { selfCache.p = null; return { home, roots: [repoDir, dataRoot] }; }
      // each home folder's package.json name is THAT folder's own fact (B-5561: its own call, behind); until every one that can land
      // has, the exclusion is read again at the next ask (the home's listing kept, the facts kept: no call) — never kept a minute short
      // of a checkout
      const roots = [repoDir, dataRoot];
      let missing = 0, asked = 0;
      for (const k of d.kids || []) {
        if (k.link != null) continue;
        const p = path.join(home, k.name), sf = selfFacts.get(p);
        // S2: a home folder's own fact stands while the home's time has not moved (a new folder there moves it), at most SELF_KEEP_MS
        if (sf && sf.homeAt === d.mtime && now() - sf.at < SELF_KEEP_MS) { if (sf.pkg === PC.SELF_PACKAGE) roots.push(p); continue; }
        const kf = factOf(p); // a kid's own facts kept for the rows: its self fact too
        if (kf) { selfFacts.set(p, { at: now(), pkg: kf.pkg || null, homeAt: d.mtime }); if (kf.pkg === PC.SELF_PACKAGE) roots.push(p); continue; }
        if (asked >= SELF_FACTS) { missing++; continue; } // (the rest at the next ask)
        if (askFacts(p)) { asked++; missing++; }
      }
      selfCache = { at: missing ? 0 : now(), v: { home, roots: [...new Set(roots)] }, p: null, missing };
      return selfCache.v;
    });
    return selfCache.p;
  }

  /* ONE index root walked (a root on a dead mount is its own source — the home's walk still answers) */
  function indexOne(root, skip, o) {
    const key = root + '\n' + skip.join('\n');
    const c = indexCache.get(key);
    const walk = () => {
      const p = Promise.resolve(once('index:' + key, 'rows', root, () => call('dirIndex', { path: root, roots: [root], depth: 4, max: 6000, budgetMs: 350, skip }, IDLE_ONLY), o)).then((r) => {
        if (r && r.ok) {
          indexCache.set(key, { at: now(), dirs: r.ok.dirs || [], links: r.ok.links || [], partial: !!r.ok.partial, p: null });
          if (indexCache.size > 48) indexCache.delete(indexCache.keys().next().value);
          return indexCache.get(key);
        }
        const e = indexCache.get(key); if (e) e.p = null;
        return e && e.dirs ? e : null;
      });
      if (c) c.p = p; else indexCache.set(key, { at: 0, dirs: null, links: [], p });
      return p;
    };
    if (c && c.dirs && now() - c.at < INDEX_TTL_MS) return Promise.resolve(c);
    if (c && c.dirs) { if (!c.p) walk(); return Promise.resolve(c); }
    return c && c.p ? c.p : walk();
  }

  /** One answer. `text` = what the field holds; `bases` / `probe` = paths (`~/…` or absolute); `q` = the fuzzy words; `press` = a
   *  person's press is waiting for it (R-i: the entrance's one call goes through its window once).
   *  → { listing, self, took, partial, verdict?, rowsLate?, rowsUnread?, probesLate?, probesFailed?, sourcesLate?, sourcesUnread? } — `verdict` = the text's (PURE
   *  textVerdict: { kind: 'exists' | 'absent' | 'late' | 'skipped' | 'failed', path?, completed?, until?, err?, base? }) */
  async function slice({ text = '', bases = [], probe = [], q = '', kind = 'folder', budgetMs = 450, press = false, signal = null } = {}) {
    const t0 = now();
    // M1: what the busy pool cost since the last line — said at most once a minute, only when it moved (a slow hub's next read sees it)
    if (Date.now() - busySaid.at >= 60e3 && (busy.reasked !== busySaid.reasked || busy.late !== busySaid.late)) {
      console.log(`[dir-slice] the file pool was busy: the folder field asked ${busy.reasked - busySaid.reasked} call(s) again, ${busy.late - busySaid.late} ended late (no idle worker within its reply's bound)`);
      busySaid = { at: Date.now(), reasked: busy.reasked, late: busy.late };
    }
    const files = kind === 'file';
    const abs = (p) => PC.fromTilde(home, String(p || '').trim()).replace(/(.)\/+$/, '$1');
    const allBases = (Array.isArray(bases) ? bases : []).map(String).filter((p) => p && (p.startsWith('/') || p.startsWith('~')));
    const tAll = allBases.map((p) => ({ path: PC.toTilde(home, abs(p)) }));
    const baseList = allBases.slice(0, 12);
    const ask = PC.sliceAsk(text, tAll.slice(0, 12));
    // every base the field sent (asked ONE AT A TIME — no cut: an «absent» needs every candidate answered), in the ~ form under the home
    const cands = PC.textCandidates(text, tAll).map((c) => { const a = abs(c); return { c: PC.toTilde(home, a), a }; });
    const candAbs = new Set(cands.map((x) => x.a));
    const rowsList = [...new Set(ask.list.map(abs))].slice(0, MAX_LIST);
    const sentAs = new Map();
    for (const p of (Array.isArray(probe) ? probe : []).map(String).filter((x) => x.startsWith('/') || x.startsWith('~'))) { const a = abs(p); if (!sentAs.has(a)) sentAs.set(a, []); sentAs.get(a).push(p); }
    const probes = [...sentAs.keys()].filter((a) => !candAbs.has(a)).slice(0, MAX_PROBES);
    const fuzzy = String(q || '').trim();
    const mountRows = [];
    try { for (const m of mounts() || []) if (m && m.path && m.mounted) mountRows.push({ path: m.path, label: m.label || m.source || m.name || '', blocked: !!m.blocked }); } catch { }
    mountPaths = mountRows.map((m) => m.path);
    for (const [ep, at] of pressed) if (now() - at >= PROBE_LATE_MS) pressed.delete(ep);
    let tm = null;
    const until = new Promise((r) => { tm = setTimeout(() => r(LATE), Math.max(50, budgetMs)); });
    const untilSoft = until.then(() => new Promise((r) => setImmediate(() => r(LATE))));   // an answer already in hand beats the deadline
    const okOf = (r) => (r && r !== LATE && r.ok ? r.ok : null);
    const o = { until, untilSoft, files, press: !!press, budget: Math.max(50, budgetMs), boundAt: Date.now() + Math.max(50, budgetMs), signal };
    for (const [k, m] of sent) if (m.hungAt != null && now() - m.hungAt >= PROBE_LATE_MS) sent.delete(k);   // a mark lives PROBE_LATE_MS
    // THE LINE: the candidates ONE AT A TIME, in the bases' order — stop at the first exact hit or the first that does not answer
    const lineP = (async () => {
      const out = [];
      for (const x of cands) {
        const ans = await lineAnswer(x.c, x.a, o);
        out.push(ans);
        if ((ans.answer === 'listed' && !ans.completed) || ans.answer === 'late' || ans.answer === 'skipped' || ans.answer === 'failed') break;
      }
      return out;
    })();
    // THE ROWS (their own slot): the exclusion facts, the bases and the text's folders listed, the auxiliary probes, the index roots
    const selfP = raceOf(self().then((v) => ({ ok: v })), untilSoft);
    const listP = rowsList.map((p) => rowSource(p, o, () => listOne(p, { files, ...o })));
    const auxP = probes.map((a) => keptProbe(a, o) || rowSource(a, o, () => probeOne(a, o), true));
    const meR = await selfP;
    const me = okOf(meR) || selfCache.v || { home, roots: [repoDir, dataRoot] };
    let roots = [], idxP = [];
    if (fuzzy) {
      roots = [...new Set([home, ...baseList.map(abs).filter((p) => !(p === home || p.startsWith(home + '/')))])];
      // the WALK's skip — and so the index cache's NAME — holds only what is STABLE: the roots, the mounts, the entrances whose deadline mark is
      // SET (the read of round wc9f6okda: a healthy stat still out made the name differ at each keystroke — the 30 s index missed, «still
      // looking» while typing — and a walk taken meanwhile never entered that healthy folder, «no matching folder» kept 30 s). Calls still
      // out stay in the LISTINGS' skip only.
      const marked = [...sent.values()].filter((m) => m.entrance && m.hungAt != null).map((m) => m.path);
      const skip = [...new Set([...me.roots, ...mountPaths, ...marked])];
      idxP = roots.map((r) => rowSource(r, o, () => indexOne(r, skip, o).then((e) => (e && e.dirs ? { ok: e } : null))));
    }
    const [answers, listR, auxR, idxR] = await Promise.all([lineP, Promise.all(listP), Promise.all(auxP), Promise.all(idxP)]);
    clearTimeout(tm);
    const verdict = cands.length ? { ...PC.textVerdict(answers) } : null;
    if (verdict) {
      if (verdict.kind === 'skipped') verdict.retryIn = Math.max(0, verdict.until - now());   // relative: the page's clock is not ours
      if (verdict.kind === 'exists') verdict.literal = !verdict.completed && verdict.path === cands[0].c;   // L6: the text's own first candidate (an absolute / ~ text has one)
      if (verdict.kind === 'absent') { const fa = answers.find((x) => !x.parentAbsent) || answers[0]; if (fa) verdict.missing = { path: fa.path, parentExists: !fa.parentAbsent }; }   // where it would be, and whether the folder above is there
    }
    if (verdict && (verdict.kind === 'late' || verdict.kind === 'skipped' || verdict.kind === 'failed') && !/^[~/]/.test(String(text).trim())) { const j = tAll.findIndex((b) => PC.joinPath(b.path, String(text).trim()) === verdict.path); if (j >= 0) verdict.base = allBases[j]; }   // R-j: the base that did not answer, in the field's own words
    const listed = listR.map(okOf).filter(Boolean);
    // B-5561: THE KIDS' OWN FACTS this answer asks for, behind it (never waited): the folder kids and the symlink kids the rows are about
    const seg = /\s/.test(text) ? '' : String(text).trim().slice(String(text).trim().lastIndexOf('/') + 1).toLowerCase();
    const factAsked = [];
    let kn = 0, ln = 0;
    const askKids = (ds, pre) => {
      for (const d of ds) for (const k of d.kids || []) {
        if (!k.name.toLowerCase().startsWith(pre)) continue;
        const p = path.join(d.path, k.name), isLink = k.link != null;
        if (isLink ? ln >= LINK_FACTS : kn >= KID_FACTS) continue;
        if (askFacts(p)) { factAsked.push(p); if (isLink) ln++; else kn++; }
      }
    };
    /* exactly one folder starts with the typed last segment → list it too (rows: what is inside; Tab goes in) */
    const lastSeg = /\s/.test(text) || !String(text).includes('/') ? '' : String(text).slice(String(text).lastIndexOf('/') + 1).toLowerCase();
    const listedTyped = listed.length;   // (the listings after it: the one match's — its rows are all its kids)
    if (lastSeg) {
      const one = [];
      for (const d of listed) { const hits = (d.kids || []).filter((k) => k.link == null && k.name.toLowerCase().startsWith(lastSeg)); if (hits.length === 1) one.push(path.join(d.path, hits[0].name)); }
      if (one.length) listed.push(...(await Promise.all([...new Set(one)].slice(0, 4).map((p) => rowSource(p, o, () => listOne(p, { files, ...o }))))).map(okOf).filter(Boolean));   // down its chain too (a dead kid is met by its one stat)
    }
    // the probes SENT that this reply does not answer (never marked asked by the field): late / skipped → probesLate, an error → probesFailed
    const state = new Map();
    probes.forEach((a, i) => { const r = auxR[i]; if (r === LATE || (r && r.skipped) || (r && r.failed != null) || (r && 'ok' in r && !r.ok)) state.set(a, 'late'); else { const f = okOf(r); if (f && f.err) state.set(a, 'failed'); } });   // (an answer that omits the probe: late)
    for (const x of cands) if (sentAs.has(x.a)) { const an = answers.find((y) => y.path === x.c); if (!an || an.answer === 'late' || an.answer === 'skipped') state.set(x.a, 'late'); else if (an.answer === 'failed') state.set(x.a, 'failed'); }
    for (const a of sentAs.keys()) if (!candAbs.has(a) && !probes.includes(a)) state.set(a, 'late');
    const named = (st) => [...sentAs].filter(([a]) => state.get(a) === st).flatMap(([, ss]) => ss);
    const probesLate = named('late'), probesFailed = named('failed');
    // a row source still out is LATE (the list: still looking); one a dead folder's mark answered — the pool's deadline ended it, or a dead
    // entrance above it — could NOT BE READ (the list says so; never «no folders»)
    const sourcesLate = [...rowsList.filter((_, i) => listR[i] === LATE), ...roots.filter((_, i) => idxR[i] === LATE)];
    const sourcesUnread = [...rowsList.filter((_, i) => listR[i] && listR[i].skipped), ...roots.filter((_, i) => idxR[i] && idxR[i].skipped)];
    let idx = null, idxPartial = false;
    if (fuzzy) {
      const es = idxR.map(okOf);
      idxPartial = es.some((e) => !e || e.partial);
      if (es.some(Boolean)) { idx = { dirs: [], links: [] }; for (const e of es) if (e) { idx.dirs.push(...e.dirs); idx.links.push(...(e.links || [])); } }
    }
    // the line's own facts land in the listing too (a candidate's stat, a level's «a folder»): its resolution's facts
    const facts = [...answers.flatMap((x) => [x.stat && x.stat.exists ? x.stat : null, x.stat && x.stat.one && x.stat.one.exists ? x.stat.one : null]).filter(Boolean), ...auxR.map(okOf).filter(Boolean)];
    askKids(listed.slice(0, listedTyped), seg); askKids(listed.slice(listedTyped), '');
    const listing = PC.sliceListing({ home, machine: null, dirs: listed.map(withFacts), probes: facts, index: idx, mounts: mountRows.filter((m) => !m.blocked), q: fuzzy });
    const factsLate = factAsked.some((p) => !factOf(p)) || !!(selfCache.missing && selfCache.v === me);
    // `partial`: the verdict NEEDS a source that did not answer (asked again, bounded); a search's rows when an index root is late or cut.
    // `rowsLate`: a source the rows for this text come from did not answer (the list says «still looking», never «no match» — P8)
    const partial = verdict ? verdict.kind === 'late' : !!(fuzzy && idxPartial);
    const rowsLate = sourcesLate.length > 0 || (fuzzy && idxPartial), rowsUnread = sourcesUnread.length > 0;
    return { listing, self: me, took: now() - t0, partial, ...(factsLate ? { factsLate: true } : {}), ...(verdict ? { verdict } : {}), ...(rowsLate ? { rowsLate: true } : {}), ...(rowsUnread ? { rowsUnread: true, sourcesUnread } : {}), ...(probesLate.length ? { probesLate } : {}), ...(probesFailed.length ? { probesFailed } : {}), ...(sourcesLate.length ? { sourcesLate } : {}) };
  }

  return { slice, self, stats: () => ({ noIdle: { ...busy } }), _caches: { listCache, indexCache, known, landed, kidFacts }, _counters: C };
}

module.exports = { create, LIST_FRESH_MS, INDEX_TTL_MS, SELF_TTL_MS, PROBE_LATE_MS, LANDED_FRESH_MS, LINE_SLOTS, ROW_SLOTS, FACT_SLOTS, KID_FACTS, LINK_FACTS };
