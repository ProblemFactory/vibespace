#!/usr/bin/env node
// THE DEFERRED RECORDS PER WRITER CLASS — the PURE gate (fast; B-4767, phone-arrangement-verify r2 F5; docs/kb-design-lessons.md
// §6b guard 3 + guard 10). A layout-sync that lands while this page's pointer is down (or inside `_restoring`) waits in
// LayoutManager._pendingRemote. The slot kept ONE record per desktop regardless of writer, so a PHONE record (applied to a
// desktop as membership + content only, guard 10) that landed after a deferred DESKTOP record replaced it: the window move
// that desktop record carried never landed here. src/lib/layout-model.js owns the slot's rule; this suite pins it — no DOM:
//   ① writerClass: a `phone` stamp (on the layout-sync or in its record) ⇒ phone; a re-read (resync) ⇒ desktop (the record on
//      disk is taken whole); unstamped (a pre-.264 sender) / desktop / an unknown stamp ⇒ desktop
//   ② deferKey / deferKeysOf: the desktop class keeps the key the map always had (the desktop's id, '' = legacy); the phone
//      class waits under 'phone:' + id — newest per desktop AND class
//   ③ releaseNext: the lowest seq first across classes and desktops (the server's seq = the arrival order; a re-read's record
//      has none and goes first; equal seqs keep the map's order); a record not newer than the newest APPLIED for its desktop
//      is dropped (never applied backwards), other desktops untouched; noteApplied keeps the max per desktop
//   ④ THE SCENARIOS: F5 (desktop deferred → phone → release ⇒ the move AND the phone's membership land), the mirror (phone
//      then desktop), the pre-.264 stamp, a burst per class (newest per class wins), two desktops, the drop
//   ⑤ DEFERRAL IS INVISIBLE (seeded fuzz): for 3000 random arrival sequences (2 desktops, phone / desktop / unstamped / an
//      unknown stamp) the records deferred and released end where applying each one LIVE in arrival order ends — a desktop
//      record sets arrangement + membership, a phone record membership only
//   ⑥ THE WIRING in src/lib/layout.js + desktop-manager.js: the ONE slot writer keys by deferKey, the drain asks releaseNext
//      and drops its `drop`, every apply notes its seq, a reconnect clears the applied seqs, a record arriving while others
//      wait joins them, the apply's membership-only law asks the same writerClass, a deleted desktop forgets both slots
//   ⑦ NEGATIVE CONTROLS — patched copies (scripts/mutant-copy.mjs): the single slot restored (F5's move is lost), the drain
//      in map order (the mirror's membership is undone), no drop (an older record lands after a newer one), the resync
//      read as a phone record — each turns its own leg RED
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/lib/layout-model.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
const J = JSON.stringify;

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };

/** The toy apply law (layout.js _applyRemoteState under guard 10): a desktop-class record sets the desktop's arrangement
 *  AND membership, a phone-class one its membership only. */
const applyToy = (Mod, state, msg) => {
  const d = msg.desktopId || '';
  const cur = state[d] || { arr: null, mem: null };
  state[d] = Mod.writerClass(msg) === 'phone' ? { ...cur, mem: msg.mem } : { arr: msg.arr, mem: msg.mem };
};
/** Every arrival deferred (the pointer held), then released as layout.js's drain does: one per tick, `drop` dropped. */
const deferThenRelease = (Mod, arrivals, { applied = new Map(), state = {} } = {}) => {
  const pending = new Map();
  for (const m of arrivals) pending.set(Mod.deferKey(m), m);
  const order = [];
  for (let guard = 0; pending.size && guard < 100; guard++) {
    const { next, drop } = Mod.releaseNext(pending, applied);
    for (const k of drop) { pending.delete(k); order.push('drop:' + k); }
    if (next) { pending.delete(next[0]); applyToy(Mod, state, next[1]); Mod.noteApplied(applied, next[1]); order.push(next[0] + '#' + (next[1].seq || 0)); }
  }
  return { state, order, applied };
};
const live = (Mod, arrivals, state = {}) => { for (const m of arrivals) applyToy(Mod, state, m); return state; };
const rec = (seq, desktopId, viewport, arr, mem, extra = {}) => ({ type: 'layout-sync', seq, desktopId, ...(viewport ? { viewport } : {}), arr, mem, state: { windows: [] }, ...extra });

function legs(Mod, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!c) failed.push(n); if (!quiet) ok(c, n, extra); };

  // ① writerClass
  leg(Mod.writerClass(rec(1, 'd', 'phone')) === 'phone' && Mod.writerClass({ desktopId: 'd', state: { viewport: 'phone' } }) === 'phone', '① a phone stamp — on the layout-sync or in its record — is the phone class');
  leg(Mod.writerClass(rec(1, 'd', 'desktop')) === 'desktop' && Mod.writerClass(rec(1, 'd')) === 'desktop' && Mod.writerClass(rec(1, 'd', 'tablet')) === 'desktop' && Mod.writerClass(null) === 'desktop',
    '① desktop, UNSTAMPED (a pre-.264 sender) and an unknown stamp are the desktop class');
  leg(Mod.writerClass({ desktopId: 'd', resync: true, state: { viewport: 'phone' } }) === 'desktop', '① a re-read (resync) of a phone-written record is the desktop class — the record on disk is taken whole (F1)');
  leg(Mod.writerClass({ desktopId: 'd', viewport: 'desktop', state: { viewport: 'phone' } }) === 'desktop', '① the layout-sync\'s own stamp wins over a stamp its record still holds');

  // ② keys
  leg(Mod.deferKey(rec(1, 'desk-a', 'desktop')) === 'desk-a' && Mod.deferKey(rec(1, 'desk-a')) === 'desk-a' && Mod.deferKey({ seq: 1 }) === '', '② a desktop-class record keeps the key the map always had (the desktop\'s id; \'\' = the legacy single record)');
  leg(Mod.deferKey(rec(1, 'desk-a', 'phone')) === 'phone:desk-a' && Mod.deferKey(rec(1, 'desk-a', 'phone')) !== Mod.deferKey(rec(2, 'desk-a', 'desktop')), '② a phone record waits in a slot of its own beside the desktop record of the same desktop');
  leg(J(Mod.deferKeysOf('desk-a')) === J(['desk-a', 'phone:desk-a']) && J(Mod.deferKeysOf(undefined)) === J(['', 'phone:']), '② deferKeysOf names both slots of a desktop');

  // ③ releaseNext / noteApplied
  {
    const p = new Map([['phone:a', rec(7, 'a', 'phone')], ['b', rec(3, 'b')], ['a', rec(5, 'a', 'desktop')]]);
    const r = Mod.releaseNext(p, new Map());
    leg(r.next && r.next[0] === 'b' && !r.drop.length, '③ the lowest seq goes first, across classes and desktops (not the map\'s order)', J(r));
    const q = new Map([['a', { desktopId: 'a', resync: true }], ['phone:a', rec(2, 'a', 'phone')]]);
    leg(Mod.releaseNext(q, new Map()).next[0] === 'a', '③ a re-read\'s record (no seq) goes first');
    const t = new Map([['x', rec(4, 'x')], ['y', rec(4, 'y')]]);
    leg(Mod.releaseNext(t).next[0] === 'x', '③ equal seqs keep the map\'s order (the stable sort it replaces)');
    const o = Mod.releaseNext({ a: rec(9, 'a'), b: rec(8, 'b') });
    leg(o.next && o.next[0] === 'b', '③ a plain object of slots is read like the map');
    const applied = new Map([['a', 6]]);
    const d = Mod.releaseNext(new Map([['a', rec(5, 'a', 'desktop')], ['phone:a', rec(6, 'a', 'phone')], ['b', rec(2, 'b')], ['phone:a2', rec(7, 'a', 'phone')]]), applied);
    leg(J(d.drop) === J(['a', 'phone:a']) && d.next && d.next[0] === 'b', '③ a record NOT NEWER than the newest applied for its desktop is dropped (5 and 6 under 6), another desktop\'s older seq is not', J(d));
    leg(Mod.releaseNext(new Map([['a', { desktopId: 'a', resync: true }]]), applied).drop.length === 0, '③ a re-read\'s record (no seq) is never dropped by the seq rule');
    leg(Mod.releaseNext(new Map(), applied).next === null && Mod.releaseNext(null).next === null, '③ nothing waiting ⇒ nothing next');
    const m = new Map();
    Mod.noteApplied(m, rec(5, 'a')); Mod.noteApplied(m, rec(3, 'a')); Mod.noteApplied(m, rec(9, 'b', 'phone')); Mod.noteApplied(m, { desktopId: 'a', resync: true });
    leg(m.get('a') === 5 && m.get('b') === 9 && m.size === 2, '③ noteApplied keeps the newest seq per desktop (both classes; a re-read notes nothing)', J([...m]));
  }

  // ④ the scenarios
  {
    // F5: a desktop record (another desktop moved a window: arrangement A1) is deferred under the pointer, then a phone record
    // (membership M2: the phone opened a window) arrives for the same desktop — the release applies both, in that order
    const base = { a: { arr: 'A0', mem: 'M0' } };
    const f5 = [rec(5, 'a', 'desktop', 'A1', 'M1'), rec(6, 'a', 'phone', 'A0-held', 'M2')];
    const r = deferThenRelease(Mod, f5, { state: JSON.parse(J(base)) });
    leg(r.state.a.arr === 'A1' && r.state.a.mem === 'M2', '④ F5: desktop record deferred → phone record → release ⇒ the desktop\'s window move LANDS and the phone\'s membership change lands', J(r));
    leg(J(r.order) === J(['a#5', 'phone:a#6']), '④ F5: …applied in arrival order, each once (the desktop record, then the phone\'s)', J(r.order));
    const mirror = [rec(5, 'a', 'phone', 'A0-held', 'M1'), rec(6, 'a', 'desktop', 'A2', 'M2')];
    const m = deferThenRelease(Mod, mirror, { state: JSON.parse(J(base)) });
    leg(m.state.a.arr === 'A2' && m.state.a.mem === 'M2' && J(m.order) === J(['phone:a#5', 'a#6']), '④ the mirror: phone first, then desktop ⇒ the phone record applies first and the desktop record (whole) after it', J(m));
    const old = [rec(5, 'a', undefined, 'A3', 'M1'), rec(6, 'a', 'phone', 'A0-held', 'M2')];
    const o = deferThenRelease(Mod, old, { state: JSON.parse(J(base)) });
    leg(o.state.a.arr === 'A3' && o.state.a.mem === 'M2', '④ a pre-.264 sender (no stamp) counts as desktop: its move lands, then the phone\'s membership', J(o));
    const burst = [rec(3, 'a', 'desktop', 'A1', 'M1'), rec(4, 'a', 'phone', 'x', 'M2'), rec(5, 'a', 'desktop', 'A3', 'M3'), rec(6, 'a', 'phone', 'x', 'M4'), rec(7, 'b', 'desktop', 'B1', 'N1')];
    const b = deferThenRelease(Mod, burst, { state: JSON.parse(J(base)) });
    leg(J(b.order) === J(['a#5', 'phone:a#6', 'b#7']) && b.state.a.arr === 'A3' && b.state.a.mem === 'M4' && b.state.b.arr === 'B1', '④ a burst keeps the newest per desktop AND class (3 and 4 superseded), two desktops one slot each', J(b));
    const dropped = deferThenRelease(Mod, [rec(5, 'a', 'desktop', 'A1', 'M1')], { applied: new Map([['a', 6]]), state: { a: { arr: 'A6', mem: 'M6' } } });
    leg(dropped.state.a.arr === 'A6' && dropped.state.a.mem === 'M6' && J(dropped.order) === J(['drop:a']), '④ a deferred record older than one applied meanwhile is dropped at release — never applied backwards', J(dropped));
  }

  // ⑤ deferral is invisible (seeded fuzz)
  {
    // mulberry32 — a plain LCG's low bits cycle (seed % 2 alternates), which would walk a handful of sequences only
    let seed = 0x4767;
    const rnd = (n) => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) % n); };
    const STAMPS = ['phone', 'desktop', undefined, 'tablet'];
    let bad = null, runs = 0; const shapes = new Set();
    for (let i = 0; i < 3000 && !bad; i++) {
      const n = 1 + rnd(8), arrivals = [];
      for (let k = 0; k < n; k++) { const d = ['a', 'b'][rnd(2)]; arrivals.push(rec(10 + k, d, STAMPS[rnd(4)], 'A' + k, 'M' + k)); }
      const start = () => ({ a: { arr: 'A-', mem: 'M-' }, b: { arr: 'B-', mem: 'N-' } });
      const want = live(Mod, arrivals, start()), got = deferThenRelease(Mod, arrivals, { state: start() }).state;
      runs++; shapes.add(arrivals.map((m) => m.desktopId + (m.viewport || '-')).join());
      if (J(want) !== J(got)) bad = { arrivals: arrivals.map((m) => [m.seq, m.desktopId, m.viewport || '-']), want, got };
    }
    leg(!bad && shapes.size > 1000, `⑤ DEFERRAL IS INVISIBLE: ${runs} random arrival sequences (${shapes.size} distinct) (2 desktops; phone / desktop / unstamped / unknown) deferred and released end where applying each LIVE in arrival order ends`, J(bad));
  }
  return failed;
}

console.log('— ①–⑤ the PURE model (src/lib/layout-model.js)');
const Model = require(path.join(REPO, MODEL));
const realFailed = legs(Model);

// ⑥ the wiring
console.log('— ⑥ the wiring (src/lib/layout.js, src/lib/desktop-manager.js)');
{
  const L = fs.readFileSync(path.join(REPO, 'src/lib/layout.js'), 'utf8');
  const D = fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8');
  ok(/import \{ writerClass, deferKey, deferKeysOf, releaseNext, noteApplied \} from '\.\/layout-model\.js';/.test(L) && /import \{ deferKeysOf \} from '\.\/layout-model\.js';/.test(D), '⑥ layout.js and desktop-manager.js import the model (the ONE rule, no copy)');
  const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js'));
  const writers = libFiles.flatMap((f) => (fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8').match(/_pendingRemote\??\.set\(/g) || []).map(() => f));
  ok(J(writers) === J(['layout.js']) && L.includes('    this._pendingRemote.set(deferKey(msg), msg);\n'), '⑥ ONE writer of the deferred slot in src/lib (layout.js _deferRemote), keyed by deferKey — desktop AND writer class', J(writers));
  ok(L.includes('      const { next, drop } = releaseNext(this._pendingRemote, this._appliedSeq);\n      for (const k of drop) this._pendingRemote.delete(k);\n      if (next) { this._pendingRemote.delete(next[0]); this._handleRemoteSync(next[1]); }\n'), '⑥ the drain asks releaseNext with the applied seqs, drops what it drops and applies ONE record per tick');
  ok(/  _handleRemoteSync\(msg\) \{\n    noteApplied\(this\._appliedSeq, msg\);/.test(L), '⑥ every apply (live, drained, re-read, cached) notes its seq first');
  ok(/app\.ws\.onStateChange\(\(connected\) => \{ if \(connected\) this\._appliedSeq\.clear\(\); \}\);/.test(L) && /this\._lastRemoteSeq = 0;/.test(L), '⑥ a reconnect clears the applied seqs with `_lastRemoteSeq` (the server\'s seq restarts with the socket — guard 1)');
  ok(L.includes('      if (this._restoring || this._pointerDown || this._pendingRemote.size) { this._deferRemote(msg); return; }\n'), '⑥ a record that arrives while others still wait (the drain after a pointerup) joins them — never applied before an older one');
  ok(L.includes("    const membershipOnly = writerClass(msg) === 'phone' && !this.app.isMobile;") && !/\(msg\.viewport \?\? msg\.state\?\.viewport\) === 'phone'/.test(L), '⑥ the apply\'s membership-only law (guard 10) asks the SAME writerClass the slot keys by — no second spelling');
  ok(/const phoneKey = deferKeysOf\(key\)\[1\], phonePend = this\._pendingRemote\.get\(phoneKey\);\n\s+if \(phonePend && \(phonePend\.receivedAt \|\| 0\) < startedAt\) this\._pendingRemote\.delete\(phoneKey\);/.test(L), '⑥ the re-read drops a phone record deferred BEFORE it was asked (the read holds it), keeps one received while it was in flight');
  ok(D.includes('for (const k of deferKeysOf(id)) this.app.layoutManager?._pendingRemote?.delete(k);'), '⑥ a deleted desktop forgets BOTH its deferred slots (never a ghost phone record the drain fills)');
  ok(/if \(msg\.seq <= this\._lastRemoteSeq\) return;/.test(L) && /const EPS = 0\.002;/.test(L), '⑥ guards 1 and 4 untouched (the seq drop of a stale echo; the 0.002 apply epsilon)');
}

console.log('— ⑦ negative controls (patched copies, scripts/mutant-copy.mjs)');
const M = mutantCopies('layout-model', REPO);
const MUTANTS = [
  { tag: 'single-slot', find: "const deferKey = (msg) => (writerClass(msg) === 'phone' ? PHONE_SLOT : '') + desktopOf(msg);", repl: 'const deferKey = (msg) => desktopOf(msg);', expect: /④ F5: desktop record deferred/ },
  { tag: 'drain-in-map-order', find: '    if (!next || seq < seqOf(next[1])) next = e;', repl: '    if (!next) next = e;', expect: /lowest seq goes first|④ the mirror|DEFERRAL IS INVISIBLE/ },
  { tag: 'no-drop', find: '    if (seq > 0 && applied && seq <= (Number(applied.get(desktopOf(e[1]))) || 0)) { drop.push(e[0]); continue; }\n', repl: '\n', expect: /never applied backwards/ },
  { tag: 'resync-as-phone', find: "  if (!msg || msg.resync) return 'desktop';\n", repl: "  if (!msg) return 'desktop';\n", expect: /re-read \(resync\) of a phone-written record/ },
];
for (const m of MUTANTS) {
  const found = SRC.includes(m.find);
  ok(found, `control ${m.tag}: the patched line exists in the model (the control judges the current source)`);
  if (!found) continue;
  const Mod = M.load(MODEL, SRC.replace(m.find, m.repl), m.tag);
  const f = legs(Mod, { quiet: true });
  ok(f.some((n) => m.expect.test(n)), `control ${m.tag}: the patched copy turns its leg RED (${f.length} legs failed: ${f.slice(0, 2).join(' | ').slice(0, 200)})`);
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length })) ok(r.pass, r.name, r.detail);

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail || realFailed.length ? 1 : 0);
