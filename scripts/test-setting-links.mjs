#!/usr/bin/env node
// lane setting-doors pick 1 (主开发 2026-11-14) — A DOOR TO ONE SETTING: `vibespace://settings/<key>`, written in plain text by an agent
// or by the product's own sentences, is a link wherever the owner reads words; a click opens Settings on that row and WRITES NOTHING.
// The owner, after a For-you item could only describe the way to a ceiling in words: «…或者至少你应该能提供一个 vibespace://settings/
// 之类的链接可以让我点了之后直通对应的选项来改». PURE + in-process (the heavy twin, test-setting-links-chrome, presses the links).
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 900)); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SL = require(path.join(REPO, 'src/internal-link.js'));   // lane login-request-card piece 1: the settings row of the scheme's ONE module (src/setting-links.js folded in)
const A = require(path.join(REPO, 'src/spend-authorizer.js'));
const KEYS = new Set(['spend.unattendedPerInstanceDay', 'spend.unattendedPerIdentityDay', 'spend.unattendedPerIdentityHour', 'spend.allowOverageTurns', 'chat.uploadDir', 'plugin.voice-input.language']);
const has = (k) => KEYS.has(k);
const keysOf = (t) => SL.settingLinkHits(t, has).map((h) => h.key);

console.log('① the grammar (src/internal-link.js\'s settings row, PURE)');
{
  ok(SL.SCHEME === 'vibespace://settings/' && SL.settingLink('spend.unattendedPerInstanceDay') === 'vibespace://settings/spend.unattendedPerInstanceDay', 'the spelling: vibespace://settings/<the schema\'s dotted key>');   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  ok(gateOf(A.DOOR_LINK_WORDS) && gateOf(/\{link\}/.test(A.DOOR_LINK_WORDS.spending)) && verdictOf(/const SL = Object\.freeze\(\{ settingLink: \(key\) => `vibespace:\/\/settings\/\$\{key\}` \}\);/.test(read('src/spend-authorizer.js'))), 'the spend authorizer (PURE, imports nothing) spells the link with the SAME scheme');
  const T = [
    ['Raise it: vibespace://settings/spend.unattendedPerInstanceDay.', ['spend.unattendedPerInstanceDay'], 'a sentence\'s full stop is shed'],
    ['（vibespace://settings/spend.unattendedPerIdentityDay）。', ['spend.unattendedPerIdentityDay'], 'CJK punctuation around it is shed (the shared trailing set)'],
    ['vibespace://settings/spend.nope', [], 'an unknown key stays plain text'],   // stale-pins: kept — a leg's own name — not a pin
    ['vibespace://settings/chat.uploadDir?value=/tmp&x=1', ['chat.uploadDir'], 'NO VALUE PART: `?value=` ends the key and stays text'],
    ['vibespace://settings/chat.uploadDir=9', ['chat.uploadDir'], '`=` ends the key'],
    ['xvibespace://settings/chat.uploadDir and /vibespace://settings/chat.uploadDir', [], 'not inside a longer word or another path'],
    ['vibespace://settings/plugin.voice-input.language, then vibespace://settings/spend.allowOverageTurns', ['plugin.voice-input.language', 'spend.allowOverageTurns'], 'two in one text; a plugin row\'s key with dashes'],
    ['vibespace://settings/spend.unattendedPerInstanceDay.max', ['spend.unattendedPerInstanceDay'], 'the longest KNOWN key wins, cut back at a dot'],
  ];
  for (const [t, want, why] of T) ok(JSON.stringify(keysOf(t)) === JSON.stringify(want), `${why} — ${JSON.stringify(t).slice(0, 70)}`, keysOf(t));
  const seg = SL.splitSettingLinks('see vibespace://settings/chat.uploadDir.', has);
  ok(seg.length === 3 && seg[1].key === 'chat.uploadDir' && seg.map((x) => x.text).join('') === 'see vibespace://settings/chat.uploadDir.', 'segments rebuild the text byte for byte, the link its own segment', seg);
  ok(SL.keyOfAnchor('#vs-setting-spend.allowOverageTurns') === 'spend.allowOverageTurns' && SL.keyOfAnchor('#vs-setting-a"b') === null && SL.keyOfAnchor('#other') === null, 'the chat\'s pre-sanitize anchor names only a key-shaped key');
  ok(SL.settingLinkHits('vibespace://settings/chat.uploadDir', null).length === 0, 'with no schema to ask, nothing is a link');
}

console.log('② the product\'s own sentences carry the row (the Spending family)');
{
  const v = { why: 'day-cap', limits: { perIdentityHour: 30, perIdentityDay: 200, perInstanceDay: 800 }, counts: { hour: 1, day: 200, instanceDay: 210 }, identity: { key: 'k', name: 'acct' }, producers: {} };
  ok(A.spendRowOf(v) === 'spend.unattendedPerIdentityDay' && A.spendRowOf({ why: 'hour-cap' }) === 'spend.unattendedPerIdentityHour' && A.spendRowOf({ why: 'instance-cap' }) === 'spend.unattendedPerInstanceDay' && A.spendRowOf({ why: 'overage-in-use' }) === 'spend.allowOverageTurns' && A.spendRowOf({ why: 'identity-unknown' }) === null,
    'each refusal names ITS row: the hour, the day, the instance ceiling, the overage switch; a refusal no setting can help names none');
  const txt = A.refusalText ? A.refusalText(v, {}) : '';
  ok(verdictOf(/The limit: vibespace:\/\/settings\/spend\.unattendedPerIdentityDay — the owner changes it there\.$/.test(txt)), 'the refusal line (the journal\'s, an agent\'s typed refusal) ends with the row\'s link and whose press it is', txt);
  const i18n = A.refusalI18n ? A.refusalI18n(v, { sessionName: 'c' }) : null;
  const door = i18n && (i18n.detail || []).find((d) => d.key === A.DOOR_LINK_WORDS.spending);
  ok(gateOf(door) && gateOf(door.params) && door.params.link === 'vibespace://settings/spend.unattendedPerIdentityDay', 'the For-you notice\'s door line (translated on the page) carries the row\'s link as {link}', i18n && i18n.detail);
  // (the links unit's follow-up on 2.369.410 — the three owed row links) AN EMPTY CEILING NAMES ITS ROW, AS ITS LINK: the agent's
  // sentence (said ONCE — the refusal line no longer adds «The limit:» after a detail that carries it), the For-you notice's door line
  // (DOOR_LINK_WORDS.unset), the hand-over toast (the stash summary's words)
  {
    const Lu = A.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? '' : undefined));
    const vu = A.authorizeUnattendedSpend({ reason: 'peer-message', identity: { key: 'k', name: 'acct' }, state: A.emptyBudget(), limits: Lu });
    const ROW = 'vibespace://settings/spend.unattendedPerIdentityHour', once = (t) => String(t).split(ROW).length - 1;
    const tu = A.refusalText(vu, {}), iu2 = A.refusalI18n(vu, { sessionName: 'c' }), du = (iu2.detail || []).find((d) => d.key === A.DOOR_LINK_WORDS.unset);
    const SSm = require(path.join(REPO, 'src/stash-summary.js'));
    const toast = SSm.handOverRefusalWords({ code: 'spend_refused', why: 'hour-cap', cap: 0, capUnset: true, identity: { key: 'k', name: 'acct' } }, (k, q) => String(k).replace(/\{(\w+)\}/g, (m, x) => (q && q[x] !== undefined ? String(q[x]) : m)), {});
    ok(vu.ok === false && vu.capUnset === true && once(tu) === 1 && gateOf(/no cap is set for unattended turns per identity per hour[^]*: vibespace:\/\/settings\/spend\.unattendedPerIdentityHour/.test(tu))
      && gateOf(du) && gateOf(du.params) && du.params.link === ROW && once(toast.text) === 1 && toast.door === 'spending',
      'AN EMPTY CEILING NAMES ITS ROW: the agent\'s refusal (once), the For-you notice\'s door line ({link}), the hand-over toast', { tu, du, toast: toast.text });
    const src = read('src/spend-authorizer.js'), from = "door = row && !String(v.detail || '').includes(SL.settingLink(row)) ? ";
    if (!src.includes(from)) throw new Error('mutant anchor missing: the refusal line\'s «said once» rule');
    const fm = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-spend-once-')), 'spend-authorizer.cjs');
    fs.writeFileSync(fm, editAnchor(src, from, 'door = row ? ', "src/spend-authorizer.js"));
    const Am = require(fm);
    ok(once(Am.refusalText(Am.authorizeUnattendedSpend({ reason: 'peer-message', identity: { key: 'k', name: 'acct' }, state: Am.emptyBudget(), limits: Am.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? '' : undefined)) }), {})) === 2,
      'RED CONTROL: a refusal line without the «said once» rule says the empty row\'s link twice — the leg above would read it');
    fs.rmSync(path.dirname(fm), { recursive: true, force: true });
  }
  const iu = A.refusalI18n ? A.refusalI18n({ why: 'identity-unknown', limits: v.limits, counts: v.counts }, {}) : null;
  ok(gateOf(iu) && verdictOf((iu.detail || []).some((d) => d.key === A.DOOR_WORDS.wiring)), 'a refusal that names no row keeps its words (no link to a row that cannot help)');
  const w = A.noticeText({ identity: { name: 'acct' }, scope: 'day', used: 160, limit: 200, pct: 80 });
  ok(gateOf(/\(80%\) — the limit: vibespace:\/\/settings\/spend\.unattendedPerIdentityDay\./.test(w)) && verdictOf(/— the limit: vibespace:\/\/settings\/spend\.unattendedPerInstanceDay\./.test(A.noticeText({ scope: 'instance', used: 1, limit: 2, pct: 50 }))), 'the 80 % warning names its ceiling\'s row (it named no setting before) — right after the counts', w);
  // l2 (主开发 2026-11-15): the For-you question is stored under 300 characters (spend-guard fileInbox); a 27+ character account name
  // and four producers once cut a link said LAST — said before the producers, the stored question keeps it whole
  const longW = A.noticeText({ identity: { name: 'a-very-long-account-name-for-the-owner' }, scope: 'day', used: 160, limit: 200, pct: 80, producers: { 'auto-resume': 40, 'stop-nudge': 30, 'job-notification': 20, 'peer-message': 10 } });
  const stored = String(longW).slice(0, 300);
  ok(longW.length > 300 - 60 && gateOf(keysOf(stored).includes('spend.unattendedPerIdentityDay')) && gateOf(/spend\.unattendedPerIdentityDay\./.test(stored)) && verdictOf(/slice\(0, 300\)/.test(read('src/server/spend-guard.js'))), 'l2: a 38-character account name and four producers — the question as STORED (300 characters) still holds the whole link', { len: longW.length, stored });
  const g = read('src/server/spend-guard.js');
  ok(gateOf(/Adjust this one in Settings → Spending — vibespace:\/\/settings\/\$\{A\.spendRowOf\(v\)\}/.test(g)) && verdictOf(/The limit, to raise or lower it: vibespace:\/\/settings\/\$\{A\.warnRowOf\(r\.warn\)\}/.test(g)), 'the guard\'s two For-you notices: the refusal\'s detail and the warning\'s detail carry the row');
  const pr = read('src/routes/persistence.js');
  ok(verdictOf(/const why = spendWriteWhy\(req\), door = `vibespace:\/\/settings\/\$\{row \|\| rows\[0\]\}`, noRow = row \? '' : ` \(«\$\{hit\[0\]\}» is no setting\)`;/.test(pr)), 'the settings door\'s own refusal (pick 0) carries a REAL row\'s link (f2: a key that is no row names the limits\' first row and says so)');
  ok(verdictOf(/const row = spendRowOf\(\{ why: r && r\.why \}\);[\s\S]{0,400}app\.openSettingAt\(row\)/.test(read('src/lib/stash-strip.js'))), 'the hand-over toast\'s door opens the refused ceiling\'s row (was: the Spending section)');
}

console.log('③ THE CENSUS — every product sentence that names a place in Settings (grep-derived, printed with its class)');
{
  const RE = /Settings ?(›|>|→)|⚙ ?→|设置 ?(›|→|>)|in Settings|change it in|raise it in/;
  // the dictionaries and lane ui-needs-a-button's census table (src/ui-needs.js) QUOTE the product's sentences as data — they draw none
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.(m?js|cjs)$/.test(f) && !/^src\/lib\/i18n-(zh|ja)\.js$/.test(f) && f !== 'src/ui-needs.js');
  const quotesEven = (s) => ((s.match(/'/g) || []).length % 2 === 0) && ((s.match(/"/g) || []).length % 2 === 0) && ((s.match(/`/g) || []).length % 2 === 0);
  const isComment = (l, at) => { const t = l.trim(); if (/^(\/\/|\*|\/\*)/.test(t)) return true; const c = l.indexOf('// '); return c >= 0 && c < at && quotesEven(l.slice(0, c)); };
  const SPEND_DEBT = [
    { file: 'src/spend-authorizer.js', re: /^\s+(spending|overage): 'Turns you type|^\s+overage: 'Paid overage refuses|^\s+unset: 'A limit left empty refuses every turn nobody typed until it is set: set a number in Settings/, why: 'the door line kept for a refusal whose verdict names no row (its linked twin is DOOR_LINK_WORDS)' },
    { file: 'src/spend-authorizer.js', re: /^\s+waiting: 'Open the conversation they wait behind/, why: 'B-0a33\'s «waiting» door (.402): «Raising the limits … would let more turns run» names the limits in the plural — no ONE row (debt: a door to the Spending section)' },
    { file: 'src/spend-authorizer.js', re: /^\s+(usage|vendor|wiring): /, why: '«the limits in Settings → Spending cannot help here» — a refusal no setting can help names no row, by design' },
    { file: 'src/server/spend-guard.js', re: /'Adjust them in Settings → Spending, or act on the account named above\.'/, why: 'the same notice when the refusal names no row' },
    { file: 'src/account-pool-auto.js', re: /Adjust them in Settings → Spending, or add a member\./, why: 'a pool\'s «them» is several ceilings — no ONE row (debt: a door to the Spending section)' },
    { file: 'src/lib/jobs-layout.js', re: /tr\('Settings → Spending'\)/, why: 'heldText is drawn as plain text by three surfaces (the chat line, the jobs panel, the rail tip) — debt: those surfaces draw no link yet' },
    { file: 'src/lib/settings-schema.js', re: /under the same unattended-spend ceiling \(Settings → Spending\)/, why: 'a Settings row\'s description naming the section beside it — Settings draws descriptions as text (debt: descriptions draw no link)' },
    { file: 'src/plugin-settings.js', re: /Settings › Spending show today/, why: 'the LLM plugin\'s budget description naming where its spend is shown — a description, drawn as text' },
    // usage-source's overage tip left this list at the move onto 2.369.412's checkpoint (-moved2): lane ui-needs-a-button's words name no place («a Spending setting can allow them»)
    // the restack on the train's checkpoint (lane login-request-card, 2026-11-18): bl-accounts batch 1, boarded BEFORE this unit, wrote
    // four Spending sentences this census reads now — named here, each with its reason (three of them paid since: the links unit's
    // follow-up on 2.369.410 links the empty row in the door line's twin, the agent's sentence and the hand-over toast; the ledger's stays, by design)
    // lane lg-recovery's bulk resume (the checkpoint cure, 主开发 2026-11-18 22:14Z): its door line names a ROW and carries its link
    // (bulk-resume.js capDoorWords — spendRowLink); the three that named only the SECTION left with B-d073 (lane bl-accounts): the Close toast's door reopens the dialog, its hint's door is the dialog's own «Stop the rest», the lead carries the overage row's link
    { file: 'src/spend-authorizer.js', re: /^\s+ledger: 'This is VibeSpace failing closed, not a limit/, why: 'B-3b0f\'s unreadable-ledger door: «the limits in Settings → Spending cannot help here» — no value of the person\'s to change, so no row, by design' },
    { file: 'src/spend-authorizer.js', re: /^\s+settings: 'This is VibeSpace failing closed, not a limit/, why: 'B-225b\'s held-settings door: «the limits in Settings → Spending cannot help here» — the limits themselves could not be read, so no row can be named' },
    { file: 'src/spend-authorizer.js', re: /^\s+held: 'This is VibeSpace failing closed, not a limit/, why: 'B-ef83\'s held-ledger door: «the limits in Settings → Spending cannot help here» — another process keeps the ledger; no value of the person\'s to change, so no row, by design' },
  ];
  const rows = [];
  for (const f of files) {
    const t = read(f).split('\n');
    t.forEach((l, i) => {
      const m = RE.exec(l); if (!m || isComment(l, m.index)) return;
      const spend = /Spending|花费|支出/.test(l);
      const klass = /vibespace:\/\/settings\/|settingLink\(|DOOR_LINK_WORDS|spendRowOf\(|warnRowOf\(|\{link\}|\$\{door\}/.test(l) ? 'link'   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
        : /\.open\(\{|openSettingAt\(/.test(l) ? 'door'
        : /\btitle\b|\btip\b|data-tip/.test(l) ? 'tip'
        : /Plugins/.test(m[0] + l.slice(m.index, m.index + 24)) ? 'plugin-path' : 'section';
      const debt = spend && klass !== 'link' && klass !== 'door' ? SPEND_DEBT.find((d) => d.file === f && d.re.test(l)) : null;
      rows.push({ f, line: i + 1, klass, spend, debt, place: l.slice(m.index, m.index + 34).replace(/['"`].*$/, '') });
    });
  }
  const by = (k) => rows.filter((r) => r.klass === k).length;
  console.log(`    · ${rows.length} product sentences name a place in Settings: link ${by('link')} · door ${by('door')} · tip ${by('tip')} · plugin-path ${by('plugin-path')} · section ${by('section')}`);
  for (const r of rows) console.log(`      ${r.klass.padEnd(11)} ${r.f}:${r.line}  ${r.place}${r.debt ? `  — DEBT: ${r.debt.why}` : ''}`);
  const loose = rows.filter((r) => r.spend && r.klass !== 'link' && r.klass !== 'door' && !r.debt);
  ok(loose.length === 0, 'every Spending sentence (the ceilings\' values) carries its row\'s link or opens it, or is a listed debt with its reason', loose);
  ok(rows.filter((r) => r.spend && r.klass === 'link').length >= 4 && verdictOf(rows.some((r) => r.spend && r.klass === 'door' && r.f === 'src/lib/stash-strip.js')), `the Spending family wired now: ${rows.filter((r) => r.spend && r.klass === 'link').length} sentences here carry the row, the hand-over toast's door opens it, and three more name the row without these words (the refusal line, the 80 % line, the warning's detail — ②)`);
  ok(verdictOf(SPEND_DEBT.every((d) => rows.some((r) => r.f === d.file && d.re.test(read(r.f).split('\n')[r.line - 1])))), 'every listed debt still names a live sentence (none stale)');
}

console.log('④ every place the owner reads words draws it — the REAL chat renderer, the For-you grammar, a toast (esbuild → node, DOM shimmed)');
{
  const os = await import('node:os');
  const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
  const noop = () => {};
  const mkEl = (tag = 'div') => { const el = { tagName: String(tag).toUpperCase(), className: '', dataset: {}, title: '', type: '', _kids: [], _ls: {}, _text: '', _html: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, style: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = String(v); this._kids = []; }, get textContent() { return this._kids.length ? this._kids.map((k) => k.textContent).join('') : this._text; },
    append(...k) { this._kids.push(...k); }, appendChild(k) { this._kids.push(k); return k; }, addEventListener(t, f) { this._ls[t] = f; }, removeEventListener: noop, setAttribute(k, v) { this[k] = v; }, querySelector: () => null, querySelectorAll: () => [], closest: () => null }; return el; };
  for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), getComputedStyle: () => ({}) })) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { } }
  class NoopObserver { observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } }
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch { } }
  globalThis.window = globalThis;
  globalThis.document = { createElement: mkEl, createTextNode: (t) => ({ textContent: String(t) }), getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch { }
  globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  const SCR = fs.mkdtempSync(path.join(os.default.tmpdir(), 'vs-setlinks-'));
  process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
  // DOMPurify needs a DOM: a stub that drops every href DOMPurify's OWN URI rule drops (test-path-linkify's)
  const URI_RULE = String.raw`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`;
  const STUB = `const OK = new RegExp(${JSON.stringify(URI_RULE)}, 'i');\nexport const sanitizeHtml = (h) => h.replace(/(<a\\b[^>]*?)\\shref="([^"]*)"/gi, (m, pre, v) => (OK.test(v.replace(/[\\u0000-\\u0020]/g, '')) ? m : pre));\nexport const sanitizeDiagramSvg = () => '';`;
  const plug = { name: 'sl', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'sl-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'sl-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
  } };
  const bundle = async (entry, name) => { const out = path.join(SCR, `${name}.mjs`); await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] }); return import(out); };
  const K = 'spend.unattendedPerInstanceDay';
  const { ChatRenderers } = await bundle('src/lib/chat-renderers.js', 'cr');
  const opened = [], list = mkEl();
  const r = new ChatRenderers({ ws: null, sessionId: 's', app: { openSettingAt: (k) => opened.push(k) }, backend: 'claude', compact: false, messageList: list });
  const span = (key, label) => `<span class="chat-link chat-setting-link" data-setting="${key}" title="Open in Settings">${label}</span>`;
  const md = (s) => r.renderMarkdown(s, { vsLinks: true }).trim();   // the conversation's own words (the option on — ⑧ holds where)
  ok(md(`raise it here: vibespace://settings/${K}.`) === `<p>raise it here: ${span(K, `vibespace://settings/${K}`)}.</p>`, 'chat: a bare link in an agent\'s message is ONE setting link; the sentence\'s full stop stays outside', md(`raise it here: vibespace://settings/${K}.`));
  ok(md(`[the ceiling](vibespace://settings/${K})`) === `<p>${span(K, 'the ceiling')}</p>` && md(`<vibespace://settings/${K}>`) === `<p>${span(K, `vibespace://settings/${K}`)}</p>`, 'chat: a markdown link and an autolink carry their label (the sanitizer never sees the scheme)');   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const mdUnk = md('[x](vibespace://settings/spend.nope) and [y](#vs-setting-spend.nope)');
  ok(!/chat-setting-link|data-setting/.test(mdUnk), 'l3: the markdown road asks the schema at BOTH ends — a link (or a hand-written #vs-setting- anchor) to an unknown key is never the door', mdUnk);
  ok(md(`\`vibespace://settings/${K}\``) === `<p><code>${span(K, `vibespace://settings/${K}`)}</code></p>`, 'chat: written as code, it is still the door');   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const unk = md('unknown: vibespace://settings/spend.nope');
  ok(!/chat-setting-link|chat-link-path|data-path/.test(unk) && verdictOf(/<span class="chat-link-words">vibespace:\/\/settings\/spend\.nope<\/span>/.test(unk)), 'chat: an UNKNOWN key stays plain words — and the path pass no longer half-links «//settings/…»', unk);
  const val = md(`value: vibespace://settings/${K}?v=9999`);
  ok(val === `<p>value: ${span(K, `vibespace://settings/${K}`)}?v=9999</p>`, 'chat: NO VALUE PART — `?v=9999` stays words outside the link, data-setting is the key alone', val);
  const inUrl = md(`https://example.com/a?u=vibespace://settings/${K}`);
  ok(!/chat-setting-link/.test(inUrl) && verdictOf(/<a href="https:\/\/example\.com\/a\?u=vibespace:\/\/settings\/spend\.unattendedPerInstanceDay">/.test(inUrl)), 'chat: inside another URL it is that URL\'s text, not a door', inUrl);
  ok(md(`see «vibespace://settings/${K}»，然后`) === `<p>see «${span(K, `vibespace://settings/${K}`)}»，然后</p>`, 'chat: CJK quotes and a fullwidth comma around it stay outside');
  ok(r.linkifyText(`tool said vibespace://settings/${K}, done`) === `tool said <span class="chat-link-words">vibespace://settings/${K}</span>, done`, 'chat: a TOOL\'s output (linkifyText) never draws it — words, and never a path (⑧ the cure)');
  // l1 (主开发 2026-11-15): after a half-width colon it IS a door; the scheme in capitals too; glued to a word it is words — and the path
  // pass never underlines its tail («//settings/<key>» answered «Not found» as a FILE)
  const L1 = { cjkColon: `上限在这里:vibespace://settings/${K}`, enColon: `Raise it here:vibespace://settings/${K}`, caps: `VIBESPACE://SETTINGS/${K}`, glued: `herevibespace://settings/${K}` };
  const l1 = Object.fromEntries(Object.entries(L1).map(([k, v]) => [k, md(v)]));
  ok(gateOf(l1.cjkColon.includes(span(K, `vibespace://settings/${K}`))) && gateOf(l1.enColon.includes(span(K, `vibespace://settings/${K}`))) && verdictOf(l1.caps.includes(`data-setting="${K}"`)), 'l1 chat: after a half-width colon (zh and en) and with the scheme in capitals it is the DOOR', l1);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  ok(gateOf(Object.values(l1).every((h) => !/chat-link-path|data-path=/.test(h))) && verdictOf(/<span class="chat-link-words">vibespace:\/\/settings\/spend\.unattendedPerInstanceDay<\/span>/.test(l1.glued)), 'l1 chat: glued to a word it is WORDS, and no run of the scheme is ever a file path', l1.glued);
  const tgt = { closest: (sel) => (sel === '.chat-setting-link[data-setting]' ? tgt : null), dataset: { setting: K }, classList: { contains: (c) => c === 'chat-setting-link' || c === 'chat-link' } };
  const ev = { target: tgt, preventDefault() { this.dp = 1; }, stopPropagation() { this.sp = 1; }, clientX: 1, clientY: 1 };
  if (list._ls.click) list._ls.click(ev);
  ok(JSON.stringify(opened) === JSON.stringify([K]) && ev.dp === 1, 'chat: a press on it asks THE ONE DOOR (app.openSettingAt) for that row — nothing copied, nothing else opened', { opened, dp: ev.dp });
  const F = await bundle('src/lib/foryou-links.js', 'fy');
  const S = await bundle('src/lib/settings-schema.js', 'schema');
  const fyHas = S.isSettingKey;
  ok(gateOf(fyHas(K)) && !fyHas('spend.nope') && !fyHas('toString'), 'the client\'s known-key test is the schema\'s own rows (an own key — never a prototype name)');
  const segs = F.segmentText(`raise vibespace://settings/${K}.`, { has: fyHas }).filter((g) => g.t !== 'text');
  ok(segs.length === 1 && segs[0].kind === 'setting' && segs[0].ref === K, 'For you: the ONE grammar has a `setting` kind (known keys only)', segs);
  ok(F.segmentText('vibespace://settings/spend.nope', { has: fyHas }).filter((g) => g.t !== 'text').length === 0, 'For you: an unknown key is words');
  const fyL1 = Object.fromEntries(Object.entries(L1).map(([k, v]) => [k, F.segmentText(v, { has: fyHas }).filter((g) => g.t !== 'text')]));
  ok(gateOf(['cjkColon', 'enColon', 'caps'].every((k) => fyL1[k].length === 1 && fyL1[k][0].kind === 'setting' && fyL1[k][0].ref === K)) && gateOf(Object.values(fyL1).every((gs) => gs.every((g) => g.kind !== 'path'))) && fyL1.glued.length === 0,
    'l1 For you: the door after a colon and in capitals; glued to a word no link at all — never a path', fyL1);
  const inPath = F.segmentText(`/home/u/vibespace://settings/${K}`, { has: fyHas }).filter((g) => g.t !== 'text');
  ok(verdictOf(inPath.every((g) => !(g.kind === 'path' && /settings/.test(g.ref)))), 'l1 For you: a path that runs into the scheme ends where the run begins (its tail is never a path)', inPath);
  const fyHtml = F.linkedHtml(`x vibespace://settings/${K} y`, { has: fyHas });
  ok(verdictOf(/<span class="fy-link" role="link" tabindex="0" data-fy="setting" data-ref="spend\.unattendedPerInstanceDay">vibespace:\/\/settings\/spend\.unattendedPerInstanceDay<\/span>/.test(fyHtml)), 'For you: drawn as a .fy-link (data-fy="setting"), keyboard-reachable', fyHtml);
  ok(JSON.stringify(F.linkTarget('setting', K)) === JSON.stringify({ open: 'setting', key: K }) && F.linkTarget('setting', 'a=b') === null, 'For you: the link\'s target is the row (a value-shaped ref is no target)');
  const row = read('src/lib/user-todos-row.js'), act = read('src/lib/user-todos-actions.js');
  ok(gateOf(/linkedHtml\(String\(text \|\| ''\), \{[^}]*has: isSettingKey/.test(row)) && gateOf(/has: isSettingKey/.test(row.slice(row.indexOf('export function linkifyInto')))) && verdictOf(/if \(tg\.open === 'setting'\) \{ app\.openSettingAt\?\.\(tg\.key\); return true; \}/.test(act)),
    'For you: wordsHtml (the tray, the mini inbox, the phone sheet, the chat\'s card rows, the For-you window — question and detail) and linkifyInto (verbatim details) both ask the schema; a press goes to the door');
  const U = await bundle('src/lib/utils.js', 'utils');
  const body = mkEl(), toOpen = [];
  ok(U.toastWordsInto(body, `limit reached — vibespace://settings/${K}`) === 0 && body.textContent === `limit reached — vibespace://settings/${K}`, 'a toast with no door registered stays text, as before');
  U.registerSettingLinks({ has: fyHas, open: (k) => toOpen.push(k) });
  const b2 = mkEl(), n = U.toastWordsInto(b2, `limit reached — vibespace://settings/${K}.`);
  const btn = b2._kids.find((k) => k.className === 'global-toast-setting');
  ok(n === 1 && gateOf(btn) && btn.dataset.setting === K && btn.textContent === `vibespace://settings/${K}` && b2.textContent === `limit reached — vibespace://settings/${K}.`, 'a toast (the server\'s notices ride it): the link is a button built from text nodes, the rest stays text', b2._kids.map((k) => k.className || k.textContent));   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  if (btn && typeof btn.onclick === 'function') btn.onclick({ preventDefault() { }, stopPropagation() { } });
  ok(JSON.stringify(toOpen) === JSON.stringify([K]), 'the toast\'s link opens the row through the registered door', toOpen);
  const b3 = mkEl(), n3 = U.toastWordsInto(b3, 'see vibespace://settings/spend.nope now');
  ok(n3 === 0 && !b3._kids.some((k) => k.className === 'global-toast-setting') && b3.textContent === 'see vibespace://settings/spend.nope now', 'l3: a toast holding an UNKNOWN key draws no button — it stays words');
  ok(verdictOf(/registerSettingLinks\(\{ has: isSettingKey, open: \(key\) => this\.openSettingAt\(key\) \}\);/.test(read('src/lib/app.js'))), 'the app registers the door for toasts at boot');
}

console.log('⑤ the agents\' rule — one sentence in the manual and in vibespace-ask\'s usage; the injected rules have no room (measured)');
{
  const man = read('docs/agent/ask-manual.md');
  ok(verdictOf(/when an ask needs a setting changed, the ask carries that setting's link — `vibespace:\/\/settings\/<key>`[\s\S]{0,200}never a path in words/.test(man)), 'docs/agent/ask-manual.md: when an ask needs a setting changed, it carries the link, never a path in words');
  const R = require(path.join(REPO, 'src/agent-cli-registry.js'));
  const ask = R.ROWS.find((x) => x.name === 'vibespace-ask'), said = ask.teach.sessionStart({ tray: null });
  // MEASURED (lane setting-doors pick 1): one 83 B line in the ask paragraph left test-stash-strip's manager twin (a manager with
  // groups, filled to the inline cap) 61 B OVER — the tightest shape had 22 B of room. «At most one short line»: none fits, so the
  // rule lives where an agent looks when it asks — the manual and vibespace-ask's own usage — and the injected rules stay as they were
  ok(!/vibespace:\/\/settings\//.test(said) && R.CAPS.sessionStart === 3160, 'the injected rules carry no line for it (the tightest shape had 22 B of room; an 83 B line went 61 B over) — the cap stays 3160 B');   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  ok(gateOf(/a setting to change: put its link in the question or --detail — vibespace:\/\/settings\/<key>/.test(read('data/bin/vibespace-ask'))) && verdictOf(/never a path in words, and never write the setting yourself/.test(read('data/bin/vibespace-ask'))), 'vibespace-ask\'s own usage (what an agent reads when it asks) carries the rule');
}

console.log('⑥ A LINK OPENS, IT NEVER WRITES');
{
  const app = read('src/lib/app.js'), ui = read('src/lib/settings-ui.js');
  const door = app.slice(app.indexOf('  openSettingAt(key) {'), app.indexOf('  openSettingAt(key) {') + 200);
  ok(gateOf(/return this\._settingsUI\?\.open\(isSettingKey\(key\) \? \{ focusKey: key \} : \{\}\);/.test(door)) && !/\.set\(|fetch|api\/settings/.test(door), 'the door only OPENS Settings (on the row when it is a row) — no value, no write');
  const focus = ui.slice(ui.indexOf('  _focusRow('), ui.indexOf('  _focusRow(') + 3000);
  ok(gateOf(ui.includes('  _focusRow(')) && !/settings\.set\(|_save\(|fetchJson\(|api\/settings|_setShowAdvanced\(/.test(focus), 'focusing the row writes nothing and never flips the per-device «show advanced» switch (the row is revealed for THIS open)');
  ok(!/[?&=]/.test(SL.KEY_CH.replace(/\\-/g, '')), 'the grammar\'s key alphabet has no `?`, `&` or `=` — a value cannot ride a link');
  const openSrc = ui.slice(ui.indexOf('  open({ syncId, search, category, focusKey } = {}) {'), ui.indexOf('  _focusRow('));
  ok(openSrc.length > 500 && !/_setShowAdvanced\(|_showAdvanced = true|setItem\(SHOW_ADVANCED_KEY/.test(openSrc.replace(/advInput\.onchange = \(\) => \{ this\._setShowAdvanced\(advInput\.checked\);/, '')), 'l3: open({ focusKey }) never turns «show advanced» on — the row is revealed for THIS open only (only the switch\'s own toggle writes it)');
}

console.log('⑦ THE EXACT-TAG LAW (主开发 2026-11-15, the verifier\'s F4): a pass that rewrites a SANITIZED anchor takes only the tag the tree writes — string legs, as an older engine serializes');
{
  const os = await import('node:os');
  const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
  const SCR = fs.mkdtempSync(path.join(os.default.tmpdir(), 'vs-exacttag-'));
  process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
  const URI_RULE = String.raw`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`;
  const STUB = `const OK = new RegExp(${JSON.stringify(URI_RULE)}, 'i');\nexport const sanitizeHtml = (h) => h.replace(/(<a\\b[^>]*?)\\shref="([^"]*)"/gi, (m, pre, v) => (OK.test(v.replace(/[\\u0000-\\u0020]/g, '')) ? m : pre));\nexport const sanitizeDiagramSvg = () => '';`;
  let n = 0;
  const bundle = async (entry, patchFile = null, patch = null) => {
    const out = path.join(SCR, `b${n++}.mjs`);
    const plug = { name: 'et', setup(b) {
      b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'et-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'et-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
      if (patchFile) b.onLoad({ filter: new RegExp(patchFile.replace(/[.]/g, '\\.') + '$') }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
    } };
    await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
    return import(out);
  };
  // the tags that OPEN outside an attribute value — a quoted value is read whole (a raw `>` inside it never ends the tag)
  const tagsOutside = (html) => { const out = []; const s = String(html); let i = 0;
    while (i < s.length) { if (s[i] !== '<') { i++; continue; } const m = /^<\/?([a-zA-Z][\w-]*)/.exec(s.slice(i)); if (!m) { i++; continue; } out.push(m[1].toLowerCase()); i += m[0].length;
      while (i < s.length && s[i] !== '>') { if (s[i] === '"' || s[i] === "'") { const q = s[i]; const e = s.indexOf(q, i + 1); i = e < 0 ? s.length : e + 1; } else i++; } i++; }
    return out; };
  const K = 'spend.unattendedPerInstanceDay', UUID = '0e0e0e0e-1111-4222-8333-444455556666';
  const EVIL = 'a>b<img src=x onerror=alert(1)>';   // an engine before Chrome 138 / Firefox 140 / Safari 26 writes `>` raw in a value
  const mk = (R) => new R.ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: { addEventListener() { } } });
  const CR = await bundle('src/lib/chat-renderers.js'), SC = await bundle('src/lib/subagent-card.js');
  const r = mk(CR);
  const setRaw = `<p><a href="#vs-setting-${K}" title="${EVIL}">label</a></p>`, setOk = `<p><a href="#vs-setting-${K}">label</a></p>`;
  const convRaw = `<p><a href="#vs-conversation-${UUID}" title="${EVIL}">x</a></p>`, convOk = `<p><a href="#vs-conversation-${UUID}">x</a></p>`;
  const maskRaw = `<p><a href="https://x.example/?token=«redacted»" title="${EVIL}" target="_blank" rel="noopener noreferrer">label</a></p>`, maskOk = `<p><a href="https://x.example/?token=«redacted»" target="_blank" rel="noopener noreferrer">label</a></p>`;
  const legs = (R, S) => { const rr = mk(R);
    return { set: rr._schemeAnchors(setRaw, { vsLinks: true }), setOk: rr._schemeAnchors(setOk, { vsLinks: true }), conv: S.conversationLinksHtml(convRaw), convOk: S.conversationLinksHtml(convOk), mask: rr.linkify(maskRaw), maskOk: rr.linkify(maskOk) }; };
  const L = legs(CR, SC);
  ok(!tagsOutside(L.set).includes('img') && L.set === setRaw && verdictOf(/chat-setting-link/.test(L.setOk)), 'the setting pass: an anchor carrying more than its href stays the sanitizer\'s own (no tag opens outside an attribute); the ordinary one is the door', L.set);
  ok(!tagsOutside(L.conv).includes('img') && L.conv === convRaw && verdictOf(/chat-sub-link/.test(L.convOk)), 'the conversation-link pass (subagent-card): the same — only `<a href="#vs-conversation-<id>">` is rewritten', L.conv);
  ok(!tagsOutside(L.mask).includes('img') && gateOf(/masked-link-note/.test(L.maskOk)) && verdictOf(/masked-link-note/.test(L.mask)), 'the masked-anchor pass: the tree\'s own open tag read with each value WHOLE (a titled masked link is still words + its note, and nothing opens outside the title)', { mask: L.mask, ok: L.maskOk });
  // the mutants: the old «not a greater-than sign» run put back, pass by pass — each is RED
  const crOld = (src) => src.replace("'<a\\\\x20href=\"((?:'", "'<a\\\\b[^>]*?\\\\shref=\"((?:'").replace("')[^\"]*)\">([\\\\s\\\\S]*?)<\\\\/a>'", "')[^\"]*)\"[^>]*>([\\\\s\\\\S]*?)<\\\\/a>'")   // the scheme's after-pass (every target's mark, lane login-request-card piece 1)
    .replace('const open = SANITIZED_ANCHOR_OPEN_RE.exec(a);', 'const open = /^<a\\b[^>]*>/i.exec(a);').replace('const href = [open[0], open[1]], inner', 'const href = /\\shref\\s*=\\s*"([^"]*)"/i.exec(open[0]), inner');   // stale-pins: kept — red controls whose mutants rebuild the old anchor parse
  const scOld = (src) => src.replace('/<a href="#vs-conversation-([0-9a-f-]{36})">([\\s\\S]*?)<\\/a>/g', '/<a href="#vs-conversation-([0-9a-f-]{36})"[^>]*>([\\s\\S]*?)<\\/a>/g');   // stale-pins: kept — a red control whose mutant rebuilds the old subagent-card pattern
  const crSrc = read('src/lib/chat-renderers.js'), scSrc = read('src/lib/subagent-card.js');
  ok(crOld(crSrc) !== crSrc && scOld(scSrc) !== scSrc && crOld(crSrc).split('[^>]*').length - crSrc.split('[^>]*').length >= 2 && !crOld(crSrc).includes("'<a\\x20href=\"((?:'"), 'the mutants\' needles are in this tree (the old patterns can be put back)');
  const M = legs(await bundle('src/lib/chat-renderers.js', 'chat-renderers.js', crOld), await bundle('src/lib/subagent-card.js', 'subagent-card.js', scOld));
  ok(gateOf(tagsOutside(M.set).includes('img')) && gateOf(tagsOutside(M.conv).includes('img')) && verdictOf(tagsOutside(M.mask).includes('img')), 'RED CONTROL: each pass with its old «[^>]*>» run writes an <img onerror> OUTSIDE an attribute — the setting pass, the conversation pass, the masked pass', { set: M.set, conv: M.conv, mask: M.mask });
}

console.log('⑧ ONE RULE FOR WHERE THE SCHEME\'S LINKS RENDER (主开发 2026-11-17, the finding against pick 1): the renderer\'s option `vsLinks`, off by default, on only at the conversation\'s own words — three red controls');
{
  const os = await import('node:os');
  const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
  const SCR = fs.mkdtempSync(path.join(os.default.tmpdir(), 'vs-onerule-'));
  process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
  const URI_RULE = String.raw`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`;
  const STUB = `const OK = new RegExp(${JSON.stringify(URI_RULE)}, 'i');\nexport const sanitizeHtml = (h) => h.replace(/(<a\\b[^>]*?)\\shref="([^"]*)"/gi, (m, pre, v) => (OK.test(v.replace(/[\\u0000-\\u0020]/g, '')) ? m : pre));\nexport const sanitizeDiagramSvg = () => '';`;
  let n = 0;
  const bundle = async (patch = null) => {
    const out = path.join(SCR, `r${n++}.mjs`);
    const plug = { name: 'or', setup(b) {
      b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'or-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'or-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
      if (patch) b.onLoad({ filter: /chat-renderers\.js$/ }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
    } };
    await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/chat-renderers.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
    return import(out);
  };
  const K = 'spend.unattendedPerInstanceDay';
  const TXT = `raise it: vibespace://settings/${K} — or [the ceiling](vibespace://settings/${K}) — or [y](#vs-setting-${K})`;
  const doors = (h) => (String(h).match(/data-setting="/g) || []).length;
  const pathy = (h) => /chat-link-path|data-path=/.test(String(h));
  const ce0 = document.createElement;   // ④'s element stub + what the assistant block's backend icon asks of an element
  document.createElement = (tag) => { const e = ce0(tag); e.style.setProperty = () => {}; if (!('outerHTML' in e)) Object.defineProperty(e, 'outerHTML', { get() { return `<${String(tag)}></${String(tag)}>`; } }); return e; };
  const legs = (R) => { const r = new R.ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: { addEventListener() { } } });
    const job = r._renderVibespaceNotice({ id: 'm-job', peerFrom: 'VibeSpace' }, `Background work finished.\n${TXT}`);
    const own = r.renderAssistantMsg({ id: 'm-own', role: 'assistant', status: 'complete', content: [{ type: 'text', text: TXT }] });
    return { off: r.renderMarkdown(TXT), on: r.renderMarkdown(TXT, { vsLinks: true }), peer: r._peerBodyHtml({ id: 'm-peer' }, TXT, 'a peer').html,
      job: job ? job.innerHTML : '', tool: r.linkifyText(TXT), own: own ? own.innerHTML : '' }; };
  const L = legs(await bundle());
  ok(doors(L.off) === 0 && !pathy(L.off) && !L.off.includes('#vs-setting-') && gateOf(/<span class="chat-link-words">vibespace:\/\/settings\/spend\.unattendedPerInstanceDay<\/span>/.test(L.off)) && verdictOf(/— or the ceiling — or y<\/p>/.test(L.off)),
    'OFF BY DEFAULT: a bare run is words (never a path), a labelled link is its label, a hand-written #vs-setting- anchor is its label — no door', L.off);
  ok(doors(L.on) === 3 && doors(L.own) === 3, 'the option on (renderMarkdown, and the REAL assistant-text block): the same words carry three doors', { on: L.on, own: L.own });
  ok(doors(L.peer) === 0 && !pathy(L.peer), 'a PEER\'s body (_peerBodyHtml — peer and group messages) draws none', L.peer);
  ok(gateOf(L.job.includes('Background work finished')) && doors(L.job) === 0 && !pathy(L.job), 'a JOB\'s record (a VibeSpace notice shown in chat) draws none', L.job);
  ok(doors(L.tool) === 0 && !pathy(L.tool), 'a TOOL\'s input or output (linkifyText) draws none', L.tool);
  // THE CENSUS (主开发 12:21Z c: every file under the page's lib folder, ANY spelling): every place the option is switched ON — any
  // assignment of a value that is not `false` to vsLinks (`vsLinks: true`, `'vsLinks': 1`, `opts.vsLinks = …`), by the method it sits
  // in; a default of `false`, a pass-through and a test of it are plumbing — exactly the conversation's own words (+ the brief channel's
  // message, the fifth site by 主开发's ruling 12:21Z b)
  const ON = ['chat-renderers.js:_renderCollabMsg', 'chat-renderers.js:_renderUserChannelMsg', 'chat-renderers.js:renderAssistantMsg', 'chat-renderers.js:renderToolMsg', 'chat-view.js:_renderStreamingText'];
  const ON_RE = /['"]?\bvsLinks['"]?\]?\s*(?::|=(?!=))\s*(?![\s]|false\b)/;
  const METHOD_RE = /^\s*(?:async\s+)?(?:function\s+)?(?!(?:if|for|while|switch|catch|with|return)\b)([_A-Za-z$][\w$]*)\s*\([^)]*\)\s*\{\s*(?:\/\/.*)?$/;
  const sitesOf = (file, src) => { const out = []; const lines = src.split('\n');
    lines.forEach((ln, i) => { if (!ON_RE.test(ln.replace(/\/\/.*$/, ''))) return; let j = i; while (j >= 0 && !METHOD_RE.test(lines[j])) j--; out.push(`${file}:${j >= 0 ? METHOD_RE.exec(lines[j])[1] : '?'}`); });
    return out; };
  const libFiles = (dir = path.join(REPO, 'src/lib'), rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? libFiles(path.join(dir, d.name), `${rel}${d.name}/`) : d.name.endsWith('.js') ? [`${rel}${d.name}`] : []));
  const LIB = Object.fromEntries(libFiles().map((f) => [f, read(`src/lib/${f}`)]));
  const census = (crSrc, extra = {}) => Object.entries({ ...LIB, 'chat-renderers.js': crSrc, ...extra }).flatMap(([f, src]) => sitesOf(f, src)).sort();
  const crSrc = read('src/lib/chat-renderers.js');
  ok(Object.keys(LIB).length > 250 && JSON.stringify(census(crSrc)) === JSON.stringify(ON), `THE CENSUS over every file under src/lib (${Object.keys(LIB).length}), any spelling: the option is on at the assistant text block, its streaming frame, the sub-agent report, the sub-agent card (its answer) and the brief channel's message — nowhere else`, census(crSrc));
  ok(JSON.stringify(census(crSrc, { 'zz-planted.js': "function plant(t) {\n  return renderer.renderMarkdown(t, { 'vsLinks': 1 });\n}\n" })) !== JSON.stringify(ON) && sitesOf('x.js', "  f() {\n    opts.vsLinks = on;\n  }\n").length === 1 && sitesOf('x.js', "  f(a, { vsLinks = false } = {}) {\n    g({ vsLinks }); if (vsLinks === true) h();\n  }\n").length === 0,
    'RED CONTROL (census): a quoted spelling in ANOTHER lib file turns it red; `opts.vsLinks = …` is a site; a default of false, a pass-through and a test are not');
  const rcSub = (crSrc.match(/renderMarkdown: \(s\) => this\.renderMarkdown\(s, \{ vsLinks: true \}\)/g) || []).length;
  ok(rcSub === 1 && !/linkifyText: \(s\) => this\.linkifyText\(s, \{/.test(crSrc), 'the sub-agent card: its answer (renderMarkdown) has the option, its task (linkifyText — the parent\'s tool input) does not');
  const fyHasSites = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).flatMap((f) => (read(`src/lib/${f}`).match(/(?:linkedHtml|segmentText)\([^\n]*has: isSettingKey/g) || []).map(() => f));
  ok(fyHasSites.length === 3 && verdictOf(fyHasSites.every((f) => f === 'user-todos-row.js')), 'For you: the key test (its renderer\'s option) is given only by user-todos-row.js — wordsHtml + linkifyInto\'s two reads, the item\'s words; the vault plan never', fyHasSites);
  // THE RED CONTROLS — the option flipped on where a peer, a job or a tool wrote: each makes its leg AND the census red
  const MUT = {
    peer: (src) => src.replace("demoteHeadings(this.renderMarkdown(String(text || '').trim()))", "demoteHeadings(this.renderMarkdown(String(text || '').trim(), { vsLinks: true }))"),
    job: (src) => src.replace('<div class="chat-text">${this.renderMarkdown(view.body)}</div></details>', '<div class="chat-text">${this.renderMarkdown(view.body, { vsLinks: true })}</div></details>'),
    tool: (src) => src.replace('  linkifyText(text, opts = {}) {', '  linkifyText(text, opts = { vsLinks: true }) {'),
  };
  ok(verdictOf(Object.values(MUT).every((m) => m(crSrc) !== crSrc)), 'the mutants\' needles are in this tree');
  const Mp = legs(await bundle((src) => MUT.tool(MUT.peer(src)))), Mt = Mp;   // ONE mutant bundle carries both (each leg reads its own surface)
  ok(doors(Mp.peer) > 0 && doors(Mp.job) > 0 && doors(Mt.tool) > 0, 'RED CONTROL (legs): the option on at the peer body ⇒ a peer\'s words and a job\'s record shown whole draw doors; on at linkifyText ⇒ a tool\'s output does', { peer: Mp.peer, job: Mp.job, tool: Mt.tool });
  ok(verdictOf(Object.entries(MUT).every(([k, m]) => JSON.stringify(census(m(crSrc))) !== JSON.stringify(ON))), 'RED CONTROL (census): each of the three — the peer body, the job record\'s folded body, a tool\'s words — turns the census red');
}

console.log(fail ? `✗ test-setting-links: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
