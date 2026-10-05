#!/usr/bin/env node
// Extract all i18n keys: t('...') / t("...") literals from src/, plus
// data-i18n element texts and data-i18n-attr attribute values from index.html.
// Prints one JSON-encoded key per line (sorted, unique). Used to generate /
// audit the zh/ja dictionaries. extractKeys(root) is the same set as a module
// (the unused-key ratchet of scripts/dead-code-census.mjs, test-architecture §78).
import fs from 'fs';
import path from 'path';

// The dictionary ENTRY shape (src/lib/i18n-zh.js / i18n-ja.js: `  "key": "value",`), quote-AGNOSTIC and DECODED
// (2.227.1: python-inserted single-quoted entries were invisible to a double-quote-only reader). The one parser:
// scripts/i18n-check.mjs (duplicates / parity / params) and scripts/dead-code-census.mjs (unused keys) both read it.
const STR_LIT = `(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
const ENTRY_RE = new RegExp(`^  (${STR_LIT}): (${STR_LIT}),?$`);
const decodeLit = (lit) => { try { return new Function('return ' + lit)(); } catch { return lit; } };
export const dictEntries = (text) => text.split('\n').flatMap((ln, i) => {
  const m = ln.match(ENTRY_RE);
  return m ? [{ key: decodeLit(m[1]), value: decodeLit(m[2]), line: i + 1 }] : [];
});

export function extractKeys(ROOT = new URL('..', import.meta.url).pathname) {
const keys = new Set();

// ── JS: t('...') / tr('...') with escaped-quote support (tr = the alias used
// where a local `t` variable would shadow the import, e.g. sidebar cluster);
// i18nKey('...') = a DECLARED human-visible string in a PURE data module
// (src/integration-registry.js rows, src/channels/*.js OPTIONS) that the
// client renders through t() — the marker is the identity, listed here so the
// dictionary census sees keys that never appear inside a t() call (a3 i18n) ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
// tc('ctx', 'str') — pgettext-style contextual keys, emitted as "ctx::str"
const tcRe = /\btc\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
// Unescape JS string escapes (\' \" \\ \n …) as escape PAIRS — a bare " (inside '…') gets its JSON escape,
// an already-escaped \" (inside "…") stays one (dc-ratchet: the per-pair walk fixed a crash on such a key)
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && !e.name.startsWith('i18n')) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(tRe)) {
        const raw = m[1] !== undefined ? m[1] : m[2];
        keys.add(unescapeJs(raw));
      }
      for (const m of src.matchAll(tcRe)) {
        keys.add(unescapeJs(m[1]) + '::' + unescapeJs(m[2]));
      }
    }
  }
};
walk(path.join(ROOT, 'src'));

// ── index.html: data-i18n texts + data-i18n-attr values ──
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
for (const m of html.matchAll(/<([a-z0-9]+)([^>]*\bdata-i18n(?!-attr)\b[^>]*)>([^<]*)</gi)) {
  const text = decode(m[3].trim());
  if (text) keys.add(text);
}
for (const m of html.matchAll(/<[a-z0-9]+[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/gi)) {
  const attrs = m[1].split(',').map((s) => s.trim());
  for (const a of attrs) {
    const av = m[0].match(new RegExp(`\\b${a}="([^"]*)"`, 'i'));
    if (av && av[1]) keys.add(decode(av[1]));
  }
}

return keys;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sorted = [...extractKeys()].sort();
  for (const k of sorted) console.log(JSON.stringify(k));
  console.error(`total: ${sorted.length}`);
}
