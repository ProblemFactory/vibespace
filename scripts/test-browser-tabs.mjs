#!/usr/bin/env node
// LANE BROWSER-RESUME, CHUNK C — TABS (the owner's ruling 3, 2026-09-30: "目前浏览器似乎没有完善的关闭标签页能力";
// docs/design-agent-browser-v2.zh.md §3.9). The fast gate (the chrome leg is test-browser-resume-ui ⑥):
//   ① PURE src/browser-tabs.js — whose tab it is (roots, what a rooted tab opened, a session's active tab only when nobody
//      roots it, the user first; a conversation's own browser = every page its), the agent's `tab` words, a ref (t<N> / a
//      label / a target id), the agent's view (never another holder's title or url: a COUNT), the agent's verdict (its own
//      tabs only; unreadable ⇒ closed; its current tab closable and said), the user's verdict over every cell (his tabs
//      always but never his last; the agent's only while he drives, never its last, never on a mediated browser; another
//      conversation's never), the row model draws no control the verdict refuses, the handback sentence; patched-copy
//      CONTROLS (a verdict that lets the user close another conversation's tab; an agent view carrying a foreign title; an
//      ownership rule where an active tab outranks the user's root);
//   ② the REAL keeper + route over a fake 0.38.1 that keeps ONE shared Chrome's tabs per namespace (every session lists
//      every page, `tab close` closes any tab — the measured shapes) and a fake CDP read: the agent's `tab list` shows its
//      own + a count; `tab new` records a ROOT; a foreign `tab close` / `tab <ref>` is refused BEFORE any exec (the
//      command log is the spy); `resolveFor` gates first (paused ⇒ browser_paused, nothing ran); an unreadable browser
//      fails closed; the user's switch / ✕ on the agent's tab only while he drives — recorded on the cycle and SAID at
//      the handback; his own tab closable from his window, never his last; another conversation's refused; the belt;
//   ②b verify F3: a handback landing inside the user's act — inside the reads ⇒ refused, nothing ran; inside the exec ⇒
//      the act (recorded at its check) is told; a failed exec takes its record back; two patched-copy controls;
//   ③ the REAL bridge over a fake upstream: `tab-owners` after a `tabs` record (+ replayed to a late viewer), `tab-act`
//      answered by a typed `tab-ack`, a user switch re-anchors the takeover (his next input is forwarded, not tab_switched);
//   ④ the words: every new key in zh + ja.
// ~5 s, port 0, scratch dirs only, no real browser, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, deadPort, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { judgeInChild, LINEAR_BOUND } from './work-meter.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const TB = require('../src/browser-tabs.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(15); } return !!(await f()); };
const J = (x) => JSON.stringify(x);

const ROOT = scratch('browser-tabs');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const servers = [];
function cleanup() {
  for (const s of servers) { try { s.close(); } catch { } }
  try { for (const l of fs.readFileSync(path.join(ROOT, 'ab', 'pids'), 'utf8').split('\n').filter(Boolean)) { try { process.kill(Number(l), 'SIGKILL'); } catch { } } } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const M = mutantCopies('browser-tabs', REPO);

const T = (n) => (n.toString(16).toUpperCase().padStart(4, '0') + 'C'.repeat(28));
const HU = 'hu-0000c001', KA = 'bk-0000c0a1', KB = 'bk-0000c0a2';

// ═══ ① PURE ═══════════════════════════════════════════════════════════════════
console.log('— ① PURE: ownership, the agent\'s words / view / verdict, the user\'s verdict, the row, the handback sentence');
function pureLegs(TT, tag = '') {
  const legs = [];
  const leg = (c, n, extra) => legs.push({ c: !!c, n: tag + n, extra });
  // THE BROWSER: the keeper's launch tab (nobody's), his tab + its popup, A's tab + its popup + a `tab new` of A's, B's tab,
  // a tab nobody roots that B's session is on (its bootstrap), a stray
  const targets = [
    { targetId: T(1), type: 'page' },                        // the keeper's launch tab
    { targetId: T(2), type: 'page' },                        // his own tab (root)
    { targetId: T(3), type: 'page', openerId: T(2) },        // his popup
    { targetId: T(4), type: 'page' },                        // A's root
    { targetId: T(5), type: 'page', openerId: T(4) },        // A's popup
    { targetId: T(6), type: 'page', openerId: T(5) },        // …its popup (transitive)
    { targetId: T(7), type: 'page' },                        // A's `tab new`
    { targetId: T(8), type: 'page' },                        // B's root
    { targetId: T(9), type: 'page' },                        // B's session's active tab (no root yet)
    { targetId: T(10), type: 'page', openerId: T(9) },       // …what it opened
    { targetId: T(11), type: 'service_worker' },             // not a page
    { targetId: 'nothex', type: 'page' },                    // not a target id
  ];
  const holders = [{ key: HU, roots: [T(2)] }, { key: KA, roots: [T(4), T(7).toLowerCase()], active: T(4) }, { key: KB, roots: [T(8)], active: T(9) }];
  const own = TT.tabOwners({ targets, holders });
  const want = { [T(1)]: 'orphan', [T(2)]: HU, [T(3)]: HU, [T(4)]: KA, [T(5)]: KA, [T(6)]: KA, [T(7)]: KA, [T(8)]: KB, [T(9)]: KB, [T(10)]: KB };
  const sorted = (m) => J(Object.fromEntries([...(m instanceof Map ? m.entries() : Object.entries(m))].sort(([a], [b]) => (a < b ? -1 : 1))));
  leg(sorted(own) === sorted(want), 'OWNERSHIP: roots (case-folded), what a rooted tab opened (transitively), a session\'s active tab nobody roots, the rest orphan — service workers and malformed ids never listed', Object.fromEntries(own));
  // an ACTIVE is weaker than any root, and weaker than what a root opened: B's session "active" on HIS popup stays his
  const o2 = TT.tabOwners({ targets, holders: [{ key: HU, roots: [T(2)] }, { key: KB, roots: [], active: T(3) }] });
  leg(o2.get(T(3)) === HU && o2.get(T(2)) === HU, 'an ACTIVE never outranks a root nor what a root opened — a conversation session sitting on his popup does not make it the conversation\'s');
  // the user first: a root both claim is his
  const o3 = TT.tabOwners({ targets, holders: [{ key: HU, roots: [T(4)] }, { key: KA, roots: [T(4)] }] });
  leg(o3.get(T(4)) === HU && o3.get(T(5)) === HU, 'the holders are ORDERED — the user first: a tab both name is his (and what it opened)');
  // a conversation's own browser: every page is its
  const oe = TT.tabOwners({ targets, holders, ephemeralKey: KA });
  leg([...oe.values()].every((k) => k === KA) && oe.size === 10, 'a conversation\'s OWN browser (ephemeralKey): every page is its (10 pages)');
  leg(TT.ownSetOf(own, KA).size === 4 && TT.ownSetOf(null, KA) === null, 'ownSetOf: A holds 4; unreadable owners ⇒ null (fail closed)');
  leg(TT.ownerWord(KA, { me: KA }) === 'agent' && TT.ownerWord(HU, { me: KA }) === 'you' && TT.ownerWord(KB, { me: KA }) === 'other' && TT.ownerWord('orphan', { me: KA }) === 'orphan' && TT.ownerWord('', {}) === 'orphan', 'the view\'s word: the viewed conversation\'s = agent, his = you, another = other, nobody\'s = orphan');
  leg(J(TT.cleanRoots(['x', T(1), T(1).toLowerCase(), ...Array.from({ length: 40 }, (_, i) => T(100 + i))])) === J(Array.from({ length: 40 }, (_, i) => T(100 + i)).slice(-32)) && TT.addRoot([T(1), T(2)], T(1).toLowerCase()).join() === [T(2), T(1)].join(), 'roots: cleaned, deduplicated, bounded to 32 (the newest kept); addRoot moves a known one to the end');
  // the agent's words
  const P = (a) => { const r = TT.parseTabArgv(a); return r.ok ? `${r.act}|${r.ref}|${r.url}|${r.label}|${r.json}` : 'ERR:' + r.code; };
  const WORDS = [
    [['tab'], 'list|null|null|null|false'], [['tab', 'list', '--json'], 'list|null|null|null|true'], [['--pin-tab', 'tab', 'new'], 'new|null|null|null|false'],
    [['tab', 'new', 'https://a.example/'], 'new|null|https://a.example/|null|false'], [['tab', 'new', '--label', 'docs', 'https://d.example/'], 'new|null|https://d.example/|docs|false'],
    [['tab', 'new', '--label=docs'], 'new|null|null|docs|false'], [['tab', 'close'], 'close|null|null|null|false'], [['tab', 'close', 't3'], 'close|t3|null|null|false'],
    [['tab', 't3'], 'switch|t3|null|null|false'], [['tab', T(4)], `switch|${T(4)}|null|null|false`],
    [['tab', 'close', 't3', 't4'], 'ERR:bad-request'], [['tab', 't3', 'x'], 'ERR:bad-request'], [['tab', 'list', 'x'], 'ERR:bad-request'], [['tab', '--all'], 'ERR:bad-request'],
    [['tab', 'new', '--label', '../x'], 'ERR:bad-request'], [['tab', 'close', '--label', 'x'], 'ERR:bad-request'], [['tab', 'new', 'a', 'b'], 'ERR:bad-request'],
  ];
  const badW = WORDS.filter(([a, w]) => P(a) !== w).map(([a, w]) => `${a.join(' ')} ⇒ ${P(a)} (want ${w})`);
  leg(!badW.length, `the agent's \`tab\` words → one act (${WORDS.length} forms, the measured operations only)`, badW);
  const rows = [{ tabId: 't1', targetId: T(1), label: null }, { tabId: 't3', targetId: T(4), label: 'docs' }];
  leg(TT.resolveTabRef('t3', rows) === T(4) && TT.resolveTabRef('docs', rows) === T(4) && TT.resolveTabRef(T(4).toLowerCase(), rows) === T(4) && TT.resolveTabRef('t9', rows) === null && TT.resolveTabRef(T(9), rows) === null && TT.resolveTabRef('', rows) === null, 'a ref: t<N>, a label or a target id (any case) → the target id; unknown ⇒ null');
  leg(TT.newTabUrlVerdict('https://a.example/x').ok && TT.newTabUrlVerdict(null).ok && TT.newTabUrlVerdict('about:blank').url === 'about:blank' && ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'data:text/html,x', 'x'].every((u) => TT.newTabUrlVerdict(u).code === 'not_web'), '`tab new <url>`: the web only (the server\'s belt beside the CLI\'s)');
  // the agent's view
  const listed = [{ tabId: 't1', targetId: T(1), title: 'keeper', url: 'about:blank', active: false }, { tabId: 't2', targetId: T(2), title: 'His bank', url: 'https://bank.example/acct', active: false }, { tabId: 't3', targetId: T(4), title: 'A page', url: 'https://a.example/', active: true }, { tabId: 't4', targetId: T(7), title: 'A new', url: 'https://a.example/2', active: false }, { tabId: 't5', targetId: T(8), title: 'B page', url: 'https://b.example/', active: false }];
  const v = TT.agentTabView({ tabs: listed, owners: own, me: KA });
  leg(v && v.tabs.length === 2 && v.others === 3 && v.tabs[0].id === 't3' && v.tabs[0].current && !J(v).includes('bank') && !J(v).includes('B page') && !J(v).includes(HU) && TT.agentTabView({ tabs: listed, owners: null, me: KA }) === null,
    'the AGENT\'S VIEW: its own rows (t3 current, t4) + a COUNT of the rest (3) — his bank tab\'s title/url and B\'s page never in it; unreadable ⇒ null', v);
  const lines = TT.agentTabLines(v);
  leg(lines.length === 3 && /^t3  A page — https:\/\/a\.example\/  \[current\]$/.test(lines[0]) && /3 other tabs in this browser are not yours/.test(lines[2]), 'the CLI lines: `t3  Title — url  [current]`, then the count', lines);
  // the agent's verdict
  const aset = TT.ownSetOf(own, KA);
  const AV = (x) => { const r = TT.agentTabVerdict({ own: aset, current: T(4), ...x }); return r.ok ? 'ok' + (r.closesCurrent ? '+cur' : '') : r.code; };
  const AT = [
    [{ act: 'list' }, 'ok'], [{ act: 'new' }, 'ok'], [{ act: 'new', own: null }, 'ok'],
    [{ act: 'switch', ref: 't4', targetId: T(7) }, 'ok'], [{ act: 'switch', ref: 't2', targetId: T(2) }, 'not_your_tab'], [{ act: 'switch', ref: 't5', targetId: T(8) }, 'not_your_tab'], [{ act: 'switch', ref: 't1', targetId: T(1) }, 'not_your_tab'],
    [{ act: 'switch', ref: 't9', targetId: null }, 'no_such_tab'], [{ act: 'close', ref: 't4', targetId: T(7) }, 'ok'], [{ act: 'close', ref: null }, 'ok+cur'], [{ act: 'close', ref: 't3', targetId: T(4) }, 'ok+cur'],
    [{ act: 'close', ref: 't2', targetId: T(2) }, 'not_your_tab'], [{ act: 'close', ref: null, current: null }, 'no_such_tab'], [{ act: 'close', ref: 't4', targetId: T(7), own: null }, 'tabs_unreadable'], [{ act: 'list', own: null }, 'tabs_unreadable'], [{ act: 'drop' }, 'bad-request'],
  ];
  const badA = AT.filter(([x, w]) => AV(x) !== w).map(([x, w]) => `${J(x)} ⇒ ${AV(x)} (want ${w})`);
  leg(!badA.length, `the AGENT'S VERDICT (${AT.length} cells): its own tabs only; the user's, B's and the keeper's launch tab refused not_your_tab; its current closable and said; unreadable ⇒ closed`, badA);
  // the user's verdict — every cell
  const UV = (x) => { const r = TT.userTabVerdict({ counts: { agent: 3, you: 2 }, ...x }); return r.ok ? 'ok:' + r.via + (r.noop ? ':noop' : '') + (r.adopt ? ':adopt' : '') : r.code; };
  const UT = [
    // his browsing window
    [{ act: 'switch', owner: 'you', human: true }, 'ok:human'], [{ act: 'switch', owner: 'you', human: true, active: true }, 'ok:human:noop'], [{ act: 'close', owner: 'you', human: true }, 'ok:human'],
    [{ act: 'close', owner: 'you', human: true, counts: { you: 1 } }, 'last_tab'], [{ act: 'switch', owner: 'other', human: true }, 'not_your_tab'], [{ act: 'close', owner: 'other', human: true }, 'not_your_tab'],
    [{ act: 'switch', owner: 'orphan', human: true, adoptable: true }, 'ok:human:adopt'], [{ act: 'switch', owner: 'orphan', human: true, adoptable: false }, 'not_your_tab'], [{ act: 'close', owner: 'orphan', human: true, adoptable: true }, 'not_your_tab'],
    // a conversation's live view
    [{ act: 'switch', owner: 'agent', driving: true }, 'ok:lease'], [{ act: 'close', owner: 'agent', driving: true }, 'ok:lease'], [{ act: 'switch', owner: 'agent', driving: true, active: true }, 'ok:lease:noop'],
    [{ act: 'switch', owner: 'agent', driving: false }, 'take_over_first'], [{ act: 'close', owner: 'agent', driving: false }, 'take_over_first'],
    [{ act: 'close', owner: 'agent', driving: true, counts: { agent: 1 } }, 'last_tab'], [{ act: 'switch', owner: 'agent', driving: true, mediated: true }, 'mediated_tabs'], [{ act: 'close', owner: 'agent', driving: true, mediated: true }, 'mediated_tabs'],
    [{ act: 'close', owner: 'you' }, 'ok:human'], [{ act: 'close', owner: 'you', counts: { you: 1 } }, 'last_tab'], [{ act: 'switch', owner: 'you' }, 'not_your_tab'],
    [{ act: 'switch', owner: 'other', driving: true }, 'not_your_tab'], [{ act: 'close', owner: 'other', driving: true }, 'not_your_tab'], [{ act: 'close', owner: 'orphan', driving: true }, 'not_your_tab'], [{ act: 'switch', owner: 'orphan', driving: true, adoptable: true }, 'not_your_tab'],
    [{ act: 'drag', owner: 'agent', driving: true }, 'bad-request'],
  ];
  const badU = UT.filter(([x, w]) => UV(x) !== w).map(([x, w]) => `${J(x)} ⇒ ${UV(x)} (want ${w})`);
  leg(!badU.length, `the USER'S VERDICT (${UT.length} cells): his tabs always (never his last), the agent's only while he drives (never its last, never mediated), another conversation's / nobody's never from a conversation's view`, badU);
  // the row model: no control the verdict refuses
  const rowTabs = listed.map((x) => ({ ...x }));
  const owWords = { [T(1)]: 'orphan', [T(2)]: 'you', [T(4)]: 'agent', [T(7)]: 'agent', [T(8)]: 'other' };
  const walk = [];
  for (const human of [false, true]) for (const driving of [false, true]) for (const mediated of [false, true]) for (const adoptable of [false, true]) {
    const m = TT.tabRowModel({ tabs: rowTabs, owners: human ? { ...owWords, [T(4)]: 'other', [T(7)]: 'other' } : owWords, viewer: { human }, driving, mediated, adoptable });
    for (const r of m.rows) {
      const f = { owner: r.owner, human, driving, mediated, counts: m.counts, active: r.active, adoptable };
      const sw = TT.userTabVerdict({ act: 'switch', ...f }), cl = TT.userTabVerdict({ act: 'close', ...f });
      if (r.canSwitch !== (sw.ok && !sw.noop) || r.canClose !== cl.ok) walk.push({ human, driving, mediated, adoptable, r: r.targetId.slice(0, 4), canSwitch: r.canSwitch, canClose: r.canClose, sw: sw.code || 'ok', cl: cl.code || 'ok' });
      if (r.owner === 'other' && (r.canSwitch || r.canClose)) walk.push({ other: r.targetId });
    }
  }
  leg(!walk.length, 'THE ROW MODEL draws exactly what the verdict allows — 16 viewer states × every tab (never a control on another conversation\'s tab)', walk);
  const m0 = TT.tabRowModel({ tabs: rowTabs, owners: owWords, viewer: { human: false }, driving: true });
  const rA = m0.rows.find((r) => r.targetId === T(4));
  leg(rA.mark === 'The agent’s' && rA.canClose && !rA.canSwitch && m0.rows.find((r) => r.targetId === T(7)).canSwitch && m0.rows.find((r) => r.targetId === T(8)).markTip === 'Another conversation’s — open its live view to use it' && TT.chipTitle('x'.repeat(40), '') === 'x'.repeat(23) + '…' && TT.chipTitle('', 'https://www.shop.example/a') === 'shop.example' && TT.tabRowModel({ tabs: [{ targetId: T(99), title: 'x', url: 'https://x.example/' }], owners: {} }).rows[0].owner === 'orphan',
    'the row: marks + tooltips in words, the chip title ≤ 24 (the host when the page has none), a tab not judged yet is nobody\'s (nothing drawn on it)');
  // accept-fixes F4 + F9 (the owner's acceptance of 2.369.202: two chips "en.wikipedia.org/wiki/T… · agent 的", no telling
  // which one the agent works on): the agent's current tab says so ON its chip; chips that would read the same keep their tails
  {
    const tw = [{ targetId: T(1), title: 'en.wikipedia.org/wiki/Tide', url: 'https://en.wikipedia.org/wiki/Tide', active: true }, { targetId: T(2), title: 'en.wikipedia.org/wiki/Tide_pool', url: 'https://en.wikipedia.org/wiki/Tide_pool' }, { targetId: T(3), title: 'Tide - Wikipedia', url: 'https://en.wikipedia.org/wiki/Tide' }];
    const mm = TT.tabRowModel({ tabs: tw, owners: { [T(1)]: 'agent', [T(2)]: 'agent', [T(3)]: 'other' }, viewer: { human: false } });
    const [a, b, c] = mm.rows;
    leg(a.here === true && a.hereText === 'The agent is here' && b.here === false && b.hereText === '' && c.here === false && /Tide$/.test(a.title) && /Tide_pool$/.test(b.title) && a.title !== b.title && Array.from(a.title).length <= 24 && Array.from(b.title).length <= 24 && c.title === 'Tide - Wikipedia',
      'accept-fixes F4/F9: the agent\'s current tab carries "The agent is here" on its chip (no other chip does); two chips that cut to the same words keep their tails (≤ 24); a short title stays whole', mm.rows.map((r) => ({ title: r.title, here: r.here })));
  }
  // accept-fixes-strip F7 (the owner: "en.wikipedia.org/wiki/Tide" where `open` printed "Tide - Wikipedia") — the REAL
  // 0.38.1's rows, captured: its `tab list --json` (and the stream's `tabs` record) keep the title a tab had while it loaded
  {
    const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/agent-browser-0.38.1/tab-list-titles.json'), 'utf8'));
    const rows = fx.tabList.data.tabs;
    const mm = TT.tabRowModel({ tabs: rows, owners: Object.fromEntries(rows.map((x) => [x.targetId, 'agent'])), viewer: { human: false }, titles: fx.cdpTitles });
    const bare = TT.tabRowModel({ tabs: rows, owners: Object.fromEntries(rows.map((x) => [x.targetId, 'agent'])), viewer: { human: false } });
    leg(rows.every((x) => TT.isUrlTitle(x.title, x.url)) && mm.rows.map((r) => r.title).join('|') === 'Tide - Wikipedia|Late title' && mm.rows.every((r) => !/127\.0\.0\.1/.test(r.title)) && /^Tide - Wikipedia — http/.test(mm.rows[0].tip)
      && bare.rows.every((r) => /^127\.0\.0\.1/.test(r.title)) && bare.rows[0].title !== bare.rows[1].title && TT.pageTitleOf({ title: 'Docs', url: 'https://d.example/x' }, '') === 'Docs' && TT.pageTitleOf({ title: 'en.wikipedia.org/wiki/Tide', url: 'https://en.wikipedia.org/wiki/Tide' }, 'en.wikipedia.org/wiki/Tide') === ''
      && !TT.isUrlTitle('Tide - Wikipedia', 'https://en.wikipedia.org/wiki/Tide') && TT.isUrlTitle('www.shop.example/a', 'https://www.shop.example/a') && JSON.stringify(TT.titlesOf([{ targetId: rows[0].targetId, type: 'page', title: 'T' }, { targetId: 'F'.repeat(32), type: 'iframe', title: 'no' }])) === JSON.stringify({ [rows[0].targetId]: 'T' }) && TT.pageRows([{ targetId: rows[1].targetId, title: ' Late title ', url: 'http://x/late' }])[0].title === 'Late title',
      'accept-fixes-strip F7: the REAL 0.38.1 rows (captured) name each tab by its address; the chip takes the PAGE\'s title (CDP\'s); without one it says the host (two on one host keep their tails, F9) — never an address dressed as a title', mm.rows.map((r) => r.title).concat(bare.rows.map((r) => r.title)));
  }
  // accept-fixes-strip F8 (the owner: 「中间俩不能点，有俩能点的也让人困惑」): another holder's tab names its holder by NAME;
  // a blank tab nobody holds is not a chip (the tab on show always is)
  {
    const tb = [{ targetId: T(1), title: 'Tide - Wikipedia', url: 'https://en.wikipedia.org/wiki/Tide', active: true }, { targetId: T(2), title: '', url: 'about:blank' }, { targetId: T(3), title: 'Example Domain', url: 'https://example.com/' }, { targetId: T(4), title: 'Jobs', url: 'https://j.example/' }, { targetId: T(5), title: '', url: 'about:blank' }];
    const mm = TT.tabRowModel({ tabs: tb, owners: { [T(1)]: 'agent', [T(2)]: 'orphan', [T(3)]: 'other', [T(4)]: 'other', [T(5)]: 'agent' }, viewer: { human: false }, names: { [T(3)]: 'office-devices', [T(4)]: 'a very long conversation name that goes on' } });
    const by = Object.fromEntries(mm.rows.map((r) => [r.targetId, r]));
    const anon = TT.tabRowModel({ tabs: tb, owners: { [T(3)]: 'other' }, viewer: { human: false } });
    leg(!by[T(2)] && !!by[T(5)] && by[T(3)].mark === 'office-devices' && /^office-devices’s tab — watch it here \(view only\)/.test(by[T(3)].markTip) && Array.from(by[T(4)].mark).length === 24 && /…$/.test(by[T(4)].mark)
      && TT.tabRowModel({ tabs: tb, owners: { [T(3)]: 'other' }, viewer: { human: false } }).rows.find((r) => r.targetId === T(3)).mark === 'Another conversation’s' && anon.rows.some((r) => r.targetId === T(1)) && !anon.rows.some((r) => r.targetId === T(2)) && TT.BLANK_URL_RE.test('chrome://newtab/') && !TT.BLANK_URL_RE.test('https://x.example/'),
      'accept-fixes-strip F8: another conversation\'s tab says WHOSE by name (≤ 24, the full words in its tip), "Another conversation’s" only when no name is known; a blank tab nobody holds is not drawn — the agent\'s blank tab and the tab on show are', mm.rows.map((r) => r.targetId.slice(0, 2) + ':' + r.mark));
  }
  // the handback sentence
  const s1 = TT.userActsSentence([{ kind: 'tab-close', title: 'Cart', url: 'https://shop.example/cart' }, { kind: 'tab-switch', title: 'Docs', url: 'https://d.example/' }, { kind: 'tab-close', title: '', url: 'https://x.example/' }]);
  leg(s1 === 'While driving, the user closed 2 of your tabs (“Cart — https://shop.example/cart”, “https://x.example/”) and switched your current tab to “Docs — https://d.example/”.' && TT.userActsSentence([]) === '' && TT.userActsSentence([{ kind: 'x' }]) === '', 'the handback sentence names what the user closed and where he left the agent', s1);
  const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'tab-close', title: 't' + i, url: 'https://x.example/' + i }));
  const kept = many.reduce((a, x) => TT.noteUserActIn(a, x), []);
  leg(kept.length === 16 && kept[0].title === 't14' && /closed 16 of your tabs .*and 10 more/.test(TT.userActsSentence(kept)), 'the cycle keeps 16 acts (the newest), the sentence names 6 and counts the rest');
  // lane browser-tabs-by-window (the owner, 2026-10-08): THE TABS BY WINDOW — the owner's instance as the fixture (profile
  // hanabi-work: this conversation's window 896114259, 企业助手's window 896114295, each with its blank anchor)
  {
    const WA = 896114259, WB = 896114295, A = T(41), B = T(42), C = T(43), D = T(44);
    const tabs = [{ targetId: A, url: 'https://enterprise.example/', active: true, windowId: WA }, { targetId: B, url: 'https://read.example/r', windowId: WB }, { targetId: C, url: 'about:blank', windowId: WA }, { targetId: D, url: 'about:blank', windowId: WB }];
    const leases = [{ windowId: WA, holder: { word: 'agent' } }, { windowId: WB, holder: { word: 'other', name: '企业助手' } }];
    const g = TT.tabGroups({ tabs, leases });
    leg(g.grouped && g.groups.map((x) => x.kind).join() === 'own,holder' && g.groups[0].label === 'This window' && g.groups[1].label === '企业助手’s window' && JSON.stringify(g.order) === JSON.stringify([A, B]), 'BY WINDOW: this window first, then 企业助手’s window by name (the owner\'s two leases)', g);
    leg(JSON.stringify(g.groups.map((x) => x.blanks)) === JSON.stringify([[C], [D]]) && g.blanks === 2 && g.groups[0].blankText === '+1 blank' && TT.tabsCountText(g) === '2 · +2 blank', 'BY WINDOW anchors: each window\'s blank folds into its own head ("+1 blank"); the pane count "2 · +2 blank"', g);
    // the holders' order (the user first, then the conversations by age) — never re-sorted; unknown + unclaimed last
    const g2 = TT.tabGroups({ tabs: [{ targetId: T(51), url: 'https://x.example/', windowId: 7 }, { targetId: T(52), url: 'https://y.example/', windowId: 9 }, { targetId: T(53), url: 'https://z.example/', windowId: 8 }, { targetId: T(54), url: 'https://q.example/', windowId: null }, { targetId: T(55), url: 'https://w.example/', windowId: 11 }, { targetId: T(56), url: 'https://me.example/', active: true, windowId: 5 }],
      leases: [{ windowId: 9, holder: { word: 'you' } }, { windowId: 5, holder: { word: 'agent' } }, { windowId: 8, holder: { word: 'other', name: 'Zed' } }, { windowId: 7, holder: { word: 'other' } }] });
    leg(g2.groups.map((x) => x.label).join('|') === 'This window|Your window|Zed’s window|Another conversation’s window|Elsewhere in this browser' && JSON.stringify(g2.groups[4].targetIds) === JSON.stringify([T(54), T(55)]), 'BY WINDOW order: own, then each holder in the holders\' order (yours, Zed’s, an unnamed one), an unread or unclaimed window last', g2.groups);
    // a lease without a window id names no group: its tabs are Elsewhere, never guessed from their owner
    const g3 = TT.tabGroups({ tabs: [{ targetId: A, url: 'https://a.example/', active: true, windowId: WA }, { targetId: B, url: 'https://b.example/', windowId: WB }], leases: [{ windowId: WA, holder: { word: 'agent' } }, { windowId: null, holder: { word: 'other', name: 'Yan' } }] });
    leg(g3.groups.map((x) => x.kind).join() === 'own,elsewhere' && !JSON.stringify(g3).includes('Yan'), 'BY WINDOW never guessed: a lease without a window id names no group — its tab is "Elsewhere in this browser"', g3);
    // the anchor rule's edges: alone ⇒ kept; all blank ⇒ the first kept; the tab on show never folded (never "here"); unread window ⇒ kept
    const g4 = TT.tabGroups({ tabs: [{ targetId: T(61), url: 'about:blank', windowId: 3 }, { targetId: T(62), url: 'about:blank', windowId: 4 }, { targetId: T(63), url: 'about:blank', windowId: 4 }, { targetId: T(64), url: 'about:blank', active: true, windowId: 6 }, { targetId: T(65), url: 'https://p.example/', windowId: 6 }, { targetId: T(66), url: 'about:blank', windowId: null }, { targetId: T(67), url: 'https://u.example/', windowId: null }], leases: [{ windowId: 6, holder: { word: 'agent' } }] });
    leg(JSON.stringify(g4.order.slice().sort()) === JSON.stringify([T(61), T(62), T(64), T(65), T(66), T(67)].sort()) && g4.blanks === 1 && g4.groups.some((x) => x.blanks.includes(T(63))), 'BY WINDOW anchors kept: a window\'s only tab, the first of an all-blank window, the blank on show, a blank whose window is unread', g4);
    const m4 = TT.tabRowModel({ tabs: [{ targetId: T(71), url: 'about:blank', active: true }, { targetId: T(72), url: 'https://p.example/' }, { targetId: T(73), url: 'about:blank' }], owners: { [T(71)]: 'agent', [T(72)]: 'agent', [T(73)]: 'agent' }, windows: { [T(71)]: 6, [T(72)]: 6, [T(73)]: 6 }, leases: [{ windowId: 6, holder: { word: 'agent' } }] });
    leg(m4.rows.length === 2 && m4.rows.find((x) => x.targetId === T(71)).here && !m4.rows.some((x) => x.targetId === T(73)) && m4.blanks === 1 && m4.counts.agent === 3, 'BY WINDOW the row: the blank on show stays "the agent is here", a spare blank of its window folds (never counted out of the last-tab rule)', m4);
    // the row model draws in GROUP order (own window first even when the browser lists it last), each row knows its group
    const m5 = TT.tabRowModel({ tabs: [{ targetId: B, title: 'Read', url: 'https://read.example/r' }, { targetId: A, title: 'Ent', url: 'https://enterprise.example/', active: true }], owners: { [A]: 'agent', [B]: 'other' }, names: { [B]: '企业助手' }, windows: { [A]: WA, [B]: WB }, leases });
    leg(m5.grouped && m5.rows.map((x) => x.targetId).join() === [A, B].join() && m5.rows[0].group === m5.groups[0].key && m5.rows[1].group === m5.groups[1].key && m5.rows[1].mark === '企业助手', 'BY WINDOW the row model: this window\'s chip first, then 企业助手’s (its mark names it), each row knows its group', m5.rows);
    // an old record (no windows, no leases) = the flat row as before
    const m6 = TT.tabRowModel({ tabs: [{ targetId: B, url: 'https://read.example/r' }, { targetId: A, url: 'https://e.example/', active: true }], owners: { [A]: 'agent', [B]: 'agent' } });
    leg(!m6.grouped && m6.rows.map((x) => x.targetId).join() === [B, A].join() && m6.blanks === 0, 'BY WINDOW absent: a record without windows keeps the browser\'s order, one group, nothing folded', m6);
    const words = [g, g2, g3, g4, m5].flatMap((x) => x.groups).map((x) => `${x.label} ${x.tip} ${x.blankText}`).join(' | ');
    leg(!/\d{6,}/.test(words) && /This window/.test(words), 'BY WINDOW ids never in words: no digit run of 6+ in any head, tip or count (Chrome\'s window ids are 9 digits)', words);
  }
  return legs;
}
for (const l of pureLegs(TB)) ok(l.c, l.n, l.extra);
// verify r2 (F4, bound before parse): the readers of a browser's page list (Chrome's own, unbounded) are LINEAR, and a
// page-chosen title / url is cut before it is walked — measured, not trusted (the peer-parser census carries the rows)
{
  const hex = (i) => i.toString(16).toUpperCase().padStart(32, '0');
  // in WORK (lane work-meter-judges, .209): scripts/work-meter.mjs in a child — the clock judged these at their bounds
  const TBF = path.join(REPO, 'src/browser-tabs.js'), HEX = "const hex = (i) => i.toString(16).toUpperCase().padStart(32, '0');";
  const chain = (n) => Array.from({ length: n }, (_, i) => ({ targetId: hex(i), type: 'page', openerId: i + 1 < n ? hex(i + 1) : undefined }));
  const own = judgeInChild({ module: TBF, run: '(M, x) => M.tabOwners(x)', mk: `(n) => { ${HEX} return { targets: Array.from({ length: n }, (_, i) => ({ targetId: hex(i), type: 'page', openerId: i + 1 < n ? hex(i + 1) : undefined })), holders: [{ key: 'k', roots: n ? [hex(n - 1)] : [] }] }; }`, n: 4000, kind: 'linear' });
  const o8 = TB.tabOwners({ targets: chain(8000), holders: [{ key: KA, roots: [hex(7999)] }] });
  ok(own.ok && o8.size === 8000 && [...o8.values()].every((k) => k === KA), `tabOwners is LINEAR in WORK on a chain of 4 000 → 8 000 popups (×${(own.r || 0).toFixed(2)} ≤ ${LINEAR_BOUND}; the fixpoint it replaced took 1.2 s) and still owns the whole chain`, own);
  const cr = judgeInChild({ module: TBF, run: '(M, x) => M.cleanRoots(x)', mk: `(n) => { ${HEX} return Array.from({ length: n }, (_, i) => hex(i)); }`, n: 4000, kind: 'linear' });
  ok(cr.ok && TB.cleanRoots([hex(1), hex(1).toLowerCase(), hex(2)]).join() === [hex(1), hex(2)].join(), `cleanRoots dedupes 4 000 → 8 000 ids linearly in WORK (×${(cr.r || 0).toFixed(2)}: a Set, never includes-per-item)`, cr);
  const big = 'T'.repeat(1024 * 1024);
  const ct = judgeInChild({ module: TBF, run: "(M, x) => M.chipTitle(x, 'https://x.example/')", mk: "(n) => 'T'.repeat(n)", n: 1024 * 1024, kind: 'bounded' });
  const rm = TB.tabRowModel({ tabs: [{ targetId: hex(1), title: big, url: 'https://x.example/' + 'a'.repeat(100000), active: true }], owners: { [hex(1)]: 'agent' }, viewer: {}, driving: true });
  ok(ct.ok && TB.chipTitle(big, '').length === 24 && rm.rows[0].tip.length <= 300 + 3 + 2048 && rm.rows[0].url.length === 2048, `a 1 MiB page title is cut before the code-point walk (WORK at 1 / 2 MiB: ${ct.w1} / ${ct.w2}); the row's tip / url are bounded (300 / 2048)`, { ct, tip: rm.rows[0].tip.length, url: rm.rows[0].url.length });
}
{
  // CONTROLS (patched copies, scripts/mutant-copy.mjs): each must turn a leg above red
  const src = fs.readFileSync(path.join(REPO, 'src/browser-tabs.js'), 'utf8');
  const redOf = (needle, repl, tag) => { if (!src.includes(needle)) throw new Error(`ANCHOR GONE ${JSON.stringify(String(needle).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`); const C = M.load('src/browser-tabs.js', editAnchor(src, needle, repl, "src/browser-tabs.js"), tag); return pureLegs(C, '[' + tag + '] ').filter((l) => !l.c).map((l) => l.n); };
  const c1 = redOf("  if (owner === 'other' || human) return no('not_your_tab');\n", "  if (human) return no('not_your_tab');\n", 'other-closable');
  ok(Array.isArray(c1) && c1.some((n) => /USER'S VERDICT/.test(n)) && c1.some((n) => /ROW MODEL/.test(n) || /USER/.test(n)), 'CONTROL: a verdict that lets the user switch / close ANOTHER conversation\'s tab from a view he drives — the verdict + row legs go red', c1);
  const c2 = redOf("  const own = rows.filter((x) => owners.get(idKey(x.targetId)) === str(me)).map(tabRow);", '  const own = rows.map(tabRow);', 'view-leaks');
  ok(Array.isArray(c2) && c2.some((n) => /AGENT'S VIEW/.test(n)), 'CONTROL: an agent view that lists every tab (another holder\'s title and url) — red', c2);
  const c3 = redOf("  for (const h of hs) for (const r of cleanRoots(h.roots)) if (present.has(r) && !out.has(r)) out.set(r, str(h.key));\n  spread();\n  for (const h of hs) { const a = idKey(h.active); if (isTargetId(a) && present.has(a) && !out.has(a)) out.set(a, str(h.key)); }\n",
    "  for (const h of hs) { const a = idKey(h.active); if (isTargetId(a) && present.has(a) && !out.has(a)) out.set(a, str(h.key)); }\n  for (const h of hs) for (const r of cleanRoots(h.roots)) if (present.has(r) && !out.has(r)) out.set(r, str(h.key));\n  spread();\n", 'active-first');
  ok(Array.isArray(c3) && c3.some((n) => /ACTIVE never outranks/.test(n)), 'CONTROL: an ownership rule where a session\'s ACTIVE tab outranks the user\'s root — red', c3);
  // accept-fixes-strip: the F7 / F8 rules each turn their leg red when taken out
  const c4 = redOf("    .map((x) => ({ ...x, title: pageTitleOf(x, tt[idKey(x.targetId)]) }))\n", "    .map((x) => ({ ...x }))\n", 'binary-titles');
  ok(Array.isArray(c4) && c4.some((n) => /F7/.test(n)), 'CONTROL F7: a row model that keeps the binary\'s titles (the 2.369.202 shape) — the F7 leg goes red', c4);
  const c5 = redOf("  for (const v of [cdpTitle, row && row.title]) { const t = str(v).trim().slice(0, 300); if (t && !isUrlTitle(t, url)) return t; }\n", "  for (const v of [cdpTitle, row && row.title]) { const t = str(v).trim().slice(0, 300); if (t) return t; }\n", 'address-as-title');
  ok(Array.isArray(c5) && c5.some((n) => /F7/.test(n)), 'CONTROL F7: a title rule that accepts an address dressed as a title — red', c5);
  const c6 = redOf("  if (owner === 'other') return name ? str(name) : t('Another conversation’s');\n", "  if (owner === 'other') return t('Another conversation’s');\n", 'no-names');
  ok(Array.isArray(c6) && c6.some((n) => /F8/.test(n)), 'CONTROL F8: a mark that never names the holder ("Another conversation’s", the 2.369.202 words) — red', c6);
  const c7 = redOf("    .filter((x) => x.active || idKey(x.targetId) === frontId || wordOf(x) !== 'orphan' || !BLANK_URL_RE.test(str(x.url).trim()));\n", "    .filter(Boolean);\n", 'blank-orphans'); // B-e674 unit 1: the line also keeps a foreign front tab
  ok(Array.isArray(c7) && c7.some((n) => /F8/.test(n)), 'CONTROL F8: a row that draws a blank tab nobody holds ("about:blank · Nobody’s") — red', c7);
  // lane browser-tabs-by-window: a copy that FLATTENS the groups, a copy that prints the window id — each red
  const c8 = redOf("  for (const x of list) (at.get(x.win) || groups[groups.length - 1]).members.push(x);\n", "  for (const x of list) groups[groups.length - 1].members.push(x);\n", 'flat-tabs');
  ok(Array.isArray(c8) && c8.some((n) => /BY WINDOW: this window first/.test(n)), 'CONTROL: a copy that lists the browser\'s tabs flat (the owner\'s "two agents in one window") — the BY WINDOW legs go red', c8);
  const c9 = redOf("heads.push({ kind: 'holder', win: l.win, label: windowLabelText('holder', l, tIn) });", "heads.push({ kind: 'holder', win: l.win, label: windowLabelText('holder', l, tIn) + ' #' + l.win });", 'window-id-words');
  ok(Array.isArray(c9) && c9.some((n) => /ids never in words/.test(n)), 'CONTROL: a copy that prints Chrome\'s window id in a head — the ids-never-in-words leg goes red', c9);
}

// ═══ the fake agent-browser: ONE shared Chrome per namespace (the measured 0.38.1 shapes) ═══════════════════════
// every session of a namespace sees every tab; a session's FIRST command binds a NEW tab of its own; `tab new` answers
// {tabId, targetId} and becomes the session's tab; `tab <ref>` switches; `tab close [ref]` closes ANY tab (the session's
// own when no ref) and every session bound to it answers `tab_gone` (with --pin-tab) until it switches / opens one.
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
const TK = require('../src/browser-takeover.js');
const express = require('express');
const BIN = path.join(ROOT, 'bin'), AB = path.join(ROOT, 'ab'), HOME = path.join(ROOT, 'home'), DATA = path.join(ROOT, 'data'), XDG = path.join(ROOT, 'x');
for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), DATA, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
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
if (a === 'get' && b === 'cdp-url') { if (!live) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
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
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const env = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
const nsState = (ns) => { try { return JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8')); } catch { return null; } };
const cmds = () => { try { return fs.readFileSync(path.join(AB, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const cmdsOf = (sess) => cmds().filter((c) => c.sess === sess).map((c) => c.argv.join(' '));
// the keeper's CDP read: Target.getTargets over the fake browser (the namespace named by the url) — pages with their openers
let readFail = false, reads = 0;
const readTargets = async (url) => { reads++; if (readFail) return { ok: false, error: 'fake: no CDP' }; const m = /fake-(.+)$/.exec(String(url)); const s = m ? nsState(m[1]) : null; return s ? { ok: true, targets: s.tabs.map((t) => ({ targetId: t.targetId, type: 'page', openerId: t.opener || undefined })) } : { ok: false, error: 'fake: no browser' }; };
const quiet = { log() { }, warn() { }, error() { } };
const journal = [];
const jlog = { log: (x) => journal.push(String(x)), warn: (x) => journal.push(String(x)), error() { } };
let clock = 1_900_000_000_000;
const live = new Set([KA, KB]);
const mkKeeper = (Kmod, extra = {}) => Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: jlog, install: false, now: () => clock, readTargets, conversationFacts: () => ({ turn: 'idle' }), ...extra });
const k = mkKeeper(K);
await k._facts.probeVersion();
const tok = (c) => 'vsst_' + String(c).repeat(24);
const sA = { agentToken: tok('a'), _browserKey: KA, name: 'Fix login', webuiName: 'Fix login', mode: 'chat', claudeSessionId: 'conv-a' };
const sB = { agentToken: tok('b'), _browserKey: KB, name: 'Report', webuiName: 'Report', mode: 'chat', claudeSessionId: 'conv-b' };
const active = new Map([['sess-a', sA], ['sess-b', sB]]);
const R = require('../src/routes/browser.js');
R.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
const app = express(); app.use(express.json()); app.use(R.router);
const srv = http.createServer(app); servers.push(srv);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const tabCmd = (s, argv) => j('POST', '/api/agent/browser/tab', { argv }, as(s));

console.log('— ② the real keeper + route over a fake 0.38.1 (one shared Chrome): the agent\'s own tabs only, the user\'s row, the handback');
let work, NS, HUK, hisTab, aTab, bTab, aNew;
{
  work = (await j('POST', '/api/browser/profiles', { label: 'Work' })).json.profile;
  NS = B.sessionNameFor(work.id); HUK = require('../src/browser-human.js').humanKeyFor(work.id);
  let r = await j('POST', `/api/browser/profiles/${work.id}/browse`, {});
  ok(r.status === 200 && r.json.ok, 'the user browses "Work" himself (the keeper launches it; his own tab)', r.json);
  hisTab = nsState(NS).sessions['vs-' + HUK];
  // the two conversations attach and open a page each — under their OWN lease sessions (what the CLI's binary run does)
  for (const s of [sA, sB]) { r = await j('POST', '/api/agent/browser/use', { profile: 'Work' }, as(s)); if (r.status !== 200) break; }
  ok(r.status === 200, 'conversations "Fix login" and "Report" attach to the same browser (one Chrome)', r.json);
  const run = async (bk, argv) => { const o = await k.leaseCliOpts(work.id, bk); return k._runtime.exec(NS, argv, o); };
  const ra = await run(KA, ['--pin-tab', 'open', 'https://a.example/1']); const rb = await run(KB, ['--pin-tab', 'open', 'https://b.example/secret-report']);
  aTab = ra.json.data.targetId; bTab = rb.json.data.targetId;
  // …and each command's AUDIT (the CLI's, after the binary): an attachment's first command names its first tab ROOT
  for (const s of [sA, sB]) await j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'open', ok: true }, as(s));
  const rootsOf = (bk) => (k._reg().leases.find((l) => l.profileId === work.id && l.browserKey === bk) || {}).tabRoots || [];
  ok(J(rootsOf(KA)) === J([aTab]) && J(rootsOf(KB)) === J([bTab]), 'the AUDIT after each conversation\'s first command records ITS tab as its first root (its session bound a new tab of its own — measured)', { a: rootsOf(KA), b: rootsOf(KB) });
  const st0 = nsState(NS);
  ok(st0.tabs.length === 4 && aTab && bTab && aTab !== bTab, 'ONE Chrome: the keeper\'s launch tab, his tab, A\'s tab, B\'s tab (each session bound its own at its first command)', st0.tabs.map((t) => t.tabId + ' ' + t.url));
  // ── the agent's list: its own + a count
  const n0 = cmds().length;
  r = await tabCmd(sA, ['tab', 'list', '--json']);
  ok(r.status === 200 && r.json.ok && r.json.view && r.json.view.tabs.length === 1 && r.json.view.tabs[0].targetId === aTab && r.json.view.tabs[0].current && r.json.view.others === 3 && !J(r.json).includes('secret-report') && !J(r.json).includes(bTab) && !J(r.json).includes(HUK),
    'the agent\'s `tab list`: ITS tab (current) + "3 other tabs" — B\'s page (title, url, id) and the user\'s key never in the answer', r.json);
  ok(cmds().slice(n0).every((c) => c.sess === 'vs-' + KA && /^tab list --json$/.test(c.argv.join(' '))), 'the list is ONE `tab list` under ITS OWN session (nothing under another\'s)', cmds().slice(n0));
  // ── tab new ⇒ a ROOT
  r = await tabCmd(sA, ['tab', 'new', 'https://a.example/2']);
  aNew = r.json && r.json.opened ? r.json.opened.targetId : null;
  const lease = () => k._reg().leases.find((l) => l.profileId === work.id && l.browserKey === KA);
  ok(r.status === 200 && aNew && lease().tabRoots.includes(aNew) && r.json.view.tabs.length === 2 && cmdsOf('vs-' + KA).some((c) => c === '--pin-tab tab new https://a.example/2 --json'), '`tab new <url>` runs under its session (--pin-tab, --json), its tab is a ROOT of its lease (persisted), the view names 2', { r: r.json, roots: lease().tabRoots });
  ok(!J(k.leasesOn(work.id)).includes('tabRoots') && !J(k.list()).includes(aNew), 'the roots never reach a view (the digest, a lease row) — target ids of a conversation\'s tabs are the keeper\'s own bookkeeping');
  // ── a FOREIGN close / switch is refused BEFORE any exec (the command log is the spy)
  const bRow = nsState(NS).tabs.find((t) => t.targetId === bTab);
  const n1 = cmds().length;
  const rc1 = await tabCmd(sA, ['tab', 'close', bTab]);
  const rc2 = await tabCmd(sA, ['tab', 'close', bRow.tabId]);
  const rc3 = await tabCmd(sA, ['tab', hisTab]);
  const rc4 = await tabCmd(sA, ['tab', 't1']);
  const after = cmds().slice(n1).map((c) => c.argv.join(' '));
  ok([rc1, rc2, rc3, rc4].every((x) => x.status === 403 && x.json.code === 'not_your_tab') && after.every((c) => c === 'tab list --json') && nsState(NS).tabs.some((t) => t.targetId === bTab),
    'another conversation\'s tab (by target id or t<N>), the user\'s tab, the keeper\'s launch tab — refused `not_your_tab`, NOTHING but a read ran (B\'s page is still there)', { codes: [rc1, rc2, rc3, rc4].map((x) => x.json && x.json.code), after });
  // ── its own: switch, then close its current (said)
  r = await tabCmd(sA, ['tab', aTab]);
  ok(r.status === 200 && r.json.switched && r.json.switched.targetId === aTab && nsState(NS).sessions['vs-' + KA] === aTab && cmdsOf('vs-' + KA).includes(`--pin-tab tab ${aTab} --json`), '`tab <own id>` switches under its session (by target id)', r.json);
  r = await tabCmd(sA, ['tab', 'close']);
  ok(r.status === 200 && r.json.closed && r.json.closed.targetId === aTab && r.json.closed.current && /tab_gone/.test(r.json.note) && !nsState(NS).tabs.some((t) => t.targetId === aTab) && !lease().tabRoots.includes(aTab), '`tab close` (no ref) closes ITS current tab — said: the next page verb answers tab_gone until it switches / opens one; the root is dropped', r.json);
  r = await tabCmd(sA, ['tab', 'list']);
  ok(r.status === 200 && r.json.view.tabs.length === 1 && r.json.view.tabs[0].targetId === aNew && !r.json.view.tabs[0].current, 'its list after: the other own tab (not current — its session is on a closed tab, the binary\'s own rule)', r.json.view);
  r = await tabCmd(sA, ['tab', aNew]);
  ok(r.status === 200, 'it switches to its other tab', r.json);
  // a popup its page opens stays its own (the opener rule) — and a popup of B's is not
  await run(KA, ['popup', 'https://a.example/pop']); await run(KB, ['popup', 'https://b.example/pop']);
  r = await tabCmd(sA, ['tab', 'list']);
  ok(r.status === 200 && r.json.view.tabs.length === 2 && r.json.view.tabs.some((x) => /a\.example\/pop/.test(x.url)) && !J(r.json).includes('b.example'), 'a popup ITS page opened is its own (Chrome\'s openerId); B\'s popup is counted, never named', r.json.view);
  // ── the words refused by the parser / the url belt
  const rw = await tabCmd(sA, ['tab', 'new', 'file:///etc/passwd']); const rp = await tabCmd(sA, ['tab', 'close', 't1', 't2']);
  ok(rw.status === 400 && rw.json.code === 'not_web' && rp.status === 400 && rp.json.code === 'bad-request', 'the server\'s belt: `tab new file://…` refused not_web; two refs refused bad-request');
  // ── an unreadable browser fails CLOSED
  readFail = true; const n2 = cmds().length;
  r = await tabCmd(sA, ['tab', 'close', aNew]);
  readFail = false;
  ok(r.status === 503 && r.json.code === 'tabs_unreadable' && cmds().slice(n2).every((c) => c.argv.join(' ') === 'tab list --json') && nsState(NS).tabs.some((t) => t.targetId === aNew), 'the CDP read fails ⇒ `tabs_unreadable`, nothing closed (fail closed)', r.json);
  // ── the one admission first: while the user drives it, browser_paused and nothing ran
  const tk = k.takeover({ browserKey: KA, profileId: work.id, viewerId: 7, sessionId: 'sess-a' });
  const n3 = cmds().length;
  r = await tabCmd(sA, ['tab', 'list']);
  ok(tk.ok && r.status === 409 && r.json.code === 'browser_paused' && cmds().length === n3, 'resolveFor FIRST: while the user drives it, the agent\'s `tab list` is refused browser_paused — nothing ran', r.json);
  // a conversation's own browser / an unattached one ⇒ passthrough (the binary runs as before: its browser holds only its tabs)
  const sC = { agentToken: tok('c'), _browserKey: 'bk-0000c0a3', name: 'C', webuiName: 'C', mode: 'chat', claudeSessionId: 'conv-c' }; active.set('sess-c', sC); live.add('bk-0000c0a3');
  r = await tabCmd(sC, ['tab', 'list']);
  ok(r.status === 200 && r.json.passthrough === true, 'a session with no attachment (its own browser) ⇒ passthrough — the CLI runs the binary as before', r.json);

  // ═══ the USER's row: while he drives A's view (viewer 7) ═══
  const T_A = { kind: 'attachment', profileId: work.id, sessionName: 'vs-' + KA, ns: NS };
  const own0 = await k.tabOwnersFor(T_A, { activeTarget: aNew });
  const aPop = nsState(NS).tabs.find((t) => /a\.example\/pop/.test(t.url)).targetId, bPop = nsState(NS).tabs.find((t) => /b\.example\/pop/.test(t.url)).targetId;
  const W = own0.owners || {};
  ok(own0.ok && W[aNew] === 'agent' && W[aPop] === 'agent' && W[bTab] === 'other' && W[bPop] === 'other' && W[hisTab] === 'you' && W[nsState(NS).tabs[0].targetId] === 'orphan' && !own0.adoptable, 'the view\'s words for A\'s live view: A\'s tabs `agent`, B\'s (and its popup) `other`, his `you`, the launch tab `orphan`', { W, hisTab });
  const own1 = await k.tabOwnersFor({ kind: 'human', key: HUK, profileId: work.id });
  ok(own1.ok && own1.owners[hisTab] === 'you' && own1.owners[aNew] === 'other' && own1.owners[bTab] === 'other' && own1.adoptable === false, 'his browsing window\'s words: his `you`, every conversation\'s `other`, nothing adoptable while conversations lease the browser', own1);
  const n4 = cmds().length;
  const refusedCode = async (x) => { try { await k.userTabAct(x); return 'ran'; } catch (e) { return e.code; } };
  const c1 = await refusedCode({ target: T_A, viewerId: 8, act: 'close', targetId: aPop }); // not the holder
  const c2 = await refusedCode({ target: T_A, viewerId: 7, act: 'close', targetId: bTab }); // another conversation's
  const c3 = await refusedCode({ target: T_A, viewerId: 7, act: 'switch', targetId: bPop });
  const c4 = await refusedCode({ target: T_A, viewerId: 7, act: 'switch', targetId: hisTab }); // his own tab is never the agent's current
  ok(c1 === 'take_over_first' && c2 === 'not_your_tab' && c3 === 'not_your_tab' && c4 === 'not_your_tab' && cmds().slice(n4).every((c) => c.argv.join(' ') === 'tab list --json'),
    'the user\'s row: a viewer that does not hold the takeover ⇒ take_over_first; B\'s tab / popup ⇒ not_your_tab; his own tab is never switched INTO the agent\'s session — nothing but reads ran', { c1, c2, c3, c4 });
  // he closes A's popup and switches A to … its only other tab, then tries its last
  let u = await k.userTabAct({ target: T_A, viewerId: 7, act: 'close', targetId: aPop });
  ok(u.ok && !nsState(NS).tabs.some((t) => t.targetId === aPop) && cmdsOf('vs-' + KA).includes(`tab close ${aPop} --json`), 'while he drives A\'s view: his ✕ on A\'s popup closes it under A\'s OWN session', u);
  const c5 = await refusedCode({ target: T_A, viewerId: 7, act: 'close', targetId: aNew });
  ok(c5 === 'last_tab' && nsState(NS).tabs.some((t) => t.targetId === aNew), 'A\'s LAST tab is never closed from the row (`last_tab` — Close all tabs quits the browser)', c5);
  // a second tab of A's, made current by the agent (before the takeover), then he closes the CURRENT one ⇒ A moves to a neighbour first
  const hb1 = k.handback({ browserKey: KA, profileId: work.id, viewerId: 7, cause: 'explicit' });
  ok(hb1.ok && /While driving, the user closed one of your tabs \(“Page a\.example\/pop — https:\/\/a\.example\/pop”\)\./.test(TK.handbackText({ cause: 'explicit', userActs: hb1.userActs })), 'the first handback says the popup he closed', hb1.userActs);
  r = await tabCmd(sA, ['tab', 'new', 'https://a.example/3']); const a3 = r.json.opened.targetId;
  k.takeover({ browserKey: KA, profileId: work.id, viewerId: 7, sessionId: 'sess-a' });
  u = await k.userTabAct({ target: T_A, viewerId: 7, act: 'close', targetId: a3 });
  ok(u.ok && u.switchedTo === aNew && nsState(NS).sessions['vs-' + KA] === aNew && !nsState(NS).tabs.some((t) => t.targetId === a3), 'his ✕ on A\'s CURRENT tab: A\'s session moves to a neighbour of its own FIRST (the view keeps a picture), then the tab closes', u);
  r = await tabCmd(sA, ['tab', 'new', 'https://a.example/4']); // refused: he drives
  ok(r.status === 409 && r.json.code === 'browser_paused', '(the agent still paused meanwhile)');
  const hb = k.handback({ browserKey: KA, profileId: work.id, viewerId: 7, cause: 'explicit' });
  const words = TK.handbackText({ cause: 'explicit', label: 'Work', url: 'https://a.example/2', heldMs: 5000, rerun: hb.rerun, userActs: hb.userActs });
  ok(hb.ok && hb.userActs.length === 2 && /While driving, the user closed one of your tabs \(“Page a\.example\/3 — https:\/\/a\.example\/3”\) and switched your current tab to “Page a\.example\/2 — https:\/\/a\.example\/2”\./.test(words) && /Re-run what was interrupted: tab/.test(words),
    'the HANDBACK SAYS what he did to its tabs (what he closed, where he left it) — one sentence in the handback\'s own words, before the re-run list (its refused `tab new`)', words);
  const nt = TK.handbackNotice({ cause: 'explicit', userActs: hb.userActs });
  ok(nt.userActs && nt.userActs.length === 2 && /closed one of your tabs/.test(TK.renderHandbackNotice(nt)), 'the zero-spend notice carries them too (a handback that is not delivered still says it)');
  // his own tab, from HIS window: never his last; a popup of his, then his own tab while it is on show
  const H = { kind: 'human', key: HUK, profileId: work.id };
  const c6 = await refusedCode({ target: H, act: 'close', targetId: hisTab });
  const c7 = await refusedCode({ target: H, act: 'close', targetId: aNew });
  ok(c6 === 'last_tab' && c7 === 'not_your_tab', 'his window: his ONLY tab ⇒ last_tab (Close ends his browsing); a conversation\'s tab ⇒ not_your_tab', { c6, c7 });
  const ho = await k.leaseCliOpts(work.id, HUK); await k._runtime.exec(NS, ['popup', 'https://h.example/login'], ho);
  const hPop = nsState(NS).tabs.find((t) => /h\.example/.test(t.url)).targetId;
  u = await k.userTabAct({ target: H, act: 'close', targetId: hisTab });
  const h2 = k._reg().humans[work.id];
  ok(u.ok && u.switchedTo === hPop && !nsState(NS).tabs.some((t) => t.targetId === hisTab) && h2.ownTab === hPop && nsState(NS).sessions['vs-' + HUK] === hPop, 'his ✕ on HIS tab while it is on show: his session moves to his popup first, the tab closes, and the popup becomes his own tab (his set stays his)', { u, own: h2.ownTab });
  // the orphan / adoptable facts in his window once no conversation leases the browser
  for (const s of [sA, sB]) await j('POST', '/api/agent/browser/detach', { profile: work.id }, as(s));
  const own2 = await k.tabOwnersFor(H);
  ok(own2.ok && own2.adoptable === true, 'no conversation leases it any more ⇒ his window\'s orphans are adoptable (the orphan rule, unchanged)', own2);
  // CONTROL: a keeper copy whose agent act skips the verdict closes B's page from A's command
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = "    const av = TBS.agentTabVerdict({ act: w.act, ref: w.ref, targetId, own: s0.own, current: s0.active });\n";
  ok(src.includes(needle), 'the agent verdict needle (the control removes it)');
  const Kc = M.load('src/server/browser-keeper.js', editAnchor(src, needle, "    const av = { ok: true, targetId: targetId || s0.active, closesCurrent: false };\n", "src/server/browser-keeper.js"), 'no-agent-verdict');
  const kc = mkKeeper(Kc, { dataDir: path.join(ROOT, 'data-c') });
  await kc._facts.probeVersion();
  const pc = kc.createProfile({ label: 'Ctl' });
  for (const bk of [KA, KB]) await kc.attach({ profileId: pc.id, browserKey: bk, sessionId: 'x-' + bk });
  const NSC = B.sessionNameFor(pc.id);
  const runC = async (bk, argv) => kc._runtime.exec(NSC, argv, await kc.leaseCliOpts(pc.id, bk));
  await runC(KA, ['--pin-tab', 'open', 'https://a.example/']); const rbc = await runC(KB, ['--pin-tab', 'open', 'https://b.example/']);
  const bc = rbc.json.data.targetId;
  let threw = null; try { await kc.agentTabAct({ browserKey: KA, argv: ['tab', 'close', bc] }); } catch (e) { threw = e.code; }
  ok(!nsState(NSC).tabs.some((t) => t.targetId === bc), 'CONTROL: a keeper copy without the agent verdict CLOSES B\'s page from A\'s `tab close` — the leg above can go red', { threw });
}

// ═══ ②b verify F3: the user's act re-asks the takeover AT THE EXEC ════════════════════════════════════════════
// `userTabAct` read `driving` once, then awaited the tab list + the CDP read(s) and ran `tab <neighbour>` / `tab close`
// under the conversation's session without asking again: a handback landing inside those awaits returned control to the
// agent and the close still ran, told to nobody (the cycle was closed). One leg, run on the product and two patched copies.
console.log('— ②b verify F3: a handback inside the reads refuses the act (nothing runs); inside the exec it still tells the agent; a failed exec takes its record back');
async function userActRaceLeg(Kmod, tag) {
  let readGate = null, readHit = null, execGate = null, execHit = null, failClose = false;
  const gatedRead = async (url) => { if (readGate) { const g = readGate; readGate = null; readHit?.(); await g; } return readTargets(url); };
  const rtBase = F.createBrowserRuntime({ env });
  const rtGated = { ...rtBase, exec: async (ns, argv, o) => { const a = (argv || []).join(' '); if (/\btab close\b/.test(a)) { if (execGate) { const g = execGate; execGate = null; execHit?.(); await g; } if (failClose) return { ok: true, json: { success: false, error: 'fake: the close was refused' } }; } return rtBase.exec(ns, argv, o); } };
  const kx = mkKeeper(Kmod, { dataDir: path.join(ROOT, 'data-f3-' + tag), readTargets: gatedRead, runtime: rtGated });
  await kx._facts.probeVersion();
  const px = kx.createProfile({ label: 'F3 ' + tag });
  for (const bk of [KA, KB]) await kx.attach({ profileId: px.id, browserKey: bk, sessionId: 'x-' + bk });
  const NSX = B.sessionNameFor(px.id);
  const runX = async (bk, argv) => rtBase.exec(NSX, argv, await kx.leaseCliOpts(px.id, bk));
  const a1 = (await runX(KA, ['--pin-tab', 'open', 'https://a.example/1'])).json.data.targetId;
  await runX(KB, ['--pin-tab', 'open', 'https://b.example/1']);
  const newTab = async (u) => (await kx.agentTabAct({ browserKey: KA, argv: ['tab', 'new', u] })).opened.targetId;
  const a2 = await newTab('https://a.example/2'), a3 = await newTab('https://a.example/3');
  const T = { kind: 'attachment', profileId: px.id, sessionName: 'vs-' + KA, ns: NSX };
  const sessA = 'vs-' + KA;
  const has = (id) => nsState(NSX).tabs.some((t) => t.targetId === id);
  const out = {};
  // (1) the handback lands inside the READ: ✕ on A's CURRENT tab (a3 — the neighbour move AND the close would both run)
  kx.takeover({ browserKey: KA, profileId: px.id, viewerId: 7, sessionId: 'sess-a' });
  let hitR; const hitRead = new Promise((r) => { hitR = r; }); let releaseRead; readGate = new Promise((r) => { releaseRead = r; }); readHit = hitR;
  const n1 = cmds().length;
  const act1 = kx.userTabAct({ target: T, viewerId: 7, act: 'close', targetId: a3 }).then((x) => x, (e) => ({ code: e.code }));
  await hitRead;
  const hb1 = kx.handback({ browserKey: KA, profileId: px.id, viewerId: 7, cause: 'explicit' });
  releaseRead();
  const r1 = await act1;
  out.read = { code: r1.code || (r1.ok ? 'ran' : '?'), execs: cmds().slice(n1).filter((c) => c.sess === sessA).map((c) => c.argv.join(' ')).filter((c) => c !== 'tab list --json'), a3Stays: has(a3), current: nsState(NSX).sessions[sessA], hbActs: (hb1.userActs || []).length };
  // (2) the handback lands inside the EXEC of the close: ✕ on a2 (not current) — the close runs and the agent IS told
  kx.takeover({ browserKey: KA, profileId: px.id, viewerId: 7, sessionId: 'sess-a' });
  let hitE; const hitExec = new Promise((r) => { hitE = r; }); let releaseExec; execGate = new Promise((r) => { releaseExec = r; }); execHit = hitE;
  const act2 = kx.userTabAct({ target: T, viewerId: 7, act: 'close', targetId: a2 }).then((x) => x, (e) => ({ code: e.code }));
  await hitExec;
  const hb2 = kx.handback({ browserKey: KA, profileId: px.id, viewerId: 7, cause: 'explicit' });
  releaseExec();
  const r2 = await act2;
  out.exec = { ok: !!r2.ok, a2Gone: !has(a2), hbActs: (hb2.userActs || []).map((a) => a.kind + ' ' + a.url), words: TK.handbackText({ cause: 'explicit', userActs: hb2.userActs }) };
  // (3) an exec that FAILS takes its record back: the handback never tells of a close that did not happen
  const a4 = await newTab('https://a.example/4');
  kx.takeover({ browserKey: KA, profileId: px.id, viewerId: 7, sessionId: 'sess-a' });
  failClose = true;
  const r3 = await kx.userTabAct({ target: T, viewerId: 7, act: 'close', targetId: a1 }).then((x) => x, (e) => ({ code: e.code }));
  failClose = false;
  const hb3 = kx.handback({ browserKey: KA, profileId: px.id, viewerId: 7, cause: 'explicit' });
  out.fail = { code: r3.code || 'ran', hbActs: (hb3.userActs || []).length, a4 };
  try { kx.shutdown(); } catch { }
  return out;
}
{
  const X = await userActRaceLeg(K, 'product');
  ok(X.read.code === 'take_over_first' && !X.read.execs.length && X.read.a3Stays && X.read.hbActs === 0, 'a handback landing INSIDE the tab reads (the user\'s ✕ on the agent\'s current tab in flight): refused take_over_first — neither the move to a neighbour nor the close ran, the tab is still there (verify F3)', X.read);
  ok(X.exec.ok && X.exec.a2Gone && X.exec.hbActs.length === 1 && /^tab-close https:\/\/a\.example\/2/.test(X.exec.hbActs[0]) && /While driving, the user closed one of your tabs/.test(X.exec.words), 'a handback landing while the close RUNS: the close was recorded at its check, so the handback carries it — the agent is told (never a close after control returned, told to nobody)', X.exec);
  ok(X.fail.code === 'tab_failed' && X.fail.hbActs === 0, 'an exec that FAILS takes its record back — the handback never tells the agent of a close that did not happen', X.fail);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const reask = "      if (!stillDriving()) refuse(TBS.userTabVerdict({ act, owner: 'agent', human: false, driving: false, mediated: false, counts }), `the takeover ended while the tabs were read — ${step} not run`);\n";
  const order = "      const rec = noteUserTabAct(bk, profileId, told);\n      const r = await rt.exec(ns, argv, { ...opts, timeout: 30000 });\n";
  ok(src.includes(reask) && src.includes(order), 'control setup: the re-ask and the record-at-the-check are where the controls cut');
  const Kn = M.load('src/server/browser-keeper.js', editAnchor(src, reask, '\n', "src/server/browser-keeper.js"), 'no-reask');
  const Xn = await userActRaceLeg(Kn, 'no-reask');
  ok(Xn.read.code !== 'take_over_first' && !Xn.read.a3Stays && Xn.read.hbActs === 0, 'CONTROL: a keeper that trusts `driving` read before the awaits closes the agent\'s tab AFTER the handback, told to nobody — the (1) leg catches it (the verifier\'s repro)', Xn.read);
  const Ko = M.load('src/server/browser-keeper.js', editAnchor(src, order, "      const r = await rt.exec(ns, argv, { ...opts, timeout: 30000 });\n      const rec = noteUserTabAct(bk, profileId, told);\n", "src/server/browser-keeper.js"), 'note-after');
  const Xo = await userActRaceLeg(Ko, 'note-after');
  ok(Xo.exec.a2Gone && Xo.exec.hbActs.length === 0, 'CONTROL: a keeper that records the act only AFTER its exec loses it to a handback landing mid-exec — the (2) leg catches it', Xo.exec);
}

// ═══ ③ THE BRIDGE ═════════════════════════════════════════════════════════════
console.log('— ③ the real bridge over a fake upstream: tab-owners after a tabs record, tab-act → tab-ack, the anchor moves with his switch');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const Bmod = require('../src/server/browser-stream.js');
  const calls = [];
  const fakeKeeper = {
    setFor: () => ({ attachments: [{ profileId: 'bp-0000c0f1', alias: 'work', isDefault: true, label: 'Work' }], handles: ['work'], defaultId: 'bp-0000c0f1', children: [] }),
    list: () => ({ profiles: [{ id: 'bp-0000c0f1', label: 'Work' }] }),
    streamPortFor: async () => ({ ok: true, port: upPort }),
    inputStateFor: () => ({ input: 'agent' }),
    tabOwnersFor: async (target, o) => { calls.push({ what: 'owners', kind: target.kind, activeTarget: o.activeTarget }); return { ok: true, owners: { [T(1)]: 'agent', [T(2)]: 'other' }, mediated: false, adoptable: false }; },
    userTabAct: async (x) => { calls.push({ what: 'act', ...x, target: x.target.kind }); if (x.targetId === T(2)) { const e = new Error('Another conversation’s — open its live view to use it'); e.code = 'not_your_tab'; throw e; } return { ok: true, act: x.act, targetId: x.targetId, switchedTo: x.act === 'switch' ? x.targetId : null }; },
    takeover: ({ viewerId }) => ({ ok: true, state: { input: 'user', takenAt: Date.now(), takenBy: { viewerId, at: Date.now() } } }),
  };
  const upWss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise((r) => upWss.on('listening', r));
  const upPort = upWss.address().port;
  let upWs = null; const upIn = [];
  upWss.on('connection', (ws) => { upWs = ws; ws.on('message', (d) => { try { upIn.push(JSON.parse(d)); } catch { } }); ws.send(JSON.stringify({ type: 'status', connected: true })); ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: true }, { tabId: 't2', targetId: T(2), title: 'B', url: 'https://b.example/', active: false }] })); });
  const activeS = new Map([['sess-a', { _browserKey: KA, webuiId: 'sess-a' }]]);
  const bridge = Bmod.create({ keeper: fakeKeeper, activeSessions: activeS, requestAuthed: () => true, log: quiet });
  const hs = http.createServer(); servers.push(hs); hs.on('upgrade', (req, sock, head) => bridge.handleUpgrade(req, sock, head));
  await new Promise((r) => hs.listen(0, '127.0.0.1', r));
  const open = async () => { const ws = new WebSocket(`ws://127.0.0.1:${hs.address().port}/api/browser/stream?session=sess-a`); const got = []; ws.on('message', (d) => { try { got.push(JSON.parse(d)); } catch { } }); await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); }); return { ws, got }; };
  const v1 = await open();
  const gotOwners = await until(() => v1.got.some((m) => m.type === 'tab-owners'), 3000);
  const ow = v1.got.find((m) => m.type === 'tab-owners');
  ok(gotOwners && ow.owners[T(1)] === 'agent' && ow.owners[T(2)] === 'other' && calls.some((c) => c.what === 'owners' && c.activeTarget === T(1)), 'after the `tabs` record the bridge asks the keeper (with the active tab it names) and sends ONE `tab-owners` record', ow);
  const v2 = await open();
  const replayed = await until(() => v2.got.some((m) => m.type === 'tab-owners'), 2000);
  ok(replayed, 'a late viewer is replayed the last `tab-owners` (like the tabs record)');
  v1.ws.send(JSON.stringify({ type: 'tab-act', act: 'close', targetId: T(2), rid: 5 }));
  v1.ws.send(JSON.stringify({ type: 'tab-act', act: 'drop', targetId: 'x', rid: 6 }));
  await until(() => v1.got.filter((m) => m.type === 'tab-ack').length >= 2, 3000);
  const acks = v1.got.filter((m) => m.type === 'tab-ack');
  ok(acks.some((a) => a.rid === 5 && !a.ok && a.code === 'not_your_tab' && /another conversation/i.test(a.error)) && acks.some((a) => a.rid === 6 && !a.ok && a.code === 'bad-request') && calls.filter((c) => c.what === 'act').length === 1, 'a refused act answers ONE typed `tab-ack` (never silence); a malformed one is refused by the bridge without asking the keeper', acks);
  // the anchor: he takes over, switches to the other tab through the ROW — his input still goes through (never tab_switched)
  v1.ws.send(JSON.stringify({ type: 'takeover' }));
  await until(() => v1.got.some((m) => m.type === 'mode-ack'), 2000);
  v1.ws.send(JSON.stringify({ type: 'tab-act', act: 'switch', targetId: T(1).replace('0001', '0003'), rid: 7 }));
  await until(() => v1.got.some((m) => m.type === 'tab-ack' && m.rid === 7), 2000);
  await sleep(3500); // past the anchor's grace — an agent's switch now would be tab_switched
  upWs.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: false }, { tabId: 't3', targetId: T(1).replace('0001', '0003'), title: 'A3', url: 'https://a.example/3', active: true }] }));
  await sleep(150);
  v1.ws.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1, rid: 9 }));
  const rec = await until(() => v1.got.some((m) => m.type === 'input-receipt' && m.rid === 9), 2000);
  const rc = v1.got.find((m) => m.type === 'input-receipt' && m.rid === 9);
  ok(rec && rc.ok && upIn.some((m) => m.type === 'input_mouse'), 'his OWN switch through the row moves the takeover\'s anchor — his next click is forwarded (an agent\'s switch would be `tab_switched`)', rc);
  // CONTROL: the same switch made by somebody else (no row act) ⇒ tab_switched
  upWs.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: true }] }));
  await sleep(150);
  v1.ws.send(JSON.stringify({ type: 'input_mouse', eventType: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1, rid: 10 }));
  await until(() => v1.got.some((m) => m.type === 'input-receipt' && m.rid === 10), 2000);
  const rc2 = v1.got.find((m) => m.type === 'input-receipt' && m.rid === 10);
  ok(rc2 && !rc2.ok && rc2.code === 'tab_switched', 'CONTROL: a switch the ROW did not make (the agent\'s) still refuses his input tab_switched — the anchor rule stands', rc2);
  for (const v of [v1, v2]) v.ws.close();
  bridge.shutdown?.(); upWss.close();
}

// ═══ ③b B-1626: a viewer's thaw is asked again once its relay knows the tab it streams ═══
// heavy test-browser-hidden-paint c (red on .367/.370/.376/.391/.397/.399): a live view attaching to a FROZEN browser two
// conversations hold streamed a hidden page — 0 frames. The bridge said its viewers when the viewer JOINED, before the relay
// had read its `tabs` record, so the thaw's scope (activeTargetsFor) was empty and the view's own front stayed hidden.
console.log('— ③b B-1626: the viewer\'s thaw is asked again with the tab the view streams');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const viewersLeg = async (Bmod, tag) => {
    const seen = []; let br = null;
    const fk = {
      setFor: () => ({ attachments: [{ profileId: 'bp-0000c0f1', alias: 'work', isDefault: true, label: 'Work' }], handles: ['work'], defaultId: 'bp-0000c0f1', children: [] }),
      list: () => ({ profiles: [{ id: 'bp-0000c0f1', label: 'Work' }] }),
      streamPortFor: async () => ({ ok: true, port: upPort }), inputStateFor: () => ({ input: 'agent' }),
      tabOwnersFor: async () => ({ ok: true, owners: {}, mediated: false, adoptable: false }),
      // the keeper's side of the thaw: what the dialog watch's scope (activeTargetsFor) reads at each report
      noteViewers: (bk, pid, n) => { seen.push({ n, tabs: br ? br.activeTargetsFor({ browserKey: bk, profileId: pid }) : [] }); },
    };
    const upWss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise((r) => upWss.on('listening', r));
    const upPort = upWss.address().port;
    // the upstream says its tabs only a moment after it connects (the stream's first `tabs` record comes after the viewer joined)
    upWss.on('connection', (ws) => { ws.send(JSON.stringify({ type: 'status', connected: true })); const rec1 = JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: T(1), title: 'A', url: 'https://a.example/', active: true }] }); setTimeout(() => ws.send(rec1), 80); setTimeout(() => ws.send(rec1), 200); }); // the same record twice: the second asks nothing more
    const activeS = new Map([['sess-a', { _browserKey: KA, webuiId: 'sess-a' }]]);
    br = Bmod.create({ keeper: fk, activeSessions: activeS, requestAuthed: () => true, log: quiet });
    const hs = http.createServer(); servers.push(hs); hs.on('upgrade', (req, sock, head) => br.handleUpgrade(req, sock, head));
    await new Promise((r) => hs.listen(0, '127.0.0.1', r));
    const ws = new WebSocket(`ws://127.0.0.1:${hs.address().port}/api/browser/stream?session=sess-a`);
    let gotTabs = 0; ws.on('message', (d) => { try { if (JSON.parse(String(d)).type === 'tabs') gotTabs++; } catch { /* binary */ } });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    // its ONE reason to end, the same for the leg and its control (no fixed wait for a report the control never makes): the viewer
    // holds the second (identical) tabs record. The bridge judges a record (notePicture: the re-ask) in onUpstream BEFORE it forwards
    // it, so every report either record could cause is in `seen` by then
    await until(() => gotTabs >= 2, 1500);
    const tabsRecordSeen = (br.activeTargetsFor({ browserKey: KA, profileId: 'bp-0000c0f1' }) || []).includes(T(1));
    ws.close(); br.shutdown?.(); upWss.close();
    return { seen, tabsRecordSeen, gotTabs };
  };
  const Bmod = require('../src/server/browser-stream.js');
  const bsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const ANCH = '      if (relay.activeTarget && relay.activeTarget !== relay.thawAskedFor && relay.viewers.size) { relay.thawAskedFor = relay.activeTarget; noteViewers(relay); }';
  if (!bsrc.includes(ANCH)) ok(false, 'the anchor of the control «B-1626 re-ask» is not in the source (src/server/browser-stream.js)');
  const Bc = bsrc.includes(ANCH) ? M.load('src/server/browser-stream.js', editAnchor(bsrc, ANCH, '      // (no re-ask)', "src/server/browser-stream.js"), 'b1626-no-reask') : null;
  const [r, c] = await Promise.all([viewersLeg(Bmod, 'now'), Bc ? viewersLeg(Bc, 'control') : Promise.resolve(null)]); // the leg beside its control
  const first = r.seen.find((x) => x.n >= 1);
  ok(first && first.tabs.length === 0 && r.seen.some((x) => x.n >= 1 && x.tabs.includes(T(1))), `B-1626: the viewer's join is reported before its relay knows its tab (the thaw's scope then: ${JSON.stringify(first && first.tabs)}); once the stream's tabs record names the tab on show, the viewers are reported AGAIN with that tab in scope — the thaw shows the view's own front`, r.seen);
  ok(r.gotTabs >= 2 && r.seen.filter((x) => x.n >= 1 && x.tabs.includes(T(1))).length === 1, `B-1626: …once per tab (a later tabs record for the same tab asks nothing more) — ${r.seen.length} report(s) over ${r.gotTabs} tabs record(s) forwarded`, r.seen);
  if (c) {
    ok(c.gotTabs >= 2 && c.tabsRecordSeen && !c.seen.some((x) => x.n >= 1 && x.tabs.includes(T(1))), `CONTROL (B-1626, the release's bridge): the viewer is reported only at its join, with an EMPTY scope (${JSON.stringify(c.seen)}) — on a frozen browser two conversations hold, the view's own front stays hidden: RED`, c.seen);
  }
}

// ═══ ③c B-26bb: a view reconnected after a stop draws none of the stopped run's chips (主开发 09:08Z: A, clear) ═══
console.log('— ③c B-26bb: no stale chip after a reconnect from a stop');
{
  const BTx = require('../src/browser-tabs.js');
  const kept = [{ tabId: 't1', targetId: T(1), title: 'a', url: 'https://a.example/', active: false }, { tabId: 't2', targetId: T(2), title: 'b', url: 'https://b.example/', active: true }, { tabId: 't3', targetId: T(3), title: 'c', url: 'https://c.example/', active: false }];
  const owners = { [T(1)]: 'agent', [T(2)]: 'agent', [T(3)]: 'agent' };
  const judge = (B) => ({ stale: B.tabRowModel({ tabs: kept, owners, stale: true }).rows.length, fresh: B.tabRowModel({ tabs: kept, owners }).rows.length });
  const j = judge(BTx);
  ok(j.stale === 0 && j.fresh === 3, `B-26bb: the stopped run's three kept chips draw NOTHING while the reconnected view waits for the new run's tabs record (${j.stale}); the same tabs as this run's draw all three (${j.fresh}) — nothing stale to click`, j);
  const tsrc = fs.readFileSync(path.join(REPO, 'src/browser-tabs.js'), 'utf8');
  const ANCH = '  const list = (Array.isArray(tabs) && !stale ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId))';
  if (!tsrc.includes(ANCH)) ok(false, 'the anchor of the control «B-26bb stale» is not in the source (src/browser-tabs.js)');
  else {
    const BTc = M.load('src/browser-tabs.js', editAnchor(tsrc, ANCH, '  const list = (Array.isArray(tabs) ? tabs : []).filter((x) => isObj(x) && isTargetId(x.targetId))', "src/browser-tabs.js"), 'b26bb-no-stale'); // stale-pins: kept — the release's line, planted back as this control's mutant
    ok(judge(BTc).stale === 3, 'CONTROL (B-26bb, the release\'s row): the stopped run\'s chips drawn after the reconnect (3 stale chips a person can press) — RED', judge(BTc));
  }
  // its verdict (NOT TAKEN, 10:27Z — the Resume press's own road cleared the stop before it connected): THE LAW — stale from the
  // moment the view RECORDS A STOP until the next tabs record, on EVERY road back. Each road as the events the view sees, through
  // the PURE step (the drawn row is tabRowModel's, above):
  const road = (B, events) => { let st = false; for (const e of events) st = B.tabsStaleStep(st, e); return st; };
  const roads = { resume: ['stopped', 'resume-press', 'hello', 'upstream-open'], rejoin: ['stopped', 'rejoin', 'hello', 'upstream-open'], reconnect: ['stopped', 'upstream-closed', 'upstream-open'] };
  const lit = Object.fromEntries(Object.entries(roads).map(([k, ev]) => [k, road(BTx, ev)]));
  const cleared = road(BTx, [...roads.resume, 'tabs']), switched = road(BTx, ['stopped', 'switch']);
  ok(lit.resume && lit.rejoin && lit.reconnect && !cleared && !switched && BTx.tabRowModel({ tabs: kept, owners, stale: lit.resume }).rows.length === 0,
    `B-26bb (its verdict): the Resume press's own road, a rejoin and a reconnect — each still stale when the new run connects (${JSON.stringify(lit)}), so no stopped-run chip is drawn; the new run's tabs record (${cleared}) or a pane switch (${switched}) ends it`, lit);
  const stepSrc = tsrc;
  const SANCH = "  if (event === 'stopped') return true;";
  if (!stepSrc.includes(SANCH)) ok(false, 'the anchor of the control «B-26bb the stop rule» is not in the source (src/browser-tabs.js)');
  else {
    const BTr = M.load('src/browser-tabs.js', stepSrc.replace(SANCH, "  // (no stop rule)"), 'b26bb-no-stop-rule');
    ok(!road(BTr, roads.resume), 'CONTROL (B-26bb, the rule removed): the Resume press\'s road connects with the stopped run\'s chips drawn as live — RED', road(BTr, roads.resume));
  }
  // THE CENSUS (one rule at the stop, never one per road): every place the view RECORDS a stop (`st.stopped = …`, anything but
  // false) runs the step on that same line; the tabs record and a pane switch end it
  const w = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const stopSites = (src) => src.split('\n').filter((l) => /\bst\.stopped = (?!false\b)/.test(l));
  const bare = (src) => stopSites(src).filter((l) => !l.includes('noteStop()'));
  ok(stopSites(w).length >= 3 && bare(w).length === 0 && w.includes("const noteStop = () => { st.tabsStale = tabsStaleStep(st.tabsStale, 'stopped'); renderTabs(); };") && w.includes("st.tabsStale = tabsStaleStep(st.tabsStale, 'tabs');") && w.includes("st.tabsStale = tabsStaleStep(st.tabsStale, 'switch');") && w.includes('tabRowModel({ tabs: st.tabs, stale: !!st.tabsStale,') && w.includes('const tabsNow = st.tabsStale ? [] : st.tabs;'),
    `B-26bb wiring: every one of the view's ${stopSites(w).length} stop records calls the ONE rule (noteStop: the stale step + the pane redrawn); the tabs record and a pane switch end it; the row model AND the tabs pane draw by it`, bare(w));
  const planted = w + "\n          st.stopped = 'closed'; renderMode(); // a planted new road";
  ok(bare(planted).length === 1, 'CONTROL (the census): a NEW stop site without the step is named (a rule per road would miss it)', bare(planted));
}

// ═══ ③d B-1626 / K23 (its cure 2, 主开发 13:03Z): a live view attaching shows ITS conversation's frozen front, whatever the
//      bridge knows of the viewer's tab at that instant — the scope is the keeper's answer: the conversation's tabs + a hidden
//      front in its OWN window (read off Chrome at the thaw); another holder's front stays owed (heavy hidden-paint e) ═══
console.log('— ③d B-1626 / K23: a live view attaching shows its conversation\'s frozen front, the bridge\'s answer held');
{
  const WIN = require('../src/browser-windows.js');
  // (1) THE KEEPER'S HALF, the real keeper of ②: A and B lease "Work" again; each lease stamped with a window of its own in this
  //     browser run (the fake 0.38.1 has no windows: the stamp is what attach writes on a real one) — the viewer's thaw is handed it
  for (const s of [sA, sB]) await j('POST', '/api/agent/browser/use', { profile: 'Work' }, as(s));
  const stampWin = (bk, win, own) => k.reshapeStore((reg) => { const rec = reg.browsers[work.id]; const l = reg.leases.find((x) => x.profileId === work.id && String(x.browserKey) === bk); if (!l || !rec || !WIN.instanceOf(rec)) return false; l.windowIn = own ? WIN.instanceOf(rec) : 'an-older-run'; l.windowId = win; return true; });
  const asked = []; const PW = { paintFacts: () => null, freezePaint: async () => ({ ok: false }), thawPaint: (pid, o) => { asked.push(o && o.holder); return Promise.resolve({ ok: true, thawed: false }); } };
  const holderOf = async (bk) => { asked.length = 0; k.noteViewers(bk, work.id, 1); await new Promise((r) => setImmediate(r)); k.noteViewers(bk, work.id, 0); return asked.find((h) => h && h.browserKey === bk) || null; };
  const stamped = stampWin(KA, 1, true) && stampWin(KB, 2, true);
  k.setPaintWatch(PW);
  const hA = await holderOf(KA), hB = await holderOf(KB);
  const olderOk = stampWin(KB, 2, false); const hB0 = await holderOf(KB);
  k.setPaintWatch(null);
  for (const s of [sA, sB]) await j('POST', '/api/agent/browser/detach', { profile: work.id }, as(s));
  ok(stamped && olderOk && hA && hA.windowId === 1 && hB && hB.windowId === 2 && hB0 && hB0.windowId === null,
    'the KEEPER hands a viewer\'s thaw its conversation\'s own window (the lease\'s, this browser run) — never asked of the bridge; a lease still in the shared window of an older run hands none', { hA, hB, hB0 });
  // (2) THE WATCH'S HALF, the real watch over a stand-in browser: A's blank root + A's page in window 1, B's page in window 2. THE
  //     STALL: the bridge's answer is HELD (the viewer's relay has read no tabs record yet) and the keeper names only each one's
  //     root (A's blank, B's blank) — A's page by no witness and no grant. The thaw must still show A's page, and only A's
  const TA0 = T(0x80), TA = T(0x81), TB = T(0x82), TB0 = T(0x83);
  const { WebSocketServer: WSS } = require('ws');
  const standIn = async ({ report = null, delayCreate = null, lateEvent = null, silent = null, failCreate = null, holdBack = false, flipWin = null, blindMade = null } = {}) => {
    const winOf = new Map([[TA0, 1], [TA, 1], [TB, 2], [TB0, 2]]), vis = new Map([[TA0, 'hidden'], [TA, 'visible'], [TB, 'visible'], [TB0, 'hidden']]);
    const st = { last: null, acts: [], made: [], blind: new Set(), creates: [], urls: new Map(), muteVis: new Set(), closed: [], muteAct: new Set(), life: new Map(), visAt: [], hid: new Set(), flipOf: new Map(), actAsks: new Map(), pendingLate: 0, heldActs: [] }; // blind: the tabs whose window read gets no answer (a busy Chrome)
    const wss = new WSS({ port: 0, host: '127.0.0.1' }); await new Promise((r) => wss.once('listening', r));
    wss.on('connection', (sock) => sock.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const p = m.params || {}; const re = (result) => { try { sock.send(JSON.stringify({ id: m.id, result })); } catch { /* closed */ } };
      if (m.method === 'Target.getTargets') return re({ targetInfos: [TA0, TA, TB, TB0].map((t) => ({ targetId: t, type: 'page', title: '', url: t === TA0 || t === TB0 ? 'about:blank' : `https://${t === TA ? 'a' : 'b'}.example/`, attached: false })) });
      if (m.method === 'Target.attachToTarget') return re({ sessionId: 'S' + p.targetId });
      if (m.method === 'Runtime.evaluate' && p.expression === 'document.visibilityState') st.visAt.push(Date.now());   // r4095 (2): when each read arrived
      if (m.method === 'Runtime.evaluate' && p.expression === 'document.visibilityState' && st.muteVis.has(String(m.sessionId || '').slice(1))) return;   // r4088: a loaded Chrome — this read never answers
      // r4176: a frozen tab reads hidden until a flip in its own window shows it (the thaw's own measured note: «active» alone leaves it hidden)
      if (m.method === 'Runtime.evaluate' && p.expression === 'document.visibilityState') { const tb = String(m.sessionId || '').slice(1); return re({ result: { type: 'string', value: st.hid.has(tb) ? 'hidden' : vis.get(tb) || 'hidden' } }); }
      if (m.method === 'Browser.getWindowForTarget') return st.blind.has(p.targetId) ? re({}) : re({ windowId: winOf.has(p.targetId) ? winOf.get(p.targetId) : null });
      // r4176 (the must's order): `holdBack` holds an activation's reply while a late create is pending — until just after its birth
      if (m.method === 'Target.activateTarget') { st.last = p.targetId; st.acts.push(p.targetId); if (holdBack && st.pendingLate > 0) { st.heldN = (st.heldN || 0) + 1; st.heldActs.push(() => re({})); return; } return re({}); }
      // r4095 (3): each tab's lifecycle as Chrome applied it; an activation of a tab in `muteAct` never answers (and is not applied);
      // a create `failCreate` names answers Chrome's own error (no tab made)
      if (m.method === 'Page.setWebLifecycleState') { const tb = String(m.sessionId || '').slice(1); if (p.state === 'active') st.actAsks.set(tb, (st.actAsks.get(tb) || 0) + 1); if (p.state === 'active' && st.muteAct.has(tb)) return; st.life.set(tb, p.state); if (p.state === 'frozen') st.hid.add(tb); return re({}); }
      if (m.method === 'Target.createTarget' && failCreate && failCreate(st.creates.length + 1)) { st.creates.push({ url: String(p.url == null ? '' : p.url), newWindow: !!p.newWindow, focus: p.focus, failed: true }); try { sock.send(JSON.stringify({ id: m.id, error: { code: -32000, message: 'Failed to open a new tab' } })); } catch { /* closed */ } return; }
      // rows B-98f5 / B-bcf8: every create recorded with its address; its BIRTH event sent first (as Chrome does), at the address
      // the leg makes Chrome report (`report`: another browser family, a policy, a later build), and Target.getTargetInfo answers it
      if (m.method === 'Target.createTarget') { const id = 'BLANK' + (st.made.length + 1); st.made.push(id); st.flipOf.set(id, st.last); winOf.set(id, flipWin && flipWin(st.made.length) != null ? flipWin(st.made.length) : winOf.get(st.last)); if (blindMade && blindMade(st.made.length)) st.blind.add(id); const url = String(p.url == null ? '' : p.url); st.creates.push({ url, newWindow: !!p.newWindow, focus: p.focus }); const n = st.creates.length, born = report ? report(url, n) : url, mute = !!(silent && silent(n)), delay = delayCreate ? delayCreate(n) : 0, late = !!(lateEvent && lateEvent(n)); if (!mute) st.urls.set(id, born);
        // r4058: a Chrome that answers a create after the watch's bound (`delayCreate`), its birth event at once or with the late reply (`lateEvent`), or never told (`silent`)
        const ev = () => { if (!mute) { try { sock.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: id, type: 'page', url: born, title: '', attached: false } } })); } catch { /* closed */ } } };
        if (!late) ev(); if (delay) { st.pendingLate += 1; setTimeout(() => { if (late) ev(); re({ targetId: id }); st.pendingLate -= 1; if (!st.pendingLate) for (const f of st.heldActs.splice(0)) f(); }, delay); return; } if (late) ev(); return re({ targetId: id }); }
      if (m.method === 'Target.closeTarget') { st.closed.push(p.targetId); const f = st.flipOf.get(p.targetId); if (f != null && winOf.get(p.targetId) === winOf.get(f)) st.hid.delete(f); return re({}); }
      if (m.method === 'Target.getTargetInfo') return st.urls.has(p.targetId) ? re({ targetInfo: { targetId: p.targetId, type: 'page', url: st.urls.get(p.targetId) } }) : re({});
      return re({});
    }));
    // r4186: `bring(t)` — the agent (or the person) brings tab t forward in its window: t visible, every other tab of that window hidden
    const bring = (t) => { for (const [x, wv] of winOf) if (x !== t && wv === winOf.get(t)) vis.set(x, 'hidden'); vis.set(t, 'visible'); st.hid.delete(t); };
    return { url: `ws://127.0.0.1:${wss.address().port}/devtools/browser/stand-in`, st, bring, close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }) };
  };
  const watchLeg = async (Dmod, holders, { blindAtFreeze = [] } = {}) => {
    const SI = await standIn(); const PID = 'bp-0000c23a';
    const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 2,
      tabsOf: (q) => (String(q && q.browserKey) === KA ? [TA0] : String(q && q.browserKey) === KB ? [TB0] : []) }); // the bridge's half held (empty), the keeper's: each one's root only
    const shownOf = (x) => (x && Array.isArray(x.shown) ? x.shown.map((s) => s.targetId) : null);
    try {
      await D.arm(PID, { budgetMs: 3000 });
      const opened = await until(() => !!D.paintFacts(PID), 3000);
      for (const t of blindAtFreeze) SI.st.blind.add(t); // cure 4: Chrome says nothing of these windows at the freeze…
      const fz = opened ? await D.freezePaint(PID) : null;
      SI.st.blind.clear(); // …and answers again at the thaw
      const out = { opened, fz };
      if (fz && fz.ok) {
        out.a = shownOf(await D.thawPaint(PID, { holder: { ...holders.a, profileId: PID } })); out.hiddenA = (D.paintFacts(PID) || {}).hidden;
        out.b = shownOf(await D.thawPaint(PID, { holder: { ...holders.b, profileId: PID } })); out.hiddenB = (D.paintFacts(PID) || {}).hidden;
      }
      out.blanks = SI.st.made.length; out.creates = SI.st.creates;
      return out;
    } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
  };
  const DD = require('../src/server/browser-dialogs.js');
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const WANCH = '    const byWindow = ownWin == null ? [] : [...(w.hiddenFronts || [])].filter((tid) => !need.includes(tid) && (fw.get(tid) == null || fw.get(tid) === ownWin));';
  const CANCH = '          const mine = probe.length > 0 && (await Promise.all(probe.map((t) => windowOfTarget(w, t)))).includes(ownWin);';
  if (!dsrc.includes(CANCH)) ok(false, 'the anchor of the control «B-1626 cure 3 the window confirmed» is not in the source (src/server/browser-dialogs.js)');
  const DDs = dsrc.includes(CANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, CANCH, '          const mine = true; // the stamp trusted alone', "src/server/browser-dialogs.js"), 'k23-stamp-alone') : null;
  // cure 4's control: cure 3's rule — a window the freeze could not read is «not yours» (never read again)
  const DDu = dsrc.includes(WANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, WANCH, '    const byWindow = ownWin == null ? [] : [...(w.hiddenFronts || [])].filter((tid) => !need.includes(tid) && fw.get(tid) === ownWin); // cure 3: unknown = not yours', "src/server/browser-dialogs.js"), 'k23-unknown-not-yours') : null;
  if (!dsrc.includes(WANCH)) ok(false, 'the anchor of the control «B-1626 K23 the window rule» is not in the source (src/server/browser-dialogs.js)');
  const DDc = dsrc.includes(WANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, WANCH, '    const byWindow = []; // the release: no window rule', "src/server/browser-dialogs.js"), 'k23-no-window') : null;
  const strip = (h) => { const { windowId, ...rest } = h || {}; return rest; }; // the release's keeper line: the holder carries no window
  const H = { a: hA || { browserKey: KA, windowId: 1 }, b: hB || { browserKey: KB, windowId: 2 } };
  // B-1626 cure 3 (its readers): a mediated lease keeps a previous run's windowId — A's viewer arriving with a STALE id that names
  // B's window now (window ids are small numbers per Chrome run) shows nothing of B's: the window is A's only while A's own root sits in it
  const Hs = { a: { ...H.a, windowId: 2 }, b: H.b };
  const [r, c1, c2, st, c3, un, c4] = await Promise.all([watchLeg(DD, H), watchLeg(DD, { a: strip(H.a), b: strip(H.b) }), DDc ? watchLeg(DDc, H) : Promise.resolve(null),
    watchLeg(DD, Hs), DDs ? watchLeg(DDs, Hs) : Promise.resolve(null),
    // B-1626 cure 4 (its verdict's must): Chrome says nothing of A's page's window at the freeze (a busy Chrome) and answers at the thaw
    watchLeg(DD, H, { blindAtFreeze: [TA] }), DDu ? watchLeg(DDu, H, { blindAtFreeze: [TA] }) : Promise.resolve(null)]);
  ok(r.fz && r.fz.ok && r.fz.fronts === 2 && J(r.a) === J([TA]) && r.hiddenA === 1 && J(r.b) === J([TB]) && r.hiddenB === 0,
    'B-1626 / K23 (its cure 2): a viewer attaching to A — the bridge\'s answer held, A\'s page named by no witness and no grant — shows A\'s frozen front (in A\'s own window) and only it; B\'s front stays owed until B\'s own viewer shows it', r);
  ok(c1 && c1.fz && c1.fz.ok && J(c1.a) === J([]) && c1.hiddenA === 2, 'CONTROL (the release\'s keeper: the viewer\'s holder carries no window): A\'s front stays owed — a hidden page draws no frame, the live view stays blank (K23) — RED', c1);
  if (DDc) ok(c2 && c2.fz && c2.fz.ok && J(c2.a) === J([]) && c2.hiddenA === 2, 'CONTROL (the release\'s watch: no window rule): A\'s front stays owed — RED', c2);
  ok(st && st.fz && st.fz.ok && J(st.a) === J([]) && st.hiddenA === 2 && J(st.b) === J([TB]), 'B-1626 cure 3: A\'s viewer with a STALE window id (a previous run\'s, naming B\'s window now) shows nothing — B\'s front is shown only by B\'s own viewer', st);
  if (DDs) ok(c3 && c3.fz && c3.fz.ok && J(c3.a) === J([TB]), 'CONTROL (the stamp trusted alone): A\'s viewer shows B\'s page in B\'s window — the cell heavy hidden-paint e guards — RED', c3);
  ok(un && un.fz && un.fz.ok && J(un.a) === J([TA]) && un.hiddenA === 1, 'B-1626 cure 4: a window Chrome did not report at the freeze is UNKNOWN — read again at the thaw, A\'s viewer shows A\'s page (never a blank on every later visit)', un);
  if (DDu) ok(c4 && c4.fz && c4.fz.ok && J(c4.a) === J([]) && c4.hiddenA === 2, 'CONTROL (cure 3\'s rule: an unread window is «not yours»): A\'s front stays owed — the live view blank on this visit and every later one — RED', c4);
  // ═══ ROWS B-98f5 / B-bcf8 — THE THAW'S FLIP TAB IS ONE NO DRIVER TAKES (box rows 715-725; src/browser-idle.js FLIP_TAB_URL): the
  //     flip tab is born at chrome://version/ (Chromium's kChromeUIVersionURL at 154.0.8037.57), which the driver's own filter never
  //     takes (agent-browser v0.38.2 should_track_target); the hub reads the birth address Chrome reports, and a browser whose flip
  //     tab a driver WOULD take is never frozen — said once by its code. A DRIVER UPDATE that changes its filter is read again here
  //     and in test-browser-hidden-paint leg g ═══
  {
    const BIdle = require('../src/browser-idle.js');
    const FLIP = BIdle.FLIP_TAB_URL;
    const FANCH = "      const b = await settle(call(w, 'Target.createTarget', { url: BI().FLIP_TAB_URL }, null, 2000));";
    if (!dsrc.includes(FANCH)) ok(false, 'the anchor of the control «the release\'s about:blank flip» is not in the source (src/server/browser-dialogs.js)');
    const DDf = dsrc.includes(FANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, FANCH, "      const b = await settle(call(w, 'Target.createTarget', { url: 'about:blank' }, null, 2000)); // the release: the blank a driver takes", 'src/server/browser-dialogs.js'), 'b98f5-blank-flip') : null;
    const guardLeg = async (Dmod, report, { stand = {}, clock = null, settleMs = 0, bounds = 1 } = {}) => {
      const SI = await standIn({ report, ...stand }); const PID = 'bp-0000c23c'; const said = [];
      const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: { ...quiet, warn: (m) => said.push(String(m)) }, leaseCountOf: () => 2, boundScale: bounds, ...(clock ? { now: () => clock.t } : {}),
        tabsOf: (q) => (String(q && q.browserKey) === KA ? [TA0] : String(q && q.browserKey) === KB ? [TB0] : []) });
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        const th = fz && fz.ok ? await D.thawPaint(PID, { holder: { ...H.a, profileId: PID } }) : null;
        if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
        if (clock) clock.t += 61 * 1000;   // r4058: past the unread verdict's re-ask
        const fz2 = opened ? await D.freezePaint(PID) : null;
        const f = D.paintFacts(PID);
        return { opened, fz, th: th ? { thawed: !!th.thawed, shown: (th.shown || []).length } : null, fz2, flipTaken: f ? f.flipTaken : undefined, creates: SI.st.creates.slice(), made: SI.st.made.slice(), closed: SI.st.closed.slice(), held: SI.st.heldN || 0, said: said.filter((x) => x.includes('[idle_paint_flip_tab_taken]')) };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    const [g0, gc, g1, g2, g3] = await Promise.all([guardLeg(DD, null), DDf ? guardLeg(DDf, null) : Promise.resolve(null),
      guardLeg(DD, () => 'about:blank'), guardLeg(DD, () => ''), guardLeg(DD, (url, n) => (n === 1 ? url : 'about:blank'))]);
    const thawOf = (g) => (g ? g.creates.filter((c) => !c.newWindow) : []), checkOf = (g) => (g ? g.creates.filter((c) => c.newWindow) : []);
    ok(g0.fz && g0.fz.ok && g0.th && g0.th.thawed && g0.th.shown === 1 && thawOf(g0).length >= 1 && thawOf(g0).every((c) => c.url === FLIP) && checkOf(g0).length === 1 && checkOf(g0)[0].url === FLIP && checkOf(g0)[0].focus === false && g0.fz2 && g0.fz2.ok && !g0.flipTaken && g0.said.length === 0,
      `B-98f5 / B-bcf8: the thaw's flip tab is born at ${FLIP} — Chromium's kChromeUIVersionURL, an address the driver's own filter never takes — and so is the ONE check before the browser's first freeze, in a window of its own, unfocused (no window's front moves)`, g0);
    if (DDf) ok(gc && gc.fz && gc.fz.ok && thawOf(gc).some((c) => c.url === 'about:blank'), 'CONTROL (the release\'s flip: about:blank — the tab a driver takes, prepares and loses mid-prepare: the 30 s hold, the moved tab) — RED', gc);
    ok(g1.fz && g1.fz.ok === false && g1.fz.why === 'flip_tab_taken' && g1.fz2 && g1.fz2.ok === false && g1.fz2.why === 'flip_tab_taken' && !g1.th && thawOf(g1).length === 0 && g1.flipTaken === 'taken' && g1.said.length === 1,
      'B-98f5 / B-bcf8 THE GUARD ON THE FACT: Chrome reports the check\'s tab born at an address a driver takes (another browser family, a policy, a later build) ⇒ that browser is NEVER frozen (it keeps drawing), no flip made, said ONCE in the journal by its code', g1);
    ok(g2.fz && g2.fz.ok === false && g2.fz.why === 'flip_tab_taken' && g2.flipTaken === 'empty' && thawOf(g2).length === 0 && g2.said.length === 1,
      'B-98f5 / B-bcf8 THE GUARD: an EMPTY birth address (the driver\'s filter TAKES an empty one) ⇒ never frozen, said once', g2);
    ok(g3.fz && g3.fz.ok && g3.th && g3.th.thawed && g3.fz2 && g3.fz2.ok === false && g3.fz2.why === 'flip_tab_taken' && g3.flipTaken === 'taken' && g3.said.length === 1,
      'B-98f5 / B-bcf8 THE GUARD AT EVERY FLIP: the check passed, then a thaw\'s own flip tab is born at an address a driver takes ⇒ the browser is not frozen again, said once', g3);
    // ── r4088 (B-98f5): THE FREEZE REMEMBERS EVERY FRONT OR FREEZES NOTHING — A's front whose visibility read does not answer is
    //    UNKNOWN: that freeze refuses by its reason (front_unread) and the next one freezes and shows it; RED: the tip before it
    //    (ab1696c4c), where an unanswered read was «not in front» — the page frozen unremembered, the thaw shows nothing ──
    const FRONT_ANCH = "    if (unread) return { ok: false, why: 'front_unread', unread };";
    if (!dsrc.includes(FRONT_ANCH)) ok(false, 'the anchor of the control «an unanswered front read taken as not in front» is not in the source (src/server/browser-dialogs.js)');
    const DDv = dsrc.includes(FRONT_ANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, FRONT_ANCH, '    // ab1696c4c: an unanswered read is «not in front»', 'src/server/browser-dialogs.js'), 'b98f5-front-unread') : null;
    const frontLeg = async (Dmod) => {
      const SI = await standIn(); const PID = 'bp-0000c23e';
      const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 2, boundScale: 0.3,
        tabsOf: (q) => (String(q && q.browserKey) === KA ? [TA0] : String(q && q.browserKey) === KB ? [TB0] : []) });
      const shownOf2 = (x) => (x && Array.isArray(x.shown) ? x.shown.map((s2) => s2.targetId) : []);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        SI.st.muteVis.add(TA);   // A's front: its visibility read never answers at this freeze
        const fz = opened ? await D.freezePaint(PID) : null;
        const frozenAfter = !!(D.paintFacts(PID) || {}).frozen;
        const th = fz && fz.ok ? shownOf2(await D.thawPaint(PID, { holder: { ...H.a, profileId: PID } })) : null;
        SI.st.muteVis.clear();
        const fz2 = opened && !(fz && fz.ok) ? await D.freezePaint(PID) : null;
        const th2 = fz2 && fz2.ok ? shownOf2(await D.thawPaint(PID, { holder: { ...H.a, profileId: PID } })) : null;
        return { opened, fz, frozenAfter, th, fz2, th2 };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    const [fv, fvc] = await Promise.all([frontLeg(DD), DDv ? frontLeg(DDv) : Promise.resolve(null)]);
    ok(!!fv.fz && fv.fz.ok === false && fv.fz.why === 'front_unread' && fv.fz.unread === 1 && !fv.frozenAfter && !!fv.fz2 && fv.fz2.ok === true && J(fv.th2) === J([TA]),
      'r4088 (B-98f5): a front whose visibility read does not answer is UNKNOWN — that freeze freezes nothing, by its reason (front_unread); the next freeze remembers it and the thaw shows it', fv);
    if (DDv) ok(!!fvc && !!fvc.fz && fvc.fz.ok === true && fvc.frozenAfter && J(fvc.th) === J([]), 'CONTROL (the tip before it, ab1696c4c: an unanswered read is «not in front»): the page is frozen unremembered and the thaw shows nothing — the live view blank — RED', fvc);
    // ── r4058, the follow: (1) a flip create answered AFTER the watch's bound left its tab open — the hub's own late flip tab is closed by
    //    its id (its birth seen during the flip, or arriving after it); RED: the unit as lined (363e3ae01), which drops it. An UNREAD
    //    verdict is asked again at a later freeze. (3) two first freezes at once share ONE check; a new watch after a restart measures
    //    again before it freezes ──
    const LANCH = '      await flipBorn(w, b, bid);';
    if (!dsrc.includes(LANCH)) ok(false, 'the anchor of the control «the late flip tab left open» is not in the source (src/server/browser-dialogs.js)');
    const DDl = dsrc.includes(LANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, LANCH, '      if (bid) await flipBirthLeft(w, bid); // 363e3ae01: a create with no reply is dropped', 'src/server/browser-dialogs.js'), 'b98f5-late-flip') : null;
    const lateLeg = (Dmod, lateEvent, holdBack = false) => guardLeg(Dmod, null, { stand: { delayCreate: (n) => (n === 2 ? 900 : 0), lateEvent: (n) => lateEvent && n === 2, holdBack }, settleMs: 600, bounds: 0.3 });   // r4176 (c): the bounds × 0.3
    // r4176 (its must, in the product's own order): the create held past its bound, its birth sent just before the late reply, and the
    // stand-in holding the flip's «back» activation reply until after that birth — the birth arrives WHILE the flip runs; RED: the
    // flip's end as it stood at 3ae970836 (the births cleared, a late one never closed)
    const MANCH = '    closeLateBirths(w);   // r4176: before the clear';
    if (!dsrc.includes(MANCH)) ok(false, 'the anchor of the control «the births cleared, a late one never closed» is not in the source (src/server/browser-dialogs.js)');
    const DDm = dsrc.includes(MANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, MANCH, '    // 3ae970836: the births cleared, a late one never closed', 'src/server/browser-dialogs.js'), 'r4176-late-in-flip') : null;
    const [l1, l2, lc, u1, l3, l3c] = await Promise.all([lateLeg(DD, false), lateLeg(DD, true), DDl ? lateLeg(DDl, true) : Promise.resolve(null),
      guardLeg(DD, null, { stand: { silent: (n) => n === 1 }, clock: { t: 1795000000000 } }), lateLeg(DD, true, true), DDm ? lateLeg(DDm, true, true) : Promise.resolve(null)]);
    ok(l3.held >= 1 && l3.closed.includes('BLANK2') && l3.said.length === 0,
      'r4176 (its must): a late flip tab whose birth arrives WHILE the flip still runs (the «back» activation answered after it, as Chrome answers in order) is closed by its id at the flip\'s end, before the births are cleared', { held: l3.held, closed: l3.closed, made: l3.made });
    if (DDm) ok(!!l3c && l3c.held >= 1 && !l3c.closed.includes('BLANK2'), 'CONTROL (3ae970836: the births cleared at the flip\'s end, a late one never closed): the tab stays open for the browser\'s life — RED', l3c && { held: l3c.held, closed: l3c.closed, made: l3c.made });
    ok(l1.closed.includes('BLANK2') && l2.closed.includes('BLANK2') && l1.said.length === 0 && l2.said.length === 0,
      'r4058 (1): a flip create Chrome answers AFTER the watch\'s bound leaves no tab open — the hub\'s own late flip tab is closed by its id, its birth seen during the flip or arriving after it', { l1: { closed: l1.closed, made: l1.made }, l2: { closed: l2.closed, made: l2.made } });
    if (DDl) ok(!!lc && !lc.closed.includes('BLANK2'), 'CONTROL (the unit as lined, 363e3ae01: a create with no reply is dropped): the late flip tab stays open — RED', lc && { closed: lc.closed, made: lc.made });
    ok(!!u1.fz && u1.fz.ok === false && !!u1.fz2 && u1.fz2.ok === true && u1.creates.filter((c) => c.newWindow).length === 2 && u1.said.length === 1,
      'r4058 (1): an UNREAD birth (Chrome told nothing) refuses that freeze, said once — and is asked again at a later freeze (a minute on): the browser is frozen then, never left drawing for the watch\'s life', { fz: u1.fz, fz2: u1.fz2, checks: u1.creates.filter((c) => c.newWindow).length, said: u1.said.length });
    { // (3) two first freezes at once: ONE check, one freeze; a new watch (a restart) on the same browser measures again before it freezes
      const SI = await standIn(); const PID = 'bp-0000c23d';
      const mk = () => DD.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, leaseCountOf: () => 2, tabsOf: () => [] });
      let both = null, again = null;
      const D1 = mk();
      try { await D1.arm(PID, { budgetMs: 3000 }); await until(() => !!D1.paintFacts(PID), 3000); both = await Promise.all([D1.freezePaint(PID), D1.freezePaint(PID)]); } finally { try { D1.shutdown(); } catch { /* */ } }
      const checks1 = SI.st.creates.filter((c) => c.newWindow).length;
      const D2 = mk();
      try { await D2.arm(PID, { budgetMs: 3000 }); await until(() => !!D2.paintFacts(PID), 3000); again = await D2.freezePaint(PID); } finally { try { D2.shutdown(); } catch { /* */ } await SI.close(); }
      const checks2 = SI.st.creates.filter((c) => c.newWindow).length;
      ok(checks1 === 1 && both.filter((x) => x && x.ok).length === 1 && checks2 === 2 && !!again && again.ok === true,
        'r4058 (3): two first freezes at once share ONE check and freeze once; a new watch after a restart measures again before its first freeze', { both, checks1, checks2, again });
    }
    // ── r4095, the follow for 2.369.420 (the short round wf_9b5fca5e-8f8's shoulds): (2) a browser whose tab never answers its
    //    visibility read is SAID once a stretch (its id and a count, never an address or a title), and the reads run at once, each its
    //    own bound; (3) the thaw's two unknown reads: an activation with no reply keeps the browser «frozen» (asked again at the next
    //    thaw), and a front whose show failed stays owed (shown by the next thaw). RED: each line as it stood at 3623606d5 ──
    const VANCH = "    const vr = await Promise.all(tabs.map((e) => settle(call(w, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, e.sid, 1000))));";
    const SANCH = "    if (unread) frontUnread(w, unread);   // r4095 (2): said once a stretch — the browser's id and a count, never an address or a title";
    const AANCH = "if (unthawed) { w.unthawed = new Set(left); thawUnread(w, unthawed); } else { w.unthawed = null; w.paint = 'active'; w.thawedAt = now(); w.thawUnread = null; } }";
    const OANCH = 'if (s && s.failed) { failed.push(s); if (showFailed(w, tid, s.failed)) continue; } else if (s) shown.push(s);';
    for (const [a, n] of [[VANCH, 'the reads one after another'], [SANCH, 'front_unread never said'], [AANCH, '«active» whatever the replies'], [OANCH, 'a front forgotten before it is shown']]) if (!dsrc.includes(a)) ok(false, `the anchor of the control «${n}» is not in the source (src/server/browser-dialogs.js)`);
    const DDv2 = dsrc.includes(VANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, VANCH, "    const vr = []; for (const e of tabs) vr.push(await settle(call(w, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, e.sid, 1000))); // 3623606d5: one after another", 'src/server/browser-dialogs.js'), 'r4095-reads-serial') : null;
    const DDs2 = dsrc.includes(SANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, SANCH, '    // 3623606d5: never said', 'src/server/browser-dialogs.js'), 'r4095-never-said') : null;
    const DDa2 = dsrc.includes(AANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, AANCH, "w.unthawed = null; w.paint = 'active'; w.thawedAt = now(); } // 3623606d5: «active» whatever the replies", 'src/server/browser-dialogs.js'), 'r4095-active-anyway') : null;
    const DDo2 = dsrc.includes(OANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, OANCH, 'if (s) shown.push(s); /* 3623606d5: forgotten before it is shown */', 'src/server/browser-dialogs.js'), 'r4095-forgot-first') : null;
    const mkD = (Dmod, SI, said, bounds = 1, clock = null) => Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: { ...quiet, warn: (m) => said.push(String(m)) }, leaseCountOf: () => 2, boundScale: bounds, ...(clock ? { now: () => clock.t } : {}),
      tabsOf: (q) => (String(q && q.browserKey) === KA ? [TA0] : String(q && q.browserKey) === KB ? [TB0] : []) });
    const ids2 = (x) => (x && Array.isArray(x.shown) ? x.shown.map((s2) => s2.targetId) : null);
    const hA2 = (PID) => ({ ...H.a, profileId: PID });
    // (2) TWO tabs that never answer (A's front and B's): refused twice, said once, the reads at once; then a freeze, a thaw — and a
    //     new stretch is said again
    const sayLeg = async (Dmod) => {
      const SI = await standIn(); const PID = 'bp-0000c23f'; const said = []; const D = mkD(Dmod, SI, said, 0.3);   // r4176 (c): the bounds × 0.3 (a read 300 ms)
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        SI.st.muteVis.add(TA); SI.st.muteVis.add(TB);
        const v0 = SI.st.visAt.length; const fz1 = opened ? await D.freezePaint(PID) : null; const at1 = SI.st.visAt.slice(v0);
        const fz2 = opened ? await D.freezePaint(PID) : null;
        const f1 = D.paintFacts(PID) || {}, said1 = said.filter((x) => x.includes('[idle_paint_front_unread]'));
        SI.st.muteVis.clear();
        const fz3 = opened ? await D.freezePaint(PID) : null; const f2 = D.paintFacts(PID) || {};
        if (fz3 && fz3.ok) await D.thawPaint(PID, { holder: hA2(PID) });
        SI.st.muteVis.add(TA);
        const fz4 = opened ? await D.freezePaint(PID) : null;
        return { opened, fz1, fz2, fz3, fz4, passes1: f1.frontUnread, passes2: f2.frontUnread, said1, said2: said.filter((x) => x.includes('[idle_paint_front_unread]')), reads1: at1.length, spanMs: at1.length ? at1[at1.length - 1] - at1[0] : null };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // (3) A's activation does not answer at the thaw, then answers: the watch stays «frozen» and the next thaw thaws it
    const actLeg = async (Dmod) => {
      const SI = await standIn(); const PID = 'bp-0000c240'; const said = []; const D = mkD(Dmod, SI, said, 0.3);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        SI.st.muteAct.add(TA);
        const th1 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null; const f1 = D.paintFacts(PID) || {}; const life1 = SI.st.life.get(TA) || null;
        SI.st.muteAct.clear();
        const th2 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null; const f2 = D.paintFacts(PID) || {};
        return { opened, fz: fz && { ok: fz.ok, why: fz.why }, th1: th1 && { thawed: th1.thawed, unthawed: th1.unthawed, shown: ids2(th1) }, frozen1: f1.frozen, thawUnread1: f1.thawUnread, life1, th2: th2 && { thawed: th2.thawed, unthawed: th2.unthawed }, frozen2: f2.frozen, life2: SI.st.life.get(TA) || null, asks: Object.fromEntries([TA0, TA, TB, TB0].map((t) => [t, SI.st.actAsks.get(t) || 0])), said: said.filter((x) => x.includes('[idle_paint_thaw_unread]')) };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // (3) the thaw's flip create fails (Chrome's own error: no tab): A's front stays owed — and the next thaw shows it
    const showLeg = async (Dmod) => {
      const SI = await standIn({ failCreate: (n) => n === 2 }); const PID = 'bp-0000c241'; const said = []; const D = mkD(Dmod, SI, said);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        const th1 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null; const h1 = (D.paintFacts(PID) || {}).hidden;
        const th2 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null; const h2 = (D.paintFacts(PID) || {}).hidden;
        return { opened, fz: fz && { ok: fz.ok, fronts: fz.fronts }, th1: ids2(th1), failed1: th1 && th1.failed ? th1.failed.map((x) => [x.targetId, x.failed]) : [], hidden1: h1, th2: ids2(th2), hidden2: h2, creates: SI.st.creates.map((c) => (c.failed ? 'failed' : c.newWindow ? 'check' : 'flip')) };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // r4176 (its ruling on the cap): a failed show of ANY kind stays owed with no cap — but three shows in a row whose flip tab landed in
    // ANOTHER window than the front's (both windows known: measured at the show) leave the front as it is, said once. `stand` names the
    // stand-in's failure; each leg runs `n` thaws for A and reads A's front owed or not after each
    const CANCH2 = 'const SHOW_TRIES = 3;';
    if (!dsrc.includes(CANCH2)) ok(false, 'the anchor of the control «no cap» is not in the source (src/server/browser-dialogs.js)');
    const DDn2 = dsrc.includes(CANCH2) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, CANCH2, 'const SHOW_TRIES = Infinity; // no cap', 'src/server/browser-dialogs.js'), 'r4176-no-cap') : null;
    const capLeg = async (Dmod, stand, n, pid) => {
      const SI = await standIn(stand); const said = []; const D = mkD(Dmod, SI, said);
      try {
        await D.arm(pid, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(pid), 3000);
        const fz = opened ? await D.freezePaint(pid) : null; const hidden = [], failedN = [], shownN = [];
        for (let k = 0; k < n && fz && fz.ok; k++) { const th = await D.thawPaint(pid, { holder: hA2(pid) }); hidden.push((D.paintFacts(pid) || {}).hidden); failedN.push(th && th.failed ? th.failed.map((x) => x.failed).join() : ''); shownN.push((ids2(th) || []).length); }
        return { opened, fz: fz && fz.ok, hidden, failed: failedN, shown: shownN, flips: SI.st.creates.filter((c) => !c.newWindow).length, said: said.filter((x) => x.includes('[idle_paint_show_failed]')) };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // (b) the keeper's sweep asks retryOwedShows while a viewer watches: the failed show of A's front is tried again — and only it
    const retryLeg = async (Dmod) => {
      const SI = await standIn({ failCreate: (n) => n === 2 }); const PID = 'bp-0000c243'; const said = []; const D = mkD(Dmod, SI, said);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        const th1 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null; const f1 = D.paintFacts(PID) || {};
        const r = fz && fz.ok ? await D.retryOwedShows(PID) : null; const f2 = D.paintFacts(PID) || {};
        return { opened, th1: ids2(th1), owed1: f1.owedShows, hidden1: f1.hidden, retried: r && r.retried, shown: ids2(r), owed2: f2.owedShows, hidden2: f2.hidden };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // the round's should: a show counted failed that DID happen (the flip tab's window unread, the flip done) — at the next thaw A's front
    // is read first: «visible» ⇒ forgotten, never flipped again (a retry would activate it over the agent's own tab)
    const alreadyLeg = async (Dmod) => {
      const SI = await standIn({ blindMade: (n) => n === 2 }); const PID = 'bp-0000c244'; const said = []; const D = mkD(Dmod, SI, said);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        const th1 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null;
        const th2 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null;
        return { opened, failed1: th1 && th1.failed ? th1.failed.map((x) => [x.targetId, x.failed]) : [], already2: th2 && th2.already, shown2: ids2(th2), flips: SI.st.creates.filter((c) => !c.newWindow).length, hidden2: (D.paintFacts(PID) || {}).hidden };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // r4186 (its must, law 2): a failed show leaves A's front owed; the agent's verb then brings TA0 forward in A's window. On the sweep's
    // retry AND on a verb's thaw, A is no longer its window's front: forgotten, never activated over TA0; an unanswered read keeps it owed,
    // nothing shown. RED: 6ed465256 (A's own visibility only — A activated over the agent's tab)
    const MVANCH = "    if (winA != null && near.some((x) => x.win === winA && x.vis === 'visible')) return 'moved';";
    if (!dsrc.includes(MVANCH)) ok(false, 'the anchor of the control «an owed front shown over the tab brought forward» is not in the source (src/server/browser-dialogs.js)');
    const DDmv = dsrc.includes(MVANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, MVANCH, '    // 6ed465256: only its own visibility read', 'src/server/browser-dialogs.js'), 'r4186-shown-over-moved') : null;
    const movedLeg = async (Dmod, road, { muteNear = false } = {}) => {
      const SI = await standIn({ failCreate: (n) => n === 2 }); const PID = road === 'retry' ? 'bp-0000c247' : 'bp-0000c248'; const said = []; const D = mkD(Dmod, SI, said, 0.3);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        const th1 = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null;
        SI.bring(TA0); if (muteNear) SI.st.muteVis.add(TA0);
        const a0 = SI.st.acts.length;
        const r = road === 'retry' ? await D.retryOwedShows(PID) : await D.thawPaint(PID, { holder: hA2(PID) });
        const f = D.paintFacts(PID) || {};
        const th3 = muteNear ? null : await D.thawPaint(PID, { holder: hA2(PID) });
        return { opened, failed1: th1 && th1.failed ? th1.failed.length : 0, moved: r && r.moved, unread: r && r.unread, shown: ids2(r), actsOfA: SI.st.acts.slice(a0).filter((t) => t === TA).length, owed: f.owedShows, hidden: f.hidden, after: th3 && { thawed: th3.thawed, shown: ids2(th3) } };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // r4186 (law 3): the sweep's retry backs off on a placed clock — tried at 0 s, then after 5, 10, 20, 40, 60 s; reset when shown
    const backLeg = async (Dmod) => {
      let failing = true; const clock = { t: 1795100000000 };
      const SI = await standIn({ failCreate: (n) => n >= 2 && failing }); const PID = 'bp-0000c249'; const said = []; const D = mkD(Dmod, SI, said, 1, clock);
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        const fz = opened ? await D.freezePaint(PID) : null;
        if (fz && fz.ok) await D.thawPaint(PID, { holder: hA2(PID) });
        const t0 = clock.t, tried = [], skipped = [];
        for (const at of [0, 1, 5, 9, 15, 34, 35, 75, 76, 140]) { clock.t = t0 + at * 1000; const r = await D.retryOwedShows(PID); (r && r.retried ? tried : skipped).push(at); }
        failing = false; clock.t = t0 + 200 * 1000;
        const back = await D.retryOwedShows(PID); const f = D.paintFacts(PID) || {};
        return { opened, tried, skipped, back: back && { retried: back.retried, shown: ids2(back) }, owed: f.owedShows };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    // the round's should: «four failed creates never give a front up» gets a red of its own — every reason counted toward the cap, as at 3ae970836
    const RANCH = "    if (why !== 'another window') { w.showOwed.add(tid); w.otherWin.delete(tid); return true; }";
    if (!dsrc.includes(RANCH)) ok(false, 'the anchor of the control «every reason counted toward the cap» is not in the source (src/server/browser-dialogs.js)');
    const DDrc = dsrc.includes(RANCH) ? M.load('src/server/browser-dialogs.js', editAnchor(dsrc, RANCH, '    // 3ae970836: every reason counted toward the cap', 'src/server/browser-dialogs.js'), 'r4186-every-reason-capped') : null;
    const [mvR, mvV, mvC, mvU, bk, slowC] = await Promise.all([movedLeg(DD, 'retry'), movedLeg(DD, 'verb'), DDmv ? movedLeg(DDmv, 'retry') : Promise.resolve(null), movedLeg(DD, 'retry', { muteNear: true }), backLeg(DD),
      DDrc ? capLeg(DDrc, { failCreate: (n) => n >= 2 && n <= 5 }, 5, 'bp-0000c24a') : Promise.resolve(null)]);
    ok(mvR.failed1 === 1 && J(mvR.moved) === J([TA]) && mvR.actsOfA === 0 && mvR.owed === 0 && mvR.hidden === 1 && !!mvR.after && mvR.after.thawed === false,
      'r4186 (its must, law 2) on the SWEEP\'s retry: A\'s owed front, its window now showing the tab the agent brought forward, is forgotten — never activated over it; the next verb\'s thaw has nothing to show (B\'s front still owed to B)', mvR);
    ok(mvV.failed1 === 1 && J(mvV.moved) === J([TA]) && mvV.actsOfA === 0 && mvV.owed === 0 && mvV.hidden === 1,
      'r4186 (law 2) on a VERB\'s thaw: the same — A forgotten, never activated over the tab brought forward', mvV);
    if (DDmv) ok(!!mvC && mvC.actsOfA >= 1 && J(mvC.shown) === J([TA]), 'CONTROL (6ed465256: an owed front read by its own visibility only): A is activated over the agent\'s tab — the moved tab, the live view jumps — RED', mvC);
    ok(J(mvU.unread) === J([TA]) && mvU.actsOfA === 0 && mvU.owed === 1,
      'r4186 (law 2): a read that decides it does not answer (the tab brought forward is silent) — A kept owed, nothing shown (unknown is never «not»)', mvU);
    ok(J(bk.tried) === J([0, 5, 15, 35, 75, 140]) && J(bk.skipped) === J([1, 9, 34, 76]) && !!bk.back && bk.back.retried === 1 && J(bk.back.shown) === J([TA]) && bk.owed === 0,
      'r4186 (law 3): the sweep\'s retry of a show that keeps failing backs off — tried at 0, 5, 15, 35, 75 and 140 s (the wait doubling 5 → 60 s), and shown when Chrome answers', bk);
    if (DDrc) ok(!!slowC && slowC.said.length === 1 && slowC.hidden[2] === 1, 'CONTROL (3ae970836: every reason counted toward the cap): three failed creates on a loaded Chrome give the front up for good — RED', slowC);
    const [sv, sv2, ss2, av, ac2, ov, oc2, slow5, other4, otherC, rt, al] = await Promise.all([sayLeg(DD), DDv2 ? sayLeg(DDv2) : Promise.resolve(null), DDs2 ? sayLeg(DDs2) : Promise.resolve(null),
      actLeg(DD), DDa2 ? actLeg(DDa2) : Promise.resolve(null), showLeg(DD), DDo2 ? showLeg(DDo2) : Promise.resolve(null),
      capLeg(DD, { failCreate: (n) => n >= 2 && n <= 5 }, 5, 'bp-0000c242'), capLeg(DD, { flipWin: (n) => (n >= 2 ? 9 : null) }, 4, 'bp-0000c245'), DDn2 ? capLeg(DDn2, { flipWin: (n) => (n >= 2 ? 9 : null) }, 4, 'bp-0000c246') : Promise.resolve(null),
      retryLeg(DD), alreadyLeg(DD)]);
    const plain = (x) => !/example|https?:/.test(x);
    ok(!!sv.fz1 && sv.fz1.why === 'front_unread' && sv.fz1.unread === 2 && !!sv.fz2 && sv.fz2.why === 'front_unread' && sv.passes1 === 2 && sv.said1.length === 1 && sv.said1[0].includes('bp-0000c23f') && sv.said1[0].includes('2 tab(s)') && sv.said1.every(plain)
      && !!sv.fz3 && sv.fz3.ok === true && sv.passes2 === 0 && !!sv.fz4 && sv.fz4.why === 'front_unread' && sv.said2.length === 2,
      'r4095 (2): a browser not frozen because two tabs never answer is SAID once a stretch — its id and the count, never an address or a title — the passes counted; the stretch ends at a freeze, the next one is said again', sv);
    ok(sv.reads1 === 4 && sv.spanMs != null && sv.spanMs < 250, `r4095 (2): the freeze's visibility reads run at once, each its own bound — all 4 asked within ${sv.spanMs} ms, two never answering (one after another: a bound each, 300 ms here)`, { reads: sv.reads1, spanMs: sv.spanMs });
    if (DDv2) ok(!!sv2 && sv2.reads1 === 4 && sv2.spanMs >= 500, 'CONTROL (3623606d5: the reads one after another): the reads span two bounds — a tab that never replies costs every keeper tick a second — RED', sv2 && { reads: sv2.reads1, spanMs: sv2.spanMs });
    if (DDs2) ok(!!ss2 && ss2.fz1 && ss2.fz1.why === 'front_unread' && ss2.said2.length === 0, 'CONTROL (3623606d5: never said): the browser keeps drawing for good and nothing says so — RED', ss2 && { said: ss2.said2.length });
    ok(!!av.th1 && av.th1.unthawed === 1 && av.frozen1 === true && av.thawUnread1 === 1 && av.life1 === 'frozen' && J(av.th1.shown) === J([TA]) && av.said.length === 1 && av.said[0].includes('1 tab(s)') && av.said.every(plain)
      && !!av.th2 && av.th2.thawed === true && !av.th2.unthawed && av.frozen2 === false && av.life2 === 'active' && J(av.asks) === J({ [TA0]: 1, [TA]: 2, [TB]: 1, [TB0]: 1 }),
      'r4095 (3) / r4176 (a): a tab whose activation did not answer is UNKNOWN — the watch stays «frozen» (said once, the fronts still shown) and the next thaw asks again ONLY that tab: it is active', av);
    if (DDa2) ok(!!ac2 && ac2.frozen1 === false && !!ac2.th2 && ac2.th2.thawed === false && ac2.life2 === 'frozen', 'CONTROL (3623606d5: «active» whatever the replies): the watch says active, the next thaw finds nothing to do — the tab stays frozen — RED', ac2);
    ok(!!ov.fz && ov.fz.ok && J(ov.th1) === J([]) && J(ov.failed1) === J([[TA, 'no flip tab']]) && ov.hidden1 === 2 && J(ov.th2) === J([TA]) && ov.hidden2 === 1,
      'r4095 (3): a show that failed (Chrome made no flip tab) leaves A\'s front owed — the next thaw shows it (B\'s stays owed to B)', ov);
    ok(slow5.fz === true && J(slow5.hidden) === J([2, 2, 2, 2, 1]) && J(slow5.failed) === J(['no flip tab', 'no flip tab', 'no flip tab', 'no flip tab', '']) && J(slow5.shown) === J([0, 0, 0, 0, 1]) && slow5.said.length === 0,
      'r4176 (the ruling): a front whose flip tab Chrome did not make, four thaws in a row (a loaded Chrome), is NEVER given up — owed until the fifth thaw shows it, nothing said', slow5);
    ok(other4.fz === true && J(other4.hidden) === J([2, 2, 1, 1]) && J(other4.failed) === J(['another window', 'another window', 'another window', '']) && other4.flips === 3 && other4.said.length === 1 && other4.said[0].includes('another window') && other4.said.every(plain),
      'r4176 (the ruling): three shows in a row whose flip tab landed in ANOTHER window than the front\'s (both known — the measure, as a popup window\'s front shows it) leave the front as it is, said once; never a flip at every verb', other4);
    if (DDn2) ok(!!otherC && J(otherC.hidden) === J([2, 2, 2, 2]) && otherC.flips === 4 && otherC.said.length === 0, 'CONTROL (no cap): a front whose flip always lands in another window is flipped at every thaw for good — RED', otherC);
    ok(J(rt.th1) === J([]) && rt.owed1 === 1 && rt.hidden1 === 2 && rt.retried === 1 && J(rt.shown) === J([TA]) && rt.owed2 === 0 && rt.hidden2 === 1,
      'r4176 (b): a failed show is retried by retryOwedShows (the keeper\'s sweep asks it while a viewer watches) — A\'s front shown without the agent\'s next verb, B\'s still owed to B', rt);
    ok(J(al.failed1) === J([[TA, 'window unread']]) && J(al.already2) === J([TA]) && J(al.shown2) === J([]) && al.flips === 1 && al.hidden2 === 1,
      'the round\'s should: a show counted failed that did happen (its flip tab\'s window unread) is read first at the next thaw — «visible», forgotten, never flipped again', al);
    if (DDo2) ok(!!oc2 && J(oc2.th1) === J([TA]) && !(oc2.th2 || []).length && oc2.hidden1 === 1, 'CONTROL (3623606d5: a front forgotten before it is shown): the failed show forgets it — still hidden, nothing shows it again — RED', oc2);
    // ═══ B-bcf8 (主开发 r4256): THE STILL TABS BY CODE — the watch's own marks as the keeper's digest carries them (stillTabs), over
    //     the same stand-in Chrome: each of the three appears while its fact stands and clears when it ends; a LEFT tab is dropped only
    //     when its read says «visible» (recheckLeft: reads only), kept while hidden or when the read does not answer; the watch's
    //     decisions are the ones above (its flips counted) ═══
    const stillOf = (D, PID) => (typeof D.stillTabs === 'function' ? D.stillTabs(PID) : null);   // a watch without it (the base) reads as nothing said
    const recheckOf = async (D, PID) => (typeof D.recheckLeft === 'function' ? D.recheckLeft(PID) : { cleared: null });
    const stillLeg = async (Dmod, sfx) => {
      const out = {};
      { // thaw-unread: A's front's activation never answers ⇒ still (frozen); the next thaw answered ⇒ gone
        const SI = await standIn(); const PID = 'bp-0000c25' + sfx; const D = mkD(Dmod, SI, []);
        try {
          await D.arm(PID, { budgetMs: 3000 }); const opened = await until(() => !!D.paintFacts(PID), 3000);
          const fz = opened ? await D.freezePaint(PID) : null; const s0 = stillOf(D, PID);
          SI.st.muteAct.add(TA); if (fz && fz.ok) await D.thawPaint(PID, { holder: hA2(PID) }); const s1 = stillOf(D, PID);
          SI.st.muteAct.clear(); if (fz && fz.ok) await D.thawPaint(PID, { holder: hA2(PID) }); const s2 = stillOf(D, PID);
          out.thaw = { fz: !!(fz && fz.ok), s0, s1, s2 };
        } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
      }
      { // show-owed: the thaw's flip create fails (Chrome's own error) ⇒ still (A's front owed); the next thaw shows it ⇒ gone
        const SI = await standIn({ failCreate: (n) => n === 2 }); const PID = 'bp-0000c26' + sfx; const D = mkD(Dmod, SI, []);
        try {
          await D.arm(PID, { budgetMs: 3000 }); const opened = await until(() => !!D.paintFacts(PID), 3000);
          const fz = opened ? await D.freezePaint(PID) : null;
          if (fz && fz.ok) await D.thawPaint(PID, { holder: hA2(PID) }); const s1 = stillOf(D, PID);
          if (fz && fz.ok) await D.thawPaint(PID, { holder: hA2(PID) }); const s2 = stillOf(D, PID);
          out.owed = { fz: !!(fz && fz.ok), s1, s2 };
        } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
      }
      { // show-left: A's flip lands in another window three thaws in a row ⇒ left (still); a recheck while it is hidden keeps it, a
        // read with no answer keeps it; brought forward (the person's press on its chip, the agent's own switch) ⇒ the recheck drops it
        const SI = await standIn({ flipWin: (n) => (n >= 2 ? 9 : null) }); const PID = 'bp-0000c27' + sfx; const D = mkD(Dmod, SI, []);
        try {
          await D.arm(PID, { budgetMs: 3000 }); const opened = await until(() => !!D.paintFacts(PID), 3000);
          const fz = opened ? await D.freezePaint(PID) : null; const seq = [];
          for (let k = 0; k < 4 && fz && fz.ok; k++) { await D.thawPaint(PID, { holder: hA2(PID) }); seq.push((stillOf(D, PID) || {})[TA] || null); }
          const r1 = await recheckOf(D, PID); const s1 = stillOf(D, PID);
          SI.st.muteVis.add(TA); const r2 = await recheckOf(D, PID); const s2 = stillOf(D, PID); SI.st.muteVis.clear();
          SI.bring(TA); const r3 = await recheckOf(D, PID); const s3 = stillOf(D, PID);
          out.left = { fz: !!(fz && fz.ok), seq, r1, s1, r2, s2, r3, s3, flips: SI.st.creates.filter((c) => !c.newWindow).length };
        } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
      }
      return out;
    };
    // r4412 (3): THE FRONT IS REMEMBERED (row B-98f5's law: the freeze remembers every front) — A's page sits BEHIND A's blank in its
    // window; the person's press brings it forward (the session's own `tab <id>`: here the stand-in's bring); the browser idles into its
    // freeze and a thaw for A shows THAT page, never the blank it was behind. Its contrast: no press — the thaw shows the blank
    const frontKeptLeg = async (Dmod, pressed, sfx) => {
      const SI = await standIn(); const PID = 'bp-0000c28' + sfx; const D = mkD(Dmod, SI, []);
      try {
        await D.arm(PID, { budgetMs: 3000 }); const opened = await until(() => !!D.paintFacts(PID), 3000);
        SI.bring(TA0); if (pressed) SI.bring(TA);   // A's blank in front of its page; the press brings the page forward
        const fz = opened ? await D.freezePaint(PID) : null;
        const th = fz && fz.ok ? await D.thawPaint(PID, { holder: hA2(PID) }) : null;
        return { fz: fz && { ok: fz.ok, fronts: fz.fronts }, shown: ids2(th), pageHidden: SI.st.hid.has(TA) };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    const [fr, frNo] = await Promise.all([frontKeptLeg(DD, true, '0'), frontKeptLeg(DD, false, '1')]);
    ok(!!fr.fz && fr.fz.ok && J(fr.shown) === J([TA]) && fr.pageHidden === false && !!frNo.fz && frNo.fz.ok && J(frNo.shown) === J([TA0]),
      'B-bcf8 r4412 (3): the tab the person brings forward is the front the freeze remembers — after the idle freeze, the thaw for A shows THAT page (drawing again), never the blank it sat behind; without the press the thaw shows the blank', { pressed: fr, contrast: frNo });
    const judgeStill = (x) => !!x && !!x.thaw && x.thaw.fz && J(x.thaw.s0) === J({}) && J(x.thaw.s1) === J({ [TA]: 'thaw-unread' }) && J(x.thaw.s2) === J({})
      && !!x.owed && x.owed.fz && J(x.owed.s1) === J({ [TA]: 'show-owed' }) && J(x.owed.s2) === J({});
    const judgeLeft = (x) => !!x && !!x.left && x.left.fz && J(x.left.seq) === J(['show-owed', 'show-owed', 'show-left', 'show-left']) && x.left.flips === 3
      && x.left.r1.cleared === 0 && J(x.left.s1) === J({ [TA]: 'show-left' }) && x.left.r2.cleared === 0 && J(x.left.s2) === J({ [TA]: 'show-left' }) && x.left.r3.cleared === 1 && J(x.left.s3) === J({});
    // the reds, each built through anchored() (an anchor gone or spelled twice throws by name): the left tab never kept by id (the
    // watch as it was: a flag a browser), and a recheck that drops a left tab on any answer (a hidden one too)
    const NLANCH = '    (w.showLeft || (w.showLeft = new Set())).add(tid);', ANYANCH = "if (vis[i] === 'visible' && w.showLeft";
    for (const [a, n] of [[NLANCH, 'the left tab kept by id'], [ANYANCH, 'a left tab dropped only when it reads visible']]) if (!dsrc.includes(a)) ok(false, `the anchor of the B-bcf8 control «${n}» is not in the source (src/server/browser-dialogs.js)`);
    const DDnl = dsrc.includes(NLANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, NLANCH, '    /* B-bcf8 control: the tab left is not kept */', 'B-bcf8: the left tab kept by id'), 'bcf8-left-not-kept') : null;
    const DDany = dsrc.includes(ANYANCH) ? M.load('src/server/browser-dialogs.js', anchored(dsrc, ANYANCH, "if (vis[i] !== undefined && w.showLeft", 'B-bcf8: a left tab dropped only when it reads visible'), 'bcf8-left-any-answer') : null;
    const [stl, stlNl, stlAny] = await Promise.all([stillLeg(DD, '0'), DDnl ? stillLeg(DDnl, '1') : Promise.resolve(null), DDany ? stillLeg(DDany, '2') : Promise.resolve(null)]);
    ok(judgeStill(stl), 'B-bcf8 (r4256): the watch\'s still tabs by code — a thaw that got no reply from A\'s front: «thaw-unread» while it stands, gone at the thaw that answers; a failed show: «show-owed», gone when it is shown', { thaw: stl.thaw, owed: stl.owed });
    ok(judgeLeft(stl), 'B-bcf8 (r4256): a front whose flip landed in another window three thaws in a row is «show-left» (owed before it; three flips, as the watch decides) — kept while hidden and when its read does not answer (unknown is never «not»), dropped when it comes forward', stl.left);
    if (DDnl) ok(!judgeLeft(stlNl) && !(stlNl.left.seq || []).includes('show-left'), 'CONTROL (the watch as it was: the tab left is not kept by id): the page left hidden for good is said to nobody — RED', stlNl.left && stlNl.left.seq);
    if (DDany) ok(!judgeLeft(stlAny) && stlAny.left.r1.cleared === 1, 'CONTROL (a recheck that drops a left tab on ANY answer): a page still hidden is called come forward — RED', stlAny.left && stlAny.left.r1);
  }
  // ═══ ROW B-0e4a (主开发 r4252 / r4264; probe 14, box row 811): A LEASE's OWN TAB, KNOWN AGAIN AFTER A RESTART. The keeper births the
  //     lease's root at about:blank#vs-own-<its random mark>; Chrome's own restore keeps that as the restored tab's FIRST history entry
  //     (one carrier, entry 0, after the tab navigated on); EXACTLY ONE orphan carrying it is taken back — none, two (a person
  //     duplicated the tab: the history is copied) or any page unread in time ⇒ today's behaviour. RED: «at least one» ═══
  {
    const TBS0 = require('../src/browser-tabs.js'), VPm = require('../src/server/browser-viewport.js');
    const MARK = 'a1b2c3d4e5f6a7b8c9d0e1f2', OTHER = 'ffeeddccbbaa998877665544';
    const U0 = TBS0.ownMarkUrl(MARK);
    ok(U0 === `about:blank#vs-own-${MARK}` && TBS0.ownMarkUrl('about:blank') === null && TBS0.ownMarkUrl('ZZ' + MARK.slice(2)) === null && TBS0.OWN_MARK_RE.test(MARK),
      'B-0e4a PURE: the lease\'s own birth address is about:blank with its random mark (24 hex) — anything else is no mark', U0);
    const P1 = T(0xa1), P2 = T(0xa2), P3 = T(0xa3);
    const mv = (pairs) => TBS0.markVerdict({ candidates: pairs.map(([id]) => id), carries: new Map(pairs) });
    const cases = { one: mv([[P1, true], [P2, false], [P3, false]]), none: mv([[P1, false], [P2, false]]), two: mv([[P1, true], [P2, true], [P3, false]]), unread: mv([[P1, true], [P2, null]]), empty: TBS0.markVerdict({ candidates: [], carries: new Map() }) };
    ok(cases.one.take === P1 && cases.none.why === 'none' && cases.two.why === 'many' && cases.unread.why === 'unknown' && cases.empty.why === 'none' && !cases.two.take && !cases.unread.take,
      'B-0e4a PURE: EXACTLY ONE carrier is taken back; none ⇒ none; two (a person duplicated the tab) ⇒ none taken; any page unread in time ⇒ unknown (never «not the lease\'s») — the last three keep today\'s behaviour', cases);
    const note = TBS0.reboundNoteText({ how: 'back', url: `${U0} https://secret.example/` });
    ok(/came back/.test(note) && !note.includes('about:blank') && !note.includes(MARK) && !note.includes('example'), 'B-0e4a PURE: the agent\'s note says its own tab came back — never an address (nor the mark)', note);
    const tsrc = fs.readFileSync(path.join(REPO, 'src/browser-tabs.js'), 'utf8'), MANCH0 = '  if (yes.length === 1) return { take: yes[0] };';
    if (!tsrc.includes(MANCH0)) ok(false, 'the anchor of the control «at least one carrier» is not in the source (src/browser-tabs.js)');
    const TBSr = tsrc.includes(MANCH0) ? M.load('src/browser-tabs.js', editAnchor(tsrc, MANCH0, '  if (yes.length >= 1) return { take: yes[0] };', 'src/browser-tabs.js'), 'b0e4a-at-least-one') : null;
    if (TBSr) { const r2 = TBSr.markVerdict({ candidates: [P1, P2], carries: new Map([[P1, true], [P2, true]]) }); ok(!!r2.take, 'CONTROL («at least one»): a duplicated tab\'s two carriers — one of them, perhaps the person\'s copy, is taken — RED', r2); }
    // the one read the keeper makes: on each page's own socket, the history stays there — only yes / no / unknown comes back
    const { WebSocketServer: WSS2 } = require('ws');
    const hist = new Map([[P1, [{ url: U0 }, { url: 'https://a.example/' }]], [P2, [{ url: 'about:blank' }, { url: 'https://b.example/' }]], [P3, null]]);
    const wss2 = new WSS2({ port: 0, host: '127.0.0.1' }); await new Promise((r) => wss2.once('listening', r));
    wss2.on('connection', (sock, req) => { const tid = (/\/devtools\/page\/([^/?]+)/.exec(String(req.url || '')) || [])[1] || ''; sock.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch { return; } if (m.method !== 'Page.getNavigationHistory') return; const es = hist.get(tid); if (!es) return; try { sock.send(JSON.stringify({ id: m.id, result: { currentIndex: es.length - 1, entries: es } })); } catch { /* closed */ } }); });
    const base = `ws://127.0.0.1:${wss2.address().port}/devtools/browser/stand-in`;
    const got = await Promise.all([P1, P2, P3].map((id) => VPm.firstEntryIs(base, id, U0, { timeoutMs: 400 })));
    for (const c of wss2.clients) c.terminate(); await new Promise((r) => wss2.close(() => r()));
    ok(got[0] === true && got[1] === false && got[2] === null, 'B-0e4a: the keeper\'s read — the FIRST history entry compared on the page\'s own socket: the marked tab yes, another no, a silent page UNKNOWN at its bound; only the answer leaves', got);
    // ═══ 主开发 r4312 / r4319 LAW A: EVERY READ FIRST, THEN AT MOST ONE ACT. The one carrier is taken back ONLY when it is ALONE in
    //     its window and every page's history and window was read; shared (another page in its window) or unknown (a window unread):
    //     NOTHING is sent to it — no switch, no stamp — a new mark (at most once a browser run), a tab of its own as today.
    //     RED: the switch as built (sent before the windows were read) ═══
    const av = {
      alone: TBS0.aloneVerdict({ take: P1, windows: new Map([[P1, 11], [P2, 12], [P3, 12]]) }),
      shared: TBS0.aloneVerdict({ take: P1, windows: new Map([[P1, 11], [P2, 11], [P3, 12]]) }),
      unread: TBS0.aloneVerdict({ take: P1, windows: new Map([[P1, 11], [P2, null], [P3, 12]]) }),
      carrierUnread: TBS0.aloneVerdict({ take: P1, windows: new Map([[P1, null], [P2, 12]]) }),
      notListed: TBS0.aloneVerdict({ take: P3, windows: new Map([[P1, 11], [P2, 12]]) }),
      none: TBS0.aloneVerdict({ take: P1, windows: null }),
    };
    ok(av.alone.take === P1 && av.alone.window === 11 && av.shared.why === 'shared' && av.unread.why === 'unknown' && av.carrierUnread.why === 'unknown' && av.notListed.why === 'unknown' && av.none.why === 'unknown' && !av.shared.take && !av.unread.take,
      'LAW A PURE: the carrier is taken back with its window only when it is alone there and every page\'s window was read — another page in it ⇒ «shared», any window unread ⇒ «unknown», neither takes', av);
    const WINm = require('../src/browser-windows.js');
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const SWITCH_ANCH = "    // READ 2 (only for the one carrier): EVERY page's window — still nothing sent to any page\n";
    if (!ksrc.includes(SWITCH_ANCH)) ok(false, 'the anchor of the control «the switch as built» is not in the source (src/server/browser-keeper.js)');
    const Ksw = ksrc.includes(SWITCH_ANCH) ? M.load('src/server/browser-keeper.js', editAnchor(ksrc, SWITCH_ANCH, "    if (v.take) { try { await rt.exec(nsOf(p.id), [...(pinTab ? ['--pin-tab'] : []), 'tab', v.take, '--json'], o); } catch { /* the switch as built: before the windows */ } }\n", 'src/server/browser-keeper.js'), 'b0e4a-switch-as-built') : null;
    const R1 = T(0xb1), R2 = T(0xb2);
    const upId = (v) => String(v || '').toUpperCase(); // the page ids as the keeper keys them (the suite keeps no idKey of its own)
    // the keeper's own take-back (the rebind's call, through its suite seam) over the fake browser: Chrome's restore stood in by two
    // pages nobody roots — R1 carries the lease's mark (its first entry), R2 does not; their windows as the scene places them. The
    // runtime RECORDS every command the keeper sends (law A: in the shared and unread scenes nothing reaches the carrier)
    const takeLeg = async (Kmod, tag, wins, { carries = new Map([[R1, true]]), reopen = false, twice = false, liveRoot = false, ask = false } = {}) => {
      const opened = []; // the birth address of every window the keeper asks for (the stand-in opens none: its first command opens the tab)
      const sent = []; const rtBase = F.createBrowserRuntime({ env });
      const rtRec = { ...rtBase, exec: async (ns, argv, o) => { sent.push((argv || []).map(String).join(' ')); return rtBase.exec(ns, argv, o); } };
      const kw = mkKeeper(Kmod, { dataDir: path.join(ROOT, 'data-0e4a-' + tag), runtime: rtRec, firstEntryIs: async (_c, id) => (carries.has(upId(id)) ? carries.get(upId(id)) : false), windowOf: async (_c, id) => (wins.has(upId(id)) ? wins.get(upId(id)) : null),
        openWindow: async (_c, o) => { opened.push(String((o && o.url) || '')); return { ok: false, error: 'stand-in: no window' }; } });
      await kw._facts.probeVersion();
      const pw = kw.createProfile({ label: '0e4a ' + tag });
      await kw.attach({ profileId: pw.id, browserKey: KA, sessionId: 'x-0e4a-' + tag });
      const NSW = B.sessionNameFor(pw.id);
      await kw._runtime.exec(NSW, ['--pin-tab', 'open', 'https://own.example/'], await kw.leaseCliOpts(pw.id, KA));
      const sf = path.join(AB, NSW + '.json'); const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
      st.tabs = [R1, R2].map((id, i) => ({ tabId: 'r' + (i + 1), targetId: id, url: `https://restored.example/${i + 1}`, title: `Restored ${i + 1}`, label: null, opener: null }));
      fs.writeFileSync(sf + '.part', JSON.stringify(st)); fs.renameSync(sf + '.part', sf);
      const l = B.findLease(kw._reg().leases, pw.id, KA);
      if (l) { if (!TBS0.OWN_MARK_RE.test(String(l.ownMark || ''))) l.ownMark = MARK; l.targetId = null; l.tabRoots = liveRoot ? [R1] : []; if (liveRoot) { delete l.windowIn; l.windowId = null; } else { l.windowIn = 'a-run-before'; l.windowId = 99; } }
      const mark0 = l ? String(l.ownMark || '') : '';
      const s0 = sent.length;
      const back = liveRoot ? null : await kw._takeBack(pw.id, KA);
      const toCarrier = sent.slice(s0).filter((c) => c.toUpperCase().includes(R1)); // every command that named the carrier
      const l2 = B.findLease(kw._reg().leases, pw.id, KA) || {};
      const inst = WINm.instanceOf(kw._reg().browsers[pw.id]);
      const out = { back: back ? back.targetId : null, own: !!inst && l2.windowIn === inst, hasWindowIn: 'windowIn' in l2, windowId: l2.windowId == null ? null : l2.windowId, roots: l2.tabRoots, toCarrier, remarked: !!l2.ownMark && l2.ownMark !== mark0, markOk: TBS0.OWN_MARK_RE.test(String(l2.ownMark || '')), facts: liveRoot ? null : (kw._takeBackFacts().slice(-1)[0] || null) };
      if (ask) { const rq = kw.requestTakeover({ browserKey: KA, profileId: pw.id, sessionId: 'x-0e4a-' + tag, text: 'Please sign in for me', url: U0, title: U0 }); const row = (kw.takeoverRequests() || []).find((x) => x && x.browserKey === KA) || null; out.ask = { ok: !!(rq && rq.ok), url: row ? row.url : null, title: row ? row.title : null }; }
      if (twice) { const m1 = l2.ownMark; await kw._takeBack(pw.id, KA); const l3 = B.findLease(kw._reg().leases, pw.id, KA) || {}; out.second = { remint: !!(kw._takeBackFacts().slice(-1)[0] || {}).remint, same: l3.ownMark === m1 }; }
      // the switch's / a site's re-open (openInLease) afterwards: the birth address of the window it asks for
      if (reopen) { const n0 = opened.length; await kw.openInLease({ profileId: pw.id, browserKey: KA, url: 'https://next.example/' }); const l4 = B.findLease(kw._reg().leases, pw.id, KA) || {}; out.reopenAt = opened.slice(n0).map((u) => (u === TBS0.ownMarkUrl(l4.ownMark) ? 'its mark' : u)); }
      return out;
    };
    const many = new Map([[R1, true], [R2, true]]), unknown = new Map([[R1, true], [R2, null]]), none = new Map();
    // the finds' control: the birth beside a live root (as at e7c90bba6)
    const ROOT_ANCH = "        if (at !== 'about:blank' && liveRoots.length) { const tl = await tabTargetsOf(rec.cdpUrl); if (!tl || TBS.pageTargets(tl).some((x) => liveRoots.includes(x.targetId))) at = 'about:blank'; }\n";
    if (!ksrc.includes(ROOT_ANCH)) ok(false, 'the anchor of the control «a marked birth beside a live root» is not in the source (src/server/browser-keeper.js)');
    const Kl = ksrc.includes(ROOT_ANCH) ? M.load('src/server/browser-keeper.js', editAnchor(ksrc, ROOT_ANCH, '        // (the control: a marked birth beside a live root)\n', 'src/server/browser-keeper.js'), 'b0e4a-birth-beside-root') : null;
    const [tAlone, tShared, tUnread, tSwCtl, tMany, tUnknown, tNone, tRoot, tCtlL] = await Promise.all([takeLeg(K, 'alone', new Map([[R1, 11], [R2, 12]]), { ask: true }), takeLeg(K, 'shared', new Map([[R1, 11], [R2, 11]]), { twice: true }),
      takeLeg(K, 'unread', new Map([[R1, 11]])), Ksw ? takeLeg(Ksw, 'sw-ctl', new Map([[R1, 11], [R2, 11]])) : Promise.resolve(null),
      takeLeg(K, 'many', new Map(), { carries: many }), takeLeg(K, 'unknown', new Map(), { carries: unknown }), takeLeg(K, 'none', new Map(), { carries: none, reopen: true }),
      takeLeg(K, 'root', new Map(), { liveRoot: true, reopen: true }), Kl ? takeLeg(Kl, 'ctl-l', new Map(), { liveRoot: true, reopen: true }) : Promise.resolve(null)]);
    ok(tAlone.back === R1 && tAlone.own && tAlone.windowId === 11 && tAlone.toCarrier.length === 1 && /\btab\b/.test(tAlone.toCarrier[0]) && tAlone.facts && tAlone.facts.verdict === 'take' && tAlone.facts.ownWindow === true && tAlone.facts.orphans === 2 && tAlone.facts.unread === 0 && tAlone.facts.winUnread === 0,
      'LAW A: a carrier ALONE in its window — ONE act (the switch to it), then its root and that window are the lease\'s (its next tab lands there)', tAlone);
    ok(!tShared.back && tShared.toCarrier.length === 0 && tShared.facts && tShared.facts.verdict === 'shared' && tShared.remarked && tShared.markOk && tShared.facts.remint === true && !!tShared.second && tShared.second.remint === false && tShared.second.same,
      'LAW A: a carrier with a SECOND page in its window — NOT taken back: nothing sent to it (no switch, no stamp), the verdict «shared», a new mark — and at most ONE new mark a browser run (a second take-back in the run keeps it)', { shared: tShared.facts, toCarrier: tShared.toCarrier, second: tShared.second });
    ok(!tUnread.back && tUnread.toCarrier.length === 0 && tUnread.facts && tUnread.facts.verdict === 'unknown' && tUnread.facts.winUnread === 1 && tUnread.remarked,
      'LAW A: a page whose window was not read inside its bound — NOT taken back, nothing sent to the carrier, the verdict «unknown», a new mark', { facts: tUnread.facts, toCarrier: tUnread.toCarrier });
    if (Ksw) ok(!!tSwCtl && tSwCtl.toCarrier.some((c) => /\btab\b/.test(c)) && !tSwCtl.back, 'CONTROL (the switch as built: sent before the windows were read): in the shared scene the carrier is switched to — in a person\'s window their own tab hidden — RED', tSwCtl && { toCarrier: tSwCtl.toCarrier, facts: tSwCtl.facts });
    // ═══ r4282's FOLLOW (its finds, taken by the round): the take-back leaves ONE carrier for the next start, never two ═══
    ok(!tMany.back && tMany.facts && tMany.facts.verdict === 'many' && tMany.remarked && tMany.markOk && tMany.facts.remint === true && tMany.toCarrier.length === 0 && !tUnknown.back && tUnknown.facts && tUnknown.facts.verdict === 'unknown' && tUnknown.remarked && tUnknown.markOk && !tNone.back && tNone.facts && tNone.facts.verdict === 'none' && !tNone.remarked,
      'r4282 follow: «many» (a copy) and «unknown» (a page unread) give the lease a NEW mark — the birth that follows is the ONE carrier of it, so the next start is not «many» again; «none» keeps its mark', { many: tMany.facts, unknown: tUnknown.facts, none: tNone.facts });
    ok(J(tRoot.reopenAt) === J(['about:blank']) && J(tNone.reopenAt) === J(['its mark']),
      'r4282 follow: a re-open (openInLease) beside the lease\'s LIVE root with no window of its own births its window at a plain blank — no second carrier; with no live root it is the root, born at its mark', { root: tRoot.reopenAt, none: tNone.reopenAt });
    if (Kl) ok(!!tCtlL && J(tCtlL.reopenAt) === J(['its mark']), 'CONTROL (a marked birth beside a live root): the re-open is a SECOND carrier of the mark — RED', tCtlL && tCtlL.reopenAt);
    // ═══ 主开发 r4319 L2: THE MARK LEAVES THE HUB IN NO VIEW — ONE door (TBS.markOut / markOutText) on every hub exit of a tab's
    //     address or title. The page knows nothing of the mark: the page-side legs of the round went back to plain blanks ═══
    const door = {
      text: TBS0.markOutText(JSON.stringify({ type: 'tabs', tabs: [{ url: U0, title: U0 }] })),
      cut: TBS0.markOutText(`title ${U0.slice(0, 30)}`),
      deep: TBS0.markOut({ a: [{ url: U0, note: TBS0.reboundNoteText({ how: 'switched', url: U0 }) }], b: { c: { d: `see ${U0} here` } } }),
      upper: TBS0.markOutText(U0.toUpperCase().replace('ABOUT:BLANK', 'about:blank')), // a page could make it so: any case reads as the blank
    };
    const clean = { n: 1, s: 'https://a.example/#vs-other', a: [1, 2], o: { x: 'y' } };
    ok(!/vs-own-/i.test(J(door)) && J(door.deep).includes('about:blank') && TBS0.markOut(clean) === clean && TBS0.markOut(clean.a) === clean.a && TBS0.markOutText('about:blank') === 'about:blank',
      'L2 PURE: the door turns every marked blank — whole, cut short, any case, deep in a reply, inside a note — into the plain blank; a reply with no mark comes back AS IT IS (the same object)', door);
    const pk = TBS0.markOut({ pick: TBS0.rebindPick({ targets: [{ targetId: P1, type: 'page', url: U0, title: U0 }], holders: [], key: KA }) });
    const mDrawn = TBS0.tabRowModel({ tabs: TBS0.markOut([{ targetId: P1, url: U0, title: U0, active: true }]), owners: { [P1]: 'agent' } });
    const mOrphan = TBS0.tabRowModel({ tabs: TBS0.markOut([{ targetId: P2, url: U0, title: U0 }]), owners: {} });
    ok(pk.pick.url === 'about:blank' && mDrawn.rows.length === 1 && mDrawn.rows[0].url === 'about:blank' && !J(mDrawn).includes('vs-own-') && mOrphan.rows.length === 0,
      'L2: what the page gets through the door is a PLAIN blank — the rebind\'s pick, the drawn row (url, chip, tip), nobody\'s blank folded — the page\'s own plain-blank rules, unchanged', { pick: pk.pick, drawn: mDrawn.rows, orphanRows: mOrphan.rows.length });
    const lsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
    ok(!/isOwnBlank|vs-own|markOut/.test(lsrc), 'L2: the live view holds NO knowledge of the mark (no isOwnBlank, no vs-own, no door of its own): the hub hands it plain blanks', (lsrc.match(/isOwnBlank|vs-own|markOut/g) || []).length);
    // THE CENSUS of the hub's exits (read by name; a new exit is red until it passes the door): the live view's ONE send and what
    // leaves the relay of the driver's records (src/server/browser-stream.js), the keeper's broadcasts (one wrapper at create), and EVERY
    // JSON reply of both browser routers (the door mounted before their first route)
    const exitsCensus = (src) => {
      const bad = [];
      const st = src.stream.split('\n');
      const wsSends = st.filter((l) => /\bws\.send\(/.test(l));
      if (wsSends.length !== 1 || !/const wsOut = \(ws, text\) =>/.test(wsSends[0])) bad.push(`browser-stream: ${wsSends.length} socket send(s) — the ONE is wsOut — ${wsSends.map((l) => l.trim().slice(0, 90)).join(' | ')}`);
      const outs = st.filter((l) => /\bwsOut\(/.test(l) && !/const wsOut = /.test(l));
      if (outs.length !== 2 || !outs.some((l) => /const send = \(ws, obj\) => wsOut\(ws, TBS\.markOutText\(/.test(l)) || !outs.some((l) => /const sendFrame = \(ws, frameText\) => wsOut\(ws, frameText\)/.test(l))) bad.push(`browser-stream: wsOut is reached past the door or the frame send — ${outs.map((l) => l.trim().slice(0, 90)).join(' | ')}`);
      const frames = st.filter((l) => /\bsendFrame\(/.test(l) && !/const sendFrame = /.test(l));
      const badFrames = frames.filter((l) => !/sendFrame\((?:ws|viewer\.ws|v\.ws), relay\.lastFrame\)/.test(l) && !(/sendFrame\(v\.ws, text\)/.test(l) && /frameGate/.test(l)));
      if (badFrames.length) bad.push(`browser-stream: the frame send carries a record that is not a picture frame — ${badFrames.map((l) => l.trim().slice(0, 90)).join(' | ')}`);
      if (st.some((l) => /lastRaw/.test(l) && /\bsend(Frame)?\(/.test(l))) bad.push('browser-stream: the raw copy (lastRaw) is sent');
      const outLine = st.filter((l) => /const outText = /.test(l));
      if (outLine.length !== 1 || !outLine[0].includes('TBS.markOutText(text)')) bad.push('browser-stream: the driver\'s record leaves the relay with no door (no outText through TBS.markOutText)');
      if (!st.some((l) => l.includes('fn(outMsg, outText, relay)'))) bad.push('browser-stream: the recorder\'s taps take the raw record');
      if (!st.some((l) => l.includes('onOrderedForKeeper(relay, outMsg)'))) bad.push('browser-stream: the keeper\'s notes take the raw record');
      if (st.some((l) => /relay\.last\[msg\.type\] = text\b/.test(l))) bad.push('browser-stream: the replay store keeps the raw record');
      const kb = src.keeper.split('\n');
      if (!kb.some((l) => l.includes("broadcast: broadcastIn = null"))) bad.push('browser-keeper: create takes `broadcast` raw (not as broadcastIn)');
      const rawB = kb.filter((l) => /\bbroadcastIn\(/.test(l) && !l.includes('broadcastIn(TBS.markOut('));
      if (rawB.length) bad.push(`browser-keeper: broadcastIn called raw — ${rawB.map((l) => l.trim().slice(0, 90)).join(' | ')}`);
      for (const [name, text] of [['routes/browser', src.routes], ['routes/browser-trace', src.trace]]) {
        const lines = text.split('\n');
        const doorAt = lines.findIndex((l) => l.startsWith('router.use(') && l.includes('markOut(body)'));
        const firstRoute = lines.findIndex((l) => /^router\.(get|post|put|patch|delete|use)\(/.test(l) && !l.includes('markOut(body)'));
        if (doorAt < 0 || (firstRoute >= 0 && firstRoute < doorAt)) bad.push(`${name}: the reply door is not mounted before its first route`);
        const raw = lines.filter((l) => /\bres\.(send|end|write)\(/.test(l));
        if (raw.length) bad.push(`${name}: a reply written past the door — ${raw.map((l) => l.trim().slice(0, 90)).join(' | ')}`);
      }
      return bad;
    };
    const exitSrc = { stream: fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8'), keeper: ksrc, routes: fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'), trace: fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8') };
    const exitsNow = exitsCensus(exitSrc);
    ok(exitsNow.length === 0, 'L2 CENSUS: every hub exit of a tab\'s address passes the ONE door — the live view\'s one send, what leaves the relay (the recorder\'s taps, the keeper\'s notes, the replay store; the relay\'s own picture state keeps the page\'s address), the keeper\'s broadcasts, both browser routers\' replies (their files sent are pictures and recordings, no address)', exitsNow);
    const planted = { ...exitSrc, stream: exitSrc.stream.replace('  const broadcast = (relay, obj) =>', '  const rawSend = (ws, t) => ws.send(t); // planted\n  const broadcast = (relay, obj) =>') };
    ok(planted.stream !== exitSrc.stream && exitsCensus(planted).length > 0, 'CONTROL (one raw site planted: a viewer send past the door): the census is RED by name', exitsCensus(planted));
    const plantedF = { ...exitSrc, stream: exitSrc.stream.replace('  const broadcast = (relay, obj) =>', "  const leak = (ws, rec) => sendFrame(ws, JSON.stringify(rec)); // planted\n  const broadcast = (relay, obj) =>") };
    ok(plantedF.stream !== exitSrc.stream && exitsCensus(plantedF).some((b) => /frame send/.test(b)), 'CONTROL (a record that is no picture planted on the frame send — past the door): the census is RED by name', exitsCensus(plantedF));
    // ═══ 主开发 r4339 FOLLOW: the mark is kept out at the WRITE too — the kept tabs (their ONE row normalizer: the relay's record
    //     and a CDP read alike), the rebind's pick (the lease's stored rebound note, the journal line), a takeover request's page;
    //     the trace's only input is the relay's tap, which takes the masked record. The door's match is anchored ═══
    const pick0 = TBS0.rebindPick({ targets: [{ targetId: P1, type: 'page', url: U0, title: U0 }], holders: [], key: KA });
    const note0 = TBS0.reboundNoteText({ how: 'switched', url: pick0 && pick0.url, why: 'life' });
    const ksT = require('../src/server/browser-kept.js').create({ dataDir: path.join(ROOT, 'data-0e4a-kept'), log: quiet });
    ksT.noteTabs(KA, [{ targetId: P1, url: U0, title: U0, active: true }], 'cdp');
    const keptRow = (ksT.latestOf(KA) || { tabs: [] }).tabs[0] || null;
    try { ksT.shutdown(); } catch { /* none */ }
    const anchoredDoor = { query: TBS0.markOutText('https://x.example/?q=about:blank#vs-own-zz'), longer: TBS0.markOutText(`${U0}0`), cut: TBS0.markOutText(`about:blank#vs-own-${MARK.slice(0, 7)}`) };
    ok(!!pick0 && pick0.url === 'about:blank' && !note0.includes('vs-own') && !!keptRow && keptRow.url === 'about:blank' && !/vs-own/i.test(keptRow.title) && !!tAlone.ask && tAlone.ask.ok && tAlone.ask.url === 'about:blank' && !/vs-own/i.test(String(tAlone.ask.title))
      && anchoredDoor.query === 'https://x.example/?q=about:blank#vs-own-zz' && anchoredDoor.longer === `${U0}0` && anchoredDoor.cut === 'about:blank',
      'r4339 FOLLOW: kept out at the WRITE — the kept tabs\' row (a CDP read\'s), the rebind\'s pick and its note, a takeover request\'s page hold the plain blank; the door\'s match is anchored (a page\'s own «?q=…#vs-own-zz», a longer hex run stay as they are; a cut-short mark is the blank)', { pick: pick0, keptRow, ask: tAlone.ask, anchoredDoor });
    const stSrc = exitSrc.stream;
    ok(/function lastUrlOf\(relay\) \{[\s\S]{0,400}relay\.lastRaw\.url[\s\S]{0,300}relay\.lastRaw\.tabs/.test(stSrc) && stSrc.includes("relay.last[msg.type] = outText; if (msg.type === 'url' || msg.type === 'tabs') relay.lastRaw[msg.type] = text;"),
      'r4339 FOLLOW: the replay store holds the masked record; the url fallback that feeds the viewport lookup reads the RAW copy (never sent)', null);
    // the HUB's own reads of a blank (the keeper's settling read, the spare-blank fold) know the marked one: ONE shape, any case
    const blank = { re: TBS0.BLANK_URL_RE.test(U0), tab: TBS0.isBlankTab({ url: U0 }), own: TBS0.isOwnBlank(U0), upper: TBS0.isOwnBlank(U0.replace(MARK, MARK.toUpperCase())) && TBS0.BLANK_URL_RE.test(U0.replace(MARK, MARK.toUpperCase())), plain: TBS0.BLANK_URL_RE.test('about:blank') && TBS0.BLANK_URL_RE.test('chrome://newtab/') && TBS0.BLANK_URL_RE.test(''),
      notOwn: [`about:blank#vs-own-${'g'.repeat(24)}`, `https://a.example/#vs-own-${MARK}`, `${U0}x`, 'about:blank'].map((u) => TBS0.isOwnBlank(u)), page: TBS0.BLANK_URL_RE.test('https://a.example/') };
    ok(blank.re && blank.tab && blank.own && blank.upper && blank.plain && blank.notOwn.every((x) => x === false) && !blank.page,
      'the hub\'s own reads: the marked blank is a blank (BLANK_URL_RE, isBlankTab, isOwnBlank — one shape, any case: 24 hex after about:blank#vs-own-, nothing else)', blank);
    const BANCH = "const BLANK_URL_RE = new RegExp(`^(?:about:blank|${OWN_BLANK_RE.source.slice(1, -1)}|chrome:\\\\/\\\\/(?:newtab|new-tab-page)\\\\/?|)$`, 'i');";
    if (!tsrc.includes(BANCH)) ok(false, 'the anchor of the control «the blank shape without the mark» is not in the source (src/browser-tabs.js)');
    const TBSb = tsrc.includes(BANCH) ? M.load('src/browser-tabs.js', editAnchor(tsrc, BANCH, 'const BLANK_URL_RE = /^(?:about:blank|chrome:\\/\\/(?:newtab|new-tab-page)\\/?|)$/i;', 'src/browser-tabs.js'), 'b0e4a-blank-unmarked') : null;
    if (TBSb) ok(!TBSb.isBlankTab({ url: U0 }) && !TBSb.BLANK_URL_RE.test(U0),
      'CONTROL (the blank shape without the mark, as at e7c90bba6): a marked root is no blank — the settling read waits on it, a window\'s spare one is not folded — RED', { tab: TBSb.isBlankTab({ url: U0 }) });
  }
  // ═══ the IDLE PAINT STOP UNDER A RUNNING VERB (an agent's feedback 2026-11-18: a fresh profile's first open of a large web app
  //     left its tab busy ~2 min, the person saw a crashed page; opening the sign-in page again recovered it at once) — PLACED over
  //     the real watch on a stand-in browser (a loaded page: no navigation in flight), its clock the leg's own ═══
  {
    const BIdle = require('../src/browser-idle.js');
    const ipLeg = async (Dmod) => {
      const SI = await standIn(); const PID = 'bp-0000c23b'; let clock = 1795000000000;
      const D = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: SI.url }), holdsDialogsFor: () => true }, log: quiet, now: () => clock, leaseCountOf: () => 1 });
      const verdict = () => { const f = D.paintFacts(PID); return f ? BIdle.idlePaintVerdict({ enabled: true, viewers: 0, lastVerbAt: f.lastVerbAt, now: clock, busy: f.busy, frozen: f.frozen }) : null; };
      try {
        await D.arm(PID, { budgetMs: 3000 });
        const opened = await until(() => !!D.paintFacts(PID), 3000);
        D.verbStarted(KA, { profileId: PID, verb: 'open' });                       // the agent's `open` — still running…
        clock += BIdle.IDLE_PAINT_MS + 1000;                                          // …past the idle bound, its page loaded
        const underVerb = verdict();
        D.verbEnded(KA, { profileId: PID });                                          // the verb ends now
        clock += 10000; const tenAfter = verdict();                                   // 10 s after its END
        clock += BIdle.IDLE_PAINT_MS; const pastEnd = verdict();                      // the idle bound after its end
        D.verbStarted(KB, { profileId: PID, verb: 'click' });                         // a verb whose CLI crashed: no end ever comes
        clock += 5 * 60 * 1000 + 1000; const crashed = verdict();                     // past the watch's own bound on a /resolve without its audit
        return { opened, underVerb, tenAfter, pastEnd, crashed };
      } finally { try { D.shutdown(); } catch { /* */ } await SI.close(); }
    };
    const RUNANCH = ' || !!w.thawing || verbRunningOn(profileId), frozenAt:';
    const ENDANCH = '{ if (!browserKey) return; if (profileId && watches.get(String(profileId))) watches.get(String(profileId)).lastVerbAt = now();';
    // each control is built through scripts/scratch.mjs anchored() (B-0d3e): an anchor gone or spelled twice THROWS BY NAME
    const DDr = M.load('src/server/browser-dialogs.js', anchored(dsrc, RUNANCH, ' || !!w.thawing, frozenAt:', 'idle paint: a running verb is busy'), 'ip-release-busy'); // stale-pins: kept — the release's busy, planted back as this control's mutant
    const DDe = M.load('src/server/browser-dialogs.js', anchored(dsrc, ENDANCH, '{ if (!browserKey) return;', 'idle paint: the clock restarts at a verb\'s end'), 'ip-no-end-stamp');
    const [ip, ipRel, ipEnd] = await Promise.all([ipLeg(DD), ipLeg(DDr), ipLeg(DDe)]);
    ok(ip.opened && ip.underVerb && ip.underVerb.act === null && ip.underVerb.why === 'busy',
      'the idle paint stop: a page with a verb STILL RUNNING on its browser (31 s after the verb started, its page loaded) is never frozen under it — the verdict reads «busy»', ip.underVerb);
    ok(ip.tenAfter && ip.tenAfter.act === null && ip.tenAfter.why === 'recent' && ip.pastEnd && ip.pastEnd.act === 'freeze',
      '…and the idle clock restarts when the verb ENDS: 10 s after its end it is «recent», the idle bound after its end it stops drawing (nobody watches, nobody drives)', { tenAfter: ip.tenAfter, pastEnd: ip.pastEnd });
    ok(ip.crashed && ip.crashed.act === 'freeze', 'a verb whose CLI crashed (a /resolve with no audit) holds the stop off no longer than the watch\'s own bound on it (5 min)', ip.crashed);
    ok(ipRel.underVerb && ipRel.underVerb.act === 'freeze', 'CONTROL (the release\'s busy: a running verb not counted): the page is FROZEN under the agent\'s own verb 31 s after it started — the reported two-minute busy tab — RED', ipRel.underVerb);
    ok(ipEnd.tenAfter && ipEnd.tenAfter.act === 'freeze', 'CONTROL (the clock stamped only at a verb\'s start): 10 s after a long verb ENDED the page is frozen as if idle since its start — RED', ipEnd.tenAfter);
  }
}

// ═══ ③b B-21cc (主开发 r2849 (2)): THE ROUTES' TAB MOVERS ═══════════════════════
// A snapshot's note makes no read (src/server/browser-dialogs.js): the fill decides by the tab epoch, which every mover of ONE list
// bumps. The routes' rows of that list, on the real keeper and the real routes: the conversation's own tab verb (any but a list; a
// failed or a closing one; a batch holding one; a CLI that names no sub-verb) at its START (/resolve) and its END (/audit); the
// server's tab road at its start and its end (a refused act too). The snapshot's note carries the verb's /resolve instant and no
// tab; its frame note is asked of the tab the watch knows WITHOUT a read, and nothing is asked when it knows none.
console.log('— ③b B-21cc (r2849): the routes tell the dialog watch every tab verb of the conversation, at its start and its end; a list moves nothing');
{
  const realD = require('../src/server/browser-dialogs.js').create({ keeper: k, log: quiet, leaseCountOf: () => 1 });
  const rec = [];
  let remembered = null;
  const WATCHED = new Set(['moveTab', 'noteSnapshot', 'otherSiteFramesFor']);
  const spyD = new Proxy(realD, { get(o, p) {
    if (p === 'rememberedTabOf') return () => { rec.push(['rememberedTabOf']); return remembered; };
    const v = o[p];
    if (typeof v !== 'function') return v;
    if (!WATCHED.has(p)) return v.bind(o);
    return (...a) => { rec.push([String(p), ...(p === 'moveTab' ? a : a.slice(1))]); return p === 'otherSiteFramesFor' ? null : v.apply(o, a); };
  } });
  R.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [], dialogs: spyD });
  try {
    await j('POST', '/api/agent/browser/use', { profile: 'Work' }, as(sA)); // A holds the browser (an earlier block may have let it go)
    const movesOf = async (fn) => { rec.length = 0; await fn(); return rec.filter((x) => x[0] === 'moveTab').map((x) => `${x[1]}:${(x[2] && x[2].browserKey) || ''}`); };
    const got = {
      resolveTab: await movesOf(() => j('POST', '/api/agent/browser/resolve', { argv: ['tab', String(aTab || 'T1')], wrapper: true }, as(sA))),
      resolveList: await movesOf(() => j('POST', '/api/agent/browser/resolve', { argv: ['tab', 'list'], wrapper: true }, as(sA))),
      resolveBatch: await movesOf(() => j('POST', '/api/agent/browser/resolve', { argv: ['batch'], batchVerbs: ['open', 'tab'], wrapper: true }, as(sA))),
      resolveOpen: await movesOf(() => j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://a.example/2'], wrapper: true }, as(sA))),
      auditClose: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'tab', tabVerb: 'close', ok: false }, as(sA))),
      auditList: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'tab', tabVerb: 'list', ok: true }, as(sA))),
      auditBareTab: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'tab', tabVerb: '', ok: true }, as(sA))),
      auditNoWord: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'tab', ok: true }, as(sA))),
      auditBatch: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'batch', tabVerb: 'batch', ok: true }, as(sA))),
      auditOpen: await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'open', ok: true }, as(sA))),
      routeList: await movesOf(() => tabCmd(sA, ['tab', 'list'])),
      routeAct: await movesOf(() => tabCmd(sA, ['tab', String(aTab || 'T1')])),
      routeRefused: await movesOf(() => tabCmd(sA, ['tab', String(bTab || 'T2')])),
    };
    // r2992 (7): THE TWO ROADS AGREE on what a tab command is — the CLI hands the command as typed (`tabArgv`) and /audit judges it by
    // the SAME verdict /resolve uses, as the server's tab road does: every form, the same answer on each road
    const FORMS = [['tab'], ['tab', '--json'], ['tab', 'list'], ['tab', 'list', '--json'], ['tab', '--json', String(bTab || 'T2')], ['tab', 'close'], ['tab', 'new', 'https://a.example/3'], ['tab', String(aTab || 'T1')]];
    const agree = [];
    for (const form of FORMS) {
      const atResolve = (await movesOf(() => j('POST', '/api/agent/browser/resolve', { argv: form, wrapper: true }, as(sA)))).length > 0;
      const atAudit = (await movesOf(() => j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'tab', tabArgv: form, ok: true }, as(sA)))).length > 0;
      agree.push({ form: form.join(' '), atResolve, atAudit });
    }
    const listForms = agree.filter((x) => /^tab( --json)?$|^tab list( --json)?$/.test(x.form));
    const routeJson = await movesOf(() => tabCmd(sA, ['tab', '--json']));
    ok(agree.every((x) => x.atResolve === x.atAudit) && listForms.length === 4 && listForms.every((x) => !x.atResolve) && agree.filter((x) => !listForms.includes(x)).every((x) => x.atResolve) && J(routeJson) === '[]',
      'B-21cc (r2992 (7)): the roads AGREE on whether a tab command moves the tab — /resolve, /audit (the command as typed) and the server\'s tab road judge each form by ONE verdict: a listing (with or without --json) moves nothing, every other form moves it', agree);
    const V = `tab-verb:${KA}`, RT = `tab-route:${KA}`;
    ok(J(got.resolveTab) === J([V]) && J(got.resolveBatch) === J([V]) && J(got.auditClose) === J([V]) && J(got.auditNoWord) === J([V]) && J(got.auditBatch) === J([V]),
      'B-21cc (r2849 (2)): the conversation\'s own tab verb is a MOVER at its start (/resolve: `tab <id>`, a batch holding a tab verb) and at its end (/audit: a failed `tab close`, a batch, a CLI that names no sub-verb) — the conversation\'s epoch, under ITS key', got);
    ok(J(got.resolveList) === '[]' && J(got.resolveOpen) === '[]' && J(got.auditList) === '[]' && J(got.auditBareTab) === '[]' && J(got.auditOpen) === '[]',
      'B-21cc (r2849 (2)): CONTROL — a tab LIST (`tab list`, a bare `tab`) and a verb that is no tab verb (`open`) move nothing', got);
    ok(J(got.routeAct) === J([RT, RT]) && J(got.routeRefused) === J([RT, RT]) && J(got.routeList) === '[]',
      'B-21cc (r2849 (2)): the server\'s tab road is a mover at its START and at its END — an act on A\'s own tab, and an act refused (B\'s tab) too; its list moves nothing', got);
    // the snapshot's note: the verb's own /resolve instant, no tab; the frame note asked of the tab known without a read — none ⇒ nothing asked
    rec.length = 0; remembered = null;
    await j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'snapshot', ok: true, since: 1234567, snapshotRefs: [{ ref: '@e1', role: 'textbox', name: 'Email', nth: 0 }] }, as(sA));
    const recNone = rec.map((x) => x[0]);
    const noted = rec.find((x) => x[0] === 'noteSnapshot');
    rec.length = 0; remembered = String(aTab || 'T1');
    await j('POST', '/api/agent/browser/audit', { profile: work.id, verb: 'snapshot', ok: true, since: 1234568, snapshotRefs: [{ ref: '@e1', role: 'textbox', name: 'Email', nth: 0 }] }, as(sA));
    const asked = rec.find((x) => x[0] === 'otherSiteFramesFor');
    ok(!!(noted && noted[1] && noted[1].since === 1234567 && !('targetId' in noted[1]) && Array.isArray(noted[1].parsedRefs) && noted[1].parsedRefs.length === 1),
      'B-21cc (r2849): the route\'s own snapshot note passes the verb\'s /resolve instant and NO tab (the driver\'s answer names none; the note reads nothing)', { noted });
    ok(recNone.includes('rememberedTabOf') && !recNone.includes('otherSiteFramesFor') && !!(asked && asked[1] && asked[1].targetId === String(aTab || 'T1')),
      'B-21cc (r2849 (5)): the snapshot\'s frame note is asked of the tab the watch knows WITHOUT a read; when it knows none, nothing is asked — silent rather than wrong', { recNone, asked });
  } finally {
    R.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
    try { realD.shutdown(); } catch { /* its own */ }
  }
}

// ═══ ④ THE WORDS ═════════════════════════════════════════════════════════════
console.log('— ④ the words: every new key in zh + ja');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = [];
  const t = (s) => { keys.push(s); return s; };
  for (const o of TB.OWNER_WORDS) { TB.ownerMarkText(o, { human: false }, t); TB.ownerMarkText(o, { human: true }, t); TB.ownerTipText(o, { human: false }, t); TB.ownerTipText(o, { human: true }, t); }
  for (const c of TB.TAB_REFUSALS) { TB.tabRefusalText(c, {}, t); TB.tabRefusalText(c, { yours: true }, t); TB.tabRefusalText(c, { orphan: true }, t); }
  TB.tabRowModel({ tabs: [{ targetId: T(1), title: 'a' }, { targetId: T(2), title: 'b' }], owners: { [T(1)]: 'agent', [T(2)]: 'agent' }, driving: true }, t);
  // lane browser-tabs-by-window: every head word, the blank count, the pane count
  TB.tabGroups({ tabs: [{ targetId: T(1), url: 'https://a.example/', active: true, windowId: 1 }, { targetId: T(2), url: 'about:blank', windowId: 1 }, { targetId: T(3), url: 'https://b.example/', windowId: 2 }, { targetId: T(4), url: 'https://c.example/', windowId: 3 }, { targetId: T(5), url: 'https://d.example/', windowId: 4 }, { targetId: T(6), url: 'https://e.example/', windowId: null }], leases: [{ windowId: 1, holder: { word: 'agent' } }, { windowId: 2, holder: { word: 'you' } }, { windowId: 3, holder: { word: 'other', name: 'N' } }, { windowId: 4, holder: { word: 'other' } }] }, t);
  TB.windowLabelText('holder', { word: 'agent' }, t); TB.tabsCountText({ order: [1], blanks: 1 }, t);
  const lit = (s) => JSON.stringify(s).replace(/\\u([0-9a-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const has = (dict, k) => dict.includes(lit(k) + ':') || dict.includes(`'${k.replace(/'/g, "\\'")}':`);
  const uniq = [...new Set(keys)];
  const miss = uniq.filter((k) => !has(zh, k) || !has(ja, k));
  ok(uniq.length >= 14 && !miss.length, `every key the PURE words ask t() for (${uniq.length}) has a zh and a ja row`, miss);
}

// B-19a9 (主开发 r2182 (1)): an UNRECORDED tab on a paired machine's shared profile is refused not_your_tab in its OWN words — never
// «it belongs to another holder» (its own agent opened it before the scope road, which recorded nothing); the plain words stay as they were
{
  const un = TB.tabRefusalText('not_your_tab', { agent: true, unrecorded: true }), plain = TB.tabRefusalText('not_your_tab', { agent: true });
  ok(/no holder's on record/.test(un) && /before this update/.test(un) && /`vibespace-browser tab new <url>`/.test(un) && !/belongs to another holder/.test(un) && /belongs to another holder/.test(plain) && un !== plain,
    'B-19a9: an unrecorded tab on a paired machine is refused in its own words (no holder on record, opened before this update — `tab new`), never «another holder\'s»; the plain agent words unchanged');
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: '① ' })) ok(r.pass, r.name, r.detail);
console.log(`\n${fail ? '✗' : '✓'} test-browser-tabs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
