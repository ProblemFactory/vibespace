#!/usr/bin/env node
// LANE PHONE-CHIP (B-e5ff) — the fast gate. The phone's billing pill is WHOLE or it FOLDS, never cut (lane G's rule):
//   ① PURE src/lib/title-chips.js: `billingPillForms` (full = every word; compact = the glyph + a WHOLE first word,
//      or none; icon = the glyph) over zh / ja / en names — no form ever carries an ellipsis or a partial word;
//   ② `pillMode` (= `chipMode` with no title) over names × slot widths × UI scale 1 / 1.25 — the widest form that fits;
//   ③ the CSS census: neither phone pill (.chat-status-billing, .mobile-win-billing) caps its width or ellipsizes,
//      and the three forms are shown by `data-mode`; CONTROL: the pre-fix stylesheet (git show b924041f) fails it;
//   ④ wiring: the status bar fits after every render (and on resize) by `pillMode`; the switcher row by `chipMode`;
//      both draw `billingPillHtml` and say the full words in title + aria-label.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TC = await import(path.join(REPO, 'src/lib/title-chips.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('① the three forms, never a cut');
const CASES = [
  { lang: 'zh', a: { kind: 'pooled', name: '全部', target: 'Beta Max' }, full: '⣿ 全部 → Beta Max', compact: '⣿ → Beta' },
  { lang: 'zh-cjk', a: { kind: 'pooled', name: '全部', target: '测试团队' }, full: '⣿ 全部 → 测试团队', compact: '⣿ → 测试团队' },
  { lang: 'ja', a: { kind: 'pooled', name: 'すべて', target: 'ベータ チーム' }, full: '⣿ すべて → ベータ チーム', compact: '⣿ → ベータ' },
  { lang: 'en', a: { kind: 'pooled', name: 'Everyone', target: 'Northwind Max' }, full: '⣿ Everyone → Northwind Max', compact: null },
  { lang: 'en-nomember', a: { kind: 'pooled', name: 'Team pool', target: '' }, full: '⣿ Team pool', compact: '⣿ Team' },
  { lang: 'sub', a: { kind: 'subscription', name: 'Personal Max' }, full: 'Personal Max', compact: 'Personal' },
  { lang: 'api', a: { kind: 'api', name: 'Console' }, full: 'Console', compact: null },
  { lang: 'unknown', a: { kind: 'unknown' }, full: '?', compact: null },
];
for (const c of CASES) {
  const f = TC.billingPillForms(c.a);
  const noCut = [f.full, f.compact || '', f.icon || ''].every((x) => !/…/.test(x));
  const wholeWord = !f.compact || (c.a.target || c.a.name).split(' ').includes(f.compact.replace(/^⣿( → | )/, ''));
  ok(f.full === c.full && f.compact === c.compact && noCut && wholeWord && f.tip === f.full, `${c.lang}: full "${f.full}" · compact ${JSON.stringify(f.compact)} · icon ${f.iconKind} — whole words only`, JSON.stringify(f));
}
ok(TC.shortWord('Northwindcorp') === null && TC.shortWord('Beta Max') === 'Beta' && TC.shortWord('测试团队') === '测试团队', 'shortWord: a first word too long to stand alone is none, never a cut');
{ // verify r1 ③: the compact pill's word for a CJK name (no spaces) is the WHOLE run when ≤ MEMBER_SHORT_MAX (8) code points,
  // else there is NO compact form (full → the glyph) — never "the first 6 characters", which would split a word
  const cjk = TC.billingPillForms({ kind: 'pooled', name: '全部', target: '北京研发中心第二工程团队' });
  const ja = TC.billingPillForms({ kind: 'pooled', name: 'すべてのアカウント', target: '' });
  ok(TC.MEMBER_SHORT_MAX === 8 && cjk.compact === null && cjk.full === '⣿ 全部 → 北京研发中心第二工程团队' && ja.compact === null && TC.shortWord('研发团队') === '研发团队' && TC.shortWord('北京研发中心第二') === '北京研发中心第二' && TC.shortWord('北京研发中心第二工') === null,
    'CJK (no spaces): the whole run ≤ 8 code points or no compact form — a 12-character member folds full → glyph, never a 6-character cut', JSON.stringify({ cjk, ja }));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const html = TC.billingPillHtml(TC.billingPillForms({ kind: 'pooled', name: '<b>x</b>', target: 'Beta Max' }), esc);
ok(/^<span class="pill-full">⣿ &lt;b&gt;x&lt;\/b&gt; → Beta Max<\/span><span class="pill-compact">⣿ → Beta<\/span><span class="pill-icon">⣿<\/span>$/.test(html), 'billingPillHtml: three spans, every word escaped', html);
ok(/<svg/.test(TC.billingPillHtml(TC.billingPillForms({ kind: 'api', name: 'Console' }), esc)) && !/pill-compact/.test(TC.billingPillHtml(TC.billingPillForms({ kind: 'api', name: 'Console' }), esc)), 'an API pill folds to the key glyph (an SVG, never an emoji); no compact form when the name is one word');

console.log('② the widest form that fits (pillMode = chipMode with no title)');
// a width model: CJK ≈ 1 em, other ≈ 0.6 em at the chip's 10 px, × the UI scale; + 14 px of padding / border
const widthOf = (s, scale) => (Array.from(s || '').reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 10 : 6), 0) + 14) * scale;
for (const scale of [1, 1.25]) for (const c of CASES.filter((x) => x.a.kind === 'pooled')) for (const slot of [40, 80, 120, 200, 340]) {
  const f = TC.billingPillForms(c.a);
  const fullPx = widthOf(f.full, scale), compactPx = f.compact ? widthOf(f.compact, scale) : Infinity;
  const want = slot + 0.5 >= fullPx ? 'full' : slot + 0.5 >= compactPx ? 'compact' : 'icon';
  const got = TC.pillMode({ slotPx: slot, fullPx, compactPx });
  if (got !== want) ok(false, `${c.lang} × ${slot} px × ${scale}: ${got} (want ${want})`, JSON.stringify({ fullPx, compactPx }));
  else pass++;
}
ok(true, `the table: 4 pooled names × 5 slot widths × UI scale 1 / 1.25 — every cell the widest form that fits (${pass} checks so far)`);
ok(TC.pillMode({ slotPx: NaN, fullPx: 90, compactPx: 50 }) === 'full', 'an unmeasured bar keeps the full form (it decides nothing on such a pass)');

console.log('③ the CSS: a pill never caps its width, never ellipsizes');
function cssCensus(css) {
  const bad = [];
  for (const sel of ['.chat-status-billing', '.mobile-win-billing']) {
    const m = new RegExp(`(^|\\n)${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css);
    if (!m) { bad.push(`${sel}: no rule`); continue; }
    if (/max-width|text-overflow:\s*ellipsis/.test(m[2])) bad.push(`${sel}: caps its width / ellipsizes (${m[2].replace(/\s+/g, ' ').trim()})`);
    if (!css.includes(`${sel}[data-mode="compact"] .pill-compact`) || !css.includes(`${sel}[data-mode="icon"] .pill-icon`)) bad.push(`${sel}: the three forms are not shown by data-mode`);
  }
  return bad;
}
{ const bad = cssCensus(read('public/style.css')); ok(!bad.length, 'public/style.css: both phone pills are whole or folded (no max-width, no ellipsis; forms by data-mode)', bad.join('; ')); }
try {
  const pre = execFileSync('git', ['-C', REPO, 'show', 'b924041f:public/style.css'], { encoding: 'utf8' });
  const bad = cssCensus(pre);
  ok(bad.some((b) => /chat-status-billing: caps its width/.test(b)), 'CONTROL: the pre-fix stylesheet FAILS the census (the 90 px cap + ellipsis that cut "⣿ 全部 → Beta Ma")', bad.join('; '));
} catch (e) { console.log(`  SKIP CONTROL: the pre-fix bytes (b924041f) are not readable here — ${String(e.message).split('\n')[0]}`); }

console.log('④ wiring');
{
  const sb = read('src/lib/chat-status-bar.js'), mn = read('src/lib/mobile-nav.js');
  ok(/this\._reconcile\(chips\);\n    this\._fitBilling\(\);/.test(sb) && /const mode = pillMode\(\{ slotPx, fullPx: this\._billingW\.full, compactPx: this\._billingW\.compact \}\);/.test(sb) && /new ResizeObserver\(\(\) => this\._fitBilling\(\)\)/.test(sb), 'the status bar fits its pill after every render and on every width change, by pillMode');
  ok(/const k = bar\.offsetWidth \? bar\.getBoundingClientRect\(\)\.width \/ bar\.offsetWidth : 1;/.test(sb) && /paddingRight\) \|\| 0\)\) \* k;/.test(sb) && /Math\.abs\(this\._billingW\.k - k\) > 1e-3/.test(sb), 'ONE unit under the UI scale (verify r1): the slot converted by the bar\'s zoom k, the widths cached per k');
  ok(/billingPillHtml\(forms, escHtml\), \{ attrs: \{ 'aria-label': forms\.tip \} \}\);/.test(sb) && /forms\.tip \+ ' — ' \+ tip/.test(sb), 'the status bar draws the three forms; title + aria-label carry every word');
  ok(/billChip\.innerHTML = billingPillHtml\(forms, escHtml\);/.test(mn) && /billChip\.setAttribute\('aria-label', forms\.tip\);/.test(mn) && /requestAnimationFrame\(\(\) => fitRowPill\(label, billChip\)\)/.test(mn) && /chip\.dataset\.mode = chipMode\(\{ availablePx: label\.offsetWidth \+ w\.full, titlePx, titleMinPx/.test(mn), 'the switcher row draws the three forms and fits by chipMode beside its title');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
