'use strict';
/**
 * THE INSTALLED CLAUDE CODE STATES ITS OWN MODELS (lane cli-update-needs-nothing, 2.369.390). The owner's founding
 * requirement (2026-03-22, item 7): use the native Claude Code, so that a Claude Code update needs no update of this
 * project unless Claude Code itself broke something. A new model used to need a release (a price row, a picker row, a
 * family word); the binary on the box already states every one of those facts. This module:
 *   · is told, by the tick that already reads `claude --version` (src/server/oat-file-sync.js: 20 s after boot, then every
 *     15 min — ONE call there through `global.__vsCliBinary`, which cli-env's create sets; no timer of its own), which binary the sessions spawn; keyed by its version + the file's stat
 *     identity (dev:ino:size:mtime) — cli-self-measure's sha256 replaces that key at the train (a seam, named in the report);
 *   · reads a binary it has not seen ONCE, without running it: a streamed scan for the catalog's anchor (8 MiB chunks, the
 *     loop free between reads; ~60 ms on a 340 MB build, measured), the window parsed + validated by the PURE
 *     src/claude-model-catalog.js (strict literal grammar, the provider record's own validators — never evaluated);
 *   · keeps every read in data/cli-model-catalog.json (atomic; ≤ 20 binaries; the one in use never dropped);
 *   · hands the readers what they read FIRST: the price layer (usage-history setCatalogPricing — the union of every binary
 *     read, the newest build per id), the family words (model-family setCatalogFamilies), the picker's view (onView
 *     subscribers: src/server/cli-env.js) — the shipped tables stay the seed and the fallback;
 *   · tells the maintainers first, through the local telemetry road (global.__vsEvent): `cli-model-catalog-read` per new
 *     binary, `cli-unknown-model` per id 2.1.321's catalog did not name, `cli-unknown-model-price` per price disagreement
 *     (ruling R3), `cli-unknown-model-catalog` when a catalog cannot be read, `cli-unknown-model-alias` when an alias breaks
 *     the word rule the lock and the chip hold. The `cli-unknown-` ones are Diagnostics' «Harness drift» rows. Each is said
 *     ONCE per hub (kept in the ledger); no identifier beyond the version, the model ids and the rates.
 * A binary whose catalog cannot be read keeps today's shipped rows (+ one quiet line) — never an empty or broken menu.
 */
const fs = require('fs');
const path = require('path');
const CMC = require('../claude-model-catalog.js');
const CPC = require('../claude-plan-catalog.js');
const SR = require('../store-read.js');
const SRH = require('../store-read-hold.js');   // r3333 unit 3: the ledger HELD when it cannot be read
const LEVEL_REPORTED = require('./cli-level-reported.js');   // B-24e2: what the paired machines read of their own binaries (in memory)

const LEDGER = 'cli-model-catalog.json';
const KEEP = 20;
const CHUNK = 8 << 20, OVERLAP = 4096;
const READ_TIMEOUT_MS = 60e3;   // law D: one read never blocks the next tick's for longer than this
// THE PLAN VALUES RIDE THE SAME READ (lane oat-add-door): the scan goes on past the catalog until the CLI's subscription map is
// found, at most PLAN_SCAN_MAX bytes past the point the catalog's parts were found (2.1.321: the map sits 3.2 MB past the catalog
// anchor; every tier string before it) — never the catalog's verdict: a map not found is `plans.anchor: false` (way ② of the
// guided door is then not offered), the models stay read
const PLAN_SCAN_MAX = 64 << 20;
// THE BACKGROUND LEVEL SIGNAL RIDES THE SAME READ (lane level-signal-2b, majordomo piece 2b): does the build's record union DECLARE
// it (CMC.levelSignalAt)? Looked for in the very chunks the catalog reads — on 2.1.322 (342 MB) the declaration sits at 285.8 MB,
// 2.3 MB past the catalog anchor and before the plan map, so it costs no byte more; the scan goes on past the catalog for at most
// LEVEL_SCAN_MAX after the catalog's parts, as the plan values do. Found ⇒ `level {declared: true, at}`; the window read whole and
// not found ⇒ `declared: false` (a verdict about the bytes); a read cut short (the bound) says nothing — the entry is tried again.
const LEVEL_SCAN_MAX = 64 << 20;
// law E: what a read's refusal MEANS. A content verdict (the bytes are what they are) is stored for good; anything else is
// an I/O moment (EACCES before a chmod, a swapped file, a timeout) and is tried again at a later tick — the key does not change.
const CONTENT_CODES = new Set(['no-anchor', 'no-literal', 'not-a-literal', 'forbidden-key', 'too-deep', 'string-long', 'array-long', 'literal-long',
  'expected-colon', 'expected-comma', 'bad-key', 'bad-number', 'bad-escape', 'unterminated-string', 'newline-in-string', 'parse-budget', 'no-valid-model']);

const st = { dataDir: null, ledger: null, key: null, reading: null, subs: [], event: null, log: null, saveSaid: false, pricesBy: new Map(), hold: null };
const fresh = () => ({ schema: 1, reader: CMC.READER_VERSION, current: null, binaries: {}, said: [] });
const SAID_NAMES = ['cli-model-catalog-read', 'cli-unknown-model-price', 'cli-unknown-model-catalog', 'cli-unknown-model-alias', 'cli-unknown-model'];
/** what of the «said» set is still TRUE: a binary still kept, a model a kept binary still names, a price disagreement the
 *  last recomputation still reported (unknown until one ran: kept), an alias line the current view still states */
function prune() {
  const l = st.ledger; if (!l) return;
  const keys = Object.keys(l.binaries), ids = new Set();
  for (const e of Object.values(l.binaries)) for (const m of e.models || []) ids.add(m.id);
  const cur = l.current ? viewOf(l.binaries[l.current]) : null;
  const aliasLines = new Set(cur ? CMC.aliasGuard(cur).map((g) => aliasLine(g, cur)) : []);
  l.said = l.said.filter((k) => {
    const bar = k.indexOf('|'), name = k.slice(0, bar), tag = k.slice(bar + 1);
    if (name === 'cli-model-catalog-read') return keys.includes(tag);
    if (name === 'cli-unknown-model') return ids.has(tag);
    if (name === 'cli-unknown-model-catalog') return keys.some((b) => tag === b || tag.startsWith(b + '|'));
    if (name === 'cli-unknown-model-alias') return aliasLines.has(tag);
    // no price table has reported yet (a tick that reads a new binary at boot, before usage-history exists): every price line
    // is KEPT — unknown is not «ended». A collected table's set stays in pricesBy for the life of the process, so a line it
    // alone reported is kept until a restart (a disagreement that ended there and returns waits for a restart to be said).
    if (name === 'cli-unknown-model-price') return !st.pricesBy.size || [...st.pricesBy.values()].some((set) => set.has(tag));
    return false;
  });
}
// small r2 (3): the load accepts ONLY what readBinary could have produced — a model row of the validator's shape, aliases and
// latest-per-family as plain string → model-id maps (no object with a hostile toString), a refusal list of plain rows
const isStr = (x, max = 200) => typeof x === 'string' && x.length <= max;
const isIntOrNull = (x) => x === null || (Number.isInteger(x) && x >= 1 && x <= 10000000);
const isRate = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= CMC.RATE_MAX;
const RATE_KEYS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const isPrice = (p) => p === null || (!!p && typeof p === 'object' && !Array.isArray(p) && RATE_KEYS.every((k) => isRate(p[k]))
  && (p.long === undefined || p.long === null || (!!p.long && typeof p.long === 'object' && Number.isInteger(p.long.above) && RATE_KEYS.every((k) => isRate(p.long[k])))));
const isModelRow = (m) => !!m && typeof m === 'object' && !Array.isArray(m) && isStr(m.id, 128) && /^claude-[a-z0-9][a-z0-9.-]*$/.test(m.id)
  && isStr(m.family, 24) && isStr(m.label, 60) && (m.firstParty === null || isStr(m.firstParty, 128)) && isIntOrNull(m.window)
  && (m.oneM === null || m.oneM === 'native' || m.oneM === 'beta') && isIntOrNull(m.maxOutput) && (m.tier === null || isStr(m.tier, 64)) && isPrice(m.price);
const isIdMap = (o, ids) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => k !== '__proto__' && isStr(o[k], 128) && ids.has(o[k]));
// the plan values as planCatalogOf produces them — re-derived from their own lists, so a hand-edited ledger cannot add a value
const isPlans = (p) => !!p && typeof p === 'object' && !Array.isArray(p) && Array.isArray(p.types) && Array.isArray(p.tiers) && Array.isArray(p.withheld)
  && p.types.every((x) => isStr(x, 40) && /^[a-z0-9_]{1,40}$/.test(x)) && [...p.tiers, ...p.withheld].every((x) => isStr(x, 60) && /^default_claude_[a-z0-9_]{1,40}$/.test(x))
  && !!p.orgTypes && typeof p.orgTypes === 'object' && !Array.isArray(p.orgTypes) && Object.keys(p.orgTypes).every((k) => p.types.includes(k) && isStr(p.orgTypes[k], 60))
  && p.anchor === (p.types.length > 0) && p.tiers.every((x) => !CPC.WITHHELD_TIERS.includes(x)) && p.withheld.every((x) => CPC.WITHHELD_TIERS.includes(x));
const isLevel = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.declared === 'boolean' && (v.at === null || (Number.isInteger(v.at) && v.at >= 0)) && (v.whole === undefined || typeof v.whole === 'boolean');
const isEntry = (e) => {
  if (!e || typeof e !== 'object' || Array.isArray(e) || (e.state !== 'read' && e.state !== 'unreadable') || !Array.isArray(e.models) || !Array.isArray(e.refused || [])) return false;
  if (!e.models.every(isModelRow)) return false;
  const ids = new Set(e.models.map((m) => m.id));
  if (e.state === 'read' && (!e.models.length || !isIdMap(e.aliases || {}, ids) || !isIdMap(e.latestPerFamily || {}, ids))) return false;
  if (e.plans !== undefined && e.plans !== null && !isPlans(e.plans)) return false;
  if (e.level !== undefined && e.level !== null && !isLevel(e.level)) return false;
  return (e.refused || []).every((r) => !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.code === 'string');
};

// r3333 unit 3 (lane lg-group-parents, the store-read family): THE LEDGER IS HELD when it cannot be read — the release read any failure
// as «no ledger» and the next save wrote over it: the rows of builds no longer installed were lost. HELD: this run's reads are kept in
// memory (the binary in use is read and in force as before), nothing is written over the file, it is read again off the loop; at its
// read the file's rows come back and this run's reads go over them, written once, and the readers (the price layer, the view) are
// handed the merged ledger (r3770). Torn bytes (or a file that is no ledger of this schema — one a NEWER build wrote too): kept aside
// ONCE, then it starts empty and a file of this build's shape is written, as at the release (now with a copy).
const ledgerValid = (l) => !!l && typeof l === 'object' && !Array.isArray(l) && l.schema === 1 && !!l.binaries && typeof l.binaries === 'object' && !Array.isArray(l.binaries);
const LEDGER_WORDS = `the model catalog's ledger (${LEDGER}) could not be read — what this run reads is kept in memory and nothing is written over it; it is read again by itself`;
/** law E: what the load ACCEPTS is exactly what the save can write — a non-entry is dropped here, never carried */
function loadLedger(dataDir) {
  if (st.ledger && st.dataDir === dataDir) return st.ledger;
  st.dataDir = dataDir || null;
  if (st.hold) { st.hold.stop(); st.hold = null; }
  let l = null;
  if (dataDir) {
    const file = path.join(dataDir, LEDGER);
    let read; try { read = { text: fs.readFileSync(file, 'utf8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: ledgerValid });
    st.hold = SRH.create({ file, valid: ledgerValid, aside: (mark) => `${file}.corrupt-${mark}`, words: () => LEDGER_WORDS, code: 'cli_model_catalog_unread',
      log: (m) => say('log', `[cli-model-catalog] ${m}`), onLift: (v) => liftLedger(dataDir, v) });
    if (st.hold.start(a) === 'data') l = a.value;
  }
  return (st.ledger = ledgerOf(l));
}
/** the held ledger read again: the file's rows, then this run's reads over them (newer), written once */
function liftLedger(dataDir, v) {
  if (st.dataDir !== dataDir || !st.ledger) return;
  const was = st.ledger, out = ledgerOf(v);
  for (const [k, e] of Object.entries(was.binaries)) out.binaries[k] = e;
  out.current = was.current || out.current;
  out.said = [...new Set([...out.said, ...was.said])];
  st.ledger = out;
  if (!was.current) st.key = out.current;   // nothing read this run: the file's view is in force (law A)
  try { apply({ save: false }); } catch { }   // r3770: ALWAYS the merged ledger to the readers — the price layer takes the old builds' rows back
  saveLedger();
}
function ledgerOf(l) {
  const out = fresh();
  if (ledgerValid(l)) {
    for (const [k, e] of Object.entries(l.binaries)) if (k !== '__proto__' && isEntry(e)) out.binaries[k] = { ...e, refused: Array.isArray(e.refused) ? e.refused : [] };
    out.current = typeof l.current === 'string' && out.binaries[l.current] ? l.current : null;
    // THE «SAID» SET (tidy, acceptance r3): nothing is dropped by age — a line still current is never forgotten (a slice of
    // the newest would say an old, still-true line again); what leaves is what is no longer true (prune(), at every save),
    // and a name this module never says is not a line at all
    out.said = Array.isArray(l.said) ? l.said.filter((x) => typeof x === 'string' && SAID_NAMES.some((n) => x.startsWith(n + '|'))) : [];
  }
  return out;
}
const writer = () => st.writer || require('../store-writer.js').storeWriter();   // st.writer: a suite's stand-in
function saveLedger() {
  if (!st.dataDir || !st.ledger) return;
  if (st.hold && !st.hold.writable('the model catalog\'s ledger')) return;   // r3333 unit 3: never over a held ledger (said once)
  try {
    const b = st.ledger.binaries;
    const keys = Object.keys(b).sort((x, y) => String((b[y] && b[y].readAt) || '').localeCompare(String((b[x] && b[x].readAt) || '')));
    for (const k of keys.slice(KEEP)) if (k !== st.ledger.current) delete b[k];
    if (fs.existsSync(st.dataDir)) for (const f of fs.readdirSync(st.dataDir)) if (f.startsWith(LEDGER + '.tmp-')) { try { fs.unlinkSync(path.join(st.dataDir, f)); } catch { } } // an older build's kill between write and rename left one
    prune();
    // B-574d (lane lg-text-legs-3): THE STORE WRITER writes it — off the hub's loop, every byte or nothing, synced (src/store-writer.js); the ledger
    // in memory stays the truth, the latest state is written (a burst of saves is one write); a failed write is said once, as before
    const f = path.join(st.dataDir, LEDGER), led = st.ledger;
    writer().dirty(f, { name: 'cli-model-catalog.write', makeDir: true, produce: () => JSON.stringify(led),
      onWritten: (ok, e) => { if (ok) { st.saveSaid = false; return; } if (!st.saveSaid) { st.saveSaid = true; say('log', `[cli-model-catalog] the ledger could not be written (${(e && e.code) || (e && e.message) || e}) — what was read stays in force until the next start`); } } });
  } catch (e) {
    if (!st.saveSaid) { st.saveSaid = true; say('log', `[cli-model-catalog] the ledger could not be written (${(e && e.code) || (e && e.message) || e}) — what was read stays in force until the next start`); }
  }
}
function say(kind, a, b) {
  if (kind === 'log') { try { (st.log || console.log)(a); } catch { } return; }
  try { (st.event || ((n, d) => global.__vsEvent?.(n, d)))(a, b); } catch { }
}
/** an event said ONCE per hub (the `said` set lives in the ledger, so a restart does not say it again) */
function once(name, detail, tag) {
  const k = `${name}|${tag || detail}`;
  if (st.ledger.said.includes(k)) return false;
  st.ledger.said.push(k);
  say('event', name, String(detail).slice(0, 200));
  return true;
}

/** THE READ: the bytes of one binary → a ledger entry. Never runs it. Bounded (law D): opened O_NONBLOCK (a FIFO swapped in
 *  between the stat and the open answers at once), the open file must be the one the stat saw (dev + ino) and a regular
 *  file, and the whole read races READ_TIMEOUT_MS — past it the entry says `timeout` and a later tick tries again. */
async function readBinary(file, { version = null, expect = null, timeoutMs = READ_TIMEOUT_MS, open = null } = {}) {
  const t0 = Date.now();
  const entry = { cli: version || null, builtAt: null, size: null, readAt: new Date().toISOString(), reader: CMC.READER_VERSION, state: 'unreadable', models: [], aliases: {}, latestPerFamily: {}, best: null, refused: [], plans: null, evidence: { road: 'strings' } };
  let timer = null, fh = null, abandoned = false;
  const work = (async () => {
    try {
      fh = await (open || ((f) => fs.promises.open(f, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0))))(file);
      if (abandoned) return entry;
      const fst = await fh.stat();
      if (!fst.isFile()) { entry.reason = { code: 'not-a-file', at: 0 }; return entry; }
      if (expect && (fst.dev !== expect.dev || fst.ino !== expect.ino)) { entry.reason = { code: 'changed', at: 0 }; return entry; }
      const size = fst.size; entry.size = size;
      const buf = Buffer.alloc(CHUNK + OVERLAP);
      let pos = 0, carry = 0, anchorAt = -1, ident = null, partsAt = -1, levelAt = -1;
      const plans = CPC.createPlanScanner();
      const planOpen = () => !plans.found() && (partsAt < 0 || pos - partsAt < PLAN_SCAN_MAX);
      const levelOpen = () => levelAt < 0 && (partsAt < 0 || pos - partsAt < LEVEL_SCAN_MAX);
      while (pos < size && (anchorAt < 0 || !ident || planOpen() || levelOpen()) && !abandoned) {
        const { bytesRead } = await fh.read(buf, carry, CHUNK, pos);
        if (!bytesRead) break;
        const view = buf.subarray(0, carry + bytesRead), base = pos - carry;
        plans.feed(buf.subarray(carry, carry + bytesRead).toString('latin1'));
        if (anchorAt < 0) { const i = view.indexOf(CMC.ANCHOR, 0, 'latin1'); if (i >= 0) anchorAt = base + i; }
        if (levelAt < 0) {   // each occurrence of the literal: a 200-byte look decoded (no whole-chunk string)
          for (let j = view.indexOf(CMC.LEVEL_NEEDLE, 0, 'latin1'); j >= 0 && levelAt < 0; j = view.indexOf(CMC.LEVEL_NEEDLE, j + 1, 'latin1')) {
            const from = Math.max(0, j - 200), k = CMC.levelSignalAt(view.subarray(from, j + CMC.LEVEL_NEEDLE.length).toString('latin1'));
            if (k >= 0) levelAt = base + from + k;
          }
        }
        if (!ident) {
          const b = view.indexOf('BUILD_TIME:"', 0, 'latin1');
          if (b >= 0) ident = CMC.identityIn(view.subarray(Math.max(0, b - 800), b + 48).toString('latin1'));
        }
        carry = Math.min(OVERLAP, view.length); view.copy(buf, 0, view.length - carry); pos += bytesRead;
        if (partsAt < 0 && anchorAt >= 0 && ident) partsAt = pos;
      }
      entry.plans = plans.result();
      // `whole`: the scan reached the file's end. Not found in bytes that were not all read (the window's bound) is NOT «does not declare»
      if (!abandoned) entry.level = { declared: levelAt >= 0, at: levelAt >= 0 ? levelAt : null, whole: pos >= size };
      if (ident) { entry.builtAt = ident.builtAt; entry.evidence.versionString = ident.version; entry.evidence.versionAgrees = !version || ident.version === version; if (!entry.cli) entry.cli = ident.version; }
      if (anchorAt < 0) { entry.reason = { code: 'no-anchor', at: 0 }; return entry; }
      const from = Math.max(0, anchorAt - 4096);
      const win = Buffer.alloc(Math.min(CMC.LITERAL_MAX + 8192, size - from));
      const { bytesRead } = await fh.read(win, 0, win.length, from);
      const text = win.subarray(0, bytesRead).toString('utf8');
      const rel = text.indexOf(CMC.ANCHOR);
      const lit = rel >= 0 ? CMC.catalogIn(text, rel) : { ok: false, code: 'no-anchor', at: 0 };
      entry.evidence.parse = { starts: lit.parsed || 0, of: lit.candidates || 0, chars: lit.spent || 0 }; // the work census (law D)
      if (!lit.ok) { entry.reason = { code: lit.code, at: lit.at }; return entry; }
      const v = CMC.validateCatalog(lit.raw);
      Object.assign(entry, { models: v.models, aliases: v.aliases, latestPerFamily: v.latestPerFamily, best: v.best, refused: v.refused });
      entry.evidence = { ...entry.evidence, anchor: CMC.ANCHOR, at: anchorAt, bytes: lit.bytes };
      if (!v.ok) { entry.reason = { code: 'no-valid-model', at: 0 }; return entry; }
      entry.state = 'read';
      return entry;
    } catch (e) {
      entry.reason = { code: (e && e.code) || 'read-failed', at: 0 };
      return entry;
    } finally {
      if (fh) { const h = fh; fh = null; try { await h.close(); } catch { } }
    }
  })();
  const bound = new Promise((resolve) => { timer = setTimeout(() => { abandoned = true; resolve({ ...entry, state: 'unreadable', reason: { code: 'timeout', at: 0 } }); }, timeoutMs); }); // cleared after the race (never unref'd: an awaiting caller needs it)
  const out = await Promise.race([work, bound]);
  clearTimeout(timer);
  out.evidence = { ...out.evidence, ms: Date.now() - t0 };
  if (out.state !== 'read' && !(out.reason && CONTENT_CODES.has(out.reason.code))) out.retry = true; // an I/O moment, not a verdict
  return out;
}

function viewOf(e) {
  return e && e.state === 'read' ? { cli: e.cli, builtAt: e.builtAt, models: e.models, aliases: e.aliases, latestPerFamily: e.latestPerFamily, best: e.best } : null;
}
const usd = (r) => (r ? `$${r.input}/$${r.output}, cache hit $${r.cacheRead}` : '?');
/** B2 (acceptance r2): a price disagreement is said ONCE when it comes to exist — at the read, at boot (an instance built
 *  after it), at the person's save: usage-history hands every recomputation's list here (onPriceDisagreements). */
const priceTag = (d) => `${d.id}|${JSON.stringify(d.catalog)}|${JSON.stringify(d.ours)}|${d.used}`;
const aliasLine = (g, view) => `${g.alias} → ${g.to} (Claude Code ${view.cli}): the alias names a model outside its word — the lock and the chip compare by the word`;
function sayPrices(dis, { save = true, by = null } = {}) {
  if (!Array.isArray(dis)) return;
  if (by != null) st.pricesBy.set(by, new Set(dis.map(priceTag))); // what is TRUE now, per price table (prune keeps the union)
  if (!st.ledger) return;
  let said = false;
  for (const d of dis) {
    const ours = d.used === 'you' ? `your «${d.fellOn}» row ${usd(d.ours)} is the one in force` : `VibeSpace's ${d.fellOn === '_default' ? 'default' : '«' + d.fellOn + '»'} row ${usd(d.ours)}`;
    said = once('cli-unknown-model-price', `${d.label || d.id}: Claude Code ${d.cli || '?'} (built ${String(d.builtAt || '?').slice(0, 10)}) prices it ${usd(d.catalog)}; ${ours} — using ${d.used === 'catalog' ? 'Claude Code\'s' : d.used === 'you' ? 'yours' : 'VibeSpace\'s'}`, priceTag(d)) || said;
  }
  if (said && save) saveLedger();
}
function listen() { try { require('../usage-history.js').onPriceDisagreements((list, by) => sayPrices(list, { by })); } catch { } }

/** hand every reader what the ledger says now; → the price disagreements (said once each) */
function apply({ save = true } = {}) {
  const l = st.ledger;
  const cur = l && l.current ? l.binaries[l.current] : null;
  const view = viewOf(cur);
  try { require('../model-family.js').setCatalogFamilies(CMC.familiesOf(view)); } catch { }
  let dis = [];
  try { dis = require('../usage-history.js').setCatalogPricing(CMC.priceLayerOf(Object.values((l && l.binaries) || {}))) || []; } catch (e) { say('log', `[cli-model-catalog] price layer failed: ${(e && e.message) || e}`); }
  for (const fn of st.subs) { try { fn(view); } catch { } }
  if (l) {
    // the price lines are said by the usage-history listener (each table's recomputation, above) — not again here
    if (view) for (const g of CMC.aliasGuard(view)) once('cli-unknown-model-alias', aliasLine(g, view));
    if (save) saveLedger();
  }
  return { view, disagreements: dis };
}

/** THE TRIGGER (oat-file-sync's --version tick). Never throws; resolves when the binary is read (or known). */
function noteBinary({ cmd, version = null, dataDir = null, which = null, event = null, log = null, timeoutMs = READ_TIMEOUT_MS, open = null, fsx = {} } = {}) {
  if (event) st.event = event;
  if (log) st.log = log;
  listen();
  const run = async () => {
    let file = null;
    try { file = typeof which === 'function' ? which(cmd) : (cmd && path.isAbsolute(cmd) ? cmd : null); } catch { file = null; }
    if (!file) return null;
    let real, s;
    // small r2 (2): realpath and stat are inside the bound too (a mount that never answers leaves no later tick pending)
    let tm = null;
    try {
      const meta = await Promise.race([(async () => { const r = await (fsx.realpath ? fsx.realpath(file) : fs.promises.realpath(file)); return { r, st: await (fsx.stat ? fsx.stat(r) : fs.promises.stat(r)) }; })(), // the reads stay direct calls (the §86 census sees them); fsx = a test's stand-in
        new Promise((resolve) => { tm = setTimeout(() => resolve(null), timeoutMs); })]);
      if (!meta) return null;
      real = meta.r; s = meta.st;
    } catch { return null; } finally { clearTimeout(tm); }
    if (!s.isFile()) return null;
    const key = `${version || '?'}|${s.dev}:${s.ino}:${s.size}:${Math.round(s.mtimeMs)}`;
    let l = loadLedger(dataDir);
    // the binary in use, already read BY THIS READER: nothing to do. An entry an older reader wrote is read once more — also right
    // after a boot (law A loads the ledger and sets the key; before lane level-signal-2b this early return skipped that re-read, so a
    // reader's new fact — the plan values at 2, the level signal at 3 — never reached the binary in use until the CLI updated)
    if (st.key === key && l.current === key && l.binaries[key] && l.binaries[key].reader === CMC.READER_VERSION && !l.binaries[key].retry) return l.binaries[key];
    let e = l.binaries[key], kept = false;
    const known = !!(e && e.reader === CMC.READER_VERSION && !e.retry); // an I/O failure is tried again (law E); a verdict stays
    if (!known) {
      e = await readBinary(real, { version, expect: { dev: s.dev, ino: s.ino }, timeoutMs, open });
      if (st.ledger && st.ledger !== l && st.dataDir === dataDir) l = st.ledger;   // r3770: a held ledger's lift replaced it during the read — the read lands in the ledger in force
      const had = l.binaries[key];
      if (e && e.retry && had && had.reader === CMC.READER_VERSION && !had.retry) { e = had; kept = true; }   // r3947: a read that failed (an I/O moment) never replaces this build's good entry the lift brought back — its own prices stay in the price layer
      else l.binaries[key] = e;
    }
    l.current = key; st.key = key;
    if (!known && !kept) {
      if (e.state === 'read') {
        const unseen = e.models.filter((m) => !CMC.KNOWN_CATALOG_IDS.includes(m.id));
        once('cli-model-catalog-read', `claude ${e.cli} · built ${String(e.builtAt || '?').slice(0, 10)} · ${e.models.length} models${unseen.length ? ' · new: ' + unseen.map((m) => m.id).join(', ') : ''}${e.refused.length ? ` · ${e.refused.length} refused` : ''}`, key);
        for (const m of unseen) once('cli-unknown-model', `${m.id} · ${m.family} · Claude Code ${e.cli}`, m.id);
        for (const r of e.refused.slice(0, 20)) once('cli-unknown-model-catalog', `Claude Code ${e.cli}: ${r.id || '(catalog)'} ${r.field} refused (${r.code})`, `${key}|${r.id}|${r.field}`);
        say('log', `[cli-model-catalog] claude ${e.cli}: read its own model list (${e.models.length} models, ${e.evidence.bytes} B in ${e.evidence.ms} ms)${unseen.length ? ' — new: ' + unseen.map((m) => m.id).join(', ') : ''}`);
      } else {
        once('cli-unknown-model-catalog', `Claude Code ${e.cli || version || '?'}: its own model list could not be read here (${e.reason && e.reason.code}${e.reason && e.reason.at ? ' at +' + e.reason.at : ''}) — VibeSpace uses its built-in list`, key);
        say('log', `[cli-model-catalog] claude ${e.cli || version || '?'}: its own model list could not be read (${e.reason && e.reason.code}) — the built-in list stays`);
      }
    }
    apply();
    return e;
  };
  const p = (st.reading || Promise.resolve()).then(run, run).catch(() => null);
  st.reading = p;
  return p;
}

/** LAW A (acceptance r1): what the hub read is in force from the FIRST answer after a restart — the server's boot loads the
 *  ledger and hands every reader its view BEFORE any tick (no re-read; a tick whose --version gives no answer, or no claude
 *  at all, keeps it). → the current entry's view, or null (nothing read yet: the shipped tables). */
function boot({ dataDir, event = null, log = null } = {}) {
  if (event) st.event = event;
  if (log) st.log = log;
  const l = loadLedger(dataDir);
  st.key = l.current;
  listen();
  apply({ save: false });
  return view();
}

/** a reader of the CURRENT binary's view (the picker); called at once with what is known, then on every change */
function onView(fn) {
  if (typeof fn !== 'function') return () => { };
  st.subs.push(fn);
  const l = st.ledger;
  if (l && l.current) { try { fn(viewOf(l.binaries[l.current])); } catch { } }
  return () => { st.subs = st.subs.filter((f) => f !== fn); };
}
function view() { const l = st.ledger; return l && l.current ? viewOf(l.binaries[l.current]) : null; }
/** majordomo piece 2b: does the build `version` DECLARE the background level signal, as this reader found in its binary? →
 *  true | false (the whole file read, not found) | 'partial' (not found in the bytes read — the window's bound came first: «could
 *  not look», never «does not declare») | null (no binary of that build read by this reader yet). IN MEMORY: the ledger the boot
 *  loaded and the ticks keep — no file is read here (src/server/conversation-facts.js asks it per row). */
function levelSignalOf(version) {
  const l = st.ledger;
  if (typeof version !== 'string' || !version) return null;
  let out = null;
  for (const e of Object.values((l && l.binaries) || {})) {   // B-24e2: no ledger of our own still reads what a machine reported
    if (!e || e.reader !== CMC.READER_VERSION || e.retry || !isLevel(e.level)) continue;
    if (((e.evidence && e.evidence.versionString) || e.cli) !== version) continue;
    if (e.level.declared) return true;
    if (e.level.whole === true) out = false; else if (out === null) out = 'partial';
  }
  if (out === false) return out;
  const r = LEVEL_REPORTED.levelOf(version);   // B-24e2: a PAIRED machine's read of its own binary, by version (after ours)
  return r ? r.declared : out;
}
/** THE CLI'S OWN SUBSCRIPTION VALUES (lane oat-add-door): the binary in use's plan values as its bytes state them →
 *  {cli, types, orgTypes, tiers, withheld, anchor} or null (no binary read yet, or one read before the reader knew them) */
function plans() {
  const l = st.ledger, e = l && l.current ? l.binaries[l.current] : null;
  return e && e.plans && typeof e.plans === 'object' ? { cli: e.cli || null, ...e.plans } : null;
}
function status() {
  const l = st.ledger, cur = l && l.current ? l.binaries[l.current] : null;
  return cur ? { cli: cur.cli, builtAt: cur.builtAt, state: cur.state, models: cur.models.length, refused: cur.refused.length, reason: cur.reason || null, ms: cur.evidence && cur.evidence.ms } : null;
}
/** tests only: forget the in-process state (the ledger file stays — a «restart»; the subscribers are wiring and stay) */
function _reset() { if (st.dataDir) { try { writer().flushSync([path.join(st.dataDir, LEDGER)]); } catch { } }   // a suite's RESTART: its pending save lands first, as a real stop's exit flush writes it
  if (st.hold) { st.hold.stop(); st.hold = null; } st.dataDir = null; st.ledger = null; st.key = null; st.reading = null; st.event = null; st.log = null; st.saveSaid = false; st.pricesBy = new Map(); } // the subscribers stay (module wiring)

/** tests only: the ledger loaded with no reader fed (no apply, no listener) / a save now (prune + write) */
function _load(dataDir) { return loadLedger(dataDir); }
function _saveNow() { saveLedger(); return _landed(); }
/** (suites) the ledger's last save ON DISK: the writer's own answer, never a fixed wait */
function _landed() { return st.dataDir ? Promise.resolve(writer().durable(path.join(st.dataDir, LEDGER))) : Promise.resolve(true); }
module.exports = { boot, noteBinary, readBinary, onView, view, plans, levelSignalOf, status, apply, LEDGER, READ_TIMEOUT_MS, PLAN_SCAN_MAX, LEVEL_SCAN_MAX, _reset, _load, _saveNow, _landed };
