#!/usr/bin/env node
// WHAT A CONVERSATION ASKS OF YOU IS ANSWERABLE IN THAT CONVERSATION (lane chat-needs-you-card, the owner 2026-10-26: «这个界面
// 里是不是应该有个地方能让我看到需要approve？» — a channel watch's approval sat only in the tray). PURE src/foryou-actions.js (THE
// For-you action registry — its own census is scripts/test-foryou-actions-census.mjs) +
// the store's `about` + the wiring, in-process:
//   ① THE CENSUS — every add() site under src/ (the store's two-argument add(sessionKey, {origin…})) belongs to a producer
//     row here (its origin, whether it files under a conversation's key, a group key + `about`, or a group key only, and
//     the action types it files); every action type a producer spells is a row of the PURE BY_TYPE table and every row is
//     spelled by a producer; RED COPIES: a producer row dropped, a type dropped, a dead row — each named
//   ② EVERY ORIGIN A ROW WITH A FIXTURE ITEM through needsOf: agents (an ask, an ask with options, a browser grant),
//     channels (a watch request `wr-…` and an access request, both filed under 'channels' + `about`), machines (ask me each
//     time), vault (a run, a grant, a key, a secret to paste), apps (an install proposal), browser (a takeover), the pool (a
//     cross-provider ask); the ones the chat already answers are NOT cards (S1's helper ask, the permission card's main ask,
//     the proposal / API / wall cards, a job's form), nor a notice, a cleared item or another conversation's;
//     RED: the base's match (sessionKey only) — the owner's watch request is no card
//   ③ PLACEMENT — named by the result (the item's id, its request id), the producer's CLI call before it, the record at the
//     filing, the end; a resolved record outside what is loaded is not drawn; RED: no `named` rung
//   ④ THE CHIP's words + ⑤ the quiet record's verb + ⑥ the agent's ONE line (the hub's words, every CLI prints it)
//   ⑦ THE STORE's `about` (normalized, kept on a re-file, re-keyed, garbage refused) + the channels filings stamp it
//   ⑧ THE WIRING — the chat draws THE row through the panel (no second implementation, no route of its own), the swap
//     carries the cards, a run never folds a card that waits, the chip never folds on a phone; acceptance round 2: the chip
//     counts the cards the pass DREW (one source), one card that throws never stalls it, ONE open card (the accordion), the
//     chip a ≥ 24 px chip (44 on touch) — test-chat-needs-card-chrome ⑥–⑧ measures all three in Chrome
//   ⑨ THE SURFACES REGISTRY (the owner's registry law, 2026-10-26) — every function that picks a conversation's items by its
//     key is a SURFACES row saying whether it reads `about`; the deferred ones are rows (the title-bar badge, the mini inbox,
//     the session row's marker); RED: a surface dropped, a deferred one claimed as done, a deferred one that starts reading it
// Run: node scripts/test-conversation-needs.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CN = require(path.join(ROOT, 'src/foryou-actions.js'));
const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── ① THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① THE CENSUS — every producer a row (its origin, where it files, its action types); every type a BY_TYPE row');
// scope: 'conversation' = files under the conversation's own key · 'about' = a group key + `about` naming the conversation ·
// 'group' = a group key only (no conversation — no chat draws it) · 'mixed' = some sites of each
const PRODUCERS = {
  'src/server/spend-guard.js': { origin: 'spend', scope: 'group', types: [] },
  'src/server/login-expiry-watch.js': { origin: 'login', scope: 'group', types: [] },
  'src/server/device-upgrade-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/device-alerts.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/hub-act-ask.js': { origin: 'machines', scope: 'group', types: ['hub-act-ask'], why: 'the asker is named only in the act\'s `by` — OPEN: no `about` yet' },
  'src/server/automation-engine.js': { origin: 'vault', scope: 'conversation', types: ['automation-ask'] },
  'src/server/vault-run-door.js': { origin: 'vault', scope: 'mixed', types: ['vault-run-ask', 'vault-grant-ask', 'vault-store-refused', 'vault-grant-stale', 'vault-policy-approved'] },
  'src/server/vault-hooks.js': { origin: 'vault', scope: 'group', types: ['vault-unlock', 'vault-use-failed', 'vault-rotate'] },
  'src/server/dial-health-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/usage-pool-engine.js': { origin: 'pool', scope: 'mixed', types: ['reset-credit', 'pool-cross-provider'] },
  'src/server/jobs-wiring.js': { origin: 'jobs', scope: 'conversation', types: [], why: 'a job\'s ask is answered in its own form (jobId) — no card' },
  'src/server/channels-engine.js': { origin: 'channels', scope: 'group', types: ['channel-reauth'] },
  'src/server/channels-access.js': { origin: 'channels', scope: 'about', types: ['open-channel', 'channel-watch-request'] },
  'src/server/channels-outbound.js': { origin: 'channels', scope: 'group', types: ['open-channel'], why: 'a reply / reaction / recall proposal is its own card in the chat (channel-touch-view chatProposalCards)' },
  'src/server/channel-api-cards.js': { origin: 'channels', scope: 'group', types: ['channel-api-proposal'] },
  'src/server/browser-handback.js': { origin: 'browser', scope: 'conversation', types: ['browser-takeover'] },
  'src/server/browser-builds-keeper.js': { origin: 'browser', scope: 'group', types: [] },
  'src/server/browser-disk-run.js': { origin: 'browser', scope: 'group', types: [] },
  'src/server/browser-keeper.js': { origin: 'browser', scope: 'group', types: ['browser-floor-check', 'browser-restart'] },
  'src/server/mounts-plugins-wiring.js': { origin: 'browser', scope: 'mixed', types: ['browser-proposal', 'browser-surface'], why: 'int360 seam: the browser\'s forYou adapters — browser-dialogs\' kernel prompt (browser-surface) and passkey lines are filed through them' },
  'src/server/browser-logins.js': { origin: 'browser', scope: 'group', types: ['save-login'], why: 'int360 seam (lane browser-login, after this census\'s base): the save-login card + its notices, under the browser\'s group key' },
  'src/server/browser-propose.js': { origin: 'browser', scope: 'conversation', types: ['browser-proposal'] },
  'src/agent-routes/status.js': { origin: 'agent', scope: 'conversation', types: ['browser-grant'] },
  'src/server/helper-asks.js': { origin: 'agent', scope: 'conversation', types: ['helper-ask'] },
  'src/server/main-asks.js': { origin: 'agent', scope: 'conversation', types: ['main-ask'] },
  'src/server/unexpected-exit.js': { origin: 'agent', scope: 'conversation', types: [] },
  'src/exit-proxy.js': { origin: 'machines', scope: 'conversation', types: ['exit-run-ask'] },
  'src/server/memory-pressure-watch.js': { origin: 'server', scope: 'group', types: [] },
  'src/plugins/frp.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/decision-engine.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/engine-distribution.js': { origin: 'plugin', scope: 'group', types: [], why: 'int360 seam (lane engine-distribution, after this census\'s base): a kernel / cluster plugin that could not be put in place' },
  'src/server/voice-teach-engine.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/csp-reports.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/tls.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/desktop-app-keeper.js': { origin: 'server', scope: 'group', types: ['desktop-app-notify'] },
  'src/server/mount-health-watch.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/hooks-late.js': { origin: 'agent', scope: 'group', types: [] },
  'src/server/apps-engine.js': { origin: 'apps', scope: 'mixed', types: ['app-install'] },
  'src/server/oat-identity.js': { origin: 'login', scope: 'group', types: [] },
  'src/server/vault-paste-door.js': { origin: 'vault', scope: 'conversation', types: ['secret-request'] },
  'src/server/feedback-forward.js': { origin: 'server', scope: 'group', types: [] },
};
// the add() site scanner (test-user-todos-layout ⑪'s shape: every two-argument `.add(` / `?.add(` on any receiver, its
// top-level text — a nested `origin:` never counts; a DOM classList.add and a comment line are not sites)
const skipTpl = (src, i) => { i++; while (i < src.length) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === '`') return i + 1; if (c === '$' && src[i + 1] === '{') { i += 2; let d = 1; while (i < src.length && d > 0) { const q = src[i]; if (q === "'" || q === '"') { let j = i + 1; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } i = j + 1; continue; } if (q === '`') { i = skipTpl(src, i); continue; } if (q === '{') d++; else if (q === '}') d--; i++; } continue; } i++; } return i; };
const topLevelOf = (src, open) => { let i = open, depth = 0, out = ''; while (i < src.length) { const c = src[i]; if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; } if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; } if (c === "'" || c === '"') { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } if (depth <= 2) out += src.slice(i, j + 1); i = j + 1; continue; } if (c === '`') { i = skipTpl(src, i); if (depth <= 2) out += '``'; continue; } if ('([{'.includes(c)) { depth++; if (depth <= 2) out += c; i++; continue; } if (')]}'.includes(c)) { if (depth <= 2) out += c; depth--; i++; if (depth === 0) return out; continue; } if (depth <= 2) out += c; i++; } return out; };
const argCountOf = (top) => { let depth = 0, n = 0, any = false; const body = top.slice(1, -1); for (let i = 0; i < body.length; i++) { const c = body[i]; if (c === "'" || c === '"') { let j = i + 1; while (j < body.length && body[j] !== c) { if (body[j] === '\\') j++; j++; } i = j; any = true; continue; } if ('([{'.includes(c)) { depth++; any = true; continue; } if (')]}'.includes(c)) { depth--; continue; } if (depth === 0 && c === ',') n++; else if (!/\s/.test(c)) any = true; } return any ? n + 1 : 0; };
const files = {};
const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } };
walk('src');
files['server.js'] = read('server.js');
const sitesOf = (fl) => {
  const out = [];
  for (const [rel, src] of Object.entries(fl)) {
    for (const mm of src.matchAll(/(\??\.)add\(/g)) {
      const open = mm.index + mm[0].length - 1;
      const lineStart = src.lastIndexOf('\n', mm.index) + 1;
      if (/^\s*(\/\/|\/?\*)/.test(src.slice(lineStart, mm.index))) continue;
      if (/\bclassList\s*$/.test(src.slice(Math.max(0, mm.index - 40), mm.index))) continue;
      const top = topLevelOf(src, open);
      if (argCountOf(top) < 2) continue;
      const om = /(?:^|[{,\s])origin:\s*'([^']*)'/.exec(top);
      if (!om) continue; // a two-argument add with no origin is not the store's (test-user-todos-layout ⑪ fails it by name)
      out.push({ rel, line: src.slice(0, mm.index).split('\n').length, origin: om[1], about: /(?:^|[{,\s])about:/.test(top) });
    }
  }
  return out;
};
const SITES = sitesOf(files);
/** the action types producers SPELL: an `action: { type: '…' }` literal anywhere in the hub's src/ (never src/lib/ — the
 *  client's own objects) + the store's identity table; NOT_INBOX = the hub's files whose `action` is no For-you item's */
const NOT_INBOX = { 'src/search-card.js': 'a search result card\'s own action (the chat\'s search cards — never filed in For you)' };
const typesSpelled = (fl) => {
  const s = new Set();
  for (const [rel, src] of Object.entries(fl)) {
    if (rel.startsWith('src/lib/') || rel in NOT_INBOX) continue;
    for (const m of src.matchAll(/action:\s*\{\s*type:\s*(?:'([a-z][a-z0-9-]*)'|([A-Z][A-Z0-9_]*)\b)/g)) { const c = m[2] ? new RegExp(`const ${m[2]}\\s*=\\s*'([a-z][a-z0-9-]*)'`).exec(src) : null; s.add(m[1] || (c && c[1]) || m[2]); }   // a constant spelled in its own file (src/main-ask.js, src/browser-takeover-request.js)
  }
  return s;
};
const census = (rows, byType, fl = files, sites = SITES) => {
  const problems = [];
  for (const x of sites) {
    const row = rows[x.rel];
    if (!row) { problems.push(`${x.rel}:${x.line} files a For-you item — a producer missing from the census (add its row: origin, scope, types)`); continue; }
    if (row.origin !== x.origin) problems.push(`${x.rel}:${x.line} declares '${x.origin}', its census row says '${row.origin}'`);
    if (x.about && row.scope !== 'about' && row.scope !== 'mixed') problems.push(`${x.rel}:${x.line} stamps \`about\` — its row must say scope 'about'`);
  }
  for (const [rel, row] of Object.entries(rows)) {
    if (!sites.some((x) => x.rel === rel)) problems.push(`${rel} is a census row that files nothing — a dead row`);
    if (row.scope === 'about' && !sites.some((x) => x.rel === rel && x.about)) problems.push(`${rel} says scope 'about' but no add() of it stamps \`about\``);
    for (const ty of row.types) if (!(ty in byType)) problems.push(`${rel} files action type '${ty}' — no row in src/foryou-actions.js`);
  }
  const declared = new Set(Object.values(rows).flatMap((r) => r.types));
  for (const ty of typesSpelled(fl)) if (!(ty in byType)) problems.push(`action type '${ty}' is spelled by a producer — no row in src/foryou-actions.js`);
  for (const ty of Object.keys(byType)) {
    if (!declared.has(ty)) problems.push(`BY_TYPE row '${ty}' is no producer row's type — a dead row`);
    if (!Object.entries(fl).some(([rel, src]) => rel !== 'src/foryou-actions.js' && src.includes(`'${ty}'`))) problems.push(`BY_TYPE row '${ty}' is spelled nowhere in src/ — a dead row`);
  }
  return problems;
};
const P0 = census(PRODUCERS, CN.BY_TYPE);
ok(P0.length === 0, `every add() site (${SITES.length} in ${new Set(SITES.map((x) => x.rel)).size} files) is a producer row, every type a BY_TYPE row (${Object.keys(CN.BY_TYPE).length}), no dead row`, P0);
ok(SITES.length >= 60 && Object.keys(PRODUCERS).length >= 39, `the census scope is non-vacuous (${SITES.length} sites, ${Object.keys(PRODUCERS).length} producers)`);
ok(SITES.filter((x) => x.about).map((x) => x.rel).join(',') === 'src/server/channels-access.js,src/server/channels-access.js', 'the two channels filings (an access request, a watch request) stamp `about` — the asking conversation', SITES.filter((x) => x.about));
eq(Object.keys(CN.BY_ORIGIN).sort(), require(path.join(ROOT, 'src/inbox-origin.js')).INBOX_ORIGINS.slice().sort(), 'BY_ORIGIN has a row for every origin of the closed set (src/inbox-origin.js)');
console.log('   RED COPIES (the census must be able to go red)');
{ const r = { ...PRODUCERS }; delete r['src/server/channels-access.js']; ok(census(r, CN.BY_TYPE).some((p) => /channels-access\.js:\d+ files a For-you item — a producer missing from the census/.test(p)), 'RED: the channels access producer dropped from the census is named'); }
{ const b = { ...CN.BY_TYPE }; delete b['channel-watch-request']; const p = census(PRODUCERS, b); ok(p.some((x) => /channels-access\.js files action type 'channel-watch-request' — no row in src\/foryou-actions\.js/.test(x)) && p.some((x) => /action type 'channel-watch-request' is spelled by a producer — no row/.test(x)), 'RED: the watch request\'s type dropped from the registry is named (twice — the producer row and the spelling)'); }
{ ok(census(PRODUCERS, { ...CN.BY_TYPE, 'ghost-ask': { kind: 'approval', card: true } }).some((p) => /BY_TYPE row 'ghost-ask' is no producer row's type/.test(p)), 'RED: a BY_TYPE row no producer files is a dead row'); }
{ const fl = { ...files, 'src/server/new-producer.js': "x.add(key, { origin: 'agent', text: 'hi' });\n" }; ok(census(PRODUCERS, CN.BY_TYPE, fl, sitesOf(fl)).some((p) => /new-producer\.js:1 files a For-you item — a producer missing/.test(p)), 'RED: a NEW producer file is named until its row is written'); }
{ const fl = { ...files, 'src/server/new-producer.js': "x.add('channels', { origin: 'channels', text: 'hi', action: { type: 'chan-new-ask', id } });\n" }; const p = census({ ...PRODUCERS, 'src/server/new-producer.js': { origin: 'channels', scope: 'group', types: [] } }, CN.BY_TYPE, fl, sitesOf(fl)); ok(p.some((x) => /'chan-new-ask' is spelled by a producer/.test(x)), 'RED: a NEW action type a producer spells is named until BY_TYPE has its row'); }

// ── ② EVERY ORIGIN A ROW WITH A FIXTURE ITEM ──────────────────────────────────────────────────────────────────────────
console.log('② every origin a fixture item through needsOf — the cards of the conversation, and what is not a card');
const ME = 'claude:5f1c0a';
const KEYS = [ME, 'webui:w-77'];
let n0 = 0;
const it = (o) => ({ id: 'ut-' + (++n0).toString(16).padStart(10, '0'), status: 'open', kind: 'action', urgency: 'normal', createdAt: 1000 + n0, text: 'x', detail: null, ...o });
const FIX = {
  'agents: an ask': it({ sessionKey: ME, origin: 'agent', by: 'agent', text: 'Which meeting?' }),
  'agents: an ask with options': it({ sessionKey: ME, origin: 'agent', by: 'agent', text: 'Ship it?', options: ['yes', 'no'] }),
  'agents: a browser grant': it({ sessionKey: ME, origin: 'agent', by: 'agent', action: { type: 'browser-grant', profileId: 'p1', label: 'Work' } }),
  'agents (webui twin key)': it({ sessionKey: 'webui:w-77', origin: 'agent', by: 'agent', text: 'filed before the id existed' }),
  'channels: a watch request (the owner\'s)': it({ sessionKey: 'channels', about: ME, origin: 'channels', action: { type: 'channel-watch-request', id: 'wr-mvx1-a1b2c3' } }),
  'channels: an access request': it({ sessionKey: 'channels', about: ME, origin: 'channels', action: { type: 'open-channel', adapterId: 'slack', convId: 'C1', key: 'slack:C1' } }),
  'machines: ask me each time': it({ sessionKey: ME, origin: 'machines', urgency: 'high', action: { type: 'exit-run-ask', askId: 'a'.repeat(32), hostId: 'h', machine: 'mac', cmd: 'ls' } }),
  'vault: a run with a stored secret': it({ sessionKey: ME, origin: 'vault', action: { type: 'vault-run-ask', askId: 'b'.repeat(32), always: false, tool: 'curl' } }),
  'vault: a grant': it({ sessionKey: ME, origin: 'vault', action: { type: 'vault-grant-ask', askId: 'c'.repeat(32) } }),
  'vault: an automation key': it({ sessionKey: ME, origin: 'vault', action: { type: 'automation-ask', askId: 'd'.repeat(32) } }),
  'vault: a secret to paste': it({ sessionKey: ME, origin: 'vault', action: { type: 'secret-request', requestId: 'sr-0000aa', into: null, kind: 'api-key' } }),
  'apps: an install proposal': it({ sessionKey: ME, origin: 'apps', action: { type: 'app-install', id: 'ap-00aa11', host: '', kind: 'install' } }),
  'browser: a takeover': it({ sessionKey: ME, origin: 'browser', action: { type: 'browser-takeover', requestId: 'tk-1', profileId: 'p1' } }),
  'browser: a plain ask': it({ sessionKey: ME, origin: 'browser', text: 'A --confirm-actions prompt waits' }),
  'pool: a cross-provider ask': it({ sessionKey: ME, origin: 'pool', action: { type: 'pool-cross-provider', askId: 'e'.repeat(32), poolId: 'p', memberId: 'm' } }),
  'agents: an unexpected exit (the hub\'s words)': it({ sessionKey: ME, origin: 'agent', by: 'agent', i18n: { text: { key: '{name} stopped' } } }),
};
const NOT = {
  'S1: a helper\'s ask (its card on the Agent card)': it({ sessionKey: ME, origin: 'agent', action: { type: 'helper-ask', requestId: 'r1' } }),
  'the conversation\'s own permission ask': it({ sessionKey: ME, origin: 'agent', action: { type: 'main-ask', requestId: 'r2' } }),
  'a browser proposal (its chat card)': it({ sessionKey: ME, origin: 'browser', action: { type: 'browser-proposal', id: 'bl-1' } }),
  'a raw-API proposal (its chat card)': it({ sessionKey: 'channels', about: ME, origin: 'channels', action: { type: 'channel-api-proposal', id: 'cp-1' } }),
  'a reset credit (the wall card)': it({ sessionKey: ME, origin: 'pool', action: { type: 'reset-credit', accountKey: 'a' } }),
  'a job\'s ask (its own form)': it({ sessionKey: ME, origin: 'jobs', jobId: 'j-1' }),
  'a notice': it({ sessionKey: ME, origin: 'pool', kind: 'notice' }),
  'a cleared item': it({ sessionKey: ME, origin: 'agent', clearedAt: 5 }),
  'another conversation\'s ask': it({ sessionKey: 'claude:other', origin: 'agent', by: 'agent' }),
  'a channels pointer with no `about` (the outbox\'s)': it({ sessionKey: 'channels', origin: 'channels', action: { type: 'open-channel', adapterId: 'slack', convId: 'C2', key: 'slack:C2' } }),
  'an item another conversation\'s request addresses': it({ sessionKey: 'channels', about: 'claude:other', origin: 'channels', action: { type: 'channel-watch-request', id: 'wr-zz' } }),
};
const ALL = [...Object.values(FIX), ...Object.values(NOT)];
const needs = CN.needsOf(ALL, KEYS);
const got = new Set(needs.map((e) => e.item.id));
for (const [name, item] of Object.entries(FIX)) ok(got.has(item.id), `a card: ${name} (${(needs.find((e) => e.item.id === item.id) || {}).kind})`);
for (const [name, item] of Object.entries(NOT)) ok(!got.has(item.id), `not a card: ${name}${CN.needOf(item) && CN.needOf(item).owner ? ' — ' + CN.needOf(item).owner : ''}`);
eq(needs.map((e) => e.item.createdAt), needs.map((e) => e.item.createdAt).slice().sort((a, b) => a - b), 'oldest first');
const kinds = Object.fromEntries(Object.entries(FIX).map(([k, i]) => [k, (needs.find((e) => e.item.id === i.id) || {}).kind]));
eq([kinds['agents: an ask'], kinds['channels: a watch request (the owner\'s)'], kinds['vault: a secret to paste'], kinds['browser: a takeover'], kinds['agents: an unexpected exit (the hub\'s words)'], kinds['machines: ask me each time']], ['question', 'approval', 'secret', 'browser', 'check', 'approval'], 'each card names its kind: an agent\'s ask a question, a watch request an approval, a paste a secret, a takeover a browser step, the hub\'s own words something to check');
ok(CN.recordsOf([{ ...FIX['agents: an ask'], status: 'done' }, { ...NOT['a notice'], status: 'done' }], KEYS).length === 1, 'recordsOf: a resolved card is a quiet record; a resolved notice is not');
ok(CN.needsOf(ALL, []).length === 0 && CN.needsOf(null, KEYS).length === 0, 'no keys / no items ⇒ no cards');
{ // RED: the base's match — sessionKey only (the store had no `about`): the owner's watch request is no card in its chat
  const base = ALL.filter((i) => i.status === 'open' && KEYS.includes(i.sessionKey));
  ok(!base.some((i) => i.id === FIX['channels: a watch request (the owner\'s)'].id), 'RED: the base\'s rule (the conversation\'s own key only) misses the owner\'s watch request — filed under \'channels\'');
}

// ── ③ PLACEMENT ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ placementOf — the record that filed it, else the record at the filing, else the end');
const B = 1792990000000; // ms, as the records carry them
const T = [
  { id: 'u1', role: 'user', ts: B },
  { id: 'a1', role: 'assistant', ts: B + 10e3 },
  { id: 't1', role: 'tool', ts: B + 20e3, tool: 'Bash', cmd: 'vibespace-channels watch slack:C1 --mode wake', out: 'requested — …\nFiled for you: an approval — answer it on the card in this conversation or in the For-you tray (wr-mvx1-a1b2c3)' },
  { id: 't2', role: 'tool', ts: B + 30e3, tool: 'Bash', cmd: 'vibespace-ask "Which meeting?"', out: '' },
  { id: 'a2', role: 'assistant', ts: B + 40e3 },
  { id: 't3', role: 'tool', ts: B + 30 * 60e3, tool: 'Bash', cmd: 'ls', out: '' },
];
const watch = { ...FIX['channels: a watch request (the owner\'s)'], createdAt: B + 21e3 };
eq(CN.placementOf(watch, T), { at: 't1', how: 'named' }, 'named: the tool card whose result names its request id (wr-…) — even a later record exists');
eq(CN.placementOf({ ...FIX['agents: an ask'], id: 'ut-00000000aa', createdAt: B + 31e3 }, [...T.slice(0, 5), { id: 't9', role: 'tool', ts: B + 35e3, cmd: 'echo', out: 'added to … (ut-00000000aa)' }]), { at: 't9', how: 'named' }, 'named: the result naming the item\'s own id (vibespace-ask prints it)');
eq(CN.placementOf({ ...FIX['agents: an ask'], createdAt: B + 31e3 }, T), { at: 't2', how: 'tool' }, 'tool: the producer\'s CLI call just before the filing (its result does not name it yet — still running)');
eq(CN.placementOf({ ...FIX['agents: an ask'], createdAt: B + 31e3 + CN.FILED_WINDOW_MS }, T.slice(0, 5)), { at: 'a2', how: 'turn' }, 'turn: a call further back than the window did not file it — the record at the filing');
eq(CN.placementOf({ ...FIX['pool: a cross-provider ask'], createdAt: B + 41e3 }, T), { at: 'a2', how: 'turn' }, 'turn: a producer with no CLI (the pool) — the record at the filing, never a later one');
eq(CN.placementOf({ ...FIX['agents: an ask'], createdAt: B - 60e3 }, T), { at: 't3', how: 'end' }, 'end: filed before what is loaded — an OPEN card stands at the end (never hidden in history not loaded)');
eq(CN.placementOf({ ...FIX['agents: an ask'], createdAt: B - 60e3 }, T, { resolved: true }), { at: null, how: 'none' }, 'none: a RESOLVED record outside what is loaded is not drawn');
eq(CN.placementOf({ ...FIX['agents: an ask'], createdAt: B - 60e3 }, []), { at: null, how: 'end' }, 'an empty transcript: the end (nothing to anchor)');
{ // RED: without the `named` rung a later CLI call of the same producer steals the card
  const T2 = [...T.slice(0, 3), { id: 't4', role: 'tool', ts: B + 20.5e3, cmd: 'vibespace-channels search foo', out: '' }];
  const noNamed = (item, tr) => { const r = CN.placementOf(item, tr.map((x) => ({ ...x, out: '' }))); return r; };
  ok(CN.placementOf(watch, T2).at === 't1' && noNamed(watch, T2).at === 't4', 'RED: without the result rung the card lands on a later `vibespace-channels search` — the named rung keeps it on the watch call');
}

// ── ④ THE CHIP ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ chipWords — «waiting for you · N» with the kind named');
eq(CN.chipWords([]), null, 'nothing open ⇒ no chip');
eq(CN.chipWords([{ kind: 'approval' }]).text, 'waiting for you · an approval', 'one approval');
eq(CN.chipWords([{ kind: 'approval' }, { kind: 'approval' }, { kind: 'approval' }]).text, 'waiting for you · 3 approvals', 'three approvals');
const mixed = CN.chipWords([{ kind: 'approval' }, { kind: 'question' }, { kind: 'secret' }]);
ok(mixed.text === 'waiting for you · 3' && /an approval, a question, a secret/.test(mixed.title) && mixed.n === 3, 'mixed: the count, every kind in the title', mixed);
{ const zh = { 'waiting for you · {what}': '等你操作 · {what}', 'an approval': '一项批准' }; const tz = (k, p) => (zh[k] || k).replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')); eq(CN.chipWords([{ kind: 'approval' }], tz).text, '等你操作 · 一项批准', 'the client\'s t() words it (zh)'); }
{ const z = (l) => fs.readFileSync(path.join(ROOT, l), 'utf8'); const keys = ['waiting for you · {what}', 'Waiting for you — {what}', 'also in For you', ...Object.values(CN.KIND_WORDS), '{n} approvals', '{n} questions', 'approved', 'withdrawn by the agent', 'you replied']; for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) { const s = z(f); const miss = keys.filter((k) => !s.includes(JSON.stringify(k) + ':')); ok(!miss.length, `${f}: every word of the card and the chip is translated`, miss); } }

// ── ⑤ THE QUIET RECORD ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ settledWords — how a resolved card reads in its one line');
const W = (o) => CN.settledWords({ status: 'done', ...o });
eq([W({ resolvedBy: 'allowed', action: { type: 'channel-watch-request' } }), W({ resolvedBy: 'denied' }), W({ resolvedBy: 'stored' }), W({ resolvedBy: 'ask-expired' }), W({ resolvedBy: 'agent' }), W({ reply: { text: 'B' } }), W({ status: 'dismissed' }), W({})],
  ['approved', 'denied', 'saved to the vault', 'expired', 'withdrawn by the agent', 'you replied', 'dismissed', 'done'], 'approved / denied / saved to the vault / expired / withdrawn / you replied / dismissed / done');

// ── ⑥ THE AGENT'S LINE ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ filedLine — ONE line the agent can quote, the hub\'s words, printed by every CLI — worded from the REGISTRY ROW (where it IS shown)');
const TRAY = { name: 'the “For you” tray' };
eq(CN.filedLine('channel-watch-request', 'wr-1', TRAY), 'Filed for you: an approval — answer it on the card in this conversation or in the “For you” tray (wr-1)', 'a card row: the kind, the card in this conversation, the tray by its name, the id');
eq(CN.filedLine('nonsense', null), 'Filed for you: something to check — answer it on the card in this conversation or in the For-you tray', 'an unknown type / no tray / no id: still one honest line (an unknown type is drawn as a card — needOf\'s default)');
// acceptance round 3 (#5): a `--notice` was told «answer it on the card in this conversation» — no card is drawn for a notice
eq(CN.filedLine({ kind: 'notice', origin: 'agent', sessionKey: 'claude:a1', text: 'FYI' }, 'ut-n1', TRAY), 'Filed as a notice — it shows in the “For you” tray\'s Notices, no answer needed (ut-n1)', 'RED (round 3, #5): a NOTICE says where it IS shown — the tray\'s Notices, no answer — never «the card in this conversation»');
eq(CN.filedLine({ origin: 'agent', sessionKey: 'claude:a1', text: 'Which bucket?' }, 'ut-q1', TRAY), 'Filed for you: a question — answer it on the card in this conversation or in the “For you” tray (ut-q1)', 'an agent\'s ask (no action): its card in this conversation');
eq(CN.filedLine({ origin: 'spend', sessionKey: 'spend', text: 'Budget' }, 'ut-s1', TRAY), 'Filed for you: something to check — answer it in the “For you” tray (ut-s1)', 'a global producer\'s item: no conversation draws it — the tray only');
eq(CN.filedLine({ origin: 'jobs', jobId: 'j-1', sessionKey: 'jobs', text: 'Approve the run' }, 'ut-j1', TRAY), 'Filed for you — answer it on the job\'s own form in Background Work or in the “For you” tray (ut-j1)', 'a job\'s item: its own form, by name');
{
  // EVERY registry row's line names its real surface: a chat row = the card here (a group row with no `about`: the tray only), a
  // card: 'inbox-window' row = the For-you window, a chat: false row = the card that answers it (its `on`, required) — and
  // only a row the chat card draws may say «on the card in this conversation»
  const want = (r) => (!r.chat ? 'owner' : r.card === 'inbox-window' ? 'window' : r.scope === 'group' ? 'tray' : 'card');
  const bad = [];
  const surfaceOf = typeof CN.surfaceOf === 'function' ? CN.surfaceOf : () => ({ at: '(no surfaceOf — the line is not read off the row)' });
  for (const r of CN.ROWS) {
    const s = surfaceOf(r.type), line = CN.filedLine(r.type, 'x-1', TRAY);
    if (s.at !== want(r)) bad.push(`${r.type}: surface ${s.at}, its row says ${want(r)}`);
    if (/on the card in this conversation/.test(line) !== (s.at === 'card')) bad.push(`${r.type}: «${line}»`);
    if (s.at === 'owner' && !(typeof r.on === 'string' && / in this conversation$/.test(r.on))) bad.push(`${r.type}: a chat: false row names no \`on\` (where it is answered)`);
    if (s.at === 'window' && !/the For-you window/.test(line)) bad.push(`${r.type}: «${line}»`);
  }
  ok(!bad.length, `every registry row (${CN.ROWS.length}) is worded from its row — ${['card', 'tray', 'window', 'owner'].map((k) => `${CN.ROWS.filter((r) => want(r) === k).length} ${k}`).join(', ')}; only a row the chat card draws says «on the card in this conversation»`, bad);
  // with an `about` (a group-key item addressing this conversation) a group row IS drawn here
  eq(surfaceOf({ action: { type: 'hub-act-ask', askId: 'a-1' }, about: 'claude:a1', origin: 'machines' }).at, 'card', 'a group row filed with `about`: its card in the conversation it addresses');
  ok(Object.keys(CN.FILED || {}).sort().join() === 'card,notice,owner,tray,window', 'ONE words table, one line per surface (FILED)');
}
const SRC = { status: read('src/agent-routes/status.js'), access: read('src/server/channels-access.js'), vault: read('src/routes/vault.js'), ask: read('data/bin/vibespace-ask'), chan: read('data/bin/vibespace-channels'), vv: read('data/bin/vibespace-vault'), exit: read('data/bin/vibespace-exit') };
ok(/filed: CN\.filedLine\(item, item\.id, OF\.tray\(\)\)/.test(SRC.status) && /if \(answer\.filed && !item\.existing\) console\.log\(answer\.filed\);/.test(SRC.ask), 'vibespace-ask: the route answers `filed` worded from the ITEM it filed (a notice, a grant, an ask) and the CLI prints it');
ok(/filed: CN\.filedLine\('open-channel', req\.id, OF\.tray\(\)\)/.test(SRC.access) && /filed: CN\.filedLine\('channel-watch-request', req\.id, OF\.tray\(\)\)/.test(SRC.access) && (SRC.chan.match(/console\.log\(r\.filed\);/g) || []).length === 2, 'vibespace-channels watch --mode wake + request: the engine answers `filed` from ITS row (channel-watch-request / open-channel), the CLI prints it');
ok(/filed: CN\.filedLine\('vault-grant-ask', r\.todoId, OF\.tray\(\)\)/.test(SRC.vault) && /filed: CN\.filedLine\('secret-request', r\.requestId, OF\.tray\(\)\)/.test(SRC.vault) && (SRC.vv.match(/console\.log\(d\.filed\);/g) || []).length === 2, 'vibespace-vault request (a grant) + a paste request: the route answers `filed` from ITS row, the CLI prints it');
{
  // every call names a REGISTRY ROW (or passes the item) — never a kind, never a type without a row
  const calls = [...Object.values(SRC).join('\n').matchAll(/CN\.filedLine\(('([^']*)'|[A-Za-z_.]+)/g)].map((m) => m[2] != null ? m[2] : `<${m[1]}>`);
  const off = calls.filter((c) => !c.startsWith('<') && !CN.ROW_OF[c]);
  ok(calls.length === 5 && !off.length, `the ${calls.length} filedLine calls each name a registry row or pass the item (${calls.join(', ')})`, off);
}
ok((SRC.exit.match(/an approval card in this conversation and in the For-you tray|Filed for you: an approval — answer it on the card in this conversation or in the For-you tray/g) || []).length === 2, 'vibespace-exit (ask me each time): the 60 s wait line names the card in this conversation');

// ── ⑦ THE STORE's `about` ────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ the store keeps `about` — the conversation an item filed under a group key addresses');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cneeds-'));
  const ut = new UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
  try {
    const a = ut.add('channels', { origin: 'channels', text: 'Agent asks to be woken by #ops', about: ME, action: { type: 'channel-watch-request', id: 'wr-a' } });
    ok(a.about === ME && ut.snapshot().open[0].about === ME, 'a filing with `about` keeps it (the snapshot every client gets carries it)');
    const b = ut.add('channels', { origin: 'channels', text: 'garbage about', about: 'not a key' });
    const c = ut.add('channels', { origin: 'channels', text: 'object about', about: { k: 1 } });
    ok(!('about' in b) && !('about' in c), 'a garbage `about` (no backend:id shape, not a string) is dropped, never stored');
    const d = ut.add('channels', { origin: 'channels', text: 'Agent asks to be woken by #ops', action: { type: 'channel-watch-request', id: 'wr-a' } });
    ok(d.existing && d.about === ME, 'a re-file without `about` keeps it');
    const e = ut.add('channels', { origin: 'channels', text: 'about via webui', about: 'webui:w-9' });
    ut.rekey('webui:w-9', 'claude:abc');
    ok(ut.get(e.id).about === 'claude:abc', 'rekey(webui:<id> → backend:id) moves `about` with the sessionKey');
  } finally { try { ut.stop(); } catch { } fs.rmSync(dir, { recursive: true, force: true }); }
  const AR = read('src/agent-routes.js');
  ok(/sessionKey: \(\(\) => \{ try \{ return sessionStatusKey\(s, id\); \} catch \{ return `webui:\$\{id\}`; \} \}\)\(\),/.test(AR), 'the channels principal carries the conversation\'s own key (sessionStatusKey) — the engine stamps `about` from it');
  ok((SRC.access.match(/about: ctx\.sessionKey \|\| null,/g) || []).length === 2, 'channels-access stamps `about: ctx.sessionKey` on the access request AND the watch request');
  ok((SRC.access.match(/userTodos\.setStatus\(req0?\.todoId, 'done', approve \? 'allowed' : 'denied'\)/g) || []).length === 2, 'a decided watch / access request resolves `allowed` / `denied` (the card\'s record says which — it read «automatically»)');
}

// ── ⑧ THE WIRING ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑧ the wiring — THE row, THE verbs, the swap, the fold, the chip');
const CARD = read('src/lib/chat-needs-card.js'), CV = read('src/lib/chat-view.js'), PANEL = read('src/lib/user-todos-panel.js'), BAR = read('src/lib/chat-status-bar.js'), TC = read('src/lib/title-chips.js');
ok(/this\.app\.foryouRows\?\.wire\(card, \{ close: \(\) => \{\} \}\);/.test(CARD) && /this\.app\.foryouRows\?\.reconcile\(rows, \[\{ item: e\.item \}\]\);/.test(CARD), 'the card draws THE row (the panel\'s reconcile = renderRow / patchRow) and wires THE verbs (the panel\'s rowClick)');
ok(!/fetchJson|\/api\/|runAction|postReply|setStatus\(/.test(CARD), 'NO second implementation: the card module names no route, no answer verb of its own');
ok(/function wireMiniRows\(root, \{ close = \(\) => \{\} \} = \{\}\) \{[\s\S]{0,400}rowClick\(e, item, \{ mini: true \}\)/.test(PANEL) && /wireMiniRows\(pop, \{ close: \(\) => pop\.remove\(\) \}\);/.test(PANEL) && /app\.foryouRows = \{\s*wire: wireMiniRows,/.test(PANEL), 'the panel: ONE row wiring for the mini inbox and the chat card (rowClick({mini: true}) — the tray\'s routes)');
ok(/import \{ NeedsCards \} from '\.\/chat-needs-card\.js';/.test(CV) && /this\._needsCards = new NeedsCards\(this\);\n\s+this\._needsCards\.start\(winInfo\?\._listenerCtl\?\.signal\);/.test(CV) && /this\._needsCards\?\.stop\(\)/.test(CV), 'the chat view starts the cards for its window and stops them with the view');
ok(/const needs = oldEl\.querySelector\?\.\(':scope > \.cn-cards'\);[\s\S]{0,200}if \(needs\) newEl\.append\(needs\);/.test(CV), 'a swap (a tool result landing) carries the SAME card nodes into the new record element');
ok(/if \(hasPendingHelperAsk\(m\)\) return null;\n(?:[^\n]*\n){2}\s+if \(el\.querySelector\(':scope > \.cn-cards > :is\(\.cn-card\.cn-open, \.cn-card\.cn-kept\)'\)\) return null;/.test(CV) && /card\.classList\.add\('cn-kept'\);/.test(CARD), 'a run never folds a record holding a card that waits — nor one whose answered card keeps a box in use (S1\'s rule beside it)');
ok(/onJumpToNeed: \(\) => \{ this\._needsCards\?\.jumpToNewest\(\); \}/.test(CV) && /chip\('foryou', `chat-status-foryou/.test(BAR) && /\.chat-status-foryou\.chat-status-clickable'\)\) \{ e\.stopPropagation\(\); this\._onJumpToNeed\?\.\(\)/.test(BAR), 'the chip: drawn from setNeeds, its click lands the newest card');
// acceptance round 2 (P3): ONE SOURCE — the chip's words are the open cards this pass drew, never the store's list beside them
ok(/view\._statusBar\?\.setNeeds\?\.\(chipWords\(shown, t\)\);/.test(CARD) && !/chipWords\(open/.test(CARD) && /placed\.add\(e\.item\.id\);\n\s+if \(!e\.resolved\) shown\.push\(e\);/.test(CARD), 'ONE SOURCE: the chip counts the open cards this pass DREW (a filing ⇒ N+1 both, an answer ⇒ N both — never the list beside them)');
ok(/try \{ if \(!card\) card = this\._create\(e\); else this\._patch\(card, e\); \} catch \(err\) \{ console\.warn\('\[chat-needs\] a card failed to draw:'[^}]*continue; \}/.test(CARD), 'ONE card that throws is said and skipped — the pass still reaches the chip');
// acceptance round 2 (P2): THE ACCORDION — one open slot (the person's pick while it waits, else the newest; a filing takes it back)
ok(/const fresh = open\.filter\(\(e\) => !this\._seen\.has\(e\.item\.id\)\);\n\s+if \(fresh\.length\) this\._slot = newestOf\(fresh\)\.item\.id;\n\s+this\._seen = new Set\(open\.map\(\(e\) => e\.item\.id\)\);\n\s+const openSlot = this\._slot;/.test(CARD) && /fold: x\.item\.id !== openSlot/.test(CARD) && /card\.classList\.toggle\('cn-fold', fold\);/.test(CARD) && /row\.classList\.toggle\('ut-open', !fold\);/.test(CARD) && /const fold = !!e\.fold && !boxInUse\(card\.querySelector\('\.ut-reply'\)\);/.test(CARD) && /card\.addEventListener\('click', \(ev\) => \{\n\s+if \(unfold\(ev\) \|\| card\._openedAt == null/.test(CARD), 'THE ACCORDION: ONE open card (the slot: a FILING\'s newest id, a tap, the chip), the rest folded rows whose whole row opens them; a reply box in use is never folded');
// acceptance round 3 — the accordion's slot law, the tap's hold on a pinned view, the box kept across a resolve, the pass a frame
ok(!/this\._pick|this\._newest/.test(CARD) && /this\._seen\.clear\(\); \/\/ nothing waits/.test(CARD) && /if \(el\.classList\.contains\('cn-fold'\)\) \{ this\._slot = el\.dataset\.item; this\.render\(\{ hold: true \}\); \}/.test(CARD), '#3 the slot moves on a FILING, a tap or the chip — never on a resolution (no «newest changed ⇒ the pick goes» left)');
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  jumpToNewest()'));
  ok(/view\._noteUserNav\?\.\('needsOpen'\);\n\s+this\._slot = id;\n\s+this\.render\(\{ hold: true \}\);/.test(oc) && /if \(view\._pinned && placed && !hold\) view\._scrollToBottom\?\.\(\);/.test(CARD) && !/_fsbEpoch|_fsbActive/.test(CARD), '#2 an open in place goes through the VIEW\'s door (_noteUserNav cancels its bottom-follow chain) before the pass, and that pass starts none — no private copy of the epoch'); }
{ const res = CARD.slice(CARD.indexOf('    if (e.resolved) {'), CARD.indexOf('    let head = card.querySelector'));
  ok(/if \(rows && boxInUse\(rows\.querySelector\('\.ut-reply'\)\)\) \{/.test(res) && /this\.app\.foryouRows\?\.reconcile\(rows, \[\{ item: e\.item, resolved: true \}\]\);/.test(res) && res.indexOf('this.app.foryouRows?.stash?.(card);') > 0 && res.indexOf('this.app.foryouRows?.stash?.(card);') < res.indexOf('card.innerHTML ='), '#4 THE row\'s keep rule: a resolved card keeps a box in use (the row resolved AROUND it), and the typed text is a draft BEFORE any innerHTML write');
  ok(/stash: stashDrafts,/.test(PANEL) && /fold: \(box\) => foldBox\(box\),/.test(PANEL) && /this\.app\.foryouRows\?\.fold\?\.\(box\);/.test(CARD), '#4 …the drafts are the panel\'s (stashDrafts / foldBox through app.foryouRows) — a box kept on an answered card folds, its text a draft, when the person leaves it'); }
ok(/signal\.addEventListener\('abort', \(\) => this\.stop\(\), \{ once: true, signal: own \}\);/.test(CARD), 'm1 the window\'s abort listener goes with the VIEW\'s controller (a replaced view is not held until the window closes)');
ok(/if \(!document\.hidden\) raf = requestAnimationFrame\(run\);\n\s+const tm = setTimeout\(run, document\.hidden \? 0 : 100\);/.test(CARD) && !/queueMicrotask/.test(CARD) && !/_shape/.test(CARD), '#1 ONE pass a frame (a burst of broadcasts is one pass, never one inside each socket message) — round 4 (#3) measures «unchanged» by the pass\'s own writes, below');
{ const arm = PANEL.slice(PANEL.indexOf('  const stampArm'), PANEL.indexOf('  const patchDot ='));
  ok((PANEL.match(/document\.addEventListener\('scroll'/g) || []).length === 1 && /if \(want\) document\.addEventListener\('scroll', onArmScroll, \{ capture: true, passive: true \}\);\n\s+else document\.removeEventListener\('scroll', onArmScroll, \{ capture: true \}\);/.test(arm) && /for \(const b of armed\) \{ if \(b\.isConnected\) stampArm\(b, now\); else armed\.delete\(b\); \}/.test(arm) && !/onArmScroll = \(\) => \{[^}]*querySelectorAll/.test(arm), 'm4 the scroll re-stamp listens only while a stamped button is on the page, and re-stamps THAT set — never a document query on every scroll'); }
{ const CC = read('public/chat.css'); const cn = CC.split('\n').filter((l) => /\.cn-(card|line|cards|head|rows|fold)/.test(l));
  ok(cn.length > 10 && !cn.some((l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(l)), `m2 the cards' rules (${cn.length} lines) use theme vars only — no literal colour, no fallback`, cn.filter((l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(l)));
  ok(/\.chat-view \.chat-status-bar \.chat-status-foryou\.chat-status-clickable \{ min-height: 44px; min-width: 44px; margin-top: -8px; border: solid transparent; border-width: 8px 0 0;/.test(CC) && /\.chat-view \.chat-status-bar:has\(\.chat-status-foryou\) \{ overflow-x: clip; overflow-y: visible; \}/.test(CC), 'm3 on touch the chip\'s 44 px box takes the 36 px of the bar\'s chips (the bar never grows when a filing lands) and its hit area reaches past the bar (it clips sideways only)'); }
// acceptance round 4 — the open at the bottom edge, ONE exit from a box, a pass that changed nothing reads no layout, a kept card in the pass
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  jumpToNewest()'));
  ok(/\nconst lineOf = \(c\) => \(c && c\.querySelector\(':scope > \.cn-rows > \.ut-item \.ut-text'\)\) \|\| c;/.test(CARD) && /const was = at\(\), before = lineOf\(was\)\?\.getBoundingClientRect\(\)\.top, row = was\?\.getBoundingClientRect\(\);/.test(oc) && /const lr = list\.getBoundingClientRect\(\), line = lineOf\(el\);\n\s+const shift = before == null \? 0 : line\.getBoundingClientRect\(\)\.top - before;/.test(oc) && !/const before = at\(\)\?\.getBoundingClientRect/.test(oc), 'R4 #1(a) the hold anchors the row\'s TEXT LINE (its question\'s first line) — never the card\'s box, which the head and the padding grow inside');
  ok(/\} else \{\n\s+const verbs = \[\.\.\.el\.querySelectorAll\(':scope > \.cn-rows :is\(button, textarea\)'\)\][^\n]*\n\s+const low = [^\n]*\n\s+const lineTop = [^\n]*\n\s+if \(low > lr\.bottom\) reveal = Math\.min\(Math\.ceil\(low - lr\.bottom\), /.test(oc) && /el\._openedAt = performance\.now\(\);/.test(oc) && /if \(pressVerdict\(\{ since: card\._openedAt, now: performance\.now\(\) \}\)\.ok\) \{ card\._openedAt = null; return; \}\n\s+ev\.stopPropagation\(\); ev\.preventDefault\(\);/.test(CARD) && /import \{ pressVerdict \} from '\.\/press-arm\.js';/.test(CARD), 'R4 #1(b) a pointer open whose lowest verb lies below the list brings it inside by the MINIMUM scroll — and what that moved under the pointer answers nothing for ARM_MS (the press arm\'s verdict, on every verb of the card)');
  ok(/const room = Math\.min\(list\.scrollHeight, end\) - list\.clientHeight - list\.scrollTop;\n\s+if \(move > room \+ 1\) this\._lend\(list, Math\.ceil\(move - room\), el\);\n\s+if \(Math\.abs\(move\) > 1\) list\.scrollTop \+= move;/.test(oc) && !/_giveBack\(\); placed/.test(CARD) && /if \(view\._pinned && !\(view\._atLiveTail \? view\._atLiveTail\(list\.scrollTop, list\.scrollHeight, list\.clientHeight\)/.test(oc), 'R4 #1(a) at the END of the transcript the hold borrows the room it lacks below the last record — given back once a scroll leaves all of it out of sight (its going moves nothing); the pin follows the landing (the chat\'s PINNED ⇔ AT THE LIVE TAIL)'); }
{ const fb = PANEL.slice(PANEL.indexOf('  const foldBox = (box'), PANEL.indexOf('  const sendReply = async'));
  ok(/row\?\.dispatchEvent\(new CustomEvent\('ut-box-left', \{ bubbles: true \}\)\);/.test(fb) && /if \(row && ta && ta\.value && !sent\) drafts\.set/.test(fb) && /if \(box\) foldBox\(box, \{ sent: true \}\);/.test(PANEL) && (PANEL.match(/\bbox\.remove\(\)/g) || []).length === 1 && fb.includes('box.remove()'), 'R4 #2 ONE exit from a reply box — Esc, the fold verb, a blur, a sent reply all go through foldBox (the draft, the box gone, `ut-box-left`); no other road removes a box');
  ok(/this\.view\._messageList\.addEventListener\('ut-box-left', go, \{ signal: own \}\);/.test(CARD) && !/this\.app\.foryouRows\?\.fold\?\.\(box\);\n\s+this\.schedule\(\);/.test(CARD), 'R4 #2 …and the card hears that exit (its next pass ends the kept state) — its blur road no longer schedules a pass of its own'); }
{ const rn = CARD.slice(CARD.indexOf('  render({ hold'), CARD.indexOf('  _lend(list'));
  ok(/probe\.observe\(view\._messageList, \{ subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true \}\);/.test(rn) && /if \(!wroteAny\(recs\)\) return;\n\s+this\._roomCheck\(\);[^\n]*\n(?:\s*\/\/[^\n]*\n)?\s+this\.app\.foryouRows\?\.arm\?\.\(view\._messageList\);/.test(rn) && /for \(const \[el, m\] of was\) for \(const \[a, v\] of m\) if \(el\.getAttribute\(a\) !== v\) return true;/.test(CARD), 'R4 #3 a pass that changed no card (its own DOM writes recorded — none) reads NO layout: no stamp, no follow; a pass that changed one stamps THIS list\'s armed buttons');
  ok(/reconcile: \(container, entries\) => reconcileRows\(container, entries, null, miniCtx, \{ arm: false \}\),/.test(PANEL) && /if \(arm\) armExitButtons\(\);/.test(PANEL) && /const armExitButtons = \(root = document\) => \{\n\s+const now = performance\.now\(\);\n\s+for \(const b of root\.querySelectorAll\(/.test(PANEL) && /arm: \(root\) => armExitButtons\(root\),/.test(PANEL), 'R4 #3 …the card\'s reconcile stamps nothing (every card\'s patch re-stamped every Allow of the PAGE, a rect per hit); the tray\'s own passes keep their stamp'); }
{ const ps = CARD.slice(CARD.indexOf('  _pass() {'), CARD.indexOf('    const transcript = '));
  ok(/if \(listed\.has\(c\.dataset\.item\) \|\| !c\._item \|\| !boxInUse\(c\.querySelector\('\.ut-reply'\)\)\) continue;\n\s+done\.push\(\{ item: todos\.resolved\.find\(\(i\) => i\.id === c\.dataset\.item\) \|\| todos\.open\.find\(\(i\) => i\.id === c\.dataset\.item\) \|\| c\._item,/.test(ps) && ps.indexOf('done.push({ item: todos.resolved.find') < ps.indexOf('if (!open.length && !done.length)') && /card\._item = e\.item;/.test(CARD), 'R4 #4 a card whose box is in use stays IN the pass — drawn from the snapshot\'s copy (a clear rewrites it there), else from its own last one once the resolved tail dropped it — so it is patched, never frozen'); }
// acceptance round 5 — the refusal keyed on the MEASURED landing, the reveal capped, the borrowed room's ONE road back, the kb lines
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  jumpToNewest()'));
  const w = oc.indexOf('if (Math.abs(move) > 1) list.scrollTop += move;'), l = oc.indexOf('const landed = line.getBoundingClientRect().top;');
  ok(w > 0 && l > w && /if \(keys \|\| before == null \|\| Math\.abs\(landed - before\) > 1 \|\| under\) el\._openedAt = performance\.now\(\);/.test(oc) && !/Math\.abs\(reveal\) > 1 \|\| keys\) el\._openedAt/.test(oc), 'R5 #1 the moved-verb refusal is keyed on the MEASURED landing — the line read again AFTER the scroll write, against where the pointer pressed (never the planned reveal: a hold the list could not honour moved the chips under the pointer unstamped)');
  ok(/const under = row && \[\.\.\.el\.querySelectorAll\('button'\)\]\.some\(\(b\) => \{ const r = b\.getBoundingClientRect\(\); return r\.width && r\.bottom > row\.top && r\.top < row\.bottom && r\.right > row\.left && r\.left < row\.right; \}\);/.test(oc), 'R5 #1 …and what now stands inside the folded row that was pressed counts too (at a desk Mark done / Dismiss share the question\'s line: the line held, and they came under the row\'s right end)');
  ok(/const end = tail \? tail\.getBoundingClientRect\(\)\.bottom - lr\.top - list\.clientTop \+ list\.scrollTop \+ pad : list\.scrollHeight;/.test(oc) && /const tail = list\.lastElementChild, pad = parseFloat\(getComputedStyle\(list\)\.paddingBottom\) \|\| 0;/.test(oc), 'R5 #1 how far the list can still scroll is measured to its CONTENT\'s end (a list its content does not fill has a scrollHeight of its own height: the room borrowed there fell short and the line dropped by the head)');
  ok(/if \(low > lr\.bottom\) reveal = Math\.min\(Math\.ceil\(low - lr\.bottom\), Math\.max\(0, Math\.floor\(lineTop - lr\.top\)\)\);/.test(oc) && /const lineTop = line\.getBoundingClientRect\(\)\.top - shift;/.test(oc) && /if \(bottom > lr\.bottom\) reveal = Math\.min\(bottom - lr\.bottom, Math\.max\(0, top - lr\.top\)\);/.test(oc), 'R5 #2 the pointer reveal is capped as the keyboard\'s — never past the held line\'s own top (a card taller than the list shows its question first; the person scrolls to its verbs)'); }
{ const lend = CARD.slice(CARD.indexOf('  _lend(list, px, card)'), CARD.indexOf('  /** The pass\'s DOM work'));
  const gb = lend.slice(lend.indexOf('  _giveBack(px = Infinity)'));
  ok((CARD.match(/removeProperty\('padding-bottom'\)/g) || []).length === 1 && gb.includes("list.style.removeProperty('padding-bottom');") && (CARD.match(/style\.paddingBottom = /g) || []).length === 2 && (CARD.match(/this\._lent = /g) || []).length === 3 && /this\._lent = Math\.max\(0, this\._lent - px\);/.test(gb), 'R5 #3 ONE road back: `_giveBack(px = all)` is the only writer that returns the room (its padding, its count, its listeners)');
  ok(/list\.addEventListener\('scroll', this\._onLentScroll = \(\) => this\._roomCheck\(\), \{ passive: true, signal: this\._ctl\?\.signal \}\);/.test(lend) && /new ResizeObserver\(\(\) => this\._roomCheck\(\)\)\)\.observe\(list, \{ box: 'border-box' \}\);/.test(lend) && /this\._roomRO\?\.observe\(card\);/.test(lend) && /if \(tail\) this\._roomRO\?\.observe\(tail\);/.test(lend) && /this\._mo = new MutationObserver\(\(\) => \{ if \(this\._lent\) this\._watchTail\(\); go\(\); \}\);/.test(CARD), 'R5 #3 …taken by every road: a scroll of the list, a resize of the list (its border box), of the card that borrowed, of the last record (re-targeted on every childList change: a record landing, the stream)');
  ok(/if \(this\.view\._disposed \|\| !card \|\| !card\.isConnected \|\| !card\.classList\.contains\('cn-open'\) \|\| card\.classList\.contains\('cn-fold'\)\) \{ this\._giveBack\(\); return; \}/.test(lend) && /const give = Math\.floor\(Math\.max\(fill - this\._lentFill, below(?: - grew)?\)\);/.test(lend) && /stop\(\) \{\n\s+try \{ this\._giveBack\(\); \} catch \{ \}/.test(CARD), 'R5 #3 …the card folded, resolved or gone ⇒ all of it; else what lies below the bottom edge and what the content grew below the held line (neither moves anything on screen); the view disposed ⇒ all of it'); }
{ const KFS = read('docs/kb-file-structure.md'), KDL = read('docs/kb-design-lessons.md');
  const bullet = (KFS.split('\n').find((x) => x.startsWith('- **user-todos-panel.js** — `wireMiniRows(root, {close})`')) || '');
  ok(/`reconcile\(container, entries\)` = `reconcileRows\(…, miniCtx, \{ arm: false \}\)`/.test(bullet) && /`armExitButtons\(root = document\)`/.test(bullet) && /`fold\(box\)` = `foldBox\(box, \{ sent = false \}\)`/.test(bullet) && /`ut-box-left` dispatched \(bubbling\) from its row/.test(bullet) && /`arm\(root\)` = `armExitButtons\(root\)`/.test(bullet), 'R5 #4 kb-file-structure\'s user-todos-panel.js line states the round-4 contract (reconcile {arm:false}, arm(root), armExitButtons(root = document), foldBox {sent} + ut-box-left from the row)');
  const s23 = KDL.slice(KDL.indexOf('### 23. Answerable where it appears'), KDL.indexOf('### 2026-06-09 Full-Project Code Review'));
  ok(!/until the view follows the tail again/.test(s23) && /gives it back on every road that ends the need, through one function/.test(s23) && /what moved under the pointer is MEASURED, never planned/.test(s23), 'R5 #4 kb-design-lessons §23 says the give-back rule the code has (never «until the view follows the tail again») and the measured refusal'); }
// acceptance round 6 — the room is lent for what lies BELOW the card: the card's OWN size neither returns it nor needs it
{ const lend = CARD.slice(CARD.indexOf('  _lend(list, px, card)'), CARD.indexOf('  /** The pass\'s DOM work'));
  const geom = lend.slice(lend.indexOf('  _roomGeom() {'), lend.indexOf('  _roomCheck() {'));
  ok(/const list = this\.view\._messageList, box = this\._lentBy\.getBoundingClientRect\(\);\n\s+const end = box\.bottom - list\.getBoundingClientRect\(\)\.top \+ list\.scrollTop;\n\s+return \{ fill: list\.scrollHeight - this\._lent - end, below: list\.scrollHeight - list\.scrollTop - list\.clientHeight, h: box\.height \};/.test(geom) && !/lineOf\(/.test(geom), 'R6 #1 what the content grew is measured below the CARD that borrowed (its bottom), never below its held line — the card\'s own box is not what the room was lent for');
  ok(/const grew = Math\.max\(0, h - this\._lentH\);\n\s+const give = Math\.floor\(Math\.max\(fill - this\._lentFill, below - grew\)\);\n\s+this\._lentFill = fill; this\._lentH = Math\.min\(this\._lentH, h\);/.test(lend) && /const g = this\._roomGeom\(\);\n\s+this\._lentFill = g\.fill; this\._lentH = g\.h;/.test(lend) && /this\._lentFill = 0; this\._lentH = 0;/.test(lend), 'R6 #1 …and what the card\'s OWN growth put below the bottom edge stays lent (the shrink back needs it again): the card\'s height when the room was lent (`_lentH`), a shrink below it its new size, reset with the room');
  const KFS = read('docs/kb-file-structure.md'), KDL = read('docs/kb-design-lessons.md');
  const ess = KFS.split('\n').find((x) => x.startsWith('- **src/lib/chat-needs-card.js** — ')) || '';
  const s23 = KDL.slice(KDL.indexOf('### 23. Answerable where it appears'), KDL.indexOf('### 2026-06-09 Full-Project Code Review'));
  ok(/what the content grew below the CARD \(`_roomGeom` measures from the card's bottom/.test(ess) && /THE CARD'S OWN SIZE \(round 6\)/.test(ess) && /the content grows below the card that borrowed it/.test(s23) && /the card's own size is not its business/.test(s23) && !/the content grows below the held line/.test(s23), 'R6 #1 the kb says the rule the code has (kb-file-structure\'s chat-needs-card.js essay, kb-design-lessons §23): the room is lent for what lies below the card'); }
{ const CHAT_CSS = read('public/chat.css');
  ok(/\.chat-status-bar \.chat-status-foryou\.chat-status-clickable \{ display: inline-flex;[^}]*min-height: 24px; min-width: 24px;/.test(CHAT_CSS) && /@media \(hover: none\) and \(pointer: coarse\) \{\n\s+\.chat-view \.chat-status-bar \.chat-status-foryou\.chat-status-clickable \{ min-height: 44px; min-width: 44px;/.test(CHAT_CSS) && /\.cn-line \{[^}]*min-height: 24px;/.test(CHAT_CSS) && /\.cn-card\.cn-fold \.ut-item:not\(\.ut-open\) \{[^}]*min-height: 24px;/.test(CHAT_CSS), 'the targets: the chip a ≥ 24 × 24 chip (44 on touch), a quiet record and a folded row ≥ 24 px (the .358 mouse-target law)'); }
ok(/PHONE_BAR_NEVER_FOLD = Object\.freeze\(\[[^\]]*'foryou'/.test(TC) && /REGULAR_BAR_KEEP = new Set\(\[[^\]]*'foryou'/.test(BAR), 'the chip never folds behind ⋯ on a phone, nor behind ﹀ on the regular class');
const CSS = read('public/style.css');
const touch = CSS.slice(CSS.indexOf('/* ── lane foryou-honest: THE TOUCH SCALE'), CSS.indexOf('/* ── end of the touch scale (lane foryou-honest) ── */'));
ok(/\.ut-mini-popover \*, \.cn-card \*/.test(touch) && /\.cn-card :is\(button, \[role="button"\], summary, textarea/.test(touch) && (touch.match(/\.ut-mini-popover, \.cn-card, #phone-home/g) || []).length >= 15, 'the touch scale: the card takes the mini inbox\'s floors and row rules (16 px words, 44 px targets, the detail fold as a row)');

// ── ⑨ THE SURFACES REGISTRY ──────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ every surface that shows a conversation its own items is a SURFACES row; a deferred one is a row, never prose');
{
  /** fn name → its body text (from `function <fn>(` / `const <fn> = (` to the next top-level function) */
  // a TOP-LEVEL function's text: its header to the first `}` in column 0 (a class method is never one — the store's forSession is the agent route's, no surface)
  const bodyOf = (src, fn) => { const m = new RegExp(`(?:^|\\n)(?:export )?function ${fn}\\(`).exec(src); if (!m) return null; const rest = src.slice(m.index); const end = rest.indexOf('\n}'); return end < 0 ? rest : rest.slice(0, end + 2); };
  const isTheirsDef = (src) => { const i = src.indexOf('const isTheirs'); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
  const surfaceCensus = (rows, fl = files) => {
    const problems = [];
    for (const [k, r] of Object.entries(rows)) {
      const body = fl[r.file] != null ? bodyOf(fl[r.file], r.fn) : null;
      if (!body) { problems.push(`SURFACES.${k}: ${r.fn} is not in ${r.file} — a dead row`); continue; }
      const readsAbout = /\babout\b/.test(body) || (/\bisTheirs\(/.test(body) && /\.about\b/.test(isTheirsDef(fl[r.file])));
      if (r.about === true && !readsAbout) problems.push(`SURFACES.${k}: ${r.fn} claims \`about\` but never reads it`);
      if (r.about === 'deferred' && readsAbout) problems.push(`SURFACES.${k}: ${r.fn} reads \`about\` now — its row must say true`);
    }
    // every function under src/ that picks items by a conversation's key set is a row
    for (const [rel, src] of Object.entries(fl)) {
      for (const m of src.matchAll(/(?:^|\n)(?:export )?function ([A-Za-z_$]+)\(/g)) {
        const body = bodyOf(src, m[1]);
        if (body && /\b\w+\.has\(i\.sessionKey\)/.test(body) && !Object.values(rows).some((r) => r.file === rel && r.fn === m[1])) problems.push(`${rel} ${m[1]}() picks a conversation's items by sessionKey — a surface missing from SURFACES (say whether it reads \`about\`)`);
      }
    }
    return problems;
  };
  const S0 = surfaceCensus(CN.SURFACES);
  ok(S0.length === 0, `every surface is a row and says the truth about \`about\` (${Object.keys(CN.SURFACES).length} rows: ${Object.entries(CN.SURFACES).map(([k, r]) => k + (r.about === true ? '' : ' (deferred)')).join(', ')})`, S0);
  ok(Object.values(CN.SURFACES).filter((r) => r.about === 'deferred').length === 3, 'the deferred surfaces are named — the title-bar badge, the mini inbox, the session row\'s marker count the conversation\'s own key only (a watch request counts on the chip, not on the badge)');
  { const r = { ...CN.SURFACES }; delete r['mini-inbox']; ok(surfaceCensus(r).some((p) => /miniInboxEntries\(\) picks a conversation's items by sessionKey — a surface missing/.test(p)), 'RED: a surface dropped from the registry is named'); }
  { const r = { ...CN.SURFACES, 'title-badge': { ...CN.SURFACES['title-badge'], about: true } }; ok(surfaceCensus(r).some((p) => /SURFACES\.title-badge: inboxBadgeFor claims `about` but never reads it/.test(p)), 'RED: a deferred surface claimed as done is named'); }
  { const fl = { ...files, 'src/lib/user-todos-layout.js': files['src/lib/user-todos-layout.js'].replace('export function sessionMark(open, keys) {', 'export function sessionMark(open, keys) { if (keys && keys.about) return null;') }; ok(surfaceCensus(CN.SURFACES, fl).some((p) => /SURFACES\.session-marker: sessionMark reads `about` now — its row must say true/.test(p)), 'RED: a deferred surface that starts reading `about` is named until its row says so'); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
