#!/usr/bin/env node
// THE AGENTS ROSTER REPAINTS FROM THE USAGE POLL (2026-09-18, owner: "agents 侧边栏
// 的内容不会实时更新，有时候我开着来看用量信息，结果一直不更新得重新打开一次才能看到最新的").
// The rail's Agents panel (and the Manage Agents dialog) painted every row's
// usage cell ONCE at render and again only on that row's ⟳ click; the usage
// meter's 8 s poll refreshed the taskbar pies and the popup only. FIX: every
// usage cell is STAMPED with where its numbers come from (data-usage-src /
// data-usage-key — the same decision the render made, as data), and
// `_repaintRosterUsage` (called from `_renderUsage`, i.e. every poll) resolves
// each cell's snapshot through the PURE `rosterUsageSnapshot`, replaces the
// html only when it changed, and re-derives the two-soonest highlight.
// Real methods over a fake document; the chrome smoke (test-roster-reset-eta)
// proves the end-to-end update on a rendered roster.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
const { rosterUsageSnapshot, installManageAgents } = MA;

console.log('— rosterUsageSnapshot (pure)');
{
  const maps = { accounts: { 'sub-a': { fiveHour: { utilization: 0.4 } } }, estimates: { 'sub-a': { fiveHour: 0.5 }, __global__: { fiveHour: 0.1 } }, rateLimit: { fiveHour: { utilization: 0.2 } }, hostOwn: { 'host-1': { fiveHour: { utilization: 0.3 } }, 'host-2': { sevenDay: {} } }, hostAccounts: { 'host-1:sub-a': { fiveHour: { utilization: 0.6 } } }, codex: { 'cxs-1': { fiveHour: { utilization: 0.7 } }, __global_codex__: { fiveHour: { utilization: 0.8 } } } };
  const s = (src, key) => rosterUsageSnapshot({ usageSrc: src, usageKey: key }, maps);
  ok('accounts: the named claude account + its estimate', s('accounts', 'sub-a')?.u.fiveHour.utilization === 0.4 && s('accounts', 'sub-a').est.fiveHour === 0.5);
  ok('global: the machine login + the __global__ estimate', s('global', '__global__')?.u.fiveHour.utilization === 0.2 && s('global', '__global__').est.fiveHour === 0.1);
  ok('host-own: a host login only when it carries a 5h snapshot (the render\'s own rule)', s('host-own', 'host-1')?.u.fiveHour.utilization === 0.3 && s('host-own', 'host-2') === null);
  ok('host-account: the host-held account', s('host-account', 'host-1:sub-a')?.u.fiveHour.utilization === 0.6);
  ok('codex: a named ChatGPT account and the machine codex login', s('codex', 'cxs-1')?.u.fiveHour.utilization === 0.7 && s('codex', '__global_codex__')?.u.fiveHour.utilization === 0.8);
  ok('a key the maps cannot answer ⇒ null (the cell keeps its last paint, never blanked)', s('accounts', 'sub-missing') === null && s('accounts', 'sub-a') !== null);
  ok('no stamp ⇒ null; unknown source ⇒ null', rosterUsageSnapshot({}, maps) === null && rosterUsageSnapshot(null, maps) === null && s('nope', 'sub-a') === null);
}

console.log('— _repaintRosterUsage over a fake document');
{
  class App { }
  installManageAgents(App, {});
  const app = new App();
  app._acctUsageHtml = (u, est) => `U:${JSON.stringify(u)}|E:${JSON.stringify(est ?? null)}`;
  const listA = { id: 'listA', marks: 0 };
  const mkCell = (src, key, list = listA) => ({ dataset: { usageSrc: src, usageKey: key }, innerHTML: '', title: 'kept', closest: (sel) => (sel === '.acct-list' ? list : null) });
  const cells = [mkCell('accounts', 'sub-a'), mkCell('accounts', 'sub-b'), mkCell('global', '__global__'), { dataset: {}, innerHTML: 'unstamped', closest: () => null }];
  globalThis.document = { querySelectorAll: (sel) => (sel === '.acct-usage-cell[data-usage-src]' ? cells.slice(0, 3) : []) };
  // markSoonRows runs over the list: give it the shape it reads
  listA.querySelectorAll = () => [];
  app._accountUsage = { 'sub-a': { fiveHour: { utilization: 0.42 } } }; app._usageEstimates = {}; app._rateLimit = { fiveHour: { utilization: 0.1 } };
  const n1 = app._repaintRosterUsage();
  ok('first poll paints the cells the maps can answer (A + the machine login), not the unanswerable one (B) nor the unstamped one', n1 === 2 && cells[0].innerHTML.includes('0.42') && cells[2].innerHTML.includes('0.1') && cells[1].innerHTML === '' && cells[3].innerHTML === 'unstamped', JSON.stringify(cells.map((c) => c.innerHTML)));
  ok('the cell\'s own tooltip (the ⟳ rung note) survives a repaint', cells[0].title === 'kept');
  const n2 = app._repaintRosterUsage();
  ok('an unchanged poll repaints NOTHING (no churn)', n2 === 0);
  app._accountUsage = { 'sub-a': { fiveHour: { utilization: 0.77 } }, 'sub-b': { fiveHour: { utilization: 0.05 } } };
  const n3 = app._repaintRosterUsage();
  ok('THE REPORT: fresh numbers land in place — A moves 42 → 77 and B, now answerable, is painted', n3 === 2 && cells[0].innerHTML.includes('0.77') && cells[1].innerHTML.includes('0.05'), JSON.stringify(cells.map((c) => c.innerHTML)));
  delete app._accountUsage['sub-a'];
  const n4 = app._repaintRosterUsage();
  ok('a snapshot that DISAPPEARS from the maps leaves the last paint (never blanked by a poll)', n4 === 0 && cells[0].innerHTML.includes('0.77'));
  globalThis.document = { querySelectorAll: () => [] };
  ok('no mounted roster ⇒ 0 and no throw', app._repaintRosterUsage() === 0);
  delete globalThis.document;
  ok('no document at all (a test or a worker) ⇒ 0 and no throw', app._repaintRosterUsage() === 0);
}

// ── THE CREDITS CHIP (2.369.189, the owner on the Agents roster, a row reading
// "正在使用付费溢出额度" beside its next-usable column: "这啥玩意啊 不如显示个钱的图标").
// An account on paid overage (in use) or whose org allows it past 100 % (B-ad05)
// wears UI_ICONS.money + ONE word; the sentence rides title + aria-label; the
// 8 s poll PATCHES the chip (same node), never re-creates it.
console.log('— the credits chip: the money icon + one word, the sentence in title/aria-label, patched in place');
const US = await import(path.join(REPO, 'src/lib/usage-source.js'));
const { UI_ICONS } = await import(path.join(REPO, 'src/lib/icons.js'));
const SA = (await import(path.join(REPO, 'src/spend-authorizer.js'))).default;
const DICT = { zh: (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja: (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default };
const tFor = (lang) => (str, p) => { let v = (DICT[lang] && DICT[lang][str]) || str; if (p) v = v.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return v; };
const decode = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// a strict parse of THE chip markup: <span …attrs>ICON<span class="credits-chip-word">WORD</span></span>
const parseChip = (html) => {
  const m = /^<span ([^>]*)>(<svg[\s\S]*?<\/svg>)<span class="credits-chip-word">([^<]*)<\/span><\/span>$/.exec(html || '');
  if (!m) return null;
  const attrs = {}; for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
  const word = { textContent: decode(m[3]) };
  return { attrs, svg: m[2], word, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, querySelector: (sel) => (sel === '.credits-chip-word' ? word : null) };
};
const fakeSlot = () => { let html = '', chip = null; return { get innerHTML() { return html; }, set innerHTML(h) { html = h; chip = h ? parseChip(h) : null; if (h && !chip) throw new Error('unparseable chip markup: ' + h.slice(0, 120)); }, querySelector: (sel) => (sel === '.credits-chip' ? chip : null) }; };
const now = Date.now();
const U = {
  inUse: (used = 4.25) => ({ fiveHour: { utilization: 1 }, overage: { inUse: true, asOf: now, status: 'allowed' }, spend: { used, limit: 20 } }),
  allowed: () => ({ fiveHour: { utilization: 0.3 }, overage: { inUse: false, status: 'allowed', asOf: now } }),
  disabled: () => ({ fiveHour: { utilization: 0.3 }, overage: { inUse: false, status: 'rejected', disabledReason: 'org_level_disabled_until', asOf: now } }),
  plain: () => ({ fiveHour: { utilization: 0.3 } }),
};
const WORD = { en: 'Credits', zh: '按量', ja: '従量' };
// the legs, run against the real module AND against each patched copy
async function creditsLegs(MA) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  // (a) the face in three languages, from the PURE rule + the ONE builder
  for (const lang of ['en', 'zh', 'ja']) {
    const t = tFor(lang);
    for (const [kind, u, state] of [['in use', U.inUse(), 'in-use'], ['allowed', U.allowed(), 'allowed']]) {
      const chip = US.overageChip(SA.overageState(u), { t });
      const el = parseChip(US.creditsChipHtml(chip, { icon: UI_ICONS.money }));
      const sentence = kind === 'in use' ? t('Using paid overage credits — this account’s subscription quota is spent and its requests are billed pay-per-use.') : t('Extra usage is enabled on this org: requests past 100 % are billed pay-per-use. The pool moves conversations onto it only when no member has quota left.');
      leg(`${lang} · ${kind}: the chip = the money icon + "${WORD[lang]}", the sentence in title AND aria-label (role img), data-credits="${state}"`,
        el && el.svg === UI_ICONS.money && el.word.textContent === WORD[lang] && el.attrs.role === 'img' && el.attrs.title === chip.tip && el.attrs['aria-label'] === chip.tip && el.attrs.title.startsWith(sentence) && el.attrs['data-credits'] === state && el.attrs.class === 'credits-chip',
        JSON.stringify(el && { attrs: el.attrs, word: el.word.textContent }));
    }
  }
  leg('the money figure rides the TIP, never the face ("$4.25 / $20.00")', /Spent this period: \$4\.25 \/ \$20\.00\./.test(US.overageChip(SA.overageState(U.inUse()), {}).tip) && !/\$/.test(US.overageChip(SA.overageState(U.inUse()), {}).label));
  leg('a member NOT on credits draws no chip (disabled, unknown, a plain reading, no reading)',
    MA.creditsChipFor(U.disabled()) === null && MA.creditsChipFor(U.plain()) === null && MA.creditsChipFor(null) === null && US.creditsChipHtml(null) === '');
  leg('a hostile translation is escaped in both attributes and the word (the chip is interpolated HTML)',
    !/<img/.test(US.creditsChipHtml(US.overageChip(SA.overageState(U.allowed()), { t: () => '"><img src=x onerror=alert(1)>' }), { icon: UI_ICONS.money })));
  // (b) the REAL repaint over a fake roster: a credits row and a plain row
  class App { }
  MA.installManageAgents(App, {});
  const app = new App();
  app._acctUsageHtml = (u) => `U:${JSON.stringify(u.fiveHour)}|${JSON.stringify(u.spend || null)}`;
  const list = { querySelectorAll: () => [] };
  const mkRow = (key) => { const slot = fakeSlot(); const row = { querySelector: (sel) => (sel === '.acct-credits-slot' ? slot : null) }; const cell = { dataset: { usageSrc: 'accounts', usageKey: key }, innerHTML: '', closest: (sel) => (sel === '.acct-list' ? list : sel === '.acct-key-row' ? row : null) }; return { slot, row, cell }; };
  const cr = mkRow('sub-cr'), pl = mkRow('sub-plain');
  const prevDoc = globalThis.document;
  globalThis.document = { querySelectorAll: (sel) => (sel === '.acct-usage-cell[data-usage-src]' ? [cr.cell, pl.cell] : []) };
  try {
    app._accountUsage = { 'sub-cr': U.inUse(4.25), 'sub-plain': U.plain() }; app._usageEstimates = {};
    app._repaintRosterUsage();
    const c1 = cr.slot.querySelector('.credits-chip');
    leg('poll 1: the credits row gets its chip (in use, the word, the money in the tip); the plain row gets none',
      c1 && c1.getAttribute('data-credits') === 'in-use' && c1.word.textContent === 'Credits' && /\$4\.25/.test(c1.getAttribute('title')) && pl.slot.querySelector('.credits-chip') === null && pl.slot.innerHTML === '',
      JSON.stringify({ cr: cr.slot.innerHTML.slice(0, 80), pl: pl.slot.innerHTML }));
    if (c1) c1.__mark = 'kept';
    app._accountUsage = { 'sub-cr': { ...U.inUse(7.5), fiveHour: { utilization: 0.99 } }, 'sub-plain': U.plain() };
    const cellBefore = cr.cell.innerHTML;
    app._repaintRosterUsage();
    const c2 = cr.slot.querySelector('.credits-chip');
    leg('poll 2 (the donut AND the spend moved): the cell repaints, the chip is the SAME node, patched — title + aria-label say $7.50',
      cr.cell.innerHTML !== cellBefore && c2 === c1 && c2 && c2.__mark === 'kept' && /\$7\.50/.test(c2.getAttribute('title')) && c2.getAttribute('aria-label') === c2.getAttribute('title'),
      JSON.stringify({ same: c2 === c1, title: c2 && c2.getAttribute('title') }));
    app._accountUsage = { 'sub-cr': U.allowed(), 'sub-plain': U.plain() };
    app._repaintRosterUsage();
    const c3 = cr.slot.querySelector('.credits-chip');
    leg('poll 3 (money no longer flowing, the org still allows it): the same node turns to the dim state (data-credits="allowed")',
      c3 === c1 && c3 && c3.getAttribute('data-credits') === 'allowed' && /Extra usage is enabled/.test(c3.getAttribute('aria-label')));
    const n4 = app._repaintRosterUsage();
    leg('poll 4 (nothing changed): nothing is repainted or patched (0)', n4 === 0, String(n4));
    app._accountUsage = { 'sub-cr': U.disabled(), 'sub-plain': U.plain() };
    app._repaintRosterUsage();
    leg('poll 5 (overage disabled): the chip is gone, the slot empty; the plain row never had one', cr.slot.querySelector('.credits-chip') === null && cr.slot.innerHTML === '' && pl.slot.innerHTML === '');
    const bare = MA.patchCreditsSlot(null, MA.creditsChipFor(U.inUse()));
    leg('a row without a slot (an older template) is a no-op, never a throw', bare === false);
  } catch (e) { leg('the repaint legs ran', false, e.stack || e.message); }
  finally { if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc; }
  return out;
}
{
  const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  for (const r of await creditsLegs(MA)) ok(r.name, r.pass, r.detail);
}
// NEGATIVE CONTROLS: a patched copy that IGNORES the credits state, and one that re-creates the chip wholesale
console.log('— the credits chip\'s negative controls (patched copies, scripts/mutant-copy.mjs)');
{
  const M = mutantCopies('roster-credits', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  const MUTANTS = [
    { tag: 'state-ignored', find: 'export function creditsChipFor(u) { return u ? overageChip(overageState(u), { t }) : null; }', repl: 'export function creditsChipFor(u) { return null; }', expect: /poll 1: the credits row gets its chip/ },
    { tag: 'recreate-wholesale', find: "  if (!cur) { slot.innerHTML = creditsChipHtml(chip, { esc: escHtml, icon: UI_ICONS.money }); return true; }", repl: "  if (cur || !cur) { slot.innerHTML = creditsChipHtml(chip, { esc: escHtml, icon: UI_ICONS.money }); return true; }", expect: /poll 2 .*the chip is the SAME node/ },
  ];
  for (const m of MUTANTS) {
    const found = SRC.includes(m.find);
    ok(`control ${m.tag}: the patched line exists in manage-agents.js (the control judges the current source)`, found);
    if (!found) continue;
    const f = M.write('src/lib/manage-agents.js', SRC.replace(m.find, m.repl), m.tag);
    const Mod = await import(pathToFileURL(f).href);
    const red = (await creditsLegs(Mod)).filter((r) => !r.pass).map((r) => r.name);
    ok(`control ${m.tag}: the patched copy turns its leg RED (${red.length} failed: ${red.slice(0, 2).join(' | ').slice(0, 160)})`, red.some((n) => m.expect.test(n)));
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length })) ok(r.name, r.pass, r.detail);
}

console.log('— wiring pins');
{
  const ma = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  const um = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok('every usage cell the two rosters render is stamped (claude row via usageStampAttrs, claude global + host-own, codex row pool/loggedIn, codex global)', (ma.match(/data-usage-src=/g) || []).length === 6 && /acct-usage-cell"\$\{usageStampAttrs\}/.test(ma));
  ok('the claude row\'s stamp is the SAME decision as its snapshot (pool → current target; host-login → host-own; host-held → host:account; local → the account)', /const usageStamp = isPool \? \(a\.current \? \{ src: 'accounts', key: a\.current \} : null\)/.test(ma) && /\{ src: 'host-own', key: selectedHost \}/.test(ma) && /\{ src: 'host-account', key: selectedHost \+ ':' \+ a\.id \}/.test(ma) && /\(a\.loggedIn \|\| a\.oat\) \? \{ src: 'accounts', key: a\.id \} : null/.test(ma));
  ok('_renderUsage (every poll, every popup refresh) calls the repaint first', /_renderUsage\(\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*try \{ this\._repaintRosterUsage\?\.\(\); \} catch \{ \}/.test(um));
  ok('the repaint re-derives the two-soonest highlight per list it touched', /for \(const list of lists\) markSoonRows\(list\);/.test(ma));
  ok('the per-row ⟳ path still repaints its own row — and patches its credits chip from the same snapshot', /if \(u\) \{ cell\.innerHTML = this\._acctUsageHtml\(u, est\); markSoonRows\(cell\.closest\('\.acct-list'\)\); patchCreditsSlot\(row\.querySelector\('\.acct-credits-slot'\), creditsChipFor\(u\)\); \}/.test(ma));
  // THE CREDITS CHIP's wiring (2.369.189): every row that renders a usage cell renders its slot beside the name
  ok('every roster row template renders the credits slot on its identity line (claude global + member, codex global + member)',
    /<span class="acct-key-tail">\$\{gIdent\}<\/span>\$\{!selectedHost && sub\.loggedIn \? creditsSlotHtml\(this\._rateLimit\)/.test(ma)
    && /\$\{ident\}\$\{hint\}<\/span>\$\{creditsTag\}/.test(ma) && /const creditsTag = \(rowSnap \|\| usageStamp\) \? creditsSlotHtml\(rowSnap \? rowSnap\.u : null\) : '';/.test(ma)
    && /creditsSlotHtml\(this\._codexAccountUsage\?\.\['__global_codex__'\]\) \+ resetSlot\('__global_codex__'\)/.test(ma)
    && /creditsSlotHtml\(this\._codexAccountUsage\?\.\[isPool \? a\.current : a\.id\]\)/.test(ma));
  ok('the usage CELL no longer draws either credits state (the in-use sentence pushed the next-usable column)', !/ovc\.kind !== 'credits'/.test(ma) && !/acct-usage-credits/.test(ma));
  ok('the usage popup draws the SAME chip (creditsChipHtml + UI_ICONS.money)', /if \(ovc\) parts\.push\(creditsChipHtml\(ovc, \{ esc: escHtml, icon: UI_ICONS\.money \}\)\);/.test(um));
  ok('ci.mjs runs this suite', /'test-roster-live-usage'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
