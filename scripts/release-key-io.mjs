// THE RELEASE KEY'S DOORS (lane device-bundle-signing, design q-042 D2) — shared by scripts/sign-agentd.mjs and
// scripts/gen-release-key.mjs. The private key is a FILE outside this repository (default
// ~/.vibespace-release/agentd-ed25519.pem, 0600); its passphrase (when it has one) is typed on the terminal or read from
// stdin. Nothing here reads a key, a path to one or a passphrase from the environment; the only variable either script
// looks at is CI — to refuse.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const REPO = path.resolve(new URL('..', import.meta.url).pathname);
export const DEFAULT_KEY = () => path.join(os.homedir(), '.vibespace-release', 'agentd-ed25519.pem');
// a checkout a VibeSpace RUNS from has these (its login, its device tokens, its pid) — a hub is never the signing place
export const INSTANCE_STATE = ['auth.json', 'agentd-tokens.json', 'server.pid'];

export function die(code, msg) { process.stderr.write(msg.replace(/\s*$/, '') + '\n'); process.exit(code); }

/** Refuse (exit 2, by name) in CI and inside a running instance's checkout — the two places the key must never meet. */
export function refuseOffReleaseMachine(script, repo = REPO) {
  if (process.env.CI) die(2, `${script}: refused — CI is set: the release key never meets CI (sign on the release machine, by hand)`);
  for (const n of INSTANCE_STATE) {
    if (fs.existsSync(path.join(repo, 'data', n))) die(2, `${script}: refused — ${path.join(repo, 'data', n)} exists: this checkout belongs to a running VibeSpace (a hub is never where the release key is used). Sign in a release checkout with no instance state.`);
  }
}

/** The key path: --key <path> or the default; never inside the repository (a key there is one `git add` from public). */
export function keyPathOf(argv, repo = REPO) {
  const i = argv.indexOf('--key');
  const p = path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_KEY());
  const real = (() => { try { return fs.realpathSync(path.dirname(p)); } catch { return path.dirname(p); } })();
  const repoReal = (() => { try { return fs.realpathSync(repo); } catch { return repo; } })();
  if (real === repoReal || real.startsWith(repoReal + path.sep)) die(2, `refused — the release key path ${p} is inside the repository ${repo}; keep it outside (default ${DEFAULT_KEY()})`);
  return p;
}

/** A secret line: typed on the terminal (no echo) or, when stdin is not a terminal, its first line. */
export function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    let all = ''; try { all = fs.readFileSync(0, 'utf8'); } catch { }
    return all.split(/\r?\n/)[0];
  }
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  const buf = Buffer.alloc(1); let out = '';
  for (;;) {
    let n = 0; try { n = fs.readSync(0, buf, 0, 1, null); } catch (e) { if (e.code === 'EAGAIN') continue; throw e; }
    if (!n) break;
    const c = buf[0];
    if (c === 3) { process.stdin.setRawMode(false); process.stderr.write('\n'); process.exit(130); }
    if (c === 13 || c === 10) break;
    if (c === 127 || c === 8) { out = out.slice(0, -1); continue; }
    out += String.fromCharCode(c);
  }
  process.stdin.setRawMode(false);
  process.stderr.write('\n');
  return out;
}

/** The private key as a KeyObject: the file must be the owner's alone (no group/other bits) and ed25519. */
export function loadPrivateKey(file) {
  let st; try { st = fs.statSync(file); } catch { die(2, `no release key at ${file} — create one with node scripts/gen-release-key.mjs (on the release machine)`); }
  if (process.platform !== 'win32' && (st.mode & 0o077)) die(2, `refused — ${file} is readable by others (mode ${(st.mode & 0o777).toString(8)}): chmod 600 it`);
  const pem = fs.readFileSync(file, 'utf8');
  let key;
  try { key = /ENCRYPTED PRIVATE KEY/.test(pem) ? crypto.createPrivateKey({ key: pem, passphrase: readSecret(`passphrase for ${file}: `) }) : crypto.createPrivateKey(pem); }
  catch (e) { die(2, `cannot read the release key ${file}: ${e.message}`); }
  if (key.asymmetricKeyType !== 'ed25519') die(2, `refused — ${file} is a ${key.asymmetricKeyType} key; the release key is ed25519`);
  return key;
}
