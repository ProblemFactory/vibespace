#!/usr/bin/env node
// BUNDLE FREE-VARIABLE GUARD (2.330.1, after the app shipped UNBOOTABLE twice
// in one evening). The 2.327.0 dead-code sweep deleted a SHARED import line —
// `import { installTelemetry, track, reportBootTime, installOverlapTracer }` —
// because one of the four names was dead. The other three became undefined
// globals at the top of client.js. esbuild bundles a free identifier happily
// (it is a legal global reference), `node --check` passes, and every gate in
// the build was green while the app threw on its first executed line: blank
// loading screen for every user, twice, because the first fix only restored
// the ONE symbol whose error message the user had pasted.
//
// THE MECHANISM THIS EXPLOITS: `esbuild --minify` renames every BOUND name to
// 1-3 characters. A long name that survives verbatim in CALL position is one
// esbuild could not resolve to a binding — i.e. a free variable. Cross that
// with the symbols our own source actually defines and the check becomes
// exact: no browser needed, no false positives from grammar/base64 blobs.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// ── every symbol our client source DEFINES (exported or top-level declared) ──
function ourSymbols() {
  const names = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf-8');
      for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([\w$]+)/gm)) names.add(m[1]);
      for (const m of src.matchAll(/^export\s+(?:const|let|class)\s+([\w$]+)/gm)) names.add(m[1]);
      for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm)) names.add(m[1]);
      for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
        for (const part of m[1].split(',')) {
          const n = part.trim().split(/\s+as\s+/).pop().trim();
          if (/^[\w$]+$/.test(n)) names.add(n);
        }
      }
    }
  };
  walk(path.join(REPO, 'src', 'lib'));
  for (const f of ['src/client.js', 'src/design-viewer-entry.js']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf-8');
    for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm)) names.add(m[1]);
  }
  // 3-char-or-less names collide with minified output; the guard needs ≥4.
  return new Set([...names].filter((n) => n.length >= 4));
}

const SYMBOLS = ourSymbols();
ok(SYMBOLS.size > 50, `collected our own client symbols (${SYMBOLS.size})`);
ok(gateOf(SYMBOLS.has('installTelemetry')) && verdictOf(SYMBOLS.has('reportBootTime')),
  'the two symbols from the real incident are in the symbol set');


// A "call" is name + `(` whose MATCHING `)` is not followed by `{` — that one
// test separates `installTelemetry();` (a call) from `openBrowser(url) {` (a
// method definition, which keeps its name in the bundle because esbuild never
// renames properties). Without it the guard drowns in false positives and
// would have been deleted the first time someone ran it.
function isCallAt(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length && i < openIdx + 4000; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        const rest = src.slice(i + 1, i + 40).replace(/^[\s\r\n]*/, '');
        return !rest.startsWith('{');
      }
    }
  }
  return false;
}

// ── the check: any of OUR symbols appearing as a BARE CALL in the minified
//    bundle is unbound (a bound one would have been renamed to 1-3 chars) ──
// ONE PASS over the bundle (B-2c31, lane bl-ci 2026-11-18): every identifier followed by `(` whose left neighbour is no `.`, word
// character or `$` — the occurrences the old per-symbol regex found, since an identifier is matched whole (and a name with a `$`,
// which that regex never escaped and so never matched) — and only
// the names that are OURS are judged by isCallAt. It used to build one RegExp per symbol (thousands) and scan the whole bundle
// with each: 15.8 s of every build at two cores (the parity of the two forms over the real bundles is proved in the unit's line).
// B-af94 (主开发 09:24Z — a sentence a person reads is not changed for a test; the census is taught): every bundle this reads is built
// by esbuild (package.json's build), and esbuild's printer never puts anything between a callee and its «(» (a /* @__PURE__ */
// note goes BEFORE the callee) — so a name, a space and «(» is PROSE inside a string («The mount point … is not empty (a, b)»),
// never a call
const IDENT_CALL = /(?<![.\w$])([\w$]+)\(/g;
function freeCalls(bundleSrc) {
  const found = new Map();
  for (const m of bundleSrc.matchAll(IDENT_CALL)) {
    const name = m[1];
    if (!SYMBOLS.has(name)) continue;
    const open = bundleSrc.indexOf('(', m.index + name.length);
    if (open >= 0 && isCallAt(bundleSrc, open)) found.set(name, (found.get(name) || 0) + 1);
  }
  return found;
}

const bundlePath = path.join(REPO, 'public', 'bundle.js');
let bundle = '';
try { bundle = fs.readFileSync(bundlePath, 'utf-8'); } catch { }
ok(bundle.length > 100000, 'public/bundle.js exists and looks built (run npm run build first)');
if (bundle) {
  const free = freeCalls(bundle);
  ok(free.size === 0,
    'public/bundle.js: no bare calls to our own symbols (a surviving name = used but never imported)',
    free.size ? [...free.entries()].map(([n, c]) => `${n} (${c}×)`).join(', ') : '');
}

// The published design page's runtime (int201): the SECOND esbuild entry, built by the same `npm run build` just
// before this suite — the same free-call rule over its bundle (it bundles src/lib/design-canvas*.js + design-model.js).
{
  let viewer = '';
  try { viewer = fs.readFileSync(path.join(REPO, 'public', 'design-viewer.js'), 'utf-8'); } catch { }
  ok(viewer.length > 8000, 'public/design-viewer.js exists and looks built (run npm run build first)');
  if (viewer) {
    const free = freeCalls(viewer);
    ok(free.size === 0, 'public/design-viewer.js: no bare calls to our own symbols', free.size ? [...free.entries()].map(([n, c]) => `${n} (${c}×)`).join(', ') : '');
  }
}

// ── NEGATIVE CONTROL: the checker must fire on the exact regression ──
{
  const broken = 'var a=1;function b(){a++}installTelemetry();b();reportBootTime();';
  const free = freeCalls(broken);
  ok(gateOf(free.has('installTelemetry')) && verdictOf(free.has('reportBootTime')),
    'NEGATIVE CONTROL: both incident symbols are detected in a synthetic broken bundle');
  const healthy = 'var a=1,e=2;function b(){a++}b();e();';
  ok(freeCalls(healthy).size === 0, 'NEGATIVE CONTROL: a properly minified bundle is clean');
  const prose = 'var t="The mount point /x is not empty (a, b) — reportBootTime (it runs at boot)";';
  ok(freeCalls(prose).size === 0 && verdictOf(freeCalls('var t=1;reportBootTime();').has('reportBootTime')),
    'B-af94: one of our names, a SPACE and «(» inside a string is prose, never a call (minified output never spaces a callee from its «(»); the same name called is still caught');
}

// NOTE: a source-side twin was tried and REMOVED — correctly deciding
// "used but not bound" in source needs real scope analysis (destructured
// bindings, params, closures), and the approximation produced false positives.
// esbuild has already done that analysis to produce the bundle; reading its
// answer out of the minified output is exact. One check that cannot lie beats
// two where one does.

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
