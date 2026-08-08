// Design guard for pooled hot-swap (B-6217/B-71c3): the session's credential
// directory is a SYMLINK to the canonical account dir; swapping accounts =
// re-pointing that symlink. Proves the four properties the design rests on,
// against the CLI's real behaviour (verified vs 2.1.222):
//   · QX() returns the env STRING (no realpath, no caching) → the kernel
//     re-resolves the symlink on every syscall, so a re-point is seen at once
//   · credential writes use atomicWrite = tmp+rename → a DIRECTORY symlink
//     survives (a FILE symlink would be replaced — that's why file-level
//     symlinking was rejected)
//   · the lock artifact is join(configDir,'.oauth_refresh.lock') created with
//     mkdir → resolving through the symlink hits the SAME real lock as a
//     normal session of that account ⇒ refresh stays mutually excluded
//   · mtime changes on re-point ⇒ the CLI's credential cache invalidates
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-symswap-'));
const A = path.join(R, 'acct-A'), B = path.join(R, 'acct-B'), S = path.join(R, 'session-1');
fs.mkdirSync(A, { recursive: true, mode: 0o700 }); fs.mkdirSync(B, { recursive: true, mode: 0o700 });
const cred = (d) => path.join(d, '.credentials.json');
fs.writeFileSync(cred(A), JSON.stringify({ claudeAiOauth: { accessToken: 'a1' } }), { mode: 0o600 });
const t0 = Date.now() / 1000; fs.utimesSync(cred(A), t0 - 100, t0 - 100);
fs.writeFileSync(cred(B), JSON.stringify({ claudeAiOauth: { accessToken: 'b1' } }), { mode: 0o600 });
fs.symlinkSync(A, S);
let pass = 0, fail = 0; const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const tok = (d) => JSON.parse(fs.readFileSync(cred(d), 'utf-8')).claudeAiOauth.accessToken;
const mt = (d) => fs.statSync(cred(d)).mtimeMs;
ck('reads through the dir symlink → A', tok(S) === 'a1');
const mA = mt(S);
const atomicWrite = (d, data) => { const tgt = cred(d), tmp = `${tgt}.tmp.${crypto.randomBytes(4).toString('hex')}`; fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(tmp, tgt); };
atomicWrite(S, JSON.stringify({ claudeAiOauth: { accessToken: 'a2' } }));
ck('DIR symlink survives atomicWrite (a FILE symlink would not)', fs.lstatSync(S).isSymbolicLink());
ck('refresh landed in the REAL account dir', tok(A) === 'a2');
const lock = (d) => { try { fs.mkdirSync(path.join(d, '.oauth_refresh.lock')); return true; } catch { return false; } };
ck('lock via symlink succeeds', lock(S));
ck('same lock via the real dir is EXCLUDED → refresh mutually excluded', !lock(A));
fs.rmdirSync(path.join(A, '.oauth_refresh.lock'));
const tmpLink = S + '.swap'; fs.symlinkSync(B, tmpLink); fs.renameSync(tmpLink, S);
ck('after re-point, the SAME path reads B (hot swap)', tok(S) === 'b1');
ck('mtime changed → CLI credential cache invalidates', mt(S) !== mA);
ck('the other account is untouched by the swap', tok(A) === 'a2');
fs.rmSync(R, { recursive: true, force: true });
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
