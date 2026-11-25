#!/usr/bin/env node
// THE CONVERSATION's NEEDS — SOURCE CENSUSES AND PINS (fast — source text, plus the few PURE in-process legs that sat inside the moved blocks; no browser, server or hub — lane text-legs, B-94d3). MOVED VERBATIM from
// scripts/test-conversation-needs.mjs (heavy only for its time, 1.76 s: its PURE + in-process legs stay there): ① THE CENSUS (every
// add() site a producer row of PURE src/foryou-actions.js, with its RED copies), ⑥'s filed-line pins and their census
// (src/agent-routes/status.js, src/server/channels-access.js, src/routes/vault.js …), ⑦'s `about` pins (src/agent-routes.js,
// src/server/channels-access.js), ⑧ THE WIRING (src/lib/chat-needs-card.js, src/lib/chat-view.js, src/lib/user-todos-panel.js …),
// ⑩'s words gone + its wiring pins, ⑩b's wiring pins. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this
// suite on any change of one of them.
// Run: node scripts/test-conversation-needs-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CN = require(path.join(ROOT, 'src/foryou-actions.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');


// ── ① THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① THE CENSUS — every producer a row (its origin, where it files, its action types); every type a BY_TYPE row');
// scope: 'conversation' = files under the conversation's own key · 'about' = a group key + `about` naming the conversation ·
// 'group' = a group key only (no conversation — no chat draws it) · 'mixed' = some sites of each
const PRODUCERS = {
  'src/server/spend-guard.js': { origin: 'spend', scope: 'group', types: [] },
  'src/server/setting-holds.js': { origin: 'spend', scope: 'group', types: [], why: 'lane setting-doors pick 2: ONE notice when a held ceiling\'s return could not be written, or the holds could not be read at boot — the Spending group, the row named with its link; no conversation (the return is the hub\'s act)' },
  'src/server/login-expiry-watch.js': { origin: 'login', scope: 'group', types: [] },
  'src/accounts.js': { origin: 'login', scope: 'group', types: [], why: 'the B-f276 family (lane bl-windows, r3046): ONE notice while the accounts list cannot be read (closed at the lift)' },
  'src/migration-runner.js': { origin: 'server', scope: 'group', types: [], why: 'int365 seam F (.365): a boot migration that failed files ONE notice per migration id in the hub\'s «Migrations» group (lane job-secrets-retire r3/r4 sayFailed) — it only informs (the retry is automatic at the next start), no action type' },
  'src/server/migrations.js': { origin: ['vault', 'browser'], scope: 'group', types: ['job-secrets-retired'], why: 'int365 seam F (.365): the retired job-secrets store\'s ONE notice in the Vault group (lane job-secrets-retire r2) — B-ef1b: its action job-secrets-retired draws its two buttons (Move into the vault / Delete the file — src/server/job-secrets-door.js); the «Two files» notice (move one out and restart) still files no action type; int376 (.376): + the CloakBrowser-to-plugin notice (2026-11-cloak-to-plugin, lane engine-spi-egress L3) in the Agent browser group — origin \'browser\', its own notice, no action type — so this file files from TWO origins' },
  'src/server/job-secrets-door.js': { origin: 'vault', scope: 'group', types: [], why: 'bl-vault B-ef1b (主开发 r191, r333): copies a move of the retired job secrets sealed and could not remove (a drop refused; a hub that ended mid-move — the record comes first), or that record set aside unread, file ONE notice in the Vault group — no action type; each unlock and the next move try again, and it is settled once nothing is left' },
  'src/server/device-upgrade-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/device-alerts.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/host-key-watch.js': { origin: 'machines', scope: 'group', types: ['host-key'] },   // lane lg-remote-hardening (B-7f0b): a machine whose ssh host key changed — its item opens that machine's Host key… (`opens`)
  'src/server/hub-act-ask.js': { origin: 'machines', scope: 'group', types: ['hub-act-ask', 'hub-act-standing'], why: 'the asker is named only in the act\'s `by` — OPEN: no `about` yet; lane ledger-dedup-law F3: + a background subject\'s ONE standing notice (no conversation asks it)' },
  'src/server/automation-engine.js': { origin: 'vault', scope: 'conversation', types: ['automation-ask'] },
  'src/server/vault-run-door.js': { origin: 'vault', scope: 'mixed', types: ['vault-run-ask', 'vault-grant-ask', 'vault-store-refused', 'vault-grant-stale', 'vault-policy-approved'] },
  'src/server/vault-hooks.js': { origin: 'vault', scope: 'group', types: ['vault-unlock', 'vault-use-failed', 'vault-rotate'] },
  'src/server/dial-health-watch.js': { origin: 'machines', scope: 'group', types: [] },
  'src/server/usage-pool-engine.js': { origin: 'pool', scope: 'mixed', types: ['reset-credit', 'pool-cross-provider'] },
  'src/server/jobs-wiring.js': { origin: 'jobs', scope: 'mixed', types: [], why: 'a job\'s ask is answered in its own form (jobId) — no card; a job with no owner conversation files under the Background Work group, and (B-2566\'s remainder) the «results wait for a machine» item is the machine\'s, in that group — no conversation draws it, nothing to press' },
  'src/server/channels-engine.js': { origin: 'channels', scope: 'group', types: ['channel-reauth', 'channel-store-damaged'] },   // B-f276 1b: + a damaged channels file's door
  'src/server/channels-access.js': { origin: 'channels', scope: 'about', types: ['open-channel', 'channel-watch-request', 'channel-held-digest'] },   // r6: a held digest's decision (no `about` — the owner's tray)
  'src/server/groups-engine.js': { origin: 'channels', scope: 'group', types: ['open-channel'], why: 'int388 seam (.388): lane paced-wake-retry\'s owner item for a held group wake that fell (sign-in off). ' + 'Scope group because of two fields read at its one add() (groups-engine.js, userTodos.add(\'channels\', {…})): the first argument is the hub\'s «channels» GROUP key, not a conversation key, and the item object carries NO `about` field (this census reads `about:` at the site). ' + 'The lane added test-user-todos-layout\'s fast row only; a For-you producer owes a row in BOTH censuses' },
  'src/server/channels-outbound.js': { origin: 'channels', scope: 'group', types: ['open-channel', 'open-outbox'], why: 'a reply / reaction / recall proposal is its own card in the chat (channel-touch-view chatProposalCards); an account\'s composed messages awaiting approval are ONE pointer whose door is the Outbox (open-outbox — lane ui-needs-a-button pick 6)' },
  'src/server/channel-api-cards.js': { origin: 'channels', scope: 'group', types: ['channel-api-proposal'] },
  'src/server/channels-auth.js': { origin: 'channels', scope: 'group', types: ['channel-connect'] },   // lane bl-mail (B-8edd): a landed sign-in nobody connected — «finish connecting», under the channels group key
  'src/server/browser-handback.js': { origin: 'browser', scope: 'conversation', types: ['browser-takeover'] },
  'src/server/browser-builds-keeper.js': { origin: 'browser', scope: 'group', types: [] },
  'src/server/browser-disk-run.js': { origin: 'browser', scope: 'group', types: [] },
  'src/server/browser-keeper.js': { origin: 'browser', scope: 'group', types: ['browser-floor-check', 'browser-restart'] },
  'src/server/mounts-plugins-wiring.js': { origin: 'browser', scope: 'mixed', types: ['browser-proposal', 'browser-surface'], why: 'int360 seam: the browser\'s forYou adapters — browser-dialogs\' kernel prompt (browser-surface) and passkey lines are filed through them' },
  'src/server/browser-logins.js': { origin: 'browser', scope: 'group', types: ['save-login'], why: 'int360 seam (lane browser-login): the save-login / pending-confirm card + its notices, under the browser\'s group key' },
  'src/server/browser-dialogs.js': { origin: 'browser', scope: 'group', types: [], why: 'lane vault-login r22: live-fill ceiling notice under the browser\'s group key' },
  'src/server/browser-propose.js': { origin: 'browser', scope: 'conversation', types: ['browser-proposal'] },
  'src/agent-routes/status.js': { origin: 'agent', scope: 'conversation', types: ['browser-grant', 'setting-change'] },   // lane setting-doors pick 2: + an ask that proposes one change of one setting (`--propose`)
  'src/server/end-proposals.js': { origin: 'agent', scope: 'conversation', types: ['end-proposal'], why: 'lane login-request-card piece 3b: THE PROPOSAL CARD — an agent\'s proposal (to end conversations, or that its jobs may wake it) filed under the PROPOSER\'s own key; ONE card per proposer (two add() sites: the end and the wake kinds)' },
  'src/server/helper-asks.js': { origin: 'agent', scope: 'conversation', types: ['helper-ask'] },
  'src/server/main-asks.js': { origin: 'agent', scope: 'conversation', types: ['main-ask'] },
  'src/server/unexpected-exit.js': { origin: 'agent', scope: 'conversation', types: [] },
  'src/exit-proxy.js': { origin: 'machines', scope: 'conversation', types: ['exit-run-ask'] },
  'src/server/memory-pressure-watch.js': { origin: 'server', scope: 'group', types: [] },
  'src/watch-door.js': { origin: 'server', scope: 'group', types: [], why: 'hotfix 2.369.411 (lane bl-loop-b): the machine\'s limit of file watches — ONE notice per limit episode, at most one an hour, under the `watch-limit` key (filed through memory-pressure-watch configure()); its words name the command that raises the limit, it files no action type' },
  'src/server/task-groups-wiring.js': { origin: 'server', scope: 'group', types: [], why: 'hotfix 2.369.411 (lane bl-windows): the Task Groups store held unread — ONE notice per hold of the store, under the `task-groups-unread` key; it only informs, no action type' },
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
  'src/server/usage-reading-for-you.js': { origin: 'server', scope: 'group', types: ['usage-reading-unread'] },   // r3136 / r3200: an account's unreadable usage file — ONE item an account, its Set it aside door
  'src/server/queued-file-for-you.js': { origin: 'server', scope: 'group', types: ['queued-file-unread'] },   // B-e3fe follow-up: an unreadable data/msg-queued.json — ONE item, its Set it aside door
  'src/server/mount-for-you.js': { origin: 'server', scope: 'group', types: ['mount-reconnect', 'mount-reauth'] },   // B-e40d: + a replaced preset client's Re-authorize   // B-5ce7: a parked mount's item carries its Reconnect
  'src/server/hooks-late.js': { origin: 'agent', scope: 'group', types: [] },
  'src/server/apps-engine.js': { origin: 'apps', scope: 'mixed', types: ['app-install'] },
  'src/server/oat-identity.js': { origin: 'login', scope: 'group', types: ['oat-token-check'] },   // B-8703 (主开发 r4450): its four items' door
  'src/server/cli-unmeasured-notice.js': { origin: 'pool', scope: 'group', types: ['cli-check-again'] }, // lane cli-self-measure: a FAIL / cannot-run / stopped check's item carries «Check again»
  'src/server/vault-job-door.js': { origin: 'vault', scope: 'conversation', types: ['vault-job-ask'] },   // B-a08e (lane vault-job-approval): a Background job's approval card, filed under its owner conversation
  'src/server/vault-paste-door.js': { origin: 'vault', scope: 'conversation', types: ['secret-request', 'vault-words-ask'] },   // + lane vault-entry-description: an agent's proposal of an entry's words
  'src/server/feedback-forward.js': { origin: 'server', scope: 'group', types: [] },
  'src/server/wait-watch.js': { origin: 'agent', scope: 'conversation', types: ['messages-waiting'] },   // lane queued-is-not-woke laws 2 + 3 (shape C): the «messages waiting» item, under the conversation's own key
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
    // int376: a row may name SEVERAL origins (src/server/migrations.js files the Vault group's job-secrets notice AND the Agent
    // browser group's CloakBrowser notice) — a site of an origin its row does not name is still red by name
    const origins = [].concat(row.origin);
    if (!origins.includes(x.origin)) problems.push(`${x.rel}:${x.line} declares '${x.origin}', its census row says '${origins.join("' / '")}'`);
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
{ // int376 CONTROL: a row naming two origins does not admit a third — a planted agent-origin site under migrations.js' row is red by name
  const fl = { ...files, 'src/server/migrations.js': files['src/server/migrations.js'] + "\nstore.add('x', { origin: 'agent', text: 'planted' });\n" };
  ok(census(PRODUCERS, CN.BY_TYPE, fl, sitesOf(fl)).some((p) => /migrations\.js:\d+ declares 'agent', its census row says 'vault' \/ 'browser'/.test(p)), 'CONTROL (int376): a two-origin row (vault / browser) still refuses a third origin by name'); }
{ const fl = { ...files, 'src/server/new-producer.js': "x.add(key, { origin: 'agent', text: 'hi' });\n" }; ok(census(PRODUCERS, CN.BY_TYPE, fl, sitesOf(fl)).some((p) => /new-producer\.js:1 files a For-you item — a producer missing/.test(p)), 'RED: a NEW producer file is named until its row is written'); }
{ const fl = { ...files, 'src/server/new-producer.js': "x.add('channels', { origin: 'channels', text: 'hi', action: { type: 'chan-new-ask', id } });\n" }; const p = census({ ...PRODUCERS, 'src/server/new-producer.js': { origin: 'channels', scope: 'group', types: [] } }, CN.BY_TYPE, fl, sitesOf(fl)); ok(p.some((x) => /'chan-new-ask' is spelled by a producer/.test(x)), 'RED: a NEW action type a producer spells is named until BY_TYPE has its row'); }


// ── ⑥ the filed line's source pins and their census (moved from ⑥) ──
console.log('⑥ the filed line — the call sites (source pins)');
const SRC = { status: read('src/agent-routes/status.js'), access: read('src/server/channels-access.js'), vault: read('src/routes/vault.js'), ask: read('data/bin/vibespace-ask'), chan: read('data/bin/vibespace-channels'), vv: read('data/bin/vibespace-vault'), exit: read('data/bin/vibespace-exit') };
ok(/filed: CN\.filedLine\(item, item\.id, OF\.tray\(\)\)/.test(SRC.status) && /if \(answer\.filed && !item\.existing\) console\.log\(answer\.filed\);/.test(SRC.ask), 'vibespace-ask: the route answers `filed` worded from the ITEM it filed (a notice, a grant, an ask) and the CLI prints it');
ok(/filed: CN\.filedLine\('open-channel', req\.id, OF\.tray\(\)\)/.test(SRC.access) && /filed: CN\.filedLine\('channel-watch-request', req\.id, OF\.tray\(\)\)/.test(SRC.access) && (SRC.chan.match(/console\.log\(r\.filed\);/g) || []).length === 2, 'vibespace-channels watch --mode wake + request: the engine answers `filed` from ITS row (channel-watch-request / open-channel), the CLI prints it');
ok(/filed: CN\.filedLine\('vault-grant-ask', r\.todoId, OF\.tray\(\)\)/.test(SRC.vault) && /filed: CN\.filedLine\('secret-request', r\.requestId, OF\.tray\(\)\)/.test(SRC.vault) && /filed: CN\.filedLine\('vault-words-ask', r\.todoId, OF\.tray\(\)\)/.test(SRC.vault) && (SRC.vv.match(/console\.log\(d\.filed\);/g) || []).length === 4, 'vibespace-vault request (a grant) + a paste request + a STANDING request (lane vault-standing-request) + a words proposal (lane vault-entry-description: describe): the route answers `filed` from ITS row, the CLI prints it');
{
  // every call names a REGISTRY ROW (or passes the item) — never a kind, never a type without a row
  const calls = [...Object.values(SRC).join('\n').matchAll(/CN\.filedLine\(('([^']*)'|[A-Za-z_.]+)/g)].map((m) => m[2] != null ? m[2] : `<${m[1]}>`);
  const off = calls.filter((c) => !c.startsWith('<') && !CN.ROW_OF[c]);
  ok(calls.length === 6 && !off.length,   // lane vault-entry-description: + vault-words-ask
 `the ${calls.length} filedLine calls each name a registry row or pass the item (${calls.join(', ')})`, off);
}
ok((SRC.exit.match(/an approval card in this conversation and in the For-you tray|Filed for you: an approval — answer it on the card in this conversation or in the For-you tray/g) || []).length === 2, 'vibespace-exit (ask me each time): the 60 s wait line names the card in this conversation');   // stale-pins: kept — B-48a4 U3: run's note is the pull / push one now; the older words stay accepted

// ── ⑦ the `about` pins (moved from ⑦'s store block — the store's runtime legs stay) ──
console.log('⑦ the store keeps `about` — its call sites (source pins)');
{
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
ok(/import \{ NeedsCards, hiddenRecord \} from '\.\/chat-needs-card\.js';/.test(CV) && /this\._needsCards = new NeedsCards\(this\);\n\s+this\._needsCards\.start\(winInfo\?\._listenerCtl\?\.signal\);/.test(CV) && /this\._needsCards\?\.stop\(\)/.test(CV), 'the chat view starts the cards for its window and stops them with the view');
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
  ok(/if \(!entry\) \{\n\s+if \(!dock\.hidden\) \{ dock\.hidden = true; rows\.replaceChildren\(\); \}/.test(dp) /* r16: a strip that goes says so through its observer (test-user-todos-layout ㉝ D) */ && /all\.hidden = !\(d && d\.n > 1\);/.test(dp) && /t\('\{n\} more · View all', \{ n: d\.more \}\)/.test(dp) /* lane foryou-dock-layout: how many MORE, on the head's line */ && /this\.app\.openInbox\?\.\(\{ sessionKey: this\.app\.foryouRows\?\.primaryKey\?\.\(keys\) \|\| keys\[0\] \}\);/.test(dp) && /primaryKey, \/\/ lane needs-card-tail r10/.test(PANEL), 'empty ⇒ the strip is absent; one ⇒ one row; several ⇒ «N more · View all» — the For-you window scoped to this conversation (the mini inbox\'s key), never a «show more» inside the strip');
  ok(/const kept = cur && boxInUse\(cur\.querySelector\('\.ut-reply'\)\) \? cur\.dataset\.id : null;/.test(dp) && /this\.view\._attnDock\?\.addEventListener\('ut-box-left', go, \{ signal: own \}\);/.test(CARD) && /if \(sig !== this\._dockSig \|\| made\) \{ this\._dockSig = sig; this\.app\.foryouRows\?\.arm\?\.\(dock\); \}/.test(dp), 'THE row\'s keep rule in the strip: a row whose reply box is in use stays under the typist (open or answered) until the box is left (`ut-box-left`); what appeared under the pointer is armed afresh (the press arm — a new key, and r14: any patch that made a button)');
  ok(/const q = ev\.target\.closest\('\.cad-rows \.ut-item > \.ut-body > :is\(\.ut-text, \.ut-meta\)'\);/.test(dp) && /if \(ev\.target\.closest\('\.fy-link, \.ut-art, button, textarea, input, summary'\)\) return;/.test(dp) && /this\.land\(item\.id\)\.catch\(\(\) => \{\}\);/.test(dp) && /inboxModel\(this\.app\)\.isDoor\?\.\(item\.sessionKey, item\)\) return;/.test(dp), 'a tap on the strip\'s question lands the ORIGINAL card (THE ONE LANDING — a navigation the owner asked for); a link, a verb, a box answer themselves; a door item\'s tap stays the row\'s');
  ok(/new ResizeObserver\(\(\) => \{ const v = this\.view; if \(v\._pinned && !v\._disposed\) v\._scrollToBottom\?\.\(\); this\.app\.foryouRows\?\.chromeMoved\?\.\(\); \}\)\)\.observe\(dock\);/.test(dp) /* r16: and THE ONE ROAD of its size to the announce and the toasts */ && /this\._dockRO\?\.disconnect\(\)/.test(CARD), 'the strip changing size keeps a PINNED view at the live tail (a reader in history keeps their line: the list shrinks below it); its observer goes with the view'); }
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
  ok(!/chat-status-foryou|chat-needs-pick|\.cn-dock\b/.test(CC) && /\.chat-attn-dock\[hidden\] \{ display: none; \}/.test(CC) && /\.cad-rows \{ order: 3; flex: 1 1 100%; min-width: 0; \}/.test(CC) && /\.chat-attn-dock > \.cad-all \{ margin-left: auto; \}/.test(CC) && !/@container[^{]*\{\s*\.cad-rows \{/.test(CC) /* lane foryou-dock-layout: one column at EVERY width */ && /\.cad-rows \.ut-body > \.ut-opts \{[^}]*flex: 1 1 100%;[^}]*flex-wrap: wrap;[^}]*overflow: visible;/.test(CC) && !/\.cad-rows \.ut-opt \{[^}]*text-overflow: ellipsis/.test(CC), 'r10 the strip\'s rules: hidden ⇒ no box; the row under the head\'s line at every width (lane foryou-dock-layout — r10 did it under 520 px only); the options on a line of their own, WRAPPING, never cut (THE OPTIONS LAW — the owner 2026-11-13: one sideways line hid them at 500 px); the chip\'s and the dock line\'s rules gone'); }
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
// (lane mask-value-shape) the status bar draws from the strip's ONE table and folds nothing: the regular class's keep-set is gone
ok(/PHONE_BAR_NEVER_FOLD = Object\.freeze\(\[/.test(TC) && !/PHONE_BAR_NEVER_FOLD = Object\.freeze\(\[[^\]]*'foryou'/.test(TC) && !/REGULAR_BAR_KEEP/.test(BAR) && !/chip\('foryou'/.test(BAR) && !/row\('foryou'/.test(read('src/lib/strip-table.js')), 'r10: no bar keeps a «foryou» key — what waits on the person is the window\'s strip, never a bar chip (the strip\'s table has no such row)');   // stale-pins: kept — a «gone» check: the keep-set must stay out
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
      if (r.about === false && readsAbout) problems.push(`SURFACES.${k}: ${r.fn} reads \`about\` — its row says the conversation's own key BY LAW (false): say true and why`); // lane artifacts-by-intent (.401)
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
  ok(S0.length === 0, `every surface is a row and says the truth about \`about\` (${Object.keys(CN.SURFACES).length} rows: ${Object.entries(CN.SURFACES).map(([k, r]) => k + (r.about === true ? '' : r.about === false ? ' (own key by law)' : ' (deferred)')).join(', ')})`, S0);
  ok(Object.values(CN.SURFACES).filter((r) => r.about === 'deferred').length === 3, 'the deferred surfaces are named — the title-bar badge, the mini inbox, the session row\'s marker count the conversation\'s own key only (a watch request counts on the chip, not on the badge)');
  // lane artifacts-by-intent (.401): the ask route's own read for the Artifacts list is a row — the conversation's own key BY LAW (an ask is
  // filed only under askKey, never with `about`); dropped from the registry it is named; the day it reads `about` it is red until its row says so
  ok(!!CN.SURFACES['ask-artifacts'] && CN.SURFACES['ask-artifacts'].file === 'src/agent-routes/status.js' && CN.SURFACES['ask-artifacts'].fn === 'asksOf' && CN.SURFACES['ask-artifacts'].about === false, 'the ask route\'s read for the Artifacts list (asksOf) is a row: the conversation\'s own key by law (about: false)', CN.SURFACES['ask-artifacts']);
  { const r = { ...CN.SURFACES }; delete r['ask-artifacts']; ok(surfaceCensus(r).some((p) => /src\/agent-routes\/status\.js asksOf\(\) picks a conversation's items by sessionKey — a surface missing/.test(p)), 'RED: asksOf dropped from the registry is named'); }
  { const st = files['src/agent-routes/status.js'] || ''; const fl = { ...files, 'src/agent-routes/status.js': st.replace('return store.idsWhere((i) => IO.isAsk(i) && keys.has(i.sessionKey))', 'return store.idsWhere((i) => IO.isAsk(i) && (keys.has(i.sessionKey) || keys.has(i.about)))') }; ok(fl['src/agent-routes/status.js'] !== st && surfaceCensus(CN.SURFACES, fl).some((p) => /SURFACES\.ask-artifacts: asksOf reads `about` — its row says the conversation's own key BY LAW/.test(p)), 'RED: asksOf reading `about` while its row says own key by law (false) is named'); }
  { const r = { ...CN.SURFACES }; delete r['mini-inbox']; ok(surfaceCensus(r).some((p) => /miniInboxEntries\(\) picks a conversation's items by sessionKey — a surface missing/.test(p)), 'RED: a surface dropped from the registry is named'); }
  { const r = { ...CN.SURFACES, 'title-badge': { ...CN.SURFACES['title-badge'], about: true } }; ok(surfaceCensus(r).some((p) => /SURFACES\.title-badge: inboxBadgeFor claims `about` but never reads it/.test(p)), 'RED: a deferred surface claimed as done is named'); }
  { const fl = { ...files, 'src/lib/user-todos-layout.js': files['src/lib/user-todos-layout.js'].replace('export function sessionMark(open, keys) {', 'export function sessionMark(open, keys) { if (keys && keys.about) return null;') }; ok(surfaceCensus(CN.SURFACES, fl).some((p) => /SURFACES\.session-marker: sessionMark reads `about` now — its row must say true/.test(p)), 'RED: a deferred surface that starts reading `about` is named until its row says so'); }
}

// ── ⑩ the words gone and the wiring pins (moved from ⑩'s block) ──
console.log('⑩ THE TAIL — its words gone, its wiring (source pins)');
{
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
  ok(land.indexOf('const now = here();') > 0 && land.indexOf('await this._anchorIndex(item') > land.indexOf('const now = here();') && /await ours\(view\.jumpToIndex\(idx, \{ land: \(\) => \{ if \(!gone\(\)\) landed = here\(\); \}, stale: gone \}\)\);/.test(land) && /const tail = \(\) => here\(\);\n(?:\s+\/\/[^\n]*\n)*\s+const atEndSaid = \(\) => \{ if \(isCard\) this\._dockMark\(\); if \(isCard && idx === -1\) showToast\(stripWithholds\(item\)\.length \? t\('Asked before this conversation\\'s record was kept — there is no card for it in the chat; the strip above the message box offers Allow once and Deny — «Always» and the hosts it sends to are on its card in For you'\) : t\('Asked before this conversation\\'s record was kept — there is no card for it in the chat; answer it in the strip above the message box or in For you'\), \{ type: 'info' \}\); return 'end'; \};/.test(land) /* r15: the words say what the strip offers (test-user-todos-layout ㉝); r16: «Always» and the hosts */ && /view\._scrollToBottom\?\.\(\);\n\s+return atEndSaid\(\);/.test(land) && /if \(card\) return show\(card\) \? 'card' : null;/.test(land), 'THE ONE LANDING: here → the read toward the filing → the window loaded there; r10: an open ask the read PROVED has no record lands at the live END and is SAID there; r11: any open card that ends there MARKS the strip (never docked into the flow)');
  ok(/return filingIndex\(item, readPage, \{ start, end: Number\.isFinite\(view\._windowEnd\) \? view\._windowEnd : null, total: Number\.isFinite\(view\._total\) \? view\._total : null, rows: this\._records\(\)(?:, onHit)? \}\);/.test(CARD10) && /if \(land\) land\(relIdx >= 0 && relIdx < allMsgs\.length \? allMsgs\[relIdx\] : null\)/.test(CV10), 'the read goes through the view\'s own page fetch; jumpToIndex tells its `land` the record it loaded');
  ok(/\} else landOnFiling\(item\); \/\/ lane needs-card-tail \(R5\)/.test(UTA) && /app\.resumeSession\(s\.sessionId, s\.cwd, displayName\(s\), \{ backend: s\.backend, hostId: s\.hostId \|\| s\.host \|\| undefined \}\); landOnFiling\(item\); \}/.test(UTA), 'R5 every For-you door to a conversation lands through the same landing (an open view, a resumed one)');
}

// ── ⑩b the wiring pins (moved from ⑩b's block) ──
console.log('⑩b THE TAIL r2 — its wiring (source pins)');
{
  // THE WIRING (source pins)
  const CV = read('src/lib/chat-view.js'), CARD = read('src/lib/chat-needs-card.js'), UTA = read('src/lib/user-todos-actions.js');
  const xt = CV.slice(CV.indexOf('  async _extendTop('), CV.indexOf('  async _extendBottom('));
  ok(/this\._messageList\.insertBefore\(frag, ref\);\n\s+this\._loadingHistory = false;\n(?:\s+\/\/[^\n]*\n)+\s+if \(msgs\.length && Array\.isArray\(this\._messages\)\) \{ const slab = new Set\(msgs\.map\(\(m\) => m\.id\)\); this\._messages = \[\.\.\.this\._messages\.filter\(\(m\) => slab\.has\(m\.id\)\), \.\.\.this\._messages\.filter\(\(m\) => !slab\.has\(m\.id\)\)\]; \}/.test(xt) && /loadedRecords\(\) \{ return this\._messages \|\| \[\]; \}/.test(CV) && /typeof v\.loadedRecords === 'function' \? v\.loadedRecords\(\) : v\._messages/.test(CARD), 'r2 #1 chat-view OWNS THE ORDER: a page of older history goes FIRST in its records (it is drawn above the window); loadedRecords() is the order the cards read');
  ok(/if \(stale && stale\(\)\) \{ this\._trace\('jumpToIndex:stale'/.test(CV) && /const gone = \(\) => gen !== this\._landGen \|\| !!view\._disposed \|\| !!view\._readerActedSince\?\.\(mark\);/.test(CARD) && /const gen = \+\+doorGen, since = Date\.now\(\);/.test(UTA), 'r2 #3 the displacement law: a landing\'s generation, the reader\'s own move and a dispose cancel it (jumpToIndex asks `stale` once its page is read); a door\'s newer press drops an older one');
  // B-43f3's drag term (the coordinator's r2579: ONE stop, not two lists): the needs landing's gone() above and the jump hold's
  // letGo ask the view's ONE hold question, and it reads the scrollbar (pressed since, held now) beside every reader-act stamp
  { const SEEK = read('src/lib/chat-view-seek.js');
    ok(/const letGo = \(\) => gone \|\| \(gone = !!this\._disposed \|\| !!this\._readerActedSince\?\.\(since\)\);/.test(SEEK)
      && /\n  _readerActedSince\(since\) \{\n    return !!this\._pointerDownOnScrollbar \|\| \(this\._gutterPressAt \|\| 0\) > since \|\| !!this\._navigatedSince\(since\);\n  \}\n/.test(CV)
      && (SEEK.match(/_gutterPressAt|_pointerDownOnScrollbar/g) || []).length === 0 && (CARD.match(/_gutterPressAt|_pointerDownOnScrollbar/g) || []).length === 0,
      'B-43f3 / r2579: ONE hold question — the jump hold\'s letGo and the needs landing\'s gone() both ask chat-view _readerActedSince (the scrollbar pressed since or held, or any reader-act stamp); neither hold keeps a list of its own'); }
  ok(/if \(host && !host\.getClientRects\(\)\.length\) view\.revealRecord\?\.\(host\);\n\s+if \(!el\.getClientRects\(\)\.length\) return false;/.test(CARD) && /revealRecord\(el\) \{\n\s+if \(!el \|\| !el\.isConnected\) return false;\n\s+const run = this\._runs\?\.find\(\(r\) => !r\.open && r\.members\?\.includes\(el\)\);\n\s+if \(run\) this\._setRunOpen\(run, true\);/.test(CV), 'r2 #4 a landing unfolds the run that holds its record (chat-view revealRecord — a deliberate open); a target with no box is never landed on');
  ok(/const keep = sig !== this\._placeSig && !hold && !view\._pinned \? this\._readerLine\(\) : null;/.test(CARD) && (CARD.match(/this\._keepReader\(keep\);/g) || []).length === 2, 'r2 minor the reader-position law for a swap: a pass that moves a card while the reader is scrolled away keeps the reader\'s top record where it stood (read only when the placement changed)');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(read(f).includes(JSON.stringify('The record that filed it is not drawn in this chat') + ':'), `r2 ${f}: «the record is not drawn» is worded`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
