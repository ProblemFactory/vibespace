#!/usr/bin/env node
// DEAD-CODE RATCHETS (lane dc-ratchet, 2026-10-04 — the gate half of the decoupling review's dead-code rows,
// rv-client-chrome F3 / F10 and rv-server-core's export census). Three censuses, each DERIVED, never hand-listed,
// each pinned as a per-file count in scripts/fixtures/dead-code-baseline.json ({census: {file: count}}, written
// 2026-10-04 from master 8d934bb1). test-architecture §78 is RED when a count rises (new dead text) and RED when one
// falls (the lane that deleted it lowers the baseline in the same commit: `node scripts/dead-code-census.mjs --lower`).
//   i18n-unused  a zh / ja dictionary key that NO production file uses: not in scripts/i18n-extract.mjs's key set
//                (t / tr / i18nKey / tc literals + index.html data-i18n), AND no raw substring hit of any of its
//                encodings (plain, \' , \" , JSON, HTML-escaped, \uXXXX, \`) in src/ server.js data/bin/ public/*.html
//                — the raw fallback credits keys a data row names and the client renders through t(row.label).
//                Keys only tests mention count as unused (a test does not keep text alive for users).
//   export-dead  a name src/** or server.js exports that NO other code file mentions as a token (src, server.js,
//                data/bin, scripts — tests count as a use —, public/*.html, deploy/) and its own file mentions only
//                at the export (ESM `export function x` = 1; CJS `function x` + `module.exports = { x }` = 2).
//                rv-server-core's deadscan.js implementation (one of the two review scripts; the other was ESM-only).
//   lib-unreached a src/lib file no esbuild metafile input of the two browser bundles (src/client.js,
//                src/design-viewer-entry.js) names.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dictEntries, extractKeys } from './i18n-extract.mjs';

const lsFiles = (repo, ...paths) => [...new Set(execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', ...paths], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean))].filter((f) => fs.existsSync(path.join(repo, f))).sort();
const rd = (repo, f) => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } };
const isCode = (f) => /\.(?:c|m)?js$/.test(f) || /^data\/bin\/[^./]+$/.test(f);
const DICT = /^src\/lib\/i18n-(?:zh|ja)\.js$/;
const GENERATED = new Set(['src/lib/build-version.js']);
const BUNDLES = /^public\/(?:bundle|novnc|design-viewer)\.js$/;

// ── i18n-unused ── dictEntries = scripts/i18n-check.mjs's entry parser (it lives in i18n-extract.mjs)
export const dictKeys = (text) => dictEntries(text).map(({ key, line }) => ({ key, line }));
const htmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const encodings = (k) => [...new Set([k, k.replace(/'/g, "\\'"), k.replace(/"/g, '\\"'), JSON.stringify(k).slice(1, -1), htmlEsc(k),
  k.replace(/[^\x00-\x7f]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')), k.replace(/`/g, '\\`')])];
// a tc() key "ctx::str" is used when BOTH parts are
export const keyUnused = (key, extracted, corpus) => !extracted.has(key)
  && !(key.includes('::') ? key.split('::') : [key]).every((p) => encodings(p).some((e) => corpus.includes(e)));
export function i18nUnused(repo, { read = (f) => rd(repo, f), extracted = extractKeys(repo + '/') } = {}) {
  const prod = lsFiles(repo, 'src', 'server.js', 'data/bin', 'public').filter((f) => !DICT.test(f) && !GENERATED.has(f) && !BUNDLES.test(f)
    && (/^public\/.*\.html$/.test(f) || (!f.startsWith('public/') && (isCode(f) || /\.(?:html|json)$/.test(f)))));
  const corpus = prod.map(read).join('\0');
  const DICTS = ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'], entries = Object.fromEntries(DICTS.map((d) => [d, dictKeys(read(d))]));
  const unused = new Map(); // the zh and ja key sets are near-identical: judge each distinct key once (a raw miss scans ~20 MB)
  const isUnused = (key) => { if (!unused.has(key)) unused.set(key, keyUnused(key, extracted, corpus)); return unused.get(key); };
  const counts = {}, keys = {};
  for (const dict of DICTS) { const dead = entries[dict].filter(({ key }) => isUnused(key)); counts[dict] = dead.length; keys[dict] = dead; }
  return { counts, keys, corpusFiles: prod.length };
}

// ── export-dead ──
export function exportsOf(s) {
  const names = new Map(); let m; // name → 'cjs' | 'esm'
  const me = /module\.exports\s*=\s*\{/g;
  while ((m = me.exec(s))) {
    let i = me.lastIndex, d = 1, buf = '';
    while (i < s.length && d > 0) { const c = s[i]; if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--; if (d > 0) buf += d === 1 ? c : (c === ',' ? ' ' : c); i++; }
    for (const part of buf.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split(',')) { const k = part.trim().match(/^(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)/); if (k && !part.trim().startsWith('...')) names.set(k[1], 'cjs'); }
  }
  for (m of s.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.set(m[1], 'cjs');
  for (m of s.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.set(m[1], 'esm');
  for (m of s.matchAll(/\bexport\s*\{([^}]*)\}(?!\s*from)/g)) for (const p of m[1].split(',')) { const k = p.trim().split(/\s+as\s+/).pop().trim(); if (k) names.set(k, 'cjs'); }
  return names;
}
const tokens = (s) => { const mp = new Map(); for (const t of s.match(/[A-Za-z_$][\w$]*/g) || []) mp.set(t, (mp.get(t) || 0) + 1); return mp; };
export function exportDead(repo, { read = (f) => rd(repo, f), files } = {}) {
  const all = files || lsFiles(repo, 'src', 'server.js', 'data/bin', 'scripts', 'public', 'deploy').filter((f) => !BUNDLES.test(f) && !GENERATED.has(f)
    && !/\/fixtures\//.test(f) && (isCode(f) || /^public\/.*\.html$/.test(f) || (f.startsWith('deploy/') && /\.(?:sh|ya?ml|js)$/.test(f))));
  const tok = new Map(all.map((f) => [f, tokens(read(f))]));
  const filesWith = new Map(); // token → number of files mentioning it
  for (const mp of tok.values()) for (const t of mp.keys()) filesWith.set(t, (filesWith.get(t) || 0) + 1);
  const counts = {}, rows = [];
  for (const f of all.filter((g) => (g === 'server.js' || g.startsWith('src/')) && isCode(g) && !DICT.test(g))) {
    const own = tok.get(f);
    for (const [n, kind] of exportsOf(read(f))) {
      if (n.length < 3 || (filesWith.get(n) || 0) > 1) continue;
      if ((own.get(n) || 0) > (kind === 'cjs' ? 2 : 1)) continue; // used inside its own file: the export is spare, the code is not dead
      counts[f] = (counts[f] || 0) + 1; rows.push(`${f} ${n}`);
    }
  }
  return { counts, rows, files: all.length };
}

// ── lib-unreached ──
export const BUNDLE_ENTRIES = ['src/client.js', 'src/design-viewer-entry.js'];
export async function libUnreached(repo) {
  const esbuild = createRequire(path.join(repo, 'package.json'))('esbuild');
  const stub = { name: 'build-version-stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const BUILD_VERSION="0"', loader: 'js' })); } };
  const reach = new Set(); const inputs = {};
  for (const entry of BUNDLE_ENTRIES) {
    const r = await esbuild.build({ entryPoints: [path.join(repo, entry)], absWorkingDir: repo, bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent', plugins: [stub] });
    inputs[entry] = Object.keys(r.metafile.inputs).length;
    for (const k of Object.keys(r.metafile.inputs)) reach.add(k.replace(/^\.\//, '')); // node_modules keys come out as ../node_modules/… in a symlinked lane: never src/lib
  }
  const lib = lsFiles(repo, 'src/lib').filter((f) => /\.(?:c|m)?js$/.test(f) && !GENERATED.has(f));
  const files = lib.filter((f) => !reach.has(f));
  return { counts: Object.fromEntries(files.map((f) => [f, 1])), files, lib: lib.length, inputs };
}

export async function deadCensus(repo) {
  const i18n = i18nUnused(repo), exp = exportDead(repo), lib = await libUnreached(repo);
  return { counts: { 'i18n-unused': i18n.counts, 'export-dead': exp.counts, 'lib-unreached': lib.counts }, i18n, exp, lib };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { judge, lowered, total } = await import('./id-branch-census.mjs');
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const BASE = path.join(repo, 'scripts/fixtures/dead-code-baseline.json');
  const r = await deadCensus(repo);
  if (process.argv.includes('--write-initial')) {
    if (fs.existsSync(BASE)) { console.error('baseline exists — use --lower'); process.exit(1); }
    fs.writeFileSync(BASE, JSON.stringify(r.counts, null, 1) + '\n');
  } else if (process.argv.includes('--lower')) {
    fs.writeFileSync(BASE, JSON.stringify(lowered(JSON.parse(fs.readFileSync(BASE, 'utf8')), r.counts), null, 1) + '\n');
  } else if (process.argv.includes('--json')) { // test-architecture §78 runs this as a child alongside its own checks
    const out = process.argv[process.argv.indexOf('--json') + 1];
    fs.writeFileSync(out, JSON.stringify({ counts: r.counts, i18nKeys: r.i18n.keys, exportRows: r.exp.rows, libFiles: r.lib.files, corpusFiles: r.i18n.corpusFiles, exportFiles: r.exp.files, lib: r.lib.lib, inputs: r.lib.inputs }));
    process.exit(0);
  } else if (process.argv.includes('--list')) {
    for (const [d, ks] of Object.entries(r.i18n.keys)) for (const k of ks) console.log(`i18n-unused\t${d}:${k.line}\t${JSON.stringify(k.key).slice(0, 120)}`);
    for (const row of r.exp.rows) console.log(`export-dead\t${row}`);
    for (const f of r.lib.files) console.log(`lib-unreached\t${f}`);
  }
  for (const [k, v] of Object.entries(r.counts)) console.log(`${k}: ${total(v)} in ${Object.keys(v).length} files`);
  if (fs.existsSync(BASE)) { const j = judge(JSON.parse(fs.readFileSync(BASE, 'utf8')), r.counts); console.log(`vs baseline: ${j.rises.length} rises, ${j.falls.length} falls`); }
}
