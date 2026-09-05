#!/usr/bin/env node
// Codex sandbox must keep LOOPBACK open for the VibeSpace agent tools
// (2.369.17, docs/design-harness-plugins.md §1 P0): codex's workspaceWrite /
// readOnly policies default to networkAccess:false and the seccomp filter
// closes 127.0.0.1 too, so every vibespace-* CLI call from a non-yolo codex
// chat failed with EPERM. Functional A/B against the real `codex sandbox`
// when the binary exists (evidence-carrying SKIP otherwise) + static pins.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const SKIP = (n, why) => { skip++; console.log('  ~ SKIP ' + n + ' — ' + why); };
const run = (cmd, args, opts = {}) => new Promise((r) => execFile(cmd, args, { timeout: 30000, ...opts }, (err, stdout, stderr) => r({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));

// ── static pins ──
const wrapper = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
ok(/const NET_OPEN = !!process\.env\.VIBESPACE_API;/.test(wrapper), 'wrapper opens the sandbox network only when the VibeSpace integration is on (VIBESPACE_API)');
ok(/type: 'readOnly', networkAccess: NET_OPEN/.test(wrapper) && (wrapper.match(/type: 'workspaceWrite', networkAccess: NET_OPEN/g) || []).length === 2, 'readOnly + both workspaceWrite policies (default, safe-yolo) carry networkAccess');
ok(!/type: 'dangerFullAccess', networkAccess/.test(wrapper), 'dangerFullAccess is untouched (no such field)');
const adapter = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
ok(/commonArgs\.push\('-c', 'sandbox_workspace_write\.network_access=true'\)/.test(adapter), "terminal path pushes the BARE TOML boolean override (a JSON-quoted 'true' is a string)");
ok(/resolvedPermission\.sandbox === 'workspace-write'\) commonArgs\.push\('-c', 'sandbox_workspace_write/.test(adapter), '…only for workspace-write (danger-full-access needs none; read-only has no such config key)');
const cliEnv = fs.readFileSync(path.join(REPO, 'src/server/cli-env.js'), 'utf8');
ok(/execFile\(CODEX_CMD, \['sandbox', '--', 'true'\]/.test(cliEnv) && /probeCodexSandbox\(adapterRegistry\)/.test(cliEnv), 'sandbox support is probed FUNCTIONALLY (`codex sandbox -- true`, async) and written back to the adapter');
ok(/const CODEX_SANDBOX_SUPPORTED = true;/.test(cliEnv), 'assume-supported until the probe answers (sandboxed is the safe default; the old PATH lookup ran terminals unsandboxed on every npm install)');
// the adapter still honours a false verdict (degraded path)
const { CodexAdapter } = require(path.join(REPO, 'src/adapters/codex.js'));
const degraded = new CodexAdapter({ codexCmd: 'codex', codexSandboxSupported: false, chatWrapper: '/x', ptyWrapper: '/y' }).buildSessionArgs({ cwd: '/tmp', permissionMode: 'default', mode: 'terminal' });
ok(degraded.args.includes('danger-full-access') && !degraded.args.join(' ').includes('network_access'), 'a failed probe still degrades to danger-full-access with no network override');
const sandboxed = new CodexAdapter({ codexCmd: 'codex', codexSandboxSupported: true, chatWrapper: '/x', ptyWrapper: '/y' }).buildSessionArgs({ cwd: '/tmp', permissionMode: 'default', mode: 'terminal' });
ok(sandboxed.args.includes('workspace-write') && sandboxed.args.join(' ').includes('sandbox_workspace_write.network_access=true'), 'a supported sandbox keeps workspace-write AND opens loopback for the tools');

// ── functional A/B (real codex sandbox) ──
const which = await run('sh', ['-c', 'command -v codex']);
const codex = which.stdout.trim();
if (!codex) {
  SKIP('functional loopback A/B', 'codex binary not on PATH (CI runner)');
} else {
  const ver = (await run(codex, ['--version'])).stdout.trim();
  const srv = net.createServer((s) => { s.on('error', () => {}); s.end('hi'); }); // the probe exits on connect → server-side ECONNRESET is expected
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // The probe reports through a FILE, not stdout: Node's child stdio "pipes"
  // are AF_UNIX socketpairs, and the network-disabled seccomp filter swallows
  // writes to them — a stdout-based negative control read as "no output"
  // (exit 0, nothing printed) while the same command under a real pipe prints
  // ERR-EPERM. Redirecting to a regular file sidesteps the socket path.
  const outA = path.join(os.tmpdir(), `vs-sbx-closed-${process.pid}.out`), outB = path.join(os.tmpdir(), `vs-sbx-open-${process.pid}.out`);
  const probeJs = (out) => `const n=require('net');const fs=require('fs');const w=(m)=>{fs.writeFileSync(${JSON.stringify(out)},m);process.exit(0)};const s=n.connect(${port},'127.0.0.1');s.on('connect',()=>w('CONNECT-OK'));s.on('error',e=>w('ERR-'+e.code));setTimeout(()=>w('TIMEOUT'),8000)`;
  const closed = await run(codex, ['sandbox', '-c', 'sandbox_mode="workspace-write"', '--', 'node', '-e', probeJs(outA)], { cwd: '/tmp' });
  const open = await run(codex, ['sandbox', '-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.network_access=true', '--', 'node', '-e', probeJs(outB)], { cwd: '/tmp' });
  const readOut = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } finally { try { fs.unlinkSync(p); } catch {} } };
  closed.stdout = readOut(outA); open.stdout = readOut(outB);
  srv.close();
  if (closed.err && /unrecognized|unexpected argument|not supported|No such file/i.test(closed.stderr + closed.err.message)) {
    SKIP('functional loopback A/B', `this codex (${ver}) has no usable \`codex sandbox\` on this kernel: ${(closed.stderr || closed.err.message).trim().slice(0, 120)}`);
  } else {
    ok(/ERR-EPERM/.test(closed.stdout), `negative control (${ver}): default workspace-write sandbox blocks loopback (${closed.stdout.trim() || closed.stderr.trim().slice(0, 80)})`);
    ok(/CONNECT-OK/.test(open.stdout), 'with sandbox_workspace_write.network_access=true the same sandbox reaches loopback');
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skip} skipped)` : `\nALL PASS (${pass}, ${skip} skipped)`);
process.exit(fail ? 1 : 0);
