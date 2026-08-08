// Pooled pseudo-account (B-6217) — store-level e2e against a throwaway data dir.
// Guards the invariants the design rests on: the pool dir is ALWAYS a symlink,
// re-pointing is atomic and visible, spawn resolution follows it, deleting a
// pool never touches a real account's credentials, and refresh writes made
// through the pool land in the canonical account dir.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccountManager } = require(path.resolve('src/accounts.js'));

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pool-'));
let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

const am = new AccountManager({ dataDir: DATA });
const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'),
  JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });

const A = am.createSubscription({ name: 'Acct A' }).id; login(A);
const B = am.createSubscription({ name: 'Acct B' }).id; login(B);
const C = am.createSubscription({ name: 'Never logged in' }).id; // deliberately no creds

if (!am.poolSupported()) { console.log('SKIP — pooled accounts are unsupported on ' + process.platform); process.exit(0); }

const { id: P } = am.createPool({ name: 'Pool' });
ck('pool dir is a SYMLINK, never a real directory', fs.lstatSync(am.subDir(P)).isSymbolicLink());
ck('pool resolves to a logged-in member', [A, B].includes(am.poolCurrent(P)));
ck('member options exclude the never-logged-in account', !am.poolMembers(P).some((m) => m.id === C));

am.setPoolTarget(P, A);
ck('spawn env points at the POOL dir (so a re-point moves it)', am.resolveForSpawn(P).localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR === am.subDir(P));
ck('resolveForSpawn reports the real target', am.resolveForSpawn(P).poolTarget === A);
ck('identity reads through the symlink', am.readSubCreds(P).loggedIn === true);

// a credential refresh performed BY THE CLI through the pool path
const credThroughPool = path.join(am.subDir(P), '.credentials.json');
const tmp = credThroughPool + '.tmp';
fs.writeFileSync(tmp, JSON.stringify({ claudeAiOauth: { accessToken: 'rotated', refreshToken: 'r2', expiresAt: Date.now() + 36e5 } }));
fs.renameSync(tmp, credThroughPool);
ck('atomicWrite through the pool keeps it a symlink', fs.lstatSync(am.subDir(P)).isSymbolicLink());
ck('the refresh landed in the CANONICAL account dir', JSON.parse(fs.readFileSync(am.subCredsPath(A), 'utf-8')).claudeAiOauth.accessToken === 'rotated');

am.setPoolTarget(P, B);
ck('re-point switches the target', am.poolCurrent(P) === B);
ck('the same spawn path now resolves to B', fs.realpathSync(am.subDir(P)) === fs.realpathSync(am.subDir(B)));
ck('account A is untouched by the swap', JSON.parse(fs.readFileSync(am.subCredsPath(A), 'utf-8')).claudeAiOauth.accessToken === 'rotated');

// dropping the current target from the member list must re-point, not strand
am.updatePool(P, { members: [A] });
ck('narrowing members away from the target re-points to a valid member', am.poolCurrent(P) === A);
am.updatePool(P, { auto: true, hot: true });
const shown = am.list().accounts.find((x) => x.id === P);
ck('list() exposes pool state (current/members/auto/hot)', shown.pooled && shown.current === A && shown.auto && shown.hot && !!shown.currentName);

// a real dir must never be replaced by a pool symlink
fs.unlinkSync(am.subDir(P)); fs.mkdirSync(am.subDir(P));
let refused = false; try { am.setPoolTarget(P, B); } catch { refused = true; }
ck('refuses to replace a REAL directory with the pool symlink', refused);
fs.rmSync(am.subDir(P), { recursive: true, force: true }); fs.symlinkSync(am.subDir(A), am.subDir(P));

am.remove(P);
ck('removing the pool leaves the real account dir intact', fs.existsSync(am.subCredsPath(A)));
ck('removing the pool removes the symlink', !fs.existsSync(am.subDir(P)));

fs.rmSync(DATA, { recursive: true, force: true });
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
