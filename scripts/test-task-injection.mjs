#!/usr/bin/env node
// test-task-injection — WHAT THE PRODUCT TELLS AN AGENT ABOUT THE OWNER (lane agent-context-owner-facts, B-7960 — a fleet
// user's two daily annoyances, userW 2026-10-20):
//   (a) every time an agent read was UTC (`toISOString().slice(0, 16)`) while the owner lives in America/Los_Angeles — an
//       agent relayed «23:16» for 16:16 PT and he answered the wrong meeting;
//   (b) the injected «the For you tray at the bottom right» was a literal — he had moved the tray to the top and reads its
//       label in Chinese.
// This suite gates the fix:
//   §1 THE formatter (PURE src/when-words.js): the rule (zone named; the date dropped only beside a stated today), the
//      zone's order (setting → TZ env → system → UTC), the sentence (a UTC instance says UTC, never "the owner's clock");
//   §2 THE tray words (PURE src/tray-words.js): every place the chrome settings can put the tray, its label = the page's own
//      'For you' words, the element row = Customize mode's, the page's report;
//   §3 the instance setting `instance.timezone` (the schema row, its words in zh/ja, the reference docs);
//   §4 THE INJECTION on a PT fixture (a zone set ⇒ the paragraph names it, every time in the payload is in that zone; TASK.md
//      keeps every date; one sentence for several groups), a UTC instance (says UTC), the TZ-env fallback;
//   §5 the other agent-facing times (the drained stash, the task / job answers);
//   §6 the tray sentence on every surface (SessionStart, reminder, session intro, stop nudge) with the tray at the top, zh,
//      and on a phone;
//   §7 the CLIs print the HUB's words (the real data/bin files over a stub hub — vibespace-task / -ask / -vault / -job);
//   §8 THE TIME CENSUS (a sliced ISO time in the files that render for agents ⇒ RED, the machine-facing rows named);
//   §9 THE WORDS CENSUS (a hand-written «bottom right» under src/ or data/bin ⇒ RED, the measured-corner rows named);
//   §10 RED CONTROLS: the pre-fix renders (UTC strings on a PT fixture; the literal «bottom right» with a top-placed tray)
//      fail the very judges above.
// In-process (no server, no browser). Run: node scripts/test-task-injection.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.log(`  ✗ ${name}${extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : ''}`);
}

const W = require('../src/when-words.js');
const TW = require('../src/tray-words.js');
const OF = require('../src/server/owner-facts.js');
const FIXED = Date.UTC(2026, 9, 20, 23, 16);         // 2026-10-20 16:16 PDT — the incident's «23:16»
const WINTER = Date.UTC(2026, 11, 1, 20, 0);          // 2026-12-01 12:00 PST
// an INDEPENDENT oracle for "today in a zone" (not the module under test)
const dayIn = (ms, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

console.log('§1 THE formatter (src/when-words.js)');
{
  const LA = 'America/Los_Angeles';
  ok(W.whenOf(FIXED, { zone: LA }) === '2026-10-20 16:16 PT', 'the incident instant reads 2026-10-20 16:16 PT in the owner\'s zone (never «23:16»)', W.whenOf(FIXED, { zone: LA }));
  ok(W.whenOf(WINTER, { zone: LA }) === '2026-12-01 12:00 PT', '…a winter instant reads PT too (the generic name — PDT / PST never confuse a relay)', W.whenOf(WINTER, { zone: LA }));
  ok(W.whenOf(FIXED, { zone: LA, now: FIXED + 3600e3 }) === '16:16 PT', 'with `now` on the same day IN THAT ZONE the date is dropped (16:16 PT)');
  ok(W.whenOf(FIXED, { zone: LA, now: FIXED + 24 * 3600e3 }) === '2026-10-20 16:16 PT', '…the next day it is kept');
  const lateLA = Date.UTC(2026, 9, 21, 3, 0), nextMorningUTC = Date.UTC(2026, 9, 21, 10, 0);   // 20:00 PT on the 20th · 03:00 PT on the 21st — the same UTC day
  ok(W.whenOf(lateLA, { zone: LA, now: nextMorningUTC }) === '2026-10-20 20:00 PT', 'the day is the ZONE\'s: one UTC day, two PT days ⇒ the date is kept', W.whenOf(lateLA, { zone: LA, now: nextMorningUTC }));
  ok(W.whenOf(FIXED, { zone: 'UTC' }) === '2026-10-20 23:16 UTC', 'a UTC instance prints exactly what it always printed beside its « UTC» (`2026-10-20 23:16 UTC`)');
  ok(W.whenOf(FIXED, { zone: 'Asia/Shanghai' }) === '2026-10-21 07:16 GMT+8' && W.whenOf(FIXED, { zone: 'America/New_York' }) === '2026-10-20 19:16 ET' && W.whenOf(Date.UTC(2026, 0, 5, 12), { zone: 'Europe/London' }) === '2026-01-05 12:00 GMT',
    'a zone without a short generic name reads its offset (GMT+8); ET; a London winter GMT');
  ok(W.whenOf(NaN, { zone: LA }) === 'an unknown time' && W.whenOf(FIXED, { zone: 'Mars/Base' }) === '2026-10-20 23:16 UTC', 'not a time ⇒ «an unknown time»; a zone this runtime does not know ⇒ UTC, named');
  ok(W.timeOf(FIXED, LA) === '16:16 PT', 'timeOf: a row under its day\'s header (16:16 PT)');
  const z1 = W.zoneOf(LA, { env: 'Asia/Tokyo', system: 'Europe/Berlin' }), z2 = W.zoneOf('', { env: ':Asia/Tokyo', system: 'Europe/Berlin' }), z3 = W.zoneOf('', { system: 'Europe/Berlin' }), z4 = W.zoneOf('Mars/Base', {}), z5 = W.zoneOf(undefined, { env: 'nonsense', system: null });
  ok(z1.zone === LA && z1.from === 'setting' && z2.zone === 'Asia/Tokyo' && z2.from === 'env' && z3.zone === 'Europe/Berlin' && z3.from === 'system' && z4.zone === 'UTC' && z4.from === 'fallback' && z4.refused === 'Mars/Base' && z5.zone === 'UTC' && !z5.refused,
    'the zone: the setting → the TZ env (its POSIX `:` prefix read) → the system zone → UTC only as the last resort; a setting it does not know is named (refused)', { z1, z2, z3, z4, z5 });
  const sPT = W.zoneSentence({ zone: LA }, FIXED), sUTC = W.zoneSentence({ zone: 'UTC' }, FIXED);
  ok(sPT === 'Times are the owner\'s clock, America/Los_Angeles (PT); today there is 2026-10-20 (no date = today).', 'the sentence names whose clock it is, the zone and the day a dateless time means', sPT);
  ok(sUTC === 'Times are UTC; today there is 2026-10-20 (no date = today).' && !/owner's clock/.test(sUTC), 'a UTC instance says UTC — and never calls it the owner\'s clock', sUTC);
}

console.log('§2 THE tray words (src/tray-words.js)');
{
  const P = (a, o) => TW.trayPlace(a, o);
  ok(P({}) === 'bottom right' && TW.trayWords({}).phrase === 'the “For you” tray at the bottom right', 'no settings ⇒ its default place: the “For you” tray at the bottom right');
  ok(P({ 'taskbar.position': 'top' }) === 'top right' && P({ 'chrome.zoneAlign': { 'taskbar-tray': 'left' } }) === 'bottom left' && P({ 'taskbar.position': 'top', 'chrome.zoneAlign': { 'taskbar-tray': 'left' } }) === 'top left',
    'the taskbar\'s edge (taskbar.position) and the tray\'s end (chrome.zoneAlign) move it: top right / bottom left / top left');
  const arr = (zone) => ({ 'chrome.arrangement': { [zone]: ['btn-presets', TW.TRAY_ELEMENT] } });
  ok(P(arr('toolbar-right')) === 'top right' && P(arr('toolbar-center')) === 'top' && P({ ...arr('toolbar-center'), 'chrome.zoneAlign': { 'toolbar-center': 'left' } }) === 'top left' && P(arr('toolbar-row2')) === 'top' && P(arr('taskbar-row2')) === 'bottom' && P({ ...arr('taskbar-row2'), 'taskbar.position': 'top' }) === 'top',
    'Customize mode\'s zones (chrome.arrangement): the toolbar ⇒ top (right / center / left), its second row ⇒ top, the taskbar\'s second row ⇒ its edge');
  ok(P({ 'taskbar.showUserTodos': false }) === null && P({ 'taskbar.visibility': 'hidden' }) === null && P({ ...arr('toolbar-right'), 'taskbar.visibility': 'hidden' }) === 'top right' && TW.trayWords({ arrangement: { 'taskbar.showUserTodos': false } }).phrase === 'the “For you” tray (hidden from their screen now)',
    'its switch off, or a hidden taskbar holding it ⇒ hidden (said so); moved to the toolbar it survives a hidden taskbar');
  ok(P({}, { phone: true }) === 'top' && TW.trayWords({ phone: true }).phrase === 'the “For you” tray at the top of their phone screen' && P({ 'taskbar.showUserTodos': false }, { phone: true }) === null,
    'on a phone the tray is the top bar\'s button, whatever the desktop arrangement says');
  const zh = TW.trayWords({ arrangement: arr('toolbar-right'), lang: 'zh' }), ja = TW.trayWords({ lang: 'ja' }), xx = TW.trayWords({ lang: 'fr' });
  ok(zh.phrase === 'the “待你处理” (For you) tray at the top right' && zh.name === 'the “待你处理” (For you) tray' && ja.label === 'あなた宛て' && xx.label === 'For you' && xx.lang === 'en',
    'the label is the owner\'s language (the English gloss beside it); an unknown language reads English', { zh, ja: ja.label });
  const tableWord = (f) => { const m = /^ {2}"For you": "([^"]+)",/m.exec(read(f)); return m && m[1]; };
  ok(TW.LABELS.zh === tableWord('src/lib/i18n-zh.js') && TW.LABELS.ja === tableWord('src/lib/i18n-ja.js') && /title: t\('For you'\)/.test(read('src/lib/inbox-window.js')) && /'usage-section-title ut-title', t\('For you'\)/.test(read('src/lib/user-todos-panel.js')),
    'LABELS = the page\'s own \'For you\' words (the popup\'s and the window\'s title) in i18n-zh / -ja', TW.LABELS);
  const row = /\{ id: '([\w-]+)',\s+label: 'For-you inbox',[^}]*defaultZone: '([\w-]+)' \}/.exec(read('src/lib/customize-mode.js'));
  ok(row && row[1] === TW.TRAY_ELEMENT && row[2] === TW.TRAY_DEFAULT_ZONE, 'the element id and its default zone = Customize mode\'s CHROME_ELEMENTS row', row && row.slice(1));
  const schema = read('src/lib/settings-schema.js');
  ok(TW.TRAY_SETTING_KEYS.every((k) => schema.includes(`  '${k}': {`)), 'every setting the place reads is a schema row (a renamed key ⇒ RED)', TW.TRAY_SETTING_KEYS);
  ok(TW.ownerPageDelta({}, { lang: 'en' }) === null && TW.ownerPageDelta({ ownerPage: { lang: 'zh' } }, { lang: 'zh' }) === null
    && JSON.stringify(TW.ownerPageDelta({}, { lang: 'zh' })) === '{"ownerPage":{"lang":"zh","phone":false}}' && JSON.stringify(TW.ownerPageDelta({ ownerPage: { lang: 'zh' } }, { lang: 'zh', phone: true })) === '{"ownerPage":{"lang":"zh","phone":true}}',
    'the page reports {lang, phone} only when user-state does not already say so (an English desktop page on a fresh instance never writes)');
  const page = read('src/lib/owner-facts.js'), store = read('src/lib/sidebar-state.js');
  ok(/ownerPageDelta\(state, \{ lang: resolveLang\(\), phone: !!phone \}\)/.test(page) && /method: 'PATCH'/.test(page) && /this\._userStateFetched = true;[\s\S]{0,400}reportOwnerPage\(state, \{ phone: !!this\.app\.isMobile \}\);/.test(store),
    'the page reports it once user-state is loaded (the sidebar\'s one fetch), merge-only');
}

console.log('§3 the instance setting');
{
  const schema = read('src/lib/settings-schema.js');
  const m = /'instance\.timezone': \{\n {4}type: 'string', default: '',\n {4}label: t\('([^']+)'\),\n {4}description: t\('((?:[^'\\]|\\.)+)'\),\n {4}category: t\('Integration'\)/.exec(schema);
  ok(!!m, 'ONE schema row `instance.timezone` (a string, default empty = automatic, in Integration)');
  const label = m && m[1], desc = m && m[2].replace(/\\'/g, '\'');
  ok(!!m && /Empty = this server's own zone: its TZ setting, else the system's/.test(desc) && /16:16 PT/.test(desc) && /Task Group board/.test(desc), 'its words say what it is used for and the default rule (its TZ, else the system\'s)', desc);
  const jsonKey = (s) => JSON.stringify(s);
  ok(!!m && ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => read(f).includes(`  ${jsonKey(label)}: `) && read(f).includes(`  ${jsonKey(desc)}: `)), 'its label and description have zh + ja words');
  ok(/instance\.timezone/.test(read('docs/settings.md')), 'the settings reference lists it (docs/settings.md, generated)');
  ok(/require\('\.\/src\/server\/owner-facts\.js'\)\.configure\(\{ setting: serverSetting, userState: \(\) => persistenceRouter\.readUserState\(\) \}\);/.test(read('server.js')), 'server.js binds the owner facts to THE server-side settings reader and user-state');
  ok(/zone: require\('\.\.\/server\/owner-facts\.js'\)\.zone\(\)/.test(read('src/routes/files.js')) && /setHubZone\(d\.zone\);/.test(read('src/lib/app.js')), 'the page learns the zone the hub resolved (/api/home `zone`) — the board prints in it');
}

// ── the fixture: a Task Group whose entries sit at known instants ──
const SET = {};
let US = {};
OF.configure({ setting: (k) => SET[k], userState: () => US });
const { TaskGroupManager } = require('../src/task-groups.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-task-injection-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const mk = (TG, title) => {
  const mgr = new TG({ dataDir: fs.mkdtempSync(path.join(tmp, 'd-')), onChange: () => {} });
  const g = mgr.create({ title, objective: 'Keep the meetings straight.' });
  for (const note of ['NOTE-FIXED', 'NOTE-OLD', 'NOTE-NOW']) mgr.addProgress(g.id, { note, session: 'claude:aaa' });
  const t = mgr._state.tasks[g.id];
  t.progress[0].at = FIXED; t.progress[1].at = Date.now() - 36 * 3600e3; t.progress[2].at = Date.now();
  t.updatedAt = FIXED;
  return { mgr, id: g.id, t };
};
/** a zone's short name where it follows a time: PT, UTC, GMT+9 — then a space, a bracket or the end (never «NOTE-…») */
const ZONE_TOKEN = '(GMT[+-][\\d:]+|[A-Z]{2,5})(?=[\\s)\\].,;]|$)';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** THE JUDGE of an injection in `zone` (short `abbr`): [] = right. Every problem named. */
function judgeInjection(text, { zone, abbr, owner = true }) {
  const bad = [];
  const A = esc(abbr);
  const today = dayIn(Date.now(), zone);
  const fixedRow = dayIn(FIXED, zone) === today ? `${W.timeOf(FIXED, zone)}` : `${dayIn(FIXED, zone)} ${W.timeOf(FIXED, zone)}`;
  if (!text.includes(`Times are ${owner ? `the owner's clock, ${zone} (${abbr})` : zone}; today there is ${today} (no date = today).`)) bad.push('no zone sentence naming ' + zone);
  if (!new RegExp(`^- \\d\\d:\\d\\d ${A} NOTE-NOW`, 'm').test(text)) bad.push('today\'s row is not «HH:MM ' + abbr + '»');
  if (!new RegExp(`^- \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d ${A} NOTE-OLD`, 'm').test(text)) bad.push('an earlier day\'s row lost its date or its zone');
  if (!text.includes(`- ${fixedRow} NOTE-FIXED`)) bad.push('the fixed instant is not ' + fixedRow);
  if (!text.includes(`- Updated: ${fixedRow}`)) bad.push('the Updated line is not ' + fixedRow);
  const bare = [...text.matchAll(new RegExp(`\\b\\d\\d:\\d\\d\\b(?! ${ZONE_TOKEN})`, 'g'))].map((x) => text.slice(Math.max(0, x.index - 20), x.index + 12));
  if (bare.length) bad.push('a time without its zone: ' + bare.join(' | '));
  const other = [...text.matchAll(new RegExp(`\\b\\d\\d:\\d\\d ${ZONE_TOKEN}`, 'g'))].map((x) => x[1]).filter((z) => z !== abbr);
  if (other.length) bad.push('a time in another zone: ' + [...new Set(other)].join(','));
  return bad;
}

console.log('§4 THE INJECTION on a PT fixture (instance.timezone = America/Los_Angeles)');
{
  SET['instance.timezone'] = 'America/Los_Angeles';
  const { mgr, id } = mk(TaskGroupManager, 'Fleet');
  const ctx = mgr.renderContext(id);
  const bad = judgeInjection(ctx, { zone: 'America/Los_Angeles', abbr: 'PT' });
  ok(bad.length === 0, 'the SessionStart paragraph names the zone and EVERY time in it is PT (today\'s rows without the date, the rest with it)', bad);
  ok(!/\bUTC\b/.test(ctx), '…and no UTC anywhere in it');
  const md = mgr.renderTaskMd(mgr.get(id));
  ok(md.includes('- Updated: 2026-10-20 16:16 PT') && md.includes('- 2026-10-20 16:16 PT NOTE-FIXED') && new RegExp(`^- ${dayIn(Date.now(), 'America/Los_Angeles')} \\d\\d:\\d\\d PT NOTE-NOW`, 'm').test(md) && !/\bUTC\b/.test(md),
    'TASK.md (a file read on later days) keeps EVERY date, in PT', md.split('\n').filter((l) => /NOTE|Updated/.test(l)).join(' | '));
  const two = mk(TaskGroupManager, 'Second');
  const g2 = two.mgr.create({ title: 'Other', objective: 'x' });
  const multi = two.mgr.renderMultiContext([two.id, g2.id]);
  ok((multi.match(/Times are /g) || []).length === 1 && judgeInjection(multi, { zone: 'America/Los_Angeles', abbr: 'PT' }).filter((b) => !/Updated/.test(b)).length === 0,
    'several groups: ONE zone sentence, every row in PT', judgeInjection(multi, { zone: 'America/Los_Angeles', abbr: 'PT' }));
  const snap = mgr.snapshotForDiff(id);
  mgr.addProgress(id, { note: 'NOTE-DIFF', session: 'claude:bbb' });
  const diff = mgr.renderContextDiff(id, snap, {}) || '';
  ok(new RegExp(`- ${dayIn(Date.now(), 'America/Los_Angeles')} \\d\\d:\\d\\d PT NOTE-DIFF`).test(diff), 'a mid-session update block: the new row in PT with its date (it carries no sentence)', diff.slice(-200));
  SET['instance.timezone'] = 'UTC';
  const u = mk(TaskGroupManager, 'UTC box');
  const uctx = u.mgr.renderContext(u.id);
  ok(judgeInjection(uctx, { zone: 'UTC', abbr: 'UTC', owner: false }).length === 0 && !/owner's clock/.test(uctx), 'a UTC instance: the paragraph SAYS UTC (never "the owner\'s clock") and every time is UTC', judgeInjection(uctx, { zone: 'UTC', abbr: 'UTC', owner: false }));
  const keepTZ = process.env.TZ;
  try {
    SET['instance.timezone'] = '';
    process.env.TZ = 'Asia/Tokyo';
    const e = mk(TaskGroupManager, 'Env box');
    const ectx = e.mgr.renderContext(e.id);
    SET['instance.timezone'] = 'Mars/Base';
    const rctx = e.mgr.renderContext(e.id);
    ok(judgeInjection(ectx, { zone: 'Asia/Tokyo', abbr: 'GMT+9' }).length === 0 && OF.zone().from === 'env' && judgeInjection(rctx, { zone: 'Asia/Tokyo', abbr: 'GMT+9' }).length === 0,
      'no setting (or one this runtime does not know) ⇒ the server process\'s TZ env (Asia/Tokyo, GMT+9)', judgeInjection(ectx, { zone: 'Asia/Tokyo', abbr: 'GMT+9' }));
  } finally { if (keepTZ === undefined) delete process.env.TZ; else process.env.TZ = keepTZ; SET['instance.timezone'] = 'America/Los_Angeles'; }
}

const AR = require('../src/agent-routes.js');
console.log('§5 the other times an agent reads');
{
  SET['instance.timezone'] = 'America/Los_Angeles';
  const st = AR.renderMsgStash([{ ts: FIXED, fromName: 'Peer one', source: 'agent', text: 'the meeting moved' }]).text;
  ok(st.includes('[2026-10-20 16:16 PT]') && !/\d\dZ\]/.test(st), 'a drained message stash stamps its entries in PT, the date kept (never «[10-20T23:16Z]»)', st);
  const { mgr, id } = mk(TaskGroupManager, 'Answers');
  mgr.update(id, { backlog: [{ text: 'decide later', status: 'open', addedBy: 'claude:aaa', claimedBy: [], addedAt: FIXED }] });
  const t = mgr.get(id);
  const show = AR.taskShowAnswer(t, (t.backlog || []).filter((b) => b.status === 'open'));
  ok(show.progress.every((p) => p.when && p.when.at === W.whenOf(p.at, { zone: 'America/Los_Angeles' })) && show.backlog[0].when && show.backlog[0].when.addedAt === '2026-10-20 16:16 PT',
    'the task answers (show / backlog / progress) carry every instant as the hub\'s words (`when.at`, `when.addedAt`)', show.backlog[0].when);
  const j = AR.jobWhen({ id: 'jb-1', nextFireAt: FIXED, archivedAt: WINTER, run: { startedAt: FIXED } });
  ok(j.when && j.when.nextFireAt === '2026-10-20 16:16 PT' && j.when.archivedAt === '2026-12-01 12:00 PT' && j.when.runStartedAt === '2026-10-20 16:16 PT' && !('publishSince' in j.when),
    'a job view carries its instants as words (`when.nextFireAt / archivedAt / runStartedAt`)', j.when);
}

console.log('§6 the tray sentence on every surface (the owner moved it to the top and reads Chinese)');
const TOP_ZH = 'the “待你处理” (For you) tray at the top right';
/** THE JUDGE of a teaching surface: [] = it names the tray in the hub's words. */
const judgeTray = (text, phrase) => [...(text.includes(phrase) ? [] : ['the hub\'s words are missing']), ...(/bottom[ -]right/i.test(text) ? ['a literal «bottom right»'] : [])];
{
  SET['taskbar.position'] = 'top';
  US = { ownerPage: { lang: 'zh' } };
  ok(OF.tray().phrase === TOP_ZH, 'the binding reads the synced settings + the owner\'s last page: ' + OF.tray().phrase);
  const { mgr, id } = mk(TaskGroupManager, 'Tray');
  const ctx = mgr.renderContext(id);
  ok(judgeTray(ctx, `ALSO file it in ${TOP_ZH} (say that, never "your inbox")`).length === 0, 'the SessionStart paragraph', judgeTray(ctx, TOP_ZH));
  const rem = AR.perTurnToolsLine({ status: true, ask: true, task: true, jobs: true });
  ok(judgeTray(rem, `MIRROR every chat question into ${TOP_ZH} (name it so`).length === 0, 'the per-turn reminder', rem.slice(0, 300));
  const intro = AR.sessionToolsIntro({ status: true, ask: true }, {});
  ok(judgeTray(intro, `call it "${TOP_ZH}", never "your inbox"`).length === 0, 'the session-start intro (every harness)');
  const nudge = AR.stopNudgeReason({ ask: true });
  ok(nudge.includes('the “待你处理” (For you) tray only notifies') && !/bottom[ -]right/i.test(nudge), 'the stop nudge names it by its label', nudge.slice(0, 200));
  US = { ownerPage: { lang: 'zh', phone: true } };
  ok(mgr.renderContext(id).includes('ALSO file it in the “待你处理” (For you) tray at the top of their phone screen'), 'the owner last used a phone ⇒ the phone\'s place');
  US = {}; delete SET['taskbar.position'];
  ok(OF.tray().phrase === 'the “For you” tray at the bottom right', 'nothing moved, an English page ⇒ the default place, in English');
}

console.log('§7 the CLIs print the HUB\'s words (the real data/bin files over a stub hub)');
{
  const answers = {};
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { const a = answers[`${req.method} ${req.url.split('?')[0]}`]; res.writeHead(a ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(a || { error: 'no stub for ' + req.url })); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { ...process.env, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_test', VIBESPACE_SKIP_AGENT_HOOKS: '1' };
  const run = (cli, args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin', cli), ...args], { env, timeout: 20000 }, (e, out, err) => resolve({ code: e ? e.code : 0, out: String(out) + String(err) })));
  try {
    answers['GET /api/agent/task'] = { success: true, you: 'claude:me', task: { id: 'T-1', title: 'Fleet', backlog: [{ id: 'B-1', text: 'decide', status: 'open', addedBy: 'claude:me', claimedBy: ['claude:me'], addedAt: FIXED, when: { addedAt: '2026-10-20 16:16 PT' } }], progress: [{ id: 'P-1', at: FIXED, note: 'shipped', session: 'claude:me', when: { at: '2026-10-20 16:16 PT' } }] } };
    const ts = await run('vibespace-task', ['show', '--full']);
    ok(ts.code === 0 && ts.out.includes('  - 2026-10-20 16:16 PT [P-1] shipped') && ts.out.includes('parked by claude:me at 2026-10-20 16:16 PT') && !/23:16/.test(ts.out), 'vibespace-task show: the Activity rows and the backlog\'s "parked at" are the hub\'s words', ts.out.slice(0, 500));
    answers['GET /api/agent/task'].task.progress[0].when = undefined;
    const ts0 = await run('vibespace-task', ['show']);
    ok(ts0.out.includes('  - 2026-10-20T23:16:00.000Z [P-1] shipped') && !/2026-10-20 23:16(?!:)/.test(ts0.out), '…a hub that sends no words ⇒ the full ISO instant (its Z names UTC), never a bare «23:16»', ts0.out.slice(0, 300));
    answers['POST /api/agent/user-todo'] = { success: true, item: { id: 'ut-1', text: 'Which meeting?' }, chars: 14, tray: { name: 'the “待你处理” (For you) tray', phrase: TOP_ZH } };
    const ask = await run('vibespace-ask', ['Which meeting?']);
    ok(ask.code === 0 && ask.out.includes(`added to ${TOP_ZH}: Which meeting?`) && ask.out.includes(`say "${TOP_ZH}" — never "your inbox"`) && !/bottom[ -]right/i.test(ask.out), 'vibespace-ask: the add answer and its REMINDER say where it landed in the hub\'s words', ask.out.slice(0, 400));
    answers['GET /api/agent/vault/state'] = { state: 'locked', lockedSince: FIXED, keys: [], when: { lockedSince: '2026-10-20 16:16 PT' }, tray: 'the “待你处理” (For you) tray' };
    const v = await run('vibespace-vault', ['status']);
    ok(v.code === 0 && v.out.includes('the user has already been told (the “待你处理” (For you) tray names what is waiting on it)') && v.out.includes('locked since 2026-10-20 16:16 PT'), 'vibespace-vault status: the locked line names the tray and the lock time in the hub\'s words', v.out.slice(0, 400));
    answers['GET /api/agent/jobs'] = { success: true, jobs: [{ id: 'jb-1', kind: 'oneshot', state: 'done', name: 'nightly', archived: true, archivedAt: FIXED, when: { archivedAt: '2026-10-20 16:16 PT' } }] };
    const jl = await run('vibespace-job', ['list']);
    ok(jl.code === 0 && jl.out.includes('jb-1 [oneshot] done (archived 2026-10-20 16:16 PT)'), 'vibespace-job list: an archived job\'s day is the hub\'s words', jl.out.slice(0, 300));
  } finally { srv.close(); }
}

console.log('§8 THE TIME CENSUS — a sliced ISO time in what renders for an agent ⇒ RED');
const SLICED = /toISOString\(\)\s*\.\s*(?:slice|substr|substring|replace)\(/;
/** the machine-facing rows: [file, a needle on the line, why] — a file name, an archive key, a round-trip parse, a journal line */
const TIME_ALLOWED = [
  ['src/task-groups.js', 'const monthOf = (at) =>', 'the archive FILE\'s month key (data/task-groups-archive/<id>/<YYYY-MM>.ndjson) — never shown'],
  ['src/task-groups.js', "for (const p of prog) body.push(`- ${new Date(p.at).toISOString()", 'the repo task file\'s Activity rows — importFromFile parses them back as UTC (`Date.parse(… + \'Z\')`)'],
  ['src/server/integration-store.js', '.corrupt-${', 'a corrupt file\'s aside NAME'],
  ['src/server/plugin-install.js', 'trashDir, `${id}-${', 'a trashed plugin\'s directory NAME'],
  ['src/server/conversation-deliver.js', '.corrupt-${', 'a corrupt file\'s aside NAME'],
  ['src/server/usage-pool-engine.js', '.corrupt-${', 'a corrupt file\'s aside NAME'],
  ['src/server/usage-pool-engine.js', "const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');", 'a day-named archive shard\'s FILE name'],
  ['src/server/csp-reports.js', "const today = new Date(now()).toISOString().slice(0, 10);", 'the CSP notice cap\'s DAY KEY (ten notices a day, lane app-page-csp .331 — int332 seam: a site after this census\'s base) — a counter key, never shown'],
  ['src/server/channels-engine.js', 'log.warn(`[channels] ${k}: send row not resolved', 'a journal line (the server log, never an agent\'s or the owner\'s words)'],
];
const censusFiles = () => {
  const fs0 = [];
  for (const d of ['src/server', 'src/agent-routes']) for (const f of fs.readdirSync(path.join(REPO, d))) if (f.endsWith('.js')) fs0.push(`${d}/${f}`);
  return ['src/task-groups.js', 'src/agent-routes.js', 'src/agent-cli-registry.js', 'src/routes/vault.js', 'src/routes/apps.js', ...fs0, 'data/bin/vibespace-task', 'data/bin/vibespace-ask', 'data/bin/vibespace-job', 'data/bin/vibespace-vault'];
};
const codeOf = (ln) => { const t = ln.trim(); return /^(\/\/|\*|\/\*)/.test(t) ? '' : ln; };
function timeCensus(files, textOf) {
  const hits = [], used = new Set();
  for (const f of files) {
    textOf(f).split('\n').forEach((ln, i) => {
      if (!SLICED.test(codeOf(ln))) return;
      const row = TIME_ALLOWED.findIndex(([af, needle]) => af === f && ln.includes(needle));
      if (row >= 0) used.add(row); else hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 140)}`);
    });
  }
  return { hits, unused: TIME_ALLOWED.filter((_, i) => !used.has(i)).map((r) => r[0] + ' ' + r[1]) };
}
{
  const files = censusFiles();
  const c = timeCensus(files, read);
  ok(files.length > 150 && c.hits.length === 0, `CENSUS over ${files.length} files (the Task Group renders, the agent routes, src/server, the agent CLIs): every sliced ISO time is a named machine-facing row`, c.hits);
  ok(c.unused.length === 0, `every allowed row (${TIME_ALLOWED.length}) still matches a line (a dead row ⇒ RED)`, c.unused);
  const PRE = { 'src/task-groups.js': "  _tsShort(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }", 'data/bin/vibespace-task': "      console.log('  - ' + new Date(pr.at).toISOString().slice(0, 16).replace('T', ' ') + (own ? ' [' + pr.id + ']' : '') + ' ' + pr.note);", 'src/agent-routes.js': "    const stamp = new Date(Number(e.ts) || Date.now()).toISOString().slice(5, 16) + 'Z';" };
  const ctl = timeCensus(Object.keys(PRE), (f) => PRE[f]);
  ok(ctl.hits.length === 3, 'CONTROL: the pre-fix lines (the injection\'s _tsShort, the CLI\'s Activity row, the stash stamp) are each caught', ctl.hits);
}

console.log('§9 THE WORDS CENSUS — a hand-written «bottom right» under src/ or data/bin ⇒ RED');
const BR = /bottom[ -]right/i;
/** the rows that are not the tray's place in words: [file, needle, why] */
const WORDS_ALLOWED = [
  ['src/lib/user-todos-layout.js', "export const TRAY_CORNERS = Object.freeze(['bottom right',", 'the toast\'s corner i18n keys — MEASURED off the button\'s rect on that device (trayWhere), never assumed'],
  ['src/lib/i18n-zh.js', '  "bottom right": ', 'that key\'s words'],
  ['src/lib/i18n-ja.js', '  "bottom right": ', 'that key\'s words'],
  ['src/lib/window.js', "return 'bottom-right';", 'a window snap quadrant\'s id'],
  ['src/lib/window.js', "'bottom-right':{left:", 'a window snap quadrant\'s rect'],
];
function wordsCensus(files, textOf) {
  const hits = [], used = new Set();
  for (const f of files) {
    textOf(f).split('\n').forEach((ln, i) => {
      const code = codeOf(ln).replace(/\s\/\/ .*$/, '');
      if (!BR.test(code)) return;
      const row = WORDS_ALLOWED.findIndex(([af, needle]) => af === f && ln.includes(needle));
      if (row >= 0) used.add(row); else hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 140)}`);
    });
  }
  return { hits, unused: WORDS_ALLOWED.filter((_, i) => !used.has(i)).map((r) => r[0] + ' ' + r[1]) };
}
{
  const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src', 'data/bin'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => f && /\.(m?js|cjs)$|^data\/bin\/[^.]+$/.test(f) && fs.existsSync(path.join(REPO, f)));
  const c = wordsCensus(tracked, read);
  ok(tracked.length > 500 && c.hits.length === 0, `CENSUS over ${tracked.length} files: no string under src/ or data/bin says where the tray is (the hub's words do — src/tray-words.js)`, c.hits);
  ok(c.unused.length === 0, `every allowed row (${WORDS_ALLOWED.length}) still matches a line`, c.unused);
  const PRE = {
    'src/agent-cli-registry.js': "    summary: 'file what the USER must act on into their For you tray (bottom right, never \"your inbox\"); resolve it when they answer',",
    'data/bin/vibespace-ask': "  console.log((item.existing ? 'already in the user\\'s For you tray (refreshed): ' : 'added to the user\\'s For you tray (bottom right of their screen): ') + item.text + '  (' + item.id + ')');",
    'src/agent-routes.js': "  if (T.ask) L.push('Asking the user ANYTHING (or ending a turn waiting on them): ALSO file it with `vibespace-ask \"question\"` — call where it lands \"the For you tray at the bottom right\", never \"your inbox\"');",
  };
  const ctl = wordsCensus(Object.keys(PRE), (f) => PRE[f]);
  ok(ctl.hits.length === 3, 'CONTROL: the pre-fix lines (the registry\'s summary, vibespace-ask\'s answer, the session intro) are each caught', ctl.hits);
}

console.log('§10 RED CONTROLS — the pre-fix renders fail the judges above');
{
  SET['instance.timezone'] = 'America/Los_Angeles';
  const M = mutantCopies('task-injection', REPO);
  const tg = read('src/task-groups.js');
  const pre = tg.replace('  _tsShort(ms, now = null) { return OF.when(ms, { now }); }', "  _tsShort(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }")
    .replace('      `- Updated: ${ts(t.updatedAt)}`,', '      `- Updated: ${ts(t.updatedAt)} UTC`,')
    .replace(' The state below is shared across ALL sessions of this group. ${OF.zoneSentence(now)}`,', ' The state below is shared across ALL sessions of this group.`,');
  ok(pre !== tg && (pre.match(/OF\.zoneSentence/g) || []).length === (tg.match(/OF\.zoneSentence/g) || []).length - 1, '(the patch applied: the pre-fix formatter, the « UTC» Updated line, no sentence)');
  const { TaskGroupManager: PreTG } = M.load('src/task-groups.js', pre, 'pre-utc');
  const b = mk(PreTG, 'Fleet');
  const bad = judgeInjection(b.mgr.renderContext(b.id), { zone: 'America/Los_Angeles', abbr: 'PT' });
  ok(bad.length >= 4 && bad.some((x) => /no zone sentence/.test(x)) && bad.some((x) => /without its zone/.test(x)), `the base's UTC strings on a PT fixture fail the injection's judge (${bad.length} problems — the «23:16» an agent relayed)`, bad);
  SET['taskbar.position'] = 'top'; US = { ownerPage: { lang: 'zh' } };
  const reg = read('src/agent-cli-registry.js');
  const preReg = reg.replace("ALSO file it in ${trayOf(tray)} (say that, never \"your inbox\")", 'ALSO file it in their For you tray (bottom right of their screen: say that, never "your inbox")');
  ok(preReg !== reg, '(the patch applied: the registry\'s ask paragraph as the base wrote it)');
  const R0 = M.load('src/agent-cli-registry.js', preReg, 'pre-literal');
  const said = R0.renderSessionStartTools({ status: true, ask: true, task: true, jobs: true }, { tray: OF.tray().phrase }).join('\n');
  const tb = judgeTray(said, TOP_ZH);
  ok(tb.length === 2, 'the base\'s literal «bottom right» with a top-placed tray fails the tray judge (no hub words, a literal place)', tb);
  delete SET['taskbar.position']; US = {};
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
