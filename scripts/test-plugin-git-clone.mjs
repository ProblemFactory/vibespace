#!/usr/bin/env node
// test-plugin-git-clone — lane engine-distribution (P4 of the custom browser kernel, docs/design-custom-browser-plugin.zh.md §5.1),
// HEAVY: a REAL `git` clone of a PRIVATE repository through the plugin installer's credential road. A local bare repository is
// served over HTTPS on loopback by `git http-backend` (the CGI git ships) behind Basic auth that admits ONE fake access token,
// built at runtime by concatenation (never a literal). The installer gets the token from a fixture integration store and hands
// it to git ONLY through its askpass files. Measured while each clone runs: every /proc/<pid>/cmdline and environ of this
// process tree is swept for the token (never there); after each one, no credential file is left. A `credential.helper = store` in
// the HOME git config — never read since round 2 (GIT_CONFIG_GLOBAL=/dev/null), and reset anyway by `-c credential.helper=` —
// writes no ~/.git-credentials. Legs: no credential ⇒ plugin_git_auth (git's own «terminal prompts disabled»); the right token
// ⇒ installed at the pinned sha; a wrong token ⇒ plugin_git_auth; the row's Test (git ls-remote); round 2: a HOME url.insteadOf
// that rewrites the host to a SECOND loopback server is never followed (that server sees nothing), and a copy without
// GIT_CONFIG_GLOBAL hands it the token — RED. Round 3: git trusts the fixture CA the way a pod behind a TLS-inspecting egress
// does — the hub's GIT_SSL_CAINFO through the egress door (src/agent-env.js EGRESS_ENV); the same CA named only in the HOME
// config (`http.sslCAInfo`) is NOT read (the clone fails on the certificate), and a copy whose door lacks the name fails the
// same way — RED. SKIPs with evidence without git / git-http-backend / openssl.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e === undefined ? '' : ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600))); } };
const which = (b) => { try { return execFileSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const GIT = which('git'), OPENSSL = which('openssl');
const BACKEND = GIT ? path.join(execFileSync(GIT, ['--exec-path'], { encoding: 'utf8' }).trim(), 'git-http-backend') : '';
if (!GIT || !OPENSSL || !fs.existsSync(BACKEND)) {
  console.log(`  … SKIP the real clone — needs git (${GIT || 'none'}), its http-backend (${BACKEND || 'none'}) and openssl (${OPENSSL || 'none'})`);
  console.log('\nALL PASS (0)');
  process.exit(0);
}
const ROOT = scratch('plugin-git-clone');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true });
// ── the repository: one plugin package, tagged ──
const genv = { PATH: process.env.PATH, HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const gitc = (args, cwd) => execFileSync(GIT, args, { cwd, env: genv, encoding: 'utf8' }).trim();
const work = path.join(ROOT, 'work'), projects = path.join(ROOT, 'srv');
gitc(['init', '-q', '-b', 'main', work]);
fs.writeFileSync(path.join(work, 'vibespace-plugin.json'), JSON.stringify({ id: 'acme.private', version: '2.0.0', engines: { vibespace: '2.369.24' }, label: 'Private over https' }));
gitc(['add', '-A'], work); gitc(['commit', '-qm', 'one'], work); gitc(['tag', 'v2'], work);
const SHA = gitc(['rev-parse', 'HEAD'], work);
fs.mkdirSync(projects, { recursive: true });
gitc(['clone', '-q', '--bare', work, path.join(projects, 'private.git')]);
gitc(['config', 'http.receivepack', 'false'], path.join(projects, 'private.git'));
// ── TLS on loopback: a CA + a server cert for 127.0.0.1; git trusts the CA through the hub's GIT_SSL_CAINFO (the egress door) ──
const ca = path.join(ROOT, 'ca'), key = path.join(ROOT, 'srv.key'), crt = path.join(ROOT, 'srv.crt');
execFileSync(OPENSSL, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=fixture-ca', '-keyout', ca + '.key', '-out', ca + '.pem'], { stdio: 'ignore' });
fs.writeFileSync(path.join(ROOT, 'san.cnf'), 'subjectAltName=IP:127.0.0.1\n');
execFileSync(OPENSSL, ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-keyout', key, '-out', path.join(ROOT, 'srv.csr')], { stdio: 'ignore' });
execFileSync(OPENSSL, ['x509', '-req', '-in', path.join(ROOT, 'srv.csr'), '-CA', ca + '.pem', '-CAkey', ca + '.key', '-CAcreateserial', '-days', '1', '-extfile', path.join(ROOT, 'san.cnf'), '-out', crt], { stdio: 'ignore' });
const homeConfig = (extra = '') => fs.writeFileSync(path.join(HOME, '.gitconfig'), `[credential]\n\thelper = store\n${extra}`);
homeConfig();
// the installer's git = the real git; the fixture CA rides the hub's env (round 3: the egress door's GIT_SSL_CAINFO — the HOME
// config is never read by a plugin's git child since round 2, and this box's git on libcurl-GnuTLS ignores SSL_CERT_FILE)
const CAFILE = `${ca}.pem`;
process.env.GIT_SSL_CAINFO = CAFILE;
// ── the server: Basic auth admitting ONE token, then git http-backend as a CGI ──
const PAT = ['fx', 'gh', 'pat', crypto.randomBytes(6).toString('hex'), 'Zq9'].join('_'); // built at runtime: never one literal
const seen = [];
const srv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  const auth = String(req.headers.authorization || '');
  const m = /^Basic\s+(.+)$/.exec(auth);
  const [user, pw] = m ? Buffer.from(m[1], 'base64').toString('utf8').split(':') : [null, null];
  seen.push({ url: req.url, user, ok: pw === PAT });
  if (pw !== PAT) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' }); return res.end('no'); }
  const u = new URL(req.url, 'https://127.0.0.1');
  const cgi = spawn(BACKEND, [], { env: { GIT_PROJECT_ROOT: projects, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: u.pathname, QUERY_STRING: u.search.slice(1), REQUEST_METHOD: req.method, CONTENT_TYPE: req.headers['content-type'] || '', REMOTE_USER: user || '', REMOTE_ADDR: '127.0.0.1', PATH: process.env.PATH, GIT_PROTOCOL: req.headers['git-protocol'] || '', HTTP_GIT_PROTOCOL: req.headers['git-protocol'] || '' } });
  req.pipe(cgi.stdin);
  let head = Buffer.alloc(0), sent = false;
  cgi.stdout.on('data', (c) => {
    if (sent) return res.write(c);
    head = Buffer.concat([head, c]);
    const i = head.indexOf('\r\n\r\n');
    if (i < 0) return;
    const hs = head.slice(0, i).toString('utf8').split('\r\n'), body = head.slice(i + 4);
    let status = 200; const h = {};
    for (const l of hs) { const k = l.slice(0, l.indexOf(':')).trim(), v = l.slice(l.indexOf(':') + 1).trim(); if (/^status$/i.test(k)) status = parseInt(v, 10) || 200; else h[k] = v; }
    res.writeHead(status, h); sent = true; if (body.length) res.write(body);
  });
  cgi.on('close', () => res.end());
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
// round 2: a SECOND host on loopback — what a HOME url.insteadOf would rewrite the repository to; it asks for credentials and
// records every one it is handed
const evilSeen = [];
const evil = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  const m = /^Basic\s+(.+)$/.exec(String(req.headers.authorization || ''));
  const [user, pw] = m ? Buffer.from(m[1], 'base64').toString('utf8').split(':') : [null, null];
  evilSeen.push({ url: req.url, user, token: pw === PAT });
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="elsewhere"' }); res.end('no');
});
await new Promise((r) => evil.listen(0, '127.0.0.1', r));
const EVIL_PORT = evil.address().port;
const URL_H = `https://127.0.0.1:${PORT}/private.git`;
const HOSTP = `127.0.0.1:${PORT}`;
// ── the installer over REAL git, its HOME the fixture's (serviceEnv keeps HOME) ──
process.env.HOME = HOME;
let cred = null;
const store = { resolveIntegration: () => (cred ? { source: 'user', values: { ...cred } } : { source: 'none', values: {}, whyCode: 'no-values', why: 'no key of your own and no cluster default' }) };
const IR = path.join(ROOT, 'root'); fs.mkdirSync(path.join(IR, 'data', 'plugins'), { recursive: true });
const PI = require(path.join(REPO, 'src/server/plugin-install.js'));
const ins = PI.create({ rootDir: IR, log: { log() {}, warn() {} }, integrations: () => store, gitBin: GIT, gitTimeoutMs: 30000 });
/** THE SWEEP while a clone runs: every /proc/<pid>/cmdline + environ of THIS user's processes, every 5 ms, for the token */
async function swept(p) {
  const hits = new Set(); let sweeps = 0, stop = false;
  const tick = () => {
    if (stop) return;
    sweeps++;
    for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
      for (const f of ['cmdline', 'environ']) { try { const b = fs.readFileSync(`/proc/${pid}/${f}`); if (b.includes(PAT)) hits.add(`${pid}/${f}`); } catch { /* gone / not ours */ } }
    }
    setTimeout(tick, 5);
  };
  tick();
  let out, err = null;
  try { out = await p; } catch (e) { err = e; }
  stop = true;
  return { out, err, hits: [...hits], sweeps };
}
const staging = path.join(IR, 'data', 'plugins-staging');
const credLeft = () => { try { return fs.readdirSync(staging).some((d) => fs.readdirSync(path.join(staging, d)).some((n) => n.startsWith('.cred-'))); } catch { return false; } };
try {
  console.log('— a REAL clone of a private repository over https on loopback (git http-backend behind Basic auth)');
  // ① no credential ⇒ the server asks, git may not prompt ⇒ plugin_git_auth by name
  const a = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v2' }));
  ok(a.err && a.err.code === 'plugin_git_auth' && /anonymous clone/.test(a.err.message) && seen.some((x) => !x.ok), 'no credential ⇒ the host answers 401, git never prompts ⇒ plugin_git_auth (a private repository needs the Plugin Git credential)', a.err && a.err.message);
  // ② the right token ⇒ installed at the pinned sha; the token on no command line and in no environment while it ran
  cred = { host: HOSTP, token: PAT };
  const n0 = seen.length;
  const b = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(!b.err && b.out && b.out.id === 'acme.private' && b.out.sha === SHA && b.out.ref === 'v2' && fs.existsSync(path.join(IR, 'data', 'plugins', 'acme.private', 'vibespace-plugin.json')), 'the token ⇒ a REAL clone of the private repository at the pinned tag, its sha recorded', b.err ? b.err.message : b.out && b.out.sha);
  ok(seen.slice(n0).some((x) => x.ok && x.user === 'x-access-token'), 'git authenticated with the askpass\'s answers (user x-access-token + the token) — the server admitted them');
  ok(b.hits.length === 0 && b.sweeps > 3, `while git ran, no /proc/<pid>/cmdline or environ of any process held the token (${b.sweeps} sweeps)`, b.hits);
  ok(!credLeft() && !fs.existsSync(path.join(HOME, '.git-credentials')), 'after the clone: no credential file in the stage, and the HOME config\'s `credential.helper = store` wrote NOTHING (the installer resets the helpers)');
  // ③ a wrong token ⇒ plugin_git_auth; files gone too
  cred = { host: HOSTP, token: PAT.slice(0, -2) + 'xx' };
  const c = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(c.err && c.err.code === 'plugin_git_auth' && /token of the Plugin Git credential/.test(c.err.message) && !credLeft() && c.hits.length === 0, 'a wrong token ⇒ plugin_git_auth by name, its files shredded', c.err && c.err.message);
  // ④ the row's Test: git ls-remote with the credential
  cred = { host: HOSTP, token: PAT };
  const t = await ins.testCredential(URL_H);
  ok(t.ok && t.head === SHA, 'the plugin-git Test = a REAL git ls-remote with the credential (HEAD answered)', t);
  // ⑤ a missing ref on the real server
  const d = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v9', credential: 'plugin-git' }));
  ok(d.err && d.err.code === 'plugin_git_ref_missing', 'a ref the repository has not ⇒ plugin_git_ref_missing (git\'s own words, by name)', d.err && d.err.message);
  // ⑥ ROUND 2: a HOME url.insteadOf rewriting the repository's host to the second server — never followed; the token reaches
  // only the host the credential is bound to
  homeConfig(`[url "https://127.0.0.1:${EVIL_PORT}/"]\n\tinsteadOf = https://127.0.0.1:${PORT}/\n`);
  cred = { host: HOSTP, token: PAT };
  const n6 = seen.length;
  const e = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(!e.err && e.out && e.out.sha === SHA && evilSeen.length === 0 && seen.slice(n6).some((x) => x.ok) && e.hits.length === 0, 'round 2: a HOME url.insteadOf rewriting the host ⇒ NOT followed (GIT_CONFIG_GLOBAL=/dev/null) — the clone and the askpass\'s token go to the host the credential is bound to only; the rewrite target saw NO request', { err: e.err && e.err.message, evil: evilSeen.length });
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/plugin-install.js'), 'utf8');
  const anchor = "GIT_CONFIG_GLOBAL: '/dev/null', ";
  const MC = mutantCopies('plugin-git-clone', REPO);
  const insR = MC.load('src/server/plugin-install.js', SRC.replace(anchor, ''), 'home-config').create({ rootDir: IR, log: { log() {}, warn() {} }, integrations: () => store, gitBin: GIT, gitTimeoutMs: 30000 });
  const r = await swept(insR.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(SRC.includes(anchor) && r.err && r.err.code === 'plugin_git_auth' && evilSeen.some((x) => x.token), 'control: a copy WITHOUT GIT_CONFIG_GLOBAL follows the HOME rewrite and its askpass HANDS THE TOKEN to the other host (it answered 401, git asked, the token went) — RED', { err: r.err && r.err.code, evil: evilSeen.map((x) => ({ user: x.user, token: x.token })) });
  homeConfig();
  // ⑦ ROUND 3: the CA named ONLY in the HOME config (`http.sslCAInfo`) is not read — the clone fails on the certificate; through
  // the egress door (the hub's GIT_SSL_CAINFO, ②–⑥ above) it is trusted; a copy whose door lacks the name fails the same way: RED
  homeConfig(`[http]\n\tsslCAInfo = ${CAFILE}\n`);
  delete process.env.GIT_SSL_CAINFO;
  const n7 = seen.length;
  const g = await swept(ins.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(g.err && g.err.code === 'plugin_git_failed' && /certificate|SSL|TLS/i.test(g.err.message) && seen.length === n7 && g.hits.length === 0, 'round 3: the CA named only in the HOME config\'s http.sslCAInfo is NOT read (GIT_CONFIG_GLOBAL=/dev/null) — git refuses the server\'s certificate before any request: plugin_git_failed by name', g.err && g.err.message);
  process.env.GIT_SSL_CAINFO = CAFILE;
  homeConfig();
  const AES = fs.readFileSync(path.join(REPO, 'src/agent-env.js'), 'utf8');
  const caAnchor = ", 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH']);", reqAnchor = "const { serviceEnv } = require('../agent-env.js');";
  const aeNoCa = MC.write('src/agent-env.js', AES.replace(caAnchor, ']);'), 'no-git-ca');
  const insC = MC.load('src/server/plugin-install.js', SRC.replace(reqAnchor, `const { serviceEnv } = require(${JSON.stringify(aeNoCa)});`), 'no-git-ca').create({ rootDir: IR, log: { log() {}, warn() {} }, integrations: () => store, gitBin: GIT, gitTimeoutMs: 30000 });
  const n7b = seen.length;
  const gc = await swept(insC.install({ source: 'git', value: URL_H, ref: 'v2', credential: 'plugin-git' }));
  ok(AES.includes(caAnchor) && SRC.includes(reqAnchor) && gc.err && gc.err.code === 'plugin_git_failed' && /certificate|SSL|TLS/i.test(gc.err.message) && seen.length === n7b, 'control: a copy whose egress door lacks GIT_SSL_CAINFO / GIT_SSL_CAPATH fails the very clone ②–⑥ make (the hub names the CA, git never sees it) — RED', gc.err && gc.err.message);
} finally {
  srv.close(); evil.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
