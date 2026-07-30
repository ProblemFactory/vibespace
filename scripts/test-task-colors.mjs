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

// utils is an ES module — read+eval the two pure functions
const src = fs.readFileSync('src/lib/utils.js', 'utf8');
const fn = src.match(/export function taskGroupColor[\s\S]*?\n\}/)[0] + '\n' + src.match(/export function autoTaskColor[\s\S]*?\n\}/)[0];
const mod = new Function(fn.replace(/export /g, '') + '; return { taskGroupColor, autoTaskColor };')();
const { taskGroupColor, autoTaskColor } = mod;

check('deterministic: same id → same color', autoTaskColor('T-260709-abc') === autoTaskColor('T-260709-abc'));
const hues = [];
for (let i = 0; i < 30; i++) hues.push(parseInt(autoTaskColor(`T-2607${i}-x${i}`).match(/hsl\((\d+)/)[1]));
const uniq = new Set(hues.map((h) => Math.round(h / 12))); // 30° buckets ÷ …12° buckets
check('30 groups spread across ≥18 distinct 12° hue buckets', uniq.size >= 18, `buckets=${uniq.size}`); // fnv+avalanche measured 20
check('explicit color wins', taskGroupColor({ id: 'x', color: '#123456' }) === '#123456');
check("sentinel 'none' → null (neutral)", taskGroupColor({ id: 'x', color: 'none' }) === null);
check('unset → auto', taskGroupColor({ id: 'x' }) === autoTaskColor('x'));

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
