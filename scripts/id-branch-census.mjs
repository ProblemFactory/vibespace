#!/usr/bin/env node
// LITERAL-ID BRANCH CENSUS (lane dc-ratchet, 2026-10-04 — the RATCHET of the decoupling review, rv-harnesses T18).
// The owner's standard: a harness / channel vendor / display backend / browser provider / plugin is ONE file
// (or folder) + ONE registration line, and the core gates on DECLARED rows, never on an id. This census counts,
// per family and per file OUTSIDE the family's owner, the lines that branch on a quoted member id. The counts are
// pinned in scripts/fixtures/id-branch-baseline.json ({family: {file: count}}, written 2026-10-04 from master
// 8d934bb1); test-architecture §78 is RED when a file rises above its baseline (a new branch) and RED when one
// falls below it (the lane that removed a branch lowers the baseline in the same commit — `node
// scripts/id-branch-census.mjs --lower` writes min(baseline, now) and never raises a row).
//
// A BRANCH LINE (one count per line per family, however many ids it names) is a code line (comment-only lines
// are skipped) that carries one of:
//   compare  [!=]==? 'id'  or  'id' [!=]==?           x === 'claude', 'xpra' !== stream
//   case     case 'id':                               a switch arm
//   key      ^ / { / , then id or 'id' then a single :  a DISPATCH MAP keyed by ids ({ claude: …, codex: … }) —
//            only when the same object (the same line, or the sibling keys at the same indent inside the block)
//            carries a SECOND id of the family; a lone { shell: true } / { agents: 0 } / { chromium: '146…' } is a
//            property that happens to share a member's name, not a map keyed by members
// Quotes may be ' " or a backtick. NOT counted (named so nobody re-litigates): .includes(['a','b']) sets,
// || 'claude' defaults, ids inside strings / URLs / labels, ternary arms (? 'a' : 'b').
// SCOPE: tracked + untracked-not-ignored src/** · server.js · data/bin/** code (.js .mjs .cjs, extensionless
// CLIs), minus the i18n dictionaries; scripts/ (the tests) are not the core.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const FAMILIES = {
  harness: { ids: ['claude', 'codex', 'opencode', 'acp', 'shell'], owners: [{ dir: 'src/harnesses/' }, { dir: 'src/adapters/' }] },
  channel: { ids: ['lark', 'slack', 'gmail', 'fake', 'agents'], owners: [{ dir: 'src/channels/' }] },
  display: { ids: ['xpra', 'vnc', 'desktop-singleton', 'x11vnc'], owners: [{ file: 'src/desktop-apps.js', table: /^const DISPLAY_BACKENDS\s*=/m }] },
  browser: { ids: ['cloak', 'chromium', 'agent-browser'], owners: [{ file: 'src/browser-switch.js' }, { file: 'src/browser-profiles.js', table: /^const PROVIDERS\s*=/m }] },
  plugin: { ids: ['tailscale', 'frp'], owners: [{ dir: 'src/plugins/' }] },   // lane dc-plugins: a member = src/plugins/<id>.js + one index line
};

// FALSE POSITIVES — a line the regexes match that is not a branch on a family member. Each row: the family, the
// file, a regex over the line, and WHY it is not a member branch. Keep the reasons honest: a row here is a line
// the ratchet no longer sees.
export const ALLOW = [
  { family: 'harness', file: /^src\/codex-message-manager\.js$/, line: /\bn === 'shell'/, reason: 'Codex\'s own tool name (exec / shell / local_shell → bash), not the shell harness' },
  { family: 'channel', file: /^src\/lib\/(?:manage-agents|sidebar-rail)\.js$/, line: /_activeTab\s*[!=]==?\s*'agents'/, reason: 'the sidebar rail\'s Agents tab, not the agents channel vendor' },
];

const BRANCH = (ids) => {
  const I = ids.map((s) => s.replace(/[-]/g, '\\-')).join('|');
  const Q = '([\'"`])';
  return [
    new RegExp(`[!=]==?\\s*${Q}(?:${I})\\1`), new RegExp(`${Q}(?:${I})\\1\\s*[!=]==?`),
    new RegExp(`\\bcase\\s+${Q}(?:${I})\\1\\s*:`),
  ];
};
export const PATTERNS = Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, BRANCH(f.ids)]));
const KEY = (ids) => new RegExp(`(?:^|[{,])\\s*(['"]?)(${ids.map((s) => s.replace(/[-]/g, '\\-')).join('|')})\\1\\s*:(?!:)`, 'g');
export const KEYS = Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, KEY(f.ids)]));
const keyIds = (fam, ln) => new Set([...ln.matchAll(KEYS[fam])].map((m) => m[2]));
const indentOf = (ln) => ln.match(/^\s*/)[0].length;
// a key line is a dispatch-map entry when its object holds a second member id as a key
function dispatchKey(fam, L, i) {
  const here = keyIds(fam, L[i]);
  if (!here.size) return false;
  if (here.size > 1) return true;
  const ind = indentOf(L[i]), seen = new Set(here);
  for (const dir of [-1, 1]) {
    for (let j = i + dir; j >= 0 && j < L.length && Math.abs(j - i) < 400; j += dir) {
      if (!L[j].trim()) continue;
      const d = indentOf(L[j]);
      if (d < ind) break;
      if (d === ind) for (const id of keyIds(fam, L[j])) seen.add(id);
    }
  }
  return seen.size > 1;
}

export function scopeFiles(repo) {
  const out = execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', 'src', 'server.js', 'data/bin'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return [...new Set(out.split('\n').filter(Boolean))].filter((f) => (/\.(?:c|m)?js$/.test(f) || /^data\/bin\/[^./]+$/.test(f))
    && !/^src\/lib\/i18n-[a-z]+\.js$/.test(f) && f !== 'src/lib/build-version.js' && fs.existsSync(path.join(repo, f))).sort();
}

// the [first, last] 1-based line span of a balanced { … } / [ … ] block that starts at `re`
export function tableSpan(text, re) {
  const m = re.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length, d = 0, opened = false, q = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if (c === '{' || c === '[' || c === '(') { d++; opened = true; } else if (c === '}' || c === ']' || c === ')') { d--; if (opened && d <= 0) break; }
  }
  const lineOf = (k) => text.slice(0, k).split('\n').length;
  return [lineOf(m.index), lineOf(i)];
}

const ownerOf = (fam, f) => FAMILIES[fam].owners.find((o) => (o.dir && f.startsWith(o.dir)) || o.file === f);

// census(repo, { read }) → { counts: {family: {file: n}}, lines: {family: [{file, line, text}]}, allowed: {family: n}, owners }
// `read` lets a negative control hand in a planted text for one file.
export function census(repo, { read = (f) => fs.readFileSync(path.join(repo, f), 'utf8'), files = scopeFiles(repo) } = {}) {
  const counts = {}, lines = {}, allowed = {}, owners = {};
  for (const fam of Object.keys(FAMILIES)) { counts[fam] = {}; lines[fam] = []; allowed[fam] = 0; owners[fam] = []; }
  for (const f of files) {
    let text; try { text = read(f); } catch { continue; }
    if (!text) continue;
    const L = text.split('\n');
    for (const fam of Object.keys(FAMILIES)) {
      const own = ownerOf(fam, f);
      let span = null;
      if (own) {
        if (!own.table) { const o = own.dir || f; if (!owners[fam].includes(o)) owners[fam].push(o); continue; }
        span = tableSpan(text, own.table);
        owners[fam].push(span ? `${f}:${span[0]}-${span[1]}` : `${f} (table NOT FOUND)`);
      }
      L.forEach((ln, i) => {
        if (span && i + 1 >= span[0] && i + 1 <= span[1]) return;
        const t = ln.trim();
        if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (!PATTERNS[fam].some((re) => re.test(ln)) && !dispatchKey(fam, L, i)) return;
        if (ALLOW.some((a) => a.family === fam && a.file.test(f) && a.line.test(ln))) { allowed[fam]++; return; }
        counts[fam][f] = (counts[fam][f] || 0) + 1;
        lines[fam].push({ file: f, line: i + 1, text: t.slice(0, 160) });
      });
    }
  }
  return { counts, lines, allowed, owners };
}

// judge(baseline, counts) → { rises: [{family, file, base, now}], falls: [...] }
export function judge(baseline, counts) {
  const rises = [], falls = [];
  for (const fam of new Set([...Object.keys(baseline), ...Object.keys(counts)])) {
    const b = baseline[fam] || {}, c = counts[fam] || {};
    for (const f of new Set([...Object.keys(b), ...Object.keys(c)])) {
      const base = b[f] || 0, now = c[f] || 0;
      if (now > base) rises.push({ family: fam, file: f, base, now });
      else if (now < base) falls.push({ family: fam, file: f, base, now });
    }
  }
  return { rises, falls };
}

export const total = (byFile) => Object.values(byFile || {}).reduce((a, b) => a + b, 0);

// `--lower`: write min(baseline, now) per row (a zero row is dropped); NEVER raises a row — a rise is fixed in
// the code (or, for a genuine false positive, an ALLOW row with its reason), not by editing the baseline.
export function lowered(baseline, counts) {
  const out = {};
  for (const fam of Object.keys(baseline)) {
    out[fam] = {};
    for (const [f, n] of Object.entries(baseline[fam])) { const m = Math.min(n, (counts[fam] || {})[f] || 0); if (m > 0) out[fam][f] = m; }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const BASE = path.join(repo, 'scripts/fixtures/id-branch-baseline.json');
  const { counts, lines } = census(repo);
  if (process.argv.includes('--write-initial')) {
    if (fs.existsSync(BASE)) { console.error('baseline exists — use --lower'); process.exit(1); }
    fs.writeFileSync(BASE, JSON.stringify(counts, null, 1) + '\n');
  } else if (process.argv.includes('--lower')) {
    fs.writeFileSync(BASE, JSON.stringify(lowered(JSON.parse(fs.readFileSync(BASE, 'utf8')), counts), null, 1) + '\n');
  } else if (process.argv.includes('--lines')) {
    for (const [fam, rows] of Object.entries(lines)) for (const r of rows) console.log(`${fam}\t${r.file}:${r.line}\t${r.text}`);
  }
  for (const fam of Object.keys(counts)) console.log(`${fam}: ${total(counts[fam])} lines in ${Object.keys(counts[fam]).length} files`);
}
