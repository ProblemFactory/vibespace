#!/usr/bin/env node
// THE agent-browser SHIM's SOURCE CHECKS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-browser-verbs.mjs (its browser /
// hub legs and every mutant CONTROL stay there): data/bin/agent-browser exists, is executable, is a node script carrying src/browser-verbs.js's SHIM_MARKER, and reads no env, opens no network, spawns nothing. Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file. Row B-e946 adds the pass list's rule (pure, in-process: no spawn, no network).
// Run: node scripts/test-browser-verbs-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const SHIM = path.join(REPO, 'data/bin/agent-browser');

console.log('— the shim (data/bin/agent-browser): its source');
{
  ok(fs.existsSync(SHIM) && (fs.statSync(SHIM).mode & 0o111) !== 0, 'data/bin/agent-browser exists and is executable');
  const src = fs.existsSync(SHIM) ? fs.readFileSync(SHIM, 'utf8') : '';
  ok(src.startsWith('#!/usr/bin/env node') && src.includes(V.SHIM_MARKER), 'the shim is a node script carrying the marker resolvers skip it by');
  ok(!/process\.env|require\(['"](?:https?|net|child_process|fs)['"]\)/.test(src), 'the shim reads no env, opens no network, spawns nothing');
}

// ── row B-e946 (主开发 r4206): THE RULE OF THE PASS LIST, fast and pure — a name passes to the browser driver only if its SESSION
//    FINGERPRINT does not read it (V.DRIVER_FINGERPRINT, quoted beside ENV_PASS at the driver version the tree pins). A fingerprint name
//    that passed started the session's driver again at every switch between the agent's road and the hub's (probe 11, box row 784: 5 of
//    5 «Unknown ref»). The REDs (the list, the flag as they stood; the pinned driver moved) are mutant controls: the heavy
//    test-browser-verbs holds them, as it holds every control of this file ──
console.log('— B-e946: the pass list\'s rule, pinned to the driver\'s quoted session fingerprint');
{
  const FP = V.DRIVER_FINGERPRINT;
  ok(FP.version === V.AGENT_BROWSER_CLI.table, `the session fingerprint beside the pass list is quoted at the driver version the tree pins (${FP.version})${FP.version === V.AGENT_BROWSER_CLI.table ? '' : ` — the pinned driver is ${V.AGENT_BROWSER_CLI.table} now: read daemon_config_fingerprint (cli/src/connection.rs) and the env names and flags (cli/src/flags.rs, cli/src/main.rs's daemon options) again at that tag, then move DRIVER_FINGERPRINT`}`);
  const passed = Object.keys(FP.names).filter((k) => V.ENV_PASS.includes(k)), loose = Object.keys(FP.flags).filter((f) => !V.LAUNCH_FLAGS.includes(f) && !V.SESSION_FLAGS.includes(f));
  ok(FP.fields.length === 6 && Object.values(FP.names).every((f) => FP.fields.includes(f)) && Object.values(FP.flags).every((f) => FP.fields.includes(f)) && passed.length === 0 && loose.length === 0,
    `no name the session fingerprint reads is passed (${passed.join(', ') || 'none'}), and every flag that sets one of its six fields is refused (${loose.join(', ') || 'none loose'})`);
  const c = V.classify(['snapshot', '--debug']), c2 = V.classify(['--debug', 'false', 'snapshot', '-i']);
  ok(c.kind === 'refused' && c.code === 'session_flag_refused' && c2.code === 'session_flag_refused', '--debug (the debug field) is refused before anything runs: session_flag_refused', JSON.stringify([c.code, c2.code]));
  const ce = V.childEnv({ AGENT_BROWSER_DEFAULT_TIMEOUT: '60000', AGENT_BROWSER_DEBUG: '1', AGENT_BROWSER_JSON: '1' }, { spawnEnv: [] });
  ok(!('AGENT_BROWSER_DEFAULT_TIMEOUT' in ce.env) && !('AGENT_BROWSER_DEBUG' in ce.env) && ce.env.AGENT_BROWSER_JSON === '1' && ce.dropped.includes('AGENT_BROWSER_DEBUG') && ce.dropped.includes('AGENT_BROWSER_DEFAULT_TIMEOUT'),
    'the agent\'s DEFAULT_TIMEOUT and DEBUG never reach the driver (named among the dropped); an output key still passes', JSON.stringify(ce));
  const both = V.sessionConfigNote(ce.dropped), dbg = V.sessionConfigNote(['AGENT_BROWSER_DEBUG', 'AGENT_BROWSER_SOCKET_DIR']), none = V.sessionConfigNote(['AGENT_BROWSER_CDP']);
  ok(typeof both === 'string' && both.includes('AGENT_BROWSER_DEBUG, AGENT_BROWSER_DEFAULT_TIMEOUT') && both.includes('VibeSpace drives this same browser session') && both.includes('lose every ref') && both.includes('`vibespace-browser wait <ms>`') && both.endsWith('[env_session_config_dropped]') && !both.includes('60000')
    && typeof dbg === 'string' && !dbg.includes('wait') && !dbg.includes('SOCKET_DIR') && none === null,
    'the words: the names only (never a value), why (this same session; another value starts its driver again and loses every ref), and — for the timeout only — the driver\'s own `wait <ms>`', JSON.stringify({ both, dbg, none }));
  ok(V.PAGE_VERBS.includes('wait'), 'the verb the words send the agent to is one the CLI passes (wait, a page verb)');
}

console.log(fail ? `FAIL (${fail} failed, ${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
