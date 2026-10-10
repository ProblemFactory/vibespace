#!/usr/bin/env node
// test-webhook-reply — WHO A WEBHOOK REPLY GOES TO (lane webhook-l1-server, docs/design-webhook.zh.md §7): `reply --to
// <record id>` ⇒ that record's author caller (a record of another path / none ⇒ not-found reply-anchor-elsewhere; a
// revoked caller ⇒ send-not-available naming the live ones); no anchor ⇒ the one caller, several ⇒ ambiguous-caller
// listing them; `compose --caller <id>[,<id>]|all` ⇒ one proposal per caller, `delivery: none` refused by name,
// COMPOSE_MAX_RECIPIENTS the ceiling. §2 the adapter's own doors (replyEnvelope / prepareSend / send) re-read the caller
// at send time. Fast, PURE + the adapter over a scratch callers file. Run: node scripts/test-webhook-reply.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const RP = require('../src/webhook-reply.js');
const WH = require('../src/channels/webhook.js');
const { COMPOSE_MAX_RECIPIENTS } = require('../src/channel-policy.js');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + JSON.stringify(d).slice(0, 500) : '')); } };
const J = JSON.stringify;
const C = (id, mode, x = {}) => ({ id, name: 'n-' + id.slice(-2), delivery: { mode }, ...x });
const callers = [C('c-000000a1', 'poll'), C('c-000000a2', 'reply-url'), C('c-000000a3', 'none'), C('c-000000a4', 'poll', { revokedAt: 1 })];
const rec = (id, conv = 'ci') => ({ convId: conv, vendorId: 'v-' + id, author: { id: 'caller:' + id } });

console.log('§1 the PURE decision');
ok(RP.replyTarget({ anchor: rec('c-000000a2'), anchorId: 'v', convId: 'ci', callers }).caller.id === 'c-000000a2', 'reply --to <record> ⇒ that record\'s author caller (never a caller the text names)');
const els = RP.replyTarget({ anchor: rec('c-000000a2', 'other'), anchorId: 'v', convId: 'ci', callers });
ok(els.code === 'not-found' && els.why === 'reply-anchor-elsewhere' && RP.replyTarget({ anchor: null, anchorId: 'v', convId: 'ci', callers }).why === 'reply-anchor-elsewhere', 'a record of another path, or none ⇒ not-found (reply-anchor-elsewhere)');
const rv = RP.replyTarget({ anchor: rec('c-000000a4'), anchorId: 'v', convId: 'ci', callers });
ok(rv.code === 'send-not-available' && rv.why === 'caller-revoked' && rv.error.includes('c-000000a1') && !rv.error.includes('c-000000a4 ('), 'a revoked author ⇒ send-not-available, naming the LIVE callers', rv.error);
ok(RP.replyTarget({ anchor: rec('c-000000a3'), anchorId: 'v', convId: 'ci', callers }).why === 'delivery-none', 'an author whose delivery is none ⇒ refused by name');
const amb = RP.replyTarget({ implicit: true, convId: 'ci', callers });
ok(amb.code === 'bad-proposal' && amb.why === 'ambiguous-caller' && amb.callers.length === 3 && ['c-000000a1', 'c-000000a2', 'c-000000a3'].every((id) => amb.error.includes(id)), 'no --to on a path of several callers ⇒ ambiguous-caller, listing them (nothing is sent)');
ok(RP.replyTarget({ implicit: true, convId: 'ci', callers: [callers[0], callers[3]] }).caller.id === 'c-000000a1' && RP.replyTarget({ implicit: true, convId: 'ci', callers: [] }).why === 'no-caller', 'no --to on a one-caller path ⇒ that caller (control); no caller ⇒ refused');
const all = RP.composeTargets({ spec: 'all', callers });
ok(all.ok && J(all.callers.map((c) => c.id)) === J(['c-000000a1', 'c-000000a2']) && J(all.skipped.map((c) => c.id)) === J(['c-000000a3']), 'compose --caller all ⇒ every live caller that takes replies (one proposal each); a none caller is skipped and SAID');
ok(RP.composeTargets({ spec: 'c-000000a2,c-000000a1,c-000000a2', callers }).callers.length === 2, 'compose --caller a,b ⇒ each named caller once');
ok(RP.composeTargets({ spec: 'c-000000a3', callers }).why === 'delivery-none' && RP.composeTargets({ spec: 'c-000000a4', callers }).why === 'caller-revoked' && RP.composeTargets({ spec: 'c-0000dead', callers }).why === 'unknown-caller' && RP.composeTargets({ spec: '', callers }).why === 'caller-required', 'a named none caller, a revoked one, an unknown one, none named ⇒ each refused BY NAME');
const many = Array.from({ length: COMPOSE_MAX_RECIPIENTS + 1 }, (_, i) => C('c-' + String(i).padStart(8, '0'), 'poll'));
ok(RP.composeTargets({ spec: 'all', callers: many }).why === 'too-many' && RP.composeTargets({ spec: 'all', callers: many.slice(1) }).ok, `COMPOSE_MAX_RECIPIENTS (${COMPOSE_MAX_RECIPIENTS}) is the ceiling (control: exactly ${COMPOSE_MAX_RECIPIENTS} pass)`);
ok(J(RP.envelopeOf({ anchorId: 'v-1', callerId: 'c-000000a1', recordVendorId: 'v-1' })) === J({ anchorId: 'v-1', to: 'c-000000a1', subject: '', inReplyTo: 'v-1' }), 'the envelope: to = the caller id, inReplyTo = the answered record (never on the wire — the caller gets its receipt id)');

console.log('§2 the adapter\'s doors (a scratch callers file)');
const dir = scratch('webhook-reply');
try {
  const secrets = { seal: (v) => 'S' + Buffer.from(v).toString('hex'), open: (v) => Buffer.from(String(v).slice(1), 'hex').toString() };
  const st = WH.callersStore(dir, { secrets });
  st.putPath('ci', { title: 'CI' });
  const a = st.register('ci', { name: 'alpha', auth: 'hmac', delivery: { mode: 'poll' } });
  const b = st.register('ci', { name: 'beta', auth: 'bearer', delivery: { mode: 'poll' } });
  const store = new Map([['v-a', { id: 'webhook:ci:v-a', convId: 'ci', vendorId: 'v-a', author: { id: 'caller:' + a.caller.id } }]]);
  const ad = WH.create({ id: 'webhook' }, { ownDir: dir, secrets, findRecord: (conv, vid) => (conv === 'ci' ? store.get(vid) || null : null) });
  const env = await ad.replyEnvelope('ci', { anchorId: 'v-a' });
  ok(env.to === a.caller.id && env.inReplyTo === 'v-a', 'replyEnvelope(--to v-a) ⇒ to alpha (the record\'s author)');
  let err = null; try { await ad.replyEnvelope('ci', { anchorId: 'v-a', implicit: true }); } catch (e) { err = e; }
  ok(err && err.detail && err.detail.why === 'ambiguous-caller' && err.detail.named === true && err.detail.callers.length === 2, 'replyEnvelope(implicit) on two callers ⇒ a NAMED ambiguous-caller refusal the engine passes through by name');
  const pr = await ad.prepareSend('ci', { text: 'hi', recipients: 'all' });
  ok(J(pr.recipients.sort()) === J([a.caller.id, b.caller.id].sort()) && pr.notifies.length === 2, 'prepareSend(recipients: all) ⇒ both callers, by id');
  const s1 = await ad.send('ci', { text: 'first', idemKey: 'p-1', envelope: env });
  ok(s1.ok && s1.vendorMessageId.startsWith(`${a.caller.id}:`) && /^c-[0-9a-f]{8}:[0-9a-f]{16}$/.test(s1.vendorMessageId) && !s1.vendorMessageId.includes('p-1') && s1.lane === 'poll', 'send ⇒ queued for alpha\'s poll — `sent`, vendorMessageId = replyId (<callerId>:<HMAC(key, reply:<proposalId>)[:16]> — int248 r2, verify r1 #0: no outbox counter)');
  const q = WH.pollAnswer(st, 'ci', st.caller('ci', a.caller.id), '', Date.now());
  ok(q.replies.length === 1 && q.replies[0].text === 'first' && q.replies[0].from.name === 'VibeSpace' && /^[0-9a-f]{16}$/.test(q.replies[0].inReplyTo) && J(Object.keys(q)) === J(['ok', 'replies', 'cursor', 'dropped']), 'alpha\'s poll: its reply, from the path\'s replyName, inReplyTo = alpha\'s OWN receipt id (16 hex), nothing internal');
  ok(WH.pollAnswer(st, 'ci', st.caller('ci', b.caller.id), '', Date.now()).replies.length === 0 && WH.pollAnswer(st, 'ci', st.caller('ci', b.caller.id), q.cursor, Date.now()) === null, 'beta sees none of alpha\'s replies, and alpha\'s cursor is not beta\'s (refused)');
  st.rotate('ci', a.caller.id);
  const s2 = await ad.send('ci', { text: 'after rotate', idemKey: 'p-2', envelope: env });
  ok(s2.ok, 'a ROTATED caller is re-read at send time (its new key) — still delivered');
  st.revoke('ci', a.caller.id);
  const s3 = await ad.send('ci', { text: 'after revoke', idemKey: 'p-3', envelope: env });
  ok(!s3.ok && s3.code === 'not-found' && s3.detail.why === 'caller-revoked', 'a REVOKED caller is re-read at send time ⇒ not-found (nothing queued)');
  let err2 = null; try { await ad.replyEnvelope('ci', { anchorId: 'v-a' }); } catch (e) { err2 = e; }
  ok(err2 && err2.detail.why === 'caller-revoked' && err2.message.includes('beta'), 'reply --to a record of a revoked caller ⇒ refused, naming the live caller (beta)');
  st.setDelivery('ci', b.caller.id, { mode: 'none' });
  let err3 = null; try { await ad.prepareSend('ci', { text: 'x', recipients: b.caller.id }); } catch (e) { err3 = e; }
  ok(err3 && err3.detail.why === 'delivery-none', 'compose --caller <a none caller> ⇒ refused by name');
  ok((await ad.reconcile()).unknown === true, 'reconcile ⇒ {unknown: true} (no caller-side lookup; a person re-sends)');
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
