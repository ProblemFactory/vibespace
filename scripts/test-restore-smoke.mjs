#!/usr/bin/env node
// Restore-path smoke (decomposition guard): boot an ISOLATED worktree server,
// create a real dtach shell session over WS, SIGKILL the server, boot again,
// assert the session RECONNECTS. This crosses the src/server/session-stdout.js
// + boot-restore.js seam end-to-end — the exact path a wiring miss breaks
// (it caught the deviceMgr live-read gap the empty-data boot smoke could not).
// NEVER run server.js from the repo dir for smokes: the repo's data/ is
// PRODUCTION and restoreSessions would attach to live sessions (#127 class).
import { WebSocket } from 'ws';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wt = `/tmp/vs-restore-smoke-${process.pid}`;
// FREE port (2026-09-07 round 2). `3971 + pid % 20` is a machine-global claim
// on twenty numbers: this box hosts ~160 checkouts of this repo and the fast
// tier is fail-fast with no retry, so a squatter anywhere in 3971-3990 turned
// somebody else's perfectly good push red. It already happened once — an
// orphaned throwaway server on :3987 took this suite down along with two
// others (the split's own field notes). Nothing outside this process needs to
// know the number, so nothing outside this process gets to collide with it.
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
// Overlay the WORKING TREE's code (2.335.1, after this smoke passed while an
// uncommitted server.js could not boot — a worktree checks out HEAD, so a
// pre-commit run silently tests the PREVIOUS release). Data/ stays the
// worktree's own empty dir — that isolation is the whole point (#127 class).
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execFileSync('rm', ['-rf', path.join(wt, f)]);
  execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const cleanup = () => {
  try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { }
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);

const boot = () => spawn('node', ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const waitReady = (p) => new Promise((res, rej) => {
  let out = '';
  p.stdout.on('data', (d) => { out += d; if (out.includes('Ready.')) res(out); });
  p.stderr.on('data', (d) => { out += d; });
  setTimeout(() => rej(new Error('boot timeout\n' + out)), 20000);
});

// ── the boot-time weekly-lanes repair on a SEEDED scratch data/ (inc-mubu23bd-5vxi,
// 2026-09-21): the owner's account as the incident left it (plan 7d holding the
// model bucket's 86 %, source rate-limit-event), its api-phase-verified window
// sidecar, a claude session on that subscription whose buffer tail carries the
// owner's rate_limit_event VERBATIM. The one-shot migration runs inside
// server.listen's callback and the usage routes re-read the directory, so the
// FIRST /api/usage of this boot must already say what the taskbar donut draws.
// Never the production data/: this is the worktree's own, throwaway, data dir.
const FX_KEY = 'sub-fixture-max';
{
  const d = path.join(wt, 'data');
  for (const sub of ['usage-cache', 'session-meta', 'session-buffers', 'subs/' + FX_KEY]) fs.mkdirSync(path.join(d, sub), { recursive: true });
  fs.writeFileSync(path.join(d, 'accounts.json'), JSON.stringify({ version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [{ id: FX_KEY, name: 'Member Max', type: 'subscription', source: 'login', createdAt: Date.now() }] }));
  fs.writeFileSync(path.join(d, 'usage-cache', FX_KEY + '.json'), JSON.stringify({ fiveHour: { utilization: 0.09, resetsAt: 1790048400 }, sevenDay: { utilization: 0.86, resetsAt: 1790535600, status: 'allowed_warning' }, scopedWeekly: [{ name: 'Fable', utilization: 0.87, resetsAt: 1790535600, severity: 'normal' }], fetchedAt: 1790031730410, source: 'rate-limit-event', scopedFetchedAt: 1790030899274, overage: { inUse: false, asOf: 1790031730410, status: 'rejected', disabledReason: 'org_level_disabled' }, overallStatus: 'allowed' }));
  // the sidecar is the PANEL's minute-precise instant, 60 s before the API's (the production shape)
  fs.writeFileSync(path.join(d, 'usage-cache', '.window-' + FX_KEY), JSON.stringify({ sevenDay: 1790535540, fiveHour: 1790048340, scoped: { fable: 1790535540 }, at: 1790030899275, source: 'on-demand', verifiedAt: 1790030899275, verifiedBy: 'api-phase' }));
  fs.writeFileSync(path.join(d, 'session-meta', 'cw-1-100.json'), JSON.stringify({ accountId: FX_KEY, backend: 'claude', host: null, mode: 'chat' }));
  fs.writeFileSync(path.join(d, 'session-buffers', 'sess-1-100.buf'), JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1790535600, rateLimitType: 'seven_day_overage_included', utilization: 0.87, isUsingOverage: false, surpassedThreshold: 0.75, unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1790048400 }, seven_day: { utilization: 0.43, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } }, uuid: 'e2e00000-0000-4000-8000-000000000001', session_id: 'e2e00000-0000-4000-8000-000000000002' }) + '\n');
}

let srv = boot(); await waitReady(srv);
let ok = true;
{
  const u = await (await fetch(`http://127.0.0.1:${PORT}/api/usage`)).json();
  const a = u?.accounts?.[FX_KEY];
  const good = a && Math.abs(a.sevenDay?.utilization - 0.43) < 1e-9 && Math.abs(a.fiveHour?.utilization - 0.09) < 1e-9 && (a.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.87;
  let ledger = null; try { ledger = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'migrations.json'), 'utf-8')); } catch { }
  const ran = !!ledger?.applied?.['2026-09-weekly-lanes-unfold'];
  if (good && ran) console.log('  ✓ boot-time weekly-lanes repair: /api/usage says sevenDay 0.43 · fiveHour 0.09 · Fable 0.87 for the seeded key, and the ledger records the run');
  else { ok = false; console.error('  ✗ boot-time weekly-lanes repair: expected sevenDay 0.43 / 5h 0.09 / Fable 0.87 + a ledger row, got', JSON.stringify({ ran, a: a && { f: a.fiveHour, s: a.sevenDay, sc: a.scopedWeekly } })); }
}
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws.on('open', r));
const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: '/tmp', cols: 80, rows: 24, reqId: 'r1' }));
await new Promise((res, rej) => {
  const t = setInterval(() => { if (msgs.some((m) => m.type === 'created')) { clearInterval(t); res(); } }, 200);
  setTimeout(() => { clearInterval(t); rej(new Error('no created reply: ' + JSON.stringify(msgs.map((m) => m.type)))); }, 12000);
});
const sid = msgs.find((m) => m.type === 'created').sessionId;
console.log('created', sid);
await new Promise((r) => setTimeout(r, 1500));
ws.close(); srv.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 800));
srv = boot(); const out2 = await waitReady(srv);
ok = ok && /Reconnected/.test(out2);
console.log(ok ? 'RESTORE OK — session reconnected after SIGKILL restart' : 'RESTORE FAILED:\n' + out2);

// ── GET-route battery (2.333.0, after /api/agent-hooks 500'd in production):
// a factory function used by server.js but never EXPORTED throws a
// ReferenceError only when the route actually runs — no boot log, no build
// gate. Hit every cheap read route on the live worktree server and fail on
// any 5xx (the lost-export class always presents as 500).
const ROUTES = ['/api/version', '/api/home', '/api/agent-hooks', '/api/accounts',
  '/api/sessions', '/api/active', '/api/usage', '/api/backend-status',
  '/api/settings', '/api/user-state', '/api/tasks', '/api/hosts',
  '/api/session-status', '/api/user-todos', '/api/sysinfo', '/api/vnc/status',
  '/api/bookmarks', '/api/layouts', '/api/plugins', '/api/machine-mounts',
  '/api/mounts', '/api/port-forwards', '/api/exits', '/api/incidents',
  '/api/session-options', '/api/available-models', '/api/custom-themes',
  '/api/sysinfo/procs',
  // S9 remainder (B-eac2): the OpenCode action routes are wired from a
  // src/server module — a factory used but never exported throws only when a
  // route RUNS (the third lost-export incident). /state answers on every
  // instance (the serve being OFF is a fact, not a failure); the ACTING routes
  // legitimately answer 503 when the service is off, so they are not battery
  // material.
  '/api/opencode/state', '/api/ci-heavy',
  // Integrations & keys (design §14.4): the masked list answers on every
  // instance; a lost export in its wiring would present as the same 500.
  '/api/integrations'];
for (const r of ROUTES) {
  try {
    const resp = await fetch(`http://127.0.0.1:${PORT}${r}`);
    if (resp.status >= 500) { ok = false; console.error(`  ✗ GET ${r} → ${resp.status} (lost-export class)`); }
    else console.log(`  ✓ GET ${r} → ${resp.status}`);
  } catch (e) { ok = false; console.error(`  ✗ GET ${r} threw — ${e.message}`); }
}
// ── generated-script sanity (2.359.1, the Ctrl+G outage): the 拆分 copy of
// the editor-helper template turned bash `\${PORT}` into `\${port}` (empty →
// curl hit port 80 → the helper waited on its signal file forever) and NO
// gate covered generated-script CONTENT. Every ${lowercase} bash reference
// in a generated script must resolve to a definition inside the script.
{
  const genFiles = ['data/bin/editor/code'];
  for (const gf of genFiles) {
    const p = path.join(wt, gf);
    try {
      const body = fs.readFileSync(p, 'utf-8');
      const refs = [...body.matchAll(/\$\{([a-z_][a-z0-9_]*)(?::-[^}]*)?\}/g)].map((m) => m[1]);
      const undef = refs.filter((v) => !new RegExp(`^${v}=`, 'm').test(body));
      if (undef.length) { ok = false; console.error(`  ✗ ${gf} references undefined lowercase bash var(s): ${undef.join(', ')} (the \${PORT}→\${port} class)`); }
      else console.log(`  ✓ ${gf}: all lowercase bash refs defined`);
      if (gf.endsWith('editor/code') && !body.includes(':${PORT}/api/editor/open')) { ok = false; console.error(`  ✗ ${gf}: the editor URL does not use \${PORT}`); }
      else if (gf.endsWith('editor/code')) console.log(`  ✓ ${gf}: editor URL rides \${PORT}`);
    } catch (e) { ok = false; console.error(`  ✗ generated ${gf} unreadable — ${e.message}`); }
  }
}
const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws2.on('open', r));
ws2.send(JSON.stringify({ type: 'kill', sessionId: sid }));
await new Promise((r) => setTimeout(r, 1200));
ws2.close(); srv.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 300));
console.log(ok ? 'ALL PASS (2)' : 'FAIL');
process.exit(ok ? 0 : 1);
