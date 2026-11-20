// THE DEVICE BUNDLE AT A STAMP (B-ba47's class, 主开发 r543 2026-11-20). A suite that runs a daemon at a chosen version builds its
// bundle HERE. The stamp — src/agentd/version.js, the daemon's own version — is answered IN THE BUILD by one esbuild plugin: nothing
// is written under the tree's src/, and nothing is restored. Before, each suite wrote the checkout's own version.js, bundled, and wrote
// it back at its end; two suites in one shard's lanes met in that file (on the hosted runner test-agentd went red then green: its
// daemon reported the release's version — another suite's restore had landed between its stamp and its bundle).
// THE LAW (test-architecture §51): no suite writes under src/ of the tree it runs in.
// NOT a test-*.mjs on purpose (like scratch.mjs: the tier census would demand a tier).
//
//   await agentdBundle({ version, outfile, entry, external }) → outfile
//     esbuild over the tree's own `entry` (default src/agentd/agentd.js) — bundle, platform node, the suite's `external` (e.g.
//     node-pty), as `npx esbuild … --bundle --platform=node` did from the checkout — into `outfile` (a path OUTSIDE the tree's src/).
//     `version` (x.y.z) answers src/agentd/version.js; for the daemon's own entry the stamp MUST be in the bundle (a moved stamp
//     module throws by name, never a bundle at the release's version).
//   stampPlugin(version) → the plugin, for a suite's own esbuild.build (a mutant bundle stamped the same way).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAEMON = 'src/agentd/agentd.js';
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

/** The esbuild plugin that answers the tree's own src/agentd/version.js with `{ VERSION: <version> }`. `hit()` says it answered. */
export function stampPlugin(version, { repo = REPO } = {}) {
  const v = String(version == null ? '' : version);
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`agentd-bundle: a stamp is an x.y.z version — got ${JSON.stringify(version)}`);
  const stamp = real(path.join(repo, 'src', 'agentd', 'version.js'));
  let answered = 0;
  return {
    name: 'agentd-version-stamp',
    hit: () => answered,
    setup(b) {
      b.onLoad({ filter: /[\\/]agentd[\\/]version\.js$/ }, (args) => {
        if (real(args.path) !== stamp) return undefined;
        answered++;
        return { contents: `module.exports = { VERSION: ${JSON.stringify(v)} };\n`, loader: 'js' };
      });
    },
  };
}

/** Bundle `entry` from the tree's own sources into `outfile`, src/agentd/version.js answered by `version` in the build. → outfile */
export async function agentdBundle({ version, outfile, entry = DAEMON, external = [], repo = REPO, logLevel = 'error' } = {}) {
  if (!outfile) throw new Error('agentd-bundle: an outfile is required');
  const out = path.resolve(String(outfile)), src = real(path.join(repo, 'src'));
  if (real(path.dirname(out)) === src || real(path.dirname(out)).startsWith(src + path.sep)) throw new Error(`agentd-bundle: the outfile ${out} lies under the tree's src/ — a bundle goes to the suite's scratch`);
  const plugin = stampPlugin(version, { repo });
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [path.join(repo, entry)], absWorkingDir: repo, bundle: true, platform: 'node', outfile: out, external: [...external], logLevel, plugins: [plugin] });
  if (entry === DAEMON && !plugin.hit()) throw new Error(`agentd-bundle: the stamp module src/agentd/version.js is not in the bundle of ${entry} — the daemon would report another version (move the stamp with the module)`);
  return out;
}
