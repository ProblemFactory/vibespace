#!/usr/bin/env node
// DESIGN 009 LANE 3 — THE APPS INTERFACE (lane apps-interface, 2026-10-03; docs/kb-file-structure.md "test-apps-interface";
// the owner: 「APP 界面需要优化一下了」 + "the user never sees deb / AppImage / apt / root words"). Fast, no browser, no display:
//   §1 the window bar — the backend + memory chips are one "About this window" line under ⋯ (never shown on the strip), the
//      scale chip only when somebody chose the scale, in words; a mutant copy that shows the memory chip again goes red
//   §2 starting — ONE counting line ("Starting… 8 s") until the first window maps (PURE + the wiring)
//   §3 the launch dialog — apps first (head · Running · Apps · Browsers · Your installed apps · Advanced · footer), the
//      setup lines in the footer, the real-desktop sentence said once; a copy with the intro back on top goes red
//   §4 cards — the localized name (labels[lang] › a translated built-in › the label), a built-in row's short reason, the
//      two-line name (a nowrap copy of the rule goes red), the default scale behind ⋯ / right-click
//   §5 dead ends hand off to an agent with the words carried; a refusal is ONE sentence
//   §6 one name — Apps (dialog, catalog heading, a TOP-LEVEL ⚙ row, the phone sheet, the toolbar)
//   §7 zh/ja: no space between {machine} and a CJK neighbour in any template the apps surfaces say (a planted one is caught)
//   §8 Layer 1's slots — the status line + the base-change line + the interrupted banner (PURE tables)
//   §9 THE WORD CENSUS — no deb / apt / AppImage / root / sha256 / sudo in any string this lane wrote, en/zh/ja (planted controls)
//   §10 every new key has zh + ja and is a t() literal   §11 an app with no cwd starts in HOME (a real /bin/pwd spawn)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.log('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

const Wm = await import('../src/lib/desktop-app-window.js');
const XV = await import('../src/lib/xpra-view.js');
const Lm = await import('../src/lib/desktop-app-launcher.js');
const Am = await import('../src/lib/app-install-dialog.js');
const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
const win = read('src/lib/desktop-app-window.js'), xv = read('src/lib/xpra-view.js'), lau = read('src/lib/desktop-app-launcher.js'), aid = read('src/lib/app-install-dialog.js'), css = read('public/style.css');

console.log('§1 the window bar: status · Stop · ⋯ · Paste');
{
  const X = { stream: 'xpra', state: 'ready', backend: 'xpra', scale: 2, scaleOrigin: 'auto', live: { memBytes: 131 * 1048576, memMetric: 'pss', cpuPct: 3 } };
  ok(Wm.aboutWindowText(X) === 'About this window: 131 MB memory · shown with xpra', 'the ⋯ line says the memory and how the window reaches you, in words', Wm.aboutWindowText(X));
  ok(Wm.aboutWindowText({ backend: 'vnc-display', fallbackWhy: 'xpra not on PATH' }) === 'About this window: shown with vnc-display — xpra not on PATH' && Wm.aboutWindowText({}) === '' && Wm.aboutWindowText(null) === '', 'a fallback names why; nothing known ⇒ no line');
  ok(Wm.memSize(1.44 * 1024 * 1048576) === '1.4 GB' && Wm.memSize(1) === '1 MB' && Wm.memSize(512 * 1048576) === '512 MB' && !/PSS|RSS|CPU/.test(Wm.aboutWindowText(X)), 'plain units, never the metric\'s name (PSS stays in the tooltip)');
  ok(Wm.scaleChipText(X) === '' && Wm.scaleChipText({ ...X, scaleOrigin: undefined }) === '' && Wm.scaleChipText({ ...X, scale: 1.5, scaleOrigin: 'chosen' }) === 'Larger 1.5×' && Wm.scaleChipText({ ...X, scale: 1, scaleOrigin: 'app' }) === 'Actual size' && Wm.scaleChipText({ ...X, backend: 'vnc-display', stream: 'rfb', scaleOrigin: 'chosen' }) === '', 'the scale chip only when somebody chose the scale, in words');
  ok(!/已选|選択済み/.test(zh['Larger {scale}×'] + zh['Actual size'] + ja['Larger {scale}×'] + ja['Actual size']) && zh['Larger {scale}×'] === '放大 {scale}×', 'zh says 放大 1.5× — never 已选');
  const pinBar = (s) => [
    /backendChip\.className = 'desktop-app-chip desktop-app-chip-backend'; backendChip\.style\.display = 'none';/.test(s) || 'backend chip shown',
    /liveChip\.textContent = liveChipText\(rec\); liveChip\.style\.display = 'none';/.test(s) || 'memory chip shown',
    /const about = aboutWindowText\(rec\);[^\n]*\n\s*if \(about\) items\.push\(\{ label: about,[^\n]*disabled: true \}\);/.test(s) || 'no about line in ⋯',
    /moreAlways: \(\) => !!rec && \(rec\.stream === 'xpra' \|\| shareable\(\) \|\| !!aboutWindowText\(rec\)\)/.test(s) || '⋯ not always there',
  ].filter((v) => v !== true);
  ok(same(pinBar(win), []), 'WIRING: both chips stay in the DOM never shown (display none = absent for the fold), the about line opens the ⋯, the ⋯ is there whenever it has a line', pinBar(win));
  const mut = win.replace("liveChip.textContent = liveChipText(rec); liveChip.style.display = 'none';", "const lt = liveChipText(rec); liveChip.textContent = lt; liveChip.style.display = lt ? '' : 'none';");
  ok(mut !== win && pinBar(mut).length === 1, 'CONTROL: the pre-lane memory chip (shown when sampled) is caught', pinBar(mut));
}

console.log('§2 starting — one line that counts');
{
  ok(XV.startingText(0) === 'Starting…' && XV.startingText(999) === 'Starting…' && XV.startingText(8400) === 'Starting… 8 s' && XV.startingText(-3) === 'Starting…' && XV.startingText('x') === 'Starting…', 'PURE: "Starting…", then whole seconds');
  ok(zh['Starting… {n} s'] === '正在启动… {n} 秒' && ja['Starting… {n} s'] && zh['Starting…'] && ja['Starting…'], 'zh 正在启动… 8 秒 (+ ja)');
  const sites = (xv.match(/waitWords\((L\.starting|t\('Connecting…'\)|t\('Waiting for the application window…'\))\)/g) || []).length;
  ok(sites === 4 && /if \(wins\.size === 1\) \{ everMapped = true; stopWait\(\);/.test(xv) && /setStatus: statusFromOutside, starting: \(\) => waitWords\(L\.starting\)/.test(xv) && /const dispose = \(\) => \{ stopWait\(\);/.test(xv), 'WIRING: every wait word before the first window is the counting line (connect ×2 incl. starting(), connecting, the hello); the first window, any outside status and dispose stop it', sites);
  ok((win.match(/if \(view\.starting\) view\.starting\(\); else view\.setStatus\(t\('Starting application…'\)\)/g) || []).length === 2, 'WIRING: the window\'s own "launching" sites count on an xpra view (the RFB view keeps its words)');
}

console.log('§3 the launch dialog: apps first, setup in the footer');
const dialogOrder = (src) => {
  const i = src.indexOf('body.innerHTML = `', src.indexOf('export async function showLaunchDialog'));
  const tpl = src.slice(i, src.indexOf('`;', i));
  const seq = ['desktop-launch-head', 'desktop-launch-install-app', 'desktop-launch-running-sec', 'desktop-launch-catalog-sec', 'desktop-launch-browsers-sec', 'desktop-launch-apps-sec', 'desktop-launch-adv"', 'desktop-launch-foot', 'desktop-launch-intro', 'desktop-launch-share-row', 'desktop-launch-avail"', 'desktop-launch-desk-sec'];
  const at = seq.map((c) => tpl.indexOf(c));
  const bad = seq.filter((c, k) => at[k] < 0 || (k && at[k] < at[k - 1]) || tpl.indexOf(c, at[k] + 1) >= 0);
  return bad;
};
{
  ok(same(dialogOrder(lau), []), 'the body reads: head (machines + Install an app…) · Running · Apps · Browsers · Your installed apps · Advanced · footer (intro, sharing, the backend line, the real desktop) — each once', dialogOrder(lau));
  const mut = lau.replace('<div class="desktop-launch-banner is-empty"></div>', '<p class="desktop-launch-intro">x</p><div class="desktop-launch-banner is-empty"></div>');
  ok(mut !== lau && dialogOrder(mut).length > 0, 'CONTROL: the intro back on top (the pre-lane order) is caught', dialogOrder(mut));
  ok(/if \(!leases\.length\) \{ if \(d\.enabled\) deskEl\.innerHTML/.test(lau) && lau.split("t('Off — turn it on in Settings → Desktop apps')").length - 1 === 2, 'the real-desktop "Off — turn it on…" is said ONCE (the heading\'s line; the second site is the read-error fallback)');
  ok(/if \(availBad \|\| !!\(data && data\.availability && data\.availability\.fallbackWhy\)\) \{ if \(availEl\.parentElement !== availHead\) availHead\.appendChild\(availEl\); \}/.test(lau), 'a backend that is missing or fell back is said at the TOP; a working one is footer small print');
  ok(/const ro = new ResizeObserver\(\(\) => \{ if \(pop\.isConnected\) clamp\(\); else ro\.disconnect\(\); \}\); ro\.observe\(pop\);/.test(read('src/lib/utils.js')) && /requestAnimationFrame\(\(\) => \{ clamp\(\); pop\.style\.visibility = ''; \}\);/.test(read('src/lib/utils.js')), 'a popover is clamped again whenever its size changes — the footer\'s share picker grows after it opens (measured: rows at y 928 on an 813 px page)');
  ok(/installAppBtn\.onclick = \(\) => openAppSearch\(app, machineOf\(host\)/.test(lau) && /if \(doc\) \{[\s\S]{0,200}installAppBtn\.style\.display = 'none';/.test(lau), '"Install an app…" in the head opens the search for the chosen machine; a document\'s dialog has none');
}

console.log('§4 cards: whole names, the right language, scale behind ⋯');
{
  const wx = { id: 'r1', app: 'e1', label: 'wechat', labels: { zh: '微信', ja: 'WeChat' } };
  ok(Lm.catalogLabel(wx, 'zh') === '微信' && Lm.catalogLabel(wx, 'ja') === 'WeChat' && Lm.catalogLabel(wx, 'en') === 'wechat' && Lm.catalogLabel({ ...wx, labels: { zh: '  ' } }, 'zh') === 'wechat' && Lm.catalogLabel({ ...wx, labels: 'x' }, 'zh') === 'wechat' && Lm.catalogLabel(null) === '', 'an installed app\'s own localized name (labels[lang]) › the label; blank or junk labels fall back');
  ok(Lm.catalogLabel({ id: 'gnome-calculator', label: 'Calculator (GNOME)' }, 'zh') === 'Calculator (GNOME)' && zh['Calculator (GNOME)'] === '计算器（GNOME）' && ja['Calculator (GNOME)'] && /escHtml\(catalogLabel\(row\)\)/.test(lau), 'the built-in worded label is a t() key (zh 计算器（GNOME）); the card escapes whatever name it shows');
  ok(Lm.registryReasonShort({ available: false }) === 'not installed' && [{ available: true }, { available: false, browser: 'chromium' }, { available: false, office: 'calc' }, { available: false, app: 'e' }, { available: false, reasonCode: 'x' }, null].every((r) => Lm.registryReasonShort(r) === null) && /registryReasonShort\(row\) \|\| row\.reason/.test(lau), 'a built-in row whose program is absent says "not installed" (zh 未安装 — no more "gedit not on PATH"); the sentence stays its tooltip');
  const labelRule = (s) => (s.match(/\n\.desktop-launch-card-label \{[^}]*\}/) || [''])[0];
  const twoLines = (r) => /-webkit-line-clamp: 2/.test(r) && /white-space: normal/.test(r) && !/nowrap|text-overflow: ellipsis/.test(r);
  ok(twoLines(labelRule(css)), 'a card\'s name wraps to TWO lines (clamped), never one line with an ellipsis', labelRule(css));
  ok(!twoLines('\n.desktop-launch-card-label { font-size: 12px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'), 'CONTROL: the pre-lane one-line rule is caught');
  ok(Lm.cardScaleText('auto') === '' && Lm.cardScaleText(1.5) === '1.5×' && /if \(scales && !unavailable\) \{/.test(lau) && /if \(cur === 'auto'\) c\.innerHTML = UI_ICONS\.more; else c\.textContent = cardScaleText\(cur\);/.test(lau) && /b\.addEventListener\('contextmenu', \(e\) => \{ e\.preventDefault\(\); sc\.onclick\(e, \{ left: e\.clientX, bottom: e\.clientY \}\); \}\);/.test(lau), 'no permanent "Auto": the control is ⋯ (or the default it starts at), and a right-click on the card opens the same menu at the pointer; an app that cannot start has no ⋯ (its name keeps the room)');
}

console.log('§5 dead ends become hand-offs');
{
  ok(['needs_snap', 'not_found'].every((c) => Lm.HAND_OFF_CODES.includes(c)) && Object.isFrozen(Lm.HAND_OFF_CODES), 'the refusals that end in "Let an agent find another way"');
  ok(/note\.textContent = isApp \? \(appRefusalText\(plan\.code\) \|\| plan\.error \|\| ''\)/.test(lau) && !/\[appRefusalText\(plan\.code\), plan\.error\]\.filter\(Boolean\)\.join/.test(lau) && !/\[appRefusalText\(end\.code\), end\.error\]/.test(lau), 'a refusal is ONE sentence — ours, else the machine\'s (never both joined)');
  ok(/if \(isApp\) handOff\(plan\.code, \(r\.request \|\| request \|\| \{\}\)\.packages\);/.test(lau) && /openAgentHelp\(launcherApp, m, \{ request: \(pkgs \|\| \[\]\)\.join\(' '\) \}\)/.test(lau), 'WIRING: the plan refusal offers the helper with the package words carried');
  ok(/if \(!r\.results\.length\) \{[\s\S]{0,300}openAgentHelp\(app, m, \{ request: words \}\)/.test(aid) && /if \(carried\) input\.value = String\(carried\);/.test(aid), 'WIRING: a search that finds nothing says so and hands the words to an agent ("Let an agent find it"), the helper\'s box pre-filled');
  const snap = Am.appRefusalText('needs_snap');
  ok(snap && !/ — |snap|\.deb|apt/i.test(snap) && /\.$/.test(snap), 'the snap refusal is one plain sentence (no snap / .deb words)', snap);
  ok(zh['The package sources of {machine} have no “{q}”'] === '{machine}的软件源里没有“{q}”', 'zh: 本机的软件源里没有“微信”');
}

console.log('§6 one name: Apps');
{
  const gear = lau.slice(lau.lastIndexOf('registerMenuItem({', lau.indexOf("menu: 'gear'")), lau.indexOf('});', lau.indexOf("menu: 'gear'")));
  ok(/group: '1_admin', order: 18/.test(gear) && !/parent:/.test(gear) && /label: \(\) => t\('Apps…'\)/.test(gear) && /registerCommand\(\{ id: COMMAND_ID, title: 'Apps…'/.test(lau), 'the ⚙ row is TOP-LEVEL ("Apps…", between All Settings and Tools ▸), the command\'s title the same word');
  ok(/title: doc \? t\('Open with LibreOffice'\) : t\('Apps'\)/.test(lau) && /<h4>\$\{escHtml\(t\('Apps'\)\)\}<\/h4>/.test(lau) && /t\('Apps…'\)/.test(read('src/lib/mobile-nav.js')) && /<span data-i18n>Apps<\/span>/.test(read('public/index.html')), 'the dialog title, the catalog heading, the phone sheet and the toolbar button all say Apps');
  ok(!/t\('(Desktop apps…?|Applications|Desktop app…)'\)/.test(lau + read('src/lib/mobile-nav.js')) && zh['Apps'] === '应用' && zh['Apps…'] === '应用…' && ja['Apps…'], 'no "Desktop apps" / "Applications" left on these surfaces; zh 应用');
}

console.log('§7 zh / ja: 在本机上安装 — no stray spaces');
const MKEYS = [...new Set([...(lau + aid).matchAll(/t\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((k) => k.includes('{machine}')))];
const CJK = '぀-ヿ㐀-鿿＀-￯　-〿';
const spaced = (d) => MKEYS.filter((k) => d[k] && new RegExp(`[${CJK}] \\{machine\\}|\\{machine\\} [${CJK}]`).test(d[k]));
{
  ok(MKEYS.length > 30 && same(spaced(zh), []) && same(spaced(ja), []), `none of the ${MKEYS.length} {machine} templates the apps surfaces say puts a space between {machine} and a CJK neighbour (zh + ja)`, { zh: spaced(zh), ja: spaced(ja) });
  ok(spaced({ ...zh, [MKEYS[0]]: '在 {machine} 上' }).length === 1, 'CONTROL: a planted "在 {machine} 上" is caught');
}

console.log('§8 Layer 1\'s three places (words + slots)');
{
  const e = (n) => ({ manifest: { entries: Array.from({ length: n }, (_, i) => ({ id: 'e' + i })) } });
  const M = Am.appsStatusModel;
  ok(M(null) === null && M({}) === null && M(e(0)) === null, 'nothing installed ⇒ no status line (the list says so)');
  const a = M({ ...e(5), updates: { count: 3 } });
  ok(a.text === '5 apps · 3 updates' && a.label === 'Update…' && same(a.request, { kind: 'refresh' }) && !a.rebase, '"5 apps · 3 updates · [Update…]" (Refresh: the plan first)', a);
  ok(M({ ...e(1), updates: { count: 0 } }).text === '1 app · up to date' && M({ ...e(1), updates: { count: 0 } }).label === 'Check for updates…' && M({ ...e(2), updates: { count: 1 } }).text === '2 apps · 1 update' && M(e(2)).text === '2 apps', 'singulars, up to date, unknown');
  const never = M({ ...e(2), updates: { count: 2 }, refreshedAt: null });
  ok(!/never/.test(never.text) && /never refreshed/.test(never.title), 'review I14: the line never pairs a count with "never refreshed" (that stays the tooltip)');
  const rb = M({ ...e(2), appSystem: { rebase: true } });
  ok(rb.rebase && rb.rebase.text === 'The system was upgraded; your apps still run in their original environment' && rb.rebase.label === 'Migrate…' && same(rb.rebase.request, { kind: 'rebase' }), 'after a base change: one more line + [Migrate…] (Rebase)');
  ok(Am.appsBannerModel(null) === null && Am.appsBannerModel({ appSystem: {} }) === null && same(Am.appsBannerModel({ appSystem: { interrupted: true } }), { text: 'The last install was interrupted', label: 'Repair', request: { kind: 'repair' } }), 'the banner: "The last install was interrupted — [Repair]", only when the state says so');
  ok(/root\.replaceChildren\(actions, status, sysRow, back, props, drift, list, rebaseRow, foot\);/.test(aid) && /try \{ onState\?\.\(st && !st\.error \? st : null\); \} catch \{ \}/.test(aid) && /onState: renderBanner/.test(lau), 'WIRING: the status line is the section\'s FOOT; the dialog\'s banner reads the same state');
  ok(zh['The last install was interrupted'] === '上次安装被中断' && zh['Repair'] === '修复' && zh['{n} apps'] === '{n} 个应用' && zh['apps::{n} updates'] === '{n} 个更新' && zh['The system was upgraded; your apps still run in their original environment'] === '系统已升级；你的应用仍在原来的环境里正常运行', 'zh: 上次安装被中断 — [修复] · 5 个应用 · 3 个更新');
}

// every key this lane added (en → zh, ja)
const CTX = { 'apps::{n} updates': "tc('apps', '{n} updates'" }; // a contextual key (the bare "{n} updates" means progress updates)
const NEW = ['Larger {scale}×', 'Actual size', '{size} memory', 'shown with {backend} — {why}', 'shown with {backend}', 'About this window: {facts}', 'Starting… {n} s', 'Starting…', 'Calculator (GNOME)', 'Apps…', 'Let an agent find another way', 'This package only points to a kind of app that does not run here.', 'It cannot be installed together with what is already on this machine.', '{app} is installed on {machine} — it is in Apps', '1 app', '{n} apps', 'up to date', '1 update', 'Update…', 'Check for updates…', 'The system was upgraded; your apps still run in their original environment', 'Migrate…', 'The last install was interrupted', 'Repair', 'More…', 'The package sources of {machine} have no “{q}”', 'Let an agent find it'];

console.log('§9 THE WORD CENSUS — no deb / apt / AppImage / root / sha256 / sudo in what this lane wrote (en / zh / ja)');
const JARGON = /(^|[^A-Za-z])(\.?deb|apt(-get)?|AppImage|root|sha256|sudo|PSS)([^A-Za-z]|$)/i;
const censusHits = (keys, dicts) => keys.flatMap((k) => [['en', k], ['zh', dicts.zh[k]], ['ja', dicts.ja[k]]].filter(([, v]) => typeof v === 'string' && JARGON.test(v)).map(([l, v]) => `${l}: ${v}`));
{
  // + the launch dialog's own strings (its body template)
  const i = lau.indexOf('body.innerHTML = `', lau.indexOf('export async function showLaunchDialog'));
  const tplKeys = [...lau.slice(i, lau.indexOf('`;', i)).matchAll(/t\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  const keys = [...NEW, ...Object.keys(CTX), ...tplKeys];
  ok(tplKeys.length >= 15 && same(censusHits(keys, { zh, ja }), []), `${keys.length} strings × 3 languages carry none of the words`, censusHits(keys, { zh, ja }));
  ok(censusHits(['x'], { zh: { x: '用 apt-get 安装' }, ja: {} }).length === 1 && censusHits(['Install from a .deb file…'], { zh: {}, ja: {} }).length === 1 && censusHits(['the root of it'], { zh: {}, ja: {} }).length === 1 && censusHits(['Apps'], { zh, ja }).length === 0, 'CONTROLS: a planted "apt-get", ".deb" and "root" are caught; a clean key is not');
}

console.log('§10 i18n — every new key in zh + ja, each a t() literal');
{
  const code = [win, xv, lau, aid, read('src/lib/mobile-nav.js')].join('\n');
  const miss = [...NEW, ...Object.keys(CTX)].filter((k) => !zh[k] || !ja[k]), lit = [...NEW.filter((k) => !code.includes(`t('${k}'`)), ...Object.entries(CTX).filter(([, s]) => !code.includes(s)).map(([k]) => k)];
  ok(miss.length === 0 && lit.length === 0, `${NEW.length} keys`, { miss, lit });
  ok(['{app} is installed on {machine} — it is in the Applications list', 'apt cannot install it together with what is already installed.'].every((k) => !(k in zh) && !(k in ja) && !code.includes(k)), 'the retired wordings are gone from the code and both dictionaries');
}

console.log('§11 an app with no cwd starts in HOME');
{
  const D = require('../src/desktop-display.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `vs-apps-interface-${process.pid}-`));
  const pwdOf = async (cwd) => {
    const log = path.join(home, `pwd-${cwd ? 'given' : 'none'}.log`);
    const fd = fs.openSync(log, 'w');
    try { await D.startApp({ exec: '/bin/pwd', args: [], cwd, env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home }, logFd: fd }); } finally { fs.closeSync(fd); }
    for (let i = 0; i < 100 && !fs.readFileSync(log, 'utf8').trim(); i++) await new Promise((r) => setTimeout(r, 20));
    return fs.readFileSync(log, 'utf8').trim();
  };
  try {
    const none = await pwdOf(undefined), given = await pwdOf('/');
    ok(none === fs.realpathSync(home), 'no cwd ⇒ the app\'s HOME (a terminal starts there, not in the server\'s checkout)', none);
    ok(given === '/', 'CONTROL: an explicit cwd still wins', given);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

console.log('§D019 design 019 — the Move banner, the drift card\'s two acts, the honest sentences (en / zh / ja)');
{
  const st = (o) => ({ appSystem: { enabled: true, usable: true }, entries: [{ id: 'hello', packages: ['hello'] }, { id: 'gimp', layer: 'sys', packages: ['gimp'] }], ...o });
  const mv = Am.appsMoveModel(st());
  ok(mv && mv.n === 1 && mv.request.kind === 'move' && /1 app is reinstalled at every rebuild/.test(mv.text) && Am.appSystemRows(st()).some((r) => r.move && r.buttons[0].request.kind === 'move'), 'the Move banner: one host app + a usable app system → "1 app is reinstalled at every rebuild" + Move…');
  ok(!Am.appsMoveModel(st({ appSystem: { enabled: true, usable: false } })) && !Am.appsMoveModel(st({ entries: [{ id: 'gimp', layer: 'sys', packages: ['gimp'] }] })) && !Am.appSystemRows(st({ entries: [] })).some((r) => r.move), 'CONTROL: no banner when the app system is not usable, or no host app is left');
  ok(/Not in the app system you went back to: hello/.test(Am.appSystemRows(st({ state: { sys: { gone: { ids: ['hello'], at: 1 } } } })).map((r) => r.text).join(' | ')), 'after a Roll back the apps the index lost are named');
  const acts = Am.driftActs(st(), ['htop']), acts0 = Am.driftActs({ appSystem: null }, ['htop']);
  ok(acts[0].primary && acts[0].request.kind === 'apt' && acts[1].request.kind === 'adopt' && !acts[1].primary && acts0.length === 1 && acts0[0].request.kind === 'adopt', 'the drift card: with a usable app system the PRIMARY act installs into it, Adopt on the base is second; without one, Adopt alone');
  const notes = Am.resultNotes({ services: [{ unit: 'pg.service' }], layer: 'sys', exports: 0 });
  ok(notes.length === 2 && /background service/.test(notes[0]) && /nothing can be started from outside/.test(notes[1]) && !Am.resultNotes({ layer: 'sys', exports: 2 }).length && /background service/.test(Am.appDoneText({ kind: 'apt', label: 'pg', rows: [], run: { services: [{ unit: 'pg.service' }], missing: [] } }, 'box')), 'the result card: a service nothing starts + "nothing launchable from outside" (neither for an app that exports something)');
  const dt = Am.appDoneText({ kind: 'move', moved: [{ id: 'hello', label: 'hello', ok: true }, { id: 'x', label: 'xapp', ok: false }] }, 'box');
  ok(/hello moved into the app system/.test(dt) && /Not moved: xapp/.test(dt) && Am.appGoLabel({ kind: 'move' }) === 'Move', 'a move names what moved and what did not');
  const KEYS = ["1 app is reinstalled at every rebuild — move it into the app system", "{n} apps are reinstalled at every rebuild — move them into the app system", "apps::Move…", "apps::Move", "Not in the app system you went back to: {names}", "Install into the app system…", "It stays after a rebuild — nothing is reinstalled", "Keep on the base only…", "Reinstalled at every rebuild", "Move your apps into the app system on {machine}", "{app}: not moved — {why}", "{app}: already in the app system — only its record on the base goes", "Each app goes into the app system first; only then is it no longer reinstalled at every rebuild. Its programs stay on the base until the next rebuild.", "This moves {app} into the app system — it is no longer reinstalled at every rebuild", "{pkgs} is also installed on the base ({apps})", "{n} apps on the base are not in this update — Move… puts them into the app system: {names}", "{apps} moved into the app system on {machine}", "Not moved: {apps}", "Nothing was moved", "This package brings a background service; nothing starts it — use a kept-up job", "Installed; nothing can be started from outside — its files are only in the app system"];
  const miss = KEYS.filter((k) => !zh[k] || !ja[k] || zh[k] === k || ja[k] === k);
  ok(!miss.length, `every design 019 sentence has its zh + ja (${KEYS.length})`, miss);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
