#!/usr/bin/env node
// THE NODE RUNTIME FLOOR (lane runtime-floor, 2026-10-22 — the owner: «每次有漏洞都要更新 pod 也太麻烦了吧 有没有更好的解决方案？»).
// PURE src/runtime-floor.js is THE one table: per major line the first release carrying every fix of its advisory.
//   ① verdict(process.version): below-floor {wanted} / ok / unknown-major / unknown — per major, at / below / above,
//     numbers not text (22.9.9 < 22.23.4), a `v` optional, junk ⇒ unknown
//   ② the advisory row (date, url, cves) + compare; ②b THE ARCHIVES: every floor version names its six archives' sha256 in
//     SHASUMS256.txt's own line form (the hash lives in this repo), no stale row, archiveSha reads one line
//   ③ ONE table: src/device-runtime.js (the Machines card's chip, lane device-node-version) re-exports THESE objects and
//     spells no floor of its own; no other src file spells a floor version — RED: a copy that compares as text
// Run: node scripts/test-runtime-floor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const RF = require(path.join(REPO, 'src/runtime-floor.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };

const ROWS = [
  ['v22.22.0 (the device installer\'s old pin)', 'v22.22.0', 'below-floor', 'v22.23.4'],
  ['v22.23.3 (one patch below)', 'v22.23.3', 'below-floor', 'v22.23.4'],
  ['v22.9.9 (minor 9 < 23 — numbers, not text)', 'v22.9.9', 'below-floor', 'v22.23.4'],
  ['v22.23.1 (the fleet pods\' node, measured 2026-10-21)', 'v22.23.1', 'below-floor', 'v22.23.4'],
  ['v22.23.4 (AT the floor)', 'v22.23.4', 'ok', null],
  ['v22.24.0 (above)', 'v22.24.0', 'ok', null],
  ['v24.12.0 (the hub\'s node before 2026-10-21)', 'v24.12.0', 'below-floor', 'v24.22.1'],
  ['v24.22.1 (AT the floor)', 'v24.22.1', 'ok', null],
  ['v24.23.0 (a higher minor, a lower patch)', 'v24.23.0', 'ok', null],
  ['v26.12.0 (below)', 'v26.12.0', 'below-floor', 'v26.12.1'],
  ['v26.12.1 (AT the floor)', 'v26.12.1', 'ok', null],
  ['22.23.4 without its v', '22.23.4', 'ok', null],
];
console.log('— ① verdict(process.version)');
const run = (M) => ROWS.map(([n, v, ws, ww]) => { const r = M.verdict(v); return [n, r.state, r.wanted, ws, ww]; });
for (const [n, s, w, ws, ww] of run(RF)) ok(s === ws && w === ww, `${n} ⇒ ${ws}${ww ? ' (wanted ' + ww + ')' : ''}`, { got: s, wanted: w });
const u = RF.verdict('v23.11.0'), j = RF.verdict('not-a-version'), n0 = RF.verdict(null);
ok(u.state === 'unknown-major' && u.major === 23 && u.wanted === null && j.state === 'unknown' && n0.state === 'unknown', 'a major the table names no line for (v23 — odd, never LTS) ⇒ unknown-major, nothing wanted; junk / null ⇒ unknown', { u, j });
const b = RF.verdict('v24.12.0');
ok(b.version === 'v24.12.0' && b.major === 24 && b.floor === 'v24.22.1' && b.advisory === 'nodejs-2026-10-21', 'a below-floor verdict names the version, its major, the floor and the advisory that set it', b);
ok(RF.verdict(process.version).state !== 'unknown', `this runner's own node (${process.version}) reads as a version (${RF.verdict(process.version).state})`);

console.log('— ② the advisory + compare');
const a = RF.advisoryOf('nodejs-2026-10-21');
ok(a && a.date === '2026-10-21' && /^https:\/\/nodejs\.org\/en\/blog\/vulnerability\/october-2026-security-releases$/.test(a.url) && a.cves.length === 4 && a.cves.includes('CVE-2026-111497'), 'the advisory: its date, its page, its four CVEs (the Brotli decoder\'s among them)', a);
ok(RF.advisoryOf('nope') === null && RF.compare('v22.9.9', 'v22.23.4') === -1 && RF.compare('v24.22.1', '24.22.1') === 0 && RF.compare('v26.0.0', 'v24.99.99') === 1 && RF.compare('x', 'v1.0.0') === null, 'compare: numbers per part, a v optional, junk ⇒ null');
ok(Object.isFrozen(RF.NODE_FLOORS) && Object.values(RF.NODE_FLOORS).every((r) => Object.isFrozen(r) && /^\d+\.\d+\.\d+$/.test(r.floor) && RF.ADVISORIES[r.advisory]), 'every row is frozen, a plain x.y.z, and names an advisory the table has');

console.log('— ②b THE ARCHIVES — the hash lives in this repo');
{
  const NR = require(path.join(REPO, 'src/node-runtime.js'));
  const PLATFORMS = [['linux', 'x64'], ['linux', 'arm64'], ['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['win32', 'arm64']];
  const bad = [];
  for (const { floor } of Object.values(RF.NODE_FLOORS)) {
    const v = 'v' + floor, rows = RF.ARCHIVES[v];
    if (!Array.isArray(rows) || rows.length !== 6) { bad.push(`${v}: ${rows ? rows.length : 0} lines, not 6`); continue; }
    for (const [platform, arch] of PLATFORMS) {
      const file = NR.artifactOf(v, { platform, arch }).file, sha = RF.archiveSha(v, file);
      if (!/^[0-9a-f]{64}$/.test(String(sha))) bad.push(`${v}: no line for ${file}`);
    }
    if (!rows.every((l) => /^[0-9a-f]{64}  node-v[\d.]+-[a-z0-9-]+\.(tar\.gz|zip)$/.test(l))) bad.push(`${v}: a line not in SHASUMS256.txt's own form`);
  }
  ok(!bad.length && Object.isFrozen(RF.ARCHIVES), `every floor version names its SIX archives (linux / darwin × x64 / arm64 tar.gz, win x64 / arm64 zip) in SHASUMS256.txt's own line form — the lines a security release copies in`, bad);
  const all = Object.values(RF.ARCHIVES).flat().map((l) => l.split('  ')[0]);
  ok(new Set(all).size === all.length && Object.keys(RF.ARCHIVES).every((v) => Object.values(RF.NODE_FLOORS).some((r) => 'v' + r.floor === v)), 'no hash twice, no line for a version the floors do not name (a stale row is RED)');
  ok(RF.archiveSha('v24.22.1', 'node-v24.22.1-linux-x64.tar.gz') === 'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c' && RF.archiveSha('v24.22.1', 'node-v24.22.1-linux-x64-musl.tar.gz') === null && RF.archiveSha('v24.22.0', 'node-v24.22.0-linux-x64.tar.gz') === null && RF.archiveSha('v24.22.1', 'node-v24.22.1-linux-x64.tar.gz', {}) === null,
    'archiveSha reads ONE line (24.22.1 linux-x64 = nodejs.org\'s eb6728e7…, cross-checked against the hub\'s own verified download); a musl archive / another version / an empty table ⇒ null (never provisioned)');
}

console.log('— ③ ONE table');
const DR = require(path.join(REPO, 'src/device-runtime.js'));
ok(DR.NODE_FLOORS === RF.NODE_FLOORS && DR.ADVISORIES === RF.ADVISORIES, 'src/device-runtime.js (the Machines card\'s chip) re-exports THESE objects (===)');
const drSrc = fs.readFileSync(path.join(REPO, 'src/device-runtime.js'), 'utf8');
ok(/require\('\.\/runtime-floor'\)/.test(drSrc) && !/22\.23\.4|24\.22\.1|26\.12\.1/.test(drSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '…and spells no floor version in its code (its header comment may name them)');
const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : /\.(c|m)?js$/.test(e.name) ? [d + '/' + e.name] : []));
const spelled = walk('src').filter((f) => f !== 'src/runtime-floor.js').filter((f) => /['"`]2[246]\.(23\.4|22\.1|12\.1)['"`]/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
ok(spelled.length === 0, 'no other src file spells a floor version as a value (a future advisory moves ONE file)', spelled);
const reader = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
ok(/require\('\.\/runtime-floor'\)/.test(reader('src/node-runtime.js')) && /require\('\.\.\/runtime-floor'\)/.test(reader('src/server/runtime-boot.js')) && /src\/runtime-floor\.js/.test(reader('scripts/runtime-check.mjs')), 'its readers: the provisioner (src/node-runtime.js), the boot line + Diagnostics (src/server/runtime-boot.js), the updater (scripts/runtime-check.mjs)');
const arch = reader('scripts/test-architecture.mjs');
ok(/'src\/runtime-floor\.js'/.test(arch.slice(arch.indexOf('const PURE = new Set('), arch.indexOf('const SHARED = new Set('))), 'src/runtime-floor.js is in test-architecture\'s PURE set (imports nothing)');
// RED: the comparison as text
const M = mutantCopies('rtfloor', REPO);
const src = reader('src/runtime-floor.js');
const mut = src.replace('  const low = below(t, tripleOf(row.floor));', '  const low = t.join(\'.\') < row.floor;');
const red = run(M.load('src/runtime-floor.js', mut, 'lexical')).filter(([, s, w, ws, ww]) => s !== ws || w !== ww);
ok(mut !== src && red.some(([n]) => n.startsWith('v22.9.9')), `RED: a copy that compares versions as TEXT reads 22.9.9 as fixed (${red.length} rows red)`, red.map((r) => r[0]));

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
