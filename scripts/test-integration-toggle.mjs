#!/usr/bin/env node
// Integration master-switch e2e (2.190.0, agents.vibespaceIntegration):
//  1. Boot (default ON) registers the vibespace hook in BOTH CLI configs.
//  2. A spawned session's dtach ENV carries VIBESPACE_API + data/bin PATH (lane antigravity-spawn-argv: the names ride
//     the spawn's env, never its argv — /proc/<pid>/environ of the dtach master, and the argv carries no NAME=value word).
//  3. PATCH the switch OFF → hook entries stripped LIVE from both configs,
//     /api/agent-hooks reports integrationOff, install route refuses,
//     the delivery endpoints (task-context / prompt-context / stop-check)
//     return empty even for the pre-toggle session's still-valid token.
//  4. A session spawned while OFF has NO VIBESPACE_API and NO tools PATH,
//     not even the OUTER hub's address the hub's own env carries (r2203: planted below, as a hub started by hand
//     inside another VibeSpace's terminal or job inherits it — so the check holds whatever the runner's env holds),
//     but KEEPS the session token (Ctrl+G editor auth — never model-visible).
//  5. PATCH ON → hook re-registered.
//  6. Boot convergence: settings flipped OFF while the server is down +
//     hook entries present → next boot strips them.
// Runs a THROWAWAY server in a git worktree with a FAKE $HOME — never touches
// a live instance or the real ~/.claude. Run: node scripts/test-integration-toggle.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await freePort(); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('integ-toggle');
const home = scratch('integ-home');
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, opts) => fetch(`http://127.0.0.1:${PORT}${p}`, opts);

// ── throwaway worktree + fake home ──────────────────────────────────────────
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.rmSync(home, { recursive: true, force: true });
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
// A machine WITH codex has ~/.codex; registration creates only hooks.json in
// it (a missing dir = codex not installed ⇒ registration must SKIP, never
// manufacture the dir — reviewed invariant).
fs.mkdirSync(path.join(home, '.codex'), { recursive: true });

// FORCE hook registration: the harness runs the server from a /tmp worktree,
// where the 2.225.1 temp-server guard refuses every global-hook write — so
// the five hook assertions below could NEVER pass and this suite has been
// silently red since that release (found during the 2.271.0 lag/CS audit
// campaign; a red suite = zero coverage on the registration path). HOME is a
// throwaway dir here, so forcing only ever touches the fake configs.
// r2203: the hub runs as if started inside ANOTHER VibeSpace — that hub's address in its env. ON, a start names this hub's own;
// OFF, it hands on none (src/ws-create.js r6Base). The box's job env carried one (row 215's red), so it is planted, never inherited.
const OUTER_API = 'http://127.0.0.1:9/outer-hub';
const SRV_ENV = { ...process.env, ...VNC_ENV, HOME: home, PORT: String(PORT), VIBESPACE_FORCE_AGENT_HOOKS: '1', VIBESPACE_API: OUTER_API };
let srv = null;
// A stale listener on our port would silently absorb every assertion (real
// debugging cost: yesterday's crashed smoke servers still held the port).
try { await api('/api/home'); console.error(`ABORT: something already listens on :${PORT}`); process.exit(2); } catch {}
const bootServer = async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: SRV_ENV, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await api('/api/home'); if (r.ok) return; } catch {} await sleep(250); }
  throw new Error('server did not come up');
};
const cleanup = () => {
  try { srv?.kill('SIGKILL'); } catch {}
  // the dtach sessions of the throwaway hub — ended BY IDENTITY (every process rooted in its worktree / its home), never by a
  // pattern (the EXCLUDED package's adversarial read: the old `pgrep -f <socket> | xargs kill -9` was the shape §57b retires)
  for (const r of [wt, home]) { try { endRootedProcesses(r); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

const hookIn = (file) => {
  try { return JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf-8'))).includes('vibespace-hook.mjs'); }
  catch { return false; }
};
// r2363: THE HOOKS LAND THROUGH THE SHIPPED HELPER, AFTER the call that asks them (B-ddf3 unit 2 line 1): the boot's registration
// lands about 0.1 s after the hub first answers (measured on the test machine: listen +2089 ms, the hook file written +2180 ms),
// and a switch's removal or registration a few hundred ms after its PATCH. A check of the file is therefore a BOUNDED WAIT for
// the landing — the spawn gate's own bound, 10 s (src/server/cli-config-runner.js BOUND_MS: a conversation started meanwhile
// waits that long for it), polled every 50 ms. A registration that never lands is still red, at the bound.
const landed = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { if (fn()) return true; if (Date.now() >= end) return false; await sleep(50); } };
const claudeCfg = path.join(home, '.claude', 'settings.json');
const codexCfg = path.join(home, '.codex', 'hooks.json');

// ws session create → resolves {sessionId, argv} of the spawned dtach line
const WebSocket = require('ws');
let wsc = null;
const openWs = () => new Promise((res, rej) => {
  wsc = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  wsc.on('open', () => res());
  wsc.on('error', rej);
});
const createShellSession = () => new Promise((res, rej) => {
  const reqId = 'it-' + Math.random().toString(36).slice(2);
  const to = setTimeout(() => rej(new Error('create timed out')), 20000);
  const onMsg = (d) => {
    const m = JSON.parse(d);
    if (m.type === 'created' && m.reqId === reqId) { clearTimeout(to); wsc.off('message', onMsg); res(m.sessionId); }
    if (m.type === 'error' && m.reqId === reqId) { clearTimeout(to); wsc.off('message', onMsg); rej(new Error(m.message)); }
  };
  wsc.on('message', onMsg);
  wsc.send(JSON.stringify({ type: 'create', reqId, backend: 'shell', mode: 'terminal', cwd: home, cols: 80, rows: 24 }));
});
const dtachArgv = (sessionId) => {
  // the dtach master's argv contains the per-session socket path — match on it; its ENV is the session's names
  // (lane antigravity-spawn-argv: they ride the spawn's env). Socket names are cw-<tail> while sessionIds are sess-<tail>.
  const tail = sessionId.replace(/^sess-/, '');
  const sock = fs.readdirSync(path.join(wt, 'data', 'sockets')).find((s) => s.includes(tail));
  if (!sock) return null;
  const want = path.join(wt, 'data', 'sockets', sock);
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    let argv = [];
    try { argv = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0'); } catch { continue; }
    if (!argv.includes(want)) continue;
    let env = '';
    try { env = fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0').join(' '); } catch { }
    // the argv must carry no NAME=value word; the env words come back in the same "K=V" shape the checks read
    return argv.some((w) => /^[A-Z_][A-Z0-9_]*=/.test(w)) ? 'ARGV-CARRIES-NAMES ' + argv.join(' ') : env;
  }
  return null;
};

// ═══ Phase 1: boot ON (default) ═════════════════════════════════════════════
console.log('Phase 1: boot with integration ON (default)');
await bootServer();
check('claude settings.json has the hook registered', verdictOf(await landed(() => hookIn(claudeCfg))));
check('codex hooks.json created + hook registered', verdictOf(await landed(() => hookIn(codexCfg))));
const hs1 = await (await api('/api/agent-hooks')).json();
check('/api/agent-hooks integrationOff=false', hs1.integrationOff === false);

await openWs();
const sid1 = await createShellSession();
await sleep(800);
const argv1 = dtachArgv(sid1);
check('ON-spawn env has VIBESPACE_API', !!argv1 && verdictOf(argv1.includes('VIBESPACE_API=')));
check('ON-spawn env names THIS hub, never the outer one in its env', !!argv1 && gateOf(argv1.includes(`VIBESPACE_API=http://127.0.0.1:${PORT}`)) && !argv1.includes(OUTER_API), (argv1 || 'no argv').slice(0, 400));
check('ON-spawn env has the tools PATH prefix', !!argv1 && verdictOf(argv1.includes(`PATH=${path.join(wt, 'data', 'bin')}`)));
const tok1 = argv1 && (argv1.match(/VIBESPACE_SESSION_TOKEN=(vsst_[\w-]+)/) || [])[1];
check('ON-spawn env has the session token', !!tok1);
const auth = { headers: { Authorization: `Bearer ${tok1}` } };
// the EXCLUDED package (2026-11-17): this suite's session is a SHELL terminal, and task-context answers nothing to a harness that
// ignores SessionStart output (src/agent-routes.js honoursSessionStart — a shell has no agent; channel-jump verify r7) — so its
// old «task-context delivers content while ON» was red by design. The ON delivery a shell session's token gets is prompt-context
// (no harness check for a call that is not the hook's): content while ON, empty while OFF (Phase 2) — the switch's contrast. The
// task-context OFF leg below is therefore no witness of the master gate for a shell (it is empty either way) — that gate's own
// witness is test-channels-teach (the master switch over task-context).
const ctxOn = await (await api('/api/agent/task-context', auth)).json();
check('task-context: a shell session (its harness ignores SessionStart) gets nothing from it, by design', ctxOn.success === true && (ctxOn.context || '') === '', JSON.stringify(ctxOn).slice(0, 200));
const pOn = await (await api('/api/agent/prompt-context', auth)).json();
check('prompt-context delivers content while ON (the delivery this token gets)', !!(pOn.success && pOn.context && pOn.context.length > 50), JSON.stringify(pOn).slice(0, 200));

// ═══ Phase 2: toggle OFF live ═══════════════════════════════════════════════
console.log('Phase 2: PATCH agents.vibespaceIntegration=false');
await api('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'agents.vibespaceIntegration': false }) });
check('claude hook entries stripped live', verdictOf(await landed(() => !hookIn(claudeCfg))));
check('codex hook entries stripped live', verdictOf(await landed(() => !hookIn(codexCfg))));
const hs2 = await (await api('/api/agent-hooks')).json();
check('/api/agent-hooks integrationOff=true', hs2.integrationOff === true);
const inst = await api('/api/agent-hooks/install', { method: 'POST' });
check('install route refuses while OFF', inst.status === 400);
const ctxOff = await (await api('/api/agent/task-context', auth)).json();
check('task-context empty for pre-toggle session', ctxOff.success === true && (ctxOff.context || '') === '');
const pOff = await (await api('/api/agent/prompt-context', auth)).json();
check('prompt-context empty for pre-toggle session', pOff.success === true && (pOff.context || '') === '');
const sOff = await (await api('/api/agent/stop-check', auth)).json();
check('stop-check never blocks while OFF', sOff.block === false);
const tOff = await api('/api/agent/task', auth);
check('GET /api/agent/task refuses while OFF (steering-content read)', tOff.status === 403);

const sid2 = await createShellSession();
await sleep(800);
const argv2 = dtachArgv(sid2);
check('OFF-spawn env has NO VIBESPACE_API', !!argv2 && !argv2.includes('VIBESPACE_API='), (argv2 || 'no argv').slice(0, 400));
check('OFF-spawn env has NO tools PATH prefix', !!argv2 && !argv2.includes(`PATH=${path.join(wt, 'data', 'bin')}`));
check('OFF-spawn env KEEPS the session token (Ctrl+G auth)', !!argv2 && verdictOf(argv2.includes('VIBESPACE_SESSION_TOKEN=vsst_')));

// ═══ Phase 3: toggle back ON ════════════════════════════════════════════════
console.log('Phase 3: PATCH back true');
await api('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'agents.vibespaceIntegration': null }) }); // null deletes → default ON
check('claude hook re-registered on re-enable', verdictOf(await landed(() => hookIn(claudeCfg))));
check('codex hook re-registered on re-enable', verdictOf(await landed(() => hookIn(codexCfg))));

// ═══ Phase 4: boot convergence (flipped OFF while server down) ══════════════
console.log('Phase 4: boot with the switch already OFF');
try { wsc?.close(); } catch {}
srv.kill('SIGKILL');
await sleep(500);
const settingsFile = path.join(wt, 'data', 'settings.json');
const cur = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
cur['agents.vibespaceIntegration'] = false;
fs.writeFileSync(settingsFile, JSON.stringify(cur));
check('precondition: hook present before boot', verdictOf(hookIn(claudeCfg)));
await bootServer();
check('boot strips hook entries when switch is OFF', verdictOf(await landed(() => !hookIn(claudeCfg))));
check('boot strips codex entries too', verdictOf(await landed(() => !hookIn(codexCfg))));

srv.kill('SIGKILL');
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
