#!/usr/bin/env node
// A FAKE `claude` for scripts/test-cli-caps.mjs (lane pool-oat-measure): just enough
// of the stream-json protocol for scripts/measure-claude-cred-read.mjs to run its
// oat variants WITHOUT the real binary — so the measurement's verdicts are gated
// on every machine, the namespace-free way. Its mode (argv[2]) is its behavior:
//   good        each turn statx()es $CLAUDE_SECURESTORAGE_CONFIG_DIR/.credentials.json and
//               re-reads it when its mtime moved (or takes $CLAUDE_CODE_OAUTH_TOKEN), sends
//               that token as the bearer; refreshes only with a refresh token; never writes
//   rewrite401  the same, but a 401 blanks the file's accessToken (tmp + rename) —
//               a CLI whose failed auth wipes the login (oat-file-401 must FAIL)
//   stale       reads the credential ONCE at start and never again (oat-file-switch must FAIL)
// The MISBEHAVIOURS (lane pool-oat-measure-fix: 主开发's first real-CLI rung died on a reset
// socket): each runs ONCE before the first turn's request, then the fake behaves as `good`:
//   reset           a connection sends a request head + half its body, then RSTs
//   tls-hello       a TLS ClientHello against the plain mock port (an https call that ignored http://)
//   keepalive-drop  the first turn's request rides a keep-alive socket the fake RSTs once answered
//   connect-reset   THE 2.1.296 CRASH SHAPE: a CONNECT through $HTTPS_PROXY (the mock), its 403 read,
//                   the mock's FIN left unanswered, then RST (the mock's read: ECONNRESET)
//   connect-rst-early  a CONNECT RST at once, before the mock's 403 (its write meets a reset socket)
// `--version` says 9.9.9 (Fake Claude), so a fixture it produces never names a real CLI.
// It talks only to $ANTHROPIC_BASE_URL (the measurement's loopback mock).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import readline from 'node:readline';

const mode = process.argv[2];
if (process.argv.includes('--version')) { console.log('9.9.9 (Fake Claude)'); process.exit(0); }
const file = path.join(process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR || path.join(process.env.HOME || '/', '.claude'), '.credentials.json');
const read = () => {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return { accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).claudeAiOauth || null; } catch { return null; }
};
// the 2.1.281-measured mechanism (scripts/fixtures/claude-cred-read-2.1.281.json): every turn
// statx() the file through the link; re-read only when its mtime moved
const mtimeOf = () => { try { return fs.statSync(file).mtimeMs; } catch { return null; } };
const first = read();
let held = first, heldMtime = mtimeOf();
const current = () => {
  if (mode === 'stale') return first;
  const mt = mtimeOf();
  if (mt !== heldMtime) { held = read(); heldMtime = mt; }
  return held;
};
const base = new URL(process.env.ANTHROPIC_BASE_URL);
// drop: the socket the request rode is RST once its answer is read (keepalive-drop)
const post = (p, headers, body, drop) => new Promise((resolve) => {
  const req = http.request({ host: base.hostname, port: base.port, path: p, method: 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(drop ? { agent: new http.Agent({ keepAlive: true }) } : {}) }, (r) => {
    let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { if (drop) setImmediate(() => req.socket?.resetAndDestroy()); resolve({ status: r.statusCode, body: b }); });
  });
  req.on('error', () => resolve({ status: 0, body: '' }));
  req.end(JSON.stringify(body));
});
// one raw TCP connection to host:port; act(sock, done) misbehaves on it; never longer than 3 s.
// allowHalfOpen: the mock's FIN is not answered with ours, so the RST meets a socket it still reads
const raw = (host, port, act) => new Promise((resolve) => {
  const s = net.connect({ port: Number(port), host, allowHalfOpen: true });
  const done = () => { clearTimeout(cap); s.destroy(); resolve(); };
  const cap = setTimeout(done, 3000);
  s.on('error', done);
  s.on('connect', () => act(s, done));
});
const proxy = new URL(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ANTHROPIC_BASE_URL);
const MISBEHAVE = {
  reset: () => raw(base.hostname, base.port, (s, done) => s.write(`POST /v1/messages?beta=true HTTP/1.1\r\nhost: ${base.host}\r\ncontent-type: application/json\r\ncontent-length: 4096\r\n\r\n{"model":"claude-fake","max_tok`, () => setTimeout(() => { s.resetAndDestroy(); done(); }, 60))),
  'tls-hello': () => new Promise((resolve) => {
    const t = tls.connect({ host: base.hostname, port: Number(base.port), servername: 'api.anthropic.com', rejectUnauthorized: false });
    const done = () => { clearTimeout(cap); t.destroy(); resolve(); };
    const cap = setTimeout(done, 3000);
    t.on('error', done); t.on('close', done); t.on('secureConnect', done);
  }),
  'connect-reset': () => raw(proxy.hostname, proxy.port, (s, done) => { s.once('data', () => setTimeout(() => { s.resetAndDestroy(); done(); }, 20)); s.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nhost: api.anthropic.com:443\r\n\r\n'); }),
  'connect-rst-early': () => raw(proxy.hostname, proxy.port, (s, done) => s.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nhost: api.anthropic.com:443\r\n\r\n', () => { s.resetAndDestroy(); setTimeout(done, 100); })),
};
let misbehaved = false, dropped = false;
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function onTurn() {
  if (!misbehaved) { misbehaved = true; if (MISBEHAVE[mode]) await MISBEHAVE[mode](); }
  const c = current();
  if (!c || !c.accessToken) return emit({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
  if (c.refreshToken && c.expiresAt && Date.now() + 300e3 >= c.expiresAt) await post('/v1/oauth/token', {}, { grant_type: 'refresh_token', refresh_token: c.refreshToken });
  const r = await post('/v1/messages?beta=true', { authorization: 'Bearer ' + c.accessToken, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20' }, { model: 'claude-fake', max_tokens: 64, stream: false, messages: [{ role: 'user', content: 'x' }] }, mode === 'keepalive-drop' && !dropped && (dropped = true));
  if (r.status === 401 && mode === 'rewrite401' && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    o.claudeAiOauth.accessToken = '';
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(o), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  emit({ type: 'result', subtype: 'success', is_error: r.status !== 200, result: r.status === 200 ? 'ok' : `API Error: ${r.status}` });
}

emit({ type: 'system', subtype: 'init' });
let chain = Promise.resolve();
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m = null; try { m = JSON.parse(line); } catch { }
  if (m && m.type === 'user') chain = chain.then(onTurn);
});
rl.on('close', () => { chain.then(() => process.exit(0)); });
