#!/usr/bin/env node
// test-cli-caps (fast; lane pool-oat-measure, design q-035 §5 gate 5): a pool member's
// long-lived token may sit in its credential FILE only on a CLI version the oat
// measurement named green — src/cli-caps.js oatInFile(version, fixture).
//   ① the two lists (the six variants the measurement runs, the three the gate reads)
//   ② the reader's truth table — RED CONTROL: a version the fixture does not name ⇒ false; the
//      versions map (lane oat-in-file-2-1-306): each measured version true, one between them false
//   ②b the writer's ONE rule (cli-caps withMeasured): a run ADDS its version, never drops one
//   ③ patched-reader controls: each rule the table pins goes RED on a reader without it
//   ④ census: the measurement imports the list from the reader, writes the fixture path,
//      holds no token-shaped literal; the reader imports nothing
//   ⑤ --no-netns refuses a binary / anything under …/claude/versions/ before it runs (the
//      measurement over the FAKE claude needs strace: scripts/test-oat-measure-fake.mjs, heavy)
//   ⑥ the committed fixture, once 主开发's namespace rung wrote it: its shape — 2.1.296 (2026-10-14,
//      its record pinned as it was) + 2.1.306 (2026-10-21); 2.1.300 stays unmeasured
//   ⑦ (pool-oat-materialize verify r1 F9) machine-probes.cliVersion: the FIRST line that parses as a
//      version (a warning printed before the number is skipped), 'unparsed' for an answer with none,
//      null for no answer — over fake #! binaries (never the real CLI)
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const CAPS = path.join(REPO, 'src/cli-caps.js');
const SCRIPT = path.join(REPO, 'scripts/measure-claude-cred-read.mjs');
const C = require(CAPS);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cli-caps-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });

// ── ① the lists ──
console.log('① the lists');
const SIX = ['oat-file', 'oat-env', 'oat-file-401', 'oat-file-near', 'oat-file-switch', 'oat-file-scopes'];
ok('OAT_VARIANTS = the six, in the measurement order', JSON.stringify(C.OAT_VARIANTS) === JSON.stringify(SIX), JSON.stringify(C.OAT_VARIANTS));
ok('OAT_IN_FILE_GATE = oat-file, oat-file-401, oat-file-switch (design §5 gate 5)', JSON.stringify(C.OAT_IN_FILE_GATE) === JSON.stringify(['oat-file', 'oat-file-401', 'oat-file-switch']), JSON.stringify(C.OAT_IN_FILE_GATE));
ok('the gate reads only variants the measurement runs', C.OAT_IN_FILE_GATE.every((v) => C.OAT_VARIANTS.includes(v)));
ok('both lists are frozen', Object.isFrozen(C.OAT_VARIANTS) && Object.isFrozen(C.OAT_IN_FILE_GATE));

// ── ② the truth table ──
console.log('② oatInFile(version, fixture)');
const fx = (verdicts = {}, over = {}) => ({ cliVersion: '2.1.296', measuredAt: '2026-10-14', variants: Object.fromEntries(SIX.map((n) => [n, { verdict: verdicts[n] || 'PASS', note: 'n' }])), ...over });
const without = (name) => { const f = fx(); delete f.variants[name]; return f; };
// the two-version shape: {versions: {'2.1.296': record, '2.1.306': record}} (verdicts per version)
const two = (verdicts = {}) => ({ versions: { '2.1.296': fx(verdicts['2.1.296']), '2.1.306': fx(verdicts['2.1.306'], { cliVersion: '2.1.306', measuredAt: '2026-10-21' }) } });
const TABLE = [
  ['all six PASS on the measured version', '2.1.296', fx(), true],
  ['the CLI\'s own --version words', '2.1.296 (Claude Code)', fx(), true],
  ['a v-prefixed version', 'v2.1.296', fx(), true],
  ['the fixture\'s cliVersion in --version words', '2.1.296', fx({}, { cliVersion: '2.1.296 (Claude Code)' }), true],
  ['only the gate PASS (oat-env, near, scopes FAIL)', '2.1.296', fx({ 'oat-env': 'FAIL', 'oat-file-near': 'FAIL', 'oat-file-scopes': 'FAIL' }), true],
  ['oat-file FAIL', '2.1.296', fx({ 'oat-file': 'FAIL' }), false],
  ['oat-file-401 FAIL (the CLI rewrote the file)', '2.1.296', fx({ 'oat-file-401': 'FAIL' }), false],
  ['oat-file-switch FAIL', '2.1.296', fx({ 'oat-file-switch': 'FAIL' }), false],
  ['oat-file-401 missing', '2.1.296', without('oat-file-401'), false],
  ['a gate verdict spelled pass', '2.1.296', fx({ 'oat-file-switch': 'pass' }), false],
  ['a gate verdict INCOMPLETE', '2.1.296', fx({ 'oat-file': 'INCOMPLETE' }), false],
  ['RED CONTROL: a newer version the fixture does not name (2.1.297)', '2.1.297', fx(), false],
  ['an older one (2.1.295)', '2.1.295', fx(), false],
  ['a prefix of it (2.1.29)', '2.1.29', fx(), false],
  ['a longer one (2.1.2960)', '2.1.2960', fx(), false],
  ['a four-part one (2.1.296.1)', '2.1.296.1', fx(), false],
  ['a build of it (2.1.296-dev.1 — verify r1 F9)', '2.1.296-dev.1', fx(), false],
  ['a build-metadata suffix (2.1.296+linux.7)', '2.1.296+linux.7 (Claude Code)', fx(), false],
  ['no version', null, fx(), false],
  ['a word for a version', 'latest', fx(), false],
  ['no fixture', '2.1.296', null, false],
  ['a fixture without cliVersion', '2.1.296', fx({}, { cliVersion: undefined }), false],
  ['variants an array', '2.1.296', fx({}, { variants: [] }), false],
  ['variants null', '2.1.296', fx({}, { variants: null }), false],
  ['inherited verdicts do not count', '2.1.296', { cliVersion: '2.1.296', variants: Object.create(fx().variants) }, false],
  // THE VERSIONS MAP (lane oat-in-file-2-1-306): one record per measured version, keyed by the exact version
  ['the map: 2.1.296 ⇒ its record', '2.1.296', two(), true],
  ['the map: 2.1.306 in the CLI\'s words ⇒ its record', '2.1.306 (Claude Code)', two(), true],
  ['RED CONTROL: the map, a version between the two (2.1.300)', '2.1.300', two(), false],
  ['the map, a newer one than both (2.1.307)', '2.1.307', two(), false],
  ['the map, a build of a measured one (2.1.306-dev.1)', '2.1.306-dev.1', two(), false],
  ['the map: a FAIL in 2.1.306\'s record ⇒ 2.1.306 false', '2.1.306', two({ '2.1.306': { 'oat-file-401': 'FAIL' } }), false],
  ['…and 2.1.296\'s own record still true beside it', '2.1.296', two({ '2.1.306': { 'oat-file-401': 'FAIL' } }), true],
  ['the map: a key whose record names another version', '2.1.306', { versions: { '2.1.306': fx() } }, false],
  ['the map: a key in --version words is no exact key', '2.1.306', { versions: { '2.1.306 (Claude Code)': fx({}, { cliVersion: '2.1.306' }) } }, false],
  ['the map: an inherited entry does not count', '2.1.296', { versions: Object.create({ '2.1.296': fx() }) }, false],
  ['the map: versions an array', '2.1.296', { versions: [fx()] }, false],
  ['the map: versions null', '2.1.296', { versions: null }, false],
  ['the map is read alone (a bare record beside it does not count)', '2.1.296', { ...fx(), versions: {} }, false],
];
const runTable = (fn) => TABLE.map(([, v, f]) => { try { return fn(v, f); } catch { return 'threw'; } });
const real = runTable(C.oatInFile);
TABLE.forEach(([name, , , want], i) => ok(`${name} ⇒ ${want}`, real[i] === want, `got ${real[i]}`));
ok('cliVersionOf reads the CLI\'s words and nothing looser', C.cliVersionOf('2.1.296 (Claude Code)') === '2.1.296' && C.cliVersionOf('v2.1.296') === '2.1.296' && C.cliVersionOf('2.1') === null && C.cliVersionOf('2.1.296.1') === null && C.cliVersionOf(undefined) === null);
ok('cliVersionOf KEEPS a build suffix (another version, never the measured release — F9)', C.cliVersionOf('2.1.296-dev.1') === '2.1.296-dev.1' && C.cliVersionOf('2.1.296+linux.7 (Claude Code)') === '2.1.296+linux.7' && C.cliVersionOf('2.1.296, build 7') === null, JSON.stringify([C.cliVersionOf('2.1.296-dev.1'), C.cliVersionOf('2.1.296+linux.7 (Claude Code)'), C.cliVersionOf('2.1.296, build 7')]));

// ── ②b the writer's ONE rule: a run ADDS its version's record, every other kept ──
console.log('②b withMeasured(fixture, record) — the writer adds, never drops');
const rec = (v, verdicts) => fx(verdicts, { cliVersion: v });
const J = (o) => JSON.stringify(o);
const throwsOn = (fn) => { try { fn(); return false; } catch { return true; } };
const writerLegs = (W) => {
  const r = {};
  const f1 = W(null, rec('2.1.296'));
  r.first = J(Object.keys(f1.versions)) === J(['2.1.296']) && J(f1.versions['2.1.296']) === J(rec('2.1.296'));
  const bare = rec('2.1.296'), bareText = J(bare);
  const f2 = W(bare, rec('2.1.306'));
  r.fromBare = J(Object.keys(f2.versions)) === J(['2.1.296', '2.1.306']) && J(f2.versions['2.1.296']) === bareText && C.oatInFile('2.1.296', f2) && C.oatInFile('2.1.306', f2) && !C.oatInFile('2.1.300', f2);
  const odd = { cliVersion: '1.0.0', note: 'not a full record' };
  const before = { about: 'kept', versions: { '2.1.306': rec('2.1.306'), '2.1.296': rec('2.1.296'), '1.0.0': odd } }, beforeText = J(before);
  const f3 = W(before, rec('2.1.310'));
  r.addNeverDrop = ['2.1.296', '2.1.306', '1.0.0'].every((k) => J(f3.versions[k]) === J(before.versions[k])) && J(f3.versions['2.1.310']) === J(rec('2.1.310')) && f3.about === 'kept';
  r.order = J(Object.keys(f3.versions)) === J(['1.0.0', '2.1.296', '2.1.306', '2.1.310']);
  r.untouched = J(before) === beforeText && f3 !== before && f3.versions !== before.versions && J(bare) === bareText;
  const f4 = W(two(), rec('2.1.306', { 'oat-file-switch': 'FAIL' }));
  r.remeasure = J(Object.keys(f4.versions)) === J(['2.1.296', '2.1.306']) && J(f4.versions['2.1.296']) === J(two().versions['2.1.296']) && f4.versions['2.1.306'].variants['oat-file-switch'].verdict === 'FAIL' && !C.oatInFile('2.1.306', f4) && C.oatInFile('2.1.296', f4);
  r.refuses = [() => W(null, rec(null)), () => W(null, rec('2.1.306 (Claude Code)')), () => W(null, null), () => W([], rec('2.1.306')), () => W('text', rec('2.1.306')), () => W({ versions: [] }, rec('2.1.306')), () => W({ variants: {} }, rec('2.1.306'))].every(throwsOn);
  return r;
};
const wr = writerLegs(C.withMeasured);
ok('no file yet ⇒ a map of the one version measured', wr.first);
ok('the one-version file of 2026-10-14 (a bare record) ⇒ its record becomes the map\'s first entry, as it was, and 2.1.306 is added beside it', wr.fromBare);
ok('ADD, NEVER DROP: every entry the file holds is kept as it was (one that is no full record, another top-level key too), the new version added', wr.addNeverDrop);
ok('the map is written oldest first (numeric: 1.0.0, 2.1.296, 2.1.306, 2.1.310), whatever order the file held', wr.order);
ok('a new object: the fixture handed in is not touched', wr.untouched);
ok('re-measuring a version replaces THAT version\'s record only (2.1.306 now FAIL ⇒ false; 2.1.296 kept, true)', wr.remeasure);
ok('it REFUSES (throws) a record naming no exact version (none / --version words / not a record) and a fixture that is neither shape (array, text, versions not a map, a record of no version)', wr.refuses);
ok('measuredVersions: the map\'s versions oldest first; a bare record its one; nothing for no fixture / no map / an entry that names another version', J(C.measuredVersions(two())) === J(['2.1.296', '2.1.306']) && J(C.measuredVersions({ versions: { '2.1.306': rec('2.1.306'), '2.1.296': rec('2.1.296') } })) === J(['2.1.296', '2.1.306']) && J(C.measuredVersions(fx())) === J(['2.1.296']) && J(C.measuredVersions(null)) === '[]' && J(C.measuredVersions({ versions: null })) === '[]' && J(C.measuredVersions({ versions: { '2.1.306': fx() } })) === '[]', J([C.measuredVersions(two()), C.measuredVersions(fx())]));
{
  // RED CONTROL: the writer before this lane wrote THIS run's record alone (the file became one version) — the add-never-drop leg goes RED
  const S0 = fs.readFileSync(CAPS, 'utf8'), A = 'const all = { ...versions, [v]: record };';
  if (S0.includes(A)) {
    const f = path.join(tmp, 'cli-caps-writer-drops.js'); fs.writeFileSync(f, S0.replace(A, 'const all = { [v]: record };'));
    const m = writerLegs(require(f).withMeasured);
    ok('RED CONTROL: a writer that keeps only the new record (the base\'s --write-fixture) drops 2.1.296 ⇒ the add-never-drop + from-the-bare-file legs go RED', !m.addNeverDrop && !m.fromBare && m.first);
  } else ok('②b anchor present in src/cli-caps.js', false, A);
}

// ── ③ patched readers: each pinned rule, removed, turns its leg RED ──
console.log('③ patched-reader controls');
const SRC = fs.readFileSync(CAPS, 'utf8');
const patched = (label, from, to) => {
  if (!SRC.includes(from)) { ok(`${label}: anchor present in src/cli-caps.js`, false, from); return null; }
  const f = path.join(tmp, `cli-caps-${label.replace(/\W+/g, '-')}.js`);
  fs.writeFileSync(f, SRC.replace(from, to));
  return runTable(require(f).oatInFile);
};
const flips = (res, leg) => { const i = TABLE.findIndex(([n]) => n === leg); return !!res && res[i] !== TABLE[i][3]; };
const m1 = patched('no version check', 'if (!rec || cliVersionOf(rec.cliVersion) !== v) return false;', 'if (!rec) return false;');
ok('a reader without the version check ⇒ the RED CONTROL leg (2.1.297) goes RED', flips(m1, 'RED CONTROL: a newer version the fixture does not name (2.1.297)'));
ok('…and the map\'s key-vs-record leg goes RED with it', flips(m1, 'the map: a key whose record names another version'));
const m2 = patched('no verdict check', "&& vs[name].verdict === 'PASS'", '');
ok('a reader that ignores verdicts ⇒ the oat-file-401 FAIL leg goes RED', flips(m2, 'oat-file-401 FAIL (the CLI rewrote the file)'));
const m3 = patched('in not own', 'Object.prototype.hasOwnProperty.call(vs, name)', 'name in vs');
ok('a reader that counts inherited verdicts ⇒ the inherited leg goes RED', flips(m3, 'inherited verdicts do not count'));
const m4 = patched('loose version', '(?=\\s|$)', '');
ok('a looser version parse ⇒ the 2.1.296.1 leg goes RED', flips(m4, 'a four-part one (2.1.296.1)'));
const m5 = patched('the r1 parse', '(\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.+-]+)?)(?=\\s|$)', '(\\d+\\.\\d+\\.\\d+)(?![\\d.])');
ok('RED CONTROL (F9): the r1 parse (a build suffix dropped) opens the gate for 2.1.296-dev.1', flips(m5, 'a build of it (2.1.296-dev.1 — verify r1 F9)'));
const m6 = patched('the one-version reader', 'const rec = recordOf(fixture, v);', 'const rec = fixture;');
ok('RED CONTROL (the base): a reader of the one-version shape only ⇒ the two-version file grants 2.1.306 nothing (the map legs go RED)', flips(m6, 'the map: 2.1.306 in the CLI\'s words ⇒ its record') && flips(m6, 'the map: 2.1.296 ⇒ its record'));
const m7 = patched('map entry not own', 'isRecord(vs) && own(vs, v) && isRecord(vs[v])', 'isRecord(vs) && v in vs && isRecord(vs[v])');
ok('a reader that counts an inherited map entry ⇒ its leg goes RED', flips(m7, 'the map: an inherited entry does not count'));

// ── ④ census ──
console.log('④ census');
const S = fs.readFileSync(SCRIPT, 'utf8');
ok('the measurement takes OAT_VARIANTS from src/cli-caps.js (one spelling of the six)', /\bOAT_VARIANTS\b[^\n]*=\s*createRequire\([^\n]*'src', 'cli-caps\.js'/.test(S));
ok('…and never spells the list itself', !/\[\s*'oat-file',\s*'oat-env'/.test(S));
ok('every variant name has its branch in the measurement', SIX.filter((v) => v !== 'oat-file').every((v) => S.includes(`'${v}'`)), SIX.filter((v) => !S.includes(`'${v}'`)).join(', '));
ok('--write-fixture writes scripts/fixtures/oat-in-file.json by default', /'fixtures', 'oat-in-file\.json'/.test(S) && S.includes("flag('write-fixture')"));
ok('…ADDING its record through cli-caps withMeasured over the file as it is when written (never this run\'s record alone)', S.includes('const next = withMeasured(fixtureNow(), fx);') && S.includes('fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1)') && !/JSON\.stringify\(fx,/.test(S));
ok('…and refusing BEFORE the run a version it could not add (the same rule over the file as it is then)', S.includes("if (flag('write-fixture')) { try { withMeasured(fixtureNow(), { cliVersion: cliVersionOf(version), variants: {} }); } catch (e) { console.error(`REFUSED: --write-fixture") && S.indexOf('withMeasured(fixtureNow(), { cliVersion') < S.indexOf('for (const name of want)'));
ok('no token-shaped literal in the measurement (built at runtime)', !/sk-ant-(oat|ort|api)\d/.test(S));
ok('src/cli-caps.js imports nothing (PURE)', !/\brequire\s*\(|^\s*import\s/m.test(SRC));

// ── ⑤ the measurement over a FAKE claude ──
console.log('⑤ without the namespace the measurement runs no real CLI (refused before it runs)');
const measure = (args) => spawnSync(process.execPath, [SCRIPT, '--no-netns', '--gap', '50', '--flush-ms', '50', '--near-ms', '1500', ...args], { encoding: 'utf8', timeout: 120e3, env: { ...process.env } });
{
  // refused BEFORE it runs: an ELF (node's own binary stands in: the real CLI is never touched here)…
  const r = measure(['--claude', process.execPath, '--variant', 'oat-file']);
  ok('--no-netns refuses a binary (an ELF) before running it', r.status === 2 && /REFUSED: --no-netns runs a FAKE claude/.test(r.stderr), `exit ${r.status}: ${String(r.stderr).slice(-300)}`);
  // …and a script that sits where the vendor installs the real one (…/claude/versions/<v>)
  const vdir = path.join(tmp, 'claude', 'versions'); fs.mkdirSync(vdir, { recursive: true });
  const asReal = path.join(vdir, '9.9.9'); fs.writeFileSync(asReal, '#!/bin/sh\necho 9.9.9\n', { mode: 0o755 });
  const rv = measure(['--claude', asReal, '--variant', 'oat-file']);
  ok('--no-netns refuses anything under …/claude/versions/ (the vendor install path)', rv.status === 2 && /REFUSED: --no-netns runs a FAKE claude/.test(rv.stderr), `exit ${rv.status}: ${String(rv.stderr).slice(-300)}`);
  const r2 = measure(['--variant', 'oat-file']);
  ok('--no-netns without --claude refuses (never the one on PATH)', r2.status === 2 && /REFUSED: --no-netns needs --claude/.test(r2.stderr), `exit ${r2.status}: ${String(r2.stderr).slice(-300)}`);
}

// ── ⑥ the committed fixture (主开发's namespace rung writes it) ──
console.log('⑥ the committed fixture');
const COMMITTED = path.join(REPO, 'scripts/fixtures/oat-in-file.json');
if (!fs.existsSync(COMMITTED)) {
  console.log('  (none yet: `node scripts/measure-claude-cred-read.mjs --variant oat --write-fixture` in the namespace rung writes it; until then oatInFile is false for every CLI)');
} else {
  let F = null; try { F = JSON.parse(fs.readFileSync(COMMITTED, 'utf8')); } catch { }
  const recs = F && F.versions && typeof F.versions === 'object' ? Object.entries(F.versions) : [];
  ok('scripts/fixtures/oat-in-file.json parses: one record per measured version, keyed by its exact version — 2.1.296 and 2.1.306, oldest first', !!F && JSON.stringify(Object.keys(F)) === '["versions"]' && JSON.stringify(recs.map(([k]) => k)) === JSON.stringify(['2.1.296', '2.1.306']) && JSON.stringify(C.measuredVersions(F)) === JSON.stringify(['2.1.296', '2.1.306']), JSON.stringify(F).slice(0, 300));
  ok('…each record has the six verdicts and names the measurement', recs.length > 0 && recs.every(([k, r]) => r.cliVersion === k && /^\d{4}-\d\d-\d\d$/.test(r.measuredAt) && r.script === 'scripts/measure-claude-cred-read.mjs' && SIX.every((n) => r.variants?.[n] && /^(PASS|FAIL|INCOMPLETE)$/.test(r.variants[n].verdict) && typeof r.variants[n].note === 'string')), JSON.stringify(recs.map(([k, r]) => [k, r.cliVersion, r.measuredAt])));
  ok('…each measured in the namespace with the real CLI (not a fake, not --no-netns)', recs.length > 0 && recs.every(([k, r]) => r.netns === true && k !== '9.9.9'), JSON.stringify(recs.map(([k, r]) => [k, r.netns])));
  const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
  ok('the 2.1.296 record says exactly what the file said since 2026-10-14 (sha256 of its JSON, pinned)', !!F?.versions?.['2.1.296'] && sha(F.versions['2.1.296']) === 'd7389f7a2edb1d1038cd0ab389d7ec11e5a009586fac78dceca407a732dcbaa5', F?.versions?.['2.1.296'] && sha(F.versions['2.1.296']));
  const verdicts = (v) => SIX.map((n) => F?.versions?.[v]?.variants?.[n]?.verdict).join(' ');
  ok('2.1.306 (主开发\'s namespace rung, 2026-10-21): the SAME six verdicts as 2.1.296 — oat-file PASS, oat-env FAIL, oat-file-401 PASS, oat-file-near PASS, oat-file-switch PASS, oat-file-scopes FAIL', F?.versions?.['2.1.306']?.measuredAt === '2026-10-21' && verdicts('2.1.306') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.306') === verdicts('2.1.296'), `${verdicts('2.1.296')} | ${verdicts('2.1.306')}`);
  ok('oatInFile over it: 2.1.296 true, 2.1.306 true; an unmeasured 2.1.300 / 2.1.307 false, as today', C.oatInFile('2.1.296', F) === true && C.oatInFile('2.1.306 (Claude Code)', F) === true && C.oatInFile('2.1.300', F) === false && C.oatInFile('2.1.307', F) === false);
  ok('the fixture names no path, machine or person (the notes are the measurement\'s own words)', !!F && !/\/(var|home|tmp|opt|root|Users|run)\/|@|\.local\b|\.lan\b/.test(JSON.stringify(F)));
}

// ── ⑦ the probe the gate reads (verify r1 F9) ──
console.log('⑦ machine-probes.cliVersion over fake #! binaries');
{
  const P = require(path.join(REPO, 'src/machine-probes.js'));
  const fake = (name, body) => { const p = path.join(tmp, name); fs.writeFileSync(p, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return p; };
  const warn = await P.cliVersion(fake('claude-warn', "echo 'Warning: an update is available'; echo '2.1.300 (Claude Code)'"));
  ok('a warning line BEFORE the number is skipped: the upgrade (2.1.300) is seen', warn === '2.1.300 (Claude Code)' && C.cliVersionOf(warn) === '2.1.300', JSON.stringify(warn));
  const plain = await P.cliVersion(fake('claude-plain', "echo '2.1.296 (Claude Code)'"));
  ok('…the plain answer reads as before', plain === '2.1.296 (Claude Code)', JSON.stringify(plain));
  const junk = await P.cliVersion(fake('claude-junk', "echo 'Claude Code'; echo 'build: nightly'"));
  ok('an answer with no version line says \'unparsed\' (a KNOWN CLI nobody measured — never "no answer")', junk === 'unparsed', JSON.stringify(junk));
  const dead = await P.cliVersion(fake('claude-fails', 'exit 3'));
  ok('a binary that fails says null (no answer: the gate keeps the last known version)', dead === null, JSON.stringify(dead));
  const SRCP = fs.readFileSync(path.join(REPO, 'src/machine-probes.js'), 'utf8');
  const A = ".find((l) => cliVersionOf(l)) || 'unparsed'";
  if (SRCP.includes(A)) {
    const f = path.join(tmp, 'machine-probes-r1.js');
    fs.writeFileSync(f, SRCP.replace("return v.split('\\n').map((l) => l.trim())" + A + ';', "return v.trim().split('\\n')[0];").replace("require('./cli-caps.js')", `require(${JSON.stringify(CAPS)})`));
    const r1 = await require(f).cliVersion(path.join(tmp, 'claude-warn'));
    ok('RED CONTROL: the r1 probe (line 1 only) reads the warning, never the upgrade', r1 === 'Warning: an update is available' && C.cliVersionOf(r1) === null, JSON.stringify(r1));
  } else ok('⑦ anchor present in src/machine-probes.js', false, A);
}

console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
