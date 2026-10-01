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
//   node scripts/measure-claude-cred-read.mjs [--variant all|<name>[,<name>]] [--gap 65000] [--out file.json]
//
// Needs `sudo -n` (for the network namespace) and `strace`. Without them it
// REFUSES — it never runs a claude process that could reach the network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

// ── outer: re-exec inside a loopback-only network namespace ─────────────────
if (!flag('inner')) {
  const user = os.userInfo().username;
  let claude = opt('claude', '');
  if (!claude) { try { claude = fs.realpathSync(execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim()); } catch { } }
  if (!claude) { console.error('REFUSED: no `claude` on PATH'); process.exit(2); }
  try { execFileSync('sudo', ['-n', 'true']); } catch { console.error('REFUSED: needs `sudo -n` for the loopback-only network namespace'); process.exit(2); }
  try { execFileSync('sh', ['-c', 'command -v strace']); } catch { console.error('REFUSED: needs strace'); process.exit(2); }
  const pass = argv.filter((a) => a !== '--inner');
  const inner = ['env', `HOME=${process.env.HOME || os.homedir()}`, `PATH=${path.dirname(process.execPath)}:/usr/bin:/bin`, `USER=${user}`, process.execPath, SELF, '--inner', '--claude', claude, ...pass];
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const r = spawn('sudo', ['-n', 'unshare', '-n', '--', 'sh', '-c', `ip link set lo up && exec sudo -n -u ${q(user)} -- ${inner.map(q).join(' ')}`], { stdio: 'inherit' });
  r.on('exit', (c) => process.exit(c ?? 1));
} else {
  await main();
}

async function main() {
  const CLAUDE = opt('claude');
  const GAP = Number(opt('gap', '65000'));
  const OUT = opt('out', '');
  const ROOT = `/tmp/vs-hotsw-${process.pid}`;
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: ROOT } }).trim();
  // Refuse unless the namespace really has no route out (the whole point).
  const routes = execFileSync('ip', ['-o', 'link'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (routes.some((l) => !/\blo:/.test(l))) { console.error('REFUSED: not in a loopback-only namespace'); process.exit(2); }

  const ORG = { A: 'aaaaaaaa-0000-4000-8000-00000000000a', B: 'bbbbbbbb-0000-4000-8000-00000000000b', HOME: 'eeeeeeee-0000-4000-8000-00000000000e' };
  const UTIL = { A: 0.11, B: 0.22 };

  // ── the mock ──────────────────────────────────────────────────────────────
  const M = { reqs: [], otel: [], oauth: [], other: [], mode: { reject429: new Set(), fail401: new Set() }, gen: { A: 1, B: 1 } };
  const acctOf = (tok) => { const m = /FAKE-([AB])-/.exec(String(tok || '')); return m ? m[1] : null; };
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
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url || '';
      const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-api-key'] || '');
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
        const ra = acctOf(rt);
        M.oauth.push({ t: now(), kind: 'refresh', refreshToken: rt, acct: ra });
        if (!ra) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return; }
        const g = ++M.gen[ra];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token_type: 'Bearer', access_token: `sk-ant-oat01-FAKE-${ra}-${g}`, refresh_token: `sk-ant-ort01-FAKE-${ra}-r${g}`, expires_in: 28800, scope: 'user:inference user:profile user:sessions:claude_code user:mcp_servers', organization: { uuid: ORG[ra], name: 'Org ' + ra }, account: { uuid: 'acct-' + ra, email_address: ra.toLowerCase() + '@example.invalid' } }));
        return;
      }
      if (url.startsWith('/api/oauth/profile')) {
        M.oauth.push({ t: now(), kind: 'profile', acct: a });
        res.writeHead(a ? 200 : 401, { 'content-type': 'application/json' });
        res.end(JSON.stringify(a ? { account: { uuid: 'acct-' + a, email: a.toLowerCase() + '@example.invalid', display_name: 'Member ' + a, has_claude_max: true, has_claude_pro: false }, organization: { uuid: ORG[a], name: 'Org ' + a, organization_type: 'claude_max', rate_limit_tier: 'default_claude_max_20x', has_extra_usage_enabled: false, billing_type: 'stripe_subscription' } } : { error: 'unauthorized' }));
        return;
      }
      if (url.startsWith('/v1/messages')) {
        const rec = { t: now(), path: url.split('?')[0], acct: a, tok: tok ? tok.slice(-8) : null, model: j?.model || null, stream: !!j?.stream, org: req.headers['x-organization-uuid'] || null, status: 200 };
        M.reqs.push(rec);
        if (url.includes('count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":12}'); return; }
        if (a && M.mode.fail401.has(a)) { rec.status = 401; res.writeHead(401, { 'content-type': 'application/json', 'request-id': 'req_401' }); res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'OAuth token has expired. Please obtain a new token or refresh your existing token.' } })); return; }
        if (a && M.mode.reject429.has(a)) { rec.status = 429; res.writeHead(429, { 'content-type': 'application/json', ...rlHeaders(a, true) }); res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Error' } })); return; }
        if (!a) { rec.status = 401; res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); return; }
        const text = `ok from ${a}`;
        if (j?.stream) sse(res, j?.model || 'claude-x', text, rlHeaders(a, false));
        else { res.writeHead(200, { 'content-type': 'application/json', ...rlHeaders(a, false) }); res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: j?.model || 'claude-x', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 12, output_tokens: 3 } })); }
        return;
      }
      M.other.push({ t: now(), method: req.method, path: url.slice(0, 120), acct: a });
      res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const creds = (a, g, expiresAt) => JSON.stringify({ claudeAiOauth: { accessToken: `sk-ant-oat01-FAKE-${a}-${g}`, refreshToken: `sk-ant-ort01-FAKE-${a}-r${g}`, expiresAt, scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' } });
  const readTok = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).claudeAiOauth; } catch { return null; } };
  // the product's primitive, byte for byte (src/account-material.js)
  const repoint = (link, target, credsPath) => {
    const tmp = link + '.swap-' + Math.random().toString(16).slice(2, 10);
    fs.symlinkSync(target, tmp); fs.renameSync(tmp, link);
    if (credsPath) { const n = Date.now() / 1000; fs.utimesSync(credsPath, n, n); }
  };

  async function runVariant(name) {
    const dir = path.join(ROOT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const home = path.join(dir, 'home'), A = path.join(dir, 'subs', 'sub-A'), B = path.join(dir, 'subs', 'sub-B');
    const linkDir = path.join(dir, 'pool-links', 'pool-t'), link = path.join(linkDir, 'sess-1');
    for (const d of [home, A, B, linkDir, path.join(dir, 'cwd')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, numStartups: 5, oauthAccount: { accountUuid: 'acct-HOME', emailAddress: 'home@example.invalid', organizationUuid: ORG.HOME, organizationName: 'Org HOME' } }));
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
    M.reqs = []; M.otel = []; M.oauth = []; M.other = []; M.mode.reject429.clear(); M.mode.fail401.clear(); M.mode.slowMs = 0; M.gen = { A: 1, B: 1 };
    if (name === 'gate429') M.mode.reject429.add('A');

    const env = {
      PATH: process.env.PATH, HOME: home, USER: process.env.USER || 'u', LANG: 'C.UTF-8', TERM: 'dumb',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: link,
      ANTHROPIC_BASE_URL: BASE,
      USE_LOCAL_OAUTH: '1', CLAUDE_LOCAL_OAUTH_API_BASE: BASE, CLAUDE_LOCAL_OAUTH_APPS_BASE: BASE, CLAUDE_LOCAL_OAUTH_CONSOLE_BASE: BASE,
      CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_ENDPOINT: BASE + '/otel', OTEL_LOGS_EXPORT_INTERVAL: '1000',
      CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', DISABLE_AUTOUPDATER: '1',
    };
    const straceLog = path.join(dir, 'strace.log');
    const child = spawn('strace', ['-f', '-tt', '-qq', '-s', '256', '-e', 'trace=%file,connect,inotify_add_watch', '-o', straceLog, CLAUDE,
      '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio'],
    { cwd: path.join(dir, 'cwd'), env, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const send = (text) => child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n');
    const turn = async (text, ms = 90000) => { const p = new Promise((r) => { waiters.push(r); setTimeout(() => r(null), ms); }); const t = Date.now(); send(text); const r = await p; return { t, end: Date.now(), result: r ? { subtype: r.subtype, is_error: r.is_error, text: String(r.result || '').slice(0, 160) } : 'TIMEOUT' }; };
    const mark = () => ({ reqs: M.reqs.length, otel: M.otel.length, oauth: M.oauth.length, out: out.length });

    const steps = [];
    const m0 = mark();
    const t1 = await turn('one');
    const m1 = mark();
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
    const m2 = mark();
    steps.push({ step: 'msg2', change, gapMs: gap, ...t2, reqs: M.reqs.slice(m1.reqs, m2.reqs) });
    if (name === 'gate429') {
      // the pool "moves" the walled process: re-point, then continue
      repoint(link, B, credB);
      const tc2 = Date.now();
      await sleep(Math.min(GAP, 65000));
      const t3 = await turn('three');
      const m3 = mark();
      steps.push({ step: 'msg3', change: 'repointPoolSymlink(link→B)+utimes(B) after the 429', changeAt: tc2, ...t3, reqs: M.reqs.slice(m2.reqs, m3.reqs) });
    }
    await sleep(2500); // let the OTel batch flush
    try { child.stdin.end(); } catch { }
    await Promise.race([new Promise((r) => child.on('exit', r)), sleep(8000)]);
    try { child.kill('SIGTERM'); } catch { }
    await sleep(500);

    // strace: every syscall naming a creds path, with the wall-clock time
    const day = new Date(); const ymd = [day.getFullYear(), day.getMonth(), day.getDate()];
    const toMs = (hms) => { const [h, mi, s] = hms.split(':'); const [si, us] = s.split('.'); return new Date(ymd[0], ymd[1], ymd[2], +h, +mi, +si).getTime() + Math.floor(+us / 1000); };
    let credSys = [];
    try {
      for (const l of fs.readFileSync(straceLog, 'utf8').split('\n')) {
        if (!/credentials|sess-1|sub-A|sub-B|oauth_refresh/.test(l)) continue;
        const m = /^(\d+)\s+(\d\d:\d\d:\d\d\.\d+)\s+(\w+)\((.*)$/.exec(l);
        if (!m) continue;
        const t = toMs(m[2]);
        const call = m[3];
        const where = /sub-A/.test(l) ? 'A' : /sub-B/.test(l) ? 'B' : /sess-1/.test(l) ? 'link' : '?';
        credSys.push({ t, call, where, line: l.slice(0, 220) });
      }
    } catch { }
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
      stderrTail: stderr.slice(-400),
    };
    if (opt('dump', '')) { try { fs.writeFileSync(path.join(opt('dump'), `stdout-${name}.ndjson`), out.map((x) => JSON.stringify({ at: x.t, rec: x.o })).join('\n') + '\n'); } catch { } }
    return res;
  }

  const all = ['slowstream', 'baseline', 'symlink', 'symlink-bare', 'overwrite', 'hardlink-mtime', 'hardlink-same', 'utimes', 'refresh', 'gate429'];
  const want = opt('variant', 'all') === 'all' ? all : opt('variant').split(',');
  const results = [];
  for (const v of want) {
    process.stderr.write(`[measure] ${v} …\n`);
    const r = await runVariant(v);
    results.push(r);
    process.stderr.write(JSON.stringify({ variant: r.variant, steps: r.steps.map((s) => [s.step, s.accts.join(' '), s.result?.subtype || s.result]), otel: r.otel.map((o) => `${o.phase}:${(o.org || '').slice(0, 8)}`), oauth: r.oauth.map((o) => `${o.phase}:${o.kind}:${o.acct}`), fileAfter: r.fileAfter, credSyscalls: r.credSyscalls }) + '\n');
  }
  const record = { measuredAt: new Date().toISOString(), cli: results[0]?.version, gapMs: GAP, results };
  if (!flag('keep')) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } } // the scratch HOME + fake creds + strace logs (--keep to inspect)
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  else console.log(JSON.stringify(record, null, 2));
  server.close();
  process.exit(0);
}
