'use strict';
// THE FOLDER FIELD'S COLLECTOR (the paired machine's folder listing — 主开发 r1508 / r1515 / r1633 / r1636 / r1651: «THE MACHINE
// COLLECTS, THE HUB SHAPES»). One implementation of every FACT the field's answer needs, run where the facts live: on the hub over its
// SafeFs pool (src/server/dir-slice.js creates one), and on a paired machine over the device agent's own fs worker (src/agentd/agentd.js
// `dir-collect`, capability-gated). It asks only the three disk ops (src/dir-ops.js) through `call`, with its counters, its deadline
// marks, its caches and the kids' facts behind the answer (B-d833 / B-5561 / B-1c27 below, moved here unchanged from dir-slice.js).
// It answers FACTS ONLY, JSON-safe (no identity: a late outcome is `{ late: true }`): the hub's PURE shaper (dir-slice.js shape,
// src/path-candidates.js textVerdict + sliceListing) turns them into the reply for both roads — ranking and the verdict's words never
// ride the device's bundle. What it keeps is MEMORY only (an agent restart forgets it all: the first ask lists, states and walks again;
// a hung folder is met once more, by its one call): the listings 2 s, the bare stats 2 s, the kids' and the probes' facts 30 s, the
// deadline marks 30 s, the index 30 s, the self facts 10 min while the home's time holds. node builtins + PURE src/path-text.js only.
const path = require('path');
const os = require('os');
const PT = require('./path-text.js');
// M1: the pool has no worker free for the call — every worker busy, or every live one looking: asked again inside the bound, never
// «could not be read». WHICH refusal says so is the pool's own word: the creator hands `poolBusy(err)` in (the hub's SafeFs: NO_IDLE /
// NO_WORKER; the device's fs pool: its idle-only refusal and its «no worker»)

const mono = () => performance.now();   // the re-ask's bound: the monotonic clock (a stepped wall clock never widens it)
const LASTING_ERR = /^(ELOOP|ENAMETOOLONG|EACCES|EPERM)$/;   // r2178 (1): the erred facts that cannot heal by themselves
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
   · THE LINE asks STATS ONLY, of the typed chain (R-a): per candidate ONE call (src/dir-ops.js pathStat — a BARE stat; when
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
/* r1633 (主开发, YES): THE LATE-FACTS WAIT — the page's quiet re-ask (marked late on the wire: `plan.late`) WAITS WHERE THE FACTS LIVE
   for the facts already on their way (this answer's kids, the home's self facts, an index walk in flight), at most LATE_WAIT_MS, and
   replies ONCE: what landed, and `factsLate` for the rest. It STARTS NO CALL (a kid not asked yet waits for the next ordinary ask) and
   holds no worker, counter or lock (a promise race): a person's ask is never behind it; a newer ask of the same field ends it at once
   (its `signal`). Later facts are KEPT here for the next ask; the page asks no third time (path-field-model's one quiet re-ask a key). */
const LATE_WAIT_MS = 1000;

/** One collector. `call(op, payload, opts)` = the pool's door (op: dirSlice | pathStat | dirIndex; opts.idleOnly); `home` = this
 *  machine's home; `roots` = the exclusion roots of this instance's own (the hub: its checkout and data dir; a paired machine: none —
 *  the home's checkouts named vibespace are found by their own facts); `mounts()` = the mounted rows ({ path, label, mounted, blocked });
 *  `poolBusy(err)` = the pool refused for no free worker (asked again, never a mark); `log` = the M1 line (once a minute); `walkSkip` =
 *  folders the index walk never enters beside the exclusion and the mounts (a Mac's ~/Library: the sh road's own prune). */
function create({ call, home = os.homedir(), roots: ownRoots = [], walkSkip = [], mounts = () => [], now = Date.now, poolBusy, log = (m) => console.log(m) } = {}) {
  if (typeof poolBusy !== 'function') throw new Error('dir-collect: the pool\'s own busy word (poolBusy) is required');
  const listCache = new Map();   // abs → { at, entry }
  const madeGen = new Map();     // abs → how many folders were made at or under it (r4927): a listing SENT before one keeps nothing
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
  const C = { line: { cap: LINE_SLOTS, busy: 0, q: [] }, rows: { cap: ROW_SLOTS, busy: 0, q: [] }, facts: { cap: FACT_SLOTS, busy: 0, q: [] } };
  const pump = (c) => { while (c.busy < c.cap && c.q.length) c.q.shift()(); };
  const grant = (c) => new Promise((res) => { c.q.push(() => { c.busy++; let held = true; res(() => { if (!held) return; held = false; c.busy--; pump(c); }); }); pump(c); });
  const under = (p, q) => p === q || p.startsWith(q === '/' ? '/' : q + '/');
  const given = (p) => p === home || p === '/' || home.startsWith(p === '/' ? '/' : p + '/');   // the home, the root and the home's ancestors
  const markEnd = (m) => m.hungAt + PROBE_LATE_MS;
  /* the hung ENTRANCE at or above p (the pool's deadline ended its call) — its mark speaks for everything below it */
  function entranceAbove(p, t, except = null) { for (const m of sent.values()) if (m !== except && m.entrance && m.hungAt != null && t - m.hungAt < PROBE_LATE_MS && under(p, m.path)) return m; return null; }
  /* ONE CALL: joined while it is SENT; queued in its asker's counter otherwise; at the grant it joins a call sent by then */
  /* M1 (the coordinator's r1748 must): A JOINED CALL BELONGS TO EVERY ASKER — a press joining the typed ask's call, a level shared by two
     texts. Each asker brings its own bound and its own field's end; the call is asked again while ANY live asker's bound is open, and
     ends LATE only past the latest live bound or once EVERY joined asker's field has ended (an asker with no signal never ends) */
  const queuedAsk = new Map();   // counter + key → the ask group of a call still waiting for its slot
  // (r2178 (2): a join first drops the askers that are done — their field ended, their bound passed —; an asker with no bound and no
  // field (a kid's facts, the exclusion's own re-read) never joins: it can widen nothing)
  const asking = (a) => (a.boundAt > 0 || !!a.signal) && !(a.signal && a.signal.aborted) && !(a.boundAt > 0 && a.boundAt <= mono());
  const joinAsk = (g, boundAt, signal) => { if (!g) return; g.asks = g.asks.filter(asking); const a = { boundAt, signal }; if (asking(a)) g.asks.push(a); };
  const askOpen = (g) => { const live = g.asks.filter((a) => !(a.signal && a.signal.aborted)); return live.length ? live.reduce((m, a) => Math.max(m, a.boundAt || 0), 0) : 0; };
  function once(key, cn, p, run, { entrance = false, born = now(), through = null, boundAt = 0, signal = null }) {
    const t = now(), s0 = sent.get(key);
    if (s0 && s0.hungAt == null && t - s0.at < PROBE_LATE_MS) { joinAsk(s0.ask, boundAt, signal); return s0.p; }
    if (s0 && s0 !== through && s0.hungAt != null && t - s0.hungAt < PROBE_LATE_MS) return Promise.resolve({ skipped: markEnd(s0), at: p });   // its OWN deadline mark: never sent again inside the window
    const qk = cn + '\n' + key;
    if (queued.has(qk)) { joinAsk(queuedAsk.get(qk), boundAt, signal); return queued.get(qk); }
    const ask = { asks: [{ boundAt, signal }].filter(asking) };
    queuedAsk.set(qk, ask);
    const qp = grant(C[cn]).then((free) => {
      queued.delete(qk); queuedAsk.delete(qk);
      const t1 = now(), s1 = sent.get(key);
      if (s1 && s1.hungAt == null) { free(); if (s1.ask) s1.ask.asks.push(...ask.asks); return s1.p; }   // sent by the other counter meanwhile: joined (its askers with it), the slot given back
      // at its GRANT a call is judged again: a mark set while it waited (its own, or a dead entrance above it) and an age nobody waits for
      if (s1 && s1 !== through && s1.hungAt != null && t1 - s1.hungAt < PROBE_LATE_MS) { free(); return { skipped: markEnd(s1), at: p }; }
      const m = entranceAbove(p, t1, through); if (m) { free(); return { skipped: markEnd(m), at: m.path }; }
      if (t1 - born > QUEUE_MAX_MS) { free(); return null; }
      const e = { key, path: p, entrance, at: t1, hungAt: null, p: null, ask };
      // M1: refused for no free worker ⇒ asked again until a worker frees, up to the latest live asker's bound (the monotonic clock) or
      // until every asker's field has ended; a call no bounded asker joined (a kid's facts, behind every answer) is LATE at once
      let reasked = 0;
      const attempt = () => Promise.resolve().then(run).then((r) => { if (reasked) busy.freed++; return r; }, (err) => {
        if (!poolBusy(err)) throw err;
        if (!reasked) busy.refused++;
        if (!(mono() + REASK_MS <= askOpen(ask))) { busy.late++; if (sent.get(key) === e) sent.delete(key); throw err; }   // (r2178 (3): out of `sent` in the same step — no joiner meets a call already ending)
        reasked++; busy.reasked++;
        return new Promise((res) => setTimeout(res, REASK_MS)).then(attempt);
      });
      e.p = attempt().then(
        (r) => { free(); if (sent.get(key) === e) sent.delete(key); return { ok: r }; },
        (err) => { free(); if (sent.get(key) === e) { if (err && err.safeFsTimeout) e.hungAt = now(); else sent.delete(key); } if (poolBusy(err)) return LATE; return { failed: String((err && (err.message || err.code)) || err || 'failed').slice(0, 200) }; });
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
  const noteKnown = (p, st) => { known.set(p, { at: now(), stat: st }); if (known.size > 2000) for (const k of [...known.keys()].slice(0, 500)) known.delete(k); if (st && st.exists) { const kf = kidFacts.get(p); if (kf && kf.f && kf.f.errored) kidFacts.delete(p); } };   // (r2178 (1): a good stat of the path clears its erred fact)
  /* (a LISTING states no kid at all since B-5561 — names and types only —, so it needs no skip list: a known dead folder, a mount, a path
     this ask states by its own call is NAMED by every listing, never crossed) */
  /* B-5561: A KID'S OWN FACTS — kept, and asked behind an answer (never waited for). → true when asked (it may still land) */
  const factOf = (p, t = now()) => { const k = kidFacts.get(p); return k && t - k.at < (k.keep || PROBE_LATE_MS) ? k.f : null; };
  /* the call already on its way for p's ONE key (sent, or queued in any counter) — what a late re-ask may wait on */
  const outFor = (p) => { const s0 = sent.get('stat:' + p); if (s0 && s0.hungAt == null) return s0.p; for (const [k, q] of queued) if (k.endsWith('\nstat:' + p)) return q; return null; };
  function askFacts(p, join = false) {
    const t = now();
    if (factOf(p, t) || mountPaths.includes(p) || entranceAbove(p, t)) return false;   // kept · a mount (named, never stated) · under a dead mark
    if (join) return outFor(p) ? true : 'none';   // r1633 (1): a late re-ask starts none — it joins a call on its way, or names the fact unasked
    // r1748 (b): a facts call that ERRS at once (a stale mount, a link loop, the pool's own refusal by its memory) is kept AS SUCH for
    // the keep time — not asked again at every reply, its late flag settled, its slot never taken from the kids after it. A deadline
    // (its mark) and a busy pool (asked again, or late) are not answers and are not kept
    const keepFact = (f, keep = 0) => { kidFacts.set(p, { at: now(), f, ...(keep ? { keep } : {}) }); if (kidFacts.size > 4000) for (const k of [...kidFacts.keys()].slice(0, 1000)) kidFacts.delete(k); };
    // (r2178 (1): kept the full PROBE_LATE_MS only when it cannot heal by itself — a link loop, a name too long, a permission; a passing
    // error (EIO, ESTALE while a mount comes up, the pool's memory of a hang) keeps a listing's own short time, LIST_FRESH_MS)
    const keepErr = (err) => { const msg = String((err && (err.message || err.code)) || err || 'failed').slice(0, 200), code = (err && err.code) || msg.split(/[:\s]/)[0]; keepFact({ errored: true, exists: false, err: msg }, LASTING_ERR.test(code) ? 0 : LIST_FRESH_MS); };
    once('stat:' + p, 'facts', p, () => call('pathStat', { path: p, facts: true }, IDLE_ONLY).then((x) => {
      const st = x && x.stat;
      if (st && st.facts && !st.err) {
        keepFact(st); noteKnown(p, st);
        if (path.dirname(p) === home) { const h = listCache.get(home); selfFacts.set(p, { at: now(), pkg: st.pkg || null, homeAt: h ? h.entry.mtime : null }); if (selfFacts.size > 2000) for (const k of [...selfFacts.keys()].slice(0, 500)) selfFacts.delete(k); } // S2: the self fact, beside the home's time (capped like the other maps)
      } else if (st && st.err) keepErr(st.err);
      return st;
    }, (err) => { if (!(err && (err.safeFsTimeout || poolBusy(err)))) keepErr(err); throw err; }), { entrance: true, born: t });
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
    const ans = PT.lineAnswerOf(st, { files: o.files });
    return { path: c, ...ans, stat: st, ...(ans.completed ? { completed: PT.toTilde(home, ans.completed) } : {}) };
  }

  /* ── THE ROWS (best effort, their own slot): a folder listed / a path stated / a root walked — each down its chain first ── */
  function listOne(a, { files = false, ...o }) {
    const c = listCache.get(a);
    if (c && (!files || c.entry.files) && now() - c.at < LIST_FRESH_MS) return Promise.resolve({ ok: c.entry });
    return once(`list:${files ? 'f' : ''}:${a}`, 'rows', a, () => {
      const c0 = listCache.get(a), base = c0 && (!files || c0.entry.files) ? c0 : null;   // `same` answers THIS entry
      const g0 = madeGen.get(a) || 0;   // r4927: the folder-made count at the SEND
      // B-1c27: a RACY listing (read within a timestamp tick of the folder's mtime — a kid made in that tick left the mtime as it was)
      // is never kept by its mtime: no `known`, the folder is listed again
      return call('dirSlice', { path: a, dirs: [{ path: a, known: base && !base.entry.racy ? base.entry.mtime : undefined }], files }, IDLE_ONLY).then((r) => {
        const d = ((r && r.dirs) || [])[0] || null;
        if (!d) return null;
        if ((madeGen.get(a) || 0) !== g0) return d;   // r4927: a folder was made in it while this call was out — answered to its asker, never KEPT
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
  function self({ join = false } = {}) {
    const t = now();
    if (selfCache.v && t - selfCache.at < SELF_TTL_MS) return Promise.resolve(selfCache.v);
    // r1633 (1), the fresh read's S8 / N16: a LATE re-ask asks nothing and waits on no listing — the exclusion is read again from the home's
    // KEPT listing (whatever its age) and the kept facts, and never through the ordinary ask's promise (that one asks the facts it lacks)
    if (join) { const h = listCache.get(home); return Promise.resolve(h ? selfOf(h.entry, true) : selfCache.v || { home, roots: [...ownRoots] }); }
    if (selfCache.p) return selfCache.p;
    selfCache.p = Promise.resolve(listOne(home, {})).then((r) => {
      const d = r && r.ok;
      if (!d) { selfCache.p = null; return { home, roots: [...ownRoots] }; }
      return selfOf(d, false);
    });
    return selfCache.p;
  }
  function selfOf(d, join) {
    {
      // each home folder's package.json name is THAT folder's own fact (B-5561: its own call, behind); until every one that can land
      // has, the exclusion is read again at the next ask (the home's listing kept, the facts kept: no call) — never kept a minute short
      // of a checkout
      const roots = [...ownRoots];
      let missing = 0, asked = 0;
      for (const k of d.kids || []) {
        if (k.link != null) continue;
        const p = path.join(home, k.name), sf = selfFacts.get(p);
        // S2: a home folder's own fact stands while the home's time has not moved (a new folder there moves it), at most SELF_KEEP_MS
        if (sf && sf.homeAt === d.mtime && now() - sf.at < SELF_KEEP_MS) { if (sf.pkg === PT.SELF_PACKAGE) roots.push(p); continue; }
        const kf = factOf(p); // a kid's own facts kept for the rows: its self fact too
        if (kf && !kf.errored) { selfFacts.set(p, { at: now(), pkg: kf.pkg || null, homeAt: d.mtime }); if (kf.pkg === PT.SELF_PACKAGE) roots.push(p); continue; }
        // r1748 (a): THE EXCLUSION NEVER SHRINKS — a home folder's fact past its keep STANDS while it is asked again, and while its own
        // call errs (a checkout stays out of the rows until its own fresh fact says it is not one)
        if (sf && sf.pkg === PT.SELF_PACKAGE) roots.push(p);
        if (kf) continue;   // (r1748 (b): its call erred at once — kept as such for the keep time, not asked again)
        if (asked >= SELF_FACTS) { missing++; continue; } // (the rest at the next ask)
        const r = askFacts(p, join); if (r === true) { asked++; missing++; } else if (r === 'none') missing++;   // (a late re-ask asks none: still missing)
      }
      selfCache = { at: missing ? 0 : now(), v: { home, roots: [...new Set(roots)] }, p: join ? selfCache.p : null, missing };
      return selfCache.v;
    }
  }

  /* ONE index root walked (a root on a dead mount is its own source — the home's walk still answers) */
  function indexOne(root, skip, o) {
    const key = root + '\n' + skip.join('\n');
    const c = indexCache.get(key);
    const walk = () => {
      const p = Promise.resolve(once('index:' + key, 'rows', root, () => call('dirIndex', { path: root, roots: [root], depth: 4, max: 6000, budgetMs: 350, skip }, IDLE_ONLY), o)).then((r) => {
        if (r && r.ok) {
          const dirs = r.ok.dirs || [], links = r.ok.links || [], partial = !!r.ok.partial;
          const v = require('crypto').createHash('sha1').update(dirs.join('\n')).update('\0').update(links.map((l) => l.from + '\t' + l.to).join('\n')).update(partial ? '\0p' : '\0w').digest('hex').slice(0, 16);   // its version = its content
          indexCache.set(key, { at: now(), v, dirs, links, partial, p: null });
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

  /* a source's outcome ON THE WIRE (JSON-safe — the shaper never compares identity): late · skipped (its mark's end, THIS machine's
     clock — the hub rebases it) · failed · { ok } (null: not there) · null (no answer of its own) */
  const wireOf = (r) => (r == null ? null : r === LATE || r.late === true ? { late: true } : r.skipped != null ? { skipped: r.skipped, ...(r.at ? { at: r.at } : {}) } : r.failed != null ? { failed: r.failed } : 'ok' in r ? { ok: r.ok == null ? null : r.ok } : null);
  const indexWireOf = (r) => { const w = wireOf(r); return w && w.ok ? { ok: { v: w.ok.v, dirs: w.ok.dirs || [], links: w.ok.links || [], partial: !!w.ok.partial } } : w; };

  /** THE FACTS OF ONE ANSWER, as the hub's plan names them (src/server/dir-slice.js plan — the hub decides WHAT a text asks for; this
   *  collects it where the facts live). plan = { cands: [{ c, a }] (the line's candidates in the bases' order — `c` its `~` form, `a`
   *  absolute), rows: [abs] (the folders listed), probes: [abs], roots: [abs] (the index roots; a search only), fuzzy, files, press,
   *  budgetMs, seg (the typed last segment the rows' kids are asked for), lastSeg (the one-match listing's), late (the page's quiet
   *  re-ask: the late-facts wait), index: { have: { root: version } } (a paired machine's: the version of each root's index the hub holds) }. Bounded as the slice is:
   *  MAX_LIST listings + the one match's 4, every folder cut at its 400 kids (`more`), MAX_PROBES probes, KID_FACTS + LINK_FACTS kids'
   *  facts asked, an index of 6000 folders a root (`partial`). → { home, at, took, me, answers, rows, probes, index, listed, listedTyped,
   *  mounts, factsLate? } — `at` = this machine's clock at the reply (a mark's end is in it), every outcome JSON-safe */
  async function collect(plan = {}, { signal = null } = {}) {
    const t0 = now();
    // M1: what the busy pool cost since the last line — said at most once a minute, only when it moved (a slow hub's next read sees it)
    if (Date.now() - busySaid.at >= 60e3 && (busy.reasked !== busySaid.reasked || busy.late !== busySaid.late)) {
      log(`[dir-slice] the file pool was busy: the folder field asked ${busy.reasked - busySaid.reasked} call(s) again, ${busy.late - busySaid.late} ended late (no idle worker within its reply's bound)`);
      busySaid = { at: Date.now(), reasked: busy.reasked, late: busy.late };
    }
    const late = !!plan.late, have = plan.index && plan.index.have && typeof plan.index.have === 'object' ? plan.index.have : null;
    const files = !!plan.files, budgetMs = plan.budgetMs == null || !Number.isFinite(Number(plan.budgetMs)) ? 450 : Number(plan.budgetMs);
    // the plan's lists keep their places (the hub reads each outcome by its index): a path that is not absolute is asked nothing (null)
    const paths = (v, n) => (Array.isArray(v) ? v : []).slice(0, n).map(String);
    const sure = (p, run) => (p.startsWith('/') ? run() : Promise.resolve(null));
    const cands = (Array.isArray(plan.cands) ? plan.cands : []).filter((x) => x && typeof x.a === 'string' && x.a.startsWith('/')).map((x) => ({ c: String(x.c || x.a), a: x.a }));
    const rowsList = paths(plan.rows, MAX_LIST), probes = paths(plan.probes, MAX_PROBES), fuzzy = !!plan.fuzzy;
    const mountRows = [];
    try { for (const m of mounts() || []) if (m && m.path && m.mounted) mountRows.push({ path: m.path, label: m.label || m.source || m.name || '', blocked: !!m.blocked }); } catch { }
    mountPaths = mountRows.map((m) => m.path);
    for (const [ep, at] of pressed) if (now() - at >= PROBE_LATE_MS) pressed.delete(ep);
    let tm = null;
    const until = new Promise((r) => { tm = setTimeout(() => r(LATE), Math.max(50, budgetMs)); });
    const untilSoft = until.then(() => new Promise((r) => setImmediate(() => r(LATE))));   // an answer already in hand beats the deadline
    const okOf = (r) => (r && r !== LATE && r.ok ? r.ok : null);
    const o = { until, untilSoft, files, press: !!plan.press, budget: Math.max(50, budgetMs), boundAt: mono() + Math.max(50, budgetMs), signal };
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
    const selfP = raceOf(self({ join: late }).then((v) => ({ ok: v })), untilSoft);
    const listP = rowsList.map((p) => sure(p, () => rowSource(p, o, () => listOne(p, { files, ...o }))));
    const auxP = probes.map((a) => sure(a, () => keptProbe(a, o) || rowSource(a, o, () => probeOne(a, o), true)));
    const meR = await selfP;
    const me = okOf(meR) || selfCache.v || { home, roots: [...ownRoots] };
    let roots = [], idxP = [], skip = [];
    if (fuzzy) {
      roots = paths(plan.roots, 13);
      // the WALK's skip — and so the index cache's NAME — holds only what is STABLE: the roots, the mounts, the entrances whose deadline mark is
      // SET (the read of round wc9f6okda: a healthy stat still out made the name differ at each keystroke — the 30 s index missed, «still
      // looking» while typing — and a walk taken meanwhile never entered that healthy folder, «no matching folder» kept 30 s). Calls still
      // out stay in the LISTINGS' skip only.
      const marked = [...sent.values()].filter((m) => m.entrance && m.hungAt != null).map((m) => m.path);
      skip = [...new Set([...me.roots, ...mountPaths, ...marked, ...walkSkip])];
      idxP = roots.map((r) => sure(r, () => rowSource(r, o, () => indexOne(r, skip, o).then((e) => (e && e.dirs ? { ok: e } : null)))));
    }
    const [answers, listR, auxR, idxR] = await Promise.all([lineP, Promise.all(listP), Promise.all(auxP), Promise.all(idxP)]);
    clearTimeout(tm);
    const listed = listR.map(okOf).filter(Boolean);
    // B-5561: THE KIDS' OWN FACTS this answer asks for, behind it (never waited): the folder kids and the symlink kids the rows are about
    const seg = String(plan.seg || '').toLowerCase(), lastSeg = String(plan.lastSeg || '').toLowerCase();
    const factAsked = [];
    let kn = 0, ln = 0;
    const askKids = (ds, pre) => {
      for (const d of ds) for (const k of d.kids || []) {
        if (!k.name.toLowerCase().startsWith(pre)) continue;
        const p = path.join(d.path, k.name), isLink = k.link != null;
        if (isLink ? ln >= LINK_FACTS : kn >= KID_FACTS) continue;
        if (askFacts(p, late) === true) { factAsked.push(p); if (isLink) ln++; else kn++; }
      }
    };
    /* exactly one folder starts with the typed last segment → list it too (rows: what is inside; Tab goes in) */
    const listedTyped = listed.length;   // (the listings after it: the one match's — its rows are all its kids)
    if (lastSeg) {
      const one = [];
      for (const d of listed) { const hits = (d.kids || []).filter((k) => k.link == null && k.name.toLowerCase().startsWith(lastSeg)); if (hits.length === 1) one.push(path.join(d.path, hits[0].name)); }
      if (one.length) listed.push(...(await Promise.all([...new Set(one)].slice(0, 4).map((p) => rowSource(p, o, () => listOne(p, { files, ...o }))))).map(okOf).filter(Boolean));   // down its chain too (a dead kid is met by its one stat)
    }
    askKids(listed.slice(0, listedTyped), seg); askKids(listed.slice(listedTyped), '');
    let meNow = me;
    if (late) {
      const keyOf = (r) => r + '\n' + skip.join('\n');
      const selfOut = selfCache.missing ? (((listCache.get(home) || {}).entry || {}).kids || []).filter((k) => k.link == null).map((k) => path.join(home, k.name)).filter((p) => !factOf(p)).map(outFor) : [];
      const walks = roots.map((r, i) => { const e = idxR[i] === LATE ? indexCache.get(keyOf(r)) : null; return e && e.p ? e.p : null; });
      const waits = [...factAsked.filter((p) => !factOf(p)).map(outFor), ...selfOut, ...walks].filter(Boolean);
      if (waits.length && !(signal && signal.aborted)) {
        await new Promise((res) => {
          const end = () => { clearTimeout(tw); if (signal) signal.removeEventListener('abort', end); res(); };
          const tw = setTimeout(end, LATE_WAIT_MS);
          if (signal) signal.addEventListener('abort', end, { once: true });
          Promise.allSettled(waits).then(end);
        });
      }
      // what landed — waited on or landed before the wait began (the fresh read's S11): the self facts read again from what is kept (no
      // call), a walk that ended taken from its cache
      meNow = await self({ join: true });
      roots.forEach((r, i) => { if (idxR[i] !== LATE) return; const e = indexCache.get(keyOf(r)); if (e && e.dirs) idxR[i] = { ok: e }; });
    }
    // r1651 (a)/(b): THE INDEX ON THE WIRE (a paired machine: the plan names the version the hub holds, `index.have`) — the same version
    // answers «the same» in a few bytes; a newer one is NEVER in front of the line and the rows: the ordinary reply says it is held here
    // (`held`, and `factsLate`: the page asks once more, quietly) and the late re-ask carries it. The hub's own road (no `have`) gets it whole
    let held = false;
    const indexOut = idxR.map((r, i) => {
      const w = indexWireOf(r);
      if (!have || !w || !w.ok) return w;
      if (have[roots[i]] === w.ok.v) return { ok: { same: true, v: w.ok.v, partial: w.ok.partial } };
      if (!late) { held = true; return { ok: { held: true, v: w.ok.v, partial: w.ok.partial } }; }
      return w;
    });
    const factsLate = held || factAsked.some((p) => !factOf(p)) || !!(selfCache.missing && selfCache.v === meNow);
    return { home, at: now(), took: now() - t0, me: meNow, answers, rows: listR.map((r) => { const w = wireOf(r); return w && w.ok ? { ok: true } : w; }), probes: auxR.map(wireOf), index: indexOut, listed: listed.map(withFacts), listedTyped, mounts: mountRows, ...(factsLate ? { factsLate: true } : {}) };
  }

  /** r1748 (a): the exclusion WHOLE — self() asked again while any home folder's fact is still out, inside `boundMs` (the monotonic
   *  clock). → { v, whole } — `whole: false` = a fact was still out at the bound (a caller that keeps an answer must not keep this one) */
  async function selfWhole(boundMs = 1500, signal = null) {
    const until = mono() + Math.max(0, boundMs);
    for (;;) {
      const v = await self();
      if (!selfCache.missing && selfCache.v === v) return { v, whole: true };
      if (mono() >= until || (signal && signal.aborted)) return { v, whole: false };   // (r2178 (4): the request's own end stops the wait)
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  // THE FOLDER-MADE DOOR (主开发 r4927 — the folder picker's leg 11, lane mask-value-shape): the collector's ONE invalidation of what it
  // keeps. A folder made at `p` (a make-folder that may make its parents too, mkdir -p) DROPS the kept listing of every folder above it
  // and of `p` itself, and the made path's own kept facts (its bare stat, its row probe, its kid facts), so the next ask lists them
  // again — never the kept rows of before the folder was made (LIST_FRESH_MS: a parent listed under 2 s before named no new folder);
  // a listing of one of them already OUT at that moment is answered to its asker but never kept, and no later ask joins it.
  // The hub's make-folder route calls it on the hub's collector (src/routes/files.js → src/server/dir-slice.js), and a paired
  // machine's agent on its own after its fs op made the folder (src/agentd/agentd.js): ONE implementation, both sides. Map deletes
  // only — nothing is asked, nothing waits; the folder index (30 s, the search) is not dropped here. → how many entries it dropped
  function folderMade(p) {
    const s = String(p == null ? '' : p);
    if (!s || !path.isAbsolute(s)) return 0;
    const a = path.resolve(s);
    let n = 0;
    for (const m of [known, landed, kidFacts]) if (m.delete(a)) n++;
    for (let d = a; ; d = path.dirname(d)) {
      if (listCache.delete(d)) n++;
      madeGen.set(d, (madeGen.get(d) || 0) + 1);   // a listing of it already OUT lands answered, never kept
      for (const k of [`list::${d}`, `list:f:${d}`]) { const e = sent.get(k); if (e && e.hungAt == null) sent.delete(k); }   // …and no new ask joins it (a hung call's mark stays: one dead path, one call)
      if (path.dirname(d) === d) break;
    }
    if (madeGen.size > 4000) madeGen.clear();
    return n;
  }
  return { collect, self, selfWhole, folderMade, stats: () => ({ noIdle: { ...busy } }), _caches: { listCache, indexCache, known, landed, kidFacts, sent }, _counters: C };
}

/** r1651 (the collect's reply: 4 MiB the HARD cap): the facts measured as they will be sent; over `cap` they are CUT, and every cut is
 *  said so the hub never shapes a cut answer as whole — the index first (its largest roots cut from their ends, `partial` + `cut`: the
 *  search's rows «still looking»), then the one-match listings (`cut`: the rows late), then the largest listings' kids and files
 *  (`more`: the page decides no absence from it, B-0f3d), then the probes' facts (late). CUT BY ARITHMETIC (the fresh read's S6: this
 *  runs on the agent's loop): each item is measured once, the whole once before and once after — never a measure per step. A copy; the
 *  facts under the cap come back as they are. */
/** r2974: does this answer still MISS something a reply promised (a line's verdict, a row, a probe, an index root or a kid's fact still
 *  late)? A machine whose collector cannot serve refuses such an answer by name — the hub's release road answers it whole */
function incomplete(F) {
  if (!F || typeof F !== 'object') return true;
  const late = (x) => !!x && x.late === true;
  return (F.answers || []).some((a) => a && a.answer === 'late') || (F.rows || []).some(late) || (F.probes || []).some(late) || (F.index || []).some(late) || F.factsLate === true;
}
const COLLECT_CAP_BYTES = 4 * 1024 * 1024 - 64 * 1024;   // the op's answer cap (answer-caps 'dir-collect', 4 MiB) less the line's own envelope
function cutToCap(facts, cap = COLLECT_CAP_BYTES) {
  const bytes = (x) => Buffer.byteLength(JSON.stringify(x === undefined ? null : x));
  const total = facts ? bytes(facts) : 0;
  if (!facts || total <= cap) return facts;
  const f = { ...facts, cut: true, index: (Array.isArray(facts.index) ? facts.index : []).slice(), listed: (Array.isArray(facts.listed) ? facts.listed : []).slice() };
  let over = total + 16 - cap;
  // how many of a list's first items to keep so that at least `need` bytes leave (each item's cost: its JSON + its comma)
  const keepFor = (items, need) => { let k = items.length, freed = 0; while (k > 0 && freed < need) { k--; freed += bytes(items[k]) + 1; } return { k, freed }; };
  const bySize = (arr, of) => arr.map((x, i) => ({ i, n: (of(x) || []).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  for (const { i } of bySize(f.index, (r) => r && r.ok && r.ok.dirs)) {   // 1. the index
    if (over <= 0) break;
    const o = f.index[i].ok, { k, freed } = keepFor(o.dirs, over);
    f.index[i] = { ok: { ...o, dirs: o.dirs.slice(0, k), partial: true, cut: true } }; over -= freed - 24;
  }
  if (over > 0 && f.listed.length > (f.listedTyped || 0)) { over -= bytes(f.listed.slice(f.listedTyped || 0)); f.listed = f.listed.slice(0, f.listedTyped || 0); }   // 2. the one-match listings
  for (const key of ['kids', 'files']) for (const { i } of bySize(f.listed, (d) => d && d[key])) {   // 3. the listings' kids, then their files
    if (over <= 0) break;
    const d = f.listed[i], { k, freed } = keepFor(d[key], over);
    f.listed[i] = { ...d, [key]: d[key].slice(0, k), more: true }; over -= freed - 16;
  }
  if (over > 0) f.probes = (Array.isArray(f.probes) ? f.probes : []).map((r) => (r && r.ok ? { late: true } : r));   // 4. the probes' facts
  // the arithmetic checked ONCE; a margin it missed (escapes counted twice, a field it never saw) halves the largest part again, bounded
  for (let g = 0; g < 6 && bytes(f) > cap; g++) {
    const ix = bySize(f.index, (r) => r && r.ok && r.ok.dirs)[0], ls = bySize(f.listed, (d) => d && d.kids)[0];
    if (ix) { const o = f.index[ix.i].ok; f.index[ix.i] = { ok: { ...o, dirs: o.dirs.slice(0, Math.floor(o.dirs.length / 2)), links: [], partial: true, cut: true } }; }
    else if (ls) { const d = f.listed[ls.i]; f.listed[ls.i] = { ...d, kids: d.kids.slice(0, Math.floor(d.kids.length / 2)), ...(Array.isArray(d.files) ? { files: [] } : {}), more: true }; }
    else { f.probes = (f.probes || []).map((r) => (r && r.ok ? { late: true } : r)); f.answers = (f.answers || []).map((a) => { const { stat, ...rest } = a || {}; return rest; }); }
  }
  return f;
}

/** ONE DEAD THING, ONE CALL — the hub pool's own law (src/safe-fs.js B-23e5) for a pool that keeps no path memory of its own (the device
 *  agent's fs pool: the fresh read's MUST — each re-ask of a dead folder after the collector's 30 s mark would park one more thread in
 *  the kernel until the pool's slots are gone, and then every Files op of that machine fails). A path whose call the pool's DEADLINE
 *  ended is remembered `ms` (30 s), twice as long each time it ends a worker again (at most `capX` ×); a call naming it — a listing or a
 *  walk EXACTLY, a single path's stat AT OR UNDER it (never the root, the home or a folder above it) — is refused BY NAME before any
 *  worker (code path-hung, as the hub's pool refuses it: the collector reads it alike on both roads); a call that lands forgets it.
 *  → { refusal(op, payload) → Error | null, deadline(op, payload), landed(op, payload), size() } */
function hungMemory({ home = os.homedir(), ms = 30000, keep = 256, capX = 16, now = Date.now } = {}) {
  const hung = new Map();   // path → { until, ms, exact }
  const given = (x) => x === '/' || x === home || home.startsWith(x === '/' ? '/' : x + '/');
  const targetOf = (op, p = {}) => {
    const t = String((op === 'dirIndex' ? (Array.isArray(p.roots) && p.roots[0]) || p.path : op === 'dirSlice' ? (Array.isArray(p.dirs) && p.dirs[0] && p.dirs[0].path) || (Array.isArray(p.probes) && p.probes[0]) || p.path : p.path) || '');
    return t ? { path: t, exact: op !== 'pathStat' || given(t) } : null;
  };
  return {
    refusal(op, payload) {
      const tg = targetOf(op, payload), t = now();
      if (tg) for (const [hp, h] of hung) if (h.until > t && (tg.path === hp || (!h.exact && tg.path.startsWith(hp === '/' ? '/' : hp + '/')))) {
        const left = h.until - t;
        return Object.assign(new Error(`this folder or file did not answer in time and is not asked again for ${Math.max(1, Math.ceil(left / 1000))} s: ${hp}`), { code: 'path-hung', hungPath: hp, retryMs: left });
      }
      return null;
    },
    deadline(op, payload) {
      const tg = targetOf(op, payload); if (!tg) return;
      const prev = hung.get(tg.path), m = prev ? Math.min(ms * capX, prev.ms * 2) : ms;
      hung.delete(tg.path); hung.set(tg.path, { until: now() + m, ms: m, exact: tg.exact });
      if (hung.size > keep) hung.delete(hung.keys().next().value);
    },
    landed(op, payload) { const tg = targetOf(op, payload); if (tg) hung.delete(tg.path); },
    size: () => hung.size,
  };
}

module.exports = { create, cutToCap, incomplete, COLLECT_CAP_BYTES, hungMemory, LATE_WAIT_MS, IDLE_ONLY, LIST_FRESH_MS, INDEX_TTL_MS, SELF_TTL_MS, MAX_LIST, MAX_PROBES, PROBE_LATE_MS, LANDED_FRESH_MS, LINE_SLOTS, ROW_SLOTS, FACT_SLOTS, KID_FACTS, LINK_FACTS };
