#!/usr/bin/env node
// B-5f2e (the coordinator's ruling 2026-11-19 20:18Z, LINE 2; r150 2026-11-20) — A FRAME OF ANOTHER SITE, SAID AS IT IS. MEASURED on
// the box (the real driver 0.38.2 on Chrome 151, the stand-in page framing a sign-in form from another site, int361's run at 8fad800e1):
// the driver's snapshot LISTS the frame's fields under its Iframe and a fill / a click BY REF lands in it; a page selector («✗ Element not
// found») and `frame <css>` («✗ Frame not found») stay in the top document; the vault's fill does not go into another site's frame.
// (2.369.413 told the agent the driver «cannot see or type into it»: false — its round 1 frame had never loaded.) Stand-ins only:
// fake CDP sockets on the loopback; no browser, no site.
//   ① PURE (src/browser-stuck.js): tabFrameTargets — the parent chain (a frame of the tab, a frame inside it), never another tab's
//      or an unplaced one; otherSiteFrameOrigins — web origins, the tab's own left out, each once; otherSiteFrameText — one / several
//      in en / zh / ja, by KIND (listed · unlisted · selector · vault): what is true of that reply, never that the driver cannot reach
//      the frame; frameFieldsListed — the reply's listing holds fields under an Iframe (text and --json), RED a copy blind to the
//      nesting; frameMissText — the driver's measured «not found» words, another failure never
//   ② THE REAL WATCH over a fake CDP: an `iframe` target heard from Target.targetCreated is kept and said for ITS tab only, at ZERO
//      calls of the watch; its targetInfoChanged moves the origin; targetDestroyed ends it (and an orphaned child with it).
//      RED: a copy of the watch without the iframe branch says nothing
//   ③ THE SNAPSHOT-REF WALK (resolveSnapshotRef over a fake short socket): it walks only the tab's own frames — a ref matched only
//      in ANOTHER tab's frame is not resolved; the tab's own frame still is. RED: the base's browser-wide filter resolves it there
//   ④ THE DOORS (source, anchored): the audit answers otherSiteFrame after a snapshot or a failed verb; the CLI prints it after a
//      snapshot or a «not found» [frame_other_site]; the vault fill's login_in_frame / target_not_found carry it; the stale «open
//      the frame's own address in a top-level tab» is gone from src and the agent's manual (the ticket cannot come back)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const { WebSocketServer, WebSocket: WSClient } = require('ws');
const ST = require('../src/browser-stuck.js');
const D = require('../src/server/browser-dialogs.js');
const LF = require('../src/server/browser-login-fill.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// THE FLAKE CENSUS, ROUND 2 (主开发 r4456, lane bl-loop-b): every read of ② waited a CLOCK for a message to cross the loopback socket
// (30-80 ms), and its zero-calls CONTROL went red when the copy's one call reached the fake after its 60 ms. THE ONE DOOR: the watch's
// socket is the tree's own (ws) with two counts beside it — each message it SENT (at the send) and each it HANDLED (once the watch's
// own listener returned) — and the fake counts what IT sent. settled() reads both ways: every message either side sent was taken by
// the other, on the one socket that keeps its order, under a generous bound whose expiry is a NAMED harness line. hold() keeps the
// watch's sends off the wire until release(): the late thing, held at will
function recSocket() {
  const sent = [], held = []; let handled = 0, opened = 0, holding = false;
  class RecWS extends WSClient {
    send(d, ...a) { sent.push(String(d)); if (holding) { held.push(() => super.send(d, ...a)); return undefined; } return super.send(d, ...a); }
    on(ev, fn) {
      if (ev !== 'message' && ev !== 'open') return super.on(ev, fn);
      return super.on(ev, (...a) => { try { return fn.apply(this, a); } finally { if (ev === 'message') handled++; else opened++; } });
    }
  }
  return { Impl: RecWS, sent, get handled() { return handled; }, get opened() { return opened; }, hold() { holding = true; }, release() { holding = false; for (const f of held.splice(0)) f(); } };
}
const SETTLE_MS = 15000;
const neverSettled = (what, facts) => { ok(false, `HARNESS (the flake census r2): ${what} — the watch and the fake never settled in ${SETTLE_MS / 1000} s (a message one side sent never reached the other: the machine, not the product)`, facts); return false; };
async function settled(ch, rec, what) {
  const t0 = Date.now();
  for (;;) {
    if (rec.opened > 0 && rec.handled === ch.sent && ch.calls.length === rec.sent.length) return true;
    if (Date.now() - t0 > SETTLE_MS) return neverSettled(what, { opened: rec.opened, handledByWatch: rec.handled, sentByFake: ch.sent, heardByFake: ch.calls.length, sentByWatch: rec.sent.length });
    await sleep(2);
  }
}
/** a copy of a product file with ONE anchored edit (scratch.mjs: a moved line fails BY NAME), compiled where the file lives */
function copyOf(rel, anchor, to, name) {
  const file = path.join(REPO, rel);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(anchored(read(rel), anchor, to, name), file);
  return m.exports;
}
const zhD = (await import('../src/lib/i18n-zh.js')).default, jaD = (await import('../src/lib/i18n-ja.js')).default;
const tFor = (d) => (k, p) => { const v = d ? d[k] : k; if (v === undefined) throw new Error(`no words for ${JSON.stringify(k)}`); return String(v).replace(/\{(\w+)\}/g, (m, q) => (p && p[q] !== undefined ? String(p[q]) : m)); };

// ═══ ① PURE ═══
console.log('— ① PURE: the tab\'s frames, their origins, the sentence, the driver\'s «not found»');
{
  const kept = [['F1', { url: 'https://idp.example.net/signin', parent: 'T1' }], ['F9', { url: 'https://other.example.org/', parent: 'T2' }],
    ['F3', { url: 'https://deep.example.com/x', parent: 'F1' }], ['F4', { url: 'https://lost.example.com/', parent: 'C-unknown' }], ['F5', { url: 'https://idp.example.net/again', parent: 'T1' }]];
  const mine = ST.tabFrameTargets(kept, 'T1').map((x) => x.targetId);
  ok(JSON.stringify(mine) === '["F1","F3","F5"]', 'tabFrameTargets: the tab\'s frames and a frame inside one (the parent chain) — never another tab\'s (F9) or one no root reaches (F4)', mine);
  ok(ST.tabFrameTargets(kept, 'T2').map((x) => x.targetId).join() === 'F9' && ST.tabFrameTargets(kept, '').length === 0 && ST.tabFrameTargets(null, 'T1').length === 0, 'tabFrameTargets: another tab gets its own frame only; no tab, no list ⇒ none');
  // a target Chrome gave NO parentFrameId: the tab's page attached it (Page.frameAttached — the moved frame keeps its id); a frame of
  // another site inside one of the page's own in-process frames (C-unknown attached by the page) is placed through it
  const noParent = kept.concat([['F7', { url: 'https://np.example.com/', parent: '' }]]);
  ok(ST.tabFrameTargets(noParent, 'T1', new Set(['F7', 'C-unknown'])).map((x) => x.targetId).join() === 'F1,F3,F4,F5,F7' && ST.tabFrameTargets(noParent, 'T1').every((x) => x.targetId !== 'F7') && ST.tabFrameTargets(noParent, 'T2', new Set(['F7'])).map((x) => x.targetId).join() === 'F9,F7',
    'tabFrameTargets: a frame with no parent is the tab\'s only when its page attached it; an in-process frame the page attached places the frame inside it');
  const origins = ST.otherSiteFrameOrigins({ tabUrl: 'http://127.0.0.1:9/login', frames: ST.tabFrameTargets(kept, 'T1').concat([{ url: 'about:blank' }, { url: 'data:text/html,x' }, { url: 'http://127.0.0.1:9/same' }]) });
  ok(JSON.stringify(origins) === '["https://idp.example.net","https://deep.example.com"]', 'otherSiteFrameOrigins: web origins in the order heard, each once; about:/data: and the tab\'s own origin left out', origins);
  const KINDS = ['listed', 'unlisted', 'selector', 'vault'];
  const say = (kind, o = ['https://idp.example.net'], t = null) => ST.otherSiteFrameText(o, t, { kind });
  const one = say('selector'), two = ST.otherSiteFrameText(origins);
  const five = ST.otherSiteFrameText(['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example', 'https://e.example']);
  // r150: each kind says what is TRUE of its reply (measured on the box): fields listed ⇒ by their refs; none listed ⇒ not listed; a page
  // selector's miss ⇒ use the field's ref; the vault ⇒ it does not fill into another site's frame — and every kind names whose frame
  ok(/frame from https:\/\/idp\.example\.net \(another site\)/.test(say('listed')) && /the fields listed above under an Iframe are inside the page's frames — fill and press them by their refs/.test(say('listed')),
    'LISTED (a snapshot whose listing holds fields under an Iframe): whose frame, and fill and press them BY THEIR REFS', say('listed'));
  ok(/its fields are not listed \(the frame is empty, or has not loaded yet: take the snapshot again\)/.test(say('unlisted')) && !/by their refs/.test(say('unlisted')),
    'UNLISTED (a snapshot that lists no field inside a frame): its fields are NOT LISTED — never «fill them by ref»', say('unlisted'));
  ok(/a page selector and `frame <css>` do not reach into it — use the field's ref from `snapshot -i` \(fill and press by ref\)/.test(one),
    'SELECTOR (the driver\'s «not found» of a page selector / frame <css>): the recipe that works — the field\'s ref from the snapshot', one);
  ok(/the vault does not fill into another site's frame — if it holds a sign-in, ask the user to sign in there in the live view/.test(say('vault')) && !/ref/.test(say('vault')),
    'VAULT (its refusal): only what is true of the vault — it does not fill into another site\'s frame', say('vault'));
  const every = KINDS.flatMap((k) => [say(k), say(k, origins)]).concat(['zh', 'ja'].flatMap((l) => KINDS.flatMap((k) => [say(k, ['https://idp.example.net'], tFor(l === 'zh' ? zhD : jaD)), say(k, origins, tFor(l === 'zh' ? zhD : jaD))])));
  ok(every.length === 24 && every.every((x) => x.includes('https://idp.example.net') && !/cannot see|cannot reach|cannot (see or )?type/.test(x)) && KINDS.every((k) => say(k) !== say(k, origins)) && KINDS.slice(0, 3).every((k) => /the vault does not fill into another site's frame/.test(say(k))),
    'EVERY kind, one frame and several, en / zh / ja: whose frame in each, NEVER that the driver cannot see or reach it (it can, by ref); the vault\'s word in every agent kind', every.filter((x) => /cannot/.test(x)));
  ok(/frames from https:\/\/idp\.example\.net, https:\/\/deep\.example\.com \(other sites\)/.test(two) && /a\.example, https:\/\/b\.example, https:\/\/c\.example, …/.test(five) && !/d\.example/.test(five),
    'the sentence (several): every origin up to three, then «…»', { two, five });
  ok(ST.otherSiteFrameText([]) === '' && ST.otherSiteFrameText(null) === '', 'no frame ⇒ no sentence');
  // frameFieldsListed — BY OBSERVATION of the reply's own listing (the measured box listing first)
  const BOX = '- heading "Sign in with your account" [level=1, ref=e18]\n- Iframe [ref=e19]\n  - textbox "Account" [ref=e21]\n  - textbox "Password" [ref=e22]\n  - button "Continue" [ref=e20]\n';
  const EMPTY = '- heading "Sign in with your account" [level=1, ref=e18]\n- Iframe [ref=e19]\n';
  const TOPONLY = '- Iframe [ref=e19]\n- textbox "Search" [ref=e2]\n- group "box"\n  - button "Go" [ref=e3]\n';
  const NESTED = '- Iframe [ref=e1]\n  - Iframe [ref=e2]\n  - textbox "Outer" [ref=e3]\n';
  const ATTR = '- Iframe [ref=e19]\n  - checkbox "Remember me" [checked=false, ref=e23]\n';   // a field whose ref follows its state
  const listedCases = [[BOX, true], [EMPTY, false], [TOPONLY, false], [NESTED, true], [ATTR, true], [JSON.stringify({ success: true, data: { snapshot: BOX } }), true], [JSON.stringify({ success: true, data: { snapshot: EMPTY } }), false], ['', false], [null, false]];
  const got = listedCases.map(([l]) => ST.frameFieldsListed(l));
  ok(got.every((g, i) => g === listedCases[i][1]), 'frameFieldsListed: the box\'s own listing ⇒ listed; an Iframe with nothing under it, fields only in the top page (a group\'s child is no frame\'s), nothing ⇒ not; a frame inside a frame and an outer frame\'s field after it ⇒ listed; the --json form read the same', got);
  {
    const blind = (() => { const file = path.join(REPO, 'src/browser-stuck.js'); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(anchored(read('src/browser-stuck.js'), "      if (frames.length && /\\[[^\\]]*\\bref=e?\\d+/.test(m[2])) return true;", "      if (/\\[[^\\]]*\\bref=e?\\d+/.test(m[2]) && /- Iframe\\b/.test(one)) return true;", 'r150-listing-blind-to-nesting'), file); return m.exports; })();
    ok(blind.frameFieldsListed(EMPTY) === true && blind.frameFieldsListed(TOPONLY) === true, 'CONTROL (a check blind to the nesting — any ref on a page with an Iframe): an empty frame and fields of the top page read as «listed», so the note would tell the agent to fill a frame that shows nothing — RED');
  }
  const all = [one, two].concat(['zh', 'ja'].flatMap((l) => { const d = l === 'zh' ? zhD : jaD; return [ST.otherSiteFrameText(['https://idp.example.net'], tFor(d)), ST.otherSiteFrameText(origins, tFor(d))]; }));
  ok(all.every((x) => x.includes('https://idp.example.net')) && new Set(all).size === all.length && all.every((x) => !/top-level tab|frame's own address/.test(x)),   // stale-pins: kept — an absence check (the stale advice must not come back)
    'en / zh / ja: each sentence its own words, the origin in each, never the top-level-tab advice', all);
  ok(ST.frameMissText('✗ Element not found: #xu. Verify the selector, role, or name is correct and the element exists in the DOM.') && ST.frameMissText('✗ Frame not found') && !ST.frameMissText('✗ Element is not visible') && !ST.frameMissText('Navigation failed: net::ERR_NAME_NOT_RESOLVED') && !ST.frameMissText(null),
    'frameMissText: the driver\'s measured «Element not found» / «Frame not found»; another failure says nothing of frames');
}

// ═══ ② THE REAL WATCH over a fake CDP ═══
console.log('— ② the REAL watch: a frame target heard is kept and said for its tab only, at zero calls');
function fakeChrome() {
  const calls = []; const browsers = new Set(); const sessions = new Map(); let n = 0, sent = 0;
  const out = (ws, o) => { sent++; ws.send(JSON.stringify(o)); };   // the flake census r2: every message the fake sends, counted (settled())
  const wss = new WebSocketServer({ noServer: true });
  const srv = http.createServer((q, r) => { r.statusCode = 404; r.end(); });
  srv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws)));
  wss.on('connection', (ws) => { browsers.add(ws); ws.on('close', () => browsers.delete(ws)); ws.on('message', (d) => {
    const m = JSON.parse(d); calls.push(m); const reply = (o) => out(ws, { id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), ...o });
    if (m.method === 'Target.getTargets') return reply({ result: { targetInfos: [{ targetId: 'T1', type: 'page', url: 'http://127.0.0.1:9/login', title: 'one' }, { targetId: 'T2', type: 'page', url: 'http://127.0.0.1:9/two', title: 'two' }] } });
    if (m.method === 'Target.attachToTarget') { const sid = `S-${m.params.targetId}-${++n}`; sessions.set(sid, { ws, tid: String(m.params.targetId) }); return reply({ result: { sessionId: sid } }); }
    if (m.method === 'Page.getFrameTree' && m.sessionId) { const tid = (sessions.get(m.sessionId) || {}).tid || ''; return reply({ result: { frameTree: { frame: { id: tid, loaderId: `L-${tid}` }, ...(tid === 'T1' ? { childFrames: [{ frame: { id: 'C5', parentId: 'T1', loaderId: 'L-C5' } }] } : {}) } } }); }
    return reply({ result: {} });
  }); });
  return { calls, get sent() { return sent; }, browserEvent(method, params) { for (const ws of browsers) out(ws, { method, params }); },
    tabEvent(tid, method, params) { for (const [sid, x] of sessions) if (x.tid === tid) out(x.ws, { sessionId: sid, method, params }); },
    async listen() { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); this.url = `ws://127.0.0.1:${srv.address().port}/devtools/browser/fake`; return this; },
    async close() { for (const c of wss.clients) c.terminate(); await new Promise((r) => srv.close(() => r())); } };
}
const quiet = { warn: () => {}, log: () => {}, error: () => {} };
const NAMED = 'bp-a0005f2e', KEY = 'bk-00005f2e';
const tgt = { profileId: NAMED, browserKey: KEY };
async function watchOver(Dm) {
  const ch = await fakeChrome().listen();
  const rec = recSocket();
  const w = Dm.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: ch.url }) }, log: quiet, WebSocketImpl: rec.Impl });
  const settle = (what) => settled(ch, rec, what);
  await w.arm(NAMED); await settle('the watch armed (its tabs tracked)');
  w.noteActiveTab(tgt, 'T1');
  const frame = (targetId, parentFrameId, url) => ch.browserEvent('Target.targetCreated', { targetInfo: { targetId, type: 'iframe', parentFrameId, url, title: '', attached: false } });
  frame('F1', 'T1', 'https://idp.example.net/signin'); frame('F9', 'T2', 'https://other.example.org/'); frame('F3', 'F1', 'https://deep.example.com/x');
  await settle('three frame targets heard');
  return { ch, w, frame, rec, settle };
}
{
  const { ch, w, settle } = await watchOver(D);
  const before = ch.calls.length;
  const said = w.otherSiteFramesFor(tgt);
  await sleep(60);   // the window a DEFERRED call of the lookup would fall in (kept as it was: nothing loosened) …
  await settle('the lookup\'s calls, if any, reached the fake');   // … and a call it made is counted by the socket's order, never by its trip's time
  const after = ch.calls.length;
  ok(!!said && JSON.stringify(said.origins) === '["https://idp.example.net","https://deep.example.com"]' && said.text === ST.otherSiteFrameText(said.origins),
    'the conversation\'s tab (T1) holds a frame of another site and a frame inside it ⇒ both said, by origin, in the sentence', said);
  ok(after === before, 'ZERO calls: the answer is read from the targets the watch already heard (the snapshot stays at no call)', { before, after });
  ok(!w.otherSiteFramesFor(tgt).origins.includes('https://other.example.org'), 'another tab\'s frame (F9 on T2) is never said for this tab');
  w.noteActiveTab(tgt, 'T2');
  ok(JSON.stringify((w.otherSiteFramesFor(tgt) || {}).origins) === '["https://other.example.org"]', 'the tab moved (T2) ⇒ its own frame is said, and only it');
  w.noteActiveTab(tgt, 'T1');
  ch.browserEvent('Target.targetInfoChanged', { targetInfo: { targetId: 'F1', type: 'iframe', parentFrameId: 'T1', url: 'https://login.example.org/s', title: '', attached: false } }); await settle('targetInfoChanged F1');
  ok(JSON.stringify((w.otherSiteFramesFor(tgt) || {}).origins) === '["https://login.example.org","https://deep.example.com"]', 'targetInfoChanged: the frame navigated ⇒ its new origin is said');
  ch.browserEvent('Target.targetDestroyed', { targetId: 'F1' }); await settle('targetDestroyed F1');
  ok(w.otherSiteFramesFor(tgt) === null, 'targetDestroyed: the frame went ⇒ nothing said (its child F3 is placed by no root any more ⇒ not said either)');
  ok(!ch.calls.some((m) => m.method === 'Target.attachToTarget' && /^F/.test(String(m.params && m.params.targetId))), 'the watch never attaches to a frame target to say it (no session, no call into the frame)');
  ok(w.otherSiteFramesFor({ profileId: 'bp-nobody', browserKey: KEY }) === null, 'a profile no watch holds ⇒ null');
  // a target Chrome gives NO parentFrameId: the tab's page attached that frame first (Page.frameAttached on the tab's own session)
  ch.tabEvent('T1', 'Page.frameAttached', { frameId: 'F7', parentFrameId: 'T1' }); await settle('frameAttached F7');
  ch.browserEvent('Target.targetCreated', { targetInfo: { targetId: 'F7', type: 'iframe', url: 'https://np.example.com/in', title: '', attached: false } }); await settle('targetCreated F7');
  ok(JSON.stringify((w.otherSiteFramesFor(tgt) || {}).origins) === '["https://np.example.com"]', 'a frame target with NO parentFrameId is said for the tab whose page attached it (Page.frameAttached: no call of ours)');
  ch.tabEvent('T1', 'Page.frameDetached', { frameId: 'F7', reason: 'swap' }); await settle('frameDetached swap');
  ok(!!w.otherSiteFramesFor(tgt), 'frameDetached «swap» (the frame moved to a process of its own) keeps it the tab\'s');
  ch.tabEvent('T1', 'Page.frameDetached', { frameId: 'F7', reason: 'remove' }); await settle('frameDetached remove');
  ok(w.otherSiteFramesFor(tgt) === null, 'frameDetached «remove» (the frame left the page) ⇒ no longer placed, not said');
  w.noteActiveTab(tgt, 'T2');
  ch.tabEvent('T2', 'Page.frameAttached', { frameId: 'F8', parentFrameId: 'T2' }); await settle('frameAttached F8 (T2)');
  w.noteActiveTab(tgt, 'T1');
  ch.browserEvent('Target.targetCreated', { targetInfo: { targetId: 'F8', type: 'iframe', url: 'https://t2only.example.com/', title: '', attached: false } }); await settle('targetCreated F8');
  ok(w.otherSiteFramesFor(tgt) === null, 'a frame ANOTHER tab\'s page attached is never said for this tab');
  // a tab the watch met with its frames already there: Page.enable replays no frameAttached — the frame tree the enable reads anyway
  // seeds them (T1's in-process child C5), so a frame of another site inside it is placed
  ch.browserEvent('Target.targetCreated', { targetInfo: { targetId: 'F6', type: 'iframe', parentFrameId: 'C5', url: 'https://pay.example.com/card', title: '', attached: false } }); await settle('targetCreated F6');
  ok(JSON.stringify((w.otherSiteFramesFor(tgt) || {}).origins) === '["https://pay.example.com"]', 'a frame of another site inside the page\'s own in-process frame (C5, seeded from the enable\'s frame tree) is said for the tab');
  // the tab's top document changed: the old document's frames are not said (a page the browser keeps for Back keeps its frames)
  ch.tabEvent('T1', 'Page.frameNavigated', { frame: { id: 'T1', loaderId: 'L-next', url: 'http://127.0.0.1:9/next', securityOrigin: 'http://127.0.0.1:9', mimeType: 'text/html' }, type: 'Navigation' }); await settle('frameNavigated T1');
  ok(w.otherSiteFramesFor(tgt) === null, 'the top frame navigated ⇒ the old document\'s frames are no longer said');
  ch.browserEvent('Target.targetCreated', { targetInfo: { targetId: 'F10', type: 'iframe', parentFrameId: 'T1', url: 'https://idp.example.net/again', title: '', attached: false } }); await settle('targetCreated F10');
  ok(JSON.stringify((w.otherSiteFramesFor(tgt) || {}).origins) === '["https://idp.example.net"]', 'a frame of the NEW document is said again');
  w.disarm?.(NAMED); await ch.close();
}
{
  // RED CONTROL for «zero calls»: a copy whose lookup asks Chrome once — the wait above sees it. The flake census r2: its one red was
  // that call reaching the fake after the 60 ms; PLACED below (the call HELD off the wire, the read as it stood counts nothing), and
  // the control reads as the leg now does: the same window, then the socket's order
  const Dask = copyOf('src/server/browser-dialogs.js', '    const e = pickScopedTabFor(w, target, { targetId });\n    if (!e) return null;\n    const origins = ST.otherSiteFrameOrigins(',
    '    call(w, \'Target.getTargets\', {}, null, 2000).catch(() => null);\n    const e = pickScopedTabFor(w, target, { targetId });\n    if (!e) return null;\n    const origins = ST.otherSiteFrameOrigins(', 'b5f2e-lookup-asks-chrome');
  const { ch, w, rec, settle } = await watchOver(Dask);
  const h0 = ch.calls.length, s0 = rec.sent.length; rec.hold(); w.otherSiteFramesFor(tgt); await sleep(60);
  const heldRead = ch.calls.length, heldSent = rec.sent.slice(s0).filter((x) => JSON.parse(x).method === 'Target.getTargets').length; rec.release(); await settle('the held call released');
  ok(heldSent === 1 && heldRead === h0 && ch.calls.length > h0, 'PLACED (the census\'s find, at will): the copy\'s one call HELD off the wire — the read as it stood (the fake\'s calls after 60 ms) counts nothing though the watch sent it; released, the socket\'s order brings it', { h0, heldRead, heldSent, after: ch.calls.length });
  const b0 = ch.calls.length; w.otherSiteFramesFor(tgt); await sleep(60); await settle('the copy\'s call reached the fake');
  ok(ch.calls.length > b0, 'CONTROL (a lookup that asks Chrome once): the same wait counts its call — the zero-calls leg can fail', { b0, after: ch.calls.length });
  w.disarm?.(NAMED); await ch.close();
}
{
  // RED CONTROL: the watch as it was — every non-page target dropped in track(), so a frame is never kept
  const Dbase = copyOf('src/server/browser-dialogs.js', "if (p.targetInfo && p.targetInfo.type === 'iframe') { noteFrameTarget(w, p.targetInfo); return; } ", '', 'b5f2e-watch-no-frames');
  const { ch, w } = await watchOver(Dbase);
  ok(w.otherSiteFramesFor(tgt) === null, 'CONTROL (the watch without the iframe branch): the same frames heard ⇒ nothing said — the branch is what keeps them');
  w.disarm?.(NAMED); await ch.close();
}

// ═══ ③ THE SNAPSHOT-REF WALK over a fake short socket ═══
console.log('— ③ resolveSnapshotRef walks only the tab\'s own frames');
function fakeShort({ fieldsBySession }) {
  const wss = new WebSocketServer({ noServer: true }); let n = 0;
  const srv = http.createServer((q, r) => { r.statusCode = 404; r.end(); });
  srv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws)));
  const walked = [];
  wss.on('connection', (ws) => ws.on('message', (d) => {
    const m = JSON.parse(d); const reply = (o) => ws.send(JSON.stringify({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), ...o }));
    const tidOf = (sid) => String(sid || '').replace(/^S-/, '').replace(/-\d+$/, '');
    if (m.method === 'Target.attachToTarget') return reply({ result: { sessionId: `S-${m.params.targetId}-${++n}` } });
    if (m.method === 'Target.getTargets') return reply({ result: { targetInfos: [
      { targetId: 'T1', type: 'page', url: 'http://127.0.0.1:9/login' }, { targetId: 'T2', type: 'page', url: 'http://127.0.0.1:9/two' },
      { targetId: 'F9', type: 'iframe', parentFrameId: 'T2', url: 'https://other.example.org/' }, { targetId: 'F1', type: 'iframe', parentFrameId: 'T1', url: 'https://idp.example.net/' }] } });
    if (m.method === 'Page.getFrameTree') return reply({ result: { frameTree: { frame: { id: tidOf(m.sessionId) } } } });
    if (m.method === 'Page.createIsolatedWorld') return reply({ result: { executionContextId: 7 } });
    if (m.method === 'Runtime.evaluate') return reply({ result: { result: { objectId: `root-${tidOf(m.sessionId)}` } } });
    if (m.method === 'Accessibility.queryAXTree') { const t = tidOf(m.sessionId); walked.push(t); return reply({ result: { nodes: (fieldsBySession[t] || []).filter((x) => x.name.value === m.params.accessibleName) } }); }
    return reply({ result: {} });
  }));
  return { walked, async listen() { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); this.url = `ws://127.0.0.1:${srv.address().port}/devtools/page/T1`; return this; },
    async close() { for (const c of wss.clients) c.terminate(); await new Promise((r) => srv.close(() => r())); } };
}
const fields = { F9: [{ backendDOMNodeId: 91, role: { value: 'textbox' }, name: { value: 'Email' } }], F1: [{ backendDOMNodeId: 11, role: { value: 'textbox' }, name: { value: 'Password box' } }] };
async function walk(LFm, name) {
  const s = await fakeShort({ fieldsBySession: fields }).listen();
  try { const r = await LFm.resolveSnapshotRef({ wsUrl: s.url, targetId: 'T1', parsedRef: { ref: 'e5', role: 'textbox', name } }); return { r, walked: s.walked.slice() }; } finally { await s.close(); }
}
{
  const other = await walk(LF, 'Email');
  ok(other.r && other.r.ok === false && other.r.code === 'target_not_found' && !other.walked.includes('F9'), 'a ref whose field lives only in ANOTHER tab\'s frame (F9 on T2) is not resolved — that frame is never walked', other);
  const own = await walk(LF, 'Password box');
  ok(own.r && own.r.ok === true && own.r.entry && own.r.entry.frameId === 'F1' && own.r.entry.inFrame === true, 'the tab\'s OWN frame of another site is still walked (its entry carries the frame: the fill refuses it as login_in_frame)', own);
  const infos = [{ targetId: 'F1', type: 'iframe', parentFrameId: 'T1' }, { targetId: 'F9', type: 'iframe', parentFrameId: 'T2' }, { targetId: 'F3', type: 'iframe', parentFrameId: 'F1' }, { targetId: 'F7', type: 'iframe', parentFrameId: 'C2' }, { targetId: 'P1', type: 'page' }];
  ok(LF.ownFrameTargetInfos(infos, new Set(['T1', 'C2'])).map((t) => t.targetId).join() === 'F1,F3,F7', 'ownFrameTargetInfos: a frame of the tab, of its in-process child (C2), inside one of them — never another tab\'s, never a page', LF.ownFrameTargetInfos(infos, new Set(['T1', 'C2'])).map((t) => t.targetId));
  // RED CONTROL: the base's browser-wide filter
  const LFbase = copyOf('src/server/browser-login-fill.js', 'const oopInfos = ownFrameTargetInfos(infos, treeFrameIds).slice(0, MAX_AX_CHILD_FRAMES);',
    "const oopInfos = infos.filter((t) => t && t.type === 'iframe' && t.targetId && !treeFrameIds.has(String(t.targetId))).slice(0, MAX_AX_CHILD_FRAMES);", 'b5f2e-ref-walk-browser-wide');   // stale-pins: kept — the RED control's REPLACEMENT (the base's own line), never an anchor
  const base = await walk(LFbase, 'Email');
  ok(base.r && base.r.ok === true && base.r.entry && base.r.entry.frameId === 'F9' && base.walked.includes('F9'), 'CONTROL (the base\'s browser-wide walk): the same ref RESOLVES into another tab\'s frame — the scope is what keeps it out', base);
}

// ═══ ④ THE DOORS (source, anchored) ═══
console.log('— ④ the doors: the audit, the CLI, the vault fill, the stale advice gone');
{
  const route = read('src/routes/browser.js'), cli = read('data/bin/vibespace-browser');
  const audit = (route.match(/router\.post\('\/api\/agent\/browser\/audit'[\s\S]*?\n\}\);\n/) || [''])[0];
  ok(/\(req\.body\?\.verb === 'snapshot' \|\| req\.body\?\.ok === false\)/.test(audit) && /otherSiteFrame = tidF \? ctx\.dialogs\.otherSiteFramesFor\(tF, \{ targetId: tidF \}\) : null/.test(audit) && /\.\.\.\(otherSiteFrame \? \{ otherSiteFrame \} : \{\}\)/.test(audit),
    'the audit answers otherSiteFrame after a snapshot or a failed verb, from the watch (the conversation\'s own tab)');
  ok(cli.includes("const kind = snapNote ? (DS && typeof DS.frameFieldsListed === 'function' && DS.frameFieldsListed(outText) ? 'listed' : 'unlisted') : 'selector';")
    && cli.includes("const said = DS && typeof DS.otherSiteFrameText === 'function' ? DS.otherSiteFrameText(au.otherSiteFrame.origins, null, { kind }) : (kind === 'selector' ? au.otherSiteFrame.text : '');")
    && cli.includes("if (said) console.error(`note: ${said} [frame_other_site]`);") && !cli.includes('console.error(`note: ${au.otherSiteFrame.text} [frame_other_site]`)'),   // stale-pins: kept — an absence check (the false sentence must not come back)
    'the CLI words the note BY THE REPLY: a snapshot by its own listing (listed / unlisted), a «not found» the selector\'s recipe — never the hub\'s one sentence for every reply');
  const fv = (route.match(/router\.post\('\/api\/agent\/browser\/fill-vault'[\s\S]*?\n\}\);\n/) || [''])[0];
  ok(/\(r\.code === 'login_in_frame' \|\| r\.code === 'target_not_found'\) && judged\.targetId && typeof D\.otherSiteFramesFor === 'function'/.test(fv) && /error: framed && framed\.text \? `\$\{text\} — \$\{framed\.text\}` : text/.test(fv),
    'the vault fill: a login_in_frame or target_not_found on a tab with a frame of another site carries the sentence');
  ok(/framed = D\.otherSiteFramesFor\(t, \{ targetId: judged\.targetId, kind: 'vault' \}\)/.test(fv), 'r150: the vault\'s refusal carries the VAULT kind — only what is true of the vault');
  const walkFiles = (rel) => fs.readdirSync(path.join(REPO, rel), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walkFiles(path.join(rel, d.name)) : (/\.(m?js|md)$/.test(d.name) ? [path.join(rel, d.name)] : [])));
  const stale = walkFiles('src').concat(walkFiles('docs/agent')).filter((f) => /\bopen the frame's own address in a top-level tab/.test(read(f)));   // stale-pins: kept — an absence check (the stale advice must not come back)
  ok(stale.length === 0, 'the stale advice «open the frame\'s own address in a top-level tab» is gone (the ticket cannot come back to the page)', stale);
  ok(/ask the user to sign in there in the live view/.test(read('src/browser-login.js')) && /\[frame_other_site\]/.test(read('docs/agent/browser-manual.md')), 'the refusal and the agent\'s manual name the way that works: the user, in the live view');
}

report();
