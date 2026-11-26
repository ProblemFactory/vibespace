#!/usr/bin/env node
// test-browser-tab-watch — 主开发 r4689 / r4691 (the owner's ask; DARK until the owner has seen it work): A PERSON WHO ONLY WATCHES
// SEES A PICKED TAB MOVE, on the custom kernel. Today a watcher's pick of a tab that is not in front is a still every half second (the
// screencast draws nothing, the view polls — src/browser-windows.js watchModeVerdict). The kernel conversation's answer: its
// VibeSpace.setTabWatch {targetId, watch} on the browser's own connection makes ONE named tab draw and stream while it is NOT in front
// (≤ 4 a browser, four named refusals), STATED as the manifest word tabWatch beside environment and MEASURED as a top-level tabWatch
// in its probe. This suite judges OUR side, with a stand-in browser session of its own (the kernel conversation's stand-in kernel is
// read by path once it is named; no real kernel binary runs here):
//   ① PURE — the kernel's own spelling (word, command, codes, limit); the probe's boolean row (PROBE_FLAGS) and its shape refusal;
//      the answer verdict; the launch's rule (states AND measures); the watch line's words (the one effect, the cap), today's words
//      byte for byte on stock, zh + ja rows.
//   ② the engine registry's ONE loader ask (statesTabWatch): true / false / null, a built-in engine states nothing.
//   ③ the keeper's watchTabFor over a stand-in page watch + screencast (the keeper's watchTarget seam): ON BEFORE the screencast;
//      two viewers of one tab ⇒ one ON, OFF only after both; the kernel's cap ⇒ the still (today's road) + its code and count; a stock
//      browser is never asked, its answer handed back AS IT IS. REDS: ON after the screencast; OFF at the first of two; stock asked.
//   ④ the page watch's setTabWatch over a stand-in browser that models the command (ON, the fifth refused by its code, OFF) and the
//      freeze: a watched tab is never put frozen, the others are; RED: the freeze without that rule.
//   ⑤ the bridge's watching record: `live` / `capped` ride the record on that road; on stock the record is today's.
// Run: node scripts/test-browser-tab-watch.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(15); } return !!(await f()); };
const J = (x) => JSON.stringify(x);
const ROOT = scratch('browser-tab-watch');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const servers = [];
function cleanup() { for (const s of servers) { try { s.close(); } catch { /* */ } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ } }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const M = mutantCopies('browser-tab-watch', REPO);
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const T = (n) => (n.toString(16).toUpperCase().padStart(4, '0') + 'D'.repeat(28));
const ENG = require('../src/browser-engines.js');
const WIN = require('../src/browser-windows.js');

// ═══ ① PURE ═══
console.log('— ① PURE: the kernel\'s own spelling, the probe\'s boolean row, the answer, the launch\'s rule, the words');
{
  ok(ENG.TAB_WATCH_WORD === 'tabWatch' && ENG.TAB_WATCH_COMMAND === 'VibeSpace.setTabWatch' && J(ENG.TAB_WATCH_CODES) === J(['no_such_target', 'not_a_page', 'target_crashed', 'too_many_watched_tabs']) && ENG.TAB_WATCH_LIMIT === 4 && Object.isFrozen(ENG.TAB_WATCH_CODES),
    'the kernel\'s own spelling (verified by it against its source at its pinned version): the word tabWatch, the command VibeSpace.setTabWatch, its four refusal codes, at most 4 watched tabs');
  const st = { both: ENG.statesTabWatch({ browserEngine: ['environment', 'tabWatch'] }), alone: ENG.statesTabWatch({ browserEngine: ['tabWatch'] }), envOnly: ENG.statesTabWatch({ browserEngine: ['environment'] }), none: ENG.statesTabWatch({}), junk: ENG.statesTabWatch({ browserEngine: 'tabWatch' }), nul: ENG.statesTabWatch(null) };
  ok(st.both && st.alone && !st.envOnly && !st.none && !st.junk && !st.nul, 'the manifest STATES the word only in capabilities.browserEngine as a list holding tabWatch (beside environment or alone)', st);
  ok(J(Object.keys(ENG.PROBE_FLAGS)) === J(['tabWatch']) && Object.isFrozen(ENG.PROBE_FLAGS) && Object.values(ENG.PROBE_FLAGS).every((v) => typeof v === 'string' && v.length > 20),
    'the probe\'s top-level booleans are a CLOSED set, one row each with its meaning (PROBE_FLAGS: tabWatch)', ENG.PROBE_FLAGS);
  const body = { installed: true, executable: true, version: '1.2.3', protocol: ENG.PROTOCOL, kinds: ['chromium'], features: [] };
  const pv = (b) => ENG.engineAnswerVerdict('probe', { status: 200, body: b }, { id: 'acme.engine', label: 'Acme' });
  const pr = { on: pv({ ...body, tabWatch: true }), off: pv({ ...body, tabWatch: false }), absent: pv(body), nul: pv({ ...body, tabWatch: null }), str: pv({ ...body, tabWatch: 'yes' }) };
  ok(pr.on.ok && pr.on.fact.tabWatch === true && [pr.off, pr.absent, pr.nul, pr.str].every((x) => x.ok && x.fact.tabWatch === false),
    'the probe MEASURES it: a top-level boolean kept in the fact, true ONLY when true — absent, false, null or another shape read false, never a refusal (the owner\'s rule for the kernel\'s top-level facts)', { on: pr.on.fact && pr.on.fact.tabWatch, str: pr.str.ok && pr.str.fact.tabWatch });
  const A = ENG.tabWatchAnswer;
  const an = { on: A({ result: { ok: true, targetId: T(1), watching: true, activeCount: 2 } }), off: A({ result: { ok: true, targetId: T(1), watching: false, activeCount: 1 } }),
    cap: A({ result: { ok: false, code: 'too_many_watched_tabs', targetId: T(5), watching: false, activeCount: 4, limit: 4 } }), gone: A({ result: { ok: false, code: 'no_such_target', targetId: T(6), watching: false, activeCount: 0, limit: 4 } }),
    unknownCode: A({ result: { ok: false, code: 'something_else' } }), err: A({ error: { message: '\'VibeSpace.setTabWatch\' wasn\'t found' } }), timeout: A({ timeout: true }), none: A(null) };
  ok(an.on.ok && an.on.watching === true && an.on.activeCount === 2 && an.off.ok && an.off.watching === false && !an.cap.ok && an.cap.code === 'too_many_watched_tabs' && an.cap.limit === 4 && an.cap.activeCount === 4
    && an.gone.code === 'no_such_target' && an.unknownCode.code === 'tab_watch_failed' && an.err.code === 'tab_watch_failed' && an.timeout.code === 'tab_watch_unanswered' && an.none.code === 'tab_watch_unanswered'
    && !J(an).includes(T(1)) && !J(an).includes(T(5)),
    'the kernel\'s answer judged: ok + watching + its count; its four codes by name (the cap with its limit); no answer ⇒ tab_watch_unanswered, anything else ⇒ tab_watch_failed — no target id carried on', an);
  // the watch line's words: the one effect where the watcher reads the line (a phone has no hover), the cap by its count; stock byte for byte
  const L = WIN.watchLineWords;
  const today = { named: L({ watched: 'Docs', current: 'Cart' }), namedPoll: L({ watched: 'Docs', current: 'Cart', mode: 'polling' }), anon: L({}), anonPoll: L({ mode: 'polling' }) };
  ok(today.named === 'Watching “Docs” — the agent is on “Cart”' && today.namedPoll === 'Watching “Docs” — a new picture every half second; the agent is on “Cart”'
    && today.anon === 'Watching another tab of the agent’s — the agent’s current tab is unchanged' && today.anonPoll === 'Watching a background tab of the agent’s — a new picture every half second; the agent’s current tab is unchanged',
    'STOCK, byte for byte: the four watch lines a view reads today (named / unnamed, moving / every half second)', today);
  const EFFECT = 'While you watch this tab, its page runs its timers at full speed and a playing video keeps playing.';
  const w = { live: L({ watched: 'Docs', current: 'Cart', live: true }), livePoll: L({ watched: 'Docs', current: 'Cart', mode: 'polling', live: true }), cap: L({ watched: 'Docs', current: 'Cart', mode: 'polling', capped: 4 }), liveAnon: L({ live: true }) };
  ok(w.live === `${today.named} ${EFFECT}` && w.liveAnon === `${today.anon} ${EFFECT}` && w.livePoll === today.namedPoll && w.cap === `${today.namedPoll} This browser shows at most 4 tabs live while they are not in front — this one stays a still.`
    && !/Docs.*Docs/.test(w.cap) && !/\b[0-9A-F]{32}\b/.test(J(w)),
    'r4691: the watch line tells the ONE effect where the watcher reads it (only while the picture moves); the kernel\'s cap by its count (never which tabs, never whose)', w);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = [EFFECT, 'This browser shows at most {n} tabs live while they are not in front — this one stays a still.'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')), 'both new sentences have a zh and a ja row', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
  // the launch's rule: the keeper asks only where the engine STATES the word AND its probe MEASURED it (both at that launch)
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ok(ksrc.includes("const tabWatch = engine.tabWatch === true && typeof engs().statesTabWatch === 'function' && engs().statesTabWatch(c.id) === true;")
    && ksrc.includes("...(be && be.engine && be.engine.tabWatch === true ? { tabWatch: true } : {})") && ksrc.includes("if (!rec || !rec.browserChoice || rec.browserChoice.tabWatch !== true || !paintWatch || typeof paintWatch.setTabWatch !== 'function') return null;"),
    'PIN: the launch records tabWatch only when the probe MEASURED it AND the loader says the manifest STATES it; the record is the one road the keeper asks by (never a name)');
}

// ═══ ② the engine registry's ONE loader ask ═══
console.log('— ② statesTabWatch: the loader\'s own list, one ask');
{
  const ER = require('../src/server/browser-engines.js');
  const row = (caps, more = {}) => ({ id: 'acme.engine', valid: true, enabled: true, trusted: true, state: 'running', contributes: { browserEngine: true }, capabilities: caps, ...more });
  const reg = (list) => ER.create({ loader: { list: () => list }, log: quiet });
  const a = { both: reg([row({ browserEngine: ['environment', 'tabWatch'] })]).statesTabWatch('acme.engine'), envOnly: reg([row({ browserEngine: ['environment'] })]).statesTabWatch('acme.engine'),
    off: reg([row({ browserEngine: ['tabWatch'] }, { enabled: false })]).statesTabWatch('acme.engine'), untrusted: reg([row({ browserEngine: ['tabWatch'] }, { trusted: false })]).statesTabWatch('acme.engine'),
    unread: ER.create({ loader: { list: () => null }, log: quiet }).statesTabWatch('acme.engine'), env: reg([row({ browserEngine: ['environment', 'tabWatch'] })]).statesEnvironment('acme.engine') };
  ok(a.both === true && a.envOnly === false && a.off === null && a.untrusted === null && a.unread === null && a.env === true,
    'ONE loader ask, the same three answers as the environment word: states (true), listed without it (false), not listed so — off, untrusted, unread (null); the environment word unchanged', a);
}

// ═══ ③ the keeper's watchTabFor over a stand-in page watch and screencast ═══
console.log('— ③ the keeper: ON before the screencast, counted per tab, the cap\'s still, stock untouched');
const K = require('../src/server/browser-keeper.js');
const ksrc3 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
const keeperLeg = async (Kmod, tag, { tabWatch = true, cap = false } = {}) => {
  const log = [];
  const shots = new Map();
  const watchTarget = async (url, id, hooks) => { log.push(`screencast ${id.slice(0, 4)}`); const r = { ok: true, close: () => log.push(`screencast-closed ${id.slice(0, 4)}`) }; if (!shots.has(id)) shots.set(id, r); return r; }; // the FIRST watch's own screencast (the stock leg's identity)
  const kw = Kmod.create({ dataDir: path.join(ROOT, 'k-' + tag), homeDir: path.join(ROOT, 'h-' + tag), env: () => ({}), serverSetting: () => undefined, liveKeys: () => new Set(), log: quiet, install: false, watchTarget });
  kw.list(); // the registry loaded before the leg writes its record
  const PID = 'bp-0000d0e1';
  kw._reg().browsers[PID] = { profileId: PID, state: 'ready', cdpUrl: 'ws://127.0.0.1:9/devtools/browser/stand-in', browserChoice: tabWatch ? { kind: 'plugin', id: 'acme.engine', tabWatch: true } : { kind: 'default' } };
  let active = 0;
  kw.setPaintWatch({ paintFacts: () => null, freezePaint: async () => ({ ok: false }), thawPaint: async () => ({ ok: true }),
    setTabWatch: async (pid, id, on) => { log.push(`${on ? 'ON' : 'OFF'} ${id.slice(0, 4)}`); if (on && cap) return { ok: false, code: 'too_many_watched_tabs', activeCount: 4, limit: 4 }; active += on ? 1 : -1; return { ok: true, watching: !!on, activeCount: active }; } });
  const target = { ok: true, kind: 'attachment', profileId: PID };
  const one = await kw.watchTabFor(target, T(1), {});
  const two = await kw.watchTabFor(target, T(1), {});
  const logAfterTwo = log.slice();
  // the keeper sends OFF on a microtask after a close: each capture waits for what that close queued to run (setImmediate runs
  // after the microtask queue drains — the fact, never a span), so a wrong OFF at the first close is SEEN, and a right one at the second
  const flush = () => new Promise((r) => setImmediate(r));
  one.close(); await flush(); const afterFirst = log.slice();
  two.close(); await flush(); const afterBoth = log.slice();
  try { kw.shutdown?.(); } catch { /* */ }
  return { log: afterBoth, logAfterTwo, afterFirst, one: { tabWatch: one.tabWatch, same: one === shots.get(T(1)) }, two: { tabWatch: two.tabWatch } };
};
{
  const ON_ANCH = "    const kw = await tabWatchOn(target, id);\n";
  const ORDER_TO = "    let kw = null; const kwLater = () => tabWatchOn(target, id); // (the control: the screencast first, as a road without the order)\n";
  const AFTER_ANCH = "    if (!kw) return r;\n";
  const COUNT_ANCH = "    if (n > 1) { tabWatchCounts.set(k, n - 1); return; }\n";
  const STOCK_ANCH = "    if (!rec || !rec.browserChoice || rec.browserChoice.tabWatch !== true || !paintWatch || typeof paintWatch.setTabWatch !== 'function') return null;\n";
  for (const a of [ON_ANCH, AFTER_ANCH, COUNT_ANCH, STOCK_ANCH]) if (!ksrc3.includes(a)) ok(false, `the anchor of a control is not in the source (src/server/browser-keeper.js): ${a.trim().slice(0, 80)}`);
  const Korder = M.load('src/server/browser-keeper.js', anchored(anchored(ksrc3, ON_ANCH, ORDER_TO), AFTER_ANCH, "    kw = await kwLater();\n    if (!kw) return r;\n"), 'tw-order');
  const Kcount = M.load('src/server/browser-keeper.js', anchored(ksrc3, COUNT_ANCH, "    // (the control: no count)\n"), 'tw-count');
  const Kstock = M.load('src/server/browser-keeper.js', anchored(ksrc3, STOCK_ANCH, "    if (!rec || !paintWatch || typeof paintWatch.setTabWatch !== 'function') return null; // (the control: asked of every browser)\n"), 'tw-stock');
  const [now, cap, stock, cOrder, cCount, cStock] = await Promise.all([keeperLeg(K, 'now'), keeperLeg(K, 'cap', { cap: true }), keeperLeg(K, 'stock', { tabWatch: false }),
    keeperLeg(Korder, 'c-order'), keeperLeg(Kcount, 'c-count'), keeperLeg(Kstock, 'c-stock', { tabWatch: false })]);
  const A1 = T(1).slice(0, 4);
  ok(J(now.logAfterTwo) === J([`ON ${A1}`, `screencast ${A1}`, `screencast ${A1}`]) && now.one.tabWatch && now.one.tabWatch.live === true,
    'LAW: the kernel\'s watch ON BEFORE the screencast starts (a never-shown tab gets its bounds then) — and a second viewer of the same tab asks no second ON', now.logAfterTwo);
  ok(!now.afterFirst.includes(`OFF ${A1}`) && now.log.filter((x) => x === `OFF ${A1}`).length === 1 && now.log.indexOf(`OFF ${A1}`) > now.log.lastIndexOf(`screencast-closed ${A1}`),
    'LAW (c): two viewers of one tab hold it — OFF only after BOTH watches ended, once, after its screencast closed', now.log);
  ok(J(cap.log.filter((x) => /^ON|^OFF/.test(x))) === J([`ON ${A1}`, `ON ${A1}`]) && cap.log.filter((x) => x.startsWith('screencast ')).length === 2 && cap.one.tabWatch && cap.one.tabWatch.live === false && cap.one.tabWatch.code === 'too_many_watched_tabs' && cap.one.tabWatch.limit === 4,
    'LAW (d): the kernel\'s cap refused by its own code — the watch goes on as today\'s still (its screencast, then the poll), said by code and limit; nothing to switch OFF', cap);
  ok(stock.log.every((x) => !/^ON|^OFF/.test(x)) && stock.one.same === true && stock.one.tabWatch === undefined,
    'LAW (a): a STOCK browser (no tabWatch at its launch) is never asked — its watch is handed back AS IT IS, today\'s road byte for byte', stock);
  ok(cOrder.logAfterTwo.indexOf(`screencast ${A1}`) < cOrder.logAfterTwo.indexOf(`ON ${A1}`), 'CONTROL (the screencast first): the kernel\'s watch lands after the screencast started — RED', cOrder.logAfterTwo);
  ok(cCount.afterFirst.includes(`OFF ${A1}`), 'CONTROL (no count): the first viewer\'s leave switches the tab OFF under the second viewer — RED', cCount.afterFirst);
  ok(cStock.log.some((x) => x.startsWith('ON ')), 'CONTROL (asked of every browser): a stock browser is sent the kernel\'s command — RED', cStock.log);
}

// ═══ ④ the page watch's setTabWatch and the freeze ═══
console.log('— ④ the page watch: the command on the browser\'s own connection; the freeze never freezes a watched tab');
const { WebSocketServer: WSS } = require('ws');
const T0 = T(0x10), T1 = T(0x11), T2 = T(0x12), T3 = T(0x13), T4 = T(0x14), T5 = T(0x15);
const PAGES = [T0, T1, T2, T3, T4, T5];
const standIn = async () => {
  const st = { watched: new Set(), frozen: new Set(), cmds: [], urls: new Map() };
  const wss = new WSS({ port: 0, host: '127.0.0.1' }); await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (sock) => sock.on('message', (raw) => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    const p = m.params || {}; const re = (result) => { try { sock.send(JSON.stringify({ id: m.id, result })); } catch { /* closed */ } };
    if (m.method === 'Target.getTargets') return re({ targetInfos: PAGES.map((t) => ({ targetId: t, type: 'page', title: '', url: t === T0 ? 'https://front.example/' : `https://t${t.slice(2, 4)}.example/`, attached: false })) });
    if (m.method === 'Target.attachToTarget') return re({ sessionId: 'S' + p.targetId });
    if (m.method === 'Runtime.evaluate' && p.expression === 'document.visibilityState') return re({ result: { type: 'string', value: String(m.sessionId || '').slice(1) === T0 ? 'visible' : 'hidden' } });
    if (m.method === 'Browser.getWindowForTarget') return re({ windowId: 1 });
    if (m.method === 'Page.setWebLifecycleState') { if (p.state === 'frozen') st.frozen.add(String(m.sessionId || '').slice(1)); else st.frozen.delete(String(m.sessionId || '').slice(1)); return re({}); }
    // THE KERNEL's command, as it spells it: on the browser's own connection (no sessionId), {targetId, watch}; ≤ 4 at once
    if (m.method === 'VibeSpace.setTabWatch') {
      st.cmds.push({ on: !!p.watch, tid: p.targetId, session: m.sessionId || null });
      if (!PAGES.includes(p.targetId)) return re({ ok: false, code: 'no_such_target', targetId: p.targetId, watching: false, activeCount: st.watched.size, limit: 4 });
      if (p.watch && !st.watched.has(p.targetId) && st.watched.size >= 4) return re({ ok: false, code: 'too_many_watched_tabs', targetId: p.targetId, watching: false, activeCount: st.watched.size, limit: 4 });
      if (p.watch) st.watched.add(p.targetId); else st.watched.delete(p.targetId);
      return re({ ok: true, targetId: p.targetId, watching: !!p.watch, activeCount: st.watched.size });
    }
    // the idle freeze's flip check: the flip tab is born where Chrome reports it (its own address), read back by getTargetInfo
    if (m.method === 'Target.createTarget') { const id = 'FLIP' + String(st.urls.size + 1); st.urls.set(id, String(p.url || '')); return re({ targetId: id }); }
    if (m.method === 'Target.getTargetInfo') return re({ targetInfo: { targetId: p.targetId, type: 'page', url: st.urls.has(p.targetId) ? st.urls.get(p.targetId) : '' } });
    return re({});
  }));
  return { url: `ws://127.0.0.1:${wss.address().port}/devtools/browser/stand-in`, st, close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }) };
};
const dialogsLeg = async (Dmod) => {
  const SI = await standIn(); const PID = 'bp-0000d0e2';
  const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 1, tabsOf: () => [] });
  try {
    await D.arm(PID, { budgetMs: 3000 });
    const opened = await until(() => !!D.paintFacts(PID), 3000);
    const on = [];
    for (const t of [T1, T2, T3, T4, T5]) on.push(await D.setTabWatch(PID, t, true));
    const fz = opened ? await D.freezePaint(PID) : null;
    const frozenAtFreeze = [...SI.st.frozen];
    const off = await D.setTabWatch(PID, T1, false);
    const idle = await D.freezePaint('bp-0000ffff');
    return { opened, on: on.map((a) => (a.ok ? `ok ${a.activeCount}` : a.code)), cmds: SI.st.cmds, fz, frozenAtFreeze, off, idle };
  } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
};
{
  const DD = require('../src/server/browser-dialogs.js');
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const FZ_ANCH = "    const tabs = [...w.targets.entries()].filter(([tid, e]) => e.sid && !(w.tabWatched && w.tabWatched.has(String(tid).toUpperCase()))).map(([, e]) => e);\n";
  if (!dsrc.includes(FZ_ANCH)) ok(false, 'the anchor of the control «the freeze without the watched-tab rule» is not in the source (src/server/browser-dialogs.js)');
  const Dc = dsrc.includes(FZ_ANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, FZ_ANCH, "    const tabs = [...w.targets.values()].filter((e) => e.sid);\n"), 'tw-freeze-all') : null;
  const [d, dc] = await Promise.all([dialogsLeg(DD), Dc ? dialogsLeg(Dc) : Promise.resolve(null)]);
  const watched4 = [T1, T2, T3, T4];
  ok(d.opened && J(d.on) === J(['ok 1', 'ok 2', 'ok 3', 'ok 4', 'too_many_watched_tabs']) && d.cmds.every((c) => c.session === null) && d.off.ok && d.off.watching === false && d.off.activeCount === 3,
    'the command rides the browser\'s OWN connection (no target session), {targetId, watch}: four watched, the fifth refused by the kernel\'s own code, OFF answered', d.on);
  ok(!!d.fz && d.fz.ok && watched4.every((t) => !d.frozenAtFreeze.includes(t)) && d.frozenAtFreeze.includes(T0) && d.frozenAtFreeze.includes(T5),
    'the kernel\'s law, ours: the idle freeze never puts a WATCHED tab frozen — the front and the unwatched tab are frozen as today', { frozen: d.frozenAtFreeze.map((x) => x.slice(0, 4)) });
  if (dc) ok(!!dc.fz && dc.fz.ok && watched4.some((t) => dc.frozenAtFreeze.includes(t)), 'CONTROL (the freeze without that rule): a watched tab is put frozen under its viewer — RED', { frozen: dc.frozenAtFreeze.map((x) => x.slice(0, 4)) });
  ok(d.idle && d.idle.ok === false, 'a browser with no page watch is no browser to freeze (its answer as today)', d.idle);
}

// ═══ ⑤ the bridge's watching record ═══
console.log('— ⑤ the bridge: `live` / `capped` ride the watching record on that road; stock reads today\'s record');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const KA = 'bk-0000d0a1';
  const bridgeLeg = async (tabWatch) => {
    const fk = { setFor: () => ({ attachments: [{ profileId: 'bp-0000d0f1', alias: 'work', isDefault: true, label: 'Work' }], handles: ['work'], defaultId: 'bp-0000d0f1', children: [] }), list: () => ({ profiles: [{ id: 'bp-0000d0f1', label: 'Work' }] }),
      streamPortFor: async () => ({ ok: true, port: upPort }), inputStateFor: () => ({ input: 'agent' }), noteViewers: () => {},
      tabOwnersFor: async () => ({ ok: true, owners: { [T(1)]: 'agent', [T(2)]: 'agent' }, mediated: false, adoptable: false }),
      watchTabFor: async (target, id, hooks) => ({ ok: true, close: () => {}, ...(tabWatch ? { tabWatch } : {}) }) };
    const up = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r)); const upPort = up.address().port;
    up.on('connection', (ws) => { ws.send(JSON.stringify({ type: 'status', connected: true })); ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: true }, { tabId: 't2', targetId: T(2), title: 'B', url: 'https://b.example/', active: false }] })); });
    const br = require('../src/server/browser-stream.js').create({ keeper: fk, activeSessions: new Map([['sess-w', { _browserKey: KA, webuiId: 'sess-w' }]]), requestAuthed: () => true, log: quiet });
    const hs = http.createServer(); servers.push(hs); hs.on('upgrade', (req, sock, head) => br.handleUpgrade(req, sock, head)); await new Promise((r) => hs.listen(0, '127.0.0.1', r));
    const got = []; const ws = new WebSocket(`ws://127.0.0.1:${hs.address().port}/api/browser/stream?session=sess-w`);
    ws.on('message', (dd) => { try { const j = JSON.parse(String(dd)); if (j.type === 'watching' || j.type === 'tab-owners') got.push(j); } catch { /* */ } });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    const owners = await until(() => got.some((x) => x.type === 'tab-owners'), 3000); // the fact the watch's judge reads: the tab is one of this browser's
    ws.send(JSON.stringify({ type: 'watch-tab', targetId: T(2) }));
    const settled = await until(() => got.filter((x) => x.type === 'watching' && !x.pending).length >= (tabWatch ? 1 : 0) && got.some((x) => x.type === 'watching'), 3000);
    await sleep(50);
    ws.close(); br.shutdown?.(); up.close();
    return { owners, settled, watching: got.filter((x) => x.type === 'watching') };
  };
  const [live, capped, stock] = await Promise.all([bridgeLeg({ live: true }), bridgeLeg({ live: false, code: 'too_many_watched_tabs', limit: 4 }), bridgeLeg(null)]);
  if (!live.owners || !capped.owners || !stock.owners) ok(false, 'the bridge leg: the tab owners never reached the viewer within 3 s — the leg cannot judge', { live: live.owners, capped: capped.owners, stock: stock.owners });
  else {
    ok(live.watching.some((x) => x.targetId === T(2) && x.live === true) && !J(live.watching).includes('example'), 'the watching record says `live` on the kernel\'s road (a target id and a word, no address)', live.watching);
    ok(capped.watching.some((x) => x.targetId === T(2) && x.capped === 4) && !capped.watching.some((x) => x.live === true), 'the kernel\'s cap rides the record as its limit (`capped: 4`), never `live`', capped.watching);
    ok(stock.watching.length >= 1 && stock.watching.every((x) => !('live' in x) && !('capped' in x)), 'STOCK: the watching records carry neither word — today\'s records', stock.watching);
  }
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: '⑥ ' })) ok(r.pass, r.name, r.detail);
console.log(`\n${fail ? '✗' : '✓'} test-browser-tab-watch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
