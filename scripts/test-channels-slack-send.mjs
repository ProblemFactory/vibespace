#!/usr/bin/env node
// SENDING TO SLACK AS THE PERSON, ONLY THROUGH THE OUTBOX (design 012, lane S1 slack-core). FAST: the REAL engine over
// the recorded Slack answers (scripts/fixtures/slack-vendor.cjs) — no live call.
//   ① connect by PASTE through the engine: the digest offers Slack as ready (no client), a bot token refused by name,
//      the right one connects; the token in NO file of the data dir (secret-scan), no log line, no frame, no answer
//   ② the first pass: an app's DM is flagged and never wears the "Direct" tag; a bot posting as "Alice" does not
//      match Alice's sender-in-group rule
//   ③ prepareSend at propose: two Alices ⇒ refused by name, nothing created; @Bob ⇒ <@U…> stored, the notify line and
//      the audience line on the proposal; a member renamed before approval changes nothing sent; & < > escaped;
//      over 4 000 characters refused; thread+chat ⇒ reply_broadcast
//   ④ the policy: "direct" is refused by name on a Slack conversation and account; a stored "direct" reads review
//   ⑤ a lost answer stays `unknown` and is never resent (idempotency none)
//   ⑥ removing the account deletes its local copy (logs, files, ended proposals); a control with `retention:'keep'`
//      leaves them
//   ⑧ TWO PASTES through the engine (design 017): the setup token → ONE apps.manifest.create → the flow at `created`
//      (status names the app; Connect refuses until step 3) → the user token → Connect. The setup token and the
//      create's credentials in NO file of the data dir, log line, frame or answer (a planted copy as the control);
//      secret-scan finds a setup token and its refresh token (the refresh token unseen by the base's scanner); a wrong
//      box answers 400 with its closed why
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const slack = require(path.join(REPO, 'src/channels/slack.js'));
const SW = require(path.join(REPO, 'src/channels/slack-words.js'));
const P = require(path.join(REPO, 'src/channel-policy.js'));
const FOCUS = require(path.join(REPO, 'src/channel-focus.js'));
const FILTER = require(path.join(REPO, 'src/channel-filter.js'));
const { createSlackVendor, FX, TOKEN, CONFIG_TOKEN, CLIENT_SECRET } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
const ROOT = scratch('chan-slack-send');
const MC = mutantCopies('slack-send', REPO);
const engines = [];
process.on('exit', () => { for (const e of engines) { try { e.stop(); } catch {} } try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(143));
// the recorded instants are from 2023; the fake moves them to an hour ago (the store keeps recent messages only)
const SHIFT = Math.floor(Date.now() / 1000) - 1700000100 - 3600;
const ts = (n) => `${1700000000 + n + SHIFT}.${String(100 + n).padStart(6, '0')}`;
let clock = Date.now();
const now = () => clock;
const FAST_PACE = (() => { let t = 0; return { paceClock: () => t, sleep: (ms) => new Promise((r) => { t += ms; setImmediate(r); }) }; })();
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: [], msgLevelFor: () => 'none' };

const logLines = [];
const capture = { log: (...a) => logLines.push(a.join(' ')), warn: (...a) => logLines.push(a.join(' ')), error: (...a) => logLines.push(a.join(' ')) };
async function mkEngine(name, { registry = undefined, mode = {}, storeEnv = {} } = {}) {
  const v = createSlackVendor({ mode: { tsShift: SHIFT, ...mode } });
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: storeEnv, now, broadcast: () => {}, drivePresets: () => [], log: capture });
  const frames = [];
  const eng = ENG.create({ dataDir: path.join(dir, 'eng'), env: {}, now, broadcast: (m) => frames.push(m), integrations, fetch: v.fetchFn, log: capture, ...(registry ? { registry } : {}), ...FAST_PACE });
  engines.push(eng);
  return { eng, v, frames, dir: eng.store.dir, root: path.join(dir, 'eng') };
}
async function connected(name, opts) {
  const m = await mkEngine(name, opts);
  const st = await m.eng.startOAuth({ kind: 'slack' });
  await m.eng.oauthCallback({ flowId: st.flowId || (st.flow && st.flow.flowId), url: TOKEN });
  const c = await m.eng.connect('slack', { flowId: st.flowId || (st.flow && st.flow.flowId) });
  await settle(m.eng, c.adapter.id);
  return { ...m, id: c.adapter.id, start: st, conn: c };
}
async function settle(eng, id = 'slack') {
  for (let i = 0; i < 200; i++) { if (eng.store.readTail(id, 'C0GENERAL', { limit: 1 }).length) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
}
const filesUnder = (d) => { const out = []; const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; if (fs.existsSync(d)) walk(d); return out; };

// ── ① connect by paste ──
console.log('① connect by paste');
const W1 = await mkEngine('connect');
{
  const { eng, v, frames, dir, root } = W1;
  const d0 = eng.digest();
  const avail = (d0.available || []).find((x) => x.kind === 'slack');
  ok(avail && avail.credential.source === 'paste' && !(avail.credential.missing || []).length, 'the digest OFFERS Slack as ready — no client to choose (credential source: paste)');
  const st = await eng.startOAuth({ kind: 'slack' });
  const fid = st.flowId || (st.flow && st.flow.flowId);
  ok(st.flow && st.flow.mode === 'paste' && /^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=/.test(st.url || st.flow.consentUrl) && !st.flow.listening, 'startOAuth runs a paste flow whose consent URL is the manifest link');
  const e1 = await threw(() => eng.oauthCallback({ flowId: fid, url: 'xoxb' + '-1234567890-abcdefghijk' }));
  ok(e1 && e1.status === 400 && e1.code === 'forbidden' && /bot token/.test(e1.message), `a pasted bot token: 400 by name (${e1 && e1.message.slice(0, 60)}…)`);
  ok(v.calls.length === 0, '…before any call to Slack');
  const r = await eng.oauthCallback({ flowId: fid, url: TOKEN });
  ok(r.ok === true && r.user === 'Acme · @mart', `the right token signs in as ${r.user}`);
  const c = await eng.connect('slack', { flowId: fid });
  ok(c.adapter && c.adapter.kind === 'slack' && c.adapter.id === 'slack', 'Connect creates the account');
  ok(await settle(eng), 'the Connect\'s own first pass ingests the channel');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'adapters.json'), 'utf-8')).adapters.find((x) => x.id === 'slack');
  ok(rec && rec.auth && rec.auth.tokenEnc && rec.identity && rec.identity.userId === 't0acme001/u0self001', 'the record holds the SEALED token and the identity t…/u… (D11)');
  const all = filesUnder(root);
  const plain = all.filter((f) => { const b = fs.readFileSync(f); return b.includes(TOKEN) || b.includes(encodeURIComponent(TOKEN)); });
  ok(all.some((f) => f.endsWith('adapters.json')) && all.some((f) => f.endsWith('C0GENERAL.ndjson')) && !plain.length, `the token is in NO file of the data dir — the account record and the message log included (${all.length} files read)`, plain.join(', '));
  let scanRc = 0;
  try { execFileSync(process.execPath, [path.join(REPO, 'scripts/secret-scan.mjs'), '--quiet', ...all], { stdio: 'pipe' }); } catch (e) { scanRc = e.status; }
  const probe = path.join(ROOT, 'probe.txt'); fs.writeFileSync(probe, `token=${TOKEN}\n`);
  let probeRc = 0;
  try { execFileSync(process.execPath, [path.join(REPO, 'scripts/secret-scan.mjs'), '--quiet', probe], { stdio: 'pipe' }); } catch (e) { probeRc = e.status; }
  ok(scanRc === 0 && probeRc === 1, `scripts/secret-scan.mjs over the data dir finds nothing (rc ${scanRc}); POSITIVE CONTROL: the same scanner finds the token in a file that holds it (rc ${probeRc})`);
  const said = JSON.stringify([logLines, frames, st, r, c]);
  ok(!said.includes(TOKEN) && !said.includes(TOKEN.slice(5, 25)), 'no log line, broadcast frame or answer carries the token (or a piece of it)');
  const view = eng.digest().adapters.find((x) => x.id === 'slack');
  ok(view && view.setup && view.setup.probes && view.setup.probes.userOnlyManifest === 'accepted' && view.setup.probes.planLimited === true, 'the account view carries the setup report (the first real install\'s probes by name)');
  ok(view && view.retention === 'purge-on-remove' && view.policyModes.join() === 'review', 'the account view says removing deletes the local copy, and that only "review" is offered');
}

// ── ② the first pass ──
console.log('② the first pass');
{
  const { eng } = W1;
  const live = eng.store.index.live();
  ok(live['slack/D0GITHUB1'] && live['slack/D0GITHUB1'].app === true && !live['slack/D0ALICE01'].app, 'the app\'s DM is flagged `app` in the index; the person\'s DM is not');
  const rows = eng.digest({ keys: Object.keys(live) }).conversations || [];
  const gh = rows.find((x) => x.id === 'D0GITHUB1'), al = rows.find((x) => x.id === 'D0ALICE01');
  ok(gh && gh.app === true && al && !al.app, 'the row carries `app`');
  const t = Date.now();
  const tag = (row) => FOCUS.statusTag({ ...row, unread: 3, lastAt: t - 1000 }, t);
  ok(!tag(gh) || tag(gh).code !== 'direct', `an app's DM with unread messages is never the "Direct" tag (${JSON.stringify(tag(gh))})`);
  const ta = tag(al);
  ok(ta && ta.code === 'direct', 'CONTROL: a person\'s DM with unread messages is');
  const recs = eng.store.readTail('slack', 'C0GENERAL', { limit: 50 });
  const imp = recs.find((x) => x.vendorId === ts(10));
  const rule = { kind: 'sender-in-group', members: ['Alice'] };
  const hits = (rec) => FILTER.matchRecord({ rules: [rule], match: 'any' }, rec, {}).hit;
  ok(imp && !hits(imp) && recs.some((x) => x.author.name === 'Alice' && hits(x)), 'a bot posting as "Alice" does NOT match Alice\'s sender-in-group rule (the stored author is the app); the real Alice does');
}

// ── ③ prepareSend at propose ──
console.log('③ the proposal decides who is notified');
{
  const { eng, v } = W1;
  await eng.setReach('slack', 'C0GENERAL', { principal: { kind: 'agent', id: AGENT.id, name: AGENT.name }, level: 'visible' });
  const n0 = Object.keys(eng.store.outbox.snapshot().proposals).length;
  const amb = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text: '@Alice can you check?' });
  ok(amb.ok === false && amb.why === 'mention-ambiguous' && amb.ambiguous.join() === 'Alice' && Object.keys(eng.store.outbox.snapshot().proposals).length === n0, 'two Alices: the proposal is REFUSED by name, nothing created');
  const long = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text: 'x'.repeat(4001) });
  ok(long.ok === false && (long.why === 'too-long' || long.code === 'bad-proposal'), `over 4 000 characters: refused (${long.why || long.code})`);
  const p = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text: '@Bob see <this> & @alice.c too, @nobody, @here' });
  ok(p.ok === true && p.decision.mode === 'review', 'a resolvable proposal is created — and waits for approval (Slack offers review only)');
  const q = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(q.prepared && q.prepared.mentions.map((x) => `${x.name}:${x.id}`).join() === 'Bob:U0BOB0001,alice.c:U0ALICE01' && q.prepared.notifies.join() === 'Bob,Alice' && q.prepared.plain.join() === 'nobody', 'the decision is STORED: @Bob → U0BOB0001, @alice.c → U0ALICE01; the card\'s notify line "Bob, Alice"; @nobody notifies nobody');
  ok(q.audience && q.audience.kind === 'public' && q.audience.orgs.join() === 'Acme' && q.audience.members === 40, 'and who will SEE it: everyone in Acme (40) — the card\'s audience line');
  // a member renamed (and a NEW "Bob" joined) between the proposal and the approval: nothing changes
  const bob = FX.users.U0BOB0001;
  const saved = JSON.stringify(bob);
  bob.profile.display_name = 'Robert'; bob.name = 'robert';
  FX.users.U0BOB0002 = { id: 'U0BOB0002', team_id: 'T0ACME001', name: 'bob', real_name: 'Bob New', profile: { display_name: 'Bob', real_name: 'Bob New' } };
  FX['conversations.members'].C0GENERAL.members.push('U0BOB0002');
  clock += 7 * 3600e3;
  const a = await eng.approve(p.proposal.id, {});
  const sent = v.state.posted[v.state.posted.length - 1];
  ok(a && a.ok !== false && sent && sent.text === '<@U0BOB0001> see &lt;this&gt; &amp; <@U0ALICE01> too, @nobody, @here', `what is sent is what was approved: the ids decided at propose, & < > escaped, @here left as words (${sent && sent.text})`);
  Object.assign(bob, JSON.parse(saved)); delete FX.users.U0BOB0002; FX['conversations.members'].C0GENERAL.members.pop();
  // CONTROL: an engine copy whose send does not hand the stored decision to the adapter sends the name as plain words
  const esrc = engineSource(REPO);
  const DOOR = '...(p.prepared ? { prepared: p.prepared } : {}), ';
  ok(esrc.split(DOOR).length === 2, 'the patch site of the prepared-door control is in channels-engine.js (once)');
  const ENG2 = require(MC.write('src/server/channels-engine.js', esrc.replace(DOOR, ''), 'noprepared'));
  const v2 = createSlackVendor({ mode: { tsShift: SHIFT } });
  const d2 = path.join(ROOT, 'noprepared'); fs.mkdirSync(d2, { recursive: true });
  const e2 = ENG2.create({ dataDir: path.join(d2, 'eng'), env: {}, now, broadcast: () => {}, integrations: STORE.create({ dataDir: path.join(d2, 'store'), env: {}, now, broadcast: () => {}, drivePresets: () => [], log: capture }), fetch: v2.fetchFn, log: capture, ...FAST_PACE });
  engines.push(e2);
  const st2 = await e2.startOAuth({ kind: 'slack' });
  await e2.oauthCallback({ flowId: st2.flowId, url: TOKEN });
  await e2.connect('slack', { flowId: st2.flowId });
  await settle(e2);
  await e2.setReach('slack', 'C0GENERAL', { principal: { kind: 'agent', id: AGENT.id, name: AGENT.name }, level: 'visible' });
  const p2 = await e2.propose(AGENT, 'slack', 'C0GENERAL', { text: '@Bob ping' });
  if (p2.ok) await e2.approve(p2.proposal.id, {});
  const sent2 = v2.state.posted[v2.state.posted.length - 1];
  ok(p2.ok && sent2 && sent2.text === '@Bob ping', `NEGATIVE CONTROL — an engine copy that drops \`prepared\` at the send notifies nobody (${sent2 && sent2.text}): the stored decision is what makes the mention`);
  // thread + chat
  const t2 = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text: 'answering in the thread and the channel', replyTo: ts(2), placement: 'thread+chat' });
  ok(t2.ok === true, `a thread+chat reply is proposed (${t2.error || ''})`);
  if (t2.ok) {
    clock += 2000;   // a person approves the next one a moment later (Slack: one message a second per conversation)
    await eng.approve(t2.proposal.id, {});
    const s2 = v.state.posted[v.state.posted.length - 1];
    ok(s2.thread_ts === `${1700000002}.000102` && s2.reply_broadcast === 'true', 'thread+chat: thread_ts = the root (the fake records the timestamp it serves, un-shifted), reply_broadcast (Slack\'s "also send to the channel")', JSON.stringify(s2));
  }
}

// ── ④ the policy ──
console.log('④ no "send directly" on Slack');
{
  const { eng } = W1;
  const r1 = await eng.setPolicy('slack', 'C0GENERAL', 'direct');
  ok(r1.ok === false && r1.why === 'mode-not-offered', `setPolicy direct on a Slack conversation: refused by name (${r1.error})`);
  const r2 = await eng.setAccountPolicy('slack', 'direct');
  ok(r2.ok === false && r2.why === 'mode-not-offered', '…and on the account');
  await eng.store.index.update(() => { const en = eng.store.index.entry('slack', 'C0GENERAL', { create: false }); en.policy = { mode: 'direct', by: 'user', at: clock }; });
  const p = await eng.propose({ kind: 'user' }, 'slack', 'C0GENERAL', { text: 'from the owner, through review' });
  ok(p.ok === true && p.decision.mode === 'review', 'a "direct" written before (an old file) is CLAMPED: the decision is review, never a send without the card');
  const full = await eng.conversation ? null : null; void full;
  ok(P.policyModesOf({ ...slack.caps, policyModes: undefined }).includes('direct'), 'CONTROL: a caps row without policyModes offers direct (the row is what withholds it)');
}

// ── ⑤ a lost answer ──
console.log('⑤ a lost answer stays unknown');
{
  const W5 = await connected('lost', { mode: { lose: { 'chat.postMessage': true } } });
  const { eng, v } = W5;
  await eng.setReach(W5.id, 'C0GENERAL', { principal: { kind: 'agent', id: AGENT.id, name: AGENT.name }, level: 'visible' });
  const p = await eng.propose(AGENT, W5.id, 'C0GENERAL', { text: 'will be lost' });
  ok(p.ok === true, 'proposed');
  await eng.approve(p.proposal.id, {});
  const q = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(q.state === 'unknown' && v.state.posted.length === 1, `the request left and the answer was lost: the proposal is UNKNOWN (${q.state}), one request`);
  clock += 10 * 60e3;
  try { await eng.pass(W5.id, { force: true }); } catch {}
  try { if (typeof eng.reconcileTick === 'function') await eng.reconcileTick(); } catch {}
  const q2 = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(q2.state === 'unknown' && v.state.posted.length === 1, 'ten minutes and a pass later: still unknown, never resent (idempotency none — only a person can check Slack)');
}

// ── ⑥ remove = purge ──
console.log('⑥ removing the account deletes its local copy');
{
  const { eng, dir } = W1;
  ok(fs.existsSync(path.join(dir, 'msgs', 'slack')), 'before: the logs exist (msgs/slack)');
  const ended = Object.values(eng.store.outbox.snapshot().proposals).filter((x) => x.adapterId === 'slack');
  for (const q of ended) if (!P.isTerminal(q.state)) { try { await eng.reject(q.id, { by: 'user' }); } catch { try { await eng.withdraw(q.id); } catch {} } }
  const live = Object.values(eng.store.outbox.snapshot().proposals).filter((x) => x.adapterId === 'slack' && !P.isTerminal(x.state));
  ok(!live.length, `every proposal of the account is ended (${live.length} live)`);
  await eng.store.index.update((ix) => { if (Array.isArray(ix.grants)) ix.grants = []; });
  const refs = eng.referencesOf ? eng.referencesOf('slack') : [];
  for (const g of refs.filter((x) => x.kind === 'reach')) { try { await eng.setReach('slack', 'C0GENERAL', { principal: g.principal, level: null }); } catch {} }
  const r = await eng.remove('slack');
  ok(r.ok === true, `removed (${JSON.stringify(r).slice(0, 120)})`);
  ok(!fs.existsSync(path.join(dir, 'msgs', 'slack')) && !fs.existsSync(path.join(dir, 'attachments', 'slack')), 'after: msgs/slack and attachments/slack are GONE (purge-on-remove — Slack\'s Developer Policy)');
  ok(!Object.values(eng.store.outbox.snapshot().proposals).some((x) => x.adapterId === 'slack'), '…and so are the account\'s ended proposals (their text was Slack content)');
  // CONTROL: the same adapter declaring `keep` leaves them (archive-never-destroy)
  const ssrc = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf-8');
  const RET = "  retention: 'purge-on-remove',\n";
  ok(ssrc.includes(RET), 'the patch site of the retention control is in slack.js');
  const keepMod = require(MC.write('src/channels/slack.js', ssrc.replace(RET, "  retention: 'keep',\n"), 'keep'));
  const reg = CH.createChannelRegistry(); reg.register(keepMod.adapter);
  const K = await connected('keep', { registry: reg });
  const r2 = await K.eng.remove(K.id);
  ok(r2.ok === true && fs.existsSync(path.join(K.dir, 'msgs', K.id)), 'NEGATIVE CONTROL — a copy declaring retention:keep leaves msgs/<id> on disk (the row is what deletes it)');
}

// ── ⑦ slack-core verify r1 (F2): the owner's EDIT is decided like the proposal ──
console.log('⑦ an owner\'s edit is decided like the proposal');
async function editLeg(engMod, name) {
  const m = engMod ? await (async () => { const v = createSlackVendor({ mode: { tsShift: SHIFT } }); const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); const eng = engMod.create({ dataDir: path.join(d, 'eng'), env: {}, now, broadcast: () => {}, integrations: STORE.create({ dataDir: path.join(d, 'store'), env: {}, now, broadcast: () => {}, drivePresets: () => [], log: capture }), fetch: v.fetchFn, log: capture, ...FAST_PACE }); engines.push(eng); const st = await eng.startOAuth({ kind: 'slack' }); await eng.oauthCallback({ flowId: st.flowId, url: TOKEN }); await eng.connect('slack', { flowId: st.flowId }); await settle(eng); return { eng, v, id: 'slack' }; })() : await connected(name);
  const { eng, v } = m;
  await eng.setReach('slack', 'C0GENERAL', { principal: { kind: 'agent', id: AGENT.id, name: AGENT.name }, level: 'visible' });
  const p1 = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text: '@Bob can you check the plan?' });
  const n0 = v.state.posted.length;
  clock += 5000;
  const amb = await eng.approve(p1.proposal.id, { text: 'Thanks @Alice — @Bob is out today' });
  const ambSent = v.state.posted.length - n0;
  const st1 = eng.store.outbox.snapshot().proposals[p1.proposal.id].state;
  clock += 5000;
  const ok2 = await eng.approve(p1.proposal.id, { text: 'Thanks @alice.w — @Bob is out, ask @nobody' });
  const sent = v.state.posted[v.state.posted.length - 1];
  const stored = eng.store.outbox.snapshot().proposals[p1.proposal.id];
  return { amb, ambSent, st1, ok2, sent: sent && sent.text, stored: stored && stored.prepared };
}
{
  const r = await editLeg(null, 'edit');
  ok(r.amb.ok === false && r.amb.why === 'mention-ambiguous' && r.amb.ambiguous.join() === 'Alice' && r.ambSent === 0 && r.st1 === 'awaiting-approval', `an edit that ADDS an @Alice two people answer is refused by name, nothing sent, the proposal still waits (${r.amb.why}, ${r.ambSent} sent, ${r.st1})`);
  ok(r.ok2 && r.ok2.ok !== false && r.sent === 'Thanks <@U0ALICE02> — <@U0BOB0001> is out, ask @nobody', `an edit adding @alice.w resolves her now, keeps Bob's decided id, leaves @nobody as words (${r.sent})`);
  ok(r.stored && r.stored.notifies.join() === 'Alice,Bob' && r.stored.plain.join() === 'nobody', `the decision is stored with the edit — the card and receipt say who was notified (${JSON.stringify(r.stored && { n: r.stored.notifies, p: r.stored.plain })})`);
  const esrc = engineSource(REPO);
  const EDIT = '    if (edited && p0.prepared && !p0.compose) {';
  ok(esrc.split(EDIT).length === 2, 'the patch site of the edit-decision control is in channels-engine.js (once)');
  const r2 = await editLeg(require(MC.write('src/server/channels-engine.js', esrc.replace(EDIT, '    if (false) {'), 'noeditprep')), 'noeditprep');
  ok(r2.ambSent === 1, `NEGATIVE CONTROL — a copy that does not decide the edit SENDS the ambiguous @Alice as plain words (${r2.ambSent} sent)`);
}

// ── ⑧ two pastes through the engine (design 017) ──
console.log('⑧ two pastes through the engine');
{
  const W7 = await mkEngine('two-pastes');
  const { eng, v, frames, root } = W7;
  const from = logLines.length;
  const st = await eng.startOAuth({ kind: 'slack' });
  const fid = st.flowId;
  const ew = await threw(() => eng.oauthCallback({ flowId: fid, url: TOKEN, box: 'config' }));
  ok(ew && ew.status === 400 && ew.detail && ew.detail.code === 'user-token-wrong-box' && v.calls.length === 0, `a user token in step 1's box: 400 with its closed why (${ew && ew.detail && ew.detail.code}), nothing called`);
  const r1 = await eng.oauthCallback({ flowId: fid, url: CONFIG_TOKEN, box: 'config' });
  ok(r1.ok === true && r1.step === 'created' && r1.token === null && r1.stepFacts.appId === 'A0VIBEAPP1' && v.calls.map((c) => c.method).join() === 'apps.manifest.create', 'step 1 through the engine: ONE apps.manifest.create, the step answered with the app — and NO token (the sign-in is not finished)');
  const s1 = eng.oauthStatus(fid);
  ok(s1.running === true && s1.done === false && s1.token === null && s1.flow.step === 'created' && s1.flow.stepFacts.installUrl === 'https://api.slack.com/apps/A0VIBEAPP1/oauth', 'the status a reopened dialog reads: running at `created`, the install page by app id');
  const ec = await threw(() => eng.connect('slack', { flowId: fid }));
  ok(ec && ec.status === 409 && ec.code === 'flow-not-done' && !eng.digest().adapters.some((x) => x.kind === 'slack'), 'Connect before step 3: 409 flow-not-done, no account');
  const ee = await threw(() => eng.oauthCallback({ flowId: fid, url: CONFIG_TOKEN, box: 'user' }));
  ok(ee && ee.status === 400 && ee.detail.code === 'config-token-wrong-box', 'the setup token in step 3\'s box: 400 config-token-wrong-box');
  const r3 = await eng.oauthCallback({ flowId: fid, url: TOKEN, box: 'user' });
  ok(r3.ok === true && r3.token === fid && r3.user === 'Acme · @mart', 'step 3: the user token signs in');
  const c = await eng.connect('slack', { flowId: fid });
  ok(c.adapter && c.adapter.kind === 'slack', 'Connect creates the account');
  await settle(eng, c.adapter.id);
  const all = filesUnder(root);
  const holds = (f) => { const b = fs.readFileSync(f); return b.includes(CONFIG_TOKEN) || b.includes(encodeURIComponent(CONFIG_TOKEN)) || b.includes(CONFIG_TOKEN.slice(10, 34)) || b.includes(CLIENT_SECRET); };
  const plain = all.filter(holds);
  ok(all.some((f) => f.endsWith('adapters.json')) && !plain.length, `the setup token and the create's client secret are in NO file of the data dir (${all.length} files read)`, plain.join(', '));
  const planted = path.join(root, 'planted.json'); fs.writeFileSync(planted, JSON.stringify({ flow: { step: 'created', facts: { t: CONFIG_TOKEN } } }));
  ok(filesUnder(root).filter(holds).join() === planted, 'CONTROL: the same census finds a planted copy');
  const said = JSON.stringify([logLines.slice(from), frames, st, r1, s1, r3, c, eng.digest()]);
  ok(!said.includes(CONFIG_TOKEN) && !said.includes(CONFIG_TOKEN.slice(10, 34)) && !said.includes(CLIENT_SECRET) && !/oauth_authorize_url|signing_secret/.test(said), 'no log line, broadcast frame, answer or digest carries the setup token, a piece of it, or the credentials');
  const refresh = path.join(ROOT, 'refresh.txt'); fs.writeFileSync(refresh, `refresh=${'xoxe' + '-1-' + 'refreshfixture0123456789abcdef'}\n`);
  const scan = (script, f) => { try { execFileSync(process.execPath, [script, '--quiet', f], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  const baseScan = path.join(ROOT, 'secret-scan-base.mjs');
  let based = false;
  try { fs.writeFileSync(baseScan, execFileSync('git', ['-C', REPO, 'show', '9d448a44:scripts/secret-scan.mjs'])); based = true; } catch {}
  if (!based) console.log('  SKIP the base scanner legs: 9d448a44 is not in this checkout (a depth-1 clone)');
  const cur = path.join(REPO, 'scripts/secret-scan.mjs');
  const got = [scan(cur, planted), scan(cur, refresh), based ? scan(baseScan, planted) : null, based ? scan(baseScan, refresh) : null];
  ok(got[0] === 1 && got[1] === 1 && (!based || (got[2] === 1 && got[3] === 0)), `scripts/secret-scan.mjs finds a setup token and a refresh token (rc ${got[0]}/${got[1]}); the base's scanner caught the setup token only through its xoxp- rule and missed the refresh token (${based ? `rc ${got[2]}/${got[3]}` : 'base not readable here — skipped'})`);
  fs.unlinkSync(planted); fs.unlinkSync(refresh);
}

// ── ⑨ ONE APP PER WORKSPACE through the engine (design 018): Slack's Allow → the REAL relay script → the landing ──
//      the preset's consent URL; ONE oauth.v2.access (code + the same redirect_uri, the app by HTTP Basic) + auth.test;
//      a replay, a flipped signature, another pod's state, the wrong kind, a malformed state, past the TTL: refused by
//      name, Slack not asked; access_denied; the secret in no file / log / frame / answer / error (a planted control);
//      two members → two accounts; a paste account re-pointed through the preset (same record); no preset → the paste
//      steps; a preset without a relay on an http origin → refused `no-https`, on an https origin → its own callback;
//      the custom rung → the relay page setting's default
console.log('⑨ the workspace app through the engine');
{
  const vm = require('vm');
  const { WS_CLIENT_ID, WS_CLIENT_SECRET, WS_TOKEN } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
  const SM = require(path.join(REPO, 'src/channels/slack-manifest.js'));
  const rctx = { URL, URLSearchParams, atob }; rctx.globalThis = rctx; vm.createContext(rctx);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'docs/slack-relay/relay.js'), 'utf-8'), rctx);
  const RELAY = rctx.VibeSpaceRelay;
  const RELAY_URL = 'https://relay.example.test/slack/', ORIGIN = 'http://192.168.1.9:3000';
  const WS_TOKEN2 = WS_TOKEN.replace('abcd', 'wxyz');
  const preset = (extra = {}) => ({ VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'slack', key: 'acme', label: 'Acme', values: { clientId: WS_CLIENT_ID, clientSecret: WS_CLIENT_SECRET, relayUrl: RELAY_URL, teamDomain: 'acme', ...extra } }]) });
  const W9 = await mkEngine('workspace', { storeEnv: preset(), mode: { whoami: { [WS_TOKEN2]: { user_id: 'U0SECOND', user: 'kim' } } } });
  const { eng, v, frames, root } = W9;
  const from = logLines.length;
  const land = async (e, vv, consentUrl, opts) => {
    const back = new URL(vv.allow(consentUrl, opts));
    const d = RELAY.decide(back.search, []);
    if (d.act !== 'redirect') return { relay: d, r: null };
    const to = new URL(d.to);
    return { to, r: await e.oauthLanding({ kind: to.pathname.split('/').pop(), code: to.searchParams.get('code'), state: to.searchParams.get('state'), error: to.searchParams.get('error') }) };
  };
  const st = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const cq = new URL(st.url).searchParams;
  ok(st.credentialKey === 'cluster:acme' && cq.get('client_id') === WS_CLIENT_ID && cq.get('redirect_uri') === RELAY_URL && cq.get('user_scope') === SM.USER_SCOPES.join(',') && v.calls.length === 0, 'start under the preset: Slack\'s consent URL — the app\'s client id, the relay as redirect_uri, the user scopes; no vendor call yet');
  const L1 = await land(eng, v, st.url);
  const ex = v.calls.filter((c) => c.method === 'oauth.v2.access');
  ok(L1.to && L1.to.origin === ORIGIN && L1.to.pathname === '/api/channels/oauth/cb/slack' && L1.r.ok === true && L1.r.user === 'Acme · @mart' && ex.length === 1 && ex[0].params.redirect_uri === RELAY_URL && !!ex[0].params.code && v.calls.map((c) => c.method).join() === 'oauth.v2.access,auth.test', 'Allow → the relay sends the browser to THIS instance\'s route → ONE oauth.v2.access (the code + the SAME redirect_uri; the app by HTTP Basic) then auth.test → signed in', JSON.stringify({ to: L1.to && L1.to.href, r: L1.r, calls: v.calls.map((c) => c.method) }));
  const s1 = eng.oauthStatus(st.flowId);
  const replay = await eng.oauthLanding({ kind: 'slack', code: L1.to.searchParams.get('code'), state: L1.to.searchParams.get('state') });
  ok(s1.done === true && s1.ok === true && s1.token === st.flowId && replay.why === 'used' && v.calls.filter((c) => c.method === 'oauth.v2.access').length === 1, 'the dialog\'s poll reads it done; the same landing replayed is refused `used` and Slack is not asked again');
  const c1 = await eng.connect('slack', { flowId: st.flowId });
  ok(c1.adapter && c1.adapter.kind === 'slack' && eng.digest().adapters.filter((a) => a.kind === 'slack').length === 1, 'Connect creates the account');
  // refusals by name
  const st2 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const s2 = new URL(st2.url).searchParams.get('state');
  const other = await mkEngine('workspace-other-pod', { storeEnv: preset() });
  const sO = new URL((await other.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN })).url).searchParams.get('state');
  const n0 = v.calls.filter((c) => c.method === 'oauth.v2.access').length;
  const rf = [];
  for (const [kind, state] of [['slack', s2.slice(0, -1) + (s2.endsWith('A') ? 'B' : 'A')], ['slack', sO], ['lark', s2], ['slack', 'nonsense']]) rf.push((await eng.oauthLanding({ kind, code: '1.2.abcdef', state })).why);
  clock += 31 * 60 * 1000; const late = await eng.oauthLanding({ kind: 'slack', code: '1.2.abcdef', state: s2 }); clock -= 31 * 60 * 1000;
  ok(rf.join() === 'bad-hmac,bad-hmac,wrong-flow,bad-shape' && late.why === 'expired' && v.calls.filter((c) => c.method === 'oauth.v2.access').length === n0, `a flipped signature, another pod's state, the wrong kind's route, a malformed state, past the TTL: refused by name (${rf.join()},${late.why}), Slack never asked`);
  const st3 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const L3 = await land(eng, v, st3.url, { deny: true });
  ok(L3.r && L3.r.why === 'denied' && /did not grant/.test(eng.oauthStatus(st3.flowId).error || ''), 'access_denied: the relay passes it back, the flow ends by name');
  // two members → two accounts
  const st4 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const L4 = await land(eng, v, st4.url, { token: WS_TOKEN2 });
  const c4 = await eng.connect('slack', { flowId: st4.flowId, newAccount: true });
  ok(L4.r.ok && /@kim/.test(L4.r.user) && c4.adapter && c4.adapter.id !== c1.adapter.id && eng.digest().adapters.filter((a) => a.kind === 'slack').length === 2, 'a second member presses Allow: a second account with its own token');
  // the secret: in no file, log line, frame, answer, status or error
  const WRONG = ['wrong', 'secret', 'fixture', '0123456789'].join('-');   // split, as the fixture's own literals
  const W9b = await mkEngine('workspace-wrong-secret', { storeEnv: preset({ clientSecret: WRONG }) });
  const stb = await W9b.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const Lb = await land(W9b.eng, W9b.v, stb.url);
  const basic = Buffer.from(`${WS_CLIENT_ID}:${WS_CLIENT_SECRET}`).toString('base64'), basicB = Buffer.from(`${WS_CLIENT_ID}:${WRONG}`).toString('base64');
  ok(Lb.r.ok === false && Lb.r.why === 'failed' && /client id or secret was refused/.test(Lb.r.error || '') && !(Lb.r.error || '').includes('wrong-secret-fixture') && !(Lb.r.error || '').includes(basicB), 'a refused client (the fake ECHOES the Basic header): the landing names it — and carries neither the secret nor its Basic form', Lb.r.error);
  const holds9 = (f) => { const b = fs.readFileSync(f); return b.includes(WS_CLIENT_SECRET) || b.includes(basic) || b.includes('wrong-secret-fixture') || b.includes(basicB); };
  const files9 = [...filesUnder(root), ...filesUnder(W9b.root)];
  const said9 = JSON.stringify([logLines.slice(from), frames, W9b.frames, st, L1.r, s1, replay, c1, L3.r, L4.r, c4, Lb.r, eng.digest(), eng.oauthStatus(st3.flowId), W9b.eng.oauthStatus(stb.flowId), SW.landingHtml(Lb.r)]);
  ok(files9.some((f) => f.endsWith('adapters.json')) && !files9.filter(holds9).length && !said9.includes(WS_CLIENT_SECRET) && !said9.includes(basic) && !said9.includes('wrong-secret-fixture') && !said9.includes(basicB), `the client secret (and its Basic form) in NO file of the data dirs (${files9.length}), log line, frame, answer, status, landing page or error`);
  const planted9 = path.join(root, 'planted.json'); fs.writeFileSync(planted9, JSON.stringify({ c: WS_CLIENT_SECRET }));
  ok(filesUnder(root).filter(holds9).join() === planted9, 'CONTROL: the same census finds a planted copy'); fs.unlinkSync(planted9);
  // a paste account RE-POINTED through the preset: the same record, the token replaced
  const W10 = await mkEngine('repoint', { storeEnv: preset() });
  const sp = await W10.eng.startOAuth({ kind: 'slack', clientPreset: 'paste' });
  await W10.eng.oauthCallback({ flowId: sp.flowId, url: TOKEN });
  const cp = await W10.eng.connect('slack', { flowId: sp.flowId, clientPreset: 'paste' });
  const before = W10.eng.digest().adapters.find((a) => a.id === cp.adapter.id);
  const rr = await W10.eng.reauthorize(cp.adapter.id, { clientPreset: 'acme', origin: ORIGIN });
  const L10 = await land(W10.eng, W10.v, rr.flow.consentUrl);
  const recs = JSON.parse(fs.readFileSync(filesUnder(W10.root).find((f) => f.endsWith('adapters.json')), 'utf-8')).adapters.filter((a) => a.kind === 'slack');
  ok(sp.flow.mode === 'paste' && before && rr.rebind === true && L10.r.ok === true && recs.length === 1 && recs[0].id === cp.adapter.id && recs[0].credentialKey === 'cluster:acme', 'a paste account re-authorized through the preset: the SAME record, now bound to the preset (no second account)', JSON.stringify({ rebind: rr.rebind, r: L10.r, recs: recs.map((x) => [x.id, x.credentialKey]) }));
  // verify r1: re-pointed onto the preset as ANOTHER Slack person / workspace — the landing page AND the record refuse it
  // by name, the paste binding + token untouched (the page used to say "connected" over the record's refusal)
  for (const [who, tok, whoami] of [['another person', WS_TOKEN2, { user_id: 'U0SECOND', user: 'kim' }], ['another workspace', WS_TOKEN.replace('abcd', 'qrst'), { team_id: 'T0OTHERTEAM', team: 'Other' }]]) {
    const Wx = await mkEngine(`repoint-${who.split(' ')[1]}`, { storeEnv: preset(), mode: { whoami: { [tok]: whoami } } });
    const sx = await Wx.eng.startOAuth({ kind: 'slack', clientPreset: 'paste' });
    await Wx.eng.oauthCallback({ flowId: sx.flowId, url: TOKEN });
    const cx = await Wx.eng.connect('slack', { flowId: sx.flowId, clientPreset: 'paste' });
    const recsX = () => JSON.parse(fs.readFileSync(filesUnder(Wx.root).find((f) => f.endsWith('adapters.json')), 'utf-8')).adapters.filter((a) => a.kind === 'slack');
    const held = JSON.stringify(recsX()[0].auth);
    const rx = await Wx.eng.reauthorize(cx.adapter.id, { clientPreset: 'acme', origin: ORIGIN });
    const Lx = await land(Wx.eng, Wx.v, rx.flow.consentUrl, { token: tok });
    const after = recsX();
    // slack-landing-nologin verify r1: the landing page is cookie-free — it says the refusal in fixed words and never the held / offered identity
    ok(Lx.r.ok === false && /the account was not changed/.test(Lx.r.error || '') && /data-landing="failed"/.test(SW.landingHtml(Lx.r)) && !/t0acme001|u0self001|u0second|t0otherteam/i.test(SW.landingHtml(Lx.r)) && after.length === 1 && after[0].credentialKey == null && JSON.stringify(after[0].auth) === held && /must be the same account/.test(after[0].lastAuthError || ''), `a paste account re-pointed onto the preset as ${who}: the landing page refuses it in fixed words (no identity) and the record by name, the paste binding + token untouched`, JSON.stringify({ r: Lx.r, key: after[0] && after[0].credentialKey, err: after[0] && after[0].lastAuthError }));
  }
  {   // …and through the re-authorize dialog's PASTE-BACK (a public origin: the relay SHOWS the code, the member pastes it)
    const Wp = await mkEngine('repoint-paste', { storeEnv: preset(), mode: { whoami: { [WS_TOKEN2]: { user_id: 'U0SECOND', user: 'kim' } } } });
    const sx = await Wp.eng.startOAuth({ kind: 'slack', clientPreset: 'paste' });
    await Wp.eng.oauthCallback({ flowId: sx.flowId, url: TOKEN });
    const cx = await Wp.eng.connect('slack', { flowId: sx.flowId, clientPreset: 'paste' });
    const rx = await Wp.eng.reauthorize(cx.adapter.id, { clientPreset: 'acme', origin: 'https://pod.example.test' });
    const shown = RELAY.decide(new URL(Wp.v.allow(rx.flow.consentUrl, { token: WS_TOKEN2 })).search, []);
    const fx = await Wp.eng.finishAuth(cx.adapter.id, shown.code);
    const after = JSON.parse(fs.readFileSync(filesUnder(Wp.root).find((f) => f.endsWith('adapters.json')), 'utf-8')).adapters.filter((a) => a.kind === 'slack');
    ok(shown.act === 'show-code' && fx.ok === false && /must be the same account/.test(fx.error || '') && after.length === 1 && after[0].credentialKey == null, 'the same re-point through the dialog\'s paste-back (the relay showed the code): refused by name, the paste binding kept', JSON.stringify({ shown: shown.act, fx }));
  }
  // no preset → the paste steps; a preset without a relay: http refused `no-https`, https → its own callback; custom → the default relay page
  const np = await (await mkEngine('no-preset')).eng.startOAuth({ kind: 'slack' });
  const W11 = await mkEngine('no-relay', { storeEnv: preset({ relayUrl: '' }) });
  const nh = await threw(() => W11.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN }));
  const sh = await W11.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: 'https://pod-7.example.test' });
  const cu = await W11.eng.startOAuth({ kind: 'slack', clientPreset: 'custom', clientId: WS_CLIENT_ID, clientSecret: WS_CLIENT_SECRET, origin: ORIGIN });
  ok(np.flow.mode === 'paste' && np.credentialKey === null && nh && nh.detail && nh.detail.why === 'no-https' && new URL(sh.url).searchParams.get('redirect_uri') === 'https://pod-7.example.test/api/channels/oauth/cb/slack' && cu.credentialKey === 'custom' && new URL(cu.url).searchParams.get('redirect_uri') === 'https://problemfactory.github.io/vibespace/slack/', 'no preset → the paste steps; a preset without a relay: an http instance refused by name (no-https), an https one uses its own callback; a custom client → the relay page setting\'s default', JSON.stringify({ np: np.flow.mode, nh: nh && nh.detail, sh: sh.url && new URL(sh.url).searchParams.get('redirect_uri'), cu: cu.url && new URL(cu.url).searchParams.get('redirect_uri') }));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
