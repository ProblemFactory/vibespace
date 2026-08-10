#!/usr/bin/env node
// OneDrive drive_id/drive_type resolution (2.268.8) — rclone's onedrive
// backend refuses to create the fs without both in config, and the guided
// add flow has no rclone-config step to resolve them. This exercises the
// Graph resolution helper + the re-auth token write-back accepting onedrive,
// with a mocked Graph endpoint (no network, no rclone).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { MountManager } = require('../src/mounts.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } };

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-od-test-'));
const mm = new MountManager({ dataDir, broadcast: () => {} });

const token = JSON.stringify({ access_token: 'FAKE_AT', refresh_token: 'FAKE_RT', expiry: '2027-01-01T00:00:00Z' });
const recId = mm.add({ type: 'onedrive', name: 'OD test', token });
ok(!mm._get(recId).driveId, 'fresh native add has no driveId (the bug precondition)');

// Mock Graph: /v1.0/me/drive answers per the current access token.
const realFetch = global.fetch;
let graphCalls = 0;
let mode = 'ok';
global.fetch = async (url, opts) => {
  graphCalls++;
  if (!String(url).includes('/v1.0/me/drive')) throw new Error('unexpected fetch: ' + url);
  if (mode === '401' || !(opts?.headers?.Authorization || '').includes('FAKE')) {
    return { ok: false, status: 401, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => ({ id: 'b!DRIVEID123', driveType: 'business' }) };
};

try {
  const m = mm._get(recId);

  // 1. Resolution fills drive_id + drive_type from Graph.
  await mm._resolveOneDriveDrive(m);
  ok(m.driveId === 'b!DRIVEID123', 'resolution sets driveId from Graph');
  ok(m.driveType === 'business', 'resolution sets driveType from Graph');

  // 2. The rclone env builder now carries both (what rclone was missing).
  const { env } = mm._rcloneFor(m);
  const p = (k) => env['RCLONE_CONFIG_VS_' + k];
  ok(p('DRIVE_ID') === 'b!DRIVEID123' && p('DRIVE_TYPE') === 'business', 'rclone env carries DRIVE_ID + DRIVE_TYPE');

  // 3. Expired token → honest error (contains "token expired" so the row
  //    re-auth button regex fires), never rclone's cryptic upgrade message.
  m.driveId = null; mode = '401';
  let err = null;
  try { await mm._resolveOneDriveDrive(m); } catch (e) { err = e; }
  ok(/token expired/i.test(err?.message || ''), 'expired token yields an honest "token expired" error');

  // 4. applyDriveToken accepts a OneDrive record (used to throw "Not a
  //    Google Drive connection") and resolves the drive with the fresh token.
  mode = 'ok';
  await mm.applyDriveToken(recId, token);
  const m2 = mm._get(recId);
  ok(m2.driveId === 'b!DRIVEID123', 're-auth write-back resolves the drive (fresh token)');
  ok(mm._dec(m2.tokenEnc) === token, 're-auth wrote the token onto the onedrive record');

  // 5. Explicit user driveId is never overridden by a re-auth.
  m2.driveId = 'b!EXPLICIT'; graphCalls = 0;
  await mm.applyDriveToken(recId, token);
  ok(m2.driveId === 'b!EXPLICIT' && graphCalls === 0, 'explicit driveId survives re-auth (no Graph call)');
} finally {
  global.fetch = realFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
