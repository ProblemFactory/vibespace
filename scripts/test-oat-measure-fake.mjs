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
// r2 (lane cli-self-measure, acceptance r1) on the REAL tracer: D the --version read traced (one launcher); F a UDP send with no
// connect to another loopback port and a unix-socket connect ABORT (the mock's port and nothing else); E any open under the hub's
// data dir VOIDS (deny by default); C a setsid grandchild is gone after a PASS, and a SIGTERM / the run's own deadline leave no
// process and no run dir (every pid this suite signals is proven the fake's by comm + argv).
// Round 3 (acceptance r2): a threaded canary read VOIDS (split lines joined); the --version run is fenced; /proc of an unrelated
// process VOIDS and that process survives; the measurement child SIGKILLed leaves nothing (the kernel's pdeathsig + EXITKILL chain).
// THE CHECKPOINT SWITCH (row B-437e, the files tier, U0 — 主开发 r1080 (A)): `--variant ckpt` over the fake's ckpt modes — the SAME
// turn (Read then Edit of a scratch note) without and with the switch: `ckpt` ⇒ SAME (PASS; one checkpoint file with it, none
// without; the fixture says SAME for 9.9.9 only; no token bytes anywhere); RED CONTROLS: `ckpt-header` (one header more with the
// switch) ⇒ DIFFERENT, STOP, the header named; `ckpt-always` (a backup without it) ⇒ ALREADY-ON; --write-ckpt-fixture without
// both variants is REFUSED. The REAL CLI's run of this pair is the integrator's (ordered by 主开发), never a lane's.
// Heavy only because the measurement runs strace (THE TIER RULE); the reader's own table is
// test-cli-caps (fast). No strace on the machine ⇒ SKIP with the reason.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
// THE READABLE LOG (acceptance r3: «write the legs so that a reader of the log alone can judge them»): ci.mjs keeps no output of a
// passing suite, so with VS_OAT_FAKE_LOG=<file> this suite also appends every line it prints to that file (one line per case)
if (process.env.VS_OAT_FAKE_LOG) { const tee = fs.openSync(process.env.VS_OAT_FAKE_LOG, 'a'); for (const k of ['log', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { o(...a); try { fs.writeSync(tee, a.join(' ') + '\n'); } catch { } }; } }
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const C = require(path.join(REPO, 'src/cli-caps.js'));
const K = require(path.join(REPO, 'src/ckpt-switch.js')); // row B-437e U0: the checkpoint switch's verdict + its per-version reader
const SCRIPT = path.join(REPO, 'scripts/measure-claude-cred-read.mjs');
const PROBE = path.join(REPO, 'src/claude-oat-probe.js'); // lane cli-self-measure: the measurement's ONE implementation (the script and the hub call it)
const P = require(PROBE); // its pure exports (OPEN_CALLS …) for the round-4 legs
const SIX = [...C.OAT_VARIANTS];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-fake-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
let haveStrace = true;
try { execFileSync('sh', ['-c', 'command -v strace'], { stdio: 'ignore' }); } catch { haveStrace = false; }
// the fake runs from a COPY in this suite's scratch (node builtins only): the file fence denies the person's REAL home by default (law
// E), so a checkout under the home — the Actions runner's /home/runner/work — would void every fake run on its own script
const FAKE_SRC = path.join(REPO, 'scripts/fixtures/oat-measure/fake-claude.mjs');
const FAKE = path.join(tmp, 'fake-claude.mjs'); fs.copyFileSync(FAKE_SRC, FAKE);
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
    ok('the fixture has the shape {versions: {"9.9.9": {cliVersion, measuredAt, variants: {name: {verdict, note}}}}}', JSON.stringify(Object.keys(F.versions || {})) === '["9.9.9"]' && G.cliVersion === '9.9.9' && gateOf(/^\d{4}-\d\d-\d\d$/.test(G.measuredAt)) && verdictOf(SIX.every((n) => G.variants?.[n] && typeof G.variants[n].note === 'string')), JSON.stringify(F).slice(0, 300));
    ok('the good fake: all six PASS', verdictOf(SIX.every((n) => G.variants?.[n]?.verdict === 'PASS')), SIX.map((n) => `${n}:${G.variants?.[n]?.verdict} ${G.variants?.[n]?.note}`).join(' | ').slice(0, 900));
    ok('oatInFile reads the written fixture: true for 9.9.9, false for 2.1.296', C.oatInFile('9.9.9', F) === true && C.oatInFile('2.1.296', F) === false);
    const of = R.results.find((x) => x.variant === 'oat-file');
    ok('oat-file evidence: the oat went as a Bearer (as its label) on every request; the file kept its bytes and inode', !!of && of.heads.length > 0 && gateOf(of.heads.every((h) => h.headers.authorization === 'Bearer <O oat>')) && of.files.before.O.sha === of.files.after.O.sha && of.files.before.O.ino === of.files.after.O.ino && of.credOps.credWrites === 0, JSON.stringify(of && { heads: of.heads.map((h) => h.headers.authorization), files: of.files, ops: of.credOps }).slice(0, 500));
    ok('the fixture and the record carry no token bytes (labels only)', !/FAKE-O-[0-9a-f]{8}/.test(JSON.stringify(R) + JSON.stringify(F)) && !/oat01-FAKE/.test(JSON.stringify(R) + JSON.stringify(F)));
    ok('nothing left loopback (no proxy escape, no outbound connect, no abort)', R.escapes.length === 0 && !R.aborted && verdictOf(R.results.every((x) => x.outboundConnects.length === 0)), JSON.stringify({ escapes: R.escapes, aborted: R.aborted }));
  }
  // ── add, never drop (lane oat-in-file-2-1-306): the run over a COPY of the committed fixture ──
  {
    const COMMITTED = path.join(REPO, 'scripts/fixtures/oat-in-file.json');
    const seeded = path.join(tmp, 'fx-seeded.json'); fs.copyFileSync(COMMITTED, seeded);
    const K = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
    const ra = measure(['--claude', wrap('good'), '--variant', 'oat', '--write-fixture', '--fixture', seeded, '--out', path.join(tmp, 'rec-add.json')]);
    let A = null; try { A = JSON.parse(fs.readFileSync(seeded, 'utf8')); } catch { }
    const held = Object.keys(K.versions); // the committed versions, READ (lane cli-2-1-307-records: test-cli-caps ⑥ pins the list; a CLI bump never edits this heavy leg)
    ok(`add: over a copy of the committed fixture the run ADDS 9.9.9 and keeps every record it held, byte-for-byte (${held.join(', ')}), oldest first`, ra.status === 0 && !!A && JSON.stringify(Object.keys(A.versions || {})) === JSON.stringify([...Object.keys(K.versions), '9.9.9']) && gateOf(Object.keys(K.versions).every((k) => JSON.stringify(A.versions[k]) === JSON.stringify(K.versions[k]))) && held.length >= 2 && verdictOf(String(ra.stderr).includes('it holds ' + [...held, '9.9.9'].join(', '))), `exit ${ra.status}: ${A ? Object.keys(A.versions || {}).join(',') : 'unread'} ${String(ra.stderr).slice(-300)}`);
    ok(`…and oatInFile reads them all: every committed version (${held.join(', ')}) still true, 9.9.9 true, an unmeasured 2.1.300 false`, !!A && gateOf(held.every((k) => C.oatInFile(k, A))) && gateOf(C.oatInFile('9.9.9', A)) && !C.oatInFile('2.1.300', A));
    const junk = path.join(tmp, 'fx-junk.json'); fs.writeFileSync(junk, '{"versions": [');
    const rj = measure(['--claude', wrap('good'), '--variant', 'oat', '--write-fixture', '--fixture', junk, '--out', path.join(tmp, 'rec-junk.json')]);
    ok('a --fixture that does not read as a fixture is REFUSED before the run (exit 2, no variant ran) and left as it was — never rewritten to this run\'s record alone', rj.status === 2 && gateOf(/REFUSED: --write-fixture adds this CLI's record/.test(rj.stderr)) && !/\[measure\] oat-file …/.test(rj.stderr) && fs.readFileSync(junk, 'utf8') === '{"versions": [' && !fs.existsSync(path.join(tmp, 'rec-junk.json')), `exit ${rj.status}: ${String(rj.stderr).slice(-300)}`);
  }
  const r401 = measure(['--claude', wrap('rewrite401'), '--variant', 'oat-file-401', '--out', path.join(tmp, 'r401.json')]);
  let X = null; try { X = JSON.parse(fs.readFileSync(path.join(tmp, 'r401.json'), 'utf8')).results[0]; } catch { }
  ok('RED CONTROL: a fake that blanks the file on a 401 ⇒ oat-file-401 FAIL, the writes named', r401.status === 0 && X?.verdict === 'FAIL' && gateOf(/FILE CHANGED/.test(X.note)) && X.credOps.credWrites > 0 && verdictOf(X.credOps.writes.some((w) => /rename\(/.test(w))), `exit ${r401.status} ${JSON.stringify(X && { v: X.verdict, note: X.note, ops: X.credOps }).slice(0, 500)}`);
  const rs = measure(['--claude', wrap('stale'), '--variant', 'oat-file-switch', '--out', path.join(tmp, 'rs.json')]);
  let Y = null; try { Y = JSON.parse(fs.readFileSync(path.join(tmp, 'rs.json'), 'utf8')).results[0]; } catch { }
  ok('RED CONTROL: a fake that never re-reads its creds ⇒ oat-file-switch FAIL (msg2 still A)', rs.status === 0 && Y?.verdict === 'FAIL' && verdictOf(/link→O ⇒ msg2 A:200/.test(Y.note)), `exit ${rs.status} ${JSON.stringify(Y && { v: Y.verdict, note: Y.note }).slice(0, 400)}`);

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
    ok(`misbehaviour ${mode}: the run ends 0, oat-file still PASS, ${words} in its events + on its verdict line`, rm.status === 0 && of?.verdict === 'PASS' && gateOf(seen(of.events, Z)) && gateOf(/ events? survived \(/.test(of.note)) && Z.events.length >= of.events.length && verdictOf(noBytes(Z)), `exit ${rm.status}: ${JSON.stringify(of && { v: of.verdict, note: of.note, events: of.events }).slice(0, 600)} ${String(rm.stderr).slice(-400)}`);
  }

  // ── the census: every error path of the measurement, named once ──
  const src = fs.readFileSync(PROBE, 'utf8'); // the error paths live in the module now (lane cli-self-measure)
  const CENSUS = ["server.on('clientError'", "server.on('connection', (s) => s.on('error'", "server.on('error'", "req.on('error'", "res.on('error'", ".catch((e) => event('sse'", "catch (e) { event('route'", "child.stdin.on('error'", "child.stdout.on('error'", "child.stderr.on('error'", "child.on('error', (e) => console.warn(`[oat-probe] the probe's tracer could not be started", "child.on('error', (e) => { event('cli process'", "vc.on('error'", "mc.stdin.on('error'", "mc.stdout.on('error'", "mc.on('error'", "process.on('uncaughtException'", "process.on('unhandledRejection'", "r.on('error', (e) => { console.error(`REFUSED: sudo did not start", 'await main().catch('];
  const count = (re) => (src.match(re) || []).length;
  const SCRIPT_SRC = fs.readFileSync(SCRIPT, 'utf8'); // the sudo spawn + main's catch stay in the script (lane cli-self-measure)
  const inScript = (n) => /REFUSED: sudo did not start|await main\(\)\.catch\(/.test(n);
  const missing = CENSUS.filter((n) => (inScript(n) ? SCRIPT_SRC : src).split(n).length !== 2);
  ok("the census: each error path named once; 15 .on('error') listeners for 1 spawn() (THE ONE LAUNCHER: every variant and the --version read, law D — the version run's own process listener is the 11th; + the mint variant's three on its own launch, lane oat-add-door; + the launcher's own tracer start failure, 0c2513b59 ckpt61 cure 2 — its two child listeners named apart) + 1 createServer() + the canary socket (lane cli-self-measure: the sudo spawn stays in the script) (a new one moves a count)", missing.length === 0 && count(/\.on\('error', /g) === 15 && count(/\bspawn\(/g) === 1 && count(/createServer\(/g) === 1, `missing ${JSON.stringify(missing)}; .on('error') ${count(/\.on\('error', /g)}, spawn( ${count(/\bspawn\(/g)}, createServer( ${count(/createServer\(/g)}`);

  // a PATCHED MODULE beside the real script (lane cli-self-measure: the measurement lives in src/claude-oat-probe.js; the
  // script requires ../src/cli-caps.js + ../src/ckpt-switch.js + ../src/claude-oat-probe.js, the module ./cli-caps.js + ./ckpt-switch.js); swaps must all land
  const copy = (tag, swaps) => {
    const d = path.join(tmp, tag), f = path.join(d, 'scripts', 'measure.mjs');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.mkdirSync(path.join(d, 'src'));
    fs.copyFileSync(SCRIPT, f); fs.symlinkSync(path.join(REPO, 'src', 'cli-caps.js'), path.join(d, 'src', 'cli-caps.js'));
    fs.symlinkSync(path.join(REPO, 'src', 'ckpt-switch.js'), path.join(d, 'src', 'ckpt-switch.js')); // row B-437e U0: the script and the module both require it
    fs.symlinkSync(path.join(REPO, 'src', 'claude-oat-trampoline.js'), path.join(d, 'src', 'claude-oat-trampoline.js')); // the module's trampoline beside it (r4)
    let t = src, n = 0;
    for (const [re, to] of swaps) t = t.replace(re, (...m) => { n++; return to.replace('$1', m[1] ?? ''); });
    fs.writeFileSync(path.join(d, 'src', 'claude-oat-probe.js'), t); return { f, n };
  };
  const SOCKET_STUBS = [[/\.on\('error', /g, ".on('error-stubbed', "], [/server\.on\('clientError'/g, "server.on('clientError-stubbed'"]];
  const PROCESS_STUBS = [[/process\.on\('(uncaughtException|unhandledRejection)'/g, "process.on('$1-stubbed'"]];
  const scratchOf = (r) => { try { fs.rmSync(path.join('/tmp', `vs-hotsw-${r.pid}`), { recursive: true, force: true }); } catch { } }; // a run that dies leaves its scratch HOME
  const dead = copy('ctl-dead', [...SOCKET_STUBS, ...PROCESS_STUBS]);
  const rd = measure(['--claude', wrap('connect-reset'), '--variant', 'oat-file', '--out', path.join(tmp, 'ctl-dead.json')], dead.f);
  scratchOf(rd);
  ok("RED CONTROL: the handlers stubbed out (all 18 — + the mint's three, lane oat-add-door; + the tracer's start failure, 0c2513b59) ⇒ connect-reset kills the run — Unhandled 'error' event, read ECONNRESET, no record", dead.n === 18 && rd.status !== 0 && gateOf(/Unhandled 'error' event/.test(rd.stderr)) && gateOf(/read ECONNRESET/.test(rd.stderr)) && !fs.existsSync(path.join(tmp, 'ctl-dead.json')), `swaps ${dead.n}, exit ${rd.status}: ${String(rd.stderr).slice(-500)}`);
  const belt = copy('ctl-belt', SOCKET_STUBS);
  const rb = measure(['--claude', wrap('connect-reset'), '--variant', 'oat-file', '--out', path.join(tmp, 'ctl-belt.json')], belt.f);
  const B = read(path.join(tmp, 'ctl-belt.json')), bf = B?.results?.[0];
  ok('the belt: only the process-level handlers kept ⇒ the run survives, the reset recorded as process uncaughtException ECONNRESET', belt.n === 16 && rb.status === 0 && bf?.verdict === 'PASS' && verdictOf(bf.events.some((x) => x.where === 'process uncaughtException' && x.code === 'ECONNRESET')), `swaps ${belt.n}, exit ${rb.status}: ${JSON.stringify(bf && { v: bf.verdict, events: bf.events }).slice(0, 400)} ${String(rb.stderr).slice(-300)}`);
  // ── lane cli-self-measure: THE HUB'S ROAD — src/claude-oat-probe.js's child entry, forked exactly as src/server/cli-self-measure.js
  // forks it (a literal env, one job over IPC) — over the same fake ⇒ the same verdicts (ONE implementation), the gate reported
  // before the record; then law 3's fences, each proven to FIRE on the real strace ──
  const { fork } = require('node:child_process');
  const hubRun = (claude, extra = {}) => new Promise((resolve) => {
    const root = fs.mkdtempSync(path.join(tmp, 'hub-'));
    const c = fork(extra.probe || PROBE, [], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(root, 'home0'), LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const msgs = []; let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('message', (m) => msgs.push(m));
    const cap = setTimeout(() => c.kill('SIGKILL'), 150e3);
    c.on('exit', (code) => { clearTimeout(cap); resolve({ code, msgs, err, root, rec: (msgs.find((m) => m.type === 'record') || {}).record || null }); });
    if (typeof extra.onChild === 'function') extra.onChild(c, root);
    const { onChild, probe, ...job } = extra; void onChild; void probe;
    c.send({ claude, root: path.join(root, 'm'), gapMs: 50, flushMs: 50, nearMs: 1500, ...job });
  });
  const norm = (rec) => Object.fromEntries((rec?.results || []).map((x) => [x.variant, `${x.verdict} ${String(x.note).replace(/\d+/g, '#')}`]));
  const hubH = await hubRun(wrap('good'));
  const iGate = hubH.msgs.findIndex((m) => m.type === 'gate'), iRec = hubH.msgs.findIndex((m) => m.type === 'record');
  const hubg = iGate >= 0 ? hubH.msgs[iGate].gate : null;
  ok('the hub road (the forked child): the gate is reported FIRST, PASS, on the three, keyed by version + the bytes\' sha256', iGate >= 0 && iRec > iGate && hubg.pass === true && hubg.cli === '9.9.9' && gateOf(/^[0-9a-f]{64}$/.test(hubg.sha256 || '')) && JSON.stringify(Object.keys(hubg.gate)) === JSON.stringify(C.OAT_IN_FILE_GATE), JSON.stringify({ code: hubH.code, msgs: hubH.msgs.map((m) => m.type), err: hubH.err.slice(-400) }));
  const sNorm = norm(R), hNorm = norm(hubH.rec);
  ok('PARITY (law 1): the hub road and the script road over the same fake say the same six verdicts and notes (digits masked)', JSON.stringify(sNorm) === JSON.stringify(hNorm) && Object.keys(hNorm).length === 6, JSON.stringify({ sNorm, hNorm }).slice(0, 900));
  ok('…and the hub\'s record names its fences: the canaries answered, the belt, the env allowlist, 0 foreign tokens', gateOf(hubH.rec) && gateOf(hubH.rec.canaries) && gateOf(/nonce/.test(hubH.rec.canaries.mock)) && gateOf(/403/.test(hubH.rec.canaries.proxy)) && hubH.rec.belt === 'strace' && gateOf(Array.isArray(hubH.rec.env)) && hubH.rec.foreignTokens === 0 && !hubH.rec.aborted && !hubH.rec.void, hubH.rec && { canaries: hubH.rec.canaries, foreign: hubH.rec.foreignTokens });
  const hubN = await hubRun(wrap('good'), { strace: path.join(tmp, 'no-such-strace') });
  ok('G6: no strace ⇒ the child refuses BY NAME before any CLI runs (`no-strace`), no record', hubN.msgs.length === 1 && hubN.msgs[0].type === 'refused' && hubN.msgs[0].code === 'no-strace' && !hubN.rec, hubN.msgs);
  const own = (() => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) return a.address; return null; })();
  if (own) {
    const hubE = await hubRun(wrap('escape'), { variants: ['oat-file'] });
    ok(`P3: a connect() to this box's own non-loopback address (${own}:9 — no packet leaves the box) ⇒ the belt ABORTS the run`, !!hubE.rec && gateOf(Array.isArray(hubE.rec.aborted)) && verdictOf(hubE.rec.aborted.some((x) => x.connect === `${own}:9`)), hubE.rec && hubE.rec.aborted);
  } else { skip++; console.log('  SKIP P3: this machine has no non-loopback IPv4 address to aim at'); }
  const hubF = await hubRun(wrap('foreign'), { variants: ['oat-file'] });
  ok('P1: a request carrying a token the run never made ⇒ the run is VOID (foreign-token), never a PASS', !!hubF.rec && hubF.rec.void === 'foreign-token' && hubF.rec.foreignTokens >= 1 && verdictOf(/ · VOID: /.test(hubF.rec.results[0].note)), hubF.rec && { void: hubF.rec.void, note: hubF.rec.results?.[0]?.note });
  const forbidDir = path.join(tmp, 'forbidden'); fs.mkdirSync(forbidDir, { recursive: true }); const ff = path.join(forbidDir, 'creds.json'); fs.writeFileSync(ff, '{}');
  const wf = path.join(tmp, 'claude-forbid'); fs.writeFileSync(wf, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'forbid-read:${ff}' "$@"\n`, { mode: 0o755 });
  const hubG = await hubRun(wf, { variants: ['oat-file'], forbid: [forbidDir] });
  ok('P4: the CLI reading a file inside a forbidden dir (the person\'s ~/.claude, data/subs, the vault) ⇒ the run is VOID (guarded-read)', !!hubG.rec && hubG.rec.void === 'guarded-read' && verdictOf(hubG.rec.results[0].guardedReads.includes(ff)), hubG.rec && { void: hubG.rec.void, reads: hubG.rec.results?.[0]?.guardedReads });

  // ── r2 (acceptance r1) on the REAL tracer: laws D, F, E, C ──
  ok('LAW D: the --version read ran under the tracer like every variant (the ONE launcher) — the record names its traced exec', !!hubH.rec && gateOf(hubH.rec.versionRun) && hubH.rec.versionRun.traced === true && hubH.rec.versionRun.execs >= 1, JSON.stringify(hubH.rec && hubH.rec.versionRun));
  ok('LAW F: the good fake reached the mock\'s port and nothing else — no abort; the netlink count is in the record', !!hubH.rec && gateOf(Number.isInteger(hubH.rec.netlink)) && !hubH.rec.aborted, JSON.stringify(hubH.rec && { netlink: hubH.rec.netlink, aborted: hubH.rec.aborted }));
  const hubU = await hubRun(wrap('udp'), { variants: ['oat-file'] });
  ok('LAW F: a UDP datagram SENT with no connect to 127.0.0.1:9 (loopback — but not the mock\'s port) ⇒ the belt ABORTS the run', !!hubU.rec && gateOf(Array.isArray(hubU.rec.aborted)) && verdictOf(hubU.rec.aborted.some((x) => x.connect === '127.0.0.1:9')), JSON.stringify(hubU.rec && hubU.rec.aborted));
  const sockPath = path.join(tmp, 'no-such-bus.sock');
  const ux = path.join(tmp, 'claude-unix'); fs.writeFileSync(ux, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'unix:${sockPath}' "$@"\n`, { mode: 0o755 });
  const hubX = await hubRun(ux, { variants: ['oat-file'] });
  ok('LAW F: a connect() to a unix socket path (the session bus\'s shape — it need not exist) ⇒ ABORTED: the run reaches the mock\'s port and nothing else, any family', !!hubX.rec && gateOf(Array.isArray(hubX.rec.aborted)) && verdictOf(hubX.rec.aborted.some((x) => /^unix:/.test(x.connect) && x.connect.includes(sockPath))), JSON.stringify(hubX.rec && hubX.rec.aborted));
  // E: an open under the hub's DATA DIR (deny by default — no list names this file) voids the run
  const dataDir = path.join(tmp, 'hub-data'); fs.mkdirSync(path.join(dataDir, 'misc'), { recursive: true }); const df = path.join(dataDir, 'misc', 'anything.json'); fs.writeFileSync(df, '{}');
  const wdDir = path.join(tmp, 'bin-datadir'); fs.mkdirSync(wdDir, { recursive: true }); const wd = path.join(wdDir, 'claude'); fs.writeFileSync(wd, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'forbid-read:${df}' "$@"\n`, { mode: 0o755 });
  const hubD = await hubRun(wd, { variants: ['oat-file'], dataDir });
  ok('LAW E: the CLI opening ANY file under the hub\'s data dir (no list names it — deny by default) ⇒ the run is VOID (guarded-read)', !!hubD.rec && hubD.rec.void === 'guarded-read' && verdictOf(hubD.rec.results[0].guardedReads.includes(df)), JSON.stringify(hubD.rec && { void: hubD.rec.void, reads: hubD.rec.results?.[0]?.guardedReads }));
  const outer = path.join(tmp, 'outer'); const dataIn = path.join(outer, 'data'); fs.mkdirSync(path.join(dataIn, 'misc'), { recursive: true }); const df2 = path.join(dataIn, 'misc', 'anything.json'); fs.writeFileSync(df2, '{}');
  const wo = path.join(outer, 'claude'); fs.writeFileSync(wo, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'forbid-read:${df2}' "$@"\n`, { mode: 0o755 });
  const hubO = await hubRun(wo, { variants: ['oat-file'], dataDir: dataIn });
  ok('LAW E: a claude whose install dir CONTAINS the data dir allows only its own file — the open under the data dir still VOIDS the run', !!hubO.rec && hubO.rec.void === 'guarded-read' && verdictOf(hubO.rec.results[0].guardedReads.includes(df2)), JSON.stringify(hubO.rec && { void: hubO.rec.void, reads: hubO.rec.results?.[0]?.guardedReads }));
  // C: nothing is left behind — a grandchild in its own session after a PASS; the child's SIGTERM; the run's own deadline
  const alive = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return !/\) Z /.test(st); } catch { return false; } };
  const pidIn = (f) => { try { return Number(fs.readFileSync(f, 'utf8')) || 0; } catch { return 0; } };
  const dpf = path.join(tmp, 'daemon.pid'); const wdm = path.join(tmp, 'claude-daemon'); fs.writeFileSync(wdm, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'daemon:${dpf}' "$@"\n`, { mode: 0o755 });
  const hubC = await hubRun(wdm, { variants: ['oat-file'] });
  const dpid = pidIn(dpf);
  const c0 = hubC.rec?.results?.[0];
  ok('LAW C: a grandchild that left the group (its own session, setsid) is GONE when the run ends — the kernel took it with the tracer (EXITKILL) — and since it OUTLIVED the CLI\'s stdin, the tracer had to be killed: the record did not end by itself ⇒ VOID trace-unfinished, never a PASS (acceptance r3 item 1/2)', !!c0 && c0.void === 'trace-unfinished' && c0.verdict !== 'PASS-and-placed' && hubC.rec.void === 'trace-unfinished' && dpid > 0 && !alive(dpid), JSON.stringify({ void: c0 && c0.void, gap: c0 && c0.traceGap, dpid, alive: dpid ? alive(dpid) : null }));
  // never leave it behind — but signal only what is PROVEN the fake's: the pid it wrote, still a `sleep 120` (comm + argv), never a bare pid
  const isOurs = (pid, comm, argWord) => { try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() === comm && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(argWord); } catch { return false; } };
  if (dpid && alive(dpid) && isOurs(dpid, 'sleep', '120')) { try { process.kill(dpid, 'SIGKILL'); } catch { } }
  // ── round 4 (acceptance r3) on the REAL tracer — one line per case: what the fake did, what the record held, the verdict ──
  const fakeWrap4 = (tag, mode) => { const d = path.join(tmp, 'w4-' + tag); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, 'claude'); fs.writeFileSync(f, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' '${mode}' "$@"\n`, { mode: 0o755 }); return f; };
  // the measured BASELINE of a clean run (the good fake, all six variants, above): unfinished halves by name, io_uring setups
  for (const x of (hubH.rec && hubH.rec.results) || []) console.log(`    · baseline ${x.variant}: verdict ${x.verdict}${x.void ? ' VOID ' + x.void : ''} · split calls joined ${x.traceJoined} · cut by a death ${JSON.stringify(x.cutCalls || [])} · io_uring setups ${x.ioUringSetups} (each answered ENOSYS by the tracer)`);
  ok('ROUND 4 BASELINE: a clean run of the six accounts for every call — no gap, no door, none cut that opens — and its io_uring setups were all shut by the tracer (counted above)', !!hubH.rec && hubH.rec.results.length === 6 && verdictOf(hubH.rec.results.every((x) => !x.void && Number.isInteger(x.ioUringSetups) && !(x.cutCalls || []).some((cc) => P.OPEN_CALLS.has(cc)))), JSON.stringify(hubH.rec && hubH.rec.results.map((x) => ({ v: x.variant, void: x.void, gap: x.traceGap, io: x.ioUringSetups, cut: x.cutCalls }))));
  // ITEM 1: the fake reads a canary under the data dir (ONE guarded open), then tries to make the record forget it
  const KINDS = ['truncate', 'append', 'rename', 'delete', 'overwrite'];
  const tamperRun = async (kind, probe) => {
    const dd = path.join(tmp, `data-tamper-${kind}-${probe ? 'r3' : 'r4'}`); fs.mkdirSync(path.join(dd, 'misc'), { recursive: true }); const cn = path.join(dd, 'misc', 'canary.json'); fs.writeFileSync(cn, '{}');
    const hr = await hubRun(fakeWrap4(`tamper-${kind}-${probe ? 'r3' : 'r4'}`, `tamper-${kind}:${cn}`), { variants: ['oat-file'], dataDir: dd, ...(probe ? { probe } : {}) });
    const x = hr.rec && hr.rec.results && hr.rec.results[0];
    return { kind, canary: cn, verdict: x ? x.verdict : '(no record)', void: (hr.rec && hr.rec.void) || null, reads: (x && x.guardedReads) || [], gap: (x && x.traceGap) || null };
  };
  for (const kind of KINDS) {
    const t4 = await tamperRun(kind, null);
    console.log(`    · tamper ${kind}: the fake read ${path.basename(t4.canary)} under the data dir, then ${kind === 'truncate' ? 'truncated' : kind === 'append' ? 'appended forged clean lines to' : kind === 'rename' ? 'renamed a clean file over' : kind === 'delete' ? 'deleted' : 'overwrote in place'} every record it could reach → record: void=${t4.void} reads=${JSON.stringify(t4.reads)} → ${t4.void ? 'VOID' : t4.verdict}`);
    ok(`ITEM 1 (${kind}): the record still names the guarded open — VOID guarded-read`, t4.void === 'guarded-read' && verdictOf(t4.reads.includes(t4.canary)), JSON.stringify(t4));
  }
  // THE RED CONTROL ran ONCE from the lane against the r3 module (the record a file beside the scratch, read back by path — a lane
  // commit, so no script here may read it: test-ci-gate's off-master-sha leg): the RENAME turned the void into a PASS; truncate /
  // delete / overwrite stayed VOID only by accident (trace-unparsed — the canary line erased); the append kept it. Its lines are in the
  // lane's report (acceptance r3, round 4); this suite keeps the five legs above: the build's own writes cannot damage the record (a witness of an honest build — not a sandbox)

  // ── round 5 (acceptance r4, the tidy) on the REAL tracer: the launcher tripwire and a link's source — one line per case ──
  const hubL = await hubRun(fakeWrap4('rewrite-launcher', 'rewrite-launcher'), { variants: ['oat-file', 'oat-file-401'] });
  const ranL = ((hubL.rec && hubL.rec.results) || []).map((x) => x.variant);
  console.log(`    · rewrite-launcher: the fake (in oat-file) appended a line to the launcher copy in the scratch → record: void=${hubL.rec && hubL.rec.void} launcherChanged=${hubL.rec && hubL.rec.launcherChanged} variants run=${JSON.stringify(ranL)}`);
  ok('ROUND 5 PIN 2 (the real tracer): a variant that rewrites the launcher copy ⇒ the NEXT variant never starts — the run VOIDS launcher-changed, named before oat-file-401', !!hubL.rec && hubL.rec.void === 'launcher-changed' && hubL.rec.launcherChanged === 'oat-file-401' && JSON.stringify(ranL) === '["oat-file"]', JSON.stringify(hubL.rec && { void: hubL.rec.void, changed: hubL.rec.launcherChanged, ranL }));
  const dl = path.join(tmp, 'data-link'); fs.mkdirSync(path.join(dl, 'misc'), { recursive: true }); const lsrc = path.join(dl, 'misc', 'other.json'); fs.writeFileSync(lsrc, '{}');
  const hubK = await hubRun(fakeWrap4('link-in', `link-in:${lsrc}`), { variants: ['oat-file'], dataDir: dl });
  const k0 = hubK.rec && hubK.rec.results && hubK.rec.results[0];
  console.log(`    · link-in: the fake hard-linked ${path.basename(lsrc)} (under the data dir) into its HOME and read the new name → record: void=${hubK.rec && hubK.rec.void} reads=${JSON.stringify((k0 && k0.guardedReads) || [])}`);
  ok('ROUND 5 PIN 3 (the real tracer): a hard link of a data-dir file into the scratch, then an open of the new name ⇒ VOID guarded-read naming the SOURCE', !!k0 && hubK.rec.void === 'guarded-read' && verdictOf(k0.guardedReads.includes(lsrc)), JSON.stringify(hubK.rec && { void: hubK.rec.void, reads: k0 && k0.guardedReads }));

  // ── THE INCIDENT OF 2026-11-11 on the REAL tracer — the cell nobody drove: the hub's data dir under a home that is a git checkout
  // (package.json, CLAUDE.md, .claude/, .git). Where 5c77612ef put the run (data/cli-self-measure/run-…) every run voided on the
  // checkout's package.json (node's walk up from the trampoline); where the run lives now (a private folder outside the home and the
  // data dir) the fake that walks up like 2.1.321 (CLAUDE.md, CLAUDE.local.md, AGENTS.md, .claude/, .mcp.json, .git to /) PASSES.
  // `home` ADDS the stand-in home as a deny root (never replaces the real one); the same through a symlinked parent ──
  const HC = fs.mkdtempSync(path.join(tmp, 'home-cell-')), CO = path.join(HC, 'checkout'), DD = path.join(CO, 'data');
  for (const d of [DD, path.join(CO, '.claude'), path.join(CO, '.git')]) fs.mkdirSync(d, { recursive: true });
  for (const [f, t] of [['package.json', '{"name":"stand-in"}'], ['CLAUDE.md', '# stand-in'], ['.claude/settings.json', '{}'], ['.git/HEAD', 'ref: refs/heads/master']]) fs.writeFileSync(path.join(CO, f), t);
  const LINKED = path.join(tmp, 'home-cell-link'); fs.symlinkSync(CO, LINKED);
  const cellRun = (dataDir, root) => hubRun(wrap('walk'), { variants: ['oat-file'], dataDir, home: HC, root });
  const outside = (tag) => path.join(fs.mkdtempSync(path.join(tmp, 'base-')), `cli-self-measure-cell-run-${tag}`, 'm');
  const cells = [
    ['the run where 5c77612ef put it', await cellRun(DD, path.join(DD, 'cli-self-measure', 'run-old', 'm'))],
    ['the run outside the home and the data dir', await cellRun(DD, outside('a'))],
    ['through a symlinked parent, where 5c77612ef put it', await cellRun(path.join(LINKED, 'data'), path.join(LINKED, 'data', 'cli-self-measure', 'run-old', 'm'))],
    ['through a symlinked parent, outside', await cellRun(path.join(LINKED, 'data'), outside('b'))],
  ];
  const cellSaid = (r) => (r.rec ? `void=${r.rec.void || 'none'} · the --version run read ${JSON.stringify((r.rec.versionRun && r.rec.versionRun.guardedReads) || [])} · oat-file ${((r.rec.results || [])[0] || {}).verdict || '(not run)'}` : `no record (${(r.msgs.find((m) => m.type === 'refused') || {}).code || r.code})`);
  for (const [what, r] of cells) console.log(`    · incident cell — ${what}: ${cellSaid(r)}`);
  const pkg = path.join(CO, 'package.json');
  const voidOn = (r) => !!r.rec && r.rec.void === 'guarded-read' && ((r.rec.versionRun && r.rec.versionRun.guardedReads) || []).includes(pkg);
  const passes = (r) => !!r.rec && !r.rec.void && ((r.rec.results || [])[0] || {}).verdict === 'PASS';
  ok('INCIDENT (the real tracer): data/ under a home that is a git checkout — where 5c77612ef put the run it VOIDS on the checkout\'s package.json before any variant; outside the home and the data dir the fake that walks up like 2.1.321 PASSES — and the same through a symlinked parent (the real path is judged)', gateOf(voidOn(cells[0][1])) && gateOf(passes(cells[1][1])) && gateOf(voidOn(cells[2][1])) && verdictOf(passes(cells[3][1])), JSON.stringify(cells.map(([w, r]) => [w, cellSaid(r)])));

  // ── round 3 (acceptance r2) on the REAL tracer ──
  const fakeWrap = (tag, mode) => { const d = path.join(tmp, 'w3-' + tag); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, 'claude'); fs.writeFileSync(f, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' '${mode}' "$@"\n`, { mode: 0o755 }); return f; };
  // ITEM 1: a THREADED read — forty opens at once on libuv's worker threads, which the tracer prints split in two — of a canary
  // under the data dir: the halves are joined and the run VOIDS
  const d1 = path.join(tmp, 'data-threaded'); fs.mkdirSync(path.join(d1, 'misc'), { recursive: true }); const c1 = path.join(d1, 'misc', 'canary.json'); fs.writeFileSync(c1, '{}');
  const hubT = await hubRun(fakeWrap('thread', `thread-read:${c1}`), { variants: ['oat-file'], dataDir: d1 });
  const tr0 = hubT.rec && hubT.rec.results && hubT.rec.results[0];
  ok('ITEM 1: a canary read on WORKER THREADS (the tracer splits those opens) VOIDS the run — the split halves were joined before the fence judged them', !!tr0 && hubT.rec.void === 'guarded-read' && gateOf(tr0.guardedReads.includes(c1)) && tr0.traceJoined > 0, JSON.stringify(tr0 && { void: hubT.rec.void, reads: tr0.guardedReads, joined: tr0.traceJoined }));
  // ITEM 2: the version run reads a canary under the data dir ⇒ VOID before any variant
  const d2 = path.join(tmp, 'data-version'); fs.mkdirSync(d2, { recursive: true }); const c2 = path.join(d2, 'vault.json'); fs.writeFileSync(c2, '{}');
  const hubV = await hubRun(fakeWrap('version', `version-read:${c2}`), { variants: ['oat-file'], dataDir: d2 });
  ok('ITEM 2: the --version run opening a file under the data dir VOIDS the run — before any variant runs (no gate, no PASS)', !!hubV.rec && hubV.rec.void === 'guarded-read' && gateOf(hubV.rec.versionRun) && gateOf(hubV.rec.versionRun.guardedReads.includes(c2)) && hubV.rec.results.length === 0 && !hubV.msgs.some((m) => m.type === 'gate' && m.gate && m.gate.pass), JSON.stringify(hubV.rec && { void: hubV.rec.void, version: hubV.rec.versionRun, results: hubV.rec.results.length }));
  // ITEMS 3 + 4: an UNRELATED process (this suite's own `sleep`, by its handle) — the CLI opens its /proc/<pid>/environ: the run
  // VOIDS (another process's environment is a credential store), and that process — named in the trace — survives the run
  const { spawn: spawnU } = require('node:child_process');
  const stranger = spawnU('sleep', ['60'], { stdio: 'ignore' });
  const hubP = await hubRun(fakeWrap('proc', `forbid-read:/proc/${stranger.pid}/environ`), { variants: ['oat-file'] });
  const pr0 = hubP.rec && hubP.rec.results && hubP.rec.results[0];
  ok(`ITEM 3: the CLI opening /proc/<an unrelated pid>/environ VOIDS the run`, !!pr0 && hubP.rec.void === 'guarded-read' && verdictOf(pr0.guardedReads.includes(`/proc/${stranger.pid}/environ`)), JSON.stringify(pr0 && { void: hubP.rec.void, reads: pr0.guardedReads }));
  ok('ITEM 4: that unrelated process — its pid in the trace — is ALIVE after the run ended (the run kills only the tracer it spawned; the kernel ends the tracees)', stranger.exitCode === null && stranger.signalCode === null && verdictOf(alive(stranger.pid)), JSON.stringify({ exit: stranger.exitCode, sig: stranger.signalCode }));
  try { stranger.kill('SIGKILL'); } catch { } // ours, by its handle
  // ITEM 5: the measurement CHILD SIGKILLed mid-run (the seventh ending) — the kernel's chain ends the CLI and its setsid grandchild
  const dh = path.join(tmp, 'daemon-hang.json'); const runDir5 = path.join(tmp, 'hub-crash', 'cli-self-measure', `run-${process.pid}-k`); fs.mkdirSync(runDir5, { recursive: true });
  const w5 = fakeWrap('crash', `daemon-hang:${dh}`);
  const r5 = await new Promise((resolve) => {
    const c = fork(PROBE, [], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(runDir5, 'home0'), LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
    const cap = setTimeout(() => c.kill('SIGKILL'), 60e3);
    c.on('exit', (code, sig) => { clearTimeout(cap); resolve({ code, sig }); });
    c.send({ claude: w5, root: path.join(runDir5, 'm'), runDir: runDir5, variants: ['oat-file'], gapMs: 50, flushMs: 50, nearMs: 1500 });
    const iv = setInterval(() => { if (pidIn(dh) !== 0 || fs.existsSync(dh)) { clearInterval(iv); setTimeout(() => c.kill('SIGKILL'), 500); } }, 100); setTimeout(() => clearInterval(iv), 40e3);
  });
  await new Promise((r) => setTimeout(r, 2000));
  let p5 = null; try { p5 = JSON.parse(fs.readFileSync(dh, 'utf8')); } catch { }
  ok('ITEM 5: the measurement child SIGKILLed mid-run ⇒ within 2 s the CLI and its setsid grandchild are GONE — the kernel ended them (pdeathsig took the tracer, EXITKILL its tracees); nothing in the hub had to', r5.sig === 'SIGKILL' && !!p5 && !alive(p5.cli) && !alive(p5.daemon), JSON.stringify({ r5, p5, cli: p5 && alive(p5.cli), daemon: p5 && alive(p5.daemon) }));
  if (p5) for (const [pid, comm, word] of [[p5.daemon, 'sleep', '120'], [p5.cli, 'node', FAKE]]) if (alive(pid) && isOurs(pid, comm, word)) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  for (const [how, extra] of [['SIGTERM', {}], ['deadline', { deadline: Date.now() + 6000 }]]) {
    const hpf = path.join(tmp, `hang-${how}.pid`); const wh = path.join(tmp, `claude-hang-${how}`); fs.writeFileSync(wh, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' 'hang:${hpf}' "$@"\n`, { mode: 0o755 });
    const runDir = path.join(tmp, `hub-${how}`, 'cli-self-measure', `run-${process.pid}-c`); fs.mkdirSync(runDir, { recursive: true });
    const t0 = Date.now();
    const hr = await new Promise((resolve) => {
      const c = fork(PROBE, [], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(runDir, 'home0'), LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
      const cap = setTimeout(() => c.kill('SIGKILL'), 60e3);
      c.on('exit', (code, sig) => { clearTimeout(cap); resolve({ code, sig, ms: Date.now() - t0 }); });
      c.send({ claude: wh, root: path.join(runDir, 'm'), runDir, variants: ['oat-file'], gapMs: 50, flushMs: 50, nearMs: 1500, ...extra });
      if (how === 'SIGTERM') { const iv = setInterval(() => { if (pidIn(hpf)) { clearInterval(iv); setTimeout(() => c.kill('SIGTERM'), 300); } }, 100); setTimeout(() => clearInterval(iv), 30e3); }
    });
    const hpid = pidIn(hpf);
    ok(`LAW C (${how}): the run ends ITSELF — the CLI it started (pid from the fake) is gone and its run dir removed${how === 'deadline' ? ', by its OWN deadline (no hub timer)' : ''}`, hpid > 0 && !alive(hpid) && !fs.existsSync(runDir) && hr.ms < 45e3, JSON.stringify({ hpid, alive: hpid ? alive(hpid) : null, runDir: fs.existsSync(runDir), ...hr }));
    if (hpid && alive(hpid) && isOurs(hpid, 'node', FAKE)) { try { process.kill(hpid, 'SIGKILL'); } catch { } }
  }
}

// THE MINT'S SCOPES (lane oat-add-door, 2.369.399): the release road's `--variant mint --write-mint-fixture` over the fake's
// `setup-token` (a pty through util-linux script; the run ends by the tracer's kill by design) — the scopes it PRINTS recorded, the
// fixture written by withMeasured; a fake whose URL names no scope ⇒ FAIL, no scopes, never a void
console.log('the mint variant over the FAKE claude');
if (!haveStrace) { skip++; console.log('  SKIP the mint runs: no strace on this machine'); }
else {
  const mfx = path.join(tmp, 'mint-fx.json'), mrec = path.join(tmp, 'mint-rec.json');
  const r = measure(['--claude', wrap('good'), '--variant', 'mint', '--write-mint-fixture', '--mint-fixture', mfx, '--out', mrec]);
  let F = null, R = null;
  try { F = JSON.parse(fs.readFileSync(mfx, 'utf8')); R = JSON.parse(fs.readFileSync(mrec, 'utf8')); } catch { }
  const m = R && R.results.find((x) => x.variant === 'oat-mint-scopes');
  ok('the good fake: the mint PASSes with the scope it printed; the run is not void and nothing left loopback', r.status === 0 && !!m && m.verdict === 'PASS' && JSON.stringify(m.scopes) === '["user:inference"]' && !R.void && !R.aborted && R.escapes.length === 0 && m.outboundConnects.length === 0 && m.oauthCalls === 0 && m.guardedReads.length === 0, { status: r.status, m: m && { v: m.verdict, s: m.scopes, n: m.note }, err: String(r.stderr).slice(-300) });
  ok('…the fixture: {versions: {"9.9.9": {verdict PASS, scopes}}} — mintScopesOf reads it for 9.9.9 only', !!F && C.mintScopesOf('9.9.9', F)?.join() === 'user:inference' && C.mintScopesOf('2.1.321', F) === null && F.versions['9.9.9'].script === 'scripts/measure-claude-cred-read.mjs');
  ok('…its record ended by the tracer\'s kill, said so — and the six were never run (the mint is its own variant)', !!m && gateOf(/the run ended by the tracer's kill/.test(m.note)) && R.results.length === 1, m && m.note);
  const r2 = measure(['--claude', wrap('mint-noscope'), '--variant', 'mint', '--scope-wait-ms', '4000', '--out', mrec]);
  let R2 = null; try { R2 = JSON.parse(fs.readFileSync(mrec, 'utf8')); } catch { }
  const m2 = R2 && R2.results.find((x) => x.variant === 'oat-mint-scopes');
  ok('a fake whose URL names no scope ⇒ FAIL, no scopes, the run NOT void (a mechanical miss never voids the gate)', r2.status === 0 && !!m2 && m2.verdict === 'FAIL' && m2.scopes === null && !R2.void, m2 && m2.note);
}

// ── THE CHECKPOINT SWITCH over the fake (row B-437e U0; the verdict's own table is test-cli-caps ⑨, fast) ──
console.log('the checkpoint switch over the FAKE claude (row B-437e U0: what the CLI sends, without and with the switch)');
if (!haveStrace) { skip++; console.log('  SKIP the checkpoint runs: no strace on this machine'); }
else {
  const runCkpt = (mode, tag, extra = []) => {
    const fxc = path.join(tmp, `ckpt-fx-${tag}.json`), recc = path.join(tmp, `ckpt-rec-${tag}.json`);
    const r = measure(['--claude', wrap(mode), '--variant', 'ckpt', '--write-ckpt-fixture', '--ckpt-fixture', fxc, '--out', recc, ...extra]);
    let F = null, R = null;
    try { F = JSON.parse(fs.readFileSync(fxc, 'utf8')); } catch { }
    try { R = JSON.parse(fs.readFileSync(recc, 'utf8')); } catch { }
    const off = R && R.results.find((x) => x.variant === 'ckpt-off'), on = R && R.results.find((x) => x.variant === 'ckpt-on');
    return { r, F, R, off, on };
  };
  const g = runCkpt('ckpt', 'good');
  console.log(`    (ckpt-on: ${g.on ? `${g.on.verdict} — ${g.on.note}` : 'no result'}${g.r.status ? ` · exit ${g.r.status}: ${String(g.r.stderr).slice(-300)}` : ''})`);
  ok('the honest fake: nothing it sends differs with the switch; one checkpoint file with it, none without ⇒ SAME (PASS); the run is not void, nothing left loopback',
    g.r.status === 0 && !!g.on && g.on.verdict === 'PASS' && g.on.ckpt.verdict === 'SAME' && g.on.checkpointCount === 1 && !!g.off && g.off.checkpointCount === 0 && gateOf(g.off.edited) && gateOf(g.on.edited) && !g.R.void && !g.R.aborted && g.R.escapes.length === 0,
    g.on && g.on.note);
  ok('…both runs made the same three requests (Read, Edit, the end) and the record keeps sign-in values as labels only (no token bytes in the record or the fixture)',
    !!g.on && g.on.requests === 3 && g.off.requests === 3 && !!g.F && !/sk-ant-o[ar]t01-FAKE/.test(JSON.stringify(g.R)) && !/sk-ant-o[ar]t01-FAKE/.test(JSON.stringify(g.F)) && verdictOf(g.on.heads.every((h) => /^Bearer <O oat>$/.test(h.headers.authorization || ''))),
    g.on && JSON.stringify(g.on.heads.map((h) => h.headers.authorization)));
  ok('…the fixture: {versions: {"9.9.9": {verdict SAME, files {off 0, on 1}}}} — ckptSwitchOf reads it for 9.9.9 only',
    !!g.F && K.ckptSwitchOf('9.9.9', g.F) === 'SAME' && K.ckptSwitchOf('2.1.322', g.F) === null && JSON.stringify(g.F.versions['9.9.9'].files) === '{"off":0,"on":1}' && g.F.versions['9.9.9'].script === 'scripts/measure-claude-cred-read.mjs',
    g.F && JSON.stringify(g.F).slice(0, 400));
  const h = runCkpt('ckpt-header', 'header');
  ok('RED CONTROL: a fake that sends one header more with the switch ⇒ DIFFERENT, STOP (exit 4), the header and its request named as the comparer names them; the fixture says DIFFERENT',
    !!h.on && h.on.verdict === 'STOP' && h.on.ckpt.stop === true && h.r.status === 4 && gateOf(h.on.ckpt.findings.some((x) => /^request \/v1\/messages\?beta=true stream \["Edit","Read"\] #\d+ header only with the switch: x-fake-ckpt$/.test(x))) && !!h.F && K.ckptSwitchOf('9.9.9', h.F) === 'DIFFERENT' && h.F.versions['9.9.9'].stop === true,
    h.on && `exit ${h.r.status}: ${h.on.note}`);
  const plain = measure(['--claude', wrap('ckpt-header'), '--variant', 'ckpt', '--out', path.join(tmp, 'ckpt-rec-plain.json')]);
  ok('…a STOP exits 4 without the fixture writer too (r1107)', plain.status === 4 && verdictOf(/^STOP: /m.test(plain.stderr)), `exit ${plain.status}: ${String(plain.stderr).slice(-200)}`);
  ok('…the two homes carried ONE made-up device id: the honest fake\'s user id names it, the session masked (r1107 MUST 2 — nothing of the device to mask)',
    !!g.on && gateOf(g.on.heads.every((x) => typeof x.body.userId === 'string' && x.body.userId.includes(K.CKPT_DEVICE) && x.body.userId.includes('<session>'))) && verdictOf(g.off.heads.every((x) => x.body.userId === g.on.heads[0].body.userId)),
    g.on && JSON.stringify(g.on.heads.map((x) => x.body.userId)));
  const dv = runCkpt('ckpt-devid', 'devid');
  ok('RED CONTROL: a fake that mints its own device id per home (the made-up one ignored) ⇒ DIFFERENT on the user id — why both homes carry one',
    !!dv.on && dv.on.ckpt.verdict === 'DIFFERENT' && gateOf(dv.on.ckpt.findings.some((x) => / body userId: /.test(x))) && dv.r.status === 4, dv.on && dv.on.note);
  const ne = runCkpt('ckpt-noedit', 'noedit');
  ok('a fake whose edit never lands ⇒ INCOMPLETE before any comparison; the writer refuses it (exit 2, no fixture)',
    !!ne.on && ne.on.ckpt.verdict === 'INCOMPLETE' && ne.r.status === 2 && gateOf(/measured nothing/.test(ne.r.stderr)) && !ne.F, ne.on && `exit ${ne.r.status}: ${ne.on.note}`);
  const ord = measure(['--claude', wrap('ckpt'), '--variant', 'ckpt-on,ckpt-off', '--out', path.join(tmp, 'ckpt-rec-order.json')]);
  let RO = null; try { RO = JSON.parse(fs.readFileSync(path.join(tmp, 'ckpt-rec-order.json'), 'utf8')); } catch { }
  ok('the pair runs off first whatever the order asked (ckpt-on is a diff against ckpt-off)', ord.status === 0 && !!RO && JSON.stringify(RO.results.map((x) => x.variant)) === '["ckpt-off","ckpt-on"]' && RO.results[1].ckpt.verdict === 'SAME', `exit ${ord.status}: ${RO && JSON.stringify(RO.results.map((x) => x.variant))}`);
  const a = runCkpt('ckpt-always', 'always');
  ok('RED CONTROL: a fake that keeps a checkpoint WITHOUT the switch ⇒ ALREADY-ON (the road keeps them already), never SAME',
    !!a.on && a.on.ckpt.verdict === 'ALREADY-ON' && a.on.verdict === 'FAIL' && a.off.checkpointCount === 1, a.on && a.on.note);
  const lone = measure(['--claude', wrap('ckpt'), '--variant', 'ckpt-on', '--write-ckpt-fixture', '--ckpt-fixture', path.join(tmp, 'ckpt-fx-lone.json'), '--out', path.join(tmp, 'ckpt-rec-lone.json')]);
  ok('--write-ckpt-fixture without both variants in the run is REFUSED before anything runs (exit 2, no fixture)', lone.status === 2 && gateOf(/needs both checkpoint variants/.test(lone.stderr)) && !fs.existsSync(path.join(tmp, 'ckpt-fx-lone.json')), `exit ${lone.status}: ${String(lone.stderr).slice(-200)}`);
}

// ── THE ENTRY LABEL over the fake (主开发 r4483; the verdict's own table is test-claude-entry-label ⑦, fast) ──
console.log('the entry label over the FAKE claude (主开发 r4483: the request heads and the first stream events, without and with the name)');
if (!haveStrace) { skip++; console.log('  SKIP the entry runs: no strace on this machine'); }
else {
  const runEntry = (mode, tag, extra = []) => {
    const rec = path.join(tmp, `entry-rec-${tag}.json`);
    const r = measure(['--claude', wrap(mode), '--variant', 'entry', '--out', rec, ...extra]);
    let R = null; try { R = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch { }
    const off = R && R.results.find((x) => x.variant === 'entry-off'), on = R && R.results.find((x) => x.variant === 'entry-on');
    return { r, R, off, on };
  };
  const g = runEntry('entry', 'good');
  console.log(`    (entry-on: ${g.on ? `${g.on.verdict} — ${g.on.note}` : 'no result'}${g.r.status ? ` · exit ${g.r.status}: ${String(g.r.stderr).slice(-300)}` : ''})`);
  ok('the honest fake: with the name the billing line says vibespace on every request, sdk-cli without it; the first stream events keep their shape ⇒ PASS (exit 0); the run is not void, nothing left loopback',
    g.r.status === 0 && !!g.on && g.on.verdict === 'PASS' && g.on.entry.verdict === 'PASS' && JSON.stringify(g.on.entry.marks.on.labels) === '["vibespace"]' && JSON.stringify(g.on.entry.marks.off.labels) === '["sdk-cli"]'
      && g.on.entry.events.on.length >= 2 && JSON.stringify(g.on.entry.events.on) === JSON.stringify(g.on.entry.events.off) && g.on.switch === 'CLAUDE_CODE_ENTRYPOINT=vibespace' && g.off.switch === 'unset' && !g.R.void && !g.R.aborted && g.R.escapes.length === 0,
    g.on && g.on.note);
  ok('…the user agents are recorded as the CLI sent them (the label inside), and nothing else differs (elsewhere empty)',
    !!g.on && JSON.stringify(g.on.entry.marks.on.uas) === '["claude-cli/9.9.9 (external, vibespace)"]' && JSON.stringify(g.on.entry.marks.off.uas) === '["claude-cli/9.9.9 (external, sdk-cli)"]' && g.on.entry.elsewhere.length === 0,
    g.on && JSON.stringify(g.on.entry.marks));
  const named = runEntry('entry', 'named', ['--entry', 'my-team']);
  ok('--entry my-team: the run sets that name and the billing line says it', named.r.status === 0 && !!named.on && named.on.switch === 'CLAUDE_CODE_ENTRYPOINT=my-team' && JSON.stringify(named.on.entry.marks.on.labels) === '["my-team"]', named.on && named.on.note);
  const refused = runEntry('entry', 'refused', ['--entry', 'cli']);
  ok('--entry cli: REFUSED before anything starts (exit 2, the setting\'s own rule), no record', refused.r.status === 2 && gateOf(/setting refuses \(entry_name_cli\)/.test(refused.r.stderr)) && !refused.R, `exit ${refused.r.status}: ${String(refused.r.stderr).slice(-200)}`);
  const ig = runEntry('entry-ignore', 'ignore');
  ok('RED CONTROL: a fake that never takes the name ⇒ FAIL (exit 5), the billing line named as it read',
    !!ig.on && ig.on.verdict === 'FAIL' && ig.r.status === 5 && verdictOf(ig.on.entry.findings.some((x) => /^with the name, the billing line said \["sdk-cli"\]/.test(x))), ig.on && `exit ${ig.r.status}: ${ig.on.note}`);
  const sh = runEntry('entry-shape', 'shape');
  ok('RED CONTROL: a fake whose first event gains a key with the name ⇒ FAIL (exit 5) on the events\' shape, the event named',
    !!sh.on && sh.on.verdict === 'FAIL' && sh.r.status === 5 && verdictOf(sh.on.entry.findings.some((x) => /^the first stream events differ in shape: #1 system\/init \{subtype,type\} \| system\/init \{entry,subtype,type\}/.test(x))), sh.on && `exit ${sh.r.status}: ${sh.on.note}`);
  const ex = runEntry('entry-extra', 'extra');
  ok('a fake that sends one header more with the name ⇒ PASS, the header RECORDED by name «elsewhere» (read by the coordinator, never judged here)',
    !!ex.on && ex.on.verdict === 'PASS' && ex.r.status === 0 && verdictOf(ex.on.entry.elsewhere.some((x) => /header only with the name: x-fake-entry$/.test(x))), ex.on && ex.on.note);
  const lost = runEntry('rewrite-launcher', 'lost');
  ok('a pair that never reads (the launcher changed during entry-off: entry-on never starts) exits 5 «did not run» — NO exit 0 without a reading',
    lost.r.status === 5 && gateOf(/ENTRY: the entry pair did not run/.test(lost.r.stderr)) && !!lost.R && !lost.on && lost.R.void === 'launcher-changed', `exit ${lost.r.status}: ${String(lost.r.stderr).slice(-300)}`);
  const ord = measure(['--claude', wrap('entry'), '--variant', 'entry-on,entry-off', '--out', path.join(tmp, 'entry-rec-order.json')]);
  let RO = null; try { RO = JSON.parse(fs.readFileSync(path.join(tmp, 'entry-rec-order.json'), 'utf8')); } catch { }
  ok('the pair runs off first whatever the order asked (entry-on is read against entry-off)', ord.status === 0 && !!RO && JSON.stringify(RO.results.map((x) => x.variant)) === '["entry-off","entry-on"]' && RO.results[1].entry.verdict === 'PASS', `exit ${ord.status}: ${RO && JSON.stringify(RO.results.map((x) => x.variant))}`);
}

console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
