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
//      its record pinned as it was) + 2.1.306 (2026-10-21, pinned since lane cli-2-1-307-records) + 2.1.307
//      (2026-10-22, the hub's auto-update; pinned since lane cli-2-1-308-records) + 2.1.308 (2026-10-22, the next one)
//      + 2.1.312 (2026-10-28, the loopback rung; pinned since lane oat-in-file-2-1-314) + 2.1.314 (2026-10-30, the same rung)
//      + 2.1.319 (2026-11-07, the same rung; lane cli-2-1-319-records) + 2.1.321 (2026-11-09, the same rung, the npm package's binary
//      in a lane prefix, 26 min before the owner installed it on the box; lane fable-52-cli-321);
//      2.1.300 / 2.1.309 / 2.1.313 / 2.1.315 / 2.1.318 / 2.1.320 stay unmeasured
//   ⑦ (pool-oat-materialize verify r1 F9) machine-probes.cliVersion: the FIRST line that parses as a
//      version (a warning printed before the number is skipped), 'unparsed' for an answer with none,
//      null for no answer — over fake #! binaries (never the real CLI)
//   ⑨ (row B-437e, the files tier, U0 — 主开发 r1080 (A)) src/ckpt-switch.js ckptVerdict, PURE: the checkpoint switch changes nothing
//      the CLI sends — every header's name and value (the sign-in ones as the mock's labels, the per-request ids by name, a raw one
//      compared but never shown), the body's keys, kinds and identity fields, the count requests, every call by its count — else
//      DIFFERENT + stop; heads matched by kind, not place; a turn that did not finish is INCOMPLETE; then ALREADY-ON / NO-EFFECT;
//      RED CONTROLS (anchored copies): the only-with branch emptied, calls by name, heads by place, no turn check
//   ⑩ (row B-360d, 主开发 r3765 / r3779) the version order is ONE kept collator: the order law over every pair of the fixture's
//      versions and their build-suffixed forms (read and written as the release ordered them), and the loop-hold pin BY COUNT on the
//      REAL account manager over a stand-in roster — one roster build makes no compare given options; RED: the release's line in a copy
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { versionsBefore, recordSha, byVersion, RECORD_SHA256, SPELLED_BUILDS_RE } from './lib/oat-fixture.mjs'; // B-5e52
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
// lane cli-self-measure: the measurement's core moved into src/claude-oat-probe.js (the script and the hub both call it) — the
// census reads the module for what measures and the script for what writes the fixture
const PS = fs.readFileSync(path.join(REPO, 'src/claude-oat-probe.js'), 'utf8');
ok('the measurement takes OAT_VARIANTS from src/cli-caps.js (one spelling of the six)', /\bOAT_VARIANTS\b[^\n]*=\s*createRequire\([^\n]*'src', 'cli-caps\.js'/.test(S));
ok('…and never spells the list itself', !/\[\s*'oat-file',\s*'oat-env'/.test(S));
ok('every variant name has its branch in the measurement (the module)', SIX.filter((v) => v !== 'oat-file').every((v) => PS.includes(`'${v}'`)), SIX.filter((v) => !PS.includes(`'${v}'`)).join(', '));
ok('--write-fixture writes scripts/fixtures/oat-in-file.json by default', /'fixtures', 'oat-in-file\.json'/.test(S) && S.includes("flag('write-fixture')"));
ok('…ADDING its record through cli-caps withMeasured over the file as it is when written (never this run\'s record alone)', S.includes('const next = withMeasured(fixtureNow(), fx);') && S.includes('fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1)') && !/JSON\.stringify\(fx,/.test(S));
ok('…and refusing BEFORE the run a file it could not add to, and AGAIN at write time over the file as it is then (the version is the run\'s own answer)', S.includes("if (flag('write-fixture')) { try { withMeasured(fixtureNow(), { cliVersion: '0.0.0', variants: {} }); } catch (e) { console.error(`REFUSED: --write-fixture") && S.indexOf("withMeasured(fixtureNow(), { cliVersion: '0.0.0'") < S.indexOf('PROBE.measure(') && S.includes("try { withMeasured(fixtureNow(), fx); } catch (e) { console.error(`REFUSED: --write-fixture") && S.indexOf('try { withMeasured(fixtureNow(), fx); }') < S.indexOf('const next = withMeasured(fixtureNow(), fx);'));
ok('no token-shaped literal in the module either (built at runtime)', !/sk-ant-(oat|ort|api)\d/.test(PS));
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
  // THE LOOPBACK-REAL RUNG IS TRACKED (lane pool-silent-members acceptance r2: the 2.1.312 record named this script, whose
  // --no-netns refused the real binary — it came from an untracked lane copy). Named on purpose only (never the one on
  // PATH), the three fences in the script itself: every base and the PROXY on the loopback mock, the strace belt, the CLI's
  // optional traffic off; the record says the rung and the proxy. (Here it is only REFUSED: no binary is ever run.)
  const r3 = measure(['--loopback-real', '--variant', 'oat-file']);
  ok('--no-netns --loopback-real without --claude refuses before anything runs (never the one on PATH)', r3.status === 2 && /REFUSED: --loopback-real needs --claude <the real claude>/.test(r3.stderr), `exit ${r3.status}: ${String(r3.stderr).slice(-300)}`);
  const MS = fs.readFileSync(SCRIPT, 'utf8');
  ok('…the rung lives in the TRACKED script: the real binary only with --no-netns --loopback-real, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 (on every rung since lane cli-self-measure r2 — assertEnv requires it), HTTPS_PROXY = the mock, the record\'s rung + proxy (the belt on both rungs is test-oat-measure-fake\'s, a heavy)',
    /const LOOPBACK_REAL = flag\('loopback-real'\) && !NETNS;/.test(MS) && /const RUNG = NETNS \? 'netns' : LOOPBACK_REAL \? 'loopback-real' : 'fake';/.test(MS) && /const CLAUDE = resolveClaude\(RUNG, o\.claude\);/.test(PS)
    && /CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', \/\/ the CLI's optional traffic off — on EVERY rung \(assertEnv requires it\)/.test(PS) && /const PROXY_ENV = \{ HTTPS_PROXY: BASE, HTTP_PROXY: BASE,/.test(PS)
    && /\.\.\.\(LOOPBACK_REAL \? \{ rung: 'loopback-real' \} : \{\}\), proxy: 'loopback-mock', variants: \{\} \};/.test(MS));
  // (acceptance r3: never a claim wider than the code — the --out record names its rung and its proxy too, not only the fixture's)
  ok('…and the --out record says them as well — every record the script writes names its proxy (the mock), the loopback-real one its rung', /const record = \{\s*measuredAt: [^\n]*, netns: NETNS, \.\.\.\(LOOPBACK_REAL \? \{ rung: 'loopback-real' \} : \{\}\), proxy: 'loopback-mock', resolver: RESOLVER,/.test(PS));
  ok('…and its --no-netns line says the truth for each rung («the REAL claude, no namespace …» / «a FAKE claude on the loopback mock»)', /LOOPBACK_REAL \? ' \(--no-netns --loopback-real: the REAL claude, no namespace/.test(PS) && /: ' \(--no-netns: a FAKE claude on the loopback mock\)'/.test(PS));
}

// ── ⑥ the committed fixture (主开发's namespace rung writes it) ──
console.log('⑥ the committed fixture');
const COMMITTED = path.join(REPO, 'scripts/fixtures/oat-in-file.json');
if (!fs.existsSync(COMMITTED)) {
  console.log('  (none yet: `node scripts/measure-claude-cred-read.mjs --variant oat --write-fixture` in the namespace rung writes it; until then oatInFile is false for every CLI)');
} else {
  let F = null; try { F = JSON.parse(fs.readFileSync(COMMITTED, 'utf8')); } catch { }
  const recs = F && F.versions && typeof F.versions === 'object' ? Object.entries(F.versions) : [];
  ok(`scripts/fixtures/oat-in-file.json parses: one record per measured version, keyed by its exact version — the builds RECORD_SHA256 pins (${Object.keys(RECORD_SHA256).join(', ')}), oldest first`, !!F && JSON.stringify(Object.keys(F)) === '["versions"]' && JSON.stringify(recs.map(([k]) => k)) === JSON.stringify(Object.keys(RECORD_SHA256)) && JSON.stringify(C.measuredVersions(F)) === JSON.stringify(Object.keys(RECORD_SHA256)), JSON.stringify(F).slice(0, 300));
  ok('…each record has the six verdicts and names the measurement', recs.length > 0 && recs.every(([k, r]) => r.cliVersion === k && /^\d{4}-\d\d-\d\d$/.test(r.measuredAt) && r.script === 'scripts/measure-claude-cred-read.mjs' && SIX.every((n) => r.variants?.[n] && /^(PASS|FAIL|INCOMPLETE)$/.test(r.variants[n].verdict) && typeof r.variants[n].note === 'string')), JSON.stringify(recs.map(([k, r]) => [k, r.cliVersion, r.measuredAt])));
  // 2.1.312 (lane pool-silent-members R1, 2026-10-28): the brief ruled the claude-steer recipe — the REAL binary on the
  // loopback mock with a fake long-lived token, NO namespace — and the record SAYS so (`netns: false`, `rung:
  // 'loopback-real'`): the mock answered every API/OAuth/OTel call, HTTPS_PROXY = the mock refused each CONNECT
  // (16 to api.anthropic.com, all refused), the strace belt saw no off-loopback connect. Every older record is the namespace rung's.
  // 2.1.314 (lane oat-in-file-2-1-314, 2026-10-30): the same rung — a lane creates no namespace — and the record says it the same way.
  const LOOPBACK_RECS = Object.keys(RECORD_SHA256).filter((k) => byVersion(k, '2.1.312') >= 0); // B-5e52: every build from 2.1.312 on is measured on the loopback rung (a lane creates no namespace) — derived, so a new build adds no entry here
  ok('…each measured with the real CLI (not a fake): 2.1.296–2.1.308 in the namespace, 2.1.312, 2.1.314, 2.1.319 and 2.1.321 on the loopback rung and SAYING so', recs.length > 0 && recs.every(([k, r]) => k !== '9.9.9' && (LOOPBACK_RECS.includes(k) ? r.netns === false && r.rung === 'loopback-real' && r.proxy === 'loopback-mock' : r.netns === true && !('rung' in r))), JSON.stringify(recs.map(([k, r]) => [k, r.netns, r.rung || null])));
  const verdicts = (v) => SIX.map((n) => F?.versions?.[v]?.variants?.[n]?.verdict).join(' ');
  ok('2.1.306 (主开发\'s namespace rung, 2026-10-21): the SAME six verdicts as 2.1.296 — oat-file PASS, oat-env FAIL, oat-file-401 PASS, oat-file-near PASS, oat-file-switch PASS, oat-file-scopes FAIL', F?.versions?.['2.1.306']?.measuredAt === '2026-10-21' && verdicts('2.1.306') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.306') === verdicts('2.1.296'), `${verdicts('2.1.296')} | ${verdicts('2.1.306')}`);
  ok('2.1.307 (主开发\'s namespace rung, 2026-10-22 — the hub\'s claude auto-updated 2026-10-21): the SAME six verdicts as 2.1.306 and 2.1.296, each note word for word 2.1.306\'s', F?.versions?.['2.1.307']?.measuredAt === '2026-10-22' && verdicts('2.1.307') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.307') === verdicts('2.1.306') && SIX.every((n) => F.versions['2.1.307'].variants[n].note === F.versions['2.1.306'].variants[n].note), `${verdicts('2.1.306')} | ${verdicts('2.1.307')}`);
  ok('2.1.308 (主开发\'s namespace rung, 2026-10-22 07:09Z — the hub\'s claude auto-updated again 2026-10-21 22:48 PT): the SAME six verdicts as 2.1.307, 2.1.306 and 2.1.296, each note word for word 2.1.307\'s', F?.versions?.['2.1.308']?.measuredAt === '2026-10-22' && verdicts('2.1.308') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.308') === verdicts('2.1.307') && SIX.every((n) => F.versions['2.1.308'].variants[n].note === F.versions['2.1.307'].variants[n].note), `${verdicts('2.1.307')} | ${verdicts('2.1.308')}`);
  ok('2.1.312 (lane pool-silent-members, 2026-10-28 — the hub\'s claude auto-updated 2026-10-27 19:16 PT and the pool lost six members): the SAME six verdicts as 2.1.308; the scopes refusal is word for word «Not logged in · Please run /login»', F?.versions?.['2.1.312']?.measuredAt === '2026-10-28' && verdicts('2.1.312') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.312') === verdicts('2.1.308') && /Not logged in · Please run \/login/.test(F.versions['2.1.312'].variants['oat-file-scopes'].note) && /bearer = the file's oat/.test(F.versions['2.1.312'].variants['oat-file'].note), `${verdicts('2.1.308')} | ${verdicts('2.1.312')}`);
  // 2.1.314 (lane oat-in-file-2-1-314, 2026-10-30): the box's claude auto-updated from 2.1.312 that day and every long-lived-token
  // member read «claude 2.1.314 is not measured with it in the account's folder». `usagePanel` on oat-file is the owner's hand
  // measurement the same day: `claude -p /usage` with a long-lived-token login prints the header line only, no quota lines.
  const r314 = F?.versions?.['2.1.314'];
  ok('2.1.314 (lane oat-in-file-2-1-314, 2026-10-30 — the hub\'s claude auto-updated from 2.1.312 that day): the SAME six verdicts as 2.1.312; the scopes refusal is word for word «Not logged in · Please run /login»', r314?.measuredAt === '2026-10-30' && verdicts('2.1.314') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.314') === verdicts('2.1.312') && /Not logged in · Please run \/login/.test(r314.variants['oat-file-scopes'].note) && /bearer = the file's oat/.test(r314.variants['oat-file'].note), `${verdicts('2.1.312')} | ${verdicts('2.1.314')}`);
  ok('…and its oat-file variant names the /usage panel: header only, measured by the owner — the probe stays skipped for this login shape', typeof r314?.variants?.['oat-file']?.usagePanel === 'string' && /no quota lines \(header only\)/.test(r314.variants['oat-file'].usagePanel) && /measured by the owner/.test(r314.variants['oat-file'].usagePanel) && /the probe stays skipped for this login shape/.test(r314.variants['oat-file'].usagePanel), r314?.variants?.['oat-file']);
  // 2.1.319 (lane cli-2-1-319-records, 2026-11-07): the box's claude self-updated 2026-11-06 16:27 PT and the hub's journal said «11 pool member(s) cannot be
  // placed» — the third CLI update to shrink the pool (.312, .314). It ADDS its record; no /usage panel note: §ban-safety — never `claude -p /usage` against a
  // real login, so nobody re-measured it (nothing reads the note: a folder-token row reads oat-folder-no-panel on every version).
  const r319 = F?.versions?.['2.1.319'];
  ok('2.1.319 (lane cli-2-1-319-records, 2026-11-07 — the hub\'s claude self-updated from 2.1.314 on 11-06): the SAME six verdicts as 2.1.314, each note word for word 2.1.314\'s; the scopes refusal «Not logged in · Please run /login»; the three the gate reads PASS', r319?.measuredAt === '2026-11-07' && r319?.cliVersion === '2.1.319' && verdicts('2.1.319') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.319') === verdicts('2.1.314') && SIX.every((n) => r319.variants[n].note === F.versions['2.1.314'].variants[n].note) && /Not logged in · Please run \/login/.test(r319.variants['oat-file-scopes'].note), `${verdicts('2.1.314')} | ${verdicts('2.1.319')}`);
  ok('…with no /usage panel note: nobody ran `claude -p /usage` against a real login for it (§ban-safety), and nothing reads the note', !!r319 && !('usagePanel' in r319.variants['oat-file']));
  ok('oatInFile over it: 2.1.296 true, 2.1.306 true, 2.1.307 true, 2.1.308 true, 2.1.312 true, 2.1.314 true, 2.1.319 true; an unmeasured 2.1.300 / 2.1.309 / 2.1.313 / 2.1.315 / 2.1.318 / 2.1.320 false, as today', C.oatInFile('2.1.296', F) === true && C.oatInFile('2.1.306 (Claude Code)', F) === true && C.oatInFile('2.1.307 (Claude Code)', F) === true && C.oatInFile('2.1.308 (Claude Code)', F) === true && C.oatInFile('2.1.312 (Claude Code)', F) === true && C.oatInFile('2.1.314 (Claude Code)', F) === true && C.oatInFile('2.1.319 (Claude Code)', F) === true && C.oatInFile('2.1.318', F) === false && C.oatInFile('2.1.320', F) === false && C.oatInFile('2.1.300', F) === false && C.oatInFile('2.1.309', F) === false && C.oatInFile('2.1.313', F) === false && C.oatInFile('2.1.315', F) === false);
  const r319o = (F?.versions || {})['2.1.319'], base383 = versionsBefore((F?.versions || {}), '2.1.319'); // B-5e52: the fixture before 2.1.319 was measured
  ok('RED CONTROL (the .383 base, 8b3fdb6ab): the same file without its 2.1.319 record grants 2.1.319 nothing — the cli-unmeasured the hub\'s journal said of 11 members on 11-06 («claude CLI 2.1.319 is not measured»)', !!r319o && C.oatInFile('2.1.319', { versions: base383 }) === false && C.oatInFile('2.1.314', { versions: base383 }) === true && JSON.stringify(C.measuredVersions({ versions: base383 })) === JSON.stringify(['2.1.296', '2.1.306', '2.1.307', '2.1.308', '2.1.312', '2.1.314']));
  // 2.1.321 (lane fable-52-cli-321, 2026-11-09): npm published it that day (Fable 5.2 ships with it); measured at 20:28Z, and the owner installed it on the box at 20:54Z
  // (.386 then held every long-lived-token member as cli-unmeasured) — measured BEFORE the pool met it — the npm package's binary in a lane prefix, on the same loopback rung. It ADDS its record.
  const r321 = F?.versions?.['2.1.321'];
  ok('2.1.321 (lane fable-52-cli-321, 2026-11-09 — npm\'s newest, measured before the owner\'s install): the SAME six verdicts as 2.1.319, each note word for word 2.1.319\'s; the three the gate reads PASS; no /usage panel note (§ban-safety)', r321?.measuredAt === '2026-11-09' && r321?.cliVersion === '2.1.321' && verdicts('2.1.321') === 'PASS FAIL PASS PASS PASS FAIL' && verdicts('2.1.321') === verdicts('2.1.319') && SIX.every((n) => r321.variants[n].note === F.versions['2.1.319'].variants[n].note) && !('usagePanel' in r321.variants['oat-file']), `${verdicts('2.1.319')} | ${verdicts('2.1.321')}`);
  const NEXT_UNMEASURED = (() => { const v = Object.keys(RECORD_SHA256).at(-1).split('.').map(Number); v[2] += 1; return v.join('.'); })(); // B-5e52: one past the newest pinned record — derived, so measuring that build edits no leg here
  ok(`oatInFile(2.1.321) true; an unmeasured 2.1.320 / ${NEXT_UNMEASURED} (one past the newest record) false`, C.oatInFile('2.1.321 (Claude Code)', F) === true && C.oatInFile('2.1.320', F) === false && C.oatInFile(NEXT_UNMEASURED, F) === false);
  const r321o = (F?.versions || {})['2.1.321'], base386 = versionsBefore((F?.versions || {}), '2.1.321'); // B-5e52: the fixture before 2.1.321 was measured
  ok('RED CONTROL (the .386 base, f5e087bb5): the same file without its 2.1.321 record grants 2.1.321 nothing — the cli-unmeasured every long-lived-token member would read the moment the owner updates (the fourth time: .312, .314, .319)', !!r321o && C.oatInFile('2.1.321', { versions: base386 }) === false && C.oatInFile('2.1.319', { versions: base386 }) === true && JSON.stringify(C.measuredVersions({ versions: base386 })) === JSON.stringify(['2.1.296', '2.1.306', '2.1.307', '2.1.308', '2.1.312', '2.1.314', '2.1.319']));
  const r314o = (F?.versions || {})['2.1.314'], base364 = versionsBefore((F?.versions || {}), '2.1.314'); // B-5e52: the fixture before 2.1.314 was measured
  ok('RED CONTROL (the .364 base, 43d0f8d2d): the same file without its 2.1.314 record grants 2.1.314 nothing — the cli-unmeasured every long-lived-token member read on 10-30 («claude 2.1.314 is not measured with it in the account\'s folder»)', !!r314o && C.oatInFile('2.1.314', { versions: base364 }) === false && C.oatInFile('2.1.312', { versions: base364 }) === true && JSON.stringify(C.measuredVersions({ versions: base364 })) === JSON.stringify(['2.1.296', '2.1.306', '2.1.307', '2.1.308', '2.1.312']));
  const r312 = (F?.versions || {})['2.1.312'], base360 = versionsBefore((F?.versions || {}), '2.1.312'); // B-5e52: the fixture before 2.1.312 was measured
  ok('RED CONTROL (the .360 base, 90c995a3): the same file without its 2.1.312 record grants 2.1.312 nothing — the cli-unmeasured that took six members out of the pool on 10-27', !!r312 && C.oatInFile('2.1.312', { versions: base360 }) === false && C.oatInFile('2.1.308', { versions: base360 }) === true && JSON.stringify(C.measuredVersions({ versions: base360 })) === JSON.stringify(['2.1.296', '2.1.306', '2.1.307', '2.1.308']));
  const r307 = (F?.versions || {})['2.1.307'], r308x = (F?.versions || {})['2.1.308'], r312x = (F?.versions || {})['2.1.312'], base340 = versionsBefore((F?.versions || {}), '2.1.307'); // B-5e52: the fixture before 2.1.307 was measured
  ok('RED CONTROL (the .340 base): the same file without its 2.1.307 record (2.1.296 + 2.1.306) grants 2.1.307 nothing — the cli-unmeasured refusal the hub\'s auto-update brought', !!r307 && C.oatInFile('2.1.307', { versions: base340 }) === false && C.oatInFile('2.1.306', { versions: base340 }) === true && JSON.stringify(C.measuredVersions({ versions: base340 })) === JSON.stringify(['2.1.296', '2.1.306']));
  const r308 = (F?.versions || {})['2.1.308'], r312y = (F?.versions || {})['2.1.312'], base341 = versionsBefore((F?.versions || {}), '2.1.308'); // B-5e52: the fixture before 2.1.308 was measured
  ok('RED CONTROL (the .341 base): the same file without its 2.1.308 record (2.1.296 + 2.1.306 + 2.1.307) grants 2.1.308 nothing — the cli-unmeasured the six long-lived-token rows read again after the auto-update', !!r308 && !!r308x && C.oatInFile('2.1.308', { versions: base341 }) === false && C.oatInFile('2.1.307', { versions: base341 }) === true && JSON.stringify(C.measuredVersions({ versions: base341 })) === JSON.stringify(['2.1.296', '2.1.306', '2.1.307']));
  // B-5e52 (lane bl-tests-e): EVERY measured record is pinned by ONE table (scripts/lib/oat-fixture.mjs RECORD_SHA256) — the six
  // legs that pinned 2.1.296 … 2.1.319 one by one are this loop now, and 2.1.308 and 2.1.321 (never pinned) are in it. A new build
  // is ONE row there; a record rewritten by hand, or added without its row, is red here by name.
  const pinMisses = (fx) => Object.entries(RECORD_SHA256).filter(([v, want]) => !fx?.versions?.[v] || recordSha(fx.versions[v]) !== want).map(([v]) => v);
  for (const [v, want] of Object.entries(RECORD_SHA256)) ok(`the ${v} record says exactly what it said when measured (sha256 of its JSON = RECORD_SHA256's row)`, !!F?.versions?.[v] && recordSha(F.versions[v]) === want, F?.versions?.[v] ? recordSha(F.versions[v]) : 'no record');
  const unpinned = recs.map(([k]) => k).filter((k) => !Object.hasOwn(RECORD_SHA256, k)), orphan = Object.keys(RECORD_SHA256).filter((k) => !F?.versions?.[k]);
  ok('every record has its pin and every pin its record (a new build: ONE row in RECORD_SHA256 — the red prints it)', recs.length >= 8 && unpinned.length === 0 && orphan.length === 0, { orphan, rowsToAdd: unpinned.map((k) => `'${k}': '${recordSha(F.versions[k])}', // ${F.versions[k].measuredAt}`) });
  const edited = F?.versions?.['2.1.296'] ? { versions: { ...F.versions, '2.1.296': { ...F.versions['2.1.296'], measuredAt: '2026-10-15' } } } : null;
  ok('RED CONTROL: the same pin check over a copy with ONE word of the 2.1.296 record changed names exactly that record; over the file, none', !!edited && pinMisses(edited).join() === '2.1.296' && pinMisses(F).length === 0, edited && pinMisses(edited));
  // …and the fixture «before build v» is ONE call, never a destructuring that spells every later build (about nine of them in four
  // suites, edited at each new build — test-account-verdicts' «fx-to-2.1.308» had missed 2.1.321)
  const vb = versionsBefore({ '2.1.296': 1, '2.1.306': 2, '2.1.312': 3, '2.1.4': 4, '2.1.10': 5 }, '2.1.312');
  ok('versionsBefore keeps every OLDER build, by number (2.1.4 < 2.1.10 < 2.1.296 < 2.1.312), never a newer one', JSON.stringify(Object.keys(vb).sort()) === JSON.stringify(['2.1.10', '2.1.296', '2.1.306', '2.1.4']) && Object.keys(versionsBefore(F?.versions, '2.1.307')).join() === '2.1.296,2.1.306', Object.keys(vb));
  const scriptsOf = (d) => fs.readdirSync(path.join(REPO, d)).filter((f) => /\.(?:mjs|cjs|js)$/.test(f)).map((f) => `${d}/${f}`);
  const codeOf = (t) => t.split('\n').filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n');   // a comment may spell the old shape (oat-fixture.mjs's head does)
  const spelled = [...scriptsOf('scripts'), ...scriptsOf('scripts/lib')].filter((f) => f !== 'scripts/test-cli-caps.mjs' && SPELLED_BUILDS_RE.test(codeOf(fs.readFileSync(path.join(REPO, f), 'utf8'))));
  ok('no suite spells the later builds by hand (`const { \'2.1.x\': … } = …versions`) — versionsBefore is the one call', spelled.length === 0, spelled);
  ok('NEG: the census sees that shape — const / let / var, either quote, a build key after another key', SPELLED_BUILDS_RE.test("  const { '2.1.312': _r312, ...upTo308 } = FX.versions;") && SPELLED_BUILDS_RE.test('  let { "2.1.312": a, ...b } = F.versions;') && SPELLED_BUILDS_RE.test("  var { x, '2.1.312': a, ...b } = F.versions;") && !SPELLED_BUILDS_RE.test("  const upTo308 = versionsBefore(FX.versions, '2.1.312');"));
  ok('the fixture names no path, machine or person (the notes are the measurement\'s own words)', !!F && !/\/(var|home|tmp|opt|root|Users|run)\/|@|\.local\b|\.lan\b/.test(JSON.stringify(F)));
}

// env names set for one call and put back (B-ec25: under VS_NO_REAL_CLI=1 a probe starts only THE stand-in CLAUDE_CMD names)
const withEnv = async (vars, fn) => {
  const keep = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

// ── ⑦ the probe the gate reads (verify r1 F9) ──
console.log('⑦ machine-probes.cliVersion over fake #! binaries');
{
  const P = require(path.join(REPO, 'src/machine-probes.js'));
  const fake = (name, body) => { const p = path.join(tmp, name); fs.writeFileSync(p, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return p; };
  const ver = (f, probes = P) => withEnv({ CLAUDE_CMD: f }, () => probes.cliVersion(f));   // each fake named as the stand-in (B-ec25)
  const warn = await ver(fake('claude-warn', "echo 'Warning: an update is available'; echo '2.1.300 (Claude Code)'"));
  ok('a warning line BEFORE the number is skipped: the upgrade (2.1.300) is seen', warn === '2.1.300 (Claude Code)' && C.cliVersionOf(warn) === '2.1.300', JSON.stringify(warn));
  const plain = await ver(fake('claude-plain', "echo '2.1.296 (Claude Code)'"));
  ok('…the plain answer reads as before', plain === '2.1.296 (Claude Code)', JSON.stringify(plain));
  const junk = await ver(fake('claude-junk', "echo 'Claude Code'; echo 'build: nightly'"));
  ok('an answer with no version line says \'unparsed\' (a KNOWN CLI nobody measured — never "no answer")', junk === 'unparsed', JSON.stringify(junk));
  const dead = await ver(fake('claude-fails', 'exit 3'));
  ok('a binary that fails says null (no answer: the gate keeps the last known version)', dead === null, JSON.stringify(dead));
  const SRCP = fs.readFileSync(path.join(REPO, 'src/machine-probes.js'), 'utf8');
  const A = ".find((l) => cliVersionOf(l)) || 'unparsed'";
  if (SRCP.includes(A)) {
    const f = path.join(tmp, 'machine-probes-r1.js');
    fs.writeFileSync(f, anchored(editAnchor(editAnchor(SRCP, "return v.split('\\n').map((l) => l.trim())" + A + ';', "return v.trim().split('\\n')[0];", "src/machine-probes.js"), "require('./cli-caps.js')", `require(${JSON.stringify(CAPS)})`, "src/machine-probes.js"), "require('./helper-fact.js')", `require(${JSON.stringify(path.join(REPO, 'src/helper-fact.js'))})`, 'probe-helper-fact-path'));   // (B-bc9f: the probe requires the PURE helper-fact too — through anchored(): a moved require throws by name)
    const r1 = await ver(path.join(tmp, 'claude-warn'), require(f));
    ok('RED CONTROL: the r1 probe (line 1 only) reads the warning, never the upgrade', r1 === 'Warning: an update is available' && C.cliVersionOf(r1) === null, JSON.stringify(r1));
  } else ok('⑦ anchor present in src/machine-probes.js', false, A);
}

// ── ⑧ NO SELF-FOUND AGENT CLI UNDER THE FLAG (B-ec25, lane bl-tests-e) ──
// machine-probes is the door of the hub's --version reads (the long-lived-token clock's tick 20 s after boot, GET
// /api/backend-status): under VS_NO_REAL_CLI=1 it starts only THE stand-in the env names. Argv-recording stubs; the
// CONTROL first (the flag unset: the same binary IS started), so an empty record under the flag is the guard.
console.log('⑧ B-ec25: machine-probes starts no agent CLI it found by itself under VS_NO_REAL_CLI=1 — only THE stand-in the env names');
{
  const P = require(path.join(REPO, 'src/machine-probes.js'));
  const REC = path.join(tmp, 'ec25-argv.log');
  const stub = (name) => { const p = path.join(tmp, name); fs.writeFileSync(p, `#!/bin/sh\nprintf '%s %s\\n' '${name}' "$*" >> '${REC}'\necho '2.1.300 (Claude Code)'\n`, { mode: 0o755 }); return p; };
  const CL = stub('ec25-claude'), OTHER = stub('ec25-other'), CX = stub('ec25-codex');
  const runs = () => { try { return fs.readFileSync(REC, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
  const fresh = () => fs.rmSync(REC, { force: true });
  const said = [], log0 = console.log;
  console.log = (...a) => { said.push(a.join(' ')); log0(...a); };
  try {
    fresh();
    const ctl = await withEnv({ VS_NO_REAL_CLI: null, CLAUDE_CMD: null }, () => P.cliVersion(CL));
    ok(`RED CONTROL (first): the flag unset, cliVersion STARTS the binary it was handed (${runs().join(' · ') || 'none'})`, ctl === '2.1.300 (Claude Code)' && runs().join('|') === 'ec25-claude --version', JSON.stringify(ctl));
    fresh();
    const v0 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: null }, () => P.cliVersion(CL));
    ok('under VS_NO_REAL_CLI=1 with no CLAUDE_CMD, cliVersion starts nothing and answers null (no answer: the gate keeps the last known version)', v0 === null && runs().length === 0, JSON.stringify([v0, runs()]));
    ok('…said by name, once', said.filter((l) => l === '[cli-probe] claude --version not run: VS_NO_REAL_CLI=1 and no CLAUDE_CMD names a stand-in').length === 1, JSON.stringify(said));
    const f0 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: null, CODEX_CMD: null, HOME: tmp }, () => P.cliFacts({ claudeCmd: CL, codexCmd: CX }));
    ok('cliFacts under the flag: both CLIs found, neither started — installed, no version, the words why', runs().length === 0 && f0.claude.installed === true && f0.claude.version === null && /^not run: VS_NO_REAL_CLI=1 and no CLAUDE_CMD/.test(f0.claude.notRun || '') && f0.codex.installed === true && f0.codex.version === null && /^not run: VS_NO_REAL_CLI=1 and no CODEX_CMD/.test(f0.codex.notRun || ''), JSON.stringify([runs(), f0.claude, f0.codex]));
    const v1 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: CL }, () => P.cliVersion(CL));
    ok('THE stand-in the env names still runs under the flag', v1 === '2.1.300 (Claude Code)' && runs().join('|') === 'ec25-claude --version', JSON.stringify([v1, runs()]));
    fresh();
    const v2 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: OTHER }, () => P.cliVersion(CL));
    ok('a named stand-in never unlocks ANOTHER binary: CLAUDE_CMD names one stub, the probe is handed another ⇒ nothing started', v2 === null && runs().length === 0, JSON.stringify([v2, runs()]));
    const PB = path.join(tmp, 'ec25-pathbin'); fs.mkdirSync(PB, { recursive: true });
    fs.writeFileSync(path.join(PB, 'claude'), `#!/bin/sh\nprintf '%s %s\\n' 'path-claude' "$*" >> '${REC}'\necho '2.1.300 (Claude Code)'\n`, { mode: 0o755 });
    const v3 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: 'claude', PATH: `${PB}:${process.env.PATH}` }, () => P.cliVersion('claude'));
    ok('CLAUDE_CMD=claude (the bare default name) names no stand-in — the `claude` PATH finds (the very file the name resolves to) is NOT started', v3 === null && runs().length === 0, JSON.stringify([v3, runs()]));
    const LN = path.join(tmp, 'ec25-link'); try { fs.unlinkSync(LN); } catch { } fs.symlinkSync(CL, LN);
    const v4 = await withEnv({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: LN }, () => P.cliVersion(CL));
    ok('a stand-in named through a SYMLINK is the same file ⇒ it runs (the realpath decides, not the spelling)', v4 === '2.1.300 (Claude Code)' && runs().join('|') === 'ec25-claude --version', JSON.stringify([v4, runs()]));
  } finally { console.log = log0; }
}

// ── ⑨ the checkpoint switch's verdict (row B-437e U0) ──
console.log('⑨ ckptVerdict — the switch changes nothing the CLI sends, or the tier STOPS');
{
  const K = require(path.join(REPO, 'src/ckpt-switch.js'));
  const head = (i, over = {}) => ({ path: '/v1/messages?beta=true', headers: { 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01', authorization: 'Bearer <O oat>', 'content-length': String(400 + i), 'user-agent': 'claude-cli/9.9.9 (external, sdk-cli)', 'x-app': 'cli', 'x-claude-code-session-id': 'sid-a', 'x-client-request-id': `rq-${i}`, ...(over.headers || {}) }, body: { keys: ['max_tokens', 'messages', 'metadata', 'model', 'stream', 'system', 'tools'], model: 'claude-x', max_tokens: 32000, stream: true, betas: null, thinking: null, tools: 2, toolNames: ['Edit', 'Read'], system: 2, systemHead: 'a1b2c3d4e5f60718', metadataKeys: ['user_id'], userId: 'user_dev_account_acct-O_session_<session>', toolChoice: null, contextManagement: null, ...(over.body || {}) } });
  const side = (over = {}) => ({ path: '/v1/messages?beta=true', headers: { 'anthropic-version': '2023-06-01', authorization: 'Bearer <O oat>', 'content-length': '120', ...(over.headers || {}) }, body: { keys: ['max_tokens', 'messages', 'model'], model: 'claude-small', max_tokens: 512, stream: false, betas: null, thinking: null, tools: null, toolNames: null, system: 1, systemHead: '0011223344556677', metadataKeys: null, userId: null, toolChoice: null, contextManagement: null, ...(over.body || {}) } });
  const CALLS = ['/v1/messages stream claude-x O bearer 200', '/v1/messages stream claude-x O bearer 200', '/v1/messages stream claude-x O bearer 200', 'otel api_request org=- acct=- email=-', 'otel tool_result org=- acct=- email=-'];
  const run = (o = {}) => ({ heads: o.heads || [head(1, o.h1), head(2, o.h2), head(3, o.h3)].slice(0, o.n || 3), countHeads: o.countHeads || [], calls: o.calls || CALLS, files: o.files ?? 0, edited: o.edited ?? true, turnOk: o.turnOk ?? true });
  const OFF = run(), ON = run({ files: 1 });
  const legs = (V) => [
    ['the same turn, one checkpoint file with the switch ⇒ SAME', V(OFF, ON), 'SAME', false],
    ['a header only with the switch ⇒ DIFFERENT, STOP', V(OFF, run({ files: 1, h2: { headers: { 'x-new': '1' } } })), 'DIFFERENT', true],
    ['a header only without it ⇒ DIFFERENT', V(run({ h1: { headers: { 'x-old': '1' } } }), ON), 'DIFFERENT', true],
    ['a kind value (anthropic-beta) ⇒ DIFFERENT', V(OFF, run({ files: 1, h1: { headers: { 'anthropic-beta': 'oauth-2025-04-20,files-api-2025' } } })), 'DIFFERENT', true],
    ['the credential\'s label (another member, another scheme) ⇒ DIFFERENT', V(OFF, run({ files: 1, h1: { headers: { authorization: 'Bearer <A token 2>' } } })), 'DIFFERENT', true],
    ['a body byte count (content-length: the two runs\' paths are of equal length) ⇒ DIFFERENT', V(OFF, run({ files: 1, h3: { headers: { 'content-length': '999' } } })), 'DIFFERENT', true],
    ['the system\'s first block (the client\'s identity prefix) ⇒ DIFFERENT', V(OFF, run({ files: 1, h1: { body: { systemHead: 'ffffffffffffffff' } } })), 'DIFFERENT', true],
    ['the metadata\'s user id, its ACCOUNT part ⇒ DIFFERENT', V(OFF, run({ files: 1, h2: { body: { userId: 'user_dev_account_acct-A_session_<session>' } } })), 'DIFFERENT', true],
    ['the metadata\'s user id, its DEVICE part ⇒ DIFFERENT (no mask chosen: the two homes carry ONE made-up device id, r1107 MUST 2)', V(OFF, run({ files: 1, h1: { body: { userId: 'user_dev2_account_acct-O_session_<session>' } } })), 'DIFFERENT', true],
    ['an edit that failed on one run ⇒ INCOMPLETE before any comparison (its byte counts differ too)', V(OFF, run({ files: 1, edited: false, h2: { headers: { 'content-length': '777' } } })), 'INCOMPLETE', false],
    ['a tool choice ⇒ DIFFERENT', V(OFF, run({ files: 1, h2: { body: { toolChoice: '{"type":"auto"}' } } })), 'DIFFERENT', true],
    ['a top-level body key ⇒ DIFFERENT', V(OFF, run({ files: 1, h3: { body: { keys: [...head(1).body.keys, 'context_management'].sort() } } })), 'DIFFERENT', true],
    ['a tool name ⇒ DIFFERENT (another kind of request: the counts by kind differ)', V(OFF, run({ files: 1, h1: { body: { toolNames: ['Edit', 'Read', 'Rewind'], tools: 3 } } })), 'DIFFERENT', true],
    ['a count request only with the switch ⇒ DIFFERENT', V(OFF, run({ files: 1, countHeads: [side()] })), 'DIFFERENT', true],
    ['a call twice instead of once (the counts, not the names) ⇒ DIFFERENT', V(OFF, run({ files: 1, calls: [...CALLS, 'otel tool_result org=- acct=- email=-'] })), 'DIFFERENT', true],
    ['a refused escape only with the switch ⇒ DIFFERENT', V(OFF, run({ files: 1, calls: [...CALLS, 'escape CONNECT files.example.invalid:443'] })), 'DIFFERENT', true],
    ['one request fewer ⇒ DIFFERENT', V(OFF, run({ files: 1, n: 2 })), 'DIFFERENT', true],
    ['the per-request ids differ (the session id, the request id), every name the same ⇒ SAME', V(OFF, run({ files: 1, h1: { headers: { 'x-claude-code-session-id': 'sid-b', 'x-client-request-id': 'rq-x' } } })), 'SAME', false],
    ['a side request racing the main ones (another place in the order) ⇒ SAME — matched by path, stream and tools', V(run({ heads: [side(), head(1), head(2), head(3)] }), run({ files: 1, heads: [head(1), head(2), side(), head(3)] })), 'SAME', false],
    ['the turn did not finish with the switch ⇒ INCOMPLETE (never «the switch changes what is sent»)', V(OFF, run({ files: 1, n: 1, turnOk: false })), 'INCOMPLETE', false],
    ['checkpoint files WITHOUT the switch ⇒ ALREADY-ON', V(run({ files: 2 }), ON), 'ALREADY-ON', false],
    ['no checkpoint file with it ⇒ NO-EFFECT', V(OFF, run({ files: 0 })), 'NO-EFFECT', false],
    ['the note not edited ⇒ INCOMPLETE', V(OFF, run({ files: 1, edited: false })), 'INCOMPLETE', false],
    ['one run missing ⇒ INCOMPLETE', V(null, ON), 'INCOMPLETE', false],
  ];
  for (const [n, r, want, stop] of legs(K.ckptVerdict)) ok(`${n}${r.findings.length ? ` — ${r.findings[0]}` : ''}`, r.verdict === want && !!r.stop === stop, JSON.stringify(r).slice(0, 300));
  const named = K.ckptVerdict(OFF, run({ files: 1, h2: { headers: { 'x-new': '1' } } }));
  ok('a DIFFERENT names the request (its kind and place) and the header', named.findings.length === 1 && /^request \/v1\/messages\?beta=true stream \["Edit","Read"\] #2 header only with the switch: x-new$/.test(named.findings[0]), JSON.stringify(named.findings));
  const secret = K.ckptVerdict(run({ h1: { headers: { cookie: 'sid=AAAA-raw' } } }), run({ files: 1, h1: { headers: { cookie: 'sid=BBBB-raw' } } }));
  ok('a header the mock keeps raw (cookie) is compared — and its value is NEVER shown', secret.verdict === 'DIFFERENT' && secret.findings.some((x) => /header cookie differs \(its value is not shown\)$/.test(x)) && !/AAAA|BBBB/.test(JSON.stringify(secret)), JSON.stringify(secret.findings));
  ok('ckptSwitchOf: the version\'s measured verdict; null for one not measured, a null fixture, a bare record, a record under the key naming another version',
    K.ckptSwitchOf('9.9.9 (Claude Code)', { versions: { '9.9.9': { cliVersion: '9.9.9', verdict: 'SAME' } } }) === 'SAME' && K.ckptSwitchOf('9.9.8', { versions: { '9.9.9': { cliVersion: '9.9.9', verdict: 'SAME' } } }) === null
    && K.ckptSwitchOf('9.9.9', null) === null && K.ckptSwitchOf('9.9.9', { verdict: 'SAME' }) === null && K.ckptSwitchOf('9.9.9', { versions: { '9.9.9': { cliVersion: '9.9.8', verdict: 'SAME' } } }) === null);
  ok('the switch, its pair and the lists are one spelling, frozen', K.CKPT_SWITCH === 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING' && JSON.stringify(K.CKPT_VARIANTS) === '["ckpt-off","ckpt-on"]' && [K.CKPT_VARIANTS, K.CKPT_VOLATILE, K.CKPT_SECRET, K.CKPT_BODY_KINDS, K.CKPT_NORMALISED].every(Object.isFrozen));
  // THE CLOSED NORMALISED SET (主开发 r1107): pinned word for word — a name added to it turns this red (it needs 主开发's word)
  ok('the normalised set is CLOSED: exactly the session id and the request id by name, the session masked inside the user id, a cch value masked in the first system block',
    JSON.stringify(K.CKPT_NORMALISED) === JSON.stringify(['header x-claude-code-session-id: by name only (one per process)', 'header x-client-request-id: by name only (one per request)', 'metadata.user_id: the run\'s own session id masked as <session> (the account and the device compared — the device made equal)', 'system[0]: a `cch=<…>` value masked as cch=<masked> (a digest of the request\'s bytes on recent builds, unverified)'])
    && JSON.stringify(K.CKPT_VOLATILE) === '["x-claude-code-session-id","x-client-request-id"]', JSON.stringify(K.CKPT_NORMALISED));
  ok('the made-up device id both homes carry: 64 hex, made up', /^[0-9a-f]{64}$/.test(K.CKPT_DEVICE) && K.CKPT_DEVICE === 'feedface'.repeat(8));
  const sh1 = K.systemHeadOf({ type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1.322.abc; cc_entrypoint=sdk-cli; cch=9f3a1;' }), sh2 = K.systemHeadOf('You are Claude Code.'), sh3 = K.systemHeadOf({ type: 'text', text: 'y'.repeat(400) });
  ok('the first system block is kept as TEXT (a stop can be read), its cch value masked; a string block too; ≤ 300 characters; none ⇒ null',
    sh1 === 'x-anthropic-billing-header: cc_version=2.1.322.abc; cc_entrypoint=sdk-cli; cch=<masked>;' && sh2 === 'You are Claude Code.' && sh3.length === 300 && K.systemHeadOf(null) === null, JSON.stringify([sh1, sh2]));
  // RED CONTROLS (anchored copies of src/ckpt-switch.js through mutantCopies: each copy's require is the original's, so its one
  // import — src/cli-caps.js — is the real one)
  const KSRC = fs.readFileSync(path.join(REPO, 'src/ckpt-switch.js'), 'utf8'), KM = mutantCopies('cli-caps-ckpt', REPO);
  const ck = (label, from, to) => KM.load('src/ckpt-switch.js', anchored(KSRC, from, to, `ckptVerdict: ${label}`), label.replace(/\W+/g, '-')).ckptVerdict;
  const noOnly = ck('no only-with', "          else if (!own(ha, n)) f.push(`${at} header only with the switch: ${n}`);\n", "          else if (!own(ha, n)) { }\n");
  ok('RED CONTROL: the only-with branch emptied ⇒ a header only with the switch reads SAME', noOnly(OFF, run({ files: 1, h2: { headers: { 'x-new': '1' } } })).verdict === 'SAME');
  const noCount = ck('calls by name', "const tally = (L) => { const m = new Map(); for (const c of L.map(String)) m.set(c, (m.get(c) || 0) + 1); return m; };", "const tally = (L) => { const m = new Map(); for (const c of L.map(String)) m.set(c, 1); return m; };");
  ok('RED CONTROL: calls compared by name only ⇒ a call twice instead of once reads SAME', noCount(OFF, run({ files: 1, calls: [...CALLS, 'otel tool_result org=- acct=- email=-'] })).verdict === 'SAME');
  const byPlace = ck('heads by place', "const kindOf = (h) => `${String((h && h.path) || '')} ${h && h.body && h.body.stream ? 'stream' : 'ns'} ${JSON.stringify((h && h.body && h.body.toolNames) || null)}`;", "const kindOf = () => 'all';");
  ok('CONTROL: heads matched by their place alone ⇒ the racing side request reads DIFFERENT (why they are matched by kind)', byPlace(run({ heads: [side(), head(1), head(2), head(3)] }), run({ files: 1, heads: [head(1), head(2), side(), head(3)] })).verdict === 'DIFFERENT');
  const noTurn = ck('no turn check', "  if (off.turnOk !== true || on.turnOk !== true) return", "  if (false) return");
  ok('CONTROL: without the turn check a turn that did not finish reads DIFFERENT — a STOP the switch did not cause', noTurn(OFF, run({ files: 1, n: 1, turnOk: false })).verdict === 'DIFFERENT');
}

// ── ⑩ THE VERSION ORDER IS ONE KEPT COLLATOR (row B-360d's last listed loop hold; 主开发 r3765 / r3779) ──
// measuredVersions sorted the fixture's versions with a compare given its locale and options (its collation set up at every call), and
// the store's caps reader (oatFileCaps) sorts at every call: the roster build asks it twice for every row with a long-lived token, at
// every store change, every GET /api/accounts, the pool engine's 60 s sweep. On the test machine (probe ab3a4f1bd, never lined; the
// stand-in below): one roster build 3.3 ms on the release, 0.8 ms with one collator kept. The ms are stated here, never pinned.
console.log('⑩ the version order: one kept collator (B-360d)');
{
  // THE ORDER LAW, asked through the module's own readers (measuredVersions reads, withMeasured writes): every pair of names in the
  // order the release's compare gave them (both from the same input order, so a tie would show as well)
  const releaseOrder = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const FXV = Object.keys(JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/oat-in-file.json'), 'utf8')).versions || {});
  const names = [...new Set(FXV.flatMap((v) => [v, `${v}-dev.1`, `${v}-dev.2`, `${v}-dev.10`, `${v}-rc.1`, `${v}+build.7`]).concat(['2.1.3', '2.1.30', '2.1.300', '2.1.1000', '2.10.0', '10.0.0']))];
  const recOf = (v) => ({ cliVersion: v, measuredAt: '2026-11-24', variants: {} });
  const mapOf = (vs) => ({ versions: Object.fromEntries(vs.map((v) => [v, recOf(v)])) });
  let pairs = 0; const differ = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    pairs++; const a = names[i], b = names[j];
    const want = [b, a].sort(releaseOrder).join(' < '), got = C.measuredVersions(mapOf([b, a])).join(' < ');
    if (got !== want) differ.push(`${got} (the release: ${want})`);
  }
  const wholeWant = names.slice().reverse().sort(releaseOrder);
  const read = C.measuredVersions(mapOf(names.slice().reverse())), written = Object.keys(C.withMeasured(mapOf(names.slice(1).reverse()), recOf(names[0])).versions);
  ok(`THE ORDER LAW: the fixture's ${FXV.length} versions and their build-suffixed forms (${names.length} names, ${pairs} pairs) in the release's order, pair by pair, and the whole list read (measuredVersions) and written (withMeasured)`,
    FXV.length >= 8 && pairs > 1000 && differ.length === 0 && JSON.stringify(read) === JSON.stringify(wholeWant) && JSON.stringify(written) === JSON.stringify(wholeWant), differ.slice(0, 5).join(' · ') || JSON.stringify({ read, written }).slice(0, 300));
  // THE LOOP-HOLD PIN, BY COUNT: the REAL account manager over the measure's stand-in roster (40 Claude subscription accounts, each
  // with a long-lived token, 4 pools of 10), the hub's CLI noted as the fixture's newest version: one roster build asks the caps for
  // every token row and makes NO compare given options. RED: the release's line in a copy of src/cli-caps.js, read by a copy of
  // src/accounts.js (each copy's other requires are the originals') — the same build makes seven a caps call.
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  require(path.join(REPO, 'scripts/lib/accounts-landed.cjs')).waitEverySave(AccountManager);   // B-574d (line 832 on the 2.369.418 train): accounts.json is the store writer's — the roster build's second store reads the pools the first one made: each save waited for here (the suite's thread)
  const NEWEST = C.measuredVersions(JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/oat-in-file.json'), 'utf8'))).slice(-1)[0];
  const SHAPE = { scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' };
  const roster = path.join(tmp, 'roster');
  {
    const am = new AccountManager({ dataDir: roster }), now = Date.now(), ids = [];
    for (let i = 0; i < 40; i++) {
      const id = am.createSubscription({ name: `Stand-in ${i + 1}` }).id; ids.push(id);
      fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'acc-' + i, refreshToken: 'ref-' + i, expiresAt: now + 3600e3, refreshTokenExpiresAt: now + 20 * 86400e3, ...SHAPE } }), { mode: 0o600 });
    }
    am.noteCliVersion(NEWEST); await am.oatFileSettled();
    for (const [i, id] of ids.entries()) { am.setOat(id, ['sk', '-ant-oat01-'].join('') + 'CAPSfake_' + crypto.createHash('sha256').update('stand-in ' + i).digest('hex').slice(0, 48) + '-zz'); await am.oatFileSettled(id); }
    for (let p = 0; p < 4; p++) am.createPool({ name: `Pool ${p + 1}`, members: ids.slice(p * 10, (p + 1) * 10) });
    await am.oatFileSettled();
  }
  const buildOf = async (AM) => {
    const am = new AM({ dataDir: roster }); am.noteCliVersion(NEWEST); await am.oatFileSettled();
    let withOptions = 0, caps = 0, rows = [];
    const lc = String.prototype.localeCompare, fc = am.oatFileCaps;
    String.prototype.localeCompare = function (...a) { if (a.length > 2 && a[2] != null) withOptions++; return lc.apply(this, a); };
    am.oatFileCaps = function (...a) { caps++; return fc.apply(this, a); };
    try { rows = am.list().accounts || []; } finally { String.prototype.localeCompare = lc; delete am.oatFileCaps; }
    return { rows: rows.length, tokenRows: rows.filter((r) => r && r.oatCli).length, caps, withOptions, measured: am.oatFileCaps().measured };
  };
  const now = await buildOf(AccountManager);
  ok(`THE LOOP-HOLD PIN (a count): one roster build of ${now.rows} rows (${now.tokenRows} with a long-lived token) asks the caps ${now.caps} times and makes ${now.withOptions} compares given options`,
    now.rows === 44 && now.tokenRows === 40 && now.caps >= 80 && now.withOptions === 0 && now.measured === FXV.slice().sort(releaseOrder).join(', '), JSON.stringify(now));
  const SRC10 = fs.readFileSync(CAPS, 'utf8'), ACC10 = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8'), RM = mutantCopies('cli-caps-order', REPO);
  const relCaps = RM.write('src/cli-caps.js', anchored(SRC10, "const VERSION_ORDER = new Intl.Collator('en', { numeric: true });\nconst byVersion = (a, b) => VERSION_ORDER.compare(a, b);", "const byVersion = (a, b) => a.localeCompare(b, 'en', { numeric: true });", 'the version order: the release\'s line'), 'release-order');   // stale-pins: kept — the RED's text is the release's line, gone from the product on purpose
  const REL = RM.load('src/accounts.js', anchored(ACC10, "const cliCaps = require('./cli-caps.js');", `const cliCaps = require(${JSON.stringify(relCaps)});`, 'the account store reads the release-order copy'), 'release-order');
  const red = await buildOf(REL.AccountManager);
  ok(`RED CONTROL: the release's line in a copy — the same roster build makes ${red.withOptions} compares given options (${red.caps} caps calls), the same caps said`,
    red.rows === 44 && red.tokenRows === 40 && red.caps >= 80 && red.withOptions >= 7 * red.caps && red.measured === now.measured, JSON.stringify(red));
}

console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
