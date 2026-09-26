#!/usr/bin/env node
// THE THREE BROWSER FACES, RENAMED (docs/design-browser-faces.zh.md direction B,
// owner 2026-09-24 "那就选B吧"; takeover design §7 / D10). Labels and icons ONLY —
// no window-type id, openSpec action, settings key, rail id or layout change —
// so this fast suite pins the NAMES where they are spelled and the words that
// carry them:
//
//   ① every face's label at its source (toolbar / web-view kind / command / the
//     phone "+" sheet's three rows and their gates / card-menu commands /
//     Session Properties / Settings category + Services group / customize /
//     the toolbar context menu / the Apps dialog's intro, sub-label gate and
//     tip / the trace + live-view pointers) — and the ids they must NOT touch
//   ② the i18n census: every new key in BOTH dictionaries with the tabled words
//     (faces §5.2 / D10), every retired key GONE from both unless a source
//     still says it (an orphan is a word nobody can reach)
//   ③ the mockup-parity control: docs/mockups/browser-faces/ copied intact —
//     index.json 12/12 drawn, every shot's own negative control undrawn, every
//     PNG present; the same predicate refuses a planted undrawn record
//   ④ the design doc says B SHIPPED (zh + en); ⑤ ci.mjs carries this suite (fast)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');

console.log('① the faces are named for who drives them — labels at their sources, ids untouched');
{
  const html = read('public/index.html');
  ok(/<button id="btn-browser" class="toolbar-action">[\s\S]*?<span data-i18n>Web view<\/span><\/button>/.test(html), "toolbar #btn-browser reads 'Web view' (id unchanged)");
  const bw = read('src/lib/browser-window.js');
  ok(/let startTitle = t\('Web view'\);/.test(bw) && /type: 'browser', label: 'Web view',/.test(bw) && /action: 'openBrowser'/.test(bw), "the web view's untitled window + kind label say 'Web view' (type browser, action openBrowser unchanged)");
  ok(/registerCommand\(\{ id: 'browser\.open', title: 'Open a web view',/.test(read('src/lib/command-mode.js')), "command browser.open is titled 'Open a web view' (plain English like its siblings — wrapped in t() where rendered; id unchanged)");
  const mn = read('src/lib/mobile-nav.js');
  const sheet = /_showCreateSheet\(\) \{([\s\S]*?)\n  \}/.exec(mn)?.[1] || '';
  ok(/row\(UI_ICONS\.globe, t\('Web view'\), \(\) => app\.openBrowser\(\)\)/.test(sheet), "phone '+' sheet: the globe row is 'Web view'");
  ok(/const APPS_ICON = getCommand\('desktopApps\.open'\)\?\.icon \|\| UI_ICONS\.monitor;/.test(sheet) && /if \(app\._desktopAppsAvailable\) items\.push\(row\(APPS_ICON, t\('Desktop app…'\), \(\) => runCommand\('desktopApps\.open', \{ app \}\)\)\);/.test(sheet), "phone '+' sheet: 'Desktop app…' gated on the desktop-apps probe, through the one command");
  ok(/if \(app\._browserProfiles\) items\.push\(row\(UI_ICONS\.browserLive, t\('Agent browser'\), \(\) => this\._openAgentBrowser\(\)\)\);/.test(sheet), "phone '+' sheet: 'Agent browser' gated on the profile digest, on the window-with-a-dot");
  const pick = /_openAgentBrowser\(\) \{([\s\S]*?)\n  \}/.exec(mn)?.[1] || '';
  ok(/app\.sessions\??\.get\??\.?\(app\.wm\.activeWindowId\)/.test(pick) && /s\.browserKey && !s\.host/.test(pick) && /openBrowserLive\(\{ sessionId: /.test(pick) && /_sheet\(/.test(pick) && /openBrowserProfiles\(\)/.test(pick),
    "…the Agent browser row: the active session's live view when there is session context, else a session picker (every live local session holding a browser), else the Agent browser window");
  const sc = read('src/lib/session-card.js');
  ok(/id: 'session\.pinBrowser', title: \(\) => tr\('Agent browser profile…'\)/.test(sc) && /id: 'session\.browserLive', title: \(\) => tr\('Agent browser — live view'\)/.test(sc) && /id: 'session\.browserHandback', title: \(\) => tr\('Hand the agent browser back'\)/.test(sc), 'the three card-menu commands carry the agent-browser names (command ids unchanged)');
  const sp = read('src/lib/session-props.js');
  ok(/const brSec = section\(t\('Agent browser'\)\);/.test(sp) && /brBtn\.textContent = t\('Agent browser profile…'\);/.test(sp), "Session Properties: the section is 'Agent browser'");
  const ss = read('src/lib/settings-schema.js');
  const cats = [...ss.matchAll(/category: t\('([^']+)'\), liveApply: true/g)].map((m) => m[1]);
  ok(!/category: t\('Browser'\)/.test(ss) && ss.split("category: t('Agent browser')").length - 1 === 12, `Settings: the 12 agent-browser rows sit in category 'Agent browser' (none left in 'Browser'; ${cats.filter((c) => c === 'Agent browser').length} counted)`);
  ok(/^  t\('Agent browser'\),$/m.test(ss) && !/^  t\('Browser'\),$/m.test(ss) && /categories: \[t\('Integration'\), t\('Channels'\), t\('Background Work'\), t\('Agent browser'\)\]/.test(ss), 'Settings: SETTINGS_CATEGORIES and the Services group name the renamed category');
  ok(/'toolbar\.showBrowserButton': \{\s*type: 'boolean', default: true, label: t\('Show Web view button'\)/.test(ss) && /'browser\.isolateSessions'/.test(ss), "Settings: the toolbar row reads 'Show Web view button' (keys toolbar.showBrowserButton / browser.* unchanged)");
  ok(/\{ id: 'btn-browser',\s+label: 'Web view button',\s+hideKey: 'toolbar\.showBrowserButton'/.test(read('src/lib/customize-mode.js')), "customize mode names the element 'Web view button'");
  ok(/check\(t\('Web view button'\), s\.get\('toolbar\.showBrowserButton'\)\)/.test(read('src/lib/app.js')), "the toolbar context menu's toggle reads 'Web view button'");
  const dl = read('src/lib/desktop-app-launcher.js');
  ok(/you drive with your mouse and keyboard — agents cannot see it unless you share it\./.test(dl), "Apps dialog intro says who operates it: you, with mouse and keyboard; agents cannot see it unless you share it (desktop lane E, D1)");
  ok(/escHtml\(row\.browser && !isLaunching && !unavailable \? `\$\{t\('Browser app'\)\} · \$\{sub\}` : sub\)/.test(dl), "Apps catalog card: 'Browser app ·' sub-label gated on row.browser (a startable browser row — a dimmed one keeps only its short reason, the B-bfe6 Browsers section's layout)");
  ok(!/Settings → Browser'/.test(dl) && dl.split("t('Off — turn it on in Settings → Agent browser')").length - 1 === 3, "Apps dialog's desktop-consent pointer names Settings → Agent browser (three sites)");
  const tv = read('src/lib/browser-trace-view.js');
  ok(tv.split("t('action trace is off (Settings → Agent browser)')").length - 1 === 2 && /Settings → Agent browser → Action trace/.test(tv) && /\(Agent browser\)'\)/.test(tv), "the trace pointers name Settings → Agent browser / the Agent browser window");
  const lw = read('src/lib/browser-live-window.js');
  ok(/title: t\('Agent browser \(live\)'\), type: 'browser-live'/.test(lw) && /turn it on in Agent browser…'\)/.test(lw) && /t\('Agent browser is not available'\)/.test(lw), "the live view: window title 'Agent browser (live)', its pointers name the Agent browser window");
  const rail = read('src/lib/sidebar-rail.js');
  ok(/browser: 'Agent browser',/.test(rail) && /item\('browser', tr\('Agent browser'\), /.test(rail), "rail: the browser item and its header title say 'Agent browser' (rail id `browser` unchanged)");
  // ids NOT touched (layout replay reads ids)
  ok(/type: 'browser-profiles', label: 'Agent browser', singleton: true/.test(tv) && /action: 'openBrowserProfiles'/.test(tv) && /action: 'openBrowserLive'/.test(lw) && /data-rail|b\.dataset\.rail = id/.test(rail), 'ids unchanged: browser-profiles / openBrowserProfiles / openBrowserLive / rail id');
}

console.log('② the i18n census — every new key in zh AND ja; every retired key gone');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
{
  const WANT = {
    'Web view': ['网页视图', 'ウェブビュー'],
    'Agent browser': ['Agent 浏览器', 'エージェントブラウザ'],
    'Agent browser…': ['Agent 浏览器…', 'エージェントブラウザ…'],
    'Agent browser (live)': ['Agent 浏览器(实时)', 'エージェントブラウザ(ライブ)'],
    'Browser app': ['浏览器应用', 'ブラウザアプリ'],
    'Desktop app…': ['桌面应用…', 'デスクトップアプリ…'],
    'Show Web view button': ['显示网页视图按钮', 'ウェブビューボタンを表示'],
    'Web view button': ['网页视图按钮', 'ウェブビューボタン'],
    'Open this URL in a web view': ['在网页视图里打开这个网址', 'このURLをウェブビューで開く'],
    'Off — turn it on in Settings → Agent browser': null,
    'Agent browser profile…': null,
    'Agent browser — live view': null,
    'Hand the agent browser back': null,
    'Open a web view': null,
    'action trace is off (Settings → Agent browser)': null,
    'The action trace is OFF (Settings → Agent browser → Action trace).': null,
    'Recording is a per-profile opt-in — turn it on in Agent browser…': null,
    'Agent browser is not available': null,
    'not traced — this browser was not started through VibeSpace (Agent browser)': null,
  };
  const missing = [], wrong = [];
  for (const [k, v] of Object.entries(WANT)) {
    if (!zh[k] || !ja[k]) missing.push(k);
    else if (v && (zh[k] !== v[0] || ja[k] !== v[1])) wrong.push(`${k}: ${zh[k]} / ${ja[k]}`);
  }
  ok(!missing.length, `every new key (${Object.keys(WANT).length}) is in BOTH dictionaries`, missing.join(' | '));
  ok(!wrong.length, 'the tabled names carry the tabled words (faces §5.2 / D10)', wrong.join(' | '));
  const intros = Object.keys(zh).filter((k) => k.startsWith('Opens a graphical program from this machine'));
  const intro = intros[0];
  ok(intros.length === 1 && /agents cannot see it unless you share it/.test(intro) && ja[intro] && /共享/.test(zh[intro]) && /agent/.test(zh[intro]) && /エージェント/.test(ja[intro]) && /共有/.test(ja[intro]), "the Apps dialog's intro (who operates it) is translated in both, saying agents cannot see it unless you share it (lane E) — the retired wording is gone");
  // retired: absent from both unless a source still says it
  const RETIRED = ['Browser profiles', 'Browser profiles…', 'Browser (live)', 'Browser profile…', 'Live browser view', 'Hand back the browser', 'Show Browser button', 'Browser button',
    'Open this URL in the embedded browser', 'Off — turn it on in Settings → Browser', 'action trace is off (Settings → Browser)', 'The action trace is OFF (Settings → Browser → Action trace).',
    'Recording is a per-profile opt-in — turn it on in Browser profiles…', 'Browser profiles are not available', 'not traced — this browser was not started through VibeSpace (Browser profiles)', 'Browser'];
  const lib = path.join(repo, 'src/lib');
  const srcAll = fs.readdirSync(lib).filter((f) => f.endsWith('.js') && !/^i18n-(zh|ja)\.js$/.test(f)).map((f) => fs.readFileSync(path.join(lib, f), 'utf8')).join('\n') + read('public/index.html');
  const said = (k) => { const q = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(`\\b(?:t|tr|tc)\\((?:'[^']*', )?'${q}'[,)]|data-i18n(?:-[a-z]+)?(?:="[^"]*")?>${q}<`).test(srcAll); };
  const orphans = RETIRED.filter((k) => (zh[k] || ja[k]) && !said(k));
  const stillSaid = RETIRED.filter((k) => said(k));
  ok(!orphans.length, `no retired key is left orphaned in the dictionaries (${orphans.length})`, orphans.join(' | '));
  console.log(`  (retired keys a source still says, kept: ${stillSaid.join(' | ') || 'none'})`);
  ok(!stillSaid.some((k) => k !== 'Browser'), 'no retired NAME is still said anywhere (only the bare word "Browser" may survive, for its other uses)', stillSaid.join(' | '));
  // NEGATIVE CONTROL: the detector sees a live t() spelling and ignores a comment mention
  ok(new RegExp(`\\bt\\('Web view'[,)]`).test("x = t('Web view');") && !said('Browser profiles') , 'NEGATIVE CONTROL: the census recognises a live t() call; the retired name has none left');
}

console.log('③ the mockup-parity control — docs/mockups/browser-faces copied intact');
{
  const dir = 'docs/mockups/browser-faces';
  let idx = [];
  try { idx = JSON.parse(read(`${dir}/index.json`)); } catch (e) { ok(false, `${dir}/index.json is readable`, e.message); }
  const drawn = (f) => f && f.light >= 30 && f.colours >= 4;
  const judge = (e, shot) => e.verdict === 'ok' && Array.isArray(e.faces) && e.faces.length >= 2 && e.faces.every(drawn) && shot && Array.isArray(shot.expected) && shot.expected.length === e.faces.length && shot.expected.every((x) => e.faces.some((f) => f.face === x)) && shot.control && shot.control.painted === false && fs.existsSync(path.join(repo, dir, e.png));
  const shots = idx.map((e) => { try { return JSON.parse(read(`${dir}/${e.png.replace(/\.png$/, '.json')}`)); } catch { return null; } });
  const green = idx.filter((e, i) => judge(e, shots[i]));
  ok(idx.length === 12 && green.length === 12, `index.json: 12/12 shots drawn with every shot's control undrawn (${green.length}/${idx.length})`);
  ok(['a', 'b', 'c'].every((d) => idx.filter((e) => e.dir === d).length === 4) && ['direction-a.html', 'direction-b.html', 'direction-c.html', 'build.mjs', 'shoot.mjs'].every((f) => fs.existsSync(path.join(repo, dir, f))), 'three directions × (desktop zh/en/ja + phone zh), the three HTML files and both scripts present');
  const planted = idx[0] && { ...idx[0], faces: idx[0].faces.map((f) => ({ ...f, light: 0, colours: 1 })) };
  const plantedShot = shots[0] && { ...shots[0], control: { ...shots[0].control, painted: true } };
  ok(!!planted && judge(idx[0], shots[0]) && !judge(planted, shots[0]) && !judge(idx[0], plantedShot), 'NEGATIVE CONTROL: an undrawn face, or a painted control, fails the same predicate');
}

console.log('④ the design doc records the choice');
for (const f of ['docs/design-browser-faces.zh.md', 'docs/design-browser-faces.md']) {
  ok(/SHIPPED \(B\), 2\.369\.168/.test(read(f)), `${f}: §5.1 carries 'SHIPPED (B), 2.369.168'`);
}

console.log('⑤ the gate');
ok(/\{ name: 'test-browser-faces', tier: 'fast' \}/.test(read('scripts/ci.mjs')), 'ci.mjs carries test-browser-faces in the fast tier');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
