#!/usr/bin/env node
// INDEX-mode minimap jump landing (inc-msnyti7z-c5sb: "minimap 跳转又不准" on a
// tool-heavy 4.4MB remote session). The incident trace showed the exact
// failure: jumpToIndex landed (scroll→145), then the 180ms-debounced
// run-collapse pass + content-visibility height resolution yanked the view to
// scrollTop 0 and a spurious extendBottom fired — the user ends up ~20
// messages before the one they clicked. The teleport (gap-mode) path got the
// full landing machinery in 2.111.x; index mode kept a single-rAF
// scrollIntoView. This drives a REAL view-only ChatView over a tool-heavy
// SMALL transcript (below the seek threshold → index mode, like the incident)
// and asserts the clicked message IS on screen ~centered after everything
// settles — across consecutive jumps.
// §3b (lane minimap-person-rows; the owner 2026-11-04: «这个消息历史里一大堆系统消息混在里面很难检索»): the outline's
// message list is the PERSON's conversation — a second view-only conversation of 20 user turns (6 the person's, 14
// nobody typed, real record shapes from scripts/fixtures/message-origin) opens folded: the person's 6 rows, ONE chip
// "×14" first, the placeholder counting 6, the filter finding only the person's words; the chip lists all 20 (the
// folded ones dimmed) and finds their words; the choice is kept per device; the strip keeps all 20 markers.
// MINIMAP_SHOTS=<dir> writes the folded / shown popover as PNGs (the lane's before/after pair).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, fixtureSid, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { gutterDragger } from './gutter-drag.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const root = mintRoot('mmjump-smoke'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
const CWD = scratch('mmjump-test');
const SID = fixtureSid('2');
// ISOLATED $HOME (2026-09-09) — see the essay in test-chat-paging.mjs and
// src/fixture-guard.js. This suite's synthetic transcript used to land in the
// developer's REAL ~/.claude/projects (the spawned server inherited HOME and
// can only discover what lives under its own home), where the machine's
// PRODUCTION instance listed it as a conversation and ingested its fabricated
// usage: 3,600 permanent ledger rows for this session id (of the instance's 79,533 fabricated rows as of 2026-09-09).
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const PROJ = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. tool-heavy transcript BELOW the seek threshold (index mode) ──
{
  const lines = [];
  let t = Date.now() - 86400e3;
  const ts = () => new Date((t += 20e3)).toISOString();
  let n = 0;
  const push = (o) => { lines.push(JSON.stringify(o)); };
  for (let turn = 0; turn < 120; turn++) {
    push({ type: 'user', message: { role: 'user', content: `question ${turn}: MARKER_Q${turn}` }, uuid: `u-${n++}`, timestamp: ts() });
    // a foldable Bash run (the incident window folded most of the messages
    // above the target — the fold moving the target is the failure mechanism)
    for (let b = 0; b < 5; b++) {
      const tid = `t-${turn}-${b}`;
      push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${turn}.${b}` } }], usage: { input_tokens: 5, output_tokens: 3 } }, uuid: `a-${n++}`, timestamp: ts() });
      push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `output ${turn}.${b}\n` + 'tool output line adding height 0123456789\n'.repeat(20 + ((turn + b) % 4) * 30) }] }, uuid: `tr-${n++}`, timestamp: ts() });
    }
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${turn}: MARKER_A${turn}\n` + 'prose line that wraps and adds height\n'.repeat(2 + (turn % 7) * 3) }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `af-${n++}`, timestamp: ts() });
  }
  fs.mkdirSync(PROJ, { recursive: true });
  fs.mkdirSync(CWD, { recursive: true });
  fs.writeFileSync(path.join(PROJ, `${SID}.jsonl`), lines.join('\n') + '\n');
  const sz = fs.statSync(path.join(PROJ, `${SID}.jsonl`)).size;
  console.log(`  transcript: ${lines.length} records, ${(sz / 1e6).toFixed(1)}MB (index mode)`);
  if (sz > 30e6) { console.error('fixture unexpectedly huge — would flip into gap mode'); process.exit(1); }
}

// ── 1b. THE PERSON'S ROWS: 20 user turns — 6 the person's, 14 nobody typed (real record shapes) ──
const SID2 = fixtureSid('3');
const PR = { person: 6, other: 14 };
{
  const recs = fs.readFileSync(path.join(repo, 'scripts/fixtures/message-origin/claude-user-records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    .filter((r) => !/^mo-attachment-/.test(r.uuid))   // page images make no turn
    .filter((r) => !/^mo-(noturn|interrupt)-|^mo-typed-(picture|tasktag|compactpaste)$/.test(r.uuid));   // r2's cross-builder shapes (test-message-origin judges them) — this leg keeps its 20-turn conversation
  const like = (uuid, text, extra = {}) => { const r = JSON.parse(JSON.stringify(recs.find((x) => x.uuid.startsWith(uuid)))); r.uuid = uuid + '-b'; const c = r.message.content; if (Array.isArray(c)) c[0].text = text; else r.message.content = text; return Object.assign(r, extra); };
  const typedIdx = recs.findIndex((r) => r.uuid === 'mo-typed-2');
  recs.splice(typedIdx, 0,
    like('mo-typed-1', 'MARKER_PERSON_3 please also check the signup page'),
    like('mo-note-1', 'Stop hook feedback:\nVibeSpace bookkeeping before you stop (this note is from VibeSpace, not from the user): set your CURRENT state first.'),
    like('mo-peer-group', recs.find((r) => r.uuid === 'mo-peer-group').message.content.replace('please take the next lane', 'the other lane is merged')),
    like('mo-notice-1', recs.find((r) => r.uuid === 'mo-notice-1').message.content.replace('nightly-build finished (exit 0, 4 min)', 'weekly-report finished (exit 0, 1 min)')),
    like('mo-notification-task', recs.find((r) => r.uuid === 'mo-notification-task').message.content.replace('npm test', 'npm run lint')),
    like('mo-typed-2', 'MARKER_PERSON_4 and the footer links'));
  const lines = [];
  let t2 = Date.now() - 7200e3;
  // each turn: the user record, a tool call + its result, the answer — > 50 records, so a view-only chat asks for its turn map
  recs.forEach((r, i) => {
    const at = () => new Date((t2 += 10e3)).toISOString();
    lines.push(JSON.stringify({ ...r, timestamp: at() }));
    lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_pt${i}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: `pt-${i}`, name: 'Bash', input: { command: `echo ${i}` } }], usage: { input_tokens: 5, output_tokens: 3 } }, uuid: `pt-${i}`, timestamp: at() }));
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `pt-${i}`, content: `${i}\n` }] }, uuid: `pr-${i}`, timestamp: at() }));
    lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_pa${i}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `reply ${i}` }], usage: { input_tokens: 5, output_tokens: 3 } }, uuid: `pa-${i}`, timestamp: at() }));
  });
  if (recs.length !== PR.person + PR.other) { console.error(`person-rows fixture: ${recs.length} user records, not ${PR.person + PR.other}`); process.exit(1); }
  fs.writeFileSync(path.join(PROJ, `${SID2}.jsonl`), lines.join('\n') + '\n');
}

// ── 2. throwaway server + chrome ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,1000',
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('mmjump-chrome')}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  for (const d of [scratch('mmjump-chrome'), CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
// SIGNALS TOO: hub-boot.mjs armed SIGTERM / SIGINT / SIGHUP at the mint — the same end runs, and the suite dies by the signal.
await hub.ready();

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 40, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
await sleep(1500);

// ── 3. open the view + run consecutive index jumps, assert each landing ──
const opened = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID}', '${CWD}', 'minimap jump test');
  for (let i = 0; i < 50; i++) {
    const list = document.querySelector('.chat-message-list');
    if (list && list.querySelectorAll('.chat-msg').length > 5) break;
    await sleep(300);
  }
  await sleep(1500);
  const view = [...(window.app.sessions?.values() || [])].find((v) => v && v._messageList);
  if (!view) return { ok: false };
  window.__view = view;
  return { ok: true, total: view._total };
})()`);
check('view-only chat opened (index mode)', gateOf(opened?.ok) && opened.total > 100, JSON.stringify(opened));

// one landing check: jump to idx, wait past ALL settle timers (folds at
// 180ms, cv resolution ~1s, re-centers through 750ms), then measure where
// the target actually sits in the viewport
const land = async (frac) => await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const view = window.__view;
  const idx = Math.floor(view._total * ${frac});
  await view.jumpToIndex(idx);
  await sleep(1600);
  const list = view._messageList;
  const rel = idx - view._windowStart;
  const els = list.querySelectorAll('.chat-msg:not(.chat-gap-msg)');
  if (rel < 0 || rel >= els.length) return { idx, err: 'target not in window', rel, n: els.length };
  const el = els[rel];
  const lr = list.getBoundingClientRect();
  const rc = el.getBoundingClientRect();
  const centerOff = (rc.top + rc.height / 2) - (lr.top + lr.height / 2);
  const visible = rc.bottom > lr.top && rc.top < lr.bottom;
  const marker = (el.textContent.match(/MARKER_[AQ]\\d+/) || [null])[0];
  return { idx, visible, centerOff: Math.round(centerOff), vh: Math.round(lr.height), st: Math.round(list.scrollTop), marker, msgId: el.dataset.msgId };
})()`);

const seenTargets = [];
for (const frac of [0.6, 0.25, 0.85]) {
  const r = await land(frac);
  const okLand = r && !r.err && r.visible && Math.abs(r.centerOff) < r.vh * 0.5;
  check(`jump to ${Math.round(frac * 100)}% lands ON the clicked message after settle (off=${r?.centerOff}px, st=${r?.st}, ${r?.marker || r?.msgId})`, verdictOf(okLand), JSON.stringify(r));
  seenTargets.push(r?.msgId || r?.marker);
  // the incident's terminal state: view yanked to scrollTop 0 (window top)
  check(`jump to ${Math.round(frac * 100)}% did not get yanked to the window top`, gateOf(r) && r.st > 0, `st=${r?.st}`);
}

check('the three jumps measured three DISTINCT targets', new Set(seenTargets).size === 3, JSON.stringify(seenTargets));

// ── 3c. THE JUMP HOLD LETS GO (r1175): a jump's landing holds its target for ~750 ms (_scrollElStable — 12 frames and
// re-centres at 180/400/750 ms while content-visibility resolves heights). It had no stop: a person who scrolled within a
// second of a jump was put back on its target up to three times. Now the reader's own act since the landing lets it go
// (_navigatedSince, or a press on the scrollbar — `_gutterPressAt`: a drag's scrolls are not stamped while the hold's
// guard stands). Drawn with TRUSTED input (CDP), each at +220 ms (after the 180 ms re-centre, before the 400 ms one): a
// wheel, a scrollbar drag (the minimap off — with it on, its own drag is a navigation; pressed through scratch.mjs's
// gutterDragger (scripts/gutter-drag.mjs), the door that checks the press landed on the list's own gutter), a PageDown in the list — each toward the
// side with more room. The view must stay where the person put it: the target's offset from the hold's aim at the act's end
// is the same at 1.7 s, NOT back at the aim. THE RED: the same three over the same hold read out of chat-view-seek.js with
// only its stop blinded (`const letGo = () => false;` — the base's hold): put back on the target.
function holdKit() {
  const view = window.__view, list = view._messageList;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const middle = () => { const r = list.getBoundingClientRect(); return { r, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const off = (el) => (el && el.isConnected ? Math.round(el.getBoundingClientRect().top - middle().y) : null);   // the hold's own aim: the target's top at the middle
  const prep = ({ bare = false, focus = false } = {}) => { if (bare) list.classList.remove('chat-minimap-active'); if (focus) list.focus({ preventScroll: true }); };
  let target = null, anchor = null, at = 0;
  window.__hold = {
    async jump(frac, how) {
      prep(how);
      const idx = Math.floor(view._total * frac);
      const ok = await view.jumpToIndex(idx);
      at = view._lastJumpAt || 0;
      target = list.querySelectorAll('.chat-msg:not(.chat-gap-msg)')[idx - view._windowStart] || null;
      return { idx, ok, age: Date.now() - at, off: off(target) };
    },
    async until(ms, how) {
      prep(how);
      const wait = at + ms - Date.now(); if (wait > 0) await sleep(wait);
      const m = middle(), hitEl = document.elementFromPoint(m.x, m.y);
      const st = list.scrollTop, sh = list.scrollHeight, ch = list.clientHeight;
      return { x: Math.round(m.x), y: Math.round(m.y), top: m.r.top, bottom: m.r.bottom, right: m.r.right, st, sh, ch, sbw: list.offsetWidth - list.clientWidth,
        dir: sh - ch - st >= st ? 1 : -1, hit: !!hitEl && list.contains(hitEl), focused: document.activeElement === list, age: Date.now() - at, off: off(target) };   // toward the side with more room
    },
    onBar() { return !!view._pointerDownOnScrollbar; },   // (read while the door holds the press)
    async settled() {
      let last = list.scrollTop, still = 0;
      for (let i = 0; i < 45 && still < 4; i++) { await frame(); if (Math.abs(list.scrollTop - last) < 0.5) still++; else { still = 0; last = list.scrollTop; } }
      const m = middle(), hitEl = document.elementFromPoint(m.x, m.y);
      anchor = (hitEl && hitEl.closest && hitEl.closest('.chat-msg')) || null;
      return { age: Date.now() - at, off: off(target), anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : null };
    },
    async final(ms) {
      const wait = at + ms - Date.now(); if (wait > 0) await sleep(wait);
      return { age: Date.now() - at, off: off(target), anchorTop: anchor && anchor.isConnected ? Math.round(anchor.getBoundingClientRect().top) : null, barUp: !view._pointerDownOnScrollbar };
    },
    blind(src) { view._scrollElStable = new Function(`return ({ ${src} })._scrollElStable;`)(); return Object.prototype.hasOwnProperty.call(view, '_scrollElStable'); },
    unblind() { delete view._scrollElStable; return !Object.prototype.hasOwnProperty.call(view, '_scrollElStable') && typeof view._scrollElStable === 'function'; },
  };
  return { ok: !!list };
}
{
  const SEEKS = fs.readFileSync(path.join(repo, 'src/lib/chat-view-seek.js'), 'utf8');
  const a = SEEKS.indexOf('    _scrollElStable(el, '), b = SEEKS.indexOf('    async _seekTeleport(line) {');
  const real = a >= 0 && b > a ? SEEKS.slice(a, b).trim().replace(/,$/, '') : '';
  const LETGO = /\n    const letGo = \(\) => [^\n]+\n/;
  const blind = real.replace(LETGO, '\n    const letGo = () => false;\n');
  check('3c: the jump hold is read out of chat-view-seek.js and its stop found (the red control blinds exactly that line)', !!real && gateOf(LETGO.test(real)) && blind !== real && verdictOf(/setTimeout\(\(\) => \{ if \(!letGo\(\)\) center\(\);/.test(real)), real.slice(0, 160));
  const kit = await evaljs(`(${holdKit.toString()})()`);
  const wheel = (x, y, deltaY) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY });
  const gutterDrag = gutterDragger({ evalJs: evaljs, cdp, sleep });   // THE scrollbar's door (scripts/gutter-drag.mjs): it presses the list's own gutter and checks where the press landed
  const key = async (k, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  };
  const scene = async (act, frac) => {
    const how = JSON.stringify({ bare: act === 'drag', focus: act === 'key' });
    const land = await evaljs(`window.__hold.jump(${frac}, ${how})`);
    const g = await evaljs(`window.__hold.until(220, ${how})`);
    let onBar = null, drag = null;
    if (act === 'wheel') await wheel(g.x, g.y, g.dir * 480);
    else if (act === 'key') await key(g.dir > 0 ? 'PageDown' : 'PageUp', g.dir > 0 ? 34 : 33);
    else {
      // the thumb moved by about 520 px of content (the track's ratio), toward the side with more room
      const track = g.bottom - g.top, thumb = Math.max(track * g.ch / g.sh, 2 * g.sbw);
      const dy = g.dir * Math.max(4, Math.round(520 * (track - thumb) / Math.max(1, g.sh - g.ch)));
      drag = await gutterDrag('window.__view._messageList', { dy, whileHeld: () => evaljs('window.__hold.onBar()') });
      onBar = drag.held;
    }
    const done = await evaljs('window.__hold.settled()');
    const fin = await evaljs('window.__hold.final(1700)');
    // inside the hold: after its 180 ms re-centre, before its LAST (750 ms — the hold's own constant): the base's hold puts
    // the view back at 400 and again at 750, so an act that a slow machine delays past 400 still meets the 750 one
    const inHold = g.age >= 180 && g.age < 750 - 50;
    const reached = act === 'wheel' ? g.hit : act === 'key' ? g.focused : !!(drag && drag.ok) && onBar === true;
    // where the person put it: the target's offset from the hold's aim at the act's end, the same at 1.7 s; the hold's aim is 0
    const moved = done.off != null && land.off != null && Math.abs(done.off - land.off) >= 120;
    const stayed = done.off != null && fin.off != null && Math.abs(fin.off - done.off) <= 40;
    const back = fin.off != null && Math.abs(fin.off) <= 40;
    const notBack = fin.off != null && Math.abs(fin.off) >= 120;
    return { act, inHold, reached, moved, stayed, back, notBack, land, g: { age: g.age, dir: g.dir, sbw: g.sbw, hit: g.hit, focused: g.focused, st: Math.round(g.st), sh: g.sh, ch: g.ch, off: g.off }, onBar, drag, done, fin };
  };
  const ACTS = [['wheel', 0.45, 'a wheel'], ['key', 0.55, 'a PageDown in the list'], ['drag', 0.65, 'a scrollbar drag']];
  const green = []; for (const [act, frac] of ACTS) green.push(await scene(act, frac));
  const blinded = kit?.ok && await evaljs(`window.__hold.blind(${JSON.stringify(blind)})`);
  const red = []; if (blinded) for (const [act, frac] of ACTS) red.push(await scene(act, frac));
  const restored = await evaljs('window.__hold.unblind()');
  console.log(`  [3c] ${JSON.stringify({ green, red }).slice(0, 3000)}`);
  ACTS.forEach(([act, , words], i) => {
    const r = green[i];
    check(`3c: ${words} inside the jump's hold (+${r?.g.age} ms) — the view stays where the person put it (the target ${r?.land.off}→${r?.done.off} px from the hold's aim at the act's end, ${r?.fin.off} px at 1.7 s)`,
      !!r && gateOf(r.inHold) && gateOf(r.reached) && gateOf(r.moved) && gateOf(r.stayed) && verdictOf(r.notBack), JSON.stringify(r));
  });
  check('3c RED: the hold with its stop blinded (the base\'s hold) installed on the view', blinded === true && red.length === ACTS.length, JSON.stringify({ kit, blinded }));
  ACTS.forEach(([act, , words], i) => {
    const r = red[i];
    check(`3c RED (r1175): ${words} inside the BLINDED hold (+${r?.g.age} ms) is undone — put back on the jump's target (${r?.fin.off} px from the hold's aim at 1.7 s)`,
      !!r && gateOf(r.inHold) && gateOf(r.reached) && verdictOf(r.back), JSON.stringify(r));
  });
  check('3c: the view\'s own hold is back after the red (the blinded copy removed)', restored === true, String(restored));
}

// ── 3b. THE PERSON'S ROWS: the outline lists what the person said; the rest waits behind ONE chip ──
{
  const KEY = 'vibespace.minimap.showOther';
  const opened2 = await evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try { localStorage.removeItem('${KEY}'); } catch {}
    window.app.viewSession('${SID2}', '${CWD}', 'person rows test');
    const userTurns = (v) => (v && v._chatMinimap && v._chatMinimap._turnMap ? v._chatMinimap._turnMap.filter((x) => x.role === 'user').length : 0);
    for (let i = 0; i < 60 && !window.__pr; i++) {
      window.__pr = [...(window.app.sessions?.values() || [])].find((v) => v && v !== window.__view && userTurns(v) === ${PR.person + PR.other}) || null;
      if (!window.__pr) await sleep(300);
    }
    return window.__pr ? { ok: true, turns: userTurns(window.__pr) } : { ok: false, views: [...(window.app.sessions?.values() || [])].map(userTurns) };
  })()`);
  check(`3b: the person-rows conversation opened (${PR.person + PR.other} user turns on the minimap)`, verdictOf(opened2?.ok), JSON.stringify(opened2));
  // the popover's state, read the way a person sees it (the rows' texts, the chip's words, the placeholder)
  const READ = `const pop = document.querySelector('.chat-minimap-toc');
    const rows = pop ? [...pop.querySelectorAll('.chat-minimap-toc-list .chat-minimap-toc-row')].filter((r) => r.querySelector('.chat-minimap-toc-text')) : [];
    const chip = pop ? pop.querySelector('.chat-minimap-toc-fold') : null;
    const st = { open: !!pop, rows: rows.map((r) => r.querySelector('.chat-minimap-toc-text').textContent), dimmed: rows.filter((r) => r.classList.contains('other')).length,
      chip: chip ? chip.textContent : null, chipFirstRow: !!chip && chip.previousElementSibling?.classList.contains('chat-minimap-toc-filter') && chip.nextElementSibling?.classList.contains('chat-minimap-toc-list'),
      pressed: chip ? chip.getAttribute('aria-pressed') : null, placeholder: pop ? pop.querySelector('.chat-minimap-toc-filter').placeholder : null, stored: localStorage.getItem('${KEY}') };`;
  const step = (body) => evaljs(`(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const mm = window.__pr._chatMinimap;
    const typeIn = async (q) => { const f = document.querySelector('.chat-minimap-toc-filter'); if (!f) return; f.value = q; f.dispatchEvent(new Event('input')); await sleep(60); };
    const open = async () => { document.querySelectorAll('.chat-minimap-toc').forEach((p) => p.remove()); mm._tocBtn.click(); await sleep(250); };
    ${body} })()`).catch((e) => ({ err: String(e && e.message).slice(0, 300) }));   // a tree without the fold reds BY NAME below, never a crash
  const SHOTS = process.env.MINIMAP_SHOTS || '';
  const shot = async (name) => {
    if (!SHOTS) return;
    const r = await evaljs(`(() => { const p = document.querySelector('.chat-minimap-toc'); if (!p) return null; const b = p.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
    if (!r) return;
    const png = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(png.result.data, 'base64'));
    console.log(`  (screenshot ${path.join(SHOTS, name + '.png')})`);
  };
  const folded = await step(`await open(); ${READ} return st;`);
  await shot('list-folded');
  const findPerson = await step(`await typeIn('signup'); ${READ} await typeIn(''); return st.rows;`);
  const findOther = await step(`await typeIn('merged'); ${READ} await typeIn(''); return st.rows;`);
  const shown = await step(`document.querySelector('.chat-minimap-toc-fold')?.click(); await sleep(120); ${READ} return st;`);
  await shot('list-shown');
  const findOtherShown = await step(`await typeIn('merged'); ${READ} await typeIn(''); return st.rows;`);
  const kept = await step(`await open(); ${READ} return st;`);
  const back = await step(`document.querySelector('.chat-minimap-toc-fold')?.click(); await sleep(120); ${READ} const strip = mm._minimap.querySelectorAll('.chat-minimap-marker').length; document.querySelectorAll('.chat-minimap-toc').forEach((p) => p.remove()); return { ...st, strip };`);
  const PERSON_WORDS = ['Please fix the login page', 'B — tonight is fine', '/compact', 'MARKER_PERSON_3', 'MARKER_PERSON_4', 'Thanks — now the signup page'];
  check(`3b: opened FOLDED — the list shows the person's ${PR.person} rows, nothing else (${folded?.rows?.length})`,
    folded?.rows?.length === PR.person && verdictOf(PERSON_WORDS.every((w) => folded.rows.some((r) => r.includes(w)))), JSON.stringify(folded?.rows));
  check(`3b: ONE chip, the list's first row, counts the folded rows ("${folded?.chip}")`, !!folded?.chip && gateOf(folded.chip.includes('×' + PR.other)) && gateOf(folded.chipFirstRow) && folded.pressed === 'false', JSON.stringify(folded));
  check(`3b: the placeholder counts what is listed ("${folded?.placeholder}")`, gateOf(new RegExp('\\b' + PR.person + '\\b').test(folded?.placeholder || '')) && !new RegExp('\\b' + (PR.person + PR.other) + '\\b').test(folded?.placeholder || ''), folded?.placeholder);
  check('3b: folded, the filter searches the person\'s rows — a word of theirs is found, a folded row\'s word is not', findPerson?.length === 2 && findOther?.length === 0, JSON.stringify({ findPerson, findOther }));
  check(`3b: the chip lists all ${PR.person + PR.other} rows, the ${PR.other} folded ones dimmed, and says so (pressed, the placeholder counts ${PR.person + PR.other})`,
    shown?.rows?.length === PR.person + PR.other && shown.dimmed === PR.other && shown.pressed === 'true' && verdictOf(new RegExp('\\b' + (PR.person + PR.other) + '\\b').test(shown.placeholder || '')), JSON.stringify(shown));
  check('3b: with the chip on, the filter finds a folded row\'s word too (another session\'s message)', findOtherShown?.length === 1 && verdictOf(/merged/.test(findOtherShown[0])), JSON.stringify(findOtherShown));
  check('3b: the choice is kept per device — reopened, the list is still all rows (localStorage)', kept?.rows?.length === PR.person + PR.other && kept.pressed === 'true' && kept.stored === '1', JSON.stringify({ rows: kept?.rows?.length, pressed: kept?.pressed, stored: kept?.stored }));
  check('3b: …and folding again lists the person\'s rows and remembers that', back?.rows?.length === PR.person && back.stored === '0', JSON.stringify({ rows: back?.rows?.length, stored: back?.stored }));
  check(`3b: the strip keeps a marker for every one of the ${PR.person + PR.other} turns (only the list folds)`, back?.strip === PR.person + PR.other, `markers=${back?.strip}`);
}

// ── 4. THE REAL HOME IS UNTOUCHED (see test-chat-paging.mjs §5 for the rule).
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s OWN project dir is not among them (isolated home)',
    !after.some((d) => d.name === path.basename(PROJ)), path.basename(PROJ));
  check('the fixture really was written (the isolation did not just skip the work)',
    verdictOf(fs.existsSync(path.join(PROJ, `${SID}.jsonl`))), path.join(PROJ, `${SID}.jsonl`));
}

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
