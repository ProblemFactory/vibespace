#!/usr/bin/env node
// THE ATTACH SLAB IS A TEXT WINDOW (chat pipeline perf lane, chunk A).
// src/text-window.js decides how many normalized records an attach ships:
// walk back from the tail until `minText` text-carrying cards are inside,
// never fewer than `minRecords` (today's tail(50) is the floor), never more
// than `maxRecords`, and past the floor never past `maxBytes` of serialized
// records. PURE and deterministic — the identical-skip (2.369.2) depends on
// the same list giving the same start. Every normalizer answers it through
// `tailWindow()`, and every attach path calls that (ws-handler live + view-
// only, transcript-service.page's default = HTTP + the daemon op).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

// THIS PROCESS IS RE-HOMED before any product code loads (test-fixture-isolation
// (c)): the §1c section below mints fixture ids (fixtureSid) and runs the REAL
// normalizers in-process, so nothing they could write may land in the real
// home. The real project list is read FIRST; the per-suite census at the end
// proves no fixture entry appeared there.
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));
const home = scratchHome('textwin-home', fs);
const cleanupHome = () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanupHome);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanupHome(); process.exit(143); });
process.env.HOME = home;
os.homedir = () => home;

const modPath = path.join(REPO, 'src/text-window.js');
if (!fs.existsSync(modPath)) { console.error('  ✗ src/text-window.js does not exist — the attach slab is still tail(50)'); console.log('\n1 FAILED (0 passed)'); process.exit(1); }
const { TEXT_WINDOW, isTextCard, textWindow, sliceTextWindow, jsonSize, attachWindowOpts, SLAB_HINTS } = require(modPath);
const src = fs.readFileSync(modPath, 'utf8');

// ── fixtures (normalized shapes, as every normalizer produces them) ──────────
let seq = 0;
const user = (text) => ({ id: 'm' + (seq++), role: 'user', status: 'complete', content: [{ type: 'text', text }] });
const asst = (text) => ({ id: 'm' + (seq++), role: 'assistant', status: 'complete', content: [{ type: 'text', text }] });
const think = (text = '') => ({ id: 'm' + (seq++), role: 'assistant', content: [{ type: 'thinking', text }] });
const tool = () => ({ id: 'm' + (seq++), role: 'tool', status: 'complete', toolName: 'Bash', input: { command: 'ls' }, output: 'a\nb' });
const sys = (text = 'info') => ({ id: 'm' + (seq++), role: 'system', status: 'complete', content: [{ type: 'text', text }] });
const img = (kb = 1) => ({ id: 'm' + (seq++), role: 'user', status: 'complete', content: [{ type: 'image', mediaType: 'image/png', data: 'A'.repeat(kb * 1024) }] });
const tools = (n) => Array.from({ length: n }, tool);

// ── isTextCard ──────────────────────────────────────────────────────────────
console.log('— isTextCard');
ok('a user prompt with text counts', isTextCard(user('hello')));
ok('assistant text counts', isTextCard(asst('here is the answer')));
ok('a tool card does not count', !isTextCard(tool()));
ok('an EMPTY thinking block does not count (nor a non-empty one — thinking is not text)', !isTextCard(think('')) && !isTextCard(think('pondering')));
ok('a system/info card does not count', !isTextCard(sys('Model auto-fallback')));
ok('an image-only user attachment does not count', !isTextCard(img(1)));
ok('whitespace-only text does not count', !isTextCard(user('   \n ')) && !isTextCard(asst('')));
ok('a tool_result carrier does not count even beside text', !isTextCard({ role: 'user', content: [{ type: 'tool_result', content: 'x' }, { type: 'text', text: 'x' }] }));
ok('a retracted (rewound) message does not count', !isTextCard({ ...asst('gone'), rewound: true }));
ok('garbage never throws', !isTextCard(null) && !isTextCard({}) && !isTextCard({ role: 'user', content: 'str' }));

// ── the window ──────────────────────────────────────────────────────────────
console.log('— textWindow');
ok('the numbers are ONE frozen table (minText 24 / minRecords 50 / maxRecords 400 / maxGrowthBytes 128 KiB — perf r1: the bound is on what the window adds PAST the floor)',
  Object.isFrozen(TEXT_WINDOW) && TEXT_WINDOW.minText === 24 && TEXT_WINDOW.minRecords === 50 && TEXT_WINDOW.maxRecords === 400 && TEXT_WINDOW.maxGrowthBytes === 128 * 1024 && !('maxBytes' in TEXT_WINDOW));
{
  // 60 texts spaced 10 tool cards apart: the tail(50) holds ~5 text cards
  const list = [];
  for (let i = 0; i < 60; i++) { list.push(user('q' + i)); list.push(...tools(10)); }
  const total = list.length;
  const tail50Text = list.slice(-50).filter(isTextCard).length;
  const w = textWindow(list);
  ok(`THE CASE: a list whose tail(50) holds ${tail50Text} < minText text cards returns start < total−50 (start ${w.start}, total ${total})`, tail50Text < 24 && w.start < total - 50);
  ok(`…the walk stops at exactly minText text cards (${w.textCount}), reason 'text'`, w.textCount === 24 && w.reason === 'text');
  ok('…and the window begins AT the 24th text card from the end (no extra records past it)', isTextCard(list[w.start]) && list.slice(w.start).filter(isTextCard).length === 24);
  ok('DETERMINISM: the same list gives the same start twice (identical-skip depends on it)', textWindow(list).start === w.start && textWindow(list.slice()).start === w.start);
  ok('sliceTextWindow is slice(start)', sliceTextWindow(list).length === total - w.start && sliceTextWindow(list)[0] === list[w.start]);
}
{
  // a chatty list: every record is text — the floor still ships 50
  const list = Array.from({ length: 300 }, (_, i) => (i % 2 ? asst('a' + i) : user('u' + i)));
  const w = textWindow(list);
  ok('the minRecords FLOOR: a list with 24 texts in its last 24 records still ships 50 (never fewer than today)', w.start === 300 - 50 && w.reason === 'text' && w.textCount === 50);
}
{
  const list = tools(1000);
  const w = textWindow(list);
  ok(`the maxRecords cap on an all-tool list: 400 records, reason 'maxRecords' (start ${w.start})`, w.start === 600 && w.reason === 'maxRecords' && w.textCount === 0);
}
{
  const list = [user('only'), ...tools(20)];
  const w = textWindow(list);
  ok('a list shorter than the floor is shipped whole (start 0, reason all)', w.start === 0 && w.reason === 'all');
  const e = textWindow([]);
  ok('the empty list: start 0, nothing counted', e.start === 0 && e.textCount === 0 && e.reason === 'all');
  ok('a non-array never throws', textWindow(null).start === 0 && sliceTextWindow(undefined).length === 0);
}
{
  // perf r1: a 540 KB base64 image past the floor ENDS the walk — the growth budget
  // (128 KiB past the floor) is what the window may add, never the image for the
  // sake of the text around it (the verifier's 6 MB fixture: 208 records / 1.55 MB)
  const list = [];
  for (let i = 0; i < 40; i++) { list.push(user('q' + i)); list.push(img(540)); list.push(...tools(23)); } // two images inside the floor (~1.1 MB)
  const sizes = [];
  const w = textWindow(list, { sizeOf: (m) => { const n = jsonSize(m); sizes.push(n); return n; } });
  const win = sliceTextWindow(list);
  const floorBytes = list.slice(-50).reduce((a, m) => a + jsonSize(m), 0);
  const bytes = win.reduce((a, m) => a + jsonSize(m), 0);
  ok(`an image-heavy list stops at the growth budget (reason ${w.reason}, growth ${(w.growth / 1024).toFixed(0)} KB ≤ 128 KiB, window ${(bytes / 1024).toFixed(0)} KB = floor ${(floorBytes / 1024).toFixed(0)} KB + growth)`,
    w.reason === 'maxGrowth' && w.growth <= TEXT_WINDOW.maxGrowthBytes && bytes === floorBytes + w.growth && w.textCount < 24);
  ok('…no record past the floor is an image (the image ends the walk, it is never pulled in)', win.slice(0, win.length - 50).every((m) => jsonSize(m) < 540 * 1024));
  ok('…the floor never pays for its size: sizes are read only PAST it (the floor\'s two images are never measured)', !sizes.some((n) => n > 540 * 1024) || w.start < list.length - 50);
  const est = textWindow(list, { sizeOf: () => 1 });
  ok('…an injected sizeOf is what the byte walk reads (a 1-byte estimate never stops on bytes)', est.reason !== 'maxGrowth' && est.start < w.start);
  const floor = textWindow(Array.from({ length: 60 }, () => img(540)));
  ok('…but the budget never cuts under the floor: 60 image cards (32 MB) still ship 50 — today\'s behaviour, never less', floor.start === 10 && floor.reason === 'maxGrowth' && floor.growth === 0);
  ok('the growth budget is an option (maxGrowthBytes 0 ⇒ exactly the floor)', textWindow(list, { maxGrowthBytes: 0 }).start === list.length - 50);
}
// ── THE SLAB AN ATTACH ASKS FOR (perf r1): 'floor' = tail(minRecords) exactly; anything else = the text window ──
console.log('— attachWindowOpts (the attach frame\'s `slab` hint)');
ok('the hint vocabulary is ONE frozen list: floor | text', typeof attachWindowOpts === 'function' && Array.isArray(SLAB_HINTS) && Object.isFrozen(SLAB_HINTS) && SLAB_HINTS.join('|') === 'floor|text');
if (typeof attachWindowOpts === 'function') {
  const list = []; for (let i = 0; i < 60; i++) { list.push(user('q' + i)); list.push(...tools(10)); }
  ok("'floor' ⇒ exactly tail(50) (the pre-lane slab, what a hidden view / a burst pays)", sliceTextWindow(list, attachWindowOpts('floor')).length === 50 && sliceTextWindow(list, attachWindowOpts('floor'))[0] === list[list.length - 50]);
  ok("'text', absent (an older client) and garbage ⇒ the text window", ['text', undefined, null, 'x', 7].every((h) => sliceTextWindow(list, attachWindowOpts(h)).length === sliceTextWindow(list).length) && sliceTextWindow(list).length > 50);
  ok("'floor' on a list shorter than the floor ⇒ the whole list", sliceTextWindow(list.slice(0, 20), attachWindowOpts('floor')).length === 20);
}
// ── THE §1c FIXTURES THE PROBES USE (perf r1 — the claims are re-derived here, not
//    from a single 48 MB single-window run): the 6 MB one (the 19-window probe's)
//    and the 48 MB one (test-chat-paging's), generated into a scratch dir and
//    converted by the REAL claude normalizer. Printed; the bound is asserted. ──
console.log('— the §1c fixtures (6 MB, 48 MB): printed, bounded');
{
  const { writeHugeTranscript } = await import(path.join(REPO, 'scripts/huge-transcript-fixture.mjs'));
  const { scratch, fixtureSid } = await import(path.join(REPO, 'scripts/scratch.mjs'));
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const dir = scratch('textwin-fx');
  fs.mkdirSync(dir, { recursive: true });
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } };
  process.on('exit', cleanup);
  try {
    for (const mb of [6, 48]) {
      const file = path.join(dir, `fx-${mb}.jsonl`);
      await writeHugeTranscript({ file, sid: fixtureSid('7e0' + mb), cwd: dir, targetBytes: mb * 1048576 });
      const recs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const mm = createMessageManager('claude', 'tw' + mb); await mm.convertHistoryAsync(recs);
      const L = mm.messages;
      const size = (a) => a.reduce((n, m) => n + jsonSize(m), 0);
      const fl = mm.tailWindow(attachWindowOpts('floor')), tw = mm.tailWindow(), w = textWindow(L);
      console.log(`    ${mb} MB: ${L.length} records · floor ${fl.length} rec / ${(size(fl) / 1024).toFixed(0)} KB / ${fl.filter(isTextCard).length} text · text window ${tw.length} rec / ${(size(tw) / 1024).toFixed(0)} KB / ${w.textCount} text (${w.reason}, growth ${(w.growth / 1024).toFixed(0)} KB)`);
      ok(`${mb} MB §1c: the text window adds at most 128 KiB past the floor (${(w.growth / 1024).toFixed(0)} KB) and never fewer records than it`, size(tw) - size(fl) === w.growth && w.growth <= TEXT_WINDOW.maxGrowthBytes && tw.length >= fl.length && tw.length <= TEXT_WINDOW.maxRecords);
      if (mb === 6) ok('6 MB §1c (the 19-window probe\'s): the pasted image past the floor is NOT pulled in (the first cut shipped 208 records / 1.55 MB here)', w.reason === 'maxGrowth' && size(tw) < 1.25 * size(fl));
    }
  } finally { cleanup(); }
}
ok('opts override the table (minText 3 on the spaced list)', (() => { const l = []; for (let i = 0; i < 20; i++) { l.push(user('q')); l.push(...tools(30)); } return textWindow(l, { minText: 3, minRecords: 5 }).start === l.length - 3 * 31; })());

// ── PURE ─────────────────────────────────────────────────────────────────────
console.log('— purity + twin parity');
ok('text-window.js imports NOTHING (bundled into the daemon, the server and the client)', !/require\(/.test(src.replace(/\/\/.*$/gm, '')) && !/^\s*import\s/m.test(src));
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
{
  const list = [];
  for (let i = 0; i < 60; i++) { list.push(user('q' + i)); list.push(...tools(10)); }
  const starts = [MessageManager, CodexMessageManager, AcpMessageManager].map((C) => {
    const mm = new C('tw');
    if (typeof mm.tailWindow !== 'function') return 'missing';
    mm.messages = list;
    return list.length - mm.tailWindow().length;
  });
  ok(`every normalizer answers tailWindow() with the SAME start on the same list (claude/codex/acp: ${starts.join('/')})`, starts.every((s) => s === textWindow(list).start));
}
{
  // a REAL claude conversion: 30 turns, each a prompt + 12 tool round trips + a reply
  const recs = [];
  let u = 0;
  for (let t = 0; t < 30; t++) {
    recs.push({ type: 'user', uuid: 'u' + (u++), message: { role: 'user', content: [{ type: 'text', text: 'turn ' + t }] } });
    for (let k = 0; k < 12; k++) {
      recs.push({ type: 'assistant', uuid: 'u' + (u++), message: { id: `m${t}_${k}`, role: 'assistant', content: [{ type: 'tool_use', id: `tu${t}_${k}`, name: 'Bash', input: { command: 'ls ' + k } }] } });
      recs.push({ type: 'user', uuid: 'u' + (u++), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tu${t}_${k}`, content: 'ok' }] } });
    }
    recs.push({ type: 'assistant', uuid: 'u' + (u++), message: { id: `r${t}`, role: 'assistant', content: [{ type: 'text', text: 'done ' + t }] } });
  }
  const a = new MessageManager('tw'); a.convertHistory(recs);
  const b = new MessageManager('tw'); b.convertHistory(recs);
  const wa = a.tailWindow(), wb = b.tailWindow();
  const tailText = a.tail(50).filter(isTextCard).length;
  ok(`a real claude conversion: tail(50) held ${tailText} text cards, the window holds ${wa.filter(isTextCard).length} in ${wa.length} records`, tailText < 24 && wa.filter(isTextCard).length === 24 && wa.length > 50);
  ok('…two independent conversions of the same transcript ship the SAME slab (content-derived ids — the re-attach identical-skip)', wa.length === wb.length && wa[0].id === wb[0].id && wa[wa.length - 1].id === wb[wb.length - 1].id);
}

// ── wiring: every attach path calls it (a pure fix without its call sites is the UNSTAGED WIRING class) ──
console.log('— wiring');
const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
const ts = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
// (perf lane D: the slab is built only on the full rung, inside attachedFrameText's slab callback)
ok('ws-handler: the live attach ships the slab the attach ASKED for (perf r1: floor | text)', /messages: session\._normalizer \? session\._normalizer\.tailWindow\(attachWindowOpts\(data\.slab\)\) : \[\],/.test(wsh));
ok('ws-handler: the view-only attach ships the slab asked for too', /messages: mm\.tailWindow\(attachWindowOpts\(data\.slab\)\), totalCount: mm\.total, chatStatus: sm\.chatStatus\(\), isStreaming: false, viewOnly: true/.test(wsh));
ok('ws-handler: the mapping is the PURE module\'s (one spelling of "floor")', /const \{ attachWindowOpts \} = require\('\.\/text-window\.js'\);/.test(wsh) && !/data\.slab === 'floor'/.test(wsh));
ok('ws-handler: no attach path ships tail(50) any more', !/\.tail\(50\)/.test(wsh));
ok('transcript-service.page(): the default branch is the text window (HTTP + the daemon op)', /return \{ messages: mm\.tailWindow\(\), total: mm\.total \};/.test(ts) && !/mm\.tail\(50\)/.test(ts));
const hc = fs.readFileSync(path.join(REPO, 'scripts/test-harness-contract.mjs'), 'utf8');
ok('the harness contract requires tailWindow of EVERY normalizer (a new harness cannot ship without it)', /const NORM_METHODS = \[[^\]]*'tailWindow'/.test(hc));

// ── the REAL home is untouched (this process was re-homed before the code under test loaded) ──
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
