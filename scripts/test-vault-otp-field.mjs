#!/usr/bin/env node
// THE TWO-STEP NAME FIELD's OWN LIST (fast, PURE + source — lane vault-2fa-pick, 2026-11-17; the owner, from the login card's
// own window: «这里下拉框怎么没用？» — then «只弹出了我截图里那个浏览器的推荐输入，没有vibespace自己的下拉框»). The field named the
// vault's two-step codes through the browser's NATIVE list, which every platform draws as its own suggestion popup: the owner
// read it as the browser's history and found no VibeSpace list (it was the tree's only <datalist>). The field now draws its own (src/lib/vault-otp-field.js over
// PURE src/lib/vault-otp-field-model.js); its Chrome legs are scripts/test-vault-totp-add-chrome.mjs ⑥ (heavy).
//   ① the vault's answer → the names (a malformed or repeated one dropped)
//   ② a row per code by its name, in the typed text's order — typing never empties the list
//   ③ what the list is: loading · locked (never «empty», never «could not be read») · failed · empty · rows
//   ④ a typed name: none · listed · unlisted (said at the field) · unknown (the list not read, failed or locked — nothing said)
//   ⑤ the keys: ↓ opens / moves, ↑ moves, Enter picks only a highlighted row, Escape closes an open list and is TAKEN (an
//      Escape with the list closed is the form's), Tab leaves
//   ⑥ the field in the tree: no native list anywhere in the add door's fields; the browser and the password managers offered
//      nothing; the keys heard at the window's capture (before the tray's and the form's Escape); a press on a row keeps the
//      focus; the three places draw the list (the Vault's add dialog, the card in the tray and in its own window); the voice
//      mark keeps clear of an open list
//   ⑦ RED: a model whose typing empties the list, and one whose Escape is not taken, are each caught
// Run: node scripts/test-vault-otp-field.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'src/lib/vault-otp-field-model.js';
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (typeof name !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name}${detail !== undefined ? '\n    ' + JSON.stringify(detail).slice(0, 700) : ''}`); } };
const M = await import(pathToFileURL(path.join(REPO, MODEL)).href);

const VAULT = { ok: true, state: 'unlocked', entries: [
  { name: 'shop-two-step' }, { name: 'wiki-two-step' }, { name: 'bank-login' },
  { name: 'shop-two-step' },   // a repeat: the first one stands
  null, { at: 1 }, { name: 42 },
] };

/** the legs ①–⑤ over a model `X` → the names of the legs that failed (the RED controls run the same legs over a copy) */
function legs(X, say = ok) {
  const bad = [];
  const leg = (c, name, d) => { if (!c) bad.push(name); say(c, name, d); };
  const E = X.entriesOf(VAULT);
  leg(E.join() === 'shop-two-step,wiki-two-step,bank-login' && X.entriesOf(null).length === 0 && X.entriesOf({ entries: 'x' }).length === 0,
    '① the vault\'s answer → its three names: a repeated name, an element without a name and a non-string name dropped; no answer ⇒ none', E);
  const all = X.rowsOf(E, '');
  leg(all.map((r) => r.name).join() === 'bank-login,shop-two-step,wiki-two-step' && all.every((r) => r.match === false && Object.keys(r).join() === 'name,match'),
    '② nothing typed: a row per code by its NAME (alphabetical) — names only', all);
  const typed = X.rowsOf(E, 'SHOP');
  const inner = X.rowsOf(E, 'two');
  const nothing = X.rowsOf(E, 'zzz');
  const exact = X.rowsOf(E, 'wiki-two-step');
  leg(typed[0].name === 'shop-two-step' && typed[0].match && typed.length === 3 && typed.slice(1).every((r) => !r.match)
    && inner.filter((r) => r.match).map((r) => r.name).join() === 'shop-two-step,wiki-two-step' && inner[2].name === 'bank-login'
    && exact[0].name === 'wiki-two-step' && exact[0].match && nothing.length === 3 && nothing.every((r) => !r.match),
    '② typed text orders the rows (the exact name, then a name it begins, then a name holding it — case-blind) and marks them; it NEVER empties the list', { typed, inner, nothing });
  leg(X.listState({}) === 'loading' && X.listState({ loaded: true, failed: true }) === 'failed'
    && X.listState({ loaded: true, names: [] }) === 'empty' && X.listState({ loaded: true, names: E }) === 'rows'
    && X.listState({ loaded: true, locked: true }) === 'locked' && X.listState({ loaded: true, state: 'locked', names: [] }) === 'locked'
    && X.listState({ loaded: true, state: 'locked', names: E }) === 'rows' && X.listState({ loaded: true, state: 'not_set_up', names: [] }) === 'empty',
    '③ the list is loading · locked (a refused read, or a vault that SAYS locked and lists nothing — said with its Unlock… door) · failed · empty (said, with the «Two-step code…» door — a vault never set up too) · rows (a locked vault that still lists its names)');
  const F = { loaded: true, failed: false, names: E };
  leg(X.typedVerdict(F, '') === 'none' && X.typedVerdict(F, '  ') === 'none' && X.typedVerdict(F, ' bank-login ') === 'listed' && X.typedVerdict(F, 'Bank-Login') === 'unlisted'
    && X.typedVerdict(F, 'no-such-code') === 'unlisted' && X.typedVerdict({ loaded: false }, 'x') === 'unknown' && X.typedVerdict({ loaded: true, failed: true }, 'x') === 'unknown'
    && X.typedVerdict({ loaded: true, locked: true }, 'x') === 'unknown' && X.typedVerdict({ loaded: true, state: 'locked', names: [] }, 'x') === 'unknown'
    && X.typedVerdict({ ...F, reading: true }, 'no-such-code') === 'unknown',
    '④ a typed name: none · listed (the add door\'s rule: the trimmed name, exactly) · unlisted (said at the field) · unknown while the list is unread, failed, locked or being read again (nothing said)');
  const k = (s, key, n = 3) => X.keyStep(s, key, n);
  const d1 = k({ open: false, active: -1 }, 'ArrowDown'), d2 = k({ open: true, active: 2 }, 'ArrowDown'), u1 = k({ open: false, active: -1 }, 'ArrowUp');
  const e1 = k({ open: true, active: 1 }, 'Enter'), e0 = k({ open: true, active: -1 }, 'Enter');
  const x1 = k({ open: true, active: 0 }, 'Escape'), x0 = k({ open: false, active: -1 }, 'Escape'), tb = k({ open: true, active: 1 }, 'Tab'), none = k({ open: false, active: -1 }, 'ArrowDown', 0);
  leg(d1.open && d1.active === 0 && d1.taken && d2.active === 0 && u1.open && u1.active === 2 && e1.pick === 1 && !e1.open && e1.taken && e0.pick === null && !e0.taken
    && !x1.open && x1.taken && x1.pick === null && !x0.taken && !tb.open && !tb.taken && none.open && none.active === -1,
    '⑤ keys: ↓ opens on the first row and wraps, ↑ opens on the last; Enter picks ONLY a highlighted row (none ⇒ the key is the form\'s); Escape closes an OPEN list and is taken, a closed list\'s Escape is the form\'s; Tab leaves', { d1, d2, u1, e1, e0, x1, x0, tb });
  leg(X.typedSettled(E, 'wiki-two-step') && !X.typedSettled(['shop', 'shop-2'], 'shop') && X.typedSettled(['shop', 'shop-2'], 'shop-2') && !X.typedSettled(E, 'no-such') && !X.typedSettled(E, '') && X.typedSettled(E, ' bank-login '),
    '⑤b a listed name typed in FULL that begins no other SETTLES the choice (the list closes — the usual road never has it open over Save); a name that begins a longer one, or none, keeps it open');
  return bad;
}

console.log('①–⑤ the field\'s model (PURE)');
legs(M);

console.log('⑥ the field in the tree');
const row = read('src/lib/vault-login-row.js'), fld = read('src/lib/vault-otp-field.js'), box = read('src/lib/vault-paste-box.js'), voice = read('src/lib/voice-input.js');
/** the CODE of a page file: block and line comments taken out (a comment may name the native list it replaced) */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const fieldsFn = row.slice(row.indexOf('export function loginFields('), row.indexOf('export function loginRefusalWords('));
ok(fieldsFn.length > 400 && !/datalist|setAttribute\(\s*'list'/.test(codeOf(fieldsFn)) && /otpField\(otp, \{ addCode \}\)/.test(fieldsFn) && /otpList: otpPick\.el/.test(fieldsFn) && /field\(t\('Two-step code'\), otpPick\.wrap\)/.test(fieldsFn),
  'the add door\'s fields hold NO native list: the two-step field is the page\'s own (otpField), its list handed to the caller (`otpList`) and the field\'s row holds the field with its mark');
const pageFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js') && !/^i18n-/.test(f));
const lists = pageFiles.filter((f) => /createElement\(\s*['"]datalist|\b(?:el|mk)\(\s*['"]datalist|<datalist|setAttribute\(\s*['"]list['"]/i.test(codeOf(read('src/lib/' + f))));   // made, or a field pointed at one (a sanitizer's tag list names the tag, makes none)
ok(lists.length === 0 && /removeAttribute\('list'\)/.test(fld) && /\['autocomplete', 'off'\]/.test(fld) && /'data-lpignore'/.test(fld) && /'data-1p-ignore'/.test(fld) && /'data-bwignore'/.test(fld) && /setAttribute\('role', 'combobox'\)/.test(fld) && /setAttribute\('role', 'listbox'\)/.test(fld),
  'the browser offers nothing of its own: no `list`, autocomplete off, the password managers\' ignore marks; the field a combobox over a listbox (its own) — no page file makes a <datalist> any more', lists);
ok(/window\.addEventListener\('keydown', [^\n]*\}, true\)/.test(fld) && /if \(st\.taken\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); \}/.test(fld) && /keyStep\(\{ open, active \}, e\.key, rows\.length\)/.test(fld) && /e\.isComposing \|\| e\.keyCode === 229/.test(fld),
  'the keys are heard at the WINDOW\'s capture (before the tray\'s document-capture Escape and the form\'s door), through the model\'s keyStep; a taken key reaches nobody else; a composing key is never read');
ok((fld.match(/addEventListener\('pointerdown', \(e\) => e\.preventDefault\(\)\)/g) || []).length >= 3 && /input\.addEventListener\('click', \(\) => \{ if \(!open\) show\(\); \}\)/.test(fld) && !/input\.addEventListener\('focus'/.test(fld) && /mark\.addEventListener\('click'/.test(fld),   // stale-pins: kept — a deliberate absence check: a focus alone never opens the list
  'opened by a press in the field and by the field\'s own mark (never by a focus alone — a Tab through the optional field leaves the card\'s Save uncovered); a press on a row, the mark or the empty vault\'s door keeps the focus in the field (nothing blurs and closes under it)');
ok(/t\('Two-step codes in this vault'\)/.test(fld) && /t\('No two-step code in this vault yet'\)/.test(fld) && /t\('No two-step code of that name is in this vault — pick one from its list, or add it with «Two-step code…»'\)/.test(fld) && /addCode\(\)/.test(fld),
  'headed in plain words; an empty vault says so with the caller\'s «Two-step code…» door; a typed name that lists nothing is said under the field (the add door\'s own sentence)');
const add = row.slice(row.indexOf('export function showLoginAddDialog('));
const card = box.slice(box.indexOf('function loginBoxEl('), box.indexOf('function totpBoxEl('));
ok(/body\.append\(\.\.\.f\.fields, f\.otpList, f\.hint, err\)/.test(add) && /loginFields\(\{ addCode: \(\) => showTotpAddDialog\(/.test(add) && /f\.otpPick\.added\(r\.name\)/.test(add)
  && /otpRow, f\.otpList, f\.hint/.test(card) && /loginFields\(\{ site, fixed: true, addCode: \(\) => addCode\.click\(\) \}\)/.test(card) && /f\.otpPick\.added\(n\)/.test(card) && !/otpNames/.test(box + row),
  'the three places draw it: the Vault\'s add dialog (its door opens THE 两步验证… dialog, the saved name fills the field) and the card in the tray / its own window (its door is the card\'s «Two-step code…», which moves the box first)');
const css = read('public/style.css');
ok(/if \(!panel\.isConnected\) wrap\.append\(panel\);/.test(fld) && /open = false; active = -1; panel\.remove\(\);/.test(fld) && /\.vault-otp-list \{ position: absolute; left: 0; right: 0; top: calc\(100% \+ 3px\);/.test(css) && !/panel\.hidden = (?:true|false)/.test(fld),
  'THE CURE (主开发 00:02Z): the open list takes NO room in the flow — absolutely placed in the field\'s own box, attached when it opens and removed when it closes — so a press on Save never moves under the pointer (and the follower re-places on the child list)');
ok(/t\('The vault is locked, so its two-step codes cannot be read'\)/.test(fld) && /showUnlock\(\{ then: \(\) => load\(true\) \}\)/.test(fld) && /\/vault_locked\/\.test/.test(fld),
  'a LOCKED vault is said in the list with THE unlock dialog\'s door (the refusal names its door — never «could not be read»); the list reads again after it');
ok(/const my = \+\+gen;/.test(fld) && /if \(my !== gen\) return;/.test(fld) && /added: \(name\) => \{[^\n]*load\(true\); \}/.test(fld),
  'a read already in flight when a code was saved is DROPPED when it lands (a generation) — the list reads again, so «no such name» is never said of the name just saved');
ok(/f\.otpPick\.added\(r\.name\); try \{ refresh\(\); \} catch \{ \} \}/.test(add), 'the add dialog\'s «Two-step code…» door refreshes the Vault window too (the new code listed at once)');
ok(/import \{ afterPointerUp \} from '\.\/blur-commit\.js';/.test(fld) && /afterPointerUp\(closeIfAway\);/.test(fld) && !/(?:window|document)\.addEventListener\(\s*'(?:pointerup|pointercancel|pointermove)'/.test(fld),
  'cure round 2: a POINTER press that moves the focus closes the list only AFTER its click has landed (nothing moves between its down and its up, whatever the placement); a key (Tab) closes it at once');
ok(/const up = below < 120 && above > below;/.test(fld) && /panel\.classList\.toggle\('up', up\);/.test(fld) && /\.vault-otp-list\.up \{ top: auto; bottom: calc\(100% \+ 3px\); \}/.test(css),
  'follow-up: too little room under the field and more above ⇒ the list opens UPWARD, its height capped to that room — a card at a message\'s foot never cuts its rows');
ok(/if \(v === 'unknown' && facts\.reading && !note\.hidden\) \{ note\.style\.visibility = 'hidden';/.test(fld),
  'follow-up: a read in flight keeps a shown note\'s BOX (its words hidden until the read lands) — nothing under the note moves');
ok(/if \(!loading\) load\(true\);/.test(fld) && /facts\.reading = true;/.test(fld) && /if \(facts\.loaded && typedSettled\(facts\.names, input\.value\)\) \{ if \(open\) close\(\);/.test(fld),
  'cure round 2: every opening reads the names again (a code added elsewhere, an unlock); a listed name typed in full settles the choice and closes the list');
ok(/const clipBoxOf = /.test(fld) && /panel\.style\.maxHeight = `\$\{Math\.round\(Math\.max\(72, Math\.min\(220, up \? above : below\)\)\)\}px`;/.test(fld) && /\/paint\|strict\|content\/\.test\(cs\.contain/.test(fld),
  'cure round 2: the open list is capped to the room under the field inside the box that clips it (the chat\'s message contains its paint) — never cut off, never a scrollbar that narrows the dialog');
ok(/if \(e\.key === 'Tab' && !e\.shiftKey && open\) \{/.test(fld) && /KEYED\.set\(door, doorKeys\);/.test(fld) && /panel\.addEventListener\('pointerdown', \(e\) => e\.preventDefault\(\)\);/.test(fld) && /otp\.setAttribute\('aria-labelledby', otpWords\.id\)/.test(fieldsFn + row),
  'cure round 2: Tab reaches the list\'s door (Escape on it closes the list, back to the field); a press anywhere on the list keeps the focus; the field is named by its label\'s words alone');
/** NAMES ARE DRAWN AS TEXT: a stored, synced, person-typed name is never markup */
const namesAsText = (src) => /b\.append\(mk\('span', 'vault-otp-name', r\.name\)\);/.test(src) && /const mk = \(tag, cls, text\) => \{[^\n]*e\.textContent = text;/.test(src) && !/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML/.test(codeOf(src));
const asMarkup = fld.replace("b.append(mk('span', 'vault-otp-name', r.name));", "{ const nm = mk('span', 'vault-otp-name'); nm.innerHTML = r.name; b.append(nm); }");
ok(namesAsText(fld) && asMarkup !== fld && !namesAsText(asMarkup), 'a code\'s name is drawn as TEXT (textContent through mk) — never markup; RED: a patched copy that draws it through innerHTML is caught');
ok(/const KEEP_CLEAR = '[^']*\[data-keep-clear\]:not\(\[hidden\]\)/.test(voice) && /panel\.dataset\.keepClear = ''/.test(fld), 'the voice plugin\'s microphone keeps clear of the OPEN list (it carries [data-keep-clear], which KEEP_CLEAR names) — it never covers the list or takes its press');
console.log('⑦ RED controls — a copy of the model that breaks one law is caught');
const src = read(MODEL);
const MC = mutantCopies('vault-otp-field', REPO);
const mutant = async (from, to, tag) => {
  if (src.split(from).length !== 2) throw new Error('anchor missing: ' + tag);
  return import(pathToFileURL(MC.write(MODEL, src.replace(from, to), tag)).href);
};
const quiet = () => {};
const emptied = await mutant(".map(({ name, band: b }) => ({ name, match: !!q && b < 3 }));", ".filter(({ band: b }) => !q || b < 3).map(({ name, band: b }) => ({ name, match: !!q && b < 3 }));", 'typing-empties');
const redA = legs(emptied, quiet);
ok(redA.length > 0 && redA.every((n) => n.startsWith('②')), 'RED: a list that typing narrows to nothing (the person sees no codes while a wrong name stands) — caught by ②', redA);
const broadLock = await mutant("if (locked || (state === 'locked' && !names.length)) return 'locked';", "if (locked || (state && state !== 'unlocked' && !names.length)) return 'locked';", 'broad-lock');
const redC = legs(broadLock, quiet);
ok(redC.length === 1 && redC[0].startsWith('③'), 'RED: a «locked» that takes any state but unlocked (a vault never set up told to unlock) — caught by ③', redC);
const noEsc = await mutant("if (open) return { open: false, active: -1, pick: null, taken: true };   // the list closes", "if (open) return { open: false, active: -1, pick: null, taken: false };   // the list closes", 'esc-untaken');
const redB = legs(noEsc, quiet);
ok(redB.length === 1 && redB[0].startsWith('⑤'), 'RED: an Escape the open list does not take (the form would close under it) — caught by ⑤', redB);

console.log(failed ? `\nFAILED (${passed} passed, ${failed} failed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
