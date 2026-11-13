#!/usr/bin/env node
// THE OWNER'S CASE, AS THE TREE STATES IT (lane ui-phone-and-fit pick 0 — the owner 2026-11-13, a ~500 px chat window: the strip
// drew «回复：保留 ag» and cut the rest, «这样我都看不到推荐回复选项…考虑不同窗口尺寸了吗？»; «…这个下面没法展开看详情，每次都要点击跳回对话位置
// 才能看»). In-process, no browser — the drawn half (every door at the nine widths) is test-foryou-fit-chrome.
//   ① THE OPTIONS LAW, read off every rule of public/*.css that styles an option (.ut-opt / .iw-opt) or an options row
//      (.ut-opts / .iw-opts): none cuts an option's words (an ellipsis, nowrap, a line clamp, a hidden overflow) and none makes
//      the options one sideways-scrolling line (flex-wrap: nowrap, overflow-x: auto); the strip's options take a line of their
//      own (flex 1 1 100%) and wrap. CONTROL: the base's rules, planted, are caught by name
//   ② «Reply:» SAID ONCE: the row (user-todos-row.js) and the For-you window (inbox-window.js) draw ONE label before the
//      options and each pill its own words — the whole reply its accessible name and tip (lane controls-that-lie)
//   ③ THE ROW OPENS IN PLACE (chat-needs-card.js): the question's press opens the strip's item (_dockFold) — never only the
//      landing; the landing is its own worded door (.cad-jump); the open strip floats over the chat on a spacer of its closed
//      height (_dockOver); the open item stays the strip's item while it waits (law 7); its detail is open (_dockDetail)
//   ④ THE WIDTH LADDER is ONE shared helper (scripts/lib/fit-ladder.mjs): the nine widths, the phone's, a verdict source that
//      evaluates, and the door suite uses it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cssRules, selectorList, lastCompound } from './lib/css-rules.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const RULES = fs.readdirSync(path.join(repo, 'public')).filter((f) => f.endsWith('.css')).flatMap((f) => cssRules(read('public/' + f), f));

// ① THE OPTIONS LAW over every rule
const OPT = /\.(ut-opt|iw-opt)(?![\w-])/, ROWS = /\.(ut-opts|iw-opts)(?![\w-])/;
const CUT = /text-overflow:\s*ellipsis|white-space:\s*nowrap|line-clamp:\s*\d|overflow(-x)?:\s*(hidden|clip)/;
const ONE_LINE = /flex-wrap:\s*nowrap|overflow-x:\s*(auto|scroll)/;
// a selector REACHES an option when its styled compound is an option, or a button / any element inside an options row
// (the reader's W2 planted `.cad-rows .ut-opts > button { nowrap; ellipsis }` past a last-compound-only census)
// a STATE or a pseudo-element is exempt only when the selector ENDS in it («.ut-opt:hover», «.ut-opt::before») — never a state
// inside it: «.ut-opt:not(:disabled)» is every live option (the .400 merged-tip read's hole a)
const reachesOpt = (x) => { const last = lastCompound(x); if (/(::?(before|after)|:hover|:focus(-visible|-within)?|:active|:disabled)$/.test(last)) return false; return OPT.test(last) || (ROWS.test(x.slice(0, x.length - last.length)) && /^(button|\*|\[|:|\.ut-opt|\.iw-opt)/.test(last)); };
const faults = (rules) => rules.flatMap((r) => {
  const sels = selectorList(r.sel).map(lastCompound);
  const out = [];
  if (selectorList(r.sel).some(reachesOpt) && CUT.test(r.body)) out.push(`${r.file}: ${r.sel} cuts an option (${(r.body.match(CUT) || [])[0]})`);
  if (sels.some((x) => ROWS.test(x)) && ONE_LINE.test(r.body)) out.push(`${r.file}: ${r.sel} makes the options one sideways line (${(r.body.match(ONE_LINE) || [])[0]})`);
  return out;
});
const styled = RULES.filter((r) => selectorList(r.sel).map(lastCompound).some((x) => OPT.test(x) || ROWS.test(x)));
const now = faults(RULES);
check(`① CENSUS: none of the ${styled.length} rules that style an option or an options row (public/*.css) cuts an option's words or makes them one sideways line`, styled.length >= 8 && now.length === 0, now);
const BASE = `.ut-opt { border: 1px solid var(--border); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iw-opt { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cad-rows .ut-body > .ut-opts { order: 6; flex: 1 1 0; min-width: 0; margin: 0; display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; scrollbar-width: thin; }
.cad-rows .ut-opt { flex: none; white-space: nowrap; max-width: 24em; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 768px) { :is(#user-todos-popup, #phone-home) .ut-item .ut-opt, .iw .iw-opt { white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; } }`;
const red = faults(cssRules(BASE, 'base'));
const w2 = faults(cssRules('.cad-rows .ut-opts > button { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }', 'planted'));
check(`① CONTROL (the reader's W2): an option cut through a descendant selector («.cad-rows .ut-opts > button») is caught — ${w2.length}`, w2.length === 1, w2);
// the reader's W1: a long unbroken word (a URL) breaks inside its pill — every base pill rule carries overflow-wrap
const pillRules = RULES.filter((r) => ['.ut-opt', '.iw-opt', '.cad-rows .ut-opt'].includes(r.sel));
check(`① every base pill rule (${pillRules.map((r) => r.sel).join(' · ')}) breaks a long unbroken word inside the pill (overflow-wrap) — the reader's W1`, pillRules.length === 3 && pillRules.every((r) => /overflow-wrap:\s*(break-word|anywhere)/.test(r.body)));
check(`① CONTROL: the release's five rules (the owner's case), planted, are caught — ${red.length} faults`, red.length === 5, red);
const notDis = faults(cssRules('.ut-opt:not(:disabled) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }', 'planted'));
check(`① CONTROL (the .400 merged-tip read's hole a): a cut through a state INSIDE the selector («.ut-opt:not(:disabled)» — every live option) is caught — ${notDis.length}`, notDis.length === 1, notDis);
// the base options rows WRAP (the .400 merged-tip read's hole b: dropping the wrap from the base rule passed every fast suite) —
// the tray / mini inbox / phone sheet / card draw their options in .ut-opts, the For-you window in .iw-opts
const baseRow = (sel) => RULES.find((r) => r.file === 'style.css' && r.sel === sel);
const wraps = (r) => !!r && /display:\s*flex/.test(r.body) && /flex-wrap:\s*wrap/.test(r.body);
check('① the base options rows (.ut-opts — the tray, the mini inbox, the phone sheet, the card; .iw-opts — the For-you window) are flex rows that WRAP', wraps(baseRow('.ut-opts')) && wraps(baseRow('.iw-opts')), [baseRow('.ut-opts')?.body, baseRow('.iw-opts')?.body]);
const unwrapped = { file: 'style.css', sel: '.ut-opts', body: (baseRow('.ut-opts')?.body || '').replace(/flex-wrap:\s*wrap;?\s*/, '') };
check('① CONTROL: the base .ut-opts with its wrap dropped is refused by that leg', !wraps(unwrapped) && unwrapped.body !== baseRow('.ut-opts')?.body);
const CC = read('public/chat.css');
check('① the strip\'s options: a line of their own (flex 1 1 100%) that WRAPS, its pills wrapping inside themselves; the question two lines before its cut when options stand',
  /\.cad-rows \.ut-body > \.ut-opts \{ order: 6; flex: 1 1 100%;[^}]*flex-wrap: wrap;[^}]*overflow: visible; \}/.test(CC) && /\.cad-rows \.ut-opt \{[^}]*white-space: normal;[^}]*overflow-wrap: break-word;/.test(CC)
  && /\.cad-rows \.ut-body:has\(> \.ut-opts\) > \.ut-text \{[^}]*-webkit-line-clamp: 2;/.test(CC));

// ② «Reply:» said once
const ROW = read('src/lib/user-todos-row.js'), IW = read('src/lib/inbox-window.js');
check('② the row: ONE «Reply:» label before its options; each pill its own words, its accessible name and tip the whole reply',
  /<div class="ut-opts"><span class="ut-opts-label">\$\{escHtml\(t\('Reply:'\)\)\}<\/span>\$\{optList\.map\(\(o, k\) => `<button type="button" class="ut-opt" data-idx="\$\{k\}" aria-label="\$\{escHtml\(optionWords\(o, t\)\)\}" title="\$\{escHtml\(optionWords\(o, t\)\)\}">\$\{escHtml\(String\(o\)\)\}<\/button>`\)/.test(ROW));
check('② the For-you window: the same — one label, each pill its words, named by the whole reply',
  /c\.opts\.replaceChildren\(mk\('span', 'iw-opts-label', t\('Reply:'\)\), \.\.\.v\.options\.map\(\(o\) => \{ const b = mk\('button', 'iw-opt', String\(o\.label\)\);[^\n]*setAttribute\('aria-label', optionWords\(o\.label, t\)\); b\.title = optionWords\(o\.label, t\);/.test(IW));
for (const lang of ['zh', 'ja']) check(`② the label «Reply:» has its ${lang} words`, new RegExp(`"Reply:": "[^"]+"`).test(read(`src/lib/i18n-${lang}.js`)));

// ③ the row opens in place
const NC = read('src/lib/chat-needs-card.js');
check('③ the question\'s press OPENS the strip\'s item in place (and closes it) — an item whose answer is its own door keeps its tap; the meta still lands',
  /const openIt = \(ev, q\) => \{[\s\S]{0,500}?this\._dockFold\(dock, !dock\.classList\.contains\('cad-open'\)\);/.test(NC) && /if \(q && q\.classList\.contains\('ut-text'\) && openIt\(ev, q\)\) return;\s*if \(q\) landIt\(ev, q\);/.test(NC) && /if \(!openIt\(ev, q\)\) landIt\(ev, q\);/.test(NC));
check('③ the landing is a door of its own, in words («Show it in the conversation»)', /jump\.className = 'cad-jump'; jump\.textContent = t\('Show it in the conversation'\);/.test(NC) && /if \(ev\.target\.closest\('\.cad-jump'\)\) \{ const it = this\._dockItem; if \(it\) \{ ev\.preventDefault\(\); this\.land\(it\.id\)/.test(NC));
check('③ the open strip floats over the chat on a spacer of its closed height (the transcript\'s size and scroll unchanged), at most half the view — its place read again when the view or the message box resizes',
  /_dockOver\(dock, on\) \{[\s\S]{0,900}?sp\.style\.height = h \+ 'px';[\s\S]{0,200}?dock\.before\(sp\);[\s\S]{0,900}?'--cad-max', Math\.max\(120, Math\.floor\(host\.clientHeight \* 0\.5\)\)/.test(NC)
  && /dock\.classList\.add\('cad-over'\);\s*place\(\);/.test(NC) /* out of the flow first, then measured (the claim's ㉓ r2) */
  && /const ro = dock\._cadRO = new ResizeObserver\(place\);\s*ro\.observe\(host\);\s*for \(let n = dock\.nextElementSibling; n; n = n\.nextElementSibling\) ro\.observe\(n\);/.test(NC) && /dock\._cadRO\?\.disconnect\(\); dock\._cadRO = null;/.test(NC)
  && /\.chat-attn-dock\.cad-over \{ position: absolute;[^}]*bottom: var\(--cad-bottom, 0px\); max-height: var\(--cad-max, 50%\); overflow-y: auto;/.test(CC));
check('③ law 7: the open item stays the strip\'s item while it waits (a newer arrival redraws around it); its detail is open',
  /const openKeep = dock\.classList\?\.contains\('cad-open'\) && this\._dockOpenId \? list\.find\(\(e\) => e\.item\.id === this\._dockOpenId\) : null;\s*if \(openKeep && entry && entry\.item\.id !== openKeep\.item\.id\) entry = \{ item: openKeep\.item \};/.test(NC) && /_dockDetail\(dock\) \{[^}]*if \(ex && !ex\.open\) ex\.open = true;/.test(NC)
  && /\.chat-attn-dock\.cad-open \.cad-rows \.ut-item > \.ut-body > \.ut-detail-exp \{ display: block !important;/.test(CC));

// ③c the reader's list: the CLOSED strip is bounded (its options wrap now — never more than half the view, it scrolls inside);
// the OPENED strip stands above the ↓ (z 10) and the minimap (z 15); Esc closes it
const dockRule = RULES.find((r) => r.file === 'chat.css' && r.sel === '.chat-attn-dock');
check('③c the closed strip never takes more than half the view (max-height 50 %, it scrolls inside) — the reader\'s moderate 3', !!dockRule && /max-height: 50%; overflow-y: auto;/.test(dockRule.body));
const zOf = (sel) => { const r = RULES.find((x) => x.file === 'chat.css' && x.sel === sel); const m = r && /z-index:\s*(\d+)/.exec(r.body); return m ? Number(m[1]) : null; };
const zOver = zOf('.chat-attn-dock.cad-over'), zMini = zOf('.chat-minimap'), zDown = zOf('.chat-scroll-btn-wrap');
check(`③c the opened strip (z ${zOver}) stands above the minimap (z ${zMini}) and the ↓ (z ${zDown}) — the reader's moderate 4`, zOver != null && zMini != null && zOver > zMini && (zDown == null || zOver > zDown), { zOver, zMini, zDown });
check('③c Esc on the opened strip closes it (the float\'s own key) — the reader\'s minor', /if \(ev\.key === 'Escape' && dock\.classList\.contains\('cad-open'\) && !imeOwnsKey\(ev\)\) \{ ev\.preventDefault\(\); ev\.stopPropagation\(\); this\._dockFold\(dock, false\); return; \}/.test(NC));
// ③d THE MEASURE ORDER and THE OPEN STATE, exclusive (the reader's M1 / M2 / S1 / S2 / S3 planted around the earlier regexes):
// the strip's closed height is read BEFORE any class leaves it, the place AFTER it left the flow and never in it, the open item
// is never re-replaced by the newest, a close always runs the full _dockOver(off) (spacer gone), the detail opened at both calls
const overBody = (() => { const i = NC.indexOf('  _dockOver(dock, on) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const foldBody = (() => { const i = NC.indexOf('  _dockFold(dock, open) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const passBody = (() => { const i = NC.indexOf('  _dockPass(waiting) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const measured = (b, f) => { const h = b.indexOf('const host = dock.parentElement, h = dock.offsetHeight;'), add = b.indexOf("dock.classList.add('cad-over');"), place = b.indexOf('    place();'), sp = b.indexOf('dock.before(sp);');
  return h > 0 && add > h && sp > h && add > sp && place > add && !/classList\.remove\('cad-over'\)/.test(b.slice(b.indexOf('if (!on)') + 10 + b.slice(b.indexOf('if (!on)')).indexOf('\n'))) && f.indexOf('this._dockOver(dock, true)') < f.indexOf("dock.classList.toggle('cad-open', open)") && !/classList\.add\('cad-(over|open)'\)/.test(f.slice(0, f.indexOf('this._dockOver(dock, true)'))); };
check('③d the closed height is read before the strip leaves the flow, the place after it left and never inside it (the lost tap; the reader\'s M1 / M2)', measured(overBody, foldBody));
const keeps = (p) => /if \(openKeep && entry && entry\.item\.id !== openKeep\.item\.id\) entry = \{ item: openKeep\.item \};\n/.test(p) && !/entry = d \? \{ item: d\.newest \} : entry/.test(p);
check('③d the open item is never replaced by the newest after law 7 kept it (the reader\'s S1)', keeps(passBody));
check('③d a close always runs the whole _dockOver(off) — the spacer and the observer gone (the reader\'s S2)', foldBody.includes('if (!open && was) this._dockOver(dock, false);') && /if \(!on\) \{ dock\.classList\.remove\('cad-over'\); dock\._cadRO\?\.disconnect\(\); dock\._cadRO = null; dock\._cadSpacer\?\.remove\(\);/.test(overBody));
check('③d the detail is opened at the open AND at every pass while open (the reader\'s S3)', foldBody.includes('if (open) this._dockDetail(dock);') && passBody.includes("if (row && dock.classList?.contains('cad-open')) this._dockDetail(dock);"));
// RED CONTROLS: the reader's mutants, planted in a copy of the source, each turn its leg red
const M = {
  M1: (x) => x.replace('    const host = dock.parentElement, h = dock.offsetHeight;', "    dock.classList.add('cad-over'); dock.classList.add('cad-open');\n    const host = dock.parentElement, h = dock.offsetHeight;"),
  M2: (x) => x.replace("    dock.classList.add('cad-over');\n    place();", "    dock.classList.remove('cad-over'); place();\n    dock.classList.add('cad-over');\n    place();"),
  S1: (x) => x.replace('if (openKeep && entry && entry.item.id !== openKeep.item.id) entry = { item: openKeep.item };', 'if (openKeep && entry && entry.item.id !== openKeep.item.id) entry = { item: openKeep.item }; entry = d ? { item: d.newest } : entry;'),
  S2: (x) => x.replace('if (!open && was) this._dockOver(dock, false);', "if (!open && was) dock.classList.remove('cad-over');"),
  S3: (x) => x.replace('    if (open) this._dockDetail(dock);\n', ''),
};
const bodyOf = (x, head) => { const i = x.indexOf(head), j = x.indexOf('\n  }\n', i); return i > 0 ? x.slice(i, j) : ''; };
const judge = { M1: (x) => measured(bodyOf(x, '  _dockOver(dock, on) {'), bodyOf(x, '  _dockFold(dock, open) {')), M2: (x) => measured(bodyOf(x, '  _dockOver(dock, on) {'), bodyOf(x, '  _dockFold(dock, open) {')), S1: (x) => keeps(bodyOf(x, '  _dockPass(waiting) {')), S2: (x) => bodyOf(x, '  _dockFold(dock, open) {').includes('if (!open && was) this._dockOver(dock, false);'), S3: (x) => bodyOf(x, '  _dockFold(dock, open) {').includes('if (open) this._dockDetail(dock);') };
const caught = Object.entries(M).filter(([k, f]) => { const m = f(NC); return m !== NC && !judge[k](m); }).map(([k]) => k);
check(`③d CONTROL: the reader's five behaviour mutants, planted in a copy, each turn its leg red (${caught.join(' ')})`, caught.length === 5, caught);

// ③b ONE ORDER wherever an item opens (主开发 13:34Z — the owner: «这样我都看不到推荐回复选项»): the question, its OPTIONS, then the detail
check('③b ONE ORDER: the row (the tray, the mini inbox, the phone sheet, the strip, the card) draws its options BEFORE its detail fold',
  ROW.includes("${opts}${card ? '' : detailFold}<div class=\"ut-meta\">") && !ROW.includes('detailFold}${opts}'));
check('③b …the For-you window\'s pane: the options before the detail', /el\.append\(head, title, dl, arts, opts, detail, cutLine, replied, reach, reply, actions\);/.test(IW));
check('③b …the opened strip: the options (order 6) before the detail (order 7), which scrolls below them',
  /\.chat-attn-dock\.cad-open \.cad-rows \.ut-item > \.ut-body > \.ut-detail-exp \{ display: block !important; order: 7;/.test(CC) && /\.cad-rows \.ut-body > \.ut-opts \{ order: 6;/.test(CC));

// ④ the ladder
const L = await import(pathToFileURL(path.join(repo, 'scripts/lib/fit-ladder.mjs')).href);
let evaluates = false; try { new Function(L.fitVerdictSource('.x', { row: '.y', words: '.ut-opt' })); evaluates = true; } catch { }
check(`④ THE WIDTH LADDER is one helper: ${L.LADDER.join(' / ')} (the phone's ${L.PHONE_LADDER.join(' / ')}), its verdict source evaluates`, JSON.stringify(L.LADDER) === JSON.stringify([280, 320, 360, 420, 500, 640, 800, 1100, 1440]) && L.PHONE_LADDER.every((w) => w <= 768) && evaluates);
check('④ …and the door suite measures with it (test-foryou-fit-chrome imports runLadder / fitVerdictSource)', /from '\.\/lib\/fit-ladder\.mjs'/.test(read('scripts/test-foryou-fit-chrome.mjs')) && /runLadder\(\{/.test(read('scripts/test-foryou-fit-chrome.mjs')));

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
