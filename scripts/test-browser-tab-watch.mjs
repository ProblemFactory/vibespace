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
//      each viewer told «live» on ITS OWN confirmed ON (the command is idempotent), OFF only after both; the kernel's cap ⇒ the still
//      (today's road) + its code and count; a stock browser is never asked, its answer handed back AS IT IS. REDS: ON after the
//      screencast; OFF at the first of two; stock asked. r4779 (law 5: a watcher's leaving releases only what THAT watcher took): the
//      page watch reopens between two watchers, the older leaves ⇒ the newer still draws, and the older asks again and is told;
//      a viewer arriving while the page watch is down is told by its own answer; an unconfirmed ON in flight beside a confirmed
//      one sends no OFF. REDS: the reset as at 73d130109; no ask again; a second viewer sharing a count; the OFF whoever holds.
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
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(c, n): the name is a ${typeof n}, not a string — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
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
  ok(pr.on.ok && pr.on.fact.tabWatch === true && [pr.off, pr.absent, pr.nul, pr.str].every((x) => x.ok && !('tabWatch' in x.fact)),
    'the probe MEASURES it: true ONLY when true — absent, false, null or another shape read false, never a refusal (the owner\'s rule for the kernel\'s top-level facts); r4745: the flag rides the fact only when true, so every other engine\'s fact is unchanged', { on: pr.on.fact && pr.on.fact.tabWatch, str: pr.str.ok && pr.str.fact });
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
  ok(w.live === `${today.named} ${EFFECT}` && w.liveAnon === `${today.anon} ${EFFECT}` && w.livePoll === `${today.namedPoll} ${EFFECT}` && w.cap === `${today.namedPoll} This browser shows at most 4 tabs live while they are not in front — this one stays a still.`
    && !/Docs.*Docs/.test(w.cap) && !/\b[0-9A-F]{32}\b/.test(J(w)),
    'r4691 / r4745 M1: the watch line tells the ONE effect wherever the kernel holds the watch — moving AND in the half-second mode (a page that does not repaint keeps its timers at full rate); the kernel\'s cap by its count (never which tabs, never whose)', w);
  const M1_ANCH = "  if (live === true) return `${base} ${t('";
  const wsrc = fs.readFileSync(path.join(REPO, 'src/browser-windows.js'), 'utf8');
  if (!wsrc.includes(M1_ANCH)) ok(false, 'the anchor of the control «the effect only while moving» is not in the source (src/browser-windows.js)');
  else { const Wc = M.load('src/browser-windows.js', anchored(wsrc, M1_ANCH, "  if (live === true && !polling) return `${base} ${t('"), 'tw-effect-moving-only');
    ok(Wc.watchLineWords({ watched: 'Docs', current: 'Cart', mode: 'polling', live: true }) === today.namedPoll, 'CONTROL (the effect only while the picture moves, as at c92f2c341): the half-second mode drops the sentence while the lease is on — RED'); }
  // r4745: the client wiring of law (7) — the page keeps live / capped from the record and hands them to the words (a pin: removing
  // either line left every suite green)
  const lsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(lsrc.includes("live: m.live === true, capped: Number.isInteger(m.capped) ? m.capped : null }") && lsrc.includes("mode: st.watch.mode, live: st.watch.live === true, capped: st.watch.capped }, t);"),
    'PIN: the live view keeps the record\'s live / capped on its watch and hands both to the watch line\'s words');
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
const keeperLeg = async (Kmod, tag, { tabWatch = true, cap = false, unconfirmed = false, down = false, lines = null } = {}) => {
  const log = [];
  const shots = new Map();
  const watchTarget = async (url, id, hooks) => { log.push(`screencast ${id.slice(0, 4)}`); const r = { ok: true, close: () => log.push(`screencast-closed ${id.slice(0, 4)}`) }; if (!shots.has(id)) shots.set(id, r); return r; }; // the FIRST watch's own screencast (the stock leg's identity)
  const kw = Kmod.create({ dataDir: path.join(ROOT, 'k-' + tag), homeDir: path.join(ROOT, 'h-' + tag), env: () => ({}), serverSetting: () => undefined, liveKeys: () => new Set(), log: lines ? { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error() { }, info() { } } : quiet, install: false, watchTarget });
  kw.list(); // the registry loaded before the leg writes its record
  const PID = 'bp-0000d0e1';
  kw._reg().browsers[PID] = { profileId: PID, state: 'ready', cdpUrl: 'ws://127.0.0.1:9/devtools/browser/stand-in', browserChoice: tabWatch ? { kind: 'plugin', id: 'acme.engine', tabWatch: true } : { kind: 'default' } };
  let active = 0, downNow = false;
  kw.setPaintWatch({ paintFacts: () => null, freezePaint: async () => ({ ok: false }), thawPaint: async () => ({ ok: true }),
    setTabWatch: async (pid, id, on) => { log.push(`${on ? 'ON' : 'OFF'} ${id.slice(0, 4)}`); if (on && downNow) return { ok: false, code: 'tab_watch_unavailable' }; if (on && cap) return { ok: false, code: 'too_many_watched_tabs', activeCount: 4, limit: 4 }; if (on && unconfirmed) return { ok: false, code: 'tab_watch_unanswered' }; active += on ? 1 : -1; return { ok: true, watching: !!on, activeCount: active }; } });
  const target = { ok: true, kind: 'attachment', profileId: PID };
  const one = await kw.watchTabFor(target, T(1), {});
  if (down) downNow = true; // r4779: the page watch went down (not open again yet) — the kernel ended its leases; the page watch answers tab_watch_unavailable
  const two = await kw.watchTabFor(target, T(1), {});
  const logAfterTwo = log.slice();
  // r4779: the keeper sends the OFF AT ONCE at a close (so it never passes a later ON on the socket); each capture still waits for
  // anything a close may queue (setImmediate runs after the microtask queue drains — the fact, never a span), so a wrong OFF is SEEN
  const flush = () => new Promise((r) => setImmediate(r));
  one.close(); await flush(); const afterFirst = log.slice();
  two.close(); await flush(); const afterBoth = log.slice();
  try { kw.shutdown?.(); } catch { /* */ }
  return { log: afterBoth, logAfterTwo, afterFirst, one: { tabWatch: one.tabWatch, same: one === shots.get(T(1)) }, two: { tabWatch: two.tabWatch } };
};
{
  const ON_ANCH = "    if (h) await tabWatchOn(h);\n";
  const ORDER_TO = "    const kwLater = () => (h ? tabWatchOn(h) : null); // (the control: the screencast first, as a road without the order)\n";
  const AFTER_ANCH = "    if (!h) return r;\n";
  const COUNT_ANCH = (ksrc3.split('\n').find((l) => l.startsWith('    if (n > 0) { tabWatchCounts.set(k, n);')) || '\u0000') + '\n';
  const STOCK_ANCH = "    if (!rec || !rec.browserChoice || rec.browserChoice.tabWatch !== true || !paintWatch || typeof paintWatch.setTabWatch !== 'function') return null;\n";
  const UNC_ANCH = "    tabWatchRelease(h, code === 'tab_watch_unanswered' || code === 'tab_watch_failed');\n";
  const ASK_ANCH = "    tabWatchCounts.set(k, (tabWatchCounts.get(k) || 0) + 1); h.counted = true;\n";
  const HOLDS_ANCH = "    for (const h of tabWatchHolds) if (h.pid === pid) { h.counted = false; h.ask++; h.kw = null; Promise.resolve().then(() => tabWatchAgain(h)).catch(() => { /* the hold's own */ }); }\n";
  for (const a of [ON_ANCH, AFTER_ANCH, COUNT_ANCH, STOCK_ANCH, UNC_ANCH, ASK_ANCH, HOLDS_ANCH]) if (!ksrc3.includes(a)) ok(false, `the anchor of a control is not in the source (src/server/browser-keeper.js): ${a.trim().slice(0, 80)}`);
  const Korder = M.load('src/server/browser-keeper.js', anchored(anchored(ksrc3, ON_ANCH, ORDER_TO), AFTER_ANCH, "    await kwLater();\n    if (!h) return r;\n"), 'tw-order');
  const Kcount = M.load('src/server/browser-keeper.js', anchored(ksrc3, COUNT_ANCH, "    // (the control: no count)\n"), 'tw-count');
  const Kstock = M.load('src/server/browser-keeper.js', anchored(ksrc3, STOCK_ANCH, "    if (!rec || !paintWatch || typeof paintWatch.setTabWatch !== 'function') return null; // (the control: asked of every browser)\n"), 'tw-stock');
  const Kunc = M.load('src/server/browser-keeper.js', anchored(ksrc3, UNC_ANCH, "    tabWatchRelease(h, false); // (the control: no OFF after an unconfirmed ON, as at c92f2c341)\n"), 'tw-unconfirmed');
  const Kshare = M.load('src/server/browser-keeper.js', anchored(ksrc3, ASK_ANCH, "    if ((tabWatchCounts.get(k) || 0) > 0) { tabWatchCounts.set(k, tabWatchCounts.get(k) + 1); h.counted = true; h.kw = { on: true }; return true; } // (the control: a second viewer shares the count, as at 73d130109)\n" + ASK_ANCH), 'tw-share');
  // r5006 (3): a page watch that is DOWN answers each ask tab_watch_unavailable — the page watch's own state, not the kernel's: no journal line per hold
  const QUIET_ANCH = "    if (code !== 'tab_watch_unavailable') log.log?.(";
  if (!ksrc3.includes(QUIET_ANCH)) ok(false, 'the anchor of the control «a line per hold while the page watch is down» is not in the source (src/server/browser-keeper.js)');
  const Kloud = ksrc3.includes(QUIET_ANCH) ? M.load('src/server/browser-keeper.js', anchored(ksrc3, QUIET_ANCH, "    log.log?.("), 'tw-down-loud') : null;
  const dnLines = [], dnLinesC = [];
  const [now, cap, stock, cOrder, cCount, cStock, unc, cUnc, dn, cDn, cDnLog] = await Promise.all([keeperLeg(K, 'now'), keeperLeg(K, 'cap', { cap: true }), keeperLeg(K, 'stock', { tabWatch: false }),
    keeperLeg(Korder, 'c-order'), keeperLeg(Kcount, 'c-count'), keeperLeg(Kstock, 'c-stock', { tabWatch: false }),
    keeperLeg(K, 'unconfirmed', { unconfirmed: true }), keeperLeg(Kunc, 'c-unconfirmed', { unconfirmed: true }), keeperLeg(K, 'down', { down: true, lines: dnLines }), keeperLeg(Kshare, 'c-down', { down: true }), Kloud ? keeperLeg(Kloud, 'c-down-log', { down: true, lines: dnLinesC }) : Promise.resolve(null)]);
  const A1 = T(1).slice(0, 4);
  ok(J(now.logAfterTwo) === J([`ON ${A1}`, `screencast ${A1}`, `ON ${A1}`, `screencast ${A1}`]) && now.one.tabWatch && now.one.tabWatch.live === true && now.two.tabWatch && now.two.tabWatch.live === true,
    'LAW: the kernel\'s watch ON BEFORE the screencast starts (a never-shown tab gets its bounds then) — and r4779: each viewer of the tab is told «live» on ITS OWN confirmed ON (the command is idempotent, the kernel\'s word r4691)', now.logAfterTwo);
  ok(!now.afterFirst.includes(`OFF ${A1}`) && now.log.filter((x) => x === `OFF ${A1}`).length === 1 && now.log.indexOf(`OFF ${A1}`) > now.log.lastIndexOf(`screencast-closed ${A1}`),
    'LAW (c): two viewers of one tab hold it — OFF only after BOTH watches ended, once, after its screencast closed', now.log);
  ok(J(cap.log.filter((x) => /^ON|^OFF/.test(x))) === J([`ON ${A1}`, `ON ${A1}`]) && cap.log.filter((x) => x.startsWith('screencast ')).length === 2 && cap.one.tabWatch && cap.one.tabWatch.live === false && cap.one.tabWatch.code === 'too_many_watched_tabs' && cap.one.tabWatch.limit === 4,
    'LAW (d): the kernel\'s cap refused by its own code — the watch goes on as today\'s still (its screencast, then the poll), said by code and limit; nothing to switch OFF', cap);
  ok(stock.log.every((x) => !/^ON|^OFF/.test(x)) && stock.one.same === true && stock.one.tabWatch === undefined,
    'LAW (a): a STOCK browser (no tabWatch at its launch) is never asked — its watch is handed back AS IT IS, today\'s road byte for byte', stock);
  ok(cOrder.logAfterTwo.indexOf(`screencast ${A1}`) < cOrder.logAfterTwo.indexOf(`ON ${A1}`), 'CONTROL (the screencast first): the kernel\'s watch lands after the screencast started — RED', cOrder.logAfterTwo);
  ok(cCount.afterFirst.includes(`OFF ${A1}`), 'CONTROL (no count): the first viewer\'s leave switches the tab OFF under the second viewer — RED', cCount.afterFirst);
  ok(cStock.log.some((x) => x.startsWith('ON ')), 'CONTROL (asked of every browser): a stock browser is sent the kernel\'s command — RED', cStock.log);
  const onsU = unc.log.filter((x) => x === `ON ${A1}`).length, offsU = unc.log.filter((x) => x === `OFF ${A1}`).length;
  ok(onsU === 2 && offsU === 2 && unc.log.indexOf(`OFF ${A1}`) > unc.log.indexOf(`ON ${A1}`) && unc.log.indexOf(`OFF ${A1}`) < unc.log.indexOf(`screencast-closed ${A1}`) && unc.one.tabWatch && unc.one.tabWatch.live === false && unc.one.tabWatch.code === 'tab_watch_unanswered',
    'r4745 M2 (law 5): an ON the kernel did NOT confirm (no answer in its bound) may still have been taken — ONE OFF follows it at once (idempotent), never left for a close that would not send it; the watch is today\'s still', unc.log);
  ok(cUnc.log.filter((x) => x === `OFF ${A1}`).length === 0, 'CONTROL (no OFF after an unconfirmed ON, as at c92f2c341): the lease the kernel may hold is never switched off — RED', cUnc.log);
  ok(dn.one.tabWatch && dn.one.tabWatch.live === true && dn.two.tabWatch && dn.two.tabWatch.live === false && dn.two.tabWatch.code === 'tab_watch_unavailable' && dn.log.filter((x) => /^OFF/.test(x)).length === 1,
    'r4779: a viewer arriving while the page watch is DOWN (the kernel ended the old socket\'s leases) is told by ITS OWN answer — a still, never «live» over a count the dead socket held', { two: dn.two.tabWatch, log: dn.log });
  ok(cDn.two.tabWatch && cDn.two.tabWatch.live === true, 'CONTROL (a second viewer shares the count, as at 73d130109): told «live» while no socket holds a lease — RED', cDn.two.tabWatch);
  ok(!dnLines.some((l) => l.includes('tab_watch_unavailable')), 'r5006 (3): an ask while the page watch is DOWN writes no journal line (the page watch\'s own state, not the kernel\'s refusal)', dnLines);
  if (cDnLog) ok(dnLinesC.some((l) => l.includes('tab_watch_unavailable')), 'CONTROL (a line per hold while the page watch is down, as at f0c44841b): the journal names tab_watch_unavailable — RED', dnLinesC);
  // r4779, THE MUST (law 5's «first leaver» clause): two watchers, the page watch reopens BETWEEN them, the older leaves — the newer
  // still draws. The stand-in kernel keeps leases per socket as the kernel says (its socket's end ends them); the fact judged is the
  // kernel's own lease set after the older left. And the older is TOLD: it asks again on the new socket (never a stale «live»)
  const reopenLeg = async (Kmod, tag) => {
    const log = [], kernel = new Set(), told = []; let ons = 0, releaseThird = null;
    const watchTarget = async (url, id) => ({ ok: true, close: () => log.push(`screencast-closed ${id.slice(0, 4)}`) });
    const kw = Kmod.create({ dataDir: path.join(ROOT, 'k-' + tag), homeDir: path.join(ROOT, 'h-' + tag), env: () => ({}), serverSetting: () => undefined, liveKeys: () => new Set(), log: quiet, install: false, watchTarget });
    kw.list();
    const PID = 'bp-0000d0e5';
    kw._reg().browsers[PID] = { profileId: PID, state: 'ready', cdpUrl: 'ws://127.0.0.1:9/devtools/browser/stand-in', browserChoice: { kind: 'plugin', id: 'acme.engine', tabWatch: true } };
    kw.setPaintWatch({ paintFacts: () => null, freezePaint: async () => ({ ok: false }), thawPaint: async () => ({ ok: true }),
      setTabWatch: (pid, id, on) => { log.push(`${on ? 'ON' : 'OFF'} ${id.slice(0, 4)}`); if (on) kernel.add(id); else kernel.delete(id);
        const ans = { ok: true, watching: !!on, activeCount: kernel.size };
        if (on && ++ons === 3) return new Promise((r) => { releaseThird = () => r(ans); }); // r4808: the older's ask AGAIN — its reply held by the leg (a placed hold, never a clock)
        return Promise.resolve(ans); } });
    const target = { ok: true, kind: 'attachment', profileId: PID };
    const flush = () => new Promise((r) => setImmediate(r));
    const older = await kw.watchTabFor(target, T(1), { onTabWatch: (tw) => told.push(tw) });
    kernel.clear(); log.push('REOPEN'); kw.tabWatchReset(PID); // the page watch's socket ended (the kernel ended its leases) and a new one opened: the dialogs tell the keeper (pinned in ④)
    const newer = await kw.watchTabFor(target, T(1), {});
    await flush();
    const toldWhileAsking = told.slice(); // what the older watch was told BEFORE its new ask's reply
    if (releaseThird) releaseThird();
    await flush();
    older.close(); await flush();
    const drawsAfterOlder = kernel.has(T(1));
    newer.close(); await flush();
    try { kw.shutdown?.(); } catch { /* */ }
    return { log, told, toldWhileAsking, drawsAfterOlder, leftOn: kernel.has(T(1)), newer: newer.tabWatch };
  };
  // Kold reproduces 73d130109's BEHAVIOUR (the reset drops the counts and leaves every hold counted), not its source byte for byte
  const Kold = M.load('src/server/browser-keeper.js', anchored(ksrc3, HOLDS_ANCH, "    // (the control: the reset drops the counts only, as at 73d130109)\n"), 'tw-reset-73d');
  const STILLS_ANCH = ksrc3.split('\n').find((l) => l.startsWith('    tabWatchTell(h); // r4808')) || '\u0000';
  if (!ksrc3.includes(STILLS_ANCH + '\n')) ok(false, 'the anchor of the control «told only the new ask\'s answer» is not in the source (src/server/browser-keeper.js)');
  const Kstills = ksrc3.includes(STILLS_ANCH + '\n') ? M.load('src/server/browser-keeper.js', anchored(ksrc3, STILLS_ANCH + '\n', "    // (the control: told only the new ask's answer, as at bc7dd84d8)\n"), 'tw-no-stills') : null;
  const Kmute = M.load('src/server/browser-keeper.js', anchored(ksrc3, HOLDS_ANCH, "    for (const h of tabWatchHolds) if (h.pid === pid) { h.counted = false; h.ask++; h.kw = null; } // (the control: counted out, never asks again)\n"), 'tw-no-again');
  const [ro, cRo, cMute, cSt] = await Promise.all([reopenLeg(K, 'reopen'), reopenLeg(Kold, 'c-reopen'), reopenLeg(Kmute, 'c-again'), Kstills ? reopenLeg(Kstills, 'c-stills') : Promise.resolve(null)]);
  ok(ro.newer && ro.newer.live === true && ro.drawsAfterOlder === true && ro.leftOn === false && ro.log.filter((x) => x === `OFF ${A1}`).length === 1,
    'r4779 THE MUST (law 5): the page watch reopens between two watchers of one tab and the OLDER leaves — the newer still draws (the kernel holds its lease); the last leaver\'s ONE OFF ends it', ro.log);
  ok(cRo.drawsAfterOlder === false, 'CONTROL (the reset drops the counts only, as at 73d130109): the older watcher\'s leaving switches the newer one\'s lease OFF — RED', cRo.log);
  ok(J(ro.told) === J([{ live: false, code: 'tab_watch_lapsed' }, { live: true }]) && ro.log.indexOf(`ON ${A1}`, ro.log.indexOf('REOPEN') + 1) > -1 && ro.log.filter((x) => x === `ON ${A1}`).length === 3,
    'r4779 (the should beside it): the older watcher, whose lease ended with the old socket, asks AGAIN on the new one and is TOLD its answer (never a stale «live» under the half-second words)', { told: ro.told, log: ro.log });
  ok(J(ro.toldWhileAsking) === J([{ live: false, code: 'tab_watch_lapsed' }]), 'r4808: at the reopen the older watcher is told «stills» AT ONCE — before its new ask\'s reply (held by the leg)', ro.toldWhileAsking);
  if (cSt) ok(cSt.toldWhileAsking.length === 0, 'CONTROL (told only the new ask\'s answer, as at bc7dd84d8): while the new ask waits, the record keeps «live» over stills — RED', cSt.toldWhileAsking);
  ok(cMute.told.length === 0, 'CONTROL (counted out, never asks again): the older watcher is told nothing — its record keeps a «live» no socket holds — RED', cMute);
  // r4779 (law 3 — red at will by PLACED holds, never a clock): two ONs of one tab IN FLIGHT, each answer held by the leg.
  // (u) the race should: the second is confirmed, then the first answers «unanswered» (past its bound) — no OFF while the confirmed
  //     hold counts the tab. (l) r4745's should, now cured: the first is confirmed and its viewer LEAVES before the second's answer —
  //     no OFF either (a hold counts from its ASK, so an OFF never passes an ON in flight). (r, r4808, both readers' should) the
  //     first confirmed, the second asks, the first LEAVES, then the second is REFUSED by a code that holds nothing (target_crashed):
  //     the last share's leaving sends the OFF — the first's confirmed lease is on. The fact: the kernel's own lease set
  const raceLeg = async (Kmod, tag, mode) => {
    const log = [], kernel = new Set(), held = [];
    const watchTarget = async (url, id) => ({ ok: true, close: () => log.push(`screencast-closed ${id.slice(0, 4)}`) });
    const kw = Kmod.create({ dataDir: path.join(ROOT, 'k-' + tag), homeDir: path.join(ROOT, 'h-' + tag), env: () => ({}), serverSetting: () => undefined, liveKeys: () => new Set(), log: quiet, install: false, watchTarget });
    kw.list();
    const PID = 'bp-0000d0e6';
    kw._reg().browsers[PID] = { profileId: PID, state: 'ready', cdpUrl: 'ws://127.0.0.1:9/devtools/browser/stand-in', browserChoice: { kind: 'plugin', id: 'acme.engine', tabWatch: true } };
    kw.setPaintWatch({ paintFacts: () => null, freezePaint: async () => ({ ok: false }), thawPaint: async () => ({ ok: true }),
      setTabWatch: (pid, id, on) => { log.push(`${on ? 'ON' : 'OFF'} ${id.slice(0, 4)}`); if (on) kernel.add(id); else kernel.delete(id);
        if (on) return new Promise((r) => held.push((ans) => r(ans || { ok: true, targetId: id, watching: true, activeCount: kernel.size })));
        return Promise.resolve({ ok: true, targetId: id, watching: false, activeCount: kernel.size }); } });
    const target = { ok: true, kind: 'attachment', profileId: PID };
    const flush = () => new Promise((r) => setImmediate(r));
    let a, b;
    if (mode === 'r') {
      const pa = kw.watchTabFor(target, T(1), {});
      if (held.length !== 1) return { log, unmade: `the scene was not made: ${held.length} ONs in flight` };
      held[0](); a = await pa;
      const pb = kw.watchTabFor(target, T(1), {});
      if (held.length !== 2) return { log, unmade: `the scene was not made: ${held.length} ONs in flight` };
      a.close(); await flush(); log.push('A-LEFT');
      held[1]({ ok: false, code: 'target_crashed', targetId: T(1), watching: false, activeCount: kernel.size, limit: 4 }); b = await pb;
      await flush();
      const leftOn = kernel.has(T(1));
      b.close(); await flush();
      try { kw.shutdown?.(); } catch { /* */ }
      return { log, b: b.tabWatch, leftOn };
    }
    const pa = kw.watchTabFor(target, T(1), {}), pb = kw.watchTabFor(target, T(1), {});
    if (held.length !== 2) return { log, unmade: `the scene was not made: ${held.length} ONs in flight` };
    if (mode === 'u') { held[1](); b = await pb; held[0]({ ok: false, code: 'tab_watch_unanswered' }); a = await pa; }
    else if (mode === 'm') { held[0]({ ok: false, code: 'tab_watch_unanswered' }); a = await pa; log.push('A-UNANSWERED'); held[1]({ ok: false, code: 'target_crashed', targetId: T(1), watching: false, activeCount: kernel.size, limit: 4 }); b = await pb; }
    else { held[0](); a = await pa; a.close(); await flush(); log.push('A-LEFT'); held[1](); b = await pb; }
    await flush();
    const drawsForB = kernel.has(T(1));
    if (mode === 'u') a.close();
    b.close(); await flush();
    try { kw.shutdown?.(); } catch { /* */ }
    return { log, drawsForB, a: a.tabWatch, b: b.tabWatch, leftOn: kernel.has(T(1)) };
  };
  const CONF_ANCH = "    if (a && a.ok && a.watching === true) { tabWatchLeased.add(k); h.kw = { on: true }; return true; }\n";
  if (!ksrc3.includes(CONF_ANCH)) ok(false, 'the anchor of the control «counted only once confirmed» is not in the source (src/server/browser-keeper.js)');
  const Krace = M.load('src/server/browser-keeper.js', anchored(ksrc3, UNC_ANCH, "    tabWatchRelease(h, false); if (code === 'tab_watch_unanswered' || code === 'tab_watch_failed') paintWatch.setTabWatch(h.pid, h.id, false); // (the control: the OFF whoever else holds the tab, as at 73d130109)\n"), 'tw-race');
  const Kconf = ksrc3.includes(CONF_ANCH) ? M.load('src/server/browser-keeper.js', anchored(anchored(ksrc3, ASK_ANCH, "    h.counted = true; // (the control: counted only once confirmed, as at 73d130109)\n"), CONF_ANCH, "    if (a && a.ok && a.watching === true) { tabWatchCounts.set(k, (tabWatchCounts.get(k) || 0) + 1); tabWatchLeased.add(k); h.kw = { on: true }; return true; }\n"), 'tw-confirmed-count') : null;
  const LEASED_ANCH = ksrc3.split('\n').find((l) => l.startsWith('    if (!mayHold && !tabWatchLeased.has(k)) return;')) || '\u0000';
  if (!ksrc3.includes(LEASED_ANCH + '\n')) ok(false, 'the anchor of the control «a refusal sends no OFF» is not in the source (src/server/browser-keeper.js)');
  const Kleased = ksrc3.includes(LEASED_ANCH + '\n') ? M.load('src/server/browser-keeper.js', anchored(ksrc3, LEASED_ANCH + '\n', "    if (!mayHold) return; // (the control: a refusal sends no OFF, as at bc7dd84d8)\n"), 'tw-refused-no-off') : null;
  // r5006 (2), the round's must: a share that MAY hold a lease (an ON with no reply in its bound) leaves while another share still
  // counts the tab, and that other is then REFUSED — the tab is marked at the first leaving, so the last one sends the OFF
  const Kmark = ksrc3.includes(COUNT_ANCH) ? M.load('src/server/browser-keeper.js', anchored(ksrc3, COUNT_ANCH, "    if (n > 0) { tabWatchCounts.set(k, n); return; } // (the control: no mark at a may-hold leaving, as at f0c44841b)\n"), 'tw-no-mark') : null;
  const [ru, cRu, rl, cRl, rr, cRr, rm, cRm] = await Promise.all([raceLeg(K, 'race-u', 'u'), raceLeg(Krace, 'c-race-u', 'u'), raceLeg(K, 'race-l', 'l'), Kconf ? raceLeg(Kconf, 'c-race-l', 'l') : Promise.resolve(null),
    raceLeg(K, 'race-r', 'r'), Kleased ? raceLeg(Kleased, 'c-race-r', 'r') : Promise.resolve(null), raceLeg(K, 'race-m', 'm'), Kmark ? raceLeg(Kmark, 'c-race-m', 'm') : Promise.resolve(null)]);
  for (const x of [ru, cRu, rl, cRl, rr, cRr, rm, cRm].filter(Boolean)) if (x.unmade) ok(false, `the race leg: ${x.unmade} — the leg cannot judge`, x.log);
  ok(!ru.unmade && ru.b && ru.b.live === true && ru.a && ru.a.live === false && ru.a.code === 'tab_watch_unanswered' && ru.drawsForB === true && ru.leftOn === false,
    'r4779 (u): an unconfirmed ON in flight beside a confirmed one sends NO OFF while the confirmed hold counts the tab — the confirmed viewer still draws; the last leaving ends the lease', ru.log);
  ok(!cRu.unmade && cRu.drawsForB === false, 'CONTROL (the OFF whoever else holds the tab, as at 73d130109): the unconfirmed ON\'s OFF ends the confirmed viewer\'s lease — RED', cRu.log);
  ok(!rl.unmade && rl.a && rl.a.live === true && rl.b && rl.b.live === true && rl.drawsForB === true && rl.log.indexOf(`OFF ${A1}`) > rl.log.indexOf('A-LEFT') && rl.leftOn === false,
    'r4779 (l, r4745\'s should): the first ON confirmed and its viewer gone BEFORE the second\'s answer — no OFF passes the ON in flight (a hold counts from its ask); the second viewer draws', rl.log);
  if (cRl) ok(!cRl.unmade && cRl.drawsForB === false && cRl.b && cRl.b.live === true, 'CONTROL (counted only once confirmed, as at 73d130109): the first leaver\'s OFF passes the second ON in flight — told «live» over no lease — RED', cRl.log);
  ok(!rr.unmade && rr.b && rr.b.live === false && rr.b.code === 'target_crashed' && rr.leftOn === false && rr.log.indexOf(`OFF ${A1}`) > rr.log.indexOf('A-LEFT'),
    'r4808 (r): the first viewer\'s ON confirmed, the second asks, the first leaves, the second is REFUSED (a code that holds nothing) — the last share\'s leaving sends the OFF all the same: no lease stays on with nobody watching', rr.log);
  if (cRr) ok(!cRr.unmade && cRr.leftOn === true, 'CONTROL (a refusal sends no OFF, as at bc7dd84d8): the first viewer\'s lease stays on with nobody watching until the socket ends — RED', cRr.log);
  ok(!rm.unmade && rm.a && rm.a.code === 'tab_watch_unanswered' && rm.b && rm.b.code === 'target_crashed' && rm.leftOn === false && rm.log.indexOf(`OFF ${A1}`) > rm.log.indexOf('A-UNANSWERED'),
    'r5006 (2), the round\'s must: an ON with no reply (it MAY hold a lease) leaves while the other share counts the tab, then the other is REFUSED — the tab was marked at the first leaving, so the last one sends the OFF: no lease stays on with nobody watching', rm.log);
  if (cRm) ok(!cRm.unmade && cRm.leftOn === true, 'CONTROL (no mark at a may-hold leaving, as at f0c44841b): the possible lease stays on with nobody watching until the socket ends — RED', cRm.log);
}

// ═══ ③b the launch's rule, by behaviour: the keeper's own launchEngineOf over a stand-in engine registry ═══
console.log('— ③b the launch: tabWatch recorded only when the manifest STATES it AND the probe MEASURES it');
{
  const launchLeg = async (states, measured, tag) => {
    const fact = { id: 'acme.engine', installed: true, executable: true, binaryPath: '/opt/acme/kernel', version: '1.0.0', protocol: ENG.PROTOCOL, kinds: ['chromium'], features: [], egress: null, label: 'Acme', ...(measured ? { tabWatch: true } : {}) };
    const engines = { rows: () => [{ id: 'acme.engine', label: 'Acme' }], probe: async () => ({ ok: true, fact }), launchOptions: async () => ({ ok: true, launch: { executablePath: '/opt/acme/kernel', args: [], env: {} } }),
      statesEnvironment: () => true, statesTabWatch: () => states, kernelPath: () => null, sourceOf: () => 'plugin' };
    const kl = K.create({ dataDir: path.join(ROOT, 'kl-' + tag), homeDir: path.join(ROOT, 'hl-' + tag), env: () => ({}), serverSetting: () => undefined, liveKeys: () => new Set(), log: quiet, install: false, engines });
    kl.list();
    const p = { id: 'bp-0000d0c' + tag.length, label: 'Kernel ' + tag, browser: { kind: 'plugin', id: 'acme.engine' } };
    let choice = null, err = null;
    try { choice = await kl._engineChoiceOf(p, p.browser); } catch (e) { err = String(e && e.message).slice(0, 200); }
    try { kl.shutdown?.(); } catch { /* */ }
    return { choice, err };
  };
  const [both, statesOnly, measuresOnly, neither] = await Promise.all([launchLeg(true, true, 'both'), launchLeg(true, false, 'states'), launchLeg(false, true, 'measures'), launchLeg(false, false, 'none')]);
  if ([both, statesOnly, measuresOnly, neither].some((x) => x.err)) ok(false, 'the launch leg: the keeper\'s launch over the stand-in registry threw — the leg cannot judge', { both: both.err, statesOnly: statesOnly.err, measuresOnly: measuresOnly.err, neither: neither.err });
  else ok(both.choice.tabWatch === true && !('tabWatch' in statesOnly.choice) && !('tabWatch' in measuresOnly.choice) && !('tabWatch' in neither.choice) && both.choice.kind === 'plugin' && both.choice.id === 'acme.engine',
    'LAW (a), by behaviour: the launch records tabWatch only when the manifest STATES the word AND the probe MEASURES it — states-only and measures-only are both off', { both: both.choice, statesOnly: statesOnly.choice, measuresOnly: measuresOnly.choice });
}

// ═══ ④ the page watch's setTabWatch and the freeze ═══
console.log('— ④ the page watch: the command on the browser\'s own connection; the freeze never freezes a watched tab');
const { WebSocketServer: WSS } = require('ws');
const T0 = T(0x10), T1 = T(0x11), T2 = T(0x12), T3 = T(0x13), T4 = T(0x14), T5 = T(0x15);
const PAGES = [T0, T1, T2, T3, T4, T5];
const standIn = async () => {
  const st = { watched: new Set(), frozen: new Set(), cmds: [], urls: new Map(), late: new Set() }; // late: tabs whose ON the kernel takes but never answers in the bound
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
      st.cmds.push({ on: !!p.watch, tid: p.targetId, session: m.sessionId || null, keys: Object.keys(p).sort().join(',') });
      if (p.watch && st.late.has(p.targetId)) { st.watched.add(p.targetId); return; } // TAKEN, answered never (a busy kernel past the hub's bound)
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
    const keys = SI.st.cmds.map((c) => c.keys);
    const fz = opened ? await D.freezePaint(PID) : null;
    const frozenAtFreeze = [...SI.st.frozen];
    const off = await D.setTabWatch(PID, T1, false);
    const idle = await D.freezePaint('bp-0000ffff');
    return { opened, on: on.map((a) => (a.ok ? `ok ${a.activeCount}` : a.code)), cmds: SI.st.cmds, keys, fz, frozenAtFreeze, off, idle };
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
  ok(d.opened && J(d.on) === J(['ok 1', 'ok 2', 'ok 3', 'ok 4', 'too_many_watched_tabs']) && d.cmds.every((c) => c.session === null) && d.keys.every((k) => k === 'targetId,watch') && d.off.ok && d.off.watching === false && d.off.activeCount === 3,
    'the command rides the browser\'s OWN connection (no target session) with EXACTLY {targetId, watch}: four watched, the fifth refused by the kernel\'s own code, OFF answered', { on: d.on, keys: [...new Set(d.keys)] });
  ok(!!d.fz && d.fz.ok && watched4.every((t) => !d.frozenAtFreeze.includes(t)) && d.frozenAtFreeze.includes(T0) && d.frozenAtFreeze.includes(T5),
    'the kernel\'s law, ours: the idle freeze never puts a WATCHED tab frozen — the front and the unwatched tab are frozen as today', { frozen: d.frozenAtFreeze.map((x) => x.slice(0, 4)) });
  if (dc) ok(!!dc.fz && dc.fz.ok && watched4.some((t) => dc.frozenAtFreeze.includes(t)), 'CONTROL (the freeze without that rule): a watched tab is put frozen under its viewer — RED', { frozen: dc.frozenAtFreeze.map((x) => x.slice(0, 4)) });
  ok(d.idle && d.idle.ok === false, 'a browser with no page watch is no browser to freeze (its answer as today)', d.idle);
  // r4745 M2 (law 5), the page watch's half: an ON the kernel TOOK but never answered in the bound keeps the tab in the watched set,
  // so the freeze still skips it (an OFF confirmed, or this socket's end, takes it out). RED: any unconfirmed answer drops it
  const lateLeg = async (Dmod) => {
    const SI = await standIn(); SI.st.late.add(T1); const PID = 'bp-0000d0e3';
    const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 1, tabsOf: () => [], callTimeoutMs: 400 });
    try {
      await D.arm(PID, { budgetMs: 3000 });
      const opened = await until(() => !!D.paintFacts(PID), 3000);
      const a = opened ? await D.setTabWatch(PID, T1, true) : null;
      const fz = opened ? await D.freezePaint(PID) : null;
      return { opened, a, fz, frozen: [...SI.st.frozen], kernelWatched: [...SI.st.watched] };
    } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
  };
  const UNC_ANCH = "    else if (a.code === 'tab_watch_unanswered' || a.code === 'tab_watch_failed') w.tabWatched.add(tid);\n";
  if (!dsrc.includes(UNC_ANCH)) ok(false, 'the anchor of the control «an unconfirmed answer drops the tab» is not in the source (src/server/browser-dialogs.js)');
  const Du = dsrc.includes(UNC_ANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, UNC_ANCH, "    else if (a.code === 'tab_watch_unanswered' || a.code === 'tab_watch_failed') w.tabWatched.delete(tid); // (the control: as at c92f2c341)\n"), 'tw-unconfirmed-drop') : null;
  // r4745 (S2): the idle sweep's second look (stillIdle) runs on EVERY browser, stock Chrome too — a viewer arriving while the fronts
  // were read cancels the freeze (it used to freeze, then thaw). Named here and in the line. RED: the freeze without that look
  const lookLeg = async (Dmod) => {
    const SI = await standIn(); const PID = 'bp-0000d0e4';
    const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 1, tabsOf: () => [] });
    try {
      await D.arm(PID, { budgetMs: 3000 });
      const opened = await until(() => !!D.paintFacts(PID), 3000);
      const busy = opened ? await D.freezePaint(PID, { stillIdle: () => false }) : null;
      const frozenAfterBusy = SI.st.frozen.size;
      const idle = opened ? await D.freezePaint(PID, { stillIdle: () => true }) : null;
      return { opened, busy, frozenAfterBusy, idle, frozen: SI.st.frozen.size };
    } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
  };
  const LOOK_ANCH = "    if (typeof stillIdle === 'function' && !stillIdle()) return { ok: false, why: 'viewer' }; // r4689: a viewer arrived while the fronts were read (it may be watching a tab)\n";
  if (!dsrc.includes(LOOK_ANCH)) ok(false, 'the anchor of the control «the freeze without its second look» is not in the source (src/server/browser-dialogs.js)');
  const Dl = dsrc.includes(LOOK_ANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, LOOK_ANCH, "    // (the control: no second look, as at the release)\n"), 'tw-no-look') : null;
  const [lt, ltc, lk, lkc] = await Promise.all([lateLeg(DD), Du ? lateLeg(Du) : Promise.resolve(null), lookLeg(DD), Dl ? lookLeg(Dl) : Promise.resolve(null)]);
  ok(lt.opened && lt.a && lt.a.code === 'tab_watch_unanswered' && lt.kernelWatched.includes(T1) && !!lt.fz && lt.fz.ok && !lt.frozen.includes(T1) && lt.frozen.includes(T0),
    'r4745 M2: an ON the kernel took but never answered in the bound — the tab stays in the watched set, so the idle freeze skips it while the kernel may hold it', { a: lt.a, frozen: lt.frozen.map((x) => x.slice(0, 4)) });
  if (ltc) ok(!!ltc.fz && ltc.fz.ok && ltc.frozen.includes(T1), 'CONTROL (an unconfirmed answer drops the tab, as at c92f2c341): the freeze puts a tab the kernel holds watched frozen — RED', { frozen: ltc.frozen.map((x) => x.slice(0, 4)) });
  ok(lk.opened && lk.busy && lk.busy.ok === false && lk.busy.why === 'viewer' && lk.frozenAfterBusy === 0 && lk.idle && lk.idle.ok && lk.frozen > 0,
    'r4745 (S2), STOCK TOO: the freeze\'s second look — a viewer counted right before the frozen call cancels it (nothing frozen); with none, the freeze runs as today', lk);
  if (lkc) ok(!!lkc.busy && lkc.busy.ok === true && lkc.frozenAfterBusy > 0, 'CONTROL (no second look, as at the release): a browser whose viewer arrived during the fronts\' read is frozen anyway — RED', lkc);
  // r4779 (the should: the reset's wiring was pinned by nothing — ③ calls the keeper's reset itself): the page watch's OPEN tells the
  // keeper, with its profile. The fact judged: the keeper's own reset called when the socket opened. RED: the open without that call
  // r4808: and the CURRENT socket's END tells it too (the leases ended there — a watch reads «stills» now, not at the next open). The
  // stand-in browser goes away (no reopen can come); the fact waited on: the page watch's own facts gone (down ran — the same call)
  const resetLeg = async (Dmod) => {
    const SI = await standIn(); const PID = 'bp-0000d0e7'; const resets = []; let gone = false;
    const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true, tabWatchReset: (pid) => resets.push(String(pid)) }, log: quiet, leaseCountOf: () => 1, tabsOf: () => [] });
    try {
      await D.arm(PID, { budgetMs: 3000 });
      const opened = await until(() => !!D.paintFacts(PID), 3000);
      const atOpen = resets.slice();
      gone = true; await SI.close();
      const down = opened ? await until(() => !D.paintFacts(PID), 3000) : false;
      return { opened, atOpen, down, resets: resets.slice() };
    } finally { try { D.shutdown(); } catch { /* */ } if (!gone) await SI.close(); }
  };
  const RST_ANCH = "      if (keeper && typeof keeper.tabWatchReset === 'function') { try { keeper.tabWatchReset(w.profileId); } catch { /* the keeper's own */ } } // r4745 (S1) + r4779: …so the keeper's counts of this profile go with them, and each watch of it asks again on THIS socket\n";
  if (!dsrc.includes(RST_ANCH)) ok(false, 'the anchor of the control «the open tells the keeper nothing» is not in the source (src/server/browser-dialogs.js)');
  const Dr = dsrc.includes(RST_ANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, RST_ANCH, "      // (the control: the open tells the keeper nothing)\n"), 'tw-no-reset') : null;
  const DOWN_ANCH = dsrc.split('\n').find((l) => l.startsWith("    if (watches.get(w.profileId) === w && keeper && typeof keeper.tabWatchReset === 'function')")) || '\u0000';
  if (!dsrc.includes(DOWN_ANCH + '\n')) ok(false, 'the anchor of the control «the socket\'s end tells the keeper nothing» is not in the source (src/server/browser-dialogs.js)');
  const Dd = dsrc.includes(DOWN_ANCH + '\n') ? M.load('src/server/browser-dialogs.js', anchored(dsrc, DOWN_ANCH + '\n', "    // (the control: the socket's end tells the keeper nothing, as at bc7dd84d8)\n"), 'tw-down-silent') : null;
  const [rs, rsc, rsd] = await Promise.all([resetLeg(DD), Dr ? resetLeg(Dr) : Promise.resolve(null), Dd ? resetLeg(Dd) : Promise.resolve(null)]);
  ok(rs.opened && J(rs.atOpen) === J(['bp-0000d0e7']), 'r4779: the page watch\'s socket OPENING tells the keeper (its profile\'s counts go, each watch of it asks again on this socket)', rs);
  if (rsc) ok(rsc.opened && rsc.atOpen.length === 0, 'CONTROL (the open tells the keeper nothing): no reset reaches the keeper — RED', rsc);
  ok(rs.down && rs.resets.length >= 2 && rs.resets.every((p) => p === 'bp-0000d0e7'), /* ≥ 2: a reconnect's failed try may end one more watch */ 'r4808: the page watch\'s CURRENT socket ENDING tells the keeper too — every watch of the profile is told «stills» now (its ask answers unavailable), not at the next open', rs);
  if (rsd) ok(rsd.down && rsd.resets.length === 1, 'CONTROL (the socket\'s end tells the keeper nothing, as at bc7dd84d8): no reset until a next open that may never come — RED', rsd);
}

// ═══ ⑤ the bridge's watching record ═══
console.log('— ⑤ the bridge: `live` / `capped` ride the watching record on that road; stock reads today\'s record');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const KA = 'bk-0000d0a1';
  const bridgeLeg = async (tabWatch, BS = require('../src/server/browser-stream.js'), { again = false, early = false } = {}) => {
    let closes = 0, hooksOf = null;
    const fk = { setFor: () => ({ attachments: [{ profileId: 'bp-0000d0f1', alias: 'work', isDefault: true, label: 'Work' }], handles: ['work'], defaultId: 'bp-0000d0f1', children: [] }), list: () => ({ profiles: [{ id: 'bp-0000d0f1', label: 'Work' }] }),
      streamPortFor: async () => ({ ok: true, port: upPort }), inputStateFor: () => ({ input: 'agent' }), noteViewers: () => {},
      tabOwnersFor: async () => ({ ok: true, owners: { [T(1)]: 'agent', [T(2)]: 'agent' }, mediated: false, adoptable: false }),
      watchTabFor: async (target, id, hooks) => { hooksOf = hooks; if (early && typeof hooks.onTabWatch === 'function') hooks.onTabWatch({ live: true }); return { ok: true, close: () => { closes++; }, ...(tabWatch ? { tabWatch } : {}) }; } };
    const up = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r)); const upPort = up.address().port;
    up.on('connection', (ws) => { ws.send(JSON.stringify({ type: 'status', connected: true })); ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: true }, { tabId: 't2', targetId: T(2), title: 'B', url: 'https://b.example/', active: false }] })); });
    const br = BS.create({ keeper: fk, activeSessions: new Map([['sess-w', { _browserKey: KA, webuiId: 'sess-w' }]]), requestAuthed: () => true, log: quiet });
    const hs = http.createServer(); servers.push(hs); hs.on('upgrade', (req, sock, head) => br.handleUpgrade(req, sock, head)); await new Promise((r) => hs.listen(0, '127.0.0.1', r));
    const got = []; const ws = new WebSocket(`ws://127.0.0.1:${hs.address().port}/api/browser/stream?session=sess-w`);
    ws.on('message', (dd) => { try { const j = JSON.parse(String(dd)); if (j.type === 'watching' || j.type === 'tab-owners') got.push(j); } catch { /* */ } });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    const owners = await until(() => got.some((x) => x.type === 'tab-owners'), 3000); // the fact the watch's judge reads: the tab is one of this browser's
    ws.send(JSON.stringify({ type: 'watch-tab', targetId: T(2) }));
    // the fact each road judges: the watch's own record (on the kernel's road its live / capped record; on stock its first record)
    const want = (x) => x.type === 'watching' && x.targetId === T(2) && !x.refused && (early ? x.live === true : tabWatch && (tabWatch.live || tabWatch.code === 'too_many_watched_tabs') ? ('live' in x || 'capped' in x) : true);
    const settled = await until(() => got.some(want), 3000);
    // r4779: the page watch reopened — the keeper asked the kernel again and TELLS the watch its answer (here: first a still, then live)
    const toldAt = got.length;
    if (again && settled && hooksOf && typeof hooksOf.onTabWatch === 'function') { hooksOf.onTabWatch({ live: false, code: 'tab_watch_unavailable' }); hooksOf.onTabWatch({ live: true }); }
    if (early && settled && hooksOf && typeof hooksOf.onMode === 'function') hooksOf.onMode('polling'); // r4808: the next record of the watch (its mode) says the kw it keeps
    // THE BRIDGE's OFF ROAD (r4745): the viewer follows the agent's tab again ⇒ the watch's close (the keeper's OFF) runs, once
    ws.send(JSON.stringify({ type: 'watch-tab', targetId: null }));
    const closed = await until(() => closes >= 1, 3000);
    const back = await until(() => got.slice(toldAt).some((x) => x.type === 'watching' && x.targetId === null), 3000); // the records are ordered: what the watch was told came before this one
    ws.close(); br.shutdown?.(); up.close();
    return { owners, settled, closed, closes, back, watching: got.filter((x) => x.type === 'watching'), told: got.slice(toldAt).filter((x) => x.type === 'watching' && x.targetId === T(2)) };
  };
  const bsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const TOLD_ANCH = bsrc.split('\n').find((l) => l.startsWith('      onTabWatch: (tw) => {')) || '\u0000';
  if (!bsrc.includes(TOLD_ANCH + '\n')) ok(false, 'the anchor of the control «the bridge hears nothing of a reopen» is not in the source (src/server/browser-stream.js)');
  const Bmute = bsrc.includes(TOLD_ANCH + '\n') ? M.load('src/server/browser-stream.js', anchored(bsrc, TOLD_ANCH + '\n', '      // (the control: the bridge hears nothing of a reopen)\n'), 'tw-bridge-deaf') : null;
  // r4808 (the readers' microtask corner): a reopen's TOLD answer landing before the watch's own result — the result's older
  // snapshot (here «lapsed») must not clear it. RED: the result written over a told answer
  const SNAP_ANCH = bsrc.split('\n').find((l) => l.startsWith('      if (live() && seq === viewer.watchSeq && r.tabWatch && !w.told)')) || '\u0000';
  if (!bsrc.includes(SNAP_ANCH + '\n')) ok(false, 'the anchor of the control «the result written over a told answer» is not in the source (src/server/browser-stream.js)');
  const Bsnap = bsrc.includes(SNAP_ANCH + '\n') ? M.load('src/server/browser-stream.js', anchored(bsrc, SNAP_ANCH + '\n', SNAP_ANCH.replace(' && !w.told)', ')') + '\n'), 'tw-bridge-snapshot') : null;
  const [live, capped, stock, again, cAgain, early, cEarly] = await Promise.all([bridgeLeg({ live: true }), bridgeLeg({ live: false, code: 'too_many_watched_tabs', limit: 4 }), bridgeLeg(null),
    bridgeLeg({ live: true }, undefined, { again: true }), Bmute ? bridgeLeg({ live: true }, Bmute, { again: true }) : Promise.resolve(null),
    bridgeLeg({ live: false, code: 'tab_watch_lapsed' }, undefined, { early: true }), Bsnap ? bridgeLeg({ live: false, code: 'tab_watch_lapsed' }, Bsnap, { early: true }) : Promise.resolve(null)]);
  if (!live.owners || !capped.owners || !stock.owners || !live.settled || !capped.settled || !stock.settled) ok(false, 'the bridge leg: the tab owners or the watch\'s own record never reached the viewer within 3 s — the leg cannot judge', { live: [live.owners, live.settled], capped: [capped.owners, capped.settled], stock: [stock.owners, stock.settled] });
  else {
    ok(live.watching.some((x) => x.targetId === T(2) && x.live === true) && !J(live.watching).includes('example'), 'the watching record says `live` on the kernel\'s road (a target id and a word, no address)', live.watching);
    ok(capped.watching.some((x) => x.targetId === T(2) && x.capped === 4) && !capped.watching.some((x) => x.live === true), 'the kernel\'s cap rides the record as its limit (`capped: 4`), never `live`', capped.watching);
    ok(stock.watching.some((x) => x.targetId === T(2) && !x.refused) && stock.watching.every((x) => !('live' in x) && !('capped' in x)), 'STOCK: the watch\'s own record (the tab, no refusal) and every record carry neither word — today\'s records', stock.watching);
    ok([live, capped, stock].every((x) => x.closed && x.closes === 1), 'the bridge\'s OFF road: a viewer that follows the agent\'s tab again ends its watch — the close (the keeper\'s OFF on the kernel\'s road) runs once', [live.closes, capped.closes, stock.closes]);
    ok(again.back && again.told.length === 2 && !('live' in again.told[0]) && !('capped' in again.told[0]) && again.told[1].live === true && !J(again.told).includes('example'),
      'r4779: the page watch reopened — the record says what the keeper was TOLD on asking again: a still drops «live» (the effect sentence goes), a confirmed answer brings it back', again.told);
    if (cAgain) ok(cAgain.back && cAgain.told.length === 0, 'CONTROL (the bridge hears nothing of a reopen): the record keeps its «live» whatever the kernel answered again — RED', cAgain.told);
    ok(early.settled && early.told.some((x) => x.mode === 'polling' && x.live === true), 'r4808: a TOLD answer that lands before the watch\'s own result stands — the result\'s older snapshot does not clear it (the next record still says «live»)', early.told);
    if (cEarly) ok(cEarly.settled && cEarly.told.some((x) => x.mode === 'polling') && !cEarly.told.some((x) => x.mode === 'polling' && x.live === true), 'CONTROL (the result written over a told answer): the older snapshot clears «live» silently — the next record drops it — RED', cEarly.told);
  }
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: '⑥ ' })) ok(r.pass, r.name, r.detail);
console.log(`\n${fail ? '✗' : '✓'} test-browser-tab-watch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
