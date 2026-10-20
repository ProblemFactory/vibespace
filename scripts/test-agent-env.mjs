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

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
