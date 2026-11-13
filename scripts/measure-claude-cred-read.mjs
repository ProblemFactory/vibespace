#!/usr/bin/env node
// THE HOT-SWITCH MEASUREMENT (lane-hot-switch, 2026-09-30): HOW does a RUNNING
// `claude` process notice that its credential changed — and does it ever
// follow a pool link that was re-pointed under it?
//
// Why this exists: `capsOf('claude').hotSwitch` said 'verified' since 2.368.21
// on facts nobody had measured on a live process (a file-system mechanics test,
// scripts/test-creds-symlink-swap.mjs, and a reading of decompiled code), and
// on 2026-09-30 the OTel stash read as if one conversation had billed its
// BIRTH member through ~25 link moves. This script asks the CLI itself, on
// this machine, with FAKE credentials:
//
//   · a scratch HOME + two FAKE credential dirs (A, B) + a per-session link
//     exactly like data/pool-links/<pool>/<sess> (the env var ws-create sets:
//     CLAUDE_SECURESTORAGE_CONFIG_DIR = the LINK path);
//   · every network call goes to a loopback MOCK (ANTHROPIC_BASE_URL for the
//     API, USE_LOCAL_OAUTH + CLAUDE_LOCAL_OAUTH_API_BASE for the OAuth token /
//     profile endpoints, OTEL_EXPORTER_OTLP_ENDPOINT for the telemetry) and the
//     whole run lives in a NETWORK NAMESPACE with only `lo` (sudo unshare -n):
//     no vendor host is reachable, a fake token never leaves the machine;
//   · the mock records the Authorization header of EVERY request — the ground
//     truth of which credential the process spends — the OTel org, and the
//     OAuth refresh calls; strace records every file syscall on the creds.
//
// THE ANSWER on 2.1.281 (2026-09-30, scripts/fixtures/claude-cred-read-2.1.281.json):
// every turn the CLI statx()es the creds file THROUGH the link and re-reads it
// when its mtime differs — a re-point is followed on the next turn; a
// replacement with an EQUAL mtime is not (the utimes bump is load-bearing);
// the OTel organization.id is ~/.claude.json's machine-wide label for BOTH
// tokens — the 3.5-day "birth member" reading was that label, not the bill.
//
// Variants (one fresh process each; msg1 → change → wait → msg2):
//   symlink          the pool's own move: repointPoolSymlink(link → B) + utimes(B)
//   symlink-bare     the same without the utimes bump
//   overwrite        B's bytes written INTO the file the link resolves to (in place)
//   hardlink-mtime   the path replaced by a hard link to B's file, mtime bumped
//   hardlink-same    the same, B's mtime set equal to A's old mtime first
//   utimes           A's file touched, content unchanged
//   refresh          A's AND B's tokens expire soon; the link moves to B; the next
//                    turn must refresh — which refresh token is spent, which file is written
//   slowstream       msg2's one text block streams for 25 s — does an assistant
//                    record's `timestamp` name the block's start or its emission?
//   gate429          msg1 answered 429 (five_hour rejected, resets +1 h); msg2
//                    unchanged; then the link moves to B; msg3 — how many API
//                    calls does the CLI make while its local gate holds?
//
// THE OAT VARIANTS (lane pool-oat-measure, design q-035 §2 A): may a pool member's
// LONG-LIVED token sit in its credential FILE — `claudeAiOauth.accessToken = <oat>`,
// `expiresAt` = mint + OAT_TTL, the standard scopes, NO refreshToken — and be spent
// like a login? Member O holds that file; member A is an ordinary login. Each
// variant prints a PASS / FAIL line; the evidence is every request head the mock
// saw, the creds files' bytes before/after (sha, inode, mtime, shape — token
// values as labels) and every strace call on them (writes listed one by one):
//   oat-file         link → O: every request's bearer is the oat; no refresh; no write
//   oat-env          the same token as CLAUDE_CODE_OAUTH_TOKEN (the hub's oat-only spawn
//                    today): the request heads byte-diffed against oat-file's
//   oat-file-401     msg2 answered 401: does the CLI rewrite / blank / delete the file? (msg3 after it clears)
//   oat-file-near    expiresAt = +30 s (inside the CLI's refresh window): msg1 inside it, msg2 past it
//   oat-file-switch  link A → O (+utimes) → A (+utimes): each next turn's bearer; neither file written
//   oat-file-scopes  the file without scopes / subscriptionType / rateLimitTier: accepted or refused?
// src/cli-caps.js names the six (OAT_VARIANTS) and reads the fixture
// (oatInFile(version, fixture): green on oat-file, oat-file-401, oat-file-switch).
//
//   node scripts/measure-claude-cred-read.mjs [--variant all|oat|<name>[,<name>]] [--gap 65000] [--out file.json]
//        [--write-fixture [--fixture path]]   the six oat variants ⇒ THIS CLI's record ADDED to
//                                             scripts/fixtures/oat-in-file.json (cli-caps withMeasured:
//                                             every other version's record kept — lane oat-in-file-2-1-306)
//        [--variant mint --write-mint-fixture]   lane oat-add-door: the mint's own scopes (`setup-token` in a pty, its printed
//                                             authorize URL's scope= — nothing pasted, nothing minted) ⇒ THIS CLI's record ADDED
//                                             to scripts/fixtures/oat-mint-scopes.json (withMeasured, every other version kept)
//        [--no-netns --claude <fake script>]   no namespace: a FAKE claude only (below)
//        [--no-netns --loopback-real --claude <the real claude>]   no namespace, the REAL binary (the loopback-real rung, below)
//        [--gap ms] [--flush-ms ms] [--near-ms ms] [--scope-wait-ms ms]   (the fake's fast self-test shortens the waits)
//
// Needs `sudo -n` (for the network namespace) and `strace`. Without them it
// REFUSES — it never runs a claude process that could reach the network.
// A strace WATCHDOG rides both rungs: the first non-loopback connect() SIGKILLs the
// CLI's process group and the run ABORTS (exit 3) — a belt, not the isolation.
// --no-netns (the lanes' self-test, scripts/test-cli-caps.mjs): no sudo, no namespace,
// so it runs a FAKE claude ONLY — a #! script such as scripts/fixtures/oat-measure/fake-claude.mjs;
// an ELF / anything under …/claude/versions/ is refused before it runs (a hard-coded
// vendor connect from the real binary would be a real SYN). The oat variants set
// HTTPS_PROXY/HTTP_PROXY = the mock in both rungs (it records each CONNECT and answers
// 403), so the namespace changes nothing the CLI sees on the loopback mock.
// THE LOOPBACK-REAL RUNG (lane pool-silent-members, 2.1.312 on 2026-10-28; tracked since acceptance r2 so the record
// it wrote is reproducible from the tree): `--no-netns --loopback-real --claude <the real claude>` — where no sudo is
// to be had, the REAL binary runs WITHOUT the namespace and stays on loopback by three fences, each recorded: every
// API / OAuth / OTel base points at the loopback mock; HTTPS_PROXY / HTTP_PROXY = the mock ITSELF, which records each
// CONNECT and refuses it (403 — no TLS session ever opens, so nothing reaches a vendor host); and the strace watchdog
// (the sampler) SIGKILLs the process group and ABORTS the run (exit 3) at the first off-loopback connect().
// CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 keeps the CLI's optional traffic off. The record says so: `netns: false`,
// `rung: 'loopback-real'`, `proxy: 'loopback-mock'` (every record this script writes — the --out record and the fixture
// record alike, acceptance r3 — names its proxy: the mock).
//
// THE MOCK OUTLIVES ITS CLIENTS (lane pool-oat-measure-fix, 2026-10-14): 主开发's first real-CLI
// rung (2.1.296) died at oat-file on `read ECONNRESET`, an unhandled 'error' on a Socket. The oat
// variants route every proxied call here as a CONNECT; Node hands a CONNECT socket to the 'connect'
// handler WITHOUT its own 'error' listener (the only server socket left bare), and the CLI reset
// one the mock still read. Every error path of the inner process now lands in EVENTS, the
// variant's `events` evidence and a clause on its verdict line, never a crash: the server
// (clientError, error), each socket (CONNECT ones included), each request / response / SSE
// stream, a throwing route, the CLI's spawn + stdin/stdout/stderr pipes, and the process itself
// (uncaughtException / unhandledRejection). A TLS ClientHello on the plain port is named
// `tls-hello-on-plain-port`; no request bytes are kept (a malformed head may carry a bearer). A
// throw in the measurement's own flow still exits 1. scripts/test-oat-measure-fake.mjs gates it
// with the fake's misbehaviour modes and a RED control (the handlers stubbed ⇒ the run dies).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const NETNS = !flag('no-netns');
const LOOPBACK_REAL = flag('loopback-real') && !NETNS; // the real binary without the namespace (header)
const { OAT_VARIANTS, MINT_VARIANT, oatInFile, mintScopesOf, cliVersionOf, measuredVersions, withMeasured } = createRequire(import.meta.url)(path.join(path.dirname(SELF), '..', 'src', 'cli-caps.js'));
// THE MEASUREMENT IS ONE MODULE (lane cli-self-measure, 2026-11-09): the mock, the variants, the belt and the verdicts live in
// src/claude-oat-probe.js, which the hub also runs (src/server/cli-self-measure.js) when it first sees a CLI build with no PASS;
// this script keeps the argv, the sudo netns re-exec and the fixture writer (test-cli-self-measure §1 fails a copy of either; test-oat-measure-fake runs both roads over one fake)
const PROBE = createRequire(import.meta.url)(path.join(path.dirname(SELF), '..', 'src', 'claude-oat-probe.js'));
const { nameserversOf, isLoopbackAddr } = PROBE;
// the claude the namespace rung measures: --claude, else the one on PATH
const findClaude = () => {
  let c = opt('claude', '');
  if (!c) { try { c = execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim(); } catch { } }
  try { return c ? fs.realpathSync(c) : ''; } catch { return ''; }
};

// ── outer: re-exec inside a loopback-only network namespace ─────────────────
if (NETNS && !flag('inner')) {
  const user = os.userInfo().username;
  const claude = findClaude();
  if (!claude) { console.error('REFUSED: no `claude` on PATH'); process.exit(2); }
  try { execFileSync('sudo', ['-n', 'true']); } catch { console.error('REFUSED: needs `sudo -n` for the loopback-only network namespace'); process.exit(2); }
  try { execFileSync('sh', ['-c', 'command -v strace']); } catch { console.error('REFUSED: needs strace'); process.exit(2); }
  const pass = argv.filter((a) => a !== '--inner');
  const inner = ['env', `HOME=${process.env.HOME || os.homedir()}`, `PATH=${path.dirname(process.execPath)}:/usr/bin:/bin`, `USER=${user}`, process.execPath, SELF, '--inner', '--claude', claude, ...pass];
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  // ci-344-reds: the host's resolver, ON lo inside this same namespace. claude (2.1.308 and 2.1.309, measured) resolves
  // api.anthropic.com at start even with ANTHROPIC_BASE_URL on the mock; where /etc/resolv.conf names a non-loopback
  // server (the 2.369.344 runner: 168.63.129.16) that lookup was a connect() off loopback — refused by the namespace
  // (ENETUNREACH), killed by the belt, and the run measured nothing. Its address on lo keeps the lookup on loopback
  // (nothing listens: refused at once, as on a systemd-resolved box); the namespace stays lo-only (no route out, the
  // inner rung re-checks), and the belt still ABORTS on any other off-loopback connect.
  const resolvers = nameserversOf().filter((a) => !isLoopbackAddr(a) && /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]*:[0-9a-f:]*)$/i.test(a));
  const pin = resolvers.map((a) => ` && { ip addr add ${q(a + (a.includes(':') ? '/128' : '/32'))} dev lo || echo ${q(`NOTE: resolver ${a} not pinned on lo — its lookup ABORTS the run`)} >&2; }`).join('');
  const r = spawn('sudo', ['-n', 'unshare', '-n', '--', 'sh', '-c', `ip link set lo up${pin} && exec sudo -n -u ${q(user)} -- ${inner.map(q).join(' ')}`], { stdio: 'inherit' });
  r.on('error', (e) => { console.error(`REFUSED: sudo did not start (${e.code || e.message})`); process.exit(2); });
  r.on('exit', (c) => process.exit(c ?? 1));
} else {
  // the process-level handlers below would swallow a rejected main(): the measurement's own bug exits 1
  await main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
}

async function main() {
  const RUNG = NETNS ? 'netns' : LOOPBACK_REAL ? 'loopback-real' : 'fake';
  const OUT = opt('out', '');
  const all = ['slowstream', 'baseline', 'symlink', 'symlink-bare', 'overwrite', 'hardlink-mtime', 'hardlink-same', 'utimes', 'refresh', 'gate429'];
  const v = opt('variant', 'all');
  const want = v === 'all' ? all : v === 'oat' ? [...OAT_VARIANTS] : v.split(',').flatMap((x) => (x === 'oat' ? OAT_VARIANTS : x === 'mint' ? [MINT_VARIANT] : [x]));
  if (flag('write-mint-fixture') && !want.includes(MINT_VARIANT)) { console.error(`REFUSED: --write-mint-fixture needs the mint variant in the run (--variant mint)`); process.exit(2); }
  const MINT_FIXTURE = opt('mint-fixture', path.join(path.dirname(SELF), 'fixtures', 'oat-mint-scopes.json'));
  const mintFixtureNow = () => { try { return JSON.parse(fs.readFileSync(MINT_FIXTURE, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${MINT_FIXTURE} does not read (${e.message})`); } };
  if (flag('write-mint-fixture')) { try { withMeasured(mintFixtureNow(), { cliVersion: '0.0.0' }); } catch (e) { console.error(`REFUSED: --write-mint-fixture adds this CLI's record and keeps every other version's — ${e.message}`); process.exit(2); } }
  if (flag('write-fixture') && OAT_VARIANTS.some((x) => !want.includes(x))) { console.error(`REFUSED: --write-fixture needs all six oat variants in one run (--variant oat): ${OAT_VARIANTS.join(', ')}`); process.exit(2); }
  // the fixture holds ONE record per measured version: this run's is ADDED, every other kept — refused before
  // the run when it could not be (a file that is neither shape); the version is checked again at write time
  const FIXTURE = opt('fixture', path.join(path.dirname(SELF), 'fixtures', 'oat-in-file.json'));
  const fixtureNow = () => { try { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${FIXTURE} does not read (${e.message})`); } };
  if (flag('write-fixture')) { try { withMeasured(fixtureNow(), { cliVersion: '0.0.0', variants: {} }); } catch (e) { console.error(`REFUSED: --write-fixture adds this CLI's record to the fixture and keeps every other version's — ${e.message}`); process.exit(2); } }
  let record = null;
  try {
    record = await PROBE.measure({ claude: opt('claude', ''), rung: RUNG, variants: want, gapMs: Number(opt('gap', '65000')), flushMs: Number(opt('flush-ms', '2500')), nearMs: Number(opt('near-ms', '30000')), ...(Number(opt('scope-wait-ms', '0')) > 0 ? { scopeWaitMs: Number(opt('scope-wait-ms', '0')) } : {}), keep: flag('keep'), dump: opt('dump', '') || null });
  } catch (e) {
    if (e && e.refusal) { console.error(`REFUSED: ${e.detail || e.refusal}`); process.exit(2); }
    throw e;
  }
  const results = record.results;
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  else console.log(JSON.stringify(record, null, 2));
  if (record.aborted) { console.error(`ABORTED: the CLI connect()ed off loopback${NETNS ? ' inside the namespace (the namespace refused it — check it anyway)' : ''} — ${record.aborted.map((e) => `${e.variant}: ${e.connect} = ${e.result}`).join('; ')}`); process.exit(3); }
  if (flag('write-fixture')) {
    if (record.void) { console.error(`REFUSED: the run is void here (${record.void}) — no fixture record from it`); process.exit(2); }
    const fx = { cliVersion: cliVersionOf(record.version), measuredAt: new Date().toISOString().slice(0, 10), script: 'scripts/measure-claude-cred-read.mjs', netns: NETNS, ...(LOOPBACK_REAL ? { rung: 'loopback-real' } : {}), proxy: 'loopback-mock', variants: {} };
    for (const name of OAT_VARIANTS) { const r = results.find((x) => x.variant === name); fx.variants[name] = { verdict: r.verdict, note: r.note }; }
    try { withMeasured(fixtureNow(), fx); } catch (e) { console.error(`REFUSED: --write-fixture adds this CLI's record to the fixture and keeps every other version's — ${e.message}`); process.exit(2); }
    const next = withMeasured(fixtureNow(), fx); // re-read: every other version's record as the file holds it now
    fs.writeFileSync(FIXTURE, JSON.stringify(next, null, 1) + '\n');
    process.stderr.write(`[oat] fixture ${FIXTURE}: oatInFile(${fx.cliVersion}) = ${oatInFile(fx.cliVersion, next)} · it holds ${measuredVersions(next).join(', ')}\n`);
  }
  if (flag('write-mint-fixture')) {
    if (record.void) { console.error(`REFUSED: the run is void here (${record.void}) — no mint record from it`); process.exit(2); }
    const r = results.find((x) => x.variant === MINT_VARIANT);
    if (!r) { console.error('REFUSED: the mint variant did not run'); process.exit(2); }
    const mx = { cliVersion: cliVersionOf(record.version), measuredAt: new Date().toISOString().slice(0, 10), script: 'scripts/measure-claude-cred-read.mjs', netns: NETNS, ...(LOOPBACK_REAL ? { rung: 'loopback-real' } : {}), proxy: 'loopback-mock', verdict: r.verdict, ...(r.verdict === 'PASS' ? { scopes: r.scopes } : {}), note: r.note };
    try { withMeasured(mintFixtureNow(), mx); } catch (e) { console.error(`REFUSED: --write-mint-fixture adds this CLI's record and keeps every other version's — ${e.message}`); process.exit(2); }
    const next = withMeasured(mintFixtureNow(), mx);
    fs.writeFileSync(MINT_FIXTURE, JSON.stringify(next, null, 1) + '\n');
    process.stderr.write(`[mint] fixture ${MINT_FIXTURE}: mintScopesOf(${mx.cliVersion}) = ${JSON.stringify(mintScopesOf(mx.cliVersion, next))} · it holds ${measuredVersions(next).join(', ')}\n`);
  }
  process.exit(0);
}
