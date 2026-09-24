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

// ── 4. D2 (design-integrations-per-account §6): switching a Drive record's
// OAuth client IS a re-authorization — the new client lands on the record
// TOGETHER with the token minted under it (never a new client beside the old
// token: that was the silent edit, `invalid_client` at the next refresh), and
// the children bounce onto the new pair. A real MountManager in a scratch dir;
// mount/unmount stubbed (no rclone). ──
{
  const { scratch } = await import('./scratch.mjs');
  const dataDir = scratch('mount-client-switch');
  fs.rmSync(dataDir, { recursive: true, force: true }); fs.mkdirSync(dataDir, { recursive: true });
  try {
    const mm = new MountManager({ dataDir, broadcast: () => {} });
    const bounces = [];
    mm.isMounted = (m) => m.desired === 'mounted';
    mm.unmount = async (id) => { bounces.push('unmount:' + id); };
    mm.mount = async (id) => { bounces.push('mount:' + id); };
    const tok = (s) => JSON.stringify({ access_token: 'AT_' + s, refresh_token: 'RT_' + s, expiry: '2027-01-01T00:00:00Z' });
    const credId = mm.add({ type: 'drive', name: 'team-drive', token: tok('old'), clientPreset: 'acme' });
    await mm.convert(credId, 'credential'); // the login-only record its mount points resolve through
    const childId = mm.addChild(credId, { name: 'team-drive-docs', driveFolder: 'Docs' });
    mm._get(childId).desired = 'mounted';
    const rec = () => mm._get(credId);
    bounces.length = 0;
    await mm.applyDriveToken(credId, tok('lab'), { clientPreset: 'lab' });
    ok('D2 server: the switch writes the NEW preset and the token minted under it, together',
      rec().clientPreset === 'lab' && mm._dec(rec().tokenEnc) === tok('lab') && !rec().clientId);
    ok('D2 server: …and the children bounce onto the new pair (unmount + mount)',
      bounces.includes('unmount:' + childId) && bounces.includes('mount:' + childId));
    await mm.applyDriveToken(credId, tok('custom'), { clientId: 'cid-2.apps.example.test', clientSecret: 'sec-2' });
    ok('D2 server: a switch to a custom client stores the id + the sealed secret and drops the preset (custom wins at resolve — a leftover preset would be dead weight)',
      rec().clientId === 'cid-2.apps.example.test' && mm._dec(rec().clientSecretEnc) === 'sec-2' && rec().clientPreset === null && mm._dec(rec().tokenEnc) === tok('custom'));
    ok('D2 server: …and the stored secret is sealed, never plain on the record', !JSON.stringify(rec()).includes('sec-2'));
    await mm.applyDriveToken(credId, tok('back'), { clientPreset: 'acme' });
    ok('D2 server: back to a preset CLEARS the custom id + secret (a leftover custom id would still win at resolve: the preset token under the custom client = invalid_client)',
      rec().clientPreset === 'acme' && !rec().clientId && !rec().clientSecretEnc);
    await mm.applyDriveToken(credId, tok('plain'));
    ok('D2 server: a plain re-authorize (no client) leaves the client alone', rec().clientPreset === 'acme' && mm._dec(rec().tokenEnc) === tok('plain'));
    let e1 = null; try { await mm.applyDriveToken(credId, tok('x'), { clientId: 'cid-3' }); } catch (e) { e1 = e; }
    ok('D2 server: a custom client without its secret is refused by name, the record untouched',
      /secret/i.test(e1?.message || '') && rec().clientPreset === 'acme' && mm._dec(rec().tokenEnc) === tok('plain'));
    const odId = mm.add({ type: 'onedrive', name: 'od', token: tok('od') });
    let e2 = null; try { await mm.applyDriveToken(odId, tok('od2'), { clientPreset: 'acme' }); } catch (e) { e2 = e; }
    ok('D2 server: a client switch on a non-Drive record is refused by name (the storage switch is Drive + Gmail; Gmail lands through its PATCH)',
      /Google Drive/.test(e2?.message || '') && mm._dec(mm._get(odId).tokenEnc) === tok('od'));
    // Gmail: the switch finishes through PATCH {clientPreset, token} — the
    // existing update() writes both in one save and restarts the sync
    const gmId = mm.add({ type: 'gmail', name: 'inbox', token: tok('gm'), clientPreset: 'acme' });
    mm._get(gmId).desired = 'mounted'; bounces.length = 0;
    await mm.update(gmId, { clientPreset: 'lab', token: tok('gm-lab') });
    ok('D2 server: a Gmail switch lands the preset + its token in ONE update, and the sync restarts',
      mm._get(gmId).clientPreset === 'lab' && mm._dec(mm._get(gmId).tokenEnc) === tok('gm-lab') && bounces.includes('mount:' + gmId));
    const wiring = read('src/server/mounts-plugins-wiring.js');
    ok('D2 server: the drive-token route hands the body\'s `client` through', /applyDriveToken\(req\.params\.id, req\.body\?\.token, req\.body\?\.client\)/.test(wiring));
    // integrations r1 (verifier finding 1): D2 held ONLY in the storage Edit
    // dialog — any other caller (a script, an older bundle, a plugin) could
    // PATCH {clientPreset} and re-point a record beside the token minted
    // under the old client. The server refuses it by name now; the client
    // lands WITH its token (drive-token {token, client} / Gmail PATCH
    // {clientPreset, token}).
    const drId = mm.add({ type: 'drive', name: 'dr-d2', token: tok('org1'), clientPreset: 'org1' });
    let e3 = null; try { await mm.update(drId, { clientPreset: 'org2' }); } catch (e) { e3 = e; }
    ok('D2 server: a bare PATCH {clientPreset} on a Drive record holding a token is REFUSED by name (client-change-needs-reauth), the record untouched',
      e3?.code === 'client-change-needs-reauth' && /Re-authorize/.test(e3?.message || '') && mm._get(drId).clientPreset === 'org1' && mm._dec(mm._get(drId).tokenEnc) === tok('org1'), e3 ? `${e3.code}: ${e3.message}` : 'no refusal');
    let e4 = null; try { await mm.update(drId, { clientId: 'cid-9.apps.example.test', clientSecret: 'sec-9' }); } catch (e) { e4 = e; }
    ok('D2 server: …and so is a bare switch to a custom client id (the custom id wins at resolve)',
      e4?.code === 'client-change-needs-reauth' && !mm._get(drId).clientId && !mm._get(drId).clientSecretEnc, e4 ? e4.code : 'no refusal');
    let e5 = null; try { await mm.update(drId, { clientPreset: 'org1', driveFolder: 'Docs' }); } catch (e) { e5 = e; }
    ok('D2 server: an UNCHANGED client beside other edits saves (no false refusal)', !e5 && mm._get(drId).driveFolder === 'Docs', e5?.message);
    let e5b = null; try { await mm.update(drId, { clientSecret: 'rotated-secret' }); } catch (e) { e5b = e; }
    ok('D2 server: a rotated secret alone is not a client switch (the secret is not the identity)', !e5b, e5b?.message);
    let e6 = null; try { await mm.update(drId, { clientPreset: 'org2', token: tok('org2-pasted') }); } catch (e) { e6 = e; }
    ok('D2 server: a client switch that carries its own token lands together (the user bringing their own)',
      !e6 && mm._get(drId).clientPreset === 'org2' && mm._dec(mm._get(drId).tokenEnc) === tok('org2-pasted'), e6?.message);
    let e7 = null; try { await mm.update(gmId, { clientPreset: 'acme' }); } catch (e) { e7 = e; }
    ok('D2 server: a bare Gmail PATCH {clientPreset} beside its token is refused by name too',
      e7?.code === 'client-change-needs-reauth' && mm._get(gmId).clientPreset === 'lab', e7 ? e7.code : 'no refusal');
    ok('D2 server: the PATCH route answers the refusal 409 with its code (never a 200 over a split record)',
      /app\.patch\('\/api\/mounts\/:id'[\s\S]{0,400}e\.code === 'client-change-needs-reauth' \? 409/.test(wiring) && /code: e\.code/.test(wiring.slice(wiring.indexOf("app.patch('/api/mounts/:id'"), wiring.indexOf("app.patch('/api/mounts/:id'") + 500)));
    // integrations r1 (verifier finding 2): drive-token {client:{}} was read
    // as "built-in" and wiped the record's preset beside a token minted
    // elsewhere — the client must NAME itself
    await mm.applyDriveToken(drId, tok('org2b'), { clientPreset: 'org2' });
    for (const [label, client] of [['{}', {}], ['{clientSecret} alone', { clientSecret: 'x' }], ['a bare string', 'org1']]) {
      let e8 = null; try { await mm.applyDriveToken(drId, tok('stray'), client); } catch (e) { e8 = e; }
      ok(`D2 server: drive-token with client ${label} is refused by name, the record's client and token untouched`,
        /must name a preset/.test(e8?.message || '') && mm._get(drId).clientPreset === 'org2' && mm._dec(mm._get(drId).tokenEnc) === tok('org2b'), e8?.message || `clientPreset now ${mm._get(drId).clientPreset}`);
    }
    await mm.applyDriveToken(drId, tok('builtin'), { clientPreset: '' });
    ok('D2 server: …while {clientPreset: ""} is the explicit built-in choice', mm._get(drId).clientPreset === null && !mm._get(drId).clientId && mm._dec(mm._get(drId).tokenEnc) === tok('builtin'));
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
