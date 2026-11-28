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
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { phoneBarFold, PHONE_BAR_NEVER_FOLD } from '../src/lib/title-chips.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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
    noMore: !/chip\('more', /.test(src) && !/_oneRow\(\)/.test(src) && !/classList\.add\('chat-status-folded'\)/.test(src),   // stale-pins: kept — a «gone» check: nothing folds
    rowBreak: /const one = !\(w > 0\) \|\| w >= ONE_ROW_PX \|\| low, short = w > 0 && \(w <= SHORT_FORM_PX \|\| \(low && w < ONE_ROW_PX\)\);/.test(src) && /const low = !!win && !PHONE_MQ\?\.matches && win\.offsetHeight > 0 && win\.offsetHeight < SHORT_WINDOW_PX;/.test(src) && /if \(!one && firstRow2 > 0\) ordered\.splice\(firstRow2, 0, mark\('row-break', 'chat-status-rowbreak'\)\);/.test(src),
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
ok('desk: the composer row is the pinned one (image · mic · upload · field · ⤢) — no door, no field box', verdictOf(jI.desk), jI);
ok('phone: ONE leading + door, then the field — the desk buttons are not beside it', verdictOf(jI.phone), jI);
ok('the desk order is captured before the phone face exists', verdictOf(jI.deskFirst), jI);
ok('phone: the mic (and ⤢) live INSIDE the field box', verdictOf(jI.mic), jI);
ok('the + sheet says what each row opens — 拍照 (the camera door) · 照片 · 文件 · 文件夹, in that order', verdictOf(jI.sheet), jI);
ok('拍照 = the camera door\'s OWN input (image/*, capture=environment, one shot), its row only on a finger device, the shot on _addImageAttachment', verdictOf(jI.camera), jI);
ok('照片 = the gallery input: image/*, multiple, no capture', verdictOf(jI.gallery), jI);
ok('the phone face is gated on the 768 px query (and follows it)', verdictOf(jI.gated), jI);
ok('the status bar: no ⋯ and no fold at any width — the row break between the strip\'s two rows below ONE_ROW_PX (lane mask-value-shape; was ⋯ on a phone / a desk window under 480 px)', gateOf(jB.noMore) && verdictOf(jB.rowBreak), jB);
ok('the thinking level sits inside the model door, the output style is a row of «⚙ 对话设置» (was: the model chip\'s phone sheet carried both)', verdictOf(jB.doors), jB);
ok('chat.css: the phone block is gated — outside the query it only hides the door', gateOf(jC.block) && verdictOf(jC.gated), jC);

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
ok('RED: the ⋯ chip planted back', gateOf(judgeBar(sb).noMore) && !judgeBar(sb.replace("chip('settings', ", "chip('more', 'chat-status-more', '', '\u22EF');\n    chip('settings', ")).noMore);
ok('RED: the row break taken out (the rows run together)', !judgeBar(sb.replace('if (!one && firstRow2 > 0) ordered.splice(', 'if (false) ordered.splice(')).rowBreak);

console.log('④ the fold table (PURE phoneBarFold; lane phone-bar-billing-nofold — mirror-262: the runner\'s fonts folded the billing chip)');
// a row = the bar's chips as measured at 390 px (room = 390 − 24 padding − ⋯ 36 − gap 8 = 322): the hub's fonts, then
// the runner's DejaVu (model 66 → 74, billing 117 → 121 — the base folded it: 112 px were left after goal/auto/design)
const row = (model, bill) => [['search', 36], ['model', model], ['effort', 51], ['goal', 20], ['style', 80], ['autoresume', 20], ['design', 20], ['billing', bill.full], ['perm', 51]]
  .map(([key, w]) => (key === 'billing' ? { key, w, forms: bill } : { key, w }));
const plan = (fold, model, bill, room = 322) => { const p = fold({ chips: row(model, bill), room, gap: 8 }); return { folded: [...p.folded].join(','), billing: p.billing }; };
ok('the never-fold set: search · model · turn state · health · the billing chip (who pays) — what waits on you is the window\'s attention dock above the message box, never a bar chip (lane needs-card-tail r10)', gateOf(['search', 'model', 'turnstate', 'health', 'billing'].every((k) => PHONE_BAR_NEVER_FOLD.includes(k))) && !PHONE_BAR_NEVER_FOLD.includes('foryou') && PHONE_BAR_NEVER_FOLD.length === 5, PHONE_BAR_NEVER_FOLD);
const hub = plan(phoneBarFold, 66, { full: 117, compact: 63, icon: 19 }), runner = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 });
ok('hub fonts: billing full; effort · style · perm fold', hub.billing === 'full' && hub.folded === 'effort,style,perm', hub);
ok('runner fonts: billing STILL full — design folds instead', runner.billing === 'full' && runner.folded === 'effort,style,design,perm', runner);
const wide = plan(phoneBarFold, 74, { full: 200, compact: 64, icon: 19 }), narrow = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 150), none = plan(phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }, 60);
ok('the three forms by the room the other never-fold chips leave: full → compact → icon', wide.billing === 'compact' && narrow.billing === 'icon' && runner.billing === 'full', { wide, narrow });
ok('no room at all: the icon still draws — the billing chip is never in the folded set', none.billing === 'icon' && !none.folded.split(',').includes('billing') && verdictOf(none.folded.includes('goal')), none);
ok('effort + style always fold and their width folds nothing else (style 80 px > the room left)', gateOf(hub.folded.split(',').includes('style')) && !hub.folded.includes('autoresume'), hub);
// lane mask-value-shape: the status bar folds nothing any more (its billing chip is a row of «⚙ 对话设置», its full words
// the row's value) — the PURE table above stays title-chips.js's own; the bar no longer imports it
ok('wiring: the status bar no longer folds by phoneBarFold (nothing folds; the billing chip is a row of «⚙ 对话设置» whose value is its FULL words)',
  !/phoneBarFold/.test(sb) && verdictOf(/inDoor\('billing', [^\n]*value: forms\.full \}\);/.test(sb)), null);
{ // RED control: the billing chip foldable again (the base's rule) — the runner row folds it
  const tc = read('src/lib/title-chips.js'), f = path.join(os.tmpdir(), `vs-phonebar-red-${process.pid}.mjs`);
  fs.writeFileSync(f, editAnchor(tc, "'turnstate', 'health', 'billing']", "'turnstate', 'health']", "src/lib/title-chips.js"));
  try { const red = await import(pathToFileURL(f).href), r = plan(red.phoneBarFold, 74, { full: 121, compact: 64, icon: 19 }); ok('RED: billing out of the never-fold set ⇒ the runner row folds it', verdictOf(r.folded.split(',').includes('billing')), r); }
  finally { fs.rmSync(f, { force: true }); }
}

console.log('⑤ THE PICTURE RULE (B-c9ed: no size, type, empty-file check on any road — a 40 MB file rode one frame, a .txt / .heic / 0-byte file became an image block)');
{
  const { createRequire } = await import('node:module');
  const { execFileSync } = await import('node:child_process');
  const req = createRequire(import.meta.url);
  const R = req('../src/image-attach-rule.js');
  const D = await import('../src/lib/image-attach.js');
  const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const png = (w = 1, h = 1) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0];
  const PNG = png();
  // a JPEG whose frame header (SOF0) sits after a 30 KB EXIF segment — the head a door reads (64 KiB) reaches it
  const jpeg = (w, h, exif = 30000) => [0xff, 0xd8, 0xff, 0xe1, (exif + 2) >> 8, (exif + 2) & 255, ...new Array(exif).fill(0), 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0];
  const JPEG = jpeg(640, 480, 10);
  const seg = (m, n) => [0xff, m, (n + 2) >> 8, (n + 2) & 255, ...new Array(n).fill(0)];   // an APPn segment of n bytes (n ≤ 65533)
  const jpegDeep = (w, h) => [0xff, 0xd8, ...seg(0xe1, 40000), ...seg(0xe2, 40000), 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0];   // its frame header past 64 KiB
  const GIF = [...Buffer.from('GIF89a'), 0x40, 0x01, 0xf0, 0x00, 0x80, 0, 0, 0, 0, 0];
  const WEBP = [...Buffer.from('RIFF'), 0x24, 0, 0, 0, ...Buffer.from('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x1f, 0, 0x3f, 0x1f, 0];   // VP8X 8000 × 8000
  const box = (major, ...compat) => { const b = [major, '\0\0\0\0', ...compat].join(''); return [...be32(8 + b.length), ...Buffer.from('ftyp' + b, 'latin1'), 0, 0, 0, 0]; };
  const TXT = [...Buffer.from('hello, this is text')];
  // batch 20 cure (主开发 2026-11-18 08:44Z): the three numbers are the HARNESS row's (src/backend-caps.js imageLimitsOf) — claude
  // states the Claude API's; the legs below judge with claude's row unless a leg names another harness
  const BC = req('../src/backend-caps.js');
  const CL = BC.imageLimitsOf('claude');
  const B64CAP = CL.b64PerPicture, FILECAP = R.fileBytesOf(CL.b64PerPicture), SIDE = CL.sidePx, REQ = CL.requestB64;
  // ⑤a the PURE verdicts — the type from the BYTES, then the size as the API measures it (its base64), the sides, the total; no count
  const j = (head, size = 1000, total = 0, limits = CL) => R.judgeImage({ size, head }, { total, limits });
  ok('PNG / JPEG / GIF / WebP taken, each with the type its bytes say (and its sides read from the header)', j(PNG).mediaType === 'image/png' && j(JPEG).mediaType === 'image/jpeg' && j(JPEG).width === 640 && j(JPEG).height === 480 && j(GIF).mediaType === 'image/gif' && j(GIF).width === 320 && j(WEBP).mediaType === 'image/webp' && j(WEBP).width === 8000, [j(PNG), j(JPEG), j(GIF), j(WEBP)]);
  ok('HEIC / HEIF refused BY NAME (heic, heix, mif1 brands)', verdictOf([box('heic'), box('heix'), box('mif1', 'heic')].every((h) => j(h).code === 'heic')), [box('heic'), box('mif1', 'heic')].map((h) => j(h)));
  ok('an AVIF — even one whose major brand is the generic mif1 — is «not a picture the model reads», never called a HEIC', j(box('avif')).code === 'not_image' && j(box('mif1', 'miaf', 'avif')).code === 'not_image', [j(box('avif')), j(box('mif1', 'miaf', 'avif'))]);
  ok('a text file (whatever the browser declared) is not a picture', j(TXT).code === 'not_image' && j([]).code === 'not_image', [j(TXT), j([])]);
  ok('a 0-byte file is refused as empty (before its missing bytes are judged)', j([], 0).code === 'empty' && j(PNG, 0).code === 'empty');
  ok(`claude's size cap is the API's own measure — the BASE64 of one picture ≤ 5 MiB, i.e. a file ≤ ${R.refusalVars({}, CL).mb} MiB: the largest fitting file taken, one byte more refused`,
    B64CAP === 5 * 1024 * 1024 && FILECAP === 3932160 && R.refusalVars({}, CL).mb === 3.75 && gateOf(j(PNG, FILECAP).ok) && j(PNG, FILECAP + 1).code === 'too_big' && j(PNG, FILECAP).b64 === B64CAP, [j(PNG, FILECAP), j(PNG, FILECAP + 1)]);
  ok('a 4.5 MB screenshot (it fits «5 MB» as a file but not as the base64 the API measures) is refused — the row\'s «fails later at the vendor»', j(PNG, 4.5e6).code === 'too_big');
  ok('the type is judged before the size: a 40 MB text file is «not a picture», not «too big»', j(TXT, 40 * 1024 * 1024).code === 'not_image');
  ok(`a side over ${SIDE} px is refused with its sides (PNG, JPEG after its EXIF, WebP); exactly ${SIDE} taken`,
    j(png(1440, 12000)).code === 'too_wide' && j(png(1440, 12000)).height === 12000 && j(jpeg(9000, 100)).code === 'too_wide' && gateOf(j(png(8000, 8000)).ok) && verdictOf(j(WEBP).ok), [j(png(1440, 12000)), j(jpeg(9000, 100))]);
  ok('a JPEG whose frame header lies past the head (or a cut header) has no known sides and is judged on the rest', gateOf(j(jpegDeep(9000, 100).slice(0, R.HEAD_BYTES)).ok) && j(jpegDeep(9000, 100)).code === 'too_wide' && verdictOf(j(JPEG.slice(0, 8)).ok));
  ok(`the message's total: a picture that takes its pictures past ${REQ / 1e6} MB of base64 (the API's request size) is refused; up to it taken`,
    j(PNG, 3e6, REQ - 4e6 + 1).code === 'too_much' && j(PNG, 3e6, REQ - 4e6).ok === true, [j(PNG, 3e6, REQ - 4e6 + 1), j(PNG, 3e6, REQ - 4e6)]);
  ok('NO count cap (主开发 22:55Z): no count in the verdict, no count word', !('maxCount' in R.CAPS) && !Object.keys(R.REFUSAL_WORDS).some((k) => /many|count/.test(k)), Object.keys(R.REFUSAL_WORDS));
  // ⑤b the server's belt over base64 — the same verdict as over the bytes, the size exact at every padding
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  const same = [PNG, JPEG, GIF, WEBP, box('heic'), TXT, png(1440, 12000)].every((h) => JSON.stringify(R.judgeImageBase64(b64(h), { limits: CL })) === JSON.stringify(j(h, h.length)));
  const sizes = [1, 2, 3, 4, 5, 100].every((n) => R.bytesOfBase64(b64(new Array(n).fill(7))) === n);
  ok('judgeImageBase64 = judgeImage over the same bytes (the JPEG\'s sides found after its EXIF too); bytesOfBase64 exact at padding 0 / 1 / 2', gateOf(same) && gateOf(sizes) && R.judgeImageBase64('').code === 'empty' && R.judgeImageBase64(null).code === 'empty' && R.judgeImageBase64('!!!!' + b64(PNG)).code === 'not_image' && R.judgeImageBase64(b64(jpeg(9000, 100)), { limits: CL }).code === 'too_wide');
  const sized = (n) => { const b = Buffer.alloc(n); Buffer.from(PNG).copy(b); return b; };
  ok('a base64 picture one byte over the cap is refused, at the cap taken; the belt sums the total it is given', R.judgeImageBase64(sized(FILECAP + 1).toString('base64'), { limits: CL }).code === 'too_big' && gateOf(R.judgeImageBase64(sized(FILECAP).toString('base64'), { limits: CL }).ok) && R.judgeImageBase64(sized(1000).toString('base64'), { total: REQ, limits: CL }).code === 'too_much');
  // ⑤c THE DOOR over real File objects: judged on the head, the refused never read whole, ONE refusal call per hand-over
  const runDoor = async (mod, { held = () => 0, extra = [], limits = () => CL } = {}) => {
    const reads = [], added = [], refusals = [];
    const spy = (f) => ({ name: f.name, size: f.size, slice: (a, b) => f.slice(a, b), arrayBuffer: () => { reads.push(f.name); return f.arrayBuffer(); } });
    const files = [
      new File([new Uint8Array(JPEG)], 'shot.png', { type: 'image/png' }),   // a JPEG named .png
      new File([new Uint8Array(box('heic'))], 'IMG_0001.heic', { type: 'image/heif' }),
      new File([], 'empty.png', { type: 'image/png' }),
      new File([new Uint8Array(TXT)], 'notes.txt', { type: 'text/plain' }),
      new File([sized(FILECAP + 16)], 'big.png', { type: 'image/png' }),
      new File([new Uint8Array(png(1440, 12000))], 'page.png', { type: 'image/png' }),
      new File([new Uint8Array(PNG)], '', { type: 'image/png' }),   // a pasted picture has no name
      ...extra,
    ].map((f) => (f.slice ? spy(f) : f));
    const door = mod.createImageDoor({ held, onAdd: (p) => added.push(p), onRefused: (l) => refusals.push(l), limits });
    const r = await door.add(files);
    return { r, reads, added, refusals };
  };
  const runDoorOf = async (mod, limits, files) => { const added = [], refusals = []; await mod.createImageDoor({ onAdd: (p) => added.push(p), onRefused: (l) => refusals.push(l), limits }).add(files); return { added, refusals }; };
  const live = await runDoor(D, { extra: [{ name: 'gone.png', size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('moved')) }), arrayBuffer: () => Promise.reject(new Error('moved')) }] });
  ok('the door takes the two pictures with the types their bytes say (the JPEG named .png is image/jpeg)',
    live.added.length === 2 && live.added[0].mediaType === 'image/jpeg' && live.added[0].base64 === b64(JPEG) && live.added[0].dataUrl === 'data:image/jpeg;base64,' + b64(JPEG) && live.added[1].mediaType === 'image/png' && live.added[1].name === 'image', live.added.map((a) => [a.name, a.mediaType]));
  const codes = live.refusals[0] ? live.refusals[0].map((x) => `${x.name}:${x.code}`).join(' ') : '';
  ok('the six refused, in order, each by name and why — ONE refusal call; a file whose first bytes cannot be read is «could not be read», never «not a picture»',
    live.refusals.length === 1 && codes === 'IMG_0001.heic:heic empty.png:empty notes.txt:not_image big.png:too_big page.png:too_wide gone.png:unreadable', codes);
  ok('a refused file is never read whole (only its first bytes) — the 3.75 MiB + 16 B file never became base64', JSON.stringify(live.reads) === JSON.stringify(['shot.png', '']), live.reads);
  {
    const many = Array.from({ length: 30 }, (_, i) => new File([new Uint8Array(PNG)], `p${i}.png`, { type: 'image/png' }));
    const got = []; let said = 0;
    await D.createImageDoor({ onAdd: (p) => got.push(p), onRefused: () => { said++; } }).add(many);
    ok('thirty pictures in one hand-over: all thirty taken, nothing said (no invented count)', got.length === 30 && said === 0, { got: got.length, said });
  }
  {
    // the message's total: what it already holds (held) + this hand-over's reads, each counted as it is judged
    const pic = (n) => new File([sized(n)], `t${n}.png`, { type: 'image/png' });
    const got = [], said = [];
    const door = D.createImageDoor({ held: () => 24e6 + 1 + D.heldOf(got), onAdd: (p) => got.push(p), onRefused: (l) => said.push(...l), limits: () => CL });
    await door.add([pic(3e6), pic(3e6), pic(10)]);
    ok('with 24 MB (+1 B) held, the first 3 MB picture (4 MB as base64) is taken, the second would pass 32 MB and is refused by name, a small one after it still fits',
      got.length === 2 && got[0].name === 't3000000.png' && got[1].name === 't10.png' && said.length === 1 && said[0].code === 'too_much', { got: got.map((g) => g.name), said });
  }
  {
    const tt = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, n) => (n in v ? v[n] : `{${n}}`));
    const one = D.refusalText([{ name: 'a.heic', code: 'heic' }], tt);
    const two = D.refusalText([{ name: '', code: 'too_big', size: 4718592, limits: CL }, { name: 'tall.png', code: 'too_wide', width: 1440, height: 12000, limits: CL }], tt);
    ok('the toast words: one file named with its why; several counted, each named; its OWN size or sides with the cap; a pasted picture is «the pasted picture»',
      one === 'Picture not added: a.heic — HEIC pictures cannot be sent — save it as JPEG or PNG first'
      && two === '2 pictures not added: the pasted picture — 4.5 MB — larger than 3.75 MB, the largest picture the model takes · tall.png — 1440 × 12000 pixels — the model takes at most 8000 pixels on a side', [one, two]);
  }
  // ⑤d EVERY ROAD of a picture into the composer goes through the door (the paste, the gallery, the camera's shot)
  const judgeRoads = (src) => {
    const a = src.indexOf('\n  _addImageAttachment('), body = a >= 0 ? src.slice(a, src.indexOf('\n  }\n', a)) : '';
    return {
      paste: /if \(file\) this\._addImageAttachment\(file\);/.test(src),
      gallery: /attachInput\.onchange = \(\) => \{\s*this\._addImageAttachment\(\[\.\.\.attachInput\.files\]\);/.test(src),
      camera: /const camera = cameraDoor\(\(shot\) => this\._addImageAttachment\(shot\)\);/.test(src),
      door: /this\._imageDoor = createImageDoor\(\{/.test(body) && /held: \(\) => heldOf\(this\._attachments\),/.test(body) && /onRefused: \(list\) => showToast\(refusalText\(list, t\), \{ type: 'error' \}\)/.test(body) && /return this\._imageDoor\.add\(/.test(body),
      noRawRead: !/FileReader|readAsDataURL/.test(src) && !/file\.type \|\| 'image\/png'/.test(src),   // stale-pins: kept — an ABSENCE check: the raw read B-c9ed removed
      oneRoad: (src.match(/this\._attachments\.push\(/g) || []).length === 1,
    };
  };
  const roads = judgeRoads(ci);
  ok('the paste, the gallery (one hand-over) and the camera shot all ride _addImageAttachment, which asks THE door with the message\'s held total; no raw FileReader road, no declared-type default', verdictOf(Object.values(roads).every(Boolean)), roads);
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const src = read(f), keys = [...Object.values(R.REFUSAL_WORDS), '{name} — {why}', 'the pasted picture', 'Picture not added: {line}', '{n} pictures not added: {lines}'];
    const miss = keys.filter((k) => !src.includes(`${JSON.stringify(k)}:`));
    ok(`${path.basename(f)} words every refusal and the toast`, !miss.length, miss);
  }
  // ⑤f THE NUMBERS ARE THE HARNESS'S (batch 20 cure, 主开发 08:44Z: «a limit is a row of the harness, never one vendor's number
  // applied to all»): claude's row states the Claude API's three; a harness that states none gets NO numeric cap — the type,
  // the empty file and HEIC stay for everyone
  const ids = Object.keys(BC.BACKEND_CAPS);
  ok('every shipped harness row DECLARES imageLimits (an object of three numbers, or null = states none)', verdictOf(ids.every((id) => 'imageLimits' in BC.BACKEND_CAPS[id] && (BC.BACKEND_CAPS[id].imageLimits === null || ['b64PerPicture', 'sidePx', 'requestB64'].every((k) => BC.BACKEND_CAPS[id].imageLimits[k] > 0)))), ids.map((id) => [id, BC.BACKEND_CAPS[id].imageLimits]));
  ok('claude states the Claude API\'s limits (5 MiB of base64, 8000 px, 32 MB); every other shipped harness states none; no harness named = none', CL.b64PerPicture === 5 * 1024 * 1024 && CL.sidePx === 8000 && CL.requestB64 === 32e6 && gateOf(ids.filter((id) => id !== 'claude').every((id) => BC.imageLimitsOf(id) === null)) && BC.imageLimitsOf(undefined) === null && BC.imageLimitsOf('') === null);
  const PHOTO = 4.6e6, CX = BC.imageLimitsOf('codex');
  ok('THE SAME 4.6 MB phone JPEG: refused for claude (too_big), TAKEN for codex — and a 1440 × 12000 page and a request past 32 MB likewise', j(JPEG, PHOTO).code === 'too_big' && j(JPEG, PHOTO, 0, CX).ok === true && j(png(1440, 12000), 1000, 0, CX).ok === true && j(PNG, 3e6, 40e6, CX).ok === true, [j(JPEG, PHOTO), j(JPEG, PHOTO, 0, CX)]);
  ok('…the type, the empty file and HEIC stay for every harness', j(box('heic'), 1000, 0, CX).code === 'heic' && j(TXT, 1000, 0, CX).code === 'not_image' && j([], 0, 0, CX).code === 'empty');
  const CARRY = R.CARRY_B64;
  ok(`…and VibeSpace's OWN ceiling holds for every harness (its readers' round): a picture that takes the message past ${CARRY / 1048576} MiB of base64 is refused as too_much_here (the hub's own doors), named as VibeSpace's — claude's 32 MB request still answers first`,
    j(PNG, 3e6, CARRY - 4e6 + 1, CX).code === 'too_much_here' && j(PNG, 3e6, CARRY - 4e6, CX).ok === true && j(PNG, 3e6, CARRY - 4e6 + 1).code === 'too_much'
    && R.REFUSAL_WORDS.too_much_here.replace('{carry}', R.refusalVars({}, CX).carry) === "With it, this message's pictures pass 48 MB — the most VibeSpace carries in one message", [j(PNG, 3e6, CARRY - 4e6 + 1, CX), R.refusalVars({}, CX)]);
  {
    const shot = (name) => new File([sized(PHOTO)], name, { type: 'image/jpeg' });
    const jpegHead = (n) => { const b = Buffer.alloc(n); Buffer.from(JPEG).copy(b); return b; };
    const photo = (name) => new File([jpegHead(PHOTO)], name, { type: 'image/jpeg' });
    const cx = await runDoorOf(D, () => CX, [photo('IMG_2041.jpg')]), cl = await runDoorOf(D, () => CL, [photo('IMG_2041.jpg')]);
    const tt = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, n) => (n in v ? v[n] : `{${n}}`));
    ok('the DOOR: the 4.6 MB camera shot becomes a chip in a codex conversation, and in a claude one is refused in ONE toast that names CLAUDE\'s numbers',
      cx.added.length === 1 && !cx.refusals.length && cl.added.length === 0 && cl.refusals.length === 1 && cl.refusals[0][0].code === 'too_big'
      && D.refusalText(cl.refusals[0], tt) === 'Picture not added: IMG_2041.jpg — 4.39 MB — larger than 3.75 MB, the largest picture the model takes', { cx: cx.added.length, cl: cl.refusals, words: cl.refusals[0] && D.refusalText(cl.refusals[0], tt) });
    void shot;
  }
  {
    const cvSrc = read('src/lib/chat-view.js'), rpSrc = read('src/lib/reply-pictures.js'), upSrc = read('src/lib/user-todos-panel.js'), iwSrc = read('src/lib/inbox-window.js');
    ok('WIRING: the composer\'s door judges with ITS conversation\'s harness (chat-view hands the backend in); the For-you boxes with the asking conversation\'s (its key, else its live row)',
      gateOf(/limits: \(\) => imageLimitsOf\(this\._getBackend\(\)\),/.test(ci)) && gateOf(/getBackend: \(\) => \(this\._getSessionIds\(\) \|\| \{\}\)\.backend \|\| null,/.test(cvSrc))
      && gateOf(/limits: \(\) => imageLimitsOf\(typeof backend === 'function' \? backend\(\) : backend\),/.test(rpSrc)) && gateOf(/const key = i\.sessionKey;[^\n]*\n\s+const pics = replyPictures\(\{[^\n]*backend: \(\) => backendOfKey\(key\)/.test(upSrc)) && verdictOf(/return backendOfKey\(it && it\.sessionKey\);/.test(iwSrc)));
    const a = rpSrc.indexOf('export function backendOfKey('), e = rpSrc.indexOf('\n}\n', a);
    const backendOfKey = new Function('harnessOfRecord', `${rpSrc.slice(a + 'export '.length, e + 2)}\nreturn backendOfKey;`)(req('../src/backend-caps.js').harnessOfRecord);   // the ONE rule a row without a harness reads by (cure 2)
    const rows = [{ webuiId: 'sess-9', backend: 'codex' }, { webuiId: 'sess-8' }];
    ok('backendOfKey: a conversation key names its harness; a page-only key reads its live row (a row without one is claude); unknown ⇒ null',
      backendOfKey('codex:th-1', rows) === 'codex' && backendOfKey('claude:abc', rows) === 'claude' && backendOfKey('webui:sess-9', rows) === 'codex' && backendOfKey('webui:sess-8', rows) === 'claude' && backendOfKey('webui:sess-0', rows) === null && backendOfKey('', rows) === null && backendOfKey(null, rows) === null);
  }
  // ⑤e RED controls: the release's composer (the change removed), a door with no rule, a rule with no size cap / no total
  let base = '';
  try { base = execFileSync('git', ['show', 'b06f36e90:src/lib/chat-input.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { base = ''; }
  if (base) { const rb = judgeRoads(base); ok('RED: the release b06f36e90\'s composer (no door, a raw FileReader, image/png by default) fails the roads census', !rb.door && !rb.noRawRead && !rb.gallery, rb); }
  else console.log('  · SKIP: the release b06f36e90 is not in this clone (a shallow checkout) — the RED controls below still run');
  ok('RED: a paste that bypasses the door (a raw push)', !judgeRoads(ci.replace('if (file) this._addImageAttachment(file);', 'if (file) this._attachments.push({ base64: "", mediaType: file.type });')).oneRoad);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-picture-red-'));
  try {
    const ruleAbs = pathToFileURL(path.join(REPO, 'src/image-attach-rule.js')).href;
    const doorSrc = read('src/lib/image-attach.js').replace("from '../image-attach-rule.js'", `from ${JSON.stringify(ruleAbs)}`);
    const noRule = path.join(tmp, 'door-no-rule.mjs');
    fs.writeFileSync(noRule, editAnchor(doorSrc, "const v = judgeImage({ size: file && file.size, head }, { total: (Number(held()) || 0) + inFlight, limits: lim });", "const v = { ok: true, mediaType: file.type || 'image/png', b64: 0 };", "src/lib/image-attach.js"));
    const red = await runDoor(await import(pathToFileURL(noRule).href));
    ok('RED: a door with no rule takes the HEIC, the empty file, the text, the tall page, and reads the big file whole', red.added.length === 7 && gateOf(red.reads.includes('big.png')) && !red.refusals.length, { added: red.added.length, reads: red.reads });
    const ruleSrc = read('src/image-attach-rule.js');
    const noCap = path.join(tmp, 'rule-no-cap.cjs'), noTotal = path.join(tmp, 'rule-no-total.cjs');
    const capLine = "  if (perPicture && b64 > perPicture) return { ok: false, code: 'too_big', size: n };\n", totalLine = "  if (request && (Number(total) || 0) + b64 > request) return { ok: false, code: 'too_much', size: n };\n";
    ok('setup: the size cap and the total are ONE line each in the rule (the mutants below cut them)', ruleSrc.split(capLine).length === 2 && ruleSrc.split(totalLine).length === 2);
    fs.writeFileSync(noCap, editAnchor(ruleSrc, capLine, '', "src/image-attach-rule.js"));
    fs.writeFileSync(noTotal, editAnchor(ruleSrc, totalLine, '', "src/image-attach-rule.js"));
    ok('RED: a rule with no size cap takes the 4.5 MB screenshot claude\'s API refuses', req(noCap).judgeImage({ size: 4.5e6, head: PNG }, { limits: CL }).ok === true);
    ok('RED: a rule with no total takes a picture past claude\'s request size', req(noTotal).judgeImage({ size: 3e6, head: PNG }, { total: REQ, limits: CL }).ok === true);
    // batch 20 cure's RED: the release's shape — ONE vendor's numbers for every harness — refuses the codex photo the cure takes
    const allClaude = path.join(tmp, 'rule-claude-for-all.cjs'), perLine = "  const perPicture = limitOf(limits, 'b64PerPicture'), side = limitOf(limits, 'sidePx'), request = limitOf(limits, 'requestB64');\n";
    ok('setup: the rule reads its three numbers on ONE line', ruleSrc.split(perLine).length === 2);
    fs.writeFileSync(allClaude, editAnchor(ruleSrc, perLine, "  const perPicture = limitOf(limits, 'b64PerPicture') || 5 * 1024 * 1024, side = limitOf(limits, 'sidePx') || 8000, request = limitOf(limits, 'requestB64') || 32e6;\n", "src/image-attach-rule.js"));
    ok('RED: a rule that applies the Claude API\'s numbers to a harness that states none refuses the 4.6 MB phone photo codex takes', req(allClaude).judgeImage({ size: 4.6e6, head: JPEG }, { limits: BC.imageLimitsOf('codex') }).code === 'too_big');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
