#!/usr/bin/env node
// FIT THE PAGE TO THE VIEW — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-browser-fit.mjs, whose PURE rules, real bridge, keeper and every patched-copy CONTROL (with its
// «control setup» precondition) stay there: ④ the client wiring (the pane reported, the transformed rect, the phone's auto-open
// and its sticky chip), ⑤ the hiders that re-report the pane, ⑥ the trace view's words. Each reads the file it pins BY NAME,
// so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-browser-fit-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };

console.log('— ④ the client wiring: the pane reported, the transformed rect, the phone\'s auto-open and its sticky chip');
{
  const live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/function paneNow\(\) \{ const r = \(xp\.view \? xp\.view\.pane : canvas\)\.getBoundingClientRect\(\);/.test(live) && !/paneNow[^\n]*devicePixelRatio/.test(live), 'the pane is the canvas\'s box (lane browser-x-in-window: the X picture\'s pane while it shows) off getBoundingClientRect (CSS px at net zoom 1) — never multiplied by devicePixelRatio');
  ok(/st\.fitSent = null; reportFit\(\); renderFit\(\);/.test(live) && /new ResizeObserver\(\(\) => \{ scheduleReport\(\);/.test(live) && /cro\.observe\(canvas\)/.test(live), 'the pane is reported on every hello and on every settled resize of the canvas');
  ok(/document\.addEventListener\('visibilitychange', scheduleReport,/.test(live) && /const vis = allowed && onScreen\(\) && p\.width >= 1 && p\.height >= 1;/.test(live), 'a hidden view reports itself hidden (it never votes)');
  ok(/const allowed = app\.settings\?\.get\('browser\.fitPageToView'\) !== false;/.test(live) && /app\.settings\?\.on\?\.\('browser\.fitPageToView', onFitSetting\)/.test(live), '`browser.fitPageToView` off: the view never votes (it says it is gone — the page goes back after the grace), live-applied');
  const schema = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
  ok(/'browser\.fitPageToView': \{\n[^]*?type: 'boolean', default: true,/.test(schema), 'the setting exists, default ON (the pre-S4 view is one switch away)');
  ok(/return pointerToDevice\(\{ clientX: ev\.clientX, clientY: ev\.clientY, elRect: rectOf\(img\),/.test(live) && /img\.style\.transform = transformCss\(st\.zoom\);/.test(live) && /img\.style\.transformOrigin = '0 0';/.test(live), 'the pinch is a transform on the picture (origin top-left) and the pointer reads the img\'s rect — the TRANSFORMED rect, so taps map through the zoom');
  ok(/if \(driving\(\)\) \{\n\s+\/\/ takeover: the FIRST finger is the page's[^\n]*\n\s+if \(st\.touches\.size >= 1\) \{ st\.touches\.set\(e\.pointerId, \{ refused: true \}\); pinchHint\(\); return true; \}/.test(live), 'in takeover a second finger is refused with a hint (never forwarded)');
  ok(/if \(app\.isMobile\) return autoOpenOnPhone\(app, prev, digest\);/.test(live) && /export function autoOpenOnPhone\(app, prev, digest\)/.test(live) && /if \(!onScreen\) continue;/.test(live) && /app\.goToWinId\?\.\(w\.id\); toast\(\);/.test(live), 'the PHONE auto-opens the live view (only for the conversation on screen), focused full-screen through goToWinId, with "Back to the chat"');
  ok(/if \(!st\.refreshSent\) \{ st\.refreshSent = true; send\(\{ type: 'refresh' \}\); \}/.test(live) && /t\('Waiting for a picture of the new page…'\)/.test(live) && /t\('No picture came in 10 s/.test(live), 'the picture clocks: a refresh asked once, "Waiting for a picture…" at 2 s, "No picture came in 10 s" + Reconnect');
  ok(/badge: 1, bind: 1, continue: 2, url: 2, open: 2, fit: 2, copy: 2, viewers: 3/.test(live) && /bar\.append\(modeBadge, takeBtn, handBtn, contBtn, closeBtn, quitBtn, kbdChip, kbdBtn, echoEl, bindBtn, urlEl, openBtn, viewersEl, recEl, fitChip,/.test(live), 'the fit chip is a bar item folding with the URL at priority 2 (lane I\'s fold; lane live-input: it explains the picture and carries "Fit here" — it outlasts viewers / recording; bind, the window\'s defining act, outlasts it since lane live-bind-door)');
  const css = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
  // lane mask-value-shape (the strip's step two): the phone bar is the strip's two WRAPPING rows — no swipe to scroll a chip off
  const at = css.indexOf('@media (max-width: 768px), (pointer: coarse) and (max-width: 1023px) {\n  .chat-status-bar { flex-wrap: wrap; overflow-x: visible;'), phone = at < 0 ? '' : css.slice(at);
  ok(/\.chat-status-bar > \.chat-status-browser \{ max-width: 46vw; \}/.test(phone.slice(0, 2500)) && /\.chat-status-bar > \.chat-status-browser \.chat-status-browser-text \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/.test(phone.slice(0, 2500)), 'the phone\'s "Agent browser" chip is never off the bar — its own place on the wrapping rows (was sticky at both edges of the swipe bar), its words cut INSIDE it');
  const bar = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  ok(/<span class="chat-status-browser-text">\$\{escHtml\(face \+ String\(shown \|\| ''\)\)\}<\/span>/.test(bar), 'the chip\'s words sit in their own span (the ellipsis target), escHtml kept');
  const st = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/\.browser-live-canvas \{ touch-action: none; \}/.test(st) && /\.browser-live\.picture-stale \.browser-live-img \{/.test(st), 'the canvas takes the phone\'s pinch (touch-action none); a stale picture is dimmed');
}

console.log('— ⑤ verify r1: the order-judged outcome of our own set, the deferred restore, the persisted note, the hider observer');
{
  // the client: the hiders that write the element's style (a desktop switch, the stage) re-report the pane
  const live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/const mo = new MutationObserver\(scheduleReport\); mo\.observe\(winInfo\.element, \{ attributes: true, attributeFilter: \['style', 'class'\] \}\);/.test(live) && /'abort', \(\) => mo\.disconnect\(\)/.test(live), 'a desktop switch (visibility:hidden written on the window element — no resize, no visibilitychange) re-reports the pane: a MutationObserver on the element\'s style/class, released with the window');
  const st2 = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{\n  \.window\.tab-split\.window-active \{ display: flex !important; \}/.test(st2) && !/\n  \.window\.tab-split \{ display: flex !important; \}/.test(st2), 'the phone displays only the ACTIVE split host (unscoped, every split host was displayed and the active window flowed below it — a second browsing conversation\'s live view opened off the screen)');
  const dm = fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8');
  // inc-munl8jkl-gaih: the desktop adds its reason through the one door; the ONE derivation writes the element's style
  const wjf = fs.readFileSync(path.join(REPO, 'src/lib/window.js'), 'utf8'), vvf = fs.readFileSync(path.join(REPO, 'src/lib/view-visibility.js'), 'utf8');
  ok(/_hideWin\(win\) \{\n\s+this\.app\.wm\.setWindowHidden\(win, \{ desktop: true \}\);/.test(dm) && /visibility: box \? 'hidden' : ''/.test(vvf) && /if \(\(el\.style\.visibility \|\| ''\) !== m\.visibility\) el\.style\.visibility = m\.visibility;/.test(wjf), 'control fact: a desktop switch hides a window by writing visibility:hidden on its element\'s STYLE (the desktop\'s reason → the one derivation — the observer\'s trigger)');
}

console.log('— ⑥ verify r1 (continuation): late mirrors, a size the page did not take, the headed agent choice');
{
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(/if \(k === 'viewport'\) return t\('page size'\);/.test(tv) && /"page size": "/.test(zh) && /"page size": "/.test(ja), 'the trace view words the kind ("page size", zh + ja)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
