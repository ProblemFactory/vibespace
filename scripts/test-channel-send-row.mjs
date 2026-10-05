#!/usr/bin/env node
// test-channel-send-row — lane gmail-reply-known (2026-10-05): "not known yet" is never a resting state.
// A fleet user's OLD listed Gmail thread had no reply box: the window's open re-asked the row, the ONE metadata read
// was rate-limited, the refusal was SWALLOWED (`.catch(() => {})`), and the foot kept "the send capability is not
// known yet" — no reason, no retry. Now a refused lookup is WRITTEN into the row by name (why ∈
// CONV_CAPS_FAIL_WHYS, retryAt), said once in the journal, re-asked BY ITSELF at retryAt for an open window, again
// at the account's recovery, and the owner's Retry goes through a back-off. (The Gmail half — a listed thread needs
// no vendor call — is test-channels-gmail-shape ㉑.)
//   ① PURE: the closed why set has words (census over the engine's failure writer + Gmail's convCaps whys), the
//      row's retryAt read by convCapsState, the foot model per why (words, Retry, Re-authorize, "Checking…")
//   ② the REAL engine in-process over a fake adapter whose convCaps throws rate-limited {retryAfterSec:1} once:
//      the open leaves a NAMED row + ONE journal line, the auto re-ask at retryAt resolves it, the account's
//      back-off refuses a non-owner lookup by name, the recovery hook re-asks an open window, the owner's Retry
//      during a back-off goes through, 20 concurrent Retry presses = 1 lookup, an agent's propose is refused
//      with the reason + retryAt
//   ③ patched-copy CONTROLS: the swallow restored ⇒ the raw word; no auto re-ask ⇒ still refused; Retry not
//      exempt ⇒ the owner's press is refused by the back-off
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // .219 dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = require(path.join(REPO, 'src/channel-caps.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
const ROOT = scratch('chan-sendrow');
const engines = [];
const cleanup = () => { for (const e of engines) { try { e.stop(); } catch {} } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(143));
const MUTE = mutantCopies('chan-sendrow', REPO);
const ESRC = engineSource(REPO);

console.log('\n① PURE: the closed why set, the row, the foot');
{
  const W = C.CONV_CAPS_FAIL_WHYS;
  ok(Object.isFrozen(W) && W.join() === 'rate-limited,backoff,not-connected,vendor-error,auth-expired', 'the closed set of why a send row was not resolved', W.join());
  // CENSUS: every why the engine's failure writer can put into a convCaps row, and every why Gmail's convCaps
  // answers, has its own words — sendWhyText's `default: return String(why)` is unreachable for them
  const body = ESRC.slice(ESRC.indexOf('async function convCapsFailed('), ESRC.indexOf('async function retryConvCaps('));
  const whyExpr = (body.match(/const why = ([\s\S]*?);\n/) || [])[1] || '';
  const engineWhys = [...new Set([...whyExpr.matchAll(/\? '([a-z-]+)'/g)].map((m) => m[1]).concat([...whyExpr.matchAll(/: '([a-z-]+)'/g)].map((m) => m[1])))];
  ok(engineWhys.length === W.length && engineWhys.every((w) => W.includes(w)), `the engine's failure writer produces exactly the closed set (${engineWhys.join()})`);
  const gsrc = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
  const gcc = gsrc.slice(gsrc.indexOf('    async convCaps(convId'), gsrc.indexOf('    async replyEnvelope('));
  const gWhys = [...new Set([...gcc.matchAll(/why: '([a-z-]+)'/g)].map((m) => m[1]).concat(['send-scope-not-granted']))];
  const all = [...new Set([...W, ...engineWhys, ...gWhys, 'unknown', 'stale', 'checking'])];
  const bare = all.filter((w) => C.sendWhyText(w) === w);
  ok(gWhys.includes('not-a-member') && !bare.length, `sendWhyText words every engine-written / Gmail why — none falls to the default (${all.length} checked)`, bare.join());
  const t0 = Date.parse('2026-10-05T18:00:00Z');
  const row = { read: 'unknown', sendAs: [], why: 'rate-limited', detail: 'rate-limited', at: t0, retryAt: t0 + 7 * 60e3 };
  const st = C.convCapsState(row, t0 + 1000);
  ok(st.read === 'unknown' && st.why === 'rate-limited' && st.retryAt === row.retryAt, 'convCapsState reads a refused row: why + retryAt', JSON.stringify(st));
  const good = C.convCapsState({ read: 'yes', sendAs: ['user'], why: null, at: t0 }, t0 + 1000);
  ok(!('retryAt' in good) && C.offers({ sendAs: ['user'] }, row, 'send-as-user', t0 + 1000).why === 'rate-limited', 'a resolved row carries no retryAt; a refused row is not offered, by its own why');
  const t = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] !== undefined ? v[k] : `{${k}}`));
  const f1 = C.sendFoot(st, 'rate-limited', { t, vendor: 'Gmail' });
  ok(f1 && f1.state === 'failed' && f1.retry && !f1.reauth && /^Gmail is rate-limiting this account — the reply box returns when it answers \(retrying at \d\d:\d\d\)$/.test(f1.text), 'the foot: "Gmail is rate-limiting this account … (retrying at HH:MM)" + Retry', f1 && f1.text);
  const f2 = C.sendFoot({ ...st, why: 'backoff' }, 'backoff', { t, vendor: 'Gmail' });
  ok(f2 && /paused after repeated vendor errors/.test(f2.text) && f2.retry, 'backoff: paused after repeated vendor errors + Retry', f2 && f2.text);
  const f3 = C.sendFoot({ read: 'unknown', why: 'not-connected', retryAt: null }, 'not-connected', { t, vendor: 'Gmail' });
  ok(f3 && f3.reauth && f3.retry && /not connected — Re-authorize/.test(f3.text) && !/retrying/.test(f3.text), 'not-connected: Re-authorize (no timer — the owner\'s step)', f3 && f3.text);
  const f4 = C.sendFoot(null, 'unknown', { t, checking: false });
  const f5 = C.sendFoot(st, 'rate-limited', { t, checking: true });
  ok(f4.state === 'checking' && f5.state === 'checking' && f4.text === 'Checking whether you can reply…' && !f4.retry, 'an unresolved / in-flight row reads "Checking whether you can reply…", never the raw word');
  ok(C.sendFoot(null, 'not-a-member', { t }) === null && C.sendFoot(null, 'send-scope-not-granted', { t }) === null, 'a RESOLVED refusal is not this foot (the caller\'s "Read-only here (why)")');
  // the words exist in zh / ja (npm run build's i18n check covers the keys; this pins the foot's own)
  for (const lang of ['zh', 'ja']) {
    const src = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf-8');
    const keys = ['Checking whether you can reply…', '{vendor} is rate-limiting this account — the reply box returns when it answers', '{sentence} (retrying at {time})', 'the vendor is rate-limiting this account — it is asked again by itself'];
    ok(keys.every((k) => src.includes(JSON.stringify(k) + ':')), `${lang}: the foot's sentences are translated`);
  }
}

console.log('\n② the REAL engine: a refused lookup is named, said once, retried by itself; Retry is exempt');
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
async function run(EM, tag) {
  const A = 'sr-' + tag, CID = 'ops', K = `${A}/${CID}`;
  const st = { calls: 0, fail: 0, listFail: false, gate: null };
  const warns = [];
  const modC = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'unknown', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata',
      threads: { read: 'chain', replyInto: false, listing: 'none' }, reactions: { read: 'list', add: true, remove: 'own', vocabulary: 'names', custom: 'none', perMessageMax: null } },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() {
          if (st.listFail) throw new CH.ChannelError('rate-limited', 'fake: Units per minute per user', { retryable: true, detail: { retryAfterSec: 30 } });
          return { conversations: [makeConversation({ id: CID, vendorId: CID, title: 'Ops', kind: 'group', participants: 'x', lastAt: null })], cursor: null, complete: true };
        },
        async convCaps() {
          st.calls++;
          if (st.gate) await st.gate.p;
          if (st.fail > 0) { st.fail--; throw new CH.ChannelError('rate-limited', 'fake: Quota exceeded … Units per minute per user', { retryable: true, detail: { retryAfterSec: 1 } }); }
          return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() };
        },
        async history() { const r = makeRecord({ adapterId: A, convId: CID, vendorId: 'c-1', at: Date.now() - 5000, author: { id: 'u', name: 'U' }, text: 'x' }); return { records: [r], anchor: 'c-1', reachedAnchor: true, complete: true }; },
        async send() { return { ok: true, vendorMessageId: 'c-sent', at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
        selfId() { return 'u-owner'; },
      };
    },
  };
  const dir = path.join(ROOT, 'eng-' + tag);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'sr', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(modC);
  const eng = EM.create({ dataDir: dir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn(m) { warns.push(String(m)); }, error() {} } });
  engines.push(eng);
  await eng.pass(A, { force: true });
  const clear = () => eng.store.index.update(() => { const en = eng.store.index.entry(A, CID, { create: false }); if (en) en.convCaps = null; });
  const row = () => (eng.store.index.peek(K) || {}).convCaps || null;
  const out = {};
  const safe = (pr) => pr.catch((err) => ({ thrown: (err && err.code) || String(err) }));   // a CONTROL copy throws where the real engine names
  // (a) the window's open on a never-resolved row while the vendor rate-limits the lookup
  await clear();
  st.fail = 1; const c0 = st.calls;
  const w = await eng.watch(A, CID);
  await sleep(80);
  const r1 = row(), v1 = eng.conversationView(A, CID);
  out.open = { ok: w.ok, asked: st.calls - c0, why: r1 && r1.why, retryIn: r1 && r1.retryAt ? r1.retryAt - Date.now() : null, viewWhy: v1.offers.sendAsUser.why, viewRetry: !!v1.convCaps.retryAt, checking: v1.convCapsChecking };
  out.said = warns.filter((m) => m.includes(K) && /send row not resolved \(rate-limited, retry \d\d:\d\dZ\)/.test(m)).length;
  // (b) the engine asks again BY ITSELF at retryAt (the window is still open)
  await sleep(1400);
  const r2 = row();
  out.auto = { read: r2 && r2.read, sendAs: r2 && r2.sendAs.join(), asked: st.calls - c0, offered: eng.conversationView(A, CID).offers.sendAsUser.offered };
  // (c) one journal line per (conversation, why) per 5 min
  await clear(); st.fail = 3;
  await safe(eng.refreshConvCaps(A, CID)); await safe(eng.refreshConvCaps(A, CID)); await safe(eng.refreshConvCaps(A, CID));
  out.saidAfter3 = warns.filter((m) => m.includes(K) && m.includes('send row not resolved (rate-limited')).length;
  st.fail = 0;
  // (d) the account's vendor back-off: a non-owner lookup is refused by NAME without asking; the recovery re-asks
  st.listFail = true;
  await eng.pass(A, { force: true });
  await clear(); const c1 = st.calls;
  const rb = await safe(eng.refreshConvCaps(A, CID, { polite: true }));   // a polite caller (the open, the own re-ask, propose)
  out.backoff = { why: rb && rb.why, asked: st.calls - c1, retryAt: !!(rb && rb.retryAt), view: eng.conversationView(A, CID).offers.sendAsUser.why };
  // (e) the owner's Retry during the back-off goes through
  const rr = await safe(eng.retryConvCaps(A, CID));
  out.retry = { ok: rr.ok, read: rr.convCaps && rr.convCaps.read, asked: st.calls - c1 };
  // (f) 20 concurrent Retry presses = ONE lookup
  await clear();
  let o; st.gate = { p: new Promise((r) => { o = r; }) };
  const c2 = st.calls;
  const presses = Array.from({ length: 20 }, () => safe(eng.retryConvCaps(A, CID)));
  await sleep(40);
  const mid = eng.conversationView(A, CID).convCapsChecking;
  o(); st.gate = null;
  const rs = await Promise.all(presses);
  out.storm = { asked: st.calls - c2, all: rs.every((r) => r.ok && r.convCaps && r.convCaps.read === 'yes'), checkingWhileInFlight: mid };
  // (g) the recovery hook: a refused row of an OPEN window is asked again when the account answers
  await clear();
  await safe(eng.refreshConvCaps(A, CID, { polite: true }));   // still in the back-off ⇒ 'backoff'
  const before = (row() || {}).why;
  st.listFail = false;
  const c3 = st.calls;
  await eng.watch(A, CID);   // the heartbeat (hot)
  await eng.pass(A, { force: true });
  await sleep(80);
  out.recover = { before, after: (row() || {}).read, asked: st.calls - c3 };
  // (h) an agent's reply on a refused row: refused with the same why + retryAt
  await eng.setAccess(A, { kind: 'conversation', convId: CID }, [{ principal: { kind: 'agent', id: 'agent-s', name: 'W' }, authority: 'draft' }]);
  await clear(); st.fail = 2;
  const AG = { kind: 'agent', id: 'agent-s', name: 'W', groups: [], msgLevelFor: () => 'none' };
  const p = await eng.propose(AG, A, CID, { text: 'hi', replyTo: 'c-1' });
  out.propose = { ok: p.ok, code: p.code, why: p.why, retryAt: !!p.retryAt, words: /rate-limited; asked again at /.test(p.error || '') };
  st.fail = 0;
  eng.stop();
  return out;
}
{
  const r = await run(ENG, 'real');
  const j = JSON.stringify(r);
  ok(r.open.ok && r.open.asked === 1 && r.open.why === 'rate-limited' && r.open.retryIn > 0 && r.open.retryIn <= 1100 && r.open.viewWhy === 'rate-limited' && r.open.viewRetry, 'the open\'s refused lookup is WRITTEN into the row: why rate-limited, retryAt = the vendor\'s Retry-After; the view names it', j);
  ok(r.said === 1, 'ONE journal line: "[channels] <key>: send row not resolved (rate-limited, retry HH:MMZ)"', j);
  ok(r.auto.read === 'yes' && r.auto.sendAs === 'user' && r.auto.asked === 2 && r.auto.offered, 'at retryAt the engine asks again BY ITSELF for the open window — the reply box returns', j);
  ok(r.saidAfter3 === 1, 'three refusals of the same (conversation, why) inside 5 min: still one journal line', j);
  ok(r.backoff.why === 'backoff' && r.backoff.asked === 0 && r.backoff.retryAt && r.backoff.view === 'backoff', 'inside the account\'s vendor back-off a polite non-owner lookup (the open, the own re-ask, propose) is refused by NAME (backoff, retryAt = the back-off\'s end) — the vendor is not asked', j);
  ok(r.retry.ok && r.retry.read === 'yes' && r.retry.asked === 1, 'the owner\'s Retry during the back-off goes through (exempt, as their refresh press is)', j);
  ok(r.storm.asked === 1 && r.storm.all && r.storm.checkingWhileInFlight === true, '20 concurrent Retry presses = ONE lookup; while it is in flight the view says checking', j);
  ok(r.recover.before === 'backoff' && r.recover.after === 'yes' && r.recover.asked === 1, 'the account answered again (a pass went through): the open window\'s refused row is re-asked at once', j);
  ok(r.propose.ok === false && r.propose.code === 'send-not-available' && r.propose.why === 'rate-limited' && r.propose.retryAt && r.propose.words, 'an agent\'s reply on a refused row: refused with the same why + when it is asked again', j);

  console.log('\n③ patched-copy CONTROLS');
  const SW = '      try { cc = await e.adapter.convCaps(convId, { listed }); } catch (err) { return convCapsFailed(rec, e, adapterId, convId, err); }';
  const AU = '        if (stopped || !isWatched(k)) return;   // the window closed: its next open asks';
  const EX = '      if (polite && !owner && inBackoff(e) && !(listed && heldByListing(rec)))';
  ok([SW, AU, EX].every((x) => ESRC.split(x).length === 2), 'CONTROL anchors: each patched line is in the engine once');
  const swallow = await run(MUTE.load('src/server/channels-engine.js', ESRC.replace(SW, '      cc = await e.adapter.convCaps(convId, { listed });'), 'swallow'), 'swallow');
  ok(swallow.open.why !== 'rate-limited' && swallow.open.viewWhy === 'unknown' && swallow.said === 0, `CONTROL: the swallow restored ⇒ the raw word ('${swallow.open.viewWhy}'), no journal line — ① would be red`, JSON.stringify(swallow.open));
  const noAuto = await run(MUTE.load('src/server/channels-engine.js', ESRC.replace(AU, '        return;'), 'no-auto'), 'noauto');
  ok(noAuto.auto.read === 'unknown' && noAuto.auto.asked === 1, 'CONTROL: no auto re-ask ⇒ the row is still refused after retryAt — ② would be red', JSON.stringify(noAuto.auto));
  const notExempt = await run(MUTE.load('src/server/channels-engine.js', ESRC.replace(EX, '      if (polite && inBackoff(e) && !(listed && heldByListing(rec)))'), 'not-exempt'), 'noexempt');
  ok(notExempt.retry.read !== 'yes' && notExempt.retry.asked === 0, 'CONTROL: Retry not exempt ⇒ the owner\'s press is refused by the back-off — ② would be red', JSON.stringify(notExempt.retry));
  for (const x of copiesCensus(MUTE.files, MUTE.dir, REPO, { minCopies: 3, label: '③ ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
