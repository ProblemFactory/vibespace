#!/usr/bin/env node
// THE DEVICE BUNDLE WITHOUT ITS ESSAYS (B-e55c) — a step of `npm run build:agentd`, right after esbuild writes its RAW bundle
// to a SIDE name (data/bin/.vibespace-agentd.raw.js) and before scripts/agentd-release.mjs hashes the final one.
// `node scripts/agentd-bundle-strip.mjs <in> <out>` (B-315a): the stripped text is written beside <out> and RENAMED over it, then
// <in> goes — the final name only ever holds a whole stripped bundle (the old one until the rename, then the new one; esbuild
// wrote the raw bytes to the final name before, read for ~2 s by anything that opened it). One argument: in place (a hand run).
//
// esbuild's unminified output carries every source comment and every level of indentation: measured on the 2.369.407
// sources, 6 145 073 bytes of which comments were ~300 KB and leading indentation ~1.0 MB — and the §107 size cap
// (scripts/test-architecture.mjs) cost a unit a cure round each time it came within a kilobyte. This pass removes
// exactly those two things and nothing else:
//   · every comment EXCEPT the shebang, the legal notices (`/*!`, `//!`, @license, @preserve — the libraries' terms
//     ride with their code) and esbuild's column-0 module banners (`// src/x.js`, `// node_modules/y/z.js`,
//     `// server.js` — they say whose code a line is, and suites read them: test-architecture §5 refuses a bundle
//     that names an orchestrator module, test-artifacts-intent-chrome slices a module by its banner);
//   · the indentation at the start of a line, and blank lines — never inside a string, a template literal (a
//     template's newline and the spaces after it are its VALUE) or a comment that stays.
// It does NOT use esbuild's --minify-whitespace: that joins the program into ~600 lines (a device's stack trace stops
// naming a line) and rewrites every `key: value` / `f({ x })` shape inside a line — the shapes heavy suites anchor
// on to make win32/mac copies of the real bundle. Here a line keeps its own spacing; only its left margin goes.
//
// CHECKED, NEVER TRUSTED: the stripped text is parsed again and its token stream — every token's kind and exact
// source text, and whether a line break stands before it (what automatic semicolon insertion reads) — must equal the
// original's, else this throws and the build fails. Same tokens, same breaks ⇒ the same program — with ONE thing the
// check cannot see: a function's own source text (Function.prototype.toString loses its comments and margins). Measured
// 2026-11-17: nothing in the device code reads one (no fn.toString / String(fn) / new Function over a function's text). Deterministic: the
// same esbuild output strips to the same bytes in any checkout (the signed release depends on it, scripts/agentd-release.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PARSE = { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true };
// esbuild's `// <path>` before each bundled module, at column 0: ONE path token with an extension, any directory or none
// (`// src/x.js`, `// node_modules/y/z.js`, `// server.js`, `// package.json`) — a root module's banner is what §5 looks for
export const BANNER = /^ (?:[\w@.+-]+\/)*[\w@.+-]+\.[A-Za-z0-9]+$/;
/** the module banners of a text, in order (the suite counts them on both sides of the strip with this one predicate) */
export const bannersOf = (text) => text.split('\n').filter((l) => l.startsWith('//') && BANNER.test(l.slice(2)));
const LEGAL = /^!|@license|@preserve/;
const PROTECTED = new Set(['string', 'template', 'invalidTemplate']);
const EOL = /[\n\r\u2028\u2029]/;

function parseWith(acorn, text) {
  const comments = [], tokens = [];
  acorn.parse(text, { ...PARSE, onComment: comments, onToken: tokens });
  return { comments, tokens };
}

/** the token stream's fingerprint: kind + exact source text + «a line break precedes it», per token, in order */
export function tokenPrint(text, acorn = require('acorn'), tokens = parseWith(acorn, text).tokens) {
  const h = crypto.createHash('sha256');
  let prev = 0;
  for (const t of tokens) {
    h.update(t.type.label + '\0' + text.slice(t.start, t.end) + '\0' + (EOL.test(text.slice(prev, t.start)) ? 1 : 0) + '\n');
    prev = t.end;
  }
  return { sha256: h.digest('hex'), count: tokens.length };
}

/** → the stripped text; throws `strip_changed_program` when the result is not the same token stream (the build then
 *  fails). `protect` (the token kinds whose text spans lines and is never touched) is a parameter only so the suite can
 *  prove the check bites (test-architecture §107's control strips a template literal's margin and must be refused).
 *  `check: false` skips the second parse — for a SIZE reading only (§107 measures the shipped size of two builds); the
 *  build's own step (the CLI below) always checks. */
export function stripBundle(src, acorn = require('acorn'), { protect = PROTECTED, check = true } = {}) {
  const { comments, tokens } = parseWith(acorn, src);
  const before = check ? tokenPrint(src, acorn, tokens) : null;
  const keep = (c) => (c.start === 0 && src.startsWith('#!'))
    || LEGAL.test(c.value)
    || (c.type === 'Line' && BANNER.test(c.value) && (c.start === 0 || src[c.start - 1] === '\n'));
  // what phase 2 never touches: the protected tokens AND the comments that stay (a kept licence block keeps its own
  // blank lines and margins); tokens never overlap a comment, so one list in source order
  const prot = [...tokens.filter((t) => protect.has(t.type.label)), ...comments.filter(keep)].sort((a, b) => a.start - b.start);
  // 1) comments — and where each protected token lands in the new text (tokens never overlap a comment)
  let o = '', i = 0, k = 0, delta = 0;
  const lands = [];
  const mapUpTo = (pos) => { while (k < prot.length && prot[k].end <= pos) { lands.push([prot[k].start - delta, prot[k].end - delta]); k++; } };
  const lastOf = (head) => (head.length ? head[head.length - 1] : o[o.length - 1]);
  for (const c of comments) {
    if (keep(c)) continue;
    mapUpTo(c.start);
    const head = src.slice(i, c.start);
    if (c.type === 'Line') o += head.replace(/[ \t]+$/, '');              // its line break stays (not part of the comment)
    else if (EOL.test(c.value)) o += head.replace(/[ \t]+$/, '') + '\n';  // a block that spanned lines leaves one break
    else {
      const b = lastOf(head), a = src[c.end];
      const wsB = b === undefined || /\s/.test(b), wsA = a === undefined || /\s/.test(a);
      o += head + (wsB || wsA ? '' : ' ');                                // `a/**/b` keeps a space; `= /* x */ f` one
      i = (wsB && b !== undefined && b !== '\n' && (a === ' ' || a === '\t')) ? c.end + 1 : c.end;
      delta = i - o.length;
      continue;
    }
    i = c.end;
    delta = i - o.length;
  }
  mapUpTo(Infinity);
  o += src.slice(i);
  // 2) the left margin and blank lines, outside strings and template literals
  const parts = [];
  let seg = 0, j = 0, pos = o.indexOf('\n');
  while (pos !== -1) {
    while (j < lands.length && lands[j][1] <= pos) j++;
    const inside = j < lands.length && lands[j][0] <= pos;
    let q = pos + 1;
    if (!inside) {
      while (q < o.length && (o[q] === ' ' || o[q] === '\t' || o[q] === '\n' || o[q] === '\r')) q++;
      if (q > pos + 1) { parts.push(o.slice(seg, pos + 1)); seg = q; }
    }
    pos = o.indexOf('\n', q);
  }
  parts.push(o.slice(seg));
  const out = parts.join('');
  // 3) the check
  if (!check) return out;
  const after = tokenPrint(out, acorn);
  if (before.sha256 !== after.sha256 || before.count !== after.count) {
    throw Object.assign(new Error(`agentd-bundle-strip: the stripped bundle is not the same program (tokens ${before.count} → ${after.count}, print ${before.sha256.slice(0, 12)} → ${after.sha256.slice(0, 12)})`), { code: 'strip_changed_program' });
  }
  return out;
}

// run as a script: compared by REAL path (a symlinked scripts/ or checkout must not turn the step into a silent no-op)
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const from = path.resolve(process.argv[2] || 'data/bin/vibespace-agentd.js'), file = path.resolve(process.argv[3] || from);
  const src = fs.readFileSync(from, 'utf8');
  let out;
  try { out = stripBundle(src); } catch (e) {
    // the build fails by name; the final name keeps what it held (or esbuild's unstripped bytes, in place), so a manifest copy
    // left by an earlier SIGNED build must not sit beside it (agentd-release.mjs, which would have judged the new build, never
    // runs) — the hub then says unsigned and pushes nothing
    try { fs.unlinkSync(file.replace(/\.js$/, '') + '.manifest.json'); } catch { }
    throw e;
  }
  const tmp = file + '.' + process.pid + '.tmp';
  try { fs.writeFileSync(tmp, out); fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  if (from !== file) { try { fs.unlinkSync(from); } catch { } }   // the side name goes once the final name holds the stripped bundle
  console.log(`agentd-bundle-strip: ${path.basename(file)} ${Buffer.byteLength(src)} → ${Buffer.byteLength(out)} bytes (comments and indentation; the token stream checked equal)`);
}
