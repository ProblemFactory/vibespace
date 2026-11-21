// THE ONE SUITE-BUILT CLIENT BUNDLE (主开发 r1291, row B-1217, lane bl-tests-a, 2026-11-21). A heavy chrome suite that needs a CHANGED
// client (a mutant copy of src/ — a RED CONTROL, an old law planted back) builds it here, the way the product builds its own
// public/bundle.js: the esbuild arguments are READ from package.json's build script (never re-typed, so they cannot drift — the
// product passes --minify), only the output file moves. The hotfix's hosted run 44903979657 placed why: test-chat-needs-card-chrome
// built its five mutants with NO --minify and answered the page's /bundle.js itself through the debugging door as one base64 body
// with no cache; on a slow shard the page took over 30 s to take it in (2–3 asks where 200 fit) — «the app never booted», four
// mutant loads of twelve, every plain load green (the same class was placed on test-wake-approve-card-chrome on 2026-11-20).
//
//   buildClientBundle({ repo, root = repo, outFile, unminified = null }) → { buf, bytes, ms, minified, args }
//     repo = the checkout whose node_modules/.bin/esbuild and package.json are used; root = the tree whose src/client.js is built
//     (a mutant copy); outFile = where the bundle is written (absolute, or relative to root). `unminified` = the REASON a suite
//     must keep the built text unminified (it patches the BUILT text) — a named row of the census, never a silent default.
//
// A LOAD OF ONE PRINTS ITS TIME AND ITS ASKS (loadPage's { ms, asks } — scripts/cdp-page-load.mjs), so the margin shows on a green
// run. test-ci-gate's census keeps a new suite from building src/client.js its own way.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { clientBuildOptions, flagsOf } from './symbolicate.mjs';

/** THE ONE PARSER of the product's client step is symbolicate's (clientBuildOptions: package.json's build, a flag it does not know
 *  is a throw); the helper reads the product through it, never a second parser. → the JS-API options, entry and outfile left out */
export function productClientOptions(repo) {
  const { entryPoints, outfile, ...o } = clientBuildOptions(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')));
  return o;
}
/** the same as command-line arguments for src/client.js (symbolicate's flagsOf), the outfile left out */
export function productClientArgs(repo) {
  return ['src/client.js', ...flagsOf(productClientOptions(repo))];
}

/** the same build through esbuild's JS API — for a suite whose control needs a resolve PLUGIN (a patched module copy resolved in
 *  place of the original). `entry` defaults to <repo>/src/client.js; nothing is written unless `outFile` is given; `nodePaths`
 *  resolves packages for a copied tree that has no node_modules (resolution only, never the output).
 *  → Promise<{ buf, bytes, ms, minified }> */
export async function buildClientBundleApi({ repo, entry = null, plugins = [], outFile = null, unminified = null, nodePaths = [] } = {}) {
  if (!repo) throw new Error('client-bundle: buildClientBundleApi needs { repo }');
  if (unminified != null && !String(unminified).trim()) throw new Error('client-bundle: an unminified build names its reason');
  const esbuild = (await import('node:module')).createRequire(path.join(repo, 'package.json'))('esbuild');
  const o = productClientOptions(repo); if (unminified) delete o.minify;
  const t0 = Date.now();
  const r = await esbuild.build({ entryPoints: [entry || path.join(repo, 'src/client.js')], ...o, plugins, ...(nodePaths.length ? { nodePaths } : {}), logLevel: 'silent', ...(outFile ? { outfile: outFile, write: true } : { write: false }) });
  const buf = outFile ? fs.readFileSync(outFile) : Buffer.from(r.outputFiles[0].contents);
  return { buf, bytes: buf.length, ms: Date.now() - t0, minified: !!o.minify };
}

/** build `<root>/src/client.js` as the product builds public/bundle.js, into `outFile` (see the head) */
export function buildClientBundle({ repo, root = repo, outFile, unminified = null } = {}) {
  if (!repo || !outFile) throw new Error('client-bundle: buildClientBundle needs { repo, outFile }');
  if (unminified != null && !String(unminified).trim()) throw new Error('client-bundle: an unminified build names its reason');
  const base = productClientArgs(repo);
  const args = [...base.filter((a) => !(unminified && a === '--minify')), `--outfile=${outFile}`, '--log-level=error'];
  const t0 = Date.now();
  execFileSync(path.join(repo, 'node_modules/.bin/esbuild'), args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const buf = fs.readFileSync(path.isAbsolute(outFile) ? outFile : path.join(root, outFile));
  return { buf, bytes: buf.length, ms: Date.now() - t0, minified: args.includes('--minify'), args };
}

/** test-ci-gate's census (主开发 r1291): every place in `src` that builds src/client.js ITS OWN WAY — an esbuild command line naming
 *  src/client.js, an execFile argument array opening with 'src/client.js' and '--bundle', or an esbuild JS-API build whose
 *  entryPoints name client.js — never a line through this helper; `//` comment lines are not read. → [{ line, how }] */
export function ownClientBuilds(src) {
  const L = String(src).split('\n'), out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^\s*\/\//.test(l) || /buildClientBundle(Api)?\(/.test(l)) continue;
    if (/esbuild\.build\(/.test(l) && /client\.js/.test(L.slice(i, i + 3).join(' '))) { out.push({ line: i + 1, how: 'api' }); continue; }
    if (/['"]src\/client\.js['"]\s*,\s*['"]--bundle['"]/.test(l)) { out.push({ line: i + 1, how: 'argv' }); continue; }
    if (/esbuild/.test(l) && /src\/client\.js/.test(l)) out.push({ line: i + 1, how: 'cli' });
  }
  return out;
}

