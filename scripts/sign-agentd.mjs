#!/usr/bin/env node
// SIGN THE DEVICE AGENT FOR A RELEASE (lane device-bundle-signing, design q-042 D2) — on the RELEASE MACHINE only.
//
//   npm run sign:agentd                 (= npm run build:agentd && node scripts/sign-agentd.mjs)
//   node scripts/sign-agentd.mjs [--key <pem outside the repo>] [--allow-downgrade-to <this version>]
//
// Signs data/bin/vibespace-agentd.js (the bundle `npm run build:agentd` just built — deterministic: every hub's build of
// the same commit is these exact bytes) with the release key and writes release/agentd/manifest.json — COMMIT IT with
// the release. Every hub's build compares its own bundle with that manifest (scripts/agentd-release.mjs): equal ⇒ it
// pushes the bundle to paired machines with the signature; different ⇒ it pushes nothing. The bundle itself is never
// committed (5 MB a release in public history; the manifest's sha256 IS its identity).
//
// The record also SIGNS the release's key set (RELEASE_KEYS — what a device that trusts no key yet pins on first use) and,
// with --allow-downgrade-to <version> (= this bundle's version, typed as a confirmation), a ROLLBACK statement: devices
// that already ran a newer agent land this older one exactly once (lane device-bundle-signing-fix-r2). Never an env,
// never a hub-side flag — only this signature says a downgrade is wanted.
//
// Lane apple-signing (docs/design-apple-signing.zh.md §3.3): when data/bin/helpers/ holds the release's prebuilt Mac screen helper
// (scripts/build-mac-helper.sh, run on the owner's Mac) WITH its .identity.json, the record also signs a `helper` row — its version,
// sha256 and identity (developer-id + Team ID + identifier, or adhoc) — so a hub pushes only the prebuilt the release named. A
// prebuilt whose record does not describe it (a stale pair) is refused by name; no prebuilt ⇒ no row (the record is as before).
//
// Refuses (exit 2, by name): CI set; a running instance's checkout (data/auth.json …); a key inside the repo, readable by
// others, or not ed25519; a key whose public half is not in src/agentd/release-keys.js; a bundle that is not this
// checkout's version; --allow-downgrade-to naming another version. Reads no key material from the environment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { REPO, die, refuseOffReleaseMachine, keyPathOf, loadPrivateKey } from './release-key-io.mjs';
const require = createRequire(import.meta.url);

refuseOffReleaseMachine('sign-agentd');
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const RK = require(path.join(REPO, 'src/agentd/release-keys.js'));
const bundlePath = path.join(REPO, 'data/bin/vibespace-agentd.js');
if (!fs.existsSync(bundlePath)) die(2, `sign-agentd: no bundle at ${bundlePath} — run npm run build:agentd first (or npm run sign:agentd)`);
const bytes = fs.readFileSync(bundlePath);
const version = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bytes.toString('utf8')) || [])[1] || null;
const pkgVersion = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
if (version !== pkgVersion) die(2, `sign-agentd: refused — the bundle says ${version}, package.json ${pkgVersion}: a stale bundle; run npm run build:agentd`);

const argv = process.argv.slice(2);
const di = argv.indexOf('--allow-downgrade-to');
const allowDowngradeTo = di >= 0 ? String(argv[di + 1] || '') : null;
if (allowDowngradeTo != null && allowDowngradeTo !== version) die(2, `sign-agentd: refused — --allow-downgrade-to ${allowDowngradeTo || '(nothing)'} is not this bundle's version ${version}: a rollback statement names the release it signs (type that version)`);
const key = loadPrivateKey(keyPathOf(argv));
const keyId = SIG.keyIdOf(SIG.publicKeyOf(key, { crypto }), { crypto });
if (!RK.RELEASE_KEYS.some((k) => k.keyId === keyId)) die(2, `sign-agentd: refused — key ${keyId} is not in src/agentd/release-keys.js RELEASE_KEYS. Paste the row scripts/gen-release-key.mjs printed, rebuild (npm run build:agentd), then sign.`);

const helper = helperRowOf(path.join(REPO, 'data/bin/helpers'));
function helperRowOf(dir) {
  const bin = path.join(dir, 'vibespace-screen');
  if (!fs.existsSync(bin)) return null;
  let hv = null, ident = null;
  try { hv = fs.readFileSync(bin + '.version', 'utf8').trim(); } catch { die(2, 'sign-agentd: refused — data/bin/helpers/vibespace-screen has no .version beside it (scripts/build-mac-helper.sh writes both)'); }
  try { ident = JSON.parse(fs.readFileSync(bin + '.identity.json', 'utf8')); } catch { die(2, 'sign-agentd: refused — data/bin/helpers/vibespace-screen has no .identity.json beside it (scripts/build-mac-helper.sh writes it; make the prebuilt again)'); }
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(bin)).digest('hex');
  if (!ident || ident.sha256 !== sha256) die(2, `sign-agentd: refused — the helper's identity record describes sha256 ${String(ident && ident.sha256).slice(0, 12)}…, the prebuilt is ${sha256.slice(0, 12)}…: a stale prebuilt or record`);
  if (ident.version !== hv) die(2, `sign-agentd: refused — the helper's identity record is for ${ident.version}, the prebuilt says ${hv}`);
  return { version: hv, sha256, identity: { kind: ident.kind, teamId: ident.teamId || null, identifier: ident.identifier || null } };
}
const manifest = SIG.sign(key, bytes, version, { crypto, chain: RK.KEY_CHAIN, keys: RK.RELEASE_KEYS, ...(allowDowngradeTo ? { allowDowngradeTo } : {}), ...(helper ? { helper } : {}) });
const check = SIG.verify(RK.RELEASE_KEYS, bytes, version, manifest, { crypto });
if (!check.ok) die(1, `sign-agentd: the fresh signature does not verify (${check.code}: ${check.why}) — nothing written`);
const fresh = SIG.verify([], bytes, version, manifest, { crypto, tofu: true });
if (!fresh.ok) die(1, `sign-agentd: a device that trusts no key yet could not take this release (${fresh.code}: ${fresh.why}) — nothing written`);

const text = JSON.stringify(manifest, null, 2) + '\n';
const write = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
write(path.join(REPO, 'release/agentd/manifest.json'));
write(path.join(REPO, 'data/bin/vibespace-agentd.manifest.json'));
console.log(`signed vibespace-agentd ${version}
  sha256 ${manifest.sha256}
  key    ${keyId}${manifest.chain.length ? ` (chain: ${manifest.chain.length} entr${manifest.chain.length > 1 ? 'ies' : 'y'})` : ''}${allowDowngradeTo ? `
  ROLLBACK devices that already ran a newer agent land ${version} once (allowDowngradeTo, signed)` : ''}${helper ? `
  helper ${helper.version} ${helper.identity.kind}${helper.identity.teamId ? ` by team ${helper.identity.teamId}` : ''} (sha256 ${helper.sha256.slice(0, 12)}…) — the Mac screen helper's row, signed` : ''}
  wrote  release/agentd/manifest.json — commit it with the release (git add release/agentd/manifest.json)`);
