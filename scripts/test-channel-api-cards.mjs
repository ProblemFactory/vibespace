#!/usr/bin/env node
// test-channel-api-cards — B-2198 part 2 (lane channel-api-ui): ONE raw-API proposal = ONE card in the chat, the Outbox
// and For you (PURE src/channel-api-card.js), resolved together (ORCH src/server/channel-api-cards.js over a fake
// orchestrator + fake For-you store + fake delivery ladder): the For-you item per proposal, the decision answering it
// with the outcome, the receipt on the agent's next turn, the 24 h expiry and the withdrawal by name. ⑤ = patched-copy
// controls: each rule taken out of a mutant copy turns its row red.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 600)); } };
const H = 3600 * 1000, T0 = Date.UTC(2026, 9, 4, 12);
const base = (o = {}) => ({ id: 'api-aaaaaaaaaaaa', status: 'pending', cred: 'lark-1', credLabel: 'Lark · ops', at: T0, conv: 'agent-1', principal: { kind: 'agent', id: 'agent-1', name: 'Builder' }, method: 'POST', host: 'open.feishu.cn', path: '/open-apis/im/v1/messages', query: [['receive_id_type', 'chat_id']], digest: 'd'.repeat(64), sensitive: null, offersAlways: true, body: '{"x":1}', bodyBytes: 7, bodySha: 'e'.repeat(64), headers: { 'Content-Type': 'application/json' }, tier: 'write-ask', shape: 'POST open.feishu.cn/open-apis/im/v1/messages', ...o });

function pureRows(C, tag = '') {
  const R = {};
  const m = C.cardModel(base(), { now: T0 + H });
  R.pending = m.fate === 'pending' && m.actionable && m.outcome.key === 'Waiting for you · expires in {h} h' && m.outcome.params.h === 23;
  R.frozen = m.request.method === 'POST' && m.request.host === 'open.feishu.cn' && m.request.query === 'receive_id_type=chat_id' && m.headers[0] === 'Content-Type: application/json' && m.bodySha === 'e'.repeat(64) && m.bodyBytes === 7 && m.tier === 'write-ask';
  R.body400 = C.cardModel(base({ body: 'y'.repeat(5000), bodyBytes: 5000 })).body.length === 400 && C.cardModel(base({ body: 'y'.repeat(5000) })).bodyMore === true;
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
const WORDS = { pending: 'a pending card: Approve-able, says when it expires', frozen: 'the card shows the FROZEN request (method, host, path, query, headers, body size + sha256, tier)', body400: 'the body shows its first 400 chars and says there is more', alwaysNames: '"always allow" names the shape it will allow (D2)', sensitiveNoAlways: 'a sensitive card has NO always-allow button, says why', ran: 'Ran · 200 · 1.2 KB', rejected: 'Rejected by you', expiredFate: 'the sweep\'s fates are named (expired / withdrawn)', decidedNotActionable: 'a decided card answers nothing', sig: 'the keyed sig changes iff a drawn word changes', sweep: 'sweep: 24 h unanswered ⇒ expired; account gone ⇒ withdrawn by name; decided untouched', forYou: 'ONE For-you item (origin channels): Approve names the proposal + its digest', receipts: 'the next-turn receipt says ran / rejected (by whom) / expired / withdrawn', sameWords: 'the resolved For-you row and the card say the SAME outcome' };

console.log('① PURE card model (src/channel-api-card.js)');
const C = require(path.join(ROOT, 'src/channel-api-card.js'));
const R = pureRows(C);
for (const k of Object.keys(WORDS)) ok(R[k], WORDS[k]);

// ── ORCH over fakes ──
function harness(cardsPath = path.join(ROOT, 'src/server/channel-api-cards.js')) {
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
  const delivered = [], stash = []; let refuse = false;
  const deliver = { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return refuse ? { ok: false } : { ok: true }; }, stashFor: (cid, env) => { stash.push({ cid, env }); } };
  const { create } = require(cardsPath);
  const cards = create({ dataDir: dir, api, userTodos, deliver, now: () => clock, timer: false, log: { warn() {}, log() {} } });
  const add = (o) => { const p = base({ bodySha: undefined, headers: undefined, tier: undefined, shape: undefined, ...o }); props[p.id] = p; writeFrozen(); return p; };
  return { dir, api, cards, add, todos, answered, delivered, stash, creds, granted, setClock: (t) => { clock = t; }, refuse: (v) => { refuse = v; } };
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
  R.persisted = (() => { const j = JSON.parse(fs.readFileSync(path.join(h.dir, 'channels/api-cards.json'), 'utf8')); return j.items['api-1'].todoId === 't-1' && j.items['api-1'].receipt.how === 'delivered'; })();
  return R;
}
const OWORDS = { oneItem: 'a pending proposal files ONE For-you item (key/origin channels), never twice', record: 'the record carries the frozen headers, the body sha256, the tier, the shape', decisionResolves: 'a decision answers the For-you item WITH the outcome (one record, three surfaces)', receipt: 'the agent is told on its next turn — no wake, spendReason channel-receipt', receiptOnce: 'the receipt is handed once', expired: '24 h unanswered ⇒ expired: nothing ran, item answered, the receipt stashed when the ladder refuses', withdrawnTier: 'the tier withdrawn ⇒ withdrawn by name, the agent told', withdrawnAccount: 'the account removed ⇒ withdrawn "the account was removed"', persisted: 'the item / receipt bookkeeping survives a restart (api-cards.json)' };
console.log('② ORCH over fakes (src/server/channel-api-cards.js)');
const O = await orchRows(harness());
for (const k of Object.keys(OWORDS)) ok(O[k], OWORDS[k], O);

// ── ③ patched-copy controls ──
console.log('③ patched-copy controls (each rule taken out ⇒ its row red)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-apicards-mut-'));
let mutN = 0;
function mutant(rel, from, to) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!src.includes(from)) return null;
  const d = path.join(tmp, `m${++mutN}`, path.dirname(rel)); fs.mkdirSync(d, { recursive: true });
  let s = src.replace(from, to).replace(/require\('\.\.\/channel-api(-card)?\.js'\)/g, (m0, g) => `require(${JSON.stringify(path.join(ROOT, `src/channel-api${g || ''}.js`))})`);
  const f = path.join(d, path.basename(rel)); fs.writeFileSync(f, s); return f;
}
const pm = (from, to, row) => { const f = mutant('src/channel-api-card.js', from, to); ok(!!f && pureRows(require(f))[row] === false, `CONTROL: ${row} red without its rule`); };
pm("now - (Number(p.at) || 0) >= TTL_MS", 'false', 'sweep');
pm('p.offersAlways && !p.sensitive && p.shape', 'p.offersAlways && p.shape', 'sensitiveNoAlways');
pm("String(p.body).slice(0, BODY_SHOWN)", 'String(p.body)', 'body400');
pm("shown: p.digest || null", 'shown: null', 'forYou');
const om = async (from, to, row) => { const f = mutant('src/server/channel-api-cards.js', from, to); ok(!!f && (await orchRows(harness(f)))[row] === false, `CONTROL: ${row} red without its rule`); };
await om("userTodos.resolveAnswered([st.todoId], 'channel-api', C.resolvedFactOf(p));", '', 'decisionResolves');
await om("if (st.todoId || !userTodos", 'if (!userTodos', 'oneItem');
await om("{ await receiptFor(p, st); dirty = true; }", '{ dirty = true; }', 'receipt');
await om("try { deliver.stashFor(p.conv,", 'try { if (0) deliver.stashFor(p.conv,', 'expired');

console.log(fail ? `FAILED: ${fail} of ${pass + fail}` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
