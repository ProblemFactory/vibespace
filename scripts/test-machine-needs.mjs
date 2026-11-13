#!/usr/bin/env node
// THE MACHINE NEEDS CENSUS (lane machine-needs-at-pairing pick 2 — 主开发's law 1; the owner 2026-11-13: a line «设置一次：在 dev-… 上
// 安装 TightVNC Server» with no button). Fast, PURE + the tree's words:
//   ① THE CENSUS, derived and PRINTED: every sentence a person reads (each t() / tr() / i18nKey() literal in src/ — the same reader as
//      scripts/i18n-extract.mjs) that the net catches (it names a machine AND a need) is claimed by a row of src/machine-needs.js or
//      by a non-need with its reason — per need: its kind, platforms, sentences, the surfaces that state it, its door
//   ② A DOOR ON EVERY SURFACE THAT STATES IT: a need whose door is present — every file that states one of its sentences (a PURE
//      model's words count for the surface that draws them: `via`) carries the door's marker in its source
//   ③ CONTROLS: a new «needs X» sentence no row claims is RED by name; a surface stating a present-door need without its door is
//      RED by name (the base's machine-app.js, stripped of the door, is caught)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
if (!fs.existsSync(path.join(REPO, 'src/machine-needs.js'))) { ok(false, 'the census exists (src/machine-needs.js)'); console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }
const MN = require(path.join(REPO, 'src/machine-needs.js'));

// ── the tree's words: every t() / tr() / i18nKey() literal in src/ (not the dictionaries), with the files that hold it ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const sources = new Map(); // file → text
const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^i18n/.test(e.name)) sources.set(p, fs.readFileSync(path.join(REPO, p), 'utf8')); } };
walk('src');
const words = new Map(); // sentence → Set(files)
for (const [file, text] of sources) for (const m of text.matchAll(tRe)) { let k; try { k = unescapeJs(m[1] != null ? m[1] : m[2]); } catch { continue; } if (!words.has(k)) words.set(k, new Set()); words.get(k).add(file); }

/** The census over a set of sentences → { rows: Map(id → {row, sentences, files}), non: [...], unclaimed: [...] } */
function census(ws) {
  const rows = new Map(MN.NEEDS.map((r) => [r.id, { row: r, sentences: [], files: new Set() }])), non = [], unclaimed = [];
  for (const [s, files] of ws) {
    if (!MN.inNet(s)) continue;
    const r = MN.needOf(s);
    if (r) { const e = rows.get(r.id); e.sentences.push(s); for (const f of files) e.files.add((r.door.via && r.door.via[f]) || f); continue; }
    const n = MN.notNeedOf(s);
    if (n) { non.push({ s, why: n.why }); continue; }
    unclaimed.push({ s, files: [...files] });
  }
  return { rows, non, unclaimed };
}
/** The surfaces of a present-door need whose source lacks the door's marker. */
const markerOf = (mk, f) => (mk instanceof RegExp ? mk : mk[f] || /(?!)/); // one regex, or one per surface (a surface the map does not name has no door)
const doorless = (e, src = (f) => sources.get(f) || '') => (e.row.door.present ? [...e.files].filter((f) => !markerOf(e.row.door.present.marker, f).test(src(f))) : []);

console.log('① THE CENSUS (derived from the tree)');
const C = census(words);
const caught = [...words.keys()].filter(MN.inNet).length;
for (const e of C.rows.values()) {
  const d = e.row.door;
  const door = d.present ? `door present (${[...e.files].sort().join(', ') || 'no surface'})` : d.none ? `NONE — ${d.none}` : `deferred «${d.deferred}»`;
  console.log(`  · ${e.row.id} [${e.row.kind}] ${e.row.platforms.join('/')} — ${e.row.need} — ${e.sentences.length} sentence(s) — ${door}`);
}
console.log(`  · not needs: ${C.non.length} (${[...new Set(C.non.map((x) => x.why))].length} reasons)`);
ok(caught > 50 && C.unclaimed.length === 0, `every one of the ${caught} sentences the net catches is claimed — by a need (${caught - C.non.length}) or a non-need with its reason (${C.non.length})`, C.unclaimed.slice(0, 8));
ok([...C.rows.values()].every((e) => e.sentences.length > 0), 'every row claims at least one sentence of the tree (no dead row)', [...C.rows.values()].filter((e) => !e.sentences.length).map((e) => e.row.id));
ok(MN.NEEDS.every((r) => ['a', 'b', 'c', '-'].includes(r.kind) && Array.isArray(r.platforms) && r.platforms.length && (!!r.door.present + !!r.door.none + !!r.door.deferred) === 1), 'every row has a kind, its platforms and exactly one door verdict (present / none / deferred)');
ok(MN.NEEDS.filter((r) => r.door.deferred).every((r) => r.door.deferred === MN.DEFERRED), `every deferred door names the owner's backlog row («${MN.DEFERRED}»)`);

console.log('② A DOOR ON EVERY SURFACE THAT STATES IT');
for (const e of C.rows.values()) if (e.row.door.present) ok(doorless(e).length === 0 && e.files.size > 0, `${e.row.id}: every surface that states it draws its door (${[...e.files].sort().join(', ')})`, doorless(e));

console.log('③ CONTROLS');
const planted = new Map(words); planted.set('this machine needs the Frobnicator 3 runtime — install it there first', new Set(['src/lib/planted.js']));
const P = census(planted);
ok(P.unclaimed.length === 1 && /Frobnicator/.test(P.unclaimed[0].s), 'CONTROL: a new «needs X» sentence that no row claims is RED by name', P.unclaimed);
const ff = C.rows.get('ffmpeg');
const stripped = (f) => (f === 'src/lib/machine-app.js' ? (sources.get(f) || '').replace(/ffmpegDoor\(|ffmpegNeedCode\(/g, 'gone(') : sources.get(f) || '');
ok(ff && JSON.stringify(doorless(ff, stripped)) === JSON.stringify(['src/lib/machine-app.js']), 'CONTROL: the app window stating «needs ffmpeg» with its door taken out is RED by name', ff && doorless(ff, stripped));

console.log('④ WHAT IT IS — a net, and what it cannot see (the reader\'s item 8)');
{
  const head = fs.readFileSync(path.join(REPO, 'src/machine-needs.js'), 'utf8').split('*/')[0];
  const kb = fs.readFileSync(path.join(REPO, 'docs/kb-features.md'), 'utf8');
  ok(/A NET, NOT A PROOF/.test(head) && /a MACHINE word AND a NEED word/.test(head) && /IT CANNOT SEE/.test(head) && /A DEVICE'S OWN REFUSAL STRINGS/.test(head), 'the census\'s header says what it is (a net over sentences carrying a machine word and a need word) and what it cannot see (a need worded past them, a device\'s own refusal strings, a log line)');
  ok(/It is a NET, not a proof/.test(kb) && /a device's own refusal strings/.test(kb), 'the kb says the same where a person reads about the census');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
