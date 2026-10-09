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
import { scratch, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { judgeInChild, LINEAR_BOUND } from './work-meter.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const TB = require('../src/browser-tabs.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : '')); } return !!c; };
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
  const redOf = (needle, repl, tag) => { if (!src.includes(needle)) return null; const C = M.load('src/browser-tabs.js', src.replace(needle, repl), tag); return pureLegs(C, '[' + tag + '] ').filter((l) => !l.c).map((l) => l.n); };
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
  const c7 = redOf("    .filter((x) => x.active || wordOf(x) !== 'orphan' || !BLANK_URL_RE.test(str(x.url).trim()));\n", "    .filter(Boolean);\n", 'blank-orphans');
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
  const Kc = M.load('src/server/browser-keeper.js', src.replace(needle, "    const av = { ok: true, targetId: targetId || s0.active, closesCurrent: false };\n"), 'no-agent-verdict');
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
  const Kn = M.load('src/server/browser-keeper.js', src.replace(reask, '\n'), 'no-reask');
  const Xn = await userActRaceLeg(Kn, 'no-reask');
  ok(Xn.read.code !== 'take_over_first' && !Xn.read.a3Stays && Xn.read.hbActs === 0, 'CONTROL: a keeper that trusts `driving` read before the awaits closes the agent\'s tab AFTER the handback, told to nobody — the (1) leg catches it (the verifier\'s repro)', Xn.read);
  const Ko = M.load('src/server/browser-keeper.js', src.replace(order, "      const r = await rt.exec(ns, argv, { ...opts, timeout: 30000 });\n      const rec = noteUserTabAct(bk, profileId, told);\n"), 'note-after');
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

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: '① ' })) ok(r.pass, r.name, r.detail);
console.log(`\n${fail ? '✗' : '✓'} test-browser-tabs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
