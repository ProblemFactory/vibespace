#!/usr/bin/env node
// CODEX'S SANDBOX KEEPS LOOPBACK OPEN — THE STATIC PINS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-codex-sandbox-net.mjs, whose adapter legs and the real `codex sandbox` A/B stay there:
// the wrapper's network switch, the adapter's TOML override and the probe in cli-env. Each reads the file it pins BY NAME, so
// ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-codex-sandbox-net-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);

process.exit(fail ? 1 : 0);
