#!/usr/bin/env node
// THE SHARED TASK-DETAIL BODY IS A CONTRACT — a census, not a memory (lane session-props-scroll, 2026-10-23: the owner on
// 2.369.348's Session Properties: 「这个界面目前也不能滚动了，而且 margin 很奇怪」). int346 (lane task-group-context) moved the
// `.task-detail` container's padding, section gap and scroll into a new `.task-detail-body` under the Task Group window's
// tabs; the OTHER window built on the same root class (Session Properties) kept appending its sections to the bare root
// and lost all three in one stroke. PURE grep census over src/lib + public/style.css, ~50 ms:
//   ① every `X.className = 'task-detail…'` ROOT in src/lib appends a `.task-detail-body` child, puts its
//     `.task-detail-section`s in it (never on the root) and never rebuilds the root (`X.innerHTML = …` would take the
//     body with it) — and the census finds BOTH consumers (vacuity guard)
//   ② the CSS: `.task-detail` is only the flex column (no padding / overflow / gap); `.task-detail-body` carries
//     flex 1 · min-height 0 · overflow-y auto · padding · gap; no rule re-adds those to a window's own root class or forks
//     the body under it (the body class IS the contract)
//   CONTROLS: the pre-fix session-props.js — the base 2.369.348 file (`git show c1dfc1af:…`, when this clone has it)
//   and a patched copy of today's file with the fix taken back out (always) — is RED on ①; planted CSS forks are RED on ②
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ROOT_RE = /(\w+)\.className = (['"`])task-detail(?: [\w-]+)*\2/g;          // the root class itself, never task-detail-*
const BODY_RE = /(\w+)\.className = (['"`])task-detail-body(?: [\w-]+)*\2/g;
const SECTION_RE = /(\w+)\.className = (['"`])task-detail-section(?: [\w-]+)*\2/g;
/** ① one file → { roots: [var…], bad: [sentence…] } */
function rootCensus(rel, srcIn) {
  const src = srcIn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // code only: block + whole-line comments out
  const roots = [...src.matchAll(ROOT_RE)].map((m) => m[1]);
  const bodies = [...src.matchAll(BODY_RE)].map((m) => m[1]);
  const sections = [...src.matchAll(SECTION_RE)].map((m) => m[1]);
  const bad = [];
  for (const v of roots) {
    const hasBody = bodies.some((b) => new RegExp(`\\b${esc(v)}\\.(?:appendChild\\(\\s*${esc(b)}\\s*\\)|append\\([^)]*\\b${esc(b)}\\b[^)]*\\))`).test(src));
    if (!hasBody) bad.push(`${rel}: the root \`${v}\` appends no .task-detail-body child`);
    for (const sct of sections) if (new RegExp(`\\b${esc(v)}\\.(?:appendChild\\(\\s*${esc(sct)}\\s*\\)|append\\([^)]*\\b${esc(sct)}\\b[^)]*\\))`).test(src)) bad.push(`${rel}: a .task-detail-section (\`${sct}\`) is appended to the root \`${v}\`, not its body`);
    if (new RegExp(`\\b${esc(v)}\\.innerHTML\\s*=`).test(src)) bad.push(`${rel}: \`${v}.innerHTML = …\` rebuilds the root — the body goes with it (clear the body instead)`);
  }
  return { roots, bad };
}
/** ② the stylesheet → [sentence…] */
function cssCensus(css) {
  const bad = [];
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((s) => s.trim()), decl: m[2] }));
  const only = (sel) => rules.filter((r) => r.sels.includes(sel));
  const root = only('.task-detail'); const body = only('.task-detail-body');
  if (!root.length) bad.push('no `.task-detail { … }` rule');
  for (const r of root) {
    for (const p of ['display: flex', 'flex-direction: column', 'height: 100%']) if (!r.decl.includes(p)) bad.push(`.task-detail lost \`${p}\``);
    if (/\b(padding|overflow(-y)?|gap)\s*:/.test(r.decl)) bad.push(`.task-detail carries padding / overflow / gap again (${r.decl.trim()}) — that is the body's job since 2.369.346`);
  }
  if (!body.length) bad.push('no `.task-detail-body { … }` rule');
  for (const r of body) for (const p of [/flex:\s*1\b/, /min-height:\s*0\b/, /overflow-y:\s*auto/, /padding:\s*\S/, /gap:\s*\S/]) if (!p.test(r.decl)) bad.push(`.task-detail-body lost ${p}`);
  // a window's own root class (Session Properties: .session-props) re-taking the body's job, or forking the body under it
  for (const r of rules) for (const s of r.sels) {
    if (/^(?:\.task-detail)?\.session-props$/.test(s) && /\b(padding|overflow(-y)?|gap)\s*:/.test(r.decl)) bad.push(`\`${s}\` re-adds padding / overflow / gap on the root — use the shared .task-detail-body`);
    if (/\.session-props\s*>?\s*\.task-detail-body\b/.test(s)) bad.push(`\`${s}\` forks the body rules — the .task-detail-body class IS the contract`);
  }
  return bad;
}

console.log('── ① every task-detail root in src/lib appends ONE .task-detail-body ──');
const libDir = path.join(repo, 'src/lib');
const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`);
const all = files.map((rel) => ({ rel, ...rootCensus(rel, read(rel)) })).filter((r) => r.roots.length);
const owners = all.map((r) => r.rel).sort();
check(`the census finds both consumers of the root class (${owners.join(', ')})`, owners.includes('src/lib/task-detail.js') && owners.includes('src/lib/session-props.js'), owners);
const offenders = all.flatMap((r) => r.bad);
check('every root appends a .task-detail-body, keeps its sections in it and never rebuilds the root', offenders.length === 0, offenders);

// CONTROL A: today's session-props.js with the fix taken back out (the 2.369.348 shape: sections on the root, root rebuilt)
const SP = read('src/lib/session-props.js');
const pre = SP
  .replace(/\n  const body = document\.createElement\('div'\);\n  body\.className = 'task-detail-body';\n  root\.appendChild\(body\);/, '')
  .replace('      body.appendChild(el);', '      root.appendChild(el);')
  .replace("    body.innerHTML = '';", "    root.innerHTML = '';");
check('CONTROL (patched copy): the fix really came out of the copy (3 edits)', pre !== SP && !/className = 'task-detail-body'/.test(pre) && pre.includes('root.appendChild(el);') && pre.includes("root.innerHTML = '';"));
const preBad = rootCensus('session-props.js (pre-fix copy)', pre).bad;
check(`CONTROL (patched copy): the pre-fix shape is RED — ${preBad.length} finding(s)`, preBad.length === 3 && preBad.some((b) => /appends no \.task-detail-body/.test(b)) && preBad.some((b) => /appended to the root/.test(b)) && preBad.some((b) => /rebuilds the root/.test(b)), preBad);
// CONTROL B: the base file itself, when this clone holds the object (a shallow CI checkout does not — control A stands)
let base = null;
try { base = execFileSync('git', ['-C', repo, 'show', 'c1dfc1af:src/lib/session-props.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { base = null; }
if (base) {
  const baseBad = rootCensus('session-props.js @ c1dfc1af', base).bad;
  check(`CONTROL (git show c1dfc1af, the shipped 2.369.348 file): RED — ${baseBad.length} finding(s)`, baseBad.some((b) => /appends no \.task-detail-body/.test(b)) && baseBad.some((b) => /appended to the root/.test(b)), baseBad);
} else console.log('  ⊘ SKIP control B (git show c1dfc1af): the base object is not in this clone (a shallow checkout) — the patched-copy control above stands for it');

console.log('── ② the CSS contract (public/style.css) ──');
const CSS = read('public/style.css');
const cssBad = cssCensus(CSS);
check('.task-detail is only the flex column; .task-detail-body carries flex 1 · min-height 0 · overflow-y auto · padding · gap; no window forks them', cssBad.length === 0, cssBad);
const plant = (extra) => cssCensus(CSS + '\n' + extra);
check('CONTROL: a planted `.session-props { padding: 10px 12px; overflow-y: auto }` (the root taking the body\'s job) is RED', plant('.session-props { padding: 10px 12px; overflow-y: auto; }').some((b) => /re-adds padding/.test(b)));
check('CONTROL: a planted `.session-props > .task-detail-body { … }` fork is RED', plant('.session-props > .task-detail-body { padding: 8px; }').some((b) => /forks the body/.test(b)));
check('CONTROL: the int346-before root (`.task-detail { … gap:10px; overflow-y:auto; padding:10px 12px … }`) is RED',
  cssCensus(CSS.replace(/\.task-detail \{[^}]*\}/, '.task-detail { display: flex; flex-direction: column; gap: 10px; height: 100%; overflow-y: auto; padding: 10px 12px; font-size: 12px; }')).some((b) => /carries padding/.test(b)));
check('CONTROL: a body without its scroll (`overflow-y` dropped) is RED',
  cssCensus(CSS.replace(/(\.task-detail-body \{[^}]*?)overflow-y: auto;\s*/, '$1')).some((b) => /lost .*overflow-y/.test(b)));

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
