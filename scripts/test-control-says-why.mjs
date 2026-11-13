#!/usr/bin/env node
// A CONTROL WORKS, OR IT IS NOT THERE, OR IT SAYS WHY (lane ui-controls-and-bugs, the UI walk of 2026-11-13 — 主开发's GO for
// the page: «fix by rule, not by surface»). Fast tier, PURE (acorn over src/lib; no DOM, no server). Legs land pick by pick:
// pick 1 —
// ③ A MENU OPENS: every `showContextMenu(` call in src/lib passes (x, y, items) — the peer card called it (e, items), which
//    threw after preventDefault, so a right-click showed no menu at all
// ④ ONE LATEST RENDER: an async function in src/lib that EMPTIES a container, then awaits, then appends to it draws twice when
//    two calls overlap (the walk: the Ports panel's forwards and input box drawn twice). The Ports panel goes through
//    utils.js latestRender (built off-DOM, the newest build lands, one replaceChildren); the rest are a FROZEN LEDGER that
//    may only shrink — a new site is RED, a site that moved onto latestRender lowers its row
// ⑤ THE SINGLE DEFECTS of pick 1, each pinned: the pool's «All subscriptions» keeps the person's own list and restores it;
//    the auto-continue chip OPENS (the act sits behind a press in its panel); the hex viewer has no «Load more» and a whole
//    file says nothing more
// ⑥ CONTROLS: a planted (e, items) call, a planted clear-await-append render, a latestRender without its generation check —
//    each RED by the same checker
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require(path.join(REPO, 'node_modules', 'acorn'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const LIB = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f);
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
function walk(n, fn) { if (!n || typeof n.type !== 'string') return; fn(n); for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, fn)); else if (v && typeof v.type === 'string') walk(v, fn); } }

// ── ③ a menu opens: (x, y, items) ──
const EVENT_NAMES = new Set(['e', 'ev', 'evt', 'event']);
function badMenuCalls(src, file) {
  const out = [];
  walk(parse(src), (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'showContextMenu') return;
    const a0 = n.arguments[0];
    if (n.arguments.length < 3 || (a0 && a0.type === 'Identifier' && EVENT_NAMES.has(a0.name))) out.push(`${file}:${n.loc.start.line} (${n.arguments.length} args)`);
  });
  return out;
}
console.log('③ A MENU OPENS — every showContextMenu( call passes (x, y, items)');
let menuCalls = 0; const bad = [];
for (const f of LIB) { const s = read(f); menuCalls += (s.match(/\bshowContextMenu\(/g) || []).length; try { bad.push(...badMenuCalls(s, f)); } catch (e) { bad.push(`${f}: unparsable (${e.message})`); } }
ok(menuCalls >= 20, `the census sees the tree's menu calls (${menuCalls})`);
ok(bad.length === 0, 'no call passes the event (or fewer than three arguments) — the menu would throw before it opens', bad.join(', '));

// ── ④ one latest render ──
/** async functions whose own body empties identifier X, then awaits, then appends to X (nested functions are their own). */
function clearAwaitAppend(src, file) {
  const hits = [];
  walk(parse(src), (fnNode) => {
    if (!/Function/.test(fnNode.type) || !fnNode.async) return;
    const ev = [];
    const inner = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n !== fnNode && /Function/.test(n.type)) return;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' && ['innerHTML', 'textContent'].includes(n.left.property.name) && n.right.type === 'Literal' && n.right.value === '') ev.push(['clear', n.left.object.name, n.start, n.loc.start.line]);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.property.name === 'replaceChildren' && n.arguments.length === 0) ev.push(['clear', n.callee.object.name, n.start, n.loc.start.line]);
      if (n.type === 'AwaitExpression') ev.push(['await', null, n.start, n.loc.start.line]);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && ['appendChild', 'append', 'prepend', 'insertBefore'].includes(n.callee.property.name)) ev.push(['add', n.callee.object.name, n.start, n.loc.start.line]);
      for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(inner); else if (v && typeof v.type === 'string') inner(v); }
    };
    inner(fnNode.body);
    ev.sort((a, b) => a[2] - b[2]);
    for (const c of ev.filter((e) => e[0] === 'clear')) {
      const after = ev.filter((e) => e[2] > c[2]), ai = after.findIndex((e) => e[0] === 'await');
      if (ai >= 0 && after.slice(ai).some((e) => e[0] === 'add' && e[1] === c[1])) { hits.push(`${file}:${c[3]} ${c[1]}`); break; }
    }
  });
  return hits;
}
// THE FROZEN LEDGER (2026-11-13, 935960b7e less the Ports panel): each a render that can draw twice when two calls overlap —
// not in the walk's list; a site that moves onto latestRender LOWERS its row (the ledger only shrinks)
const LEDGER = { 'src/lib/app-install-dialog.js': 1, 'src/lib/browser-build-dialog.js': 1, 'src/lib/channel-window.js': 2, 'src/lib/jobs-panel.js': 2, 'src/lib/manage-agents.js': 1, 'src/lib/sidebar-mounts.js': 1 };
console.log('④ ONE LATEST RENDER — no async render empties, awaits, then appends (the ledger only shrinks)');
const per = {}; const allHits = [];
for (const f of LIB) { let h = []; try { h = clearAwaitAppend(read(f), f); } catch {} if (h.length) { per[f] = h.length; allHits.push(...h); } }
const grown = Object.entries(per).filter(([f, n]) => n > (LEDGER[f] || 0)).map(([f, n]) => `${f}: ${n} (ledger ${LEDGER[f] || 0})`);
const shrunk = Object.entries(LEDGER).filter(([f, n]) => (per[f] || 0) < n).map(([f, n]) => `${f}: ${per[f] || 0} < ledger ${n}`);
ok(grown.length === 0, 'no NEW clear-await-append render (a new one goes through utils.js latestRender)', grown.join(' ; ') + ' — ' + allHits.join(', '));
ok(shrunk.length === 0, 'the ledger is exact (a site that moved onto latestRender lowers its row)', shrunk.join(' ; '));
ok(!per['src/lib/sidebar-rail.js'] && /const render = latestRender\(c, async \(out\) =>/.test(read('src/lib/sidebar-rail.js')), 'the Ports panel renders through latestRender (its forwards and its input box are drawn once)');
ok(/const offPorts = this\.app\.ws\.onGlobal\(/.test(read('src/lib/sidebar-rail.js')) && /if \(!c\.isConnected\) \{ offPorts\(\); return; \}/.test(read('src/lib/sidebar-rail.js')), 'the Ports panel\'s broadcast listener goes with the panel (one per open was kept forever)');
// latestRender itself, evaluated from its own source against a fake container (two overlapping calls ⇒ ONE landing, the newest)
const U = read('src/lib/utils.js');
const fnSrc = (() => { let out = null; walk(parse(U), (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'latestRender') out = U.slice(n.start, n.end); }); return out; })();
async function overlap(src) {
  const doc = { createElement: () => ({ childNodes: [], appendChild(x) { this.childNodes.push(x); return x; } }) };
  const LR = new Function('document', `${src}; return latestRender;`)(doc);
  const landed = []; const c = { isConnected: true, replaceChildren: (...k) => landed.push(k.map((x) => x.label)) };
  let n = 0; const gates = [];
  const render = LR(c, async (out) => { const me = ++n; await new Promise((r) => gates.push(() => r())); out.appendChild({ label: `build ${me}` }); });
  const a = render(), b = render();
  await new Promise((r) => setTimeout(r, 0)); gates.forEach((g) => g()); await Promise.all([a, b]);
  return landed;
}
const two = fnSrc ? await overlap(fnSrc) : null;
ok(!!fnSrc && JSON.stringify(two) === JSON.stringify([['build 2']]), 'latestRender: two overlapping calls land ONCE — the newest build; the older is dropped', JSON.stringify(two));

// ── ⑤ the single defects of pick 1 ──
console.log('⑤ THE SINGLE DEFECTS — each pinned where it lives');
const MA = read('src/lib/manage-agents.js');
ok(/picked: explicit \? explicit\.slice\(\) : null/.test(MA) && /if \(st\.all\) \{ st\.picked = st\.checked\.slice\(\); st\.checked = subs\.map\(\(x\) => x\.id\); \} else if \(st\.picked\) st\.checked = st\.picked\.slice\(\);/.test(MA),
  'pool members: ticking «All» keeps the person\'s own list aside; unticking brings THAT list back (never every subscription silently ticked)');
ok(!/\$\{st\.all \? 'disabled' : ''\}/.test(MA) && /\$\{st\.all \? '' : `<input type="checkbox" class="pool-mem-cb"/.test(MA) && /t\('Every subscription is in the pool, including ones you add later'\)/.test(MA),
  'pool members: while «All» is on the member boxes are NOT drawn (no greyed ticked box) and one line says every subscription is in');
const SB = read('src/lib/chat-status-bar.js');
const arAt = SB.indexOf("const arEl = e.target.closest('.chat-status-autoresume');");
const arBlock = arAt >= 0 ? SB.slice(arAt, SB.indexOf('\n    }\n', arAt)) : '';
ok(arBlock.length > 200 && arBlock.indexOf('showDropdown(arEl') >= 0 && arBlock.indexOf('showDropdown(arEl') < arBlock.indexOf("type: 'auto-resume'") && /act\.onclick = \(ev\) => \{[\s\S]*type: 'auto-resume'/.test(arBlock),
  'auto-continue: a press OPENS the chip\'s panel; the on / off act sits behind a press inside it');
ok(/t\('continues at \{t\}', \{ t: when \}\)/.test(SB) && /t\('Auto-continue: off'\)/.test(SB), 'auto-continue: the chip says «… 自动继续» / «自动继续：关», never a bare time or a bare icon');
const HX = read('src/lib/hex-viewer.js');
ok(!/t\('Load more'\)/.test(HX) && /upTo >= this\.fileSize \? '' :/.test(HX) && /new IntersectionObserver/.test(HX), 'hex viewer: no «Load more» (the scroll loads), and a whole file says nothing more');

// ── ⑥ controls ──
console.log('⑥ CONTROLS — the same checkers on planted code');
ok(badMenuCalls("el.oncontextmenu = (e) => { showContextMenu(e, [{ label: 'x' }]); };", 'planted').length === 1, 'a planted (e, items) call is caught');
ok(clearAwaitAppend('async function r(c) { c.innerHTML = \'\'; const x = await load(); c.appendChild(x); }', 'planted').length === 1, 'a planted clear-await-append render is caught');
ok(clearAwaitAppend('async function r(c) { const x = await load(); c.replaceChildren(); c.appendChild(x); }', 'planted').length === 0, '…and a render that awaits FIRST, then clears and fills, is not');
const noGen = fnSrc && fnSrc.replace('if (mine !== gen || !container.isConnected) return false;', 'if (!container.isConnected) return false;');
const bad2 = noGen && noGen !== fnSrc ? await overlap(noGen) : null;
ok(!!bad2 && bad2.length === 2, 'a latestRender without its generation check lands BOTH builds — the overlap leg would be red', JSON.stringify(bad2));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
