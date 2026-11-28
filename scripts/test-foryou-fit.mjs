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
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cssRules, selectorList, lastCompound } from './lib/css-rules.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
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
check(`① every base pill rule (${pillRules.map((r) => r.sel).join(' · ')}) breaks a long unbroken word inside the pill (overflow-wrap) — the reader's W1`, pillRules.length === 3 && verdictOf(pillRules.every((r) => /overflow-wrap:\s*(break-word|anywhere)/.test(r.body))));
check(`① CONTROL: the release's five rules (the owner's case), planted, are caught — ${red.length} faults`, red.length === 5, red);
const notDis = faults(cssRules('.ut-opt:not(:disabled) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }', 'planted'));
check(`① CONTROL (the .400 merged-tip read's hole a): a cut through a state INSIDE the selector («.ut-opt:not(:disabled)» — every live option) is caught — ${notDis.length}`, notDis.length === 1, notDis);
// the base options rows WRAP (the .400 merged-tip read's hole b: dropping the wrap from the base rule passed every fast suite) —
// the tray / mini inbox / phone sheet / card draw their options in .ut-opts, the For-you window in .iw-opts
const baseRow = (sel) => RULES.find((r) => r.file === 'style.css' && r.sel === sel);
const wraps = (r) => !!r && /display:\s*flex/.test(r.body) && /flex-wrap:\s*wrap/.test(r.body);
check('① the base options rows (.ut-opts — the tray, the mini inbox, the phone sheet, the card; .iw-opts — the For-you window) are flex rows that WRAP', gateOf(wraps(baseRow('.ut-opts'))) && verdictOf(wraps(baseRow('.iw-opts'))), [baseRow('.ut-opts')?.body, baseRow('.iw-opts')?.body]);
const unwrapped = { file: 'style.css', sel: '.ut-opts', body: (baseRow('.ut-opts')?.body || '').replace(/flex-wrap:\s*wrap;?\s*/, '') };
check('① CONTROL: the base .ut-opts with its wrap dropped is refused by that leg', !wraps(unwrapped) && unwrapped.body !== baseRow('.ut-opts')?.body);
const CC = read('public/chat.css');
check('① the strip\'s options: a line of their own (flex 1 1 100%) that WRAPS, its pills wrapping inside themselves; the question two lines before its cut when options stand',
  gateOf(/\.cad-rows \.ut-body > \.ut-opts \{ order: 6; flex: 1 1 100%;[^}]*flex-wrap: wrap;[^}]*overflow: visible; \}/.test(CC)) && gateOf(/\.cad-rows \.ut-opt \{[^}]*white-space: normal;[^}]*overflow-wrap: break-word;/.test(CC))
  && verdictOf(/\.cad-rows \.ut-body:has\(> \.ut-opts\) > \.ut-text \{[^}]*-webkit-line-clamp: 2;/.test(CC)));

// ② «Reply:» said once
const ROW = read('src/lib/user-todos-row.js'), IW = read('src/lib/inbox-window.js');
check('② the row: ONE «Reply:» label before its options; each pill its own words, its accessible name and tip the whole reply',
  verdictOf(/<div class="ut-opts"><span class="ut-opts-label">\$\{escHtml\(t\('Reply:'\)\)\}<\/span>\$\{optList\.map\(\(o, k\) => `<button type="button" class="ut-opt" data-idx="\$\{k\}" aria-label="\$\{escHtml\(optionWords\(o, t\)\)\}" title="\$\{escHtml\(optionWords\(o, t\)\)\}">\$\{escHtml\(String\(o\)\)\}<\/button>`\)/.test(ROW)));
check('② the For-you window: the same — one label, each pill its words, named by the whole reply',
  verdictOf(/c\.opts\.replaceChildren\(mk\('span', 'iw-opts-label', t\('Reply:'\)\), \.\.\.v\.options\.map\(\(o\) => \{ const b = mk\('button', 'iw-opt', String\(o\.label\)\);[^\n]*setAttribute\('aria-label', optionWords\(o\.label, t\)\); b\.title = optionWords\(o\.label, t\);/.test(IW)));
for (const lang of ['zh', 'ja']) check(`② the label «Reply:» has its ${lang} words`, verdictOf(new RegExp(`"Reply:": "[^"]+"`).test(read(`src/lib/i18n-${lang}.js`))));

// ③ the row opens in place
const NC = read('src/lib/chat-needs-card.js');
check('③ the question\'s press OPENS the strip\'s item in place (and closes it) — an item whose answer is its own door keeps its tap; the meta still lands',
  gateOf(/const openIt = \(ev, q\) => \{[\s\S]{0,500}?this\._dockFold\(dock, !dock\.classList\.contains\('cad-open'\)\);/.test(NC)) && gateOf(/if \(q && q\.classList\.contains\('ut-text'\) && openIt\(ev, q\)\) return;\s*if \(q\) landIt\(ev, q\);/.test(NC)) && verdictOf(/if \(!openIt\(ev, q\)\) landIt\(ev, q\);/.test(NC)));
check('③ the landing is a door of its own, in words («Show it in the conversation»)', gateOf(/jump\.className = 'cad-jump'; jump\.textContent = t\('Show it in the conversation'\);/.test(NC)) && verdictOf(/if \(ev\.target\.closest\('\.cad-jump'\)\) \{ const it = this\._dockItem; if \(it\) \{ ev\.preventDefault\(\); this\.land\(it\.id\)/.test(NC)));
check('③ the open strip floats over the chat on a spacer of its closed height (the transcript\'s size and scroll unchanged), at most half the view — its place read again when the view or the message box resizes',
  gateOf(/_dockOver\(dock, on\) \{[\s\S]{0,900}?sp\.style\.height = h \+ 'px';[\s\S]{0,200}?dock\.before\(sp\);[\s\S]{0,900}?'--cad-max', Math\.max\(120, Math\.floor\(host\.clientHeight \* 0\.5\)\)/.test(NC))
  && gateOf(/dock\.classList\.add\('cad-over'\);\s*place\(\);/.test(NC)) /* out of the flow first, then measured (the claim's ㉓ r2) */
  && gateOf(/const ro = dock\._cadRO = new ResizeObserver\(place\);\s*const watch = \(\) => \{ ro\.disconnect\(\); ro\.observe\(host\); for \(let n = dock\.nextElementSibling; n; n = n\.nextElementSibling\) ro\.observe\(n\); \};\s*watch\(\);/.test(NC)) && gateOf(/dock\._cadRO\?\.disconnect\(\); dock\._cadRO = null;/.test(NC))
  && verdictOf(/\.chat-attn-dock\.cad-over \{ position: absolute;[^}]*bottom: var\(--cad-bottom, 0px\); max-height: var\(--cad-max, 50%\); overflow-y: auto;/.test(CC)));
check('③ law 7: the open item stays the strip\'s item while it waits (a newer arrival redraws around it); its detail is open',
  gateOf(/const openKeep = dock\.classList\?\.contains\('cad-open'\) && this\._dockOpenId \? list\.find\(\(e\) => e\.item\.id === this\._dockOpenId\) : null;\s*if \(openKeep && entry && entry\.item\.id !== openKeep\.item\.id\) entry = \{ item: openKeep\.item \};/.test(NC)) && gateOf(/_dockDetail\(dock\) \{[^}]*if \(ex && !ex\.open\) ex\.open = true;/.test(NC))
  && verdictOf(/\.chat-attn-dock\.cad-open \.cad-rows \.ut-item > \.ut-body > \.ut-detail-exp \{ display: block !important;/.test(CC)));

// ③c the reader's list: the CLOSED strip is bounded (its options wrap now — never more than half the view, it scrolls inside);
// the OPENED strip stands above the ↓ (z 10) and the minimap (z 15); Esc closes it
const dockRule = RULES.find((r) => r.file === 'chat.css' && r.sel === '.chat-attn-dock');
check('③c the closed strip never takes more than half the view (max-height 50 %, it scrolls inside) — the reader\'s moderate 3', !!dockRule && verdictOf(/max-height: 50%; overflow-y: auto;/.test(dockRule.body)));
const zOf = (sel) => { const r = RULES.find((x) => x.file === 'chat.css' && x.sel === sel); const m = r && /z-index:\s*(\d+)/.exec(r.body); return m ? Number(m[1]) : null; };
const zOver = zOf('.chat-attn-dock.cad-over'), zMini = zOf('.chat-minimap'), zDown = zOf('.chat-scroll-btn-wrap');
check(`③c the opened strip (z ${zOver}) stands above the minimap (z ${zMini}) and the ↓ (z ${zDown}) — the reader's moderate 4`, zOver != null && zMini != null && zOver > zMini && (zDown == null || zOver > zDown), { zOver, zMini, zDown });
check('③c Esc on the opened strip closes it (the float\'s own key) — the reader\'s minor', verdictOf(/if \(ev\.key === 'Escape' && dock\.classList\.contains\('cad-open'\) && !imeOwnsKey\(ev\)\) \{ ev\.preventDefault\(\); ev\.stopPropagation\(\); this\._dockFold\(dock, false\); return; \}/.test(NC)));
// ③d THE MEASURE ORDER and THE OPEN STATE, exclusive (the reader's M1 / M2 / S1 / S2 / S3 planted around the earlier regexes):
// the strip's closed height is read BEFORE any class leaves it, the place AFTER it left the flow and never in it, the open item
// is never re-replaced by the newest, a close always runs the full _dockOver(off) (spacer gone), the detail opened at both calls
const overBody = (() => { const i = NC.indexOf('  _dockOver(dock, on) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const foldBody = (() => { const i = NC.indexOf('  _dockFold(dock, open) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const passBody = (() => { const i = NC.indexOf('  _dockPass(waiting) {'), j = NC.indexOf('\n  }\n', i); return i > 0 ? NC.slice(i, j) : ''; })();
const measured = (b, f) => { const h = b.indexOf('const host = dock.parentElement, h = dock.offsetHeight;'), add = b.indexOf("dock.classList.add('cad-over');"), place = b.indexOf('    place();'), sp = b.indexOf('dock.before(sp);');
  return h > 0 && add > h && sp > h && add > sp && place > add && !/classList\.remove\('cad-over'\)/.test(b.slice(b.indexOf('if (!on)') + 10 + b.slice(b.indexOf('if (!on)')).indexOf('\n'))) && f.indexOf('this._dockOver(dock, true)') < f.indexOf("dock.classList.toggle('cad-open', open)") && !/classList\.add\('cad-(over|open)'\)/.test(f.slice(0, f.indexOf('this._dockOver(dock, true)'))); };
check('③d the closed height is read before the strip leaves the flow, the place after it left and never inside it (the lost tap; the reader\'s M1 / M2)', verdictOf(measured(overBody, foldBody)));
const keeps = (p) => /if \(openKeep && entry && entry\.item\.id !== openKeep\.item\.id\) entry = \{ item: openKeep\.item \};\n/.test(p) && !/entry = d \? \{ item: d\.newest \} : entry/.test(p);
check('③d the open item is never replaced by the newest after law 7 kept it (the reader\'s S1)', verdictOf(keeps(passBody)));
check('③d a close always runs the whole _dockOver(off) — the spacer and the observer gone (the reader\'s S2)', gateOf(foldBody.includes('if (!open && was) this._dockOver(dock, false);')) && verdictOf(/if \(!on\) \{ (dock\._cadMO\?\.disconnect\(\); dock\._cadMO = null; )?dock\.classList\.remove\('cad-over'\); dock\._cadRO\?\.disconnect\(\); dock\._cadRO = null; dock\._cadSpacer\?\.remove\(\);/.test(overBody)));
check('③d the detail is opened at the open AND at every pass while open (the reader\'s S3)', gateOf(foldBody.includes('if (open) this._dockDetail(dock);')) && verdictOf(passBody.includes("if (row && dock.classList?.contains('cad-open')) this._dockDetail(dock);")));
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
// ③f THE .400 MERGED-TIP READ'S TWO CODE MINORS (B-d23d):
//   (i) the For-you window's tip loop walks only the option BUTTONS — the row's «Reply:» label is no option
const tipLoop = (x) => /for \(const o of c\.opts\.querySelectorAll\('\.iw-opt'\)\) \{ o\.disabled = sending; o\.title =/.test(x) && !/for \(const o of c\.opts\.children\)/.test(x);
check('③f the For-you window gives a reply\'s tip (and the sending lock) to its option BUTTONS only — never to the row\'s «Reply:» label', verdictOf(tipLoop(IW)));
check('③f CONTROL: the loop over every child of the options row (cdfed28ee\'s) is refused', !tipLoop(IW.replace("for (const o of c.opts.querySelectorAll('.iw-opt'))", 'for (const o of c.opts.children)')));
//   (ii) the open strip watches its COLUMN: a bar inserted below after the open (the resume bar, the sign-in card, a sub-agent
//   note) re-observes what follows the strip and re-reads its place; the close disconnects that watch before the spacer goes
const watchesColumn = (body) => /dock\._cadMO = new MutationObserver\(\(\) => \{ watch\(\); place\(\); \}\);/.test(body) && /dock\._cadMO\.observe\(host, \{ childList: true \}\);/.test(body)
  && /const watch = \(\) => \{ ro\.disconnect\(\); ro\.observe\(host\); for \(let n = dock\.nextElementSibling; n; n = n\.nextElementSibling\) ro\.observe\(n\); \};/.test(body)
  && /if \(!on\) \{ dock\._cadMO\?\.disconnect\(\); dock\._cadMO = null;[^\n]*dock\._cadSpacer\?\.remove\(\);/.test(body);
check('③f the open strip re-reads its place when a bar arrives below it after the open (its column\'s children watched; the watch ends at the close)', verdictOf(watchesColumn(overBody)));
const noMO = overBody.replace(/\n      if \(typeof MutationObserver === 'function'\) \{[\s\S]*?\n      \}/, '');
check('③f CONTROL: the strip that watches only what stood below it at the open (cdfed28ee\'s) is refused', noMO !== overBody && !watchesColumn(noMO));
//   (iii) the opened item draws what the ask ATTACHED (its --artifact chips): the strip's hide rule keeps a list of parts, and the
//   chips were never on it — opened, they are shown after the options (an order ≥ the options'), never before them
const artsOpenRule = (rules) => rules.some((r) => selectorList(r.sel).some((x) => /\.cad-open\b/.test(x) && /\.cad-rows\b/.test(x) && /^\.ut-arts$/.test(lastCompound(x)))
  && /display:\s*flex\s*!important/.test(r.body) && /(?:^|;)\s*order:\s*(\d+)/.test(r.body) && Number(/(?:^|;)\s*order:\s*(\d+)/.exec(r.body)[1]) >= 6);
// …and NO rule that names the strip's .ut-arts hides it again (the closure verifier's iii-c: a later rule at equal specificity won)
const artsHidden = (rules) => rules.filter((r) => selectorList(r.sel).some((x) => /\.(cad-rows|chat-attn-dock)\b/.test(x) && /^\.ut-arts$/.test(lastCompound(x).replace(/:[\w-]+(\([^)]*\))?/g, ''))) && /display:\s*none/.test(r.body)).map((r) => r.sel);
const artsShown = (rules) => artsOpenRule(rules) && artsHidden(rules).length === 0;
check('③f the opened strip draws the ask\'s attached chips (.ut-arts) after its options — display flex !important at an order ≥ the options\' 6', verdictOf(artsShown(RULES)));
check('③f CONTROL: without that rule (e0c3fcba2\'s sheet) the chips stay hidden in the opened item — refused', !artsShown(RULES.filter((r) => !/\.ut-arts\b/.test(r.sel) || !/\.cad-open\b/.test(r.sel))));
check('③f CONTROL (the closure verifier\'s iii-c): a LATER rule that hides the opened strip\'s chips again is refused', !artsShown([...RULES, ...cssRules('.chat-attn-dock.cad-open .cad-rows .ut-item > .ut-body > .ut-arts { display: none !important; }', 'planted')]));
// (iv) the view's stop() ends the opened strip's observers (the .400 closure, law c: no observer outlives its window)
const stopBody = (x) => { const i = x.indexOf('  stop() {'), j = x.indexOf('\n  }\n', i); return i > 0 ? x.slice(i, j) : ''; };
const stopEnds = (x) => /const d = this\.view\?\._attnDock; if \(d && \(d\._cadRO \|\| d\._cadMO\)\) this\._dockOver\(d, false\);/.test(stopBody(x));
check('③f the view\'s stop() ends the OPENED strip\'s observers (its place and its column) — through _dockOver(off), as a close does', verdictOf(stopEnds(NC)));
check('③f CONTROL: a stop() that leaves them (a91f4bc8b\'s) is refused', !stopEnds(NC.replace(/\n    \/\/ the OPENED strip's own observers[^\n]*\n[^\n]*\n    try \{ const d = this\.view\?\._attnDock;[^\n]*\n/, '\n')));

// ③b ONE ORDER wherever an item opens (主开发 13:34Z — the owner: «这样我都看不到推荐回复选项»): the question, its OPTIONS, then the detail
// the order, not the adjacency (ui-phone-and-fit's own form, handed to ui-plain-words on the .402 meeting map): the options, then the
// detail fold, then the meta line — another fold of the detail (ui-plain-words' technical fold) may stand between the detail and the meta
const oneOrder = (src) => { const line = src.split('\n').find((l) => l.includes('${opts}')) || ''; const at = (x) => line.indexOf(x); return at('${opts}') >= 0 && at('${opts}') < at('detailFold}') && at('detailFold}') < at('<div class="ut-meta">') && !src.includes('detailFold}${opts}'); };
check('③b ONE ORDER: the row (the tray, the mini inbox, the phone sheet, the strip, the card) draws its options BEFORE its detail fold', verdictOf(oneOrder(ROW)));
check('③b CONTROL: the detail fold planted before the options is red', !oneOrder(ROW.replace("${opts}${card ? '' : detailFold}", "${card ? '' : detailFold}${opts}")));
check('③b …the For-you window\'s pane: the options before the detail', verdictOf(/el\.append\(head, title, dl, arts, opts, detail, cutLine, replied, reach, reply, actions\);/.test(IW)));
check('③b …the opened strip: the options (order 6) before the detail (order 7), which scrolls below them',
  gateOf(/\.chat-attn-dock\.cad-open \.cad-rows \.ut-item > \.ut-body > \.ut-detail-exp \{ display: block !important; order: 7;/.test(CC)) && verdictOf(/\.cad-rows \.ut-body > \.ut-opts \{ order: 6;/.test(CC)));
// ③e ONE ORDER BY RULE, AT EVERY DOOR (the closure verifier's R1 / R2: a later rule that put the detail first stayed green —
// ③b reads only the drawing order). For each door where an item opens, every rule of public/*.css that can reach that door's
// options row or its detail is read: the detail's least `order` is never below the options' greatest, no rule reverses the
// item's direction, and neither part is placed on a grid (order alone places them). A rule reaches a door unless it names
// another door's own container (or excludes this one by :not); an :is() list reaches a door when one of its names does.
const OWN = ['chat-attn-dock', 'cad-rows', 'cad-open', 'cad-over', '#user-todos-popup', '#phone-home', 'ut-mini-popover', 'cn-card'];
const DOORS = [
  { name: 'the opened strip', has: ['chat-attn-dock', 'cad-rows', 'cad-open', 'cad-over'], opts: /^\.ut-opts$/, det: /^\.ut-detail-exp$/, body: /^\.ut-body$/ },
  { name: 'the tray', has: ['#user-todos-popup'], opts: /^\.ut-opts$/, det: /^\.ut-detail-exp$/, body: /^\.ut-body$/ },
  { name: 'the phone page', has: ['#phone-home'], opts: /^\.ut-opts$/, det: /^\.ut-detail-exp$/, body: /^\.ut-body$/ },
  { name: 'the mini inbox', has: ['ut-mini-popover'], opts: /^\.ut-opts$/, det: /^\.ut-detail-exp$/, body: /^\.ut-body$/ },
  { name: 'the For-you window', has: [], opts: /^\.iw-opts$/, det: /^\.iw-detail$/, body: /^\.iw-item$/ },
];
// the selector's context (all but its styled compound) split into plain names, :is()/:where() choices and :not() exclusions
const context = (sel) => {
  const last = lastCompound(sel); let s = sel.slice(0, sel.length - last.length) + last.replace(/^[^:]*/, (h) => h.replace(/^[.#][\w-]+/, ''));
  const groups = []; let m;
  while ((m = /:(is|where|not|has)\(/.exec(s))) {
    let d = 1, j = m.index + m[0].length; while (j < s.length && d) { if (s[j] === '(') d++; else if (s[j] === ')') d--; j++; }
    groups.push({ kind: m[1], inner: s.slice(m.index + m[0].length, j - 1) }); s = s.slice(0, m.index) + ' ' + s.slice(j);
  }
  const names = (x) => (x.match(/[.#][\w-]+/g) || []).map((n) => (n[0] === '.' ? n.slice(1) : n)).filter((n) => OWN.includes(n));
  return { plain: names(s), choices: groups.filter((g) => g.kind === 'is' || g.kind === 'where').map((g) => selectorList(g.inner).map(names)), nots: groups.filter((g) => g.kind === 'not').flatMap((g) => names(g.inner)) };
};
const reaches = (sel, door) => { const c = context(sel); const ok = (ns) => ns.every((n) => door.has.includes(n)); return ok(c.plain) && c.choices.every((alts) => alts.some(ok)) && !c.nots.some((n) => door.has.includes(n)); };
const orderOf = (body) => { const all = [...body.matchAll(/(?:^|;)\s*order:\s*(-?\d+)/g)]; return all.length ? Number(all[all.length - 1][1]) : null; };
const PARTS = /\.(ut-opts|ut-detail-exp|ut-body|iw-opts|iw-detail|iw-item)(?![\w-])/;   // read only the rules that name a part (the census stays O(parts))
const orderFaults = (all) => { const rules = all.filter((r) => PARTS.test(r.sel)); return DOORS.flatMap((door) => {
  const on = (re) => rules.flatMap((r) => selectorList(r.sel).filter((x) => re.test(lastCompound(x).replace(/:[\w-]+(\([^)]*\))?|\[[^\]]*\]/g, '')) && reaches(x, door)).map((x) => ({ r, x })));
  const opts = on(door.opts), det = on(door.det), body = on(door.body);
  const oMax = Math.max(0, ...opts.map(({ r }) => orderOf(r.body)).filter((n) => n !== null));
  const dSet = det.map(({ r, x }) => ({ x, n: orderOf(r.body) })).filter((d) => d.n !== null);
  const out = dSet.filter((d) => d.n < oMax).map((d) => `${door.name}: «${d.x}» orders the detail ${d.n}, before the options (${oMax})`);
  if (!dSet.length && oMax > 0) out.push(`${door.name}: the options are ordered ${oMax} and the detail keeps 0 — the detail first`);
  for (const { r, x } of body) if (/flex-direction:\s*(row|column)-reverse/.test(r.body)) out.push(`${door.name}: «${x}» reverses the item's direction`);
  for (const { r, x } of [...opts, ...det]) if (/grid-(row|area|column)\s*:/.test(r.body)) out.push(`${door.name}: «${x}» places a part on a grid`);
  return out;
}); };
const oNow = orderFaults(RULES);
check(`③e ONE ORDER BY RULE at every door (${DOORS.map((d) => d.name).join(' · ')}): no rule orders a detail before its options, reverses an item or places either part on a grid`, oNow.length === 0, oNow);
const R1 = '.chat-attn-dock.cad-open .cad-rows .ut-body > .ut-detail-exp { order: 5 !important; }';
const R2 = ':is(#user-todos-popup, #phone-home) .ut-item > .ut-body { display: flex; flex-direction: column; } :is(#user-todos-popup, #phone-home) .ut-item > .ut-body > .ut-detail-exp { order: -1; }';
const R3 = '.iw-item { display: flex; flex-direction: column-reverse; }';
const oRed = { R1: orderFaults([...RULES, ...cssRules(R1, 'planted')]), R2: orderFaults([...RULES, ...cssRules(R2, 'planted')]), R3: orderFaults([...RULES, ...cssRules(R3, 'planted')]) };
check(`③e CONTROL (the closure verifier's R1 / R2 + a reversed window item): each planted rule is caught at its door — ${Object.entries(oRed).map(([k, v]) => `${k} ${v.length}`).join(' · ')}`,
  oRed.R1.length >= 1 && gateOf(oRed.R1.every((f) => f.startsWith('the opened strip'))) && oRed.R2.length === 2 && gateOf(oRed.R2.some((f) => f.startsWith('the tray'))) && gateOf(oRed.R2.some((f) => f.startsWith('the phone page'))) && oRed.R3.length === 1 && verdictOf(oRed.R3[0].startsWith('the For-you window')), oRed);

// ④ the ladder
const L = await import(pathToFileURL(path.join(repo, 'scripts/lib/fit-ladder.mjs')).href);
let evaluates = false; try { new Function(L.fitVerdictSource('.x', { row: '.y', words: '.ut-opt' })); evaluates = true; } catch { }
check(`④ THE WIDTH LADDER is one helper: ${L.LADDER.join(' / ')} (the phone's ${L.PHONE_LADDER.join(' / ')}), its verdict source evaluates`, JSON.stringify(L.LADDER) === JSON.stringify([280, 320, 360, 420, 500, 640, 800, 1100, 1440]) && gateOf(L.PHONE_LADDER.every((w) => w <= 768)) && verdictOf(evaluates));
check('④ …and the door suite measures with it (test-foryou-fit-chrome imports runLadder / fitVerdictSource)', gateOf(/from '\.\/lib\/fit-ladder\.mjs'/.test(read('scripts/test-foryou-fit-chrome.mjs'))) && verdictOf(/runLadder\(\{/.test(read('scripts/test-foryou-fit-chrome.mjs'))));

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
