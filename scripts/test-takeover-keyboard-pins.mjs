#!/usr/bin/env node
// THE TAKEOVER KEYBOARD — §3 WIRING PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-takeover-keyboard.mjs (its DOM-mini scenarios, §2 patched-copy controls and §4 class proof stay there): the live view registers
// the three listeners and acts as the harness does, the composer's line, the words (zh + ja), the dialog wiring, the vault reveal's asks — with
// their text-only NEGATIVE CONTROLS. It reads src/lib/browser-live-window.js, src/lib/chat-input.js, src/lib/app.js, src/lib/utils.js,
// src/lib/terminal.js, src/lib/form-window.js, src/lib/vault-reveal.js, src/lib/i18n-zh.js, src/lib/i18n-ja.js and public/index.html BY NAME,
// so ci.mjs's affected rule selects this suite on a change of any of them.
// Run: node scripts/test-takeover-keyboard-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);

// ═══ §3 WIRING PINS ═══════════════════════════════════════════════════════════
console.log('§3 wiring: the live view registers the three listeners and acts as this harness does; the composer\'s line; the words');
const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const LW = src('src/lib/browser-live-window.js');
ok(/import \{ createKeyboardYield, isEditable, sinkBlurVerdict \} from '\.\/keyboard-yield\.js';/.test(LW) && !/\nfunction isEditable\(/.test(LW) && /const ky = createKeyboardYield\(\{ root, sink: \(\) => sinkNow\(\), drives: \(\) => drivesKeyboard\(\), mine: \(\) => !!st\.claimed && !st\.closed, ownChrome: namesThisView, picture: \(\) => \(xp\.view \? xHost : canvas\) \}\);/.test(LW) && /function sinkNow\(\) \{ return xp\.view && xp\.view\.ime \? xp\.view\.ime : kbd; \}/.test(LW),
  'the live view builds its yield from keyboard-yield.js over its root + sink + picture (ONE isEditable — the view\'s own copy is gone; lane dialog-keys: a press on the picture is the page\'s)');
/** one registration's text: from `document.addEventListener('<ev>', (e) => {` to the end of its call (`\n  }, …);` or a one-liner's `);`) */
const reg = (ev) => { const i = LW.indexOf(`document.addEventListener('${ev}', (e) => {`); if (i < 0) return ''; const nl = LW.indexOf('\n', i); const one = LW.slice(i, nl); if (/\);( \/\/.*)?$/.test(one) && !/\{\s*$/.test(one)) return one; const j = LW.indexOf('\n  }, ', i); const e = j < 0 ? -1 : LW.indexOf('\n', j + 1); return LW.slice(i, e < 0 ? i + 1200 : e); };
const pd = reg('pointerdown'), pu = reg('pointerup'), fi = reg('focusin');
ok(/const held = ky\.dialogOverlays\(\)\.length;\n    const r = ky\.onPointerDown\(e\);\n[\s\S]{0,1200}?\n    \/\/ verify r1: a press on the text box that ALREADY holds the caret \(no focusin follows\) yields right here\n    if \(r === 'noted'\) \{ if \(st\.claimed && !st\.copying && ky\.onPressFocused\(document\.activeElement\) === 'yield'\) \{ releaseHeld\(\); renderKbd\(\); keyboardChanged\(\); \} return; \}\n    if \(r !== 'resumed' && r !== 'press-view'\) return;\n    claimKeyboard\(claimRec\(\)\);\n    if \(r === 'resumed'\) \{ renderKbd\(\); keyboardChanged\(\); \}/.test(pd) && /const a = document\.activeElement; if \(!st\.closed && !st\.copying && iOwn\(\) && a !== kbd && !\(isEditable\(a\) && root\.contains\(a\)\)\) focusSink\(\); \}, 0\);/.test(pd) && /\{ capture: true, passive: true, signal: winInfo\._listenerCtl\?\.signal \}\)/.test(pd),
  'pointerdown (document, capture, passive, the window\'s signal): the press to the yield; inside the view ⇒ re-claim, a resumed yield re-said, the sink after the press\'s own default', pd.slice(0, 600));
ok(/function namesThisView\(el\) \{\n    try \{\n      const named = /.test(LW) && /el\.closest\('\.tab-item\[data-win-id\], \.taskbar-item\[data-win-id\]'\)/.test(LW) && /if \(named\) return named\.dataset\.winId === winInfo\.id;/.test(LW) && /const alone = !ch \|\| !Array\.isArray\(ch\.tabs\) \|\| ch\.tabs\.length < 2;\n      return alone && !!winInfo\.titleBar && winInfo\.titleBar\.contains\(el\);/.test(LW),
  'verify r1 (K3): what NAMES the view outside its root — its own tab / taskbar button (by window id, never another window\'s), its title bar only while it stands alone (a group\'s title bar is shared)');
ok(/ky\.onPointerUp\(e\);/.test(pu) && /\{ capture: true, passive: true, signal: winInfo\._listenerCtl\?\.signal \}\)/.test(pu), 'pointerup (document, capture): the touch tap\'s re-stamp', pu.slice(0, 300));
ok(/if \(!st\.claimed \|\| st\.copying \|\| ownBox\(e\.target\)\) return;/.test(fi) && /const v = ky\.onFocusIn\(e\);\n    if \(v === 'yield'\) \{ releaseHeld\(\); renderKbd\(\); keyboardChanged\(\); return; \}\n    if \(v !== 'reclaim' \|\| !iOwn\(\)\) \{ if \(ky\.yielded\) renderKbd\(\); return; \}[^\n]*\n    st\.reclaims\+\+;\n/.test(fi) && /\}, capture\);/.test(fi) && (fi.match(/showToast/g) || []).length === 1 && /const taken = e\.target;\n    queueMicrotask\(\(\) => \{ const say = ky\.takeCue\(taken\); focusSink\(\); if \(say\) \{ st\.cues\+\+; showToast\(t\('Typing still goes to the browser — click the text box itself to type there'\), \{ duration: 3500 \}\); \} \}\);/.test(fi),
  'focusin (document, capture): every driving view yields to the user\'s press; ONLY the owner reclaims a focus nobody pressed for — silently (the lane-J toast told the user to Hand back, which is no longer true); verify r2 (Q1): the ONE toast is the cue after a reclaim the user\'s own press elsewhere caused', fi.slice(0, 900));
ok(!/press Hand back to type here/.test(LW) && !/lastReclaimHintAt|RECLAIM_HINT_EVERY_MS/.test(LW), '…the reclaim toast and its rate limiter are gone');
{ // verify r1 (K7): the retired pop-up has NO producer left anywhere that ships — a census, not one file (src/, public/, data/bin/)
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const shipped = [...walk('src'), ...walk('data/bin').filter((f) => !/\/(editor|vibespace-status$)/.test(f)), 'public/index.html'].filter((f) => /\.(m?js|html)$|^data\/bin\/[^.]+$/.test(f));
  const RETIRED = ['press Hand back to type here', 'ここで入力するには「戻す」を押してください', '按“交还控制”后才能在这里输入'];
  const hitsIn = (files) => files.filter((f) => { let t = ''; try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return false; } return RETIRED.some((w) => t.includes(w)); });
  const hits = hitsIn(shipped);
  const control = hitsIn(['scripts/test-takeover-keyboard-pins.mjs']).length === 1; // the census sees the words where they ARE (this file names them; lane lg-text-legs-2: the moved census names its own new file)
  ok(shipped.length > 100 && hits.length === 0 && control, `verify r1 (K7): the retired "press Hand back to type here" pop-up (en / ja / zh) has no producer in ${shipped.length} shipped files (control: the census finds them in this suite)`, hits.join(' | '));
}
ok(/import \{ heldReleases \} from '\.\.\/browser-takeover\.js';/.test(LW) && /function releaseHeld\(\) \{ for \(const r of heldReleases\(\[\.\.\.st\.pressed\.values\(\)\]\)\) sendInput\(keyRecord\(r\)\); st\.pressed\.clear\(\); \}/.test(LW),
  'verify r1 (K4): a yield RELEASES in the page what is still held there (PURE heldReleases → the view\'s own input path) before it forgets the held keys');
ok(/const claimRec = \(\) => \(\{ id: winInfo\.id, owns: ownsKeyboard, yielded: yieldedKeyboard \}\);/.test(LW) && /function ownsKeyboard\(\) \{ return keyboardOwnership\(\{ \.\.\.kbFacts\(\), yielded: ky\.yielded, dialog: ky\.dialogHolds \}\)\.owns; \}/.test(LW) && /function drivesKeyboard\(\) \{ return !!st\.claimed && keyboardOwnership\(kbFacts\(\)\)\.owns; \}/.test(LW),
  'the claim: owns() answers false while yielded or while a dialog the user opened holds the keys (so ChatInput / TerminalSession behave normally), yielded() says so');
// the .197 integration: the three pins below read the MERGED lines (browse-yourself's address-row exemption and first-claim caret, lane-pairing r6's wake count)
ok(/if \(first\) \{ st\.claimed = true; st\.sent = 0; st\.pressed\.clear\(\); ky\.reset\('claim'\); claimKeyboard\(claimRec\(\)\); watchDialogs\(\); \}/.test(LW) && /else if \(!ky\.yielded && !ky\.dialogHolds && !ownBox\(document\.activeElement\)\) focusSink\(\);/.test(LW) && /ky\.reset\('release'\); releaseKeyboard\(winInfo\.id\); watchDialogs\(\);/.test(LW) && /ky\.reset\('release'\); keyboardChanged\(\);/.test(LW),
  'a re-render while yielded — or while a dialog the user opened holds the keys — never pulls the focus back; a fresh claim and the release (and a closed window) clear the yield and the dialogs\' watch');
ok(/const dialogHeld = !own && !!st\.claimed && ky\.dialogHolds && !st\.closed;\n    const yielded = !own && st\.claimed && \(yieldedKeyboard\(\) \|\| dialogHeld\);/.test(LW) && /const text = yielded \? yieldChipText\(ky\.whereNow\(document\.activeElement\)\) :/.test(LW) && /if \(kind === 'dialog'\) return t\('Keyboard is in the dialog — it goes back when you answer it'\);/.test(LW) && /document\.addEventListener\('focusout', \(\) => \{ if \(st\.claimed && ky\.yielded\) setTimeout\(\(\) => \{ if \(!st\.closed\) renderKbd\(\); \}, 0\); \}, capture\);/.test(LW) && /priority: key === 'kbd' && st\.claimed && \(ky\.yielded \|\| ky\.dialogHolds\) \? LIVE_BAR_PRIORITY\.badge : LIVE_BAR_PRIORITY\[key\]/.test(LW),
  'the bar says where the keys are while yielded or while a dialog the user opened holds them (in the dialog — they go back when you answer it; the chip patched in place, at the badge\'s fold rank)');
// verify r4 (attack 3): the chip is WRITTEN only on change — a yielded view re-reads it on every focus move (focusout + focusin), and a
// same-text write is a mutation record + an accessibility event (measured: 300 focus moves ⇒ 1 200 records, the words never changing)
ok(/if \(kbdText\.textContent !== text\) kbdText\.textContent = text;\n    if \(kbdChip\.title !== title\) kbdChip\.title = title;/.test(LW), 'verify r4 (attack 3): renderKbd writes the chip\'s words and title only when they CHANGE');
// verify r4 (attack 1, measured): onDocKey ENDS with focusSink() — after any key the sink holds the caret (a <select> that kept the
// focus of a press loses it at the closing key's keyup: its list is closed by then, the next keys are the page's)
ok(/\n    focusSink\(\);\n  \};\n  document\.addEventListener\('keydown', onDocKey, capture\);\n  document\.addEventListener\('keyup', onDocKey, capture\);\n  document\.addEventListener\('keypress', onDocKey, capture\);/.test(LW), 'verify r4 (attack 1): onDocKey ends with focusSink() (keydown / keyup / keypress, capture)');
// verify r4 (attack 7): the socket closing ends the takeover as the server does (viewer-left) — renderMode releases the claim and the yield
ok(/st\.connected = false; renderKbd\(\); syncKeyboard\(\);[^\n]*\n[^\n]*\n[^\n]*\n      if \(st\.mine\) \{ st\.mode = 'watch'; st\.mine = false; st\.holder = null; renderMode\(\); \}/.test(LW), 'verify r4 (attack 7): ws.onclose — the stream down (a transition), then the takeover ended locally: mode watch + renderMode (the claim and its yield released)');
{ // verify r4 (attack 8, the security class): EVERY focusSink() site is guarded — the view owns (iOwn), or not yielded (renderMode), or a
  // transition (settle / moveCaret), or the user's own press on the picture (driving), or a copy of ours; onMessage (the stream) never
  // touches focus — the page has no way to the keys while the user gave them to a text box
  // 2.369.198 integration: the .197 BROWSE YOURSELF rows added four sites the lane's tree never had — the person's own address box's
  // Enter / Escape (`if (driving()) focusSink()`: the person's own key, and only while the person drives), the touch Keyboard button and the
  // H branch of Continue here (the person's own click on our own button) — each read inside its OWN handler, like every other site
  const HEADS = ['\n  const onDocKey', '\n  function ', '\n  document.addEventListener(', '\n  kbd.addEventListener(', '\n  img.addEventListener(', '\n  const renderMode', '\n  addrInput.addEventListener(\'keydown\'', '\n  kbdBtn.onclick = ', '\n  takeBtn.onclick = '];
  const userAct = (ctx) => (/^\n  addrInput\.addEventListener\('keydown'/.test(ctx) && /if \(driving\(\)\) $/.test(ctx)) || /^\n  (kbdBtn|takeBtn)\.onclick = /.test(ctx);
  const sites = []; let i = -1; while ((i = LW.indexOf('focusSink();', i + 1)) >= 0) { if (/function focusSink\(/.test(LW.slice(i - 30, i))) continue; const head = Math.max(...HEADS.map((h) => LW.lastIndexOf(h, i))); const ctx = LW.slice(head, i); sites.push({ at: LW.slice(0, i).split('\n').length, guarded: /iOwn\(\)|!ky\.yielded|!driving\(\)|ky\.settle\(|r\.moveCaret|st\.copying = false/.test(ctx) || userAct(ctx) }); } // (the guard is read inside the site's OWN handler / function)
  // B-b56d cure: a site that NAMES the person's press at the call (`focusSink({ press: true })` — the only form that may take the caret out of a box of the person's window's own) is guarded only inside a press handler: the Keyboard button, the take press, the picture's pointerdown
  for (let j = -1; (j = LW.indexOf('focusSink({ press: true });', j + 1)) >= 0;) { const head = Math.max(...HEADS.map((h) => LW.lastIndexOf(h, j))); const ctx = LW.slice(head, j); sites.push({ at: LW.slice(0, j).split('\n').length, press: true, guarded: userAct(ctx) || /^\n  img\.addEventListener\('pointerdown'/.test(ctx) }); }
  const om = LW.slice(LW.indexOf('  function onMessage(m) {'), LW.indexOf('\n  }\n', LW.indexOf('  function onMessage(m) {')));
  // lane browser-x-in-window: + 4 sites — the X picture's key / paste branches (behind iOwn()) and syncX (behind !ky.yielded)
  ok(sites.length === 22 && sites.every((s) => s.guarded) && om.length > 2000 && !/focusSink\(|\.focus\(/.test(om), `verify r4 (attack 8): every focusSink() site (${sites.length}) is guarded by ownership / not-yielded / a transition / the user's press / a copy of ours; onMessage never focuses`, J(sites.filter((s) => !s.guarded)));
}
{ // verify r2 (H1): the view's transition sync — the same acts as this harness's sync, run on every signal of a transition
  const fnBody = (head) => { const i = LW.indexOf(head); return i < 0 ? '' : LW.slice(i, LW.indexOf('\n  }\n', i) + 4); };
  const sk = fnBody('  function syncKeyboard() {');
  ok(/watchHiders\(!!st\.claimed\);/.test(sk) && /if \(st\.claimed && ky\.settle\(\{ drives: drivesKeyboard\(\), active: document\.activeElement \}\) === 'end'\) \{ claimKeyboard\(claimRec\(\)\); st\.homeless\+\+; if \(!st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \} \}\n      const r = ky\.sync/.test(sk) && /const r = ky\.sync\(\{ owns: !!\(st\.claimed && iOwn\(\)\), yielded: !!\(st\.claimed && yieldedKeyboard\(\)\), dialog: !!\(st\.claimed && ky\.dialogHolds\), active: document\.activeElement \}\);\n      if \(!r\.changed\) return;\n      if \(r\.moveCaret && !st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \}\n      if \(r\.release\) releaseHeld\(\);[^\n]*\n      renderKbd\(\); keyboardChanged\(\);/.test(sk),
    'verify r2 (H1 / H3): syncKeyboard — ky.sync over the live facts; a change redraws the chip and signals the composers at once; keys moving to the page move the CARET to the sink; keys leaving it let go of what is held there', sk.slice(0, 700));
  ok(/handBtn\.onclick = \(\) => \{ if \(st\.claimed\) releaseHeld\(\); send\(\{ type: 'handback', \.\.\.\(Number\.isInteger\(st\.wakes\) && st\.wakes > 0 \? \{ expectWakes: st\.wakes \} : \{\}\) \}\); \};/.test(LW) && /    if \(st\.claimed\) releaseHeld\(\);[^\n]*\n    releaseKeyboard\(winInfo\.id\); st\.claimed = false;/.test(LW),
    'verify r2 (H3): Hand back lets go of the keys held in the page BEFORE the handback is sent (after it this viewer\'s input is refused); a closing window lets go before its socket closes');
  ok(/if \(on\) hiderMo\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['style', 'class', 'hidden'\], subtree: true \}\);/.test(LW) && /if \(n === root \|\| \(n && typeof n\.contains === 'function' && n\.contains\(root\)\)\) \{ syncKeyboard\(\); return; \}/.test(LW)
    && /const offKb = onKeyboardChange\(syncKeyboard\);/.test(LW) && /winInfo\.onResize = \(\) => \{ renderBind\(\); syncKeyboard\(\); \};/.test(LW)
    && /st\.connected = false; renderKbd\(\); syncKeyboard\(\);/.test(LW) && /renderKbd\(\); syncKeyboard\(\);(?: renderPicture\(\);)? \}\n/.test(LW) && /m\.state === 'upstream-closed'\) \{ st\.connected = false; [^\n]*syncKeyboard\(\); \}/.test(LW) && /if \(!st\.connected\) \{ st\.connected = true; st\.reconnects = 0; st\.openAt = Date\.now\(\); syncKeyboard\(\);(?: renderPicture\(\);)? \}/.test(LW),
    'verify r2 (H1): every transition signal reaches syncKeyboard — any hider on the view\'s ancestor line (style / class / hidden, watched while a takeover is ours), another view\'s claim, a chain change, the socket closing, the stream up / down, the first frame');
  ok(/if \(e\.type !== 'keyup' && !st\.copying && ky\.caretOutside\(document\.activeElement\)\) \{\n      e\.preventDefault\(\); e\.stopPropagation\(\); if \(e\.stopImmediatePropagation\) e\.stopImmediatePropagation\(\);\n      st\.strayKeys\+\+; focusSink\(\); renderKbd\(\); keyboardChanged\(\); return;\n    \}/.test(LW) && LW.indexOf('ky.caretOutside(document.activeElement)') < LW.indexOf('const route = keyRoute(e, { appMode: appMode() });'),
    'verify r2 (H1) THE BELT: the owner\'s key while a text box outside holds the caret — dropped (neither box nor page), the caret to the sink, the words redrawn — BEFORE any route (compose / paste included)');
  ok(/function yieldedKeyboard\(\) \{ return !!ky\.yielded && !!st\.claimed && !st\.closed; \}/.test(LW), 'verify r2 (H1): a yield is the takeover\'s while the view is off screen too (the composer\'s line says the browser is still the person\'s)');
}
{ // verify r2 (H5): the sink's blur — a focus that LEFT the document for a frame is taken back, and said (rate-limited)
  const i = LW.indexOf("kbd.addEventListener('blur', () => {"); const bl = i < 0 ? '' : LW.slice(i, LW.indexOf('}, sig);', i));
  ok(/const v = sinkBlurVerdict\(a, \{ sink: kbd, root, body: document\.body \}\);\n      if \(v === 'keep'\) return;/.test(bl) && /const frame = v === 'frame';\n      focusSink\(\);\n      if \(frame\) \{\n        st\.frameReclaims\+\+;/.test(bl) && /now - st\.lastFrameCueAt >= RECLAIM_CUE_MS\) \{ st\.lastFrameCueAt = now; showToast\(t\('Typing still goes to the browser — to type in another page, hand back first'\), \{ duration: 3500 \}\); \}/.test(bl) && !/dialogCue/.test(bl), // lane dialog-keys: the F4 cue at the blur is retired (a dialog is judged at its OPEN)
    'verify r2 (H5): a focus that left the document for a FRAME is taken back by the sink and SAID (rate-limited, the one way that works: hand back first)', bl.slice(0, 600));
}
const CI = src('src/lib/chat-input.js');
ok(/const renderKbdLine = \(\) => \{ const on = keyboardYielded\(\) && document\.activeElement === this\._textarea; if \(this\._kbdLine\.hidden === on\) this\._kbdLine\.hidden = !on; \};/.test(CI) && /this\._offKbdLine = onKeyboardChange\(renderKbdLine\);/.test(CI) && /this\._textarea\.addEventListener\('focus', renderKbdLine\);/.test(CI) && /this\._textarea\.addEventListener\('blur', renderKbdLine\);/.test(CI) && /if \(this\._offKbdLine\) \{ this\._offKbdLine\(\); this\._offKbdLine = null; \}/.test(CI) && /this\._streamStatus, this\._kbdLine, inputWrap,/.test(CI),
  'the composer\'s line: ONE node right above the box, shown while the keys were yielded AND this box holds the focus (the same rule as this harness), unsubscribed at dispose');
ok(/if \(keyboardOwned\(\)\) return;/.test(CI.slice(CI.indexOf('  focus() {'), CI.indexOf('  focus() {') + 400)) && /focus\(\) \{ if \(!keyboardOwned\(\)\) this\.terminal\.focus\(\);/.test(src('src/lib/terminal.js')),
  'ChatInput.focus and TerminalSession.focus still stand down while a view OWNS the keys — the yield reaches them through keyboardOwned()');
const WORDS = ['Keyboard is in the chat box — click the picture to keep using the page', 'Keyboard is in the terminal — click the picture to keep using the page', 'Keyboard is outside the browser — click the picture to keep using the page',
  'You are typing to the agent (you still drive the browser)', 'You pressed a text box outside the browser, so your keys go there. You still drive the browser — the agent waits. Click the picture to type into the page again; Hand back ends the takeover.',
  'While you drive, every key goes to the page. Press a chat box or a terminal to type there instead — the browser stays yours; click the picture to come back (Ctrl+Backslash and Ctrl+Alt+Left/Right stay the app’s).',
  'Typing still goes to the browser — click the text box itself to type there', // verify r2 (Q1): the reclaim cue's census row
  'Typing still goes to the browser — to type in another page, hand back first', // verify r2 (H5): the frame cue's
  'Keyboard is not in a text box — click one to type there, or the picture to use the page', // verify r3 (r2's held): yielded, nothing that takes keys holds the focus
  'Typing still goes to the browser — click the dialog’s buttons to answer it', // verify r3 (F4); lane dialog-keys: said for a dialog that opened BY ITSELF
  'Keyboard is in the dialog — it goes back when you answer it', // lane dialog-keys: the chip while a dialog the user opened holds the keys
  'A dialog you opened has the keyboard: Enter, Escape and typing go to it. When it closes your keys go back where they were — you still drive the browser, the agent waits.'];
const zh = src('src/lib/i18n-zh.js'), ja = src('src/lib/i18n-ja.js');
const miss = WORDS.filter((w) => !(LW + CI).includes(`t('${w}')`) || !zh.includes(JSON.stringify(w) + ':') || !ja.includes(JSON.stringify(w) + ':'));
ok(miss.length === 0 && zh.includes('"键盘在对话框 — 点画面继续操作网页"') && zh.includes('"你在给 agent 打字（浏览器仍由你接管）"'), `the words (${WORDS.length}) are t() literals with zh + ja — "键盘在对话框 — 点画面继续操作网页" · "你在给 agent 打字（浏览器仍由你接管）"`, miss.join(' | '));

{ // lane dialog-keys: THE ANNOUNCEMENT + the view's dialog wiring — the same acts as this harness's world (read off the real files)
  const body = (text, head) => { const i = text.indexOf(head); return i < 0 ? '' : text.slice(i, text.indexOf('\n  }\n', i) + 4); };
  const U = src('src/lib/utils.js'), AP = src('src/lib/app.js');
  const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('function buildShell(')));   // (r3: the shell is createModalShell + its buildShell)
  ok(/export const MODAL_OPEN_EVENT = 'vs-modal-open';/.test(U) && /export function announceModal\(overlay\) \{\n  try \{ document\.dispatchEvent\(new CustomEvent\(MODAL_OPEN_EVENT, \{ detail: \{ overlay \} \}\)\); \}/.test(U)
    && /\n    if \(fh\) fh\.adopt\(overlay\);[^\n]*\n    else if \(hosted\) \{ gone = true; return; \}\n    else \{ overlay\.className = 'dialog-overlay'; overlay\.style\.zIndex = '99998'; document\.body\.appendChild\(overlay\); \}\n    announceModal\(overlay\);/.test(shell) && /if \(fh\) fh\.raise\(\{ opener: by \}\);[^\n]*\n\s*announceModal\(overlay\);/.test(shell), // lane dialog-yield: a form's root goes where its host puts it (its window or its sheet), a decision's onto <body> — announced alike
    'utils.js: createModalShell ANNOUNCES its overlay right after the append (the opening act\'s own task, before the caller focuses anything in it); the event carries the overlay only — no evidence of its own, so a forged one hands nothing the keys');
  const sd = body(AP, '  _showDialog(id) {');
  ok(/document\.getElementById\(id\)\.classList\.remove\('hidden'\);\n    announceModal\(overlay\);/.test(sd) && /hideDialogs\(\) \{ document\.getElementById\('dialog-overlay'\)\.classList\.add\('hidden'\);/.test(AP) && /import \{[^}]*\bannounceModal \} from '\.\/utils\.js';/.test(AP),
    'app.js: the static #dialog-overlay announces when _showDialog shows it; hideDialogs closes it by its class (the dialogs\' watch reads the class)', sd.slice(0, 400));
  // every app modal is announced: the one `.dialog-overlay` the client builds is createModalShell's + index.html's static one
  const walkLib = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkLib(path.join(d, e.name)) : [path.join(d, e.name)]);
  const MAKER = /className\s*=\s*['"`][^'"`]*\bdialog-overlay\b|classList\.add\(\s*['"]dialog-overlay['"]|class=\\?["'][^"']*\bdialog-overlay\b/;
  const makersOf = (files) => files.filter(([, t]) => MAKER.test(t)).map(([f]) => f);
  const libFiles = walkLib('src/lib').filter((f) => f.endsWith('.js')).map((f) => [f, src(f)]);
  const makers = makersOf(libFiles).sort();
  // lane dialog-yield: form-window.js turns a FORM's own root (built and announced by createModalShell) into its sheet when the
  // page crosses into the phone tier — the same element, announced at its birth; it builds no overlay of its own
  ok(JSON.stringify(makers) === '["src/lib/form-window.js","src/lib/utils.js"]' && /root\.className = 'dialog-overlay form-sheet'; root\.style\.zIndex = '99998';/.test(src('src/lib/form-window.js')) && (src('src/lib/form-window.js').match(/className = 'dialog-overlay/g) || []).length === 1 && /<div id="dialog-overlay" class="dialog-overlay hidden">/.test(src('public/index.html')),
    'every app modal is ANNOUNCED: the one `.dialog-overlay` the client builds is createModalShell\'s (src/lib/utils.js) + index.html\'s static #dialog-overlay (app._showDialog) — a hand-rolled overlay would never be judged', makers.join(' | '));
  ok(JSON.stringify(makersOf([...libFiles, ['src/lib/x.js', "const ov = document.createElement('div'); ov.className = 'dialog-overlay my';"]]).sort()) === '["src/lib/form-window.js","src/lib/utils.js","src/lib/x.js"]', 'NEGATIVE CONTROL (a hand-rolled overlay added): the census names its maker');
  const mo = LW.slice(LW.indexOf('  document.addEventListener(MODAL_OPEN_EVENT, (e) => {'), LW.indexOf('  }, { signal: winInfo._listenerCtl?.signal });', LW.indexOf('  document.addEventListener(MODAL_OPEN_EVENT')));
  ok(/import \{ MODAL_OPEN_EVENT \} from '\.\/utils\.js';/.test(LW) && /if \(!st\.claimed \|\| st\.closed\) return;\n    settleDialogs\(\);/.test(mo) && /const v = ky\.onDialogOpen\(ov, \{ active: document\.activeElement \}\);\n    if \(v === 'take'\) \{\n      st\.dialogTakes\+\+;\n      watchDialogs\(\);\n      syncKeyboard\(\);/.test(mo)
    && /if \(a && a !== document\.body && typeof ov\.contains === 'function' && ov\.contains\(a\)\) return;\n        focusDialog\(ov\);\n      \}, 0\);/.test(mo) && /if \(v === 'reclaim' && iOwn\(\) && ky\.dialogCue\(v\)\) \{ st\.dialogCues\+\+; showToast\(t\('Typing still goes to the browser — click the dialog’s buttons to answer it'\), \{ duration: 3500 \}\); \}/.test(mo),
    'the live view: MODAL_OPEN_EVENT (document, the window\'s signal) — settle first, then the yield\'s verdict: take ⇒ the watch armed + the transition (chip, held keys let go) + the focus tick (its first text box / its overlay, never a button); reclaim ⇒ THE owner says it once', mo.slice(0, 700));
  const fdv = body(LW, '  function focusDialog(ov) {');
  ok(/const tgt = dialogFocusTarget\(ov\);\n    try \{ if \(tgt === ov && \(typeof ov\.hasAttribute === 'function' \? !ov\.hasAttribute\('tabindex'\) : ov\.tabIndex == null\)\) ov\.tabIndex = -1; tgt\.focus\(\{ preventScroll: true \}\); \} catch \{ \/\* gone \*\/ \}/.test(fdv) && (LW.match(/dialogFocusTarget\(/g) || []).length === 1,
    'verify r1: ONE door gives a held dialog its own field (its first visible text box, else its overlay with tabIndex -1 — never a button): the take\'s focus tick and the \'older\' return both go through focusDialog', fdv.slice(0, 400));
  const sdv = body(LW, '  function settleDialogs() {');
  ok(/const r = ky\.settleDialogs\(\{ active: document\.activeElement \}\);[^\n]*\n    if \(!r\) return;\n    watchDialogs\(\);/.test(sdv) && /if \(r\.to === 'sink'\) \{ if \(iOwn\(\) && !st\.copying\) focusSink\(\); \}\n    else if \(r\.to === 'older' && r\.el\) focusDialog\(r\.el\);[^\n]*\n    else if \(\(r\.to === 'back' \|\| r\.to === 'yield'\) && r\.el\) \{ try \{ r\.el\.focus\(\{ preventScroll: true \}\); \} catch \{ \/\* gone \*\/ \} \}\n    syncKeyboard\(\);/.test(sdv)
    && /const dialogMo = typeof MutationObserver === 'function' \? new MutationObserver\(\(\) => settleDialogs\(\)\) : null;/.test(LW) && /dialogMo\.observe\(document\.body, \{ childList: true \}\);\n    for \(const ov of ky\.dialogOverlays\(\)\) \{\n      dialogMo\.observe\(ov, \{ attributes: true, attributeFilter: \['class', 'hidden'\] \}\);/.test(LW) && /if \(w\) \{ dialogMo\.observe\(w, \{ attributes: true, attributeFilter: \['class', 'style', 'aria-hidden'\] \}\); if \(w\.parentNode\) dialogMo\.observe\(w\.parentNode, \{ childList: true \}\);/.test(LW)
    && /if \(dialogMo\) dialogMo\.disconnect\(\); \/\/ lane dialog-keys/.test(LW),
    'the live view: ONE MutationObserver, armed only while a dialog holds (the body\'s children + each held overlay\'s class) — any close (an answer, a backdrop press, a script\'s removal, the static overlay\'s class) settles: the sink / the older dialog\'s field / the yield\'s text box, then the transition redraws; disconnected when the window closes', sdv.slice(0, 500));
  ok(/if \(st\.claimed && e\.type === 'keydown' && \(ky\.dialogHolds \|\| keyRoute\(e, \{ appMode: appMode\(\) \}\)\.to === 'app'\)\) ky\.onAppKey\(e\);\n    if \(!iOwn\(\)\)/.test(LW),
    'onDocKey: a key the APP takes (typed into a dialog the person opened, a reserved chord, command mode) stamps the opener in EVERY view BEFORE the owner test; a key the page gets never does');
  const rd = LW.slice(LW.indexOf('  const renderDialog = () => {'), LW.indexOf('  function answerDialog('));
  ok(rd.length > 400 && !/announceModal|MODAL_OPEN_EVENT|dialog-overlay/.test(rd), 'the agent\'s PAGE dialog (the view\'s own Accept / Dismiss bar) is never announced as an app modal — its handling is the view\'s, unchanged');
}

// lane takeover-surface-census: the vault's 「验证是你」 opens in the press's OWN task wherever a press asks for a stored value — Show
// key… (revealAccountKey) asks FIRST while the vault is unlocked and this page holds no window (§1 dialogPassword: asked after the
// hub's refusal it opened a round trip late, and the second password went to the agent's page); the Vault window's 「显示」
// (revealValue) asks before its request
// (lane vault-slow-load: the import line gains sayVaultWait — askRevealPassword's wait is said; the line stays pinned whole)
{ const VR = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  const fnOf = (src, head) => { const a = src.indexOf(head); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a)); };
  const firstLine = (fn) => fn.split('\n').slice(1).find((l) => /\S/.test(l) && !/^\s*\/\//.test(l)) || '';
  const PRE = "  if (!revealLeftMs() && vaultFacts()?.state === 'unlocked' && !(await askRevealPassword())) return null;";
  const asksFirst = (src) => { const f = fnOf(src, 'export async function revealAccountKey('); return firstLine(f) === PRE && f.indexOf(PRE) < f.indexOf('fetchJson('); };
  ok(asksFirst(VR) && /^import \{ vaultWords, vaultFacts, onVaultFacts, sayVaultWait \} from '\.\/vault-unlock\.js';$/m.test(VR), 'vault-reveal.js: Show key… (revealAccountKey) asks 验证是你 FIRST — before any request — while the vault is unlocked and this page holds no window', firstLine(fnOf(VR, 'export async function revealAccountKey(')));
  ok(!asksFirst(VR.replace(PRE + '\n', '')), 'NEGATIVE CONTROL (the pre-lane revealAccountKey: the key asked for first): the pin is red');
  const rv = fnOf(VR, 'export async function revealValue(');
  ok(/^    if \(!revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) return \{ ok: false, code: 'cancelled' \};$/m.test(rv) && rv.indexOf('askRevealPassword()') < rv.indexOf('rvPost('), 'vault-reveal.js: the Vault window\'s 「显示」 (revealValue) asks before its request while this page holds no window', rv.slice(0, 300));

  // q-050 (Fable verify) — THE SECOND LATE-ASK ROAD: on the hub's `reveal_needs_password` (a stale window — a lock→unlock an
  // agent can send, a hub restart, the 5-minute boundary) NEITHER function asks again a round trip late; it forgets the window
  // and returns the refusal, so the NEXT press asks first in its own task (the §1 dialogPassword leg shows a late ask leaks).
  const countAsk = (fn) => (fn.match(/askRevealPassword\(/g) || []).length;
  const acctFn = fnOf(VR, 'export async function revealAccountKey(');
  ok(countAsk(acctFn) === 1 && /forgetReveal\(\);\s*\n\s*return \{ code: 'reveal_needs_password'/.test(acctFn),
    'q-050: revealAccountKey asks 验证是你 ONCE; on the hub\'s refusal it forgets + returns the code — never a round-trip-late ask', acctFn.slice(-260));
  ok(countAsk(fnOf(VR.replace("    forgetReveal();\n    return { code: 'reveal_needs_password', error: revealWords", "    forgetReveal();\n    if (!(await askRevealPassword())) return null;\n    return { code: 'reveal_needs_password', error: revealWords"), 'export async function revealAccountKey(')) === 2,
    'NEGATIVE CONTROL (the pre-fix revealAccountKey asking a round trip late): askRevealPassword appears TWICE — the pin is red');
  const rvFn = fnOf(VR, 'export async function revealValue(');
  ok(/code === 'reveal_needs_password'\) \{ forgetReveal\(\); return \{ ok: false, code: 'reveal_needs_password' \}; \}/.test(rvFn) && !/\bcontinue;/.test(rvFn),
    'q-050: revealValue forgets + RETURNS on a stale window (no continue → no loop back to a late ask)', rvFn.slice(0, 360));
  ok(/\bcontinue;/.test(fnOf(VR.replace("{ forgetReveal(); return { ok: false, code: 'reveal_needs_password' }; }", "{ forgetReveal(); continue; }"), 'export async function revealValue(')),
    'NEGATIVE CONTROL (the pre-fix revealValue looping back with continue): the pin is red');
  ok(/onVaultFacts\(\(f\) => \{ if \(!f \|\| f\.state !== 'unlocked'\) forgetReveal\(\); \}\);/.test(VR),
    'q-050 belt: vault-reveal.js forgets this page\'s reveal window whenever the vault facts are not unlocked — a stale window never reaches a late ask');
  ok(!/onVaultFacts\(\(f\) =>/.test(VR.replace("onVaultFacts((f) => { if (!f || f.state !== 'unlocked') forgetReveal(); });", "")),
    'NEGATIVE CONTROL (no belt subscription): the pin is red');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
