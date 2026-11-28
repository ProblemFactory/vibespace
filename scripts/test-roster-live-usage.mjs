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
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
const { rosterUsageSnapshot, installManageAgents } = MA;

console.log('— rosterUsageSnapshot (pure)');
{
  const maps = { accounts: { 'sub-a': { fiveHour: { utilization: 0.4 } } }, estimates: { 'sub-a': { fiveHour: 0.5 }, __global__: { fiveHour: 0.1 } }, rateLimit: { fiveHour: { utilization: 0.2 } }, hostOwn: { 'host-1': { fiveHour: { utilization: 0.3 } }, 'host-2': { sevenDay: {} }, 'host-3': { sevenDay: { utilization: 0.25 } } }, hostAccounts: { 'host-1:sub-a': { fiveHour: { utilization: 0.6 } } }, codex: { 'cxs-1': { fiveHour: { utilization: 0.7 } }, __global_codex__: { fiveHour: { utilization: 0.8 } } } };
  const s = (src, key) => rosterUsageSnapshot({ usageSrc: src, usageKey: key }, maps);
  ok('accounts: the named claude account + its estimate', s('accounts', 'sub-a')?.u.fiveHour.utilization === 0.4 && s('accounts', 'sub-a').est.fiveHour === 0.5);
  ok('global: the machine login + the __global__ estimate', s('global', '__global__')?.u.fiveHour.utilization === 0.2 && s('global', '__global__').est.fiveHour === 0.1);
  ok('host-own: a host login only when it carries a reading — a 5h snapshot, or (lane no-5h-window) a weekly window that states a spend; an empty week is none (the render\'s own rule)', s('host-own', 'host-1')?.u.fiveHour.utilization === 0.3 && s('host-own', 'host-2') === null && s('host-own', 'host-3')?.u.sevenDay.utilization === 0.25);
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
  ok('first poll paints the cells the maps can answer (A + the machine login), not the unanswerable one (B) nor the unstamped one', n1 === 2 && gateOf(cells[0].innerHTML.includes('0.42')) && gateOf(cells[2].innerHTML.includes('0.1')) && cells[1].innerHTML === '' && cells[3].innerHTML === 'unstamped', JSON.stringify(cells.map((c) => c.innerHTML)));
  ok('the cell\'s own tooltip (the ⟳ rung note) survives a repaint', cells[0].title === 'kept');
  const n2 = app._repaintRosterUsage();
  ok('an unchanged poll repaints NOTHING (no churn)', n2 === 0);
  app._accountUsage = { 'sub-a': { fiveHour: { utilization: 0.77 } }, 'sub-b': { fiveHour: { utilization: 0.05 } } };
  const n3 = app._repaintRosterUsage();
  ok('THE REPORT: fresh numbers land in place — A moves 42 → 77 and B, now answerable, is painted', n3 === 2 && gateOf(cells[0].innerHTML.includes('0.77')) && verdictOf(cells[1].innerHTML.includes('0.05')), JSON.stringify(cells.map((c) => c.innerHTML)));
  delete app._accountUsage['sub-a'];
  const n4 = app._repaintRosterUsage();
  ok('a snapshot that DISAPPEARS from the maps leaves the last paint (never blanked by a poll)', n4 === 0 && verdictOf(cells[0].innerHTML.includes('0.77')));
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
  const leg = (name, pass, detail) => { if (typeof pass !== 'boolean') throw new TypeError(`leg: its condition is a ${typeof pass}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); return (out.push({ name, pass: !!pass, detail })); };
  // (a) the face in three languages, from the PURE rule + the ONE builder
  for (const lang of ['en', 'zh', 'ja']) {
    const t = tFor(lang);
    for (const [kind, u, state] of [['in use', U.inUse(), 'in-use'], ['allowed', U.allowed(), 'allowed']]) {
      const chip = US.overageChip(SA.overageState(u), { t });
      const el = parseChip(US.creditsChipHtml(chip, { icon: UI_ICONS.money }));
      const sentence = kind === 'in use' ? t('Using paid overage credits — this account’s subscription quota is spent and its requests are billed pay-per-use.') : t('Extra usage is enabled on this org: requests past 100 % are billed pay-per-use. The pool moves conversations onto it only when no member has quota left.');
      leg(`${lang} · ${kind}: the chip = the money icon + "${WORD[lang]}", the sentence in title AND aria-label (role img), data-credits="${state}"`,
        gateOf(el) && el.svg === UI_ICONS.money && el.word.textContent === WORD[lang] && el.attrs.role === 'img' && el.attrs.title === chip.tip && el.attrs['aria-label'] === chip.tip && gateOf(el.attrs.title.startsWith(sentence)) && el.attrs['data-credits'] === state && el.attrs.class === 'credits-chip',
        JSON.stringify(el && { attrs: el.attrs, word: el.word.textContent }));
    }
  }
  leg('the money figure rides the TIP, never the face ("$4.25 / $20.00")', gateOf(/Spent this period: \$4\.25 \/ \$20\.00\./.test(US.overageChip(SA.overageState(U.inUse()), {}).tip)) && !/\$/.test(US.overageChip(SA.overageState(U.inUse()), {}).label));
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
      gateOf(c1) && c1.getAttribute('data-credits') === 'in-use' && c1.word.textContent === 'Credits' && gateOf(/\$4\.25/.test(c1.getAttribute('title'))) && pl.slot.querySelector('.credits-chip') === null && pl.slot.innerHTML === '',
      JSON.stringify({ cr: cr.slot.innerHTML.slice(0, 80), pl: pl.slot.innerHTML }));
    if (c1) c1.__mark = 'kept';
    app._accountUsage = { 'sub-cr': { ...U.inUse(7.5), fiveHour: { utilization: 0.99 } }, 'sub-plain': U.plain() };
    const cellBefore = cr.cell.innerHTML;
    app._repaintRosterUsage();
    const c2 = cr.slot.querySelector('.credits-chip');
    leg('poll 2 (the donut AND the spend moved): the cell repaints, the chip is the SAME node, patched — title + aria-label say $7.50',
      cr.cell.innerHTML !== cellBefore && c2 === c1 && gateOf(c2) && c2.__mark === 'kept' && gateOf(/\$7\.50/.test(c2.getAttribute('title'))) && c2.getAttribute('aria-label') === c2.getAttribute('title'),
      JSON.stringify({ same: c2 === c1, title: c2 && c2.getAttribute('title') }));
    app._accountUsage = { 'sub-cr': U.allowed(), 'sub-plain': U.plain() };
    app._repaintRosterUsage();
    const c3 = cr.slot.querySelector('.credits-chip');
    leg('poll 3 (money no longer flowing, the org still allows it): the same node turns to the dim state (data-credits="allowed")',
      c3 === c1 && gateOf(c3) && c3.getAttribute('data-credits') === 'allowed' && verdictOf(/Extra usage is enabled/.test(c3.getAttribute('aria-label'))));
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
  for (const r of await creditsLegs(MA)) ok(r.name, verdictOf(r.pass), r.detail);
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
    ok(`control ${m.tag}: the patched line exists in manage-agents.js (the control judges the current source)`, verdictOf(found));
    if (!found) continue;
    const f = M.write('src/lib/manage-agents.js', editAnchor(SRC, m.find, m.repl, "src/lib/manage-agents.js"), m.tag);
    const Mod = await import(pathToFileURL(f).href);
    const red = (await creditsLegs(Mod)).filter((r) => !r.pass).map((r) => r.name);
    ok(`control ${m.tag}: the patched copy turns its leg RED (${red.length} failed: ${red.slice(0, 2).join(' | ').slice(0, 160)})`, verdictOf(red.some((n) => m.expect.test(n))));
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length })) ok(r.name, verdictOf(r.pass), r.detail);
}

console.log('— wiring pins');
{
  const ma = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  const um = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok('every usage cell the rosters render is stamped (claude row via usageStampAttrs, claude global + host-own, codex row pool/loggedIn, codex global, an isolated-home account\'s on-demand reading — lane antigravity-card-fixes)', (ma.match(/data-usage-src=/g) || []).length === 7 && gateOf(/acct-usage-cell"\$\{usageStampAttrs\}/.test(ma)) && verdictOf(/<span class="acct-usage-cell" data-usage-src="home" data-usage-key="\$\{escHtml\(a\.id\)\}">\$\{usageOf\(a\.id\)\}<\/span>/.test(ma)));
  ok('the claude row\'s stamp is the SAME decision as its snapshot (pool → current target; host-login → host-own; host-held → host:account; local → the account)', gateOf(/const usageStamp = isPool \? \(a\.current \? \{ src: 'accounts', key: a\.current \} : null\)/.test(ma)) && gateOf(/\{ src: 'host-own', key: selectedHost \}/.test(ma)) && gateOf(/\{ src: 'host-account', key: selectedHost \+ ':' \+ a\.id \}/.test(ma)) && verdictOf(/\(a\.loggedIn \|\| a\.oat \|\| signinUnread\(a\)\) \? \{ src: 'accounts', key: a\.id \} : null/.test(ma)));   // B-360d: a sign-in not read yet keeps its reading's cell
  ok('_renderUsage (every poll, every popup refresh) calls the repaint first', verdictOf(/_renderUsage\(\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*try \{ this\._repaintRosterUsage\?\.\(\); \} catch \{ \}/.test(um)));
  ok('the repaint re-derives the two-soonest highlight per list it touched', verdictOf(/for \(const list of lists\) markSoonRows\(list\);/.test(ma)));
  ok('the per-row ⟳ path still repaints its own row — and patches its credits chip from the same snapshot', verdictOf(/if \(u\) \{ cell\.innerHTML = this\._acctUsageHtml\(u, est\); markSoonRows\(cell\.closest\('\.acct-list'\)\); patchCreditsSlot\(row\.querySelector\('\.acct-credits-slot'\), creditsChipFor\(u\)\); \}/.test(ma)));
  // THE CREDITS CHIP's wiring (2.369.189): every row that renders a usage cell renders its slot beside the name
  ok('every roster row template renders the credits slot on its identity line (claude global + member, codex global + member)',
    gateOf(/<span class="acct-key-tail">\$\{gIdent\}<\/span>\$\{!selectedHost && sub\.loggedIn \? creditsSlotHtml\(this\._rateLimit\)/.test(ma))
    && gateOf(/\$\{ident\}\$\{hint\}<\/span>\$\{creditsTag\}/.test(ma)) && gateOf(/const creditsTag = \(rowSnap \|\| usageStamp\) \? creditsSlotHtml\(rowSnap \? rowSnap\.u : null\) : '';/.test(ma))
    && gateOf(/creditsSlotHtml\(this\._codexAccountUsage\?\.\['__global_codex__'\]\) \+ resetSlot\('__global_codex__'\)/.test(ma))
    && verdictOf(/creditsSlotHtml\(this\._codexAccountUsage\?\.\[isPool \? a\.current : a\.id\]\)/.test(ma)));
  ok('the usage CELL no longer draws either credits state (the in-use sentence pushed the next-usable column)', !/ovc\.kind !== 'credits'/.test(ma) && !/acct-usage-credits/.test(ma));
  ok('the usage popup draws the SAME chip (creditsChipHtml + UI_ICONS.money)', verdictOf(/if \(ovc\) parts\.push\(creditsChipHtml\(ovc, \{ esc: escHtml, icon: UI_ICONS\.money \}\)(?: \+ \(ovc\.kind === 'inUse' && !turnsAllowed \? ` <button [^`]*data-door=\"settings:spend\.allowOverageTurns\"[^`]*` : ''\))?\);/.test(um)));
  ok('ci.mjs runs this suite', verdictOf(/'test-roster-live-usage'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8'))));
}
console.log('— B-ce1c: the machine login and a named account of the same identity are TWO sign-ins');
{
  // Owner, 2026-09-07: ~/.claude/.credentials.json (owner@example.com, alive to 09-10) and the pool's
  // copy sub-cac86a3ff4d1 (same account, expired 09-02) — the CLI-login row read "= “Personal Max”" and
  // the owner took the live machine login for Personal Max. One account ⇒ one quota (merged), two sign-ins.
  const hint = typeof MA.machineLoginLinkHint === 'function' ? MA.machineLoginLinkHint : null;
  const h = hint ? hint('Personal Max') : null;
  ok('B-ce1c: the CLI-login row names the account AND says it is a separate sign-in (not "= “Personal Max”")', !!h && gateOf(/“Personal Max”/.test(h.label)) && gateOf(/separate sign-in/.test(h.label)) && !/^=/.test(h.label), JSON.stringify(h));
  ok('B-ce1c: …its tooltip says one Anthropic account, one quota, two sign-ins that each expire and renew on their own', !!h && gateOf(/same Anthropic account/.test(h.tip)) && gateOf(/one quota/.test(h.tip)) && gateOf(/two separate sign-ins/.test(h.tip)) && verdictOf(/expires and is renewed on its own/.test(h.tip)), h && h.tip);
  const hc = hint ? hint('Personal Pro', 'ChatGPT') : null;
  ok('B-ce1c: the codex twin says the same about a ChatGPT account', !!hc && gateOf(/same ChatGPT account/.test(hc.tip)) && verdictOf(/“Personal Pro”/.test(hc.label)));
  const maSrc = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok('B-ce1c WIRING: both machine-login rows (claude + codex) render machineLoginLinkHint, escaped; none writes the bare "= “{name}”"',
    (maSrc.match(/const h = machineLoginLinkHint\(linked(Sub|Cx)\.name[^\n]*title="\$\{escHtml\(h\.tip\)\}">\$\{escHtml\(h\.label\)\}/g) || []).length === 2 && !maSrc.includes("t('= “{name}”'"));
  const umSrc = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok('B-ce1c WIRING: the usage popup\'s merged chip (claude + codex) says one quota, two separate sign-ins — never "also the CLI login"',
    (umSrc.match(/t\('same account as this machine’s CLI login — one quota, two separate sign-ins'\)/g) || []).length === 2 && !umSrc.includes('also the CLI login on this machine'));
  const keys = ['same account as “{name}” · a separate sign-in', 'same account as this machine’s CLI login — one quota, two separate sign-ins'];
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok('B-ce1c: the new words are in zh and ja (and the tooltip keeps {name} + {vendor} in both)', gateOf(keys.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')))
    && verdictOf([zh, ja].every((d) => { const m = d.match(/^  "This machine’s CLI login and “\{name\}” are the same \{vendor\} account[^\n]*": "([^\n]*)",$/m); return !!m && m[1].includes('{name}') && m[1].includes('{vendor}'); })));
}
console.log('— a reset nobody confirmed is drawn RESET; a member never read says so (lane reset-unproven)');
{
  class AppR { }
  installManageAgents(AppR, {});
  const app = new AppR();
  const nowS = Math.floor(Date.now() / 1000);
  const ur = typeof MA.unreadUsageHtml === 'function' ? MA.unreadUsageHtml() : 'no unreadUsageHtml';
  const reset = app._acctUsageHtml({ fetchedAt: Date.now() - 4 * 86400e3, fiveHour: { utilization: 0.84, resetsAt: nowS - 3 * 86400 }, sevenDay: { utilization: 0.95, resetsAt: nowS - 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: nowS - 86400 }] }, null);
  ok('every bucket whose reset landed is drawn RESET — three dashed empty rings + the reset glyph, never the stale 84 / 95 / 100 %', (reset.match(/acct-donut-unconfirmed/g) || []).length === 3 && (reset.match(/acct-donut-reset/g) || []).length === 3 && !/(84|95|100)%/.test(reset), reset.slice(0, 300));
  ok('…its words ride the tooltip and the narrow pill says «reset · unconfirmed»', gateOf(/unconfirmed — confirms when a session uses it/.test(reset)) && verdictOf(/acct-mini-unconfirmed[^>]*>reset · unconfirmed</.test(reset)));
  const half = app._acctUsageHtml({ fetchedAt: Date.now() - 5 * 3600e3, fiveHour: { utilization: 0.97, resetsAt: nowS - 2400 }, sevenDay: { utilization: 0.7, resetsAt: nowS + 4 * 86400 } }, null);
  ok('PER BUCKET: the 5h that reset is drawn reset, the week inside its window keeps its reading (70 %)', (half.match(/acct-donut-unconfirmed/g) || []).length === 1 && gateOf(/7d: 70%/.test(half)) && !/97%/.test(half), half.slice(0, 300));
  const none = app._acctUsageHtml({ fetchedAt: Date.now() }, null);
  ok('a reading that states no window is NO READING — «no reading yet — confirms when a session uses it», never a 0 % donut', none === ur && gateOf(/no reading yet — confirms when a session uses it/.test(none)) && !/acct-usage-donut/.test(none), none);
  const fresh = app._acctUsageHtml({ fetchedAt: Date.now(), fiveHour: { utilization: 0.42, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.55, resetsAt: nowS + 2 * 86400 } }, null);
  ok('a reading inside its windows is drawn as before (no reset mark, 42 % / 55 %)', !/unconfirmed/.test(fresh) && gateOf(/5h: 42%/.test(fresh)) && verdictOf(/7d: 55%/.test(fresh)));
  const roster = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok('the never-read SUBSCRIPTION row (no file at all) puts the same words in its bucket slot', verdictOf(/rowSnap \? usageHtml\(rowSnap\.u, rowSnap\.est, probeNote\) : isSub && !isPool && usageStamp && usageStamp\.src === 'accounts' \? unreadUsageHtml\(\) : ''/.test(roster)));
  const k = ['reset {time} · unconfirmed — confirms when a session uses it', 'reset · unconfirmed', 'no reading yet — confirms when a session uses it'];
  ok('zh + ja carry the three new phrases', verdictOf(k.every((x) => typeof DICT.zh[x] === 'string' && typeof DICT.ja[x] === 'string')), k.filter((x) => !DICT.zh[x] || !DICT.ja[x]).join(' | '));
}
console.log('— THE DISPLAY CENSUS: every quota renderer draws a landed reset RESET, never the pre-reset number (lane reset-unproven r3)');
{
  // 主开发's acceptance of r2: bucketView was replaced by the raw reading at the usage popup (v5/v7/scoped — the taskbar
  // pies and the phone chip ride the same views), the billing switcher's usageHint and the machines' host pill, and NINE
  // fast suites stayed green. Each renderer is DRIVEN here with readings whose every reset landed days ago (84 / 95 / 93 %
  // claude, 81 / 92 % codex) and must draw 0 % with the unconfirmed words; each site's bypass is a patched copy that reds
  // its leg BY NAME. (The text census over src/lib — a new raw reader outside the allowlist — is test-quota-model ㉒g.)
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', classList: { toggle() { } }, querySelectorAll: () => [], addEventListener() { } });
  globalThis.document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() { },
    createElement: () => ({ dataset: {}, style: { setProperty() { } }, classList: { add() { }, toggle() { } }, setAttribute() { }, appendChild() { }, outerHTML: '<span class="backend-icon"></span>' }) };
  globalThis.window ??= { addEventListener() { }, removeEventListener() { }, matchMedia: () => ({ matches: false, addEventListener() { } }), location: { search: '' } };
  globalThis.requestAnimationFrame ??= () => 0;
  const nowS = Math.floor(Date.now() / 1000), OLD = Date.now() - 4 * 86400e3;
  const STALE = { fetchedAt: OLD, fiveHour: { utilization: 0.84, resetsAt: nowS - 3 * 86400 }, sevenDay: { utilization: 0.95, resetsAt: nowS - 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 0.93, resetsAt: nowS - 86400 }] };
  const CX = { fetchedAt: OLD, fiveHour: { usedPercent: 81, resetsAt: nowS - 3 * 86400 }, sevenDay: { usedPercent: 92, resetsAt: nowS - 86400 } };
  const PRE = /\b(?:84|95|93|81|92)\s?%/; // a pre-reset number anywhere in what was drawn
  const M = mutantCopies('reset-census', REPO);
  const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const patchedImport = async (rel, tag, swaps) => {
    let src = srcOf(rel);
    for (const [a, b] of swaps) { if (src.split(a).length !== 2) return null; src = src.replace(a, b); }
    return import(pathToFileURL(M.write(rel, src, tag)).href);
  };
  // (1) THE USAGE POPUP + TASKBAR PIES + PHONE CHIP (usage-meter `_renderUsage`, the real method over a fake document)
  const meterLegs = (UM) => {
    for (const k of Object.keys(els)) delete els[k];
    class AppU { }
    UM.installUsageMeter(AppU, {});
    const app = new AppU();
    app.settings = { get: () => undefined };
    app._accounts = { accounts: [{ id: 'sub-a', backend: 'claude', type: 'subscription', name: 'A' }, { id: 'cxs-a', backend: 'codex', type: 'subscription', name: 'CA' }], defaultAccountId: 'sub-a', defaultCodexAccountId: 'cxs-a' };
    app._accountUsage = { 'sub-a': STALE }; app._codexAccountUsage = { 'cxs-a': CX }; app._usageEstimates = {};
    let err = null;
    try { app._renderUsage(); } catch (e) { err = e.message; }
    const bar = el('taskbar-usage').innerHTML, pop = el('usage-popup').innerHTML, chip = el('mobile-nav-usage').innerHTML;
    const [cBar = '', xBar = ''] = bar.split('<div class="taskbar-usage-row">').slice(1);
    const [cPop = '', xPop = ''] = pop.split('<div class="usage-section-title">').slice(1);
    const scoped = (cPop.split('Fable weekly limit')[1] || '');
    return [
      { name: 'usage popup: the CLAUDE taskbar pies (5h + 7d) are drawn reset — dashed, empty, the unconfirmed words in the tooltip, never 84 / 95', pass: !err && (cBar.match(/usage-donut-unconfirmed/g) || []).length === 2 && !PRE.test(cBar) && /unconfirmed — confirms when a session uses it/.test(cBar), detail: err || cBar.slice(0, 260) },
      { name: 'usage popup: …its 5h + 7d bars say «0% used» and the unconfirmed reset, never «84% used» / «95% used»', pass: !err && (cPop.match(/>0% used</g) || []).length >= 2 && !/(?:84|95)% used/.test(cPop) && (cPop.match(/usage-stat-unconfirmed/g) || []).length >= 2 },
      { name: 'usage popup: …the Fable (SCOPED) weekly bar says «0% used» and the unconfirmed reset, never «93% used»', pass: !err && />0% used</.test(scoped) && !/93% used/.test(scoped) && /usage-stat-unconfirmed/.test(scoped), detail: scoped.slice(0, 200) },
      { name: 'usage popup: the CODEX pies + bars (the usedPercent shape) are drawn reset — never 81 / 92', pass: !err && (xBar.match(/usage-donut-unconfirmed/g) || []).length === 2 && !PRE.test(xBar) && (xPop.match(/>0% used</g) || []).length === 2 && !/(?:81|92)% used/.test(xPop), detail: (xBar + xPop).slice(0, 260) },
      { name: 'usage popup: the PHONE nav chip (worst of every bucket) says 0, never the stale 95 / 93', pass: !err && />0<\/span>/.test(chip) && !PRE.test(chip.replace(/deg/g, '')), detail: chip },
    ];
  };
  const UM = await import(pathToFileURL(path.join(REPO, 'src/lib/usage-meter.js')).href);
  for (const r of meterLegs(UM)) ok(r.name, verdictOf(r.pass), r.detail);
  // (2) THE BILLING SWITCHER's usage cluster (session-lifecycle showBillingSwitcher's `usageHint`, evaluated from the
  // module's own text — session-lifecycle loads xterm and cannot be imported here — with the module's real imports)
  const { t: tI18n } = await import(pathToFileURL(path.join(REPO, 'src/lib/i18n.js')).href);
  const U = await import(pathToFileURL(path.join(REPO, 'src/lib/utils.js')).href);
  const US = await import(pathToFileURL(path.join(REPO, 'src/lib/usage-source.js')).href);
  const QM = await import(pathToFileURL(path.join(REPO, 'src/quota-model.js')).href);
  const AW = await import(pathToFileURL(path.join(REPO, 'src/lib/account-wall-words.js')).href);   // markT (hotfix .401: the age is a mark)
  const PT = await import(pathToFileURL(path.join(REPO, 'src/lib/page-time.js')).href);   // durationMark — THE one mark function (lane ui-language, 主开发 2026-11-14)
  const SL_FROM = '    const pctOf = (x) => (x == null ? null :', SL_TO = '    const rowHtml = (nameText, subText, usage) =>';
  const hintOf = (src) => {
    const i = src.indexOf(SL_FROM), j = src.indexOf(SL_TO, i);
    if (i < 0 || j < 0) return null;
    try { return new Function('t', 'escHtml', 'estDisplayPair', 'bucketView', 'quotaModel', 'unconfirmedText', 'markT', 'durationMark', src.slice(i, j) + '\nreturn usageHint;')(tI18n, U.escHtml, U.estDisplayPair, US.bucketView, QM, US.unconfirmedText, AW.markT, PT.durationMark); } catch { return null; }
  };
  const hintLegs = (usageHint) => {
    const h = usageHint ? usageHint(STALE, null) : '';
    return [{ name: 'billing switcher: a member row\'s 5h / 7d / Fable segments say 0 % with the unconfirmed tooltip, never 84 / 95 / 93', pass: !!usageHint && (h.match(/bsw-unconfirmed/g) || []).length === 3 && !PRE.test(h) && (h.match(/>0%</g) || []).length === 3, detail: h.slice(0, 260) }];
  };
  const SL = srcOf('src/lib/session-lifecycle.js');
  ok('billing switcher: its usageHint is found in session-lifecycle.js (the census judges the current source)', !!hintOf(SL));
  for (const r of hintLegs(hintOf(SL))) ok(r.name, verdictOf(r.pass), r.detail);
  // (3) THE MACHINES' HOST PILL + (4) the roster donuts and the narrow pill (manage-agents, the real module)
  const maLegs = (Mod) => {
    const pill = typeof Mod.hostQuotaPillHtml === 'function' ? Mod.hostQuotaPillHtml(STALE) : '';
    class AppM { }
    Mod.installManageAgents(AppM, {});
    const roster = new AppM()._acctUsageHtml(STALE, null);
    const narrow = (roster.match(/<span class="acct-mini[^"]*"[^>]*>[^<]*<\/span>/g) || []).join(' ');
    return [
      { name: 'machines overview: a host\'s quota pill draws its tightest bucket at 0 % with «reset · unconfirmed» per bucket, never 95', pass: /agents-mach-quota/.test(pill) && /> ?\S+ 0%/.test(pill) && !PRE.test(pill) && (pill.match(/reset · unconfirmed/g) || []).length === 3, detail: pill.slice(0, 260) },
      { name: 'roster: the donuts are three dashed empty rings, never 84 / 95 / 93', pass: (roster.match(/acct-donut-unconfirmed/g) || []).length === 3 && !PRE.test(roster), detail: roster.slice(0, 200) },
      { name: 'roster: the narrow pill says «reset · unconfirmed», never a pre-reset number', pass: /acct-mini-unconfirmed[^>]*>reset · unconfirmed</.test(roster) && !PRE.test(narrow), detail: narrow },
    ];
  };
  for (const r of maLegs(MA)) ok(r.name, verdictOf(r.pass), r.detail);
  // RED controls — each surface's bypass (the acceptance's mutant shape) on a patched copy; every one reds its own leg by name
  const red = async (tag, legs, needle) => {
    const failed = legs.filter((r) => !r.pass).map((r) => r.name);
    ok(`census RED ${tag}: the bypass reds «${needle}» (${failed.length} red)`, verdictOf(failed.some((n) => n.includes(needle))), failed.join(' | ').slice(0, 200));
  };
  const umRaw5 = ['const v5 = bucketView(quotaModel, rl?.fiveHour, estSel?.fiveHour, Date.now(), { readAt: rl?.fetchedAt });', 'const v5 = { reading: rl?.fiveHour, est: estSel?.fiveHour }; /* PATCHED */'];
  const umRaw7 = ['const v7 = bucketView(quotaModel, rl?.sevenDay, estSel?.sevenDay, Date.now(), { readAt: rl?.fetchedAt });', 'const v7 = { reading: rl?.sevenDay, est: estSel?.sevenDay }; /* PATCHED */'];
  const umRawSc = ['const vSc = bucketView(quotaModel, sc, scEst, Date.now(), { readAt: rl.scopedFetchedAt || rl.fetchedAt });', 'const vSc = { reading: sc, est: scEst }; /* PATCHED */'];
  const umRawCx = ['const cv5 = bucketView(quotaModel, codex?.fiveHour, cEstSel?.fiveHour, Date.now(), { readAt: codex?.fetchedAt });', 'const cv5 = { reading: codex?.fiveHour, est: cEstSel?.fiveHour }; /* PATCHED */'];
  const m1 = await patchedImport('src/lib/usage-meter.js', 'um-claude', [umRaw5, umRaw7]);
  if (m1) await red('usage-meter v5/v7', meterLegs(m1), 'CLAUDE taskbar pies'); else ok('census RED usage-meter v5/v7: the patched lines exist', false);
  const m2 = await patchedImport('src/lib/usage-meter.js', 'um-scoped', [umRawSc]);
  if (m2) { const L = meterLegs(m2); await red('usage-meter scoped', L, 'SCOPED'); await red('usage-meter scoped → phone chip', L, 'PHONE nav chip'); } else ok('census RED usage-meter scoped: the patched line exists', false);
  const m3 = await patchedImport('src/lib/usage-meter.js', 'um-codex', [umRawCx]);
  if (m3) await red('usage-meter codex', meterLegs(m3), 'CODEX pies'); else ok('census RED usage-meter codex: the patched line exists', false);
  const slRaw = ['const v = bucketView(quotaModel, raw0, e0, Date.now(), { readAt: u.fetchedAt });', 'const v = { reading: raw0, est: e0 }; /* PATCHED */'];
  ok('census RED session-lifecycle eff: the patched line exists', SL.split(slRaw[0]).length === 2);
  await red('session-lifecycle eff', hintLegs(hintOf(SL.replace(slRaw[0], slRaw[1]))), 'billing switcher: a member row');
  const ma1 = await patchedImport('src/lib/manage-agents.js', 'ma-host', [['const v = bucketView(quotaModel, x, null, nowMs, { readAt: hu.fetchedAt });', 'const v = { reading: x }; /* PATCHED */']]);
  if (ma1) await red('manage-agents host pill', maLegs(ma1), 'host\'s quota pill'); else ok('census RED manage-agents host pill: the patched line exists', false);
  // the donut takes its bucket's reading instant since lane usage-two-rings (the cap ring hands `scopedFetchedAt || fetchedAt`) — same bypass
  const ma2 = await patchedImport('src/lib/manage-agents.js', 'ma-donut', [['const v = bucketView(quotaModel, x0, est0, now, { readAt });', 'const v = { reading: x0, est: est0 }; /* PATCHED */']]);
  if (ma2) await red('manage-agents donut', maLegs(ma2), 'donuts are three'); else ok('census RED manage-agents donut: the patched line exists', false);
  // the pill's bucket carries capRing's words since lane usage-two-rings r4 (ONE sentence per cap) — same bypass
  const ma3 = await patchedImport('src/lib/manage-agents.js', 'ma-pill', [['.map(([label, x0, e0, kind, words]) => { const v = bucketView(quotaModel, x0, e0, now, { readAt: u.fetchedAt });', '.map(([label, x0, e0, kind, words]) => { const v = { reading: x0, est: e0 }; /* PATCHED */']]);
  if (ma3) await red('manage-agents narrow pill', maLegs(ma3), 'narrow pill'); else ok('census RED manage-agents narrow pill: the patched line exists', false);
  // (3) B-2d35 (主开发's ruling 2026-11-19 22:23Z, B-87fd codexkey's law): THE CLAUDE AUTO VIEW NAMES THE ACCOUNT IT SHOWS — a
  // default set (an account, or a pool: its current member) ⇒ that account's OWN reading or «no reading yet», under its name;
  // NO default ⇒ the machine CLI login's reading under the plain label (Auto means the CLI login then). Five worlds, drawn by the
  // real meter; the account read from the Claude section's own title (its switcher's chips name every account); RED: an anchored
  // copy with the CLI login's fallback put back draws B's 90 % under A
  const nowS2d = Math.floor(Date.now() / 1000);
  const R2d = (u) => ({ fetchedAt: Date.now() - 60e3, fiveHour: { utilization: u, resetsAt: nowS2d + 7200 }, sevenDay: { utilization: u, resetsAt: nowS2d + 3 * 86400 } });
  const autoWorld = (UM, { def, cur = null, own = {}, linked = null }) => {
    for (const k of Object.keys(els)) delete els[k];
    class AppA { }
    UM.installUsageMeter(AppA, {});
    const app = new AppA();
    app.settings = { get: () => undefined };
    const ids = { A: 'sub-auto-a', B: 'sub-auto-b', P: 'pool-auto-p' };
    app._accounts = { accounts: [{ id: ids.A, backend: 'claude', type: 'subscription', name: 'Acct A' }, { id: ids.B, backend: 'claude', type: 'subscription', name: 'Acct B' },
      { id: ids.P, backend: 'claude', type: 'pooled', pooled: true, name: 'Pool P', members: [ids.A, ids.B], current: cur ? ids[cur] : null }], defaultAccountId: def ? ids[def] : null };
    app._accountUsage = Object.fromEntries(Object.entries(own).map(([k, u]) => [ids[k], R2d(u)]));
    app._rateLimit = R2d(0.9);   // the machine CLI login (account B): 90 %
    app._usageGlobal = { loggedIn: true, email: 'cli@example.invalid', ...(linked ? { accountId: ids[linked] } : {}) };
    app._usageAcctSel = 'auto'; app._usageEstimates = {}; app._codexAccountUsage = {};
    let err = null;
    try { app._renderUsage(); } catch (e) { err = e.message; }
    const pop = String(el('usage-popup').innerHTML || ''), bar = String(el('taskbar-usage').innerHTML || '');
    const cPop = (pop.split('<div class="usage-section-title">')[1] || '');
    const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const title = txt(cPop).split(' Auto ')[0];
    const cBar = (bar.split('<div class="taskbar-usage-row">')[1] || '');
    return { err, title, pop: txt(cPop), n90: /90% used/.test(txt(cPop)) || /: 90%/.test(cBar), n40: /40% used/.test(txt(cPop)), none: /No usage captured yet/.test(txt(cPop)) };
  };
  const autoLegs = (UM) => {
    const w1 = autoWorld(UM, { def: 'A', own: { A: 0.4 } });
    const w2 = autoWorld(UM, { def: 'A' });
    const w3 = autoWorld(UM, { def: 'P', cur: 'A' });
    const w3b = autoWorld(UM, { def: 'P', cur: 'B', linked: 'B' });
    const w4 = autoWorld(UM, { def: null });
    return { w1, w2, w3, w3b, w4 };
  };
  const AW2d = autoLegs(UM);
  const showW = (w) => JSON.stringify(w && { err: w.err, title: w.title, n90: w.n90, n40: w.n40, none: w.none });
  ok('B-2d35 Claude Auto: a default ACCOUNT with its own reading — its name over ITS numbers (40 %), never the CLI login\'s 90 %', !AW2d.w1.err && gateOf(/Acct A/.test(AW2d.w1.title)) && gateOf(AW2d.w1.n40) && !AW2d.w1.n90, showW(AW2d.w1));
  ok('B-2d35 Claude Auto: a default ACCOUNT with NO reading yet — its name and «no reading yet», never the CLI login\'s 90 % under it', !AW2d.w2.err && gateOf(/Acct A/.test(AW2d.w2.title)) && gateOf(AW2d.w2.none) && !AW2d.w2.n90, showW(AW2d.w2));
  ok('B-2d35 Claude Auto: a POOL default right after a switch to A (no reading yet) — A\'s name and «no reading yet» (the plain label over the CLI login\'s numbers before)', !AW2d.w3.err && gateOf(/Acct A/.test(AW2d.w3.title)) && gateOf(AW2d.w3.none) && !AW2d.w3.n90, showW(AW2d.w3));
  ok('B-2d35 Claude Auto: a POOL on B, the CLI login LINKED to B by email — B\'s name over that reading (it is B\'s own)', !AW2d.w3b.err && gateOf(/Acct B/.test(AW2d.w3b.title)) && verdictOf(AW2d.w3b.n90), showW(AW2d.w3b));
  ok('B-2d35 Claude Auto: NO default — Auto means the CLI login: its 90 % under the plain «Claude» label, as before', !AW2d.w4.err && gateOf(/Claude/.test(AW2d.w4.title)) && !/Acct [AB]/.test(AW2d.w4.title) && verdictOf(AW2d.w4.n90), showW(AW2d.w4));
  const umRed = await patchedImport('src/lib/usage-meter.js', 'claude-auto-fallback', [["      rl = !claudeDefId ? this._rateLimit : ((claudeDefKey && this._accountUsage?.[claudeDefKey]) || (claudeDefKey && gl.accountId === claudeDefKey ? this._rateLimit : null) || null);", "      rl = (claudeDefId && this._accountUsage?.[claudeDefId]) ? this._accountUsage[claudeDefId] : this._rateLimit;"]]);   // stale-pins: kept (the RED copy plants the release's fallback on purpose)
  const AW2dr = umRed ? autoLegs(umRed) : null;
  ok('B-2d35 RED: a copy with the CLI login\'s fallback put back draws B\'s 90 % under «Acct A» (no reading of its own) — the legs see it', !!AW2dr && gateOf(/Acct A/.test(AW2dr.w2.title)) && verdictOf(AW2dr.w2.n90), AW2dr ? showW(AW2dr.w2) : 'the patched line is not there');
  // B-2d35 small (round wfm9rn69h): a POOL default's note names what the view shows — the pool's CURRENT member, never «Default
  // account» (an account default keeps its note); RED: the release's note line in an anchored copy says «Default account» for the pool
  const poolNote = /current member · refreshes when you run it in a terminal session/, defNote = /Default account · refreshes when you run it in a terminal session/;
  ok('B-2d35 the POOL default\'s note says «The pool\'s current member · …», never «Default account»', gateOf(poolNote.test(AW2d.w3.pop)) && !defNote.test(AW2d.w3.pop), AW2d.w3.pop.slice(0, 300));
  ok('B-2d35 …an ACCOUNT default keeps «Default account · …»', gateOf(defNote.test(AW2d.w1.pop)) && !poolNote.test(AW2d.w1.pop), AW2d.w1.pop.slice(0, 300));
  const umNote = await patchedImport('src/lib/usage-meter.js', 'claude-pool-note', [["      if (defAcct) usageNote = claudeDefRow && claudeDefRow.type === 'pooled' ? t('The pool\\'s current member · refreshes when you run it in a terminal session') : t('Default account · refreshes when you run it in a terminal session');", "      if (defAcct) usageNote = t('Default account · refreshes when you run it in a terminal session');"]]); // stale-pins: kept — the RED plants the release's note line
  const wNoteRed = umNote ? autoWorld(umNote, { def: 'P', cur: 'A' }) : null;
  ok('B-2d35 RED (the note): the release\'s line says «Default account» for the pool — the leg sees it', !!wNoteRed && gateOf(defNote.test(wNoteRed.pop)) && !poolNote.test(wNoteRed.pop), wNoteRed ? wNoteRed.pop.slice(0, 200) : 'the patched line is not there');
  // r2047 (5): the CODEX pool default's note too — «The pool's current member · refreshes as its sessions run», never «Default account»
  const codexPoolWorld = (UM) => {
    for (const k of Object.keys(els)) delete els[k];
    class AppC { }
    UM.installUsageMeter(AppC, {});
    const app = new AppC();
    app.settings = { get: () => undefined };
    const ids = { A: 'cxs-auto-a', P: 'pool-cx-p' };
    app._accounts = { accounts: [{ id: ids.A, backend: 'codex', type: 'subscription', name: 'Cx A' }, { id: ids.P, backend: 'codex', type: 'pooled', pooled: true, name: 'Cx Pool', members: [ids.A], current: ids.A }], defaultAccountId: null, defaultCodexAccountId: ids.P };
    app._accountUsage = {}; app._rateLimit = null; app._usageGlobal = {}; app._usageCodexGlobal = {};
    app._codexAccountUsage = { [ids.A]: R2d(0.3) };
    app._usageAcctSel = 'auto'; app._usageAcctSelCodex = 'auto'; app._usageEstimates = {};
    let err = null;
    try { app._renderUsage(); } catch (e) { err = e.message; }
    const txt = String(el('usage-popup').innerHTML || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    return { err, txt };
  };
  const cw = codexPoolWorld(UM);
  ok('B-2d35 the CODEX pool default\'s note says «The pool\'s current member · refreshes as its sessions run», never «Default account» (r2047 (5))', !cw.err && gateOf(/current member · refreshes as its sessions run/.test(cw.txt)) && !/Default account · refreshes as its sessions run/.test(cw.txt), cw.err || cw.txt.slice(0, 300));
  const umCxNote = await patchedImport('src/lib/usage-meter.js', 'codex-pool-note', [["      if (defAcct) codexNote = codexDefRow && codexDefRow.type === 'pooled' ? t('The pool\\'s current member · refreshes as its sessions run') : t('Default account · refreshes as its sessions run');", "      if (defAcct) codexNote = t('Default account · refreshes as its sessions run');"]]); // stale-pins: kept — the RED plants the release's codex note line
  const cwr = umCxNote ? codexPoolWorld(umCxNote) : null;
  ok('B-2d35 RED (the codex note): the release\'s line says «Default account» for the codex pool — the leg sees it', !!cwr && verdictOf(/Default account · refreshes as its sessions run/.test(cwr.txt)), cwr ? cwr.txt.slice(0, 200) : 'the patched line is not there');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 6 })) ok(r.name, verdictOf(r.pass), r.detail);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
