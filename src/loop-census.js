'use strict';
/**
 * WHAT THE MAIN LOOP SPENDS ITSELF ON, BY ENGINE (lane hub-loop-stalls, unit loop-day-report, piece M3 — the measurement
 * release: the share of the hour's main-thread time by family, read off the journal of a pod nobody opens the page of).
 * PURE: the FAMILIES table, the booking of one answer, the fold of one take. The ORCH halves are the watchdog thread
 * (src/server/sync-fs-witness-worker.js: the census's ticks and asks) and the main side's `census()` (the take, once an
 * hour, src/server/sync-fs-witness.js).
 *
 * THE CENSUS — commit 1's sampler at a LOW rate over the whole hour, never a profiler: Runtime.evaluate of the one
 * constant SAMPLE_EXPR (src/loop-hold.js) from the watchdog THREAD, nothing enabled, no .cpuprofile, no file, no journal
 * line. One tick every CENSUS_EVERY_MS on average (each interval drawn between half and one and a half of it, as a
 * capture's — a fixed period phase-locks with the hub's own timers), classed EXACTLY as a capture's tick
 * (src/cpu-capture.js tickOf — the main thread's kernel state first: asleep in its own loop's poll with the beat fresh is
 * IDLE and never asked; a hold open is HELD; stopped; another ask out, a capture or a profile running is NOT SAMPLED);
 * else ONE ask, or booked on the census's own ask in flight. An answer books its ticks (bookOf) on the FAMILY of the
 * innermost JavaScript frame inside the install — node_modules, Node's internals, built-ins and eval'd code skipped, the
 * instrument's own frames trimmed (src/loop-hold.js instrumentTrim) — so time inside a native call, a parse, a
 * synchronous system call is counted on its JavaScript CALLER (an ask lands at the first JavaScript); 'rest' when no
 * frame of the stack is the install's; 'native' when the stack has no JavaScript frame. A helper's OWN time is its
 * family's (a shared module that no rule names is 'rest'), never its caller's. COUNTS ONLY: no frame, path or name is kept.
 * ITS PRIORITY IS THE LOWEST: it asks only when no ask is in flight and no capture or profile runs, and a hold, a capture or
 * a profile that finds its ask in flight TAKES it as its own (the watchdog's takeCensusAsk) — none waits behind it.
 * THE COST, bounded and said in the take: each ask's own run on the main thread (the note's µs, as a capture sums it)
 * summed and its largest kept; one past ASK_BOUND_MS halves the rate, no slower than one per CENSUS_FLOOR_MS; the hour's
 * take resets the counts and the rate. Paused — its ticks counted, nothing asked — by the flags that stop a capture: the
 * setting off or not read yet, a debugger port open, the heap near its limit (and with no inspector).
 */
const CC = require('./cpu-capture.js');
const LH = require('./loop-hold.js');

const CENSUS_EVERY_MS = 1000;   // one tick a second on average: ≤ 3600 an hour, an ask only when the loop is not idle
const CENSUS_FLOOR_MS = 8000;   // a halved rate goes no slower than one tick per 8 s
const ASK_BOUND_MS = CC.ASK_BOUND_MS;   // one ask's own run past this (4 ms, the capture's bound) ⇒ the rate halves
const TAKE_WAIT_MS = 2000;      // the main side waits this long for the watchdog thread's take, then answers null

// THE FAMILIES — ordered rules on the INSTALL-RELATIVE path (the first that matches names it; none ⇒ 'rest'). `dir`: a
// folder of src/ whose files are all the family's; `lead`: the file's name begins with one of these words; `word`: one of
// these words stands anywhere in its name between dashes — both for a file directly in src/, src/server/, src/routes/,
// src/lib/ or src/harnesses/ (the same name in each is the same engine: its model, its engine, its route, its page half).
const IN = '^src/(?:server/|routes/|lib/|harnesses/)?';
const lead = (words) => new RegExp(`${IN}(?:${words})(?:-[\\w.-]*)?\\.[cm]?js$`);
const word = (words) => new RegExp(`${IN}(?:[\\w.]+-)*(?:${words})(?:-[\\w.-]*)?\\.[cm]?js$`);
const FAMILIES = Object.freeze([
  { id: 'channels', words: 'the channels engine and its store', rules: [/^src\/channels\//, lead('channels?|outbox|webhook|groups|msg-acl')] },
  { id: 'pool', words: 'the account pool and usage', rules: [lead('accounts?|spend|otel|rate-limit|reset-credit|auto-cli|cost|catalog-pricing|reading'), word('usage|quota|ledger')] },
  // before parse: the hook routes' own marks (seen-marks, turn-carry — «turn» is parse's word) and the context table every injection renders
  { id: 'hook', words: 'the prompt hook and the agent routes', rules: [/^src\/agent-routes(?:\/|\.js$)/, lead('hooks|task-context|seen-marks|turn-carry')] },
  { id: 'parse', words: 'the parse of conversations’ output and the message state', rules: [/^src\/server\/stdout\//, word('message|transcripts?|events|stream-json|session-store|session-stdout|normalizers|output-belt|turn|agy-store')] },
  { id: 'browser', words: 'the browser keeper', rules: [/^src\/browser-backends\//, lead('browser|cdp')] },
  { id: 'jobs', words: 'jobs', rules: [lead('jobs?')] },
  { id: 'page', words: 'the page protocol and its fan-out', rules: [lead('ws|sync-store|sync-arrival|static'), word('broadcast|fanout')] },
].map((f) => Object.freeze({ ...f, rules: Object.freeze(f.rules) })));
const REST = Object.freeze({ id: 'rest', words: 'the rest of the hub’s own code (or no frame of it on the stack)' });
const NATIVE_WORDS = 'on the CPU outside JavaScript (no JavaScript frame on the stack)';
const TICK_WORDS = `a tick every ${CENSUS_EVERY_MS / 1000} s on average from the watchdog thread, classed by the main thread's kernel state first (asleep in its own loop's poll = idle, never asked); a busy tick is booked on the family of the innermost frame of the hub's own code on its stack (${CC.NATIVE_NOTE})`;
const IDS = Object.freeze([...FAMILIES.map((f) => f.id), REST.id]);

/** PURE: an install-relative path → its family id ('rest' when no rule names it) */
function familyOf(rel) {
  const p = String(rel || '');
  for (const f of FAMILIES) if (f.rules.some((re) => re.test(p))) return f.id;
  return REST.id;
}
/** PURE: an answered ask's text (the sample's own encoding, src/loop-hold.js SAMPLE_EXPR) → where its ticks go: a family
 *  id, 'native' (a stack with no JavaScript frame), or null — NOT SAMPLED (a debugger's or an accessor's stand-down, frames
 *  unreadable) */
function bookOf(text, root) {
  const r = CC.rawFramesOf(text);
  if (r.form !== 'calls' && r.form !== 'string') return null;
  const frames = LH.instrumentTrim(r.frames, root);
  if (!frames.length) return 'native';
  for (const f of frames) {
    if (f.evalish) continue;
    const at = CC.relOf(f.file, root);
    if (at.kind === 'install' && !CC.packageOf(at.rel)) return familyOf(at.rel);
  }
  return REST.id;
}
/** PURE: THE COST'S BOUND — the census's mean interval after an ask whose own run on the main thread took `askMs`: doubled
 *  (the rate halved) when past `boundMs`, never slower than `floorMs`; null = unchanged */
function slowerAfter(everyMs, askMs, { boundMs = ASK_BOUND_MS, floorMs = CENSUS_FLOOR_MS } = {}) {
  return Number.isFinite(askMs) && askMs > boundMs && Number.isFinite(everyMs) && everyMs * 2 <= floorMs ? everyMs * 2 : null;
}
/** the counts a census starts an hour with */
const emptyTicks = () => ({ idle: 0, held: 0, stopped: 0, notSampled: 0, paused: 0 });

/** PURE: ONE take (the watchdog's {fromM, toM, everyMs, ticks, pausedBy, families, asks, askOwnMs, askMaxMs, halved}) →
 *  {sampledTicks, busyTicks, busyShare (of the sampled), shares [{family, words, ticks, share}] — EVERY family, each a
 *  share of the BUSY ticks, larger first (ties in the table's order), native {ticks, share of the busy}, idle / held /
 *  stopped {ticks, share of the sampled}, notSampled {ticks, paused, pausedBy}, cost {asks, ownMs, meanMs, maxMs, halved},
 *  words}. The shares and native sum to 1 (busy = the families' ticks + native's); a family id the table does not know
 *  is the rest's. */
function censusFold(take) {
  const t = take && typeof take === 'object' ? take : {};
  const n = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
  const tk = t.ticks || {}, fam = t.families || {};
  const by = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (const [k, v] of Object.entries(fam)) if (k !== 'native') by[IDS.includes(k) ? k : REST.id] += n(v);
  const native = n(fam.native);
  const busy = IDS.reduce((s, id) => s + by[id], native);
  const idle = n(tk.idle), held = n(tk.held), stopped = n(tk.stopped);
  const sampled = busy + idle + held + stopped;
  const of = (x, total) => (total > 0 ? x / total : null);
  const order = new Map(IDS.map((id, i) => [id, i]));
  const shares = IDS.map((id) => ({ family: id, words: id === REST.id ? REST.words : FAMILIES[order.get(id)].words, ticks: by[id], share: of(by[id], busy) }))
    .sort((a, b) => b.ticks - a.ticks || order.get(a.family) - order.get(b.family));
  const asks = n(t.asks), ownMs = n(t.askOwnMs);
  return {
    fromM: Number.isFinite(t.fromM) ? t.fromM : null, toM: Number.isFinite(t.toM) ? t.toM : null, everyMs: Number.isFinite(t.everyMs) ? t.everyMs : null,
    sampledTicks: sampled, busyTicks: busy, busyShare: of(busy, sampled), shares,
    native: { ticks: native, share: of(native, busy), words: NATIVE_WORDS },
    idle: { ticks: idle, share: of(idle, sampled) }, held: { ticks: held, share: of(held, sampled) }, stopped: { ticks: stopped, share: of(stopped, sampled) },
    notSampled: { ticks: n(tk.notSampled) + n(tk.paused), paused: n(tk.paused), pausedBy: { ...(t.pausedBy || {}) } },
    cost: { asks, ownMs, meanMs: asks ? ownMs / asks : null, maxMs: n(t.askMaxMs), halved: t.halved || null },
    words: TICK_WORDS,
  };
}

module.exports = { FAMILIES, REST, IDS, NATIVE_WORDS, TICK_WORDS, familyOf, bookOf, slowerAfter, emptyTicks, censusFold, CENSUS_EVERY_MS, CENSUS_FLOOR_MS, ASK_BOUND_MS, TAKE_WAIT_MS };
