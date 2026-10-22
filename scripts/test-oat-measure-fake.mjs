#!/usr/bin/env node
// test-oat-measure-fake (heavy, binary: strace; lane pool-oat-measure, design q-035): the oat
// variants of scripts/measure-claude-cred-read.mjs, run end to end WITHOUT the real CLI —
// --no-netns over scripts/fixtures/oat-measure/fake-claude.mjs (no sudo, no namespace, no
// vendor: the fake talks only to the loopback mock) — so the verdicts the namespace rung
// writes into scripts/fixtures/oat-in-file.json are themselves gated:
//   good        six PASS; the fixture's shape; oatInFile reads it true for 9.9.9 only; the
//               evidence (the oat as a Bearer label, the file's bytes + inode kept); no token
//               bytes in the record or the fixture; nothing left loopback
//   add         (lane oat-in-file-2-1-306) over a copy of the committed fixture: 9.9.9 is ADDED, the
//               2.1.296 + 2.1.306 records kept byte-for-byte; a file that is no fixture is REFUSED
//               before the run and left as it was
//   rewrite401  RED CONTROL: blanks the file on a 401 ⇒ oat-file-401 FAIL, the tmp + rename named
//   stale       RED CONTROL: never re-reads its creds ⇒ oat-file-switch FAIL (msg2 still A)
// THE MOCK OUTLIVES ITS CLIENTS (lane pool-oat-measure-fix: 主开发's real-CLI rung on 2.1.296 died on
// `read ECONNRESET` — a CONNECT socket the CLI reset, no 'error' listener on it):
//   reset / tls-hello / keepalive-drop / connect-reset / connect-rst-early   one misbehaviour each, then
//               `good`: the run ends 0, oat-file still PASS, the event in its evidence + on its verdict line
//   census      every error path of the measurement named once (a new spawn / listener moves a count)
//   RED CONTROL: a copy with the handlers stubbed ⇒ connect-reset kills the run (the crash, reproduced)
//   belt        a copy with only the process-level handlers kept ⇒ it survives, the event named uncaught
// Heavy only because the measurement runs strace (THE TIER RULE); the reader's own table is
// test-cli-caps (fast). No strace on the machine ⇒ SKIP with the reason.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const C = require(path.join(REPO, 'src/cli-caps.js'));
const SCRIPT = path.join(REPO, 'scripts/measure-claude-cred-read.mjs');
const SIX = [...C.OAT_VARIANTS];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-fake-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
let haveStrace = true;
try { execFileSync('sh', ['-c', 'command -v strace'], { stdio: 'ignore' }); } catch { haveStrace = false; }
const FAKE = path.join(REPO, 'scripts/fixtures/oat-measure/fake-claude.mjs');
const wrap = (mode) => { const f = path.join(tmp, `claude-${mode}`); fs.writeFileSync(f, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' ${mode} "$@"\n`, { mode: 0o755 }); return f; };
const measure = (args, script = SCRIPT) => spawnSync(process.execPath, [script, '--no-netns', '--gap', '50', '--flush-ms', '50', '--near-ms', '1500', ...args], { encoding: 'utf8', timeout: 120e3, env: { ...process.env } });
console.log('the oat variants over a FAKE claude (--no-netns)');
if (!haveStrace) {
  skip++;
  console.log('  SKIP the fake-claude runs: no strace on this machine (the measurement refuses without it)');
} else {
  const fxFile = path.join(tmp, 'fx.json'), rec = path.join(tmp, 'rec.json');
  const r = measure(['--claude', wrap('good'), '--variant', 'oat', '--write-fixture', '--fixture', fxFile, '--out', rec]);
  let F = null, R = null;
  try { F = JSON.parse(fs.readFileSync(fxFile, 'utf8')); R = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch { }
  ok('the good fake: the run ends 0 and writes the fixture + the record', r.status === 0 && !!F && !!R, `exit ${r.status}: ${String(r.stderr).slice(-600)}`);
  if (F && R) {
    const G = F.versions?.['9.9.9'] || {};
    ok('the fixture has the shape {versions: {"9.9.9": {cliVersion, measuredAt, variants: {name: {verdict, note}}}}}', JSON.stringify(Object.keys(F.versions || {})) === '["9.9.9"]' && G.cliVersion === '9.9.9' && /^\d{4}-\d\d-\d\d$/.test(G.measuredAt) && SIX.every((n) => G.variants?.[n] && typeof G.variants[n].note === 'string'), JSON.stringify(F).slice(0, 300));
    ok('the good fake: all six PASS', SIX.every((n) => G.variants?.[n]?.verdict === 'PASS'), SIX.map((n) => `${n}:${G.variants?.[n]?.verdict} ${G.variants?.[n]?.note}`).join(' | ').slice(0, 900));
    ok('oatInFile reads the written fixture: true for 9.9.9, false for 2.1.296', C.oatInFile('9.9.9', F) === true && C.oatInFile('2.1.296', F) === false);
    const of = R.results.find((x) => x.variant === 'oat-file');
    ok('oat-file evidence: the oat went as a Bearer (as its label) on every request; the file kept its bytes and inode', !!of && of.heads.length > 0 && of.heads.every((h) => h.headers.authorization === 'Bearer <O oat>') && of.files.before.O.sha === of.files.after.O.sha && of.files.before.O.ino === of.files.after.O.ino && of.credOps.credWrites === 0, JSON.stringify(of && { heads: of.heads.map((h) => h.headers.authorization), files: of.files, ops: of.credOps }).slice(0, 500));
    ok('the fixture and the record carry no token bytes (labels only)', !/FAKE-O-[0-9a-f]{8}/.test(JSON.stringify(R) + JSON.stringify(F)) && !/oat01-FAKE/.test(JSON.stringify(R) + JSON.stringify(F)));
    ok('nothing left loopback (no proxy escape, no outbound connect, no abort)', R.escapes.length === 0 && !R.aborted && R.results.every((x) => x.outboundConnects.length === 0), JSON.stringify({ escapes: R.escapes, aborted: R.aborted }));
  }
  // ── add, never drop (lane oat-in-file-2-1-306): the run over a COPY of the committed fixture ──
  {
    const COMMITTED = path.join(REPO, 'scripts/fixtures/oat-in-file.json');
    const seeded = path.join(tmp, 'fx-seeded.json'); fs.copyFileSync(COMMITTED, seeded);
    const K = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
    const ra = measure(['--claude', wrap('good'), '--variant', 'oat', '--write-fixture', '--fixture', seeded, '--out', path.join(tmp, 'rec-add.json')]);
    let A = null; try { A = JSON.parse(fs.readFileSync(seeded, 'utf8')); } catch { }
    const held = Object.keys(K.versions); // the committed versions, READ (lane cli-2-1-307-records: test-cli-caps ⑥ pins the list; a CLI bump never edits this heavy leg)
    ok(`add: over a copy of the committed fixture the run ADDS 9.9.9 and keeps every record it held, byte-for-byte (${held.join(', ')}), oldest first`, ra.status === 0 && !!A && JSON.stringify(Object.keys(A.versions || {})) === JSON.stringify([...Object.keys(K.versions), '9.9.9']) && Object.keys(K.versions).every((k) => JSON.stringify(A.versions[k]) === JSON.stringify(K.versions[k])) && held.length >= 2 && String(ra.stderr).includes('it holds ' + [...held, '9.9.9'].join(', ')), `exit ${ra.status}: ${A ? Object.keys(A.versions || {}).join(',') : 'unread'} ${String(ra.stderr).slice(-300)}`);
    ok(`…and oatInFile reads them all: every committed version (${held.join(', ')}) still true, 9.9.9 true, an unmeasured 2.1.300 false`, !!A && held.every((k) => C.oatInFile(k, A)) && C.oatInFile('9.9.9', A) && !C.oatInFile('2.1.300', A));
    const junk = path.join(tmp, 'fx-junk.json'); fs.writeFileSync(junk, '{"versions": [');
    const rj = measure(['--claude', wrap('good'), '--variant', 'oat', '--write-fixture', '--fixture', junk, '--out', path.join(tmp, 'rec-junk.json')]);
    ok('a --fixture that does not read as a fixture is REFUSED before the run (exit 2, no variant ran) and left as it was — never rewritten to this run\'s record alone', rj.status === 2 && /REFUSED: --write-fixture adds this CLI's record/.test(rj.stderr) && !/\[measure\] oat-file …/.test(rj.stderr) && fs.readFileSync(junk, 'utf8') === '{"versions": [' && !fs.existsSync(path.join(tmp, 'rec-junk.json')), `exit ${rj.status}: ${String(rj.stderr).slice(-300)}`);
  }
  const r401 = measure(['--claude', wrap('rewrite401'), '--variant', 'oat-file-401', '--out', path.join(tmp, 'r401.json')]);
  let X = null; try { X = JSON.parse(fs.readFileSync(path.join(tmp, 'r401.json'), 'utf8')).results[0]; } catch { }
  ok('RED CONTROL: a fake that blanks the file on a 401 ⇒ oat-file-401 FAIL, the writes named', r401.status === 0 && X?.verdict === 'FAIL' && /FILE CHANGED/.test(X.note) && X.credOps.credWrites > 0 && X.credOps.writes.some((w) => /rename\(/.test(w)), `exit ${r401.status} ${JSON.stringify(X && { v: X.verdict, note: X.note, ops: X.credOps }).slice(0, 500)}`);
  const rs = measure(['--claude', wrap('stale'), '--variant', 'oat-file-switch', '--out', path.join(tmp, 'rs.json')]);
  let Y = null; try { Y = JSON.parse(fs.readFileSync(path.join(tmp, 'rs.json'), 'utf8')).results[0]; } catch { }
  ok('RED CONTROL: a fake that never re-reads its creds ⇒ oat-file-switch FAIL (msg2 still A)', rs.status === 0 && Y?.verdict === 'FAIL' && /link→O ⇒ msg2 A:200/.test(Y.note), `exit ${rs.status} ${JSON.stringify(Y && { v: Y.verdict, note: Y.note }).slice(0, 400)}`);

  // ── the mock outlives its clients: each misbehaviour once, then the fake behaves ──
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const noBytes = (o) => !/FAKE-O-[0-9a-f]{8}|oat01-FAKE/.test(JSON.stringify(o));
  const CONNECT_SEEN = (Z) => Z.escapes.some((x) => /^CONNECT api\.anthropic\.com:443/.test(x));
  const MIS = [
    ['reset', 'clientError ECONNRESET (a request head + half its body, then RST)', (ev) => ev.some((x) => x.where === 'clientError' && x.code === 'ECONNRESET')],
    ['tls-hello', 'clientError tls-hello-on-plain-port', (ev) => ev.some((x) => x.where === 'clientError' && x.code === 'tls-hello-on-plain-port')],
    ['keepalive-drop', 'clientError ECONNRESET on the idle keep-alive socket', (ev) => ev.some((x) => x.where === 'clientError' && x.code === 'ECONNRESET')],
    ['connect-reset', 'CONNECT socket read ECONNRESET, the 2.1.296 crash', (ev, Z) => CONNECT_SEEN(Z) && ev.some((x) => x.where === 'CONNECT socket' && x.code === 'ECONNRESET' && /^read /.test(x.what))],
    ['connect-rst-early', 'CONNECT socket write ECONNRESET / EPIPE', (ev, Z) => CONNECT_SEEN(Z) && ev.some((x) => x.where === 'CONNECT socket' && /^(ECONNRESET|EPIPE)$/.test(x.code))],
  ];
  for (const [mode, words, seen] of MIS) {
    const out = path.join(tmp, `mis-${mode}.json`);
    const rm = measure(['--claude', wrap(mode), '--variant', 'oat-file', '--out', out]);
    const Z = read(out), of = Z?.results?.[0];
    ok(`misbehaviour ${mode}: the run ends 0, oat-file still PASS, ${words} in its events + on its verdict line`, rm.status === 0 && of?.verdict === 'PASS' && seen(of.events, Z) && / events? survived \(/.test(of.note) && Z.events.length >= of.events.length && noBytes(Z), `exit ${rm.status}: ${JSON.stringify(of && { v: of.verdict, note: of.note, events: of.events }).slice(0, 600)} ${String(rm.stderr).slice(-400)}`);
  }

  // ── the census: every error path of the measurement, named once ──
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const CENSUS = ["server.on('clientError'", "server.on('connection', (s) => s.on('error'", "server.on('error'", "req.on('error'", "res.on('error'", ".catch((e) => event('sse'", "catch (e) { event('route'", "child.stdin.on('error'", "child.stdout.on('error'", "child.stderr.on('error'", "child.on('error'", "process.on('uncaughtException'", "process.on('unhandledRejection'", "r.on('error', (e) => { console.error(`REFUSED: sudo did not start", 'await main().catch('];
  const count = (re) => (src.match(re) || []).length;
  const missing = CENSUS.filter((n) => src.split(n).length !== 2);
  ok("the census: each error path named once; 9 .on('error') listeners for 2 spawn() + 1 createServer() (a new one moves a count)", missing.length === 0 && count(/\.on\('error', /g) === 9 && count(/\bspawn\(/g) === 2 && count(/createServer\(/g) === 1, `missing ${JSON.stringify(missing)}; .on('error') ${count(/\.on\('error', /g)}, spawn( ${count(/\bspawn\(/g)}, createServer( ${count(/createServer\(/g)}`);

  // a patched copy beside a link to src/ (the script requires ../src/cli-caps.js); swaps must all land
  const copy = (tag, swaps) => {
    const d = path.join(tmp, tag), f = path.join(d, 'scripts', 'measure.mjs');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.symlinkSync(path.join(REPO, 'src'), path.join(d, 'src'));
    let t = src, n = 0;
    for (const [re, to] of swaps) t = t.replace(re, (...m) => { n++; return to.replace('$1', m[1] ?? ''); });
    fs.writeFileSync(f, t); return { f, n };
  };
  const SOCKET_STUBS = [[/\.on\('error', /g, ".on('error-stubbed', "], [/server\.on\('clientError'/g, "server.on('clientError-stubbed'"]];
  const PROCESS_STUBS = [[/process\.on\('(uncaughtException|unhandledRejection)'/g, "process.on('$1-stubbed'"]];
  const scratchOf = (r) => { try { fs.rmSync(path.join('/tmp', `vs-hotsw-${r.pid}`), { recursive: true, force: true }); } catch { } }; // a run that dies leaves its scratch HOME
  const dead = copy('ctl-dead', [...SOCKET_STUBS, ...PROCESS_STUBS]);
  const rd = measure(['--claude', wrap('connect-reset'), '--variant', 'oat-file', '--out', path.join(tmp, 'ctl-dead.json')], dead.f);
  scratchOf(rd);
  ok("RED CONTROL: the handlers stubbed out (all 12) ⇒ connect-reset kills the run — Unhandled 'error' event, read ECONNRESET, no record", dead.n === 12 && rd.status !== 0 && /Unhandled 'error' event/.test(rd.stderr) && /read ECONNRESET/.test(rd.stderr) && !fs.existsSync(path.join(tmp, 'ctl-dead.json')), `swaps ${dead.n}, exit ${rd.status}: ${String(rd.stderr).slice(-500)}`);
  const belt = copy('ctl-belt', SOCKET_STUBS);
  const rb = measure(['--claude', wrap('connect-reset'), '--variant', 'oat-file', '--out', path.join(tmp, 'ctl-belt.json')], belt.f);
  const B = read(path.join(tmp, 'ctl-belt.json')), bf = B?.results?.[0];
  ok('the belt: only the process-level handlers kept ⇒ the run survives, the reset recorded as process uncaughtException ECONNRESET', belt.n === 10 && rb.status === 0 && bf?.verdict === 'PASS' && bf.events.some((x) => x.where === 'process uncaughtException' && x.code === 'ECONNRESET'), `swaps ${belt.n}, exit ${rb.status}: ${JSON.stringify(bf && { v: bf.verdict, events: bf.events }).slice(0, 400)} ${String(rb.stderr).slice(-300)}`);
}

console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
