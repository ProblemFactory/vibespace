'use strict';
/**
 * THE LONG-LIVED-TOKEN MEASUREMENT, ONE IMPLEMENTATION (lane cli-self-measure, 2026-11-09 — the owner: «每次更新都要重新测量也太
 * 弱智了？这个用户体验是你觉得最好的方案吗？»). SHARED tier («a fact about a machine»): node builtins + ./cli-caps.js, no server
 * state. Two roads call it and nothing else measures:
 *   · scripts/measure-claude-cred-read.mjs — the release road (argv, the sudo netns re-exec, the fixture writer); and
 *   · src/server/cli-self-measure.js — the hub, which FORKS this file (the child entry at the bottom) the first time it sees a
 *     Claude CLI version + binary sha256 with no PASS on record, so a Claude Code update no longer idles the pool until a
 *     release ships one (the founding requirement, 2026-03-22 item 7: a Claude Code update needs no update of VibeSpace).
 *
 * WHAT IT IS, AND ITS LIMIT (主开发's ruling, acceptance r4). THE MEASUREMENT IS A WITNESS OF AN HONEST BUILD'S CONDUCT. It answers
 * one question — does this unknown build of the vendor's own CLI still handle the long-lived token the way the recorded builds do —
 * and it FAILS CLOSED on everything it cannot account for. It is NOT a sandbox against a hostile binary: the binary runs as the same
 * user, in no namespace, and a build that sets out to deceive its tracer can. What protects the person does not depend on the
 * trace: the run gets a made-up credential, a scratch HOME and a loopback mock, so nothing real is in reach by the build's normal
 * conduct, and no real token ever leaves. The record's design (the tracer's own stderr stream, which the binary does not inherit)
 * buys one thing: the build's own writes and an accident cannot damage the record. It does not stop a build that deliberately
 * rewrites its launcher or links files around; the tripwires for those (the launcher compared with the shipped file before every
 * launch; a link's or a rename's source judged like an open) say so when they fire — they are not a wall.
 *
 * scripts/test-cli-self-measure.mjs §1 fails a one-sided copy (the script or the hub growing its own mock / belt / judge);
 * scripts/test-oat-measure-fake.mjs runs both roads over one fake (parity) and proves every fence firing on the real tracer.
 *
 * What it measures is the release road's measurement unchanged (the mock, the six oat variants and their verdicts, the hot-
 * switch variants, the strace belt — moved verbatim from the script; see the script's header for every variant). The gate
 * (cli-caps OAT_IN_FILE_GATE: oat-file, oat-file-401, oat-file-switch) runs FIRST and `onGate` reports it the moment the
 * third ends (ruling R1: the hub places on it, ≈ 271 s on 2.1.321); the other three complete the record behind it.
 *
 * LAW 3 — IT CAN NEVER REACH A VENDOR OR SEE A REAL CREDENTIAL. Refused BY NAME before the binary starts (`preflight`, then
 * the canaries): G2 the scratch is new and under `root`, never inside a `forbid` dir (the person's ~/.claude, data/subs, the
 * vault); G6 strace runs and may trace its child (`no-strace` / `strace-denied`); G7 no system-wide managed settings and no
 * hard-coded remote-token files (MEASURED on 2.1.321: the CLI opens /etc/claude-code/managed-settings.json, -settings.d,
 * managed-mcp.json and /home/claude/.claude/remote/{.oauth_token,.api_key,.session_ingress_token} whatever HOME is —
 * `managed-settings` / `remote-token`); G4 the loopback mock answers its nonce (`mock`); G5 the proxy recorder refuses a
 * CONNECT (`proxy`); G3 every spawn's env is ENV_ALLOW exactly, every base / proxy the mock's origin, the only token the
 * run's fake (`env`). G1 the tokens are built at runtime. After the run: P1 a token the run never made reaching the mock and
 * P4 a successful open of a guarded path VOID the run (`foreign-token` / `guarded-read`); P2 every CONNECT is answered 403
 * (no TLS session opens); P3 the belt SIGKILLs the CLI's group at the first off-loopback connect() (`aborted`). The run uses
 * the CLI's stream-json mode on a pipe with no real account and no reachable endpoint — the mock's own log is the proof.
 */
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { OAT_VARIANTS, OAT_IN_FILE_GATE, MINT_VARIANT, cliVersionOf, mintScopesIn } = require('./cli-caps.js');

// the measurement's own version: a change to what it measures bumps it, and a hub re-runs a FAIL once (a PASS stays)
const PROBE_VERSION = 2; // 2 (the incident of 2026-11-11): the hub's run lives outside every guarded root — a cannot-run measured by 1 runs again
// the gate first, then the rest (oat-env after oat-file: it is a diff against it)
const RUN_ORDER = Object.freeze([...OAT_IN_FILE_GATE, ...OAT_VARIANTS.filter((v) => !OAT_IN_FILE_GATE.includes(v))]);
// G7: the paths outside HOME the CLI reads (measured, 2.1.321 strace) — present ⇒ refused before start; read ⇒ void
const GUARDED = Object.freeze([
  Object.freeze({ path: '/etc/claude-code', code: 'managed-settings' }),
  Object.freeze({ path: '/home/claude/.claude/remote', code: 'remote-token' }),
]);
// G3: THE CHILD'S ENV IS THIS LIST (the spawn-env census row names it); nothing else ever reaches the CLI
const ENV_ALLOW = Object.freeze(['PATH', 'HOME', 'TMPDIR', 'USER', 'LANG', 'TERM', 'ANTHROPIC_BASE_URL', 'USE_LOCAL_OAUTH', 'CLAUDE_LOCAL_OAUTH_API_BASE', 'CLAUDE_LOCAL_OAUTH_APPS_BASE', 'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE',
  'CLAUDE_CODE_ENABLE_TELEMETRY', 'OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_LOGS_EXPORT_INTERVAL', 'CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS',
  'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'NO_PROXY', 'no_proxy', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  'BROWSER']); // BROWSER (lane oat-add-door): the mint variant's only — the `false` binary (assertEnv), so `setup-token` never runs the box's opener

const BASE_KEYS = ['ANTHROPIC_BASE_URL', 'CLAUDE_LOCAL_OAUTH_API_BASE', 'CLAUDE_LOCAL_OAUTH_APPS_BASE', 'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE'];
const PROXY_KEYS = ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'];
// the opener `setup-token` runs with the authorize URL (measured, 2.1.321: «Opening browser to sign in…», then the URL is printed
// when it fails): the `false` binary, which opens nothing — never xdg-open, never a person's browser
const NO_BROWSER = '/bin/false'; // a box without it: the opener fails to start — it opens nothing either way
// FAKE tokens, built at runtime: no token-shaped literal sits in the tree
const OAT_PFX = ['sk', 'ant', 'oat01'].join('-');
const ORT_PFX = ['sk', 'ant', 'ort01'].join('-');
const LIVE = new Set(); // the CLI process groups this process started (killAll: a hub that goes away takes them with it)
// LAW C — WHAT THE RUN STARTED ENDS WITH IT, BY THE KERNEL (acceptance r2 items 4 + 5; measured on this box): every run of the binary is
// `setpriv --pdeathsig KILL -- strace --kill-on-exit -f …` in its OWN session. strace -f traces every process the run creates (a
// setsid grandchild included); --kill-on-exit (PTRACE_O_EXITKILL, strace >= 6.6) makes the kernel SIGKILL every tracee the moment
// the tracer goes; --pdeathsig makes the kernel SIGKILL the tracer the moment the process that spawned it goes (a SIGKILLed child,
// a hub gone). Measured: the child SIGKILLed ⇒ strace, the CLI and its setsid grandchild gone within 1.5 s; WITHOUT --kill-on-exit
// the CLI and the grandchild live on (the kernel's default only DETACHES tracees). So nothing here ever signals a pid read from
// text — only the tracer this process spawned (its handle's group); strace ignores SIGTERM in `-o FILE PROG` mode (its -I 3), so
// the stop is SIGKILL, and its log still ends on a whole line (measured)
// THE REAL HOME IS A DENY ROOT (law E; test-architecture §68's one reasoned src site): the person's home from the passwd entry, never
// $HOME — the CLI itself reads getpwuid's home whatever HOME says (acceptance r1 measured a canary there read on every run). Only a
// PATH: preflight and the fence compare against it; nothing here opens a file in it. A uid with no passwd entry (a container) ⇒ $HOME
const REAL_HOME = (() => { try { return os.userInfo().homedir || os.homedir(); } catch { return os.homedir(); } })();
/** LAW E: the credential stores a scratch may never be inside, contain or link into (preflight) — the person's own and the hub's */
function credentialRoots({ home = REAL_HOME, dataDir = null, extra = [] } = {}) {
  const r = [path.join(home, '.claude'), path.join(home, '.claude.json'), path.join(home, '.codex'), path.join(home, '.ssh'), path.join(home, '.aws'), path.join(home, '.config', 'gcloud'), path.join(home, '.local', 'share', 'keyrings'), path.join(home, '.gnupg')];
  if (dataDir) r.push(path.join(dataDir, 'subs'), path.join(dataDir, 'codex-subs'), path.join(dataDir, 'agy-subs'), path.join(dataDir, 'vault.json'), path.join(dataDir, 'pool-links'));
  if (process.env.CLAUDE_CONFIG_DIR) r.push(process.env.CLAUDE_CONFIG_DIR);
  return [...r, ...(extra || []).filter(Boolean)];
}

/** a refusal BY NAME (the hub's For-you reason): an Error carrying `refusal` (the code) and `detail` (the fact) */
function refusal(code, detail) { const e = new Error(`REFUSED (${code}): ${detail}`); e.refusal = code; e.detail = String(detail || '').slice(0, 300); return e; }
// the resolver(s) this box's lookups go to (/etc/resolv.conf) and what counts as loopback (ci-344-reds)
function nameserversOf() { try { return fs.readFileSync('/etc/resolv.conf', 'utf8').split('\n').map((l) => (/^\s*nameserver\s+(\S+)/.exec(l) || [])[1]).filter(Boolean); } catch { return []; } }
function isLoopbackAddr(a, loAddrs = []) { const x = String(a).replace(/^::ffff:/i, ''); return /^127\./.test(x) || x === '::1' || loAddrs.includes(x); }
const inside = (p, dir) => { const a = path.resolve(p), d = path.resolve(dir); return a === d || a.startsWith(d.endsWith(path.sep) ? d : d + path.sep); };
const realOr = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

/** the claude a rung may run: 'netns' = as named (the namespace is the fence); 'loopback-real' = an executable file named on
 *  purpose (never the one on PATH); 'fake' = a #! script only (an ELF / anything under …/claude/versions/ is refused). */
function resolveClaude(rung, c) {
  if (rung === 'netns') return c;
  if (rung === 'loopback-real') {
    if (!c) throw refusal('claude', '--loopback-real needs --claude <the real claude> (never the one on PATH)');
    let real = '';
    try { real = fs.realpathSync(c); fs.accessSync(real, fs.constants.X_OK); } catch { throw refusal('claude', `--loopback-real: ${c} is not an executable file`); }
    return real;
  }
  if (!c) throw refusal('claude', '--no-netns needs --claude <a FAKE claude script>; the real CLI runs only in the namespace rung (or, named on purpose, --loopback-real)');
  let real = '', head = '';
  try { real = fs.realpathSync(c); const fd = fs.openSync(real, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); head = b.toString('latin1'); } catch { }
  if (head !== '#!' || /[\\/]claude[\\/]versions[\\/]/.test(real)) throw refusal('claude', `--no-netns runs a FAKE claude script only (${real || c} is not one); the real CLI runs only in the namespace rung (or, named on purpose, --loopback-real)`);
  return real;
}

/** THE TRACER'S VERSION, from its own answer (`strace -V`): --kill-on-exit — the tracer taking everything it traces with it — is
 *  strace 6.6 or newer. A version it cannot read is OLD (fail closed). → {version: 'M.m' | null, ok} */
function straceVersionOf(text) {
  const m = /\bversion\s+(\d+)\.(\d+)(?:\.\d+)?\b/.exec(String(text || ''));
  if (!m) return { version: null, ok: false };
  const major = Number(m[1]), minor = Number(m[2]);
  return { version: `${major}.${minor}`, ok: major > 6 || (major === 6 && minor >= 6) };
}
/** what kind of machine this is, for the words of a refusal: a VibeSpace IMAGE — its stamp, /usr/share/vibespace/image.json, which
 *  both Dockerfiles write (its packages come with the next image) — or a machine its owner manages (they update strace themselves).
 *  A person's own container is the second kind: /.dockerenv is no VibeSpace image (acceptance r3 item 6). THE RULE IS EXISTENCE:
 *  anything at that root-owned path counts as the stamp — its content is never read (it only picks which words say the door) */
const machineKind = () => { try { return fs.existsSync('/usr/share/vibespace/image.json') ? 'image' : 'managed'; } catch { return 'managed'; } };

/** G2 / G6 / G7, before anything runs ⇒ null, or a refusal by name. `strace` = the tracer (a suite hands a stub). */
function preflight({ root, guarded = GUARDED, forbid = [], strace = 'strace', setpriv = 'setpriv', dataDir = null } = {}) {
  for (const g of guarded || []) {
    try { fs.lstatSync(g.path); return refusal(g.code, `${g.path} exists`); } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return refusal(g.code, `${g.path} cannot be ruled out (${e.code})`); }
  }
  if (!root) return refusal('scratch', 'no scratch root');
  const r = realOr(root);
  const stores = credentialRoots({ dataDir, extra: forbid });
  for (const f of stores) if (f && (inside(r, realOr(f)) || inside(realOr(f), r))) return refusal('scratch', `the scratch ${r} meets ${f}`);
  // …nor LINK into one: every entry of the (new, shallow) scratch, resolved
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; } for (const e of es) { const p = path.join(d, e.name); const rp = realOr(p); const hit = stores.find((f) => f && inside(rp, realOr(f))); if (hit) return `${p} → ${hit}`; if (e.isDirectory() && depth < 4) { const w = walk(p, depth + 1); if (w) return w; } } return null; };
  const linked = walk(r, 0); if (linked) return refusal('scratch', `the scratch links into a credential store (${linked})`);
  const out = path.join(r, 'canary.strace');
  // the SAME chain every run uses (law C): setpriv --pdeathsig KILL -- strace --kill-on-exit -f — each link refused by name
  const target = fs.existsSync('/bin/true') ? ['/bin/true'] : [process.execPath, '-e', '0'];
  // the tracer's own answer first: absent ⇒ no-strace; older than 6.6 — or a version it cannot read — ⇒ strace-old (fail closed)
  let said = '';
  try { said = execFileSync(strace, ['-V'], { encoding: 'utf8', timeout: 5e3 }); }
  catch (e) { if (e && e.code === 'ENOENT') return refusal('no-strace', 'strace is not installed'); said = String((e && e.stdout) || ''); }
  const sv = straceVersionOf(said);
  if (!sv.ok) { const e = refusal('strace-old', `strace ${sv.version || '(a version it cannot say)'} has no --kill-on-exit (6.6 or newer) — it could not end what it traces if the check stops`); if (sv.version) e.version = sv.version; e.machine = machineKind(); return e; } // no version said ⇒ none kept (the words say it did not say)
  // …then the EXACT options every run uses (the record on stderr with every pid, the doors injected shut): an option this strace
  // does not know ⇒ strace-old by name; any other failure ⇒ strace-denied
  try { execFileSync(strace, ['--kill-on-exit', '--always-show-pid', '-f', '-q', '-e', `trace=${TRACE_SET}`, '-e', 'inject=io_uring_setup:error=ENOSYS', '-e', `inject=${DENIED_DOORS.join(',')}:error=EPERM`, '-o', out, ...target], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15e3 }); }
  catch (e) {
    if (e && e.code === 'ENOENT') return refusal('no-strace', 'strace is not installed');
    const said2 = String((e && e.stderr) || '');
    if (/unrecognized option|invalid (?:system call|option)|unknown (?:option|syscall)/i.test(said2)) { const r = refusal('strace-old', `strace ${sv.version} lacks an option the check needs (${said2.trim().split('\n')[0].slice(0, 120)})`); r.version = sv.version; r.machine = machineKind(); return r; }
    return refusal('strace-denied', `strace could not trace a child (${(e && (e.code || e.status)) || 'error'})`);
  }
  try { execFileSync(setpriv, ['--pdeathsig', 'KILL', '--', ...target], { stdio: 'ignore', timeout: 15e3 }); }
  catch (e) { return refusal('no-setpriv', `setpriv --pdeathsig did not run (${(e && (e.code || e.status)) || 'error'}) — util-linux's setpriv ends the tracer when the check's process goes`); }
  try { fs.rmSync(out, { force: true }); } catch { }
  return null;
}

/** G3: the env a CLI spawn carries — EXACTLY the allowlist, every base / proxy the mock's origin, the only token the run's fake */
function assertEnv(env, { base, root, oat, proxied }) {
  const bad = (k, why) => { throw refusal('env', `${k}: ${why}`); };
  for (const k of Object.keys(env)) if (!ENV_ALLOW.includes(k)) bad(k, 'not in the allowlist');
  for (const k of BASE_KEYS) if (env[k] !== base) bad(k, 'not the loopback mock');
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT !== base + '/otel') bad('OTEL_EXPORTER_OTLP_ENDPOINT', 'not the loopback mock');
  if (proxied) for (const k of PROXY_KEYS) if (env[k] !== base) bad(k, 'the proxy is not the loopback mock');
  for (const k of ['HOME', 'TMPDIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) if (env[k] !== undefined && !inside(env[k], root)) bad(k, 'outside the scratch');
  if (env.CLAUDE_CODE_OAUTH_TOKEN !== undefined && env.CLAUDE_CODE_OAUTH_TOKEN !== oat) bad('CLAUDE_CODE_OAUTH_TOKEN', 'not this run\'s fake');
  if (env.DISABLE_AUTOUPDATER !== '1') bad('DISABLE_AUTOUPDATER', 'the CLI may update itself');
  if (env.BROWSER !== undefined && env.BROWSER !== NO_BROWSER) bad('BROWSER', 'an opener that could open the URL');
  if (env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC !== '1') bad('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'the CLI\'s optional traffic is on');
}

/** THE TRACE'S GRAMMAR (acceptance r2 item 1; r3 item 2). EVERY line `strace -f --always-show-pid -tt -q` writes is one of
 *    `PID HH:MM:SS.us call(args) = result`              a call
 *    `PID HH:MM:SS.us call(args <unfinished ...>`       a call another thread interrupted (its result comes later)…
 *    `PID HH:MM:SS.us <... call resumed>rest) = result`  …and its other half — joined by pid before anything judges it
 *    `PID HH:MM:SS.us +++ exited with N +++` / `+++ killed by SIG… +++` / `+++ superseded by execve in pid N +++`   a death
 *    `PID HH:MM:SS.us --- SIG… ---`                     a signal
 *  anything else — a line longer than 64 KiB (strace -s 256 never writes one), a resumed half with no opening, a broken last line —
 *  is UNPARSED. A half left open when its process's death line arrives was CUT by that death (`cut`: it never returned to user
 *  code); a half left open at the end of the record is DANGLING. → {lines, unparsed, fragment, joined, cut, dangling, exits, root} */
const MAX_TRACE_LINE = 65536;
// THE RECORD HAS A SIZE (acceptance r4 tidy 4): one launch's record is kept whole up to this many characters (strace escapes every
// non-ASCII byte, so a character is a byte; a clean 2.1.321 variant writes 263 KB) — past it the run VOIDS `trace-oversize`, never a
// record cut short and judged
const MAX_RECORD = 64 * 1024 * 1024;
function parseTrace(txt) {
  const out = { lines: [], unparsed: [], fragment: false, joined: 0, cut: [], dangling: [], exits: new Set(), deaths: [], root: null };
  const all = String(txt || '').split('\n');
  if (all.length && all[all.length - 1] !== '') out.fragment = true;
  all.pop();
  const pending = new Map(); // pid → {call, head}
  const bad = (l) => out.unparsed.push(l.length > 200 ? `${l.slice(0, 200)} … (${l.length} chars)` : l);
  const call = (pid, tt, body) => { const m = /^(\w+)\((.*)\)\s+=\s+(.*)$/s.exec(body); if (!m) return false; out.lines.push({ pid, tt, call: m[1], args: m[2], result: m[3], line: `${pid} ${tt} ${body}` }); return true; };
  for (const l of all) {
    if (l === '') continue;
    if (l.length > MAX_TRACE_LINE) { bad(l); continue; }
    const h = /^(\d+)\s+(\d\d:\d\d:\d\d\.\d+)\s+(.*)$/.exec(l);
    if (!h) { bad(l); continue; }
    const pid = +h[1], tt = h[2], rest = h[3];
    if (out.root === null) out.root = pid;
    if (/^\+\+\+ (?:exited with -?\d+|killed by SIG\w+(?: \(core dumped\))?|superseded by execve in pid \d+) \+\+\+$/.test(rest)) {
      const p = pending.get(pid); if (p) { out.cut.push({ pid, call: p.call }); pending.delete(pid); }
      out.exits.add(pid); out.deaths.push({ pid, at: out.lines.length }); continue; // `at`: the calls before it (guardedReadsOf drops the pid there)
    }
    if (/^--- .* ---$/.test(rest)) continue;
    let m = /^<\.\.\. (\w+) resumed>(.*)$/.exec(rest);
    if (m) {
      const p = pending.get(pid);
      if (!p || p.call !== m[1]) { bad(l); continue; }
      pending.delete(pid);
      if (/^ <unfinished \.\.\.>\)\s+=\s+\?$/.test(m[2])) { out.cut.push({ pid, call: p.call }); continue; } // resumed only to be cut
      if (!call(pid, tt, p.head + m[2])) bad(l); else out.joined++;
      continue;
    }
    m = /^(\w+)\((.*) <unfinished \.\.\.>$/.exec(rest);
    if (m) { if (pending.has(pid)) { bad(l); continue; } pending.set(pid, { call: m[1], head: `${m[1]}(${m[2]}` }); continue; }
    if (!call(pid, tt, rest)) bad(l);
  }
  out.dangling = [...pending].map(([pid, p]) => ({ pid, call: p.call }));
  out.lines.deaths = out.deaths;
  return out;
}
/** the calls that open, reach or start something: one CUT by its process's death is never exempt (the record cannot say what it
 *  did) — every other cut call is (a process that died inside a wait / a read returned nothing to anyone) */
const OPEN_CALLS = new Set(['open', 'openat', 'openat2', 'creat', 'open_by_handle_at', 'name_to_handle_at', 'connect', 'sendto', 'sendmsg', 'sendmmsg', 'execve', 'execveat']);
/** does the record account for every call? → null, or {void, why}. `ended`: the stream reached its end; `killed`: the tracer had
 *  to be killed (something it traced outlived the run) — then the record did not end by itself */
function recordGap(p, { ended = true, killed = false, oversize = false } = {}) {
  if (oversize) return { void: 'trace-oversize', why: `the record grew past ${MAX_RECORD / 1048576} MiB` };
  if (p.unparsed.length) return { void: 'trace-unparsed', why: `a line the fence cannot read (${String(p.unparsed[0]).slice(0, 120)})` };
  if (p.fragment) return { void: 'trace-unparsed', why: 'the record ends in a broken line' };
  if (killed) return { void: 'trace-unfinished', why: 'the tracer had to be killed — the record did not end by itself' };
  if (!ended) return { void: 'trace-unfinished', why: 'the record never reached its end' };
  if (p.root === null || !p.exits.has(p.root)) return { void: 'trace-unfinished', why: 'the record has no death line of its first process' };
  if (!p.lines.length) return { void: 'trace-unfinished', why: 'the record holds no call — a death line alone is not a measurement' }; // r4 tidy 5
  if (p.dangling.length) return { void: 'trace-unfinished', why: `a call with no end (${p.dangling[0].call}, pid ${p.dangling[0].pid})` };
  const cutOpen = p.cut.find((c) => OPEN_CALLS.has(c.call));
  if (cutOpen) return { void: 'trace-unfinished', why: `a ${cutOpen.call} cut by its process's death (pid ${cutOpen.pid})` };
  return null;
}
/** THE DOORS THE TRACE CANNOT SEE THROUGH (r3 item 3): io_uring opens files with no openat line; a handle open, another
 *  process's memory or fds reach what the fence judges by path. Each is traced AND made to fail by the tracer (io_uring_setup ⇒
 *  ENOSYS: the runtime falls back to plain calls; the rest ⇒ EPERM); one that SUCCEEDED anyway VOIDS the run (`door`) */
const DOOR_CALLS = ['io_uring_setup', 'io_uring_enter', 'io_uring_register', 'open_by_handle_at', 'name_to_handle_at', 'pidfd_getfd', 'process_vm_readv', 'process_vm_writev', 'ptrace'];
const DENIED_DOORS = ['open_by_handle_at', 'name_to_handle_at', 'pidfd_getfd', 'process_vm_readv', 'process_vm_writev', 'ptrace'];
const TRACE_SET = ['%file', '%network', '%process', 'inotify_add_watch', 'openat2', 'pidfd_open', ...DOOR_CALLS].join(',');
const doorsOpenedOf = (lines) => lines.filter((s) => DOOR_CALLS.includes(s.call) && /^\d+/.test(String(s.result || '').trim())).map((s) => `${s.call} = ${String(s.result).trim().slice(0, 40)}`);

/** the socket address a connect / sendto / sendmsg / sendmmsg line NAMES (acceptance r2 (b)): the first `sa_family=` OUTSIDE every
 *  quoted string — a payload that spells `sa_family=AF_INET…` inside its bytes is data, never the destination. → {fam, addr, port,
 *  path} or null (no address: a send on a connected socket, judged at its connect) */
function sockaddrOf(line) { const all = sockaddrsOf(line); return all.length ? all[0] : null; }
/** …EVERY address a line names (sendmmsg carries one per message): each `sa_family=` outside every quoted string, in order */
function sockaddrsOf(line) {
  const s = String(line || ''); const out = [];
  for (let i = 0, str = false; i < s.length; i++) {
    const c = s[i];
    if (str) { if (c === '\\') { i++; continue; } if (c === '"') str = false; continue; }
    if (c === '"') { str = true; continue; }
    if (!s.startsWith('sa_family=', i)) continue;
    const r = s.slice(i);
    const fam = (/^sa_family=(AF_[A-Z0-9]+)/.exec(r) || [])[1] || null;
    if (fam === 'AF_INET') { const m = /^sa_family=AF_INET, sin_port=htons\((\d+)\), sin_addr=inet_addr\("([^"]+)"\)/.exec(r); out.push({ fam, port: m ? m[1] : null, addr: m ? m[2] : null }); }
    else if (fam === 'AF_INET6') { const m = /^sa_family=AF_INET6, sin6_port=htons\((\d+)\),[^}]*?inet_pton\(AF_INET6, "([^"]+)"/.exec(r); out.push({ fam, port: m ? m[1] : null, addr: m ? m[2] : null }); }
    else if (fam === 'AF_UNIX') { const m = /^sa_family=AF_UNIX(?:, sun_path=(@?"(?:[^"\\]|\\.)*"|@[^,}]*))?/.exec(r); out.push({ fam, path: m && m[1] ? m[1] : null }); }
    else out.push({ fam });
    i += 'sa_family='.length - 1;
  }
  return out;
}

/** LAW F — the classifier, PURE (acceptance r3: a reader can run it on lines of their own): a connect / sendto / sendmsg /
 *  sendmmsg line ⇒ the first destination that is not the mock's port {addr, port, result}, `{netlink: true}` when it only names
 *  the kernel, or null. EVERY destination the call names is judged (sendmmsg: one per message), each read from the ADDRESS argument
 *  (sockaddrsOf: outside every quoted payload). Off the netns rung only AF_INET 127.0.0.1:<port> passes; the netns rung passes any
 *  loopback address (its namespace is the fence) */
function outboundOf(line, { port, netns = false, lo = [] } = {}) {
  if (!/\b(?:connect|sendto|sendmsg|sendmmsg)\(/.test(line)) return null;
  const result = (/\)\s*=\s*(.*)$/.exec(line) || [])[1] || '?';
  let netlink = false;
  for (const sa of sockaddrsOf(line)) {
    if (!sa.fam || sa.fam === 'AF_UNSPEC') continue;
    if (!netns) {
      if (sa.fam === 'AF_NETLINK') { netlink = true; continue; }
      if (sa.fam === 'AF_INET' && sa.addr === '127.0.0.1' && Number(sa.port) === Number(port)) continue;
      return { addr: sa.fam === 'AF_UNIX' ? 'unix:' + (sa.path || '?') : (sa.addr || sa.fam), port: sa.port || '-', result };
    }
    if (!/\bconnect\(/.test(line) || !/^AF_INET6?$/.test(sa.fam)) continue;
    if (isLoopbackAddr(sa.addr || '?', lo)) continue;   // 127/8, ::1, ::ffff:127/8 — and an address ON lo in the namespace (ci-344-reds)
    return { addr: sa.addr || '?', port: sa.port || '?', result };
  }
  return netlink ? { netlink: true } : null;
}

/** a line's text OUTSIDE every quoted string — each "…" kept as "" (its escapes honoured) and a backslash outside quotes taken with
 *  the next character (strace -y prints a `"` in a path as \" — measured): what the RECORD says, never what a payload spells
 *  (acceptance r4 tidy 1: a write whose bytes hold `= 5</data/x>` made a clean build unpassable) */
function unquoted(line) {
  const s = String(line || ''); let out = '';
  for (let i = 0, str = false; i < s.length; i++) {
    const c = s[i];
    if (str) { if (c === '\\') { i++; continue; } if (c === '"') { str = false; out += '"'; } continue; }
    if (c === '\\') { out += s.slice(i, i + 2); i++; continue; }
    if (c === '"') { str = true; out += '"'; continue; }
    out += c;
  }
  return out;
}
/** a call's arguments, split at the commas outside every quoted string and bracket (`{…}`, `[…]`, `(…)`, and -y's `<path>`, which
 *  prints a comma raw — measured) */
function argsOf(text) {
  const s = String(text || ''); const out = []; let cur = '', depth = 0;
  for (let i = 0, str = false; i < s.length; i++) {
    const c = s[i];
    if (str) { cur += c; if (c === '\\') { cur += s[i + 1] || ''; i++; } else if (c === '"') str = false; continue; }
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (c === '"') { str = true; cur += c; continue; }
    if ('{[(<'.includes(c)) depth++; else if ('}])>'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unC = (x) => x.replace(/\\(x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/g, (m, e) => (e[0] === 'x' ? String.fromCharCode(parseInt(e.slice(1), 16)) : /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ({ n: '\n', t: '\t', r: '\r', v: '\v', f: '\f' })[e] || e));
const strArg = (a) => { const m = /^"((?:[^"\\]|\\.)*)"(?:\.\.\.)?$/.exec(String(a || '')); return m ? unC(m[1]) : null; };
const dirArg = (a) => { const m = /^(?:AT_FDCWD|\d+)<(\/.*)>$/.exec(String(a || '')); return m ? unC(m[1]) : null; };
/** A LINK'S OR A RENAME'S SOURCE (acceptance r4 tidy 3): a file hard-linked or moved out of a deny root into an allowed name, then
 *  opened there, resolves to the allowed name — so the SOURCE argument of link / linkat / rename / renameat / renameat2 / symlink /
 *  symlinkat is judged as an open's resolved path is. A relative source is read against its dirfd's path (strace -y prints it) or,
 *  for a symlink, its link's own directory; a relative one with neither — plain link / rename from a cwd the record does not
 *  print — cannot be placed: judged as such (a clean 2.1.321 run renames only absolute paths — measured, 12 of 12). →
 *  the source's path, {relative} or null */
const LINK_CALLS = new Set(['link', 'linkat', 'rename', 'renameat', 'renameat2', 'symlink', 'symlinkat']);
function linkSourceOf(s) {
  if (!LINK_CALLS.has(s.call)) return null;
  const a = argsOf(s.args);
  const at = /at2?$/.test(s.call) && s.call !== 'symlinkat';
  const name = strArg(at ? a[1] : a[0]);
  if (name === null) return null;
  if (name.startsWith('/')) return path.posix.normalize(name);
  let base = null;
  if (at) base = dirArg(a[0]);
  else if (s.call === 'symlink') { const lp = strArg(a[1]); base = lp && lp.startsWith('/') ? path.posix.dirname(lp) : null; }
  else if (s.call === 'symlinkat') { const lp = strArg(a[2]), d = dirArg(a[1]); const full = lp === null ? null : lp.startsWith('/') ? lp : d ? path.posix.join(d, lp) : null; base = full ? path.posix.dirname(full) : null; }
  return base ? path.posix.join(base, name) : { relative: name };
}

/** P4 — DENY BY DEFAULT (law E): every file a traced process OPENED (strace -y prints the resolved path behind the returned fd,
 *  `= 3</real/path>`, so a relative or a dirfd-relative open is judged by where it really landed — read OUTSIDE every quoted
 *  payload) — VOID when it lies under a `deny` root (the person's real home, the hub's data dir) and under no `allow` root (the
 *  run's scratch, the binary's install), or under a `guarded` root (/etc/claude-code, /home/claude/.claude/remote); a link's or a
 *  rename's SOURCE likewise (linkSourceOf). A lookup that answered ENOENT is the fence holding. */
function guardedReadsOf(lines, roots, { deny = [], allow = [], runPids = null, deaths = null } = {}) {
  const hit = new Set();
  // ANOTHER PROCESS IS A CREDENTIAL STORE (r2 item 3; r3 item 4): /proc/<pid>/… (environ, mem, cmdline, fd, task/<tid>/…) of a
  // process that is not one of this run's — judged on the RESOLVED path and on the path ARGUMENT (a /proc/<pid>/fd/N resolving to
  // pipe:[…] or /dev/null is still another process's). A pid is the run's from the line it first appears on, or from the clone /
  // fork that made it — a pid that joins LATER was not the run's when it was opened, and a pid LEAVES at its death line (r4 tidy 8:
  // a number reused after that is someone else's until a clone of the run names it again)
  const seen = new Set();
  const gone = deaths || lines.deaths || []; let di = 0;
  const own = (n) => (runPids ? runPids.has(n) : seen.has(n));
  const procPid = (p) => { const m = /^\/proc\/(\d+)(?:\/|$)/.exec(p); return m ? +m[1] : null; };
  const foreignProc = (p) => { const n = procPid(p); return n !== null && !own(n); };
  const judge = (p) => { if (roots.some((r) => inside(p, r))) return true; if (foreignProc(p)) return true; return deny.some((d) => inside(p, d)) && !allow.some((a) => inside(p, a)); };
  for (let i = 0; i < lines.length && hit.size < 8; i++) {
    while (di < gone.length && gone[di].at <= i) seen.delete(gone[di++].pid);
    const s = lines[i];
    if (Number.isFinite(s.pid)) seen.add(s.pid);
    const line = s.line || '';
    for (const m of unquoted(line).matchAll(/=\s*\d+<(\/[^>]*)>/g)) { const r = unC(m[1]); if (judge(r)) hit.add(r.slice(0, 160)); } // an opened fd's real path
    const res = s.result !== undefined ? /^\s*(-?\d+)/.exec(String(s.result)) : /\)\s*=\s*(-?\d+)/.exec(line);
    if (res && Number(res[1]) >= 0) {
      // the path ARGUMENTS of a call that succeeded: absolute, or relative to the dirfd / cwd strace -y printed beside it
      for (const m of String(s.args || '').matchAll(/(?:^|[(, ])(?:(?:AT_FDCWD|\d+)<(\/[^>]*)>, )?"([^"]+)"/g)) {
        const p = m[2].startsWith('/') ? m[2] : m[1] ? path.posix.join(m[1], m[2]) : null;
        if (p && (roots.some((r) => inside(p, r)) || foreignProc(p))) hit.add(p.slice(0, 160));
      }
      const src = linkSourceOf(s);
      if (src && typeof src === 'object') hit.add(`${s.call} of «${src.relative.slice(0, 80)}» from a directory the record does not name`);
      else if (src && judge(src)) hit.add(src.slice(0, 160));
    }
    if (/^(?:clone3?|v?fork)$/.test(s.call || '')) { const k = /^\s*(\d+)/.exec(String(s.result || '')); if (k) seen.add(+k[1]); } // a new pid of this run, from here on
  }
  return [...hit];
}

/** the binary's bytes, streamed (1 MiB chunks: 342 MB = 340 ms, the loop's worst gap 1 ms — measured) */
function sha256Of(file) {
  return new Promise((resolve) => {
    let size = 0; const h = crypto.createHash('sha256');
    fs.createReadStream(file, { highWaterMark: 1 << 20 }).on('data', (b) => { size += b.length; h.update(b); }).on('error', () => resolve({ sha256: null, size: null })).on('end', () => resolve({ sha256: h.digest('hex'), size }));
  });
}
const orderOf = (list) => { const oat = list.filter((v) => OAT_VARIANTS.includes(v)).sort((a, b) => RUN_ORDER.indexOf(a) - RUN_ORDER.indexOf(b)); return [...oat, ...list.filter((v) => !OAT_VARIANTS.includes(v) && v !== MINT_VARIANT), ...(list.includes(MINT_VARIANT) ? [MINT_VARIANT] : [])]; }; // the mint last (lane oat-add-door): the gate and the record complete before it
/** the gate's verdict: PASS only when the three are PASS, nothing escaped and nothing voided the run */
function gateOf(results, { cli, binary, aborted, ms, void: runVoid = undefined }) {
  const gate = {}; for (const g of OAT_IN_FILE_GATE) { const r = results.find((x) => x.variant === g); gate[g] = r ? { verdict: r.verdict, note: r.note } : { verdict: 'MISSING', note: '' }; }
  const voided = runVoid ? { void: runVoid } : results.find((x) => x.void);
  return { cli, sha256: binary && binary.sha256, pass: !aborted && !voided && OAT_IN_FILE_GATE.every((g) => gate[g].verdict === 'PASS'), gate, ...(voided ? { void: voided.void } : {}), ...(aborted ? { aborted: true } : {}), ms };
}
/** A HANDLE IS LIVE until node says how it ended (acceptance r4 tidy 6): a child that died BY A SIGNAL keeps `exitCode` null for
 *  ever (its `signalCode` is set) — `exitCode == null` alone would signal the group of a reaped pid (the KILL LAW: only what the
 *  run holds) */
const isLive = (c) => !!c && c.exitCode == null && c.signalCode == null;
function killAll() { for (const c of LIVE) { if (isLive(c)) { try { process.kill(-c.pid, 'SIGKILL'); } catch { } } } LIVE.clear(); } // the tracers this process spawned; the kernel ends their tracees (EXITKILL)

/** ONE measurement run ⇒ the record (the script's --out shape). o: {claude, rung: 'netns'|'loopback-real'|'fake', variants,
 *  root?, gapMs?, flushMs?, nearMs?, keep?, dump?, guarded?, forbid?, strace?, onGate?, log?}. Throws a refusal by name. */
async function measure(o = {}) {
  const T0 = Date.now();
  const RUNG = o.rung; const NETNS = RUNG === 'netns'; const LOOPBACK_REAL = RUNG === 'loopback-real';
  const log = typeof o.log === 'function' ? o.log : (s) => process.stderr.write(s);
  const CANARY = crypto.randomBytes(12).toString('hex');
  // ── THE EVENTS: what the CLI did to the mock, the pipes or this process (never a crash) ──
  const EVENTS = []; let VARIANT = null;
  const seenErr = new WeakSet(), sockKind = new WeakMap();
  const scrub = (x) => String(x ?? '').replace(/sk-ant-[A-Za-z0-9]+-[A-Za-z0-9_-]+/g, '<token>').slice(0, 160);
  const event = (where, e, code) => {
    try {
      if (e && typeof e === 'object') { if (seenErr.has(e)) return; seenErr.add(e); } // one error, one event (a socket's and its clientError's)
      const ev = { t: Date.now(), variant: VARIANT, where, code: code || e?.code || null, what: scrub(e?.message ?? e) };
      EVENTS.push(ev);
      log(`[measure] event (${VARIANT || '-'}) ${where} ${ev.code || ''}: ${ev.what}\n`);
    } catch { }
  };
  process.on('uncaughtException', (e) => event('process uncaughtException', e));
  process.on('unhandledRejection', (e) => event('process unhandledRejection', e));
  const CLAUDE = resolveClaude(RUNG, o.claude);
  const GAP = Number(o.gapMs ?? 65000);
  const FLUSH_MS = Number(o.flushMs ?? 2500);   // the OTel batch's flush wait after the last turn
  const NEAR_MS = Number(o.nearMs ?? 30000);    // oat-file-near: expiresAt = start + this
  const ROOT = o.root || `/tmp/vs-hotsw-${process.pid}`;
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  // THE FENCES BEFORE ANYTHING RUNS (lane cli-self-measure, law 3 G2 / G6 / G7): refused by name, nothing started
  { const no = preflight({ root: ROOT, guarded: o.guarded, forbid: o.forbid, strace: o.strace, dataDir: o.dataDir }); if (no) { if (!o.keep) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } } throw no; } }
  const BINARY = { path: CLAUDE, ...(await sha256Of(CLAUDE)) }; // the ledger's key: the bytes that run (law 1)
  // LAW E — DENY BY DEFAULT: an open under the person's real home (getpwuid's, which the CLI reads whatever HOME says) or the hub's
  // data dir voids the run unless it lies in the run's scratch or the binary's own install (a clean 2.1.321 run opens NOTHING there)
  // — and the ONE interpreter file a #! CLI runs under (an npm install, the suite's fake: node opens its own binary, measured; the
  // child's PATH puts this node first). The FILE, never its directory: a global node_modules beside it stays denied
  // The install DIR is allowed only when it holds no deny root (a binary dropped straight into the home or the data dir would
  // otherwise allow the whole of it — found by test-oat-measure-fake's own wrapper): then only the binary FILE is allowed
  // THE RECORD'S STREAM (acceptance r3 item 1; its limit said in r4 — the header): the tracer writes its record to ITS OWN stderr —
  // a socket this process holds (node's stdio pipes are socketpairs: a socket cannot be reopened through /proc) — and the first
  // traced process is the TRAMPOLINE (src/claude-oat-trampoline.js, copied into the scratch: node reads a script's package.json up
  // its tree, and the shipped file's tree is the person's home), which hands the binary a different stderr. No file of the record
  // exists; the judge reads only the stream. What it buys: the build's own writes and an accident cannot damage the record — not a
  // record a build that sets out to deceive cannot falsify. THE LAUNCHER IS THE SHIPPED ONE AT EVERY LAUNCH (r4 tidy 2): the copy
  // sits in the scratch, writable by the run — before each launch it is compared with the shipped bytes, and a difference VOIDS
  // `launcher-changed` (a tripwire, not a wall)
  const STRACE = o.strace || 'strace';
  const TRAMP = path.join(ROOT, '.trampoline.js');
  const SHIPPED_TRAMP = fs.readFileSync(path.join(__dirname, 'claude-oat-trampoline.js'));
  fs.writeFileSync(TRAMP, SHIPPED_TRAMP, { mode: 0o600 });
  const launcherAsShipped = () => { try { return fs.readFileSync(TRAMP).equals(SHIPPED_TRAMP); } catch { return false; } };
  // `o.home` ADDS a deny root (a suite's scratch stand-in for a person's home — the incident's cell, driven); it never replaces REAL_HOME
  const DENY = [REAL_HOME, o.home, o.dataDir].filter(Boolean).map(realOr);
  const INSTALL = path.dirname(realOr(CLAUDE));
  const ALLOW = [realOr(ROOT), DENY.some((d) => inside(d, INSTALL)) ? realOr(CLAUDE) : INSTALL, realOr(process.execPath)];
  // the namespace's lo addresses (127/8, ::1 and the resolver the outer rung pinned there) and the resolver the CLI asks
  const LO_ADDRS = NETNS ? (() => { try { return execFileSync('ip', ['-o', 'addr', 'show', 'dev', 'lo'], { encoding: 'utf8' }).split('\n').map((l) => (/\binet6?\s+([^/\s]+)/.exec(l) || [])[1]).filter(Boolean); } catch { return []; } })() : [];
  const RESOLVER = nameserversOf();
  if (NETNS) log(`[measure] resolver ${RESOLVER.join(', ') || '(none)'} — ${RESOLVER.every((a) => isLoopbackAddr(a, LO_ADDRS)) ? 'on lo' : 'NOT on lo: a lookup ABORTS the run'}\n`);
  // Refuse unless the namespace really has no route out (the whole point).
  if (NETNS) {
    const routes = execFileSync('ip', ['-o', 'link'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (routes.some((l) => !/\blo:/.test(l))) throw refusal('netns', 'not in a loopback-only namespace');
  }

  const ORG = { A: 'aaaaaaaa-0000-4000-8000-00000000000a', B: 'bbbbbbbb-0000-4000-8000-00000000000b', O: 'cccccccc-0000-4000-8000-00000000000c', HOME: 'eeeeeeee-0000-4000-8000-00000000000e' };
  const UTIL = { A: 0.11, B: 0.22, O: 0.33 };
  // member O's long-lived token: oat-shaped (prefix, ~108 chars, AA tail), FAKE, new every run
  const OAT = `${OAT_PFX}-FAKE-O-${crypto.randomBytes(43).toString('hex').slice(0, 86)}AA`;

  // ── the mock ──────────────────────────────────────────────────────────────
  const M = { reqs: [], heads: [], otel: [], oauth: [], other: [], escapes: [], foreign: [], mode: { reject429: new Set(), fail401: new Set() }, gen: { A: 1, B: 1 } };
  const acctOf = (tok) => { if (tok && tok === OAT) return 'O'; const m = /FAKE-([AB])-/.exec(String(tok || '')); return m ? m[1] : null; };
  // a credential in any output = its label (member + generation), never its bytes
  const label = (tok) => { if (!tok) return tok; if (tok === OAT) return '<O oat>'; const m = /FAKE-([AB])-(r?)(\d+)$/.exec(String(tok)); return m ? `<${m[1]} ${m[2] ? 'refresh' : 'token'} ${m[3]}>` : '<unknown token>'; };
  const now = () => Date.now();
  const rlHeaders = (a, rejected) => {
    const t = Math.floor(now() / 1000);
    const h = {
      'anthropic-ratelimit-unified-status': rejected ? 'rejected' : 'allowed',
      'anthropic-ratelimit-unified-5h-status': rejected ? 'rejected' : 'allowed',
      'anthropic-ratelimit-unified-5h-utilization': String(rejected ? 1 : UTIL[a] || 0.5),
      'anthropic-ratelimit-unified-5h-reset': String(t + 3600),
      'anthropic-ratelimit-unified-7d-status': 'allowed',
      'anthropic-ratelimit-unified-7d-utilization': String((UTIL[a] || 0.5) / 2),
      'anthropic-ratelimit-unified-7d-reset': String(t + 5 * 86400),
      'anthropic-ratelimit-unified-representative-claim': 'five_hour',
      'anthropic-ratelimit-unified-reset': String(t + 3600),
      'anthropic-ratelimit-unified-fallback-percentage': '0.5',
      'anthropic-ratelimit-unified-overage-status': 'rejected',
      'anthropic-ratelimit-unified-overage-disabled-reason': 'org_level_disabled',
      'request-id': `req_${a || 'x'}_${M.reqs.length}`,
    };
    return h;
  };
  const sse = async (res, model, text, headers) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', ...headers });
    const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    ev('message_start', { type: 'message_start', message: { id: 'msg_' + Math.random().toString(16).slice(2), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
    ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    if (M.mode.slowMs) {
      // a LONG block: deltas trickle for slowMs (does the record's timestamp name its start or its end?)
      const steps = 10;
      for (let i = 0; i < steps; i++) { await new Promise((r) => setTimeout(r, M.mode.slowMs / steps)); ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } }); }
    }
    ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
    ev('content_block_stop', { type: 'content_block_stop', index: 0 });
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } });
    ev('message_stop', { type: 'message_stop' });
    res.end();
  };
  let PORT = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('error', (e) => event('request', e));
    res.on('error', (e) => event('response', e));
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { answer(); } catch (e) { event('route', e); try { if (!res.headersSent) res.writeHead(500); res.end(); } catch { } } });
    function answer() {
      let url = req.url || '';
      // the proxy recorder: an absolute-form request is a call that meant to leave — only our own origin is served
      if (/^https?:\/\//i.test(url)) {
        let u = null; try { u = new URL(url); } catch { }
        if (!u || !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || Number(u.port) !== PORT) { M.escapes.push({ t: now(), via: 'proxy', what: `${req.method} ${url.slice(0, 120)}` }); res.writeHead(403); res.end(); return; }
        url = u.pathname + u.search;
      }
      if (url === '/__vs-canary') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(CANARY); return; } // law 3 G4: the mock is OURS
      const auth = String(req.headers.authorization || '');
      const scheme = /^Bearer\s/i.test(auth) ? 'bearer' : req.headers['x-api-key'] ? 'x-api-key' : 'none';
      const tok = auth.replace(/^Bearer\s+/i, '') || String(req.headers['x-api-key'] || '');
      const a = acctOf(tok);
      if (tok && !a) M.foreign.push({ t: now(), where: url.split('?')[0].slice(0, 60) }); // law 3 P1: a token this run never made
      let j = null; try { j = JSON.parse(body); } catch { }
      if (url.startsWith('/otel')) {
        for (const rl of j?.resourceLogs || []) for (const sl of rl.scopeLogs || []) for (const lr of sl.logRecords || []) {
          const at = {}; for (const x of [...(rl.resource?.attributes || []), ...(lr.attributes || [])]) at[x.key] = x.value?.stringValue ?? x.value?.intValue ?? x.value?.doubleValue ?? x.value?.boolValue;
          M.otel.push({ t: now(), event: at['event.name'] || lr.body?.stringValue, org: at['organization.id'] || null, rid: at.request_id || null, email: at['user.email'] || null, acct: at['user.account_uuid'] || null });
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return;
      }
      if (url.startsWith('/v1/oauth/token')) {
        const rt = j?.refresh_token || '';
        const ra = /FAKE-([AB])-/.exec(rt)?.[1] || null;
        M.oauth.push({ t: now(), kind: 'refresh', refreshToken: label(rt) || '(none)', acct: ra, grant: j?.grant_type || null });
        if (!ra) { if (rt) M.foreign.push({ t: now(), where: '/v1/oauth/token' }); res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return; }
        const g = ++M.gen[ra];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token_type: 'Bearer', access_token: `${OAT_PFX}-FAKE-${ra}-${g}`, refresh_token: `${ORT_PFX}-FAKE-${ra}-r${g}`, expires_in: 28800, scope: 'user:inference user:profile user:sessions:claude_code user:mcp_servers', organization: { uuid: ORG[ra], name: 'Org ' + ra }, account: { uuid: 'acct-' + ra, email_address: ra.toLowerCase() + '@example.invalid' } }));
        return;
      }
      if (url.startsWith('/api/oauth/profile')) {
        M.oauth.push({ t: now(), kind: 'profile', acct: a, scheme });
        res.writeHead(a ? 200 : 401, { 'content-type': 'application/json' });
        res.end(JSON.stringify(a ? { account: { uuid: 'acct-' + a, email: a.toLowerCase() + '@example.invalid', display_name: 'Member ' + a, has_claude_max: true, has_claude_pro: false }, organization: { uuid: ORG[a], name: 'Org ' + a, organization_type: 'claude_max', rate_limit_tier: 'default_claude_max_20x', has_extra_usage_enabled: false, billing_type: 'stripe_subscription' } } : { error: 'unauthorized' }));
        return;
      }
      if (url.startsWith('/v1/messages')) {
        const rec = { t: now(), path: url.split('?')[0], acct: a, scheme, tok: tok ? tok.slice(-8) : null, model: j?.model || null, stream: !!j?.stream, org: req.headers['x-organization-uuid'] || null, status: 200 };
        M.reqs.push(rec);
        if (!url.includes('count_tokens')) {
          // the whole head, the credential as its label (oat-env's byte diff reads these)
          const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, k === 'authorization' ? `${scheme === 'bearer' ? 'Bearer ' : ''}${label(tok)}` : k === 'x-api-key' ? label(tok) : String(v)]).sort(([x], [y]) => (x < y ? -1 : 1)));
          M.heads.push({ t: rec.t, method: req.method, path: url, acct: a, stream: rec.stream, headers, body: j ? { keys: Object.keys(j).sort(), model: j.model || null, max_tokens: j.max_tokens ?? null, betas: j.betas || null, thinking: j.thinking ? Object.keys(j.thinking).sort().join(',') : null, tools: Array.isArray(j.tools) ? j.tools.length : null, system: Array.isArray(j.system) ? j.system.length : typeof j.system } : null });
        }
        if (url.includes('count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":12}'); return; }
        if (a && M.mode.fail401.has(a)) { rec.status = 401; res.writeHead(401, { 'content-type': 'application/json', 'request-id': 'req_401' }); res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'OAuth token has expired. Please obtain a new token or refresh your existing token.' } })); return; }
        if (a && M.mode.reject429.has(a)) { rec.status = 429; res.writeHead(429, { 'content-type': 'application/json', ...rlHeaders(a, true) }); res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Error' } })); return; }
        if (!a) { rec.status = 401; res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); return; }
        const text = `ok from ${a}`;
        if (j?.stream) sse(res, j?.model || 'claude-x', text, rlHeaders(a, false)).catch((e) => event('sse', e));
        else { res.writeHead(200, { 'content-type': 'application/json', ...rlHeaders(a, false) }); res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: j?.model || 'claude-x', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 12, output_tokens: 3 } })); }
        return;
      }
      M.other.push({ t: now(), method: req.method, path: url.slice(0, 120), acct: a, scheme });
      res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
    }
  });
  // a CONNECT is a TLS call that meant to leave (HTTPS_PROXY points here): recorded, refused.
  // Node hands this socket over WITHOUT its own 'error' listener — the 'connection' one below covers it
  server.on('connect', (req, sock) => { sockKind.set(sock, 'CONNECT socket'); M.escapes.push({ t: now(), via: 'CONNECT', what: String(req.url).slice(0, 120) }); sock.end('HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n'); });
  // every socket: a reset / EPIPE on it is an event (Node's own listener runs first and turns a parsed socket's into clientError)
  server.on('connection', (s) => s.on('error', (e) => event(sockKind.get(s) || 'socket', e)));
  // a reset mid-request, a keep-alive dropped, bytes that are not HTTP: recorded, the socket destroyed
  server.on('clientError', (e, sock) => { const p = e?.rawPacket; event('clientError', e, Buffer.isBuffer(p) && p[0] === 0x16 && p[1] === 0x03 ? 'tls-hello-on-plain-port' : null); sock.destroy(); });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', () => { server.off('error', j); r(); }); });
  server.on('error', (e) => event('server', e));
  PORT = server.address().port;
  const BASE = `http://127.0.0.1:${PORT}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // every call that honours a proxy lands in the recorder above instead of the network
  const PROXY_ENV = { HTTPS_PROXY: BASE, HTTP_PROXY: BASE, https_proxy: BASE, http_proxy: BASE, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
  // THE FENCES ANSWER BEFORE THE BINARY STARTS (law 3 G4 + G5): the mock answers its nonce and the proxy recorder refuses a
  // CONNECT (403, recorded) — two raw loopback sockets; the canary's own escape is not the CLI's evidence
  const rawAsk = (head) => new Promise((resolve) => { const s = net.connect(PORT, '127.0.0.1'); let buf = ''; let over = false; const done = () => { if (over) return; over = true; try { s.destroy(); } catch { } resolve(buf); }; s.setTimeout(5000, done); s.on('error', done); s.on('data', (d) => { buf += d; }); s.on('end', done); s.on('close', done); s.write(head); });
  const mockSaid = await rawAsk(`GET /__vs-canary HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`);
  if (!mockSaid.includes(CANARY)) { server.close(); throw refusal('mock', 'the loopback mock did not answer its canary'); }
  const escBefore = M.escapes.length;
  const proxySaid = await rawAsk('CONNECT canary.invalid:443 HTTP/1.1\r\nHost: canary.invalid:443\r\n\r\n');
  if (!/^HTTP\/1\.1 403/.test(proxySaid) || M.escapes.length !== escBefore + 1) { server.close(); throw refusal('proxy', 'the proxy recorder did not refuse its canary CONNECT'); }
  M.escapes.length = escBefore;
  const CANARIES = { mock: 'answered its nonce', proxy: 'refused a CONNECT (403)' };

  const creds = (a, g, expiresAt) => JSON.stringify({ claudeAiOauth: { accessToken: `${OAT_PFX}-FAKE-${a}-${g}`, refreshToken: `${ORT_PFX}-FAKE-${a}-r${g}`, expiresAt, scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' } });
  const readTok = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).claudeAiOauth; } catch { return null; } };
  // the product's primitive, byte for byte (src/account-material.js)
  const repoint = (link, target, credsPath) => {
    const tmp = link + '.swap-' + Math.random().toString(16).slice(2, 10);
    fs.symlinkSync(target, tmp); fs.renameSync(tmp, link);
    if (credsPath) { const n = Date.now() / 1000; fs.utimesSync(credsPath, n, n); }
  };
  const homeConfig = (home) => fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, numStartups: 5, oauthAccount: { accountUuid: 'acct-HOME', emailAddress: 'home@example.invalid', organizationUuid: ORG.HOME, organizationName: 'Org HOME' } }));
  const cliEnv = (home) => ({
    PATH: process.env.PATH, HOME: home, TMPDIR: path.join(path.dirname(home), 'tmp'), USER: process.env.USER || 'u', LANG: 'C.UTF-8', TERM: 'dumb',
    ANTHROPIC_BASE_URL: BASE,
    USE_LOCAL_OAUTH: '1', CLAUDE_LOCAL_OAUTH_API_BASE: BASE, CLAUDE_LOCAL_OAUTH_APPS_BASE: BASE, CLAUDE_LOCAL_OAUTH_CONSOLE_BASE: BASE,
    CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: BASE + '/otel', OTEL_LOGS_EXPORT_INTERVAL: '1000',
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', // the CLI's optional traffic off — on EVERY rung (assertEnv requires it)
  });
  const resetMock = () => { M.reqs = []; M.heads = []; M.otel = []; M.oauth = []; M.other = []; M.foreign = []; M.mode.reject429.clear(); M.mode.fail401.clear(); M.mode.slowMs = 0; M.gen = { A: 1, B: 1 }; };
  const mark = (out) => ({ reqs: M.reqs.length, heads: M.heads.length, otel: M.otel.length, oauth: M.oauth.length, other: M.other.length, escapes: M.escapes.length, out: out.length });

  // ── strace: one parsed line per syscall; connect() classified ──────────────
  const day = new Date(); const ymd = [day.getFullYear(), day.getMonth(), day.getDate()];
  const toMs = (hms) => { const [h, mi, s] = hms.split(':'); const [si, us] = s.split('.'); return new Date(ymd[0], ymd[1], ymd[2], +h, +mi, +si).getTime() + Math.floor(+us / 1000); };
  // LAW F — THE RUN REACHES THE MOCK'S PORT AND NOTHING ELSE: every connect / sendto / sendmsg the tracer saw that names a
  // destination other than 127.0.0.1:<the mock's port> — any family: AF_INET6, a unix path or abstract name, a UDP send with no
  // connect, a lookup through the box's resolver (127.0.0.53 counts as off the box: the query leaves it) — is an escape. NETLINK
  // (the kernel, never off the box) is COUNTED in the record. A send on a connected socket names no address (its connect was
  // judged). The NETNS rung keeps its own rule (the namespace is the fence: anything on its lo, the pinned resolver included).
  let NETLINK = 0; // summed ONCE, by each variant's after-pass (acceptance r2 (c): the belt counted the same lines again)
  const outbound = (line) => outboundOf(line, { port: PORT, netns: NETNS, lo: LO_ADDRS });


  // ── THE ONE LAUNCHER (law D): EVERY run of the vendor's binary — the --version read and each variant — starts here: the env
  // checked against the allowlist, then `setpriv --pdeathsig KILL -- strace --kill-on-exit --always-show-pid -f … -- node
  // <the trampoline> <its stderr file> <the binary> …` in its own session. The RECORD is the tracer's stderr stream (a socket
  // only this process holds), kept whole in memory as it arrives and read live by the belt (an escape SIGKILLs the tracer's
  // group while its handle lives — the kernel ends every tracee with it, law C) ──
  const ESCAPED = [];
  function launch({ args, env, cwd, variant, errFile, onEscape = () => { }, pty = false }) {
    assertEnv(env, { base: BASE, root: ROOT, oat: OAT, proxied: !NETNS || env.HTTPS_PROXY !== undefined }); // law 3 G3: the allowlist, or no spawn
    const child = spawn('setpriv', ['--pdeathsig', 'KILL', '--', STRACE, '--kill-on-exit', '--always-show-pid', '-f', '-tt', '-q', '-y', '-s', '256', '-e', `trace=${TRACE_SET}`, '-e', 'inject=io_uring_setup:error=ENOSYS', '-e', `inject=${DENIED_DOORS.join(',')}:error=EPERM`, process.execPath, '--no-warnings', TRAMP, errFile, ...(pty ? ['--pty'] : []), CLAUDE, ...args],
    { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    LIVE.add(child); child.on('exit', () => LIVE.delete(child));
    const rec = { text: '', ended: false, killed: false, oversize: false };
    let carry = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      // the record is kept whole up to MAX_RECORD; past it nothing more is kept and the run VOIDS by name (r4 tidy 4) — the belt
      // still reads every line to the end
      if (!rec.oversize && rec.text.length + chunk.length > MAX_RECORD) rec.oversize = true;
      if (!rec.oversize) rec.text += chunk;
      const lines = (carry + chunk).split('\n'); carry = lines.pop();
      if (carry.length > MAX_TRACE_LINE) carry = ''; // a line that long is unparsed (the record voids); the belt reads the lines after it
      for (const l of lines) {
        const o = outbound(l);
        if (!o || o.netlink) continue;
        ESCAPED.push({ variant, connect: `${o.addr}:${o.port}`, result: o.result, line: l.slice(0, 200) });
        if (isLive(child)) { rec.killed = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { } } // the tracer's group while its handle lives (r3 (9), r4 tidy 6); the kernel ends every tracee with it
        onEscape();
      }
    });
    const ended = new Promise((r) => { child.stderr.on('end', () => { rec.ended = true; r(); }); child.stderr.on('close', r); });
    child.stderr.on('error', (e) => event('trace stream', e));
    return { child, rec, ended };
  }
  /** the record of one launch, judged whole: the grammar, and whether it accounts for every call (recordGap) */
  const recordOf = (h) => { const p = parseTrace(h.rec.text); const r = p.lines.map((s) => ({ pid: s.pid, t: toMs(s.tt), call: s.call, args: s.args, result: s.result, line: s.line })); r.unparsed = p.unparsed; r.fragment = p.fragment; r.joined = p.joined; r.cut = p.cut; r.deaths = p.deaths; r.gap = recordGap(p, { ended: h.rec.ended, killed: h.rec.killed, oversize: h.rec.oversize }); return r; };
  function startCli({ dir, env, variant }) {
    const waiters = [];
    const errFile = path.join(dir, 'cli.stderr'); // the binary's own stderr (diagnostics only — never judged)
    const h = launch({ args: ['--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio'], env, errFile, cwd: path.join(dir, 'cwd'), variant, onEscape: () => { for (const w of waiters.splice(0)) w(null); } });
    const { child } = h;
    const out = []; let buf = '';
    child.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let o = null; try { o = JSON.parse(line); } catch { continue; }
        out.push({ t: Date.now(), o });
        if (o.type === 'result') for (const w of waiters.splice(0)) w(o);
      }
    });
    // a write into a CLI that is gone (EPIPE), a pipe error, a spawn that failed: events; an exit ends the turn it was in
    child.stdin.on('error', (e) => event('cli stdin', e));
    const endStdin = () => { try { child.stdin.end(); } catch { } }; // the listener above guards it (§101b)
    child.stdout.on('error', (e) => event('cli stdout', e));
    let exited = false;
    const exitP = new Promise((r) => {
      const gone = () => { exited = true; for (const w of waiters.splice(0)) w(null); r(); };
      child.on('exit', gone);
      child.on('error', (e) => { event('cli process', e); if (child.pid === undefined) gone(); });
    });
    const send = (text) => { try { child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n'); } catch { } };
    const turn = async (text, ms = 90000) => { if (ESCAPED.length || exited) return { t: Date.now(), end: Date.now(), result: ESCAPED.length ? 'ABORTED' : 'EXITED' }; const p = new Promise((r) => { waiters.push(r); setTimeout(() => r(null), ms); }); const t = Date.now(); send(text); const r = await p; return { t, end: Date.now(), result: r ? { subtype: r.subtype, is_error: r.is_error, text: String(r.result || '').slice(0, 160) } : (ESCAPED.length ? 'ABORTED' : exited ? 'EXITED' : 'TIMEOUT') }; };
    const stop = async () => {
      endStdin();
      await Promise.race([exitP, sleep(8000)]);
      // something the run traced outlived its stdin: the tracer is killed (strace ignores SIGTERM — measured; SIGKILL its group:
      // the kernel ends every tracee, a setsid grandchild included — law C), and the record says it did not end by itself
      if (isLive(child)) { h.rec.killed = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { } }
      await Promise.race([h.ended, sleep(2000)]);
    };
    const stderr = () => { try { return fs.readFileSync(errFile, 'utf8'); } catch { return ''; } };
    return { out, turn, stop, stderr, record: () => recordOf(h) };
  }

  // THE CLI'S OWN ANSWER, read through THE ONE LAUNCHER (law D) — traced, belted, the env checked, like every variant
  const VERSION_RUN = { traced: false, execs: 0 };
  const version = await (async () => {
    const vdir = path.join(ROOT, 'version');
    for (const d of [path.join(vdir, 'home'), path.join(vdir, 'tmp'), path.join(vdir, 'cwd')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    if (!launcherAsShipped()) { VERSION_RUN.void = 'launcher-changed'; return ''; } // the launcher as shipped, before EVERY launch (r4 tidy 2)
    const vh = launch({ args: ['--version'], env: { ...cliEnv(path.join(vdir, 'home')), ...PROXY_ENV }, errFile: path.join(vdir, 'cli.stderr'), cwd: path.join(vdir, 'cwd'), variant: 'version' });
    const vc = vh.child;
    let txt = ''; vc.stdout.on('data', (d) => { txt += d; });
    await new Promise((r) => { const cap = setTimeout(() => { if (isLive(vc)) { vh.rec.killed = true; try { process.kill(-vc.pid, 'SIGKILL'); } catch { } } r(); }, 60e3); vc.on('exit', () => { clearTimeout(cap); r(); }); vc.on('error', (e) => { event('cli version', e); clearTimeout(cap); r(); }); });
    await Promise.race([vh.ended, sleep(2000)]);
    if (isLive(vc)) { vh.rec.killed = true; try { process.kill(-vc.pid, 'SIGKILL'); } catch { } } // a version run still tracing (a lingering tracee) ends with its tracer
    // the record says this run was traced like every variant (law D): the tracer's own execve lines of the binary
    VERSION_RUN.execs = vh.rec.text.split('\n').filter((l) => /\bexecve\(/.test(l) && l.includes(JSON.stringify(CLAUDE))).length; VERSION_RUN.traced = VERSION_RUN.execs > 0;
    // …and FENCED like every variant (acceptance r2 item 2): its opens judged by the same roots, its record by the same laws
    const vl = recordOf(vh);
    VERSION_RUN.guardedReads = guardedReadsOf(vl, [...(o.guarded || GUARDED).map((g) => g.path), ...(o.forbid || [])], { deny: DENY, allow: ALLOW });
    VERSION_RUN.doors = doorsOpenedOf(vl);
    VERSION_RUN.ioUringSetups = vl.filter((s) => s.call === 'io_uring_setup').length;
    if (vl.gap) VERSION_RUN.gap = vl.gap.why;
    VERSION_RUN.void = VERSION_RUN.guardedReads.length ? 'guarded-read' : vl.gap ? vl.gap.void : VERSION_RUN.doors.length ? 'door' : undefined;
    return txt.trim();
  })();
  log(`[measure] ${CLAUDE} = ${version}${NETNS ? '' : LOOPBACK_REAL ? ' (--no-netns --loopback-real: the REAL claude, no namespace — every base and HTTPS_PROXY on the loopback mock, the strace belt aborts at the first off-loopback connect)' : ' (--no-netns: a FAKE claude on the loopback mock)'}\n`);

  // a variant's events, each placed in the step it happened in
  const eventsOf = (name, steps = []) => EVENTS.filter((e) => e.variant === name).map((e) => ({ at: new Date(e.t).toISOString().slice(11, 23), step: steps.filter((s) => s.t <= e.t).pop()?.step || 'start', where: e.where, code: e.code, what: e.what }));
  async function runVariant(name) {
    VARIANT = name;
    const dir = path.join(ROOT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const home = path.join(dir, 'home'), A = path.join(dir, 'subs', 'sub-A'), B = path.join(dir, 'subs', 'sub-B');
    const linkDir = path.join(dir, 'pool-links', 'pool-t'), link = path.join(linkDir, 'sess-1');
    for (const d of [home, A, B, linkDir, path.join(dir, 'cwd'), path.join(dir, 'tmp')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    homeConfig(home);
    const far = Date.now() + 8 * 3600e3;
    const expA = name === 'refresh' ? Date.now() + 5 * 60e3 + 40e3 : far; // just outside a 5-min buffer at msg1
    fs.writeFileSync(path.join(A, '.credentials.json'), creds('A', 1, expA), { mode: 0o600 });
    // `refresh`: B is ALSO about to expire, so the first request after the move must refresh — the
    // question is WHICH refresh token it spends and WHICH file it writes (A's, the file it opened, or B's)
    fs.writeFileSync(path.join(B, '.credentials.json'), creds('B', 1, name === 'refresh' ? expA : far), { mode: 0o600 });
    const t0 = Date.now() / 1000;
    fs.utimesSync(path.join(A, '.credentials.json'), t0 - 100, t0 - 100);
    fs.utimesSync(path.join(B, '.credentials.json'), t0 - 200, t0 - 200);
    fs.symlinkSync(A, link);
    resetMock();
    if (name === 'gate429') M.mode.reject429.add('A');

    const env = { ...cliEnv(home), CLAUDE_SECURESTORAGE_CONFIG_DIR: link, ...(NETNS ? {} : PROXY_ENV) };
    const { out, turn, stop, stderr: errOf, record } = startCli({ dir, env, variant: name });

    const steps = [];
    const m0 = mark(out);
    const t1 = await turn('one');
    const m1 = mark(out);
    steps.push({ step: 'msg1', ...t1, reqs: M.reqs.slice(m0.reqs, m1.reqs) });
    // ── the change ──
    const credA = path.join(A, '.credentials.json'), credB = path.join(B, '.credentials.json');
    const tChange = Date.now();
    let change = '';
    if (name === 'symlink' || name === 'refresh' || name === 'gate429-later') { repoint(link, B, credB); change = 'repointPoolSymlink(link→B)+utimes(B)'; }
    else if (name === 'symlink-bare') { repoint(link, B, null); change = 'repoint(link→B), no utimes'; }
    else if (name === 'overwrite') { const fd = fs.openSync(credA, 'r+'); const data = fs.readFileSync(credB); fs.ftruncateSync(fd, 0); fs.writeSync(fd, data, 0, data.length, 0); fs.closeSync(fd); change = 'B bytes written in place into A/.credentials.json (same inode)'; }
    else if (name === 'hardlink-mtime') { const tmp = credA + '.hl'; fs.linkSync(credB, tmp); fs.renameSync(tmp, credA); const n = Date.now() / 1000; fs.utimesSync(credA, n, n); change = 'A/.credentials.json := hard link to B (new inode), mtime bumped'; }
    else if (name === 'hardlink-same') { const st = fs.statSync(credA); fs.utimesSync(credB, st.atime, st.mtime); const tmp = credA + '.hl'; fs.linkSync(credB, tmp); fs.renameSync(tmp, credA); change = 'A/.credentials.json := hard link to B (new inode), mtime = A old mtime'; }
    else if (name === 'utimes') { const n = Date.now() / 1000; fs.utimesSync(credA, n, n); change = 'utimes(A) only'; }
    else if (name === 'gate429') { change = 'none yet (msg1 was a 429)'; }
    else if (name === 'baseline') { change = 'none'; }
    else if (name === 'slowstream') { M.mode.slowMs = 25000; change = 'msg2 streams its one text block for 25 s'; }
    const gap = name === 'refresh' ? Math.max(GAP, 60e3) : GAP;
    await sleep(gap);
    const t2 = await turn('two');
    const m2 = mark(out);
    steps.push({ step: 'msg2', change, gapMs: gap, ...t2, reqs: M.reqs.slice(m1.reqs, m2.reqs) });
    if (name === 'gate429') {
      // the pool "moves" the walled process: re-point, then continue
      repoint(link, B, credB);
      const tc2 = Date.now();
      await sleep(Math.min(GAP, 65000));
      const t3 = await turn('three');
      const m3 = mark(out);
      steps.push({ step: 'msg3', change: 'repointPoolSymlink(link→B)+utimes(B) after the 429', changeAt: tc2, ...t3, reqs: M.reqs.slice(m2.reqs, m3.reqs) });
    }
    await sleep(FLUSH_MS); // let the OTel batch flush
    await stop();

    // strace: every syscall naming a creds path, with the wall-clock time
    let credSys = [];
    const recd = record();
    for (const s of recd) {
      const l = s.line;
      if (!/credentials|sess-1|sub-A|sub-B|oauth_refresh/.test(l)) continue;
      const where = /sub-A/.test(l) ? 'A' : /sub-B/.test(l) ? 'B' : /sess-1/.test(l) ? 'link' : '?';
      credSys.push({ t: s.t, call: s.call, where, line: l.slice(0, 220) });
    }
    const phase = (t) => (t < tChange ? 'before-change' : 'after-change');
    const sysSummary = {};
    for (const s of credSys) { const k = `${phase(s.t)}:${s.call}`; sysSummary[k] = (sysSummary[k] || 0) + 1; }
    const inotify = credSys.filter((s) => s.call === 'inotify_add_watch').map((s) => s.line);
    const connects = [];
    for (const s of recd) if (s.call === 'connect' && !/127\.0\.0\.1|sun_path/.test(s.line)) connects.push(s.line.slice(0, 200));
    const rle = out.filter((x) => x.o.type === 'rate_limit_event').map((x) => ({ t: x.t, info: x.o.rate_limit_info || x.o }));
    const res = {
      variant: name, version, change, tChange,
      steps: steps.map((s) => ({ step: s.step, change: s.change, gapMs: s.gapMs, result: s.result, accts: s.reqs.map((r) => `${r.acct || '-'}:${r.status}${r.stream ? '' : '(ns)'}`), orgHeaders: [...new Set(s.reqs.map((r) => r.org).filter(Boolean))] })),
      otel: M.otel.filter((o) => o.event === 'api_request' || /api_request|api_error/.test(o.event || '')).map((o) => ({ phase: phase(o.t), event: o.event, org: o.org })),
      otelEvents: [...new Set(M.otel.map((o) => o.event))],
      oauth: M.oauth.map((o) => ({ phase: phase(o.t), ...o, t: undefined })),
      rateLimitEvents: rle.map((r) => ({ phase: phase(r.t), ...r.info })).slice(0, 8),
      fileAfter: { A: readTok(credA)?.accessToken?.slice(-8), B: readTok(credB)?.accessToken?.slice(-8), link: fs.readlinkSync(link) === B ? 'B' : 'A' },
      credSyscalls: sysSummary,
      credSyscallsAfterChange: credSys.filter((s) => s.t >= tChange).slice(0, 40).map((s) => `${new Date(s.t).toISOString().slice(11, 23)} ${s.where} ${s.line.replace(/^\d+\s+\S+\s+/, '').slice(0, 150)}`),
      inotify, nonLoopbackConnects: connects.length, otherPaths: [...new Set(M.other.map((o) => `${o.method} ${o.path.split('?')[0]}`))],
      stderrTail: errOf().slice(-400),
      events: eventsOf(name, steps),
    };
    if (o.dump) { try { fs.writeFileSync(path.join(o.dump, `stdout-${name}.ndjson`), out.map((x) => JSON.stringify({ at: x.t, rec: x.o })).join('\n') + '\n'); } catch { } }
    return res;
  }

  // ── THE OAT VARIANTS (design q-035 §2 A: the long-lived token as a CLI-shaped creds file) ──
  const SCOPES = ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'];
  const OAT_TTL_MS = 365 * 86400e3; // src/login-state.js OAT_TTL_MS
  // the materialized shape the design writes (no refreshToken); oat-file-scopes drops the declared fields
  const oatCreds = (expiresAt, declared) => JSON.stringify({ claudeAiOauth: declared ? { accessToken: OAT, expiresAt, scopes: SCOPES, subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' } : { accessToken: OAT, expiresAt } });
  const shapeOf = (b) => { try { const o = JSON.parse(b); const c = o.claudeAiOauth; return { keys: Object.keys(o), claudeAiOauth: c && typeof c === 'object' ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k, /token/i.test(k) ? label(v) : v])) : c }; } catch { return 'unparseable'; } };
  const snap = (f) => { try { const b = fs.readFileSync(f); const st = fs.statSync(f); return { sha: crypto.createHash('sha256').update(b).digest('hex').slice(0, 12), size: b.length, ino: st.ino, mtimeMs: Math.round(st.mtimeMs), mode: (st.mode & 0o777).toString(8), shape: shapeOf(b) }; } catch (e) { return { missing: e.code || String(e) }; } };
  const same = (x, y) => !!x && !!y && !x.missing && !y.missing && x.sha === y.sha && x.ino === y.ino && x.mtimeMs === y.mtimeMs;
  const WRITE_CALLS = /^(rename|renameat2?|unlink|unlinkat|rmdir|mkdir|mkdirat|link|linkat|symlink|symlinkat|chmod|fchmodat2?|chown|fchownat|truncate|utimensat|utimes|creat)$/;
  // every syscall that touched a member dir / the link; a write = an open for writing or a call that changes the tree
  const credOpsOf = (lines) => {
    const r = { reads: {}, writes: [], credWrites: 0 };
    for (const s of lines) {
      if (!/sub-A|sub-O|sess-1/.test(s.args)) continue;
      const where = /sub-A/.test(s.args) ? 'A' : /sub-O/.test(s.args) ? 'O' : 'link';
      const write = WRITE_CALLS.test(s.call) || (/^open(at2?)?$/.test(s.call) && /O_WRONLY|O_RDWR|O_CREAT|O_TRUNC/.test(s.args));
      if (!write) { r.reads[where] = (r.reads[where] || 0) + 1; continue; }
      r.writes.push(`${new Date(s.t).toISOString().slice(11, 23)} ${where} ${s.call}(${s.args.slice(0, 160)}`);
      if (/credentials\.json/.test(s.args) && !/\.lock\b/.test(s.args)) r.credWrites++; // a lock dir beside it is listed, not counted
    }
    return r;
  };
  const RESULTS = {};
  async function runOat(name) {
    VARIANT = name;
    const dir = path.join(ROOT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const home = path.join(dir, 'home'), A = path.join(dir, 'subs', 'sub-A'), O = path.join(dir, 'subs', 'sub-O');
    const linkDir = path.join(dir, 'pool-links', 'pool-t'), link = path.join(linkDir, 'sess-1');
    for (const d of [home, A, O, linkDir, path.join(dir, 'cwd'), path.join(dir, 'tmp')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    homeConfig(home);
    const credA = path.join(A, '.credentials.json'), credO = path.join(O, '.credentials.json');
    const tStart = Date.now();
    const expO = name === 'oat-file-near' ? tStart + NEAR_MS : tStart + OAT_TTL_MS;
    fs.writeFileSync(credA, creds('A', 1, tStart + 8 * 3600e3), { mode: 0o600 });
    if (name !== 'oat-env') fs.writeFileSync(credO, oatCreds(expO, name !== 'oat-file-scopes'), { mode: 0o600 });
    const t0 = tStart / 1000;
    fs.utimesSync(credA, t0 - 100, t0 - 100);
    if (name !== 'oat-env') fs.utimesSync(credO, t0 - 200, t0 - 200);
    fs.symlinkSync(name === 'oat-file-switch' ? A : O, link);
    resetMock();
    // both rungs run the oat variants with the proxy recorder, so the namespace changes nothing the CLI sees
    const env = { ...cliEnv(home), ...PROXY_ENV };
    // oat-env = the hub's oat-only spawn today (accounts.resolveForSpawn: localEnv { CLAUDE_CODE_OAUTH_TOKEN }, no creds dir)
    if (name === 'oat-env') env.CLAUDE_CODE_OAUTH_TOKEN = OAT; else env.CLAUDE_SECURESTORAGE_CONFIG_DIR = link;
    const before = { A: snap(credA), O: snap(credO) };
    const cli = startCli({ dir, env, variant: name });
    const steps = [];
    let m = mark(cli.out);
    const step = async (s, text, change, changeAt) => {
      const r = await cli.turn(text); const n = mark(cli.out);
      steps.push({ step: s, change, changeAt, ...r, reqs: M.reqs.slice(m.reqs, n.reqs), heads: M.heads.slice(m.heads, n.heads), oauth: M.oauth.slice(m.oauth, n.oauth), other: M.other.slice(m.other, n.other), escapes: M.escapes.slice(m.escapes, n.escapes) });
      m = n;
    };
    await step('msg1', 'one', 'none');
    if (name === 'oat-file-401') {
      M.mode.fail401.add('O');
      await step('msg2', 'two', 'the mock answers 401 for the oat');
      M.mode.fail401.clear();
      await sleep(GAP);
      await step('msg3', 'three', 'the 401 cleared');
    } else if (name === 'oat-file-near') {
      const msg1Left = expO - steps[0].t;
      await sleep(Math.max(0, expO - Date.now()) + Math.min(3000, NEAR_MS / 10));
      await step('msg2', 'two', `past expiresAt (msg1 was sent ${Math.round(msg1Left / 1000)} s before it)`);
    } else if (name === 'oat-file-switch') {
      const c1 = Date.now(); repoint(link, O, credO);
      await sleep(GAP);
      await step('msg2', 'two', 'repointPoolSymlink(link→O)+utimes(O)', c1);
      const c2 = Date.now(); repoint(link, A, credA);
      await sleep(GAP);
      await step('msg3', 'three', 'repointPoolSymlink(link→A)+utimes(A)', c2);
    } else {
      await sleep(GAP);
      await step('msg2', 'two', 'none');
    }
    await sleep(FLUSH_MS);
    await cli.stop();
    // the harness's own utimes (the switch) is not a CLI write: compare bytes + inode, and mtime only where nobody touched it
    const after = { A: snap(credA), O: snap(credO) };
    const lines = cli.record();
    const ops = credOpsOf(lines);
    const outb = afterPass(lines);
    const r = {
      variant: name, version,
      steps: steps.map((s) => ({ step: s.step, change: s.change, result: s.result, requests: s.reqs.map((q) => `${q.path.replace('/v1/messages', 'msg')} ${q.acct || '-'}:${q.status} ${q.scheme}${q.stream ? '' : ' (ns)'} ${q.model || ''}`.trim()), oauth: s.oauth.map((o) => `${o.kind}:${o.acct || '-'}${o.refreshToken ? ' rt=' + o.refreshToken : ''}`), other: [...new Set(s.other.map((o) => `${o.method} ${o.path.split('?')[0]} ${o.acct || '-'}/${o.scheme}`))], escapes: s.escapes.map((e) => `${e.via} ${e.what}`) })),
      heads: steps.flatMap((s) => s.heads.map((h) => ({ step: s.step, ...h, t: undefined }))),
      files: { before, after },
      credOps: ops,
      outboundConnects: outb,
      stderrTail: cli.stderr().slice(-400),
      events: eventsOf(name, steps),
    };
    Object.assign(r, judge(name, r, steps, before, after, ops));
    // law 3 P1 + P4: a token this run never made reached the mock, or the CLI read a guarded path ⇒ the run proves nothing here
    r.traceJoined = lines.joined || 0; // calls another thread split in two, joined before they were judged (item 1)
    r.foreignTokens = M.foreign.length; r.guardedReads = guardedReadsOf(lines, [...(o.guarded || GUARDED).map((g) => g.path), ...(o.forbid || [])], { deny: DENY, allow: ALLOW });
    if (r.foreignTokens || r.guardedReads.length) { r.void = r.foreignTokens ? 'foreign-token' : 'guarded-read'; r.note += ` · VOID: ${r.foreignTokens ? `${r.foreignTokens} request(s) carried a token this run did not make` : `it read ${r.guardedReads.join(', ')}`}`; }
    else if (lines.gap) { r.void = lines.gap.void; r.traceGap = lines.gap.why; if (lines.unparsed.length) r.unparsed = lines.unparsed.slice(0, 3); r.note += ` · VOID: ${lines.gap.why}`; } // the record accounts for every call, or it proves nothing (r2 item 1, r3 items 1 + 2)
    else { const doors = doorsOpenedOf(lines); if (doors.length) { r.void = 'door'; r.doors = doors; r.note += ` · VOID: a door the trace cannot see through opened (${doors.join(', ')})`; } } // r3 item 3
    r.ioUringSetups = lines.filter((s) => s.call === 'io_uring_setup').length; // each answered ENOSYS by the tracer (the runtime falls back) — counted
    r.cutCalls = (lines.cut || []).map((c) => c.call); // calls cut by their process's death (exempt unless they open — recordGap)
    // the verdict line says what was seen: every event the run survived, by where + code
    if (r.events.length) { const n = {}; for (const e of r.events) { const k = `${e.where} ${e.code || '?'}`; n[k] = (n[k] || 0) + 1; } r.note += ` · ${r.events.length} event${r.events.length === 1 ? '' : 's'} survived (${Object.entries(n).map(([k, c]) => `${k} ×${c}`).join(', ')})`; }
    RESULTS[name] = { r, steps };
    return r;
  }

  // THE AFTER-PASS (acceptance r2 (c)): a variant's record, judged once its run ended — the netlink lines counted ONCE per call
  // (the belt counts none), the off-loopback connects in words. ONE implementation: the oat variants and the mint (lane oat-add-door)
  const afterPass = (lines) => {
    const outs = lines.map((x) => outbound(x.line)).filter(Boolean);
    NETLINK += outs.filter((x) => x.netlink).length;
    return outs.filter((x) => !x.netlink).map((x) => `${x.addr}:${x.port} = ${x.result}`);
  };
  // ── THE MINT'S OWN SCOPES (lane oat-add-door, 2.369.399): what `claude setup-token` asks for when it mints, read off the
  // authorize URL it PRINTS (its `scope=`) — nothing is pasted, nothing minted, no request is needed: the mock's log must stay
  // empty of OAuth calls. The CLI prints nothing on a pipe (measured, 2.1.321), so it runs in a pty: util-linux script(1)
  // (the trampoline's --pty: `script -qfec '<binary>' 'setup-token' /dev/null`) through THE ONE LAUNCHER — traced, belted, the env the allowlist, every
  // fence as every variant. THE RUN ENDS BY THE TRACER'S KILL, BY DESIGN: setup-token waits for a code for ever (measured on
  // 2.1.321 — Ctrl-C twice, Esc and EOF through the pty leave it waiting; a pasted code ends at «OAuth error … Press Enter to
  // retry»), so once the URL is read (or SCOPE_WAIT_MS passes) the tracer's group is SIGKILLed and the kernel ends every tracee
  // with it (law C). Its record is judged up to that instant by every fence that names a call — a guarded read, a door, a
  // foreign token, an escape VOID the run as anywhere; a line the grammar cannot read or an oversize record is this variant's
  // FAIL — and only the «ended by itself» rule (recordGap's killed / death-line / dangling / cut, which the kill makes true by
  // construction) is not asked of it. A mechanical miss (no script(1), no URL, a scope the grammar refuses) is this variant's
  // FAIL — no scopes recorded, way ② of the guided door not offered — and never voids the gate ──
  const SCOPE_WAIT_MS = Number(o.scopeWaitMs) > 0 ? Number(o.scopeWaitMs) : 45e3;
  async function runMint() {
    const name = MINT_VARIANT;
    VARIANT = name;
    const dir = path.join(ROOT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const home = path.join(dir, 'home');
    for (const d of [home, path.join(dir, 'cwd'), path.join(dir, 'tmp')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    homeConfig(home);
    resetMock();
    const r = { variant: name, version, verdict: 'FAIL', note: '', scopes: null, events: [] };
    const env = { ...cliEnv(home), ...PROXY_ENV, TERM: 'xterm-256color', BROWSER: NO_BROWSER };
    const errFile = path.join(dir, 'cli.stderr');
    const h = launch({ pty: true, args: ['setup-token'], env, errFile, cwd: path.join(dir, 'cwd'), variant: name }); // the trampoline's --pty: util-linux script(1) around the binary
    const { child } = h;
    let out = '';
    const seen = new Promise((resolve) => {
      const cap = setTimeout(() => resolve(null), SCOPE_WAIT_MS);
      child.stdout.on('data', (d) => { out += d; if (out.length > 1 << 20) out = out.slice(-(1 << 19)); const m = mintScopesIn(out); if (m) { clearTimeout(cap); resolve(m); } });
      child.on('exit', () => { clearTimeout(cap); resolve(mintScopesIn(out)); });
    });
    child.stdin.on('error', (e) => event('mint stdin', e));
    child.stdout.on('error', (e) => event('mint stdout', e));
    child.on('error', (e) => event('mint process', e));
    const found = await seen;
    await sleep(1000); // the trace stream catches up to the instant the URL was read
    const endedBySelf = !isLive(child);
    if (isLive(child)) { h.rec.killed = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { } } // the tracer's group, this process's own child (law C)
    await Promise.race([h.ended, sleep(3000)]);
    const lines = recordOf(h);
    r.outboundConnects = afterPass(lines);
    r.oauthCalls = M.oauth.length; r.otherCalls = M.other.length;
    // what it printed, the terminal's escapes removed (evidence: setup-token prints a URL — no token is minted here)
    r.printed = out.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, ' ').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b[78=>]/g, '').replace(/\s+/g, ' ').trim().slice(-600);
    r.execs = lines.filter((x) => /\bexecve\(/.test(x.line) && x.line.includes(JSON.stringify(CLAUDE))).length;
    r.foreignTokens = M.foreign.length;
    r.guardedReads = guardedReadsOf(lines, [...(o.guarded || GUARDED).map((g) => g.path), ...(o.forbid || [])], { deny: DENY, allow: ALLOW });
    r.events = eventsOf(name, []);
    if (r.foreignTokens || r.guardedReads.length) { r.void = r.foreignTokens ? 'foreign-token' : 'guarded-read'; r.note = `VOID: ${r.foreignTokens ? `${r.foreignTokens} request(s) carried a token this run did not make` : `it read ${r.guardedReads.join(', ')}`}`; }
    else { const doors = doorsOpenedOf(lines); if (doors.length) { r.void = 'door'; r.doors = doors; r.note = `VOID: a door the trace cannot see through opened (${doors.join(', ')})`; } }
    if (r.void) { RESULTS[name] = { r, steps: [] }; return r; }
    const why = [];
    if (!r.execs) why.push('the binary never ran under the tracer (util-linux script — the pty — missing or refused)');
    if (!found) why.push(`no authorize URL with a readable scope in ${Math.round(SCOPE_WAIT_MS / 1000)} s`);
    if (h.rec.oversize) why.push(`the record grew past ${MAX_RECORD / 1048576} MiB`);
    if (lines.unparsed.length) why.push(`a line the fence cannot read (${String(lines.unparsed[0]).slice(0, 120)})`);
    if (endedBySelf && lines.gap) why.push(`the record: ${lines.gap.why}`); // a run that ended by itself is judged whole
    if (r.oauthCalls || r.outboundConnects.length) why.push(`it called out (${r.oauthCalls} OAuth calls, ${r.outboundConnects.length} non-loopback connects) — the mint must only print`);
    if (!why.length) { r.verdict = 'PASS'; r.scopes = found.scopes; r.note = `setup-token asks scope=${found.scopes.join(' ')} (read off the authorize URL it printed, ${found.origin === BASE ? 'the mock\'s' : found.origin + ' — printed, never fetched'}; nothing requested; ${endedBySelf ? 'the CLI ended by itself' : 'the run ended by the tracer\'s kill (setup-token waits for a code)'})`; }
    else r.note = `no scopes recorded: ${why.join('; ')}`;
    RESULTS[name] = { r, steps: [] };
    return r;
  }

  // ── the verdicts ──────────────────────────────────────────────────────────
  const VOLATILE = new Set(['content-length', 'x-claude-code-session-id', 'x-client-request-id']);
  const headsOf = (steps) => steps.flatMap((s) => s.heads);
  const mainHead = (steps) => headsOf(steps).find((h) => h.stream) || headsOf(steps)[0] || null;
  const betaSet = (v) => new Set(String(v || '').split(',').map((x) => x.trim()).filter(Boolean));
  const headDiff = (f, e) => {
    const d = { onlyFile: [], onlyEnv: [], differ: [], volatile: [] };
    const names = [...new Set([...Object.keys(f.headers), ...Object.keys(e.headers)])].sort();
    for (const n of names) {
      const a = f.headers[n], b = e.headers[n];
      if (b === undefined) d.onlyFile.push(`${n}: ${a}`);
      else if (a === undefined) d.onlyEnv.push(`${n}: ${b}`);
      else if (a !== b) {
        if (VOLATILE.has(n)) { d.volatile.push(n); continue; }
        if (n === 'anthropic-beta') { const A = betaSet(a), B = betaSet(b); d.differ.push(`anthropic-beta: file-only [${[...A].filter((x) => !B.has(x))}] env-only [${[...B].filter((x) => !A.has(x))}]`); }
        else d.differ.push(`${n}: file=${a} | env=${b}`);
      }
    }
    for (const k of ['model', 'max_tokens', 'thinking', 'tools', 'system']) if (JSON.stringify(f.body?.[k]) !== JSON.stringify(e.body?.[k])) d.differ.push(`body.${k}: file=${JSON.stringify(f.body?.[k])} | env=${JSON.stringify(e.body?.[k])}`);
    if (JSON.stringify(f.body?.keys) !== JSON.stringify(e.body?.keys)) d.differ.push(`body keys: file=${f.body?.keys} | env=${e.body?.keys}`);
    if (JSON.stringify(f.body?.betas) !== JSON.stringify(e.body?.betas)) d.differ.push(`body.betas: file=${JSON.stringify(f.body?.betas)} | env=${JSON.stringify(e.body?.betas)}`);
    return d;
  };
  const callsOf = (steps) => [...new Set(steps.flatMap((s) => [...s.reqs.map((q) => `${q.path} ${q.stream ? 'stream' : 'ns'} ${q.model || ''}`), ...s.oauth.map((o) => `oauth ${o.kind}`), ...s.other.map((o) => `${o.method} ${o.path.split('?')[0]}`)]))].sort();
  function judge(name, r, steps, before, after, ops) {
    const st = Object.fromEntries(steps.map((s) => [s.step, s]));
    const msgs = (s) => (s ? s.reqs.filter((q) => q.path === '/v1/messages') : []);
    const carried = (s, who, status = 200) => msgs(s).length > 0 && msgs(s).every((q) => q.acct === who && q.scheme === 'bearer' && q.status === status);
    const said = (s) => (!s ? 'no step' : typeof s.result === 'string' ? s.result : `${s.result.is_error ? 'error' : s.result.subtype}${s.result.text ? ` "${s.result.text.slice(0, 90)}"` : ''}`);
    const reqWords = (s) => (msgs(s).map((q) => `${q.acct || '-'}:${q.status}`).join(' ') || 'no request');
    const refreshes = steps.reduce((n, s) => n + s.oauth.filter((o) => o.kind === 'refresh').length, 0);
    const kept = (k) => (k === 'O' && name === 'oat-env') || same(before[k], after[k]) || (name === 'oat-file-switch' && !before[k].missing && !after[k].missing && before[k].sha === after[k].sha && before[k].ino === after[k].ino);
    const untouched = ops.credWrites === 0 && kept('O') && kept('A');
    const fileWords = untouched ? 'files untouched' : `FILE CHANGED (${ops.credWrites} creds writes; O ${after.O.missing ? 'missing' : after.O.sha === before.O.sha ? 'same bytes' : 'new bytes ' + JSON.stringify(after.O.shape)})`;
    const okTurn = (s) => s && typeof s.result === 'object' && !s.result.is_error;
    let pass = false, note = '';
    if (name === 'oat-file') {
      pass = carried(st.msg1, 'O') && carried(st.msg2, 'O') && okTurn(st.msg1) && okTurn(st.msg2) && refreshes === 0 && untouched;
      note = `msg1 ${reqWords(st.msg1)}, msg2 ${reqWords(st.msg2)} (bearer = the file's oat), ${refreshes} refresh calls, ${fileWords}`;
    } else if (name === 'oat-env') {
      const f = RESULTS['oat-file'];
      if (!f) return { verdict: 'INCOMPLETE', note: 'run oat-file in the same invocation — oat-env is a diff against it' };
      const hf = mainHead(f.steps), he = mainHead(steps);
      if (!hf || !he) return { verdict: 'FAIL', note: `no request head to diff (file ${!!hf}, env ${!!he}); env msg1 ${reqWords(st.msg1)} ${said(st.msg1)}` };
      const d = headDiff(hf, he);
      const cf = callsOf(f.steps), ce = callsOf(steps);
      const callDiff = [...cf.filter((c) => !ce.includes(c)).map((c) => 'file-only call ' + c), ...ce.filter((c) => !cf.includes(c)).map((c) => 'env-only call ' + c)];
      r.headDiff = { ...d, calls: callDiff };
      const findings = [...d.onlyFile.map((x) => 'file-only ' + x), ...d.onlyEnv.map((x) => 'env-only ' + x), ...d.differ, ...callDiff];
      pass = carried(st.msg1, 'O') && carried(st.msg2, 'O') && findings.length === 0;
      note = findings.length ? `heads differ: ${findings.join('; ').slice(0, 600)}` : `the env path's request heads equal the file path's (volatile: ${d.volatile.join(', ') || 'none'}); msg1 ${reqWords(st.msg1)}`;
    } else if (name === 'oat-file-401') {
      pass = carried(st.msg1, 'O') && untouched;
      note = `msg1 ${reqWords(st.msg1)}; msg2 (401) ${reqWords(st.msg2)} said ${said(st.msg2)}; ${refreshes} refresh calls; msg3 after it cleared ${reqWords(st.msg3)} ${carried(st.msg3, 'O') ? '(recovered)' : '(did NOT recover: ' + said(st.msg3) + ')'}; ${fileWords}`;
    } else if (name === 'oat-file-near') {
      pass = carried(st.msg1, 'O') && untouched;
      const rf = (s) => s.oauth.filter((o) => o.kind === 'refresh').length;
      note = `msg1 inside the refresh window ${reqWords(st.msg1)} (${rf(st.msg1)} refresh calls), msg2 past expiresAt ${reqWords(st.msg2)} (${rf(st.msg2)} refresh calls) said ${said(st.msg2)}; ${fileWords}`;
    } else if (name === 'oat-file-switch') {
      pass = carried(st.msg1, 'A') && carried(st.msg2, 'O') && carried(st.msg3, 'A') && refreshes === 0 && untouched;
      note = `A ⇒ msg1 ${reqWords(st.msg1)}; link→O ⇒ msg2 ${reqWords(st.msg2)}; link→A ⇒ msg3 ${reqWords(st.msg3)}; ${refreshes} refresh calls; ${fileWords}`;
    } else if (name === 'oat-file-scopes') {
      pass = carried(st.msg1, 'O') && carried(st.msg2, 'O') && okTurn(st.msg1) && untouched;
      note = pass ? `accepted without scopes/subscriptionType: msg1 ${reqWords(st.msg1)}, msg2 ${reqWords(st.msg2)}; ${fileWords}` : `REFUSED or changed: msg1 ${reqWords(st.msg1)} said ${said(st.msg1)}; ${fileWords} — the materialized file must carry the row's real scopes/subscriptionType`;
    }
    if (r.outboundConnects.length) note += ` · ${r.outboundConnects.length} non-loopback connect() attempts`;
    const esc = steps.reduce((n, s) => n + s.escapes.length, 0);
    if (esc) note += ` · ${esc} proxy escapes refused`;
    return { verdict: pass ? 'PASS' : 'FAIL', note };
  }


  // ── the run: the gate first (law 1, ruling R1 — the hub places on the gate's verdict; the record completes behind it) ──
  const want = VERSION_RUN.void ? [] : orderOf(o.variants || []);
  if (VERSION_RUN.void) log(`[measure] VOID before any variant: the --version run ${VERSION_RUN.void === 'guarded-read' ? `read ${VERSION_RUN.guardedReads.join(', ')}` : VERSION_RUN.void === 'launcher-changed' ? 'found the launcher changed' : 'left a trace line the fence cannot read'}\n`);
  const results = [];
  let gateSaid = false;
  let launcherChanged = null; // the variant the launcher was found changed before (r4 tidy 2): it and the rest never start
  for (const name of want) {
    if (ESCAPED.length) break;
    if (!launcherAsShipped()) { launcherChanged = name; log(`[measure] VOID: the launcher in the scratch is not the shipped one before ${name} — nothing more starts\n`); break; }
    log(`[measure] ${name} …\n`);
    if (OAT_VARIANTS.includes(name)) {
      const r = await runOat(name);
      VARIANT = null;
      results.push(r);
      log(`[oat] ${name}: ${r.verdict} — ${r.note}\n`);
      if (!gateSaid && OAT_IN_FILE_GATE.every((g) => results.some((x) => x.variant === g))) { gateSaid = true; if (typeof o.onGate === 'function') { try { o.onGate(gateOf(results, { cli: cliVersionOf(version), binary: BINARY, aborted: ESCAPED.length > 0, ms: Date.now() - T0, void: VERSION_RUN.void })); } catch { } } }
      continue;
    }
    if (name === MINT_VARIANT) {
      const r = await runMint();
      VARIANT = null;
      results.push(r);
      log(`[mint] ${name}: ${r.verdict} — ${r.note}\n`);
      continue;
    }
    const r = await runVariant(name);
    VARIANT = null;
    results.push(r);
    log(JSON.stringify({ variant: r.variant, steps: r.steps.map((s) => [s.step, s.accts.join(' '), s.result?.subtype || s.result]), otel: r.otel.map((o2) => `${o2.phase}:${(o2.org || '').slice(0, 8)}`), oauth: r.oauth.map((o2) => `${o2.phase}:${o2.kind}:${o2.acct}`), fileAfter: r.fileAfter, credSyscalls: r.credSyscalls, events: r.events.length }) + '\n');
  }
  const voided = VERSION_RUN.void ? { void: VERSION_RUN.void } : launcherChanged ? { void: 'launcher-changed' } : results.find((x) => x.void);
  const ranGate = OAT_IN_FILE_GATE.every((g) => results.some((x) => x.variant === g));
  const record = {
    measuredAt: new Date().toISOString(), cli: results[0]?.version || version, version, probe: PROBE_VERSION, binary: BINARY, netns: NETNS, ...(LOOPBACK_REAL ? { rung: 'loopback-real' } : {}), proxy: 'loopback-mock', resolver: RESOLVER, loAddrs: LO_ADDRS, gapMs: GAP,
    canaries: CANARIES, env: [...ENV_ALLOW], belt: 'strace', ms: Date.now() - T0,
    escapes: M.escapes.map((e) => `${e.via} ${e.what}`), netlink: NETLINK, versionRun: VERSION_RUN, ...(launcherChanged ? { launcherChanged } : {}), foreignTokens: results.reduce((k, x) => k + (x.foreignTokens || 0), 0), aborted: ESCAPED.length ? ESCAPED : undefined, void: voided ? voided.void : undefined,
    ...(ranGate ? { gate: gateOf(results, { cli: cliVersionOf(version), binary: BINARY, aborted: ESCAPED.length > 0, ms: Date.now() - T0, void: VERSION_RUN.void || (launcherChanged ? 'launcher-changed' : undefined) }) } : {}),
    events: EVENTS.map((e) => ({ ...e, t: new Date(e.t).toISOString().slice(11, 23) })), results,
  };
  if (EVENTS.length) log(`[measure] ${EVENTS.length} events recorded, the run kept going (record.events)\n`);
  if (!o.keep) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } } // the scratch HOME + fake creds (the record was never a file)
  server.close();
  return record;
}

// ── THE HUB'S CHILD (src/server/cli-self-measure.js forks this file): one job over IPC, the gate + the record back over IPC;
// the parent gone (IPC disconnect: a hub restart under KillMode=process) or a SIGTERM ⇒ the CLI groups killed, then exit
async function runChild() {
  const send = (m) => new Promise((r) => { try { process.send(m, () => r()); } catch { r(); } });
  let job = null;
  // the run ends ITSELF (law C): every tracer group it spawned killed (the kernel ends their tracees), its own run dir removed — on a normal end, the hub gone
  // (IPC disconnect), a SIGTERM, or its own deadline (never a timer in a hub that may be gone)
  const bye = (code) => {
    killAll();
    const rd = job && typeof job.runDir === 'string' && /[\\/]cli-self-measure(?:-[0-9a-f]{8}-run-|[\\/]run-)[^\\/]+$/.test(job.runDir) ? job.runDir : null; // the hub's run folder only (its private one, or .393's in data/)
    if (rd) { try { fs.rmSync(rd, { recursive: true, force: true }); } catch { } }
    process.exit(code);
  };
  process.on('disconnect', () => bye(0));
  process.on('SIGTERM', () => bye(0));
  process.once('message', async (job_) => {
    const j = job_ && typeof job_ === 'object' ? job_ : {}; job = j;
    if (Number.isFinite(j.deadline)) { const dl = setTimeout(() => bye(0), Math.max(0, j.deadline - Date.now())); void dl; }
    try {
      const record = await measure({ claude: j.claude, rung: 'loopback-real', variants: Array.isArray(j.variants) ? j.variants : [...RUN_ORDER], root: j.root, gapMs: j.gapMs, flushMs: j.flushMs, nearMs: j.nearMs,
        guarded: Array.isArray(j.guarded) ? j.guarded : GUARDED, forbid: Array.isArray(j.forbid) ? j.forbid : [], strace: j.strace || 'strace', dataDir: typeof j.dataDir === 'string' ? j.dataDir : null, home: typeof j.home === 'string' ? j.home : null, onGate: (g) => { send({ type: 'gate', gate: g }); } });
      await send({ type: 'record', record });
    } catch (e) {
      await send(e && e.refusal ? { type: 'refused', code: e.refusal, detail: e.detail, ...(e.version ? { version: String(e.version) } : {}), ...(e.machine ? { machine: e.machine } : {}) } : { type: 'error', message: String((e && e.message) || e).slice(0, 300) });
    }
    bye(0);
  });
}
if (require.main === module) runChild();

module.exports = { measure, preflight, resolveClaude, assertEnv, guardedReadsOf, unquoted, isLive, MAX_RECORD, parseTrace, recordGap, doorsOpenedOf, outboundOf, sockaddrOf, sockaddrsOf, straceVersionOf, TRACE_SET, DENIED_DOORS, DOOR_CALLS, OPEN_CALLS, credentialRoots, REAL_HOME, sha256Of, killAll, refusal, gateOf, PROBE_VERSION, RUN_ORDER, GUARDED, ENV_ALLOW, isLoopbackAddr, nameserversOf };
