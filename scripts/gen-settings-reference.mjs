#!/usr/bin/env node
// THE SETTINGS REFERENCE IS GENERATED (B-df40 part 1, docs/settings.md "All Settings Reference"). The hand-written
// tables drifted from the schema — 40+ rows missing, dead rows documented (the 2026-10 settings audit, S1–S4) — so the
// tables now have ONE writer: this script, from SETTINGS_SCHEMA (hand-written rows and the derived harness rows alike).
// Between `<!-- settings-reference:begin -->` and `<!-- settings-reference:end -->` every category's table sits in a
// `<!-- settings-table: <Category> -->` … `<!-- /settings-table -->` block; the prose around a block (the intros above,
// the notes below) stays hand-written. A schema category with no block gets a new `### <Category>` section appended at
// the end of the region; a block naming a category with no rows is refused by name (delete that section by hand).
// scripts/test-architecture.mjs 44d regenerates in memory and fails the build when the file differs.
//   node scripts/gen-settings-reference.mjs           rewrite docs/settings.md
//   node scripts/gen-settings-reference.mjs --check   exit 1 when it is stale (writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REGION_BEGIN = '<!-- settings-reference:begin — the tables below are GENERATED from src/lib/settings-schema.js by scripts/gen-settings-reference.mjs (test-architecture 44d): edit the prose around a table, never a table -->';
export const REGION_END = '<!-- settings-reference:end -->';
const BLOCK_RE = /<!-- settings-table: (.+?) -->\n[\s\S]*?<!-- \/settings-table -->/g;

/** A code span holding `v` (a value with a backtick gets the double-backtick fence). */
const code = (v) => { const s = String(v).replace(/\|/g, '\\|'); return s.includes('`') ? '`` ' + s + ' ``' : '`' + s + '`'; };
/** One table cell of prose: one line, pipes escaped, `<` escaped outside code spans (a `<channel …>` is text, not HTML). */
export function cell(text) {
  return String(text ?? '').replace(/\s*\n\s*/g, ' ').split('`')
    .map((seg, i) => (i % 2 ? seg.replace(/\|/g, '\\|') : seg.replace(/\|/g, '\\|').replace(/</g, '&lt;'))).join('`').trim();
}
export function defaultCell(v) {
  if (v === undefined || v === null) return '—';
  if (v === '') return "`''`";
  if (typeof v === 'object') return code(JSON.stringify(v));
  return code(v);
}

/** The table of one category, rows in schema order. */
export function renderTable(schema, category) {
  const rows = Object.entries(schema).filter(([, s]) => s && s.category === category);
  if (!rows.length) throw new Error(`settings reference: category "${category}" has a table block but no rows — delete its section from docs/settings.md`);
  const lines = ['| Setting | Type | Default | Description |', '|---------|------|---------|-------------|'];
  for (const [key, s] of rows) {
    const label = cell(s.label || key);
    const desc = cell(s.description || '');
    lines.push(`| ${code(key)} | ${cell(s.type || '')} | ${defaultCell(s.default)} | **${label}**${desc ? ' — ' + desc : ''} |`);
  }
  return lines.join('\n');
}

/** docs/settings.md with every table block regenerated (the prose untouched). PURE: text in, text out. */
export function renderReference(schema, docText) {
  const a = docText.indexOf(REGION_BEGIN);
  const b = docText.indexOf(REGION_END);
  if (a < 0 || b < a) throw new Error('settings reference: docs/settings.md lacks the settings-reference:begin / :end markers');
  const before = docText.slice(0, a + REGION_BEGIN.length);
  let region = docText.slice(a + REGION_BEGIN.length, b);
  const after = docText.slice(b);
  const seen = new Set();
  region = region.replace(BLOCK_RE, (_, cat) => {
    if (seen.has(cat)) throw new Error(`settings reference: two table blocks for "${cat}"`);
    seen.add(cat);
    return `<!-- settings-table: ${cat} -->\n${renderTable(schema, cat)}\n<!-- /settings-table -->`;
  });
  const cats = [...new Set(Object.values(schema).map((s) => s && s.category).filter(Boolean))];
  const missing = cats.filter((c) => !seen.has(c));
  if (missing.length) {
    region = region.replace(/\s*$/, '\n\n') + missing.map((c) => `### ${c}\n\n<!-- settings-table: ${c} -->\n${renderTable(schema, c)}\n<!-- /settings-table -->\n\n`).join('');
  }
  return before + region + after;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(REPO, 'docs/settings.md');
  const { SETTINGS_SCHEMA } = await import('../src/lib/settings-schema.js');
  const cur = fs.readFileSync(file, 'utf8');
  const next = renderReference(SETTINGS_SCHEMA, cur);
  if (process.argv.includes('--check')) {
    console.log(next === cur ? 'docs/settings.md reference tables: up to date' : 'docs/settings.md reference tables: STALE — run node scripts/gen-settings-reference.mjs');
    process.exit(next === cur ? 0 : 1);
  }
  if (next !== cur) fs.writeFileSync(file, next);
  console.log(next === cur ? 'docs/settings.md: unchanged' : 'docs/settings.md: reference tables regenerated');
}
