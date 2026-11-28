#!/usr/bin/env node
// test-webhook-reply — WHO A WEBHOOK REPLY GOES TO (lane webhook-l1-server, docs/design-webhook.zh.md §7): `reply --to
// <record id>` ⇒ that record's author caller (a record of another path / none ⇒ not-found reply-anchor-elsewhere; a
// revoked caller ⇒ send-not-available naming the live ones); no anchor ⇒ the one caller, several ⇒ ambiguous-caller
// listing them; `compose --caller <id>[,<id>]|all` ⇒ one proposal per caller, `delivery: none` refused by name,
// COMPOSE_MAX_RECIPIENTS the ceiling. §2 the adapter's own doors (replyEnvelope / prepareSend / send) re-read the caller
// at send time. Fast, PURE + the adapter over a scratch callers file. Run: node scripts/test-webhook-reply.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const RP = require('../src/webhook-reply.js');
const WH = require('../src/channels/webhook.js');
const { COMPOSE_MAX_RECIPIENTS } = require('../src/channel-policy.js');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + JSON.stringify(d).slice(0, 500) : '')); } };
const J = JSON.stringify;
const C = (id, mode, x = {}) => ({ id, name: 'n-' + id.slice(-2), delivery: { mode }, ...x });
const callers = [C('c-000000a1', 'poll'), C('c-000000a2', 'reply-url'), C('c-000000a3', 'none'), C('c-000000a4', 'poll', { revokedAt: 1 })];
const rec = (id, conv = 'ci') => ({ convId: conv, vendorId: 'v-' + id, author: { id: 'caller:' + id } });

console.log('§1 the PURE decision');
ok(RP.replyTarget({ anchor: rec('c-000000a2'), anchorId: 'v', convId: 'ci', callers }).caller.id === 'c-000000a2', 'reply --to <record> ⇒ that record\'s author caller (never a caller the text names)');
const els = RP.replyTarget({ anchor: rec('c-000000a2', 'other'), anchorId: 'v', convId: 'ci', callers });
ok(els.code === 'not-found' && els.why === 'reply-anchor-elsewhere' && RP.replyTarget({ anchor: null, anchorId: 'v', convId: 'ci', callers }).why === 'reply-anchor-elsewhere', 'a record of another path, or none ⇒ not-found (reply-anchor-elsewhere)');
const rv = RP.replyTarget({ anchor: rec('c-000000a4'), anchorId: 'v', convId: 'ci', callers });
ok(rv.code === 'send-not-available' && rv.why === 'caller-revoked' && gateOf(rv.error.includes('c-000000a1')) && !rv.error.includes('c-000000a4 ('), 'a revoked author ⇒ send-not-available, naming the LIVE callers', rv.error);
ok(RP.replyTarget({ anchor: rec('c-000000a3'), anchorId: 'v', convId: 'ci', callers }).why === 'delivery-none', 'an author whose delivery is none ⇒ refused by name');
const amb = RP.replyTarget({ implicit: true, convId: 'ci', callers });
ok(amb.code === 'bad-proposal' && amb.why === 'ambiguous-caller' && amb.callers.length === 3 && verdictOf(['c-000000a1', 'c-000000a2', 'c-000000a3'].every((id) => amb.error.includes(id))), 'no --to on a path of several callers ⇒ ambiguous-caller, listing them (nothing is sent)');
ok(RP.replyTarget({ implicit: true, convId: 'ci', callers: [callers[0], callers[3]] }).caller.id === 'c-000000a1' && RP.replyTarget({ implicit: true, convId: 'ci', callers: [] }).why === 'no-caller', 'no --to on a one-caller path ⇒ that caller (control); no caller ⇒ refused');
const all = RP.composeTargets({ spec: 'all', callers });
ok(gateOf(all.ok) && J(all.callers.map((c) => c.id)) === J(['c-000000a1', 'c-000000a2']) && J(all.skipped.map((c) => c.id)) === J(['c-000000a3']), 'compose --caller all ⇒ every live caller that takes replies (one proposal each); a none caller is skipped and SAID');
ok(RP.composeTargets({ spec: 'c-000000a2,c-000000a1,c-000000a2', callers }).callers.length === 2, 'compose --caller a,b ⇒ each named caller once');
ok(RP.composeTargets({ spec: 'c-000000a3', callers }).why === 'delivery-none' && RP.composeTargets({ spec: 'c-000000a4', callers }).why === 'caller-revoked' && RP.composeTargets({ spec: 'c-0000dead', callers }).why === 'unknown-caller' && RP.composeTargets({ spec: '', callers }).why === 'caller-required', 'a named none caller, a revoked one, an unknown one, none named ⇒ each refused BY NAME');
const many = Array.from({ length: COMPOSE_MAX_RECIPIENTS + 1 }, (_, i) => C('c-' + String(i).padStart(8, '0'), 'poll'));
ok(RP.composeTargets({ spec: 'all', callers: many }).why === 'too-many' && verdictOf(RP.composeTargets({ spec: 'all', callers: many.slice(1) }).ok), `COMPOSE_MAX_RECIPIENTS (${COMPOSE_MAX_RECIPIENTS}) is the ceiling (control: exactly ${COMPOSE_MAX_RECIPIENTS} pass)`);
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
  ok(gateOf(err) && gateOf(err.detail) && err.detail.why === 'ambiguous-caller' && err.detail.named === true && err.detail.callers.length === 2, 'replyEnvelope(implicit) on two callers ⇒ a NAMED ambiguous-caller refusal the engine passes through by name');
  const pr = await ad.prepareSend('ci', { text: 'hi', recipients: 'all' });
  ok(J(pr.recipients.sort()) === J([a.caller.id, b.caller.id].sort()) && pr.notifies.length === 2, 'prepareSend(recipients: all) ⇒ both callers, by id');
  const s1 = await ad.send('ci', { text: 'first', idemKey: 'p-1', envelope: env });
  ok(gateOf(s1.ok) && gateOf(s1.vendorMessageId.startsWith(`${a.caller.id}:`)) && gateOf(/^c-[0-9a-f]{8}:[0-9a-f]{16}$/.test(s1.vendorMessageId)) && !s1.vendorMessageId.includes('p-1') && s1.lane === 'poll', 'send ⇒ queued for alpha\'s poll — `sent`, vendorMessageId = replyId (<callerId>:<HMAC(key, reply:<proposalId>)[:16]> — int248 r2, verify r1 #0: no outbox counter)');
  const q = WH.pollAnswer(st, 'ci', st.caller('ci', a.caller.id), '', Date.now());
  ok(q.replies.length === 1 && q.replies[0].text === 'first' && q.replies[0].from.name === 'VibeSpace' && gateOf(/^[0-9a-f]{16}$/.test(q.replies[0].inReplyTo)) && J(Object.keys(q)) === J(['ok', 'replies', 'cursor', 'dropped']), 'alpha\'s poll: its reply, from the path\'s replyName, inReplyTo = alpha\'s OWN receipt id (16 hex), nothing internal');
  ok(WH.pollAnswer(st, 'ci', st.caller('ci', b.caller.id), '', Date.now()).replies.length === 0 && WH.pollAnswer(st, 'ci', st.caller('ci', b.caller.id), q.cursor, Date.now()) === null, 'beta sees none of alpha\'s replies, and alpha\'s cursor is not beta\'s (refused)');
  st.rotate('ci', a.caller.id);
  const s2 = await ad.send('ci', { text: 'after rotate', idemKey: 'p-2', envelope: env });
  ok(verdictOf(s2.ok), 'a ROTATED caller is re-read at send time (its new key) — still delivered');
  st.revoke('ci', a.caller.id);
  const s3 = await ad.send('ci', { text: 'after revoke', idemKey: 'p-3', envelope: env });
  ok(!s3.ok && s3.code === 'not-found' && s3.detail.why === 'caller-revoked', 'a REVOKED caller is re-read at send time ⇒ not-found (nothing queued)');
  let err2 = null; try { await ad.replyEnvelope('ci', { anchorId: 'v-a' }); } catch (e) { err2 = e; }
  ok(gateOf(err2) && err2.detail.why === 'caller-revoked' && verdictOf(err2.message.includes('beta')), 'reply --to a record of a revoked caller ⇒ refused, naming the live caller (beta)');
  st.setDelivery('ci', b.caller.id, { mode: 'none' });
  let err3 = null; try { await ad.prepareSend('ci', { text: 'x', recipients: b.caller.id }); } catch (e) { err3 = e; }
  ok(gateOf(err3) && err3.detail.why === 'delivery-none', 'compose --caller <a none caller> ⇒ refused by name');
  ok((await ad.reconcile()).unknown === true, 'reconcile ⇒ {unknown: true} (no caller-side lookup; a person re-sends)');
  // B-574d (lane nl-journals, 主开发 r4939): A POLL CALLER'S REPLY QUEUE THROUGH THE STORE WRITER — the append HANDS the queue file under its
  // row (0600), nothing written on the hub's loop; the poll hands out LANDED lines only (a cursor never moves past a line a dying hub could
  // lose); the send is answered only once the queue LANDED (held here); a landing that fails — or misses the send's budget — is answered as
  // the release answered its throw (主开发 r5041): NOT ok, the transport class, not retried, LOST, so the person's card reads «unknown»; the
  // line stays queued in the writer (no second copy) and is written when the storage comes back. REDs (a copy): the release's append (written on the loop); a poll that hands out OWED lines
  const queueScene = async (Mod, name, { lands = false } = {}) => {
    const qd = scratch('webhook-reply-' + name), sec = secrets;
    let release, owed = new Map(); const gate = new Promise((r) => { release = r; }), calls = [];
    const w = { dirty(file, o) { calls.push({ file, name: o.name, mode: o.mode, wakes: typeof o.onWritten === 'function' }); owed.set(file, o.produce()); }, owed: (f) => (owed.has(f) ? owed.get(f) : null), durable: async (f) => { const ok2 = await gate; if (ok2) owed.delete(f); return ok2; }, pending: () => false, forget() { } };
    const qs = Mod.callersStore(qd, { secrets: sec, writer: w }); qs.putPath('ci', { title: 'CI' });
    const al = qs.register('ci', { name: 'alpha', auth: 'hmac', delivery: { mode: 'poll' } });
    const qa = Mod.create({ id: 'webhook' }, { ownDir: qd, secrets: sec, writer: w, findRecord: () => null });
    const o = { writeFileSync: fs.writeFileSync, renameSync: fs.renameSync }, loop = [];
    const qf = (n) => String(n).includes(require('node:path').join('replies', 'ci'));
    fs.writeFileSync = function (p0, ...x) { if (qf(p0)) loop.push('write'); return o.writeFileSync.call(this, p0, ...x); };
    fs.renameSync = function (a0, b0, ...x) { if (qf(b0)) loop.push('rename'); return o.renameSync.call(this, a0, b0, ...x); };
    let answered = false, sent, before;
    try {
      const p = qa.send('ci', { text: 'queued', idemKey: 'q-1', envelope: { to: al.caller.id } }).then((r) => { answered = true; return r; });
      await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
      before = { answered, poll: (Mod.pollAnswer(qs, 'ci', qs.caller('ci', al.caller.id), '', Date.now()) || { replies: [] }).replies.map((x) => x.text) };
      release(lands); sent = await p;
    } finally { Object.assign(fs, o); }
    const d = (sent && sent.detail) || {};
    return { calls, loop: loop.join(' '), before, owedAfter: owed.size, sent: { ok: sent && sent.ok, code: sent && sent.code, retryable: sent && sent.retryable, lost: d.lost === true, why: d.why || null, message: d.message || null, lane: sent && sent.lane, notOnDisk: sent && sent.notOnDisk } };
  };
  const qr = await queueScene(WH, 'real');
  ok(qr.calls.length === 1 && qr.calls[0].name === 'webhook-replies.write' && qr.calls[0].mode === 0o600 && qr.loop === '', 'B-574d the reply is HANDED to the store writer under its row (0600) — nothing written on the hub\'s loop', qr);
  ok(qr.before.answered === false && J(qr.before.poll) === J([]) && qr.calls[0].wakes === true, 'B-574d …the caller\'s poll hands out LANDED lines only (a reply still owed is not handed — its cursor can never pass a line a dying hub could lose), the long-poll is woken at the landing, and the send is NOT answered until it', qr.before);
  const notSent = (x) => x.sent.ok === false && x.sent.code === 'transport' && x.sent.retryable === false && x.sent.lost === true && x.sent.why === 'not-on-disk'
    && /queued but not on disk yet/.test(x.sent.message || '') && /lost if VibeSpace restarts first/.test(x.sent.message || '') && x.owedAfter === 1;
  ok(verdictOf(notSent(qr)), 'B-574d (主开发 r5041) …a landing that FAILS is answered as the release answered its throw: NOT ok, the transport class, not retried, LOST (the person\'s card reads «unknown», never «sent») — its words: queued, not on disk yet, lost if VibeSpace restarts first; the line stays queued in the writer (no second copy)', qr.sent);
  const ql = await queueScene(WH, 'landed', { lands: true });
  ok(ql.sent.ok === true && ql.sent.lane === 'poll' && !ql.sent.notOnDisk && ql.before.answered === false, 'B-574d …a reply whose line LANDED is answered sent (the poll lane), only after the landing', { sent: ql.sent, before: ql.before });
  const WSRC = fs.readFileSync(new URL('../src/channels/webhook.js', import.meta.url), 'utf8');
  const MW = mutantCopies('webhook-reply-queue', new URL('..', import.meta.url).pathname);
  const owedPoll = MW.load('src/channels/webhook.js', anchored(WSRC, "  const items = queueRead(S, slug, c.id, t, { landed: true }).filter((x) => x.seq > since).slice(0, 50);", "  const items = queueRead(S, slug, c.id, t).filter((x) => x.seq > since).slice(0, 50);", 'a poll that hands out owed lines'), 'owed-poll');
  const r1 = await queueScene(owedPoll, 'red-owed-poll');
  ok(J(r1.before.poll) === J(['queued']), 'RED B-574d a poll that hands out OWED lines: the caller is handed a reply that has not landed — its cursor passes a line a dying hub could lose', r1.before);
  const saysSent = MW.load('src/channels/webhook.js', anchored(WSRC, "      if (!onDisk) return { ok: false, code: 'transport', retryable: false, detail: { lost: true, why: 'not-on-disk', message: 'the reply is queued but not on disk yet — it is written when the storage comes back; it is lost if VibeSpace restarts first' } };\n", '', 'a copy that says sent'), 'says-sent');
  const r3 = await queueScene(saysSent, 'red-says-sent');
  ok(!notSent(r3) && r3.sent.ok === true, 'RED B-574d (r5041) a copy that says SENT: a reply not on disk is answered ok — the card would read «sent» over a line a restart loses', r3.sent);
  const early = MW.load('src/channels/webhook.js', anchored(WSRC, 'const onDisk = await queueAppend(', 'const onDisk = !!queueAppend(', 'a send answered before its landing'), 'early');
  const r4 = await queueScene(early, 'red-early');
  ok(r4.before.answered === true, 'RED B-574d a copy that answers the send BEFORE its line landed: answered while the line is still owed', r4.before);
  const relApp = MW.load('src/channels/webhook.js', anchored(WSRC, "  W.dirty(f, { name: 'webhook-replies.write', mode: 0o600, produce: () => text, onWritten: (ok) => { if (ok) { try { S.bus.emit('reply', { slug, id }); } catch { /* a listener's */ } } } });", "  { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, text, { mode: 0o600 }); fs.renameSync(tmp, f); S.bus.emit('reply', { slug, id }); }", 'the release append'), 'release-append');
  const r2 = await queueScene(relApp, 'red-append');
  ok(gateOf(/write/.test(r2.loop)) && gateOf(/rename/.test(r2.loop)) && r2.calls.length === 0, 'RED B-574d the release\'s append: the queue written and renamed ON the hub\'s loop, nothing handed to the writer', { loop: r2.loop, calls: r2.calls.length });
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
