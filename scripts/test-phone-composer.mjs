#!/usr/bin/env node
// test-phone-composer — THE PHONE COMPOSER's structure (lane phone-chat-composer, owner 2026-10-13 "输入框非常窄。下面状态栏
// 又很稀疏"): on a phone the text box owns its row — ONE leading "+" door whose sheet reaches the image / file / folder
// inputs, the microphone INSIDE the field — and the status bar is one row with the rest behind ⋯; the desk row is the
// pinned one. A source census over src/lib/chat-input.js, src/lib/chat-status-bar.js and the public/chat.css block,
// each judged on the shipped text AND on a planted copy (RED controls): the desk row gaining the door, the phone face
// keeping a desk button beside the field, the phone CSS un-gated, the ⋯ chip on the desk.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { phoneBarFold, PHONE_BAR_NEVER_FOLD } from '../src/lib/title-chips.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};

const DESK_ROW = 'attachBtn, attachInput, this._voice.btn, uploadBtn, fileInput, dirInput, this._textarea, expandBtn, this._slashDropdown, this._voice.chip';
const PHONE_ROW = 'plusBtn, attachInput, fileInput, dirInput, field, this._slashDropdown, this._voice.chip';
function judgeInput(src) {
  const appends = [...src.matchAll(/^\s*inputWrap\.append\((.*)\);$/gm)].map((m) => m[1]);
  const phone = [...src.matchAll(/inputWrap\.replaceChildren\(([^)]*)\)/g)].map((m) => m[1]);
  return {
    desk: appends.length === 1 && appends[0] === DESK_ROW,
    phone: phone.includes(PHONE_ROW) && phone.includes('...deskKids'),
    deskFirst: src.indexOf('const deskKids = [...inputWrap.childNodes];') > src.indexOf(`inputWrap.append(${DESK_ROW});`),
    mic: /field\.append\(this\._textarea, this\._voice\.btn, expandBtn\)/.test(src),
    sheet: /label: t\('Image'\), action: \(\) => attachInput\.click\(\) \},\s*\{ label: t\('File'\), action: \(\) => fileInput\.click\(\) \},\s*\{ label: t\('Folder'\), action: \(\) => dirInput\.click\(\) \}/.test(src),
    gated: /window\.matchMedia\(VC_PHONE_MEDIA\)/.test(src) && /phoneFace\(phoneMq\.matches\)/.test(src),
  };
}
function judgeBar(src) {
  return {
    // lane desktop-small P2-4: the ONE row is a phone's AND a narrow desk window's (_oneRow: PHONE_MQ, or a window < NARROW_BAR_PX)
    more: /if \(this\._oneRow\(\)\) chip\('more', /.test(src) && /_oneRow\(\) \{\s*if \(PHONE_MQ\?\.matches\) return true;[\s\S]{0,260}return \(w > 0 && w < NARROW_BAR_PX\) \|\| \(h > 0 && h < SHORT_WINDOW_PX\);/.test(src),
    foldGate: (() => { const f = src.indexOf('  _fold() {'), p = src.indexOf('phone = this._oneRow()', f), g = src.indexOf('if (!phone || open) return;', f), a = src.indexOf("classList.add('chat-status-folded')", f); return f > 0 && p > f && g > p && a > g; })(),
    sheetRows: /if \(PHONE_MQ\?\.matches\) for \(const \[k, label\] of \[\['effort', t\('Effort'\)\], \['style', t\('Output style'\)\]\]\)/.test(src),
  };
}
function judgeCss(css) {
  const m = /\/\* ── THE PHONE COMPOSER[\s\S]*?\*\/([\s\S]*?)\/\* ── end THE PHONE COMPOSER ── \*\//.exec(css);
  if (!m) return { block: false };
  // outside the ≤ 768 px query the block may only hide the door
  let body = m[1], i = body.indexOf('@media (max-width: 768px), (pointer: coarse) and (max-width: 1023px) {'), rest = body;
  if (i >= 0) { let d = 0, j = body.indexOf('{', i); for (; j < body.length; j++) { if (body[j] === '{') d++; else if (body[j] === '}' && --d === 0) break; } rest = body.slice(0, i) + body.slice(j + 1); }
  return { block: true, gated: i >= 0 && rest.replace(/\/\*[\s\S]*?\*\//g, '').trim() === '.chat-plus-btn { display: none; }' };
}

console.log('① the shipped sources');
const ci = read('src/lib/chat-input.js'), sb = read('src/lib/chat-status-bar.js'), css = read('public/chat.css');
const jI = judgeInput(ci), jB = judgeBar(sb), jC = judgeCss(css);
ok('desk: the composer row is the pinned one (image · mic · upload · field · ⤢) — no door, no field box', jI.desk, jI);
ok('phone: ONE leading + door, then the field — the desk buttons are not beside it', jI.phone, jI);
ok('the desk order is captured before the phone face exists', jI.deskFirst, jI);
ok('phone: the mic (and ⤢) live INSIDE the field box', jI.mic, jI);
ok('the + sheet reaches the image / file / folder inputs, in that order', jI.sheet, jI);
ok('the phone face is gated on the 768 px query (and follows it)', jI.gated, jI);
ok('the status bar: ⋯ exists only on a phone or a desk window narrower than NARROW_BAR_PX (lane desktop-small P2-4); the fold writes nothing on a wide desk bar', jB.more && jB.foldGate, jB);
ok('the model chip\'s sheet carries effort + style on a phone', jB.sheetRows, jB);
ok('chat.css: the phone block is gated — outside the query it only hides the door', jC.block && jC.gated, jC);

console.log('② i18n — the sheet + bar words in zh / ja');
for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
  const src = read(f), miss = ['Add attachment', 'Image', 'File', 'Folder', 'More', 'Close', 'Effort', 'Output style'].filter((k) => !src.includes(`"${k}":`));
  ok(`${path.basename(f)} has every word`, !miss.length, miss);
}

console.log('③ RED controls (planted copies)');
const deskLine = `inputWrap.append(${DESK_ROW});`;
ok('RED: the desk row gaining the + door', !judgeInput(ci.replace(deskLine, `inputWrap.append(plusBtn, ${DESK_ROW});`)).desk);
ok('RED: the phone face keeping the desk mic beside the field', !judgeInput(ci.replace(PHONE_ROW, 'plusBtn, attachInput, this._voice.btn, fileInput, dirInput, field, this._slashDropdown, this._voice.chip')).phone);
ok('RED: the phone CSS un-gated', !judgeCss(css.replace(/(THE PHONE COMPOSER[\s\S]*?)@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{/, '$1@media all {')).gated);
ok('RED: ⋯ on every desk bar', !judgeBar(sb.replace("if (this._oneRow()) chip('more', ", "chip('more', ")).more);

console.log('④ the fold table (PURE phoneBarFold; lane phone-bar-billing-nofold — mirror-262: the runner\'s fonts folded the billing chip)');
// a row = the bar's chips as measured at 390 px (room = 390 − 24 padding − ⋯ 36 − gap 8 = 322): the hub's fonts, then
// the runner's DejaVu (model 66 → 74, billing 117 → 121 — the base folded it: 112 px were left after goal/auto/design)
const row = (model, bill) => [['search', 36], ['model', model], ['effort', 51], ['goal', 20], ['style', 80], ['autoresume', 20], ['design', 20], ['billing', bill.full], ['perm', 51]]
  .map(([key, w]) => (key === 'billing' ? { key, w, forms: bill } : { key, w }));
const plan = (fold, model, bill, room = 322) => { const p = fold({ chips: row(model, bill), room, gap: 8 }); return { folded: [...p.folded].join(','), billing: p.billing }; };
ok('the never-fold set: search · model · turn state · health · the billing chip (who pays)', ['search', 'model', 'turnstate', 'health', 'billing'].every((k) => PHONE_BAR_NEVER_FOLD.includes(k)) && PHONE_BAR_NEVER_FOLD.length === 5, PHONE_BAR_NEVER_FOLD);
const hub = plan(phoneBarFold, 66, { full: 117, compact: 63, icon: 19 }), runner = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 });
ok('hub fonts: billing full; effort · style · perm fold', hub.billing === 'full' && hub.folded === 'effort,style,perm', hub);
ok('runner fonts: billing STILL full — design folds instead', runner.billing === 'full' && runner.folded === 'effort,style,design,perm', runner);
const wide = plan(phoneBarFold, 74, { full: 200, compact: 64, icon: 19 }), narrow = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 150), none = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 60);
ok('the three forms by the room the other never-fold chips leave: full → compact → icon', wide.billing === 'compact' && narrow.billing === 'icon' && runner.billing === 'full', { wide, narrow });
ok('no room at all: the icon still draws — the billing chip is never in the folded set', none.billing === 'icon' && !none.folded.split(',').includes('billing') && none.folded.includes('goal'), none);
ok('effort + style always fold and their width folds nothing else (style 80 px > the room left)', hub.folded.split(',').includes('style') && !hub.folded.includes('autoresume'), hub);
ok('wiring: _fold lays the bar by phoneBarFold and writes the billing form; _fitBilling leaves the closed phone row to it',
  /const plan = phoneBarFold\(\{ chips, room, gap \}\);/.test(sb) && /bill\.el\.dataset\.mode = plan\.billing;/.test(sb) && /if \(this\._oneRow\(\) && !this\._foldOpen\) return;/.test(sb), null);
{ // RED control: the billing chip foldable again (the base's rule) — the runner row folds it
  const tc = read('src/lib/title-chips.js'), f = path.join(os.tmpdir(), `vs-phonebar-red-${process.pid}.mjs`);
  fs.writeFileSync(f, tc.replace("'turnstate', 'health', 'billing']", "'turnstate', 'health']"));
  try { const red = await import(pathToFileURL(f).href), r = plan(red.phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }); ok('RED: billing out of the never-fold set ⇒ the runner row folds it', r.folded.split(',').includes('billing'), r); }
  finally { fs.rmSync(f, { force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
