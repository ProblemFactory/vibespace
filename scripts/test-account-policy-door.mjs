#!/usr/bin/env node
// THE ACCOUNT'S POLICY DOOR (lane account-policy-door, userW 2026-10-07 "想给整个 Lark 配置可见性与策略，但配不了"):
// the account's sending policy had a route (`PUT /api/channels/adapters/:id {policy}`) and NO door — the account-grain
// Grant access refused `send` ("this channel requires review") and nothing on screen could make the account direct.
// Proves: ① the PURE `policyRowModel` table (modes offered per vendor × own value × source × the words, en / zh / ja);
// ② the route's `base` (moved since ⇒ 409 `policy-changed`, nothing written); ③ a real engine: account review ⇒ the
// account-grain access refuses send; PUT direct ⇒ the view the dialog re-reads lifts the cap (send offered), a
// conversation with no policy reads direct (source account), one holding its own review keeps it; ④ the agent's
// words (`status <conversation>`, the list row); ⑤ the doors in source (account ⋯ → Reach & policy…, the Edit
// dialog's select, the in-place re-draw) + a PATCHED-COPY CONTROL (the dialog without its policy row ⇒ red);
// ⑥ THE GUARDS' DOOR (lane guards-door, owner 2026-10-09 "带文件是不是要直接允许也要加个开关，防止用户想要完全放权"):
// the `guardRows` table (every guard × state × owner/agent view), `delegationText` only when direct + nothing asks,
// the real renderer over a fake DOM (a click writes the ONE instance setting, the store's change redraws), the card's
// pointer, the server's off-hours switch + 2 PATCHED-COPY CONTROLS (a per-grain write ⇒ red; delegation while a guard asks ⇒ red).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const SRC = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const P = require(path.join(REPO, 'src/channel-policy.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const express = require('express');
const ROOT = scratch('chan-account-policy-door');
const quiet = { log() {}, warn() {}, error() {} };
const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));

console.log('① the PURE policy row model');
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const JA = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const miss = new Set();
const tOf = (D) => (s, p) => { if (D && !(s in D)) miss.add(s); return fill(D ? D[s] || s : s, p); };
const LARK = ['review', 'direct'], SLACK = ['review'];
const grid = [];
for (const modes of [LARK, SLACK]) for (const grain of ['account', 'conversation']) for (const pol of [
  { mode: 'review', source: 'default', declared: null, inherits: null },
  { mode: 'direct', source: 'account', declared: 'direct', inherits: { mode: 'review', source: 'default' } },
  { mode: 'review', source: 'conversation', declared: 'review', inherits: { mode: 'direct', source: 'account' } },
  { mode: 'direct', source: 'adapter-default', declared: 'direct', inherits: null },
]) grid.push({ grain, modes, pol: { ...pol, modes } });
for (const D of [null, ZH, JA]) for (const g of grid) for (const guards of [{}, { linksReview: false, attachmentsReview: false }, { offHoursTz: 'Asia/Shanghai' }, { offHoursTz: 'Asia/Shanghai', offHoursOn: false, linksReview: false }, { linksReview: false, attachmentsReview: false, offHoursTz: '' }]) for (const owner of [false, true]) P.policyRowModel({ grain: g.grain, policy: g.pol, guards, t: tOf(D), owner, localTz: 'Asia/Tokyo' });
P.policyWhereText({ grain: 'account' }, tOf(ZH)); P.policyWhereText({ grain: 'conversation', source: 'conversation' }, tOf(ZH));
P.policyWhereText({ grain: 'account' }, tOf(JA)); P.policyWhereText({ grain: 'conversation', source: 'conversation' }, tOf(JA));
ok(miss.size === 0, `every word the row model says is in zh AND ja (${grid.length} rows × 3 guard sets)`, [...miss].join(' | '));
const m = (grain, pol, extra = {}) => P.policyRowModel({ grain, policy: pol, ...extra });
const acctNone = m('account', { mode: 'review', source: 'default', declared: null, modes: LARK, inherits: null });
ok(acctNone.value === null && acctNone.choices.map((c) => c.value).join() === 'review,direct,' && /^Not set on this account/.test(acctNone.sourceText) && /The vendor's default \(review\)/.test(acctNone.choices[2].label), 'account, nothing set: review / direct / the vendor\'s default (review), "Not set on this account"', JSON.stringify(acctNone));
const acctDirect = m('account', { mode: 'direct', source: 'account', declared: 'direct', modes: LARK, inherits: { mode: 'review', source: 'default' } });
ok(acctDirect.value === 'direct' && acctDirect.own === 'direct' && /^Set on this account: direct/.test(acctDirect.sourceText) && /^Direct — agents with send authority send without your approval/.test(acctDirect.words), 'account direct: its own value, "Set on this account: direct", the Direct words', JSON.stringify(acctDirect));
const slack = m('account', { mode: 'review', source: 'default', declared: null, modes: SLACK });
ok(!slack.offersDirect && slack.choices.map((c) => c.value).join() === 'review,', 'a review-only vendor (Slack) offers review + the default only — never direct', JSON.stringify(slack.choices));
const convInh = m('conversation', { mode: 'direct', source: 'account', declared: 'direct', modes: LARK, inherits: null });
ok(convInh.value === null && /^Inherits the account: direct — pick one above to change it for this conversation only/.test(convInh.sourceText) && convInh.choices[2].label === "Use the account's (direct)", 'a conversation with no policy: "Inherits the account: direct", the null choice = "Use the account\'s (direct)"', JSON.stringify(convInh));
const convOwn = m('conversation', { mode: 'review', source: 'conversation', declared: 'review', modes: LARK, inherits: { mode: 'direct', source: 'account' } });
ok(convOwn.value === 'review' && /without it, it would read direct/.test(convOwn.sourceText) && convOwn.choices[2].label === "Use the account's (direct)", 'a conversation holding review: its own value, what removing it reads (the account\'s direct)', JSON.stringify(convOwn));
const zhInh = m('conversation', { mode: 'direct', source: 'account', declared: 'direct', modes: LARK }, { t: tOf(ZH), modeText: (x) => (x === 'direct' ? '直接发送' : '审核') });
ok(/^沿用账户：直接发送/.test(zhInh.sourceText) && zhInh.choices[2].label === '沿用账户的设置（直接发送）', 'zh: "沿用账户：直接发送" + "沿用账户的设置（直接发送）"', zhInh.sourceText);
const g0 = m('account', null, { guards: { linksReview: true, attachmentsReview: true, offHoursTz: ' Asia/Tokyo ' } });
const g1 = m('account', null, { guards: { linksReview: false, attachmentsReview: false, offHoursTz: '' } });
ok(/a link · an attachment · off-hours \(Asia\/Tokyo\) always needs your approval/.test(g0.guardsText) && /^No guard is on/.test(g1.guardsText), 'the guards line names exactly the guards that are on (read from the settings handed in)', `${g0.guardsText} || ${g1.guardsText}`);
ok(m('account', null).mode === 'review' && m('account', { mode: 'bogus', source: 'account', declared: 'bogus' }).mode === 'review', 'an unreadable view reads review (fail closed)');
ok(/account's Reach & policy… \(the account's ⋯ menu\)/.test(P.policyWhereText({ grain: 'account' })) && /this conversation's Reach & policy…/.test(P.policyWhereText({ grain: 'conversation', source: 'conversation' })) && /account's Reach/.test(P.policyWhereText({ grain: 'conversation', source: 'account' })), 'a refusal names WHERE the value it names is changed (the account door / the conversation\'s)');

console.log('② ③ ④ a real engine behind the real routes');
const sent = [];
const mod = { kind: 'apd-send', caps: { ...fake.fakePoll.caps, budget: undefined, pace: undefined }, create(record, deps) { const inner = fake.fakePoll.create(record, { ...deps }); return Object.assign(Object.create(inner), { async send(convId, o) { sent.push({ convId, text: o.text }); return { ok: true, vendorMessageId: `v-${sent.length}`, at: Date.now(), sentAs: 'user' }; } }); } };
const registry = CH.createChannelRegistry();
registry.register(mod);
const dataDir = path.join(ROOT, 'eng');
fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'acc', kind: 'apd-send', label: 'Team Lark', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
let clock = Date.parse('2026-10-07T10:00:00Z');
const eng = ENG.create({ dataDir, registry, env: {}, now: () => clock, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => [], log: quiet });
await eng.pass('acc', { force: true });
const convs = Object.keys(eng.store.index.live()).filter((k) => k.startsWith('acc/')).map((k) => k.slice(4));
ok(convs.length >= 2, `the fake account has conversations (${convs.length})`);
const [C1, C2] = convs;
const app = express();
app.use(express.json());
const routes = require(path.join(REPO, 'src/routes/channels.js'));
routes.setup({ getEngine: () => eng });
app.use(routes.router);
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
try {
  const AG = { kind: 'agent', id: 'cid-apd', name: 'Ada' };
  const ctx = { kind: 'agent', id: 'cid-apd', groups: [] };
  // the dialog's caps, derived the way readGrain derives them from the view it re-reads
  const capsOf = (a) => ({ offersSend: (a.sendAs || []).length > 0, sendWhy: null, policyRequiresReview: !(a.policy && a.policy.mode === 'direct') });
  const v0 = (await call('GET', '/api/channels/adapters/acc/view')).j.adapter;
  ok(v0 && v0.policy && v0.policy.source !== 'account' && F.authorityCapCode(capsOf(v0)) && F.authorityCapCode(capsOf(v0)).code === 'policy-review', 'account review (nothing set): the account-grain dialog\'s cap = policy-review (send NOT offered)', JSON.stringify(v0 && v0.policy));
  const own2 = await eng.setPolicy('acc', C2, 'review');
  ok(own2.ok && own2.policy.source === 'conversation', 'a second conversation holds its OWN review before the flip');
  const refused = await call('PUT', '/api/channels/adapters/acc/access', { access: [{ principal: AG, authority: 'send' }] });
  ok(refused.status === 409 && refused.j.code === 'authority-capped', 'account review: the account-grain access refuses `send` (authority-capped)', JSON.stringify(refused));
  const stale = await call('PUT', '/api/channels/adapters/acc', { policy: 'direct', base: 'review' });
  ok(stale.status === 409 && stale.j.code === 'policy-changed' && (await call('GET', '/api/channels/adapters/acc/view')).j.adapter.policy.source !== 'account', 'a `base` that is not the stored value ⇒ 409 policy-changed, NOTHING written', JSON.stringify(stale));
  const put = await call('PUT', '/api/channels/adapters/acc', { policy: 'direct', base: null });
  ok(put.status === 200 && put.j.policy && put.j.policy.mode === 'direct' && put.j.policy.source === 'account', 'PUT {policy:direct, base:null} (what the door read) ⇒ saved, the account reads direct', JSON.stringify(put));
  const v1 = (await call('GET', '/api/channels/adapters/acc/view')).j.adapter;
  ok(F.authorityCapCode(capsOf(v1)) === null && v1.policy.inherits && v1.policy.inherits.source === 'default', 'the view the SAME dialog re-reads lifts the cap ⇒ `send` offered (and says what removing it reads)', JSON.stringify(v1.policy));
  const granted = await call('PUT', '/api/channels/adapters/acc/access', { access: [{ principal: AG, authority: 'send' }], base: F.grainStamp({ access: [], watchers: [] }) });
  ok(granted.status === 200, 'account direct: the account-grain access accepts `send`', JSON.stringify(granted));
  const p1 = eng.conversationView('acc', C1).policy, p2 = eng.conversationView('acc', C2).policy;
  ok(p1.mode === 'direct' && p1.source === 'account' && P.policyRowModel({ grain: 'conversation', policy: p1 }).sourceText.startsWith('Inherits the account: direct'), 'a conversation with no policy reads direct, source account — its door says "Inherits the account: direct"', JSON.stringify(p1));
  ok(p2.mode === 'review' && p2.source === 'conversation' && p2.inherits && p2.inherits.mode === 'direct', 'a conversation holding its own review KEEPS it when the account flips (and knows the account says direct)', JSON.stringify(p2));
  const st1 = eng.statusFor(ctx, `acc/${C1}`), st2 = eng.statusFor(ctx, `acc/${C2}`), stN = eng.statusFor({ kind: 'agent', id: 'cid-nobody', groups: [] }, `acc/${C1}`);
  ok(st1.ok && st1.conversation.policy.mode === 'direct' && st1.conversation.policy.source === 'account' && st2.conversation.policy.source === 'conversation' && !stN.ok && stN.code === 'not-found', 'agent `status <conversation>`: the effective policy + its source; an agent that cannot see it gets the uniform not-found', JSON.stringify([st1, stN]));
  const row = (eng.listFor(ctx).conversations || []).find((c) => c.key === `acc/${C1}`);
  ok(row && row.policy === 'direct' && row.policySource === 'account', 'the agent\'s list row carries the policy AND its source', JSON.stringify(row && { policy: row.policy, policySource: row.policySource }));
  const back = await call('PUT', '/api/channels/adapters/acc', { policy: null, base: 'direct' });
  ok(back.status === 200 && eng.conversationView('acc', C1).policy.mode === 'review' && eng.conversationView('acc', C2).policy.source === 'conversation', '"The vendor\'s default" (PUT null) ⇒ the inheriting conversation reads review again; the one with its own keeps its own');
  // the CLI's words (the same function the CLI prints with)
  const cli = SRC('data/bin/vibespace-channels');
  const pw = cli.match(/const policyWords = (\(p\) => `[^\n]+`;)/);
  const policyWords = pw ? new Function('return ' + pw[1].replace(/;$/, ''))() : null;
  ok(policyWords && policyWords({ mode: 'direct', source: 'account' }) === 'direct (account)' && policyWords({ mode: 'review', source: 'conversation' }) === 'review (this conversation)' && /status <conversation>/.test(cli) && /policy: \$\{policyWords\(c\.policy\)\}/.test(cli) && /chips\.push\(`policy: \$\{policyWords\(\{ mode: c\.policy, source: c\.policySource \}\)\}`\)/.test(cli), 'the CLI: `policy: direct (account)` / `review (this conversation)` on status <conversation> and on every list row');
} finally { server.close(); }

console.log('⑤ the doors (source) + a patched-copy control');
const doorPins = ({ panel, reach, dlg, editor }) => [
  ['the account ⋯ offers Reach & policy… (order 9, before Grant access…)', /order: 9, when: \(c\) => !A\(c\)\.builtin, label: \(\) => t\('Reach & policy…'\), run: \(c\) => showAccountReachDialog\(c\.app, A\(c\)\)/.test(panel)],
  ['the account dialog draws the policy row FIRST, then the Grant access body itself (imported), then the Notify door', /drawPolicy\(\);\n\s*body\.appendChild\(polHost\);[\s\S]*?grantAccessBody\(app, st, sec2, \{ close, target, notify: false/.test(reach) && /showNotifyDialog\(app, target\)/.test(reach) && /import \{ grainState, grantAccessBody, showNotifyDialog \} from '\.\/channel-filter-editor\.js'/.test(reach)],
  ['a pick PUTs {policy, base}, re-reads the view and re-draws section 2 in place (setCaps — no reopen)', /JSON\.stringify\(\{ policy: mode, base: m\.own \}\)[\s\S]*?part\.setCaps\(\{ \.\.\.st\.caps, policyRequiresReview: !\(pol && pol\.mode === 'direct'\) \}\)/.test(reach) && /const setCaps = \(caps\) => \{\s*st\.caps = caps;\s*cap = F\.authorityCapCode\(caps\);/.test(editor)],
  ['the conversation dialog draws the SAME row (its source said)', /policyRowEl\(app, \{ grain: 'conversation', policy: current\.policy/.test(reach)],
  ['the account Edit dialog carries the policy select from the SAME model, saved with its base', /ownerPolicyModel\(app, \{ grain: 'account', policy: a\.policy, tr \}\)/.test(dlg) && /P\.policyRowModel\(\{ grain, policy, guards: policyGuards\(app\)/.test(reach) && /patch\.policy = v\.policy \|\| null; patch\.base = pol\.own;/.test(dlg)],
  ['the Grant access refusal names where to change the policy', /cap\.code === 'policy-review' \? ` — \$\{P\.policyWhereText\(/.test(editor)],
];
const real = { panel: SRC('src/lib/channels-panel.js'), reach: SRC('src/lib/channel-reach-editor.js'), dlg: SRC('src/lib/channel-account-dialogs.js'), editor: SRC('src/lib/channel-filter-editor.js') };
for (const [name, held] of doorPins(real)) ok(held, name);
// CONTROL: the account dialog WITHOUT its policy row (the copy drops the append) and the ⋯ without the door ⇒ red
const mutant = { ...real, reach: real.reach.replace('  drawPolicy();\n  body.appendChild(polHost);\n', '  drawPolicy();\n'), panel: real.panel.replace(/\n\s*registerMenuItem\(\{ menu: M, group: '1_rows', order: 9,[^\n]*\n/, '\n') };
ok(mutant.reach !== real.reach && mutant.panel !== real.panel, 'CONTROL: the patched copy differs from the tree (both mutations applied)');
const red = doorPins(mutant).filter(([, held]) => !held).map(([n]) => n);
ok(red.length === 2, `CONTROL: the dialog without its policy row and the ⋯ without its door are both RED (${red.length} red)`, red.join(' | '));

console.log('⑥ the guards\' door (lane guards-door)');
{
  const DIRECT = { mode: 'direct', source: 'account', declared: 'direct', modes: LARK, inherits: { mode: 'review', source: 'default' } };
  const REVIEW = { mode: 'review', source: 'account', declared: 'review', modes: LARK };
  const ALLOW = { linksReview: false, attachmentsReview: false, offHoursTz: '' };
  const ids = (mm) => mm.guardRows.map((r) => `${r.id}:${r.state}`).join(' ');
  // the table: every guard × state, the owner's view vs an agent's
  const cases = [];
  for (const att of [true, false]) for (const lnk of [true, false]) for (const oh of ['none', 'on', 'off']) for (const owner of [true, false]) {
    const guards = { attachmentsReview: att, linksReview: lnk, offHoursTz: oh === 'none' ? '' : 'Asia/Shanghai', offHoursOn: oh !== 'off', offHoursStart: '08:30', offHoursEnd: '17:00' };
    const mm = m('account', DIRECT, { guards, owner, localTz: 'Asia/Tokyo' });
    const R = Object.fromEntries(mm.guardRows.map((r) => [r.id, r]));
    const want = { attachments: att ? 'ask' : 'allow', links: lnk ? 'ask' : 'allow', offHours: oh === 'on' ? 'ask' : 'allow' };
    const good = mm.guardRows.length === 3
      && R.attachments.key === 'channels.guardAttachmentsReview' && R.links.key === 'channels.guardLinksReview' && R.offHours.key === 'channels.guardOffHours'
      && Object.entries(want).every(([k, v]) => R[k].state === v)
      && R.attachments.toggleTo === (owner ? !att : null) && R.links.toggleTo === (owner ? !lnk : null)
      && R.offHours.toggleTo === (owner && oh !== 'none' ? oh === 'off' : null)
      && (R.offHours.setZone ? owner && oh === 'none' && R.offHours.setZone.key === 'channels.offHoursTz' && R.offHours.setZone.value === 'Asia/Tokyo' : !(owner && oh === 'none'))
      && (oh === 'on' ? /outside 08:30–17:00 Mon–Fri \(Asia\/Shanghai\)/.test(R.offHours.words) : oh === 'off' ? /^off — any hour goes/.test(R.offHours.words) : /no working-hours time zone/.test(R.offHours.words))
      && (mm.fullDelegation === (!att && !lnk && oh !== 'on'))
      && mm.words === `Direct — agents with send authority send without your approval; files: ${att ? 'ask' : 'allow'} · links: ${lnk ? 'ask' : 'allow'} · off-hours: ${oh === 'on' ? 'on' : 'off'}`;
    cases.push(good ? null : `${JSON.stringify(guards)} owner=${owner} ⇒ ${ids(mm)} ${JSON.stringify(mm.guardRows.map((r) => [r.toggleTo, r.setZone]))} ${mm.words}`);
  }
  ok(cases.every((c) => c === null), `guardRows: ${cases.length} cases (attachments × links × off-hours none/on/off × owner/agent) — state, the ONE instance key, toggleTo only for the owner, the zone button only without a zone, the direct words say the current answers`, cases.filter(Boolean).slice(0, 3).join(' || '));
  const full = m('account', DIRECT, { guards: ALLOW, owner: true });
  const oneAsks = m('account', DIRECT, { guards: { ...ALLOW, attachmentsReview: true }, owner: true });
  const review = m('account', REVIEW, { guards: ALLOW, owner: true });
  ok(full.fullDelegation && full.delegationText === 'Full delegation: an agent with send authority sends anything — files, links, at any hour — without asking'
    && !oneAsks.fullDelegation && oneAsks.delegationText === 'Not full delegation — still asks you: A message with files'
    && !review.fullDelegation && /^Not full delegation — the policy is Review/.test(review.delegationText),
  'delegationText: "Full delegation" ONLY when the policy reads direct AND no guard asks; else what still asks (or that Review holds all)', `${full.delegationText} || ${oneAsks.delegationText} || ${review.delegationText}`);
  const zhFull = m('account', DIRECT, { guards: ALLOW, t: tOf(ZH) }), jaFull = m('account', DIRECT, { guards: ALLOW, t: tOf(JA) });
  ok(/^完全放权/.test(zhFull.delegationText) && /^完全な委任/.test(jaFull.delegationText), 'zh / ja: full delegation said in their words', `${zhFull.delegationText} | ${jaFull.delegationText}`);
  ok(/also in Settings → Channels/.test(oneAsks.guardsText) && /an attachment always needs/.test(oneAsks.guardsText) && /^No guard is on \(also in Settings → Channels\)/.test(full.guardsText), 'the summary line reads the SAME rows and names where else it lives', `${oneAsks.guardsText} || ${full.guardsText}`);
  // the keys are the INSTANCE settings — every one a schema row, booleans default true (no default changed)
  const S = (await import(pathToFileURL(path.join(REPO, 'src/lib/settings-schema.js')).href)).SETTINGS_SCHEMA;
  ok(['channels.guardAttachmentsReview', 'channels.guardLinksReview', 'channels.guardOffHours'].every((k) => S[k] && S[k].type === 'boolean' && S[k].default === true) && S['channels.offHoursTz'].default === '' && Object.values(P.GUARD_KEYS).every((k) => S[k]),
    'every guard row key is an instance setting in the schema; the three switches default ON (asks) — no default changed');
  // the card's pointer: a GUARD's reason, never the policy's own
  const dec = (guards, proposal, mode = 'direct') => P.decideOutbound({ channelPolicy: { mode }, guards, proposal: { authority: 'send', ...proposal }, now: Date.UTC(2026, 9, 7, 19), tz: null });
  const withFile = dec({ attachmentsReview: true, offHours: { enabled: false } }, { text: 'hi', attachments: [{ name: 'a.pdf' }] });
  const allowed = dec({ attachmentsReview: false, offHours: { enabled: false } }, { text: 'hi', attachments: [{ name: 'a.pdf' }] });
  const ohOff = dec({ attachmentsReview: true, offHours: { enabled: false, tz: 'Asia/Shanghai' } }, { text: 'hi' });
  const ohOn = dec({ attachmentsReview: true, offHours: { enabled: true, tz: 'Asia/Shanghai' } }, { text: 'hi' });
  ok(withFile.mode === 'review' && withFile.reasons.join() === 'attachments' && withFile.reasons.some((r) => P.GUARD_REASONS.includes(r)) && allowed.mode === 'direct' && ohOn.reasons.join() === 'off-hours' && ohOff.mode === 'direct' && !dec({}, { text: 'x' }, 'review').reasons.some((r) => P.GUARD_REASONS.includes(r)),
    'a file under direct + attachments ask ⇒ review (attachments, a GUARD reason); allow ⇒ direct; off-hours switched off at 03:00 Shanghai ⇒ direct, on ⇒ off-hours; a review policy alone is not a guard', JSON.stringify([withFile, allowed, ohOff, ohOn].map((d) => [d.mode, d.reasons])));
  const outbox = SRC('src/lib/channel-outbox.js'), outbound = SRC('src/server/channels-outbound.js');
  ok(/if \(p\.policy\.mode !== 'direct' && \(p\.policy\.reasons \|\| \[\]\)\.some\(\(r\) => P\.GUARD_REASONS\.includes\(r\)\)\) pol\.textContent \+= ' ' \+ t\('\(a guard — change it in the policy row\)'\);/.test(outbox)
    && /offHours: \{ enabled: read\('channels\.guardOffHours'\) !== false, tz:/.test(outbound),
  'the card\'s "awaiting your approval" line points at the policy row when a guard held it; the server reads the off-hours switch');
  // THE RENDERER: the real guardRowsEl over a fake DOM (its own source, evaluated with fake el/btn/t/P)
  const reachSrc = SRC('src/lib/channel-reach-editor.js');
  const fnSrc = (src) => { const i = src.indexOf('export function guardRowsEl('); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3).replace('export function', 'function'); };
  const mkDom = () => {
    const mk = (tag, cls, text) => { const n = { tag, className: cls || '', textContent: text == null ? '' : String(text), dataset: {}, children: [], parent: null, attrs: {}, checked: false, type: '',
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { c.parent = this; this.children.push(c); return c; },
      replaceWith(x) { const p = this.parent; const i = p.children.indexOf(this); p.children[i] = x; x.parent = p; this.parent = null; },
      get isConnected() { let q = this; while (q.parent) q = q.parent; return q.root === true; } }; return n; };
    const all = (n, f, out = []) => { if (f(n)) out.push(n); for (const c of n.children) all(c, f, out); return out; };
    return { mk, all };
  };
  const runRows = (src, guards, owner) => {
    const D = mkDom(); const writes = []; const subs = {};
    const store = { v: { ...guards }, set(k, v) { writes.push([k, v]); this.v[k] = v; for (const f of subs[k] || []) f(); }, get(k) { return this.v[k]; }, on(k, f) { (subs[k] = subs[k] || new Set()).add(f); }, off(k, f) { if (subs[k]) subs[k].delete(f); } };
    const app = { settings: store, putGrain(x) { writes.push(['grain', x]); } };
    const btn = (label, onClick, cls) => { const b = D.mk('button', 'mounts-btn ' + cls, label); b.onclick = onClick; return b; };
    const guardRowsEl = new Function('el', 'btn', 't', 'P', fnSrc(src) + '\nreturn guardRowsEl;')(D.mk, btn, fill, P);
    const model = () => P.policyRowModel({ grain: 'account', policy: DIRECT, guards: { linksReview: store.v['channels.guardLinksReview'] !== false, attachmentsReview: store.v['channels.guardAttachmentsReview'] !== false, offHoursTz: store.v['channels.offHoursTz'] || '', offHoursOn: store.v['channels.guardOffHours'] !== false }, owner, localTz: 'Asia/Tokyo' });
    const host = D.mk('div'); host.root = true; let paints = 0;
    const paint = () => { paints++; const next = guardRowsEl(app, model(), { repaint: paint }); if (host.children[0]) { if (host.children[0]._guardOff) host.children[0]._guardOff(); host.children[0].replaceWith(next); } else host.appendChild(next); };
    paint();
    return { D, host, writes, store, get paints() { return paints; }, rows: () => D.all(host, (n) => n.className === 'chan-policy-guard'), inputs: () => D.all(host, (n) => n.tag === 'input'), buttons: () => D.all(host, (n) => n.tag === 'button'), text: () => D.all(host, (n) => true).map((n) => n.textContent).join(' | '), subs: () => 0 };
  };
  const r = runRows(reachSrc, {}, true);
  const rows0 = r.rows().map((n) => `${n.dataset.guard}:${n.dataset.state}`).join(' ');
  const sw0 = r.inputs().map((n) => `${n.checked}:${n.attrs.role}`).join(' ');
  const zone = r.buttons().map((b) => b.textContent).join();
  r.inputs()[0].onchange(); await new Promise((res) => setTimeout(res, 0));
  const after = r.rows().map((n) => `${n.dataset.guard}:${n.dataset.state}`).join(' ');
  ok(rows0 === 'attachments:ask links:ask offHours:allow' && sw0 === 'true:switch true:switch' && zone === 'Use my time zone (Asia/Tokyo)'
    && JSON.stringify(r.writes) === '[["channels.guardAttachmentsReview",false]]' && after === 'attachments:allow links:ask offHours:allow' && r.paints === 2,
  'the renderer draws the model\'s rows (2 switches checked = asks, the zone button for off-hours); a click writes ONLY channels.guardAttachmentsReview=false and the store\'s change redraws the row (attachments: allow)', `${rows0} / ${sw0} / ${zone} / ${JSON.stringify(r.writes)} / ${after} / paints ${r.paints}`);
  r.buttons()[0].onclick(); await new Promise((res) => setTimeout(res, 0));
  ok(JSON.stringify(r.writes[1]) === '["channels.offHoursTz","Asia/Tokyo"]' && r.rows()[2].dataset.state === 'ask' && r.inputs().length === 3 && /Not full delegation — still asks you: A message with a link · Outside working hours/.test(r.text()),
    'the zone button sets the working-hours zone; off-hours then asks and gets its switch; the delegation line follows', `${JSON.stringify(r.writes)} ${r.text().slice(0, 300)}`);
  // a remote snapshot moving TWO keys at once ⇒ ONE repaint, and it ends (the store's live listener Set)
  const before = r.paints; r.store.set('channels.guardLinksReview', false); r.store.set('channels.guardOffHours', false); await new Promise((res) => setTimeout(res, 0));
  ok(r.paints === before + 1 && r.rows()[1].dataset.state === 'allow' && r.rows()[2].dataset.state === 'allow' && /^Full delegation/.test(r.text().split(' | ').find((x) => /delegation/.test(x)) || ''),
    `a burst of store changes ⇒ one repaint after the listener loop (${r.paints - before}); links + off-hours allow ⇒ "Full delegation"`);
  const ag = runRows(reachSrc, {}, false);
  ok(ag.rows().length === 3 && ag.inputs().length === 0 && ag.buttons().length === 0, 'an agent\'s view (owner false): the same rows, no switch, no button');
  // CONTROL (a): the toggle writes a per-grain field instead of the instance setting ⇒ RED
  const perGrain = reachSrc.replace('cb.onchange = () => { app.settings.set(r.key, r.toggleTo); };', 'cb.onchange = () => { app.putGrain({ guards: { [r.id]: r.toggleTo } }); };');
  const c1 = runRows(perGrain, {}, true); c1.inputs()[0].onchange(); await new Promise((res) => setTimeout(res, 0));
  const c1red = perGrain !== reachSrc && !(JSON.stringify(c1.writes) === '[["channels.guardAttachmentsReview",false]]' && c1.rows()[0].dataset.state === 'allow');
  ok(c1red, `CONTROL: a switch that writes a per-grain field instead of the instance setting is RED (writes ${JSON.stringify(c1.writes)}, row ${c1.rows()[0].dataset.state})`);
  // CONTROL (b): delegationText said while a guard still asks ⇒ RED
  const polSrc = SRC('src/channel-policy.js');
  const mutSrc = polSrc.replace(': asking.length ? t(\'Not full delegation — still asks you: {list}\', { list: asking.join(\' · \') })', ': false ? null').replace(/require\('\.\/([\w-]+\.js)'\)/g, (x, f) => `require(${JSON.stringify(path.join(REPO, 'src', f))})`);
  const mutFile = path.join(ROOT, 'channel-policy-mutant.js'); fs.writeFileSync(mutFile, mutSrc);
  const PM = require(mutFile);
  const mm = PM.policyRowModel({ grain: 'account', policy: DIRECT, guards: { ...ALLOW, attachmentsReview: true } });
  ok(mutSrc !== polSrc && /^Full delegation/.test(mm.delegationText) && !(mm.delegationText === 'Not full delegation — still asks you: A message with files'), `CONTROL: a model that says full delegation while the attachment guard asks is RED ("${mm.delegationText.slice(0, 40)}…")`);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
