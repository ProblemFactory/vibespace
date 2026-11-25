#!/usr/bin/env node
// THE AGENT'S BROWSER WINDOWS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-browser-windows.mjs, whose PURE verdicts, real bridge, real keeper and every
// patched-copy CONTROL (with its «control setup» precondition) stay there: ① the strip's / bridge's / keeper's source pins
// and the watch menu's wiring, ② the unresponsive state's client words, ③ R7 the keeper's order pin (T2 ⑧'s pin reads the module's table — it stays), ④ the opener
// act's wiring and ⑥ the window-id reader census. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects
// this suite on a change of that file.
// Run: node scripts/test-browser-windows-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };

const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— ① PURE: the click verdict, the watch verb, the strip\'s driver words, the source pins');
{
  const lw = read('src/lib/browser-live-window.js');
  ok(!/\{name\} drives/.test(lw) && /function chipClick\(row\)/.test(lw) && /type: 'watch-tab'/.test(lw) && /case 'tab-background':/.test(lw) && /case 'watching':/.test(lw) && /if \(row\) chipClick\(row\)/.test(lw), 'the client: the "{name} drives" strip words are gone; a chip click goes through chipClick (the PURE verdict); `watching` and `tab-background` records are read');

  const kp = read('src/server/browser-keeper.js');
  ok(/if \(v\.front && act === 'switch'\) \{/.test(kp) && /\[\.\.\.\(eph \? \[\] : pin\), 'tab', id, '--json'\]/.test(kp) && /broughtForward: true/.test(kp) && /tabVisibilityFor, captureTabFor, watchTabFor,/.test(kp), 'the keeper: a driving click on the agent\'s CURRENT tab brings it forward (never a silent no-op) — in EVERY browser, a conversation\'s own by the no-pin form (r4412); the visibility / capture / watch seams are exported');

  const lwG = read('src/lib/browser-live-window.js');
  const moreSrc = lwG.slice(lwG.indexOf('tabRowMore.onclick'), lwG.indexOf('function clickOf('));
  ok(/foldMenuRows\(rows, \(x\) => clickOf\(x\), t\)/.test(moreSrc) && /action: \(\) => chipClick\(x\)/.test(moreSrc) && !/disabled: true/.test(moreSrc), 'G1 source: the client\'s "▾+N" handler builds its entries from foldMenuRows and runs chipClick — no `disabled: true` left');

  ok(/watchedRef: st\.watch \? st\.watch\.targetId : null/.test(lwG), 'G3 source: the client\'s refold passes the watched tab');

  const helloSrc = lwG.slice(lwG.indexOf("      case 'hello':"), lwG.indexOf("      case 'mode': {"));
  ok(/if \(st\.watch\) \{ if \(st\.mode === 'takeover' && st\.mine\) st\.watch = null; else \{ st\.watch = \{ \.\.\.st\.watch, pending: true \}; send\(\{ type: 'watch-tab', targetId: st\.watch\.targetId \}\); \}/.test(helloSrc), 'G4 source: the client\'s hello re-sends its watch (or drops it when it drives now) — one truth after a reconnect');

}

console.log('— ② the real bridge over a fake stream server + a stub keeper');

{
  const lw = read('src/lib/browser-live-window.js');
  ok(/state: m\.state === 'unresponsive' \? 'unresponsive' : 'hidden'/.test(lw) && /st\.bg && st\.bg\.state === 'unresponsive'/.test(lw) && /is not responding — no picture, and it did not answer when asked/.test(lw), 'B-d635: the live view words the unresponsive verdict (watching and driving) beside the hidden one');
}

console.log('— ③ verify r1 T1: the window-ownership table (actor × target × act ⇒ allowed / refused by name / paused-by-takeover)');
{
  // R7 (the CLI): the agent's `tab new` while the user drives ITS window is refused browser_paused by resolveFor, the first
  // judgement of its tab verbs (test-browser-tabs drives it on the real keeper); here the order is pinned
  const kp = read('src/server/browser-keeper.js');
  const fnStart = kp.indexOf('async function agentTabAct(');
  const head = fnStart > 0 ? kp.slice(fnStart, kp.indexOf('const out = { ok: true, act: w.act', fnStart)) : '';
  ok(fnStart > 0 && head.length > 0 && head.includes('resolveFor(') && !head.includes('rt.exec('), 'R7 (the CLI): the agent\'s `tab new` is judged by resolveFor (browser_paused while the user drives its window) BEFORE the act — no exec before it, never a second window to escape a takeover');

}

console.log('— ④ verify r2 T1: the opener rule\'s own table — the real keeper over a fake target model (the per-holder window count is the red cell)');
{
  ok(/Page\.createIsolatedWorld/.test(read('src/server/browser-viewport.js')) && /'noopener'/.test(read('src/server/browser-viewport.js')) && /openTabByActivate/.test(read('src/server/browser-keeper.js')) && /window_busy/.test(read('src/routes/browser.js')), 'wiring: the opener act runs in an ISOLATED world with noopener (T2 ①), the keeper has rung 2 (openTabByActivate) and window_busy is a typed refusal the routes answer');

  // ── ⑥ verify r3: THE WINDOW-ID READER CENSUS (grep-derived): no `.windowId` is read through Number()/isFinite() anywhere ──
  //    (HOTFIX cure r4, 主开发 00:05Z: + src/browser-picture.js — the follow verdict's own read of the tab's CDP window)
  {
    const files = ['src/server/browser-keeper.js', 'src/server/browser-viewport.js', 'src/server/browser-stream.js', 'src/routes/browser.js', 'src/browser-tabs.js', 'src/browser-windows.js', 'src/browser-profiles.js', 'src/browser-picture.js', 'src/lib/browser-live-window.js', 'data/bin/vibespace-browser'];
    const raw = []; let sites = 0;
    for (const f of files) { const lines = read(f).split('\n'); lines.forEach((ln, i) => { const t = ln.trim(); if (/^(\*|\/\/|\/\*\*)/.test(t)) return; if (!/\bwindowId\b/.test(ln)) return; if (/windowIdOf\(/.test(ln)) sites++; if (/(Number|isFinite)\([^)]*windowId/.test(ln) && !/function windowIdOf/.test(ln)) raw.push(`${f}:${i + 1}: ${t.slice(0, 120)}`); }); }
    ok(!raw.length && sites >= 9, `⑥ THE WINDOW-ID READER CENSUS: ${sites} windowIdOf sites over ${files.length} files, ${raw.length} raw Number()/isFinite() read(s) of a window id (the Number(null)=0 class)`, raw.join('\n    '));
    // lane site-reset-windows: the keeper's ladder read of a tab's window (anchors, strays, the upgrade path) names no `windowId`,
    // so the census above never saw it — it read `Number(w)`: a dead tab (no window) was window 0, a stray "window 0" said to the
    // agent, a lease on the upgrade path stamped window 0. It reads through THE one reader now
    ok(/const windowOf = async \(tid\) => \{[^\n]*return WIN\.windowIdOf\(w\); \}/.test(read('src/server/browser-keeper.js')) && !/return Number\.isFinite\(Number\(w\)\)/.test(read('src/server/browser-keeper.js')), '⑥ lane site-reset-windows: the keeper\'s ladder reads a tab\'s window through windowIdOf — a dead tab is no window, never window 0');
  }

}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
