#!/usr/bin/env node
// lane desktop-display-modes FAST (owner 2026-10-19 — a machine with several displays streams in THREE modes: ③ one window that
// switches, ① a window per display, ② all displays in one window laid out as on the machine): the PURE rules of
// src/desktop-displays-layout.js and the per-machine cap of src/stream-model.js.
//   §1 the mode: one of switch / windows / all (anything else ⇒ switch); a PHONE ⇒ switch (one display at a time)
//   §2 the offer's displays → the rows: left to right then top to bottom, numbered, the machine's own names; a Mac's `main` +
//      real pixels (pw × ph) read like a Windows row's `primary`; junk dropped, an id seen twice counts once
//   §3 ② THE LAYOUT: one scale for every display (the arrangement kept — touching displays share an edge, a display above
//      stays above, sizes stay in proportion), the box centred, every pane inside the pane; a FOLDED display is a stub along
//      the top and the others fill the rest; every display is shown exactly once (a pane or a stub) over a set of arrangements
//   §4 ② the pointer → the display under it (a pane's centre ⇒ its id; a gap, a stub ⇒ none)
//   §5 MUTANT: the layout with one display dropped ⇒ the exactly-once check is RED (the real module green)
//   §6 ② the stats row: fps / kbps summed over the PLAYING displays, the slowest named only when two or more play
//   §7 the per-machine memory: typed and bounded
//   §8 THE PER-MACHINE CAP: a stream per display + one (a phone), at most 4 — 1 display ⇒ 2 (as before), 2 ⇒ 3, 3+ ⇒ 4;
//      the daemon judges it with streamCapOf (src/agentd/stream-host.js — before the source and again with its displays)
//   §9 (commit 2) ② asks each stream to `share` (2–4): the hub's parse of the start body keeps it for a display, drops the rest
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const FILE = path.join(REPO, 'src/desktop-displays-layout.js');
const L = require(FILE);
const SM = require(path.join(REPO, 'src/stream-model.js'));
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('§1 the mode');
ok(same(L.DISPLAY_MODES, ['switch', 'windows', 'all']) && L.modeOf('all') === 'all' && L.modeOf('windows') === 'windows' && L.modeOf('switch') === 'switch' && L.modeOf('grid') === 'switch' && L.modeOf(undefined) === 'switch', 'the three modes; anything else ⇒ switch');
ok(L.modeOf('all', { phone: true }) === 'switch' && L.modeOf('windows', { phone: true }) === 'switch', 'a phone opens ③ only (one display at a time)');

console.log('§2 the offer\'s displays → the rows');
// the owner's Windows box: two 4K HDR displays, DISPLAY2 the primary (its offer: src/stream-plan.js screenDisplayRows)
const WIN = [{ id: '\\\\.\\DISPLAY1', x: 3840, y: 0, w: 3840, h: 2160, primary: false, hdr: true, name: 'Side 32' }, { id: '\\\\.\\DISPLAY2', x: 0, y: 0, w: 3840, h: 2160, primary: true, hdr: true, name: 'Desk 27' }];
const rows = L.displayRows(WIN);
ok(same(rows.map((r) => [r.n, r.id, r.name, r.primary, r.hdr, r.px.w, r.px.h]), [[1, '\\\\.\\DISPLAY2', 'Desk 27', true, true, 3840, 2160], [2, '\\\\.\\DISPLAY1', 'Side 32', false, true, 3840, 2160]]), 'left to right, numbered from 1, the machine\'s own names, primary + HDR', rows);
const mac = L.displayRows([{ id: '3', main: true, x: 0, y: 0, w: 1512, h: 982, pw: 3024, ph: 1964, name: 'Built-in Retina Display' }, { id: '2', main: false, x: 1512, y: -300, w: 2560, h: 1440, name: 'Studio' }]);
ok(mac[0].primary === true && mac[0].px.w === 3024 && mac[0].px.h === 1964 && mac[1].px.w === 2560 && mac[0].w === 1512, 'a Mac row: `main` reads as primary, its real pixels (pw × ph) are its size, its points stay its geometry', mac);
const junk = L.displayRows([null, { id: 'a', x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 5, h: 5 }, { id: 'b', x: 'x', y: 0, w: 5, h: 5 }, { id: 'c', x: 0, y: 0, w: 5, h: 5 }, { id: 'c', x: 9, y: 0, w: 5, h: 5 }]);
ok(junk.length === 1 && junk[0].id === 'c' && junk[0].x === 0, 'no id / no size / not a number ⇒ dropped; an id seen twice counts once (the first)', junk);
ok(L.displayRows(Array.from({ length: 30 }, (_, i) => ({ id: 'd' + i, x: i * 10, y: 0, w: 10, h: 10 }))).length === L.MAX_DISPLAYS, `at most ${L.MAX_DISPLAYS} rows`);

console.log('§3 ② the layout');
const inside = (l, W, H) => l.panes.every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H);
const exactlyOnce = (mod, ds, W, H, collapsed = []) => { const l = mod.paneLayout({ displays: ds, width: W, height: H, collapsed }); const ids = [...l.panes, ...l.stubs].map((p) => p.id).sort(); return same(ids, mod.displayRows(ds).map((d) => d.id).sort()) && new Set(ids).size === ids.length; };
{
  const l = L.paneLayout({ displays: rows, width: 1000, height: 600 });
  const [a, b] = l.panes;
  ok(l.panes.length === 2 && a.id === '\\\\.\\DISPLAY2' && a.x === 0 && a.x + a.w === b.x && b.x + b.w === 1000 && a.y === b.y && a.h === b.h && Math.abs(a.w - 500) <= 1 && Math.abs(a.h - 281) <= 1, 'two 4K side by side in 1000 × 600: one scale, 500 × 281 each, sharing an edge (the arrangement kept)', l.panes);
  ok(Math.abs(a.y - (600 - a.h) / 2) <= 1 && inside(l, 1000, 600), 'the box centred (vertically here); every pane inside the pane', l.box);
}
{ // a laptop below-left of a monitor: the arrangement and the proportions kept
  const ds = [{ id: 'mon', x: 0, y: 0, w: 2560, h: 1440 }, { id: 'lap', x: -1512, y: 1440, w: 1512, h: 982 }];
  const l = L.paneLayout({ displays: ds, width: 800, height: 800 }), mon = l.panes.find((p) => p.id === 'mon'), lap = l.panes.find((p) => p.id === 'lap');
  ok(lap.x + lap.w === mon.x && lap.y === mon.y + mon.h && Math.abs(lap.w / mon.w - 1512 / 2560) < 0.01 && inside(l, 800, 800), 'a laptop below-left of a monitor: it stays below-left, corners touching, its size in proportion', l.panes);
}
{ // fold: the folded display is a tab-sized stub along the top, the other fills the rest (bigger than before)
  const before = L.paneLayout({ displays: rows, width: 1000, height: 600 });
  const l = L.paneLayout({ displays: rows, width: 1000, height: 600, collapsed: ['\\\\.\\DISPLAY1'] });
  const st = l.stubs[0], p = l.panes[0];
  ok(l.panes.length === 1 && l.stubs.length === 1 && st.id === '\\\\.\\DISPLAY1' && st.y === L.GAP && st.w === L.STUB.w && st.h === L.STUB.h && p.y >= st.y + st.h && p.w > before.panes[0].w && inside(l, 1000, 600), 'a folded display: a stub along the top; the other display fills the rest, bigger than before', l);
  const none = L.paneLayout({ displays: rows, width: 1000, height: 600, collapsed: rows.map((r) => r.id) });
  ok(none.panes.length === 0 && none.stubs.length === 2 && none.stubs[1].x === L.GAP * 2 + L.STUB.w, 'every display folded: stubs only, side by side');
}
const ARRANGEMENTS = [
  rows, mac, [{ id: 'a', x: 0, y: 0, w: 1920, h: 1080 }], [{ id: 'a', x: 0, y: 0, w: 1080, h: 1920 }, { id: 'b', x: 1080, y: 400, w: 1920, h: 1080 }],
  [{ id: 'a', x: 0, y: 0, w: 1920, h: 1080 }, { id: 'b', x: 0, y: 1080, w: 1920, h: 1080 }, { id: 'c', x: 1920, y: 0, w: 1920, h: 2160 }],
  [{ id: 'a', x: -3840, y: -200, w: 3840, h: 2160 }, { id: 'b', x: 0, y: 0, w: 2560, h: 1440 }, { id: 'c', x: 2560, y: 0, w: 1440, h: 2560 }, { id: 'd', x: 0, y: 1440, w: 1280, h: 800 }],
];
const SIZES = [[1000, 600], [375, 600], [1600, 400], [300, 900]];
{
  let all = true, fits = true; const bad = [];
  for (const ds of ARRANGEMENTS) for (const [W, H] of SIZES) for (const c of [[], [L.displayRows(ds)[0].id]]) {
    if (!exactlyOnce(L, ds, W, H, c)) { all = false; bad.push({ n: ds.length, W, H, c }); }
    if (!inside(L.paneLayout({ displays: ds, width: W, height: H, collapsed: c }), W, H)) { fits = false; bad.push({ fit: true, n: ds.length, W, H }); }
  }
  ok(all && fits, `every display shown exactly once (a pane or a stub) and every pane inside the pane — ${ARRANGEMENTS.length} arrangements × ${SIZES.length} pane sizes × folded or not`, bad);
}

console.log('§4 ② the pointer → the display');
{
  const l = L.paneLayout({ displays: rows, width: 1000, height: 600, collapsed: [] });
  const hits = l.panes.map((p) => L.displayAt(l, p.x + p.w / 2, p.y + p.h / 2));
  ok(same(hits, ['\\\\.\\DISPLAY2', '\\\\.\\DISPLAY1']) && L.displayAt(l, 500, 2) === null && L.displayAt(l, 499.5, 300) === '\\\\.\\DISPLAY2' && L.displayAt(l, 500, 300) === '\\\\.\\DISPLAY1', 'each pane\'s centre ⇒ its display; the letterbox above ⇒ none; the shared edge belongs to the right-hand display', hits);
  const f = L.paneLayout({ displays: rows, width: 1000, height: 600, collapsed: ['\\\\.\\DISPLAY1'] });
  ok(L.displayAt(f, f.stubs[0].x + 5, f.stubs[0].y + 5) === null && L.displayAt(null, 1, 1) === null, 'on a stub ⇒ none (it is a button, not a picture); no layout ⇒ none');
}

console.log('§5 MUTANT: one display dropped');
{
  const src = fs.readFileSync(FILE, 'utf8'), ANCHOR = 'const shown = rows.filter((d) => !hidden.has(d.id));';
  ok(src.split(ANCHOR).length === 2, 'the anchor line is in the module once');
  const mod = { exports: {} };
  vm.runInNewContext(src.replace(ANCHOR, 'const shown = rows.filter((d) => !hidden.has(d.id)).slice(1);'), { module: mod, exports: mod.exports, require }, { filename: 'mutant.js' });
  const red = ARRANGEMENTS.filter((ds) => ds.length > 1).some((ds) => !exactlyOnce(mod.exports, ds, 1000, 600));
  ok(red && ARRANGEMENTS.every((ds) => exactlyOnce(L, ds, 1000, 600)), 'the layout with one display dropped fails the exactly-once check (RED); the real module passes it');
}

console.log('§6 ② the stats row');
{
  const s = L.sumStats([{ id: 'a', n: 1, playing: true, fps: 30, kbps: 8000 }, { id: 'b', n: 2, playing: true, fps: 21, kbps: 6100 }, { id: 'c', n: 3, playing: false, fps: 2, kbps: 50 }]);
  ok(s.playing === 2 && s.fps === 51 && s.kbps === 14100 && same(s.slowest, { id: 'b', n: 2, fps: 21 }), 'fps / kbps summed over the playing displays; the slowest named; a display not playing counts nothing', s);
  const one = L.sumStats([{ id: 'a', n: 1, playing: true, fps: 30, kbps: 100 }]);
  const tie = L.sumStats([{ id: 'a', n: 1, playing: true, fps: 30, kbps: 100 }, { id: 'b', n: 2, playing: true, fps: 30, kbps: 100 }]);
  ok(one.slowest === null && one.fps === 30 && L.sumStats(null).playing === 0 && tie.slowest === null && tie.fps === 60, 'one playing display, or all as fast: no "slowest" (a tie names nobody)', tie);
}

console.log('§7 the per-machine memory');
{
  const r = L.rememberedOf({ mode: 'windows', display: 7, displays: ['a', 'a', 3, null, ...Array.from({ length: 20 }, (_, i) => 'x' + i)], folded: 'no' });
  ok(r.mode === 'windows' && r.display === '7' && r.displays[0] === 'a' && r.displays[1] === '3' && r.displays.length === 8 && same(r.folded, []), 'typed (ids are strings), deduplicated, at most 8', r);
  ok(same(L.rememberedOf(null), { mode: 'switch', display: null, displays: [], folded: [] }) && L.rememberedOf({ mode: 'grid' }).mode === 'switch', 'nothing / junk ⇒ ③ with nothing chosen');
}

console.log('§8 THE PER-MACHINE CAP');
{
  const caps = [undefined, 0, 1, 2, 3, 4, 8].map((n) => SM.streamCapOf(n));
  ok(SM.STREAM_LIMITS.sessionsCap === 4 && same(caps, [2, 2, 2, 3, 4, 4, 4]) && SM.STREAM_LIMITS.sessionsPerAgent === undefined, 'a stream per display + one (a phone), at most 4: unknown / 1 display ⇒ 2 (as before), 2 ⇒ 3, 3 ⇒ 4, 8 ⇒ 4', caps);
  const host = fs.readFileSync(path.join(REPO, 'src/agentd/stream-host.js'), 'utf8');
  const uses = host.split('SM.streamCapOf(displaysKnown)').length - 1;
  ok(uses === 2 && /if \(Array\.isArray\(source\.displays\) && source\.displays\.length\) displaysKnown = source\.displays\.length;/.test(host) && /named\('too_many_streams'[^\n]*live: sessions\.size, cap: SM\.streamCapOf\(n\), displays/.test(host) && !/sessionsPerAgent/.test(host), 'the daemon judges it with streamCapOf twice — before the source, and again with the displays the new source names — and its refusal carries live / cap / displays', { uses });
}

console.log('§9 ② asks its streams to share (commit 2): the start body\'s `share`');
{
  const S = (o) => SM.streamSourceOf(o);
  ok(same(S({ kind: 'display', id: 'D2', share: 2 }), { kind: 'display', id: 'D2', share: 2 }) && same(S({ kind: 'display', id: 'D2', share: 4 }), { kind: 'display', id: 'D2', share: 4 }) && same(S({ kind: 'display', id: 'D2' }), { kind: 'display', id: 'D2' }), 'a display source carries `share` 2–4 (how many displays one ② window streams); none = alone');
  ok([1, 5, 2.5, '2', -1, null].every((n) => same(S({ kind: 'display', id: 'D2', share: n }), { kind: 'display', id: 'D2' })) && same(S({ kind: 'window', id: '7', share: 2 }), { kind: 'window', id: '7' }), 'anything else is dropped (1, 5 — over the cap —, 2.5, a string, negative, null), and a window never shares');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
