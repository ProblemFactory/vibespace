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

/** the product's own esbuild arguments for src/client.js (package.json's build script), the outfile left out */
export function productClientArgs(repo) {
  const build = String(((JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts) || {}).build || '');
  const m = build.match(/(?:^|&&\s*)esbuild\s+(src\/client\.js\b[^&]*)/);
  if (!m) throw new Error('client-bundle: package.json\'s build script has no «esbuild src/client.js …» step');
  return m[1].trim().split(/\s+/).filter((a) => !a.startsWith('--outfile='));
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
