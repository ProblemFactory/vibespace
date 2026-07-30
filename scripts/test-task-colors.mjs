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
const fn = ['taskGroupColor', 'autoTaskColor', 'autoTaskHue', 'assignDistinctTaskColors']
  .map((n) => src.match(new RegExp(`export function ${n}[\\s\\S]*?\\n\\}`))[0]).join('\n');
const mod = new Function(fn.replace(/export /g, '') + '; return { taskGroupColor, autoTaskColor, autoTaskHue, assignDistinctTaskColors };')();
const { taskGroupColor, autoTaskColor, assignDistinctTaskColors } = mod;

check('deterministic: same id → same color', autoTaskColor('T-260709-abc') === autoTaskColor('T-260709-abc'));
const hues = [];
for (let i = 0; i < 30; i++) hues.push(parseInt(autoTaskColor(`T-2607${i}-x${i}`).match(/hsl\((\d+)/)[1]));
const uniq = new Set(hues.map((h) => Math.round(h / 12))); // 30° buckets ÷ …12° buckets
check('30 groups spread across ≥18 distinct 12° hue buckets', uniq.size >= 18, `buckets=${uniq.size}`); // fnv+avalanche measured 20
check('explicit color wins', taskGroupColor({ id: 'x', color: '#123456' }) === '#123456');
check("sentinel 'none' → null (neutral)", taskGroupColor({ id: 'x', color: 'none' }) === null);
check('unset → auto', taskGroupColor({ id: 'x' }) === autoTaskColor('x'));

// ── set-aware GUARANTEED distinctness (2.230.1, the fair objection:
// hash-only hues still collide as groups multiply) ──
{
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `T-26${String(100 + i)}-grp${i}` }));
  const parse = (c) => { const m = c.match(/hsl\((\d+), 62%, (\d+)%\)/); return { h: +m[1], l: +m[2] }; };
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const forty = mk(40);
  const map = assignDistinctTaskColors(forty);
  let violations = 0;
  const ent = forty.map((t) => { const e = map.get(t.id); return { ...parse(e.color), p: e.pattern }; });
  for (let i = 0; i < ent.length; i++) for (let j = i + 1; j < ent.length; j++) {
    if (ent[i].l === ent[j].l && ent[i].p === ent[j].p && dist(ent[i].h, ent[j].h) < 20) violations++;
  }
  check('40 groups: every same-plane pair ≥20° apart (hard guarantee)', violations === 0, `violations=${violations}`);
  check('first 54 groups are all SOLID (textures only past the solid planes)', ent.every((e) => e.p === null));
  const map2 = assignDistinctTaskColors(mk(40));
  check('assignment is deterministic', [...map.entries()].every(([k, v]) => JSON.stringify(map2.get(k)) === JSON.stringify(v)));
  // stability: adding one group leaves the vast majority untouched
  const map3 = assignDistinctTaskColors([...forty, { id: 'T-26999-newcomer' }]);
  const changed = forty.filter((t) => JSON.stringify(map3.get(t.id)) !== JSON.stringify(map.get(t.id))).length;
  check('adding a group changes ≤3 existing colors (anchor-first stability)', changed <= 3, `changed=${changed}`);
  // explicit colors are ignored by the assigner (they keep their own)
  const mixed = assignDistinctTaskColors([{ id: 'a', color: '#123456' }, { id: 'b' }]);
  check('explicit-color groups are not assigned', !mixed.has('a') && mixed.has('b'));
  // texture dimension: 80 groups → patterns appear, hard guarantee still holds
  const eighty = mk(80);
  const map4 = assignDistinctTaskColors(eighty);
  const e4 = eighty.map((t) => { const e = map4.get(t.id); return { ...parse(e.color), p: e.pattern }; });
  const patterned = e4.filter((e) => e.p !== null).length;
  check('80 groups: textured plane engaged (>54 spill into dash)', patterned >= 20, `patterned=${patterned}`);
  let v4 = 0;
  for (let i = 0; i < e4.length; i++) for (let j = i + 1; j < e4.length; j++) {
    if (e4[i].l === e4[j].l && e4[i].p === e4[j].p && dist(e4[i].h, e4[j].h) < 20) v4++;
  }
  check('80 groups: pairwise guarantee holds across planes', v4 === 0, `violations=${v4}`);
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
