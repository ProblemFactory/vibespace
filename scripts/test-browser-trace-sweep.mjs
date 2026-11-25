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
//   (f) a torn or unreadable index: NO removal for that scope, the file byte for byte, one journal line with a count and a code and
//       no path — RED the first pass's (its rewrite erases the torn line);
//   (g) the hub's stop while a rewrite is in flight: it never renames, the held appends are written to the index that stands;
//   (h) the hold is bounded: past SWEEP_HOLD_MAX held appends the rewrite gives up before its rename — every line lands, in order;
//   (i) one sweep at a time; the route awaits it; the boot does not.
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
const P1 = 'bp-000000d1', P2 = 'bp-000000d2', PT = 'bp-000000d3', PE = 'bp-000000d4';
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
const mkTrace = (Mod, W, { hold = null, said = null } = {}) => Mod.create({ dataDir: W.DATA, homeDir: path.join(ROOT, 'home'), keeper: keeperStub, bridge: bridgeStub, serverSetting: (k) => (k === MARK ? (heldNow.on ? HELD : undefined) : heldNow.on && /^browser\./.test(k) ? undefined : settings[k]), broadcast: () => { }, log: { log() { }, info() { }, warn: (m) => { if (said) said.push(String(m)); }, error() { } }, now: () => NOW, sweepEveryMs: 0, sweepHold: hold });
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
const snapSrc = edit(SRC, [['    const planned = [];\n', '    const planned = []; const snapOf = new Map();\n'], ['      planned.push(await scopeForPlanSliced(sc, entries, markers, step));\n', '      snapOf.set(sc, entries.slice()); planned.push(await scopeForPlanSliced(sc, entries, markers, step));\n'], ['      await rewriteIndexAsync(sc, step);\n', '      indexes.set(sc, snapOf.get(sc)); await rewriteIndexAsync(sc, step);\n']]);
const noHoldSrc = edit(SRC, [["    if (rw) { rw.held.push(JSON.stringify(entry) + '\\n');", "    if (false && rw) { rw.held.push(JSON.stringify(entry) + '\\n');"]]);
const dropSrc = edit(SRC, [['      for (;;) {\n        if (rewriting.get(scope) !== rw) break;', '      for (;;) {\n        break; if (rewriting.get(scope) !== rw) break;']]);
ok(!!snapSrc && !!noHoldSrc && !!dropSrc, 'the anchors of the three one-edit copies are in the source (a snapshot at the plan, the append hold cut, the held appends dropped)', { snap: !!snapSrc, noHold: !!noHoldSrc, drop: !!dropSrc });
const SNAP = snapSrc ? M.load('src/server/browser-trace.js', snapSrc, 'snapshot-at-plan') : null;
const NOHOLD = noHoldSrc ? M.load('src/server/browser-trace.js', noHoldSrc, 'no-append-hold') : null;
const DROP = dropSrc ? M.load('src/server/browser-trace.js', dropSrc, 'held-dropped') : null;

console.log('— (a) the differential: the first pass\'s sweep and the new one over the same made-up traces, three sizes and the settings held');
{
  const sizes = [[30, 12], [900, 60], [1600, 90]];   // the largest crosses four slices of the plan
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
    const spec = { scopes: [{ pid: P1, n: 700 }, { pid: P2, n: 60 }] };
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
  const spec = { scopes: [{ pid: P1, n: 1600 }, { pid: P2, n: 90 }] };
  const now1 = await measure(R, mkWorld('count-new', spec));
  const rel1 = REL ? await measure(REL, mkWorld('count-rel', spec)) : null;
  ok(now1.syncCalls === 0 && now1.removed > 0, `(b) the sweep makes NO synchronous file call under the data folder (${now1.removed} actions' frames removed, every file act async)`, now1);
  ok(!!rel1 && rel1.syncCalls > 0, `CONTROL (b): the first pass's sweep makes ${rel1 && rel1.syncCalls} synchronous file calls there (${rel1 && rel1.kinds.join(', ')}) — RED`, rel1);
  ok(now1.maxPerTurn > 0 && now1.maxPerTurn <= R.SWEEP_SLICE, `(c) at most SWEEP_SLICE (${R.SWEEP_SLICE}) entries walked in one turn of the loop — ${now1.maxPerTurn} at most, of 1690`, now1);
  ok(!!rel1 && rel1.maxPerTurn === 1690, `CONTROL (c): the first pass walks all ${rel1 && rel1.maxPerTurn} entries in ONE turn — RED`, rel1);
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

console.log('— (f) a torn or unreadable index: NO removal for that scope, one journal line with a count and a code, no path');
{
  const tornRun = async (Mod, name) => {
    const W = mkWorld(name, { scopes: [{ pid: PT, n: 300 }, { pid: PE, n: 300 }, { pid: P1, n: 300 }], torn: PT, recordings: false });
    const beforeT = indexText(W, PT), beforeE = indexText(W, PE);
    const refuseE = (() => { const orig = fs.promises.readFile; fs.promises.readFile = async function (...a) { if (String(a[0]).startsWith(path.join(W.DATA, T.TRACE_DIR, PE))) throw Object.assign(new Error('a placed refusal'), { code: 'EACCES' }); return orig.apply(fs.promises, a); }; return () => { fs.promises.readFile = orig; }; })();
    const said = [];
    let r = null; try { r = await mkTrace(Mod, W, { said }).sweep(); } finally { refuseE(); }
    const keys = new Set((r.plan.removeFrames || []).map((x) => x.key));
    const line = said.find((x) => /not swept this pass/.test(x)) || '';
    return { removedT: keys.has(PT), removedE: keys.has(PE), removedOther: keys.has(P1), tornKept: indexText(W, PT) === beforeT, unreadKept: indexText(W, PE) === beforeE, picturesT: dirFiles(path.join(W.DATA, T.TRACE_DIR, PT)).filter((x) => x.endsWith('.jpg')).length, line, pathInLine: line.includes(ROOT) };
  };
  const f = await tornRun(R, 'torn-new'), fR = REL ? await tornRun(REL, 'torn-rel') : null;
  ok(!f.removedT && !f.removedE && f.removedOther && f.tornKept && f.unreadKept && f.picturesT === 600 && /2 scope\(s\) not swept this pass/.test(f.line) && /torn ×1/.test(f.line) && /EACCES ×1/.test(f.line) && !f.pathInLine,
    '(f) a scope whose index has a TORN line and one whose read is REFUSED lose nothing (their files byte for byte, every picture kept); the other scope is swept; ONE journal line says it — a count and the codes, no path', f);
  ok(!!fR && fR.removedT && !fR.tornKept, 'CONTROL (f): the first pass\'s sweep removes from the torn scope and its rewrite ERASES the torn line — RED', fR && { removedT: fR.removedT, tornKept: fR.tornKept });
}

console.log('— (g) the hub\'s stop while a rewrite is in flight; (h) the hold\'s bound; (i) one sweep at a time, the route awaits, the boot does not');
{
  // (g): the stop lands between the temp write and the rename, with an append held — the rename never happens, the held line is
  // written to the index that stands, the temp file is removed
  const W = mkWorld('stop', { scopes: [{ pid: P1, n: 700 }], recordings: false });
  const before = indexText(W, P1), sid = idOf(9, 4); let tr = null;
  const hold = async ({ where: w }) => { if (w === 'rewrite-written' && tr) { tr._appendIndex(P1, newEntry(P1, sid)); tr.shutdown(); } };
  tr = mkTrace(R, W, { hold });
  let threw = null; try { await tr.sweep(); } catch (e) { threw = e && e.code; }
  const after = indexText(W, P1);
  const g = { oldStands: after.startsWith(before), heldWritten: after.slice(before.length).includes(sid), tmp: tmpLeft(W, P1).length, threw };
  ok(g.oldStands && g.heldWritten && g.tmp === 0, '(g) the hub\'s STOP while a rewrite is in flight: the rename never happens (the index as it stood), the held append is written to it at the stop, no temp file is left', g);
  // (h): more than SWEEP_HOLD_MAX appends held — the rewrite gives up before its rename, every held line lands in order
  const W2 = mkWorld('hold-max', { scopes: [{ pid: P1, n: 700 }], recordings: false });
  const before2 = indexText(W2, P1), many = Array.from({ length: R.SWEEP_HOLD_MAX + 1 }, (_, i) => 'tr-0a' + i.toString(16).padStart(10, '0'));
  let tr2 = null;
  const hold2 = async ({ where: w }) => { if (w === 'rewrite-written' && tr2 && !hold2.done) { hold2.done = true; for (const id of many) tr2._appendIndex(P1, newEntry(P1, id)); } };
  tr2 = mkTrace(R, W2, { hold: hold2 });
  await tr2.sweep();
  const after2 = indexText(W2, P1), landed = after2.slice(before2.length).split('\n').filter(Boolean).map((l) => JSON.parse(l).id);
  ok(typeof R.SWEEP_HOLD_MAX === 'number' && after2.startsWith(before2) && J(landed) === J(many) && tmpLeft(W2, P1).length === 0, `(h) past SWEEP_HOLD_MAX (${R.SWEEP_HOLD_MAX}) held appends the rewrite gives up BEFORE its rename: the old index stands and all ${many.length} held lines land in it, in order — none dropped`, { held: many.length, landed: landed.length, inOrder: J(landed) === J(many) });
  // (i)
  const W3 = mkWorld('once', { scopes: [{ pid: P1, n: 120 }], recordings: false });
  const tr3 = mkTrace(R, W3), p1 = tr3.sweep(), p2 = tr3.sweep();
  await p1;
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8'), bsrc = SRC.slice(SRC.indexOf('  async function boot() {'), SRC.indexOf('  function shutdown()'));
  ok(p1 === p2 && typeof R.SWEEP_SLICE === 'number' && R.SWEEP_SLICE > 0 && rsrc.includes("router.post('/api/browser/housekeeping/sweep', async (req, res) => {") && rsrc.includes('const r = await tr.sweep();') && bsrc.includes('sweep().catch(') && !/await sweep\(\)/.test(bsrc) && bsrc.includes('sweep: null'),
    '(i) one sweep at a time (a second ask answers with the one running); the sweep-now route awaits it; the boot starts it and never waits for it (no step of the boot held)');
}
console.log('— (j) the settings\' hold LIFTS while a sweep runs (r4547): the sweep in flight keeps the verdict it took at its start; the next one reads the bound');
{
  const W = mkWorld('lift', { scopes: [{ pid: P1, n: 700 }], recordings: false });
  const tr = mkTrace(R, W);
  heldNow.on = true;
  const p1 = tr.sweep();          // its verdict taken NOW: the bound unread (sweepNow's first line — const unread = boundUnread())
  heldNow.on = false;             // the hold lifts while it runs (the hub's lift tells the trace settingsLifted(): taps re-armed, no sweep of its own)
  const p2 = tr.sweep();          // one at a time: the ask answers with the sweep running
  const r1 = await p1;
  const kept1 = indexIds(W, P1).length, pics1 = dirFiles(path.join(W.DATA, T.TRACE_DIR, P1)).filter((x) => x.endsWith('.jpg')).length;
  const r2 = await tr.sweep();    // the next sweep (the hour's, or a press): the bound read again
  const liftSrc = SRC.slice(SRC.indexOf('  function settingsLifted() {'), SRC.indexOf('  async function boot() {'));
  ok(p1 === p2 && r1.held === true && r1.removed === 0 && pics1 === 1400 && kept1 === 700 && !r2.held && r2.removed > 0 && !/\bsweep\(\)/.test(liftSrc) && SRC.includes('    const unread = boundUnread();\n'),
    '(j) the hold LIFTS while a sweep runs: that sweep FINISHES on the verdict it took at its start (the bound unread: no frame removed, `held` said) — an ask meanwhile answers with it; the lift starts no sweep of its own; the NEXT sweep reads the bound and removes', { held1: r1.held, removed1: r1.removed, removed2: r2.removed, samePromise: p1 === p2 });
}
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
