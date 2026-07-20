#!/usr/bin/env node
// i18n dictionary lint, run as part of `npm run build` (2.212.0, user ask:
// stop the accumulating esbuild duplicate-key warnings).
//
// HARD FAIL on duplicate keys: in a JS object literal the LAST entry silently
// wins, so a duplicate is never harmless — a conflicting re-add OVERRIDES the
// original translation everywhere it was used (real case: "Vendor" 服务商 →
// 供应商 and "Machine" 远程主机 → 机器 shipped as silent overrides for weeks).
// Same-spelling-different-meaning needs tc(ctx, str), not a re-add (§16).
//
// WARN (non-fatal) on: zh/ja key parity gaps, and translations that lose a
// {param} or an HTML tag present in their key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
const DICTS = ['i18n-zh.js', 'i18n-ja.js'].map((f) => path.join(lib, f));

const ENTRY_RE = /^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/;
let dupFail = 0, warns = 0;
const keySets = new Map();

for (const file of DICTS) {
  const name = path.basename(file);
  const seen = new Map(); // key -> { line, value }
  const entries = new Map();
  fs.readFileSync(file, 'utf8').split('\n').forEach((ln, i) => {
    const m = ln.match(ENTRY_RE);
    if (!m) return;
    const [, k, v] = m;
    if (seen.has(k)) {
      dupFail++;
      const prev = seen.get(k);
      const conflict = prev.value !== v;
      console.error(`✗ ${name}: duplicate key ${k.slice(0, 60)} @${prev.line} and @${i + 1}${conflict ? ` — CONFLICTING translations (${prev.value.slice(0, 24)}… vs ${v.slice(0, 24)}…); the later silently overrides the earlier EVERYWHERE. Same word, different meaning? use tc(ctx, str)` : ' (identical — delete one)'}`);
    } else {
      seen.set(k, { line: i + 1, value: v });
      entries.set(k, v);
    }
  });
  keySets.set(name, entries);
  // param/tag preservation: every {param} and <tag in the key must appear in
  // the translation (a lost param renders the raw placeholder to users)
  for (const [k, v] of entries) {
    for (const p of k.match(/\{[a-zA-Z0-9_]+\}/g) || []) {
      if (!v.includes(p)) { warns++; console.warn(`⚠ ${name}: ${k.slice(0, 50)} translation loses ${p}`); }
    }
    // real HTML tags only — keys also contain placeholder angle brackets
    // like <device>/<folder> that translations legitimately localize
    for (const tag of k.match(/<(?:b|i|em|strong|code|br|span|a|u|small)[ />]/g) || []) {
      if (!v.includes(tag)) { warns++; console.warn(`⚠ ${name}: ${k.slice(0, 50)} translation loses ${tag.trim()}`); }
    }
  }
}

// zh/ja parity — a key translated in one language but forgotten in the other
const [zh, ja] = [keySets.get('i18n-zh.js'), keySets.get('i18n-ja.js')];
for (const k of zh.keys()) if (!ja.has(k)) { warns++; console.warn(`⚠ parity: in zh but missing from ja: ${k.slice(0, 60)}`); }
for (const k of ja.keys()) if (!zh.has(k)) { warns++; console.warn(`⚠ parity: in ja but missing from zh: ${k.slice(0, 60)}`); }

if (dupFail) {
  console.error(`\ni18n check FAILED: ${dupFail} duplicate key(s). Fix before building.`);
  process.exit(1);
}
console.log(`i18n check ok (${zh.size} zh / ${ja.size} ja keys${warns ? `, ${warns} warning(s)` : ''})`);
