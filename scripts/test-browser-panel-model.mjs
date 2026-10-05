#!/usr/bin/env node
// DESIGN 015 (lane browser-panel-tidy) — THE AGENT BROWSER PANEL'S ROW MODEL, DOM-free (src/lib/browser-panel-model.js):
//   ① the line: per cell {l1, l2} over the mockup's five profile shapes + a paired machine's, a stuck, a legacy, a
//      not-ours and a leave-page-dialogs one — the state's ONE secondary by priority, the usage words, the chips' order;
//   ② the fold: only the facts present, each labelled; an absent act's why is there;
//   ③ the menu: the closed act list in order, check rows for the two switches, Delete… last after a separator, NO item
//      is ever `disabled` (absent instead);
//   ④ THE ACT CENSUS: every act the 2.369.204 profile row offered (Browse yourself, record, record mine, Stop, Restart,
//      Restart to hold dialogs, Change build…, Rename…, Delete…, Replay…, Change…) appears exactly once in the primary ∪
//      the ⋯ menu ∪ the who cell, and the view runs each — CONTROL: a patched copy that drops Replay… goes red;
//   ⑤ the grid: style.css's template = GRID (the minimums the stacked re-flow is judged by); orphanOrder;
//   ⑥ words: every t() literal of the model has zh + ja; the module is PURE (no import, no DOM).
// Run: node scripts/test-browser-panel-model.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : '')); } return !!c; };

const M = await import('../src/lib/browser-panel-model.js');
const TV = await import('../src/lib/browser-trace-view.js');
const BT = require('../src/browser-trace.js');
const BS = require('../src/browser-stuck.js');
const BH = require('../src/browser-human.js');
const RG = require('../src/runaway-guard.js');
const SW = await import('../src/lib/browser-session-words.js');
const DW = await import('../src/lib/browser-display-words.js');
const BM = await import('../src/lib/browser-build-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tOf = (d) => (s, p) => fill(d ? (d[s] || s) : s, p);
const WORDS = (t) => ({ t, state: TV.stateText, why: TV.rowWhyText, ago: TV.agoText, bytes: BT.bytesText, size: SW.sizeText, memory: RG.memoryText, display: DW.displayFactText, human: BH.humanStateLine });
const NOW = 1_780_000_000_000, H = 3600000, GB = 1024 ** 3, MB = 1024 ** 2;
const x = (r, more = {}, t = tOf(null)) => ({ w: WORDS(t), chip: 'Chromium', mine: 'dev-box', stuck: null, autoDialogs: false, autoText: null, buildLine: BM.cardBuildLine({ buildChoice: r.buildChoice, choice: r.browser, running: more.running || null, missing: r.buildMissing, live: !!r.live }, t), limits: { bytesPerProfile: GB, recordingFloor: '0.37.0' }, now: NOW, ...more });

// the mockup's five profiles (q015-mockups/direction-a2) + the four edge shapes
const P = {
  personal: { id: 'bp-00000001', label: 'personal-life', provider: 'chromium', buildChoice: true, state: 'in-use', held: 1, live: true, canBrowse: true, human: { state: 'driving' }, dir: '/home/u/.agent-browser/vs-bp-personal-life', bytes: 1.2 * GB, trace: { n: 88, used: 12.3 * MB, limit: GB, fitBytes: 1.1 * MB, last: NOW - 60000 }, recordings: [], usage: { memBytes: 412 * MB, memMetric: 'pss' }, display: { fallback: { why: 'no-display', rung: 'hidden-window' } }, browser: { kind: 'build', version: '151.0.7922.34' }, use: { mode: 'only', who: [] } },
  market: { id: 'bp-00000002', label: '市场部共享账号（仅限周报与采购平台，勿登录个人微信或支付宝）', provider: 'chromium', buildChoice: true, state: 'kept', ageMs: 12 * H, canBrowse: true, launchHost: 'Mac-one', bytes: 6.81 * GB, trace: { n: 13, used: 3 * MB, limit: GB }, recordings: [{ file: 'a.webm' }, { file: 'b.webm' }], recordingBytes: 40 * MB, legacy: false, use: { mode: 'only', who: [] } },
  sales: { id: 'bp-00000003', label: '営業部・共有プロファイル（請求書ポータル専用）', provider: 'chromium', buildChoice: true, state: 'live', live: true, canBrowse: true, mediated: true, bytes: 490 * MB, trace: { n: 259, used: 30 * MB, limit: GB }, recordings: [1, 2, 3, 4, 5].map((i) => ({ file: i + '.webm' })), recording: { file: 'now.webm' }, record: true, use: { mode: 'all' } },
  office: { id: 'bp-00000004', label: 'office-devices', provider: 'chromium', buildChoice: true, state: 'kept', ageMs: 5 * H, host: 'Mac-one', canBrowse: false, bytes: null, trace: { n: 0 }, recordings: [], use: { mode: 'only', who: [] } },
  research: { id: 'bp-00000005', label: 'research', provider: 'chromium', buildChoice: true, state: 'kept', ageMs: 72 * H, canBrowse: true, bytes: 26.5 * MB, trace: { n: 30, used: MB, limit: GB }, recordings: [], use: { mode: 'only', who: [] } },
  legacy: { id: 'shared', label: 'Shared (legacy)', provider: 'chromium', buildChoice: true, state: 'kept', ageMs: 12 * H, canBrowse: true, legacy: true, bytes: 6.81 * GB, trace: { n: 13, used: MB, limit: GB }, recordings: [] },
  notours: { id: 'bp-00000007', label: 'Imported', provider: 'chromium', buildChoice: true, state: 'not-ours', canBrowse: true, bytes: 2 * MB, trace: { n: 0 }, recordings: [], use: { mode: 'all' } },
  dialogs: { id: 'bp-00000008', label: 'Bank', provider: 'chromium', buildChoice: true, state: 'live', live: true, canBrowse: true, bytes: 80 * MB, trace: { n: 4, used: MB, limit: GB }, recordings: [], use: { mode: 'all' } },
  closed: { id: 'bp-00000009', label: 'Flaky', provider: 'chromium', buildChoice: true, state: 'in-use', held: 2, live: true, canBrowse: true, browserClosed: 'browser_unstable', bytes: 5 * MB, trace: { n: 2, used: MB, limit: GB }, recordings: [], use: { mode: 'all' } },
};
const STUCK = BS.stuckWords({ state: 'unresponsive' }, tOf(null));
const AUTO = 'Accepts leave-page dialogs by itself (typed input is lost) until its next start';

console.log('— ① the line: per cell {l1, l2}');
{
  const L = M.rowLine(P.personal, x(P.personal));
  ok(L.name.l1 === 'personal-life' && L.name.chips[0].key === 'browser' && L.name.chips[0].fixed && L.state.l1 === 'in use' && L.state.l2.text === '1 conversation uses it' && !L.state.l2.tone, 'personal-life: the name, the browser chip first (whole), "in use" + its ONE secondary', L);
  ok(L.usage.l1 === BT.bytesText(1.2 * GB) && L.usage.l2.map((p) => p.text).join(' · ') === '88 action(s)' && L.primary && L.primary.id === 'browse' && L.primary.open && L.primary.label === 'Open your browsing window', 'its size on l1 (never cut), "88 action(s)" on l2 (no recordings word when none), the primary is "Open your browsing window" while he browses it', L.usage);
  const Lm = M.rowLine(P.market, x(P.market));
  ok(Lm.name.chips.map((c) => c.key).join(',') === 'browser,launch-host' && Lm.state.l2.text === 'last used 12 h ago' && Lm.usage.l2.map((p) => p.text).join(' · ') === '13 action(s) · 2 recording(s)' && Lm.primary.label === 'Browse yourself', 'the 40-character name: chips browser · its machine; "last used 12 h ago"; "13 action(s) · 2 recording(s)"; Browse yourself', Lm);
  const Ls = M.rowLine(P.sales, x(P.sales, { stuck: STUCK }));
  ok(Ls.state.l2.key === 'stuck' && Ls.state.l2.tone === 'warn' && Ls.state.l2.text === STUCK.line && Ls.state.title.includes('its browser is running'), 'a stuck page: the stuck sentence WINS the l2 (warn); the title keeps every sentence', Ls.state);
  ok(Ls.usage.l2.some((p) => p.key === 'recording' && p.tone === 'rec') && Ls.name.chips.some((c) => c.key === 'mediated'), '"recording" is a red part of l2; separate tabs is a chip', Ls);
  const Lo = M.rowLine(P.office, x(P.office));
  ok(Lo.usage.l1 === 'not measured' && Lo.usage.l2[0].text === 'no actions' && Lo.primary === null && Lo.name.chips.map((c) => c.key).join(',') === 'browser,host', "a paired machine's profile: no primary (ABSENT, never greyed), its machine chip, an unmeasured size says so", Lo);
  const Ll = M.rowLine(P.legacy, x(P.legacy));
  ok(Ll.who.kind === 'legacy' && Ll.who.l1 === 'Legacy profile — it keeps no list' && Ll.name.chips.some((c) => c.key === 'legacy'), 'the legacy record: its who cell says it keeps no list; a legacy chip', Ll);
  const Ld = M.rowLine(P.dialogs, x(P.dialogs, { autoDialogs: true, autoText: AUTO }));
  ok(Ld.state.l2.key === 'auto-dialogs' && Ld.state.l2.tone === 'warn', 'a browser that accepts leave-page dialogs itself: that sentence is the l2 (warn)', Ld.state);
  const Lc = M.rowLine(P.closed, x(P.closed, { stuck: STUCK, autoDialogs: true, autoText: AUTO }));
  ok(M.stateLines(P.closed, x(P.closed, { stuck: STUCK, autoDialogs: true, autoText: AUTO })).map((s) => s.key).join(',') === 'stuck,closed,auto-dialogs' && Lc.state.l2.key === 'stuck', 'THE PRIORITY: stuck > unavailable > auto-dialogs > the why (the closed browser\'s why is warn and replaces the plain one)', M.stateLines(P.closed, x(P.closed, { stuck: STUCK, autoDialogs: true, autoText: AUTO })));
  const rf = { ...P.research, renamedFrom: { host: 'pod-old' }, launchHost: 'pod-new' };
  ok(M.nameChips(rf, x(rf)).map((c) => c.key).join(',') === 'browser,renamed' && M.nameChips({ ...P.research, legacy: true, mediated: true, host: 'm1' }, x(P.research)).map((c) => c.key).join(',') === 'browser,host,legacy,mediated', 'the chips\' order: browser · machine · legacy · separate tabs · renamed-from (a renamed record never also shows the launch host)');
}

console.log('— ② the fold: only the facts present');
{
  const F = M.rowFold(P.personal, x(P.personal, { running: '151.0.7922.34' }));
  const keys = F.map((f) => f.key);
  ok(keys.join(',') === 'name,dir,state,memory,build,records,recordings,display,human', 'personal-life folds: name · directory · state · memory · Chrome build · records · recordings · display · your browsing', keys);
  ok(F.find((f) => f.key === 'records').v === `88 action(s) · ${BT.bytesText(12.3 * MB)} of ${SW.sizeText(GB)} · page-size frames: ${BT.bytesText(1.1 * MB)} · last ${TV.agoText(60000)}` && F.find((f) => f.key === 'recordings').v === 'no recordings' && F.find((f) => f.key === 'dir').mono, 'records = used of limit + page-size frames + last; recordings say none; the directory is mono', F);
  const Fo = M.rowFold(P.office, x(P.office));
  ok(!Fo.some((f) => ['memory', 'display', 'human', 'dir'].includes(f.key)), 'a fact that is not there is not folded either', Fo.map((f) => f.key));
  const Fn = M.rowFold(P.notours, x(P.notours));
  ok(Fn.find((f) => f.key === 'state').v.includes(TV.rowWhyText(P.notours)), 'a not-ours profile (no record, no Delete…): its fold says why', Fn);
  ok(M.rowFold(P.sales, x(P.sales, { stuck: STUCK })).find((f) => f.key === 'state').tone === 'warn', 'a warn sentence makes the fold\'s state row warn');
}

console.log('— ③ the menu: the closed act list, no disabled item');
{
  const ids = (r, more) => M.rowMenu(r, x(r, more)).map((m) => (m.sep ? '|' : m.id)).join(',');
  ok(ids(P.personal) === 'record,record-mine,replay,build,rename,stop,|,delete', 'a live local profile: record ☐ · record mine ☑ · Replay… · Change build… · Rename… · Stop | Delete…', ids(P.personal));
  ok(ids(P.sales, { stuck: STUCK }) === 'record,record-mine,replay,build,rename,stop,restart,|,delete' && ids(P.dialogs, { autoDialogs: true, autoText: AUTO }) === 'record,record-mine,replay,build,rename,stop,restart-hold,|,delete', 'stuck ⇒ Restart (its words), else leave-page dialogs ⇒ Restart to hold dialogs — never both', [ids(P.sales, { stuck: STUCK }), ids(P.dialogs, { autoDialogs: true })]);
  ok(ids(P.office) === 'build,rename,|,delete' && ids(P.notours) === 'rename', "a paired machine's: no record switches; a not-ours: Rename… only (no record, no build, no Delete…)", [ids(P.office), ids(P.notours)]);
  const all = Object.values(P).flatMap((r) => M.rowMenu(r, x(r, { stuck: STUCK, autoDialogs: true, autoText: AUTO })));
  ok(all.every((m) => !('disabled' in m)) && all.filter((m) => m.check !== undefined).every((m) => ['record', 'record-mine'].includes(m.id)), 'no menu item is ever `disabled`; only the two switches are check rows', all.filter((m) => 'disabled' in m));
  const pm = M.rowMenu(P.personal, x(P.personal));
  ok(pm.find((m) => m.id === 'record').check === false && pm.find((m) => m.id === 'record-mine').check === true && M.rowMenu(P.sales, x(P.sales)).find((m) => m.id === 'record').check === true && pm.at(-1).id === 'delete' && pm.at(-1).warn && pm.at(-2).sep, 'the switches carry their state; Delete… is last, warn, after a separator');
}

console.log('— ④ THE ACT CENSUS');
// the 2.369.204 profile row's acts (src/lib/browser-trace-view.js profileRow + whoCell at 9d448a44) → the model's ids
const TODAY = { 'Browse yourself': 'browse', record: 'record', 'Also record my own actions': 'record-mine', Stop: 'stop', Restart: 'restart', 'Restart to hold dialogs': 'restart-hold', 'Change build…': 'build', 'Rename…': 'rename', 'Delete…': 'delete', 'Replay…': 'replay', 'Change…': 'who' };
const census = (Mod) => {
  const full = { ...P.personal }, fx = x(full, { stuck: STUCK });
  const dl = { ...P.dialogs, trace: { n: 1 } }, dx = x(dl, { autoDialogs: true, autoText: AUTO });
  const per = [Mod.rowActs(full, fx), Mod.rowActs(dl, dx)];
  const union = new Set(per.flat());
  const missing = Object.values(TODAY).filter((id) => !union.has(id));
  const dup = per.filter((a) => new Set(a).size !== a.length);
  return { missing, dup, union: [...union] };
};
{
  ok(Object.values(TODAY).length === 11 && Object.values(TODAY).every((id) => M.ROW_ACTS.includes(id)) && M.ROW_ACTS.length === 11, 'the model names the eleven acts the 2.369.204 row offered (ROW_ACTS)');
  const c = census(M);
  ok(!c.missing.length && !c.dup.length, 'every act appears in the primary ∪ the ⋯ menu ∪ the who cell — exactly once per row (a full live row + a leave-page-dialogs row cover all eleven)', c);
  for (const r of Object.values(P)) { const a = M.rowActs(r, x(r, { stuck: STUCK, autoDialogs: true, autoText: AUTO })); if (new Set(a).size !== a.length) ok(false, `no act twice on ${r.label}`, a); }
  ok(true, 'no act twice on any of the nine shapes');
  // the view runs every menu id (RUN) and draws the other two (the primary button, the who cell's Change…)
  const tv = read('src/lib/browser-trace-view.js');
  const runBlk = tv.slice(tv.indexOf('  const RUN = {'), tv.indexOf('\n  };\n', tv.indexOf('  const RUN = {')));
  const runIds = [...runBlk.matchAll(/^    '?([a-z-]+)'?: (?:async )?\(r\) =>/gm)].map((m) => m[1]);
  ok(M.ROW_ACTS.filter((id) => id !== 'browse' && id !== 'who').every((id) => runIds.includes(id)) && runIds.length === 9, 'the view runs each of the nine menu acts by its id (RUN)', runIds);
  ok(/if \(L\.primary\) \{[\s\S]{0,400}app\.browseYourself\(r\.id/.test(tv) && /btn\(t\('Change…'\), \(\) => \{ if \(rowNow\) openWhoDialog\(app, rowNow\.id/.test(tv), 'the primary opens Browse yourself; the who cell\'s Change… opens the who dialog');
  const menuFn = tv.slice(tv.indexOf('  function openRowMenu('), tv.indexOf('  const patchSwitch'));
  ok(menuFn.length > 100 && !/disabled/.test(menuFn) && /showContextMenu\(/.test(menuFn) && /rowMenu\(r, x\)/.test(menuFn), 'the ⋯ menu is showContextMenu over rowMenu — the view never passes `disabled`');
  // CONTROL: a patched copy that drops Replay… from the menu
  const src = read('src/lib/browser-panel-model.js');
  const needle = "  if (r.trace && r.trace.n) out.push({ id: 'replay'";
  ok(src.includes(needle), 'control setup: the Replay… line is where the control cuts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bpm-'));
  const f = path.join(dir, 'browser-panel-model.mjs');
  fs.writeFileSync(f, src.replace(needle, '  if (false) out.push({ id: \'replay\''));
  const Mc = await import(f);
  const cc = census(Mc);
  ok(cc.missing.join() === 'replay', 'CONTROL: the copy without Replay… is caught by the census (missing: replay)', cc);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('— ⑤ the grid and the order');
{
  const css = read('public/style.css');
  const m = css.match(/\.bprof-table \{ display: grid; grid-template-columns: minmax\((\d+)px, 1\.5fr\) minmax\((\d+)px, 1fr\) minmax\((\d+)px, 1\.3fr\) (\d+)px max-content; column-gap: (\d+)px; \}/);
  ok(m && [m[1], m[2], m[3], m[4]].map(Number).join() === M.GRID.mins.join() && Number(m[5]) === M.GRID.gap, `style.css's .bprof-table template = GRID (${M.GRID.mins.join(' · ')} + max-content acts, gap ${M.GRID.gap})`, m && m[0]);
  ok(/\.bprof-head, \.bprof-table > \.bprof-row\.bprof-profile \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/.test(css), 'the column titles and every row are SUBGRIDS of the one template');
  ok(M.gridNeed(140) === 140 + 100 + 170 + 120 + 140 + 40 && M.gridNeed(-5) === 570, 'gridNeed = the minimums + the widest acts + four gaps');
  // the narrowest desktop window: 860 px (createWindow) → its list is ≥ 820 px; the widest acts measured on the real panel are ≤ 210 px (en "Open your browsing window" + ⋯)
  ok(M.gridNeed(210) <= 820, `the grid fits the 860 px window's list in every language (need ${M.gridNeed(210)} ≤ 820 with the widest acts)`);
  const o = M.orphanOrder([{ name: 'b', bytes: 5 }, { name: 'a', bytes: null }, { name: 'c', bytes: 50 }, { name: 'a2', bytes: 5 }]);
  ok(o.map((r) => r.name).join() === 'c,a2,b,a', 'orphanOrder: the largest first, ties by name, an unmeasured one last', o.map((r) => r.name));
}

console.log('— ⑥ words and purity');
{
  const src = read('src/lib/browser-panel-model.js');
  const lits = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const miss = lits.filter((k) => !(k in zh) || !(k in ja));
  ok(lits.length >= 25 && !miss.length, `every t() literal of the model has zh + ja (${lits.length})`, miss);
  ok(!/^\s*import\s/m.test(src) && !/\brequire\(/.test(src) && !/\b(document|window)\./.test(src), 'PURE: no import, no require, no document / window');
  const tz = tOf(zh);
  const Lz = M.rowLine(P.legacy, x(P.legacy, {}, tz));
  ok(Lz.who.l1 === '旧版配置，没有名单' && M.rowMenu(P.personal, x(P.personal, {}, tz))[0].label === '录制屏幕' && M.rowFold(P.personal, x(P.personal, {}, tz)).map((f) => f.k).includes('目录'), 'zh: the legacy words, 录制屏幕, the fold\'s 目录');
  const tv = read('src/lib/browser-trace-view.js');
  ok(['Profile', 'State', 'Who can use it', 'Disk · records', 'Maintenance', 'How long records are kept', '{n} director(ies) · {size}', '{n} profile(s) · {size} on disk'].every((k) => tv.includes(`t('${k}'`) && k in zh && k in ja), 'the view\'s new words (column titles, Maintenance, the ⓘ, the heads) have zh + ja');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
