#!/usr/bin/env node
// SYMBOLICATE AN INCIDENT'S CONSOLE RING (lane vault-chip-zone-errors, inc-mvi50qdh-ygmh — two uncaught errors at every
// start reached the bundle as «bundle.js?v=…:1»: the minified client is ONE line, so nothing named the code). The ring's
// `uncaught` / `unhandled` entries now carry their first frames (src/lib/incident-stack.js); this maps each frame on
// /bundle.js back to its src/ file, line and name — OFFLINE, on the hub's checkout.
//
//   node scripts/symbolicate.mjs data/incidents/<id>/bundle.json [--checkout <dir>] [--any-build]
//
// THE MAP IS NEVER A FILE (主开发's ruling 2026-10-21: the product keeps no map on disk; and should one ever land in
// public/, server.js's static door serves no *.map path). It is REBUILT IN MEMORY from <checkout> with the client esbuild
// step's flags PARSED off package.json's build script at run time (never a copied list — a build-line change cannot drift
// it; test-incident-recorder pins parsed == the script's) plus an external map, and refused unless the rebuilt JS equals
// public/bundle.js byte for byte (the map then maps the very bytes the hub serves). THE BUILD: a frame's `?v=` is the
// bundle's mtime when the page loaded it (server.js's index route stamps it) — another mtime now ⇒ another build ⇒
// refused unless --any-build.
// The `source-map` package is not a dependency: decodeMappings below is the base64-VLQ decoder of the Source Map v3
// `mappings` field. Prints only what the ring already holds (time, level, message) beside the mapped frames.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { frameOf } from '../src/lib/incident-stack.js';

const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));

/** Source Map v3 `mappings` → one array per generated line of segments [genCol, src, srcLine, srcCol, name?] (absolute,
 *  0-based). Throws on a character outside base64. */
export function decodeMappings(mappings) {
  const lines = [];
  let src = 0, sLine = 0, sCol = 0, name = 0;
  for (const lineStr of String(mappings || '').split(';')) {
    const segs = [];
    let gCol = 0;
    for (const segStr of lineStr.split(',')) {
      if (!segStr) continue;
      const v = [];
      let value = 0, shift = 0;
      for (const ch of segStr) {
        const d = B64[ch];
        if (d === undefined) throw new Error(`mappings: not a base64 character ${JSON.stringify(ch)}`);
        value += (d & 31) * 2 ** shift;
        if (d & 32) { shift += 5; continue; }
        const neg = value % 2 === 1;
        value = Math.floor(value / 2);
        v.push(neg ? -value : value);
        value = 0; shift = 0;
      }
      gCol += v[0];
      if (v.length >= 4) {
        src += v[1]; sLine += v[2]; sCol += v[3];
        if (v.length >= 5) { name += v[4]; segs.push([gCol, src, sLine, sCol, name]); } else segs.push([gCol, src, sLine, sCol]);
      } else segs.push([gCol]);
    }
    lines.push(segs);
  }
  return lines;
}

/** A generated position (1-based line and column, as a V8 frame prints them) → { source, line, col, name } (1-based), the
 *  last mapped segment at or before that column; null when the line maps nothing there. */
export function lookup(map, decoded, line, col) {
  const segs = decoded[line - 1];
  if (!segs || !segs.length) return null;
  const c = col - 1;
  let lo = 0, hi = segs.length - 1, hit = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid][0] <= c) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
  const s = hit >= 0 ? segs[hit] : null;
  if (!s || s.length < 4) return null;
  return { source: map.sources[s[1]], line: s[2] + 1, col: s[3] + 1, name: s.length >= 5 ? (map.names[s[4]] || '') : '' };
}

/** SEVERAL generated positions ([[line, col]], 1-based) → Map `line:col` → lookup()'s answer (null where nothing maps), in
 *  ONE pass over `mappings` that keeps only the asked lines' segments — decodeMappings holds every segment (~2 M arrays
 *  for the client bundle). Lane chrome-156-followups: test-csp-report pins the CSP collector's sanitizer sites with it. */
export function lookupMany(map, positions) {
  const want = new Map();
  for (const [l, c] of positions) { if (!want.has(l)) want.set(l, []); want.get(l).push(c); }
  const out = new Map(), m = String((map && map.mappings) || '');
  let src = 0, sLine = 0, sCol = 0, name = 0, line = 1, gCol = 0, value = 0, shift = 0, v = [];
  let segs = want.has(1) ? [] : null;
  const answer = () => {
    for (const c of want.get(line)) {
      let s = null;
      for (const g of segs) { if (g[0] <= c - 1) s = g; else break; }
      out.set(`${line}:${c}`, s && s.length >= 4 ? { source: map.sources[s[1]], line: s[2] + 1, col: s[3] + 1, name: s.length >= 5 ? (map.names[s[4]] || '') : '' } : null);
    }
  };
  for (let i = 0; i <= m.length; i++) {
    const ch = i < m.length ? m[i] : ';';
    if (ch === ',' || ch === ';') {
      if (v.length) {
        gCol += v[0];
        if (v.length >= 4) { src += v[1]; sLine += v[2]; sCol += v[3]; if (v.length >= 5) name += v[4]; }
        if (segs) segs.push(v.length >= 5 ? [gCol, src, sLine, sCol, name] : v.length >= 4 ? [gCol, src, sLine, sCol] : [gCol]);
        v = [];
      }
      if (ch === ';') { if (segs) answer(); line++; gCol = 0; segs = want.has(line) ? [] : null; }
      continue;
    }
    const d = B64[ch];
    if (d === undefined) throw new Error(`mappings: not a base64 character ${JSON.stringify(ch)}`);
    value += (d & 31) * 2 ** shift;
    if (d & 32) { shift += 5; continue; }
    v.push(value % 2 === 1 ? -Math.floor(value / 2) : Math.floor(value / 2));
    value = 0; shift = 0;
  }
  for (const [l, c] of positions) if (!out.has(`${l}:${c}`)) out.set(`${l}:${c}`, null); // a line past the last mapping
  return out;
}

/** The client esbuild step of package.json's build script → esbuild API options (the map flags left to the caller). Throws
 *  on a flag it does not know — a silent difference would map the wrong bytes. `flagsOf` renders them back (the census:
 *  flagsOf(clientBuildOptions(pkg)) is the step's own flag list). */
export function clientBuildOptions(pkg) {
  const build = String((pkg && pkg.scripts && pkg.scripts.build) || '');
  const step = build.split('&&').map((s) => s.trim()).find((s) => /^esbuild src\/client\.js(\s|$)/.test(s));
  if (!step) throw new Error('package.json build: no `esbuild src/client.js …` step');
  const o = { entryPoints: ['src/client.js'], loader: {} };
  for (const a of step.split(/\s+/).slice(2)) {
    if (a === '--bundle') o.bundle = true;
    else if (a === '--minify') o.minify = true;
    else if (a.startsWith('--outfile=')) o.outfile = a.slice('--outfile='.length);
    else if (a.startsWith('--format=')) o.format = a.slice('--format='.length);
    else if (a.startsWith('--platform=')) o.platform = a.slice('--platform='.length);
    else if (a.startsWith('--target=')) o.target = a.slice('--target='.length);
    else if (a.startsWith('--loader:')) { const [ext, l] = a.slice('--loader:'.length).split('='); o.loader[ext] = l; }
    else if (a.startsWith('--sourcemap') || a.startsWith('--sources-content')) { /* the map: the caller's */ }
    else throw new Error(`package.json build: an esbuild flag this tool does not know: ${a}`);
  }
  if (!o.outfile) throw new Error('package.json build: the client step names no --outfile');
  return o;
}

/** The options back as the step's CLI flags (sorted) — what test-incident-recorder compares with the script's own. */
export function flagsOf(o) {
  const out = [];
  if (o.bundle) out.push('--bundle');
  if (o.minify) out.push('--minify');
  for (const k of ['outfile', 'format', 'platform', 'target']) if (o[k]) out.push(`--${k}=${o[k]}`);
  for (const [ext, l] of Object.entries(o.loader || {})) out.push(`--loader:${ext}=${l}`);
  return out.sort();
}

/** The map of <checkout>'s served bundle, rebuilt in memory → { map, decoded, how, bundle, mapDir }. */
export async function mapFor(checkout) {
  const pkg = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), 'utf8'));
  const opts = clientBuildOptions(pkg);
  const bundle = path.join(checkout, opts.outfile);
  if (!fs.existsSync(bundle)) throw new Error(`no ${opts.outfile} in ${checkout} — build it first (npm run build)`);
  const done = (text, how, mapDir) => { const map = JSON.parse(text); return { map, decoded: decodeMappings(map.mappings), how, bundle, mapDir }; };
  const esbuild = createRequire(path.join(checkout, 'package.json'))('esbuild');
  const r = await esbuild.build({ ...opts, entryPoints: opts.entryPoints.map((e) => path.join(checkout, e)), outfile: bundle, absWorkingDir: checkout, sourcemap: 'external', sourcesContent: false, write: false, logLevel: 'silent' });
  const js = r.outputFiles.find((f) => f.path === bundle);
  const mp = r.outputFiles.find((f) => f.path === bundle + '.map');
  if (!js || !mp) throw new Error('the in-memory build made no bundle + map pair');
  if (Buffer.compare(Buffer.from(js.contents), fs.readFileSync(bundle)) !== 0) throw new Error(`the rebuilt bundle differs from ${opts.outfile} — this checkout (or its node_modules) is not the tree that built it`);
  return done(Buffer.from(mp.contents).toString('utf8'), 'rebuilt in memory (byte-identical to the served bundle)', path.dirname(bundle));
}

/** One incident bundle's console ring → printable lines. A frame on /bundle.js is mapped; `?v=` names its build. */
export function symbolicate(inc, ctx, { checkout, anyBuild = false } = {}) {
  const ring = (inc && inc.client && inc.client.rings && Array.isArray(inc.client.rings.console)) ? inc.client.rings.console : [];
  const v = Math.floor(fs.statSync(ctx.bundle).mtimeMs);
  const out = [`${inc.id || '?'} · client ${inc.clientVersion || '?'} · map: ${ctx.how}`];
  let mapped = 0, foreign = 0;
  for (const e of ring) {
    const lines = String(e.stack || '').split('\n').filter(Boolean);
    if (!lines.length && !/\bat .+:\d+:\d+/.test(String(e.m || ''))) continue;
    out.push(`${new Date(e.t).toISOString()} ${e.l}  ${String(e.m || '').split('\n')[0]}`);
    for (const l of lines.length ? lines : String(e.m).split('\n').slice(1)) {
      const f = frameOf(String(l).trim().replace(/https?:\/\/[^/\s)]+/, ''));
      if (!f) { out.push(`    ${String(l).trim()}`); continue; }
      const [file, q] = f.file.split('?');
      const fv = Number((/(?:^|&)v=(\d+)/.exec(q || '') || [])[1]);
      if (!/\/bundle\.js$/.test(file)) { out.push(`    ${String(l).trim()}`); continue; }
      if (fv && fv !== v && !anyBuild) { foreign++; out.push(`    ${String(l).trim()}  →  (another build: v=${fv}, this checkout's bundle is v=${v} — not mapped; --any-build maps it anyway)`); continue; }
      const p = lookup(ctx.map, ctx.decoded, f.line, f.col);
      if (!p) { out.push(`    ${String(l).trim()}  →  (no mapping)`); continue; }
      mapped++;
      const src = path.relative(checkout, path.resolve(ctx.mapDir, p.source));
      out.push(`    ${String(l).trim()}  →  ${src}:${p.line}:${p.col}${p.name ? ` (${p.name})` : ''}`);
    }
  }
  out.push(`${mapped} frame(s) mapped${foreign ? `, ${foreign} from another build` : ''}`);
  return out;
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--checkout');
  if (!file) { console.error('usage: node scripts/symbolicate.mjs <data/incidents/<id>/bundle.json> [--checkout <dir>] [--any-build]'); return 2; }
  const checkout = path.resolve(arg('--checkout') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const inc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ctx = await mapFor(checkout);
  for (const l of symbolicate(inc, ctx, { checkout, anyBuild: argv.includes('--any-build') })) console.log(l);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`symbolicate: ${e.message}`); process.exit(1); });
}
