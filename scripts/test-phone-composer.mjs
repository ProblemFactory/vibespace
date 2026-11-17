#!/usr/bin/env node
// test-phone-composer — THE PHONE COMPOSER's structure (lane phone-chat-composer, owner 2026-10-13 "输入框非常窄。下面状态栏
// 又很稀疏"): on a phone the text box owns its row — ONE leading "+" door whose sheet reaches the image / file / folder
// inputs, the microphone INSIDE the field — and the status bar is the strip's SAME two rows (lane mask-value-shape, the
// owner's arrangement of 2026-11-14 — it was one row with the rest behind ⋯); the desk row is the pinned one. A source census over src/lib/chat-input.js, src/lib/chat-status-bar.js and the public/chat.css block,
// each judged on the shipped text AND on a planted copy (RED controls): the desk row gaining the door, the phone face
// keeping a desk button beside the field, the phone CSS un-gated, the ⋯ chip planted back, the row break taken out.
// lane phone-take-photo (owner 2026-11-09 «为啥我在手机上添加图片的时候不能拍照»): the sheet's rows are 拍照 / 照片 / 文件 /
// 文件夹 — 拍照 = the camera door's OWN input (images, capture="environment", one shot), shown only on a finger device
// (isTouchDevice), its shot on the picked image's road; the gallery input keeps `multiple` and never gains capture.
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
const PHONE_ROW = 'plusBtn, camera.input, attachInput, fileInput, dirInput, field, this._slashDropdown, this._voice.chip';
function judgeInput(src) {
  const appends = [...src.matchAll(/^\s*inputWrap\.append\((.*)\);$/gm)].map((m) => m[1]);
  const phone = [...src.matchAll(/inputWrap\.replaceChildren\(([^)]*)\)/g)].map((m) => m[1]);
  return {
    desk: appends.length === 1 && appends[0] === DESK_ROW,
    phone: phone.includes(PHONE_ROW) && phone.includes('...deskKids'),
    deskFirst: src.indexOf('const deskKids = [...inputWrap.childNodes];') > src.indexOf(`inputWrap.append(${DESK_ROW});`),
    mic: /field\.append\(this\._textarea, this\._voice\.btn, expandBtn\)/.test(src),
    sheet: /\[\s*camera\.row\(\),\s*sheetRow\(UI_ICONS\.image, t\('Photos'\), \(\) => attachInput\.click\(\)\),\s*sheetRow\(FILE_ICONS\.unknown, t\('File'\), \(\) => fileInput\.click\(\)\),\s*sheetRow\(FILE_ICONS\.folder, t\('Folder'\), \(\) => dirInput\.click\(\)\),\s*\]\.filter\(Boolean\)/.test(src),
    // lane phone-take-photo: the camera door — its own input, images, the back camera, ONE shot; the row only on a finger device;
    // the shot on the picked image's road; the gallery input keeps its multi-select and never gains capture
    camera: (() => {
      const a = src.indexOf('export function cameraDoor('), b = src.indexOf('\n}\n', a), door = a >= 0 && b > a ? src.slice(a, b) : '';
      return /input\.accept = 'image\/\*';/.test(door) && /input\.setAttribute\('capture', 'environment'\);/.test(door) && !/multiple/.test(door)
        && /row: \(\) => \(isTouchDevice\(\) \? sheetRow\(UI_ICONS\.camera, t\('Take photo'\), \(\) => input\.click\(\)\) : null\)/.test(door)
        && /const camera = cameraDoor\(\(shot\) => this\._addImageAttachment\(shot\)\);/.test(src);
    })(),
    gallery: /attachInput\.accept = 'image\/\*';\s*attachInput\.multiple = true;/.test(src) && !/attachInput\.(setAttribute\('capture'|capture\b)/.test(src),
    gated: /window\.matchMedia\(VC_PHONE_MEDIA\)/.test(src) && /phoneFace\(phoneMq\.matches\)/.test(src),
  };
}
function judgeBar(src) {
  return {
    // lane mask-value-shape (the strip's step two): no ⋯ and no fold at any width — below ONE_ROW_PX the row break between
    // row 1 and row 2 (strip-table.js), the same on a phone and a narrow desk window
    noMore: !/chip\('more', /.test(src) && !/_oneRow\(\)/.test(src) && !/classList\.add\('chat-status-folded'\)/.test(src),
    rowBreak: /const one = !\(w > 0\) \|\| w >= ONE_ROW_PX, short = w > 0 && w <= SHORT_FORM_PX;/.test(src) && /if \(!one && firstRow2 > 0\) ordered\.splice\(firstRow2, 0, mark\('row-break', 'chat-status-rowbreak'\)\);/.test(src),
    // the thinking level is a part of the model door; the output style a row of «⚙ 对话设置» (the phone's old sheet rows)
    doors: /data-door-part="effort"/.test(src) && /inDoor\('style', `chat-status-style chat-status-clickable/.test(src),
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
ok('the + sheet says what each row opens — 拍照 (the camera door) · 照片 · 文件 · 文件夹, in that order', jI.sheet, jI);
ok('拍照 = the camera door\'s OWN input (image/*, capture=environment, one shot), its row only on a finger device, the shot on _addImageAttachment', jI.camera, jI);
ok('照片 = the gallery input: image/*, multiple, no capture', jI.gallery, jI);
ok('the phone face is gated on the 768 px query (and follows it)', jI.gated, jI);
ok('the status bar: no ⋯ and no fold at any width — the row break between the strip\'s two rows below ONE_ROW_PX (lane mask-value-shape; was ⋯ on a phone / a desk window under 480 px)', jB.noMore && jB.rowBreak, jB);
ok('the thinking level sits inside the model door, the output style is a row of «⚙ 对话设置» (was: the model chip\'s phone sheet carried both)', jB.doors, jB);
ok('chat.css: the phone block is gated — outside the query it only hides the door', jC.block && jC.gated, jC);

console.log('② i18n — the sheet + bar words in zh / ja');
for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
  const src = read(f), miss = ['Add attachment', 'Take photo', 'Photos', 'File', 'Folder', 'More', 'Close', 'Effort', 'Output style'].filter((k) => !src.includes(`"${k}":`));
  ok(`${path.basename(f)} has every word`, !miss.length, miss);
}

console.log('③ RED controls (planted copies)');
const deskLine = `inputWrap.append(${DESK_ROW});`;
ok('RED: the desk row gaining the + door', !judgeInput(ci.replace(deskLine, `inputWrap.append(plusBtn, ${DESK_ROW});`)).desk);
ok('RED: the phone face keeping the desk mic beside the field', !judgeInput(ci.replace(PHONE_ROW, 'plusBtn, attachInput, this._voice.btn, fileInput, dirInput, field, this._slashDropdown, this._voice.chip')).phone);
ok('RED: the phone CSS un-gated', !judgeCss(css.replace(/(THE PHONE COMPOSER[\s\S]*?)@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{/, '$1@media all {')).gated);
ok('RED: the camera row on every device (no touch test)', !judgeInput(ci.replace('row: () => (isTouchDevice() ? sheetRow(', 'row: () => (true ? sheetRow(')).camera);
ok('RED: the camera door taking many shots', !judgeInput(ci.replace("input.setAttribute('capture', 'environment');", "input.setAttribute('capture', 'environment'); input.multiple = true;")).camera);
ok('RED: the shot on another road (the upload)', !judgeInput(ci.replace('cameraDoor((shot) => this._addImageAttachment(shot))', 'cameraDoor((shot) => this.uploadFiles([shot]))')).camera);
ok('RED: the gallery input gaining capture', !judgeInput(ci.replace('attachInput.multiple = true;', "attachInput.multiple = true; attachInput.setAttribute('capture', 'environment');")).gallery);
ok('RED: 拍照 opening the gallery input', !judgeInput(ci.replace('        camera.row(),', "        sheetRow(UI_ICONS.camera, t('Take photo'), () => attachInput.click()),")).sheet);
ok('RED: the ⋯ chip planted back', judgeBar(sb).noMore && !judgeBar(sb.replace("chip('settings', ", "chip('more', 'chat-status-more', '', '\u22EF');\n    chip('settings', ")).noMore);
ok('RED: the row break taken out (the rows run together)', !judgeBar(sb.replace('if (!one && firstRow2 > 0) ordered.splice(', 'if (false) ordered.splice(')).rowBreak);

console.log('④ the fold table (PURE phoneBarFold; lane phone-bar-billing-nofold — mirror-262: the runner\'s fonts folded the billing chip)');
// a row = the bar's chips as measured at 390 px (room = 390 − 24 padding − ⋯ 36 − gap 8 = 322): the hub's fonts, then
// the runner's DejaVu (model 66 → 74, billing 117 → 121 — the base folded it: 112 px were left after goal/auto/design)
const row = (model, bill) => [['search', 36], ['model', model], ['effort', 51], ['goal', 20], ['style', 80], ['autoresume', 20], ['design', 20], ['billing', bill.full], ['perm', 51]]
  .map(([key, w]) => (key === 'billing' ? { key, w, forms: bill } : { key, w }));
const plan = (fold, model, bill, room = 322) => { const p = fold({ chips: row(model, bill), room, gap: 8 }); return { folded: [...p.folded].join(','), billing: p.billing }; };
ok('the never-fold set: search · model · turn state · health · the billing chip (who pays) — what waits on you is the window\'s attention dock above the message box, never a bar chip (lane needs-card-tail r10)', ['search', 'model', 'turnstate', 'health', 'billing'].every((k) => PHONE_BAR_NEVER_FOLD.includes(k)) && !PHONE_BAR_NEVER_FOLD.includes('foryou') && PHONE_BAR_NEVER_FOLD.length === 5, PHONE_BAR_NEVER_FOLD);
const hub = plan(phoneBarFold, 66, { full: 117, compact: 63, icon: 19 }), runner = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 });
ok('hub fonts: billing full; effort · style · perm fold', hub.billing === 'full' && hub.folded === 'effort,style,perm', hub);
ok('runner fonts: billing STILL full — design folds instead', runner.billing === 'full' && runner.folded === 'effort,style,design,perm', runner);
const wide = plan(phoneBarFold, 74, { full: 200, compact: 64, icon: 19 }), narrow = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 150), none = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 60);
ok('the three forms by the room the other never-fold chips leave: full → compact → icon', wide.billing === 'compact' && narrow.billing === 'icon' && runner.billing === 'full', { wide, narrow });
ok('no room at all: the icon still draws — the billing chip is never in the folded set', none.billing === 'icon' && !none.folded.split(',').includes('billing') && none.folded.includes('goal'), none);
ok('effort + style always fold and their width folds nothing else (style 80 px > the room left)', hub.folded.split(',').includes('style') && !hub.folded.includes('autoresume'), hub);
// lane mask-value-shape: the status bar folds nothing any more (its billing chip is a row of «⚙ 对话设置», its full words
// the row's value) — the PURE table above stays title-chips.js's own; the bar no longer imports it
ok('wiring: the status bar no longer folds by phoneBarFold (nothing folds; the billing chip is a row of «⚙ 对话设置» whose value is its FULL words)',
  !/phoneBarFold/.test(sb) && /inDoor\('billing', [^\n]*value: forms\.full \}\);/.test(sb), null);
{ // RED control: the billing chip foldable again (the base's rule) — the runner row folds it
  const tc = read('src/lib/title-chips.js'), f = path.join(os.tmpdir(), `vs-phonebar-red-${process.pid}.mjs`);
  fs.writeFileSync(f, tc.replace("'turnstate', 'health', 'billing']", "'turnstate', 'health']"));
  try { const red = await import(pathToFileURL(f).href), r = plan(red.phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }); ok('RED: billing out of the never-fold set ⇒ the runner row folds it', r.folded.split(',').includes('billing'), r); }
  finally { fs.rmSync(f, { force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
