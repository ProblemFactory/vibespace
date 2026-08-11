#!/usr/bin/env node
// place-secret + quota-refresh device ops (2.298.0, design §Account split /
// §Quota refresh origin) against a REAL daemon. The quota op's VENDOR call is
// deliberately NOT exercised (§ban-safety: no test may contact Anthropic) —
// every gate that stops a call from happening IS: humanGated refusal,
// missing-creds honesty, expired-token honesty, daemon-side throttle.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-psq-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const fakeHome = path.join(tmp, 'home'); fs.mkdirSync(fakeHome, { recursive: true });
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
// the daemon child inherits HOME → point it at the fake home so creds reads
// and the $HOME confinement are exercised against a sandbox
process.env.HOME = fakeHome;
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
const conn = await dm.connect();
check('hello-ack advertises place-secret + quota-refresh', conn.info.capabilities.includes('place-secret') && conn.info.capabilities.includes('quota-refresh'));

try {
  // ── place-secret ──
  const dest = path.join(fakeHome, '.vibespace', 'acct-1.key');
  const p = await dm.placeSecret(dest, Buffer.from('sk-ant-api-FAKE-VALUE'));
  check('place-secret lands the file', fs.readFileSync(dest, 'utf-8') === 'sk-ant-api-FAKE-VALUE', p);
  const mode = fs.statSync(dest).mode & 0o777;
  check(`file is 0600 AT CREATION — no chmod window (${mode.toString(8)})`, mode === 0o600);
  const dmode = fs.statSync(path.dirname(dest)).mode & 0o777;
  check(`parent dir created 0700 (${dmode.toString(8)})`, dmode === 0o700);
  // overwrite is atomic + keeps mode
  await dm.placeSecret(dest, Buffer.from('ROTATED'));
  check('overwrite is atomic and keeps 0600', fs.readFileSync(dest, 'utf-8') === 'ROTATED' && (fs.statSync(dest).mode & 0o777) === 0o600);
  // confinement: outside $HOME refused
  let esc = null; try { await dm.placeSecret('/tmp/vs-escape.key', Buffer.from('x')); } catch (e) { esc = e.message; }
  check('a path outside $HOME is refused', /inside \$HOME/.test(esc || ''), esc);
  let trav = null; try { await dm.placeSecret(path.join(fakeHome, '..', 'escape.key'), Buffer.from('x')); } catch (e) { trav = e.message; }
  check('traversal out of $HOME is refused', /inside \$HOME/.test(trav || ''), trav);

  // ── quota-refresh gates (never reaches the vendor in ANY of these) ──
  let g1 = null; try { await dm.quotaRefresh({ humanGated: false }); } catch (e) { g1 = e.message; }
  check('humanGated:false is refused (a scheduler can never fire this op)', /humanGated/.test(g1 || ''), g1);
  let g2 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g2 = e.message; }
  check('no credentials on the machine → honest error, no call', /no credentials/.test(g2 || ''), g2);
  // expired token → honest error, NEVER refreshed
  fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.claude', '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oat-EXPIRED', expiresAt: Date.now() - 1000 } }));
  let g3 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g3 = e.message; }
  check('expired token → honest error (read-only peek, never refreshed)', /no valid token/.test(g3 || ''), g3);
  // FAILED preconditions must not burn the throttle slot (2.271.0 lesson) —
  // a repeat still reports the real problem, not 'throttled'
  let g4 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g4 = e.message; }
  check('failed precondition does NOT consume the throttle slot', /no valid token/.test(g4 || ''), g4);
  // the throttle itself cannot be exercised live without a vendor call
  // (§ban-safety) — its position is pinned structurally: stamp AFTER token
  // validation, BEFORE the request
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  const opBody = src.slice(src.indexOf("msg.op === 'quota-refresh'"), src.indexOf("msg.op === 'probe-cli'"));
  check('throttle stamp sits AFTER token validation, BEFORE the vendor request',
    opBody.indexOf('never refreshed here') < opBody.indexOf("_quotaAt.set(credsPath, Date.now())")
    && opBody.indexOf("_quotaAt.set(credsPath, Date.now())") < opBody.indexOf('api.anthropic.com'));
  // subDir variant sanitizes + reads the sub path
  let g5 = null; try { await dm.quotaRefresh({ humanGated: true, subDir: '../../etc' }); } catch (e) { g5 = e.message; }
  check('subDir is sanitized (traversal chars stripped → missing-creds error, not a path escape)', /no credentials/.test(g5 || ''), g5);
} finally {
  try { await dm.stop?.(); } catch { }
  try { execFileSync('sh', ['-c', `pkill -f "${bundle.replace(/[/.]/g, '.')}" 2>/dev/null || true`]); } catch { }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `FAIL (${failed})` : 'ALL PASS (12)');
process.exit(failed ? 1 : 0);
