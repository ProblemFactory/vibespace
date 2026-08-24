#!/usr/bin/env node
// A dead OAuth refresh token hides behind a HEALTHY-looking mount (2.368.6,
// owner's real OneDrive incident): the fuse dir cache keeps `ls` working while
// every file download fails "unauthenticated: Unauthenticated" — so the UI
// showed a fine mount whose every file open was EIO, the health sweep never
// probed the backend (_revocable said "my own Drive can't expire"), and even
// the probe's denied-regex had no phrasing for it. This suite pins the whole
// detection chain: OAuth-backed mounts get the backend probe (on a slow
// clock), the auth-death phrasings classify as denied, the health message
// names the fix, and the client's Re-authorize button matches it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const P = MountManager.prototype;

// ── 1. which mounts count as OAuth-backed ──
{
  const is = (m) => P._oauthBacked.call({}, m);
  ok('onedrive is OAuth-backed', is({ type: 'onedrive' }));
  ok('drive is OAuth-backed', is({ type: 'drive' }));
  ok('generic cloud is OAuth-backed', is({ type: 'cloud' }));
  ok('legacy rclone record with an OAuth backend counts', is({ type: 'rclone', rcloneType: 'dropbox' }));
  ok('s3 is NOT (no token to die)', !is({ type: 's3' }) && !is({ type: 'rclone', rcloneType: 's3' }));
}

// ── 2. the incident shape: healthy mountpoint, dead token ──
const mk = (probeResults) => {
  const calls = [];
  const self = {
    _revocable: P._revocable,
    _oauthBacked: P._oauthBacked,
    _accessErrorMsg: P._accessErrorMsg,
    _errors: new Map(),
    _probeBackendAccess: async (m) => { calls.push(m.id); return probeResults.shift() ?? 'ok'; },
    _probeMountpoint: async () => 'ok',
  };
  return { self, calls, run: (m, health = 'ok') => P._accessErrorFor.call(self, m, '/mp', health) };
};
const OD = { id: 'od1', type: 'onedrive', origin: 'rclone-conf' };
{
  const { self, calls, run } = mk(['denied']);
  const msg = await run(OD, 'ok');
  ok('HEALTHY mountpoint + dead token ⇒ backend probe runs and surfaces the error', calls.length === 1 && /sign-in has expired|re-authorize/i.test(msg || ''));
  ok('the message names the FIX, not just the symptom', /re-authorize/i.test(msg || ''));
  self._errors.set('od1', msg);
  const again = await run(OD, 'ok');
  ok('while the auth error shows, every sweep re-probes (recovery must clear fast)', calls.length === 2);
  ok('…and a recovered token CLEARS the error', again === null);
}
{
  const { calls, run } = mk(['ok', 'ok']);
  await run(OD, 'ok');
  await run(OD, 'ok');
  ok('healthy + no error ⇒ the provider is probed ONCE, not on every 60s sweep (slow clock)', calls.length === 1);
}
{
  const { calls, run } = mk(['ok']);
  const r = await run({ id: 's31', type: 's3' }, 'ok');
  ok('a healthy non-OAuth mount never gets the backend probe', calls.length === 0 && r === null);
}
{
  const { calls, run } = mk(['denied']);
  const msg = await run(OD, 'error');
  ok('a failing mountpoint probes immediately regardless of the clock', calls.length === 1 && /re-authorize/i.test(msg || ''));
}

// ── 3. phrasing pins across the chain ──
{
  const src = read('src/mounts.js');
  ok("probe classifies rclone's OAuth-death phrasings as denied (unauthenticated / invalid_grant / InvalidAuthenticationToken)",
    /401\|403\|Unauthorized\|unauthenticated\|invalid_grant\|InvalidAuthenticationToken/.test(src));
  const sb = read('src/lib/sidebar-mounts.js');
  ok('the client Re-authorize button matches the new health message', /invalid_grant\|token expired\|couldn.t fetch token\|unauthenticated\|re-authorize/.test(sb));
  ok('…and OneDrive rows are eligible for it', /_isDriveBacked\(m\)\s*{[^}]*'onedrive'/.test(sb));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
