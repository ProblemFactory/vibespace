#!/usr/bin/env node
// Row B-360d (主开发 r4522 / r4527): THE BROWSER TRACE's SWEEP LEAVES THE HUB's LOOP — src/server/browser-trace.js sweep().
//   At the release (2.369.419, eb7608d54) one pass ran WHOLE in one turn of the loop (a readdir of the trace root, every scope's index
//   and markers read and parsed, a plan over every entry, the removals and a whole-index rewrite, the recordings' stats) — at the boot
//   and every hour, against the data folder (a network mount on the owner's kind of hub). Now: at most SWEEP_SLICE entries a turn,
//   every file act async, one scope at a time; the verdicts are the first pass's (the release's, with line 924's held-settings rule). Every leg is COUNTED or read from the files, never
//   judged by a clock; the 2.369.420 first pass's sweep (179edf1e1) is planted back whole (scripts/fixtures/b360d-first-pass-sweep.txt) as the red copy.
//   (a) a differential at three sizes: the same removals, the same index, the same entry files and recordings, first pass vs now, and with the settings held;
//   (b) no synchronous file call under the data folder during a sweep — RED the first pass's;
//   (c) the entries walked in one loop turn (a plan row each: T.entryListBytes) are at most the slice — RED the first pass's walk;
//   (d) an action appended while the sweep is HELD between two slices of its plan is in the index after the rewrite — RED a sweep
//       that snapshots the index at its plan and rewrites the snapshot; (d2) the same between the rewrite's temp write and its
//       rename — RED a rewrite that does not hold the appends;
//   (e) a failed rewrite loses nothing (a PLACED refusal of the temp write, then of the rename): the old index stands whole, the
//       held appends land in it in their order, no temp file is left, the next pass starts clean — RED a rewrite that drops them;
//   (f) r4703: a TORN index line is kept byte for byte at the head of the new index and its scope is swept by its readable lines —
//       RED the 162a38203 form (a torn line held its scope: never trimmed again) and the first pass's (its rewrite erases the line);
//       an index or a session list whose read is REFUSED: NO removal for that scope, the file byte for byte, one journal line with
//       a count and the codes and no path — RED a refused session-list read read as none; r4739 (the smaller shape): a FAILED read
//       stands until the NEXT START (the next pass still holds; a new start sweeps) — RED the 3b0547fb2 retry and a retried session list;
//   (f2) r4739 M2: an action appended and another replaced while a failed read holds the scope stand in the index EXACTLY ONCE through
//       a new start's sweep — RED the 3b0547fb2 retry (the two land inside its read and its rewrite erases them);
//   (g) the hub's stop while a rewrite is in flight: it never renames, the held appends are written to the index that stands —
//       RED a stop that does not write them;
//   (h) the hold is bounded: past SWEEP_HOLD_MAX held appends the rewrite gives up before its rename — every line lands, in order —
//       RED a rewrite that renames past the bound;
//   (i) one sweep at a time; the route awaits it (within its bound); the boot does not;
//   (j) the settings' hold lifting while a sweep runs (r4547);
//   (k) r4703, the hung-mount class: the FIRST read that does not answer (a PLACED hang) stops the pass — RED a pass that goes on;
//       r4739: a silent file has at most ONE read out — three passes ask it once — RED a file asked again while its read is out;
//   (l) r4703 / r4739, the required: the Sweep press says what it did not sweep (a count, no path), a sweep that STOPPED says so, past
//       its bound «still running» — the ROUTE driven in-process by behaviour; RED a route that drops the stopped fact.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const BS = require('../src/browser-sessions.js');
const T = require('../src/browser-trace.js');
const R = require('../src/server/browser-trace.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError('ok() takes a boolean — ' + n); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return c; };
const J = (x) => JSON.stringify(x);
const MB = 1048576, DAY = 86400000;
const NOW = Date.parse('2026-11-25T12:00:00Z');
const ROOT = scratch('browser-trace-sweep');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const P1 = 'bp-000000d1', P2 = 'bp-000000d2', PT = 'bp-000000d3', PE = 'bp-000000d4', PM = 'bp-000000d5';
const idOf = (scopeN, i) => 'tr-' + scopeN.toString(16).padStart(2, '0') + i.toString(16).padStart(10, '0');

// ── a made-up trace on a scratch data folder: each scope's sessions of 50 actions (the last one open), 1 MB a picture (two a
//    frame), tiny picture files; recordings, two of them older than the retention ──
function mkWorld(name, { scopes = [], torn = null, recordings = true } = {}) {
  const DATA = path.join(ROOT, name, 'data');
  fs.rmSync(path.join(ROOT, name), { recursive: true, force: true });
  for (const [k, { pid, n }] of scopes.entries()) {
    const sd = path.join(DATA, T.TRACE_DIR, pid); fs.mkdirSync(sd, { recursive: true });
    const lines = [], marks = [];
    const sessions = Math.max(1, Math.ceil(n / 50));
    for (let s = 0; s < sessions; s++) {
      const sid = 'bs-' + (k * 4096 + s).toString(16).padStart(8, '0'), t0 = NOW - (sessions - s) * 3600000;
      marks.push(BS.markerFor({ phase: 'start', id: sid, browserKey: 'bk-000000a1', profileId: pid, at: t0 }));
      const last = s === sessions - 1;
      const m = Math.min(50, n - s * 50);
      for (let i = 0; i < m; i++) {
        const id = idOf(k + 1, s * 50 + i);
        lines.push(JSON.stringify(T.entryFor({ id, at: t0 + (i + 1) * 1000, browserKey: 'bk-000000a1', profileId: pid, browserSession: sid, command: { action: 'click', params: { x: 1, y: 1 } }, position: { kind: 'point', x: 1, y: 1 }, before: { file: id + '-before.jpg', bytes: MB }, after: { file: id + '-after.jpg', bytes: MB } })));
        fs.writeFileSync(path.join(sd, id + '-before.jpg'), 'b'); fs.writeFileSync(path.join(sd, id + '-after.jpg'), 'a');
      }
      if (!last) marks.push(BS.markerFor({ phase: 'end', id: sid, browserKey: 'bk-000000a1', profileId: pid, at: t0 + 3000000, count: m, durationMs: 3000000, reason: 'released' }));
    }
    if (torn === pid) lines.splice(Math.floor(lines.length / 2), 0, '{"id":"tr-0000torn","torn');   // a line a crash cut short
    fs.writeFileSync(path.join(sd, R.INDEX_FILE), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(sd, BS.MARKERS_FILE), marks.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }
  if (recordings) {
    const rd = path.join(DATA, T.RECORDING_DIR, P1); fs.mkdirSync(rd, { recursive: true });
    for (const [n, ageDays] of [['rec-1700000001.webm', 1], ['rec-1700000002.webm', 9], ['rec-1700000003.webm', 12]]) { const f = path.join(rd, n); fs.writeFileSync(f, 'x'.repeat(10)); const at = (NOW - ageDays * DAY) / 1000; fs.utimesSync(f, at, at); }
  }
  return { DATA, scopes };
}
const keeperStub = { profile: () => null, browserOf: () => null, leasesOn: () => [], _reg: () => ({ profiles: [], browsers: {}, leases: [] }), isEphemeral: () => false, onLease: () => () => { }, addDigest: () => () => { }, list: () => ({ profiles: [] }), holdersFor: () => [] };
const bridgeStub = { _relays: new Map(), async tap() { return { ok: true }; }, untap() { } };
const settings = { 'browser.traceBytesPerProfile': 64 };   // MB: the floor — far under the made-up traces
// line 924's rule (B-50e7, r4547): the settings' HOLD — the view the hub hands while its settings cannot be read (no browser.* row)
const MARK = Symbol.for('vibespace.settings-held'), HELD = { kind: 'unreadable', code: 'EIO' };
const heldNow = { on: false };
const mkTrace = (Mod, W, { hold = null, said = null, readBound = null, pressBound = null } = {}) => Mod.create({ ...(readBound ? { sweepReadBoundMs: readBound } : {}), ...(pressBound ? { sweepPressBoundMs: pressBound } : {}), dataDir: W.DATA, homeDir: path.join(ROOT, 'home'), keeper: keeperStub, bridge: bridgeStub, serverSetting: (k) => (k === MARK ? (heldNow.on ? HELD : undefined) : heldNow.on && /^browser\./.test(k) ? undefined : settings[k]), broadcast: () => { }, log: { log() { }, info() { }, warn: (m) => { if (said) said.push(String(m)); }, error() { } }, now: () => NOW, sweepEveryMs: 0, sweepHold: hold });
const indexText = (W, pid) => fs.readFileSync(path.join(W.DATA, T.TRACE_DIR, pid, R.INDEX_FILE), 'utf8');
const indexIds = (W, pid) => indexText(W, pid).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).id; } catch { return '(torn)'; } });
const dirFiles = (d) => { try { return fs.readdirSync(d).sort(); } catch { return []; } };
const tmpLeft = (W, pid) => dirFiles(path.join(W.DATA, T.TRACE_DIR, pid)).filter((n) => n.includes('.tmp-'));
const newEntry = (pid, id) => T.entryFor({ id, at: NOW + 1000, browserKey: 'bk-000000a1', profileId: pid, command: { action: 'type', params: {} }, position: { kind: 'input' } });

// ── the copies: the first pass's sweep planted back; a snapshot at the plan; the rewrite's append hold cut; the held appends dropped ──
const M = mutantCopies('browser-trace-sweep', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
const FIRST_PASS_SWEEP = fs.readFileSync(path.join(REPO, 'scripts/fixtures/b360d-first-pass-sweep.txt'), 'utf8');
const NEW_START = "  /** r4522 (B-360d): the plan's input for one scope, its entries walked in SLICES", NEW_END = '  /** What one scope holds now against its limit';
const relSrc = SRC.includes(NEW_START) && SRC.indexOf(NEW_END) > SRC.indexOf(NEW_START) ? SRC.slice(0, SRC.indexOf(NEW_START)) + FIRST_PASS_SWEEP + SRC.slice(SRC.indexOf(NEW_END)) : null;
ok(!!relSrc && FIRST_PASS_SWEEP.includes('  function sweep() {\n') && FIRST_PASS_SWEEP.includes('T.traceSizePlan({ scopes: scopes().map(scopeForPlan), bytesPerScope: limit })'), 'the release\'s sweep (scripts/fixtures/b360d-first-pass-sweep.txt) is planted back in place of the new one');   // stale-pins: kept — the release's sweep, checked in its fixture on purpose
const REL = relSrc ? M.load('src/server/browser-trace.js', relSrc, 'first-pass-sweep') : null;
const edit = (text, pairs) => { let t = text; for (const [a, b] of pairs) { if (t.split(a).length !== 2) return null; t = t.replace(a, b); } return t; };
const snapSrc = edit(SRC, [['    const planned = [];\n', '    const planned = []; const snapOf = new Map();\n'], ['      planned.push(await scopeForPlanSliced(sc, entries, mk.list, step));\n', '      snapOf.set(sc, entries.slice()); planned.push(await scopeForPlanSliced(sc, entries, mk.list, step));\n'], ['      await rewriteIndexAsync(sc, step);\n', '      indexes.set(sc, snapOf.get(sc)); await rewriteIndexAsync(sc, step);\n']]);
const noHoldSrc = edit(SRC, [["    if (rw) { rw.held.push(JSON.stringify(entry) + '\\n');", "    if (false && rw) { rw.held.push(JSON.stringify(entry) + '\\n');"]]);
const dropSrc = edit(SRC, [['      for (;;) {\n        if (rewriting.get(scope) !== rw) break;', '      for (;;) {\n        break; if (rewriting.get(scope) !== rw) break;']]);
ok(!!snapSrc && !!noHoldSrc && !!dropSrc, 'the anchors of the three one-edit copies are in the source (a snapshot at the plan, the append hold cut, the held appends dropped)', { snap: !!snapSrc, noHold: !!noHoldSrc, drop: !!dropSrc });
const SNAP = snapSrc ? M.load('src/server/browser-trace.js', snapSrc, 'snapshot-at-plan') : null;
const NOHOLD = noHoldSrc ? M.load('src/server/browser-trace.js', noHoldSrc, 'no-append-hold') : null;
const DROP = dropSrc ? M.load('src/server/browser-trace.js', dropSrc, 'held-dropped') : null;
// r4703's copies: the 162a38203 form (a torn line HOLDS its scope — never trimmed again), the markers read as none, a pass that goes on
// after a silent read, a stop that does not write the held appends, a rewrite that renames past its hold's bound
const tornHoldSrc = edit(SRC, [['if (code) readState.set(scope, { torn: raw.length, code }); else readState.delete(scope); };', "if (code || raw.length) readState.set(scope, { torn: raw.length, code: code || 'torn' }); else readState.delete(scope); };"]]);
const mkNoneSrc = edit(SRC, [['    if (r.code) { markersFailed.set(scope, r.code); return { hold: r.code }; }\n', '    // the markers read as none\n']]);
const goOnSrc = edit(SRC, [["if (code === 'silent') { stopped = 'silent'; break; } continue; }", 'continue; }']]);
const stopNoWriteSrc = edit(SRC, [["try { if (lines.length) fs.appendFileSync(rw.file, lines.join(''), { mode: FILE_MODE }); }", "try { if (false && lines.length) fs.appendFileSync(rw.file, lines.join(''), { mode: FILE_MODE }); }"]]);
const holdNoThrowSrc = edit(SRC, [["      if (rw.over) throw Object.assign(new Error(`more than ${SWEEP_HOLD_MAX} appends held`), { code: 'hold_full' });\n", '      // the hold\'s bound not kept\n']]);
ok(!!tornHoldSrc && !!mkNoneSrc && !!goOnSrc && !!stopNoWriteSrc && !!holdNoThrowSrc, 'the anchors of r4703\'s five one-edit copies are in the source', { tornHold: !!tornHoldSrc, mkNone: !!mkNoneSrc, goOn: !!goOnSrc, stopNoWrite: !!stopNoWriteSrc, holdNoThrow: !!holdNoThrowSrc });
const TORNHOLD = tornHoldSrc ? M.load('src/server/browser-trace.js', tornHoldSrc, 'torn-holds') : null;
const MKNONE = mkNoneSrc ? M.load('src/server/browser-trace.js', mkNoneSrc, 'markers-none') : null;
const GOON = goOnSrc ? M.load('src/server/browser-trace.js', goOnSrc, 'silent-goes-on') : null;
const STOPNOWRITE = stopNoWriteSrc ? M.load('src/server/browser-trace.js', stopNoWriteSrc, 'stop-no-write') : null;
const HOLDNOTHROW = holdNoThrowSrc ? M.load('src/server/browser-trace.js', holdNoThrowSrc, 'hold-no-bound') : null;
// r4739's copies: the 3b0547fb2 retry of a failed index read (its read replaces a list an append or a replace changed meanwhile), a
// failed session-list read read again inside a running hub, a silent file asked again while its read is still out, a route that drops
// the stopped fact
const cureTipSrc = edit(SRC, [['    if (indexes.has(scope)) return indexes.get(scope);\n    const r = await boundRead(path.join(scopeDir(scope), INDEX_FILE));\n    if (indexes.has(scope)) return indexes.get(scope);\n',
  '    const was = indexes.get(scope);\n    if (was && !readState.has(scope)) return was;\n    const fresh = () => indexes.has(scope) && indexes.get(scope) !== was;\n    const r = await boundRead(path.join(scopeDir(scope), INDEX_FILE));\n    if (fresh()) return indexes.get(scope);\n'],
  ["raw.push(line); await step('read', scope); if (indexes.has(scope)) return indexes.get(scope); } }", "raw.push(line); await step('read', scope); if (fresh()) return indexes.get(scope); } }"]]);   // stale-pins: kept — the red copy puts the 3b0547fb2 retry's text back on purpose
const mkRetrySrc = edit(SRC, [['    if (markersFailed.has(scope)) return { hold: markersFailed.get(scope) };\n', '']]);
const noOutSrc = edit(SRC, [['    if (outstanding.has(file)) return { silent: true, outstanding: true };\n', '']]);
const ROUTE_SRC = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
const routeNoStopSrc = edit(ROUTE_SRC, [[', ...(r.stopped ? { stopped: r.stopped } : {}) /* r4739: a pass stopped at a read that did not answer — said */', '']]);
ok(!!cureTipSrc && !!mkRetrySrc && !!noOutSrc && !!routeNoStopSrc, 'the anchors of r4739\'s four one-edit copies are in the sources', { cureTip: !!cureTipSrc, mkRetry: !!mkRetrySrc, noOut: !!noOutSrc, routeNoStop: !!routeNoStopSrc });
const CURETIP = cureTipSrc ? M.load('src/server/browser-trace.js', cureTipSrc, 'retry-of-a-failed-read') : null;
const MKRETRY = mkRetrySrc ? M.load('src/server/browser-trace.js', mkRetrySrc, 'markers-failed-retried') : null;
const NOOUT = noOutSrc ? M.load('src/server/browser-trace.js', noOutSrc, 'silent-file-asked-again') : null;
const RTNOSTOP = routeNoStopSrc ? M.load('src/routes/browser-trace.js', routeNoStopSrc, 'route-drops-stopped') : null;
// the stop's two windows (r4703): the 162a38203 order (the held lines appended, THEN the temp file removed) and a stop that writes the
// held lines but not the batch whose append is in flight
const unlinkLastSrc = edit(SRC, [['try { fs.unlinkSync(rw.tmp); } catch { /* not written yet, or renamed already */ } const lines', 'const lines'], ['${e && e.code}`); } } /* r4522 (B-360d): at the hub', '${e && e.code}`); } try { fs.unlinkSync(rw.tmp); } catch { /* the 162a38203 order */ } } /* r4522 (B-360d): at the hub']]);
const noFlushSrc = edit(SRC, [['const lines = rw.flushing.concat(rw.held);', 'const lines = rw.held.slice();']]);
ok(!!unlinkLastSrc && !!noFlushSrc, 'the anchors of the two stop-window copies are in the source', { unlinkLast: !!unlinkLastSrc, noFlush: !!noFlushSrc });
const UNLINKLAST = unlinkLastSrc ? M.load('src/server/browser-trace.js', unlinkLastSrc, 'stop-unlink-last') : null;
const NOFLUSH = noFlushSrc ? M.load('src/server/browser-trace.js', noFlushSrc, 'stop-no-flushing') : null;

console.log('— (a) the differential: the first pass\'s sweep and the new one over the same made-up traces, three sizes and the settings held');
{
  const sizes = [[30, 12], [450, 40], [900, 60]];   // the largest crosses two slices of the plan
  const outOf = (W) => ({ idx: W.scopes.map(({ pid }) => indexText(W, pid)), files: W.scopes.map(({ pid }) => dirFiles(path.join(W.DATA, T.TRACE_DIR, pid))), rec: dirFiles(path.join(W.DATA, T.RECORDING_DIR, P1)) });
  const rows = [];
  for (const [n1, n2] of sizes) {
    const spec = { scopes: [{ pid: P1, n: n1 }, { pid: P2, n: n2 }] };
    const A = mkWorld(`diff-rel-${n1}`, spec), B = mkWorld(`diff-new-${n1}`, spec);
    const ra = REL ? await mkTrace(REL, A).sweep() : null, rb = await mkTrace(R, B).sweep();
    const oa = outOf(A), ob = outOf(B);
    const relIdx = oa.idx.map((t) => t.split(A.DATA).join('#')), newIdx = ob.idx.map((t) => t.split(B.DATA).join('#'));
    rows.push({ n1, n2, removedRel: ra && ra.removed, removedNew: rb.removed, sameRemovals: !!ra && J(ra.plan.removeFrames.map((r) => r.id)) === J(rb.plan.removeFrames.map((r) => r.id)), sameIndex: J(relIdx) === J(newIdx), sameFiles: J(oa.files) === J(ob.files), sameRecordings: J(oa.rec) === J(ob.rec) && !!ra && ra.recordingsRemoved === rb.recordingsRemoved });
  }
  { // line 924's rule (r4547): the settings HELD with nothing known — no frame removed by either, the recordings by their own bound, `held` said
    const spec = { scopes: [{ pid: P1, n: 300 }, { pid: P2, n: 40 }] };
    const A = mkWorld('diff-rel-held', spec), B = mkWorld('diff-new-held', spec);
    heldNow.on = true;
    let ra = null, rb = null; try { ra = REL ? await mkTrace(REL, A).sweep() : null; rb = await mkTrace(R, B).sweep(); } finally { heldNow.on = false; }
    const oa = outOf(A), ob = outOf(B);
    rows.push({ n1: 'held', n2: 60, removedRel: ra && ra.removed, removedNew: rb.removed, heldRel: !!(ra && ra.held), heldNew: rb.held === true, sameRemovals: !!ra && ra.removed === 0 && rb.removed === 0, sameIndex: J(oa.idx.map((t) => t.split(A.DATA).join('#'))) === J(ob.idx.map((t) => t.split(B.DATA).join('#'))), sameFiles: J(oa.files) === J(ob.files), sameRecordings: J(oa.rec) === J(ob.rec) && !!ra && ra.recordingsRemoved === rb.recordingsRemoved && rb.recordingsRemoved > 0 });
  }
  ok(rows.every((r) => r.sameRemovals && r.sameIndex && r.sameFiles && r.sameRecordings) && rows[0].removedNew === 0 && rows[2].removedNew > 0 && rows[3].heldRel && rows[3].heldNew, `(a) the SAME verdicts as the first pass at ${sizes.length} sizes and with the settings HELD (${sizes.map(([a, b]) => a + '+' + b).join(', ')} actions over two scopes; held: no frame removed by either, the recordings by their own bound, «held» true): the same frames removed, the same index after, the same files and entries, the same recordings removed`, rows);
}

console.log('— (b) no synchronous file call under the data folder during a sweep; (c) at most SWEEP_SLICE entries walked a loop turn');
{
  const SYNC = ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'unlinkSync', 'writeFileSync', 'renameSync', 'appendFileSync', 'mkdirSync', 'openSync', 'rmSync', 'copyFileSync'];
  const measure = async (Mod, W) => {
    const tr = mkTrace(Mod, W);
    const orig = {}, calls = [];
    for (const k of SYNC) { orig[k] = fs[k]; fs[k] = function (...a) { if (String(a[0]).startsWith(W.DATA)) calls.push(k); return orig[k].apply(fs, a); }; }
    const origELB = T.entryListBytes; let cur = 0, max = 0, on = true;
    T.entryListBytes = (e) => { cur += 1; return origELB(e); };
    const tick = () => { max = Math.max(max, cur); cur = 0; if (on) setImmediate(tick); };
    setImmediate(tick);
    let r = null;
    try { r = await tr.sweep(); } finally { for (const k of SYNC) fs[k] = orig[k]; T.entryListBytes = origELB; on = false; }
    await new Promise((res) => setImmediate(res)); max = Math.max(max, cur);
    return { syncCalls: calls.length, kinds: [...new Set(calls)], maxPerTurn: max, removed: r && r.removed };
  };
  const spec = { scopes: [{ pid: P1, n: 900 }, { pid: P2, n: 60 }] }, ALL = 960;
  const now1 = await measure(R, mkWorld('count-new', spec));
  const rel1 = REL ? await measure(REL, mkWorld('count-rel', spec)) : null;
  ok(now1.syncCalls === 0 && now1.removed > 0, `(b) the sweep makes NO synchronous file call under the data folder (${now1.removed} actions' frames removed, every file act async)`, now1);
  ok(!!rel1 && rel1.syncCalls > 0, `CONTROL (b): the first pass's sweep makes ${rel1 && rel1.syncCalls} synchronous file calls there (${rel1 && rel1.kinds.join(', ')}) — RED`, rel1);
  ok(now1.maxPerTurn > 0 && now1.maxPerTurn <= R.SWEEP_SLICE, `(c) at most SWEEP_SLICE (${R.SWEEP_SLICE}) entries walked in one turn of the loop — ${now1.maxPerTurn} at most, of ${ALL}`, now1);
  ok(!!rel1 && rel1.maxPerTurn === ALL, `CONTROL (c): the first pass walks all ${rel1 && rel1.maxPerTurn} entries in ONE turn — RED`, rel1);
}

console.log('— (d) an action appended while the sweep is HELD is in the index after the rewrite');
{
  const race = async (Mod, where, name) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 700 }], recordings: false });
    const fresh = idOf(9, 1); let tr = null, appended = 0;
    const hold = async ({ where: w, scope }) => { if (w === where && scope === P1 && !appended) { appended = 1; tr._appendIndex(P1, newEntry(P1, fresh)); } };
    tr = mkTrace(Mod, W, { hold });
    const r = await tr.sweep();
    const ids = indexIds(W, P1);
    return { appended, removed: r.removed, inIndex: ids.filter((x) => x === fresh).length, lines: ids.length, tmp: tmpLeft(W, P1).length };
  };
  const d = await race(R, 'plan', 'race-plan'), dS = SNAP ? await race(SNAP, 'plan', 'race-plan-snap') : null;
  ok(d.appended === 1 && d.removed > 0 && d.inIndex === 1 && d.lines === 701 && d.tmp === 0, '(d) an action appended while the sweep is HELD between two slices of its plan is in the index after the rewrite — once, every other line kept', d);
  ok(!!dS && dS.appended === 1 && dS.inIndex === 0, 'CONTROL (d): a sweep that snapshots the index at its plan and rewrites the snapshot loses the appended action — RED', dS);
  const d2 = await race(R, 'rewrite-written', 'race-rename'), d2N = NOHOLD ? await race(NOHOLD, 'rewrite-written', 'race-rename-nohold') : null;
  ok(d2.appended === 1 && d2.inIndex === 1 && d2.lines === 701 && d2.tmp === 0, '(d2) …and one appended between the rewrite\'s temp write and its rename is HELD and written after the rename — once', d2);
  ok(!!d2N && d2N.appended === 1 && d2N.inIndex === 0, 'CONTROL (d2): a rewrite that does not hold the appends — the line written to the old file is renamed away — RED', d2N);
}

console.log('— (e) a failed rewrite loses nothing: a PLACED refusal of the temp write, then of the rename');
{
  const placed = (method) => { const orig = fs.promises[method]; fs.promises[method] = async function (...a) { if (String(a[0]).includes('.tmp-')) throw Object.assign(new Error('a placed refusal'), { code: 'EACCES' }); return orig.apply(fs.promises, a); }; return () => { fs.promises[method] = orig; }; };
  const failed = async (Mod, method, name) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 700 }], recordings: false });
    const before = indexText(W, P1);
    const ids = [idOf(9, 2), idOf(9, 3)]; let tr = null, n = 0;
    const hold = async ({ where: w, scope }) => { if (scope === P1 && (w === 'rewrite' || w === 'rewrite-written') && n < 2) tr._appendIndex(P1, newEntry(P1, ids[n++])); };
    tr = mkTrace(Mod, W, { hold });
    const undo = placed(method);
    let r1 = null; try { r1 = await tr.sweep(); } finally { undo(); }
    const after = indexText(W, P1);
    const appendedLines = after.slice(before.length).split('\n').filter(Boolean).map((l) => JSON.parse(l).id);
    const out = { method, removed: r1 && r1.removed, oldStands: after.startsWith(before), heldInOrder: J(appendedLines) === J(ids), tmp: tmpLeft(W, P1).length };
    // FOUND (said, not cured in this unit — the release's order: the pictures, the entry, then the index): the index that stands still
    // names pictures the pass removed
    out.namesRemovedPictures = before.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.before && !fs.existsSync(path.join(W.DATA, T.TRACE_DIR, P1, e.before.file))).length;
    const r2 = await tr.sweep();
    out.next = { tmp: tmpLeft(W, P1).length, lines: indexIds(W, P1).length, bothHeld: ids.every((x) => indexIds(W, P1).includes(x)), pictureNamed: indexText(W, P1).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.before && !fs.existsSync(path.join(W.DATA, T.TRACE_DIR, P1, e.before.file))).length, removedAgain: r2.removed };
    return out;
  };
  const eW = await failed(R, 'writeFile', 'fail-write'), eR = await failed(R, 'rename', 'fail-rename');
  for (const e of [eW, eR]) ok(e.removed > 0 && e.oldStands && e.heldInOrder && e.tmp === 0 && e.next.tmp === 0 && e.next.bothHeld && e.next.lines === 702, `(e) a refused ${e.method === 'writeFile' ? 'temp write' : 'rename'}: the OLD index stands whole, the two held appends land in it in their order, no temp file is left, and the next pass starts clean (its rewrite stands, both appends in it)`, e);
  ok(eW.namesRemovedPictures > 0, `FOUND (said, not cured in this unit): after a failed rewrite the index that stands names ${eW.namesRemovedPictures} pictures the pass already removed (the release's order: the pictures, the entry, then the index); the next pass, planning from memory, finds nothing more to remove and does not rewrite it (${eW.next.pictureNamed} still named) — they stay named until a later rewrite, and a restart reads them as entries whose pictures are gone`, { found: eW.namesRemovedPictures, afterNext: eW.next.pictureNamed, removedAgain: eW.next.removedAgain });
  const eD = DROP ? await failed(DROP, 'writeFile', 'fail-write-drop') : null;
  ok(!!eD && !eD.heldInOrder, 'CONTROL (e): a rewrite that drops its held appends when it fails — the two actions are gone from the index — RED', eD);
}

console.log('— (f) r4703: a TORN line is kept byte for byte and its scope swept; an index or a session list that cannot be READ: no removal for that scope, one journal line, no path');
{
  const TORN = '{"id":"tr-0000torn","torn';
  const tornRun = async (Mod, name, more = false) => {
    const W = mkWorld(name, { scopes: [{ pid: PT, n: 40 }, { pid: PE, n: 40 }, { pid: PM, n: 40 }, { pid: P1, n: 40 }], torn: PT, recordings: false });
    const beforeE = indexText(W, PE), beforeM = indexText(W, PM);
    const ePrefix = path.join(W.DATA, T.TRACE_DIR, PE), mPath = path.join(W.DATA, T.TRACE_DIR, PM, BS.MARKERS_FILE);
    const orig = fs.promises.readFile;   // PLACED refusals: PE's index read, PM's session-list (markers) read
    fs.promises.readFile = async function (...a) { const f = String(a[0]); if (f.startsWith(ePrefix) || f === mPath) throw Object.assign(new Error('a placed refusal'), { code: 'EACCES' }); return orig.apply(fs.promises, a); };
    const said = [];
    const tr = mkTrace(Mod, W, { said });
    let r = null; try { r = await tr.sweep(); } finally { fs.promises.readFile = orig; }
    const keys = new Set((r.plan.removeFrames || []).map((x) => x.key));
    const tLines = indexText(W, PT).split('\n').filter(Boolean);
    const jpg = (pid) => dirFiles(path.join(W.DATA, T.TRACE_DIR, pid)).filter((x) => x.endsWith('.jpg')).length;
    const line = said.find((x) => /not swept this pass/.test(x)) || '';
    const first = { removedT: keys.has(PT), removedE: keys.has(PE), removedM: keys.has(PM), removedOther: keys.has(P1), tornKept: tLines.filter((l) => l === TORN).length, tornAtHead: tLines[0] === TORN, picturesT: jpg(PT), picturesM: jpg(PM), unreadKept: indexText(W, PE) === beforeE, markersKept: indexText(W, PM) === beforeM, scopesHeld: r.scopesHeld, line, pathInLine: line.includes(ROOT) };
    if (!more) return first;
    // r4739 (the smaller shape): the NEXT pass, the refusals lifted, the same trace — a read that FAILED stands until the next start: both
    // scopes still held, nothing of theirs removed, the journal says how long; then a NEW START over the same data folder sweeps both
    const n0 = said.length, r2 = await tr.sweep(), keys2 = new Set((r2.plan.removeFrames || []).map((x) => x.key));
    const line2 = said.slice(n0).find((x) => /not swept this pass/.test(x)) || '', eKept2 = indexText(W, PE) === beforeE, mKept2 = indexText(W, PM) === beforeM;
    tr.shutdown();
    const r3 = await mkTrace(Mod, W).sweep(), keys3 = new Set((r3.plan.removeFrames || []).map((x) => x.key));
    return { ...first, next: { removedE: keys2.has(PE), removedM: keys2.has(PM), scopesHeld: r2.scopesHeld, eKept: eKept2, mKept: mKept2, saysStart: /asked again only at the next start/.test(line2) }, start: { removedE: keys3.has(PE), removedM: keys3.has(PM), scopesHeld: r3.scopesHeld, tornKept: indexText(W, PT).split('\n').filter((l) => l === TORN).length } };
  };
  const f = await tornRun(R, 'torn-new', true);
  ok(f.removedT && f.tornKept === 1 && f.tornAtHead && f.picturesT < 80 && f.removedOther,
    '(f) r4703 THE MUST: a scope with a TORN index line is SWEPT by its readable lines (bounded again) and its torn line is KEPT byte for byte, once, at the head of the new index', f);
  ok(!f.removedE && f.unreadKept && !f.removedM && f.markersKept && f.picturesM === 80 && f.scopesHeld === 2 && /2 scope\(s\) not swept this pass/.test(f.line) && /EACCES ×2/.test(f.line) && !f.pathInLine,
    '(f) a scope whose INDEX read is refused and one whose SESSION LIST read is refused lose nothing (their files byte for byte, every picture kept); ONE journal line says it — a count and the codes, no path; the answer counts them (scopesHeld)', f);
  ok(!f.next.removedE && !f.next.removedM && f.next.scopesHeld === 2 && f.next.eKept && f.next.mKept && f.next.saysStart && f.start.removedE && f.start.removedM && f.start.scopesHeld === 0 && f.start.tornKept === 1,
    '(f) r4739 (the smaller shape): a read that FAILED stands until the NEXT START — the next pass (the refusals lifted) still holds both scopes, their files byte for byte, the journal says «asked again only at the next start»; a new start over the same data folder sweeps both; the torn line still stands once', { next: f.next, start: f.start });
  const fC = CURETIP ? await tornRun(CURETIP, 'torn-curetip', true) : null, fK = MKRETRY ? await tornRun(MKRETRY, 'torn-mkretry', true) : null;
  ok(!!fC && fC.next.removedE, 'CONTROL (the 3b0547fb2 retry): a failed index read is read again inside the running hub — RED', fC && fC.next);
  ok(!!fK && fK.next.removedM, 'CONTROL: a failed session-list read is read again inside the running hub — RED', fK && fK.next);
  const fH = TORNHOLD ? await tornRun(TORNHOLD, 'torn-hold') : null, fR = REL ? await tornRun(REL, 'torn-rel') : null, fM = MKNONE ? await tornRun(MKNONE, 'torn-mknone') : null;
  ok(!!fH && !fH.removedT && fH.picturesT === 80, 'CONTROL (r4703: the 162a38203 form — a torn line HOLDS its scope): that profile\'s trace is never trimmed again — RED', fH && { removedT: fH.removedT, picturesT: fH.picturesT });
  ok(!!fR && fR.removedT && fR.tornKept === 0, 'CONTROL (the first pass\'s sweep): its rewrite ERASES the torn line — RED', fR && { removedT: fR.removedT, tornKept: fR.tornKept });
  ok(!!fM && fM.removedM, 'CONTROL (r4703: a refused session-list read read as none): that scope is planned and swept as if it had no sessions — RED', fM && { removedM: fM.removedM });
}

console.log('— (f2) r4739 M2 (the exactly-once law): an action appended and another REPLACED while a failed read holds the scope are in the index exactly once — through the hold and a new start\'s sweep');
{
  const exactRun = async (Mod, name) => {
    const W = mkWorld(name, { scopes: [{ pid: PE, n: 420 }], recordings: false });   // 420: a retry's parse crosses a slice (SWEEP_SLICE 400) — the 3b0547fb2 form's window
    const file = path.join(W.DATA, T.TRACE_DIR, PE, R.INDEX_FILE), X = idOf(9, 8), Y = idOf(1, 3);   // Y: an action already on file (mkWorld's ids, idOf(k + 1, i))
    const yNew = T.entryFor({ id: Y, at: NOW + 2000, browserKey: 'bk-000000a1', profileId: PE, command: { action: 'type', params: {} }, position: { kind: 'input' } });
    const orig = fs.promises.readFile; let refuse = true, landed = false, tr = null;
    fs.promises.readFile = async function (...a) { if (refuse && String(a[0]) === file) throw Object.assign(new Error('a placed refusal'), { code: 'EACCES' }); return orig.apply(fs.promises, a); };
    const land = () => { if (landed) return; landed = true; tr._appendIndex(PE, newEntry(PE, X)); tr._replaceIndex(PE, yNew); };
    // the PLACED moment: inside a read of the scope's index after the failure (a slice of its parse) — only the 3b0547fb2 retry reads there
    const hold = async ({ where: w, scope }) => { if (!refuse && w === 'read' && scope === PE) land(); };
    let r1 = null, r2 = null, inRead = false;
    try {
      tr = mkTrace(Mod, W, { hold });
      r1 = await tr.sweep();          // the index read refused: the scope held
      refuse = false;
      r2 = await tr.sweep();          // the refusal lifted: held until the next start (no read) — or the retry, the two landing inside its read
      inRead = landed; land();        // no read to land in: they land after the pass, while the scope is held
      tr.shutdown();
    } finally { fs.promises.readFile = orig; }
    const onFile = indexText(W, PE).split('\n').filter((l) => l.includes(X)).length;
    const r3 = await mkTrace(Mod, W).sweep();   // a NEW START over the same data folder: the index read whole, the scope swept (over its bound)
    const es = indexText(W, PE).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const ys = es.filter((e) => e.id === Y);
    return { held1: r1.scopesHeld, held2: r2.scopesHeld, inRead, onFile, swept: (r3.plan.removeFrames || []).some((x) => x.key === PE), x: es.filter((e) => e.id === X).length, y: ys.length, yAt: ys.length ? ys[ys.length - 1].at : null };
  };
  const e = await exactRun(R, 'exact'), eC = CURETIP ? await exactRun(CURETIP, 'exact-curetip') : null;
  ok(e.held1 === 1 && e.held2 === 1 && !e.inRead && e.onFile === 1 && e.swept && e.x === 1 && e.y === 1 && e.yAt === NOW + 2000,
    '(f2) the scope held through the failed read and the next pass; the appended action and the replace stand in the index after a new start\'s sweep and rewrite — EXACTLY ONCE each, the replace\'s version', e);
  ok(!!eC && eC.inRead && (eC.x !== 1 || eC.yAt !== NOW + 2000), 'CONTROL (the 3b0547fb2 retry): the two land inside the retry\'s read; its list replaces the one they were added to and the rewrite erases them — RED', eC);
}

console.log('— (g) the hub\'s stop while a rewrite is in flight; (h) the hold\'s bound; (i) one sweep at a time, the route awaits, the boot does not');
{
  // (g): the stop lands between the temp write and the rename, with an append held — the rename never happens, the held line is
  // written to the index that stands, the temp file is removed
  const stopRun = async (Mod, name) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 40 }], recordings: false });
    const before = indexText(W, P1), sid = idOf(9, 4); let tr = null;
    const hold = async ({ where: w }) => { if (w === 'rewrite-written' && tr) { tr._appendIndex(P1, newEntry(P1, sid)); tr.shutdown(); } };
    tr = mkTrace(Mod, W, { hold });
    let threw = null; try { await tr.sweep(); } catch (e) { threw = e && e.code; }
    const after = indexText(W, P1);
    return { oldStands: after.startsWith(before), heldWritten: after.slice(before.length).includes(sid), tmp: tmpLeft(W, P1).length, threw };
  };
  const g = await stopRun(R, 'stop'), gR = STOPNOWRITE ? await stopRun(STOPNOWRITE, 'stop-nowrite') : null;
  ok(g.oldStands && g.heldWritten && g.tmp === 0, '(g) the hub\'s STOP while a rewrite is in flight: the rename never happens (the index as it stood), the held append is written to it at the stop, no temp file is left', g);
  ok(!!gR && gR.oldStands && !gR.heldWritten, 'CONTROL (g): a stop that does not write the held appends — the action is gone from the index — RED', gR);
  // (g2) r4703, the stop's FIRST window: the rewrite's rename is in the thread pool when the stop comes — PLACED: the pool's rename lands
  // right after the stop's first file call (the one interleave that loses at 162a38203: the held line appended to the old file, then
  // the rename over it)
  const renameRun = async (Mod, name) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 40 }], recordings: false });
    const file = path.join(W.DATA, T.TRACE_DIR, P1, R.INDEX_FILE), sid = idOf(9, 5);
    let tr = null, armed = false, pending = null, landed = null;
    const hold = async ({ where: w }) => { if (w === 'rewrite-written' && tr) { tr._appendIndex(P1, newEntry(P1, sid)); armed = true; } };
    const o = { rename: fs.promises.rename, unlinkSync: fs.unlinkSync, appendFileSync: fs.appendFileSync };
    const land = () => { if (!pending) return; const q = pending; pending = null; try { fs.renameSync(q.from, q.to); landed = { ok: true }; } catch (e) { landed = { code: e && e.code }; } };
    fs.unlinkSync = function (...a) { try { return o.unlinkSync.apply(fs, a); } finally { land(); } };
    fs.appendFileSync = function (...a) { try { return o.appendFileSync.apply(fs, a); } finally { land(); } };
    fs.promises.rename = async function (from, to) {
      if (!(armed && String(to) === file)) return o.rename.call(fs.promises, from, to);
      armed = false; pending = { from: String(from), to: String(to) };   // the rename sent to the pool; the stop comes before it lands
      tr.shutdown(); land();
      if (landed.code) throw Object.assign(new Error('the rename failed'), { code: landed.code });
    };
    let threw = null;
    try { tr = mkTrace(Mod, W, { hold }); try { await tr.sweep(); } catch (e) { threw = e && e.code; } } finally { fs.promises.rename = o.rename; fs.unlinkSync = o.unlinkSync; fs.appendFileSync = o.appendFileSync; }
    return { heldInIndex: indexIds(W, P1).includes(sid), renamed: !!(landed && landed.ok), tmp: tmpLeft(W, P1).length, threw };
  };
  const g2 = await renameRun(R, 'stop-rename'), g2R = UNLINKLAST ? await renameRun(UNLINKLAST, 'stop-rename-old') : null;
  ok(g2.heldInIndex && !g2.renamed && g2.tmp === 0, '(g2) r4703: the stop while the rename is in the thread pool: the temp file goes FIRST, so the rename fails and the old index stands WITH the held append; no temp file left', g2);
  ok(!!g2R && !g2R.heldInIndex && g2R.renamed, 'CONTROL (g2): the 162a38203 order (the held lines appended, then the temp file removed) — the rename lands over them, the action is gone from the index — RED', g2R);
  // (g3) r4703, the stop's SECOND window: the rename has landed and the held batch's append is in flight when the stop comes — PLACED:
  // the stop runs inside that append, which never lands (the process exits)
  const flushRun = async (Mod, name) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 40 }], recordings: false });
    const file = path.join(W.DATA, T.TRACE_DIR, P1, R.INDEX_FILE), before = indexText(W, P1), first = idOf(9, 6), later = idOf(9, 7);
    let tr = null, armed = false;
    const hold = async ({ where: w }) => { if (w === 'rewrite-written' && tr) { tr._appendIndex(P1, newEntry(P1, first)); armed = true; } };
    const o = fs.promises.appendFile;
    fs.promises.appendFile = async function (f, ...rest) {
      if (!(armed && String(f) === file)) return o.call(fs.promises, f, ...rest);
      armed = false; tr._appendIndex(P1, newEntry(P1, later)); tr.shutdown();   // an action meanwhile, then the stop; this append never lands
    };
    try { tr = mkTrace(Mod, W, { hold }); try { await tr.sweep(); } catch { /* the stop */ } } finally { fs.promises.appendFile = o; }
    const ids = indexIds(W, P1);
    return { renamed: !indexText(W, P1).startsWith(before), first: ids.indexOf(first), later: ids.indexOf(later) };
  };
  const g3 = await flushRun(R, 'stop-flush'), g3R = NOFLUSH ? await flushRun(NOFLUSH, 'stop-flush-old') : null;
  ok(g3.renamed && g3.first >= 0 && g3.later > g3.first, '(g3) r4703: the stop while the held batch\'s append is in flight after the rename: the stop writes that batch again, then the later held lines — both in the index, in their order', g3);
  ok(!!g3R && g3R.renamed && g3R.first === -1, 'CONTROL (g3): a stop that writes only the lines still held — the batch in flight is gone from the index — RED', g3R);
  // (h): more than SWEEP_HOLD_MAX appends held — the rewrite gives up before its rename, every held line lands in order
  const many = Array.from({ length: R.SWEEP_HOLD_MAX + 1 }, (_, i) => 'tr-0a' + i.toString(16).padStart(10, '0'));
  const holdRun = async (Mod, name) => {
    const W2 = mkWorld(name, { scopes: [{ pid: P1, n: 40 }], recordings: false });
    const before2 = indexText(W2, P1); let tr2 = null; let done = false;
    const hold2 = async ({ where: w }) => { if (w === 'rewrite-written' && tr2 && !done) { done = true; for (const id of many) tr2._appendIndex(P1, newEntry(P1, id)); } };
    tr2 = mkTrace(Mod, W2, { hold: hold2 });
    await tr2.sweep();
    const after2 = indexText(W2, P1), landed = after2.startsWith(before2) ? after2.slice(before2.length).split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [];
    return { oldStands: after2.startsWith(before2), landed: landed.length, inOrder: J(landed) === J(many), tmp: tmpLeft(W2, P1).length };
  };
  const h = await holdRun(R, 'hold-max'), hR = HOLDNOTHROW ? await holdRun(HOLDNOTHROW, 'hold-max-nothrow') : null;
  ok(typeof R.SWEEP_HOLD_MAX === 'number' && h.oldStands && h.inOrder && h.tmp === 0, `(h) past SWEEP_HOLD_MAX (${R.SWEEP_HOLD_MAX}) held appends the rewrite gives up BEFORE its rename: the old index stands and all ${many.length} held lines land in it, in order — none dropped`, { held: many.length, landed: h.landed, inOrder: h.inOrder });
  ok(!!hR && !hR.oldStands, 'CONTROL (h): a rewrite that renames past its hold\'s bound — the old index is replaced while its appends were held — RED', hR);
  // (i)
  const W3 = mkWorld('once', { scopes: [{ pid: P1, n: 120 }], recordings: false });
  const tr3 = mkTrace(R, W3), p1 = tr3.sweep(), p2 = tr3.sweep();
  await p1;
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8'), bsrc = SRC.slice(SRC.indexOf('  async function boot() {'), SRC.indexOf('  function shutdown()'));
  ok(p1 === p2 && typeof R.SWEEP_SLICE === 'number' && R.SWEEP_SLICE > 0 && rsrc.includes("router.post('/api/browser/housekeeping/sweep', async (req, res) => {") && rsrc.includes('const p = tr.sweep();') && rsrc.includes('const r = await Promise.race([p, bound]);') && bsrc.includes('sweep().catch(') && !/await sweep\(\)/.test(bsrc) && bsrc.includes('sweep: null'),
    '(i) one sweep at a time (a second ask answers with the one running); the sweep-now route awaits it (within its bound); the boot starts it and never waits for it (no step of the boot held)');
}
console.log('— (j) the settings\' hold LIFTS while a sweep runs (r4547): the sweep in flight keeps the verdict it took at its start; the next one reads the bound');
{
  const W = mkWorld('lift', { scopes: [{ pid: P1, n: 40 }], recordings: false });
  const tr = mkTrace(R, W);
  heldNow.on = true;
  const p1 = tr.sweep();          // its verdict taken NOW: the bound unread (sweepNow's first line — const unread = boundUnread())
  heldNow.on = false;             // the hold lifts while it runs (the hub's lift tells the trace settingsLifted(): taps re-armed, no sweep of its own)
  const p2 = tr.sweep();          // one at a time: the ask answers with the sweep running
  const r1 = await p1;
  const kept1 = indexIds(W, P1).length, pics1 = dirFiles(path.join(W.DATA, T.TRACE_DIR, P1)).filter((x) => x.endsWith('.jpg')).length;
  const r2 = await tr.sweep();    // the next sweep (the hour's, or a press): the bound read again
  const liftSrc = SRC.slice(SRC.indexOf('  function settingsLifted() {'), SRC.indexOf('  async function boot() {'));
  ok(p1 === p2 && r1.held === true && r1.removed === 0 && pics1 === 80 && kept1 === 40 && !r2.held && r2.removed > 0 && !/\bsweep\(\)/.test(liftSrc) && SRC.includes('    const unread = boundUnread();\n'),
    '(j) the hold LIFTS while a sweep runs: that sweep FINISHES on the verdict it took at its start (the bound unread: no frame removed, `held` said) — an ask meanwhile answers with it; the lift starts no sweep of its own; the NEXT sweep reads the bound and removes', { held1: r1.held, removed1: r1.removed, removed2: r2.removed, samePromise: p1 === p2 });
}
console.log('— (k) r4703 / r4739, the hung-mount class: the FIRST silent read stops the pass; a silent file has at most ONE read out — three passes ask it once');
{
  const silentRun = async (Mod, name, passes = 1) => {
    const W = mkWorld(name, { scopes: [{ pid: P1, n: 40 }, { pid: P2, n: 40 }], recordings: false });
    const orig = fs.promises.readFile; let asked = 0, hungFile = null, hungAsks = 0, released = false, release = null;
    const hang = new Promise((res) => { release = res; }), settles = [];
    // a PLACED hang: the first index read of the pass, and every later ask of THAT file, waits until the suite releases it (a hung mount);
    // the read's bound, shortened for the suite, says it silent
    fs.promises.readFile = function (...a) {
      const f = String(a[0]);
      if (f.startsWith(W.DATA) && f.endsWith(R.INDEX_FILE)) { asked += 1; if (!released && (hungFile === null || f === hungFile)) { hungFile = f; hungAsks += 1; const q = hang.then(() => orig.apply(fs.promises, a)); settles.push(q); return q; } }
      return orig.apply(fs.promises, a);
    };
    // the read's bound is an unref'd timer and the placed hang holds no handle: a ref'd interval keeps the process up while it runs
    const said = [], rs = []; let after = null, askedFirst = 0, hungAsksAt = 0; const keep = setInterval(() => { }, 1000);
    try {
      const tr = mkTrace(Mod, W, { said, readBound: 40 });
      for (let n = 0; n < passes; n++) { rs.push(await tr.sweep()); if (n === 0) askedFirst = asked; }
      hungAsksAt = hungAsks;
      released = true; release(); await Promise.all(settles); await new Promise((res) => setImmediate(res));   // the read settles (placed)
      if (passes > 1) after = await tr.sweep();
    } finally { fs.promises.readFile = orig; clearInterval(keep); }
    const pics = [P1, P2].map((pid) => dirFiles(path.join(W.DATA, T.TRACE_DIR, pid)).filter((x) => x.endsWith('.jpg')).length);
    const r = rs[0];
    return { asked: askedFirst, stopped: r.stopped || null, removed: r.removed, scopesHeld: r.scopesHeld, said: said.some((x) => /STOPPED at a read that did not answer/.test(x)), hungAsks: hungAsksAt, stops: rs.map((x) => x.stopped || null), removedLater: rs.slice(1).reduce((n, x) => n + x.removed, 0), after: after && { stopped: after.stopped || null, removed: after.removed }, pics: passes > 1 ? null : pics };
  };
  const k = await silentRun(R, 'silent', 3), kR = GOON ? await silentRun(GOON, 'silent-goes-on') : null, kO = NOOUT ? await silentRun(NOOUT, 'silent-asked-again', 3) : null;
  ok(k.asked === 1 && k.stopped === 'silent' && k.removed === 0 && k.scopesHeld === 1 && k.said,
    '(k) the FIRST read that does not answer STOPS the pass: no other scope\'s read is asked of the hung mount (1 asked), nothing is removed, the journal says the pass stopped', k);
  ok(k.hungAsks === 1 && k.stops.every((x) => x === 'silent') && k.removedLater === 0 && !!k.after && k.after.stopped === null && k.after.removed > 0,
    '(k) r4739 THE REQUIRED: while the silent read is still out, that file is NOT asked again — three passes make ONE read (each stops at it, holds the scope, removes nothing); once it settles the next pass asks again and sweeps', { hungAsks: k.hungAsks, stops: k.stops, after: k.after });
  ok(!!kR && kR.asked === 2, 'CONTROL (k): a pass that goes on after a silent read asks the hung mount again (another thread parked there) — RED', kR && { asked: kR.asked });
  ok(!!kO && kO.hungAsks === 3, 'CONTROL (k): a silent file asked again while its read is still out — a thread parked a pass (three passes, three reads) — RED', kO && { hungAsks: kO.hungAsks });
}

console.log('— (l) r4703 / r4739, the REQUIRED: a person\'s Sweep press says what it did NOT sweep — true of the whole sweep, never a path; the ROUTE driven by behaviour');
{
  const SW = await import('../src/lib/browser-session-words.js');
  const n2 = SW.sweepNotDoneText({ scopesHeld: 2 }), run = SW.sweepNotDoneText({ running: { code: 'sweep_running', since: NOW } }), stop = SW.sweepNotDoneText({ stopped: 'silent', scopesHeld: 1, removed: 0 }), whole = SW.sweepNotDoneText({ scopesHeld: 0, removed: 3 });
  const EN_NOT = '{n} profile(s) were not swept: their trace list could not be read, and VibeSpace reads it again at its next start', EN_RUN = 'The sweep is still running (started {at}) and finishes by itself', EN_STOP = 'The data folder did not answer in time, so the sweep stopped and removed nothing';
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const rows = [EN_NOT, EN_RUN, EN_STOP].every((k) => zh.includes('  ' + JSON.stringify(k) + ': ') && ja.includes('  ' + JSON.stringify(k) + ': '));
  ok(n2 === EN_NOT.replace('{n}', '2') && /^The sweep is still running \(started .+\) and finishes by itself$/.test(run) && stop === EN_STOP && whole === '' && rows && ![n2, stop].some((x) => /[\/\\]/.test(x)),
    '(l) the words (PURE, src/lib/browser-session-words.js sweepNotDoneText): the profiles not swept by COUNT (until the next start); a sweep that STOPPED says so of the whole sweep (never «1 profile»); the sweep still running with its start; nothing when whole; zh and ja rows', { n2, run, stop, whole, rows });
  const vsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(vsrc.includes('const notDone = sweepNotDoneText(r || {});') && vsrc.includes('if (r && (r.running || r.stopped)) { showToast(notDone, { duration: 8000 }); load(); return; }') && vsrc.includes("+ sweepHeldText(r.held) + (notDone ? ' ' + notDone : '')") && vsrc.includes("}) + (notDone ? ' ' + notDone : ''), { duration: notDone ? 8000 : 6000 });"),
    '(l) the panel\'s toast: still running or stopped — that sentence alone; else after what was removed (with the settings\' hold sentence when both)');
  // THE ROUTE in-process (as test-browser-housekeeping mounts it): POST /api/browser/housekeeping/sweep against a trace on a scratch folder
  const express = require('express'), http = require('node:http');
  const RTE = require('../src/routes/browser-trace.js');
  const mount = async (RT, tr) => {
    RT.setup({ trace: tr, keeper: null });
    const app = express(); app.use(express.json()); app.use(RT.router);
    const srv = http.createServer(app); await new Promise((res) => srv.listen(0, '127.0.0.1', res));
    const url = `http://127.0.0.1:${srv.address().port}/api/browser/housekeeping/sweep`;
    return { press: async () => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); return { status: r.status, body: await r.json() }; }, close: () => { srv.closeAllConnections?.(); srv.close(); } };
  };
  // (l1) the press PAST ITS BOUND by behaviour: the sweep HELD by a placed hold, the press's bound shortened — «still running» by name, the
  // sweep's start; released, the running sweep finishes by itself (no clock judged: the sweep cannot end before the release)
  {
    const W = mkWorld('press-route', { scopes: [{ pid: P1, n: 40 }], recordings: false });
    let release = null; const gate = new Promise((res) => { release = res; });
    const tr = mkTrace(R, W, { hold: async () => { await gate; }, pressBound: 30 });
    const m = await mount(RTE, tr);
    let a1 = null, done = null;
    try { a1 = await m.press(); release(); done = await tr.sweep(); } finally { release(); m.close(); }
    ok(a1.status === 200 && a1.body.ok === true && !!a1.body.running && a1.body.running.code === 'sweep_running' && a1.body.running.since === NOW && !('removed' in a1.body) && !!done && done.removed > 0 && tr.sweepRunningSince() === 0,
      '(l1) the press waits for the sweep up to its bound, then answers {running: {code: sweep_running, since}} — the sweep held, its start named, nothing claimed removed; released, that sweep finishes by itself', { a1: a1.body, removed: done && done.removed });
  }
  // (l2) r4739 M1: the reviewer's scene — five profiles, the first index read silent: the pass stops; the press must say the sweep stopped
  const stopRun = async (RT, name) => {
    const W = mkWorld(name, { scopes: [P1, P2, PT, PE, PM].map((pid) => ({ pid, n: 30 })), recordings: false });
    const orig = fs.promises.readFile; let hung = 0, rel = null; const hang = new Promise((res) => { rel = res; });
    fs.promises.readFile = function (...a) { const f = String(a[0]); if (!hung && f.startsWith(W.DATA) && f.endsWith(R.INDEX_FILE)) { hung = 1; return hang.then(() => orig.apply(fs.promises, a)); } return orig.apply(fs.promises, a); };
    const m = await mount(RT, mkTrace(R, W, { readBound: 40 }));
    let a = null; try { a = await m.press(); } finally { fs.promises.readFile = orig; rel(); m.close(); }
    return { status: a.status, stopped: a.body.stopped || null, removed: a.body.removed, scopesHeld: a.body.scopesHeld, words: SW.sweepNotDoneText(a.body) };
  };
  const l2 = await stopRun(RTE, 'press-stopped'), l2R = RTNOSTOP ? await stopRun(RTNOSTOP, 'press-stopped-dropped') : null;
  ok(l2.status === 200 && l2.stopped === 'silent' && l2.removed === 0 && l2.words === EN_STOP,
    '(l2) r4739 M1: a pass STOPPED at a silent read (five profiles, the first silent) — the press answers stopped and says the sweep stopped and removed nothing, true of the whole sweep', l2);
  ok(!!l2R && l2R.stopped === null && l2R.words === EN_NOT.replace('{n}', '1'), 'CONTROL (l2): a route that drops the stopped fact — the person reads «1 profile not swept» while nothing was swept — RED', l2R);
  // the trace's two facts the route reads: the running sweep's start (0 when none) and the press's bound
  const W = mkWorld('press', { scopes: [{ pid: P1, n: 40 }], recordings: false });
  let release = null; const gate = new Promise((res) => { release = res; });
  const tr = mkTrace(R, W, { hold: async () => { await gate; } });
  const p = tr.sweep(); await new Promise((res) => setImmediate(res));
  const during = tr.sweepRunningSince(); release(); await p; const after = tr.sweepRunningSince();
  ok(during === NOW && after === 0 && tr.sweepPressBound() === R.SWEEP_PRESS_BOUND_MS, '(l) while a sweep runs the trace answers its start; none after; the press\'s bound is the file\'s number (SWEEP_PRESS_BOUND_MS)', { during, after, bound: tr.sweepPressBound() });
}
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 15 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
