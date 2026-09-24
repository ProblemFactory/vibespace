'use strict';
/**
 * ledger-slot-backfill.js — THE ONE-SHOT RE-KEY of the permanent usage ledger
 * rows that the OTel-observed org attributed (B-f69c ②, owner decision
 * ut-1c6c15a2db ②; run by migration `2026-09-backfill-ledger-by-slot`).
 *
 * WHAT WENT WRONG. From 2.361.0 (2026-08-19) until the 2026-09-07 attribution
 * law, two OTel paths decided which ACCOUNT a ledger row was billed to:
 *   (a) `truthLookup(rid)` overrode the bake: a row whose request id the CLI's
 *       own `api_request` telemetry had named was baked with that telemetry's
 *       `organization.id` — the identity the CLI cached at SPAWN, not the
 *       credential slot the request was sent with;
 *   (b) corrective attribution entries: when the observation disagreed with
 *       the by-time walk, `recordAttribution({sid, acct: observed, pool, ts})`
 *       appended the observed org to `attribution.ndjson`, so every later bake
 *       of that conversation (and every re-bake) inherited it.
 * The 2026-09-07 change unwired both going forward; the readings-by-slot repair
 * only reached entries a DEAD member could date. The rows themselves still say
 * "the account this conversation started on" for every hot-switched turn.
 *
 * WHAT MAKES A ROW A CANDIDATE — evidence, never inference. Only a row billed
 * THROUGH A POOL can be one: a session with no pool reads one credential dir
 * for its whole life, so its observed org IS its slot by construction (the
 * refuted mechanism needs a re-point to lie). Such a row is touched only when
 * the OTel path demonstrably wrote its account:
 *   · the OTel stash (`usage-history/otel-truth.ndjson`, append-only, kept
 *     offline for exactly this) names the row's rid with a KNOWN org and that
 *     org's account IS the row's account (path a), or
 *   · the attribution entry governing the row at its instant is a CORRECTIVE
 *     one and names the row's account (path b). A corrective entry is
 *     recognised by the one spelling its writer used: same sid + same account
 *     as a stash observation, and `ts` equal to that observation's own `ts`
 *     or to the sid's previous entry + 1 ms (`Math.max(now, lastTs + 1)`).
 *     `recordUsageAttribution` stamps `Date.now()`, so a coincidence to the
 *     millisecond is not a thing that happens.
 * Every other row is UNTOUCHED — including rows that disagree with the walk
 * for some other reason (that is not this migration's evidence to act on).
 *
 * WHICH SLOT HELD THE SESSION — two rungs, strongest first:
 *   ① the SLOT-TRANSITION LEDGER (`data/slot-transitions.jsonl`): the
 *      session-scoped row at or before the row's instant, through the same
 *      session-meta join the readings repair uses (conversation id → every
 *      webui key that could have carried it). A pool-default answer is not
 *      evidence about a conversation that may have had its own link (the
 *      ledger's "unknown, never agreement" contract).
 *   ② the CLEANED WALK: the conversation's own attribution entries with the
 *      corrective ones removed = `recordUsageAttribution`'s record of where
 *      its credential link pointed (it resolves the per-session link at
 *      record time and the engine re-records after every re-point). This is
 *      the rule every row baked since 2026-09-07 already follows.
 * Then the reading-window doctrine's own rules (src/reading-lag.js,
 * src/reading-repair.js) may still REFUSE the answer:
 *   · the LAG SHADOW (`decideLagShadow`): a response that arrives inside
 *     SHADOW_MS of a re-point may have been requested with the PREVIOUS
 *     slot's token. A ledger row carries no window to decide it, so where the
 *     rule answers `no-evidence` the row is unprovable;
 *   · a DEAD SLOT (`deathMarkers` / `isForeign`): a member whose credential
 *     file dates its own death cannot have answered anything after it.
 * A row whose slot record names its OWN account is CONFIRMED before any of
 * that is asked: it was not mis-attributed, and the shadow question belongs
 * to every row of the ledger, not to this migration.
 * Unprovable rows are ARCHIVED with a per-row reason (data/archive/, verbatim)
 * and leave the live ledger — the owner's rule: never a guess. Re-keyed rows
 * keep every token and gain `slotRekeyedBy` (+ `slotRekeyedFrom`) so a second
 * run, and the usage-history re-bake, leave them alone.
 *
 * THE ESTIMATOR. The learned rates are derived from ledger COST between two
 * readings of an identity, so every identity whose account lost or gained a
 * row is re-learned from the repaired ledger (the estimator's own
 * `ratesFor`, which recomputes every pair's cost from the live ledger — the
 * anchors' frozen `costSince` is only a presence gate there, so nothing is
 * voided); the previous `rates.json` entries are archived first.
 *
 * RULES (the migration-runner contract): archive before rewrite, atomic
 * rewrites (tmp + rename), idempotent (a second run finds nothing), a failure
 * is loud and retried next boot. Zero vendor calls: local files only.
 */
const fs = require('fs');
const path = require('path');
const { decideLagShadow } = require('./reading-lag.js');
const { deathMarkers, isForeign, _sessionKeyMap, sessionKeysFor } = require('./reading-repair.js');

const PRE_FIRST_GRACE_MS = 10 * 60 * 1000; // usage-history `_acctAt`: spawn-ordering skew before the first entry

function _readJson(fp) { try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; } }
function _writeAtomic(fp, text) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp + '.tmp', text);
  fs.renameSync(fp + '.tmp', fp);
}
/** Append-only archive; THROWS on failure — an unarchived row must never leave
 *  its store (the caller rewrites only after this returned). */
function _appendArchive(archiveDir, name, rows, seen = null) {
  // `seen` = what EARLIER passes archived — never grown here: two identical
  // rows the ledger genuinely holds are two rows leaving it, so both are archived
  if (seen) rows = rows.filter((r) => { const k = _archKey(r); return !k || !seen.has(k); });
  if (!rows.length) return;
  _appendLines(archiveDir, name, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
/** Append complete lines — after a TORN tail (quota r3: an ENOSPC / short
 *  write left a fragment with no newline) the fragment is closed first, so it
 *  can never swallow the first line of this append. THROWS on failure. */
function _appendLines(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name);
  let torn = false;
  try {
    const size = fs.statSync(fp).size;
    if (size > 0) { const fd = fs.openSync(fp, 'r'); try { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); torn = b[0] !== 0x0a; } finally { fs.closeSync(fd); } }
  } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
  fs.appendFileSync(fp, (torn ? '\n' : '') + text);
}
const _iso = (ms) => { try { return new Date(ms).toISOString(); } catch { return String(ms); } };

/** The identity of one archive line — what "this row was already archived"
 *  means across a retry (quota r2). */
function _archKey(a) {
  if (!a || typeof a !== 'object') return null;
  const e = a.entry || {};
  if (a.store === 'usage-history') return `uh|${a.file || ''}|${e.rid || ''}|${e.mid || ''}|${e.ts || ''}|${e.sid || ''}`;
  if (a.store === 'attribution') return `at|${e.sid || ''}|${e.ts === undefined ? '' : e.ts}|${e.acct ?? ''}`;
  if (a.store === 'usage-anchors/rates.json') return `rt|${JSON.stringify(e)}`;
  return null;
}
const _isRekeyLine = (a) => a.action ? a.action === 'rekeyed' : /re-keyed to /.test(String(a.reason || ''));
/** What earlier passes of THIS migration left in data/archive/ (quota r2, the
 *  r2 verifier's crash probe): a pass killed between an archive append and
 *  the rewrite it guards leaves its lines behind, and the runner retries the
 *  whole migration next boot. `keys` = every line this id ever wrote (the
 *  append skips them — an archived row is archived ONCE); `open` = the lines
 *  after the last pass that FINISHED (a `store:'pass'` marker) — non-empty
 *  means this pass RESUMES a crashed one, whose repair counts and touched
 *  accounts are this pass's too. */
function readPriorArchive(archiveDir, id) {
  const keys = new Set();
  let open = [], lastComplete = null, unparseable = 0;
  let names = []; try { names = fs.readdirSync(archiveDir).filter((f) => /^ledger-by-slot-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort(); } catch { }
  for (const f of names) {
    let text = ''; try { text = fs.readFileSync(path.join(archiveDir, f), 'utf-8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let a; try { a = JSON.parse(line); } catch { unparseable++; continue; } // a torn tail (quota r3) — counted, never guessed at
      if (!a || a.migration !== id) continue;
      if (a.store === 'pass') { open = []; lastComplete = a; continue; }
      const k = _archKey(a);
      if (k) keys.add(k);
      open.push(a);
    }
  }
  // `lastComplete` (quota r3) = the newest FINISHED pass's marker: a pass that
  // finished but whose runner never recorded the id (killed between the
  // marker and migrations.json) is recovered from it, never reported as 0 / 0
  return { keys, open, lastComplete, unparseable };
}

/** The OTel stash, read back: rid → {acct, sid, ts} for KNOWN orgs only (an
 *  unknown org was never baked — `truthLookup` answered undefined for it), and
 *  sid → [{acct, ts}] for the corrective-entry test. */
function readOtelStash(historyDir) {
  const byRid = new Map(), bySid = new Map();
  let rows = 0;
  let text = ''; try { text = fs.readFileSync(path.join(historyDir, 'otel-truth.ndjson'), 'utf-8'); } catch { return { byRid, bySid, rows }; }
  for (const line of text.split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (!r || !r.acctKnown || !r.rid) continue;
    rows++;
    const acct = r.acct ?? null; // `truth.set(rid, r.acct ?? null)` — null = the machine login
    if (!byRid.has(r.rid)) byRid.set(r.rid, { acct, sid: r.sid || null, ts: Number(r.ts) || 0 });
    if (r.sid) { const l = bySid.get(r.sid) || []; l.push({ acct, ts: Number(r.ts) || 0 }); bySid.set(r.sid, l); }
  }
  return { byRid, bySid, rows };
}

/** attribution.ndjson → per sid, entries sorted by ts, each tagged
 *  `corrective` when its writer can only have been the OTel corrective path. */
function readAttribution(historyDir, stashBySid) {
  const fp = path.join(historyDir, 'attribution.ndjson');
  let text = null; try { text = fs.readFileSync(fp, 'utf-8'); } catch { }
  const lines = [], bySid = new Map();
  if (text == null) return { fp, exists: false, lines, bySid };
  for (const raw of text.split('\n')) {
    if (!raw) continue;
    let e = null; try { e = JSON.parse(raw); } catch { }
    const rec = { raw, e, corrective: false };
    lines.push(rec);
    if (e && e.sid) { const l = bySid.get(e.sid) || []; l.push(rec); bySid.set(e.sid, l); }
  }
  for (const [sid, list] of bySid) {
    list.sort((a, b) => (Number(a.e.ts) || 0) - (Number(b.e.ts) || 0));
    const obs = stashBySid.get(sid) || [];
    if (!obs.length) continue;
    for (let i = 0; i < list.length; i++) {
      const e = list[i].e, ts = Number(e.ts) || 0, acct = e.acct ?? null;
      if (e.repairedBy) continue; // the readings repair already re-attributed it from a slot record
      const prevTs = i > 0 ? (Number(list[i - 1].e.ts) || 0) : null;
      const hit = obs.some((o) => o.acct === acct && o.ts > 0 && (o.ts === ts || (prevTs != null && ts === prevTs + 1 && o.ts <= ts)));
      if (hit) list[i].corrective = true;
    }
  }
  return { fp, exists: true, lines, bySid };
}

/** The walk at `ts` over one sid's entries (usage-history `_acctAt`, minus the
 *  session-meta fallback — a fallback is not a slot record). Returns the
 *  governing entry and its predecessor, or null. */
function walkAt(list, ts) {
  if (!list || !list.length) return null;
  let gi = -1;
  for (let i = 0; i < list.length; i++) { if ((Number(list[i].e.ts) || 0) <= ts) gi = i; else break; }
  if (gi < 0) {
    if (ts >= (Number(list[0].e.ts) || 0) - PRE_FIRST_GRACE_MS) gi = 0; else return null;
  }
  return { entry: list[gi].e, prev: gi > 0 ? list[gi - 1].e : null };
}

/** Members whose credential files can date their own death, read straight off
 *  disk (this runs before any AccountManager exists) — the readings-by-slot
 *  migration's roster, including the long-lived-token half. */
function membersOffDisk(dataDir) {
  const subsDir = path.join(dataDir, 'subs');
  const oat = {};
  for (const a of (_readJson(path.join(dataDir, 'accounts.json'))?.accounts || [])) if (a && a.id && a.oatEnc && a.oatMintedAt) oat[a.id] = Number(a.oatMintedAt) || 0;
  const out = [];
  let names = []; try { names = fs.readdirSync(subsDir); } catch { return out; }
  for (const d of names) {
    if (!/^sub-[\w-]+$/.test(d)) continue;
    try { if (fs.lstatSync(path.join(subsDir, d)).isSymbolicLink()) continue; } catch { continue; }
    out.push({ id: d, backend: 'claude', credsPath: path.join(subsDir, d, '.credentials.json'), oatMintedAt: oat[d] || null });
  }
  return out;
}

/** The transition ledger, indexed ONCE: sessionId → its rows by time, and the
 *  pool-default rows by pool. `SlotTransitions.slotAt` walks the whole file per
 *  question, and this migration asks one question per candidate row (hundreds
 *  of thousands on a busy instance) — the same answer, from an index. */
function indexTransitions(rows) {
  const own = new Map(), dflt = new Map();
  for (const r of rows || []) {
    if (!r || !r.to || !Number.isFinite(r.at)) continue;
    const m = r.sessionId ? own : dflt, k = r.sessionId || (r.poolId || '');
    const l = m.get(k) || []; l.push(r); m.set(k, l);
  }
  for (const m of [own, dflt]) for (const l of m.values()) l.sort((a, b) => a.at - b.at);
  return { own, dflt };
}
/** `slotAt`'s session-scoped half over the index: the latest own row of any of
 *  `keys` at or before `ts` (a row of another pool never answers). */
function ownLedgerRow(idx, keys, ts, poolId) {
  let best = null;
  for (const k of keys) {
    const list = idx.own.get(k);
    if (!list) continue;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].at <= ts) lo = mid + 1; else hi = mid; }
    for (let i = lo - 1; i >= 0; i--) {
      const r = list[i];
      if (poolId && r.poolId && r.poolId !== poolId) continue;
      if (!best || r.at >= best.at) best = r;
      break;
    }
  }
  return best;
}

/** The slot-ledger `why`s that START a session's link (accounts.js: the spawn
 *  path passes 'spawn', ensureSessionPoolLink's default is 'session-link') —
 *  every other why is a re-point with a lag shadow. */
const FIRST_LINK_WHYS = new Set(['spawn', 'session-link']);
/** The slot that held `row`'s session at `row.ts`: `{slot, rung, repointAt,
 *  prevSlot}` or `{why}` when no slot record names one. prevSlot: undefined =
 *  no earlier slot on record (a spawn, a first link); null = the machine
 *  login; a string = the member the link left. */
function slotRecordFor(row, { keyMap, ledIdx, cleanBySid }) {
  const ts = Number(row.ts) || 0;
  // ① the transition ledger, session-scoped only
  const keys = sessionKeysFor(keyMap, row.sid, ts);
  const led = keys.length ? ownLedgerRow(ledIdx, keys, ts, row.pool || null) : null;
  // prevSlot by the row's WHY, never by `from`'s truthiness (quota r1): the
  // ledger spells "no earlier slot" and "the machine login / a member whose
  // record is gone" alike (`from: null`), and a spawn records `from` = the
  // pool default read BEFORE its link existed. A spawn (or a first link) has
  // no in-flight request on any earlier token ⇒ undefined; every re-point
  // names what it left, null = the machine login ('__global__' in the shadow
  // rule), exactly as the walk rung's predecessor entry does.
  if (led) return { slot: led.to, rung: 'slot-ledger', repointAt: led.at, prevSlot: FIRST_LINK_WHYS.has(led.why) ? undefined : (led.from ?? null) };
  // ② the cleaned walk
  const w = walkAt(cleanBySid.get(row.sid), ts);
  if (!w) {
    const d = (ledIdx.dflt.get(row.pool || '') || []).some((r) => r.at <= ts);
    return { why: d ? 'only the POOL DEFAULT answers in the slot ledger and the conversation has no attribution entry of its own once the OTel corrective entries are set aside' : 'no slot transition and no attribution entry of its own once the OTel corrective entries are set aside' };
  }
  if (row.pool && w.entry.acct == null) return { why: `its attribution entry at ${_iso(Number(w.entry.ts))} could not resolve the pool's target (recorded as the machine login), so no member is named` };
  return { slot: w.entry.acct ?? null, rung: 'walk', repointAt: Number(w.entry.ts) || 0, prevSlot: w.prev ? (w.prev.acct ?? null) : undefined };
}

/** May the slot record re-key a row that currently says something else? The
 *  reading-window rules may still refuse: `{why}` = refused, null = proven. */
function refusalFor(row, rec, markers) {
  const ts = Number(row.ts) || 0;
  // THE LAG SHADOW (reading-lag ①): a response that lands inside the shadow of
  // a re-point may have been requested with the previous slot's token, and a
  // ledger row states no window to tell them apart.
  if (rec.prevSlot !== undefined && rec.prevSlot !== rec.slot) {
    const G = '__global__';
    const lag = decideLagShadow({ prevKey: rec.prevSlot || G, newKey: rec.slot || G, repointAgeMs: ts - rec.repointAt });
    if (lag.why === 'no-evidence') return { why: `${Math.round((ts - rec.repointAt) / 1000)} s after the re-point ${rec.prevSlot || 'machine login'} → ${rec.slot || 'machine login'} (${rec.rung}) — inside the lag shadow, where an in-flight request may still carry the previous slot's token and the row states no window to decide it` };
  }
  if (rec.slot && isForeign(markers, rec.slot, ts)) {
    const m = markers.get(rec.slot);
    return { why: `the ${rec.rung} names ${rec.slot}, whose login was ${m.state} at ${_iso(m.since)} — before this request` };
  }
  return null;
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {string} o.id              the migration id (stamped on every archive line and re-keyed row)
 * @param {object} [o.transitions]   a SlotTransitions instance (built from dataDir when omitted)
 * @param {Array}  [o.members]       [{id, credsPath, backend, oatMintedAt}] (read off disk when omitted)
 * @param {Array}  [o.accounts]      the roster records (accounts.json when omitted) — row labels only
 * @param {boolean}[o.relearn=true]  re-learn the estimator rates of the touched identities
 * @param {number} [o.now]
 */
function backfillLedgerBySlot({ dataDir, id, transitions = null, members = null, accounts = null, relearn = true, now = Date.now() }) {
  const t0 = Date.now();
  const historyDir = path.join(dataDir, 'usage-history');
  const archiveDir = path.join(dataDir, 'archive');
  const day = _iso(now).slice(0, 10);
  const archiveName = `ledger-by-slot-${day}.ndjson`;
  const report = {
    rows: 0, candidates: 0, rekeyed: 0, archived: 0, untouched: 0, confirmed: 0,
    byRung: { 'slot-ledger': 0, walk: 0 }, archivedWhy: { 'lag-shadow': 0, 'no-slot-record': 0, 'dead-slot': 0, 'pool-target-unresolved': 0 },
    stash: 0, corrective: 0, shards: 0, identities: [], relearned: 0, ms: 0,
    // the WHOLE repair (quota r2): this pass plus a crashed pass it resumes —
    // what the notice and the ledger report state; the counts above are this
    // pass's own work
    total: { rekeyed: 0, archived: 0, corrective: 0 }, resumed: false, anchorKeySpellings: [],
  };
  const stash = readOtelStash(historyDir);
  report.stash = stash.rows;
  if (!stash.rows) { report.ms = Date.now() - t0; return report; } // nothing on this instance was ever attributed by OTel
  if (!transitions) { const { SlotTransitions } = require('./slot-transitions.js'); transitions = new SlotTransitions({ dataDir }); }
  const markers = deathMarkers(members || membersOffDisk(dataDir), { now });
  const roster = accounts || (_readJson(path.join(dataDir, 'accounts.json'))?.accounts || []).filter((a) => a && a.id);
  const labelOf = (acct) => {
    if (!acct) return { atype: 'global', aname: null };
    const a = roster.find((x) => x.id === acct);
    return a ? { atype: a.backend === 'codex' ? 'codex-subscription' : a.type, aname: a.name || null } : { atype: 'unknown', aname: null };
  };
  const attrib = readAttribution(historyDir, stash.bySid);
  const cleanBySid = new Map();
  for (const [sid, list] of attrib.bySid) cleanBySid.set(sid, list.filter((x) => !x.corrective));
  const keyMap = _sessionKeyMap(dataDir);
  const ledIdx = indexTransitions(transitions.all());
  const touchedAccts = new Set();
  // a crashed earlier pass (quota r2): its archived lines are never appended
  // twice, and its counts and touched accounts are this pass's too
  const prior = readPriorArchive(archiveDir, id);
  const seen = prior.keys;
  // per kind: key → [lines a crashed pass left, rows this pass found]; the
  // whole repair counts max(prior, this) per key — a row the retry re-found is
  // one row, a row the ledger genuinely holds twice stays two
  const tot = { rekeyed: new Map(), archived: new Map(), corrective: new Map() };
  const bump = (m, k, i) => { const v = m.get(k) || [0, 0]; v[i]++; m.set(k, v); };
  const sumMax = (m) => { let n = 0; for (const [a, b] of m.values()) n += Math.max(a, b); return n; };
  report.resumed = prior.open.length > 0;
  if (prior.unparseable) { report.archiveUnparseable = prior.unparseable; console.warn(`[migrate] ledger-by-slot: ${prior.unparseable} unparseable line(s) in data/archive/ledger-by-slot-*.ndjson (a torn append) — left as they are`); }
  for (const a of prior.open) {
    const k = _archKey(a);
    if (a.store === 'usage-history') {
      bump(_isRekeyLine(a) ? tot.rekeyed : tot.archived, k, 0);
      touchedAccts.add((a.entry && a.entry.acct) || '__global__');
      if (a.slot !== undefined) touchedAccts.add(a.slot || '__global__');
    } else if (a.store === 'attribution') bump(tot.corrective, k, 0);
  }

  let shardNames = [];
  try { shardNames = fs.readdirSync(historyDir).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch { }
  for (const name of shardNames) {
    const fp = path.join(historyDir, name);
    let text = ''; try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const out = [], arch = [];
    let dirty = false;
    for (const line of text.split('\n')) {
      if (!line) continue;
      report.rows++;
      let r = null; try { r = JSON.parse(line); } catch { out.push(line); continue; } // we only act on what we can NAME
      // POOLED rows only: a session with no pool reads ONE credential dir for
      // its whole life, so its observed org and its slot are the same account
      // by construction — the refuted mechanism needs a re-point to lie.
      const local = r && r.sid && r.pool && r.be !== 'codex' && r.atype !== 'host' && !String(r.rid || '').startsWith('h:');
      if (!local || r.slotRekeyedBy) {
        // a row a CRASHED pass of this migration already re-keyed and renamed:
        // its accounts still need the relearn this pass will run
        if (report.resumed && r && r.slotRekeyedBy === id) { touchedAccts.add(r.acct || '__global__'); touchedAccts.add(r.slotRekeyedFrom || '__global__'); }
        out.push(line); continue;
      }
      const acct = r.acct ?? null;
      const obs = stash.byRid.get(r.rid);
      const byTruth = !!(obs && obs.acct === acct);
      let byCorrective = false;
      if (!byTruth) {
        const w = walkAt(attrib.bySid.get(r.sid), Number(r.ts) || 0);
        byCorrective = !!(w && (w.entry.acct ?? null) === acct && (attrib.bySid.get(r.sid) || []).some((x) => x.e === w.entry && x.corrective));
      }
      if (!byTruth && !byCorrective) { out.push(line); continue; }
      report.candidates++;
      const how = byTruth ? `the OTel observation of its request (${r.rid}) baked ${acct || 'the machine login'}` : `an OTel corrective attribution entry named ${acct || 'the machine login'}`;
      const rec = slotRecordFor(r, { keyMap, ledIdx, cleanBySid });
      // the slot record AGREES with the row ⇒ nothing was mis-attributed here
      // (the OTel account happened to be the slot's) — untouched, whatever the
      // shadow: that question belongs to every row of the ledger, not this one
      if (!rec.why && (rec.slot ?? null) === acct) { report.confirmed++; out.push(line); continue; }
      const refused = rec.why ? rec : refusalFor(r, rec, markers);
      if (refused) {
        const cls = /lag shadow/.test(refused.why) ? 'lag-shadow' : /login was/.test(refused.why) ? 'dead-slot' : /could not resolve the pool/.test(refused.why) ? 'pool-target-unresolved' : 'no-slot-record';
        report.archivedWhy[cls]++;
        report.archived++;
        touchedAccts.add(acct || '__global__');
        arch.push({ migration: id, at: now, store: 'usage-history', file: name, action: 'archived', reason: `${how}; the slot that held the session cannot be proven: ${refused.why}`, entry: r });
        dirty = true;
        continue;
      }
      const lab = labelOf(rec.slot);
      const nr = { ...r, acct: rec.slot ?? null, atype: lab.atype, aname: lab.aname, slotRekeyedBy: id, slotRekeyedFrom: acct };
      arch.push({ migration: id, at: now, store: 'usage-history', file: name, action: 'rekeyed', slot: rec.slot ?? null, reason: `${how}; re-keyed to ${rec.slot || 'the machine login'} — the ${rec.rung === 'slot-ledger' ? 'slot-transition ledger' : 'conversation\'s own attribution walk (OTel corrective entries set aside)'} names it at ${_iso(Number(r.ts))}`, entry: r });
      out.push(JSON.stringify(nr));
      report.rekeyed++; report.byRung[rec.rung]++;
      touchedAccts.add(acct || '__global__'); touchedAccts.add(rec.slot || '__global__');
      dirty = true;
    }
    if (!dirty) continue;
    report.shards++;
    for (const a of arch) bump(a.action === 'rekeyed' ? tot.rekeyed : tot.archived, _archKey(a), 1);
    _appendArchive(archiveDir, archiveName, arch, seen);
    _writeAtomic(fp, out.length ? out.join('\n') + '\n' : '');
  }

  // the corrective entries themselves: set aside, so no later bake or re-bake
  // inherits them again
  const corr = attrib.lines.filter((x) => x.corrective);
  report.corrective = corr.length;
  if (corr.length) {
    const corrLines = corr.map((x) => ({ migration: id, at: now, store: 'attribution', reason: `OTel corrective attribution entry (the spawn-time org written over the credential link, 2.361.0–2026-09-07): same sid and account as an OTel observation, ts ${x.e.ts === undefined ? '?' : x.e.ts} spelled the way only that writer spelled it`, entry: x.e }));
    for (const a of corrLines) bump(tot.corrective, _archKey(a), 1);
    _appendArchive(archiveDir, archiveName, corrLines, seen);
    const keep = attrib.lines.filter((x) => !x.corrective).map((x) => x.raw);
    _writeAtomic(attrib.fp, keep.length ? keep.join('\n') + '\n' : '');
  }
  report.untouched = report.rows - report.rekeyed - report.archived;

  // ── the estimator: re-learn every identity whose accounts moved ──────────
  if (touchedAccts.size && relearn) {
    const anchorsDir = path.join(dataDir, 'usage-anchors');
    const idents = new Set();
    let files = []; try { files = fs.readdirSync(anchorsDir).filter((f) => /^anchors-.*\.ndjson$/.test(f)); } catch { }
    for (const f of files) {
      let text = ''; try { text = fs.readFileSync(path.join(anchorsDir, f), 'utf-8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line) continue;
        let a; try { a = JSON.parse(line); } catch { continue; }
        if (!a || !a.identityKey) continue;
        const ids = [a.accountId || '__global__', ...(Array.isArray(a.accountIds) ? a.accountIds : [])];
        if (ids.some((x) => touchedAccts.has(x || '__global__'))) idents.add(a.identityKey);
      }
    }
    // ONE KEY PER ANCHORS FILE (quota r2): some anchor files carry two
    // spellings of one identity ('org:<uuid>' and the file-name form
    // 'org_<uuid>'); both resolve to the same file, so relearning both minted a
    // phantom rates.json entry under the '_' spelling and reported every such
    // identity twice. The canonical spelling is the one the sanitiser CHANGES
    // (the readers look rates up by it); the other is reported as drift.
    const slugOf = (k) => String(k).replace(/[^\w.@-]/g, '_').slice(0, 80);
    const bySlug = new Map();
    for (const k of idents) { const sl = slugOf(k); const l = bySlug.get(sl) || []; l.push(k); bySlug.set(sl, l); }
    idents.clear();
    for (const [sl, ks] of bySlug) {
      const canon = ks.filter((k) => k !== sl).sort()[0] || ks[0];
      idents.add(canon);
      for (const k of ks) if (k !== canon) report.anchorKeySpellings.push(k);
    }
    report.anchorKeySpellings.sort();
    report.identities = [...idents].sort();
    if (idents.size) {
      const ratesFp = path.join(anchorsDir, 'rates.json');
      const prev = _readJson(ratesFp) || {};
      const old = {}; for (const k of idents) if (prev[k]) old[k] = prev[k];
      if (Object.keys(old).length) _appendArchive(archiveDir, archiveName, [{ migration: id, at: now, store: 'usage-anchors/rates.json', reason: 'learned from ledger cost that the OTel org had attributed — re-learned from the re-keyed ledger', entry: old }], seen);
      const { UsageHistory } = require('./usage-history.js');
      const { UsageEstimator, CLAUDE_MAX_PRIOR_FULL_USD } = require('./usage-estimator.js');
      const uh = new UsageHistory({ dataDir, homeDir: path.join(dataDir, '.no-home') });
      const est = new UsageEstimator({ anchorsDir, usageHistory: uh, resolveIdentity: () => null, lagS: 0, priorsFor: (k) => (String(k || '').startsWith('codex:') ? null : CLAUDE_MAX_PRIOR_FULL_USD) });
      for (const k of idents) { try { est.ratesFor(k); report.relearned++; } catch (e) { throw new Error(`re-learning ${k} failed: ${e.message}`); } }
    }
  }
  report.total = { rekeyed: sumMax(tot.rekeyed), archived: sumMax(tot.archived), corrective: sumMax(tot.corrective) };
  // A FINISHED PASS THE RUNNER NEVER RECORDED (quota r3): killed between the
  // marker below and the runner's migrations.json write, the retry finds every
  // row already re-keyed and nothing open — it states the recorded pass's
  // repair (its marker) instead of 0 / 0 with no notice, and writes no second
  // marker (the repair happened once).
  const nothingNow = !report.resumed && !report.total.rekeyed && !report.total.archived && !report.total.corrective;
  const lc = prior.lastComplete;
  if (nothingNow && lc && lc.total && (lc.total.rekeyed || lc.total.archived || lc.total.corrective)) {
    report.total = { rekeyed: Number(lc.total.rekeyed) || 0, archived: Number(lc.total.archived) || 0, corrective: Number(lc.total.corrective) || 0 };
    report.resumed = true; report.recovered = true;
    if (Number(lc.relearned) > 0) report.relearned = Number(lc.relearned);
    report.ms = Date.now() - t0;
    return report;
  }
  // THE PASS FINISHED: a marker closes the segment, so a later retry (there is
  // none after the runner records the id) would not re-count this one, and a
  // pass that dies before this line is RESUMED by the next one
  if (report.resumed || report.total.rekeyed || report.total.archived || report.total.corrective) {
    _appendLines(archiveDir, archiveName, JSON.stringify({ migration: id, at: now, store: 'pass', complete: true, total: report.total, resumed: report.resumed, relearned: report.relearned }) + '\n');
  }
  report.ms = Date.now() - t0;
  return report;
}

module.exports = { backfillLedgerBySlot, readPriorArchive, readOtelStash, readAttribution, walkAt, slotRecordFor, refusalFor, indexTransitions, ownLedgerRow, membersOffDisk };
