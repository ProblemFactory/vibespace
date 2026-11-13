#!/usr/bin/env node
// test-cli-self-measure (fast, in-process — lane cli-self-measure, 2026-11-09; the owner: «每次更新都要重新测量也太弱智了？这个用户体验是你觉得
// 最好的方案吗？», and his founding requirement 2026-03-22 item 7: a Claude Code update needs no update of VibeSpace unless Claude
// Code broke something). The hub measures a new Claude Code ITSELF; this suite gates, without running any binary:
//   §1 ONE implementation — the script and the hub both call src/claude-oat-probe.js; neither grows a mock / belt / judge of its
//      own; the module never sudo-s (RED controls: the same predicates over planted copies)
//   §2 law 3, the pure fences — the env allowlist (assertEnv), the refusals by name before anything runs (preflight: managed
//      settings, remote tokens, no strace / strace denied, a scratch that meets a forbidden dir), the guarded-read scan, the gate
//   §3 the store — a (version, sha256) the fixture does not name is HELD; the hub's own PASS places exactly those bytes, never
//      another build (law 2); the words while it checks (no For-you item inside the bound — ruling R2), after a FAIL / cannot-run
//   §4 the ORCH (src/server/cli-self-measure.js) over the REAL store and a stub fork — the child's literal env, the job, the
//      ledger keyed by version + sha256, PASS ⇒ placed + the pool's one edge per member + `cli-oat-measured`, FAIL / cannot-run /
//      aborted / timeout, the pacing (R6) and its «check again», the switch, a damaged ledger, a restart, R4's identity check
//   §5 the engine's wiring (the one edge, the pool card's line, no blocked-pool item during a check)
//   §6 R8 — a record kind counted once per build (cli-record-kind / cli-record-surprise), the chip's and the registration's words
//   §7 the words census (never «unmeasured», «wait for the measurement», «until the next release») + the RED control on the base
//   §8 law 5 — THE CENSUS OF VERSION GATES (grep-derived, printed): every place that keys behaviour on the Claude CLI's version is
//      a row answering ONE question — does an ordinary CLI update (no breaking change) need a release of ours? NO for every row
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-csm-'));
process.env.XDG_RUNTIME_DIR = fs.mkdtempSync(path.join(tmp, 'xdg-')); // every ORCH here puts its runs' folders in the suite's own temp — never the box's runtime dir
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const code = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const P = require(path.join(REPO, 'src/claude-oat-probe.js'));
const C = require(path.join(REPO, 'src/cli-caps.js'));
const APA = require(path.join(REPO, 'src/account-pool-auto.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const ORCH = require(path.join(REPO, 'src/server/cli-self-measure.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(1); } return f(); };

// ── §1 ONE implementation ──
console.log('§1 ONE implementation: the script and the hub call src/claude-oat-probe.js');
const S = code(read('scripts/measure-claude-cred-read.mjs')), PS = code(read('src/claude-oat-probe.js')), OR = code(read('src/server/cli-self-measure.js'));
const scriptOwn = (s) => /createServer\(|spawn\('strace'|function judge\b|function runOat\b|function startCli\b|function assertEnv\b/.test(s);
const orchOwn = (s) => /createServer\(|'strace'|function judge\b|\bPROBE\.measure\(|\bmeasure\(\{/.test(s);
ok(/createRequire\(import\.meta\.url\)\(path\.join\(path\.dirname\(SELF\), '\.\.', 'src', 'claude-oat-probe\.js'\)\)/.test(S) && /await PROBE\.measure\(\{/.test(S), 'the script measures through the module (PROBE.measure)');
ok(!scriptOwn(S), 'the script has no mock, belt, judge, CLI spawn or env check of its own');
ok(scriptOwn(S + "\nfunction judge() { return 'PASS'; }"), 'RED CONTROL: a script copy growing its own judge is caught');
ok(/probePath = require\.resolve\('\.\.\/claude-oat-probe\.js'\)/.test(OR) && /forkFn\(probePath, \[\], \{ env: \{ PATH: /.test(OR) && !orchOwn(OR), 'the hub FORKS the module\'s child entry and measures nothing in-process (no mock, no strace, no judge, no measure() call)');
ok(orchOwn(OR + '\nPROBE.measure({ claude });'), 'RED CONTROL: a hub copy measuring in-process is caught');
ok(!/\bsudo\b|\bunshare\b/.test(PS), 'the module never sudo-s and never makes a namespace (the netns re-exec stays in the script)');
ok(/if \(require\.main === module\) runChild\(\);/.test(PS) && /process\.on\('disconnect', \(\) => bye\(0\)\)/.test(PS) && /rung: 'loopback-real'/.test(PS), 'the child entry: one job over IPC, the loopback-real rung only, the CLI groups killed when the hub goes away (IPC disconnect)');
ok(JSON.stringify(P.RUN_ORDER) === JSON.stringify(['oat-file', 'oat-file-401', 'oat-file-switch', 'oat-env', 'oat-file-near', 'oat-file-scopes']) && JSON.stringify(P.RUN_ORDER.slice(0, 3)) === JSON.stringify(C.OAT_IN_FILE_GATE), 'the gate runs FIRST (ruling R1: the hub places on it), the three that complete the record behind it');

// ── §2 law 3, the pure fences ──
console.log('§2 law 3: the fences the module refuses by name');
console.log('    ENV_ALLOW: ' + P.ENV_ALLOW.join(' '));
const BASE = 'http://127.0.0.1:5', ROOT = path.join(tmp, 'root'), OAT = 'oat-fake';
const goodEnv = () => ({ PATH: '/usr/bin', HOME: ROOT + '/v/home', TMPDIR: ROOT + '/v/tmp', USER: 'u', LANG: 'C.UTF-8', TERM: 'dumb', ANTHROPIC_BASE_URL: BASE, USE_LOCAL_OAUTH: '1', CLAUDE_LOCAL_OAUTH_API_BASE: BASE, CLAUDE_LOCAL_OAUTH_APPS_BASE: BASE, CLAUDE_LOCAL_OAUTH_CONSOLE_BASE: BASE, CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json', OTEL_EXPORTER_OTLP_ENDPOINT: BASE + '/otel', OTEL_LOGS_EXPORT_INTERVAL: '1000', CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', HTTPS_PROXY: BASE, HTTP_PROXY: BASE, https_proxy: BASE, http_proxy: BASE, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', CLAUDE_SECURESTORAGE_CONFIG_DIR: ROOT + '/v/link' });
const refusedEnv = (env) => { try { P.assertEnv(env, { base: BASE, root: ROOT, oat: OAT, proxied: true }); return null; } catch (e) { return e.refusal ? `${e.refusal}: ${e.detail}` : 'threw ' + e.message; } };
ok(refusedEnv(goodEnv()) === null, 'G3: the release road\'s env passes the allowlist (every base and proxy the mock, the scratch HOME / TMPDIR / link, the no-traffic switches)');
const envCases = [['a real-looking key rides along', { ANTHROPIC_API_KEY: 'x' }, /^env: ANTHROPIC_API_KEY: not in the allowlist/], ['a base points elsewhere', { ANTHROPIC_BASE_URL: 'https://example.invalid' }, /^env: ANTHROPIC_BASE_URL: not the loopback mock/], ['the proxy is not the mock', { HTTPS_PROXY: undefined }, /^env: HTTPS_PROXY: the proxy is not the loopback mock/],
  ['HOME is the person\'s', { HOME: '/home/someone' }, /^env: HOME: outside the scratch/], ['the env token is not the run\'s fake', { CLAUDE_CODE_OAUTH_TOKEN: 'real' }, /^env: CLAUDE_CODE_OAUTH_TOKEN: not this run/], ['the CLI may update itself', { DISABLE_AUTOUPDATER: undefined }, /^env: DISABLE_AUTOUPDATER/]];
for (const [n, over, re] of envCases) { const e = goodEnv(); for (const [k, v] of Object.entries(over)) { if (v === undefined) delete e[k]; else e[k] = v; } const r = refusedEnv(e); ok(!!r && re.test(r), `G3 RED: ${n} ⇒ refused by name`, r); }
const stub = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return f; };
const straceOk = stub('strace-ok', 'case "$1" in -V) echo "strace -- version 6.19";; esac\nexit 0'), straceNo = stub('strace-denied', 'case "$1" in -V) echo "strace -- version 6.19"; exit 0;; esac\nexit 1');
fs.mkdirSync(ROOT, { recursive: true });
const present = path.join(tmp, 'etc-claude-code'); fs.mkdirSync(present);
const absent = path.join(tmp, 'absent');
const pf = (o) => { const r = P.preflight({ root: ROOT, strace: straceOk, guarded: [{ path: absent, code: 'managed-settings' }], ...o }); return r ? `${r.refusal}: ${r.detail}` : null; };
ok(pf({}) === null, 'preflight: nothing guarded present, strace answers, the scratch apart ⇒ the run may start');
ok(/^managed-settings: .*exists$/.test(pf({ guarded: [{ path: present, code: 'managed-settings' }] })), 'G7: a managed-settings dir present ⇒ refused BEFORE the binary starts, by name and path', pf({ guarded: [{ path: present, code: 'managed-settings' }] }));
ok(/^remote-token: /.test(pf({ guarded: [{ path: present, code: 'remote-token' }] })), 'G7: a remote-token dir present ⇒ refused by name');
ok(/^no-strace: /.test(pf({ strace: path.join(tmp, 'no-such-strace') })), 'G6: no strace ⇒ refused `no-strace` (the For-you reason names the install)');
ok(/^strace-denied: /.test(pf({ strace: straceNo })), 'G6: strace that cannot trace a child ⇒ refused `strace-denied`');
ok(/^scratch: /.test(pf({ forbid: [tmp] })), 'G2: a scratch that meets a forbidden dir (the person\'s ~/.claude, data/subs, the vault) ⇒ refused');
ok(P.GUARDED.some((g) => g.path === '/etc/claude-code' && g.code === 'managed-settings') && P.GUARDED.some((g) => g.path === '/home/claude/.claude/remote' && g.code === 'remote-token'), 'G7: the production list names the paths 2.1.321 was MEASURED opening outside HOME (/etc/claude-code, /home/claude/.claude/remote)');
const L = (s) => ({ line: '1 12:00:00.000001 ' + s, args: s.replace(/^\w+\(/, '') });
const reads = P.guardedReadsOf([L('openat(AT_FDCWD, "/etc/claude-code/managed-settings.json", O_RDONLY) = 3'), L('openat(AT_FDCWD, "/home/claude/.claude/remote/.oauth_token", O_RDONLY) = -1 ENOENT (No such file or directory)'), L('openat(AT_FDCWD, "/tmp/x/home/.claude.json", O_RDONLY) = 4')], ['/etc/claude-code', '/home/claude/.claude/remote']);
ok(JSON.stringify(reads) === JSON.stringify(['/etc/claude-code/managed-settings.json']), 'P4: a SUCCESSFUL open of a guarded path voids the run; an ENOENT is the fence holding; the scratch is not guarded', reads);
// LAW E — DENY BY DEFAULT under the real home and the data dir (strace -y's resolved fd path, so a RELATIVE open is judged by where it
// landed), except the scratch, the binary's install and the ONE interpreter file
const Ly = (cwd, rel, fd, res) => L(`openat(AT_FDCWD<${cwd}>, "${rel}", O_RDONLY) = ${fd}<${res}>`);
const dny = { deny: ['/home/u', '/srv/vs/data'], allow: ['/srv/vs/data/cli-self-measure/run-1', '/home/u/.local/share/claude/versions', '/home/u/.nvm/v24/bin/node'] };
const dr = P.guardedReadsOf([Ly('/home/u/proj', '../.config/x/token', 7, '/home/u/.config/x/token'), Ly('/', 'srv/vs/data/vault.json', 8, '/srv/vs/data/vault.json'), Ly('/srv/vs/data/cli-self-measure/run-1', 'home0/.claude.json', 9, '/srv/vs/data/cli-self-measure/run-1/home0/.claude.json'), Ly('/', '/home/u/.local/share/claude/versions/2.1.399', 10, '/home/u/.local/share/claude/versions/2.1.399'), Ly('/', '/home/u/.nvm/v24/bin/node', 11, '/home/u/.nvm/v24/bin/node'), Ly('/', '/home/u/.nvm/v24/lib/node_modules/x/cli.js', 12, '/home/u/.nvm/v24/lib/node_modules/x/cli.js')], [], dny);
ok(JSON.stringify(dr) === JSON.stringify(['/home/u/.config/x/token', '/srv/vs/data/vault.json', '/home/u/.nvm/v24/lib/node_modules/x/cli.js']), 'LAW E: deny by default — a RELATIVE open landing under the real home and an open of the data dir void the run; the scratch, the binary\'s install and the interpreter FILE pass; a file beside the interpreter does not', dr);
const PSRC = code(read('src/claude-oat-probe.js'));
ok(/const DENY = \[REAL_HOME, o\.home, o\.dataDir\]\.filter\(Boolean\)\.map\(realOr\);/.test(PSRC) && /const REAL_HOME = \(\(\) => \{ try \{ return os\.userInfo\(\)\.homedir \|\| os\.homedir\(\); \} catch \{ return os\.homedir\(\); \} \}\)\(\);/.test(PSRC) && /const INSTALL = path\.dirname\(realOr\(CLAUDE\)\);/.test(PSRC) && /const ALLOW = \[realOr\(ROOT\), DENY\.some\(\(d\) => inside\(d, INSTALL\)\) \? realOr\(CLAUDE\) : INSTALL, realOr\(process\.execPath\)\];/.test(PSRC) && /guardedReadsOf\(lines, .*\{ deny: DENY, allow: ALLOW \}\)/.test(PSRC), 'LAW E: the measurement judges every variant with those roots — the REAL home (getpwuid, never $HOME) and the hub\'s data dir; the install DIR is allowed only when it holds no deny root (a claude dropped straight into the home allows only its own file)');
// ROUND 3 (acceptance r2): the chain's two new links refused by name; the trace's grammar; another process's /proc; the address
// argument; the kill proof; the version run fenced; netlink once — each over the module itself
const straceOld = stub('strace-old', 'case "$1" in -V) echo "strace -- version 6.1"; exit 0;; esac\nexit 0'), straceMute = stub('strace-mute', 'case "$1" in -V) echo "no idea"; exit 0;; esac\nexit 0');
ok(/^strace-old: strace 6\.1 has no --kill-on-exit/.test(pf({ strace: straceOld })), 'LAW C (r3): a strace with no --kill-on-exit (< 6.6 — Debian bookworm ships 6.1) ⇒ refused `strace-old` before the binary starts: it could not end what it traces', pf({ strace: straceOld }));
const VPIN = { 'strace -- version 6.1': false, 'strace -- version 6.5': false, 'strace -- version 6.6': true, 'strace -- version 6.19': true, 'strace -- version 7.0.1': true, 'garbage': false, '': false };
ok(Object.entries(VPIN).every(([t, want]) => P.straceVersionOf(t).ok === want) && P.straceVersionOf('strace -- version 6.19').version === '6.19', 'the version from the tracer\'s OWN answer (strace -V): 6.1 and 6.5 old, 6.6 / 6.19 / 7.0 new, garbage or nothing ⇒ OLD (fail closed)', Object.fromEntries(Object.keys(VPIN).map((t) => [t, P.straceVersionOf(t)])));
{ const r1 = P.preflight({ root: ROOT, strace: straceOld, guarded: [] }), r2 = P.preflight({ root: ROOT, strace: straceMute, guarded: [] });
  ok(r1 && r1.refusal === 'strace-old' && r1.version === '6.1' && ['managed', 'image'].includes(r1.machine) && r2 && r2.refusal === 'strace-old' && r2.version === undefined, 'the refusal carries the version and the machine kind (a VibeSpace image or a machine its owner manages) — a version it cannot read is refused too', { r1: r1 && [r1.refusal, r1.version, r1.machine], r2: r2 && [r2.refusal, r2.version] }); }
{ const Z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, J = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  const it = (m) => C.cliUnmeasuredItem({ cli: '2.1.399', names: ['A'], local: { state: 'cannot-run', reason: 'strace-old', reasonVersion: '6.1', reasonMachine: m } });
  const man = it('managed'), img = it('image'), wrd = (x) => x.i18n.detail.find((r) => r.key === 'Why: {why}.').params.why;
  ok(/update strace to 6\.6 or newer \(this one is 6\.1\)/.test(man.detail) && /the next VibeSpace image brings it; until then a VibeSpace release that records Claude Code 2\.1\.399 places these accounts/.test(img.detail) && !/\bwait\b/i.test(man.detail + img.detail), 'CONDITION 2: the door a person HAS — on a machine they manage «update strace to 6.6 or newer (this one is 6.1)»; in a VibeSpace image, the next image brings it and a release that records this version places the accounts meanwhile — never «wait» without a what', { man: man.detail.split('\n')[0], img: img.detail.split('\n')[0] });
  ok([wrd(man), wrd(img)].every((w) => Z[w.key] && J[w.key] && Object.keys(w.params).every((k) => Z[w.key].includes(`{${k}}`) && J[w.key].includes(`{${k}}`))), 'CONDITION 2: both doors in zh / ja, each keeping its placeholder ({version} / {v})'); }
{ // CONDITION 1: nobody is told anything unless it concerns them — a hub that HOLDS no member never checks, so never refuses
  const forks0 = [], logs0 = [];
  const fakeAcc = { oatFileCaps: () => ({ known: true, ok: false, cli: '2.1.399' }), cliBinary: () => ({ path: '/opt/claude', sha256: 'sha-399', identity: 'i' }), hasLongLivedTokens: () => true, cliUnmeasuredMembers: () => [], noteCliMeasured: () => { }, setCliNoteHook: () => { } };
  const o0 = ORCH.create({ accounts: () => fakeAcc, dataDir: path.join(tmp, 'orch-noheld'), forkFn: () => { const c = new FakeChild(); forks0.push(c); return c; }, log: (...a) => logs0.push(a.join(' ')), event: () => { } });
  await o0.tick(); const d0 = o0.decide(fakeAcc.oatFileCaps()); await sleep(5);
  ok(d0.state === 'none' && forks0.length === 0 && !logs0.some((l) => /checking it|cannot-run|strace/.test(l)), 'CONDITION 1: a hub with long-lived tokens but NO member held for this build never starts the check — no refusal, no journal word, no item, no card line (most pods hold none)', { d0, forks: forks0.length, logs0 });
  o0.stop();
  ok(/const members = this\.cliUnmeasuredMembers\(\);\n\s*if \(!members\.length\) return null;/.test(read('src/accounts.js')), 'CONDITION 1: …and the For-you item exists only beside a held member (the store\'s one rule)'); }
ok(/^no-setpriv: /.test(pf({ setpriv: path.join(tmp, 'no-such-setpriv') })), 'LAW C (r3): no setpriv (util-linux) ⇒ refused `no-setpriv` — nothing would end the tracer when the check\'s process goes');
const sp = (pid, ...ls) => ls.map((l) => `${pid} 12:00:00.000001 ${l}`).join('\n') + '\n';
const deny1 = { deny: ['/home/u', '/srv/vs/data'], allow: ['/srv/vs/data/cli-self-measure/run-1/m'] };
const r2Reader = (txt) => txt.split('\n').map((l) => /^(\d+)\s+(\S+)\s+(\w+)\((.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: +m[1], call: m[3], args: m[4], line: m[0] })); // r2's straceOf, the RED control
for (const [what, txt, want] of [
  ['a key under the real home', sp(101, 'openat(AT_FDCWD</srv/vs/data/cli-self-measure/run-1/m/cwd>, "/home/u/.ssh/id_ed25519", O_RDONLY|O_CLOEXEC <unfinished ...>') + sp(102, 'futex(0x7f00, FUTEX_WAKE_PRIVATE, 1) = 0') + sp(101, '<... openat resumed>) = 23</home/u/.ssh/id_ed25519>'), '/home/u/.ssh/id_ed25519'],
  ['data/vault.json', sp(103, 'openat(AT_FDCWD</srv/vs/data/cli-self-measure/run-1/m/cwd>, "/srv/vs/data/vault.json", O_RDONLY <unfinished ...>') + sp(103, '<... openat resumed>) = 19</srv/vs/data/vault.json>'), '/srv/vs/data/vault.json'],
  ['a RELATIVE path landing in the home', sp(104, 'openat(AT_FDCWD</home/u/proj>, "../.aws/credentials", O_RDONLY <unfinished ...>') + sp(105, 'statx(AT_FDCWD</x>, "/tmp", 0, STATX_ALL, {stx_mask=0}) = 0') + sp(104, '<... openat resumed>) = 7</home/u/.aws/credentials>'), '/home/u/.aws/credentials'],
]) {
  const p = P.parseTrace(txt), hits = P.guardedReadsOf(p.lines, [], deny1);
  ok(p.unparsed.length === 0 && !p.fragment && hits.includes(want) && P.guardedReadsOf(r2Reader(txt), [], deny1).length === 0, `ITEM 1: a SPLIT open (another thread between its halves) of ${what} is joined and VOIDS — r2's reader (call-name lines only) saw nothing`, { hits, unparsed: p.unparsed });
}
const bad = P.parseTrace(sp(106, 'openat(AT_FDCWD, "/x", O_RDONLY) = 3') + 'garbage that no tracer wrote\n' + sp(107, '<... openat resumed>) = 4</home/u/k>'));
ok(bad.unparsed.length === 2 && P.parseTrace(sp(108, 'getpid() = 108') + '108 12:00:00.000001 openat(AT_FDCWD, "/ho').fragment === true, 'ITEM 1: a line the grammar cannot read (or a resumed half with no call before it) is UNPARSED, and a trace ending in a broken line is a fragment — either VOIDS the run (unknown is not clean)', bad.unparsed);
const CLEAN = P.parseTrace(read('scripts/fixtures/oat-measure/clean-2.1.321.strace'));
ok(CLEAN.unparsed.length === 0 && !CLEAN.fragment && CLEAN.lines.filter((s) => s.call === 'openat').length === 620 && P.guardedReadsOf(CLEAN.lines, P.GUARDED.map((g) => g.path), { deny: ['/home/u'] }).length === 0, `ITEM 1 REPLAY: the recorded clean 2.1.321 trace (sanitized; 1749 lines, 98 split pairs; taken WITHOUT -y, so its home is judged by the guarded list only) parses whole — 620 opens, 0 unparsed — and is still a PASS`, { unparsed: CLEAN.unparsed.slice(0, 2), opens: CLEAN.lines.filter((s) => s.call === 'openat').length });
const prc = P.parseTrace(sp(201, 'openat(AT_FDCWD</x>, "/proc/self/status", O_RDONLY) = 5</proc/201/status>') + sp(201, 'openat(AT_FDCWD</x>, "/proc/999/environ", O_RDONLY) = 6</proc/999/environ>') + sp(202, 'openat(AT_FDCWD</x>, "/proc/thread-self/stat", O_RDONLY) = 7</proc/201/task/202/stat>'));
const ph = P.guardedReadsOf(prc.lines, [], {});
ok(JSON.stringify(ph) === '["/proc/999/environ"]', 'ITEM 3: /proc of a process NOT of this run (its environ — where an agent session keeps its tokens) VOIDS; the run\'s own /proc pages pass', ph);
const SA = 'sendto(9<UDP:[1]>, "\\x01sa_family=AF_INET, sin_port=htons(5), sin_addr=inet_addr(\\"127.0.0.1\\")", 60, 0, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("10.0.0.1")}, 16) = 60';
ok(JSON.stringify(P.sockaddrOf(SA)) === JSON.stringify({ fam: 'AF_INET', port: '53', addr: '10.0.0.1' }) && P.sockaddrOf('sendto(5<TCP:[1]>, "sa_family=AF_INET6", 18, 0, NULL, 0) = 18') === null && P.sockaddrOf('sendmsg(5<UNIX:[1]>, {msg_name={sa_family=AF_UNIX, sun_path="/run/user/1000/bus"}, msg_namelen=20, msg_iov=[{iov_base="sa_family=AF_INET", iov_len=17}], msg_iovlen=1, msg_controllen=0, msg_flags=0}, 0) = 17').path === '"/run/user/1000/bus"', '(b): the destination is the ADDRESS ARGUMENT — a payload that spells «sa_family=AF_INET … 127.0.0.1» is data (the real 10.0.0.1:53 is seen); a send with no address names none; sendmsg\'s msg_name is read');
const PSRC3 = code(read('src/claude-oat-probe.js'));
const killArgs = (src) => [...src.matchAll(/process\.kill\(([^,]+),/g)].map((m) => m[1].trim());
const proven = (src) => { const k = killArgs(src); return k.length >= 4 && k.every((a) => /^-(?:c|child|vc)\.pid$/.test(a)) && !/\bTRACKED\b|\bstartTimeOf\b|\bkillTracked\b/.test(src); };
ok(proven(PSRC3) && !proven(PSRC3 + "\nfor (const pid of fromTheLog) process.kill(pid, 'SIGKILL');\n"), 'ITEM 4: the module signals ONLY a tracer group it spawned (by its handle) — never a pid read from text; RED: a kill of a pid from the log', killArgs(PSRC3));
ok(/spawn\('setpriv', \['--pdeathsig', 'KILL', '--', STRACE, '--kill-on-exit', '--always-show-pid', '-f',/.test(PSRC3), 'ITEMS 4 + 5: every run is `setpriv --pdeathsig KILL -- strace --kill-on-exit -f` (measured: the child SIGKILLed ⇒ the tracer, the CLI and a setsid grandchild gone within 1.5 s; without --kill-on-exit the tracees live on)');
ok(/const vl = recordOf\(vh\);/.test(PSRC3) && /VERSION_RUN\.guardedReads = guardedReadsOf\(vl, /.test(PSRC3) && /VERSION_RUN\.void = VERSION_RUN\.guardedReads\.length \? 'guarded-read' : vl\.gap \? vl\.gap\.void : VERSION_RUN\.doors\.length \? 'door' : undefined;/.test(PSRC3) && /const want = VERSION_RUN\.void \? \[\] : orderOf\(o\.variants \|\| \[\]\);/.test(PSRC3) && /gateOf\(results, \{ cli: cliVersionOf\(version\), binary: BINARY, aborted: ESCAPED\.length > 0, ms: Date\.now\(\) - T0, void: VERSION_RUN\.void \}\)/.test(PSRC3), 'ITEM 2: the --version run is FENCED like a variant — its opens judged by the same roots and grammar; a version run that voids runs no variant and the gate says void');
ok(/NETLINK \+= outs\.filter\(\(x\) => x\.netlink\)\.length;/.test(PSRC3) && (PSRC3.match(/NETLINK\s*(?:\+\+|\+=)/g) || []).length === 1 && /if \(!o \|\| o\.netlink\) continue;/.test(PSRC3), '(c): netlink is counted ONCE, by each variant\'s after-pass (the belt no longer adds the same lines)');
ok(/identity: `\$\{st\.dev\}:\$\{st\.ino\}:\$\{st\.size\}:\$\{Math\.round\(st\.mtimeMs\)\}:\$\{Math\.round\(st\.ctimeMs\)\}`/.test(read('src/machine-probes.js')), '(d): the binary\'s identity carries its CHANGE time — an in-place rewrite that restores the mtime still moves the ctime (no ordinary process can set it back)');
const R3 = (v) => ['oat-file', 'oat-file-401', 'oat-file-switch'].map((g) => ({ variant: g, verdict: v[g] || 'PASS', note: 'n' }));
ok(P.gateOf(R3({}), { cli: '9', binary: { sha256: 's' } }).pass === true && P.gateOf(R3({ 'oat-file-switch': 'FAIL' }), {}).pass === false && P.gateOf([...R3({}).slice(0, 2), { ...R3({})[2], void: 'foreign-token' }], {}).pass === false && P.gateOf(R3({}), { aborted: true }).pass === false, 'the gate: PASS only when the three PASS, nothing voided the run and nothing left loopback');

// ── a hub: three members on their long-lived token only, one pool ──
const FXF = path.join(tmp, 'fx.json');
fs.writeFileSync(FXF, JSON.stringify({ versions: { '2.1.321': JSON.parse(read('scripts/fixtures/oat-in-file.json')).versions['2.1.321'] } }));
const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
const hubAt = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  const am = new AccountManager({ dataDir: dir, oatFixture: FXF, platform: 'linux' });
  const ids = am._state.accounts.filter((a) => a.type === 'subscription' && a.oatEnc).map((a) => a.id);
  return { am, ids, pool: am._state.accounts.find((a) => a.type === 'pooled')?.id };
};
const mkHub = async (dir) => {
  const h = hubAt(dir);
  if (!h.ids.length) {
    const X = h.am.createSubscription({ name: 'Login X' }).id; // the pool needs one signed-in member; the three below live on their token only
    fs.writeFileSync(path.join(h.am.subDir(X), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
    h.ids = ['A', 'B', 'C'].map((n, i) => { const id = h.am.createSubscription({ name: 'Token ' + n }).id; fs.writeFileSync(path.join(h.am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 }); h.am.setOat(id, ['sk', '-ant-oat01-'].join('') + 'CSMfake' + i + '_' + 'q'.repeat(40)); return id; });
    h.pool = h.am.createPool({ name: 'Self pool' }).id;
  }
  h.am.noteCliVersion('2.1.321 (Claude Code)', { path: '/opt/claude', cmd: '/opt/claude', sha256: 'sha-321', identity: 'i-321' });
  await h.am.oatFileSettled();
  return h;
};
const placed = (h) => h.ids.filter((id) => h.am.poolMembers(h.pool).some((m) => m.id === id)).length;
const why = (h) => h.am.poolRoster(h.pool).find((r) => r.id === h.ids[0])?.why || null;

// ── §3 the store ──
console.log('§3 the store: held while unknown, placed on THIS hub\'s PASS for exactly these bytes');
{
  const h = await mkHub(path.join(tmp, 'hub3'));
  ok(placed(h) === 3, 'on 2.1.321 (the fixture names it) the three members are placed', placed(h));
  const now = Date.now();
  h.am.noteCliVersion('2.1.399 (Claude Code)', { path: '/opt/claude', cmd: '/opt/claude', sha256: 'sha-399', identity: 'i-399' }); await h.am.oatFileSettled();
  ok(placed(h) === 0 && why(h)?.code === 'cli-unmeasured' && !why(h)?.local, 'a build the fixture does not name ⇒ HELD (fail closed — law 2), no check of its own yet', why(h));
  ok(/not in this VibeSpace's records yet/.test(APA.unplaceableText(why(h))), 'its words without a check: «… is not in this VibeSpace\'s records yet — re-login, or a VibeSpace update places it»', APA.unplaceableText(why(h)));
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'checking', startedAt: now - 120e3, lateAt: now + 480e3, killAt: now + 1080e3, typicalMs: 271e3 });
  const w = why(h);
  ok(placed(h) === 0 && w?.local?.state === 'checking' && w.local.elapsedMin === 2 && w.local.typicalMin === 5 && w.local.boundMin === 20, 'a running check keeps the hold (law 2) and says it: checking, 2 min in, about 5, at most 20', w);
  ok(APA.unplaceableText(w) === 'Claude Code 2.1.399 is being checked on this machine (about 5 min, started 2 min ago) — it rejoins the pool when the check passes', 'the roster\'s one calm line (law 6)', APA.unplaceableText(w));
  ok(h.am.cliUnmeasuredNotice() === null, 'RULING R2: inside its bound the check files NO For-you item');
  const ck = APA.poolCheckingNotice({ unplaceable: h.am.poolRoster(h.pool).filter((r) => r.why).map((r) => ({ id: r.id, name: r.name, why: r.why })) }, { poolName: 'Self pool', servable: () => true });
  ok(!!ck && ck.text === 'Pool "Self pool": checking the new Claude Code 2.1.399 on this machine — about 5 min. If it passes, 3 accounts rejoin the pool and the conversations waiting on it continue by themselves.' && ck.promise === true && !/\d{4}-\d\d-\d\d|\d\d:\d\d|reset/i.test(ck.text), 'the POOL CARD while it checks (the check is the whole story): one calm line — what, about how long, IF it passes the waiting conversations continue — never a wall date', ck);
  const roster = h.am.poolRoster(h.pool).filter((r) => r.why).map((r) => ({ id: r.id, name: r.name, why: r.why }));
  const ck2 = APA.poolCheckingNotice({ unplaceable: roster, quotaBlocked: [{ id: 'q1', name: 'Q' }] }, { poolName: 'Self pool', servable: () => true });
  ok(!!ck2 && ck2.promise === false && ck2.text === 'Pool "Self pool": checking the new Claude Code 2.1.399 on this machine — about 5 min. If it passes, 3 accounts it holds rejoin the pool.' && !/continue/.test(ck2.text), 'LAW G1: another wall besides the check (a spent member) ⇒ the checking line is an ADDITION with NO promise that anything continues (a PASS alone would not unblock)', ck2);
  const ck3 = APA.poolCheckingNotice({ unplaceable: [...roster, { id: 'r9', name: 'R', why: { code: 'login-expired' } }] }, { poolName: 'Self pool', servable: () => true });
  const ck4 = APA.poolCheckingNotice({ unplaceable: roster }, { poolName: 'Self pool', servable: () => false }), ck5 = APA.poolCheckingNotice({ unplaceable: roster }, { poolName: 'Self pool' });
  ok(!!ck4 && ck4.promise === false && !/continue/.test(ck4.text) && !!ck5 && ck5.promise === false, 'ITEM 6: the promise looks at the member that would come back — every member the check holds has a SPENT last reading (or none) ⇒ no «continue by themselves», and the For-you item stands; no verdict handed in ⇒ no promise', { ck4: ck4 && ck4.text, ck5: ck5 && ck5.promise });
  ok(!!ck3 && ck3.promise === false, 'LAW G1: a member held by something else (a dead login in the same roster) ⇒ no promise either', ck3);
  ok(APA.poolCheckingNotice({ unplaceable: [{ id: 'r9', name: 'R', why: { code: 'login-expired' } }] }, { poolName: 'P' }) === null, '…and no check running ⇒ no checking line at all');
  const Z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, J = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  ok([ck, ck2, APA.poolCheckingNotice({ unplaceable: roster.slice(0, 1) }, { poolName: 'P' }), APA.poolCheckingNotice({ unplaceable: roster.slice(0, 1), quotaBlocked: [{}] }, { poolName: 'P' })].every((c) => c && !!Z[c.i18n.key] && !!J[c.i18n.key] && /正在本机确认新版 Claude Code \{v\}/.test(Z[c.i18n.key]) && /このマシンで確認しています/.test(J[c.i18n.key]) && /确认通过后/.test(Z[c.i18n.key])), 'zh / ja carry all four pool-card lines (one / many × promise / addition), each saying «if it passes»');
  ok(/for a few minutes: Claude Code 2\.1\.399 is being checked on this machine \(about 5 min, started 2 min ago\)/.test(C.cliHeldSpawnText({ pool: 'P', cli: '2.1.399', local: w.local })), 'a new conversation asked during the check is told the check and its bound, never «wait for a measured CLI»');
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-OTHER', state: 'pass', startedAt: now });
  ok(!h.am.oatFileCaps().ok && !h.am.oatFileCaps().local, 'LAW 2: a PASS for OTHER bytes of the same version grants nothing (never another build)');
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'pass', startedAt: now }); await h.am.oatFileSettled();
  ok(h.am.oatFileCaps().ok && placed(h) === 3, 'the hub\'s own PASS for exactly (2.1.399, sha-399) ⇒ the three are placed again, the same token bytes', placed(h));
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'fail', startedAt: now, reason: { code: 'no-follow', observation: '' } }); await h.am.oatFileSettled();
  const nf = h.am.cliUnmeasuredNotice();
  ok(!h.am.oatFileCaps().ok && placed(h) === 0 && !!nf && nf.item.action?.type === 'cli-check-again' && /uses long-lived tokens differently: 3 accounts stay out of the pool/.test(nf.item.text) && /What VibeSpace saw: a turn after the pool moved the account did not follow the move\./.test(nf.item.detail), 'a FAIL holds them again; the item names WHICH observation differed and carries «check again» (R6)', nf && nf.item);
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'cannot-run', startedAt: now, reason: { code: 'no-strace' } });
  const nc = h.am.cliUnmeasuredNotice();
  ok(!!nc && /could not check Claude Code 2\.1\.399 on this machine/.test(nc.item.text) && /Why: this machine has no strace/.test(nc.item.detail) && nc.item.action?.type === 'cli-check-again' && nc.item.i18n.detail.some((r) => r.params && r.params.why && r.params.why.key), 'cannot-run: the item names why (zh / ja say the reason as a nested word) and carries «check again»', nc && nc.item);
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'checking', startedAt: now - 11 * 60e3, lateAt: now - 60e3, killAt: now + 9 * 60e3, typicalMs: 271e3 });
  const nl = h.am.cliUnmeasuredNotice();
  ok(!!nl && /is still being checked on this machine — 3 accounts wait for it/.test(nl.item.text) && !nl.item.action, 'past 10 min the check is late: ONE item says so and its bound (no press: it is still running)', nl && nl.item);
}

const ENG_SRC = read('src/server/usage-pool-engine.js');
// ── §4 the ORCH over the real store, a stub fork ──
console.log('§4 the ORCH: one child per unseen (version, sha256), the ledger, the pacing');
class FakeChild extends EventEmitter { constructor() { super(); this.stderr = new EventEmitter(); this.exitCode = null; this.killed = false; this.sent = []; } send(m) { this.sent.push(m); } kill(sig) { this.killed = true; this.exitCode = 0; setImmediate(() => this.emit('exit', null, sig)); return true; } }
// the runs' folders live under a base the suite owns (never the box's runtime dir); §12 drives the real choice of bases
const SCRATCH_BASE = fs.mkdtempSync(path.join(tmp, 'run-base-'));
const world = async (tag, extra = {}) => {
  const dir = path.join(tmp, 'orch-' + tag);
  const h = await mkHub(dir);
  const forks = [], events = [], lines = [], back = [];
  let clock = Date.now(), rechecks = 0, ident = 'i-399';
  h.am.setCliRecheck(() => { rechecks++; return null; });
  const o = ORCH.create({ accounts: () => h.am, dataDir: dir, scratchBases: () => [SCRATCH_BASE], forkFn: (file, args, opts) => { const c = new FakeChild(); forks.push({ file, opts, c }); return c; }, event: (n, d) => events.push([n, d]), log: (...a) => lines.push(a.join(' ')), onMembersBack: (ids) => back.push(ids), now: () => clock, statIdentity: async () => ({ identity: ident }), ...extra });
  await o.tick();
  return { h, o, dir, forks, events, lines, back, adv: (ms) => { clock += ms; }, setIdent: (i) => { ident = i; }, rechecks: () => rechecks };
};
const note = (h, sha = 'sha-399') => h.am.noteCliVersion('2.1.399 (Claude Code)', { path: '/opt/claude', cmd: '/opt/claude', sha256: sha, identity: 'i-399' });
const GATE = (over = {}) => ({ cli: '2.1.399', sha256: 'sha-399', pass: true, gate: { 'oat-file': { verdict: 'PASS', note: 'n' }, 'oat-file-401': { verdict: 'PASS', note: 'n' }, 'oat-file-switch': { verdict: 'PASS', note: 'n' } }, ms: 271000, ...over });
const ledgerOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'cli-self-measure.json'), 'utf8')); } catch { return null; } };
{
  const W = await world('pass');
  ok(W.forks.length === 0, 'on a build the fixture names nothing is forked');
  note(W.h); await until(() => W.forks.length === 1);
  const f = W.forks[0];
  ok(W.forks.length === 1 && f.file === require.resolve(path.join(REPO, 'src/claude-oat-probe.js')), 'the first sight of (2.1.399, sha-399) forks the module\'s child entry ONCE');
  ok(Array.isArray(f.opts.execArgv) && f.opts.execArgv.length === 0, 'the child never inherits the hub\'s node flags (execArgv: [] — a hub run as `node -r <hook>` once handed its preload to the measurement)', f.opts.execArgv);
  ok(JSON.stringify(Object.keys(f.opts.env).sort()) === '["HOME","LANG","PATH","TMPDIR"]' && /\/usr\/bin:\/bin$/.test(f.opts.env.PATH) && (() => { const rd = String(((f.c && f.c.sent && f.c.sent[0]) || {}).runDir || ''); return !!rd && f.opts.env.HOME === path.join(rd, 'home0') && f.opts.env.TMPDIR === path.join(rd, 'tmp') && !(rd + '/').startsWith(W.dir + '/') && path.basename(rd).startsWith('cli-self-measure-'); })(), 'LAW 3: the child\'s env is a LITERAL (PATH = node dir + /usr/bin + /bin, a scratch HOME / TMPDIR in the run\'s own folder — outside the data dir since the incident of 2026-11-11) — nothing of the hub\'s own', f.opts.env);
  await until(() => f.c.sent.length === 1);
  const job = f.c.sent[0];
  ok(job && job.claude === '/opt/claude' && JSON.stringify(job.variants) === JSON.stringify([...P.RUN_ORDER, 'oat-mint-scopes']) && job.forbid.includes(path.join(W.dir, 'subs')) && job.forbid.includes(path.join(P.REAL_HOME, '.claude')) && JSON.stringify(job.forbid) === JSON.stringify(P.credentialRoots({ dataDir: W.dir })) && job.forbid.includes(path.join(W.dir, 'vault.json')) && job.forbid.includes(path.join(W.dir, 'codex-subs')) && job.runDir && job.root.startsWith(job.runDir) && job.dataDir === W.dir && job.deadline > Date.now() && !('gapMs' in job), 'the job: the binary the sessions spawn, the release road\'s six in the gate-first order, its own parameters, the forbidden dirs (the person\'s ~/.claude under the REAL home, data/subs, codex-subs, the vault), its run dir and its own deadline (law C)', job);
  ok(W.h.am.oatFileCaps().local?.state === 'checking' && placed(W.h) === 0, 'the members stay held while it runs; the store says checking');
  note(W.h); await sleep(5);
  ok(W.forks.length === 1 && W.o.state().running?.sha256 === 'sha-399', 'a second note of the same build while it runs forks nothing (one run at a time)');
  f.c.emit('message', { type: 'gate', gate: GATE() }); await until(() => W.back.length === 1);
  const lg = ledgerOf(W.dir), rec = lg && lg.binaries['2.1.399'] && lg.binaries['2.1.399']['sha-399'];
  ok(!!rec && rec.state === 'pass' && rec.probe === P.PROBE_VERSION && rec.gateMs === 271000 && rec.gate['oat-file-switch'].verdict === 'PASS', 'GATE PASS ⇒ the ledger keeps it, keyed by version + sha256 (data/cli-self-measure.json, atomic)', rec);
  ok(W.h.am.oatFileCaps().ok && placed(W.h) === 3 && JSON.stringify(W.back[0].slice().sort()) === JSON.stringify(W.h.ids.slice().sort()), 'the members are placed and the pool\'s ONE edge fires for each (onMemberReadingFresh: the walled conversations continue by themselves)', W.back);
  const ev = W.events.find(([n]) => n === 'cli-oat-measured');
  ok(!!ev && ev[1] === 'claude 2.1.399 · sha256 sha-399 · oat-file PASS · oat-file-401 PASS · oat-file-switch PASS', 'RULING R5: `cli-oat-measured` through the local road — version, sha256, verdict codes, nothing else', ev);
  // lane oat-add-door: the record carries the MINT'S SCOPES too (the variant last, never in the gate) — none before it reports
  ok(!W.h.am.oatMintCaps().ok, 'before the record: no mint scopes for 2.1.399 (way ② of the guided door not offered)');
  f.c.emit('message', { type: 'record', record: { results: [...P.RUN_ORDER.map((v) => ({ variant: v, verdict: 'PASS', note: 'n', heads: [], steps: [] })), { variant: 'oat-mint-scopes', verdict: 'PASS', note: 'm', scopes: ['user:inference'] }], escapes: [], foreignTokens: 0, belt: 'strace', ms: 445000 } });
  await until(() => Object.keys(ledgerOf(W.dir).binaries['2.1.399']['sha-399'].variants || {}).length === 7);
  ok(Object.keys(ledgerOf(W.dir).binaries['2.1.399']['sha-399'].variants || {}).length === 7 && W.h.am.oatFileCaps().ok, 'the record completes behind the gate (the six for the next release to seed + the mint); the PASS stands');
  { const mv = ledgerOf(W.dir).binaries['2.1.399']['sha-399'].variants['oat-mint-scopes']; const mc = W.h.am.oatMintCaps();
    ok(JSON.stringify(mv && mv.scopes) === '["user:inference"]' && mc.ok && mc.from === 'hub' && JSON.stringify(mc.scopes) === '["user:inference"]', 'the mint\'s PASS keeps its scopes in the ledger for these bytes and the view hands them to the store (from: hub)', { mv, mc }); }
  // a restart: a new store + a new ORCH over the same data dir
  const am2 = new AccountManager({ dataDir: W.dir, oatFixture: FXF, platform: 'linux' }); const forks2 = [];
  const o2 = ORCH.create({ accounts: () => am2, dataDir: W.dir, forkFn: () => { const c = new FakeChild(); forks2.push(c); return c; }, log: () => { }, event: () => { } });
  await o2.tick(); note({ am: am2 }); await am2.oatFileSettled(); await sleep(5);
  ok(forks2.length === 0 && am2.oatFileCaps().ok, 'A RESTART: the ledger\'s PASS for these bytes places them at the first note — nothing forked again');
  note({ am: am2 }, 'sha-OTHER'); await until(() => forks2.length === 1);
  ok(forks2.length === 1 && !am2.oatFileCaps().ok, 'the same version with OTHER bytes is another build: held and checked again');
  o2.stop();
}
{
  const W = await world('fail');
  note(W.h); await until(() => W.forks.length === 1);
  const c = W.forks[0].c;
  c.emit('message', { type: 'gate', gate: GATE({ pass: false, gate: { 'oat-file': { verdict: 'PASS', note: 'n' }, 'oat-file-401': { verdict: 'PASS', note: 'n' }, 'oat-file-switch': { verdict: 'FAIL', note: 'A ⇒ msg1 A:200; link→O ⇒ msg2 A:200; link→A ⇒ msg3 A:200; 0 refresh calls; files untouched' } } }) });
  await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']);
  const r = ledgerOf(W.dir).binaries['2.1.399']['sha-399'];
  ok(r.state === 'fail' && r.reason.code === 'no-follow' && !W.h.am.oatFileCaps().ok && placed(W.h) === 0, 'GATE FAIL ⇒ the hold stays; the ledger names the observation that differed (oat-file-switch: the move not followed)', r);
  ok(W.events.some(([n, d]) => n === 'cli-oat-measure-fail' && /^claude 2\.1\.399 · sha256 sha-399 · fail no-follow · oat-file PASS · oat-file-401 PASS · oat-file-switch FAIL$/.test(d)), '`cli-oat-measure-fail` — what opens a lane (version, sha256, verdict codes)', W.events);
  const p1 = await W.o.tick(); W.adv(7 * 3600e3); const p2 = await W.o.tick(); await sleep(5);
  ok(W.forks.length === 1 && p1.state === 'fail' && p2.state === 'fail', 'PACING (R6): a FAIL is never measured again for the same version + sha + probe, by itself');
  const ca = await W.o.checkAgain(); await until(() => W.forks.length === 2);
  ok(ca.state === 'checking' && W.forks.length === 2, 'the owner\'s «check again» runs it once more, whatever the pacing', ca);
  W.o.stop();
}
{
  const W = await world('refused');
  note(W.h); await until(() => W.forks.length === 1);
  W.forks[0].c.emit('message', { type: 'refused', code: 'no-strace', detail: 'strace is not installed' });
  await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']);
  ok(ledgerOf(W.dir).binaries['2.1.399']['sha-399'].state === 'cannot-run' && ledgerOf(W.dir).binaries['2.1.399']['sha-399'].reason.code === 'no-strace' && /Why: this machine has no strace/.test(W.h.am.cliUnmeasuredNotice()?.item?.detail || ''), 'a refusal by name ⇒ cannot-run, held, the item says why');
  W.adv(3600e3); const q1 = await W.o.tick(); await sleep(5);
  ok(W.forks.length === 1 && q1.state === 'cannot-run', 'cannot-run is not retried within 6 h by itself…');
  W.adv(5 * 3600e3 + 1000); await W.o.tick(); await until(() => W.forks.length === 2);
  ok(W.forks.length === 2, '…and is after 6 h (or at the next hub start)');
  W.o.stop();
}
{
  const W = await world('aborted');
  note(W.h); await until(() => W.forks.length === 1);
  W.forks[0].c.emit('message', { type: 'gate', gate: GATE({ pass: false, aborted: true }) });
  await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']);
  ok(ledgerOf(W.dir).binaries['2.1.399']['sha-399'].state === 'aborted' && /tried to connect outside this machine/.test(W.h.am.cliUnmeasuredNotice()?.item?.text || ''), 'an off-loopback connect ⇒ aborted: held, said, never re-run by itself');
  W.adv(30 * 86400e3); const a1 = await W.o.tick(); await sleep(5);
  ok(W.forks.length === 1 && a1.state === 'aborted', 'aborted is never re-run by the hub, a month later neither');
  await W.o.checkAgain(); await until(() => W.forks.length === 2);
  ok(W.forks.length === 2, '…only the owner\'s «check again» runs it');
  W.o.stop();
}
{
  // a hub that holds NO long-lived token: nothing to place, nothing measured
  const dir = path.join(tmp, 'orch-notoken'); fs.mkdirSync(dir, { recursive: true });
  const am0 = new AccountManager({ dataDir: dir, oatFixture: FXF, platform: 'linux' }); const forks0 = [];
  const o0 = ORCH.create({ accounts: () => am0, dataDir: dir, forkFn: () => { const c = new FakeChild(); forks0.push(c); return c; }, log: () => { }, event: () => { } });
  await o0.tick(); note({ am: am0 }); await sleep(5);
  const r0 = await o0.tick();
  ok(forks0.length === 0 && r0.state === 'none' && am0.hasLongLivedTokens() === false, 'a hub holding NO long-lived token forks nothing on an unseen build (nothing to place — a token added later is seen by the next tick)', r0);
  o0.stop();
}
{
  const W = await world('late', { bounds: { kill: 15 } });
  note(W.h); await until(() => W.forks.length === 1); await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399'], 2000);
  const r = ledgerOf(W.dir)?.binaries?.['2.1.399']?.['sha-399'];
  ok(!!r && r.state === 'cannot-run' && r.reason.code === 'timeout' && W.forks[0].c.killed, 'no gate by the bound ⇒ the child is stopped, cannot-run `timeout` (the hold lasts at most the bound)', r);
}
{
  const W = await world('switch', { enabled: () => false });
  note(W.h); await sleep(5);
  ok(W.forks.length === 0 && !W.h.am.oatFileCaps().ok && !W.h.am.oatFileCaps().local, 'SWITCH OFF (accounts.cliSelfMeasure): nothing forked, the release road only (today\'s behaviour)');
}
{
  const dir = path.join(tmp, 'orch-dmg2');
  const h = await mkHub(dir);
  fs.writeFileSync(path.join(dir, 'cli-self-measure.json'), '{"binaries": [');
  const forks = [], lines = [];
  const o = ORCH.create({ accounts: () => h.am, dataDir: dir, forkFn: () => { const c = new FakeChild(); forks.push(c); return c; }, log: (...a) => lines.push(a.join(' ')), event: () => { } });
  await o.tick(); note(h); await until(() => forks.length === 1);
  ok(lines.filter((l) => /is damaged — read as empty/.test(l)).length === 1 && forks.length === 1, 'a DAMAGED ledger is said once and read as empty — fail closed: nothing trusted, the build is checked again', lines);
  o.stop();
}
{
  const W = await world('r4');
  const before = W.rechecks(); W.setIdent('i-321-changed'); await W.o.tick();
  ok(W.rechecks() === before + 1, 'R4: the file the sessions spawn changed (its stat identity) ⇒ the version clock reads it NOW, not at its 15-min tick');
}

{
  // LAW A — the ledger UNREADABLE (a DIRECTORY where the file goes ⇒ EISDIR; r1 logged 19 112 lines in one second): said ONCE,
  // read again no faster than the tick, nothing placed (no PASS of its own trusted), nothing forked — never a loop
  const dir = path.join(tmp, 'orch-unreadable'); const h = await mkHub(dir);
  fs.mkdirSync(path.join(dir, 'cli-self-measure.json'));
  const forks = [], lines = []; let clock = Date.now(), reads = 0;
  const orig = fs.promises.readFile;
  fs.promises.readFile = function (p, ...a) { if (String(p).endsWith('cli-self-measure.json')) reads++; return orig.call(this, p, ...a); };
  try {
    const o = ORCH.create({ accounts: () => h.am, dataDir: dir, forkFn: () => { const c = new FakeChild(); forks.push(c); return c; }, log: (...a) => lines.push(a.join(' ')), event: () => { }, now: () => clock, statIdentity: async () => ({ identity: 'i-399' }) });
    await until(() => o.state().readFail);
    for (let k = 0; k < 20; k++) note(h);
    await sleep(5); await o.tick(); await o.tick(); clock += 30e3; await o.tick(); await sleep(5);
    const said = () => lines.filter((l) => /did not read \(EISDIR\)/.test(l)).length;
    ok(said() === 1 && reads === 1 && forks.length === 0 && !h.am.oatFileCaps().ok && !h.am.oatFileCaps().local && o.state().readFail?.code === 'EISDIR' && lines.length < 5, 'LAW A: an unreadable ledger (the file is a directory) is said ONCE; twenty notes and three ticks inside a minute read it once — nothing placed, nothing forked, no loop', { said: said(), reads, forks: forks.length, lines: lines.length });
    clock += 31e3; await o.tick(); await sleep(5);
    ok(reads === 2 && said() === 1 && forks.length === 0, '…read again at the tick a minute later (no faster), still said once, still nothing forked', { reads, said: said() });
    fs.rmdirSync(path.join(dir, 'cli-self-measure.json'));
    clock += 61e3; await o.tick(); await until(() => forks.length === 1);
    ok(forks.length === 1 && o.state().read === true, '…and the first read that succeeds decides: the unseen build is checked');
    o.stop();
  } finally { fs.promises.readFile = orig; }
}
{
  // LAW I — the hub places on THE JUDGE, never on the child's boolean
  const W = await world('judge');
  note(W.h); await until(() => W.forks.length === 1);
  W.forks[0].c.emit('message', { type: 'gate', gate: GATE({ pass: true, gate: {} }) });
  await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']);
  ok(ledgerOf(W.dir).binaries['2.1.399']['sha-399'].state === 'fail' && !W.h.am.oatFileCaps().ok && placed(W.h) === 0 && W.back.length === 0, 'LAW I: a message saying pass:true over an EMPTY gate places nothing — the judge (oatInFile over the three verdicts) reads it as a FAIL', ledgerOf(W.dir).binaries['2.1.399']['sha-399']);
  W.o.stop();
}
for (const [tag, row, what] of [
  ['load-fail-gate', { state: 'pass', probe: P.PROBE_VERSION, gate: { 'oat-file': { verdict: 'FAIL', note: 'n' }, 'oat-file-401': { verdict: 'FAIL', note: 'n' }, 'oat-file-switch': { verdict: 'FAIL', note: 'n' } } }, 'a ledger row that SAYS pass over its own all-FAIL gate'],
  ['load-old-probe', { state: 'pass', probe: P.PROBE_VERSION - 1, gate: GATE().gate }, `a PASS written by an OLDER probe (${P.PROBE_VERSION - 1} < ${P.PROBE_VERSION} — the probe was bumped)`],
]) {
  // LAW I at LOAD and after a BUMP: the row on file is judged again — no trust in a word the judge does not give today
  const dir = path.join(tmp, 'orch-' + tag); const h = await mkHub(dir);
  fs.writeFileSync(path.join(dir, 'cli-self-measure.json'), JSON.stringify({ schema: 1, binaries: { '2.1.399': { 'sha-399': { cli: '2.1.399', sha256: 'sha-399', startedAt: 1, endedAt: 2, ...row } } } }));
  const forks = [], lines = [];
  const o = ORCH.create({ accounts: () => h.am, dataDir: dir, forkFn: () => { const c = new FakeChild(); forks.push(c); return c; }, log: (...a) => lines.push(a.join(' ')), event: () => { } });
  await o.tick(); note(h); await until(() => forks.length === 1); await h.am.oatFileSettled();
  ok(forks.length === 1 && !h.am.oatFileCaps().ok && placed(h) === 0 && lines.some((l) => /the PASS on file is not one the judge gives under probe/.test(l)), `LAW I: ${what} places NOTHING — it is measured again, once, and the journal says why`, { forks: forks.length, lines });
  o.stop();
}
{
  // SMALLER 1 + 2 — a press during a check; stop() during a check
  const W = await world('press');
  note(W.h); await until(() => W.forks.length === 1);
  W.adv(2 * 60e3);
  const pr = await W.o.checkAgain(); await sleep(5);
  ok(pr.state === 'checking' && pr.already === true && pr.leftMin === 3 && W.forks.length === 1, 'SMALLER 1: «check again» while a check RUNS starts nothing — it answers «already checking — about 3 min left»', pr);
  const FA = require(path.join(REPO, 'src/foryou-actions.js')); const row = (FA.ROWS || []).find((r) => r.type === 'cli-check-again');
  const Z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, J = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  ok(!!row && ['done', 'started', 'already', 'off', 'none', 'failed'].every((k) => typeof row.checkSaid[k] === 'string' && Z[row.checkSaid[k]] && J[row.checkSaid[k]]) && /\{n\}/.test(row.checkSaid.already), 'the press says what it did, in zh / ja too: done · started · already (about {n} min left) · off · nothing to check · could not start', row && row.checkSaid);
  const UTA = read('src/lib/user-todos-actions.js');
  ok(/if \(r && r\.ok && r\.already\) \{ showToast\(t\(said\.already, \{ n: String\(Number\(r\.leftMin\) \|\| 1\) \}\)\); return true; \}/.test(UTA), 'the client says «already checking» with the minutes left (never «checking again» over a running check)');
  ok(W.h.am.oatFileCaps().local?.state === 'checking', 'precondition: the store says checking');
  W.o.stop();
  ok(!W.h.am.oatFileCaps().local && !W.h.am.oatFileCaps().ok, 'SMALLER 2: stop() never leaves the view at «checking» (no record ⇒ no view; the hold stays, fail closed)', W.h.am.oatFileCaps().local);
}
{
  // LAW H (1) — the spawn-env census (test-architecture §94) SEES the hub's fork: a `literal` site in the file itself (no alias), and
  // the fork with its env REMOVED (the child would inherit the hub's whole environment) is a `raw` site no row allows — red
  const SEC = await import(pathToFileURL(path.join(REPO, 'scripts/spawn-env-census.mjs')).href);
  const F = 'src/server/cli-self-measure.js', T = read(F);
  const siteOf = (text) => SEC.scan(REPO, { files: [F], patch: { [F]: text } }).sites.filter((x) => x.call === 'fork');
  const real = siteOf(T);
  ok(real.length === 1 && real[0].k === 'literal' && real[0].cmd === 'probePath', 'LAW H (1): the spawn-env census finds the hub\'s fork IN this file — one `literal` site (fork(probePath, …, { env: { PATH, HOME, LANG, TMPDIR } }))', real.map((x) => ({ k: x.k, cmd: x.cmd })));
  const fi = T.indexOf(': fork(probePath, [], { env: {'), fj = fi >= 0 ? T.indexOf('}, stdio:', fi) : -1;
  const noEnv = fi >= 0 && fj > fi ? T.slice(0, fi) + ': fork(probePath, [], { ' + T.slice(fj + 3) : T;
  const mut = siteOf(noEnv);
  ok(noEnv !== T && mut.length === 1 && mut[0].k === 'raw' && !SEC.ROWS.some((r) => r[0] === F), 'RED CONTROL: the fork with its env removed is a `raw` site and no row allows it — the census goes red', mut.map((x) => ({ k: x.k, cmd: x.cmd })));
}
{
  // LAW B — a changed binary drops this hub's own PASS on THAT tick, even with --version silent; an unchanged one whose hash read
  // failed changes nothing (no flap). Driven through oat-file-sync's tick with a stub machine (seam b: the hooks get the COMMAND string)
  const OFS = require(path.join(REPO, 'src/server/oat-file-sync.js'));
  const h = await mkHub(path.join(tmp, 'law-b'));
  let ver = '2.1.399 (Claude Code)', facts = { path: '/opt/claude', cmd: '/opt/claude', sha256: 'sha-399', identity: 'i-399' };
  const seen = [];
  const mp = { cliVersion: async (c) => { seen.push(['v', c]); return ver; }, cliBinary: async (c) => { seen.push(['b', c]); return facts; } };
  const sync = OFS.start({ accounts: h.am, machineProbes: mp, claudeCmd: () => '/opt/claude', log: () => { }, bootDelayMs: 1e9, recheckMs: 1e9 });
  await sync.tick();
  h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'pass', startedAt: Date.now() }); await h.am.oatFileSettled();
  ok(h.am.oatFileCaps().ok && placed(h) === 3, 'precondition: this hub\'s own PASS places the bytes it measured');
  ok(seen.length >= 2 && seen.every(([, c]) => typeof c === 'string' && c === '/opt/claude'), 'SEAM (b): the version read and the binary read both receive the COMMAND string (`bin`); the facts object is `binFacts`', seen);
  ver = null; facts = { path: '/opt/claude', cmd: '/opt/claude', sha256: null, identity: 'i-399' };
  await sync.tick(); await h.am.oatFileSettled();
  ok(h.am.oatFileCaps().ok && placed(h) === 3, 'LAW B: --version silent and the hash read failed on an UNCHANGED file ⇒ nothing changes (no flap)');
  facts = { path: '/opt/claude', cmd: '/opt/claude', sha256: null, identity: 'i-NEW' };
  await sync.tick(); await h.am.oatFileSettled();
  ok(!h.am.oatFileCaps().ok && placed(h) === 0, 'LAW B: --version silent but the file CHANGED (new identity, no hash yet) ⇒ the hub\'s own PASS stops counting on that tick — held (fail closed)');
  ver = '2.1.399 (Claude Code)'; facts = { path: '/opt/claude', cmd: '/opt/claude', sha256: 'sha-399', identity: 'i-NEW' };
  await sync.tick(); await h.am.oatFileSettled();
  ok(h.am.oatFileCaps().ok && placed(h) === 3, '…and the same bytes read again (a reinstall of the same build) are the same PASS');
  const OFS_SRC = code(read('src/server/oat-file-sync.js'));
  ok(/const bin = typeof claudeCmd === 'function' \? claudeCmd\(\) : claudeCmd;/.test(OFS_SRC) && /binFacts = await machineProbes\.cliBinary\(bin \|\| 'claude'\)/.test(OFS_SRC) && /accounts\.noteCliVersion\(v, binFacts\)/.test(OFS_SRC), 'SEAM (b): `bin` stays the command string in oat-file-sync; the object is `binFacts`');
  sync.stop();
}
{
  // LAW G4 — the conversation's own card, chip and watch notice show the check, not a date; the facet dies with the run
  const AR = require(path.join(REPO, 'src/server/auto-resume.js'));
  const startedAt = Date.now() - 60e3;
  const cause = { kind: 'pool', checking: { cli: '2.1.399', n: 2, startedAt, typicalMin: 5, boundMin: 20 } };
  const was = global.__vsCliCheckingNow;
  global.__vsCliCheckingNow = () => ({ cli: '2.1.399', startedAt });
  const far = Date.now() + 4 * 86400e3;
  const live = AR.armNoticeFor('usage limit', far, Date.now(), cause);
  ok(/Claude Code 2\.1\.399/.test(live) && /约 5 分钟/.test(live) && !/\d{1,2}\/\d{1,2}|\d{4}-\d\d|\d\d:\d\d/.test(live), 'LAW G4: an arm whose cause carries the running check says the check and its minutes — never the reset four days away', live);
  global.__vsCliCheckingNow = () => null;
  const dead = AR.armNoticeFor('usage limit', far, Date.now(), cause);
  ok(!/VibeSpace 正在确认/.test(dead), '…and the moment that check is no longer running the facet is dropped: the card says the wall as it is', dead);
  global.__vsCliCheckingNow = () => ({ cli: '2.1.399', startedAt: startedAt + 1 });
  ok(!/VibeSpace 正在确认/.test(AR.armNoticeFor('usage limit', far, Date.now(), cause)), '…another run of the same build is not this facet\'s run (liveCause matches cli + startedAt)');
  global.__vsCliCheckingNow = was;
  const CSB = read('src/lib/chat-status-bar.js');
  ok(/const ck = a\.armed && a\.cause && a\.cause\.checking \? a\.cause\.checking : null;/.test(CSB) && /\(ck \? ' ' \+ escHtml\(t\('checking…'\)\)/.test(CSB), 'LAW G4: the conversation\'s chip reads the cause\'s check — «checking…», its title the minutes — never a date');
  const ARS = read('src/server/auto-resume.js');
  ok(/const ck = liveCause\(cause\) && liveCause\(cause\)\.checking;\s*\n\s*if \(ck\) \{ try \{ notify\(id, session, armNoticeFor\(reason, resets, at, cause\)\); \} catch \{ \} \} else/.test(ARS) && /cause: a \? liveCause\(a\.cause \|\| null\) : null,/.test(ARS), 'LAW G4: the watch notice (a reset beyond the wait) says the check, and the status the chip reads carries the LIVE cause');
  ok(/const memberServable = \(id, poolId = null\) => \{ try \{ return quotaVerdict\(poolReadCache\(poolId\)\(id\), Date\.now\(\) \/ 1000, \{ tier: 'hot' \}\)\.usable === true; \} catch \{ return false; \} \};/.test(ENG_SRC) && /if \(!held\.some\(\(r\) => memberServable\(r\.id, sessionPoolOf\(session\)\)\)\) return null;/.test(ENG_SRC), 'ITEM 6: the conversation\'s own card / chip / watch notice carry the check only when a member it holds could SERVE on its last reading (the same verdict the PASS edge reads) — else the wall\'s own words, with its date');
  ok((ENG_SRC.match(/cause: withChecking\(armCauseFor\(/g) || []).length === 4, 'LAW G4: every arm the pool makes carries the check (withChecking at the four armCauseFor sites)');
}

// ── §5 the engine's wiring ──
console.log('§5 the engine: the one edge, the pool card, no blocked-pool item while it checks');
const ENG = ENG_SRC;
ok(/require\('\.\/cli-self-measure\.js'\)\.create\(\{ accounts: \(\) => \{ try \{ return getAccounts\(\); \} catch \{ return null; \} \}, dataDir: path\.join\(rootDir, 'data'\), app, enabled: \(\) => \{ try \{ return serverSetting\('accounts\.cliSelfMeasure'\) !== false; \} catch \{ return true; \} \}, onMembersBack: \(ids\) => \{ for \(const id of ids\) \{ try \{ onMemberReadingFresh\(id, 'cli-measured', \{ placeable: true \}\); \} catch \{\} \} \}, onCheckEnded: /.test(ENG), 'the engine creates the ORCH with the switch and onMembersBack = the pool\'s ONE edge per member, PLACEABLE (law G3: the member\'s eligibility changed, not its reading — a reading hours old still re-decides), and onCheckEnded re-says every armed conversation\'s status (G4)');
ok(/try \{ cliSelfMeasure\.tick\(\)\.catch\(\(\) => \{\}\); \} catch \{\} \}, 60000\);/.test(ENG), '…and ticks it every 60 s (R4 rides it)');
ok(/serverNotice\(nk, poolBlockedNotice\(d, [^\n]*\{ level: 'warn' \}\);\n\s*const ck = poolCheckingNotice\(d, \{ poolName: a\.name, servable: memberServable \}\);\n\s*if \(ck\) serverNotice\(`pool-checking-\$\{poolId\}-\$\{Math\.floor\(now \/ 3600000\)\}`, ck\.text, \{ level: 'info', i18n: ck\.i18n \}\);/.test(ENG) && /if \(!\(ck && ck\.promise\)\) poolBlockedTodo\(/.test(ENG), 'LAW G1/G2: the blocked warning always says everything it says; a running check is an ADDITION under its OWN hourly key (a FAIL in the same hour still raises the warning); the For-you item is filed unless the check is the whole story (R2)');
const SCH = require(path.join(REPO, 'src/lib/settings-schema.js'));
const row = (SCH.SETTINGS_SCHEMA || SCH.default || SCH)['accounts.cliSelfMeasure'];
ok(!!row && row.type === 'boolean' && row.default === true && /OFF: those accounts wait for a VibeSpace update/.test(row.description), 'the switch `accounts.cliSelfMeasure` (default on); its help says what off means', row);

// ── §6 R8 ──
console.log('§6 R8: an ordinary update is a quiet fact; a registered build\'s unknown record is the surprise');
{
  const { MessageWindow } = require(path.join(REPO, 'src/message-window.js'));
  const evs = []; const was = global.__vsEvent; global.__vsEvent = (n, d) => evs.push([n, d]);
  const mw = Object.create(MessageWindow.prototype); mw._emit = () => { };
  mw._noteAddedKind('record', 'brand_new_kind', '2.1.321', false); mw._noteAddedKind('record', 'brand_new_kind', '2.1.321', false);
  mw._noteAddedKind('fields', 'result/success', '2.1.399', false); mw._noteAddedKind('fields', 'result/success', '2.1.399', false);
  global.__vsEvent = was;
  ok(evs.length === 2 && evs[0][0] === 'cli-record-surprise' && /2\.1\.321 · record:brand_new_kind$/.test(evs[0][1]) && evs[1][0] === 'cli-record-kind' && /2\.1\.399 · fields:result\/success$/.test(evs[1][1]), 'each kind counted ONCE per build through the local road: a registered build ⇒ cli-record-surprise, any other ⇒ cli-record-kind', evs);
  const kinds = mw.addedKinds();
  ok(kinds[0].registered === true && !kinds[1].registered, 'the chip\'s kinds carry whether the build is registered');
  const CB = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-bar-words.js')).href);
  const tt = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? p[k] : m));
  const s1 = CB.addedKindsChipWords([kinds[0]], tt).title, s2 = CB.addedKindsChipWords([kinds[1]], tt).title;
  ok(/a real surprise, and it is reported/.test(s1) && /newer than this VibeSpace's record table/.test(s2) && !/not registered|has not registered/.test(s1 + s2), 'the chip\'s hover: the surprise said as one; an ordinary update as a quiet fact (never «not registered»)', [s1, s2]);
  const RW = await import(pathToFileURL(path.join(REPO, 'src/lib/cli-registration-words.js')).href);
  ok(RW.unregisteredLine('2.1.399', tt) === 'Claude Code 2.1.399 is newer than this VibeSpace’s record table — a record kind it adds is listed in Diagnostics; conversations are not affected', 'the registration line says the fact, never «until the next release» (the founding requirement)');
  const CR = read('src/lib/chat-renderers.js');
  ok(/static drawsNothing\(msg\) \{\s*return !!msg && \(\(msg\.noticeKind === 'unknown-record' && msg\.content\?\.\[0\]\?\.type === 'unknown_record'\) \|\| \(msg\.noticeKind === 'unknown-fields'/.test(CR) && /drawsNothing\(msg\)\) return null/.test(CR), 'no card is drawn in the chat for either (door-healthy-chat\'s ruling stands — ChatRenderers.drawsNothing, the .388 one rule)');
}

// ── §7 the words census ──
console.log('§7 the words: never «unmeasured», never «wait for the measurement», never «until the next release»');
const BANNED = /unmeasured|not measured|wait for the measurement|until this version is measured|until the next release|not registered|wait for a measured/i;
const sayAll = (CC, AP) => {
  const out = [];
  for (const st of [null, 'checking', 'fail', 'cannot-run', 'aborted']) {
    const loc = st ? { state: st, reason: st === 'fail' ? 'no-follow' : 'no-strace', typicalMin: 5, boundMin: 20, elapsedMin: 2, late: st === 'checking' } : null;
    const it = CC.cliUnmeasuredItem({ cli: '2.1.399', names: ['A', 'B'], local: loc }); out.push(it.text, it.detail);
    if (CC.cliHeldSpawnText) out.push(CC.cliHeldSpawnText({ pool: 'P', cli: '2.1.399', local: loc }));
    if (AP) for (const file of [true, false]) out.push(AP.unplaceableText({ code: 'cli-unmeasured', cli: '2.1.399', file, ...(loc ? { local: loc } : {}) }));
  }
  return out;
};
const said = sayAll(C, APA).filter((s) => BANNED.test(s));
ok(said.length === 0, 'every sentence the item, the refusal and the roster can say, in every state of the check', said);
const MA = read('src/lib/manage-agents.js'), AC = read('src/auto-cli-model.js'), SCHT = read('src/lib/settings-schema.js');
const literals = (t, re) => [...t.matchAll(/t\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((s) => re.test(s));
const maBad = literals(MA, /Claude Code|CLI version|claude \{cli\}/).filter((s) => BANNED.test(s));
const ACM = require(path.join(REPO, 'src/auto-cli-model.js'));
ok(maBad.length === 0 && !BANNED.test(ACM.notProbedWords(ACM.CLI_UNMEASURED, { oatCli: { cli: '2.1.399' } })), 'Manage Agents\' words and the probe note about the CLI', [maBad, ACM.notProbedWords(ACM.CLI_UNMEASURED, { oatCli: { cli: '2.1.399' } })]);
const Zd = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, Jd = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const dictBad = Object.entries(Zd).filter(([k, v]) => /Claude Code|CLI \{v\}|claude \{v\}/.test(k) && /未测量|测量完成之前|尚未登记/.test(v)).concat(Object.entries(Jd).filter(([k, v]) => /Claude Code|CLI \{v\}|claude \{v\}/.test(k) && /未計測|測定が終わるまで|未登録/.test(v)));
ok(dictBad.length === 0, 'zh / ja: no sentence about the CLI says 未测量 / 未計測 / 尚未登记 / 未登録', dictBad.map(([k]) => k));
{
  // RED CONTROL: the base's words (2.369.387, de0590367) said it — the same census over them is red
  let base = null;
  try { base = execFileSync('git', ['-C', REPO, 'show', 'de0590367:src/cli-caps.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { base = null; }
  if (base) {
    const m = { exports: {} }; new Function('module', 'exports', 'require', base)(m, m.exports, require);
    ok(sayAll(m.exports, null).some((s) => BANNED.test(s)), 'RED CONTROL: the base\'s item words (2.369.387) fail this census — «until this version is measured»');
  } else console.log('  SKIP the RED control over the base\'s words: de0590367 is not in this checkout (a depth-1 clone)');
}

// ── §8 law 5: the census of version gates ──
// THE LIMIT, named: the census sees what git TRACKS (git grep over the index — scripts/tracked-files.mjs's rule). A new file not
// yet `git add`-ed is invisible to it until it is; the pre-push hook and CI judge committed trees, where nothing is untracked.
console.log('§8 LAW 5: every version gate — does an ordinary Claude Code update (no breaking change) need a VibeSpace release? NO');
// the rows live in scripts/fixtures/cli-update-census.json — 主开发's seam with lane cli-update-needs-nothing: ONE file, THEIR shape
// ({"//", schema: 1, rows: [{id, file, keyedOn, needsReleaseOnOrdinaryUpdate, road, suite, match?, sites?}]}); this leg reads the
// keyedOn 'version' rows, theirs the 'model' rows (an append union at the train)
const CENSUS = JSON.parse(read('scripts/fixtures/cli-update-census.json'));
const ALL_ROWS = CENSUS && Array.isArray(CENSUS.rows) ? CENSUS.rows : [];
const VROWS = ALL_ROWS.filter((r) => r.keyedOn === 'version');
ok(CENSUS && CENSUS.schema === 1 && typeof CENSUS['//'] === 'string' && VROWS.length > 0 && new Set(ALL_ROWS.map((r) => r.id)).size === ALL_ROWS.length, 'the census file is the shared shape — {"//", schema: 1, rows}, one id per row');
const CLI_V = String.raw`['"\x60][12]\.[0-9]\.[0-9]{3}['"\x60]`;   // a Claude Code build ('2.1.321'); ours are 2.369.x, never matched
const CMP = String.raw`(?:[!=]==?|(?<!=)[<>]=?)`;
const HELPER = String.raw`(?:\b\w*[cC]ompare\w*Versions?\b|\b\w*[vV]ersions?[cC]ompare\w*|\bsemver\w*|\bvcmp\b|\bbyVersion\b|localeCompare\([^)]*numeric)`;
const CLI_ID = String.raw`\b(?:cli|cliVersion|claudeVersion|cliV|_oatCli)\b`;
const VKINDS = {
  'oat-gate': /\boatInFile\(/,
  'schema-versions': /\bSCHEMA_CLI_VERSIONS?\b/,
  'cli-version-const': /\b(?!SCHEMA_)[A-Z][A-Z_]*_CLI_VERSIONS?\b/,
  'measured-versions': /\bmeasuredVersions\(/,
  'hot-switch-evidence': /\bhotSwitchEvidence\b/,
  // a compare HELPER over a CLI build, or cliVersionOf(…) compared — `compareVersions(cli, '2.1.400') >= 0`, `cliVersionOf(v) !== x`
  'version-compare': new RegExp(String.raw`cliVersionOf\([^)]*\)\s*${CMP}|${HELPER}.*${CLI_ID}|${CLI_ID}.*${HELPER}`),
  // a BARE string compare against a build — `if (v >= '2.1.400')`
  'version-string-compare': new RegExp(String.raw`${CMP}\s*${CLI_V}|${CLI_V}\s*${CMP}`),
  // a build literal anywhere in code — a table keyed or labelled by build
  'version-literal': new RegExp(CLI_V),
};
// the candidates: ONE `git grep -n` over the tracked tree with a SUPERSET of the kinds (in C); each line is judged here, comment
// lines skipped and a trailing // stripped (the same line rule as cli-update-needs-nothing's §M)
const VSUPER = String.raw`oatInFile\(|_CLI_VERSION|measuredVersions\(|hotSwitchEvidence|cliVersionOf\(|ompare[A-Za-z]*Version|ersions?[cC]ompare|semver|vcmp|byVersion|localeCompare\([^)]*numeric|['"\x60][12]\.[0-9]\.[0-9]{3}['"\x60]`;
const srcFile = (f) => /\.(c|m)?js$/.test(f) && !/\/i18n-[a-z]+\.js$/.test(f) && !/\.min\.js$|\/vendor\//.test(f);
const vline = (hits, f, text) => { const s = text.trim(); if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return; const l = text.replace(/(^|[^:\\'"`])\/\/.*$/, '$1'); for (const [k, re] of Object.entries(VKINDS)) if (re.test(l)) hits.set(f + '|' + k, (hits.get(f + '|' + k) || 0) + 1); };
const vscan = (files) => { const hits = new Map(); for (const [f, t] of files) for (const l of String(t).split('\n')) vline(hits, f, l); return hits; };
const gitOut = (args) => { try { return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { return e && e.status === 1 ? '' : null; } };
const VHITS = new Map();
// PCRE first (one pass in ~35 ms against ~130 ms for ERE on this tree); a git built without PCRE (exit 128) falls back to -E
const grepOut = gitOut(['grep', '-n', '-I', '-P', VSUPER, '--', 'src', 'server.js', 'data/bin']) ?? gitOut(['grep', '-n', '-I', '-E', VSUPER, '--', 'src', 'server.js', 'data/bin']);
ok(grepOut !== null, 'the census can ask git what is tracked (a tarball without .git cannot run it — that is a failure, never a pass)');
for (const row of String(grepOut || '').split('\n')) { const m = /^([^:]+):\d+:(.*)$/.exec(row); if (m && srcFile(m[1])) vline(VHITS, m[1], m[2]); }
// THE JSON TABLES: a tracked .json keyed by build (top level or `versions`) that a src file reads — each reader is a `json-table` site
const isBuildTable = (t) => { try { const o = JSON.parse(t); const vs = o && typeof o === 'object' ? (o.versions && typeof o.versions === 'object' ? o.versions : o) : null; const ks = vs ? Object.keys(vs) : []; return ks.length > 0 && ks.every((k) => /^\d+\.\d+\.\d+$/.test(k)); } catch { return false; } };
const tablesIn = (out) => String(out || '').split('\n').filter((f) => f.endsWith('.json')).filter((f) => isBuildTable(read(f)));
const tableReaders = (hits, tables, readerText) => { for (const tab of tables) { const base = path.basename(tab); for (const [f, t] of readerText(base)) { const n = t.split('\n').filter((l) => { const s = l.trim(); return !(s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) && l.replace(/(^|[^:\\'"`])\/\/.*$/, '$1').includes(base); }).length; if (n) hits.set(f + '|json-table', (hits.get(f + '|json-table') || 0) + n); } } return hits; };
const TABLES = tablesIn(gitOut(['grep', '-l', '-E', String.raw`"[12]\.[0-9]\.[0-9]{3}"\s*:`, '--', 'scripts/fixtures/*.json', 'src/*.json', 'data/*.json']));
tableReaders(VHITS, TABLES, (base) => String(gitOut(['grep', '-l', '-F', base, '--', 'src', 'server.js', 'data/bin']) || '').split('\n').filter(srcFile).map((f) => [f, read(f)]));
ok(TABLES.includes('scripts/fixtures/oat-in-file.json'), 'the JSON tables keyed by build are found (scripts/fixtures/oat-in-file.json among them)', TABLES);
for (const r of VROWS) console.log(`    ${r.file.padEnd(34)} ${r.id}${r.match ? ` [${r.match} ×${r.sites}]` : ''}  →  ${r.needsReleaseOnOrdinaryUpdate === false ? 'NO' : 'YES'} — ${r.road}`);
console.log(`    (the grep: ${VHITS.size} version-keyed sites in ${new Set([...VHITS.keys()].map((k) => k.split('|')[0])).size} files)`);
const VKEYS = new Set(VROWS.filter((r) => r.match).map((r) => r.file + '|' + r.match));
const unrowed = [...VHITS.keys()].filter((k) => !VKEYS.has(k)), dead = [...VKEYS].filter((k) => !VHITS.has(k));
ok(unrowed.length === 0, `every version-keyed site in the tracked source (${VHITS.size}) is a row of the census`, unrowed);
ok(dead.length === 0, 'no row is dead (its site still exists — a dead row would hide a new one)', dead);
const vmoved = VROWS.filter((r) => r.match && VHITS.get(r.file + '|' + r.match) !== r.sites);
ok(vmoved.length === 0 && VROWS.filter((r) => r.match).every((r) => Number.isInteger(r.sites) && r.sites > 0), 'every row\'s site count is the tree\'s: a new site in an already-rowed file is judged again', vmoved.map((r) => `${r.id} ${r.sites} → ${VHITS.get(r.file + '|' + r.match)}`));
ok(VROWS.every((r) => typeof r.id === 'string' && r.id && fs.existsSync(path.join(REPO, r.file)) && r.needsReleaseOnOrdinaryUpdate === false && typeof r.road === 'string' && r.road.length > 10 && typeof r.suite === 'string' && fs.existsSync(path.join(REPO, 'scripts', r.suite + '.mjs')) && (!r.match || Object.prototype.hasOwnProperty.call(VKINDS, r.match) || r.match === 'json-table')), `THE ONE QUESTION, answered for every one of the ${VROWS.length} rows: an ordinary Claude Code update needs NO release of VibeSpace (needsReleaseOnOrdinaryUpdate: false), each row naming its road and the suite that holds it`);
// RED controls — the same scanner over planted text
const plantedV = vscan([['src/new-gate.js', "if (compareVersions(cli, '2.1.400') >= 0) holdEverything();\nif (v >= '2.1.400') a();\nconst NEW_CLI_VERSION = '2.1.400';\nif (cliVersionOf(v) === '2.1.400') b();\n"]]);
ok(['version-compare', 'version-string-compare', 'cli-version-const'].every((k) => plantedV.has('src/new-gate.js|' + k) && !VKEYS.has('src/new-gate.js|' + k)), 'RED CONTROL: a compare helper over the CLI build, a bare string compare and a pin planted in a new file are sites with no row', [...plantedV.keys()]);
const plantedT = tableReaders(new Map(), ['scripts/fixtures/oat-in-file.json'], () => [['src/new-reader.js', "const T = require('../scripts/fixtures/oat-in-file.json');\n"]]);
ok(plantedT.get('src/new-reader.js|json-table') === 1 && !VKEYS.has('src/new-reader.js|json-table') && isBuildTable('{"versions": {"2.1.400": {}}}') && !isBuildTable('{"zod": {}}'), 'RED CONTROL: a new reader of a build-keyed JSON table is a site with no row; a table that is not keyed by build is not one');
const rsSrc = read('src/record-shape.js');
const grownV = vscan([['src/record-shape.js', rsSrc + "\nconst X = { 'system/new_kind': '2.1.400' };\n"]]);
ok(grownV.get('src/record-shape.js|version-literal') !== (VROWS.find((r) => r.id === 'record-oracle-since') || {}).sites, 'RED CONTROL: one more build literal in an already-rowed file moves its row\'s count — red');

// ── ROUND 4 (acceptance r3): the fence — pure pins a reader can re-run with lines of their own (scripts/oat-trace-judge.mjs) ──
console.log('§9 ROUND 4: the record is the tracer\'s stream; every call accounted for; the doors shut; /proc by argument');
{
  const T = (pid, l) => `${pid} 12:00:00.000001 ${l}`;
  const rec = (...ls) => ls.join('\n') + '\n';
  const ROOTL = T(100, 'execve("/usr/bin/node", ["node"], 0x7ffd /* 9 vars */) = 0'), ROOTX = T(100, '+++ exited with 0 +++');
  const gapOf = (txt, o) => P.recordGap(P.parseTrace(txt), o);
  // ITEM 1 — the record is the tracer's stderr STREAM, never a file a traced process could reach
  const PS4 = code(read('src/claude-oat-probe.js'));
  const launcher4 = PS4.slice(PS4.indexOf('  function launch('), PS4.indexOf('  function startCli('));
  ok(!/'-o'/.test(launcher4) && /child\.stderr\.on\('data', \(chunk\) => \{[\s\S]*?if \(!rec\.oversize\) rec\.text \+= chunk;/.test(launcher4) && !/\bstraceOf\b|TRACE_DIR|version\.strace|\$\{name\}\.strace/.test(PS4) && /const recordOf = \(h\) => \{ const p = parseTrace\(h\.rec\.text\);/.test(PS4), 'ITEM 1: the record is the tracer\'s OWN stderr (a socket this process holds — no -o, no file, nothing read back by path); the judge reads only that stream, kept whole as it arrived');
  ok(/stdio: \[0, 1, err\]/.test(read('src/claude-oat-trampoline.js')) && /fs\.writeFileSync\(TRAMP, SHIPPED_TRAMP, \{ mode: 0o600 \}\);/.test(PS4), 'ITEM 1: the first traced process is the trampoline (copied into the scratch), which hands the binary its own stderr — no traced process ever holds the record socket (a socket cannot be reopened through /proc)');
  // ITEM 2 — every call accounted for
  const clean = rec(ROOTL, T(100, 'openat(AT_FDCWD</x>, "/x/a", O_RDONLY <unfinished ...>'), T(101, 'statx(AT_FDCWD</x>, "/x", 0, STATX_ALL, {stx_mask=0}) = 0'), T(100, '<... openat resumed>) = 3</x/a>'), ROOTX);
  ok(gapOf(clean) === null && P.parseTrace(clean).joined === 1, 'ITEM 2: split and resumed ⇒ joined, the record accounts for every call (clean)');
  const midOpen = rec(ROOTL, T(102, 'openat(AT_FDCWD</x>, "/home/u/.ssh/id", O_RDONLY <unfinished ...>'), T(100, 'getcwd("/x", 4096) = 3'), ROOTX);
  ok((gapOf(midOpen) || {}).void === 'trace-unfinished' && /no end \(openat, pid 102\)/.test(gapOf(midOpen).why), 'ITEM 2: a half that NEVER resumes (mid-record, its process never seen dying) ⇒ VOID by name', gapOf(midOpen));
  const three = rec(ROOTL, T(201, 'openat(AT_FDCWD</x>, "/x/1", O_RDONLY <unfinished ...>'), T(202, 'openat(AT_FDCWD</x>, "/x/2", O_RDONLY <unfinished ...>'), T(203, 'openat(AT_FDCWD</x>, "/x/3", O_RDONLY <unfinished ...>'), T(202, '<... openat resumed>) = 4</x/2>'), T(203, '<... openat resumed>) = 5</x/3>'), T(201, '<... openat resumed>) = 3</x/1>'), ROOTX);
  ok(gapOf(three) === null && P.parseTrace(three).joined === 3 && JSON.stringify(P.guardedReadsOf(P.parseTrace(three).lines, [], { deny: ['/x/2'] })) === '["/x/2"]', 'ITEM 2: interleaved across three pids ⇒ each half joined to its own pid (the fence then judges each — /x/2 denied here)');
  for (const [what, txt, kind] of [
    ['a resumed half with no opening', rec(ROOTL, T(100, '<... openat resumed>) = 3</x/a>'), ROOTX), 'trace-unparsed'],
    ['a 1 MB line (strace -s 256 never writes one)', rec(ROOTL, T(100, `write(1, "${'x'.repeat(1 << 20)}", 1048576) = 1048576`), ROOTX), 'trace-unparsed'],
    ['garbage', rec(ROOTL, 'garbage that no tracer wrote', ROOTX), 'trace-unparsed'],
    ['an openat CUT by its process\'s death', rec(ROOTL, T(104, 'openat(AT_FDCWD</x>, "/x/b", O_RDONLY <unfinished ...>'), T(104, '+++ killed by SIGKILL +++'), ROOTX), 'trace-unfinished'],
    ['no death line of the first process', rec(ROOTL, T(100, 'getcwd("/x", 4096) = 3')), 'trace-unfinished'],
  ]) ok((gapOf(txt) || {}).void === kind, `ITEM 2: ${what} ⇒ VOID ${kind}`, gapOf(txt) && gapOf(txt).why);
  const cutWait = rec(ROOTL, T(105, 'wait4(-1 <unfinished ...>'), T(105, '+++ killed by SIGKILL +++'), ROOTX);
  ok(gapOf(cutWait) === null && JSON.stringify(P.parseTrace(cutWait).cut) === '[{"pid":105,"call":"wait4"}]', 'ITEM 2: the ONE exemption, by name and position — a call that opens nothing, cut by its process\'s death AFTER the tracer saw the death (wait4 here): it returned nothing to anyone');
  ok((gapOf(clean, { killed: true }) || {}).void === 'trace-unfinished' && (gapOf(clean, { ended: false }) || {}).void === 'trace-unfinished', 'ITEM 1/2: a record whose tracer had to be killed, or whose stream never reached its end ⇒ VOID (it did not end by itself)');
  // ITEM 3 — the doors the trace cannot see through
  const doors = P.parseTrace(rec(ROOTL, T(100, 'io_uring_setup(256, {flags=0}) = -1 ENOSYS (Function not implemented) (INJECTED)'), T(100, 'process_vm_readv(4242, [{iov_base=0x1, iov_len=8}], 1, [{iov_base=0x2, iov_len=8}], 1, 0) = -1 EPERM (Operation not permitted) (INJECTED)'), ROOTX)).lines;
  const doorsOpen = P.parseTrace(rec(ROOTL, T(100, 'io_uring_setup(256, {flags=0}) = 3<anon_inode:[io_uring]>'), T(100, 'pidfd_getfd(5<anon_inode:[pidfd]>, 2, 0) = 7<socket:[1]>'), ROOTX)).lines;
  ok(P.doorsOpenedOf(doors).length === 0 && JSON.stringify(P.doorsOpenedOf(doorsOpen).map((d) => d.split(' ')[0])) === '["io_uring_setup","pidfd_getfd"]', 'ITEM 3: a door the tracer shut (INJECTED ENOSYS / EPERM) is nothing; one that OPENED anyway (io_uring_setup = 3, pidfd_getfd = 7) ⇒ VOID `door` by name');
  ok(['io_uring_setup', 'io_uring_enter', 'io_uring_register', 'open_by_handle_at', 'name_to_handle_at', 'pidfd_getfd', 'process_vm_readv', 'process_vm_writev', 'ptrace', 'openat2'].every((c) => P.TRACE_SET.split(',').includes(c)) && /'-e', 'inject=io_uring_setup:error=ENOSYS', '-e', `inject=\$\{DENIED_DOORS\.join\(','\)\}:error=EPERM`/.test(launcher4), 'ITEM 3: every named door is TRACED and SHUT by the tracer in every run (io_uring_setup ⇒ ENOSYS: the runtime falls back; handle opens, another process\'s memory / fds, ptrace ⇒ EPERM)');
  // ITEM 4 — another process's /proc, whatever it resolves to; the ARGUMENT judged too
  const PR = (pid, args, res) => T(pid, `openat(${args}, O_RDONLY) = ${res}`);
  for (const [what, line] of [['a pipe', PR(300, 'AT_FDCWD</x>, "/proc/999/fd/3"', '5<pipe:[1234]>')], ['a socket', PR(300, 'AT_FDCWD</x>, "/proc/999/fd/4"', '5<socket:[77]>')], ['an anon inode', PR(300, 'AT_FDCWD</x>, "/proc/999/fd/5"', '5<anon_inode:[eventfd]>')], ['an allowed path (/dev/null)', PR(300, 'AT_FDCWD</x>, "/proc/999/fd/6"', '5</dev/null>')], ['a dirfd + a relative name', PR(300, '7</proc/999>, "environ"', '8</proc/999/environ>')], ['task/<tid>', PR(300, 'AT_FDCWD</x>, "/proc/999/task/1000/environ"', '5</proc/999/task/1000/environ>')]]) {
    const hits = P.guardedReadsOf(P.parseTrace(rec(T(300, 'execve("/x", ["x"], 0x1 /* 1 vars */) = 0'), line, T(300, '+++ exited with 0 +++'))).lines, [], {});
    ok(hits.some((h) => h.startsWith('/proc/999')), `ITEM 4: /proc/<a pid not of the run>/… resolving to ${what} ⇒ VOID (the path ARGUMENT is judged)`, hits);
  }
  const own = P.guardedReadsOf(P.parseTrace(rec(T(300, 'execve("/x", ["x"], 0x1 /* 1 vars */) = 0'), PR(300, 'AT_FDCWD</x>, "/proc/300/fd/3"', '5<pipe:[1]>'), PR(301, 'AT_FDCWD</x>', '"/proc/thread-self/stat"', '5</proc/300/task/301/stat>').replace('"/proc/thread-self/stat", O_RDONLY', '"/proc/thread-self/stat", O_RDONLY'))).lines, [], {});
  ok(own.length === 0, 'ITEM 4: the run\'s OWN /proc pages (its pid, its threads) pass', own);
  const later = P.guardedReadsOf(P.parseTrace(rec(T(300, 'execve("/x", ["x"], 0x1 /* 1 vars */) = 0'), PR(300, 'AT_FDCWD</x>, "/proc/301/environ"', '5</proc/301/environ>'), T(300, 'clone(child_stack=NULL, flags=SIGCHLD) = 301'), T(301, 'getpid() = 301'))).lines, [], {});
  ok(JSON.stringify(later) === '["/proc/301/environ"]', 'ITEM 4: a pid that JOINS the run later (its clone seen AFTER the open) was not the run\'s when it was opened — pid reuse makes it someone else then ⇒ VOID', later);
  // (7) every destination of a sendmmsg; (9) the belt's kill guarded on the live handle
  const MM = 'sendmmsg(5<UDP:[1]>, [{msg_hdr={msg_name={sa_family=AF_INET, sin_port=htons(41000), sin_addr=inet_addr("127.0.0.1")}, msg_namelen=16}}, {msg_hdr={msg_name={sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("8.8.8.8")}, msg_namelen=16}}], 2, 0) = 2';
  ok(JSON.stringify(P.outboundOf(MM, { port: 41000 })) === JSON.stringify({ addr: '8.8.8.8', port: '53', result: '2' }) && P.outboundOf(MM.replace('8.8.8.8', '127.0.0.1').replace('htons(53)', 'htons(41000)'), { port: 41000 }) === null, '(7): EVERY destination of a sendmmsg is judged — the mock\'s port first, 8.8.8.8:53 second ⇒ escape; both the mock ⇒ none');
  ok(/if \(isLive\(child\)\) \{ rec\.killed = true; try \{ process\.kill\(-child\.pid, 'SIGKILL'\); \} catch \{ \} \}/.test(launcher4), '(9): the belt kills the tracer\'s group only while its handle lives (isLive — r5 pin 6; as the stop and the version run do)');
  // (6) the image is its stamp
  ok(/const machineKind = \(\) => \{ try \{ return fs\.existsSync\('\/usr\/share\/vibespace\/image\.json'\) \? 'image' : 'managed'; \}/.test(PS4) && !/dockerenv/.test(PS4) && /> \/usr\/share\/vibespace\/image\.json/.test(read('Dockerfile')) && /\/usr\/share\/vibespace\/image\.json/.test(read('deploy/docker/Dockerfile')), '(6): a VibeSpace image is its STAMP (/usr/share/vibespace/image.json, written by BOTH Dockerfiles) — a person\'s own container is a machine they manage');
}
{ // (5) THE DOOR KEEPS ITS VERSION AND ITS MACHINE THROUGH THE REAL STORE
  const Z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, J = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  for (const m of ['managed', 'image']) {
    const h = await mkHub(path.join(tmp, 'store-door-' + m));
    note(h); await h.am.oatFileSettled();
    h.am.noteCliMeasured({ cli: '2.1.399', sha256: 'sha-399', state: 'cannot-run', startedAt: Date.now() - 60e3, reason: { code: 'strace-old', observation: 'strace 6.1 has no --kill-on-exit', version: '6.1', machine: m } });
    const n = h.am.cliUnmeasuredNotice(), it = n && n.item, why = it && it.i18n.detail.find((r) => r.key === 'Why: {why}.');
    const said = (k, prm) => String(k).replace(/\{(\w+)\}/g, (x, y) => (prm && prm[y] != null ? prm[y] : x));
    const want = m === 'managed' ? /update strace to 6\.6 or newer \(this one is 6\.1\)/ : /the next VibeSpace image brings it; until then a VibeSpace release that records Claude Code 2\.1\.399 places these accounts/;
    ok(!!it && want.test(it.detail) && !!why && Z[why.params.why.key] && J[why.params.why.key] && (m === 'managed' ? /6\.1/.test(said(Z[why.params.why.key], why.params.why.params)) && /6\.1/.test(said(J[why.params.why.key], why.params.why.params)) : /2\.1\.399/.test(said(Z[why.params.why.key], why.params.why.params))), `(5): through the REAL AccountManager (noteCliMeasured → cliUnmeasuredNotice) a ${m} machine\'s item says ${m === 'managed' ? '«(this one is 6.1)»' : 'the image sentence'} — en / zh / ja`, it && it.detail.split('\n')[0]);
  }
}
{ // (10) a measurement child KILLED from outside says so
  const W = await world('killed');
  note(W.h); await until(() => W.forks.length === 1);
  W.forks[0].c.emit('exit', null, 'SIGKILL');
  await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']);
  const r10 = ledgerOf(W.dir).binaries['2.1.399']['sha-399'];
  ok(r10.state === 'cannot-run' && r10.reason.code === 'child-killed' && /was killed before it reached a verdict/.test(C.REASONS['child-killed']), '(10): a measurement child SIGKILLed from outside ⇒ its own reason `child-killed` (never «setup»), its words in the item', r10.reason);
  W.o.stop();
}

// ── ROUND 5 (acceptance r4, the tidy under 主开发's ruling: a WITNESS of an honest build, not a sandbox) — pins 1–8 ──
console.log('§10 ROUND 5: a clean build can pass; the launcher as shipped; a link\'s source; the record\'s size; no call; liveness; words');
{
  const T = (pid, l) => `${pid} 12:00:00.000001 ${l}`;
  const rec = (...ls) => ls.join('\n') + '\n';
  const ROOTL = T(100, 'execve("/usr/bin/node", ["node"], 0x7ffd /* 9 vars */) = 0'), ROOTX = T(100, '+++ exited with 0 +++');
  const reads = (txt, roots, o) => P.guardedReadsOf(P.parseTrace(txt).lines, roots, o || {});
  const PS5 = code(read('src/claude-oat-probe.js'));
  // PIN 1 — the resolved path is read OUTSIDE every quoted payload
  const payload = rec(ROOTL, T(100, 'write(1, "\\") = 5</data/secret>", 17) = 17'), T(100, 'write(1, ") = 3</data/x> <unfinished ...>\\n100 12:00:00.000002 +++ exited with 0 +++", 60) = 60'), ROOTX);
  const realOpen = rec(ROOTL, T(100, 'write(1, "\\") = 5</data/secret>", 17) = 17'), T(100, 'openat(AT_FDCWD</x>, "/data/y", O_RDONLY) = 3</data/y>'), ROOTX);
  ok(reads(payload, ['/data']).length === 0 && P.recordGap(P.parseTrace(payload)) === null && JSON.stringify(reads(realOpen, ['/data'])) === '["/data/y"]', 'PIN 1: a write() whose PAYLOAD spells a result with a resolved path under a guarded root reads CLEAN (a clean build can pass); a real open after it still VOIDS', { payload: reads(payload, ['/data']), real: reads(realOpen, ['/data']) });
  ok(P.unquoted('write(1, "a\\"b = 5</x>", 9) = 9 x</q\\"r>') === 'write(1, "", 9) = 9 x</q\\"r>' && JSON.stringify(reads(rec(ROOTL, T(100, 'openat(AT_FDCWD</h>, "a\\"b", O_RDONLY) = 3</home/u/a\\"b>'), ROOTX), [], { deny: ['/home/u'] })) === '["/home/u/a\\"b"]', 'PIN 1: the reading honours escapes inside quotes AND a `\\"` outside them (strace -y prints a quote in a path so — measured): a path with a quote in it is still judged');
  // PIN 2 — the launcher is the shipped one at EVERY launch (a tripwire): read once, compared byte for byte before each launch
  const vr = PS5.slice(PS5.indexOf('const VERSION_RUN = {'), PS5.indexOf("const vh = launch({ args: ['--version']"));
  const loop = PS5.slice(PS5.indexOf('for (const name of want) {'), PS5.indexOf('const voided = ', PS5.indexOf('for (const name of want) {')));
  const shape2 = (src) => /const SHIPPED_TRAMP = fs\.readFileSync\(path\.join\(__dirname, 'claude-oat-trampoline\.js'\)\);\n\s*fs\.writeFileSync\(TRAMP, SHIPPED_TRAMP, \{ mode: 0o600 \}\);\n\s*const launcherAsShipped = \(\) => \{ try \{ return fs\.readFileSync\(TRAMP\)\.equals\(SHIPPED_TRAMP\); \} catch \{ return false; \} \};/.test(src)
    && /if \(!launcherAsShipped\(\)\) \{ VERSION_RUN\.void = 'launcher-changed'; return ''; \}/.test(src.slice(src.indexOf('const VERSION_RUN = {'), src.indexOf("const vh = launch({ args: ['--version']")))
    && /^for \(const name of want\) \{\n\s*if \(ESCAPED\.length\) break;\n\s*if \(!launcherAsShipped\(\)\) \{ launcherChanged = name;[^\n]*break; \}/.test(src.slice(src.indexOf('for (const name of want) {'), src.indexOf('const voided = ', src.indexOf('for (const name of want) {'))))
    && /const voided = VERSION_RUN\.void \? \{ void: VERSION_RUN\.void \} : launcherChanged \? \{ void: 'launcher-changed' \}/.test(src)
    && (src.match(/(?<!function )\blaunch\(\{/g) || []).length === 3 && (src.match(/(?<!function )\bstartCli\(\{/g) || []).length === 2
    // lane oat-add-door: the third launch is the mint's (runMint) — called ONLY from the variant loop, after its launcher check
    && (src.match(/\brunMint\(\)/g) || []).length === 2 && /if \(name === MINT_VARIANT\) \{\n\s*const r = await runMint\(\);/.test(src.slice(src.indexOf('for (const name of want) {'), src.indexOf('const voided = ', src.indexOf('for (const name of want) {'))));
  ok(shape2(PS5) && vr.length > 0 && loop.length > 0, 'PIN 2: the trampoline\'s shipped bytes are read once and written into the scratch; before the --version run and before EACH variant (one launch each: 3 launch sites — the version run, startCli once per variant, the mint\'s inside the loop — lane oat-add-door) the copy is compared byte for byte — a difference (or a copy gone) VOIDS `launcher-changed` and nothing more starts');
  ok(!shape2(PS5.replace(/\n\s*if \(!launcherAsShipped\(\)\) \{ launcherChanged = name;[^\n]*\n/, '\n')) && !shape2(PS5 + '\nfunction again() { return launch({ args: [] }); }\n'), 'RED CONTROL: the loop\'s check removed, or a third launch site, is caught');
  ok(!!C.REASONS['launcher-changed'] && !!C.REASONS['trace-oversize'] && /^const OWN_REASONS = new Set\(\[[^\n]*'trace-oversize', 'launcher-changed'/m.test(read('src/server/cli-self-measure.js')), 'PIN 2/4: the two voids are the hub\'s own reasons (said by name, never «setup»)');
  // PIN 3 — a link's / a rename's SOURCE is judged like an open
  const D3 = { deny: ['/home/u', '/srv/vs/data'], allow: ['/tmp/scr'] };
  const thenOpen = (l) => rec(ROOTL, T(100, l), T(100, 'openat(AT_FDCWD</tmp/scr>, "/tmp/scr/k", O_RDONLY) = 5</tmp/scr/k>'), ROOTX);
  for (const [what, l, want] of [
    ['link', 'link("/home/u/.ssh/id_ed25519", "/tmp/scr/k") = 0', '/home/u/.ssh/id_ed25519'],
    ['linkat (dirfd-relative)', 'linkat(AT_FDCWD</home/u/.ssh>, "id_ed25519", AT_FDCWD</tmp/scr>, "k", 0) = 0', '/home/u/.ssh/id_ed25519'],
    ['rename', 'rename("/srv/vs/data/other.json", "/tmp/scr/k") = 0', '/srv/vs/data/other.json'],
    ['renameat2 (dirfd-relative)', 'renameat2(3</srv/vs/data>, "other.json", AT_FDCWD</tmp/scr>, "k", RENAME_NOREPLACE) = 0', '/srv/vs/data/other.json'],
    ['symlink (a relative target, read against the link\'s directory)', 'symlink("../../home/u/.netrc", "/tmp/scr/k") = 0', '/home/u/.netrc'],
  ]) { const h = reads(thenOpen(l), [], D3); ok(JSON.stringify(h) === JSON.stringify([want]), `PIN 3: ${what} of a file under a deny root into the scratch, then an open of the new name ⇒ VOID naming the source`, h); }
  const rel = reads(thenOpen('rename("a", "b") = 0'), [], D3), inScr = reads(thenOpen('rename("/tmp/scr/a.tmp", "/tmp/scr/k") = 0'), [], D3), failed = reads(thenOpen('link("/home/u/.ssh/id_ed25519", "/tmp/scr/k") = -1 EPERM (Operation not permitted)'), [], D3);
  ok(rel.length === 1 && /rename of «a» from a directory the record does not name/.test(rel[0]) && inScr.length === 0 && failed.length === 0 && P.guardedReadsOf(CLEAN.lines, P.GUARDED.map((g) => g.path), { deny: ['/home/u'], allow: ['/tmp/vs-hotsw-3606741'] }).length === 0, 'PIN 3: a relative source with no directory in the record cannot be placed ⇒ VOID by its name; a rename inside the scratch and a link that FAILED read clean; the recorded clean 2.1.321 run (its renames absolute, inside its scratch) still reads clean', { rel, inScr, failed });
  // PIN 4 — the record has a size: over it VOID by name, never a truncation
  const big = P.parseTrace(rec(ROOTL, ROOTX));
  ok(P.MAX_RECORD === 64 * 1024 * 1024 && (P.recordGap(big, { oversize: true }) || {}).void === 'trace-oversize' && P.recordGap(big) === null, 'PIN 4: a record past MAX_RECORD (64 MiB a launch; a clean variant writes 263 KB) ⇒ VOID `trace-oversize` — whatever the kept part says');
  const L5 = PS5.slice(PS5.indexOf('  function launch('), PS5.indexOf('  function startCli('));
  ok(/if \(!rec\.oversize && rec\.text\.length \+ chunk\.length > MAX_RECORD\) rec\.oversize = true;\n\s*if \(!rec\.oversize\) rec\.text \+= chunk;/.test(L5) && /oversize: h\.rec\.oversize/.test(PS5) && /if \(carry\.length > MAX_TRACE_LINE\) carry = '';/.test(L5), 'PIN 4: the launcher keeps the record whole up to the cap, keeps NOTHING past it (no cut record is judged), passes `oversize` to the judge, and bounds the belt\'s carry');
  // PIN 5 — a record with no call is not a measurement
  ok((P.recordGap(P.parseTrace(rec(ROOTX))) || {}).void === 'trace-unfinished' && /holds no call/.test(P.recordGap(P.parseTrace(rec(ROOTX))).why) && (P.recordGap(P.parseTrace('')) || {}).void === 'trace-unfinished' && P.recordGap(P.parseTrace(rec(ROOTL, ROOTX))) === null, 'PIN 5: a record holding only its first process\'s death line ⇒ VOID `trace-unfinished` (no call: not a measurement); an empty record too; one call + the death reads clean');
  // PIN 6 — the kill guard is LIVENESS: a stand-in that died BY A SIGNAL, and a real child that killed ITSELF (this suite signals nothing)
  const stand = { exitCode: null, signalCode: 'SIGKILL', pid: 999999 };
  const { spawn } = await import('node:child_process');
  const self = spawn(process.execPath, ['-e', "process.kill(process.pid, 'SIGKILL')"], { env: { PATH: process.env.PATH }, stdio: 'ignore' });
  await new Promise((r) => self.on('exit', r));
  const oldGuard = (c) => c.exitCode == null;
  ok(!P.isLive(stand) && oldGuard(stand) && self.exitCode === null && self.signalCode === 'SIGKILL' && !P.isLive(self) && P.isLive({ exitCode: null, signalCode: null }) && !P.isLive({ exitCode: 0, signalCode: null }), 'PIN 6: a child that died BY A SIGNAL keeps exitCode null for ever (a real one, measured here: it killed itself) — `isLive` says gone where the old guard said alive', { exitCode: self.exitCode, signalCode: self.signalCode });
  const kills = [...PS5.matchAll(/([^\n]{0,80})process\.kill\(-(?:c|child|vc)\.pid, 'SIGKILL'\)/g)].map((m) => m[1]);
  ok(kills.length === 6 && kills.every((pre) => /if \(isLive\((?:c|child|vc)\)\) \{ (?:(?:h|vh)?\.?rec\.killed = true; )?try \{ $/.test(pre.replace(/^.*?(if \(isLive)/, '$1'))) && !/exitCode == null\)/.test(PS5.replace(/const isLive = [^\n]*/, '')), 'PIN 6: all six kills (belt, stop, the version run ×2, killAll, the mint\'s end — lane oat-add-door) are guarded by isLive — no bare `exitCode == null` guard is left', kills);
  // 7a — a version the tracer did not say is never «?»
  const straceMute5 = stub('strace-mute5', 'case "$1" in -V) echo "no idea"; exit 0;; esac\nexit 0');
  const r7 = P.preflight({ root: ROOT, strace: straceMute5, guarded: [] });
  const it7 = (ver) => C.cliUnmeasuredItem({ cli: '2.1.399', names: ['A'], local: { state: 'cannot-run', reason: 'strace-old', reasonVersion: ver, reasonMachine: 'managed' } });
  const Z5 = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, J5 = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  const unread = C.REASONS['strace-old-unread'];
  ok(r7 && r7.refusal === 'strace-old' && r7.version === undefined && [undefined, '?', '6.1\nWhy: forged'].every((v) => /did not say its version/.test(it7(v).detail) && !/this one is \?/.test(it7(v).detail)) && /this one is 6\.1/.test(it7('6.1').detail) && Z5[unread] && J5[unread], '7a: a tracer that did not say its version keeps none, and the words say so — never «(this one is ?)»; a hand-edited value that is no version reads the same (en / zh / ja)', { r7: r7 && r7.version, d: it7(undefined).detail });
  // 8 — a pid leaves the run's set at its death line; a clone of the run names it again
  const gone = reads(rec(T(300, 'execve("/x", ["x"], 0x1 /* 1 vars */) = 0'), T(300, 'clone(child_stack=NULL, flags=SIGCHLD) = 301'), T(301, 'getpid() = 301'), T(301, '+++ exited with 0 +++'), T(300, 'openat(AT_FDCWD</x>, "/proc/301/environ", O_RDONLY) = 5</proc/301/environ>'), T(300, '+++ exited with 0 +++')), []);
  const again = reads(rec(T(300, 'execve("/x", ["x"], 0x1 /* 1 vars */) = 0'), T(300, 'clone(child_stack=NULL, flags=SIGCHLD) = 301'), T(301, '+++ exited with 0 +++'), T(300, 'clone(child_stack=NULL, flags=SIGCHLD) = 301'), T(300, 'openat(AT_FDCWD</x>, "/proc/301/environ", O_RDONLY) = 5</proc/301/environ>'), T(300, '+++ exited with 0 +++')), []);
  ok(JSON.stringify(gone) === '["/proc/301/environ"]' && again.length === 0, '8: a pid LEAVES the run at its death line (the number reused after it is someone else\'s ⇒ VOID); a clone of the run that names it again makes it the run\'s', { gone, again });
  ok(/its EXISTENCE only/.test(read('scripts/mount-reader-census.mjs')) && !/image\.json and \/\.dockerenv/.test(read('scripts/mount-reader-census.mjs')), '8: the census row says the image rule as it is (the stamp\'s existence; /.dockerenv gone)');
}

// ── §12 THE INCIDENT OF 2026-11-11 (the owner's hub: a data directory under the home, in a git checkout with package.json / CLAUDE.md / .claude/):
// every run voided `guarded-read` in half a second — node, starting the trampoline in the scratch, walked up to the checkout's
// package.json, inside the deny root. THE CELL NOBODY DROVE, as a FAST pin: the hub road's PLACEMENT (the real ORCH) and the
// fence's verdict (the real judge) over the exact walks a run makes from where it is placed — node's package.json walk from the
// trampoline and 2.1.321's walk up from its cwd (CLAUDE.md, CLAUDE.local.md, AGENTS.md, .claude/, .mcp.json, .git at every
// ancestor, its clean trace). The real tracer drives the same cell in test-oat-measure-fake (this tier cannot run one: the hosted
// runner's strace is refused) ──
console.log('§12 the incident: a hub whose data dir is under a home that is a git checkout');
{
  const H = fs.mkdtempSync(path.join(tmp, 'home-cell-')), CO = path.join(H, 'checkout'), D = path.join(CO, 'data');
  for (const d of [D, path.join(CO, '.claude'), path.join(CO, '.git')]) fs.mkdirSync(d, { recursive: true });
  for (const [f, t] of [['package.json', '{"name":"stand-in"}'], ['CLAUDE.md', '# stand-in'], ['.claude/settings.json', '{}'], ['.git/HEAD', 'ref: refs/heads/master']]) fs.writeFileSync(path.join(CO, f), t);
  const BASE = fs.mkdtempSync(path.join(tmp, 'base-'));                   // a runtime dir / system temp OUTSIDE the home
  const HOMERUN = path.join(H, 'run'); fs.mkdirSync(HOMERUN);              // a runtime dir that sits UNDER the home (a home-mounted one)
  const T = (pid, l) => `${pid} 12:00:00.000001 ${l}`;
  // the walks a run makes from ROOT (the probe's `root`): node's package.json walk from the trampoline, then the CLI's from its cwd
  const walkOf = (root) => {
    const lines = [T(100, 'execve("/usr/bin/node", ["node"], 0x7ffd /* 9 vars */) = 0')];
    const open = (p) => lines.push(T(100, `openat(AT_FDCWD</x>, "${p}", O_RDONLY|O_CLOEXEC) = ${fs.existsSync(p) ? `3<${p}>` : '-1 ENOENT (No such file or directory)'}`));
    for (let d = root; ; d = path.dirname(d)) { open(path.join(d, 'package.json')); if (d === path.dirname(d)) break; }
    for (let d = path.join(root, 'oat-file', 'cwd'); ; d = path.dirname(d)) { for (const f of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', '.claude', '.claude/CLAUDE.md', '.claude/AGENTS.md', '.git', '.git/HEAD']) open(path.join(d, f)); if (d === path.dirname(d)) break; }
    lines.push(T(100, '+++ exited with 0 +++'));
    return P.guardedReadsOf(P.parseTrace(lines.join('\n') + '\n').lines, P.GUARDED.map((g) => g.path), { deny: [P.REAL_HOME, H, D], allow: [root] });
  };
  const Wc = await world('cell', { dataDir: D, home: H, scratchBases: () => [BASE] });
  note(Wc.h); await until(() => Wc.forks.length === 1);
  const job = (Wc.forks[0] && Wc.forks[0].c.sent[0]) || {};
  const runDir = String(job.runDir || ''), inH = (p) => (p + '/').startsWith(H + '/');
  const hits = runDir ? walkOf(job.root) : ['(no run)'];
  const old = walkOf(path.join(D, 'cli-self-measure', 'run-old', 'm'));     // where 5c77612ef put it
  ok(!!runDir && !inH(runDir) && (runDir + '/').startsWith(BASE + '/') && path.basename(runDir).startsWith('cli-self-measure-') && (fs.statSync(runDir).mode & 0o777) === 0o700 && job.home === H && hits.length === 0, '§12 THE CELL: a hub whose data dir is under a home that is a git checkout runs its check in a fresh 0700 folder OUTSIDE the home and the data dir — and the walks a run makes from there (node\'s package.json, the CLI\'s CLAUDE.md / AGENTS.md / .claude / .mcp.json / .git to /) read nothing a deny root holds', { runDir, hits });
  ok(old.some((p) => p.endsWith('/checkout/package.json')) && old.some((p) => p.endsWith('/checkout/CLAUDE.md')) && old.some((p) => p.endsWith('/checkout/.git/HEAD')), '§12 RED CONTROL (the incident): the same walks from where 5c77612ef put the run (data/cli-self-measure/run-…) read the checkout\'s package.json, CLAUDE.md and .git — the fence voids every run', old);
  Wc.o.stop();
  // a runtime dir UNDER the home (a home-mounted XDG_RUNTIME_DIR): skipped — the next base; none left ⇒ cannot-run `scratch`, by name
  const Wf = await world('fallback', { dataDir: D, home: H, scratchBases: () => [HOMERUN, BASE] });
  note(Wf.h); await until(() => Wf.forks.length === 1);
  const fdir = String(((Wf.forks[0] && Wf.forks[0].c.sent[0]) || {}).runDir || '');
  Wf.o.stop();
  const Wn = await world('no-base', { dataDir: D, home: H, scratchBases: () => [HOMERUN] });
  note(Wn.h); await until(() => !!ledgerOf(D)?.binaries?.['2.1.399']?.['sha-399']);
  const rn = (ledgerOf(D)?.binaries?.['2.1.399'] || {})['sha-399'] || {};
  const itn = Wn.h.am.cliUnmeasuredNotice()?.item;
  ok((fdir + '/').startsWith(BASE + '/') && Wn.forks.length === 0 && rn.state === 'cannot-run' && rn.reason && rn.reason.code === 'scratch' && !!itn && /no private folder outside your home and VibeSpace’s data folder/.test(itn.detail), '§12 a runtime dir that sits under the home is SKIPPED (the next base is taken); with no base left the check refuses BY NAME (`scratch`) and For you says why — nothing forked', { fdir, rn, detail: itn && itn.detail });
  Wn.o.stop();
  try { fs.rmSync(path.join(D, 'cli-self-measure.json'), { force: true }); } catch { }
  // THE RECORD KEEPS WHAT WAS READ: the version run's guarded path is in the ledger (~ for the home), the journal line, For you
  const Wr = await world('reads');
  note(Wr.h); await until(() => Wr.forks.length === 1);
  const readPath = path.join(P.REAL_HOME, 'workspace', 'stand-in', 'package.json');
  Wr.forks[0].c.emit('message', { type: 'record', record: { cli: '2.1.399', void: 'guarded-read', versionRun: { void: 'guarded-read', guardedReads: [readPath] }, results: [], ms: 473 } });
  await until(() => !!ledgerOf(Wr.dir)?.binaries?.['2.1.399']);
  const rr = ledgerOf(Wr.dir).binaries['2.1.399']['sha-399'];
  const itr = Wr.h.am.cliUnmeasuredNotice()?.item;
  ok(rr.state === 'cannot-run' && rr.reason.code === 'guarded-read' && rr.reason.observation === '~/workspace/stand-in/package.json' && Wr.lines.some((l) => /cannot-run \(guarded-read: ~\/workspace\/stand-in\/package\.json\)/.test(l)) && !!itr && /What it read: ~\/workspace\/stand-in\/package\.json\./.test(itr.detail), '§12 the record keeps WHAT was read (≤ 8 paths, the home as ~): the ledger\'s observation, the journal line and the For-you item name it', { obs: rr.reason, line: Wr.lines.find((l) => /cannot-run/.test(l)), detail: itr && itr.detail });
  Wr.o.stop();
  // A PROBE THAT CHANGED MEASURES AGAIN AT ONCE: a cannot-run measured by probe 1 (this hub life, minutes ago) is due under probe 2
  const dP = path.join(tmp, 'orch-probe-bump'); fs.mkdirSync(dP, { recursive: true });
  fs.writeFileSync(path.join(dP, 'cli-self-measure.json'), JSON.stringify({ schema: 1, binaries: { '2.1.399': { 'sha-399': { cli: '2.1.399', sha256: 'sha-399', probe: 1, state: 'cannot-run', reason: { code: 'guarded-read', observation: '' }, startedAt: Date.now() - 60e3, endedAt: Date.now() + 5e3 } } } }));
  const Wp = await world('probe-bump');
  note(Wp.h); await until(() => Wp.forks.length === 1);
  ok(P.PROBE_VERSION === 2 && Wp.forks.length === 1, '§12 a cannot-run measured by probe 1 — the hub\'s own setup, minutes ago in this life — runs again AT ONCE under probe 2 (no 6-hour wait, no restart)', { probe: P.PROBE_VERSION, forks: Wp.forks.length });
  Wp.o.stop();
  ok(/\/\[\\\\\/\]cli-self-measure\(\?:-\[0-9a-f\]\{8\}-run-\|\[\\\\\/\]run-\)\[\^\\\\\/\]\+\$\/\.test\(job\.runDir\)/.test(read('src/claude-oat-probe.js')), '§12 the child removes its run folder by the new name (or .393\'s in data/) — never another path');
}

{ // §12b THE RUN'S FOLDER IS ALWAYS ONE IT MADE (主开发's mutant — mkdirSync(root, { recursive: true }) — passed all 194): a
  // DIRECTORY and then a SYMLINK planted at the exact name the next run takes (the randomness stubbed) ⇒ that run refuses:
  // cannot-run (setup, EEXIST), nothing forked, nothing written through the link
  const crypto = require('crypto');
  const realRB = crypto.randomBytes;
  for (const [what, plant] of [['a directory', (p) => fs.mkdirSync(p)], ['a symlink to another folder', (p) => fs.symlinkSync(fs.mkdtempSync(path.join(tmp, 'elsewhere-')), p)]]) {
    const tag = 'planted-' + what.split(' ')[1];
    const hubtag = crypto.createHash('sha256').update(path.resolve(path.join(tmp, 'orch-' + tag))).digest('hex').slice(0, 8);
    const hex = 'a1b2c3d4';
    const at = path.join(SCRATCH_BASE, `cli-self-measure-${hubtag}-run-${process.pid}-${hex}`);
    plant(at);
    crypto.randomBytes = (n, ...a) => (n === 4 && !a.length ? Buffer.from(hex, 'hex') : realRB(n, ...a));
    try {
      const W = await world(tag);
      note(W.h); await until(() => !!ledgerOf(W.dir)?.binaries?.['2.1.399']?.['sha-399']);
      const r = (ledgerOf(W.dir)?.binaries?.['2.1.399'] || {})['sha-399'] || {};
      const through = fs.lstatSync(at).isSymbolicLink() ? fs.readdirSync(fs.realpathSync(at)).length : fs.readdirSync(at).length;
      ok(W.forks.length === 0 && r.state === 'cannot-run' && r.reason && r.reason.code === 'setup' && /EEXIST/.test(r.reason.observation) && through === 0, `§12b ${what} already at the run's exact folder name ⇒ the run refuses it (cannot-run, EEXIST) — nothing forked, nothing created inside it`, { forks: W.forks.length, r, through });
      W.o.stop();
    } finally { crypto.randomBytes = realRB; }
  }
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
