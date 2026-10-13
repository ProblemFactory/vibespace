#!/usr/bin/env node
// test-phone-composer — THE PHONE COMPOSER's structure (lane phone-chat-composer, owner 2026-10-13 "输入框非常窄。下面状态栏
// 又很稀疏"): on a phone the text box owns its row — ONE leading "+" door whose sheet reaches the image / file / folder
// inputs, the microphone INSIDE the field — and the status bar is one row with the rest behind ⋯; the desk row is the
// pinned one. A source census over src/lib/chat-input.js, src/lib/chat-status-bar.js and the public/chat.css block,
// each judged on the shipped text AND on a planted copy (RED controls): the desk row gaining the door, the phone face
// keeping a desk button beside the field, the phone CSS un-gated, the ⋯ chip on the desk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    gated: /window\.matchMedia\('\(max-width: 768px\)'\)/.test(src) && /phoneFace\(phoneMq\.matches\)/.test(src),
  };
}
function judgeBar(src) {
  return {
    more: /if \(PHONE_MQ\?\.matches\) chip\('more', /.test(src),
    foldGate: (() => { const f = src.indexOf('  _fold() {'), g = src.indexOf('if (!PHONE_MQ?.matches || open) return;', f), a = src.indexOf("classList.add('chat-status-folded')", f); return f > 0 && g > f && a > g; })(),
    sheetRows: /if \(PHONE_MQ\?\.matches\) for \(const \[k, label\] of \[\['effort', t\('Effort'\)\], \['style', t\('Output style'\)\]\]\)/.test(src),
  };
}
function judgeCss(css) {
  const m = /\/\* ── THE PHONE COMPOSER[\s\S]*?\*\/([\s\S]*?)\/\* ── end THE PHONE COMPOSER ── \*\//.exec(css);
  if (!m) return { block: false };
  // outside the ≤ 768 px query the block may only hide the door
  let body = m[1], i = body.indexOf('@media (max-width: 768px) {'), rest = body;
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
ok('the status bar: ⋯ exists only on a phone; the fold writes nothing on the desk', jB.more && jB.foldGate, jB);
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
ok('RED: the phone CSS un-gated', !judgeCss(css.replace(/(THE PHONE COMPOSER[\s\S]*?)@media \(max-width: 768px\) \{/, '$1@media all {')).gated);
ok('RED: ⋯ on the desk', !judgeBar(sb.replace("if (PHONE_MQ?.matches) chip('more', ", "chip('more', ")).more);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
