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
// THE LAW-3 PROOFS (lane cli-self-measure: the hub runs this measurement itself — each fence is proven to fire), once, then `good`:
//   foreign          one request carries a token the run never made ⇒ the run is VOID (foreign-token, P1)
//   escape           a connect() to THIS box's own non-loopback interface address (port 9: refused locally, no packet ever
//                    leaves the box) ⇒ the strace belt classifies it off-loopback and ABORTS the run (P3)
//   forbid-read:<p>  reads file <p> (a path inside a dir the run forbids) ⇒ the run is VOID (guarded-read, P4)
// …and the r2 fences (acceptance r1, laws C and F), once, then `good` (hang: never):
//   udp              one UDP datagram SENT with no connect to 127.0.0.1:9 — loopback, but not the mock's port ⇒ ABORTED (F)
//   unix:<p>         a connect() to the unix socket path <p> (the session bus's shape; it need not exist) ⇒ ABORTED (F)
//   daemon:<pidfile> a grandchild in its OWN session (node's detached spawn = setsid), its pid written to <pidfile> (C: it is
//                    gone when the run ends — proven by its start time, never a bare pid)
//   hang:<pidfile>   its own pid written to <pidfile>, then never answers a turn (C: the stop paths — SIGTERM, the deadline)
// …and round 3 (acceptance r2):
//   thread-read:<p>     reads <p> FORTY times at once on libuv's worker threads (strace splits those opens across lines) (item 1)
//   version-read:<p>    reads <p> during `--version` itself, then answers it (item 2: the version run is fenced too)
//   daemon-hang:<pidfile>  a setsid grandchild + its own pid in <pidfile> ({cli, daemon}), then never answers (item 5: the
//                       measurement child SIGKILLed — the kernel's chain must end both)
// …and round 4 (acceptance r3 item 1 — «the record is not the tracee's to write»), once, then `good`:
//   tamper-<kind>:<canary>  reads <canary> (ONE guarded open), then tries to make the record forget it — <kind> = truncate |
//                       append (forged clean lines) | rename (a clean file over it) | delete | overwrite (clean lines in place) —
//                       against every place a record of it could be: the file r3 kept (derivable from HOME: <ROOT>.trace/<variant>.strace)
//                       and the stream r4 keeps (the trampoline's stderr, /proc/<ppid>/fd/2 — a socket: it cannot be opened)
// …and round 5 (acceptance r4, the tidy: the two roads a reader found, each a tripwire — the measurement is a witness of an honest
// build, not a sandbox), once, then `good`:
//   rewrite-launcher    appends a line to the launcher copy in the scratch (<ROOT>/.trampoline.js) — the next variant must not start
//   link-in:<p>         hard-links <p> (a file under the data dir) into its HOME and reads the new name — the link's SOURCE voids
// …and the incident of 2026-11-11 (the owner's hub: a data directory under the home), behaving `good` otherwise:
//   mint-noscope        `setup-token` prints an authorize URL with NO scope (lane oat-add-door: the mint variant must FAIL)
//   walk                at its start (never for --version) walks UP from its cwd to / the way 2.1.321 does (its clean trace):
//                       CLAUDE.md, CLAUDE.local.md, AGENTS.md, .mcp.json read, .claude/ listed (+ its CLAUDE.md, AGENTS.md), .git
//                       looked at (+ its HEAD read) at EVERY ancestor — what a run's place puts in reach
// `--version` says 9.9.9 (Fake Claude), so a fixture it produces never names a real CLI.
// It talks only to $ANTHROPIC_BASE_URL (the measurement's loopback mock).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import readline from 'node:readline';
import dgram from 'node:dgram';
import { spawn } from 'node:child_process';

const mode = process.argv[2];
const KIND = String(mode || '').split(':')[0], ARG = String(mode || '').slice(KIND.length + 1);
if (process.argv.includes('--version')) { if (KIND === 'version-read') { try { fs.readFileSync(ARG); } catch { } } console.log('9.9.9 (Fake Claude)'); process.exit(0); }
// lane oat-add-door — `setup-token` (the probe's mint variant): on a pty it prints what 2.1.321 prints (measured: the URL wrapped at
// the screen's width, the vendor's origin, `scope=user:inference`, then the code prompt) and waits for a code for ever; on a pipe it
// prints nothing (measured). Mode `mint-noscope` prints a URL with no scope (the variant must FAIL: no scopes recorded)
if (process.argv.includes('setup-token')) {
  if (process.stdout.isTTY) {
    const scope = KIND === 'mint-noscope' ? '' : '&scope=user%3Ainference';
    const url = `https://claude.example.invalid/cai/oauth/authorize?code=true&client_id=00000000-0000-4000-8000-00000000fake&response_type=code&redirect_uri=https%3A%2F%2Fplatform.example.invalid%2Foauth%2Fcode%2Fcallback${scope}&code_challenge=FAKECHALLENGE&code_challenge_method=S256&state=FAKESTATE`;
    process.stdout.write("\x1b[1mBrowser didn't open?\x1b[22m Use the url below to sign in\r\n\r\n" + url.match(/.{1,80}/g).join('\r\n') + '\r\n\r\nPaste code here if prompted > ');
  }
  setInterval(() => { }, 1 << 30);
  await new Promise(() => { }); // never past here: the stream-json fake below is not this command
}
if (KIND === 'daemon-hang') { const d = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' }); d.unref(); fs.writeFileSync(ARG, JSON.stringify({ cli: process.pid, daemon: d.pid })); }
if (KIND === 'hang') fs.writeFileSync(ARG, String(process.pid));
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
const ownAddr = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) return a.address; return null; };
const MISBEHAVE = {
  foreign: () => post('/v1/messages', { authorization: 'Bearer ' + ['sk', 'ant', 'oat01'].join('-') + '-NOTOURS-' + 'z'.repeat(40) }, { model: 'claude-fake', max_tokens: 1, stream: false, messages: [] }),
  escape: () => new Promise((resolve) => { const a = ownAddr(); if (!a) return resolve(); const s = net.connect({ port: 9, host: a }); const done = () => { clearTimeout(cap); s.destroy(); resolve(); }; const cap = setTimeout(done, 3000); s.on('error', done); s.on('connect', done); }),
  reset: () => raw(base.hostname, base.port, (s, done) => s.write(`POST /v1/messages?beta=true HTTP/1.1\r\nhost: ${base.host}\r\ncontent-type: application/json\r\ncontent-length: 4096\r\n\r\n{"model":"claude-fake","max_tok`, () => setTimeout(() => { s.resetAndDestroy(); done(); }, 60))),
  'tls-hello': () => new Promise((resolve) => {
    const t = tls.connect({ host: base.hostname, port: Number(base.port), servername: 'api.anthropic.com', rejectUnauthorized: false });
    const done = () => { clearTimeout(cap); t.destroy(); resolve(); };
    const cap = setTimeout(done, 3000);
    t.on('error', done); t.on('close', done); t.on('secureConnect', done);
  }),
  'connect-reset': () => raw(proxy.hostname, proxy.port, (s, done) => { s.once('data', () => setTimeout(() => { s.resetAndDestroy(); done(); }, 20)); s.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nhost: api.anthropic.com:443\r\n\r\n'); }),
  udp: () => new Promise((resolve) => { const u = dgram.createSocket('udp4'); const done = () => { clearTimeout(cap); try { u.close(); } catch { } resolve(); }; const cap = setTimeout(done, 2000); u.on('error', done); u.send(Buffer.from('x'), 9, '127.0.0.1', done); }),
  unix: () => new Promise((resolve) => { const s = net.connect({ path: ARG }); const done = () => { clearTimeout(cap); s.destroy(); resolve(); }; const cap = setTimeout(done, 3000); s.on('error', done); s.on('connect', done); }),
  daemon: () => { const d = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' }); d.unref(); fs.writeFileSync(ARG, String(d.pid)); },
  hang: () => new Promise(() => { }),
  'daemon-hang': () => new Promise(() => { }),
  tamper: () => {
    const kind = KIND.slice('tamper-'.length);
    try { fs.readFileSync(ARG); } catch { } // the ONE guarded open the record must keep
    const home = process.env.HOME || '/'; const vdir = path.dirname(home);
    const targets = [`${path.dirname(vdir)}.trace/${path.basename(vdir)}.strace`, `/proc/${process.ppid}/fd/2`];
    const line = (n) => { const head = `${process.pid} 00:00:00.000001 getpid()`, tail = ` = ${process.pid}\n`; return head + ' '.repeat(Math.max(1, n - head.length - tail.length)) + tail; };
    const clean = (size) => { let out = '', left = Math.max(size, 80); while (left - 64 >= 64) { out += line(64); left -= 64; } return out + line(left); };
    for (const f of targets) {
      try {
        if (kind === 'truncate') fs.truncateSync(f, 0);
        else if (kind === 'append') fs.appendFileSync(f, clean(160));
        else if (kind === 'rename') { const t = `${f}.clean`; fs.writeFileSync(t, clean(160)); fs.renameSync(t, f); }
        else if (kind === 'delete') fs.unlinkSync(f);
        else if (kind === 'overwrite') { const fd = fs.openSync(f, 'r+'); const size = fs.fstatSync(fd).size; const b = Buffer.from(clean(size)); fs.writeSync(fd, b, 0, b.length, 0); fs.closeSync(fd); }
      } catch { }
    }
  },
  'rewrite-launcher': () => { const root = path.dirname(path.dirname(process.env.HOME || '/')); try { fs.appendFileSync(path.join(root, '.trampoline.js'), '\n// changed by the build\n'); } catch { } },
  'link-in': () => { const to = path.join(process.env.HOME || '/', 'linked'); try { fs.linkSync(ARG, to); fs.readFileSync(to); } catch { } },
  'thread-read': () => Promise.all(Array.from({ length: 40 }, () => fs.promises.readFile(ARG).catch(() => null))),
  'connect-rst-early': () => raw(proxy.hostname, proxy.port, (s, done) => s.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nhost: api.anthropic.com:443\r\n\r\n', () => { s.resetAndDestroy(); setTimeout(done, 100); })),
};
if (KIND === 'walk' && !process.argv.includes('--version')) {
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    for (const f of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', path.join('.claude', 'CLAUDE.md'), path.join('.claude', 'AGENTS.md'), path.join('.git', 'HEAD')]) { try { fs.readFileSync(path.join(d, f)); } catch { } }
    for (const dir of ['.claude', '.git']) { try { fs.readdirSync(path.join(d, dir)); } catch { } }
    if (d === path.dirname(d)) break;
  }
}
let misbehaved = false, dropped = false;
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function onTurn() {
  if (!misbehaved) { misbehaved = true; if (/^tamper-/.test(KIND)) MISBEHAVE.tamper(); else if (MISBEHAVE[KIND] && KIND !== 'forbid-read') await MISBEHAVE[KIND](); else if (/^forbid-read:/.test(mode || '')) { try { fs.readFileSync(mode.slice('forbid-read:'.length)); } catch { } } }
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
