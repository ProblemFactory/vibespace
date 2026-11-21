#!/usr/bin/env node
// B-9dd0 (主开发 r1246, round wl8qjzhxs) — THE CENSUS of the rows whose node children the egress reader MAY carry into
// (scripts/egress-carried-rows.json). THE LAW: the reader never changes what the product under test can see of its own processes —
// and the product judges processes by their command lines (/proc/<pid>/cmdline, `ps … args=` / `command=`, `pgrep -f`). READERS =
// every product file (src/, server.js, data/bin) that reads another process's command line; a row the tree's OWN impact scope
// (ci.mjs affectedSuites over the READERS) names drives one, and its children carry no reader. The committed list is the REST: the
// rows that may carry. This suite re-derives both and is red when either drifts (a new reader; a row that now drives one; a
// carried name that is no row). A row not on the list — a new suite included — carries nothing: the safe side.
// CONTROL: the same comparison catches a list that holds one census row as carried.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as CI from './ci.mjs';
import { checker } from './lib/check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const diff = (got, want) => { const g = new Set(got), w = new Set(want); return { added: [...g].filter((x) => !w.has(x)).sort(), gone: [...w].filter((x) => !g.has(x)).sort() }; };
const same = (got, want) => { const d = diff(got, want); return !d.added.length && !d.gone.length; };

console.log('B-9dd0 — the egress reader\'s census: the rows whose product code judges a command line carry no reader in their children');
// THE READERS: one reading of every tracked product file (a comment line never counts)
const ls = spawnSync('git', ['-C', ROOT, 'ls-files', '--', 'src', 'server.js', 'data/bin'], { encoding: 'utf8' });
const files = (ls.stdout || '').split('\n').filter(Boolean).filter((f) => !/\.(css|html|json|md|png|svg)$/.test(f));
const RE = /\/cmdline\b|-o\s*(?:pid=?,)?(?:uid=,)?args=|-eo\s+[a-z,=]*args|-o\s+command=|\bpgrep\s+-f\b|ps\s+-eo[^'"`]*\bargs\b/;
const readers = files.filter((f) => { let t = ''; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return false; } return t.split('\n').some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && RE.test(l)); }).sort();
const LIST = path.join(ROOT, 'scripts', 'egress-carried-rows.json');
const want = JSON.parse(fs.readFileSync(LIST, 'utf8'));
console.log(`  the readers (${readers.length}): ${readers.join(', ')}`);
ok(readers.length >= 10 && same(readers, want.readers), `the READERS the list was derived from are the tree's: every product file that reads another process's command line (${readers.length})`, diff(readers, want.readers));
// THE ROWS: the tree's own impact scope over the readers
const t0 = Date.now();
const r = CI.affectedSuites({ changed: readers, suites: CI.SUITES, why: true });
const census = new Set((r.selected || []).map((s) => (typeof s === 'string' ? s : s.name)));
const names = CI.SUITES.map((s) => s.name);
const carried = names.filter((n) => !census.has(n)).sort();
const byRule = {}; for (const n of census) { const k = (r.ruleOf.get(n) || {}).rule || '?'; byRule[k] = (byRule[k] || 0) + 1; }
console.log(`  the census: ${census.size} of ${names.length} rows drive a reader (${Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(', ')}); ${carried.length} may carry — in ${Date.now() - t0} ms`);
ok(!r.error && census.size > 0 && same(carried, want.carried), `the CARRIED rows are exactly the rows the census does not name (${carried.length}) — the list is not stale`, { ...diff(carried, want.carried), error: r.error, why: diff(carried, want.carried).gone.map((n) => `${n}: ${r.why.get(n) || ''}`).slice(0, 8) });
ok(want.carried.every((n) => names.includes(n)) === true, 'every carried name is a row of the table (none removed or renamed under the list)', want.carried.filter((n) => !names.includes(n)));
// CONTROL: one census row planted as carried is caught by the same comparison
const planted = [...want.carried, [...census].sort()[0]];
ok(!same(carried, planted), `CONTROL: a list that holds a census row as carried (${[...census].sort()[0]}) is red by the same comparison`);
// THE READER reads THIS list, beside itself: this suite's own row is judged by it
const S = createRequire(import.meta.url)('./egress-sampler.cjs');
ok(typeof S.childVerdict === 'function' && S.CENSUS_ROW === !want.carried.includes('test-egress-census') && S.SUITE_NAME === (process.argv[1] ? path.basename(process.argv[1], '.mjs') : ''),
  'the reader reads this list (scripts/egress-carried-rows.json, beside it): this suite\'s own row is judged by it', { CENSUS_ROW: S.CENSUS_ROW, SUITE_NAME: S.SUITE_NAME });
report();
