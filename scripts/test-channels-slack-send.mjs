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
//   ⑩ THE GRID UPGRADE (lane slack-grid-identity): a legacy record re-authorized while auth.test names the org —
//      accepted, the identity learns the org once (one log line, the card's note), the next sign-in writes nothing new,
//      a sign-in without the org keeps it, another person of the org refused with the unchanged sentence, the same
//      learn through the preset's rebind door
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
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
async function mkEngine(name, { registry = undefined, mode = {}, storeEnv = {}, env = {}, presets = null } = {}) {
  const v = createSlackVendor({ mode: { tsShift: SHIFT, ...mode } });
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: storeEnv, presets, now, broadcast: () => {}, drivePresets: () => [], log: capture });
  const frames = [];
  const eng = ENG.create({ dataDir: path.join(dir, 'eng'), env, now, broadcast: (m) => frames.push(m), integrations, fetch: v.fetchFn, log: capture, ...(registry ? { registry } : {}), ...FAST_PACE });
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
const SB = require(path.join(REPO, 'src/secret-box.js'));
const SEALED_ALL = new RegExp(SB.BOX_CIPHERTEXT_RE.source, 'g');
/** lane ci-339-reds: copies of `files` (under `from`) into ROOT/<name>, every sealed value (src/secret-box.js's iv.tag.data)
 *  replaced by its length — a hygiene scan over random ciphertext is flaky by construction. → { dir, files, sealed } */
function scanSealedAsLength(files, from, name) {
  const dir = path.join(ROOT, name); let sealed = 0;
  const out = files.map((f) => { const t = path.join(dir, path.relative(from, f)); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, fs.readFileSync(f, 'utf-8').replace(SEALED_ALL, (m) => { sealed++; return `<sealed ${m.length} chars>`; })); return t; });
  return { dir, files: out, sealed };
}
/** scripts/secret-scan.mjs over `files` → { rc, found: ['<file under dir> <rule> <first 4 chars>…'] } (its --json findings) */
function secretScan(files, dir) {
  let rc = 0, out = '';
  try { execFileSync(process.execPath, [path.join(REPO, 'scripts/secret-scan.mjs'), '--quiet', '--json', ...files], { stdio: 'pipe' }); } catch (e) { rc = e.status; out = String(e.stdout || ''); }
  let found = []; try { found = JSON.parse(out || '[]'); } catch { found = [`(unreadable --json: ${out.slice(0, 80)})`]; }
  return { rc, found: found.map((x) => (typeof x === 'string' ? x : `${path.relative(dir, x.file)} ${x.rule} ${String(x.snippet || '').slice(0, 4)}…`)) };
}
const filesUnder = (d) => { const out = []; const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; if (fs.existsSync(d)) walk(d); return out; };
// item 7 (store-writer follow-up): «the token in NO file» reads what the stores still OWE too. The channels index and its
// acts journal are the store writer's paced stores (500 ms) and `settle` waits on the msgs log (synchronous), so a census
// right after it read the index's version before the pass. The owner's flush first — every dirty store under the data
// dir, through the ONE writer (null = every store; `only` keeps it to this dir) — and a store it could not write is a
// hit of the census, BY NAME.
const STORE_W = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
const unlandedUnder = (d, budgetMs = 10000) => {
  const at = path.resolve(d) + path.sep;
  const r = STORE_W.flushSync(null, { budgetMs, only: (s) => path.resolve(String(s.file)).startsWith(at) });
  return r.left.map((x) => `NOT LANDED: ${x.name || '?'} ${path.relative(d, String(x.file || ''))} (${x.why})`);
};

// ── ① connect by paste ──
console.log('① connect by paste');
const W1 = await mkEngine('connect');
{
  const { eng, v, frames, dir, root } = W1;
  const d0 = eng.digest();
  const avail = (d0.available || []).find((x) => x.kind === 'slack');
  ok(gateOf(avail) && avail.credential.source === 'paste' && !(avail.credential.missing || []).length, 'the digest OFFERS Slack as ready — no client to choose (credential source: paste)');
  const st = await eng.startOAuth({ kind: 'slack' });
  const fid = st.flowId || (st.flow && st.flow.flowId);
  ok(gateOf(st.flow) && st.flow.mode === 'paste' && gateOf(/^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=/.test(st.url || st.flow.consentUrl)) && !st.flow.listening, 'startOAuth runs a paste flow whose consent URL is the manifest link');
  const e1 = await threw(() => eng.oauthCallback({ flowId: fid, url: 'xoxb' + '-1234567890-abcdefghijk' }));
  ok(gateOf(e1) && e1.status === 400 && e1.code === 'forbidden' && verdictOf(/bot token/.test(e1.message)), `a pasted bot token: 400 by name (${e1 && e1.message.slice(0, 60)}…)`);
  ok(v.calls.length === 0, '…before any call to Slack');
  const r = await eng.oauthCallback({ flowId: fid, url: TOKEN });
  ok(r.ok === true && r.user === 'Acme · @mart', `the right token signs in as ${r.user}`);
  const c = await eng.connect('slack', { flowId: fid });
  ok(gateOf(c.adapter) && c.adapter.kind === 'slack' && c.adapter.id === 'slack', 'Connect creates the account');
  ok(verdictOf(await settle(eng)), 'the Connect\'s own first pass ingests the channel');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'adapters.json'), 'utf-8')).adapters.find((x) => x.id === 'slack');
  ok(gateOf(rec) && gateOf(rec.auth) && gateOf(rec.auth.tokenEnc) && gateOf(rec.identity) && rec.identity.userId === 't0acme001/u0self001', 'the record holds the SEALED token and the identity t…/u… (D11)');
  const unl1 = unlandedUnder(root);   // item 7 (store-writer follow-up): the owner's flush, before the files are listed
  const all = filesUnder(root);
  const plain = [...unl1, ...all.filter((f) => { const b = fs.readFileSync(f); return b.includes(TOKEN) || b.includes(encodeURIComponent(TOKEN)); })];
  ok(gateOf(all.some((f) => f.endsWith('adapters.json'))) && gateOf(all.some((f) => f.endsWith('C0GENERAL.ndjson'))) && !plain.length, `the token is in NO file of the data dir — the account record and the message log included (${all.length} files read)`, plain.join(', '));
  // lane ci-339-reds (the 2.369.339 runner's fast red): a SEALED value is random ciphertext — its base64 read a cephx key
  // («AQ» + 20 base64 after a `+` `/` `.`) in 8 of 2 000 fresh seals of this very record — so the scan reads every file with
  // each sealed value replaced by its LENGTH (the census above already proves the token is in no file), and a red names
  // its finding (file, rule, the match's first 4 chars)
  const scanned = scanSealedAsLength(all, root, 'scan-data');
  const scan = secretScan(scanned.files, scanned.dir);
  const probe = path.join(ROOT, 'probe.txt'); fs.writeFileSync(probe, `token=${TOKEN}\n`);
  const probeScan = secretScan([probe], ROOT);
  ok(scanned.sealed >= 1 && scan.rc === 0 && probeScan.rc === 1 && verdictOf(probeScan.found.some((x) => / slack-token /.test(x))), `scripts/secret-scan.mjs over the data dir finds nothing (rc ${scan.rc}; ${scanned.sealed} sealed value(s) read as their length); POSITIVE CONTROL: the same scanner finds the token in a file that holds it (rc ${probeScan.rc}: ${probeScan.found.join(', ')})`, { found: scan.found, sealed: scanned.sealed });
  // RED CONTROL — the same record with a sealed value whose ciphertext happens to hold «AQ» + 20 base64 after a `+` (what a
  // fresh seal gives once in ~250): read as bytes the scanner finds a cephx key in it; read as its length, nothing
  const rec2 = path.join(ROOT, 'scan-ctl', 'adapters.json'); fs.mkdirSync(path.dirname(rec2), { recursive: true });
  const unlucky = SB.encWith(Buffer.alloc(32, 7), 'x').replace(/\.[^.]*$/, '.ZmFrZQ+AQ' + 'Ab9+'.repeat(6) + 'cQ==');
  fs.writeFileSync(rec2, fs.readFileSync(path.join(dir, 'adapters.json'), 'utf-8').replace(rec.auth.tokenEnc, unlucky));
  const asBytes = secretScan([rec2], path.dirname(rec2)), asLength = secretScan(scanSealedAsLength([rec2], path.dirname(rec2), 'scan-ctl-len').files, path.join(ROOT, 'scan-ctl-len'));
  ok(gateOf(SB.BOX_CIPHERTEXT_RE.test(unlucky)) && asBytes.rc === 1 && asBytes.found.length === 1 && gateOf(/ cephx-key /.test(asBytes.found[0])) && asLength.rc === 0, `RED CONTROL: a sealed value whose ciphertext holds «AQ» + 20 base64 after a \`+\` — the scanner, reading its bytes, says ${JSON.stringify(asBytes.found)}; read as its length it finds nothing`, { asBytes, asLength });
  const said = JSON.stringify([logLines, frames, st, r, c]);
  ok(!said.includes(TOKEN) && !said.includes(TOKEN.slice(5, 25)), 'no log line, broadcast frame or answer carries the token (or a piece of it)');
  const view = eng.digest().adapters.find((x) => x.id === 'slack');
  ok(gateOf(view) && gateOf(view.setup) && gateOf(view.setup.probes) && view.setup.probes.userOnlyManifest === 'accepted' && view.setup.probes.planLimited === true, 'the account view carries the setup report (the first real install\'s probes by name)');
  ok(gateOf(view) && view.retention === 'purge-on-remove' && view.policyModes.join() === 'review', 'the account view says removing deletes the local copy, and that only "review" is offered');
}

// ── ② the first pass ──
console.log('② the first pass');
{
  const { eng } = W1;
  const live = eng.store.index.live();
  ok(gateOf(live['slack/D0GITHUB1']) && live['slack/D0GITHUB1'].app === true && !live['slack/D0ALICE01'].app, 'the app\'s DM is flagged `app` in the index; the person\'s DM is not');
  const rows = eng.digest({ keys: Object.keys(live) }).conversations || [];
  const gh = rows.find((x) => x.id === 'D0GITHUB1'), al = rows.find((x) => x.id === 'D0ALICE01');
  ok(gateOf(gh) && gh.app === true && gateOf(al) && !al.app, 'the row carries `app`');
  const t = Date.now();
  const tag = (row) => FOCUS.statusTag({ ...row, unread: 3, lastAt: t - 1000 }, t);
  ok(!tag(gh) || tag(gh).code !== 'direct', `an app's DM with unread messages is never the "Direct" tag (${JSON.stringify(tag(gh))})`);
  const ta = tag(al);
  ok(gateOf(ta) && ta.code === 'direct', 'CONTROL: a person\'s DM with unread messages is');
  const recs = eng.store.readTail('slack', 'C0GENERAL', { limit: 50 });
  const imp = recs.find((x) => x.vendorId === ts(10));
  const rule = { kind: 'sender-in-group', members: ['Alice'] };
  const hits = (rec) => FILTER.matchRecord({ rules: [rule], match: 'any' }, rec, {}).hit;
  ok(gateOf(imp) && !hits(imp) && verdictOf(recs.some((x) => x.author.name === 'Alice' && hits(x))), 'a bot posting as "Alice" does NOT match Alice\'s sender-in-group rule (the stored author is the app); the real Alice does');
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
  ok(gateOf(q.prepared) && q.prepared.mentions.map((x) => `${x.name}:${x.id}`).join() === 'Bob:U0BOB0001,alice.c:U0ALICE01' && q.prepared.notifies.join() === 'Bob,Alice' && q.prepared.plain.join() === 'nobody', 'the decision is STORED: @Bob → U0BOB0001, @alice.c → U0ALICE01; the card\'s notify line "Bob, Alice"; @nobody notifies nobody');
  ok(gateOf(q.audience) && q.audience.kind === 'public' && q.audience.orgs.join() === 'Acme' && q.audience.members === 40, 'and who will SEE it: everyone in Acme (40) — the card\'s audience line');
  // a member renamed (and a NEW "Bob" joined) between the proposal and the approval: nothing changes
  const bob = FX.users.U0BOB0001;
  const saved = JSON.stringify(bob);
  bob.profile.display_name = 'Robert'; bob.name = 'robert';
  FX.users.U0BOB0002 = { id: 'U0BOB0002', team_id: 'T0ACME001', name: 'bob', real_name: 'Bob New', profile: { display_name: 'Bob', real_name: 'Bob New' } };
  FX['conversations.members'].C0GENERAL.members.push('U0BOB0002');
  clock += 7 * 3600e3;
  const a = await eng.approve(p.proposal.id, {});
  const sent = v.state.posted[v.state.posted.length - 1];
  ok(gateOf(a) && a.ok !== false && gateOf(sent) && sent.text === '<@U0BOB0001> see &lt;this&gt; &amp; <@U0ALICE01> too, @nobody, @here', `what is sent is what was approved: the ids decided at propose, & < > escaped, @here left as words (${sent && sent.text})`);
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
  ok(gateOf(p2.ok) && gateOf(sent2) && sent2.text === '@Bob ping', `NEGATIVE CONTROL — an engine copy that drops \`prepared\` at the send notifies nobody (${sent2 && sent2.text}): the stored decision is what makes the mention`);
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

// ── ③b B-a0ae (fb-c0c6292765 + fb-c3d847cfc8, userW's instance): a typed `<@U…>` went out escaped as literal
// `&lt;@…&gt;`, and «@First Last» notified nobody — the person fixed both by hand in the panel ──
console.log('③b mentions as an agent writes them: «@First Last», a typed <@U…>, a member past the first lookups');
async function mentionLeg(name, registry = undefined, { limited = false } = {}) {
  const mode = { status429: {} };   // r1: switched on below for the directory's rate limit (the fake reads it per request)
  const M = await connected(name, { ...(registry ? { registry } : {}), mode });
  const { eng, v } = M;
  await eng.setReach('slack', 'C0GENERAL', { principal: { kind: 'agent', id: AGENT.id, name: AGENT.name }, level: 'visible' });
  const R = {};
  const sendOf = async (text) => {
    const r = await eng.propose(AGENT, 'slack', 'C0GENERAL', { text });
    if (!r.ok) return { refused: r.why || r.code };
    const q = eng.store.outbox.snapshot().proposals[r.proposal.id];
    clock += 2000;
    await eng.approve(r.proposal.id, {});
    const sent = v.state.posted[v.state.posted.length - 1];
    return { sent: sent && sent.text, notifies: (q.prepared && q.prepared.notifies) || [], plain: (q.prepared && q.prepared.plain) || [], over: (q.prepared && q.prepared.over) || [] };
  };
  R.two = await sendOf('@Alice Chen can you check?');
  R.raw = await sendOf('<@U0BOB0001> and <@U0OUTSIDE1> see the note');
  // r1 (the lane's adversarial read): each OCCURRENCE judged — two Alices by full name, a full name then the bare first name
  R.both = await sendOf('@Alice Chen please review, @Alice Wong please approve');
  R.thenBare = await sendOf('@Alice Chen and @Alice');
  // the follow-up (verdict 05:26Z): a name inside a typed token's label is the token's — never a mention of its own
  R.label = await sendOf('<@U0BOB0001| @Alice Chen> see this');
  // the follow-up: typed tokens and names share ONE bound of 50 marks; the overflow goes as words, said on the card
  R.many = await sendOf(`${Array.from({ length: 50 }, (_, i) => `<@U0BOB0001|b${i}>`).join(' ')} and @Alice Chen`);   // 50 typed tokens (their own cap) + one name
  // a member past the first page of lookups: fourteen new members (Zed last), the directory read paced at 6 h
  const added = Array.from({ length: 14 }, (_, i) => ({ id: `U0MEMB${String(i + 1).padStart(3, '0')}`, team_id: 'T0ACME001', name: `m${i + 1}`, real_name: i === 13 ? 'Zed Late' : `Member ${i + 1}`, profile: { display_name: i === 13 ? 'Zed' : `M${i + 1}`, real_name: i === 13 ? 'Zed Late' : `Member ${i + 1}` } }));
  // the follow-up (verdict 05:26Z, as if a must): two members called «Ada Park» and a third whose HANDLE is ada — the longer
  // reading answers two ⇒ refused, never a guess down to «@Ada»
  added.unshift({ id: 'U0ADA0001', team_id: 'T0ACME001', name: 'ada.p1', real_name: 'Ada Park', profile: { display_name: 'Ada P', real_name: 'Ada Park' } }, { id: 'U0ADA0002', team_id: 'T0ACME001', name: 'ada.p2', real_name: 'Ada Park', profile: { display_name: 'Ada K', real_name: 'Ada Park' } }, { id: 'U0ADA0003', team_id: 'T0ACME001', name: 'ada', real_name: 'Ada Lovelace', profile: { display_name: 'Ada L', real_name: 'Ada Lovelace' } });
  // r1: a THREE-word name with two Anns in the channel (named before the fourteen — the first lookups reach them)
  added.unshift({ id: 'U0ANN0001', team_id: 'T0ACME001', name: 'ann.ms', real_name: 'Ann Marie Smith', profile: { display_name: 'Ann', real_name: 'Ann Marie Smith' } }, { id: 'U0ANN0002', team_id: 'T0ACME001', name: 'ann.l', real_name: 'Ann Lee', profile: { display_name: 'Ann', real_name: 'Ann Lee' } });
  const mem = FX['conversations.members'].C0GENERAL.members, ul = FX['users.list'].members;
  const keep = { mem: mem.length, ul: ul.length };
  try {
    for (const u of added) { FX.users[u.id] = u; mem.push(u.id); ul.push(u); }
    clock += 7 * 3600e3;   // past the members cache (30 min) and the directory's pace (6 h)
    if (limited) mode.status429['users.list'] = 30;   // r1: the directory rate-limited — best effort, never a refusal
    R.late = await sendOf('@Zed Late the numbers are in');
    R.three = await sendOf('@Ann Marie Smith the draft is ready');
    R.adaPark = await sendOf('@Ada Park please look');
  } finally { mem.length = keep.mem; ul.length = keep.ul; for (const u of added) delete FX.users[u.id]; }
  return R;
}
{
  const R = await mentionLeg('mentions');
  ok(R.two.sent === '<@U0ALICE01> can you check?' && R.two.notifies.join() === 'Alice', `B-a0ae «@Alice Chen» (two Alices in the channel): the two-word name resolves ONE person — sent as that person's mention, the card says who is notified (${JSON.stringify(R.two)})`);
  ok(R.raw.sent === '<@U0BOB0001> and &lt;@U0OUTSIDE1&gt; see the note' && R.raw.notifies.join() === 'Bob' && R.raw.plain.join() === '<@U0OUTSIDE1>', `B-a0ae a typed <@U0BOB0001> of a member is KEPT as that member's mention (never escaped); one of nobody in the channel stays escaped words and notifies nobody (${JSON.stringify(R.raw)})`);
  ok(R.late.sent === '<@U0MEMB014> the numbers are in' && R.late.notifies.join() === 'Zed', `B-a0ae a member past the first ten lookups (21 in the channel) is matched through the directory (users.list, paced at 6 h) — «@Zed Late» notifies that member (${JSON.stringify(R.late)})`);
  ok(R.both.sent === '<@U0ALICE01> please review, <@U0ALICE02> please approve' && R.both.notifies.length === 2 && R.thenBare.refused === 'mention-ambiguous',
    `B-a0ae r1 each OCCURRENCE is judged: «@Alice Chen … @Alice Wong» notifies both (their first word alike); «@Alice Chen and @Alice» is refused — the bare «@Alice» answers two people (${JSON.stringify({ both: R.both, thenBare: R.thenBare })})`);
  ok(R.three.sent === '<@U0ANN0001> the draft is ready', `B-a0ae r1 a THREE-word name («@Ann Marie Smith», two Anns in the channel): the longest name that answers one person decides (${JSON.stringify(R.three)})`);
  ok(R.adaPark.refused === 'mention-ambiguous', `B-a0ae follow-up AN AMBIGUOUS NAME IS REFUSED, NEVER GUESSED: «@Ada Park» answers two members ⇒ refused by name — never the third member whose handle is ada (${JSON.stringify(R.adaPark)})`);
  ok(R.label.sent === '<@U0BOB0001> see this' && R.label.notifies.join() === 'Bob', `B-a0ae follow-up a name inside a typed token's label is the token's: «<@U0BOB0001| @Alice Chen>» notifies Bob alone — shown equals sent (${JSON.stringify(R.label)})`);
  ok(R.many.notifies.length === 50 && R.many.over.join() === 'Alice Chen' && !R.many.plain.length && verdictOf(/and @Alice Chen$/.test(R.many.sent || '')), `B-a0ae follow-up ONE bound of 50 marks: 50 typed tokens and one name — the 51st mark (the name) goes as words under its OWN label (over the limit — the cure: never «not a member here» for a member), never dropped unseen (${JSON.stringify({ notifies: R.many.notifies.length, plain: R.many.plain })})`);
  const RL = await mentionLeg('mentions-limited', undefined, { limited: true });
  ok(RL.late.sent === '@Zed Late the numbers are in' && !RL.late.refused, `B-a0ae r1 the directory read is BEST EFFORT: users.list rate-limited ⇒ the proposal is still made, the unmatched name goes as words (${JSON.stringify(RL.late)})`);
  // CONTROLS: a copy of slack.js without each part turns its own leg red
  const ssrc = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf-8');
  // the cure (verdict 06:13Z): a control whose anchor is not in slack.js (once) FAILS BY NAME — never a silent null
  const cut = (from, to, tag) => { if (ssrc.split(from).length !== 2) { ok(false, `CONTROL anchor missing: ${tag} — the line this control patches is not in slack.js once (rewritten?)`); return null; } const reg = CH.createChannelRegistry(); reg.register(require(MC.write('src/channels/slack.js', editAnchor(ssrc, from, to, "src/channels/slack.js"), tag)).adapter); return reg; };
  const noTwo = cut('        for (const l of [...longer, one]) {', '        for (const l of [one]) {', 'a0ae-two');   // the cure: the follow-up rewrote the walk — the same meaning at the new site
  const noRaw = cut('        if (ids.includes(r.id) && !(p && p.deleted)) {', '        if (false) {', 'a0ae-raw');
  const noDir = cut("      if (ids.some((id) => !people.has(id))) { try { await listPeople({ until: now() + DIRECTORY_PROPOSE_MS }); } catch { /* best effort: the lookups' names stand */ } }", '', 'a0ae-dir');
  // the follow-up's RED controls: the longest-answering reading (the old fallback to one word) and the catch around the read
  const noAmb = cut("        for (const l of [...longer, one]) { const d = match(l); if (d.length) { hit = [l, d]; break; } }\n        const [n, distinct] = hit || [one, []];", "        for (const l of longer) { const d = match(l); if (d.length === 1) { hit = [l, d]; break; } }\n        const [n, distinct] = hit || [one, match(one)];", 'a0ae-guess');   // stale-pins: kept — the RED control puts the OLD fallback back on purpose
  const noCatch = cut("{ try { await listPeople({ until: now() + DIRECTORY_PROPOSE_MS }); } catch { /* best effort: the lookups' names stand */ } }", "{ await listPeople({ until: now() + DIRECTORY_PROPOSE_MS }); }", 'a0ae-nocatch');
  ok(!!noTwo && !!noRaw && !!noDir && !!noAmb && !!noCatch, 'the five patch sites of the B-a0ae controls are in slack.js (once each)');
  const C2 = noTwo ? await mentionLeg('a0ae-two', noTwo) : null, CR = noRaw ? await mentionLeg('a0ae-raw', noRaw) : null, CD = noDir ? await mentionLeg('a0ae-dir', noDir) : null;
  const CA = noAmb ? await mentionLeg('a0ae-guess', noAmb) : null, CC = noCatch ? await mentionLeg('a0ae-nocatch', noCatch, { limited: true }) : null;
  ok(gateOf(CA) && CA.adaPark.sent === '<@U0ADA0003> Park please look' && gateOf(CC) && verdictOf(CC.late.refused), `CONTROLS B-a0ae follow-up: the old fallback (a shorter reading when the longer answers TWO) notifies the third member «ada» for «@Ada Park», «Park» left as words (${CA && JSON.stringify(CA.adaPark)}); without the catch a rate-limited directory REFUSES the proposal (${CC && JSON.stringify(CC.late)})`);
  ok(gateOf(C2) && C2.two.refused === 'mention-ambiguous' && gateOf(CR) && gateOf(/^&lt;@U0BOB0001&gt;/.test(CR.raw.sent || '')) && gateOf(CD) && CD.late.sent === '@Zed Late the numbers are in',
    `CONTROLS B-a0ae: without the two-word name «@Alice Chen» is refused as ambiguous (${C2 && JSON.stringify(C2.two)}); without the member check a typed <@U…> is escaped (${CR && CR.raw.sent}); without the directory read the late member notifies nobody (${CD && CD.late.sent})`);
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
  ok(verdictOf(P.policyModesOf({ ...slack.caps, policyModes: undefined }).includes('direct')), 'CONTROL: a caps row without policyModes offers direct (the row is what withholds it)');
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
  ok(verdictOf(fs.existsSync(path.join(dir, 'msgs', 'slack'))), 'before: the logs exist (msgs/slack)');
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
  ok(verdictOf(ssrc.includes(RET)), 'the patch site of the retention control is in slack.js');
  const keepMod = require(MC.write('src/channels/slack.js', editAnchor(ssrc, RET, "  retention: 'keep',\n", "src/channels/slack.js"), 'keep'));
  const reg = CH.createChannelRegistry(); reg.register(keepMod.adapter);
  const K = await connected('keep', { registry: reg });
  const r2 = await K.eng.remove(K.id);
  ok(r2.ok === true && verdictOf(fs.existsSync(path.join(K.dir, 'msgs', K.id))), 'NEGATIVE CONTROL — a copy declaring retention:keep leaves msgs/<id> on disk (the row is what deletes it)');
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
  const n2 = v.state.posted.length;
  const ok2 = await eng.approve(p1.proposal.id, { text: 'Thanks @alice.w — @Bob is out, ask @nobody' });
  const heldSent = v.state.posted.length - n2;
  // B-82c2 round wfgpbe038 RULE C: an edit whose decision CHANGED (here: Alice added, @nobody as words) is stored with its
  // decision and NOT sent at that press (mentions-changed); the card redraws, and the NEXT press sends what it shows
  clock += 5000;
  const ok3 = ok2 && ok2.code === 'mentions-changed' ? await eng.approve(p1.proposal.id, {}) : null;
  const sent = v.state.posted[v.state.posted.length - 1];
  const stored = eng.store.outbox.snapshot().proposals[p1.proposal.id];
  return { amb, ambSent, st1, ok2, heldSent, ok3, sent: sent && sent.text, stored: stored && stored.prepared };
}
{
  const r = await editLeg(null, 'edit');
  ok(r.amb.ok === false && r.amb.why === 'mention-ambiguous' && r.amb.ambiguous.join() === 'Alice' && r.ambSent === 0 && r.st1 === 'awaiting-approval', `an edit that ADDS an @Alice two people answer is refused by name, nothing sent, the proposal still waits (${r.amb.why}, ${r.ambSent} sent, ${r.st1})`);
  ok(gateOf(r.ok2) && r.ok2.code === 'mentions-changed' && r.heldSent === 0, `B-82c2 round wfgpbe038 RULE C: the edit adding @alice.w CHANGES who is notified — stored with its decision, nothing on the wire at that press (${r.ok2 && r.ok2.code}, ${r.heldSent} sent)`);
  ok(gateOf(r.ok3) && r.ok3.ok !== false && r.sent === 'Thanks <@U0ALICE02> — <@U0BOB0001> is out, ask @nobody', `…the next press sends what the card then showed: @alice.w resolved, Bob's id, @nobody as words (${r.sent})`);
  ok(gateOf(r.stored) && r.stored.notifies.join() === 'Alice,Bob' && r.stored.plain.join() === 'nobody', `the decision is stored with the edit — the card and receipt say who was notified (${JSON.stringify(r.stored && { n: r.stored.notifies, p: r.stored.plain })})`);
  const esrc = engineSource(REPO);
  const EDIT = '    if (recD && (registry.capsOf(recD.kind) || {}).prepareSend === true && (edited || !p0.prepared)) {';
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
  ok(gateOf(ew) && ew.status === 400 && gateOf(ew.detail) && ew.detail.code === 'user-token-wrong-box' && v.calls.length === 0, `a user token in step 1's box: 400 with its closed why (${ew && ew.detail && ew.detail.code}), nothing called`);
  const r1 = await eng.oauthCallback({ flowId: fid, url: CONFIG_TOKEN, box: 'config' });
  ok(r1.ok === true && r1.step === 'created' && r1.token === null && r1.stepFacts.appId === 'A0VIBEAPP1' && v.calls.map((c) => c.method).join() === 'apps.manifest.create', 'step 1 through the engine: ONE apps.manifest.create, the step answered with the app — and NO token (the sign-in is not finished)');
  const s1 = eng.oauthStatus(fid);
  ok(s1.running === true && s1.done === false && s1.token === null && s1.flow.step === 'created' && s1.flow.stepFacts.installUrl === 'https://api.slack.com/apps/A0VIBEAPP1/oauth', 'the status a reopened dialog reads: running at `created`, the install page by app id');
  const ec = await threw(() => eng.connect('slack', { flowId: fid }));
  ok(gateOf(ec) && ec.status === 409 && ec.code === 'flow-not-done' && !eng.digest().adapters.some((x) => x.kind === 'slack'), 'Connect before step 3: 409 flow-not-done, no account');
  const ee = await threw(() => eng.oauthCallback({ flowId: fid, url: CONFIG_TOKEN, box: 'user' }));
  ok(gateOf(ee) && ee.status === 400 && ee.detail.code === 'config-token-wrong-box', 'the setup token in step 3\'s box: 400 config-token-wrong-box');
  const r3 = await eng.oauthCallback({ flowId: fid, url: TOKEN, box: 'user' });
  ok(r3.ok === true && r3.token === fid && r3.user === 'Acme · @mart', 'step 3: the user token signs in');
  const c = await eng.connect('slack', { flowId: fid });
  ok(gateOf(c.adapter) && c.adapter.kind === 'slack', 'Connect creates the account');
  await settle(eng, c.adapter.id);
  const unl8 = unlandedUnder(root);   // item 7 (store-writer follow-up): the owner's flush, before the files are listed
  const all = filesUnder(root);
  const holds = (f) => { const b = fs.readFileSync(f); return b.includes(CONFIG_TOKEN) || b.includes(encodeURIComponent(CONFIG_TOKEN)) || b.includes(CONFIG_TOKEN.slice(10, 34)) || b.includes(CLIENT_SECRET); };
  const plain = [...unl8, ...all.filter(holds)];
  ok(gateOf(all.some((f) => f.endsWith('adapters.json'))) && !plain.length, `the setup token and the create's client secret are in NO file of the data dir (${all.length} files read)`, plain.join(', '));
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
//      the custom rung → the relay page setting's default; lane oauth-relay-road addendum 1 (the owner 2026-10-22: the public
//      page is never a company app's): a preset without its own page on a fleet pod rides the FLEET's
//      (the presets' fleet.json — lane oauth-relay-one-source; the engine reads no env for it) — an http hub too — and its
//      own page outranks the fleet's; the custom rung keeps the setting
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
  ok(gateOf(L1.to) && L1.to.origin === ORIGIN && L1.to.pathname === '/api/channels/oauth/cb/slack' && L1.r.ok === true && L1.r.user === 'Acme · @mart' && ex.length === 1 && ex[0].params.redirect_uri === RELAY_URL && !!ex[0].params.code && v.calls.map((c) => c.method).join() === 'oauth.v2.access,auth.test', 'Allow → the relay sends the browser to THIS instance\'s route → ONE oauth.v2.access (the code + the SAME redirect_uri; the app by HTTP Basic) then auth.test → signed in', JSON.stringify({ to: L1.to && L1.to.href, r: L1.r, calls: v.calls.map((c) => c.method) }));
  const s1 = eng.oauthStatus(st.flowId);
  const replay = await eng.oauthLanding({ kind: 'slack', code: L1.to.searchParams.get('code'), state: L1.to.searchParams.get('state') });
  ok(s1.done === true && s1.ok === true && s1.token === st.flowId && replay.why === 'used' && v.calls.filter((c) => c.method === 'oauth.v2.access').length === 1, 'the dialog\'s poll reads it done; the same landing replayed is refused `used` and Slack is not asked again');
  const c1 = await eng.connect('slack', { flowId: st.flowId });
  ok(gateOf(c1.adapter) && c1.adapter.kind === 'slack' && eng.digest().adapters.filter((a) => a.kind === 'slack').length === 1, 'Connect creates the account');
  // refusals by name
  const st2 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const s2 = new URL(st2.url).searchParams.get('state');
  const other = await mkEngine('workspace-other-pod', { storeEnv: preset() });
  const sO = new URL((await other.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN })).url).searchParams.get('state');
  const n0 = v.calls.filter((c) => c.method === 'oauth.v2.access').length;
  const rf = [];
  for (const [kind, state] of [['slack', s2.slice(0, -1) + (s2.endsWith('A') ? 'B' : 'A')], ['slack', sO], ['lark', s2], ['slack', 'nonsense']]) rf.push((await eng.oauthLanding({ kind, code: '1.2.abcdef', state })).why);
  clock += 31 * 60 * 1000; const late = await eng.oauthLanding({ kind: 'slack', code: '1.2.abcdef', state: s2 }); clock -= 31 * 60 * 1000;
  // lane pod-oauth-callback: Lark declares its own landing now — a Slack state on Lark's route is refused by LARK's verdict as another kind's
  ok(rf.join() === 'bad-hmac,bad-hmac,wrong-kind,bad-shape' && late.why === 'expired' && v.calls.filter((c) => c.method === 'oauth.v2.access').length === n0, `a flipped signature, another pod's state, the wrong kind's route, a malformed state, past the TTL: refused by name (${rf.join()},${late.why}), Slack never asked`);
  const st3 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const L3 = await land(eng, v, st3.url, { deny: true });
  ok(gateOf(L3.r) && L3.r.why === 'denied' && verdictOf(/did not grant/.test(eng.oauthStatus(st3.flowId).error || '')), 'access_denied: the relay passes it back, the flow ends by name');
  // two members → two accounts
  const st4 = await eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const L4 = await land(eng, v, st4.url, { token: WS_TOKEN2 });
  const c4 = await eng.connect('slack', { flowId: st4.flowId, newAccount: true });
  ok(gateOf(L4.r.ok) && gateOf(/@kim/.test(L4.r.user)) && gateOf(c4.adapter) && c4.adapter.id !== c1.adapter.id && eng.digest().adapters.filter((a) => a.kind === 'slack').length === 2, 'a second member presses Allow: a second account with its own token');
  // the secret: in no file, log line, frame, answer, status or error
  const WRONG = ['wrong', 'secret', 'fixture', '0123456789'].join('-');   // split, as the fixture's own literals
  const W9b = await mkEngine('workspace-wrong-secret', { storeEnv: preset({ clientSecret: WRONG }) });
  const stb = await W9b.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
  const Lb = await land(W9b.eng, W9b.v, stb.url);
  const basic = Buffer.from(`${WS_CLIENT_ID}:${WS_CLIENT_SECRET}`).toString('base64'), basicB = Buffer.from(`${WS_CLIENT_ID}:${WRONG}`).toString('base64');
  ok(Lb.r.ok === false && Lb.r.why === 'failed' && gateOf(/client id or secret was refused/.test(Lb.r.error || '')) && !(Lb.r.error || '').includes('wrong-secret-fixture') && !(Lb.r.error || '').includes(basicB), 'a refused client (the fake ECHOES the Basic header): the landing names it — and carries neither the secret nor its Basic form', Lb.r.error);
  const holds9 = (f) => { const b = fs.readFileSync(f); return b.includes(WS_CLIENT_SECRET) || b.includes(basic) || b.includes('wrong-secret-fixture') || b.includes(basicB); };
  const unl9 = [...unlandedUnder(root), ...unlandedUnder(W9b.root)];   // item 7 (store-writer follow-up): the owner's flush first
  const files9 = [...filesUnder(root), ...filesUnder(W9b.root)];
  const said9 = JSON.stringify([logLines.slice(from), frames, W9b.frames, st, L1.r, s1, replay, c1, L3.r, L4.r, c4, Lb.r, eng.digest(), eng.oauthStatus(st3.flowId), W9b.eng.oauthStatus(stb.flowId), SW.landingHtml(Lb.r)]);
  ok(gateOf(files9.some((f) => f.endsWith('adapters.json'))) && !unl9.length && !files9.filter(holds9).length && !said9.includes(WS_CLIENT_SECRET) && !said9.includes(basic) && !said9.includes('wrong-secret-fixture') && !said9.includes(basicB), `the client secret (and its Basic form) in NO file of the data dirs (${files9.length}), log line, frame, answer, status, landing page or error`, [...unl9, ...files9.filter(holds9)].join(', '));
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
  ok(sp.flow.mode === 'paste' && gateOf(before) && rr.rebind === true && L10.r.ok === true && recs.length === 1 && recs[0].id === cp.adapter.id && recs[0].credentialKey === 'cluster:acme', 'a paste account re-authorized through the preset: the SAME record, now bound to the preset (no second account)', JSON.stringify({ rebind: rr.rebind, r: L10.r, recs: recs.map((x) => [x.id, x.credentialKey]) }));
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
    ok(Lx.r.ok === false && gateOf(/the account was not changed/.test(Lx.r.error || '')) && gateOf(/data-landing="failed"/.test(SW.landingHtml(Lx.r))) && !/t0acme001|u0self001|u0second|t0otherteam/i.test(SW.landingHtml(Lx.r)) && after.length === 1 && after[0].credentialKey == null && JSON.stringify(after[0].auth) === held && verdictOf(/must be the same account/.test(after[0].lastAuthError || '')), `a paste account re-pointed onto the preset as ${who}: the landing page refuses it in fixed words (no identity) and the record by name, the paste binding + token untouched`, JSON.stringify({ r: Lx.r, key: after[0] && after[0].credentialKey, err: after[0] && after[0].lastAuthError }));
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
    ok(shown.act === 'show-code' && fx.ok === false && gateOf(/must be the same account/.test(fx.error || '')) && after.length === 1 && after[0].credentialKey == null, 'the same re-point through the dialog\'s paste-back (the relay showed the code): refused by name, the paste binding kept', JSON.stringify({ shown: shown.act, fx }));
  }
  // no preset → the paste steps; a preset without a relay: http refused `no-https`; https → refused `preset-unlisted` BEFORE
  // Slack opens (lane gmail-connect-wall R3: a company app comes back to the instance's own address only when its preset
  // says `instanceAddress: "listed"`), its own callback when it does; custom → the default relay page
  const np = await (await mkEngine('no-preset')).eng.startOAuth({ kind: 'slack' });
  const W11 = await mkEngine('no-relay', { storeEnv: preset({ relayUrl: '' }) });
  const nh = await threw(() => W11.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN }));
  const nl = await threw(() => W11.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: 'https://pod-7.example.test' }));
  const W11L = await mkEngine('no-relay-listed', { storeEnv: preset({ relayUrl: '', instanceAddress: 'listed' }) });
  const sh = await W11L.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: 'https://pod-7.example.test' });
  const cu = await W11.eng.startOAuth({ kind: 'slack', clientPreset: 'custom', clientId: WS_CLIENT_ID, clientSecret: WS_CLIENT_SECRET, origin: ORIGIN });
  {
    const FLEET_RELAY = 'https://admin.fleet.example.test/relay/';
    // lane oauth-relay-one-source: the fleet's page rides the presets directory (a scratch one holding only fleet.json)
    const CP = require(path.join(REPO, 'src/server/cluster-presets.js'));
    const pdir = path.join(ROOT, 'presets-fleet'); fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, CP.FILES.fleet), JSON.stringify({ relayUrl: FLEET_RELAY }));
    const fleetPresets = CP.create({ dir: pdir, log: capture });
    const W12 = await mkEngine('no-relay-fleet', { storeEnv: preset({ relayUrl: '' }), presets: fleetPresets });
    const W13 = await mkEngine('own-relay-fleet', { storeEnv: preset(), presets: fleetPresets });
    const rOf = (s) => new URL(s.url).searchParams.get('redirect_uri');
    const fh = await W12.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: ORIGIN });
    const fp = await W12.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: 'https://pod-7.fleet.example.test' });
    const fo = await W13.eng.startOAuth({ kind: 'slack', clientPreset: 'acme', origin: 'https://pod-7.fleet.example.test' });
    const fc = await W12.eng.startOAuth({ kind: 'slack', clientPreset: 'custom', clientId: WS_CLIENT_ID, clientSecret: WS_CLIENT_SECRET, origin: ORIGIN });
    const back = RELAY.decide(new URL(W12.v.allow(fp.url)).search, ['fleet.example.test']);
    ok(rOf(fh) === FLEET_RELAY && rOf(fp) === FLEET_RELAY && rOf(fo) === RELAY_URL && rOf(fc) === SM.RELAY_DEFAULT && back.act === 'redirect' && verdictOf(back.to.startsWith('https://pod-7.fleet.example.test/api/channels/oauth/cb/slack?')),
      'addendum 1: a preset naming no relay page rides the FLEET\'s on a fleet pod (an http hub too — no more no-https), the cluster\'s copy sends the pod back; a preset\'s own page outranks the fleet\'s; the custom rung keeps the setting\'s page', JSON.stringify({ fh: rOf(fh), fp: rOf(fp), fo: rOf(fo), fc: rOf(fc), back: back.act }));
  }
  ok(gateOf(nl) && gateOf(nl.detail) && nl.detail.why === 'preset-unlisted' && verdictOf(/make your own app/.test(nl.message || '')), `lane gmail-connect-wall (R3): a preset with no relay page that does not list this address is refused on an https origin BEFORE Slack opens — never a redirect its app does not list (${JSON.stringify(nl && nl.detail)})`);
  ok(np.flow.mode === 'paste' && np.credentialKey === null && gateOf(nh) && gateOf(nh.detail) && nh.detail.why === 'no-https' && new URL(sh.url).searchParams.get('redirect_uri') === 'https://pod-7.example.test/api/channels/oauth/cb/slack' && cu.credentialKey === 'custom' && new URL(cu.url).searchParams.get('redirect_uri') === 'https://problemfactory.github.io/vibespace/slack/', 'no preset → the paste steps; a preset without a relay: an http instance refused by name (no-https), an https one uses its own callback; a custom client → the relay page setting\'s default', JSON.stringify({ np: np.flow.mode, nh: nh && nh.detail, sh: sh.url && new URL(sh.url).searchParams.get('redirect_uri'), cu: cu.url && new URL(cu.url).searchParams.get('redirect_uri') }));
}

// ── ⑩ THE GRID UPGRADE through the engine (lane slack-grid-identity, 2026-10-14 — owner + userW: the workspace moved
//      into an Enterprise organisation, the old token was revoked, every re-authorize was refused as another account).
//      A LEGACY record (its stamp = the joined `t…/u…` only, as on the fleet) re-authorized by paste while auth.test
//      now answers `enterprise_id`: ACCEPTED through the record's own door, the identity LEARNS the org once (one log
//      line, the card's `lastAuthNote`), the next sign-in writes no second identity and clears the note; a later
//      sign-in without the org keeps it; ANOTHER person of the org is refused with the unchanged sentence; the same
//      learn through the preset's REBIND door (applyRebind) ──
console.log('⑩ the grid upgrade: the same person named with the org re-authorizes; the identity learns it once');
{
  const ID = require(path.join(REPO, 'src/channel-identity.js'));
  const ENT = ['E0C', 'FX', 'ORG001'].join('');   // the SHAPE of a real org id, never a real one
  const tk = (w) => TOKEN.replace('fixture', w);   // same length, same user-token shape
  const T2 = tk('gridone'), T3 = tk('gridtwo'), T4 = tk('nogrid1'), T5 = tk('gridyou');
  const whoami = { [T2]: { enterprise_id: ENT }, [T3]: { enterprise_id: ENT }, [T4]: {}, [T5]: { enterprise_id: ENT, user_id: 'U0AFXYOU02', user: 'kim' } };
  const G = await connected('grid', { mode: { extraTokens: [T2, T3, T4, T5], whoami } });
  const { eng, root } = G;
  const recOf = () => JSON.parse(fs.readFileSync(filesUnder(root).find((f) => f.endsWith('adapters.json')), 'utf-8')).adapters.find((a) => a.id === G.id);
  await eng.store.adapters.update((a) => { a.adapters.find((x) => x.id === G.id).identity = { userId: 't0acme001/u0self001' }; });   // the fleet's legacy stamp
  ok(JSON.stringify(recOf().identity) === JSON.stringify({ userId: 't0acme001/u0self001' }), 'the record holds a LEGACY stamp (the joined `t…/u…` only — every Slack record on the fleet)');
  const from = logLines.length;
  const learnLines = () => logLines.slice(from).filter((l) => /names the organisation .* the account's identity did not/.test(l));
  // 1) the grid re-authorize: the same person, auth.test now naming the org
  const r1 = await eng.reauthorize(G.id, {});
  const f1 = await eng.finishAuth(G.id, T2);
  const id1 = recOf().identity, v1 = eng.digest().adapters.find((a) => a.id === G.id);
  const ent = ENT.toLowerCase();
  ok(gateOf(r1.flow) && r1.flow.mode === 'paste' && f1.ok === true && !f1.error, `the re-authorize after the upgrade is ACCEPTED (${JSON.stringify(f1)})`);
  ok(id1.userId === `${ent}/t0acme001/u0self001` && id1.orgId === ent && id1.teamId === 't0acme001' && id1.memberId === 'u0self001', 'the identity LEARNED the org: rewritten to the richer form (`e…/t…/u…`, orgId)', JSON.stringify(id1));
  ok(gateOf(v1) && gateOf(v1.lastAuthNote) && v1.lastAuthNote.code === 'enterprise-learned' && !v1.lastAuthError && v1.auth.state === 'connected', 'the account view carries the card\'s note (`enterprise-learned`), no error, connected');
  ok(learnLines().length === 1 && verdictOf(learnLines()[0].includes(ent)), 'ONE log line says what was learned', JSON.stringify(learnLines()));
  // 2) the next sign-in naming the same org: nothing new — no second identity write, the note cleared
  await eng.reauthorize(G.id, {});
  const f2 = await eng.finishAuth(G.id, T3);
  const v2 = eng.digest().adapters.find((a) => a.id === G.id);
  ok(f2.ok === true && JSON.stringify(recOf().identity) === JSON.stringify(id1) && learnLines().length === 1 && v2.lastAuthNote === null, 'the next sign-in: accepted, the identity unchanged (no second write), still one log line, the card\'s note cleared');
  // 3) a later sign-in WITHOUT the org (impossible on Grid — the control): matches by user + workspace, the org kept
  await eng.reauthorize(G.id, {});
  const f3 = await eng.finishAuth(G.id, T4);
  ok(f3.ok === true && JSON.stringify(recOf().identity) === JSON.stringify(id1), 'a sign-in without the org matches by user + workspace; the learned org is KEPT');
  // 4) ANOTHER person of the org: refused, the sentence unchanged, nothing written
  const held = JSON.stringify(recOf().auth);
  await eng.reauthorize(G.id, {});
  const f4 = await eng.finishAuth(G.id, T5);
  const said4 = String((f4 && f4.error) || '');
  const want4 = ID.mismatchSentence(recOf().label || G.id, { held: `${ent}/t0acme001/u0self001`, offered: `${ent}/t0acme001/u0afxyou02` });
  ok(f4.ok === false && gateOf(said4.includes(want4)) && JSON.stringify(recOf().auth) === held && JSON.stringify(recOf().identity) === JSON.stringify(id1), `ANOTHER person of the org is refused with the unchanged sentence; the token and identity untouched (${said4.slice(0, 140)}…)`);
  // 5) THE REBIND DOOR: a paste account re-pointed onto a workspace preset by the same person, now named with the org
  const { WS_CLIENT_ID, WS_CLIENT_SECRET, WS_TOKEN } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
  const ORIGIN = 'http://192.168.1.9:3000', RELAY_URL = 'https://relay.example.test/slack/';
  const preset = (extra = {}) => ({ VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'slack', key: 'acme', label: 'Acme', values: { clientId: WS_CLIENT_ID, clientSecret: WS_CLIENT_SECRET, relayUrl: RELAY_URL, teamDomain: 'acme', ...extra } }]) });   // ⑨'s preset
  const Wr = await mkEngine('grid-rebind', { storeEnv: preset(), mode: { whoami: { [WS_TOKEN]: { enterprise_id: ENT } } } });
  const sp = await Wr.eng.startOAuth({ kind: 'slack', clientPreset: 'paste' });
  await Wr.eng.oauthCallback({ flowId: sp.flowId, url: TOKEN });
  const cp = await Wr.eng.connect('slack', { flowId: sp.flowId, clientPreset: 'paste' });
  await Wr.eng.store.adapters.update((a) => { a.adapters.find((x) => x.id === cp.adapter.id).identity = { userId: 't0acme001/u0self001' }; });
  const rr = await Wr.eng.reauthorize(cp.adapter.id, { clientPreset: 'acme', origin: ORIGIN });
  const back = new URL(Wr.v.allow(rr.flow.consentUrl, { token: WS_TOKEN }));
  const lr = await Wr.eng.oauthLanding({ kind: 'slack', code: back.searchParams.get('code'), state: back.searchParams.get('state') });
  const recR = JSON.parse(fs.readFileSync(filesUnder(Wr.root).find((f) => f.endsWith('adapters.json')), 'utf-8')).adapters.find((a) => a.id === cp.adapter.id);
  const vR = Wr.eng.digest().adapters.find((a) => a.id === cp.adapter.id);
  ok(rr.rebind === true && lr.ok === true && recR.credentialKey === 'cluster:acme' && recR.identity.userId === `${ent}/t0acme001/u0self001` && recR.identity.orgId === ent && gateOf(vR.lastAuthNote) && vR.lastAuthNote.code === 'enterprise-learned', `THE REBIND DOOR: the same person re-pointed onto the preset, now named with the org — accepted, re-bound, the org learned (${JSON.stringify(recR.identity)})`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
