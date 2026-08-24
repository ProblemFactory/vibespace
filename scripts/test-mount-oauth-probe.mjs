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
const mk = (probeResults, readResults = []) => {
  const calls = [], readCalls = [];
  const self = {
    _revocable: P._revocable,
    _oauthBacked: P._oauthBacked,
    _accessErrorMsg: P._accessErrorMsg,
    _errors: new Map(),
    _probeBackendAccess: async (m) => { calls.push(m.id); return probeResults.shift() ?? 'ok'; },
    _probeBackendRead: async (m) => { readCalls.push(m.id); return readResults.shift() ?? 'ok'; },
    _probeMountpoint: async () => 'ok',
  };
  return { self, calls, readCalls, run: (m, health = 'ok') => P._accessErrorFor.call(self, m, '/mp', health) };
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

// ── 2b. the 2.368.8 refinement: listing fine ≠ reads fine ──
// The REAL incident passed `lsf` — token refresh, listings and uploads all
// worked while every download 401'd (pinned rclone 1.65.2 vs Microsoft's
// migrated consumer OneDrive). A list-only probe called this mount healthy.
{
  const { self, readCalls, run } = mk(['ok'], ['denied']);
  const msg = await run(OD, 'ok');
  ok('lsf-passing mount still gets a 1-byte READ probe', readCalls.length === 1);
  ok('download-denied while listing works ⇒ its own message (reconnect, NOT re-authorize)', /downloads are rejected/i.test(msg || '') && !/re-authorize/i.test(msg || ''));
  self._errors.set('od1', msg);
  const r2 = await run(OD, 'ok'); // read probe now returns 'ok' (default)
  ok('…and a recovered download clears it', r2 === null);
}
{
  const { readCalls, run } = mk(['ok'], ['ok']);
  const r = await run(OD, 'ok');
  ok('downloads fine ⇒ no error', r === null && readCalls.length === 1);
}

// ── 2c. the pin + self-heal (a pin bump must REACH existing installs) ──
{
  const { MountManager: MM } = require(path.join(REPO, 'src/mounts.js'));
  ok('rclone pin is v1.69.3 (1.65.2 fails migrated consumer OneDrive downloads; 1.69.x fixes it AND stays in the Cloudflare-STS-safe 1.63–1.69 range)', MM.RCLONE_PIN === 'v1.69.3');
  const src = read('src/mounts.js');
  ok('boot self-heal exists and only touches OUR data/bin install (PATH rclone is the user\'s)', /maybeUpgradePinnedRclone\(\)\s*{[\s\S]{0,200}if \(!fs\.existsSync\(local\)\)/.test(src));
  // 2.368.9: the binary is untracked from git (a 60MB arch-specific blob in a
  // public repo, growing history on every pin bump; and a boot self-heal that
  // writes a TRACKED file is the dirty-tree-blocks-git-pull class). The update
  // pull therefore DELETES the copy old releases committed — boot must
  // reinstall when a mount needs rclone and the PATH has none.
  ok('the binary is gitignored (never tracked again)', /^data\/bin\/rclone$/m.test(read('.gitignore')) && /^data\/bin\/rclone-dl\.zip$/m.test(read('.gitignore')));
  ok('a missing binary is reinstalled at boot when mounts need it', /needsRclone && !this\.rcloneAvailable\(\)[\s\S]{0,300}installRclone\(\)/.test(src));
  ok('…and restore() wires it', /async restore\(\)\s*{\s*\n\s*this\.maybeUpgradePinnedRclone\(\)/.test(src));
  ok('the read probe classifies the OAuth-death phrasings too', /_probeBackendRead[\s\S]{0,1400}401\|403\|Unauthorized\|unauthenticated\|invalid_grant/.test(src));
}

// ── 3. phrasing pins across the chain ──
{
  const src = read('src/mounts.js');
  ok("probe classifies rclone's OAuth-death phrasings as denied (unauthenticated / invalid_grant / InvalidAuthenticationToken)",
    /401\|403\|Unauthorized\|unauthenticated\|invalid_grant\|InvalidAuthenticationToken/.test(src));
  // 2.368.7 (same incident, second half): an EIO-wedged daemon SURVIVES
  // `fusermount -uz`, so the re-auth bounce stacked a fresh daemon on top of
  // the dead-token one and changed nothing (4 leaked daemons found on the
  // box). unmount() must not resolve until the daemon is GONE, and mount()
  // must never spawn onto a path a stale daemon still serves.
  ok('unmount() verifies the daemon died before resolving (kills survivors)',
    /ensureDaemonGone[\s\S]{0,400}_daemonAlive\(mp\)[\s\S]{0,200}_killMountDaemon\(mp\)/.test(src));
  ok('…and every fuse unmount path goes through it (3 call sites: fusermount3/fusermount/umount -l)', (src.match(/ensureDaemonGone\(/g) || []).length >= 3);
  ok('mount() kills a stale daemon before spawning (never stack)',
    /stale daemon still on[\s\S]{0,200}_killMountDaemon\(mp\)/.test(src));
  const sb = read('src/lib/sidebar-mounts.js');
  ok('the client Re-authorize button matches the new health message', /invalid_grant\|token expired\|couldn.t fetch token\|unauthenticated\|re-authorize/.test(sb));
  ok('…and OneDrive rows are eligible for it', /_isDriveBacked\(m\)\s*{[^}]*'onedrive'/.test(sb));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
