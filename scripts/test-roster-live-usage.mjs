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

console.log('— wiring pins');
{
  const ma = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  const um = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok('every usage cell the two rosters render is stamped (claude row via usageStampAttrs, claude global + host-own, codex row pool/loggedIn, codex global)', (ma.match(/data-usage-src=/g) || []).length === 6 && /acct-usage-cell"\$\{usageStampAttrs\}/.test(ma));
  ok('the claude row\'s stamp is the SAME decision as its snapshot (pool → current target; host-login → host-own; host-held → host:account; local → the account)', /const usageStamp = isPool \? \(a\.current \? \{ src: 'accounts', key: a\.current \} : null\)/.test(ma) && /\{ src: 'host-own', key: selectedHost \}/.test(ma) && /\{ src: 'host-account', key: selectedHost \+ ':' \+ a\.id \}/.test(ma) && /\(a\.loggedIn \|\| a\.oat\) \? \{ src: 'accounts', key: a\.id \} : null/.test(ma));
  ok('_renderUsage (every poll, every popup refresh) calls the repaint first', /_renderUsage\(\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*try \{ this\._repaintRosterUsage\?\.\(\); \} catch \{ \}/.test(um));
  ok('the repaint re-derives the two-soonest highlight per list it touched', /for \(const list of lists\) markSoonRows\(list\);/.test(ma));
  ok('the per-row ⟳ path still repaints its own row (unchanged)', /if \(u\) \{ cell\.innerHTML = this\._acctUsageHtml\(u, est\); markSoonRows\(cell\.closest\('\.acct-list'\)\); \}/.test(ma));
  ok('ci.mjs runs this suite', /'test-roster-live-usage'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
