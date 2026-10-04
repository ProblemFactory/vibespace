#!/usr/bin/env node
// test-exit-runs-dialog-fit-ui — lane exit-runs-dialog-fit (2.369.209; the owner, 2026-10-04, a screenshot of
// "在 WIN-DESK1 上运行过的命令": 「这个界面展示不全」 — the intro line, every row's command, the decoded script and every
// stdout line ran past the dialog's right edge and were CUT; a transfer row put "0.0 s" on a line of its own).
// CHROME RECT CENSUS (heavy): a worktree server + headless chrome (pairing-ui-harness bootWorld; a private HOME /
// XDG_RUNTIME_DIR, no DISPLAY), the REAL Commands list (src/lib/exit-runs-dialog.js, bundled with a one-line opener hook)
// over a stubbed GET with real-shaped runs — a 650-character PowerShell -EncodedCommand row carrying a 40-line stdout of
// 200-character lines, a stderr row, a pull and a push (0 ms) — at 390 / 768 / 1280 px in zh and en, every row open:
//   ① the dialog inside the viewport, the body never scrolls sideways, no element's or text run's right edge past the
//      body's client width, the intro line whole (one box, inside the body, nothing scrolled)
//   ② every pre wraps (scrollWidth ≤ clientWidth) — and with its Wrap toggle off keeps its lines and SCROLLS ITSELF
//      (white-space: pre, overflow-x auto, wider inside than out) while the census above still holds
//   ③ the row: time · who · the command column (≤ 2 lines); below ~560 px time + who on one line, the command under
//   ④ a transfer row: its size and "<0.1 s" on its outcome's own line — never a lone duration line
//   ⑤ CONTROL: the 2.369.207 CSS (the 440 px dialog, the body's 640 px min-width) swapped in — ① goes red
// Shots (ERDF_SHOTS=<dir>): after-<w>-zh.png. Requires google-chrome (SKIP without).
// Run: node scripts/test-exit-runs-dialog-fit-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootWorld, CHROME, sleep, REPO, swapStyleJs, buildPatchedBundle } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';

if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// a private session: chrome and the server never see the owner's runtime dir, home or display
const PRIV = { XDG_RUNTIME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-erdf-xdg-')), HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-erdf-home-')) };
fs.chmodSync(PRIV.XDG_RUNTIME_DIR, 0o700);
Object.assign(process.env, PRIV); delete process.env.DISPLAY; delete process.env.WAYLAND_DISPLAY; delete process.env.DBUS_SESSION_BUS_ADDRESS;
process.on('exit', () => { for (const d of Object.values(PRIV)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } });

// ── the fixtures (real-shaped: the owner's machine, an agent's PowerShell probe, a pull and a push) ──
const SCRIPT = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $l=Join-Path $env:USERPROFILE '.vibespace\\device@linux-box-hub\\state\\agentd.log'; Get-Content $l -Encoding UTF8 | Where-Object { $_ -match '^2026-10-04T04:4[6-9]' } | Select -Last 40";
const ENC = 'powershell.exe -NoProfile -EncodedCommand ' + Buffer.from(SCRIPT, 'utf16le').toString('base64');   // 658 characters
const line = (i) => { const head = `2026-10-04T04:47:${String(10 + i).padStart(2, '0')}.519Z dial-out failed — refused-connect: connect ECONNREFUSED 100.87.42.107:3456 (attempt ${i}) `; return i % 5 === 0 ? (head + 'x'.repeat(200)).slice(0, 200) : (head + 'retry in 2000ms; '.repeat(12)).slice(0, 200); };
const STDOUT = Array.from({ length: 40 }, (_, i) => line(i + 1)).join('\n') + '\n';
const AT = Date.parse('2026-10-03T13:48:35Z');
const RUNS = [
  { id: 'r1', at: AT, name: 'VibeSpace 主开发', sessionKey: 's1', cmd: ENC, outcome: 'exited', code: 0, ms: 1834, stdout: STDOUT, stderr: '', cut: {}, interpreter: 'cmd.exe' },
  { id: 'r2', at: AT - 7276000, name: '生活方式助手', sessionKey: 's2', cmd: 'pull E:\\house3d\\jobs\\h3d-20261003-194702-1255294\\out.tar → /tmp/house3d-ada-h3d-20261003-194702-1255294/out.tar', outcome: 'exited', code: 0, ms: 0, transfer: { verb: 'pull', bytes: 2197252, verified: 'sha256', remote: 'E:\\house3d\\jobs\\h3d-20261003-194702-1255294\\out.tar', local: '/tmp/house3d-ada-h3d-20261003-194702-1255294/out.tar', sha256: 'a'.repeat(64) } },
  { id: 'r3', at: AT - 7290000, name: '生活方式助手', sessionKey: 's2', cmd: 'type C:\\Users\\ada\\.vibespace\\device@linux-box-hub\\state\\upgrade-2.369.206-from-2.369.205.log', outcome: 'exited', code: 1, ms: 412, stdout: '', stderr: 'The system cannot find the file specified: C:\\Users\\ada\\.vibespace\\device@linux-box-hub\\state\\upgrade-2.369.206-from-2.369.205.log ' + 'y'.repeat(180) + '\n', cut: {}, interpreter: 'cmd.exe' },
  { id: 'r4', at: AT - 7293000, name: '生活方式助手', sessionKey: 's2', cmd: 'push /var/tmp/ada/h3d-20261003-194702-1255294/up.tgz → E:\\house3d\\incoming\\h3d-20261003-194702-1255294\\up.tgz', outcome: 'exited', code: 0, ms: 0, transfer: { verb: 'push', bytes: 48211, verified: 'size', local: '/var/tmp/ada/h3d-20261003-194702-1255294/up.tgz', remote: 'E:\\house3d\\incoming\\h3d-20261003-194702-1255294\\up.tgz' } },
];
const FIX = { machine: { name: 'WIN-DESK1', platform: 'win32', interpreter: 'cmd.exe' }, runs: RUNS };
const HOST = 'h-erdf-fixture';
console.log(`fixtures: the encoded command ${ENC.length} chars, stdout ${STDOUT.split('\n').length - 1} lines of ≤ 200`);

const OPEN_JS = (all) => `(async () => {
  const of = window.fetch; const FIX = ${JSON.stringify(FIX)};
  window.fetch = (u, o) => String(u).includes('/api/hosts/${HOST}/exit-runs') ? Promise.resolve(new Response(JSON.stringify(FIX), { status: 200, headers: { 'Content-Type': 'application/json' } })) : of(u, o);
  const r = await globalThis.__vsOpenExitRuns({ hostId: '${HOST}', name: 'WIN-DESK1' });
  window.fetch = of;
  const rows = [...document.querySelectorAll('#exit-runs-dialog .exit-runs-row')];
  rows.forEach((x, i) => { x.open = ${all ? 'true' : 'i === 0 || i === 1'}; });
  return rows.length;
})()`;
// THE CENSUS — compact tuples (a check's detail is cut at ~500 chars)
const CENSUS_JS = `(() => {
  const ov = document.getElementById('exit-runs-dialog'); const d = ov && ov.querySelector('.dialog'); const body = d && d.querySelector('.exit-runs-body');
  if (!body) return { ok: false, why: 'no dialog' };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const dr = d.getBoundingClientRect(), br = body.getBoundingClientRect();
  // the limit = the body's client box, never wider than the dialog's own (the 2.369.207 body was 640 inside a 440 dialog)
  const lim = Math.min(br.left + body.clientLeft + body.clientWidth, dr.left + d.clientLeft + d.clientWidth) + 1;
  const bodyIn = br.right <= dr.left + d.clientLeft + d.clientWidth + 1;
  const inScroller = (n) => { for (let p = n.parentElement; p && p !== body; p = p.parentElement) { if (p.tagName === 'PRE' && /auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 1) return p; } return null; };
  const name = (e) => (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName.toLowerCase());
  const past = [];
  for (const e of body.querySelectorAll('*')) { if (!e.getClientRects().length || inScroller(e)) continue; const r = e.getBoundingClientRect(); if (r.width && r.right > lim) past.push(name(e) + ':' + Math.round(r.right - lim)); }
  const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let tn;
  while ((tn = tw.nextNode())) { if (!tn.textContent.trim() || inScroller(tn)) continue; const rg = document.createRange(); rg.selectNodeContents(tn); for (const r of rg.getClientRects()) if (r.width && r.right > lim) { past.push('text' + name(tn.parentElement) + ':' + Math.round(r.right - lim)); break; } }
  const pres = [...body.querySelectorAll('pre')].filter((p) => p.getClientRects().length).map((p) => { const cs = getComputedStyle(p); const wraps = /pre-wrap|break-spaces/.test(cs.whiteSpace) && p.scrollWidth <= p.clientWidth + 1; const scrolls = /auto|scroll/.test(cs.overflowX) && cs.whiteSpace === 'pre'; return { c: name(p), wraps, scrolls }; });
  const badPre = pres.filter((p) => !p.wraps && !p.scrolls).map((p) => p.c);
  const note = body.querySelector('.exit-runs-note'); const nr = note.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(note);
  const noteWhole = note.scrollWidth <= note.clientWidth + 1 && [...rg.getClientRects()].every((r) => r.left >= br.left - 1 && r.right <= lim) && nr.top >= br.top - 1 && nr.bottom <= br.bottom + 1 && body.scrollTop === 0;
  const stacked = [], cmdLines = [], transfer = [];
  for (const row of body.querySelectorAll('.exit-runs-row')) {
    const w = row.querySelector('.exit-runs-when').getBoundingClientRect(), o = row.querySelector('.exit-runs-who').getBoundingClientRect(), m = row.querySelector('.exit-runs-main').getBoundingClientRect(), c = row.querySelector('.exit-runs-cmd');
    stacked.push(Math.abs(w.top - o.top) <= 4 ? (m.top >= w.bottom - 1 ? 'S' : (Math.abs(m.top - w.top) <= 4 && m.left >= o.right - 1 ? 'G' : '?')) : 'x');
    const fs = parseFloat(getComputedStyle(c).fontSize); cmdLines.push(Math.round(c.getBoundingClientRect().height / fs * 10) / 10);
    if (row.querySelector('.exit-runs-out .exit-runs-pre') && /pulled|pushed|已拉取|已推送|→/.test(row.querySelector('.exit-runs-out').textContent) && row.dataset.key && /r2|r4/.test(row.dataset.key)) {
      const v = [...row.querySelector('.exit-runs-verdict').getClientRects()].pop(), ms = row.querySelector('.exit-runs-ms'), mr = [...ms.getClientRects()];
      transfer.push({ same: mr.length === 1 && Math.abs(mr[0].top - v.top) <= 2, ms: ms.textContent, v: row.querySelector('.exit-runs-verdict').textContent });
    }
  }
  const inView = dr.left >= -1 && dr.right <= vw + 1 && dr.top >= -1 && dr.bottom <= vh + 1;
  const sideways = body.scrollWidth - body.clientWidth;
  return { ok: inView && bodyIn && sideways <= 1 && !past.length && !badPre.length && noteWhole, inView, bodyIn, dlg: [Math.round(dr.left), Math.round(dr.right), Math.round(dr.width)], vw, sideways, past: past.slice(0, 8), nPast: past.length, pres: pres.length, badPre: badPre.slice(0, 6), noteWhole, stacked: stacked.join(''), cmdLines, transfer };
})()`;

const M = mutantCopies('erdf', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/lib/exit-runs-dialog.js'), 'utf8');
const HOOKED = SRC + '\nglobalThis.__vsOpenExitRuns = (h) => openExitRunsDialog(globalThis.app, h); // test hook (scratch copy only)\n';
const W = await bootWorld('erdf');
let code = 1;
try {
  const bundleText = await buildPatchedBundle(M, 'src/lib/exit-runs-dialog.js', HOOKED, 'hook');
  const SHOTS = process.env.ERDF_SHOTS || '';
  let first = true;
  for (const lang of ['zh', 'en']) for (const [width, height] of [[390, 844], [768, 1024], [1280, 820]]) {
    const tag = `${width}-${lang}`;
    console.log(`── ${tag}`);
    const P = await W.openPage({ width, height, lang, mobile: width < 500, first, bundleText }); first = false;
    const n = await P.evalJs(OPEN_JS(true));
    await sleep(300);
    const head = await P.evalJs(`document.querySelector('#exit-runs-dialog .exit-runs-row .exit-runs-cmd')?.textContent || ''`);
    ok(n === 4 && head.startsWith('PowerShell: [Console]::OutputEncoding'), `${tag}: the list drawn (${n} rows), the encoded row reads as its script (${head.slice(0, 40)}…)`);
    const c = await P.evalJs(CENSUS_JS);
    ok(c.ok, `${tag} ①②: dialog ${c.dlg} in ${c.vw} px (${c.inView}), body inside it ${c.bodyIn}, sideways ${c.sideways}, past the body ${c.nPast} ${JSON.stringify(c.past)}, ${c.pres} pres, not wrapping/scrolling ${JSON.stringify(c.badPre)}, intro whole ${c.noteWhole}`);
    const wantStack = width < 600;
    ok(c.stacked === (wantStack ? 'SSSS' : 'GGGG') && c.cmdLines.every((h) => h < 2 * 1.75), `${tag} ③: rows ${c.stacked} (${wantStack ? 'S = time + who over the command' : 'G = time · who · command'}), command heights ${c.cmdLines.join('/')} em (≤ 2 lines)`);
    ok(c.transfer.length === 2 && c.transfer.every((x) => x.same && x.ms === '<0.1 s'), `${tag} ④: transfer outcome lines ${JSON.stringify(c.transfer.map((x) => [x.v, x.ms, x.same]))}`);
    // ② no-wrap: the stdout toggle → the pre keeps its lines and scrolls INSIDE itself; the census still holds
    const clicked = await P.realClick(`(document.querySelector('#exit-runs-dialog .exit-runs-row .exit-runs-head .exit-runs-wrap'))`);
    const nw = await P.evalJs(`(() => { const p = document.querySelector('#exit-runs-dialog .exit-runs-row .exit-runs-out > pre.exit-runs-pre'); const cs = getComputedStyle(p); return { ws: cs.whiteSpace, ox: cs.overflowX, inner: p.scrollWidth, outer: p.clientWidth, btn: document.querySelector('#exit-runs-dialog .exit-runs-head .exit-runs-wrap').textContent }; })()`);
    const c2 = await P.evalJs(CENSUS_JS);
    ok(clicked && nw.ws === 'pre' && /auto|scroll/.test(nw.ox) && nw.inner > nw.outer + 50 && c2.ok, `${tag} ②: Wrap off (${nw.btn}) → stdout ${nw.ws}/${nw.ox}, ${nw.inner} inside ${nw.outer}; census still ${c2.ok} (past ${c2.nPast}, sideways ${c2.sideways})`);
    await P.realClick(`(document.querySelector('#exit-runs-dialog .exit-runs-row .exit-runs-head .exit-runs-wrap'))`);
    if (SHOTS && lang === 'zh') {
      await P.evalJs(`document.querySelector('#exit-runs-dialog .dialog-close')?.click(); true`);
      await P.evalJs(OPEN_JS(false)); await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await sleep(400);
      const s = await P.cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `after-${width}-zh.png`), Buffer.from(s.data, 'base64'));
    }
    ok(!P.errors.length, `${tag}: no page error ${JSON.stringify(P.errors.slice(0, 2))}`);
    await P.cdp('Page.close').catch(() => {});
  }
  // ⑤ CONTROL: the 2.369.207 CSS — the 440 px .dialog, the body's 640 px min-width — goes red at 1280
  console.log('── ⑤ control');
  const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const NEW_DLG = '.dialog.exit-runs-dialog { width: 960px; max-width: calc((100vw - 32px) / var(--ui-scale, 1)); }\n';
  const NEW_BODY = '.exit-runs-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-height: 70vh; overflow-x: hidden; overflow-y: auto; }';
  const OLD = CSS.replace(NEW_DLG, '').replace(NEW_BODY, '.exit-runs-body { display: flex; flex-direction: column; gap: 6px; min-width: min(640px, 92vw); max-height: 70vh; overflow: auto; }');
  ok(CSS.includes(NEW_DLG) && CSS.includes(NEW_BODY) && OLD !== CSS, 'the control patch applies');
  const P = await W.openPage({ width: 1280, height: 820, lang: 'en', bundleText });
  ok(await P.evalJs(swapStyleJs(OLD)), 'the old CSS swapped in');
  await P.evalJs(OPEN_JS(true)); await sleep(300);
  const cc = await P.evalJs(CENSUS_JS);
  ok(!cc.ok && !cc.bodyIn && cc.nPast > 0 && !cc.noteWhole, `CONTROL: the 2.369.207 CSS → ① red (dialog ${cc.dlg}, body inside it ${cc.bodyIn}, sideways ${cc.sideways}, past ${cc.nPast} ${JSON.stringify(cc.past.slice(0, 3))}, intro whole ${cc.noteWhole})`);
  await P.cdp('Page.close').catch(() => {});
  code = fail ? 1 : 0;
} catch (e) {
  fail++; console.log('  ✗ threw: ' + (e && e.stack || e));
} finally {
  W.cleanup();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : code);
