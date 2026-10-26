#!/usr/bin/env node
// IS THIS BUILD THE SIGNED RELEASE? (lane device-bundle-signing, design q-042 D2) — the last step of `npm run build:agentd`.
//
// release/agentd/manifest.json is the release record the release machine committed (scripts/sign-agentd.mjs). When the
// bundle this checkout just built (data/bin/vibespace-agentd.js — esbuild --preserve-symlinks: the same commit builds the
// same bytes in any checkout) has that manifest's sha256 and version AND the signature verifies against
// src/agentd/release-keys.js, the manifest is copied beside the bundle (data/bin/vibespace-agentd.manifest.json) and the
// hub pushes the bundle to paired machines with it. Otherwise the copy is removed and this hub pushes nothing to them
// (src/agentd/client.js `unsigned-local-build`) — its own machine's agent still updates (the local proof).
// Never fails the build: a dev checkout is unsigned by nature.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** → { signed: true, manifest, sha256, version, keyId } | { signed: false, why, sha256, version } */
export function releaseVerdict(repo = REPO) {
  const SIG = require(path.join(repo, 'src/agentd-signature.js'));
  const RK = require(path.join(repo, 'src/agentd/release-keys.js'));
  const bytes = fs.readFileSync(path.join(repo, 'data/bin/vibespace-agentd.js'));
  const version = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bytes.toString('utf8')) || [])[1] || null;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(repo, 'release/agentd/manifest.json'), 'utf8')); } catch { }
  const m = SIG.manifestMatches(manifest, { sha256, version });
  if (!m.signed) return { signed: false, why: m.why, sha256, version };
  const v = SIG.verify(RK.RELEASE_KEYS, bytes, version, manifest, { crypto });
  if (!v.ok) return { signed: false, why: `release/agentd/manifest.json does not verify against src/agentd/release-keys.js — ${v.code}: ${v.why}`, sha256, version };
  return { signed: true, manifest, sha256, version, keyId: v.keyId, helper: manifest.helper && typeof manifest.helper === 'object' ? manifest.helper : null }; // lane apple-signing: the prebuilt Mac screen helper's row, when the release signed one
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(REPO, 'data/bin/vibespace-agentd.manifest.json');
  try {
    const r = releaseVerdict();
    if (r.signed) {
      const tmp = out + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(r.manifest, null, 2) + '\n'); fs.renameSync(tmp, out);
      console.log(`  agentd ${r.version}: the signed release (key ${r.keyId}, sha256 ${r.sha256.slice(0, 12)}…) — paired machines are updated to it${r.helper ? `; the Mac screen helper ${r.helper.version} (${r.helper.identity.kind}) is the release's` : ''}`);
    } else {
      try { fs.unlinkSync(out); } catch { }
      console.log(`  agentd ${r.version}: UNSIGNED local build (sha256 ${r.sha256.slice(0, 12)}…) — ${r.why}. This VibeSpace updates only its own machine's agent; paired machines keep theirs until a signed release (scripts/sign-agentd.mjs on the release machine).`);
    }
  } catch (e) {
    try { fs.unlinkSync(out); } catch { }
    console.log(`  agentd: release check failed (${e.message}) — treated as an UNSIGNED local build; paired machines are not updated from this build`);
  }
}
