#!/usr/bin/env node
// Extract all i18n keys: t('...') / t("...") literals from src/, plus
// data-i18n element texts and data-i18n-attr attribute values from index.html.
// Prints one JSON-encoded key per line (sorted, unique). Used to generate /
// audit the zh/ja dictionaries.
import fs from 'fs';
import path from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const keys = new Set();

// ── JS: t('...') / tr('...') with escaped-quote support (tr = the alias used
// where a local `t` variable would shadow the import, e.g. sidebar cluster) ──
const tRe = /\bt(?:r)?\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && !e.name.startsWith('i18n')) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(tRe)) {
        const raw = m[1] !== undefined ? m[1] : m[2];
        // Unescape JS string escapes (\' \" \\ \n … …)
        const key = JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"');
        keys.add(key);
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

const sorted = [...keys].sort();
for (const k of sorted) console.log(JSON.stringify(k));
console.error(`total: ${sorted.length}`);
