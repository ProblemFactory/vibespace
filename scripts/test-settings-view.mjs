#!/usr/bin/env node
// THE SETTINGS VIEW, DECIDED (B-df40 part 2, 2026-10-03 — design desk settings-cleanup §2 P2; DOM-free like
// test-pool-placement-ui): what the Settings window draws is ONE PURE answer (src/lib/settings-view.js) —
//   §1 rowRelevant's truth table over every `when` tag (an unknown fact / tag / key HIDES NOTHING)
//   §2 the reasons in words, en / zh / ja from the real dictionaries
//   §3 the four rules on a fixture schema: a search shows every match with its chip; a modified row always
//      shows (both chips on an advanced one whose `when` is false); a false `when` hides the row and an emptied
//      category with its nav item; advanced rows fold into "N advanced settings hidden · Show"
//   §4 the SHIPPED schema: the Codex / OpenCode tables' `when` hides each whole section, Desktop apps without a
//      display backend, the Lark row without a Lark account; EVERY row reachable by search with the switch off
//      and every fact false (a loop, not a sample); the tier census printed
//   §5 wiring pins (the UI consumes the model; the facts' sources; the light adapters route; the harness `cli`)
//   §6 patched copies of settings-view.js, one per rule, each turns its own judge red (scripts/mutant-copy.mjs)
//   §7 (B-df40 part 3) the per-VENDOR rows derived from src/channel-settings.js: advanced, `when: {channel}`,
//      hidden without that vendor's account, the "Per vendor" block + its chip with one; a patched schema copy
// In-process, no DOM, no server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const V = await import('../src/lib/settings-view.js');
const S = await import('../src/lib/settings-schema.js');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const mkT = (dict) => (k, p) => { let s = (dict && dict[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
const tEn = mkT(null), tZh = mkT(zh), tJa = mkT(ja);

// a context over a plain value map: a key with no value answers undefined (= a key without a row)
const ctxOf = (vals = {}, facts = {}, names = {}) => ({ get: (k) => vals[k], facts, nameOf: (kind, id) => (names[kind] || {})[id] || null });

console.log('§1 rowRelevant — every tag');
const J = {}; // the judges §6 runs again on each patched copy
{
  J.truth = (M) => {
    const r = (when, vals, facts) => M.rowRelevant({ when }, ctxOf(vals, facts));
    return [
      r(undefined, {}, {}) === true,
      r({ setting: 'a', is: true }, { a: true }) === true, r({ setting: 'a', is: true }, { a: false }) === false,
      r({ setting: 'a', is: false }, { a: false }) === true, r({ setting: 'a', is: false }, { a: true }) === false,
      r({ setting: 'tz', isNot: '' }, { tz: 'Asia/Tokyo' }) === true, r({ setting: 'tz', isNot: '' }, { tz: '' }) === false,
      r({ setting: 'a' }, { a: 'x' }) === true, r({ setting: 'a' }, { a: 0 }) === false,
      r({ setting: 'nope', is: true }, {}) === true, // a key without a row: build-red in 44e, shown at runtime
      r({ fact: 'vnc' }, {}, { vnc: true }) === true, r({ fact: 'vnc' }, {}, { vnc: false }) === false, r({ fact: 'vnc' }, {}, {}) === true,
      r({ fact: 'desktopApps' }, {}, { desktopApps: false }) === false, r({ fact: 'desktopApps' }, {}, { desktopApps: undefined }) === true,
      r({ harness: 'codex' }, {}, { harnesses: new Set(['codex']) }) === true, r({ harness: 'codex' }, {}, { harnesses: new Set(['claude']) }) === false, r({ harness: 'codex' }, {}, { harnesses: null }) === true,
      r({ channel: 'lark' }, {}, { channels: new Set(['lark']) }) === true, r({ channel: 'lark' }, {}, { channels: new Set() }) === false, r({ channel: 'lark' }, {}, {}) === true,
    ].every(Boolean);
  };
  ok(J.truth(V), 'setting is / isNot / truthy, fact, harness, channel — each true, false, and NOT KNOWN (⇒ shown)');
  J.unknown = (M) => M.rowRelevant({ when: { weather: 'rain' } }, ctxOf()) === true && M.rowRelevant({ when: { setting: 'a', fact: 'vnc' } }, ctxOf({ a: false }, { vnc: false })) === true && M.clauseKind({ fact: 'vnc', harness: 'x' }) === null;
  ok(J.unknown(V), 'an unknown tag, or a clause with two tags, hides nothing at runtime (44e refuses both at build time)');
  J.allOf = (M) => {
    const w = [{ setting: 'a', is: true }, { setting: 'b', is: true }];
    return M.rowRelevant({ when: w }, ctxOf({ a: true, b: true })) && !M.rowRelevant({ when: w }, ctxOf({ a: true, b: false })) && !M.rowRelevant({ when: w }, ctxOf({ a: false, b: true }));
  };
  ok(J.allOf(V), 'an array `when` holds only while EVERY clause holds (the second clause is read, not just the first)');
  ok(JSON.stringify(V.WHEN_KINDS) === '["setting","fact","harness","channel"]' && Object.isFrozen(V.WHEN_KINDS) && S.WHEN_KINDS === V.WHEN_KINDS, 'WHEN_KINDS is the closed, frozen set — and settings-schema.js re-exports the same object (lane channel-declared-settings builds on it)');
  ok(JSON.stringify(V.WHEN_FACTS) === '["vnc","desktopApps"]' && JSON.stringify(V.TIERS) === '["advanced"]', 'WHEN_FACTS = vnc, desktopApps; TIERS = advanced');
}

console.log('§2 the reasons, in words');
{
  const names = { setting: { 'chat.compactMode': 'Compact mode', 'channels.offHoursTz': 'Working-hours time zone' }, harness: { codex: 'Codex' }, channel: { lark: 'Lark' } };
  const c = ctxOf({ 'chat.compactMode': false, 'channels.offHoursTz': '' }, { vnc: false, desktopApps: false, harnesses: new Set(), channels: new Set() }, names);
  const why = (when, t = tEn) => V.whyHidden({ when }, c, t);
  ok(why({ setting: 'chat.compactMode', is: true }) === 'turn on “Compact mode” first', 'setting is:true ⇒ "turn on “Compact mode” first"', why({ setting: 'chat.compactMode', is: true }));
  ok(why({ setting: 'channels.offHoursTz', isNot: '' }) === 'fill in “Working-hours time zone” first', 'setting isNot:"" ⇒ "fill in … first"');
  ok(why({ fact: 'desktopApps' }) === 'this machine has no display backend' && why({ fact: 'vnc' }) === 'this machine has no shared desktop (VNC)', 'facts ⇒ "this machine has no display backend" / "… shared desktop (VNC)"');
  ok(why({ harness: 'codex' }) === 'the Codex CLI is not installed on this machine' && why({ channel: 'lark' }) === 'no Lark account is linked', 'harness / channel ⇒ named by ctx.nameOf');
  ok(V.whyHidden({ when: { setting: 'chat.compactMode', is: false } }, c, tEn) === '', 'a relevant row has no reason ("")');
  const zhW = [why({ setting: 'chat.compactMode', is: true }, tZh), why({ fact: 'desktopApps' }, tZh), why({ harness: 'codex' }, tZh), why({ channel: 'lark' }, tZh), why({ setting: 'channels.offHoursTz', isNot: '' }, tZh)];
  const jaW = [why({ setting: 'chat.compactMode', is: true }, tJa), why({ fact: 'desktopApps' }, tJa), why({ harness: 'codex' }, tJa), why({ channel: 'lark' }, tJa), why({ setting: 'channels.offHoursTz', isNot: '' }, tJa)];
  ok(zhW.join('|') === '需先开启“Compact mode”|这台机器没有显示后端|这台机器没有安装 Codex CLI|没有关联的 Lark 账号|需先填写“Working-hours time zone”', 'zh words', zhW);
  ok(jaW.join('|') === '先に「Compact mode」をオンにしてください|このマシンには表示バックエンドがありません|このマシンには Codex CLI がインストールされていません|Lark アカウントが連携されていません|先に「Working-hours time zone」を入力してください', 'ja words', jaW);
  const keys = ['Show advanced settings', 'advanced', 'not in use here: {why}', '1 advanced setting hidden', '{n} advanced settings hidden', 'An advanced setting — shown while “Show advanced settings” is on', 'Advanced settings: timers, budgets, paces and operator switches', 'turn off “{label}” first', 'only used while “{label}” is {value}', 'not used while “{label}” is {value}', 'not used in this setup', 'Off — turn it on in Settings → Desktop apps', 'Off until you allow agents to use windows on your desktop (Settings → Desktop apps).'];
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(!missing.length, `every new key (${keys.length}) is in BOTH dictionaries — the chips, the switch, the hidden-count line, the repointed consent lines`, missing);
  ok(V.hiddenAdvancedText(3, tZh) === '已隐藏 3 项高级设置' && V.hiddenAdvancedText(1, tJa) === '詳細設定 1 件を非表示' && V.hiddenAdvancedText(1, tEn) === '1 advanced setting hidden', 'the hidden-count line: plural / singular, zh / ja');
}

console.log('§3 the four rules on a fixture schema');
{
  const F = {
    'a.plain': { type: 'boolean', default: true, label: 'Plain', description: 'everyday', category: 'A', liveApply: true },
    'a.adv1': { type: 'number', default: 5, label: 'Timer one', description: 'seconds', category: 'A', liveApply: true, tier: 'advanced' },
    'a.adv2': { type: 'number', default: 5, label: 'Timer two', description: 'seconds', category: 'A', liveApply: false, tier: 'advanced' },
    'a.dep': { type: 'enum', default: 'x', label: 'Dependent', description: 'needs plain off', category: 'A', liveApply: true, when: { setting: 'a.plain', is: false } },
    'b.gone': { type: 'boolean', default: false, label: 'Lark thing', description: 'vendor', category: 'B', liveApply: true, when: { channel: 'lark' } },
    'b.advgone': { type: 'number', default: 1, label: 'Lark pace', description: 'per second', category: 'B', liveApply: true, tier: 'advanced', when: { channel: 'lark' } },
    'c.onlyadv': { type: 'number', default: 1, label: 'Deep knob', description: 'ms', category: 'C', liveApply: true, tier: 'advanced' },
    'z.unlisted': { type: 'boolean', default: false, label: 'Orphan', description: 'no category listed', category: 'Nobody', liveApply: true },
  };
  const cats = ['A', 'B', 'C'];
  const vals = { 'a.plain': true };
  const ctx = { get: (k) => (k in F ? (k in vals ? vals[k] : F[k].default) : undefined), facts: { channels: new Set() }, nameOf: (kind, id) => (kind === 'channel' ? 'Lark' : kind === 'setting' ? F[id]?.label : null) };
  const vm = (M, o = {}) => M.settingsViewModel(F, { categories: cats, ctx, t: tEn, ...o });
  const paths = (sec) => sec.rows.map((r) => r.path).join(',');
  J.rule4 = (M) => { const m = vm(M); return paths(m.byCategory.A) === 'a.plain' && m.byCategory.A.hiddenAdvanced === 2 && m.byCategory.C.show && m.byCategory.C.rows.length === 0 && m.byCategory.C.hiddenAdvanced === 1; };
  ok(J.rule4(V), 'rule 4: switch OFF ⇒ A draws its everyday row and counts 2 advanced hidden; a category of only advanced rows (C) still draws — its "1 advanced setting hidden · Show" line');
  J.rule4on = (M) => { const m = vm(M, { showAdvanced: true }); const r = m.byCategory.A.rows.find((x) => x.path === 'a.adv2'); return paths(m.byCategory.A) === 'a.plain,a.adv1,a.adv2' && m.byCategory.A.hiddenAdvanced === 0 && r && r.chips.map((c) => c.kind).join(',') === 'advanced,reload'; };
  ok(J.rule4on(V), '…switch ON ⇒ the advanced rows draw, each with the `advanced` chip (+ `reload` where it applies), nothing counted');
  J.rule3 = (M) => { const m = vm(M, { showAdvanced: true }); return !m.byCategory.B.show && m.byCategory.B.hiddenAdvanced === 0 && !m.byCategory.A.rows.some((r) => r.path === 'a.dep') && m.sections.filter((s) => s.show).map((s) => s.category).join(',') === 'A,C'; };
  ok(J.rule3(V), 'rule 3: a false `when` hides the row; B (every row about an unlinked vendor) is not drawn at all — the nav lists A, C — and its advanced row is NOT counted as "advanced hidden"');
  J.rule1 = (M) => { const m = vm(M, { query: 'lark' }); const g = m.byCategory.B.rows.find((r) => r.path === 'b.gone'), a = m.byCategory.B.rows.find((r) => r.path === 'b.advgone'); return m.byCategory.B.show && g && a && g.chips.some((c) => c.kind === 'unused' && c.text === 'not in use here: no Lark account is linked') && a.chips.map((c) => c.kind).join(',') === 'advanced,unused' && m.hiddenAdvanced === 0; };
  ok(J.rule1(V), 'rule 1: a search shows every match — hidden and advanced alike — with the chip saying WHY in words; no hidden-count line while searching');
  J.rule2 = (M) => { const m = M.settingsViewModel(F, { categories: cats, ctx, t: tEn, isModified: (p) => p === 'b.advgone' || p === 'a.adv1' }); const r = m.byCategory.B.rows.find((x) => x.path === 'b.advgone'); return m.byCategory.B.show && r && r.chips.map((c) => c.kind).join(',') === 'advanced,unused' && m.byCategory.A.rows.some((x) => x.path === 'a.adv1') && m.byCategory.A.hiddenAdvanced === 1; };
  ok(J.rule2(V), 'rule 2 (V2): a MODIFIED advanced row whose `when` is false draws, with BOTH chips — and a modified advanced row is never counted as hidden');
  J.census = (M) => { const m = vm(M, { query: 'orphan' }); return m.drawn === 0 && !m.sections.some((s) => s.rows.some((r) => r.path === 'z.unlisted')); };
  ok(J.census(V), 'a row in a category the census list does not name is not drawn, even when searched (§44 semantics unchanged)');
  J.depLive = (M) => { vals['a.plain'] = false; const m = vm(M); vals['a.plain'] = true; return m.byCategory.A.rows.some((r) => r.path === 'a.dep'); };
  ok(J.depLive(V), 'the dependent row appears once its governing row has the value it waits for');
}

console.log('§4 the shipped schema');
{
  const SCHEMA = S.SETTINGS_SCHEMA, CATS = S.SETTINGS_CATEGORIES;
  const real = (facts, o = {}) => V.settingsViewModel(SCHEMA, { categories: CATS, ctx: { get: (k) => (SCHEMA[k] ? SCHEMA[k].default : undefined), facts, nameOf: () => null }, t: tEn, ...o });
  const none = { vnc: false, desktopApps: false, harnesses: new Set(['claude']), channels: new Set() };
  const all = { vnc: true, desktopApps: true, harnesses: new Set(['claude', 'codex', 'opencode']), channels: new Set(['lark', 'gmail']) };
  const m0 = real(none), m1 = real(all, { showAdvanced: true }), mu = real({});
  ok(!m0.byCategory.Codex.show && !m0.byCategory.OpenCode.show && m0.byCategory.Claude.show, 'a machine without the codex / opencode CLIs: the WHOLE Codex and OpenCode sections vanish (the table-level `when`), Claude stays');
  ok(m1.byCategory.Codex.show && m1.byCategory.Codex.rows.length === S.harnessSettingPaths('codex').length, '…with them installed, every derived Codex row draws');
  ok(!m0.byCategory['Desktop apps'].show && m1.byCategory['Desktop apps'].rows.length === 5 && mu.byCategory['Desktop apps'].show, 'Desktop apps: hidden without a display backend, its 5 rows with one, SHOWN while the fact is unknown');
  ok(!m0.byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField') && m1.byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField') && real({ channels: null }).byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField'), 'the Lark-only row: hidden with no Lark account, shown with one, shown when the accounts read failed (V3: a 401 / a timeout hides nothing)');
  const misses = Object.keys(SCHEMA).filter((p) => !real(none, { query: p }).sections.some((s) => s.rows.some((r) => r.path === p)));
  ok(misses.length === 0, `V1: EVERY one of the ${Object.keys(SCHEMA).length} rows is reachable by searching its key with the switch OFF and every fact false (a loop, not a sample)`, misses.slice(0, 5));
  const cloak = real(none, { query: 'cloakbrowser' });
  ok(cloak.sections.flatMap((s) => s.rows).some((r) => r.path === 'browser.cloak.executablePath' && r.chips.some((c) => c.kind === 'unused')), 'the switch dialog\'s deep link ("CloakBrowser") reaches the hidden-by-relevance CloakBrowser rows, each with its chip');
  const adv = Object.entries(SCHEMA).filter(([, r]) => r.tier === 'advanced').map(([k]) => k);
  const whens = Object.entries(SCHEMA).filter(([, r]) => r.when).length;
  console.log(`    tier census: ${adv.length} advanced of ${Object.keys(SCHEMA).length} rows; ${whens} rows carry a \`when\`; default view draws ${real(all).drawn} rows, ${real(all).hiddenAdvanced} advanced folded`);
  ok(adv.length >= 60 && adv.length <= 90, `the advanced tier holds ${adv.length} rows (the design's estimate ~75)`);
  const nav = real(none).sections.filter((s) => s.show).map((s) => s.category);
  ok(nav.length === real(none).sections.filter((s) => s.rows.length || s.hiddenAdvanced).length && !nav.includes('Codex'), `V4: the categories drawn (= the nav items) are exactly those with a row or a hidden-count line (${nav.length})`);
  const moved = { 'desktop.idleTimeoutMin': 'Desktop apps', 'desktop.appScale': 'Desktop apps', 'desktop.seamless': 'Desktop apps', 'desktop.backendPrefs': 'Desktop apps', 'window.realDesktopTargets': 'Desktop apps', 'claude.autoResumeOnLimit': 'Spending', 'agentd.autoGraduate': 'Session', 'agentd.localPipeSessions': 'Session', 'agentd.localDiscovery': 'Session', 'agents.jobNotify': 'Background Work' };
  const wrong = Object.entries(moved).filter(([k, c]) => SCHEMA[k]?.category !== c);
  ok(!wrong.length && S.settingsGroupOf('Desktop apps') === 'services', 'S4: the nine moves land in their categories; Desktop apps sits in the Services group', wrong);
  ok(!SCHEMA['agents.jobNotify'].when && SCHEMA['agents.toolJobs'].when?.setting === 'agents.vibespaceIntegration', 'agents.jobNotify carries NO master-switch `when` (it is read without it — ws-create / jobs.js); the Integration rows do');
}

console.log('§5 wiring pins');
{
  const ui = read('src/lib/settings-ui.js');
  ok(/settingsViewModel\(SETTINGS_SCHEMA, \{ categories: SETTINGS_CATEGORIES, query, showAdvanced: this\._showAdvanced, ctx: this\._viewCtx\(\)/.test(ui) && /for \(const cat of SETTINGS_CATEGORIES\) grouped\[cat\] = vm\.byCategory\[cat\];/.test(ui), '_renderContent draws the view model\'s answer, still walking SETTINGS_CATEGORIES (§44\'s coupling)');
  ok(/localStorage\.getItem\(SHOW_ADVANCED_KEY\) === '1'/.test(ui) && /localStorage\.setItem\(SHOW_ADVANCED_KEY/.test(ui) && V.SHOW_ADVANCED_KEY === 'vibespace.settingsAdvanced', 'the ONE header switch is persisted per device under vibespace.settingsAdvanced');
  ok(/if \(sec\.hiddenAdvanced\) section\.appendChild\(this\._hiddenAdvancedLine\(/.test(ui) && /this\._setShowAdvanced\(true\); this\._rerenderKeepingPlace\(/.test(ui), 'each category ends with the hidden-count line; its Show turns the switch on and keeps the category in place');
  ok(/if \(asksChannel\) \{\s*Promise\.resolve\(fetchJson\('\/api\/channels\/adapters'\)\)/.test(ui) && !/setInterval|setTimeout\(\(\) => this\._buildFacts/.test(ui), 'the accounts fact = ONE GET /api/channels/adapters per open, only when some row asks about a vendor; never on a timer');
  ok(/app\._desktopAppsAvailable === true \? true : app\._desktopAppsKnown \? false : undefined/.test(ui) && /app\._desktopAppsKnown = true;/.test(read('src/lib/desktop-app-launcher.js')), 'desktopApps is false only once the probe ANSWERED (an unanswered probe hides nothing)');
  ok(/this\._harnessesHere = new Set\(d\.harnesses\.filter\(\(h\) => h && h\.cli !== false\)/.test(read('src/lib/app.js')) && /row\.cli = h\.acp \? !!ACP_COMMANDS\[h\.id\] : cur == null \|\| String\(cur\)\.startsWith\('\/'\);/.test(read('src/server/cli-env.js')), 'the harness fact: /api/home rows carry `cli` (did the CLI resolve here — `installed` keeps the picker as it was)');
  ok(/router\.get\('\/api\/channels\/adapters', \(req, res\) => \{[\s\S]{0,200}engine\(\)\.adapterRecords\(\)\.adapters\.map\(\(r\) => \(\{ id: r\.id, kind: r\.kind, builtin: !!r\.builtin, enabled: r\.enabled !== false \}\)\)/.test(read('src/routes/channels.js')), 'GET /api/channels/adapters answers the accounts only — never the digest\'s conversations');
  ok(/if \(r\.tier !== undefined\) entry\.tier = r\.tier;/.test(read('src/lib/settings-schema.js')) && /when: \{ harness: 'codex' \}/.test(read('src/harness-settings.js')) && /when: \{ harness: 'opencode' \}/.test(read('src/harness-settings.js')), 'derived harness rows carry their tier and their TABLE\'s `when`');
}

console.log('§6 patched copies — each rule\'s judge goes red without it');
{
  const src = read('src/lib/settings-view.js');
  const M = mutantCopies('settings-view', REPO);
  const PATCHES = [
    ['rule 2 dropped (modified rows obey the hiding)', 'if (!q && !modified) {', 'if (!q) {', ['rule2']],
    ['rule 1 dropped (a search obeys the hiding)', 'if (!q && !modified) {', 'if (!modified) {', ['rule1']],
    ['ignorance hides (an unknown tag is false)', '    default: return null;\n', '    default: return false;\n', ['unknown']],
    ['rule 4 dropped (advanced rows always draw)', 'if (advanced && !showAdvanced) { sec.hiddenAdvanced++; continue; }', 'if (false) { sec.hiddenAdvanced++; continue; }', ['rule4']],
    ['rule 3\'s emptied category still drawn', 's.show = s.rows.length > 0 || s.hiddenAdvanced > 0;', 's.show = true;', ['rule3']],
    ['only the first clause of an array is read', 'for (const c of whenClauses(row && row.when)) if (clauseHolds(c, ctx) === false) return c;', '{ const c = whenClauses(row && row.when)[0]; if (c && clauseHolds(c, ctx) === false) return c; }', ['allOf']],
  ];
  let i = 0;
  for (const [name, from, to, judges] of PATCHES) {
    ok(src.includes(from), `the patch site of "${name}" is in the module (a moved line would make this control vacuous)`);
    const f = M.write('src/lib/settings-view.js', src.replace(from, to), `m${i++}`, { esm: true });
    const Mut = await import(pathToFileURL(f).href);
    const red = judges.filter((j) => { try { return !J[j](Mut); } catch { return true; } });
    ok(red.length === judges.length && judges.every((j) => J[j](V)), `NEGATIVE CONTROL — ${name}: ${judges.join(', ')} RED on the copy, green on the real module`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: PATCHES.length })) ok(r.pass, r.name, r.detail);
}

console.log('§7 the per-vendor channel rows (B-df40 part 3), derived from src/channel-settings.js');
{
  const CS = (await import('../src/channel-settings.js')).default;
  const SCHEMA = S.SETTINGS_SCHEMA, CATS = S.SETTINGS_CATEGORIES;
  const J7 = {};
  J7.derived = (Smod) => Object.values(CS.CHANNEL_SETTINGS).every((tbl) => tbl.rows.every((r) => {
    const e = Smod.SETTINGS_SCHEMA[CS.settingPath(r.key)];
    return e && e.tier === 'advanced' && e.when && e.when.channel === tbl.vendor && e.channel === tbl.vendor && e.category === 'Channels' && e.liveApply === true
      && e.default === r.default && e.min === r.min && e.max === r.max && e.step === r.step && e.label === r.label && e.type === 'number';
  }));
  ok(J7.derived(S) && S.channelSettingPaths('lark').join(',') === 'channels.budgetLarkPerMin,channels.larkRequestsPerSec' && S.channelSettingPaths('gmail').join(',') === 'channels.budgetGmailPerMin,channels.gmailUnitsPerSec',
    'every table row is a Channels row under today\'s key: advanced, `when: { channel: <vendor> }`, `channel` on the entry, the table\'s own default / min / max / step / label');
  const nameOf = (kind, id) => (kind === 'channel' ? S.channelVendorName(id) : null);
  const view = (channels, o = {}) => V.settingsViewModel(SCHEMA, { categories: CATS, ctx: { get: (k) => (SCHEMA[k] ? SCHEMA[k].default : undefined), facts: { channels }, nameOf }, t: tEn, showAdvanced: true, ...o }).byCategory.Channels;
  const vendorPaths = (sec) => sec.rows.filter((r) => r.schema.channel).map((r) => r.path).join(',');
  ok(vendorPaths(view(new Set())) === '' && vendorPaths(view(new Set(['lark']))) === 'channels.budgetLarkPerMin,channels.larkRequestsPerSec' && vendorPaths(view(new Set(['lark', 'gmail']))).split(',').length === 4,
    'a vendor without a linked account hides its rows (switch ON — relevance, not tier); with a Lark account the Lark pair draws, the Gmail pair stays hidden; both accounts ⇒ all four');
  ok(vendorPaths(view(null)).split(',').length === Object.values(CS.CHANNEL_SETTINGS).reduce((n, tbl) => n + tbl.rows.length, 0) && vendorPaths(view(null)).includes('channels.budgetSlackPerMin'), '…and an unanswered accounts read (a 401, a timeout) hides none of them — every vendor\'s rows, Slack\'s included (ignorance hides nothing)');
  const off = view(new Set(['lark', 'gmail']), { showAdvanced: false });
  ok(vendorPaths(off) === '' && off.hiddenAdvanced >= 4, `switch OFF ⇒ the vendor rows fold into the category's hidden-count line with the engine's advanced rows (${off.hiddenAdvanced})`);
  const mod = view(new Set(['lark']), { showAdvanced: false, isModified: (p) => p === 'channels.budgetGmailPerMin' });
  const g = mod.rows.find((r) => r.path === 'channels.budgetGmailPerMin');
  ok(g && g.chips.map((c) => c.kind).join(',') === 'advanced,unused' && g.why === 'no Gmail account is linked', 'a Gmail budget set earlier stays drawn after the account is gone, with both chips — "no Gmail account is linked" (the vendor named by its table)', g && g.chips);
  ok(V.whyHidden(SCHEMA['channels.larkRequestsPerSec'], { facts: { channels: new Set() }, nameOf }, tZh) === '没有关联的 Lark 账号' && V.whyHidden(SCHEMA['channels.gmailUnitsPerSec'], { facts: { channels: new Set() }, nameOf }, tJa) === 'Gmail アカウントが連携されていません', 'the reason in zh / ja, the vendor named from the table');
  const searched = V.settingsViewModel(SCHEMA, { categories: CATS, query: 'quota units per second', ctx: { get: () => undefined, facts: { channels: new Set() }, nameOf }, t: tEn }).byCategory.Channels;
  ok(searched.rows.some((r) => r.path === 'channels.gmailUnitsPerSec' && r.chips.some((c) => c.kind === 'unused')), 'a search still finds a hidden vendor row, with its chip (rule 1)');
  const words = ['Per vendor', 'Read by the Channels engine · {vendor}', 'Each service\'s own request budget and pace, per linked account. A service\'s rows show while one of its accounts is linked.', 'Gmail',
    'Reactions are read only for the messages an open window shows, one call per message, at most this many a minute per account (0 = never list — reactions arrive only as live events). Checked before the account\'s per-minute vendor budget, so reading reactions never takes the budget new messages need.'];
  const missing = words.filter((k) => !zh[k] || !ja[k]);
  ok(!missing.length && tZh('Read by the Channels engine · {vendor}', { vendor: 'Lark' }) === '由频道引擎读取 · Lark' && SCHEMA['channels.reactionsPerMin'].description === words[4], 'the block title, its note, the chip and the vendor name are in BOTH dictionaries; the reactions row no longer points at a budget "above" (the vendor rows moved below)', missing);
  const ui = read('src/lib/settings-ui.js');
  ok(/const vendorRows = items\.filter\(\(it\) => it\.schema\.channel\);/.test(ui) && /if \(!schema\.channel\) section\.appendChild\(this\._renderSetting\(path, schema, chips\)\);/.test(ui) && /st\.dataset\.channelBlock = 'vendor'; st\.textContent = t\('Per vendor'\);/.test(ui),
    'the window draws the category\'s own rows first, then ONE "Per vendor" sub-block with the derived rows');
  ok(/else if \(schema\.channel\) this\._renderChannelChip\(info, schema\);/.test(ui) && /t\('Read by the Channels engine · \{vendor\}', \{ vendor: channelVendorName\(schema\.channel\) \}\)/.test(ui) && /kind === 'channel' \? channelVendorName\(id\) : null/.test(ui),
    'a derived vendor row\'s apply-chip slot says "Read by the Channels engine · Lark"; the hidden-reason names the vendor through channelVendorName');
  const ssrc = read('src/lib/settings-schema.js');
  const FROM = "    tier: 'advanced', when: { channel: tbl.vendor },\n";
  ok(ssrc.includes(FROM) && !/'channels\.(budgetLarkPerMin|budgetGmailPerMin|gmailUnitsPerSec|larkRequestsPerSec)': \{/.test(ssrc), 'the patch site of the derivation control is in settings-schema.js, and none of the four rows is hand-written there any more');
  const M = mutantCopies('settings-view-channel', REPO);
  const Smut = await import(pathToFileURL(M.write('src/lib/settings-schema.js', ssrc.replace(FROM, ''), 'nowhen', { esm: true })).href);
  ok(!J7.derived(Smut) && Smut.SETTINGS_SCHEMA['channels.budgetLarkPerMin'] && !Smut.SETTINGS_SCHEMA['channels.budgetLarkPerMin'].when, 'NEGATIVE CONTROL — a schema copy whose derived vendor rows lose `tier` + `when` is RED on the derivation judge (green on the real module)');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

console.log(`\ntest-settings-view: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('ALL PASS (' + pass + ')');
