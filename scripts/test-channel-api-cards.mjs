#!/usr/bin/env node
// test-channel-api-cards — B-2198 part 2 (lane channel-api-ui): ONE raw-API proposal = ONE card in the chat, the Outbox
// and For you (PURE src/channel-api-card.js), resolved together (ORCH src/server/channel-api-cards.js over a fake
// orchestrator + fake For-you store + fake delivery ladder): the For-you item per proposal, the decision answering it
// with the outcome, the receipt on the agent's next turn, the 24 h expiry and the withdrawal by name. ⑤ = patched-copy
// controls: each rule taken out of a mutant copy turns its row red. ④ (lane inline-receipts-compose-api): a proposal whose
// CLI waits on it (`api … --wait` / `api wait`) is read INLINE — its receipt message is never filed; a CLI that stopped
// waiting leaves it to the message road (the fallback).
import { landingWriter } from './scratch.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const waitUntil = async (pred, ms, what) => { for (let k = 0, n = Math.ceil(ms / 2); k <= n; k++) { if (pred()) return true; await new Promise((r) => setTimeout(r, 2)); } console.log(`  … waited ${ms} ms of turns for ${what} — it never came`); return null; };   // B-1217 member 17: bounded by a COUNT of turns, says what never came
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 600)); } };
const H = 3600 * 1000, T0 = Date.UTC(2026, 9, 4, 12);
const base = (o = {}) => ({ id: 'api-aaaaaaaaaaaa', status: 'pending', cred: 'lark-1', credLabel: 'Lark · ops', at: T0, conv: 'agent-1', principal: { kind: 'agent', id: 'agent-1', name: 'Builder' }, method: 'POST', host: 'open.feishu.cn', path: '/open-apis/im/v1/messages', query: [['receive_id_type', 'chat_id']], digest: 'd'.repeat(64), sensitive: null, offersAlways: true, body: '{"x":1}', bodyBytes: 7, bodySha: 'e'.repeat(64), headers: { 'Content-Type': 'application/json' }, tier: 'write-ask', shape: 'POST open.feishu.cn/open-apis/im/v1/messages', ...o });

function pureRows(C, tag = '') {
  const R = {};
  const m = C.cardModel(base(), { now: T0 + H });
  R.pending = m.fate === 'pending' && m.actionable && m.outcome.key === 'Waiting for you · expires in {h} h' && m.outcome.params.h === 23;
  R.frozen = m.request.method === 'POST' && m.request.host === 'open.feishu.cn' && m.request.query === 'receive_id_type=chat_id' && m.headers[0] === 'Content-Type: application/json' && m.bodySha === 'e'.repeat(64) && m.bodyBytes === 7 && m.tier === 'write-ask';
  R.body400 = C.cardModel(base({ body: 'y'.repeat(5000), bodyBytes: 5000 })).body.length === 2048 && C.cardModel(base({ body: '{"a":1}' })).body === '{\n  "a": 1\n}' && C.cardModel(base({ body: 'y'.repeat(5000) })).bodyMore === true;
  R.alwaysNames = !!m.always && m.always.params.shape === 'POST open.feishu.cn/open-apis/im/v1/messages';
  R.sensitiveNoAlways = C.cardModel(base({ sensitive: 'DELETE', offersAlways: true })).always === null && !!C.cardModel(base({ sensitive: 'DELETE' })).sensitive;
  R.ran = C.cardModel(base({ status: 'ran', result: { status: 200, bytes: 1229 } })).outcome.key === 'Ran · {status} · {size}' && C.outcomeOf(base({ status: 'ran', result: { status: 200, bytes: 1229 } })).params.size === '1.2 KB';
  R.rejected = C.outcomeOf(base({ status: 'rejected', decidedBy: 'user' })).key === 'Rejected by you';
  R.expiredFate = C.fateOf(base({ status: 'rejected', decidedBy: 'expired' })) === 'expired' && C.fateOf(base({ status: 'rejected', decidedBy: 'withdrawn' })) === 'withdrawn';
  R.decidedNotActionable = ['ran', 'rejected', 'failed'].every((s) => !C.cardModel(base({ status: s })).actionable);
  R.sig = C.cardModel(base()).sig === C.cardModel(base()).sig && C.cardModel(base()).sig !== C.cardModel(base({ status: 'rejected', decidedBy: 'user' })).sig;
  const sw = C.sweepVerdicts([base({ id: 'a', at: T0 }), base({ id: 'b', at: T0 + 2 * H }), base({ id: 'c', at: T0 + 2 * H, cred: 'gone' }), base({ id: 'd', at: T0, status: 'ran' })], { now: T0 + 24 * H, live: (p) => (p.cred === 'gone' ? 'the account was removed' : null) });
  R.sweep = sw.length === 2 && sw.find((v) => v.id === 'a').by === 'expired' && sw.find((v) => v.id === 'c').by === 'withdrawn' && sw.find((v) => v.id === 'c').reason === 'the account was removed';
  const fy = C.forYouOf(base());
  R.forYou = fy.origin === 'channels' && fy.action.type === 'channel-api-proposal' && fy.action.id === 'api-aaaaaaaaaaaa' && fy.action.shown === 'd'.repeat(64) && /expires 24 h/.test(fy.detail);
  R.receipts = /RAN — HTTP 200, 1\.2 KB/.test(C.receiptText(base({ status: 'ran', result: { status: 200, bytes: 1229 } }))) && /REJECTED by the user — "not now"/.test(C.receiptText(base({ status: 'rejected', decidedBy: 'user', reason: 'not now' }))) && /EXPIRED — unanswered for 24 h/.test(C.receiptText(base({ status: 'rejected', decidedBy: 'expired' }))) && /WITHDRAWN — the account was removed/.test(C.receiptText(base({ status: 'rejected', decidedBy: 'withdrawn', reason: 'the account was removed' }))) && C.receiptText(base()) === null;
  R.sameWords = (() => { const p = base({ status: 'ran', result: { status: 200, bytes: 1229 } }); const f = C.resolvedFactOf(p).apiOutcome, o = C.cardModel(p).outcome; return f.key === o.key && JSON.stringify(f.params) === JSON.stringify(o.params); })();
  return R;
}
const WORDS = { pending: 'a pending card: Approve-able, says when it expires', frozen: 'the card shows the FROZEN request (method, host, path, query, headers, body size + sha256, tier)', body400: 'the 技术细节 fold shows the body pretty-printed up to 2 KB and says there is more', alwaysNames: '"always allow" names the shape it will allow (D2)', sensitiveNoAlways: 'a sensitive card has NO always-allow button, says why', ran: 'Ran · 200 · 1.2 KB', rejected: 'Rejected by you', expiredFate: 'the sweep\'s fates are named (expired / withdrawn)', decidedNotActionable: 'a decided card answers nothing', sig: 'the keyed sig changes iff a drawn word changes', sweep: 'sweep: 24 h unanswered ⇒ expired; account gone ⇒ withdrawn by name; decided untouched', forYou: 'ONE For-you item (origin channels): Approve names the proposal + its digest', receipts: 'the next-turn receipt says ran / rejected (by whom) / expired / withdrawn', sameWords: 'the resolved For-you row and the card say the SAME outcome' };

console.log('① PURE card model (src/channel-api-card.js)');
const C = require(path.join(ROOT, 'src/channel-api-card.js'));
const R = pureRows(C);
for (const k of Object.keys(WORDS)) ok(verdictOf(R[k]), WORDS[k]);

// ── ORCH over fakes ──
function harness(cardsPath = path.join(ROOT, 'src/server/channel-api-cards.js'), opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-apicards-'));
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  let clock = T0;
  const props = {}, creds = [{ id: 'lark-1', kind: 'lark', label: 'Lark · ops', grants: [{ principal: { kind: 'agent', id: 'agent-1' }, tier: 'write-ask' }] }];
  const granted = new Set(['agent-1|lark-1']);
  const writeFrozen = () => fs.writeFileSync(path.join(dir, 'channels/api-proposals.json'), JSON.stringify({ proposals: Object.fromEntries(Object.values(props).map((p) => [p.id, { frozen: { headers: { 'Content-Type': 'application/json' }, body: Buffer.from('{"x":1}').toString('base64') } }])) }));
  const api = {
    ownerView: () => ({ ok: true, creds: creds.slice(), proposals: Object.values(props).sort((a, b) => b.at - a.at).map((p) => ({ ...p })) }),
    creds: (ctx) => ({ ok: true, creds: creds.filter((c) => granted.has(`${ctx.id}|${c.id}`)) }),
    reject: (id, { by = 'user', reason = null } = {}) => { const p = props[id]; if (!p || p.status !== 'pending') return { ok: false }; p.status = 'rejected'; p.decidedBy = by; p.reason = reason; p.decidedAt = clock; return { ok: true }; },
    ran: (id) => { const p = props[id]; p.status = 'ran'; p.decidedBy = 'user'; p.decidedAt = clock; p.result = { status: 200, bytes: 1229 }; },
  };
  const todos = [], answered = [];
  const userTodos = { add: (key, it) => { const x = { id: `t-${todos.length + 1}`, key, ...it, status: 'open' }; todos.push(x); return x; }, resolveAnswered: (ids, by, fact) => { for (const id of ids) { const x = todos.find((t) => t.id === id); if (x && x.status === 'open') { x.status = 'done'; x.resolvedBy = by; x.resolvedFact = fact; answered.push(id); } } return ids; } };
  const delivered = [], stash = [], lifts = [], lands = []; let refuse = false, taken = false, landed = false;
  // r3919: the ladder's answer while its list is unread (`taken`), its peek and its lift's listeners — as the real ladder answers them
  const deliver = { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return refuse ? { ok: false } : { ok: true }; }, stashFor: (cid, env) => { stash.push({ cid, env }); return taken ? { stored: false, taken: true, why: 'taken, not on disk: the list of messages waiting for conversations could not be read' } : { stored: true, why: null }; },
    stashPeek: (cid) => stash.filter((x) => x.cid === cid).map((x) => ({ ...x.env })), onStashLift: (fn) => { lifts.push(fn); },
    // r3988 (A): the stash's own word — an entry is IN THE FILE only after a write that LANDED holding it (`landed`)
    stashOnDisk: (cid, ref) => landed && stash.some((x) => x.cid === cid && x.env.ref === ref), onStashLanded: (fn) => { lands.push(fn); } };
  const { create } = require(cardsPath);
  const names = (adapterId, convId) => (adapterId === 'lark-1' && convId === 'oc_known' ? 'Product room' : null);   // the channel store's name ladder
  const cards = create({ dataDir: dir, api, userTodos, deliver, names, now: () => clock, timer: false, log: { warn() {}, log() {} }, writer: opts.writer || landingWriter(), ...(opts.collectWindowMs ? { collectWindowMs: opts.collectWindowMs } : {}) });
  const add = (o) => { const p = base({ bodySha: undefined, headers: undefined, tier: undefined, shape: undefined, ...o }); props[p.id] = p; writeFrozen(); return p; };
  return { dir, api, cards, add, todos, answered, delivered, stash, creds, granted, setClock: (t) => { clock = t; }, refuse: (v) => { refuse = v; }, taken: (v) => { taken = v; }, lift: ({ wrote = true } = {}) => { landed = wrote; for (const fn of lifts) fn(); }, land: () => { landed = true; for (const fn of lands) fn(); } };
}
async function orchRows(h) {
  const R = {};
  h.add({ id: 'api-1', at: T0 });
  await h.cards.sync(); await h.cards.sync();
  R.oneItem = h.todos.length === 1 && h.todos[0].action.id === 'api-1' && h.todos[0].key === 'channels' && h.todos[0].origin === 'channels';
  const rec = h.cards.records().find((r) => r.id === 'api-1');
  R.record = !!rec && rec.todoId === 't-1' && rec.headers['Content-Type'] === 'application/json' && /^[0-9a-f]{64}$/.test(rec.bodySha || '') && rec.tier === 'write-ask' && rec.shape === 'POST open.feishu.cn/open-apis/im/*/messages';   // the orchestrator's own shapeOf (id-like segments as *)
  h.api.ran('api-1'); await h.cards.sync();
  R.decisionResolves = h.answered.includes('t-1') && h.todos[0].resolvedBy === 'channel-api' && h.todos[0].resolvedFact.apiOutcome.key === 'Ran · {status} · {size}';
  const d1 = h.delivered.find((d) => /api-1/.test(d.text));
  R.receipt = !!d1 && d1.cid === 'agent-1' && d1.opts.noWake === true && d1.opts.spendReason === 'channel-receipt' && /RAN — HTTP 200/.test(d1.text);
  await h.cards.sync();
  R.receiptOnce = h.delivered.filter((d) => /api-1/.test(d.text)).length === 1;
  h.refuse(true); h.add({ id: 'api-2', at: T0 }); await h.cards.sync(); h.setClock(T0 + 24 * H); await h.cards.sync();
  R.expired = h.api.ownerView().proposals.find((p) => p.id === 'api-2').decidedBy === 'expired' && h.stash.some((s) => s.cid === 'agent-1' && s.env.ref === 'api-2' && s.env.source === 'channel-receipt' && /EXPIRED/.test(s.env.text)) && h.todos.find((t) => t.action.id === 'api-2').status === 'done';
  h.refuse(false); h.add({ id: 'api-3', at: T0 + 24 * H }); h.add({ id: 'api-4', at: T0 + 24 * H, cred: 'lark-gone' }); await h.cards.sync();
  h.granted.delete('agent-1|lark-1'); await h.cards.sync();
  const v = h.api.ownerView().proposals;
  R.withdrawnTier = v.find((p) => p.id === 'api-3').decidedBy === 'withdrawn' && /withdrawn/.test(v.find((p) => p.id === 'api-3').reason) && h.delivered.some((d) => /api-3.*WITHDRAWN/s.test(d.text));
  R.withdrawnAccount = v.find((p) => p.id === 'api-4').reason === 'the account was removed';
  h.add({ id: 'api-5', at: T0, body: '{"receive_id":"oc_known","msg_type":"text"}' }); h.add({ id: 'api-6', at: T0, body: '{"receive_id":"oc_unknown","msg_type":"text"}' });
  const r5 = h.cards.records().find((r) => r.id === 'api-5'), r6 = h.cards.records().find((r) => r.id === 'api-6');
  R.objectNamed = !!r5 && r5.objectName === 'Product room' && !!r5.objectConv && r5.objectConv.adapterId === 'lark-1' && r5.objectConv.convId === 'oc_known' && !!r6 && !('objectName' in r6)
    && C.cardModel(r5).head.object.name === 'Product room' && C.cardModel(r6).head.object.short === 'oc_unkno…';
  // r3919 (the class): an API receipt TAKEN while the list of waiting messages is unread — its record carries «not on disk»; at the lift, the
  // list written holds it (by its ref): the mark leaves
  h.refuse(true); h.taken(true); h.add({ id: 'api-7', at: T0 + 24 * H }); await h.cards.sync(); h.api.ran('api-7'); await h.cards.sync(); h.taken(false); h.refuse(false);
  const r7 = () => (h.cards.records().find((r) => r.id === 'api-7') || {}).receipt || {};
  R.takenMarked = r7().how === 'stashed' && r7().notOnDisk === true;
  h.lift({ wrote: false });   // r3988 (A): the list reads, but its one write at the lift FAILS — the entry is in memory only
  R.markStaysOnFailedWrite = r7().notOnDisk === true;
  h.land();   // …the retry LANDS: the stash says the entry is in the file
  R.markLeavesAtLift = r7().how === 'stashed' && !r7().notOnDisk;
  R.persisted = (() => { const j = JSON.parse(fs.readFileSync(path.join(h.dir, 'channels/api-cards.json'), 'utf8')); return j.items['api-1'].todoId === 't-1' && j.items['api-1'].receipt.how === 'delivered'; })();
  return R;
}
const OWORDS = { markStaysOnFailedWrite: 'r3988 (A): a lift whose write FAILED clears nothing — the API receipt keeps «not on disk» (its entry in memory only)', takenMarked: 'r3919: an API receipt TAKEN while the list of waiting messages is unread carries «not on disk» on its record (how stashed)', markLeavesAtLift: 'r3919 / r3988 (A): when a write LANDS holding it (the stash\'s own word) — the mark leaves', objectNamed: 'a call\'s chat is NAMED from the channel store (+ the conversation it opens); an unknown one keeps its 8-char id chip', oneItem: 'a pending proposal files ONE For-you item (key/origin channels), never twice', record: 'the record carries the frozen headers, the body sha256, the tier, the shape', decisionResolves: 'a decision answers the For-you item WITH the outcome (one record, three surfaces)', receipt: 'the agent is told on its next turn — no wake, spendReason channel-receipt', receiptOnce: 'the receipt is handed once', expired: '24 h unanswered ⇒ expired: nothing ran, item answered, the receipt stashed when the ladder refuses', withdrawnTier: 'the tier withdrawn ⇒ withdrawn by name, the agent told', withdrawnAccount: 'the account removed ⇒ withdrawn "the account was removed"', persisted: 'the item / receipt bookkeeping survives a restart (api-cards.json)' };
console.log('② ORCH over fakes (src/server/channel-api-cards.js)');
const O = await orchRows(harness());
for (const k of Object.keys(OWORDS)) ok(verdictOf(O[k]), OWORDS[k], O);

// ── ④ lane inline-receipts-compose-api: the CLI that waits on a proposal reads its outcome INLINE ──
const MIN = 60 * 1000;
async function inlineRows(h) {
  const R = {};
  const mine = (id) => h.delivered.filter((d) => d.text.includes(id)).length + h.stash.filter((x) => x.env.ref === id).length;
  // A — `api … --wait`: the CLI waits from the moment the proposal is filed; the user decides; its next poll reads it
  h.add({ id: 'api-w1', at: T0 }); await h.cards.sync();
  const c0 = await h.cards.collect('api-w1');
  h.setClock(T0 + 5000); h.api.ran('api-w1'); await h.cards.sync();   // inside the window (the CLI polls every 2 s)
  R.held = c0.collecting === true && mine('api-w1') === 0;
  const c1 = await h.cards.collect('api-w1');
  R.readInline = c1.collected === true && c1.messaged === false && /the user approved it and it RAN — HTTP 200, 1\.2 KB\.$/.test(c1.receiptText || '');
  h.setClock(T0 + 30 * MIN); await h.cards.sync(); await h.cards.sync();
  R.neverFiled = mine('api-w1') === 0 && h.cards.records().find((r) => r.id === 'api-w1').receipt.how === 'inline';
  const it = h.todos.find((t) => t.action.id === 'api-w1');
  R.cardKept = !!it && it.status === 'done' && it.resolvedFact.apiOutcome.key === 'Ran · {status} · {size}';
  // B — the CLI stopped waiting (its --timeout) before the decision: the hold lapses ⇒ the receipt MESSAGES
  h.add({ id: 'api-w2', at: T0 + 30 * MIN }); await h.cards.sync(); await h.cards.collect('api-w2');
  h.setClock(T0 + 31 * MIN); h.api.ran('api-w2'); await h.cards.sync();
  R.lapsed = mine('api-w2') === 1 && h.delivered.some((d) => d.text.includes('api-w2') && d.opts.spendReason === 'channel-receipt' && d.opts.noWake === true);
  // C — decided while held, then the CLI died before reading: once the window ends the receipt MESSAGES (the fallback)
  h.add({ id: 'api-w3', at: T0 + 31 * MIN }); await h.cards.sync(); await h.cards.collect('api-w3');
  h.api.ran('api-w3'); await h.cards.sync();
  const heldC = mine('api-w3') === 0;
  h.setClock(T0 + 32 * MIN); await h.cards.sync();
  R.fallback = heldC && mine('api-w3') === 1;
  // D — no CLI waits (no --wait): the approval-gated proposal keeps its card AND its receipt message (the base road)
  h.add({ id: 'api-w4', at: T0 + 32 * MIN }); await h.cards.sync(); h.api.ran('api-w4'); await h.cards.sync();
  R.gatedMessages = mine('api-w4') === 1;
  // E — `api wait <id>` after the message went: it still reads the outcome, and says the message went
  const c4 = await h.cards.collect('api-w4');
  R.messagedAfter = c4.messaged === true && c4.collected === false && /RAN/.test(c4.receiptText || '') && mine('api-w4') === 1;
  return R;
}
const IWORDS = {
  held: 'a decision landing while its CLI waits (api … --wait) is HELD — no receipt message, no stash',
  readInline: 'the CLI\'s next poll reads it INLINE: the card\'s words (RAN — HTTP 200, 1.2 KB), with no pointer back to `api wait`',
  neverFiled: 'the receipt read inline is never filed as a message (the bookkeeping says inline)',
  cardKept: 'the card stays: its For-you item is answered with the outcome',
  lapsed: 'a CLI that stopped waiting before the decision leaves the receipt to the MESSAGE road (no wake, channel-receipt)',
  fallback: 'decided while held, then the CLI died: once the window ends the receipt MESSAGES (the fallback)',
  gatedMessages: 'an approval-gated proposal no CLI waits on keeps its receipt message',
  messagedAfter: '`api wait` after the message went still reads the outcome — and says it went (messaged)',
};
console.log('④ lane inline-receipts-compose-api: a proposal its CLI waits on is read inline — no second receipt message');
const IR = await inlineRows(harness());
for (const k of Object.keys(IWORDS)) ok(verdictOf(IR[k]), IWORDS[k], IR);
{
  // the fallback's own timer (a real clock, a 60 ms window): nobody syncs — the receipt still goes once the window ends
  const h = harness(undefined, { collectWindowMs: 60 });
  h.setClock(Date.now()); h.add({ id: 'api-t1', at: Date.now() }); await h.cards.sync(); await h.cards.collect('api-t1');
  h.api.ran('api-t1'); await h.cards.sync();
  const held = h.delivered.length === 0;
  h.setClock(Date.now() + 100); await waitUntil(() => h.delivered.length >= 1, 5000, 'the fallback timer\'s receipt');   // (B-1217 member 17, unit 2) the verdict waits for the receipt, never a 300 ms hope
  await new Promise((z) => setTimeout(z, 300));   // …then the old 300 ms as an ABSENCE window: a second receipt (nothing to wait for) would still be seen — nothing loosened
  ok(gateOfGuard(held) && h.delivered.length === 1 && verdictOf(/api-t1/.test(h.delivered[0].text)), 'the fallback is its OWN one-shot timer — a held receipt whose CLI never reads it goes as a message after the window, with no other sync', JSON.stringify(h.delivered.map((d) => d.text.slice(0, 40))));
  h.cards.stop();
}

// ── ③ patched-copy controls ──
console.log('③ patched-copy controls (each rule taken out ⇒ its row red)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-apicards-mut-'));
let mutN = 0;
function mutant(rel, from, to) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!src.includes(from)) throw new Error(`ANCHOR GONE ${JSON.stringify(String(from).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`);
  const d = path.join(tmp, `m${++mutN}`, path.dirname(rel)); fs.mkdirSync(d, { recursive: true });
  let s = src.replace(from, to).replace(/require\('\.\.\/channel-api(-card)?\.js'\)/g, (m0, g) => `require(${JSON.stringify(path.join(ROOT, `src/channel-api${g || ''}.js`))})`)
    .replace(/require\('\.\.\/channel-policy\.js'\)/g, () => `require(${JSON.stringify(path.join(ROOT, 'src/channel-policy.js'))})`)
    .replace(/require\('\.{1,2}\/api-call-words\.js'\)/g, () => `require(${JSON.stringify(path.join(ROOT, 'src/api-call-words.js'))})`);
  const f = path.join(d, path.basename(rel)); fs.writeFileSync(f, s); return f;
}
const pm = (from, to, row) => { const f = mutant('src/channel-api-card.js', from, to); ok(!!f && pureRows(require(f))[row] === false, `CONTROL: ${row} red without its rule`); };
pm("now - (Number(p.at) || 0) >= TTL_MS", 'false', 'sweep');
pm('p.offersAlways && !p.sensitive && p.shape', 'p.offersAlways && p.shape', 'sensitiveNoAlways');
pm("String(prettyBody(p.body)).slice(0, BODY_SHOWN)", 'String(prettyBody(p.body))', 'body400');
pm("shown: p.digest || null", 'shown: null', 'forYou');
const om = async (from, to, row) => { const f = mutant('src/server/channel-api-cards.js', from, to); ok(!!f && (await orchRows(harness(f)))[row] === false, `CONTROL: ${row} red without its rule`); };
await om("userTodos.resolveAnswered([st.todoId], 'channel-api', C.resolvedFactOf(p));", '', 'decisionResolves');
await om("if (st.todoId || !userTodos", 'if (!userTodos', 'oneItem');
await om("{ await receiptFor(p, st); dirty = true; }", '{ dirty = true; }', 'receipt');
await om("try { const st0 = deliver.stashFor(p.conv,", 'try { const st0 = 0 && deliver.stashFor(p.conv,', 'expired');
await om("fate: C.fateOf(p), ...(r && r.notOnDisk ? { notOnDisk: true } : {}) };", 'fate: C.fateOf(p) };', 'takenMarked');   // r3919: the record without its mark
await om("for (const [id, st] of marked) { const p = byId.get(id); if (p && p.conv && deliver.stashOnDisk(p.conv, id)) { delete st.receipt.notOnDisk; n++; } }", '', 'markLeavesAtLift');   // r3919: a clearer that never clears
await om("if (p && p.conv && deliver.stashOnDisk(p.conv, id)) { delete st.receipt.notOnDisk; n++; }", 'if (p && p.conv) { delete st.receipt.notOnDisk; n++; }', 'markStaysOnFailedWrite');   // r3988: a clearer that does not ask the stash's word
{
  // RED CONTROL (the base): without the hold a decision its CLI waits on is ALSO filed as a receipt message
  const f = mutant('src/server/channel-api-cards.js', ' && heldInline(p)) continue;', ' && false) continue;');
  const R0 = f ? await inlineRows(harness(f)) : null;
  ok(!!R0 && R0.held === false && R0.neverFiled === false, 'CONTROL (the base): without the hold, the outcome the CLI read inline ALSO arrives as a "[Channels · API]" receipt message — the ④ rows would be RED', R0);
}
await om("todoId: (state.items[p.id] || {}).todoId || null, receipt: (state.items[p.id] || {}).receipt || null, ...objectOf(p),", 'todoId: (state.items[p.id] || {}).todoId || null, receipt: (state.items[p.id] || {}).receipt || null,', 'objectNamed');

// ── r3059 (主开发, MG1): THE GRANTS UNREAD IS A WALL FOR EVERY REMOVER — a grants.json there and unread answers every reader «no one
// granted» (right for access: refused), and the removers judged by it removed: the channel stash gate (every agent's waiting channel
// message, «it no longer reaches the channel») and the api cards' sweep (every pending proposal, «API access … was withdrawn»). One
// read-only fact, the channels grants reader's `unread()`, asked by both: unknown removes and withdraws NOTHING. The store's read is
// a PLACED refusal (fs.readFileSync answers EIO for grants.json at its load — never a mount, never a mode change); each with its red.
{
  console.log('r3059 the grants unread: the removers remove nothing');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const { anchored } = await import('./scratch.mjs');
  const MUTG = mutantCopies('apicards-grants-wall', ROOT);
  const GS = require(path.join(ROOT, 'src/server/grants-store.js'));
  const CGM = require(path.join(ROOT, 'src/server/channels-grants.js'));
  const unreadStore = () => {
    const d = fs.mkdtempSync(path.join(tmp, 'grants-')), f = path.join(d, 'grants.json');
    fs.writeFileSync(f, JSON.stringify({ v: 1, rows: [] }));
    const real = fs.readFileSync;
    fs.readFileSync = function (p0, ...a) { if (String(p0) === f) throw Object.assign(new Error(`EIO: a placed refusal of the read, '${p0}'`), { code: 'EIO' }); return real.call(this, p0, ...a); };
    try { return { d, s: GS.create({ dataDir: d, log: () => { } }) }; } finally { fs.readFileSync = real; }
  };
  const u = unreadStore(), CG = CGM.create({ grants: u.s });
  const readable = GS.create({ dataDir: fs.mkdtempSync(path.join(tmp, 'grants-ok-')), log: () => { } });
  ok(CG.unread() === true && CG.rowOf(CG.DOORS.reach, 'conversation:fake/c1').to.length === 0 && CGM.create({ grants: readable }).unread() === false,
    'r3059 the scene is real: the store\'s read refused (EIO) — the channels grants reader says unread, and every row reads «no one» (access refused); a readable store is not unread');
  // (1) THE CHANNEL STASH GATE (src/server/channels-outbound.js stashGate → conversation-deliver's ladder)
  const OUT_SRC = fs.readFileSync(path.join(ROOT, 'src/server/channels-outbound.js'), 'utf8');
  const WALL = "    if (CG && typeof CG.unread === 'function' && CG.unread()) return { keep: true };";
  const gateOf = (mod) => mod.create({ store: { wallHeld: () => false, outbox: { snapshot: () => ({ proposals: {} }) } }, liveSessions: () => [{ cid: 'agent-1', name: 'Builder', groups: [], inherited: [] }], adapterRecords: () => ({ adapters: [] }), registry: { get: () => ({}) }, stillSees: () => false, CG }).stashGate;
  const entry = { source: 'channel', text: 'a message for the agent', about: { keys: ['fake/c1'], groups: [], inherited: [] } };
  const g1 = gateOf(require(path.join(ROOT, 'src/server/channels-outbound.js')))('agent-1', entry);
  ok(!!(g1 && g1.keep === true && !g1.drop && !g1.text), 'r3059 (1) THE CHANNEL STASH GATE with the grants unread: the waiting message is KEPT — neither removed nor its words replaced', g1);
  const NoWallOut = MUTG.load('src/server/channels-outbound.js', anchored(OUT_SRC, WALL, '    // (r3059 red: no wall)', 'the stash gate without its grants wall'), 'outbound-no-wall');
  const g1r = gateOf(NoWallOut)('agent-1', entry);
  ok(!!(g1r && g1r.drop === true), 'r3059 (1) RED without the wall (today): the unread grants read «it no longer reaches the channel» — the message is REMOVED', g1r);
  // (2) THE API CARDS' SWEEP (src/server/channel-api-cards.js liveness)
  const CARDS_SRC = fs.readFileSync(path.join(ROOT, 'src/server/channel-api-cards.js'), 'utf8');
  const CWALL = '      { let gu = true; try { gu = grantsUnread() === true; } catch { gu = true; } if (gu) return null; }';
  const sweep = async (mod, wired) => {
    const ends = [], p = { id: 'api-bbbbbbbbbbbb', status: 'pending', cred: 'lark-1', at: Date.now(), conv: 'agent-1', principal: { kind: 'agent', id: 'agent-1', name: 'Builder' }, method: 'GET', host: 'open.feishu.cn', path: '/x' };
    const api = { ownerView: () => ({ proposals: ends.length ? [] : [p], creds: [{ id: 'lark-1', grants: [] }] }), creds: () => ({ ok: true, creds: [] }), reject: (id, o) => { ends.push({ id, ...o }); } };   // «no one granted»: what the unread store answers
    const cards = mod.create({ dataDir: fs.mkdtempSync(path.join(tmp, 'sweep-')), api: () => api, timer: false, log: { warn() { }, log() { }, error() { } }, ...(wired ? { grantsUnread: () => CG.unread() } : {}) });
    await cards.sync(); cards.stop();
    return ends;
  };
  const e2 = await sweep(require(path.join(ROOT, 'src/server/channel-api-cards.js')), true);
  ok(e2.length === 0, 'r3059 (2) THE API CARDS\' SWEEP with the grants unread: the pending proposal stays pending — nothing withdrawn', e2);
  const NoWallCards = MUTG.load('src/server/channel-api-cards.js', anchored(CARDS_SRC, CWALL, '      // (r3059 red: no wall)', 'the api cards\' sweep without its grants wall'), 'cards-no-wall');
  const e2r = await sweep(NoWallCards, true);
  ok(e2r.length === 1 && verdictOf(/withdrawn/.test(e2r[0].reason || '')), 'r3059 (2) RED without the wall (today): the unread grants read «API access … was withdrawn» — the proposal is ended', e2r);
  const WIRING = fs.readFileSync(path.join(ROOT, 'src/server/channels-wiring.js'), 'utf8'), ENG_SRC = fs.readFileSync(path.join(ROOT, 'src/server/channels-engine.js'), 'utf8');
  ok(gateOfGuard(WIRING.includes("grantsUnread: () => (typeof channels.grantsUnread === 'function' ? channels.grantsUnread() : false)")) && verdictOf(ENG_SRC.includes('    grantsUnread: () => CG.unread(),')),
    'r3059 PIN: the hub wires the sweep to the engine\'s grants reader (channels-wiring → channels.grantsUnread → CG.unread)');
}

// ── B-574d slice «channels-small-stores» (lane nl-journals, 主开发 r4939): THE CARDS' STATE THROUGH THE STORE WRITER — a sweep's save hands
// the file to the writer under its timed-sync row (the bytes made at the write: the newest state), and NOTHING is written on the hub's loop;
// a sweep that changed nothing hands nothing; a writer that refuses the hand-off throws nothing out of the sweep. RED: the release's save
console.log('⑥ B-574d the cards\' state through the store writer');
{
  const recWriter = ({ refuse = false } = {}) => { const calls = []; return { calls, dirty(file, o) { if (refuse) throw Object.assign(new Error('EIO: a placed refusal of the hand-off'), { code: 'EIO' }); calls.push({ file, name: o.name, makeDir: !!o.makeDir, bytes: o.produce ? o.produce() : null }); }, durable: () => Promise.resolve(true), pending: () => false, flushSync: () => ({ written: [], left: [] }), forget() { } }; };
  // a mutant copy sits in a temp folder: its OWN relative requires (the groups' hold the sweep reads, the store writer) are re-rooted at the
  // tree's files — else the sweep throws before any save (its catch says «sync failed») and a red is red for the wrong reason
  const mutant6 = (from, to) => { const f = mutant('src/server/channel-api-cards.js', from, to); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/require\('(\.{1,2}\/[^']+)'\)/g, (m0, p0) => `require(${JSON.stringify(path.join(ROOT, 'src/server', p0))})`)); return f; };
  const loopWrites = async (h, fn) => { const f = path.join(h.dir, 'channels', 'api-cards.json'), o = { writeFileSync: fs.writeFileSync, renameSync: fs.renameSync }, seen = [];
    fs.writeFileSync = function (p0, ...a) { if (String(p0).startsWith(f)) seen.push('write'); return o.writeFileSync.call(this, p0, ...a); };
    fs.renameSync = function (a0, ...a) { if (String(a0).startsWith(f)) seen.push('rename'); return o.renameSync.call(this, a0, ...a); };
    try { await fn(); } finally { Object.assign(fs, o); } return seen; };
  const cardsOf = async (cardsPath) => {
    const w = recWriter(), h = harness(cardsPath, { writer: w });
    const loop = await loopWrites(h, async () => { h.add({ id: 'api-w1', at: T0 }); await h.cards.sync(); });
    const handed = w.calls.length, last = w.calls[w.calls.length - 1] || {};
    await h.cards.sync();
    return { loop: loop.join(' '), handed, again: w.calls.length - handed, name: last.name, makeDir: last.makeDir, holds: !!last.bytes && JSON.parse(last.bytes).items['api-w1'] !== undefined, file: last.file === path.join(h.dir, 'channels', 'api-cards.json') };
  };
  const g = await cardsOf(undefined);
  ok(g.loop === '' && g.handed >= 1 && g.name === 'channel-api-cards.write' && gateOfGuard(g.makeDir) && gateOfGuard(g.holds) && verdictOf(g.file), '⑥ a sweep\'s save HANDS the cards\' file to the store writer under its row (channel-api-cards.write) — the bytes made at the write hold the new proposal\'s item; nothing is written on the hub\'s loop', g);
  ok(g.again === 0, '⑥ …a sweep that changed nothing hands nothing (no write when nothing changed)', g);
  let threw = null; const hr = harness(undefined, { writer: recWriter({ refuse: true }) });
  try { hr.add({ id: 'api-w2', at: T0 }); await hr.cards.sync(); } catch (e) { threw = e.message; }
  ok(threw === null && hr.todos.length === 1, '⑥ a writer that refuses the hand-off throws nothing out of the sweep — the For-you item is still filed', { threw, todos: hr.todos.length });
  const f = mutant6("  function save() { try { SW().dirty(stateFile, { name: 'channel-api-cards.write', makeDir: true, produce: () => JSON.stringify(state) }); } catch (e) { log.warn('[channel-api-cards] the state write was not handed to the store writer:', e && e.message); } }\n",
    "  function save() { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state)); fs.renameSync(stateFile + '.tmp', stateFile); } catch (e) { log.warn('[channel-api-cards] state write failed:', e && e.message); } }\n");   // stale-pins: kept (the release's save — this red control's own text)
  const r = await cardsOf(f);
  // the cards' SECOND READER of the proposals' file (the frozen headers and body) takes the WRITER's owed bytes first — the orchestrator's
  // newest write may not have landed yet (B-574d: its file is the store writer's too). RED: the release's reader (the file alone)
  const owedOf = async (cardsPath) => {
    let owedText = null;
    const w = { calls: [], dirty() { }, durable: () => Promise.resolve(true), pending: () => false, flushSync: () => ({ written: [], left: [] }), forget() { }, owed: (f) => (String(f).endsWith(path.join('channels', 'api-proposals.json')) ? owedText : null) };
    const ho = harness(cardsPath, { writer: w });
    ho.add({ id: 'api-o1', at: T0 });
    const pf = path.join(ho.dir, 'channels', 'api-proposals.json');
    owedText = fs.readFileSync(pf, 'utf8'); fs.writeFileSync(pf, JSON.stringify({ proposals: {} }));   // the newest bytes owed, the disk not holding them yet
    await ho.cards.sync();
    const rec = ho.cards.records().find((r) => r.id === 'api-o1');
    return { rec: !!rec, headers: rec ? rec.headers : null };
  };
  const ow = await owedOf(undefined);
  ok(gateOfGuard(ow.rec) && !!ow.headers && ow.headers['Content-Type'] === 'application/json', '⑥ the cards\' second reader of the proposals\' file takes the WRITER\'s owed bytes first: a card whose frozen request is not on disk yet still shows its headers', ow);
  const owr = await owedOf(mutant6("  const frozenOf = () => { try { const w = SW(), owed = w && typeof w.owed === 'function' ? w.owed(frozenFile) : null; return JSON.parse(owed != null ? owed : fs.readFileSync(frozenFile, 'utf8')).proposals || {}; } catch { return {}; } };", "  const frozenOf = () => { try { return JSON.parse(fs.readFileSync(frozenFile, 'utf8')).proposals || {}; } catch { return {}; } };"));   // stale-pins: kept (the release's reader — this red control's own text)
  ok(gateOfGuard(owr.rec) && (!owr.headers || owr.headers['Content-Type'] !== 'application/json'), 'RED ⑥ the release\'s reader (the file alone): the card is there, and its frozen request — owed — shows no headers', owr);
  ok(gateOfGuard(/write/.test(r.loop)) && gateOfGuard(/rename/.test(r.loop)) && r.handed === 0, 'RED ⑥ the release\'s save: the cards\' file written and renamed ON the hub\'s loop at every sweep that changed it, nothing handed to the writer', r);
}

console.log(fail ? `FAILED: ${fail} of ${pass + fail}` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf as gateOfGuard } from './lib/check.mjs';
