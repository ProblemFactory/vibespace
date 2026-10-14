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
//        [--write-fixture [--fixture path]]   the six oat variants ⇒ scripts/fixtures/oat-in-file.json
//        [--no-netns --claude <fake script>]   no namespace: a FAKE claude only (below)
//        [--gap ms] [--flush-ms ms] [--near-ms ms]   (the fake's fast self-test shortens the waits)
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
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const NETNS = !flag('no-netns');
const { OAT_VARIANTS, oatInFile, cliVersionOf } = createRequire(import.meta.url)(path.join(path.dirname(SELF), '..', 'src', 'cli-caps.js'));
// FAKE tokens, built at runtime: no token-shaped literal sits in the tree
const OAT_PFX = ['sk', 'ant', 'oat01'].join('-');
const ORT_PFX = ['sk', 'ant', 'ort01'].join('-');
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
  const r = spawn('sudo', ['-n', 'unshare', '-n', '--', 'sh', '-c', `ip link set lo up && exec sudo -n -u ${q(user)} -- ${inner.map(q).join(' ')}`], { stdio: 'inherit' });
  r.on('error', (e) => { console.error(`REFUSED: sudo did not start (${e.code || e.message})`); process.exit(2); });
  r.on('exit', (c) => process.exit(c ?? 1));
} else {
  // the process-level handlers below would swallow a rejected main(): the measurement's own bug exits 1
  await main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
}

// --no-netns runs a FAKE claude only (a script, e.g. scripts/fixtures/oat-measure/fake-claude.mjs
// behind a #! wrapper): without the namespace a hard-coded vendor connect would be a real SYN,
// so the real binary (an ELF under …/claude/versions/) is refused before it is ever executed.
function fakeClaude() {
  const c = opt('claude', '');
  if (!c) { console.error('REFUSED: --no-netns needs --claude <a FAKE claude script>; the real CLI runs only in the namespace rung'); process.exit(2); }
  let real = '', head = '';
  try { real = fs.realpathSync(c); const fd = fs.openSync(real, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); head = b.toString('latin1'); } catch { }
  if (head !== '#!' || /[\\/]claude[\\/]versions[\\/]/.test(real)) { console.error(`REFUSED: --no-netns runs a FAKE claude script only (${real || c} is not one); the real CLI runs only in the namespace rung`); process.exit(2); }
  return real;
}

async function main() {
  // ── THE EVENTS: what the CLI did to the mock, the pipes or this process (never a crash) ──
  const EVENTS = []; let VARIANT = null;
  const seenErr = new WeakSet(), sockKind = new WeakMap();
  const scrub = (x) => String(x ?? '').replace(/sk-ant-[A-Za-z0-9]+-[A-Za-z0-9_-]+/g, '<token>').slice(0, 160);
  const event = (where, e, code) => {
    try {
      if (e && typeof e === 'object') { if (seenErr.has(e)) return; seenErr.add(e); } // one error, one event (a socket's and its clientError's)
      const ev = { t: Date.now(), variant: VARIANT, where, code: code || e?.code || null, what: scrub(e?.message ?? e) };
      EVENTS.push(ev);
      process.stderr.write(`[measure] event (${VARIANT || '-'}) ${where} ${ev.code || ''}: ${ev.what}\n`);
    } catch { }
  };
  process.on('uncaughtException', (e) => event('process uncaughtException', e));
  process.on('unhandledRejection', (e) => event('process unhandledRejection', e));
  const CLAUDE = NETNS ? opt('claude') : fakeClaude();
  if (!NETNS) { try { execFileSync('sh', ['-c', 'command -v strace']); } catch { console.error('REFUSED: needs strace'); process.exit(2); } }
  const GAP = Number(opt('gap', '65000'));
  const FLUSH_MS = Number(opt('flush-ms', '2500'));   // the OTel batch's flush wait after the last turn
  const NEAR_MS = Number(opt('near-ms', '30000'));    // oat-file-near: expiresAt = start + this
  const OUT = opt('out', '');
  const ROOT = `/tmp/vs-hotsw-${process.pid}`;
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: ROOT } }).trim();
  process.stderr.write(`[measure] ${CLAUDE} = ${version}${NETNS ? '' : ' (--no-netns: a FAKE claude on the loopback mock)'}\n`);
  // Refuse unless the namespace really has no route out (the whole point).
  if (NETNS) {
    const routes = execFileSync('ip', ['-o', 'link'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (routes.some((l) => !/\blo:/.test(l))) { console.error('REFUSED: not in a loopback-only namespace'); process.exit(2); }
  }

  const ORG = { A: 'aaaaaaaa-0000-4000-8000-00000000000a', B: 'bbbbbbbb-0000-4000-8000-00000000000b', O: 'cccccccc-0000-4000-8000-00000000000c', HOME: 'eeeeeeee-0000-4000-8000-00000000000e' };
  const UTIL = { A: 0.11, B: 0.22, O: 0.33 };
  // member O's long-lived token: oat-shaped (prefix, ~108 chars, AA tail), FAKE, new every run
  const OAT = `${OAT_PFX}-FAKE-O-${crypto.randomBytes(43).toString('hex').slice(0, 86)}AA`;

  // ── the mock ──────────────────────────────────────────────────────────────
  const M = { reqs: [], heads: [], otel: [], oauth: [], other: [], escapes: [], mode: { reject429: new Set(), fail401: new Set() }, gen: { A: 1, B: 1 } };
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
      const auth = String(req.headers.authorization || '');
      const scheme = /^Bearer\s/i.test(auth) ? 'bearer' : req.headers['x-api-key'] ? 'x-api-key' : 'none';
      const tok = auth.replace(/^Bearer\s+/i, '') || String(req.headers['x-api-key'] || '');
      const a = acctOf(tok);
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
        if (!ra) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return; }
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
    PATH: process.env.PATH, HOME: home, USER: process.env.USER || 'u', LANG: 'C.UTF-8', TERM: 'dumb',
    ANTHROPIC_BASE_URL: BASE,
    USE_LOCAL_OAUTH: '1', CLAUDE_LOCAL_OAUTH_API_BASE: BASE, CLAUDE_LOCAL_OAUTH_APPS_BASE: BASE, CLAUDE_LOCAL_OAUTH_CONSOLE_BASE: BASE,
    CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: BASE + '/otel', OTEL_LOGS_EXPORT_INTERVAL: '1000',
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', DISABLE_AUTOUPDATER: '1',
  });
  const resetMock = () => { M.reqs = []; M.heads = []; M.otel = []; M.oauth = []; M.other = []; M.mode.reject429.clear(); M.mode.fail401.clear(); M.mode.slowMs = 0; M.gen = { A: 1, B: 1 }; };
  const mark = (out) => ({ reqs: M.reqs.length, heads: M.heads.length, otel: M.otel.length, oauth: M.oauth.length, other: M.other.length, escapes: M.escapes.length, out: out.length });

  // ── strace: one parsed line per syscall; connect() classified ──────────────
  const day = new Date(); const ymd = [day.getFullYear(), day.getMonth(), day.getDate()];
  const toMs = (hms) => { const [h, mi, s] = hms.split(':'); const [si, us] = s.split('.'); return new Date(ymd[0], ymd[1], ymd[2], +h, +mi, +si).getTime() + Math.floor(+us / 1000); };
  const straceOf = (f) => { const r = []; let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { return r; } for (const l of txt.split('\n')) { const m = /^(\d+)\s+(\d\d:\d\d:\d\d\.\d+)\s+(\w+)\((.*)$/.exec(l); if (m) r.push({ pid: +m[1], t: toMs(m[2]), call: m[3], args: m[4], line: l }); } return r; };
  // an AF_INET/AF_INET6 connect() to anything but loopback ⇒ { addr, port, result }; else null
  const outbound = (line) => {
    if (!/\bconnect\(/.test(line) || !/AF_INET/.test(line)) return null;
    const v4 = /sin_port=htons\((\d+)\), sin_addr=inet_addr\("([^"]+)"\)/.exec(line);
    const v6 = /sin6_port=htons\((\d+)\).*?inet_pton\(AF_INET6, "([^"]+)"/.exec(line);
    const [port, addr] = v4 ? [v4[1], v4[2]] : v6 ? [v6[1], v6[2]] : ['?', '?'];
    if (/^127\./.test(addr) || addr === '::1' || /^::ffff:127\./.test(addr)) return null;
    return { addr, port, result: (/\)\s*=\s*(.*)$/.exec(line) || [])[1] || '?' };
  };

  // ── one CLI process under strace (and, without the namespace, under the watchdog) ──
  const ESCAPED = [];
  function startCli({ dir, env, straceLog, variant }) {
    const child = spawn('strace', ['-f', '-tt', '-qq', '-s', '256', '-e', 'trace=%file,connect,inotify_add_watch', '-o', straceLog, CLAUDE,
      '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio'],
    { cwd: path.join(dir, 'cwd'), env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const out = []; let buf = ''; const waiters = [];
    child.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let o = null; try { o = JSON.parse(line); } catch { continue; }
        out.push({ t: Date.now(), o });
        if (o.type === 'result') for (const w of waiters.splice(0)) w(o);
      }
    });
    let stderr = ''; child.stderr.on('data', (d) => { stderr += d; });
    // a write into a CLI that is gone (EPIPE), a pipe error, a spawn that failed: events; an exit ends the turn it was in
    child.stdin.on('error', (e) => event('cli stdin', e));
    child.stdout.on('error', (e) => event('cli stdout', e));
    child.stderr.on('error', (e) => event('cli stderr', e));
    let exited = false;
    const exitP = new Promise((r) => {
      const gone = () => { exited = true; for (const w of waiters.splice(0)) w(null); r(); };
      child.on('exit', gone);
      child.on('error', (e) => { event('cli process', e); if (child.pid === undefined) gone(); });
    });
    // THE BELT (both rungs): the first non-loopback connect() kills the whole process group (strace + claude + its children)
    let off = 0, carry = '';
    const wd = setInterval(() => {
      let chunk = '';
      try { const fd = fs.openSync(straceLog, 'r'); const size = fs.fstatSync(fd).size; if (size > off) { const b = Buffer.alloc(size - off); fs.readSync(fd, b, 0, b.length, off); off = size; chunk = b.toString('utf8'); } fs.closeSync(fd); } catch { return; }
      if (!chunk) return;
      const lines = (carry + chunk).split('\n'); carry = lines.pop();
      for (const l of lines) {
        const o = outbound(l);
        if (!o) continue;
        ESCAPED.push({ variant, connect: `${o.addr}:${o.port}`, result: o.result, line: l.slice(0, 200) });
        try { process.kill(-child.pid, 'SIGKILL'); } catch { }
        for (const w of waiters.splice(0)) w(null);
      }
    }, 50);
    const send = (text) => { try { child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n'); } catch { } };
    const turn = async (text, ms = 90000) => { if (ESCAPED.length || exited) return { t: Date.now(), end: Date.now(), result: ESCAPED.length ? 'ABORTED' : 'EXITED' }; const p = new Promise((r) => { waiters.push(r); setTimeout(() => r(null), ms); }); const t = Date.now(); send(text); const r = await p; return { t, end: Date.now(), result: r ? { subtype: r.subtype, is_error: r.is_error, text: String(r.result || '').slice(0, 160) } : (ESCAPED.length ? 'ABORTED' : exited ? 'EXITED' : 'TIMEOUT') }; };
    const stop = async () => {
      try { child.stdin.end(); } catch { }
      await Promise.race([exitP, sleep(8000)]);
      try { if (NETNS) child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGKILL'); } catch { }
      await sleep(500);
      clearInterval(wd);
    };
    return { out, turn, stop, stderr: () => stderr };
  }

  // a variant's events, each placed in the step it happened in
  const eventsOf = (name, steps = []) => EVENTS.filter((e) => e.variant === name).map((e) => ({ at: new Date(e.t).toISOString().slice(11, 23), step: steps.filter((s) => s.t <= e.t).pop()?.step || 'start', where: e.where, code: e.code, what: e.what }));
  async function runVariant(name) {
    VARIANT = name;
    const dir = path.join(ROOT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const home = path.join(dir, 'home'), A = path.join(dir, 'subs', 'sub-A'), B = path.join(dir, 'subs', 'sub-B');
    const linkDir = path.join(dir, 'pool-links', 'pool-t'), link = path.join(linkDir, 'sess-1');
    for (const d of [home, A, B, linkDir, path.join(dir, 'cwd')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
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
    const straceLog = path.join(dir, 'strace.log');
    const { out, turn, stop, stderr: errOf } = startCli({ dir, env, straceLog, variant: name });

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
    for (const s of straceOf(straceLog)) {
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
    try { for (const l of fs.readFileSync(straceLog, 'utf8').split('\n')) if (/connect\(/.test(l) && !/127\.0\.0\.1|sun_path/.test(l)) connects.push(l.slice(0, 200)); } catch { }
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
    if (opt('dump', '')) { try { fs.writeFileSync(path.join(opt('dump'), `stdout-${name}.ndjson`), out.map((x) => JSON.stringify({ at: x.t, rec: x.o })).join('\n') + '\n'); } catch { } }
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
    for (const d of [home, A, O, linkDir, path.join(dir, 'cwd')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
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
    const straceLog = path.join(dir, 'strace.log');
    const cli = startCli({ dir, env, straceLog, variant: name });
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
    const lines = straceOf(straceLog);
    const ops = credOpsOf(lines);
    const outb = lines.map((s) => outbound(s.line)).filter(Boolean).map((o) => `${o.addr}:${o.port} = ${o.result}`);
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
    // the verdict line says what was seen: every event the run survived, by where + code
    if (r.events.length) { const n = {}; for (const e of r.events) { const k = `${e.where} ${e.code || '?'}`; n[k] = (n[k] || 0) + 1; } r.note += ` · ${r.events.length} event${r.events.length === 1 ? '' : 's'} survived (${Object.entries(n).map(([k, c]) => `${k} ×${c}`).join(', ')})`; }
    RESULTS[name] = { r, steps };
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

  const all = ['slowstream', 'baseline', 'symlink', 'symlink-bare', 'overwrite', 'hardlink-mtime', 'hardlink-same', 'utimes', 'refresh', 'gate429'];
  const v = opt('variant', 'all');
  const want = v === 'all' ? all : v === 'oat' ? [...OAT_VARIANTS] : v.split(',').flatMap((x) => (x === 'oat' ? OAT_VARIANTS : [x]));
  if (flag('write-fixture') && OAT_VARIANTS.some((x) => !want.includes(x))) { console.error(`REFUSED: --write-fixture needs all six oat variants in one run (--variant oat): ${OAT_VARIANTS.join(', ')}`); process.exit(2); }
  // oat-env is a diff against oat-file: run oat-file first whatever the order asked
  want.sort((a, b) => (a === 'oat-file' ? -1 : b === 'oat-file' ? 1 : 0));
  const results = [];
  for (const name of want) {
    if (ESCAPED.length) break;
    process.stderr.write(`[measure] ${name} …\n`);
    if (OAT_VARIANTS.includes(name)) {
      const r = await runOat(name);
      VARIANT = null;
      results.push(r);
      process.stderr.write(`[oat] ${name}: ${r.verdict} — ${r.note}\n`);
      continue;
    }
    const r = await runVariant(name);
    VARIANT = null;
    results.push(r);
    process.stderr.write(JSON.stringify({ variant: r.variant, steps: r.steps.map((s) => [s.step, s.accts.join(' '), s.result?.subtype || s.result]), otel: r.otel.map((o) => `${o.phase}:${(o.org || '').slice(0, 8)}`), oauth: r.oauth.map((o) => `${o.phase}:${o.kind}:${o.acct}`), fileAfter: r.fileAfter, credSyscalls: r.credSyscalls, events: r.events.length }) + '\n');
  }
  const record = { measuredAt: new Date().toISOString(), cli: results[0]?.version || version, netns: NETNS, gapMs: GAP, escapes: M.escapes.map((e) => `${e.via} ${e.what}`), aborted: ESCAPED.length ? ESCAPED : undefined, events: EVENTS.map((e) => ({ ...e, t: new Date(e.t).toISOString().slice(11, 23) })), results };
  if (EVENTS.length) process.stderr.write(`[measure] ${EVENTS.length} events recorded, the run kept going (record.events)\n`);
  if (!flag('keep')) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } } // the scratch HOME + fake creds + strace logs (--keep to inspect)
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  else console.log(JSON.stringify(record, null, 2));
  server.close();
  if (ESCAPED.length) { console.error(`ABORTED: the CLI connect()ed off loopback${NETNS ? ' inside the namespace (the namespace refused it — check it anyway)' : ''} — ${ESCAPED.map((e) => `${e.variant}: ${e.connect} = ${e.result}`).join('; ')}`); process.exit(3); }
  if (flag('write-fixture')) {
    const fx = { cliVersion: cliVersionOf(version), measuredAt: new Date().toISOString().slice(0, 10), script: 'scripts/measure-claude-cred-read.mjs', netns: NETNS, variants: {} };
    for (const name of OAT_VARIANTS) { const r = results.find((x) => x.variant === name); fx.variants[name] = { verdict: r.verdict, note: r.note }; }
    const file = opt('fixture', path.join(path.dirname(SELF), 'fixtures', 'oat-in-file.json'));
    fs.writeFileSync(file, JSON.stringify(fx, null, 1) + '\n');
    process.stderr.write(`[oat] fixture ${file}: oatInFile(${fx.cliVersion}) = ${oatInFile(fx.cliVersion, fx)}\n`);
  }
  process.exit(0);
}
