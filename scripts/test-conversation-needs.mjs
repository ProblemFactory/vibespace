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
  'src/migration-runner.js': { origin: 'server', scope: 'group', types: [], why: 'int365 seam F (.365): a boot migration that failed files ONE notice per migration id in the hub\'s «Migrations» group (lane job-secrets-retire r3/r4 sayFailed) — it only informs (the retry is automatic at the next start), no action type' },
  'src/server/migrations.js': { origin: 'vault', scope: 'group', types: [], why: 'int365 seam F (.365): the retired job-secrets store\'s ONE notice in the Vault group (lane job-secrets-retire r2) — its words name a MANUAL owner step (put each secret into the vault, delete the file; with two files, move one out and restart), but it files no action type and draws no button' },
  'src/server/device-upgrade-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/device-alerts.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/hub-act-ask.js': { origin: 'machines', scope: 'group', types: ['hub-act-ask', 'hub-act-standing'], why: 'the asker is named only in the act\'s `by` — OPEN: no `about` yet; lane ledger-dedup-law F3: + a background subject\'s ONE standing notice (no conversation asks it)' },
  'src/server/automation-engine.js': { origin: 'vault', scope: 'conversation', types: ['automation-ask'] },
  'src/server/vault-run-door.js': { origin: 'vault', scope: 'mixed', types: ['vault-run-ask', 'vault-grant-ask', 'vault-store-refused', 'vault-grant-stale', 'vault-policy-approved'] },
  'src/server/vault-hooks.js': { origin: 'vault', scope: 'group', types: ['vault-unlock', 'vault-use-failed', 'vault-rotate'] },
  'src/server/dial-health-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/usage-pool-engine.js': { origin: 'pool', scope: 'mixed', types: ['reset-credit', 'pool-cross-provider'] },
  'src/server/jobs-wiring.js': { origin: 'jobs', scope: 'conversation', types: [], why: 'a job\'s ask is answered in its own form (jobId) — no card' },
  'src/server/channels-engine.js': { origin: 'channels', scope: 'group', types: ['channel-reauth'] },
  'src/server/channels-access.js': { origin: 'channels', scope: 'about', types: ['open-channel', 'channel-watch-request', 'channel-held-digest'] },   // r6: a held digest's decision (no `about` — the owner's tray)
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
  'src/server/ledger-shape-notice.js': { origin: 'server', scope: 'group', types: [], why: 'lane ledger-dedup-law F4: the growth alarm\'s notices (one per machine × file, the hold folder, a hold\'s file) under the `usage-ledger` key — no action' },
  'src/plugins/frp.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/decision-engine.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/engine-distribution.js': { origin: 'plugin', scope: 'group', types: [], why: 'int360 seam (lane engine-distribution, after this census\'s base): a kernel / cluster plugin that could not be put in place' },
  'src/server/voice-teach-engine.js': { origin: 'plugin', scope: 'group', types: [] },
  'src/server/csp-reports.js': { origin: 'server', scope: 'group', types: [] },
  'src/user-todos.js': { origin: 'server', scope: 'group', types: [] },   // lane wake-approve-card r9: the store's own set-aside notice
  'src/server/tls.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/desktop-app-keeper.js': { origin: 'server', scope: 'group', types: ['desktop-app-notify'] },
  'src/server/mount-health-watch.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/hooks-late.js': { origin: 'agent', scope: 'group', types: [] },
  'src/server/apps-engine.js': { origin: 'apps', scope: 'mixed', types: ['app-install'] },
  'src/server/oat-identity.js': { origin: 'login', scope: 'group', types: [] },
  'src/server/cli-unmeasured-notice.js': { origin: 'pool', scope: 'group', types: [] },
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
console.log('④ dockWords + dockOf — THE ATTENTION DOCK\'s model: «waiting for you · N» with the kind named, the newest, the door (lane needs-card-tail r10)');
if (typeof CN.dockWords !== 'function' || typeof CN.dockOf !== 'function') { ok(false, 'PURE dockWords + dockOf exist (src/foryou-actions.js — THE ATTENTION DOCK\'s model)'); CN.dockWords = () => ({}); CN.dockOf = () => null; } // (RED copies: named, never a crash)
eq(CN.dockWords([]), null, 'nothing open ⇒ no words');
eq(CN.dockWords([{ kind: 'approval' }]).text, 'waiting for you · an approval', 'one approval');
eq(CN.dockWords([{ kind: 'approval' }, { kind: 'approval' }, { kind: 'approval' }]).text, 'waiting for you · 3 approvals', 'three approvals');
const mixed = CN.dockWords([{ kind: 'approval' }, { kind: 'question' }, { kind: 'secret' }]) || {};
ok(mixed.text === 'waiting for you · 3' && /an approval, a question, a secret/.test(mixed.title || '') && mixed.n === 3 && !/click/.test(mixed.title), 'mixed: the count, every kind in the title (no «click to list them» — the strip is no list)', mixed);
{ const zh = { 'waiting for you · {what}': '等你操作 · {what}', 'an approval': '一项批准' }; const tz = (k, p) => (zh[k] || k).replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')); eq(CN.dockWords([{ kind: 'approval' }], tz).text, '等你操作 · 一项批准', 'the client\'s t() words it (zh)'); }
{ const e = (id, at, kind = 'question') => ({ item: { id, createdAt: at }, kind });
  eq(CN.dockOf([]), null, 'THE DOCK: nothing waiting ⇒ null (no strip — no empty chrome)');
  const one = CN.dockOf([e('ut-a', 5)]);
  ok(!!one && one.n === 1 && one.newest.id === 'ut-a' && one.more === 0 && one.words.text === 'waiting for you · a question', 'THE DOCK: one ⇒ one row (its item, no door)', one);
  const three = CN.dockOf([e('ut-c', 30), e('ut-b', 20, 'approval'), e('ut-a', 10)]);
  ok(!!three && three.n === 3 && three.newest.id === 'ut-c' && three.more === 2 && three.words.text === 'waiting for you · 3', 'THE DOCK: many ⇒ the count + the NEWEST + the door (more)', three);
  const shuffled = CN.dockOf([e('ut-a', 10), e('ut-c', 30), e('ut-b', 20)]);
  ok(!!shuffled && shuffled.newest.id === 'ut-c', 'THE DOCK: the newest by its filing time, whatever the order it is handed', shuffled);
  const thirty = CN.dockOf(Array.from({ length: 30 }, (_, k) => e('ut-' + k, k)));
  ok(!!thirty && thirty.n === 30 && thirty.newest.id === 'ut-29' && thirty.words.text === 'waiting for you · 30 questions', 'THE DOCK: thirty ⇒ still ONE newest and the count', thirty && thirty.words);
  // r11 A SAME-MS TIE (the r10 heavy on 7ec6c6dcf: a parallel batch files several asks in ONE ms, and «the newest» was whichever
  // the list held first): ONE newest whatever the order it is handed — the later filing, a tie by id (the tray's own tie)
  const tie = [e('ut-b', 40), e('ut-a', 40), e('ut-c', 10)], ta = CN.dockOf(tie), tb = CN.dockOf([...tie].reverse());
  ok(!!ta && !!tb && ta.newest.id === 'ut-a' && tb.newest.id === 'ut-a', 'RED-able (r11 — 7ec6c6dcf: ut-b handed first, ut-a handed reversed): THE DOCK over a same-ms tie ⇒ ONE newest by id, whatever the order it is handed (the tray\'s tie — attention-model byNewest)', { first: ta && ta.newest.id, reversed: tb && tb.newest.id });
  const its = [{ id: 'ut-q', createdAt: 7 }, { id: 'ut-p', createdAt: 7 }, { id: 'ut-r', createdAt: 9 }], ord = (l) => [...l].sort(CN.newestFirst).map((i) => i.id).join();
  ok(typeof CN.newestFirst === 'function' && ord(its) === 'ut-r,ut-p,ut-q' && ord([...its].reverse()) === 'ut-r,ut-p,ut-q', 'RED-able (r11 — 7ec6c6dcf: no such order): newestFirst — the later filing first, a same-ms tie by id; ONE order for the dock and the announce\'s stack', typeof CN.newestFirst === 'function' ? ord(its) : 'absent'); }
{ const z = (l) => fs.readFileSync(path.join(ROOT, l), 'utf8'); const keys = ['waiting for you · {what}', 'Waiting for you — {what}', 'also in For you', 'View all · {n}', 'Show it in the conversation', 'This conversation is waiting for you: {all}', 'Open everything this conversation is waiting on in the For-you window', ...Object.values(CN.KIND_WORDS), '{n} approvals', '{n} questions', 'approved', 'withdrawn by the agent', 'you replied']; for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) { const s = z(f); const miss = keys.filter((k) => !s.includes(JSON.stringify(k) + ':')); ok(!miss.length, `${f}: every word of the card and the chip is translated`, miss); } }

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
  ok((SRC.access.match(/userTodos\.resolveAnswered\(\[req0?\.todoId\], approve \? 'allowed' : 'denied', person \? \{ decidedBy: 'person', decidedAt: t \} : null\)/g) || []).length === 2, 'a decided watch / access request resolves `allowed` / `denied` (the card\'s record says which — it read «automatically»; lane wake-approve-card r2: with the person verdict\'s mark when the decide route asked it)');
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
// lane needs-card-tail r10 — THE ATTENTION DOCK (the owner 2026-10-30): window chrome — created by the view BEFORE its cards start,
// appended below the ↓ and ABOVE the message box (never inside the virtual-scroll list), hidden when empty; the status bar
// carries no «waiting for you» chip any more (ONE place says it); the dock draws THE row through the panel and wires THE verbs
{ const mk = CV.indexOf("this._attnDock = document.createElement('div');"), nc = CV.indexOf('this._needsCards = new NeedsCards(this);'), ap = CV.indexOf('container.appendChild(this._attnDock);'), sw = CV.indexOf('container.appendChild(this._scrollBtnWrap);'), ci = CV.indexOf('container.appendChild(this._chatInput.element);');
  ok(mk > 0 && nc > mk && /this\._attnDock\.className = 'chat-attn-dock';\n\s+this\._attnDock\.hidden = true;/.test(CV) && ap > sw && ci > ap && !/this\._messageList\.append(?:Child)?\(this\._attnDock\)/.test(CV), 'THE ATTENTION DOCK is the window\'s chrome: made before the cards start, hidden while empty, appended after the ↓\'s wrap and before the message box — never inside the list');
  ok(!/setNeeds|_needRows|chat-needs-list|onJumpToNeed|chip\('foryou'/.test(BAR) && !/onJumpToNeed|jumpToNewest/.test(CV) && !/setNeeds|_chipOf|jumpToNewest/.test(CARD), 'the status bar\'s «waiting for you · N» chip and its list are GONE (lane needs-card-tail r10: the strip says it — ONE place)'); }
{ const dp = CARD.slice(CARD.indexOf('  _dockPass(waiting) {'), CARD.indexOf('  /** The card of item `id` in this list'));
  ok(/const d = dockOf\(list, t\);/.test(dp) && /this\.app\.foryouRows\?\.reconcileDock\(rows, \[entry\]\);/.test(dp) && /reconcileDock: \(container, entries\) => reconcileRows\(container, entries, null, dockCtx, \{ arm: false \}\),/.test(PANEL) && /const dockCtx = \{ \.\.\.miniCtx, noPick: true \};/.test(PANEL) && /this\.app\.foryouRows\.wire\(dock, \{ close: \(\) => \{\} \}\);/.test(dp) && !/fetchJson|\/api\/|runAction|postReply|setStatus\(|innerHTML = [^`]*\$\{(?!UI_ICONS)/.test(dp), 'the dock draws THE row (the panel\'s reconcileDock — renderRow / patchRow over the mini inbox\'s context with no pick: r11, one form per item) and wires THE verbs (foryouRows.wire — the tray\'s routes, ONE answer writer); no route, no answer of its own, no peer string through innerHTML');
  ok(/if \(!entry\) \{\n\s+if \(!dock\.hidden\) \{ dock\.hidden = true; rows\.replaceChildren\(\); \}/.test(dp) && /all\.hidden = !\(d && d\.n > 1\);/.test(dp) && /t\('View all · \{n\}', \{ n: d\.n \}\)/.test(dp) && /this\.app\.openInbox\?\.\(\{ sessionKey: this\.app\.foryouRows\?\.primaryKey\?\.\(keys\) \|\| keys\[0\] \}\);/.test(dp) && /primaryKey, \/\/ lane needs-card-tail r10/.test(PANEL), 'empty ⇒ the strip is absent; one ⇒ one row; several ⇒ «View all · N» — the For-you window scoped to this conversation (the mini inbox\'s key), never a «show more» inside the strip');
  ok(/const kept = cur && boxInUse\(cur\.querySelector\('\.ut-reply'\)\) \? cur\.dataset\.id : null;/.test(dp) && /this\.view\._attnDock\?\.addEventListener\('ut-box-left', go, \{ signal: own \}\);/.test(CARD) && /if \(sig !== this\._dockSig\) \{ this\._dockSig = sig; this\.app\.foryouRows\?\.arm\?\.\(dock\); \}/.test(dp), 'THE row\'s keep rule in the strip: a row whose reply box is in use stays under the typist (open or answered) until the box is left (`ut-box-left`); what appeared under the pointer is armed afresh (the press arm)');
  ok(/const q = ev\.target\.closest\('\.cad-rows \.ut-item > \.ut-body > :is\(\.ut-text, \.ut-meta\)'\);/.test(dp) && /if \(ev\.target\.closest\('\.fy-link, \.ut-art, button, textarea, input, summary'\)\) return;/.test(dp) && /this\.land\(item\.id\)\.catch\(\(\) => \{\}\);/.test(dp) && /inboxModel\(this\.app\)\.isDoor\?\.\(item\.sessionKey, item\)\) return;/.test(dp), 'a tap on the strip\'s question lands the ORIGINAL card (THE ONE LANDING — a navigation the owner asked for); a link, a verb, a box answer themselves; a door item\'s tap stays the row\'s');
  ok(/new ResizeObserver\(\(\) => \{ const v = this\.view; if \(v\._pinned && !v\._disposed\) v\._scrollToBottom\?\.\(\); \}\)\)\.observe\(dock\);/.test(dp) && /this\._dockRO\?\.disconnect\(\)/.test(CARD), 'the strip changing size keeps a PINNED view at the live tail (a reader in history keeps their line: the list shrinks below it); its observer goes with the view'); }
// acceptance round 2 (P3): ONE SOURCE — the chip's words are the open cards this pass drew, never the store's list beside them
ok(/this\._dockPass\(plan\.waiting\);/.test(CARD) && /this\._dockPass\(\[\]\); \/\/ THE ATTENTION DOCK: nothing waits/.test(CARD) && !/\bshown\b/.test(CARD.slice(CARD.indexOf('  _pass('), CARD.indexOf('  _create(e) {'))) && /const plan = flowPlan\(open, transcript, \{ rendered: drawn, atEnd, known: this\._provedOf\(open\) \}\);/.test(CARD), 'ONE PASS (lane needs-card-tail r10 — was the chip): the strip shows EVERY open ask\'s count and the newest (PURE flowPlan\'s waiting — the cards in the flow are a subset) from the same pass that draws the cards — they change in the same frame; nothing waiting ⇒ the strip goes in that pass');
ok(/try \{ if \(!card\) card = this\._create\(e\); else this\._patch\(card, e\); \} catch \(err\) \{ console\.warn\('\[chat-needs\] a card failed to draw:'[^}]*continue; \}/.test(CARD), 'ONE card that throws is said and skipped — the pass still reaches the chip');
// acceptance round 2 (P2): THE ACCORDION — one open slot (the person's pick while it waits, else the newest; a filing takes it back)
ok(/const fresh = open\.filter\(\(e\) => !this\._seen\.has\(e\.item\.id\)\);\n\s+if \(fresh\.length\) this\._slot = newestOf\(fresh\)\.item\.id;\n\s+this\._seen = new Set\(open\.map\(\(e\) => e\.item\.id\)\);\n\s+const openSlot = this\._slot;/.test(CARD) && /fold: x\.item\.id !== openSlot/.test(CARD) && /card\.classList\.toggle\('cn-fold', fold\);/.test(CARD) && /row\.classList\.toggle\('ut-open', !fold\);/.test(CARD) && /const fold = !!e\.fold && !boxInUse\(card\.querySelector\('\.ut-reply'\)\);/.test(CARD) && /card\.addEventListener\('click', \(ev\) => \{\n\s+if \(unfold\(ev\) \|\| card\._openedAt == null/.test(CARD), 'THE ACCORDION: ONE open card (the slot: a FILING\'s newest id, a tap, the chip), the rest folded rows whose whole row opens them; a reply box in use is never folded');
// r12 (the r11 acceptance — repro/accept-r11/tie-accordion.cjs): THE ACCORDION's open slot rides THE one order — a same-ms batch
// unfolds in the flow the SAME twin the strip and the announce's stack show (the REAL newestOf line, run here over three store orders)
{ const src = (CARD.match(/^const newestOf = (.*);$/m) || [])[1];
  let newestOf = null; try { newestOf = src ? new Function('newestFirst', 'return ' + src)(CN.newestFirst) : null; } catch { }
  const KEY = 'claude:c0ffee', T = 1_800_000_000_000;
  const batch = (ids) => ids.map((id) => ({ id, status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', createdAt: T, sessionKey: KEY, text: id, action: { type: 'exit-run-ask', askId: id + 'x'.repeat(10) } }));
  const got = [['ut-aaa', 'ut-mmm', 'ut-zzz'], ['ut-zzz', 'ut-mmm', 'ut-aaa'], ['ut-mmm', 'ut-zzz', 'ut-aaa']].map((o) => {
    const open = CN.needsOf(batch(o), [KEY]), slot = newestOf ? ((newestOf(open) || {}).item || {}).id : null;
    const d = typeof CN.dockOf === 'function' ? CN.dockOf(CN.flowPlan(open, [], { atEnd: true }).waiting) : null;
    return { stored: o.join(), slot, dock: d && d.newest.id, stack: typeof CN.newestFirst === 'function' ? [...batch(o)].sort(CN.newestFirst)[0].id : null };
  });
  ok(!!src && /newestFirst\(/.test(src) && got.every((g) => g.slot === 'ut-aaa' && g.dock === 'ut-aaa' && g.stack === 'ut-aaa'), 'RED-able (r12 — 9f8b8d846: newestOf took the list\'s last on a tie — ut-zzz unfolded while the strip and the stack showed ut-aaa): THE ACCORDION\'s open slot over a same-ms batch is newestFirst\'s — the SAME twin in the flow, the strip and the stack, whatever the store\'s order', got); }
// acceptance round 3 — the accordion's slot law, the tap's hold on a pinned view, the box kept across a resolve, the pass a frame
ok(!/this\._pick|this\._newest/.test(CARD) && /this\._seen\.clear\(\); \/\/ nothing waits/.test(CARD) && /if \(el\.classList\.contains\('cn-fold'\)\) \{ this\._slot = el\.dataset\.item; this\.render\(\{ hold: true \}\); \}/.test(CARD), '#3 the slot moves on a FILING, a tap or the chip — never on a resolution (no «newest changed ⇒ the pick goes» left)');
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  /** THE ONE LANDING (lane needs-card-tail'));
  ok(/view\._noteTailPress\?\.\('needsOpen'\);\n\s+view\._cancelForcedScroll\?\.\('needsOpen'\);\n\s+this\._slot = id;\n\s+this\.render\(\{ hold: true \}\);/.test(oc) && /if \(view\._pinned && placed && !hold\) view\._scrollToBottom\?\.\(\);/.test(CARD) && !/_fsbEpoch|_fsbActive/.test(CARD), '#2 an open in place goes through the VIEW\'s door (its stamp and the view\'s own chain cancel — r9: _noteTailPress + _cancelForcedScroll, THE RULE deciding the rest where it lands) before the pass, and that pass starts none — no private copy of the epoch'); }
{ const res = CARD.slice(CARD.indexOf('    if (e.resolved) {'), CARD.indexOf('    let head = card.querySelector'));
  ok(/if \(rows && boxInUse\(rows\.querySelector\('\.ut-reply'\)\)\) \{/.test(res) && /this\.app\.foryouRows\?\.reconcile\(rows, \[\{ item: e\.item, resolved: true \}\]\);/.test(res) && res.indexOf('this.app.foryouRows?.stash?.(card);') > 0 && res.indexOf('this.app.foryouRows?.stash?.(card);') < res.indexOf('card.innerHTML ='), '#4 THE row\'s keep rule: a resolved card keeps a box in use (the row resolved AROUND it), and the typed text is a draft BEFORE any innerHTML write');
  ok(/stash: stashDrafts,/.test(PANEL) && /fold: \(box\) => foldBox\(box\),/.test(PANEL) && /this\.app\.foryouRows\?\.fold\?\.\(box\);/.test(CARD), '#4 …the drafts are the panel\'s (stashDrafts / foldBox through app.foryouRows) — a box kept on an answered card folds, its text a draft, when the person leaves it'); }
ok(/signal\.addEventListener\('abort', \(\) => this\.stop\(\), \{ once: true, signal: own \}\);/.test(CARD), 'm1 the window\'s abort listener goes with the VIEW\'s controller (a replaced view is not held until the window closes)');
ok(/if \(!document\.hidden\) raf = requestAnimationFrame\(run\);\n\s+const tm = setTimeout\(run, document\.hidden \? 0 : 100\);/.test(CARD) && !/queueMicrotask/.test(CARD) && !/_shape/.test(CARD), '#1 ONE pass a frame (a burst of broadcasts is one pass, never one inside each socket message) — round 4 (#3) measures «unchanged» by the pass\'s own writes, below');
{ const arm = PANEL.slice(PANEL.indexOf('  const stampArm'), PANEL.indexOf('  const patchDot ='));
  ok((PANEL.match(/document\.addEventListener\('scroll'/g) || []).length === 1 && /if \(want\) document\.addEventListener\('scroll', onArmScroll, \{ capture: true, passive: true \}\);\n\s+else document\.removeEventListener\('scroll', onArmScroll, \{ capture: true \}\);/.test(arm) && /for \(const b of armed\) \{ if \(b\.isConnected\) stampArm\(b, now\); else armed\.delete\(b\); \}/.test(arm) && !/onArmScroll = \(\) => \{[^}]*querySelectorAll/.test(arm), 'm4 the scroll re-stamp listens only while a stamped button is on the page, and re-stamps THAT set — never a document query on every scroll'); }
{ const CC = read('public/chat.css'); const cn = CC.split('\n').filter((l) => /\.cn-(card|line|cards|head|rows|fold)/.test(l));
  ok(cn.length > 10 && !cn.some((l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(l)), `m2 the cards' rules (${cn.length} lines) use theme vars only — no literal colour, no fallback`, cn.filter((l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(l)));
  { const ST = read('public/style.css'); const ts = ST.slice(ST.indexOf('/* ── lane foryou-honest: THE TOUCH SCALE'), ST.indexOf('/* ── end of the touch scale (lane foryou-honest) ── */'));
    ok(/\n  \.chat-attn-dock :is\(button, \[role="button"\], summary, textarea, select, input:not\(\[type="radio"\], \[type="checkbox"\]\)\),\n(?:  [^\n{}]*,\n)?  \.iw :is\(button,/.test(ts) && /\.chat-attn-dock \.cad-rows \.ut-body > \.ut-text \{[^}]*font-size: 16px !important;/.test(ts) && /, \.chat-attn-dock \.ut-item \.ut-actions > \.ut-act\[data-label\]::after \{ content: attr\(data-label\);/.test(ts) && /\.chat-attn-dock \*(?:, \.ut-announce \*)? \{ font-size: max\(14px, 1em\) !important; \}/.test(ts) && (ts.match(/min-height: 44px !important/g) || []).length === 1 && !/chat-needs-pick/.test(ts), 'r10 on touch the strip takes the For-you touch scale — it JOINS the scale\'s rules (the one 44 px target rule, the verbs\' words under their icons), never a copy beside them; its question 16 px — the chip\'s list rule gone'); }
  ok(!/chat-status-foryou|chat-needs-pick|\.cn-dock\b/.test(CC) && /\.chat-attn-dock\[hidden\] \{ display: none; \}/.test(CC) && /@container \(max-width: 520px\) \{\n\s+\.cad-rows \{ order: 3; flex: 1 1 100%; \}/.test(CC) && /\.cad-rows \.ut-body > \.ut-opts \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/.test(CC), 'r10 the strip\'s rules: hidden ⇒ no box; a narrow strip puts the row under the head; option chips ONE line, sideways — never a wall; the chip\'s and the dock line\'s rules gone'); }
// acceptance round 4 — the open at the bottom edge, ONE exit from a box, a pass that changed nothing reads no layout, a kept card in the pass
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  /** THE ONE LANDING (lane needs-card-tail'));
  ok(/\nconst lineOf = \(c\) => \(c && c\.querySelector\(':scope > \.cn-rows > \.ut-item \.ut-text'\)\) \|\| c;/.test(CARD) && /const was = at\(\), before = lineOf\(was\)\?\.getBoundingClientRect\(\)\.top, row = was\?\.getBoundingClientRect\(\);/.test(oc) && /const lr = list\.getBoundingClientRect\(\), line = lineOf\(el\);\n\s+const shift = before == null \? 0 : line\.getBoundingClientRect\(\)\.top - before;/.test(oc) && !/const before = at\(\)\?\.getBoundingClientRect/.test(oc), 'R4 #1(a) the hold anchors the row\'s TEXT LINE (its question\'s first line) — never the card\'s box, which the head and the padding grow inside');
  ok(/\} else \{\n\s+const verbs = \[\.\.\.el\.querySelectorAll\(':scope > \.cn-rows :is\(button, textarea\)'\)\][^\n]*\n\s+const low = [^\n]*\n\s+const lineTop = [^\n]*\n\s+if \(low > lr\.bottom\) reveal = Math\.min\(Math\.ceil\(low - lr\.bottom\), /.test(oc) && /el\._openedAt = performance\.now\(\);/.test(oc) && /if \(pressVerdict\(\{ since: card\._openedAt, now: performance\.now\(\) \}\)\.ok\) \{ card\._openedAt = null; return; \}\n\s+ev\.stopPropagation\(\); ev\.preventDefault\(\);/.test(CARD) && /import \{ pressVerdict \} from '\.\/press-arm\.js';/.test(CARD), 'R4 #1(b) a pointer open whose lowest verb lies below the list brings it inside by the MINIMUM scroll — and what that moved under the pointer answers nothing for ARM_MS (the press arm\'s verdict, on every verb of the card)');
  ok(/const room = Math\.min\(list\.scrollHeight, end\) - list\.clientHeight - list\.scrollTop;\n\s+if \(move > room \+ 1\) this\._lend\(list, Math\.ceil\(move - room\), el\);\n\s+if \(Math\.abs\(move\) > 1\) list\.scrollTop \+= move;/.test(oc) && !/_giveBack\(\); placed/.test(CARD) && /const atTail = view\._atLiveTail \? view\._atLiveTail\(list\.scrollTop, list\.scrollHeight, list\.clientHeight\) : [^\n]*\n\s+if \(!atTail\) \{ view\._noteUserNav\?\.\('needsOpen'\); if \(view\._pinned\) view\._setPinned\?\.\(false, 'needsOpen'\); \}/.test(oc), 'R4 #1(a) at the END of the transcript the hold borrows the room it lacks below the last record — given back once a scroll leaves all of it out of sight (its going moves nothing); the pin follows the landing (the chat\'s PINNED ⇔ AT THE LIVE TAIL)'); }
{ const fb = PANEL.slice(PANEL.indexOf('  const foldBox = (box'), PANEL.indexOf('  const sendReply = async'));
  ok(/row\?\.dispatchEvent\(new CustomEvent\('ut-box-left', \{ bubbles: true \}\)\);/.test(fb) && /if \(row && ta && ta\.value && !sent\) drafts\.set/.test(fb) && /if \(box\) foldBox\(box, \{ sent: true \}\);/.test(PANEL) && (PANEL.match(/\bbox\.remove\(\)/g) || []).length === 1 && fb.includes('box.remove()'), 'R4 #2 ONE exit from a reply box — Esc, the fold verb, a blur, a sent reply all go through foldBox (the draft, the box gone, `ut-box-left`); no other road removes a box');
  ok(/this\.view\._messageList\.addEventListener\('ut-box-left', go, \{ signal: own \}\);/.test(CARD) && !/this\.app\.foryouRows\?\.fold\?\.\(box\);\n\s+this\.schedule\(\);/.test(CARD), 'R4 #2 …and the card hears that exit (its next pass ends the kept state) — its blur road no longer schedules a pass of its own'); }
{ const rn = CARD.slice(CARD.indexOf('  render({ hold'), CARD.indexOf('  _lend(list'));
  ok(/probe\.observe\(view\._messageList, \{ subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true \}\);/.test(rn) && /if \(!wroteAny\(recs\)\) return;\n\s+this\._roomCheck\(\);[^\n]*\n(?:\s*\/\/[^\n]*\n)?\s+this\.app\.foryouRows\?\.arm\?\.\(view\._messageList\);/.test(rn) && /for \(const \[el, m\] of was\) for \(const \[a, v\] of m\) if \(el\.getAttribute\(a\) !== v\) return true;/.test(CARD), 'R4 #3 a pass that changed no card (its own DOM writes recorded — none) reads NO layout: no stamp, no follow; a pass that changed one stamps THIS list\'s armed buttons');
  ok(/reconcile: \(container, entries\) => reconcileRows\(container, entries, null, miniCtx, \{ arm: false \}\),/.test(PANEL) && /if \(arm\) armExitButtons\(\);/.test(PANEL) && /const armExitButtons = \(root = document\) => \{\n\s+const now = performance\.now\(\);\n\s+for \(const b of root\.querySelectorAll\(/.test(PANEL) && /arm: \(root\) => armExitButtons\(root\),/.test(PANEL), 'R4 #3 …the card\'s reconcile stamps nothing (every card\'s patch re-stamped every Allow of the PAGE, a rect per hit); the tray\'s own passes keep their stamp'); }
{ const ps = CARD.slice(CARD.indexOf('  _pass('), CARD.indexOf('    const transcript = '));
  ok(/if \(listed\.has\(c\.dataset\.item\) \|\| !c\._item \|\| !boxInUse\(c\.querySelector\('\.ut-reply'\)\)\) continue;\n\s+done\.push\(\{ item: todos\.resolved\.find\(\(i\) => i\.id === c\.dataset\.item\) \|\| todos\.open\.find\(\(i\) => i\.id === c\.dataset\.item\) \|\| c\._item,/.test(ps) && ps.indexOf('done.push({ item: todos.resolved.find') < ps.indexOf('if (!open.length && !done.length)') && /card\._item = e\.item;/.test(CARD), 'R4 #4 a card whose box is in use stays IN the pass — drawn from the snapshot\'s copy (a clear rewrites it there), else from its own last one once the resolved tail dropped it — so it is patched, never frozen'); }
// acceptance round 5 — the refusal keyed on the MEASURED landing, the reveal capped, the borrowed room's ONE road back, the kb lines
{ const oc = CARD.slice(CARD.indexOf('  openCard(id'), CARD.indexOf('  /** THE ONE LANDING (lane needs-card-tail'));
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
  ok(/\.cad-all \{[^}]*min-height: 26px;/.test(CHAT_CSS) && /\.cad-rows \.ut-act \{[^}]*height: 26px;/.test(CHAT_CSS) && /\.cad-rows \.ut-body > \.ut-text \{[^}]*min-height: 26px;/.test(CHAT_CSS) && /\.cn-line \{[^}]*min-height: 24px;/.test(CHAT_CSS) && /\.cn-card\.cn-fold \.ut-item:not\(\.ut-open\) \{[^}]*min-height: 24px;/.test(CHAT_CSS), 'the targets: the strip\'s question, verbs and «View all» ≥ 24 px (26; 44 on touch), a quiet record and a folded row ≥ 24 px (the .358 mouse-target law)'); }
ok(/PHONE_BAR_NEVER_FOLD = Object\.freeze\(\[/.test(TC) && !/PHONE_BAR_NEVER_FOLD = Object\.freeze\(\[[^\]]*'foryou'/.test(TC) && /REGULAR_BAR_KEEP = new Set\(\[/.test(BAR) && !/REGULAR_BAR_KEEP = new Set\(\[[^\]]*'foryou'/.test(BAR), 'r10: no bar keeps a «foryou» key — what waits on the person is the window\'s strip, never a bar chip that could fold');
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


// ── ⑩ THE TAIL (lane needs-card-tail) ────────────────────────────────────────────────────────────────────────────────
// the owner on 2.369.360 (2026-10-28, owner-screenshot-59): «这个应该同时堆叠在页面最下吗？» — a 200-turn chat loaded at its tail
// showed SIX cards stacked under its newest message (five folded rows dated 10/25 · 10/26 · 10/26 · 8 h · 6 h and one open
// card), the status bar already saying «等你操作 · 6 个问题»: every open ask whose record was far above the window fell back
// to the END. r1–r9's law: at most ONE docked card (the newest), the chip lists every one. r10 (the owner 2026-10-30 on that
// one card: «如果历史对话里的内容就别停靠了呗，或者就不要停靠在聊天内容本身里了…»): THE FLOW IS HISTORY — NONE at the end; every
// one waits in the window's attention dock (the strip above the message box: its count, its newest).
console.log('⑩ THE TAIL — a card whose record is not on screen is drawn NOWHERE in the flow (r10: none at the end); the dock counts every one; the landing reads the history upward');
{
  const H = 3600e3, NOW = Date.UTC(2026, 9, 28, 10, 50, 0);
  const has = typeof CN.flowPlan === 'function', hasFind = typeof CN.filingIndex === 'function';
  ok(has && hasFind && !('tailPlan' in CN) && !('chipWords' in CN), 'PURE flowPlan + filingIndex exist (src/foryou-actions.js — the pass and the landing draw from them); r1–r9\'s tailPlan and the chip\'s words are gone');
  const flowPlan = has ? CN.flowPlan : () => ({ at: new Map(), waiting: [], loose: [] });
  const ask = (k, ts) => ({ item: { ...FIX['agents: an ask'], id: `ut-tail0000${k}`, text: `the ask ${k}`, createdAt: ts }, kind: 'question' });
  // the owner's six, oldest first as needsOf gives them: 10/25, 10/26, 10/26, 8 h ago, 6 h ago, 6 h ago
  const SIX = [ask(1, NOW - 74 * H), ask(2, NOW - 50 * H), ask(3, NOW - 46 * H), ask(4, NOW - 8 * H), ask(5, NOW - 6 * H - 60e3), ask(6, NOW - 6 * H)];
  // the window loaded at the chat's tail: its last 50 records, the last two hours (a tool card every third)
  const WIN = Array.from({ length: 50 }, (_, k) => ({ id: `w${k}`, role: k % 3 ? 'assistant' : 'tool', ts: NOW - 2 * H + k * 60e3, tool: k % 3 ? null : 'Bash', cmd: k % 3 ? '' : 'git status', out: '' }));
  const onScreen = new Set(WIN.map((r) => r.id)), rendered = (id) => onScreen.has(id);
  // THE BASE's rule, as 90c995a3's _pass ran it (chat-needs-card.js:274–279 «an anchor not rendered = no card there; an open
  // card's fallback is the end»): every open card whose record is not on screen is drawn at the end
  const baseAtEnd = (open, tr) => open.filter((e) => { const p = CN.placementOf(e.item, tr); return !(p.how !== 'end' && p.at != null && rendered(p.at)); }).length;
  eq(baseAtEnd(SIX, WIN), 6, 'RED (the base\'s rule over the owner\'s six — their records far above the window): SIX cards at the end');
  // r1–r9's rule (bd5c5fd98 tailPlan: of the loose ones the NEWEST docks at the end) — the card the owner ruled on
  const r9AtEnd = (open, tr, atEnd = true) => (atEnd && open.some((e) => { const p = CN.placementOf(e.item, tr, { more: !atEnd }); return !(p.how !== 'end' && p.at != null && rendered(p.at)); }) ? 1 : 0);
  eq(r9AtEnd(SIX, WIN), 1, 'RED (r1–r9\'s rule over the same six — «停靠在末尾 — 它是在对话更上面提出的 · 共 7 个在等你»): ONE card docked at the end');
  const plan = flowPlan(SIX, WIN, { rendered });
  ok(plan.at.size === 0 && !('dock' in plan) && plan.loose.length === 6, 'r10 THE FLOW IS HISTORY: the six ⇒ NO card at the end (none of them in place — their records are not on screen)', { at: [...plan.at], loose: plan.loose });
  eq(plan.waiting.map((e) => e.item.id), ['ut-tail00006', 'ut-tail00005', 'ut-tail00004', 'ut-tail00003', 'ut-tail00002', 'ut-tail00001'], 'r10 …every one waits in the window\'s attention dock, newest first');
  { const d = CN.dockOf(plan.waiting); ok(!!d && d.n === 6 && d.newest.id === 'ut-tail00006' && d.words.text === 'waiting for you · 6 questions' && d.more === 5, 'r10 the dock: «waiting for you · 6 questions», the NEWEST (6 h ago) on its row, the door to all six', d && { n: d.n, newest: d.newest.id, text: d.words.text }); }
  // 2 anchored (the CLI call before it; the result naming it) + the 4 oldest with no record on screen
  const A7 = { item: { ...FIX['agents: an ask'], id: 'ut-tail00007', text: 'the ask 7', createdAt: WIN[40].ts + 1500 }, kind: 'question' };
  const A8 = { item: { ...FIX['agents: an ask'], id: 'ut-tail00008', text: 'the ask 8', createdAt: WIN[44].ts + 1000 }, kind: 'question' };
  const WIN2 = WIN.map((r, k) => (k === 40 ? { ...r, role: 'tool', tool: 'Bash', cmd: 'vibespace-ask "the ask 7"', out: '' } : k === 45 ? { ...r, role: 'tool', tool: 'Bash', cmd: 'vibespace-ask "the ask 8"', out: 'Filed for you: a question — answer it on the card in this conversation or in the For-you tray (ut-tail00008)' } : r));
  const MIX = [SIX[0], SIX[1], SIX[2], SIX[3], A7, A8];
  eq(baseAtEnd(MIX, WIN2), 4, 'RED (the base\'s rule): 2 in place + FOUR at the end');
  eq(r9AtEnd(MIX, WIN2), 1, 'RED (r1–r9\'s rule): 2 in place + ONE docked at the end');
  const p2 = flowPlan(MIX, WIN2, { rendered });
  ok(p2.at.size === 2 && p2.at.get('ut-tail00007') === 'w40' && p2.at.get('ut-tail00008') === 'w45' && p2.loose.length === 4, 'r10 2 anchored + 4 not ⇒ 2 IN PLACE (the CLI call · the result naming it — unchanged) + NONE at the end', { at: [...p2.at], loose: p2.loose });
  ok(p2.waiting.length === 6 && p2.waiting[0].item.id === 'ut-tail00008' && (CN.dockOf(p2.waiting) || { newest: {} }).newest.id === 'ut-tail00008', 'r10 …the dock counts all six (in place or not), its newest the one filed last');
  // R3: answered anywhere ⇒ the dock's newest is the next one (or the strip goes) — its count and the cards in the same pass
  const p3 = flowPlan(SIX.slice(0, 5), WIN, { rendered });
  { const d = CN.dockOf(p3.waiting); ok(!!d && d.newest.id === 'ut-tail00005' && d.n === 5, 'R3 the newest answered (the tray, a phone, the strip) ⇒ the dock shows the next newest and says 5 — from the same plan', d && { n: d.n, newest: d.newest.id }); }
  ok((CN.dockOf(flowPlan(SIX.slice(0, 1), WIN, { rendered }).waiting) || { newest: {} }).newest.id === 'ut-tail00001' && CN.dockOf(flowPlan([], WIN, { rendered }).waiting) === null && CN.dockWords([]) === null, 'R3 …down to the last one; all answered ⇒ the strip goes');
  // the landing's window: loaded MID-HISTORY around ask 2's filing (jumpToIndex) — no dock there, the newer asks NOT stacked
  // on the window's last record
  const MID = Array.from({ length: 50 }, (_, k) => ({ id: `m${k}`, role: 'assistant', ts: SIX[1].item.createdAt - 20 * 60e3 + k * 60e3 }));
  const midOn = new Set(MID.map((r) => r.id));
  const pm = flowPlan(SIX, MID, { rendered: (id) => midOn.has(id), atEnd: false });
  ok(pm.at.size === 1 && pm.at.get('ut-tail00002') === 'm20' && pm.waiting.length === 6, 'a window loaded mid-history (the landing): the landed ask at its record, every other in the dock only', { at: [...pm.at] });
  ok(CN.placementOf(SIX[5].item, MID).how === 'turn' && CN.placementOf(SIX[5].item, MID, { more: true }).how === 'end' && CN.placementOf(SIX[1].item, MID, { more: true }).at === 'm20', 'RED (placementOf without `more`): an ask filed AFTER a mid-history window lands «at the filing» on its LAST record (the stack again, one window up); with `more` it is not there — and one inside it still is');
  // THE READ UPWARD (R2 / R5's «above the window ⇒ load up to it»): a 300-record conversation, an ask filed at record 40, the
  // window its last 50 — the pages above read from the window's top, the index of the record that filed it
  const CONV = Array.from({ length: 300 }, (_, k) => ({ id: `c${k}`, role: k % 2 ? 'assistant' : 'tool', ts: NOW - 300 * 60e3 + k * 60e3, tool: k % 2 ? null : 'Bash', cmd: k === 40 ? 'vibespace-ask "the ask at 40"' : '', out: '' }));
  const at40 = { ...FIX['agents: an ask'], id: 'ut-tail00040', text: 'the ask at 40', createdAt: CONV[40].ts + 1200 };
  const reads = [];
  const readPage = async (offset, limit) => { reads.push([offset, limit]); return CONV.slice(offset, offset + limit); };
  const find = hasFind ? CN.filingIndex : async () => undefined;
  const W0 = 250, after = CONV.slice(W0, W0 + 40);
  eq(baseAtEnd([{ item: at40, kind: 'question' }], CONV.slice(W0)), 1, 'RED (the base): the ask filed at record 40 of 300, the window loaded at the tail ⇒ its card at the END (its record out of sight)');
  eq(await find(at40, readPage, { start: W0, after }), 40, 'the read upward finds record 40 (the CLI call that filed it)');
  eq(reads, [[50, 200], [0, 50]], '…a page at a time from the window\'s top (200, then the rest) — never the whole conversation at once');
  eq(await find({ ...at40, createdAt: CONV[0].ts - 3 * H }, readPage, { start: W0, after }), -1, 'an ask filed before the conversation\'s first record ⇒ -1 (no record: the landing ends at the live end and says so — r10, never docked)');
  eq(await find(at40, async () => { throw new Error('500'); }, { start: W0, after }), null, 'a page that fails ⇒ null (unknown — never claimed «no record»)');
  eq(await find({ ...at40, createdAt: CONV[120].ts + 500 }, readPage, { start: W0, after }), 120, 'an ask with no CLI record (the record at the filing) ⇒ that record');
  { const named = CONV.map((r, k) => (k === 77 ? { ...r, role: 'tool', out: 'Filed for you … (ut-tail00040)' } : r)); eq(await find(at40, async (o, l) => named.slice(o, o + l), { start: W0, after }), 77, 'the result naming it wins (placementOf\'s named rung) when that page is read'); }
  // THE WORDS (r10): the dock line, the chip's list and its titles are GONE from the code and the dictionaries; the strip's
  // words worded in zh + ja (④ checks them present)
  const gone = ['Docked here — it was asked further up the conversation', 'Docked here — asked before this conversation\'s record was kept', '{n} waiting — the status bar lists them all', 'Waiting for you — newest first', 'This conversation is waiting for you: {all} — click to go to it', 'This conversation is waiting for you: {all} — click to list them, choose one to go to it'];
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js', 'src/lib/chat-needs-card.js', 'src/lib/chat-status-bar.js', 'src/foryou-actions.js']) { const s10 = read(f); const left = gone.filter((k) => s10.includes(JSON.stringify(k)) || s10.includes(`'${k.replace(/'/g, "\\'")}'`)); ok(!left.length, `r10 ${f}: «停靠在末尾», the dock line and the chip's list words are gone`, left); }
  // THE WIRING (source pins): the pass draws the FLOW from the plan — nothing docked; ONE landing for the strip AND every For-you door
  const CARD10 = read('src/lib/chat-needs-card.js'), CV10 = read('src/lib/chat-view.js'), UTA = read('src/lib/user-todos-actions.js'), CSS10 = read('public/chat.css');
  const ps = CARD10.slice(CARD10.indexOf('  _pass('), CARD10.indexOf('  _onScreen(id) {'));
  ok(/const atEnd = !view\._teleported && !\(view\._windowEnd < view\._total\);/.test(ps) && /else if \(plan\.at\.has\(e\.item\.id\)\) el = view\._elements\.get\(plan\.at\.get\(e\.item\.id\)\);\n\s+if \(!el \|\| !el\.isConnected/.test(ps) && !/lastId|plan\.dock|e\.dock|_dockPick|_dockNoRecord|cn-docked|\.cn-dock/.test(CARD10), 'r10 the pass: a card at its record when it is on screen, else NOWHERE in the flow — no end slot, no pick, no dock line, no docked class');
  ok(!/\.cn-dock|cn-docked/.test(CSS10), 'r10 the dock line\'s and the docked card\'s rules are gone');
  const land = CARD10.slice(CARD10.indexOf('  async land(x'), CARD10.indexOf('  _show(el) {'));
  ok(land.indexOf('const now = here();') > 0 && land.indexOf('await this._anchorIndex(item') > land.indexOf('const now = here();') && /await ours\(view\.jumpToIndex\(idx, \{ land: \(\) => \{ if \(!gone\(\)\) landed = here\(\); \}, stale: gone \}\)\);/.test(land) && /const tail = \(\) => here\(\);\n(?:\s+\/\/[^\n]*\n)*\s+const atEndSaid = \(\) => \{ if \(isCard\) this\._dockMark\(\); if \(isCard && idx === -1\) showToast\(t\('Asked before this conversation\\'s record was kept — there is no card for it in the chat; answer it in the strip above the message box or in For you'\), \{ type: 'info' \}\); return 'end'; \};/.test(land) && /view\._scrollToBottom\?\.\(\);\n\s+return atEndSaid\(\);/.test(land) && /if \(card\) return show\(card\) \? 'card' : null;/.test(land), 'THE ONE LANDING: here → the read toward the filing → the window loaded there; r10: an open ask the read PROVED has no record lands at the live END and is SAID there; r11: any open card that ends there MARKS the strip (never docked into the flow)');
  ok(/return filingIndex\(item, readPage, \{ start, end: Number\.isFinite\(view\._windowEnd\) \? view\._windowEnd : null, total: Number\.isFinite\(view\._total\) \? view\._total : null, rows: this\._records\(\)(?:, onHit)? \}\);/.test(CARD10) && /if \(land\) land\(relIdx >= 0 && relIdx < allMsgs\.length \? allMsgs\[relIdx\] : null\)/.test(CV10), 'the read goes through the view\'s own page fetch; jumpToIndex tells its `land` the record it loaded');
  ok(/\} else landOnFiling\(item\); \/\/ lane needs-card-tail \(R5\)/.test(UTA) && /app\.resumeSession\(s\.sessionId, s\.cwd, displayName\(s\), \{ backend: s\.backend, hostId: s\.hostId \|\| s\.host \|\| undefined \}\); landOnFiling\(item\); \}/.test(UTA), 'R5 every For-you door to a conversation lands through the same landing (an open view, a resumed one)');
}

// ── ⑩b THE TAIL, ROUND 2 (lane needs-card-tail r2 — the r1 verdict on 9de5c902) ────────────────────────────────────────
// the END is the display order's last record; a landing reads in BOTH directions; a stale landing never moves the reader; a
// landing unfolds what it lands on; a page boundary is never «no record»; a record drawn as nothing hands its card to the
// nearest drawn one. The PURE half first, then THE REAL PASS AND THE REAL LANDING (an esbuild bundle of
// src/lib/chat-needs-card.js, its DOM-side imports stubbed) over a fake view and a few-selector fake DOM — the verdict's
// mutant M3 (the base's «every loose card at the end» line restored after the dock) was caught only by the heavy ⑬.
console.log('⑩b THE TAIL r2 — the end is the display order\'s; the landing reads both ways, never stale, unfolds; a page edge is no «no record»; the REAL pass + landing over a fake view');
{
  const NOW = Date.UTC(2026, 9, 28, 12, 0, 0), M = 60e3;
  const find = CN.filingIndex, tailPlan = CN.tailPlan;
  const lean = (k, ts, o = {}) => ({ id: `r${k}`, ts, role: 'assistant', tool: null, cmd: '', out: '', ...o });
  // THE PAGE BOUNDARY (the verdict's page-boundary.cjs): the CLI call that filed it at 199, «Filed it for you» at 200 —
  // 0.5 s later, inside the 2 s skew margin — and the window starts at 400 ⇒ the page read upward OPENS on record 200
  { const T0 = NOW - 700 * M, at = T0 + 199 * M + 300;
    const R = Array.from({ length: 600 }, (_, i) => lean(i, i <= 199 ? T0 + i * M : at + 500 + (i - 200) * M));
    R[199] = lean(199, T0 + 199 * M, { role: 'tool', tool: 'Bash', cmd: 'vibespace-ask "Ship it?" --options yes|no', out: 'Filed for you: a question (ut-pageedge01)' });
    const edge = { ...FIX['agents: an ask'], id: 'ut-pageedge01', text: 'Ship it?', createdAt: at };
    const rp = async (o, l) => R.slice(o, o + l);
    eq(await find(edge, rp, { start: 400, end: 600, total: 600, rows: R.slice(400), after: R.slice(400, 440) }), 199, 'RED-able (r2 minor — 9de5c902: −1, «no record» for good): the record after the filing opens a page within the skew margin ⇒ the page above is read too — record 199, the CLI call that filed it');
    eq(await find(edge, rp, { start: 401, end: 600, total: 600, rows: R.slice(401), after: R.slice(401, 441) }), 199, '…and one record later (the control the verdict ran) the same');
  }
  // BELOW A MID-HISTORY WINDOW (the verdict's below-window.cjs): 310 records, the window 100..150 (a landing, a search, the
  // minimap), the ask filed at record 200's time — the read goes DOWN from the window's end
  { const T1 = NOW - 400 * M;
    const B = Array.from({ length: 310 }, (_, i) => lean(i, T1 + i * M, i % 3 ? {} : { role: 'tool', tool: 'Bash', cmd: 'git status' }));
    const below = { ...FIX['agents: an ask'], id: 'ut-belowwin1', text: 'q?', createdAt: B[200].ts + 1000 };
    const reads = [], rp = async (o, l) => { reads.push([o, l]); return B.slice(o, o + l); };
    eq(await find(below, rp, { start: 100, end: 150, total: 310, rows: B.slice(100, 150), after: B.slice(100, 140) }), 200, 'RED-able (r2 #2 — 9de5c902: −1, the ask docked with «asked before this conversation\'s record was kept»): an ask filed BELOW the window ⇒ read DOWN from its end: record 200');
    eq(reads, [[150, 160]], '…a page at a time toward it (the window\'s end to the first record past the filing)');
    reads.length = 0;
    eq(await find(below, rp, { start: 100, after: B.slice(100, 140) }), null, 'RED-able (9de5c902: −1): nothing read lies past the filing ⇒ UNKNOWN (null) — «no record» is said only when the conversation\'s first record is read and lies after the filing');
    eq(await find({ ...below, createdAt: B[0].ts - 3 * 3600e3 }, rp, { start: 100, end: 150, total: 310, rows: B.slice(100, 150) }), -1, '…which is still −1 (filed before the conversation\'s first record)');
    eq(await find({ ...below, createdAt: B[120].ts + 500 }, async () => { throw new Error('no read'); }, { start: 100, end: 150, total: 310, rows: B.slice(100, 150) }), 120, 'an ask filed INSIDE the window is found there with no read at all');
  }
  // A RECORD DRAWN AS NOTHING (a hidden unknown-record notice: loaded, no element) — its card stands at the nearest drawn
  // record after it, the end of what is loaded if none
  { const HW = Array.from({ length: 20 }, (_, k) => lean(k, NOW - 20 * M + k * M));
    const hid = new Set(['r12', 'r19']), drawnH = (id) => !hid.has(id) && HW.some((r) => r.id === id);
    const ask = (id, ts) => ({ item: { ...FIX['agents: an ask'], id, text: id, createdAt: ts }, kind: 'question' });
    const ph = (CN.flowPlan || (() => ({ at: new Map(), loose: [], waiting: [] })))([ask('ut-hidden0003', NOW - 50 * 3600e3), ask('ut-hidden0001', HW[12].ts + 500), ask('ut-hidden0002', HW[19].ts + 500)], HW, { rendered: drawnH });
    ok(ph.at.get('ut-hidden0001') === 'r13' && ph.at.get('ut-hidden0002') === 'r18' && ph.loose.length === 1 && ph.loose[0] === 'ut-hidden0003', 'RED-able (r2 minor — 9de5c902: both loose, the newest docked «further up», the other a chip row only): a card whose record is loaded but drawn as nothing stands at the nearest DRAWN record after it (r13), the end of what is loaded if none (r18); the ask with no record here is in the flow nowhere (r10 — the dock holds it)', { at: [...ph.at], loose: ph.loose });
    const drawnAt = typeof CN.drawnAt === 'function' ? CN.drawnAt : () => undefined;
    eq([drawnAt(HW, 'r12', drawnH), drawnAt(HW, 'r19', drawnH), drawnAt(HW, 'r5', drawnH), drawnAt(HW, 'r99', drawnH)], ['r13', 'r18', 'r5', null], 'drawnAt: the record itself when drawn; else the next drawn; else the last drawn; a record not loaded ⇒ null');
  }

  // ── THE REAL PASS AND THE REAL LANDING over a fake view ──
  const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
  const STUBS = {
    './i18n.js': "export const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));",
    './utils.js': 'export const escHtml = (s) => String(s); export const showToast = (m) => { (globalThis.__cnToasts ||= []).push(m); };',
    './press-arm.js': 'export const pressVerdict = () => ({ ok: true });',
    './icons.js': 'export const UI_ICONS = {};',
    './user-todos-actions.js': 'export const inboxModel = (app) => app.__model;',
    './user-todos-row.js': 'export const agoText = () => "ago"; export const boxInUse = () => false;',
  };
  // every OTHER name chat-needs-card.js imports from a stubbed module is a no-op too (r3 — the int361 re-cut's seam: wake's
  // `endCodeOf` from ./user-todos-row.js was missing here, the bundle failed and the real-pass legs were skipped)
  { const SRC = read('src/lib/chat-needs-card.js');
    for (const p of Object.keys(STUBS)) for (const m of SRC.matchAll(new RegExp(`import \\{([^}]*)\\} from '${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')))
      for (const name of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!new RegExp(`export const ${name}\\b`).test(STUBS[p])) STUBS[p] += ` export const ${name} = () => '';`; }
  const stubPlugin = { name: 'stub', setup(b) { b.onResolve({ filter: /^\.\/(i18n|utils|press-arm|icons|user-todos-actions|user-todos-row)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } };
  /** r9: a MUTANT chat-needs-card.js's own NeedsCards — the same stubs, built in memory (~7 ms once esbuild is warm) */
  const bundleCards = async (contents) => {
    const r = await esbuild.build({ stdin: { contents, resolveDir: path.join(ROOT, 'src/lib'), sourcefile: 'chat-needs-card.js', loader: 'js' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins: [stubPlugin] });
    return (await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'))).NeedsCards;
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'needs-tail-bundle-'));
  let NeedsCards = null;
  try {
    await esbuild.build({ entryPoints: [path.join(ROOT, 'src/lib/chat-needs-card.js')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(tmp, 'cn.mjs'), logLevel: 'silent', plugins: [stubPlugin] });
    ({ NeedsCards } = await import(path.join(tmp, 'cn.mjs')));
  } catch (e) { console.log('    (bundle: ' + (e && e.message) + ')'); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  ok(typeof NeedsCards === 'function', 'the real NeedsCards bundles (src/lib/chat-needs-card.js, DOM-side imports stubbed)');
  // a few-selector fake DOM: what the pass, the landing and the reveal touch
  const DOC = { children: [], parentNode: null };
  class El {
    constructor() { this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this._cls = new Set(); this._box = true; const s = this;
      this.classList = { add: (...c) => c.forEach((x) => s._cls.add(x)), remove: (...c) => c.forEach((x) => s._cls.delete(x)), contains: (c) => s._cls.has(c), toggle: (c, on) => { const v = on === undefined ? !s._cls.has(c) : !!on; if (v) s._cls.add(c); else s._cls.delete(c); return v; } }; }
    get className() { return [...this._cls].join(' '); }
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === DOC; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get nextElementSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    append(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); }
    insertBefore(c, ref) { if (c.parentNode) c.remove(); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
    remove() { const p = this.parentNode; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
    matches(sel) { return sel.split(',').some((one) => { const m = one.trim().match(/^\.?([\w-]+(?:\.[\w-]+)*)(?::not\(\.([\w-]+)\))?$/); return !!m && m[1].split('.').every((c) => this._cls.has(c)) && !(m[2] && this._cls.has(m[2])); }); }
    closest(sel) { for (let n = this; n && n !== DOC; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
    querySelectorAll(sel) {
      if (!sel.startsWith(':scope')) { const out = [], walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
      let cur = [this];
      for (const p of sel.slice(6).split('>').map((x) => x.trim()).filter(Boolean)) cur = cur.flatMap((n) => n.children.filter((c) => p === '*' || c.matches(p)));
      return cur;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getClientRects() { for (let n = this; n && n !== DOC; n = n.parentNode) if (!n._box) return []; return [{}]; }
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
    getAttribute() { return null; }
    addEventListener() { }
  }
  globalThis.document = globalThis.document || { createElement: () => new El(), hidden: false };
  const ME10 = 'claude:5f1c0a', KEYS10 = [ME10];
  const tool = (k, ts, cmd, out = '') => ({ id: `c${k}`, ts, role: 'tool', toolName: 'Bash', content: [{ type: 'tool_use', input: { command: cmd }, output: out }] });
  const text = (k, ts) => ({ id: `c${k}`, ts, role: 'assistant', toolName: null, content: [{ type: 'text', text: 'x' }] });
  /** a conversation of `n` records a minute apart; `asks` = record index → the ask its vibespace-ask call filed */
  const conv = (n, askAt = []) => Array.from({ length: n }, (_, k) => (askAt.includes(k) ? tool(k, NOW - (n - k) * M, `vibespace-ask "the ask at ${k}"`) : text(k, NOW - (n - k) * M)));
  const askOf = (C, k, o = {}) => ({ id: `ut-ask${String(k).padStart(7, '0')}`, status: 'open', kind: 'action', urgency: 'normal', sessionKey: ME10, origin: 'agent', by: 'agent', text: `the ask at ${k}`, createdAt: C[k].ts + 1200, ...o });
  const deferred = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
  function fakeView(C, items, s, e, { hidden = new Set(), resolved = [] } = {}) {
    const list = new El(); DOC.children.push(list); list.parentNode = DOC;
    const v = { _messageList: list, _elements: new Map(), _messages: [], _total: C.length, _teleported: false, _pinned: true, log: [], chip: null, gate: null, _lastNavAt: 0, _lastPositionAt: 0 };
    v.app = { __model: { loaded: true, todos: { open: items, resolved }, wordsOf: (i) => i.text, byId: (id) => items.find((i) => i.id === id) }, foryouRows: null };
    v._statusBar = {}; // (lane needs-card-tail r10: no chip — the pass's dock list is read off `dock`, below)
    v.setWindow = (a, b) => { for (const c of list.children) c.parentNode = null; list.children = []; v._elements.clear(); v._windowStart = a; v._windowEnd = b; v._messages = C.slice(a, b); for (const m of v._messages) { if (hidden.has(m.id)) continue; const el = new El(); el.classList.add('chat-msg'); el.dataset.msgId = m.id; list.append(el); v._elements.set(m.id, el); } };
    v.setWindow(s, e);
    v._fetchMessages = async (o, l) => { v.log.push(`fetch(${o},${l})`); if (v.gate) await v.gate.p; return C.slice(o, o + l); };
    v.jumpToIndex = async (idx, { land = null, stale = null } = {}) => { v.log.push(`jumpToIndex(${idx})`); v._lastNavAt = Date.now(); await (v.gate ? v.gate.p : null); /* the real one awaits its page read before it asks */ if (stale && stale()) { v.log.push('stale'); return; } const a = Math.max(0, idx - 20); v.setWindow(a, Math.min(C.length, a + 50)); if (land) land(null); };
    v.jumpToBottom = async () => { v.log.push('jumpToBottom'); v._lastNavAt = Date.now(); v.setWindow(C.length - 50, C.length); };
    v._noteUserNav = () => { v._lastNavAt = Date.now(); };
    v._navigatedSince = (t) => Math.max(v._lastNavAt || 0, v._lastPositionAt || 0) > t;
    v._setPinned = (p) => { v._pinned = !!p; };
    v._scrollElStable = (el) => v.log.push(`show(${(el.closest('chat-msg') || {}).dataset?.msgId}${el.getClientRects().length ? '' : ' — NO BOX'})`);
    v._scrollToBottom = () => v.log.push('scrollToBottom');
    v.revealRecord = (el) => { v.log.push('reveal'); el._box = true; return true; };
    v._updateRuns = () => { };
    return v;
  }
  const cardsOf = (v) => v._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card').map((c) => ({ id: c.dataset.item, at: c.parentNode.parentNode.dataset.msgId }));
  const cardsFor = (v, NC = NeedsCards) => {
    const nc = new NC(v);
    nc.keys = () => KEYS10;
    nc.render = function ({ hold = false } = {}) { this._pass({ hold }); };
    nc._create = function (e) { const c = new El(); c.dataset.item = e.item.id; this._patch(c, e); return c; };
    nc._patch = (c, e) => { c.className = `cn-card ${e.resolved ? 'cn-done' : 'cn-open'}${e.fold ? ' cn-fold' : ''}`; c._item = e.item; };
    nc._dockPass = (w) => { v.dock = { n: (w || []).length, ids: (w || []).map((e) => e.item.id) }; }; // (the strip's DOM is the chrome suite's — ⑰; here: what the pass hands it)
    return nc;
  };
  if (NeedsCards) {
    // M3: the owner's six — their records far above a tail window — through the REAL pass: ONE card, at the last record
    { const C = conv(300), six = [3, 9, 20, 41, 60, 77].map((k) => askOf(C, k));
      const v = fakeView(C, six, 250, 300), nc = cardsFor(v); nc._pass();
      const cs = cardsOf(v);
      ok(cs.length === 0 && !!v.dock && v.dock.n === 6 && v.dock.ids[0] === six[5].id, 'RED-able (r2 minor — the verdict\'s mutant M3, «every loose card at the end»: six; r1–r9: ONE docked under the last record; r10 — the owner\'s ruling): the REAL pass over the owner\'s six ⇒ NO card in the flow; the pass hands the strip all six, the newest first', { cs, dock: v.dock }); }
    // THE END IS THE DISPLAY ORDER'S: an older page loaded above the window (its records pushed AFTER the window's in the
    // insertion order, the order the view used to keep) — the dock stays under the LAST DISPLAYED record
    { const C = conv(300), three = [3, 9, 20].map((k) => askOf(C, k));
      const v = fakeView(C, three, 200, 300);
      v._messages = [...C.slice(250, 300), ...C.slice(200, 250)]; // insertion order: the tail, then the page above it
      v.loadedRecords = () => C.slice(200, 300);                  // the view's ordered accessor
      const nc = cardsFor(v); nc._pass();
      const cs = cardsOf(v);
      ok(cs.length === 0 && !!v.dock && v.dock.n === 3, 'RED-able (r2 #1 — 9de5c902: a card under c249, the older page\'s last record, mid-history; r1–r9: docked under c299): one page of older history loaded ⇒ still NO card anywhere in the flow (their records are older than what is loaded) — the strip holds the three', { cs, dock: v.dock }); }
    // A RECORD DRAWN AS NOTHING, through the real pass: the ask filed at the hidden record 290 stands at 291; the older one docks
    { const C = conv(300), a = askOf(C, 3), b = { ...askOf(C, 290), id: 'ut-askhidden' };
      const v = fakeView(C, [a, b], 250, 300, { hidden: new Set(['c290']) }), nc = cardsFor(v); nc._pass();
      const cs = cardsOf(v);
      ok(cs.some((c) => c.id === 'ut-askhidden' && c.at === 'c291') && !cs.some((c) => c.id === a.id) && !!v.dock && v.dock.n === 2, 'RED-able (r2 minor — 9de5c902: the hidden-anchored ask docked «further up», the other a chip row only): a card whose record is drawn as nothing stands at the next drawn record (c291); the ask with no record here is in the flow nowhere (r10 — the strip holds both)', { cs, dock: v.dock }); }
    // BOTH DIRECTIONS, through the real landing: the chip's walk — the oldest first (the window loads at 0..50), then the next
    { const C = conv(310, [10, 150]), A10 = askOf(C, 10), A150 = askOf(C, 150);
      const v = fakeView(C, [A10, A150], 0, 50), nc = cardsFor(v);
      const res = await nc.land(A150.id);
      ok(res === 'card' && v.log.includes('jumpToIndex(150)') && v.log.includes('show(c150)') && !v.log.includes('jumpToBottom'), 'RED-able (r2 #2 — 9de5c902: «dock · jumpToBottom», «asked before this conversation\'s record was kept»): from a window loaded at the top (0..50), an ask filed BELOW it lands AT its record — read down, the window loaded there', { res, log: v.log });
      const v2 = fakeView(C, [A10, A150], 20, 70), nc2 = cardsFor(v2);
      const res2 = await nc2.land(A150.id);
      ok(res2 === 'card' && v2.log.includes('jumpToIndex(150)') && v2.log.includes('show(c150)'), '…and from a window loaded mid-history (20..70)', { res: res2, log: v2.log });
      const v3 = fakeView(C, [A10, A150], 260, 310), nc3 = cardsFor(v3);
      const res3 = await nc3.land(A10.id);
      ok(res3 === 'card' && v3.log.includes('jumpToIndex(10)') && v3.log.includes('show(c10)'), '…and upward from the tail (the control: r1\'s road unchanged)', { res: res3, log: v3.log }); }
    // THE DISPLACEMENT LAW, through the real landing: a slow read (its page held), then a NEWER press / the reader's own move
    { const C = conv(310, [10, 290]), A10 = askOf(C, 10), A290 = askOf(C, 290);
      const v = fakeView(C, [A10, A290], 260, 310), nc = cardsFor(v);
      v.gate = deferred();
      const first = nc.land(A10.id);           // press 1: its read upward waits
      await new Promise((r) => setTimeout(r, 5));
      v.gate.open(); v.gate = null;            // (the newer press below reads nothing)
      const g2 = deferred(); v.gate = g2;      // hold press 1's next page
      const second = await nc.land(A290.id);   // press 2, the person's latest choice: its card on screen
      g2.open(); v.gate = null;
      const r1 = await first;
      ok(second === 'card' && r1 === null && !v.log.includes('jumpToIndex(10)') && v._windowStart === 260 && cardsOf(v).some((c) => c.id === A290.id && c.at === 'c290'), 'RED-able (r2 #3 — 9de5c902: the stale read finished and jumpToIndex(10) dragged the view to 0..50): the LATEST press stands — the older landing\'s read may finish, its jump never fires', { second, r1, log: v.log, ws: v._windowStart });
      const v2 = fakeView(C, [A10, A290], 260, 310), nc2 = cardsFor(v2);
      const g = deferred(); v2.gate = g;
      const p = nc2.land(A10.id);
      await new Promise((r) => setTimeout(r, 5));
      v2._lastPositionAt = Date.now() + 5;    // the reader's own wheel, while the read is out
      g.open(); v2.gate = null;
      const r2 = await p;
      ok(r2 === null && !v2.log.includes('jumpToIndex(10)') && v2._windowStart === 260, '…and the reader\'s own move (a wheel) while the read is out cancels it the same way', { r2, log: v2.log });
      const v3 = fakeView(C, [A10, A290], 260, 310), nc3 = cardsFor(v3);
      const r3 = await nc3.land(A10.id, { since: Date.now() - 1000 }).then((x) => x, () => 'threw');
      v3._lastPositionAt = 0;
      const v4 = fakeView(C, [A10, A290], 260, 310), nc4 = cardsFor(v4); v4._lastPositionAt = Date.now();
      const r4 = await nc4.land(A10.id, { since: Date.now() - 1000 });
      ok(r3 === 'card' && r4 === null && !v4.log.length, '…a For-you door\'s press time: a move the reader made after it (while the window opened) cancels the landing before it starts', { r3, r4, log: v4.log }); }
    // A LANDING UNFOLDS WHAT IT LANDS ON (the r1 reviewer's resolved door): the quiet record of an answered ask, its record
    // folded in a closed run (no box)
    { const C = conv(300, [280]), done = { ...askOf(C, 280), status: 'done', resolvedBy: 'allowed' };
      const v = fakeView(C, [], 250, 300, { resolved: [done] });
      v._elements.get('c280')._box = false;    // the run fold: display:none
      const nc = cardsFor(v);
      const res = await nc.land(done.id);
      ok(res === 'card' && v.log.indexOf('reveal') >= 0 && v.log.indexOf('reveal') < v.log.indexOf('show(c280)') && v._elements.get('c280').getClientRects().length > 0, 'RED-able (r2 #4 — 9de5c902: landed on a box-less record, «card» with nothing visible): the door of an answered ask whose record is folded OPENS the run, then lands', { res, log: v.log });
      const v2 = fakeView(C, [], 250, 300, { resolved: [done] });
      v2._elements.get('c280')._box = false; v2.revealRecord = (el) => { v2.log.push('reveal'); return false; }; // a record that stays without a box
      const nc2 = cardsFor(v2);
      const res2 = await nc2.land(done.id);
      ok(res2 !== 'card' && !v2.log.some((l) => /NO BOX/.test(l)), '…a target that still has no box is never landed on (9de5c902 scrolled to it: the list ran to scrollTop 0)', { res: res2, log: v2.log }); }
    // ── ⑩c THE TAIL, ROUND 3 (the r2 delta verdict on ed660f19): EVERY road a landing takes obeys the displacement law — the
    // REAL jumpToBottom / jumpToIndex / _releaseTailHold / revealRecord (their source, out of src/lib/chat-view.js, bound
    // to the fake view: the r2 legs' fake jumps proved only that land() asks; the tail road's real jump never did); a record
    // the read finds IN the window is a hit; a failed show leaves no mark
    console.log('⑩c THE TAIL r3 — every road a landing takes obeys the displacement law (the REAL jumps); a record the read finds in the window is a hit; a failed show leaves no mark');
    const CVS = read('src/lib/chat-view.js');
    const method = (head, next) => {
      const a = CVS.indexOf(head), b = a < 0 ? -1 : CVS.indexOf(next, a);
      if (a < 0 || b < 0) return null;
      const src = CVS.slice(a, b).trim().replace(/^async (\w+)\(/, 'async function $1(').replace(/^(\w+)\(/, 'function $1(');
      try { return new Function('t', `return (${src});`)((s) => String(s)); } catch { return null; }
    };
    const REAL = { jumpToBottom: method('  async jumpToBottom(', '  /** Replay the live ops a tail fetch held'), _releaseTailHold: method('  _releaseTailHold(hold) {', '  /** A FULL-WINDOW REBUILD LANDED'), jumpToIndex: method('  async jumpToIndex(', '  // Jump to the bottom of the conversation.'), revealRecord: method('  revealRecord(el) {', '  /** THE WAITING CHIP') };
    const ACTS = method('  _readerActs(', '  /** Is an atBottom→false transition'); // (r5; absent before it — its jumpToBottom read the stamps inline)
    ok(Object.values(REAL).every((f) => typeof f === 'function'), 'the REAL jumpToBottom, _releaseTailHold, jumpToIndex and revealRecord are read out of src/lib/chat-view.js', Object.keys(REAL).filter((k) => typeof REAL[k] !== 'function'));
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    /** the view's own roads: the REAL jumps over the fake view's records (a tail page held by `tailGate`, a jump's page by `jumpGate`) */
    const roads = (v, C, hidden = new Set()) => {
      const draw = (m) => { v._messages.push(m); v._renderedMsgIds.add(m.id); if (hidden.has(m.id)) return; const el = new El(); el.classList.add('chat-msg'); el.dataset.msgId = m.id; v._messageList.append(el); v._elements.set(m.id, el); };
      Object.assign(v, { _renderedMsgIds: new Set(), _tailCall: 0, _tailHold: null, _windowGen: 0, _search: null, tailGate: null, jumpGate: null,
        _onCreateMessage: draw, _resetGapAfterJump() { }, _trace(k) { v.log.push(`trace:${k}`); }, _traceExpect() { }, _showHistoryStatus(m) { v.log.push(`status:${m}`); }, _onOp() { },
        _beginHistoryLoad: () => () => { }, _forceScrollToBottom() { v.log.push('forceScrollToBottom'); },
        _noteUserNav(via) { v._lastNavAt = Date.now(); v.log.push(`nav:${via}`); },
        _setPinned(p, why) { v._pinned = !!p; v.log.push(`pinned=${!!p}(${why})`); },
        _fetchMessagePage: async (o, l) => { v.log.push(`fetchPage(${o},${l})`); if (v.tailGate) await v.tailGate.p; return { messages: C.slice(o, o + l), total: C.length }; },
        _fetchMessages: async (o, l) => { v.log.push(`fetch(${o},${l})`); if (v.jumpGate && v.log.includes('nav:jumpToIndex')) await v.jumpGate.p; return C.slice(o, o + l); } });
      v.jumpToBottom = function (o) { v.log.push('jumpToBottom(REAL)'); return REAL.jumpToBottom.call(this, o); };
      v._releaseTailHold = REAL._releaseTailHold; v.jumpToIndex = REAL.jumpToIndex;
      if (ACTS) v._readerActs = ACTS; // r5: THE one list of reader-act stamps — the REAL jumpToBottom's default reads it
      v._renderedMsgIds = new Set(v._messages.map((m) => m.id));
      return v;
    };
    // THE TAIL ROAD (r3 #1, the verdict's H2 / tail-race H4 / real-jtb A+B): press 1 = an ask with no record (the read up to
    // −1, then ④'s jumpToBottom, its tail page held); press 2, while it is out = an ask whose card stands at c120
    { const C = conv(310, [120]), X = { ...askOf(C, 0), id: 'ut-norecord01', createdAt: C[0].ts - 3 * 3600e3, text: 'filed before the record' }, Y = askOf(C, 120);
      const v = roads(fakeView(C, [X, Y], 100, 150), C), nc = cardsFor(v);
      nc._pass();
      v.tailGate = deferred();
      const first = nc.land(X.id);
      for (let i = 0; i < 60 && !v.log.includes('jumpToBottom(REAL)'); i++) await tick(2);
      const second = await nc.land(Y.id);
      v.tailGate.open(); v.tailGate = null;
      const r1 = await first;
      ok(second === 'card' && r1 === null && v._windowStart === 100 && cardsOf(v).some((c) => c.id === Y.id && c.at === 'c120') && !v._pinned && !v.log.includes('forceScrollToBottom') && v.log.includes('trace:jumpToBottom:stale'), 'RED-able (r3 #1 — ed660f19: press 1\'s tail fetch replaced the window, 260..310, pinned, no card anywhere): the LATEST press stands — the older landing\'s tail read may finish, the REAL jumpToBottom asks `stale` before it replaces anything', { second, r1, ws: v._windowStart, cards: cardsOf(v), log: v.log });
      // the reader's own wheel while a landing's tail fetch is out
      const v2 = roads(fakeView(C, [X, Y], 100, 150), C), nc2 = cardsFor(v2);
      v2.tailGate = deferred();
      const p2 = nc2.land(X.id);
      for (let i = 0; i < 60 && !v2.log.includes('jumpToBottom(REAL)'); i++) await tick(2);
      await tick(3); v2._lastPositionAt = Date.now();
      v2.tailGate.open(); v2.tailGate = null;
      const r2 = await p2;
      ok(r2 === null && v2._windowStart === 100 && !v2.log.includes('forceScrollToBottom') && v2.log.includes('trace:jumpToBottom:stale'), 'RED-able (r3 #1 — ed660f19: the wheel was yanked to the tail, pinned): the reader\'s own wheel while the tail fetch is out ⇒ the fetch\'s result is dropped', { r2, ws: v2._windowStart, log: v2.log });
      // the control: press 1 alone takes the tail road to its end — the REAL jump lands the dock (its `land`, no forced scroll)
      const v3 = roads(fakeView(C, [X, Y], 100, 150), C), nc3 = cardsFor(v3);
      const r3 = await nc3.land(X.id);
      ok(r3 === 'end' && v3._windowStart === 260 && !cardsOf(v3).some((c) => c.id === X.id) && globalThis.__cnToasts.some((x) => /Asked before this conversation's record was kept/.test(x)), '…the control: press 1 alone — the tail loaded, the landing ends at the live END and says the ask has no record (r10: never docked into the flow — r1–r9 docked X under c309)', { r3, ws: v3._windowStart, cards: cardsOf(v3), toasts: globalThis.__cnToasts, log: v3.log }); }
    // r11 THE DOCK MARKED (the r10 acceptance: a read that came back UNKNOWN landed at the live end SILENTLY — r6 docked and
    // flashed the card there): an open card that ends at the live end with no card drawn marks the strip where it waits; one
    // the read PROVED has no record is marked AND said
    { const C = conv(310, [10]), A = askOf(C, 10), X = { ...askOf(C, 0), id: 'ut-norecord02', createdAt: C[0].ts - 3 * 3600e3, text: 'filed before the record' };
      const strip = () => { const d = new El(); DOC.children.push(d); d.parentNode = DOC; d.hidden = false; return d; };
      const failing = async function (o, l) { this.log.push(`fetch(${o},${l})`); throw new Error('500'); }; // a page that fails ⇒ the read is UNKNOWN
      const v = roads(fakeView(C, [A], 260, 310), C), nc = cardsFor(v); v._attnDock = strip(); v._fetchMessages = failing.bind(v);
      globalThis.__cnToasts = []; nc._pass();
      const res = await nc.land(A.id);
      ok(res === 'end' && v._attnDock.classList.contains('cad-mark') && !globalThis.__cnToasts.length && v.log.includes('scrollToBottom'), 'RED-able (r11 — 7ec6c6dcf: «end», the strip unmarked, nothing said): an open card whose read came back UNKNOWN (a page that failed) ends at the live end and MARKS the strip where it waits (the ask flash, its count in the fill) — never silent', { res, mark: v._attnDock.className, toasts: globalThis.__cnToasts, log: v.log.slice(-5) });
      clearTimeout(nc._dockMarkT);
      const v2 = roads(fakeView(C, [X], 260, 310), C), nc2 = cardsFor(v2); v2._attnDock = strip();
      globalThis.__cnToasts = []; nc2._pass();
      const r2 = await nc2.land(X.id);
      ok(r2 === 'end' && v2._attnDock.classList.contains('cad-mark') && globalThis.__cnToasts.some((x) => /Asked before this conversation's record was kept/.test(x)), 'RED-able (r11 — 7ec6c6dcf: said, the strip unmarked): …one the read PROVED has no record: marked AND said', { r2, mark: v2._attnDock.className, toasts: globalThis.__cnToasts });
      clearTimeout(nc2._dockMarkT);
      const v3 = roads(fakeView(C, [A], 260, 310), C), nc3 = cardsFor(v3); v3._attnDock = strip(); v3._attnDock.hidden = true; v3._fetchMessages = failing.bind(v3);
      nc3._pass();
      const r3 = await nc3.land(A.id);
      ok(r3 === 'end' && !v3._attnDock.classList.contains('cad-mark'), '…the control: a strip that is not shown is never marked (nothing to point at)', { r3, mark: v3._attnDock.className });
      globalThis.__cnToasts = []; }
    // THE INDEX ROAD, the REAL jumpToIndex: press 1's read is done and its jump's page is out when press 2 lands
    { const C = conv(310, [10, 290]), A10 = askOf(C, 10), A290 = askOf(C, 290);
      const v = roads(fakeView(C, [A10, A290], 260, 310), C), nc = cardsFor(v);
      v.jumpGate = deferred();
      const first = nc.land(A10.id);
      for (let i = 0; i < 60 && !v.log.includes('nav:jumpToIndex'); i++) await tick(2);
      const second = await nc.land(A290.id);
      v.jumpGate.open(); v.jumpGate = null;
      const r1 = await first;
      ok(v.log.includes('nav:jumpToIndex') && second === 'card' && r1 === null && v._windowStart === 260 && v.log.includes('trace:jumpToIndex:stale') && cardsOf(v).some((c) => c.id === A290.id && c.at === 'c290'), 'the REAL jumpToIndex: an older landing whose page is out when a newer press lands replaces nothing (r2\'s guard, now driven through the real jump)', { second, r1, ws: v._windowStart, log: v.log }); }
    // A RECORD THE READ FINDS IN THE WINDOW IS A HIT (r3 minor, the verdict's H4): the window 100..150 ends at the CLI call that
    // filed it (c149), filed 1.2 s later — no loaded record lies past the filing, so the pass cannot place it alone
    { const C = conv(310, [149]), A = askOf(C, 149);
      const v = roads(fakeView(C, [A], 100, 150), C), nc = cardsFor(v);
      nc._pass();
      const before = cardsOf(v);
      globalThis.__cnToasts = [];
      const res = await nc.land(A.id);
      ok(!before.length && res === 'card' && cardsOf(v).some((c) => c.id === A.id && c.at === 'c149') && !globalThis.__cnToasts.length && !v.log.includes('jumpToBottom(REAL)') && v._windowStart === 100, 'RED-able (r3 minor — ed660f19: «The record that filed it is not drawn in this chat», then the tail road, docked under c309): the read DOWN proves the filing is IN the window ⇒ a HIT — the card stands at c149, no toast, the window stays', { before, res, toasts: globalThis.__cnToasts, ws: v._windowStart, cards: cardsOf(v), log: v.log });
      nc._pass();
      ok(cardsOf(v).some((c) => c.id === A.id && c.at === 'c149'), '…and the next pass keeps it there (the record the read proved — a fact of the transcript, kept while the ask is listed)', cardsOf(v)); }
    // A FAILED SHOW LEAVES NO MARK (r3 minor, the verdict's H3 / claim 2's timing-dependent defect): a pinned tail window; the
    // ask's record has no box and no run to open (hidden by CSS) — with a pass that takes 0 ms and one that takes 2 ms
    for (const passMs of [0, 2]) {
      const C = conv(300, [280]), Z = askOf(C, 280);
      const v = fakeView(C, [Z], 250, 300), nc = cardsFor(v);
      v._elements.get('c280')._box = false; v.revealRecord = (el) => { v.log.push('reveal'); return false; };
      nc.render = function ({ hold = false } = {}) { const t0 = Date.now(); while (Date.now() - t0 < passMs); this._pass({ hold }); };
      nc._pass();
      globalThis.__cnToasts = [];
      const res = await nc.land(Z.id);
      ok(res === null && globalThis.__cnToasts.includes('The record that filed it is not drawn in this chat') && v._pinned === true && !v.log.some((l) => /^show\(|scrollToBottom/.test(l)), `RED-able (r3 minor — ed660f19: unpinned${passMs ? ', and silent: its own stamp read as the reader\'s move' : ''}): a target with no box ⇒ the landing SAYS so, the pinned reader stays pinned, nothing scrolls (a ${passMs} ms pass)`, { res, toasts: globalThis.__cnToasts, pinned: v._pinned, log: v.log });
    }
    // …and the REAL revealRecord: a run it opened for a record that still has no box closes again
    { const host = new El(); host.classList.add('chat-msg'); host._box = false; const list = new El(); list.append(host); DOC.children.push(list); list.parentNode = DOC;
      const rv = { _runs: [{ open: false, members: [host] }], opened: [], _setRunOpen(run, o) { run.open = o; this.opened.push(o); } };
      const drawn = REAL.revealRecord ? REAL.revealRecord.call(rv, host) : null;
      ok(drawn === false && rv._runs[0].open === false && rv.opened.join() === 'true,false', 'RED-able (r3 minor — ed660f19: the run stayed open): the REAL revealRecord closes a run it opened for a record that is still not drawn', { drawn, opened: rv.opened }); }
    // ── ⑩d THE TAIL, ROUND 4 (the r3 delta verdict on b3fef024): THE PROOF TRAVELS WITH THE LANDING (a notice, an answered ask
    // the pass does not list) and is the FILING's (a re-filed ask); A ROAD THAT FAILS MOVES NOTHING (the index road's failed
    // show, a failed tail page — said once, no scroll, no pick); THE LAW BOTH WAYS (the ↓ pressed before a landing, the resume
    // re-tail in flight); a stale page's total is not applied; the accordion's slot moves only for a show that lands; a stale
    // landing's held ops replayed once each and its failure said by nobody (the acceptance's two mutants)
    console.log('⑩d THE TAIL r4 — the proof travels with the landing and is the filing\'s; a road that fails moves nothing; the law both ways; a stale page\'s total is not applied; the slot moves only for a show that lands');
    const REAL4 = { _fetchMessagePage: method('  async _fetchMessagePage(', '  // ── History-load transition'), _onOp: method('  _onOp(op) {', '  // Create a new normalized message') };
    const DEFER = /if \(!this\._loadingHistory && \(this\._teleported \|\| \(!this\._pinned && this\._windowEnd < this\._total\)\)\) \{\n\s+this\._total\+\+;/.test(CVS);
    ok(Object.values(REAL4).every((f) => typeof f === 'function') && DEFER, 'the REAL _fetchMessagePage and _onOp are read out of src/lib/chat-view.js (and _onCreateMessage\'s deferral — a live create while the view reads history counts `_total++` — is the line the legs below mirror)', { real: Object.keys(REAL4).filter((k) => typeof REAL4[k] !== 'function'), DEFER });
    const rejecting = () => { let fail; const p = new Promise((_, r) => { fail = r; }); p.catch(() => { }); return { p, open: () => fail(new Error('the tail page failed')) }; };
    const until = async (v, re) => { for (let i = 0; i < 80 && !v.log.some((l) => re.test(l)); i++) await tick(2); };
    const NOREC = (C) => ({ ...askOf(C, 0), id: 'ut-norecord01', createdAt: C[0].ts - 3 * 3600e3, text: 'filed before the record' });
    // THE PROOF TRAVELS WITH THE LANDING (r4 #2): a NOTICE (needOf ⇒ null: never listed) and an answered ask past the
    // snapshot's resolved tail, their filing call the window's last record (c149, filed 1.2 s later)
    { const C = conv(310, [149]);
      const N = { ...askOf(C, 149), id: 'ut-notice00149', kind: 'notice', text: 'FYI at 149' };
      const v = roads(fakeView(C, [N], 100, 150), C), nc = cardsFor(v);
      nc._pass(); globalThis.__cnToasts = [];
      const res = await nc.land(N.id);
      ok(res === 'record' && v.log.includes('show(c149)') && !v.log.includes('jumpToBottom(REAL)') && v._windowStart === 100 && !globalThis.__cnToasts.length, 'RED-able (r4 #2 — b3fef024: here()\'s own pass pruned the proof, the tail road 260..310, force-scrolled): a NOTICE whose filing call ends the window — the read proves c149 IN the window ⇒ it lands there', { res, ws: v._windowStart, log: v.log });
      const R = { ...askOf(C, 149), id: 'ut-oldresolved1', status: 'done', resolvedBy: 'allowed' };
      const v2 = roads(fakeView(C, [], 100, 150), C), nc2 = cardsFor(v2);
      nc2._pass();
      const res2 = await nc2.land(R);
      ok(res2 === 'record' && v2.log.includes('show(c149)') && !v2.log.includes('jumpToBottom(REAL)') && v2._windowStart === 100, 'RED-able (r4 #2): …and an answered ask past the resolved tail (a For-you door passes the item) lands at c149, never the tail', { res: res2, ws: v2._windowStart, log: v2.log }); }
    // THE PROOF IS THE FILING'S (r4 #3): landed in the window (proved → c149), answered, then RE-FILED under the same id by a
    // new call at c300 (user-todos.js «REOPENS the same item» — a new createdAt)
    { const C = conv(310, [149, 300]), X = askOf(C, 149);
      const v = roads(fakeView(C, [X], 100, 150), C), nc = cardsFor(v), model = v.app.__model;
      const r1 = await nc.land(X.id);
      model.todos = { open: [], resolved: [{ ...X, status: 'done', resolvedBy: 'replied', resolvedAt: NOW }] }; nc._pass();
      const X2 = { ...X, createdAt: C[300].ts + 1200 };
      model.todos = { open: [X2], resolved: [] }; model.byId = (id) => (id === X2.id ? X2 : null); nc._pass();
      const before = cardsOf(v); v.log.length = 0;
      const r2 = await nc.land(X2.id);
      ok(r1 === 'card' && !before.some((c) => c.id === X.id && c.at === 'c149') && r2 === 'card' && v.log.includes('nav:jumpToIndex') && v.log.includes('show(c300)') && !v.log.includes('show(c149)'), 'RED-able (r4 #3 — b3fef024, a regression against ed660f19: the reopened ask stood at the OLD filing c149 and landed there with no read): the proof is the FILING\'s — the re-filed ask reads toward its new call and lands at c300', { r1, before, r2, log: v.log }); }
    // A SHOW THAT FAILS ON THE INDEX ROAD PUTS BACK WHAT THE JUMP CHANGED (r4 minor): a pinned tail window; the ask's record
    // c10 above it has, once loaded, no box (a CSS rule — B-2adb's shape) and no run to open
    { const C = conv(310, [10]), A = askOf(C, 10);
      const v = roads(fakeView(C, [A], 260, 310), C), nc = cardsFor(v);
      const draw0 = v._onCreateMessage;
      v._onCreateMessage = (m) => { draw0(m); const el = v._elements.get(m.id); if (el && m.id === 'c10') el._box = false; };
      v.revealRecord = () => { v.log.push('reveal'); return false; };
      v._pinned = true; nc._pass(); globalThis.__cnToasts = [];
      const res = await nc.land(A.id);
      ok(res === null && v._windowStart === 260 && v._windowEnd === 310 && v._pinned === true && globalThis.__cnToasts.length === 1 && !v.log.some((l) => /^show\(/.test(l)), 'RED-able (r4 minor — b3fef024: left at records 0..50, unpinned, unpositioned, only a toast): a show that fails on the INDEX road puts back what the jump changed — the pinned reader at the live tail again (260..310, pinned), one toast', { res, ws: v._windowStart, we: v._windowEnd, pinned: v._pinned, toasts: globalThis.__cnToasts, log: v.log }); }
    // THE LAW BOTH WAYS (r4 minor): the resume re-tail's page in flight (jumpToBottom({user:false}), as reTail calls it) when a
    // door's landing lands on the card at c120
    { const C = conv(310, [120]), Y = askOf(C, 120);
      const v = roads(fakeView(C, [Y], 100, 150), C), nc = cardsFor(v);
      nc._pass(); v.tailGate = deferred();
      const retail = v.jumpToBottom({ user: false });
      await until(v, /^fetchPage/); await tick(3); // (a stamp is a time: a person's act never lands in the call's own millisecond)
      const landed = await nc.land(Y.id, { since: Date.now() - 50 });
      v.tailGate.open(); v.tailGate = null;
      const moved = await retail;
      ok(landed === 'card' && moved === false && v._windowStart === 100 && !v._pinned && cardsOf(v).some((c) => c.id === Y.id && c.at === 'c120') && v.log.includes('trace:jumpToBottom:stale'), 'RED-able (r4 minor — b3fef024: the re-tail\'s page answered after the landing and rebuilt the window at the tail, pinned, the card gone): an automatic tail fetch in flight when a landing lands drops its page', { landed, moved, ws: v._windowStart, pinned: v._pinned, log: v.log }); }
    // …the ↓ pressed BEFORE a landing (the ↓ road: jumpToBottom() — a window paged out of the tail refetches it), then the
    // ↓ pressed AFTER a landing's tail page went out (the control: the ↓ is the newest, it wins)
    { const C = conv(310, [120]), X = NOREC(C), Y = askOf(C, 120);
      const v = roads(fakeView(C, [X, Y], 100, 150), C), nc = cardsFor(v);
      v._pinned = false; nc._pass(); v.tailGate = deferred();
      const down = v.jumpToBottom();
      await until(v, /^fetchPage/); await tick(3);
      const landed = await nc.land(Y.id);
      v.tailGate.open(); v.tailGate = null;
      const moved = await down;
      ok(landed === 'card' && moved === false && v._windowStart === 100 && !v._pinned && cardsOf(v).some((c) => c.id === Y.id && c.at === 'c120') && !v.log.includes('forceScrollToBottom'), 'RED-able (r4 minor — b3fef024: the older ↓\'s tail replaced the newer landing, 260..310, pinned): the ↓ pressed BEFORE a landing — the newer landing stands, the ↓\'s page is dropped', { landed, moved, ws: v._windowStart, pinned: v._pinned, log: v.log });
      const v2 = roads(fakeView(C, [X, Y], 100, 150), C), nc2 = cardsFor(v2);
      v2._pinned = false; nc2._pass(); v2.tailGate = deferred();
      const p = nc2.land(X.id);
      await until(v2, /^fetchPage/); await tick(3);
      const down2 = v2.jumpToBottom();
      v2.tailGate.open(); v2.tailGate = null;
      const [r, m2] = await Promise.all([p, down2]);
      ok(r === null && v2._windowStart === 260 && v2._pinned === true && v2.log.includes('trace:tailStale'), '…the control: the ↓ pressed AFTER a landing\'s tail page went out still wins — pinned at the live tail, the landing dropped', { r, m2, ws: v2._windowStart, pinned: v2._pinned, log: v2.log }); }
    // A FAILED TAIL PAGE (not stale) MOVES NOTHING (r4 minor — the acceptance's H-D): said ONCE, no scroll, no pick kept
    { const C = conv(310, [120]), X = NOREC(C), Y = askOf(C, 120);
      const v = roads(fakeView(C, [X, Y], 100, 150), C), nc = cardsFor(v);
      v._pinned = false; nc._pass();
      v.tailGate = rejecting();
      const p = nc.land(X.id);
      await until(v, /^fetchPage/);
      v.tailGate.open(); v.tailGate = null;
      const r = await p;
      const said = v.log.filter((l) => l === 'status:Couldn\'t load the latest messages');
      ok(r === null && said.length === 1 && v._windowStart === 100 && !v.log.includes('forceScrollToBottom') && !v.log.includes('scrollToBottom') && v._tailHold === null, 'RED-able (r4 minor — b3fef024: «end» — the mid-history window scrolled to its bottom): a tail page that FAILS is said ONCE and moves nothing — no scroll, the hold released', { r, said, ws: v._windowStart, log: v.log }); }
    // A STALE LANDING'S FAILURE IS SAID BY NOBODY (the acceptance's mutant c1e — the catch without its stale branch)
    { const C = conv(310, [120]), X = NOREC(C), Y = askOf(C, 120);
      const v = roads(fakeView(C, [X, Y], 100, 150), C), nc = cardsFor(v);
      nc._pass(); v.tailGate = rejecting();
      const p = nc.land(X.id);
      await until(v, /^fetchPage/);
      const second = await nc.land(Y.id);
      v.tailGate.open(); v.tailGate = null;
      const r = await p;
      ok(second === 'card' && r === null && !v.log.some((l) => /^status:/.test(l)) && v._tailHold === null && v._windowStart === 100, 'mutant-pin (the acceptance\'s c1e): a STALE landing whose tail page fails says nothing — the newer press stands, the hold released', { second, r, log: v.log }); }
    // A STALE PAGE'S TOTAL IS NOT APPLIED; A STALE LANDING'S HELD OPS REPLAYED ONCE EACH (r4 minor — the acceptance's (d), and
    // its mutant c1d — the stale branch without _releaseTailHold): the REAL _fetchMessagePage (over a stubbed `fetch`) and the
    // REAL _onOp; a live turn of 7 creates arrives while press 1's tail page is out (the server +7), press 2 lands first
    { const C = conv(310, [120]), X = NOREC(C), Y = askOf(C, 120), S = C.slice();
      const v = roads(fakeView(C, [X, Y], 100, 150), C), nc = cardsFor(v);
      v._pinned = false; nc._pass();
      let gate = deferred();
      const fetch0 = globalThis.fetch;
      globalThis.fetch = async (url) => { const q = new URL(url, 'http://x').searchParams, o = +q.get('offset'), l = +q.get('limit'); v.log.push(`fetchPage(${o},${l})`); if (gate) await gate.p; return { ok: true, json: async () => ({ messages: S.slice(o, o + l), total: S.length }) }; };
      const draw = v._onCreateMessage, applied = [];
      Object.assign(v, { _fetchMessagePage: REAL4._fetchMessagePage, _onOp: REAL4._onOp, _getSessionIds: () => ({ backend: 'claude', backendSessionId: 'x', cwd: '/w', host: '' }), _noteRecordKind() { }, _newMsgCount: 0,
        _onCreateMessage: (m) => { if (!v._loadingHistory && (v._teleported || (!v._pinned && v._windowEnd < v._total))) { v._total++; v._newMsgCount++; applied.push(m.id); return; } draw(m); } }); // the real deferral (pinned above)
      const total0 = v._total;
      try {
        const p = nc.land(X.id);
        await until(v, /^fetchPage\(260/);
        for (let k = 0; k < 7; k++) { const m = { id: `live${k}`, ts: NOW + k, role: 'assistant', content: [{ type: 'text', text: 'live' }] }; S.push(m); v._onOp({ op: 'create', message: m }); }
        const held = v._tailHold ? v._tailHold.ops.length : -1;
        const second = await nc.land(Y.id);
        gate.open(); gate = null;
        const r1 = await p;
        ok(held === 7 && second === 'card' && r1 === null && v._tailHold === null && applied.join() === 'live0,live1,live2,live3,live4,live5,live6' && v.log.includes('trace:jumpToBottom:stale'), 'mutant-pin (the acceptance\'s c1d): a STALE landing\'s 7 held creates are replayed ONCE each, in order, onto the window that stays — the hold released', { held, second, r1, hold: v._tailHold, applied, log: v.log });
        ok(v._total - total0 === S.length - C.length && v._newMsgCount === 7, `RED-able (r4 minor — b3fef024: +14 for the server's +7 — the stale tail page's total applied, then each replayed create counted again): the window that stays counts +${v._total - total0} for the server's +${S.length - C.length}`, { total0, total: v._total, server: S.length, badge: v._newMsgCount });
      } finally { globalThis.fetch = fetch0; }
    }
    // THE ACCORDION MOVES ONLY FOR A SHOW THAT LANDS (r4 minor — the acceptance's C1b): the open card at c290; the landing on
    // the folded one at c280, its record with no box (a CSS rule) — the show fails
    { const C = conv(300, [280, 290]), Z = askOf(C, 280), A = askOf(C, 290);
      const v = fakeView(C, [Z, A], 250, 300), nc = cardsFor(v);
      nc._pass();
      const folds = () => v._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card').map((c) => `${c.dataset.item}:${c.classList.contains('cn-fold') ? 'fold' : 'open'}`).sort().join();
      const was = folds(), slot0 = nc._slot;
      v._elements.get('c280')._box = false; v.revealRecord = () => false;
      globalThis.__cnToasts = [];
      const res = await nc.land(Z.id);
      ok(res === null && globalThis.__cnToasts.length === 1 && folds() === was && nc._slot === slot0 && /ut-ask0000290:open/.test(was), 'RED-able (r4 minor — b3fef024: the slot moved before the show — the open card at c290 folded, the box-less target unfolded): a show that fails leaves the accordion as it was', { res, was, now: folds(), slot0, slot: nc._slot });
      v._elements.get('c280')._box = true; v.revealRecord = (el) => { el._box = true; return true; };
      const res2 = await nc.land(Z.id);
      ok(res2 === 'card' && nc._slot === Z.id && /ut-ask0000280:open/.test(folds()) && /ut-ask0000290:fold/.test(folds()), '…and a show that lands takes the slot: the landed card open, the other folded', { res2, now: folds(), slot: nc._slot }); }
    // ── ⑩e THE TAIL, ROUND 5 (the r4 delta verdict on 497beb03): A REPLAY IS NOBODY'S ACT — chat-view-seek's c-v restore re-runs
    // the last search reveal (or jump target) 1.6 s after a teleport; it wrote the reveal's stamps and a navigation, and r4's
    // default stale dropped a ↓ or a send pressed in that window — through the REAL _setStableHeights / _scrollElStable
    // (chat-view-seek.js), the REAL _scrollToRange (chat-search.js) and the REAL _noteUserNav / _navigatedSince / _readerActs /
    // jumpToBottom (chat-view.js); A SEND IS THE PERSON'S ACT (B-172e — a touch on the list during its fetch dropped it); ④'s
    // tail road puts back; the put-back re-opens the run the reader was reading inside
    console.log('⑩e THE TAIL r5 — a replay is nobody\'s act (one list of reader-act stamps); a send lands whatever the scroll; the tail road puts back; the put-back re-opens the reader\'s run');
    const SEEKS = read('src/lib/chat-view-seek.js'), SRCH = read('src/lib/chat-search.js');
    const methodOf = (SRC, head, next) => {
      const a = SRC.indexOf(head), b = a < 0 ? -1 : SRC.indexOf(next, a);
      if (a < 0 || b < 0) return null;
      const src = SRC.slice(a, b).trim().replace(/,$/, '').replace(/^async (\w+)\(/, 'async function $1(').replace(/^(\w+)\(/, 'function $1(');
      try { return new Function('t', `return (${src});`)((s) => String(s)); } catch { return null; }
    };
    const REAL5 = { _setStableHeights: methodOf(SEEKS, '    _setStableHeights(stable, ', '    _maybeSeekLater() {'), _scrollElStable: methodOf(SEEKS, '    _scrollElStable(el, ', '    async _seekTeleport(line) {'),
      _scrollToRange: methodOf(SRCH, '  _scrollToRange(range', '  /** Open every collapsed'), _noteUserNav: method('  _noteUserNav(via) {', '  /** Did the READER position'),
      _navigatedSince: method('  _navigatedSince(since) {', '  /** '), _notePositioning: method('  _notePositioning(via) {', '  /** Did this press land on the list') };
    ok(Object.values(REAL5).every((f) => typeof f === 'function'), 'the REAL _setStableHeights / _scrollElStable (chat-view-seek.js), _scrollToRange (chat-search.js), _noteUserNav / _navigatedSince / _notePositioning (chat-view.js) are read out of the sources', Object.keys(REAL5).filter((k) => typeof REAL5[k] !== 'function'));
    /** a teleported search slab: the REAL stamp writers and the REAL tail jump over a fake list (the tail page held by `tailGate`) */
    const replayView = (C) => {
      const log = [], cls = new Set(['chat-no-content-visibility']), rect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
      const list = { scrollTop: 0, scrollHeight: 9000, clientHeight: 600, querySelectorAll: () => [], getBoundingClientRect: rect };
      const v = { log, _readOnly: false, _teleported: true, _pinned: false, _total: C.length, _windowStart: 0, _windowEnd: 0, _messageList: list, _elements: new Map(), _renderedMsgIds: new Set(), _messages: [],
        _container: { classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) } }, _tailHold: null, _tailCall: 0, _windowGen: 0, _lastNavAt: 0, _lastPositionAt: 0, _lastUserScrollAt: 0, tailGate: null,
        _trace(k, d) { log.push(`trace:${k}${d && d.replay ? ':' + d.replay : ''}`); }, _traceExpect() { }, _cancelForcedScroll() { }, _clearWheelCarry() { }, _endResumeSettle() { },
        _beginHistoryLoad: () => () => { }, _showHistoryStatus(m) { log.push(`status:${m}`); }, _onCreateMessage(m) { v._messages.push(m); }, _onOp() { }, _resetGapAfterJump() { v._teleported = false; },
        _fetchMessagePage: async (o, l) => { log.push(`fetchPage(${o},${l})`); if (v.tailGate) await v.tailGate.p; return { messages: C.slice(o, o + l), total: C.length }; },
        _setPinned(p, why) { v._pinned = !!p; log.push(`pinned=${!!p}(${why})`); }, _forceScrollToBottom() { log.push('forceScrollToBottom'); } };
      Object.assign(v, { jumpToBottom: REAL.jumpToBottom, _releaseTailHold: REAL._releaseTailHold, _noteUserNav: REAL5._noteUserNav, _navigatedSince: REAL5._navigatedSince, _setStableHeights: REAL5._setStableHeights, _scrollElStable: REAL5._scrollElStable });
      if (ACTS) v._readerActs = ACTS;
      const node = { nodeType: 1, isConnected: true, closest: () => null, parentElement: null };
      v._search = { _messageList: list, hasHighlight: false, _onNav: () => v._noteUserNav('search-reveal'), _onReveal() { }, _expandRangeAncestors() { }, _scrollNestedIntoView() { }, _flashRange() { }, applyHighlightLayer() { }, _setCurrentHighlight() { }, _scrollToRange: REAL5._scrollToRange }; // wired as chat-view.js wires it
      v.range = { startContainer: node, getBoundingClientRect: rect }; v.target = { isConnected: true, getBoundingClientRect: rect };
      return v;
    };
    const stamps = (v) => `${v._lastNavAt || 0}|${v._lastPositionAt || 0}|${v._lastJumpAt || 0}|${v._search._lastRevealAt || 0}`;
    const SEND = /\/\/ B-172e ②\n\s+this\.jumpToBottom\(([^)]*)\);/.exec(CVS); // what onSend calls, read out of the source
    const sendArgs = SEND && SEND[1] ? new Function(`return (${SEND[1]});`)() : undefined;
    const raf0 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0; // (the REAL centring loops: their first step only)
    try {
      // a full-file search jump (jumpToFileMatch: the teleport's target, then _revealNearest's reveal a few ms later), a press
      // while teleported, the c-v restore firing while its tail page is out — `arm` 'reveal' | 'target' (no reveal); `press`
      const replayRace = async (arm, press, during = (v) => v._setStableHeights(false)) => {
        const C = conv(310, []), v = replayView(C);
        v._scrollElStable(v.target); await tick(2);
        if (arm === 'reveal') v._search._scrollToRange(v.range);
        await tick(3);
        v.tailGate = deferred();
        const p = press(v);
        await until(v, /^fetchPage/); await tick(2);
        const pre = stamps(v), mark = Date.now(); await tick(2);
        during(v);
        const post = stamps(v), since = v._navigatedSince(mark);
        v.tailGate.open(); v.tailGate = null;
        const moved = await p;
        return { moved, landed: !v._teleported && v._pinned && v._windowStart === 260, stale: v.log.includes('trace:jumpToBottom:stale'), replay: (v.log.find((l) => /^trace:stableHeights/.test(l)) || '').split(':')[2] || null, pre, post, since, replayAt: v._lastReplayAt || 0 };
      };
      const down = await replayRace('reveal', (v) => v.jumpToBottom());
      ok(down.replay === 'reveal' && down.landed && down.moved === true && !down.stale, `RED-able (r5 #1 — 497beb03: DROPPED — the replay wrote _lastRevealAt + _lastNavAt, the page discarded as stale, the reader left on the slab): the ↓ pressed in the 1.6 s after a search teleport LANDS though the c-v restore replays the reveal while its tail page is out`, down);
      ok(down.post === down.pre && down.replayAt > 0 && down.since === false, 'RED-able (r5 #1): the replay writes its OWN stamp (_lastReplayAt) and none of the reader-act stamps — _navigatedSince reads no act (a landing or the resume re-tail is never displaced by it)', down);
      const send = await replayRace('reveal', (v) => v.jumpToBottom(sendArgs));
      ok(send.replay === 'reveal' && send.landed && send.moved === true, `RED-able (r5 #1 — 497beb03: DROPPED, the echo deferred onto the slab): a SEND in the same window (onSend → jumpToBottom(${SEND ? SEND[1] : '?'})) lands at the live tail`, send);
      const target = await replayRace('target', (v) => v.jumpToBottom());
      ok(target.replay === 'target' && target.landed, '…the control, the TARGET arm (a jump with no reveal after it): the ↓ lands (on 497beb03 too — its default did not read _lastJumpAt)', target);
      ok(target.post === target.pre && target.since === false, 'RED-able (r5 #1 — 497beb03: the replayed target wrote _lastJumpAt, and _navigatedSince read the replay as an act): the replayed jump target writes no reader-act stamp', target);
      const person = await replayRace('reveal', (v) => v.jumpToBottom(), (v) => v._search._scrollToRange(v.range));
      ok(person.moved === false && person.stale && !person.landed, '…and a PERSON\'s reveal while the ↓\'s page is out still answers for the view (the law holds for every act a person makes: the page dropped, the slab stays)', person);
    } finally { if (raf0 === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = raf0; }
    ok(!!ACTS && /_navigatedSince\(since\) \{\s*return Math\.max\(\.\.\.this\._readerActs\(\)\) > since;/.test(CVS) && /const acts = \(\) => this\._readerActs\(\{ scroll: !send \}\)\.join\('\|'\), seen = acts\(\);/.test(CVS) && !/_lastReplayAt/.test(String(ACTS))
      && /if \(replay !== 'none'\) this\._lastReplayAt = Date\.now\(\);/.test(SEEKS) && /this\._scrollElStable\(target, \{ replay: true \}\)/.test(SEEKS) && /this\._lastRevealRun = \(\) => this\._scrollToRange\(range, \{ replay: true \}\);/.test(SRCH),
      'r5 #1: ONE list names the reader-act stamps (_readerActs — _navigatedSince and jumpToBottom\'s default both read it, the replay\'s own _lastReplayAt never); the c-v restore\'s two replays pass `replay`');
    // A SEND IS THE PERSON'S ACT (r5 — B-172e: the default stale took the send road; a touch on the list while its tail page was
    // out dropped the landing, the sent message deferred into the ↓ count): the REAL _fetchMessagePage / _onOp / _notePositioning;
    // the echo arrives during the fetch (held); then a touch, a wheel, a nav key — or a newer press
    for (const act of ['touch', 'wheel', 'key', 'press']) {
      const C = conv(310, [120]), S = C.slice(), Y = askOf(C, 120);
      const v = roads(fakeView(C, [Y], 100, 150), C), nc = cardsFor(v);
      v._pinned = false; nc._pass();
      let gate = deferred();
      const fetch0 = globalThis.fetch;
      globalThis.fetch = async (url) => { const q = new URL(url, 'http://x').searchParams, o = +q.get('offset'), l = +q.get('limit'); v.log.push(`fetchPage(${o},${l})`); if (gate) await gate.p; return { ok: true, json: async () => ({ messages: S.slice(o, o + l), total: S.length }) }; };
      const draw = v._onCreateMessage, deferredIds = [];
      Object.assign(v, { _fetchMessagePage: REAL4._fetchMessagePage, _onOp: REAL4._onOp, _getSessionIds: () => ({ backend: 'claude', backendSessionId: 'x', cwd: '/w', host: '' }), _noteRecordKind() { }, _newMsgCount: 0, _cancelForcedScroll() { }, _endResumeSettle() { },
        _onCreateMessage: (m) => { if (!v._loadingHistory && (v._teleported || (!v._pinned && v._windowEnd < v._total))) { v._total++; v._newMsgCount++; deferredIds.push(m.id); return; } draw(m); } }); // the real deferral
      try {
        const sent = v.jumpToBottom(sendArgs);
        await until(v, /^fetchPage/);
        const echo = { id: 'sent-echo', ts: NOW + 1, role: 'user', content: [{ type: 'text', text: 'my message' }] };
        S.push(echo); v._onOp({ op: 'create', message: echo }); // the server feeds the sent message live in the same breath (held)
        await tick(3);
        let other = null;
        if (act === 'press') other = nc.land(Y.id); else REAL5._notePositioning.call(v, act); // a newer press: a card landing at c120
        gate.open(); gate = null;
        const moved = await sent, o = await other;
        const r = { moved, o, window: `${v._windowStart}..${v._windowEnd}`, pinned: v._pinned, echoDrawn: v._elements.has('sent-echo'), echoDeferred: deferredIds.includes('sent-echo') };
        if (act !== 'press') ok(moved === true && v._pinned && v._windowEnd === S.length && r.echoDrawn && !r.echoDeferred, `RED-able (r5 #2 — 497beb03: the landing dropped, the window 100..150, the echo deferred): a SEND lands on the sent message though a ${act} on the list came during its tail fetch (B-172e)`, r);
        else ok(o === 'card' && moved === false && v._windowStart === 100 && !v._pinned, '…while a newer PRESS during its fetch (a card landing at c120) answers for the view instead — the send\'s page dropped, the landing stays', r);
      } finally { globalThis.fetch = fetch0; }
    }
    // ④'S TAIL ROAD PUTS BACK (r5 — the acceptance's (B): a mid-history reader, the read failed ⇒ unknown, the tail loaded, the
    // show failed ⇒ the live end, pinned): the reader back at their record c120, 40 px down, said once
    { const C = conv(310, [300]), A = askOf(C, 300);
      const v = roads(fakeView(C, [A], 100, 150), C), nc = cardsFor(v);
      const draw0 = v._onCreateMessage;
      v._onCreateMessage = (m) => { draw0(m); const el = v._elements.get(m.id); if (el && m.id === 'c300') el._box = false; };
      v.revealRecord = () => false; v._traceExpect = (k) => v.log.push(`expect:${k}`);
      v._fetchMessages = async (o, l) => { if (!v.log.includes('nav:jumpToIndex')) { v.log.push(`fetch(${o},${l}) FAILS`); throw new Error('read failed'); } v.log.push(`fetch(${o},${l})`); return C.slice(o, o + l); }; // the landing's read fails; the put-back's page answers
      v._pinned = false; nc._pass(); globalThis.__cnToasts = [];
      nc._readerLine = () => { const el = v._elements.get('c120'); return el && el.isConnected ? { el, top: 40 } : null; };
      const res = await nc.land(A.id);
      ok(res === null && v._windowStart === 100 && !v._pinned && v.log.includes('expect:needsPutBack') && globalThis.__cnToasts.length === 1, 'RED-able (r5 minor — 497beb03: the reader left at the live end 260..310, pinned): ④\'s tail road, its show failed — the reader PUT BACK at the record they were reading (the window 100..150, unpinned, c120 where it stood) and the toast once', { res, window: `${v._windowStart}..${v._windowEnd}`, pinned: v._pinned, toasts: globalThis.__cnToasts.length, log: v.log.filter((l) => /jumpTo|expect|pinned/.test(l)) }); }
    // THE PUT-BACK RE-OPENS THE READER'S RUN (r5 — the acceptance's (C): the reader's line c120 inside a run they had opened; the
    // rebuilt window folds every run — no box, nothing was put back): the REAL revealRecord over a run model; a record hidden
    // inside the opened run (a CSS rule) puts back its run's FOLD LINE
    for (const hiddenInRun of [false, true]) {
      const C = conv(310, [10]), A = askOf(C, 10);
      const v = roads(fakeView(C, [A], 100, 150), C), nc = cardsFor(v);
      const draw0 = v._onCreateMessage, css = new Set(hiddenInRun ? ['c120'] : []);
      v._onCreateMessage = (m) => { draw0(m); const el = v._elements.get(m.id); if (el && m.id === 'c10') el._box = false; };
      v.revealRecord = REAL.revealRecord; v._traceExpect = (k) => v.log.push(`expect:${k}`); v._messageList.scrollTop = 0;
      v._setRunOpen = (run, open) => { run.open = open; for (const el of run.members) el._box = open && !css.has(el.dataset.msgId); };
      v._runs = [];
      v._updateRuns = () => { // the PUT-BACK's rebuild (the second jumpToIndex) folds c119..c121 (the run the reader had opened)
        if (v.log.filter((l) => l === 'nav:jumpToIndex').length < 2) return;
        const members = ['c119', 'c120', 'c121'].map((id) => v._elements.get(id)).filter(Boolean), header = new El();
        header.classList.add('chat-run-header'); v._messageList.insertBefore(header, members[0]); header.getBoundingClientRect = () => ({ top: 7, bottom: 31, left: 0, right: 0, width: 1, height: 24 });
        v._runs = [{ header, members, open: true }]; v._setRunOpen(v._runs[0], false);
      };
      v._pinned = false; nc._pass(); globalThis.__cnToasts = [];
      nc._readerLine = () => { const el = v._elements.get('c120'); return el && el.isConnected ? { el, top: 40 } : null; };
      const res = await nc.land(A.id);
      const run = v._runs[0], el = v._elements.get('c120');
      const r = { res, window: `${v._windowStart}..${v._windowEnd}`, putBack: v.log.includes('expect:needsPutBack'), runOpen: run ? run.open : null, readerHasBox: !!(el && el.getClientRects().length), scrollTop: v._messageList.scrollTop, toasts: globalThis.__cnToasts.length };
      if (!hiddenInRun) ok(res === null && r.putBack && r.runOpen === true && r.readerHasBox && r.scrollTop === -40 && r.toasts === 1, 'RED-able (r5 minor — 497beb03: putBack false, the run closed, scrollTop 0): the index road\'s put-back RE-OPENS the run the reader was reading inside — c120 drawn again, where it stood (40 px down)', r);
      else ok(res === null && r.putBack && r.runOpen === false && !r.readerHasBox && r.scrollTop === -33 && r.toasts === 1, 'RED-able (r5 minor): …a record still not drawn inside its opened run (a CSS rule) — the run closes again and its FOLD LINE stands where the record stood (7 px → 40 px)', r);
    }
    // ── ⑩f THE TAIL, ROUND 6 (the r5 delta verdict on d5ab5a88): A READER ACT IS STAMPED WHEN IT STARTS, NEVER WHEN ITS PAGE
    // LANDS — r5 put the jump LANDING's stamp (_lastJumpAt, the REAL _scrollElStable) into the one list, and an OLDER jump with
    // no `stale` of its own (the minimap's jumpToIndex, the waiting chip's jumpToPendingAsk, a minimap time jump) landing while
    // a NEWER ↓ or send had its tail page out dropped the newer press (the reader left at the older jump's window; a send's
    // echo deferred undrawn — B-172e); the REAL jumps, the REAL landing writer, the REAL _fetchMessagePage / _onOp (the echo
    // held during the fetch); the older page answers first (requests are answered in order)
    console.log('⑩f THE TAIL r6 — a reader act is stamped when it starts, never when its page lands: an older jump landing late never drops a newer ↓ / send / card');
    const R6 = { jumpToPendingAsk: method('  async jumpToPendingAsk(', '  /** A helper card\'s lifecycle chip'), _jumpToFileTime: methodOf(SEEKS, '    async _jumpToFileTime(ts, line) {', '    _scrollElStable(el, ') };
    ok(Object.values(R6).every((f) => typeof f === 'function'), 'the REAL jumpToPendingAsk (chat-view.js) and _jumpToFileTime (chat-view-seek.js) are read out of the sources', Object.keys(R6).filter((k) => typeof R6[k] !== 'function'));
    const MINIMAP = /\(idx\) => \{ this\._noteUserNav\('minimap'\); return this\.jumpToIndex\(idx\); \}/.test(CVS) && /\(ts, line\) => \{ this\._noteUserNav\('minimap-time'\); return this\._jumpToFileTime\(ts, line\); \}/.test(CVS);
    const raf6 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0; // (the REAL centring loops: their first step only)
    try {
      /** press 1 = the OLDER jump (`road`), its page held; press 2 while it is out = ↓ or a send (`press`), its tail page held */
      const olderRace = async (road, press) => {
        const C = conv(310, []), S = C.slice();
        const v = roads(fakeView(C, [], 100, 150), C);
        v._pinned = false;
        let tailGate = deferred();
        const fetch0 = globalThis.fetch;
        globalThis.fetch = async (url) => { const q = new URL(url, 'http://x').searchParams, o = +q.get('offset'), l = +q.get('limit'); v.log.push(`fetchPage(${o},${l})`); if (tailGate) await tailGate.p; return { ok: true, json: async () => ({ messages: S.slice(o, o + l), total: S.length }) }; };
        const draw = v._onCreateMessage, deferredIds = [];
        Object.assign(v, { _fetchMessagePage: REAL4._fetchMessagePage, _onOp: REAL4._onOp, _getSessionIds: () => ({ backend: 'claude', backendSessionId: 'x', cwd: '/w', host: '' }), _noteRecordKind() { }, _newMsgCount: 0, _cancelForcedScroll() { }, _endResumeSettle() { },
          _onCreateMessage: (m) => { if (!v._loadingHistory && (v._teleported || (!v._pinned && v._windowEnd < v._total))) { v._total++; v._newMsgCount++; deferredIds.push(m.id); return; } draw(m); }, // the real deferral
          _scrollElStable: REAL5._scrollElStable, _lastJumpAt: 0, _canPaginate: true,
          _pendingAsks: [{ requestId: 'rq-c200', msgIndex: 200 }], _askElement: (a) => (a ? v._elements.get('c200') || null : null), jumpToPendingAsk: R6.jumpToPendingAsk,
          _jumpToFileTime: R6._jumpToFileTime, _scrollToNearestTs: () => false, _gapElForLine: () => null, _nearestElByTs: () => null, _reportVisibleTsRange() { },
          _seekTeleport: async (line) => { v.log.push(`seekTeleport(${line})`); if (v.jumpGate) await v.jumpGate.p; v.setWindow(180, 230); v._teleported = true; return v._elements.get('c200') || null; }, // the slab is the stub's, its landing the REAL _scrollElStable
          _resetGapAfterJump() { v._teleported = false; } });
        try {
          v.jumpGate = deferred();
          const first = road === 'minimap' ? (v._noteUserNav('minimap'), v.jumpToIndex(200)) : road === 'chip' ? v.jumpToPendingAsk() : (v._noteUserNav('minimap-time'), v._jumpToFileTime(C[200].ts, 200)); // as chat-view.js wires them
          await until(v, /^fetch\(|^seekTeleport/); await tick(2);
          const second = v.jumpToBottom(press === 'send' ? sendArgs : undefined);
          await until(v, /^fetchPage/);
          if (press === 'send') { const echo = { id: 'sent-echo', ts: NOW + 1, role: 'user', content: [{ type: 'text', text: 'my message' }] }; S.push(echo); v._onOp({ op: 'create', message: echo }); } // the server feeds the sent message live in the same breath (held)
          await tick(2);
          v.jumpGate.open(); v.jumpGate = null; const r1 = await first; // the OLDER page answers first
          const landed = v._lastJumpAt > 0, at = `${v._windowStart}..${v._windowEnd}`; await tick(2);
          tailGate.open(); tailGate = null; const moved = await second;
          return { road, press, older: !!r1, landed, olderAt: at, moved, window: `${v._windowStart}..${v._windowEnd}`, pinned: v._pinned, teleported: v._teleported, stale: v.log.includes('trace:jumpToBottom:stale'), echoDrawn: v._elements.has('sent-echo'), echoDeferred: deferredIds.includes('sent-echo'), lateStamp: v.log.includes('nav:jumpToAsk'), total: S.length };
        } finally { globalThis.fetch = fetch0; }
      };
      const name = { minimap: 'minimap jump (jumpToIndex)', chip: 'waiting-chip jump (jumpToPendingAsk)', time: 'minimap time jump (_jumpToFileTime)' };
      for (const road of ['minimap', 'chip', 'time']) for (const press of ['down', 'send']) {
        const r = await olderRace(road, press);
        const won = r.older && r.landed && r.olderAt === '180..230' && r.moved === true && r.pinned && !r.teleported && !r.stale && (press === 'send' ? r.window === `${r.total - 50}..${r.total}` && r.echoDrawn && !r.echoDeferred : r.window === '260..310');
        ok(won && (road !== 'chip' || !r.lateStamp), `RED-able (r6 — d5ab5a88: DROPPED as stale, the reader left at the older jump's 180..230${press === 'send' ? ', the echo deferred undrawn: B-172e' : ''}): an OLDER ${name[road]} lands while a NEWER ${press === 'send' ? 'send' : '↓'} has its tail page out — the NEWER press wins (the live tail, pinned${press === 'send' ? ', the sent message drawn' : ''})${road === 'chip' ? '; the chip stamps its paged press once, as its jump starts' : ''}`, r);
      }
      // …and a NEEDS CARD's landing (a press too: its gone() asks _navigatedSince) is not cancelled by an OLDER minimap jump
      // landing while the card's read is out (every NEWER act still cancels it — ⑩c / ⑩d); the REAL _navigatedSince
      { const C = conv(310, [10]), A = askOf(C, 10);
        const v = roads(fakeView(C, [A], 100, 150), C), nc = cardsFor(v);
        const gates = [deferred(), deferred()]; let calls = 0;
        Object.assign(v, { _scrollElStable: REAL5._scrollElStable, _navigatedSince: REAL5._navigatedSince, _lastJumpAt: 0 });
        v._fetchMessages = async (o, l) => { const g = gates[Math.min(calls++, 1)]; v.log.push(`fetch(${o},${l})`); await g.p; return C.slice(o, o + l); }; // the minimap's page on gate 0, the card's reads on gate 1
        v._pinned = false; nc._pass();
        v._noteUserNav('minimap'); const first = v.jumpToIndex(200);
        await tick(3);
        const card = nc.land(A.id);
        for (let i = 0; i < 60 && calls < 2; i++) await tick(2);
        await tick(3); // (gone() compares times: the older page answers a few ms after the card's press)
        gates[0].open(); const r1 = await first; // the OLDER page answers first: the minimap lands (180..230)
        const olderAt = `${v._windowStart}..${v._windowEnd}`; await tick(2);
        gates[1].open(); const res = await card;
        const r = { r1, olderAt, res, window: `${v._windowStart}..${v._windowEnd}`, cards: cardsOf(v), jumpAt: v._lastJumpAt > 0 };
        ok(r1 === true && olderAt === '180..230' && res === 'card' && v._windowStart === 0 && cardsOf(v).some((c) => c.id === A.id && c.at === 'c10'), 'RED-able (r6 — d5ab5a88: null, the card dropped, the reader left at 180..230): a needs card pressed while an OLDER minimap jump\'s page is out LANDS though that page lands first (c10, the window 0..50)', r); }
    } finally { if (raf6 === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = raf6; }
    ok(!!ACTS && !/_lastJumpAt/.test(String(ACTS)) && /_positionedSince\(since\) \{\s*return Math\.max\(\.\.\.this\._readerActs\(\{ tail: false \}\)\) > since \|\| \(this\._lastJumpAt \|\| 0\) > since;/.test(CVS) // (r8: the resume's question leaves the press that keeps the tail out)
      && (CVS.match(/this\._positionedSince\((?:resumeAt|at)\)/g) || []).length === 3 && /if \(!paged\) this\._noteUserNav\?\.\('jumpToAsk'\);/.test(CVS) && MINIMAP,
      'r6: the reader-act list holds no landing stamp (_lastJumpAt — read only by the resume\'s _positionedSince, at its three automatic sites); the waiting chip stamps a paged ask once, as its jump starts; the minimap\'s two jumps carry no `stale` of their own (the race above is the product\'s wiring)');
    // ── ⑩g THE TAIL, ROUND 7 (the r6 delta verdict on 15475151): EVERY JUMP A PERSON MAKES IS STAMPED AS IT STARTS — r6 took the
    // landing's _lastJumpAt out of the one list on that premise, and the SEARCH broke it: a huge session's full-file hit
    // (jumpToFileMatch) whose words are not rendered text (_revealNearest's fallback — no range, no reveal stamp) was no act at
    // all, and an OLDER ↓ / send / needs card landing whose page answered after it pulled the reader off the hit (d5ab5a88
    // dropped the older press by the landing's stamp); the in-page road's hit in the window was the same (_revealInEl's
    // fallback), and a send at the live tail stamped nothing a landing's gone() could see. The REAL _jumpToSearchResult /
    // _revealNearest / _revealInEl (chat-search.js), the REAL jumpToFileMatch (chat-view-seek.js), the search's wiring and the
    // send read out of chat-view.js; THE DOOR CENSUS: every door a person presses writes its stamp before its first await
    console.log('⑩g THE TAIL r7 — every jump a person makes is stamped as it starts: a search hit with no rendered range drops an older ↓ / send / card landing; a send at the live tail too; the door census');
    /** the REAL doors out of a set of sources (`src` = { CVS, SEEKS, SRCH }) — the census reads a mutant's the same way */
    const doorsOf = (src) => {
      const own = (re, args) => { const m = re.exec(src.CVS); return m ? m.slice(1).map((body) => { try { return new Function(`return function (${args}) { return (${body}); };`)(); } catch { return null; } }) : [null, null]; }; // an arrow wired in the constructor, `this` bound by the call
      const [minimapIdx, minimapTime] = own(/new ChatMinimap\(container, this\._messageList,\n\s+(\(idx\) => \{[^\n]*\}),\n\s+(\(ts, line\) => \{[^\n]*\})\);/, '');
      const [onNav] = own(/\n\s+onNav: (\([^)]*\) => this\._noteUserNav\([^)]*\)),\n/, '');
      const fn = (re) => { const m = re.exec(src.CVS); try { return m ? new Function(`return (function () ${m[1]});`)() : null; } catch { return null; } };
      return { minimapIdx, minimapTime, onNav, scrollBtn: fn(/this\._scrollBtn\.onclick = \(\) => (\{[\s\S]*?\n {4}\});/), onSend: fn(/\n {6}onSend: \(\) => (\{[\s\S]*?\n {6}\}),\n {6}onInterrupt:/),
        _noteUserNav: methodOf(src.CVS, '  _noteUserNav(via) {', '  /** Did the READER position'), _notePositioning: methodOf(src.CVS, '  _notePositioning(via) {', '  /** Did this press land on the list'),
        jumpToIndex: methodOf(src.CVS, '  async jumpToIndex(', '  // Jump to the bottom of the conversation.'), jumpToBottom: methodOf(src.CVS, '  async jumpToBottom(', '  /** Replay the live ops a tail fetch held'),
        jumpToPendingAsk: methodOf(src.CVS, '  async jumpToPendingAsk(', '  /** A helper card\'s lifecycle chip'), _landOnHeader: methodOf(src.CVS, '  _landOnHeader(run) {', '  // Collapse from the bar/footer'),
        _jumpToFileTime: methodOf(src.SEEKS, '    async _jumpToFileTime(ts, line) {', '    _scrollElStable(el, '), jumpToFileMatch: methodOf(src.SEEKS, '    async jumpToFileMatch(match) {', '    _scrollToNearestTs('),
        _jumpToSearchResult: methodOf(src.SRCH, '  async _jumpToSearchResult(idx) {', '  // ── Highlight Layer'), _revealInEl: methodOf(src.SRCH, '  _revealInEl(el) {', '  /**\n   * Full-file jumps land'),
        _revealNearest: methodOf(src.SRCH, '  _revealNearest(el) {', '  /**\n   * Bring a highlight range'),
        // r8: the press that keeps the tail; the resume repair, un-stubbed (r7's census stubbed _endResumeSettle and never saw
        // what a press ENDS); the one list and the two questions asked of it; the teleport whose Retry is a door
        _noteTailPress: methodOf(src.CVS, '  _noteTailPress(via) {', '  /** An explicit reader NAVIGATION'), _endResumeSettle: methodOf(src.CVS, '  _endResumeSettle() {', '  /** A READER TOUCHED'),
        _clearResumeRetail: methodOf(src.CVS, '  _clearResumeRetail() {', '  /** A POSITIONING act'), _readerActs: methodOf(src.CVS, '  _readerActs(', '  /** Is an atBottom→false transition'),
        _navigatedSince: methodOf(src.CVS, '  _navigatedSince(since) {', '  /** …or did a jump'), _positionedSince: methodOf(src.CVS, '  _positionedSince(since) {', '  /** THE READER'),
        _seekTeleport: methodOf(src.SEEKS, '    async _seekTeleport(line) {', '    async jumpToFileMatch(match) {'),
        // r9: where a press LEFT the view decides its side of THE RULE — the chat's own pin predicate (PINNED ⇔ AT THE LIVE
        // TAIL); the chain's cancel (the run bar and a card's open run it first); the needs cards' class (a mutant's own bundle)
        _atLiveTail: methodOf(src.CVS, '  _atLiveTail(scrollTop, scrollHeight, clientHeight) {', '  /** THE PIN CHANGES IN ONE PLACE'), _cancelForcedScroll: methodOf(src.CVS, '  _cancelForcedScroll(via) {', '  // Render a message into elements'),
        NC: src.NC || NeedsCards };
    };
    const R7 = doorsOf({ CVS, SEEKS, SRCH });
    ok(Object.values(R7).every((f) => typeof f === 'function'), 'the REAL doors are read out of the sources: the minimap\'s two wirings, the ↓, the send, the search\'s onNav wiring (chat-view.js); jumpToIndex / jumpToBottom / jumpToPendingAsk / _landOnHeader / _noteUserNav / _notePositioning; _jumpToFileTime / jumpToFileMatch (chat-view-seek.js); _jumpToSearchResult / _revealInEl / _revealNearest (chat-search.js); r8: _noteTailPress / _endResumeSettle / _clearResumeRetail / _readerActs / _navigatedSince / _positionedSince (chat-view.js), _seekTeleport (chat-view-seek.js); r9: _atLiveTail / _cancelForcedScroll (chat-view.js), the NeedsCards class (chat-needs-card.js, bundled)', Object.keys(R7).filter((k) => typeof R7[k] !== 'function'));
    const raf7 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0; // (the REAL centring loops: their first step only)
    const gcs7 = globalThis.getComputedStyle; globalThis.getComputedStyle = () => ({ paddingBottom: '0', direction: 'ltr' }); // (r9: a card's open runs to its end)
    try {
      /** the person's search over a view — the REAL ChatSearch steps, wired as chat-view.js wires them; `file` = a huge session's
       *  full-file road (the hit in the loaded slab), else the in-page road (the hit at c120, in the window 100..150) */
      const searchOf = (v, { file, rendered }) => {
        const els = Array.from({ length: 50 }, (_, k) => ({ id: `c${100 + k}`, isConnected: true, contains: (n) => n === v.range?.startContainer, scrollIntoView() { v.log.push('scrollIntoView'); }, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0, width: 0 }) }));
        const own = Object.assign(v._search || {}, { _fullFileMode: !!file, _serverSearchResults: [file ? { line: 4000, ts: NOW - 5 } : { index: 120 }], _highlightRanges: [], hasHighlight: false, _lastRevealAt: 0,
          _jumpToFileMatch: (m) => v.jumpToFileMatch(m), _jumpToIndex: (i) => v.jumpToIndex(i), _getWindowBounds: () => ({ windowStart: v._windowStart, windowEnd: v._windowEnd }),
          _onNav: R7.onNav.call(v), _onReveal() { }, _expandEl() { }, _setCurrentHighlight() { }, applyHighlightLayer() { this._highlightRanges = rendered && v.range ? [v.range] : []; },
          _revealInEl: R7._revealInEl, _revealNearest: R7._revealNearest, _jumpToSearchResult: R7._jumpToSearchResult });
        if (!file) own._messageList = { querySelectorAll: () => els, getBoundingClientRect: () => ({ top: 0, height: 600 }) };
        return (v._search = own);
      };
      /** press 1 = the OLDER ↓ or send (its tail page held); press 2 while it is out = the person's search, its words not rendered
       *  text (`rendered` false — no range to reveal) */
      const searchRace = async ({ file, press, rendered }) => {
        const C = conv(310, []), v = replayView(C);
        if (!file) Object.assign(v, { _teleported: false, _windowStart: 100, _windowEnd: 150 });
        v.target.scrollIntoView = () => v.log.push('scrollIntoView'); v.target.contains = (n) => n === v.range.startContainer;
        Object.assign(v, { jumpToFileMatch: R7.jumpToFileMatch, _gapElForLine: () => v.target, _nearestElByTs: () => v.target, _reportVisibleTsRange() { }, _tsOfRenderedEl: () => 0, _lastJumpAt: 0, _noteUserNav(via) { REAL5._noteUserNav.call(this, via); v.log.push(`nav:${via}`); } });
        const S = searchOf(v, { file, rendered });
        v.tailGate = deferred();
        const p = v.jumpToBottom(press === 'send' ? sendArgs : undefined);
        await until(v, /^fetchPage/); await tick(2);        // (a person's two presses never share a millisecond — both write _lastNavAt)
        await S._jumpToSearchResult(0);
        const at = { teleported: v._teleported, window: `${v._windowStart}..${v._windowEnd}` };
        v.tailGate.open(); v.tailGate = null;
        const moved = await p;
        return { file: !!file, press, rendered, moved, stale: v.log.includes('trace:jumpToBottom:stale'), at, window: `${v._windowStart}..${v._windowEnd}`, teleported: v._teleported, pinned: v._pinned, reveal: S._lastRevealAt > 0, navs: v.log.filter((l) => l.startsWith('nav:')) };
      };
      const stays = (r) => r.moved === false && r.stale && !r.pinned && r.window === r.at.window && r.teleported === r.at.teleported;
      const fileDown = await searchRace({ file: true, press: 'down', rendered: false });
      ok(stays(fileDown) && fileDown.teleported && !fileDown.reveal && fileDown.navs.includes('nav:search'), 'RED-able (r7 — 15475151: LANDED, the reader pulled off the hit to the live tail 260..310, pinned; d5ab5a88 kept the hit by the landing\'s _lastJumpAt and stamped no press): a huge session\'s full-file search hit whose words are not rendered text (no range, no reveal) drops an OLDER ↓ whose tail page answers after it — the hit STAYS (the slab, unpinned); the search stamped its press as it started', fileDown);
      const fileSend = await searchRace({ file: true, press: 'send', rendered: false });
      ok(stays(fileSend) && fileSend.teleported, 'RED-able (r7 — 15475151: LANDED at the live tail, the hit left): …and an OLDER send\'s landing the same way (B-172e r5: a newer PRESS during its fetch answers for the view)', fileSend);
      const fileRange = await searchRace({ file: true, press: 'down', rendered: true });
      ok(stays(fileRange) && fileRange.reveal, '…the control: a hit WITH a rendered range (its reveal stamps) drops the older ↓ on every tree', fileRange);
      const pageDown = await searchRace({ file: false, press: 'down', rendered: false });
      ok(stays(pageDown) && pageDown.window === '100..150' && !pageDown.reveal && pageDown.navs.includes('nav:search'), 'RED-able (r7 — 15475151 and d5ab5a88 alike: LANDED at 260..310, pinned): the IN-PAGE road\'s hit in the window (c120), its words not rendered text (_revealInEl\'s fallback: no reveal) — the older ↓ dropped, the reader stays at the hit (100..150); both roads stamp at ONE site, the search\'s press', pageDown);
      // a NEEDS CARD landing in flight (its read out) vs a NEWER press that has no page of its own: the search hit with no
      // range (the full-file road, its hit at c120 on screen) and a send at the live tail — the card's gone() must see both
      const cardRace = async (newer) => {
        const C = conv(310, [10]), A = askOf(C, 10);
        const v = roads(fakeView(C, [A], newer === 'send' ? 260 : 100, newer === 'send' ? 310 : 150), C), nc = cardsFor(v);
        const gate = deferred(); let calls = 0;
        Object.assign(v, { _scrollElStable: REAL5._scrollElStable, _navigatedSince: REAL5._navigatedSince, _lastJumpAt: 0, jumpToFileMatch: R7.jumpToFileMatch, _noteTailPress: R7._noteTailPress,
          _nearestElByTs: () => v._elements.get('c120'), _tsOfRenderedEl: () => 0, _gapElForLine: () => null, _reportVisibleTsRange() { }, _scrollToBottom() { v.log.push('scrollToBottom'); } });
        for (const el of v._elements.values()) { el.scrollIntoView = () => v.log.push('scrollIntoView'); el.contains = () => false; }
        if (newer === 'search') { v._elements.get('c120').dataset.ts = String(C[120].ts); searchOf(v, { file: true, rendered: false }); v._search._messageList = v._messageList; v._search._serverSearchResults = [{ line: 4000, ts: C[120].ts }]; }
        v._fetchMessages = async (o, l) => { calls++; v.log.push(`fetch(${o},${l})`); await gate.p; return C.slice(o, o + l); };
        v._pinned = newer === 'send'; nc._pass();
        const card = nc.land(A.id);                                  // the OLDER press: the card's landing, its read out
        for (let i = 0; i < 60 && calls < 1; i++) await tick(2);
        await tick(3);                                               // (gone() compares times)
        if (newer === 'search') await v._search._jumpToSearchResult(0); else R7.onSend.call(v);
        gate.open(); const res = await card;
        return { newer, res, window: `${v._windowStart}..${v._windowEnd}`, pinned: v._pinned, navs: v.log.filter((l) => l.startsWith('nav:')), tailPress: (v._lastTailPressAt || 0) > 0, atHit: v.log.includes('scrollIntoView') };
      };
      const vsSearch = await cardRace('search');
      ok(vsSearch.res === null && vsSearch.window === '100..150' && vsSearch.atHit, 'RED-able (r7 — 15475151: \'card\', the reader taken off the hit to 0..50): a NEWER full-file search hit with no rendered range cancels an OLDER needs card landing — the reader stays on the hit (100..150)', vsSearch);
      const vsSend = await cardRace('send');
      ok(vsSend.res === null && vsSend.window === '260..310' && vsSend.pinned && (vsSend.navs.includes('nav:send') || vsSend.tailPress), 'RED-able (r7 — 15475151 and d5ab5a88 alike: \'card\', the reader taken off the sent message to 0..50): a SEND at the live tail cancels an OLDER needs card landing whose read was out — the reader stays at the live tail, pinned (the send stamps as it starts, like the ↓ — r8: as a press that keeps the tail, _lastTailPressAt)', vsSend);
      // THE DOOR CENSUS: each door a person presses, called on a view where every page / read / teleport is out for good — its
      // stamp (one of _readerActs) is written before its first await, or it is red BY NAME. r8: every view is a window JUST
      // SHOWN AGAIN that was pinned when it was hidden — the resume repair armed (the settle, the pin snapshot, the re-tail
      // series) and _endResumeSettle the REAL one (r7 stubbed it and never saw what a press ENDS) — and each door is judged by
      // THE RULE: a press that KEEPS the tail leaves the repair armed and the resume's own question false (_positionedSince —
      // the repair goes there too); every other press is one the resume stands down for (_positionedSince true: the re-tail
      // bails, the unpin gate is off)
      const census = async (src) => {
        const R = doorsOf(src), out = [];
        const hang = () => new Promise(() => { });
        const arm = () => { const at = Date.now(); return { _resumeAt: at - 300, _resumeSettleUntil: at + 940, _pinnedAtSuspend: true, _resumeRetailTimers: ['rung', 'rung', 'horizon'] }; };
        const bottom = (v) => { const l = v._messageList; l.scrollTop = l.scrollHeight - l.clientHeight; };
        const view = (o = {}) => {
          const v = { log: [], _lastNavAt: 0, _lastPositionAt: 0, _lastTailPressAt: 0, _lastUserScrollAt: 0, _lastJumpAt: 0, _total: 310, _windowStart: 100, _windowEnd: 150, _teleported: false, _pinned: false, _canPaginate: true,
            _elements: new Map(), _messages: [], _renderedMsgIds: new Set(), _runs: [], _tailCall: 0, _tailHold: null, _windowGen: 0, _search: null, _pendingAsks: [], _askElement: () => null,
            _messageList: { scrollTop: 0, scrollHeight: 9000, clientHeight: 600, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, bottom: 600, left: 0, right: 0, width: 10, height: 600 }) },
            _container: { classList: { contains: () => false, add() { }, remove() { } } }, _scrollBtn: { classList: { add() { }, remove() { }, toggle() { } } },
            _trace(k, d) { if (k === 'userNav') v.log.push(`nav:${d && d.via}`); }, _traceExpect() { }, _cancelForcedScroll() { }, _clearWheelCarry() { }, _beginHistoryLoad: () => () => { }, _showHistoryStatus() { },
            _setPinned(p) { v._pinned = !!p; }, _forceScrollToBottom() { bottom(v); }, _scrollToBottom() { bottom(v); }, _scheduleRunBar() { }, _scrollElStable() { v._lastJumpAt = Date.now(); }, _reportVisibleTsRange() { }, _scheduleAxSync() { }, _releaseTailHold() { },
            _fetchMessagePage: hang, _fetchMessages: hang, _seekTeleport: hang, _scrollToNearestTs: () => false, _gapElForLine: () => null, _nearestElByTs: () => null, _tsOfRenderedEl: () => 0,
            _onCreateMessage() { }, _resetGapAfterJump() { }, _updateRuns() { }, _setRunOpen() { }, ...arm() };
          Object.assign(v, { _noteUserNav: R._noteUserNav, _notePositioning: R._notePositioning, _noteTailPress: R._noteTailPress, _endResumeSettle: R._endResumeSettle, _clearResumeRetail: R._clearResumeRetail, _atLiveTail: R._atLiveTail,
            _navigatedSince: R._navigatedSince, _positionedSince: R._positionedSince,
            jumpToIndex: R.jumpToIndex, jumpToBottom: R.jumpToBottom, jumpToPendingAsk: R.jumpToPendingAsk, _landOnHeader: R._landOnHeader, _jumpToFileTime: R._jumpToFileTime, jumpToFileMatch: R.jumpToFileMatch }, o);
          v._readerActs = R._readerActs || ACTS;
          return v;
        };
        /** what the press wrote (one of the list — a press's stale and a landing's gone() see it), what the resume asks of it,
         *  what is left of the repair — and WHERE THE PRESS LEFT THE VIEW (r9): pinned at the live tail (the chat's own
         *  predicate, _atLiveTail) ⇔ it kept the tail. The side of THE RULE a press is judged by is READ from that state, never
         *  declared (r8 hard-coded the needs cards' doors «leaves» on a stub stamp and never saw them end the repair) */
        const judge = (v) => ({ stamped: !!R._navigatedSince?.call(v, 0), positioned: !!R._positionedSince?.call(v, v._resumeAt), repair: v._pinnedAtSuspend === true && (v._resumeRetailTimers || []).length === 3,
          keeps: !!v._pinned && !!R._atLiveTail?.call(v, v._messageList.scrollTop, v._messageList.scrollHeight, v._messageList.clientHeight) });
        const verdict = (j) => (j.keeps ? j.stamped && j.repair && !j.positioned : j.stamped && j.positioned);
        const press = (f) => { try { const r = f(); if (r && typeof r.catch === 'function') r.catch(() => { }); return true; } catch { return false; /* a fake this door outran: the stamp is read all the same */ } };
        /** THE DOOR TABLE's row (docs/kb-bugfix-invariants.md — r9): `door` · `site` (where its stamp is written) · `kind` =
         *  'keeps' / 'leaves' the tail, or 'both' — judged where it lands, pressed at the live tail AND off it (the first must
         *  keep, the second leave; a press judged where it lands runs to its end). Every press by THE RULE on the side its
         *  state shows, and that side the table's */
        const put = (door, site, kind, js) => out.push({ door, site, kind, ok: js.every((j) => verdict(j) && !j.threw) && (kind === 'both' ? js.length === 2 && js[0].keeps && !js[1].keeps : js.every((j) => j.keeps === (kind === 'keeps'))), ...js[0], js });
        const one = (go, o = {}, strict = false) => { const v = view(o); const done = press(() => go(v)); return { ...judge(v), threw: strict && !done, navs: v.log.slice() }; };
        const row = (door, site, go, o = {}, kind = 'leaves') => put(door, site, kind, [one(go, o)]);
        const row2 = (door, site, [go, o], [go2, o2]) => put(door, site, 'both', [one(go, o, true), one(go2, o2, true)]);
        const el = () => ({ isConnected: true, classList: { add() { }, remove() { } }, offsetWidth: 1, style: {}, closest: () => null, getClientRects: () => [{}], scrollIntoView() { } });
        const search = (v, file) => { v._search = { _messageList: { querySelectorAll: () => Array.from({ length: 50 }, () => ({ contains: () => false, scrollIntoView() { }, querySelectorAll: () => [] })), getBoundingClientRect: () => ({ top: 0, height: 600 }) },
          _fullFileMode: file, _serverSearchResults: [file ? { line: 4000, ts: NOW - 5 } : { index: v._searchAt ?? 120 }], _highlightRanges: [], _lastRevealAt: 0,
          _jumpToFileMatch: (m) => v.jumpToFileMatch(m), _jumpToIndex: (i) => v.jumpToIndex(i), _getWindowBounds: () => ({ windowStart: v._windowStart, windowEnd: v._windowEnd }),
          _onNav: R.onNav ? R.onNav.call(v) : null, _onReveal() { }, _expandEl() { }, _setCurrentHighlight() { }, applyHighlightLayer() { this._highlightRanges = []; },
          _revealInEl: R._revealInEl, _revealNearest: R._revealNearest, _jumpToSearchResult: R._jumpToSearchResult }; return v._search._jumpToSearchResult(0); };
        row('the minimap (an index)', "chat-view.js the ChatMinimap wiring: _noteUserNav('minimap'), then jumpToIndex's own first line", (v) => R.minimapIdx.call(v)(200));
        row('the minimap (a time)', "chat-view.js the ChatMinimap wiring: _noteUserNav('minimap-time'); chat-view-seek.js _jumpToFileTime's first line ('jumpToFileTime')", (v) => R.minimapTime.call(v)(NOW - 9 * M, 200));
        { const bar = (top) => (v) => v._landOnHeader({ header: { isConnected: true, offsetTop: top, getBoundingClientRect: () => ({ top: 0, height: 20 }) }, members: [] });
          row2('the run bar', "chat-view.js _landOnHeader: judged where it lands (r9) — at the live tail _noteTailPress('runBar') (the stamp only) and the settle WINDOW ended (r10: a keeps-door outside the list, as the ↓ — trim-guard's bar legs), off it _noteUserNav('runBar') (ends the repair); no await in it", [bar(8400), { _windowStart: 260, _windowEnd: 310, _pinned: true }], [bar(0), {}]); }
        row('↓ at the live tail', "chat-view.js the ↓'s onclick: _noteTailPress('scrollBtn') — KEEPS the tail (r8: the stamp only; a click on its own button, it ends the settle window)", (v) => R.scrollBtn.call(v), { _windowStart: 260, _windowEnd: 310 }, 'keeps');
        row('↓ paged out of the tail', "chat-view.js jumpToBottom's first line ('jumpToBottom' — a person's: `user`; its page is the road to the tail)", (v) => R.scrollBtn.call(v));
        row('↓ on a seek slab (return to latest)', "chat-view.js jumpToBottom's first line ('jumpToBottom')", (v) => R.scrollBtn.call(v), { _teleported: true });
        row('a send paged out of the tail', "chat-view.js onSend → jumpToBottom({ send: true })'s first line ('jumpToBottom')", (v) => R.onSend.call(v));
        row('a send at the live tail', "chat-view.js onSend: _noteTailPress('send') — KEEPS the tail (r7's stamp; r8: the stamp only, the repair left armed)", (v) => R.onSend.call(v), { _windowStart: 260, _windowEnd: 310, _pinned: true }, 'keeps');
        row('jumpToIndex (the minimap, a paged ask, a search hit paged in, a landing)', "chat-view.js jumpToIndex's first line ('jumpToIndex')", (v) => v.jumpToIndex(200));
        row('the waiting chip, its ask on screen (jumpToPendingAsk)', "chat-view.js jumpToPendingAsk: _noteUserNav('jumpToAsk') — no await before it", (v) => v.jumpToPendingAsk(), { _pendingAsks: [{ requestId: 'rq', msgIndex: 120 }], _askElement: () => el() });
        row('the waiting chip, its ask paged in (jumpToPendingAsk)', "chat-view.js jumpToPendingAsk → jumpToIndex's first line (r6: never again at the landing)", (v) => v.jumpToPendingAsk(), { _pendingAsks: [{ requestId: 'rq', msgIndex: 200 }] });
        row('positioning (a wheel, a touch, a nav key, a scrollbar drag, PageUp/PageDown in the box)', "chat-view.js _notePositioning (`_lastPositionAt`) — written by the event itself", (v) => { if (['wheel', 'touch', 'key', 'scrollbar-drag'].every((w) => src.CVS.includes(`this._notePositioning('${w}')`)) && /onPageKey: \(dir\) => \{ this\._notePositioning\('key'\);/.test(src.CVS)) v._notePositioning('wheel'); });
        row('search in-page, a hit in the window', "chat-search.js _jumpToSearchResult: _onNav('search') → _noteUserNav (r7 — _revealInEl's fallback, no range, stamped nothing)", (v) => search(v, false));
        row('search in-page, a hit paged in', "chat-search.js _jumpToSearchResult: _onNav('search'), then jumpToIndex's first line", (v) => search(v, false), { _searchAt: 20 });
        row('search full-file (a huge session)', "chat-search.js _jumpToSearchResult: _onNav('search') (r7 — jumpToFileMatch stamped only its landing's _lastJumpAt, out of the list since r6)", (v) => search(v, true), { _teleported: true });
        row('Search everything, the typed query, the stream\'s first hit, ↑ / ↓ between hits', "chat-search.js — every caller of _jumpToSearchResult; its stamp is the first statement after its guard", (v) => { if (/async _jumpToSearchResult\(idx\) \{\n\s+const results = this\._serverSearchResults;\n\s+if \(!results \|\| idx < 0 \|\| idx >= results\.length\) return;\n(?:\s+\/\/[^\n]*\n)*\s+this\._onNav\?\.\('search'\);/.test(src.SRCH)) v._lastNavAt = Date.now(); });
        // the three Retries a failed jump shows (r8 — the census named none: «Couldn't jump there» called _seekTeleport bare) —
        // the jump fails for real, the stamps and the repair are set back, and the person presses Retry
        const retried = async (door, site, fail, o) => {
          let retry = null; const v = view({ ...o, _showHistoryStatus: (m, x) => { if (x && typeof x.retry === 'function') retry = x.retry; } });
          try { await fail(v); } catch { /* the failure is the point */ }
          Object.assign(v, { _lastNavAt: 0, _lastPositionAt: 0, _lastTailPressAt: 0, _lastJumpAt: 0, _fetchMessagePage: hang, _fetchMessages: hang, _gapFetch: hang }, arm());
          if (retry) press(() => retry());
          put(door, site, 'leaves', [{ ...judge(v), threw: !retry, armed: !!retry, navs: v.log.slice() }]);
        };
        const boom = async () => { throw new Error('the page could not be read'); };
        await retried('the Retry on «Couldn\'t jump there» (a failed teleport: a minimap time jump, a full-file hit)', "chat-view-seek.js _seekTeleport's failure notice: retry → _noteUserNav('teleportRetry'), then _seekTeleport (r8 — it called _seekTeleport bare: no stamp on any tree)",
          (v) => v._seekTeleport(4000), { _seekTeleport: R._seekTeleport, _gapQueryBase: () => 'q=1', _gapFetch: async () => ({ ok: false }) });
        await retried('the Retry on «Couldn\'t load that part of the conversation» (jumpToIndex)', "chat-view.js jumpToIndex's failure notice: retry → jumpToIndex's first line", (v) => v.jumpToIndex(200), { _fetchMessages: boom });
        await retried('the Retry on «Couldn\'t load the latest messages» (the tail road)', "chat-view.js jumpToBottom's failure notice: retry → jumpToBottom's first line ('jumpToBottom' — its page is the road to the tail)", (v) => v.jumpToBottom(), { _fetchMessagePage: boom });
        // the needs cards' two doors (the bundled module — r9: a mutant's own bundle, R.NC), on the REAL stamps and the REAL repair
        // (r8 ran them on fakeView's stub _noteUserNav — it never ended the repair — and hard-coded them «leaves»), pressed at
        // the live tail (a one-screen tail, pinned) and off it: the landing's show (its record on screen), the open whose card
        // grew below the list's edge
        const TAIL = { scrollTop: 0, scrollHeight: 600, clientHeight: 600 }, BELOW = { scrollTop: 0, scrollHeight: 1200, clientHeight: 600 };
        const card = (at, go, geo, o = {}) => {
          const C = conv(310, [at]), A = askOf(C, at), v = fakeView(C, [A], 260, 310), nc = cardsFor(v, R.NC); Object.assign(v, o); nc._pass();
          Object.assign(v._messageList, geo);
          Object.assign(v, { _lastNavAt: 0, _lastTailPressAt: 0, _readerActs: R._readerActs || ACTS, _navigatedSince: R._navigatedSince, _positionedSince: R._positionedSince,
            _noteUserNav: R._noteUserNav, _noteTailPress: R._noteTailPress, _endResumeSettle: R._endResumeSettle, _clearResumeRetail: R._clearResumeRetail, _cancelForcedScroll: R._cancelForcedScroll,
            _atLiveTail: R._atLiveTail, _clearWheelCarry() { }, _trace(k, d) { if (k === 'userNav') v.log.push(`nav:${d && d.via}`); } }, arm());
          const done = press(() => go(nc, A.id));
          return { ...judge(v), threw: !done, navs: v.log.slice() };
        };
        put('a needs card landing (the attention dock\'s question, every For-you door)', "chat-needs-card.js land: _noteTailPress('needsLand') as it starts — the stamp only (r9): it keeps the tail until a road leaves it, and each road that leaves stamps its own navigation as it starts (jumpToIndex / jumpToBottom's first line, _show's 'jumpToAsk')", 'both',
          [card(10, (nc, id) => nc.land(id), TAIL, { _fetchMessages: hang }), card(300, (nc, id) => nc.land(id), TAIL)]);
        put('a needs card opened', "chat-needs-card.js openCard: _noteTailPress('needsOpen') as it starts; judged where it lands (r9) — off the tail _noteUserNav('needsOpen') (ends the repair), at the tail its stamp alone", 'both',
          [card(300, (nc, id) => nc.openCard(id), TAIL), card(300, (nc, id) => nc.openCard(id), BELOW)]);
        return out;
      };
      const rows = await census({ CVS, SEEKS, SRCH });
      for (const r of rows) console.log(`    door ${r.ok ? '✓' : '✗'} ${r.door} — ${r.kind === 'both' ? 'BOTH, judged where it lands: at the live tail it KEEPS it (stamped, the repair left armed, the resume\'s question false); off it, stamped and the resume stands down' : r.kind === 'keeps' ? 'KEEPS the tail: stamped, the repair left armed, the resume\'s question false' : 'LEAVES the tail: stamped, the resume stands down'} — ${r.site}`);
      ok(rows.length === 21 && rows.every((r) => r.ok), `RED-able (r7 — 15475151: ✗ search in-page (a hit in the window), search full-file, the search's callers, a send at the live tail; r8 — fdf241de: ✗ ↓ and a send at the live tail (they ENDED the repair), the Retry on «Couldn't jump there» (no stamp); r9 — 215604e74: ✗ the run bar, a needs card landing, a needs card opened (at the live tail they ENDED the repair)): THE DOOR CENSUS — every one of the ${rows.length} doors a person presses writes its reader-act stamp before its first await, and keeps THE RULE inside a resume on the side its state shows — the table's (each named above with its stamp site)`, rows.filter((r) => !r.ok).map((r) => ({ door: r.door, kind: r.kind, js: r.js.map((j) => ({ keeps: j.keeps, stamped: j.stamped, positioned: j.positioned, repair: j.repair, threw: j.threw })) })));
      // r9: THE DOOR TABLE in the kb is the census's own (the operating manual — docs/kb-bugfix-invariants.md): its 21 rows, the
      // same doors in the same order with the same kind (read as bytes, the table's slice alone decoded)
      { const KB = fs.readFileSync(path.join(ROOT, 'docs/kb-bugfix-invariants.md')), a = KB.indexOf('<!-- door-table: the census of test-conversation-needs ⑩g -->'), b = a < 0 ? -1 : KB.indexOf('<!-- /door-table -->', a);
        const kb = a < 0 || b < 0 ? [] : [...KB.toString('utf8', a, b).matchAll(/^\| (\d+) \| (.+?) \| \*\*(keeps|leaves|both)\*\* \|/gm)].map((m) => [Number(m[1]), m[2], m[3]]);
        const ours = rows.map((r, i) => [i + 1, r.door, r.kind]);
        ok(kb.length === 21 && JSON.stringify(kb) === JSON.stringify(ours), 'r9: THE DOOR TABLE in docs/kb-bugfix-invariants.md is the census\'s — the same 21 doors, in its order, each with its kind (keeps / leaves / both)', JSON.stringify(kb.length === 21 ? kb.filter((x, i) => JSON.stringify(x) !== JSON.stringify(ours[i])) : { rows: kb.length }).slice(0, 600)); }
      const redOf = async (srcs) => (await census({ CVS, SEEKS, SRCH, ...srcs })).filter((r) => !r.ok).map((r) => r.door);
      const STAMP = "    this._onNav?.('search');\n", MUT = SRCH.replace(STAMP, '');
      const red = await redOf({ SRCH: MUT });
      ok(MUT !== SRCH && JSON.stringify(red) === JSON.stringify(['search in-page, a hit in the window', 'search full-file (a huge session)', 'Search everything, the typed query, the stream\'s first hit, ↑ / ↓ between hits']), '…and the census BITES: a mutant of chat-search.js dropping the search\'s press stamp is red BY NAME — the in-page hit in the window, the full-file road, the search\'s callers (the paged-in hit stays green: jumpToIndex stamps its own start)', red);
      // r8: THE RULE bites by name too — the send stamped through the whole _noteUserNav again (r7), the resume's question
      // reading the press that keeps the tail, the «Couldn't jump there» Retry unstamped (every tree before r8)
      const M1 = CVS.replace("this._noteTailPress('send');", "this._noteUserNav('send');"), M2 = CVS.replace('this._readerActs({ tail: false })', 'this._readerActs()'), M3 = SEEKS.replace("this._noteUserNav('teleportRetry'); ", '');
      const red1 = await redOf({ CVS: M1 }), red2 = await redOf({ CVS: M2 }), red3 = await redOf({ SEEKS: M3 });
      const NEEDS = ['a needs card landing (the attention dock\'s question, every For-you door)', 'a needs card opened'];
      ok(M1 !== CVS && M2 !== CVS && M3 !== SEEKS && JSON.stringify(red1) === JSON.stringify(['a send at the live tail']) && JSON.stringify(red2) === JSON.stringify(['the run bar', '↓ at the live tail', 'a send at the live tail', ...NEEDS])
        && JSON.stringify(red3) === JSON.stringify(['the Retry on «Couldn\'t jump there» (a failed teleport: a minimap time jump, a full-file hit)']),
        '…and THE RULE BITES BY NAME (r8): the send at the live tail stamped through the whole _noteUserNav again (r7) — red: that send; the resume\'s question reading the press that keeps the tail — red: every door that keeps it (r9: the run bar and the needs cards\' two at the tail too); the Retry on «Couldn\'t jump there» unstamped — red: that Retry', { red1, red2, red3 });
      // r9: and the doors judged where they land bite by name — the run bar's landing and the needs cards' two back on the whole
      // _noteUserNav at both sides (r8 and every tree before): red, those three — the cards' from the mutant's own bundle
      const M4 = CVS.replace("if (atBottom) { this._noteTailPress('runBar'); this._resumeSettleUntil = 0; } else this._noteUserNav('runBar');", "this._noteUserNav('runBar');");
      const CNC = read('src/lib/chat-needs-card.js'), CARD4 = CNC.replace("view._noteTailPress?.('needsOpen');", "view._noteUserNav?.('needsOpen');").replace("view._noteTailPress?.('needsLand');", "view._noteUserNav?.('needsLand');");
      let NC4 = null; try { NC4 = CARD4 !== CNC ? await bundleCards(CARD4) : null; } catch (e) { console.log('    (mutant bundle: ' + (e && e.message) + ')'); }
      const red4 = M4 !== CVS && NC4 ? await redOf({ CVS: M4, NC: NC4 }) : null;
      ok(JSON.stringify(red4) === JSON.stringify(['the run bar', ...NEEDS]), '…and THE DOORS JUDGED WHERE THEY LAND BITE BY NAME (r9): the run bar\'s landing and the needs cards\' landing and open stamped through the whole _noteUserNav again (r8, every tree before) — red: those three, the cards\' from the mutant chat-needs-card.js\'s own bundle', red4);
    } finally { if (raf7 === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = raf7; if (gcs7 === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = gcs7; }
    ok(/onNav: \(via = 'search-reveal'\) => this\._noteUserNav\(via\),/.test(CVS) && /if \(!replay\) \{ this\._lastRevealAt = Date\.now\(\); this\._onNav\?\.\(\); \}/.test(SRCH) && /this\._noteTailPress\('send'\);\n\s+this\._setPinned\(true, 'send'\);\n\s+this\._scrollToBottom\(\);/.test(CVS),
      'r7: the search\'s wiring names its press (\'search\') and keeps the reveal\'s own (\'search-reveal\', with its _lastRevealAt — chat-view-seek\'s c-v restore reads its arm by it); the send at the live tail stamps before it pins (r8: as a press that KEEPS the tail — the stamp only)');
    // ── ⑩h THE TAIL, ROUND 8 (the r7 delta verdict on fdf241de): THE RETRY ON «Couldn't jump there» IS A PRESS — it called
    // _seekTeleport bare and wrote no stamp (on every tree), so an OLDER needs card landing whose read was out answered after
    // the slab the Retry landed and took the reader off it (and inside a resume the re-tail yanked it back to the live tail).
    // The REAL _seekTeleport / _resetGapAfterJump (chat-view-seek.js), the REAL NeedsCards bundle, the REAL jumpToIndex /
    // _readerActs / _navigatedSince; the Retry pressed as the pill's link presses it (retry())
    console.log('⑩h THE TAIL r8 — a press that keeps the tail never ends the resume repair (the census, above); the Retry on «Couldn\'t jump there» is a press');
    { const rafH = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0; try { // (the REAL centring loop: its first step only)
      const SEEKT = methodOf(SEEKS, '    async _seekTeleport(line) {', '    async jumpToFileMatch(match) {'), RESET = methodOf(SEEKS, '    _resetGapAfterJump() {', '    async _loadEarlierGap(');
      const C = conv(310, [10]), A = askOf(C, 10);
      const v = roads(fakeView(C, [A], 100, 150), C), nc = cardsFor(v);
      const gate = deferred(); let calls = 0, gapCalls = 0, retry = null;
      Object.assign(v, { _scrollElStable: REAL5._scrollElStable, _navigatedSince: REAL5._navigatedSince, _lastJumpAt: 0, _scrollToBottom() { v.log.push('scrollToBottom'); },
        _cancelForcedScroll() { }, _clearWheelCarry() { }, _endResumeSettle() { }, _reportVisibleTsRange() { },
        _seekTeleport: SEEKT, _resetGapAfterJump: RESET, _gapQueryBase: () => 'q=1', _setStableHeights() { }, _installSeekSentinel: () => ({}), _scheduleAxSync() { }, _scrollBtn: { classList: { add() { }, remove() { } } }, _gapElForLine: () => null,
        _gapFetch: async () => { gapCalls++; v.log.push(`gap#${gapCalls}`); return gapCalls === 1 ? { ok: false } : { ok: true, data: { messages: [{ id: 's3700' }, { id: 's3701' }], fromLine: 3700, toLine: 4300 } }; },
        _renderGapMsg: (msg) => { const el = new El(); el.classList.add('chat-msg'); el.dataset.msgId = msg.id; return el; },
        _showHistoryStatus(msg, o) { v.log.push(`status:${msg}`); if (o && o.retry) retry = o.retry; }, _hideHistoryStatus() { } });
      v._messageList.appendChild = (c) => v._messageList.append(c);
      v._noteUserNav('jumpToFileTime'); await v._seekTeleport(4000);           // the first press (a minimap time jump): its teleport FAILS — the notice, its Retry
      const armed = typeof retry === 'function';
      await tick(3);
      v._fetchMessages = async (o, l) => { calls++; v.log.push(`fetch(${o},${l})`); await gate.p; return C.slice(o, o + l); };
      v._pinned = false; nc._pass();
      const landing = nc.land(A.id);                                            // the OLDER press: a needs card landing, its read out
      for (let k = 0; k < 60 && calls < 1; k++) await tick(2);
      await tick(3);                                                            // (gone() compares times)
      if (armed) await retry();                                                 // the NEWER press: Retry
      const atSlab = { teleported: v._teleported, slab: v._messageList.querySelectorAll('.chat-msg').map((e) => e.dataset.msgId).join(',') };
      gate.open(); const res = await landing;                                   // the landing's read answers after the slab landed
      const r = { armed, atSlab, res, window: `${v._windowStart}..${v._windowEnd}`, teleported: v._teleported, slab: v._messageList.querySelectorAll('.chat-msg').map((e) => e.dataset.msgId).slice(0, 2).join(','), navs: v.log.filter((l) => l.startsWith('nav:')) };
      ok(armed && atSlab.teleported && res === null && r.teleported && r.slab === 's3700,s3701' && r.navs.includes('nav:teleportRetry'),
        'RED-able (r8 — fdf241de, 15475151 and every tree before: \'card\', the reader taken off the retried slab to 0..50): the RETRY on «Couldn\'t jump there» stamps as it starts, so an OLDER needs card landing whose read was out answers nothing — the reader stays on the slab the Retry landed', r);
    } finally { if (rafH === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = rafH; } }
  }
  // THE WIRING (source pins)
  const CV = read('src/lib/chat-view.js'), CARD = read('src/lib/chat-needs-card.js'), UTA = read('src/lib/user-todos-actions.js');
  const xt = CV.slice(CV.indexOf('  async _extendTop('), CV.indexOf('  async _extendBottom('));
  ok(/this\._messageList\.insertBefore\(frag, ref\);\n\s+this\._loadingHistory = false;\n(?:\s+\/\/[^\n]*\n)+\s+if \(msgs\.length && Array\.isArray\(this\._messages\)\) \{ const slab = new Set\(msgs\.map\(\(m\) => m\.id\)\); this\._messages = \[\.\.\.this\._messages\.filter\(\(m\) => slab\.has\(m\.id\)\), \.\.\.this\._messages\.filter\(\(m\) => !slab\.has\(m\.id\)\)\]; \}/.test(xt) && /loadedRecords\(\) \{ return this\._messages \|\| \[\]; \}/.test(CV) && /typeof v\.loadedRecords === 'function' \? v\.loadedRecords\(\) : v\._messages/.test(CARD), 'r2 #1 chat-view OWNS THE ORDER: a page of older history goes FIRST in its records (it is drawn above the window); loadedRecords() is the order the cards read');
  ok(/if \(stale && stale\(\)\) \{ this\._trace\('jumpToIndex:stale'/.test(CV) && /const gone = \(\) => gen !== this\._landGen \|\| !!view\._disposed \|\| !!view\._navigatedSince\?\.\(mark\);/.test(CARD) && /const gen = \+\+doorGen, since = Date\.now\(\);/.test(UTA), 'r2 #3 the displacement law: a landing\'s generation, the reader\'s own move and a dispose cancel it (jumpToIndex asks `stale` once its page is read); a door\'s newer press drops an older one');
  ok(/if \(host && !host\.getClientRects\(\)\.length\) view\.revealRecord\?\.\(host\);\n\s+if \(!el\.getClientRects\(\)\.length\) return false;/.test(CARD) && /revealRecord\(el\) \{\n\s+if \(!el \|\| !el\.isConnected\) return false;\n\s+const run = this\._runs\?\.find\(\(r\) => !r\.open && r\.members\?\.includes\(el\)\);\n\s+if \(run\) this\._setRunOpen\(run, true\);/.test(CV), 'r2 #4 a landing unfolds the run that holds its record (chat-view revealRecord — a deliberate open); a target with no box is never landed on');
  ok(/const keep = sig !== this\._placeSig && !hold && !view\._pinned \? this\._readerLine\(\) : null;/.test(CARD) && (CARD.match(/this\._keepReader\(keep\);/g) || []).length === 2, 'r2 minor the reader-position law for a swap: a pass that moves a card while the reader is scrolled away keeps the reader\'s top record where it stood (read only when the placement changed)');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(read(f).includes(JSON.stringify('The record that filed it is not drawn in this chat') + ':'), `r2 ${f}: «the record is not drawn» is worded`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
