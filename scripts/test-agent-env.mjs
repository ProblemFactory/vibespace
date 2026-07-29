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
  'VIBESPACE_TELEMETRY_FORWARD_TOKEN', 'VIBESPACE_GDRIVE_CLIENT_SECRET'];
check('ALL instance secrets stripped', !secrets.some((k) => k in out), secrets.filter((k) => k in out).join(','));
check('server-only VIBESPACE config stripped', !('VIBESPACE_OPSLOG_DIR' in out) && !('VIBESPACE_METRICS_PORT' in out));
check('agent-needed allowlist survives', out.VIBESPACE_API && out.VIBESPACE_SESSION_TOKEN && out.VIBESPACE_INSTANCE_NAME === 'him188');
// The spawn sites spread per-session env AFTER agentEnv() — an explicit
// per-session value must always beat the filter (the "set-after wins" layer).
const layered = { ...agentEnv(fake), NODE_ENV: 'test' };
check('explicitly-set per-session value wins over the strip', layered.NODE_ENV === 'test');

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
