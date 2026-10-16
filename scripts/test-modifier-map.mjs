#!/usr/bin/env node
// THE PRIMARY MODIFIER (lane xpra-mac-modifiers, the owner 2026-10-16: 「根据 host+client 两边自动判断」 — the follow-up of
// inc-mvaddc4m-6m0t / .286): src/lib/modifier-map.js is ONE PURE table — a viewer's primary modifier becomes the host's,
// decided from BOTH platforms (⌘ on a Mac viewer is Ctrl in a Linux / Windows window), never by a setting. Here:
//   §1 the 4 × 4 table, row by row with its reason, against the brief's rule written out independently below
//   §2 platformOf — navigator.userAgentData.platform / navigator.platform / a user agent / node's process.platform
//   §3 applyModifierMap (THE ONLY TRANSFORM) on the key shape and the pointer shape; modifierKeyOf (the ⌘ key itself)
//   §4 RED controls: a mac→linux row that leaves meta, a same-family row that moves anything — the judge catches both
//   §5 the doors: src/lib/xpra-view.js and src/browser-takeover.js (macChord) import this file and call it; macChord's
//      behaviour through the table (a copy whose table answers identity ⇒ ⌘A stays Meta+A); a SECOND modifier table
//      anywhere under src/ is RED (grep-derived, with planted controls)
// The view's packets (Control_L + a, the .286 tap) are test-xpra-client §3d; the real Chrome in an xpra window is
// test-desktop-xpra-window-open §8 (heavy). PURE — no build, no network.
// Run: node scripts/test-modifier-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MM = require('../src/lib/modifier-map.js');
const T = require('../src/browser-takeover.js');
const M = mutantCopies('modifier-map', REPO);

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// THE RULE, written out from the brief (never read back from the module): mac viewer on a non-Mac host ⇒ ⌘ is Ctrl; a
// Ctrl-primary viewer on a Mac host ⇒ Ctrl is ⌘; unknown host = linux; unknown viewer = identity; same family = identity
const P4 = ['mac', 'windows', 'linux', 'unknown'];
const ID = { shift: 'shift', control: 'control', alt: 'alt', meta: 'meta' };
const spec = (viewer, host) => {
  const h = host === 'unknown' ? 'linux' : host;
  if (viewer === 'mac' && h !== 'mac') return { ...ID, meta: 'control' };
  if ((viewer === 'windows' || viewer === 'linux') && h === 'mac') return { ...ID, control: 'meta' };
  return { ...ID };
};
/** Every (viewer, host) of a module's table that breaks the rule — [] = the table IS the rule. */
const judge = (mod) => {
  const bad = [];
  for (const v of P4) for (const h of P4) { const got = mod.primaryModifierMap({ viewer: v, host: h }); if (!same(got, spec(v, h))) bad.push(`${v}>${h}: ${JSON.stringify(got)}`); }
  return bad;
};

console.log('§1 the table: viewer × host, each row with its reason');
{
  const R = MM.PRIMARY_MODIFIER_ROWS;
  ok(R.length === 16 && P4.every((v) => P4.every((h) => R.filter((r) => r.viewer === v && r.host === h).length === 1)), `16 rows, each (viewer, host) of ${P4.join(' / ')} exactly once (${R.length})`);
  for (const r of R) {
    const moves = Object.entries(r.moves).map(([a, b]) => `${a} → ${b}`).join(', ') || 'identity';
    ok(same(MM.primaryModifierMap({ viewer: r.viewer, host: r.host }), spec(r.viewer, r.host)) && typeof r.why === 'string' && r.why.length > 10, `${r.viewer} viewer · ${r.host} host ⇒ ${moves} — ${r.why}`, MM.primaryModifierMap({ viewer: r.viewer, host: r.host }));
  }
  ok(judge(MM).length === 0, 'the judge finds no row of the shipped table off the rule', judge(MM));
  ok(R.every((r) => Object.entries(r.moves).every(([a, b]) => MM.MODIFIERS.includes(a) && MM.MODIFIERS.includes(b) && a !== b)) && R.every((r) => !('alt' in r.moves) && !('shift' in r.moves)), 'a row moves only between modifier names, never alt (Option is NOT AltGr) or shift');
  const m = MM.primaryModifierMap({ viewer: 'mac', host: 'linux' });
  ok(Object.isFrozen(m) && Object.isFrozen(MM.PRIMARY_MODIFIER_ROWS) && MM.PRIMARY_MODIFIER_ROWS.every((r) => Object.isFrozen(r) && Object.isFrozen(r.moves)), 'the table and every map it answers are frozen (no caller edits the one table)');
  ok(same(MM.primaryModifierMap(), ID) && same(MM.primaryModifierMap({ viewer: 'mac' }), spec('mac', 'unknown')) && same(MM.primaryModifierMap({ viewer: 'MacIntel', host: null }), spec('mac', 'linux')), 'no viewer = identity; a Mac viewer with no host named = the Linux row (every xpra display is Linux today); raw platform strings are read through platformOf');
}

console.log('§2 platformOf: what a browser or node says → mac / windows / linux / unknown');
{
  const S = [
    ['macOS', 'mac'], ['MacIntel', 'mac'], ['darwin', 'mac'], ['iPad', 'mac'], ['iPhone', 'mac'], ['iOS', 'mac'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 'mac'],
    ['Windows', 'windows'], ['Win32', 'windows'], ['win32', 'windows'], ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 'windows'],
    ['Linux', 'linux'], ['Linux x86_64', 'linux'], ['linux', 'linux'], ['Chrome OS', 'linux'], ['Chromium OS', 'linux'], ['Android', 'linux'], ['freebsd', 'linux'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 'linux'], ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'linux'],
    ['mac', 'mac'], ['windows', 'windows'], ['linux', 'linux'], ['unknown', 'unknown'], ['', 'unknown'], [null, 'unknown'], [undefined, 'unknown'], ['node', 'unknown'], ['Plan 9', 'unknown'],
  ];
  const off = S.filter(([s, w]) => MM.platformOf(s) !== w).map(([s, w]) => `${JSON.stringify(s)} → ${MM.platformOf(s)} (want ${w})`);
  ok(!off.length, `${S.length} platform strings read right — 'darwin' is a Mac though it holds "win" (${off.join('; ') || 'all'})`, off);
}

console.log('§3 applyModifierMap — the only transform — on the key and the pointer shapes; modifierKeyOf (the ⌘ key itself)');
{
  const mac = MM.primaryModifierMap({ viewer: 'mac', host: 'linux' }), pc2mac = MM.primaryModifierMap({ viewer: 'linux', host: 'mac' }), id = MM.primaryModifierMap({ viewer: 'linux', host: 'linux' });
  const key = Object.freeze({ shift: false, control: false, alt: false, meta: true, altGraph: false, capsLock: true, numLock: false });
  const k1 = MM.applyModifierMap(key, mac);
  ok(same(k1, { shift: false, control: true, alt: false, meta: false, altGraph: false, capsLock: true, numLock: false }) && k1 !== key && key.meta === true, 'the key shape: ⌘ held ⇒ control held, meta not; capsLock / altGraph / numLock pass as they are; the input untouched', k1);
  ok(same(MM.applyModifierMap({ ...key, control: true }, mac), k1), '⌘ AND Ctrl held on a Mac ⇒ control once (two that land on one name hold it once)');
  ok(same(MM.applyModifierMap({ shift: true, control: false, alt: true, meta: true }, mac), { shift: true, control: true, alt: true, meta: false }), '⌘⇧⌥ ⇒ Ctrl+Shift+Alt — shift and alt (Option) stay as pressed');
  const ptr = { shift: false, control: false, alt: false, meta: true };
  ok(same(MM.applyModifierMap(ptr, mac), { shift: false, control: true, alt: false, meta: false }), 'the pointer shape: ⌘+click on a Mac viewer is Ctrl+click on the host');
  ok(same(MM.applyModifierMap({ shift: false, control: true, alt: false, meta: false }, pc2mac), { shift: false, control: false, alt: false, meta: true }), 'a Linux viewer\'s Ctrl+click on a Mac host is ⌘+click');
  ok(same(MM.applyModifierMap(key, id), key) && same(MM.applyModifierMap({}, mac), {}) && same(MM.applyModifierMap(null, mac), {}) && same(MM.applyModifierMap({ meta: true }, null), { meta: true }), 'identity map ⇒ the same state; no mods ⇒ none; no map ⇒ unchanged');
  const K = [
    [{ key: 'Meta', code: 'MetaLeft', keyCode: 91 }, mac, { key: 'Control', code: 'ControlLeft', keyCode: 17 }, '⌘ (left) on a Mac viewer, Linux host ⇒ Control, left'],
    [{ key: 'Meta', code: 'MetaRight', keyCode: 93 }, mac, { key: 'Control', code: 'ControlRight', keyCode: 17 }, '⌘ (right) ⇒ Control, right — the side is kept'],
    [{ key: 'OS', code: 'OSLeft', keyCode: 91 }, mac, { key: 'Control', code: 'ControlLeft', keyCode: 17 }, 'the legacy OS spelling is ⌘ too'],
    [{ key: 'Meta', code: '', keyCode: 91 }, mac, { key: 'Control', code: 'ControlLeft', keyCode: 17 }, 'a ⌘ with no code ⇒ Control, left'],
    [{ key: 'Control', code: 'ControlLeft', keyCode: 17 }, pc2mac, { key: 'Meta', code: 'MetaLeft', keyCode: 91 }, 'Ctrl on a Linux viewer, Mac host ⇒ Meta (⌘)'],
    [{ key: 'Control', code: 'ControlLeft', keyCode: 17 }, mac, null, 'a Mac\'s own Ctrl key is not moved'],
    [{ key: 'Alt', code: 'AltLeft', keyCode: 18 }, mac, null, 'Option is not moved'],
    [{ key: 'Meta', code: 'MetaLeft', keyCode: 91 }, id, null, 'same family: ⌘/Super is not moved'],
    [{ key: 'a', code: 'KeyA', keyCode: 65 }, mac, null, 'a letter is no modifier key'],
    [{ key: 'AltGraph', code: 'AltRight', keyCode: 225 }, mac, null, 'AltGraph rides AltRight: alt, not moved'],
  ];
  for (const [k, map, want, name] of K) ok(same(MM.modifierKeyOf(k, map), want), `modifierKeyOf: ${name}`, MM.modifierKeyOf(k, map));
}

console.log('§4 RED controls — copies of the table the judge must refuse');
{
  const src = read('src/lib/modifier-map.js');
  const ROW = "  row('mac', 'linux', { meta: 'control' },", SAME = "  row('linux', 'windows', {},";
  ok(src.split(ROW).length === 2 && src.split(SAME).length === 2, 'control anchors: the mac→linux row and the linux→windows row are one line each');
  const leaves = M.load('src/lib/modifier-map.js', src.replace(ROW, "  row('mac', 'linux', {},"), 'leaves-meta');
  const bad1 = judge(leaves);
  ok(bad1.length === 1 && /^mac>linux/.test(bad1[0]), `RED: a mac→linux row that leaves meta is refused (${bad1.join('; ')})`, bad1);
  const moves = M.load('src/lib/modifier-map.js', src.replace(SAME, "  row('linux', 'windows', { control: 'meta' },"), 'same-family');
  const bad2 = judge(moves);
  ok(bad2.length === 1 && /^linux>windows/.test(bad2[0]), `RED: a same-family row that moves anything is refused (${bad2.join('; ')})`, bad2);
}

console.log('§5 the doors: both import the one table and call it; macChord reads it; no second modifier table under src/');
{
  const view = read('src/lib/xpra-view.js'), take = read('src/browser-takeover.js'), win = read('src/lib/desktop-app-window.js');
  ok(/^import \{[^}]*\bprimaryModifierMap\b[^}]*\} from '\.\/modifier-map\.js';/m.test(view) && /primaryModifierMap\(\{ viewer: viewerPlatform\(\), host:/.test(view) && (view.match(/applyModifierMap\(/g) || []).length >= 2 && /modifierKeyOf\(e, map\)/.test(view), 'door A: src/lib/xpra-view.js imports modifier-map.js, asks the table per event and applies it to the key AND the pointer (and the modifier key itself)');
  ok(/hostPlatform: \(\) => \(rec && rec\.platform\) \|\| null/.test(win), 'door A\'s host: the desktop-app window hands the view the record\'s platform (null — every xpra display today — reads as Linux)');
  const body = take.slice(take.indexOf('function macChord('), take.indexOf('function copyChordOf('));
  ok(/^const MM = require\('\.\/lib\/modifier-map\.js'\);/m.test(take) && /MM\.primaryModifierMap\(/.test(body) && /MM\.applyModifierMap\(/.test(body) && /MM\.modifierKeyOf\(/.test(body), 'door B: src/browser-takeover.js requires modifier-map.js and macChord asks the table (primaryModifierMap / applyModifierMap / modifierKeyOf)');
  // macChord through the table — the live view's behaviour as before
  const k = T.macChord({ key: 'a', code: 'KeyA', keyCode: 65, metaKey: true }, { viewerMac: true, remoteMac: false });
  ok(k.ctrlKey === true && k.metaKey === false && k.dropText === true && k.rule === 'command', 'macChord: a Mac viewer\'s ⌘A on a Linux browser is Ctrl+A with no text (the command row)', k);
  const mk = T.macChord({ key: 'Meta', code: 'MetaRight', keyCode: 93, metaKey: true }, { viewerMac: true, remoteMac: false });
  ok(mk.key === 'Control' && mk.code === 'ControlRight' && mk.keyCode === 17 && mk.ctrlKey === true && mk.metaKey === false && mk.rule === 'meta-key', 'macChord: the ⌘ key itself is Control (side kept) — the table\'s modifierKeyOf', mk);
  ok(same(T.macChord({ key: 'a', code: 'KeyA', keyCode: 65, metaKey: true }, { viewerMac: true, remoteMac: true }).rule, null) && T.macChord({ key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true }, { viewerMac: false, remoteMac: false }).rule === null, 'macChord: Mac on Mac, and a non-Mac viewer, stay as pressed (identity rows)');
  // CONTROL: the same macChord over a table whose mac→unknown row (the one it asks: it knows only "not a Mac") leaves meta ⇒
  // ⌘A stays Meta+A — macChord IS a caller of the table
  const ROW = "  row('mac', 'unknown', { meta: 'control' },", REQ = "require('./lib/modifier-map.js')";
  ok(read('src/lib/modifier-map.js').split(ROW).length === 2, 'control anchor: the mac→unknown row is one line');
  const mmId = M.write('src/lib/modifier-map.js', read('src/lib/modifier-map.js').replace(ROW, "  row('mac', 'unknown', {},"), 'macchord-id');
  ok(take.split(REQ).length === 2, 'control anchor: browser-takeover requires the table once');
  const T0 = M.load('src/browser-takeover.js', take.replace(REQ, `require(${JSON.stringify(mmId)})`), 'macchord-id');
  const k0 = T0.macChord({ key: 'a', code: 'KeyA', keyCode: 65, metaKey: true }, { viewerMac: true, remoteMac: false });
  ok(k0.metaKey === true && k0.ctrlKey === false && k0.rule === null, 'CONTROL: macChord over a table whose mac→unknown row leaves meta ⇒ ⌘A stays Meta+A (the live view follows the one table)', k0);

  // THE SECOND-TABLE CENSUS: an object entry naming one modifier and valued another (any spelling: meta / ctrl / Super_L /
  // MetaLeft / mod4 …) outside modifier-map.js. A same-modifier pair (ControlLeft: 'Control_L', MetaLeft: 'Super_L') is a
  // spelling, not a map.
  const CANON = { meta: 'meta', super: 'meta', cmd: 'meta', command: 'meta', os: 'meta', mod4: 'meta', control: 'control', ctrl: 'control', alt: 'alt', option: 'alt', mod1: 'alt', shift: 'shift' };
  const NAME = '(meta|super|cmd|command|os|mod4|control|ctrl|alt|option|mod1|shift)', SIDE = '(?:_?(?:left|right|l|r))?';
  const RE = new RegExp(`\\b${NAME}${SIDE}['"\`]?\\s*:\\s*['"\`]${NAME}${SIDE}['"\`]`, 'gi');
  const tables = (text) => [...text.matchAll(RE)].filter((m) => CANON[m[1].toLowerCase()] !== CANON[m[2].toLowerCase()]).map((m) => m[0]);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
  const files = walk(path.join(REPO, 'src')).map((f) => path.relative(REPO, f));
  const hits = files.filter((f) => f !== 'src/lib/modifier-map.js').flatMap((f) => tables(read(f)).map((h) => `${f}: ${h}`));
  ok(files.length > 300 && files.includes('src/lib/xpra-view.js') && files.includes('src/browser-takeover.js') && !hits.length, `no second modifier table anywhere under src/ (${files.length} .js files scanned; ${hits.join(' ; ') || 'none'})`, hits);
  const planted = [
    ["const META_CODES = Object.freeze({ MetaLeft: 'ControlLeft', MetaRight: 'ControlRight' });", 2, 'the pre-lane macChord\'s own code table'],
    ["const SWAP = { meta: 'control', control: 'meta' };", 2, 'a name map'],
    ["const X = { Super_L: 'Control_L' };", 1, 'an X keysym map'],
    ["const Y = { cmd: \"ctrl\", mod4: 'control' };", 2, 'other spellings'],
    ["const OK = { ControlLeft: 'Control_L', MetaLeft: 'Super_L', OSLeft: 'Super_L', shift: 'Shift' };", 0, 'spellings of one modifier (xpra-proto\'s CODE_TO_NAME)'],
  ];
  for (const [text, n, name] of planted) ok(tables(text).length === n, `census control: ${name} ⇒ ${n} hit(s) (${tables(text).join(', ') || 'none'})`);
  ok(tables(read('src/lib/modifier-map.js')).length >= 5, `census control: pointed at modifier-map.js itself it finds the table's own rows (${tables(read('src/lib/modifier-map.js')).length}) — the shape it looks for is the shape the table has`);
}

for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'modifier-map controls: ' })) ok(c.pass, c.name, c.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
