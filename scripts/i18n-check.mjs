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
//
// HARD FAIL on a MISSING For-you NOTICE translation (vault-agent-own round 18/19;
// lane job-notify-user r4 widens it to the jobs engine): a userTodos notice
// carries `i18n: { text: { key: '…' }, detail: [{ key: '…' }] }` in SERVER
// source — NOT a t() call, so the dict-only lint above never sees it (the jobs
// engine's eight For-you keys shipped with no zh / ja and every gate green).
// THE ROAD (exported) scans each listed surface's literal `key:` AND `detail:`
// notice keys (single/double/backtick-quoted, a ${…} template skipped) — and
// the jobs engine's template TABLE (src/job-model.js FOR_YOU_WORDS, a table of
// keys, not `key:` literals) — and REQUIRES each as a REAL dict ENTRY in BOTH
// dicts (a quoted key then `:`, outside a full-line comment — so a prose/comment
// mention never falsely passes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { dictEntries } from './i18n-extract.mjs';

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
const DICTS = ['i18n-zh.js', 'i18n-ja.js'].map((f) => path.join(lib, f));
// the server surfaces whose literal notice keys are FOR the owner (widen as other surfaces adopt the i18n-notice shape)
const NOTICE_SRC = ['src/server/jobs-wiring.js', 'src/jobs.js'].map((p) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', p));
// …and the server's key TABLES (each value a key the client words with t()): the jobs engine's For-you templates
export const noticeKeyTables = () => [{ name: 'src/job-model.js FOR_YOU_WORDS', keys: Object.values(createRequire(import.meta.url)('../src/job-model.js').FOR_YOU_WORDS) }];

/** every `key:` / `detail:` sentence-shaped string literal in server source — single/double/backtick-quoted; a `${…}` template
 *  (a key built at run time) is skipped, a short identifier is skipped. Round 19: `detail:` and backtick quotes are now seen. */
export function noticeKeyLiterals(src) {
  const keys = new Set(); const re = /\b(?:key|detail):\s*(['"`])((?:\\.|(?!\1)[^])*?)\1/g; let m;
  while ((m = re.exec(String(src)))) { if (m[1] === '`' && /\$\{/.test(m[2])) continue; const k = m[2].replace(/\\(.)/g, '$1'); if (/[{\s]/.test(k) && k.length > 8) keys.add(k); }
  return [...keys];
}
/** is `key` a REAL object-key entry in the dict text — a quoted key (any quote) followed by `:`, outside a full-line `//` comment?
 *  Round 19: a prose / comment mention of the key string (no trailing `:`, or a full-line comment) never passes (the r18 raw
 *  `includes` falsely passed a comment-only key). Full-line comments only (an inline `// note` after an entry keeps the entry; a
 *  value holding `https://…` is never a full-line comment, so it is never stripped). */
export function dictHasEntry(dictText, key) {
  const code = String(dictText).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const q = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('([\'"`])' + q + '\\1\\s*:').test(code);
}
/** the notice-key road: srcTexts × their literal notice keys (+ tables' keys, sentence-shaped as the literals are) × dicts →
 *  every (dict, key) whose translation is MISSING. */
export function noticeKeyFailures(srcTexts, dicts, tables = []) {
  const out = [];
  for (const src of srcTexts) for (const k of noticeKeyLiterals(src)) for (const d of dicts) if (!dictHasEntry(d.text, k)) out.push({ dict: d.name, key: k });
  for (const t of tables) for (const k of t.keys) if (typeof k === 'string' && /[{\s]/.test(k) && k.length > 8) for (const d of dicts) if (!dictHasEntry(d.text, k)) out.push({ dict: d.name, key: k, table: t.name });
  return out;
}

function runCli() {
  let dupFail = 0, missFail = 0, warns = 0;
  const keySets = new Map();
  for (const file of DICTS) {
    const name = path.basename(file);
    const seen = new Map(); // key -> { line, value }
    const entries = new Map();
    for (const { key: k, value: v, line } of dictEntries(fs.readFileSync(file, 'utf8'))) {
      if (seen.has(k)) {
        dupFail++;
        const prev = seen.get(k);
        const conflict = prev.value !== v;
        console.error(`✗ ${name}: duplicate key ${k.slice(0, 60)} @${prev.line} and @${line}${conflict ? ` — CONFLICTING translations (${prev.value.slice(0, 24)}… vs ${v.slice(0, 24)}…); the later silently overrides the earlier EVERYWHERE. Same word, different meaning? use tc(ctx, str)` : ' (identical — delete one)'}`);
      } else {
        seen.set(k, { line, value: v });
        entries.set(k, v);
      }
    }
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

  // the For-you NOTICE-key road (exported above; pinned by test-jobs-engine's planted-key controls)
  const srcTexts = NOTICE_SRC.map((f) => fs.readFileSync(f, 'utf8'));
  const dicts = DICTS.map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }));
  for (const { dict, key, table } of noticeKeyFailures(srcTexts, dicts, noticeKeyTables())) {
    missFail++;
    console.error(`✗ a For-you notice key is MISSING its translation in ${dict} — ${key.slice(0, 72)}… — ${table ? `a key in ${table}` : 'a key/detail literal in a server notice surface'} needs zh+ja like any chrome string (add it to src/lib/${dict})`);
  }

  if (dupFail || missFail) {
    const parts = [dupFail ? `${dupFail} duplicate key(s)` : null, missFail ? `${missFail} missing translation(s)` : null].filter(Boolean);
    console.error(`\ni18n check FAILED: ${parts.join(' + ')}. Fix before building.`);
    process.exit(1);
  }
  console.log(`i18n check ok (${zh.size} zh / ${ja.size} ja keys${warns ? `, ${warns} warning(s)` : ''})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) runCli();
