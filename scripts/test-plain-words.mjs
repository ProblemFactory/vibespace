#!/usr/bin/env node
// test-plain-words — lane ui-plain-words (the owner 2026-11-13: «你看看这个界面是不是应该优化下，最好走查一下所有界面找到可优化的
// 布局，提示文本等»; the UI walk's patterns «internal names, commands, variables and paths shown to a person» and «a wall of
// explanation before the action»). THE CENSUS of the face / fold law, derived from the tree, PURE (no build, no browser):
//   ① THE SHAPES: every human-visible key (scripts/i18n-extract.mjs extractKeys — t / tr / tc / i18nKey, index.html) whose English
//      or zh text shows an environment variable, an agent CLI command, a --flag, a file path, a setting key or an internal id is
//      either PROVEN to sit in a fold (every source occurrence is inside techFold( / techFoldHtml( / a settings `details: [` / an
//      item's `fold: [`) or is a row of the PRINTED, SHRINK-ONLY baseline (scripts/fixtures/plain-words-baseline.json). A new
//      instance is RED by name; a baseline row that no longer holds (gone, cured, folded) is RED until its row is removed.
//   ② THE WALL: a settings row whose description runs past WALL_CHARS with no `details:` is a baseline row, shrink-only too.
//   ③ THE ONE DOOR: a «Technical details» summary or a `data-fold="tech"` built OUTSIDE src/lib/plain-words.js counts per file
//      against the baseline (a new file, or more than the baseline's count, is RED).
//   ④ THE CARRIERS: settings-ui draws `details:` through techFold; the For-you row draws `i18n.fold` through techFoldHtml; the
//      store KEEPS `i18n.fold` (a real UserTodoManager round trip); the record (Copy) says the fold lines.
//   ⑤ THE BASE LINK COLOUR: style.css holds `:where(a) { color: var(--accent); }` (a theme variable, never a literal).
//   ⑥ CONTROLS: a planted key per shape is RED by name; a fold occurrence moved out of its fold is RED; a door built outside is
//      counted; a baseline row that shrank is RED.
// `node scripts/test-plain-words.mjs --print-baseline` prints the baseline the tree holds now (to shrink it after a cure).
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { extractKeys, dictEntries } from './i18n-extract.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const BASELINE_PATH = path.join(REPO, 'scripts/fixtures/plain-words-baseline.json');
const WALL_CHARS = 240;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs, B-1747)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── the shapes (each a named rule; the CLI names are DERIVED from the tracked data/bin) ──
const binNames = execFileSync('git', ['-C', REPO, 'ls-files', 'data/bin'], { encoding: 'utf8' }).split('\n').map((f) => path.basename(f)).filter((f) => /^vibespace-[a-z-]+$/.test(f));   // the TRACKED CLIs (§96: a census lists data/bin through git ls-files)
const SHAPES = {
  env: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/,
  cli: new RegExp(`\\b(?:claude|codex|opencode|agy)\\s+(?:-p\\b|setup-token\\b|serve\\b|auth\\s+\\w|agents\\b|mcp\\s+\\w)|\\b(?:${binNames.map((n) => n.replace(/-/g, '\\-')).join('|')})\\s+[a-z][a-z-]*\\b`),
  flag: /(?:^|[\s(«“"'`])--[a-z][a-z0-9-]{2,}/,
  path: /(?:^|[\s(«“"'`])(?:~\/|data\/[\w.-]+\/|docs\/[\w.-]+|\/(?:usr|opt|var|etc|home|srv|tmp|root|mnt)\/)|\b[\w-]+\.json\b/,
  id: /vault:\/\/|\bbk-[0-9a-f]{6,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/,
};
let settingKeys = [];
const settingKeyRe = () => (settingKeys.length ? new RegExp(`(?:^|[\\s(«“"'\`])(?:${settingKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[\\s)»”"'\`.,;:])`) : /$^/);

/** → the shapes a text shows (sorted names). */
function shapesOf(text, keyRe) {
  const s = String(text || '');
  const out = Object.entries(SHAPES).filter(([, re]) => re.test(s)).map(([n]) => n);
  if (keyRe.test(s)) out.push('setting-key');
  return out.sort();
}

// ── the fold proof: an occurrence of a key's literal is inside techFold( / techFoldHtml( / details: [ / fold: [ ──
const MARKERS = ['techFold(', 'techFoldHtml(', 'details: [', 'fold: ['];
/** the index of the bracket that closes the one opened at `open` (strings and comments skipped), or -1. */
function closeOf(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
/** is the occurrence at `at` inside a fold call / field? */
function inFold(src, at) {
  let best = -1, mk = '';
  for (const m of MARKERS) { const i = src.lastIndexOf(m, at); if (i > best && at - i < 6000) { best = i; mk = m; } }
  if (best < 0) return false;
  const open = best + mk.length - 1;
  const close = closeOf(src, open);
  return close > at;
}
/** every source occurrence of a key (its first 48 chars, in the quote forms a literal takes) → [{file, at, fold}] */
function occurrences(files, key) {
  const head = key.slice(0, 48);
  const forms = [...new Set([head, head.replace(/'/g, "\\'"), head.replace(/"/g, '\\"')])];
  const out = [];
  for (const [rel, src] of files) for (const f of forms) { let i = src.indexOf(f); while (i >= 0) { out.push({ file: rel, at: i, fold: inFold(src, i) }); i = src.indexOf(f, i + 1); } }
  return out;
}

// ── the tree ──
// src/ui-needs.js is the need census's TABLE (its net's patterns and its debt's 64-character heads), never a surface a person reads —
// the move onto 2.369.412's checkpoint 500911fd9 (-moved3): its heads read as a debt sentence's second site (test-setting-links skips it alike)
function srcFiles() {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.js$/.test(e.name) && !/^i18n-(zh|ja)\.js$/.test(e.name) && e.name !== 'build-version.js' && r !== 'src/ui-needs.js') out.set(r, fs.readFileSync(path.join(REPO, r), 'utf8')); } };
  walk('src');
  return out;
}
const zh = new Map(dictEntries(read('src/lib/i18n-zh.js')).map((e) => [e.key, e.value]));
// closure E / F7: EVERY hand-built fold counts — a «Technical details» summary, the door's data-fold, and any <details> element
const DOOR_RE = /t\('Technical details'\)|dataset\.fold\s*=\s*'tech'|data-fold="tech"|createElement\('details'\)|<details\b/g;
const MAX_DEBT_ROWS = 122; // closure E: the printed debt's row count can only fall — a row added to the JSON by hand is red here (121 + ui-language 251d14387's add-machine key line: a path a person must follow)

async function measure() {
  const S = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  settingKeys = Object.keys(S.SETTINGS_SCHEMA).filter((k) => k.includes('.'));
  const keyRe = settingKeyRe();
  const files = srcFiles();
  const keys = [...extractKeys(REPO)];
  const hits = {};   // shape → [key]
  for (const k of keys) for (const sh of new Set([...shapesOf(k, keyRe), ...shapesOf(zh.get(k), keyRe)])) (hits[sh] ||= []).push(k);
  const wall = Object.entries(S.SETTINGS_SCHEMA).filter(([, row]) => String(row.description || '').length > WALL_CHARS && !row.details).map(([p]) => p).sort();
  const doors = {};
  for (const [rel, src] of files) { if (rel === 'src/lib/plain-words.js') continue; const n = (src.match(DOOR_RE) || []).length; if (n) doors[rel] = n; }
  return { files, keys: new Set(keys), hits, wall, doors, keyRe };
}

const M = await measure();
if (process.argv.includes('--print-baseline')) {
  const base = { about: 'scripts/test-plain-words.mjs — the PRINTED, SHRINK-ONLY debt of the face / fold law (lane ui-plain-words). Remove a row when it is cured; never add one.', shapes: {}, sites: {}, wall: M.wall, doors: M.doors };
  for (const [sh, ks] of Object.entries(M.hits)) {
    const debt = ks.filter((k) => { const occ = occurrences(M.files, k); return !(occ.length && occ.every((o) => o.fold)); }).sort();
    if (debt.length) base.shapes[sh] = debt;
    for (const k of debt) base.sites[k] = occurrences(M.files, k).filter((o) => !o.fold).length; // closure F25: a debt sentence's unfolded sites
  }
  console.log(JSON.stringify(base, null, 1));
  process.exit(0);
}
const B = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
// ── THE ALLOWED (主开发 ride-403, 2026-11-14: «an allowed line gets a named row with its reason»): lines of OTHER units this census met
// when the unit moved onto master (2.369.405, again 2.369.406), each judged and named — NOT debt: they never count toward MAX_DEBT_ROWS, the debt stays shrink-only,
// and a row whose line is gone is red until it leaves this table ──
const ALLOWED = {
  shapes: { 'setting-key': { 'no path for the remote to reach this instance — the device tunnel needs the machine daemon link; otherwise set agentd.publicUrl (Settings) or deploy with VIBESPACE_PUBLIC_URL': 'B-af94 moved onto 2.369.413\'s base ac70cf7ee: the release\'s push refusal, byte for byte, now a worded key (the net reads it) — it NAMES the two ways out a person takes, the Settings key agentd.publicUrl and the deploy variable VIBESPACE_PUBLIC_URL; its Settings door on the line is owed (src/machine-needs.js says so)' },
    flag: { 'On {machine}, run: xcode-select --install': 'machine-needs: the command IS the step a person types on the Mac — folding it would leave the instruction empty' },
    // the restack for 2.369.412 (lane bl-accounts' hand): lines of the release (2.369.410) this census met, each judged
    env: { 'no path for the remote to reach this instance — the device tunnel needs the machine daemon link; otherwise set agentd.publicUrl (Settings) or deploy with VIBESPACE_PUBLIC_URL': 'B-af94 moved onto 2.369.413\'s base ac70cf7ee: the release\'s push refusal, byte for byte, now a worded key (the net reads it) — it NAMES the two ways out a person takes, the Settings key agentd.publicUrl and the deploy variable VIBESPACE_PUBLIC_URL; its Settings door on the line is owed (src/machine-needs.js says so)',
      '{plugin} · its plugin was denied {resource}, outside its own folder (ERR_ACCESS_DENIED) — a bug in the plugin, unless its manifest declares that path': 'B-a470 (2.369.410): an engine plugin\'s own probe error is QUOTED, not hidden — ERR_ACCESS_DENIED is the plugin\'s own code, said so a person can report it',
      '{plugin} · its plugin was denied a path outside its own folder (ERR_ACCESS_DENIED) — a bug in the plugin, unless its manifest declares that path': 'B-a470 (2.369.410): the same quoted probe error, its no-resource form' ,
      'This machine\'s system does not name its release (VERSION_CODENAME in /etc/os-release), so no app system can be made for it.': 'the move onto 2.369.412\'s checkpoint d87ad011f: the app system\'s own refusal names the one field of the machine\'s own file it could not read (VERSION_CODENAME in /etc/os-release) — what a person checks or reports; folding it would leave the sentence saying nothing' },
    path: { 'To raise the limit: {cmd} (to keep it after a restart, put the same setting in /etc/sysctl.d/).': 'the block\'s checkpoint 60 (主开发 2026-11-19 09:31Z, ruled): the release 2.369.411\'s watch door — a RECIPE a person follows on the hub; the path is what they type (the sysctl folder that keeps the setting after a restart), the sentence unchanged',
      'Copied — add it to ~/.ssh/authorized_keys of {target}': 'the move onto 2.369.412\'s checkpoint 500911fd9 (-moved3): ui-needs-a-button pick 1\'s copied-key toast names the ONE file on the target machine a person adds the copied key to by hand — the step itself; folding it would leave the toast without its instruction',
      'data/job-secrets.retired.json is a link, a folder or a file with a second name — nothing was read or deleted. A link: put the file it points to in its place. A second name: delete that other name. A folder: move it out of the way. Then press again': 'the move onto 2.369.412\'s checkpoint d87ad011f: B-ef1b\'s retired secrets file — the sentence names the ONE file in the data folder a person must fix by hand before pressing again; folding it would leave the step empty',
      'not a plain text, number or true/false (or text with spaces around it) — nothing was moved; the file is kept: correct that value in data/job-secrets.retired.json, then press again': 'the move onto 2.369.412\'s checkpoint d87ad011f: B-ef1b\'s retired secrets file — the sentence names the ONE file in the data folder a person must fix by hand before pressing again; folding it would leave the step empty',
      'This machine\'s system does not name its release (VERSION_CODENAME in /etc/os-release), so no app system can be made for it.': 'the move onto 2.369.412\'s checkpoint d87ad011f: the app system\'s own refusal names the one field of the machine\'s own file it could not read (VERSION_CODENAME in /etc/os-release) — what a person checks or reports; folding it would leave the sentence saying nothing' } },
  sites: { 'the Mac has no screen helper yet — install the Command Line Tools there (xcode-select --install) or update VibeSpace': { n: 3, why: 'machine-needs: the same step at its third place (machine-app.js) — the command is the step' } },
  wall: {
    'accounts.onDemandQuotaRefresh': 'usage-predict (2.369.408): Claude\'s quota row as it shipped — its options and its sentence per choice are pinned word for word by test-agy-wall-signal ⑨b (law 1, law 6, the Off sentence naming «Refresh all», the select\'s width); settings-4 withdrawn on the restack (主开发 2026-11-17)',
    'antigravity.autoUsageReads': 'usage-predict (2.369.408): Antigravity\'s own reads row — its sentence per choice and the U3 clause order are pinned word for word by test-agy-wall-signal ⑨b',
    'agents.lowerCpuPriority': 'the move onto 2.369.412\'s checkpoint d87ad011f: B-460d\'s CPU-priority row (lane bl-loop-b) — its description is the release\'s, the row a lane of its own; a details: fold for it is that lane\'s',
    'browser.exitCheckUrl': 'the move onto 2.369.412\'s checkpoint d87ad011f: B-8b87\'s exit-check row (the profile proxy) — its description is the release\'s; a details: fold for it is that lane\'s',
  },
  doors: { 'src/lib/provider-wizard.js': { n: 2, why: 'the move onto 2.369.412\'s checkpoint d87ad011f: lg-providers\' wizard (B-d578) draws its own «Technical details» fold (pw-tech rows) — the release\'s lines; techFoldHtml for it is that lane\'s' },
    'src/lib/chat-renderers.js': { n: 48, why: 'the release (2.369.410): B-3d90 folds a hook card\'s named detail in a <details>, and phone-run-box\'s note names the swap\'s inner <details> (a comment the census counts) — the release\'s own lines, met at the restack for 2.369.412' },
    'src/lib/setup-flows.js': { n: 7, why: 'loop-day-report (2.369.407): the Diagnostics hour table\'s raw journal lines — hourlyTable is run ALONE by test-loop-day-report (new Function over its slice), so it cannot call the module\'s door; six older folds of this file stay debt' },
    'src/lib/ffmpeg-door.js': { n: 1, why: 'machine-needs pick 3d: «What the machine printed» — a failure log filled AFTER the run, in the install dialog\'s log look (as desktop-app-launcher\'s); the door draws static lines' },
    // the move onto 2.369.412's checkpoint 500911fd9 (-moved3): ui-needs-a-button's folds on the train, each judged
    'src/lib/sidebar-mounts.js': { n: 4, why: 'ui-needs-a-button picks 1 and 3 (on the train): the machine row\'s need line keeps the system\'s own failure text in a «Details» <pre> (ruled (a) 2026-11-18 20:03Z: ONE door, _hostErrLine) and the offline dial\'s «What to check» holds the dial verdict\'s lines under its need line — raw text and a verdict, which the door\'s static lines do not draw; two older folds of this file stay debt' },
    'src/lib/desktop-app-launcher.js': { n: 2, why: 'ui-needs-a-button pick 4 (on the train): a failed remove keeps what the machine printed in a «Details» <pre> under its need line (as the install dialog\'s log, and ffmpeg-door\'s) — a log filled after the run; the older fold of this file stays debt' },
    'src/lib/channels-panel.js': { n: 1, why: 'ui-needs-a-button channels-accounts-17 (on the train): the push choice\'s «Details» holds that option\'s own help rows (chanLine) beside the select — an option\'s explanation, not technical details' } },
};

console.log('① the shapes: every visible key that shows an internal name is folded, or a printed debt row');
{
  const fresh = [], shrank = [];
  for (const [sh, ks] of Object.entries(M.hits)) {
    const debt = new Set([...((B.shapes && B.shapes[sh]) || []), ...Object.keys(ALLOWED.shapes[sh] || {})]);
    for (const k of ks) {
      if (debt.has(k)) continue;
      const occ = occurrences(M.files, k);
      if (!(occ.length && occ.every((o) => o.fold))) fresh.push(`${sh}: «${k.slice(0, 90)}» (${occ.filter((o) => !o.fold).map((o) => o.file).slice(0, 3).join(', ') || 'no source occurrence found'})`);
    }
  }
  for (const [sh, ks] of Object.entries(B.shapes || {})) for (const k of ks) if (!M.keys.has(k) || !(M.hits[sh] || []).includes(k)) shrank.push(`${sh}: «${k.slice(0, 90)}»`);
  const debtN = Object.values(B.shapes || {}).reduce((n, l) => n + l.length, 0);
  console.log(`    (the debt printed: ${Object.entries(B.shapes || {}).map(([s, l]) => `${s} ${l.length}`).join(' · ')}; ${debtN} rows)`);
  ok(fresh.length === 0, 'no NEW visible key shows an env variable, a CLI command, a --flag, a path, a setting key or an id outside a fold', fresh.slice(0, 12));
  ok(shrank.length === 0, 'every baseline row still holds (a row that was cured or folded is removed from scripts/fixtures/plain-words-baseline.json — the debt only shrinks)', shrank.slice(0, 12));
  // closure F25 / E: a debt sentence reused in ONE more place is red (its unfolded sites only fall), and the row count only falls
  const grew = Object.entries(B.sites || {}).filter(([k, n]) => occurrences(M.files, k).filter((o) => !o.fold).length > Math.max(n, (ALLOWED.sites[k] || {}).n || 0)).map(([k]) => k.slice(0, 80));
  ok(B.sites && !grew.length, 'no debt sentence gained a new unfolded site (debt is keyed by its places, not only its words)', grew);
  ok(debtN <= MAX_DEBT_ROWS, `the printed debt has at most ${MAX_DEBT_ROWS} rows (${debtN})`);
  const stale = [...Object.entries(ALLOWED.shapes).flatMap(([sh, o]) => Object.keys(o).filter((k) => !(M.hits[sh] || []).includes(k))), ...Object.entries(ALLOWED.sites).filter(([k, a]) => occurrences(M.files, k).filter((o) => !o.fold).length < a.n).map(([k]) => k), ...Object.entries(ALLOWED.doors).filter(([f, a]) => (M.doors[f] || 0) < a.n).map(([f]) => f), ...Object.keys(ALLOWED.wall).filter((k) => !M.wall.includes(k))];
  const whys = [...Object.values(ALLOWED.shapes).flatMap((o) => Object.values(o)), ...Object.values(ALLOWED.sites).map((a) => a.why), ...Object.values(ALLOWED.doors).map((a) => a.why), ...Object.values(ALLOWED.wall)];
  ok(!stale.length && whys.every((w) => typeof w === 'string' && w.length > 20), `every ALLOWED row is still met and names its reason (${whys.length} rows)`, stale);
}

console.log('② the wall: a settings description past ' + WALL_CHARS + ' characters has a `details:` fold, or is a printed debt row');
{
  const base = new Set(B.wall || []);
  const fresh = M.wall.filter((p) => !base.has(p) && !ALLOWED.wall[p]), shrank = [...base].filter((p) => !M.wall.includes(p));
  console.log(`    (the debt printed: ${base.size} rows)`);
  ok(fresh.length === 0, 'no NEW settings row puts a wall before its control', fresh);
  ok(shrank.length === 0, 'every wall row in the baseline is still a wall (a cured one leaves the baseline)', shrank);
  // settings-4 (the quota row's face) withdrawn on the restack onto 2.369.408: the row is usage-predict's as shipped (ALLOWED.wall)
}

console.log('③ the one door: a «Technical details» fold is built by src/lib/plain-words.js');
{
  const base = B.doors || {};
  const fresh = Object.entries(M.doors).filter(([f, n]) => n > Math.max(base[f] || 0, (ALLOWED.doors[f] || {}).n || 0)).map(([f, n]) => `${f}: ${n} > ${base[f] || 0}`);
  const shrank = Object.entries(base).filter(([f, n]) => (M.doors[f] || 0) < n).map(([f, n]) => `${f}: ${M.doors[f] || 0} < ${n}`);
  console.log(`    (the debt printed: ${Object.keys(base).length} files, ${Object.values(base).reduce((a, b) => a + b, 0)} hand-built folds)`);
  ok(fresh.length === 0, 'no NEW hand-built «Technical details» / data-fold="tech" outside plain-words.js (use techFold / techFoldHtml)', fresh);
  ok(shrank.length === 0, 'a file whose hand-built folds moved onto the door has its baseline count lowered (the debt only shrinks)', shrank);
  const pw = read('src/lib/plain-words.js');
  ok(/export function techFold\(/.test(pw) && /export function techFoldHtml\(/.test(pw) && /data-fold="tech"/.test(pw) && /d\.dataset\.fold = 'tech'/.test(pw) && /escHtml\(l\)/.test(pw) && /p\.textContent = l/.test(pw), 'the door: techFold (DOM, textContent) and techFoldHtml (string, every line escaped), both data-fold="tech"');
}

console.log('④ the carriers: a settings row\'s `details:` and a For-you item\'s `i18n.fold` draw through the door');
{
  ok(/techFold\(schema\.details, \{ summary: 'details' \}\)/.test(read('src/lib/settings-ui.js')), 'settings-ui draws a row\'s `details:` through techFold (summary «详情»)');
  ok(/techFoldHtml\(ctx\.foldOf \? ctx\.foldOf\(i\) : \[\]/.test(read('src/lib/user-todos-row.js')), 'the For-you row (and the chat card it draws) puts `i18n.fold` under techFoldHtml');
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plain-words-'));
  try {
    const m = new UserTodoManager({ dataDir: dir, now: () => 1_790_000_000_000 });
    m.add('s1', { origin: 'channels', text: 'x', i18n: { text: { key: 'A {n}', params: { n: 1 } }, detail: [{ key: 'face' }], fold: [{ key: 'how it works' }, { key: 'when it ends {d}', params: { d: 7 } }] } });
    const it = (m.snapshot().open || [])[0];
    ok(it && it.i18n && Array.isArray(it.i18n.fold) && it.i18n.fold.length === 2 && it.i18n.fold[1].params.d === 7, 'the store KEEPS `i18n.fold` (a real UserTodoManager round trip)', it && it.i18n);
    const L = await import(path.join(REPO, 'src/lib/user-todos-layout.js'));
    const said = (l) => l.key.replace(/\{(\w+)\}/g, (x, k) => (l.params && l.params[k] != null ? String(l.params[k]) : x));
    ok(JSON.stringify(L.itemRecordLinesOf(it, said)) === JSON.stringify(['face', 'how it works', 'when it ends 7']) && JSON.stringify(L.itemDetailLinesOf(it, said)) === JSON.stringify(['face']), 'the face is the detail; the RECORD (Copy) says the fold lines too');
    try { m.add('s1', { origin: 'channels', text: 'y', i18n: { text: { key: 'B' }, fold: 'not lines' } }); ok(false, 'CONTROL: a fold that is not an array of lines is refused'); } catch (e) { ok(/i18n\.fold must be an array/.test(e.message), 'CONTROL: a fold that is not an array of lines is refused by name', e.message); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const ca = read('src/server/channels-access.js');
  // closure A3 / F5 + closure 2 (B2): Deny's effect, the expiry AND the counts (only when non-zero) are in the detail every surface draws;
  // the wake ask has no fold (the For-you pane, the needs strip and the vault band draw only the detail)
  const det = ca.slice(ca.indexOf("{agent} asks to be woken by {where}"), ca.indexOf('source: INBOX_SOURCE', ca.indexOf("{agent} asks to be woken by {where}")));
  const detailPart = det.slice(det.indexOf('detail: ['), det.lastIndexOf('],') + 2);
  ok(/Deny changes nothing/.test(detailPart) && /Unanswered, it expires in \{n\} days/.test(detailPart) && /\.\.\.\(own \|\| waiting\.length \? \[\{ key: i18nKey\('It already has \{n\} notifications/.test(detailPart) && !/\bfold:/.test(det.replace(/\/\/[^\n]*/g, '')),
    'chat-cards-5: what Deny does, when the ask ends and its counts (only when non-zero) are in the detail every surface draws — no fold');
  // closure B3: the store's secret belt reaches the fold's params (an agent's or a job's item)
  const ut = read('src/user-todos.js');
  ok(/\.\.\.\(x\.fold \? \{ fold: x\.fold\.map\(line\) \} : \{\}\)/.test(ut.slice(ut.indexOf('function maskI18nParams'), ut.indexOf('function maskI18nParams') + 600)), 'the secret belt (maskI18nParams) masks the fold\'s params as it masks the detail\'s');
}

console.log('⑤ the base link colour: a link no surface styles reads in the theme\'s accent, never the browser\'s blue');
{
  const css = read('public/style.css');
  ok(/:where\(a\) \{ color: var\(--accent\); \}/.test(css) && /:where\(a\):hover \{ color: var\(--accent-hover\); \}/.test(css), 'style.css holds the zero-specificity base link rule, in theme variables');
}

console.log('⑥ controls: a planted instance of each rule is RED by name');
{
  const kr = M.keyRe;
  const planted = { env: 'Set VIBESPACE_FAKE_SWITCH to turn it on', cli: 'Run claude setup-token on that machine', flag: 'Start it with --no-sandbox', path: 'Edit data/fake/thing.json by hand', id: 'It is vault://store/key', 'setting-key': `Turn on ${settingKeys[0]} first` };
  for (const [sh, txt] of Object.entries(planted)) ok(shapesOf(txt, kr).includes(sh), `CONTROL ${sh}: «${txt}» is seen`, shapesOf(txt, kr));
  ok(shapesOf('Open the file you saved, then press Save.', kr).length === 0, 'CONTROL: a plain sentence shows no shape');
  const inside = "const f = techFold([t('Run claude setup-token there')], { mono: true });", outside = "el.textContent = t('Run claude setup-token there');";
  ok(inFold(inside, inside.indexOf('Run claude')) && !inFold(outside, outside.indexOf('Run claude')), 'CONTROL: the same key inside techFold( is folded, assigned to textContent is not');
  const nested = "schema = { description: t('x'), details: [t('Uses data/x/y.json'), t('more')], };";
  ok(inFold(nested, nested.indexOf('Uses data')) && !inFold(nested, nested.indexOf("t('x')")), 'CONTROL: a settings `details: [` array folds its lines, the description beside it does not');
  const planted2 = "const d = el('details'); d.dataset.fold = 'tech'; d.append(el('summary', null, t('Technical details')));";
  ok((planted2.match(DOOR_RE) || []).length === 2, 'CONTROL: a hand-built fold (dataset.fold + the summary) is counted by the door leg');
}

// ── pick 2 (M2a) + closure C1 / C2 / E: names, not ids — what the machine's activity says ──
// every op of src/device-acts.js's TABLE (and link-token) has its EXACT word in src/lib/device-acts-dialog.js ACT_WORDS (no prefix
// row, no family fallback), each with zh AND ja; an act / code op never reads as a read word; who asked is a name — over the
// hub's REAL subject shapes (agent:<backend>:<sid>, agent:webui:<id>) — and «gone» only when the sidebar has no such conversation
{
  console.log('names, not ids (the device activity, nameOrGone())');
  const DA = require(path.join(REPO, 'src/device-acts.js'));
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/device-acts-dialog.js'), 'utf8');
  const tbl = dlg.slice(dlg.indexOf('const ACT_WORDS = {'), dlg.indexOf('};', dlg.indexOf('const ACT_WORDS = {')) + 2);
  const words = Object.fromEntries([...tbl.matchAll(/'([a-z][\w:-]*)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const keys = [...Object.keys(DA.TABLE), 'link-token'];
  const unworded = keys.filter((op) => !words[op]);
  ok(!unworded.length, `every device op has its EXACT word (${keys.length} ops, ${new Set(Object.values(words)).size} words) — no prefix row stands in`, unworded);
  ok(!/ACT_WORDS\[o\.split\(':'\)\[0\]\]/.test(dlg) && /hasOwnProperty\.call\(ACT_WORDS, String\(op \|\| ''\)\)/.test(dlg), 'actWords looks an op up EXACTLY (no family fallback)');   // stale-pins: kept — the old family fallback must stay GONE
  let aw = null; try { aw = new Function('t', tbl + '\n' + dlg.slice(dlg.indexOf('export function actWords('), dlg.indexOf('\n}\n', dlg.indexOf('export function actWords(')) + 2).replace(/export /g, '') + '; return actWords;')((x) => x); } catch { aw = null; }
  const fams = [...new Set(Object.keys(words).filter((k) => k.includes(':')).map((k) => k.split(':')[0]))].filter((f) => words[f]);
  ok(!!aw && fams.length >= 1 && fams.every((f) => aw(f + ':no-such-action') === 'an act') && aw('desktop-grab') === 'Take a screenshot' && words['desktop-grab'] === 'Take a screenshot',
    `actWords (run): an unknown action of a family that has its own word is «an act», in any spelling of a fallback (${fams.join(', ')}); desktop-grab is «Take a screenshot» (closure 2)`);
  const READ = new Set(['Read files', 'Read system information', 'List its apps', 'Read its conversations', 'Read usage', 'Stream its screen']);
  const soft = Object.entries(DA.TABLE).filter(([op, layer]) => (layer === 'act' || layer === 'code') && READ.has(words[op]));
  ok(!soft.length, 'an act or a code op never reads as a read word (the owner\'s audit does not soften)', soft);
  const Z = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, J = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const unrowed = [...new Set(Object.values(words))].filter((w) => typeof Z[w] !== 'string' || typeof J[w] !== 'string');
  ok(!unrowed.length, 'every op word has its zh AND ja row', unrowed);
  // RED controls (the readers' mutants): a new act under a family's name, and an act turned into a read word
  const T2 = { ...DA.TABLE, 'desktop-serve:wipe-disk': 'act' }, W2 = { ...words, 'fs-op:rm': 'Read files' };
  ok(Object.keys(T2).some((op) => !words[op]) && Object.entries(DA.TABLE).some(([op, l]) => l === 'act' && READ.has(W2[op])), 'RED control: a new act op with no row, and fs-op:rm worded as a read, are both seen');
  // who asked, played over the real subject shapes (the functions are the dialog's own, sliced out of its source)
  const slice = (src, head) => { const a = src.indexOf(head); return src.slice(a, src.indexOf('\n};\n', a) > 0 && head.startsWith('export const') ? src.indexOf('\n};\n', a) + 3 : src.indexOf('\n}\n', a) + 2); };
  const code = [slice(dlg, 'export function agentSubjectOf('), slice(dlg, 'export const sessionNameIn =')].join('\n').replace(/export /g, '');
  let sessionNameIn = null; try { ({ sessionNameIn } = new Function(code + '; return { agentSubjectOf, sessionNameIn };')()); } catch { sessionNameIn = null; } // a tree without them is RED here, never a crash
  const side = [{ webuiId: 'w1', claudeSessionId: 'c-uuid-1', webuiName: 'Fix the build' }];
  const nameOf = sessionNameIn ? sessionNameIn(side, null) : () => '';
  ok(!!sessionNameIn && nameOf('claude:c-uuid-1') === 'Fix the build' && nameOf('webui:w1') === 'Fix the build' && nameOf('c-uuid-1') === 'Fix the build' && nameOf('claude:gone-9') === '' && nameOf('webui:c-uuid-1') === '',
    'who asked: agent:claude:<sid> and agent:webui:<id> are named; a session not in the sidebar is «gone»; a webui key never matches a backend id', [nameOf('claude:c-uuid-1'), nameOf('webui:w1')]);
  // nameOrGone: the name, else the kind's words — NEVER the id (sliced out of plain-words.js, t = the identity)
  const pw = fs.readFileSync(path.join(REPO, 'src/lib/plain-words.js'), 'utf8');
  let ng = null; try { ng = new Function('t', pw.slice(pw.indexOf('const GONE = {'), pw.indexOf('\n}\n', pw.indexOf('export function nameOrGone(')) + 2).replace(/export /g, '') + '; return nameOrGone;')((x) => x); } catch { ng = null; }
  ok(!!ng && ng('conversation', 'c-uuid-1', 'Fix the build') === 'Fix the build' && ng('conversation', 'c-uuid-1', 'c-uuid-1') === 'a conversation that is no longer listed' && ng('machine', 'host-dial-x', '') === 'a machine that is no longer listed' && !['c-uuid-1', 'host-dial-x'].includes(ng('job', 'c-uuid-1', '')),
    'nameOrGone: the name; a name equal to the id is no name; never the id');
  ok(/el\('span', 'device-acts-op', actWords\(r\.op\)\)/.test(dlg) && /whoText\(r\.by, nameOf\)/.test(dlg) && /\$\{r\.by \|\| t\('nobody named'\)\} · \$\{r\.op \|\| ''\}/.test(dlg), 'the row draws the op\'s word and who asked by name; the raw subject and op stay in the opened line');
}

// ── pick 3: a browser replay's steps in words — every traced action (src/browser-trace.js TRACED_ACTIONS) has a verb in
// src/lib/browser-replay-window.js ACTION_WORDS with zh and ja rows; the CLI's own line (timelineLabel) is the tooltip ──
{
  console.log('the replay steps in words');
  // closure C4: the REAL module's actions (computed keys included), not a regex over its text
  const acts = Object.keys(require(path.join(REPO, 'src/browser-trace.js')).TRACED_ACTIONS);
  const rw = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  const tbl = rw.slice(rw.indexOf('const ACTION_WORDS = {'), rw.indexOf('};', rw.indexOf('const ACTION_WORDS = {')));
  // a verb is t('…') or tc('replay', '…') — a word with another meaning elsewhere (Type, Forward) is said in its context
  const words = Object.fromEntries([...tbl.matchAll(/'?([a-z][a-z-]*)'?:\s*\(\)\s*=>\s*(?:t\('([^']+)'\)|tc\('([^']+)',\s*'([^']+)'\))/g)].map((m) => [m[1], m[2] || `${m[3]}::${m[4]}`]));
  const missing = acts.filter((a) => !words[a]);
  ok(acts.length >= 25 && !missing.length, `every traced action has a verb (${acts.length} actions, ${new Set(Object.values(words)).size} verbs)`, missing);
  const Z = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, J = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const unrowed = [...new Set(Object.values(words))].filter((w) => typeof Z[w] !== 'string' || typeof J[w] !== 'string');
  ok(!unrowed.length, 'every verb has its zh AND ja row', unrowed);
  ok(/el\('span', 'brp-action-label', actionWords\(e\)/.test(rw) && /\{ title: timelineLabel\(e\) \}/.test(rw), 'the step label is the words; the CLI\'s line is its tooltip');
}

// ── pick 5 (M4): a dialog's button says what it does — no showConfirmDialog / showInputDialog call leans on the default «OK».
// A call names `confirmText:`, or spreads a words object (`...words`) whose builder names it (each builder below pinned by
// its own source) ──
{
  console.log('the dialog buttons say what they do');
  const callsOf = (src) => { const out = []; const re = /show(?:Confirm|Input)Dialog\(/g; let m;
    while ((m = re.exec(src))) { let i = m.index + m[0].length, d = 1, q = null;
      for (; i < src.length && d > 0; i++) { const c = src[i]; if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === "'" || c === '"' || c === '`') q = c; else if ('({['.includes(c)) d++; else if (')}]'.includes(c)) d--; }
      out.push({ at: src.slice(0, m.index).split('\n').length, idx: m.index, call: src.slice(m.index, i) }); }
    return out; };
  const BUILDERS = { 'src/lib/browser-build-model.js': ['downloadConfirmWords', 'removeConfirmWords'], 'src/lib/browser-cli-model.js': ['cliConfirmWords'], 'src/lib/pool-priority-model.js': ['gatherConfirmWords'] };
  const files = execFileSync('git', ['-C', REPO, 'ls-files', 'src']).toString().split('\n').filter((f) => f.endsWith('.js') && !/i18n-|utils\.js$/.test(f));
  const bare = [];
  for (const f of files) { const src = fs.readFileSync(path.join(REPO, f), 'utf8'); if (!/show(?:Confirm|Input)Dialog\(/.test(src)) continue;
    for (const c of callsOf(src)) {
      if (/confirmText\s*:\s*(?:t\((?:i18nKey\()?'OK'\)?\)|'OK'|undefined|null|'')/.test(c.call)) { bare.push(`${f}:${c.at} (an explicit OK / empty word)`); continue; }
      const idw = (c.call.match(/confirmText\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/) || [])[1];
      // 主开发's ruling (closure 2): a parameter is a word only when its SIGNATURE gives a default word — `w = t('…')`; a bare parameter is not a definition
      // …and only INSIDE the call's own top-level declaration (a `const w =` elsewhere in the file is another w — P5-C2 survived the file-wide read)
      const own = src.slice(Math.max(0, ...[...src.slice(0, c.idx).matchAll(/\n(?=(?:export |async |function |const |let |var |class )\S)/g)].map((m) => m.index)), c.idx);
      if (idw && !new RegExp(`(?:const|let|var)\\s+${idw}\\s*=|[(,]\\s*${idw}\\s*=\\s*(?:t|tc)\\(`).test(own)) { bare.push(`${f}:${c.at} (confirmText is ${idw}: no word assigned in its own function, no default word in its signature)`); continue; }
      if (/confirmText\s*:/.test(c.call)) continue;
      const spread = (c.call.match(/\.\.\.\s*([\w$.]+)(\()?/) || []);
      if (!spread[1]) { bare.push(`${f}:${c.at}`); continue; }
      // closure E / F41: a spread is accepted only from a PINNED source — a builder of BUILDERS (called here, or held in a const
      // that one built), or the switcher's `.confirm` objects (each literal pinned below); a parameter or anything else is bare
      const name = spread[2] ? spread[1] : (src.match(new RegExp(`const ${spread[1].replace(/[.$]/g, '\\$&')} = ([\\w$]+)\\(`)) || [])[1];
      const CONFIRM_SPREADS = { 'src/lib/browser-switcher.js': 'browser-switcher-model.js', 'src/lib/browser-live-window.js': 'browser-human.js' }; // closure 2: a `.confirm` spread only where its builder is pinned below
      const pinned = Object.values(BUILDERS).flat().includes(name) || (/\.confirm$/.test(spread[1]) && !!CONFIRM_SPREADS[f]);
      if (!pinned) bare.push(`${f}:${c.at} (spreads ${spread[1]}, not a pinned builder)`);
    } }
  ok(!bare.length, 'every confirm / input dialog names its button (confirmText) — none falls back to «OK», none passes an explicit OK or an empty word, a spread only from a pinned builder', bare);
  const loose = [];
  for (const [f, names] of Object.entries(BUILDERS)) { const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    for (const n of names) { const i = src.indexOf(`export function ${n}(`); const body = i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); if (!/confirmText\s*:/.test(body)) loose.push(`${f} ${n}`); } }
  ok(!loose.length, `the spread words builders name their button (${Object.values(BUILDERS).flat().length})`, loose);
  // the switcher's `.confirm` objects: every `confirm: {` literal names its button
  const sw = fs.readFileSync(path.join(REPO, 'src/lib/browser-switcher-model.js'), 'utf8');
  const confs = [...sw.matchAll(/confirm: \{([^\n]*)/g)].map((m) => m[1]); // the literal runs to the line's end (its params have braces)
  ok(confs.length >= 1 && confs.every((c) => /confirmText\s*:/.test(c)), `every .confirm object of the switcher names its button (${confs.length})`, confs.filter((c) => !/confirmText/.test(c)).map((c) => c.slice(0, 80)));
  const hb = read('src/browser-human.js'); const hconfs = [...hb.matchAll(/\bconfirm(?:\s*=[^{\n]*|:\s*)\{([^\n]*)/g)].map((m) => m[1]); // `confirm: {` or `const confirm = n ? {` (closure 2: the old match found none, so a dropped word stayed green)
  ok(hconfs.length >= 1 && hconfs.every((c) => /confirmText\s*:/.test(c)), `every .confirm object of humanEndChoices names its button (${hconfs.length})`, hconfs.filter((c) => !/confirmText/.test(c)).map((c) => c.slice(0, 80)));
  ok(/confirmText\s*:\s*(?:t\((?:i18nKey\()?'OK'\)?\)|'OK'|undefined|null|'')/.test("showConfirmDialog({ title: t('X'), confirmText: t(i18nKey('OK')) })"), 'CONTROL: t(i18nKey(\'OK\')) is seen as an explicit OK');
  const planted = "showConfirmDialog({ title: t('Remove account'), message: msg })";   // stale-pins: kept — the old confirm, planted by this RED control
  ok(callsOf(planted).length === 1 && !/confirmText\s*:/.test(callsOf(planted)[0].call), 'CONTROL: a planted call without confirmText is seen as bare');
}

// ── closure B1: a press on a For-you row's «技术细节» opens THAT fold, never the row — the three click guards use ONE selector that
// names the door's fold, and a repaint keeps an open fold open. The press is played on a small element tree with the guard's own
// selector (a mutant that drops `[data-fold="tech"]` from it lets the press reach the row ⇒ red) ──
{
  console.log('a press on a row\'s fold opens the fold');
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-panel.js'), 'utf8'), row = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-row.js'), 'utf8');
  const pw = fs.readFileSync(path.join(REPO, 'src/lib/plain-words.js'), 'utf8');
  const sel = /const FOLD_PRESS = '\.ut-detail-exp, ' \+ TECH_FOLD_SELECTOR;/.test(panel) ? '.ut-detail-exp, ' + ((pw.match(/export const TECH_FOLD_SELECTOR = '([^']+)';/) || [])[1] || '') : '';
  ok((panel.match(/if \(e\.target\.closest\(FOLD_PRESS\)\) return;/g) || []).length === 3 && !/closest\('\.ut-detail-exp'\)\) return;/.test(panel), 'the tray, the phone home and the mini rows guard a press with FOLD_PRESS (no guard names the detail expander alone)');   // stale-pins: kept — the old press guard must stay GONE
  // the press, played: element trees and a closest() that reads the guard's selector list (class or [attr="v"])
  const el = (cls, attrs = {}, parent = null) => ({ cls: cls.split(' '), attrs, parent });
  const matches = (n, one) => { const a = one.match(/^\[([\w-]+)="([^"]*)"\]$/); return a ? n.attrs[a[1]] === a[2] : n.cls.includes(one.replace(/^\./, '')); };
  const closest = (n, list) => { for (let x = n; x; x = x.parent) if (list.split(',').map((q) => q.trim()).some((q) => matches(x, q))) return x; return null; };
  const item = el('ut-item ut-open'), body = el('ut-body', {}, item), fold = el('tech-fold ut-tech-fold', { 'data-fold': 'tech' }, body), summary = el('', {}, fold), text = el('ut-text', {}, body);
  ok(!!closest(summary, sel) && !closest(text, sel), 'a press on the fold\'s summary stops at the guard; a press on the row\'s words goes on to the row', sel);
  ok(!closest(summary, '.ut-detail-exp'), 'RED control: the old guard (the detail expander alone) lets a press on the door\'s fold reach the row');
  ok(/const techOpen = !!el\.querySelector\('\.ut-tech-fold\[open\]'\)/.test(row) && /if \(techOpen\) \{ const d = body\.querySelector\('\.ut-tech-fold'\); if \(d\) d\.open = true; \}/.test(row), 'a repaint keeps an open «技术细节» fold open (patchRow)');
}

// ── closure E / F24: a pin that bites for every rule picks 1, 3 and 4 add (each line red when its rule is undone in one place) ──
{
  console.log('the picks\' own rules, pinned');
  const pw = read('src/lib/plain-words.js');
  // the door escapes: techFoldHtml run with the real escaping (sliced; t = the identity)
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const body = pw.slice(pw.indexOf('const summaryOf ='), pw.indexOf('\n}\n', pw.indexOf('export function techFoldHtml(')) + 2).replace(/export /g, '');
  let tfh = () => ''; try { tfh = new Function('t', 'escHtml', 'document', body + '; return techFoldHtml;')((x) => x, esc, null); } catch { /* red below */ }
  const out = tfh(['<b>x</b>'], { summary: '<i>s</i>', className: 'a"b' });
  ok(/ data-fold="tech"/.test(out) && /d\.dataset\.fold = 'tech';/.test(pw) && /&lt;b&gt;x&lt;\/b&gt;/.test(out) && /&lt;i&gt;s&lt;\/i&gt;/.test(out) && !/<b>|<i>/.test(out) && /class="tech-fold a&quot;b"/.test(out), 'techFoldHtml escapes every line, its summary and its class (run, not read)', out.slice(0, 160));
  const su = read('src/lib/settings-ui.js'), tp = read('src/tls-plan.js'), css = read('public/style.css');
  ok(/if \(line\._fold\) line\.appendChild\(line\._fold\)/.test(su) && /summary: t\('Use your own certificate'\)/.test(su) && /const FOLDS = \{ noTailscale: \['ownCert'\] \}/.test(tp) && /\.settings-https-fact \.settings-https-fold, \.settings-https-fact \.settings-https-probe-fold \{ flex: 1 1 100%/.test(css) && /probeFold\.querySelector\('\.tech-fold-body'\)\.replaceChildren\(probe\)/.test(su) && /const probeFold = techFold\(\['…'\], \{ mono: true, className: 'settings-https-probe-fold' \}\)/.test(su)
    && /line\.append\(text, again, probeFold\);/.test(su) && !/line\.append\([^)]*\bprobe\)/.test(su) && /probe\.hidden = !p; probeFold\.hidden = !p;/.test(su) && /probe\.hidden = true; probeFold\.hidden = true;/.test(su),
    'settings-5: the own-certificate recipe folds INSIDE the fact line (a full-width line, its summary names the option), carried by tls-plan FOLDS; the raw last-check line sits ONLY in its fold (never appended on the face), the fold hidden with it (closure 2)');
  const pf = read('src/lib/path-field.js');
  ok(/if \(hk === 'none'\) return t\('the machine you pick above'\)/.test(pf) && /h2 === 'none' \? t\('On the machine you pick above:'\)/.test(pf) && /return HOSTS\.names \? nameOrGone\('machine', hk, ''\) : t\('the machine'\)/.test(pf), 'storage-3 / storage-4: a machine in words — never «none», never its id');
  const ud = read('src/lib/usage-dashboard.js');
  ok(/const labelOf = \(k\) => dimNames\.get\(k\)/.test(ud) && /labels: rows\.map\(\(r\) => String\(r\.label\)\)/.test(ud), 'usage-3: the split chart names its rows (labelOf), never a raw session id');
  const ma = read('src/lib/manage-agents.js');
  ok(/When it expires, sessions on it fail until you make a new one\./.test(ma) && /Quota refresh \(⟳\) does not work through it\./.test(ma) && /oat-face/.test(ma) && /\.oat-face \{ padding-left: \d+px; \}/.test(read('public/style.css')), 'agents-accounts-17: the token dialog\'s face keeps its two deciding facts, its bullets inside the dialog (closure 2: the reset zeroed the list\'s padding)');
  const dc = read('src/lib/design-canvas-model.js');
  ok(/if \(!file\) return text \? t\('\{what\} “\{text\}”', \{ what, text \}\) : what;/.test(dc) && /export function pickWords\(pick, t\)/.test(dc), 'design-doc-12: the element in words, no leading separator without a file; the exact line stays one fold away');
  const cc = read('public/chat.css');
  ok(/\.chat-design-page \{ display: flex; flex-wrap: wrap;/.test(cc) && /\.chat-design-page-name \{ flex: 1 1 10em; min-width: 10em;/.test(cc) && /t\('Private · make public'\)/.test(read('src/lib/chat-status-bar.js')), 'design-doc-2: the published row says the state, then the act — and wraps its buttons before the name collapses (closure 2: at 390 the name had 8 px, a published design 0)');
  const DET = { 'src/lib/settings-schema.js': 2, 'src/harness-settings-words.js': 2, 'src/channel-caps.js': 1, 'src/lib/app-card-model.js': 1 };   // 主开发 r4483: the harness words' second, claude.entryLabel's naming rule (a long rule folds — the face says what it changes and its risk)
  // the carriers whose `details: [` a surface draws (closure 2; the schema's third, the quota row's, withdrawn with settings-4 on the restack onto 2.369.408)
  const detNow = {}; for (const f of execFileSync('git', ['-C', REPO, 'ls-files', 'src']).toString().split('\n').filter((x) => x.endsWith('.js'))) { const n = (fs.readFileSync(path.join(REPO, f), 'utf8').match(/details: \[/g) || []).length; if (n) detNow[f] = n; }
  ok(JSON.stringify(detNow, Object.keys(detNow).sort()) === JSON.stringify(DET, Object.keys(DET).sort()), '`details: [` stands only on the carriers that draw it (a settings row, the harness and channel rows, an app card) — a new one is a decision, not a habit', detNow);
  ok(/title: cliMissingTitle\(cliMissingState\(msg \|\| \{\}\), w\.cli\)/.test(read('src/lib/cli-missing-dialog.js')), 'the CLI-missing dialog draws its title by the state (cliMissingTitle), never a hard-wired «was not found» (closure 2)');
  const ir = read('src/lib/incident-recorder.js');
  ok(/never text you typed/.test(ir), 'gear-and-system-16: the capture\'s reach — and that it never takes typed text — is on the face');
}

// ── closure 2 (5a–5e): pins that bite where the verifier's mutants survived ──
{
  console.log('closure 2: the surviving mutants, pinned');
  // the quota options' leg withdrawn with settings-4 (usage-predict's row as shipped — test-agy-wall-signal ⑨b pins its words)
  const Z = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, J = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const rw = read('src/lib/browser-replay-window.js');
  ok(/fill: \(\) => tc\('replay', 'Type'\), type: \(\) => tc\('replay', 'Type'\)/.test(rw) && /forward: \(\) => tc\('replay', 'Forward'\)/.test(rw) && Z['replay::Type'] === '输入' && Z['replay::Forward'] === '前进' && J['replay::Type'] === '入力' && J['replay::Forward'] === '進む',
    'replay verbs: fill / type / forward are said in their context (tc) — 输入 / 前进, never the noun «类型» or «转发»');
  const DC = await import(path.join(REPO, 'src/lib/design-canvas-model.js'));
  const tt = (x, p) => (p ? String(x).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : x);
  ok(typeof DC.pickWords === 'function' && DC.pickWords({ file: 'Main.html', tag: 'button', text: 'Go' }, tt) === 'Main › a button “Go”' && DC.pickWords({ tag: 'a', text: 'Home' }, tt) === 'a link “Home”' && DC.pickWords({ file: 'x/Main.html', tag: 'h2' }, tt) === 'Main › a heading',
    'design-doc-12: the face is the page and the element in words (run), no leading separator without a file');
  const dw = read('src/lib/design-window.js');
  ok(/face\.textContent = pickWords\(pick, t\); \/\/ the page/.test(dw) && /composer\.face\.textContent = pickWords\(pick, t\);/.test(dw) && !/face\.textContent = quoteLine\(/.test(dw),
    'design-doc-12: the window\'s face and the composer\'s face both draw pickWords — neither back to the raw quoteLine (closure 2: two surviving mutants)');
  ok(/\(\{ up: tc\('scroll', 'up'\), down: tc\('scroll', 'down'\), left: tc\('scroll', 'left'\), right: tc\('scroll', 'right'\) \}\)\[p\.direction\]/.test(rw) && !/`\$\{p\.direction/.test(rw) && ['up', 'down', 'left', 'right'].every((d) => Z['scroll::' + d] && J['scroll::' + d]),
    'replay: a scroll\'s direction is said in words (tc scroll::up…), never the raw value — zh / ja rows (closure 2)');
  // ONE word for one thing (主开发 01:15Z, «自动 turn»): a common English word the zh dictionary has its OWN word for never stays Latin
  // inside a zh value whose English key says it. The general form (any lowercase Latin word of the key inside its zh value) hits 231
  // words over 1665 rows — mostly the glossary's kept words («agent», «token»), protocols and program names — so it reads a LIST:
  // a word joins it with the dictionary's own word, and its rows are cured in the same commit.
  const MIXED = { turn: '回合' };
  const mixed = [];
  for (const [k, v] of Object.entries(Z)) {
    if (typeof v !== 'string') continue; const vv = v.replace(/\{[^}]*\}/g, '').replace(/`[^`]*`/g, '');
    for (const w of Object.keys(MIXED)) if (new RegExp(`\\b${w}s?\\b`, 'i').test(k) && new RegExp(`(?<![A-Za-z0-9_./-])${w}s?(?![A-Za-z0-9_./-])`, 'i').test(vv)) mixed.push(`${w}: ${k.slice(0, 70)}`);
  }
  ok(!mixed.length && Object.values(MIXED).every((zw) => Object.values(Z).filter((v) => typeof v === 'string' && v.includes(zw)).length >= 3),
    `zh keeps no common English word the dictionary has its own word for (${Object.entries(MIXED).map(([w, z]) => `${w} → ${z}`).join(', ')}) — one word for one thing`, mixed);
  const BD = ['src/lib/browser-build-model.js', 'src/server/browser-cli-install.js'].flatMap((f) => [...read(f).matchAll(/(?:\bt|\bi18nKey)\(\s*(['"])((?:(?!\1)[^\\]|\\.)+)\1/g)].map((m) => m[2].replace(/\\(['"])/g, '$1')));
  const bdBad = BD.filter((k) => /浏览器 CLI/.test(Z[k] || '') || /ブラウザー CLI/.test(J[k] || ''));
  ok(BD.length > 20 && !bdBad.length && Z['the browser driver'] === '浏览器驱动' && J['the browser driver'] === 'ブラウザ操作ツール' && !BD.some((k) => /浏览器驱动 /.test(Z[k] || '')),
    `the build dialog says ONE word for the browser driver in zh / ja (${BD.length} keys read) — never «浏览器 CLI» / «ブラウザー CLI» (closure 2)`, bdBad);
  // whoText never shows a subject id (run: sliced out of the dialog with the real nameOrGone and the hub's kinds)
  const dlg = read('src/lib/device-acts-dialog.js'), pw = read('src/lib/plain-words.js');
  let who = null;
  try {
    const ng = new Function('t', pw.slice(pw.indexOf('const GONE = {'), pw.indexOf('\n}\n', pw.indexOf('export function nameOrGone(')) + 2).replace(/export /g, '') + '; return nameOrGone;')((x) => x);
    const body = dlg.slice(dlg.indexOf('export function whoText('), dlg.indexOf('\n}\n', dlg.indexOf('export function whoText(')) + 2).replace(/export /g, '');
    const kindOf = (by) => { const k = String(by || '').split(':')[0]; return ['human', 'agent', 'job', 'system'].includes(k) ? k : null; };
    who = new Function('t', 'nameOrGone', 'kindOf', body + '; return whoText;')(tt, ng, kindOf);
  } catch { who = null; }
  const ids = ['agent:claude:c-uuid-77', 'agent:webui:w-77', 'job:j-77', 'system:hub-77', 'agent:unknown'];
  const named = (k) => (k === 'claude:c-uuid-77' || k === 'webui:w-77' ? 'Fix the login' : ''); // closure 2: a NAMED conversation, asked by the id the parser gives (backend:sid) — never the full key
  ok(!!who && ids.every((by) => !String(who(by, () => '')).includes(by.split(':').pop()) && !String(who(by, named)).includes(by.split(':').pop())) && who('agent:claude:c-uuid-77', named) === 'conversation “Fix the login”' && who('agent:unknown', () => '') === 'an agent VibeSpace could not identify' && who('human:local') === 'You',
    'whoText (run): never shows the subject\'s id — a named conversation is its name, a gone one, a job, VibeSpace, an unidentified agent are words', ids.map((by) => who && [who(by, () => ''), who(by, named)]));
  ok(/try \{ return sessionNameIn\(app\?\.sidebar\?\._allSessions \|\| \[\], app\?\.sidebar\?\.getCustomName \? \(x\) => app\.sidebar\.getCustomName\(x\) : null\)\(id\); \} catch \{ return ''; \}/.test(dlg) && /nameOrGone\('conversation', id, nameOf\(id\)\)/.test(dlg),
    'who asked: the dialog asks the sidebar through sessionNameIn (the parser of agent:<backend>:<sid> / agent:webui:<id>), whoText asks by that id (closure 2: two surviving mutants)');
  ok(!/\$\{\w+\} · \$\{id\}|\+ ' · ' \+ id\b/.test(dlg), 'the old «kind · id» literal is gone from the activity rows, in any spelling (the guard the closure had dropped, back)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
