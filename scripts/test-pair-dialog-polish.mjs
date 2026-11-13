#!/usr/bin/env node
// test-pair-dialog-polish — lane pair-dialog-polish (2.369.399; the owner's screen, 2026-11-13: «你看看这个界面是不是应该优化下»):
// the device pairing dialog's COMMAND sheet in a REAL page (scripts/pairing-ui-harness.mjs: a throwaway worktree server + headless
// chrome; no daemon — the sheet is the mint's answer). For every system (macOS / Linux / Windows) × zh / en × 1280 px and 390 px:
//   ① every box sits BESIDE its word (the label census) — the pre-polish allow list put each word UNDER its box
//   ② no greyed control on the sheet — a box `sessions` holds on is said in words, its box hidden (pre-polish: 命令 / 文件 greyed + ticked)
//   ③ THIS system's facts only — Windows never says launchd / systemd, macOS never PowerShell… (pre-polish: one tail for all)
//   ④ the command shows WHOLE — no line cut, never a hand-resized box (pre-polish: a 110 px textarea showed five of its lines)
//   ⑤ the order: ① ② ③ steps (what to DO) → the allow list (what you MAY change) → one fold of facts; the Windows rights box only on Windows
//   ⑥ the rect census: inside the viewport, no sideways scroll, rows ≥ 44 px on the phone
// + Copy says it copied, and «copy it again» once a box changes the command; the held rows follow «sessions»; the long command
//   (a long relay address) whole at both widths; the re-pair sheet («Pairing command — "name"») after Generate.
// CONTROLS: a style.css with the pre-polish allow-row rule put back ⇒ ① RED; the held box shown ⇒ ② RED; a client bundle whose
//   facts stay macOS's and whose command box is never measured ⇒ ③ + ④ RED.
// EVIDENCE (the owner judges pictures): PAIR_PICS_OUT=<dir> writes a PNG per state under <dir>/after/; with PAIR_PICS_BEFORE=<rev>
//   the same states are drawn by THAT revision's sheet (its sidebar-mounts.js + i18n dicts in a bundle, its style.css) under
//   <dir>/before/, and the census must be RED there on ① ② ③ ④ ⑤.
// Requires google-chrome (SKIP without). Run: node scripts/test-pair-dialog-polish.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { bootWorld, CHROME, sleep, rectCensusJs, labelRowCensusJs, swapStyleJs, REPO } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d).slice(0, 1500)) : '')); } };
const OUT = process.env.PAIR_PICS_OUT || '';
const BEFORE = process.env.PAIR_PICS_BEFORE || '';
const OSES = [['mac', 'macOS'], ['linux', 'Linux'], ['win', 'Windows']];
const WIDTHS = [{ tag: '1280', width: 1280, height: 820, mobile: false }, { tag: '390', width: 390, height: 844, mobile: true }];
const W = await bootWorld('pairpolish', {});
const MUT = mutantCopies('pairpolish', REPO);

/** a client bundle with `files` = {repo-rel: source} swapped in (esbuild over THIS tree's src/client.js — the build's own options) */
async function bundleWith(files, tag) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const map = new Map();
  for (const [rel, src] of Object.entries(files)) {
    const copy = path.join(MUT.dir, `${path.basename(rel, '.js')}-${tag}-${process.pid}.js`);
    fs.writeFileSync(copy, src); MUT.files.push(copy); map.set(path.join(REPO, rel), copy);
  }
  const back = new Map([...map].map(([o, c]) => [c, o]));
  const r = await esbuild.build({
    entryPoints: [path.join(REPO, 'src/client.js')], bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent',
    plugins: [{ name: 'vs-pairpolish', setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        const orig = back.get(a.importer);
        if (orig && a.path.startsWith('.')) { const abs = path.resolve(path.dirname(orig), a.path); const abs2 = map.get(abs) || map.get(abs + '.js'); return { path: abs2 || (fs.existsSync(abs) ? abs : abs + '.js') }; }
        if (orig && !a.path.startsWith('/') && a.pluginData !== 'vs-pairpolish') return b.resolve(a.path, { resolveDir: path.dirname(orig), kind: a.kind, pluginData: 'vs-pairpolish' });
        if (a.path.startsWith('.')) { const abs = path.resolve(a.resolveDir, a.path); const c = map.get(abs) || map.get(abs + '.js'); if (c) return { path: c }; }
        return undefined;
      });
    } }],
  });
  return r.outputFiles[0].text;
}

const openRemote = (P) => P.evalJs(`(() => { const s = app.sidebar; s.toggle?.(true); if (s._railEl) { if (s._activeTab !== 'mounts') s._railGo('mounts'); else s._render(); } else { s._activeTab = 'mounts'; s._updateTabs?.(); s._render(); } return true; })()`);
const setMetrics = (P, m) => P.cdp('Emulation.setDeviceMetricsOverride', { width: m.width, height: m.height, deviceScaleFactor: 1, mobile: m.mobile });
const pickOs = (P, label) => P.evalJs(`(() => { const b = [...document.querySelectorAll('#device-pair-dialog .device-pair-os button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
/** ①–⑤ of the sheet as it stands */
const censusJs = (os) => `(() => {
  const d = document.querySelector('#device-pair-dialog .dialog'); if (!d) return { why: 'no dialog' };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !!e.offsetParent; };
  const greyed = [...d.querySelectorAll('input, button, select, textarea')].filter((e) => e.disabled && vis(e)).map((e) => ((e.closest('label') || e).textContent || e.type).trim().slice(0, 30));
  const ta = d.querySelector('.device-pair-cmd');
  const cut = ta ? Math.max(0, ta.scrollHeight - ta.clientHeight) : -1;
  const resize = ta ? getComputedStyle(ta).resize : '';
  const text = d.textContent;
  const FORBID = { mac: ['systemd', 'PowerShell', '%USERPROFILE%', 'scheduled task', '计划任务'], linux: ['launchd', 'PowerShell', '%USERPROFILE%', 'scheduled task', '计划任务'], win: ['launchd', 'systemd', '~/.vibespace'] };
  const OWN = { mac: ['launchd', '~/.vibespace'], linux: ['systemd', '~/.vibespace'], win: ['PowerShell', '%USERPROFILE%'] };
  const os = ${JSON.stringify(os)};
  const wrong = FORBID[os].filter((w) => text.includes(w)), own = OWN[os].filter((w) => text.includes(w));
  const steps = d.querySelector('.device-pair-steps'), allow = d.querySelector('.device-pair-allow'), more = d.querySelector('.device-pair-more');
  const after = (a, b) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const order = after(steps, allow) && after(allow, more);
  const nSteps = steps ? steps.querySelectorAll(':scope > .device-pair-step').length : 0;
  const elev = d.querySelector('.device-pair-elev');
  return { greyed, cut, resize, wrong, own, missing: OWN[os].filter((w) => !own.includes(w)), order, nSteps, elevShown: !!elev && vis(elev), title: (d.querySelector('.dialog-title, .dialog-header h3, h3') || {}).textContent || '' };
})()`;
const judge = (c, os, lc, rc) => ({
  labels: lc.ok && lc.n >= 7, greyed: Array.isArray(c.greyed) && c.greyed.length === 0, words: !!c.wrong && c.wrong.length === 0 && c.missing.length === 0,
  whole: c.cut === 0 && c.resize === 'none', order: c.order && c.nSteps === 3 && c.elevShown === (os === 'win'), rect: rc.ok,
});
async function shoot(P, phase, name) {
  if (!OUT) return null;
  const dir = path.join(OUT, phase); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  const { data } = await P.cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(f, Buffer.from(data, 'base64'));
  return f;
}
/** the top of the sheet, then its end (scrolled; the fold open) */
async function shootBoth(P, phase, name) {
  if (!OUT) return;
  await P.evalJs(`(() => { const d = document.querySelector('#device-pair-dialog .dialog'); for (const e of [d, d.querySelector('.dialog-body')]) if (e) e.scrollTop = 0; const m = d.querySelector('.device-pair-more'); if (m) m.open = false; return true; })()`);
  await sleep(150); await shoot(P, phase, name + '-top');
  const scrolls = await P.evalJs(`(() => { const d = document.querySelector('#device-pair-dialog .dialog'); const m = d.querySelector('.device-pair-more'); if (m) m.open = true; let s = false; for (const e of [d.querySelector('.dialog-body'), d]) if (e && e.scrollHeight > e.clientHeight + 1) { e.scrollTop = e.scrollHeight; s = true; } return s; })()`);
  await sleep(150); await shoot(P, phase, name + '-end');
  await P.evalJs(`(() => { const d = document.querySelector('#device-pair-dialog .dialog'); const m = d && d.querySelector('.device-pair-more'); if (m) m.open = false; return true; })()`);
  return scrolls;
}
/** a page in `lang`, the dialog opened, a pairing created ⇒ the command sheet */
async function sheetPage(lang, name, { bundleText = null, css = null } = {}) {
  const P = await W.openPage({ width: 1280, height: 820, lang, bundleText });
  if (css) { await P.evalJs(swapStyleJs(css)); await sleep(150); }
  await openRemote(P);
  const label = lang === 'zh' ? /配对设备/ : /Pair a device/;
  // the Remote panel draws its actions after its hosts answer — wait for the button (realClick answers null at once when it is not there yet;
  // 92c6aecc4's claim: «no Pair a device button» on both pages, 9.7 s)
  await P.waitFor(`!!([...document.querySelectorAll('.mounts-action')].find((b) => ${label}.test(b.textContent)))`, 20000);
  const opened = await P.realClick(`([...document.querySelectorAll('.mounts-action')].find((b) => ${label}.test(b.textContent)) || null)`);
  if (!opened) return { P, err: 'no Pair a device button' };
  await P.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked')`, 10000);
  await P.realClick(`#device-pair-dialog .dap-row[data-kind="origin"] input`);
  await P.realClick(`#device-pair-dialog .device-pair-name`);
  await P.type(name);
  await P.realClick(`#device-pair-dialog .device-pair-go`);
  const got = await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000);
  return got ? { P } : { P, err: 'no command sheet' };
}
/** every system × width of one page's sheet: the census (and the pictures) */
async function walkSheet(P, phase, lang, { expectRed = false } = {}) {
  const rows = [];
  for (const m of WIDTHS) {
    await setMetrics(P, m); await sleep(300);
    for (const [os, label] of OSES) {
      await pickOs(P, label); await sleep(200);
      const c = await P.evalJs(censusJs(os));
      const lc = await P.evalJs(labelRowCensusJs('#device-pair-dialog'));
      const rc = await P.evalJs(rectCensusJs('#device-pair-dialog .dialog', '.device-pair-allow-flag, .device-pair-allow label', m.mobile ? 44 : 28));
      const j = judge(c, os, lc, rc);
      rows.push({ m: m.tag, os, j, c, lc: { n: lc.n, bad: lc.bad.length, first: lc.bad[0] }, rc: { ok: rc.ok, overflowX: rc.overflowX, small: rc.small, outside: rc.rect } });
      await shootBoth(P, phase, `${lang}-${m.tag}-${os}`);
      if (!expectRed) {
        const at = `${lang} ${m.tag} px ${label}`;
        ok(j.labels, `① ${at}: every box BESIDE its word (${lc.n} labels, ${lc.bad.length} not)`, lc.bad.slice(0, 2));
        ok(j.greyed, `② ${at}: no greyed control on the sheet`, c.greyed);
        ok(j.words, `③ ${at}: this system's facts only (says ${c.own.join(', ')}; never ${c.wrong.join(', ') || 'another system\'s'})`, c);
        ok(j.whole, `④ ${at}: the command shows WHOLE (cut ${c.cut} px, resize ${c.resize})`, c);
        ok(j.order, `⑤ ${at}: ${c.nSteps} steps → the allow list → the fold; the Windows rights box ${c.elevShown ? 'shown' : 'hidden'}`, c);
        ok(j.rect, `⑥ ${at}: inside the viewport, no sideways scroll, rows ≥ ${m.mobile ? 44 : 28} px`, rc);
      }
    }
  }
  await setMetrics(P, WIDTHS[0]); await sleep(200);
  return rows;
}

try {
  // ── the sheet in zh and en, every system, both widths ──
  console.log('① – ⑥ the command sheet: every system × zh / en × 1280 / 390 px');
  const pages = {};
  for (const lang of ['zh', 'en']) {
    const s = await sheetPage(lang, `polish-${lang}`);
    ok(!s.err, `${lang}: Pair a device → Create pairing ⇒ the command sheet`, s.err);
    if (s.err) continue;
    pages[lang] = s.P;
    await walkSheet(s.P, 'after', lang);
  }
  const P = pages.zh || pages.en;
  if (!P) throw new Error('no sheet page');
  const isZh = !!pages.zh;
  // ── Copy says it copied; a box that changes the command says «copy it again» ──
  console.log('Copy — says it copied, and when the command changed after');
  const copyState = () => P.evalJs(`(() => { const d = document.querySelector('#device-pair-dialog'); return { btn: d.querySelector('.device-pair-copy').textContent, state: d.querySelector('.device-pair-copy-state').textContent, cmd: d.querySelector('.device-pair-cmd').value }; })()`);
  await pickOs(P, 'macOS'); await sleep(150);
  const c0 = await copyState();
  ok(c0.btn === (isZh ? '复制命令' : 'Copy command') && c0.state === '', 'before a copy the button says Copy command, nothing beside it', c0);
  await P.realClick(`#device-pair-dialog .device-pair-copy`); await sleep(200);
  const c1 = await copyState();
  ok(c1.btn === (isZh ? '已复制' : 'Copied'), 'a real click on Copy ⇒ the button says it copied', c1);
  await P.realClick(`#device-pair-dialog .device-pair-allow-flag[data-flag="lan"]`); await sleep(200);
  const c2 = await copyState();
  ok(c2.btn === (isZh ? '复制命令' : 'Copy command') && c2.state === (isZh ? '命令已经变了——请重新复制。' : 'The command changed — copy it again.') && c2.cmd !== c1.cmd && /\n  --allow all$/.test(c1.cmd) && /\n  --allow run,files,input,socks,sessions,upgrade$/.test(c2.cmd), 'a click on 局域网\'s ROW (a local instance starts with everything on) changes the command ⇒ Copy says so: «copy it again»', { c1: c1.cmd.slice(-40), c2 });
  await P.realClick(`#device-pair-dialog .device-pair-copy`); await sleep(200);
  ok((await copyState()).btn === (isZh ? '已复制' : 'Copied'), '…and copying again says it copied');
  await P.realClick(`#device-pair-dialog .device-pair-allow-flag[data-flag="lan"]`); await sleep(150);
  // ── the boxes sessions holds: words, not greyed boxes; they come back when sessions goes ──
  console.log('the rows sessions holds');
  const held = () => P.evalJs(`[...document.querySelectorAll('#device-pair-dialog .device-pair-allow-flag')].map((l) => { const i = l.querySelector('input'); return { f: l.dataset.flag, on: i.checked, held: l.classList.contains('is-held'), shown: getComputedStyle(i).visibility !== 'hidden', hint: l.querySelector('.device-pair-allow-hint').textContent }; })`);
  const h0 = await held();
  const runRow = h0.find((x) => x.f === 'run'), filesRow = h0.find((x) => x.f === 'files');
  ok(h0.map((x) => x.f).join(' ') === 'run files sessions upgrade socks lan input' && runRow.held && filesRow.held && !runRow.shown && !filesRow.shown && runRow.on && filesRow.on && runRow.hint === (isZh ? '勾选了“会话”就一直开着——对话需要它。' : 'On while sessions is ticked — a conversation needs it.'), 'sessions on ⇒ 命令 and 文件 are ON and said in words (no box shown), every other row has its box', h0);
  ok(h0.filter((x) => !x.held).every((x) => x.shown && x.hint.length > 6), 'every other item says in plain words what it lets this VibeSpace do there', h0.map((x) => x.hint));
  await P.realClick(`#device-pair-dialog .device-pair-allow-flag[data-flag="sessions"]`); await sleep(200);
  const h1 = await held();
  ok(h1.every((x) => !x.held && x.shown) && h1.find((x) => x.f === 'run').on && !h1.find((x) => x.f === 'sessions').on, 'untick 会话 ⇒ 命令 and 文件 are boxes again (still ticked), nothing held', h1);
  ok(/\n  --allow run,files,input,socks,lan,upgrade$/.test((await copyState()).cmd), '…and the command says --allow run,files,input,socks,lan,upgrade (the flags as before)', (await copyState()).cmd.slice(-60));
  await P.realClick(`#device-pair-dialog .device-pair-allow-flag[data-flag="sessions"]`); await sleep(150);
  // ── the long command (a long relay address): whole at both widths ──
  console.log('the long command — whole at both widths');
  const longR = { httpBase: 'https://' + 'a-very-long-relay-hostname-for-this-instance.'.repeat(3) + 'example.com:8443/vibespace/prefix', dialUrl: 'wss://' + 'a-very-long-relay-hostname-for-this-instance.'.repeat(3) + 'example.com:8443/vibespace/prefix/api/device-dial?device=polish-long', dialToken: 'vsdt_' + 'f0'.repeat(32), hostToken: 'vsht_' + 'e1'.repeat(32), deviceId: 'polish-long' };
  await P.evalJs(`(() => { const b = document.querySelector('#device-pair-dialog .device-pair-body'); app.sidebar._fillPairCommandBody(b, () => {}, ${JSON.stringify(longR)}, {}); return true; })()`);
  for (const m of WIDTHS) {
    await setMetrics(P, m); await sleep(300);
    for (const [os, label] of [['linux', 'Linux'], ['win', 'Windows']]) {
      await pickOs(P, label); await sleep(200);
      const c = await P.evalJs(censusJs(os));
      const lines = await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-cmd').value.split('\\n').length`);
      ok(c.cut === 0 && c.resize === 'none', `④ the long command (${lines} lines, wrapped) on ${label} at ${m.tag} px shows WHOLE (cut ${c.cut} px)`, c);
      await shootBoth(P, 'after', `${isZh ? 'zh' : 'en'}-${m.tag}-${os}-long`);
    }
  }
  await setMetrics(P, WIDTHS[0]); await sleep(200);
  await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close').click(); true`); await sleep(300);
  // ── the re-pair sheet: the machine row's «Pairing command — "name"» → Generate ⇒ the same steps ──
  console.log('the re-pair sheet («Pairing command — name»)');
  const nm = isZh ? 'polish-zh' : 'polish-en';
  await P.waitFor(`(app.sidebar._hostsData?.hosts || []).some((h) => h.deviceId === ${JSON.stringify(nm)})`, 15000);
  await P.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.deviceId === ${JSON.stringify(nm)})); true`);
  await P.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked') && !!document.querySelector('#device-pair-dialog .device-pair-go:not([disabled])')`, 10000);
  await shoot(P, 'after', `${isZh ? 'zh' : 'en'}-1280-repair-sheet`);
  await P.realClick(`#device-pair-dialog .device-pair-go`);
  const rep = await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000);
  ok(rep, 'the re-pair sheet: Generate ⇒ the command sheet');
  if (rep) {
    for (const m of WIDTHS) {
      await setMetrics(P, m); await sleep(300);
      await pickOs(P, 'Windows'); await sleep(200);
      const c = await P.evalJs(censusJs('win'));
      const lc = await P.evalJs(labelRowCensusJs('#device-pair-dialog'));
      const head = await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-head').textContent`);
      ok(judge(c, 'win', lc, { ok: true }).labels && c.greyed.length === 0 && c.wrong.length === 0 && c.cut === 0 && c.order && c.nSteps === 3 && head.includes(nm), `the re-pair command at ${m.tag} px: its own head («${head.slice(0, 60)}…»), the same steps, boxes beside words, Windows' facts only`, { c, lc: lc.bad.slice(0, 2), head });
      await shootBoth(P, 'after', `${isZh ? 'zh' : 'en'}-${m.tag}-win-repair`);
    }
    await setMetrics(P, WIDTHS[0]); await sleep(200);
  }
  await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`); await sleep(300);

  // ── CONTROLS ──
  console.log('CONTROLS — the census must see each defect it names');
  const realCss = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const HELD_RULE = '#device-pair-dialog label.device-pair-allow-flag.is-held input { visibility: hidden; }';
  ok(realCss.split(HELD_RULE).length === 2, 'the held-box rule is in public/style.css once (the control\'s anchor)');
  const preRow = '\n#device-pair-dialog .device-pair-allow-flag { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; min-height: 28px; }\n';
  const C = await sheetPage(isZh ? 'zh' : 'en', 'polish-ctl', { css: realCss.replace(HELD_RULE, '') + preRow });
  ok(!C.err, 'CONTROL page: the sheet under a patched style.css', C.err);
  if (!C.err) {
    await pickOs(C.P, 'Windows'); await sleep(200);
    const lc = await C.P.evalJs(labelRowCensusJs('#device-pair-dialog'));
    const c = await C.P.evalJs(censusJs('win'));
    ok(!lc.ok && lc.bad.length >= 7, `CONTROL ①: the pre-polish allow-row rule put back ⇒ the census sees ${lc.bad.length} words UNDER their boxes (RED)`, lc);
    ok(c.greyed.length === 2, `CONTROL ②: the held boxes shown ⇒ the census sees ${c.greyed.length} greyed controls (RED)`, c.greyed);
    await C.P.evalJs(swapStyleJs(realCss)); await sleep(200);
    ok((await C.P.evalJs(labelRowCensusJs('#device-pair-dialog'))).ok && (await C.P.evalJs(censusJs('win'))).greyed.length === 0, '…and the real style.css puts every word beside its box, no box greyed');
    await C.P.cdp('Page.close').catch(() => {});
  }
  const smSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  const LEV = [
    ['facts.replaceChildren(...[OS[k].starts,', 'facts.replaceChildren(...[OS.mac.starts,'],
    ["const fitCmd = () => { if (!ta.isConnected) return; ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };", 'const fitCmd = () => {};'],
    ['dir: OS[k].dir }', "dir: '~/.vibespace' }"],
  ];
  ok(LEV.every(([a]) => smSrc.split(a).length === 2), 'the bundle control\'s levers are spelled once each in src/lib/sidebar-mounts.js');
  let bundleCtl = null;
  try { bundleCtl = await bundleWith({ 'src/lib/sidebar-mounts.js': LEV.reduce((s, [a, b]) => s.replace(a, b), smSrc) }, 'ctl'); } catch (e) { ok(false, 'CONTROL bundle builds', e.message); }
  if (bundleCtl) {
    const B = await sheetPage(isZh ? 'zh' : 'en', 'polish-ctl2', { bundleText: bundleCtl });
    ok(!B.err, 'CONTROL page: the sheet on the patched bundle', B.err);
    if (!B.err) {
      await pickOs(B.P, 'Windows'); await sleep(200);
      const c = await B.P.evalJs(censusJs('win'));
      ok(c.wrong.includes('launchd') && c.wrong.includes('~/.vibespace'), `CONTROL ③: the facts left at macOS's ⇒ Windows says ${c.wrong.join(', ')} (RED)`, c);
      ok(c.cut > 0, `CONTROL ④: the command box never measured ⇒ ${c.cut} px of it cut (RED)`, c);
      await B.P.cdp('Page.close').catch(() => {});
    }
  }

  // ── EVIDENCE: the same states drawn by the pre-polish revision ──
  if (BEFORE) {
    console.log(`BEFORE — the sheet as ${BEFORE} drew it (its sidebar-mounts.js + dicts, its style.css)`);
    const show = (rel) => execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const bb = await bundleWith({ 'src/lib/sidebar-mounts.js': show('src/lib/sidebar-mounts.js'), 'src/lib/i18n-zh.js': show('src/lib/i18n-zh.js'), 'src/lib/i18n-ja.js': show('src/lib/i18n-ja.js') }, 'before');
    const bcss = show('public/style.css');
    for (const lang of ['zh', 'en']) {
      const s = await sheetPage(lang, `before-${lang}`, { bundleText: bb, css: bcss });
      ok(!s.err, `BEFORE ${lang}: the pre-polish sheet opens`, s.err);
      if (s.err) continue;
      const rows = await walkSheet(s.P, 'before', lang, { expectRed: true });
      const red = (k) => rows.filter((r) => !r.j[k]).length;
      console.log(`  BEFORE ${lang}: ${rows.map((r) => `${r.m}/${r.os} ${Object.entries(r.j).filter(([, v]) => !v).map(([k]) => k).join('+') || 'none'}`).join(' · ')}`);
      ok(red('labels') === rows.length && red('greyed') === rows.length && red('whole') >= 1 && red('order') === rows.length && rows.filter((r) => r.os === 'win' && !r.j.words).length === 2, `BEFORE ${lang}: the census is RED where the owner's picture is — ① ${red('labels')}/${rows.length}, ② ${red('greyed')}/${rows.length}, ③ Windows ${rows.filter((r) => r.os === 'win' && !r.j.words).length}/2, ④ ${red('whole')}, ⑤ ${red('order')}/${rows.length}`, rows.map((r) => ({ m: r.m, os: r.os, j: r.j, c: r.c })));
      await s.P.cdp('Page.close').catch(() => {});
    }
  }
  ok(Object.values(pages).every((p) => p.errors.length === 0), 'no page exception', Object.values(pages).flatMap((p) => p.errors).slice(0, 3));
  if (OUT) console.log(`  pictures: ${OUT}/after${BEFORE ? ` + ${OUT}/before` : ''}`);
} catch (e) {
  fail++; console.error('  ✗ threw:', e.stack || e.message);
}
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
