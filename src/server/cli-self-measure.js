'use strict';
/**
 * THE HUB MEASURES A NEW CLAUDE CODE ITSELF (lane cli-self-measure, 2026-11-09). The owner, after his own update walled his
 * conversations for four days: «每次更新都要重新测量也太弱智了？这个用户体验是你觉得最好的方案吗？» — and his founding requirement
 * (2026-03-22, item 7): «使用原生claude code，确保claude code更新不需要重新更新本项目代码（除非claude code有breaking change…）».
 * Until now a CLI build the shipped fixture (scripts/fixtures/oat-in-file.json) did not name held every long-lived-token pool
 * member until a release carried that build's record. Now, at the first sight of a (version, binary sha256) with no PASS on
 * record, this module FORKS the release road's own measurement (src/claude-oat-probe.js — ONE implementation, its child
 * entry) with a timeout, never on the hub's loop, and keeps the answer in data/cli-self-measure.json (this file is its ONE
 * writer; writeJsonAtomic at every transition, so nothing waits for an exit flush):
 *   {schema: 1, binaries: {'<version>': {'<sha256>': {cli, sha256, size, path, probe, state: pass|fail|cannot-run|aborted,
 *    startedAt, gateAt, endedAt, gateMs, ms, gate: {variant: {verdict, note}}, variants: {…six}, evidence, reason: {code,
 *    observation}}}}} — at most VERSIONS_MAX versions (the one in use is kept); a damaged file is said once and read as empty
 *   (fail closed: nothing trusted, the probe runs again); a file that did not READ is never written (retried next tick).
 * THE HOLD LASTS AS LONG AS THE CHECK: the members stay held exactly as before (fail closed — law 2: nothing is placed under a
 * build without a PASS), the store says `checking` (its words: the pool card's one calm line, the roster's clause — no For-you
 * item inside the bound, ruling R2), and the GATE (oat-file, oat-file-401, oat-file-switch — ≈ 271 s measured on 2.1.321)
 * decides (ruling R1): PASS ⇒ the store places them (noteCliMeasured ⇒ the sweep) and `onMembersBack` fires the pool's ONE
 * edge for each returned member (usage-pool-engine onMemberReadingFresh: re-decide + the conversations waiting continue by
 * themselves). FAIL ⇒ the hold stays, the For-you item names WHICH observation differed; cannot-run / stopped ⇒ the same,
 * naming why. Bounds: late at 10 min (the item appears), killed at 20 min without a gate (cannot-run `timeout`; the gate's
 * own worst case is 17 min), the whole record at 30 min. A later variant that VOIDS the run or reaches off loopback revokes.
 * PACING (ruling R6): one run at a time; a FAIL never again for the same version + sha + PROBE_VERSION; cannot-run at the
 * next hub start or after 6 h; aborted never — and a person's «check again» (the item's press, POST
 * /api/accounts/cli-check-again, cookie only) runs it once more whatever the pacing. R4: every tick stats the file the
 * sessions spawn; a changed file asks the version clock (oat-file-sync) to read at once. Telemetry (ruling R5, the local
 * road): `cli-oat-measured` / `cli-oat-measure-fail` — version, sha256 and verdict codes only. Switch accounts.cliSelfMeasure
 * (default on); off ⇒ the release road only. Linux hubs (macOS / Windows CLIs key their keychain: oatFileCaps is false there).
 * ACCEPTANCE r1 → r2 (the laws this file keeps): A a ledger that does not READ is said once and read again no faster than the
 * tick — until it reads no PASS of its own is trusted and nothing is forked; I a PASS is THE JUDGE's (judgedPass: cli-caps
 * oatInFile over the record's three verdicts) under the CURRENT probe version — on the child's message, on a row read from the
 * file, after a probe bump (measured again, once) — never the child's boolean; C the child ends itself (its own deadline in
 * the job; on the hub's SIGTERM / disconnect it kills its tracer groups — the KERNEL ends every tracee with them (strace
 * --kill-on-exit), and a SIGKILLed child takes its tracer with it (setpriv --pdeathsig) — and removes its run dir) —
 * the exit handler here sends SIGTERM so that cleanup runs; G the PASS edge is fired PLACEABLE (usage-pool-engine
 * onMemberReadingFresh: the member's eligibility changed, not its reading), `onCheckEnded` re-says every armed conversation's
 * status, and global.__vsCliCheckingNow answers which run is checking (auto-resume liveCause); smaller: a press while a run is
 * in flight starts nothing ({already, leftMin}); stop() leaves the ledger's view, never «checking». The fork below is a
 * `literal` site of the spawn-env census (test-architecture §94; RED with its env removed — test-cli-self-measure).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { writeJsonAtomic } = require('../channel-store.js'); // the ONE atomic data/*.json writer
const { cliVersionOf, OAT_IN_FILE_GATE, oatInFile, MINT_VARIANT, scopesOk } = require('../cli-caps.js'); // PURE — oatInFile is THE judge (law I)
const PROBE = require('../claude-oat-probe.js'); // SHARED: its constants here; the measurement itself runs only in the forked child

const TYPICAL_MS = 271e3;          // the gate on 2.1.321, this box, 2026-11-09 (the hotfix lane's record: 68 + 70 + 133 s)
const LATE_MS = 10 * 60e3;         // past this the check is late: the For-you item appears
const KILL_MS = 20 * 60e3;         // no gate by now ⇒ cannot-run `timeout` (the gate's worst case: 17 min, every turn timing out)
const RECORD_MS = 30 * 60e3;       // the whole record (the three behind the gate)
const RETRY_MS = 6 * 3600e3;       // a cannot-run is retried after this (or at the next hub start)
const TICK_MS = 60e3;              // law A: a ledger that did not read is read again no faster than this (the engine's tick)
const VERSIONS_MAX = 20;
// every check this process forked: a hub that exits takes them with it (the child also watches its IPC: a parent gone ⇒ it ends)
const LIVE_CHILDREN = new Set();
process.on('exit', () => { for (const c of LIVE_CHILDREN) { try { c.kill('SIGTERM'); } catch { } } }); // law C: SIGTERM — the child's own cleanup runs (killAll of its groups and tracked pids, its scratch removed); a SIGKILL skipped it
const STATES = Object.freeze(['pass', 'fail', 'cannot-run', 'aborted']);
// the probe's refusals the person can act on keep their name; the rest are «could not set itself up»
const OWN_REASONS = new Set(['scratch', 'no-strace', 'strace-denied', 'strace-old', 'no-setpriv', 'managed-settings', 'remote-token', 'foreign-token', 'guarded-read', 'trace-unparsed', 'trace-unfinished', 'trace-oversize', 'launcher-changed', 'door', 'child-killed', 'timeout']);
const reasonOf = (code) => (OWN_REASONS.has(code) ? code : 'setup');
/** what the failing gate variant SAW, as a code (cli-caps OBSERVATIONS words it) */
function observationOf(gate) {
  for (const g of OAT_IN_FILE_GATE) {
    const r = gate && gate[g];
    if (!r || r.verdict === 'PASS') continue;
    const n = String(r.note || '');
    if (/FILE CHANGED/.test(n)) return 'rewrote';
    if (/[1-9]\d* refresh calls?/.test(n)) return 'refresh';
    if (g === 'oat-file-401' && /did NOT recover/.test(n)) return 'no-recover';
    if (g === 'oat-file-switch') return 'no-follow';
    return 'not-the-token';
  }
  return 'not-the-token';
}
// THE RUN LIVES OUTSIDE EVERY GUARDED ROOT (the incident of 2026-11-11 on the owner's hub: a hub whose checkout lives in the home has its data/ there, so the run's
// scratch was too — node, starting the trampoline there, walked up for a package.json and opened the checkout's own, inside the
// fence's deny root, and every run voided `guarded-read` in half a second, before the binary did anything; the CLI's own walk up
// from its cwd — CLAUDE.md, AGENTS.md, .claude/, .mcp.json, .git at every ancestor, measured in the clean 2.1.321 trace — was next).
// The hub's own choice of where a run lives can never void it: a fresh private directory (0700, its name this hub's) under the
// first base whose REAL path lies outside the person's home and the data dir — the runtime dir, then the system temp — and none ⇒
// cannot-run `scratch`, said by name. The data dir keeps only the record. A credential store the CLI reads still voids
const inside = (p, d) => { const a = path.resolve(p), b = path.resolve(d); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };
const realOrP = async (p) => { try { return await fs.promises.realpath(p); } catch { return path.resolve(p); } };
const READS_MAX = 8;
/** the guarded paths a void record names (the version run's and every variant's), at most 8, the home said as ~ */
function readsOf(record, home = PROBE.REAL_HOME) {
  const all = [...((record && record.versionRun && record.versionRun.guardedReads) || []), ...((record && Array.isArray(record.results) ? record.results : []).flatMap((r) => (r && r.guardedReads) || []))];
  const tilde = (p) => (home && inside(p, home) ? '~' + String(p).slice(path.resolve(home).length) : String(p));
  return [...new Set(all.map((p) => tilde(String(p)).slice(0, 160)))].slice(0, READS_MAX);
}
const verdictCodes = (gate) => OAT_IN_FILE_GATE.map((g) => `${g} ${(gate && gate[g] && gate[g].verdict) || 'MISSING'}`).join(' · ');

function create({ accounts = () => null, dataDir, enabled = () => true, onMembersBack = () => { }, onCheckEnded = () => { }, app = null, log = (...a) => console.log(...a),
  event = (n, d) => global.__vsEvent?.(n, d), now = () => Date.now(), forkFn = null, probePath = require.resolve('../claude-oat-probe.js'),
  statIdentity = (cmd) => require('../machine-probes.js').cliBinaryIdentity(cmd), platform = process.platform, job = {}, bounds = {},
  scratchBases = () => [process.env.XDG_RUNTIME_DIR, os.tmpdir(), '/tmp', '/var/tmp'].filter(Boolean), home = PROBE.REAL_HOME } = {}) {
  if (!dataDir) throw new Error('cli-self-measure: dataDir is required');
  const file = path.join(dataDir, 'cli-self-measure.json');
  const scratchRoot = path.join(dataDir, 'cli-self-measure'); // .393's run dirs (swept); a run lives under scratchBase() now
  const HUBTAG = crypto.createHash('sha256').update(path.resolve(dataDir)).digest('hex').slice(0, 8); // two hubs never sweep each other's runs
  const RUN_PREFIX = `cli-self-measure-${HUBTAG}-run-`;
  /** the first base whose real path lies outside the person's home and the data dir, or null (above) */
  async function scratchBase() {
    const deny = await Promise.all([...new Set([PROBE.REAL_HOME, home, dataDir].filter(Boolean))].map(realOrP));
    for (const b of scratchBases()) {
      const rb = await realOrP(b);
      try { if (!(await fs.promises.stat(rb)).isDirectory()) continue; } catch { continue; }
      if (deny.some((d) => inside(rb, d))) continue;
      return rb;
    }
    return null;
  }
  const B = { late: LATE_MS, kill: KILL_MS, record: RECORD_MS, retry: RETRY_MS, typical: TYPICAL_MS, tick: TICK_MS, ...bounds };
  const lifeStart = now();
  // law G4: the live answer every reader of an arm's `checking` facet asks (auto-resume liveCause) — this run, still checking, or null
  global.__vsCliCheckingNow = () => (run && !run.settled ? { cli: run.cli, startedAt: run.startedAt } : null);
  let ledger = { schema: 1, binaries: {} }, read = false, damagedSaid = false, loading = null;
  let readFail = null, readFailSaid = false; // law A: {code, at} of the last failed read — said ONCE per spell, retried no faster than the tick
  let run = null;           // {cli, sha, path, child, startedAt, gateAt, timer, attended, root, err}
  let viewKey = null;

  // ── the ledger ──
  function load() {
    if (read) return Promise.resolve(true);
    if (loading) return loading;
    loading = fs.promises.readFile(file, 'utf8').then((txt) => {
      let j = null; try { j = JSON.parse(txt); } catch { j = null; }
      const ok = j && typeof j === 'object' && j.binaries && typeof j.binaries === 'object' && !Array.isArray(j.binaries);
      if (!ok) { if (!damagedSaid) { damagedSaid = true; log(`[cli-self-measure] ${file} is damaged — read as empty (nothing trusted from it; a new CLI is checked again)`); } ledger = { schema: 1, binaries: merged({}) }; }
      else ledger = { schema: 1, binaries: merged(j.binaries) };
      read = true; readFail = null; readFailSaid = false; return true;
    }, (e) => {
      if (e && e.code === 'ENOENT') { ledger = { schema: 1, binaries: merged({}) }; read = true; readFail = null; readFailSaid = false; return true; }
      readFail = { code: (e && e.code) || String(e), at: now() };
      if (!readFailSaid) { readFailSaid = true; log(`[cli-self-measure] ${file} did not read (${readFail.code}) — until it does, nothing is placed on this hub's own measurement and nothing is checked; read again at the tick`); }
      return false;
    }).finally(() => { loading = null; });
    return loading;
  }
  // what this process noted before the file read is kept on top of it
  let pending = {};
  const merged = (fromFile) => { const out = {}; for (const [v, m] of Object.entries(fromFile)) if (cliVersionOf(v) === v && m && typeof m === 'object') out[v] = { ...m }; for (const [v, m] of Object.entries(pending)) out[v] = { ...(out[v] || {}), ...m }; pending = {}; return out; };
  // THE JUDGE (law I) — the ONE predicate a PASS is: cli-caps oatInFile over the gate's three verdicts for exactly this version, by
  // the probe version that runs today; used on the child's message, on a row read from the file, and after a bump
  const judgedPass = (v, r) => !!r && Number(r.probe) === PROBE.PROBE_VERSION && oatInFile(v, { versions: { [v]: { cliVersion: v, variants: (r.gate && typeof r.gate === 'object') ? r.gate : {} } } });
  const recOf = (v, sha) => { const m = ledger.binaries[v]; const r = m && m[sha]; return r && STATES.includes(r.state) ? r : null; };
  function keep(v, sha, rec) {
    if (!read) { pending[v] = { ...(pending[v] || {}), [sha]: rec }; return; }
    ledger.binaries[v] = { ...(ledger.binaries[v] || {}), [sha]: rec };
    const vs = Object.keys(ledger.binaries).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    while (vs.length > VERSIONS_MAX) { const drop = vs.find((x) => x !== v); if (!drop) break; delete ledger.binaries[drop]; vs.splice(vs.indexOf(drop), 1); }
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(file, ledger); } catch (e) { log(`[cli-self-measure] could not keep ${file}: ${(e && e.message) || e}`); }
  }

  // ── the store's view (the words read it) ──
  function setView(view) {
    const acc = accounts(); if (!acc || typeof acc.noteCliMeasured !== 'function') return;
    const k = JSON.stringify(view);
    if (k === viewKey) return;
    viewKey = k;
    acc.noteCliMeasured(view);
  }
  // the mint's scopes ride the view (lane oat-add-door): a PASS of the variant for exactly these bytes, re-checked by the grammar
  const mintOf = (r) => { const m = r && r.variants && r.variants[MINT_VARIANT]; return m && m.verdict === 'PASS' ? scopesOk(m.scopes) : null; };
  const viewOfRec = (v, sha, r) => { const sc = mintOf(r); return { cli: v, sha256: sha, state: r.state, startedAt: r.startedAt || null, ...(r.reason ? { reason: r.reason } : {}), ...(sc ? { mintScopes: sc } : {}) }; };
  const checkingView = (r) => ({ cli: r.cli, sha256: r.sha, state: 'checking', startedAt: r.startedAt, lateAt: r.startedAt + B.late, killAt: r.startedAt + B.kill, typicalMs: B.typical });

  // ── the decision (synchronous: the store's note hook calls it inside noteCliVersion, so the words never lag the hold) ──
  function decide(caps, { attended = false } = {}) {
    const acc = accounts();
    if (!acc || !caps || !caps.known || !caps.cli || caps.cli === 'unparsed') return { state: 'none' };
    if (caps.ok && !caps.local) { if (run) stopRun('the fixture names this build'); return { state: 'fixture' }; }
    if (platform === 'darwin' || platform === 'win32') return { state: 'none' };
    const bin = typeof acc.cliBinary === 'function' ? acc.cliBinary() : null;
    if (!bin || !bin.sha256) return { state: 'none' };
    const v = cliVersionOf(caps.cli), sha = bin.sha256;
    if (!v) return { state: 'none' };
    if (!enabled()) { if (run) stopRun('the switch is off'); setView(null); return { state: 'off' }; } // off = the release road only
    // the ledger first: a note before it read (a boot) decides once it has — never a run over a PASS already on file
    if (!read) {
      // LAW A: an unreadable ledger never loops — no PASS of its own is trusted (the view cleared), nothing is forked, and the read
      // is retried by the TICK (no faster than B.tick); only a read that SUCCEEDS decides again
      setView(null);
      if (!loading && (!readFail || now() - readFail.at >= B.tick)) load().then((ok) => { if (!ok) return; try { const a = accounts(); if (a) decide(a.oatFileCaps(), { attended }); } catch { } });
      return { state: readFail ? 'unreadable' : 'loading' };
    }
    if (run && (run.cli !== v || run.sha !== sha)) stopRun('the CLI moved on');
    if (run && !run.settled) { setView(checkingView(run)); return { state: 'checking' }; }
    // LAW I: a PASS is the JUDGE's over the row's own gate under THIS probe — at load and after a probe bump too. A row that says
    // pass over a gate the judge refuses, or written by another probe version, is no PASS: measured again, once
    const onFile = recOf(v, sha);
    const stale = !!onFile && onFile.state === 'pass' && !judgedPass(v, onFile);
    const rec = stale ? null : onFile;
    if (rec && rec.state === 'pass') { setView(viewOfRec(v, sha, rec)); return { state: 'pass' }; }
    const due = attended || !rec
      || ((rec.state === 'fail' || rec.state === 'cannot-run') && Number(rec.probe) < PROBE.PROBE_VERSION) // a probe that changed measures again at once — a cannot-run of the hub's own setup too (the incident)
      || (rec.state === 'cannot-run' && (Number(rec.endedAt) < lifeStart || now() - Number(rec.endedAt) >= B.retry));
    if (!due) { setView(viewOfRec(v, sha, rec)); return { state: rec.state }; }
    // nothing to place ⇒ nothing to measure: a hub holding no long-lived token never forks the check (a token added later is seen by the next tick)
    if (typeof acc.hasLongLivedTokens === 'function' && !acc.hasLongLivedTokens()) return { state: 'none' };
    // …and nothing HELD ⇒ nothing to measure either: no check, no refusal, no word to anyone it does not concern (主开发's condition 1)
    if (typeof acc.cliUnmeasuredMembers === 'function') { let held = []; try { held = acc.cliUnmeasuredMembers() || []; } catch { held = []; } if (!held.length) return { state: 'none' }; }
    if (run) stopRun(null); // a settled run still completing its record behind a FAIL: the person asked again
    if (stale) log(`[cli-self-measure] Claude Code ${v}: the PASS on file is not one the judge gives under probe ${PROBE.PROBE_VERSION} (probe ${onFile.probe}, gate ${verdictCodes(onFile.gate)}) — measured again`);
    start(v, sha, bin.path, attended);
    return { state: 'checking' };
  }

  // ── one run ──
  function start(v, sha, binPath, attended) {
    const startedAt = now();
    const runName = `${RUN_PREFIX}${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    run = { cli: v, sha, path: binPath, startedAt, gateAt: null, attended, root: null, child: null, timer: null, err: '', gate: null };
    setView(checkingView(run));
    log(`[cli-self-measure] Claude Code ${v} (sha256 ${sha.slice(0, 12)}…) has no PASS on record — checking it on this machine${attended ? ' (asked by the owner)' : ''}: the gate in about ${Math.round(B.typical / 60e3)} min, at most ${Math.round(B.kill / 60e3)}`);
    const me = run;
    sweepScratch(runName).then(() => scratchBase()).then((base) => {
      if (run !== me) return;
      if (!base) { finish(me, { state: 'cannot-run', reason: { code: 'scratch', observation: `no private folder outside the home and the data dir among ${scratchBases().join(', ')}` } }); return; }
      const root = path.join(base, runName); me.root = root;
      try {
        fs.mkdirSync(root, { mode: 0o700 }); // NOT recursive: it throws when anything is already there — the run's folder is always one it made
        for (const d of [path.join(root, 'home0'), path.join(root, 'tmp')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
        // THE CHILD'S ENV IS A LITERAL (law 3 — the spawn-env census, test-architecture §94, reads this fork as a `literal` site; the
        // suite's forkFn is a parameter, never an alias of it): the node dir + /usr/bin + /bin, a scratch HOME — nothing
        // of the hub's own env (its proxies, its tokens, its CLAUDE_* names) reaches the measurement
        // NOT the hub's own node flags (execArgv: []): a `-r` preload or an inspector the hub runs under never rides into the
        // measurement (test-billing-badge-live's -r hook did, and stole its commands). A suite injects forkFn with the same options.
        const child = forkFn ? forkFn(probePath, [], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(root, 'home0'), LANG: 'C.UTF-8', TMPDIR: path.join(root, 'tmp') }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'json', execArgv: [] })
          : fork(probePath, [], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(root, 'home0'), LANG: 'C.UTF-8', TMPDIR: path.join(root, 'tmp') }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'json', execArgv: [] });
        me.child = child; LIVE_CHILDREN.add(child); child.on('exit', () => LIVE_CHILDREN.delete(child));
        child.on('error', (e) => { me.err += `spawn: ${(e && e.message) || e}\n`; });
        if (child.stderr) child.stderr.on('data', (d) => { me.err = (me.err + d).slice(-4000); });
        child.on('message', (m) => { try { onMessage(me, m); } catch (e) { log('[cli-self-measure] a message from the check failed:', (e && e.message) || e); } });
        child.on('exit', (code, sig) => onExit(me, code, sig));
        child.send({ claude: binPath, root: path.join(root, 'm'), runDir: root, dataDir, ...(home && home !== PROBE.REAL_HOME ? { home } : {}), deadline: startedAt + B.record + 30e3, variants: [...PROBE.RUN_ORDER, MINT_VARIANT], forbid: forbidDirs(), ...job }); // + the mint's scopes LAST (lane oat-add-door): never in the gate // law C: the child's own deadline
        me.timer = setTimeout(() => timeUp(me), B.kill); if (me.timer.unref) me.timer.unref();
      } catch (e) { finish(me, { state: 'cannot-run', reason: { code: 'setup', observation: String((e && e.message) || e).slice(0, 200) } }); }
    });
  }
  // the person's ~/.claude, the members' folders, the vault: the scratch may never meet them (law 3 G2 / P4)
  const forbidDirs = () => PROBE.credentialRoots({ dataDir }); // law E: the credential stores under the REAL home and the data dir (data/vault.json, codex-subs, … — the module's one list)
  async function sweepScratch(keepName) {
    // .393's run dirs in data/, then this hub's own leftovers under every base — a directory it made (its uid, never a link)
    let names = []; try { names = await fs.promises.readdir(scratchRoot); } catch { names = []; }
    for (const n of names) { if (/^run-/.test(n)) { try { await fs.promises.rm(path.join(scratchRoot, n), { recursive: true, force: true }); } catch { } } }
    for (const b of scratchBases()) {
      let here = []; try { here = await fs.promises.readdir(b); } catch { continue; }
      for (const n of here) {
        if (!n.startsWith(RUN_PREFIX) || n === keepName) continue;
        const p = path.join(b, n);
        try { const st = await fs.promises.lstat(p); if (st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid()) await fs.promises.rm(p, { recursive: true, force: true }); } catch { }
      }
    }
  }
  function timeUp(me) {
    if (run !== me) return;
    if (!me.gateAt) { log(`[cli-self-measure] Claude Code ${me.cli}: no gate after ${Math.round(B.kill / 60e3)} min — stopped (cannot-run timeout)`); stopRun('timeout', { state: 'cannot-run', reason: { code: 'timeout', observation: '' } }); return; }
    log(`[cli-self-measure] Claude Code ${me.cli}: the record behind the gate did not complete — stopped, the gate's verdict stands`); stopRun('record-timeout');
  }
  function onMessage(me, m) {
    if (run !== me || !m || typeof m !== 'object') return;
    if (m.type === 'gate' && m.gate) {
      const g = m.gate;
      me.gate = g; me.gateAt = now();
      if (cliVersionOf(g.cli) !== me.cli || g.sha256 !== me.sha) { stopRun('the binary changed during the check', { state: 'cannot-run', reason: { code: 'setup', observation: 'the binary changed during the check' } }); return; }
      me.settled = true; // the gate decided: the record completes behind it, the store's view is the verdict's
      // LAW I: the hub places on THE JUDGE — cli-caps oatInFile over the gate's own three verdicts for exactly this version — never
      // on the child's `pass` boolean (a message pass:true with gate:{} placed members in r1)
      const judged = !g.void && !g.aborted && judgedPass(me.cli, { probe: PROBE.PROBE_VERSION, gate: g.gate });
      if (judged) {
        const rec = recordBase(me, { state: 'pass', gate: g.gate, gateMs: Number(g.ms) || (me.gateAt - me.startedAt) });
        keep(me.cli, me.sha, rec);
        try { event('cli-oat-measured', `claude ${me.cli} · sha256 ${me.sha} · ${verdictCodes(g.gate)}`); } catch { }
        log(`[cli-self-measure] Claude Code ${me.cli}: PASS on this machine in ${Math.round(rec.gateMs / 1000)} s (${verdictCodes(g.gate)}) — the held members are placed again`);
        placeBack(viewOfRec(me.cli, me.sha, rec));
        clearTimeout(me.timer); me.timer = setTimeout(() => timeUp(me), Math.max(1000, B.record - (now() - me.startedAt))); if (me.timer.unref) me.timer.unref();
        return; // the record completes behind it
      }
      const state = g.aborted ? 'aborted' : g.void ? 'cannot-run' : 'fail'; // (a child that said pass:true over verdicts the judge refuses is a fail)
      const reason = state === 'fail' ? { code: observationOf(g.gate), observation: verdictCodes(g.gate) } : state === 'cannot-run' ? { code: reasonOf(g.void), observation: '' } : { code: 'aborted', observation: '' };
      settle(me, { state, gate: g.gate, gateMs: Number(g.ms) || null, reason });
      return;
    }
    if (m.type === 'record' && m.record) { onRecord(me, m.record); return; }
    if (m.type === 'refused') { finish(me, { state: 'cannot-run', reason: { code: reasonOf(m.code), observation: String(m.detail || '').slice(0, 200), ...(typeof m.version === 'string' ? { version: m.version.slice(0, 20) } : {}), ...(m.machine === 'image' || m.machine === 'managed' ? { machine: m.machine } : {}) } }); return; }
    if (m.type === 'error') { finish(me, { state: 'cannot-run', reason: { code: 'setup', observation: String(m.message || '').slice(0, 200) } }); }
  }
  const recordBase = (me, extra) => ({ cli: me.cli, sha256: me.sha, path: me.path, probe: PROBE.PROBE_VERSION, startedAt: me.startedAt, gateAt: me.gateAt, endedAt: now(), ...extra });
  function onRecord(me, record) {
    // the six + the mint's scopes (lane oat-add-door: its PASS keeps the scopes it read — the guided door's way ② for exactly these bytes)
    const six = {}; for (const r of Array.isArray(record.results) ? record.results : []) if (r && r.variant) { const sc = r.variant === MINT_VARIANT && r.verdict === 'PASS' ? scopesOk(r.scopes) : null; six[r.variant] = { verdict: r.verdict, note: String(r.note || '').slice(0, 600), ...(sc ? { scopes: sc } : {}) }; }
    const of = (record.results || []).find((x) => x && x.variant === 'oat-file');
    const evidence = {
      bearer: of ? `${(of.heads || []).filter((h) => /<O oat>/.test(String(h.headers && h.headers.authorization))).length}/${(of.heads || []).length} of oat-file's requests carried the file's token` : null,
      refreshCalls: (record.results || []).reduce((k, r) => k + ((r && r.steps) || []).reduce((j, s) => j + ((s.oauth || []).filter((o) => /^refresh/.test(o)).length), 0), 0),
      mock: { escapesRefused: (record.escapes || []).length, foreignTokens: Number(record.foreignTokens) || 0 },
      belt: { tool: record.belt || null, offLoopback: record.aborted ? record.aborted.length : 0 }, canaries: record.canaries || null, size: record.binary && record.binary.size,
    };
    const was = recOf(me.cli, me.sha);
    // a later variant that VOIDS the run or reaches off loopback revokes even a PASS (the fences did not hold: nothing is proven)
    if (record.aborted || record.void) {
      // THE RECORD KEEPS WHAT WAS READ (the incident: nothing kept which path voided the run): the guarded paths, ≤ 8, ~ for the home
      settle(me, { state: record.aborted ? 'aborted' : 'cannot-run', gate: (me.gate && me.gate.gate) || null, variants: six, evidence, ms: Number(record.ms) || null, reason: record.aborted ? { code: 'aborted', observation: '' } : { code: reasonOf(record.void), observation: readsOf(record, home).join(', ') } });
      return;
    }
    if (was && was.state === 'pass') { const full = { ...was, variants: six, evidence, ms: Number(record.ms) || null, endedAt: now() }; keep(me.cli, me.sha, full); stopRun(null); setView(viewOfRec(me.cli, me.sha, full)); return; } // the view gains the mint's scopes (lane oat-add-door)
    if (record.gate && !me.gate) { onMessage(me, { type: 'gate', gate: record.gate }); if (run === me) onRecord(me, record); return; }
    if (was) { keep(me.cli, me.sha, { ...was, variants: six, evidence, ms: Number(record.ms) || null }); stopRun(null); return; }
    finish(me, { state: 'cannot-run', reason: { code: 'setup', observation: 'the check ended without a verdict' } });
  }
  function settle(me, rec) {
    me.settled = true;
    const full = recordBase(me, rec);
    keep(me.cli, me.sha, full);
    try { event('cli-oat-measure-fail', `claude ${me.cli} · sha256 ${me.sha} · ${full.state}${full.reason ? ` ${full.reason.code}` : ''}${full.gate ? ` · ${verdictCodes(full.gate)}` : ''}`); } catch { }
    const first = full.reason && full.reason.observation ? String(full.reason.observation).split(', ')[0] : '';
    log(`[cli-self-measure] Claude Code ${me.cli}: ${full.state}${full.reason ? ` (${full.reason.code}${first ? `: ${first}` : ''})` : ''} — the members it would place stay held; For you says what differed and has Check again`);
    setView(viewOfRec(me.cli, me.sha, full));
    try { onCheckEnded(full.state); } catch { } // law G4: every armed conversation's chip drops «checking» now
    if (full.state !== 'fail' || !me.child) stopRun(null); // a FAIL lets the record complete behind it (the lane it opens reads it)
  }
  const finish = (me, rec) => { if (run !== me) return; settle(me, rec); stopRun(null); };
  function onExit(me, code, sig) {
    if (run !== me) return;
    if (me.gateAt && recOf(me.cli, me.sha)) { stopRun(null); return; }
    // a child KILLED from outside (out of memory, a person) is said as that (acceptance r3 item 10) — the kernel took what it started
    finish(me, { state: 'cannot-run', reason: { code: sig === 'SIGKILL' ? 'child-killed' : 'setup', observation: `the check ended (${sig || `exit ${code}`}) without a verdict${me.err ? ` — ${me.err.trim().split('\n').slice(-1)[0].slice(0, 160)}` : ''}` } });
  }
  function stopRun(why, settleAs = null) {
    const me = run; if (!me) return;
    if (settleAs) { settle(me, settleAs); if (run !== me) return; }
    run = null;
    clearTimeout(me.timer);
    const c = me.child;
    if (c && c.exitCode == null && !c.killed) { try { c.kill('SIGTERM'); } catch { } const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 5000); if (t.unref) t.unref(); }
    if (why && why !== 'record-timeout') log(`[cli-self-measure] the check of Claude Code ${me.cli} stopped: ${why}`);
    if (me.root) setTimeout(() => { fs.promises.rm(me.root, { recursive: true, force: true }).catch(() => { }); }, 6000).unref?.();
  }
  async function placeBack(view) {
    const acc = accounts(); if (!acc) return;
    let ids = [];
    try { ids = (acc.cliUnmeasuredMembers() || []).map((m) => m.id); } catch { ids = []; }
    setView(view);
    try { await acc.oatFileSettled(); } catch { }
    try { onMembersBack(ids); } catch (e) { log('[cli-self-measure] the pool edge failed:', (e && e.message) || e); }
    try { onCheckEnded('pass'); } catch { }
  }

  // ── the 60 s tick (the pool engine's interval) ──
  async function tick() {
    if (!read && (!readFail || now() - readFail.at >= B.tick)) await load(); // law A: at most one read per tick
    const acc = accounts(); if (!acc || typeof acc.oatFileCaps !== 'function') return null;
    // R4: the file the sessions spawn changed (a new install, a re-pointed link) ⇒ the version clock reads it NOW
    const bin = typeof acc.cliBinary === 'function' ? acc.cliBinary() : null;
    if (bin && (bin.cmd || bin.path)) {
      let id = null; try { id = await statIdentity(bin.cmd || bin.path); } catch { id = null; }
      if (id && id.identity !== bin.identity) { try { await acc.recheckCli(); } catch { } }
    }
    return decide(acc.oatFileCaps());
  }
  /** a person's «check again» (the For-you item's press): attended — runs once more whatever the pacing (ruling R6) */
  async function checkAgain() {
    if (!read) await load();
    const acc = accounts(); if (!acc) return { state: 'none' };
    // a press while a check RUNS starts nothing: it says how long is left (small 1)
    if (run && !run.settled) return { state: 'checking', already: true, leftMin: Math.max(1, Math.ceil((run.startedAt + B.typical - now()) / 60e3)) };
    try { await acc.recheckCli(); } catch { }
    return decide(acc.oatFileCaps(), { attended: true });
  }
  // the store's note hook: the decision rides the version clock's own note (no lag between the hold and its words); the store
  // is created after the engine in boot order, so the hook is installed as soon as it exists
  const hook = () => { let a = null; try { a = accounts(); } catch { a = null; } if (!a || typeof a.setCliNoteHook !== 'function') return false; a.setCliNoteHook((caps) => { decide(caps); }); return true; };
  if (!hook()) { const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 1000); if (iv.unref) iv.unref(); }
  if (app && typeof app.post === 'function') {
    // THE OWNER'S PRESS (cookie only — an agent's bearer is refused: the person fixed something and asks; an agent may not)
    app.post('/api/accounts/cli-check-again', async (req, res) => {
      if (/^Bearer\s+(vsst_|jbt_|vsak_)/i.test(String((req.headers && req.headers.authorization) || ''))) return res.status(403).json({ error: 'only the owner can ask for this check again', code: 'agent_forbidden' });
      try { const r = await checkAgain(); if (r && r.state === 'unreadable') return res.status(503).json({ error: 'the check\'s record on this machine (data/cli-self-measure.json) did not read — the journal says why', code: 'ledger_unreadable' }); res.json({ ok: true, ...r }); } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
    });
  }
  load();
  const stop = () => { const me = run; stopRun('stopped'); if (me) { const rec = recOf(me.cli, me.sha); setView(rec ? viewOfRec(me.cli, me.sha, rec) : null); } }; // small 2: never left at «checking»
  return { tick, checkAgain, decide, state: () => ({ read, readFail, running: run ? { cli: run.cli, sha256: run.sha, startedAt: run.startedAt, gateAt: run.gateAt } : null, ledger: JSON.parse(JSON.stringify(ledger)) }), stop, file };
}

module.exports = { create, observationOf, TYPICAL_MS, LATE_MS, KILL_MS, RECORD_MS, RETRY_MS, VERSIONS_MAX };
