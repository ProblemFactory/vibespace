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
  display: { ids: ['xpra', 'vnc', 'desktop-singleton', 'x11vnc'], owners: [{ file: 'src/desktop-backends.js', table: /^const DISPLAY_BACKENDS\s*=/m }] },
  browser: { ids: ['cloak', 'chromium', 'agent-browser'], owners: [{ file: 'src/browser-switch.js' }, { file: 'src/browser-profiles.js', table: /^const PROVIDERS\s*=/m }] },
  plugin: { ids: ['tailscale', 'frp'], owners: [{ dir: 'src/plugins/' }] },   // lane dc-plugins: a member = src/plugins/<id>.js + one index line
  // lane dc-apps-rows (2026-10-04, rv-desktop-apps F-A1): an app KIND is its own file in src/app-kinds/ + one index line (lane dc-app-kinds; the generic words
  // source / remove / search / move are kinds too, but every other family's code says them — only the kind-only ids count)
  appkind: { ids: ['apt', 'deb', 'appimage', 'uv-tool', 'npm', 'installer'], owners: [{ dir: 'src/app-kinds/' }] },
  // lane dc-mount-providers (rv-server M6): a storage provider is src/mount-providers/<id>.js + one index line
  mount: { ids: ['s3', 'drive', 'gmail', 'onedrive', 'cloud', 'webdav', 'vibespace', 'sftp', 'rclone', 'cephfs'], owners: [{ dir: 'src/mount-providers/' }] },
};

// FALSE POSITIVES — a line the regexes match that is not a branch on a family member. Each row: the family, the
// file, a regex over the line, and WHY it is not a member branch. Keep the reasons honest: a row here is a line
// the ratchet no longer sees.
export const ALLOW = [
  { family: 'harness', file: /^src\/codex-message-manager\.js$/, line: /\bn === 'shell'/, reason: 'Codex\'s own tool name (exec / shell / local_shell → bash), not the shell harness' },
  { family: 'appkind', file: /^src\/browser-profiles\.js$/, line: /t\.phase === 'npm'/, reason: 'the browser install\'s npm STEP (its progress phase), not the npm app kind' },
  { family: 'mount', file: /^src\/machine-mounts\.js$/, line: /rclone !== 'rclone'/, reason: 'the rclone BINARY resolved off PATH (the bare name = none found), not the rclone storage provider' },
  { family: 'channel', file: /^src\/lib\/(?:manage-agents|sidebar-rail)\.js$/, line: /_activeTab\s*[!=]==?\s*'agents'/, reason: 'the sidebar rail\'s Agents tab, not the agents channel vendor' },
  // lane dc-harness-tail (2026-10-05)
  { family: 'harness', file: /^src\/acp-message-manager\.js$|^src\/server\/stdout\/acp-events\.js$/, line: /\.type [!=]== 'acp'/, reason: 'the ACP wrapper journal\'s FRAME type (data/bin/acp-wrapper.js writes {type:\'acp\'}), not the acp harness id' },
  { family: 'harness', file: /^server\.js$/, line: /console\.log\(`\s*dtach: /, reason: 'the boot log line naming the resolved CLI paths (ids inside a template string, not keys)' },
];

// EXEMPT — a DECLARED registry / table / oracle keyed by member ids BY DESIGN (lane dc-harness-tail, 2026-10-05): its
// rows ARE the members' declarations, so the ratchet counts the real branches only. Each row: the family, the file,
// the table it covers (a regex for the table's first line; no table = the whole file) and WHY. The census prints every
// row with the lines it covers; test-architecture §78 reds a row whose table is gone or that covers nothing (a dead
// exemption would hide a new branch).
export const EXEMPT = [
  { family: 'harness', file: 'src/backend-caps.js', table: /^const BACKEND_CAPS\s*=/m, reason: 'THE caps registry — one declared row per built-in harness (a contributed one arrives through register())' },
  { family: 'harness', file: 'src/harness-settings.js', table: /^const HARNESS_SETTINGS\s*=/m, reason: 'the declared per-harness settings tables (design-harness-settings §2) — the descriptor joins its own by identity' },
  { family: 'harness', file: 'src/lib/agent-meta.js', table: /^export const BACKEND_META\s*=/m, reason: 'the client META registry — the descriptor rows mirrored key for key (test-harness-contract deep-compares)' },
  { family: 'harness', file: 'src/record-shape.js', reason: 'the transcript-record SCHEMA ORACLE per harness:carrier:shape — naming the harness whose record shape it states is its job' },
  { family: 'harness', file: 'src/server/cli-env.js', table: /^const AVAILABLE_MODELS\s*=/m, reason: 'the /api/available-models seed table (the model list a harness offers before its own source answers)' },
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

// the [first, last] 1-based line span of a balanced { … } / [ … ] block that starts at `re`; `skipComments` (the
// EXEMPT rows' tables, whose essays say "harness's") steps over // and /* */ comments so an apostrophe there is no quote
export function tableSpan(text, re, { skipComments = false } = {}) {
  const m = re.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length, d = 0, opened = false, q = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (skipComments && c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { const end = text[i + 1] === '/' ? '\n' : '*/'; const k = text.indexOf(end, i + 2); i = k < 0 ? text.length : k + end.length - 1; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if (c === '{' || c === '[' || c === '(') { d++; opened = true; } else if (c === '}' || c === ']' || c === ')') { d--; if (opened && d <= 0) break; }
  }
  const lineOf = (k) => text.slice(0, k).split('\n').length;
  return [lineOf(m.index), lineOf(i)];
}

const ownerOf = (fam, f) => FAMILIES[fam].owners.find((o) => (o.dir && f.startsWith(o.dir)) || o.file === f);

// census(repo, { read }) → { counts: {family: {file: n}}, lines: {family: [{file, line, text}]}, allowed: {family: n}, owners,
//   exempt: {family: [{file, span, lines, reason}]} }
// `read` lets a negative control hand in a planted text for one file.
export function census(repo, { read = (f) => fs.readFileSync(path.join(repo, f), 'utf8'), files = scopeFiles(repo) } = {}) {
  const counts = {}, lines = {}, allowed = {}, owners = {}, exempt = {};
  for (const fam of Object.keys(FAMILIES)) { counts[fam] = {}; lines[fam] = []; allowed[fam] = 0; owners[fam] = []; exempt[fam] = []; }
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
      const ex = EXEMPT.filter((e) => e.family === fam && e.file === f).map((e) => ({ e, span: e.table ? tableSpan(text, e.table, { skipComments: true }) : [1, L.length], n: 0 }));
      L.forEach((ln, i) => {
        if (span && i + 1 >= span[0] && i + 1 <= span[1]) return;
        const t = ln.trim();
        if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (!PATTERNS[fam].some((re) => re.test(ln)) && !dispatchKey(fam, L, i)) return;
        if (ALLOW.some((a) => a.family === fam && a.file.test(f) && a.line.test(ln))) { allowed[fam]++; return; }
        const x = ex.find((r) => r.span && i + 1 >= r.span[0] && i + 1 <= r.span[1]);
        if (x) { x.n++; return; }
        counts[fam][f] = (counts[fam][f] || 0) + 1;
        lines[fam].push({ file: f, line: i + 1, text: t.slice(0, 160) });
      });
      for (const r of ex) exempt[fam].push({ file: f, span: r.span, lines: r.n, reason: r.e.reason });
    }
  }
  return { counts, lines, allowed, owners, exempt };
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
  const { counts, lines, exempt } = census(repo);
  if (process.argv.includes('--write-initial')) {
    if (fs.existsSync(BASE)) { console.error('baseline exists — use --lower'); process.exit(1); }
    fs.writeFileSync(BASE, JSON.stringify(counts, null, 1) + '\n');
  } else if (process.argv.includes('--lower')) {
    fs.writeFileSync(BASE, JSON.stringify(lowered(JSON.parse(fs.readFileSync(BASE, 'utf8')), counts), null, 1) + '\n');
  } else if (process.argv.includes('--lines')) {
    for (const [fam, rows] of Object.entries(lines)) for (const r of rows) console.log(`${fam}\t${r.file}:${r.line}\t${r.text}`);
  }
  for (const fam of Object.keys(counts)) console.log(`${fam}: ${total(counts[fam])} lines in ${Object.keys(counts[fam]).length} files`);
  for (const [fam, rows] of Object.entries(exempt)) for (const r of rows) console.log(`  EXEMPT ${fam}\t${r.file}${r.span ? ':' + r.span.join('-') : ' (table NOT FOUND)'}\t${r.lines} lines — ${r.reason}`);
}
