#!/usr/bin/env node
// THE UPDATE DIALOG, SEEN (heavy, chrome): ⚙ → Update VibeSpace… on a
// throwaway server whose canonical repo is a local fixture
// (VIBESPACE_CHANGELOG_FIXTURE_DIR — the route never reaches the network).
// The fixture is built from the REAL user changelogs: their top entries are
// relabelled newer than the running version so the dialog lists four of them,
// the second-newest real entry replaced by the OLD-format engineering block
// (what an older canonical serves) — absent from the Chinese file, so a zh
// device gets it in English — and no Japanese file at all (an older release).
//   zh and en, at 1280 px (a mouse) and 390 px (touch): every entry is
//   `v<version> — <date>`, then its sections as small headings in the device's
//   language and its bullets as a DOM list (li count = the file's bullets),
//   the old-format entry as paragraphs + a list, never a <pre>; nothing but
//   div / h4 / ul / li / p inside the list (text, never markup from the file);
//   the dialog fits a phone. ja at 1280 px: every entry in English, lang="en".
// Screenshots for the human look go to the suite's shots dir (not removed).
// Run: node scripts/test-update-dialog.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('update-dialog-smoke');
const PROFILE = scratch('update-dialog-chrome');
const FIXTURE = scratch('update-dialog-canonical');
const SHOTS = scratch('update-dialog-shots');
fs.mkdirSync(FIXTURE, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fixture canonical ──
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const RUNNING = JSON.parse(read('package.json')).version;               // the scratch server runs the checkout's version
const bump = (v, n) => v.replace(/\d+$/, (x) => String(Number(x) + n));
const blocksOf = (text) => { const parts = text.split(/\n(?=## )/); return { head: parts[0], blocks: parts.slice(1) }; };
const versionOf = (block) => /^## (\d+\.\d+\.\d+)/.exec(block)[1];
const relabel = (block, v) => block.replace(/^## \d+\.\d+\.\d+/, `## ${v}`);
const USER = { en: blocksOf(read('CHANGELOG.md')), zh: blocksOf(read('CHANGELOG.zh.md')) };
const OLD = blocksOf(read('docs/changelog-engineering.md').slice(read('docs/changelog-engineering.md').indexOf('\n# Changelog\n')));
const oldBlock = OLD.blocks.find((b) => versionOf(b) === '2.369.198');       // the verbatim engineering entry (old format)
// Four entries newer than RUNNING: +4 = the newest real entry, +3 = the second, +2 = the OLD-format block, +1 = the third.
const NEW = [bump(RUNNING, 4), bump(RUNNING, 3), bump(RUNNING, 2), bump(RUNNING, 1)];
const idxOlder = (lang) => USER[lang].blocks.findIndex((b) => versionOf(b) === RUNNING); // the running version's entry and older stay as they are
const fixtureOf = (lang, withOld) => {
  const b = USER[lang].blocks;
  const top = [relabel(b[0], NEW[0]), relabel(b[1], NEW[1]), ...(withOld ? [relabel(oldBlock, NEW[2])] : []), relabel(b[2], NEW[3])];
  return [USER[lang].head, ...top, ...b.slice(idxOlder(lang))].join('\n');
};
fs.writeFileSync(path.join(FIXTURE, 'CHANGELOG.md'), fixtureOf('en', true));
fs.writeFileSync(path.join(FIXTURE, 'CHANGELOG.zh.md'), fixtureOf('zh', false));   // the old-format entry is not in zh ⇒ English there
fs.writeFileSync(path.join(FIXTURE, 'package.json'), JSON.stringify({ version: NEW[0] }));
// (no CHANGELOG.ja.md: a canonical from before the translations ⇒ every ja entry in English)
/** What the fixture says each shown entry holds: [{version, lang, sections:[name], bullets}] */
const expectOf = (lang) => {
  const src = fs.readFileSync(path.join(FIXTURE, 'CHANGELOG.md'), 'utf8');
  const zh = fs.readFileSync(path.join(FIXTURE, 'CHANGELOG.zh.md'), 'utf8');
  const byV = (text) => new Map(blocksOf(text).blocks.map((b) => [versionOf(b), b]));
  const en = byV(src), zm = byV(zh);
  return NEW.map((v) => {
    const b = lang === 'zh' && zm.has(v) ? zm.get(v) : en.get(v);
    const inLang = lang === 'zh' && zm.has(v) ? 'zh' : 'en';
    return { version: v, lang: inLang, date: (/^## \S+ — (\d{4}-\d{2}-\d{2})$/m.exec(b) || [])[1] || null,
      sections: (b.match(/^#{3,6} .+$/gm) || []).map((l) => l.replace(/^#+\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1')),
      bullets: (b.match(/^\s*[-*] .+$/gm) || []).length, old: v === NEW[2] };
  });
};
const SECTION_WORDS = { en: ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Maintenance'], zh: ['新增', '更改', '修复', '移除', '安全', '维护'] };

// ── throwaway server in a worktree (overlays the gate's ALREADY-BUILT public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: 'ignore' });
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(FIXTURE, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

let up = false;
for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
if (!up || !target) { console.error(`  ✗ boot: server up ${up}, chrome page ${!!target}`); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const until = async (expr, { timeout = 10000, step = 50 } = {}) => { const t0 = Date.now(); for (;;) { const v = await evalJs(expr); if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const URL = `http://127.0.0.1:${PORT}/`;
const POLL_APP = 'new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })';
const center = async (sel) => {
  const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!r) throw new Error('no element ' + sel);
  return r;
};
const click = async (sel) => {
  const c = await center(sel);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
};
const tap = async (sel) => {
  const c = await center(sel);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const POP = '.global-settings-popover';
const DLG = '#update-confirm-dialog';

let langScript = null, onboarded = false;
async function load({ lang, width, height, phone }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: phone ? 2 : 1, mobile: !!phone });
  await cdp('Emulation.setTouchEmulationEnabled', phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  if (!onboarded) { await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); onboarded = true; }
  if (langScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
  langScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` })).identifier;
  await cdp('Page.navigate', { url: URL });
  await sleep(1000);
  await evalJs(POLL_APP);
  await until(`!!(window.app && app._repoDir)`);
}

/** ⚙ → Update VibeSpace… the way a person does it, then the dialog's facts. */
async function openUpdate({ phone }) {
  await evalJs(`document.querySelector('${POP}')?.remove(); document.querySelector('${DLG}')?.remove(); true`);
  if (phone) await tap('#mobile-nav-gear'); else await click('#btn-global-settings');
  const found = await until(`(() => { const r = [...document.querySelectorAll('${POP} .gs-menu-item')].find((x) => x.textContent.includes(window.__updLabel)); if (!r) return false; r.id = 'upd-smoke-row'; return true; })()`);
  if (!found) throw new Error('no Update VibeSpace… row in the ⚙ menu');
  if (phone) await tap('#upd-smoke-row'); else await click('#upd-smoke-row');
  await until(`!!document.querySelector('${DLG} .ucl-list .ucl-entry, ${DLG} .ucl-list .empty-hint')`, { timeout: 15000 });
  return evalJs(`(() => {
    const d = document.querySelector('${DLG}');
    const box = d.querySelector('.dialog').getBoundingClientRect();   // the id is the overlay's (createModalShell)
    const entries = [...d.querySelectorAll('.ucl-list > .ucl-entry')].map((e) => ({
      lang: e.lang, ver: e.querySelector('.ucl-ver')?.textContent,
      sections: [...e.querySelectorAll(':scope > h4.ucl-sec')].map((h) => h.textContent),
      lists: e.querySelectorAll(':scope > ul.ucl-items').length,
      bullets: e.querySelectorAll(':scope > ul.ucl-items > li').length,
      paras: e.querySelectorAll(':scope > p.ucl-para').length,
      firstLi: e.querySelector('li')?.textContent || '',
    }));
    const tags = [...new Set([...d.querySelectorAll('.ucl-list *')].map((x) => x.tagName))];
    return { entries, tags, pre: d.querySelectorAll('pre').length, head: d.querySelector('.ucl-head')?.textContent,
      box: { l: box.left, r: box.right, w: box.width }, vw: innerWidth, uiLang: document.documentElement.lang || null };
  })()`);
}

const LABEL = { en: 'Update VibeSpace…', zh: '更新 VibeSpace…', ja: 'VibeSpace を更新…' };
try {
  await cdp('Page.enable');
  for (const [lang, width, height, phone] of [['zh', 1280, 800, false], ['zh', 390, 844, true], ['en', 1280, 800, false], ['en', 390, 844, true], ['ja', 1280, 800, false]]) {
    const leg = `${lang} ${width}px${phone ? ' (touch)' : ''}`;
    console.log(`update dialog — ${leg}`);
    await load({ lang, width, height, phone });
    await evalJs(`window.__updLabel = ${JSON.stringify(LABEL[lang])}; true`);
    const f = await openUpdate({ phone });
    await sleep(200);
    await shot(`update-dialog-${lang}-${width}.png`);
    const want = lang === 'ja' ? expectOf('en') : expectOf(lang);
    check(`${leg}: the head says v${RUNNING} → v${NEW[0]} and four entries are listed, newest first`, f.entries.length === 4 && new RegExp(`v${RUNNING.replace(/\./g, '\\.')}.*v${NEW[0].replace(/\./g, '\\.')}`).test(f.head || ''), { head: f.head, n: f.entries.length });
    check(`${leg}: each entry reads "v<version> — <date>" (the old-format one: "v<version>")`, f.entries.length === 4 && f.entries.every((e, i) => e.ver === (want[i].date ? `v${want[i].version} — ${want[i].date}` : `v${want[i].version}`)), f.entries.map((e) => e.ver));
    const wantLang = lang === 'ja' ? want.map(() => 'en') : want.map((w) => w.lang);
    check(`${leg}: each entry is in ${lang === 'en' ? 'English' : lang === 'zh' ? 'Chinese, the untranslated one in English' : 'English (the canonical has no ja file)'} (lang ${wantLang.join(',')})`, same(f.entries.map((e) => e.lang), wantLang), f.entries.map((e) => e.lang));
    for (let i = 0; i < want.length; i++) {
      const e = f.entries[i] || {}, w = want[i];
      if (w.old) {
        check(`${leg}: v${w.version} (an old-format entry) renders as paragraphs + a list — its ${w.bullets} lines under "- " as list items, its prose as <p>`, e.paras >= 1 && e.bullets === w.bullets && e.lists >= 1 && !/\*\*/.test(e.firstLi), e);
        continue;
      }
      const words = SECTION_WORDS[w.lang] || SECTION_WORDS.en;
      check(`${leg}: v${w.version} — its sections are small headings in ${w.lang} (${e.sections && e.sections.join(' / ')}), its ${w.bullets} bullets list items, no paragraph`,
        same(e.sections, w.sections) && e.sections.every((s) => words.includes(s)) && e.bullets === w.bullets && e.lists === w.sections.length && e.paras === 0, { got: e, want: w });
    }
    check(`${leg}: never a <pre>, and nothing but div / h4 / ul / li / p inside the list (${f.tags.join(',')})`, f.pre === 0 && f.tags.every((t) => ['DIV', 'H4', 'UL', 'LI', 'P'].includes(t)), f.tags);
    if (phone) check(`${leg}: the dialog fits the phone (${Math.round(f.box.l)}..${Math.round(f.box.r)} of ${f.vw})`, f.box.l >= 0 && f.box.r <= f.vw + 0.5, f.box);
  }
} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
console.log(`screenshots: ${SHOTS}`);
console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
