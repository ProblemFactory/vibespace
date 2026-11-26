// THE ATTENTION SUITES' SHARED HARNESS (B-0f37, lane bl-loop-a, 主开发 r5208): what scripts/test-decision-attention.mjs built for
// itself — the fake judge (an OpenAI-dialect provider), the wait on the fact, the decision engine over that judge, and section ⑩'s
// world (a chat account and TWO mail accounts that both got the same notice 19 min apart, built through the REAL channels engine)
// — moved here ONCE so scripts/test-attention-facts.mjs (B-0f37's legs) builds the very same world: nothing of it is copied.
// The code is the suite's as it was (r2988 / r4310 / r5012 there); `J` holds the provider's state, read and set by the suites.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** THE FAKE JUDGE: a record whose own part says URGENT needs you (0.86); `J.got` = every call, in order; `J.holdAt` / `J.holdP` hold
 *  the call numbered holdAt on a promise (`J.heldNow` while it sits there); `J.holdAll` holds EVERY call while it stands
 *  (`J.heldCount` = the calls sitting there); `J.inflight` / `J.maxIn` count the calls in flight */
export function createFakeJudge({ sleep }) {
  const J = { got: [], inflight: 0, maxIn: 0, holdAt: 0, holdP: null, heldNow: false, holdAll: null, heldCount: 0 };
  J.recordPart = (input) => String(input).split('———').pop();
  // the judge's request body is a ONE-SHOT stream (lane judge-one-shot-body) — a fake reads it like the wire does
  const bodyText = (init) => (typeof init.body === 'string' ? init.body : new Response(init.body).text());
  J.fetch = async function fakeFetch(url, opts) {
    J.inflight++; J.maxIn = Math.max(J.maxIn, J.inflight);
    const raw = await bodyText(opts), body = JSON.parse(raw);
    J.got.push({ url, body, raw, auth: opts.headers.authorization });
    if (J.holdP && J.got.length === J.holdAt) { J.heldNow = true; try { await J.holdP; } finally { J.heldNow = false; } }   // r4310: the hold's own fact
    if (J.holdAll) { J.heldCount++; try { await J.holdAll; } finally { J.heldCount--; } }   // r5012: the whole window held
    await sleep(40);
    J.inflight--;
    const hot = /URGENT/.test(J.recordPart(body.input));
    const P = { needs_now: hot ? 0.86 : 0.22, asks_me: hot ? 0.9 : 0.1, deadline_money: hot ? 0.75 : 0.05, money: /Lunch|Contract/.test(J.recordPart(body.input)) ? 0.9 : 0.1 };   // money: the draft's leg (the two "needs" examples)
    const answers = body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: P[q.name] !== undefined ? P[q.name] : 0.3 }));
    return { status: 200, ok: true, json: async () => ({ answers, usage: { input_tokens: Math.ceil(raw.length / 4) } }) };
  };
  return J;
}

/** THE DECISION ENGINE over the fake judge (D1's real engine; its key a dummy, riding the header only); `plug()` = the plugin row now */
export function createDecisionEngine({ REPO, fetch, now, quiet, plug }) {
  const require = createRequire(path.join(REPO, 'scripts', 'x.mjs'));
  const DE = require(path.join(REPO, 'src/server/decision-engine.js'));
  return (dataDir) => {
    const d = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-dummy-SECRET-123456', model: '' }, source: 'user' }) }, fetchImpl: fetch, now, log: quiet });
    d.attachPlugin({ peek: () => plug(), settings: () => plug().config || {} }); // lane plugin-settings-p0: the engine reads the settings rows
    return d;
  };
}

// r4310 (主开发; one UTC sighting in a whole gate at load 30+, green alone): «3 of 7 rows judged» — the old idle() polled 200 × 20 ms,
// a 4 s GUESS, and returned QUIETLY at its end. Under IO load each judgment's two durable journal writes (its reservation before the
// call, its journal line after) made the drain outlast the guess, and the next leg read the half-done drain as the product's answer.
// A WAIT IS ON THE FACT — the product's own idle() (nothing queued, flying or due) — with a GENEROUS bound whose expiry FAILS BY A
// NAMED HARNESS LINE; every wait of the suites goes through `until`
export function createWaits({ ok, sleep }) {
  const SETTLE_MS = 120000;
  async function until(fact, what, { boundMs = SETTLE_MS, say = ok } = {}) {
    const t0 = Date.now();
    while (!fact()) {
      if (Date.now() - t0 >= boundMs) { say(false, `HARNESS (r4310): ${typeof what === 'function' ? what() : what} — not within ${Math.round(boundMs / 1000)} s (the wait's bound, never the product's answer)`); return false; }
      await sleep(20);
    }
    return true;
  }
  const idle = (eng, opts = {}) => until(() => eng.attention.idle(), () => { const s = eng.attention.status(); return `the attention queue settles (still ${s.queued} queued, ${s.inFlight} in flight)`; }, opts);
  return { SETTLE_MS, until, idle };
}

/** SECTION ⑩'s WORLD (lane decision-attention-facts; r5012's two placed worlds): → its fixtures, its tables and `factsWorld(EM, tag,
 *  { early, walk, hold })` — a fresh data folder and decision engine each, the passes, the mark, the leg's digest, the drain idle */
export function createFactsWorld({ REPO, ROOT, T0, J, now, quiet, settings, setPlug, decisionEngine, until, idle }) {
  const require = createRequire(path.join(REPO, 'scripts', 'x.mjs'));
  const CH = require(path.join(REPO, 'src/channels/index.js'));
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const REC = require(path.join(REPO, 'src/channel-record.js'));
  // (T0: the suite's clock when the world is made)
  const person = (id, name) => ({ id, name, isSelf: false, isBot: false });
  const ME = { id: 'me1', name: 'Owner Person', isSelf: true, isBot: false };
  const CHAT = new Map([
    ['ops', { kind: 'group', title: 'Ops room', recs: Array.from({ length: 30 }, (_, i) => ({ vendorId: `ops-${i}`, at: T0 - (40 - i) * 60e3, author: person(i % 2 ? 'u2' : 'u3', i % 2 ? 'userR Q' : 'Kato Y'), text: `ops line ${i}: the quota for next week` })) }],
    ['launch', { kind: 'group', title: 'Launch', recs: [{ vendorId: 'l-0', at: T0 - 9 * 60e3, author: person('u4', 'Will R'), text: 'this one should be @Owner Person', mentions: [{ kind: 'person', id: 'me1', name: 'Owner Person' }] }] }],
    ['review', { kind: 'group', title: 'Review', recs: [{ vendorId: 'r-0', at: T0 - 20 * 60e3, author: ME, text: 'I pushed the fix' }, { vendorId: 'r-1', at: T0 - 8 * 60e3, author: person('u5', 'Ada K'), text: 'looks good, merging', replyTo: 'r-0' }] }],
    ['dm', { kind: 'dm', title: 'Ada K', recs: [{ vendorId: 'd-0', at: T0 - 7 * 60e3, author: person('u5', 'Ada K'), text: 'lunch at noon?' }] }],
  ]);
  const NOTICE = ['A new setting for OAuth clients.', '', 'You are receiving this because you administer the suite.', '', ...Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: the setting applies to agent clients; review them before the rollout.`), '', '© 2026 Example LLC, 1600 Example Parkway', 'You have received this mandatory update. Unsubscribe never applies.'].join('\n');
  const WS = person('workspace-noreply@example.com', 'The Workspace Team');
  const MAIL = {
    mail1: new Map([['n1', { kind: 'thread', title: '[Action Required] Mark AI agent OAuth clients', recs: [{ vendorId: 'n1-0', at: T0 - 30 * 60e3, author: WS, text: NOTICE, facts: [{ k: 'automated', v: 'notification' }] }] }],
      ['q1', { kind: 'thread', title: 'Re: licensing', recs: [{ vendorId: 'q1-0', at: T0 - 6 * 60e3, author: person('ann@example.com', 'Ann L'), text: 'Signed copy by Friday.\n\n-- \nAnn L | Partnerships\n\nOn Mon, Oct 12, 2026 at 9:14 AM Dana <\ndana@example.com> wrote:\n> Can you confirm the licensing terms?\n> QUOTED-TAIL' }] }]]),
    mail2: new Map([['n2', { kind: 'thread', title: 'Re: [Action Required] Mark AI agent OAuth clients', recs: [{ vendorId: 'n2-0', at: T0 - 11 * 60e3, author: WS, text: NOTICE }] }]]),
  };
  const mod = (kind, glyph) => ({
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true }, ...(glyph ? { glyph, facts: ['automated'] } : {}) },
    create(record) {
      const Wd = kind === 'chatx' ? CHAT : MAIL[record.id];
      const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {}, ...(m.mentions ? { mentions: m.mentions } : {}), ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.facts ? { facts: m.facts } : {}) });
      return {
        selfId: () => (kind === 'chatx' ? 'me1' : null),
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { return { conversations: [...Wd.entries()].map(([id, x]) => REC.makeConversation({ id, title: x.title, kind: x.kind, lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id) { const x = Wd.get(id); return { records: x.recs.map((m) => rec(id, m)), anchor: x.recs[x.recs.length - 1].vendorId, reachedAnchor: true, complete: true }; },
        async older() { return { records: [], exhausted: true }; },
      };
    },
  });
  const acct = (id, kind, label) => ({ id, kind, label, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  const registry = CH.createChannelRegistry();
  registry.register(mod('chatx', null));
  registry.register(mod('mailx', 'mail'));
  // the at-you / replied / direct facts claim those rows on the first screen: off here, so the judge sees them (preset "judge only")
  for (const r of ['at-you', 'replied', 'direct']) settings[`channels.attention.rule.${r}`] = false;
  const TITLES10 = ['Ops room', 'Launch', 'Review', 'Ada K', 'Re: licensing', '[Action Required] Mark AI agent OAuth clients', 'Re: [Action Required] Mark AI agent OAuth clients'];
  const factsOf = (g) => { const m = /\[record\]\nfacts: ([^\n]*)\n/.exec(String(g && g.body.input)); return m ? m[1] : null; };
  /** the world's calls by row: each title's calls, the rows never judged (by name), each row's facts from its LAST call (as it is now) */
  const factsTable = (calls) => {
    const per = Object.fromEntries(TITLES10.map((t) => [t, calls.filter((g) => J.recordPart(g.body.input).includes(`title: ${t}\n`))]));
    const missing = TITLES10.filter((t) => !per[t].length);
    const last = (t) => (per[t].length ? per[t][per[t].length - 1] : null);
    return { per, missing, last, F: Object.fromEntries(TITLES10.map((t) => [t, factsOf(last(t)) || ''])), counts: Object.fromEntries(TITLES10.map((t) => [t, per[t].length])) };
  };
  const exactOnce = (T, calls) => calls.length === TITLES10.length && TITLES10.every((t) => T.counts[t] === 1);
  const asksOf = (eng) => { const st = eng.attention.status(); return { calls: st.calls, memo: st.memo, refused: st.refused }; };
  const asksExact = (a) => a.calls === TITLES10.length && a.memo === 0 && a.refused === 0;
  const missingLine = (T) => (T.missing.length ? T.missing.map((t) => `the row «${t}» was never judged`).join('; ') : 'none missing');
  const factsWorld = async (EM, tag, { early = false, walk = null, hold = null } = {}) => {   // walk / hold: B-0f37's placed map walks (the engine's walk seam)
    const dataDir = path.join(ROOT, tag);
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acct('chat', 'chatx', 'Team chat'), acct('mail1', 'mailx', 'Work mail'), acct('mail2', 'mailx', 'Old mail')] }));
    const decision = decisionEngine(dataDir);
    const eng = EM.create({ dataDir, registry, env: {}, now, broadcast: () => { }, serverSetting: (k) => settings[k], liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision, ...(walk ? { walk } : {}) });
    if (hold) hold.eng = eng;
    const n0 = J.got.length;
    let openAll = null, placed = false, nBase = n0;
    if (early) J.holdAll = new Promise((r) => { openAll = r; });
    else setPlug({ enabled: true, config: { attention: false } });   // the content world: nothing queued before the leg's digest
    try {
      await eng.pass('chat', { force: true });
      if (early) placed = await until(() => { const st = eng.attention.status(); return J.heldCount > 0 && J.heldCount === st.inFlight && st.inFlight + st.queued === 4; },
        () => { const st = eng.attention.status(); return `${tag}: the chat pass's own four rows queued, its first calls sitting on the hold (${J.heldCount} held, ${st.inFlight} in flight, ${st.queued} queued)`; });
      for (const a of ['mail1', 'mail2']) await eng.pass(a, { force: true });
      await eng.markRead('chat', 'ops', CHAT.get('ops').recs[9].at);   // the owner read up to line 9 ⇒ 20 unread
      if (!early) { placed = J.got.length === n0 && eng.attention.status().queued === 0 && eng.attention.status().inFlight === 0; setPlug({ enabled: true, config: { attention: true } }); }
      nBase = J.got.length;   // ← where the release took its count base: after the passes and the mark
      eng.digest();
    } finally { if (early) { J.holdAll = null; openAll(); } setPlug({ enabled: true, config: { attention: true } }); }
    await idle(eng);
    const mine = J.got.slice(n0);
    return { eng, dataDir, placed, mine, afterBase: J.got.length - nBase, asks: asksOf(eng), T: factsTable(mine) };
  };
  return { CHAT, MAIL, registry, acct, TITLES10, factsOf, factsTable, exactOnce, asksOf, asksExact, missingLine, factsWorld };
}
