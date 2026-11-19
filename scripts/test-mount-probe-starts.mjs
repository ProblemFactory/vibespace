#!/usr/bin/env node
// THE MOUNT SWEEP'S RCLONE PROBES AND THE STORAGE PANEL'S READ START NO PROGRAM FROM THE HUB'S MAIN PROCESS (B-323e, lane
// hub-loop-stalls; measured first on a scratch hub of 2.369.412's first block: a first sweep over an OAuth mount, an imported
// share and a hung listing started SEVEN rclone programs from the main process — two of them synchronous help runs that held
// the loop the child's whole run — each later sweep two; every Storage-panel read a synchronous `rclone version`). Every child
// the hub starts forks the whole hub (about a second each at 5 GB, B-91aa's witness); THE STARTER (src/server/child-starter.js,
// B-91aa) forks a few MB.
//  ① THE CENSUS: one sweep over those three stand-in mounts starts 0 programs from this process; the starter answers all 7
//     (and the stand-in rclone's parent is never this process); RED CONTROL the base's ROADS planted back (an execFile of the
//     probes, the flag check's two execFileSync — synthesized in the base's shape) ⇒ the measure's 7 from the main process, 2
//     of them synchronous
//  ② THE STORAGE PANEL'S READ: rclone's and mc's presence read three times ⇒ ONE ask each, by the starter; a NO is asked again
//     after a minute; a slow answer is no answer (nothing kept); the install's generation is pinned; RED the base's roads ⇒ 3
//     synchronous + 3 forks from the main process. A SHARE'S ACT (a mint, a revoke) never reads «no answer» as «no mc»: it asks
//     afresh past a kept no (RED: the kept no ⇒ a revoke would skip `mc`), and a starter that never answers ⇒ the old way, once
//  ③ THE WHOLE ENV (主开发's ruling (A)): the probe's child gets EXACTLY the env its site built (rcloneEnv's shape: the service
//     list + the egress door + RCLONE_CONFIG_VS_*), a proxy name and a credential included, nothing of the starter's own; the
//     hub's own secret prefixes are refused (counted, said once as a count); RED the names road (`envAdd`) ⇒ both dropped
//  ④ NEVER SAID: the stand-in secret is in nothing the starter writes back (its stdout), nothing it writes to its STDERR (the
//     hub's journal), nothing this process logs, no probe's answer and no error's words; RED a starter that prints its request
//     ⇒ seen
//  ⑤ THE ANSWERS: no answer (a starter that never answers) ⇒ 'unanswered' from the access probe (every caller reads it as
//     'unknown'; the access error's re-probe leaves the banner — RED: the banner set on no answer) and 'unknown' from the read
//     probe; the flag check asks again (the replaced starter, then its old async road) and keeps the text — never a
//     synchronous start (RED: one ask ⇒ nothing kept, the flags left off, said once); a timeout ⇒ 'hung'; a 401 ⇒ 'denied'; a
//     non-auth failure ⇒ 'unknown'; an output past the old 1 MB bound ⇒ 'unknown' (as execFile's maxBuffer read it)
//  ⑦ ITS READ (B-323e TAKEN with smalls): a hung listing whose backend probe got no answer is slow, never «unreachable» (RED:
//     no answer read as «hung»); the accept-encoding flag is never kept false from a help text never read; the panel's presence
//     ask answers «don't know» (null) and its words say neither «expire» nor «stay valid»; the starter's OLD road hands the
//     presence ask the service env, never the hub's whole env — each with its RED control
//  ⑥ THE SPAWN CENSUS ROW: the whole env handed in _rcloneProbeRun is a WHOLE_ROWS row; RED a second one elsewhere ⇒ UNLISTED,
//     a row with no request ⇒ DEAD
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // B-0d3e: every red control's edit through the one door that fails by name

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-probe-starts-'));
// the stand-in secret, built at runtime (never a literal in the tree)
const SEC_VAL = ['s', 'ek', 'ret'].join('') + '-' + process.pid + '-b323e';
const PROXY = 'http://standin-proxy.invalid:3128';
const CP = require('child_process');
// THE COUNTER (B-91aa's): every async start of THIS process goes through ChildProcess.prototype.spawn; the synchronous forms too
let starts = 0, syncStarts = 0;
const realSpawn = CP.ChildProcess.prototype.spawn;
CP.ChildProcess.prototype.spawn = function (...a) { starts++; return realSpawn.apply(this, a); };
const realSync = {};
for (const k of ['spawnSync', 'execFileSync', 'execSync']) { realSync[k] = CP[k]; CP[k] = function (...a) { starts++; syncStarts++; return realSync[k].apply(this, a); }; }
const counting = async (fn) => { const s0 = starts, y0 = syncStarts; await fn(); return { main: starts - s0, sync: syncStarts - y0 }; };

// the stand-in programs: rclone (its MODE file picks the answer) and mc; each logs its parent pid
const LOG = path.join(T, 'starts.log'), MODE = path.join(T, 'mode'), DUMP = path.join(T, 'env.dump');
const fbin = path.join(T, 'bin'); fs.mkdirSync(fbin, { recursive: true });
const RCLONE = path.join(fbin, 'rclone');
fs.writeFileSync(RCLONE, `#!/bin/sh
echo "$PPID $1" >> '${LOG}'
MODE=$(cat '${MODE}' 2>/dev/null)
case "$1" in
  help|mount) echo '--use-accept-encoding-gzip --rc-addr' ;;
  version) [ "$MODE" = nover ] && exit 1; echo 'rclone v1.70.0' ;;
  lsf) [ "$MODE" = dump ] && env > '${DUMP}'
       [ "$MODE" = 401 ] && { echo 'Failed to lsf: 401 Unauthorized' >&2; exit 1; }
       [ "$MODE" = boom ] && { echo 'Failed to lsf: directory not found' >&2; exit 3; }
       [ "$MODE" = sleep ] && exec sleep 5
       [ "$MODE" = big ] && { head -c 1100000 /dev/zero | tr '\\0' a; echo; }
       [ "$MODE" = bigslow ] && { head -c 1100000 /dev/zero | tr '\\0' a; echo; exec sleep 5; }
       [ "$MODE" = bigerr401 ] && { echo 'Failed to lsf: 401 Unauthorized' >&2; head -c 1100000 /dev/zero | tr '\\0' a >&2; exec sleep 5; }
       echo f.txt ;;
  cat) [ "$MODE" = cat401 ] && { echo 'Failed to cat: 401 Unauthorized' >&2; exit 1; }; printf x ;;
esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(path.join(fbin, 'mc'), `#!/bin/sh\necho "$PPID mc" >> '${LOG}'\nexit 0\n`, { mode: 0o755 });
process.env.PATH = `${fbin}:${process.env.PATH}`;   // before the starter is born (its env is serviceEnv of this process's)
process.env.TERM = process.env.TERM || 'xterm';   // a name the starter's own env keeps (③: a whole env without it must not get it)
const mode = (m) => fs.writeFileSync(MODE, m);
const logLines = () => { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

const CS = require(path.join(REPO, 'src/server/child-starter.js'));
const { serviceEnv, RCLONE_ENV_KEEP } = require(path.join(REPO, 'src/agent-env.js'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const MC = mutantCopies('mount-probe-starts', REPO);
const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
// the env a probe's site builds — rcloneEnv's own shape (src/mounts.js): the service list + RCLONE_ENV_KEEP + the egress door
// + the provider's RCLONE_CONFIG_VS_*; the proxy is a stand-in in the BASE handed to the builder (never this process's env)
const builtEnv = () => serviceEnv({ ...process.env, HTTPS_PROXY: PROXY }, { keep: RCLONE_ENV_KEEP, egress: true, add: { RCLONE_CONFIG_VS_TYPE: 's3', RCLONE_CONFIG_VS_SECRET_ACCESS_KEY: SEC_VAL } });
const REC = {
  oauth: { id: 'mps-oauth', name: 'standin oauth', type: 'onedrive', desired: 'mounted' },
  share: { id: 'mps-share', name: 'standin share', type: 's3', origin: 'imported', desired: 'mounted' },
  hang: { id: 'mps-hang', name: 'standin hang', type: 'sftp', desired: 'mounted' },
};
/** a MountManager over the stand-ins: mounted, a live daemon, the listing of «hang» HUNG (the stall placed); every act a no-op */
const mmOf = (M, { env = builtEnv } = {}) => {
  const mm = Object.create(M.MountManager.prototype);
  Object.assign(mm, {
    _state: { mounts: Object.values(REC).map((r) => ({ ...r })), shares: [] }, _errors: new Map(), _notify() { },
    isMounted: () => true, pathOf: (m) => path.join(T, 'mnt-' + m.id), _daemonAlive: () => true, _daemonPids: () => [],
    _probeMountpoint: async (mp, _t, verb) => (verb !== 'attr' && mp.endsWith(REC.hang.id) ? { health: 'hung', ms: 6000 } : { health: 'ok', ms: 1 }),
    _rcloneFor: () => ({ env: env(), remote: 'VS:' }), rcloneBin: () => RCLONE,
    unmount: async () => ({ ok: true }), _killMountDaemon() { }, _maybeAutoRemount: async () => { },
  });
  return mm;
};
const warns = [];
const S = CS.createChildStarter({ log: { warn: (l) => warns.push(String(l)) } }); CS.setChildStarter(S);
const said = [];   // everything the starter writes back to this process
const hold = [];   // this process's console while the legs run
const con = { log: console.log, warn: console.warn, error: console.error };
for (const k of ['warn', 'error']) console[k] = (...a) => { hold.push(a.map(String).join(' ')); con[k](...a); };

try {
  await S.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (one, made once), outside every window
  S._proc().stdout.on('data', (d) => said.push(String(d)));

  console.log('① the census: one sweep over three stand-in mounts starts no program from the main process');
  const sweep = async (M) => {
    const mm = mmOf(M); const r0 = S.stats().requests, l0 = logLines().length;
    const n = await counting(() => mm._healthSweep());
    return { ...n, via: S.stats().requests - r0, lines: logLines().slice(l0) };
  };
  mode('ok');
  const now = await sweep({ MountManager });
  const RUN_NEW = "    return require('./server/child-starter').childStarter().run(this.rcloneBin(), args, { timeoutMs, capture: true, maxBuffer: PROBE_OUT_MAX, env, wholeEnv: true });";
  const RUN_OLD = "    return new Promise((resolve) => require('child_process').execFile(this.rcloneBin(), args, { env, timeout: timeoutMs }, (err, stdout, stderr) => resolve({ started: true, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, timedOut: !!(err && err.killed), stdout, stderr })));";
  const FLAGS_NEW = "    if (this._rcloneFlagsHelp !== undefined) return Promise.resolve(true);\n    if (this._rcloneFlagsAsk) return this._rcloneFlagsAsk;";
  const FLAGS_OLD = "    if (this._rcloneFlagsHelp !== undefined || true) return Promise.resolve(this._rcloneFlagsHelp !== undefined);\n    if (this._rcloneFlagsAsk) return this._rcloneFlagsAsk;";
  const HAS_NEW = "    if (this._rcloneFlagsHelp === undefined) {\n      if (!this._rcloneFlagsUnsaid) {";
  const HAS_OLD = "    if (this._rcloneFlagsHelp === undefined) { let out = ''; for (const argv of [['help', 'flags'], ['mount', '--help']]) { try { out += require('child_process').execFileSync(this.rcloneBin(), argv, { encoding: 'utf-8', timeout: 10000 }); } catch { } } this._rcloneFlagsHelp = out; }\n    if (this._rcloneFlagsHelp === undefined) {\n      if (!this._rcloneFlagsUnsaid) {";
  const planted = msrc.split(RUN_NEW).length === 2 && msrc.split(FLAGS_NEW).length === 2 && msrc.split(HAS_NEW).length === 2;
  const AEG0 = "    if (this._rcloneFlagsHelp === undefined) return false;   // B-323e (its read):";   // the base had no such guard: its flag check went to the synchronous road
  const RED1 = planted && msrc.split(AEG0).length === 2 ? MC.load('src/mounts.js', anchored(anchored(anchored(anchored(msrc, RUN_NEW, RUN_OLD, 'red-base: the probes\' run'), FLAGS_NEW, FLAGS_OLD, 'red-base: the flag ask'), HAS_NEW, HAS_OLD, 'red-base: the flag reader'), AEG0, '    // (control) the base: no guard here;', 'red-base: the accept-encoding guard'), 'red-base') : null;
  const red = RED1 ? await sweep(RED1) : { main: -1, sync: -1 };
  ok(planted, 'the RED control\'s plants are in the tree: the probes\' one run through the starter, the flag check\'s ask and its reader, each exactly once');
  ok(now.main === 0 && now.via === 7 && now.lines.length === 7 && now.lines.every((l) => !l.startsWith(process.pid + ' ')),
    `a sweep (an OAuth mount's 10-minute probe, an imported s3 share, a hung listing): ${now.main} programs from the main process, ${now.via} by the starter, none of the stand-in's ${now.lines.length} starts a child of this process`, now);
  ok(red.main === 7 && red.sync === 2, `RED (the base's roads planted back: the probes' execFile, the flag check's two execFileSync): ${red.main} from the main process, ${red.sync} of them synchronous — the measure's 7 and 2`, red);

  console.log('② the Storage panel\'s read: rclone and mc asked once, kept');
  const panel = async (M) => { const mm = mmOf(M); const r0 = S.stats().requests; const got = []; const n = await counting(async () => { for (let i = 0; i < 3; i++) got.push([await mm.rcloneAvailable(), await mm.mcAvailable()]); }); return { ...n, via: S.stats().requests - r0, got, mm }; };
  const p1 = await panel({ MountManager });
  ok(p1.main === 0 && p1.via === 2 && p1.got.every(([r, m]) => r === true && m === true), `three panel reads: ${p1.main} programs from the main process, ${p1.via} asks by the starter (rclone's version and mc's, once each), every read answered yes`, p1.got);
  mode('nover');
  const mmNo = mmOf({ MountManager }); const a1 = await mmNo.rcloneAvailable(), r1 = S.stats().requests, a2 = await mmNo.rcloneAvailable(), r2 = S.stats().requests;
  mmNo._tools.get('rclone').at -= 61000; const a3 = await mmNo.rcloneAvailable(), r3 = S.stats().requests;
  ok(a1 === false && a2 === false && r2 === r1 && a3 === false && r3 === r1 + 1, `a NO is kept a minute (${a1}, then ${a2} with no ask) and asked again after it (${r3 - r1} ask) — a hand install is seen`);
  mode('ok');
  const INST = "    this._toolsGen = (this._toolsGen || 0) + 1; this._tools?.delete('rclone');   // B-323e: the kept answer was about the old binary\n    if ((await this.rcloneAvailable()) === false) throw new Error('installed binary failed to run');";
  ok(msrc.split(INST).length === 2, 'PIN (no install runs here): an install drops the kept answer (its generation) before it asks the new binary, and only a NO is a failed install');
  const slow = mmOf({ MountManager }), sv = await slow._toolKnown('slow', 'sh', ['-c', 'exec sleep 3'], 200);
  ok(sv === null && !slow._tools.has('slow'), `an ask slower than its bound is no answer (${sv}) and nothing is kept — a slow box never reads as «not installed»`);
  // a SHARE'S ACT: a kept no is not enough, and no answer is never «no mc»
  const actOf = async (M) => { const mm = mmOf(M); mm._tools = new Map([['mc', { v: false, at: Date.now() }]]); return [await mm.mcAvailable(), await mm.mcAvailable({ act: true })]; };
  const k1 = await actOf({ MountManager });
  const FRESH = "this._toolKnown('mc', 'mc', ['--version'], 10000, { fresh: act })";
  const k1r = msrc.split(FRESH).length === 2 ? await actOf(MC.load('src/mounts.js', anchored(msrc, FRESH, "this._toolKnown('mc', 'mc', ['--version'], 10000)", 'red-fresh'), 'red-fresh')) : [null, null];
  ok(k1[0] === false && k1[1] === true && k1r[1] === false, `a kept «no mc» (60 s): the panel reads it (${k1[0]}), a share's act asks afresh (${k1[1]}); RED (the act reads the kept no): ${k1r[1]} — a revoke would skip \`mc\` and leave a never-expiring key alive`);
  const AV_NEW = "  rcloneAvailable() { return this._toolKnown('rclone', this.rcloneBin(), ['version'], 5000); }";
  const AV_OLD = "  rcloneAvailable() {\n    try { require('child_process').execFileSync(this.rcloneBin(), ['version'], { timeout: 5000, stdio: 'pipe' }); return true; }\n    catch { return false; }\n  }";
  const MC_NEW = "    const v = await this._toolKnown('mc', 'mc', ['--version'], 10000, { fresh: act });\n";
  const MC_OLD = "    return new Promise((resolve) => execFile('mc', ['--version'], (err) => resolve(!err)));\n";   // stale-pins: kept (the RED control plants the base's line back)
  const planted2 = msrc.split(AV_NEW).length === 2 && msrc.split(MC_NEW).length === 2;
  const p2 = planted2 ? await panel(MC.load('src/mounts.js', anchored(anchored(msrc, AV_NEW, AV_OLD, 'red-panel: rclone'), MC_NEW, MC_OLD, 'red-panel: mc'), 'red-panel')) : { main: -1, sync: -1 };
  ok(planted2 && p2.main === 6 && p2.sync === 3, `RED (the base's roads): three reads start ${p2.main} programs from the main process, ${p2.sync} of them synchronous (each held the loop its child's whole run)`, { main: p2.main, sync: p2.sync });

  console.log('③ the whole env: the child gets exactly what its site built');
  const envOf = async (M) => {
    try { fs.rmSync(DUMP, { force: true }); } catch { }
    mode('dump');
    const want = builtEnv(); delete want.TERM;   // a name the starter's own env has (serviceEnv keeps TERM): the child must not get it
    want[['VIBESPACE', 'STANDIN', 'KEY'].join('_')] = SEC_VAL;   // the hub's own prefix — refused
    const mm = mmOf(M, { env: () => ({ ...want }) });
    const said0 = await mm._probeBackendAccess(REC.oauth, 10000);
    mode('ok');
    const got = {}; for (const l of (fs.existsSync(DUMP) ? fs.readFileSync(DUMP, 'utf8') : '').split('\n')) { const i = l.indexOf('='); if (i > 0) got[l.slice(0, i)] = l.slice(i + 1); }
    for (const k of ['PWD', 'OLDPWD', 'SHLVL', '_']) delete got[k];   // the shell's own
    return { said0, want, got };
  };
  const w0 = S.stats().refused, e1 = await envOf({ MountManager });
  const wantKept = Object.entries(e1.want).filter(([k]) => !k.startsWith('VIBESPACE_'));
  const exact = wantKept.every(([k, v]) => e1.got[k] === v) && Object.keys(e1.got).every((k) => k in e1.want && !k.startsWith('VIBESPACE_'));
  ok(e1.said0 === 'ok' && exact && e1.got.HTTPS_PROXY === PROXY && e1.got.RCLONE_CONFIG_VS_SECRET_ACCESS_KEY === SEC_VAL && !('TERM' in e1.got),
    `the probe's child got EXACTLY its site's env (${Object.keys(e1.got).length} names: the proxy and the credential in it, the starter's own TERM not)`, { missing: wantKept.filter(([k, v]) => e1.got[k] !== v).map(([k]) => k), extra: Object.keys(e1.got).filter((k) => !(k in e1.want)) });
  ok(!Object.keys(e1.got).some((k) => k.startsWith('VIBESPACE_')) && S.stats().refused === w0 + 1 && warns.length === 1 && /1 name\(s\)/.test(warns[0]) && !warns[0].includes('VIBESPACE_STANDIN') && !warns[0].includes(SEC_VAL),
    `the hub's own secret prefix in a whole env is refused (${S.stats().refused - w0} counted) and said once, as a count — no name, no value`, warns);
  const ADD_RED = RUN_NEW.replace('env, wholeEnv: true', 'envAdd: env');
  const e2 = planted ? await envOf(MC.load('src/mounts.js', anchored(msrc, RUN_NEW, ADD_RED, 'red-names'), 'red-names')) : { got: {} };
  ok(planted && !('HTTPS_PROXY' in e2.got) && !('RCLONE_CONFIG_VS_SECRET_ACCESS_KEY' in e2.got) && e2.got.RCLONE_CONFIG_VS_TYPE === 's3',
    `RED (the names road, envAdd): the proxy and the credential are DROPPED (${'HTTPS_PROXY' in e2.got}, ${'RCLONE_CONFIG_VS_SECRET_ACCESS_KEY' in e2.got}) — an imported share's probe without its secret reads «denied»: a false «revoked» banner`);

  console.log('④ never said');
  const mmS = mmOf({ MountManager });
  mode('401'); const d401 = await mmS._probeBackendAccess(REC.oauth, 10000);
  mode('boom'); const dBoom = await mmS._probeBackendAccess(REC.oauth, 10000);
  mode('ok');
  const gone = Object.assign(mmOf({ MountManager }), { rcloneBin: () => path.join(T, 'no-such-rclone') });
  const dGone = await gone._probeBackendAccess(REC.oauth, 10000);
  const gr = await S.run(path.join(T, 'no-such-rclone'), ['lsf'], { timeoutMs: 5000, capture: true, env: builtEnv(), wholeEnv: true });
  // THE STARTER'S STDERR (inherited: the hub's journal) — read through a script seam that sends the starter process's own
  // stderr writes to a file; RED a starter that prints its request
  const PROC = path.join(REPO, 'src/server/child-starter-proc.js'), psrc = fs.readFileSync(PROC, 'utf8');
  const seam = (procPath, tag) => { const errf = path.join(T, `starter-stderr-${tag}.txt`), w = path.join(T, `starter-seam-${tag}.js`);
    fs.writeFileSync(w, `const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(errf)}, 'a');\nprocess.stderr.write = (c, e, cb) => { try { fs.writeSync(fd, typeof c === 'string' ? c : Buffer.from(c)); } catch { } const f = typeof e === 'function' ? e : cb; if (typeof f === 'function') f(); return true; };\nrequire(${JSON.stringify(procPath)});\n`);
    return { w, errf }; };
  const viaSeam = async (procPath, tag) => { const { w, errf } = seam(procPath, tag); const S4 = CS.createChildStarter({ script: w, log: { warn() { } } }); CS.setChildStarter(S4);
    try { mode('401'); await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 10000); mode('ok'); await S4.run(RCLONE, ['lsf', 'VS:'], { timeoutMs: 5000, capture: true, env: builtEnv(), wholeEnv: true }); }
    finally { mode('ok'); S4.closePipe(); CS.setChildStarter(S); }
    await sleep(100); return fs.existsSync(errf) ? fs.readFileSync(errf, 'utf8') : ''; };
  const LEAK = "  const env = m.whole === true ? {} : { ...process.env };";
  const e4 = await viaSeam(PROC, 'real');
  const e4r = psrc.split(LEAK).length === 2 ? await viaSeam(MC.write('src/server/child-starter-proc.js', anchored(psrc, LEAK, "  console.error('request', JSON.stringify(m.env));\n" + LEAK, 'red-leak'), 'leak'), 'red') : '';
  ok(!e4.includes(SEC_VAL) && e4r.includes(SEC_VAL), `the starter's own stderr (the hub's journal) carries no part of a whole env (${e4.length} bytes written); RED (a starter that prints its request): the stand-in secret seen`);
  await sleep(50);
  const all = [said.join(''), hold.join('\n'), warns.join('\n'), JSON.stringify(gr), d401, dBoom, dGone, e4].join('\n');
  ok(d401 === 'denied' && dBoom === 'unknown' && dGone === 'unknown' && gr.started === false && !!gr.error && said.join('').length > 0,
    `the roads ran (a 401 «${d401}», a non-auth failure «${dBoom}», a program that cannot start «${dGone}», its error «${gr.error}»)`);
  ok(!all.includes(SEC_VAL) && !all.includes(PROXY), `the stand-in secret and proxy are in nothing the starter wrote back (${said.join('').length} bytes), nothing logged here, no answer and no error's words`);

  console.log('⑤ the answers');
  const silent = path.join(T, 'silent-starter.js');
  fs.writeFileSync(silent, "process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); process.stdin.on('close', () => process.exit(0));\n");
  const quiet = async (fn) => { const Q = CS.createChildStarter({ script: silent, guardMs: 50, log: { warn() { } } }); CS.setChildStarter(Q); try { return await fn(); } finally { Q.closePipe(); CS.setChildStarter(S); } };
  const u1 = await quiet(() => mmOf({ MountManager })._probeBackendAccess(REC.oauth, 200));
  const u2 = await quiet(() => mmOf({ MountManager })._probeBackendRead(REC.oauth, 200));
  const mmF = mmOf({ MountManager });
  let u3 = null; const f3 = await counting(async () => { u3 = await quiet(() => mmF._rcloneFlagsReady(200)); });
  const kept3 = String(mmF._rcloneFlagsHelp || '');
  ok(u1 === 'unanswered' && u2 === 'unknown', `a starter that never answers: the access probe «${u1}», the read probe «${u2}» — never «denied» or «hung»`);
  const ERRB = "      if (acc === 'unanswered') return undefined;";
  const banner = async (M) => { const f = Object.create(M.MountManager.prototype); Object.assign(f, { _revocable: () => false, _oauthBacked: () => false, _errors: new Map(), _probeMountpoint: async () => ({ health: 'error', ms: 1 }), _probeBackendAccess: async () => 'unanswered' }); return f._accessErrorFor(REC.hang, path.join(T, 'mnt-x'), 'error'); };
  const b1 = await banner({ MountManager }), b1r = msrc.split(ERRB).length === 2 ? await banner(MC.load('src/mounts.js', anchored(msrc, ERRB, '', 'red-banner'), 'red-banner')) : null;
  ok(b1 === undefined && typeof b1r === 'string' && b1r.length > 0, `an access error's re-probe whose backend probe got no answer: the banner stands as it is (${b1}); RED (no answer read as «broken»): «${String(b1r).slice(0, 50)}…»`);
  ok(u3 === true && kept3.includes('use-accept-encoding-gzip') && f3.sync === 0, `the flag check with a starter that never answers asks again — the replaced starter, then its old (async) road answers: kept (${u3}), ${f3.sync} synchronous starts`);
  const ONE = "for (let i = 0; i < 3; i++) { if (this._rcloneFlagsHelp !== undefined || await once()) return true; }";
  let u3r = null, has3r = null, f3r = { sync: -1 };
  if (msrc.split(ONE).length === 2) { const R3 = MC.load('src/mounts.js', anchored(msrc, ONE, ONE.replace('i < 3', 'i < 1'), 'red-once'), 'red-once'); const mr = mmOf(R3); const w0r = hold.length; f3r = await counting(async () => { u3r = await quiet(() => mr._rcloneFlagsReady(200)); has3r = mr._rcloneHasFlag('rc-addr'); mr._rcloneHasFlag('rc-addr'); }); has3r = { has: has3r, said: hold.slice(w0r).filter((l) => l.includes('help text was not read')).length }; }
  ok(u3r === false && has3r && has3r.has === false && has3r.said === 1 && f3r.sync === 0, `RED (one ask): nothing kept (${u3r}), the version-gated flag left OFF (${has3r && has3r.has}) and said once (${has3r && has3r.said}) — still no synchronous start (${f3r.sync})`);
  mode('sleep'); const h1 = await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 300); mode('ok');
  mode('cat401'); const r401 = await mmOf({ MountManager })._probeBackendRead(REC.oauth, 10000); mode('ok');
  const rOk = await mmOf({ MountManager })._probeBackendRead(REC.oauth, 10000);
  mode('big'); const big1 = await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 10000), big2 = await mmOf({ MountManager })._probeBackendRead(REC.oauth, 10000); mode('ok');
  ok(h1 === 'hung' && r401 === 'denied' && rOk === 'ok', `past its bound «${h1}»; the read probe's one-byte read refused with a 401 «${r401}», read «${rOk}»`);
  ok(big1 === 'unknown' && big2 === 'unknown', `a listing past the old 1 MB bound: the access probe «${big1}», the read probe «${big2}» — the release's verdict: execFile's maxBuffer error carries no \`killed\` flag, so it read 'unknown' too, never 'hung'`);
  // the reader's M2: a SLOW listing past the bound — the starter ENDS the child there (as execFile did), so the probe reads 'unknown' at
  // once, never its timer's 'hung' (a false «unreachable», then a teardown); RED: a starter copy that keeps the child running
  const OVER = "    const over = () => { if (overflow) return; overflow = true; try { c.stdout?.destroy(); c.stderr?.destroy(); c.kill('SIGTERM'); } catch { } };", psrc5 = fs.readFileSync(path.join(REPO, 'src/server/child-starter-proc.js'), 'utf8');
  mode('bigslow'); const slow1 = await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 2000);   // no clock read: a timeout would read «hung»
  const S5 = CS.createChildStarter({ script: MC.write('src/server/child-starter-proc.js', anchored(psrc5, OVER, '    const over = () => { };', 'red-overcap'), 'overcap'), log: { warn() { } } }); CS.setChildStarter(S5);
  let slowR; try { slowR = await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 800); } finally { S5.closePipe(); CS.setChildStarter(S); mode('ok'); }
  ok(psrc5.split(OVER).length === 2 && slow1 === 'unknown' && slowR === 'hung', `…and a SLOW listing past it (1.1 MB, then 5 s more): the starter ENDS the child at the bound, as execFile did — «${slow1}» before its bound (2 s); RED (a starter that keeps it running): «${slowR}» at its bound`);
  // …the answer says it (`overflow`), on the starter's process AND on its OLD road (after two faults — runDirect); RED: a copy of
  // child-starter.js whose old road keeps the child running ⇒ its timer, no overflow
  const bigRun = (Q) => Q.run(RCLONE, ['lsf', 'VS:'], { timeoutMs: 2000, capture: true, maxBuffer: 1048576, env: builtEnv(), wholeEnv: true });
  const viaOld = async (mk, fn) => { const Q = mk.createChildStarter({ script: silent, guardMs: 50, log: { warn() { } } }); CS.setChildStarter(Q); try { await Q.run('true', [], { timeoutMs: 100 }); await Q.run('true', [], { timeoutMs: 100 }); return await fn(Q); } finally { Q.closePipe(); CS.setChildStarter(S); } };
  const cssrc = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8');
  const OVER_D = "      const over = () => { if (overflow) return; overflow = true; try { c.stdout?.destroy(); c.stderr?.destroy(); c.kill('SIGTERM'); } catch { } };";
  mode('bigslow');
  let rMain, rOld, rOldR;
  try { rMain = await bigRun(S); rOld = await viaOld(CS, bigRun); rOldR = await viaOld(MC.load('src/server/child-starter.js', anchored(cssrc, OVER_D, '      const over = () => { };', 'red-overcap-direct'), 'red-overcap-direct'), (Q) => Q.run(RCLONE, ['lsf', 'VS:'], { timeoutMs: 800, capture: true, maxBuffer: 1048576, env: builtEnv(), wholeEnv: true })); } finally { mode('ok'); }
  ok(cssrc.split(OVER_D).length === 2 && rMain.overflow === true && !rMain.timedOut && rOld.overflow === true && !rOld.timedOut && rOldR.timedOut === true && !rOldR.overflow,
    `the answer says it: the starter's process «overflow ${rMain.overflow}», its old road «overflow ${rOld.overflow}» (neither its timer); RED (the old road keeps the child running): timed out ${rOldR.timedOut}, overflow ${!!rOldR.overflow}`);
  // …and the probe reads `overflow` FIRST: a stderr past the bound whose first line names a 401 is no proof of a revoked share
  // (the child was cut); RED: a copy of src/mounts.js without that line ⇒ «denied» — a false «access denied» banner
  const OVF = "      if (r.overflow) return 'unknown';   // the output passed the bound: the child was ended (as execFile did) — no proof either way";
  mode('bigerr401');
  let ov1, ov1r;
  try { ov1 = await mmOf({ MountManager })._probeBackendAccess(REC.oauth, 2000); ov1r = await mmOf(MC.load('src/mounts.js', anchored(msrc, OVF + '\n', '', 'red-overflow-read'), 'red-overflow-read'))._probeBackendAccess(REC.oauth, 2000); } finally { mode('ok'); }
  ok(msrc.split(OVF).length === 2 && ov1 === 'unknown' && ov1r === 'denied', `a stderr past the bound that names a 401 first: «${ov1}»; RED (overflow not read first): «${ov1r}»`);

  console.log('⑦ its read (B-323e, TAKEN with smalls)');
  // (2) THE TEARDOWN GUARD: a hung listing whose backend probe got NO ANSWER is slow (the same listing still hung: the chain held),
  // never «unreachable», never a teardown — RED: no answer read as «hung» ⇒ unreachable
  const liveOf = async (M) => {
    const mm = mmOf(M);
    mm._probeMountpoint = async (_mp, _t, verb) => (verb === 'attr' ? { health: 'ok', ms: 1 } : { health: 'hung', ms: 6000, held: true });
    mm._probeBackendAccess = async () => 'unanswered';
    const mp = path.join(T, 'mnt-' + REC.hang.id), out = [];
    for (let i = 0; i < 3; i++) { const v = await mm._probeLiveness(REC.hang, mp); out.push({ verdict: v.verdict, teardown: !!v.teardown }); }
    return out;
  };
  const NOANS = "said === 'hung' ? 'hung' : 'skipped'";
  const lv1 = await liveOf({ MountManager }), lv1r = await liveOf(MC.load('src/mounts.js', anchored(msrc, NOANS, "(said === 'hung' || said === 'unanswered') ? 'hung' : 'skipped'", 'red-noanswer-hung'), 'red-noanswer-hung'));
  ok(lv1.every((v) => v.verdict === 'slow' && !v.teardown) && lv1r.some((v) => v.verdict === 'unreachable'), `a hung listing whose backend probe got no answer: ${lv1.map((v) => v.verdict).join(' / ')} over three sweeps, no teardown; RED (no answer read as «hung»): ${lv1r.map((v) => v.verdict).join(' / ')}`);
  // (3) the accept-encoding flag is never KEPT as false from a help text never read
  const aeOf = (M) => { const mm = mmOf(M); const a0 = mm._rcloneSupportsAcceptEncodingFlag(), kept0 = mm._rcloneAEFlag; mm._rcloneFlagsHelp = '--use-accept-encoding-gzip'; return { a0, kept0, a1: mm._rcloneSupportsAcceptEncodingFlag() }; };
  const AEG = "    if (this._rcloneFlagsHelp === undefined) return false;   // B-323e (its read):";
  const ae1 = aeOf({ MountManager }), ae1r = aeOf(MC.load('src/mounts.js', anchored(msrc, AEG, '    // (control) its read:', 'red-ae-kept'), 'red-ae-kept'));
  ok(ae1.a0 === false && ae1.kept0 === undefined && ae1.a1 === true && ae1r.kept0 === false && ae1r.a1 === false, `the help text not read yet: the flag is off for that call (${ae1.a0}) and NOT kept (${ae1.kept0}); read later: on (${ae1.a1}); RED (kept): «${ae1r.kept0}» for the process (${ae1r.a1})`);
  // (4) the panel's presence ask keeps «don't know» (null), and the panel says neither «expire» nor «stay valid» then; an act still asks the old way
  const mcOf = async (M) => { const mm = mmOf(M); mm._toolKnown = async () => null; return [await mm.mcAvailable(), await mm.mcAvailable({ act: true })]; };
  const PANEL = "    if (!act) return v;   // the panel's read:";
  const mc1 = await mcOf({ MountManager }), mc1r = await mcOf(MC.load('src/mounts.js', anchored(msrc, PANEL, '    if (!act) return v === true;   // (control):', 'red-panel-no'), 'red-panel-no'));
  const SBM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  const NOTE3 = "          : tr('Connected folders live under {base}.', { base: d.mountBase });";
  ok(mc1[0] === null && mc1[1] === true && mc1r[0] === false && SBM.split("note.textContent = d.mcAvailable === true").length === 2 && SBM.split(NOTE3).length === 2, `no answer: the panel's read is «${mc1[0]}» (not «no»), an act asks the old way (${mc1[1]}); the panel's third words say only where the folders live; RED (no answer read as «no»): «${mc1r[0]}» — the panel would say links expire while a mint may make one that does not`);
  // …the share dialog under «don't know» (the reader's M1; a DOM dialog, so PINS): the days asked only as a condition, the result says what was made
  const DLG = "...(mc === true ? [] : [{ key: 'expiryDays', label: mc === false ? tr('Link expires after (days, max 7)') : tr('Link expires after (days, max 7) — only if the server has no “mc” tool; with it, the link stays valid until you revoke it'), value: '7' }]),";
  const ENDS = "ends.textContent = r.share.expiresAt ? tr('This link expires on {date}.', { date: dateOf(r.share.expiresAt, { words: true }) }) : r.share.method === 'sts' ? '' : tr('This link stays valid until you revoke it.');";
  ok(SBM.split(DLG).length === 2 && SBM.split(ENDS).length === 2, 'PIN: the share dialog asks the days as a condition under «don\'t know» (null), plainly under «no mc», not at all under «mc»; its result says the link\'s date, or valid until revoked (never for an STS key)');
  // (5) the starter's OLD road (after two faults) starts the presence ask AND the flag text with the SERVICE env — never the hub's whole env
  const HUBSEC = ['VIBESPACE', 'STANDIN', 'OLDROAD', 'TO' + 'KEN'].join('_');
  const dumpTo = path.join(T, 'oldroad.env'), dumper = path.join(T, 'env-dump.sh');
  fs.writeFileSync(dumper, `#!/bin/sh\nenv > '${dumpTo}'\nexit 0\n`, { mode: 0o755 });
  const oldRoad = async (M, call = (mm) => mm._toolKnown('envprobe', dumper, [], 5000)) => {
    try { fs.rmSync(dumpTo, { force: true }); } catch { }
    process.env[HUBSEC] = SEC_VAL;
    const Q = CS.createChildStarter({ script: silent, guardMs: 50, log: { warn() { } } }); CS.setChildStarter(Q);
    try {
      await Q.run('true', [], { timeoutMs: 100 }); await Q.run('true', [], { timeoutMs: 100 });   // two faults ⇒ the old road
      await call(mmOf(M));
    } finally { Q.closePipe(); CS.setChildStarter(S); delete process.env[HUBSEC]; }
    const env = fs.existsSync(dumpTo) ? fs.readFileSync(dumpTo, 'utf8') : '';
    return { dumped: env.length > 0, hasSecret: env.includes(SEC_VAL), hasPath: /^PATH=/m.test(env) };
  };
  const SVC = "{ timeoutMs, env: serviceEnv(process.env), envAdd: { PATH: process.env.PATH || '' } })";
  const or1 = await oldRoad({ MountManager }), or1r = await oldRoad(MC.load('src/mounts.js', anchored(msrc, SVC, "{ timeoutMs, envAdd: { PATH: process.env.PATH || '' } })", 'red-oldroad-env'), 'red-oldroad-env'));   // stale-pins: kept (the RED plants the base's road back)
  ok(or1.dumped && or1.hasPath && !or1.hasSecret && or1r.dumped && or1r.hasSecret, `the starter's old road: the presence ask's child gets the service env (PATH ${or1.hasPath}, the hub's secret ${or1.hasSecret}); RED (no env handed): the hub's whole env, its secret in it (${or1r.hasSecret})`);
  // …the flag text's two help runs (the reader's S2: that half had no leg) — the stand-in rclone is the env dumper
  const FLAGS = 'maxBuffer: 4 * 1024 * 1024, env: serviceEnv(process.env), envAdd';
  const flagsCall = (mm) => { mm.rcloneBin = () => dumper; return mm._rcloneFlagsReady(5000); };
  const or2 = await oldRoad({ MountManager }, flagsCall), or2r = await oldRoad(MC.load('src/mounts.js', anchored(msrc, FLAGS, 'maxBuffer: 4 * 1024 * 1024, envAdd', 'red-oldroad-flags'), 'red-oldroad-flags'), flagsCall);   // stale-pins: kept (the RED plants the base's road back)
  ok(msrc.split(FLAGS).length === 2 && or2.dumped && or2.hasPath && !or2.hasSecret && or2r.dumped && or2r.hasSecret, `…and the flag text's help runs: the service env (PATH ${or2.hasPath}, the hub's secret ${or2.hasSecret}); RED (no env handed): the hub's whole env (${or2r.hasSecret})`);

  console.log('⑥ the spawn census row');
  const C = await import('./spawn-env-census.mjs');
  const wholeRed = (src, wholeRows = C.WHOLE_ROWS) => C.judge(C.scan(REPO, { files: ['src/mounts.js'], patch: { 'src/mounts.js': src } }), { wholeRows }).red.filter((l) => l.startsWith('WHOLE ENV'));
  const SECOND = "  _probeRootDenied(m) {\n    const { env } = this._rcloneFor(m);";
  const g6 = wholeRed(msrc), r6 = msrc.split(SECOND).length === 2 ? wholeRed(anchored(msrc, SECOND, SECOND + "\n    require('./server/child-starter').childStarter().run('true', [], { env, wholeEnv: true });", 'red-whole-unlisted')) : ['no plant'];
  const d6 = wholeRed(msrc, [...C.WHOLE_ROWS, ['src/mounts.js', '_probeRootDenied', 1, 'a dead row']]);
  ok(g6.length === 0 && C.WHOLE_ROWS.some((r) => r[0] === 'src/mounts.js' && r[1] === '_rcloneProbeRun' && r[2] === 1), `the whole env handed in _rcloneProbeRun is its row (${g6.length} findings)`, g6);
  ok(r6.length === 1 && r6[0].includes('UNLISTED') && r6[0].includes('_probeRootDenied') && d6.length === 1 && d6[0].includes('DEAD'), `RED: a second whole env with no row ⇒ «${(r6[0] || '').slice(0, 60)}…»; a row with no request ⇒ «${(d6[0] || '').slice(0, 40)}…»`, { r6, d6 });
} finally {
  console.warn = con.warn; console.error = con.error;
  try { S.closePipe(); } catch { }
  CP.ChildProcess.prototype.spawn = realSpawn; for (const k of Object.keys(realSync)) CP[k] = realSync[k];
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
report();
