#!/usr/bin/env node
// THE REPLY PLACEMENT (lane channel-threads, placement round, 2026-09-28 — the owner, after verify r2: "the boolean
// is Lark-shaped"; gate row `test-channel-placement`, fast). A reply used to carry `{replyTo, inThread: boolean}`;
// three vendors answer a message four ways — `chat` / `quote` / `thread` / `thread+chat` — and the ADAPTER declares
// which in its `threads` cap row (`placements` + `rootReply`, the vendor's norm for a message outside a thread).
//
//   ① THE PLACEMENT TABLE per vendor (PURE src/channel-policy.js `placementVerdict`): Lark / Gmail / Agents / the
//      fake from their SHIPPED rows, Slack + Telegram as FIXTURE rows (spec §2.2 — the future adapters are rows, not
//      code) × {no message, a message outside a thread, a message inside a vendor thread} × {nothing asked, each of
//      the four, an unknown word}: the vendor's norm for `--to` alone (PL3), an undeclared placement refused
//      `placement-not-offered` with what IS offered (PL4), a quote of a message inside a thread refused (PL5), the
//      shape refusals (PL1 / PL2), the clamp of an incoherent declaration, the pre-enum reading of a row without one.
//   ② THE SHAPE + THE READ ALIAS: `validateProposal` (the old `inThread` boolean still accepted and still refused
//      with `why: 'inThread'`), `placementOf` over stored proposals (no `placement` + `inThread: true` = thread), the
//      receipt's placement line (and a pre-enum receipt).
//   ③ THE CAPS-ROW CENSUS (grep-derived): every adapter module under src/channels/ (+ the engine's built-in list)
//      declares `threads.placements` EXPLICITLY, passes `validateCaps`, and the fake declares all four; PRINTED; a
//      planted module without the row is found (the census's own control); every `validateCaps` refusal row.
//   ④ THE ADAPTER CONTRACT'S SEND (the registry): a module receives only a declared placement (+ `inThread` for a
//      thread one, the alias older modules read); an undeclared one, chat-with-a-message, a reply-without-one are
//      `not-supported` BEFORE the module runs; a read-only adapter still says `send-not-available` first; the fake
//      sends `thread+chat`.
//   ⑤ THE ENGINE (the real engine + the real store, two scripted vendors — a Lark-shaped and a Slack-shaped row — no
//      vendor call): the placement is decided before a proposal exists (a refusal creates NOTHING), `--to` alone
//      follows the vendor's norm by the parent's thread, the stored proposal carries `placement` (+ `inThread` /
//      `threadKey` / `threadQuote` as the alias), the approve hands the adapter the placement, the receipt says it, a
//      proposal stored BEFORE the enum (only `inThread`) is read and sent as `thread`.
//   ⑥ THE WORDS (zh / ja / en): the card's placement line, the refusal toast, the tool-card touch row — every key in
//      both dictionaries, printed in three languages; the touch row's closed set equals the policy's; wiring pins
//      (the UNSTAGED-WIRING lesson: a PURE fix with no call site is dead).
//   ⑦ CONTROLS — patched copies (scripts/mutant-copy.mjs, scratch only): PL3 blind to the parent, PL5 removed, PL4
//      removed, the declaration unclamped, the registry's send without its guard — each turns its rows RED.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

const POLICY = 'src/channel-policy.js';
const P = require(path.join(REPO, POLICY));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
const agents = require(path.join(REPO, 'src/channels/agents.js'));
const webhook = require(path.join(REPO, 'src/channels/webhook.js'));   // lane webhook-l1-server: a reply names its record (quote), else chat
const T = require(path.join(REPO, 'src/channel-touch.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const REC = require(path.join(REPO, 'src/channel-record.js'));

const ROOT = scratch('placement');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── the vendor rows: the SHIPPED declarations + Slack / Telegram as fixtures (spec §2.2, vendor facts S4 / T1–T2) ──
const SLACK = { receive: 'poll', history: 'page', sendAs: ['user'], identityMarking: 'unknown', threads: { read: 'vendor', replyInto: true, listing: 'separate', placements: ['chat', 'thread', 'thread+chat'], rootReply: 'thread' } };
const TELEGRAM = { receive: 'push', pushTransport: 'long-poll', pushAckBudgetMs: 3000, history: 'none', sendAs: ['bot'], identityMarking: 'marked', threads: { read: 'chain', replyInto: false, listing: 'none', placements: ['chat', 'quote'], rootReply: 'quote' } };
const VENDORS = { lark: lark.caps, slack: SLACK, telegram: TELEGRAM, gmail: gmail.caps, agents: agents.caps, webhook: webhook.caps, fake: fake.fakePoll.caps, 'fake-push': fake.fakePush.caps };

// ── ① THE TABLE ──────────────────────────────────────────────────────────
// [vendor, the answered message: none | root (outside any thread) | thread (inside a vendor thread), asked, expected]
// expected = the placement, or `<code>/<why>`; a `*` marks a DEFAULT (nothing asked) and the rule it must name
const ROWS = [
  ['lark', 'none', null, 'chat'], ['lark', 'none', 'chat', 'chat'], ['lark', 'none', 'quote', 'bad-proposal/replyTo'], ['lark', 'none', 'thread', 'bad-proposal/replyTo'],
  ['lark', 'root', null, 'quote*root'], ['lark', 'root', 'chat', 'bad-proposal/placement'], ['lark', 'root', 'quote', 'quote'], ['lark', 'root', 'thread', 'thread'], ['lark', 'root', 'thread+chat', 'placement-not-offered/not-declared'],
  ['lark', 'thread', null, 'thread*parent-in-thread'], ['lark', 'thread', 'quote', 'placement-not-offered/parent-in-thread'], ['lark', 'thread', 'thread', 'thread'], ['lark', 'thread', 'thread+chat', 'placement-not-offered/not-declared'],
  ['slack', 'none', null, 'chat'], ['slack', 'root', null, 'thread*root'], ['slack', 'root', 'quote', 'placement-not-offered/not-declared'], ['slack', 'root', 'thread', 'thread'], ['slack', 'root', 'thread+chat', 'thread+chat'],
  ['slack', 'thread', null, 'thread*parent-in-thread'], ['slack', 'thread', 'thread+chat', 'thread+chat'], ['slack', 'thread', 'quote', 'placement-not-offered/not-declared'],
  ['telegram', 'none', null, 'chat'], ['telegram', 'root', null, 'quote*root'], ['telegram', 'root', 'thread', 'placement-not-offered/not-declared'], ['telegram', 'root', 'thread+chat', 'placement-not-offered/not-declared'],
  ['telegram', 'thread', null, 'placement-not-offered/parent-in-thread'],
  ['gmail', 'none', null, 'chat'], ['gmail', 'root', null, 'quote*root'], ['gmail', 'root', 'thread', 'placement-not-offered/not-declared'],
  ['webhook', 'none', null, 'chat'], ['webhook', 'root', null, 'quote*root'], ['webhook', 'root', 'thread', 'placement-not-offered/not-declared'], ['webhook', 'thread', null, 'placement-not-offered/parent-in-thread'],
  ['agents', 'none', null, 'chat'], ['agents', 'root', null, 'placement-not-offered/no-replies'], ['agents', 'root', 'quote', 'placement-not-offered/not-declared'],
  ['fake', 'none', null, 'chat'], ['fake', 'root', null, 'quote*root'], ['fake', 'root', 'thread', 'thread'], ['fake', 'root', 'thread+chat', 'thread+chat'], ['fake', 'thread', null, 'thread*parent-in-thread'], ['fake', 'thread', 'quote', 'placement-not-offered/parent-in-thread'],
  ['fake-push', 'none', null, 'placement-not-offered/not-declared'],
  ['lark', 'root', 'broadcast', 'bad-proposal/placement'],
];
/** THE CLAMP ROWS — a declaration can never widen a control: [caps, the placements offered]. */
const CLAMP_ROWS = [
  [{ sendAs: [], threads: { placements: ['chat', 'quote'] } }, []],
  [{ sendAs: ['user'], threads: { replyInto: false, placements: ['chat', 'thread', 'thread+chat'] } }, ['chat']],
  [{ sendAs: ['user'], threads: { replyInto: true, placements: ['chat', 'thread+chat'] } }, ['chat']],
  [null, []],
  [{ sendAs: ['user'], threads: { read: 'vendor', replyInto: true, listing: 'inline' } }, ['chat', 'quote', 'thread']],   // the pre-enum reading
  [{ sendAs: ['user'] }, ['chat', 'quote']],
];
const runClamp = (PM) => CLAMP_ROWS.filter(([c, want]) => J(PM.placementsOf(c)) !== J(want)).map(([c, want]) => `${J(c)} → ${J(PM.placementsOf(c))} ≠ ${J(want)}`);
/** Run the table against a policy module; the failing rows' descriptions. */
function runTable(PM) {
  const bad = [];
  for (const [vendor, msg, asked, want] of ROWS) {
    const v = PM.placementVerdict({ requested: asked, replyTo: msg === 'none' ? null : 'm-1', caps: VENDORS[vendor], parent: msg === 'thread' ? { inThread: true } : msg === 'root' ? { inThread: false } : null });
    const [wantPl, wantRule] = want.split('*');
    const got = v.ok ? v.placement : `${v.code}/${v.why}`;
    const ruleOk = !wantRule || (v.ok && v.defaulted === true && v.rule === wantRule);
    const wordsOk = v.ok || (typeof v.error === 'string' && v.error.length > 10 && (v.why !== 'not-declared' || v.error.includes('offered here: ')));
    if (got !== wantPl || !ruleOk || !wordsOk) bad.push(`${vendor}/${msg}/${asked} → ${got}${v.ok ? ` (${v.rule}${v.defaulted ? ', default' : ''})` : ''} ≠ ${want}`);
  }
  return bad;
}
console.log('① the placement table per vendor (PURE policy)');
{
  for (const [k, c] of Object.entries(VENDORS)) { let e = null; try { CH.validateCaps(k, c); } catch (x) { e = x.message; } ok(!e, `${k}'s row is a LEGAL declaration (validateCaps) — placements ${J(P.placementsOf(c))}, rootReply ${J(P.rootReplyOf(c))}`, e); }
  const bad = runTable(P);
  ok(bad.length === 0, `all ${ROWS.length} rows hold: the vendor's norm for --to alone (a message in a thread ⇒ thread; outside one ⇒ Lark / Telegram / Gmail quote, Slack thread), an undeclared placement refused with what IS offered, a quote of a threaded message refused, the shapes`, bad.join(' | '));
  const nd = P.placementVerdict({ requested: 'thread+chat', replyTo: 'm-1', caps: lark.caps });
  ok(nd.code === 'placement-not-offered' && J(nd.offered) === J(['chat', 'quote', 'thread']) && nd.placement === 'thread+chat' && /offered here: chat, quote, thread/.test(nd.error), 'a refusal NAMES the placement asked and what the channel offers (the agent reads it verbatim)', J(nd));
  const pit = P.placementVerdict({ requested: 'quote', replyTo: 'm-1', caps: SLACK });
  ok(pit.why === 'not-declared' && /thread\+chat \(in the thread and also in the chat\)/.test(pit.error), 'Slack offers no quote — refused not-declared, the offered list says what thread+chat means', pit.error);
  // the pre-enum reading (a suite's scripted module) and the CLAMP (a declaration can never widen a control)
  const LEGACY = { sendAs: ['user'], threads: { read: 'vendor', replyInto: true, listing: 'inline' } };
  ok(P.rootReplyOf(LEGACY) === 'quote' && P.rootReplyOf({ sendAs: ['user'] }) === 'quote' && P.rootReplyOf({ sendAs: [] }) === null, 'a row with no `placements` reads as the pre-enum contract: a reply in the list (quote) is its norm');
  const bc = runClamp(P);
  ok(bc.length === 0, `THE CLAMP (${CLAMP_ROWS.length} rows): a read-only adapter places nothing; a thread placement needs replyInto; thread+chat needs thread — whatever the declaration says; a row with none reads as chat, quote (+ thread where it replies into one)`, bc.join(' | '));
  ok(J(P.PLACEMENTS) === J(['chat', 'quote', 'thread', 'thread+chat']) && J(P.THREAD_PLACEMENTS) === J(['thread', 'thread+chat']) && P.isThreadPlacement('thread+chat') && !P.isThreadPlacement('quote'), 'the closed set, the two that land inside a thread');
}

// ── ② THE SHAPE + THE READ ALIAS ─────────────────────────────────────────
console.log('② the shape (validateProposal), the stored alias (placementOf), the receipt');
{
  const V = (x) => { const v = P.validateProposal({ text: 'x', ...x }); return v.ok ? `ok:${v.proposal.placement || '-'}${v.proposal.inThread ? '+inThread' : ''}${v.proposal.placementAlias ? '+alias' : ''}` : `why:${v.why}`; };
  const rows = [
    [{ inThread: true }, 'why:inThread'], [{ inThread: 'yes', replyTo: 'm' }, 'why:inThread'], [{ inThread: true, replyTo: 'm' }, 'ok:thread+inThread+alias'],
    [{ placement: 'thread' }, 'why:replyTo'], [{ placement: 'thread+chat' }, 'why:replyTo'], [{ placement: 'quote' }, 'why:replyTo'],
    [{ placement: 'chat', replyTo: 'm' }, 'why:placement'], [{ placement: 'nope', replyTo: 'm' }, 'why:placement'], [{ placement: 'quote', inThread: true, replyTo: 'm' }, 'why:placement'],
    [{ placement: 'thread', inThread: true, replyTo: 'm' }, 'ok:thread+inThread'], [{ placement: 'thread+chat', replyTo: 'm' }, 'ok:thread+chat+inThread'], [{ placement: 'quote', replyTo: 'm' }, 'ok:quote'],
    [{ replyTo: 'm' }, 'ok:-'], [{}, 'ok:-'], [{ placement: 'chat' }, 'ok:chat'],
  ];
  const badV = rows.filter(([x, want]) => V(x) !== want).map(([x, want]) => `${J(x)} → ${V(x)} ≠ ${want}`);
  ok(badV.length === 0, `validateProposal: ${rows.length} shapes — a reply placement names its message, chat names none, the old inThread boolean is the alias of thread (and still refused as why:inThread without a parent), a contradiction is refused`, badV.join(' | '));
  ok(!('placement' in P.validateProposal({ text: 'x' }).proposal) && P.validateCompose({ text: 'x', to: 'a@example.com', subject: 's' }).proposal.placement === undefined, 'a plain draft and a composed message carry no placement field (the engine decides and stores it)');
  const alias = [
    [{ placement: 'thread+chat', replyTo: 'm', inThread: true }, 'thread+chat'], [{ inThread: true, replyTo: 'm' }, 'thread'], [{ replyTo: 'm' }, 'quote'], [{}, 'chat'],
    [{ placement: 'bogus', replyTo: 'm' }, 'quote'], [{ compose: { to: ['a@example.com'] } }, null], [{ kind: 'reaction', reaction: { msg: 'm' } }, null],
  ];
  const badA = alias.filter(([x, want]) => P.placementOf(x) !== want).map(([x, want]) => `${J(x)} → ${P.placementOf(x)} ≠ ${want}`);
  ok(badA.length === 0, 'placementOf — THE READ ALIAS: a stored proposal with no placement and inThread:true reads thread; with only a replyTo, quote; a compose / a reaction is no reply', badA.join(' | '));
  const base = { id: 'p-1', adapterId: 'a', convId: 'c', state: 'sent', sendAs: 'user', identity: { marking: 'none' } };
  const block = (x) => P.renderReceiptBlock(P.receiptFor({ ...base, ...x }), { adapterLabel: 'Lark', title: 'Ops' });
  const bQ = block({ placement: 'quote', replyTo: 'm' }), bT = block({ placement: 'thread', inThread: true, replyTo: 'm', threadKey: 'omt_1' }), bB = block({ placement: 'thread+chat', inThread: true, replyTo: 'm', threadKey: 'omt_1' }), bC = block({ placement: 'chat' }), bL = block({ inThread: true, replyTo: 'm', threadKey: 'omt_old' });
  ok(/\nplaced as a quoted reply, in the chat\n/.test(bQ) && /\nplaced in a thread \(thread omt_1\)\n/.test(bT) && /\nplaced in a thread, and also shown in the chat \(thread omt_1\)\n/.test(bB) && !/placed/.test(bC) && /\nplaced in a thread \(thread omt_old\)\n/.test(bL), 'the RECEIPT says where the reply landed (a quote / a thread / a thread + the chat, the thread named); a plain message says nothing; a proposal stored before the enum still reads "in a thread"', J([bQ, bT, bB, bL].map((b) => b.split('\n')[2])));
  const rQ = P.receiptFor({ ...base, placement: 'quote', replyTo: 'm' }), rT = P.receiptFor({ ...base, placement: 'thread', inThread: true, replyTo: 'm', threadKey: 'omt_1' });
  ok(rQ.placement === 'quote' && !('inThread' in rQ) && rT.placement === 'thread' && rT.inThread === true && rT.threadKey === 'omt_1', 'the receipt STRUCTURE: `placement`, and `inThread` + `threadKey` beside a thread one (the alias older readers know)');
  const wh = P.renderReceiptBlock(P.receiptFor({ ...base, placement: 'thread', inThread: true, replyTo: 'm', threadKey: 'omt_secret' }), { withheld: true });
  ok(!/placed|omt_secret/.test(wh), 'a WITHHELD receipt (the drafter lost access) says no placement and no thread id', wh);
}

// ── ③ THE CAPS-ROW CENSUS ────────────────────────────────────────────────
console.log('③ the caps-row census: every adapter declares its placements');
/** Every adapter MODULE under src/channels/ (grep-derived: each file's exported {kind, caps, create} objects). */
function adapterModules() {
  const out = new Map();
  const adaptersDir = path.join(REPO, 'src/channels');   // READ only (a name of its own: test-architecture §51 judges writes by variable name)
  for (const f of fs.readdirSync(adaptersDir).filter((x) => x.endsWith('.js') && x !== 'index.js').sort()) {
    const m = require(path.join(adaptersDir, f));
    const cands = [m, ...Object.values(m)];
    for (const c of cands) if (c && typeof c === 'object' && typeof c.kind === 'string' && c.caps && typeof c.create === 'function' && !out.has(c.kind)) out.set(c.kind, { file: f, mod: c });
  }
  return out;
}
/** The census over modules: the kinds whose `threads` row does not declare `placements` explicitly. */
const censusFindings = (mods) => [...mods].filter(([, x]) => !(x.mod.caps.threads && Array.isArray(x.mod.caps.threads.placements))).map(([k]) => k);
{
  const mods = adapterModules();
  const kinds = [...mods.keys()].sort();
  // the engine's built-in list (what a server registers) is the SAME set: parsed from its source, never retyped
  const esrc = engineSource(REPO);
  const builtin = /for \(const mod of \[([^\]]+)\]\)/.exec(esrc);
  const real = /^const MANIFESTS = Object\.freeze\(\[([^\]]+)\]/m.exec(read('src/channels/registry-list.js'));   // lane dc-channels-manifest: REAL_ADAPTERS derives from the vendor list
  ok(kinds.length >= 6 && ['agents', 'fake-poll', 'fake-push', 'fake-scan', 'gmail', 'lark'].every((k) => kinds.includes(k)), `the census reads ${kinds.length} adapter modules under src/channels/: ${kinds.join(', ')}`);
  ok(!!builtin && /fake\.fakePoll/.test(builtin[1]) && /agents/.test(builtin[1]) && /REAL_ADAPTERS/.test(builtin[1]) && !!real && /lark/.test(real[1]) && /gmail/.test(real[1]), 'the engine registers exactly these (its built-in loop + REAL_ADAPTERS name the fakes, agents, lark, gmail — all in the census)', builtin && builtin[1]);
  const missing = censusFindings(mods);
  ok(missing.length === 0, 'EVERY adapter declares `threads.placements` explicitly (no module rides the pre-enum reading)', missing.join(', '));
  const table = kinds.map((k) => { const c = mods.get(k).mod.caps; let e = null; try { CH.validateCaps(k, c); } catch (x) { e = x.message; } return { k, placements: P.placementsOf(c), declared: c.threads.placements, rootReply: c.threads.rootReply === undefined ? null : c.threads.rootReply, e }; });
  for (const r of table) console.log(`    ${r.k.padEnd(10)} placements ${J(r.placements).padEnd(40)} rootReply ${r.rootReply}`);
  ok(table.every((r) => !r.e && J(r.placements) === J(r.declared.filter((x) => P.PLACEMENTS.includes(x)).sort((a, b) => P.PLACEMENTS.indexOf(a) - P.PLACEMENTS.indexOf(b)))), 'every declaration is legal (validateCaps) and COHERENT — the clamp removes nothing from any shipped row', J(table.filter((r) => r.e)));
  ok(J(P.placementsOf(fake.fakePoll.caps)) === J(P.PLACEMENTS) && fake.fakePoll.caps.threads.rootReply === 'quote' && J(P.placementsOf(fake.fakePush.caps)) === '[]' && J(P.placementsOf(fake.fakeScan.caps)) === J(['chat', 'quote']), 'the FAKE declares all four (fake-poll — the vendor-free leg of every placement); the read-only push fake none; the scan fake a chat + a quote (a reply chain)');
  ok(J(P.placementsOf(lark.caps)) === J(['chat', 'quote', 'thread']) && P.rootReplyOf(lark.caps) === 'quote' && J(P.placementsOf(gmail.caps)) === J(['chat', 'quote']) && J(P.placementsOf(agents.caps)) === J(['chat']) && P.rootReplyOf(agents.caps) === null, 'Lark: chat / quote / thread, the norm a quote (threads are opt-in); Gmail: chat / quote; Agents: chat only (the ladder answers no message)');
  // THE CENSUS'S OWN CONTROL: a planted module with a threads row and no placements is FOUND
  const planted = new Map([...mods, ['planted', { file: 'planted.js', mod: { kind: 'planted', create() { }, caps: { ...lark.caps, threads: { read: 'vendor', replyInto: true, listing: 'separate' } } } }]]);
  ok(J(censusFindings(planted)) === J(['planted']), 'CONTROL: a planted adapter whose threads row names no placements is found by the census (red)', J(censusFindings(planted)));
  // validateCaps: every refusal, by name
  const good = { receive: 'poll', history: 'page', sendAs: ['user'], identityMarking: 'none' };
  const TH = { read: 'vendor', replyInto: true, listing: 'separate', placements: ['chat', 'quote', 'thread'], rootReply: 'quote' };
  const refuse = (threads, sendAs, re, name) => { let e = null; try { CH.validateCaps('x', { ...good, sendAs: sendAs || good.sendAs, threads }); } catch (x) { e = x.message; } ok(!!e && re.test(e), name, e); };
  refuse({ ...TH, placements: 'chat' }, null, /placements must be an array/, 'validateCaps: placements that are not a list are refused');
  refuse({ ...TH, placements: ['chat', 'broadcast', 'thread'] }, null, /holds "broadcast"/, 'validateCaps: a placement outside the closed set is refused by name');
  refuse({ ...TH, placements: ['chat', 'chat', 'thread'] }, null, /twice/, 'validateCaps: a placement named twice is refused');
  refuse({ ...TH, replyInto: false, placements: ['chat'], rootReply: undefined }, [], /read-only adapter/, 'validateCaps: placements on a read-only adapter are refused (a placement is where a SENT message lands)');
  refuse({ ...TH, replyInto: false }, null, /replyInto and placements disagree/, "validateCaps: 'thread' declared with replyInto:false is refused");
  refuse({ ...TH, placements: ['chat', 'quote'] }, null, /replyInto and placements disagree/, "validateCaps: replyInto:true without 'thread' is refused");
  refuse({ ...TH, placements: ['chat', 'quote', 'thread+chat'], replyInto: false }, null, /'thread\+chat' without 'thread'/, "validateCaps: 'thread+chat' without 'thread' is refused");
  refuse({ ...TH, rootReply: 'thread+chat' }, null, /rootReply must be one of the declared quote\|thread/, 'validateCaps: a rootReply that is not a declared quote / thread is refused');
  refuse({ ...TH, placements: ['chat', 'thread'], rootReply: 'quote' }, null, /rootReply must be one of the declared thread/, 'validateCaps: a rootReply the row does not declare is refused');
  refuse({ read: 'none', replyInto: false, listing: 'none', placements: ['chat'], rootReply: 'quote' }, null, /nothing answers a message/, 'validateCaps: a rootReply on a chat-only row is refused');
  refuse({ ...TH, placements: ['chat', 'quote'], replyInto: false, rootReply: undefined }, null, /rootReply must be one of the declared quote/, 'validateCaps: a row that answers messages must name its norm (rootReply)');
  refuse({ read: 'vendor', replyInto: true, listing: 'separate', rootReply: 'quote' }, null, /rootReply without caps\.threads\.placements/, 'validateCaps: a rootReply with no placements is refused');
}

// ── ④ THE ADAPTER CONTRACT'S SEND ────────────────────────────────────────
console.log('④ the registry\'s send: a module only ever receives a declared placement');
/** A scripted module with a Lark-shaped placement row; `got` records what each send was handed. */
function scriptedSend(CHM, { kind = 'pl-contract', sendAs = ['user'], threads = { read: 'vendor', replyInto: true, listing: 'inline', placements: ['chat', 'quote', 'thread'], rootReply: 'quote' } } = {}) {
  const got = [];
  const reg = CHM.createChannelRegistry();
  reg.register({
    kind, caps: { receive: 'poll', history: 'page', sendAs, identityMarking: 'none', idempotency: 'key', threads },
    create() { return { async history() { return { records: [], anchor: null, reachedAnchor: true }; }, async convCaps() { return { read: 'yes', sendAs, at: Date.now() }; }, ...(sendAs.length ? { async send(convId, o) { got.push(o); return { ok: true, vendorMessageId: 'v', at: 1, sentAs: 'user' }; }, async reconcile() { return { unknown: true }; } } : {}) }; },
  });
  return { got, a: reg.create(kind, { id: kind }, {}) };
}
async function sendLegs(CHM) {
  const { got, a } = scriptedSend(CHM);
  const run = async (o) => { const n = got.length; let e = null; try { await a.send('c', { text: 't', idemKey: 'k', as: 'user', ...o }); } catch (x) { e = x; } return { e, o: got.length > n ? got[got.length - 1] : null }; };
  return { thread: await run({ replyTo: 'm', placement: 'thread' }), quoteDefault: await run({ replyTo: 'm' }), alias: await run({ replyTo: 'm', inThread: true }), chat: await run({}), both: await run({ replyTo: 'm', placement: 'thread+chat' }), chatMsg: await run({ replyTo: 'm', placement: 'chat' }), quoteNoMsg: await run({ placement: 'quote' }), bogus: await run({ replyTo: 'm', placement: 'broadcast' }) };
}
const contractHolds = (L) => !!(L.thread.o && L.thread.o.placement === 'thread' && L.thread.o.inThread === true && L.quoteDefault.o && L.quoteDefault.o.placement === 'quote' && !('inThread' in L.quoteDefault.o) && L.alias.o && L.alias.o.placement === 'thread' && L.alias.o.inThread === true && L.chat.o && L.chat.o.placement === 'chat'
  && ['both', 'chatMsg', 'quoteNoMsg', 'bogus'].every((k) => L[k].e && L[k].e.code === 'not-supported' && !L[k].o));
{
  const L = await sendLegs(CH);
  ok(L.thread.o && L.thread.o.placement === 'thread' && L.thread.o.inThread === true && L.thread.o.replyTo === 'm', 'a declared `thread` reaches the module with `inThread: true` beside it (the alias an older module reads)', J(L.thread.o));
  ok(L.quoteDefault.o && L.quoteDefault.o.placement === 'quote' && !('inThread' in L.quoteDefault.o) && L.alias.o && L.alias.o.placement === 'thread' && L.alias.o.inThread === true && L.chat.o && L.chat.o.placement === 'chat', 'a caller that names no placement is read the pre-enum way: a replyTo ⇒ quote, inThread ⇒ thread, nothing ⇒ chat — the module always receives one', J([L.quoteDefault.o, L.alias.o, L.chat.o]));
  ok(['both', 'chatMsg', 'quoteNoMsg', 'bogus'].every((k) => L[k].e && L[k].e.code === 'not-supported' && !L[k].o) && /not declared by caps\.threads\.placements \(chat\|quote\|thread\)/.test(L.both.e.message), 'an undeclared placement, chat WITH a message, a reply placement WITHOUT one, an unknown word ⇒ `not-supported` BEFORE the module runs (it received nothing)', J(['both', 'chatMsg', 'quoteNoMsg', 'bogus'].map((k) => L[k].e && L[k].e.message)));
  ok(contractHolds(L), 'the contract as ONE predicate (the control below judges the unguarded copy with it)');
  const ro = scriptedSend(CH, { kind: 'pl-readonly', sendAs: [], threads: { read: 'vendor', replyInto: false, listing: 'inline', placements: [] } });
  let roE = null; try { await ro.a.send('c', { text: 't', replyTo: 'm', placement: 'thread' }); } catch (x) { roE = x; }
  ok(roE && roE.code === 'send-not-available', 'a READ-ONLY adapter still answers `send-not-available` first (the gate\'s word — never a placement refusal)', roE && roE.code);
  const fr = CH.createChannelRegistry(); fr.register(fake.fakePoll);
  const fa = fr.create('fake-poll', { id: 'fake-poll' }, {});
  const fs1 = await fa.send('fake-poll-ops', { text: 'broadcast me', idemKey: 'k-b', as: 'user', replyTo: 'x-1', placement: 'thread+chat' });
  ok(fs1.ok && fs1.observed.placement === 'thread+chat' && fs1.observed.alsoInChat === true && !!fs1.observed.threadKey, 'the FAKE sends `thread+chat` (lands in the thread, echoed to the chat — Slack\'s reply_broadcast) and says so', J(fs1.observed));
}

// ── ⑤ THE ENGINE ─────────────────────────────────────────────────────────
console.log('⑤ the engine: decided before a proposal exists, stored, sent, receipted');
const engines = [];
async function engineLeg() {
  const T1 = Date.now() - 3600e3;
  const CID = 'ops';
  const mint = (A, vendorId, text, over = {}, i = 0) => REC.makeRecord({ adapterId: A, convId: CID, vendorId, at: T1 + i * 1000, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, threadKey: null, ...over });
  const sent = {};
  const modFor = (kind, threads) => ({
    kind,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'none', threads },
    create() {
      const recs = [mint(kind, 'm-1', 'a plain question', {}, 1), mint(kind, 'm-root', 'the topic head', { threadKey: 'omt_t' }, 2), mint(kind, 'm-r1', 'a reply inside', { threadKey: 'omt_t', replyTo: 'm-root', root: 'm-root' }, 3)];
      let n = 0;
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { return { conversations: [REC.makeConversation({ id: CID, vendorId: CID, title: 'Ops', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now(), threads: { replyInto: threads.replyInto, mode: 'thread', why: null } }; },
        async history(convId, { anchor = null, limit = 50 } = {}) { let idx = 0; if (anchor) { const at = recs.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; } const page = recs.slice(idx, idx + limit); return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: idx + page.length >= recs.length, complete: true }; },
        async send(convId, o) { (sent[kind] || (sent[kind] = [])).push({ placement: o.placement, inThread: o.inThread === true, replyTo: o.replyTo || null }); return { ok: true, vendorMessageId: `om-sent-${++n}`, at: Date.now(), sentAs: 'user', observed: o.inThread ? { threadKey: 'omt_t' } : {} }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  });
  const LK = 'pl-lark', SK = 'pl-slack';
  const registry = CH.createChannelRegistry();
  registry.register(modFor(LK, { read: 'vendor', replyInto: true, listing: 'inline', placements: ['chat', 'quote', 'thread'], rootReply: 'quote' }));
  registry.register(modFor(SK, { read: 'vendor', replyInto: true, listing: 'inline', placements: ['chat', 'thread', 'thread+chat'], rootReply: 'thread' }));
  const dir = path.join(ROOT, 'engine');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const row = (id) => ({ id, kind: id, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [row(LK), row(SK)] }));
  const ladder = { calls: [], stash: [], async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor(cid, env) { ladder.stash.push({ cid, ...env }); return { stored: true, why: null }; }, stashPeek(cid) { return ladder.stash.filter((x) => x.cid === cid); } };
  const eng = ENG.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: { log() { }, warn() { }, error() { } }, deliver: ladder, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], now: () => Date.now() });
  engines.push(eng);
  const AGP = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  const AG = { ...AGP, groups: [], msgLevelFor: () => 'none' };
  for (const A of [LK, SK]) { await eng.pass(A, { force: true }); await eng.pass(A, { force: true }); await eng.setAccess(A, { kind: 'conversation', convId: CID }, [{ principal: AGP, authority: 'draft' }]); }
  const count = () => Object.keys(eng.store.outbox.snapshot().proposals).length;
  const R = {};
  R.logged = ['m-1', 'm-root', 'm-r1'].every((v) => !!eng.store.findRecord(LK, CID, v));
  // Lark-shaped: --to alone on a message outside a thread ⇒ quote; inside one ⇒ thread; undeclared ⇒ refused, nothing created
  R.quote = await eng.propose(AG, LK, CID, { text: 'q', replyTo: 'm-1' });
  R.thread = await eng.propose(AG, LK, CID, { text: 't', replyTo: 'm-r1' });
  R.plain = await eng.propose(AG, LK, CID, { text: 'plain' });
  const before = count();
  R.both = await eng.propose(AG, LK, CID, { text: 'b', replyTo: 'm-1', placement: 'thread+chat' });
  R.quoteT = await eng.propose(AG, LK, CID, { text: 'qt', replyTo: 'm-r1', placement: 'quote' });
  R.createdOnRefusal = count() - before;
  // Slack-shaped: the norm for a root is the THREAD; a quote is not offered; thread+chat is
  R.sRoot = await eng.propose(AG, SK, CID, { text: 's', replyTo: 'm-1' });
  R.sQuote = await eng.propose(AG, SK, CID, { text: 'sq', replyTo: 'm-1', placement: 'quote' });
  R.sBoth = await eng.propose(AG, SK, CID, { text: 'sb', replyTo: 'm-1', placement: 'thread+chat' });
  // a proposal stored BEFORE the enum: only `inThread` (the alias) — read and sent as thread
  const legacyId = 'p-legacy-1';
  await eng.store.outbox.update((ob) => { const src = ob.proposals[R.thread.proposal.id]; const q = JSON.parse(JSON.stringify(src)); delete q.placement; delete q.replyQuote; delete q.placementDefaulted; q.id = legacyId; q.text = 'legacy'; q.originalText = 'legacy'; ob.proposals[legacyId] = q; });
  R.legacyView = eng.outboxView({ key: `${LK}/${CID}` }).proposals.find((p) => p.id === legacyId) || null;
  ladder.calls.length = 0; ladder.stash.length = 0;
  for (const id of [R.quote.proposal.id, R.thread.proposal.id, R.plain.proposal.id, R.sRoot.proposal.id, R.sBoth.proposal.id, legacyId]) R['ap-' + id] = await eng.approve(id);
  await eng.settleWakes();
  R.sent = sent;
  R.receipts = [...ladder.calls.map((c) => c.text), ...ladder.stash.map((c) => c.text || (c.env && c.env.text) || '')].join('\n---\n');
  R.stored = (id) => eng.store.outbox.snapshot().proposals[id];
  return R;
}
{
  const R = await engineLeg();
  ok(R.logged, 'setup: the three messages are in the log (a plain one, a vendor thread\'s root, a reply inside it)');
  const q = R.quote.proposal, t = R.thread.proposal, pl = R.plain.proposal;
  ok(R.quote.ok && q.placement === 'quote' && q.placementDefaulted === 'root' && !q.inThread && q.replyQuote && q.replyQuote.text === 'a plain question' && q.placementText === 'as a quoted reply, in the chat', 'Lark-shaped, --to alone on a message OUTSIDE a thread ⇒ stored `quote` (the vendor\'s norm, said as the default), the answered message quoted for the card', J(q && { placement: q.placement, d: q.placementDefaulted, rq: q.replyQuote }));
  ok(R.thread.ok && t.placement === 'thread' && t.placementDefaulted === 'parent-in-thread' && t.inThread === true && t.threadKey === 'omt_t' && t.threadQuote && t.threadQuote.text === 'a reply inside' && t.replyQuote.text === 'a reply inside', '…on a message INSIDE a vendor thread ⇒ stored `thread` (it cannot be quoted from the main list), with inThread + threadKey + threadQuote as the alias', J(t && { placement: t.placement, d: t.placementDefaulted, key: t.threadKey }));
  ok(R.plain.ok && pl.placement === 'chat' && !pl.replyQuote && !pl.inThread, 'no message ⇒ `chat`, nothing quoted');
  ok(!R.both.ok && R.both.code === 'placement-not-offered' && R.both.why === 'not-declared' && J(R.both.offered) === J(['chat', 'quote', 'thread']) && /offered here: chat, quote, thread/.test(R.both.error) && !R.quoteT.ok && R.quoteT.code === 'placement-not-offered' && R.quoteT.why === 'parent-in-thread' && R.createdOnRefusal === 0, 'thread+chat on a Lark-shaped row / a quote of a threaded message ⇒ `placement-not-offered`, worded, and NOTHING is created (0 proposals)', J([R.both, R.quoteT, R.createdOnRefusal]));
  ok(R.sRoot.ok && R.sRoot.proposal.placement === 'thread' && R.sRoot.proposal.placementDefaulted === 'root' && !R.sQuote.ok && R.sQuote.why === 'not-declared' && R.sBoth.ok && R.sBoth.proposal.placement === 'thread+chat' && R.sBoth.proposal.inThread === true, 'Slack-shaped: --to alone on a root ⇒ `thread` (the norm), a quote is not offered, thread+chat is stored (inThread beside it)', J([R.sRoot.proposal && R.sRoot.proposal.placement, R.sQuote.code, R.sBoth.proposal && R.sBoth.proposal.placement]));
  ok(R.legacyView && R.legacyView.placement === 'thread' && R.legacyView.placementText === 'in a thread' && !('placement' in R.stored('p-legacy-1')), 'a proposal stored BEFORE the enum (only inThread) is READ as `thread` — the alias, in the outbox view', J(R.legacyView && { placement: R.legacyView.placement, text: R.legacyView.placementText }));
  const L = R.sent['pl-lark'] || [], S = R.sent['pl-slack'] || [];
  ok(J(L) === J([{ placement: 'quote', inThread: false, replyTo: 'm-1' }, { placement: 'thread', inThread: true, replyTo: 'm-r1' }, { placement: 'chat', inThread: false, replyTo: null }, { placement: 'thread', inThread: true, replyTo: 'm-r1' }]), 'the APPROVE hands the adapter the stored placement (quote / thread / chat) — and the legacy proposal goes out as `thread`', J(L));
  ok(J(S) === J([{ placement: 'thread', inThread: true, replyTo: 'm-1' }, { placement: 'thread+chat', inThread: true, replyTo: 'm-1' }]), '…and the Slack-shaped adapter receives `thread` and `thread+chat`', J(S));
  ok(/placed as a quoted reply, in the chat/.test(R.receipts) && /placed in a thread \(thread omt_t\)/.test(R.receipts) && /placed in a thread, and also shown in the chat \(thread omt_t\)/.test(R.receipts), 'the RECEIPT the drafter is handed says where each reply landed', R.receipts.slice(0, 600));
  for (const e of engines) try { e.stop(); } catch { }
}

// ── ⑥ THE WORDS ──────────────────────────────────────────────────────────
console.log('⑥ the words: the card, the refusal, the touch row — zh / ja / en');
{
  const dictOf = (f) => { const m = new Map(); for (const ln of read(f).split('\n')) { const x = /^  ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),?$/.exec(ln); if (x) { try { m.set(new Function('return ' + x[1])(), new Function('return ' + x[2])()); } catch { } } } return m; };
  const zh = dictOf('src/lib/i18n-zh.js'), ja = dictOf('src/lib/i18n-ja.js');
  const tFor = (d, keys) => (s, v) => { keys.add(s); const w = d ? (d.get(s) || s) : s; return v ? w.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : w; };
  const keys = new Set();
  const QUOTE = { author: 'Ada', text: '周会改到几点？' };
  const card = (d) => P.PLACEMENTS.map((pl) => [pl, P.placementText(pl, { t: tFor(d, keys), quote: QUOTE }), P.placementText(pl, { t: tFor(d, keys) })]);
  const refusals = (d) => [{ why: 'not-declared', placement: 'chat' }, { why: 'not-declared', placement: 'quote' }, { why: 'not-declared', placement: 'thread' }, { why: 'not-declared', placement: 'thread+chat' }, { why: 'parent-in-thread', placement: 'quote' }, { why: 'no-replies', placement: null }, { why: 'not-declared', placement: 'x' }].map((r) => P.placementRefusalText(r, { t: tFor(d, keys) }));
  const touch = (d) => P.PLACEMENTS.map((pl) => T.rowWords(T.foldTouches([T.normalizeTouch({ op: 'reply', adapterId: 'lark-1', convId: 'oc_x', at: 1, placement: pl })])[0], tFor(d, keys)));
  const en = { card: card(null), refusals: refusals(null), touch: touch(null) };
  const zhW = { card: card(zh), refusals: refusals(zh), touch: touch(zh) }, jaW = { card: card(ja), refusals: refusals(ja), touch: touch(ja) };
  for (const [lang, W] of [['en', en], ['zh', zhW], ['ja', jaW]]) {
    console.log(`    ${lang} card:  ${W.card.map(([pl, a]) => `${pl}: ${a}`).join(' | ')}`);
    console.log(`    ${lang} touch: ${W.touch.join(' | ')}`);
  }
  const missing = [...keys].filter((k) => !zh.has(k) || !ja.has(k));
  ok(missing.length === 0 && keys.size >= 16, `every word the placement surfaces draw is in BOTH dictionaries (${keys.size} keys: the card line with and without a quote, the refusal toast per why, the touch row per placement)`, missing.join(' | '));
  ok(en.card[0][1] === null && en.card[0][2] === null && /^Quoted reply — to Ada: "周会改到几点？"$/.test(en.card[1][1]) && /^Reply in thread — under Ada/.test(en.card[2][1]) && /^Reply in thread, also shown in the chat — under Ada/.test(en.card[3][1]) && en.card[1][2] === 'Quoted reply, shown in the chat', 'the CARD line (en): a quote / a thread / a thread + the chat, each with the answered message; a plain message draws NO line', J(en.card));
  ok(zhW.card[1][1].startsWith('引用回复') && zhW.card[3][1].includes('同时显示在聊天中') && jaW.card[1][1].startsWith('引用返信') && jaW.card[2][1].startsWith('スレッドで返信') && zhW.card.every(([, a], i) => !a || a !== en.card[i][1]), 'the card line in zh and ja is TRANSLATED (never the English)', J([zhW.card[1][1], jaW.card[1][1]]));
  ok(en.refusals[4] === 'That message is inside a thread — a reply to it goes in the thread' && new Set(en.refusals).size === en.refusals.length && zhW.refusals.every((x, i) => x !== en.refusals[i]) && jaW.refusals.every((x, i) => x !== en.refusals[i]), 'the REFUSAL toast has its own sentence per why / placement, translated in zh and ja', J(zhW.refusals));
  ok(J(en.touch) === J(['drafted a message', 'drafted a quoted reply', 'drafted a reply in a thread', 'drafted a reply in a thread, also shown in the chat']) && zhW.touch.every((x, i) => x !== en.touch[i]) && jaW.touch.every((x, i) => x !== en.touch[i]), 'the TOOL-CARD TOUCH row says where the drafted reply lands, per placement, in three languages', J(zhW.touch));
  ok(J(T.TOUCH_PLACEMENTS) === J(P.PLACEMENTS) && !('placement' in T.normalizeTouch({ op: 'reply', adapterId: 'a', convId: 'c', at: 1, placement: 'broadcast' })) && !('placement' in T.normalizeTouch({ op: 'read', adapterId: 'a', convId: 'c', at: 1, placement: 'thread' })) && T.rowWords(T.foldTouches([T.normalizeTouch({ op: 'reply', adapterId: 'a', convId: 'c', at: 1 })])[0], (s) => s) === 'drafted a reply', 'the touch record\'s closed set IS the policy\'s (a word outside it is dropped, a read carries none); a touch from before the placement still says "drafted a reply"');
  // WIRING PINS (the UNSTAGED-WIRING lesson): every surface CALLS the placement
  const PINS = [
    ['src/lib/channel-outbox.js', 'P.placementText(placement, { t, quote: anchored ? null : (p.replyQuote || p.threadQuote || null) })', 'the approval card (inline + the Outbox window: one renderer) draws the placement line (its own quote only without lane-pairing\'s "In reply to" row — ONE quote, the .197 integration)'],
    ['src/lib/channel-outbox.js', 'const placement = P.placementOf(p);', '…read through the alias'],
    ['src/lib/channel-words.js', "case 'placement-not-offered': return P.placementRefusalText(r, { t });", 'the refusal toast words the code'],
    ['src/agent-routes.js', "placement: r.proposal.placement || null }]);", 'the agent route hands the touch witness the placement'],
    ['src/agent-routes.js', "...(b.placement !== undefined ? { placement: b.placement } : {}) }, { mayWake:", 'the agent reply route passes `placement` to propose'],
    ['src/agent-routes.js', "r.code === 'placement-not-offered')) return rxAnswer(res, r);", '…and answers the refusal by name (409)'],
    ['src/routes/channels.js', "code === 'placement-not-offered' ? 409", 'the owner routes answer it 409'],
    ['src/lib/channel-thread-pane.js', "placement: 'thread', expectWakes: 0", 'the thread pane\'s composer asks for `thread`'],
    ['src/server/channels-outbound.js', 'const pv = P.placementVerdict({', 'the engine decides the placement before a proposal exists'],
    ['src/server/channels-outbound.js', 'onHandle, placement: P.placementOf(p), ...(anchor ? { replyAnchor: anchor } : {}),', 'sendNow hands the adapter the stored placement (through the alias) beside lane-pairing\'s stored anchor'],
    ['data/bin/vibespace-channels', "if (alsoInChat) body.placement = 'thread+chat';", 'the CLI sends --also-in-chat'],
  ];
  const unwired = PINS.filter(([f, s]) => !read(f).includes(s));
  ok(unwired.length === 0, `WIRING: ${PINS.length} call sites spell the placement (${PINS.map((x) => x[2]).slice(0, 3).join('; ')}; …)`, unwired.map((x) => `${x[0]}: ${x[2]}`).join(' | '));
  const routesSrc = read('src/routes/channels.js');
  ok((routesSrc.match(/\.\.\.\(b\.placement !== undefined \? \{ placement: b\.placement \} : \{\}\)/g) || []).length === 2, 'the owner\'s /propose AND /send both pass `placement` (the pane sends direct or proposes)');
}

// ── ⑦ CONTROLS ───────────────────────────────────────────────────────────
console.log('⑦ controls: patched copies turn their rows red');
const M = mutantCopies('placement', REPO);
{
  const SRC = read(POLICY);
  const cut = (src, from, to, tag) => { if (!src.includes(from)) throw new Error(`control ${tag}: the line to patch is gone — ${from.slice(0, 60)}`); return src.replace(from, to); };
  const PL3 = "    if (inThread && offered.includes('thread')) { placement = 'thread'; rule = 'parent-in-thread'; }";
  const c1 = M.load(POLICY, cut(SRC, PL3, '    if (false) { }', 'PL3'), 'pl3-blind');
  const b1 = runTable(c1);
  ok(b1.length >= 3 && b1.some((x) => x.startsWith('lark/thread/null')) && b1.some((x) => x.startsWith('slack/thread/null')), `CONTROL PL3 blind to the parent (always the root norm): ${b1.length} rows red — a reply to a threaded Lark message would be "quoted"`, b1.join(' | '));
  const PL5 = "  if (placement === 'quote' && inThread) return refuse(";
  const c2 = M.load(POLICY, cut(SRC, PL5, '  if (false) return refuse(', 'PL5'), 'pl5-gone');
  const b2 = runTable(c2);
  ok(b2.some((x) => x.startsWith('lark/thread/quote')) && b2.some((x) => x.startsWith('fake/thread/quote')), `CONTROL PL5 removed (a quote of a threaded message allowed): ${b2.length} rows red`, b2.join(' | '));
  const PL4 = "  if (!offered.includes(placement)) return refuse(placement, 'not-declared',";
  const c3 = M.load(POLICY, cut(SRC, PL4, "  if (false) return refuse(placement, 'not-declared',", 'PL4'), 'pl4-gone');
  const b3 = runTable(c3);
  ok(b3.some((x) => x.startsWith('lark/root/thread+chat')) && b3.some((x) => x.startsWith('slack/root/quote')), `CONTROL PL4 removed (an undeclared placement accepted): ${b3.length} rows red`, b3.join(' | '));
  const CLAMP = "  return PLACEMENTS.filter((x) => declared.includes(x) && (!isThreadPlacement(x) || replyInto) && (x !== 'thread+chat' || declared.includes('thread')));";
  const RO = '  if (!(Array.isArray(c.sendAs) && c.sendAs.length)) return [];';
  const c4 = M.load(POLICY, cut(cut(SRC, CLAMP, '  return PLACEMENTS.filter((x) => declared.includes(x));', 'clamp'), RO, '', 'ro'), 'unclamped');
  const b4 = runClamp(c4);
  ok(b4.length >= 3, `CONTROL the declaration unclamped: a read-only row places, thread without replyInto / thread+chat without thread are offered — ${b4.length} clamp rows red`, b4.join(' | '));
  // the registry's send without its guard: the module receives whatever it is handed
  const ISRC = read('src/channels/index.js');
  const G0 = ISRC.indexOf('      send: (() => {');
  const G1 = ISRC.indexOf('      })(),', G0);
  if (G0 < 0 || G1 < 0) throw new Error('control send-guard: the guarded send is gone');
  const c5 = M.load('src/channels/index.js', ISRC.slice(0, G0) + "      send: gated('send', impl.send && impl.send.bind(impl)),\n" + ISRC.slice(G1 + '      })(),'.length + 1), 'unguarded-send');
  const L5 = await sendLegs(c5);
  ok(!contractHolds(L5) && L5.both.o && L5.both.o.placement === 'thread+chat', 'CONTROL the registry\'s send without its guard: the module RECEIVES an undeclared thread+chat (the contract predicate goes red)', J(L5.both));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: 'placement: ' })) ok(r.pass, r.name, r.detail);
}

// ── design 012 (Slack S1): THE FIXTURE IS THE DECLARATION — the Slack row this table judges equals the shipped adapter's
// threads row (and S1 receives by poll), so a change to either is a change to both ──
{
  const real = require(path.join(REPO, 'src/channels/slack.js')).caps;
  ok(JSON.stringify(SLACK.threads) === JSON.stringify(real.threads) && SLACK.receive === real.receive && real.receive === 'poll' && SLACK.sendAs.join() === real.sendAs.join(), 'design 012: the Slack fixture row equals src/channels/slack.js\'s declaration (threads, receive poll, sendAs) — a census');
  ok(JSON.stringify({ ...SLACK.threads, rootReply: 'quote' }) !== JSON.stringify(real.threads), 'NEGATIVE CONTROL: a fixture whose rootReply drifted is not the declaration');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
