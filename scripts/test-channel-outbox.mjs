#!/usr/bin/env node
// THE OUTBOX (docs/design-communication-panel.zh.md §9.1 / §9.2 / §9.3 / §9.4;
// gate row `test-channel-outbox`, fast).
//
//   §1 PURE src/channel-policy.js — the state machine (every allowed and every
//      forbidden transition, with its actor), `decideOutbound` (guards STACK
//      on the channel policy and only TIGHTEN it: a direct policy + a link is
//      still review; an unknown policy value / an unparseable guard config
//      FAILS CLOSED; off-hours without a time zone is OFF, never guessed),
//      the TTL and the receipt.
//   §2 The REAL engine over the REAL store with the fake adapter: propose →
//      the per-conversation "For you" pointer (one item, no count in its
//      text, id persisted on the row) → approve with an edit → sent → the
//      pointer retracted by the SAME producer → the receipt handed to the
//      drafter through the ladder with `noWake` (stashed when no free lane);
//      reject; expiry through the sweep; `unknown` never auto-retried; the
//      audit attempt/outcome pair; a read-only conversation creates NOTHING.
//   §3 P4 (§9.4): THE IDEMPOTENCY MATRIX (the key handed to the adapter IS the
//      proposal id, on the send and on every reconcile; the wire text and the
//      attempt instant are stamped BEFORE the request; a two-phase handle is
//      persisted the moment the adapter hands it over) and THE RECONCILE
//      MATRIX (lost ⇒ unknown, never failed; landed ⇒ sent with the receipt
//      and the unknown-item retracted; not-landed ⇒ failed; no evidence ⇒
//      still unknown, asks counted, nothing re-sent; a typed refusal ⇒
//      failed; `idempotency:'none'` cannot be asked; the boot sweep turns a
//      `sending` corpse into `unknown`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const P = require(path.join(REPO, 'src/channel-policy.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

const ROOT = scratch('chan-outbox');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── §1 PURE ───────────────────────────────────────────────────────────────
console.log('§1 channel-policy (PURE)');
{
  const allowed = [
    ['draft', 'proposed', 'agent'], ['proposed', 'sending', 'policy'], ['proposed', 'awaiting-approval', 'policy'],
    ['awaiting-approval', 'sending', 'user'], ['awaiting-approval', 'rejected', 'user'], ['awaiting-approval', 'expired', 'ttl'], ['awaiting-approval', 'failed', 'recheck'],
    ['sending', 'sent', 'adapter'], ['sending', 'failed', 'adapter'], ['sending', 'unknown', 'adapter'],
    ['unknown', 'sent', 'reconcile'], ['unknown', 'failed', 'reconcile'],
  ];
  ok(allowed.every(([f, to, by]) => P.canTransition(f, to, by).ok), 'every transition of §9.1 is allowed for its actor');
  const forbidden = [
    ['sent', 'sending', 'user'], ['rejected', 'sending', 'user'], ['expired', 'sending', 'user'], ['failed', 'sending', 'user'],
    ['proposed', 'sent', 'adapter'], ['awaiting-approval', 'sent', 'user'], ['unknown', 'sending', 'user'], ['unknown', 'sending', 'adapter'],
    ['awaiting-approval', 'sending', 'agent'], ['awaiting-approval', 'rejected', 'agent'], ['sending', 'sent', 'user'], ['proposed', 'rejected', 'user'],
  ];
  ok(forbidden.every(([f, to, by]) => !P.canTransition(f, to, by).ok), 'every forbidden move is refused (terminal states, an agent deciding, a user sending, unknown retried)');
  ok(/never retried/.test(P.canTransition('unknown', 'sending', 'user').why), '`unknown` refuses with the §9.4 reason (a lost outcome is never retried by the machine)');
  ok(P.canTransition('nope', 'sent').why.includes('unknown state'), 'an unknown state is refused by name');
  ok(P.isTerminal('sent') && P.isTerminal('failed') && P.isTerminal('rejected') && P.isTerminal('expired') && !P.isTerminal('unknown') && !P.isTerminal('awaiting-approval'), 'terminal = sent/failed/rejected/expired; unknown is stopped, not terminal');

  const G = { linksReview: true, attachmentsReview: true, offHours: { enabled: true, tz: '' } };
  const d0 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: G, proposal: { text: 'ok', authority: 'send' } });
  ok(d0.mode === 'direct' && d0.reasons.length === 0, 'direct policy + send authority + no guard ⇒ direct', JSON.stringify(d0));
  const d1 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: G, proposal: { text: 'see https://example.com/x', authority: 'send' } });
  ok(d1.mode === 'review' && d1.reasons.includes('links') && !d1.reasons.includes('channel-policy'), 'NEGATIVE CONTROL: a DIRECT policy + a link is still review — a guard only tightens', JSON.stringify(d1));
  const d2 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: G, proposal: { text: 'ok', attachments: [{ name: 'a.pdf', bytes: 10 }], authority: 'send' } });
  ok(d2.mode === 'review' && d2.reasons.includes('attachments'), 'an attachment forces review', JSON.stringify(d2));
  const d3 = P.decideOutbound({ channelPolicy: { mode: 'review' }, guards: G, proposal: { text: 'ok', authority: 'send' } });
  ok(d3.mode === 'review' && d3.reasons.includes('channel-policy'), 'a review policy is review with the reason', JSON.stringify(d3));
  const d4 = P.decideOutbound({ channelPolicy: { mode: 'yolo' }, guards: G, proposal: { text: 'ok', authority: 'send' } });
  ok(d4.mode === 'review' && d4.detail.unknownPolicy === true, 'FAIL CLOSED: an unknown policy value is review and says so', JSON.stringify(d4));
  const d5 = P.decideOutbound({ channelPolicy: null, guards: G, proposal: { text: 'ok', authority: 'send' } });
  ok(d5.mode === 'review' && d5.reasons.includes('channel-policy'), 'no policy at all = review (decision 9: external defaults to review)');
  const d6 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: 'garbage', proposal: { text: 'ok', authority: 'send' } });
  ok(d6.mode === 'review' && typeof d6.detail.guardsUnparseable === 'string', 'FAIL CLOSED: an unparseable guard config is review and names the problem', JSON.stringify(d6));
  const d7 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: G, proposal: { text: 'ok', authority: 'draft' } });
  ok(d7.mode === 'review' && d7.reasons.includes('authority'), 'draft authority forces review (the agent was never given send)', JSON.stringify(d7));
  ok(d0.detail.offHours.state === 'off' && /no time zone/.test(d0.detail.offHours.why), 'off-hours with NO zone is OFF and says so — never guessed', JSON.stringify(d0.detail.offHours));
  // Off-hours WITH a zone: the instants are DERIVED from the clock, never a
  // literal date — walk forward from now to a Monday 12:00 and a Sunday 03:00 in UTC.
  const wall = (ms) => { const d = new Date(ms); return { wd: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  let monNoon = Date.now(); while (!(wall(monNoon).wd === 1 && wall(monNoon).min === 12 * 60)) monNoon += 60e3;
  let sunNight = Date.now(); while (!(wall(sunNight).wd === 0 && wall(sunNight).min === 3 * 60)) sunNight += 60e3;
  const GZ = { ...G, offHours: { enabled: true, tz: 'UTC', start: '09:00', end: '18:00' } };
  const d8 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: GZ, proposal: { text: 'ok', authority: 'send' }, now: monNoon });
  ok(d8.mode === 'direct' && d8.detail.offHours.state === 'inside', 'inside working hours (Monday noon UTC) ⇒ the guard does not fire', JSON.stringify(d8.detail.offHours));
  const d9 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: GZ, proposal: { text: 'ok', authority: 'send' }, now: sunNight });
  ok(d9.mode === 'review' && d9.reasons.includes('off-hours'), 'outside working hours (Sunday 03:00 UTC) ⇒ review with the reason', JSON.stringify(d9));
  const d10 = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: { ...G, offHours: { enabled: true, tz: 'Mars/Olympus' } }, proposal: { text: 'ok', authority: 'send' } });
  ok(d10.mode === 'review' && /not one this runtime knows/.test(d10.detail.guardsUnparseable || ''), 'FAIL CLOSED: an unknown zone is unparseable ⇒ review, named', JSON.stringify(d10.detail));
  ok(P.hasLinks('go to www.example.org now') && P.hasLinks('http://x.y') && !P.hasLinks('no links here, v1.2 ok'), 'hasLinks: scheme or www. host; a version number is not a link');

  const v = P.validateProposal({ text: '  hello ', why: { kind: 'alert', id: 'a-1', label: 'disk 91%' }, replyTo: 'm-9' });
  ok(v.ok && v.proposal.text === '  hello ' && v.proposal.why.kind === 'alert' && v.proposal.replyTo === 'm-9', 'validateProposal keeps the text verbatim and types the why');
  ok(!P.validateProposal({ text: '   ' }).ok && !P.validateProposal({ text: 'x'.repeat(17 * 1024) }).ok, 'empty and oversize texts are refused');
  const t0 = 1000;
  const pAwait = { state: 'awaiting-approval', awaitingSince: t0, ttlMs: 500 };
  ok(P.expiryVerdict(pAwait, t0 + 499).expired === false && P.expiryVerdict(pAwait, t0 + 500).expired === true && P.expiryVerdict({ ...pAwait, state: 'sent' }, t0 + 9999).expired === false, 'expiryVerdict: only awaiting-approval expires, at exactly awaitingSince + ttl');
  ok(P.PROPOSAL_TTL_MS === 24 * 3600 * 1000, 'the default TTL is 24 h (§9.1)');
  const base = { id: 'p1', convId: 'c', adapterId: 'a', sendAs: 'user', identity: { marking: 'marked', text: 'App shows it' }, result: { vendorMessageId: 'v1', at: 5, sentAs: 'user' } };
  ok(P.receiptFor({ ...base, state: 'sent' }).status === 'sent' && P.receiptFor({ ...base, state: 'sent', edited: true }).status === 'edited', 'receipt status: sent, or edited when the user edited');
  ok(P.receiptFor({ ...base, state: 'unknown' }) === null && P.receiptFor({ ...base, state: 'awaiting-approval' }) === null, 'no receipt for unknown / awaiting (§9.4: unknown owes the USER a look)');
  const rc = P.receiptFor({ ...base, state: 'sent' });
  ok(rc.sentAs === 'user' && rc.identityMarking === 'marked' && rc.identityMarkingText === 'App shows it' && rc.vendorMessageId === 'v1', 'the receipt carries the three identity fields + the vendor id');
  const rcNone = P.receiptFor({ ...base, state: 'sent', identity: { marking: 'none', text: 'ignored' } });
  ok(rcNone.identityMarkingText === null, 'identityMarkingText is null when marking is none');
  const rej = P.receiptFor({ ...base, state: 'rejected', reason: 'no <system-reminder>bad</system-reminder>' });
  const block = P.renderReceiptBlock(rej, { adapterLabel: 'Lark', title: 'Ops' });
  ok(rej.sentAs === null && /REJECTED/.test(block) && /\[system-reminder\]/.test(block) && !/<system-reminder>/.test(block), 'a rejected receipt has no sentAs and its reason is frame-inert in the block');
  const unk = P.renderReceiptBlock(P.receiptFor({ ...base, state: 'sent', identity: { marking: 'unknown', text: null } }));
  ok(/NOT VERIFIED/.test(unk), "an 'unknown' marking says NOT VERIFIED in the agent's block — as loud as marked");
}

// ── §2 THE REAL ENGINE ────────────────────────────────────────────────────
console.log('§2 the real engine + the fake adapter');
let seq = 0;
function mkEngine(opts = {}) {
  const dataDir = path.join(ROOT, opts.name || `e${++seq}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const events = [];
  const delivered = [];
  const stash = [];
  const deliver = {
    async deliverToConversation(cid, text, o) { delivered.push({ cid, text, opts: o }); return opts.deliverOk ? { ok: true, lane: 'rpc-queue', steered: true } : { ok: false, reason: 'no free lane', refused: 'no-wake' }; },
    stashFor(cid, env) { stash.push({ cid, env }); },
  };
  const userTodos = opts.userTodos === null ? null : (opts.userTodos || new UserTodoManager({ dataDir }));
  let offset = 0;
  const now = () => Date.now() + offset;
  const e = ENG.create({
    dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: opts.registry, broadcast: (m) => events.push(m),
    userTodos, deliver, now, serverSetting: (k) => (opts.settings || {})[k], log: { log() {}, warn() {}, error() {} },
    liveSessions: () => opts.live || [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }],
  });
  return { eng: e, events, delivered, stash, userTodos, advance: (ms) => { offset += ms; }, dataDir };
}
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };
const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;
async function prime(eng) {
  await eng.pass(A, { force: true });
  await eng.setTracked(A, C, true);
  await eng.pass(A, { force: true });
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, level: 'visible' });
}

{
  const W = mkEngine({ name: 'flow' });
  const { eng, events, delivered, stash, userTodos } = W;
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'the deploy is done, see http://example.com/run/1', why: { kind: 'alert', id: 'al-1', label: 'nightly job slow' } });
  ok(p.ok && p.proposal.state === 'awaiting-approval', 'an agent proposal on a review channel lands in awaiting-approval', JSON.stringify(p));
  ok(p.decision.reasons.includes('channel-policy') && p.decision.reasons.includes('links') && p.decision.reasons.includes('authority'), 'the verdict names every reason (policy, link, draft authority)', JSON.stringify(p.decision));
  ok(p.proposal.draftedBy.kind === 'agent' && p.proposal.draftedBy.id === 'agent-1' && p.proposal.sendAs === 'user' && p.proposal.identity.marking === 'unknown', 'the proposal records the drafter, the identity it will send as and what the recipient will see');
  const onDisk = JSON.parse(fs.readFileSync(path.join(W.dataDir, 'channels', 'outbox.json'), 'utf-8'));
  ok(onDisk.proposals[p.proposal.id] && onDisk.proposals[p.proposal.id].state === 'awaiting-approval', 'outbox.json holds it (atomic JSON through the serialized owner)');
  // THE POINTER (§9.2)
  const items = userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels');
  ok(items.length === 1 && items[0].text === 'Proposals awaiting approval in Ops room' && !/\d/.test(items[0].text), 'ONE "For you" pointer per conversation, its text WITHOUT a count', JSON.stringify(items.map((i) => i.text)));
  ok(/1 proposal awaiting/.test(items[0].detail) && /nightly|deploy/.test(items[0].detail), 'the count and the latest body live in `detail`');
  const row = eng.store.index.snapshot().conversations[KEY];
  ok(row.pendingTodoId === items[0].id, 'the item id is persisted on the CONVERSATION row (retraction needs conversation → item)');
  // a second proposal: the SAME item, detail updated in place
  const p2 = await eng.propose(AGENT, A, C, { text: 'second thought' });
  const items2 = userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels');
  ok(p2.ok && items2.length === 1 && items2[0].id === items[0].id && /2 proposals awaiting/.test(items2[0].detail) && /second thought/.test(items2[0].detail), 'a second proposal re-files the SAME item and updates its detail (dedupe by text is the idempotence we want)', JSON.stringify(items2.map((i) => [i.id, i.detail.slice(0, 40)])));
  const dg = eng.digest();
  ok(dg.awaitingTotal === 2 && dg.conversations.find((c) => c.key === KEY).outbox.awaiting === 2, 'the digest carries the awaiting counts (the rail badge / row chip = the degrade surface)');
  ok(events.some((m) => m.type === 'channel-outbox-updated' && m.outbox.awaitingTotal === 2), 'channel-outbox-updated broadcast carries the recomputed outbox');
  // APPROVE WITH AN EDIT
  const a = await eng.approve(p.proposal.id, { text: 'the deploy is done (edited by the user)' });
  ok(a.ok && a.proposal.state === 'sent' && a.proposal.edited === true && a.proposal.originalText === p.proposal.text && a.proposal.approvedBy === 'user', 'approve with an edit ⇒ sent, edited:true, both texts kept, approvedBy user', JSON.stringify(a.proposal && [a.proposal.state, a.proposal.edited]));
  ok(a.proposal.result && a.proposal.result.vendorMessageId && a.proposal.result.sentAs === 'user', 'the result records the vendor id and the identity that sent it');
  ok(a.proposal.receipt && a.proposal.receipt.status === 'edited' && a.proposal.receipt.edited === true && a.proposal.receipt.identityMarking === 'unknown', 'the receipt says EDITED and carries the identity marking');
  const stillOpen = userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels');
  ok(stillOpen.length === 1, 'the pointer stays open while the second proposal still awaits');
  // THE RECEIPT RIDES THE LADDER WITH noWake AND IS STASHED WHEN REFUSED
  ok(delivered.length === 1 && delivered[0].cid === 'agent-1' && delivered[0].opts.noWake === true && delivered[0].opts.spendReason === 'channel-receipt' && delivered[0].opts.kind === 'notification', 'the receipt went through the ladder ONCE, noWake, with its own declared spend reason', JSON.stringify(delivered.map((d) => d.opts)));
  ok(stash.length === 1 && stash[0].cid === 'agent-1' && stash[0].env.source === 'channel-receipt' && /SENT after the user edited/.test(stash[0].env.text) && /edited by the user/.test(stash[0].env.text), 'a refused free-lane delivery is STASHED for the next turn, with the final text', JSON.stringify(stash[0] && stash[0].env.text.slice(0, 120)));
  ok(a.proposal.receiptDelivery && a.proposal.receiptDelivery.stashed === true && a.proposal.receiptDelivery.woke === false, 'the delivery outcome is recorded on the proposal');
  // REJECT the second ⇒ pointer retracted by THIS producer
  const r = await eng.reject(p2.proposal.id, { reason: 'not now' });
  ok(r.ok && r.proposal.state === 'rejected' && r.proposal.receipt.status === 'rejected' && r.proposal.receipt.reason === 'not now', 'reject ⇒ rejected with the reason on the receipt');
  const after = userTodos.get(items[0].id);
  ok(after.status === 'done' && after.resolvedBy === 'system' && eng.store.index.snapshot().conversations[KEY].pendingTodoId === null, 'the last proposal leaving awaiting-approval RETRACTS the pointer (status done by "system") and clears pendingTodoId');
  ok(delivered.length === 2 && stash.length === 2, 'the rejection receipt rode the ladder too (and was stashed)');
  // AUDIT: attempt BEFORE the request, outcome after; draftedBy/approvedBy/sentAs/identityMarking on the lines
  const audit = eng.store.auditTail().filter((l) => l.kind === 'outbox' && l.proposalId === p.proposal.id).map((l) => l.op);
  ok(JSON.stringify(audit) === JSON.stringify(['propose', 'approve', 'attempt', 'outcome']), 'audit: propose → approve → attempt (before the request) → outcome (after)', JSON.stringify(audit));
  const outcome = eng.store.auditTail().find((l) => l.kind === 'outbox' && l.op === 'outcome' && l.proposalId === p.proposal.id);
  ok(outcome.draftedBy.id === 'agent-1' && outcome.approvedBy === 'user' && outcome.sentAs === 'user' && outcome.identityMarking === 'unknown' && outcome.edited === true, 'the outcome line carries draftedBy / approvedBy / sentAs / identityMarking / edited');
  // status for the agent: own proposals only
  const st = eng.statusFor(AGENT);
  ok(st.ok && st.proposals.length === 2 && st.proposals.every((x) => x.receipt), 'statusFor lists the agent\'s own proposals with receipts');
  ok(eng.statusFor({ ...AGENT, id: 'agent-2' }, p.proposal.id).code === 'not-found', "somebody else's proposal id is the uniform not-found");
  eng.stop();
}

// A READ-ONLY conversation: send-not-available, NO proposal
{
  const { eng } = mkEngine({ name: 'readonly' });
  await eng.pass(A, { force: true });
  await eng.setTracked(A, 'fake-poll-announce', true);
  await eng.pass(A, { force: true });
  await eng.setReach(A, 'fake-poll-announce', { principal: { kind: 'agent', id: 'agent-1' }, level: 'visible' });
  const r = await eng.propose(AGENT, A, 'fake-poll-announce', { text: 'hello' });
  ok(!r.ok && r.code === 'send-not-available' && /read-only-mailbox/.test(r.error), 'a conversation whose convCaps say sendAs:[] answers send-not-available WITH the adapter\'s reason', JSON.stringify(r));
  ok(Object.keys(eng.store.outbox.snapshot().proposals).length === 0, '…and NO proposal was created (§4: a proposal that can never be sent asks the user to approve a guaranteed failure)');
  eng.stop();
}

// DIRECT policy: sent at once, no pointer, user-drafted
{
  const { eng, userTodos, delivered } = mkEngine({ name: 'direct' });
  await prime(eng);
  await eng.setPolicy(A, C, 'direct');
  const r = await eng.propose({ kind: 'user' }, A, C, { text: 'from the composer' });
  ok(r.ok && r.proposal.state === 'sent' && r.decision.mode === 'direct' && r.proposal.approvedBy === 'policy' && r.proposal.draftedBy.kind === 'user', 'a user draft on a direct-policy conversation is sent at once, approvedBy policy', JSON.stringify([r.proposal.state, r.decision]));
  ok(userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels').length === 0 && delivered.length === 0, 'no pointer was filed and no receipt is owed to anybody (the drafter is the user)');
  const r2 = await eng.propose(AGENT, A, C, { text: 'agent on a direct channel' });
  ok(r2.ok && r2.proposal.state === 'awaiting-approval' && r2.decision.reasons.includes('authority') && !r2.decision.reasons.includes('channel-policy'), 'an agent WITHOUT send authority still waits on a direct channel — the authority guard, not the policy');
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all', authority: 'send' });
  const r3 = await eng.propose(AGENT, A, C, { text: 'agent with send authority' });
  ok(r3.ok && r3.proposal.state === 'sent' && r3.decision.mode === 'direct', 'with an assignment granting `send` on a direct channel the agent\'s proposal goes out at once');
  ok(delivered.length === 1 && delivered[0].opts.noWake === true, 'the agent\'s receipt still rides noWake (no receiptWake on the assignment)');
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all', authority: 'send', receiptWake: true });
  await eng.propose(AGENT, A, C, { text: 'again' });
  ok(delivered.length === 2 && delivered[1].opts.noWake === false, 'decision 8: an assignment that opted in (receiptWake) hands the receipt to the ladder WITHOUT noWake');
  eng.stop();
}

// EXPIRY through the sweep
{
  const W = mkEngine({ name: 'expiry' });
  const { eng, userTodos, stash } = W;
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'will expire' });
  const pointerId = eng.store.index.snapshot().conversations[KEY].pendingTodoId;
  ok(pointerId && userTodos.get(pointerId).status === 'open', 'the pointer is open while it waits');
  ok((await eng.expireSweep()) === 0 && eng.store.outbox.snapshot().proposals[p.proposal.id].state === 'awaiting-approval', 'the sweep before the TTL expires nothing');
  W.advance(25 * 3600 * 1000);
  const n = await eng.expireSweep();
  const q = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(n === 1 && q.state === 'expired' && q.receipt.status === 'expired', 'past 24 h the sweep expires it with a receipt', JSON.stringify([n, q.state]));
  const it = userTodos.get(pointerId);
  ok(it.status === 'done' && it.resolvedBy === 'system' && eng.store.index.snapshot().conversations[KEY].pendingTodoId === null, 'the pointer is retracted on expiry too');
  ok(stash.some((s) => /EXPIRED unapproved/.test(s.env.text)), 'the expiry receipt reached the stash');
  ok(!(await eng.approve(p.proposal.id)).ok, 'an expired proposal can no longer be approved (terminal)');
  eng.stop();
}

// UNKNOWN: a lost result is never retried by the machine
{
  const registry = CH.createChannelRegistry();
  let sends = 0;
  const throwing = { ...fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }) };
  const inner = throwing.create;
  throwing.create = (rec, deps) => { const impl = inner(rec, deps); return { ...impl, async send() { sends++; throw new Error('socket hung up mid-send'); } }; };
  registry.register(throwing);
  const W = mkEngine({ name: 'unknown', registry });
  const { eng, userTodos } = W;
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'lost in flight' });
  const a = await eng.approve(p.proposal.id);
  const q = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(!a.ok && a.code === 'unknown' && q.state === 'unknown' && sends === 1, 'an adapter that THREW mid-send leaves the proposal in `unknown` (the registry marks the throw)', JSON.stringify([a.code, q.state, sends]));
  ok(/NOT retried automatically/.test(q.reason), 'the reason says it is not retried');
  ok(userTodos.snapshot().open.some((i) => /UNKNOWN outcome/.test(i.text)), 'the USER is asked to look (a For-you item), the agent gets no receipt');
  ok(q.receipt === null, 'no receipt for an unknown outcome (§9.4)');
  W.advance(48 * 3600 * 1000);
  await eng.expireSweep();
  ok(!(await eng.approve(p.proposal.id)).ok && sends === 1 && eng.store.outbox.snapshot().proposals[p.proposal.id].state === 'unknown', 'NEGATIVE CONTROL: neither a re-approve nor the sweep ever sends it again — send() was called exactly once');
  const ops = eng.store.auditTail().filter((l) => l.proposalId === p.proposal.id).map((l) => l.op);
  ok(ops.includes('attempt') && ops.includes('outcome'), 'the audit holds the attempt AND the outcome line (the crash-between-them shape is what reconcile is for)');
  eng.stop();
}

// THE POINTER DEGRADES when the inbox refuses (cap) — the proposal survives
{
  const capped = { add() { throw new Error('this session already has 20 open items'); }, get() { return null; }, setStatus() {} };
  const { eng } = mkEngine({ name: 'capped', userTodos: capped });
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'still proposed' });
  ok(p.ok && p.proposal.state === 'awaiting-approval' && eng.digest().awaitingTotal === 1, 'when the inbox throws (open-item cap) the proposal still lands and the digest count (rail badge / row chip) carries it');
  eng.stop();
}

// ── §3 P4: THE IDEMPOTENCY + RECONCILE MATRICES ───────────────────────────
console.log('§3 P4: idempotency + reconcile');
{
  // PURE additions
  ok(P.canTransition('sending', 'unknown', 'boot').ok && !P.canTransition('sending', 'sent', 'boot').ok && !P.canTransition('unknown', 'sent', 'boot').ok, 'PURE: `boot` may only move sending → unknown (an attempt with no outcome), never anywhere else');
  ok(P.honestyLine({ draftedBy: { kind: 'agent', name: 'Worker' }, enabled: true }) === '— drafted by Worker, an AI agent, via VibeSpace' && P.honestyLine({ draftedBy: { kind: 'agent', name: 'Worker' } }) === null && P.honestyLine({ draftedBy: { kind: 'user' }, enabled: true }) === null && P.HONESTY_LINE_DEFAULT === false,
    'PURE: the honesty line is OFF by default, names the agent when ON, and a USER draft never gets one');
  ok(P.withHonestyLine('hi  \n', '— L') === 'hi\n\n— L' && P.withHonestyLine('hi', null) === 'hi', 'PURE: the wire text = the approved text + a blank line + the line (untouched when there is none)');
  ok(P.canReconcile({ sendAs: ['user'], idempotency: 'key' }).ok && P.canReconcile({ sendAs: ['user'], idempotency: 'two-phase' }).ok && !P.canReconcile({ sendAs: ['user'], idempotency: 'none' }).ok && !P.canReconcile({ sendAs: [], idempotency: 'key' }).ok && /idempotency: none/.test(P.canReconcile({ sendAs: ['user'], idempotency: 'none' }).why),
    'PURE: canReconcile — key and two-phase can be asked, `none` cannot (a person\'s look), a read-only adapter never sent anything');
  ok(P.reconcileVerdict({ landed: true, vendorMessageId: 'v9' }).to === 'sent' && P.reconcileVerdict({ landed: false }).to === 'failed' && P.reconcileVerdict({ unknown: true }).to === null && P.reconcileVerdict(null).to === null && P.reconcileVerdict('garbage').to === null,
    'PURE: reconcileVerdict maps landed/not-landed/anything-else to sent/failed/stay');

  // A SPY over the fake: records every send + reconcile the engine makes.
  function spyRegistry(caps = {}) {
    const registry = CH.createChannelRegistry();
    const base = fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] });
    const mod = { ...base, caps: { ...base.caps, ...caps } };
    const log = { sends: [], reconciles: [] };
    const inner = base.create;
    mod.create = (rec, deps) => { const impl = inner(rec, deps); return { ...impl, async send(c, args) { log.sends.push({ convId: c, ...args }); return impl.send(c, args); }, async reconcile(c, args) { log.reconciles.push({ convId: c, ...args }); return impl.reconcile(c, args); } }; };
    registry.register(mod);
    return { registry, log };
  }

  // IDEMPOTENCY: the key is the proposal id, on the send and on the reconcile
  {
    const { registry, log } = spyRegistry();
    const W = mkEngine({ name: 'idem', registry });
    const { eng } = W;
    await prime(eng);
    await eng.setPolicy(A, C, 'direct');
    const a1 = await eng.propose({ kind: 'user' }, A, C, { text: 'first' });
    const a2 = await eng.propose({ kind: 'user' }, A, C, { text: 'second' });
    ok(a1.ok && a2.ok && log.sends.length === 2 && log.sends[0].idemKey === a1.proposal.id && log.sends[1].idemKey === a2.proposal.id && a1.proposal.id !== a2.proposal.id, 'the idempotency key handed to the adapter IS the proposal id; two proposals never share one');
    ok(typeof log.sends[0].onHandle === 'function', 'a two-phase adapter is handed `onHandle` on every send');
    const p1 = eng.store.outbox.snapshot().proposals[a1.proposal.id];
    ok(Number.isFinite(p1.attemptAt) && p1.wire && p1.wire.text === 'first' && p1.wire.honestyLine === false && p1.wire.at === p1.attemptAt, 'the attempt instant and the WIRE text are stamped on the proposal BEFORE the request (what reconcile compares against)');
    const attempt = eng.store.auditTail().find((l) => l.kind === 'outbox' && l.op === 'attempt' && l.proposalId === a1.proposal.id);
    ok(attempt && attempt.idemKey === a1.proposal.id && attempt.honestyLine === false, 'the audit ATTEMPT line names the key and whether a sender line rode along');
    // the handle: a spy adapter that hands one over is persisted at once
    const { registry: r2, log: l2 } = spyRegistry({ idempotency: 'two-phase' });
    const base2 = r2.get('fake-poll'); const inner2 = base2.create;
    base2.create = (rec, deps) => { const impl = inner2(rec, deps); return { ...impl, async send(c, args) { await args.onHandle({ draftId: 'd-1', messageId: 'm-1' }); return impl.send(c, args); } }; };
    const W2 = mkEngine({ name: 'handle', registry: r2 });
    await prime(W2.eng);
    await W2.eng.setPolicy(A, C, 'direct');
    const h = await W2.eng.propose({ kind: 'user' }, A, C, { text: 'two-phase' });
    const q = W2.eng.store.outbox.snapshot().proposals[h.proposal.id];
    ok(q.state === 'sent' && q.sendHandle && q.sendHandle.draftId === 'd-1' && q.result.handle && q.result.handle.draftId === 'd-1', 'a two-phase handle the adapter hands over mid-send is PERSISTED on the proposal (a crash between the phases leaves reconcile something to ask about)');
    ok(l2.sends.length === 1, 'exactly one send');
    W2.eng.stop();
    eng.stop();
  }

  // THE RECONCILE MATRIX over the fake's markers
  {
    const { registry, log } = spyRegistry();
    const W = mkEngine({ name: 'reconcile', registry });
    const { eng, userTodos, stash } = W;
    await prime(eng);
    const openUnknown = () => userTodos.snapshot().open.filter((i) => /UNKNOWN outcome/.test(i.text));
    // (a) LOST ⇒ unknown, then landed ⇒ sent
    const pa = await eng.propose(AGENT, A, C, { text: 'lost on the wire [[fake:lost]] [[fake:landed]]' });
    const ra = await eng.approve(pa.proposal.id);
    let qa = eng.store.outbox.snapshot().proposals[pa.proposal.id];
    ok(!ra.ok && ra.code === 'unknown' && qa.state === 'unknown' && /request left and the answer was lost/.test(qa.reason) && log.sends.length === 1, 'a transport failure AFTER the request left (`detail.lost`) is UNKNOWN — never failed', JSON.stringify([ra.code, qa.state, qa.reason]));
    ok(openUnknown().length === 1 && qa.unknownTodoId === openUnknown()[0].id && qa.receipt === null, 'the user is asked to look; no receipt yet');
    const view = eng.outboxView({ key: KEY }).proposals.find((x) => x.id === pa.proposal.id);
    ok(view.canReconcile === true && view.reconcileWhy === null, 'the card may offer "Check outcome" (the adapter declares an idempotency mechanism)');
    const before = stash.length;
    const rc = await eng.reconcile(pa.proposal.id);
    qa = eng.store.outbox.snapshot().proposals[pa.proposal.id];
    ok(rc.ok && rc.resolved && rc.state === 'sent' && qa.state === 'sent' && qa.result.vendorMessageId && qa.result.reconciled === true && qa.reconcile.n === 1 && qa.reconcile.lastAnswer === 'landed' && qa.reconcile.resolvedAt, 'reconcile answers LANDED ⇒ sent by actor `reconcile`, the vendor id recorded, the ask counted', JSON.stringify(rc));
    ok(log.reconciles.length === 1 && log.reconciles[0].idemKey === pa.proposal.id && log.reconciles[0].sentAt === qa.attemptAt && log.reconciles[0].text === qa.wire.text && log.reconciles[0].handle === null, 'the adapter was asked with the SAME key, the attempt instant, the WIRE text and the (absent) handle');
    ok(log.sends.length === 1, 'NOTHING was re-sent by the engine');
    ok(qa.history.slice(-1)[0].by === 'reconcile' && qa.receipt && qa.receipt.status === 'sent' && qa.receipt.reconciled === true && stash.length === before + 1 && /reconcile check/.test(stash[stash.length - 1].env.text), 'the receipt is owed NOW: sent, marked as established by reconcile, handed to the drafter');
    const it = userTodos.get(view.unknownTodoId);
    ok(it.status === 'done' && it.resolvedBy === 'system' && qa.unknownTodoId === null && openUnknown().length === 0, 'the unknown-outcome item is RETRACTED by this producer (system) and the proposal forgets its id');
    const ops = eng.store.auditTail().filter((l) => l.kind === 'outbox' && l.proposalId === pa.proposal.id).map((l) => l.op);
    ok(JSON.stringify(ops) === JSON.stringify(['propose', 'approve', 'attempt', 'outcome', 'reconcile-attempt', 'reconcile-outcome']), 'audit: attempt → outcome(lost) → reconcile-attempt → reconcile-outcome', JSON.stringify(ops));
    ok(eng.store.auditTail().some((l) => l.op === 'outcome' && l.proposalId === pa.proposal.id && l.lost === true) && eng.store.auditTail().some((l) => l.op === 'reconcile-outcome' && l.proposalId === pa.proposal.id && l.answer === 'landed'), 'the outcome line says LOST and the reconcile line says LANDED');
    ok((await eng.reconcile(pa.proposal.id)).code === 'bad-state', 'a settled proposal cannot be reconciled again (bad-state)');
    // (b) THROW ⇒ unknown, then not-landed ⇒ failed
    const pb = await eng.propose(AGENT, A, C, { text: 'died mid-send [[fake:throw]] [[fake:not-landed]]' });
    await eng.approve(pb.proposal.id);
    const rb = await eng.reconcile(pb.proposal.id);
    const qb = eng.store.outbox.snapshot().proposals[pb.proposal.id];
    ok(rb.ok && rb.resolved && rb.state === 'failed' && qb.state === 'failed' && /holds no such message/.test(qb.reason) && qb.receipt.status === 'failed' && /holds no such message/.test(qb.receipt.reason) && qb.failure.code === 'not-landed', 'reconcile answers NOT LANDED ⇒ failed with the adapter\'s reason on the receipt', JSON.stringify([rb.state, qb.reason]));
    // (c) no evidence ⇒ still unknown, asks counted, nothing sent
    const pc = await eng.propose(AGENT, A, C, { text: 'no evidence [[fake:throw]]' });
    await eng.approve(pc.proposal.id);
    const sends0 = log.sends.length;
    const r1 = await eng.reconcile(pc.proposal.id);
    const r2 = await eng.reconcile(pc.proposal.id);
    const qc = eng.store.outbox.snapshot().proposals[pc.proposal.id];
    ok(r1.ok && r1.resolved === false && r2.ok && r2.resolved === false && qc.state === 'unknown' && qc.reconcile.n === 2 && qc.reconcile.lastAnswer === 'unknown' && /no evidence/.test(qc.reconcile.lastWhy) && qc.receipt === null && qc.unknownTodoId && log.sends.length === sends0,
      'no evidence either way ⇒ STILL unknown: the ask is counted (2), no receipt, the item stays open, nothing is sent', JSON.stringify([r1.resolved, qc.reconcile]));
    // (d) a typed refusal is FAILED, not unknown — and cannot be reconciled
    const pd = await eng.propose(AGENT, A, C, { text: 'refused [[fake:refuse]]' });
    const rd = await eng.approve(pd.proposal.id);
    const qd = eng.store.outbox.snapshot().proposals[pd.proposal.id];
    ok(!rd.ok && rd.code === 'failed' && qd.state === 'failed' && /fixture refused/.test(qd.reason) && (await eng.reconcile(pd.proposal.id)).code === 'bad-state', 'a typed refusal (403) is FAILED — a verdict, not a lost outcome');
    ok(openUnknown().length === 1, 'exactly one unknown item stays open (proposal c)');
    eng.stop();
  }

  // idempotency 'none' ⇒ the machine cannot ask
  {
    const { registry, log } = spyRegistry({ idempotency: 'none' });
    const W = mkEngine({ name: 'none', registry });
    const { eng } = W;
    await prime(eng);
    const pn = await eng.propose(AGENT, A, C, { text: 'gone [[fake:throw]] [[fake:landed]]' });
    await eng.approve(pn.proposal.id);
    const rn = await eng.reconcile(pn.proposal.id);
    const qn = eng.store.outbox.snapshot().proposals[pn.proposal.id];
    const vn = eng.outboxView({ key: KEY }).proposals.find((x) => x.id === pn.proposal.id);
    ok(!rn.ok && rn.code === 'reconcile-not-available' && /idempotency: none/.test(rn.error) && qn.state === 'unknown' && log.reconciles.length === 0 && vn.canReconcile === false && /idempotency: none/.test(vn.reconcileWhy) && qn.reconcile.lastAnswer === 'not-available',
      'an adapter declaring idempotency `none` cannot be asked: a typed refusal, the adapter never called, the card says why, the proposal stays unknown', JSON.stringify(rn));
    ok(eng.store.auditTail().some((l) => l.op === 'reconcile-refused' && l.proposalId === pn.proposal.id), 'the refusal is audited');
    eng.stop();
  }

  // THE BOOT SWEEP: a `sending` corpse becomes unknown, never re-sent
  {
    const { registry, log } = spyRegistry();
    const W = mkEngine({ name: 'boot', registry });
    await prime(W.eng);
    const pz = await W.eng.propose(AGENT, A, C, { text: 'cut off [[fake:landed]]' });
    // The previous process died between the ATTEMPT line and the OUTCOME
    // line: the proposal is `sending` on disk with its attempt stamped.
    await W.eng.store.outbox.update((ob) => { const q = ob.proposals[pz.proposal.id]; q.state = 'sending'; q.approvedBy = 'user'; q.attemptAt = Date.now(); q.wire = { text: q.text, honestyLine: false, at: q.attemptAt }; q.history.push({ state: 'sending', at: q.attemptAt, by: 'user' }); });
    W.eng.stop();
    const { registry: r2 } = spyRegistry();
    const W2 = mkEngine({ name: 'boot', registry: r2 });
    const openUnknown = () => W2.userTodos.snapshot().open.filter((i) => /UNKNOWN outcome/.test(i.text));
    ok(W2.eng.store.outbox.snapshot().proposals[pz.proposal.id].state === 'sending', 'FIXTURE: the corpse is `sending` on disk when the new process starts');
    W2.eng.start();
    for (let i = 0; i < 40 && W2.eng.store.outbox.snapshot().proposals[pz.proposal.id].state === 'sending'; i++) await new Promise((r) => setTimeout(r, 25));
    const qz = W2.eng.store.outbox.snapshot().proposals[pz.proposal.id];
    ok(qz.state === 'unknown' && qz.history.slice(-1)[0].by === 'boot' && /server stopped between the attempt and the outcome/.test(qz.reason) && qz.failure.code === 'lost-at-boot', 'start() sweeps it into `unknown` by actor `boot` with the reason', JSON.stringify([qz.state, qz.reason]));
    ok(openUnknown().length === 1 && W2.eng.store.auditTail().some((l) => l.op === 'outcome' && l.proposalId === pz.proposal.id && l.code === 'lost-at-boot'), 'the user is asked to look and the audit OUTCOME line says lost-at-boot');
    ok(log.sends.length === 0, 'NEGATIVE CONTROL: the boot sweep sent nothing');
    ok((await W2.eng.sweepSending()) === 0, 'a second sweep finds nothing (idempotent)');
    const rz = await W2.eng.reconcile(pz.proposal.id);
    ok(rz.ok && rz.resolved && rz.state === 'sent' && openUnknown().length === 0, 'reconcile settles the corpse (landed ⇒ sent) and retracts the item');
    W2.eng.stop();
  }
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
