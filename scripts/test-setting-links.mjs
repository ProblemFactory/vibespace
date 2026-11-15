#!/usr/bin/env node
// lane setting-doors pick 1 (主开发 2026-11-14) — A DOOR TO ONE SETTING: `vibespace://settings/<key>`, written in plain text by an agent
// or by the product's own sentences, is a link wherever the owner reads words; a click opens Settings on that row and WRITES NOTHING.
// The owner, after a For-you item could only describe the way to a ceiling in words: «…或者至少你应该能提供一个 vibespace://settings/
// 之类的链接可以让我点了之后直通对应的选项来改». PURE + in-process (the heavy twin, test-setting-links-chrome, presses the links).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 900)); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SL = require(path.join(REPO, 'src/setting-links.js'));
const A = require(path.join(REPO, 'src/spend-authorizer.js'));
const KEYS = new Set(['spend.unattendedPerInstanceDay', 'spend.unattendedPerIdentityDay', 'spend.unattendedPerIdentityHour', 'spend.allowOverageTurns', 'chat.uploadDir', 'plugin.voice-input.language']);
const has = (k) => KEYS.has(k);
const keysOf = (t) => SL.settingLinkHits(t, has).map((h) => h.key);

console.log('① the grammar (src/setting-links.js, PURE)');
{
  ok(SL.SCHEME === 'vibespace://settings/' && SL.settingLink('spend.unattendedPerInstanceDay') === 'vibespace://settings/spend.unattendedPerInstanceDay', 'the spelling: vibespace://settings/<the schema\'s dotted key>');
  ok(A.DOOR_LINK_WORDS && /\{link\}/.test(A.DOOR_LINK_WORDS.spending) && /const SL = Object\.freeze\(\{ settingLink: \(key\) => `vibespace:\/\/settings\/\$\{key\}` \}\);/.test(read('src/spend-authorizer.js')), 'the spend authorizer (PURE, imports nothing) spells the link with the SAME scheme');
  const T = [
    ['Raise it: vibespace://settings/spend.unattendedPerInstanceDay.', ['spend.unattendedPerInstanceDay'], 'a sentence\'s full stop is shed'],
    ['（vibespace://settings/spend.unattendedPerIdentityDay）。', ['spend.unattendedPerIdentityDay'], 'CJK punctuation around it is shed (the shared trailing set)'],
    ['vibespace://settings/spend.nope', [], 'an unknown key stays plain text'],
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
  ok(/The limit: vibespace:\/\/settings\/spend\.unattendedPerIdentityDay — the owner changes it there\.$/.test(txt), 'the refusal line (the journal\'s, an agent\'s typed refusal) ends with the row\'s link and whose press it is', txt);
  const i18n = A.refusalI18n ? A.refusalI18n(v, { sessionName: 'c' }) : null;
  const door = i18n && (i18n.detail || []).find((d) => d.key === A.DOOR_LINK_WORDS.spending);
  ok(door && door.params && door.params.link === 'vibespace://settings/spend.unattendedPerIdentityDay', 'the For-you notice\'s door line (translated on the page) carries the row\'s link as {link}', i18n && i18n.detail);
  const iu = A.refusalI18n ? A.refusalI18n({ why: 'identity-unknown', limits: v.limits, counts: v.counts }, {}) : null;
  ok(iu && (iu.detail || []).some((d) => d.key === A.DOOR_WORDS.wiring), 'a refusal that names no row keeps its words (no link to a row that cannot help)');
  const w = A.noticeText({ identity: { name: 'acct' }, scope: 'day', used: 160, limit: 200, pct: 80 });
  ok(/\(80%\) — the limit: vibespace:\/\/settings\/spend\.unattendedPerIdentityDay\./.test(w) && /— the limit: vibespace:\/\/settings\/spend\.unattendedPerInstanceDay\./.test(A.noticeText({ scope: 'instance', used: 1, limit: 2, pct: 50 })), 'the 80 % warning names its ceiling\'s row (it named no setting before) — right after the counts', w);
  // l2 (主开发 2026-11-15): the For-you question is stored under 300 characters (spend-guard fileInbox); a 27+ character account name
  // and four producers once cut a link said LAST — said before the producers, the stored question keeps it whole
  const longW = A.noticeText({ identity: { name: 'a-very-long-account-name-for-the-owner' }, scope: 'day', used: 160, limit: 200, pct: 80, producers: { 'auto-resume': 40, 'stop-nudge': 30, 'job-notification': 20, 'peer-message': 10 } });
  const stored = String(longW).slice(0, 300);
  ok(longW.length > 300 - 60 && keysOf(stored).includes('spend.unattendedPerIdentityDay') && /spend\.unattendedPerIdentityDay\./.test(stored) && /slice\(0, 300\)/.test(read('src/server/spend-guard.js')), 'l2: a 38-character account name and four producers — the question as STORED (300 characters) still holds the whole link', { len: longW.length, stored });
  const g = read('src/server/spend-guard.js');
  ok(/Adjust this one in Settings → Spending — vibespace:\/\/settings\/\$\{A\.spendRowOf\(v\)\}/.test(g) && /The limit, to raise or lower it: vibespace:\/\/settings\/\$\{A\.warnRowOf\(r\.warn\)\}/.test(g), 'the guard\'s two For-you notices: the refusal\'s detail and the warning\'s detail carry the row');
  const pr = read('src/routes/persistence.js');
  ok(/const why = spendWriteWhy\(req\), door = `vibespace:\/\/settings\/\$\{row \|\| rows\[0\]\}`, noRow = row \? '' : ` \(«\$\{hit\[0\]\}» is no setting\)`;/.test(pr), 'the settings door\'s own refusal (pick 0) carries a REAL row\'s link (f2: a key that is no row names the limits\' first row and says so)');
  ok(/const row = spendRowOf\(\{ why: r && r\.why \}\);[\s\S]{0,400}app\.openSettingAt\(row\)/.test(read('src/lib/stash-strip.js')), 'the hand-over toast\'s door opens the refused ceiling\'s row (was: the Spending section)');
}

console.log('③ THE CENSUS — every product sentence that names a place in Settings (grep-derived, printed with its class)');
{
  const RE = /Settings ?(›|>|→)|⚙ ?→|设置 ?(›|→|>)|in Settings|change it in|raise it in/;
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.(m?js|cjs)$/.test(f) && !/^src\/lib\/i18n-(zh|ja)\.js$/.test(f));
  const quotesEven = (s) => ((s.match(/'/g) || []).length % 2 === 0) && ((s.match(/"/g) || []).length % 2 === 0) && ((s.match(/`/g) || []).length % 2 === 0);
  const isComment = (l, at) => { const t = l.trim(); if (/^(\/\/|\*|\/\*)/.test(t)) return true; const c = l.indexOf('// '); return c >= 0 && c < at && quotesEven(l.slice(0, c)); };
  const SPEND_DEBT = [
    { file: 'src/spend-authorizer.js', re: /^\s+(spending|overage): 'Turns you type|^\s+overage: 'Paid overage refuses/, why: 'the door line kept for a refusal whose verdict names no row (its linked twin is DOOR_LINK_WORDS)' },
    { file: 'src/spend-authorizer.js', re: /^\s+waiting: 'Open the conversation they wait behind/, why: 'B-0a33\'s «waiting» door (.402): «Raising the limits … would let more turns run» names the limits in the plural — no ONE row (debt: a door to the Spending section)' },
    { file: 'src/spend-authorizer.js', re: /^\s+(usage|vendor|wiring): /, why: '«the limits in Settings → Spending cannot help here» — a refusal no setting can help names no row, by design' },
    { file: 'src/server/spend-guard.js', re: /'Adjust them in Settings → Spending, or act on the account named above\.'/, why: 'the same notice when the refusal names no row' },
    { file: 'src/account-pool-auto.js', re: /Adjust them in Settings → Spending, or add a member\./, why: 'a pool\'s «them» is several ceilings — no ONE row (debt: a door to the Spending section)' },
    { file: 'src/lib/jobs-layout.js', re: /tr\('Settings → Spending'\)/, why: 'heldText is drawn as plain text by three surfaces (the chat line, the jobs panel, the rail tip) — debt: those surfaces draw no link yet' },
    { file: 'src/lib/settings-schema.js', re: /under the same unattended-spend ceiling \(Settings → Spending\)/, why: 'a Settings row\'s description naming the section beside it — Settings draws descriptions as text (debt: descriptions draw no link)' },
    { file: 'src/plugin-settings.js', re: /Settings › Spending show today/, why: 'the LLM plugin\'s budget description naming where its spend is shown — a description, drawn as text' },
    { file: 'src/lib/usage-source.js', re: /\(Settings → Spending\)/, why: 'a tooltip (title text) — no link can live there' },
  ];
  const rows = [];
  for (const f of files) {
    const t = read(f).split('\n');
    t.forEach((l, i) => {
      const m = RE.exec(l); if (!m || isComment(l, m.index)) return;
      const spend = /Spending|花费|支出/.test(l);
      const klass = /vibespace:\/\/settings\/|settingLink\(|DOOR_LINK_WORDS|spendRowOf\(|warnRowOf\(|\{link\}|\$\{door\}/.test(l) ? 'link'
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
  ok(rows.filter((r) => r.spend && r.klass === 'link').length >= 4 && rows.some((r) => r.spend && r.klass === 'door' && r.f === 'src/lib/stash-strip.js'), `the Spending family wired now: ${rows.filter((r) => r.spend && r.klass === 'link').length} sentences here carry the row, the hand-over toast's door opens it, and three more name the row without these words (the refusal line, the 80 % line, the warning's detail — ②)`);
  ok(SPEND_DEBT.every((d) => rows.some((r) => r.f === d.file && d.re.test(read(r.f).split('\n')[r.line - 1]))), 'every listed debt still names a live sentence (none stale)');
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
  const md = (s) => r.renderMarkdown(s).trim();
  ok(md(`raise it here: vibespace://settings/${K}.`) === `<p>raise it here: ${span(K, `vibespace://settings/${K}`)}.</p>`, 'chat: a bare link in an agent\'s message is ONE setting link; the sentence\'s full stop stays outside', md(`raise it here: vibespace://settings/${K}.`));
  ok(md(`[the ceiling](vibespace://settings/${K})`) === `<p>${span(K, 'the ceiling')}</p>` && md(`<vibespace://settings/${K}>`) === `<p>${span(K, `vibespace://settings/${K}`)}</p>`, 'chat: a markdown link and an autolink carry their label (the sanitizer never sees the scheme)');
  const mdUnk = md('[x](vibespace://settings/spend.nope) and [y](#vs-setting-spend.nope)');
  ok(!/chat-setting-link|data-setting/.test(mdUnk), 'l3: the markdown road asks the schema at BOTH ends — a link (or a hand-written #vs-setting- anchor) to an unknown key is never the door', mdUnk);
  ok(md(`\`vibespace://settings/${K}\``) === `<p><code>${span(K, `vibespace://settings/${K}`)}</code></p>`, 'chat: written as code, it is still the door');
  const unk = md('unknown: vibespace://settings/spend.nope');
  ok(!/chat-setting-link|chat-link-path|data-path/.test(unk) && /<span class="chat-link-words">vibespace:\/\/settings\/spend\.nope<\/span>/.test(unk), 'chat: an UNKNOWN key stays plain words — and the path pass no longer half-links «//settings/…»', unk);
  const val = md(`value: vibespace://settings/${K}?v=9999`);
  ok(val === `<p>value: ${span(K, `vibespace://settings/${K}`)}?v=9999</p>`, 'chat: NO VALUE PART — `?v=9999` stays words outside the link, data-setting is the key alone', val);
  const inUrl = md(`https://example.com/a?u=vibespace://settings/${K}`);
  ok(!/chat-setting-link/.test(inUrl) && /<a href="https:\/\/example\.com\/a\?u=vibespace:\/\/settings\/spend\.unattendedPerInstanceDay">/.test(inUrl), 'chat: inside another URL it is that URL\'s text, not a door', inUrl);
  ok(md(`see «vibespace://settings/${K}»，然后`) === `<p>see «${span(K, `vibespace://settings/${K}`)}»，然后</p>`, 'chat: CJK quotes and a fullwidth comma around it stay outside');
  ok(r.linkifyText(`tool said vibespace://settings/${K}, done`) === `tool said ${span(K, `vibespace://settings/${K}`)}, done`, 'chat: tool output (linkifyText) draws it too');
  // l1 (主开发 2026-11-15): after a half-width colon it IS a door; the scheme in capitals too; glued to a word it is words — and the path
  // pass never underlines its tail («//settings/<key>» answered «Not found» as a FILE)
  const L1 = { cjkColon: `上限在这里:vibespace://settings/${K}`, enColon: `Raise it here:vibespace://settings/${K}`, caps: `VIBESPACE://SETTINGS/${K}`, glued: `herevibespace://settings/${K}` };
  const l1 = Object.fromEntries(Object.entries(L1).map(([k, v]) => [k, md(v)]));
  ok(l1.cjkColon.includes(span(K, `vibespace://settings/${K}`)) && l1.enColon.includes(span(K, `vibespace://settings/${K}`)) && l1.caps.includes(`data-setting="${K}"`), 'l1 chat: after a half-width colon (zh and en) and with the scheme in capitals it is the DOOR', l1);
  ok(Object.values(l1).every((h) => !/chat-link-path|data-path=/.test(h)) && /<span class="chat-link-words">vibespace:\/\/settings\/spend\.unattendedPerInstanceDay<\/span>/.test(l1.glued), 'l1 chat: glued to a word it is WORDS, and no run of the scheme is ever a file path', l1.glued);
  const tgt = { closest: (sel) => (sel === '.chat-setting-link[data-setting]' ? tgt : null), dataset: { setting: K }, classList: { contains: (c) => c === 'chat-setting-link' || c === 'chat-link' } };
  const ev = { target: tgt, preventDefault() { this.dp = 1; }, stopPropagation() { this.sp = 1; }, clientX: 1, clientY: 1 };
  if (list._ls.click) list._ls.click(ev);
  ok(JSON.stringify(opened) === JSON.stringify([K]) && ev.dp === 1, 'chat: a press on it asks THE ONE DOOR (app.openSettingAt) for that row — nothing copied, nothing else opened', { opened, dp: ev.dp });
  const F = await bundle('src/lib/foryou-links.js', 'fy');
  const S = await bundle('src/lib/settings-schema.js', 'schema');
  const fyHas = S.isSettingKey;
  ok(fyHas(K) && !fyHas('spend.nope') && !fyHas('toString'), 'the client\'s known-key test is the schema\'s own rows (an own key — never a prototype name)');
  const segs = F.segmentText(`raise vibespace://settings/${K}.`, { has: fyHas }).filter((g) => g.t !== 'text');
  ok(segs.length === 1 && segs[0].kind === 'setting' && segs[0].ref === K, 'For you: the ONE grammar has a `setting` kind (known keys only)', segs);
  ok(F.segmentText('vibespace://settings/spend.nope', { has: fyHas }).filter((g) => g.t !== 'text').length === 0, 'For you: an unknown key is words');
  const fyL1 = Object.fromEntries(Object.entries(L1).map(([k, v]) => [k, F.segmentText(v, { has: fyHas }).filter((g) => g.t !== 'text')]));
  ok(['cjkColon', 'enColon', 'caps'].every((k) => fyL1[k].length === 1 && fyL1[k][0].kind === 'setting' && fyL1[k][0].ref === K) && Object.values(fyL1).every((gs) => gs.every((g) => g.kind !== 'path')) && fyL1.glued.length === 0,
    'l1 For you: the door after a colon and in capitals; glued to a word no link at all — never a path', fyL1);
  const inPath = F.segmentText(`/home/u/vibespace://settings/${K}`, { has: fyHas }).filter((g) => g.t !== 'text');
  ok(inPath.every((g) => !(g.kind === 'path' && /settings/.test(g.ref))), 'l1 For you: a path that runs into the scheme ends where the run begins (its tail is never a path)', inPath);
  const fyHtml = F.linkedHtml(`x vibespace://settings/${K} y`, { has: fyHas });
  ok(/<span class="fy-link" role="link" tabindex="0" data-fy="setting" data-ref="spend\.unattendedPerInstanceDay">vibespace:\/\/settings\/spend\.unattendedPerInstanceDay<\/span>/.test(fyHtml), 'For you: drawn as a .fy-link (data-fy="setting"), keyboard-reachable', fyHtml);
  ok(JSON.stringify(F.linkTarget('setting', K)) === JSON.stringify({ open: 'setting', key: K }) && F.linkTarget('setting', 'a=b') === null, 'For you: the link\'s target is the row (a value-shaped ref is no target)');
  const row = read('src/lib/user-todos-row.js'), act = read('src/lib/user-todos-actions.js');
  ok(/linkedHtml\(String\(text \|\| ''\), \{[^}]*has: isSettingKey/.test(row) && /has: isSettingKey/.test(row.slice(row.indexOf('export function linkifyInto'))) && /if \(tg\.open === 'setting'\) \{ app\.openSettingAt\?\.\(tg\.key\); return true; \}/.test(act),
    'For you: wordsHtml (the tray, the mini inbox, the phone sheet, the chat\'s card rows, the For-you window — question and detail) and linkifyInto (verbatim details) both ask the schema; a press goes to the door');
  const U = await bundle('src/lib/utils.js', 'utils');
  const body = mkEl(), toOpen = [];
  ok(U.toastWordsInto(body, `limit reached — vibespace://settings/${K}`) === 0 && body.textContent === `limit reached — vibespace://settings/${K}`, 'a toast with no door registered stays text, as before');
  U.registerSettingLinks({ has: fyHas, open: (k) => toOpen.push(k) });
  const b2 = mkEl(), n = U.toastWordsInto(b2, `limit reached — vibespace://settings/${K}.`);
  const btn = b2._kids.find((k) => k.className === 'global-toast-setting');
  ok(n === 1 && btn && btn.dataset.setting === K && btn.textContent === `vibespace://settings/${K}` && b2.textContent === `limit reached — vibespace://settings/${K}.`, 'a toast (the server\'s notices ride it): the link is a button built from text nodes, the rest stays text', b2._kids.map((k) => k.className || k.textContent));
  if (btn && typeof btn.onclick === 'function') btn.onclick({ preventDefault() { }, stopPropagation() { } });
  ok(JSON.stringify(toOpen) === JSON.stringify([K]), 'the toast\'s link opens the row through the registered door', toOpen);
  const b3 = mkEl(), n3 = U.toastWordsInto(b3, 'see vibespace://settings/spend.nope now');
  ok(n3 === 0 && !b3._kids.some((k) => k.className === 'global-toast-setting') && b3.textContent === 'see vibespace://settings/spend.nope now', 'l3: a toast holding an UNKNOWN key draws no button — it stays words');
  ok(/registerSettingLinks\(\{ has: isSettingKey, open: \(key\) => this\.openSettingAt\(key\) \}\);/.test(read('src/lib/app.js')), 'the app registers the door for toasts at boot');
}

console.log('⑤ the agents\' rule — one sentence in the manual and in vibespace-ask\'s usage; the injected rules have no room (measured)');
{
  const man = read('docs/agent/ask-manual.md');
  ok(/when an ask needs a setting changed, the ask carries that setting's link — `vibespace:\/\/settings\/<key>`[\s\S]{0,200}never a path in words/.test(man), 'docs/agent/ask-manual.md: when an ask needs a setting changed, it carries the link, never a path in words');
  const R = require(path.join(REPO, 'src/agent-cli-registry.js'));
  const ask = R.ROWS.find((x) => x.name === 'vibespace-ask'), said = ask.teach.sessionStart({ tray: null });
  // MEASURED (lane setting-doors pick 1): one 83 B line in the ask paragraph left test-stash-strip's manager twin (a manager with
  // groups, filled to the inline cap) 61 B OVER — the tightest shape had 22 B of room. «At most one short line»: none fits, so the
  // rule lives where an agent looks when it asks — the manual and vibespace-ask's own usage — and the injected rules stay as they were
  ok(!/vibespace:\/\/settings\//.test(said) && R.CAPS.sessionStart === 3160, 'the injected rules carry no line for it (the tightest shape had 22 B of room; an 83 B line went 61 B over) — the cap stays 3160 B');
  ok(/a setting to change: put its link in the question or --detail — vibespace:\/\/settings\/<key>/.test(read('data/bin/vibespace-ask')) && /never a path in words, and never write the setting yourself/.test(read('data/bin/vibespace-ask')), 'vibespace-ask\'s own usage (what an agent reads when it asks) carries the rule');
}

console.log('⑥ A LINK OPENS, IT NEVER WRITES');
{
  const app = read('src/lib/app.js'), ui = read('src/lib/settings-ui.js');
  const door = app.slice(app.indexOf('  openSettingAt(key) {'), app.indexOf('  openSettingAt(key) {') + 200);
  ok(/return this\._settingsUI\?\.open\(isSettingKey\(key\) \? \{ focusKey: key \} : \{\}\);/.test(door) && !/\.set\(|fetch|api\/settings/.test(door), 'the door only OPENS Settings (on the row when it is a row) — no value, no write');
  const focus = ui.slice(ui.indexOf('  _focusRow('), ui.indexOf('  _focusRow(') + 3000);
  ok(ui.includes('  _focusRow(') && !/settings\.set\(|_save\(|fetchJson\(|api\/settings|_setShowAdvanced\(/.test(focus), 'focusing the row writes nothing and never flips the per-device «show advanced» switch (the row is revealed for THIS open)');
  ok(!/[?&=]/.test(SL.KEY_CH.replace(/\\-/g, '')), 'the grammar\'s key alphabet has no `?`, `&` or `=` — a value cannot ride a link');
  const openSrc = ui.slice(ui.indexOf('  open({ syncId, search, category, focusKey } = {}) {'), ui.indexOf('  _focusRow('));
  ok(openSrc.length > 500 && !/_setShowAdvanced\(|_showAdvanced = true|setItem\(SHOW_ADVANCED_KEY/.test(openSrc.replace(/advInput\.onchange = \(\) => \{ this\._setShowAdvanced\(advInput\.checked\);/, '')), 'l3: open({ focusKey }) never turns «show advanced» on — the row is revealed for THIS open only (only the switch\'s own toggle writes it)');
}

console.log(fail ? `✗ test-setting-links: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
