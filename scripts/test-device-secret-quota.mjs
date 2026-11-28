#!/usr/bin/env node
// place-secret + quota-refresh device ops (2.298.0, design §Account split /
// §Quota refresh origin) against a REAL daemon. The quota op's VENDOR call is
// deliberately NOT exercised (§ban-safety: no test may contact Anthropic) —
// every gate that stops a call from happening IS: humanGated refusal,
// missing-creds honesty, expired-token honesty, daemon-side throttle.
import './scratch.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentdBundle } from './agentd-bundle.mjs';   // B-ba47's class: the daemon bundled at a stamp, nothing written under src/

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-psq-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const fakeHome = path.join(tmp, 'home'); fs.mkdirSync(fakeHome, { recursive: true });
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

const version = require('../package.json').version;
const bundle = path.join(tmp, 'agentd.js');
await agentdBundle({ version, outfile: bundle });   // build:agentd's own bundle, the stamp answered in the build (scripts/agentd-bundle.mjs): nothing written under src/

const { DeviceManager } = require('../src/agentd/client.js');
// the daemon child inherits HOME → point it at the fake home so creds reads
// and the $HOME confinement are exercised against a sandbox
process.env.HOME = fakeHome;
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
const conn = await dm.connect();
check('hello-ack advertises place-secret + quota-refresh', gateOf(conn.info.capabilities.includes('place-secret')) && verdictOf(conn.info.capabilities.includes('quota-refresh')));

try {
  // ── place-secret ──
  const dest = path.join(fakeHome, '.vibespace', 'acct-1.key');
  const p = await dm.placeSecret(dest, Buffer.from('sk-ant-api-FAKE-VALUE'), { by: 'system:test' });
  check('place-secret lands the file', fs.readFileSync(dest, 'utf-8') === 'sk-ant-api-FAKE-VALUE', p);
  const mode = fs.statSync(dest).mode & 0o777;
  check(`file is 0600 AT CREATION — no chmod window (${mode.toString(8)})`, mode === 0o600);
  const dmode = fs.statSync(path.dirname(dest)).mode & 0o777;
  check(`parent dir created 0700 (${dmode.toString(8)})`, dmode === 0o700);
  // overwrite is atomic + keeps mode
  await dm.placeSecret(dest, Buffer.from('ROTATED'), { by: 'system:test' });
  check('overwrite is atomic and keeps 0600', fs.readFileSync(dest, 'utf-8') === 'ROTATED' && (fs.statSync(dest).mode & 0o777) === 0o600);
  // confinement: outside $HOME refused
  let esc = null; try { await dm.placeSecret('/tmp/vs-escape.key', Buffer.from('x'), { by: 'system:test' }); } catch (e) { esc = e.message; }
  check('a path outside $HOME is refused', verdictOf(/inside \$HOME/.test(esc || '')), esc);
  let trav = null; try { await dm.placeSecret(path.join(fakeHome, '..', 'escape.key'), Buffer.from('x'), { by: 'system:test' }); } catch (e) { trav = e.message; }
  check('traversal out of $HOME is refused', verdictOf(/inside \$HOME/.test(trav || '')), trav);

  // ── quota-refresh gates (never reaches the vendor in ANY of these) ──
  let g1 = null; try { await dm.quotaRefresh({ humanGated: false }); } catch (e) { g1 = e.message; }
  check('humanGated:false is refused (a scheduler can never fire this op)', verdictOf(/humanGated/.test(g1 || '')), g1);
  let g2 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g2 = e.message; }
  check('no credentials on the machine → honest error, no call', verdictOf(/no credentials/.test(g2 || '')), g2);
  // expired token → honest error, NEVER refreshed
  fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.claude', '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oat-EXPIRED', expiresAt: Date.now() - 1000 } }));
  let g3 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g3 = e.message; }
  check('expired token → honest error (read-only peek, never refreshed)', verdictOf(/no valid token/.test(g3 || '')), g3);
  // FAILED preconditions must not burn the throttle slot (2.271.0 lesson) —
  // a repeat still reports the real problem, not 'throttled'
  let g4 = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g4 = e.message; }
  check('failed precondition does NOT consume the throttle slot', verdictOf(/no valid token/.test(g4 || '')), g4);
  // B-5e0d small 2: the op's refusal carries its REASON by name — the hub answers the page from it, with no second look
  // through the shell — and a LONG-LIVED token (no refresh token beside it) makes no vendor request: the reply says so
  let g4c = null; try { await dm.quotaRefresh({ humanGated: true }); } catch (e) { g4c = e.code || ('no code: ' + e.message); }
  check('B-5e0d: the expired login\'s refusal carries its reason by name (no-valid-login)', g4c === 'no-valid-login', g4c);
  fs.writeFileSync(path.join(fakeHome, '.claude', '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: ['sk', 'ant', 'oat'].join('-') + '-LONGLIVED-FAKE', expiresAt: Date.now() + 3600e3 } }));
  let ll = null, llErr = null; try { ll = await dm.quotaRefresh({ humanGated: true }); } catch (e) { llErr = e.message; }
  check('B-5e0d: a long-lived token (no refresh token beside it) → NO vendor request; the reply says «long-lived» by name, no usage, its passive cache beside it', !llErr && !!ll && ll.refused === 'long-lived' && ll.usage === null && !!ll.passive && typeof ll.passive === 'object', llErr || ll);
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
  check('subDir is sanitized (traversal chars stripped → missing-creds error, not a path escape)', verdictOf(/no credentials/.test(g5 || '')), g5);
} finally {
  try { await dm.stop?.(); } catch { }
  try { execFileSync('sh', ['-c', `pkill -f "${bundle.replace(/[/.]/g, '.')}" 2>/dev/null || true`]); } catch { }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `FAIL (${failed})` : 'ALL PASS (15)');
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
