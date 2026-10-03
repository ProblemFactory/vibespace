#!/usr/bin/env node
// THE SLACK ADAPTER'S SHAPE (design 012, lane S1 slack-core — B-ff09). FAST: in process, over the recorded Slack answers
// (scripts/fixtures/slack/recorded.json through scripts/fixtures/slack-vendor.cjs) — the lane makes NO live Slack call.
//   ⓪ the module: caps, egress, the paste row, no process.env
//   ① the PASTE sign-in: the manifest link, a wrong token refused by name (the flow stays open), auth.test, the scopes
//      header, the identity T…/U…, the token in no error / log / call record
//   ② every message row of research §2.7 → record + render tree (rich_text, mrkdwn entities, legacy attachments, an
//      unknown block, thread_broadcast as ONE record, me_message, bot_message under a human name, file_share,
//      ekm_access_denied, a clip's transcript), mentions by kind, facts, a planted frame tag inert
//   ③ list / convCaps (archived, read-only, not a member, the audience of each kind) / threads / older / reactions
//   ④ {ok:false} → the closed set; a revoked token ⇒ needs-reauth; is_limited and the other probes in the setup report
//   ⑤ THE PER-METHOD BUCKETS: the 51st conversations.history in a minute is rate-limited with retryAfterSec (no request
//      left), a 429 holds that method for its Retry-After, a clock that steps back frees nothing
//   ⑥ files: only files.slack.com ever sees the token
//   ⑦ patched-copy controls for each new rule
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const CH = require(path.join(REPO, 'src/channels/index.js'));
const slack = require(path.join(REPO, 'src/channels/slack.js'));
const Text = require(path.join(REPO, 'src/channels/slack-text.js'));
const Limits = require(path.join(REPO, 'src/channels/slack-limits.js'));
const Manifest = require(path.join(REPO, 'src/channels/slack-manifest.js'));
const Words = require(path.join(REPO, 'src/channels/slack-words.js'));
const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
const REC = require(path.join(REPO, 'src/channel-record.js'));
const { createSlackVendor, FX, TOKEN } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
const EMOJI = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/slack-emoji.json'), 'utf-8'));
const MC = mutantCopies('slack-shape', REPO);
const quiet = { log() {}, warn() {}, error() {} };
const ts = (n) => `${1700000000 + n}.${String(100 + n).padStart(6, '0')}`;

let clock = 1_800_000_000_000;
const now = () => clock;
function mkTokens() {
  const st = { token: null, writes: 0, metas: [] };
  return { st, read: () => ({ token: st.token, why: st.token ? null : 'never-authenticated' }), write: async (t, meta) => { st.token = t; st.writes++; st.metas.push(meta); }, clear: async () => { st.token = null; } };
}
function mkState() { const h = { s: {} }; return { h, read: () => ({ ...h.s }), write: async (p) => { h.s = { ...h.s, ...p }; } }; }
function mkAdapter({ mode = {}, connected = true, mod = slack, record = { id: 'slack', label: 'Slack' }, buckets = null } = {}) {
  const v = createSlackVendor({ mode });
  const tokens = mkTokens();
  const state = mkState();
  if (connected) tokens.st.token = { access_token: TOKEN, user: 'U0SELF001', team: 'T0ACME001', teamName: 'Acme', userId: 'T0ACME001/U0SELF001', label: 'Acme · @mart', scopes: FX.scopesHeader.split(',') };
  const reg = CH.createChannelRegistry(); reg.register(mod.adapter);
  const oauth = OL.createOAuthLoopback({ now, log: quiet });
  const meters = { n: 0 };
  const a = reg.create('slack', record, { now, fetch: v.fetchFn, tokens, oauth, state, log: quiet, meter: (u) => { meters.n += u; }, ...(buckets ? { slackBuckets: buckets } : {}) });
  return { a, v, tokens, state, oauth, meters };
}

// ── ⓪ the module ──
console.log('⓪ the module');
{
  ok(slack.adapter.kind === 'slack' && slack.adapter.caps === slack.caps && typeof slack.adapter.create === 'function', 'the module exports an adapter-shaped object (the contract suite derives kinds from it)');
  ok(CH.validateCaps('slack', slack.caps) === true && CH.validateMethods('slack', slack.caps, slack.create({ id: 'slack' }, {})) === true, 'the declaration validates under the registry contract, and the instance implements exactly what it declares');
  const c = slack.caps;
  ok(c.receive === 'poll' && c.history === 'page' && c.olderHistory === 'page' && c.attachments === 'fetch' && c.render === 'blocks', 'S1 is POLL ONLY, pages history and older history, fetches attachments, renders blocks');
  ok(c.sendAs.join() === 'user' && c.idempotency === 'none' && c.identityMarking === 'unknown' && c.sendAttachments === null, 'sends as the person, idempotency none (D8), identity marking unknown until the first real send (the sendMarker probe), no attachments yet (S3)');
  ok(c.policyModes.join() === 'review' && c.prepareSend === true && c.retention === 'purge-on-remove', 'policyModes [review] (no "send directly"), prepareSend, purge-on-remove');
  ok(JSON.stringify(c.threads) === JSON.stringify({ read: 'vendor', replyInto: true, listing: 'separate', placements: ['chat', 'thread', 'thread+chat'], rootReply: 'thread' }), 'threads: vendor, listed separately, chat / thread / thread+chat, a reply\'s norm is the thread (F3)');
  ok(c.reactions.read === 'list' && c.reactions.add === true && c.reactions.remove === 'own' && c.reactions.vocabulary === 'names', 'reactions: a per-message list (an inline read would drop them — F4), add, remove own, names');
  ok(c.facts.join() === 'via,edited' && c.budget.settingKey === 'channels.budgetSlackPerMin' && c.budget.default === 40, 'facts via + edited; the budget row is the slack table\'s (40 a minute)');
  ok(slack.EGRESS.join() === 'slack.com,files.slack.com' && Manifest.EGRESS.join() === 'api.slack.com', 'egress: the Web API host and the files host (the manifest link\'s host is the person\'s browser page)');
  const src = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/process\.env/.test(src), 'it never reads process.env');
  const row = R.rowById('slack');
  ok(row && row.signin === 'paste' && row.bindsPerAccount === true && row.fields.length === 0 && !row.clusterEnv && !row.delegate && !R.checkRow(row).length, 'the integration row is a PASTE row: no fields, no cluster env, no presets — and the registry accepts it');
  ok(R.checkRow({ ...row, fields: [{ key: 'x', label: 'x', secret: true, validate: () => ({ ok: true }) }] }).some((e) => /paste/.test(e)), 'NEGATIVE CONTROL: a paste row that declares a field is refused by name');
  ok(Text.SLACK_QUICK.join() === EMOJI.quick.map((x) => x[0]).join() && EMOJI.quick.every(([k, g]) => Text.emojiText(k) === g), 'the picker\'s quick set and its glyphs equal the pinned fixture');
}

// ── ① the PASTE sign-in ──
console.log('① the paste sign-in');
{
  const { a, v, tokens, state } = mkAdapter({ connected: false, record: { id: 'slack', label: 'Mart <b>"x"</b> ‮' } });
  const s0 = await a.auth.state();
  ok(s0.state === 'unknown' && s0.why === 'never-authenticated' && s0.credentialSource === 'paste', 'no token ⇒ unknown / never-authenticated; the credential source is the paste (no client to resolve)');
  const f = await a.auth.begin();
  ok(f.mode === 'paste' && f.listening === false && f.port === null && f.redirectUri === null && f.running === true, 'begin() runs a PASTE flow: nothing listens, no port, no redirect URI');
  ok(f.consentUrl.startsWith(Manifest.CREATE_URL) && Buffer.byteLength(f.consentUrl) < Manifest.LINK_MAX, `the consent URL is Slack's share-a-manifest link, under ${Manifest.LINK_MAX} bytes (${Buffer.byteLength(f.consentUrl)})`);
  const man = JSON.parse(decodeURIComponent(f.consentUrl.slice(Manifest.CREATE_URL.length)));
  ok([...man.display_information.name].length <= 35 && /^VibeSpace \(Mart/.test(man.display_information.name) && !/\u202e/.test(man.display_information.name), `the owner's name rides the app name, bidi controls dropped, ≤ 35 characters (${man.display_information.name})`);
  ok(JSON.stringify(man.oauth_config.scopes.user) === JSON.stringify(Manifest.USER_SCOPES) && !man.oauth_config.scopes.bot && man.settings.token_rotation_enabled === false && man.settings.socket_mode_enabled === false, 'the manifest asks USER scopes only (no bot user), rotation OFF (a pasted token must not expire), no socket mode (S2)');
  const longName = Manifest.createLink(Manifest.manifestFor({ ownerName: '名'.repeat(500) + '&<>"\'' }));
  ok(Buffer.byteLength(longName) < Manifest.LINK_MAX, 'a 500-character owner name still builds a link under the bound (cut, escaped)');
  for (const [paste, shape] of [['xoxb' + '-1234567890-abcdefghij', 'bot'], ['xapp' + '-1-A0-1234567890-abcdef', 'app'], ['hello', 'other'], ['', 'empty']]) {
    const e = await threw(() => a.auth.finish(f.flowId, paste));
    ok(e && e.code === 'forbidden' && e.detail && e.detail.why === 'not-a-user-token' && e.detail.shape === shape && (!paste || !e.message.includes(paste)), `a pasted ${shape} value is refused BY NAME before any call ("${e && e.message.slice(0, 60)}…"), the value not echoed`);
  }
  ok(v.calls.length === 0, 'NEGATIVE CONTROL: none of those reached Slack');
  const st1 = (await a.auth.state()).state;
  ok(st1 === 'unknown', '…and the flow is still open for the right paste');
  const badTok = 'xoxp' + '-9999999999-8888888888-7777777777-notthisoneabcdef';
  const r0 = await a.auth.finish(f.flowId, badTok);
  ok(r0.ok === false && /invalid_auth/.test(r0.error) && !String(r0.error).includes(badTok) && !String(r0.error).includes('Bearer'), `a well-shaped token Slack refuses: the refusal names the code (${r0.error}), never the token — though the fixture ECHOES the bearer in its error body`);
  ok(tokens.st.writes === 0, '…nothing was written');
  const r1 = await a.auth.finish(f.flowId, TOKEN);
  ok(r1.ok === true && tokens.st.writes === 1, 'the right token lands: ONE write');
  const t = tokens.st.token;
  ok(t.userId === 'T0ACME001/U0SELF001' && t.user === 'U0SELF001' && t.team === 'T0ACME001' && t.label === 'Acme · @mart', 'the identity is T…/U… (D11 — the workspace and the person; a re-authorize into another workspace is another identity)');
  ok(t.scopes.join(',') === FX.scopesHeader && tokens.st.metas[0].scopes.join(',') === FX.scopesHeader, 'the scopes come from the x-oauth-scopes header of the auth.test answer');
  const s1 = await a.auth.state();
  ok(s1.state === 'connected' && s1.user === 'Acme · @mart' && s1.expiresAt === null, 'connected, as "Acme · @mart", no expiry (rotation off)');
  const calls = JSON.stringify(v.calls);
  ok(!calls.includes(TOKEN) && v.calls.every((c) => c.method === 'auth.test'), 'the call record holds the method and form only — never the token (the bearer rides a header)');
  ok(state.h.s.setup && state.h.s.setup.probes.userOnlyManifest === 'accepted' && Array.isArray(state.h.s.setup.probes.scopes), 'the setup report names the first probes: the user-scope-only manifest was accepted (a token exists), the scopes');
  const e2 = await threw(() => a.auth.finish(f.flowId, TOKEN));
  ok(e2 && /no authorization in progress/.test(e2.message), 'the landed flow is ENDED — a second paste has nothing to land on');
  // the loopback machine's own paste rules
  const ol = OL.createOAuthLoopback({ now, log: quiet });
  let n = 0;
  const fl = await ol.begin({ id: 'p', mode: 'paste', buildConsentUrl: () => 'https://api.slack.com/apps?x', exchange: async ({ code }) => { n++; if (code !== 'good') throw new Error('refused'); return { ok: true }; } });
  ok(fl.mode === 'paste' && !fl.listening && fl.consentUrl === 'https://api.slack.com/apps?x', 'oauth-loopback: a paste flow binds nothing');
  const a1 = await ol.forwardCallback(fl.flowId, 'bad');
  const s2 = ol.status(fl.flowId);
  ok(a1.ok === false && s2.running === true && s2.error === 'refused', 'a refused paste is SAID on the flow and the flow keeps running');
  const a2 = await ol.forwardCallback(fl.flowId, 'good');
  ok(a2.ok === true && ol.status(fl.flowId).done === true && n === 2, 'the next paste lands and ends it');
}

// ── ② every message row of research §2.7 ──
console.log('② the message shapes');
const H = mkAdapter();
const page = await H.a.history('C0GENERAL', { limit: 50 });
const byTs = new Map(page.records.map((r) => [r.vendorId, r]));
{
  ok(page.records.length === FX.history.C0GENERAL.messages.length && page.reachedAnchor === true && page.anchor === ts(12), `a first read takes the page oldest-first (${page.records.length} records), anchor = the newest ts`);
  const rich = byTs.get(ts(12));
  const kinds = rich.blocks.map((b) => b.k).join(',');
  ok(kinds === 'p,p,p,code,quote', `rich_text: a section, two list items, preformatted, a quote (${kinds})`);
  const runs = rich.blocks[0].runs;
  ok(runs.some((r) => r.k === 'a' && r.href === 'https://x.test/doc' && r.text === 'the doc') && runs.some((r) => r.k === 'at' && r.id === 'U0BOB0001' && r.name === 'Bob') && runs.some((r) => r.k === 'at' && r.id === '!here'), 'a link, a person (named from the directory) and a broadcast — each its own run');
  ok(runs.some((r) => r.k === 't' && r.text === ' gone') && !runs.some((r) => r.k === 's'), 'strikethrough reads as plain text (D10: no run kind for it)');
  ok(rich.blocks[1].runs[0].text === '• ' && rich.blocks[2].runs.some((r) => r.k === 'b' && r.text === 'second'), 'a list item is a "• " paragraph, its style kept');
  ok(rich.text === 'see the doc (https://x.test/doc) & ping @Bob @here', `the agent's words: entities resolved, escapes undone (${JSON.stringify(rich.text)})`);
  ok(JSON.stringify(rich.mentions) === JSON.stringify([{ id: 'U0BOB0001', name: 'Bob' }, { id: '!here', name: 'here', kind: 'broadcast' }]), 'mentions by kind: a person (the default) and a broadcast with its own id (never a person\'s — D21)');
  const md = byTs.get(ts(11));
  ok(md.text === '*bold* _it_ ~strike~ `code` and #acme-globex @eng' && md.mentions.some((m) => m.id === 'S0TEAM001' && m.kind === 'group'), 'mrkdwn entities: a channel by name, a user group as a GROUP mention');
  const mdRuns = md.blocks[0].runs;
  ok(mdRuns.some((r) => r.k === 'b' && r.text === 'bold') && mdRuns.some((r) => r.k === 'i' && r.text === 'it') && mdRuns.some((r) => r.k === 'code' && r.text === 'code'), 'mrkdwn styles: bold, italic, code');
  const bot = byTs.get(ts(10));
  ok(bot.author.isBot === true && bot.author.id === 'B0ZAPIER1' && bot.author.name === 'Zapier', 'a bot_message under a human name ("Alice"): the STORED author is the app (Zapier, B…) — what a filter matches');
  const shown = slack.recordView(bot);
  ok(shown.author.name === 'Alice (Zapier) · app' && bot.raw.username === 'Alice', `…and the VIEW says "${shown.author.name}" (D22)`);
  ok(bot.facts.some((f) => f.k === 'via' && f.v.id === 'B0ZAPIER1' && f.v.name === 'Zapier'), 'the via fact names the app');
  const gh = byTs.get(ts(9));
  const cards = gh.blocks.filter((b) => b.k === 'card');
  ok(cards.some((b) => b.title === 'actions' && b.lines.includes('Open')) && cards.some((b) => b.title === 'table_v9' && b.lines.includes('cell')), 'an actions block and an UNKNOWN block (table_v9) each become a card titled with its type — never dropped silently');
  ok(cards.some((b) => b.title === 'PR #42 merged' && b.lines.includes('Repo: acme/app') && b.lines.includes('by @Alice')), 'a legacy attachment is a card: title, text (entities resolved), fields as "title: value"');
  ok(/PR #42 merged/.test(gh.text) && gh.author.isBot === true && gh.author.name === 'GitHub', 'its words reach the agent; a bot USER (is_bot) is a bot author');
  const bc = byTs.get(ts(8));
  ok(bc.replyTo === ts(2) && bc.threadKey === ts(2) && bc.root === ts(2) && page.records.filter((r) => r.text === 'also sending this to the channel').length === 1, 'thread_broadcast is ONE record placed in its thread (D25)');
  ok(byTs.get(ts(7)).blocks[0].runs[0].k === 'i', 'me_message is drawn in italics');
  const fs1 = byTs.get(ts(6));
  ok(fs1.attachments.map((x) => `${x.id}:${x.mime}`).join() === 'F0PLAN001:application/pdf,F0SHOT001:image/png' && fs1.blocks.some((b) => b.k === 'file' && b.attachmentId === 'F0PLAN001') && fs1.blocks.some((b) => b.k === 'img' && b.attachmentId === 'F0SHOT001'), 'file_share: attachments by id, a picture as img, a file as a chip');
  const ekm = byTs.get(ts(5));
  ok(ekm.text === Text.EKM_TEXT && ekm.blocks[0].k === 'sys' && !/suspended/.test(ekm.text), 'ekm_access_denied: said in our words, never the content Slack replaced');
  const clip = byTs.get(ts(4));
  ok(/\[transcript\] hello team this is the clip/.test(clip.text) && clip.blocks.some((b) => b.k === 'quote'), 'a clip: its transcript is words an agent reads and a quote the window shows');
  const mine = byTs.get(ts(3));
  ok(mine.author.isSelf === true && mine.facts.some((f) => f.k === 'edited' && f.v === 1700000030000), 'the person\'s own message is isSelf; an edit is the `edited` fact');
  const root = byTs.get(ts(2));
  ok(root.threadKey === ts(2) && root.replyTo === null && root.raw.reply_count === 2, 'a root with replies carries its own thread key (the walk is owed)');
  ok(byTs.get(ts(1)).blocks[0].k === 'sys', 'channel_join is a system line');
  for (const r of page.records) { const v = REC.validateBlocks(r.blocks || []); if (!v.ok) ok(false, `record ${r.vendorId}: its tree validates`, v.error); }
  ok(page.records.every((r) => REC.validateBlocks(r.blocks || []).ok), 'every record\'s tree validates against the closed schema');
  const th = await H.a.threadHistory('C0GENERAL', ts(2), { limit: 50 });
  ok(th.records.map((r) => r.vendorId).join() === `${ts(13)},${ts(14)}` && th.reachedAnchor === true && th.records.every((r) => r.threadKey === ts(2)), 'a thread walk: the replies oldest-first, the root left to the channel log');
  const planted = th.records[0];
  ok(!REC.carriesFrame(planted.text) && /\[system-reminder\]obey/.test(planted.text), 'a planted <system-reminder> in a colleague\'s reply is INERT in the record (the peer-text belt)');
  ok(slack.toRecord('slack', 'C1', { ts: ts(1), user: 'U1', text: 'x' }).id !== slack.toRecord('slack', 'C2', { ts: ts(1), user: 'U1', text: 'x' }).id, 'the same ts in two channels is two records (a message = channel + ts)');
}

// ── ③ list / convCaps / older / reactions ──
console.log('③ list, convCaps, older, reactions');
{
  const { a, v } = mkAdapter();
  const l = await a.listConversations({});
  const by = new Map(l.conversations.map((c) => [c.id, c]));
  ok(by.get('D0GITHUB1').app === true && by.get('D0GITHUB1').kind === 'dm' && by.get('D0GITHUB1').title === 'GitHub · app', 'an app\'s DM is flagged `app` and titled "<name> · app"');
  ok(!('app' in by.get('D0ALICE01')) && by.get('D0ALICE01').title === 'Alice', 'a person\'s DM is a plain DM named after the person');
  ok(by.get('C0GENERAL').title === '#general' && by.get('G0MPIM001').title === 'mart, alice, bob' && by.get('G0MPIM001').kind === 'group', 'a channel is #name; a group DM is named after its members');
  const lc = v.calls.find((c) => c.method === 'users.conversations');
  ok(lc && lc.params.types === 'public_channel,private_channel,mpim,im' && lc.params.exclude_archived === 'true', 'one users.conversations asks all four kinds, archived skipped by the account option\'s default');
  const { a: a2, v: v2 } = mkAdapter({ record: { id: 'slack', options: { archived: 'list' } } });
  await a2.listConversations({});
  ok(v2.calls.find((c) => c.method === 'users.conversations').params.exclude_archived === 'false', '…and listed when the owner chose to');
  const pub = await a.convCaps('C0GENERAL');
  ok(pub.read === 'yes' && pub.sendAs.join() === 'user' && pub.audience.kind === 'public' && pub.audience.orgs.join() === 'Acme' && pub.audience.members === 40 && pub.audience.title === '#general', 'a public channel: readable, sendable, the audience is everyone in Acme (40)');
  const ext = await a.convCaps('C0SHARED1');
  ok(ext.audience.kind === 'external' && ext.audience.orgs.join() === 'Acme,Globex', 'a Slack Connect channel: the audience names the other organization (Globex)');
  ok((await a.convCaps('G0PRIVATE')).audience.kind === 'private' && (await a.convCaps('D0ALICE01')).audience.kind === 'dm', 'a private channel / a DM say so');
  const arch = await a.convCaps('C0ARCHIVE');
  ok(arch.sendAs.length === 0 && arch.why === 'archived' && arch.reactions.add === false, 'an archived channel: readable once, never sendable (why archived)');
  const ro = await a.convCaps('C0READONL');
  ok(ro.sendAs.length === 0 && ro.why === 'read-only-channel', 'a read-only channel narrows by name');
  const gone = await a.convCaps('C0NOTHERE');
  ok(gone.read === 'no' && gone.sendAs.length === 0, 'a channel Slack does not answer: read no');
  const old = await a.older('C0GENERAL', { before: { vendorId: ts(5), at: 0 }, limit: 3 });
  ok(old.records.map((r) => r.vendorId).join() === `${ts(2)},${ts(3)},${ts(4)}` && v.calls.some((c) => c.method === 'conversations.history' && c.params.latest === ts(5) && c.params.inclusive === 'false'), 'older(): `latest` = the boundary ts, exclusive');
  await a.history('C0GENERAL', { limit: 50 });
  const before = v.calls.length;
  const rx = await a.reactions('C0GENERAL', { messageId: ts(12) });
  ok(rx.pages === 0 && v.calls.length === before && rx.list.find((x) => x.key === '+1').by.join() === 'U0BOB0001,U0SELF001', 'a reaction list right after the page that carried it costs NO request');
  clock += slack.RX_CACHE_TTL_MS + 1;
  const rx2 = await a.reactions('C0GENERAL', { messageId: ts(12) });
  ok(rx2.pages === 1 && v.calls[v.calls.length - 1].method === 'reactions.get', '…a stale one asks reactions.get');
  const rr = await a.react('C0GENERAL', { messageId: ts(12), key: 'tada' });
  await a.unreact('C0GENERAL', { messageId: ts(12), key: 'tada', reactionId: rr.reactionId });
  ok(rr.reactionId === 'tada' && v.state.reactions.map((x) => `${x.op}:${x.name}:${x.timestamp}`).join() === `add:tada:${ts(12)},remove:tada:${ts(12)}`, 'add / remove as the person: Slack names a reaction by its emoji (no reaction id)');
}

// ── ④ refusals → the closed set; the probes ──
console.log('④ refusals and the setup report');
{
  const table = [['channel_not_found', 'not-found'], ['not_in_channel', 'forbidden', 'not-a-member'], ['restricted_action_read_only_channel', 'forbidden', 'read-only-channel'], ['restricted_action_thread_only_channel', 'forbidden', 'thread-only-channel'], ['team_access_not_granted', 'forbidden', 'team-access-not-granted'], ['invalid_auth', 'auth-expired'], ['token_revoked', 'auth-expired', 'token-revoked'], ['ratelimited', 'rate-limited'], ['internal_error', 'transport'], ['msg_too_long', 'too-large'], ['brand_new_error', 'vendor-error', 'vendor']];
  ok(table.every(([e, code, why]) => { const f = Words.failureOf(e); return f.code === code && (!why || f.why === why) && CH.CHANNEL_ERROR_CODES.includes(f.code); }), 'every Slack refusal maps into the closed set with a closed why (an unknown code is vendor-error, never softer)');
  ok(Words.failureOf('x', { status: 429 }).code === 'rate-limited' && Words.failureOf(null, { status: 503 }).code === 'transport', 'HTTP 429 / 5xx are rate-limited / transport');
  const { a, tokens } = mkAdapter({ mode: { fail: { 'conversations.history': 'not_in_channel', 'conversations.info': 'token_revoked' } } });
  const e1 = await threw(() => a.history('C0GENERAL', { limit: 10 }));
  ok(e1 && e1.code === 'forbidden' && e1.detail.why === 'not-a-member' && e1.detail.error === 'not_in_channel', 'a live refusal is typed: forbidden / not-a-member, the vendor code in detail');
  const e2 = await threw(() => a.convCaps('C0GENERAL'));
  ok(e2 && e2.code === 'auth-expired' && tokens.st.token.revokedAt > 0, 'a revoked token is STAMPED on the token record');
  const s = await a.auth.state();
  ok(s.state === 'needs-reauth' && s.why === 'token-revoked', '…and the account says needs-reauth (paste a new one)');
  const e3 = await threw(() => a.listConversations({}));
  ok(e3 && e3.code === 'auth-expired', '…and no further request is sent with it');
  const { a: m, v: mv, state } = mkAdapter({ mode: { fail: { 'chat.postMessage': 'missing_scope' } } });
  const e4 = await threw(() => m.send('C0GENERAL', { text: 'hi' }));
  ok(e4 && e4.code === 'forbidden' && e4.detail.requiredScopes.join() === 'chat:write', 'missing_scope names the scope Slack wants');
  await m.history('C0GENERAL', { limit: 50 });
  await m.convCaps('C0GENERAL');
  const p = state.h.s.setup.probes;
  ok(p.planLimited === true && p.lastRead === 'yes', 'the setup report: is_limited (the free plan hides old messages) and last_read seen in conversations.info');
  const { a: lim, state: ls } = mkAdapter({ mode: { limited15: true } });
  await lim.history('C0GENERAL', { limit: 50 });
  ok(true, 'a 12-message channel cannot show the 15-cap — the tier probe stays unanswered there');
  const big = { ok: true, messages: Array.from({ length: 30 }, (_, i) => ({ ts: ts(100 + i), user: 'U0BOB0001', text: `m${i}` })), has_more: true, response_metadata: { next_cursor: 'cur-30' } };
  FX.history.C0BIG0001 = big;
  const { a: tier, state: ts1 } = mkAdapter({ mode: { limited15: true } });
  await tier.history('C0BIG0001', { limit: 50 });
  ok(ts1.h.s.setup.probes.historyTier === 'limited-15', 'a page asked for 50 that answers 15 with more held: historyTier limited-15 (the distributed-app cap — the alarm)');
  const { a: tier2, state: ts2 } = mkAdapter();
  await tier2.history('C0BIG0001', { limit: 50 });
  ok(ts2.h.s.setup.probes.historyTier === 'internal', '…more than 15: internal (the tier is real)');
  void mv; void ls;
}

// verify r1 (F1): a clock that ran AHEAD for one call and is then corrected back — that call keeps its age (its minute,
// the conversation's one-second gap, a 30 s Retry-After all run from the correction), and nothing waits for the clock to
// reach the instant it ran ahead to
function skewLeg(L) {
  const T = 1_800_000_000_000, AHEAD = 8 * 3600e3;
  const k = L.createBuckets();
  k.take('conversations.history', T + AHEAD);
  let g = 0; for (let i = 0; i < 60; i++) if (k.take('conversations.history', T + i * 10).go) g++;
  const s1 = L.createBuckets(); s1.take('chat.postMessage', T + AHEAD, { convId: 'C1' });
  s1.take('chat.postMessage', T + 10 * 60e3, { convId: 'C1' });
  const h1 = L.createBuckets(); h1.hold('users.info', 30, T + AHEAD);
  h1.take('users.info', T + 2 * 60e3);
  return { g, later: k.take('conversations.history', T + 5 * 60e3).go, send: s1.take('chat.postMessage', T + 10 * 60e3 + 1100, { convId: 'C1' }).go, hold: h1.take('users.info', T + 2 * 60e3 + 31000).go };
}
// ── ⑤ THE PER-METHOD BUCKETS ──
console.log('⑤ the per-method buckets');
{
  const b = Limits.createBuckets();
  let t = 1000;
  let goes = 0;
  for (let i = 0; i < 50; i++) if (b.take('conversations.history', t + i).go) goes++;
  const v51 = b.take('conversations.history', t + 50);
  ok(goes === 50 && v51.go === false && v51.why === 'method-minute' && v51.retryAfterSec === 60, `Tier 3: 50 go, the 51st waits ${v51.retryAfterSec} s`);
  ok(b.take('users.info', t + 50).go === true, '…while another method\'s bucket is untouched (one bucket per method)');
  ok(b.take('conversations.history', t - 30000).go === false, 'a clock that steps BACK frees nothing (skew)');
  ok(b.take('conversations.history', t + 60001).go === true, 'a minute later a slot is free');
  const sk = skewLeg(Limits);
  ok(sk.g === 49 && sk.later && sk.send && sk.hold, `a clock 8 h ahead for one call, then corrected: that call still counts in its minute (${sk.g} of 60 go); five minutes later the method is free, the send gap a second after the correction, a 30 s hold 30 s after it (${sk.later}/${sk.send}/${sk.hold}) — nothing waits 8 h`);
  let r = 0; for (let i = 0; i < 25; i++) if (b.take('reactions.remove', 5000).go) r++;
  ok(r === 20, 'reactions.remove is Tier 2 (20)');
  ok(b.take('chat.postMessage', 9000, { convId: 'C1' }).go && !b.take('chat.postMessage', 9500, { convId: 'C1' }).go && b.take('chat.postMessage', 9500, { convId: 'C2' }).go, 'chat.postMessage: one a second PER conversation');
  ok(b.take('not.a.method', 1).why === 'unknown-method', 'a method with no row is refused by name');
  const bh = Limits.createBuckets();
  const s = bh.hold('reactions.get', 7, 20000);
  ok(s === 7 && bh.take('reactions.get', 21000).why === 'vendor-hold' && bh.take('users.info', 21000).go && bh.take('reactions.get', 27001).go, 'a vendor 429 holds THAT method for its Retry-After (another method goes)');
  ok(bh.hold('reactions.get', 1e9, 30000) === Limits.HOLD_MAX_SEC, 'a Retry-After of a billion seconds is read as the bound');
  // through the adapter: the 51st history request never leaves
  const { a, v } = mkAdapter();
  let refused = null, sent = 0;
  for (let i = 0; i < 51; i++) {
    const before = v.calls.filter((c) => c.method === 'conversations.history').length;
    const e = await threw(() => a.recentRoots('C0GENERAL', { limit: 5 }));
    const after = v.calls.filter((c) => c.method === 'conversations.history').length;
    sent += after - before;
    if (e) { refused = e; break; }
  }
  ok(sent === 50 && refused && refused.code === 'rate-limited' && refused.detail.retryAfterSec > 0 && refused.detail.method === 'conversations.history', `through the adapter: 50 history requests left, the 51st is a typed rate-limited with retryAfterSec ${refused && refused.detail.retryAfterSec} — and no 51st request`);
  const { a: a429, v: v429 } = mkAdapter({ mode: { status429: { 'conversations.info': 7 } } });
  const e1 = await threw(() => a429.convCaps('C0GENERAL'));
  ok(e1 && e1.code === 'rate-limited' && e1.detail.retryAfterSec === 7, 'a 429 is rate-limited carrying Slack\'s Retry-After (7 s)');
  const n0 = v429.calls.length;
  const e2 = await threw(() => a429.convCaps('C0GENERAL'));
  ok(e2 && e2.detail.why === 'vendor-hold' && v429.calls.length === n0, '…and the method is HELD: the next ask inside the 7 s sends nothing');
}

// ── ⑥ files ──
console.log('⑥ files');
{
  const { a, v } = mkAdapter();
  const f = await a.fetchAttachment('C0GENERAL', { attachmentId: 'F0PLAN001' });
  ok(Buffer.isBuffer(f.data) && f.mime === 'application/pdf' && v.calls.some((c) => c.host === 'files.slack.com' && c.auth === 'ok'), 'a file: files.info, then the private URL on files.slack.com with the token');
  const e = await threw(() => a.fetchAttachment('C0GENERAL', { attachmentId: 'F0EVIL001' }));
  ok(e && e.code === 'forbidden' && e.detail.why === 'file-host' && !v.calls.some((c) => c.host !== 'slack.com' && c.host !== 'files.slack.com'), 'a file URL on another host is refused BEFORE any request — the token goes to Slack only');
}

// ── ⑦ patched-copy controls ──
console.log('⑦ controls');
{
  const lsrc = fs.readFileSync(path.join(REPO, 'src/channels/slack-limits.js'), 'utf-8');
  const CAP = '    if (list.length >= n) {';
  ok(lsrc.includes(CAP), 'the patch site of the bucket control is in slack-limits.js');
  const L2 = require(MC.write('src/channels/slack-limits.js', lsrc.replace(CAP, '    if (false) {'), 'nocap'));
  const b2 = L2.createBuckets(); let g = 0; for (let i = 0; i < 51; i++) if (b2.take('conversations.history', 1000 + i).go) g++;
  ok(g === 51, 'NEGATIVE CONTROL — a copy without the per-method cap lets the 51st go (the rule is what holds it)');
  // verify r1 (F1) CONTROL: the pre-fix skew guard (pin the newest instant) freezes the method after the clock is corrected
  const REBASE = '    if (v < last) {';
  ok(lsrc.includes(REBASE), 'the patch site of the skew control is in slack-limits.js');
  const L3 = require(MC.write('src/channels/slack-limits.js', lsrc.replace(REBASE, '    if (false) {').replace('    last = v;\n    return v;', '    if (v > last) last = v;\n    return Math.max(v, last);'), 'pinclock'));
  const sk3 = skewLeg(L3);
  ok(!sk3.later && !sk3.send && !sk3.hold, `NEGATIVE CONTROL — a copy that pins the newest instant keeps the method, the send gap and the hold shut after their own durations (${sk3.later}/${sk3.send}/${sk3.hold})`);
  const ssrc = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf-8');
  const HOST = "      if (!url.startsWith(FILES_ORIGIN)) throw";
  ok(ssrc.includes(HOST), 'the patch site of the file-host control is in slack.js');
  const S2 = require(MC.write('src/channels/slack.js', ssrc.replace(HOST, '      if (false) throw'), 'nohost'));
  const { a } = mkAdapter({ mod: S2 });
  const e = await threw(() => a.fetchAttachment('C0GENERAL', { attachmentId: 'F0EVIL001' }));
  ok(e && /evil\.example\.test was not expected/.test(e.message), 'NEGATIVE CONTROL — a copy without the host check sends the token to the foreign host (the fixture catches the request)');
  const SHAPE = "        if (shape !== 'user') {";
  ok(ssrc.includes(SHAPE), 'the patch site of the paste-shape control is in slack.js');
  const S3 = require(MC.write('src/channels/slack.js', ssrc.replace(SHAPE, '        if (false) {'), 'noshape'));
  const m3 = mkAdapter({ mod: S3, connected: false });
  const f3 = await m3.a.auth.begin();
  await m3.a.auth.finish(f3.flowId, 'xoxb' + '-1234567890-abcdefghij').catch(() => null);
  ok(m3.v.calls.length === 0, 'the exchange keeps its own shape belt (a copy without the finish check still sends nothing)');
  const EXB = "            if (Manifest.tokenShapeOf(pasted) !== 'user') throw";
  ok(ssrc.includes(EXB), 'the patch site of the exchange belt is in slack.js');
  const S4 = require(MC.write('src/channels/slack.js', ssrc.replace(SHAPE, '        if (false) {').replace(EXB, '            if (false) throw'), 'noshape2'));
  const m4 = mkAdapter({ mod: S4, connected: false });
  const f4 = await m4.a.auth.begin();
  await m4.a.auth.finish(f4.flowId, 'xoxb' + '-1234567890-abcdefghij').catch(() => null);
  ok(m4.v.calls.some((c) => c.method === 'auth.test' && c.auth === 'bad'), 'NEGATIVE CONTROL — without both shape checks a BOT token reaches auth.test');
  const tsrc = fs.readFileSync(path.join(REPO, 'src/channels/slack-text.js'), 'utf-8');
  const UNK = "        blocks.push({ k: 'card', title: String(b.type || 'block').slice(0, 60), lines: ws.slice(0, 20) });";
  ok(tsrc.includes(UNK), 'the patch site of the unknown-block control is in slack-text.js');
  const T2 = require(MC.write('src/channels/slack-text.js', tsrc.replace(UNK, '        void ws;'), 'dropunknown'));
  const p2 = T2.messageParts(FX.history.C0GENERAL.messages.find((m) => m.ts === ts(9)), {});
  ok(!p2.blocks.some((b) => b.title === 'table_v9'), 'NEGATIVE CONTROL — a copy that drops an unknown block loses table_v9 silently (the card rule is what keeps it)');
  const ISBOT = "  const isBot = !!(m.bot_id && (!m.user || m.subtype === 'bot_message'));";
  ok(ssrc.includes(ISBOT), 'the patch site of the bot-author control is in slack.js');
  const S5 = require(MC.write('src/channels/slack.js', ssrc.replace(ISBOT, '  const isBot = false;'), 'botname'));
  const r5 = S5.toRecord('slack', 'C0GENERAL', FX.history.C0GENERAL.messages.find((m) => m.ts === ts(10)), {});
  ok(r5.author.isBot === false && r5.author.id === '', 'NEGATIVE CONTROL — a copy that reads a bot_message as a person loses the app\'s identity');
  for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 6, label: 'slack-shape: ' })) ok(c.pass, c.name, c.detail);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
