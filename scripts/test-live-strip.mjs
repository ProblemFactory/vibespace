#!/usr/bin/env node
// THE AGENT BROWSER WINDOW'S STRIP — PURE (fast; docs/design-browser-multiview.zh.md
// §2 A1 + D4, lane P). One session, N browsers, ONE strip: this suite pins the
// arithmetic the window draws from — no DOM, no ports, ~0.2 s:
//   ① the FOLD (src/lib/live-strip-layout.js stripFold) at 1400 / 900 / 600 px:
//      the tab you look at NEVER folds (even rightmost, even alone over the
//      width), a tab running a command outlasts a quiet one, ties fold right to
//      left, the ▾+N button's width is paid only once something folded; the
//      design's six realistic labels (zh / en) at the three widths;
//   ② the ORDER (stripOrder): first-seen — a new browser lands at the TAIL, a gone
//      one leaves, nothing shown moves; labels ≤ 16 characters (shortLabel);
//   ③ the own/cap CHIP (capChip) + the chip's list (stoppableRows): live rows
//      counted, red AT the cap, the machine ceiling a SEPARATE fact, a driven or
//      released browser never offered a Stop, a shared profile says so;
//   ③b a tab's STATE WORDS (rowStateWords, lane P verify): a released own browser beside an attachment is
//      "used again only when no profile is attached", never "the next command starts it again";
//   ④ the PER-CONVERSATION cap verdict beside the MACHINE ceiling
//      (browser-profiles): the conversation's own cap refuses first with its own
//      scope and names the chip; below it the machine's ceiling refuses with
//      scope machine and counts — never names — the other holders;
//   ⑤ NEGATIVE CONTROL (scripts/mutant-copy.mjs): a fold that lets the shown tab
//      fold, and one that folds left to right — each turns its own leg red.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/lib/live-strip-layout.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
const B = require('../src/browser-profiles.js');
const S = require('../src/browser-stream.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);

function foldLegs(L, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  // six tabs of 150 px, the chip 46, the ▾+N 44 — shown = the RIGHTMOST, one running
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((ref) => ({ ref, label: ref, state: ref === 'c' ? 'running' : 'idle' }));
  const widths = Object.fromEntries(rows.map((r) => [r.ref, 150]));
  const f = (avail) => L.stripFold({ rows, widths, avail, shownRef: 'f', chipPx: 46, morePx: 44 });
  leg(J(f(1400)) === J({ visible: ['a', 'b', 'c', 'd', 'e', 'f'], folded: [] }), '① 1400 px: six tabs fit (946 px) — nothing folds, no ▾+N');
  leg(J(f(900)) === J({ visible: ['a', 'b', 'c', 'd', 'f'], folded: ['e'] }), '① 900 px: ONE folds — the rightmost QUIET tab (e); the shown tab (f, rightmost) stays');
  leg(J(f(600)) === J({ visible: ['a', 'c', 'f'], folded: ['b', 'd', 'e'] }), '① 600 px: three fold, quiet ones first and right to left (e, d, b); the RUNNING tab (c) outlasts them');
  leg(J(f(300)) === J({ visible: ['f'], folded: ['a', 'b', 'c', 'd', 'e'] }), '① 300 px: the running tab folds last — only the shown tab is left');
  leg(J(f(120)) === J({ visible: ['f'], folded: ['a', 'b', 'c', 'd', 'e'] }), '① 120 px: the shown tab NEVER folds, even alone over the width (a scrollbar is better than hiding what you look at)');
  leg(J(L.stripFold({ rows, widths, avail: 900, shownRef: 'a', chipPx: 46, morePx: 44 })) === J({ visible: ['a', 'b', 'c', 'd', 'e'], folded: ['f'] }), '① shown = the leftmost: the rightmost quiet tab folds (ties right to left)');
  return failed;
}

console.log('— ① the fold (stripFold) at 1400 / 900 / 600 px');
const L = require(path.join(REPO, MODEL));
const realFailed = foldLegs(L);
{
  // the design's realistic six (§2 A1: "6 枚标签 ≈ 780–1260 px")
  const zh = [['bp-1', '工作(默认)'], ['bp-2', '个人'], ['~ephemeral', '本会话的浏览器'], ['bk-0000000a.1', '帮手：查价格'], ['bk-0000000a.2', '帮手：订酒店和机票并比较三家的价格'], ['bk-0000000a.3', '帮手 3']];
  const en = [['bp-1', 'Work account (default)'], ['bp-2', 'Personal'], ['~ephemeral', 'This conversation’s browser'], ['bk-0000000a.1', 'Helper: Check the prices'], ['bk-0000000a.2', 'Helper: Book the hotel and the flights'], ['bk-0000000a.3', 'Helper 3']];
  for (const [lang, set] of [['zh', zh], ['en', en]]) {
    const rows = set.map(([ref, label], i) => ({ ref, label: L.shortLabel(label), state: i === 3 ? 'running' : 'idle' }));
    const widths = Object.fromEntries(rows.map((r) => [r.ref, L.estimateTabWidth(r.label)]));
    const sum = Object.values(widths).reduce((a, b) => a + b, 0);
    ok(sum >= 700 && sum <= 1300, `② ${lang}: six realistic tabs measure ${sum} px (the design's 780–1260 band, estimated)`);
    for (const avail of [1400, 900, 600]) {
      const r = L.stripFold({ rows, widths, avail, shownRef: 'bk-0000000a.2' });
      const used = r.visible.reduce((a, ref) => a + widths[ref], 0) + L.CHIP_PX + (r.folded.length ? L.MORE_PX : 0);
      ok(r.visible.includes('bk-0000000a.2') && (used <= avail || r.visible.length === 1) && r.visible.length + r.folded.length === 6 && (r.folded.length === 0 || !r.visible.slice(1).some((ref) => ref !== 'bk-0000000a.2' && rows.find((x) => x.ref === ref).state !== 'running' && r.folded.some((fr) => set.findIndex((s) => s[0] === fr) < set.findIndex((s) => s[0] === ref) && rows.find((x) => x.ref === fr).state !== 'running'))), `② ${lang} at ${avail} px: ${r.visible.length} shown / ${r.folded.length} folded, ${used} px used — the shown tab kept, it fits, quiet tabs fold from the right`, r);
    }
  }
}

console.log('— ② the order (stripOrder) + the label (shortLabel)');
{
  const rows0 = [{ ref: 'bp-1' }, { ref: '~ephemeral' }];
  const o1 = L.stripOrder([], rows0);
  ok(J(o1.order) === J(['bp-1', '~ephemeral']), 'a first view takes the list\'s own order');
  // a helper's browser appears, and a NEW attachment (which browserListFor puts BEFORE the ephemeral row)
  const o2 = L.stripOrder(o1.order, [{ ref: 'bp-1' }, { ref: 'bp-2' }, { ref: '~ephemeral' }, { ref: 'bk-0000000a.1' }]);
  ok(J(o2.order) === J(['bp-1', '~ephemeral', 'bp-2', 'bk-0000000a.1']), 'new browsers land at the TAIL in the list\'s order — nothing already shown moves (§2: a new tab, never a re-shuffle)');
  const o3 = L.stripOrder(o2.order, [{ ref: 'bk-0000000a.1' }, { ref: 'bp-1' }]);
  ok(J(o3.order) === J(['bp-1', 'bk-0000000a.1']), 'a browser that left drops out; the rest keep their places');
  ok(L.shortLabel('Helper: Book the hotel and the flights') === 'Helper: Book th…' && Array.from(L.shortLabel('帮手：订酒店和机票并比较三家的价格')).length === 16 && L.shortLabel('Personal') === 'Personal' && L.shortLabel('  a   b ') === 'a b', 'labels: ≤ 16 characters (code points — CJK counted as one each), an ellipsis past it');
  ok(L.estimateTabWidth('帮手：查价格') > L.estimateTabWidth('Helper 3') && L.estimateTabWidth('x'.repeat(40)) === L.estimateTabWidth('x'.repeat(16)), 'estimated widths: CJK wider per character; past 16 characters nothing grows');
}

console.log('— ③ the own/cap chip + its list');
{
  const R = (state, extra = {}) => ({ ref: 'r' + Math.random(), state, kind: 'ephemeral', driver: 'agent', ...extra });
  const c1 = L.capChip({ rows: [R('idle'), R('released'), R('running')], cap: 3, machine: { used: 4, cap: 6 } });
  ok(c1.own === 2 && c1.text === '2/3' && !c1.full && !c1.machineFull, '2 live of 3 (a released one does not count) — not full');
  const c2 = L.capChip({ rows: [R('idle'), R('idle'), R('running'), R('ended')], cap: 3, machine: { used: 6, cap: 6 } });
  ok(c2.text === '3/3' && c2.full && !c2.over && c2.machineFull && c2.machine.used === 6, 'AT the cap: red (full); the machine\'s own ceiling is a SEPARATE flag, never the number');
  const c3 = L.capChip({ rows: [R('idle'), R('idle'), R('idle')], cap: 2 });
  ok(c3.text === '3/2' && c3.full && c3.over, 'a cap lowered below what runs: 3/2, over (nothing is stopped for it — the next start is refused)');
  ok(L.capChip({ rows: [], cap: 99 }).cap === 6 && L.capChip({ rows: [], cap: 0 }).cap === 3 && L.capChip({ rows: [], cap: 1 }).cap === 1, 'the chip\'s cap is clamped to 1..6 (junk ⇒ the default 3)');
  const list = L.stoppableRows([R('idle', { ref: 'mine' }), R('running', { ref: 'busy' }), R('idle', { ref: 'driven', driver: 'you' }), R('released', { ref: 'gone' }), R('idle', { ref: 'shared', kind: 'attachment', owners: 2 })]);
  ok(J(list.map((x) => x.ref)) === J(['mine', 'busy', 'shared']) && list.find((x) => x.ref === 'shared').shared === true && list.find((x) => x.ref === 'shared').owners === 2 && !list.find((x) => x.ref === 'mine').shared, 'the chip lists only live browsers NOT driven by you; a profile other conversations also hold says so (detach instead)');
  // the chip counts exactly what browserListFor calls live (one source)
  const rows = S.browserListFor({ browserKey: 'bk-0000000a', attachments: [{ profileId: 'bp-00000001', label: 'W' }], leases: [{ profileId: 'bp-00000001', browserKey: 'bk-0000000a', browser: { state: 'ready' } }], ephemeral: { profileId: 'bp-000000e1', browserKey: 'bk-0000000a', state: 'stopped' }, children: [{ handle: 'bk-0000000a.1', browser: { state: 'starting' } }] });
  ok(L.capChip({ rows, cap: 3 }).own === S.ownLiveCount(rows) && S.ownLiveCount(rows) === 2, 'the chip\'s own = browserListFor\'s live rows (a released ephemeral is not counted, a starting helper is)');
}

console.log('— ③b a tab\'s state words (rowStateWords): a released own browser beside an attachment is never promised "the next command"');
// lane P verify (finding 6, 2026-09-26): while the conversation holds an attachment, a bare verb lands on the ATTACHMENT (one) or
// is refused profile_required (two) — the released ephemeral is never restarted by it, so its tab must not say it would be
function wordsLegs(Mod, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const W = typeof Mod.rowStateWords === 'function' ? Mod.rowStateWords : () => null;
  const eph = { ref: '~ephemeral', kind: 'ephemeral', state: 'released' };
  const att = { ref: 'bp-00000001', kind: 'attachment', state: 'idle' };
  const kid = { ref: 'bk-0000000a.1', kind: 'child', state: 'released' };
  leg(W(eph, [eph, kid]) === 'released', '③b no attachment: the released own browser says "the next command starts it again" (released)');
  leg(W(eph, [att, eph]) === 'released-attached', '③b beside an attachment: the released own browser says it is used again only when no profile is attached (released-attached)');
  leg(W({ ...att, state: 'released' }, [att, eph]) === 'released' && W(kid, [att, kid]) === 'released', '③b a released attachment / helper keeps "the next command starts it again" (its next command does)');
  leg(W({ ...eph, state: 'idle' }, [att, eph]) === 'idle' && W({ ...eph, state: 'running' }, [att]) === 'running' && W({ ...eph, state: 'ended' }, [att]) === 'ended', '③b a live / ended row is its state, whatever else is attached');
  return failed;
}
const wordsFailed = wordsLegs(L);
{
  const WIN = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/'released-attached': \(\) => t\('Released — used again only when no profile is attached'\)/.test(WIN) && /released: \(\) => t\('Released — the next command starts it again'\)/.test(WIN) && /rowStateWords\(r, st\.rows\)/.test(WIN), '③b the window draws the tab title (and the released status line) from rowStateWords, each code with its own sentence');
  for (const lang of ['zh', 'ja']) {
    const D = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf8');
    ok(D.includes('"Released — used again only when no profile is attached":') && D.includes('"Not started yet — the next command starts it":'), `③b the new words have ${lang} entries`);
  }
}

console.log('— ④ the per-conversation cap verdict beside the machine ceiling (PURE)');
{
  const K = 'bk-0000000a';
  const liveRec = (id, label, owner = null) => ({ profileId: id, label, state: 'ready', ephemeral: !!owner, owner });
  // the machine: 6 of 6 — two of them this conversation's (its own ephemeral + a helper's), four elsewhere
  const running = [liveRec('bp-000000e1', '(ephemeral) mine', K), liveRec('bp-000000e2', '(ephemeral) mine · child 1', K + '.1'), liveRec('bp-000000e3', '(ephemeral) Other conversation', 'bk-0000000b'), liveRec('bp-000000e4', '(ephemeral) Third', 'bk-0000000c'), liveRec('bp-00000001', 'Shared Work'), liveRec('bp-00000002', 'Someone else\'s')];
  const leases = [{ profileId: 'bp-00000001', browserKey: 'bk-0000000b' }, { profileId: 'bp-00000002', browserKey: 'bk-0000000c' }];
  const own = running.filter((r) => r.owner && B.parentKeyOf(r.owner) === K).length;
  const conv = B.conversationCapVerdict({ own, cap: 2 });
  ok(conv && conv.scope === 'conversation' && conv.own === 2 && conv.cap === 2 && /2\/2 chip/.test(conv.remedy) && L.capChip({ rows: [{ state: 'idle' }, { state: 'idle' }], cap: 2 }).text === '2/2', 'AT its own cap (2/2): the CONVERSATION refuses first — its remedy names the very chip text the window shows (2/2)');
  ok(B.conversationCapVerdict({ own, cap: 3 }) === null, 'below its own cap (2/3): the conversation does not refuse…');
  const mach = B.ceilingVerdict(running, leases, { CONCURRENT_CAP: 6 }, { ephemeral: true, browserKey: K });
  ok(mach && mach.scope === 'machine' && mach.code === 'browser_cap' && mach.holders.length === 2 && mach.others === 4 && /machine ceiling reached/.test(mach.error) && /4 are in other conversations or desktop apps/.test(mach.error), '…but the MACHINE is full (6/6): scope machine, its own two named, the other four COUNTED', mach.error);
  ok(!/Other conversation|Third|Shared Work|Someone else|bk-0000000[bc]|bp-0000000[12]|bp-000000e[34]/.test(JSON.stringify(mach)), '…and not one of the other four is named (label, profile id or lease key) anywhere in the refusal');
  ok(B.ceilingVerdict(running.slice(0, 5), leases, { CONCURRENT_CAP: 6 }, { ephemeral: true, browserKey: K }) === null, 'one below the machine ceiling: no machine refusal');
}

console.log('— ⑤ negative controls (patched copies)');
const M = mutantCopies('live-strip', REPO);
const MUTANTS = [
  { tag: 'shown-may-fold', find: '  if (row && row.ref === shownRef) return 0;\n', repl: '\n', expect: /shown tab NEVER folds|shown tab \(f, rightmost\) stays/ },
  { tag: 'fold-left-to-right', find: '    for (let i = list.length - 1; i >= 0 && total() > avail; i--) {', repl: '    for (let i = 0; i < list.length && total() > avail; i++) {', expect: /right to left|rightmost QUIET/ },
];
for (const m of MUTANTS) {
  const found = SRC.includes(m.find);
  ok(found, `control ${m.tag}: the patched line exists in the model`);
  if (!found) continue;
  const Mod = M.load(MODEL, SRC.replace(m.find, m.repl), m.tag);
  const f = foldLegs(Mod, { quiet: true });
  ok(f.some((n) => m.expect.test(n)), `control ${m.tag}: the patched copy turns its leg RED (${f.length} failed: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
}
{
  // lane P verify (finding 6): the pre-fix words — every released row says "the next command starts it again"
  const find = "  if (row.kind === 'ephemeral' && (rows || []).some((r) => r && r.kind === 'attachment')) return 'released-attached';\n";
  const found = SRC.includes(find);
  ok(found, 'control released-words: the patched line exists in the model');
  if (found) {
    const f = wordsLegs(M.load(MODEL, SRC.replace(find, '\n'), 'released-words'), { quiet: true });
    ok(f.some((n) => /beside an attachment/.test(n)), `control released-words: the patched copy turns its leg RED (${f.length} failed)`);
  }
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length + 1 })) ok(r.pass, r.name, r.detail);

console.log(fail || realFailed.length || wordsFailed.length ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail || realFailed.length || wordsFailed.length ? 1 : 0);
