#!/usr/bin/env node
// test-webhook-ui — THE WEBHOOK OWNER SURFACE, fast (lane webhook-l2-ui, docs/design-webhook.zh.md §12 L2). The words and
// models (src/lib/webhook-view.js, DOM-free) and the source laws of the dialogs (src/lib/channel-webhook.js):
//   §1 the wizard's slug = the SERVER's PURE rule (`slugProblem`, one rule, no second regex anywhere in the client)
//   §2 THE TOKEN LAW: a register / rotate answer's token reaches showTokenOnce and nothing else (+ a RED control)
//   §3 "Send a message…"'s picker: a no-reply caller is disabled WITH its reason; revoked callers are not offered
//   §4 the budget row's words + the engine's projection; §5 the section by the capability row (no remove, no sign-in);
//   §6 the reply line and the send outcomes; §7 every new literal has zh + ja.
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
  lines.forEach((l, i) => {
    if (i >= start && i <= end) return;   // the one dialog that draws it
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
ok(PANEL.includes("if (offersPaths(a)) sec.appendChild(keep('newpath:' + a.id,") && PANEL.includes("glyph: curSystems.has(conv.adapterId) ? 'robot' : null"), 'the section offers New path… and its rows wear the robot, muted — both by offersPaths');
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

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
