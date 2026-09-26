// Per-PROCESS scratch paths + free ports for the suites that spawn a throwaway
// server / headless chrome / git worktree (2.369.76). Fixed `/tmp/vs-<name>`
// paths and fixed ports were a MACHINE-wide collision: the heavy tier, a
// verifier agent running the same gate suite in its own worktree, and a
// developer's local run all shared `/tmp/vs-chatpage-smoke`, the chrome
// profile dir and port 3990 — one run's cleanup `git worktree remove --force`
// deleted another run's worktree mid-build (heavy tier RED at 40ad936d on
// test-chat-paging: esbuild lost its input, the retry's `worktree add` hit the
// path the other run had just recreated). 2.369.46 fixed ONE instance
// (test-chat-e2e's port 3995) inline; this is the third strike, so the idiom is
// shared and test-architecture sweeps every scripts/test-*.mjs for the fixed
// shapes. NOT a test-*.mjs on purpose: the tier census would demand a tier.
//
// SINCE 2026-09-09 the prefix and the tmp root are NOT literals here: they come
// from src/fixture-guard.js, the ONE declaration of what a fixture looks like.
// The production usage walk and session discovery skip exactly what this
// function mints, and the standing sweep (scripts/test-fixture-isolation.mjs)
// checks the real ~/.claude/projects for exactly what this function mints — so
// a suite that renames its scratch dir cannot walk out from under the guard.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FIXTURE_CWD_PREFIX, TMP_ROOTS, FIXTURE_SID_PREFIX } = require('../src/fixture-guard.js');

/** The first-run Welcome wizard is skipped when localStorage 'vs-onboarded' is
 *  set OR when the machine already has sessions (app.js _checkOnboarding). A
 *  chrome suite that does not pre-set the flag is therefore GREEN on a
 *  developer box (whose ~/.claude has sessions) and RED on the Actions runner
 *  (empty ~/.claude): the wizard's modal covers the chrome under test and its
 *  own capture-phase Escape eats the first Esc (2.369.125 r7 — test-gear-menu's
 *  Esc legs, and the three suites red on every mirror run since 2.369.75).
 *  Every suite passes this to Page.addScriptToEvaluateOnNewDocument BEFORE its
 *  first Page.navigate; test-architecture §47 is the census. */
export const ONBOARDED_SOURCE = "try { localStorage.setItem('vs-onboarded', '1'); } catch {}";

/** `/tmp/vs-<name>-<pid>` — unique per process, cleaned by the owning suite. */
export function scratch(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`scratch(): bad name ${JSON.stringify(name)}`);
  // lane H verify r2: `vs-ab-<n>` is the PRODUCT's socket-dir fallback shape (src/browser-profiles.js socketDirDecision),
  // which the scratch reaper (scripts/ci.mjs PRODUCT_ROOT_RE) never judges — a suite minting it would hide from the sweep
  if (name === 'ab') throw new Error('scratch(): "ab" would mint /tmp/vs-ab-<pid> — the product\'s own socket-dir shape; pick another name');
  return path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}${name}-${process.pid}`);
}

/** An ISOLATED $HOME for a suite that boots a server and needs discovery
 *  (2026-09-09). The server can only discover transcripts under the home it
 *  runs with, so the fixture goes HERE and the developer's real ~/.claude is
 *  never touched. `dirs` are pre-created because a spawned CLI/server must not
 *  race the first mkdir. Returns the home path; the caller removes it in its
 *  exit AND signal handlers. */
export function scratchHome(name, fs, dirs = ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) {
  const home = scratch(name);
  for (const d of dirs) fs.mkdirSync(path.join(home, d), { recursive: true });
  return home;
}

/** A suite's synthetic conversation id: `e2e00000-0000-4000-8000-<12 hex>`.
 *  Nothing else may mint one — the walk and discovery both refuse this family
 *  wherever it lands, which is the only guard that still works when the
 *  fixture carries no cwd at all (a hand-written `assistant` record has none). */
export function fixtureSid(suffix) {
  if (!/^[0-9a-f]{1,12}$/.test(suffix)) throw new Error(`fixtureSid(): bad suffix ${JSON.stringify(suffix)}`);
  return FIXTURE_SID_PREFIX + suffix.padStart(12, '0');
}

const listen0 = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.once('error', rej);
  s.listen(0, '127.0.0.1', () => res(s));
});

/** N distinct free loopback ports. Every listener is held open until ALL are
 *  chosen (closing each before the next listen(0) may hand the same port back). */
export async function freePorts(n) {
  const servers = [];
  for (let i = 0; i < n; i++) servers.push(await listen0());
  const ports = servers.map((s) => s.address().port);
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

export async function freePort() { return (await freePorts(1))[0]; }

/** THE SINGLETON DESKTOP'S NAMES, PER RUN (2026-09-25 — the heavy RED on
 *  69720f2b). src/vnc.js's singleton Desktop claims the MACHINE-GLOBAL X display
 *  `:7` and RFB port 5901 unless VIBESPACE_VNC_DISPLAY / VIBESPACE_VNC_PORT name
 *  others, and it ADOPTS whatever already listens on its port (by design —
 *  KasmVNC, an app-only restart). This box has Xtigervnc on PATH since
 *  2026-09-21, so every scratch server that opened the Desktop started — or
 *  adopted — ONE Xtigervnc shared by every run on the box and by the owner's
 *  production instance, and `:7` sits in the band `-displayfd` hands out
 *  lowest-first to every desktop-app keeper's Xvfb (measured: picks 6 9 11 …
 *  around a live :7), so a suite's Xvfb could hold the display the singleton
 *  needs. Every suite that spawns server.js spreads this into the server env
 *  (test-architecture §57 is the census). The port comes from freePort(); the
 *  display from `freeDisplay` seeded by that port. */
export async function vncEnv() {
  const port = await freePort();
  return { VIBESPACE_VNC_DISPLAY: `:${freeDisplay(port)}`, VIBESPACE_VNC_PORT: String(port) };
}
/** Far above the lowest-first `-displayfd` band the keepers draw from, below
 *  the X TCP ceiling (6000 + n). */
export const VNC_DISPLAY_RANGE = Object.freeze({ lo: 1000, span: 20000 });
/** The first X display number at or after a seed-derived start whose lock file
 *  AND socket are both absent (a lock alone is left behind by a SIGKILLed
 *  server; a socket alone by a crashed one — either may still be claimed).
 *  `exists` is a parameter so the rule is testable without an X server. */
export function freeDisplay(seed, { exists = (p) => fs.existsSync(p) } = {}) {
  const { lo, span } = VNC_DISPLAY_RANGE;
  const s = Math.abs(Math.trunc(Number(seed) || 0));
  for (let i = 0; i < span; i++) {
    const n = lo + ((s + i) % span);
    if (!exists(`/tmp/.X${n}-lock`) && !exists(`/tmp/.X11-unix/X${n}`)) return n;
  }
  throw new Error(`freeDisplay(): no free X display in :${lo}..:${lo + span - 1}`);
}

/** EVERY PROCESS ROOTED IN A SCRATCH DIR — the teardown of a suite whose worktree
 *  server spawned sessions (2026-09-25, test-browser-resources: 140 live leftovers
 *  from 20 runs). A server's terminal/chat sessions run under dtach — DETACHED by
 *  design (production's must outlive a restart; systemd's KillMode=process is the
 *  same rule) — so killing the server ends none of them, and they run with the
 *  REAL HOME and cwd `/tmp`: the scratch root is only in their arguments
 *  (`dtach -c <root>/…/data/sockets/cw-…`, `node <root>/…/data/bin/pty-wrapper.js`).
 *  A suite that boots a server owns what that server started: this lists every
 *  process whose cwd, HOME or any argv token (its start, or after `=`) lies in
 *  `root` — never this process or its ancestors — and signals each (SIGKILL by
 *  default; synchronous, so it runs inside an 'exit' handler). Returns the pids.
 *  The gate's reaper (scripts/ci.mjs argvScratchRoots) is the net for a suite that
 *  never got here. */
export function endRootedProcesses(root, { signal = 'SIGKILL', procRoot = '/proc', self = process.pid } = {}) {
  const r = path.resolve(String(root || ''));
  if (!r || r === '/' || !r.startsWith('/tmp/')) throw new Error(`endRootedProcesses(): refusing root ${JSON.stringify(root)} (a /tmp scratch dir only)`);
  const under = (x) => { const v = String(x || ''); return v === r || v.startsWith(r + '/'); };
  const skip = new Set();
  for (let q = self; q > 1 && !skip.has(q);) {
    skip.add(q);
    try { const st = fs.readFileSync(`${procRoot}/${q}/stat`, 'latin1'); q = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { break; }
  }
  const hit = [];
  let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return hit; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    let rooted = false;
    try { rooted = under(fs.readlinkSync(`${procRoot}/${pid}/cwd`)); } catch { }
    if (!rooted) try { rooted = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split(/[\0\s]+/).some((t) => under(t) || t.split('=').slice(1).some((v) => under(v))); } catch { }
    if (!rooted) try { rooted = under((fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0').find((kv) => kv.startsWith('HOME=')) || '').slice(5)); } catch { }
    if (!rooted) continue;
    try { process.kill(pid, signal); hit.push(pid); } catch { }
  }
  return hit;
}

/** The ambient vendor credentials a REAL agent CLI would bill against instead
 *  of the login the leg means to use (B-5f0b, the 2.369.69 lesson): a fake
 *  CODEX_HOME / HOME removes the LOGIN, never an env key — a leaked
 *  OPENAI_API_KEY / CODEX_API_KEY lets a real `codex app-server`'s own idle
 *  drain run a billed turn, and ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *  outrank the oat/subscription a claude leg seeds. */
export const VENDOR_KEY_ENV = Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']);

/** A copy of `env` without VENDOR_KEY_ENV — every spawn of a REAL claude /
 *  codex / opencode in a suite goes through this (test-architecture §50). */
export function withoutVendorKeys(env = process.env) {
  const out = { ...env };
  for (const k of VENDOR_KEY_ENV) delete out[k];
  return out;
}

/** STOP A WRAPPER, THEN REMOVE ITS SCRATCH DIR — in that order (2.369.172 r1,
 *  the Actions mirror's red on test-codex-p2-client: `ENOTEMPTY: directory not
 *  empty, rmdir /tmp/vs-cxfork-…`). Since 2.369.172 every wrapper answers
 *  SIGTERM/SIGHUP/SIGINT with a synchronous record — the meta first, then the
 *  buffer, then a log line (`appendFileSync` CREATES chat-wrapper.log /
 *  codex-chat-wrapper.log when it is absent) — so a suite that kills the wrapper
 *  and calls `rmSync(dir)` in the same tick races that append: on the 2-vCPU
 *  runner the log file landed between rmSync's listing and its rmdir. Four fast
 *  suites had exactly that shape (no exit wait at all); this is the ONE idiom.
 *  Waits for the child's exit (SIGKILL after `graceMs`), then removes the dir
 *  with retries. Safe on a child that already exited. */
export async function stopWrapper(child, { dir = null, graceMs = 3000 } = {}) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try { child.kill('SIGTERM'); } catch { }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, graceMs);
    await exited;
    clearTimeout(t);
  }
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
}
