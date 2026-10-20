#!/usr/bin/env node
// agentEnv() contract test (2.227.12) — the sanitizer that keeps the server's
// container runtime env (and the instance's chart-injected SECRETS) out of
// agent sessions. Two guarantees, both load-bearing:
//   1. STRIP: server-operational vars (PORT/HOST/NODE_ENV/NODE_OPTIONS),
//      npm_*, and every VIBESPACE_* outside the explicit allowlist.
//   2. PASS: everything else — the filter is a NARROW DENYLIST, never an
//      allowlist over the whole env, so a future tool's unknown var (set in
//      the container by the user's ~/.vibespace-init.sh, an rc file, etc.)
//      reaches sessions untouched. Only the VIBESPACE_* namespace — which is
//      OURS — uses allowlist semantics; a new session-visible VIBESPACE var
//      must be added to AGENT_ENV_KEEP in the same commit that introduces it.
// Layering (not testable here, documented for the reader): agentEnv filters
// only the INHERITED-from-server layer at spawn time; per-session env
// (sessionSpec.env, account injection) is spread AFTER it and always wins,
// and anything the agent exports inside its own shell/rc happens later in
// the chain and is untouchable by this filter.
// 3. serviceEnv() (lane spawn-env-census): the THIRD builder is the opposite —
//    an ALLOWLIST for a long-lived child that is not an agent (the Desktop's
//    Xvnc and session, the remote agentd ssh bridge): a few names, `keep` for
//    the ones a child measurably needs, `add` for the caller's own; a secret's
//    shape is never keepable. MUTANT: agentEnv in its place ⇒ RED.
// 4-6. lane spawn-env-debts: the egress door (rclone / tailscaled) + the ssh / rclone keep lists; EVERY ssh road's REAL
//    code on hosts.sshEnv() (a fake ssh / rsync records its env; a patched _ssh with no env ⇒ RED); a REAL ControlMaster on a
//    private sshd whose birth env (its ProxyCommand) holds no planted name.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { agentEnv } = require('../src/ws-handler.js');

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const fake = {
  // must survive untouched
  PATH: '/usr/bin', HOME: '/home/u', TERM: 'dumb', LANG: 'en_US.UTF-8',
  // unknown/future vars — the passthrough guarantee
  SOME_FUTURE_TOOL_TOKEN: 'ft', MY_PROJECT_DB_URL: 'postgres://x', DIRENV_DIR: '/p',
  // server-operational — must be stripped
  PORT: '3456', HOST: '0.0.0.0', NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=8192',
  npm_config_registry: 'https://x', npm_lifecycle_event: 'start',
  // chart-injected instance secrets — must be stripped
  VIBESPACE_PASSWORD: 'hunter2', VIBESPACE_S3_SECRET_KEY: 'sk', VIBESPACE_FRPS_TOKEN: 'tok',
  VIBESPACE_CEPHFS_SECRET: 'cs', VIBESPACE_CLERK_PUBLISHABLE_KEY: 'pk',
  VIBESPACE_TELEMETRY_FORWARD_TOKEN: 'tt', VIBESPACE_GDRIVE_CLIENT_SECRET: 'gs',
  VIBESPACE_RELAY_CLUSTER_TOKEN: 'rct', VIBESPACE_RELAY_TOKEN: 'rt', // lane relay-token-per-instance: the fleet's relay token (chart) + the frpc child's name (never the hub's env — a leak would be caught here)
  // server-only config — must be stripped
  VIBESPACE_OPSLOG_DIR: '/var/opslog', VIBESPACE_METRICS_PORT: '3457',
  // agent-needed allowlist — must survive
  VIBESPACE_API: 'http://127.0.0.1:3456', VIBESPACE_SESSION_TOKEN: 'vsst_x',
  VIBESPACE_INSTANCE_NAME: 'him188',
};
const out = agentEnv(fake);

check('user env survives', out.PATH === '/usr/bin' && out.HOME === '/home/u' && out.LANG === 'en_US.UTF-8');
check('UNKNOWN future vars pass through (denylist, not allowlist)',
  out.SOME_FUTURE_TOOL_TOKEN === 'ft' && out.MY_PROJECT_DB_URL === 'postgres://x' && out.DIRENV_DIR === '/p');
check('PORT stripped (server listen port collided with agent dev servers)', !('PORT' in out));
check('NODE_ENV stripped (made agent npm installs skip devDeps)', !('NODE_ENV' in out));
check('HOST/NODE_OPTIONS stripped', !('HOST' in out) && !('NODE_OPTIONS' in out));
check('npm_* stripped', !Object.keys(out).some((k) => k.startsWith('npm_')));
const secrets = ['VIBESPACE_PASSWORD', 'VIBESPACE_S3_SECRET_KEY', 'VIBESPACE_FRPS_TOKEN',
  'VIBESPACE_CEPHFS_SECRET', 'VIBESPACE_CLERK_PUBLISHABLE_KEY',
  'VIBESPACE_TELEMETRY_FORWARD_TOKEN', 'VIBESPACE_GDRIVE_CLIENT_SECRET', 'VIBESPACE_RELAY_CLUSTER_TOKEN', 'VIBESPACE_RELAY_TOKEN'];
check('ALL instance secrets stripped', !secrets.some((k) => k in out), secrets.filter((k) => k in out).join(','));
check('server-only VIBESPACE config stripped', !('VIBESPACE_OPSLOG_DIR' in out) && !('VIBESPACE_METRICS_PORT' in out));
check('agent-needed allowlist survives', out.VIBESPACE_API && out.VIBESPACE_SESSION_TOKEN && out.VIBESPACE_INSTANCE_NAME === 'him188');
// lane app-system-env: the chart's app-system switch is a fact about the SERVER process (src/app-system-serve.js reads
// it from its own env) — an agent child never sees it; widening the keep set is not the fix for the 2.369.210 fleet bug
const { daemonEnv } = require('../src/agent-env.js');
check('VIBESPACE_APP_SYSTEM stripped from agent + daemon child envs', !('VIBESPACE_APP_SYSTEM' in agentEnv({ VIBESPACE_APP_SYSTEM: '1', PATH: '/bin' })) && !('VIBESPACE_APP_SYSTEM' in daemonEnv({ VIBESPACE_APP_SYSTEM: '1' })));
// The spawn sites spread per-session env AFTER agentEnv() — an explicit
// per-session value must always beat the filter (the "set-after wins" layer).
const layered = { ...agentEnv(fake), NODE_ENV: 'test' };
check('explicitly-set per-session value wins over the strip', layered.NODE_ENV === 'test');

// lane antigravity-harness: the Antigravity descriptor's creds join BOTH env doors with no edit in either — the three
// names agy reads as a login (GEMINI_API_KEY / AGY_ADC_AUTH / GOOGLE_GEMINI_BASE_URL, its binary + docs) are stripped
// from agents AND jobs; HOME is NEVER declared (a named account's root rides creds.spawnEnv, set after the strip).
{
  const HE = require('../src/harness-env.js');
  const AE = require('../src/agent-env.js');
  const { jobEnv } = require('../src/jobs.js');
  const H = require('../src/harnesses/index.js');
  const KEYS = ['GEMINI_API_KEY', 'AGY_ADC_AUTH', 'GOOGLE_GEMINI_BASE_URL'];
  const base = { PATH: '/bin', HOME: '/home/u', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', SOME_FUTURE_TOOL_TOKEN: 'ft', ...Object.fromEntries(KEYS.map((k) => [k, 'ambient-' + k])) };
  const c = H.get('antigravity').creds;
  check('antigravity: the descriptor declares its three key names (creds.keyEnvVars) and no homeEnvVar / spawnEnvVar',
    KEYS.every((k) => c.keyEnvVars.includes(k)) && c.homeEnvVar === undefined && c.spawnEnvVar === undefined && typeof c.spawnEnv === 'function');
  const a = agentEnv(base);
  check('antigravity: the agent door strips GEMINI_API_KEY / AGY_ADC_AUTH / GOOGLE_GEMINI_BASE_URL', KEYS.every((k) => !(k in a)), KEYS.filter((k) => k in a).join(','));
  check('antigravity: …and keeps HOME, the session bus and bystanders (the machine-login spawn rides them)', a.HOME === '/home/u' && a.DBUS_SESSION_BUS_ADDRESS === base.DBUS_SESSION_BUS_ADDRESS && a.SOME_FUTURE_TOOL_TOKEN === 'ft');
  const j = jobEnv({}, base);
  check('antigravity: the job door strips the three names and keeps HOME', KEYS.every((k) => !(k in j)) && j.HOME === '/home/u' && j.SOME_FUTURE_TOOL_TOKEN === 'ft', Object.keys(j).join(','));
  // spawnEnv SEEDS the root (its farm of the machine's HOME): a scratch root, and a scratch machine HOME for the farm
  const fs = require('fs'), os = require('os'), path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agyenv-')), root = path.join(tmp, 'agy-1'), prevHome = process.env.HOME;
  process.env.HOME = path.join(tmp, 'machine-home'); fs.mkdirSync(process.env.HOME);
  let acct; try { acct = { ...agentEnv(base), ...c.spawnEnv(root) }; } finally { process.env.HOME = prevHome; }
  check('antigravity: a named account\'s spawn env wins over the base (set-after layer): its root as HOME, the bus disabled',
    acct.HOME === root && acct.DBUS_SESSION_BUS_ADDRESS === 'disabled:');
  fs.rmSync(tmp, { recursive: true, force: true });
  // RED CONTROL: a descriptor whose keyEnvVars forgot AGY_ADC_AUTH lets the ambient one reach agents
  const mutList = H.list().map((h) => (h.id === 'antigravity' ? { ...h, creds: { ...h.creds, keyEnvVars: h.creds.keyEnvVars.filter((k) => k !== 'AGY_ADC_AUTH') } } : h));
  const leaked = AE.agentEnv(base, { drop: HE.agentCredentialEnvNames(mutList) });
  check('antigravity RED control: a descriptor missing AGY_ADC_AUTH ⇒ the agent door leaks it (the leg above can go red)', leaked.AGY_ADC_AUTH === 'ambient-AGY_ADC_AUTH' && !('GEMINI_API_KEY' in leaked));
}

// 3. serviceEnv — an ALLOWLIST (lane spawn-env-census)
const { serviceEnv, SERVICE_ENV_KEEP } = require('../src/agent-env.js');
const rnd = () => Math.random().toString(36).slice(2, 12);
const hub = {
  PATH: '/usr/bin:/bin', HOME: '/home/u', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', LC_CTYPE: 'C.UTF-8', TMPDIR: '/tmp', XDG_RUNTIME_DIR: '/run/user/1', TERM: 'xterm',
  USER: 'u', SHELL: '/bin/bash', SSH_AUTH_SOCK: '/tmp/agent.sock', DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus',
  VIBESPACE_SESSION_TOKEN: 'vs-' + rnd(), VIBESPACE_FRPS_TOKEN: 'frps-' + rnd(), VIBESPACE_PASSWORD: 'pw-' + rnd(), CLAUDE_CODE_MESSAGING_TOKEN: 'cc-' + rnd(), CLAUDE_CODE_OAUTH_TOKEN: 'oat-' + rnd(),
  ANTHROPIC_API_KEY: 'sk-' + rnd(), AWS_SECRET_ACCESS_KEY: 'aws-' + rnd(), HTTPS_PROXY: 'http://proxy:3128', http_proxy: 'http://proxy:3128', NODE_OPTIONS: '--require x', PORT: '3456',
};
const sorted = (o) => Object.keys(o).sort().join(' ');
/** the table every implementation is judged by → the rows it fails */
const judgeService = (fn) => {
  const bad = []; const row = (n, c) => { if (!c) bad.push(n); };
  let e0, e1, e2, e3;
  try { e0 = fn(hub); e1 = fn(hub, { keep: ['SSH_AUTH_SOCK'] }); e2 = fn(hub, { keep: ['USER', 'SHELL'], add: { DISPLAY: ':57', TERM: null } }); e3 = fn(null); } catch (e) { return ['threw: ' + e.message]; }
  row('the base: exactly PATH HOME LANG LC_* TMPDIR XDG_RUNTIME_DIR TERM', sorted(e0) === 'HOME LANG LC_ALL LC_CTYPE PATH TERM TMPDIR XDG_RUNTIME_DIR');
  row('`keep` adds the one name a child needs', sorted(e1) === sorted({ ...e0, SSH_AUTH_SOCK: 1 }) && e1.SSH_AUTH_SOCK === hub.SSH_AUTH_SOCK);
  row('`add` sets the caller\'s own (DISPLAY = its display, never the hub\'s) and null removes', e2.DISPLAY === ':57' && !('TERM' in e2) && e2.USER === 'u' && e2.SHELL === '/bin/bash');
  row('no display / bus / cookie of the hub\'s unless added', !('DISPLAY' in e0) && !('XAUTHORITY' in e0) && !('DBUS_SESSION_BUS_ADDRESS' in e0));
  row('no secret, no config, no proxy, no loader hook', ![e0, e1, e2].some((e) => Object.keys(e).some((k) => /^(VIBESPACE_|CLAUDE_|ANTHROPIC_|AWS_)|PROXY$|proxy$|^NODE_OPTIONS$|^PORT$/i.test(k))));
  row('no base ⇒ nothing (a name is never invented)', sorted(e3) === '');
  row('a NEW object, the hub\'s env untouched', e0 !== hub && hub.DISPLAY === ':0' && 'VIBESPACE_SESSION_TOKEN' in hub);
  return bad;
};
const realS = judgeService(serviceEnv);
check(`serviceEnv passes the table (${realS.length ? realS.join(' | ') : 'all rows'})`, realS.length === 0);
check('SERVICE_ENV_KEEP is pinned', JSON.stringify(SERVICE_ENV_KEEP) === JSON.stringify(['PATH', 'HOME', 'LANG', 'TMPDIR', 'XDG_RUNTIME_DIR', 'TERM']) && Object.isFrozen(SERVICE_ENV_KEEP));
const throwsFor = (k) => { try { serviceEnv(hub, { keep: [k] }); return false; } catch (e) { return e instanceof TypeError && e.message.includes(k); } };
check('a `keep` naming a secret\'s shape throws (VIBESPACE_FRPS_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, AWS_SECRET_ACCESS_KEY, ANTHROPIC_API_KEY, HTTPS_PROXY, MY_PASSWORD)', ['VIBESPACE_FRPS_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY', 'HTTPS_PROXY', 'MY_PASSWORD'].every(throwsFor) && !throwsFor('SSH_AUTH_SOCK'));
const asAgent = judgeService((b, o = {}) => ({ ...agentEnv(b), ...(o.add || {}) }));
check(`MUTANT agentEnv (the denylist) in serviceEnv's place ⇒ RED (${asAgent.length} rows fail)`, asAgent.includes('no secret, no config, no proxy, no loader hook'));
const spread = judgeService((b, o) => ({ ...b, ...serviceEnv(b, o) }));
check(`MUTANT a spread of the hub's env under the built names ⇒ RED (${spread.length} rows fail)`, spread.length > 0);

// 4. THE EGRESS DOOR + THE SSH / RCLONE KEEP LISTS (lane spawn-env-debts): serviceEnv's `egress: true` adds the names Go's
//    net/http + crypto/x509 read (measured on the pinned rclone 1.69.3) — a proxy stays un-keepable by `keep`
const { SSH_ENV_KEEP, EGRESS_ENV, RCLONE_ENV_KEEP } = require('../src/agent-env.js');
{
  const hubE = { ...hub, HTTP_PROXY: 'http://p:1', HTTPS_PROXY: 'http://p:2', NO_PROXY: 'localhost', no_proxy: 'localhost', ALL_PROXY: 'socks5://p:3', SSL_CERT_FILE: '/r.pem', SSL_CERT_DIR: '/certs', XDG_CACHE_HOME: '/xc' };
  const eg = serviceEnv(hubE, { egress: true });
  check('egress: the base + exactly the egress names the hub carries (ALL_PROXY never: rclone ignores it)', sorted(eg) === sorted({ ...serviceEnv(hubE), HTTP_PROXY: 1, HTTPS_PROXY: 1, http_proxy: 1, NO_PROXY: 1, no_proxy: 1, SSL_CERT_FILE: 1, SSL_CERT_DIR: 1 }), sorted(eg));
  check('egress: still no secret, no config, no loader hook', !Object.keys(eg).some((k) => /^(VIBESPACE_|CLAUDE_|ANTHROPIC_|AWS_)|^NODE_OPTIONS$|^PORT$/.test(k)));
  check('the rclone env (keep RCLONE_ENV_KEEP + egress): + SSH_AUTH_SOCK + XDG_CACHE_HOME (the names rclone reads)', sorted(serviceEnv(hubE, { keep: RCLONE_ENV_KEEP, egress: true })) === sorted({ ...eg, SSH_AUTH_SOCK: 1, XDG_CACHE_HOME: 1 }));
  check('EGRESS_ENV / RCLONE_ENV_KEEP / SSH_ENV_KEEP are pinned (frozen)', JSON.stringify(EGRESS_ENV) === JSON.stringify(['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR'])
    && JSON.stringify(RCLONE_ENV_KEEP) === JSON.stringify(['SSH_AUTH_SOCK', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']) && JSON.stringify(SSH_ENV_KEEP) === JSON.stringify(['SSH_AUTH_SOCK'])
    && [EGRESS_ENV, RCLONE_ENV_KEEP, SSH_ENV_KEEP].every(Object.isFrozen));
  const always = judgeService((b, o = {}) => serviceEnv(b, { ...o, egress: true }));
  check(`MUTANT a serviceEnv that always opens the egress door ⇒ RED (${always.length} rows fail)`, always.includes('no secret, no config, no proxy, no loader hook'));
}

// 5. EVERY SSH ROAD ON hosts.sshEnv() (lane spawn-env-debts): a fake `ssh` / `rsync` first on PATH records the env it was
//    handed; the hub's env PLANTED with runtime-built fakes + an SSH_AUTH_SOCK. The REAL roads: HostManager._ssh (multiplexed
//    — the call that would fork the ControlMaster), RemoteFs _run / _spawn / write, the writer sweep's ssh fallback through
//    ws-handler's OWN execFileAsync (extracted verbatim: the road the site census cannot see), ctx-sync's rsync (-e sshCmd).
//    CONTROL: a patched copy of hosts.js whose _ssh hands no env ⇒ every planted name reaches the fake ⇒ RED.
{
  const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
  const { execFileSync } = require('child_process');
  const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const { scratch } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const D = scratch('agent-env'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(path.join(D, 'bin'), { recursive: true });
  let realSsh = ''; try { realSsh = execFileSync('sh', ['-c', 'command -v ssh'], { encoding: 'utf8' }).trim(); } catch { }
  const fake = (n, body) => { const f = path.join(D, 'bin', n); fs.writeFileSync(f, body); fs.chmodSync(f, 0o755); };
  fake('ssh', `#!/bin/sh\nenv > "${D}/env.ssh.$$"\ncase "$*" in *"cat >"*) cat > /dev/null;; esac\necho ok\n`);
  fake('rsync', `#!/bin/sh\nenv > "${D}/env.rsync.$$"\n`);
  const r8 = () => crypto.randomBytes(8).toString('hex');
  const PLANT = { VIBESPACE_SESSION_TOKEN: 'vs-sess-' + r8(), CLAUDE_CODE_MESSAGING_TOKEN: 'cc-msg-' + r8(), VIBESPACE_FRPS_TOKEN: 'frps-' + r8(), AWS_SECRET_ACCESS_KEY: 'aws-' + r8() };
  const SOCK = path.join(D, 'agent.sock');
  const saved = { ...process.env };
  Object.assign(process.env, PLANT, { SSH_AUTH_SOCK: SOCK, TMPDIR: D, PATH: path.join(D, 'bin') + ':' + process.env.PATH });
  const envs = () => fs.readdirSync(D).filter((n) => n.startsWith('env.')).map((n) => { const t = fs.readFileSync(path.join(D, n), 'utf8'); fs.unlinkSync(path.join(D, n)); return { n, e: Object.fromEntries(t.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) }; });
  const SHELL_SET = new Set(['PWD', 'SHLVL', '_', 'OLDPWD']);   // what /bin/sh itself exports
  const allowed = new Set([...SERVICE_ENV_KEEP, ...SSH_ENV_KEEP]);
  const judgeRoad = (got) => got.length > 0 && got.every(({ e }) => Object.keys(e).every((k) => allowed.has(k) || SHELL_SET.has(k) || /^LC_[A-Z]+$/.test(k)) && !Object.values(PLANT).some((v) => Object.values(e).includes(v)) && e.SSH_AUTH_SOCK === SOCK);
  const host = { id: 'h-ae', name: 'ae', user: 'u', host: '127.0.0.1', port: 22, transport: 'ssh' };
  const mkHm = (HM) => { const hm = new HM({ dataDir: path.join(D, 'data') }); hm.get = () => host; hm.dataPlaneOn = () => false; hm.deviceBounded = async () => { throw new Error('no device link (the fallback)'); }; hm.device = async () => null; return hm; };
  try {
    const { HostManager } = require('../src/hosts.js');
    const hm = mkHm(HostManager);
    const rows = [];
    await hm._ssh(host, 'echo x'); rows.push(['HostManager._ssh (multiplexed)', envs()]);
    const { RemoteFs } = require('../src/remote-fs.js');
    const rf = new RemoteFs(hm);
    await rf._run('h-ae', 'echo x'); rows.push(['RemoteFs._run', envs()]);
    await new Promise((res) => rf._spawn('h-ae', 'echo x').on('close', res)); rows.push(['RemoteFs._spawn (a download stream)', envs()]);
    await rf.write('h-ae', '/tmp/x', Buffer.from('hi')).catch(() => { }); rows.push(['RemoteFs.write', envs()]);
    // ws-handler's execFileAsync is module-private: its text, extracted by acorn, run as written
    const acorn = require('acorn');
    const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
    const fnN = acorn.parse(wsSrc, { ecmaVersion: 'latest' }).body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'execFileAsync');
    const execFileAsync = new Function('require', 'process', wsSrc.slice(fnN.start, fnN.end) + '\nreturn execFileAsync;')(require, process);
    const { sweepWriters } = require('../src/writer-sweep.js');
    await sweepWriters(hm, 'h-ae', 'rid-ae', { shq: (s) => `'${s}'`, execFileAsync, sweep: () => 'echo SWEPT' }).catch(() => { }); rows.push(["the writer sweep's ssh fallback (ws-handler execFileAsync)", envs()]);
    const { syncGroupCtxOverRsync } = require('../src/ctx-sync.js');
    fs.mkdirSync(path.join(D, 'ctx'), { recursive: true });
    await syncGroupCtxOverRsync({ hosts: hm, host, group: { contextDir: path.join(D, 'ctx') }, remoteDir: '/tmp/ctx' }).catch(() => { }); rows.push(["ctx-sync's rsync (-e hosts.sshCmd) + its mkdir", envs()]);
    check('the planted names reached the hub (the legs are not vacuous)', Object.entries(PLANT).every(([k, v]) => process.env[k] === v));
    for (const [n, got] of rows) check(`ssh road: ${n} — ${got.length} child(ren), the service list + SSH_AUTH_SOCK, no planted name or value`, judgeRoad(got), JSON.stringify(got.map(({ n: f, e }) => [f, Object.keys(e).sort().join(' ')])));
    check('ctx-sync: both rsync children ran on the built env', rows[5][1].filter(({ n }) => n.startsWith('env.rsync.')).length === 2);
    // CONTROL: the pre-fix _ssh (no env) — a patched copy outside the tree
    const M = mutantCopies('agent-env', REPO);
    const hsrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const anchor = "{ env: this.sshEnv(), timeout: timeoutMs, maxBuffer,";
    const hmM = mkHm(M.load('src/hosts.js', hsrc.replace(anchor, '{ timeout: timeoutMs, maxBuffer,'), 'no-ssh-env').HostManager);
    await hmM._ssh(host, 'echo x'); const gotM = envs();
    check('CONTROL: the _ssh anchor applies once', hsrc.split(anchor).length === 2);
    check('CONTROL: a copy of hosts.js whose _ssh hands no env ⇒ every planted name reaches ssh ⇒ RED', gotM.length === 1 && Object.entries(PLANT).every(([k, v]) => gotM[0].e[k] === v));
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }

  // 6. A REAL ControlMaster (lane spawn-env-debts — measured, kept as a leg): a private sshd as THIS user on loopback (scratch
  //    keys, never ~/.ssh), HostManager._ssh twice with multiplex, the ControlPath under this run's own TMPDIR (never the
  //    owner's /tmp/vs-cm-<uid>). The master's /proc environ is ZEROED (OpenSSH's setproctitle reuses that area for its
  //    '[mux]' title), so the witness is a ProxyCommand the FIRST call forks: it lives with the master and holds its birth env.
  const sshd = '/usr/sbin/sshd';
  if (!realSsh || !fs.existsSync(sshd)) console.log(`  - SKIP the real ControlMaster leg: ${!realSsh ? 'no ssh' : 'no ' + sshd} on this box`);
  else {
    const R = path.join(D, 'real'); fs.mkdirSync(path.join(R, 't'), { recursive: true }); fs.mkdirSync(path.join(R, 'w')); fs.mkdirSync(path.join(R, 'shim'));
    const run = (c, a, o = {}) => execFileSync(c, a, { stdio: ['ignore', 'pipe', 'pipe'], ...o });
    run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(R, 'hostkey')]); run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(R, 'userkey')]);
    fs.copyFileSync(path.join(R, 'userkey.pub'), path.join(R, 'authorized_keys')); fs.chmodSync(path.join(R, 'authorized_keys'), 0o600);
    const net = require('net'); const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    fs.writeFileSync(path.join(R, 'sshd_config'), `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${R}/hostkey\nPidFile ${R}/sshd.pid\nAuthorizedKeysFile ${R}/authorized_keys\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\n`);
    fs.writeFileSync(path.join(R, 'relay.cjs'), `const fs = require('fs'), net = require('net'), c = require('crypto'), [h, p, w] = process.argv.slice(2);\nfs.writeFileSync(w + '/born.' + process.pid, JSON.stringify(Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, c.createHash('sha256').update(v).digest('hex')]))));\nconst s = net.connect(Number(p), h); process.stdin.pipe(s); s.pipe(process.stdout); s.on('close', () => process.exit(0));\n`);
    const shim = (tag, extra) => { const f = path.join(R, 'shim', tag); fs.mkdirSync(f); fs.writeFileSync(path.join(f, 'ssh'), `#!/bin/sh\nexec ${realSsh} -F /dev/null -o UserKnownHostsFile=${R}/kh ${extra} -o "ProxyCommand=${process.execPath} ${R}/relay.cjs %h %p ${R}/w" "$@"\n`); fs.chmodSync(path.join(f, 'ssh'), 0o755); return f; };
    const shA = shim('A', ''), shB = shim('B', '-o IdentityFile=none');
    let agentPid = 0;
    const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
    const logins = () => (fs.readFileSync(path.join(R, 'sshd.log'), 'utf8').match(/Accepted/g) || []).length;
    const cm = path.join(R, 't', `vs-cm-${process.getuid()}`);
    const masters = () => { const out = []; for (const n of fs.existsSync(cm) ? fs.readdirSync(cm) : []) { try { execFileSync(realSsh, ['-o', 'ControlPath=' + path.join(cm, n), '-O', 'exit', 'x'], { stdio: 'ignore' }); out.push(n); } catch { } } return out; };
    try {
      run(sshd, ['-f', path.join(R, 'sshd_config'), '-E', path.join(R, 'sshd.log')]);
      const ag = run('ssh-agent', ['-a', path.join(R, 'agent.sock'), '-s'], { encoding: 'utf8' }); agentPid = Number((/SSH_AGENT_PID=(\d+)/.exec(ag) || [])[1]) || 0;
      run('ssh-add', ['-q', path.join(R, 'userkey')], { env: { ...process.env, SSH_AUTH_SOCK: path.join(R, 'agent.sock') } });
      for (const [leg, shimDir, key, agent] of [['a key file', shA, path.join(R, 'userkey'), null], ['an agent-held key (SSH_AUTH_SOCK in the hub env)', shB, null, path.join(R, 'agent.sock')]]) {
        Object.assign(process.env, PLANT, { TMPDIR: path.join(R, 't'), PATH: shimDir + ':' + saved.PATH });
        if (agent) process.env.SSH_AUTH_SOCK = agent; else delete process.env.SSH_AUTH_SOCK;
        const h = { id: 'h-real', name: 'real', user: os.userInfo().username, host: '127.0.0.1', port, transport: 'ssh', ...(key ? { keyPath: key } : {}) };
        const hmR = new (require('../src/hosts.js').HostManager)({ dataDir: path.join(R, 'data') });
        const l0 = logins(); let o1 = '', o2 = '', err = '';
        try { o1 = String(await hmR._ssh(h, 'echo one')).trim(); o2 = String(await hmR._ssh(h, 'echo two')).trim(); } catch (e) { err = String(e.message).slice(0, 200); }
        const born = fs.readdirSync(path.join(R, 'w')).map((n) => { const j = JSON.parse(fs.readFileSync(path.join(R, 'w', n), 'utf8')); fs.unlinkSync(path.join(R, 'w', n)); return j; });
        const ms = masters();
        const names = born.length === 1 ? Object.keys(born[0]) : [];
        check(`real ControlMaster, ${leg}: both calls answered over ONE login (the 2nd rode the master) — the ControlPath under this run's TMPDIR`, o1 === 'one' && o2 === 'two' && logins() - l0 === 1 && ms.length === 1, JSON.stringify({ o1, o2, err, logins: logins() - l0, ms }));
        check(`real ControlMaster, ${leg}: the master's birth env (its ProxyCommand) = the service list${agent ? ' + SSH_AUTH_SOCK' : ''} — no planted name or value`, born.length === 1 && names.every((k) => allowed.has(k) || SHELL_SET.has(k) || /^LC_[A-Z]+$/.test(k)) && !Object.values(PLANT).some((v) => Object.values(born[0]).includes(sha(v))) && names.includes('SSH_AUTH_SOCK') === !!agent, names.sort().join(' '));
      }
    } finally {
      masters();
      try { process.kill(Number(fs.readFileSync(path.join(R, 'sshd.pid'), 'utf8')), 'SIGTERM'); } catch { }
      if (agentPid) try { process.kill(agentPid, 'SIGTERM'); } catch { }
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved);
    }
  }
  fs.rmSync(D, { recursive: true, force: true });
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
