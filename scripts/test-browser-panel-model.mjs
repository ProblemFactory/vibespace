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
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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
  ok(L.name.l1 === 'personal-life' && L.name.chips[0].key === 'browser' && gateOf(L.name.chips[0].fixed) && L.state.l1 === 'in use' && L.state.l2.text === '1 conversation uses it' && !L.state.l2.tone, 'personal-life: the name, the browser chip first (whole), "in use" + its ONE secondary', L);
  ok(L.usage.l1 === BT.bytesText(1.2 * GB) && L.usage.l2.map((p) => p.text).join(' · ') === '88 action(s)' && gateOf(L.primary) && L.primary.id === 'browse' && gateOf(L.primary.open) && L.primary.label === 'Open your browsing window', 'its size on l1 (never cut), "88 action(s)" on l2 (no recordings word when none), the primary is "Open your browsing window" while the person browses it', L.usage);
  const Lm = M.rowLine(P.market, x(P.market));
  ok(Lm.name.chips.map((c) => c.key).join(',') === 'browser,launch-host' && Lm.state.l2.text === 'last used 12 h ago' && Lm.usage.l2.map((p) => p.text).join(' · ') === '13 action(s) · 2 recording(s)' && Lm.primary.label === 'Browse yourself', 'the 40-character name: chips browser · its machine; "last used 12 h ago"; "13 action(s) · 2 recording(s)"; Browse yourself', Lm);
  const Ls = M.rowLine(P.sales, x(P.sales, { stuck: STUCK }));
  ok(Ls.state.l2.key === 'stuck' && Ls.state.l2.tone === 'warn' && Ls.state.l2.text === STUCK.line && verdictOf(Ls.state.title.includes('its browser is running')), 'a stuck page: the stuck sentence WINS the l2 (warn); the title keeps every sentence', Ls.state);
  ok(gateOf(Ls.usage.l2.some((p) => p.key === 'recording' && p.tone === 'rec')) && verdictOf(Ls.name.chips.some((c) => c.key === 'mediated')), '"recording" is a red part of l2; separate tabs is a chip', Ls);
  const Lo = M.rowLine(P.office, x(P.office));
  ok(Lo.usage.l1 === 'not measured' && Lo.usage.l2[0].text === 'no actions' && Lo.primary === null && Lo.name.chips.map((c) => c.key).join(',') === 'browser,host', "a paired machine's profile: no primary (ABSENT, never greyed), its machine chip, an unmeasured size says so", Lo);
  const Ll = M.rowLine(P.legacy, x(P.legacy));
  ok(Ll.who.kind === 'legacy' && Ll.who.l1 === 'Legacy profile — it keeps no list' && verdictOf(Ll.name.chips.some((c) => c.key === 'legacy')), 'the legacy record: its who cell says it keeps no list; a legacy chip', Ll);
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
  ok(keys.join(',') === 'name,dir,state,memory,build,disk,records,recordings,display,human', 'personal-life folds: name · directory · state · memory · Chrome build · on disk · records · recordings · display · your browsing', keys); // lane browser-disk-sample: + On disk
  ok(F.find((f) => f.key === 'records').v === `88 action(s) · ${BT.bytesText(12.3 * MB)} of ${SW.sizeText(GB)} · page-size frames: ${BT.bytesText(1.1 * MB)} · last ${TV.agoText(60000)}` && F.find((f) => f.key === 'recordings').v === 'no recordings' && verdictOf(F.find((f) => f.key === 'dir').mono), 'records = used of limit + page-size frames + last; recordings say none; the directory is mono', F);
  const Fo = M.rowFold(P.office, x(P.office));
  ok(!Fo.some((f) => ['memory', 'display', 'human', 'dir'].includes(f.key)), 'a fact that is not there is not folded either', Fo.map((f) => f.key));
  const Fn = M.rowFold(P.notours, x(P.notours));
  ok(verdictOf(Fn.find((f) => f.key === 'state').v.includes(TV.rowWhyText(P.notours))), 'a not-ours profile (no record, no Delete…): its fold says why', Fn);
  ok(M.rowFold(P.sales, x(P.sales, { stuck: STUCK })).find((f) => f.key === 'state').tone === 'warn', 'a warn sentence makes the fold\'s state row warn');
  // lane browser-held-not-hung: the dialog watch blind into one tab (the page answers) — the row's quiet INFO, never warn
  const BLIND = BS.stuckWords({ state: 'blind', why: 'held', since: 1 }, tOf(null));
  const Lb = M.rowLine(P.sales, x(P.sales, { stuck: BLIND }));
  ok(BLIND.tone === 'info' && BLIND.action === null && Lb.state.l2.key === 'stuck' && Lb.state.l2.tone === 'info' && M.rowFold(P.sales, x(P.sales, { stuck: BLIND })).find((f) => f.key === 'state').tone !== 'warn' && !/not responding/.test(Lb.state.l2.text), 'a blind watch: its line is the l2 in the INFO tone (the fold\'s state row stays quiet) — never "not responding"', Lb.state.l2);
}

console.log('— ③ the menu: the closed act list, no disabled item');
{
  const ids = (r, more) => M.rowMenu(r, x(r, more)).map((m) => (m.sep ? '|' : m.id)).join(',');
  ok(ids(P.personal) === 'record,record-mine,replay,build,proxy,exit-check,environment,rename,stop,passkeys,|,delete', 'a live local profile: record ☐ · record mine ☑ · Replay… · Change build… · Proxy… · Check the exit… · Environment… · Rename… · Stop | Delete… (B-8b87: + Proxy…; the exit check: + Check the exit…; B-9584 U3: + Environment…)', ids(P.personal));
  ok(ids(P.sales, { stuck: STUCK }) === 'record,record-mine,replay,build,proxy,exit-check,environment,rename,stop,restart,passkeys,|,delete' && ids(P.dialogs, { autoDialogs: true, autoText: AUTO }) === 'record,record-mine,replay,build,proxy,exit-check,environment,rename,stop,restart-hold,passkeys,|,delete', 'stuck ⇒ Restart (its words), else leave-page dialogs ⇒ Restart to hold dialogs — never both', [ids(P.sales, { stuck: STUCK }), ids(P.dialogs, { autoDialogs: true })]);
  ok(ids(P.sales, { stuck: BS.stuckWords({ state: 'blind', why: 'held' }, tOf(null)) }) === 'record,record-mine,replay,build,proxy,exit-check,environment,rename,stop,passkeys,|,delete', 'lane browser-held-not-hung: a blind watch offers NO Restart (the page answers — a restart is not the cure the row pushes)');
  // the exit check: the KEPT exit on the card's chip with its age (the person's view)
  { const er = { ...P.personal, proxy: 'socks5://proxy.example.test:1080', egress: { publicIp: '203.0.113.9', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1000, source: 'measured' } };
    const ec = M.nameChips(er, x(er, { now: 1000 + 3 * 3600e3 })).find((c) => c.key === 'exit');
    ok(gateOf(ec) && gateOf(/JP · Asia\/Tokyo/.test(ec.text)) && gateOf(/203\.0\.113\.9/.test(ec.title)) && gateOf(/measured/.test(ec.title)) && !M.nameChips(P.personal, x(P.personal)).some((c) => c.key === 'exit'),
      'the exit check: the card\'s chip names the kept exit (country · zone), its title the address, how it was got and its age; a profile that keeps none shows none', ec);
    const ef = M.rowFold(er, x(er, { now: 1000 + 3 * 3600e3 })).find((f) => f.key === 'exit');
    ok(gateOf(ef) && gateOf(/^203\.0\.113\.9 · JP · Asia\/Tokyo — measured, checked .+/.test(ef.v)) && !/—$/.test(ef.v) && !M.rowFold(P.personal, x(P.personal)).some((f) => f.key === 'exit'),
      'the exit check: the row\'s fold names the kept exit WITH its age — findable on a phone, where the chip\'s title (a hover) is not; a profile that keeps none shows none', ef); }
  // B-8b87: a profile whose proxy address still carries its password (saved before the proxy law) — «Move the password to the vault»
  // right before Proxy…, a warn chip; a paired machine's row offers neither (the forwarder is this hub's); a proxied row's chip names it
  { const leg = { ...P.personal, proxy: 'http://***@proxy.example.test:3128', proxyPasswordInProfile: true };
    const pc = M.nameChips(leg, x(leg)).find((c) => c.key === 'proxy'), ok2 = M.nameChips({ ...P.personal, proxy: 'socks5://proxy.example.test:1080', proxyCredential: 'proxy-login:socks5://proxy.example.test:1080#u' }, x(P.personal)).find((c) => c.key === 'proxy');
    ok(ids(leg) === 'record,record-mine,replay,build,proxy-move,proxy,exit-check,environment,rename,stop,passkeys,|,delete' && !/proxy/.test(ids({ ...P.personal, host: 'm1', proxy: 'http://p.example.test:1' })) && gateOf(pc) && gateOf(/warn/.test(pc.cls || '')) && gateOf(ok2) && verdictOf(/with its login from the vault/.test(ok2.title)),
      'B-8b87: an address that holds its password ⇒ «Move the password to the vault» before Proxy… and a warn chip; a paired machine\'s row offers neither; a proxied row\'s chip names its proxy and its vault login', [ids(leg), pc, ok2 && ok2.title]); }
  ok(ids(P.office) === 'build,environment,rename,passkeys,|,delete' && ids(P.notours) === 'rename', "a paired machine's: no record switches; a not-ours: Rename… only (no record, no build, no Delete…)", [ids(P.office), ids(P.notours)]);
  const all = Object.values(P).flatMap((r) => M.rowMenu(r, x(r, { stuck: STUCK, autoDialogs: true, autoText: AUTO })));
  ok(gateOf(all.every((m) => !('disabled' in m))) && verdictOf(all.filter((m) => m.check !== undefined).every((m) => ['record', 'record-mine'].includes(m.id))), 'no menu item is ever `disabled`; only the two switches are check rows', all.filter((m) => 'disabled' in m));
  const pm = M.rowMenu(P.personal, x(P.personal));
  ok(pm.find((m) => m.id === 'record').check === false && pm.find((m) => m.id === 'record-mine').check === true && M.rowMenu(P.sales, x(P.sales)).find((m) => m.id === 'record').check === true && pm.at(-1).id === 'delete' && gateOf(pm.at(-1).warn) && verdictOf(pm.at(-2).sep), 'the switches carry their state; Delete… is last, warn, after a separator');
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
  ok(Object.values(TODAY).length === 11 && gateOf(Object.values(TODAY).every((id) => M.ROW_ACTS.includes(id))) && M.ROW_ACTS.length === 16 && gateOf(M.ROW_ACTS.includes('passkeys')) && gateOf(M.ROW_ACTS.includes('proxy')) && gateOf(M.ROW_ACTS.includes('proxy-move')) && gateOf(M.ROW_ACTS.includes('exit-check')) && verdictOf(M.ROW_ACTS.includes('environment')), 'the model names the eleven acts the 2.369.204 row offered + lane passkey-ui\'s Passkeys + B-8b87\'s Proxy… and «Move the password to the vault» (n)… (ROW_ACTS)');
  const c = census(M);
  ok(!c.missing.length && !c.dup.length, 'every act appears in the primary ∪ the ⋯ menu ∪ the who cell — exactly once per row (a full live row + a leave-page-dialogs row cover all eleven)', c);
  for (const r of Object.values(P)) { const a = M.rowActs(r, x(r, { stuck: STUCK, autoDialogs: true, autoText: AUTO })); if (new Set(a).size !== a.length) ok(false, `no act twice on ${r.label}`, a); }
  ok(true, 'no act twice on any of the nine shapes');
  // the view runs every menu id (RUN) and draws the other two (the primary button, the who cell's Change…)
  const tv = read('src/lib/browser-trace-view.js');
  const runBlk = tv.slice(tv.indexOf('  const RUN = {'), tv.indexOf('\n  };\n', tv.indexOf('  const RUN = {')));
  const runIds = [...runBlk.matchAll(/^    '?([a-z-]+)'?: (?:async )?\(r\) =>/gm)].map((m) => m[1]);
  ok(gateOf(M.ROW_ACTS.filter((id) => id !== 'browse' && id !== 'who').every((id) => runIds.includes(id))) && runIds.length === 14, 'the view runs each of the fourteen menu acts by its id (RUN; lane passkey-ui: + passkeys; B-8b87: + proxy, proxy-move; the exit check: + exit-check; B-9584 U3: + environment)', runIds);
  ok(gateOf(/if \(L\.primary\) \{[\s\S]{0,400}app\.browseYourself\(r\.id/.test(tv)) && verdictOf(/btn\(t\('Change…'\), \(\) => \{ if \(rowNow\) openWhoDialog\(app, rowNow\.id/.test(tv)), 'the primary opens Browse yourself; the who cell\'s Change… opens the who dialog');
  // lane browser-unresponsive: a hung row's primary is Restart — the view runs RUN.restart (THE user's restart route)
  ok(verdictOf(/if \(L\.primary\.id === 'restart'\) \{[^\n]*bb\.onclick = \(\) => RUN\.restart\(r\);/.test(tv)), 'a hung row\'s primary (Restart) runs RUN.restart');
  const menuFn = tv.slice(tv.indexOf('  function openRowMenu('), tv.indexOf('  const patchSwitch'));
  ok(menuFn.length > 100 && !/disabled/.test(menuFn) && gateOf(/showContextMenu\(/.test(menuFn)) && verdictOf(/rowMenu\(r, x\)/.test(menuFn)), 'the ⋯ menu is showContextMenu over rowMenu — the view never passes `disabled`');
  // CONTROL: a patched copy that drops Replay… from the menu
  const src = read('src/lib/browser-panel-model.js');
  const needle = "  if (r.trace && r.trace.n) out.push({ id: 'replay'";
  ok(verdictOf(src.includes(needle)), 'control setup: the Replay… line is where the control cuts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bpm-'));
  const f = path.join(dir, 'browser-panel-model.mjs');
  fs.writeFileSync(f, editAnchor(src, needle, '  if (false) out.push({ id: \'replay\'', "src/lib/browser-panel-model.js"));
  const Mc = await import(f);
  const cc = census(Mc);
  ok(cc.missing.join() === 'replay', 'CONTROL: the copy without Replay… is caught by the census (missing: replay)', cc);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('— ⑤ the grid and the order');
{
  const css = read('public/style.css');
  const m = css.match(/\.bprof-table \{ display: grid; grid-template-columns: minmax\((\d+)px, 1\.5fr\) minmax\((\d+)px, 1fr\) minmax\((\d+)px, 1\.3fr\) (\d+)px max-content; column-gap: (\d+)px; \}/);
  ok(gateOf(m) && [m[1], m[2], m[3], m[4]].map(Number).join() === M.GRID.mins.join() && Number(m[5]) === M.GRID.gap, `style.css's .bprof-table template = GRID (${M.GRID.mins.join(' · ')} + max-content acts, gap ${M.GRID.gap})`, m && m[0]);
  ok(verdictOf(/\.bprof-head, \.bprof-table > \.bprof-row\.bprof-profile \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/.test(css)), 'the column titles and every row are SUBGRIDS of the one template');
  ok(M.gridNeed(140) === 140 + 100 + 170 + 120 + 140 + 40 && M.gridNeed(-5) === 570, 'gridNeed = the minimums + the widest acts + four gaps');
  // the narrowest desktop window: 860 px (createWindow) → its list is ≥ 820 px; the widest acts measured on the real panel are ≤ 210 px (en "Open your browsing window" + ⋯)
  ok(M.gridNeed(210) <= 820, `the grid fits the 860 px window's list in every language (need ${M.gridNeed(210)} ≤ 820 with the widest acts)`);
  const o = M.orphanOrder([{ name: 'b', bytes: 5 }, { name: 'a', bytes: null }, { name: 'c', bytes: 50 }, { name: 'a2', bytes: 5 }]);
  ok(o.map((r) => r.name).join() === 'c,a2,b,a', 'orphanOrder: the largest first, ties by name, an unmeasured one last', o.map((r) => r.name));
}

console.log('— ⑦ lane passkey-ui: THE PASSKEYS TABLE (design-passkey-store §2.5)');
{
  const pub = (o) => ({ id: 'abcd1234', rpId: 'github.com', userName: 'alice', displayName: 'Alice A', source: 'agent', createdAt: Date.UTC(2026, 9, 1), lastUsedAt: 0, uses: 0, signCount: 0, policy: 'ask', ...o });
  const xw = { w: { t: (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? p[k] : m)), ago: () => '5m ago', date: () => '2026-10-01' } };
  const tb = M.passkeyTable({ keys: [pub({}), pub({ id: 'ef567890', rpId: 'vercel.com', userName: '', displayName: 'Bob', source: 'you', lastUsedAt: 5, uses: 3, policy: 'yes' })], agentsOff: false }, xw);
  ok(tb.rows.length === 2 && tb.rows[0].site === 'github.com' && tb.rows[0].user === 'alice' && tb.rows[0].userTitle === 'Alice A' && tb.rows[0].sourceText === 'agent · 2026-10-01' && tb.rows[0].lastUsed === 'never' && tb.rows[1].user === 'Bob' && tb.rows[1].source === 'you' && tb.rows[1].lastUsed === '5m ago' && tb.rows[1].uses === 3, 'rows from publicRows: site · user (display name in its title) · source + date · last used', tb.rows);
  ok(tb.rows[0].segments.map((s) => `${s.value}:${s.label}:${s.on ? 1 : 0}`).join() === 'yes:Allow:0,ask:Ask each time:1,no:Never:0' && tb.rows[1].segments.find((s) => s.on).value === 'yes' && M.policySegments('bogus').find((s) => s.on).value === 'ask', 'the policy control: three segments in order, exactly one on (an unknown policy reads ask)');
  ok(tb.switchOn === false && M.passkeyTable({ keys: [], agentsOff: true }, xw).switchOn === true && tb.switchLabel === 'Agents never sign in with passkeys' && verdictOf(/deleting the profile deletes them/.test(tb.note)), 'the head row: the agents-never switch + its one sentence');
  { const dn = M.passkeyTable({ keys: [], agentsOff: false, displaced: 1 }, xw).note; ok(gateOf(dn.startsWith('A page replaced the credentials API (taken back) · ')) && gateOf(/deleting the profile deletes them/.test(dn)) && !/replaced/.test(tb.note), 'lane passkey-prewrap-fix: a page that replaced the credentials API (the last hour) is said first on the Passkeys card\'s line; none ⇒ not said', dn); }
  const em = M.passkeyTable({ keys: [], agentsOff: false }, xw);
  ok(!tb.empty && gateOf(em.empty) && gateOf(/card appears in For you/.test(em.empty.line)) && !('hint' in em.empty) && !em.rows.length, 'the empty state: one line + the agents\' CLI hint');
  const leak = M.passkeyTable({ keys: [pub({ keySealed: 'AAAA' }), pub({ id: 'zz', credentialId: 'zzzzzzzzzzzz' }), pub({ id: 'bad id!' })] }, xw);
  ok(leak.rows.length === 0 && leak.refused === 3, 'a row that carries a key field (or the whole credential id, or a bad id) is REFUSED — never drawn', leak);
  const keyCensus = (Mx) => { const t2 = Mx.passkeyTable({ keys: [pub({ keySealed: 'SECRET' })] }, xw); return JSON.stringify(t2).includes('SECRET'); };
  ok(!keyCensus(M), 'the key census: no table output carries a key field\'s value');
  const dw = M.passkeyDeleteWords(tb.rows[0], xw);
  ok(dw.title === 'Delete the passkey for github.com?' && verdictOf(/alice on github\.com/.test(dw.message)), 'Delete… names the site and the user', dw);
  ok(M.rowMenu(P.personal, x(P.personal, { passkeys: 2 }))[M.rowMenu(P.personal, x(P.personal, {})).findIndex((m) => m.id === 'passkeys')].label === 'Passkeys (2)…' && M.rowMenu(P.personal, x(P.personal, {})).find((m) => m.id === 'passkeys').label === 'Passkeys (0)…' && !M.rowMenu(P.notours, x(P.notours, {})).some((m) => m.id === 'passkeys'), 'the ⋯ menu: Passkeys (n)… with n = 0 too; a not-ours profile has none');
  // RED CONTROL: a row model that SPREADS the publicRow (and drops the refusal) carries the key into the table
  const src = read('src/lib/browser-panel-model.js');
  const n1 = "  if (!k || typeof k !== 'object' || PASSKEY_KEY_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(k, f))) return null;";
  const n2 = '  return {\n    id, site:';
  ok(gateOf(src.includes(n1)) && verdictOf(src.includes(n2)), 'control setup: the refusal + the named-field row are where the control cuts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bpm-pk-'));
  const f = path.join(dir, 'browser-panel-model.mjs');
  fs.writeFileSync(f, editAnchor(editAnchor(src, n1, "  if (!k || typeof k !== 'object') return null;", "src/lib/browser-panel-model.js"), n2, '  return {\n    ...k, id, site:', "src/lib/browser-panel-model.js"));
  const Mc = await import(f);
  ok(gateOf(keyCensus(Mc)) && Mc.passkeyTable({ keys: [pub({ keySealed: 'SECRET' })] }, xw).refused === 0, 'CONTROL: a copy whose row spreads the publicRow (no refusal) is caught by the key census (RED)');
  fs.rmSync(dir, { recursive: true, force: true });
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
  ok(Lz.who.l1 === '旧版配置，没有名单' && M.rowMenu(P.personal, x(P.personal, {}, tz))[0].label === '录制屏幕' && verdictOf(M.rowFold(P.personal, x(P.personal, {}, tz)).map((f) => f.k).includes('目录')), 'zh: the legacy words, 录制屏幕, the fold\'s 目录');
  const tv = read('src/lib/browser-trace-view.js');
  ok(verdictOf(['Profile', 'State', 'Who can use it', 'Disk · records', 'Maintenance', 'How long records are kept', '{n} director(ies) · {size}', '{n} profile(s) · {size} on disk'].every((k) => tv.includes(`t('${k}'`) && k in zh && k in ja)), 'the view\'s new words (column titles, Maintenance, the ⓘ, the heads) have zh + ja');
}

console.log('— ⑦ B-53df: the three RESTART doors say a refusal by its CODE (every code, in the device\'s words)');
{
  const en = tOf(null), tz = tOf(zh), tj = tOf(ja);
  const W = (r, t, label = 'Bank') => BM.restartRefusalWords(r, { label, human: BH.humanRefusalText }, t);
  const by = W({ code: 'browsing_yourself', error: 'raw' }, en);
  ok(by === BH.humanRefusalText('browsing_yourself', { label: 'Bank', act: 'restart' }) && gateOf(/then restart it/.test(by)) && W({ code: 'browsing_yourself' }, tz) !== by && verdictOf(W({ code: 'browsing_yourself' }, tz).includes('Bank')), 'browsing_yourself: the person\'s restart words (en; zh in its own words, the label kept)', by);
  const land = 'The browser kernel is being replaced — try again in a moment.';
  ok(W({ code: 'engine_kernel_landing', error: 'raw' }, en) === land && W({ code: 'engine_kernel_landing' }, tz) === zh[land] && W({ code: 'engine_kernel_landing' }, tj) === ja[land], 'engine_kernel_landing: en / zh / ja (the row\'s named code)');
  const un = "That engine's plugin did not answer — restart the plugin, then try again.";
  ok(W({ code: 'browser_engine_unanswered' }, tj) === ja[un] && W({ code: 'browser_build_missing' }, en) === BM.buildRefusalWords({ code: 'browser_build_missing' }, en), 'an engine / build refusal of the start inside the restart: the build words (ja; en)');
  ok(gateOf(/pid 4242/.test(W({ code: 'profile_locked', holderPid: 4242 }, en))) && W({ code: 'browser_unstable' }, tz) === zh['Its browser keeps closing — press Stop on its row first, then try again.'], 'profile_locked names the holder pid; browser_unstable in zh');
  ok(W({ code: 'launch_failed', error: 'chrome exited' }, en) === '' && W({ code: 'backend_no_key', error: 'x' }, en) === '' && W({ error: 'boom' }, en) === '' && W(null, en) === '', 'a launch failure (what failed and why — the server\'s facts), no code ⇒ no words — the door says the server\'s sentence');
  const sh = "This profile's browser is shared with other conversations — restarting it would close their tabs too. Stop it from the Agent browser panel if that is what you want.";
  ok(W({ code: 'shared', error: 'x' }, en) === sh && W({ code: 'shared' }, tz) === zh[sh] && W({ code: 'browser_released' }, tj) === ja['That browser has not started yet — there is nothing to restart.'] && W({ code: 'not-found' }, tz) === zh['That browser is not there any more — there is nothing to restart.'],
    'the restart routes\' own codes in the device\'s words: `shared` (the live view\'s most common), `browser_released`, `not-found` (never «This profile no longer exists») — en / zh / ja');
  ok(W({ code: 'cap', n: 6 }, en) === '' && W({ code: 'remote_profile', machine: 'm' }, en) === '', 'cap / remote_profile ⇒ the server\'s sentence (their person words name Browse yourself)');
  // THE CODE CENSUS: every code humanRefusalText words is placed — a restart word (RESTART_HUMAN_CODES), the build words, or kept out by name
  const hsrc = read('src/browser-human.js');
  const body = hsrc.slice(hsrc.indexOf('function humanRefusalText('), hsrc.indexOf('function humanShareLine('));
  const codes = [...new Set([...body.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]))];
  const OUT = new Set(['not-found', 'not_attachable', 'cap', 'remote_profile', 'not_browsing', 'not_web', 'not_your_tab', 'tabs_unreadable']); // Browse yourself's own (its window, its tabs, «pair it again to browse it») — no restart meets them with these words (not-found has the restart's own)
  const unplaced = codes.filter((c) => !BM.RESTART_HUMAN_CODES.includes(c) && !OUT.has(c) && BM.buildRefusalWords({ code: c }, en) === null);
  ok(codes.length >= 14 && !unplaced.length, `every humanRefusalText code is placed for the restart doors (${codes.length})`, unplaced);
  // THE DOORS: each routes its refusal through the picker before the server's sentence
  const doorsRaw = (src) => {
    const raw = [];
    const tv = src['src/lib/browser-trace-view.js'];
    const acts = [...tv.matchAll(/act\(`\/api\/browser\/profiles\/\$\{encodeURIComponent\(r\.id\)\}\/restart`[^\n]*/g)].map((m) => m[0]);
    if (acts.length !== 2 || acts.some((l) => !/t\('Could not restart the browser'\), restartWordsOf\(r\)\)/.test(l))) raw.push('browser-trace-view restart / restart-hold');
    if (!/reason: \(r && r\.error && typeof wordsOf === 'function' && wordsOf\(r\)\) \|\| \(r && r\.error\)/.test(tv) || !/restartRefusalWords\(r, \{ label: [^\n]*human: humanRefusalText \}, t\)/.test(tv)) raw.push('browser-trace-view act');
    const lv = src['src/lib/browser-live-window.js'];
    if (!/t\('Could not restart the browser: \{why\}', \{ why: restartRefusalWords\(r, \{ label: [^\n]*human: humanRefusalText \}, t\) \|\| String\(r\.error\) \}\)/.test(lv)) raw.push('browser-live-window restartBrowser');
    const ut = src['src/lib/user-todos-actions.js'];
    const blk = ut.slice(ut.indexOf("rec.action.type === 'browser-restart'"), ut.indexOf("rec.action.type === 'browser-restart'") + 1200);
    if (!/showToast\(\(r && r\.error && restartRefusalWords\(r, \{ label: String\(\(\(\(app\._browserProfiles && app\._browserProfiles\.profiles\) \|\| \[\]\)\.find\(\(x\) => x && x\.id === rec\.action\.profileId\)[^\n]*human: humanRefusalText \}, t\)\) \|\| \(r && r\.error\)/.test(blk)) raw.push('user-todos-actions browser-restart'); // the review: the item's profile NAMED (never «this profile»)
    return raw;
  };
  const FILES = ['src/lib/browser-trace-view.js', 'src/lib/browser-live-window.js', 'src/lib/user-todos-actions.js'];
  const now = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  ok(!doorsRaw(now).length, 'the three doors (the panel\'s Restart + Restart to hold, the live view\'s Restart, the For-you item) word a refusal by its code', doorsRaw(now));
  // CONTROL: the doors as they were (r.error raw) — the census goes red on each
  const old = {
    'src/lib/browser-trace-view.js': now['src/lib/browser-trace-view.js'].split(", restartWordsOf(r));").join(');').replace("(r && r.error && typeof wordsOf === 'function' && wordsOf(r)) || ", ''),
    'src/lib/browser-live-window.js': now['src/lib/browser-live-window.js'].replace(/why: restartRefusalWords\(r, \{[^\n]*?\}, t\) \|\| String\(r\.error\)/, 'why: String(r.error)'),   // stale-pins: kept — the base's line, written back by this RED control
    'src/lib/user-todos-actions.js': now['src/lib/user-todos-actions.js'].replace(/\(r && r\.error && restartRefusalWords\(r, \{[^\n]*?\}, t\)\) \|\| /, ''),
  };
  ok(gateOf(FILES.every((f) => old[f] !== now[f])) && doorsRaw(old).length === 4, 'CONTROL: the doors printing r.error raw (the base\'s lines) are caught — all four (RED)', doorsRaw(old));
  // B-a470 (the review's MUST-FIX on B-53df × B-a470): an engine plugin's OWN error rides the refusal — the restart door QUOTES it, never «another version of the engine protocol»
  const FA = { status: 500, code: 'ERR_ACCESS_DENIED', message: 'Access to this API has been restricted.', permission: 'FileSystemRead', resource: '/usr/bin/python3', label: 'Kernel' };
  const qa = W({ code: 'browser_engine_protocol', error: 'raw', failed: FA }, en), qz = W({ code: 'browser_engine_protocol', failed: { ...FA, resource: null } }, tz);
  ok(gateOf(qa.includes('/usr/bin/python3')) && gateOf(qa.includes('ERR_ACCESS_DENIED')) && !/another version/.test(qa) && gateOf(qz.includes('ERR_ACCESS_DENIED')) && gateOf(qz.includes('文件夹之外')) && verdictOf(/another version/.test(W({ code: 'browser_engine_protocol' }, en))),
    'B-53df × B-a470: a restart refused by an engine plugin\'s own error QUOTES it (en with the path; zh) — the protocol words only without the fact', { qa, qz });
  // CONTROL (the picker): a copy without the person's words falls to the generic build sentence — caught
  const msrc = read('src/lib/browser-build-model.js');
  const cut = "  const own = typeof human === 'function' && RESTART_HUMAN_CODES.includes(code) ? human(code, facts, t) : '';";
  ok(verdictOf(msrc.includes(cut)), 'control setup: the picker\'s person-words line is where the control cuts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bpm-rs-'));
  const f = path.join(dir, 'browser-build-model.mjs');
  fs.writeFileSync(f, editAnchor(msrc, cut, "  const own = '';", "src/lib/browser-build-model.js"));
  const Mc = await import(f);
  ok(Mc.restartRefusalWords({ code: 'browsing_yourself' }, { label: 'Bank', human: BH.humanRefusalText }, en) !== by, 'CONTROL: a picker without the person\'s words says another sentence for browsing_yourself (RED)');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
