#!/usr/bin/env node
// test-frp-plugin — the frp plugin (B-0b60 public exposure) in TWO parts:
//   ① THE INSTANCE'S RELAY IDENTITY (lane relay-token-per-instance, design q-051 — the owner's decision 2026-10-20), always:
//      a child process with a clean env (scratch HOME, its own frpc admin port — never the box's frpc), the REAL
//      PluginManager / vault engine / For-you store over scratch data dirs, a FAKE frpc that records what it was given
//      (sha256s only) and answers the admin API like a relay that asks — or no longer asks — the shared token:
//      a  the first start MINTS data/relay-token.json (0600); frpc.toml names `user` + `metadatas.token` / `auth.token` as
//         env templates; the tokens ride the frpc child's env only — no argv, no other file, no log line, no status JSON;
//         a publish runs (frps's `<user>.` name form matched); the hub's name rule refuses a name not its own
//      b RESTART with the vault LOCKED while the relay still asks the shared token: frpc starts on the instance's own
//         token (the knock waits), the refusal is read (`knock_refused`), the vault entry is KEPT (the relay is never
//         lost) and the unlock restarts frpc with the knock
//      c RESTART with the vault LOCKED once the relay no longer asks it (its grace over, or its plugin vouching): the
//         public URL is re-published WITHOUT the second password; the knock retires at the next unlock (frp:token
//         dropped, RETIRE_ID recorded) and frpc never sends it again
//      d a name the relay refuses (`name_in_use:<label>`) ⇒ ONE For-you item per name, never the token
//      e revoke ⇒ the record keeps its id, no token, frpc stops, start / publish refused by name; mint again ⇒ same id,
//         new token; rotate while running ⇒ frpc restarted on the next token
//      f a fleet pod: the cluster's token (env) + its own name — no record minted; the card's doors refused by name
//      census: the instance tokens in data/relay-token.json alone, the shared one in no file in the clear, no journal line
//      g MUTANTS ⇒ RED: the token written into frpc.toml · the old locked-vault rule at start · the knock retired early
//      h THE INCIDENT (lane frp-token-proof, 2026-10-30 — frps 0.70.0 behind a VOUCHING plugin: a frpc without the shared
//         token is taken and dropped at once; the fake frpc logs `login to server success` at its backoff, no proxy starts):
//         the hub restarts with the vault LOCKED ⇒ ③ the status EXPECTS the restart at the unlock; ④ every publish fails BY
//         NAME at once (relay_login_dropped, the owner's words — never «DNS», no TCP port walk), ONE For-you item (the Public
//         URLs door), one journal line; the Ports manager and instance-url over the real plugin say the words, the Ports
//         manager once; ① nothing recorded, nothing retired, the vault entry KEPT; ② the unlock restarts frpc WITH the
//         token, the URL is back, the item done. (c above: ⑤ the retirement is SAID — one item naming frp:token.) The base
//         (4ef7e9494) fails h by name: its RED/GREEN table is frp-token-proof/report.md
//   ①p the SAME hub launched from a POLLUTED env (lane frp-spawn-env-allowlist — planted now, whatever env the suite runs from:
//      an agent conversation's session tokens, the cluster's shared token, a cloud key, proxies): frpc's env holds the kept
//      names + the two relay variables only, none of the planted names or values — MUTANT the pre-fix copy of process.env ⇒ RED
//   ①c A FLEET POD RESTARTS (lane fleet-instance-publish — a fleet canary red 2026-10-20: the pod's boot restore of its instance
//      URL refused «the frp relay is not configured on this instance» while frpc ran): the pod's env (VIBESPACE_INSTANCE_NAME +
//      VIBESPACE_FRPS_*), the vault SET UP and LOCKED, data/instance-url.json desired — the REAL instance-url over the object
//      server.js hands it (its text, read from server.js), the server's order (the restore's first try 3 s, the boot replay 5 s):
//      published at the boot and at the restart, the knock = the ENV token (never the vault's); RED CONTROL = the base's two lines
//      (refused twice, the second try after frpc ran — the order is not the cause); the vault's unlock re-tries a restore the
//      lock refused (the wiring's own line; MUTANT no pull-forward ⇒ RED); AFTER THE GRACE (no env token) the plugin's own boot
//      replay starts the relay on the identity alone and the URL comes back (MUTANT the env-token-only default-on ⇒ RED)
//   ② LIVE against the REAL frps relay (needs VIBESPACE_FRPS_* or VIBESPACE_FRP_SECRETS → a private frps-secrets.env):
//      installs frpc, publishes a local echo server, verifies the public URL round-trips. Skips if no relay config.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

// pull relay config from the private secrets file if not in env
if (!process.env.VIBESPACE_FRPS_ADDR) {
  // Never a hardcoded private path in the public repo — the runner supplies it.
  const sec = process.env.VIBESPACE_FRP_SECRETS || path.join(os.homedir(), '.config/vibespace/frps-secrets.env');
  try {
    const suffix = { FRPS_SERVER: 'ADDR', FRPS_BIND_PORT: 'PORT', FRPS_TOKEN: 'TOKEN' };
    for (const line of fs.readFileSync(sec, 'utf-8').split('\n')) {
      const m = line.match(/^(FRPS_\w+)=(.*)$/); if (!m || !suffix[m[1]]) continue;
      process.env['VIBESPACE_FRPS_' + suffix[m[1]]] = m[2];
    }
  } catch {}
}

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n      ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes('--hub')) { await hubLegs(); process.exit(failed ? 1 : 0); }
/** one hub child: scratch HOME, its own frpc admin port, the launching env minus the relay's own names (+ `plant`) */
async function hubChild(tag, args = [], plant = {}) {
  const root = scratch(tag);
  fs.mkdirSync(path.join(root, 'home'), { recursive: true });
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^VIBESPACE_(FRPS_|FRP_|RELAY_|INSTANCE_NAME$)/.test(k)));
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--hub', ...args], { stdio: 'inherit', env: { ...env, ...plant, HOME: path.join(root, 'home'), FRP_HUB_ROOT: root, VIBESPACE_FRP_ADMIN_PORT: String(port), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, timeout: 300e3 });
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
  return r;
}
{
  console.log('① THE INSTANCE\'S RELAY IDENTITY (a child: scratch HOME, its own frpc admin port, a fake frpc)');
  const r = await hubChild('frp-hub');
  check('① the relay-identity legs passed (the child exited 0)', r.status === 0, `exit ${r.status}${r.signal ? ' ' + r.signal : ''}`);
}
{
  // the launching shell an agent conversation leaves behind, PLANTED (values built now): the leg «frpc's env carries the instance
  // token and the knock» went RED only when the suite ran from such a shell — this child proves it from any env
  console.log('①p THE SAME HUB LAUNCHED FROM A POLLUTED ENV (planted: an agent conversation\'s session tokens, the cluster\'s shared token, a cloud key, proxies)');
  const rnd = () => crypto.randomBytes(8).toString('hex');
  const plant = { VIBESPACE_SESSION_TOKEN: 'vs-sess-' + rnd(), CLAUDE_CODE_MESSAGING_TOKEN: 'cc-msg-' + rnd(), VIBESPACE_FRPS_TOKEN: 'frps-shared-' + rnd(), AWS_SECRET_ACCESS_KEY: 'aws-' + rnd(), HTTPS_PROXY: 'http://u:' + rnd() + '@127.0.0.1:9' };
  const r = await hubChild('frp-hub-p', ['--polluted'], { ...plant, http_proxy: 'http://127.0.0.1:9', FRP_HUB_PLANTED: Object.keys(plant).join(',') });
  check('①p the polluted-env legs passed (the child exited 0)', r.status === 0, `exit ${r.status}${r.signal ? ' ' + r.signal : ''}`);
}
{
  // lane fleet-instance-publish: the pod's env shape, PLANTED for the child (the relay address on loopback — the fake frpc
  // never dials; the shared token a value built now)
  console.log('①c A FLEET POD RESTARTS (the cluster\'s relay env, the vault SET UP and LOCKED, a desired instance URL — instance-url over server.js\'s own object)');
  const pod = { VIBESPACE_INSTANCE_NAME: 'podx', VIBESPACE_FRPS_ADDR: '127.0.0.1', VIBESPACE_FRPS_PORT: '7000', VIBESPACE_FRPS_TOKEN: 'frps-cluster-' + crypto.randomBytes(8).toString('hex'), VIBESPACE_FRPS_SUBDOMAIN_HOST: 'frp.example.invalid' };
  const r = await hubChild('frp-hub-c', ['--cluster'], pod);
  check('①c the fleet-pod restart legs passed (the child exited 0)', r.status === 0, `exit ${r.status}${r.signal ? ' ' + r.signal : ''}`);
}

/** THE FAKE frpc: records what it was given (sha256s of the env tokens, never a value), logs a login the way frpc does, and
 *  answers the admin API (reload / status) like a relay that asks — or no longer asks — the shared token (relay-mode.json) */
function fakeFrpc(MODE, SAW) {
  return `#!${process.execPath}
const fs = require('fs'), http = require('http'), path = require('path'), crypto = require('crypto');
const a = process.argv.slice(2), conf = a[a.indexOf('-c') + 1], text = fs.readFileSync(conf, 'utf8');
const get = (k) => { const m = text.match(new RegExp('^' + k.replace(/\\./g, '\\\\.') + ' = (.*)$', 'm')); return m ? m[1].replace(/^"|"$/g, '') : null; };
const sha = (v) => (v ? crypto.createHash('sha256').update(v).digest('hex') : null);
const knock = process.env.VIBESPACE_FRP_AUTH_TOKEN || '', relay = process.env.VIBESPACE_RELAY_TOKEN || '';
const user = get('user'), port = Number(get('webServer.port')), log = get('log.to');
const inc = (text.match(/^includes = \\["(.*)\\/\\*\\.toml"\\]$/m) || [])[1];
const knockSent = /^auth\\.token = /m.test(text) && !!knock;
const mode = () => { try { return JSON.parse(fs.readFileSync(${JSON.stringify(MODE)}, 'utf8')); } catch { return {}; } };
const m0 = mode();
const loggedIn = !(m0.askKnock && !knockSent);
// lane frp-token-proof: frps 0.70.0 behind a VOUCHING plugin — a frpc WITHOUT the shared token is taken, then dropped at once
// (the control is keyed with auth.token): frpc logs the next login at its fast backoff, and no proxy ever starts
const dropped = !!m0.dropKnockless && !knockSent;
const LOGIN = '2026-10-30 05:00:06.000 [I] [client/service.go:328] [fake] login to server success, get run id [fake]\\n';
fs.appendFileSync(${JSON.stringify(SAW)}, JSON.stringify({ pid: process.pid, argv: process.argv.slice(1), knockSha: sha(knock), relaySha: sha(relay), user, conf: text, tokenEnv: Object.keys(process.env).filter((k) => /TOKEN/.test(k)).sort(), envKeys: Object.keys(process.env).sort(), envSha: Object.values(process.env).map(sha).filter(Boolean) }) + '\\n');
fs.appendFileSync(log, loggedIn ? '2026-10-20 08:00:00.000 [I] [client/service.go:310] login to server success, get run id [fake]\\n' : "2026-10-20 08:00:00.000 [W] [client/service.go:301] connect to server error: token in login doesn't match token from configuration\\n");
if (dropped) { let k = 0; const t = setInterval(() => { fs.appendFileSync(log, LOGIN); if (++k >= 200) clearInterval(t); }, 100); }
const started = new Set();
const proxies = () => { if (!inc) return []; const out = []; for (const f of fs.readdirSync(inc).filter((x) => x.endsWith('.toml'))) { const t = fs.readFileSync(path.join(inc, f), 'utf8'); out.push({ name: (t.match(/^name = "(.*)"$/m) || [])[1], type: (t.match(/^type = "(.*)"$/m) || [])[1], sub: (t.match(/^subdomain = "(.*)"$/m) || [])[1] }); } return out; };
const srv = http.createServer((q, s) => {
  const m = mode();
  if (q.url.startsWith('/api/reload')) { s.end(''); return; }
  if (q.url.startsWith('/api/status')) {
    const st = { tcp: [], http: [] };
    for (const p of proxies()) {
      const shown = m.prefix !== false && user ? user + '.' + p.name : p.name;
      const row = !loggedIn || dropped ? { name: shown, type: p.type, status: 'wait start', err: '' }
        : p.sub && m.taken && m.taken[p.sub] ? { name: shown, type: p.type, status: 'start error', err: 'new proxy [' + shown + '] error: name_in_use:' + m.taken[p.sub] }
          : { name: shown, type: p.type, status: 'running', err: '' };
      (st[p.type] = st[p.type] || []).push(row);
      if (row.status === 'running' && !started.has(shown)) { started.add(shown); fs.appendFileSync(log, '2026-10-30 05:00:07.000 [I] [client/control.go:165] [fake] [' + shown + '] start proxy success\\n'); }
    }
    s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(st)); return;
  }
  s.statusCode = 404; s.end();
});
srv.on('error', (e) => { if (e.code === 'EADDRINUSE') setTimeout(() => srv.listen(port, '127.0.0.1'), 50); else throw e; });
srv.listen(port, '127.0.0.1');
process.on('SIGTERM', () => process.exit(0));
`;
}

async function hubLegs() {
  const ROOT = process.env.FRP_HUB_ROOT;
  const R = (rel) => require(path.join(REPO, rel));
  const PM = R('src/plugins.js');
  const VE = R('src/server/vault-engine.js');
  const { wireVaultHooks } = R('src/server/vault-hooks.js');
  const RT = R('src/relay-token.js');
  const { UserTodoManager } = R('src/user-todos.js');
  const FRP_PATH = path.join(REPO, 'src/plugins/frp.js');
  const CHEAP = { N: 1024, r: 8, p: 1 };
  const PW = 'correct horse battery staple';
  const quiet = { log() {}, warn() {}, error() {} };
  const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const ADMIN = Number(process.env.VIBESPACE_FRP_ADMIN_PORT);
  const PDIR = path.join(process.env.HOME, '.vibespace', 'plugins', 'frp');
  fs.mkdirSync(path.join(PDIR, 'bin'), { recursive: true });
  const MODE = path.join(ROOT, 'relay-mode.json'), SAW = path.join(ROOT, 'frpc-saw.jsonl');
  const setMode = (m) => fs.writeFileSync(MODE, JSON.stringify(m));
  fs.writeFileSync(path.join(PDIR, 'bin', 'frpc'), fakeFrpc(MODE, SAW), { mode: 0o755 });
  const KNOCK = 'frp-shared-knock-' + crypto.randomBytes(8).toString('hex');
  const sawAll = () => { try { return fs.readFileSync(SAW, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const portUp = () => new Promise((res) => { const c = net.connect(ADMIN, '127.0.0.1', () => { c.destroy(); res(true); }); c.on('error', () => res(false)); });
  const nextSaw = async (n, ms = 6000) => { for (let i = 0; i < ms / 25; i++) { const all = sawAll(); if (all.length > n) { for (let j = 0; j < 200 && !(await portUp()); j++) await sleep(20); return all[all.length - 1]; } await sleep(25); } return null; };
  const pidOf = () => { try { return Number(fs.readFileSync(path.join(PDIR, 'frpc.pid'), 'utf8')); } catch { return 0; } };
  const alive = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('frpc'); } catch { return false; } };
  /** "the machine went down": frpc killed under the hub (no stop verb), the port free again */
  const killFrpc = async () => { for (const s of sawAll()) if (alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } for (let i = 0; i < 200 && ((await portUp()) || sawAll().some((s) => alive(s.pid))); i++) await sleep(20); };
  const settingsStore = (() => { let mem = {}; return { read: () => mem, patch: (p) => { mem = { ...mem, ...p }; for (const [k, v] of Object.entries(mem)) if (v === null) delete mem[k]; } }; })();
  // every journal line the plugin writes while the legs run (the token census reads them)
  const logs = [];
  const keep = { log: console.log, warn: console.warn };
  for (const k of ['log', 'warn']) console[k] = (...a) => { const t = a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '); logs.push(t); if (!/^\[(plugins|vault|migrate)\]/.test(t)) keep[k](...a); };
  const forms = (v) => { const b = Buffer.from(String(v)); return [String(v), b.toString('hex'), b.toString('base64'), b.toString('base64url')].filter((x) => x.length >= 8); };
  const leaks = (text, vals) => vals.filter(Boolean).some((v) => forms(v).some((f) => String(text).includes(f)));
  const walk = (d, out = []) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
  const filesHolding = (vals) => walk(ROOT).filter((f) => { let t = ''; try { t = fs.readFileSync(f, 'latin1'); } catch { return false; } return leaks(t, vals); }).map((f) => path.relative(ROOT, f));
  const boot = ({ dataDir, def = null, ut = null }) => {
    const v = VE.create({ dataDir, kdf: CHEAP, log: quiet, idleTimer: false });
    const pm = new PM.PluginManager({ dataDir, settings: settingsStore, forYou: () => ut, ...(def ? { plugins: [def] } : {}) });
    if (ut) ut.setPluginGate((id) => !!((pm.defs()[id] || {}).provides || []).includes('reminders'));
    wireVaultHooks({ vault: v, plugins: pm, log: quiet });
    return { v, pm };
  };
  const mutantDef = (mutate) => {
    const src = fs.readFileSync(FRP_PATH, 'utf8'), out = mutate(src);
    if (out === src) return null;
    const m = new Module(FRP_PATH, null); m.filename = FRP_PATH; m.paths = Module._nodeModulePaths(path.dirname(FRP_PATH));
    m._compile(out, FRP_PATH);
    return m.exports;
  };
  const recOf = (D) => { try { return RT.parse(fs.readFileSync(path.join(D, RT.FILE), 'utf8')); } catch { return null; } };
  const pjOf = (D) => { try { return JSON.parse(fs.readFileSync(path.join(D, 'plugins.json'), 'utf8')).plugins.frp || {}; } catch { return {}; } };
  /** a hub's FIRST boot: the vault set up, the shared token sealed (the owner's override), the relay started, one publish */
  async function firstBoot(tag, { def = null, ut = null } = {}) {
    const D = path.join(ROOT, tag, 'data'); fs.mkdirSync(D, { recursive: true });
    const { v, pm } = boot({ dataDir: D, def, ut });
    await v.setup(PW, {});
    pm.setConfig('frp', { serverAddr: 'relay.example.invalid', subDomainHost: 'relay.example.invalid' });
    pm.setConfig('frp', { token: KNOCK });
    pm.setEnabled('frp', true);
    setMode({ askKnock: true, prefix: true });
    const n = sawAll().length;
    pm.start('frp');
    const saw = await nextSaw(n);
    let pub = null, pubErr = null;
    try { pub = await pm.frpPublish('vibespace-instance', 3456, { proto: 'http' }); } catch (e) { pubErr = e; }
    return { D, v, pm, saw, rec: recOf(D), pub, pubErr, sub: pub && pub.subdomain };
  }
  /** the hub RESTARTS (a new engine — LOCKED — and a new manager over the same data dir) after frpc died with the machine */
  async function restart(prev, { askKnock, def = null, ut = null, mode = {} }) {
    await killFrpc();
    try { prev.v.close(); } catch { }
    setMode({ askKnock, prefix: true, ...mode });
    const { v, pm } = boot({ dataDir: prev.D, def, ut });
    const st0 = pm.status('frp');
    const n = sawAll().length;
    pm.bootReplay();
    const saw = await nextSaw(n, 4000);
    let pub = null, pubErr = null;
    if (saw) { try { pub = await pm.frpPublish('vibespace-instance', 3456, { proto: 'http', preferSub: prev.sub || '' }); } catch (e) { pubErr = e; } }
    return { D: prev.D, v, pm, st0, saw, pub, pubErr, sub: prev.sub };
  }
  const ut = new UserTodoManager({ dataDir: path.join(ROOT, 'todos'), expirySweepMs: 0 });
  fs.mkdirSync(path.join(ROOT, 'todos'), { recursive: true });
  try {
    if (process.argv.includes('--cluster')) {
      const KN = process.env.VIBESPACE_FRPS_TOKEN, URL0 = 'https://podx-vibespace.frp.example.invalid/';
      const IU = R('src/server/instance-url.js'), IU_PATH = path.join(REPO, 'src/server/instance-url.js');
      const compiled = (file, text) => { const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(text, file); return m.exports; };
      // THE OBJECT server.js HANDS instance-url (its text — the wiring under test, never a copy written here)
      const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
      const HANDED = (SV.match(/require\('\.\/src\/server\/instance-url\.js'\)\.create\(\{[^\n]*?\bplugins: (\{[^{}\n]*\})/) || [])[1] || null;
      check('server.js\'s object for instance-url is read from its text (the wiring under test)', !!HANDED, 'no `plugins: { … }` in instance-url\'s create() call');
      const handedOf = (text, pm) => new Function('plugins', `return (${text});`)(pm);
      const podDir = (tag) => { const D = path.join(ROOT, tag, 'data'); fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(path.join(D, 'instance-url.json'), JSON.stringify({ desired: true, sub: 'podx-vibespace' })); return D; };
      /** the vault SET UP, then closed (the next engine finds it LOCKED); `seal` = the owner's override sealed into it */
      const setUpLocked = async (D, { seal = null } = {}) => {
        const v = VE.create({ dataDir: D, kdf: CHEAP, log: quiet, idleTimer: false });
        await v.setup(PW, {});
        if (seal) new PM.PluginManager({ dataDir: D, settings: settingsStore }).setConfig('frp', { token: seal });
        v.close();
      };
      /** THE POD BOOTS in server.js's order: instance-url's restore (its first try at 3 s), the plugins' boot replay at 5 s */
      const podBoot = async (D, { def = null, iuMod = IU, text = HANDED, delayMs = 20000, waitMs = 9000, until = null } = {}) => {
        const { v, pm } = boot({ dataDir: D, def });
        const iu = iuMod.create({ dataDir: D, port: 3456, plugins: handedOf(text, pm), serverSetting: () => null, authEnabled: () => true, log: () => { } });
        const n = sawAll().length, t0 = Date.now();
        const done = until || ((s) => s.published && !s.error && (s.at || 0) >= t0);   // published IN THIS BOOT (a restart reads the last one from disk)
        iu.restore({ retries: 2, delayMs });
        const br = setTimeout(() => { try { pm.bootReplay(); } catch { } }, 5000);
        let st = iu.status();
        while (Date.now() - t0 < waitMs && !done(st)) { await sleep(100); st = iu.status(); }
        return { D, v, pm, iu, st, t0, br, saws: () => sawAll().slice(n) };
      };
      const podDown = async (P) => { clearTimeout(P.br); P.iu.stop(); await killFrpc(); try { P.v.close(); } catch { } };
      const proxyOf = async (user) => { try { const st = await (await fetch(`http://127.0.0.1:${ADMIN}/api/status`)).json(); return (st.http || []).find((p) => p.name === `${user}.vibespace-instance`) || null; } catch { return null; } };

      console.log('  c1 — a fresh pod restarts: the vault LOCKED, the instance URL desired');
      setMode({ askKnock: true, prefix: true });
      const DA = podDir('pod');
      await setUpLocked(DA);
      const A = await podBoot(DA);
      const recA = recOf(DA), sA = A.saws();
      check('the vault is SET UP and LOCKED through the whole boot (never unlocked)', A.v.state() === 'locked', A.v.state());
      check(`THE CANARY: the desired instance URL is PUBLISHED at the boot — ${URL0}, no error (was «the frp relay is not configured on this instance»)`, A.st.published && A.st.url === URL0 && !A.st.error && A.st.desired && A.st.at >= A.t0, JSON.stringify({ url: A.st.url, error: A.st.error }));
      check('instance-url reads the relay as the plugin does: configured on both, no read error', A.st.frpConfigured === true && A.pm.status('frp').configured === true && A.st.frpReadError === null, JSON.stringify({ iu: A.st.frpConfigured, plugin: A.pm.status('frp').configured, readError: A.st.frpReadError }));
      const tomlA = (() => { try { return fs.readFileSync(path.join(PDIR, 'proxies', 'vibespace-instance.toml'), 'utf8'); } catch { return ''; } })();
      const runA = recA ? await proxyOf(recA.instanceId) : null;
      check('the proxy: vibespace-instance on subdomain podx-vibespace, RUNNING at the relay as `<instance id>.vibespace-instance`', /^subdomain = "podx-vibespace"$/m.test(tomlA) && !!runA && runA.status === 'running', runA || tomlA);
      check('the pod minted its own identity at the boot; frpc logs in as it (user + its own token)', !!recA && !!sA[0] && sA[0].user === recA.instanceId && sA[0].relaySha === sha(recA.token), sA[0] && sA[0].user);
      check('THE KNOCK during the grace = the cluster\'s ENV token (frpc sent sha256(VIBESPACE_FRPS_TOKEN)) — never the vault\'s: no tokenSealed, the plugin not vault-locked, knock on', !!sA[0] && sA[0].knockSha === sha(KN) && !(pjOf(DA).config || {}).tokenSealed && A.pm.status('frp').vaultLocked === false && A.pm.status('frp').relay.knock === 'on', sA[0] && { knock: sA[0].knockSha === sha(KN), relay: A.pm.status('frp').relay.knock });
      await sleep(Math.max(0, 5600 - (Date.now() - A.t0)));
      check('ONE frpc for the boot: the restore started it, the boot replay at 5 s found it running', A.saws().length === 1, String(A.saws().length));
      await podDown(A);

      console.log('  c2 — the pod restarts again (its identity on disk, the vault still LOCKED)');
      const B = await podBoot(DA);
      const sB = B.saws();
      check('the RESTART publishes again — the same URL, frpc as the same instance id, the knock the env token, the vault LOCKED', B.st.published && B.st.url === URL0 && !B.st.error && B.st.at >= B.t0 && !!sB[0] && sB[0].user === recA.instanceId && sB[0].knockSha === sha(KN) && B.v.state() === 'locked', JSON.stringify({ url: B.st.url, error: B.st.error, user: sB[0] && sB[0].user }));
      await podDown(B);

      console.log('  c3 — RED CONTROL = the base: instance-url\'s relay read + server.js\'s object as 2.369.214–.330 shipped them');
      {
        const src = fs.readFileSync(IU_PATH, 'utf8');
        const baseSrc = src.replace(/  const frp = \(\) => \{[^\n]*\n/, "  const frp = () => { try { return plugins ? plugins.status(plugins.providerId?.('relay')) : null; } catch { return null; } };\n");
        const baseText = HANDED ? HANDED.replace('relayStatus: () => plugins.relayStatus(),', 'status: (id) => plugins.status(id),') : null;
        const IUB = baseSrc !== src && baseText && baseText !== HANDED ? compiled(IU_PATH, baseSrc) : null;
        const DC = podDir('pod-base');
        await setUpLocked(DC);
        const C = IUB ? await podBoot(DC, { iuMod: IUB, text: baseText, delayMs: 2500, waitMs: 7000, until: () => false }) : null;
        check('the base REFUSES the same restart «the frp relay is not configured on this instance» — its second try ran AFTER the boot replay started frpc (the order is not the cause), the plugin itself configured: RED', !!C && !C.st.published && C.st.error === 'the frp relay is not configured on this instance' && C.saws().length >= 1 && C.pm.status('frp').configured === true, C ? JSON.stringify({ published: C.st.published, error: C.st.error, frpc: C.saws().length }) : 'the control did not apply');
        if (C) await podDown(C);
      }

      console.log('  c4 — the vault\'s unlock re-tries a restore the lock refused (the second half)');
      const WR = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
      const HOOK = (WR.match(/^vault\.onUnlock\(\(\) => \{ try \{ instanceUrl\?\.restore\?\.\(\{ ifFailed: true \}\);[^\n]*$/m) || [])[0] || null;
      check('the wiring hands the vault\'s unlock to instance-url (its line, read from mounts-plugins-wiring.js)', !!HOOK, 'no vault.onUnlock(… instanceUrl?.restore?.({ ifFailed: true }) …) line');
      const sealedLeg = async (tag, iuMod) => {
        const D = podDir(tag);
        await setUpLocked(D, { seal: 'owner-override-' + crypto.randomBytes(8).toString('hex') });
        const S = await podBoot(D, { iuMod, waitMs: 3800, until: (s) => !!s.error });
        const before = { error: S.st.error, published: S.st.published, vaultLocked: S.st.frpVaultLocked };
        if (HOOK) new Function('vault', 'instanceUrl', HOOK)(S.v, S.iu);
        const tU = Date.now();
        await S.v.unlock(PW, {});
        let su = S.iu.status();
        while (Date.now() - tU < 6000 && !(su.published && !su.error && su.at >= tU)) { await sleep(100); su = S.iu.status(); }
        return { S, D, before, after: su, ms: Date.now() - tU };
      };
      const U = await sealedLeg('pod-sealed', IU);
      check('the relay\'s only key = the owner\'s override SEALED in the LOCKED vault (no identity yet): the boot\'s restore is refused BY THE LOCK — the plugin\'s words, never «not configured»', /vault is locked/.test(U.before.error || '') && !U.before.published && U.before.vaultLocked === true, JSON.stringify(U.before));
      check(`THE UNLOCK: the restore waiting on its 20 s timer is pulled forward — published ${U.ms} ms after the unlock (< 6 s), on the identity the unlock minted`, U.after.published && !U.after.error && U.after.at >= U.S.t0 && U.after.url === URL0 && U.ms < 6000 && !!recOf(U.D), JSON.stringify({ url: U.after.url, error: U.after.error, ms: U.ms }));
      await podDown(U.S);
      {
        const src = fs.readFileSync(IU_PATH, 'utf8');
        const mut = src.replace('    if (nextTry) { if (healTimer) { clearTimeout(healTimer); healTimer = setTimeout(nextTry, firstMs); } return; }\n', '    if (nextTry) return;\n');
        const M = mut !== src ? await sealedLeg('pod-sealed-m', compiled(IU_PATH, mut)) : null;
        check('MUTANT the unlock joins the waiting cycle (no pull-forward) ⇒ not published within 6 s of the unlock: RED', !!M && !(M.after.published && !M.after.error), M ? JSON.stringify({ published: M.after.published, ms: M.ms }) : 'the mutant did not apply');
        if (M) await podDown(M.S);
      }

      console.log('  c5 — AFTER THE GRACE: the chart drops VIBESPACE_FRPS_TOKEN — the identity serves alone');
      process.env.VIBESPACE_FRPS_TOKEN = '';
      setMode({ askKnock: false, prefix: true });
      const frpSrc = fs.readFileSync(FRP_PATH, 'utf8');
      const FRESH = compiled(FRP_PATH, frpSrc);   // frp.js reads its env at load
      const G = boot({ dataDir: DA, def: FRESH });
      const nG = sawAll().length;
      G.pm.bootReplay();
      const sawG = await nextSaw(nG);
      const stG = G.pm.status('frp');
      check('the plugin\'s OWN boot replay starts the relay: default-on (fromEnv: the cluster\'s address + this instance\'s identity), configured, frpc on its own token with NO knock', !!sawG && sawG.user === recA.instanceId && sawG.relaySha === sha(recA.token) && sawG.knockSha === null && stG.enabled === true && stG.fromEnv === true && stG.configured === true, JSON.stringify({ frpc: !!sawG, enabled: stG.enabled, fromEnv: stG.fromEnv, configured: stG.configured }));
      const iuG = IU.create({ dataDir: DA, port: 3456, plugins: handedOf(HANDED, G.pm), serverSetting: () => null, authEnabled: () => true, log: () => { } });
      const tG = Date.now();
      iuG.restore({ retries: 1, firstMs: 5 });
      let sg = iuG.status(); for (let i = 0; i < 80 && !(sg.published && !sg.error && sg.at >= tG); i++) { await sleep(100); sg = iuG.status(); }
      check('…and the instance URL is restored on it — the same URL, the vault LOCKED', sg.published && sg.url === URL0 && !sg.error && sg.at >= tG && G.v.state() === 'locked', JSON.stringify({ url: sg.url, error: sg.error }));
      iuG.stop(); await killFrpc(); try { G.v.close(); } catch { }
      {
        const mut = frpSrc.replace('fromEnv: !!(FRPS_ADDR && (FRPS_TOKEN || process.env[RT.CLUSTER_TOKEN_ENV] || ident.token)),', 'fromEnv: !!(FRPS_ADDR && (FRPS_TOKEN || process.env[RT.CLUSTER_TOKEN_ENV])),');
        const MG = mut !== frpSrc ? boot({ dataDir: DA, def: compiled(FRP_PATH, mut) }) : null;
        const nM = sawAll().length;
        if (MG) MG.pm.bootReplay();
        const sawM = MG ? await nextSaw(nM, 2500) : null;
        check('MUTANT the env-token-only default-on (the base) ⇒ after the grace the pod\'s relay is OFF at its restart — no frpc: RED', !!MG && !sawM && MG.pm.status('frp').enabled === false, MG ? JSON.stringify({ frpc: !!sawM, enabled: MG.pm.status('frp').enabled }) : 'the mutant did not apply');
        if (MG) { await killFrpc(); try { MG.v.close(); } catch { } }
      }
      return;
    }
    if (process.argv.includes('--polluted')) {
      console.log('  p — frpc\'s env is BUILT: nothing the launching shell planted reaches it');
      const planted = String(process.env.FRP_HUB_PLANTED || '').split(',').filter(Boolean);
      const KEEP = ['LANG', 'PATH', 'TMPDIR', 'VIBESPACE_FRP_AUTH_TOKEN', 'VIBESPACE_RELAY_TOKEN', 'http_proxy'];
      const verdict = (s) => (s && s.envKeys ? { extra: s.envKeys.filter((k) => !KEEP.includes(k)), names: planted.filter((k) => s.envKeys.includes(k)), values: planted.filter((k) => s.envSha.includes(sha(process.env[k]))) } : null);
      const clean = (v) => !!v && !v.extra.length && !v.names.length && !v.values.length;
      check('the planted names reached the hub (its process.env holds each one) — the leg is not vacuous', planted.length >= 5 && planted.every((k) => typeof process.env[k] === 'string' && process.env[k].length >= 16), planted);
      const P = await firstBoot('polluted');
      const vP = verdict(P.saw);
      check('frpc\'s env holds the kept names + the two relay variables ONLY — nothing else the hub carried', !!vP && !vP.extra.length, P.saw && P.saw.envKeys);
      check(`none of the planted names, none of their values (sha256) reached frpc: ${planted.join(' · ')}`, clean(vP), vP);
      check('the instance token + the knock DID (their sha256s), and `http_proxy` — the one proxy name frpc dials through — rode along', !!P.saw && !!P.rec && P.saw.relaySha === sha(P.rec.token) && P.saw.knockSha === sha(KNOCK) && P.saw.envKeys.includes('http_proxy'), P.saw && P.saw.envKeys);
      check('a publish still runs', !!P.pub, P.pubErr ? P.pubErr.message : P.pub);
      await killFrpc(); try { P.v.close(); } catch { }
      const MP = mutantDef((s) => s.replace("const env = RT.relayEnv(process.env, { token: cfg.ident.token || '', knock });", "const env = { ...process.env, [FRP_TOKEN_ENV]: knock, [RT.TOKEN_ENV]: cfg.ident.token || '' }; delete env.VIBESPACE_FRPS_TOKEN; delete env[RT.CLUSTER_TOKEN_ENV];"));
      const mp = MP ? await firstBoot('polluted-m', { def: MP }) : null;
      const vM = mp && verdict(mp.saw);
      check('MUTANT the pre-fix spawn env (a copy of process.env minus two names) ⇒ the planted session tokens reach frpc: RED', !!vM && vM.names.includes('VIBESPACE_SESSION_TOKEN') && vM.names.includes('CLAUDE_CODE_MESSAGING_TOKEN') && !clean(vM), vM || 'the mutant did not apply');
      if (mp) { await killFrpc(); try { mp.v.close(); } catch { } }
      return;
    }
    console.log('  a — the first start mints; the tokens ride frpc\'s env only');
    const A = await firstBoot('hub', { ut });
    const rec = A.rec;
    const st = A.pm.status('frp');
    check('the first start of a relay configured the shared way MINTS data/relay-token.json (0600, a parsed record)', !!rec && rec.token && (fs.statSync(path.join(A.D, RT.FILE)).mode & 0o777) === 0o600 && RT.ID_RE.test(rec.instanceId), rec && rec.instanceId);
    check('frpc.toml: `user = "<instance id>"` + `metadatas.token` + `auth.token` as frp env TEMPLATES', !!A.saw && A.saw.conf.includes(`user = "${rec.instanceId}"`) && A.saw.conf.includes('metadatas.token = "{{ .Envs.VIBESPACE_RELAY_TOKEN }}"') && A.saw.conf.includes('auth.token = "{{ .Envs.VIBESPACE_FRP_AUTH_TOKEN }}"'), A.saw && A.saw.conf);
    check('frpc\'s env carries the instance token and the knock (their sha256s as the fake saw them) — never VIBESPACE_FRPS_TOKEN beside them', !!A.saw && A.saw.relaySha === sha(rec.token) && A.saw.knockSha === sha(KNOCK) && JSON.stringify(A.saw.tokenEnv) === JSON.stringify(['VIBESPACE_FRP_AUTH_TOKEN', 'VIBESPACE_RELAY_TOKEN']), A.saw && A.saw.tokenEnv);
    check('no token on frpc\'s argv, none in its config', !!A.saw && !leaks(A.saw.argv.join(' '), [rec.token, KNOCK]) && !leaks(A.saw.conf, [rec.token, KNOCK]));
    check('a publish RUNS (frps\'s `<user>.<name>` form matched) — https://<sub>.<host>/', !!A.pub && /^https:\/\/vs[0-9a-f]{10}\.relay\.example\.invalid\/$/.test(A.pub.url), A.pubErr ? A.pubErr.message : A.pub);
    const pj = pjOf(A.D);
    check('the proxy ran under the instance\'s own identity (relayPublishedAt) while the knock was sent: no knockless proof yet, the vault entry KEPT', !!pj.relayPublishedAt && !pj.relayKnocklessAt && !pj.legacyRetired && A.v.secretGet('frp:token').value.toString() === KNOCK);
    check('the record keeps the subdomain the relay accepted (the card\'s names)', !!A.sub && (recOf(A.D).subdomains || []).includes(A.sub));
    const line = `relay-admin add ${rec.instanceId} ${sha(rec.token)} ${rec.label}`;
    check('the card: kind instance, the registration line = `relay-admin add <id> <sha256> <label>`, knock on, login ok', st.relay.kind === 'instance' && st.relay.lines[0] === line && st.relay.knock === 'on' && st.relay.login && st.relay.login.ok === true, st.relay);
    check('the status JSON — and the plugins list an agent could read — hold no form of either token', !leaks(JSON.stringify(A.pm.status('frp')), [rec.token, KNOCK]) && !leaks(JSON.stringify(A.pm.list()), [rec.token, KNOCK]));
    let ne = null; try { await A.pm.frpPublish('canary-fwd', 4001, { proto: 'tcp' }); } catch (e) { ne = e; }
    check('the hub\'s name rule refuses a proxy name that is not its own BEFORE the relay sees it (name_not_yours)', !!ne && ne.code === 'name_not_yours', ne && ne.message);
    const tcp = await A.pm.frpPublish('pf-local-4000', 4000, { proto: 'tcp' }).catch((e) => e);
    check('a TCP publish runs as well (pf-<host>-<port>)', tcp && /^tcp:\/\/relay\.example\.invalid:\d+$/.test(tcp.url || ''), tcp && (tcp.message || tcp));

    console.log('  b — restart, vault LOCKED, the relay still asks the shared token');
    const B = await restart(A, { askKnock: true, ut });
    check('LOCKED + an identity of its own: not the old vault door — configured, the knock waits (`knock: locked`)', B.st0.configured && !B.st0.vaultLocked && B.st0.relay.knock === 'locked' && B.st0.relay.kind === 'instance', { configured: B.st0.configured, vaultLocked: B.st0.vaultLocked, knock: B.st0.relay.knock });
    check('the boot replay STARTS frpc with the vault locked — its own token in its env, no knock, no auth.token line', !!B.saw && B.saw.relaySha === sha(rec.token) && B.saw.knockSha === null && !/^auth\.token/m.test(B.saw.conf), B.saw && { knock: B.saw.knockSha, conf: B.saw.conf });
    const loginB = B.pm.status('frp').relay.login;
    check('the relay still asking: the publish fails and the card reads the refusal (`knock_refused`)', !!B.pubErr && loginB && loginB.ok === false && loginB.code === 'knock_refused', { err: B.pubErr && B.pubErr.message, loginB });
    const n2 = sawAll().length;
    await B.v.unlock(PW, {});
    const sawB2 = await nextSaw(n2);
    check('the vault entry is KEPT (never retired before a knockless login) and the unlock restarts frpc WITH the knock', B.v.secretGet('frp:token').value.toString() === KNOCK && !!sawB2 && sawB2.knockSha === sha(KNOCK) && /^auth\.token/m.test(sawB2.conf), sawB2 && sawB2.knockSha);
    const pubB2 = await B.pm.frpPublish('vibespace-instance', 3456, { proto: 'http', preferSub: A.sub }).catch((e) => e);
    check('…and the public URL is back, the SAME subdomain', pubB2 && pubB2.url === A.pub.url, pubB2 && (pubB2.message || pubB2.url));

    console.log('  c — restart, vault LOCKED, the relay no longer asks the shared token');
    const C = await restart(B, { askKnock: false, ut });
    check('THE OWNER\'S PROPERTY: a restart with the vault LOCKED re-publishes the public URL — no second password', !!C.pub && C.pub.url === A.pub.url && C.v.state() !== 'unlocked', C.pubErr ? C.pubErr.message : C.pub);
    const pjC = pjOf(C.D);
    check('a proxy that RAN on the frpc started without the shared token is recorded — the proof, stamped with that frpc\'s run (lane frp-token-proof); the retirement waits for the vault (still sealed)', !!pjC.relayKnocklessAt && typeof pjC.relayKnocklessRun === 'string' && pjC.relayKnocklessRun === `${pjC.frpcRun && pjC.frpcRun.pid}@${pjC.frpcRun && pjC.frpcRun.at}` && !pjC.legacyRetired && pjC.config && pjC.config.tokenSealed === true, pjC);
    await C.v.unlock(PW, {});
    await sleep(100);
    const pjC2 = pjOf(C.D);
    check('the next unlock RETIRES the knock: the vault\'s frp:token dropped, tokenSealed gone, RETIRE_ID recorded', !C.v.secretGet('frp:token').value && !(pjC2.config || {}).tokenSealed && pjC2.legacyRetired && pjC2.legacyRetired.id === '2026-10-relay-token-per-instance', pjC2);
    check('the card says knock off + the retirement; frpc stayed up (no restart for a relay that already took it)', C.pm.status('frp').relay.knock === 'off' && !!C.pm.status('frp').relay.retired && C.pm.status('frp').running, C.pm.status('frp').relay);
    const retiredItems = ut.snapshot().open.filter((i) => i.origin === 'plugin' && i.plugin === 'frp' && /left this instance/.test(i.text));
    check('⑤ A DROP IS SAID: the retirement files ONE For-you item naming the vault entry (frp:token) and why — never silently (lane frp-token-proof)', retiredItems.length === 1 && retiredItems[0].text === 'The shared relay token (frp:token) left this instance' && /ran on a frpc started without it/.test(retiredItems[0].detail || '') && !leaks(JSON.stringify(retiredItems), [KNOCK]), retiredItems.map((i) => i.text));
    const n3 = sawAll().length;
    C.pm.stop('frp'); await sleep(150); C.pm.start('frp');
    const sawC3 = await nextSaw(n3);
    check('from then on frpc.toml holds no auth.token line and its env no knock', !!sawC3 && !/^auth\.token/m.test(sawC3.conf) && sawC3.knockSha === null, sawC3 && sawC3.conf);

    console.log('  d — a name the relay refuses ⇒ ONE For-you item');
    setMode({ askKnock: false, prefix: true, taken: { vsheldbyother: 'other-hub' } });
    const e1 = await C.pm.frpPublish('pf-local-5000', 5000, { proto: 'http', preferSub: 'vsheldbyother' }).catch((e) => e);
    const e2 = await C.pm.frpPublish('pf-local-5000', 5000, { proto: 'http', preferSub: 'vsheldbyother' }).catch((e) => e);
    const items = ut.snapshot().open.filter((i) => i.origin === 'plugin' && i.plugin === 'frp' && /public name/.test(i.text));
    check('the publish fails BY NAME (relay_refused, the holder named)', e1 && e1.code === 'relay_refused' && /other-hub/.test(e1.message) && e2 && e2.code === 'relay_refused', e1 && e1.message);
    check('ONE For-you item for the name (twice refused = the same item): origin plugin · frp · notice · high', items.length === 1 && items[0].text === 'The public name vsheldbyother is held by “other-hub” on the relay' && items[0].kind === 'notice' && items[0].urgency === 'high', items.map((i) => i.text));
    check('the item never holds a token', !leaks(JSON.stringify(ut.snapshot()), [recOf(C.D).token, KNOCK]));
    setMode({ askKnock: false, prefix: true });

    console.log('  e — revoke / mint again');
    const id0 = recOf(C.D).instanceId, tok0 = recOf(C.D).token;
    C.pm.setConfig('frp', { relay: 'revoke' });
    await sleep(150);
    const rv = recOf(C.D), stR = C.pm.status('frp');
    check('revoke: the record keeps its id, holds no token (revokedAt), frpc stopped', rv && rv.instanceId === id0 && rv.token === null && rv.revokedAt && !stR.running && !alive(pidOf()), { rv, running: stR.running });
    check('the card: kind revoked, the line `relay-admin revoke <id>`', stR.relay.kind === 'revoked' && JSON.stringify(stR.relay.lines) === JSON.stringify([`relay-admin revoke ${id0}`]), stR.relay);
    let se = null; try { C.pm.start('frp'); } catch (e) { se = e; }
    const pe = await C.pm.frpPublish('vibespace-instance', 3456, { proto: 'http' }).catch((e) => e);
    check('a revoked identity: start AND publish refused by name — never the shared token in its place (fail closed)', se && se.code === 'relay_revoked' && pe && pe.code === 'relay_revoked', se && se.message);
    C.pm.setConfig('frp', { relay: 'mint' });
    const rm = recOf(C.D), stM = C.pm.status('frp');
    check('mint again: the SAME id (owner Q3 — its names follow it), a new token; the card shows the add + rotate lines', rm && rm.instanceId === id0 && rm.token && rm.token !== tok0 && rm.revokedAt === null && stM.relay.lines.length === 2 && stM.relay.lines[1] === `relay-admin rotate ${id0} ${sha(rm.token)}`, stM.relay.lines);
    const n4 = sawAll().length;
    C.pm.start('frp');
    const sawE = await nextSaw(n4);
    check('frpc runs on the new token', !!sawE && sawE.relaySha === sha(rm.token));
    const n5 = sawAll().length;
    C.pm.setConfig('frp', { relay: 'rotate' });
    const sawE2 = await nextSaw(n5);
    check('rotate while running: frpc restarted (after the old one left) on the next token — the old one no longer used', !!sawE2 && sawE2.relaySha === sha(recOf(C.D).token) && sawE2.relaySha !== sha(rm.token));

    console.log('  f — a fleet pod: the cluster\'s token + its own name');
    await killFrpc();
    const CT = RT.mint({ randomBytes: crypto.randomBytes, now: Date.now(), label: 'c' }).token;
    process.env[RT.CLUSTER_TOKEN_ENV] = CT; process.env.VIBESPACE_INSTANCE_NAME = 'Pod-Alice';
    const DP = path.join(ROOT, 'pod', 'data'); fs.mkdirSync(DP, { recursive: true });
    const P = boot({ dataDir: DP });
    P.pm.setEnabled('frp', true);
    const n6 = sawAll().length;
    P.pm.start('frp');
    const sawP = await nextSaw(n6);
    check('the pod logs in as its own name with the cluster\'s token (env) — no record minted', !!sawP && sawP.user === 'pod-alice' && sawP.relaySha === sha(CT) && !fs.existsSync(path.join(DP, RT.FILE)) && P.pm.status('frp').relay.kind === 'cluster', sawP && sawP.user);
    let ce = null; try { P.pm.setConfig('frp', { relay: 'rotate' }); } catch (e) { ce = e; }
    check('the card\'s doors are refused by name on a pod (its identity is the cluster\'s)', ce && ce.code === 'relay_cluster', ce && ce.message);
    delete process.env[RT.CLUSTER_TOKEN_ENV]; delete process.env.VIBESPACE_INSTANCE_NAME;
    await killFrpc();
    try { P.v.close(); } catch { }

    console.log('  f2 — an OLDER build\'s frpc survives the hub upgrade: the boot replay mints and restarts it onto the identity');
    {
      const DO = path.join(ROOT, 'upgrade', 'data'); fs.mkdirSync(DO, { recursive: true });
      const O = boot({ dataDir: DO });
      await O.v.setup(PW, {});
      O.pm.setConfig('frp', { serverAddr: 'relay.example.invalid', subDomainHost: 'relay.example.invalid' });
      O.pm.setConfig('frp', { token: KNOCK });
      O.pm.setEnabled('frp', true);
      setMode({ askKnock: true, prefix: true });
      // what 2.369.324 left running: a frpc on the shared token alone (no user, no metadatas), its pid file, no frpcIdentity
      const legacyConf = path.join(ROOT, 'upgrade', 'frpc-old.toml');
      fs.writeFileSync(legacyConf, `serverAddr = "relay.example.invalid"\nserverPort = 7000\nauth.method = "token"\nauth.token = "{{ .Envs.VIBESPACE_FRP_AUTH_TOKEN }}"\nwebServer.addr = "127.0.0.1"\nwebServer.port = ${ADMIN}\nlog.to = "${path.join(PDIR, 'frpc.log')}"\nincludes = ["${path.join(PDIR, 'proxies')}/*.toml"]\n`);
      const n0 = sawAll().length;
      const old = spawnChild(path.join(PDIR, 'bin', 'frpc'), ['-c', legacyConf], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_FRP_AUTH_TOKEN: KNOCK } });
      old.unref(); fs.writeFileSync(path.join(PDIR, 'frpc.pid'), String(old.pid));
      const sawOld = await nextSaw(n0);
      O.v.close();
      const O2 = boot({ dataDir: DO });   // the upgraded hub: its vault LOCKED, the old frpc still running
      const n1 = sawAll().length;
      O2.pm.bootReplay();
      const recO = recOf(DO);
      check('the locked vault keeps the shared token closed: nothing is minted yet, the old frpc keeps running', !!sawOld && !sawOld.user && !recO && alive(old.pid), { minted: !!recO });
      await O2.v.unlock(PW, {});
      const sawNew = await nextSaw(n1);
      const recO2 = recOf(DO);
      check('the unlock MINTS and restarts the old frpc onto the identity (user + its own token), the knock still sent', !!recO2 && !!sawNew && sawNew.user === recO2.instanceId && sawNew.relaySha === sha(recO2.token) && sawNew.knockSha === sha(KNOCK) && !alive(old.pid), sawNew && { user: sawNew.user });
      const n2 = sawAll().length;
      O2.pm.bootReplay();
      await sleep(400);
      check('a second boot replay restarts nothing (once)', sawAll().length === n2);
      await killFrpc();
      try { O2.v.close(); } catch { }
    }

    console.log('  census — where the tokens are');
    const hold = filesHolding([recOf(C.D).token, rm.token, tok0, CT]);
    check('the instance tokens sit in data/relay-token.json alone — no other file under the scratch tree (frpc.toml, plugins.json, the vault, the For-you file, frpc.log)', JSON.stringify(hold) === JSON.stringify(['hub/data/relay-token.json']), hold);
    check('the shared token is in NO file in the clear (the vault holds its ciphertext, then nothing)', filesHolding([KNOCK]).length === 0, filesHolding([KNOCK]));
    check(`no journal line (${logs.length}) carries a token`, logs.length > 0 && !leaks(logs.join('\n'), [rec.token, rm.token, tok0, CT, KNOCK]), logs.filter((l) => leaks(l, [rec.token, KNOCK])).slice(0, 3));
    await killFrpc();
    try { C.v.close(); } catch { }

    console.log('  g — MUTANTS ⇒ RED');
    const M1 = mutantDef((s) => s.replace('...RT.frpcLines(cfg.ident),', '...RT.frpcLines(cfg.ident).map((l) => l.replace(/\\{\\{ \\.Envs\\.\\w+ \\}\\}/, cfg.ident.token || "")),'));
    const m1 = M1 ? await firstBoot('m1', { def: M1 }) : null;
    check('MUTANT the token written into frpc.toml ⇒ the config census goes RED', !!m1 && !!m1.saw && leaks(m1.saw.conf, [m1.rec.token]), m1 ? 'mutant applied' : 'the mutant did not apply');
    if (m1) { await killFrpc(); try { m1.v.close(); } catch { } }
    const M2 = mutantDef((s) => s.replace('if (cfg.vaultLocked) throw lockedRefusal(', 'if (cfg.vaultLocked || cfg.knockLocked) throw lockedRefusal(')); // int327: start()'s vault-locked throw routes through lockedRefusal (base .326 vault-locked-refusal-notice) after the frp.js merge
    const m2a = M2 ? await firstBoot('m2', { def: M2 }) : null;
    const m2 = m2a ? await restart(m2a, { askKnock: false, def: M2 }) : null;
    check('MUTANT the old locked-vault rule at start (the knock\'s lock blocks the relay) ⇒ the locked restart publishes nothing: RED', !!m2 && !m2.pub, m2 ? { started: !!m2.saw } : 'the mutant did not apply');
    if (m2) { await killFrpc(); try { m2.v.close(); } catch { } }
    const M3 = mutantDef((s) => s.replace('if (!knocklessProven(p) || !p.relayPublishedAt || p.legacyRetired) return false;', 'if (!p.relayPublishedAt || p.legacyRetired) return false;').replace('if (!p.relayKnocklessAt || !p.relayPublishedAt || p.legacyRetired) return false;', 'if (!p.relayPublishedAt || p.legacyRetired) return false;'));
    const m3 = M3 ? await firstBoot('m3', { def: M3 }) : null;
    check('MUTANT the knock retired once the own token published (no knockless proof) ⇒ the vault entry is gone while the relay still asks it — the relay would be lost at the next locked restart: RED', !!m3 && !!m3.pub && !m3.v.secretGet('frp:token').value, m3 ? { pub: !!m3.pub, entry: !!m3.v.secretGet('frp:token').value } : 'the mutant did not apply');
    if (m3) { await killFrpc(); try { m3.v.close(); } catch { } }

    console.log('  h — THE INCIDENT: frps 0.70.0 behind a vouching plugin — a frpc without the shared token is taken and dropped (lane frp-token-proof)');
    {
      const timed = (p, ms) => Promise.race([p.then((v) => ({ v }), (e) => ({ e })), sleep(ms).then(() => ({ timeout: true }))]);
      const OWNER = /^the relay accepts this instance's login but closes the connection right after \(\d+ logins since \d{4}-\d\d-\d\d \d\d:\d\dZ, no proxy started\) — the relay still requires the shared relay token, and this frpc runs without it because the vault was locked when it started\. Unlock the vault with the second password, or set the relay token again in Plugins › Public URLs\.$/;
      fs.mkdirSync(path.join(ROOT, 'todos-h'), { recursive: true });
      const utH = new UserTodoManager({ dataDir: path.join(ROOT, 'todos-h'), expirySweepMs: 0 });
      try {
        const H0 = await firstBoot('incident', { ut: utH });
        check('h0 the hub\'s first life: the shared token sealed, frpc WITH it, a publish runs (relayPublishedAt — the proof\'s half the old code paired with a login)', !!H0.pub && !!pjOf(H0.D).relayPublishedAt && !!H0.saw && H0.saw.knockSha === sha(KNOCK), H0.pubErr ? H0.pubErr.message : H0.pub);
        const logs0 = logs.length;
        // THE MACHINE WENT DOWN (the user manager died at 02:55): frpc died with it; the new hub boots with the vault LOCKED
        const H = await restart(H0, { askKnock: false, ut: utH, mode: { dropKnockless: true } });
        check('h1 the boot replay starts frpc with the vault LOCKED — its own token, NO shared token (the relay vouches it in)', !!H.saw && H.saw.knockSha === null && H.saw.relaySha === sha(H0.rec.token) && H.v.state() === 'locked', H.saw && { knock: H.saw.knockSha });
        const stH = H.pm.status('frp');
        check('③ NO KNOWINGLY TOKEN-LESS START: the status says frpc runs without the shared token while the vault is locked AND that the unlock restarts it with it (relay.restartAtUnlock, knock locked) — and the journal says so', stH.relay.knock === 'locked' && stH.relay.restartAtUnlock === true && logs.slice(logs0).some((l) => /frpc starts without the shared relay token \(the vault is locked\)/.test(l)), { knock: stH.relay.knock, restartAtUnlock: stH.relay.restartAtUnlock });
        check('④ the publish at the boot fails BY NAME — relay_login_dropped, the owner\'s words; never «is the domain / DNS set up?»', !!H.pubErr && H.pubErr.code === 'relay_login_dropped' && OWNER.test(H.pubErr.message) && !/DNS|public port/.test(H.pubErr.message), H.pubErr && { code: H.pubErr.code, msg: H.pubErr.message });
        const t1 = Date.now();
        const p2 = await timed(H.pm.frpPublish('vibespace-instance', 3456, { proto: 'http', preferSub: H0.sub }), 8000);
        const t2 = Date.now();
        const p3 = await timed(H.pm.frpPublish('pf-local-4000', 4000, { proto: 'tcp' }), 8000);
        const t3 = Date.now();
        check(`④ every later publish is refused AT ONCE (${t2 - t1} ms) — no 5 s poll per name — and a TCP publish walks no ports (${t3 - t2} ms; was «could not allocate a public port» after 10 × 4.8 s)`, !!p2.e && p2.e.code === 'relay_login_dropped' && t2 - t1 < 1500 && !!p3.e && p3.e.code === 'relay_login_dropped' && OWNER.test(p3.e.message) && t3 - t2 < 1500, { p2: p2.timeout ? 'timeout' : p2.e && p2.e.message, p3: p3.timeout ? 'timeout' : p3.e && p3.e.message, ms: [t2 - t1, t3 - t2] });
        const itemsH = () => utH.snapshot().open.filter((i) => i.origin === 'plugin' && i.plugin === 'frp');
        const dropItems = itemsH().filter((i) => /closes the connection right after/.test(i.text));
        check('④ ONE For-you item (high, notice): «The relay accepts this instance\'s login but closes the connection right after (N logins since <time>, no proxy started)» + why + what to do, its click opens Plugins › Public URLs', dropItems.length === 1 && /^The relay accepts this instance's login but closes the connection right after \(\d+ logins since .+, no proxy started\)$/.test(dropItems[0].text) && /vault was locked when it started\. Unlock the vault with the second password, or set the relay token again in Plugins › Public URLs\./.test(dropItems[0].detail || '') && dropItems[0].urgency === 'high' && JSON.stringify(dropItems[0].open) === JSON.stringify({ kind: 'plugin-settings', plugin: 'frp' }), itemsH().map((i) => [i.text, i.open]));
        const dropLines = logs.slice(logs0).filter((l) => /^\[plugins\]/.test(l) && /closes the connection right after/.test(l));   // the plugin's journal (the suite's own ✓ lines ride the same wrapper)
        check(`④ ONE journal line for the episode (three publishes: ${dropLines.length}) — never a line per forward per minute`, dropLines.length === 1, dropLines.map((l) => l.slice(0, 160)));
        const stD = H.pm.status('frp');
        check('④ the card reads the drop (relay.dropped: logins, since, why locked) — never «the relay knows it» on a login it closes', !!stD.relay.dropped && stD.relay.dropped.logins >= 3 && stD.relay.dropped.why === 'locked' && stD.relay.run && stD.relay.run.proxies === 0, stD.relay.dropped);
        // the re-publish loops over the REAL plugin: the Ports manager (heal sweep's _republish) and instance-url (restore)
        const { PortForwardManager } = R('src/port-forward.js');
        const pfLines = [];
        const pfDir = path.join(ROOT, 'incident', 'pf'); fs.mkdirSync(pfDir, { recursive: true });
        const pf = new PortForwardManager({ hosts: { list: () => [] }, dataDir: pfDir, plugins: H.pm, broadcast: () => { }, log: (l) => pfLines.push(String(l)), getJobs: () => null });
        clearInterval(pf._watch);
        const recsH = [];
        for (const port of [4101, 4102]) { const r = await pf.forward('__local__', port, { label: 'svc' }); const rec = pf._state.forwards.find((x) => x.id === r.id); rec.publicUrl = `http://relay.example.invalid:${20000 + port}/`; rec.publicProto = 'tcp'; recsH.push(rec); }
        for (let i = 0; i < 2; i++) for (const r of recsH) await timed(pf._republish(r), 8000);
        check('④ the Ports manager over the real plugin: two forwards × two sweeps ⇒ ONE line, each forward\'s error = the relay\'s words (no «DNS», no «public port»)', pfLines.filter((l) => /closes the connection right after/.test(l)).length === 1 && !pfLines.some((l) => /DNS|could not allocate/.test(l)) && recsH.every((r) => /closes the connection right after/.test(r.error || '')), { lines: pfLines.map((l) => l.slice(0, 120)), errors: recsH.map((r) => r.error) });
        const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
        const HANDED = (SV.match(/require\('\.\/src\/server\/instance-url\.js'\)\.create\(\{[^\n]*?\bplugins: (\{[^{}\n]*\})/) || [])[1] || null;
        const IU = R('src/server/instance-url.js');
        fs.writeFileSync(path.join(H.D, 'instance-url.json'), JSON.stringify({ desired: true, sub: H0.sub }));
        const iu = HANDED ? IU.create({ dataDir: H.D, port: 3456, plugins: new Function('plugins', `return (${HANDED});`)(H.pm), serverSetting: () => null, authEnabled: () => true, log: () => { } }) : null;
        if (iu) iu.restore({ retries: 1, firstMs: 5 });
        let si = iu ? iu.status() : null;
        for (let i = 0; iu && i < 100 && !si.error; i++) { await sleep(100); si = iu.status(); }
        if (iu) iu.stop();
        check('④ instance-url\'s restore over the real plugin (server.js\'s object) says the relay\'s words — never «DNS»', !!si && OWNER.test(si.error || '') && !/DNS/.test(si.error || ''), si && si.error);
        const pjH = pjOf(H.D);
        check('① PROOF IS A PROXY THAT RAN: a vouched login recorded NOTHING — no relayKnocklessAt, no run, nothing retired; the vault entry is still sealed', !pjH.relayKnocklessAt && !pjH.relayKnocklessRun && !pjH.legacyRetired && (pjH.config || {}).tokenSealed === true, { knocklessAt: pjH.relayKnocklessAt || null, retired: pjH.legacyRetired || null });
        // THE OWNER UNLOCKS (09:17:53 in the incident)
        const n7 = sawAll().length;
        await H.v.unlock(PW, {});
        const sawU = await nextSaw(n7, 6000);
        await sleep(150);
        const pjU = pjOf(H.D);
        check('① at the unlock nothing is dropped: frp:token still in the vault, legacyRetired unset, knock not off', !!(H.v.secretGet('frp:token').value || '').toString() && H.v.secretGet('frp:token').value.toString() === KNOCK && !pjU.legacyRetired && H.pm.status('frp').relay.knock === 'on', { retired: pjU.legacyRetired || null, knock: H.pm.status('frp').relay.knock });
        check('② AT UNLOCK THE TOKEN IS PUT BACK: frpc restarted WITH the shared token (its env carries it, frpc.toml has the auth.token template)', !!sawU && sawU.knockSha === sha(KNOCK) && /^auth\.token = "\{\{ \.Envs\.VIBESPACE_FRP_AUTH_TOKEN \}\}"$/m.test(sawU.conf), sawU && { knock: sawU.knockSha === sha(KNOCK) });
        const pubU = sawU ? await timed(H.pm.frpPublish('vibespace-instance', 3456, { proto: 'http', preferSub: H0.sub }), 8000) : { e: new Error('no frpc') };
        check('② …and the public URL is back, the SAME address', !!pubU.v && pubU.v.url === H0.pub.url, pubU.v ? pubU.v.url : (pubU.e && pubU.e.message) || 'timeout');
        const after = [...utH.snapshot().open, ...utH.snapshot().resolved];
        const di = after.find((i) => /closes the connection right after/.test(i.text || ''));
        check('④ the dropped-login item is DONE once a proxy ran (no open item left for it); the card no longer reads a drop', !!di && di.status === 'done' && !H.pm.status('frp').relay.dropped, { items: after.filter((i) => /closes the connection/.test(i.text || '')).map((i) => [i.id, i.status]), said: pjOf(H.D).relayDropSaid || null, dropped: H.pm.status('frp').relay.dropped });
        await killFrpc(); try { H.v.close(); } catch { }
      } finally { try { utH.stop(); } catch { } }
    }
  } catch (e) {
    check('the legs threw', false, e && e.stack);
  } finally {
    await killFrpc();
    try { ut.stop(); } catch { }
    console.log = keep.log; console.warn = keep.warn;
  }
}

if (!process.env.VIBESPACE_FRPS_ADDR || !process.env.VIBESPACE_FRPS_TOKEN) {
  console.log('② SKIP: no frp relay configured (set VIBESPACE_FRPS_ADDR/TOKEN)');
  console.log(failed ? `\n${failed} FAILED` : '\nfrp plugin test passed (① only)');
  process.exit(failed ? 1 : 0);
}
console.log('② LIVE against the real relay');
const { PluginManager } = require('../src/plugins.js');

const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-frp-')), broadcast: () => {} });
let echoSrv, published;
try {
  const st0 = pm.status('frp');
  check('plugin reports configured (relay env present)', st0.configured === true && st0.publicHost === process.env.VIBESPACE_FRPS_ADDR, JSON.stringify(st0));
  check('default-enabled when the cluster injects the relay env', st0.enabled === true && st0.fromEnv === true);

  // ── config model: user override wins over env, clearing falls back ──
  pm.setConfig('frp', { serverAddr: 'relay.example.com', serverPort: 7001 });
  let sc = pm.status('frp');
  check('user config overrides the env relay', sc.config.serverAddr === 'relay.example.com' && sc.config.serverPort === 7001);
  pm.setConfig('frp', { subDomainHost: 'preview.example.com' });
  check('subdomain host stored (switches publish to SNI mode)', pm.status('frp').subDomainHost === 'preview.example.com');
  pm.setEnabled('frp', false);
  check('user can disable the default-on plugin', pm.status('frp').enabled === false);
  pm.setEnabled('frp', true);
  // clear all overrides → back to the env defaults for the real publish below
  pm.setConfig('frp', { serverAddr: '', serverPort: '', subDomainHost: '' });
  sc = pm.status('frp');
  check('clearing overrides falls back to the env relay + TCP mode', sc.config.serverAddr === process.env.VIBESPACE_FRPS_ADDR && !sc.subDomainHost);

  await pm.install('frp');
  check('frpc installs', pm.status('frp').installed === true);

  pm.start('frp');
  await sleep(2000);
  check('frpc daemon starts + connects', pm.status('frp').running === true);

  // a local "dev server"
  const echoPort = await new Promise((res) => {
    echoSrv = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('PUB:'), d]))));
    echoSrv.listen(0, '127.0.0.1', () => res(echoSrv.address().port));
  });

  published = await pm.frpPublish('pf-canary-fwd', echoPort);   // a pf- name: the hub's name rule refuses any other once frpc logs in as its own identity
  // a raw-TCP echo backend is detected as tcp → IP:port mode (tcp:// scheme),
  // even with subDomainHost set (only HTTP backends get a routed subdomain)
  check('frpPublish returns a public URL', /^(?:tcp|https?):\/\/.+:\d+/.test(published.url || ''), JSON.stringify(published));
  check('raw-tcp echo published in IP:port mode', published.proto === 'tcp' && !!published.remotePort);

  // the public URL must round-trip through the relay back to our echo server
  const host = published.publicHost, port = published.remotePort;
  let reply = '';
  for (let i = 0; i < 10 && !reply.includes('PUB:hi'); i++) {
    reply = await new Promise((res) => {
      const c = net.connect(port, host, () => c.write('hi'));
      let b = ''; c.on('data', (d) => { b += d; if (b.includes('PUB:hi')) { c.end(); res(b); } });
      c.on('error', () => res('')); setTimeout(() => { try { c.destroy(); } catch {} res(b); }, 2500);
    });
    if (!reply.includes('PUB:hi')) await sleep(800);
  }
  check('bytes round-trip PUBLICLY through the relay', reply.includes('PUB:hi'), JSON.stringify(reply));

  await pm.frpUnpublish('pf-canary-fwd');
  await sleep(1500);
  // after unpublish the public port must STOP working
  const gone = await new Promise((res) => {
    const c = net.connect(port, host, () => c.write('hi'));
    let b = ''; c.on('data', (d) => { b += d; }); c.on('error', () => res(true));
    c.on('close', () => res(!b.includes('PUB:hi'))); setTimeout(() => { try { c.destroy(); } catch {} res(!b.includes('PUB:hi')); }, 2500);
  });
  check('unpublish closes the public port', gone === true);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { echoSrv?.close(); } catch {}
  try { await pm.frpUnpublish('pf-canary-fwd'); } catch {}
  try { pm.stop('frp'); } catch {}
}
// ── protocol detection (http / https / tcp) — decides subdomain vs IP:port ──
try {
  const net = await import('node:net'); const tls = await import('node:tls');
  const { execSync } = await import('node:child_process'); const fsx = await import('node:fs');
  const httpS = (await import('node:http')).createServer((q, s) => s.end('ok'));
  await new Promise((r) => httpS.listen(0, '127.0.0.1', r));
  const tmp = fsx.mkdtempSync(scratch('frp-probe') + '-');
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${tmp}/k.pem -out ${tmp}/c.pem -days 1 -nodes -subj /CN=localhost 2>/dev/null`);
  const httpsS = (await import('node:https')).createServer({ key: fsx.readFileSync(`${tmp}/k.pem`), cert: fsx.readFileSync(`${tmp}/c.pem`) }, (q, s) => s.end('ok'));
  await new Promise((r) => httpsS.listen(0, '127.0.0.1', r));
  const rawS = net.createServer((s) => s.on('data', () => s.write('PONG'))); await new Promise((r) => rawS.listen(0, '127.0.0.1', r));
  check('http backend detected', (await pm._probeProto(httpS.address().port)) === 'http');
  check('https backend detected', (await pm._probeProto(httpsS.address().port)) === 'https');
  check('raw-tcp backend detected', (await pm._probeProto(rawS.address().port)) === 'tcp');
  httpS.close(); httpsS.close(); rawS.close(); fsx.rmSync(tmp, { recursive: true, force: true });
} catch (e) { failed++; console.error('  ✗ proto probe threw:', e.message); }

console.log(failed ? `\n${failed} FAILED` : '\nfrp plugin test passed');
process.exit(failed ? 1 : 0);
