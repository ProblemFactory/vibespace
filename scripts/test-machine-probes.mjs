#!/usr/bin/env node
// R1 — machine fact probes, one implementation for every machine
// (docs/design-three-tier.md `probe.*`).
//
// The same facts existed three ways: the local backend-status route, the ssh
// backendStatus script, and the ssh accountsStatus script — with drift bugs
// (the apiKeyHelper blind spot, the same-dialog contradictions). This test
// proves the ONE implementation: called in-process (device #0's shape) AND
// served by a REAL daemon over probe-cli/probe-creds, with identical facts —
// against a FIXTURE home so assertions are exact and no real creds are read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

// fixture home: expired machine login + console key + helper + one held sub
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-probes-'));
const w = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); };
w(path.join(home, '.claude', '.credentials.json'), { claudeAiOauth: { subscriptionType: 'max' } }); // token-LESS = expired, not never-set-up
// fixture key is CONCATENATED so no key-shaped literal exists in this file
// (the push guard rightly flags anything that looks real)
w(path.join(home, '.claude.json'), { primaryApiKey: 'sk-ant-' + 'fixture-not-a-real-key-' + 'TAIL1234', oauthAccount: { emailAddress: 'user@example.com' } });
w(path.join(home, '.claude', 'settings.json'), { apiKeyHelper: '/x/helper.sh' });
w(path.join(home, '.vibespace', 'subs', 'sub-h1', '.credentials.json'), { claudeAiOauth: { accessToken: 'tok' } });
w(path.join(home, '.vibespace', 'subs', 'sub-h1', '.claude.json'), { oauthAccount: { emailAddress: 'held@example.com' } });
w(path.join(home, '.vibespace', 'subs', 'sub-h1', '.vibespace-login-status.json'), { state: 'success', attempt: 'attempt-12345678' });
w(path.join(home, '.codex', 'auth.json'), { tokens: { id_token: 'x.' + Buffer.from(JSON.stringify({ email: 'cx@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })).toString('base64url') + '.y' } });

// ── in-process call under the fixture home ──
const origHome = os.homedir;
os.homedir = () => home; // module reads os.homedir() at call time
delete require.cache[require.resolve(REPO + '/src/machine-probes.js')];
const probes = require(REPO + '/src/machine-probes.js');
const creds = await probes.credsFacts();
ok(creds.subscription.loggedIn === false && creds.subscription.email === 'user@example.com', 'expired machine login: loggedIn=false but identity email read');
ok(creds.cliKey.present && creds.cliKey.tail === 'TAIL1234', 'console primaryApiKey detected with tail');
ok(creds.keyHelper === true, 'apiKeyHelper reported as the INDEPENDENT flag (the 2.191.0 class)');
ok(creds.hostSubs.length === 1 && creds.hostSubs[0] === 'sub-h1', 'held sub dir with a real token counted');
ok(creds.hostSubEmails['sub-h1'] === 'held@example.com', 'held-dir identity email (the auto-merge anchor)');
ok(creds.hostSubLoginStatus['sub-h1']?.state === 'success', 'on-host login helper marker parsed');
ok(creds.codex.email === 'cx@example.com' && creds.codex.plan === 'pro', 'codex JWT identity decoded');
const cli = await probes.cliFacts({ claudeCmd: '/nonexistent-claude', codexCmd: '/nonexistent-codex' });
ok(cli.claude.installed === false && cli.claude.machineLoginState === 'expired', 'cliFacts: token-less claudeAiOauth reads EXPIRED, never "never set up"');
ok(cli.claude.loggedIn === true && cli.claude.loginMethod === 'console-key', 'login ladder: console key wins when no oauth token');
os.homedir = origHome;

// ── the same facts served by a REAL daemon over the op ──
const { spawn } = await import('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-probes-root-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-probes-data-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(root, 'agentd');
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
// daemon child runs with HOME pointed at the fixture → its probe ops must
// report the fixture facts (proving the bundled module reads ITS machine)
const origSpawn = (await import('node:child_process')).spawn;
process.env.HOME = home; // DeviceManager spawns the daemon inheriting env
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-test', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();
const viaOp = await dm.probeCreds();
ok(!!viaOp?.facts, 'daemon answers probe-creds');
const f = viaOp.facts;
ok(f.cliKey?.tail === 'TAIL1234' && f.keyHelper === true && f.hostSubs?.[0] === 'sub-h1' && f.codex?.email === 'cx@example.com',
  'daemon-served facts IDENTICAL to the in-process call (one implementation, two transports)');
const viaCli = await dm.probeCli();
ok(!!viaCli?.facts?.claude, 'daemon answers probe-cli');
ok(viaCli.facts.claude.loginMethod === 'console-key', 'daemon cli login ladder matches');

try { const pid = parseInt(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf-8')); if (pid) process.kill(pid); } catch { }
fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
