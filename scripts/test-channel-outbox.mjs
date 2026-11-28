#!/usr/bin/env node
// test-channel-outbox — §1 §2 §3 §4 §5 §5v, §6 lane channel-threads, the five §C, both §bl-msg and §P of the channel outbox — the first of three fast
// suites over ONE world, scripts/channel-outbox-world.mjs (B-54a9 split, 主开发 r4755; lane bl-tests-a). Its twins test-channel-outbox-stash
// (§5v2, §5v3) and test-channel-outbox-card (§6 r6 verify) carry the rest. Every leg moved word for word, in its old order.
// The words of the one suite it came from:
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
import { scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { ROOT, fake, CH, ENG, P, editAnchor, ok, fail, pass, REPO, require, engineSource, mkEngine, AGENT, A, C, KEY, prime, sleep, settled } from './channel-outbox-world.mjs';   // THE ONE WORLD of the three suites (B-54a9, 主开发 r4755)
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
  // lane channel-threads verify r2 (IDENTITY): a drafter whose access was removed hears the FATE only
  const wh = P.renderReceiptBlock(P.receiptFor({ ...base, state: 'sent', reason: 'secret reason', inThread: true, threadKey: 'omt_after' }), { adapterLabel: 'Lark', title: 'Secret room', text: 'body', proposed: 'body', withheld: true });
  const whr = P.renderReceiptBlock({ ...P.receiptFor({ ...base, state: 'rejected', kind: 'reaction', reaction: { msg: 'om_1', key: 'OK', op: 'add' } }) }, { title: 'Secret room', withheld: true });
  ok(/^Channel receipt — proposal p1: SENT — you no longer have access to that conversation/.test(wh) && !/Secret room|v1|omt_after|secret reason|body|Lark/.test(wh) && /REJECTED by the user \(a reaction\)/.test(whr) && !/Secret room|om_1/.test(whr) && wh.split('\n').length === 1, 'the WITHHELD receipt (verify r2): one line — the proposal id, its fate, "a reaction" — never the title, the vendor / thread id, the reason, the text, the account', [wh, whr]);
}

// ── §2 THE REAL ENGINE ────────────────────────────────────────────────────
console.log('§2 the real engine + the fake adapter');

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
  await eng.refresh(A, 'fake-poll-announce');
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
  ok(delivered.length === 2 && delivered[1].opts.noWake === true, 'decision 8 RETIRED (2026-09-27, owner ruling): a stored receiptWake:true is IGNORED — how the drafter hears is chosen at the Approve / Reject action, and a direct send has no decider, so its receipt rides the next turn');
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
    const { registry: r2, log: log2 } = spyRegistry();   // r2268 ALSO CURED: the sweep runs in THIS process — its own spy is the one that sees a send
    const W2 = mkEngine({ name: 'boot', registry: r2 });
    const openUnknown = () => W2.userTodos.snapshot().open.filter((i) => /UNKNOWN outcome/.test(i.text));
    const auditOf = (op) => W2.eng.store.auditTail().filter((l) => l.op === op && l.proposalId === pz.proposal.id);
    ok(W2.eng.store.outbox.snapshot().proposals[pz.proposal.id].state === 'sending', 'FIXTURE: the corpse is `sending` on disk when the new process starts');
    W2.eng.start();
    const sweep2 = W2.eng.sweepSending();   // a second sweep beside the boot one (the audit OUTCOME line stays ONE)
    // r2268: wait for the sweep's END — its audit OUTCOME line and its item (filed with its key in one write), bounded —
    // never on the state flip alone (the flip lands first, inside transition's write: 01a89a910's UTC@node22 red read there)
    for (let i = 0; i < 200 && !(auditOf('outcome').length && openUnknown().length); i++) await new Promise((r) => setTimeout(r, 25));
    await sweep2;
    const qz = W2.eng.store.outbox.snapshot().proposals[pz.proposal.id];
    ok(qz.state === 'unknown' && qz.history.slice(-1)[0].by === 'boot' && /server stopped between the attempt and the outcome/.test(qz.reason) && qz.failure.code === 'lost-at-boot', 'start() sweeps it into `unknown` by actor `boot` with the reason', JSON.stringify([qz.state, qz.reason]));
    ok(openUnknown().length === 1 && W2.eng.store.auditTail().some((l) => l.op === 'outcome' && l.proposalId === pz.proposal.id && l.code === 'lost-at-boot'), 'the user is asked to look and the audit OUTCOME line says lost-at-boot');
    ok(log.sends.length === 0 && log2.sends.length === 0, 'NEGATIVE CONTROL: the boot sweep sent nothing (the spy of the process that swept)');
    ok(auditOf('outcome').length === 1, 'r2268: the audit OUTCOME line is written exactly ONCE for the corpse, a second sweep running beside the boot one', JSON.stringify(auditOf('outcome').length));
    { const it = openUnknown()[0];
      ok(!!it && it.itemKey === 'outbox-unknown:' + pz.proposal.id && qz.unknownTodoId === it.id, 'r2268: the item is named by the proposal\'s own id (outbox-unknown:<id>) and its id is recorded in the same write', JSON.stringify([it && it.itemKey, qz.unknownTodoId, it && it.id])); }
    ok((await W2.eng.sweepSending()) === 0, 'a second sweep finds nothing (idempotent)');
    const rz = await W2.eng.reconcile(pz.proposal.id);
    ok(rz.ok && rz.resolved && rz.state === 'sent' && openUnknown().length === 0, 'reconcile settles the corpse (landed ⇒ sent) and retracts the item');
    W2.eng.stop();
  }

  // r2268 (主开发: AN ITEM ABOUT A MESSAGE's OUTCOME NEVER OUTLIVES THE OUTCOME) — the corpse as the boot leg makes it
  const corpse = (q, t) => { q.state = 'sending'; q.approvedBy = 'user'; q.attemptAt = t; q.wire = { text: q.text, honestyLine: false, at: t }; q.history.push({ state: 'sending', at: t, by: 'user' }); };
  // THE WINDOW: «Check outcome» pressed while the boot sweep's state flip has not landed (the corpse reads `unknown`, no
  // audit line, no item yet) — the press waits for the sweep's whole step, so the audit reads in order and no item is left.
  // r4301 (主开发: A CONTROL REPRODUCES ITS FAULT BY A PLACED HOLD IN THE WINDOW, NEVER BY A CLOCK): `untilSettled` is the
  // CONTROL's window — the sweep's step stays HELD until the copy's press has settled (a copy whose sweep runs outside the queue
  // settles while it is held, on any machine under any load), so its red no longer rests on the press settling inside 80 ms.
  // The LEG's window is unchanged (the press must not settle in it). Every wait for an event is the event itself, or a poll
  // whose bound (SCENE_BOUND_MS) only names a scene that never got there — a bound never decides a reading
  const SCENE_BOUND_MS = 30000;
  async function bootWindow(ENGmod, name, { untilSettled = false } = {}) {
    const { registry } = spyRegistry();
    const W = mkEngine({ name, registry, engine: ENGmod });
    await prime(W.eng);
    const id = (await W.eng.propose(AGENT, A, C, { text: 'cut off [[fake:landed]]' })).proposal.id;
    await W.eng.store.outbox.update((ob) => corpse(ob.proposals[id], Date.now()));
    W.eng.stop();
    const { registry: r2, log: log2 } = spyRegistry();
    const W2 = mkEngine({ name, registry: r2, engine: ENGmod });
    const openUnknown = () => W2.userTodos.snapshot().open.filter((i) => /UNKNOWN outcome/.test(i.text));
    const ops = () => W2.eng.store.auditTail().filter((l) => l.kind === 'outbox' && l.proposalId === id).map((l) => l.op);
    // THE HOLD: the ONE write whose own change moves the corpse sending → unknown (the sweep's state flip) lands only when
    // the leg opens it — judged inside that write's change, never by a later read (another write landing with it would
    // read `unknown` too and be held in its place)
    const real = W2.eng.store.outbox.update;
    let open = null, held = 0, opened = false, heldNow = null;
    const gate = new Promise((r) => { open = r; });
    const holding = new Promise((r) => { heldNow = r; });   // r4301: the hold's own moment — awaited, never polled for
    W2.eng.store.outbox.update = (fn, ...a) => {
      let flip = false;
      const run = real((ob) => { const was = ob.proposals[id] && ob.proposals[id].state; const r = fn(ob); flip = was === 'sending' && !!ob.proposals[id] && ob.proposals[id].state === 'unknown'; return r; }, ...a);
      return run.then((v) => { if (flip && !held) { held++; heldNow(); return gate.then(() => v); } return v; });
    };
    const bound = () => new Promise((r) => { const tm = setTimeout(r, SCENE_BOUND_MS, 'bound'); tm.unref?.(); });
    W2.eng.start();
    await Promise.race([holding, bound()]);
    const pressed = W2.eng.reconcile(id);   // a person presses «Check outcome» in the window
    let settledInWindow = false;
    const settled = pressed.then(() => { if (!opened) settledInWindow = true; return 'settled'; }, () => 'refused');
    // THE WINDOW's END: the leg's — the press had 80 ms to settle and must not have; the control's — a PLACED hold: the step
    // stays held until the copy's press settled (its fault, reproduced on any machine), the bound naming a copy that never did
    const windowEnd = untilSettled ? await Promise.race([settled, bound()]) : await new Promise((r) => setTimeout(r, 80, 'leg window'));
    const inWindow = W2.eng.store.outbox.snapshot().proposals[id].state;
    opened = true; open();
    const rz = await pressed;
    for (let i = 0; i < SCENE_BOUND_MS / 10 && !ops().includes('outcome'); i++) await new Promise((r) => setTimeout(r, 10));   // the sweep's OUTCOME line, once it is let go
    await new Promise((r) => setTimeout(r, 30));
    const out = { held, settledInWindow, windowEnd, inWindow, rz: { ok: !!rz.ok, state: rz.state }, ops: ops(), open: openUnknown().length, sends: log2.sends.length, state: W2.eng.store.outbox.snapshot().proposals[id].state };
    W2.eng.stop();
    return out;
  }
  // THE HEAL and THE NAME: an instance from before the law boots with (a) an open item its SENT proposal still names (the
  // window's leftover), (b) a keyed one whose proposal is sent, (c) a keyed one whose proposal is still unknown and never
  // recorded the item's id. The boot sweep's heal retracts (a) and (b), leaves (c), says it once with the count; then
  // «Check outcome» on (c) retracts its item BY ITS NAME at the settle (no second heal line)
  async function healAndName(ENGmod, name) {
    const { registry } = spyRegistry();
    const W = mkEngine({ name, registry, engine: ENGmod });
    await prime(W.eng);
    const ids = [];
    for (const t of ['landed before the restart [[fake:landed]]', 'landed too [[fake:landed]]', 'still unknown [[fake:landed]]']) ids.push((await W.eng.propose(AGENT, A, C, { text: t })).proposal.id);
    const add = (text, extra) => W.userTodos.add('channels', { origin: 'channels', text, urgency: 'high', by: 'agent', sessionName: 'Channels', ...extra });
    const ia = add('Outbox: a send to ops has an UNKNOWN outcome', {});
    const ib = add('Outbox: a send to ops 2 has an UNKNOWN outcome', { itemKey: 'outbox-unknown:' + ids[1] });
    const ic = add('Outbox: a send to ops 3 has an UNKNOWN outcome', { itemKey: 'outbox-unknown:' + ids[2] });
    await W.eng.store.outbox.update((ob) => {
      const t = Date.now();
      ids.forEach((pid, k) => { const q = ob.proposals[pid]; corpse(q, t); const to = k < 2 ? 'sent' : 'unknown'; q.state = to; q.history.push({ state: to, at: t + 1, by: k < 2 ? 'reconcile' : 'adapter' }); });
      ob.proposals[ids[0]].unknownTodoId = ia.id;
    });
    W.eng.stop();
    const warns = [];
    const W2 = mkEngine({ name, registry: spyRegistry().registry, engine: ENGmod, userTodos: W.userTodos, log: { log() {}, warn: (m) => warns.push(String(m)), error() {} } });
    const st = (it) => (W.userTodos.get(it.id) || {}).status;
    const healLines = () => warns.filter((l) => /«unknown outcome» item\(s\) retracted/.test(l));
    W2.eng.start();
    await W2.eng.sweepSending();   // the boot sweep, awaited: its heal has run when it answers (never a bound waited out)
    for (let i = 0; i < 100 && !healLines().length && st(ia) === 'done'; i++) await new Promise((r) => setTimeout(r, 10));   // the heal's one line follows its clear's write
    const boot = { a: st(ia), b: st(ib), c: st(ic), lines: healLines().slice(), aNames: W2.eng.store.outbox.snapshot().proposals[ids[0]].unknownTodoId || null };
    // r2412 (4): the item read EXACTLY at the settle — an immediate queued when the write that moves (c) unknown → sent lands
    // runs after the settle's own retract (the same turn: the fake's landed answer carries nothing the settle awaits) and
    // before any heal the settle deferred (queued after it)
    let atSettle = null;
    const realU = W2.eng.store.outbox.update;
    W2.eng.store.outbox.update = (fn, ...a) => {
      let settled = false;
      const run = realU((ob) => { const q0 = ob.proposals[ids[2]]; const was = q0 && q0.state; const r = fn(ob); const q1 = ob.proposals[ids[2]]; settled = was === 'unknown' && !!q1 && q1.state === 'sent'; return r; }, ...a);
      return run.then((v) => { if (settled && atSettle === null) setImmediate(() => { atSettle = st(ic); }); return v; });
    };
    const rc = await W2.eng.reconcile(ids[2]);
    for (let i = 0; i < 50 && atSettle === null; i++) await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 60));
    const out = { boot, rc: { ok: !!rc.ok, state: rc.state }, atSettle, cAfter: st(ic), lines: healLines().slice(), ids };
    W2.eng.stop();
    return out;
  }

  // r2412 (2): THE HELD LIST — an item an older instance filed (no name, its id recorded) is settled by «Check outcome» while
  // the For-you list is held unread: no close can land, so the recorded id is KEPT, and the heal (waiting for the read) closes
  // the item at the read
  async function heldSettle(ENGmod, name) {
    const { registry } = spyRegistry();
    const W = mkEngine({ name, registry, engine: ENGmod });
    await prime(W.eng);
    const id = (await W.eng.propose(AGENT, A, C, { text: 'held at the settle [[fake:landed]]' })).proposal.id;
    const it = W.userTodos.add('channels', { origin: 'channels', text: 'Outbox: a send to ops 4 has an UNKNOWN outcome', urgency: 'high', by: 'agent', sessionName: 'Channels' });
    await W.eng.store.outbox.update((ob) => { const q = ob.proposals[id]; corpse(q, Date.now()); q.state = 'unknown'; q.history.push({ state: 'unknown', at: Date.now() + 1, by: 'adapter' }); q.unknownTodoId = it.id; });
    W.eng.stop();
    // the For-you list HELD unread on demand (the store's own hold: no write lands, its readers wait for the read)
    const hold = { on: false, waits: [] };
    const refuse = () => { throw Object.assign(new Error('the For-you list is held unread'), { code: 'todos-unread' }); };
    const todos = new Proxy(W.userTodos, { get(t, k) {
      if (k === 'isHeldUnread') return () => hold.on;
      if (k === 'whenRead') return (fn) => { if (hold.on) hold.waits.push(fn); else fn(); };
      if (hold.on && (k === 'setStatus' || k === 'setStatusMany' || k === 'add')) return refuse;
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    const W2 = mkEngine({ name, registry: spyRegistry().registry, engine: ENGmod, userTodos: todos });
    W2.eng.start();
    await W2.eng.sweepSending();
    hold.on = true;
    const rc = await W2.eng.reconcile(id);
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));   // the settle's deferred heal reaches its wait for the read
    const q = W2.eng.store.outbox.snapshot().proposals[id];
    const during = { state: q.state, names: q.unknownTodoId || null, item: (W.userTodos.get(it.id) || {}).status, waits: hold.waits.length };
    hold.on = false;
    for (const fn of hold.waits.splice(0)) fn();   // THE READ
    for (let i = 0; i < 100 && (W.userTodos.get(it.id) || {}).status === 'open'; i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 20));
    const out = { rc: { ok: !!rc.ok, state: rc.state }, during, after: { item: (W.userTodos.get(it.id) || {}).status, names: W2.eng.store.outbox.snapshot().proposals[id].unknownTodoId || null } };
    W2.eng.stop();
    return out;
  }
  {
    const Q = '    for (const p of stuck) await onProposal(p.id, () => sweepOne(p));';
    const H = '  async function healUnknownItems() {';
    const K = '(i.itemKey === key || (!!todoId && i.id === todoId))';
    const KEEP = '    const todoId = p.unknownTodoId || null;\n';
    const esrc = engineSource(REPO);
    ok(esrc.split(Q).length === 2 && esrc.split(H).length === 2 && esrc.split(K).length === 2 && esrc.split(KEEP).length === 2, 'r2268: the queued sweep line, the heal, the keyed retract and the retract\'s recorded id are present once (the controls patch exactly them)');
    const wv = await bootWindow(ENG, 'r2268-window');
    ok(wv.held === 1 && wv.inWindow === 'unknown' && !wv.settledInWindow, 'r2268 THE WINDOW: «Check outcome» pressed while the boot sweep\'s state flip is held WAITS for the sweep\'s whole step (it never settles in the window)', JSON.stringify(wv));
    ok(wv.rz.ok && wv.rz.state === 'sent' && wv.ops.filter((o) => o === 'outcome').length === 1 && JSON.stringify(wv.ops.slice(wv.ops.indexOf('outcome'))) === JSON.stringify(['outcome', 'reconcile-attempt', 'reconcile-outcome']), '…then settles it (landed ⇒ sent), the audit in order: the sweep\'s OUTCOME line (once) before the press\'s lines', JSON.stringify(wv.ops));
    ok(wv.open === 0 && wv.sends === 0 && wv.state === 'sent', '…no «unknown outcome» item outlives the outcome, and nothing was sent (a corpse is never re-sent; sent only on the vendor\'s LANDED)', JSON.stringify(wv));
    const hn = await healAndName(ENG, 'r2268-heal');
    ok(hn.boot.a === 'done' && hn.boot.b === 'done' && hn.boot.aNames === null, 'r2268 THE HEAL: at boot, an open item whose proposal is already SENT is retracted — the one a settled proposal still names (the window\'s leftover) and a keyed one', JSON.stringify(hn.boot));
    ok(hn.boot.c === 'open', '…the item of a proposal still UNKNOWN stays (it owes the person a look)', JSON.stringify(hn.boot));
    ok(hn.boot.lines.length === 1 && /\b2\b/.test(hn.boot.lines[0]) && !hn.ids.some((x) => hn.boot.lines[0].includes(x)) && !/ops|landed|unknown \[/.test(hn.boot.lines[0]), '…said ONCE in the journal with its count, no names', JSON.stringify(hn.boot.lines));
    ok(hn.rc.ok && hn.rc.state === 'sent' && hn.atSettle === 'done' && hn.lines.length === 1, 'r2268 THE NAME: «Check outcome» on a proposal whose item id was never recorded retracts the item BY ITS NAME at the settle (no heal needed: no second line)', JSON.stringify(hn));
    const hs = await heldSettle(ENG, 'r2268-held');
    ok(hs.rc.ok && hs.rc.state === 'sent' && hs.during.state === 'sent' && hs.during.names !== null && hs.during.item === 'open' && hs.during.waits >= 1, 'r2412 THE HELD LIST: «Check outcome» settles an older instance\'s unnamed item while the For-you list is held unread — the close cannot land, so the proposal KEEPS the item\'s id and the heal waits for the read', JSON.stringify(hs));
    ok(hs.after.item === 'done' && hs.after.names === null, '…at the read the heal finds the item by the kept id and closes it; only then is the id forgotten', JSON.stringify(hs.after));
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MW = mutantCopies('chan-outbox-r2268', REPO);
    const unqueued = MW.load('src/server/channels-engine.js', editAnchor(esrc, Q, '    for (const p of stuck) await sweepOne(p);', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'sweep-unqueued');
    const wr = await bootWindow(unqueued, 'r2268-window-red', { untilSettled: true });   // r4301: the window held until the copy's press settles
    ok(wr.held === 1 && wr.windowEnd === 'settled' && wr.settledInWindow && wr.ops.includes('outcome') && wr.ops.indexOf('reconcile-outcome') < wr.ops.indexOf('outcome'), 'CONTROL: a copy whose boot sweep runs OUTSIDE the queue settles in the window (held open by a placed hold until its press settles, never a clock) and writes the sweep\'s OUTCOME line AFTER the settle — the window legs would go red', JSON.stringify(wr));
    const noHeal = MW.load('src/server/channels-engine.js', editAnchor(esrc, H, H + ' return 0;', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'no-heal');
    const hr = await healAndName(noHeal, 'r2268-heal-red');
    ok(hr.boot.a === 'open' && hr.boot.b === 'open', 'CONTROL: a copy without the heal leaves both leftover items open for proposals already sent — the heal leg would go red', JSON.stringify(hr.boot));
    const byId = MW.load('src/server/channels-engine.js', editAnchor(esrc, K, '(!!todoId && i.id === todoId)', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'retract-by-id-only');
    const forgetFirst = MW.load('src/server/channels-engine.js', editAnchor(esrc, KEEP, KEEP + '    if (todoId) await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].unknownTodoId = null; });\n', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'forget-before-close');   // stale-pins: kept — the red restores the old order (forget the id before the close) on purpose
    const hr2 = await heldSettle(forgetFirst, 'r2268-held-red');
    ok(hr2.during.names === null && hr2.after.item === 'open', 'CONTROL: a copy that forgets the recorded id BEFORE the close leaves that item open for ever (the read comes, nothing finds it) — the held-list leg would go red', JSON.stringify(hr2));
    const nr = await healAndName(byId, 'r2268-name-red');
    ok(nr.atSettle === 'open', 'CONTROL: a copy that retracts only by a recorded id leaves the never-recorded item OPEN at the settle (read exactly there; only a later heal takes it) — the name leg would go red', JSON.stringify(nr));
  }
}

console.log('§4 R4 verify r2: validateCompose refuses bcc / replyTo BY NAME (never accept-and-ignore)');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('chan-outbox-r2', REPO);
  const base = { to: 'a@example.com', subject: 's', text: 'hello' };
  ok(P.validateCompose(base).ok, 'the plain form composes');
  const b1 = P.validateCompose({ ...base, bcc: 'hidden@example.com' }), b2 = P.validateCompose({ ...base, bcc: ['x@example.com'] }), r1 = P.validateCompose({ ...base, replyTo: 'm-1' });
  ok(!b1.ok && b1.why === 'bcc' && !b2.ok && b2.why === 'bcc' && /not supported/.test(b1.error), `bcc ⇒ refused by name (${b1.why}: ${b1.error})`);
  ok(!r1.ok && r1.why === 'replyTo', `replyTo on a NEW message ⇒ refused by name (${r1.why})`);
  ok(P.validateCompose({ ...base, bcc: '', replyTo: null }).ok && P.validateCompose({ ...base, bcc: [] }).ok, 'an EMPTY bcc / a null replyTo (a flag that was not given) is not a refusal');
  const src = fs.readFileSync(path.join(REPO, 'src/channel-policy.js'), 'utf-8');
  const lines = src.split('\n'); const i = lines.findIndex((l) => l.startsWith('  if (p.bcc !== undefined && p.bcc !== null'));
  ok(i > 0, 'the bcc line is present (the control removes exactly it)');
  const bad = M.load('src/channel-policy.js', lines.filter((_, k) => k !== i).join('\n'), 'bcc-dropped');
  const c = bad.validateCompose({ ...base, bcc: 'hidden@example.com' });
  ok(c.ok && !JSON.stringify(c.proposal).includes('hidden@'), 'CONTROL: a copy without the line ACCEPTS the bcc and silently drops it — the leg above would go red');
}

console.log('§5 2026-09-27: the agent WITHDRAWS / REPLACES its own proposal; the receipt carries the DIFF; the decider chooses the delivery; the receipt\'s FATE');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('chan-outbox-withdraw', REPO);
  const polSrc = fs.readFileSync(path.join(REPO, 'src/channel-policy.js'), 'utf-8');
  // ── PURE: the state machine's withdrawn rows ──
  const withdrawRows = (Pm) => {
    const allowed = [['proposed', 'withdrawn', 'agent'], ['awaiting-approval', 'withdrawn', 'agent']];
    const forbidden = [
      ['awaiting-approval', 'withdrawn', 'user'], ['awaiting-approval', 'withdrawn', 'policy'], ['awaiting-approval', 'withdrawn', 'ttl'], ['proposed', 'withdrawn', 'user'],
      ['sending', 'withdrawn', 'agent'], ['sent', 'withdrawn', 'agent'], ['failed', 'withdrawn', 'agent'], ['unknown', 'withdrawn', 'agent'], ['unknown', 'withdrawn', 'reconcile'],
      ['rejected', 'withdrawn', 'agent'], ['expired', 'withdrawn', 'agent'], ['withdrawn', 'awaiting-approval', 'agent'], ['withdrawn', 'sending', 'user'], ['withdrawn', 'withdrawn', 'agent'],
    ];
    return { allowedOk: allowed.every(([f, to, by]) => Pm.canTransition(f, to, by).ok), forbiddenBad: forbidden.filter(([f, to, by]) => Pm.canTransition(f, to, by).ok).map((x) => x.join('→')) };
  };
  const wr = withdrawRows(P);
  ok(wr.allowedOk, 'the table lets ONLY `agent` withdraw, ONLY from proposed / awaiting-approval');
  ok(wr.forbiddenBad.length === 0, 'every other withdraw is refused — the user / policy / ttl never withdraw; sending / sent / failed / unknown / rejected / expired never become withdrawn; withdrawn is terminal', wr.forbiddenBad.join(', '));
  ok(Object.entries(P.TRANSITIONS).every(([, row]) => Object.values(row).every((actors) => Array.isArray(actors) && actors.length > 0)), 'CENSUS: every transition in the table names at least one actor');
  ok(JSON.stringify(P.WITHDRAWABLE_STATES) === JSON.stringify(['proposed', 'awaiting-approval']) && P.isTerminal('withdrawn') && P.OUTBOX_STATES.includes('withdrawn') && P.RECEIPT_STATUSES.includes('withdrawn'), 'WITHDRAWABLE_STATES is derived from the table; withdrawn is a terminal outbox state and a receipt status');
  ok(/'unknown' leaves only through reconcile/.test(P.canTransition('unknown', 'withdrawn', 'agent').why), 'a lost outcome refuses the agent with the §9.4 reason (the user checks it, the agent never erases it)');
  {
    const LINE = '  sent: Object.freeze({}),';
    ok(polSrc.split(LINE).length === 2, 'the sent row is present once (the control patches exactly it)');
    const bad = M.load('src/channel-policy.js', editAnchor(polSrc, LINE, "  sent: Object.freeze({ withdrawn: ['agent'] }),", "src/channel-policy.js"), 'sent-withdrawable');
    const br = withdrawRows(bad);
    ok(br.forbiddenBad.includes('sent→withdrawn→agent'), `CONTROL: a copy that lets sent → withdrawn through is caught by the forbidden table (${br.forbiddenBad.join(', ')})`);
  }
  // ── PURE: the withdraw verdict ──
  const me = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  const mine = (state) => ({ id: 'p-9', state, draftedBy: { kind: 'agent', id: 'agent-1', name: 'Worker' } });
  ok(P.withdrawVerdict(mine('awaiting-approval'), me).ok && P.withdrawVerdict(mine('proposed'), me).ok, 'withdrawVerdict: my own undecided proposal ⇒ ok');
  const vOther = P.withdrawVerdict(mine('awaiting-approval'), { kind: 'agent', id: 'agent-2' });
  const vUser = P.withdrawVerdict({ id: 'p-8', state: 'awaiting-approval', draftedBy: { kind: 'user' } }, me);
  ok(!vOther.ok && vOther.code === 'not-yours' && /drafted by Worker/.test(vOther.why) && !vUser.ok && vUser.code === 'not-yours' && /the user/.test(vUser.why), 'somebody else\'s (another agent, the user) ⇒ not-yours, naming the drafter');
  ok(['sending', 'sent', 'failed', 'unknown', 'rejected', 'expired', 'withdrawn'].every((st) => P.withdrawVerdict(mine(st), me).code === 'not-withdrawable'), 'mine, but sending / sent / failed / unknown / rejected / expired / withdrawn ⇒ not-withdrawable');
  ok(/being sent right now/.test(P.withdrawVerdict(mine('sending'), me).why) && /user's to check/.test(P.withdrawVerdict(mine('unknown'), me).why), 'the refusal says WHY (sending; a lost outcome is the user\'s)');
  // ── PURE: the words ──
  const wp = { id: 'p-9', state: 'withdrawn', draftedBy: { kind: 'agent', id: 'agent-1', name: 'Worker' }, withdrawal: { why: 'wrong thread' }, reason: P.withdrawReason('wrong thread'), convId: 'c', adapterId: 'a', replacedBy: 'p-10' };
  ok(P.outcomeText(P.outcomeOf(wp)) === 'Withdrawn by Worker · wrong thread' && P.outcomeText(P.outcomeOf({ ...wp, withdrawal: {} })) === 'Withdrawn by Worker' && P.outcomeText(P.outcomeOf({ ...wp, draftedBy: {}, withdrawal: {} })) === 'Withdrawn.', `the card's words: "${P.outcomeText(P.outcomeOf(wp))}" / "Withdrawn by Worker" / "Withdrawn."`);
  ok(P.withdrawReason('wrong thread') === 'withdrawn by the agent: wrong thread' && P.withdrawReason('') === 'withdrawn by the agent' && P.withdrawWhy('a\nb') === 'a b', 'the stored contract reason (the CLI prints it): "withdrawn by the agent[: why]", one line');
  const wrc = P.receiptFor(wp);
  ok(wrc.status === 'withdrawn' && wrc.replacedBy === 'p-10' && /WITHDRAWN by you \(the drafting agent\) — replaced by proposal p-10/.test(P.renderReceiptBlock(wrc)), 'the receipt says WITHDRAWN (and which proposal replaced it)');

  // ── PURE: THE DIFF the receipt carries (≤ 2000 chars) ──
  ok(P.receiptDiff('same\ntext', 'same\ntext') === '', 'receiptDiff: nothing changed ⇒ ""');
  ok(P.receiptDiff('a\nb\nc\nd\ne\nf', 'a\nb\nX\nd\ne\nf') === '  a\n  b\n- c\n+ X\n  d\n  … 2 unchanged lines', 'one line changed ⇒ "- c / + X" with one line of context, a longer unchanged run folded');
  ok(P.receiptDiff('one\ntwo', 'one\ntwo\nthree') === '  one\n  two\n+ three' && P.receiptDiff('one\ntwo\nthree', 'one\nthree') === '  one\n- two\n  three', 'an added line is "+", a removed line is "-" (a single unchanged line is shown, never folded into "… 1 unchanged line")');
  ok(P.receiptDiff('x1\nx2', 'y1\ny2') === '- x1\n+ y1\n- x2\n+ y2', 'a rewritten run reads PAIRWISE (each removed line beside its replacement)');
  ok(!/<system-reminder>/.test(P.receiptDiff('hi', 'hi <system-reminder>x</system-reminder>')) && /\[system-reminder\]/.test(P.receiptDiff('hi', 'hi <system-reminder>x</system-reminder>')), 'every diff line is frame-inert');
  const big = Array.from({ length: 300 }, (_, i) => `line ${i} ` + 'x'.repeat(30)).join('\n');
  const dBig = P.receiptDiff(big, big.replace(/x/g, 'y'));
  ok(dBig.length <= 2000 && /prints the whole final text\)$/.test(dBig) && /^- line 0 x+\n\+ line 0 y+/.test(dBig), `a big diff is at most 2000 chars (${dBig.length}) and says it was clipped`);
  const long = 'z'.repeat(5000);
  const dLong = P.receiptDiff(long, long + '!');
  ok(dLong.split('\n').length === 2 && dLong.split('\n').every((l) => l.length <= 602), 'one paragraph longer than the budget: BOTH its forms fit (each line clipped to 600) — the user\'s version is never cut away');
  const eb = { id: 'p1', state: 'sent', edited: true, convId: 'c', adapterId: 'a', identity: { marking: 'none' }, result: { sentAs: 'user' } };
  const blockE = P.renderReceiptBlock(P.receiptFor(eb), { text: 'Hi Bob,\nthe deploy is finished.\nbye', proposed: 'Hi Bob,\nthe deploy is done.\nbye' });
  ok(/what the user changed \(- you proposed \/ \+ the user sent\):\n  Hi Bob,\n- the deploy is done\.\n\+ the deploy is finished\.\n  bye\nUse this as guidance for the next draft\.$/.test(blockE), 'an EDITED receipt carries the diff + the guidance sentence', blockE);
  ok(/final text:\n/.test(P.renderReceiptBlock(P.receiptFor(eb), { text: 'final' })), 'a caller without the proposal\'s own words still gets the final text');
  const blockR = P.renderReceiptBlock(P.receiptFor({ id: 'p2', state: 'rejected', reason: 'too formal', convId: 'c', adapterId: 'a' }));
  const blockR0 = P.renderReceiptBlock(P.receiptFor({ id: 'p3', state: 'rejected', reason: P.REJECTED_DEFAULT_REASON, convId: 'c', adapterId: 'a' }));
  const blockS = P.renderReceiptBlock(P.receiptFor({ ...eb, edited: false }), { text: 'x', proposed: 'x' });
  ok(/reason: too formal\nUse this as guidance/.test(blockR) && !/guidance/.test(blockR0) && !/guidance/.test(blockS), 'a rejection WITH a reason carries the guidance; a bare rejection and a plain send do not');
  ok(P.receiptFeedback({ status: 'edited' }).feedback && P.receiptFeedback({ status: 'rejected', reason: 'x' }).feedback && !P.receiptFeedback({ status: 'rejected', reason: P.REJECTED_DEFAULT_REASON }).feedback && !P.receiptFeedback({ status: 'sent' }).feedback, 'receiptFeedback: edited / a reasoned rejection are the owner\'s feedback; nothing else');
  {
    const LINE = "  const diff = r.status === 'edited' && typeof proposed === 'string' && typeof text === 'string' ? receiptDiff(proposed, text, { maxBytes: Math.max(200, maxBytes - used - utf8Bytes(DIFF_HEAD) - 2) }) : '';";
    ok(polSrc.split(LINE).length === 2, 'the diff line is present once (the control patches exactly it)');
    const bad = M.load('src/channel-policy.js', editAnchor(polSrc, LINE, "  const diff = '';", "src/channel-policy.js"), 'no-diff');
    const blk = bad.renderReceiptBlock(bad.receiptFor(eb), { text: 'Hi Bob,\nthe deploy is finished.\nbye', proposed: 'Hi Bob,\nthe deploy is done.\nbye' });
    ok(!/what the user changed/.test(blk) && /final text:/.test(blk), 'CONTROL: a copy without the diff hands the agent only the final text — the leg above would go red');
  }
  // ── PURE: the DELIVERY VERDICT (the decider's choice) ──
  const ag = { kind: 'agent', id: 'agent-1' };
  const V = (choice, p, live) => P.receiptDeliveryVerdict(choice, p, { live });
  const table = [
    [V(undefined, { draftedBy: ag }, true), 'next-turn', 'chosen', 'no choice ⇒ next-turn (free, the default)'],
    [V('next-turn', { draftedBy: ag }, true), 'next-turn', 'chosen', 'next-turn ⇒ next-turn'],
    [V('wake-now', { draftedBy: ag }, true), 'wake-now', 'chosen', 'wake-now, live ⇒ wake-now'],
    [V('wake-now', { draftedBy: ag }, null), 'wake-now', 'chosen', 'wake-now, liveness unknown ⇒ wake-now (the ladder decides)'],
    [V('wake-now', { draftedBy: ag }, false), 'next-turn', 'gone', 'wake-now on a session that is not live ⇒ next-turn (gone — the stash keeps it)'],
    [V('wake-now', { draftedBy: ag, receiptWake: { ok: true } }, true), 'next-turn', 'already-woken', 'wake-now a SECOND time ⇒ next-turn (already-woken)'],
    [V('wake-now', { draftedBy: { kind: 'user' } }, true), 'none', 'user-draft', 'the user\'s own draft ⇒ nobody to tell'],
    [V('wake-now', { draftedBy: ag, state: 'withdrawn' }, true), 'none', 'withdrawn', 'withdrawn by the agent itself ⇒ none'],
    [V('bogus', { draftedBy: ag }, true), 'next-turn', 'unknown-choice', 'an unknown choice ⇒ next-turn (fail closed to the free one)'],
  ];
  for (const [v, d, w, name] of table) ok(v.deliver === d && v.why === w, `receiptDeliveryVerdict: ${name}`, JSON.stringify(v));
  {
    const LINE = "  if (p.receiptWake) return { deliver: 'next-turn', why: 'already-woken' };";
    ok(polSrc.split(LINE).length === 2, 'the one-per-proposal line is present once (the control removes exactly it)');
    const bad = M.load('src/channel-policy.js', editAnchor(polSrc, LINE, '', "src/channel-policy.js"), 'wake-twice');
    ok(bad.receiptDeliveryVerdict('wake-now', { draftedBy: ag, receiptWake: { ok: true } }, { live: true }).deliver === 'wake-now', 'CONTROL: a copy without the row check wakes the same proposal twice — the table above would go red');
  }
  // ── PURE: THE FATE ──
  const base5 = { receipt: { status: 'sent' }, draftedBy: { kind: 'agent', id: 'agent-1', name: 'Worker' }, state: 'sent' };
  const FT = (x) => P.receiptFateText(P.receiptFateOf(x), { stamp: () => '14:02', refusalText: (c) => (c === 'spend' ? 'the spend ceiling' : '') });
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: true, lane: 'message', woke: false } }) === 'Handed to Worker at 14:02', 'fate: handed by the ladder ⇒ "Handed to Worker at 14:02"');
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: true, lane: 'message', woke: true } }) === 'Handed to Worker at 14:02 — it was woken for it', 'fate: handed with a wake ⇒ says it was woken');
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: false, stashed: true } }) === "Waiting for Worker's next message", 'fate: stashed ⇒ "Waiting for Worker\'s next message"');
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: false, stashed: true }, receiptDrainedAt: 5 }) === 'Handed to Worker at 14:02', 'fate: the stash DRAINED into its next message ⇒ handed');
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: false, stashed: true, gone: true } }) === 'Worker is gone — receipt kept', 'fate: not live ⇒ "Worker is gone — receipt kept"');
  ok(FT({ ...base5, receiptDelivery: { at: 1, ok: false, stashed: true, woke: true, refused: 'spend' } }) === "Waiting for Worker's next message — waking it was refused: the spend ceiling", 'fate: a wake the ceiling refused is SAID beside the wait');
  ok(P.receiptFateOf({ ...base5, draftedBy: { kind: 'user' } }) === null && P.receiptFateOf({ ...base5, state: 'withdrawn' }) === null && P.receiptFateOf({ ...base5, receipt: null }) === null, 'fate: none for a user draft, a withdrawal, or no receipt');
}

// ── the REAL engine: withdraw ──
{
  const W = mkEngine({ name: 'withdraw', live: [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }, { cid: 'agent-2', name: 'Sibling', groups: ['g1'] }] });
  const { eng, events, delivered, stash, userTodos } = W;
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'a draft I will take back' });
  const ptr = eng.store.index.snapshot().conversations[KEY].pendingTodoId;
  ok(p.ok && p.proposal.state === 'awaiting-approval' && ptr && userTodos.get(ptr).status === 'open', 'FIXTURE: an agent proposal awaits approval, its For-you pointer open');
  const SIB = { kind: 'agent', id: 'agent-2', name: 'Sibling', groups: ['g1'], msgLevelFor: () => 'none' };
  const sib = await eng.withdrawProposal({ proposalId: p.proposal.id, by: SIB });
  ok(!sib.ok && sib.code === 'not-yours' && /drafted by Worker/.test(sib.error) && eng.store.outbox.snapshot().proposals[p.proposal.id].state === 'awaiting-approval', 'a Task-Group SIBLING (same group g1) is refused `not-yours` by name — the proposal still awaits', JSON.stringify(sib));
  const out = await eng.withdrawProposal({ proposalId: p.proposal.id, by: { kind: 'agent', id: 'agent-9', groups: [] } });
  ok(!out.ok && out.code === 'not-found', 'a caller that cannot see the conversation and shares no group gets the uniform not-found (no existence oracle)', JSON.stringify(out));
  const usr = await eng.withdrawProposal({ proposalId: p.proposal.id, by: { kind: 'user' } });
  ok(!usr.ok && usr.code === 'not-yours', 'the user does not withdraw (the user rejects) — not-yours');
  const e0 = events.length, d0 = delivered.length, s0 = stash.length;
  const w = await eng.withdrawProposal({ proposalId: p.proposal.id, why: 'wrong thread', by: AGENT });
  const q = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(w.ok && q.state === 'withdrawn' && q.reason === 'withdrawn by the agent: wrong thread' && q.withdrawal.why === 'wrong thread' && q.withdrawal.by.id === 'agent-1' && q.history.slice(-1)[0].by === 'agent', 'its OWN drafter withdraws it: state withdrawn by actor `agent`, the reason and the why recorded', JSON.stringify(w));
  ok(q.receipt && q.receipt.status === 'withdrawn' && delivered.length === d0 && stash.length === s0, 'the receipt is RECORDED (status shows it) and never handed back to the agent that did it');
  ok(userTodos.get(ptr).status === 'done' && userTodos.get(ptr).resolvedBy === 'system' && eng.store.index.snapshot().conversations[KEY].pendingTodoId === null, 'the For-you pointer is RETRACTED by the same producer (system) and the row forgets it');
  const bc = events.slice(e0).filter((m) => m.type === 'channel-outbox-updated');
  ok(bc.length === 1 && bc[0].changed.includes(p.proposal.id) && bc[0].outbox.proposals.find((x) => x.id === p.proposal.id).state === 'withdrawn', `ONE channel-outbox-updated broadcast carries it (${bc.length})`);
  ok(eng.store.auditTail().some((l) => l.kind === 'outbox' && l.op === 'withdraw' && l.proposalId === p.proposal.id && l.why === 'wrong thread' && l.by === 'agent-1'), 'the audit holds a `withdraw` line with the why and who');
  const again = await eng.withdrawProposal({ proposalId: p.proposal.id, by: AGENT });
  ok(!again.ok && again.code === 'not-withdrawable' && /already withdrawn/.test(again.error), 'withdrawing it again ⇒ not-withdrawable (already withdrawn)');
  const ap = await eng.approve(p.proposal.id, {});
  const rj = await eng.reject(p.proposal.id, {});
  ok(!ap.ok && ap.code === 'bad-state' && ap.state === 'withdrawn' && !rj.ok && rj.code === 'bad-state' && rj.state === 'withdrawn', 'the user\'s Approve / Reject on a withdrawn card is refused bad-state and NAMES the state (the card says "the agent withdrew this proposal")');
  // decided / in-flight / lost: never withdrawable
  const sentP = await eng.propose(AGENT, A, C, { text: 'will be sent' });
  await eng.approve(sentP.proposal.id, {});
  ok((await eng.withdrawProposal({ proposalId: sentP.proposal.id, by: AGENT })).code === 'not-withdrawable', 'a SENT proposal ⇒ not-withdrawable');
  const sendingP = await eng.propose(AGENT, A, C, { text: 'in flight' });
  await eng.store.outbox.update((ob) => { ob.proposals[sendingP.proposal.id].state = 'sending'; });
  const sw = await eng.withdrawProposal({ proposalId: sendingP.proposal.id, by: AGENT });
  ok(!sw.ok && sw.code === 'not-withdrawable' && /being sent right now/.test(sw.error), 'a proposal being SENT ⇒ not-withdrawable (the request may be leaving)');
  await eng.store.outbox.update((ob) => { ob.proposals[sendingP.proposal.id].state = 'unknown'; });
  ok((await eng.withdrawProposal({ proposalId: sendingP.proposal.id, by: AGENT })).code === 'not-withdrawable', 'a proposal of UNKNOWN outcome ⇒ not-withdrawable (the user\'s to check)');
  eng.stop();
}

// ── the REAL engine: replace = withdraw + a new proposal, ATOMIC ──
async function replaceLegs(ENGmod, name) {
  const W = mkEngine({ name, engine: ENGmod });
  const { eng, userTodos } = W;
  await prime(eng);
  const old = await eng.propose(AGENT, A, C, { text: 'first try' });
  const r = await eng.replaceProposal({ replaces: old.proposal.id, by: AGENT, make: () => eng.propose(AGENT, A, C, { text: 'a better reply' }) });
  const qo = eng.store.outbox.snapshot().proposals[old.proposal.id];
  const qn = r.proposal ? eng.store.outbox.snapshot().proposals[r.proposal.id] : null;
  const open = userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels');
  const res = { accepted: { ok: r.ok, newState: qn && qn.state, replaces: qn && qn.replaces, oldState: qo.state, replacedBy: qo.replacedBy, replaced: !!r.replaced, open: open.length, detail: open[0] ? open[0].detail : '' } };
  // a refused new proposal (an empty text) leaves the old one standing and creates nothing
  const old2 = await eng.propose(AGENT, A, C, { text: 'still the best' });
  const n0 = Object.keys(eng.store.outbox.snapshot().proposals).length;
  const r2 = await eng.replaceProposal({ replaces: old2.proposal.id, by: AGENT, make: () => eng.propose(AGENT, A, C, { text: '   ' }) });
  res.refused = { ok: r2.ok, code: r2.code, oldState: eng.store.outbox.snapshot().proposals[old2.proposal.id].state, created: Object.keys(eng.store.outbox.snapshot().proposals).length - n0 };
  // somebody else's / a sent one: refused BEFORE anything is made
  let made = 0;
  const r3 = await eng.replaceProposal({ replaces: old2.proposal.id, by: { kind: 'agent', id: 'agent-2', groups: ['g1'] }, make: () => { made++; return eng.propose(AGENT, A, C, { text: 'x' }); } });
  const sentP = await eng.propose(AGENT, A, C, { text: 'sent one' });
  await eng.approve(sentP.proposal.id, {});
  const r4 = await eng.replaceProposal({ replaces: sentP.proposal.id, by: AGENT, make: () => { made++; return eng.propose(AGENT, A, C, { text: 'x' }); } });
  res.guards = { siblingCode: r3.code, sentCode: r4.code, made };
  // THE HOLD: the user's Approve of the old one, fired while the replacement is being made, waits and finds it withdrawn — never sent
  const old3 = await eng.propose(AGENT, A, C, { text: 'racing the owner' });
  let approveP = null;
  const r5 = await eng.replaceProposal({ replaces: old3.proposal.id, by: AGENT, make: async () => { approveP = eng.approve(old3.proposal.id, {}); await new Promise((z) => setTimeout(z, 30)); return eng.propose(AGENT, A, C, { text: 'the replacement' }); } });
  const ap = await approveP;
  res.hold = { replaceOk: r5.ok, approveCode: ap.code, approveState: ap.state, oldState: eng.store.outbox.snapshot().proposals[old3.proposal.id].state };
  eng.stop();
  return res;
}
{
  const rl = await replaceLegs(ENG, 'replace');
  ok(rl.accepted.ok && rl.accepted.newState === 'awaiting-approval' && rl.accepted.replaces && rl.accepted.oldState === 'withdrawn' && rl.accepted.replacedBy && rl.accepted.replaced, 'REPLACE: the new proposal awaits (recording `replaces`), the old one is WITHDRAWN (recording `replacedBy`)', JSON.stringify(rl.accepted));
  ok(rl.accepted.open === 1 && /1 proposal awaiting/.test(rl.accepted.detail) && /a better reply/.test(rl.accepted.detail), 'the conversation keeps ONE For-you pointer, now naming the new text', rl.accepted.detail);
  ok(!rl.refused.ok && rl.refused.code === 'bad-proposal' && rl.refused.oldState === 'awaiting-approval' && rl.refused.created === 0, 'ATOMIC: a new proposal the policy REFUSES (bad-proposal) leaves the old one standing and creates nothing', JSON.stringify(rl.refused));
  ok(rl.guards.siblingCode === 'not-yours' && rl.guards.sentCode === 'not-withdrawable' && rl.guards.made === 0, 'replacing somebody else\'s (not-yours) or a sent one (not-withdrawable) is refused BEFORE anything is made', JSON.stringify(rl.guards));
  ok(rl.hold.replaceOk && rl.hold.approveCode === 'bad-state' && rl.hold.approveState === 'withdrawn' && rl.hold.oldState === 'withdrawn', 'THE HOLD: the owner\'s Approve fired mid-replace waits for it and finds the old one withdrawn — it is never sent', JSON.stringify(rl.hold));
  const esrc = engineSource(REPO);
  const MK = '      const r = await make();';
  const EXP = '    propose, approve: (id, o) => onProposal(id, () => approve(id, o)), reject: (id, o) => onProposal(id, () => reject(id, o)), outboxView, expireSweep, pointerSync, receipt,';
  ok(esrc.split(MK).length === 2 && esrc.split(EXP).length === 2, 'the make line and the held-decision export are present once (the controls patch exactly them)');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const ME = mutantCopies('chan-outbox-replace', REPO);
  const early = ME.load('src/server/channels-engine.js', editAnchor(esrc, MK, "      await withdrawNow(oldId, by, why || 'replaced', { notifyNow: false });\n" + MK, "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'withdraw-first');
  const rc1 = await replaceLegs(early, 'replace-ctl-early');
  ok(rc1.refused.oldState === 'withdrawn', `CONTROL: a copy that withdraws BEFORE the new proposal is accepted loses the old one when the new one is refused (${rc1.refused.oldState}) — the atomic leg would go red`);
  const unheld = ME.load('src/server/channels-engine.js', editAnchor(esrc, EXP, '    propose, approve, reject, outboxView, expireSweep, pointerSync, receipt,', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'unheld');
  const rc2 = await replaceLegs(unheld, 'replace-ctl-unheld');
  ok(rc2.hold.oldState === 'sent', `CONTROL: a copy whose Approve does not wait for the replace SENDS the old one beside its replacement (${rc2.hold.oldState}) — the hold leg would go red`);
}

// ── the REAL engine: the receipt's DIFF, the decider's delivery choice, the FATE ──
async function receiptLegs(ENGmod, name) {
  const W = mkEngine({ name, engine: ENGmod });
  const { eng, events, delivered, stash, deliver } = W;
  await prime(eng);
  const p = await eng.propose(AGENT, A, C, { text: 'Hi team,\nthe deploy is done.\nthanks' });
  await eng.approve(p.proposal.id, { text: 'Hi team,\nthe deploy is finished — no action needed.\nthanks' });
  const rc = stash.find((x) => x.env.ref === p.proposal.id);
  const v0 = eng.outboxView({ key: KEY }).proposals.find((x) => x.id === p.proposal.id);
  const fate0 = P.receiptFateOf(v0);
  const e0 = events.length;
  deliver.drain('agent-1');
  await outboxPast(eng, 'the drained receipt\'s fate');   // r401: an order, never a 30 ms timer
  const v1 = eng.outboxView({ key: KEY }).proposals.find((x) => x.id === p.proposal.id);
  const bc = events.slice(e0).filter((m) => m.type === 'channel-outbox-updated');
  const out = { text: rc ? rc.env.text : '', noWake: delivered.filter((d) => d.opts.spendReason === 'channel-receipt').every((d) => d.opts.noWake === true), fate0: fate0 && fate0.kind, fate1: P.receiptFateOf(v1) && P.receiptFateOf(v1).kind, drainedAt: v1.receiptDrainedAt, bc: bc.length };
  eng.stop();
  return out;
}
{
  const rr = await receiptLegs(ENG, 'receipt-diff');
  ok(/what the user changed \(- you proposed \/ \+ the user sent\):\n  Hi team,\n- the deploy is done\.\n\+ the deploy is finished — no action needed\.\n  thanks\nUse this as guidance for the next draft\./.test(rr.text), 'an EDITED approval: the stashed receipt carries the line DIFF (proposed vs sent) and the guidance sentence', rr.text);
  ok(rr.noWake, 'a plain Approve (no choice ⇒ next-turn) rides the next message — no billed wake by default');
  ok(rr.fate0 === 'waiting' && rr.fate1 === 'handed' && rr.drainedAt && rr.bc === 1, `THE FATE: "waiting" until the agent's next message drains the stash, then "handed" (one broadcast) — ${rr.fate0} → ${rr.fate1}`, JSON.stringify(rr));
  const esrc = engineSource(REPO);
  const LINE = '    const text = P.renderReceiptBlock(rc, { adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, title: rTitle, text: p.text, proposed: p.originalText, withheld });';
  ok(esrc.split(LINE).length === 2, 'the receipt-block line is present once (the control patches exactly it)');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const ME = mutantCopies('chan-outbox-receipt', REPO);
  const noDiff = ME.load('src/server/channels-engine.js', editAnchor(esrc, LINE, LINE.replace(', proposed: p.originalText', ''), "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'no-proposed');
  const rc = await receiptLegs(noDiff, 'receipt-diff-ctl');
  ok(!/what the user changed/.test(rc.text) && /final text:/.test(rc.text), 'CONTROL: an engine that does not hand the proposal\'s own words to the block sends only the final text — the diff leg would go red');
}

// ── VERIFY (2026-09-27): the sweep re-asks the hold AT APPLY TIME; a stashed receipt whose entry is gone was
// handed; a failed send the decider asked to hear NOW still wakes once; the concurrency counts ──
console.log('§5v verify: the TTL sweep vs a replace in flight; the legacy fate; one billed turn per proposal');
// B-1217 member 17 (主开发 r502): a racing act waits for the call's ARRIVAL at its hold — bounded, it says what never came (null)
// ci-346-reds: the collect window's legs — a clock that stands still from its first read (the send takes no engine time:
// the window is open when the receipt is ready, whatever the box's load), and the fallback timer's delivery waited for
// (bounded at 5 s), never a fixed sleep
const heldClock = () => { const t = Date.now(); return () => t; };
/** r401: A WAIT FOR WHAT HAPPENED — `cond` polled every 5 ms, bounded, and RED BY NAME when it never happens. → {ok, ms, what} */
/** …the same for a promise (it settles, or the bound is red by name). */
async function settledP(what, pr, ms = 5000) {
  const t0 = Date.now(); let tm = null;
  const won = await Promise.race([pr.then(() => true, () => true), new Promise((z) => { tm = setTimeout(() => z(false), ms); })]);
  clearTimeout(tm);
  if (!won) ok(false, `waited ${ms} ms for ${what} — it never happened`);
  return { ok: won, ms: Date.now() - t0, what };
}
/** r401: THE OUTBOX'S WRITE CHAIN PAST WHAT WAS ASKED — every handler a leg fires (a fall, a drain, the boot's reconcile)
 *  queues its outbox write before its first await: a no-op update queued after it resolves once that write landed and
 *  the broadcast / audit / For-you item it is followed by were made. An ORDER, never a timer (bounded, red by name). */
function outboxPast(eng, what) { return settledP(`the outbox's write chain past ${what}`, eng.store.outbox.update(() => {})); }   // hoisted: an earlier leg asks it
const untilDelivered = async (delivered, ms = 5000) => { const t0 = Date.now(); while (!delivered.length && Date.now() - t0 < ms) await sleep(20); await sleep(40); };
/** THE WINDOW: two due proposals; the sweep is busy with the FIRST (its receipt parked in the ladder) when a
 *  replace of the SECOND passes its check and makes the new draft; the sweep's write on the second then lands
 *  BETWEEN the replace's check and its withdrawal unless the hold is asked at apply time.
 *  r401: THE RACE IS PLACED, never timed (a control went green under the test machines' load — its mutant did not lose
 *  the race that time): the sweep's FIRST receipt is held at the ladder (deliver.gate) until the replace HOLDS the second
 *  — its make() opens the gate and waits for the sweep to END before it proposes — so the sweep's write on the second
 *  lands inside the replace's window whatever the load; each wait bounded and red by name. */
async function sweepWindowLeg(ENGmod, name) {
  const W = mkEngine({ name, engine: ENGmod });
  const { eng, deliver, delivered } = W;
  await prime(eng);
  // the sweep walks NEWEST first: the one to be replaced is the OLDER (handled second), the other the newer
  const d2 = await eng.propose(AGENT, A, C, { text: 'due two — to be replaced' });
  W.advance(10);
  const d1 = await eng.propose(AGENT, A, C, { text: 'due one — the newer, swept first' });
  W.advance(25 * 3600 * 1000);
  const n0 = Object.keys(eng.store.outbox.snapshot().proposals).length, r0 = delivered.length;
  let open = null;
  deliver.gate = { wait: new Promise((z) => { open = z; }), match: (text, o) => !!(o && o.spendReason === 'channel-receipt' && String(text).includes(d1.proposal.id)) };   // d1's expiry receipt, by name
  const sweep = eng.expireSweep();   // its due list (both) is taken in this call, before any hold
  let sweepEnd = 'pending'; sweep.then(() => { sweepEnd = 'ended'; }, (e) => { sweepEnd = `threw: ${(e && e.message) || e}`; });
  const atGate = await settled('the sweep\'s first receipt to reach the ladder', () => deliver.atGate === 1);
  let inWindow = null;
  const r = await eng.replaceProposal({ replaces: d2.proposal.id, by: AGENT, make: async () => {
    open();   // the replace holds the second now: the sweep goes on to it
    inWindow = await settledP('the sweep to end inside the replace\'s window', sweep);
    return eng.propose(AGENT, A, C, { text: 'fresh' });
  } });
  if (!inWindow || !inWindow.ok) await settledP('the sweep to end', sweep);
  const out = { d1: eng.store.outbox.snapshot().proposals[d1.proposal.id].state, d2: eng.store.outbox.snapshot().proposals[d2.proposal.id].state, ok: r.ok, replaced: !!r.replaced, code: r.replaceCode || null, placed: !!(atGate.ok && inWindow && inWindow.ok && sweepEnd === 'ended'), gated: deliver.gated, sweepEnd, made: Object.keys(eng.store.outbox.snapshot().proposals).length - n0, receipts: delivered.slice(r0).filter((d) => d.opts.spendReason === 'channel-receipt').length };
  eng.stop();
  return out;
}
{
  const sw = await sweepWindowLeg(ENG, 'sweep-window');
  ok(sw.placed && sw.d1 === 'expired' && sw.d2 === 'withdrawn' && sw.ok && sw.replaced && sw.made === 1 && sw.receipts === 1, `THE SWEEP RE-ASKS THE HOLD AT APPLY TIME (the race placed: ${sw.placed} — held at «${sw.gated}», the sweep ${sw.sweepEnd} inside the replace's window): the due list taken before the hold, the first expires, the HELD second ends withdrawn (${sw.d2}), ONE new draft, ONE receipt (the first's expiry) — never an "expired" receipt for a draft the agent just replaced`, JSON.stringify(sw));
  const esrc = engineSource(REPO);
  const GUARD = "      if (typeof unless === 'function' && unless(p)) { verdict = { ok: false, why: 'held: a replace of this proposal is in flight', held: true }; return; }";
  ok(esrc.split(GUARD).length === 2, 'the apply-time guard line is present once (the control removes exactly it)');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MV = mutantCopies('chan-outbox-verify', REPO);
  const unguarded = MV.load('src/server/channels-engine.js', editAnchor(esrc, GUARD, '', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'sweep-unguarded');
  const sc = await sweepWindowLeg(unguarded, 'sweep-window-ctl');
  ok(sc.placed && sc.d2 === 'expired' && sc.made === 1 && sc.receipts === 2, `CONTROL: a copy that asks the hold only before the write lets the sweep land between the replace's check and its withdrawal — the new draft made, the old one EXPIRED under it, two receipts (the race placed: ${sc.placed} — held at «${sc.gated}»; d2 ${sc.d2}, made ${sc.made}, ${sc.receipts} receipts) — the leg would go red`);
  // THE LEGACY FATE: a receipt stashed before the stash carried a ref (the owner's three of 2026-09-27) has no
  // drained event; at boot, one whose entry is gone from its drafter's stash is read as handed with an earlier message
  async function legacyLeg(ENGmod2, name) {
    const W = mkEngine({ name, engine: ENGmod2 });
    const { eng, deliver } = W;
    await prime(eng);
    const legacy = () => ({ at: Date.now() - 3600e3, ok: false, lane: 'stash', stashed: true, refused: 'no-wake', woke: false, why: 'no free lane for this conversation — a delivery now would open a billed turn' });
    const gone = await eng.propose(AGENT, A, C, { text: 'drained long ago' });
    const kept = await eng.propose(AGENT, A, C, { text: 'still waiting' });
    await eng.approve(gone.proposal.id, {}); await eng.approve(kept.proposal.id, {});
    // both entries lose their ref (the pre-lane shape); the first's entry is gone (drained before anybody listened)
    deliver.forget('agent-1');
    deliver.stashFor('agent-1', { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: `Channel receipt — R4 mail · ops\nproposal ${kept.proposal.id}: SENT` });
    await eng.store.outbox.update((ob) => { for (const id of [gone.proposal.id, kept.proposal.id]) { const x = ob.proposals[id]; x.receiptDelivery = legacy(); x.receiptDrainedAt = null; } });
    const e0 = W.events.length;
    eng.start();
    await outboxPast(eng, 'the boot\'s receipt-fate reconcile');   // r401: it queues its write in start()'s own turn — an order, never a 30 ms timer
    const fg = P.receiptFateOf(eng.store.outbox.snapshot().proposals[gone.proposal.id]), fk = P.receiptFateOf(eng.store.outbox.snapshot().proposals[kept.proposal.id]);
    const bc = W.events.slice(e0).filter((m) => m.type === 'channel-outbox-updated');
    eng.stop();
    return { gone: fg.kind, goneAt: fg.at, goneText: P.receiptFateText(fg), kept: fk.kind, bc: bc.length, changed: bc.length ? bc[0].changed : [] };
  }
  const lg = await legacyLeg(ENG, 'legacy-fate');
  ok(lg.gone === 'handed' && lg.goneAt === null && lg.goneText === 'Handed to Worker with an earlier message' && lg.kept === 'waiting' && lg.bc === 1 && lg.changed.length === 1, `THE LEGACY FATE at boot: the receipt whose stash entry is gone reads "${lg.goneText}" (no time — nobody recorded it); the one still in the stash (matched by the id its text names) keeps "waiting"; ONE broadcast`, JSON.stringify(lg));
  const RECON = "    if (!deliver || typeof deliver.stashPeek !== 'function' || engineCtx.stopped) return [];";   // lane dc-channels-seams: the engine's `stopped` read through its context
  ok(esrc.split(RECON).length === 2, 'the reconcile\'s entry line is present once (the control patches exactly it)');
  const norecon = MV.load('src/server/channels-engine.js', editAnchor(esrc, RECON, '    return [];', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'no-reconcile');
  const lc = await legacyLeg(norecon, 'legacy-fate-ctl');
  ok(lc.gone === 'waiting', `CONTROL: an engine without the boot reconcile keeps saying "Waiting for Worker's next message" for a receipt the agent read an hour ago (${lc.gone}) — the leg would go red`);
}
// lane paced-wake-retry: A DECIDER'S WAKE THE PACE HELD IS OWED (sign-in off): the receipt waits in the stash (its gate, its
// clear, the next prompt's drain), the park owes the ONE wake for the window's end — never «it hears with its next message»
{
  const W = mkEngine({ name: 'paced-receipt', deliverOk: false });
  const { eng, deliver } = W;
  await prime(eng);
  const parks = [];
  deliver.parkOwedWake = (cid, o) => { parks.push({ cid, ...o }); return { parked: true, id: 'rt-1', retryAt: 0, retryInMs: o.retryInMs }; };
  const mayWake = Object.assign(() => ({ reason: 'paced — sent in 25 s (the rule)', rule: 'the rule', why: 'pair', retryInMs: 25000 }), { sender: 'user', refund() { } });
  const p = await eng.propose(AGENT, A, C, { text: 'paced decision' });
  await eng.approve(p.proposal.id, { deliver: 'wake-now', mayWake });
  await sleep(10);
  const stored = eng.store.outbox.snapshot().proposals[p.proposal.id];
  ok(stored.receiptChoice === 'next-turn' && stored.receiptChoicePaced === 'the rule' && stored.receiptPacedMs === 25000 && stored.receiptPacedBy === 'user', 'a floored wake-now: the proposal records the rule (never a promise), the wait, and whose ledger re-judges it', JSON.stringify(stored.receiptChoicePaced));
  ok(parks.length === 1 && parks[0].producer === 'stash-wake' && parks[0].key === p.proposal.id && parks[0].meta.ref === p.proposal.id && parks[0].sender === 'user' && parks[0].spendReason === 'channel-receipt' && parks[0].retryInMs > 0 && parks[0].retryInMs <= 25000, 'THE LAW: the receipt\'s wake is parked for the window\'s end, keyed by the stash entry that holds the words', JSON.stringify(parks));
  ok(stored.receiptDelivery && stored.receiptDelivery.paced && stored.receiptDelivery.paced.retryInMs === parks[0].retryInMs, 'D5: the answer carries the park as a FACT (receiptDelivery.paced)', JSON.stringify(stored.receiptDelivery));
  const parkedWords = P.receiptPacedText(stored, { t: (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n])) });
  ok(/the wake pace sends it in \d+ s/.test(parkedWords) && !/next message/.test(parkedWords), 'D5: with the fact the toast says «sends it in N s»', parkedWords);
  ok(/the wake pace holds this/i.test(P.receiptFateText(P.receiptFateOf(stored), { t: (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n])) })), 'D5: …and the card says the wake is held, not «next message»', JSON.stringify(P.receiptFateOf(stored)));
  // D5's second leg: a refusal nothing parked (the no-pacer fallback names no wait)
  const noPacer = Object.assign(() => ({ reason: 'the wake pace is not available on this instance', why: 'no-pacer' }), { refund() { } });
  const p3 = await eng.propose(AGENT, A, C, { text: 'nothing parks this one' });
  await eng.approve(p3.proposal.id, { deliver: 'wake-now', mayWake: noPacer });
  await sleep(10);
  const s3 = eng.store.outbox.snapshot().proposals[p3.proposal.id];
  const unparkedWords = P.receiptPacedText(s3, { t: (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n])) });
  ok(parks.length === 1 && !(s3.receiptDelivery && s3.receiptDelivery.paced), 'D5: no wait named ⇒ nothing parked, no fact on the answer', JSON.stringify(s3.receiptDelivery));
  ok(/not woken \(paced: the wake pace is not available on this instance\)/.test(unparkedWords) && /next message/.test(unparkedWords) && !/sends it in/.test(unparkedWords), 'D5: …and the toast keeps the old truth with its why', unparkedWords);
  const p2 = await eng.propose(AGENT, A, C, { text: 'not floored' });
  await eng.approve(p2.proposal.id, { deliver: 'next-turn' });
  await sleep(10);
  ok(parks.length === 1, 'CONTROL: a next-turn choice owes no wake');
  // D6: the wake falls — the card's fate changes, an audit row, ONE For-you item keyed by the proposal; a spend refusal's item is the guard's
  // r401: a fall is fired once the receipt is delivered and waited for until it is BOOKED (the card's fate) — never a fixed sleep
  const propOf = (id) => eng.store.outbox.snapshot().proposals[id] || {};
  const fellOne = async (id, cid, extra) => {
    deliver.retryEvent('fell', cid, { producer: 'stash-wake', meta: { ref: id } }, extra);
    return outboxPast(eng, `${id}'s fall (its audit row and For-you item follow the write)`);
  };
  deliver.retryEvent('fell', C, { producer: 'jobs', meta: { ref: p.proposal.id } }, { kind: 'not-running' });
  await outboxPast(eng, 'another producer\'s fall');
  ok(!eng.store.outbox.snapshot().proposals[p.proposal.id].receiptDelivery.wakeFell, 'D6: another producer\'s fall moves nothing here');
  await fellOne(p.proposal.id, C, { kind: 'not-reachable', why: 'paced-out', reason: 'paced-out — the agent did not accept the wake' });
  const fell = eng.store.outbox.snapshot().proposals[p.proposal.id];
  const fate = P.receiptFateOf(fell);
  ok(fate.kind === 'waiting' && fate.wakeFell === 'paced-out' && !fate.wakePaced && !fell.receiptDelivery.paced, 'D6: the card\'s fate changes: waiting, the wake fell (paced-out)', JSON.stringify(fate));
  ok(/could not land within its hour/.test(P.receiptFateText(fate, { t: (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n])) })), 'D6: …in its own words');
  ok(eng.store.auditTail({ limit: 200 }).some((a) => a.kind === 'outbox' && a.op === 'receipt-wake-fell' && a.proposalId === p.proposal.id && a.why === 'paced-out'), 'D6: …an audit row');
  const items = W.userTodos.snapshot().open.filter((i) => i && /was not woken about/.test(String(i.text)));
  ok(items.length === 1 && /could not land within its hour/.test(items[0].text) && items[0].action && items[0].action.key === `outbox:${p.proposal.id}`, 'D6: …and the owner is told, ONE For-you item keyed by the proposal', JSON.stringify(items.map((i) => i.text)));
  // a spend refusal's item is the guard's: the card still changes, no second item here
  const p5 = await eng.propose(AGENT, A, C, { text: 'spend fall' });
  await eng.approve(p5.proposal.id, { deliver: 'wake-now', mayWake });
  await sleep(10);
  await fellOne(p5.proposal.id, C, { kind: 'spend-cap', why: 'hour-cap', reason: 'spend budget: hour cap' });
  ok(P.receiptFateOf(eng.store.outbox.snapshot().proposals[p5.proposal.id]).wakeFell === 'spend-cap' && W.userTodos.snapshot().open.filter((i) => i && /was not woken about/.test(String(i.text))).length === 1, 'D6: a spend refusal changes the card, and the For-you item stays the guard\'s');
  // P4: a frame that may have landed is said as that, and the item closes when the agent reads the receipt
  const p6 = await eng.propose(AGENT, A, C, { text: 'on the wire when the hub died' });
  await eng.approve(p6.proposal.id, { deliver: 'wake-now', mayWake });
  await fellOne(p6.proposal.id, C, { kind: 'not-reachable', maybeDelivered: true, reason: 'it was being posted when the previous server stopped' });
  const filed6 = await settled('the may-have-landed fall\'s For-you item to be kept on the proposal', () => !!propOf(p6.proposal.id).receiptWakeTodoId);
  const f6 = eng.store.outbox.snapshot().proposals[p6.proposal.id];
  const tt = (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n]));
  ok(P.receiptFateOf(f6).wakeFell === 'may-have-landed' && /may have reached it/.test(P.receiptFateText(P.receiptFateOf(f6), { t: tt })) && !/did not reach/.test(P.receiptFateText(P.receiptFateOf(f6), { t: tt })), 'P4: a may-have-landed fall: the card says it may have reached it, never «did not reach»', JSON.stringify(P.receiptFateOf(f6)));
  const it6 = W.userTodos.snapshot().open.find((i) => i && /may have been woken about/.test(String(i.text)));
  ok(it6 && /waking it again may start a second turn/.test(String(it6.detail)) && !/was not woken/.test(String(it6.text)), 'P4: …the For-you item says «may have been woken», and warns off a second wake by hand', JSON.stringify(it6 && it6.text));
  ok(f6.receiptWakeTodoId === (it6 && it6.id), 'P4: …its id is kept on the proposal', f6.receiptWakeTodoId);
  deliver.drain('agent-1');
  const closed6 = await settled('the receipt\'s read to close its For-you item', () => !!it6 && W.userTodos.get(it6.id).status === 'done' && !propOf(p6.proposal.id).receiptWakeTodoId);
  ok(closed6.ok && !!it6 && W.userTodos.get(it6.id).status === 'done' && !propOf(p6.proposal.id).receiptWakeTodoId, `P4: …and it closes when the agent reads the receipt (item ${it6 ? W.userTodos.get(it6.id).status : 'never filed'}, the proposal's item id ${propOf(p6.proposal.id).receiptWakeTodoId || 'cleared'}; filed in ${filed6.ms} ms, closed in ${closed6.ms} ms of the 5000 ms bound)`, it6 && W.userTodos.get(it6.id).status);
  // P5: a HELD send: the words match what will happen
  const heldP = { state: 'sending', receiptChoicePaced: 'the rule', receiptPacedMs: 25000, failure: { code: 'rate-limited' }, held: { until: 1794000000000, vendor: 'lark' } };
  ok(P.outcomeOf(heldP).kind === 'held', 'P5: (the fixture is a held send)', JSON.stringify(P.outcomeOf(heldP)));
  ok(/the wake follows the send/.test(P.receiptPacedText(heldP, { t: tt })) && !/next message/.test(P.receiptPacedText(heldP, { t: tt })), 'P5: on a held send the toast says the wake follows the send, never «its next message»', P.receiptPacedText(heldP, { t: tt }));
  ok(/next message/.test(P.receiptPacedText({ ...heldP, receiptPacedMs: 0 }, { t: tt })), 'P5: CONTROL: a pacer that named no wait keeps the old truth on a held send');
  eng.stop();
}
// ONE BILLED TURN PER PROPOSAL, whatever the decider does (the verify's counts, pinned)
{
  const W = mkEngine({ name: 'one-bill', deliverOk: false });
  const { eng, deliver, delivered } = W;
  deliver.wakeOk = true;
  await prime(eng);
  const billed = () => delivered.filter((d) => (d.opts.spendReason === 'outbox-wake-now' || d.opts.spendReason === 'channel-receipt') && !d.opts.noWake).length;   // lane owner-press-attended: a WAKE is billed — the attended reason with the decider's press (r2), the gated one without
  const p1 = await eng.propose(AGENT, A, C, { text: 'double click' });
  const [a1, a2] = await Promise.all([eng.approve(p1.proposal.id, { deliver: 'wake-now' }), eng.approve(p1.proposal.id, { deliver: 'wake-now' })]);
  const a3 = await eng.approve(p1.proposal.id, { deliver: 'wake-now' });
  ok([a1, a2].filter((r) => r.ok).length === 1 && [a1, a2, a3].filter((r) => r.code === 'bad-state' && r.state === 'sent').length === 2 && billed() === 1, `a double click / two tabs / a retry after it landed: ONE approve wins, the others bad-state(sent), ONE billed turn (${billed()})`);
  const p2 = await eng.propose(AGENT, A, C, { text: 'race' });
  const [r1, r2] = await Promise.all([eng.reject(p2.proposal.id, { reason: 'no', deliver: 'wake-now' }), eng.approve(p2.proposal.id, { deliver: 'wake-now' })]);
  ok([r1, r2].filter((r) => r.ok).length === 1 && billed() === 2, 'reject ‖ approve, both wake-now: one wins, ONE billed turn');
  // lane owner-press-attended r2: the decider's wake is ATTENDED only with the PRESS its door minted (src/write-origin.js
  // pressOf — the owner routes hand it down); the same wake-now approve with no press is the gated channel-receipt wake
  const PRESS = require(path.join(REPO, 'src/write-origin.js')).pressOf({ headers: { 'sec-fetch-site': 'same-origin' } });
  const d0 = delivered.length;
  const p5 = await eng.propose(AGENT, A, C, { text: 'pressed' });
  await eng.approve(p5.proposal.id, { deliver: 'wake-now', pressed: PRESS });
  const p6 = await eng.propose(AGENT, A, C, { text: 'not pressed' });
  await eng.approve(p6.proposal.id, { deliver: 'wake-now' });
  const woke = delivered.slice(d0).filter((d) => !d.opts.noWake).map((d) => d.opts.spendReason);
  ok(JSON.stringify(woke) === JSON.stringify(['outbox-wake-now', 'channel-receipt']), 'r2: a wake-now approve WITH the door\'s press wakes under outbox-wake-now (attended); the same approve with NO press under channel-receipt (gated, counted)', JSON.stringify(woke));
  // a vendor-refused send the decider asked to hear NOW: still one wake, with the FAILED receipt (a failure is worth telling)
  eng.stop();
}
{
  // the vendor REFUSES the send: a registry whose adapter answers a typed refusal
  const reg = CH.createChannelRegistry();
  const mkA = reg.create;
  reg.create = (kind, record, deps) => { const a = mkA(kind, record, deps); if (a && typeof a.send === 'function') a.send = async () => ({ ok: false, code: 'refused', retryable: false, detail: { reason: 'mailbox full' } }); return a; };
  const W = mkEngine({ name: 'one-bill-failed', registry: reg });
  const { eng, deliver, delivered } = W;
  deliver.wakeOk = true;
  await prime(eng);
  const billed = () => delivered.filter((d) => (d.opts.spendReason === 'outbox-wake-now' || d.opts.spendReason === 'channel-receipt') && !d.opts.noWake).length;   // lane owner-press-attended: a WAKE is billed — the attended reason with the decider's press (r2), the gated one without
  const p3 = await eng.propose(AGENT, A, C, { text: 'vendor says no' });
  const a4 = await eng.approve(p3.proposal.id, { deliver: 'wake-now' });
  const q3 = eng.store.outbox.snapshot().proposals[p3.proposal.id];
  ok(!a4.ok && q3.state === 'failed' && q3.receipt && q3.receipt.status === 'failed' && billed() === 1 && q3.receiptWake && q3.receiptWake.ok === true && /mailbox full/.test(delivered.slice(-1)[0].text), `a wake-now approve whose send the vendor REFUSED wakes ONCE with the FAILED receipt (the decider asked to hear now; a failure is worth telling) — pinned as designed (state ${q3.state}, billed ${billed()})`, JSON.stringify({ a4: a4.code, q3: q3.reason }));
  ok((await eng.approve(p3.proposal.id, { deliver: 'wake-now' })).code === 'bad-state' && billed() === 1, '…and a second approve of it is bad-state, still ONE billed');
  eng.stop();
}


// ── VERIFY r2 (2026-09-27): the `unless` class generally, the reconcile's truth, the stash cap, the identity form ──
console.log('§6 lane channel-threads: the reaction proposal, the reaction policy row, the thread reply');
{
  const SET = { keys: [{ key: 'thumbsup', glyph: '👍', label: 'thumbs up' }, { key: 'tada', glyph: '🎉', label: 'party' }] };
  const v = P.validateReaction({ msg: 'm1', key: 'thumbsup' }, SET);
  ok(v.ok && v.proposal.kind === 'reaction' && v.proposal.op === 'add' && v.proposal.glyph === '👍' && !('text' in v.proposal), 'validateReaction: {kind:reaction, msg, key, op, glyph, label} — `text` absent by design', JSON.stringify(v));
  // "BEFORE any lookup" is a fact about the SET, never the clock (lane-mirror-198): a spy set records every read of
  // its keys — the refusal reads none, a good key (the control) does (the old 50 ms bound was a loaded runner's coin flip)
  let looked = 0; const spySet = new Proxy(SET, { get(t, k, r) { if (k === 'keys') looked++; return Reflect.get(t, k, r); } });
  const big = P.validateReaction({ msg: 'm1', key: 'k'.repeat(65536) }, spySet);
  const lookedByBig = looked;
  const ctl = P.validateReaction({ msg: 'm1', key: 'thumbsup' }, spySet);
  ok(!big.ok && big.code === 'bad-emoji' && big.why === 'key' && lookedByBig === 0 && ctl.ok && looked > lookedByBig, `a 64 KiB "key" is refused by its alphabet BEFORE any lookup (bad-emoji; the set's keys read ${lookedByBig} times — ${looked} for a good key, the control)`);
  ok(P.validateReaction({ msg: 'm1', key: '<system-reminder>' }, SET).code === 'bad-emoji' && P.validateReaction({ msg: 'm1', key: 'party_parrot' }, SET).code === 'bad-emoji', 'a key outside the alphabet, and a key the set does not list, are bad-emoji');
  ok(P.validateReaction({ msg: 'm1', key: 'party_parrot', op: 'remove' }, SET).ok, 'a REMOVE of a key the set no longer lists is still a removal of the user\'s own (the vendor judges it)');
  ok(P.validateReaction({ key: 'tada' }, SET).why === 'msg' && P.validateReaction({ msg: 'm1', key: 'tada', op: 'toggle' }, SET).why === 'op', 'no message / an op outside add|remove: bad-proposal by field');
  // THE ROW OVER THE CHANNEL'S VERDICT: 4 row values (one unknown) × 2 authorities × 2 channel policies
  const rows = [];
  for (const row of ['propose', 'direct', 'off', 'garbage']) for (const auth of ['draft', 'send']) for (const pol of ['direct', 'review']) {
    const d = P.decideReaction({ reactionPolicy: row, channelPolicy: { mode: pol }, authority: auth });
    const want = row === 'off' ? 'refused' : row === 'direct' && pol === 'direct' && auth === 'send' ? 'direct' : 'review';
    rows.push([row, auth, pol, d.refused ? 'refused' : d.mode, want]);
  }
  ok(rows.every((r) => r[3] === r[4]), 'decideReaction: off ⇒ refused (policy-off); propose (and an unknown value — fail closed) ⇒ review whatever the channel says; direct ⇒ the channel\'s own verdict, never past it (16 cells)', JSON.stringify(rows.filter((r) => r[3] !== r[4])));
  ok(P.decideReaction({ reactionPolicy: 'off' }).why === 'policy-off' && P.decideReaction({ reactionPolicy: 'propose', channelPolicy: { mode: 'direct' }, authority: 'send' }).reasons.includes('reaction-policy') && P.DECISION_REASONS.includes('reaction-policy'), 'the refusal names policy-off; a propose row names its own reason (in the closed reason set)');
  const GZ = { linksReview: true, attachmentsReview: true, offHours: { enabled: true, tz: 'UTC', start: '00:00', end: '00:01', weekdays: [] } };
  const dl = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: GZ, proposal: { kind: 'reaction', text: 'see http://x.y', attachments: [{ name: 'a' }], authority: 'send' } });
  const dt = P.decideOutbound({ channelPolicy: { mode: 'direct' }, guards: GZ, proposal: { text: 'see http://x.y', attachments: [{ name: 'a' }], authority: 'send' } });
  ok(dl.mode === 'direct' && dl.reasons.length === 0 && dt.mode === 'review' && dt.reasons.length === 3, 'decideOutbound with kind reaction: links / attachments / off-hours cannot apply (a reaction has no text) — the same inputs as a TEXT are review ×3', JSON.stringify([dl.reasons, dt.reasons]));
  const rx = (st, extra = {}) => P.receiptFor({ id: 'p9', kind: 'reaction', state: st, convId: 'c', adapterId: 'a', reaction: { msg: 'om_x1', key: 'thumbsup', glyph: '👍', op: 'add' }, result: st === 'sent' ? { at: 1 } : null, ...extra });
  const bs = P.renderReceiptBlock(rx('sent'), { adapterLabel: 'Lark', title: 'Ops' }), br = P.renderReceiptBlock(rx('rejected', { reason: P.REJECTED_DEFAULT_REASON }), { adapterLabel: 'Lark', title: 'Ops' });
  ok(/^reaction 👍 on om_x1: sent \(proposal p9\)$/m.test(bs) && bs.split('\n').length === 2 && /^reaction 👍 on om_x1: rejected \(proposal p9\)$/m.test(br), 'a reaction\'s receipt is ONE line — `reaction 👍 on om_x1: sent / rejected`', JSON.stringify([bs, br]));
  ok(/removing reaction :tada: on/.test(P.renderReceiptBlock(P.receiptFor({ id: 'p8', kind: 'reaction', state: 'failed', reason: 'x', convId: 'c', adapterId: 'a', reaction: { msg: 'm', key: 'tada', glyph: null, op: 'remove' } }))), 'a removal says so; a key with no glyph is `:key:`');
  ok(P.receiptDeliveryVerdict('wake-now', { kind: 'reaction', state: 'sent', draftedBy: { kind: 'agent', id: 'x' } }, { live: true }).deliver === 'next-turn', 'a reaction never earns a billed turn — wake-now reads next-turn');
  ok(P.validateProposal({ text: 'x', inThread: true }).why === 'inThread' && P.validateProposal({ text: 'x', inThread: 'yes', replyTo: 'm' }).why === 'inThread' && P.validateProposal({ text: 'x', inThread: true, replyTo: 'm' }).proposal.inThread === true, 'a reply INTO a thread names what it answers (replyTo) and is a boolean — refused by name otherwise');
}
const RX_KEY = 'hourglass';   // never seeded (the seed draws from the first 12 keys) — the account's own reaction is ours to make
{
  const W = mkEngine({ name: 'rx' });
  const { eng, delivered } = W;
  await prime(eng);
  const target = eng.store.readTail(A, C, { limit: 50 }).find((r) => r && r.vendorId);
  const count = () => Object.keys(eng.store.outbox.snapshot().proposals).length;
  await eng.setReactionPolicy(A, 'off');
  const off = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY });
  ok(!off.ok && off.code === 'react-not-available' && off.why === 'policy-off' && count() === 0, 'attack 10: an agent\'s react on an account whose reaction policy is off ⇒ react-not-available (policy-off), NO proposal row', JSON.stringify(off));
  await eng.setReactionPolicy(A, 'propose');
  const pr = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY, why: 'acknowledge' });
  ok(pr.ok && pr.proposal.kind === 'reaction' && pr.proposal.state === 'awaiting-approval' && pr.decision.reasons.includes('reaction-policy') && pr.proposal.text === '' && pr.proposal.reaction.glyph === '⏳' && typeof pr.proposal.reaction.quote.text === 'string', 'propose (the default): proposed → awaiting-approval, the reason names the row, the card carries glyph + quote, no text', JSON.stringify(pr.proposal && pr.proposal.reaction));
  ok(pr.proposal.wakes === 0 && pr.proposal.honestyLine === null, 'the card: approving it wakes nobody, and no sender line rides a reaction');
  const again = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY });
  ok(again.ok && again.already === true && again.proposal.id === pr.proposal.id && count() === 1, 'the same reaction already awaiting answers THAT proposal (no second card)');
  ok((await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'nope' })).code === 'bad-emoji' && (await eng.proposeReaction(AGENT, A, C, { msg: 'no-such-msg', key: RX_KEY })).code === 'not-found' && count() === 1, 'a key the set does not list ⇒ bad-emoji; a message the log does not hold ⇒ not-found; nothing created');
  const ed = await eng.approve(pr.proposal.id, { text: 'an edit' });
  ok(!ed.ok && ed.code === 'bad-proposal' && eng.store.outbox.snapshot().proposals[pr.proposal.id].state === 'awaiting-approval', 'a reaction has no text to edit — an edited approve is refused and it still awaits');
  const n0 = delivered.length;
  const ap = await eng.approve(pr.proposal.id, { deliver: 'wake-now' });
  ok(ap.ok && ap.proposal.state === 'sent' && ap.proposal.history.map((h) => h.state).join('>') === 'proposed>awaiting-approval>sending>sent', 'approve: awaiting-approval → sending → sent (the table unchanged)', JSON.stringify(ap.proposal && ap.proposal.history));
  const fold = eng.reactionsRead(A, C, [target.vendorId]).reactions[target.vendorId] || [];
  const side = eng.store.readSide(A, C, { msgs: new Set([target.vendorId]) }).filter((x) => x.form === 'delta' && x.key === RX_KEY);
  ok(fold.some((x) => x.key === RX_KEY && x.mine && x.count === 1) && side.length === 1 && side[0].src === 'agent', 'the approved reaction is the account\'s own in the fold, written as ONE delta with src agent', JSON.stringify([fold, side]));
  const rd = delivered.slice(n0);
  ok(rd.length === 1 && rd[0].opts.noWake === true && new RegExp(`reaction ⏳ on ${target.vendorId}: sent`).test(rd[0].text), 'its receipt: ONE line, next turn — the Approve asked wake-now and a reaction never gets one', JSON.stringify(rd.map((d) => [d.opts.noWake, d.text])));
  ok((await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY })).code === 'already-reacted' && (await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'tea', op: 'remove' })).code === 'reaction-not-mine', 'an add the account already holds ⇒ already-reacted; a removal of a reaction that is not the account\'s ⇒ reaction-not-mine');
  const un = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY, op: 'remove' });
  const rj = await eng.reject(un.proposal.id, { reason: 'keep it' });
  ok(un.ok && un.proposal.reaction.op === 'remove' && rj.ok && rj.proposal.state === 'rejected' && /removing reaction ⏳ on .*: rejected \(keep it\)/.test(delivered[delivered.length - 1].text), 'unreact proposes a removal; reject ⇒ rejected, the receipt one line with the reason', delivered[delivered.length - 1].text);
  const wd = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'moon' });
  const wr = await eng.withdrawProposal({ proposalId: wd.proposal.id, by: AGENT });
  ok(wr.ok && wr.proposal.state === 'withdrawn', 'awaiting-approval → withdrawn by its drafter');
  const ex = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'star' });
  W.advance(25 * 3600e3);
  await eng.expireSweep();
  ok(eng.store.outbox.snapshot().proposals[ex.proposal.id].state === 'expired', 'awaiting-approval → expired by the sweep');
  // DIRECT row: the channel's own verdict — draft authority still reviews, send + direct sends, a review channel reviews
  await eng.setReactionPolicy(A, 'direct');
  await eng.setPolicy(A, C, 'direct');
  const d1 = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'sun' });
  ok(d1.ok && d1.proposal.state === 'awaiting-approval' && d1.decision.reasons.join() === 'authority', 'a direct row with DRAFT authority still waits (the authority guard)', JSON.stringify(d1.decision));
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all', authority: 'send' });
  const d2 = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'coffee' });
  ok(d2.ok && d2.proposal.state === 'sent' && d2.decision.mode === 'direct', 'a direct row + a direct channel + send authority ⇒ proposed → sending → sent at once');
  await eng.setPolicy(A, C, 'review');
  const d3 = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'cake' });
  ok(d3.ok && d3.proposal.state === 'awaiting-approval' && d3.decision.reasons.includes('channel-policy'), 'attack 11: a direct row on a REVIEW channel ⇒ a proposal awaiting approval (the row relaxes only to the channel\'s own verdict)', JSON.stringify(d3.decision));
  // sending → failed: the vendor refuses (the account already reacted meanwhile, from the window)
  const clash = await eng.react(A, C, target.vendorId, 'cake');
  const cf = await eng.approve(d3.proposal.id);
  ok(clash.ok && !cf.ok && cf.proposal.state === 'failed' && /already-reacted/.test(cf.proposal.reason), 'sending → failed with the vendor\'s code (the user reacted the same meanwhile); never retried', JSON.stringify(cf.proposal && cf.proposal.reason));
  // unknown → failed / sent through ONE list read (the reconcile)
  const u1 = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'bell' });
  await eng.store.outbox.update((ob) => { ob.proposals[u1.proposal.id].state = 'unknown'; });
  const rc1 = await eng.reconcile(u1.proposal.id);
  ok(rc1.ok && rc1.resolved && rc1.state === 'failed' && rc1.answer === 'not-landed', 'unknown → failed: the list does not show the account\'s reaction — it never landed', JSON.stringify(rc1));
  const u2 = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: 'gift' });
  await eng.store.outbox.update((ob) => { ob.proposals[u2.proposal.id].state = 'unknown'; });
  await eng.react(A, C, target.vendorId, 'gift');   // the lost request DID land
  const rc2 = await eng.reconcile(u2.proposal.id);
  ok(rc2.ok && rc2.resolved && rc2.state === 'sent' && rc2.answer === 'landed', 'unknown → sent: the list shows it — it landed (one list call, never a second POST)', JSON.stringify(rc2));
  eng.stop();
}
// ── lane reaction-approve-shown (the owner's hub, 2026-10-28: an agent's 👍 refused on every Approve since 2.369.197): a
//    REACTION and a RECALL approved THROUGH THE ROUTE the card posts to, with the body the card posts. Every leg above
//    approves with `eng.approve`, which takes a missing digest — the card's reaction / recall road never met the route
//    that refuses one. No `shown` ⇒ 400 in words that name what is missing (never «reload»), nothing moves; the digest of
//    the proposal as the Outbox lists it (what the card is drawn from) ⇒ sent, the vendor told ──
{
  const revf = path.join(ROOT, 'ras-revisions.json');
  fs.writeFileSync(revf, '{"revisions":{}}');
  const registry = CH.createChannelRegistry();
  registry.register(fake.makeFakeAdapter({ kind: A, receive: 'poll', sendAs: ['user'], revisionsFile: revf }));
  const W = mkEngine({ name: 'ras', registry });
  const { eng } = W;
  await prime(eng);
  await eng.store.appendRecords(A, C, [{ vendorId: 'm-ras-mine', convId: C, at: Date.now() - 600e3, author: { id: 'ou_me', name: 'me', isSelf: true, isBot: false }, text: 'the numbers are wrong' }]);
  const target = eng.store.readTail(A, C, { limit: 50 }).find((r) => r && r.vendorId && !(r.author && r.author.isSelf));
  const rxp = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY });
  const rcp = await eng.proposeRecall(AGENT, A, C, { msg: 'm-ras-mine' });
  ok(rxp.ok && rxp.proposal.state === 'awaiting-approval' && rcp.ok && rcp.proposal.state === 'awaiting-approval', 'FIXTURE: an agent\'s reaction and recall, each awaiting approval', JSON.stringify([rxp.code || rxp.error, rcp.code || rcp.error]));
  const routes = require(path.join(REPO, 'src/routes/channels.js'));
  routes.setup({ getEngine: () => eng, authEnabled: () => true });
  const call = (url, params, body) => new Promise((resolve) => {
    const req = { method: 'POST', url, params, query: {}, body: body || {} };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }, setHeader() {} };
    const layer = routes.router.stack.find((l) => l.route && l.route.path === url && l.route.methods.post);
    Promise.resolve(layer.route.stack[0].handle(req, res, () => {})).catch((err) => resolve({ status: 500, body: { error: String(err && err.message) } }));
  });
  const saysMissing = (w) => /did not send the digest of what it shows/.test(String(w)) && !/reload/i.test(String(w));
  const asListed = (id) => eng.outboxView().proposals.find((x) => x.id === id);
  const rows = [];
  for (const [what, id] of [['reaction', rxp.proposal && rxp.proposal.id], ['recall', rcp.proposal && rcp.proposal.id]]) {
    if (!id) continue;
    const bare = await call('/api/channels/outbox/:id/approve', { id }, { expectWakes: 0, deliver: 'next-turn' });   // the base's reaction / recall road
    const still = eng.store.outbox.snapshot().proposals[id].state;
    const card = await call('/api/channels/outbox/:id/approve', { id }, { expectWakes: 0, deliver: 'next-turn', shown: P.shownDigest(asListed(id)) });
    rows.push({ what, bare: bare.status, why: bare.body.why, words: saysMissing(bare.body.error), still, card: card.status, state: card.body.proposal && card.body.proposal.state });
  }
  ok(rows.length === 2 && rows.every((r) => r.bare === 400 && r.why === 'shown-required' && r.words && r.still === 'awaiting-approval'), 'reaction-approve-shown route: a reaction\'s and a recall\'s Approve WITHOUT the digest (the base card\'s body) ⇒ 400 shown-required in words naming what is missing (never «reload»), still awaiting', JSON.stringify(rows));
  const fold = eng.reactionsRead(A, C, [target.vendorId]).reactions[target.vendorId] || [];
  let revs = {}; try { revs = JSON.parse(fs.readFileSync(revf, 'utf8')).revisions || {}; } catch {}
  ok(rows.length === 2 && rows.every((r) => r.card === 200 && r.state === 'sent') && fold.some((x) => x.key === RX_KEY && x.mine) && (revs['m-ras-mine'] || {}).state === 'recalled', 'reaction-approve-shown route: the SAME Approve with the digest of the card as the Outbox lists it ⇒ sent — the reaction is the account\'s own, the message taken back at the vendor', JSON.stringify({ rows, fold, revs }));
  eng.stop();
}
// sending → unknown: the adapter THREW mid-react (the answer lost) — never retried; the card offers Check outcome
{
  const registry = CH.createChannelRegistry();
  let reacts = 0;
  const thr = { ...fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }) };
  const inner = thr.create;
  thr.create = (rec, deps) => { const impl = inner(rec, deps); return { ...impl, async react() { reacts++; throw new Error('socket hung up mid-react'); } }; };
  registry.register(thr);
  const W = mkEngine({ name: 'rx-lost', registry });
  const { eng, delivered } = W;
  await prime(eng);
  const target = eng.store.readTail(A, C, { limit: 50 }).find((r) => r && r.vendorId);
  const pr = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY });
  const n0 = delivered.length;
  const a = await eng.approve(pr.proposal.id);
  const q = eng.store.outbox.snapshot().proposals[pr.proposal.id];
  const sides = eng.store.readSide(A, C, { msgs: new Set([target.vendorId]) }).filter((x) => x.key === RX_KEY);
  ok(!a.ok && q.state === 'unknown' && reacts === 1 && sides.length === 0 && delivered.length === n0, 'attack 6: a LOST add ⇒ unknown, no side record (the chip does not flip), no receipt, ONE attempt', JSON.stringify([q.state, reacts, sides.length]));
  ok(eng.outboxView().proposals.find((x) => x.id === q.id).canReconcile === true, 'the card offers Check outcome (the channel lists reactions)');
  await eng.approve(pr.proposal.id); W.advance(48 * 3600e3); await eng.expireSweep();
  ok(reacts === 1, 'NEGATIVE CONTROL: neither a re-approve nor the sweep ever reacts again');
  eng.stop();
}
// THE CONTROL (spec §7.1): an engine copy whose `off` line is gone creates the proposal the row forbids
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('chan-outbox-rx', REPO);
  const esrc = engineSource(REPO);
  const LINE = "    if (agent && row === 'off') return { ok: false, code: 'react-not-available', why: 'policy-off',";
  // TWO obedience points, both removed (a layered guard's control strips every layer — the PURE verdict's refusal
  // is obeyed by the second line, so a copy without only the first is still refused by the second)
  const LINE2 = "    if (decision.refused) return { ok: false, code: decision.code, why: decision.why,";
  ok(esrc.split(LINE).length === 2 && esrc.split(LINE2).length === 2, 'the policy-off line and the verdict\'s refusal line are each spelled once (the control removes exactly them)');
  const bad = M.load('src/server/channels-engine.js', esrc.split('\n').filter((l) => !l.startsWith(LINE) && !l.startsWith(LINE2)).join('\n'), 'off-ignored');
  const W = mkEngine({ name: 'rx-ctl', engine: bad });
  const { eng } = W;
  await prime(eng);
  await eng.setReactionPolicy(A, 'off');
  const target = eng.store.readTail(A, C, { limit: 50 }).find((r) => r && r.vendorId);
  const r = await eng.proposeReaction(AGENT, A, C, { msg: target.vendorId, key: RX_KEY });
  ok(r.ok && Object.keys(eng.store.outbox.snapshot().proposals).length === 1, 'CONTROL: the copy without the line CREATES a proposal on an `off` account — attack 10\'s leg above would go red', JSON.stringify(r).slice(0, 200));
  eng.stop();
}
// A REPLY INTO A THREAD (spec §5.2): the proposal records it, the fake receives `inThread`, the receipt names the thread
{
  const W = mkEngine({ name: 'thread-reply' });
  const { eng, delivered } = W;
  await prime(eng);
  const parent = eng.store.readTail(A, C, { limit: 50 }).find((r) => r && r.vendorId && r.text);
  const bad = await eng.propose(AGENT, A, C, { text: 'no parent', inThread: true });
  ok(!bad.ok && bad.code === 'bad-proposal' && bad.why === 'inThread', 'a thread reply without a parent ⇒ bad-proposal, why inThread');
  const pr = await eng.propose(AGENT, A, C, { text: 'in the thread', replyTo: parent.vendorId, inThread: true });
  ok(pr.ok && pr.proposal.inThread === true && pr.proposal.threadQuote && typeof pr.proposal.threadQuote.text === 'string', 'the proposal records inThread and the parent\'s quote (the card\'s "Reply in thread — under …")', JSON.stringify(pr.proposal && pr.proposal.threadQuote));
  const a = await eng.approve(pr.proposal.id);
  const sent = eng.store.outbox.snapshot().proposals[pr.proposal.id];
  ok(a.ok && sent.state === 'sent' && /in a thread/.test(delivered[delivered.length - 1].text), 'approve ⇒ sent; the receipt says it went into a thread', delivered[delivered.length - 1].text);
  const tf = await eng.propose(AGENT, A, C, { text: 'nope [[fake:topic-forbidden]]', replyTo: parent.vendorId, inThread: true });
  const tfa = await eng.approve(tf.proposal.id);
  const again = await eng.propose(AGENT, A, C, { text: 'again', replyTo: parent.vendorId, inThread: true });
  ok(!tfa.ok && tfa.proposal.state === 'failed' && !again.ok && again.code === 'topic-forbidden', 'attack 19: a group that refuses thread replies ⇒ failed, and the conversation\'s verdict narrows at once (the next thread reply is topic-forbidden before anything is created)', JSON.stringify([tfa.proposal && tfa.proposal.reason, again.code]));
  eng.stop();
}

// ── lane channel-direct-send-sync: a direct send's receipt is read INLINE by the drafting CLI ───────────────
console.log('§C lane channel-direct-send-sync: the receipt ROAD + the held-batch heading (PURE)');
{
  const ag = { kind: 'agent', id: 'c1' };
  const RR = (p, e) => P.receiptRoad(p, e);
  ok(RR({ draftedBy: { kind: 'user' } }).road === 'none', 'a user draft owes no agent a receipt ⇒ none');
  ok(RR({ draftedBy: ag, state: 'withdrawn' }).road === 'none', 'a proposal the agent withdrew ⇒ none');
  ok(RR({ draftedBy: ag, receipt: { road: 'inline' } }).road === 'inline', 'a receipt the CLI already read (road inline) ⇒ inline — the message road is NEVER consulted');
  ok(RR({ draftedBy: ag }, { collected: true }).road === 'inline', 'the collect event itself ⇒ inline');
  ok(RR({ draftedBy: ag }, { collecting: true }).road === 'inline', 'a CLI still waiting within the window ⇒ inline (the message is held)');
  ok(RR({ draftedBy: ag }).road === 'message', 'a direct send no CLI waited on (a job / another door) ⇒ message');
  ok(RR({ draftedBy: ag, kind: 'reaction' }, { collecting: true }).road === 'message' && RR({ draftedBy: ag, kind: 'recall' }, { collecting: true }).road === 'message', 'a reaction / recall is never collected inline ⇒ message (its own next-turn, no-wake verdict)');
  ok(RR({ draftedBy: ag, receipt: { road: 'inline' } }).road !== 'message', 'INVARIANT: a MUTANT that returned `message` for an inline-collected direct send would queue the redundant receipt the owner asked us to stop (RED)');
  ok(P.stashHeading('busy') === '### Messages that arrived during your previous turn', 'stashHeading(busy): a turn was running — no free lane');
  ok(P.stashHeading('paced') === '### Messages held until this turn (a delivery earlier would have cost a wake)', 'stashHeading(paced): idle — a delivery would have cost a wake');
  ok(P.stashHeading('unreachable') === '### Messages that arrived while this conversation was unreachable', 'stashHeading(unreachable): kept ONLY for a conversation that truly could not be reached');
  ok(P.stashHeading('nonsense') === P.stashHeading('unreachable'), 'an unknown cause falls back to the honest "unreachable"');
  // the Outbox's fate for an inline receipt (rule 4): "read inline", never "waiting for the next turn"
  const fi = P.receiptFateOf({ draftedBy: { kind: 'agent', id: 'c1', name: 'Worker' }, receipt: { status: 'sent' }, receiptDelivery: { road: 'inline', collected: true, at: 1 } });
  ok(fi.kind === 'inline' && /Worker read the receipt with its own command/.test(P.receiptFateText(fi)), 'receiptFateOf: an inline-collected receipt ⇒ the Outbox shows "Worker read the receipt with its own command", never "Waiting for …"');
  const fp = P.receiptFateOf({ draftedBy: { kind: 'agent', id: 'c1', name: 'Worker' }, receipt: { status: 'sent' }, receiptDelivery: { road: 'inline', collecting: true, collected: false, at: 1 } });
  ok(fp.kind === 'inline' && /Being read by Worker inline/.test(P.receiptFateText(fp)), 'receiptFateOf: a receipt held for an inline read ⇒ "Being read by Worker inline", not "waiting for the next turn"');
}

console.log('§C the real engine: a direct send read inline queues NO receipt message; the collect door; the timeout fallback');
async function primeDirect(eng) {
  await prime(eng);
  await eng.setPolicy(A, C, 'direct');
  await eng.propose({ kind: 'user' }, A, C, { text: 'prime: learn the send caps' });   // a user direct send learns the conversation's send caps (sendAs offered)
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all', authority: 'send' });
}
{
  const W = mkEngine({ name: 'collect-inline' });
  const { eng, delivered, stash } = W;
  await primeDirect(eng);
  const r = await eng.propose(AGENT, A, C, { text: 'the deploy is done' }, { collect: true });
  ok(r.ok && r.proposal.state === 'sent' && typeof r.receiptText === 'string' && /SENT/.test(r.receiptText) && /sent as: user/.test(r.receiptText), 'a direct send whose caller waits gets the receipt WORDS back with the command (SENT · sent as · what the recipient sees)', JSON.stringify([r.proposal.state, (r.receiptText || '').slice(0, 60)]));
  ok(delivered.length === 0 && stash.length === 0, 'NOTHING went to the message road — no delivery, no stash, no queue row (the owner: no second message waiting for the next turn)');
  const q0 = eng.store.outbox.snapshot().proposals[r.proposal.id];
  ok(q0.receiptCollect === true && q0.receiptDelivery && q0.receiptDelivery.road === 'inline' && q0.receiptDelivery.collecting === true && q0.receiptDelivery.collected === false, 'the proposal records the receipt is held for an inline read');
  const cr = await eng.collectReceipt(AGENT, r.proposal.id);
  ok(cr.ok && cr.collected === true && /SENT/.test(cr.receiptText || ''), 'the collect door (GET status?id&collect=1) hands the receipt and marks it read');
  const q1 = eng.store.outbox.snapshot().proposals[r.proposal.id];
  ok(q1.receipt.road === 'inline' && q1.receiptDelivery.collected === true, 'the proposal is marked inline-collected');
  ok(delivered.length === 0 && stash.length === 0, 'still no message after the collection — the receipt lived only inline');
  ok(eng.collectReceipt({ kind: 'agent', id: 'agent-2', name: 'X', msgLevelFor: () => 'none' }, r.proposal.id).then ? true : true, 'collectReceipt is async');
  const other = await eng.collectReceipt({ kind: 'agent', id: 'agent-2', name: 'X', msgLevelFor: () => 'none' }, r.proposal.id);
  ok(!other.ok && other.code === 'not-found', "another agent cannot collect someone else's receipt — the uniform not-found");
  eng.stop();
}
{
  // a HELD send answers `receiptPending` (no receipt yet) — the CLI polls the collect door
  const W = mkEngine({ name: 'collect-pending' });
  const { eng } = W;
  await primeDirect(eng);
  const r = await eng.propose(AGENT, A, C, { text: 'later' }, { collect: true });
  // force the proposal back to a no-receipt `sending` (a held send's shape) and collect ⇒ pending
  await eng.store.outbox.update((ob) => { const p = ob.proposals[r.proposal.id]; p.state = 'sending'; p.receipt = null; p.receiptDelivery = null; });
  const cr = await eng.collectReceipt(AGENT, r.proposal.id);
  ok(cr.ok && cr.pending === true && cr.state === 'sending', 'a send not out yet ⇒ pending (the CLI keeps polling, prints "sending — the receipt will come as a message" on timeout)');
  eng.stop();
}
{
  // the CLI never collects ⇒ after the collect window the receipt falls back to the MESSAGE road
  // ci-346-reds: the hold is judged on the ENGINE's clock (`now() − p.at ≤ window`) — a 30 ms window on the wall clock is
  // outlasted by the send itself on a loaded runner (load 5: compose's twin went red). The clock stands still through the
  // send (the window is open, deterministically); the fallback is the real one-shot timer, waited for (bounded), never slept
  const W = mkEngine({ name: 'collect-timeout', collectWindowMs: 30, now: heldClock() });
  const { eng, delivered, stash } = W;
  await primeDirect(eng);
  const r = await eng.propose(AGENT, A, C, { text: 'nobody collects me' }, { collect: true });
  ok(delivered.length === 0 && stash.length === 0, 'held at first — the window is open');
  await untilDelivered(delivered);
  ok(delivered.length === 1 && delivered[0].opts.spendReason === 'channel-receipt' && delivered[0].opts.noWake === true, 'the CLI timed out / died before collecting ⇒ the receipt fell back to the MESSAGE road (noWake, its own spend reason)', JSON.stringify(delivered.map((d) => d.opts && d.opts.spendReason)));
  const q = eng.store.outbox.snapshot().proposals[r.proposal.id];
  ok(q.receiptDelivery && q.receiptDelivery.road !== 'inline' && q.receiptDelivery.collected !== true, 'the fallback is a real message delivery, not an inline collection');
  eng.stop();
}
{
  // an APPROVAL-GATED proposal: collect is ignored (never held); the person acts later ⇒ its receipt still MESSAGES
  const W = mkEngine({ name: 'collect-review' });
  const { eng, delivered } = W;
  await prime(eng);
  const pr = await eng.propose(AGENT, A, C, { text: 'needs approval' }, { collect: true });
  ok(pr.ok && pr.proposal.state === 'awaiting-approval' && pr.receiptText === undefined && pr.receiptPending === undefined, 'a review proposal is no direct send — collect yields no inline receipt');
  ok(eng.store.outbox.snapshot().proposals[pr.proposal.id].receiptCollect === undefined, 'receiptCollect is set ONLY on a direct send (a review proposal is never held)');
  const a = await eng.approve(pr.proposal.id);
  ok(a.ok && delivered.length === 1 && delivered[0].opts.spendReason === 'channel-receipt', 'the approval-gated proposal still gets its receipt as a MESSAGE (the person decided it later — new to the agent)');
  eng.stop();
}
{
  // a direct send with NO collect (a Background Work job / another door) ⇒ the MESSAGE road (the base behavior)
  const W = mkEngine({ name: 'collect-job' });
  const { eng, delivered } = W;
  await primeDirect(eng);
  const r = await eng.propose(AGENT, A, C, { text: 'a job sent me' });
  ok(r.ok && r.proposal.state === 'sent' && delivered.length === 1 && delivered[0].opts.spendReason === 'channel-receipt', 'a direct send no CLI waited on still travels as a message (a job / another door with no collect)');
  eng.stop();
}
{
  // RED CONTROL (the base): without the inline-road gate a direct send QUEUES a receipt message
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC = mutantCopies('chan-outbox-collect', REPO);
  const esrc = engineSource(REPO);
  const GATE = "if (P.receiptRoad({ ...p, receipt: rc }, { collecting }).road === 'inline') {";
  ok(esrc.split(GATE).length === 2, 'the inline-road gate is present once (the control patches exactly it)');
  const ungated = MC.load('src/server/channels-engine.js', editAnchor(esrc, GATE, 'if (false) {', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'collect-ungated');
  const W = mkEngine({ name: 'collect-ctl', engine: ungated });
  const { eng, delivered, stash } = W;
  await primeDirect(eng);
  await eng.propose(AGENT, A, C, { text: 'collected but ungated' }, { collect: true });
  ok(delivered.length + stash.length >= 1, 'CONTROL (the base): without the gate a direct send QUEUES a receipt message — the inline leg above would be RED');
  eng.stop();
}

{
  // lane channel-direct-send-sync (the owner: "unreachable 不 make sense"): a receipt the hub could not deliver
  // live is stashed WITH the cause, so the drain heads the batch by cause — never "unreachable" for a live turn
  const W = mkEngine({ name: 'collect-cause' });
  const { eng, stash } = W;
  await prime(eng);
  const pr = await eng.propose(AGENT, A, C, { text: 'held with a cause' });
  await eng.approve(pr.proposal.id);
  const rc = stash.find((s) => s.env.source === 'channel-receipt');
  ok(rc && rc.env.held && rc.env.held.why === 'busy', 'a receipt refused a free lane (no free lane) is stashed WITH held.why=busy — the drain heads it "arrived during your previous turn", not "unreachable"', JSON.stringify(rc && rc.env.held));
  eng.stop();
}
{
  // the drain picks the heading by cause (agent-routes drainStashUnderCap over the stashed entries)
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const held = [{ source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'Channel receipt — proposal p1: SENT', held: { kind: 'notice', why: 'paced' }, ts: Date.now() }];
  const fake = { stashEntries: () => held, drainStash: () => {}, emitPeerCard: () => {}, retryEntries: () => [] };
  const txt = AR.drainStashUnderCap(fake, 'agent-1', 0, () => {});
  ok(/^### Messages held until this turn \(a delivery earlier would have cost a wake\)/.test(txt), 'drainStashUnderCap heads a paced batch "held until this turn …" (never "unreachable" for a conversation taking this very turn)', txt.split('\n')[0]);
  const busyTxt = AR.drainStashUnderCap({ ...fake, stashEntries: () => [{ ...held[0], held: { kind: 'notice', why: 'busy' } }] }, 'agent-1', 0, () => {});
  ok(/^### Messages that arrived during your previous turn/.test(busyTxt), 'drainStashUnderCap heads a busy batch "arrived during your previous turn"');
  const plain = AR.drainStashUnderCap({ ...fake, stashEntries: () => [{ source: 'channel', kind: 'notification', text: 'x', ts: Date.now() }] }, 'agent-1', 0, () => {});
  ok(/^### Messages that arrived while this conversation was unreachable/.test(plain), 'a batch with no cause keeps the default heading (the hand-over of a session that had truly gone)');
}

// ── lane inline-receipts-compose-api: the two siblings of the reply road — a NEW mail (`compose`) and a raw API call
// (`api`). The owner's rule: a command that performs an action answers with the action's outcome; a message carries only
// what the actor could not have learned from its own command. ONE verdict (receiptRoad) for all three.
console.log('§C lane inline-receipts-compose-api: the road table — reply · compose · api (PURE receiptRoad, one verdict)');
{
  const ag = { kind: 'agent', id: 'c1' };
  const mail = { to: ['bob@example.com'], cc: [], subject: 'Numbers' };
  const ROWS = [
    ['reply — a direct send, its CLI waiting', { draftedBy: ag }, { collecting: true }, 'inline'],
    ['compose — a NEW mail sent directly, its CLI waiting', { draftedBy: ag, compose: mail }, { collecting: true }, 'inline'],
    ['compose — read through the collect door', { draftedBy: ag, compose: mail, receipt: { road: 'inline' } }, {}, 'inline'],
    ['compose — no CLI waiting (a job), or its CLI timed out', { draftedBy: ag, compose: mail }, {}, 'message'],
    ['api — a gated proposal its CLI waits on (api … --wait / api wait)', { draftedBy: ag, kind: 'api' }, { collecting: true }, 'inline'],
    ['api — a gated proposal decided while no CLI waits', { draftedBy: ag, kind: 'api' }, {}, 'message'],
    ['api — nobody\'s agent drafted it', { draftedBy: { kind: 'user' }, kind: 'api' }, { collecting: true }, 'none'],
  ];
  for (const [what, prop, ev, road] of ROWS) ok(P.receiptRoad(prop, ev).road === road, `receiptRoad: ${what} ⇒ ${road}`, P.receiptRoad(prop, ev));
}

console.log('§C the real engine: compose — a NEW mail sent directly is read inline; no CLI ⇒ the message; the base queues one');
const MAIL = { to: 'bob@example.com', subject: 'Weekly numbers', text: 'the numbers are in' };
async function primeCompose(eng, authority = 'send') {
  await prime(eng);
  await eng.setAccountPolicy(A, 'direct');
  await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, authority }] });
}
{
  const W = mkEngine({ name: 'compose-inline' });
  const { eng, delivered, stash } = W;
  await primeCompose(eng);
  const r = await eng.compose(AGENT, A, MAIL, { collect: true });
  ok(r.ok && r.proposal.state === 'sent' && r.receiptPending === false && /SENT/.test(r.receiptText || '') && /sent as: user/.test(r.receiptText || ''), 'compose: a NEW mail sent directly whose CLI waits gets the receipt WORDS back with the command (SENT · sent as · what the recipient sees)', JSON.stringify([r.code, r.proposal && r.proposal.state, (r.receiptText || '').slice(0, 80)]));
  ok(delivered.length === 0 && stash.length === 0, 'compose: NOTHING went to the message road — no delivery, no stash, no queue row');
  const q0 = eng.store.outbox.snapshot().proposals[r.proposal.id];
  ok(q0.receiptCollect === true && q0.receiptDelivery && q0.receiptDelivery.road === 'inline' && q0.receiptDelivery.collecting === true, 'compose: the proposal records the receipt is held for an inline read');
  const cr = await eng.collectReceipt(AGENT, r.proposal.id);
  ok(cr.ok && cr.collected === true && /SENT/.test(cr.receiptText || '') && eng.store.outbox.snapshot().proposals[r.proposal.id].receipt.road === 'inline', 'compose: the collect door (the CLI confirming its read) marks it read inline');
  ok(delivered.length === 0 && stash.length === 0, 'compose: still no message after the collection — the receipt lived only inline');
  eng.stop();
}
{
  // a NEW mail whose CLI never reads it ⇒ after the window the receipt falls back to the MESSAGE road (reply's fallback)
  // ci-346-reds (red on the runner only, load 5): the clock held still through the compose — see collect-timeout above
  const W = mkEngine({ name: 'compose-timeout', collectWindowMs: 30, now: heldClock() });
  const { eng, delivered } = W;
  await primeCompose(eng);
  const r = await eng.compose(AGENT, A, MAIL, { collect: true });
  ok(r.ok && delivered.length === 0, 'compose: held at first — the window is open');
  await untilDelivered(delivered);
  ok(delivered.length === 1 && delivered[0].opts.spendReason === 'channel-receipt' && delivered[0].opts.noWake === true, 'compose: the CLI timed out / died before reading ⇒ the receipt fell back to the MESSAGE road (noWake, its own spend reason)', JSON.stringify(delivered.map((d) => d.opts && d.opts.spendReason)));
  eng.stop();
  // RED CONTROL (the runner's red, made deterministic): a clock that moves 100 ms at every read — a send slower than the
  // 30 ms window — finds the window SHUT when the receipt is ready: it is a message during the compose, and the judge
  // above ("held at first") reads it red
  let tSlow = Date.now();
  const S = mkEngine({ name: 'compose-timeout-slow', collectWindowMs: 30, now: () => (tSlow += 100) });
  await primeCompose(S.eng);
  const rs = await S.eng.compose(AGENT, A, MAIL, { collect: true });
  ok(rs.ok && S.delivered.length === 1 && S.delivered[0].opts.spendReason === 'channel-receipt', 'CONTROL: a compose slower than the window (every clock read 100 ms on) delivers its receipt inside the compose — "held at first" is RED on it', JSON.stringify({ ok: rs.ok, code: rs.code, delivered: S.delivered.length }));
  S.eng.stop();
}
{
  // no collect (a Background Work job / another door) ⇒ the message road; a REVIEW compose ⇒ never held, its receipt messages
  const W = mkEngine({ name: 'compose-job' });
  const { eng, delivered } = W;
  await primeCompose(eng);
  const r = await eng.compose(AGENT, A, MAIL);
  ok(r.ok && r.proposal.state === 'sent' && r.receiptText === undefined && delivered.length === 1 && delivered[0].opts.spendReason === 'channel-receipt', 'compose: a NEW mail no CLI waited on still travels as a message (a job / another door)');
  eng.stop();
  const W2 = mkEngine({ name: 'compose-review' });
  await primeCompose(W2.eng, 'draft');   // the agent may only draft on the account ⇒ the card waits for the user (authority)
  const pr = await W2.eng.compose(AGENT, A, MAIL, { collect: true });
  ok(pr.ok && pr.proposal.state === 'awaiting-approval' && pr.decision.reasons.includes('authority') && pr.receiptText === undefined && W2.eng.store.outbox.snapshot().proposals[pr.proposal.id].receiptCollect === undefined, 'compose: an approval-gated mail is no direct send — never held, no inline receipt', JSON.stringify(pr).slice(0, 400));
  const a = pr.ok ? await W2.eng.approve(pr.proposal.id) : pr;
  ok(a.ok && W2.delivered.length === 1 && W2.delivered[0].opts.spendReason === 'channel-receipt', 'compose: …and its receipt still MESSAGES (the person decided it later — new to the agent)');
  W2.eng.stop();
}
{
  // RED CONTROL (the base): compose without the collect mark ⇒ the direct send QUEUES a second receipt message
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC = mutantCopies('chan-outbox-compose', REPO);
  const esrc = engineSource(REPO);
  const MARKC = "    await markCollect(created.id, guards, decision);   // lane inline-receipts-compose-api: a NEW mail sent directly is read inline by the CLI that waits, as a reply is\n";
  ok(esrc.split(MARKC).length === 2, 'compose\'s collect mark is present once (the control drops exactly it)');
  const base = MC.load('src/server/channels-engine.js', editAnchor(esrc, MARKC, '', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'compose-unmarked');
  const W = mkEngine({ name: 'compose-ctl', engine: base });
  const { eng, delivered, stash } = W;
  await primeCompose(eng);
  await eng.compose(AGENT, A, MAIL, { collect: true });
  ok(delivered.length + stash.length >= 1, 'CONTROL (the base): a compose with no collect mark QUEUES a receipt message next to the command\'s answer — the inline compose leg above would be RED', JSON.stringify(delivered.length + stash.length));
  eng.stop();
}

console.log('§C THE SEND-VERB CENSUS (grep-derived): every CLI verb that sends threads `collect` to its door — reply · compose · api');
/** The doors that SEND (an agent route — or a helper it calls — reaching the engine's propose / compose / composeEach or the
 *  raw API's call; a reaction / recall is no send: its receipt is a next-turn line by receiptRoad), each READING the CLI's
 *  `collect`; then every CLI POST to one of those routes, each CARRYING `collect` in the body it sends. */
function sendCensus(cli, routes) {
  const SEND = /\b(?:eng\.(?:propose|compose|composeEach)|api\.call)\(/;
  const chunks = routes.split(/\n(?=app\.[a-z]+\(|async function |function )/);
  const pathOf = (c) => (/^app\.post\('([^']+)'/.exec(c) || [])[1] || null;
  const fnOf = (c) => (/^(?:async )?function (\w+)\(/.exec(c) || [])[1] || null;
  const doors = chunks.filter((c) => SEND.test(c)).map((c) => {
    const fn = fnOf(c);
    let route = pathOf(c);
    if (!route && fn) { const caller = chunks.find((x) => pathOf(x) && x.includes(`${fn}(`)); route = caller ? pathOf(caller) : null; }
    return { route, door: fn || route, reads: /\bb\.collect === true\b/.test(c) };
  });
  const sendRoutes = [...new Set(doors.map((d) => d.route))].sort();
  const lines = cli.split('\n');
  const posts = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(?:call|apiReq)\('POST', '([^']+)',|fetch\(API \+ '([^']+)', \{ method: 'POST'/g)) {
      const route = m[1] || m[2];
      if (!sendRoutes.includes(route)) continue;
      const rest = l.slice(m.index + m[0].length).trim();
      let carries;
      if (rest.startsWith('{')) carries = /\bcollect\b/.test(rest);
      else {
        const id = m[2] ? ((/body: JSON\.stringify\((\w+)\)/.exec(rest) || [])[1]) : (/^(\w+)/.exec(rest) || [])[1];
        let decl = null;
        for (let j = i - 1; j >= Math.max(0, i - 60) && !decl; j--) if (new RegExp(`\\b(?:const|let) ${id} = \\{`).test(lines[j])) decl = lines[j];
        carries = !!decl && /\bcollect\b/.test(decl);
      }
      posts.push({ line: i + 1, route, carries });
    }
  });
  return { doors, sendRoutes, posts };
}
const CLI_SRC = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf-8');
const ROUTES_SRC = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
const sendRed = (c) => [...c.doors.filter((d) => !d.reads).map((d) => `door ${d.door} does not read b.collect`), ...c.posts.filter((x) => !x.carries).map((x) => `vibespace-channels:${x.line} POST ${x.route} carries no collect`)];
{
  const c = sendCensus(CLI_SRC, ROUTES_SRC);
  ok(JSON.stringify(c.sendRoutes) === JSON.stringify(['/api/agent/channels/api', '/api/agent/channels/compose', '/api/agent/channels/reply']), 'the send routes, derived from the agent routes: api · compose · reply (a NEW route that sends lands here — and in the rows below)', c.sendRoutes);
  ok(c.doors.length >= 4 && c.doors.every((d) => d.reads), `every send door reads the CLI's collect (${c.doors.map((d) => d.door).join(', ')})`, c.doors);
  ok(c.posts.length >= 4 && c.posts.every((x) => x.carries), `every CLI POST to a send route carries collect (${c.posts.length}: ${c.posts.map((x) => `${x.route.split('/').pop()}@${x.line}`).join(', ')})`, c.posts);
  // CONTROLS — the census reds each way a send can skip the inline road
  const baseCompose = CLI_SRC.replace("const body = { account, to, subject, text, collect: true };", "const body = { account, to, subject, text };");
  ok(baseCompose !== CLI_SRC && sendRed(sendCensus(baseCompose, ROUTES_SRC)).some((x) => /POST \/api\/agent\/channels\/compose carries no collect/.test(x)), 'CONTROL (the base): a compose that sends no collect is RED by its line');
  const planted = CLI_SRC.replace("  if (verb === 'search') {", "  if (verb === 'send2') { const r = await call('POST', '/api/agent/channels/reply', { conv: args[1], text: args[2] }); console.log(r.ok); return; }\n  if (verb === 'search') {");
  ok(planted !== CLI_SRC && sendRed(sendCensus(planted, ROUTES_SRC)).length === 1, 'CONTROL: a NEW send verb with no collect is RED', sendRed(sendCensus(planted, ROUTES_SRC)));
  const deaf = ROUTES_SRC.replace(", { collect: b.collect === true });   // lane inline-receipts-compose-api: each caller's direct send read inline", ");");
  ok(deaf !== ROUTES_SRC && sendRed(sendCensus(CLI_SRC, deaf)).some((x) => /door composeCallers does not read b\.collect/.test(x)), 'CONTROL: a send door that drops the CLI\'s collect (compose --caller) is RED by name');
}

// lane bl-msg B-9b9c (fb-8c0809911d): two conversations each proposed a reply to ONE incoming message, the person approved both cards and
// the contact got the reply twice. A reply is CROSS-LINKED at propose with every other reply to the same message that is open or sent:
// both views carry `also` (resolved NOW), the agent's answer names it by id and whose, never another conversation's name
console.log('§bl-msg B-9b9c two replies to ONE message — both cards name the other; the agent is told; another message is not linked');
{
  const runOn = async (ENGM, name) => {
    const W9 = mkEngine({ name, engine: ENGM, live: [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }, { cid: 'agent-2', name: 'Helper', groups: ['g1'] }] });
    const { eng } = W9;
    await prime(eng);
    await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-2', name: 'Helper' }, level: 'visible' });
    const AG2 = { kind: 'agent', id: 'agent-2', name: 'Helper', groups: ['g1'], msgLevelFor: () => 'none' };
    const recs = eng.store.readTail(A, C, { limit: 20 }).filter((x) => x && x.vendorId);
    const msg = recs[recs.length - 1].vendorId, other = recs[0].vendorId;
    const p1 = await eng.propose(AGENT, A, C, { text: 'reply one', replyTo: msg });
    const p2 = await eng.propose(AG2, A, C, { text: 'reply two', replyTo: msg });
    const p3 = await eng.propose(AGENT, A, C, { text: 'to another message', replyTo: other });
    const v = (id) => eng.outboxView().proposals.find((x) => x.id === id) || {};
    const out = { msg, other, p1: p1.proposal, p2: p2.proposal, p3: p3.proposal, v1: v(p1.proposal.id), v2: v(p2.proposal.id), v3: v(p3.proposal.id) };
    if (p1.proposal) await eng.reject(p1.proposal.id).catch(() => null);
    out.v2after = v(p2.proposal.id);
    return out;
  };
  const g = await runOn(ENG, 'b9b9c');
  const ids = (x) => (Array.isArray(x && x.also) ? x.also.map((a) => a.id) : []);
  ok(g.msg !== g.other && g.p1 && g.p2 && g.p1.state === 'awaiting-approval' && g.p2.state === 'awaiting-approval', 'two agents each proposed a reply to the same message (both await approval)', JSON.stringify({ s1: g.p1 && g.p1.state, s2: g.p2 && g.p2.state }));
  ok(JSON.stringify(ids(g.v1)) === JSON.stringify([g.p2.id]) && JSON.stringify(ids(g.v2)) === JSON.stringify([g.p1.id]) && g.v2.also[0].by && g.v2.also[0].by.name === 'Worker' && g.v2.also[0].state === 'awaiting-approval',
    'THE CARDS: each view names the other (id, state, who drafted it) — linked both ways', JSON.stringify({ v1: g.v1.also, v2: g.v2.also }));
  ok(Array.isArray(g.p2.also) && g.p2.also.length === 1 && g.p2.also[0].mine === false && g.p2.also[0].byUser === false && !('by' in g.p2.also[0]) && !('alsoFor' in g.p2) && !JSON.stringify(g.p2.also).includes('Worker'),
    'THE AGENT\'S ANSWER: the second drafter is told the other proposal by id and «not yours», never the other conversation\'s name', JSON.stringify(g.p2.also));
  ok(!ids(g.v3).length && !ids(g.v1).includes(g.p3.id), 'a reply to ANOTHER message is not linked');
  ok(!ids(g.v2after).length, '…and once the other is rejected, the card no longer names it (resolved now, never a frozen copy)', JSON.stringify(g.v2after.also || null));
  // RED CONTROL: the cross-link removed at propose ⇒ nothing names the other — the legs above go red
  const src = engineSource(REPO);
  const LINK = "const alsoIds = target ?";
  ok(src.split(LINK).length === 2, 'the control finds its line');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MUTO = mutantCopies('blm-9b9c', REPO);
  const r = await runOn(MUTO.load('src/server/channels-engine.js', editAnchor(src, LINK, 'const alsoIds = false ?', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'no-also'), 'b9b9c-red');
  ok(!ids(r.v1).length && !ids(r.v2).length && !(r.p2 && r.p2.also), 'RED CONTROL (no cross-link): neither card nor the answer names the other reply — the B-9b9c legs go red');
}

// lane bl-msg B-ae13 (fb-4d94c275a2): the agent that filed a wake request takes it back once its reply came — the request ends
// `withdrawn`, its For-you item «withdrawn by the agent»; another agent cannot, a decided one cannot, approval stays the person's click
console.log('§bl-msg B-ae13 the asker withdraws its own open wake request — nobody else, never a decided one');
{
  const run = async (ENGM, name) => {
    const W13 = mkEngine({ name, engine: ENGM, live: [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }, { cid: 'agent-2', name: 'Helper', groups: ['g1'] }] });
    const { eng, userTodos } = W13;
    await prime(eng);
    const P1 = { kind: 'agent', id: 'agent-1', name: 'Worker' }, P2 = { kind: 'agent', id: 'agent-2', name: 'Helper' };
    await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: P1, authority: 'draft' }, { principal: P2, authority: 'draft' }] });
    const AG2 = { kind: 'agent', id: 'agent-2', name: 'Helper', groups: ['g1'], msgLevelFor: () => 'none' };
    const wk = await eng.agentWatch(AGENT, KEY, { delivery: 'wake', keywords: ['outage'], why: 'on call' });
    const id = wk && wk.request && wk.request.id;
    const other = id ? await eng.withdrawWatchRequest({ requestId: id, by: { kind: 'agent', id: 'agent-2' } }) : null;
    const reqOf = () => (eng.store.index.table('watchRequests') || []).find((r) => r && r.id === id) || {};
    const reqOf3 = (rid) => ((eng.store.index.table('watchRequests') || []).find((r) => r && r.id === rid) || {}).status;
    const todoId = reqOf().todoId;
    const mine = id ? await eng.withdrawWatchRequest({ requestId: id, by: { kind: 'agent', id: 'agent-1' }, why: 'the reply came' }) : null;
    const after = { status: reqOf().status, decidedBy: reqOf().decidedBy, item: todoId && userTodos.get(todoId) ? { status: userTodos.get(todoId).status, by: userTodos.get(todoId).resolvedBy } : null };
    const again = id ? await eng.withdrawWatchRequest({ requestId: id, by: { kind: 'agent', id: 'agent-1' } }) : null;
    const wk2 = await eng.agentWatch(AG2, KEY, { delivery: 'wake' });
    await (wk2 && wk2.request ? eng.decideRequest(wk2.request.id, true, 'user') : null);
    const decided = wk2 && wk2.request ? await eng.withdrawWatchRequest({ requestId: wk2.request.id, by: { kind: 'agent', id: 'agent-2' } }) : null;
    // the cure (主开发 09:24Z): THE OTHER ORDER — the asker's withdraw is queued (its index write waits on the store's chain) when the
    // person's Allow starts: the decide writes its watcher, finds the request withdrawn and takes the watch back
    const wk3 = await eng.agentWatch(AGENT, KEY, { delivery: 'wake', keywords: ['outage'], why: 'on call again' });
    const id3 = wk3 && wk3.request && wk3.request.id;
    const wd3 = id3 ? eng.withdrawWatchRequest({ requestId: id3, by: { kind: 'agent', id: 'agent-1' } }) : null;   // not awaited: queued
    const dc3 = id3 ? await eng.decideRequest(id3, true, 'user') : null;
    const wr3 = wd3 ? await wd3 : null;
    const rows3 = eng.agentWatchesFor(AGENT, KEY);
    const race = { filed: !!id3, decide: dc3, withdraw: wr3 && { ok: wr3.ok, code: wr3.code }, status: id3 ? reqOf3(id3) : null, live: ((rows3 && rows3.rows) || []).filter((w) => !w.inert && w.delivery === 'wake').length };
    // the «being decided» mark is released on EVERY exit: a decide that returns early (the conversation is gone) leaves the asker free
    const wk4 = await eng.agentWatch(AGENT, KEY, { delivery: 'wake', keywords: ['outage'], why: 'on call, third' });
    const id4 = wk4 && wk4.request && wk4.request.id;
    if (id4) await eng.store.index.update((ix) => { delete ix.conversations[KEY]; });
    const dc4 = id4 ? await eng.decideRequest(id4, true, 'user') : null;
    const wd4 = id4 ? await eng.withdrawWatchRequest({ requestId: id4, by: { kind: 'agent', id: 'agent-1' } }) : null;
    const gone = { filed: !!id4, decide: dc4 && { ok: dc4.ok, code: dc4.code }, withdraw: wd4 && { ok: wd4.ok, code: wd4.code, error: wd4.error } };
    return { wk, other, mine, after, again, decided, race, gone };
  };
  const g = await run(ENG, 'bae13');
  ok(g.wk && g.wk.proposed && g.other && g.other.ok === false && g.other.code === 'not-found', 'another agent cannot withdraw it (the same uniform not-found)', JSON.stringify(g.other));
  ok(g.mine && g.mine.ok && g.after.status === 'withdrawn' && g.after.decidedBy === 'agent' && g.after.item && g.after.item.status !== 'open' && g.after.item.by === 'agent',
    'THE ASKER withdraws its open wake request: the request ends withdrawn (by the agent), its For-you item «withdrawn by the agent»', JSON.stringify(g.after));
  ok(g.again && g.again.ok === false && g.again.code === 'not-withdrawable' && g.decided && g.decided.ok === false && g.decided.code === 'not-withdrawable', 'twice, or once the person decided it ⇒ refused by name (a decision is final)', JSON.stringify({ again: g.again, decided: g.decided }));
  ok(g.race.filed && g.race.decide && g.race.decide.ok === false && g.race.decide.code === 'bad-state' && g.race.withdraw && g.race.withdraw.ok && g.race.status === 'withdrawn' && g.race.live === 0,
    'THE OTHER ORDER (the cure): the asker withdraws while the person\'s Allow is writing — the request ends withdrawn, the Allow is refused, and NO live wake watch stands', JSON.stringify(g.race));
  ok(g.gone.filed && g.gone.decide && g.gone.decide.ok === false && g.gone.withdraw && g.gone.withdraw.ok, 'a decide that returns early (the conversation is gone) leaves no «being decided» mark: the asker withdraws at once', JSON.stringify(g.gone));
  // RED CONTROL: the withdraw that never ends the person's item ⇒ the card would sit in For you — the leg above goes red
  const src = engineSource(REPO);
  const RES = "try { userTodos.resolveAnswered([r0.todoId], 'agent'); } catch { }";
  ok(src.split(RES).length === 2, 'the control finds its line');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const r = await run(mutantCopies('blm-ae13', REPO).load('src/server/channels-engine.js', editAnchor(src, RES, '', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'ae13-no-resolve'), 'bae13-red');
  ok(r.after.status === 'withdrawn' && !(r.after.item && r.after.item.status !== 'open'), 'RED CONTROL (the item never ended): the request is withdrawn but the person\'s card stays open — the leg above goes red', JSON.stringify(r.after));
  // the cure's RED CONTROLS (each fails by name when its line is gone): no undo ⇒ the watch stands; the mark kept on an early return ⇒ refused
  const UNDO = "      if (undo && endedAs !== 'approved') {", MARK = 'try { return await decideOpenWatch(requestId, req0, approve, by, person, t); } finally { deciding.delete(requestId); }';
  ok(src.split(UNDO).length === 2 && src.split(MARK).length === 2, 'the cure\'s two controls find their lines');
  const MCc = mutantCopies('blm-ae13c', REPO);
  const ru = await run(MCc.load('src/server/channels-engine.js', editAnchor(src, UNDO, '      if (false) {', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'ae13-no-undo'), 'bae13-noundo');
  ok(ru.race.status === 'withdrawn' && ru.race.live === 1, 'RED CONTROL (no undo): the request says withdrawn and a live wake watch stands — the other-order leg goes red (and the race was run: the Allow did write)', JSON.stringify(ru.race));
  const rm = await run(MCc.load('src/server/channels-engine.js', editAnchor(src, MARK, 'return decideOpenWatch(requestId, req0, approve, by, person, t);', "src/server/channels-engine.js + its family files (scripts/channels-engine-src.mjs engineSource)"), 'ae13-mark-held'), 'bae13-markheld');
  ok(rm.gone.withdraw && rm.gone.withdraw.ok === false && rm.gone.withdraw.code === 'not-withdrawable', 'RED CONTROL (the mark kept on an early return): the asker\'s withdraw is refused «being decided» — the early-return leg goes red', JSON.stringify(rm.gone));
}

// ── B-f276 (lane bl-windows, 主开发 r460): A HELD INDEX PAUSES THE ENGINE — nothing runs half-blind over the empty list ──
console.log('§P B-f276: the list of conversations could not be read at a start — the channels PAUSED, every door refused BY NAME');
async function pausedLegs(ENGmod, tag) {
  const r = {};
  // a world: a conversation and a proposal AWAITING the person's approval, on disk
  const W = mkEngine({ name: `paused-${tag}`, engine: ENGmod });
  await prime(W.eng);
  const p = await W.eng.propose(AGENT, A, C, { text: 'waiting for the person' });
  try { await W.eng.stop?.(); } catch { }
  const chan = path.join(W.dataDir, 'channels'), ixFile = path.join(chan, 'index.json'), obFile = path.join(chan, 'outbox.json');
  const good = fs.readFileSync(ixFile, 'utf8');
  fs.rmSync(ixFile); fs.mkdirSync(ixFile); fs.writeFileSync(path.join(ixFile, 'x'), 'x');   // the next start's read of the list FAILS (EISDIR)
  const ob0 = fs.readFileSync(obFile, 'utf8');
  const said = [];
  const H = mkEngine({ name: `paused-${tag}`, engine: ENGmod, log: { log() {}, error() {}, warn: (...a) => said.push(a.join(' ')) } });
  const refusal = async (fn) => { try { const v = await fn(); return v && v.code ? `answer:${v.code}` : `answer:${JSON.stringify(v).slice(0, 80)}`; } catch (e) { return `threw:${e && e.code}`; } };
  H.eng.start();
  r.started = said.filter((w) => /the channels are paused/.test(w)).length;
  r.pass = await refusal(() => H.eng.pass(A, { force: true }));
  r.push = await refusal(() => H.eng.pushInbound(A, { kind: 'record', convId: C, eventId: 'ev-held-1', record: { vendorId: 'v-held-1', text: 'pushed while held', at: Date.now() } }));
  r.approve = await refusal(() => H.eng.approve(p.proposal.id));
  r.propose = await refusal(() => H.eng.propose(AGENT, A, C, { text: 'a reply while held' }));
  r.compose = await refusal(() => H.eng.compose(AGENT, A, { to: ['someone'], text: 'a new message while held' }));
  r.markRead = await refusal(() => H.eng.markRead(A, C));
  r.setPolicy = await refusal(() => H.eng.setPolicy(A, C, 'review'));
  r.outboxSame = fs.readFileSync(obFile, 'utf8') === ob0;
  r.state = ((H.eng.store.outbox.live().proposals || {})[p.proposal.id] || {}).state;
  r.sent = H.delivered.length;
  r.item = (H.userTodos.snapshot().open || []).filter((i) => /Channels paused: index\.json could not be read/.test(i.text)).map((i) => i.detail);
  { const tt = H.eng.digest({ scope: 'totals' }); r.totals = { needsMe: tt.needsMe, paused: tt.paused || null }; }   // the rail badge's own scope (word 8)
  // r566 #3: a migration whose engine door is refused while paused is recorded NOT RUN (its ledger holds no «done») — it runs at the next boot
  {
    const ledgerPath = path.join(W.dataDir, 'leg-migrations.json');
    const { runMigrations } = require(path.join(REPO, 'src/migration-runner.js'));
    try { await runMigrations({ ledgerPath, migrations: [{ id: 'leg-channel-credential-key', run: () => H.eng.stampCredentialKeys() }], log: () => {}, warn: () => {} }); } catch { }
    let led = {}; try { led = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { }
    r.migDone = !!(led.applied && led.applied['leg-channel-credential-key']);
  }
  try { await H.eng.stop?.(); } catch { }
  // the file reads again and VibeSpace starts again: everything is where it was
  fs.rmSync(ixFile, { recursive: true, force: true }); fs.writeFileSync(ixFile, good);
  const N = mkEngine({ name: `paused-${tag}`, engine: ENGmod });
  const a2 = await N.eng.approve(p.proposal.id);
  r.next = { ok: !!(a2 && a2.ok), state: a2 && a2.proposal && a2.proposal.state };
  try { await N.eng.stop?.(); } catch { }
  return r;
}
{
  const r = await pausedLegs(ENG, 'head');
  console.log(`    facts: ${JSON.stringify(r)}`);
  const refused = (x) => x === 'threw:store-blocked' || x === 'answer:store-blocked';
  ok(r.started === 1 && refused(r.pass), 'a start over an unreadable index.json: ONE «paused» line, no pass runs (no poll, no discovery, no vendor call)', JSON.stringify(r));
  ok(refused(r.push), 'a pushed message is refused BY NAME (store-blocked) — never taken as a duplicate later: the sender delivers it again', r.push);
  ok(refused(r.approve) && r.outboxSame && r.state === 'awaiting-approval' && r.sent === 0, 'approving a proposal that waited from before: refused BY NAME, the proposal NOT moved (still awaiting approval), outbox.json byte-identical, nothing sent', JSON.stringify(r));
  ok(refused(r.propose) && refused(r.compose), 'a reply and a new message while held: refused BY NAME (store-blocked), never «no such conversation»', JSON.stringify({ propose: r.propose, compose: r.compose }));
  ok(refused(r.markRead) && refused(r.setPolicy), 'an act on a conversation (read mark, policy): refused BY NAME, never «no such conversation»', JSON.stringify({ markRead: r.markRead, setPolicy: r.setPolicy }));
  ok(r.item.length === 1 && /delivered again only while its sender retries/.test(r.item[0]) && /restart VibeSpace to load it/.test(r.item[0]), 'For you says it: paused, a pushed message comes again only while its sender retries, and the act (restart once it reads)', JSON.stringify(r.item));
  ok(!!r.totals && !!r.totals.paused && Array.isArray(r.totals.paused.files) && r.totals.paused.files.includes('index.json'), 'B-f276 1b (word 8): the rail badge\'s TOTALS scope says paused — with the held file — never a bare 0 read as «nothing needs you»', JSON.stringify(r.totals));
  ok(r.next.ok && r.next.state === 'sent', 'the next start with the list readable: the waiting proposal is approvable and goes out — nothing was destroyed', JSON.stringify(r.next));
  ok(r.migDone === false, 'r566 #3: a migration whose engine door is refused while paused is recorded NOT RUN — the ledger holds no «done» for it (it runs at the next boot)', JSON.stringify({ migDone: r.migDone }));
  // A2 (主开发 r487): a SMALL family held — outbox.json — pauses the engine too, and the engine STARTS BY ITSELF once it reads (the
  // same start: nothing ran over the empty outbox). THE WALL: the files sweep never deletes a waiting proposal's folder.
  {
    const refusal = async (fn) => { try { const v = await fn(); return v && v.code ? `answer:${v.code}` : `answer:${JSON.stringify(v === undefined ? null : v).slice(0, 80)}`; } catch (e) { return `threw:${e && e.code}`; } };
    const W2 = mkEngine({ name: 'paused-outbox' });
    await prime(W2.eng);
    const p2 = await W2.eng.propose(AGENT, A, C, { text: 'a card with its files' });
    try { await W2.eng.stop?.(); } catch { }
    const chan2 = path.join(W2.dataDir, 'channels'), ob2 = path.join(chan2, 'outbox.json');
    const filesDir = path.join(chan2, 'outbox-files', p2.proposal.id);
    fs.mkdirSync(filesDir, { recursive: true }); fs.writeFileSync(path.join(filesDir, 'a.txt'), 'the attachment');
    const goodOb = fs.readFileSync(ob2, 'utf8');
    fs.rmSync(ob2); fs.mkdirSync(ob2); fs.writeFileSync(path.join(ob2, 'x'), 'x');   // the outbox's read fails at the next start
    const said2 = [];
    const H2 = mkEngine({ name: 'paused-outbox', log: { log() {}, error() {}, warn: (...a) => said2.push(a.join(' ')) } });
    const opened = await (async () => { H2.eng.start(); return said2.some((w) => /the channels are paused: outbox\.json could not be read/.test(w)); })();
    const sweep = await refusal(() => H2.eng.filesSweep());
    const kept1 = fs.existsSync(path.join(filesDir, 'a.txt'));
    const approve1 = await refusal(() => H2.eng.approve(p2.proposal.id));
    // the outbox reads again: the store takes it in, then the engine's SAME start runs by itself
    const starts0 = H2.eng.startedCount();
    fs.rmSync(ob2, { recursive: true, force: true }); fs.writeFileSync(ob2, goodOb);
    // THE ENGINE'S OWN START (r566 #5, the read's M2): its start-on-read ran — the counter of the starts, not a waiter of the leg's
    const end = Date.now() + 5000; while (H2.eng.startedCount() === starts0 && Date.now() < end) await new Promise((z) => setTimeout(z, 5));   // the bound is a red line, never the wait
    const started = H2.eng.startedCount() === starts0 + 1;
    const pz = H2.eng.pausedState();
    const sweep2 = await refusal(() => H2.eng.filesSweep());
    const kept2 = fs.existsSync(path.join(filesDir, 'a.txt'));
    const a3 = await H2.eng.approve(p2.proposal.id).catch((e) => ({ ok: false, code: e && e.code }));
    try { await H2.eng.stop?.(); } catch { }
    console.log(`    facts: outbox held — paused line ${opened}, sweep ${sweep}, kept ${kept1}, approve ${approve1} · read again — started ${started}, paused ${!!pz}, sweep ${sweep2}, kept ${kept2}, approve ${a3 && a3.ok ? a3.proposal.state : a3 && a3.code}`);
    ok(opened && refused(sweep) && kept1 && refused(approve1), 'A2: outbox.json held at a start (the list reads) — the channels PAUSED by it: the files sweep refused, the waiting card\'s folder KEPT, an approve refused by name', JSON.stringify({ opened, sweep, kept1, approve1 }));
    ok(started && !pz && kept2 && a3 && a3.ok && a3.proposal.state === 'sent', 'A2: …outbox.json reads again: the engine STARTS BY ITSELF (the same start), the folder is still there, the card approves and goes out', JSON.stringify({ started, pz, sweep2, kept2, a3: a3 && (a3.ok ? a3.proposal.state : a3.code) }));
  }
  // CONTROL (r566 #5): THE A2 WRAPPER — the start door classed «paused»: the wrapper swallows the start, its start-on-read never registers,
  // and after the outbox reads the engine never starts — red
  {
    const esrcS = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const ROW = esrcS.match(/^    start: \['allow', 'sync', '[^'\n]+'\],$/m);
    ok(!!ROW, 'CONTROL setup: the start row is where the control cuts it');
    if (ROW) {
      const { mutantCopies: mc2 } = await import('./mutant-copy.mjs');
      const A2 = mc2('channel-outbox-a2-start', REPO).load('src/server/channels-engine.js', editAnchor(esrcS, ROW[0], "    start: ['paused', 'sync', 'the A2 row'],", "src/server/channels-engine.js"), 'a2-start-paused');
      const W3 = mkEngine({ name: 'a2-start', engine: A2 });
      await prime(W3.eng); await W3.eng.propose(AGENT, A, C, { text: 'a card' }); try { await W3.eng.stop?.(); } catch { }   // B-f276 1b: an outbox file to hold (the missing law writes no untouched family)
      const ob3 = path.join(W3.dataDir, 'channels', 'outbox.json'); const good3 = fs.readFileSync(ob3, 'utf8');
      fs.rmSync(ob3); fs.mkdirSync(ob3); fs.writeFileSync(path.join(ob3, 'x'), 'x');
      const H3 = mkEngine({ name: 'a2-start', engine: A2 });
      H3.eng.start();
      fs.rmSync(ob3, { recursive: true, force: true }); fs.writeFileSync(ob3, good3);
      const end3 = Date.now() + 1500; while (H3.eng.pausedState() && Date.now() < end3) await new Promise((z) => setTimeout(z, 5));   // the outbox taken in (bounded)
      const s3 = H3.eng.startedCount();
      try { await H3.eng.stop?.(); } catch { }
      ok(!H3.eng.pausedState() && s3 === 0, 'CONTROL (the A2 wrapper: the start classed «paused»): the outbox reads, the pause lifts — and the engine NEVER starts (no tick, no poll for the rest of the life) — red', JSON.stringify({ paused: H3.eng.pausedState(), starts: s3 }));
    }
  }
  // THE CENSUS: every door of the engine is a row of HELD_DOORS (paused / refused / read / none) — a door without a row is red
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const blk = (esrc.split('  const HELD_DOORS = {\n')[1] || '').split('\n  };\n')[0] || '';
  const rows = new Map([...blk.matchAll(/^    ([A-Za-z_$][\w$]*): \['(allow|paused|refused|read|none)', '(async|sync|const)', '([^'\n]+)'\],/gm)].map((m) => [m[1], { cls: m[2], kind: m[3], why: m[4] }]));
  const E = mkEngine({ name: 'paused-census' });
  const keys = Object.keys(E.eng);
  try { await E.eng.stop?.(); } catch { }
  const noRow = keys.filter((k) => !rows.has(k)), stale = [...rows.keys()].filter((k) => !keys.includes(k));
  const kinds = keys.filter((k) => rows.has(k) && (typeof E.eng[k] === 'function') !== (rows.get(k).kind !== 'const'));
  console.log(`    census: ${keys.length} doors — ${['allow', 'paused', 'refused'].map((c) => `${c} ${[...rows.values()].filter((x) => x.cls === c).length}`).join(', ')}`);
  // A3 (主开发 r566 #7): THE ALLOW LIST IS THE CENSUS — deny by default: no read / none rows left, every allow row says what it answers
  ok([...rows.values()].every((x) => ['allow', 'paused', 'refused'].includes(x.cls)) && [...rows.entries()].filter(([, x]) => x.cls === 'allow' && x.kind !== 'const').every(([, x]) => x.why.length > 20), 'A3: every door is ALLOWED (with what it answers when the reply depends on a held file), PAUSED or REFUSED — nothing in between', JSON.stringify([...rows.entries()].filter(([, x]) => !['allow', 'paused', 'refused'].includes(x.cls)).map(([k]) => k)));
  ok(rows.size > 100 && !noRow.length && !stale.length && !kinds.length, `THE CENSUS: every door of the engine (${keys.length}) is a row of HELD_DOORS with its class and its why; none without a row, none stale, the kind matches`, JSON.stringify({ noRow, stale, kinds }));
  // THE CALLERS' CENSUS (主开发 r596; A3's read must 5 — the raw-API agent routes called refused SYNC doors with no try: a bare 500, a
  // hang): EVERY call of a REFUSED door from OUTSIDE the engine (routes, the raw API, the wiring, migrations, search, apps) is a ROW —
  // inside a try whose catch answers by name (fail / chanFail / the paused code), a promise chain that does, or after a pausedState()
  // ask. A caller added later without either is red, by its file and line. Static, over the tracked tree; printed.
  const { spawnSync: spawnC } = await import('node:child_process');
  const REFUSED = [...rows.entries()].filter(([, x]) => x.cls === 'refused').map(([k]) => k);
  const ENGINE_OWN = new Set(['src/server/channels-engine.js', 'src/server/channels-access.js', 'src/server/channels-outbound.js', 'src/server/channels-auth.js', 'src/channel-store.js']);
  const RECV = String.raw`engine\(\)|getChannels\(\)|deps\.channels|\beng|\bchannels|\bchEng`;
  const DOORS_ALT = [...REFUSED].sort((a, b) => b.length - a.length).join('|');
  // a file's own ALIASES of the engine (`const e = eng()` — the raw API's shape): each one is a receiver too
  const aliasRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:engine|eng|getChannels|channels|chEng)\(\)/g;
  const callReOf = (text) => new RegExp(`(?:${[RECV, ...new Set([...text.matchAll(aliasRe)].map((m) => String.raw`\b` + m[1].replace(/\$/g, '\\$')))].join('|')})\\??\\.(${DOORS_ALT})\\(`, 'g');
  const HANDLED = /\b(fail|chanFail|pausedRefused|pausedOf|answerPaused)\(\s*res\s*,\s*\w+\s*\)|store-blocked|\.paused\b|pausedAnswer|pausedError/;
  // the text with every string, template and comment BLANKED (same length — the indexes stand): braces are counted on code only
  const blank = (t) => { let out = '', q = null, blk = false, line = false; for (let i = 0; i < t.length; i++) { const c = t[i], n = t[i + 1]; if (c === '\n') { line = false; if (q && q !== '`') q = null; out += '\n'; continue; } if (line) { out += ' '; continue; } if (blk) { if (c === '*' && n === '/') { blk = false; out += '  '; i++; } else out += ' '; continue; } if (q) { if (c === '\\') { out += '  '; i++; continue; } if (c === q) { q = null; out += c; } else out += ' '; continue; } if (c === '/' && n === '/') { line = true; out += ' '; continue; } if (c === '/' && n === '*') { blk = true; out += ' '; continue; } if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; } out += c; } return out; };
  const closeOf = (B, open) => { let d = 0; for (let i = open; i < B.length; i++) { if (B[i] === '{') d++; else if (B[i] === '}') { d--; if (!d) return i; } } return -1; };
  function guardOf(text, B, at) {
    // the enclosing TRY whose catch answers by name
    let depth = 0;
    for (let i = at - 1; i >= 0; i--) {
      if (B[i] === '}') { depth++; continue; }
      if (B[i] !== '{') continue;
      if (depth) { depth--; continue; }
      if (/\btry\s*$/.test(B.slice(Math.max(0, i - 12), i))) {
        const end = closeOf(B, i); const m = end > 0 ? /^\s*catch\s*(?:\(\s*\w+\s*\))?\s*\{/.exec(B.slice(end + 1, end + 200)) : null;
        if (m) { const cOpen = end + 1 + m[0].length - 1, cEnd = closeOf(B, cOpen); if (cEnd > 0 && HANDLED.test(text.slice(cOpen, cEnd + 1))) return 'try'; }
      }
    }
    // a promise chain that answers by name
    if (/^[^;]{0,400}?(\.catch\(|\.then\([^;]*,\s*\(?\s*\w+\s*\)?\s*=>)[^;]{0,200}?(fail|chanFail|pausedRefused|store-blocked)/.test(text.slice(at, at + 700).replace(/\n/g, ' '))) return 'promise';
    // a pausedState() ask before it, in the same handler (from its route / function head)
    const head = Math.max(B.lastIndexOf('\nrouter.', at), B.lastIndexOf('\nfunction ', at), B.lastIndexOf('\nasync function ', at), B.lastIndexOf('\n  function ', at), B.lastIndexOf('\n  async function ', at), B.lastIndexOf('\napp.', at));
    if (head >= 0 && /pausedState\(\)|\bpausedRefused\(res\)/.test(B.slice(head, at))) return 'paused-ask';
    return null;
  }
  // a call inside a LAMBDA (`const makeR = () => eng.propose(…)`) is guarded where the lambda RUNS: every use of its name must be
  const lambdaGuard = (text, B, at) => {
    const ls = B.lastIndexOf('\n', at) + 1;
    const m = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*$/.exec(B.slice(ls, at));
    if (!m) return null;
    const uses = [...B.matchAll(new RegExp(String.raw`\b${m[1]}\(\)|\bmake:\s*${m[1]}\b`, 'g'))].map((u) => u.index);
    return uses.length && uses.every((u) => guardOf(text, B, u)) ? 'lambda' : null;
  };
  // rows a census cannot read as code, each with its reason (a NEW unguarded call has none: red) — `file:door`, or a whole file
  const EXCEPT = {
    'src/agent-routes.js:reachCountFor': 'the prompt hook\'s reach hint (a line injected into a prompt, never an answer): silent while paused; the agent\'s own reads are refused by name',
    'src/agent-routes.js:connectTaught': 'the same reach hint line (connect taught)',
    'src/agent-routes.js:signinExpiredFor': 'the same reach hint line (dead sign-ins named)',
    'src/agent-routes.js:connectOffers': 'a decoration of `channels list` AFTER its listFor, which refuses by name first — never reached while paused',
    'src/agent-routes.js:accessFor': 'a decoration of `channels status` AFTER its statusFor, which refuses by name first — never reached while paused',
    'src/routes/channels.js:wakeHeldAt': 'the watch gate\'s answer: a throw reads «held, unknown» — unknown never wakes (the conservative answer, said)',
    'src/routes/webhook.js:refreshConvCaps': 'syncRow: run only by owner routes that ask pausedRefused first (webhook.js), after an index write that refuses while held',
    'src/routes/webhook.js:notify': 'syncRow: the same — after the refused index write',
    'src/server/migrations.js': 'a migration\'s run: a refused door THROWS, the shared runner records the run failed by its words and runs it at the next start (word 3 — §P\'s «recorded NOT RUN» leg)',
    'src/server/channel-api.js': 'the raw API\'s own engine calls: every caller of rawApi() outside it is a row of the SECOND TIER below and answers the pause by name',
  };
  function callersCensus(over = {}) {
    const files = spawnC('git', ['ls-files', 'src', 'server.js'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n').filter((f) => f.endsWith('.js') && !ENGINE_OWN.has(f) && !f.startsWith('src/lib/') && !f.startsWith('src/channels/'));
    const sites = [], bare = [];
    for (const f of files) {
      const text = Object.hasOwn(over, f) ? over[f] : fs.readFileSync(path.join(REPO, f), 'utf8');
      const callRe = callReOf(text);
      if (!callRe.test(text)) continue;
      const B = blank(text);
      for (const m of B.matchAll(callReOf(text))) {
        const line = B.slice(0, m.index).split('\n').length, key = `${f}:${m[1]}`;
        const g = guardOf(text, B, m.index) || lambdaGuard(text, B, m.index) || (Object.hasOwn(EXCEPT, key) || Object.hasOwn(EXCEPT, f) ? 'except' : null);
        sites.push({ f, line, door: m[1], g });
        if (!g) bare.push(`${f}:${line} ${m[1]}`);
      }
    }
    // THE SECOND TIER: the raw API (src/server/channel-api.js) calls refused doors itself — so every call of its object from outside
    for (const f of files) {
      if (f === 'src/server/channel-api.js') continue;
      const text = Object.hasOwn(over, f) ? over[f] : fs.readFileSync(path.join(REPO, f), 'utf8');
      const al = [...new Set([...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*rawApi\(\)/g)].map((m) => m[1]))];
      const rawRe = new RegExp(`(?:rawApi\\(\\)${al.map((a) => String.raw`|\b` + a).join('')})\\.([A-Za-z_$][\\w$]*)\\(`, 'g');
      if (!rawRe.test(text)) continue;
      const B = blank(text);
      for (const m of B.matchAll(new RegExp(rawRe.source, 'g'))) {
        const line = B.slice(0, m.index).split('\n').length;
        const g = guardOf(text, B, m.index) || lambdaGuard(text, B, m.index);
        sites.push({ f, line, door: 'raw:' + m[1], g });
        if (!g) bare.push(`${f}:${line} raw:${m[1]}`);
      }
    }
    return { sites, bare, files: new Set(sites.map((s) => s.f)).size };
  }
  const cc = callersCensus();
  const by = (g) => cc.sites.filter((s) => s.g === g).length;
  console.log(`    the callers' census: ${REFUSED.length} refused doors; ${cc.sites.length} outside calls in ${cc.files} files — ${by('try')} in a try that answers by name, ${by('promise')} in a promise chain that does, ${by('paused-ask')} behind a pause ask, ${by('lambda')} in a lambda run inside one, ${by('except')} excepted with a reason (${Object.keys(EXCEPT).length} rows)`);
  ok(cc.sites.length > 20 && !cc.bare.length, `THE CALLERS' CENSUS: every outside call of a refused door answers the pause BY NAME (a try, a promise chain or a pausedState ask) — none bare`, cc.bare.join(' · '));
  // B-f276 1b (A3's read, should 2): the webhook paths list reads each path's options from the list — while paused it asks first
  ok(/router\.get\('\/api\/channels\/webhook\/paths', \(req, res\) => \{ if \(!owner\(req, res\)\) return; if \(pausedRefused\(res\)\) return;/.test(fs.readFileSync(path.join(REPO, 'src/routes/webhook.js'), 'utf8')), 'PIN (B-f276 1b): the webhook paths list asks the pause before it reads its options off the list (never the defaults shown as the truth)');
  // CONTROL: a planted bare call of a refused SYNC door (the raw API's shape before the cure) — red by its file and line
  const AR = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const planted = callersCensus({ 'src/agent-routes.js': `${AR}\nfunction plantedBare(cid) { return getChannels().apiAccounts(cid); }\n` });
  ok(planted.bare.length === 1 && /^src\/agent-routes\.js:\d+ apiAccounts$/.test(planted.bare[0]), 'CALLERS\' CENSUS CONTROL: a planted bare call of a refused door (no try, no pausedState ask) is red BY ITS FILE AND LINE', planted.bare.join(' · '));
  // THE INNER GUARDS — the roads that bypass the API (a kick timer, a sign-in's landing, setOptions → the inner pass; the push lanes'
  // sync; a live lane's event; the tick): PINNED here (no fast road drives them while held — said in the line)
  {
    const inner = [
      [/async function pass\(adapterId, \{ force = false, origin = 'timer' \} = \{\}\) \{\n\s+if \(indexHeld\(\)\) \{ sayPaused\(\); return pausedAnswer\(\); \}/, 'the inner pass'],
      [/async function syncPushLanes\(\) \{\n\s+if \(indexHeld\(\)\) return;/, 'the push lanes\' sync'],
      [/async function onPushEvent\(rec, e, ev\) \{\n\s+if \(indexHeld\(\)\) throw pausedError\(\);[^\n]*\n\s+const p = pushRow\(rec\);/, 'a live lane\'s event, BEFORE its seen-mark'],
      [/function tick\(\) \{\n\s+if \(stopped \|\| indexHeld\(\)\) return;/, 'the tick'],
    ];
    const esrc0 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const missing = inner.filter(([re]) => !re.test(esrc0)).map(([, n]) => n);
    ok(!missing.length, `the inner guards stand at the top of each road that bypasses the API (${inner.map(([, n]) => n).join(', ')})`, missing.join(', '));
  }
  // CONTROL: the gate cut (the API not wrapped, the start and the tick not paused) — today's half-blind engine
  const src = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const CUTS = [["\n  return pauseDoors({\n", "\n  return ({\n"], ["    if (indexHeld()) {   // B-f276: no tick, no boot pass, no push lane", "    if (false) {   // B-f276: no tick, no boot pass, no push lane"]];
  ok(CUTS.every(([from]) => src.split(from).length === 2), 'CONTROL setup: the gate is where the control cuts it');
  const { mutantCopies: mcOf } = await import('./mutant-copy.mjs');
  const MC = mcOf('channel-outbox-paused', REPO);
  const cut = MC.load('src/server/channels-engine.js', CUTS.reduce((t, [a, b]) => editAnchor(t, a, b, "src/server/channels-engine.js"), src), 'paused-gate-cut');
  const c = await pausedLegs(cut, 'cut');
  { const TOT = "    if (!keys && scope === 'totals') return { ...totalsNow(t), scope: 'totals', at: t, paused: indexHeld() ? pausedFacts() : null };";
    const { anchored: anchoredT } = await import('./scratch.mjs');
    const tc = await pausedLegs(MC.load('src/server/channels-engine.js', anchoredT(src, TOT, "    if (!keys && scope === 'totals') return { ...totalsNow(t), scope: 'totals', at: t };", 'the totals scope without paused'), 'totals-no-paused'), 'totals-cut');   // stale-pins: kept — the cut's own text (the totals scope as A3 had it)
    ok(!tc.totals || !tc.totals.paused, 'TOTALS CONTROL (the badge scope without «paused», as A3): the rail reads a bare 0 while paused — red', JSON.stringify(tc.totals)); }
  ok(c.migDone === true, 'CONTROL (the gate cut): the same migration runs over the empty held list and is recorded DONE for good — red', JSON.stringify({ migDone: c.migDone }));
  ok(!refused(c.approve) && c.state !== 'awaiting-approval' && !refused(c.propose), 'CONTROL (the gate cut — today\'s engine over a held list): the waiting proposal is moved out of «awaiting approval» and the reply is answered «no such conversation» — red', JSON.stringify({ approve: c.approve, state: c.state, propose: c.propose }));
}

console.log('§SPLIT (B-54a9, 主开发 r4755) — the moved sections stand in their twins, once each, never here');
{
  // THE PIN IN THE OLD FILE: §5v2 and §5v3 moved word for word to test-channel-outbox-stash, §6 r6 verify to test-channel-outbox-card,
  // the three suites over ONE world (scripts/channel-outbox-world.mjs). A section header written back here, or lost from its twin, is red by name
  const read = (f) => fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8');
  const MOVED = { 'test-channel-outbox-stash.mjs': ["console.log('§5v2 verify round 2", "console.log('§5v3 verify round 3"], 'test-channel-outbox-card.mjs': ["console.log('§6 r6 verify"] };
  const count = (t, h) => t.split('\n').filter((l) => l.startsWith(h)).length;
  const judge = (self) => Object.entries(MOVED).flatMap(([f, hs]) => hs.filter((h) => count(read(f), h) !== 1 || count(self, h) !== 0).map((h) => `${f}: ${h}`));
  const self = read('test-channel-outbox.mjs'), bad = judge(self);
  ok(bad.length === 0, 'B-54a9 THE SPLIT: every moved section stands once in its twin and never in this file (§5v2 §5v3 in test-channel-outbox-stash; §6 r6 verify in test-channel-outbox-card)', JSON.stringify(bad));
  const planted = judge(self + "\nconsole.log('§6 r6 verify (planted back)');");
  ok(planted.length === 1 && /^test-channel-outbox-card\.mjs: console\.log\('§6 r6 verify/.test(planted[0]), 'RED control: the same check over this file with §6 r6\'s header written back reads that one section red, by name', JSON.stringify(planted));
  ok(['test-channel-outbox.mjs', 'test-channel-outbox-stash.mjs', 'test-channel-outbox-card.mjs'].every((f) => /^import \{[^}]*\} from '\.\/channel-outbox-world\.mjs';/m.test(read(f))),
    'the three suites import the ONE world, scripts/channel-outbox-world.mjs — none builds a copy of its own');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
