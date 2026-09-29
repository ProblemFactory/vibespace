#!/usr/bin/env node
// THE PRINCIPAL PICKER (fast, PURE + source censuses; 2026-09-27, lane
// channel-polish — the owner: "如果 session 特别多的话，你现在的那个选择
// session/group 的 dropdown 交互会很不友好").
//
//   ① the model's tables over a 14-row fixture roster: the accent / case
//     fold, the FILTER (every token must match: name / folder / Task Group /
//     backend substring, or an id prefix; CJK by substring) and its RANK
//     (name prefix < word start < substring < Task Group < folder < backend
//     < id; ties keep the roster's order), the SECTIONS (Task Groups, then
//     sessions under their Task Group by title, then Other), RECENT pinning,
//     the recent list's arithmetic, the keyboard walk, a folder's tail, the
//     identity, the ONE initials implementation
//   ② the CENSUS: every former principal <select> / checkbox roster site now
//     calls the picker, and no `<select>` built from a principal roster is
//     left anywhere in src/lib — the pre-picker reach editor as the control
//   ③ patched-copy controls: a fold without NFKD, a grouping without its
//     sort, a filter that ORs its tokens — each turns its own leg red
// Run: node scripts/test-principal-picker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const PM = await import(pathToFileURL(path.join(REPO, 'src/lib/principal-picker-model.js')).href);
const AV = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-avatar.js')).href);

const agent = (id, name, { folder = '', backend = 'claude', g = [] } = {}) => ({ key: `agent:${id}`, kind: 'agent', id, name, folder, backend, live: true, groupIds: g.map((x) => x[0]), groupNames: g.map((x) => x[1]) });
const group = (id, name) => ({ key: `group:${id}`, kind: 'group', id, name, groupIds: [], groupNames: [] });
const OPS = ['t-ops', 'Ops triage'], FE = ['t-fe', 'Frontend'], BILL = ['t-bill', 'Billing'];
const ROSTER = [
  group('t-ops', 'Ops triage'), group('t-fe', 'Frontend'), group('t-bill', 'Billing'),
  agent('7f3a91c2', 'api lane', { folder: 'api', g: [OPS] }),
  agent('b0c1', 'API docs', { folder: 'docs', g: [FE] }),
  agent('c2d3', 'Élodie review', { folder: 'review', g: [FE] }),
  agent('d4e5', '部署助手', { folder: 'deploy', g: [OPS] }),
  agent('e6f7', 'Deploy bot', { folder: 'infra', backend: 'codex', g: [OPS] }),
  agent('f8a9', 'scratch', { folder: 'tmp' }),
  agent('a1b2', 'rapid prototype', { folder: 'proto' }),
  agent('c3d4', 'invoice sync', { folder: 'billing-sync', g: [BILL] }),
  agent('e5f6', 'report writer', { folder: 'reports', backend: 'codex', g: [BILL] }),
  agent('0a0b', 'ops pager', { folder: 'pager' }),
  agent('9c9d', 'notes', { folder: 'notes', backend: 'opencode' }),
];
const names = (rows) => rows.map((r) => r.name);

// ═══ ① the model ═══
console.log('① the model: fold, filter + rank, sections, recent, keyboard, tail, identity');
{
  ok(PM.foldText('Élodie ÅSA Crème') === 'elodie asa creme' && PM.foldText(null) === '', 'the fold: case- and accent-insensitive (NFKD, marks dropped)');
  const TABLE = [
    ['', names(ROSTER)],
    ['api', ['api lane', 'API docs', 'rapid prototype']],
    ['elo', ['Élodie review']],
    ['ÉLO', ['Élodie review']],
    ['部署', ['部署助手']],
    ['署助', ['部署助手']],
    ['fron', ['Frontend', 'API docs', 'Élodie review']],
    ['ops', ['Ops triage', 'ops pager', 'api lane', '部署助手', 'Deploy bot']],
    ['codex', ['Deploy bot', 'report writer']],
    ['7f3a', ['api lane']],
    ['api ops', ['api lane']],
    ['deploy', ['Deploy bot', '部署助手']],
    ['zzz', []],
  ];
  const bad = TABLE.map(([q, want]) => [q, want, names(PM.filterPrincipals(ROSTER, q))]).filter(([, want, got]) => J(want) !== J(got));
  ok(!bad.length, `the filter + rank table (${TABLE.length} queries: prefix < word start < substring < Task Group < folder < backend < id prefix; every token must match; CJK by substring; ties keep the roster's order)`, J(bad));
  const secs = PM.groupPrincipals(ROSTER);
  ok(J(secs.map((s) => [s.kind, s.title || null, names(s.rows)])) === J([
    ['groups', null, ['Ops triage', 'Frontend', 'Billing']],
    ['sessions-group', 'Billing', ['invoice sync', 'report writer']],
    ['sessions-group', 'Frontend', ['API docs', 'Élodie review']],
    ['sessions-group', 'Ops triage', ['api lane', '部署助手', 'Deploy bot']],
    ['sessions-other', null, ['scratch', 'rapid prototype', 'ops pager', 'notes']],
  ]), 'the SECTIONS: Task Groups, then each session under its Task Group (sorted by title), then Other', J(secs.map((s) => [s.kind, s.title, names(s.rows)])));
  ok(J(PM.groupPrincipals(PM.filterPrincipals(ROSTER, 'zzz'))) === '[]' && PM.groupPrincipals(PM.filterPrincipals(ROSTER, 'elo')).length === 1, 'an empty section is dropped');
  const rr = PM.rankRecent(ROSTER, ['agent:e6f7', 'group:t-fe', 'agent:gone']);
  ok(J(names(rr.recent)) === J(['Deploy bot', 'Frontend']) && rr.rest.length === ROSTER.length - 2 && rr.rest[0].name === 'Ops triage', 'RECENT: the recent keys that are in the list, newest first; the rest keeps its order; an unknown key is ignored', J(names(rr.recent)));
  let rec = [];
  for (const k of ['a', 'b', 'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i']) rec = PM.pushRecent(rec, k);
  ok(J(rec) === J(['i', 'h', 'g', 'f', 'e', 'd', 'b', 'c']) && rec.length === PM.RECENT_MAX, `the recent list: a pick moves to the front, no duplicates, ≤ ${PM.RECENT_MAX}`, J(rec));
  const K = ['a', 'b', 'c'];
  ok(PM.moveActive(K, null, 1) === 'a' && PM.moveActive(K, null, -1) === 'c' && PM.moveActive(K, 'a', -1) === 'a' && PM.moveActive(K, 'c', 1) === 'c' && PM.moveActive(K, 'b', 1) === 'c' && PM.moveActive(K, 'zz', 1) === 'a' && PM.moveActive([], null, 1) === null, 'the keyboard walk: none active ⇒ first / last, clamped at both ends, an unknown active ⇒ the first');
  // verify round 3: WHAT ENTER PICKS — the highlighted row wherever a patch left it; else the first row ONLY while it is
  // the one the person's own act put there (a roster patch that moved another row to the top disarms Enter)
  const ET = [
    [{ active: null, visibleKeys: ['a', 'b'], armedFirst: 'a' }, 'a'],        // the person typed and sees a first
    [{ active: null, visibleKeys: ['b', 'c'], armedFirst: 'a' }, null],       // a's session died, b moved up: nothing
    [{ active: null, visibleKeys: ['a', 'b'], armedFirst: null }, null],      // never armed (a highlight vanished)
    [{ active: 'b', visibleKeys: ['a', 'b'], armedFirst: 'a' }, 'b'],         // ↓ chose b
    [{ active: 'b', visibleKeys: ['b', 'c'], armedFirst: 'a' }, 'b'],         // b kept by KEY through a patch
    [{ active: 'b', visibleKeys: ['c'], armedFirst: 'c' }, 'c'],              // (the picker clears both when b vanishes; the pure rule alone reads the armed first)
    [{ active: 'b', visibleKeys: [], armedFirst: null }, null],
    [{}, null],
  ];
  const badET = ET.filter(([f, want]) => PM.enterTarget(f) !== want).map(([f, want]) => [f, want, PM.enterTarget(f)]);
  ok(!badET.length, `enterTarget: ${ET.length} rows — the highlighted row by key, else the armed first row while still first, else nothing`, J(badET));
  const PK = read('src/lib/principal-picker.js');
  ok(/const k = PM\.enterTarget\(\{ active, visibleKeys, armedFirst \}\);/.test(PK) && !/active \|\| visibleKeys\[0\]/.test(PK) && /if \(byPerson\) armedFirst = visibleKeys\[0\] \?\? null;\n\s*else if \(gone\) armedFirst = null;/.test(PK) && /refresh: \(\) => \{ rows = source\(\) \|\| \[\]; noteRows\(\); drawChips\(\); drawList\(\{ byPerson: false \}\); \}/.test(PK), 'PIN: Enter asks the PURE rule; the person\'s redraw arms the first row, a roster patch never does (and disarms when the highlight vanished)');
  // verify round 4: a refused Enter is SHOWN (the first row highlighted, picked by the next Enter through the highlighted-row
  // rule), and a redraw touches only the nodes that MOVED — `replaceChildren` detached every row and Chrome dropped the
  // click in flight on one (a trusted click across an `active-sessions` broadcast that changed nothing was lost)
  ok(/else if \(!k && !active && visibleKeys\.length\) \{[\s\S]{0,900}?active = visibleKeys\[0\];\n\s*drawList\(\{ byPerson: false \}\);/.test(PK), 'PIN: a refused Enter (nothing armed, nothing highlighted) highlights the first row and picks nothing — the next Enter takes the HIGHLIGHTED row by key');
  ok(!/\.replaceChildren\(/.test(PK) && /reconcile\(list, out\);/.test(PK) && /reconcile\(chips, out\);/.test(PK) && /for \(let i = 0; i < out\.length; i\+\+\) if \(kids\[i\] !== out\[i\]\) parent\.insertBefore\(out\[i\], kids\[i\] \|\| null\);/.test(PK), 'PIN: the list and the chips are reconciled in place (a node already at its place is never detached) — never replaceChildren');
  // verify round 5: a HELD Enter is one Enter — the OS auto-repeat (~30 Hz after its delay) toggled the first row of a
  // multi picker on and off per repeat (measured with trusted CDP `autoRepeat: true`: ∅ / picked / ∅ / picked …), the
  // final pick the parity of the hold; a repeat picks nothing, the highlight / arm rules are asked only by a new press
  ok(/\} else if \(e\.key === 'Enter'\) \{\n\s*e\.preventDefault\(\); e\.stopPropagation\(\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(e\.repeat\) return;/.test(PK), 'PIN (round 5): an Enter auto-repeat (`e.repeat`) is consumed and picks NOTHING — a held Enter is one Enter, never a 30 Hz toggle of the first row');
  ok(PM.folderTail('/home/a/work/api') === 'api' && PM.folderTail('/home/a/work/api/') === 'api' && PM.folderTail('box: /srv/x/') === 'box: x' && PM.folderTail('/') === '/' && PM.folderTail('') === '', 'a folder\'s tail (a host label kept)');
  ok(PM.identityOf(ROSTER[0]) === 'group:t-ops' && PM.identityOf(ROSTER[3]) === 'agent:7f3a91c2', 'the identity every dialog remembers a pick by (never a caller\'s own key)');
  ok(PM.initialsOf === AV.initialsOf && PM.initialsOf('Ops triage') === 'OT', 'ONE initials implementation (the avatar rule\'s, re-exported)');
}

// ═══ ② the census ═══
console.log('② the census: every principal pick is the picker; no <select> of a roster is left');
{
  const SITES = {
    'src/lib/channel-reach-editor.js': /principalPicker\(\{/,
    'src/lib/channel-filter-editor.js': /principalPicker\(\{/,
    'src/lib/channel-group-dialogs.js': /principalPicker\(\{/,
    'src/lib/window-share.js': /principalPicker\(\{/,
    'src/lib/exit-access-dialog.js': /principalPicker\(\{ items, app, multi: true/, // lane-pairing ⑥: "Who can use <machine>?" — two lists, each the ONE picker (multi)
  };
  for (const [f, re] of Object.entries(SITES)) ok(re.test(read(f)) && /from '\.\/principal-picker\.js'/.test(read(f)), `${f} picks its principals with the ONE picker`);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const ROSTER_WORDS = /\b(roster|principals?|choices|agents|sessions|_webuiSessions|_tasks|members)\b/;
  /** every `<select>` whose OPTIONS come from a roster of sessions / groups: a select variable filled by a
   *  loop over a roster, or `selectBox(<a roster>…)` */
  const judge = (src) => {
    const s = strip(src), hits = [];
    for (const m of s.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:el\('select'[^)]*\)|document\.createElement\('select'\))/g)) {
      const v = m[1], after = s.slice(m.index, m.index + 1500);
      for (const l of after.matchAll(/for \(const \w+ of ([^)]+)\)/g)) {
        const body = after.slice(l.index, l.index + 320);
        if (ROSTER_WORDS.test(l[1]) && new RegExp(`\\b${v}\\.appendChild\\(`).test(body)) { hits.push(`${v} ← ${l[1].trim()}`); break; }
      }
    }
    for (const m of s.matchAll(/selectBox\(([^\n]{0,160})/g)) if (ROSTER_WORDS.test(m[1].split(/\)\s*,/)[0])) hits.push('selectBox(' + m[1].slice(0, 60));
    return hits;
  };
  const files = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js'));
  const found = {};
  for (const f of files) { const h = judge(read(`src/lib/${f}`)); if (h.length) found[f] = h; }
  ok(!Object.keys(found).length, `no <select> built from a principal roster is left in src/lib (${files.length} files)`, J(found));
  let pre = null;
  try { pre = execFileSync('git', ['show', 'HEAD~1:src/lib/channel-reach-editor.js'], { cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { pre = null; }
  const planted = "const whoSel = el('select', 'chan-opt-input');\nfor (const p of roster) { const op = el('option', '', p.name); whoSel.appendChild(op); }\n";
  ok(judge(planted).length === 1, 'CONTROL: a planted `<select>` filled from `roster` IS flagged by the same judge');
  // lane-pairing ⑥: a <select> planted into the exit dialog (its rows are the picker's shape) is red
  const exitSrc = read('src/lib/exit-access-dialog.js');
  const plantedExit = exitSrc.replace("const pickerWrap = el('div', 'exit-access-picker');", "const pickerWrap = el('div', 'exit-access-picker');\n      const whoSel = el('select', 'exit-who');\n      for (const r of roster()) { const op = el('option', '', r.name); whoSel.appendChild(op); }");
  ok(plantedExit !== exitSrc && judge(plantedExit).length === 1 && judge(exitSrc).length === 0, 'CONTROL: a `<select>` planted into exit-access-dialog.js (filled from its roster) is flagged; the real dialog is clean');
  if (pre && /whoSel = el\('select'/.test(pre)) ok(judge(pre).length >= 1, 'CONTROL: the pre-picker reach editor (git HEAD~1) is flagged — the census has teeth on the real shape');
  else console.log('  … (the pre-picker reach editor is not reachable at HEAD~1 here — the planted control stands alone)');
}

// ═══ ③ patched-copy controls ═══
console.log('③ controls: a patched copy per rule turns its own leg red');
{
  const M = mutantCopies('principal-picker', REPO);
  const src = read('src/lib/principal-picker-model.js');
  const load = async (from, to, tag) => { if (!src.includes(from)) return null; return import(pathToFileURL(M.write('src/lib/principal-picker-model.js', src.replace(from, to), tag, { esm: true })).href); };
  const a = await load(".normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')", '', 'nofold');
  ok(!!a && names(a.filterPrincipals(ROSTER, 'elo')).length === 0, 'CONTROL (a): a fold without NFKD misses "Élodie" for "elo" — ① reddens');
  const b = await load('const tgs = [...byTg.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));', 'const tgs = [...byTg.values()];', 'nosort');
  ok(!!b && b.groupPrincipals(ROSTER)[1].title === 'Ops triage', 'CONTROL (b): a grouping without its sort puts "Ops triage" before "Billing" — ① reddens');
  const c = await load('for (const tok of toks) { const r = tokenRank(row, tok); if (r < 0) return; score += r; }', 'let any = false; for (const tok of toks) { const r = tokenRank(row, tok); if (r >= 0) { any = true; score += r; } } if (!any) return;', 'or');
  ok(!!c && names(c.filterPrincipals(ROSTER, 'api ops')).length > 1, 'CONTROL (c): a filter that ORs its tokens keeps more than "api lane" for "api ops" — ① reddens');
  // (d) verify round 3: Enter with the first-row fallback UNARMED (the pre-fix rule) — the row that moved up is picked
  const d = await load("  if (armedFirst != null && keys.length && keys[0] === String(armedFirst)) return keys[0];", '  if (keys.length) return keys[0];', 'unarmed');
  ok(!!d && d.enterTarget({ active: null, visibleKeys: ['b', 'c'], armedFirst: 'a' }) === 'b', 'CONTROL (d): without the arm, Enter after a roster patch picks the row that moved to the top — the person never saw it first (① reddens)');
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(x.pass, 'tree: ' + x.name, x.detail);
}

console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
