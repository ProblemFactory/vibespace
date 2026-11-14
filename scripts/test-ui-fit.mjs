#!/usr/bin/env node
// THE FIT LAWS AS THE TREE STATES THEM (lane ui-phone-and-fit — the owner's «走查一下所有界面», 108 findings; pick 1 = the
// rail, the check row and four one-rule majors). In-process, no browser: the drawn half is test-ui-fit-chrome. Every list is
// read off the tree (scripts/ui-fit-census.mjs), so a new rail door, a new check-row label or a new rule is counted at once.
//   ① THE RAIL'S PANELS: every door of PANEL_TABS (src/lib/sidebar-rail.js) names how its rows read at the sidebar's 260 px
//      and its 200 px floor — the rail row (railRow), the button-bar rule, or a stated reason; a door with no line is red
//   ② THE ROW AND THE BAR: the rail row and the button-bar rules as written; the Agents panel's bars wear the bar (its
//      status rows by selector — their class is the phone fold's census); NO rule cuts the words of a rail control
//      (text-overflow on a class a rail renderer gives a button — the base's «+ 添加 ChatGPT 账号…» drew «+ 添加 Ch…»)
//   ③ THE PORTS PANEL RENDERS ONCE (#9): a render builds aside and only the latest commits, whole (the base cleared, awaited,
//      appended — two renders drew the forwards, the scan and the input twice)
//   ④ THE TOUR STEPS ASIDE (#4): a guided window opened from the tour hides the tour while it is up and brings it back
//   ⑤ THE DISK NOTICE TAKES ITS OWN LINE (#3): the editor's bar wraps while «the file on disk changed» stands
//   ⑥ THE CHECK ROW (M6): the row rule comes after `.dialog-body label` at its weight; no class a check-row label wears
//      (70-odd labels the client builds around a checkbox or a radio) stacks the row (a column, centred text, a block)
// Each census has its RED control (a planted site / rule, or the base's shape) printed beside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientSources, checkLabelSites, stackingRules, railPanels } from './ui-fit-census.mjs';
import { cssRules, selectorList, lastCompound } from './lib/css-rules.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const CSS = Object.fromEntries(fs.readdirSync(path.join(repo, 'public')).filter((f) => f.endsWith('.css')).map((f) => [f, read('public/' + f)]));
const RULES = Object.entries(CSS).flatMap(([f, s]) => cssRules(s, f));
const STYLE = read('public/style.css');
const RAIL = read('src/lib/sidebar-rail.js'), PLUG = read('src/lib/plugins-ui.js'), JOBS = read('src/lib/jobs-panel.js'), AGENTS = read('src/lib/manage-agents.js'), ROW = read('src/lib/rail-row.js');

// ① THE RAIL'S PANELS — each door's line: how its rows read at 260 and at 200 (pictures: the lane's pick-1 folder)
const LEDGER = {
  plugins: { how: 'railRow', pin: () => /const row = railRow\(\{ className: 'plugin-row'/.test(PLUG) },
  jobs: { how: 'railRow + btn-bar', pin: () => /railRow\(\{ row: l1, lead: dot, main: \[name, st\]/.test(JOBS) && /bar\.className = 'jobs-rail-bar btn-bar'/.test(JOBS) && /bar\.className = 'jobs-toolbar btn-bar'/.test(JOBS) },
  agents: { how: 'btn-bar (heads, tabs, status rows by selector)', pin: () => (AGENTS.match(/head\.className = 'acct-roster-head btn-bar';/g) || []).length === 3 && /tabs\.className = 'agents-tabs btn-bar'/.test(AGENTS) && /head\.className = 'agents-overview-head btn-bar'/.test(AGENTS) },
  ports: { how: 'reason: a row is a mono port, its process and icon buttons — no worded control; drawn whole at 200', pin: () => /_renderPortsPanel\(c\)/.test(RAIL) },
  channels: { how: 'reason: its rows are the channels list (ellipsized names, a count) — no worded control in a row; drawn whole at 200', pin: () => /renderChannelsPanel\(this\.app, c\)/.test(RAIL) },
  system: { how: 'reason: charts and stat lines; its process rows are icon buttons — drawn at 200', pin: () => /_renderSystemPanel\(c\)/.test(RAIL) },
};
const tabs = railPanels(RAIL);
check(`① the rail's doors read off the tree: ${tabs.join(', ')} (PANEL_TABS)`, tabs.length >= 6, tabs);
for (const t of tabs) check(`① «${t}» names how its rows read at 260 and 200 — ${LEDGER[t] ? LEDGER[t].how : 'NO LINE'}`, !!LEDGER[t] && LEDGER[t].pin(), LEDGER[t] ? 'the pin of its line no longer holds' : 'a new rail door: give it the rail row, the bar, or a reason');
check('① CONTROL: a planted door (PANEL_TABS + «zz») has no line', !railPanels(RAIL.replace("'system']", "'system', 'zz']")).every((t) => LEDGER[t]));
for (const t of Object.keys(LEDGER)) check(`① the line «${t}» names a door that exists`, tabs.includes(t));

// ② THE ROW AND THE BAR
const rule = (sel) => RULES.find((r) => r.sel === sel);
const has = (sel, ...decl) => { const r = rule(sel); return !!r && decl.every((d) => r.body.replace(/\s+/g, ' ').includes(d)); };
check('② the rail row: a wrapping flex row; the name block keeps 9 em beside the controls, else the controls take the next line',
  has('.rail-row', 'display: flex', 'flex-wrap: wrap') && has('.rail-row > .rail-row-main', 'flex: 1 1 9em', 'min-width: 0') && has('.rail-row-name', 'overflow-wrap: break-word', 'word-break: normal'));
check('② …a control keeps its whole width and never cuts its words (text-overflow: clip; it wraps inside itself only when alone wider than the line)',
  has('.rail-row > .rail-row-ctl > *', 'flex: 0 0 auto', 'text-overflow: clip') && has('.rail-row > .rail-row-ctl', 'flex-wrap: wrap', 'margin-left: auto'));
check('② the rail row\'s main keeps its parts apart: a wrapping flex with a gap (a job\'s name and its state never run together — the reader\'s must-fix «dev-serverdown»), a block part on its own line',
  has('.rail-row > .rail-row-main', 'display: flex', 'flex-wrap: wrap', 'column-gap: 0.5em') && has('.rail-row > .rail-row-main > div', 'flex: 1 1 100%'));
check('② CONTROL: the shape the reader caught (the main a plain block — 419127b57) is red', !(() => { const r = cssRules('.rail-row > .rail-row-main { flex: 1 1 9em; min-width: 0; }').find((x) => x.sel === '.rail-row > .rail-row-main'); return !!r && /display: flex/.test(r.body) && /column-gap/.test(r.body); })());
check('② the button bar: words take 12 em, buttons wrap WHOLE to the next line — and the Agents panel\'s status rows wear it by selector',
  has('.btn-bar, .rail-panel .agent-actions', 'flex-wrap: wrap') && has('.btn-bar > .btn-bar-text', 'flex: 1 1 12em') && has('.btn-bar > :is(button, .btn-bar-group), .rail-panel .agent-actions > button', 'flex: 0 0 auto', 'white-space: nowrap'));
check('② the «⋯» of a rail row lists a folded GROUP as its buttons and a disabled control\'s press says why (its tip) — never a silent nothing (the reader\'s minor)',
  /const rows = rest\.flatMap\(\(c\) => \(c\.tagName === 'BUTTON' \? \[c\] : \[\.\.\.c\.querySelectorAll\('button'\)\]\)\);/.test(ROW) && /action: \(\) => \{ if \(c\.disabled\) showToast\(/.test(ROW) && !/rest\.map\(\(c\) => \(\{ label: wordsOf\(c\), action: \(\) => c\.click\(\) \}\)\)/.test(ROW));
check('② railRow folds more than ROW_INLINE_MAX controls into ONE «⋯» (the PURE rowActionsFold) whose rows are their own words',
  /import \{ rowActionsFold, ROW_INLINE_MAX \} from '\.\/row-fold-model\.js'/.test(ROW) && /rowActionsFold\(/.test(ROW) && /showContextMenu\(/.test(ROW) && /max = ROW_INLINE_MAX/.test(ROW));
// the census: the classes rail renderers give a BUTTON, and the rules that would cut its words
const RAIL_FILES = { 'src/lib/plugins-ui.js': PLUG, 'src/lib/jobs-panel.js': JOBS, 'src/lib/manage-agents.js': AGENTS, 'src/lib/sidebar-rail.js': RAIL, 'src/lib/rail-row.js': ROW };
const buttonClasses = (files) => {
  const out = new Set(); const add = (c) => String(c || '').split(/\s+/).forEach((x) => /^[a-z][\w-]+$/.test(x) && out.add(x));
  for (const s of Object.values(files)) {
    for (const m of s.matchAll(/(\w+)\s*=\s*document\.createElement\('button'\)/g)) add((new RegExp(`\\b${m[1]}\\.className\\s*=\\s*'([^']*)'`).exec(s.slice(m.index, m.index + 400)) || [])[1]);
    for (const m of s.matchAll(/\bmk\(\s*'button'\s*,\s*'([^']*)'/g)) add(m[1]);
    for (const m of s.matchAll(/<button[^>]*class="([^"$]*)/g)) add(m[1]);
  }
  for (const x of ['primary', 'danger']) out.delete(x);   // state classes, not controls of their own
  return out;
};
const cuts = (rules, cls) => rules.filter((r) => /text-overflow:\s*ellipsis/.test(r.body) && selectorList(r.sel).some((x) => [...lastCompound(x).matchAll(/\.([\w-]+)/g)].some((m) => cls.has(m[1]))));
const BTN = buttonClasses(RAIL_FILES);
const cutNow = cuts(RULES, BTN);
check(`② CENSUS: no rule cuts the words of a rail control (${BTN.size} button classes in the five rail renderers, every rule of public/*.css)`, BTN.size > 30 && cutNow.length === 0, cutNow.map((r) => `${r.file}: ${r.sel}`));
check('② CONTROL: the base\'s «.acct-roster-head .acct-add { … text-overflow: ellipsis }» is caught', cuts(cssRules('.acct-roster-head .acct-add { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'), BTN).length === 1);

// ③ THE PORTS PANEL RENDERS ONCE
const portsBody = (() => { const i = RAIL.indexOf('let renderGen = 0;'), end = 'c.replaceChildren(...box.childNodes);', j = RAIL.indexOf(end, i); return i > 0 && j > i ? RAIL.slice(i, j + end.length) : ''; })();
const rendersOnce = (b) => /const gen = \+\+renderGen;/.test(b) && (b.match(/if \(gen !== renderGen \|\| !c\.isConnected\) return;/g) || []).length >= 2
  && /const box = document\.createElement\('div'\)/.test(b) && /c\.replaceChildren\(\.\.\.box\.childNodes\)/.test(b) && !/\bc\.(appendChild|append)\(|c\.innerHTML = ''/.test(b.replace(/\bc\.replaceChildren[^\n]*/, ''));
check('③ the Ports panel: each render builds into its own box, a newer render drops the older one after each await, ONE replaceChildren commits', rendersOnce(portsBody), portsBody.slice(0, 300));
check('③ CONTROL: the base\'s shape (c.innerHTML = \'\' before the await, c.appendChild after) is caught', !rendersOnce("let renderGen = 0; const render = async () => { const gen = ++renderGen; if (gen !== renderGen || !c.isConnected) return; c.innerHTML = ''; await x(c); if (gen !== renderGen || !c.isConnected) return; c.appendChild(sec); };"));

// ④ THE TOUR STEPS ASIDE
const FLOWS = read('src/lib/setup-flows.js');
check('④ a guided window opened from the tour (#welcome.onboarding) hides the tour while its outcome pends and brings it back whatever ended it',
  /const welcome = own && document\.getElementById\('welcome'\);/.test(FLOWS) && /welcome\.classList\.add\('ob-yield'\);\s*outcome\.finally\(\(\) => welcome\.classList\.remove\('ob-yield'\)\);/.test(FLOWS)
  && has('#welcome.onboarding.ob-yield', 'visibility: hidden'));

// ⑤ THE DISK NOTICE TAKES ITS OWN LINE
const ED = read('src/lib/code-editor.js'), VW = CSS['viewers.css'];
const shows = (ED.match(/this\._diskChip\.style\.display = '';[^\n]*this\._toolbarEl\?\.classList\.add\('ce-disk-changed'\)/g) || []).length;
const hides = (ED.match(/this\._diskChip\.style\.display = 'none';[^\n]*this\._toolbarEl\?\.classList\.remove\('ce-disk-changed'\)/g) || []).length;
const allChip = (ED.match(/this\._diskChip\.style\.display = /g) || []).length;
check(`⑤ every show of the disk notice marks the bar and every hide unmarks it (${shows} + ${hides} of ${allChip})`, shows >= 1 && hides >= 2 && shows + hides === allChip);
check('⑤ the marked bar wraps and the notice takes a whole line, its words wrapping (never «● M» and nothing)',
  /\.editor-toolbar\.ce-disk-changed \{ flex-wrap: wrap;/.test(VW) && /\.editor-toolbar\.ce-disk-changed > \.editor-toolbar-left \{ flex: 1 1 100%; overflow: visible; \}/.test(VW) && /> \.media-btn \{ white-space: normal;/.test(VW));

// ⑥ THE CHECK ROW
const ROW_SEL = '.dialog-body label:where(:has(> input:is([type="checkbox"], [type="radio"])))';
const iBase = RULES.findIndex((r) => r.file === 'style.css' && r.sel === '.dialog-body label');
const iRow = RULES.findIndex((r) => r.file === 'style.css' && r.sel === ROW_SEL);
check('⑥ the check row: a label whose own child is a box is a grid row (box · words), at `.dialog-body label`\'s weight (:where) and AFTER it',
  iBase >= 0 && iRow > iBase && /display: grid/.test(RULES[iRow].body) && /grid-template-columns: auto minmax\(0, 1fr\)/.test(RULES[iRow].body) && /flex-direction: row/.test(RULES[iRow].body), { iBase, iRow });
const SITES = checkLabelSites(clientSources(repo));
const classes = [...new Set(SITES.flatMap((s) => s.classes))].filter((c) => !/^\d/.test(c));
const stacking = classes.flatMap((c) => stackingRules(RULES, c).map((r) => `${c} ← ${r.file}: ${r.sel}`));
check(`⑥ CENSUS: ${SITES.length} labels the client builds around a checkbox or a radio (${SITES.filter((s) => s.how === 'markup').length} in markup, ${SITES.filter((s) => s.how === 'dom').length} built), ${classes.length} classes — none stacks the row`, SITES.length >= 50 && classes.length >= 30 && !stacking.length, stacking);
const inlineStack = SITES.filter((s) => /flex-direction:\s*column|text-align:\s*center/.test(s.inline));
check('⑥ …and no such label stacks itself inline', !inlineStack.length, inlineStack.map((s) => `${s.file}:${s.line}`));
const planted = checkLabelSites({ 'src/lib/zz.js': "const lab = mk('label', 'zz-pick');\nconst cb = document.createElement('input'); cb.type = 'checkbox';\nlab.append(cb, words);\n" });
check('⑥ CONTROL: a planted label (zz-pick around a checkbox) is found, and a rule giving it a column is caught',
  planted.length === 1 && planted[0].classes[0] === 'zz-pick' && stackingRules(cssRules('.zz-pick { display: flex; flex-direction: column; }'), 'zz-pick').length === 1);
check('⑥ CONTROL: the row rule placed BEFORE `.dialog-body label` (it would lose to the column) is caught',
  (() => { const rs = cssRules(`${ROW_SEL} { display: grid; } .dialog-body label { display: flex; flex-direction: column; }`); return rs.findIndex((r) => r.sel === ROW_SEL) < rs.findIndex((r) => r.sel === '.dialog-body label'); })());
for (const [f, re] of [['src/lib/vault-paste-box.js', /mk\('label', 'ut-login-allow dialog-check-row'\)/g], ['src/lib/design-window.js', /mk\('label', 'design-publish-public dialog-check-row'\)/g], ['src/lib/file-explorer-ops.js', /<label class="dialog-check-row" style="margin-bottom:10px"><input type="checkbox" id="pp-public"/g]])
  check(`⑥ ${path.basename(f)}: its box-and-words label is the house check row (#10 / #39 / #49)`, (read(f).match(re) || []).length >= 1);
check('⑥ the webhook pick row (#1): its «why» sits under the words in the row\'s grid, never in the box\'s column', has('.chan-wh-why', 'grid-column: 2') && !/flex-basis: 100%/.test(rule('.chan-wh-why').body));

// ⑦ test-ui-fit-chrome's FIRST CLAIM (e4404e6d1) — each a pin, each with the shape it caught refused
const footOk = (src) => /foot\.className = 'btn-bar agents-foot';/.test(src) && /note\.className = 'agents-note btn-bar-text';/.test(src) && !/foot\.style\.cssText = 'display:flex;justify-content:space-between/.test(src);
check('⑦ the Agents panel\'s footer is a BUTTON BAR: the note takes its 12 em, «Re-check» keeps its words and wraps whole (it was squeezed to 48 px, one glyph a line)', footOk(AGENTS));
check('⑦ CONTROL: the inline flex footer (e4404e6d1\'s) is refused', !footOk(AGENTS.replace("foot.className = 'btn-bar agents-foot';", "foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';")));
const namesTipped = (src) => (src.match(/<span class="acct-key-name" title="\$\{escHtml\(a\.name\)\}">/g) || []).length === 3 && !/<span class="acct-key-name">\$\{escHtml\(a\.name\)\}<\/span>/.test(src);
check('⑦ an account\'s name cut to one line carries its WHOLE name as its tip (all three roster rows)', namesTipped(AGENTS));
check('⑦ CONTROL: a name without its tip is refused', !namesTipped(AGENTS.replace('<span class="acct-key-name" title="${escHtml(a.name)}">', '<span class="acct-key-name">')));
check('⑦ the System panel in the rail: a row\'s figure takes its own line under the name and wraps whole (it was cut to «已用 8…» at the 200 px floor)', has('.rail-panel .sys-mem-row > .sys-mem-sub', 'grid-column: 1 / -1', 'white-space: normal', 'text-overflow: clip') && has('.rail-panel .sys-mem-row', 'grid-template-columns: minmax(0, 1fr) auto'));
check('⑦ the System panel in the rail: a row\'s NAME wraps whole too (it was «usage ledger cold col…» past the 200 px floor, an ellipsis with no tip)', has('.rail-panel .sys-mem-row > .sys-mem-name', 'white-space: normal', 'overflow: visible', 'text-overflow: clip'));
check('⑦ the Jobs panel: a crontab or unit line breaks inside a path wider than the column (it ran past the 200 px floor)', has('.jobs-esc-line', 'overflow-wrap: anywhere'));
const LADDER_SRC = read('scripts/lib/fit-ladder.mjs');
check('⑦ the column facts: an ellipsis inside its OWN box whose tip holds the whole words is a preview, not a cut — one without the tip still is', /const tipped = cs\(el\)\.textOverflow === 'ellipsis' && el\.getBoundingClientRect\(\)\.right <= pr\.right \+ 1 && \[el, el\.parentElement, el\.parentElement\?\.parentElement\]\.some/.test(LADDER_SRC) && /if \(!tipped && Math\.max\(/.test(LADDER_SRC));

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
