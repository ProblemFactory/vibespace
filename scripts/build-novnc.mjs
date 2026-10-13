#!/usr/bin/env node
// public/novnc.js = @novnc/novnc's RFB bundled for the page, WITH the build-time patch (src/novnc-patch.js — lane
// desktop-v2-entry: a crop rect that clips and scales together, the ExtendedDesktopSize screens handed to the page).
// A patch anchor that no longer matches FAILS the build. Usage: node scripts/build-novnc.mjs [outfile] [--unpatched]
// (--unpatched = the mutant the chrome suite builds into its scratch dir; never the shipped file).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const P = require(path.join(repo, 'src/novnc-patch.js'));
const args = process.argv.slice(2);
const unpatched = args.includes('--unpatched');
const outfile = path.resolve(repo, args.find((a) => !a.startsWith('--')) || 'public/novnc.js');
const plugin = { name: 'vs-novnc-patch', setup(b) {
  b.onLoad({ filter: /[\\/]@novnc[\\/]novnc[\\/]core[\\/]rfb\.js$/ }, (a) => {
    const src = fs.readFileSync(a.path, 'utf8');
    if (unpatched) return { contents: src, loader: 'js' };
    const r = P.patchRfb(src);
    if (!r.ok) throw new Error(`the noVNC patch no longer applies (anchor not found once: ${r.missing.join(', ')}) — read the new rfb.js and move src/novnc-patch.js`);
    return { contents: r.text, loader: 'js' };
  });
} };
await esbuild.build({ entryPoints: [path.join(repo, 'node_modules/@novnc/novnc/core/rfb.js')], bundle: true, outfile, format: 'esm', platform: 'browser', target: 'es2022', minify: true, plugins: [plugin], logLevel: 'error' });
