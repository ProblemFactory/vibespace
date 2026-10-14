#!/usr/bin/env node
// test-webhook-ui — THE WEBHOOK OWNER SURFACE, fast (lane webhook-l2-ui, docs/design-webhook.zh.md §12 L2). The words and
// models (src/lib/webhook-view.js, DOM-free) and the source laws of the dialogs (src/lib/channel-webhook.js):
//   §1 the wizard's slug = the SERVER's PURE rule (`slugProblem`, one rule, no second regex anywhere in the client)
//   §2 THE TOKEN LAW: a register / rotate answer's token reaches showTokenOnce and nothing else (+ a RED control)
//   §3 "Send a message…"'s picker: a no-reply caller is disabled WITH its reason; revoked callers are not offered
//   §4 the budget row's words + the engine's projection; §5 the section by the capability row (no remove, no sign-in);
//   §6 the reply line and the send outcomes; §7 every new literal has zh + ja;
//   §8 (lane webhook-section-place) the built-in door's section sorts LAST (PURE accountSectionOrder + RED mutants) and its
//   New path… lives on the head row (source laws; the chrome twin is test-webhook-section-place).
//   §9 (lane webhook-pair-join, B-5ee0) THE PAIRING DOORS: the code law (a pair-code answer's code reaches showPairCodeOnce
//   alone — census + RED control), the join box keeps no state, every refusal the routes can name has words (a drift census
//   over the server's codes + a RED control), the words themselves, the menu row and the mint door.
// Heavy twin: test-webhook-ui-e2e (a real server + Chrome). Run: node scripts/test-webhook-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500) : '')); } };
const WA = require(path.join(REPO, 'src/webhook-auth.js'));
const V = await import(pathToFileURL(path.join(REPO, 'src/lib/webhook-view.js')).href);
const t = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] !== undefined ? String(p[k]) : `{${k}}`));

console.log('§1 the slug: the server\'s own rule, worded');
const cases = [['deploys', null], ['ci-2', null], ['', 'grammar'], ['Bad Slug', 'grammar'], ['-x', 'grammar'], ['a'.repeat(64), 'grammar'], ...WA.RESERVED_SLUGS.map((r) => [r, 'reserved'])];
ok(cases.every(([s, w]) => WA.slugProblem(s) === w), `slugProblem: ${cases.length} cases (good / grammar / every reserved name)`, cases.filter(([s, w]) => WA.slugProblem(s) !== w));
ok(cases.every(([s, w]) => (V.slugText(s, { t }) === null) === (w === null)) && /reserved/.test(V.slugText('groups', { t })) && /a-z, 0-9/.test(V.slugText('Bad Slug', { t })) && /\/hook\/<name>/.test(V.slugText('', { t })), 'the wizard words exactly what the rule refuses (reserved by name, the grammar, an empty name)');
const route = read('src/routes/webhook.js');
ok(/if \(WA\.slugProblem\(slug\)\) return bad\(res, 400,/.test(route) && !route.includes('!WA.SLUG_RE.test(slug) || WA.RESERVED_SLUGS.includes(slug)'), 'the create route refuses by the same verdict');
const SECOND = /\[a-z0-9\]\[a-z0-9-\]\{0,62\}/;
const clientFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f);
const second = clientFiles.filter((f) => SECOND.test(read(f)));
ok(second.length === 0 && SECOND.test(String(WA.SLUG_RE.source)), `no client file holds a second slug regex (${clientFiles.length} files; control: the pattern matches the rule's own source)`, second);

console.log('§2 THE TOKEN LAW');
/** every place channel-webhook.js reads a `.token` or holds the secret — each must be the showTokenOnce hand-off */
function tokenCensus(src) {
  const bad = [];
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export function showTokenOnce('));
  let end = start + 1; while (end < lines.length && !/^}/.test(lines[end])) end++;
  // lane webhook-pair-join: the pairing code's own shown-once dialog draws ITS secret the same way (the code law, §9)
  const cStart = lines.findIndex((l) => l.startsWith('export function showPairCodeOnce('));
  let cEnd = cStart + 1; while (cStart >= 0 && cEnd < lines.length && !/^}/.test(lines[cEnd])) cEnd++;
  lines.forEach((l, i) => {
    if (i >= start && i <= end) return;   // the one dialog that draws it
    if (cStart >= 0 && i >= cStart && i <= cEnd) return;
    for (const m of l.matchAll(/\.token\b/g)) { const at = l.slice(0, m.index); if (!/showTokenOnce\(\{ caller: a\.caller, $/.test(at.slice(-40)) && !/token: a$/.test(at.slice(-8))) bad.push(`${i + 1}: ${l.trim().slice(0, 120)}`); }
    if (/\bsecret\b/.test(l)) bad.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
    if (/(localStorage|sessionStorage)\b/.test(l)) bad.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
  });
  return { start, bad };
}
const WSRC = read('src/lib/channel-webhook.js');
const census = tokenCensus(WSRC);
const handOffs = (WSRC.match(/showTokenOnce\(\{ caller: a\.caller, token: a\.token/g) || []).length;
ok(census.start > 0 && census.bad.length === 0 && handOffs === 2, `the token is read ONLY as the hand-off to showTokenOnce (register + rotate = ${handOffs}); no storage, no state`, census.bad);
const MUT = WSRC.replace("r.appendChild(el('div', 'chan-wh-caller-line', v.delivery));", "r.appendChild(el('div', 'chan-wh-caller-line', v.delivery + (c.token || '')));");
ok(MUT !== WSRC && tokenCensus(MUT).bad.length === 1, 'RED CONTROL: a caller row that re-reads the token (a mutant) is caught by the census');
const shown = WSRC.slice(WSRC.indexOf('export function showTokenOnce('));
ok(/onClose: \(\) => \{ secret = ''; \}/.test(shown) && /closeOnBackdrop: false/.test(shown) && /'Shown once — rotate to get a new one\.'/.test(shown), 'the dialog: "Shown once — rotate to get a new one.", no backdrop close, its copy of the secret dropped on close');
const row = V.callerRow({ id: 'c-0123abcd', name: 'CI deploy-bot', auth: 'hmac', token: 'vswh_' + 'a'.repeat(40), tokenHash: 'h', delivery: { mode: 'reply-url', replyUrl: 'https://x.example/in' }, registeredAt: 1, lastCallAt: 0 }, { t });
ok(!JSON.stringify(row).includes('vswh_') && !JSON.stringify(row).includes('tokenHash') && row.auth === 'HMAC-signed' && /x\.example/.test(row.delivery) && row.facts.includes('last call never'), 'callerRow: named fields only — a token or hash handed in never reaches the model', row);

console.log('§3 the caller picker');
const P = V.pickerRows([{ id: 'c-1', name: 'A', delivery: { mode: 'reply-url' } }, { id: 'c-2', name: 'B', delivery: { mode: 'poll' } }, { id: 'c-3', name: 'C', delivery: { mode: 'none' } }, { id: 'c-4', name: 'D', delivery: { mode: 'poll' }, revokedAt: 5 }], { t });
ok(P.length === 3 && !P[0].disabled && !P[1].disabled && P[2].disabled && /takes no replies/.test(P[2].why) && P.every((x) => x.disabled === !!x.why), 'delivery none ⇒ disabled WITH its reason (never a bare greyed box); revoked ⇒ not offered', P);
ok(/if \(pk\.why\) lab\.appendChild\(el\('span', 'chan-wh-why', pk\.why\)\);/.test(WSRC) && /b\.disabled = pk\.disabled;/.test(WSRC), 'the dialog draws the reason beside the disabled box');

console.log('§4 the budget row');
ok(V.budgetText('deploys', { used: 1, lim: 6 }, { t }) === 'path deploys: 1 / 6 wakes this hour' && V.budgetText('x', null, { t }) === null && V.budgetText('x', { used: 0, lim: 0 }, { t }) === null, '"path deploys: 1 / 6 wakes this hour"; nothing where none is declared');
const ENG = read('src/server/channels-engine.js');
ok(ENG.includes('wakeBudget: (() => { const b = pathBudgetVerdict(rec, convId, en, t); return b.lim ? { used: b.used, lim: b.lim, spent: !b.ok, why: b.why || null } : null; })(),'), 'the conversation view carries the ENGINE\'s budget verdict (its own words once spent)');
const FE = read('src/lib/channel-filter-editor.js');
ok(FE.includes("const how0 = !w && st.wakeBudget ? 'digest' : a0.how;") && FE.includes("case 'fact': bind(textInput(rule.key,") && FE.includes("'fact': t('has the fact (key = value)'),"), 'the Notify dialog: a new notification on a budgeted path starts as a digest; the `fact` rule row has key + value fields');

console.log('§5 the section, by the capability row');
ok(V.offersPaths({ pushTransport: 'http-inbound' }) && !V.offersPaths({ pushTransport: 'webhook' }) && !V.offersPaths({ kind: 'webhook' }) && !V.offersPaths(null), 'offersPaths reads the row\'s transport, never the kind');
ok(ENG.includes('      pushTransport: c.pushTransport || null,'), 'the account view projects the row\'s pushTransport');
const PANEL = read('src/lib/channels-panel.js');
ok(PANEL.includes("      const np = btn('', () => showNewPathDialog(app, { adapterId: a.id }), 'chan-wh-new');") && PANEL.includes("glyph: curSystems.has(conv.adapterId) ? 'robot' : null"), 'the section offers New path… and its rows wear the robot, muted — both by offersPaths');
const WH = require(path.join(REPO, 'src/channels/webhook.js'));
ok(WH.removable === false && WH.consent === null && WH.manifest === undefined && WH.seed === true && WH.listed === true, 'the module declares removable: false, no consent and no manifest ⇒ not a connectable account (no Remove / Re-authorize / Disconnect in its ⋯)');

console.log('§6 the reply line and the send outcomes');
ok(V.replyToText({ quoteWho: 'CI deploy-bot' }, { t }) === 'to CI deploy-bot (caller)' && V.replyToText({ kind: 'dm', participants: 'Monitor' }, { t }) === 'to Monitor (caller)' && /Send a message…/.test(V.replyToText({ kind: 'group', participants: 'A, B' }, { t })), 'under the box: the quoted call\'s caller, the one caller, or how to choose');
const callers = [{ id: 'c-1', name: 'A', delivery: { mode: 'reply-url' } }, { id: 'c-2', name: 'B', delivery: { mode: 'poll' } }];
const out = V.sendOutcomes({ ok: false, proposals: [{ recipient: 'c-1', proposal: { state: 'sent' } }, { recipient: 'c-2', proposal: { state: 'sent' } }, { recipient: 'c-1', proposal: { state: 'failed', reason: 'connect ECONNREFUSED' } }] }, callers, { t });
ok(out.map((x) => x.text).join('|') === 'Sent to A|Queued for B to fetch|A: connect ECONNREFUSED' && out[2].type === 'error' && V.sendOutcomes({ ok: false, error: 'no caller on this path takes replies' }, callers, { t })[0].text === 'no caller on this path takes replies', 'sent / queued for poll / failed with the server\'s words — each its own toast');

console.log('§7 every new literal has zh + ja');
const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const keys = new Set();
for (const f of ['src/lib/channel-webhook.js', 'src/lib/webhook-view.js']) for (const m of read(f).matchAll(/\bt\((['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\'/g, "'"));
const lack = [...keys].filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
ok(keys.size > 60 && lack.length === 0, `${keys.size} literals, each in zh and ja`, lack);

console.log('§8 the Webhook section: last in Accounts, its New path… on the head row (lane webhook-section-place)');
{
  const door = (id) => ({ id, kind: 'webhook', pushTransport: 'http-inbound' });
  const acct = (id, kind) => ({ id, kind });
  // THE TABLE: [given (arrival order), wanted ids] — the person's accounts keep their order, every door after them
  const TABLE = [
    [[door('webhook'), acct('lark:a', 'lark'), acct('gmail:a', 'gmail')], ['lark:a', 'gmail:a', 'webhook']],
    [[acct('lark:a', 'lark'), door('webhook'), acct('slack:a', 'slack'), acct('lark:b', 'lark')], ['lark:a', 'slack:a', 'lark:b', 'webhook']],
    [[door('webhook'), door('webhook:2')], ['webhook', 'webhook:2']],
    [[acct('gmail:a', 'gmail'), acct('lark:a', 'lark')], ['gmail:a', 'lark:a']],
    [[{ id: 'hook-ish', kind: 'webhook' }, acct('lark:a', 'lark')], ['hook-ish', 'lark:a']],   // the capability row decides, never the kind
    [[], []],
  ];
  const judge = (rule) => TABLE.filter(([given, want]) => { const got = rule(given.slice()).map((a) => a.id); return got.join(',') !== want.join(','); }).length;
  ok(judge(V.accountSectionOrder) === 0 && V.accountSectionOrder(null).length === 0 && V.accountSectionOrder([null, acct('x', 'lark')]).length === 1, `accountSectionOrder: ${TABLE.length} rows — the person's own accounts first in arrival order, every inbound door after them`);
  const given = [door('webhook'), acct('lark:a', 'lark')];
  ok(V.accountSectionOrder(given) !== given && given[0].id === 'webhook', 'the rule returns a new list (the digest\'s adapters are never reordered in place)');
  ok(judge((xs) => xs) > 0 && judge((xs) => [...xs.filter(V.offersPaths), ...xs.filter((a) => !V.offersPaths(a))]) > 0, 'RED controls: arrival order (a webhook listed before a user account) and doors-first are each judged wrong by the same table');
  ok(PANEL.includes('    const accounts = accountSectionOrder(adapters.filter((a) => !a.builtin));') && (PANEL.match(/accountSectionOrder\(/g) || []).length === 1 && !/\.sort\([^)]*offersPaths/.test(PANEL), 'the Accounts part orders its sections by the rule — its ONE call site, no second sort');
  const sec = PANEL.slice(PANEL.indexOf('  function section(a, mine, siblings, ordinal, badge) {'), PANEL.indexOf('  let curBadges = new Map();'));
  const iNp = sec.indexOf("      h.appendChild(np);"), iCnt = sec.indexOf("    h.appendChild(cnt);"), iDot = sec.indexOf("    h.appendChild(dot);"), iMore = sec.indexOf("    h.appendChild(more);");
  ok(iDot > 0 && iNp > iDot && iCnt > iNp && iMore > iCnt && !/sec\.appendChild\([^\n]*(newpath|chan-wh-new|np\b)/.test(sec) && !sec.includes("keep('newpath:"), 'New path… is built INTO the head row — after the name and dot, before the count and the ⋯ — and no longer hangs below it', { iDot, iNp, iCnt, iMore });
  ok(sec.includes("np.title = t('New path…');") && sec.includes("np.setAttribute('aria-label', t('New path…'));") && sec.includes("lab.className = 'chan-wh-new-label';") && read('src/lib/channel-chrome.js').includes('b.onclick = (ev) => { ev.stopPropagation(); onClick(ev); };'), 'its glyph-only form keeps the word in a tooltip + aria-label; btn stops the press (the head does not fold)');
  ok(PANEL.includes("registerMenuItem({ menu: M, group: '1_rows', order: 1, when: (c) => offersPaths(A(c)), label: () => t('New path…'), run: (c) => showNewPathDialog(c.app, { adapterId: A(c).id }) });"), 'the head\'s ⋯ / right-click menu (one menu) gains New path… as its first row, for an inbound door only');
  const CSS = read('public/style.css');
  ok(CSS.includes('@container chan-panel (max-width: 300px) { .chan-wh-new-label { display: none; }') && CSS.includes('@media (max-width: 480px) { .chan-wh-new-label { display: none; }'), 'narrow (a phone, a ≤ 300 px panel) the button keeps its glyph alone');
}

console.log('§9 the pairing doors (lane webhook-pair-join, B-5ee0)');
{
  /** every `.code` read in channel-webhook.js — the ONE allowed is the hand-off of the pair-code answer to showPairCodeOnce */
  const codeCensus = (src) => src.split('\n').flatMap((l, i) => [...l.matchAll(/\.code\b/g)].filter((m) => !/showPairCodeOnce\(\{ code: a$/.test(l.slice(0, m.index).slice(-30))).map(() => `${i + 1}: ${l.trim().slice(0, 120)}`));
  const codeHand = (WSRC.match(/showPairCodeOnce\(\{ code: a\.code, expiresAt: a\.expiresAt/g) || []).length;
  ok(codeHand === 1 && codeCensus(WSRC).length === 0, 'THE CODE LAW: a pair-code answer\'s code is read ONLY as the hand-off to showPairCodeOnce (1); a refusal is worded by webhook-view.js, never read here', codeCensus(WSRC));
  const CMUT = WSRC.replace("  showPairCodeOnce({ code: a.code, expiresAt: a.expiresAt, path: title || slug });", "  showToast(a.code);\n  showPairCodeOnce({ code: a.code, expiresAt: a.expiresAt, path: title || slug });");
  ok(CMUT !== WSRC && codeCensus(CMUT).length === 1, 'RED CONTROL: a mutant that also toasts the code is caught by the code census');
  const pc = WSRC.slice(WSRC.indexOf('export function showPairCodeOnce('), WSRC.indexOf('export function showJoinDialog('));
  ok(/closeOnBackdrop: false/.test(pc) && /onClose: \(\) => \{ secret = ''; if \(tick\) clearInterval\(tick\); tick = null; \}/.test(pc) && /secret = ''; shown\.textContent = '—'; copy\.disabled = true;/.test(pc) && /t\('Expired — make a new code'\)/.test(pc),
    'the shown-once code: no backdrop close; closing drops it and stops its clock; at the deadline the box drops it and says "Expired — make a new code"');
  const jd = WSRC.slice(WSRC.indexOf('export function showJoinDialog('));
  ok(/onClose: \(\) => \{ box\.value = ''; seq\+\+; clearTimeout\(timer\); \}/.test(jd) && !/^(let|var) /m.test(WSRC) && /check: true/.test(jd) && (jd.match(/post\('\/api\/channels\/webhook\/join'/g) || []).length === 2,
    'the join box: the pasted code lives in the box alone (no module-level state; closing empties it); one read (`check: true`) and one join, both the existing route');
  // every refusal the two routes can NAME has words here — a drift census over the server's own codes
  const WPS = read('src/webhook-pair.js'), RT = read('src/routes/webhook.js');
  const joinSrc = RT.slice(RT.indexOf('function joinRefusal('));
  const named = new Set([...['decodeCode', 'hookUrlVerdict'].flatMap((fn) => { const b = WPS.slice(WPS.indexOf(`function ${fn}(`)); return [...b.slice(0, b.indexOf('\n}\n')).matchAll(/no\('([a-z-]+)'/g)].map((m) => m[1]); }),
    ...[...joinSrc.matchAll(/code: '([a-z-]+)'/g)].map((m) => m[1]), ...[...joinSrc.matchAll(/'(no-instance-url)'\)/g)].map((m) => m[1])]);
  const unworded = [...named].filter((c) => !V.PAIR_REFUSALS.includes(c));
  ok(named.size >= 9 && unworded.length === 0, `every refusal the join / pair-code routes name has words in webhook-view.js (${[...named].join(', ')})`, unworded);
  const drift = WPS.replace("return no('caller-token',", "return no('code-shape',");
  const named2 = [...drift.slice(drift.indexOf('function decodeCode(')).slice(0, 900).matchAll(/no\('([a-z-]+)'/g)].map((m) => m[1]).filter((c) => !V.PAIR_REFUSALS.includes(c));
  ok(drift !== WPS && named2.length === 1, 'RED CONTROL: a server refusal renamed without words (a mutant) is caught by the drift census', named2);
  const whys = V.PAIR_REFUSALS.map((c) => V.joinWhyText({ code: c, error: 'HTTP 500' }, { from: 'Hub A', t }));
  ok(new Set(whys).size === V.PAIR_REFUSALS.length && whys.every((w) => w && !/\{/.test(w)) && /^Hub A says this code was already used/.test(V.joinWhyText({ code: 'code-used' }, { from: 'Hub A', t })) && /^Hub A does not know this code/.test(V.joinWhyText({ code: 'code-unknown' }, { from: 'Hub A', t }))
    && /^The other side says/.test(V.joinWhyText({ code: 'code-used' }, { t })) && /caller token, not a pairing code/.test(V.joinWhyText({ code: 'caller-token' }, { t })) && /has expired/.test(V.joinWhyText({ code: 'expired' }, { t })) && V.joinWhyText({ code: 'pair-refused', error: 'HTTP 502' }, { t }) === 'The pairing did not complete: HTTP 502' && /no answer/.test(V.joinWhyText(null, { t })),
    'each refusal BY NAME — one distinct sentence per code; "Hub A says … already used" / "Hub A does not know this code" name who refused (else "The other side"); the rest in the server\'s words', whys);
  const NOW9 = 1_800_000_000_000, ck = { from: 'Hub A', host: 'a.example', theirPath: 'ci', slug: 'ci', exists: false, repair: false, expiresAt: NOW9 + 8 * 60e3 + 5e3 };
  ok(V.joinPreviewText(ck, { t, now: NOW9 }) === 'Hub A offers its path ci (a.example) — this code works once, for 9 more min' && V.joinPathText(ck, 'hub-a', { t }) === "A new path hub-a is made here for Hub A's calls"
    && /already exists here — Hub A joins it as one more caller/.test(V.joinPathText({ ...ck, exists: true }, 'ci', { t })) && /already paired with Hub A on ci — this code renews/.test(V.joinPathText({ ...ck, exists: true, repair: true }, 'ci', { t })),
    'the paste box\'s read: who offers which path where and for how long; then what joining does here (a new path / joins one / renews)');
  ok(V.joinDoneText({ path: { slug: 'hub-a' }, repaired: false }, { from: 'Hub A', t }) === 'Paired with Hub A — its calls land in path hub-a, and your replies go back to it' && /^Pairing with Hub A renewed on path hub-a/.test(V.joinDoneText({ path: { slug: 'hub-a' }, repaired: true }, { from: 'Hub A', t }))
    && V.codeClockText(NOW9 + 599e3, { t, now: NOW9 }) === 'Works once · expires in 9:59' && V.codeClockText(NOW9, { t, now: NOW9 }) === null, 'the finished join says what it did; the shown code\'s clock counts down m:ss and is null at the deadline');
  ok(PANEL.includes("registerMenuItem({ menu: M, group: '1_rows', order: 2, when: (c) => offersPaths(A(c)), label: () => t('Join with a pairing code…'), run: (c) => showJoinDialog(c.app) });") && zh.includes('"Join with a pairing code…":') && ja.includes('"Join with a pairing code…":'),
    'the Webhook section\'s ⋯ (by the capability row): "Join with a pairing code…" right under New path… — zh + ja');
  ok(/const pair = btn\(t\('Pair with another VibeSpace…'\), \(\) => mintPairCode\(slug, title\), 'chan-wh-add'\);/.test(WSRC) && /pair\.dataset\.whPairOpen = slug;/.test(WSRC), 'a path\'s caller panel: "Pair with another VibeSpace…" beside Register a caller (the mint door)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
