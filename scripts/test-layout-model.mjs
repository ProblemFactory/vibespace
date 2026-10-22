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
//      wait joins them, the apply's layer law asks the same writerClass, a deleted desktop forgets both slots
//   ⑦ NEGATIVE CONTROLS — patched copies (scripts/mutant-copy.mjs): the single slot restored (F5's move is lost), the drain
//      in map order (the mirror's membership is undone), no drop (an older record lands after a newer one), the resync
//      read as a phone record — each turns its own leg RED (the read half's controls live in test-desktop-record §7)
//   ⑧ THE READ HALF composes with this predicate (lane phone-sidebar-chrome's table, lane layout-layers-p0's law): the
//      model keeps no second read rule (chromeToApply / TAKEN_WHOLE folded into desktop-record.js applyForViewport); asked
//      with writerClass(msg), {phone, desktop} × {phone-written, stamped in the record, desktop-written, unstamped, a
//      re-read} — a phone applies no record's sidebar / grid; a desktop a desktop-class record's, never a live phone one's
//   ⑩ A RECORD NEVER GOES BACKWARDS (lane layout-stale-record-sync, the owner 2026-10-22): recordStamp (the layout-sync's
//      server stamp, else its record's; 0 = none), behindStamp (older than the newest applied for its desktop ⇒ never applied;
//      equal, newer, unstamped, another desktop ⇒ applied), noteStamp (the max per desktop, never lowered); the wake's scenario
//      (a relayed record applied, the re-read's record, a broadcast from before the sleep drained after it). Wiring in ⑥: the
//      apply asks behindStamp first and notes the stamp, the ack notes the page's own write's stamp, every send names `base`
//      (desktop-manager stampOf). Controls in ⑦: the stamp blind, the stamp lowered.
//   ⑨ THE READ CENSUS (static, acorn — comments and strings never count; THE LAYER LAW, design q-039 P0): every read of a
//      record's arrangement / chrome / preference field in src/lib/layout.js comes off a subset applyForViewport handed
//      the page (a binding of its answer, an alias of one, arrangementFor of one, or a RECEIVER's parameter every caller
//      hands a subset) or a PAGE object (this, win, winInfo, el, Math) — else RED by name, bar one DECLARED row; every ask
//      is a READ_SITES row (method · source · count), spelled applyForViewport(this._viewport(), …), a remote one with
//      writerClass(msg); `membershipOnly` is gone. Ten planted RED controls (the pre-fix live sidebar, the pre-fix boot
//      grid, a raw box apply, a forged subset, a desk-spelled viewport, a phone writer read as a desk, a preset asking as
//      the boot, membershipOnly back, a receiver fed the record, a new door off the raw record) + the blind-spot control
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
  // ⑧ THE READ HALF composes with this predicate: desktop-record.js applyForViewport asked with writerClass(msg)
  {
    const DR = require(path.join(REPO, 'src/lib/desktop-record.js'));
    leg(!('chromeToApply' in Mod) && !('TAKEN_WHOLE' in Mod), '⑧ the model keeps no second read rule — chromeToApply / TAKEN_WHOLE folded into desktop-record.js applyForViewport (the layer law: one function, not two)');
    const RECORDS = [
      ['phone-written (live)', rec(1, 'd', 'phone'), false],
      ['phone-written (stamp in the record)', { desktopId: 'd', state: { viewport: 'phone', windows: [] } }, false],
      ['desktop-written (live)', rec(1, 'd', 'desktop'), true],
      ['unstamped (a pre-.264 sender)', rec(1, 'd'), true],
      ['a re-read of a phone-written record', { desktopId: 'd', resync: true, state: { viewport: 'phone', windows: [] } }, true],
    ];
    const table = [], bad = [];
    for (const viewport of ['phone', 'desktop']) for (const [label, msg, deskApplies] of RECORDS) {
      const v = DR.applyForViewport(viewport, { ...msg.state, sidebarOpen: true, grid: { rows: 1, cols: 3 } }, { source: 'remote', writer: Mod.writerClass(msg) });
      const got = (v.chrome && v.chrome.sidebarOpen ? 'sidebar' : '-') + ' · ' + (v.arrangement && v.arrangement.grid ? 'grid' : '-');
      const want = viewport === 'desktop' && deskApplies ? 'sidebar · grid' : '- · -';
      table.push(`${viewport} × ${label} → ${got}`);
      if (got !== want) bad.push(`${viewport} × ${label}: ${got} (want ${want})`);
    }
    if (!quiet) console.log('    ⑧ ' + table.join('\n    ⑧ '));
    leg(!bad.some((b) => b.startsWith('phone')), '⑧ a PHONE applies no record\'s sidebar or grid, by any writer (inc-mv8l2frb-xkqm) — applyForViewport × writerClass', J(bad));
    leg(!bad.some((b) => b.startsWith('desktop') && b.includes('phone-written')), '⑧ a DESKTOP applies a phone-written live record\'s sidebar / grid: none (membership only — by class)', J(bad));
    leg(!bad.some((b) => b.startsWith('desktop') && !b.includes('phone-written')), '⑧ a DESKTOP applies a desktop-written, an unstamped and a re-read record\'s sidebar / grid (a re-read is the record on disk taken whole)', J(bad));
  }
  // ⑩ A RECORD NEVER GOES BACKWARDS (lane layout-stale-record-sync)
  {
    const { recordStamp, behindStamp, noteStamp } = Mod;
    leg(recordStamp({ updatedAt: 7, state: { updatedAt: 3 } }) === 7 && recordStamp({ resync: true, state: { updatedAt: 3 } }) === 3 && recordStamp({ state: {} }) === 0 && recordStamp(null) === 0 && recordStamp({ updatedAt: 'x' }) === 0, '⑩ recordStamp: the layout-sync\'s server stamp, else its record\'s (a re-read); 0 when it names none (an older server) or garbage');
    const st = new Map([['desk-a', 5000]]);
    const rows = [[3000, 'desk-a', true], [5000, 'desk-a', false], [6000, 'desk-a', false], [0, 'desk-a', false], [1000, 'desk-b', false]];
    leg(rows.every(([t, d, want]) => behindStamp(st, { desktopId: d, ...(t ? { updatedAt: t } : {}) }) === want) && behindStamp(null, { updatedAt: 1 }) === false, '⑩ behindStamp: a record OLDER than the newest applied for its desktop is behind; equal, newer, unstamped and another desktop\'s are not', J(rows.map(([t, d]) => behindStamp(st, { desktopId: d, updatedAt: t }))));
    const n = new Map(); noteStamp(n, 'desk-a', 5000); noteStamp(n, 'desk-a', 3000); noteStamp(n, 'desk-a', 'x'); noteStamp(n, null, 9); noteStamp(null, 'desk-a', 1);
    leg(n.get('desk-a') === 5000 && n.get('') === 9 && n.size === 2, '⑩ noteStamp keeps the newest per desktop — never lowered; garbage ignored; \'\' is the legacy record', J([...n]));
    // the wake: a relayed record applied (5000), the re-read's (5000, the record on disk), then a broadcast from before the sleep
    const applied = new Map(), seq = [{ desktopId: 'desk-a', seq: 9, updatedAt: 5000 }, { desktopId: 'desk-a', resync: true, state: { updatedAt: 5000 } }, { desktopId: 'desk-a', seq: 4, updatedAt: 3000 }];
    const landed = seq.map((m) => { if (behindStamp(applied, m)) return false; noteStamp(applied, m.desktopId, recordStamp(m)); return true; });
    leg(J(landed) === J([true, true, false]), '⑩ THE WAKE: the relayed record and the re-read land; a broadcast from before the sleep, drained after them, is older — never applied', J(landed));
  }
  return failed;
}

console.log('— ①–⑤, ⑧ the PURE model (src/lib/layout-model.js)');
const Model = require(path.join(REPO, MODEL));
const realFailed = legs(Model);

// ⑥ the wiring
console.log('— ⑥ the wiring (src/lib/layout.js, src/lib/desktop-manager.js)');
{
  const L = fs.readFileSync(path.join(REPO, 'src/lib/layout.js'), 'utf8');
  const D = fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8');
  ok(/import \{ writerClass, deferKey, deferKeysOf, releaseNext, noteApplied, recordStamp, behindStamp, noteStamp \} from '\.\/layout-model\.js';/.test(L) && /import \{ applyForViewport, arrangementFor \} from '\.\/desktop-record\.js';/.test(L) && /import \{ deferKeysOf \} from '\.\/layout-model\.js';/.test(D), '⑥ layout.js and desktop-manager.js import the model (the ONE rule, no copy)');
  const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js'));
  const writers = libFiles.flatMap((f) => (fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8').match(/_pendingRemote\??\.set\(/g) || []).map(() => f));
  ok(J(writers) === J(['layout.js']) && L.includes('    this._pendingRemote.set(deferKey(msg), msg);\n'), '⑥ ONE writer of the deferred slot in src/lib (layout.js _deferRemote), keyed by deferKey — desktop AND writer class', J(writers));
  ok(L.includes('      const { next, drop } = releaseNext(this._pendingRemote, this._appliedSeq);\n      for (const k of drop) this._pendingRemote.delete(k);\n      if (next) { this._pendingRemote.delete(next[0]); this._handleRemoteSync(next[1]); }\n'), '⑥ the drain asks releaseNext with the applied seqs, drops what it drops and applies ONE record per tick');
  ok(/  _handleRemoteSync\(msg\) \{\n    noteApplied\(this\._appliedSeq, msg\);/.test(L), '⑥ every apply (live, drained, re-read, cached) notes its seq first');
  ok(/app\.ws\.onStateChange\(\(connected\) => \{ if \(connected\) this\._appliedSeq\.clear\(\); \}\);/.test(L) && /this\._lastRemoteSeq = 0;/.test(L), '⑥ a reconnect clears the applied seqs with `_lastRemoteSeq` (the server\'s seq restarts with the socket — guard 1)');
  ok(L.includes('      if (this._restoring || this._pointerDown || this._pendingRemote.size) { this._deferRemote(msg); return; }\n'), '⑥ a record that arrives while others still wait (the drain after a pointerup) joins them — never applied before an older one');
  ok(L.includes("    this._applyRemoteState(msg.state, { closeOnlyWired: !!msg.resync, receivedAt, writer: writerClass(msg) });") && !/\(msg\.viewport \?\? msg\.state\?\.viewport\) === 'phone'/.test(L), '⑥ the apply\'s layer law (guard 10) asks the SAME writerClass the slot keys by — no second spelling');
  ok(/const phoneKey = deferKeysOf\(key\)\[1\], phonePend = this\._pendingRemote\.get\(phoneKey\);\n\s+if \(phonePend && \(phonePend\.receivedAt \|\| 0\) < startedAt\) this\._pendingRemote\.delete\(phoneKey\);/.test(L), '⑥ the re-read drops a phone record deferred BEFORE it was asked (the read holds it), keeps one received while it was in flight');
  ok(D.includes('for (const k of deferKeysOf(id)) this.app.layoutManager?._pendingRemote?.delete(k);'), '⑥ a deleted desktop forgets BOTH its deferred slots (never a ghost phone record the drain fills)');
  ok(/if \(msg\.seq <= this\._lastRemoteSeq\) return;/.test(L) && /const EPS = 0\.002;/.test(L), '⑥ guards 1 and 4 untouched (the seq drop of a stale echo; the 0.002 apply epsilon)');
  const hrs = L.indexOf('  _handleRemoteSync(msg) {'), hrsBody = L.slice(hrs, L.indexOf('\n  }\n', hrs));
  ok(hrs > 0 && /if \(behindStamp\(this\._appliedStamps, msg\)\) \{[^\n]*return; \}\n\s+noteStamp\(this\._appliedStamps, msg\.desktopId, recordStamp\(msg\)\); dm\?\.noteStamp\?\.\(msg\.desktopId, recordStamp\(msg\)\);/.test(hrsBody) && hrsBody.indexOf('behindStamp(') < hrsBody.indexOf('cacheRemoteState(') && hrsBody.indexOf('behindStamp(') < hrsBody.indexOf('_applyRemoteState('), '⑩ the apply (live, drained, re-read, cached) asks behindStamp BEFORE it caches or applies a record, then notes the stamp — the base of the next write (lane layout-stale-record-sync)');
  ok(/app\.ws\.onGlobal\(\(msg\) => \{ if \(msg\.type === 'layout-sync-ack' && msg\.updatedAt\) this\.app\.desktopManager\?\.noteStamp\?\.\(msg\.desktopId, msg\.updatedAt\); \}\);/.test(L) && !/this\._appliedStamps\.clear\(\)/.test(L), '⑩ the ack notes the page\'s own write\'s stamp; the applied stamps survive a reconnect (the seq restarts, the stamp does not)');
  const sends = [...L.matchAll(/this\.app\.ws\.send\(\{ type: 'layout-sync',[^\n]*\}\);/g), ...D.matchAll(/this\.app\.ws\.send\(\{ type: 'layout-sync',[^\n]*\}\);/g)].map((m) => m[0]);
  ok(sends.length === 3 && sends.every((x) => /, base: [^,}]*stampOf/.test(x)), '⑩ every layout-sync a page sends names its `base` (desktop-manager stampOf)', J(sends));
  ok(/import \{ noteStamp \} from '\.\/layout-model\.js';/.test(D) && /stampOf\(desktopId\) \{ return this\._stamps\.get\(desktopId \|\| ''\) \|\| undefined; \}/.test(D) && /this\.noteStamp\(id, dState\?\.autoSave\?\.updatedAt\);/.test(D) && /this\.noteStamp\(d, rec\.updatedAt\);/.test(D), '⑩ desktop-manager: the base is the boot read\'s stamp, a relayed record\'s, the ack\'s and a refusal\'s record kept (the stale refusal is adopted)');
}

// ⑨ THE READ CENSUS — THE LAYER LAW's read half over src/lib/layout.js (acorn: comments / strings never count)
console.log('— ⑨ the read census (src/lib/layout.js, acorn)');
const acorn = require('acorn');
const DRM = require(path.join(REPO, 'src/lib/desktop-record.js'));
/** The fields of a record a page applies only through applyForViewport's subsets (arrangement · chrome · preference). */
const LAYERED = new Set(DRM.LAYERS.filter((r) => ['arrangement', 'chrome', 'preference'].includes(r.layer)).flatMap((r) => r.fields));
/** Roots that are THIS page's own objects, never a record: its state (`this`), a live window the apply targets (win /
 *  winInfo), a window's element (el), Math. A layered read off any other root is a record's. */
const PAGE = ['this', 'win', 'winInfo', 'el', 'Math'];
/** Every ask: [method, source, calls] — applyForViewport(this._viewport(), record, { source, … }). */
const READ_SITES = [
  ['_handleRemoteSync', 'remote', 1], // the bars, before the desktop gate (2.252.2)
  ['_applyRemoteState', 'remote', 1], // a live record / the reconnect's re-read
  ['restoreState', 'boot', 1], // the boot's restore, a desktop switch's
  ['loadAutoSave', 'boot', 1], // the boot's bar heal
  ['loadPreset', 'preset', 1], // a preset the person loads
];
/** Methods whose parameter IS a subset — every call hands it one: [method, param, argument index | property name]. */
const RECEIVERS = [['_applyToolbarState', 'state', 0], ['_createRemoteWindow', 'arrangement', 'arrangement']];
/** A layered read off a record outside the law, named with its why: [unit, read]. */
const DECLARED = [
  ['scanStoppedInDesktopStates', 'ws.gridBounds'], // the resume offer hands a held record's box to the resume door (desktop-manager places the window on ITS desktop; a phone's capture carries the held box back — belt 1)
];
const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const isViewportAsk = (n) => n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === '_viewport' && n.callee.object.type === 'ThisExpression' && n.arguments.length === 0;
const propOf = (obj, name) => obj && obj.type === 'ObjectExpression' ? obj.properties.find((p) => p.type === 'Property' && !p.computed && (p.key.name || p.key.value) === name) : null;
const textOf = (n) => n.type === 'ThisExpression' ? 'this' : n.type === 'Identifier' ? n.name : n.type === 'MemberExpression' && !n.computed ? textOf(n.object) + '.' + n.property.name : n.type === 'CallExpression' ? textOf(n.callee) + '(…)' : n.type === 'ChainExpression' ? textOf(n.expression) : '‹' + n.type + '›';
/** layout.js text → the census: strays (a record's layered field read outside the law), asks per site, bad asks, bad
 *  receiver calls, the retired name, and the tallies. */
function readCensus(text) {
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const scopes = new Map(); // fn node → Map(name → [{ kind, expr, anc }])
  const unitOf = (anc) => { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (a.type === 'MethodDefinition') return a.key.name; if (a.type === 'FunctionDeclaration' && a.id) return a.id.name; } return '(top level)'; };
  const fnOf = (anc) => { for (let i = anc.length - 1; i >= 0; i--) if (isFn(anc[i])) return anc[i]; return null; };
  const declare = (fn, name, d) => { if (!scopes.has(fn)) scopes.set(fn, new Map()); const m = scopes.get(fn); if (!m.has(name)) m.set(name, []); m.get(name).push(d); };
  const patNames = (p, out = []) => { if (!p) return out; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'AssignmentPattern') patNames(p.left, out); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patNames(q.type === 'RestElement' ? q.argument : q.value, out)); else if (p.type === 'ArrayPattern') p.elements.forEach((q) => patNames(q, out)); else if (p.type === 'RestElement') patNames(p.argument, out); return out; };
  const reads = [], asks = [], calls = [], retired = [];
  const visit = (node, anc) => {
    if (!node || typeof node.type !== 'string') return;
    if (isFn(node)) { if (!scopes.has(node)) scopes.set(node, new Map()); for (const p of node.params) for (const n of patNames(p)) declare(node, n, { kind: 'param', fn: node, anc: [...anc, node] }); }
    if (node.type === 'VariableDeclarator') {
      const fn = fnOf(anc);
      if (node.id.type === 'Identifier') declare(fn, node.id.name, { kind: 'init', expr: node.init, anc });
      else for (const n of patNames(node.id)) declare(fn, n, { kind: 'pattern', expr: node.init, anc });
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') declare(fnOf(anc), node.left.name, { kind: 'assign', expr: node.right, anc });
    if (node.type === 'Identifier' && node.name === 'membershipOnly') retired.push(`${unitOf(anc)} (line ${node.loc.start.line})`);
    if (node.type === 'MemberExpression' && !node.computed && LAYERED.has(node.property.name)) {
      const parent = anc[anc.length - 1];
      if (!(parent && parent.type === 'AssignmentExpression' && parent.left === node)) reads.push({ node, anc });
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'applyForViewport') asks.push({ node, anc });
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.object.type === 'ThisExpression') calls.push({ node, anc, name: node.callee.property.name });
    for (const k of Object.keys(node)) { if (k === 'loc') continue; const c = node[k]; if (Array.isArray(c)) c.forEach((x) => visit(x, [...anc, node])); else if (c && typeof c.type === 'string') visit(c, [...anc, node]); }
  };
  visit(ast, []);
  // a name's declarations, by the nearest enclosing function that declares it (lexical, function-scoped)
  const resolve = (name, anc) => { for (let i = anc.length - 1; i >= 0; i--) if (isFn(anc[i]) && scopes.get(anc[i])?.has(name)) return { fn: anc[i], decls: scopes.get(anc[i]).get(name) }; return null; };
  const receiverOf = (fn, name, anc) => { const m = [...anc].reverse().find((a) => a.type === 'MethodDefinition'); return !!m && m.value === fn && RECEIVERS.some(([meth, param]) => meth === m.key.name && param === name); };
  const memo = new Map();
  const subsetName = (name, anc) => {
    const r = resolve(name, anc);
    if (!r) return false;
    const key = r.decls;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false); // a cycle is no subset
    const v = r.decls.every((d) => d.kind === 'param' ? receiverOf(r.fn, name, d.anc) : (d.kind === 'init' || d.kind === 'pattern') && subsetExpr(d.expr, d.anc));
    memo.set(key, v);
    return v;
  };
  const isNull = (n) => n && ((n.type === 'Literal' && n.value === null) || (n.type === 'Identifier' && n.name === 'undefined'));
  function subsetExpr(n, anc) {
    if (!n) return false;
    if (n.type === 'ChainExpression') return subsetExpr(n.expression, anc);
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'applyForViewport') return true; // the ask itself is judged below
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'arrangementFor') return subsetExpr(n.arguments[0], anc);
    if (n.type === 'MemberExpression') return subsetExpr(n.object, anc);
    if (n.type === 'Identifier') return subsetName(n.name, anc);
    if (n.type === 'LogicalExpression') return (subsetExpr(n.left, anc) || isNull(n.left)) && (subsetExpr(n.right, anc) || isNull(n.right));
    if (n.type === 'ConditionalExpression') return (subsetExpr(n.consequent, anc) || isNull(n.consequent)) && (subsetExpr(n.alternate, anc) || isNull(n.alternate));
    return false;
  }
  const baseOf = (n) => { while (n.type === 'MemberExpression' || n.type === 'ChainExpression') n = n.type === 'ChainExpression' ? n.expression : n.object; return n; };
  const strays = [], tally = { page: 0, subset: 0, declared: 0 };
  for (const { node, anc } of reads) {
    const base = baseOf(node.object), unit = unitOf(anc), read = `${textOf(node.object)}.${node.property.name}`;
    const root = base.type === 'ThisExpression' ? 'this' : base.type === 'Identifier' ? base.name : null;
    if (root && PAGE.includes(root)) { tally.page++; continue; }
    if (subsetExpr(node.object, anc)) { tally.subset++; continue; }
    if (DECLARED.some(([u, r]) => u === unit && r === read)) { tally.declared++; continue; }
    strays.push(`${unit} · ${read} (line ${node.loc.start.line})`);
  }
  // the asks: spelled with this page's class, a known source, a remote one with the ONE writer predicate
  const sites = new Map(), badAsks = [];
  const fedByWriterClass = (method) => calls.filter((c) => c.name === method).every((c) => { const w = propOf(c.node.arguments[1], 'writer'); return w && w.value.type === 'CallExpression' && w.value.callee.name === 'writerClass'; }) && calls.some((c) => c.name === method);
  for (const { node, anc } of asks) {
    const unit = unitOf(anc), opts = node.arguments[2], src = propOf(opts, 'source'), source = src && src.value.type === 'Literal' ? src.value.value : '?';
    const k = `${unit} · ${source}`; sites.set(k, (sites.get(k) || 0) + 1);
    if (!isViewportAsk(node.arguments[0])) badAsks.push(`${unit}: the class is not this page's (${textOf(node.arguments[0])})`);
    if (!['remote', 'boot', 'preset'].includes(source)) badAsks.push(`${unit}: source ${source}`);
    if (source === 'remote') {
      const w = propOf(opts, 'writer');
      const ok = w && ((w.value.type === 'CallExpression' && w.value.callee.name === 'writerClass') || (w.value.type === 'Identifier' && resolve(w.value.name, anc)?.decls.every((d) => d.kind === 'param') && fedByWriterClass(unit)));
      if (!ok) badAsks.push(`${unit}: a remote ask whose writer is not writerClass(msg)`);
    }
  }
  const rowKey = (r) => `${r[0]} · ${r[1]}`;
  const unknownSites = [...sites].filter(([k, n]) => { const r = READ_SITES.find((x) => rowKey(x) === k); return !r || r[2] !== n; }).map(([k, n]) => `${k} ×${n}`);
  const deadSites = READ_SITES.filter((r) => !sites.has(rowKey(r))).map(rowKey);
  // the receivers: every call hands the parameter a subset
  const badReceivers = [];
  for (const [method, , at] of RECEIVERS) for (const c of calls.filter((x) => x.name === method)) {
    const arg = typeof at === 'number' ? c.node.arguments[at] : propOf(c.node.arguments[1], at)?.value;
    if (!subsetExpr(arg, c.anc)) badReceivers.push(`${unitOf(c.anc)} → ${method}(${arg ? textOf(arg) : 'nothing'}) (line ${c.node.loc.start.line})`);
  }
  return { strays, sites, unknownSites, deadSites, badAsks, badReceivers, retired, tally };
}
const readGreen = (c) => !c.strays.length && !c.unknownSites.length && !c.deadSites.length && !c.badAsks.length && !c.badReceivers.length && !c.retired.length;
{
  const L = fs.readFileSync(path.join(REPO, 'src/lib/layout.js'), 'utf8');
  const c = readCensus(L);
  console.log(`    ⑨ asks: ${[...c.sites].map(([k, n]) => `${k} ×${n}`).join(' | ')} — layered reads: ${c.tally.subset} off a subset, ${c.tally.page} off the page, ${c.tally.declared} declared`);
  ok(!c.unknownSites.length && !c.deadSites.length, `⑨ every applyForViewport ask in layout.js is a READ_SITES row (${READ_SITES.length} sites: remote ×2, boot ×2, preset) — none unnamed, no dead row`, J({ unknown: c.unknownSites, dead: c.deadSites }));
  ok(!c.badAsks.length, '⑨ each asks with this page\'s class — applyForViewport(this._viewport(), …) — a known source, and a remote one with the ONE writer predicate (writerClass(msg), straight or through the apply\'s `writer`)', J(c.badAsks));
  ok(!c.strays.length && c.tally.subset >= 40, `⑨ every read of a record's arrangement / chrome / preference field comes off applyForViewport's subsets (${c.tally.subset}) or the page's own objects (${c.tally.page}) — 0 off a raw record, ${c.tally.declared} declared (the resume offer's box)`, J(c.strays));
  ok(!c.badReceivers.length, '⑨ every call of a receiver (_applyToolbarState, _createRemoteWindow\'s arrangement) hands it a subset, never the record', J(c.badReceivers));
  ok(!c.retired.length && !L.includes('membershipOnly') && !L.includes('chromeToApply'), '⑨ `membershipOnly` and chromeToApply are gone from layout.js (code and comments) — the table replaced the special case', J(c.retired));
  const PLANTS = [
    { tag: 'the pre-fix live sidebar', find: '      if (chrome && chrome.sidebarOpen !== undefined && chrome.sidebarOpen !== this.app.sidebar.isOpen) {\n        this.app.sidebar.toggle(chrome.sidebarOpen);', repl: '      if (state.sidebarOpen !== undefined && state.sidebarOpen !== this.app.sidebar.isOpen) {\n        this.app.sidebar.toggle(state.sidebarOpen);', red: (x) => x.strays.some((s) => s.startsWith('_applyRemoteState · state.sidebarOpen')) },
    { tag: 'the pre-fix boot grid', find: '    if (arrangement && arrangement.grid) {\n      this.app.wm.setGrid(arrangement.grid.rows, arrangement.grid.cols);\n    }\n\n    // Restore taskbar height', repl: '    if (state.grid) {\n      this.app.wm.setGrid(state.grid.rows, state.grid.cols);\n    }\n\n    // Restore taskbar height', red: (x) => x.strays.some((s) => s.startsWith('restoreState · state.grid')) },
    { tag: 'a raw box apply', find: '          if (a && a.gridBounds && !heldGeom) {', repl: '          if (rw.gridBounds && !heldGeom) {', red: (x) => x.strays.some((s) => s.startsWith('_applyRemoteState · rw.gridBounds')) },
    { tag: 'a forged subset', find: "    const layers = applyForViewport(this._viewport(), state, { source: 'boot' });", repl: '    const layers = { arrangement: state, chrome: state, preference: state };', red: (x) => x.strays.some((s) => s.startsWith('restoreState · arrangement.grid')) && x.deadSites.includes('restoreState · boot') },
    { tag: 'a desk-spelled viewport', find: "applyForViewport(this._viewport(), state, { source: 'remote', writer })", repl: "applyForViewport('desktop', state, { source: 'remote', writer })", red: (x) => x.badAsks.some((b) => b.startsWith('_applyRemoteState: the class')) },
    { tag: 'a phone writer read as a desk', find: '{ closeOnlyWired: !!msg.resync, receivedAt, writer: writerClass(msg) }', repl: "{ closeOnlyWired: !!msg.resync, receivedAt, writer: 'desktop' }", red: (x) => x.badAsks.some((b) => b.startsWith('_applyRemoteState: a remote ask')) },
    { tag: 'a preset asking as the boot', find: "applyForViewport(this._viewport(), preset, { source: 'preset' })", repl: "applyForViewport(this._viewport(), preset, { source: 'boot' })", red: (x) => x.unknownSites.some((u) => u.startsWith('loadPreset · boot')) && x.deadSites.includes('loadPreset · preset') },
    { tag: 'membershipOnly back', find: '    this._applyRemoteState(msg.state, { closeOnlyWired', repl: "    const membershipOnly = writerClass(msg) === 'phone' && !this.app.isMobile;\n    this._applyRemoteState(msg.state, { closeOnlyWired", red: (x) => x.retired.some((r) => r.startsWith('_handleRemoteSync')) },
    { tag: 'a receiver fed the record', find: '    if (chrome) this._applyToolbarState(chrome); // incl. explicit-null reset', repl: '    this._applyToolbarState(state); // incl. explicit-null reset', red: (x) => x.badReceivers.some((b) => b.startsWith('restoreState → _applyToolbarState(state)')) },
    { tag: 'a new door off the raw record', find: '    if (msg.desktopMeta && dm) dm.updateFromMeta(msg.desktopMeta);', repl: '    if (msg.state && msg.state.theme) this.app.themeManager.apply(msg.state.theme);\n    if (msg.desktopMeta && dm) dm.updateFromMeta(msg.desktopMeta);', red: (x) => x.strays.some((s) => s.startsWith('_handleRemoteSync · msg.state.theme')) },
  ];
  for (const p of PLANTS) {
    if (!ok(L.split(p.find).length === 2, `⑨ RED control ${p.tag}: the planted line exists once in layout.js (the control judges this source)`)) continue;
    const x = readCensus(L.replace(p.find, p.repl));
    ok(!readGreen(x) && p.red(x), `⑨ RED control ${p.tag}: the census turns RED and names it`, J({ strays: x.strays, badAsks: x.badAsks, unknown: x.unknownSites, dead: x.deadSites, receivers: x.badReceivers, retired: x.retired }));
  }
  // the blind-spot control: the same reads in a comment and in a string are no read (a regex census would count both)
  const blind = readCensus(L.replace('  _applyRemoteState(state, {', "  // if (state.sidebarOpen) this.app.sidebar.toggle(state.sidebarOpen); rw.gridBounds\n  _blind() { return 'state.sidebarOpen rw.gridBounds msg.state.theme'; }\n  _applyRemoteState(state, {"));
  ok(readGreen(blind) && blind.tally.subset === c.tally.subset, '⑨ control: the reads inside a comment and a string count nothing (acorn reads code only)', J({ strays: blind.strays }));
}

console.log('— ⑦ negative controls (patched copies, scripts/mutant-copy.mjs)');
const M = mutantCopies('layout-model', REPO);
const MUTANTS = [
  { tag: 'single-slot', find: "const deferKey = (msg) => (writerClass(msg) === 'phone' ? PHONE_SLOT : '') + desktopOf(msg);", repl: 'const deferKey = (msg) => desktopOf(msg);', expect: /④ F5: desktop record deferred/ },
  { tag: 'drain-in-map-order', find: '    if (!next || seq < seqOf(next[1])) next = e;', repl: '    if (!next) next = e;', expect: /lowest seq goes first|④ the mirror|DEFERRAL IS INVISIBLE/ },
  { tag: 'no-drop', find: '    if (seq > 0 && applied && seq <= (Number(applied.get(desktopOf(e[1]))) || 0)) { drop.push(e[0]); continue; }\n', repl: '\n', expect: /never applied backwards/ },
  { tag: 'stamp-blind', find: '  return !!(t && stamps && t < (Number(stamps.get(desktopOf(msg))) || 0));', repl: '  return false;', expect: /⑩ behindStamp|⑩ THE WAKE/ },
  { tag: 'stamp-lowered', find: '  if (t > (Number(stamps.get(d)) || 0)) stamps.set(d, t);', repl: '  stamps.set(d, t);', expect: /never lowered/ },
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
