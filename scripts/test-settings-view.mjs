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
//   §8 THE STORE'S NOTIFIER WALKS A SNAPSHOT (lane guards-door): a listener that unsubscribes itself and subscribes a
//      fresh one while it runs (a row that redraws) is called ONCE — the real SettingsManager in a child under a 4 s
//      deadline; CONTROL: a copy walking the live Set never returns (killed at the deadline ⇒ RED)
//   §6 patched copies of settings-view.js, one per rule, each turns its own judge red (scripts/mutant-copy.mjs)
//   §7 (B-df40 part 3) the per-VENDOR rows derived from src/channel-settings.js: advanced, `when: {channel}`,
//      hidden without that vendor's account, the "Per vendor" block + its chip with one; a patched schema copy
//   §11 (lane settings-multiline-row) a textarea row STACKS (the renderer's line off the control it drew, the two textarea
//      branches) and THE RAIL keeps a row's words ≥ 40 % — the style.css block's rules + its place; the chrome half
//      (600 / 760 / 1200 / phone 390, the pre-fix control) is test-settings-row-layout (heavy)
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
  const all = { vnc: true, desktopApps: true, harnesses: new Set(['claude', 'codex', 'opencode', 'antigravity']), channels: new Set(['lark', 'gmail']) };
  const m0 = real(none), m1 = real(all, { showAdvanced: true }), mu = real({});
  ok(!m0.byCategory.Codex.show && !m0.byCategory.OpenCode.show && m0.byCategory.Claude.show, 'a machine without the codex / opencode CLIs: the WHOLE Codex and OpenCode sections vanish (the table-level `when`), Claude stays');
  ok(m1.byCategory.Codex.show && m1.byCategory.Codex.rows.length === S.harnessSettingPaths('codex').length, '…with them installed, every derived Codex row draws');
  ok(!m0.byCategory['Desktop apps'].show && m1.byCategory['Desktop apps'].rows.length === 9 && mu.byCategory['Desktop apps'].show, 'Desktop apps: hidden without a display backend, its 9 rows with one (lane agent-window-no-steal: + Agent-opened windows come to the front; lane app-display-portal: + file dialogs in their own window; lane app-display-notify-sink: + notifications in their own window; lane app-display-secrets: + apps keep their logins), SHOWN while the fact is unknown');
  ok(!m0.byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField') && m1.byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField') && real({ channels: null }).byCategory.Channels.rows.some((r) => r.path === 'channels.larkNameField'), 'the Lark-only row: hidden with no Lark account, shown with one, shown when the accounts read failed (V3: a 401 / a timeout hides nothing)');
  const misses = Object.keys(SCHEMA).filter((p) => !real(none, { query: p }).sections.some((s) => s.rows.some((r) => r.path === p)));
  ok(misses.length === 0, `V1: EVERY one of the ${Object.keys(SCHEMA).length} rows is reachable by searching its key with the switch OFF and every fact false (a loop, not a sample)`, misses.slice(0, 5));
  const cloak = real(none, { query: 'cloakbrowser' });
  { const cr = cloak.sections.flatMap((s) => s.rows).filter((r) => r.path === 'browser.cloak.executablePath' || r.path === 'browser.cloak.egressAllowlist');
    ok(cr.length === 2 && cr.every((r) => !r.chips.some((c) => c.kind === 'unused')) && !('browser.cloak.enabled' in SCHEMA), 'the switch dialog\'s deep link ("CloakBrowser") reaches both live CloakBrowser rows with no "not in use here" chip — lane dc-browser-providers deleted the never-run container switch they hid behind', cr.map((r) => r.path)); }
  const adv = Object.entries(SCHEMA).filter(([, r]) => r.tier === 'advanced').map(([k]) => k);
  const whens = Object.entries(SCHEMA).filter(([, r]) => r.when).length;
  console.log(`    tier census: ${adv.length} advanced of ${Object.keys(SCHEMA).length} rows; ${whens} rows carry a \`when\`; default view draws ${real(all).drawn} rows, ${real(all).hiddenAdvanced} advanced folded`);
  // ≤ 95 (lane antigravity-harness): every harness's extra-args row is advanced, and agy's is the fourth harness's
  ok(adv.length >= 60 && adv.length <= 96, `the advanced tier holds ${adv.length} rows (the design's estimate ~75; ≤ 95 since lane dm-reply-infers' channels.replyInferHours made it 91; ≤ 96 since lane engine-plugin's browser.defaultEngine — the design's tier for it)`);
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
  ok(/settingsViewModel\(SETTINGS_SCHEMA, \{ categories: SETTINGS_CATEGORIES, query, showAdvanced: this\._showAdvanced, ctx: this\._viewCtx\(\)/.test(ui) && /for \(const cat of SETTINGS_CATEGORIES\) grouped\[cat\] = this\._onlyCategory && cat !== this\._onlyCategory \? \{ \.\.\.vm\.byCategory\[cat\], show: false \} : vm\.byCategory\[cat\];/.test(ui), '_renderContent draws the view model\'s answer, still walking SETTINGS_CATEGORIES (§44\'s coupling)');
  ok(/localStorage\.getItem\(SHOW_ADVANCED_KEY\) === '1'/.test(ui) && /localStorage\.setItem\(SHOW_ADVANCED_KEY/.test(ui) && V.SHOW_ADVANCED_KEY === 'vibespace.settingsAdvanced', 'the ONE header switch is persisted per device under vibespace.settingsAdvanced');
  ok(/if \(sec\.hiddenAdvanced\) section\.appendChild\(this\._hiddenAdvancedLine\(/.test(ui) && /this\._setShowAdvanced\(true\); this\._rerenderKeepingPlace\(/.test(ui), 'each category ends with the hidden-count line; its Show turns the switch on and keeps the category in place');
  ok(/if \(asksChannel\) \{\s*Promise\.resolve\(fetchJson\('\/api\/channels\/adapters'\)\)/.test(ui) && !/setInterval|setTimeout\(\(\) => this\._buildFacts/.test(ui), 'the accounts fact = ONE GET /api/channels/adapters per open, only when some row asks about a vendor; never on a timer');
  ok(/app\._desktopAppsAvailable === true \? true : app\._desktopAppsKnown \? false : undefined/.test(ui) && /app\._desktopAppsKnown = true;/.test(read('src/lib/desktop-app-launcher.js')), 'desktopApps is false only once the probe ANSWERED (an unanswered probe hides nothing)');
  ok(/this\._harnessesHere = new Set\(d\.harnesses\.filter\(\(h\) => h && h\.cli !== false\)/.test(read('src/lib/app.js')) && /row\.cli = \(h\.acp \|\| h\.exe\) \? !!ACP_COMMANDS\[h\.id\] : cur == null \|\| String\(cur\)\.startsWith\('\/'\);/.test(read('src/server/cli-env.js')), 'the harness fact: /api/home rows carry `cli` (did the CLI resolve here — `installed` keeps the picker as it was)');
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
  ok(/const vendorRows = items\.filter\(\(it\) => it\.schema\.channel\);/.test(ui) && /if \(schema\.channel\) continue;/.test(ui) && /section\.appendChild\(this\._renderSetting\(path, schema, chips\)\);/.test(ui) && /st\.dataset\.channelBlock = 'vendor'; st\.textContent = t\('Per vendor'\);/.test(ui),
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

console.log('§8 the store\'s notifier walks a snapshot of its listeners');
{
  const { spawnSync } = await import('node:child_process');
  const drive = (url) => spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    const { SettingsManager } = await import(${JSON.stringify('%URL%')});
    const s = new SettingsManager(); let calls = 0;
    const sub = () => { const f = () => { calls++; s.off('channels.guardAttachmentsReview', f); sub(); }; s.on('channels.guardAttachmentsReview', f); };
    sub(); s.on('channels.guardAttachmentsReview', () => { calls += 100; });
    s.set('channels.guardAttachmentsReview', false);
    if (s._saveTimer) clearTimeout(s._saveTimer);
    console.log(JSON.stringify({ calls, listeners: s._listeners['channels.guardAttachmentsReview'].size }));`.replace('%URL%', url)], { encoding: 'utf8', timeout: 4000 });
  const verdict = (r) => { let o = null; try { o = JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch {} return { green: r.status === 0 && !!o && o.calls === 101 && o.listeners === 2, o, signal: r.signal, err: String(r.stderr || '').slice(0, 300) }; };
  const real = verdict(drive(pathToFileURL(path.join(REPO, 'src/lib/settings.js')).href));
  ok(real.green, 'a listener that re-subscribes while it runs is called ONCE (the other listener once too), the store returns, 2 listeners stay', JSON.stringify(real));
  const SNAP = 'for (const cb of [...listeners]) {';
  const ssrc = read('src/lib/settings.js');
  ok(ssrc.split(SNAP).length === 2, 'the notifier walks a snapshot, spelled once where the control reverts it');
  const M = mutantCopies('settings-notify', REPO);
  const mut = M.write('src/lib/settings.js', ssrc.replace(SNAP, 'for (const cb of listeners) {'), 'liveset', { esm: true });
  const red = verdict(drive(pathToFileURL(mut).href));
  ok(!red.green && red.signal === 'SIGTERM', `CONTROL: a copy walking the LIVE Set never returns — killed at the 4 s deadline (${red.signal}) ⇒ RED`, JSON.stringify(red));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

console.log('§9 the LLM plugin rows (lane decision-attention, D2): the person\'s block + the threshold');
{
  const SCHEMA = S.SETTINGS_SCHEMA;
  const b = SCHEMA['decision.attentionBlock'], th = SCHEMA['decision.threshold'];
  ok(b && b.type === 'text' && b.multiline === true && b.maxLength === 1500 && b.draft === 'decision' && b.default === '' && !b.tier && !b.when && b.liveApply === true, '"What matters to me": a multiline text of at most 1 500 characters, everyday (no tier, no when), with the draft button', b && { type: b.type, multiline: b.multiline, maxLength: b.maxLength, draft: b.draft, tier: b.tier });
  ok(th && th.type === 'number' && th.default === 0.7 && th.min === 0.5 && th.max === 0.9 && th.step === 0.05 && th.tier === 'advanced' && !th.block && th.alsoBlock === 'attention', 'the threshold: a number 0.50–0.90, default 0.70, step 0.05 — ONE row in 插件 › LLM (tier advanced, plugin-settings-p0) that the 「需关注 · 怎么判断」 block draws too (int263 seam b); was: a slider in the 「需关注 · 怎么判断」 block, out of Advanced (lane attention-policy)', th && { d: th.default, min: th.min, max: th.max, tier: th.tier });
  ok(b.category === th.category && zh[b.label] && zh[th.label] && zh[b.description] && zh[th.description], 'both rows sit in the Channels category, their label and description worded in zh');
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf8');
  ok(/schema\.type === 'text' && schema\.multiline/.test(UI) && /'\/api\/channels\/decision\/draft'/.test(UI) && !/draft[\s\S]{0,400}this\.settings\.set\(path, r\.text/.test(UI), 'the UI draws the multiline row as a textarea, its draft button asks /api/channels/decision/draft, and the proposal is NEVER saved by itself (only Save / an edit saves)');
}

console.log('§9b 插件 › LLM (lane llm-plugin-rename, owner 2026-10-14): ordered by FEATURE — each switch, then its own rows; the drafter\'s own switch; no row says the old name or "judge"');
{
  const SCHEMA = S.SETTINGS_SCHEMA;
  const PS = (await import('../src/plugin-settings.js')).default;
  const tbl = PS.PLUGIN_SETTINGS.llm;
  const paths = Object.entries(SCHEMA).filter(([, r]) => r.category === 'Plugin: LLM').map(([p]) => p);
  const ORDER = ['plugin.llm.attention', 'decision.threshold', 'decision.attentionBlock', 'decision.implicitLabels', 'plugin.llm.rules', 'plugin.llm.routing', 'plugin.llm.inbox', 'plugin.llm.judgeModel', 'plugin.llm.learn', 'plugin.llm.learnModel', 'plugin.llm.dailyBudgetUsd'];
  ok(tbl && tbl.label === 'LLM' && tbl.integration === 'llm' && paths.join() === ORDER.join(), `the section 「插件 › LLM」, in feature order: the judge (its four switches, attention's own rows after it, the judging model they share), the drafter (switch, model), the budget last (${paths.map((p) => p.split('.').pop()).join(' · ')})`);
  ok(['attention', 'rules', 'routing', 'inbox'].every((k) => SCHEMA['plugin.llm.' + k].type === 'boolean' && SCHEMA['plugin.llm.' + k].default === false) && SCHEMA['plugin.llm.learn'].type === 'boolean' && SCHEMA['plugin.llm.learn'].default === true,
    'the judge\'s four switches stay OFF by default (each bills by itself); the drafter\'s switch is ON (a draft is the owner\'s own click)');
  const jm = SCHEMA['plugin.llm.judgeModel'];
  ok(jm && jm.type === 'string' && jm.default === '' && !S.SETTINGS_SCHEMA['plugin.llm.model'], 'judgeModel: a text row, empty by default (the preset\'s / the provider\'s model) — the card\'s model field moved here');
  const rows = paths.map((p) => SCHEMA[p]);
  const words = rows.flatMap((r) => [r.label, r.description, ...((r.options || []).map((o) => o.label))]).filter(Boolean);
  const OLD = /Decision API|决策 ?API|判定 ?API|decision-api|\bjudge\b/i;
  const all = [...words, ...words.map((w) => zh[w] || ''), ...words.map((w) => ja[w] || '')];
  ok(words.length >= 22 && !all.some((w) => OLD.test(w)), `no row says the old name or "judge" in en / zh / ja (${words.length} strings ×3) — 「判断模型」 is the word for the model that judges`, all.filter((w) => OLD.test(w)).join(' | '));
  const keys = tbl.rows.flatMap((r) => [r.label, r.description, ...((r.options || []).map((o) => o.label))]).filter(Boolean).map((x) => (Array.isArray(x) ? x[0] : x));   // the dictionary keys (a templated description's own key)
  ok(keys.length === words.length && keys.every((w) => zh[w] && ja[w]) && !keys.some((w) => OLD.test(w) || OLD.test(zh[w]) || OLD.test(ja[w])), `every word of the section in zh and ja (${keys.length} keys)`, keys.filter((w) => !zh[w] || !ja[w]).join(' | '));
  const descs = rows.map((r) => r.description);
  ok(descs.every((d) => /\b(Example|E\.g\.)/.test(d)), 'every row carries ONE example (the card-grammar law: what you get + an example + where it shows)', descs.filter((d) => !/\b(Example|E\.g\.)/.test(d)).join(' | '));
  ok(zh[SCHEMA['plugin.llm.judgeModel'].label] === '判断模型' && zh[SCHEMA['decision.attentionBlock'].label] === '我在乎什么' && zh[SCHEMA['decision.threshold'].label] === '需关注阈值', 'the zh words: 「判断模型」, 「我在乎什么」, 「需关注阈值」 (no 「（决策 API）」 suffix)');
  ok(OLD.test('Needs-attention threshold (Decision API)') && OLD.test('How sure the judge must be') && OLD.test('我在乎什么（决策 API）'), 'CONTROL: the base\'s words are caught by the same needle');
}

console.log('§10 「需关注 · 怎么判断」 (lane attention-policy): one block of rows — the rule switches, the preset, the judge\'s switch, its dials');
{
  const SCHEMA = S.SETTINGS_SCHEMA, CATS = S.SETTINGS_CATEGORIES;
  const FO = await import('../src/channel-focus.js');
  const block = Object.entries(SCHEMA).filter(([, r]) => r.block === 'attention' || r.alsoBlock === 'attention').map(([p]) => p);   // int263 seam b: + the plugin's two rows the block draws too
  const rules = FO.ATTENTION_RULES.map((c) => `channels.attention.rule.${c}`);
  ok(block.join() === ['channels.attention.preset', ...rules, 'channels.attention.judge', 'decision.threshold', 'decision.attentionBlock'].join(), 'the block, in order: the preset, the eight rule switches, the judge\'s switch, its threshold, "what matters to me"', block.join());
  const rows = block.map((p) => SCHEMA[p]);
  ok(rows.filter((r) => r.block).every((r) => r.category === SCHEMA['channels.offHoursTz'].category && r.liveApply === true && !r.tier && !r.when && r.blockTitle === rows[0].blockTitle), 'every row: category Channels, liveApply, everyday (no tier / when), the block\'s one head');
  ok(rules.every((p) => SCHEMA[p].type === 'boolean' && SCHEMA[p].default === true && !SCHEMA[p].store), 'each fixed rule: a boolean, default ON (today\'s first screen), stored in settings');
  const pre = SCHEMA['channels.attention.preset'], jr = SCHEMA['channels.attention.judge'];
  ok(pre.type === 'enum' && pre.radio === true && pre.store === 'derived' && pre.default === 'both' && pre.options.map((o) => o.value).join() === Object.keys(FO.ATTENTION_PRESETS).join(), 'the preset: a radio over the PURE presets, derived (it stores nothing — it sets the switches)', pre.options.map((o) => o.value).join());
  ok(jr.type === 'boolean' && jr.store && jr.store.plugin === 'llm' && jr.store.feature === 'attention' && jr.fact === 'attention-today', 'the judge\'s switch IS the LLM plugin\'s `attention` feature (one store) with the today readout beside it');
  const words = [rows[0].blockTitle, ...rows.flatMap((r) => [r.label, r.description]), ...pre.options.map((o) => o.label), 'Today: judged {n} · {m} needed you', 'Open in Settings', 'How "needs attention" is decided'];
  const miss = words.filter((w) => !zh[w] || !ja[w]);
  ok(!miss.length, `every word of the block in zh and ja (${words.length} strings)`, miss.join(' | '));
  ok(zh[rows[0].blockTitle] === '需关注 · 怎么判断' && zh[SCHEMA['channels.attention.rule.direct'].label] === '有人直接发给我、我还没读的' && zh[jr.label] === '让判断模型挑出需要我的（LLM 插件）', 'the owner\'s words: 「需关注 · 怎么判断」, 「有人直接发给我、我还没读的」, 「让判断模型挑出需要我的（LLM 插件）」');
  // THE SETTINGS SEARCH finds the block by its head (typing 需关注 in zh / attention in en)
  const zhSchema = Object.fromEntries(Object.entries(SCHEMA).map(([p, r]) => [p, { ...r, label: zh[r.label] || r.label, description: zh[r.description] || r.description, blockTitle: r.blockTitle && (zh[r.blockTitle] || r.blockTitle) }]));
  const find = (schema, q) => V.settingsViewModel(schema, { categories: CATS, query: q, ctx: { get: (k) => (SCHEMA[k] ? SCHEMA[k].default : undefined), facts: {}, nameOf: () => null }, t: tEn }).sections.flatMap((s) => s.rows.map((r) => r.path));
  const hitZh = find(zhSchema, '需关注'), hitEn = find(SCHEMA, 'attention');
  const own = block.filter((p) => SCHEMA[p].block);   // int263 seam b: the plugin's two rows are found in 插件 › LLM
  ok(own.every((p) => hitZh.includes(p)) && own.every((p) => hitEn.includes(p)), `the Settings search finds every row of the block: 需关注 (${hitZh.filter((p) => own.includes(p)).length}/${own.length}) · attention (${hitEn.filter((p) => own.includes(p)).length}/${own.length})`);
  const noHead = Object.fromEntries(Object.entries(zhSchema).map(([p, r]) => [p, { ...r, blockTitle: undefined }]));
  ok(!find(noHead, '需关注').includes('channels.attention.rule.replied'), 'CONTROL: without the head in the search words, 需关注 misses 「我 24 小时内回过的」 ⇒ the leg above is the head\'s doing');
  // lane attention-rule-at-you: the 8th switch, its owner words, found by 「@」 in zh and en
  const AY = SCHEMA['channels.attention.rule.at-you'];
  ok(AY && FO.ATTENTION_RULES.includes('at-you') && zh[AY.label] === '有人 @ 了我、我还没读的' && zh[AY.description] === '群里或单聊里点名 @ 你、24 小时内还没读的消息。', 'the 8th rule: 「有人 @ 了我、我还没读的」 with its hint, a switch of the block', AY && zh[AY.label]);
  ok(find(zhSchema, '@').includes('channels.attention.rule.at-you') && find(SCHEMA, '@').includes('channels.attention.rule.at-you'), 'the Settings search 「@」 finds the at-you row (zh and en)');
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf8');
  ok(/if \(schema\.store\) return this\._createStoredElsewhere\(path, schema, row\);/.test(UI) && /\/api\/plugins\/\$\{encodeURIComponent\(id\)\}\/config/.test(UI) && !UI.slice(UI.indexOf('  _createStoredElsewhere(path, schema, row) {'), UI.indexOf('  _createSlider(path, schema, row, value) {')).includes('this.settings.set(path'), 'a stored-elsewhere row never writes settings: the judge\'s switch writes through the plugin\'s own config door');
  ok(/if \(schema\.slider\) return this\._createSlider/.test(UI) && /input\.type = 'range'/.test(UI) && /renderBlock\(block, \{ items = null \} = \{\}\)/.test(UI), 'the threshold draws as a range; ONE renderBlock serves the Settings window and the Channels door');
}

// ── lane decision-spend-readout: the judge's MONEY where Settings names the judge (owner 2026-10-13) ──
{
  console.log('\nthe LLM plugin\'s money in Settings (lane decision-spend-readout)');
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf8');
  const DM = (await import('../src/decision-model.js')).default;
  const BUDGET = 'plugin.llm.dailyBudgetUsd';
  const SCHEMA = S.SETTINGS_SCHEMA;
  const wired = (ui) => ui.includes(`const DECISION_BUDGET_PATH = '${BUDGET}';`) && /if \(path === DECISION_BUDGET_PATH\) this\._renderDecisionToday\(info\);/.test(ui)
    && /_renderDecisionToday\(info\) \{[\s\S]{0,400}liveDecisionLine\(line, \(L\) => paintDecisionLine\(line, L, 'text'\)\);/.test(ui);
  ok(SCHEMA[BUDGET] && SCHEMA[BUDGET].type === 'number' && wired(UI), 'the budget row (plugin.llm.dailyBudgetUsd) draws today\'s money against its cap under it — the PURE line, live');
  ok(!wired(UI.replace('    if (path === DECISION_BUDGET_PATH) this._renderDecisionToday(info);', '')), 'RED CONTROL: without the row\'s dispatch line the leg above is red');
  const att = UI.slice(UI.indexOf('  _renderAttentionToday(info) {'), UI.indexOf('  _renderDecisionToday(info) {'));
  ok(/money && money\.on \? ' · ' \+ money\.spend : ''/.test(att) && /liveDecisionLine\(line, \(L\) => \{ money = L; draw\(\); \}\)/.test(att), 'the 需关注 block\'s judge line adds the money (the PURE line\'s spend half), patched in place');
  ok(/if \(cat === t\('Spending'\)\) this\._renderDecisionSpend\(section, content, nav\);/.test(UI) && /paintDecisionLine\(line, L, 'month'\)/.test(UI) && /pluginCategoryOf\('llm'\)/.test(UI), 'Settings › Spending lists the LLM plugin (today / cap / month) with a door to its section');
  const tz = (w, v = {}) => String(zh[w] || w).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const L = DM.decisionTodayLine({ byUse: { attention: { calls: 60, usd: 0.009, hits: 1 }, inbox: { calls: 3, usd: 0.001 } } }, 1, { t: tz, monthUsd: 0.4 });
  ok(L.text === '今天：判断了 63 条 · 命中 1 条 · 已花 < $0.01（上限 $1.00）' && L.short === '今天 < $0.01 / $1.00 · 判断 63 · 命中 1' && L.title === '需关注 $0.009 · 托盘 $0.001 · 规则 $0' && L.month === 'LLM · 今天 < $0.01 / $1.00 · 本月 $0.40', 'zh: the owner\'s words — 「今天：判断了 63 条 · 命中 1 条 · 已花 < $0.01（上限 $1.00）」', L);
  const words = ['Today {spent} / {cap} · judged {n} · hits {m}', 'The LLM plugin is off — it spends nothing', 'LLM · today {spent} / {cap} · this month {month}', 'Needs attention', 'For-you tray', 'Rules', 'Routing', 'Webhooks', 'Test', '{spent} spent (limit {cap})', 'Open settings'];
  const miss = words.filter((w) => !zh[w] || !ja[w]);
  ok(!miss.length, `every word of the readout in zh and ja (${words.length} strings)`, miss.join(' | '));
}

// ── lane settings-multiline-row (owner 2026-10-14 「这个地方布局有点问题」): a row never squeezes its words ──
console.log('§11 a textarea row stacks; the rail keeps the words ≥ 40 % (the chrome half: test-settings-row-layout)');
{
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf8');
  const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const STACK = "if (control.tagName === 'TEXTAREA' || control.querySelector('textarea')) row.classList.add('settings-row-stack');";
  const render = UI.slice(UI.indexOf('  _renderSetting(path, schema, chips = null) {'), UI.indexOf('  renderBlock(block'));
  ok(render.includes('const control = this._createControl(path, schema, row);\n    controlWrap.appendChild(control);\n') && render.includes(STACK), 'the row renderer stamps settings-row-stack off the control it drew — every textarea row, whichever branch made it');
  const factory = UI.slice(UI.indexOf('  _createControl('), UI.indexOf('  _refreshControl('));
  ok((factory.match(/createElement\('textarea'\)/g) || []).length === 2 && /schema\.type === 'json'/.test(factory) && /schema\.type === 'text' && schema\.multiline/.test(factory), 'the control factory makes a textarea in two branches (json, the multi-line text) — both reach the line above');
  const block = (CSS.match(/\/\* SETTINGS ROWS NEVER SQUEEZE THEIR WORDS[\s\S]*?\/\* end: settings rows never squeeze their words \*\//) || [''])[0];
  const rule = (sel) => { const m = block.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[1] : ''; };
  ok(/flex-direction: column/.test(rule('.settings-row.settings-row-stack')) && /align-items: stretch/.test(rule('.settings-row.settings-row-stack')), 'THE STACK: a stacked row is a column, the words and the control each across it');
  const box = rule('.settings-row-stack .settings-json');
  ok(/width: 100%/.test(box) && /min-width: 0/.test(box) && /min-height: 4\.5em/.test(box) && /resize: vertical/.test(box), 'its box spans the row (no 200 px floor), at least 4.5em tall, resized vertically');
  ok(/justify-content: flex-end/.test(rule('.settings-multiline')) && /flex: 1 1 100%/.test(rule('.settings-multiline > .settings-multiline-text')), 'the box on a line of its own, its buttons on the next one at the right');
  ok(/flex-wrap: wrap/.test(rule('.settings-row')) && /min-width: 40%/.test(rule('.settings-row-info')) && /margin-left: auto/.test(rule('.settings-row-control')), 'THE RAIL: a row wraps, its words keep ≥ 40 %, a wrapped control sits at the right');
  const at = (s) => CSS.indexOf(s), start = at('/* SETTINGS ROWS NEVER SQUEEZE THEIR WORDS');
  ok(start > 0 && ['.settings-row {\n', '.settings-row-info {', '.settings-row-control {', '.settings-json {\n', '.settings-link-btn {'].every((s) => at(s) >= 0 && at(s) < start), 'the block comes after the rules it overrides (a specificity tie goes to the later rule)');
  ok(block && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block), 'theme vars only — no literal colour in the block');
}

// ── lane idle-paint-default-on (the owner 2026-10-20 「可以」): browser.idlePaintFreeze is ON by default — ONE default ──
console.log('§12 browser.idlePaintFreeze: the row\'s default is src/browser-idle.js IDLE_PAINT_DEFAULT (on); a stored value is kept');
{
  const { createRequire } = await import('node:module');
  const BI = createRequire(import.meta.url)('../src/browser-idle.js');
  const KEY = 'browser.idlePaintFreeze';
  const rowDefault = (SS) => SS.SETTINGS_SCHEMA[KEY] && SS.SETTINGS_SCHEMA[KEY].default === BI.IDLE_PAINT_DEFAULT && BI.IDLE_PAINT_DEFAULT === true;
  ok(rowDefault(S) && S.SETTINGS_SCHEMA[KEY].type === 'boolean' && S.SETTINGS_SCHEMA[KEY].tier === 'advanced', 'the row\'s default is IDLE_PAINT_DEFAULT = true (the keeper\'s read takes the same value — test-browser-display)', S.SETTINGS_SCHEMA[KEY]);
  const { SettingsManager } = await import('../src/lib/settings.js');
  const mgr = (vals) => { const m = new SettingsManager(); m._values = { ...vals }; return m; };
  const unset = mgr({}), off = mgr({ [KEY]: false }), on = mgr({ [KEY]: true });
  const turnedOff = mgr({}); turnedOff.set(KEY, false); clearTimeout(turnedOff._saveTimer); turnedOff._saveTimer = null;
  const backOn = mgr({ [KEY]: false }); backOn.set(KEY, true); clearTimeout(backOn._saveTimer); backOn._saveTimer = null;
  ok(unset.get(KEY) === true && !unset.isModified(KEY) && off.get(KEY) === false && on.get(KEY) === true && on.isModified(KEY),
    'the Settings model: never set ⇒ on (the default); a stored false stays off and a stored true stays stored — a default never rewrites a stored value');
  ok(turnedOff._values[KEY] === false && turnedOff.get(KEY) === false && !(KEY in backOn._values) && backOn.get(KEY) === true,
    'the door: turning it off STORES false (the server\'s read sees it); turning it back on drops the override (sparse storage — the default is on)');
  const ssrc12 = read('src/lib/settings-schema.js'), LIT = "    type: 'boolean', default: IDLE_PAINT_DEFAULT,\n    label: t('Stop drawing in a browser nobody watches'),";
  const M12 = mutantCopies('settings-view-idle', REPO);
  const Slit = await import(pathToFileURL(M12.write('src/lib/settings-schema.js', ssrc12.replace(LIT, LIT.replace('default: IDLE_PAINT_DEFAULT,', 'default: false,')), 'literal-default', { esm: true })).href);
  ok(ssrc12.includes(LIT) && !rowDefault(Slit), 'CONTROL: a row that keeps a literal default of its own (the .331 `false`) is RED on the default row');
  for (const r of copiesCensus(M12.files, M12.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

// §13 lane owner-press-attended (R3, r2) — A HALF-TYPED NUMBER NEVER REACHES THE SERVER, AND THE ROW SAYS WHAT IS SAVED.
// userW (2026-10-28) typed 200 into Settings → Spending at 00:40 PT; his 00:47:34 press was refused; the file was written
// at 00:48:01 — the row showed nothing. r1 made every keystroke commit; the acceptance MEASURED (accept-r1 MAJOR) that a
// 500 ms pause after the first digit POSTed it — claude.transcriptRetentionDays «730» wrote cleanupPeriodDays=7 on the
// spot, a prefix under a row's min was stored AT the min. So the field commits on `change` (Enter / blur) only, exactly as
// the base did, and the WORDS ride `input`: «Not saved yet — press Enter or leave the field» → «Saving…» → «Saved · in
// force now: N» (it stays until the next edit). The REAL SettingsManager (fetch + localStorage stood in, the POST answered
// with the server's own budgetLimits echo) and the REAL bindNumberField over an input-like object, on a VIRTUAL clock
// (setTimeout swapped for this block): the store's own 500 ms debounce, deterministically, at no wall time.
console.log('§13 a typed number is saved on Enter / blur only, its row says «Not saved yet — press Enter…» → «Saving…» → «Saved», a Spending row says the server\'s number in force');
{
  const { SettingsManager } = await import('../src/lib/settings.js');
  const SA = (await import('node:module')).createRequire(import.meta.url)(path.join(REPO, 'src/spend-authorizer.js'));
  const PATH = 'spend.unattendedPerIdentityHour', DAY = 'spend.unattendedPerIdentityDay', KEEP = 'claude.transcriptRetentionDays', HOT = 'channels.pollHotSec';
  const saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const vt = { now: 0, q: [], id: 0 };
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  const advance = async (ms) => {
    const end = vt.now + ms;
    for (;;) { vt.q.sort((x, y) => x.at - y.at || x.id - y.id); const nx = vt.q[0]; if (!nx || nx.at > end) break; vt.q.shift(); vt.now = nx.at; nx.fn(); await flush(); }
    vt.now = end; await flush();
  };
  globalThis.setTimeout = (fn, ms) => { const id = ++vt.id; vt.q.push({ id, at: vt.now + (Number(ms) || 0), fn }); return id; };
  globalThis.clearTimeout = (id) => { vt.q = vt.q.filter((x) => x.id !== id); };
  globalThis.localStorage = { getItem() { return null; }, setItem() { } };
  const posts = [];
  let slow = null, server = {};
  globalThis.fetch = async (url, o = {}) => {
    if (o.method === 'POST') {
      const body = JSON.parse(o.body);
      if (body[PATH] === 40) throw new Error('offline');   // the failing leg's value
      if (body[PATH] === 41) return new Promise((res, rej) => { slow = { res, rej }; });   // the slow-hub leg: held, then failed
      posts.push({ at: vt.now, body });
      server = { ...body };
      return { ok: true, json: async () => ({ success: true, spend: SA.budgetLimits((k) => body[k]) }) };   // routes/persistence.js's echo
    }
    return { ok: true, json: async () => ({ ...server }) };
  };
  try {
    const type = async (bind, keys, p = PATH, { pauseAfterFirst = 0, blur = false } = {}) => {
      const sm = new SettingsManager();
      const states = [], typed = [];
      sm.onSaveState((q, st) => { if (q === p) states.push(st); });
      const input = { value: String(S.SETTINGS_SCHEMA[p].default), oninput: null, onchange: null };
      const bound = [];
      bind(input, sm, bound, p, typed);
      posts.length = 0;
      let last = 0;
      for (const [i, v] of keys.entries()) { input.value = v; if (input.oninput) input.oninput(); last = vt.now; await advance(i === 0 && pauseAfterFirst ? pauseAfterFirst : 100); }
      await advance(700);
      const beforeChange = posts.slice();
      if (blur && input.onchange) { input.onchange(); await advance(700); }
      return { sm, states, typed, input, bound, last, beforeChange, posts: posts.slice() };
    };
    const real = (input, sm, bound, p, typed) => V.bindNumberField(input, { schema: S.SETTINGS_SCHEMA[p], path: p, settings: sm, clamp: (n) => S.clampToSchema(S.SETTINGS_SCHEMA[p], n), onBound: (c) => bound.push(c), onTyping: (x) => typed.push(x) });
    // the r1 field (b8d2d98e), as it was written: EVERY keystroke committed through the store (the acceptance's RED)
    const r1 = (input, sm, bound, p) => { const commit = (final) => { const num = parseFloat(input.value); if (!Number.isFinite(num)) return; const c = S.clampToSchema(S.SETTINGS_SCHEMA[p], num); if (JSON.stringify(sm.get(p)) !== JSON.stringify(c.value)) sm.set(p, c.value); if (final && c.bound) input.value = c.value; }; input.oninput = () => commit(false); input.onchange = () => commit(true); };
    // the transcript-deletion road: «730» typed with a 700 ms pause after the «7», never blurred
    const k1 = await type(real, ['7', '73', '730'], KEEP, { pauseAfterFirst: 700 });
    const k0 = await type(r1, ['7', '73', '730'], KEEP, { pauseAfterFirst: 700 });
    ok(k1.beforeChange.length === 0 && k1.sm.get(KEEP) === S.SETTINGS_SCHEMA[KEEP].default && k1.typed[k1.typed.length - 1] === true,
      'r2 «730» typed into claude.transcriptRetentionDays with a 700 ms pause after the «7» and NO Enter / blur ⇒ 0 POSTs (the store unchanged; the row says «not saved yet»)', JSON.stringify(k1.beforeChange.map((x) => x.body[KEEP])));
    ok(k0.beforeChange.some((x) => x.body[KEEP] === 7), 'r2 CONTROL (the r1 field, every keystroke committed): the same typing POSTs cleanupPeriodDays 7 — the acceptance\'s transcript-deletion road', JSON.stringify(k0.beforeChange.map((x) => x.body[KEEP])));
    const g = await type(real, ['2', '20', '200'], PATH, { blur: true });
    const hit = g.posts.find((x) => x.body[PATH] === 200);
    ok(g.beforeChange.length === 0 && !!hit && g.posts.length === 1, 'r2 typed 200 then Enter / blur ⇒ ONE POST (200), after the change and only then', JSON.stringify(g.posts.map((x) => x.body[PATH])));
    ok(g.typed[0] === true && g.typed[g.typed.length - 1] === false && g.states.includes('pending') && g.states.includes('saving') && g.states[g.states.length - 1] === 'saved' && g.sm.saveStateOf(PATH) === 'saved',
      'r2 …the row ran typed (the field differs, nothing stored) → pending → saving → saved', JSON.stringify({ typed: g.typed, states: g.states }));
    await advance(10000);
    const still = g.sm.saveStateOf(PATH);
    g.sm.set(PATH, 201);
    const pendingAfterEdit = g.sm.saveStateOf(PATH);
    await advance(700);   // let that edit's own POST go before the next leg counts
    ok(still === 'saved' && pendingAfterEdit === 'pending', 'r2 «Saved» STAYS (10 s later still saved) until the next edit makes it pending', still);
    const inForce = V.inForceOf(PATH, { live: g.sm.liveEcho(), server: (k) => g.sm.serverValue(k), budgetLimits: SA.budgetLimits });
    ok(inForce === 200 && V.saveMarkWords('saved', tEn, { inForce }) === 'Saved · in force now: 200' && V.saveMarkWords('typed', tEn, { inForce: 30 }) === 'Not saved yet — press Enter or leave the field · in force now: 30'
      && V.saveMarkWords('typed', tEn) === 'Not saved yet — press Enter or leave the field' && V.saveMarkWords('pending', tEn) === 'Saving…' && V.saveMarkWords('saving', tEn) === 'Saving…' && V.saveMarkWords('idle', tEn) === ''
      && V.saveMarkWords('typed', tZh) === '未保存——按回车或离开输入框即可保存' && V.saveMarkWords('saved', tJa, { inForce: 200 }) === '保存しました · 現在有効：200',
      'r2 …the mark says it in words (en / zh / ja), a Spending row with the number the SERVER echoed (200)', String(inForce));
    // the clamp happens at the change only: a prefix under the min is never stored at the min, a value over the max is
    const h = await type(real, ['1', '12', '120'], HOT, { pauseAfterFirst: 700, blur: true });
    const h0 = await type(r1, ['1', '12', '120'], HOT, { pauseAfterFirst: 700 });
    ok(h.beforeChange.length === 0 && h.posts.length === 1 && h.posts[0].body[HOT] === 120 && h.bound.length === 0, 'r2 «120» into channels.pollHotSec (min 10) with a pause after the «1» ⇒ nothing until the change, then 120 — never 10', JSON.stringify(h.posts.map((x) => x.body[HOT])));
    ok(h0.beforeChange.some((x) => x.body[HOT] === 10), 'r2 CONTROL (the r1 field): the «1» was stored AT the min (10) during the pause', JSON.stringify(h0.beforeChange.map((x) => x.body[HOT])));
    const c = await type(real, ['3', '30', '3000'], DAY, { blur: true });
    ok(c.beforeChange.length === 0 && c.posts.length === 1 && c.posts[0].body[DAY] === 2000 && c.input.value === 2000 && c.bound.length === 1 && c.bound[0].bound === 'max',
      'r2 a value over the maximum is clamped AT THE CHANGE: stored 2000, written back into the field and SAID (the R2-verify toast: «kept at the maximum»)', JSON.stringify({ posts: c.posts.map((x) => x.body), field: c.input.value }));
    const f = await type(real, ['4', '40'], PATH, { blur: true });
    ok(f.sm.saveStateOf(PATH) === 'failed' && /^Not saved — the server did not answer/.test(V.saveMarkWords('failed', tEn)), 'R3 a save that does not land reads «Not saved — the server did not answer…» (never «Saved»)', f.sm.saveStateOf(PATH));
    // the slow hub (accept-r1 settings-marks leg 2): 41's POST is still out when 42 is saved; 42 lands, THEN 41 fails
    {
      const sm = new SettingsManager();
      sm.set(PATH, 41); await advance(600);
      sm.set(PATH, 42); await advance(600);
      const mid = sm.saveStateOf(PATH);
      slow.rej(new Error('slow hub')); await advance(10);
      ok(mid === 'saved' && sm.saveStateOf(PATH) === 'saved' && server[PATH] === 42, 'r2 a failed save never outlives a LATER save that landed: 41 out, 42 saved, 41 fails ⇒ the row still reads «Saved» (the latest POST\'s outcome is the row\'s)', JSON.stringify({ mid, now: sm.saveStateOf(PATH), server: server[PATH] }));
    }
    {
      const sm = new SettingsManager();
      sm.set(PATH, 41); await advance(600);
      slow.rej(new Error('slow hub')); await advance(10);
      const mid = sm.saveStateOf(PATH);
      sm.set(PATH, 42); await advance(600);
      ok(mid === 'failed' && sm.saveStateOf(PATH) === 'saved', 'r2 …and a save that lands AFTER a failure clears it: «Not saved» → «Saved»', JSON.stringify({ mid, now: sm.saveStateOf(PATH) }));
    }
    // the in-force number has ONE source (accept-r1 MINOR, the two-tab leg): tab A saved 50, tab B saves 80 ⇒ A's row says 80
    {
      const A1 = new SettingsManager(), B1 = new SettingsManager();
      const marks = [];
      A1.onSaveState((q) => { if (q === PATH) marks.push(V.saveMarkWords(A1.saveStateOf(PATH), tEn, { inForce: V.inForceOf(PATH, { live: A1.liveEcho(), server: (k) => A1.serverValue(k), budgetLimits: SA.budgetLimits }) })); });
      A1.set(PATH, 50); await advance(600);
      const a50 = marks[marks.length - 1];
      B1.set(PATH, 80); await advance(600);
      const echoB = B1.liveEcho();
      A1.applyRemote({ ...server }, { spend: echoB && echoB.spend });   // the settings-updated broadcast carries the server's recomputed `spend`
      const a80 = marks[marks.length - 1];
      A1.applyRemote({ ...server, [PATH]: 100 });   // an older hub's broadcast (no `spend`) — the echo is dropped, budgetLimits over its values speaks
      const a100 = V.inForceOf(PATH, { live: A1.liveEcho(), server: (k) => A1.serverValue(k), budgetLimits: SA.budgetLimits });
      server = { ...server, [PATH]: 120 };
      await A1.refetch();
      const a120 = V.inForceOf(PATH, { live: A1.liveEcho(), server: (k) => A1.serverValue(k), budgetLimits: SA.budgetLimits });
      ok(a50 === 'Saved · in force now: 50' && a80 === 'Saved · in force now: 80' && a100 === 100 && a120 === 120,
        'r2 the in-force number has ONE source: tab A saved 50, tab B saved 80 ⇒ A\'s row REDRAWS to «in force now: 80» on the broadcast; a broadcast with no `spend` and a reconnect refetch drop A\'s own echo (100, 120)', JSON.stringify({ a50, a80, a100, a120 }));
    }
    const sm5 = new SettingsManager();
    sm5._server = { [PATH]: 500 };   // a hand edit above the clamp (the server reads it, budgetLimits clamps it at CAP_MAX)
    const clamp = V.inForceOf(PATH, { live: null, server: (k) => sm5.serverValue(k), budgetLimits: SA.budgetLimits });
    ok(clamp === SA.CAP_MAX.perIdentityHour && V.inForceOf('chat.compactMode', { server: () => true, budgetLimits: SA.budgetLimits }) === null, `R3 a Spending row says the number the server USES — a stored 500 reads in force ${clamp} (CAP_MAX); a row the spend guard does not read says none`);
    // NO ROW COMMITS ON INPUT: every plain number row of the schema, typed into with the real binding — the store is never written
    const rows = Object.keys(S.SETTINGS_SCHEMA).filter((k) => S.SETTINGS_SCHEMA[k].type === 'number' && !S.SETTINGS_SCHEMA[k].slider && !S.SETTINGS_SCHEMA[k].store);
    let writes = 0;
    for (const k of rows) { const inp = { value: '', oninput: null, onchange: null }; V.bindNumberField(inp, { schema: S.SETTINGS_SCHEMA[k], path: k, settings: { get: () => S.SETTINGS_SCHEMA[k].default, set: () => { writes++; } }, clamp: (n) => S.clampToSchema(S.SETTINGS_SCHEMA[k], n) }); for (const v of ['1', '12', '123']) { inp.value = v; inp.oninput(); } }
    ok(rows.length >= 50 && writes === 0, `r2 NO number row commits on input: ${rows.length} rows typed into, ${writes} store writes (a live-commit road does not exist for a typed number)`);
  } finally {
    Object.assign(globalThis, saved);
  }
  const ui = read('src/lib/settings-ui.js');
  ok(/bindNumberField\(input, \{/.test(ui) && /onTyping: \(typed\) => this\._markTyped\(path, typed\)/.test(ui) && /if \(schema\.type === 'number' && !schema\.slider && !schema\.store\) controlWrap\.appendChild\(this\._saveMark\(path\)\);/.test(ui) && /saveMarkWords\(st, t, \{ inForce \}\)/.test(ui),
    'R3 wiring: the Settings number field is bound by bindNumberField (its typing marks the row), and every number row carries the save mark');
  const per = read('src/routes/persistence.js');
  ok(/const spend = writeSettings\(data\);\n\s+res\.json\(\{ success: true, \.\.\.\(spend \? \{ spend \} : \{\}\) \}\);/.test(per) && /broadcast\(\{ type: 'settings-updated', settings: data, \.\.\.\(spend \? \{ spend \} : \{\}\) \}\);/.test(per)
    && /this\.settings\.applyRemote\(msg\.settings, \{ spend: msg\.spend \|\| null \}\);/.test(read('src/lib/app.js')),
    'r2 wiring: the ONE settings writer computes the in-force `spend` once — the POST echoes it AND the settings-updated broadcast carries it to every tab');
}

console.log(`\ntest-settings-view: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('ALL PASS (' + pass + ')');
