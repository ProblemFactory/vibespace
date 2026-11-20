// THE DEVICE BUNDLE AT A STAMP (B-ba47's class, 主开发 r543 2026-11-20). A suite that runs a daemon at a chosen version builds its
// bundle HERE. The stamp — src/agentd/version.js, the daemon's own version — is answered IN THE BUILD by one esbuild plugin: nothing
// is written under the tree's src/, and nothing is restored. Before, each suite wrote the checkout's own version.js, bundled, and wrote
// it back at its end; two suites in one shard's lanes met in that file (on the hosted runner test-agentd went red then green: its
// daemon reported the release's version — another suite's restore had landed between its stamp and its bundle).
// THE LAW (test-architecture §51): no suite writes under src/ of the tree it runs in.
// NOT a test-*.mjs on purpose (like scratch.mjs: the tier census would demand a tier).
//
//   await agentdBundle({ version, outfile, entry }) → outfile
//     THE BUNDLE A SUITE TESTS IS THE BUNDLE THAT SHIPS but for the stamp (主开发 r561): the entry's (default src/agentd/agentd.js)
//     esbuild step is READ from package.json's build:agentd (buildPlan — its flags mapped one by one, a flag with no mapping
//     throws by name), run through esbuild's JS API over the tree's own sources into `outfile` (OUTSIDE the tree — anywhere in it
//     is refused by name: the law is the whole tree, not only src/), then
//     the build's own strip step (scripts/agentd-bundle-strip.mjs) when build:agentd strips that entry. `version` (x.y.z) answers
//     src/agentd/version.js; for the daemon's entry the stamp MUST be in the bundle (a moved stamp module throws by name).
//   buildPlan(scripts, entry) → { entry, options, outfile, strip, flags } — PURE; flagsOf(plan) re-spells the flags (test-architecture
//     §51 holds the round trip equal to the build step's own).
//   stampPlugin(version, { onHit }) → the plugin ({ name, setup } only — esbuild refuses any other key), for a suite's own
//     esbuild.build (a mutant bundle stamped the same way).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAEMON = 'src/agentd/agentd.js';
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

/** THE PRODUCT BUILD'S PLAN for one entry (PURE over package.json's scripts): its build:agentd esbuild step mapped to the JS API, and
 *  whether the strip step follows it on that step's own outfile. A flag with no mapping THROWS BY NAME. */
export function buildPlan(scripts, entry = DAEMON) {
  const cmd = String((scripts || {})['build:agentd'] || '');
  if (!cmd) throw new Error("agentd-bundle: package.json has no build:agentd — the product's flags cannot be read");
  const steps = cmd.split('&&').map((x) => x.trim());
  const at = steps.findIndex((st) => { const t = st.split(/\s+/); return t[0] === 'esbuild' && t[1] === entry; });
  if (at < 0) throw new Error(`agentd-bundle: build:agentd has no esbuild step for ${entry} — a suite bundles only what ships`);
  const options = { bundle: false, platform: undefined, external: [], preserveSymlinks: false };
  let outfile = null;
  const flags = steps[at].split(/\s+/).slice(2);
  for (const t of flags) {
    if (t === '--bundle') options.bundle = true;
    else if (t.startsWith('--platform=')) options.platform = t.slice('--platform='.length);
    else if (t.startsWith('--external:')) options.external.push(t.slice('--external:'.length));
    else if (t === '--preserve-symlinks') options.preserveSymlinks = true;
    else if (t.startsWith('--outfile=')) outfile = t.slice('--outfile='.length);
    else throw new Error(`agentd-bundle: build:agentd's esbuild flag ${t} (the step for ${entry}) has no mapping here — map it, or the bundle a suite tests drifts from the one that ships`);
  }
  if (!outfile) throw new Error(`agentd-bundle: build:agentd's esbuild step for ${entry} names no --outfile`);
  const sm = /^node scripts\/agentd-bundle-strip\.mjs (\S+) (\S+)$/.exec(steps[at + 1] || '');
  return { entry, options, outfile, strip: !!(sm && sm[1] === outfile), flags };
}
/** The flags a plan stands for, re-spelled (the step's own, in the plan's order: bundle, platform, externals, symlinks, outfile). */
export function flagsOf(plan) {
  const o = plan.options;
  return [...(o.bundle ? ['--bundle'] : []), ...(o.platform ? [`--platform=${o.platform}`] : []), ...o.external.map((x) => `--external:${x}`), ...(o.preserveSymlinks ? ['--preserve-symlinks'] : []), `--outfile=${plan.outfile}`];
}

/** The esbuild plugin that answers the tree's own src/agentd/version.js with `{ VERSION: <version> }` — a PLAIN plugin ({ name, setup }:
 *  esbuild refuses any other key on it); `onHit` is called each time it answers. */
export function stampPlugin(version, { repo = REPO, onHit = null } = {}) {
  const v = String(version == null ? '' : version);
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`agentd-bundle: a stamp is an x.y.z version — got ${JSON.stringify(version)}`);
  const stamp = real(path.join(repo, 'src', 'agentd', 'version.js'));
  return {
    name: 'agentd-version-stamp',
    setup(b) {
      b.onLoad({ filter: /[\\/]agentd[\\/]version\.js$/ }, (args) => {
        if (real(args.path) !== stamp) return undefined;
        if (typeof onHit === 'function') onHit();
        return { contents: `module.exports = { VERSION: ${JSON.stringify(v)} };\n`, loader: 'js' };
      });
    },
  };
}

/** Bundle `entry` as build:agentd does, from the tree's own sources, into `outfile`; src/agentd/version.js answered by `version`. → outfile */
export async function agentdBundle({ version, outfile, entry = DAEMON, repo = REPO, logLevel = 'error', ...rest } = {}) {
  if (Object.keys(rest).length) throw new Error(`agentd-bundle: ${Object.keys(rest).join(', ')} — a suite passes no flags of its own (they are build:agentd's)`);
  if (!outfile) throw new Error('agentd-bundle: an outfile is required');
  const out = path.resolve(String(outfile)), tree = real(repo), outDir = real(path.dirname(out));
  if (outDir === tree || outDir.startsWith(tree + path.sep)) throw new Error(`agentd-bundle: the outfile ${out} lies inside the tree ${tree} — a bundle goes to the suite's scratch (no suite writes in the tree it runs in)`);
  // the entry, spelled ONCE (relative to the tree, forward slashes): the plan's lookup and the stamp check read the same name
  const ent = path.relative(repo, path.resolve(repo, String(entry))).split(path.sep).join('/');
  if (ent.startsWith('../') || path.isAbsolute(ent)) throw new Error(`agentd-bundle: the entry ${entry} lies outside the tree ${tree}`);
  entry = ent;
  const plan = buildPlan(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts, entry);
  let hits = 0;
  const plugin = stampPlugin(version, { repo, onHit: () => { hits++; } });
  const raw = plan.strip ? path.join(path.dirname(out), `.${path.basename(out, '.js')}.raw.js`) : out;   // the build's own side name, beside the outfile
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [path.join(repo, entry)], absWorkingDir: repo, outfile: raw, logLevel, plugins: [plugin], ...plan.options });
  if (entry === DAEMON && !hits) throw new Error(`agentd-bundle: the stamp module src/agentd/version.js is not in the bundle of ${entry} — the daemon would report another version (move the stamp with the module)`);
  if (plan.strip) execFileSync(process.execPath, [path.join(repo, 'scripts', 'agentd-bundle-strip.mjs'), raw, out], { stdio: ['ignore', 'ignore', 'inherit'] });   // the build's own strip: written beside out, renamed over it, raw gone
  return out;
}
