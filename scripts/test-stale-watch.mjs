#!/usr/bin/env node
// A STALE PAGE THAT GAVE UP CHECKS AGAIN (lane think-tools-phone, 主开发 2026-11-17 — the owner's page ran the 2.369.404 bundle
// against a 2.369.406 hub for TWELVE HOURS; its nav log's last entry: «stale, 404 to 406, wait»). Fast tier, PURE: the real
// src/lib/stale-watch.js staleLook and the real boot-ladder.js waitServerReady over a SIMULATED hub and clock (no DOM, no server).
//   ① the verdict: behind / hold / wait / none, each in its place
//   ② the back-off: 30 s, 1 min, 2 min, 5 min, then every 5 min — never faster, never slower
//   ③ THE OWNER'S TWELVE HOURS: a hub restarting into 406 whose boot takes longer than the ready wait's cap, the socket up all
//      day after one reconnect — the cure reloads at the first look after ready; the ONE notice («the server is still starting»)
//      only after the give-up; RED CONTROL = THE RELEASE'S GIVE-UP (one failed wait, then silence for ever): no reload in 12 h
//   ③b IT NEVER NAGS: a page that reloads by itself within seconds says nothing; the notice is born once, its ✕ hides it for that
//      version (staleNotice), the tries go on in silence
//   ④ a hub that boots for three hours: looks on the back-off, ONE reload, within 5 min of ready
//   ⑤ HOLDS: work a reload would lose for an hour ⇒ no reload in that hour, the reload within one hold after; typing; typing that
//      starts during the ready wait (read again after it) · ⑤b a version read failing for an hour after the mismatch: the looks go
//      on · a spent reload never says «tries again» · ⑤c twelve hours of a hold write a handful of diary rows, not one per look
//   ⑥ NEVER A RELOAD LOOP: a reload that did not take (a cached bundle) ⇒ the one notice, then quiet — no second reload
//   ⑦ a hub back on the page's version ⇒ no notice, nothing scheduled
//   ⑧ THE PAGE'S OWN WIRING (src/lib/app.js, read as text): _checkBundleFreshness runs staleLook with ONE timer, the typing and
//      unsaved readers (an editor's unsaved file, a composer's words — never a chat box: its draft comes back), the ready wait,
//      ONE look at a time; _staleSay draws staleNotice pinned with Reload, patched in place, its ✕ hiding it for that
//      version; the release's give-up line is gone — RED CONTROL: that line planted back is caught
//   ⑨ THE LAW (主开发 03:08Z) over the REAL marks (markTyped / markLanded / wasTyped keyed by a plain record): a box holds only if
//      the person typed in it, until gone, empty or a landed save — RED CONTROLS: the release's reader, a mutant copy whose
//      markLanded marks, a site that releases on a failed save
//   ⑨b markLandedOnSave + carryUnsaved over the REAL SettingsManager (fetch stood in, its debounce at no wall time): released only
//      on «saved» for its path with the box unchanged; a box REDRAWN from the store's unsaved copy carries the mark — RED CONTROLS:
//      the release at set(), a mutant copy that releases on «failed», a redraw carrying nothing, a mutant copy carrying a landed copy
//      · TWO BOXES ON ONE SETTING (主开发 04:04Z): the other box's landed words never release this one — RED: a mutant copy that
//      releases on its own box alone
//      · values that are not the box's text (a JSON object, a default, trimmed words, a failed POST) and markLandedOnSave's answer —
//      RED: a mutant copy that compares the box's text
//   ⑩ every release / carry / outcome site reads its save's answer (the objective: the group stored what was sent; Settings and
//      Manage agents: markLandedOnSave, carryUnsaved, the save mark, the toast on the answer, the close guard), dictation reaches
//      the ONE capture listener, the four composers that rebuild carry the mark — text pins, each site with its own red
//      · the press marks the box (主开发 04:04Z / 04:19Z): «Draft from my recent decisions»'s OWN press code run over a fetch stand-in —
//      the billed proposal holds; RED: the same code without its mark · every mark is imported where it is called (each with its red)
import { STALE_RETRY_MS, STALE_HOLD_MS, STALE_WORDS, staleRetryWait, staleVerdict, staleNotice, staleLook, heldWords, markTyped, markLanded, wasTyped, markLandedOnSave, carryUnsaved } from '../src/lib/stale-watch.js';
import { waitServerReady, STARTING_CAP_MS } from '../src/lib/boot-ladder.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof msg !== 'string') throw new Error(`ok: the condition goes FIRST, the name second (got a ${typeof msg} for the name)`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '\n      ' + JSON.stringify(extra) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
// EVERY RED CONTROL IS BUILT FROM AN ANCHOR IN THE SOURCE — and one whose anchor is gone fails BY NAME, never builds nothing in silence
// (主开发 04:54Z: cure 4's «releases on failed» control searched for a line that very cure rewrote, built no mutant, and read as «the
// mutant was not caught»). Every text red and every mutant copy of the suite goes through it.
const swapped = (src, from, to, label) => {
  if (typeof src !== 'string' || !src.includes(from)) { ok(false, `the anchor of the red control «${label}» is not in the source — the control builds nothing`, String(from).slice(0, 120)); return null; }
  return src.replace(from, to);
};
const MIN = 60000, HOUR = 60 * MIN;

console.log('① the verdict');
{
  const rows = [
    [{ step: 'none' }, { act: 'none' }], [{ step: 'reload' }, { act: 'wait' }],
    [{ step: 'reload', typing: true }, { act: 'hold', why: 'hold' }], [{ step: 'reload', unsaved: true }, { act: 'hold', why: 'unsaved' }],
    [{ step: 'reload', typing: true, unsaved: true }, { act: 'hold', why: 'unsaved' }],
    [{ step: 'notice' }, { act: 'none' }], [{ step: 'quiet', unsaved: true }, { act: 'none' }],
  ];
  const bad = rows.filter(([i, want]) => JSON.stringify(staleVerdict(i)) !== JSON.stringify(want));
  ok(!bad.length, `${rows.length} rows: the same version does nothing; a first mismatch waits for the hub (or HOLDS — work a reload would lose, or a person typing — and says which); a spent reload has nothing to try`, bad);
  const n1 = staleNotice({ v: '2.369.406', why: 'starting' }), n2 = staleNotice({ v: '2.369.406', why: 'hold' }), n3 = staleNotice({ v: '2.369.406', why: 'unsaved' });
  ok(n1 && n1.words === STALE_WORDS.starting && n2 && n2.words === STALE_WORDS.hold && n3 && n3.words === STALE_WORDS.unsaved && n1.door === 'Reload' && !staleNotice({ v: '2.369.406', why: 'hold', hidden: true }) && !staleNotice({ v: null, why: 'hold' }) && !staleNotice({ v: '2.369.406' }),
    `the notice names WHY («${STALE_WORDS.starting}» / «${STALE_WORDS.hold}») with Reload; nothing when hidden for that version, not behind, or reloading now`);
}

console.log('② the back-off');
{
  const w = [1, 2, 3, 4, 5, 9, 50].map(staleRetryWait);
  ok(JSON.stringify(w) === JSON.stringify([30000, 60000, 120000, 300000, 300000, 300000, 300000]) && staleRetryWait(0) === 30000, `the waits after give-ups 1, 2, 3, 4, 5, 9, 50: ${w.map((x) => x / 1000 + ' s').join(', ')} — never under ${STALE_RETRY_MS[0] / 1000} s, never over ${STALE_RETRY_MS.at(-1) / 60000} min`);
}

// ── THE SIMULATED WORLD: a hub that restarts into `srv` at t = 0, down for `downMs`, booting until `readyAt`; one page with
// bundle `bundle`, its socket reconnecting once at `reconnectAt` and then up for the rest of the run ──
function world({ bundle = '2.369.404', srv = '2.369.406', downMs = 8000, readyAt, unsavedUntil = 0, boxes = null, reader = heldWords, typing = [0, 0], versionGap = [0, 0], cachedReload = false, look = staleLook, hubVersion = null }) {
  const W = { now: 0, timer: null, looks: 0, reloads: [], notes: [], behind: [], notices: 0, gaveUp: { n: 0, srv: null }, stamps: new Set(), noticed: new Set(), pending: false, bundle };
  const fetchImpl = async (url) => {
    if (W.now < downMs) throw new Error('down');
    if (url.startsWith('/api/boot')) return { ok: true, status: 200, json: async () => (W.now < readyAt ? { phase: 'booting', waitingOn: ['sessions'] } : { phase: 'ready' }) };
    throw new Error('unknown ' + url);
  };
  const sleep = async (ms) => { W.now += ms; };
  W.deps = () => ({
    bundle: W.bundle,
    fetchVersion: async () => (W.now < downMs || (W.now >= versionGap[0] && W.now < versionGap[1]) ? null : (hubVersion || srv)),
    store: { reloaded: (v) => W.stamps.has(v), noticed: (v) => W.noticed.has(v), markNoticed: (v) => W.noticed.add(v) },
    pending: () => W.pending,
    typing: () => W.now >= typing[0] && W.now < typing[1],
    unsaved: () => W.now < unsavedUntil || (!!boxes && reader(boxes)),
    waitReady: () => waitServerReady({ fetchImpl, sleep, now: () => W.now }),
    gaveUp: W.gaveUp,
    schedule: (ms) => { W.timer = W.now + ms; },
    reload: (v) => { W.reloads.push(W.now); W.stamps.add(v); if (!cachedReload) W.bundle = v; W.gaveUp.n = 0; W.gaveUp.srv = null; W.gaveUp.last = null; W.timer = null; W.reconnectAt = W.now + 2000; },   // a new document: its own memo
    say: (v, why = null) => { const last = W.behind.at(-1); if (!last ? v !== null : (last.v !== v || last.why !== why)) W.behind.push({ at: W.now, v, why }); },
    notice: () => { W.notices++; },
    note: (d2, extra = {}) => { W.notes.push({ at: W.now, d2, ...extra }); },
  });
  W.reconnectAt = downMs + 2000;   // the socket comes back once the hub listens again
  W.run = async (until) => {
    for (let i = 0; i < 100000; i++) {
      const next = [W.timer, W.reconnectAt].filter((x) => x != null).sort((a, b) => a - b)[0];
      if (next == null || next > until) break;
      if (next === W.reconnectAt) W.reconnectAt = null; else W.timer = null;
      W.now = Math.max(W.now, next);
      W.looks++;
      await look(W.deps());
    }
    return W;
  };
  return W;
}

// THE RELEASE'S GIVE-UP AS A MUTANT OF THE REAL MODULE: the copy's give-up after the ready wait schedules nothing — one failed wait,
// then silence (b06f36e90's app.js: «gave up — the next reconnect checks again»)
const SRC = fs.readFileSync(path.join(REPO, 'src/lib/stale-watch.js'), 'utf-8');
const GIVE_UP = "if (!(await d.waitReady()).ok) { m.n += 1; noteOnce('wait', { n: m.n }); d.say(srv, 'starting'); d.schedule(staleRetryWait(m.n)); return 'retry'; }";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stale-watch-'));
fs.writeFileSync(path.join(TMP, 'boot-ladder.mjs'), fs.readFileSync(path.join(REPO, 'src/lib/boot-ladder.js'), 'utf-8'));
fs.writeFileSync(path.join(TMP, 'mutant.mjs'), editAnchor(editAnchor(SRC, GIVE_UP, "if (!(await d.waitReady()).ok) { noteOnce('wait', {}); return 'retry'; }", "src/lib/stale-watch.js"), "from './boot-ladder.js'", "from './boot-ladder.mjs'", "src/lib/stale-watch.js"));
const RELEASE_LOOK = SRC.includes(GIVE_UP) ? (await import(pathToFileURL(path.join(TMP, 'mutant.mjs')).href)).staleLook : null;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
ok(!!RELEASE_LOOK, 'the RED control is a mutant COPY of the real module (its give-up line found once, schedule taken out)');

console.log('③ THE OWNER\'S TWELVE HOURS — a boot longer than the ready wait\'s cap, the socket up all day');
{
  const readyAt = STARTING_CAP_MS + 2 * MIN;   // the slow boot of that morning: the wait gives up before the hub is ready
  const cure = await world({ readyAt }).run(12 * HOUR);
  const firstBehind = cure.behind[0];
  ok(cure.reloads.length === 1 && cure.reloads[0] >= readyAt && cure.reloads[0] <= readyAt + STALE_RETRY_MS.at(-1) && cure.bundle === '2.369.406',
    `the cure: ONE reload, at ${Math.round(cure.reloads[0] / 1000)} s — the first look after the hub's ready (${Math.round(readyAt / 1000)} s), after ${cure.notes.filter((n) => n.d2 === 'wait').length} give-up(s)`, { reloads: cure.reloads, notes: cure.notes.slice(0, 6) });
  const giveUp = cure.notes.find((n) => n.d2 === 'wait');
  ok(firstBehind && firstBehind.v === '2.369.406' && firstBehind.why === 'starting' && giveUp && firstBehind.at === giveUp.at && cure.behind.at(-1).v === null && cure.behind.length === 2,
    `the ONE notice is born at the give-up (${firstBehind && Math.round(firstBehind.at / 1000)} s: «the server is still starting»), never before, and goes at the reload`, cure.behind);
  const rel = await world({ readyAt, look: RELEASE_LOOK }).run(12 * HOUR);
  ok(rel.reloads.length === 0 && rel.bundle === '2.369.404' && rel.notes.filter((n) => n.d2 === 'wait').length === 1 && rel.looks === 1 && rel.timer === null,
    `RED CONTROL — the release's give-up: ${rel.looks} look, ${rel.notes.filter((n) => n.d2 === 'wait').length} «wait», then silence: the page still runs ${rel.bundle} after twelve hours (${rel.reloads.length} reloads)`, { looks: rel.looks, notes: rel.notes });
}

console.log('③b IT NEVER NAGS');
{
  const quick = await world({ readyAt: 4000 }).run(HOUR);
  ok(quick.reloads.length === 1 && quick.behind.length === 0, `a hub ready within seconds: the page reloads by itself (${quick.reloads.length}) and says NOTHING (${quick.behind.length} notices) — today's road`, quick.behind);
  const slow = await world({ readyAt: 3 * HOUR }).run(12 * HOUR);
  const born = slow.behind.filter((b) => b.v !== null).length;
  ok(born === 1 && slow.looks > 10 && slow.notes.filter((n) => n.d2 === 'wait').length === 1, `three hours of starting: ${slow.looks} looks in silence (ONE «wait» diary row), the notice born ONCE (${born})`, slow.behind);
}

console.log('④ a hub that boots for three hours');
{
  const readyAt = 3 * HOUR;
  const W = await world({ readyAt }).run(12 * HOUR);
  const waits = W.notes.filter((n) => n.d2 === 'wait');
  const gaps = waits.slice(1).map((n, i) => n.at - waits[i].at);
  ok(W.reloads.length === 1 && W.reloads[0] - readyAt <= STALE_RETRY_MS.at(-1) + STARTING_CAP_MS && gaps.every((g) => g >= STALE_RETRY_MS[0]),
    `looks on the back-off (${W.looks} looks, ${waits.length} «wait» diary row), ONE reload ${Math.round((W.reloads[0] - readyAt) / 1000)} s after the hub's ready`, { reloads: W.reloads, waits: waits.length });
}

console.log('⑤ HOLDS — unsaved work for an hour; typing; typing that starts during the wait');
{
  const W = await world({ readyAt: 30000, unsavedUntil: HOUR }).run(3 * HOUR);
  const held = W.notes.filter((n) => n.d2 === 'hold');
  ok(W.reloads.length === 1 && W.reloads[0] >= HOUR && W.reloads[0] <= HOUR + STALE_HOLD_MS && held.length === 1 && W.looks > 200 && W.behind[0]?.why === 'unsaved' && W.behind.filter((b) => b.v !== null).length === 1,
    `no reload while work a reload would lose stands (ONE notice: «This page waits for the words you typed here»; ${held.length} diary row for the whole hour), the reload ${Math.round((W.reloads[0] - HOUR) / 1000)} s after it is gone`, { reloads: W.reloads, holds: held.length, notices: W.behind });
  const T = await world({ readyAt: 30000, typing: [20000, 10 * MIN] }).run(HOUR);
  ok(T.reloads.length === 1 && T.reloads[0] >= 10 * MIN && T.reloads[0] <= 10 * MIN + STALE_HOLD_MS && T.behind[0]?.why === 'hold',
    `a person typing for ten minutes: held («reloads when you pause»), the reload ${Math.round((T.reloads[0] - 10 * MIN) / 1000)} s after the typing stops`, { reloads: T.reloads, notices: T.behind });
  const D = await world({ readyAt: 100000, typing: [50000, 200000] }).run(HOUR);
  const afterWait = D.notes.find((n) => n.d2 === 'hold');
  ok(D.reloads.length === 1 && D.reloads[0] >= 200000 && afterWait && afterWait.at >= 100000,
    `typing that starts DURING the ready wait: the page is read again after the wait and holds (${afterWait && Math.round(afterWait.at / 1000)} s), the reload after it (${Math.round(D.reloads[0] / 1000)} s)`, D.notes);
}

console.log('⑤b A VERSION READ THAT FAILS FOR AN HOUR after the mismatch was seen (a hub gone again)');
{
  const W = await world({ readyAt: 3 * HOUR, versionGap: [HOUR, 2 * HOUR] }).run(6 * HOUR);
  const inGap = W.notes.filter((n) => n.d2 === 'wait' && n.at >= HOUR && n.at < 2 * HOUR);
  ok(W.reloads.length === 1 && W.reloads[0] >= 3 * HOUR && W.timer === null && W.looks > 20 && W.behind.filter((b) => b.v !== null).length === 1,
    `the looks go on through the failed reads (${W.looks} looks in all), the ONE notice stands, ONE reload after the hub's ready`, { reloads: W.reloads, looks: W.looks, gap: inGap.length });
  const S = await world({ readyAt: 30000, cachedReload: true, versionGap: [2 * MIN, HOUR] }).run(2 * HOUR);
  ok(S.reloads.length === 1 && !S.behind.some((b) => b.why === 'starting'), 'a SPENT reload (it did not take) owes no retry: a later failed read never says «tries again by itself»', S.behind);
}

console.log('⑤c THE DIARY STAYS READABLE');
{
  const W = await world({ readyAt: 30000, unsavedUntil: 12 * HOUR }).run(12 * HOUR);
  ok(W.notes.length <= 3, `twelve hours of a hold write ${W.notes.length} diary row(s), not one per look (${W.looks} looks)`, W.notes.slice(0, 5));
}

console.log('⑥ NEVER A RELOAD LOOP — the reload did not take (a cached bundle)');
{
  const W = await world({ readyAt: 30000, cachedReload: true }).run(12 * HOUR);
  W.reconnectAt = W.now + 1000; await W.run(13 * HOUR);   // a later reconnect: still quiet
  ok(W.reloads.length === 1 && W.notices === 1 && W.timer === null, `ONE reload, then the existing notice ONCE («reload it yourself»), then quiet — nothing scheduled (${W.reloads.length} reloads, ${W.notices} notice)`, { reloads: W.reloads, notices: W.notices, timer: W.timer });
}

console.log('⑦ a hub back on the page\'s version');
{
  const W = await world({ readyAt: 0, hubVersion: '2.369.404' }).run(HOUR);
  ok(W.reloads.length === 0 && W.behind.length === 0 && W.timer === null, 'the same version: no notice, no reload, nothing scheduled', W.behind);
}

console.log('⑧ THE PAGE\'S OWN WIRING');
{
  const app = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf-8');
  const a = app.indexOf('  async _checkBundleFreshness() {'), M = a >= 0 ? app.slice(a, app.indexOf('\n  }\n', a) + 4) : '';
  const b = app.indexOf('  _staleSay(v, why) {'), S = b >= 0 ? app.slice(b, app.indexOf('\n  }\n', b) + 4) : '';
  const RELEASE_GIVE_UP = "if (!(await waitServerReady({ ...bootDeps() })).ok) { navNote({ k: 'stale', b: BUILD_VERSION, s: srv, d2: 'wait' }); return; } // gave up — the next reconnect checks again";   // stale-pins: kept (the release's / a regressed form, absent on purpose — this red plants it)
  const wired = (m) => /await staleLook\(\{/.test(m) && /clearTimeout\(this\._staleTimer\); this\._staleTimer = null;/.test(m)
    && /schedule: \(ms\) => \{ clearTimeout\(this\._staleTimer\); this\._staleTimer = setTimeout\(\(\) => this\._checkBundleFreshness\(\), ms\); \},/.test(m)
    && /Date\.now\(\) - this\._staleTyping\.at < TYPING_QUIET_MS/.test(m) && /typeof w\._editorDirty === 'function' && w\._editorDirty\(\)/.test(m)
    && /heldWords\(\[\.\.\.document\.querySelectorAll\('textarea, input'\)\]\.filter\(\(x\) => !x\.matches\('\.chat-input, \.browser-live-kbd, \.xpra-ime, \.xterm-helper-textarea'\)\)\.map\(\(x\) => \(\{ typed: wasTyped\(x\), text: x\.value/.test(m)
    && /if \(!e\.isTrusted && !e\[Symbol\.for\('vibespace\.voice\.spoken'\)\]\) return; T\.at = Date\.now\(\); if \(e\.target\?\.tagName === 'TEXTAREA'\) markTyped\(e\.target\);/.test(m)
    && /if \(this\._staleBusy\) \{ this\._staleAgain = true; return; \}/.test(m)
    && /say: \(v, why\) => this\._staleSay\(v, why\),/.test(m) && !m.includes(RELEASE_GIVE_UP);
  ok(wired(M), `app.js _checkBundleFreshness runs staleLook with ONE timer (a new look cancels the old), the typing reader (${'TYPING_QUIET_MS'}) and the unsaved reader (editors' unsaved files, composers' words — never a chat box, whose draft comes back), ONE look at a time, the ready wait — and the release's give-up line is gone`);
  ok(/const n = staleNotice\(\{ v, why, hidden: !!\(hideKey && sessionStorage\.getItem\(hideKey\)\) \}\);/.test(S) && /if \(el && el\.isConnected && el\.dataset\.why === why\) return;/.test(S)
    && /pinned: true, action: \{ label: t\(n\.door\), run: \(\) => location\.reload\(\) \}/.test(S)
    && /el\._toastTtl = pinned \? 0 : ttl;/.test(fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf-8')) && /function _toastRun\(el\) \{\s*if \(!el\._toastTtl \|\| el\._toastTimer\) return;/.test(fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf-8'))
    && /const others = \[\.\.\.stack\.children\]\.filter\(\(c\) => c !== el && !c\.classList\.contains\('global-toast-pinned'\)\);/.test(fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf-8')) && /\.global-toast-x'\)\?\.addEventListener\('click', \(\) => \{ try \{ sessionStorage\.setItem\(hideKey, '1'\); \} catch \{ \} \}\);/.test(S),
    '_staleSay: the ONE notice PINNED (showToast\'s own flag: no timer at all; the toast stack\'s cap of 4 never drops it) with Reload as one press, never a second toast for the same reason, its ✕ hides it for THAT version (per tab)');
  const M2 = swapped(M, "      await staleLook({", "      " + RELEASE_GIVE_UP + "\n      await staleLook({", "the release's give-up planted back");
  ok(M2 !== null && !wired(M2), 'RED CONTROL: the release\'s give-up line planted back into the method is caught');
}

// A MUTANT COPY of the real module (the copy's own WeakMap and functions), one changed line each — the red controls of ⑨ / ⑨b
const mutantOf = async (name, from, to) => {
  const src = swapped(SRC, from, to, `${name} (a mutant copy of src/lib/stale-watch.js)`);
  if (src === null) return null;
  fs.writeFileSync(path.join(TMP, name), src.replace("from './boot-ladder.js'", "from './boot-ladder.mjs'"));
  return import(pathToFileURL(path.join(TMP, name)).href);
};

console.log('⑨ THE LAW — A BOX HOLDS ONLY IF THE PERSON TYPED IN IT, UNTIL GONE, EMPTY OR A LANDED SAVE (主开发\'s verdicts) — the REAL marks');
{
  // one box = a plain record the REAL marks key their WeakMap by; its facts are what app.js's reader takes off a textarea
  // (typed: wasTyped(box), text, enabled, connected). Events: 'input' (the capture listener saw the person's input) and 'carry'
  // (a composer re-filled their draft) call markTyped; 'landed' (a save PROVED a success) calls markLanded; 'failed' calls nothing.
  const scene = (M, events, o = {}, onFail = null) => {
    const el = { value: o.text ?? '' };
    for (const e of events) {
      if (e === 'input' || e === 'carry') M.markTyped(el);
      else if (e === 'landed') M.markLanded(el);
      else if (e === 'failed' && onFail) onFail(M, el);
    }
    return [{ typed: M.wasTyped(el), text: el.value, enabled: o.enabled ?? true, connected: o.connected ?? true }];
  };
  const RULES = 'every conversation follows these rules';
  const rows = [
    ['a Task Group\'s objective, prefilled, nobody typed', [], { text: RULES }, false],
    ['a Settings JSON row showing its stored value (even «null»)', [], { text: 'null' }, false],
    ['an agent\'s proposed description in a box nobody touched (any constructor)', [], { text: 'a proposed vault description' }, false],
    ['TYPED, no save marked (a site that never marks)', ['input'], { text: 'the new rules' }, true],
    ['typed, then a save that LANDED', ['input', 'landed'], { text: 'the new rules' }, false],
    ['typed, then a save that FAILED', ['input', 'failed'], { text: 'the new rules' }, true],
    ['typed, landed, typed again', ['input', 'landed', 'input'], { text: 'more rules' }, true],
    ['a composer re-built with the person\'s own words (carried)', ['carry'], { text: 'half a reply' }, true],
    ['typed, then SENT (empty)', ['input'], { text: '' }, false],
    ['typed, then the box is GONE from the page', ['input'], { text: 'x', connected: false }, false],
    ['typed in a disabled / read-only box', ['input'], { text: 'x', enabled: false }, false],
  ];
  const REAL = { markTyped, markLanded, wasTyped };
  const wrong = (M, reader = heldWords, onFail = null) => rows.filter(([, evs, o, want]) => reader(scene(M, evs, o, onFail)) !== want).map(([n]) => n);
  const bad = wrong(REAL);
  ok(!bad.length, `${rows.length} rows over the REAL markTyped / markLanded / wasTyped: ${rows.map(([n, , , w]) => `${n} ⇒ ${w ? 'holds' : 'never holds'}`).join(' · ')}`, bad.join(' | '));
  const RELEASE_READER = (bx) => bx.some((b) => b.enabled && b.connected && String(b.text || '').trim().length > 0);   // b5d292d83: any non-empty box
  const red1 = wrong(REAL, RELEASE_READER);
  ok(red1.includes(rows[0][0]) && red1.includes(rows[2][0]), `RED CONTROL — the release's reader (any non-empty box): the untouched boxes hold for ever (${red1.length} rows wrong)`, red1);
  const LANDED_MARKS = await mutantOf('mutant-landed.mjs', 'export function markLanded(box) { if (box) TYPED_BOXES.set(box, false); return box; }', 'export function markLanded(box) { if (box) TYPED_BOXES.set(box, true); return box; }');
  const red2 = LANDED_MARKS ? wrong(LANDED_MARKS) : [];
  ok(red2.includes(rows[4][0]), `RED CONTROL — a mutant copy whose markLanded marks instead of releasing: the landed save keeps holding (${red2.length} rows wrong)`, red2);
  const red3 = wrong(REAL, heldWords, (M, el) => M.markLanded(el));   // the first cure's shape: a site that marks whatever its save answered
  ok(red3.includes(rows[5][0]), 'RED CONTROL — a site that releases on a FAILED save: the typed words stop holding and a reload would lose them (the law refuses it)', red3);
  // the look over a page whose boxes nobody typed in: it reloads; under the release's reader it never does
  const untouched = [...scene(REAL, [], { text: RULES }), ...scene(REAL, [], { text: 'null' })];
  const W1 = await world({ readyAt: 30000, boxes: untouched }).run(12 * HOUR);
  const W1r = await world({ readyAt: 30000, boxes: untouched, reader: RELEASE_READER }).run(12 * HOUR);
  ok(W1.reloads.length === 1 && W1r.reloads.length === 0 && W1r.behind.some((x) => x.why === 'unsaved'),
    `a page with a Task Group and Settings open, nobody typing: the look reloads (${W1.reloads.length}); RED — under the release's reader it holds twelve hours (${W1r.reloads.length} reloads)`);
}

console.log('⑨b A SETTINGS BOX IS RELEASED ONLY WHEN THE STORE SAYS ITS POST LANDED — markLandedOnSave over the REAL SettingsManager (fetch stood in)');
{
  const { SettingsManager } = await import('../src/lib/settings.js');
  const P = 'agents.injectPreamble';
  const keep = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  let timers = [], hub = 'up';
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const debounce = async () => { while (timers.length) { const x = timers.shift(); x.fn(); await settle(); } };   // the store's 500 ms, at no wall time
  try {
    globalThis.setTimeout = (fn) => { const id = { fn }; timers.push(id); return id; };
    globalThis.clearTimeout = (id) => { timers = timers.filter((x) => x !== id); };
    globalThis.localStorage = { getItem() { return null; }, setItem() { } };
    globalThis.fetch = async (url, o = {}) => { if (o.method === 'POST' && hub === 'down') throw new Error('the hub is restarting'); return { ok: true, json: async () => ({ success: true }) }; };
    // one scene: a fresh store and a box; steps: ['type', text] (the person typed — markTyped), ['set'] (the row's write door:
    // store.set + release(store, path, box)), ['hub', 'up' | 'down'], ['post'] (the debounce fires, the POST answers), ['redraw']
    // (a search keystroke / a tab switch: the old box leaves, a NEW box shows the store's copy — carry(store, path, box))
    const run = async (M, steps, release, carry = (M2, sm2, p2, b2) => M2.carryUnsaved(sm2, p2, b2)) => {
      const sm = new SettingsManager(); let box = { value: '' }; timers = []; hub = 'up';
      for (const [k, v] of steps) {
        if (k === 'type') { box.value = v; M.markTyped(box); }
        else if (k === 'set') { sm.set(P, box.value); release(M, sm, P, box); }
        else if (k === 'redraw') { box = { value: String(sm.get(P) || '') }; carry(M, sm, P, box); }
        else if (k === 'hub') hub = v;
        else if (k === 'post') await debounce();
      }
      return heldWords([{ typed: M.wasTyped(box), text: box.value, enabled: true, connected: true }]);
    };
    const ON_SAVE = (M, sm, p, box) => M.markLandedOnSave(sm, p, box, box.value);
    const rows = [
      ['typed, set, the POST LANDED («Saved»)', [['type', 'my rules'], ['set'], ['post']], false],
      ['typed, set — the debounce has not fired (set() alone changed only this tab\'s copy)', [['type', 'my rules'], ['set']], true],
      ['typed, set, the hub restarting — the POST FAILED («Not saved»)', [['type', 'my rules'], ['hub', 'down'], ['set'], ['post']], true],
      ['failed, then set again once the hub is back — that POST landed', [['type', 'my rules'], ['hub', 'down'], ['set'], ['post'], ['hub', 'up'], ['set'], ['post']], false],
      ['typed on after the set, before the POST answered (the box no longer shows what was saved)', [['type', 'my rules'], ['set'], ['type', 'my rules, and more'], ['post']], true],
      ['landed, then typed again with no new save', [['type', 'my rules'], ['set'], ['post'], ['type', 'my rules, and more']], true],
      ['set, REDRAWN before the POST (a search keystroke), the POST landed', [['type', 'my rules'], ['set'], ['redraw'], ['post']], false],
      ['set, redrawn before the POST, the hub restarting — the POST FAILED', [['type', 'my rules'], ['hub', 'down'], ['set'], ['redraw'], ['post']], true],
      ['set, the POST failed, THEN redrawn (Manage agents: a tab switch and back)', [['type', 'my rules'], ['hub', 'down'], ['set'], ['post'], ['redraw']], true],
      ['set and landed, then redrawn (the server holds the copy)', [['type', 'my rules'], ['set'], ['post'], ['redraw']], false],
      ['never typed, redrawn', [['redraw']], false],
    ];
    const wrongOf = async (M, release, carry) => { const out = []; for (const [n, st, want] of rows) if ((await run(M, st, release, carry)) !== want) out.push(n); return out; };
    const REAL = { markTyped, markLanded, wasTyped, markLandedOnSave, carryUnsaved };
    const bad = await wrongOf(REAL, ON_SAVE);
    ok(!bad.length, `${rows.length} rows over the REAL store's save states: ${rows.map(([n, , w]) => `${n} ⇒ ${w ? 'holds' : 'released'}`).join(' · ')}`, bad.join(' | '));
    const redSet = await wrongOf(REAL, (M, sm, p, box) => M.markLanded(box));   // 864e71dc1's Settings / Manage agents sites: released at set()
    ok(redSet.includes(rows[1][0]) && redSet.includes(rows[2][0]), `RED CONTROL — released right after set() (the cure's first form): a failed POST lets the words go (${redSet.length} rows wrong)`, redSet);
    const ANY = await mutantOf('mutant-onsave.mjs', "      else if (st === 'failed') { off(); answer('failed'); }", "      else if (st === 'failed') { off(); markLanded(box); answer('failed'); }");
    const redAny = ANY ? await wrongOf(ANY, ON_SAVE) : [];
    ok(redAny.includes(rows[2][0]), `RED CONTROL — a mutant copy that releases on «failed» too: the hub's restart loses the words (${redAny.length} rows wrong)`, redAny);
    const redNoCarry = await wrongOf(REAL, ON_SAVE, () => { });   // a8f56074a: a redrawn box carried nothing
    ok(redNoCarry.includes(rows[7][0]) && redNoCarry.includes(rows[8][0]), `RED CONTROL — a redraw that carries nothing (the cure's previous form): a failed save's words, redrawn, stop holding (${redNoCarry.length} rows wrong)`, redNoCarry);
    const CARRY_SAVED = await mutantOf('mutant-carry.mjs', "  if (st === 'pending' || st === 'saving') { markTyped(box); markLandedOnSave(store, path, box, store.get(path)); }", "  if (st === 'pending' || st === 'saving' || st === 'saved') { markTyped(box); markLandedOnSave(store, path, box, store.get(path)); }");
    const redCarry = CARRY_SAVED ? await wrongOf(CARRY_SAVED, ON_SAVE) : [];
    ok(redCarry.includes(rows[9][0]), `RED CONTROL — a mutant copy that carries a LANDED copy too: words the server holds hold the reload for ever (${redCarry.length} rows wrong)`, redCarry);
    // 主开发's must (1), 04:04Z: TWO BOXES SHOW ONE SETTING (the attention block in Settings and in Channels ⚙; Manage agents' box and its row) — a landed
    // save releases a box only if what landed is THAT box's words: A saves X, then B saves Y before the answer (in the same debounce,
    // or while A's POST is on its way); the server ends with Y ⇒ A keeps holding (its X is not on the server), B is released
    const twoBoxes = async (M, inFlight) => {
      const sm = new SettingsManager(); timers = []; hub = 'up';
      const A = { value: 'X — words typed in the first box' }, B = { value: 'Y — words typed in the second box' };
      M.markTyped(A); sm.set(P, A.value); M.markLandedOnSave(sm, P, A, A.value);
      if (inFlight) timers.shift().fn();   // A's POST leaves (not answered yet) before B saves
      M.markTyped(B); sm.set(P, B.value); M.markLandedOnSave(sm, P, B, B.value);
      await settle(); await debounce();
      const held = (bx) => heldWords([{ typed: M.wasTyped(bx), text: bx.value, enabled: true, connected: true }]);
      return `A ${held(A) ? 'holds' : 'released'}, B ${held(B) ? 'holds' : 'released'}, the server ${JSON.stringify(sm.serverValue(P)).slice(1, 2)}`;
    };
    const want2 = 'A holds, B released, the server Y';
    const two = [await twoBoxes(REAL, false), await twoBoxes(REAL, true)];
    ok(two.every((x) => x === want2), `two boxes on one setting: the other box's landed words never release this one (one debounce: ${two[0]}; A's POST in flight: ${two[1]})`, two);
    const OWN = await mutantOf('mutant-own.mjs', 'const own = box.value === sent && landedIs(store, path, mine); if (own) markLanded(box);', 'const own = box.value === sent; if (own) markLanded(box);');
    const twoRed = OWN ? [await twoBoxes(OWN, false), await twoBoxes(OWN, true)] : [];
    ok(twoRed.length === 2 && twoRed.every((x) => x !== want2), `RED CONTROL — a mutant copy that releases on its own box alone (4301914b4): X released while the server holds Y (${twoRed.join(' / ')})`, twoRed);
    // A VALUE THAT IS NOT THE BOX'S TEXT (cure 4 — the read of cure 3): a JSON row's box shows text, its set() writes the parsed object;
    // Manage agents writes the trimmed words; a JSON row set to its default leaves the sparse store. Each releases on its own landed
    // words, and markLandedOnSave's ANSWER (the doors' toasts speak from it) is 'landed'; a failed POST answers 'failed' and keeps
    // holding (a box that changed first, or another door's landed words, answer 'other')
    const valueScene = async (M, { path: vp, text, value, down = false }) => {
      const sm = new SettingsManager(); timers = []; hub = down ? 'down' : 'up';
      const box = { value: text }; M.markTyped(box); sm.set(vp, value); const answer = M.markLandedOnSave(sm, vp, box, value);
      await debounce(); await settle();
      const held = heldWords([{ typed: M.wasTyped(box), text: box.value, enabled: true, connected: true }]);
      return `${held ? 'holds' : 'released'}, answer ${await answer}`;
    };
    const VROWS = [
      ['a JSON row: the box shows {"a": 1} as text, set() writes the object', { path: 'usage.dashboard', text: '{\n  "a": 1\n}', value: { a: 1 } }, 'released, answer landed'],
      ['a JSON row set to its default (null: the sparse store drops it, the server answers the same default)', { path: 'usage.dashboard', text: 'null', value: null }, 'released, answer landed'],
      ['Manage agents\' trimmed words: the box shows «my rules  », set() writes «my rules»', { path: P, text: 'my rules  ', value: 'my rules' }, 'released, answer landed'],
      ['the same JSON row while the hub restarts (the POST fails)', { path: 'usage.dashboard', text: '{\n  "a": 1\n}', value: { a: 1 }, down: true }, 'holds, answer failed'],
    ];
    const vOf = async (M) => { const out = []; for (const [n, o, want] of VROWS) { const got = await valueScene(M, o); if (got !== want) out.push(`${n}: ${got}`); } return out; };
    const vBad = await vOf(REAL);
    ok(!vBad.length, `${VROWS.length} values that are not the box's text: ${VROWS.map(([n, , w]) => `${n} ⇒ ${w}`).join(' · ')}`, vBad);
    const BY_TEXT = await mutantOf('mutant-value.mjs', 'const sent = box.value, mine = JSON.stringify(value === undefined ? null : value);', 'const sent = box.value, mine = JSON.stringify(box.value);');
    const vRed = BY_TEXT ? await vOf(BY_TEXT) : [];
    ok(vRed.length >= 3, `RED CONTROL — a mutant copy that compares the box's TEXT, not the value its set() wrote: a landed JSON row and trimmed words hold for ever (${vRed.length} rows wrong)`, vRed);
  } finally { Object.assign(globalThis, keep); }
}

console.log('⑩ A SAVE RELEASES ONLY WHEN IT LANDED — every release site reads its save\'s answer; the observed marks reach dictation and the carried drafts');
{
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
  const TD = rd('src/lib/task-detail.js');
  const gated = (src) => /\.then\(\(d\) => \{ if \(d && d\.task && d\.task\.objective === v && obj\.value === v\) markLanded\(obj\); \}/.test(src) && !/\.then\(\(\) => markLanded\(obj/.test(src);
  ok(gated(TD), 'the Task Group objective is released only when the patch answered with the group, the group stores exactly what was sent (the server cuts at its cap) and the box still holds it');
  const TD1 = swapped(TD, '.then((d) => { if (d && d.task && d.task.objective === v && obj.value === v) markLanded(obj); }', '.then(() => markLanded(obj)', 'the objective marked unconditionally');
  ok(TD1 !== null && !gated(TD1), 'RED CONTROL — the unconditional mark (a failed save releasing the words) is refused');
  const TD2 = swapped(TD, 'd && d.task && d.task.objective === v && obj.value === v', 'd && d.task && obj.value === v', 'the objective marked without what the group stored');
  ok(TD2 !== null && !gated(TD2), 'RED CONTROL — the mark that ignores what the group stored (a 20 000-character cut releasing the tail) is refused');
  const SU = rd('src/lib/settings-ui.js'), MA = rd('src/lib/manage-agents.js');
  const LC = rd('src/lib/learn-card.js');
  const FILES = { 'src/lib/settings-ui.js': SU, 'src/lib/manage-agents.js': MA, 'src/lib/learn-card.js': LC };
  // each site's line, and the form a regression would take (its RED): the release at set(), a redraw that carries nothing
  const SITES = [
    ['the Settings JSON row releases on its POST\'s answer, for its own words', 'src/lib/settings-ui.js', 'this.settings.set(path, parsed); markLandedOnSave(this.settings, path, textarea, parsed);', 'this.settings.set(path, parsed); markLanded(textarea);'],
    ['the Settings long-text row releases on its POST\'s answer, for its own words', 'src/lib/settings-ui.js', 'this.settings.set(path, text); const landed = markLandedOnSave(this.settings, path, ta, text);', 'this.settings.set(path, text); const landed = markLanded(ta);'],
    ['Manage agents\' Save releases on each POST\'s answer, for its own words', 'src/lib/manage-agents.js', 'const v = ta.value.trim(); this.settings.set(key, v); answers.push(markLandedOnSave(this.settings, key, ta, v));', 'const v = ta.value.trim(); this.settings.set(key, v); markLanded(ta);'],
    ['the long-text row\'s write door (a typed change, Save, the learn card\'s Save — the person\'s press) marks the box', 'src/lib/settings-ui.js', 'ta.value = text;\n        markTyped(ta);', 'ta.value = text;'],
    ['the learn card\'s proposed lines are marked by its press («Draft from my verdicts», a billed judgment)', 'src/lib/learn-card.js', 'if (box.value) markTyped(box);', ''],
    ['the learn card marks a box it writes by script', 'src/lib/learn-card.js', 'if (ta && ta.value !== text) { ta.value = text; markTyped(ta); }', 'if (ta && ta.value !== text) ta.value = text;'],   // stale-pins: kept (the release's / a regressed form, absent on purpose — this red plants it)
    ['the learn card says «Saved» only on the row\'s answer', 'src/lib/learn-card.js', "if (w && w.landed && typeof w.landed.then === 'function') w.landed.then(said); else said('landed');", "showToast(t('Saved — the judge reads the new block from the next message'));"],
    ['the learn card\'s toast by the answer: «Saved» on landed, «Not saved — the server did not answer» on failed, nothing on other', 'src/lib/learn-card.js', "const said = (a) => { if (a === 'landed') showToast(t('Saved — the judge reads the new block from the next message')); else if (a === 'failed') showToast(t('Not saved — the server did not answer; change it again to retry'), { type: 'error' }); };", "const said = (a) => { if (a !== 'failed') showToast(t('Saved — the judge reads the new block from the next message')); else showToast(t('Not saved — the server did not answer; change it again to retry'), { type: 'error' }); };"],
    ['«Draft from my recent decisions»: the person\'s own press puts the words in — the box is TYPED (主开发\'s must 2)', 'src/lib/settings-ui.js', "ta.value = [ta.value.trim(), r.text].filter(Boolean).join('\\n').slice(0, schema.maxLength || undefined);\n          markTyped(ta);", ''],
    ['Manage agents: ONE answer per press — the press is counted', 'src/lib/manage-agents.js', 'const press = adv.press = (adv.press || 0) + 1;', ''],
    ['Manage agents: ONE answer per press — an older press stays silent (one POST, one toast)', 'src/lib/manage-agents.js', 'if (adv.press !== press) return;', ''],
    ['the Settings JSON row, redrawn, carries an unsaved copy\'s mark', 'src/lib/settings-ui.js', "textarea.value = JSON.stringify(value, null, 2);\n      carryUnsaved(this.settings, path, textarea);", 'textarea.value = JSON.stringify(value, null, 2);'],
    ['the Settings long-text row, redrawn, carries an unsaved copy\'s mark', 'src/lib/settings-ui.js', "ta.value = String(value || '');\n      carryUnsaved(this.settings, path, ta);", "ta.value = String(value || '');"],
    ['Manage agents\' boxes, redrawn, carry an unsaved copy\'s mark', 'src/lib/manage-agents.js', "ta.value = this.settings.get(key) || '';\n          carryUnsaved(this.settings, key, ta);", "ta.value = this.settings.get(key) || '';"],
    ['a Settings text row says its save\'s outcome (the save mark: «Not saved — the server did not answer…»)', 'src/lib/settings-ui.js', "if ((schema.type === 'json' || (schema.type === 'text' && schema.multiline)) && !schema.store) controlWrap.appendChild(this._saveMark(path));", ''],
    ['Manage agents says «Saved» only when every key\'s OWN words landed', 'src/lib/manage-agents.js', "if (got.every((a) => a === 'landed')) showToast(t('Saved — new/updated sessions receive it on their next turn'));", ''],
    ['Manage agents says «Not saved — the server did not answer» only for a FAILED POST', 'src/lib/manage-agents.js', "else if (got.includes('failed')) showToast(t('Not saved — the server did not answer; press Save again'), { type: 'error' });", "else showToast(t('Not saved — the server did not answer; press Save again'), { type: 'error' });"],
    ['the long-text row\'s write door hands back its POST\'s answer (the learn card\'s toast speaks from it)', 'src/lib/settings-ui.js', 'return { ok: true, landed };', 'return { ok: true };'],   // stale-pins: kept (the release's / a regressed form, absent on purpose — this red plants it)
    ['Manage agents\' close guard asks after a failed save', 'src/lib/manage-agents.js', "|| tas.some(([key, ta]) => ta.isConnected && typeof this.settings.saveStateOf === 'function' && this.settings.saveStateOf(key) === 'failed')", ''],
  ];
  const sitesOk = (files) => SITES.filter(([, f, line]) => !files[f].includes(line)).map(([n]) => n);
  const missing = sitesOk(FILES);
  ok(!missing.length, `${SITES.length} release / carry / outcome sites read their save's answer: ${SITES.map(([n]) => n).join(' · ')}`, missing);
  const reds = SITES.map(([n, f, line, bad]) => { const red = swapped(FILES[f], line, bad, n); return [n, red !== null && sitesOk({ ...FILES, [f]: red }).includes(n)]; });
  ok(reds.every(([, caught]) => caught), `RED CONTROLS — each site in its regressed form (the release at set(), a redraw carrying nothing, the outcome unsaid) is caught: ${reds.filter(([, c]) => c).length}/${SITES.length}`, reds.filter(([, c]) => !c).map(([n]) => n));
  ok((MA.match(/showToast\(t\('Saved — new\/updated sessions receive it on their next turn'\)\)/g) || []).length === 2,
    'Manage agents\' «Saved» toast is drawn in exactly two places: the store\'s answer, and a stand-in store without save states');
  const MA1 = swapped(MA, "          // «Saved» only when the server has THIS press's words", "          showToast(t('Saved — new/updated sessions receive it on their next turn'));\n          // «Saved» only when the server has THIS press's words", "the release's toast at the press planted back");
  ok(MA1 !== null && (MA1.match(/showToast\(t\('Saved — new\/updated sessions receive it on their next turn'\)\)/g) || []).length !== 2,
    'RED CONTROL — the release\'s toast at the press (before any answer) planted back is caught');
  // every mark a file calls is IMPORTED there (the tree has no undefined-name lint: a dropped import throws only at the press)
  const IMPORTS = [['src/lib/settings-ui.js', ['markTyped', 'markLandedOnSave', 'carryUnsaved']], ['src/lib/manage-agents.js', ['markLandedOnSave', 'carryUnsaved']],
    ['src/lib/learn-card.js', ['markTyped']], ['src/lib/inbox-window.js', ['markTyped']], ['src/lib/user-todos-panel.js', ['markTyped']], ['src/lib/channel-window.js', ['markTyped']],
    ['src/lib/channel-thread-pane.js', ['markTyped']], ['src/lib/task-detail.js', ['markLanded']], ['src/lib/app.js', ['markTyped', 'wasTyped']]];
  const importLine = (src) => (src.split('\n').filter((l) => /^import \{[^}]*\} from '\.\/(utils|stale-watch)\.js';/.test(l)).join(' '));
  const imported = (src, name) => new RegExp(`[{,]\\s*${name}\\s*[,}]`).test(importLine(src));
  const missingImp = IMPORTS.flatMap(([f, names]) => names.filter((n) => !imported(rd(f), n)).map((n) => `${f}: ${n}`));
  ok(!missingImp.length, `every mark is imported where it is called (${IMPORTS.map(([f, n]) => `${f.split('/').pop()}: ${n.join(', ')}`).join(' · ')})`, missingImp);
  const impRed = IMPORTS.flatMap(([f, names]) => names.map((n) => [`${f}: ${n}`, !imported(rd(f).replace(new RegExp(`(import \\{[^}]*?)\\b${n}\\b,?\\s*`), '$1'), n)]));
  ok(impRed.every(([, c]) => c), `RED CONTROLS — each import taken out is caught: ${impRed.filter(([, c]) => c).length}/${impRed.length}`, impRed.filter(([, c]) => !c).map(([n]) => n));
  // THE PRESS MARKS THE BOX (主开发's must 2) — the behavioural leg: «Draft from my recent decisions»'s OWN press code, read off
  // settings-ui.js and run over a fetch stand-in (the server's proposal) with plain records for the box and the buttons: the box ends
  // with the person's line and the proposal, and it HOLDS; RED: the same code without its mark
  const da = SU.indexOf("        d.onclick = async () => {"), db = da >= 0 ? SU.indexOf("\n        };", da) : -1;
  const pressBody = da >= 0 && db > da ? SU.slice(SU.indexOf('{', da + 20) + 1, db) : '';
  const press = async (body) => {
    const ta = { value: 'my own first line', focus() { } }, saveBtn = { hidden: true }, d = { disabled: false }, toasts = [];
    const run = new Function('d', 'fetchJson', 't', 'showToast', 'schema', 'ta', 'saveBtn', 'markTyped', `return (async () => {${body}})();`);
    await run(d, async () => ({ ok: true, text: 'a proposed line the judge drew', read: 12, lines: ['a proposed line the judge drew'] }), (x) => x, (m) => toasts.push(m), { maxLength: 2000 }, ta, saveBtn, markTyped);
    return { held: heldWords([{ typed: wasTyped(ta), text: ta.value, enabled: true, connected: true }]), text: ta.value, saveShown: !saveBtn.hidden, toasts: toasts.length };
  };
  ok(!!pressBody, 'the drafter\'s press code is found in settings-ui.js (its anchor «        d.onclick = async () => {» up to the next «        };»)');
  const pr = pressBody ? await press(pressBody) : null;
  ok(!!pr && pr.held && pr.text === 'my own first line\na proposed line the judge drew' && pr.saveShown && pr.toasts === 1,
    `the drafter's own press over a fetch stand-in: the proposal lands after the person's line, Save shows, and the box HOLDS a stale page's reload (${JSON.stringify(pr)})`);
  const unmarked = /\n\s*markTyped\(ta\);[^\n]*/.test(pressBody) ? pressBody.replace(/\n\s*markTyped\(ta\);[^\n]*/, '') : (ok(false, 'the anchor of the red control «the drafter without its mark» is not in the press code — the control builds nothing', 'markTyped(ta);'), null);
  const prRed = unmarked ? await press(unmarked) : null;
  ok(!!prRed && !prRed.held, `RED CONTROL — the same press code without its mark: the billed proposal does not hold (${JSON.stringify(prRed)})`);
  const APP = rd('src/lib/app.js'), VI = rd('src/lib/voice-input.js');
  const dictation = (app, vi) => /if \(!e\.isTrusted && !e\[Symbol\.for\('vibespace\.voice\.spoken'\)\]\) return; T\.at = Date\.now\(\);/.test(app)
    && /const SPOKEN = Symbol\.for\('vibespace\.voice\.spoken'\);/.test(vi)
    && /const fire = \(change, spoken = true\) => \{ const ev = new Event\('input', \{ bubbles: true \}\); if \(spoken\) ev\[SPOKEN\] = true; el\.dispatchEvent\(ev\);/.test(vi)
    && (vi.match(/fire\(false, false\);/g) || []).length === 2;
  ok(dictation(APP, VI), 'the microphone\'s words (an unfocused box, a script-made event) reach the ONE capture listener marked vibespace.voice.spoken — they hold like typed words; its Undo is no new words (a plain Event, as every other listener always saw)');
  const VI1 = swapped(VI, "const ev = new Event('input', { bubbles: true }); if (spoken) ev[SPOKEN] = true; el.dispatchEvent(ev);", "el.dispatchEvent(new Event('input', { bubbles: true }));", "the release's unmarked input event");   // stale-pins: kept (the release's / a regressed form, absent on purpose — this red plants it)
  ok(VI1 !== null && !dictation(APP, VI1), 'RED CONTROL — the release\'s unmarked input event (untrusted) is refused: dictated words would never hold');
  const APP1 = swapped(APP, "if (!e.isTrusted && !e[Symbol.for('vibespace.voice.spoken')]) return;", 'if (!e.isTrusted) return;', 'a listener that reads only trusted events');
  ok(APP1 !== null && !dictation(APP1, VI), 'RED CONTROL — a listener that reads only trusted events (864e71dc1) is refused');
  const CARRIES = [
    ['the channel composer', 'src/lib/channel-window.js', /ta\.value = typed;\n\s*if \(typed\) markTyped\(ta\);/, 'if (typed) markTyped(ta);'],
    ['the thread reply', 'src/lib/channel-thread-pane.js', /ta\.value = drafts\.get\(cur\.key\) \|\| '';\n\s*if \(ta\.value\) markTyped\(ta\);/, 'if (ta.value) markTyped(ta);'],
    ['the Inbox reply', 'src/lib/inbox-window.js', /ta\.value = model\.drafts\.get\(id\) \|\| '';\n\s*if \(ta\.value\) markTyped\(ta\);/, 'if (ta.value) markTyped(ta);'],
    ['the For-you reply', 'src/lib/user-todos-panel.js', /ta\.value = drafts\.get\(i\.id\) \|\| '';\n\s*if \(ta\.value\) markTyped\(ta\);/, 'if (ta.value) markTyped(ta);'],
  ].map(([n, f, re, line]) => [n, rd(f), re, line]);
  ok(CARRIES.every(([, src, re]) => re.test(src)), `the composers that rebuild with the person's own words carry the mark: ${CARRIES.map(([n]) => n).join(', ')}`);
  const carryReds = CARRIES.map(([n, src, re, line]) => { const red = swapped(src, line, '', `${n} without its carry`); return [n, red !== null && !re.test(red)]; });
  ok(carryReds.every(([, c]) => c), `RED CONTROLS — each composer with its carry taken out is caught: ${carryReds.filter(([, c]) => c).length}/${CARRIES.length}`, carryReds.filter(([, c]) => !c).map(([n]) => n));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
