#!/usr/bin/env node
// MEASURE CLAUDE.md (lane claude-md-diet, B-23e7 — not a test): bytes, characters, ~tokens (characters / 4) and lines
// per section of the auto-loaded index, which every agent session pays at its start AND again after each compaction.
//   node scripts/measure-claude-md.mjs                  the working tree's CLAUDE.md
//   node scripts/measure-claude-md.mjs --ref <rev>      the CLAUDE.md of a commit (git show <rev>:CLAUDE.md)
//   node scripts/measure-claude-md.mjs --ref <a> --ref <b>   one total line per text, then each table
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const refs = process.argv.flatMap((a, i, all) => (all[i - 1] === '--ref' ? [a] : []));
const texts = (refs.length ? refs : [null]).map((ref) => {
  if (!ref) return ['working tree', fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8')];
  const r = spawnSync('git', ['-C', REPO, 'show', `${ref}:CLAUDE.md`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.error(`git show ${ref}:CLAUDE.md failed: ${r.stderr.trim()}`); process.exit(2); }
  return [ref, r.stdout];
});
const size = (t) => ({ bytes: Buffer.byteLength(t), chars: [...t].length, tokens: Math.round([...t].length / 4), lines: t.split('\n').length });
// a section = a #/##/### heading outside a code fence, up to the next one
const sections = (text) => {
  const out = []; let fence = false;
  text.split('\n').forEach((l, i) => {
    if (l.startsWith('```')) fence = !fence;
    if (!fence && /^#{1,3} /.test(l)) out.push({ head: l, from: i, lines: [] });
    (out[out.length - 1] || (out[0] = { head: '(top)', from: 0, lines: [] })).lines.push(l);
  });
  return out.map((s) => ({ head: s.head, from: s.from, ...size(s.lines.join('\n')) }));
};
for (const [name, t] of texts) { const s = size(t); console.log(`${name}: ${s.bytes} bytes · ${s.chars} chars · ~${s.tokens} tokens (chars/4) · ${s.lines} lines`); }
for (const [name, t] of texts) {
  console.log(`\n${name} — per section:`);
  for (const s of sections(t)) console.log(`  ${String(s.from + 1).padStart(5)}  ${String(s.bytes).padStart(7)} B  ~${String(s.tokens).padStart(6)} tok  ${String(s.lines).padStart(4)} lines  ${[...s.head].slice(0, 70).join('')}`);
}
