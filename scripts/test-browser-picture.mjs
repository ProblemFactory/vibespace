#!/usr/bin/env node
// THE PICTURE SWITCH — the fast half (lane browser-x-in-window, design q-026 r1 §2.1 / §3 row B2, 2026-10-23; the owner:
// 「目前 chrome 还是没有被放进 browser 窗口里面」). The real legs (a real Chrome on a real xpra display, the real bundle in a viewer
// Chrome) are scripts/test-browser-x-picture.mjs (heavy). Here, in-process, no browser, no display:
//   §1 THE SOURCE VERDICT (PURE src/browser-picture.js pictureSourceOf): 'x' only for the attach road's live record with its
//      display session; every other road keeps the screencast, with why + the bar's words (the brief's two phrases); the
//      launch host on a record is never "another machine" (MEASURED: `host` names the machine that launched it — this one)
//   §2 THE DISPLAY'S ROWS (the desktop keeper's windows(id) shapes, MEASURED on Chrome 154 + xpra 6.5.4): the holder's X window
//      by its CDP bounds (exact), the lone window, the ambiguity; Chrome's own dialog windows (a GTK chooser: classed, named, in
//      an xpra corral) — never a menu (classless), the GTK leader (10×10), xpra's own windows, a window xpra does not manage;
//      the browser window a dialog is over (the topmost holding its centre); RED controls (no corral rule / no class rule)
//   §3 WHAT THE AGENT IS TOLD: the native sheet's sentence is the dialog watch's (browser-stuck nativeSheetText), a dialog
//      window's names its title; every way out the sentences name passes the page-busy set (the CLI lets exactly those run)
//   §4 THE BAR'S WORDS: every source phrase is a literal t() in the live view with zh + ja; the native sheet's bar words too
//   §5 THE BROWSER FACT CARRIES A PROMPT (the live view's bar read `stuck.state === 'prompt'` the fact never let through):
//      carried, its digest moves with the prompt's id and its native flag; RED control: the pre-lane allowlist drops it
//   §6 THE SIZE SEAT (the xpra relay's sieve): geometry + display size PASS, input / focus / the keymap never — the keymap
//      held, the geometry held while watching and released when the seat becomes 'size'; RED control: a watch seat cuts the
//      geometry the window needs
//   §7 THE SOURCES + THE SEATS: stream-sources' browser-display row owns a display-for-browser id and asks the browser's seat;
//      the desktop bridge knows 'size' (an unknown seat read as 'free' fell to the window engine's no-lease relay — MEASURED:
//      a sizing pane TYPED); the wiring's input policy relays a seated source's input for its driver only
//   §8 THE RELAY'S TICKET (the REAL live-view bridge over a fake upstream): a screencast browser gets none, an agent's token
//      none; the X picture's ticket; seats: a stranger / no pane 'watch', the ruling pane 'size' (+ its `x-seat` record), a
//      smaller pane 'watch', the driver 'active', the handback back to 'size', a closed viewer's ticket dead
//   §9 THE WIRING (source pins): the keeper's three doors, /resolve's `native`, the CLI's stand, the server's one line, the view
// Run: node scripts/test-browser-picture.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocketServer, WebSocket } = require('ws');
const PIC = require('../src/browser-picture.js');
const AT = require('../src/browser-attach.js');
const ST = require('../src/browser-stuck.js');
const BF = require('../src/browser-fact.js');
const XR = require('../src/server/stream-relay-xpra.js');
const SS = require('../src/server/stream-sources.js');
const BS = require('../src/server/browser-stream.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000, step = 20) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; await sleep(step); } return null; };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = scratch('bxpicture'); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

// ═══ §1 THE SOURCE VERDICT ═══
console.log('§1 the source verdict (PURE pictureSourceOf)');
{
  const attach = { profileId: 'bp-a1', launch: 'attach', state: 'ready', displaySession: { id: 'da-x1', display: ':2' }, host: 'this-machine', launchWhy: 'Google Chrome on its own display (xpra)' };
  const v = PIC.pictureSourceOf(attach);
  ok(v.source === 'x' && v.why === 'attach' && v.displaySession === 'da-x1' && v.words === "the browser's own window", `the attach road's live record ⇒ 'x' on its display session, "the browser's own window" (${JSON.stringify(v)})`);
  ok(PIC.isX(v) && !PIC.isX(PIC.pictureSourceOf(null)), 'isX reads the verdict');
  const rows = [
    ['no xpra (the hidden window)', { launch: 'driver', state: 'ready', launchWhy: AT.HIDDEN_WINDOW_WHY }, 'no-display', "the page's picture — this machine has no display"],
    ['a paired machine (hostId)', { ...attach, hostId: 'h-mac' }, 'remote', "the page's picture — the browser runs on another machine"],
    ['the keeper says not local', attach, 'remote', null, { remote: true }],
    ['a driver launch (headless asked / old driver / cloak)', { launch: 'driver', state: 'ready', launchWhy: 'a headless browser was asked for (Settings) — the driver launches it' }, 'driver', "the page's picture — this browser was not started on VibeSpace's display"],
    ['an external CDP browser (no launch road)', { external: true, state: 'ready' }, 'driver', null],
    ['the attach road without its display session', { ...attach, displaySession: null }, 'no-display-session', "the page's picture — the browser's display session is gone"],
    ['the attach road, stopped', { ...attach, state: 'stopped' }, 'not-running', "the page's picture"],
    ['no record', null, 'not-running', "the page's picture"],
  ];
  for (const [name, rec, why, words, ctx] of rows) { const r = PIC.pictureSourceOf(rec, ctx); ok(r.source === 'screencast' && r.why === why && (words === null || r.words === words) && r.displaySession === null, `${name} ⇒ the screencast (${r.why}${words ? `, "${r.words}"` : ''})`, r); }
  ok(PIC.pictureSourceOf({ ...attach, host: 'some-other-name' }).source === 'x', "MEASURED TRAP: a record's `host` names the machine that LAUNCHED it (this one) — never \"another machine\" (only `hostId` is)");
  ok(AT.HIDDEN_WINDOW_WHY.startsWith(PIC.NO_XPRA_WHY_HEAD), `the no-display why is browser-attach's own sentence head ("${PIC.NO_XPRA_WHY_HEAD}")`);
  ok(Object.keys(PIC.SOURCE_WORDS).length === 6 && Object.values(PIC.SOURCE_WORDS).every((w) => typeof w === 'string' && w.length > 10), 'one phrase per why (6)');
}

// ═══ §2 THE DISPLAY'S ROWS ═══
console.log("§2 the display's rows (MEASURED shapes) — the holder's X window, Chrome's own dialog windows");
const DIR = '/tmp/vs-bxw/prof2';
const INST = `google-chrome (${DIR})`;
// three Chrome windows (Target.createTarget newWindow — cascaded +10, the third moved by setWindowBounds 300,120 900×700),
// xpra's corrals around each (the rows keep the client with `frame`), the GTK leader, Chromium's clipboard window
const ROWS = [
  { id: 0x40000f, title: 'bxw page - Google Chrome', instance: INST, cls: 'Google-chrome', x: 300, y: 120, w: 900, h: 700, depth: 2, frame: 0x200010 },
  { id: 0x40000c, title: 'bxw page - Google Chrome', instance: INST, cls: 'Google-chrome', x: 20, y: 20, w: 1050, h: 980, depth: 2, frame: 0x20000c },
  { id: 0x400003, title: 'about:blank - Google Chrome', instance: INST, cls: 'Google-chrome', x: 10, y: 10, w: 1050, h: 980, depth: 2, frame: 0x200006 },
  { id: 0x600001, title: 'chrome', instance: 'chrome', cls: 'Chrome', x: 10, y: 10, w: 10, h: 10, depth: 1 },
  { id: 0x400000, title: 'Chromium clipboard', instance: null, cls: null, x: -100, y: -100, w: 10, h: 10, depth: 1 },
];
{
  const m = PIC.xWindowOf({ bounds: { left: 20, top: 20, width: 1050, height: 980 }, rows: ROWS, profileDir: DIR });
  ok(m.wid === 0x40000c && m.why === 'bounds', `the holder's CDP bounds (20,20 1050×980) name its X window exactly (${m.wid && m.wid.toString(16)})`, m);
  ok(PIC.xWindowOf({ bounds: { left: 300, top: 120, width: 900, height: 700 }, rows: ROWS, profileDir: DIR }).wid === 0x40000f, '…the moved one by its new bounds');
  ok(PIC.xWindowOf({ bounds: { left: 21, top: 20, width: 1050, height: 980 }, rows: ROWS, profileDir: DIR }).wid === null, '…a pixel off is no match (never a guess among several windows)');
  const twins = [...ROWS, { ...ROWS[1], id: 0x400099, frame: 0x200099 }];
  const a = PIC.xWindowOf({ bounds: { left: 20, top: 20, width: 1050, height: 980 }, rows: twins, profileDir: DIR });
  ok(a.wid === null && a.why === 'ambiguous' && same(a.candidates, [0x40000c, 0x400099]), 'two windows with the very bounds ⇒ ambiguous (the keeper moves its window one pixel and asks again)', a);
  ok(PIC.xWindowOf({ bounds: { left: 0, top: 0, width: 1, height: 1 }, rows: [ROWS[2], ROWS[3]], profileDir: DIR }).wid === 0x400003, 'the ONLY browser window of the display is the holder\'s whatever its bounds');
  ok(PIC.xWindowOf({ bounds: null, rows: ROWS.filter((r) => r.instance !== INST), profileDir: DIR }).why === 'no-window', 'no browser window ⇒ none');
  ok(!PIC.isBrowserRow({ ...ROWS[1], instance: 'google-chrome (/elsewhere)' }, DIR), "another profile's Chrome window (another user-data-dir) is never this profile's");
}
const CHOOSER = { id: 0x60000a, title: 'Open File', instance: 'chrome', cls: 'Chrome', x: 63, y: 99, w: 1124, h: 822, depth: 2, frame: 0x20002a }; // GTK: DIALOG, modal, transient-for the browser window (xpra info, MEASURED)
const MENU = { id: 0x400011, title: null, instance: null, cls: null, x: 633, y: 78, w: 445, h: 824, depth: 1 }; // the ⋮ menu: OR, nameless, classless
const WITHDRAWN = { id: 0x60000e, title: 'Print', instance: 'chrome', cls: 'Chrome', x: 0, y: 0, w: 600, h: 400, depth: 1 }; // no corral: xpra does not manage it
const XPRA = { id: 0x200004, title: 'Xpra-FRAME_EXTENTS', instance: 'xpra', cls: 'Xpra', x: 0, y: 0, w: 200, h: 200, depth: 1, frame: null };
{
  const rows = [CHOOSER, MENU, WITHDRAWN, XPRA, ...ROWS];
  const d = PIC.nativeDialogsOf(rows, { profileDir: DIR });
  ok(same(d.map((x) => x.wid), [CHOOSER.id]) && d[0].title === 'Open File', `Chrome's own dialog windows: the GTK chooser ("Open File") — never the ⋮ menu, the GTK leader, Chromium's clipboard, xpra's own window, a window xpra does not manage (${d.map((x) => x.title).join(', ')})`, d);
  ok(PIC.nativeDialogOwner(CHOOSER, rows, { profileDir: DIR }) === 0x40000f, 'the dialog is over the TOPMOST browser window holding its centre (xwininfo prints topmost first — the rows\' order)');
  ok(same(PIC.dialogsOver(0x40000f, rows, { profileDir: DIR }).map((x) => x.wid), [CHOOSER.id]) && PIC.dialogsOver(0x40000c, rows, { profileDir: DIR }).length === 0, '…said to THAT holder, never to the one under it');
  ok(same(PIC.dialogsOver(0x400003, [CHOOSER, ROWS[2]], { profileDir: DIR }).map((x) => x.wid), [CHOOSER.id]), 'a lone browser window owns every dialog of the display');
  ok(PIC.dialogsOver(null, rows, { profileDir: DIR }).length === 0, 'no holder window ⇒ nothing said (never a guess)');
  // RED controls: the corral rule and the class rule are load-bearing
  const src = read('src/browser-picture.js');
  const noCorral = src.replace("if (!(num(r.w) >= DIALOG_MIN_W && num(r.h) >= DIALOG_MIN_H) || r.frame == null) continue;", 'if (!(num(r.w) >= DIALOG_MIN_W && num(r.h) >= DIALOG_MIN_H)) continue;');
  const noClass = src.replace("if (!title.trim() || /^Xpra(-|$)/.test(title) || !(r.cls || r.instance)) continue;", 'if (!title.trim() || /^Xpra(-|$)/.test(title)) continue;');
  ok(noCorral !== src && noClass !== src, 'the two control anchors are found');
  fs.writeFileSync(path.join(ROOT, 'pic-nocorral.js'), noCorral); fs.writeFileSync(path.join(ROOT, 'pic-noclass.js'), noClass);
  const A = require(path.join(ROOT, 'pic-nocorral.js')), B = require(path.join(ROOT, 'pic-noclass.js'));
  ok(A.nativeDialogsOf(rows, { profileDir: DIR }).some((x) => x.wid === WITHDRAWN.id), 'CONTROL (RED): without the corral rule a window xpra does not manage (withdrawn) is said as an open dialog');
  ok(B.nativeDialogsOf([{ ...MENU, title: 'Untitled', frame: 0x2000aa }], { profileDir: DIR }).length === 1 && PIC.nativeDialogsOf([{ ...MENU, title: 'Untitled', frame: 0x2000aa }], { profileDir: DIR }).length === 0, 'CONTROL (RED): without the class rule a classless top-level (a menu) is said as a dialog');
}

// ═══ §3 WHAT THE AGENT IS TOLD ═══
console.log('§3 what the agent is told — the native sheet by its title, a dialog window by its title, the ways out');
{
  const rec = ST.promptFromCdp('http-auth', { authChallenge: { origin: 'http://127.0.0.1:9', realm: 'bxw realm', scheme: 'Basic', source: 'Server' } }, { targetId: 'T1', now: 1000, seq: 3 });
  rec.native = true;
  const block = ST.promptBlock(rec, { now: 1500 });
  ok(block.native === true && block.title === 'Sign in' && /^Chrome's own sign-in sheet \("Sign in", "http:\/\/127\.0\.0\.1:9", realm "bxw realm"\) is open on your browser window/.test(block.text) && /you never see them/.test(block.text), 'the native sheet\'s block: native, titled "Sign in", THE sentence (the origin + realm, only a person answers it, the credential never seen)', block);
  const f = PIC.nativeDialogFact({ prompt: block });
  ok(f.kind === 'http-auth' && f.title === 'Sign in' && f.text === block.text, "the fact a verb answers dialog_open with IS the watch's sentence (one place)");
  const plain = { ...rec }; delete plain.native;
  ok(PIC.nativeDialogFact({ prompt: ST.promptBlock(plain, { now: 1500 }) }) === null && /in the live view/.test(ST.promptText(plain)), 'the screencast road\'s held sign-in is no native dialog (its own sentence, as before)');
  const w = PIC.nativeDialogFact({ windows: [{ wid: 0x60000a, title: 'Open File' }] });
  ok(w.kind === 'window' && w.title === 'Open File' && /^A window of Chrome's own, "Open File", is open over your browser window/.test(w.text) && /nothing you send reaches it and no snapshot shows it/.test(w.text), 'a dialog WINDOW is said by its title', w);
  ok(PIC.nativeDialogFact({ prompt: block, windows: [{ wid: 1, title: 'Open File' }] }).kind === 'http-auth', 'the sheet is said before a window');
  ok(PIC.nativeDialogFact({}) === null, 'nothing open ⇒ nothing said');
  for (const t of [block.text, w.text]) {
    const named = [...t.matchAll(/`(?:vibespace-browser )?([a-z-]+)[^`]*`/g)].map((m) => m[1]);
    ok(named.length >= 4 && named.every((v) => ST.busyPasses(v)), `every way out the sentence names still runs (${named.join(', ')} — the page-busy set the CLI lets through)`, named);
  }
  ok(/the sign-in sheet Chrome showed for "http:\/\/127\.0\.0\.1:9" closed in its window at/.test(ST.promptAnsweredNote({ prompt: rec, how: 'window', at: Date.now() })), 'the note after it closed: in its window, the page moved on (who typed what is never known)');
  const pw = ST.promptWords(rec, (k) => k);
  ok(pw.native === true && pw.form === false && pw.dismiss === null && /in its window below/.test(pw.title) && /never sees them/.test(pw.hint), 'the bar\'s words for the native sheet: no form of ours, no Cancel of ours — the sheet is in the picture', pw);
}

// ═══ §4 THE BAR'S WORDS ═══
console.log("§4 the bar's words — literal t() keys with zh + ja");
{
  const live = read('src/lib/browser-live-window.js');
  const dict = (lang) => { const s = read(`src/lib/i18n-${lang}.js`); const m = {}; for (const x of s.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),/gm)) { try { m[JSON.parse(x[1])] = JSON.parse(x[2]); } catch { } } return m; };
  const zh = dict('zh'), ja = dict('ja');
  const keys = [...Object.values(PIC.SOURCE_WORDS), "the page's picture — this conversation's window could not be told apart on the display", 'Connecting to the browser window…', 'The browser window is not available'];
  const missing = keys.filter((k) => !live.includes(`t(${JSON.stringify(k)})`) && !live.includes(`t('${k.replace(/'/g, "\\'")}')`));
  ok(!missing.length, `every source phrase is a LITERAL t() in the live view (${keys.length})`, missing);
  const untranslated = [...keys, 'Chrome asks you to sign in — in its window below', 'Take over and type the username and password into Chrome’s sheet — the agent never sees them'].filter((k) => !zh[k] || !ja[k]);
  ok(!untranslated.length, 'every one has zh + ja', untranslated);
  ok(/\{ const pw = pictureWords\(\); if \(pw\) modeBadge\.title = `\$\{modeBadge\.title\} · \$\{pw\}`; \}/.test(live), "the badge's tooltip carries the source (the bar itself unchanged)");
}

// ═══ §5 THE BROWSER FACT CARRIES A PROMPT ═══
console.log('§5 the browser fact carries a prompt (the bar read a state the fact never let through)');
{
  const view = (stuck) => ({ attachments: [], own: null, input: null, live: null, stuck });
  const pr = { state: 'prompt', prompt: { id: 'prm-t1-3', type: 'http-auth', native: true, origin: 'http://127.0.0.1:9' }, since: 1, profileId: 'bp-a1' };
  const sess = { browserKey: 'bk-00000001', variant: null, pin: null };
  let f = null; try { f = BF.browserFactFor(sess, view(pr)); } catch (e) { f = { err: e.message }; }
  ok(f && f.stuck && f.stuck.state === 'prompt' && f.stuck.prompt.native === true, 'a prompt stands ⇒ the fact carries it (the live view\'s bar reads it)', f);
  const f2 = BF.browserFactFor(sess, view({ ...pr, prompt: { ...pr.prompt, id: 'prm-t1-4' } }));
  const f3 = BF.browserFactFor(sess, view({ ...pr, prompt: { ...pr.prompt, native: false } }));
  const f0 = BF.browserFactFor(sess, view(null));
  ok(f.digest !== f2.digest && f.digest !== f3.digest && f.digest !== f0.digest, 'its digest moves with the prompt\'s id and its native flag (the view re-renders a new sheet)');
  const src = read('src/browser-fact.js');
  const pre = src.replace(" || v.stuck.state === 'prompt')) fact.stuck = v.stuck;", ')) fact.stuck = v.stuck;');
  ok(pre !== src, 'the control anchor is found');
  fs.writeFileSync(path.join(ROOT, 'fact-pre.js'), pre.replace(/require\('\.\//g, `require('${path.join(REPO, 'src')}/`));
  let fp = null; try { fp = require(path.join(ROOT, 'fact-pre.js')).browserFactFor(sess, view(pr)); } catch (e) { fp = { err: e.message }; }
  ok(fp && !fp.err && !fp.stuck, 'CONTROL (RED): the pre-lane allowlist drops the prompt — the live view\'s bar never said it', fp);
}

// ═══ §6 THE SIZE SEAT ═══
console.log("§6 the size seat — the xpra relay's sieve passes the window's geometry, never input");
const pkt = (arr) => XR.rencodePlus(arr); // a whole packet: the 8-byte header + the rencodeplus list (the relay's own encoder)
const typesOf = (b) => { const out = []; for (let x = b || Buffer.alloc(0); x.length >= 8;) { const n = x.readUInt32BE(4); out.push(XR.xpraPacketType(x.subarray(8, 8 + n))); x = x.subarray(8 + n); } return out; };
{
  const bytes = Buffer.concat([pkt(['configure-window', 7, 0, 0, 1298, 814, {}]), pkt(['desktop_size', 1298, 814]), pkt(['key-action', 7, 'u', 1, [], 117, 'u', 30, 0]), pkt(['button-action', 7, 1, 1, [10, 10], []]), pkt(['focus', 7, []]), pkt(['keyboard-config', {}]), pkt(['buffer-refresh', 7, 0, 100, {}, {}]), pkt(['damage-sequence', 1, 7, 10, 10, 0, ''])]);
  const sz = XR.xpraInputSieve().strip(bytes, false, { geometry: true });
  const got = typesOf(sz.relay);
  ok(got.includes('configure-window') && got.includes('desktop_size') && got.includes('buffer-refresh') && got.includes('damage-sequence'), `SIZE: the window's geometry, the display size, the repaint ask and the acks reach xpra (${got.join(', ')})`);
  ok(!got.includes('key-action') && !got.includes('button-action') && !got.includes('focus') && !got.includes('keyboard-config') && sz.dropped === 4, `SIZE: a key, a click, the focus and the keymap never do (${sz.dropped} cut)`, got);
  const sv = XR.xpraInputSieve();
  const w = sv.strip(bytes, false, {});
  ok(!typesOf(w.relay).includes('configure-window') && sv.state().heldGeometry > 0 && sv.state().heldKeymap > 0, 'CONTROL (RED): a WATCH seat cuts the geometry the window needs (held, like the keymap)');
  const g = sv.releaseGeometry();
  ok(same(g.kinds, ['display size', 'window geometry']) && typesOf(g.relay).includes('configure-window') && sv.state().heldKeymap > 0 && sv.state().heldGeometry === 0, 'watch → SIZE releases the held geometry + display size, never the keymap (the keymap waits for a takeover)', g.kinds);
  const relaySrc = read('src/server/stream-relay-xpra.js');
  ok(/else if \(s === 'size'\) \{ allow = false; sizes = true;/.test(relaySrc) && /sieve\.strip\(buf, allow, \{ pinned: pinnedNow\(\), geometry: sizes \}\)/.test(relaySrc) && /else if \(s === 'size'\) \{ const g = sieve\.releaseGeometry\(\);/.test(relaySrc), "the relay applies the seat per packet and releases the held geometry on the way to 'size'");
}

// ═══ §7 THE SOURCES + THE SEATS ═══
console.log('§7 the sources + the seats');
{
  const recs = { 'da-1': { id: 'da-1', kind: 'display-for-browser', forBrowser: 'bp-a1' }, 'app-1': { id: 'app-1', kind: 'app' } };
  const asked = [];
  const keeper = { get: (id) => recs[id] || null, streamTarget: (id) => ({ kind: 'xpra', port: 1 }), noteInput() { } };
  const engine = { noteUserInput() { } };
  const src = SS.create({ vnc: { port: 5900 }, keeper, engine, browserSeat: (id, v) => { asked.push([id, v]); return v === 'xt-driver' ? 'active' : 'watch'; } });
  const b = SS.sourceOf(src, 'da-1'), k = SS.sourceOf(src, 'app-1');
  ok(b.name === 'browser-display' && k.name === 'keeper' && !k.seat, `a display-for-browser id is the browser-display source's, a desktop app's the keeper's (${b.name}, ${k.name})`);
  ok(b.seat('da-1', 'xt-driver') === 'active' && b.seat('da-1', 'xt-other') === 'watch' && same(asked, [['da-1', 'xt-driver'], ['da-1', 'xt-other']]), "its SEAT is the browser's (the live-view relay's ticket verdict)");
  ok(SS.sourceOf(SS.create({ vnc: { port: 5900 }, keeper, engine }), 'da-1').name === 'keeper', 'without the live-view relay wired, the keeper owns it (as before)');
  const ds = read('src/server/desktop-stream.js');
  ok(/return s === 'active' \|\| s === 'blocked' \|\| s === 'watch' \|\| s === 'size' \? s : 'free';/.test(ds), "the desktop bridge KNOWS 'size' (MEASURED: read as 'free' it fell to the window engine's no-lease relay — a sizing pane typed)");
  const wl = read('src/server/window-live-wiring.js');
  ok(/src\(id\)\.seat \? \(src\(id\)\.seat\(id, viewerId\) === 'active' \? \{ relay: true \} : \{ relay: false, code: 'watch-mode'/.test(wl), "the wiring's input policy relays a SEATED source's input for its driver only — never the window engine's no-lease relay");
  ok(/state: \(id, viewerId\) => \(src\(id\)\.seat \? src\(id\)\.seat\(id, viewerId\)/.test(wl) && /const governed = \(id\) => !own\(id\) && !src\(id\)\.seat &&/.test(wl) && /browserStream\?\.onXSeats\?\.\(\(id\) => stream\.refresh\(id\)\)/.test(wl), "the seat is the source's (never the desktop keeper's election), and a takeover re-seats that display's sockets at once");
}

// ═══ §8 THE RELAY'S TICKET ═══
console.log("§8 the relay's ticket — the REAL live-view bridge over a fake upstream");
{
  const upPort = await freePort();
  const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
  up.on('connection', (ws) => { ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true, viewportWidth: 1280, viewportHeight: 720 })); });
  const set = { attachments: [{ profileId: 'bp-x1', alias: 'xwork', label: 'X', isDefault: true }] };
  let xRoad = true;
  const xCalls = [];
  const keeper = {
    setFor: () => set, list: () => ({ profiles: [{ id: 'bp-x1', label: 'X', dir: '/tmp/x' }] }), streamPortFor: async () => ({ ok: true, port: upPort }),
    setViewportFor: async () => ({ ok: true }),
    pictureSourceFor: () => (xRoad ? { source: 'x', why: 'attach', displaySession: 'da-x1' } : { source: 'screencast', why: 'driver', displaySession: null }),
    xWindowFor: async (pid, o) => { xCalls.push([pid, o]); return xRoad ? { wid: 4194311, why: 'bounds', source: { source: 'x', why: 'attach', displaySession: 'da-x1' } } : { wid: null, why: 'driver', source: { source: 'screencast', why: 'driver' } }; },
    inputStateFor: () => ({ input: 'agent' }),
  };
  let inputState = null;
  keeper.takeover = ({ viewerId }) => { inputState = { input: 'user', takenAt: Date.now(), takenBy: { viewerId } }; return { ok: true, state: inputState }; };
  keeper.handback = () => { const was = inputState; inputState = null; return { ok: true, state: { input: 'agent', handedBackAt: Date.now() }, heldMs: 1, was }; };
  const activeSessions = new Map([['sess-1', { _browserKey: 'bk-0000000a', name: 'one' }]]);
  const bridge = BS.create({ keeper, activeSessions, requestAuthed: (req) => /(^|; )vs=1/.test(String(req.headers.cookie || '')) || /^Bearer vsst_/.test(String(req.headers.authorization || '')), log: { warn() { }, log() { } } });
  const reseated = []; bridge.onXSeats((id) => reseated.push(id));
  const srv = http.createServer((_q, r) => { r.statusCode = 404; r.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PORT = srv.address().port;
  const viewer = (headers = { Cookie: 'vs=1' }) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/browser/stream?session=sess-1&profile=bp-x1`, { headers }); const v = { ws, msgs: [] }; ws.on('message', (d) => { try { v.msgs.push(JSON.parse(d)); } catch { } }); ws.on('error', () => { }); v.last = (t) => v.msgs.filter((m) => m.type === t).at(-1); v.send = (o) => ws.send(JSON.stringify(o)); v.open = new Promise((r) => ws.on('open', r)); return v; };
  const A = viewer(); await A.open; await until(() => A.last('hello'));
  A.send({ type: 'x-ticket' });
  const ta = await until(() => A.last('x-ticket'));
  ok(ta && ta.ok && /^xt-[0-9a-f]{36}$/.test(ta.ticket) && ta.displaySession === 'da-x1' && ta.wid === 4194311 && ta.source.source === 'x', `the X picture's TICKET: a per-viewer secret, its display session and its window (${ta && ta.ticket && ta.ticket.slice(0, 8)}…)`, ta);
  ok(xCalls.length === 1 && xCalls[0][0] === 'bp-x1' && xCalls[0][1].browserKey === 'bk-0000000a', 'the window is asked of the keeper for THIS conversation (its browser key)', xCalls);
  ok(bridge.xSeat('da-x1', 'xt-unknown') === 'watch' && bridge.xSeat('da-OTHER', ta.ticket) === 'watch', "a stranger's socket, or the ticket on another display ⇒ 'watch'");
  ok(bridge.xSeat('da-x1', ta.ticket) === 'watch', "no pane reported yet ⇒ 'watch' (nobody sizes the window)");
  A.send({ type: 'fit', width: 1298, height: 814, dpr: 1, visible: true });
  const seatA = await until(() => (A.last('x-seat') && A.last('x-seat').seat === 'size' ? A.last('x-seat') : null), 3000);
  ok(bridge.xSeat('da-x1', ta.ticket) === 'size' && !!seatA && reseated.includes('da-x1'), "its pane reported ⇒ the RULING pane: 'size' (the geometry only), told to the viewer, the display re-seated");
  const B = viewer(); await B.open; await until(() => B.last('hello'));
  B.send({ type: 'x-ticket' }); const tb = await until(() => B.last('x-ticket'));
  B.send({ type: 'fit', width: 600, height: 400, dpr: 1, visible: true }); await sleep(400);
  ok(tb && tb.ok && tb.ticket !== ta.ticket && bridge.xSeat('da-x1', tb.ticket) === 'watch' && bridge.xSeat('da-x1', ta.ticket) === 'size', "a second, SMALLER pane watches (one ticket each; the largest visible pane rules)");
  A.send({ type: 'takeover' }); await until(() => A.last('mode-ack'));
  ok(bridge.xSeat('da-x1', ta.ticket) === 'active' && bridge.xSeat('da-x1', tb.ticket) === 'watch', "the TAKEOVER (the keeper's input side): the driver 'active', every other ticket 'watch'");
  ok((await until(() => (B.last('x-seat') && B.last('x-seat').seat === 'watch' ? B.last('x-seat') : null))) && (await until(() => (A.last('x-seat') && A.last('x-seat').seat === 'active' ? 1 : null))), 'each viewer is told its seat');
  A.send({ type: 'handback' }); await sleep(300);
  ok(bridge.xSeat('da-x1', ta.ticket) === 'size', "the handback: the ruling pane sizes again ('size')");
  A.ws.close(); await sleep(300);
  ok(bridge.xSeat('da-x1', ta.ticket) === 'watch' && bridge.xSeat('da-x1', tb.ticket) === 'size', "a closed viewer's ticket is dead ('watch'); the remaining pane rules now");
  const Ag = viewer({ Authorization: 'Bearer vsst_agenttoken' }); await Ag.open; await until(() => Ag.last('hello'));
  Ag.send({ type: 'x-ticket' }); const tg = await until(() => Ag.last('x-ticket'));
  ok(tg && !tg.ok && tg.code === 'not_yours', "an AGENT's token never gets the X picture's ticket (its verbs are its own)", tg);
  xRoad = false;
  const C = viewer(); await C.open; await until(() => C.last('hello'));
  C.send({ type: 'x-ticket' }); const tc = await until(() => C.last('x-ticket'));
  ok(tc && !tc.ok && tc.code === 'screencast' && tc.why === 'driver', "a browser on another road gets no ticket: the page's picture (and why)", tc);
  for (const v of [B, Ag, C]) v.ws.close();
  bridge.shutdown(); srv.close(); up.close();
}

// ═══ §8b THE PICTURE SHOWS THE TAB THE VIEW SAYS IT SHOWS (HOTFIX 2026-11-17, the owner's inc-mwl4yeom: «我那个 agent 现在操作两个标签页
//     我却只能看到一个，上面显示有俩，但我切换去 form 那边还是只显示 gmail 页面») ═══
// Every tab VibeSpace opens for a holder opens in a NEW window of its own (src/browser-windows.js). The release's X picture drew ONE
// window chosen when the ticket was minted — the lease's own window first (the keeper) — and nothing re-issued it: the agent's new
// tab, a person's chip, a return from hidden all left the FIRST window on screen until a new viewer attached.
console.log("§8b the picture shows the tab the view says it shows — across windows, without a new viewer (hotfix 2026-11-17)");
{
  const T1 = 'A1'.repeat(16), T2 = 'B2'.repeat(16), T3 = 'C3'.repeat(16); // CDP target ids (32 hex)
  const W = { [T1]: 4194311, [T2]: 4194599, [T3]: 4194887 }; // each tab's OWN X window (the product's rule: a new tab, a new window)
  // ── PURE ──
  const pureRows = (P) => ({
    shown: P.xShownTarget({ watch: { targetId: T1 }, activeTarget: T2 }) === T1 && P.xShownTarget({ watch: null, activeTarget: T2 }) === T2 && P.xShownTarget({}) === null,
    order: JSON.stringify(P.xWindowLookups({ targetId: T2, own: 7, holderTabs: [T1, T2] })) === JSON.stringify([{ targetId: T2 }, { windowId: 7 }, { targetId: T1 }])
      && JSON.stringify(P.xWindowLookups({ own: 7, holderTabs: [T1] })) === JSON.stringify([{ windowId: 7 }, { targetId: T1 }]),
    moved: P.xTicketMoved({ ticketWid: 1, wid: 2 }) && !P.xTicketMoved({ ticketWid: 2, wid: 2 }) && !P.xTicketMoved({ ticketWid: 2, wid: null }),
  });
  const pr = pureRows(PIC);
  ok(pr.shown && pr.order && pr.moved, 'PURE: the tab on show = the watched tab, else the agent\'s (xShownTarget); the keeper reads THAT tab\'s window first, then the lease\'s own window, then its other tabs — no tab named ⇒ the own window first, as before (xWindowLookups); a known, different window re-issues the ticket, the same or an untold one keeps it (xTicketMoved)', pr);
  // ── the RELEASE's rules as the mutants (each the same file with the release's lines) ──
  const Module = require('node:module');
  const compileAt = (rel, from, to) => { const file = path.join(REPO, rel), src = fs.readFileSync(file, 'utf8'); if (src.split(from).length !== 2) throw new Error(`the mutant's anchor moved in ${rel} — update this suite`); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src.replace(from, to), file); return m.exports; };
  const PICrel = compileAt('src/browser-picture.js', "  if (targetId) out.push({ targetId: String(targetId) });\n  if (own != null) out.push({ windowId: own });\n", "  if (own != null) out.push({ windowId: own });\n  if (targetId) out.push({ targetId: String(targetId) });\n");
  ok(!pureRows(PICrel).order, 'RED CONTROL — the release\'s order (the lease\'s own window first): the window of the tab on show is not read first');
  // ── THE REAL LIVE-VIEW BRIDGE over a fake keeper (each tab its own window) and a fake upstream that moves the agent's tab ──
  async function scene(B, { firstOnly = false } = {}) { // firstOnly: the control ends at step (1) — the release never gets past it
    const upPort = await freePort();
    const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
    let upWs = null; up.on('connection', (ws) => { upWs = ws; ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true, viewportWidth: 1280, viewportHeight: 720 })); });
    const tabs = (list, active) => upWs.send(JSON.stringify({ type: 'tabs', tabs: list.map((t, i) => ({ targetId: t, tabId: 't' + i, url: `http://127.0.0.1/p${i}`, title: 'p' + i, active: t === active })) }));
    const keeper = {
      setFor: () => ({ attachments: [{ profileId: 'bp-x1', alias: 'xwork', label: 'X', isDefault: true }] }), list: () => ({ profiles: [{ id: 'bp-x1', label: 'X', dir: '/tmp/x' }] }),
      streamPortFor: async () => ({ ok: true, port: upPort }), setViewportFor: async () => ({ ok: true }), inputStateFor: () => ({ input: 'agent' }),
      pictureSourceFor: () => ({ source: 'x', why: 'attach', displaySession: 'da-x1' }),
      // the keeper's answer for the tab named (its own window); no tab named ⇒ the lease's own window (the first tab's)
      xWindowFor: async (pid, o) => ({ wid: W[o && o.targetId] || W[T1], why: 'bounds', source: { source: 'x', why: 'attach', displaySession: 'da-x1' } }),
      tabOwnersFor: async () => ({ ok: true, owners: { [T1]: 'agent', [T2]: 'agent', [T3]: 'agent' } }),
      watchTabFor: async () => ({ ok: true, close() { } }),
    };
    const activeSessions = new Map([['sess-1', { _browserKey: 'bk-0000000a', name: 'one' }]]);
    const bridge = B.create({ keeper, activeSessions, requestAuthed: (req) => /(^|; )vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } } });
    const srv = http.createServer((_q, r) => { r.statusCode = 404; r.end(); });
    srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}/api/browser/stream?session=sess-1&profile=bp-x1`, { headers: { Cookie: 'vs=1' } });
    const v = { msgs: [] }; ws.on('message', (d) => { try { v.msgs.push(JSON.parse(d)); } catch { } }); ws.on('error', () => { });
    const tickets = () => v.msgs.filter((m) => m.type === 'x-ticket' && m.ok);
    const send = (o) => ws.send(JSON.stringify(o));
    await new Promise((r) => ws.on('open', r)); await until(() => v.msgs.find((m) => m.type === 'hello')); await until(() => upWs);
    const f = {};
    tabs([T1], T1); await sleep(150);
    send({ type: 'x-ticket' }); const t0 = await until(() => tickets()[0]); f.first = t0 && t0.wid;
    send({ type: 'fit', width: 1298, height: 814, dpr: 1, visible: true });
    // (1) THE AGENT'S NEW TAB (its own window) while this viewer watches — the picture follows it, no new viewer
    tabs([T1, T2], T2); const t1 = await until(() => (tickets().length >= 2 ? tickets().at(-1) : null), firstOnly ? 800 : 1500); f.agentTab = t1 ? t1.wid : null;
    if (firstOnly) { ws.close(); bridge.shutdown(); srv.close(); up.close(); return f; }
    // (2) THE PERSON's CHIP: watch the first tab — its window; back to following the agent — the agent's window again
    await until(() => v.msgs.find((m) => m.type === 'tab-owners'), 1500);
    send({ type: 'watch-tab', targetId: T1 }); const t2 = await until(() => (tickets().length >= 3 ? tickets().at(-1) : null), 1500); f.chip = t2 ? t2.wid : null;
    send({ type: 'watch-tab', targetId: null }); const t3 = await until(() => (tickets().length >= 4 ? tickets().at(-1) : null), 1500); f.follow = t3 ? t3.wid : null;
    // (3) A TAB OPENED WHILE THE PAGE IS HIDDEN: the pane reports itself hidden, the agent opens a third tab; on the return the
    //     ticket the page holds already names that tab's window (the socket stays open while hidden)
    send({ type: 'fit', width: 1298, height: 814, dpr: 1, visible: false }); await sleep(100);
    tabs([T1, T2, T3], T3); const t4 = await until(() => (tickets().length >= 5 ? tickets().at(-1) : null), 1500); f.hidden = t4 ? t4.wid : null;
    send({ type: 'fit', width: 1298, height: 814, dpr: 1, visible: true }); await sleep(150);
    // (4) the SAME window keeps its ticket (no re-mount): a tabs record that does not move the active tab issues nothing
    const n = tickets().length; tabs([T1, T2, T3], T3); await sleep(300); f.quiet = tickets().length === n;
    f.held = bridge.xSeat('da-x1', tickets().at(-1) && tickets().at(-1).ticket);
    ws.close(); bridge.shutdown(); srv.close(); up.close();
    return f;
  }
  const real = await scene(BS);
  ok(real.first === W[T1], `the first ticket names the agent's tab's window (${real.first})`, real);
  ok(real.agentTab === W[T2], `(1) THE AGENT'S NEW TAB in its own window, while the viewer watches: a NEW ticket names THAT window (${real.agentTab}) — the picture follows the tab the view says it shows, without a new viewer`, real);
  ok(real.chip === W[T1] && real.follow === W[T2], `(2) A PERSON'S CHIP: watching the first tab ⇒ its window (${real.chip}); following the agent again ⇒ the agent's window (${real.follow})`, real);
  ok(real.hidden === W[T3], `(3) A TAB OPENED WHILE THE PAGE IS HIDDEN: the ticket the page holds on its return names that tab's window (${real.hidden})`, real);
  ok(real.quiet === true && real.held === 'size', `(4) a tabs record that moves nothing issues no ticket (no re-mount of a picture that is right); the last ticket rules the window (${real.held})`, real);
  const BSrel = compileAt('src/server/browser-stream.js', " if (relay.activeTarget !== prevAct) xFollow(relay); }", " }");
  const rel = await scene(BSrel, { firstOnly: true });
  ok(rel.agentTab === null && rel.first === W[T1], `RED CONTROL — the release's ticket rule (no ticket when the agent's tab moves): the agent's new tab leaves the viewer on the FIRST window (${rel.first}; no ticket in 0.8 s)`, rel);
}

// ═══ §8c THE HOTFIX's CURE ROUND (主开发 21:14Z — three musts as laws) ═══
console.log("§8c the follow looks again on a stale answer, draws another holder's window without sizing it, always answers the page (cure r1)");
{
  const T1 = 'A1'.repeat(16), T2 = 'B2'.repeat(16), T3 = 'C3'.repeat(16), T4 = 'D4'.repeat(16), T5 = 'E5'.repeat(16);
  const W1 = 4194311, W2 = 4194599, W5 = 4195175;
  const Module = require('node:module');
  const compileAt = (rel, from, to) => { const file = path.join(REPO, rel), src = fs.readFileSync(file, 'utf8'); if (src.split(from).length !== 2) throw new Error(`the mutant's anchor moved in ${rel} — update this suite`); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src.replace(from, to), file); return m.exports; };
  // PURE — why ONE look is not enough: the keeper's cached rows from before the new window answer the OLD window «confidently»
  // (the only window), and two windows of EQUAL bounds answer none — never a wrong window by bounds
  const row = (id, x) => ({ id, title: 'p - Google Chrome', cls: 'Google-chrome', instance: 'google-chrome (/tmp/x)', x, y: 0, w: 800, h: 600, mapped: true });
  const stale = PIC.xWindowOf({ bounds: { left: 30, top: 0, width: 800, height: 600 }, rows: [row(W1, 0)], profileDir: '/tmp/x' });
  const equal = PIC.xWindowOf({ bounds: { left: 0, top: 0, width: 800, height: 600 }, rows: [row(W1, 0), row(W2, 0)], profileDir: '/tmp/x' });
  ok(stale.wid === W1 && stale.why === 'only-window' && equal.wid == null && equal.why === 'ambiguous', `PURE: a stale row set answers the OLD window as «the only window» (${stale.why}) and two windows of EQUAL bounds answer none (${equal.why}) — the follow must look again, never trust one look`, { stale, equal });
  /** the real bridge over a keeper whose answers the leg scripts: `answer(targetId, fresh, n)` → wid | null; calls counted */
  async function rig(B, answer, { owners = null, delayMs = 0 } = {}) {
    const upPort = await freePort();
    const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
    let upWs = null; up.on('connection', (ws) => { upWs = ws; ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true, viewportWidth: 1280, viewportHeight: 720 })); });
    const calls = [];
    const keeper = {
      setFor: () => ({ attachments: [{ profileId: 'bp-x1', alias: 'xwork', label: 'X', isDefault: true }] }), list: () => ({ profiles: [{ id: 'bp-x1', label: 'X', dir: '/tmp/x' }] }),
      streamPortFor: async () => ({ ok: true, port: upPort }), setViewportFor: async () => ({ ok: true }), inputStateFor: () => ({ input: 'agent' }),
      pictureSourceFor: () => ({ source: 'x', why: 'attach', displaySession: 'da-x1' }),
      xWindowFor: async (pid, o) => { calls.push({ targetId: o && o.targetId, fresh: !!(o && o.fresh), at: Date.now() }); if (delayMs) await sleep(delayMs); const wid = answer(o && o.targetId, !!(o && o.fresh), calls.length); return { wid, why: wid == null ? 'no-match' : 'bounds', source: { source: 'x', why: 'attach', displaySession: 'da-x1' } }; },
      tabOwnersFor: async () => ({ ok: true, owners: owners || { [T1]: 'agent', [T2]: 'agent', [T3]: 'agent', [T4]: 'agent', [T5]: 'agent' } }),
      watchTabFor: async () => ({ ok: true, close() { } }),
    };
    const bridge = B.create({ keeper, activeSessions: new Map([['sess-1', { _browserKey: 'bk-0000000a', name: 'one' }]]), requestAuthed: (req) => /(^|; )vs=1/.test(String(req.headers.cookie || '')), log: { warn() { }, log() { } }, xFollowRetryMs: [30, 60, 90] });
    const srv = http.createServer((_q, r) => { r.statusCode = 404; r.end(); });
    srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}/api/browser/stream?session=sess-1&profile=bp-x1`, { headers: { Cookie: 'vs=1' } });
    const v = { msgs: [] }; ws.on('message', (d) => { try { v.msgs.push(JSON.parse(d)); } catch { } }); ws.on('error', () => { });
    await new Promise((r) => ws.on('open', r)); await until(() => v.msgs.find((m) => m.type === 'hello')); await until(() => upWs);
    const tabs = (list, active) => upWs.send(JSON.stringify({ type: 'tabs', tabs: list.map((t, i) => ({ targetId: t, tabId: 't' + i, url: `http://127.0.0.1/p${i}`, title: 'p' + i, active: t === active })) }));
    const answers = () => v.msgs.filter((m) => m.type === 'x-ticket');
    const send = (o) => ws.send(JSON.stringify(o));
    tabs([T1], T1); await sleep(100);
    send({ type: 'x-ticket' }); await until(() => answers().length >= 1);
    send({ type: 'fit', width: 1298, height: 814, dpr: 1, visible: true }); await sleep(60);
    return { bridge, v, calls, tabs, answers, send, ws, close: () => { ws.close(); bridge.shutdown(); srv.close(); up.close(); } };
  }
  // LAW 1 — THE FOLLOW DOES NOT GIVE UP ON ONE STALE LOOK: the first (cached) look at the agent's new tab answers the OLD window;
  // the fresh look answers its own — the picture moves. Then a tab whose window is never told: SAID (the page's own picture)
  const law1 = async (B) => {
    const R = await rig(B, (t, fresh) => (t === T2 ? (fresh ? W2 : W1) : t === T3 ? null : t === T4 ? W1 : W1));
    const f = {};
    const n0 = R.answers().length;
    R.tabs([T1, T2], T2); const a = await until(() => (R.answers().length > n0 ? R.answers().at(-1) : null), 450); f.moved = a && a.ok ? a.wid : null;
    f.freshLooks = R.calls.filter((c) => c.targetId === T2 && c.fresh).length;
    const n1 = R.answers().length;
    R.tabs([T1, T2, T3], T3); const b = await until(() => (R.answers().length > n1 ? R.answers().at(-1) : null), 700); f.untold = b ? { ok: b.ok, why: b.why } : null;
    f.untoldLooks = R.calls.filter((c) => c.targetId === T3).length;
    R.close();
    return f;
  };
  const l1 = await law1(BS);
  ok(l1.moved === W2 && l1.freshLooks >= 1, `LAW 1 — a STALE first look (the keeper's cached rows answer the old window ${W1} for the agent's new tab): the follow looks again with FRESH rows (${l1.freshLooks}) and the picture moves to its window (${l1.moved})`, l1);
  ok(l1.untold && l1.untold.ok === false && l1.untold.why === 'untold-tab' && l1.untoldLooks === 4, `LAW 1 — a tab whose window is never told: one look + three fresh ones (${l1.untoldLooks}), then SAID («untold-tab» — the page shows its own picture of the tab and says so in its status line), never another tab's window in silence`, l1);
  const BStip = compileAt('src/server/browser-stream.js', '        if (tries < X_FOLLOW_RETRY_MS.length) { // law 1:', '        if (false) { // the tip fecae86de: no second look —');
  const t1 = await law1(BStip);
  ok(t1.moved == null, `RED CONTROL — the tip fecae86de (one look per change): the stale answer is taken as «not moved» and the picture stays on the old window (${JSON.stringify(t1)})`, t1);
  // ONE window holding both tabs (the other road: a page's own window.open): fresh rows confirm the same window ⇒ nothing re-issued, nothing said
  { const R = await rig(BS, (t) => (t === T4 ? W1 : W1)); const n = R.answers().length; R.tabs([T1, T4], T4); await sleep(350); ok(R.answers().length === n, `a tab in the SAME window (fresh rows confirm ${W1}): no ticket re-issued, nothing said (${R.answers().length - n})`); R.close(); }
  // LAW 2 — A VIEWER NEVER SIZES A WINDOW THAT IS NOT ITS HOLDER'S: this pane RULES its holder's window ('size'); a chip on the OTHER
  // conversation's tab draws that window with the WATCH seat (the other agent keeps its window's size)
  const law2 = async (B) => {
    const R = await rig(B, (t) => (t === T5 ? W5 : W1), { owners: { [T1]: 'agent', [T5]: 'other' } });
    const before = R.answers().at(-1);
    const seat0 = R.bridge.xSeat('da-x1', before && before.ticket);
    await until(() => R.v.msgs.find((m) => m.type === 'tab-owners'), 1500);
    const n = R.answers().length; R.send({ type: 'watch-tab', targetId: T5 });
    const a = await until(() => (R.answers().length > n ? R.answers().at(-1) : null), 700);
    const f = { seat0, wid: a && a.wid, told: a && a.seat, bridge: a ? R.bridge.xSeat('da-x1', a.ticket) : null };
    R.close();
    return f;
  };
  const l2 = await law2(BS);
  ok(l2.seat0 === 'size' && l2.wid === W5 && l2.told === 'watch' && l2.bridge === 'watch', `LAW 2 — this pane rules its holder's window (${l2.seat0}); its chip on ANOTHER conversation's tab draws that window ${l2.wid} with the WATCH seat (told ${l2.told}, the bridge ${l2.bridge}) — it never sizes a window that is not its holder's`, l2);
  const BSl2 = compileAt('src/server/browser-stream.js', 'targetId: tid, foreign: foreignOf(relay, viewer, tid), at: now() });', 'targetId: tid, foreign: false, at: now() });');
  const c2 = await law2(BSl2);
  ok(c2.bridge === 'size', `RED CONTROL — without the foreign rule the chip's ticket would SIZE the other conversation's window (${c2.bridge})`, c2);
  // LAW 3 — A FOLLOW NEVER SWALLOWS AN ANSWER THE PAGE WAITS FOR: the page asks again while a slow keeper answers; a follow (the
  // agent moved to a tab in the SAME window) supersedes that ask and finds «not moved» — the page's ask is answered all the same
  const law3 = async (B) => {
    const R = await rig(B, (t) => W1, { delayMs: 140 });
    const n = R.answers().length;
    R.send({ type: 'x-ticket' }); await sleep(10); R.tabs([T1, T4], T4);
    const a = await until(() => (R.answers().length > n ? R.answers().at(-1) : null), 600);
    R.close();
    return { answered: !!a, ok: a && a.ok };
  };
  const l3 = await law3(BS);
  ok(l3.answered && l3.ok, `LAW 3 — the page's own ask, superseded by a follow that found «not moved», is ANSWERED (${JSON.stringify(l3)})`, l3);
  const BSl3 = compileAt('src/server/browser-stream.js', '    if (follow && viewer.xOwed) follow = false;', '    ');
  const c3 = await law3(BSl3);
  ok(!c3.answered, `RED CONTROL — without law 3 the follow swallows the page's ask: no answer comes, the page stays «asking» for good (${JSON.stringify(c3)})`, c3);
  // a BURST of tab flips is ONE keeper ask for the viewer (coalesced); a viewer that LEFT is skipped
  const burst = async (B) => {
    const R = await rig(B, (t) => (t === T2 ? W2 : W1));
    const k0 = R.calls.length;
    for (const t of [T2, T1, T2, T1, T2]) { R.tabs([T1, T2], t); await sleep(3); }
    await until(() => R.answers().some((m) => m.ok && m.wid === W2), 1500); await sleep(100);
    const asks = R.calls.length - k0;
    R.ws.close(); await sleep(100);
    const k1 = R.calls.length; R.tabs([T1, T2], T1); await sleep(180);
    const afterLeft = R.calls.length - k1;
    R.close();
    return { asks, afterLeft };
  };
  const bu = await burst(BS);
  ok(bu.asks === 1 && bu.afterLeft === 0, `five tab flips in a burst are ONE keeper ask for the viewer (${bu.asks}); after the viewer LEFT a flip asks nothing for it (${bu.afterLeft})`, bu);
  const BSco = compileAt('src/server/browser-stream.js', "      if (!v || v.agent || !v.xWanted || relay.viewers.get(v.id) !== v || v.xFollowTimer) continue;\n", "      if (!v || v.agent || !v.xWanted || relay.viewers.get(v.id) !== v) continue; xTicketFor(relay, v, { follow: true }); continue;\n");
  const cbu = await burst(BSco);
  ok(cbu.asks >= 4, `RED CONTROL — uncoalesced, the same burst is ${cbu.asks} keeper asks`, cbu);
  // the page SAYS an untold window in its status line (source pin: the live view's own words, reused)
  const live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/if \(m && m\.why === 'untold-tab'\) \{ xp\.untoldSaid = true; setStatus\(SOURCE_T\.untold\(\)\); \}/.test(live) && /if \(xp\.untoldSaid\) \{ xp\.untoldSaid = false; setStatus\('', \{ hide: true \}\); \}/.test(live),
    'the page says «untold-tab» in its status line (the view\'s own words for an untold window) and takes them back when a ticket comes');
}

// ═══ §9 THE WIRING ═══
console.log('§9 the wiring (source pins)');
{
  const k = read('src/server/browser-keeper.js');
  ok(/pictureSourceFor, xWindowFor, nativeDialogsFor, \/\/ lane browser-x-in-window/.test(k) && /function pictureSourceFor\(profileId\) \{[\s\S]{0,200}PIC\.pictureSourceOf\(rec, \{ remote: !!rec && !isLocalRec\(rec\) \}\)/.test(k), "the keeper's three doors; its verdict is PURE pictureSourceOf over its record (a non-local record is remote)");
  ok(/displayKeeper\.windows\(dsId\)/.test(k) && !/spawn\(|execFile\(/.test(k.slice(k.indexOf('LANE BROWSER-X-IN-WINDOW'), k.indexOf('async function stop(profileId'))), "the display's rows are the desktop keeper's own windows(id) — no spawn of the keeper's here");
  const r = read('src/routes/browser.js');
  ok(/native = require\('\.\.\/browser-picture\.js'\)\.nativeDialogFact\(\{ prompt: fct\.prompt && fct\.prompt\.native \? fct\.prompt : null, windows: !fct\.open && !t\.ephemeral && typeof k\.nativeDialogsFor === 'function' \? await k\.nativeDialogsFor\(t\.profileId, \{ browserKey: t\.browserKey \}\) : \[\] \}\)/.test(r) && /!fct\.prompt && !native && typeof D\.pageAnswers/.test(r) && /\.\.\.\(native \? \{ native \} : \{\}\)/.test(r), "/resolve: the dialog answer carries `native` (the watch's native sheet, else Chrome's dialog windows over THIS conversation's window), said before page_busy");
  const cli = read('data/bin/vibespace-browser');
  ok(/const nativeStand = dlg && dlg\.native && typeof dlg\.native === 'object' \? dlg\.native : null;/.test(cli) && /if \(nativeStand && DS && typeof DS\.busyPasses === 'function' && !DS\.busyPasses\(words0\[0\] \|\| ''\)\) \{\s*printDialogOpen\(\{ open: \{ type: 'native'/.test(cli) && /else if \(promptHit && promptHit\.native\) \{/.test(cli) && /console\.error\('\[native_dialog\]'\);/.test(cli), 'the CLI: a native stand answers a page verb [dialog_open] by name (the ways out run), the in-flight sheet too; `dialog accept|dismiss` cannot answer it');
  const d = read('src/server/browser-dialogs.js');
  ok(/if \(type === 'http-auth' && xRoad\(w\.profileId\)\) \{ rec\.native = true; call\(w, 'Fetch\.continueWithAuth', \{ requestId: String\(p\.requestId \|\| ''\), authChallengeResponse: \{ response: 'Default' \} \}/.test(d) && /const NATIVE_SHEET_PAGE_RE = \/\^chrome-error:/.test(d), "the watch hands the X road's sign-in to Chrome's own sheet (Default) and settles it only on a commit that is not chrome-error://");
  ok(/browserStream, groupsOf:/.test(read('server.js')), 'server.js hands the live-view relay to the window-live wiring (one existing line)');
  const live = read('src/lib/browser-live-window.js');
  ok(/import \{ pictureSourceOf \} from '\.\.\/browser-picture\.js';/.test(live) && /send\(\{ type: 'x-ticket' \}\)/.test(live) && /case 'x-seat':/.test(live) && /canvas\.style\.display = 'none'; xHost\.style\.display = '';/.test(live), 'the live view asks the source, the ticket and its seat, and swaps the canvas for the X picture');
  ok(/if \(H\) \{ if \(xp\.view\) unmountX\(\); return; \}/.test(live) && /if \(H\) return ''; \/\/ BROWSE YOURSELF/.test(live), 'BROWSE YOURSELF keeps the page\'s picture in this lane (his window is built on it — a follow-up), and its own badge words');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
