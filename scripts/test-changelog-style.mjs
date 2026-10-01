#!/usr/bin/env node
// THE USER CHANGELOG'S STYLE GATE (fast, in-process). The owner's 2026-09-29
// ask: the changelog a user reads is written for the person using VibeSpace,
// in the interface's language, not the engineers' record it had become
// (headings of hundreds of characters, lane / round / suite names, quotes of
// messages). The rules live in docs/changelog-style.md; their executable form
// is the PURE src/changelog-style.js; this suite runs it over the real files:
//   ① CHANGELOG.md / CHANGELOG.zh.md / CHANGELOG.ja.md lint clean WHOLE — the
//      title + one intro line, `## <version> — <YYYY-MM-DD>` headings newest
//      first with non-increasing dates, known sections in order, one-line
//      bullets under the length limit (en 160 / zh 90 / ja 90 code points),
//      no engineering words, no CJK in the English file, the exact
//      Maintenance line;
//   ② the translations have the English file's structure (same versions,
//      dates, sections, bullet counts);
//   ③ every version from 2.369.198 on has its section in the engineering log
//      (docs/changelog-engineering.md) — each release writes both;
//   ④ the newest version is package.json's — or the NEXT patch: a builder's
//      branch writes the release entry before the integrator bumps
//      package.json, and the bump makes them equal;
//   ⑤ controls: planted copies of the real files (written into this run's
//      scratch dir, never the checkout) each go RED by the rule they break,
//      and patched copies of the module without that rule let the same plant
//      through — so every rule is what catches its plant.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t0 = Date.now();

const S = require(path.join(REPO, 'src/changelog-style.js'));
const FILES = { en: 'CHANGELOG.md', zh: 'CHANGELOG.zh.md', ja: 'CHANGELOG.ja.md' };
const TEXT = {
  en: fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'),
  zh: fs.readFileSync(path.join(REPO, 'CHANGELOG.zh.md'), 'utf8'),
  ja: fs.readFileSync(path.join(REPO, 'CHANGELOG.ja.md'), 'utf8'),
};
const LOG = fs.readFileSync(path.join(REPO, 'docs/changelog-engineering.md'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const NEXT_PATCH = PKG.replace(/\d+$/, (n) => String(Number(n) + 1));
const newestAllowed = (v) => v === PKG || v === NEXT_PATCH;
const rulesOf = (problems) => [...new Set(problems.map((p) => p.rule))];
const show = (problems) => problems.slice(0, 6).map((p) => p.message);

console.log('— ① the three files lint clean, whole');
for (const lang of S.LANGS) {
  const vs = S.versionsOf(TEXT[lang]);
  const bullets = (TEXT[lang].match(/^- /gm) || []).length;
  const problems = S.lint(TEXT[lang], lang);
  ok(`${FILES[lang]} (${lang}): ${vs.length} versions, ${bullets} bullets, 0 problems`, problems.length === 0 && vs.length > 100, show(problems));
  ok(`${FILES[lang]} starts with "${S.TITLE[lang]}" and one intro line that points at the engineering log`,
    TEXT[lang].split('\n')[0] === S.TITLE[lang] && /docs\/changelog-engineering\.md/.test(TEXT[lang].split('\n')[2] || ''), TEXT[lang].split('\n').slice(0, 3));
}

console.log('— ② the translations have the English structure');
for (const lang of ['zh', 'ja']) {
  const problems = S.parity(TEXT.en, TEXT[lang], lang);
  ok(`${FILES[lang]} ≡ ${FILES.en} in versions, dates, sections and bullet counts`, problems.length === 0, show(problems));
}

console.log('— ③ every version from ' + S.ENGINEERING_LOG_SINCE + ' on has its engineering section');
{
  const gaps = S.engineeringGaps(TEXT.en, LOG);
  const since = S.versionsOf(TEXT.en).filter((v) => S.compareVersions(v.version, S.ENGINEERING_LOG_SINCE) >= 0).map((v) => v.version);
  ok(`${since.length} version(s) from ${S.ENGINEERING_LOG_SINCE} on (${since.join(', ')}) — each heads a section in docs/changelog-engineering.md`, since.length >= 1 && gaps.length === 0, gaps);
  const all = S.versionsOf(TEXT.en).map((v) => v.version);
  const logged = S.headedVersions(LOG);
  const unlogged = all.filter((v) => !logged.has(v));
  ok('and the engineering log still holds every older version verbatim (the user file names no version the log lacks)', unlogged.length === 0, unlogged.slice(0, 10));
}

console.log('— ④ the newest version is package.json\'s (or the release being cut)');
{
  const newest = S.versionsOf(TEXT.en)[0];
  // A builder's branch writes the release's entry before the integrator
  // bumps package.json (its commit is the bump); from then on they are equal.
  ok(`the newest entry ${newest && newest.version} is package.json's ${PKG} or the next patch ${NEXT_PATCH}`, !!newest && newestAllowed(newest.version), newest);
  for (const lang of ['zh', 'ja']) ok(`${FILES[lang]}'s newest entry is the same version`, S.versionsOf(TEXT[lang])[0]?.version === newest?.version);
}

console.log('— ⑤ controls: every rule catches its plant');
const M = mutantCopies('chlog', REPO);
const planted = [];
const plant = (name, text) => { const f = path.join(M.dir, name); fs.writeFileSync(f, text); planted.push(f); return fs.readFileSync(f, 'utf8'); };
const firstBullet = (text) => { const m = /^- (.*)$/m.exec(text); return m[1]; };
const replaceOnce = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error('plant anchor missing: ' + from.slice(0, 60)); return text.slice(0, i) + to + text.slice(i + from.length); };
{
  const en = TEXT.en, b0 = firstBullet(en);
  const cases = [
    ['a lane name', 'lane.en.md', replaceOnce(en, `- ${b0}`, `- ${b0.replace(/\.$/, '')} (lane-changelog).`), 'en', 'banned:lane'],
    ['a CJK character in the English file', 'cjk.en.md', replaceOnce(en, `- ${b0}`, `- ${b0.replace(/\.$/, '')}（new）.`), 'en', 'banned:cjk'],
    ['a quote of a message', 'quote.en.md', replaceOnce(en, `- ${b0}`, `- ${b0.replace(/\.$/, '')}, as asked: "\u8bf7\u4fee\u4e00\u4e0b".`), 'en', 'banned:cjk'],
    ['"the owner"', 'owner.en.md', replaceOnce(en, `- ${b0}`, `- ${b0.replace(/\.$/, '')}, as the owner asked.`), 'en', 'banned:owner'],
    ['a suite name', 'suite.en.md', replaceOnce(en, `- ${b0}`, `- ${b0.replace(/\.$/, '')} (test-changelog-style).`), 'en', 'banned:test-suite name'],
    ['an English bullet of 161 characters', 'long.en.md', replaceOnce(en, `- ${b0}`, `- ${'A'.repeat(160)}.`), 'en', 'length'],
    ['a Chinese bullet of 91 characters', 'long.zh.md', replaceOnce(TEXT.zh, `- ${firstBullet(TEXT.zh)}`, `- ${'改'.repeat(90)}。`), 'zh', 'length'],
  ];
  for (const [what, name, text, lang, rule] of cases) {
    const p = S.lint(plant(name, text), lang);
    ok(`CONTROL ${what}: RED by "${rule}"`, rulesOf(p).includes(rule), rulesOf(p));
  }
  // An out-of-order section: the first entry with Added and Fixed gets Fixed first.
  {
    const m = /^(### Added\n(?:- .*\n)+)\n(### Changed\n(?:- .*\n)+\n)?(### Fixed\n(?:- .*\n)+)/m.exec(en);
    const swapped = en.slice(0, m.index) + m[3] + '\n' + (m[2] || '') + m[1] + en.slice(m.index + m[0].length);
    const p = S.lint(plant('section-order.en.md', swapped), 'en');
    ok('CONTROL an out-of-order section (Fixed above Added): RED by "section-order"', rulesOf(p).includes('section-order'), rulesOf(p));
  }
  // An out-of-order version: the second and third entries swap places.
  {
    const blocks = en.split(/\n(?=## )/);
    const [head, v1, v2, v3, ...rest] = blocks;
    const p = S.lint(plant('version-order.en.md', [head, v1, v3, v2, ...rest].join('\n')), 'en');
    ok('CONTROL two versions out of order: RED by "order"', rulesOf(p).includes('order'), rulesOf(p));
  }
  // A heading without a date (the old style).
  {
    const v = S.versionsOf(en)[1];
    const p = S.lint(plant('undated.en.md', replaceOnce(en, `## ${v.version} — ${v.date}\n`, `## ${v.version} — a summary of the release\n`)), 'en');
    ok('CONTROL an undated heading (the old style): RED by "heading"', rulesOf(p).includes('heading'), rulesOf(p));
  }
  // A parity break: one bullet dropped from the Chinese file.
  {
    const b = `- ${firstBullet(TEXT.zh)}\n`;
    const p = S.parity(en, plant('drop.zh.md', replaceOnce(TEXT.zh, b, '')), 'zh');
    ok('CONTROL one bullet dropped in zh: parity RED by "sections"', rulesOf(p).includes('sections'), p.slice(0, 2));
  }
  // A version missing from the engineering log.
  {
    const v = '2.369.198';
    const i = LOG.search(new RegExp(`^## ${v.replace(/\./g, '\\.')}(?![\\d.])`, 'm'));
    const cut = LOG.slice(0, i) + '## 0.0.0 — (heading removed by the control)' + LOG.slice(i + `## ${v}`.length);
    const gaps = S.engineeringGaps(en, plant('log-missing.md', cut));
    ok(`CONTROL ${v}'s section missing from the engineering log: RED naming ${v}`, i >= 0 && gaps.includes(v), gaps);
  }
  // The newest version ahead of package.json by more than one patch.
  {
    const far = PKG.replace(/\d+$/, (n) => String(Number(n) + 2));
    const newest = S.versionsOf(en)[0];
    const bumped = S.versionsOf(plant('far.en.md', replaceOnce(en, `## ${newest.version} —`, `## ${far} —`)))[0].version;
    ok(`CONTROL a newest entry of ${far} (package.json ${PKG}) is refused by ④'s rule`, bumped === far && !newestAllowed(bumped));
  }
}
{
  // Patched copies of the module, each without ONE rule: the plant that
  // rule caught goes through — the rule, not something else, is the catch.
  const src = fs.readFileSync(path.join(REPO, 'src/changelog-style.js'), 'utf8');
  const cut = (from, to) => { if (!src.includes(from)) throw new Error('module anchor missing: ' + from); return src.replace(from, to); };
  const noBanned = M.load('src/changelog-style.js', cut('for (const [re, rule] of BANNED) if', 'for (const [re, rule] of []) if'), 'no-banned');
  const noCjk = M.load('src/changelog-style.js', cut("if (lang === 'en' && CJK.test(b))", 'if (false)'), 'no-cjk');
  const noLen = M.load('src/changelog-style.js', cut('if (len > max)', 'if (false)'), 'no-length');
  const noCount = M.load('src/changelog-style.js', src.split('.map((s) => `${s.s}:${s.n}`)').join('.map((s) => `${s.s}`)'), 'no-count');
  const noOrder = M.load('src/changelog-style.js', cut('if (secs.indexOf(s) <= last)', 'if (false)'), 'no-order');
  const read = (n) => fs.readFileSync(path.join(M.dir, n), 'utf8');
  ok('PATCHED COPY without the banned table: the lane name goes through', !rulesOf(noBanned.lint(read('lane.en.md'), 'en')).length);
  ok('PATCHED COPY without the CJK rule: the quoted message goes through', !rulesOf(noCjk.lint(read('quote.en.md'), 'en')).length);
  ok('PATCHED COPY without the length limit: the 161-character bullet goes through', !rulesOf(noLen.lint(read('long.en.md'), 'en')).length);
  ok('PATCHED COPY without the section order: Fixed above Added goes through', !rulesOf(noOrder.lint(read('section-order.en.md'), 'en')).length);
  ok('PATCHED COPY that compares sections but not bullet counts: the dropped zh bullet goes through', noCount.parity(TEXT.en, read('drop.zh.md'), 'zh').length === 0);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: 'patched copies: ' })) ok(r.name, r.pass, r.detail);
  ok(`the ${planted.length} planted files are in this run's scratch dir, never the checkout`, planted.length >= 12 && planted.every((f) => f.startsWith(M.dir + path.sep) && fs.existsSync(f)));
}

console.log('— ⑥ GET /api/changelog-diff serves the device\'s language, entry by entry (the real route, in-process, a fixture canonical)');
{
  // The canonical repo as a directory: en lists 9.9.3 / 9.9.2 / 9.9.1, zh has
  // 9.9.3 and 9.9.1 only (9.9.2 not translated), ja has no file at all (an
  // older canonical). The running version is 9.9.1.
  const fx = path.join(M.dir, 'canonical'), root = path.join(M.dir, 'root');
  fs.mkdirSync(fx, { recursive: true }); fs.mkdirSync(root, { recursive: true });
  const entry = (v, sec, b) => `## ${v} — 2026-09-0${v.slice(-1)}\n\n### ${sec}\n- ${b}\n`;
  fs.writeFileSync(path.join(fx, 'CHANGELOG.md'), ['# Changelog\n\nintro\n', entry('9.9.3', 'Added', 'Three in English.'), entry('9.9.2', 'Fixed', 'Two in English.'), entry('9.9.1', 'Changed', 'One in English.')].join('\n'));
  fs.writeFileSync(path.join(fx, 'CHANGELOG.zh.md'), ['# 更新日志\n\n简介\n', entry('9.9.3', '新增', '第三版的中文。'), entry('9.9.1', '更改', '第一版的中文。')].join('\n'));
  fs.writeFileSync(path.join(fx, 'package.json'), JSON.stringify({ version: '9.9.3' }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '9.9.1' }));
  const prev = process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR;
  process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR = fx;
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  require(path.join(REPO, 'src/server/ops-routes.js')).create({ app, rootDir: root, wss: { clients: new Set() }, WS_OPEN: 1 });
  const call = (p, query) => new Promise((resolve) => { const res = { status() { return res; }, json: resolve }; routes['GET ' + p]({ query }, res); });
  const zh = await call('/api/changelog-diff', { lang: 'zh', fresh: '1' });
  ok('zh: the entries newer than the running 9.9.1 — 9.9.3 in Chinese, 9.9.2 (not in the zh file) in English, each saying so',
    zh.lang === 'zh' && same(zh.entries.map((e) => [e.version, e.lang]), [['9.9.3', 'zh'], ['9.9.2', 'en']]) && /第三版/.test(zh.entries[0].body) && /### 新增/.test(zh.entries[0].body) && /Two in English/.test(zh.entries[1].body), zh);
  const ja = await call('/api/changelog-diff', { lang: 'ja', fresh: '1' });
  ok('ja: the canonical has no CHANGELOG.ja.md (an older release) — every entry in English, lang "en"',
    ja.lang === 'ja' && same(ja.entries.map((e) => [e.version, e.lang]), [['9.9.3', 'en'], ['9.9.2', 'en']]), ja);
  const xx = await call('/api/changelog-diff', { lang: 'xx' });
  ok('an unknown lang is English', xx.lang === 'en' && xx.entries.every((e) => e.lang === 'en') && xx.entries.length === 2, xx);
  const none = await call('/api/changelog-diff', {});
  ok('no lang is English, keyed on `## <version>` as before (the dated heading is the entry head)', none.lang === 'en' && none.entries[0].head === '9.9.3 — 2026-09-03' && none.current === '9.9.1', none);
  // /api/version on the real checkout (its commit is read with one `git rev-parse`)
  const routes2 = {};
  require(path.join(REPO, 'src/server/ops-routes.js')).create({ app: { get: (p, h) => { routes2['GET ' + p] = h; }, post() {} }, rootDir: REPO, wss: { clients: new Set() }, WS_OPEN: 1 });
  const ver = await new Promise((resolve) => { const res = { status() { return res; }, json: resolve }; routes2['GET /api/version']({ query: { fresh: '1' } }, res); });
  ok('/api/version reads the fixture canonical too (latest 9.9.3) — the gate never reaches the network', ver.latest === '9.9.3' && ver.version === PKG, ver);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '9.9.3' }));
  delete require.cache[path.join(root, 'package.json')];
  const at = await call('/api/changelog-diff', { lang: 'zh' });
  ok('on the latest version: the running version\'s own entry, in Chinese', at.atLatest === true && same(at.entries.map((e) => [e.version, e.lang]), [['9.9.3', 'zh']]), at);
  if (prev === undefined) delete process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR; else process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR = prev;
}

console.log(`  (${Date.now() - t0} ms)`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
