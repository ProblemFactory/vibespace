#!/usr/bin/env node
// THE BROWSER STUCK WATCH — SOURCE / WORD PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-browser-stuck.mjs (its ① PURE verdicts, the watch over a fake CDP endpoint, the real routes + CLI, the bridge, the keeper's
// seams and every patched-copy CONTROL stay there): the UI words' zh / ja census, the notice / holder wiring (src/server/mounts-plugins-wiring.js,
// src/server/browser-dialogs.js), the route's missing drive belt (src/routes/browser.js), the A6 panel row (src/lib/browser-trace-view.js,
// src/lib/browser-panel-model.js), the keeper's launch stamps (src/server/browser-keeper.js) and ⑥ teaching (docs/agent/browser-manual.md,
// src/agent-routes.js, data/bin/vibespace-browser, src/hosts.js, src/server/agent-tool-generators.js), ①b's frame-fold pins (src/channel-record.js)
// and the CLI's two fallback lists, ⑤'s generatedConfigParts rule (src/browser-profiles.js, src/server/browser-env.js). Each file is read BY NAME, so
// ci.mjs's affected rule selects this suite on a change of any of them.
// Run: node scripts/test-browser-stuck-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import { anchored, deadPort } from './scratch.mjs'; // B-19a9: the release-note control is built by anchor (a moved line throws by name); the look's stand-in url on a free port (§81)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ST = require('../src/browser-stuck.js');
const V = require('../src/browser-verbs.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };

console.log('— the UI words: every kind × accept/dismiss × en/zh/ja (dictionary + source pins)');
// the UI words: every kind × accept/dismiss × en/zh/ja — every key a dictionary entry
{
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = new Set();
  const rec = (s, p) => { keys.add(s); return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); };
  const tOf = (dict) => (s, p) => String(dict[s] || s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
  const rows = [];
  for (const type of ['alert', 'confirm', 'prompt', 'beforeunload', 'dialog']) {
    const dd = ST.dialogFromCdp({ type, message: type === 'beforeunload' ? '' : 'Q?', defaultPrompt: 'd' }, {});
    const en = ST.dialogWords(dd, rec);
    rows.push({ type, en, zh: ST.dialogWords(dd, tOf(zh)), ja: ST.dialogWords(dd, tOf(ja)) });
  }
  for (const a of [{ by: 'auto', how: 'accepted' }, { by: 'user', how: 'accepted' }, { by: 'user', how: 'dismissed' }]) ST.answeredWords(a, rec);
  for (const f of [{ state: 'dialog' }, { state: 'unresponsive' }]) ST.stuckWords(f, rec);
  const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
  ok(byType.beforeunload.en.accept === 'Leave page' && byType.beforeunload.en.dismiss === 'Stay on page' && /discards what was typed/.test(byType.beforeunload.en.consequence) && byType.beforeunload.en.body === 'Changes you made may not be saved.'
    && byType.confirm.en.accept === 'OK' && byType.confirm.en.dismiss === 'Cancel' && byType.alert.en.dismiss === null && byType.prompt.en.prompt === true && byType.prompt.en.defaultValue === 'd', 'dialogWords: per kind — a leave-page dialog says Leave / Stay and what leaving loses; an alert has OK only; a prompt a text box with its default');
  const missing = [...keys].filter((k) => !(k in zh) || !(k in ja));
  ok(keys.size >= 18 && missing.length === 0, `every UI key of the dialog card / toast / stuck banner has a zh AND a ja entry (${keys.size} keys)`, missing);
  ok(rows.every((r) => r.zh.title !== r.en.title && r.ja.title !== r.en.title) && byType.beforeunload.zh.accept === '离开页面' && byType.beforeunload.ja.dismiss === 'ページに留まる', 'zh / ja render translated words for every kind (not the English fallback)');
  const liveSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const liveKeys = ['Could not restart the browser: {why}', 'The browser was restarted — its tabs open fresh', 'The browser was stopped — the agent’s next browser command starts it fresh', 'The dialog could not be answered: {why}'];
  ok(liveKeys.every((k) => liveSrc.includes(`t('${k}'`) && k in zh && k in ja), 'the live view\'s own new toasts are literal t() keys with zh + ja entries');
}

console.log('② the notice wiring (source pin)');
{
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/st\.pushNotice\(sessionStatusKey\(s, sessionId\), n, \{ replaceKind: true \}\)/.test(wsrc) && /\bwithdraw: \(sessionId, dialogId\) =>[^\n]*st\.dropNotices\(/.test(wsrc) && !/_withdraw: \(sessionId/.test(wsrc), 'wiring pin: the production notice callback replaces by kind and the watch\'s withdraw drops the closed dialog\'s notice');
}

console.log('③ the route carries no drive belt (source pin)');
{
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  ok(!/driveVerdictFor/.test(rsrc), 'lane browser-windows: the route carries no drive belt any more (the claim is deleted)');
}

console.log('③ A6 the panel row says a pre-lane browser accepts leave-page dialogs (source pins)');
// VERIFY r1 A6 (LOW): the Agent browser panel's row SAYS a browser launched before the lane still accepts leave-page
// dialogs itself (the attack: "the profile row says which mode it runs in"; before, nothing on any surface did)
{
  const src = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const KEYW = 'Accepts leave-page dialogs by itself (typed input is lost) until its next start';
  ok(/function autoDialogsOf\(r\) \{[^\n]*r\.live && !r\.host && b && b\.state === 'ready' && !b\.holdDialogs/.test(src) && src.includes(`autoDialogsOf(r) ? t('${KEYW}')`) && /pageStuckOf\(r\.id\), autoDialogsOf\(r\)(?:, [^\]\n]+)?\]/.test(src) /* lane browser-admin 2a: + the running build after it */ && KEYW in zh && KEYW in ja,
    'A6: a running local browser whose record carries no `holdDialogs` launch stamp is said on its panel row (keyed signature included; zh + ja)');
  // VERIFY r2 (the builder's open question 2): the same row offers ONE click to make such a browser hold dialogs — the human
  // Restart (a confirm first: its tabs close), only where the unresponsive Restart is not already offered
  const HOLD_KEYS = ['Restart to hold dialogs', 'Restart this browser so VibeSpace holds leave-page dialogs for a decision instead of the browser accepting them — its tabs close, logins stay', 'Restart {label}?', 'Its open tabs close (logins in the profile stay). From its next start VibeSpace holds leave-page dialogs for a decision, so nothing typed on a page is lost without a word.'];
  // design 015 (lane browser-panel-tidy): the row's acts are the ⋯ menu's — WHICH one is offered is the PURE model's
  // rowMenu (Restart while the page is stuck, ELSE Restart to hold dialogs); the view runs it by its id (RUN)
  const model = fs.readFileSync(path.join(REPO, 'src/lib/browser-panel-model.js'), 'utf8');
  const holdBlock = (src.match(/    'restart-hold': async \(r\) => \{[\s\S]*?\n    \},\n/) || [''])[0];
  ok(/if \(x\.stuck && x\.stuck\.action && r\.live && !r\.host\) out\.push\(\{ id: 'restart'[^\n]*\n\s*else if \(x\.autoDialogs\) out\.push\(\{ id: 'restart-hold'/.test(model) && /autoDialogs: !!autoText, autoText/.test(src) && /showConfirmDialog\(/.test(holdBlock) && /if \(!yes\) return;/.test(holdBlock) && holdBlock.includes('/api/browser/profiles/${encodeURIComponent(r.id)}/restart') && holdBlock.split('\n').length <= 20 && HOLD_KEYS.every((k2) => (holdBlock.includes(`t('${k2}'`) || model.includes(`t('${k2}'`)) && k2 in zh && k2 in ja), /* design 015: the label + its title are the model's menu item, the confirm the view's act */
    'r2 pin: a pre-lane browser\'s row offers "Restart to hold dialogs" — a confirm (its tabs close), then the human Restart route; never beside the unresponsive Restart; every word zh + ja', holdBlock.split('\n').length);
}

console.log('⑤ the keeper stamps holdDialogs at both launches (source pin)');
{
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  // lane one-browser-b1-mirror-fix: B1's attach road (attachStart — the keeper spawns Chrome itself) is a named profile's
  // second launch; it stamps beside its mark on one line — two `= true` stamps, each pinned at its own launch
  ok((ksrc.match(/rec\.holdDialogs = true;/g) || []).length === 2 && /rec\.mark = p\.id;[^\n]*\n\s*rec\.holdDialogs = true;/.test(ksrc) && /async function attachStart\(p, rec[\s\S]{0,3000}?\n\s*rec\.mark = p\.id; rec\.holdDialogs = true;/.test(ksrc) && /rec\.mark = p\.owner\.id;[\s\S]{0,500}?rec\.holdDialogs = pairsHoldDialogs\(pairs\);/.test(ksrc), 'the stamp sits at EVERY launch beside the mark: a named profile\'s always (the driver road\'s and the attach road\'s); an ephemeral\'s only when its pairs name a config that holds (rung N keeps its launch view — a bare escape command must not restart its daemon, test-browser-live lane P F2)');
}

// ═══ ⑥ teaching ═══
console.log('⑥ teaching: the manual, the ONE intro line, the CLI usage');
{
  const man = fs.readFileSync(path.join(REPO, 'docs/agent/browser-manual.md'), 'utf8');
  ok(/### Page dialogs/.test(man) && /accept = LEAVE the\s+page and lose what was typed/.test(man) && /dismiss = STAY/.test(man) && /the dialog was answered\s+in the live view/.test(man) && /`dialog_open` is answered, never waited out/.test(man) && !/agent-browser dialog/.test(man), 'the manual\'s "Page dialogs" section: each kind, what accept/dismiss do (a leave-page accept loses the input), the user may answer first, the rule');
  const AR = require('../src/agent-routes.js');
  const intro = AR.sessionToolsIntro({ status: true, ask: true, task: true, jobs: true }, { browserVariant: 'D' });
  ok(intro.includes(AR.BROWSER_DIALOG_LINE) && /dialog_open/.test(AR.BROWSER_DIALOG_LINE) && /vibespace-browser dialog accept \[text\]/.test(AR.BROWSER_DIALOG_LINE) && Buffer.byteLength(intro) < 9600 && (intro.match(/dialog_open/g) || []).length === 1, `the SessionStart tools intro carries ONE line teaching it, and stays under the 9 600 B inline cap (${Buffer.byteLength(intro)} B)`);
  const usage = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  ok(/vibespace-browser dialog status \| accept \[text\] \| dismiss/.test(usage) && V.classify(['dialog', 'accept', 'x'], { ours: true }).kind === 'page' && V.classify(['dialog', 'status'], { ours: true }).kind === 'page', 'the CLI\'s usage names the dialog verbs; the verb table admits `dialog status|accept|dismiss` as a page verb');
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8'), wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/const psw = ps \? stuckWords\(ps, t\) : null;/.test(tv) && /bprof-restart/.test(tv) && /\/api\/browser\/profiles\/\$\{encodeURIComponent\(r\.id\)\}\/restart/.test(tv) && /pageStuckOf\(r\.id\), autoDialogsOf\(r\)(?:, [^\]\n]+)?\]\); \};/.test(tv), 'wiring pin: the Agent browser panel\'s row prints the page\'s state and offers Restart (its keyed signature includes it)');
  ok(/addDigest\(\(\) => \(\{ pageStuck: Object\.fromEntries\(Object\.entries\(browserDialogs\.pageStuckMap\(\)\)\.filter\(\(\[pid\]\) => \{ try \{ return !browserKeeper\.isEphemeral\(pid\)/.test(wiring) && /browserKeeper\.setStuckSource\(\(bk, pid\) => browserDialogs\.stuckForKey\(bk, pid \? \{ profileId: pid \} : undefined\)\)/.test(wiring) && /browserDialogs\?\.onChange\(kickFacts\)/.test(wiring) && /dialogs: browserDialogs/.test(wiring), 'wiring pin: the watch feeds the keeper\'s fact, the fact republish, the routes, the bridge and the digest (named profiles only — never another conversation\'s ephemeral record)');
  const hosts = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  ok(/'vibespace-browser-stuck\.js'/.test(hosts) && /createBrowserStuckCopy\(\);/.test(fs.readFileSync(path.join(REPO, 'src/server/agent-tool-generators.js'), 'utf8')) && fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8').includes('data/bin/vibespace-browser-stuck.js'), 'the words ride beside the CLI to every host (AGENT_TOOLS, the boot copy, gitignored)');
}

console.log('— the .197 integration: the holders\' wiring (source pins)');
{
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  // int367 (the .367 train): lane passkey-browse-yourself r4 moved the holder rows into ONE composer, browser-dialogs.js
  // holdersOfKeeper (the person's row once, flagged) — the wiring hands it the keeper; the pin follows it there
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  ok(/const holdersOf = require\('\.\/browser-dialogs'\)\.holdersOfKeeper\(\(\) => browserKeeper\);/.test(wsrc) && /const h = typeof k\.humanOf === 'function' \? k\.humanOf\(profileId\) : null;\s*if \(h && h\.browserKey\) out\.push\(\{ browserKey: h\.browserKey, sessionId: null, ephemeral: false, human: true,/.test(dsrc) && /if \(h && h\.human\) return h\.input === 'user';/.test(dsrc), 'WIRING: the watch\'s holders include the user\'s own browsing row (keeper.humanOf), and "the user drives" reads the person\'s row\'s own side');
}

console.log('— ①b #1 the frame fold is channel-record\'s (source pins)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/browser-stuck.js'), 'utf8');
  const crSrc = fs.readFileSync(path.join(REPO, 'src/channel-record.js'), 'utf8');
  const openOf = (x) => (x.match(/^const FRAME_OPEN_RE = .*$/m) || [''])[0];
  // the .197 integration: lane lark-search-poll verify r3 gave channel-record THE FOLDER (a tag split by an invisible / control
  // character is live) — the line is copied again, and its supporting constants are pinned equal too (the head, the names)
  const constOf = (x, n) => (x.match(new RegExp(`^const ${n} = .*$`, 'm')) || [''])[0];
  ok(openOf(crSrc) && openOf(crSrc) === openOf(src) && ['FRAME_FOLD', 'FOLD', 'FOLD_G', 'lookThrough', 'FRAME_NAMES', 'FRAME_HEAD', 'FRAME_TAIL'].every((n) => constOf(crSrc, n) && constOf(crSrc, n) === constOf(src, n)) && ST.FRAME_OPEN_RE.flags === 'iuy', 'r2 #1 pin: FRAME_OPEN_RE is channel-record\'s own line, character for character, over the same folder constants (r1 pinned only FRAME_TAGS and FRAME_TAG_RE)');
}

console.log('— ①b the CLI\'s fallback lists equal the rules (source pins)');
{
  const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const fb = /const LOOP_PASS_FALLBACK = new Set\((\[[^\]]*\])\)/.exec(cliSrc);
  ok(fb && JSON.stringify(JSON.parse(fb[1].replace(/'/g, '"')).sort()) === JSON.stringify([...ST.LOOP_PASS_VERBS].sort()), 'the CLI\'s fallback list (an older rules file beside it on a host) is THE same list', fb && fb[1]);
  const cliSrc4 = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const fb4 = /const LOOP_READ_FALLBACK = new Set\(\[([^\]]*)\]\);/.exec(cliSrc4);
  ok(fb4 && JSON.stringify(fb4[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))) === JSON.stringify([...ST.LOOP_READ_VERBS]), 'the CLI\'s reading fallback equals LOOP_READ_VERBS');
}

console.log('— ⑤ generatedConfigParts holds dialogs when asked (PURE + a pin of browser-env.js)');
{
  const B = require('../src/browser-profiles.js');
  ok(B.generatedConfigParts({ userConfig: {}, holdDialogs: true }).config.noAutoDialog === true && B.generatedConfigParts({ userConfig: { noAutoDialog: false } }).config.noAutoDialog === false && /holdDialogs: true/.test(fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8')), 'generatedConfigParts: ours when asked (a new spawn\'s config — browser-env asks), the user\'s value otherwise');
}

console.log('— B-19a9 (r1846 (e)): the «tab gone» note says what ONE bounded look found — the PURE words, the CLI\'s look (a compiled copy over a fake socket and a fake timer), its wiring');
{
  // the driver's own answer, as box row 134 printed it (its last url replaced by a documentation host: no fixed endpoint, §81)
  const ID = '1C968AF8601617F9B1EB1A828F07DAE3';
  const LINE = `tab_gone: bound tab is gone (target ${ID}, last url https://example.org/p1b). Run \`agent-browser tab new <url>\` to bind a new tab, or \`agent-browser tab list\` to pick an existing one`;
  ok(ST.tabGoneTargetOf(LINE) === ID && ST.tabGoneTargetOf(LINE.replace(ID, ID.toLowerCase())) === ID && ST.tabGoneTargetOf('bound tab is gone (target ' + ID + ')') === null && ST.tabGoneTargetOf('tab_gone: bound tab is gone') === null && ST.tabGoneTargetOf(LINE.replace(ID, ID.slice(1))) === null,
    'the target a `tab_gone` answer names: its 32 hex (upper-case); no `tab_gone` word, no target, or 31 hex ⇒ null');
  const gone = ST.tabGoneNoteText(false), lives = ST.tabGoneNoteText(true), unread = [null, undefined, 'x'].map((v) => ST.tabGoneNoteText(v));
  const waysOk = (s) => /\[tab_gone\]$/.test(s) && /`vibespace-browser tab list`/.test(s) && /`vibespace-browser tab <id>`/.test(s);
  const livesLaw = (s) => /still open/.test(s) && !/closed/.test(s.replace(/whether it was closed/, '')) && waysOk(s);
  ok(/it was closed/.test(gone) && waysOk(gone), 'the look found it GONE ⇒ «your tab is gone (it was closed)» and this tool\'s ways out');
  ok(livesLaw(lives) && /lost track of it/.test(lives), 'the look found it LIVING ⇒ «your tab is still open — the browser driver lost track of it», never «closed»');
  ok(unread.every((s) => s === unread[0] && !/is gone \(it was closed\)|still open/.test(s) && /could not be read now/.test(s) && waysOk(s)), 'the look read nothing ⇒ NEITHER claim: «whether it was closed could not be read now»'); /* stale-pins: kept — an absence check over the words' own text */
  const RELEASE = 'your tab is gone (it was closed) — `vibespace-browser tab list` names your tabs; `vibespace-browser tab <id>` switches to one, `vibespace-browser tab new <url>` opens one [tab_gone]'; /* stale-pins: kept — the release's own sentence, the RED control's input */
  ok(!livesLaw(RELEASE), 'CONTROL (RED): the release\'s one sentence fails the living tab\'s law — it says «closed» of a tab that lives');

  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const fm = /\nfunction targetLives\(cdpUrl, targetId, ms\) \{[\s\S]*?\n\}\n/.exec(cli);
  const mk = (Ws) => { const timers = []; const fn = fm ? new Function('WebSocket', 'setTimeout', 'clearTimeout', fm[0] + '\nreturn targetLives;')(Ws, (f) => { timers.push(f); return timers.length; }, () => {}) : async () => 'missing'; return { fn, fire: () => timers.splice(0).forEach((f) => f()) }; };
  const fake = (plan) => {
    const made = [];
    class W { constructor(u) { this.url = u; this.sent = []; this.closed = false; made.push(this); if (plan.open !== false) queueMicrotask(() => this.onopen && this.onopen()); }
      send(d) { const q = JSON.parse(d); this.sent.push(q); if (plan.reply) queueMicrotask(() => this.onmessage && this.onmessage({ data: JSON.stringify(plan.reply(q)) })); }
      close() { this.closed = true; } }
    return { W, made };
  };
  const URL0 = `ws://127.0.0.1:${await deadPort()}/devtools/browser/x`; // never dialled: the fake socket stands in (§81: no fixed fixture endpoint)
  const listing = (ids) => (q) => ({ id: q.id, result: { targetInfos: ids.map((t) => ({ targetId: t, type: 'page' })) } });
  const alive = fake({ reply: listing([ID.toLowerCase(), 'B'.repeat(32)]) }), absent = fake({ reply: listing(['B'.repeat(32)]) });
  const r1 = await mk(alive.W).fn(URL0, ID, 1000), r2 = await mk(absent.W).fn(URL0, ID, 1000);
  ok(!!fm && r1 === true && r2 === false && alive.made.length === 1 && alive.made[0].url === URL0 && alive.made[0].sent.length === 1 && alive.made[0].sent[0].method === 'Target.getTargets' && alive.made[0].closed && absent.made[0].closed,
    'the look (the CLI\'s own targetLives, compiled): ONE `Target.getTargets` on the url it is handed — the target listed ⇒ true, absent ⇒ false; the socket closed after', { r1, r2, sent: alive.made[0] && alive.made[0].sent });
  const silent = fake({}); const m3 = mk(silent.W); const p3 = m3.fn(URL0, ID, 1000); await new Promise((r) => setImmediate(r)); m3.fire(); const r3 = await p3;
  const err = fake({ reply: (q) => ({ id: q.id, error: { code: -32000, message: 'refused' } }) }); const r4 = await mk(err.W).fn(URL0, ID, 1000);
  ok(r3 === null && silent.made[0].closed && r4 === null, 'BOUNDED: a socket that never answers ⇒ null when its own timer fires (the socket closed); an error answer ⇒ null — neither claim');
  const off = fake({ reply: listing([ID]) });
  const offs = await Promise.all([mk(off.W).fn('ws://192.0.2.1:9222/devtools/browser/x', ID, 1000), mk(off.W).fn('wss://example.org/x', ID, 1000), mk(off.W).fn('', ID, 1000), mk(off.W).fn(URL0, null, 1000), mk(undefined).fn(URL0, ID, 1000)]);
  ok(offs.every((x) => x === null) && off.made.length === 0, 'it DIALS NOTHING but a loopback url: off the loopback (a documentation address), wss, no url, no target id, or no WebSocket in this Node ⇒ null with no socket made', offs);

  // THE WIRING: the look starts ONLY on a `tab_gone` answer, with the conversation's OWN url (the driver's env), BEFORE the audit's
  // hub call (beside it, never after); the note says the look's verdict; the bound is one second at most; the release's sentence is gone
  const wired = (src) => {
    const start = src.indexOf("const tabGoneLook = code !== 0 && /\\btab_gone\\b/.test(outText + errText) && DS && typeof DS.tabGoneTargetOf === 'function' ? targetLives(env && env.AGENT_BROWSER_CDP, DS.tabGoneTargetOf(outText + '\\n' + errText), TAB_LOOK_MS) : null;");
    const audit = src.indexOf("await call('POST', '/api/agent/browser/audit'", start > 0 ? start : 0); // the exit handler's OWN audit call, after the look (the CLI holds others before it)
    const bound = /\nconst TAB_LOOK_MS = (\d+);/.exec(src);
    return start > 0 && audit > start && audit - start < 4000 && !!bound && Number(bound[1]) > 0 && Number(bound[1]) <= 1000
      && src.includes('DS.tabGoneNoteText(tabGoneLook ? await tabGoneLook : null)') && !src.includes("console.error('note: your tab is gone (it was closed)"); /* stale-pins: kept — the release's sentence must be ABSENT */
  };
  ok(wired(cli), 'the CLI: the look starts only on a `tab_gone` answer, with the driver\'s own AGENT_BROWSER_CDP, before the audit\'s hub call; the note says its verdict; its bound ≤ 1 s; the release\'s sentence is gone');
  const NOTE_NOW = "console.error(`note: ${DS && typeof DS.tabGoneNoteText === 'function' ? DS.tabGoneNoteText(tabGoneLook ? await tabGoneLook : null) : TAB_GONE_FALLBACK}`);";
  const rel = anchored(cli, NOTE_NOW, "console.error('note: " + RELEASE + "');", 'b19a9-release-note'); /* stale-pins: kept — the RED copy restores the release's note */
  const late = anchored(cli, 'const TAB_LOOK_MS = 1000;', 'const TAB_LOOK_MS = 5000;', 'b19a9-long-look');
  ok(!wired(rel) && !wired(late), 'CONTROL (RED): the release\'s note in a copy, and a look bounded at 5 s, each fail the wiring');
  ok(!/it was closed|still open/.test(cli.match(/const TAB_GONE_FALLBACK = '([^']*)';/)?.[1] || 'it was closed'), 'an install without the words file says neither claim (the CLI\'s own fallback)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
