'use strict';
// B-87fd identity unit 3's remainder (主开发 r4177): A KILL AT THE MOVE INTO THE HOLD, through the REAL resolve. A child of
// scripts/test-account-relogin.mjs: argv = <accounts module path> <dataDir> <mode> <out> [row id]. The store, its writer, the folders
// and the sign-in helper's status are real (made-up addresses); this process ends by its OWN SIGKILL — nothing of it lands after.
//   kill-at-move    a row signed in (named by its address), then signed out by the CLI with its config cleared; the press, then
//                   ANOTHER account's sign-in with this press's success: the resolve ASKS and is killed at the first rename INTO the
//                   hold (the question already on disk). <out> gets the row's id before the resolve.
//   same-then-kill  the answer «the same account» on <row id>, then SIGKILL in the same turn (nothing the writer owes is written)
const fs = require('fs'), path = require('path');
const [modPath, dataDir, mode, out, rowId] = process.argv.slice(2);
console.log = () => { }; console.warn = () => { };
const { AccountManager } = require(modPath);
const HELD = '.vibespace-relogin-held', ORG = 'org-made-up-1', EXP = Date.now() + 29 * 86400e3;
let n = 0;
const live = (dir, email) => {
  fs.mkdirSync(dir, { recursive: true });
  const rte = EXP + (process.pid % 100000) * 1000 + (++n);   // each sign-in its own login session deadline
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'at-' + email, refreshToken: 'rt-' + email + '-' + rte, expiresAt: Date.now() + 3600e3, refreshTokenExpiresAt: rte, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }));
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: 'p-' + email.split('@')[0] + '-made-up', organizationUuid: ORG, organizationName: 'Org' } }));
};
const blank = (dir) => {   // the CLI's own blanked residue: blank tokens, expiresAt 0, the deadline and scopes kept
  const c = JSON.parse(fs.readFileSync(path.join(dir, '.credentials.json'), 'utf8')).claudeAiOauth;
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: c.refreshTokenExpiresAt, scopes: c.scopes } }));
};
(async () => {
  const am = new AccountManager({ dataDir, onChange: () => { } });
  if (mode === 'kill-at-move') {
    const s = am.createSubscription({}).id, dir = am.subDir(s);
    live(dir, 'a40@example.invalid'); am.finalizeSubscription(s); blank(dir); fs.rmSync(path.join(dir, '.claude.json'), { force: true });
    try { await am.persisted(); } catch { }
    const b = am.reloginBegin(s); live(dir, 'b40@example.invalid');
    fs.writeFileSync(path.join(dir, '.vibespace-login-status.json'), JSON.stringify({ version: 1, state: 'success', attempt: b && b.attempt, updatedAt: Date.now() }));
    fs.writeFileSync(out, JSON.stringify({ row: s }));
    const rename = fs.renameSync;
    fs.renameSync = function (from, to) { if (String(to).includes(path.sep + HELD + path.sep)) process.kill(process.pid, 'SIGKILL'); return rename.call(this, from, to); };
    const r = am.reloginResolve(s);
    fs.writeFileSync(out, JSON.stringify({ row: s, notKilled: r && r.outcome }));
    process.exit(3);
  }
  if (mode === 'same-then-kill') {
    let r = null; try { r = am.reloginAnswer(rowId, 'same'); } catch (e) { r = { threw: (e && e.code) || String(e) }; }
    fs.writeFileSync(out, JSON.stringify({ answered: r && (r.outcome || r.threw) }));
    process.kill(process.pid, 'SIGKILL');
  }
  process.exit(4);
})();
