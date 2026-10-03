#!/usr/bin/env node
// LANE BROWSER-WINDOWS (2026-10-01) — THE FAST GATE of U3 + U0b (the live view's tab chips, a tab that paints nothing).
// The owner: "浏览器的live view里似乎无法点击上面的标签页进行切换"; userW's inc-muqdohf0-hkjc ("D-payment Session对应的浏览器
// 又卡死了"): his conversation's tab sat BEHIND another tab of the shared window — it painted nothing (measured 0 fps), the
// view was a frozen picture, his chip clicks were a no-op that said nothing and left no line anywhere.
//   ① PURE — the click verdict (driving: bring forward / switch; watching: watch / follow; never another's tab), the
//      `watch-tab` viewer verb, the strip's driver words (no conversation "drives" another's window), source pins of the
//      client's routing and the keeper's bring-forward.
//   ② the REAL bridge (src/server/browser-stream.js) over a fake stream server + a stub keeper:
//      a. a tab on show that sends no frame for 2 s is ASKED; hidden ⇒ `tab-background` to every viewer (replayed to a late
//         one), the journal names it, its picture polled at ≤ 2 fps; the stream's next frame clears it. A VISIBLE silent
//         tab is asked and NOT said. CONTROL: a bridge copy without the check says nothing.
//      b. a watching viewer's chip moves ITS view: the stub's watch pump feeds only that viewer (the others keep the
//         agent's frames), its mode is said, another conversation's tab is refused by name, `null` follows the agent's again
//         (the last agent frame resent), a takeover ends the watch, the holder's watch is refused (`driving`).
//      c. every chip act is JOURNALED and answered: a bring-forward, a refusal.
//   lane live-watch-polish (B-93d7, design 006 G1–G5): ① the "▾+N" menu asks the chip's verdict (never a disabled row), the
//      watch line names both tabs (en/zh/ja, a page title bounded), the watched chip never folds (+ CONTROL), a refusal is
//      worded by its code; ② b a re-sent watch of the agent's current tab is answered, a capture's failure code reaches the view.
// ~8 s, no browser, no vendor call, port 0 / free ports, scratch dir only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const S = require('../src/browser-stream.js');
const W = require('../src/browser-windows.js');
const BS = require('../src/server/browser-stream.js');
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const ROOT = scratch('bwin');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const cleanups = [];
process.on('exit', () => { for (const f of cleanups) { try { f(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const M = mutantCopies('browser-windows', REPO);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
function jpegOf(w, h, tag = '') {
  const t = Buffer.from(String(tag));
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xfe, 0x00, t.length + 2, ...t, 0xff, 0xd9];
  return Buffer.from(bytes).toString('base64');
}
const T1 = 'A1'.padEnd(32, '1'), T2 = 'B2'.padEnd(32, '2'), T3 = 'C3'.padEnd(32, '3');
const SILENCE = 400; // the gate's silence clock (the shipped one is WIN.BACKGROUND_SILENCE_MS)
const HUNG = 1200; // B-d635 verify r1: the gate's "no answer for this long" clock (the shipped one is WIN.UNRESPONSIVE_MS)

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① PURE: the click verdict, the watch verb, the strip\'s driver words, the source pins');
{
  const C = (o) => W.tabClickVerdict({ targetId: T2, ...o }).act;
  const rows = [
    ['driving, the session\'s current tab ⇒ bring it forward', { owner: 'agent', driving: true, active: true }, 'front'],
    ['driving, another of its tabs ⇒ the real switch', { owner: 'agent', driving: true, active: false }, 'switch'],
    ['driving a mediated browser ⇒ none (mediated_tabs)', { owner: 'agent', driving: true, mediated: true }, 'none'],
    ['watching, another of its tabs ⇒ the VIEW moves', { owner: 'agent', driving: false, active: false }, 'watch'],
    ['watching a mediated browser, another of its tabs ⇒ the view moves too', { owner: 'agent', driving: false, mediated: true }, 'watch'],
    ['watching, the tab already watched ⇒ none', { owner: 'agent', driving: false, watching: T2 }, 'none'],
    ['watching another, the agent\'s current tab ⇒ follow it again', { owner: 'agent', driving: false, active: true, watching: T3 }, 'follow'],
    ['watching nothing, the agent\'s current tab ⇒ none (it is shown)', { owner: 'agent', driving: false, active: true }, 'none'],
    ['driving, another conversation\'s tab ⇒ none (the takeover rules)', { owner: 'other', driving: true }, 'none'],
    ['accept-fixes-strip F8: watching, another conversation\'s tab ⇒ WATCH it (view only)', { owner: 'other', driving: false }, 'watch'],
    ['F8: watching, nobody\'s tab ⇒ watch it', { owner: 'orphan', driving: false }, 'watch'],
    ['F8: watching, his own tab (a conversation\'s view) ⇒ watch it', { owner: 'you', driving: false }, 'watch'],
    ['F8: another conversation\'s tab already watched ⇒ none', { owner: 'other', driving: false, watching: T2 }, 'none'],
    ['his own window ⇒ none (the row\'s own verdict answers)', { owner: 'agent', human: true, driving: true }, 'none'],
  ];
  const bad = rows.filter(([, o, want]) => C(o) !== want).map(([n, o]) => `${n}: ${C(o)}`);
  ok(!bad.length && W.TAB_CLICK_ACTS.join() === 'front,switch,watch,follow,none', `tabClickVerdict: ${rows.length} rows — bring forward / switch while driving, watch / follow while watching, another\'s tab watched (view only) but never switched`, bad);
  const v = S.viewerMessageVerdict({ type: 'watch-tab', targetId: T2.toLowerCase() });
  const v0 = S.viewerMessageVerdict({ type: 'watch-tab', targetId: 'nope' });
  ok(v.kind === 'watch-tab' && v.forward === false && v.targetId === T2 && v0.kind === 'watch-tab' && v0.targetId === null && S.VIEWER_VIEW_TYPES.includes('watch-tab'), 'the viewer verb `watch-tab` {targetId}: never forwarded upstream, the id upper-cased, a malformed one = follow the agent\'s (null)');
  const st = { browserKey: 'bk-0000aaa1', attachments: [{ profileId: 'bp-0000aaa1', alias: 'w', label: 'W', isDefault: true }], leases: [{ profileId: 'bp-0000aaa1', browserKey: 'bk-0000aaa1', others: 1, driver: { browserKey: 'bk-0000bbb2', by: 'agent' } }], inputs: [] };
  const r1 = S.browserListFor(st)[0];
  const r2 = S.browserListFor({ ...st, leases: [{ ...st.leases[0], driver: { browserKey: 'bk-0000bbb2', by: 'user' } }] })[0];
  ok(r1.driver === 'agent' && r1.driverKey === null && r2.driver === 'other-user' && r2.driverKey === 'bk-0000bbb2', 'the strip: an entry is THIS conversation\'s window — no other conversation\'s agent ever "drives" it (an old `by:agent` record reads as its own agent); the user driving it from another view (an older run\'s shared window) is "you, in …"', { r1, r2 });
  const lw = read('src/lib/browser-live-window.js');
  ok(!/\{name\} drives/.test(lw) && /function chipClick\(row\)/.test(lw) && /type: 'watch-tab'/.test(lw) && /case 'tab-background':/.test(lw) && /case 'watching':/.test(lw) && /if \(row\) chipClick\(row\)/.test(lw), 'the client: the "{name} drives" strip words are gone; a chip click goes through chipClick (the PURE verdict); `watching` and `tab-background` records are read');
  const bsrc0 = read('src/server/browser-stream.js');
  ok(W.BACKGROUND_SILENCE_MS === 2000 && W.WATCH_POLL_MS === 500 && W.WATCH_FIRST_FRAME_MS === 1000 && W.UNRESPONSIVE_MS === 8000 && /bgSilenceMs = WIN\.BACKGROUND_SILENCE_MS, bgTickMs = 1000, bgPollMs = WIN\.WATCH_POLL_MS, bgHungMs = WIN\.UNRESPONSIVE_MS \}/.test(bsrc0), 'the SHIPPED clocks: 2 s of silence before the page is asked, a 1 s tick, a 500 ms poll (≤ 2 fps), 8 s without an answer before "not responding" — the bridge\'s defaults are the PURE constants (the gate below runs on short ones)');
  const kp = read('src/server/browser-keeper.js');
  ok(/if \(v\.noop && act === 'switch' && !eph\)/.test(kp) && /broughtForward: true/.test(kp) && /tabVisibilityFor, captureTabFor, watchTabFor,/.test(kp), 'the keeper: a driving click on the agent\'s CURRENT tab brings it forward (never a silent no-op); the visibility / capture / watch seams are exported');
  // ── lane live-watch-polish (B-93d7, design 006 G1–G5) ──
  const ZH = (await import('../src/lib/i18n-zh.js')).default, JA = (await import('../src/lib/i18n-ja.js')).default;
  const fillW = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
  const tOfD = (d) => (s, p) => fillW(d[s] !== undefined ? d[s] : s, p);
  const NEWKEYS = ['Watching “{watched}” — the agent is on “{current}”', 'Watching “{watched}” — a new picture every half second; the agent is on “{current}”', 'Watch — {title}', 'Back to the agent’s tab — {title}', 'Bring to the front — {title}', 'Switch to — {title}', 'this server cannot show another tab', 'the tab could not be reached', 'the tab refused a screencast', 'the tab is gone', 'the tab could not be shown'];
  const missingK = NEWKEYS.flatMap((k) => [ZH, JA].filter((d) => typeof d[k] !== 'string' || !d[k] || (k.match(/\{\w+\}/g) || []).some((q) => !d[k].includes(q))).map(() => k));
  ok(!missingK.length, `live-watch-polish: the ${NEWKEYS.length} new keys have zh + ja (every {param} kept)`, missingK);
  // G1 — the "▾+N" menu over driving × watching × mediated × owner
  const MR = [{ targetId: T1, title: 'Agent now', owner: 'agent', active: true, canSwitch: false }, { targetId: T2, title: 'Docs', owner: 'agent', active: false, canSwitch: false }, { targetId: T3, title: 'Other conv', owner: 'other', active: false, canSwitch: false }];
  const menuOf = (o, tIn = null) => W.foldMenuRows(MR, (r) => W.tabClickVerdict({ owner: r.owner, driving: !!o.driving, mediated: !!o.mediated, active: r.active, watching: o.watching || null, targetId: r.targetId }), tIn);
  const brief = (o) => menuOf(o).map((m) => m.act + ':' + m.targetId.slice(0, 2)).join(' ');
  const mcases = [
    ['watching nothing: a folded agent tab ⇒ Watch, another conversation\'s ⇒ Watch (F8); the agent\'s current ⇒ not listed', {}, 'watch:B2 watch:C3'],
    ['watching T2: the watched one ⇒ not listed; the agent\'s current ⇒ Back; another conversation\'s ⇒ Watch', { watching: T2 }, 'follow:A1 watch:C3'],
    ['driving: the current ⇒ bring to the front, another ⇒ switch', { driving: true }, 'front:A1 switch:B2'],
    ['driving a mediated browser: nothing to do ⇒ nothing listed', { driving: true, mediated: true }, ''],
  ];
  const mbad = mcases.filter(([, o, want]) => brief(o) !== want).map(([n, o, want]) => ({ n, want, got: brief(o) }));
  const hisMenu = W.foldMenuRows(MR.map((r) => ({ ...r, canSwitch: r.targetId !== T1 })), () => ({ act: 'none' }), null).map((m) => m.act + ':' + m.targetId.slice(0, 2)).join(' ');
  ok(!mbad.length && hisMenu === 'switch:B2 switch:C3', 'G1 the "▾+N" menu asks the chip\'s click verdict: Watch / Back / Switch, his own window keeps the row\'s switch, a row with nothing to do is not listed', { mbad, hisMenu });
  const allE = [{}, { watching: T2 }, { driving: true }, { driving: true, mediated: true }].flatMap((o) => menuOf(o, tOfD(ZH)));
  ok(allE.length === 6 && allE.every((e) => !('disabled' in e) && /^(查看|回到 agent 的标签页|提到最前面|切换到) — (Docs|Agent now|Other conv)$/.test(e.label)), 'G1 no menu entry is ever disabled; each says its act and the tab (zh)', allE);
  const lwG = read('src/lib/browser-live-window.js');
  const moreSrc = lwG.slice(lwG.indexOf('tabRowMore.onclick'), lwG.indexOf('function clickOf('));
  ok(/foldMenuRows\(rows, \(x\) => clickOf\(x\), t\)/.test(moreSrc) && /action: \(\) => chipClick\(x\)/.test(moreSrc) && !/disabled: true/.test(moreSrc), 'G1 source: the client\'s "▾+N" handler builds its entries from foldMenuRows and runs chipClick — no `disabled: true` left');
  // G2 — the watch line names both tabs (bounded; en / zh / ja)
  const longT = 'L'.repeat(300) + '<b>x</b>';
  const g2 = { en: W.watchLineWords({ watched: 'Docs', current: 'Agent now' }, null), poll: W.watchLineWords({ watched: 'Docs', current: 'Agent now', mode: 'polling' }, null), zh: W.watchLineWords({ watched: 'Docs', current: 'Agent now' }, tOfD(ZH)), ja: W.watchLineWords({ watched: 'Docs', current: 'Agent now', mode: 'polling' }, tOfD(JA)), cut: W.watchLineWords({ watched: longT, current: 'B' }, null), none: W.watchLineWords({ watched: 'Docs', current: '' }, null) };
  ok(g2.en === 'Watching “Docs” — the agent is on “Agent now”' && g2.poll === 'Watching “Docs” — a new picture every half second; the agent is on “Agent now”' && g2.zh === '正在查看“Docs” — agent 在“Agent now”上' && g2.ja.includes('「Docs」') && g2.ja.includes('「Agent now」') && g2.ja.includes('0.5 秒'), 'G2 the watch line names BOTH tabs — en, the polling clause kept, zh, ja', g2);
  const cutT = (g2.cut.match(/“(.*?)”/) || [])[1] || '';
  ok(Array.from(cutT).length === W.WATCH_TITLE_MAX && cutT.endsWith('…') && !g2.cut.includes('<b>') && g2.none === 'Watching another tab of the agent’s — the agent’s current tab is unchanged', `G2 a 300-character page title is cut to ${W.WATCH_TITLE_MAX} characters (…) before it is said; a title not known keeps the unnamed sentence`, g2);
  // G3 — the watched chip never folds
  const FR = Array.from({ length: 6 }, (_, i) => ({ targetId: String(i + 1).repeat(32), title: 'Tab ' + i, owner: 'agent', active: i === 0 }));
  const FW = Object.fromEntries(FR.map((r) => [r.targetId, 100]));
  const LSL = require('../src/lib/live-strip-layout.js');
  const foldBad = []; let foldsWithout = 0;
  for (const avail of [0, 120, 250, 360, 500, 900]) for (const wi of [1, 3, 5]) {
    const f = LSL.tabRowFold({ rows: FR, widths: FW, avail, morePx: 44, watchedRef: FR[wi].targetId.toLowerCase() });
    if (f.folded.includes(FR[0].targetId) || f.folded.includes(FR[wi].targetId)) foldBad.push({ avail, wi, f });
    if (LSL.tabRowFold({ rows: FR, widths: FW, avail, morePx: 44 }).folded.includes(FR[wi].targetId)) foldsWithout++;
  }
  ok(!foldBad.length && foldsWithout > 0, `G3 tabRowFold keeps the tab on show AND the watched one at every width (6 widths × 3 watched tabs; without watchedRef the watched one folds in ${foldsWithout} cells)`, foldBad);
  const lsSrc = read('src/lib/live-strip-layout.js'); const KEEP = '  if (row && row.keep) return 0;';
  if (ok(lsSrc.includes(KEEP), 'G3 control setup: the keep clause is found')) {
    const Lc = M.load('src/lib/live-strip-layout.js', lsSrc.replace(KEEP, ''), 'no-watched-keep');
    ok(Lc.tabRowFold({ rows: FR, widths: FW, avail: 250, morePx: 44, watchedRef: FR[5].targetId }).folded.includes(FR[5].targetId), 'G3 CONTROL: a layout copy without the watched keep folds the watched chip at 250 px — the leg above can go red');
  }
  ok(/watchedRef: st\.watch \? st\.watch\.targetId : null/.test(lwG), 'G3 source: the client\'s refold passes the watched tab');
  // G4 + G5 — the client's reading (the bridge's halves are in ② b)
  const helloSrc = lwG.slice(lwG.indexOf("      case 'hello':"), lwG.indexOf("      case 'mode': {"));
  ok(/if \(st\.watch\) \{ if \(st\.mode === 'takeover' && st\.mine\) st\.watch = null; else \{ st\.watch = \{ \.\.\.st\.watch, pending: true \}; send\(\{ type: 'watch-tab', targetId: st\.watch\.targetId \}\); \}/.test(helloSrc), 'G4 source: the client\'s hello re-sends its watch (or drops it when it drives now) — one truth after a reconnect');
  const RW = (refused, why, d = null) => W.watchRefusalWords({ refused, why, error: 'SERVER ENGLISH' }, d ? tOfD(d) : null);
  const g5 = { en: W.WATCH_REFUSALS.map((c) => RW(c)), why: ['unreachable', 'no_screencast', 'no_tab', 'odd'].map((w) => RW('unreadable', w)), zh: [RW('unavailable', '', ZH), RW('unreadable', 'no_tab', ZH)], ja: RW('unreadable', 'unreachable', JA), unknown: RW('brand_new') };
  ok(![...g5.en, ...g5.why, ...g5.zh, g5.ja].some((x) => /SERVER ENGLISH/.test(x)) && g5.why.join('|') === 'the tab could not be reached|the tab refused a screencast|the tab is gone|the tab could not be shown' && g5.zh.join('|') === '这台服务器无法显示另一个标签页|那个标签页已经关闭' && g5.ja === JA['the tab could not be reached'] && g5.unknown === 'SERVER ENGLISH' && /watchRefusalWords\(\{ refused: m\.refused, why: m\.why, error: m\.error \}, t\)/.test(lwG), 'G5 a refusal is worded BY CODE (driving / not_your_tab / unavailable / unreadable + the capture\'s why) in en/zh/ja — never the server\'s sentence; an unknown code keeps it', g5);
}

// ═══ ② THE REAL BRIDGE ════════════════════════════════════════════════════
console.log('— ② the real bridge over a fake stream server + a stub keeper');
async function fakeUpstream() {
  const port = await freePort();
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  const wss = new WebSocketServer({ server: srv });
  const clients = new Set();
  const U = { port, seq: 0, clients };
  U.emit = (o) => { const t = JSON.stringify(o); for (const c of clients) if (c.readyState === 1) c.send(t); };
  U.frame = (tag = 'up') => U.emit({ type: 'frame', seq: ++U.seq, data: jpegOf(1280, 720, tag + U.seq), metadata: { deviceWidth: 1280, deviceHeight: 720, timestamp: 0 } });
  wss.on('connection', (ws) => {
    clients.add(ws); ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true, viewportWidth: 1280, viewportHeight: 720 }));
    ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T1, active: true, url: 'https://a.test/', title: 'a' }, { tabId: 't2', targetId: T2, active: false, url: 'https://b.test/', title: 'b' }] }));
    ws.send(JSON.stringify({ type: 'url', url: 'https://a.test/' }));
    setTimeout(() => U.frame('open'), 10); // ONE frame — then the tab paints nothing (a background tab of its window)
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  U.close = () => new Promise((r) => { for (const c of clients) { try { c.terminate(); } catch { } } wss.close(); srv.close(() => r()); });
  return U;
}
function stubKeeper(U, { visibility = 'hidden' } = {}) {
  const calls = { vis: [], cap: [], watch: [], acts: [], stops: 0 };
  const watches = [];
  const k = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }),
    streamPortFor: async () => ({ ok: true, port: U.port }),
    tabOwnersFor: async () => ({ ok: true, owners: { [T1]: 'agent', [T2]: 'agent', [T3]: 'other' }, mediated: false, adoptable: false, titles: { [T2]: 'Other page', [T3]: 'not listed by this stream', ['E'.repeat(32)]: 'a tab this view does not list' }, whose: { [T2]: { sessionId: 'sess-b' }, ['E'.repeat(32)]: { job: 'jb-1', name: 'collect', sessionId: null } } }), // accept-fixes-strip F7/F8
    tabVisibilityFor: async (t, id) => { calls.vis.push(id); const v = typeof visibility === 'function' ? visibility() : visibility; return v && typeof v === 'object' ? v : { ok: true, visibility: v }; }, // B-d635: an object = the keeper's own answer (a tab that never answers)
    captureTabFor: async (t, id) => { calls.cap.push(id); return { ok: true, data: jpegOf(800, 600, 'bg' + calls.cap.length), clientWidth: 800, clientHeight: 600 }; },
    watchTabFor: async (t, id, hooks) => { if (k.watchFail) return k.watchFail; calls.watch.push(id); watches.push({ id, hooks }); return { ok: true, close: () => { calls.stops++; } }; },
    userTabAct: async ({ act, targetId }) => {
      calls.acts.push([act, targetId]);
      if (targetId === T3) { const e = new Error('that tab is not this conversation\'s'); e.code = 'not_your_tab'; throw e; }
      return targetId === T1 ? { ok: true, act, targetId, switchedTo: targetId, broughtForward: true } : { ok: true, act, targetId, switchedTo: targetId };
    },
  };
  return { k, calls, watches };
}
async function bridgeOn(BSmod, keeper) {
  const activeSessions = new Map([['s1', { _browserKey: 'bk-0000000a', _browserEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'] }], ['sess-b', { name: 'office-devices' }]]);
  const logs = [];
  // the background check on SHORT clocks (the shipped ones — 2 s silence, a 1 s tick, a 500 ms poll — are pinned in ①)
  const bridge = BSmod.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn: (m) => logs.push(m), log: (m) => logs.push(m) }, bgSilenceMs: SILENCE, bgTickMs: 100, bgPollMs: 150, bgHungMs: HUNG });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
  const close = () => new Promise((r) => { bridge.shutdown(); srv.close(() => r()); });
  return { bridge, P, logs, close };
}
function viewer(P) {
  const ws = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?session=s1`);
  const V = { ws, msgs: [], frames: [], you: null };
  ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } m._at = Date.now(); if (m.type === 'frame') V.frames.push(m); else V.msgs.push(m); if (m.type === 'hello') V.you = m.you; });
  V.send = (o) => ws.send(JSON.stringify(o));
  V.of = (type) => V.msgs.filter((m) => m.type === type);
  V.ready = () => until(() => V.you !== null && V.frames.length >= 1, 5000);
  V.close = () => new Promise((r) => { if (ws.readyState === 3) return r(); ws.once('close', r); ws.close(); });
  return V;
}

// a. the tab on show paints nothing ⇒ said + polled; frames again ⇒ cleared
async function backgroundLeg(BSmod, { visibility = 'hidden', sayWaitMs = 2500 } = {}) {
  const U = await fakeUpstream();
  let vis = visibility;
  const { k, calls } = stubKeeper(U, { visibility: () => vis });
  const B = await bridgeOn(BSmod, k);
  const A = viewer(B.P);
  const out = { ready: await A.ready() };
  const t0 = Date.now();
  out.said = await until(() => A.of('tab-background').some((m) => m.targetId === T1), sayWaitMs);
  out.saidAfterMs = out.said ? A.of('tab-background').find((m) => m.targetId === T1)._at - t0 : null;
  out.vis = calls.vis.slice();
  if (out.said) {
    await sleep(700);
    out.polled = A.frames.filter((f) => f.metadata && f.metadata.polled === 'background').length;
    out.logBg = B.logs.some((l) => /is in the BACKGROUND of its window/.test(l));
    const L = viewer(B.P);
    out.lateReplay = await until(() => L.of('tab-background').some((m) => m.targetId === T1), 2000);
    // a STRAY frame while the page still says hidden (Chrome sends one at a visibility flip — the heavy leg's popup) never clears it
    U.frame('stray');
    await sleep(300);
    out.strayKept = !A.of('tab-background').some((m) => m.targetId === null) && calls.vis.length >= 2;
    vis = 'visible';
    await sleep(600);
    U.frame('again');
    out.cleared = await until(() => A.of('tab-background').some((m) => m.targetId === null), 1500);
    const n0 = A.frames.filter((f) => f.metadata && f.metadata.polled === 'background').length;
    await sleep(500);
    out.pollStopped = A.frames.filter((f) => f.metadata && f.metadata.polled === 'background').length === n0;
    out.logClear = B.logs.some((l) => /no longer a silent background tab/.test(l));
    await L.close();
  } else await sleep(200);
  await A.close(); await B.close(); await U.close();
  return out;
}
{
  const r = await backgroundLeg(BS);
  ok(r.ready && r.said && r.saidAfterMs >= SILENCE - 100 && r.saidAfterMs <= SILENCE + 1500 && r.vis.includes(T1), `U0b(b): the tab on show sent no frame for the silence clock (${SILENCE} ms here; 2 s shipped) ⇒ the bridge ASKED the page and said \`tab-background\` (${r.saidAfterMs} ms after the view opened) — the user never clicks a frozen picture in silence`, r);
  ok(r.polled >= 2 && r.logBg, `…its picture is POLLED meanwhile (${r.polled} captures in 0.7 s at the gate's 150 ms poll) and the journal names it`, r);
  ok(r.lateReplay, '…a viewer that joins later is told at once (replayed)');
  ok(r.strayKept, '…a STRAY frame while the page still answers hidden does NOT clear it — the frame makes the bridge re-ask the page at once, only `visible` clears', r);
  ok(r.cleared && r.pollStopped && r.logClear, '…a frame once the page answers visible clears it: `tab-background` null, the polling stops, the journal says why', r);
  const v = await backgroundLeg(BS, { visibility: 'visible', sayWaitMs: 3 * SILENCE }); // 3× the silence clock: never said
  ok(v.ready && !v.said && v.vis.length >= 1, `a SILENT but VISIBLE tab (a static page) is asked (${v.vis.length}×) and NOT said — silence alone is not "background"`, v);
  const src = read('src/server/browser-stream.js');
  const ARM = "    if (relay.bgTimer || !keeper || typeof keeper.tabVisibilityFor !== 'function') return;\n";
  ok(src.includes(ARM), 'control setup: the background check is armed per relay');
  const c = await backgroundLeg(M.load('src/server/browser-stream.js', src.replace(ARM, '    return;\n'), 'no-bg-check'), { sayWaitMs: 3 * SILENCE });
  ok(c.ready && !c.said && !c.vis.length, 'NEGATIVE CONTROL: a bridge copy without the check leaves the frozen picture unsaid (userW\'s 卡死) — the leg above can go red', JSON.stringify(c));
}

// a2. B-d635 (lane browser-reliability, userW's inc-murizo36-ecri): a tab that sends nothing AND never answers (hung, not
// hidden) — the base returned silently (a blank canvas with loading dots for good); it is said `unresponsive`, nothing polled
async function hungLeg(BSmod) {
  const U = await fakeUpstream();
  let vis = { ok: false, error: 'Runtime.evaluate timed out' };
  const { k, calls } = stubKeeper(U, { visibility: () => vis });
  const B = await bridgeOn(BSmod, k);
  const A = viewer(B.P);
  const out = { ready: await A.ready() };
  const t0 = Date.now();
  const said = () => A.of('tab-background').find((m) => m.targetId === T1);
  out.said = await until(() => !!said(), SILENCE + HUNG + 2500);
  out.state = out.said ? said().state : null;
  out.asksBefore = calls.vis.length;
  out.saidAfterMs = out.said ? said()._at - t0 : null;
  if (out.said) {
    await sleep(600);
    out.captures = calls.cap.length;
    out.logHung = B.logs.some((l) => /sends no picture and does not answer/.test(l));
    const L = viewer(B.P);
    out.lateReplay = await until(() => L.of('tab-background').some((m) => m.targetId === T1 && m.state === 'unresponsive'), 2000);
    vis = 'visible';
    U.frame('again');
    out.cleared = await until(() => A.of('tab-background').some((m) => m.targetId === null), 2500);
    await L.close();
  } else await sleep(200);
  await A.close(); await B.close(); await U.close();
  return out;
}
{
  const r = await hungLeg(BS);
  ok(r.ready && r.said && r.state === 'unresponsive' && r.saidAfterMs >= SILENCE + HUNG - 150 && r.asksBefore >= 2 && r.captures === 0 && r.logHung && r.lateReplay && r.cleared, `B-d635: a tab on show that sends nothing and NEVER ANSWERS is said \`unresponsive\` (${r.saidAfterMs} ms after the view opened; the journal names it; nothing polled — ${r.captures} captures; a late viewer is told) and an answer + a frame clear it — never a blank canvas with no words`, r);
  const src = read('src/server/browser-stream.js');
  const HUNG_LINE = "      if (!r || !r.ok) { if (!r || r.error !== 'no tab') noAnswer(relay, id, t, (r && r.error) || 'no answer'); return; }";
  ok(src.includes(HUNG_LINE), 'B-d635 control setup: the unresponsive verdict line is found');
  const c = await hungLeg(M.load('src/server/browser-stream.js', src.replace(HUNG_LINE, '      if (!r || !r.ok) return;'), 'hung-silent'));
  ok(c.ready && !c.said, 'B-d635 CONTROL: a bridge copy that returns silently on no answer (the base) leaves the hung tab unsaid — the leg above can go red', JSON.stringify(c));
  const lw = read('src/lib/browser-live-window.js');
  ok(/state: m\.state === 'unresponsive' \? 'unresponsive' : 'hidden'/.test(lw) && /st\.bg && st\.bg\.state === 'unresponsive'/.test(lw) && /is not responding — no picture, and it did not answer when asked/.test(lw), 'B-d635: the live view words the unresponsive verdict (watching and driving) beside the hidden one');
}

// a3. B-d635 verify r1: a SLOW but alive tab — a page busy with JS for a few seconds misses an ask (measured on a real Chrome:
// 3 s of JS, the 2.5 s ask timed out, the next answered `visible`) and was told "not responding"; now it must stay unsaid
async function slowLeg(BSmod, misses) {
  const U = await fakeUpstream();
  let n = 0;
  const { k, calls } = stubKeeper(U, { visibility: () => (++n <= misses ? { ok: false, error: 'Runtime.evaluate timed out' } : 'visible') });
  const B = await bridgeOn(BSmod, k);
  const A = viewer(B.P);
  const out = { misses, ready: await A.ready() };
  await sleep(SILENCE + HUNG + 1500);
  out.asks = calls.vis.length;
  out.records = A.of('tab-background').map((m) => (m.targetId ? m.state || 'hidden' : 'cleared'));
  out.saidHung = out.records.includes('unresponsive');
  await A.close(); await B.close(); await U.close();
  return out;
}
{
  const s1 = await slowLeg(BS, 1), s2 = await slowLeg(BS, 2);
  ok(s1.ready && s2.ready && s1.asks > 1 && s2.asks > 2 && !s1.saidHung && !s2.saidHung && !s1.records.length && !s2.records.length, `B-d635 verify r1: a slow but ALIVE tab (it missed ${s1.misses}, then ${s2.misses} asks in a row, then answered \`visible\`) is never said "not responding" — ${s1.asks} / ${s2.asks} asks, records ${JSON.stringify(s1.records)} ${JSON.stringify(s2.records)}`, JSON.stringify({ s1, s2 }));
  const src = read('src/server/browser-stream.js');
  const LINE = "noAnswer(relay, id, t, (r && r.error) || 'no answer'); return; }";
  ok(src.includes(LINE), 'B-d635 verify r1 control setup: the no-answer line is found');
  const c = await slowLeg(M.load('src/server/browser-stream.js', src.replace(LINE, "setBackground(relay, id, 'unresponsive', (r && r.error) || 'no answer'); return; }"), 'one-miss'), 1);
  ok(c.ready && c.saidHung, `B-d635 verify r1 CONTROL: a bridge copy that says "not responding" at the FIRST missed ask (the lane's a2066802) tells the slow tab so (${JSON.stringify(c.records)}) — the leg above can go red`, JSON.stringify(c));
}

// a4. B-d635 verify r1: a miss from long ago does not count — a recorder tap keeps the relay (and its verdict state) alive
// with nobody watching; a viewer back after a pause longer than HUNG whose FIRST ask misses (a busy page) is not told
async function staleLeg(BSmod) {
  const U = await fakeUpstream();
  let n = 0, missAt = new Set([1, 2]);
  const { k, calls } = stubKeeper(U, { visibility: () => (missAt.has(++n) ? { ok: false, error: 'Runtime.evaluate timed out' } : 'visible') });
  const B = await bridgeOn(BSmod, k);
  const tap = await B.bridge.tap('s1', null, () => { });
  const A = viewer(B.P);
  const out = { tapped: !!(tap && tap.ok), ready: await A.ready() };
  out.firstMiss = await until(() => calls.vis.length >= 1, SILENCE + 2000);
  await A.close();
  await sleep(HUNG + 600);
  const asks0 = calls.vis.length;
  const V = viewer(B.P);
  out.ready2 = await V.ready();
  await sleep(SILENCE + HUNG + 600);
  out.asksBack = calls.vis.length - asks0;
  out.records = V.of('tab-background').map((m) => (m.targetId ? m.state || 'hidden' : 'cleared'));
  out.saidHung = out.records.includes('unresponsive');
  await V.close(); try { tap && tap.untap && tap.untap(); } catch { } await B.close(); await U.close();
  return out;
}
{
  const r = await staleLeg(BS);
  ok(r.tapped && r.ready && r.ready2 && r.firstMiss && r.asksBack >= 2 && !r.saidHung, `B-d635 verify r1: a miss from before a pause (nobody watching, a tap kept the relay) does not count — the viewer back is not told "not responding" at its first missed ask (${r.asksBack} asks, records ${JSON.stringify(r.records)})`, JSON.stringify(r));
  const src = read('src/server/browser-stream.js');
  const GAP = ' || t0 - b.noAnswer.last > bgHungMs) b.noAnswer = { id, since: t0 };';
  ok(src.includes(GAP), 'B-d635 verify r1 control setup: the pause clause is found');
  const c = await staleLeg(M.load('src/server/browser-stream.js', src.replace(GAP, ') b.noAnswer = { id, since: t0 };'), 'no-pause'));
  ok(c.ready2 && c.saidHung, `B-d635 verify r1 CONTROL: a bridge copy that keeps the old miss says "not responding" at the returning viewer's first miss (${JSON.stringify(c.records)}) — the leg above can go red`, JSON.stringify(c));
}

// b. a watching viewer's chip moves ITS view
{
  const U = await fakeUpstream();
  const { k, calls, watches } = stubKeeper(U, { visibility: 'visible' });
  const B = await bridgeOn(BS, k);
  const Wv = viewer(B.P), O = viewer(B.P);
  ok(await Wv.ready() && await O.ready(), 'two viewers of the conversation\'s window');
  ok(await until(() => Wv.of('tab-owners').length >= 1, 3000), 'the tab owners reached the viewers (whose each tab is)');
  { const want = (r) => JSON.stringify(r.titles) === JSON.stringify({ [T2]: 'Other page' }) && JSON.stringify(r.names) === JSON.stringify({ [T2]: { sessionId: 'sess-b', name: 'office-devices' } }); await until(() => Wv.of('tab-owners').some(want), 3000); const r = Wv.of('tab-owners').find(want) || Wv.of('tab-owners').at(-1) || {}; ok(want(r) && Wv.of('tab-owners').every((x) => !JSON.stringify(x).includes('E'.repeat(32))), 'accept-fixes-strip F7/F8: the record carries the pages\' own titles and WHO holds another\'s tab (its conversation\'s name) — only for the tabs this view lists', JSON.stringify({ titles: r.titles, names: r.names })); }
  Wv.send({ type: 'watch-tab', targetId: T2 });
  ok(await until(() => calls.watch.includes(T2), 2000) && await until(() => Wv.of('watching').some((m) => m.targetId === T2), 2000), 'watch-tab T2 ⇒ the keeper\'s watch pump is opened on T2 and the viewer is told `watching T2`');
  watches[0].hooks.onFrame({ data: jpegOf(640, 480, 'watched1'), metadata: { deviceWidth: 640, deviceHeight: 480 } });
  ok(await until(() => Wv.frames.some((f) => f.metadata && f.metadata.watched === T2), 1500) && !O.frames.some((f) => f.metadata && f.metadata.watched), 'the watched tab\'s frame reaches ONLY the watching viewer (the other view keeps the agent\'s)');
  const wBefore = Wv.frames.length, oBefore = O.frames.length;
  U.frame('agent');
  await until(() => O.frames.length > oBefore, 1500); await sleep(150);
  ok(O.frames.length > oBefore && Wv.frames.length === wBefore, 'the agent\'s next frame reaches the other view and NOT the watching one (its view moved; the agent\'s tab is untouched)', { wBefore, wAfter: Wv.frames.length });
  watches[0].hooks.onMode('polling');
  ok(await until(() => Wv.of('watching').some((m) => m.targetId === T2 && m.mode === 'polling'), 1500), 'the pump\'s mode is said: a tab that paints nothing is shown by captures (polling)');
  Wv.send({ type: 'watch-tab', targetId: T3 });
  ok(await until(() => calls.watch.includes(T3) && Wv.of('watching').some((m) => m.targetId === T3), 1500) && B.logs.some((l) => /watches another holder's tab C3333333/.test(l)), 'accept-fixes-strip F8: another conversation\'s tab is WATCHED (view only — a pump opened on it, journaled by whose it is)');
  Wv.send({ type: 'watch-tab', targetId: 'D'.repeat(32) });
  ok(await until(() => Wv.of('watching').some((m) => m.refused === 'no_such_tab'), 1500) && !calls.watch.includes('D'.repeat(32)) && B.logs.some((l) => /watch of DDDDDDDD refused no_such_tab/.test(l)), '…a tab that is not one of this browser\'s is REFUSED by name (no pump opened; journaled)');
  Wv.send({ type: 'watch-tab', targetId: T2 });
  await until(() => calls.watch.filter((x) => x === T2).length === 2, 1500);
  const stops0 = calls.stops, nulls0 = Wv.of('watching').filter((m) => m.targetId === null).length, f0 = Wv.frames.length;
  Wv.send({ type: 'watch-tab', targetId: null });
  ok(await until(() => calls.stops > stops0 && Wv.of('watching').filter((m) => m.targetId === null).length > nulls0 && Wv.frames.length > f0, 1500) && !(Wv.frames.at(-1).metadata || {}).watched, 'watch-tab null ⇒ the pump is closed, the view says it follows the agent\'s tab again and gets the agent\'s last picture at once');
  ok(B.logs.some((l) => /viewer \d+ watches the agent's tab B2222222 \(its current tab A1111111 is unchanged\)/.test(l)) && B.logs.some((l) => /follows the agent's tab again/.test(l)), 'every watch and every return is journaled (whose tab, the agent\'s current tab unchanged)');
  // lane live-watch-polish G4: a re-sent watch of the tab the agent is on NOW (a reconnected view's, the agent moved there) is answered
  const nullsF = Wv.of('watching').filter((m) => m.targetId === null).length, wF = calls.watch.length;
  Wv.send({ type: 'watch-tab', targetId: T1 });
  ok(await until(() => Wv.of('watching').filter((m) => m.targetId === null).length > nullsF, 1500) && calls.watch.length === wF, 'G4 a watch-tab of the agent\'s CURRENT tab (a reconnected view re-sending its watch after the agent moved there) is ANSWERED `watching null` — no pump opened, the view\'s line clears');
  // lane live-watch-polish G5: a capture that fails carries its CODE to the view (`why`) — the client words it
  k.watchFail = { ok: false, code: 'unreachable', error: 'the tab could not be reached' };
  Wv.send({ type: 'watch-tab', targetId: T2 });
  const g5m = (await until(() => Wv.of('watching').some((m) => m.refused === 'unreadable'), 1500)) ? Wv.of('watching').find((m) => m.refused === 'unreadable') : null;
  k.watchFail = null;
  ok(!!g5m && g5m.why === 'unreachable' && W.watchRefusalWords(g5m, null) === 'the tab could not be reached', 'G5 a capture that could not reach the tab is refused `unreadable` WITH its code (`why: unreachable`) — the view words it by code', g5m);
  Wv.send({ type: 'watch-tab', targetId: T2 });
  await until(() => calls.watch.filter((x) => x === T2).length === 3, 1500);
  const stops1 = calls.stops;
  Wv.send({ type: 'takeover' });
  ok(await until(() => calls.stops > stops1 && Wv.of('watching').some((m) => m.targetId === null && /took over/.test(String(m.ended || ''))), 1500), 'a TAKEOVER ends the taker\'s watch (it drives the agent\'s tab) — said');
  Wv.send({ type: 'watch-tab', targetId: T2 });
  ok(await until(() => Wv.of('watching').some((m) => m.refused === 'driving'), 1500), 'the holder\'s watch-tab is refused `driving` (its chip switches the agent\'s tab instead)');
  // c. the chip acts are journaled and answered
  Wv.send({ type: 'tab-act', act: 'switch', targetId: T1, rid: 7 });
  ok(await until(() => Wv.of('tab-ack').some((m) => m.rid === 7 && m.ok && m.broughtForward), 2000) && B.logs.some((l) => /tab switch on A1111111 — brought the agent's current tab to the front of its window/.test(l)), 'U0b(c): a chip click on the agent\'s current tab while driving is a BRING-FORWARD — answered (`broughtForward`) and journaled');
  Wv.send({ type: 'tab-act', act: 'switch', targetId: T2, rid: 8 });
  ok(await until(() => Wv.of('tab-ack').some((m) => m.rid === 8 && m.ok && !m.broughtForward), 2000) && B.logs.some((l) => /tab switch on B2222222 — switched the agent's current tab/.test(l)), '…a switch to another of its tabs: answered and journaled');
  Wv.send({ type: 'tab-act', act: 'switch', targetId: T3, rid: 9 });
  ok(await until(() => Wv.of('tab-ack').some((m) => m.rid === 9 && !m.ok && m.code === 'not_your_tab'), 2000) && B.logs.some((l) => /tab switch on C3333333 — refused not_your_tab/.test(l)), '…a refused one: answered by name and journaled (before this lane a user tab act left no line anywhere)');
  await Wv.close(); await O.close(); await B.close(); await U.close();
}

// d. verify r1 ④ (2026-10-01): NO CAPTURE WITHOUT A VIEWER — a recorder tap keeps a holder's relay alive for hours after the
//    last viewer left and the poll kept asking Chrome for a picture twice a second (reproduced: 11 captures in the second after
//    the viewer left); a page that LIES hidden (document.visibilityState overridden) under a 60 fps stream kept the notice for
//    ever, re-asking + capturing twice a second — the FRAME FACTS clear it now. CONTROL: a bridge copy that trusts only the word.
console.log('— ②d verify r1 ④: the poll stops with the last viewer; a painting tab clears a lying page\'s verdict');
{
  const U = await fakeUpstream(); const { k, calls } = stubKeeper(U, { visibility: 'hidden' }); const B = await bridgeOn(BS, k);
  const tap = await B.bridge.tap('s1', null, () => { });
  const A = viewer(B.P); await A.ready();
  const said = await until(() => A.of('tab-background').some((m) => m.targetId === T1), 2500);
  await sleep(400);
  const c0 = calls.cap.length; await A.close(); await sleep(600); const c1 = calls.cap.length;
  ok(tap.ok && said && c0 >= 1 && c1 === c0, `verify r1 ④: the picture poll STOPS when the last viewer leaves (a recorder tap keeps the relay) — ${c0} capture(s) with a viewer, ${c1 - c0} in the 600 ms after (before: 2 a second for the relay's life)`, { c0, c1 });
  const L = viewer(B.P); await L.ready(); await sleep(500);
  ok(calls.cap.length > c1 && L.of('tab-background').some((m) => m.targetId === T1), '…a late viewer is told the verdict at once and the pictures resume for it');
  await L.close(); try { tap.untap(); } catch { } await B.close(); await U.close();
}
{
  const U = await fakeUpstream(); const { k } = stubKeeper(U, { visibility: 'hidden' }); const B = await bridgeOn(BS, k);
  const A = viewer(B.P); await A.ready();
  const said = await until(() => A.of('tab-background').some((m) => m.targetId === T1), 2500);
  const storm = setInterval(() => U.frame('storm'), 16);
  const cleared = await until(() => A.of('tab-background').some((m) => m.targetId === null), 2000);
  clearInterval(storm);
  ok(said && cleared && B.logs.some((l) => /it paints again \(\d+ frames in a second\)/.test(l)), 'verify r1 ④: a page that LIES hidden under a 60 fps stream is cleared by the FRAME FACTS (5 frames in a second) and the journal says why — never a notice for ever with 2 re-asks + 2 captures a second');
  await A.close(); await B.close(); await U.close();
  const src = read('src/server/browser-stream.js');
  const PAINT = "    { const pa = WIN.paintsAgain({ frameTimes: b.frameTimes || [], now: t }); if (pa.paints) { clearBackground(relay, `it paints again (${pa.recent} frames in a second)`); return; } }\n";
  ok(src.includes(PAINT), 'control setup: the frame-facts rule is found in the bridge');
  const U2 = await fakeUpstream(); const S2 = stubKeeper(U2, { visibility: 'hidden' }); const B2 = await bridgeOn(M.load('src/server/browser-stream.js', src.replace(PAINT, ''), 'page-word-only'), S2.k);
  const A2 = viewer(B2.P); await A2.ready();
  const said2 = await until(() => A2.of('tab-background').some((m) => m.targetId === T1), 2500);
  const storm2 = setInterval(() => U2.frame('storm'), 16);
  const cleared2 = await until(() => A2.of('tab-background').some((m) => m.targetId === null), 1500);
  clearInterval(storm2);
  ok(said2 && !cleared2, 'NEGATIVE CONTROL: a bridge copy that trusts only the page\'s word keeps the notice under the storm — the leg above can go red');
  await A2.close(); await B2.close(); await U2.close();
}

// ═══ ③ verify r1 (T1): THE WINDOW-OWNERSHIP TABLE — who may act on which target, every cell read off the real module, a control per rule ═══
// cdp-protocol-under-test — the 'Page.navigate' / 'Target.*' literals below are CDP MESSAGES judged by the PURE mediation (no chrome, no page of VibeSpace's: §47)
console.log('— ③ verify r1 T1: the window-ownership table (actor × target × act ⇒ allowed / refused by name / paused-by-takeover)');
{
  const MED = require('../src/browser-mediation.js');
  const TBS = require('../src/browser-tabs.js');
  const A1 = 'A1'.padEnd(32, 'A'), A2 = 'A2'.padEnd(32, 'A'), B1 = 'B1'.padEnd(32, 'B'), H1 = 'C1'.padEnd(32, 'C'); // CDP target ids (32 hex — the tabs verdict refuses any other shape by name)
  const scopeA = () => { const s = MED.newScope({ targets: [A1, A2] }); s.sessions.set('S-A', A1); return s; };
  const jc = (Mod, msg, scope, paused = false) => { const v = Mod.judge({ id: 1, ...msg }, scope, { paused }); return v.kind === 'forward' ? 'allowed' : Mod.refusalCodeOf(v.reply); };
  const place = (Mod, params) => { const v = Mod.judge({ id: 1, method: 'Target.createTarget', params }, scopeA()); return v.kind !== 'forward' ? Mod.refusalCodeOf(v.reply) : v.rewrite && v.rewrite.newWindow === true ? 'own-window' : 'as-written'; };
  const ownA = new Set([A1, A2]);
  const agentTab = (act, id) => { const v = TBS.agentTabVerdict({ act, ref: id, targetId: id, own: ownA, current: A1 }); return v.ok ? 'allowed' : v.code; };
  const userTab = (o) => { const v = TBS.userTabVerdict({ counts: { agent: 2, you: 2 }, ...o }); return v.ok ? 'allowed' : v.code; };
  const leases = [{ profileId: 'bp-1', browserKey: 'bk-0000000a', windowIn: '1', windowId: 11 }, { profileId: 'bp-1', browserKey: 'bk-0000000b', windowIn: '1', windowId: 12 }, { profileId: 'bp-1', browserKey: 'bk-0000000c' }, { profileId: 'bp-1', browserKey: 'bk-0000000d' }];
  const mates = (bk) => W.windowMates({ leases, profileId: 'bp-1', browserKey: bk, instance: '1' }).map((l) => l.browserKey).join(',');
  const click = (o) => W.tabClickVerdict({ owner: 'agent', targetId: A2, ...o }).act;
  const popup = (Mod, opener) => (Mod.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-P', type: 'page', openerId: opener, url: 'x' } } }, scopeA()) ? 'A-window (admitted)' : 'dropped');
  const T = [ // [rule, actor, target, act, verdict(), expected]
    ['R1 scope', 'lease A (mediated CDP)', "A's window", 'navigate', () => jc(MED, { method: 'Page.navigate', params: { url: 'https://a' }, sessionId: 'S-A' }, scopeA()), 'allowed'],
    ['R1 scope', 'lease A (mediated CDP)', "B's window", 'navigate', () => jc(MED, { method: 'Page.navigate', params: { url: 'https://a' }, sessionId: 'S-B' }, scopeA()), 'session_out_of_scope'],
    ['R1 scope', 'lease A (mediated CDP)', "A's window", 'Target.activateTarget', () => jc(MED, { method: 'Target.activateTarget', params: { targetId: A2 } }, scopeA()), 'allowed'],
    ['R1 scope', 'lease A (mediated CDP)', "B's window", 'Target.activateTarget', () => jc(MED, { method: 'Target.activateTarget', params: { targetId: B1 } }, scopeA()), 'target_out_of_scope'],
    ['R1 scope', 'lease A (mediated CDP)', "the human's window", 'Target.activateTarget', () => jc(MED, { method: 'Target.activateTarget', params: { targetId: H1 } }, scopeA()), 'target_out_of_scope'],
    ['R1 scope', 'lease A (mediated CDP)', "A's window", 'Target.closeTarget', () => jc(MED, { method: 'Target.closeTarget', params: { targetId: A2 } }, scopeA()), 'allowed'],
    ['R1 scope', 'lease A (mediated CDP)', "B's window", 'Target.closeTarget', () => jc(MED, { method: 'Target.closeTarget', params: { targetId: B1 } }, scopeA()), 'target_out_of_scope'],
    ['R1 scope', 'lease A (mediated CDP)', "A's window", 'screencast', () => jc(MED, { method: 'Page.startScreencast', params: {}, sessionId: 'S-A' }, scopeA()), 'allowed'],
    ['R1 scope', 'lease A (mediated CDP)', "B's window", 'screencast', () => jc(MED, { method: 'Page.startScreencast', params: {}, sessionId: 'S-B' }, scopeA()), 'session_out_of_scope'],
    ['R1 scope', 'lease A (mediated CDP)', "A's window", 'input', () => jc(MED, { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 1, y: 1 }, sessionId: 'S-A' }, scopeA()), 'allowed'],
    ['R1 scope', 'lease A (mediated CDP)', "B's window", 'input', () => jc(MED, { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 1, y: 1 }, sessionId: 'S-B' }, scopeA()), 'session_out_of_scope'],
    ['R7 paused', 'lease A (mediated CDP)', "A's window — the user drives it", 'input', () => jc(MED, { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 1, y: 1 }, sessionId: 'S-A' }, scopeA(), true), 'browser_interrupted'],
    ['R7 paused', 'lease A (mediated CDP)', "A's window — the user drives it", 'createTarget (tab new)', () => jc(MED, { method: 'Target.createTarget', params: { url: 'x' } }, scopeA(), true), 'browser_interrupted'],
    ['R7 paused', 'lease A (mediated CDP)', "A's window — the user drives it", 'navigate', () => jc(MED, { method: 'Page.navigate', params: { url: 'https://a' }, sessionId: 'S-A' }, scopeA(), true), 'browser_interrupted'],
    ['R2 placement', 'lease A (mediated CDP)', 'a target with no window yet', 'createTarget (plain)', () => place(MED, { url: 'x' }), 'own-window'],
    ['R2 placement', 'lease A (mediated CDP)', 'a target with no window yet', 'createTarget forTab', () => place(MED, { url: 'x', forTab: true }), 'own-window'],
    ['R2 placement', 'lease A (mediated CDP)', 'a target with no window yet', 'createTarget hidden', () => place(MED, { url: 'x', hidden: true }), 'as-written'],
    ['R2 placement', 'lease A (mediated CDP)', "a context that is not A's", 'createTarget', () => place(MED, { url: 'x', browserContextId: 'C-foreign' }), 'context_out_of_scope'],
    ['R2 placement', 'lease A (mediated CDP)', 'a target with no window yet (a create in flight)', 'act on it', () => { const s = scopeA(); const before = MED.inScope(s, 'T-N'); MED.admitReply({ id: 1, result: { targetId: 'T-N' } }, { method: 'Target.createTarget', params: { url: 'x' } }, s); return !before && MED.inScope(s, 'T-N') ? 'admitted at the reply' : 'wrong'; }, 'admitted at the reply'],
    ['R5 own tabs', 'lease A (the CLI)', "A's window", 'tab close', () => agentTab('close', A2), 'allowed'],
    ['R5 own tabs', 'lease A (the CLI)', "B's window", 'tab close', () => agentTab('close', B1), 'not_your_tab'],
    ['R5 own tabs', 'lease A (the CLI)', "B's window", 'tab <id> (switch)', () => agentTab('switch', B1), 'not_your_tab'],
    ['R5 own tabs', 'lease A (the CLI)', "the human's window", 'tab <id> (switch)', () => agentTab('switch', H1), 'not_your_tab'],
    ['R5 user acts', "a takeover viewer of A's window", "A's window", 'switch', () => userTab({ act: 'switch', owner: 'agent', driving: true }), 'allowed'],
    ['R5 user acts', "a takeover viewer of A's window", "A's window", 'close', () => userTab({ act: 'close', owner: 'agent', driving: true }), 'allowed'],
    ['R5 user acts', "a takeover viewer of A's window", "B's window", 'switch', () => userTab({ act: 'switch', owner: 'other', driving: true }), 'not_your_tab'],
    ['R5 user acts', "a takeover viewer of A's window", "the human's window (his own tab, not his last)", 'close', () => userTab({ act: 'close', owner: 'you', human: false, driving: true }), 'allowed'], // his tabs are his from any view
    ['R5 user acts', "a takeover viewer of A's window", "the human's window (his LAST tab)", 'close', () => userTab({ act: 'close', owner: 'you', human: false, driving: true, counts: { agent: 2, you: 1 } }), 'last_tab'],
    ['R5 user acts', "a takeover viewer of A's window", "the human's window", 'switch', () => userTab({ act: 'switch', owner: 'you', human: false, driving: true }), 'not_your_tab'],
    ['R5 user acts', "a watcher of A's window", "A's window", 'switch', () => userTab({ act: 'switch', owner: 'agent', driving: false }), 'take_over_first'],
    ['R4 watch', "a watcher of A's window", "A's window", 'chip click', () => click({ driving: false, active: false }), 'watch'],
    ['R4 watch', "a takeover viewer of A's window", "A's window", 'chip click', () => click({ driving: true, active: false }), 'switch'],
    ['R4 watch', "a watcher of A's window", "B's window", 'chip click (F8: view only)', () => click({ driving: false, owner: 'other' }), 'watch'],
    ['R4 watch', "a takeover viewer of A's window", "B's window", 'chip click', () => click({ driving: true, owner: 'other' }), 'none'],
    ['R6 the human', 'the human (Browse yourself)', 'his window', 'switch', () => userTab({ act: 'switch', owner: 'you', human: true }), 'allowed'],
    ['R6 the human', 'the human (Browse yourself)', "A's window", 'switch', () => userTab({ act: 'switch', owner: 'agent', human: true, driving: true }), 'not_your_tab'],
    ['R6 the human', 'the human (Browse yourself)', 'his window — his last tab', 'close', () => userTab({ act: 'close', owner: 'you', human: true, counts: { you: 1 } }), 'last_tab'],
    ['R3 takeover scope', "a takeover viewer of A's window", "B's window (its own)", 'pause', () => (mates('bk-0000000a') === '' ? 'B runs on' : 'paused-by-takeover'), 'B runs on'],
    ['R3 takeover scope', "a takeover viewer of C's window", 'D in the OLDER shared window', 'pause', () => (mates('bk-0000000c') === 'bk-0000000d' ? 'paused-by-takeover' : mates('bk-0000000c')), 'paused-by-takeover'],
    ['R9 opener', "a page script in A's tab", "A's window", 'window.open', () => popup(MED, A1), 'A-window (admitted)'],
    ['R9 opener', "a page script in B's tab", "A's scope", 'window.open', () => popup(MED, B1), 'dropped'],
    ['R1 scope', 'a tab Chrome moved by itself (no CDP move)', "A's tab in whatever window", 'any', () => (MED.inScope(scopeA(), A2) ? 'allowed (by target id)' : 'lost'), 'allowed (by target id)'],
    ['R8 red cell', 'any holder', 'its windows', 'count', () => W.multiWindowHolders(W.windowCensus([{ holder: 'A', windowId: 11 }, { holder: 'A', windowId: 11 }, { holder: 'B', windowId: 12 }])).join(',') || 'one each', 'one each'],
    ['R8 red cell', 'a holder with TWO windows', 'its windows', 'count', () => W.multiWindowHolders(W.windowCensus([{ holder: 'A', windowId: 11 }, { holder: 'A', windowId: 13 }])).join(','), 'A'],
  ];
  const got = T.map(([rule, actor, target, act, fn, want]) => { let v; try { v = fn(); } catch (e) { v = 'threw: ' + (e && e.message); } return { rule, actor, target, act, got: v, want }; });
  const bad = got.filter((r) => r.got !== r.want);
  ok(!bad.length, `T1 THE WINDOW-OWNERSHIP TABLE: ${T.length} cells (actor × target × act) — allowed / refused by name / paused-by-takeover, every cell read off the real module`, bad.map((r) => `${r.rule} | ${r.actor} | ${r.target} | ${r.act} ⇒ ${r.got} (want ${r.want})`).join('\n    '));
  console.log('    ' + got.map((r) => `${r.rule} · ${r.actor} · ${r.target} · ${r.act} ⇒ ${r.got}`).join('\n    '));
  // a CONTROL per rule: a patched copy without the rule flips its cell
  const msrc = read('src/browser-mediation.js'), wsrc = read('src/browser-windows.js'), tsrc = read('src/browser-tabs.js');
  const C1 = "    if (!inScope(scope, t)) return { kind: 'refuse', reply: refusal(id, 'target_out_of_scope', `target ${t || '(none)'} is not one of this lease's tabs`, sid) };\n";
  const C2 = "    if (ow.rewritten) return { kind: 'forward', pending: { method, params: ow.params, sessionId: sid }, rewrite: ow.params };\n";
  const C3 = '  if (me && hasOwnWindow(me, instance)) return [];\n';
  const C4 = "  return { act: 'watch', why: 'another-of-its-tabs' };\n";
  const C5 = "  if (!driving) return no('take_over_first');\n";
  const C6 = "  if (owner === 'other' || human) return no('not_your_tab');\n";
  const C8 = 'filter(([, v]) => isObj(v) && Number(v.count) > 1)';
  const C9 = '  if (info.openerId && scope.targets.has(String(info.openerId))) return true;\n';
  ok([C1, C2, C9].every((x) => msrc.includes(x)) && [C3, C4, C8].every((x) => wsrc.includes(x)) && [C5, C6].every((x) => tsrc.includes(x)), 'control setup: every rule\'s line is found in its module');
  const med1 = M.load('src/browser-mediation.js', msrc.replace(C1, '    if (false) return null;\n'), 'no-target-scope');
  ok(jc(med1, { method: 'Target.activateTarget', params: { targetId: B1 } }, scopeA()) === 'allowed', 'CONTROL R1: a mediation copy without the target fence lets lease A activate B\'s tab — the scope cells can go red');
  const med2 = M.load('src/browser-mediation.js', msrc.replace(C2, ''), 'no-placement');
  ok(place(med2, { url: 'x' }) === 'as-written' && place(med2, { url: 'x', forTab: true }) === 'as-written', 'CONTROL R2: a copy without the placement rewrite forwards the plain create (the last focused window — another holder\'s) — the placement cells can go red');
  const win3 = M.load('src/browser-windows.js', wsrc.replace(C3, ''), 'takeover-takes-all');
  ok(win3.windowMates({ leases, profileId: 'bp-1', browserKey: 'bk-0000000a', instance: '1' }).length > 0, 'CONTROL R3: a copy whose takeover takes every lease pauses B in its own window — the takeover-scope cell can go red');
  const win4 = M.load('src/browser-windows.js', wsrc.replace(C4, "  return { act: 'switch', why: 'x' };\n"), 'watch-switches');
  ok(win4.tabClickVerdict({ owner: 'agent', targetId: A2, driving: false, active: false }).act === 'switch', 'CONTROL R4: a copy whose watch click switches the agent\'s tab — the watch cell can go red');
  const C10 = "    return w && w === id ? { act: 'none', why: 'already-watched' } : { act: 'watch', why: 'view-only' };\n";
  const win10 = wsrc.includes(C10) ? M.load('src/browser-windows.js', wsrc.replace(C10, "    return { act: 'none', why: 'not-the-agents' };\n"), 'no-watch-others') : null;
  ok(!!win10 && win10.tabClickVerdict({ owner: 'other', targetId: A2, driving: false }).act === 'none' && W.tabClickVerdict({ owner: 'other', targetId: A2, driving: false }).act === 'watch', 'CONTROL F8 (accept-fixes-strip): a copy whose chip of another conversation\'s tab does nothing (the 2.369.202 rule) — the R4 watch cell can go red');
  const tabs5 = M.load('src/browser-tabs.js', tsrc.replace(C5, ''), 'no-take-over-first');
  ok(tabs5.userTabVerdict({ act: 'switch', owner: 'agent', driving: false, counts: { agent: 2 } }).ok === true, 'CONTROL R5: a copy that lets a watcher switch the agent\'s tab — the user-acts cell can go red');
  const tabs6 = M.load('src/browser-tabs.js', tsrc.replace(C6, "  if (owner === 'other') return no('not_your_tab');\n"), 'human-on-agent-tab');
  ok(tabs6.userTabVerdict({ act: 'switch', owner: 'agent', human: true, driving: true, counts: { agent: 2 } }).ok === true, 'CONTROL R6: a copy that lets the human act on an agent\'s tab from his window — the human cell can go red');
  ok(jc(MED, { method: 'Target.createTarget', params: { url: 'x' } }, scopeA(), false) === 'allowed', 'CONTROL R7: the same create with the pause not seen is allowed — the paused cells can go red');
  const win8 = M.load('src/browser-windows.js', wsrc.replace(C8, 'filter(() => false)'), 'no-red-cell');
  ok(win8.multiWindowHolders(win8.windowCensus([{ holder: 'A', windowId: 11 }, { holder: 'A', windowId: 13 }])).length === 0, 'CONTROL R8: a copy whose census never names a two-window holder — the red cell can go red');
  const med9 = M.load('src/browser-mediation.js', msrc.replace(C9, ''), 'no-opener-admission');
  ok(popup(med9, A1) === 'dropped', 'CONTROL R9: a copy that does not admit a page-opened tab drops A\'s own popup — the opener cell can go red');
  // R7 (the CLI): the agent's `tab new` while the user drives ITS window is refused browser_paused by resolveFor, the first
  // judgement of its tab verbs (test-browser-tabs drives it on the real keeper); here the order is pinned
  const kp = read('src/server/browser-keeper.js');
  const fnStart = kp.indexOf('async function agentTabAct(');
  const head = fnStart > 0 ? kp.slice(fnStart, kp.indexOf('const out = { ok: true, act: w.act', fnStart)) : '';
  ok(fnStart > 0 && head.length > 0 && head.includes('resolveFor(') && !head.includes('rt.exec('), 'R7 (the CLI): the agent\'s `tab new` is judged by resolveFor (browser_paused while the user drives its window) BEFORE the act — no exec before it, never a second window to escape a takeover');
  // T2 ⑧ (the owner, 2026-10-01 23:20): ONE WINDOW PER HOLDER — the keeper's later tab opens IN the holder's window (the opener
  // rule, measured reliable; activate-then-create is not) and is verified with Browser.getWindowForTarget (window_mismatch)
  ok(/openTabInWindow\(rec\.cdpUrl, \{ anchorTargetId: x, windowId: wantWin \}\)/.test(kp) && /openTabByActivate\(rec\.cdpUrl, \{ anchorTargetId: x, windowId: wantWin, tries: WIN\.RUNG2_TRIES, breaker: plan\.breaker \}\)/.test(kp) && /rung2Serialized\(p\.id,/.test(kp) && /window_mismatch/.test(read('src/server/browser-viewport.js')) && W.ONE_WINDOW_PER_HOLDER.mechanism === 'opener-rule' && /^a window-state cycle \(never under a live view, never on a real display\) \+ activate \+ a BACKGROUND create \(verified/.test(W.ONE_WINDOW_PER_HOLDER.rung2), 'T2 ⑧ wiring: a later tab of a holder opens IN its window by the opener rule from each live anchor, then rung 2 (activate + create), every landing verified with Browser.getWindowForTarget (window_mismatch by name) — test-browser-share ③c reads Chrome\'s own windows into the census');
}


// ═══ ④ verify r2 T1 (lane browser-windows): THE OPENER RULE'S OWN TABLE ════════════════════════════════════════════
// The REAL keeper over a FAKE TARGET MODEL (windows × targets × an opener's state) with the fake agent-browser on PATH
// (the tabs suite's inline fake, cloned): its `openWindow` / `windowOf` / `openTabInWindow` / `openTabByActivate` /
// `closeTarget` / `readTargets` are the model's. Every cell = an opener STATE the verify-r2 measurement found on the
// real Chrome 154 (headless and the hidden window agree): a plain page lands; a site overriding window.open HIJACKS a
// main-world act (no tab); a dialog / a crash / a navigation time the page act out while Browser.getWindowForTarget still
// answers the window; a closed anchor fails at once while the window lives on; rung 2 (activate + a plain create,
// verified) lands where the page act cannot; a popup-feature open is a NEW window whose opener is the holder's tab. The
// RED CELL of every row: the holder's window count after the act (one, or the row says why not).
console.log('— ④ verify r2 T1: the opener rule\'s own table — the real keeper over a fake target model (the per-holder window count is the red cell)');
{
  const K = require('../src/server/browser-keeper.js'); const F = require('../src/browser-facts.js'); const B = require('../src/browser-profiles.js'); const TBS = require('../src/browser-tabs.js');
  const O = path.join(ROOT, 'opener'); const BIN = path.join(O, 'bin'), AB = path.join(O, 'ab'), HOME = path.join(O, 'home'), XDG = path.join(O, 'x');
  for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const { spawn } = require('child_process');
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
  const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
  const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
  const f = path.join(st, ns + '.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const write = (s) => { fs.writeFileSync(f + '.part', JSON.stringify(s)); fs.renameSync(f + '.part', f); };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
  const raw = process.argv.slice(2);
  const pin = raw.includes('--pin-tab');
  const argv = raw.filter((x) => x !== '--pin-tab' && x !== '--json');
  const [a, b] = argv;
  fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, sess, argv: raw }) + '\\n');
  if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
  let s = read();
  const live = !!(s && alive(s.pid));
  if (a === 'session' && b === 'info') { out({ success: true, data: { active: live, namespace: ns, pid: live ? s.pid : null, session: sess, socketDir: path.join(st, 'run') } }); process.exit(0); }
  if (a === 'get' && b === 'cdp-url') { if (!live) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19777/devtools/browser/fake-' + ns } }); process.exit(0); }
  if (a === 'close' && b === '--all') { if (live) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
  if (a === 'close') { out({ success: true, data: { closed: 1 } }); process.exit(0); }
  const newTab = (url, label, opener) => { s.n = (s.n || 0) + 1; const t = { tabId: 't' + s.n, targetId: (s.n.toString(16).toUpperCase().padStart(4, '0') + 'F'.repeat(28)), url: url || 'about:blank', title: 'Page ' + String(url || 'blank').replace(/^https?:\\/\\//, ''), label: label || null, opener: opener || null }; s.tabs.push(t); return t; };
  if (!live) {
    if (process.env.AGENT_BROWSER_CDP) { out({ success: false, error: 'fake: nothing at that CDP url' }); process.exit(1); }
    const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n');
    s = { pid: c.pid, n: 0, tabs: [], sessions: {} };
  }
  // a session's FIRST command binds a new tab of its own (measured: never an existing one)
  if (!(sess in s.sessions)) { if (a === 'tab' && b === 'new') s.sessions[sess] = null; else { const t = newTab('about:blank'); s.sessions[sess] = t.targetId; } }
  const bound = () => s.tabs.find((t) => t.targetId === s.sessions[sess]) || null;
  const done = (o) => { write(s); out(o); process.exit(o.success ? 0 : 1); };
  const gone = () => done({ success: false, code: 'tab_gone', data: { targetId: s.sessions[sess] }, error: 'tab_gone: bound tab is gone' });
  const find = (ref) => s.tabs.find((t) => t.tabId === ref || t.targetId === String(ref).toUpperCase() || (t.label && t.label === ref)) || null;
  if (a === 'stream' && b === 'status') { let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch { } const port = ports[ns + '|' + sess] || null; done(port ? { success: true, data: { enabled: true, connected: true, port } } : { success: false, error: 'fake: no stream' }); }
  if (a === 'tab') {
    const rest = argv.slice(1);
    if (!rest.length || rest[0] === 'list') done({ success: true, data: { tabs: s.tabs.map((t) => ({ active: t.targetId === s.sessions[sess], label: t.label, tabId: t.tabId, targetId: t.targetId, title: t.title, type: 'page', url: t.url })) } });
    if (rest[0] === 'new') { let label = null; const r2 = rest.slice(1); const li = r2.indexOf('--label'); if (li >= 0) { label = r2[li + 1]; r2.splice(li, 2); } const t = newTab(r2[0], label); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, total: s.tabs.length, url: t.url, label } }); }
    if (rest[0] === 'close') { const t = rest[1] ? find(rest[1]) : bound(); if (!t) { if (!rest[1]) gone(); done({ success: false, error: 'fake: no tab ' + rest[1] }); } s.tabs = s.tabs.filter((x) => x !== t); done({ success: true, data: { closed: true, tabId: t.tabId, targetId: t.targetId } }); }
    const t = find(rest[0]); if (!t) done({ success: false, error: 'fake: no tab ' + rest[0] }); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, title: t.title, url: t.url } });
  }
  if (pin && !bound()) gone();
  if (a === 'open') { const t = bound() || newTab(b); t.url = b; t.title = 'Page ' + String(b).replace(/^https?:\\/\\//, ''); done({ success: true, data: { targetId: t.targetId, url: b } }); }
  if (a === 'popup') { const t = newTab(b, null, s.sessions[sess]); done({ success: true, data: { targetId: t.targetId } }); } // the test's own verb: the bound page opens a popup (target=_blank)
  done({ success: true, data: { ok: true } });
  `, { mode: 0o755 });
  
  cleanups.push(() => { try { for (const l of fs.readFileSync(path.join(AB, 'pids'), 'utf8').split('\n')) { const p = Number(l); if (p > 1) try { process.kill(p, 'SIGKILL'); } catch { } } } catch { } });
  const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
  const KA = 'bk-00000a01', KB = 'bk-00000b02';
  const live = new Set([KA, KB]);
  const jl = []; const jlog = { log: (x) => jl.push(String(x)), warn: (x) => jl.push(String(x)), error() { } };
  // ── THE MODEL ──
  const model = { windows: new Map(), targets: new Map(), nextW: 100, nextT: 0, openWindowCalls: 0, inWindowCalls: 0, rung2Calls: 0, windowReadFails: 0, rung2Fails: false, elsewhereOnce: false, rung2LeakOnce: false, rung2Opts: null, active: new Map(), otherWindow: null, rung2Create: null, rung2Log: [], straysInOther: 0 }; // verify r4: each window's ACTIVE tab, the other holder's window a stray may land in, the create's shape, every rung-2 call's plan
  const nsOfUrl = (u) => (/fake-(.+)$/.exec(String(u)) || [])[1] || null;
  const fakeState = (ns) => JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8'));
  const fakeWrite = (ns, s) => fs.writeFileSync(path.join(AB, ns + '.json'), JSON.stringify(s));
  const mintTid = () => (++model.nextT).toString(16).toUpperCase().padStart(4, '0') + 'E'.repeat(28);
  // verify r4 ③: each window's ACTIVE (foreground) tab — a foreground create takes it; a close of the active tab puts the window's LAST tab in front (Chrome's measured rule, 30/30 per mode); a background create never touches it
  const addTab = (ns, tid, { windowId, openerId = null, holder = null, foreground = true }) => { model.targets.set(tid, { windowId, openerId, holder, state: 'ok' }); if (!model.windows.has(windowId)) model.windows.set(windowId, new Set()); model.windows.get(windowId).add(tid); if (foreground || !model.active.has(windowId)) model.active.set(windowId, tid); const s = fakeState(ns); s.n = (s.n || 0) + 1; s.tabs.push({ tabId: 't' + s.n, targetId: tid, url: 'about:blank', title: 'Page blank', label: null, opener: openerId }); fakeWrite(ns, s); return tid; };
  const closeTab = (tid) => { const t = model.targets.get(tid); if (!t || t.state === 'closed') return; t.state = 'closed'; const w = model.windows.get(t.windowId); if (w) { w.delete(tid); if (!w.size) model.windows.delete(t.windowId); } if (model.active.get(t.windowId) === tid) { if (w && w.size) model.active.set(t.windowId, [...w][w.size - 1]); else model.active.delete(t.windowId); } };
  const liveTargets = () => [...model.targets].filter(([, t]) => t.state !== 'closed');
  const fakeRemove = (ns, tid) => { const st = fakeState(ns); st.tabs = st.tabs.filter((t) => t.targetId !== tid); fakeWrite(ns, st); }; // verify r5 ③: the binary knows the tab no more
  const hook = async (name, ...a) => { const f = model[name]; if (typeof f !== 'function') return; model[name] = null; await f(...a); }; // verify r5: fired ONCE
  const fns = {
    readTargets: async () => ({ ok: true, targets: liveTargets().map(([id, t]) => ({ targetId: id, type: 'page', openerId: t.openerId || undefined })) }),
    openWindow: async (url) => { model.openWindowCalls++; const w = ++model.nextW; const tid = addTab(nsOfUrl(url), mintTid(), { windowId: w, holder: 'keeper' }); const readOk = model.windowReadFails <= 0; if (!readOk) model.windowReadFails--; return { ok: true, targetId: tid, windowId: readOk ? w : null }; },
    windowOf: async (url, tid) => { const t = model.targets.get(String(tid)); return t && t.state !== 'closed' ? t.windowId : null; },
    closeTarget: async (url, tid) => { closeTab(String(tid)); return { ok: true }; },
    openTabInWindow: async (url, { anchorTargetId, windowId }) => {
      model.inWindowCalls++; const ns = nsOfUrl(url); const a = model.targets.get(String(anchorTargetId));
      await hook('onProbe'); // verify r5 ①/②: a takeover or a live view that begins INSIDE rung 1 (the first anchor's probe)
      if (!a || a.state === 'closed') return { ok: false, code: 'open_failed', error: 'Unexpected server response: 500' };
      if (['dialog', 'crashed', 'navigating'].includes(a.state)) return { ok: false, code: 'anchor_unresponsive', error: 'the anchor did not answer in 400 ms (a dialog, a crash, a navigation)' }; // verify r3: the probe, not the act's timeout
      if (a.state === 'override' || a.state === 'sandbox') return { ok: false, code: 'no_new_tab', error: 'the page opened no tab (a blocked window.open)' }; // verify r3: a CSP sandbox page (allow-popups absent) opens none — measured
      // verify r3 ⑦ (measured): the anchor was its window's LAST tab and closed 0 ms into the act ⇒ no tab, the window gone
      if (a.state === 'closing-last') { closeTab(String(anchorTargetId)); return { ok: false, code: 'open_failed', error: 'closed before the answer' }; }
      if (a.state === 'elsewhere' || model.elsewhereOnce) { model.elsewhereOnce = false; const other = ++model.nextW; const tid = addTab(ns, mintTid(), { windowId: other, openerId: anchorTargetId, holder: 'stray' }); closeTab(tid); return { ok: false, code: 'window_mismatch', error: `the tab opened in window ${other}, not the holder's window ${windowId}` }; }
      const tid = addTab(ns, mintTid(), { windowId: a.windowId, openerId: anchorTargetId, holder: 'keeper' }); await hook('onCreated', tid); return { ok: true, targetId: tid, windowId: a.windowId };
    },
    openTabByActivate: async (url, { anchorTargetId, tries = 1, breaker = null }) => {
      model.rung2Calls++; model.rung2Opts = { tries, breaker }; model.rung2Log.push({ tries, breaker }); const ns = nsOfUrl(url); const a = model.targets.get(String(anchorTargetId));
      if (model.rung2Hold) { const h = model.rung2Hold; model.rung2Hold = null; await h; } // verify r5 c31: this rung 2 in flight (under the keeper's lock) until the test lets go
      if (!a || a.state === 'closed') return { ok: false, code: 'open_failed', error: 'no such target', leaks: [], tries: 1 };
      // verify r3 T2 ①: every try's stray is closed AT ONCE by the seam and listed in `leaks` (the keeper counts them);
      // verify r4 ③: a stray lands in the OTHER holder's window when the walk names one (`model.otherWindow`), in the
      // FOREGROUND unless the create is a background one (the product's RUNG2_CREATE; control (m) sets a foreground one)
      const bg = (model.rung2Create || W.RUNG2_CREATE).background === true; const strayWin = () => { if (model.otherWindow != null && model.windows.has(model.otherWindow)) { model.straysInOther++; return model.otherWindow; } return ++model.nextW; };
      if (model.rung2Fails) { const leaks = []; for (let t = 1; t <= tries; t++) { const other = strayWin(); const tid = addTab(ns, mintTid(), { windowId: other, holder: 'stray', foreground: !bg }); closeTab(tid); leaks.push({ window: other, livedMs: 7, try: t }); } return { ok: false, code: 'window_mismatch', error: 'the tab opened elsewhere', leaks, tries }; }
      if (model.rung2LeakOnce) { model.rung2LeakOnce = false; const other = strayWin(); const st = addTab(ns, mintTid(), { windowId: other, holder: 'stray', foreground: !bg }); closeTab(st); const tid = addTab(ns, mintTid(), { windowId: a.windowId, holder: 'keeper', foreground: !bg }); return { ok: true, targetId: tid, windowId: a.windowId, tries: 2, leaks: [{ window: other, livedMs: 7, try: 1 }] }; }
      const tid = addTab(ns, mintTid(), { windowId: a.windowId, holder: 'keeper', foreground: !bg }); await hook('onCreated', tid); return { ok: true, targetId: tid, windowId: a.windowId, tries: 1, leaks: [] };
    },
  };
  const DATA = path.join(O, 'data');
  const mk = (Kmod = K, extra = {}) => Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: jlog, install: false, now: () => Date.now(), conversationFacts: () => ({ turn: 'idle' }), ...fns, ...extra });
  const ownOf = (k, p, bk) => { const l = B.findLease(k._reg().leases, p.id, bk); const owners = TBS.tabOwners({ targets: liveTargets().map(([id, t]) => ({ targetId: id, type: 'page', openerId: t.openerId || undefined })), holders: [{ key: bk, roots: l ? l.tabRoots : [] }] }); return [...TBS.ownSetOf(owners, bk)]; };
  const censusOf = (k, p, bk) => { const l = B.findLease(k._reg().leases, p.id, bk); const lw = l ? W.windowIdOf(l.windowId) : null; const rows = ownOf(k, p, bk).map((tid) => { const t = model.targets.get(tid); return { holder: bk, windowId: t.windowId, popup: !!t.openerId && lw != null && t.windowId !== lw && t.holder === 'popup', stray: !t.openerId && lw != null && t.windowId !== lw && t.holder === 'keeper' }; }); return W.windowCensus(rows); };
  const roots = (k, p, bk) => { const l = B.findLease(k._reg().leases, p.id, bk); return l ? [...l.tabRoots] : []; };
  const setState = (ids, st) => { for (const id of ids) { const t = model.targets.get(id); if (t) t.state = st; } };
  const tabNew = async (k, bk, u) => { try { const r = await k.agentTabAct({ browserKey: bk, argv: ['tab', 'new', u] }); return r && r.ok === false ? { ok: false, code: r.code || null, why: r.why || null, error: String(r.error || '').slice(0, 400), r } : { ok: true, r }; } catch (e) { return { ok: false, code: e.code, why: e.why || null, error: String(e.message).slice(0, 400) }; } }; // verify r5 ⑤: the refusal's why rides the thrown error
  const count = (k, p, bk) => { const c = censusOf(k, p, bk); return c[bk] ? c[bk].count : 0; };
  const k1 = mk(); await k1._facts.probeVersion();
  const p1 = k1.createProfile({ label: 'Opener' });
  const rows = []; // the table
  const row = (state, act, got, want, extra) => { const okc = JSON.stringify(got) === JSON.stringify(want); rows.push({ state, act, got, want, okc, extra }); return okc; };
  // c1: the first tab makes the window
  await k1.attach({ profileId: p1.id, browserKey: KA, sessionId: 'x-' + KA });
  let c = censusOf(k1, p1, KA);
  row('a new lease', 'attach', { windows: c[KA] ? c[KA].count : 0, openWindow: model.openWindowCalls }, { windows: 1, openWindow: 1 });
  // c2: a later tab, a plain opener
  let r = await tabNew(k1, KA, 'https://a.example/2'); c = censusOf(k1, p1, KA);
  row('plain opener', 'tab new', { ok: r.ok, windows: c[KA].count, inWindow: !!(r.r && r.r.opened && r.r.opened.inWindow), windowIdSaid: !!(r.r && r.r.opened && Number.isFinite(r.r.opened.windowId)), note: (r.r && r.r.noteCode) || null }, { ok: true, windows: 1, inWindow: true, windowIdSaid: true, note: null }, r);
  const T1 = roots(k1, p1, KA)[0];
  // c3: a dialog open on the FIRST root (another root is fine) ⇒ the next candidate is the opener
  setState([T1], 'dialog'); let b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/3');
  row('dialog on the first root, a second root fine', 'tab new', { ok: r.ok, newWindows: count(k1, p1, KA) - b0, rung2: model.rung2Calls, note: (r.r && r.r.noteCode) || null }, { ok: true, newWindows: 0, rung2: 0, note: null }, r);
  // c4–c6: EVERY root broken ⇒ rung 2 (activate + create, verified) lands; the window count stays one
  for (const st of ['crashed', 'navigating', 'override']) { setState(roots(k1, p1, KA), st); const r2b = model.rung2Calls; b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/' + st); row(`every root ${st}`, 'tab new', { ok: r.ok, newWindows: count(k1, p1, KA) - b0, rung2Used: model.rung2Calls > r2b, note: (r.r && r.r.noteCode) || null }, { ok: true, newWindows: 0, rung2Used: true, note: null }, r); }
  setState(roots(k1, p1, KA), 'ok');
  // c7: the first root CLOSED, the window alive through the others
  closeTab(T1); b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/7');
  row('first root closed, window alive', 'tab new', { ok: r.ok, newWindows: count(k1, p1, KA) - b0, note: (r.r && r.r.noteCode) || null }, { ok: true, newWindows: 0, note: null }, r);
  // c8: landed elsewhere ONCE (window_mismatch, closed) ⇒ the retry lands
  model.elsewhereOnce = true; b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/8');
  row('elsewhere once (window_mismatch)', 'tab new', { ok: r.ok, newWindows: count(k1, p1, KA) - b0, strays: liveTargets().filter(([, t]) => t.holder === 'stray').length }, { ok: true, newWindows: 0, strays: 0 }, r);
  // c9: every rung refused while the window provably lives ⇒ REFUSED BY NAME, never a second window
  setState(roots(k1, p1, KA), 'elsewhere'); model.rung2Fails = true; const ow9 = model.openWindowCalls; b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/9');
  row('every rung mismatches, window alive', 'tab new', { ok: r.ok, code: r.code || null, newWindows: count(k1, p1, KA) - b0, newWindowOpened: model.openWindowCalls > ow9, strays: liveTargets().filter(([, t]) => t.holder === 'stray').length }, { ok: false, code: 'window_busy', newWindows: 0, newWindowOpened: false, strays: 0 }, r);
  setState(roots(k1, p1, KA), 'ok'); model.rung2Fails = false;
  // c10: the user drives its window ⇒ refused before any create
  k1.takeover({ browserKey: KA, profileId: p1.id, viewerId: 'v1', sessionId: 'x-' + KA }); const ow10 = model.openWindowCalls, iw10 = model.inWindowCalls, r2c10 = model.rung2Calls;
  b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/10');
  row('the user drives it (takeover)', 'tab new', { ok: r.ok, code: r.code || null, newWindows: count(k1, p1, KA) - b0, created: model.openWindowCalls + model.inWindowCalls + model.rung2Calls - ow10 - iw10 - r2c10 }, { ok: false, code: 'browser_paused', newWindows: 0, created: 0 }, r);
  k1.handback({ browserKey: KA, profileId: p1.id, viewerId: 'v1', cause: 'explicit' });
  // c11: the PAGE opened a popup-feature window (Chrome: a new window, opener = the holder's tab) ⇒ the holder's tab, in the
  // live list and paused with it; NOT the holder's second window: the next tab still lands in its own, the census says popup
  const NS1 = B.sessionNameFor(p1.id); const lastRoot = roots(k1, p1, KA).slice(-1)[0];
  const popupTid = addTab(NS1, mintTid(), { windowId: ++model.nextW, openerId: lastRoot, holder: 'popup' });
  b0 = count(k1, p1, KA); r = await tabNew(k1, KA, 'https://a.example/11'); c = censusOf(k1, p1, KA); const sw = await (async () => { try { const x = await k1.agentTabAct({ browserKey: KA, argv: ['tab', popupTid] }); return x && x.ok === false ? x.code : 'allowed'; } catch (e) { return e.code; } })();
  row('the page opened a popup window', 'tab new + tab <popup>', { ok: r.ok, newWindows: count(k1, p1, KA) - b0, popups: c[KA].popups || 0, popupIsOwn: ownOf(k1, p1, KA).includes(popupTid), redCell: W.multiWindowHolders(c).length, switchToPopup: sw }, { ok: true, newWindows: 0, popups: 1, popupIsOwn: true, redCell: 0, switchToPopup: 'allowed' }, { r, c });
  // c12: the window is GONE (every tab closed) ⇒ re-minted once, said by name (tab_new_window), one window
  for (const id of ownOf(k1, p1, KA)) closeTab(id); r = await tabNew(k1, KA, 'https://a.example/12'); c = censusOf(k1, p1, KA);
  row('the window gone (every tab closed)', 'tab new', { ok: r.ok, windows: c[KA].count, note: (r.r && r.r.noteCode) || null, wordsHonest: !!(r.r && r.r.note && !/closed with the old one/.test(r.r.note)) }, { ok: true, windows: 1, note: 'tab_new_window', wordsHonest: true }, r);
  // c13: THE RESTART (T2 ②): a keeper restart over the SAME store — the lease keeps its window
  const k2 = mk(); const ow13 = model.openWindowCalls; r = await tabNew(k2, KA, 'https://a.example/13'); c = censusOf(k2, p1, KA);
  row('a keeper restart (the store intact)', 'tab new', { ok: r.ok, windows: c[KA].count, newWindowOpened: model.openWindowCalls > ow13 }, { ok: true, windows: 1, newWindowOpened: false }, r);
  // c14: a lease from BEFORE r1 (windowIn stamped, no windowId) — the upgrade path: derived from its live tabs, never a window per tab
  { const reg = k2._reg(); const l = B.findLease(reg.leases, p1.id, KA); delete l.windowId; fs.writeFileSync(k2.storeFile, JSON.stringify(reg)); }
  const k3 = mk(); const ow14 = model.openWindowCalls; r = await tabNew(k3, KA, 'https://a.example/14'); c = censusOf(k3, p1, KA);
  row('a pre-r1 lease (no windowId) after a restart', 'tab new', { ok: r.ok, windows: c[KA].count, newWindowOpened: model.openWindowCalls > ow14, derived: Number.isFinite(Number(B.findLease(k3._reg().leases, p1.id, KA).windowId)) }, { ok: true, windows: 1, newWindowOpened: false, derived: true }, r);
  // c15: the first window's id could not be read (a failed Browser.getWindowForTarget) ⇒ derived at the next tab, never a window per tab
  model.windowReadFails = 1; const owA = model.openWindowCalls; await k3.attach({ profileId: p1.id, browserKey: KB, sessionId: 'x-' + KB }); const lb = B.findLease(k3._reg().leases, p1.id, KB); const hadNoId = !!lb && lb.windowId == null;
  const ow15 = model.openWindowCalls; r = await tabNew(k3, KB, 'https://b.example/15'); c = censusOf(k3, p1, KB);
  row('the first window id unread (null), a later tab', 'tab new', { leaseHadNoId: hadNoId, ok: r.ok, windows: c[KB] ? c[KB].count : 0, newWindowOpened: model.openWindowCalls > ow15, derived: !!lb && Number.isFinite(Number(lb.windowId)) }, { leaseHadNoId: true, ok: true, windows: 1, newWindowOpened: false, derived: true }, r);
  ok(W.OPENER_PROOF.chrome === '154.0.8037.57' && W.OPENER_PROOF.modes.length === 2 && /hijacked/.test(W.OPENER_PROOF.siteOverridesWindowOpen) && /rung 2 lands/.test(W.OPENER_PROOF.dialogOpen) && W.BACKGROUND_PAINT_PROOF.flipFrames < W.BACKGROUND_PAINT_FRAMES && W.BACKGROUND_PAINT_PROOF.hiddenFrames5s === 0, 'the measured proof behind the table (OPENER_PROOF, both modes): a site overriding window.open hijacks the main-world act, a dialog / crash / navigation fall to rung 2; a hidden tab sends 0 frames in 5 s and 1 at a flip < BACKGROUND_PAINT_FRAMES (verify r2 ⑤: no hysteresis needed)');
  ok(/Page\.createIsolatedWorld/.test(read('src/server/browser-viewport.js')) && /'noopener'/.test(read('src/server/browser-viewport.js')) && /openTabByActivate/.test(read('src/server/browser-keeper.js')) && /window_busy/.test(read('src/routes/browser.js')), 'wiring: the opener act runs in an ISOLATED world with noopener (T2 ①), the keeper has rung 2 (openTabByActivate) and window_busy is a typed refusal the routes answer');
  const bad = rows.filter((x) => !x.okc);
  ok(!bad.length, `T1 THE OPENER RULE'S OWN TABLE: ${rows.length} rows (the opener's state × the act ⇒ one window, or refused by name) on the real keeper over the fake target model`, bad.map((x) => `${x.state} | ${x.act} ⇒ ${JSON.stringify(x.got)} (want ${JSON.stringify(x.want)})${x.extra ? ' ' + JSON.stringify(x.extra).slice(0, 200) : ''}`).join('\n    '));
  console.log('    ' + rows.map((x) => `${x.okc ? '·' : '✗'} ${x.state} · ${x.act} ⇒ ${JSON.stringify(x.got)}`).join('\n    '));
  // CONTROL: a keeper copy WITHOUT the opener rule (the pre-r1 path: every tab a new window) — the red cell
  const ksrc = read('src/server/browser-keeper.js');
  const needle = '      if (anchors.length) {\n', needle2 = '      if (!anchors.length || gone) {\n';
  ok(ksrc.includes(needle) && ksrc.includes(needle2), 'control setup: the opener rule\'s anchor search and the re-mint branch are found in the keeper');
  const Kc = M.load('src/server/browser-keeper.js', ksrc.replace(needle, '      if (false) {\n').replace(needle2, '      if (true) {\n'), 'no-opener-rule');
  const kc = mk(Kc, { dataDir: path.join(O, 'data-ctl') }); await kc._facts.probeVersion(); const pc = kc.createProfile({ label: 'Ctl' });
  await kc.attach({ profileId: pc.id, browserKey: KA, sessionId: 'x-' + KA }); await tabNew(kc, KA, 'https://a.example/c1'); await tabNew(kc, KA, 'https://a.example/c2');
  const cc = censusOf(kc, pc, KA);
  ok(cc[KA] && cc[KA].count === 3 && W.multiWindowHolders(cc).join() === KA, `CONTROL (the pre-r1 path): a keeper copy that creates without an opener gives the holder ${cc[KA] ? cc[KA].count : '?'} windows for 3 tabs — the red cell names it`, cc);
  // THE REVERT TABLE of verify r2's parts — a patched copy per part, each flipping its own row
  const scen = async (Kmod, tag) => { const kx = mk(Kmod, { dataDir: path.join(O, 'data-' + tag) }); await kx._facts.probeVersion(); const px = kx.createProfile({ label: 'C ' + tag }); await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-' + KA }); return { kx, px }; };
  { // (a) the window-id reader: `Number(null)` is 0 — the old expression stamps window 0 for an unread id
    const needleA = '    l2.windowId = WIN.windowIdOf(r.windowId); // T2 ⑧'; ok(ksrc.includes(needleA), 'control (a) setup');
    const Ka = M.load('src/server/browser-keeper.js', ksrc.replace(needleA, '    l2.windowId = Number.isFinite(Number(r.windowId)) ? Number(r.windowId) : null; // T2 ⑧'), 'window-zero');
    model.windowReadFails = 1; const { kx, px } = await scen(Ka, 'a'); const l = B.findLease(kx._reg().leases, px.id, KA);
    ok(l && l.windowId === 0, `CONTROL (a): a keeper copy reading the id with Number(…) stamps window ${l && l.windowId} for an unread one (the c15 row goes red: no tab answers window 0 ⇒ re-minted)`, l);
  }
  { // (b) the derivation: without it a lease with no stamped id opens a window per tab
    const needleB = '      if (wantWin == null && lease && WIN.hasOwnWindow(lease, WIN.instanceOf(rec))) {'; ok(ksrc.includes(needleB), 'control (b) setup');
    const Kb = M.load('src/server/browser-keeper.js', ksrc.replace(needleB, '      if (false) {'), 'no-derivation');
    const { kx, px } = await scen(Kb, 'b'); delete B.findLease(kx._reg().leases, px.id, KA).windowId; const ow = model.openWindowCalls; await tabNew(kx, KA, 'https://c.example/b');
    ok(model.openWindowCalls > ow, 'CONTROL (b): a keeper copy without the derivation opens a NEW window for a lease whose id was never stamped (the pre-r1 / unread rows go red)');
  }
  { // (c) the window_busy return: without it a living window is traded for the browser's last window (another holder's)
    const needleC = "    if (made && made.code === 'window_busy') return { ok: false, code: 'window_busy', why: made.why || 'ladder', targetId: null, window: 'own', error: made.error };"; ok(ksrc.includes(needleC), 'control (c) setup');
    const Kc2 = M.load('src/server/browser-keeper.js', ksrc.replace(needleC, ''), 'busy-falls-back');
    const { kx, px } = await scen(Kc2, 'c'); setState(roots(kx, px, KA), 'elsewhere'); model.rung2Fails = true; const r = await tabNew(kx, KA, 'https://c.example/c'); model.rung2Fails = false;
    ok(r.ok && r.r && r.r.opened && r.r.opened.window === 'shared' && r.r.noteCode === 'tab_shared_window', 'CONTROL (c): a keeper copy without the window_busy return falls back to the shared-window tab (the "every rung mismatches" row goes red)', r);
  }
  { // (d) rung 2: without it a whole window of blocked tabs is refused instead of landing
    const needleD = '        if (!(made && made.ok)) made = await viaActivate(anchors[0]); // verify r5: the plan is read in there, at rung 2'; ok(ksrc.includes(needleD), 'control (d) setup');
    const Kd = M.load('src/server/browser-keeper.js', ksrc.replace(needleD, "        if (!(made && made.ok)) made = { ok: false, code: 'open_failed', error: 'no rung 2' };"), 'no-rung2');
    const { kx, px } = await scen(Kd, 'd'); setState(roots(kx, px, KA), 'crashed'); const r = await tabNew(kx, KA, 'https://c.example/d');
    ok(!r.ok && r.code === 'window_busy', 'CONTROL (d): a keeper copy without rung 2 refuses window_busy where the product lands (the crashed / navigating / override rows go red)', r);
  }
  { // (e) the census: a copy that counts a page's popup window as the holder's second
    const wsrc2 = read('src/browser-windows.js'); const needleE = "    if (r.popup === true) { if (!out[h].popupWindows.includes(w)) { out[h].popupWindows.push(w); out[h].popups++; } continue; }\n"; ok(wsrc2.includes(needleE), 'control (e) setup');
    const We = M.load('src/browser-windows.js', wsrc2.replace(needleE, ''), 'popup-counted');
    const ce = We.windowCensus([{ holder: 'A', windowId: 1 }, { holder: 'A', windowId: 2, popup: true }]);
    ok(ce.A.count === 2 && We.multiWindowHolders(ce).join() === 'A', 'CONTROL (e): a census copy without the popup row names the holder in the red cell for the page\'s own popup');
  }
  fs.writeFileSync(path.join(ROOT, 'opener-table.json'), JSON.stringify(rows, null, 1));

  // ── ⑤ verify r3 (2026-10-02): r2's ADDITIONS attacked — rows c16–c21 on a fresh keeper over the same model ──
  console.log('— ⑤ verify r3: the rows r2 added, attacked');
  const rows3 = []; const row3 = (state, act, got, want, extra) => { const okc = JSON.stringify(got) === JSON.stringify(want); rows3.push({ state, act, got, want, okc, extra }); return okc; };
  const k5 = mk(K, { dataDir: path.join(O, 'data-r3') }); await k5._facts.probeVersion(); const p5 = k5.createProfile({ label: 'R3' }); const NS5 = B.sessionNameFor(p5.id);
  await k5.attach({ profileId: p5.id, browserKey: KA, sessionId: 'x-' + KA }); await tabNew(k5, KA, 'https://r.example/1');
  // c16: every root a CSP-sandbox page (no popups) ⇒ rung 2, the RUNG named
  setState(roots(k5, p5, KA), 'sandbox'); let b5 = count(k5, p5, KA); let r5 = await tabNew(k5, KA, 'https://r.example/16');
  row3('every root sandboxed (CSP sandbox: no popups)', 'tab new', { ok: r5.ok, newWindows: count(k5, p5, KA) - b5, rung: r5.r && r5.r.opened && r5.r.opened.rung, note: (r5.r && r5.r.noteCode) || null }, { ok: true, newWindows: 0, rung: 'activate', note: null }, r5);
  setState(roots(k5, p5, KA), 'ok');
  // c17: the plain opener names its rung too; every root unresponsive + rung 2 LEAKED once (closed) ⇒ the retry landed, the leak COUNTED
  r5 = await tabNew(k5, KA, 'https://r.example/17a');
  row3('a plain opener names its rung', 'tab new', { ok: r5.ok, rung: r5.r && r5.r.opened && r5.r.opened.rung, leaks: k5.list().windowLeaks.count }, { ok: true, rung: 'opener', leaks: 0 }, r5);
  setState(roots(k5, p5, KA), 'crashed'); model.rung2LeakOnce = true; b5 = count(k5, p5, KA); const jl0 = jl.length; r5 = await tabNew(k5, KA, 'https://r.example/17');
  const leakLine = jl.slice(jl0).find((x) => /rung 2 \(try 1\) opened its tab in window \d+ — another holder's/.test(x)) || '';
  row3('every root crashed, rung 2 leaked once (closed), the retry landed', 'tab new', { ok: r5.ok, newWindows: count(k5, p5, KA) - b5, rung: r5.r && r5.r.opened && r5.r.opened.rung, leaksCounted: k5.list().windowLeaks.count, leakLast: !!(k5.list().windowLeaks.last && k5.list().windowLeaks.last.browserKey === KA && k5.list().windowLeaks.last.livedMs === 7), journaled: /closed at once after 7 ms \(leak 1 of this run/.test(leakLine), strays: liveTargets().filter(([, t]) => t.holder === 'stray').length }, { ok: true, newWindows: 0, rung: 'activate', leaksCounted: 1, leakLast: true, journaled: true, strays: 0 }, r5);
  setState(roots(k5, p5, KA), 'ok');
  // c18: rung 2's PLAN rides the seam from the browser's display fact: no fact ⇒ the cycle (headless assumed); a real display ⇒ no cycle
  setState(roots(k5, p5, KA), 'navigating'); await tabNew(k5, KA, 'https://r.example/18a'); const opts18a = { ...model.rung2Opts };
  k5._reg().browsers[p5.id].display = { kind: 'x11', headed: true, fallback: null }; setState(roots(k5, p5, KA), 'navigating'); await tabNew(k5, KA, 'https://r.example/18b'); const opts18b = { ...model.rung2Opts };
  k5._reg().browsers[p5.id].display = { kind: 'none', headed: true, fallback: { why: 'no-display', rung: 'hidden-window' } }; setState(roots(k5, p5, KA), 'navigating'); await tabNew(k5, KA, 'https://r.example/18c'); const opts18c = { ...model.rung2Opts };
  delete k5._reg().browsers[p5.id].display; setState(roots(k5, p5, KA), 'ok');
  row3('rung 2 plan by display fact: none / a real display / the hidden window', 'tab new ×3', { noFact: opts18a, realDisplay: opts18b, hiddenWindow: opts18c }, { noFact: { tries: W.RUNG2_TRIES, breaker: true }, realDisplay: { tries: W.RUNG2_TRIES, breaker: false }, hiddenWindow: { tries: W.RUNG2_TRIES, breaker: true } });
  // c19: THE WINDOW GONE DURING THE LADDER (⑦, measured): the anchor was the window's LAST tab and closed 0 ms into the act ⇒
  // re-asked, gone ⇒ ONE new window (tab_new_window), never "window_busy … your tabs are still there"
  const k6 = mk(K, { dataDir: path.join(O, 'data-r3b') }); await k6._facts.probeVersion(); const p6 = k6.createProfile({ label: 'R3b' });
  await k6.attach({ profileId: p6.id, browserKey: KA, sessionId: 'x-' + KA }); const only6 = roots(k6, p6, KA)[0]; setState([only6], 'closing-last'); const ow19 = model.openWindowCalls;
  r5 = await tabNew(k6, KA, 'https://r.example/19'); const c19 = censusOf(k6, p6, KA);
  row3('the anchor the window\'s LAST tab, closed 0 ms into the act (window gone)', 'tab new', { ok: r5.ok, code: r5.code || null, note: (r5.r && r5.r.noteCode) || null, rung: r5.r && r5.r.opened && r5.r.opened.rung, windows: c19[KA] ? c19[KA].count : 0, newWindowOpened: model.openWindowCalls > ow19, busyLie: /still there/.test(String(r5.error || '')) }, { ok: true, code: null, note: 'tab_new_window', rung: 'new-window', windows: 1, newWindowOpened: true, busyLie: false }, r5);
  // c20: THE UPGRADE PATH WITH TWO WINDOWS (④): a pre-r1 lease whose tabs sit in THREE windows ⇒ the next tab lands in the
  // current tab's window, the state is SAID once (tabs_in_other_windows, the strays listed), the honest census stays red
  // (nothing is folded: no page of the agent's is closed), the second tab new says nothing again
  const k7 = mk(K, { dataDir: path.join(O, 'data-r3c') }); await k7._facts.probeVersion(); const p7 = k7.createProfile({ label: 'R3c' }); const NS7 = B.sessionNameFor(p7.id);
  await k7.attach({ profileId: p7.id, browserKey: KA, sessionId: 'x-' + KA }); await tabNew(k7, KA, 'https://r.example/20a');
  { const l = B.findLease(k7._reg().leases, p7.id, KA); for (let i = 0; i < 2; i++) { const t = addTab(NS7, mintTid(), { windowId: ++model.nextW, holder: 'keeper' }); l.tabRoots = TBS.addRoot(l.tabRoots, t); } delete l.windowId; fs.writeFileSync(k7.storeFile, JSON.stringify(k7._reg())); }
  const k8 = mk(K, { dataDir: path.join(O, 'data-r3c') }); const tabsBefore = liveTargets().length; const jl1 = jl.length;
  r5 = await tabNew(k8, KA, 'https://r.example/20'); const c20 = censusOf(k8, p7, KA); const l20 = B.findLease(k8._reg().leases, p7.id, KA);
  const r5b = await tabNew(k8, KA, 'https://r.example/20b');
  row3('a pre-r1 lease whose tabs sit in THREE windows (the r1 leftovers)', 'tab new ×2', { ok: r5.ok, note: (r5.r && r5.r.noteCode) || null, noteSays: /2 of your tabs sit in 2 other windows/.test(String((r5.r && r5.r.note) || '')), inCurrentTabWindow: !!(r5.r && r5.r.opened && r5.r.opened.windowId === W.windowIdOf(l20.windowId)), windowsHonest: c20[KA] ? c20[KA].count : 0, strayWindows: (c20[KA] && c20[KA].strayWindows || []).length, redCell: W.multiWindowHolders(c20).length, nothingClosed: liveTargets().length === tabsBefore + 2, journaled: jl.slice(jl1).some((x) => /2 of its tabs sit in 2 other window\(s\).*said once \(tabs_in_other_windows\); nothing closed/.test(x)), saidAgain: (r5b.r && r5b.r.noteCode) || null }, { ok: true, note: W.STRAYS_NOTE, noteSays: true, inCurrentTabWindow: true, windowsHonest: 3, strayWindows: 2, redCell: 1, nothingClosed: true, journaled: true, saidAgain: null }, { r5, c20 });
  // c21: a keeper RESTART over the said state does not say it again (the stamp is on the lease, per browser run)
  const k9 = mk(K, { dataDir: path.join(O, 'data-r3c') }); const r21 = await tabNew(k9, KA, 'https://r.example/21');
  row3('a keeper restart after the strays were said', 'tab new', { ok: r21.ok, note: (r21.r && r21.r.noteCode) || null }, { ok: true, note: null }, r21);
  ok(rows3.every((x) => x.okc), `⑤ verify r3 rows: ${rows3.length} (the sandbox kind, the rung named, a counted leak, the display-fact plan, the window gone mid-ladder, the three-window upgrade path, the restart)`, rows3.filter((x) => !x.okc).map((x) => `${x.state} | ${x.act} ⇒ ${JSON.stringify(x.got)} (want ${JSON.stringify(x.want)})${x.extra ? ' ' + JSON.stringify(x.extra).slice(0, 300) : ''}`).join('\n    '));
  console.log('    ' + rows3.map((x) => `${x.okc ? '·' : '✗'} ${x.state} · ${x.act} ⇒ ${JSON.stringify(x.got).slice(0, 220)}`).join('\n    '));
  // ── ⑥ verify r4 (2026-10-02): r3's ADDITIONS attacked — rows c22–c28 on fresh keepers over the same model ──
  console.log('— ⑥ verify r4: the rows r3 added, attacked');
  const rows4 = []; const row4 = (state, act, got, want, extra) => { const okc = JSON.stringify(got) === JSON.stringify(want); rows4.push({ state, act, got, want, okc, extra }); return okc; };
  const k10 = mk(K, { dataDir: path.join(O, 'data-r4') }); await k10._facts.probeVersion(); const p10 = k10.createProfile({ label: 'R4' });
  await k10.attach({ profileId: p10.id, browserKey: KA, sessionId: 'x-' + KA }); await k10.attach({ profileId: p10.id, browserKey: KB, sessionId: 'x-' + KB });
  await tabNew(k10, KA, 'https://r4.example/a'); await tabNew(k10, KB, 'https://r4.example/b');
  // c22 (①): a live view WATCHES this holder's window ⇒ rung 2 runs WITHOUT the window-state cycle (the plan's `breaker` false) and lands
  k10.noteViewers(KA, p10.id, 2); setState(roots(k10, p10, KA), 'crashed'); let r6 = await tabNew(k10, KA, 'https://r4.example/22'); const o22 = { ...model.rung2Opts }; k10.noteViewers(KA, p10.id, 0); setState(roots(k10, p10, KA), 'ok');
  row4('a live view watches this window (2 viewers), every anchor crashed', 'tab new', { ok: r6.ok, rung: r6.r && r6.r.opened && r6.r.opened.rung, cycled: o22.breaker, tries: o22.tries }, { ok: true, rung: 'activate', cycled: false, tries: W.RUNG2_TRIES }, r6);
  // c23 (T1): the USER DRIVES the other holder's window (a takeover from its live view) ⇒ rung 2 is NOT RUN — window_busy naming
  // him, nothing opened, no cycle, no activation; after the handback the same `tab new` lands by rung 2
  const tk = k10.takeover({ browserKey: KB, profileId: p10.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true }); const c23a = model.rung2Calls; setState(roots(k10, p10, KA), 'crashed'); const jl23 = jl.length; r6 = await tabNew(k10, KA, 'https://r4.example/23'); const ran23 = model.rung2Calls > c23a;
  const busyWhy = jl.slice(jl23).find((x) => /rung 2 NOT run — the user is driving a window of this browser/.test(x)) || '';
  k10.handback({ browserKey: KB, profileId: p10.id, viewerId: 7, cause: 'explicit' }); const r6b = await tabNew(k10, KA, 'https://r4.example/23b'); setState(roots(k10, p10, KA), 'ok');
  row4('the user drives the OTHER holder\'s window (takeover), every anchor crashed; then the handback', 'tab new ×2', { takeover: tk.ok, ok: r6.ok, code: r6.code || null, saysUser: /the user is driving a window of this browser/.test(String(r6.error || '')), saysAfterHandback: /after the user hands the browser back/.test(String(r6.error || '')), rung2Ran: ran23, journaled: !!busyWhy, afterHandback: { ok: r6b.ok, rung: r6b.r && r6b.r.opened && r6b.r.opened.rung } }, { takeover: true, ok: false, code: 'window_busy', saysUser: true, saysAfterHandback: true, rung2Ran: false, journaled: true, afterHandback: { ok: true, rung: 'activate' } }, r6);
  // c24 (T1): the user browsing HIMSELF (Browse yourself: his own window, driving) is the user driving a window of this browser too
  let br = null; try { br = await k10.browse(p10.id); } catch (e) { br = { ok: false, threw: String(e && e.message) }; }
  let at = null; try { at = br && br.ok ? k10.humanAttach({ key: br.key, viewerId: 11, token: br.fresh || null }) : null; } catch (e) { at = { threw: String(e && e.message) }; }
  const c24a = model.rung2Calls; setState(roots(k10, p10, KA), 'crashed'); r6 = await tabNew(k10, KA, 'https://r4.example/24'); const ran24 = model.rung2Calls > c24a;
  let rel = null; try { rel = br && br.ok ? k10.humanRelease({ key: br.key, viewerId: 11, cause: 'viewer-left' }) : null; } catch (e) { rel = { threw: String(e && e.message) }; }
  const r6c = await tabNew(k10, KA, 'https://r4.example/24b'); setState(roots(k10, p10, KA), 'ok');
  row4('the user browses himself (his own window, driving), every anchor crashed; then his window lets go', 'tab new ×2', { browse: !!(br && br.ok), driving: !!(at && at.ok && at.take), ok: r6.ok, code: r6.code || null, saysUser: /the user is driving a window of this browser/.test(String(r6.error || '')), rung2Ran: ran24, released: !!(rel && rel.ok), afterRelease: { ok: r6c.ok, rung: r6c.r && r6c.r.opened && r6c.r.opened.rung } }, { browse: true, driving: true, ok: false, code: 'window_busy', saysUser: true, rung2Ran: false, released: true, afterRelease: { ok: true, rung: 'activate' } }, { br, at, rel, r6 });
  // c25 (⑥): both holders' windows GONE (each anchor its window's last tab, closed 0 ms into the act) ⇒ each gets ONE new window of its own, distinct, no leak counted
  { const k11 = mk(K, { dataDir: path.join(O, 'data-r4b') }); await k11._facts.probeVersion(); const p11 = k11.createProfile({ label: 'R4b' });
    await k11.attach({ profileId: p11.id, browserKey: KA, sessionId: 'x-' + KA }); await k11.attach({ profileId: p11.id, browserKey: KB, sessionId: 'x-' + KB });
    const lk0 = k11.list().windowLeaks.count; const ow = model.openWindowCalls; setState(roots(k11, p11, KA), 'closing-last'); const ra = await tabNew(k11, KA, 'https://r4.example/25a'); setState(roots(k11, p11, KB), 'closing-last'); const rb = await tabNew(k11, KB, 'https://r4.example/25b');
    const la = B.findLease(k11._reg().leases, p11.id, KA), lb = B.findLease(k11._reg().leases, p11.id, KB);
    row4('both holders\' windows gone (the anchors their windows\' last tabs, closed 0 ms into the act)', 'tab new ×2', { a: { ok: ra.ok, note: ra.r && ra.r.noteCode, rung: ra.r && ra.r.opened && ra.r.opened.rung }, b: { ok: rb.ok, note: rb.r && rb.r.noteCode, rung: rb.r && rb.r.opened && rb.r.opened.rung }, newWindows: model.openWindowCalls - ow, distinct: W.windowIdOf(la.windowId) !== W.windowIdOf(lb.windowId), leaksAdded: k11.list().windowLeaks.count - lk0 }, { a: { ok: true, note: 'tab_new_window', rung: 'new-window' }, b: { ok: true, note: 'tab_new_window', rung: 'new-window' }, newWindows: 2, distinct: true, leaksAdded: 0 }, { ra, rb }); }
  // c26 (⑧): a rung 2 that loses EVERY try (a continuous racer) ⇒ RUNG2_TRIES leak lines + ONE refusal line per `tab new` — bounded per
  // command (the journal is the server log; no file under data/); the agent's own pace bounds the commands
  { setState(roots(k10, p10, KA), 'crashed'); model.rung2Fails = true; const j0 = jl.length; const r = await tabNew(k10, KA, 'https://r4.example/26'); model.rung2Fails = false; setState(roots(k10, p10, KA), 'ok'); const lines = jl.slice(j0);
    row4('a rung 2 losing every try: journal lines per `tab new`', 'tab new', { code: r.code || null, leakLines: lines.filter((x) => /closed at once after/.test(x)).length, busyLines: lines.filter((x) => /refused window_busy/.test(x)).length, total: lines.length }, { code: 'window_busy', leakLines: W.RUNG2_TRIES, busyLines: 1, total: W.RUNG2_TRIES + 1 }, lines.map((x) => x.slice(0, 100))); }
  // c27 (⑤): WHICH window is "the" window of a lease whose tabs sit in several — the stamped id; unstamped ⇒ the CURRENT tab's (then stamped)
  { fs.writeFileSync(k10.storeFile, JSON.stringify(k10._reg())); const k12 = mk(K, { dataDir: path.join(O, 'data-r4') }); k12.list(); const l = B.findLease(k12._reg().leases, p10.id, KA); const NS = B.sessionNameFor(p10.id);
    const stamped = W.windowIdOf(l.windowId); const other = addTab(NS, mintTid(), { windowId: ++model.nextW, holder: 'keeper' }); l.tabRoots = TBS.addRoot(l.tabRoots, other);
    const r1 = await tabNew(k12, KA, 'https://r4.example/27a'); delete l.windowId; l.targetId = other; const r2 = await tabNew(k12, KA, 'https://r4.example/27b'); const l2 = B.findLease(k12._reg().leases, p10.id, KA);
    row4('a lease whose tabs sit in two windows: the stamped id, then no stamp with the current tab in the other', 'tab new ×2', { stampedLanded: r1.r && r1.r.opened && r1.r.opened.windowId === stamped, unstampedLanded: r2.r && r2.r.opened && r2.r.opened.windowId === model.targets.get(other).windowId, stampedNow: W.windowIdOf(l2.windowId) === model.targets.get(other).windowId }, { stampedLanded: true, unstampedLanded: true, stampedNow: true }, { r1, r2 }); }
  // c28 (③): a stray that lands in the OTHER holder's window under the product's BACKGROUND create leaves that holder's foreground tab where it was
  { const k13 = mk(K, { dataDir: path.join(O, 'data-r4c') }); await k13._facts.probeVersion(); const p13 = k13.createProfile({ label: 'R4c' });
    await k13.attach({ profileId: p13.id, browserKey: KA, sessionId: 'x-' + KA }); await k13.attach({ profileId: p13.id, browserKey: KB, sessionId: 'x-' + KB }); await tabNew(k13, KB, 'https://r4.example/28b1'); await tabNew(k13, KB, 'https://r4.example/28b2');
    const bWin = model.targets.get(roots(k13, p13, KB)[0]).windowId; model.active.set(bWin, roots(k13, p13, KB)[0]); const before = model.active.get(bWin); const bTabs = ownOf(k13, p13, KB).slice().sort().join(','); model.otherWindow = bWin;
    setState(roots(k13, p13, KA), 'crashed'); model.rung2LeakOnce = true; const r = await tabNew(k13, KA, 'https://r4.example/28'); setState(roots(k13, p13, KA), 'ok'); model.otherWindow = null;
    row4('a stray in the OTHER holder\'s window (background create), that holder\'s foreground tab not its last', 'tab new', { ok: r.ok, leaked: k13.list().windowLeaks.count, bForegroundUnchanged: model.active.get(bWin) === before, bTabsUnchanged: ownOf(k13, p13, KB).slice().sort().join(',') === bTabs, strayLeft: liveTargets().some(([, t]) => t.holder === 'stray') }, { ok: true, leaked: 1, bForegroundUnchanged: true, bTabsUnchanged: true, strayLeft: false }, r); }
  ok(rows4.every((x) => x.okc), `⑥ verify r4 rows: ${rows4.length} (no cycle under a live view, rung 2 never while the user drives any window — a takeover or Browse yourself — and again after the handback, both windows gone, the lines per command, which window is "the" window, the other holder's foreground under a stray)`, rows4.filter((x) => !x.okc).map((x) => `${x.state} | ${x.act} ⇒ ${JSON.stringify(x.got)} (want ${JSON.stringify(x.want)})${x.extra ? ' ' + JSON.stringify(x.extra).slice(0, 400) : ''}`).join('\n    '));
  console.log('    ' + rows4.map((x) => `${x.okc ? '·' : '✗'} ${x.state} · ${x.act} ⇒ ${JSON.stringify(x.got).slice(0, 220)}`).join('\n    '));
  // every outcome of BOTH tables names its rung (an ok ⇒ opened.rung ∈ the closed set) or its refusal code
  const RUNGS = ['opener', 'activate', 'new-window'];
  const allRows = [...rows, ...rows3, ...rows4].filter((x) => x.extra && x.extra.r !== undefined ? false : true);
  const named = [...rows, ...rows3, ...rows4].map((x) => x.extra && (x.extra.r || x.extra)).filter((r) => r && typeof r === 'object' && 'ok' in r).map((r) => (r.ok ? (r.r && r.r.opened ? RUNGS.includes(r.r.opened.rung) : true) : !!r.code));
  ok(named.length >= 18 && named.every(Boolean), `T1 every outcome names the rung that landed (opener / activate / new-window) or its refusal code — ${named.length} outcomes over the three tables`, named);
  void allRows;


  // ── ⑦ verify r5 (2026-10-02): r4's THREE PARTS attacked — rows c29–c33 on a fresh keeper over the same model ──
  console.log('— ⑦ verify r5: r4\'s parts, attacked');
  const rows5 = []; const row5 = (state, act, got, want, extra) => { const okc = JSON.stringify(got) === JSON.stringify(want); rows5.push({ state, act, got, want, okc, extra }); return okc; };
  {
    const k14 = mk(K, { dataDir: path.join(O, 'data-r5') }); await k14._facts.probeVersion(); const p14 = k14.createProfile({ label: 'R5' }); const NS14 = B.sessionNameFor(p14.id);
    await k14.attach({ profileId: p14.id, browserKey: KA, sessionId: 'x-' + KA }); await k14.attach({ profileId: p14.id, browserKey: KB, sessionId: 'x-' + KB });
    await tabNew(k14, KA, 'https://r5.example/a'); await tabNew(k14, KB, 'https://r5.example/b');
    const evs = []; k14.onInput((ev) => evs.push({ kind: ev.kind, browserKey: ev.browserKey, human: !!ev.human, refused: Array.isArray(ev.refused) ? ev.refused.map((x) => `${x.browserKey}:${x.sessionId}:${x.n}`) : null }));
    const takeB = () => k14.takeover({ browserKey: KB, profileId: p14.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true });
    const backB = () => k14.handback({ browserKey: KB, profileId: p14.id, viewerId: 7, cause: 'explicit' });
    // c29 (①, MEASURED 30/30 per mode on the product's Chrome): a takeover of the OTHER holder's window that begins DURING rung 1
    // (inside the first anchor's probe) ⇒ rung 2 NOT run, window_busy naming him (r4 read the plan at the ladder's top and ran
    // rung 2 — the cycle + the activation — under his hands); the handback emits ONE drive-ended event naming the refused holder
    setState(roots(k14, p14, KA), 'crashed'); model.onProbe = () => { const t = takeB(); if (!t.ok) throw new Error('takeover refused: ' + t.code); };
    const c29a = model.rung2Calls; let r7 = await tabNew(k14, KA, 'https://r5.example/29'); const ran29 = model.rung2Calls > c29a;
    const e0 = evs.length; backB(); const de29 = evs.slice(e0).filter((e) => e.kind === 'drive-ended'); const r7b = await tabNew(k14, KA, 'https://r5.example/29b'); setState(roots(k14, p14, KA), 'ok');
    row5('a takeover of the OTHER holder\'s window that begins DURING rung 1 (inside the first probe), every anchor crashed; then the handback', 'tab new, handback, tab new', { ok: r7.ok, code: r7.code || null, why: r7.why || null, saysUser: /the user is driving a window of this browser/.test(String(r7.error || '')), saysTold: /VibeSpace tells you then/.test(String(r7.error || '')), rung2Ran: ran29, driveEnded: de29.length, refused: de29[0] ? de29[0].refused : null, human: de29[0] ? de29[0].human : null, after: { ok: r7b.ok, rung: r7b.r && r7b.r.opened && r7b.r.opened.rung } }, { ok: false, code: 'window_busy', why: 'user_driving', saysUser: true, saysTold: true, rung2Ran: false, driveEnded: 1, refused: [`${KA}:x-${KA}:1`], human: false, after: { ok: true, rung: 'activate' } }, { r7, de29 });
    // c30 (②, MEASURED 30/30 per mode): a live view that opens on THIS holder's window DURING rung 1 ⇒ rung 2 runs WITHOUT the
    // cycle (r4 cycled under its first frames: the watched tab went hidden → visible → hidden)
    setState(roots(k14, p14, KA), 'crashed'); model.onProbe = () => { k14.noteViewers(KA, p14.id, 1); };
    r7 = await tabNew(k14, KA, 'https://r5.example/30'); const o30 = { ...model.rung2Opts }; k14.noteViewers(KA, p14.id, 0); setState(roots(k14, p14, KA), 'ok');
    row5('a live view that opens on this window DURING rung 1, every anchor crashed', 'tab new', { ok: r7.ok, rung: r7.r && r7.r.opened && r7.r.opened.rung, cycled: o30.breaker }, { ok: true, rung: 'activate', cycled: false }, r7);
    // c31 (①, the lock): a takeover that begins while THIS holder WAITS for the browser's rung-2 lock (the other holder's rung 2 in
    // flight) ⇒ NOT run either — the plan is read after the lock wait, the last await before rung 2
    let releaseB = null; model.rung2Hold = new Promise((r) => { releaseB = r; });
    setState(roots(k14, p14, KB), 'crashed'); const pb = tabNew(k14, KB, 'https://r5.example/31b'); await new Promise((r) => setTimeout(r, 40)); // B inside rung 2, holding the lock
    setState(roots(k14, p14, KA), 'crashed'); const c31a = model.rung2Calls; const pa = tabNew(k14, KA, 'https://r5.example/31a'); await new Promise((r) => setTimeout(r, 40)); // A past its probes, waiting for the lock
    const t31 = takeB(); releaseB(); const [rb, ra] = await Promise.all([pb, pa]); const aRan31 = model.rung2Calls > c31a; backB(); setState(roots(k14, p14, KA), 'ok'); setState(roots(k14, p14, KB), 'ok');
    row5('a takeover that begins while this holder WAITS for the rung-2 lock (the other holder\'s rung 2 in flight)', 'tab new ×2 (concurrent)', { takeover: t31.ok, b: { ok: rb.ok, rung: rb.r && rb.r.opened && rb.r.opened.rung }, a: { ok: ra.ok, code: ra.code || null, why: ra.why || null }, aRung2Ran: aRan31 }, { takeover: true, b: { ok: true, rung: 'activate' }, a: { ok: false, code: 'window_busy', why: 'user_driving' }, aRung2Ran: false }, { rb, ra });
    // c32 (③, MEASURED 30/30 per mode): the holder's window closed between the create and the bind (every tab of it gone; the
    // binary knows no such tab) ⇒ window_busy (bind_failed), NEVER the binary's own `tab new` (r4 fell to it: the tab landed in the
    // other holder's window in the FOREGROUND, its page hidden for good); the same `tab new` again ⇒ a new window of its own
    const bWin32 = model.targets.get(roots(k14, p14, KB)[0]).windowId; model.active.set(bWin32, roots(k14, p14, KB)[0]); const bAct32 = model.active.get(bWin32); const bTabs32 = ownOf(k14, p14, KB).slice().sort().join(',');
    model.onCreated = (tid) => { const w = model.targets.get(tid).windowId; for (const [id, t] of [...model.targets]) if (t.windowId === w && t.state !== 'closed') { closeTab(id); fakeRemove(NS14, id); } };
    r7 = await tabNew(k14, KA, 'https://r5.example/32'); const r7c = await tabNew(k14, KA, 'https://r5.example/32b');
    row5('the holder\'s window closed between the create and the bind (the binary knows no such tab); then the same tab new', 'tab new ×2', { ok: r7.ok, code: r7.code || null, why: r7.why || null, shared: !!(r7.r && r7.r.opened && r7.r.opened.window === 'shared'), bTabsUnchanged: ownOf(k14, p14, KB).slice().sort().join(',') === bTabs32, bForegroundUnchanged: model.active.get(bWin32) === bAct32, retry: { ok: r7c.ok, rung: r7c.r && r7c.r.opened && r7c.r.opened.rung, note: r7c.r && r7c.r.noteCode } }, { ok: false, code: 'window_busy', why: 'bind_failed', shared: false, bTabsUnchanged: true, bForegroundUnchanged: true, retry: { ok: true, rung: 'new-window', note: 'tab_new_window' } }, { r7, r7c });
    // c33 (②): the user browsing HIMSELF refuses this holder; his window letting go ⇒ ONE drive-ended naming it (never human-marked);
    // a takeover + handback with NOTHING refused ⇒ no event
    let br = null; try { br = await k14.browse(p14.id); } catch (e) { br = { ok: false, threw: String(e && e.message) }; }
    let at = null; try { at = br && br.ok ? k14.humanAttach({ key: br.key, viewerId: 11, token: br.fresh || null }) : null; } catch (e) { at = { threw: String(e && e.message) }; }
    setState(roots(k14, p14, KA), 'crashed'); r7 = await tabNew(k14, KA, 'https://r5.example/33'); const e1 = evs.length;
    let rel = null; try { rel = br && br.ok ? k14.humanRelease({ key: br.key, viewerId: 11, cause: 'viewer-left' }) : null; } catch (e) { rel = { threw: String(e && e.message) }; }
    const de33 = evs.slice(e1).filter((e) => e.kind === 'drive-ended'); setState(roots(k14, p14, KA), 'ok');
    const t33 = takeB(); const e2 = evs.length; backB(); const de33b = evs.slice(e2).filter((e) => e.kind === 'drive-ended');
    row5('the user browsing himself refuses this holder; his window lets go ⇒ ONE drive-ended naming it; a drive with nothing refused ⇒ none', 'browse + tab new + release; takeover + handback', { driving: !!(at && at.ok && at.take), refused: r7.code || null, why: r7.why || null, released: !!(rel && rel.ok), events: de33.length, names: de33[0] ? de33[0].refused : null, human: de33[0] ? de33[0].human : null, none: de33b.length, takeover: t33.ok }, { driving: true, refused: 'window_busy', why: 'user_driving', released: true, events: 1, names: [`${KA}:x-${KA}:1`], human: false, none: 0, takeover: true }, { br, at, rel, de33, de33b });
  }
  ok(rows5.every((x) => x.okc), `⑦ verify r5 rows: ${rows5.length} (the plan read AT rung 2 — a takeover or a live view that begins during rung 1 or the lock wait is seen; a bind that fails never falls to the shared window; the refused holders are told once when the drive ends)`, rows5.filter((x) => !x.okc).map((x) => `${x.state} | ${x.act} ⇒ ${JSON.stringify(x.got)} (want ${JSON.stringify(x.want)})${x.extra ? ' ' + JSON.stringify(x.extra).slice(0, 500) : ''}`).join('\n    '));
  console.log('    ' + rows5.map((x) => `${x.okc ? '·' : '✗'} ${x.state} · ${x.act} ⇒ ${JSON.stringify(x.got).slice(0, 220)}`).join('\n    '));
  // ── THE SEEDED WALK (T1): ≤ 5 steps from every state, two holders, the invariants after every step ──
  console.log('— T1 the seeded walk over the ladder');
  {
    const STATES = ['ok', 'ok', 'dialog', 'crashed', 'navigating', 'override', 'sandbox', 'elsewhere', 'closed', 'closing-last'];
    // verify r4: the display fact (none / a real display / the hidden window / headless), viewers on this holder's window, the user driving the other holder's window or his own (Browse yourself), a stray aimed at the other holder's window
    const DISPLAYS = [undefined, { kind: 'x11', headed: true, fallback: null }, { kind: 'none', headed: true, fallback: { why: 'no-display', rung: 'hidden-window' } }, { kind: 'none', headed: false, fallback: null }];
    let seed = 20261002; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const viol = []; let steps = 0; const rungSeen = { opener: 0, activate: 0, 'new-window': 0 }; const codesSeen = {}; const seen4 = { watched: 0, drivenB: 0, human: 0, strayInB: 0, noCycle: 0, busyDriven: 0, cycled: 0, drivenMid: 0 }; // verify r5: + a takeover that begins DURING the ladder
    for (let walk = 0; walk < 36; walk++) {
      const kx = mk(K, { dataDir: path.join(O, 'walk-' + walk) }); await kx._facts.probeVersion(); const px = kx.createProfile({ label: 'W' + walk }); const nsx = B.sessionNameFor(px.id);
      await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-' + KA }); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB });
      let human = false; if (rnd() < 0.17) { try { const br = await kx.browse(px.id); if (br && br.ok) { const at = kx.humanAttach({ key: br.key, viewerId: 11, token: br.fresh || null }); human = !!(at && at.ok && at.take); } } catch { human = false; } }
      const n = 1 + Math.floor(rnd() * 6);
      for (let st = 0; st < n; st++) {
        steps++;
        const own = ownOf(kx, px, KA); for (const id of own) setState([id], pick(STATES)); for (const id of own) if (model.targets.get(id).state === 'closed') closeTab(id);
        const statesBefore = own.map((id) => `${id.slice(0, 4)}:${model.targets.get(id).state}@${model.targets.get(id).windowId}`); const jl0 = jl.length; // verify r5: a violation names the step's facts
        model.rung2Fails = rnd() < 0.2; model.elsewhereOnce = rnd() < 0.2; model.rung2LeakOnce = !model.rung2Fails && rnd() < 0.2;
        if (rnd() < 0.15 && own.length) addTab(nsx, mintTid(), { windowId: ++model.nextW, openerId: own[0], holder: 'popup' });
        const viewers = pick([0, 0, 1, 2]); kx.noteViewers(KA, px.id, viewers); if (viewers) seen4.watched++;
        const drivenB = rnd() < 0.25; if (drivenB) { const t = kx.takeover({ browserKey: KB, profileId: px.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true }); if (!t.ok) viol.push({ walk, st, rule: 'the takeover of B refused', t }); else seen4.drivenB++; }
        if (human) seen4.human++;
        // verify r5 ①: a takeover of the OTHER holder's window that begins INSIDE rung 1 (the first probe) — rung 2 must still never run
        let drivenMid = false; model.probeFired = false; if (!drivenB && rnd() < 0.25) model.onProbe = () => { model.probeFired = true; const t = kx.takeover({ browserKey: KB, profileId: px.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true }); if (t.ok) drivenMid = true; };
        const disp = pick(DISPLAYS); if (disp) kx._reg().browsers[px.id].display = disp; else delete kx._reg().browsers[px.id].display;
        const bWinsBefore = [...new Set(ownOf(kx, px, KB).map((id) => model.targets.get(id).windowId))]; model.otherWindow = bWinsBefore.length ? bWinsBefore[0] : null;
        const bTabsBefore = ownOf(kx, px, KB).slice().sort().join(','); const bActiveBefore = bWinsBefore.map((w) => model.active.get(w)).join(',');
        const lb = B.findLease(kx._reg().leases, px.id, KA); const wantBefore = lb ? W.windowIdOf(lb.windowId) : null;
        const bWins = bWinsBefore;
        // a tab ANSWERS the window when it is live there and not closing under its own probe (verify r5: a window whose every tab is
        // `closing-last` — each closed 0 ms into its probe — is GONE after the ladder; a sibling that is itself closing-last keeps nothing alive)
        const answersBefore = own.some((id) => { const t = model.targets.get(id); return t.state !== 'closed' && t.state !== 'closing-last' && wantBefore != null && t.windowId === wantBefore; });
        const ow0 = model.openWindowCalls; const c0 = model.rung2Calls; const log0 = model.rung2Log.length; const so0 = model.straysInOther; const r = await tabNew(kx, KA, 'https://w.example/' + walk + '/' + st);
        const aTabs = ownOf(kx, px, KA).map((id) => ({ id, ...model.targets.get(id) }));
        const popupOf = (t) => t.holder === 'popup' || (t.openerId && model.targets.get(t.openerId) && model.targets.get(t.openerId).holder === 'popup');
        const aWins = [...new Set(aTabs.filter((t) => !popupOf(t)).map((t) => t.windowId))];
        const la = B.findLease(kx._reg().leases, px.id, KA); const wantAfter = la ? W.windowIdOf(la.windowId) : null;
        const answersAfter = aTabs.some((t) => !popupOf(t) && t.windowId === wantAfter);
        const inB = aTabs.filter((t) => bWins.includes(t.windowId)).length;
        if (r.ok) { const rg = r.r && r.r.opened && r.r.opened.rung; if (RUNGS.includes(rg)) rungSeen[rg]++; else viol.push({ walk, st, rule: 'an ok outcome without its rung', rg }); } else { codesSeen[r.code] = (codesSeen[r.code] || 0) + 1; if (!r.code) viol.push({ walk, st, rule: 'a refusal without a code' }); }
        if (aWins.length > 1) viol.push({ walk, st, rule: 'the holder has more than one window (popups excluded)', aWins });
        if (inB) viol.push({ walk, st, rule: 'a tab of the holder sits in the OTHER holder\'s window', inB });
        if (r.code === 'window_busy' && !answersAfter) viol.push({ walk, st, rule: 'window_busy while no tab of the lease answers its window' });
        if (model.openWindowCalls > ow0 && answersBefore && r.ok && !(r.r && r.r.noteCode === 'tab_new_window' && !answersBefore)) { if (answersBefore) viol.push({ walk, st, rule: 're-minted while a tab answered the window', wantBefore, statesBefore, drivenB, drivenMid, human, viewers, disp, result: { code: r.code || null, rung: r.r && r.r.opened && r.r.opened.rung, note: r.r && r.r.noteCode }, lines: jl.slice(jl0).map((x) => x.slice(0, 160)) }); }
        if (r.ok && r.r && r.r.noteCode === 'tab_new_window' && wantBefore != null && aTabs.some((t) => !popupOf(t) && t.windowId === wantBefore)) viol.push({ walk, st, rule: 'said tab_new_window while the old window still holds a tab of the lease' });
        if (liveTargets().some(([, t]) => t.holder === 'stray')) viol.push({ walk, st, rule: 'a stray left open' });
        // verify r4's invariants: rung 2 never runs while the user drives ANY window of the browser (its refusal names him); the
        // window-state cycle never runs under a live view and otherwise follows the display fact; a stray never moves the other
        // holder's foreground tab nor touches its tab set
        model.onProbe = null; if (drivenMid) seen4.drivenMid++;
        const driven = drivenB || human || drivenMid; const calls = model.rung2Log.slice(log0);
        if (driven && model.rung2Calls > c0) viol.push({ walk, st, rule: 'rung 2 ran while the user drives a window of the browser' });
        if (driven && !r.ok && r.code === 'window_busy') { seen4.busyDriven++; if (!/the user is driving a window of this browser/.test(String(r.error || ''))) viol.push({ walk, st, rule: 'a refusal while the user drives does not name him', err: r.error }); }
        if (viewers > 0 && calls.some((c) => c.breaker !== false)) viol.push({ walk, st, rule: 'the window-state cycle ran under a live view' });
        if (viewers > 0 && calls.length) seen4.noCycle++;
        if (!viewers && !driven && calls.length) { const wantCycle = !(disp && disp.headed === true && !(disp.fallback && disp.fallback.rung === 'hidden-window')); if (calls.some((c) => c.breaker !== wantCycle)) viol.push({ walk, st, rule: 'the cycle did not follow the display fact', disp, calls }); if (wantCycle) seen4.cycled++; }
        if (model.straysInOther > so0) seen4.strayInB++;
        if (ownOf(kx, px, KB).slice().sort().join(',') !== bTabsBefore) viol.push({ walk, st, rule: 'a tab of the OTHER holder was closed or added by this holder\'s step' });
        if (bWins.map((w) => model.active.get(w)).join(',') !== bActiveBefore) viol.push({ walk, st, rule: 'the OTHER holder\'s foreground tab moved under this holder\'s step (a foreground stray)' });
        setState(ownOf(kx, px, KA), 'ok'); model.rung2Fails = false; model.elsewhereOnce = false; model.rung2LeakOnce = false; model.otherWindow = null; kx.noteViewers(KA, px.id, 0);
        if (drivenB || drivenMid) kx.handback({ browserKey: KB, profileId: px.id, viewerId: 7, cause: 'explicit' });
      }
    }
    ok(steps >= 100 && !viol.length && rungSeen.opener > 0 && rungSeen.activate > 0 && rungSeen['new-window'] > 0 && (codesSeen.window_busy || 0) > 0 && seen4.watched > 0 && seen4.drivenB > 0 && seen4.human > 0 && seen4.busyDriven > 0 && seen4.noCycle > 0 && seen4.cycled > 0 && seen4.strayInB > 0 && seen4.drivenMid > 0, `T1 THE SEEDED WALK: ${steps} steps over 36 walks (states × rungs × a popup × a leak × viewers × the user driving (a takeover / Browse yourself) × the display fact × a stray aimed at the other holder's window) hold the invariants — one window per holder (popups excluded), never a tab in the other holder's window, window_busy only while a tab answers, a re-mint only when none did, every outcome names its rung (${JSON.stringify(rungSeen)}) or its code (${JSON.stringify(codesSeen)}), rung 2 never while the user drives, no cycle under a live view (${JSON.stringify(seen4)}); ${viol.length} violation(s)`, viol.slice(0, 6).map((v) => JSON.stringify(v)).join('\n    '));
  }

  // ── ⑥ verify r3: THE WINDOW-ID READER CENSUS (grep-derived): no `.windowId` is read through Number()/isFinite() anywhere ──
  {
    const files = ['src/server/browser-keeper.js', 'src/server/browser-viewport.js', 'src/server/browser-stream.js', 'src/routes/browser.js', 'src/browser-tabs.js', 'src/browser-windows.js', 'src/browser-profiles.js', 'src/lib/browser-live-window.js', 'data/bin/vibespace-browser'];
    const raw = []; let sites = 0;
    for (const f of files) { const lines = read(f).split('\n'); lines.forEach((ln, i) => { const t = ln.trim(); if (/^(\*|\/\/|\/\*\*)/.test(t)) return; if (!/\bwindowId\b/.test(ln)) return; if (/windowIdOf\(/.test(ln)) sites++; if (/(Number|isFinite)\([^)]*windowId/.test(ln) && !/function windowIdOf/.test(ln)) raw.push(`${f}:${i + 1}: ${t.slice(0, 120)}`); }); }
    ok(!raw.length && sites >= 9, `⑥ THE WINDOW-ID READER CENSUS: ${sites} windowIdOf sites over ${files.length} files, ${raw.length} raw Number()/isFinite() read(s) of a window id (the Number(null)=0 class)`, raw.join('\n    '));
    // lane site-reset-windows: the keeper's ladder read of a tab's window (anchors, strays, the upgrade path) names no `windowId`,
    // so the census above never saw it — it read `Number(w)`: a dead tab (no window) was window 0, a stray "window 0" said to the
    // agent, a lease on the upgrade path stamped window 0. It reads through THE one reader now
    ok(/const windowOf = async \(tid\) => \{[^\n]*return WIN\.windowIdOf\(w\); \}/.test(read('src/server/browser-keeper.js')) && !/return Number\.isFinite\(Number\(w\)\)/.test(read('src/server/browser-keeper.js')), '⑥ lane site-reset-windows: the keeper\'s ladder reads a tab\'s window through windowIdOf — a dead tab is no window, never window 0');
  }
  // ── ⑧ verify r3: THE --version PROBE TABLE pinned both ways with the 0.38.1 fixture ──
  {
    const F2 = require('../src/browser-facts.js');
    const T = [
      [{ stdout: 'agent-browser 0.38.1\n', stderr: '' }, '0.38.1', 'the binary\'s own shape: stdout alone, exit 0'],
      [{ stdout: 'agent-browser 0.38.1\n', stderr: 'Node.js v24.12.0 (a warning)\n' }, '0.38.1', 'the version on stdout, node\'s own number on stderr'],
      [{ stdout: 'npm notice New major version of npm available! 10.9.0 -> 11.0.0\n', stderr: 'agent-browser 0.38.1\n' }, '0.38.1', 'a wrapper notice with a number on STDOUT, the CLI naming itself on stderr (exit 0)'],
      [{ stdout: 'npm notice 10.9.0 -> 11.0.0\n', stderr: 'agent-browser 0.38.1\n', err: { code: 1 } }, '0.38.1', 'the same on a non-zero exit: a line NAMING the CLI still counts'],
      [{ stdout: '', stderr: '/x/agent-browser:12\n    throw e\nNode.js v24.12.0\n', err: { code: 1 } }, '', 'a crash: node\'s own number on stderr is never a version (r1 ⑦)'],
      [{ stdout: 'agent-browser 0.38.1\n', stderr: 'warn 9.9.9\n', err: { code: 1 } }, '0.38.1', 'a version on stdout counts whatever the exit (r2 ⑥)'],
      [{ stdout: '', stderr: '', err: { code: 'ENOENT' } }, null, 'no binary'],
      [{ stdout: '0.38.1', stderr: '', err: { killed: true } }, '', 'killed: it ran and would not say'],
      // verify r4 ⑦: a wrapper that names the CLI with ANOTHER number on stderr
      [{ stdout: 'agent-browser 0.40.0\n', stderr: 'agent-browser 0.38.1 is deprecated, use 0.40.0\n' }, '0.40.0', 'a shim naming the OLD version on stderr beside the CLI naming itself on stdout: stdout first'],
      [{ stdout: '', stderr: 'agent-browser 0.38.1 is deprecated, use agent-browser 0.40.0\n', err: { code: 1 } }, '0.38.1', 'a shim that swallowed stdout and names two versions on stderr: the FIRST line naming the CLI (what it says it is) — nothing on stdout can tell (held)'],
    ];
    const bad = T.filter(([i, w]) => F2.versionFromProbe(i) !== w).map(([i, w, n]) => `${n}: got ${JSON.stringify(F2.versionFromProbe(i))}, want ${JSON.stringify(w)}`);
    ok(!bad.length, `⑧ THE --version PROBE TABLE: ${T.length} rows (the 0.38.1 fixture both ways; a line naming the CLI wins on either stream)`, bad.join('\n    '));
  }
  // ── ⑨ verify r3: THE SHARED-WINDOW WORDS CENSUS — ONE source for "your window of" / "the shared window of" ──
  {
    const src = ['src/browser-takeover.js', 'src/browser-interrupt.js', 'src/server/browser-handback.js', 'src/server/browser-keeper.js', 'src/server/window-targets-engine.js', 'src/lib/browser-live-window.js', 'src/lib/browser-session-words.js', 'src/lib/browser-trace-view.js', 'data/bin/vibespace-browser'];
    const spellings = []; const callersWithoutShared = [];
    for (const f of src) { const lines = read(f).split('\n'); lines.forEach((ln, i) => { const t = ln.trim(); if (/^(\*|\/\/|\/\*\*)/.test(t) || /const WHO = /.test(ln)) return; if (/your window of the "|the shared window of the "/.test(ln)) spellings.push(`${f}:${i + 1}`); if (/\b(takeoverText|handbackText|browserPausedRefusal|takeoverNotice|handbackNotice)\(\{/.test(ln) && !/function |const takenWho|^\s*\*/.test(ln) && !/shared/.test(ln) && !/target: 'window'/.test(ln) && !/handbackText\(n \|\| \{\}\)|handbackText\(args\)|handbackNotice\(\{ \.\.\.args/.test(ln)) callersWithoutShared.push(`${f}:${i + 1}: ${ln.trim().slice(0, 100)}`); }); }
    const twoSources = spellings.length === 2 && spellings.some((x) => x.startsWith('src/browser-takeover.js')) && spellings.some((x) => x.startsWith('src/browser-interrupt.js'));
    const T2 = require('../src/browser-takeover.js'); const I2 = require('../src/browser-interrupt.js');
    const whoShared = /the shared window of the "Work" browser \(your tab is in it\)/;
    const allSay = whoShared.test(I2.takeoverText({ label: 'Work', shared: true })) && whoShared.test(T2.handbackText({ label: 'Work', cause: 'explicit', shared: true })) && whoShared.test(T2.browserPausedRefusal({ label: 'Work', shared: true }).error || JSON.stringify(T2.browserPausedRefusal({ label: 'Work', shared: true }))) && whoShared.test(T2.takeoverNoticeText(T2.takeoverNotice({ label: 'Work', shared: true }))) && whoShared.test(T2.renderHandbackNotice(T2.handbackNotice({ label: 'Work', cause: 'idle', shared: true })));
    const idle = T2.idleInboxItem({ label: 'Work', idleMs: 60000, url: 'https://x', sessionName: 'S' });
    const inboxNeverWindow = !/window/i.test(idle.text) && !/your window/i.test(idle.detail);
    const clientNeverRenders = !/takeoverText|handbackText|takenWho/.test(read('src/lib/browser-live-window.js') + read('src/lib/browser-session-words.js') + read('src/lib/browser-trace-view.js'));
    ok(twoSources && allSay && !callersWithoutShared.length && inboxNeverWindow && clientNeverRenders, `⑨ THE SHARED-WINDOW WORDS CENSUS: the spelling lives in exactly two PURE sources (${spellings.join(', ')}); the takeover text, handback text, paused refusal, both notices say "the shared window of … (your tab is in it)" for shared:true; every server caller passes shared; the For-you idle item names the browser, never a window; the client never renders the agent's words (its own t() strings)`, JSON.stringify({ spellings, callersWithoutShared, allSay, inboxNeverWindow, clientNeverRenders }));
  }
  // ── THE REVERT TABLE of verify r3's parts — a patched copy per part ──
  { // (f) the re-ask: without it a window gone during the ladder is called busy ("your tabs are still there")
    const needleF = '          let answers = 0; for (const c of cands) { const w = await windowOf(c); if (w != null && w === wantWin) answers++; }'; ok(ksrc.includes(needleF), 'control (f) setup');
    const Kf = M.load('src/server/browser-keeper.js', ksrc.replace(needleF, '          let answers = 1;'), 'no-reask');
    const { kx, px } = await scen(Kf, 'f'); setState([roots(kx, px, KA)[0]], 'closing-last'); const r = await tabNew(kx, KA, 'https://c.example/f');
    ok(!r.ok && r.code === 'window_busy' && /still there/.test(r.error), 'CONTROL (f): a keeper copy without the re-ask calls a window that went away during the ladder busy (the c19 row goes red)', r);
  }
  { // (g) the strays note: without it a lease whose tabs sit in several windows is never told
    const needleG = "      if (made.window === 'own' && made.strays && made.strays.windows.length && l && l.straysSaidIn !== WIN.instanceOf(rec) && !out.note) {"; ok(ksrc.includes(needleG), 'control (g) setup');
    const Kg = M.load('src/server/browser-keeper.js', ksrc.replace(needleG, '      if (false) {'), 'no-strays-note');
    const { kx, px } = await scen(Kg, 'g'); const nsg = B.sessionNameFor(px.id); { const l = B.findLease(kx._reg().leases, px.id, KA); l.tabRoots = TBS.addRoot(l.tabRoots, addTab(nsg, mintTid(), { windowId: ++model.nextW, holder: 'keeper' })); }
    const r = await tabNew(kx, KA, 'https://c.example/g');
    ok(r.ok && !r.r.noteCode, 'CONTROL (g): a keeper copy without the strays note lands the tab and says nothing about the other window (the c20 row goes red)', r);
  }
  { // (h) the leak count: a keeper copy that does not count rung 2's leaks
    const needleH = '          for (const lk of Array.isArray(made && made.leaks) ? made.leaks : []) {'; ok(ksrc.includes(needleH), 'control (h) setup');
    const Kh = M.load('src/server/browser-keeper.js', ksrc.replace(needleH, '          for (const lk of []) {'), 'no-leak-count');
    const { kx, px } = await scen(Kh, 'h'); setState(roots(kx, px, KA), 'crashed'); model.rung2LeakOnce = true; const r = await tabNew(kx, KA, 'https://c.example/h');
    ok(r.ok && kx.list().windowLeaks.count === 0, 'CONTROL (h): a keeper copy that does not count the leaks reports 0 after a leaked rung 2 (the c17 row goes red)', { r, leaks: kx.list().windowLeaks });
  }
  { // (i) the version table without the named-line rule
    const fsrc = read('src/browser-facts.js'); const needleI = '  const v = named(so) || named(se) || B.parseVersion(so) || (!err && B.parseVersion(se)) || null;'; ok(fsrc.includes(needleI), 'control (i) setup');
    const Fi = M.load('src/browser-facts.js', fsrc.replace(needleI, '  const v = err ? B.parseVersion(so) : B.parseVersion(so + se);'), 'no-named-line');
    ok(Fi.versionFromProbe({ stdout: 'npm notice 10.9.0 -> 11.0.0\n', stderr: 'agent-browser 0.38.1\n' }) === '10.9.0', 'CONTROL (i): a facts copy without the named-line rule reads the wrapper\'s notice as the version (the ⑧ table goes red)');
  }
  { // (j) the rung-2 plan: a windows copy that cycles on a real display too
    const wsrc3 = read('src/browser-windows.js'); const needleJ = "  return { run: true, breaker: false, activate: true, why: 'a real display: the window is never minimized in front of the user', create: RUNG2_CREATE };"; ok(wsrc3.includes(needleJ), 'control (j) setup');
    const Wj = M.load('src/browser-windows.js', wsrc3.replace(needleJ, "  return { run: true, breaker: true, activate: true, why: 'always', create: RUNG2_CREATE };"), 'cycle-on-real-display');
    ok(Wj.rung2Plan({ headed: true, fallback: null }).breaker === true && W.rung2Plan({ headed: true, fallback: null }).breaker === false, 'CONTROL (j): a windows copy that cycles the window on a real display too (the c18 row goes red)');
  }
  { // (k) verify r4 T1: a keeper copy that never asks whether the user drives — rung 2 runs (cycle + activation) under his hands
    const needleK = '        const planNow = () => WIN.rung2Plan(rec.display, { viewers: watchers.get(inputKey(holderKey, p.id)) || 0, driven: userDrivesAnyWindowOf(p.id) });'; ok(ksrc.includes(needleK), 'control (k) setup');
    const Kk = M.load('src/server/browser-keeper.js', ksrc.replace(needleK, '        const planNow = () => WIN.rung2Plan(rec.display, { viewers: watchers.get(inputKey(holderKey, p.id)) || 0, driven: false });'), 'rung2-under-the-users-hands');
    const { kx, px } = await scen(Kk, 'k'); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB }); await tabNew(kx, KB, 'https://c.example/kb'); const t = kx.takeover({ browserKey: KB, profileId: px.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true });
    const c0 = model.rung2Calls; setState(roots(kx, px, KA), 'crashed'); const r = await tabNew(kx, KA, 'https://c.example/k'); setState(roots(kx, px, KA), 'ok');
    ok(t.ok && r.ok && model.rung2Calls > c0, 'CONTROL (k): a keeper copy that never asks whether the user drives runs rung 2 under his hands (the c23 / c24 rows and the walk go red)', r);
  }
  { // (l) verify r4 ①: a plan copy without the viewer rule cycles the window a live view shows
    const wsrc4 = read('src/browser-windows.js'); const needleL = '  const watched = (Number(viewers) || 0) > 0;'; ok(wsrc4.includes(needleL), 'control (l) setup');
    const Wl = M.load('src/browser-windows.js', wsrc4.replace(needleL, '  const watched = false;'), 'cycle-under-a-live-view');
    ok(Wl.rung2Plan({ headed: false }, { viewers: 2 }).breaker === true && W.rung2Plan({ headed: false }, { viewers: 2 }).breaker === false, 'CONTROL (l): a plan copy without the viewer rule runs the window-state cycle under a live view (the c22 row goes red)');
  }
  { // (m) verify r4 ③: the model under a FOREGROUND create — the other holder's foreground tab moves when the stray closes (the invariant has teeth; the product's create is the background one pinned below)
    model.rung2Create = { url: 'about:blank', background: false };
    const { kx, px } = await scen(K, 'm'); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB }); await tabNew(kx, KB, 'https://c.example/mb1'); await tabNew(kx, KB, 'https://c.example/mb2');
    const bWin = model.targets.get(roots(kx, px, KB)[0]).windowId; model.otherWindow = bWin; model.active.set(bWin, roots(kx, px, KB)[0]); const before = model.active.get(bWin);
    setState(roots(kx, px, KA), 'crashed'); model.rung2LeakOnce = true; await tabNew(kx, KA, 'https://c.example/m'); setState(roots(kx, px, KA), 'ok'); model.otherWindow = null; model.rung2Create = null;
    ok(model.active.get(bWin) !== before && model.active.get(bWin) === roots(kx, px, KB)[roots(kx, px, KB).length - 1], `CONTROL (m): under a foreground create the other holder's foreground moves to its LAST tab when the stray closes (${String(before).slice(0, 8)} → ${String(model.active.get(bWin)).slice(0, 8)}; Chrome's measured rule) — the c28 row and the walk's foreground invariant go red; the product's create is a background one`);
  }
  { // (n) verify r5 ①: a keeper copy that reads the plan at the ladder's TOP (r4's shape) — a takeover that begins during rung 1 runs rung 2 under his hands
    const needleN1 = '        let plan = null;'; const needleN2 = "rung2Serialized(p.id, () => { plan = planNow(); if (plan.run === false) return { ok: false, code: 'rung2_not_run', error: plan.why }; return open("; ok(ksrc.includes(needleN1) && ksrc.includes(needleN2), 'control (n) setup');
    const Kn = M.load('src/server/browser-keeper.js', ksrc.replace(needleN1, '        let plan = planNow();').replace(needleN2, "rung2Serialized(p.id, () => { if (plan.run === false) return { ok: false, code: 'rung2_not_run', error: plan.why }; return open("), 'plan-at-the-top');
    const { kx, px } = await scen(Kn, 'n'); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB }); await tabNew(kx, KB, 'https://c.example/nb');
    setState(roots(kx, px, KA), 'crashed'); model.onProbe = () => { kx.takeover({ browserKey: KB, profileId: px.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true }); }; const c0 = model.rung2Calls; const r = await tabNew(kx, KA, 'https://c.example/n'); setState(roots(kx, px, KA), 'ok'); kx.handback({ browserKey: KB, profileId: px.id, viewerId: 7, cause: 'explicit' });
    ok(r.ok && model.rung2Calls > c0, 'CONTROL (n): a keeper copy that reads the plan at the ladder\'s top runs rung 2 under the hands of a user whose takeover began during rung 1 (the c29 / c31 rows and the walk\'s drivenMid steps go red)', r);
  }
  { // (o) verify r5 ③: a keeper copy that falls to the binary's own `tab new` when the bind fails — the tab lands in the browser's last window (another holder's), said shared
    const needleO = "      if (fallback) { log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: its new tab ${id.slice(0, 8)} could not be bound to its session (${execWhy(b)}) — closed, refused window_busy (bind_failed), never the browser's last window`); made = { ok: false, code: 'window_busy', why: 'bind_failed', error: `your new tab could not be bound to your session (${execWhy(b)}) — nothing opened; run the same \\`tab new\\` once more (a window of yours that is gone gets a new one)` }; }"; ok(ksrc.includes(needleO), 'control (o) setup');
    const Ko = M.load('src/server/browser-keeper.js', ksrc.replace(needleO, "      if (fallback) made = { ok: false, error: `its new window could not be bound to its session (${execWhy(b)})` };"), 'shared-fallback-on-bind-failure');
    const { kx, px } = await scen(Ko, 'o'); const NSo = B.sessionNameFor(px.id);
    model.onCreated = (tid) => { const w = model.targets.get(tid).windowId; for (const [id, t] of [...model.targets]) if (t.windowId === w && t.state !== 'closed') { closeTab(id); fakeRemove(NSo, id); } };
    const r = await tabNew(kx, KA, 'https://c.example/o');
    ok(r.ok && r.r && r.r.opened && r.r.opened.window === 'shared' && r.r.noteCode === 'tab_shared_window', 'CONTROL (o): a keeper copy that falls back on a bind failure opens the tab in the browser\'s LAST window — shared, beside another conversation\'s page (the c32 row goes red)', r);
  }
  { // (p) verify r5 ②: a keeper copy that never remembers a refusal — the handback tells nobody
    const needleP = '          noteRung2Refused(p.id, holderKey, lease ? lease.sessionId : null);'; ok(ksrc.includes(needleP), 'control (p) setup');
    const Kp = M.load('src/server/browser-keeper.js', ksrc.replace(needleP, ''), 'refusal-forgotten');
    const { kx, px } = await scen(Kp, 'p'); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB }); await tabNew(kx, KB, 'https://c.example/pb');
    const evs = []; kx.onInput((ev) => evs.push(ev.kind)); kx.takeover({ browserKey: KB, profileId: px.id, viewerId: 7, sessionId: 'x-' + KB, holderAlive: true });
    setState(roots(kx, px, KA), 'crashed'); const r = await tabNew(kx, KA, 'https://c.example/p'); setState(roots(kx, px, KA), 'ok'); kx.handback({ browserKey: KB, profileId: px.id, viewerId: 7, cause: 'explicit' });
    ok(r.code === 'window_busy' && !evs.includes('drive-ended'), 'CONTROL (p): a keeper copy that never remembers a refusal emits no drive-ended at the handback — the refused holder is left to poll (the c29 / c33 rows go red)', { code: r.code, evs });
  }
  { // verify r5 pins: the drive-ended notice — its kind registered in session-status, its ONE sentence, the announcer's branch, the keeper's three drive-end sites
    const ssrc = read('src/session-status.js'); const hsrc = read('src/server/browser-handback.js');
    const n = W.driveEndedNotice({ label: 'Work', n: 2, at: 5 });
    ok(n.kind === W.DRIVE_ENDED_NOTICE_KIND && n.kind === 'browser-window-free' && W.renderDriveEndedNotice(n) === '<system-reminder>\n' + W.driveEndedText(n) + '\n</system-reminder>' && /"Work"/.test(W.driveEndedText(n)) && /2 times/.test(W.driveEndedText(n)) && /1 time\b/.test(W.driveEndedText({ n: 1 })) && /'browser-window-free': \(n\) => require\('\.\/browser-windows'\)\.renderDriveEndedNotice\(n\)/.test(ssrc) && /if \(ev\.kind === 'drive-ended'\) \{ try \{ announceDriveEnded\(ev\);/.test(hsrc) && /queueNotice\(sess, WIN\.driveEndedNotice\(\{ label, n: r\.n, at \}\)\)/.test(hsrc) && (ksrc.match(/driveEnded\((profileId|h\.profileId)\);/g) || []).length === 3 && /emitInput\(\{ kind: 'drive-ended', browserKey: null, profileId: pid/.test(ksrc), 'verify r5 pins: the drive-ended notice is the registered browser-window-free kind with ONE sentence; the announcer turns the keeper\'s drive-ended event into that free notice (queueNotice, never a delivery); the keeper ends a drive at the handback, his window letting go and his row ending');
  }
  { // verify r4 pins: the viewport's rung-2 create IS the PURE background one; the keeper hands the plan the bridge's viewer count and whether the user drives any window of the browser
    const vsrc = read('src/server/browser-viewport.js');
    ok(W.RUNG2_CREATE.background === true && W.RUNG2_CREATE.url === 'about:blank' && /'Target\.createTarget', \{ \.\.\.W\.RUNG2_CREATE \}/.test(vsrc) && /const planNow = \(\) => WIN\.rung2Plan\(rec\.display, \{ viewers: watchers\.get\(inputKey\(holderKey, p\.id\)\) \|\| 0, driven: userDrivesAnyWindowOf\(p\.id\) \}\);/.test(ksrc) && /rung2Serialized\(p\.id, \(\) => \{ plan = planNow\(\); if \(plan\.run === false\) return \{ ok: false, code: 'rung2_not_run'/.test(ksrc) && /return holdersOn\(pid\)\.some\(\(h\) => h\.human \? h\.input === 'user' : \(\(inputs\.get\(inputKey\(h\.browserKey, pid\)\) \|\| \{\}\)\.input === 'user'\)\);/.test(ksrc), 'verify r4/r5 pins: rung 2\'s create is W.RUNG2_CREATE (about:blank, background) in the viewport; the plan (the bridge\'s viewer count + whether the user drives any window) is read AT RUNG 2, inside the browser\'s lock — after the opener rung\'s probes and the lock wait (r5 ①/②); the user\'s drive is a HOLDER question asked through holdersOn (r5 ⑥)');
  }
  // ── lane browser-windows-fix (int201, 2026-10-02): THE HOLDER'S OWN WINDOW IS ITS TAB EVERYWHERE, AND A REBIND INTO IT IS SAID —
  //    the integrator's two reds on 2666de5a (heavy test-browser-site-reset-chrome ⑤: a shared profile's bare `site-reset` read no tab
  //    of its own; heavy test-browser-share ⑩: the first command after a SingletonLock takeover printed no [tab_rebound]) on this model ──
  console.log('— lane browser-windows-fix: the own window\'s tab is the holder\'s for the dialog watch, and a lost tab\'s new window is said');
  const bwf = async (Kmod, tag) => {
    const kx = mk(Kmod, { dataDir: path.join(O, 'data-bwf-' + tag) }); await kx._facts.probeVersion(); const px = kx.createProfile({ label: 'BWF ' + tag });
    await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-' + KA }); await kx.attach({ profileId: px.id, browserKey: KB, sessionId: 'x-' + KB });
    // (1) the dialog watch's whose-tab source (production wiring: setTabsOf → keeper.holderTabs) names each holder's own-window tab
    const ownA = roots(kx, px, KA)[0] || null, ownB = roots(kx, px, KB)[0] || null;
    const htA = kx.holderTabs(px.id, KA), htB = kx.holderTabs(px.id, KB);
    const tabs = { ownA: !!ownA && htA.includes(ownA), notB: !!ownB && !htA.includes(ownB), ownB: !!ownB && htB.includes(ownB) };
    // (2) THE ROLL: the browser replaced under the lease (a new run, its old tabs gone) and L2's mark written as tabsLost writes it
    const reg = kx._reg(); const kk = `${px.id}|${KA}`;
    for (const t of roots(kx, px, KA)) closeTab(t);
    reg.browsers[px.id].startedAt = Number(reg.browsers[px.id].startedAt) + 1000;
    reg.tabClosed[kk] = Date.now(); reg.tabLostWhy = { ...(reg.tabLostWhy || {}), [kk]: 'life' };
    const w0 = model.openWindowCalls;
    const a = await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-' + KA });
    const a2 = await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-' + KA });
    const nowOwn = roots(kx, px, KA)[0] || null;
    const said = { newWindow: model.openWindowCalls === w0 + 1, rebound: !!a.rebound, how: a.rebound ? a.rebound.how : null, why: a.rebound ? a.rebound.why : null, boundToOwn: !!(a.rebound && nowOwn && a.rebound.targetId === nowOwn),
      words: !!(a.rebound && /previous run is gone/.test(a.rebound.text) && /new tab was opened/.test(a.rebound.text)), markSpent: !reg.tabClosed[kk], once: !a2.rebound };
    return { tabs, said };
  };
  {
    const r8 = await bwf(K, 'head');
    ok(JSON.stringify(r8.tabs) === JSON.stringify({ ownA: true, notB: true, ownB: true }), 'bwf ① the dialog watch\'s whose-tab source (keeper.holderTabs — the roots the tab fence reads) names each holder\'s OWN-WINDOW tab and never the other holder\'s: a shared profile\'s `site-reset` / `stop` reads its own tab', r8.tabs);
    ok(JSON.stringify(r8.said) === JSON.stringify({ newWindow: true, rebound: true, how: 'new', why: 'life', boundToOwn: true, words: true, markSpent: true, once: true }), 'bwf ② a lease whose tab went with a replaced browser (L2\'s mark) is bound in a NEW window of its own AND told so — the attach answer carries the rebound note ([tab_rebound]), once', r8.said);
    const n1 = "    for (const h of tabHoldersOf(pid)) if (h && h.key === bk) for (const t of (Array.isArray(h.roots) ? h.roots : [])) if (t) out.add(String(t));\n";
    const n2 = "    if (lostWhy) keepRebound(p.id, browserKey, { how: 'new', targetId: String(r.targetId), url: 'about:blank', why: lostWhy, text: TBS.reboundNoteText({ how: 'new', why: lostWhy }) });\n";
    ok(ksrc.includes(n1) && ksrc.includes(n2), 'control (bwf) setup: both fix lines are found in src/server/browser-keeper.js');
    const c1 = await bwf(M.load('src/server/browser-keeper.js', ksrc.replace(n1, ''), 'bwf-no-roots'), 'c1');
    ok(!c1.tabs.ownA && !c1.tabs.ownB && c1.said.rebound, 'CONTROL (bwf-1): a keeper copy whose holderTabs skips the roots (2666de5a) names NO holder\'s own-window tab — the site-reset-chrome ⑤ shape', c1.tabs);
    const c2 = await bwf(M.load('src/server/browser-keeper.js', ksrc.replace(n2, ''), 'bwf-silent-rebind'), 'c2');
    ok(c2.tabs.ownA && c2.said.newWindow && c2.said.markSpent && !c2.said.rebound, 'CONTROL (bwf-2): a keeper copy without the note (2666de5a) opens the new window and SPENDS the mark, saying nothing — the share ⑩ shape', c2.said);
  }
}

for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'browser-windows controls: ' })) ok(c.pass, c.name, c.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
