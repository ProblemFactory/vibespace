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
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const slack = require(path.join(REPO, 'src/channels/slack.js'));
const P = require(path.join(REPO, 'src/channel-policy.js'));
const FOCUS = require(path.join(REPO, 'src/channel-focus.js'));
const FILTER = require(path.join(REPO, 'src/channel-filter.js'));
const { createSlackVendor, FX, TOKEN } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
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
async function mkEngine(name, { registry = undefined, mode = {} } = {}) {
  const v = createSlackVendor({ mode: { tsShift: SHIFT, ...mode } });
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: {}, now, broadcast: () => {}, drivePresets: () => [], log: capture });
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
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
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
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const EDIT = '    if (edited && p0.prepared && !p0.compose) {';
  ok(esrc.split(EDIT).length === 2, 'the patch site of the edit-decision control is in channels-engine.js (once)');
  const r2 = await editLeg(require(MC.write('src/server/channels-engine.js', esrc.replace(EDIT, '    if (false) {'), 'noeditprep')), 'noeditprep');
  ok(r2.ambSent === 1, `NEGATIVE CONTROL — a copy that does not decide the edit SENDS the ambiguous @Alice as plain words (${r2.ambSent} sent)`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
