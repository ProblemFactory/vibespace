#!/usr/bin/env node
// THE AGENT CLI REGISTRY (lane cli-registry — the owner, 2026-10-18: "我们vibespace提供的工具本质都是cli，那应该直接维护一个
// vibespace cli工具列表…最顶级的工具列表和简述，做好总长度的限制和测试避免context注入过长。因为是single source of truth，也好
// 维护一些"). src/agent-cli-registry.js holds ONE row per agent CLI on PATH; the SessionStart section, the per-turn
// reminder, the index `vibespace-docs` prints and the docs topics render from it. Fast, in-process:
//   ① census: every file src/server/agent-tool-generators.js writes into data/bin, every tracked data/bin file, every
//      name HostManager.AGENT_TOOLS ships and every data/bin file a package.json script builds has EXACTLY one row — or
//      one EXCLUDED reason (below); every `vibespace-<x>` a teaching surface names is a row; MUTANT: a bin with no row ⇒ RED
//   ② the rows: unique names / topics, a gate the hook evaluates, every manual file exists, every summary ≤ CAPS.summary;
//      MUTANT: a 2 KB summary ⇒ RED
//   ③ the caps: the SessionStart section and the reminder line with EVERY gate open, widest shape, ≤ CAPS (printed);
//      MUTANT: a 2 KB paragraph / segment ⇒ RED
//   ④ the renders: every teaching shape (measure-prompt-context teachingShapes) equals its pin in
//      scripts/fixtures/cli-registry-renders.json — the 4a14bcc2 (2.369.298) render, or a pinned change WITH its reason
//   ⑤ the index: renderIndex names every row, docs/agent/index-manual.md's generated block equals it, AGENT_DOC_TOPICS is
//      the rows', `vibespace-docs` with no argument asks for it; a closed gate omits its row from every surface
// Run: node scripts/test-cli-registry.mjs            (--write-index rewrites index-manual.md's block from the rows)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { teachingShapes } from './measure-prompt-context.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = require(path.join(REPO, 'src/agent-cli-registry.js'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const B = (t) => Buffer.byteLength(String(t || ''), 'utf-8');
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const INDEX_FILE = 'docs/agent/index-manual.md';

/** index-manual.md with its generated block replaced by `table` (the --write-index door and ⑤'s judge share it) */
function withIndex(md, table) {
  const a = md.indexOf(REG.INDEX_MARKS.open), b = md.indexOf(REG.INDEX_MARKS.close);
  if (a < 0 || b < a) return null;
  return md.slice(0, a + REG.INDEX_MARKS.open.length) + '\n' + table + '\n' + md.slice(b);
}
if (process.argv.includes('--write-index')) {
  const next = withIndex(read(INDEX_FILE), REG.renderIndex());
  if (!next) { console.error(`${INDEX_FILE}: the generated block's marks are missing`); process.exit(2); }
  fs.writeFileSync(path.join(REPO, INDEX_FILE), next);
  console.log(`${INDEX_FILE}: the generated block rewritten (${REG.ROWS.length} rows)`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

// What sits in data/bin that is NOT an agent CLI — each with its reason (like test-architecture §43). A name here and a
// row is RED (exactly one); a reason no census input names any more is RED (a dead reason hides the next one).
const EXCLUDED = Object.freeze({
  'vibespace-hook.mjs': 'the harness hook (SessionStart / prompt / stop) — Claude Code and codex run it, never an agent',
  'vibespace-hook-register.mjs': 'registers that hook on a remote host — shipped beside it, run by the server over ssh',
  'vibespace-claude-subscription-login.mjs': 'the account pool\'s subscription login helper — the server runs it',
  'vibespace-remote-keeper': 'a remote chat session\'s persistence — the server\'s own process on a host',
  'vibespace-usage': 'the statusLine usage capture — Claude Code runs it',
  'vibespace-usage-scan': 'the remote usage ledger scanner — shipped over ssh stdin, run by the server',
  'vibespace-opencode-op': 'the remote OpenCode-serve op runner — the server runs it over ssh',
  'vibespace-agentd.js': 'the device agent bundle npm run build:agentd writes — shipped to devices, not a command',
  'vibespace-agentd-attach.js': 'the device agent\'s attach bundle — shipped beside it, not a command',
  'vibespace-browser-verbs.js': 'a module vibespace-browser loads (the verb table), copied at boot',
  'vibespace-browser-stuck.js': 'a module vibespace-browser loads (the dialog words), copied at boot',
  'vibespace-browser-passkey.js': 'a module vibespace-browser loads (the passkey words), copied at boot',
  'agent-cli-text.js': 'the ONE-text rule module the free-text CLIs require (lane cli-one-text-arg)',
  'agent-browser': 'the driver behind vibespace-browser — agents are never taught its name (test-architecture §52)',
  'editor': 'the EDITOR stand-in\'s own dir, off the PATH since B-b87b',
  'editor/code': 'Claude Code\'s EDITOR stand-in (Ctrl+G) — EDITOR= names it, the PATH never does (B-b87b)',
  'code': 'the pre-B-b87b EDITOR stand-in, unlinked at every boot',
  'acp-wrapper.js': 'a wrapper the server spawns an ACP harness through',
  'chat-wrapper.js': 'a wrapper the server spawns a chat session through',
  'codex-chat-wrapper.js': 'a wrapper the server spawns a codex chat session through',
  'job-wrapper.js': 'the wrapper the server spawns a Background Work job through',
  'pty-wrapper.js': 'a wrapper the server spawns a terminal session through',
});

/** the census inputs, read off the tree (each a list of names relative to data/bin) */
function censusInputs({ generators = read('src/server/agent-tool-generators.js') } = {}) {
  const written = [...generators.matchAll(/path\.join\((AGENT_BIN_DIR|EDITOR_DIR),\s*'([^']+)'\)/g)].map((m) => (m[1] === 'EDITOR_DIR' ? 'editor/' : '') + m[2]);
  let tracked = [];
  try { tracked = execFileSync('git', ['ls-files', 'data/bin'], { cwd: REPO, encoding: 'utf-8' }).split('\n').filter(Boolean).map((f) => f.slice('data/bin/'.length)); } catch { }
  const hosts = /static AGENT_TOOLS = \[([^\]]*)\]/.exec(read('src/hosts.js'));
  const shipped = hosts ? [...hosts[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  const pkg = JSON.parse(read('package.json'));
  const built = Object.values(pkg.scripts || {}).flatMap((cmd) => [...String(cmd).matchAll(/data\/bin\/([\w.-]+)/g)].map((m) => m[1]));
  return { written, tracked, shipped, built };
}
/** the census judge: problems, empty = holds */
function censusProblems(inputs, rows = REG.ROWS, excluded = EXCLUDED) {
  const bad = [];
  const names = new Set(rows.map((r) => r.name));
  const all = new Map();
  for (const [src, list] of Object.entries(inputs)) for (const n of list) { if (!all.has(n)) all.set(n, new Set()); all.get(n).add(src); }
  for (const [n, srcs] of all) {
    const row = names.has(n), ex = Object.prototype.hasOwnProperty.call(excluded, n);
    if (!row && !ex) bad.push(`${n} (${[...srcs].join(' + ')}) has no registry row and no EXCLUDED reason`);
    if (row && ex) bad.push(`${n} is a row AND excluded`);
  }
  for (const r of rows) if (!all.has(r.name)) bad.push(`row ${r.name}: no census input names it (no generator, no tracked file, not shipped)`);
  for (const n of Object.keys(excluded)) if (!all.has(n)) bad.push(`EXCLUDED ${n}: nothing names it any more (a dead reason)`);
  return bad;
}

/** the rows judge */
function rowProblems(rows = REG.ROWS) {
  const bad = [];
  const seen = new Set(), topics = new Set();
  for (const r of rows) {
    if (!/^vibespace-[a-z]+$/.test(r.name)) bad.push(`${r.name}: not a vibespace-<word> name`);
    if (seen.has(r.name)) bad.push(`${r.name}: two rows`); seen.add(r.name);
    for (const t of [r.topic, ...(r.aliases || [])]) { if (topics.has(t)) bad.push(`${r.name}: topic ${t} taken twice`); topics.add(t); }
    if (!REG.GATES.includes(r.gate)) bad.push(`${r.name}: gate "${r.gate}" is not one the hook evaluates (${REG.GATES.join(' / ')})`);
    for (const f of [].concat(r.manual)) if (!fs.existsSync(path.join(REPO, 'docs/agent', f))) bad.push(`${r.name}: manual docs/agent/${f} is missing`);
    if (B(r.summary) > REG.CAPS.summary || !r.summary || /\n/.test(r.summary)) bad.push(`${r.name}: summary ${B(r.summary)} B (one line, ≤ ${REG.CAPS.summary} B)`);
    if (r.teach !== null && (typeof r.teach !== 'object' || ['sessionStart', 'reminder'].some((k) => r.teach[k] !== null && typeof r.teach[k] !== 'function'))) bad.push(`${r.name}: teach is null or { sessionStart, reminder } of functions / null`);
  }
  return bad;
}

const T_ALL = (reach) => ({ status: true, ask: true, task: true, jobs: true, channels: reach });
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
const fileTools = AR.fileToolsOf({ backend: 'claude' });
const fullSection = (T, multi) => TaskGroupManager.prototype._toolsSectionParts.call({}, multi ? '--group <id> ' : '', multi, T, fileTools).join('\n');
const regSection = (T, multi, rows) => REG.renderSessionStartTools(T, { gid: multi ? '--group <id> ' : '', multi }, rows).join('\n');
/** the widest SessionStart section / reminder line with every gate open — the section INCLUDING its trailer (the
 *  absolute-paths + Artifacts line task-groups adds), so the number is what a session receives */
function widest(rows = REG.ROWS) {
  let section = 0, reminder = 0;
  for (const reach of ['read', 'request']) for (const multi of [false, true]) {
    const trailer = B(fullSection(T_ALL(reach), multi)) - B(regSection(T_ALL(reach), multi, REG.ROWS));
    section = Math.max(section, B(regSection(T_ALL(reach), multi, rows)) + trailer);
    for (const manager of [false, true]) reminder = Math.max(reminder, B(REG.renderReminderLine(T_ALL(reach), { multi, manager }, rows)));
  }
  return { section, reminder };
}
const capProblems = (rows) => { const w = widest(rows); return [...(w.section > REG.CAPS.sessionStart ? [`the SessionStart section is ${w.section} B (> ${REG.CAPS.sessionStart})`] : []), ...(w.reminder > REG.CAPS.reminder ? [`the reminder line is ${w.reminder} B (> ${REG.CAPS.reminder})`] : [])]; };
const mutate = (name, patch) => REG.ROWS.map((r) => (r.name === name ? { ...r, ...patch(r) } : r));

console.log('— ① the census: every bin has exactly one row or one reason');
{
  const inputs = censusInputs();
  ok(inputs.written.includes('vibespace-status') && inputs.tracked.includes('vibespace-docs') && inputs.shipped.includes('vibespace-msg') && inputs.built.length > 0,
    `the inputs are read (non-vacuous): ${inputs.written.length} written by the generators, ${inputs.tracked.length} tracked, ${inputs.shipped.length} shipped, ${inputs.built.length} built`);
  const bad = censusProblems(inputs);
  ok(bad.length === 0, `${REG.ROWS.length} rows + ${Object.keys(EXCLUDED).length} EXCLUDED cover every name, each once`, bad);
  const mut = censusProblems(censusInputs({ generators: read('src/server/agent-tool-generators.js') + "\nconst X = path.join(AGENT_BIN_DIR, 'vibespace-mutant');\n" }));
  ok(mut.length === 1 && /vibespace-mutant \(written\) has no registry row/.test(mut[0]), 'MUTANT: the generators write a vibespace-mutant with no row ⇒ RED', mut);
  ok(censusProblems({ ...inputs, tracked: [...inputs.tracked, 'vibespace-stray'] }).some((p) => /vibespace-stray \(tracked\)/.test(p)), 'MUTANT: a tracked data/bin/vibespace-stray with no row ⇒ RED');
  ok(censusProblems(inputs, REG.ROWS, { ...EXCLUDED, 'vibespace-gone': 'x' }).some((p) => /dead reason/.test(p)) && censusProblems(inputs, REG.ROWS, { ...EXCLUDED, 'vibespace-msg': 'x' }).some((p) => /row AND excluded/.test(p)), 'a dead EXCLUDED reason, or a name both a row and excluded ⇒ RED');
  // every CLI a teaching surface names is a row (tags like <vibespace-reminder> are not names); the no-group intro too —
  // its own lines are not rendered from the rows (its 4 096 B budget, its browser facts), so this is what holds it
  const set = { attachments: [{ alias: 'work', isDefault: true, profileId: 'bp-00000001' }, { alias: 'personal', isDefault: false, profileId: 'bp-00000002' }] };
  const surfaces = [...teachingShapes().map((s) => s.text), ...['D', 'none', 'H'].map((v) => AR.sessionToolsIntro(T_ALL('read'), { browserVariant: v, browserSet: set, fileTools })), REG.renderIndex(), read(INDEX_FILE)];
  const named = new Set(surfaces.flatMap((t) => [...t.matchAll(/(?<![<\/\w-])vibespace-[a-z][a-z-]*[a-z]/g)].map((m) => m[0])));
  const rowNames = new Set(REG.ROWS.map((r) => r.name));
  ok([...named].every((n) => rowNames.has(n)) && named.size >= 10, `every CLI the surfaces name is a row (${named.size}: ${[...named].sort().join(' ')})`, [...named].filter((n) => !rowNames.has(n)));
}

console.log('— ② the rows');
{
  ok(rowProblems().length === 0, `${REG.ROWS.length} rows: unique names and topics, a known gate, every manual on disk, every summary one line ≤ ${REG.CAPS.summary} B (widest ${Math.max(...REG.ROWS.map((r) => B(r.summary)))} B)`, rowProblems());
  for (const r of REG.ROWS) console.log(`     ${r.name.padEnd(19)} ${r.topic.padEnd(9)} ${r.gate.padEnd(9)} ${String(B(r.summary)).padStart(3)} B  ${r.teach ? 'taught' : 'index-only'}`);
  ok(rowProblems(mutate('vibespace-exit', () => ({ summary: 'x'.repeat(2048) }))).some((p) => /vibespace-exit: summary 2048 B/.test(p)), 'MUTANT: a 2 KB summary ⇒ RED');
  ok(rowProblems(mutate('vibespace-page', () => ({ gate: 'pages' }))).length === 1 && rowProblems(mutate('vibespace-page', () => ({ manual: 'nope-manual.md' }))).length === 1, 'MUTANT: a gate the hook never evaluates, a manual not on disk ⇒ RED');
  const taught = REG.ROWS.filter((r) => r.teach).map((r) => r.topic), indexOnly = REG.ROWS.filter((r) => !r.teach).map((r) => r.topic);
  ok(taught.join(' ') === 'status ask task jobs channels msg index' && indexOnly.join(' ') === 'pages design exit window browser apps', `taught rows: ${taught.join(' ')} · index-only: ${indexOnly.join(' ')} (no injected bytes for them)`);
}

console.log('— ③ the caps (every gate open, the widest shape)');
{
  const w = widest();
  ok(w.section <= REG.CAPS.sessionStart, `the SessionStart section ${w.section} B ≤ CAPS.sessionStart ${REG.CAPS.sessionStart} B (room ${REG.CAPS.sessionStart - w.section} B)`);
  ok(w.reminder <= REG.CAPS.reminder, `the reminder line ${w.reminder} B ≤ CAPS.reminder ${REG.CAPS.reminder} B (room ${REG.CAPS.reminder - w.reminder} B)`);
  const big = 'x'.repeat(2048);
  const m1 = capProblems(mutate('vibespace-status', (r) => ({ teach: { ...r.teach, sessionStart: () => big } })));
  const m2 = capProblems(mutate('vibespace-job', (r) => ({ teach: { ...r.teach, reminder: () => big } })));
  ok(m1.length === 1 && /SessionStart section/.test(m1[0]) && m2.length === 1 && /reminder line/.test(m2[0]), `MUTANT: a 2 KB paragraph / a 2 KB segment ⇒ RED (${m1[0]} · ${m2[0]})`);
  // a new taught row pays its bytes into the same caps: a row the size of the channels one fits the reminder once
  const extra = { name: 'vibespace-extra', topic: 'extra', manual: 'pages-manual.md', gate: 'always', summary: 's', teach: { sessionStart: () => REG.CHANNELS_SECTION_LINES.read, reminder: () => REG.CHANNELS_REMINDER_SEG.read } };
  const mx = capProblems([...REG.ROWS, extra]);
  ok(mx.some((p) => /SessionStart/.test(p)), `a seventh taught row with a channels-size paragraph is RED on the SessionStart cap (${mx.join('; ')})`);
}

console.log('— ④ the renders (pinned per shape: the 4a14bcc2 render, or a pinned change with its reason)');
{
  const FX = JSON.parse(read('scripts/fixtures/cli-registry-renders.json'));
  const shapes = teachingShapes();
  const bad = [], said = new Set();
  for (const s of shapes) {
    const f = FX.shapes[s.name];
    if (!f) { bad.push(`${s.name}: not pinned — add "${s.name}": { "base": …, "now": { "bytes": ${s.bytes}, "sha256": "${sha(s.text)}" }, "change": "why" }`); continue; }
    const pin = f.now || f.base;
    const same = pin.sha256 === sha(s.text) && pin.bytes === s.bytes;
    if (!same) bad.push(`${s.name}: ${s.bytes} B ${sha(s.text).slice(0, 12)} ≠ the pin ${pin.bytes} B ${pin.sha256.slice(0, 12)} — a deliberate teaching change re-pins it: "now": { "bytes": ${s.bytes}, "sha256": "${sha(s.text)}" } + "change": "why"`);
    if (f.now && !(typeof f.change === 'string' && f.change.length > 20)) bad.push(`${s.name}: a changed pin needs its reason`);
    const why = f.now ? (said.has(f.change) ? 'changed (the reason above)' : 'changed: ' + f.change) : 'identical to ' + FX.base.split(' ')[0];
    if (f.now) said.add(f.change);
    console.log(`     ${s.name.padEnd(44)} ${String(f.base ? f.base.bytes : '—').padStart(5)} → ${String(s.bytes).padStart(5)} B  ${why}`);
  }
  for (const name of Object.keys(FX.shapes)) if (!shapes.some((s) => s.name === name)) bad.push(`${name}: pinned but no longer rendered`);
  ok(shapes.length >= 18 && bad.length === 0, `${shapes.length} shapes, each its pin (${shapes.filter((s) => !FX.shapes[s.name] || !FX.shapes[s.name].now).length} identical to ${FX.base.split(' ')[0]})`, bad);
  // the routes' own renderers ARE the registry's: no second copy of a segment or paragraph survives in either file
  const routes = read('src/agent-routes.js'), tg = read('src/task-groups.js');
  const copies = REG.ROWS.flatMap((r) => ['sessionStart', 'reminder'].map((k) => (r.teach && r.teach[k] ? r.teach[k]({ g: '', multi: false, reach: 'read', topics: ['status'] }) : null)).filter(Boolean)).filter((t) => routes.includes(t.slice(0, 60)) || tg.includes(t.slice(0, 60)));
  ok(copies.length === 0, 'no paragraph or segment is spelled a second time in agent-routes.js / task-groups.js', copies.map((t) => t.slice(0, 80)));
}

console.log('— ⑤ the index, the topics, the gates');
{
  const idx = REG.renderIndex();
  ok(REG.ROWS.every((r) => idx.includes(`| \`${r.topic}\` | \`${r.name}\` | `) && idx.includes(r.summary.replace(/\|/g, '\\|'))), `renderIndex: one table row per registry row (${REG.ROWS.length}), each with its summary, + the usage line`);
  const md = read(INDEX_FILE);
  ok(withIndex(md, idx) === md, `${INDEX_FILE}'s generated block equals renderIndex() (else: node scripts/test-cli-registry.mjs --write-index)`);
  ok(withIndex(md, idx + '\n| `x` | `vibespace-x` | drift | `vibespace-docs x` |') !== md, 'CONTROL: a hand-added table row is a different file (the judge sees drift)');
  const want = Object.fromEntries(REG.ROWS.flatMap((r) => [r.topic, ...(r.aliases || [])].map((t) => [t, r.manual])));
  ok(JSON.stringify(AR.AGENT_DOC_TOPICS) === JSON.stringify(want) && AR.AGENT_DOC_TOPICS.index === 'index-manual.md' && AR.AGENT_DOC_TOPICS.app === AR.AGENT_DOC_TOPICS.apps, `AGENT_DOC_TOPICS (the docs route's) = the rows' topics + aliases (${Object.keys(want).join(' ')})`);
  ok(/process\.argv\[2\] \|\| 'index'/.test(read('data/bin/vibespace-docs')), '`vibespace-docs` with no argument asks for the index topic (the rendered list + the usage line)');
  // a closed gate omits its row from EVERY surface — the section, the reminder's segment, the docs pointer
  const T4 = { status: true, ask: true, task: true, jobs: true };
  const surf = (T) => fullSection(T, false) + '\n' + REG.renderReminderLine(T, {});
  ok(!/vibespace-channels|\|channels|vibespace-docs channels/.test(surf(T4)) && /vibespace-channels/.test(surf(T_ALL('read'))) && REG.pointerTopics(T_ALL('read')).includes('channels'), 'no reach ⇒ no vibespace-channels, no `channels` topic anywhere; with reach ⇒ both');
  const off = surf({ ...T4, status: false });
  ok(!/vibespace-status|status\|/.test(off) && REG.pointerTopics({ ...T4, status: false })[0] === 'ask', 'status toggled off ⇒ no vibespace-status in the section or the reminder, no `status` in the docs pointer');
  ok(REG.renderSessionStartTools({ status: false, ask: false, task: false, jobs: false }).length === 0 && REG.renderSessionStartTools({ status: false, ask: false, task: false, jobs: false, channels: 'read' }).length > 0, 'every toggle and the reach closed ⇒ no section (the msg pointer never rides alone); reach alone opens it');
  ok(REG.pointerTopics(T_ALL('read')).join('|') === 'status|ask|task|jobs|channels|msg|pages|design|exit|window|browser|apps', `the pointer, every gate open: vibespace-docs [${REG.pointerTopics(T_ALL('read')).join('|')}]`);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
