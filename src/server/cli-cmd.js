'use strict';
// THE AGENT-CLI COMMAND PATHS AND THEIR SPAWN-TIME RE-RESOLVE (B-a18e).
//
// node-pty's posix_spawnp may not find a command whose directory is missing
// from Node's inherited PATH (Homebrew/nvm), so every CLI is resolved to an
// absolute path at BOOT — `resolveCmd`, once per command name. That made the
// boot instant the only moment the answer was ever asked for: an Update
// restart that landed inside an installer's window ("old version deleted, new
// one not yet placed", a fleet instance, 2026-08-11) pinned a path that no
// longer existed, and EVERY spawn failed until somebody restarted again.
//
// `forSpawn(backend, cmd)` is the ONE spawn-time check every local session
// spawn passes through (the pty terminal, the chat wrapper and the daemon
// pipe all run the same argv, built in src/ws-create.js): the resolved path
// still executable ⇒ untouched (one `access`, no process); gone ⇒ the CLI is
// looked up ONCE more, the new path is adopted by the adapter (so later spawns are
// born right) and ONE log line names the old and the new path — creates that
// arrive together in that window share the one lookup; nothing found ⇒ the
// create is REFUSED by name (lane cli-shell-truth, below — it used to spawn the
// dead path «as before» and die in silence). The
// spawned CLI runs INSIDE a wrapper under dtach, so its ENOENT is never seen by
// this process — the check before the spawn IS the retry.
//
// `check(backend, { reask, force })` is THE READ-TIME twin (lane antigravity-card-fixes,
// the owner 2026-10-20: Manage agents said 「Antigravity CLI 未安装」 for an agy
// installed five minutes after the hub booted — the boot answer was the only one
// ever asked for, and a READ never spawns). A resolved path is re-validated on
// every read (one `access`), so an uninstall shows; an unresolved or gone one is
// looked up again at most once per RECHECK_MS per CLI (one `which`) — unless the
// read is a person's (Install / Re-check in Manage agents: `reask`). A path found
// is ADOPTED exactly like a spawn-time re-resolve (the adapter gets it, one log
// line), and the shared lookup is single-flight with forSpawn's. Lane cli-shell-truth round 2: a person's press is
// `reask` (the shell asked now); `force` is a non-person fresh read (never a shell run on a usable path).
//
// THE PERSON'S LOGIN SHELL IS THE TRUTH FOR WHERE A CLI IS (lane cli-shell-truth, B-fb02; the owner 2026-11-03: a codex
// installed with `npm -g` under nvm's node v24.12.0 while the hub's systemd unit baked a PATH with v24.22.1/bin only —
// the boot `which` found nothing, every codex spawn died ~30 s later and the UI said NOTHING, while `command -v codex` in
// the owner's own zsh found it at once). No registry, no pinned versions, no managed prefix, no list of install methods
// (the owner refused all of them twice: a hand-kept source of truth goes stale, and a person installs however they like).
// The rungs, and the provenance each answer carries:
//   'hub-path' — the boot's cheap `which` + dir walk: the PROVISIONAL answer (§19: the shell is never asked at boot);
//   'shell'    — `askShell`: the person's login shell, asked ONCE per CLI, lazily (the first spawn or the first status
//                read), bounded (SHELL_ASK_MS), in a sanitized env, read between sentinels. Its path REPLACES the
//                provisional one even when that one works (their PATH order is their choice). Asked again when its path
//                has gone, at a person's Re-check (`reask`), and at each create while it found nothing;
//   'boot'     — an absolute command the operator configured (CLAUDE_CMD=/x): that path, never a lookup.
// The shell holds NO PROGRAM (round 2: an alias / a function wearing the name is the person's own wrapper — the program
// behind it is the answer; only a wrapper with no program behind it counts as nothing) ⇒ the CLI is MISSING for every purpose: a create is REFUSED by name
// before anything spawns (`forSpawn` throws a CliMissing — ws-create answers `cli-missing`), a status read says not
// installed; what the hub's own walk saw is a HINT («add that directory to your shell's PATH»), never a spawn. The shell
// could not be ASKED (timeout, exit, spawn error) ⇒ the provisional path stays and the degradation is NAMED — a probe that
// cannot answer is not a refusal (ws-create's worktree-preflight law); only when the hub's walk has nothing either is the
// create refused. `census(backend)` is the OBSERVED row Manage agents shows (path, provenance, who found it).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execFile, spawn } = require('child_process');
const { serviceEnv } = require('../agent-env');
const LS = require('../login-shell');

// The directories a bare name is looked for in after `which`, in order.
function candidateDirs(envPath = process.env.PATH) {
  return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
    ...(envPath || '').split(path.delimiter).filter(Boolean)];
}

/** BOOT ONLY (sync): absolute path of `name`, or `name` itself when nothing
 *  executable is found (the caller spawns it bare, as it always has). */
function resolveCmd(name) {
  try {
    const r = execFileSync('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }).trim();
    if (r && r.startsWith('/')) return r;
  } catch {}
  for (const dir of candidateDirs()) {
    const p = path.join(dir, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return name;
}

/** The SAME lookup, async — the spawn-time spelling (a create path never
 *  blocks the event loop). */
function resolveCmdAsync(name) {
  return new Promise((resolve) => {
    execFile('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }, async (err, out) => {
      const r = !err && String(out || '').trim();
      if (r && r.startsWith('/')) return resolve(r);
      for (const dir of candidateDirs()) {
        const p = path.join(dir, name);
        try { await fs.promises.access(p, fs.constants.X_OK); return resolve(p); } catch {}
      }
      resolve(name);
    });
  });
}

const executable = async (p) => {
  if (typeof p !== 'string' || !p.startsWith('/')) return false;
  try { await fs.promises.access(p, fs.constants.X_OK); return true; } catch { return false; }
};

/** The bound on a READ's lookup of an unresolved (or gone) CLI: one `which` per
 *  CLI per this many ms; a person's Install / Re-check (`reask`) and a non-person fresh read (`force`) skip it. */
const RECHECK_MS = 30000;

/** THE BOUND on one shell ask. Measured on the owner's box (2026-11-03, `-l -i -c 'command -v codex'`, stdin /dev/null):
 *  zsh ≈ 0.30 s, bash ≈ 0.07 s; a heavy rc ≈ 1 s. */
const SHELL_ASK_MS = 10000;
const OUT_CAP = 256 * 1024; // the tail of a chatty rc's printout kept (the sentinels are at its end)


/** The person's login shell on THIS machine — src/login-shell.js's ladder (the dial road's too) over facts gathered
 *  async: process.env.SHELL › the account record (os.userInfo(): the passwd entry `getent passwd` reads) › zsh / bash on
 *  PATH › /bin/sh. Answers { shell, rung }. */
async function loginShellOf({ env = process.env, userInfo = () => os.userInfo(), usable = executable } = {}) {
  let accountShell = '';
  try { accountShell = (userInfo() || {}).shell || ''; } catch { }
  const envShell = env.SHELL || '';
  const first = envShell || accountShell;
  const firstOk = !!first && await usable(first);
  const found = {};
  if (!firstOk) {
    for (const n of ['zsh', 'bash']) {
      for (const d of String(env.PATH || '').split(path.delimiter).filter((x) => x.startsWith('/'))) {
        if (await usable(path.join(d, n))) { found[n] = path.join(d, n); break; }
      }
      if (found[n]) break;
    }
  }
  return LS.pickLoginShell({ envShell, accountShell, executable: (p) => p === first && firstOk, onPath: (n) => found[n] || null });
}

/**
 * ONE LOGIN-SHELL RUN (the ask and the probe share it — one spawn site, one kill site): `<shell> -l -i -c '<line>'` (the
 * three flags spelled apart — fish takes them too), stdin /dev/null, TERM=dumb, the sanitized env (serviceEnv), its OWN
 * session (`detached`: an rc's `kill 0` or a job-control grab never reaches the hub's process group), bounded by
 * `timeoutMs` (the child is killed by its pid, then whatever is left in the probe's own session — an rc's leftover
 * background job that would hold the pipe). `complete(out)` = the whole answer is in; `judge(out, err, exitWhy)` = the
 * answer. Resolves the judged answer + `shell` + `ms`, or { kind: 'unanswered', why } (timeout / spawn).
 */
function runShell({ shell, line, env = process.env, timeoutMs = SHELL_ASK_MS, now = Date.now, complete, judge }) {
  return new Promise((resolve) => {
    const t0 = now();
    let settled = false, child = null, timer = null, out = '', err = '';
    // the probe's own session (detached ⇒ setsid ⇒ pgid = its pid): nothing but this ask's shell and what its rc started
    const killGroup = () => { if (child && Number.isInteger(child.pid) && child.pid > 1) { try { process.kill(-child.pid, 'SIGKILL'); } catch { } } };
    const reap = () => {
      if (!child) return;
      try { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); } catch { }
      killGroup();
      try { child.stdout?.destroy(); } catch { }
      try { child.stderr?.destroy(); } catch { }
    };
    const done = (a) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reap();
      resolve({ ...a, shell: shell || null, ms: now() - t0 });
    };
    const home = typeof env.HOME === 'string' && env.HOME.startsWith('/') ? env.HOME : undefined;
    try {
      // THE ENV IT IS ASKED IN — an ALLOWLIST (serviceEnv): HOME LANG LC_* TMPDIR XDG_RUNTIME_DIR + USER LOGNAME, the
      // hub's PATH as the baseline its rc builds on, SHELL = itself, TERM=dumb. NEVER a VIBESPACE_* name, a token or npm_*:
      // a person's rc runs arbitrary code. VIBESPACE_SHELL_PROBE=1 lets that rc skip a tmux autostart or a banner.
      child = spawn(shell, ['-l', '-i', '-c', line], { stdio: ['ignore', 'pipe', 'pipe'], env: serviceEnv(env, { keep: ['USER', 'LOGNAME'], add: { SHELL: shell, TERM: 'dumb', VIBESPACE_SHELL_PROBE: '1' } }), cwd: home, detached: true });
    } catch (e) { return done({ kind: 'unanswered', why: `spawn:${(e && e.code) || 'error'}` }); }
    child.on('error', (e) => done({ kind: 'unanswered', why: `spawn:${(e && e.code) || 'error'}` }));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; if (out.length > OUT_CAP) out = out.slice(-OUT_CAP); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { err += d; if (err.length > 8192) err = err.slice(-8192); }); // the tail a refusal quotes
    let exitWhy = null;
    child.on('exit', (code, sig) => {
      exitWhy = sig ? `exit:${sig}` : `exit:${code}`;
      // the shell is gone: whatever its rc left in the probe's session goes too, so the pipe closes and 'close' comes
      killGroup();
      if (complete(out)) done(judge(out, err, exitWhy)); // the whole answer is in (the LAST sequence: an rc's decoy printed before the line never ends it)
    });
    child.on('close', (code, sig) => done(judge(out, err, exitWhy || (sig ? `exit:${sig}` : `exit:${code}`))));
    // THE BOUND (the ONE timer in this file: it ENDS an ask, it never starts one — nothing here checks on a timer)
    timer = setTimeout(() => done({ kind: 'unanswered', why: 'timeout' }), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/**
 * THE SHELL ASK — where is the CLI, and is its word a WRAPPER? (src/login-shell.js shellLine: the shell's own
 * program-only spelling through escaped builtins, the word's meaning, a control word, the PATH.) EXACTLY one of:
 *   { kind:'path', path, shellPath }            — the word is no wrapper and the shell names a program: spawn it directly
 *   { kind:'wrapper', wrapper, path, shellPath } — the word IS an alias / a function in the person's shell: the shell runs
 *        it (registry: proven by probeVersion, spawned through the shim)
 *   { kind:'none' }                             — the shell resolves names and holds nothing for the word
 *   { kind:'unanswered', why }                  — 'timeout' | 'exit:<n>' | 'spawn:<err>' | 'no-shell' | 'bad-name' | 'no-command-builtin'
 * each with `shell` (the path asked) and `ms`. Never an alias body read.
 */
function askShell(name, { shell, env = process.env, timeoutMs = SHELL_ASK_MS, now = Date.now } = {}) {
  if (!LS.NAME_OK.test(String(name || ''))) return Promise.resolve({ kind: 'unanswered', why: 'bad-name', shell: shell || null, ms: 0 });
  if (!shell) return Promise.resolve({ kind: 'unanswered', why: 'no-shell', shell: null, ms: 0 });
  return runShell({ shell, line: LS.shellLine(name, shell), env, timeoutMs, now,
    complete: (o) => LS.parseShellAnswer(o).pathDone,
    judge: (out, err, exitWhy) => {
      const p = LS.parseShellAnswer(out);
      if (!p.complete) return { kind: 'unanswered', why: exitWhy };
      const v = LS.judgeAnswer(p, { name });
      return v.kind === 'path' || v.kind === 'wrapper' ? { ...v, shellPath: p.path } : v;
    } });
}

/** the shell's own words, its job-control noise dropped (bash with no tty: «cannot set terminal process group», «no job
 *  control in this shell»; zsh «can't set tty pgrp») — the tail a refusal quotes, never our diagnosis */
const shellSaid = (err) => String(err || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/cannot set terminal process group|no job control in this shell|can't set tty pgrp/.test(l)).slice(-3).join(' · ').slice(-300);

/** THE PROOF of a wrapper: `<cli> --version` run BY THE PERSON'S SHELL (its alias expanded, its function run), bounded,
 *  the sanitized env. { kind: 'proven', version } | { kind: 'refused', said, code } (no version line, or a non-zero exit:
 *  the shell's OWN stderr is the reason) | { kind: 'unanswered', why } (timeout / spawn). The version line IS the
 *  measurement of that CLI (ONE CLI, ONE ROAD). */
function probeVersion(name, { shell, env = process.env, timeoutMs = SHELL_ASK_MS, now = Date.now } = {}) {
  if (!LS.NAME_OK.test(String(name || ''))) return Promise.resolve({ kind: 'unanswered', why: 'bad-name', shell: shell || null, ms: 0 });
  if (!shell) return Promise.resolve({ kind: 'unanswered', why: 'no-shell', shell: null, ms: 0 });
  return runShell({ shell, line: LS.versionLine(name, shell), env, timeoutMs, now,
    complete: () => false, // judged at 'close' only: the shell's stderr (a refusal's words) may trail its stdout

    judge: (out, err, exitWhy) => {
      const v = LS.parseVersion(out);
      if (!v.complete) return { kind: 'unanswered', why: exitWhy };
      if (v.version && v.code === 0) return { kind: 'proven', version: v.version };
      return { kind: 'refused', said: shellSaid(err), code: v.code };
    } });
}

/** Write the CLI's SHIM (src/login-shell.js shimScript) — async, atomic (tmp + rename), 0755 in a 0700 dir. Its path is the
 *  CLI's binary from now on: every reader that runs current() runs the person's shell. null = could not be written. */
async function writeShim(dir, backend, shell, name) {
  try {
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${String(backend).replace(/[^\w.-]/g, '_')}.sh`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, LS.shimScript(shell, name), { mode: 0o755 });
    await fs.promises.rename(tmp, file);
    return file;
  } catch { return null; }
}

/** A refusal BY NAME: the create that would spawn a CLI nobody can find (ws-create answers it as `cli-missing`). */
class CliMissing extends Error {
  constructor(f) {
    super(f.message);
    this.code = 'cli-missing';
    Object.assign(this, f);
  }
}

/** @param {object} o
 *  @param {(name:string)=>Promise<string>} [o.resolve] the hub's own walk (default resolveCmdAsync)
 *  @param {(p:string)=>Promise<boolean>} [o.usable] is this path spawnable (default: absolute + X_OK)
 *  @param {(name:string)=>Promise<object>} [o.ask] the shell ask (default: askShell in the person's login shell)
 *  @param {()=>string[]} [o.looked] the directories the hub's walk looked in (the refusal names them)
 *  @param {(line:string)=>void} [o.log]
 *  @param {number} [o.recheckMs] the read-time lookup bound (RECHECK_MS)
 *  @param {()=>number} [o.now] the clock the bound reads */
function createCliCmds({ resolve = resolveCmdAsync, usable = executable, ask = null, probe = null, shimDir = null, looked = () => [...new Set(candidateDirs())],
  log = (l) => console.log(l), recheckMs = RECHECK_MS, now = Date.now } = {}) {
  const askOf = ask || (async (name) => { const { shell } = await loginShellOf({ usable }); return askShell(name, { shell }); });
  // a WRAPPER's proof runs in the same shell the ask named (round 4: the person's shell runs its own wrapper)
  const probeOf = probe || ((name, shell) => probeVersion(name, { shell }));
  const SHIMS = shimDir || path.join(os.tmpdir(), `vibespace-cli-shims-${typeof process.getuid === 'function' ? process.getuid() : 'u'}`);
  const entries = new Map(); // backend → { name, current, apply, pending, lookedAt, provenance, answer, shellPath, hubSaw }
  // ONE CLI, ONE BINARY (round 2): whoever MEASURES the CLI (the long-lived-token version gate, the record registration)
  // reads `current(backend)` and hears an adoption at once — the binary the sessions spawn is the binary measured
  const adoptedHooks = [];
  const adopted = (backend, p) => { for (const fn of adoptedHooks) { try { fn(backend, p); } catch { } } };
  const isAbs = (p) => typeof p === 'string' && p.startsWith('/');
  const said = (a) => (a && a.shell ? `your ${LS.shellName(a.shell)}` : 'your login shell');
  // THE ONE LOOKUP (single-flight: forSpawn and check share it — callers that land together share ONE ask, one adapter
  // hand-off, one journal line). Released the moment it settles, so a CLI that stays missing is asked about again by the
  // next caller — never a cached "missing". Answers the adopted path, or null (missing).
  const lookup = (backend, e) => {
    if (!e.pending) {
      e.pending = (async () => {
        e.lookedAt = now();
        let a;
        try { a = await askOf(e.name); } catch (err) { a = { kind: 'unanswered', why: `spawn:${(err && err.code) || 'error'}` }; }
        if (!a || typeof a.kind !== 'string') a = { kind: 'unanswered', why: 'exit:?' };
        if (a.kind === 'wrapper') {
          // THE PERSON'S SHELL RUNS ITS OWN WRAPPER (round 4): never read; proven ONCE by `<cli> --version` through the
          // shell, then spawned BY the shell (the shim). A refusal quotes the shell's own words; a timeout keeps the
          // provisional path, named.
          let v;
          try { v = await probeOf(e.name, a.shell); } catch (err) { v = { kind: 'unanswered', why: `spawn:${(err && err.code) || 'error'}` }; }
          if (v && v.kind === 'proven') {
            const shim = await writeShim(SHIMS, backend, a.shell, e.name);
            a = shim ? { ...a, kind: 'path', path: shim, via: 'wrapper', version: v.version } : { ...a, kind: 'unanswered', why: 'shim-unwritable' };
          } else if (v && v.kind === 'refused') a = { ...a, kind: 'refused', said: v.said || '', code: v.code };
          else a = { ...a, kind: 'unanswered', why: (v && v.why) || 'exit:?' };
        }
        if (a.kind === 'path' && !await usable(a.path)) a = { ...a, kind: 'none', notExecutable: a.path };
        e.answer = { ...a, at: now() };
        const was = e.current;
        if (a.kind === 'path') {
          e.current = a.path; e.provenance = 'shell'; e.shellPath = a.shellPath || null; e.hubSaw = null;
          if (a.path !== was) {
            try { e.apply(a.path); } catch (err) { log(`[cli-cmd] ${backend}: could not hand '${a.path}' to the adapter — ${err && err.message}`); }
            log(a.via === 'wrapper'
              ? `[cli-cmd] ${backend}: ${said(a)} (login shell) runs '${e.name}' through ${a.wrapper && a.wrapper.kind === 'function' ? 'a function' : 'an alias'} — proven (${a.version}); spawned through the shell ('${a.path}', it was '${was}', no restart needed)`
              : `[cli-cmd] ${backend}: ${said(a)} (login shell) found '${e.name}' at '${a.path}' — adopted (it was '${was}', no restart needed)`);
            adopted(backend, a.path);
          }
          return a.path;
        }
        e.shellPath = null;
        let walk = null;
        try { walk = await resolve(e.name); } catch { walk = null; }
        const hub = walk && await usable(walk) ? walk : null;
        if (a.kind === 'unanswered') {
          // the shell could not be ASKED: the provisional answer stays, the degradation named once per ask
          e.hubSaw = null;
          const keep = await usable(e.current) ? e.current : hub;
          if (keep && keep !== e.current) {
            e.current = keep;
            try { e.apply(keep); } catch (err) { log(`[cli-cmd] ${backend}: could not hand '${keep}' to the adapter — ${err && err.message}`); }
            adopted(backend, keep);
          }
          e.provenance = 'hub-path';
          log(`[cli-cmd] ${backend}: ${said(a)} could not be asked where '${e.name}' is (${a.why}) — ${keep ? `using the hub's PATH ('${keep}')` : 'and the hub\'s PATH has none'}`);
          return keep || null;
        }
        // none / refused (no program for the word; a wrapper whose run said no): MISSING for every purpose — the hub's walk
        // is a hint, never a spawn (and never offered for a refused wrapper: that refusal is the shell's own)
        e.hubSaw = a.kind === 'refused' ? null : hub;
        e.provenance = 'hub-path';
        return null;
      })().finally(() => { e.pending = null; });
    }
    return e.pending;
  };
  /** the env name that pins a CLI by hand (cli-env's own spelling: <ID>_CMD) — the door when a wrapper cannot be read */
  const envNameOf = (backend) => `${String(backend).toUpperCase().replace(/-/g, '_')}_CMD`;
  const wrapperWords = (w) => (w ? { kind: w.kind, text: w.text } : null);
  const refusal = (backend, e) => {
    const a = e.answer || { kind: 'unanswered', why: 'no-shell' };
    const who = said(a);
    const sh = a.shell ? LS.shellName(a.shell) : null;
    const dirs = looked();
    const envName = envNameOf(backend);
    const hint = e.hubSaw ? `the hub's PATH has ${e.hubSaw} — add that directory to your shell's PATH` : null;
    const wkind = a.wrapper && a.wrapper.kind === 'function' ? 'function' : 'alias';
    const wrapped = a.kind === 'none' && a.notExecutable ? ` — it named ${a.notExecutable}, which is not executable` : '';
    const message = isAbs(e.name)
      ? `${e.name} was not found — the configured path is not an executable file`
      : a.kind === 'refused'
        ? `${e.name} did not run in ${who} (login shell): it runs ${e.name} through ${wkind === 'function' ? 'a function' : 'an alias'} (${a.wrapper ? a.wrapper.text : e.name}), and \`${e.name} --version\` there said: «${a.said || 'nothing'}»${Number.isInteger(a.code) && a.code !== 0 ? ` (exit ${a.code})` : ''} — fix the ${wkind}, or set ${envName}`
      : a.kind === 'unanswered'
        ? `${e.name} was not found — ${who} (login shell) could not be asked (${a.why}) and the hub's PATH (${dirs.join(', ')}) has none`
        : `${e.name} was not found as a program by ${who} (login shell)${wrapped}${hint ? ` — ${hint}` : wrapped ? '' : ` — and the hub's PATH (${dirs.join(', ')}) has none either`}`;
    return new CliMissing({ backend, cli: e.name, shell: sh, answer: isAbs(e.name) ? 'configured' : a.kind, why: a.why || null, wrapper: wrapperWords(a.wrapper), envName, said: a.kind === 'refused' ? a.said || '' : null, notExecutable: a.notExecutable || null, looked: dirs, hubPath: e.hubSaw || null, hint, message });
  };
  return {
    /** `name` = what the lookup asks for (the raw command, env override
     *  included); `current` = the path boot resolved; `apply(p)` = hand a
     *  re-resolved path to whoever builds the spawn spec. */
    register(backend, { name, current, apply = () => {} }) {
      if (!backend || !name) return;
      entries.set(backend, { name, current: current || name, apply, pending: null, lookedAt: -Infinity, provenance: isAbs(name) ? 'boot' : 'hub-path', answer: null, shellPath: null, hubSaw: null });
    },
    /** THE ONE ACCESSOR for «which binary is this CLI» — the shell's answer once asked, the boot's before: every reader
     *  (the spawn spec, the version gate, the registration, the login helpers, the usage probe) reads this, never a
     *  boot constant (test-cli-env pins the readers of CLAUDE_CMD / CODEX_CMD). */
    current(backend) { const e = entries.get(backend); return e ? e.current : null; },
    /** THE REMOTE COMMAND NAME (round 3): the LOCAL shell's answer is LOCAL — an ssh / dial road runs the CLI's configured
     *  NAME (the raw command, a configured path's basename), never the basename of a locally adopted path (a local
     *  `alias codex='~/bin/codex-x86_64-unknown-linux-musl'` must not become the remote program). A command that is not
     *  the registered one (a spec override, a shell) keeps its own basename, as before. */
    remoteName(backend, cmd) {
      const base = (p) => { const s = String(p == null ? '' : p); return s.includes('/') ? path.basename(s) : s; };
      const e = entries.get(backend);
      return e && cmd && cmd === e.current ? base(e.name) : base(cmd);
    },
    /** `fn(backend, path)` whenever a CLI's binary changes (an adoption) — a measurer re-measures at once (server.js: the
     *  version gate re-ticks on ANY adoption; one tick at a time, so a codex adoption costs one claude `--version`). */
    onAdopt(fn) { if (typeof fn === 'function') adoptedHooks.push(fn); },
    /** Every registered backend (the status route checks them all). */
    ids() { return [...entries.keys()]; },
    /** The command to spawn for `backend` — or a THROWN CliMissing (the create is refused by name, nothing spawned).
     *  Only the registered command is ever looked up: a spec override, `ssh`, node or a login shell pass through. The
     *  shell's 'path' still executable costs ONE access; never asked yet / its path gone / it found nothing last time ⇒
     *  the shell is asked (once, shared); could not be asked last time and the provisional path works ⇒ that path. */
    async forSpawn(backend, cmd) {
      const e = entries.get(backend);
      if (!e || !cmd || cmd !== e.current) return cmd;
      if (isAbs(e.name)) { if (await usable(cmd)) return cmd; const r = refusal(backend, e); log(`[cli-cmd] ${backend}: ${r.message} — the create is refused (cli-missing)`); throw r; }
      if (e.answer && (e.answer.kind === 'path' || e.answer.kind === 'unanswered') && await usable(cmd)) return cmd; // 'path' = the shell's, adopted
      const p = await lookup(backend, e);
      if (p) return p;
      const r = refusal(backend, e);
      log(`[cli-cmd] ${backend}: ${r.message} — the create is refused (cli-missing)`);
      throw r;
    },
    /** The PATH a spawn of `backend` is born with when the shell found it: the shell's own (so a `#!/usr/bin/env node`
     *  shim finds the node the person's shell would); null = the hub's (never asked / could not be asked). */
    spawnPath(backend) { const e = entries.get(backend); return e && e.answer && e.answer.kind === 'path' && e.shellPath ? e.shellPath : null; },
    /** THE READ-TIME CHECK: the usable absolute path of `backend`'s CLI right
     *  now, or null (missing). The first status read of a CLI asks the shell (lazily — never at boot); afterwards a found
     *  path costs one `access`; a missing / gone one is asked again at most once per `recheckMs`.
     *  `reask` = A PERSON'S PRESS (Manage agents' Install / Re-check: `?recheck=1`) — the shell is asked NOW (a newer
     *  install is adopted). `force` = a fresh read that is NOT a person's (the usage door, a wall's one read): it skips the
     *  bound, but a usable path costs one `access` and never runs the person's shell (round 2). */
    async check(backend, { force = false, reask = false } = {}) {
      const e = entries.get(backend);
      if (!e) return null;
      if (isAbs(e.name)) return await usable(e.name) ? e.name : null;
      if (reask) return lookup(backend, e);
      if (e.answer) {
        if ((e.answer.kind === 'path' || e.answer.kind === 'unanswered') && await usable(e.current)) return e.current;
        if (!force && now() - e.lookedAt < recheckMs) return null;
        return lookup(backend, e);
      }
      if (force && await usable(e.current)) return e.current;
      return lookup(backend, e);
    },
    /** THE OBSERVED ROW (Manage agents' census line; /api/backend-status): where the CLI was found and by whom. */
    census(backend) {
      const e = entries.get(backend);
      if (!e) return null;
      const a = e.answer;
      const missing = !isAbs(e.name) && !!a && (a.kind === 'none' || a.kind === 'refused');
      return {
        provenance: e.provenance,
        shell: a && a.shell ? LS.shellName(a.shell) : null,
        askedAt: a ? a.at : null,
        answer: isAbs(e.name) ? 'configured' : (a ? a.kind : null),
        via: a && a.kind === 'path' ? a.via || 'program' : null, // 'wrapper' = spawned THROUGH the person's shell (its alias / function)
        wrapper: a ? wrapperWords(a.wrapper) : null, // the person's alias / function wearing the name — run by their shell, never read
        version: a && a.kind === 'path' && a.version ? a.version : null, // the wrapper's proof: its --version line through the shell
        said: a && a.kind === 'refused' ? a.said || '' : null, // a refused wrapper: the shell's OWN words
        notExecutable: a && a.notExecutable ? a.notExecutable : null,
        envName: envNameOf(backend),
        unanswered: a && a.kind === 'unanswered' ? a.why : null,
        hubPath: missing ? e.hubSaw : null,
        hint: missing && e.hubSaw ? `the hub's PATH has ${e.hubSaw} — add that directory to your shell's PATH` : null,
        missing,
      };
    },
  };
}

module.exports = { resolveCmd, resolveCmdAsync, createCliCmds, candidateDirs, RECHECK_MS, SHELL_ASK_MS, askShell, probeVersion, loginShellOf, CliMissing };
