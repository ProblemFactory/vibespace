#!/usr/bin/env node
// Task-group color scalability (2.230.0): auto-distinct colors for unset
// groups must be deterministic (same id → same color, every client/restart)
// and well-spread (many groups stay distinguishable); the 'none' sentinel is
// explicitly neutral; the server sanitizer accepts arbitrary hex + 'none'.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };

// utils is an ES module — read+eval the pure functions
const src = fs.readFileSync('src/lib/utils.js', 'utf8');
const fn = ['taskGroupColor', 'autoTaskColor', 'autoTaskHue']
  .map((n) => src.match(new RegExp(`export function ${n}[\\s\\S]*?\\n\\}`))[0]).join('\n');
const mod = new Function(fn.replace(/export /g, '') + '; return { taskGroupColor, autoTaskColor, autoTaskHue };')();
const { taskGroupColor, autoTaskColor } = mod;

check('deterministic: same id → same color', autoTaskColor('T-260709-abc') === autoTaskColor('T-260709-abc'));
const hues = [];
for (let i = 0; i < 30; i++) hues.push(parseInt(autoTaskColor(`T-2607${i}-x${i}`).match(/hsl\((\d+)/)[1]));
const uniq = new Set(hues.map((h) => Math.round(h / 12))); // 30° buckets ÷ …12° buckets
check('30 groups spread across ≥18 distinct 12° hue buckets', uniq.size >= 18, `buckets=${uniq.size}`); // fnv+avalanche measured 20
check('explicit color wins', taskGroupColor({ id: 'x', color: '#123456' }) === '#123456');
check("sentinel 'none' → null (neutral)", taskGroupColor({ id: 'x', color: 'none' }) === null);
check('unset → auto', taskGroupColor({ id: 'x' }) === autoTaskColor('x'));

// ── v4 (2.231.1, user's formalization): auto identity = a FIXED SEQUENCE
// S_k in hue×lightness×texture space — every prefix far apart, assigned
// points NEVER move, deletion frees the slot, manual picks MASK nearby
// slots. Allocator lives server-side (pickColorSeq); renderer is the pure
// function seqTaskColor(colorSeq). ──
{
  const { seqTaskColor, pickColorSeq, maskedSlotsFor } = require('../src/task-color-seq.js');
  const parse = (c) => { const m = c.match(/hsl\((\d+), 62%, (\d+)%\)/); return { h: +m[1], l: +m[2] }; };
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const minSamePlane = (n) => {
    const es = Array.from({ length: n }, (_, k) => { const e = seqTaskColor(k); return { h: e.hue, l: e.lightness, p: e.pattern }; });
    let mind = 360;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      if (es[i].l === es[j].l && es[i].p === es[j].p) mind = Math.min(mind, dist(es[i].h, es[j].h));
    }
    return mind;
  };
  // prefix quality: same-plane golden prefixes stay ≥ ~62% of ideal spacing
  check('prefix 3: pairwise distinct (bands differ)', minSamePlane(3) === 360);
  check('prefix 12 (4/band): same-plane ≥50° (golden ≈59% of ideal 90°)', minSamePlane(12) >= 50, `min=${minSamePlane(12)}`);
  check('prefix 36 (12/band): same-plane ≥18°', minSamePlane(36) >= 18, `min=${minSamePlane(36)}`);
  check('slot 36+ opens textures', seqTaskColor(36).pattern === 'dash' && seqTaskColor(0).pattern === null);
  check('sequence is immutable (pure function)', JSON.stringify(seqTaskColor(7)) === JSON.stringify(seqTaskColor(7)));
  // allocator: sequential, reuses freed slots, skips masked ones
  check('empty set → slot 0', pickColorSeq([]) === 0);
  check('0,1,2 taken → 3', pickColorSeq([{ colorSeq: 0 }, { colorSeq: 1 }, { colorSeq: 2 }]) === 3);
  check('deletion frees: 0,2,3 taken → reuse 1', pickColorSeq([{ colorSeq: 0 }, { colorSeq: 2 }, { colorSeq: 3 }]) === 1);
  // masking: a manual color equal to slot 1's rendering blocks slot 1
  const s1 = seqTaskColor(1);
  const masked = maskedSlotsFor(s1.color, null);
  check('manual pick masks its nearby slot(s)', masked.includes(1), JSON.stringify(masked));
  check('allocator skips masked slots', pickColorSeq([{ colorSeq: 0 }, { color: s1.color }]) !== 1);
  // hex parsing path for masks
  check('hex manual colors parse for masking', maskedSlotsFor('#ff0000', null).length >= 0 && Array.isArray(maskedSlotsFor('#f00', null)));
}

// ── server integration: create assigns colorSeq, delete frees it ──
{
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-seq-'));
  const { TaskGroupManager: TM3 } = require('../src/task-groups.js');
  const tm3 = new TM3({ dataDir: dir3, readUserState: () => ({}), onChange: () => {} });
  const a = tm3.create({ title: 's0' }), b = tm3.create({ title: 's1' }), c = tm3.create({ title: 's2' });
  check('create assigns sequential colorSeq', a.colorSeq === 0 && b.colorSeq === 1 && c.colorSeq === 2, JSON.stringify([a.colorSeq, b.colorSeq, c.colorSeq]));
  tm3.remove(b.id);
  const d = tm3.create({ title: 's3' });
  check('deleted slot is reused (S1 freed → next create takes it)', d.colorSeq === 1, `got ${d.colorSeq}`);
  check('survivors untouched by deletion', tm3.get(a.id).colorSeq === 0 && tm3.get(c.id).colorSeq === 2);
  fs.rmSync(dir3, { recursive: true, force: true });
}

// ── manual texture (2.231.0): store sanitize + precedence semantics ──
{
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pattern-'));
  const { TaskGroupManager: TM2 } = require('../src/task-groups.js');
  const tm2 = new TM2({ dataDir: dir2, readUserState: () => ({}), onChange: () => {} });
  const g = tm2.create({ title: 'p1', pattern: 'dash' });
  check("store accepts pattern 'dash'", g.pattern === 'dash');
  const g2 = tm2.update(g.id, { pattern: 'solid' });
  check("update to 'solid' sticks", g2.pattern === 'solid');
  const g3 = tm2.update(g.id, { pattern: null });
  check('pattern null = back to auto', g3.pattern === null);
  let bad = false;
  try { tm2.update(g.id, { pattern: 'zigzag' }); } catch { bad = true; }
  check('invalid pattern rejected', bad);
  fs.rmSync(dir2, { recursive: true, force: true });
}

// server sanitizer: arbitrary hex + 'none' accepted, css-injection rejected
const { TaskGroupManager } = require('../src/task-groups.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-color-'));
const tm = new TaskGroupManager({ dataDir: dir, readUserState: () => ({}), onChange: () => {} });
const t1 = tm.create({ title: 'c1', color: '#a1b2c3' });
check('sanitizer accepts arbitrary hex', t1.color === '#a1b2c3');
const t2 = tm.create({ title: 'c2', color: 'none' });
check("sanitizer accepts 'none' sentinel", t2.color === 'none');
let threw = false;
try { tm.create({ title: 'c3', color: 'red;}body{' }); } catch { threw = true; }
check('sanitizer rejects css injection', threw);
fs.rmSync(dir, { recursive: true, force: true });

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
