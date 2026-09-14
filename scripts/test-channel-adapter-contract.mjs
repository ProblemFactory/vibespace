#!/usr/bin/env node
// THE ADAPTER CONTRACT (docs/design-communication-panel.zh.md §4; gate row
// `test-channel-adapter-contract`). The conformance run: EVERY registered
// adapter — which in P0a means the three fakes, and in P1 means Lark and Gmail
// beside them — driven through every capability it declares, plus synthetic
// adapters that break each rule ON PURPOSE as the negative controls.
//
// Rules driven here:
//   · a DECLARED capability must be implemented; an UNDECLARED one THROWS
//   · every failure is a TYPED {code, retryable} from a CLOSED set; a bare
//     throw out of an adapter becomes one rather than a stack trace
//   · `history()` never returns records the caller did not ask for and reports
//     `reachedAnchor` honestly; it advances NOTHING
//   · `convCaps()` is never WIDER than `caps`
//   · on `sendAs: []`, `send()` is not a failure — it does not exist
//   · a `receive:'scan'` adapter declares scanSources + per-source scanLatency
//     + historyBySource covering every named source, and none of them 'none'
//   · THE GREP CENSUS: no call site outside src/channels/ branches on `kind`
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));

const reg = CH.createChannelRegistry();
for (const mod of [fake.fakePoll, fake.fakePush, fake.fakeScan]) reg.register(mod);
const REGISTERED = reg.list();
ok(REGISTERED.length === 3, `the P0 registry holds the three fakes (${REGISTERED.map((r) => r.kind).join(', ')})`);

// ── ① caps VALIDATION, each rule with its own violating declaration ──
{
  const good = { receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, history: 'page', sendAs: [], identityMarking: 'none' };
  const bad = (caps, re, label) => {
    const e = (() => { try { CH.validateCaps('synthetic', caps); return null; } catch (x) { return String(x.message); } })();
    ok(e && re.test(e), label, e || '(accepted — it should not have been)');
  };
  ok(CH.validateCaps('ok', good) === true, 'a complete declaration validates');
  bad({ ...good, receive: 'osmosis' }, /caps.receive must be one of/, 'an unknown receive mode is refused');
  bad({ ...good, sendAs: ['owner'] }, /caps.sendAs holds/, 'an unknown send identity is refused');
  bad({ ...good, identityMarking: 'maybe' }, /identityMarking/, 'an unknown identityMarking is refused (the approval card reads it)');
  bad({ ...good, receive: 'push' }, /pushTransport/, 'a push adapter must name its transport');
  bad({ ...good, receive: 'push', pushTransport: 'ws-long-conn' }, /pushAckBudgetMs/, 'a push adapter must state the vendor\'s ack deadline (fence 11 acks AFTER durability)');

  const scan = { ...good, receive: 'scan', history: null, scanSources: { darwin: 'store', linux: 'ui' }, scanLatency: { store: 15, ui: 300 }, historyBySource: { store: 'since', ui: 'page' } };
  ok(CH.validateCaps('scan', scan) === true, 'a complete scan declaration validates');
  bad({ ...scan, history: 'none' }, /may not declare history:'none'/, "NEGATIVE CONTROL (r4): receive:'scan' + history:'none' is refused — an adapter that cannot page can never report a COMPLETE pass, so its anchor could never advance");
  bad({ ...scan, scanSources: null }, /must declare scanSources/, 'NEGATIVE CONTROL (r5): a scan adapter with no per-platform scanSources is refused');
  bad({ ...scan, scanSources: {} }, /scanSources is empty/, 'an EMPTY scanSources is refused too (declaring nothing is not declaring a table)');
  bad({ ...scan, scanLatency: { store: 15 } }, /scanLatency is missing a number for 'ui'/, 'every named source needs its latency — it is the declared cadence AND the fs.watch debounce ceiling');
  bad({ ...scan, historyBySource: { store: 'since' } }, /historyBySource is missing 'ui'/, "NEGATIVE CONTROL (r6): a historyBySource missing a source its OWN scanSources names is refused");
  bad({ ...scan, historyBySource: { store: 'since', ui: 'none' } }, /may not be 'none'/, "NEGATIVE CONTROL (r6): historyBySource.ui === 'none' is refused");
  bad({ ...scan, scanSources: { darwin: 'telepathy' } }, /scanSources.darwin must be one of/, 'an unknown scan source is refused');
}

// A scan adapter's history() takes the RESOLVED source as an argument (r3 —
// the engine hands down `scanState().source`; the registry refuses a page
// without one). Gated on the capability ROW, never on a kind.
const srcOpts = (caps) => (caps.receive === 'scan' ? { source: Object.keys(caps.historyBySource)[0] } : {});

// ── ② every REGISTERED adapter, driven through what it declares ──
for (const { kind, caps } of REGISTERED) {
  const a = reg.create(kind, { id: kind });
  const say = (s) => `${kind}: ${s}`;

  const auth = await a.auth.state();
  ok(typeof auth.state === 'string', say('auth.state answers a state'));

  const listed = await a.listConversations({ limit: 10 });
  ok(Array.isArray(listed.conversations) && listed.conversations.length > 0, say('listConversations returns conversations'));
  const conv = listed.conversations[0];

  // history's two promises
  const page = await a.history(conv.id, { limit: 3, ...srcOpts(caps) });
  ok(page.records.length <= 3, say('history NEVER returns more records than the caller asked for'));
  ok(typeof page.reachedAnchor === 'boolean' && typeof page.complete === 'boolean', say('history reports reachedAnchor + complete as booleans (the store decides whether the cursor may advance)'));
  ok(page.reachedAnchor === false && page.complete === false, say('a PARTIAL page says so — `complete:false` means "do not advance"'));
  const rest = await a.history(conv.id, { anchor: page.anchor, limit: 100, ...srcOpts(caps) });
  ok(rest.reachedAnchor === true && rest.complete === true, say('draining from the anchor reports a COMPLETE pass'));
  const missing = await a.history(conv.id, { anchor: 'an-anchor-that-is-not-there', limit: 100, ...srcOpts(caps) });
  ok(missing.reachedAnchor === false && missing.complete === false, say('NEGATIVE CONTROL: an anchor it could NOT find is an incomplete pass — a pass that skipped is worse than one that re-reads'));

  // convCaps: three-valued, never wider than caps
  const cc = await a.convCaps(conv.id);
  ok(['yes', 'no', 'unknown'].includes(cc.read), say('convCaps.read is three-valued'));
  ok(cc.sendAs.every((s) => caps.sendAs.includes(s)), say('convCaps.sendAs ⊆ caps.sendAs'));
  ok(Number.isFinite(cc.at), say('convCaps carries the instant it was resolved (its TTL is read against it)'));
  const gone = await a.convCaps('a-conversation-that-does-not-exist');
  ok(gone.read === 'no' && gone.why, say('a conversation it cannot see answers with a REASON, never a silent empty'));

  // axis 2: send exists or it does not
  if (caps.sendAs.length) {
    const sent = await a.send(conv.id, { text: 'hi', idemKey: 'k1', as: caps.sendAs[0] });
    ok(sent.ok === true && sent.sentAs === caps.sendAs[0], say('a sendable adapter sends and says WHO it sent as'));
  } else {
    const e = await threw(() => a.send(conv.id, { text: 'hi' }));
    ok(e && e.code === 'send-not-available' && e.retryable === false, say('on `sendAs: []` send does NOT EXIST — typed `send-not-available`, never a failure the outbox would retry'), e && e.code);
  }

  // undeclared capabilities THROW rather than half-work
  if (caps.attachments !== 'fetch') {
    const e = await threw(() => a.fetchAttachment(conv.id, 'r', 'att', {}));
    ok(e && e.code === 'not-supported', say('an UNDECLARED capability throws `not-supported` (never a half-working degrade)'), e && e.code);
  }
  if (caps.receive !== 'scan') {
    const e = await threw(() => a.scanHost('local'));
    ok(e && e.code === 'not-supported', say('scanHost is not offered by a non-scan adapter'));
  }
  ok((caps.receive === 'push') === !!a.live, say('`live` exists exactly when receive is push'));
}

// ── ③ the three RECEIVE MODES really run ──
{
  // push: a real lane with a real timer, emitting state + events
  const p = reg.create('fake-push', { id: 'fake-push' });
  const states = [], events = [];
  const handle = p.live.start({ onState: (s) => states.push(s), onEvent: (e) => events.push(e) });
  ok(states.length === 1 && states[0].state === 'live', 'push: `live.start()` reports its state immediately (liveness is POSITIVE evidence, not an assumption)');
  handle.stop();
  ok(states[states.length - 1].state === 'stopped', 'push: stop() is terminal and SAYS so');

  // poll: the ordinary lane, already driven in ② — pin that it declares one
  ok(reg.capsOf('fake-poll').pollInterval.floor === 10, 'poll: the FLOOR is the vendor\'s, so it lives in caps');

  // scan: BOTH sources, over the SAME day of traffic
  const s = reg.create('fake-scan', { id: 'fake-scan' });
  const facts = await s.scanHost('local');
  ok(facts.platform && typeof facts.clientInstalled === 'boolean' && Number.isFinite(facts.at),
    'scan: scanHost answers facts about ONE machine and stamps them (hostId is a PARAMETER — the local box is device #0)');

  // THE SOURCE IS HANDED DOWN PER CALL (r3): the same instance reads either
  // source when told which — the adapter holds no source of its own.
  const A = (await s.history('fake-scan-ops', { limit: 99, source: 'store' })).records;
  const B = (await s.history('fake-scan-ops', { limit: 99, source: 'ui' })).records;
  const content = (r) => ({ at: r.at, text: r.text, author: r.author.id });
  ok(A.length > 0 && JSON.stringify(A.map(content)) === JSON.stringify(B.map(content)),
    `scan PARITY: the same day's traffic through 'store' and through 'ui' yields the same ${A.length} records`, `${A.length} vs ${B.length}`);
  ok(A.every((r) => r.raw.synthetic === false) && B.every((r) => r.raw.synthetic === true),
    "…and the ONLY difference is the key's provenance: 'store' uses the client's own id, 'ui' DECLARES a minted one");
  const B2 = (await s.history('fake-scan-ops', { limit: 99, source: 'ui' })).records;
  ok(JSON.stringify(B.map((r) => r.vendorId)) === JSON.stringify(B2.map((r) => r.vendorId)),
    'SCANNING THE SAME SCREEN TWICE IS A NO-OP — the synthetic key is minted deterministically from the message itself, so a re-scan dedups instead of duplicating');
  ok(new Set(B.map((r) => r.vendorId)).size === B.length, 'the minted keys are distinct within a conversation');

  // ── ③b THE SOURCE IS HANDED DOWN, NEVER RE-DERIVED (r3) ──
  // `scanState()` in src/channel-caps.js is the ONE resolver; the shipped
  // fake used to keep a `source()` closure falling back to
  // `caps.scanSources[process.platform]` — a second resolver, which is how the
  // engine ingested through a lane the real one had just called unavailable.
  const none = await threw(() => s.history('fake-scan-ops', { limit: 5 }));
  ok(none && none.code === 'not-supported' && none.detail && none.detail.needs === 'source' && /RESOLVED source/.test(none.message),
    'a scan-adapter page with NO source is REFUSED with a typed reason — the adapter may not guess one', none && none.message);
  const wide = await threw(() => s.history('fake-scan-ops', { limit: 5, source: 'telepathy' }));
  ok(wide && wide.code === 'not-supported', 'a source the adapter\'s own historyBySource does not name is refused too (a resolution may only narrow)', wide && wide.code);
  const poll = reg.create('fake-poll', { id: 'fake-poll' });
  ok((await poll.history('fake-poll-ops', { limit: 5, source: 'ui' })).records.length > 0, 'POSITIVE CONTROL: a non-scan adapter ignores `source` — the rule is gated on the capability row');
  // A record carrying the OLD `scan.chosenSource` field no longer steers the
  // adapter: the source on the CALL is the only one (`chosenSource` is the
  // user's narrowing choice, read by the RESOLVER, not by the adapter).
  const steered = reg.create('fake-scan', { id: 'fake-scan', scan: { chosenSource: 'ui' } });
  ok((await steered.history('fake-scan-ops', { limit: 99, source: 'store' })).records.every((r) => r.raw.synthetic === false),
    'NEGATIVE CONTROL: a record-level `chosenSource` does not override the source handed to the call');
}

// ── ③c THE CENSUS: NO ADAPTER MODULE RE-DERIVES ITS SCAN SOURCE ──
// A declaration writes `scanSources: {…}`; a READ is `scanSources[` or
// `scanSources &&` (the retired closure's exact spelling). And
// `process.platform` may appear only inside `scanHost()`, whose job is to
// REPORT the platform — anywhere else it is a resolver in disguise. Comments
// are blanked first: a census reads code.
{
  const blank = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const mods = fs.readdirSync(path.join(REPO, 'src/channels')).filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('.'));
  const READ = /scanSources\s*(?:\[|&&)/;
  const strays = [];
  for (const f of mods) {
    const code = blank(fs.readFileSync(path.join(REPO, 'src/channels', f), 'utf-8'));
    if (READ.test(code)) strays.push(`${f}: reads caps.scanSources`);
    const lines = code.split('\n');
    const from = lines.findIndex((l) => /\bscanHost\b/.test(l));
    const to = from < 0 ? -1 : from + lines.slice(from).findIndex((l) => /\}\)\s*:\s*undefined,|^\s*\},?\s*$/.test(l));
    lines.forEach((l, i) => { if (/process\.platform/.test(l) && !(from >= 0 && i >= from && i <= to)) strays.push(`${f}:${i + 1}: process.platform outside scanHost`); });
  }
  console.log(`    [source census] ${mods.length} adapter module(s): ${mods.join(', ')}`);
  ok(mods.length >= 1, 'the census walked at least one adapter module', mods.join(','));
  ok(!strays.length, 'NO adapter module reads `caps.scanSources` or `process.platform` outside scanHost — the source is handed down by the engine', strays.join('; '));
  ok(READ.test("const source = () => (record.scan && record.scan.chosenSource) || (caps.scanSources && caps.scanSources[process.platform]) || 'ui';"), 'POSITIVE CONTROL: the census matches the retired closure verbatim');
  ok(!READ.test("    scanSources: receive === 'scan' ? { darwin: 'store', win32: 'ui', linux: 'ui' } : null,"), 'NEGATIVE CONTROL: …and not the DECLARATION');
}

// ── ④ typed errors, and a bare throw becomes one ──
{
  ok(CH.CHANNEL_ERROR_CODES.length === 9 && CH.CHANNEL_ERROR_CODES.includes('send-not-available'), `the failure set is CLOSED (${CH.CHANNEL_ERROR_CODES.join(', ')})`);
  const e = new CH.ChannelError('made-up-code', 'x');
  ok(e.code === 'vendor-error' && e.detail.undeclaredCode === 'made-up-code', 'a code outside the set is itself a contract violation: it becomes `vendor-error` and NAMES what was attempted');
  ok(JSON.stringify(new CH.ChannelError('rate-limited', 'slow down', { retryable: true }).toJSON()) === JSON.stringify({ ok: false, code: 'rate-limited', retryable: true, detail: null }), 'a typed failure serializes to the shape the routes answer with');

  const r2 = CH.createChannelRegistry();
  r2.register({
    kind: 'throws', caps: { receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, history: 'page', sendAs: [], identityMarking: 'none' },
    create: () => ({
      auth: { state: async () => ({ state: 'connected' }) },
      listConversations: async () => { throw new Error('the vendor SDK exploded'); },
      convCaps: async () => ({ read: 'yes', sendAs: [] }),
      history: async () => ({ records: [], reachedAnchor: true, complete: true }),
    }),
  });
  const bare = await threw(() => r2.create('throws', {}).listConversations({}));
  ok(bare && bare.code === 'vendor-error' && /exploded/.test(bare.message), 'NEGATIVE CONTROL: a BARE throw out of an adapter becomes a typed `vendor-error` carrying the vendor\'s own words — "degrading gracefully" is how this repository has hidden its own bugs', bare && bare.message);
}

// ── ⑤ the NARROWING law, enforced at call time ──
{
  const r3 = CH.createChannelRegistry();
  const caps = { receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, history: 'page', sendAs: ['user'], identityMarking: 'none' };
  r3.register({
    kind: 'too-wide', caps,
    create: () => ({
      auth: { state: async () => ({ state: 'connected' }) },
      listConversations: async () => ({ conversations: [], complete: true }),
      // declares only `user`, answers `user` AND `bot` for this conversation
      convCaps: async () => ({ read: 'yes', sendAs: ['user', 'bot'] }),
      history: async () => ({ records: [], reachedAnchor: true, complete: true }),
      send: async () => ({ ok: true }),
    }),
  });
  const e = await threw(() => r3.create('too-wide', {}).convCaps('c'));
  ok(e && /wider than caps.sendAs/.test(e.message),
    'NEGATIVE CONTROL: an adapter answering WIDER than its own declaration is refused — the direction is load-bearing, or "we never verified sending on this platform" is undone by one optimistic per-conversation answer', e && e.message);
}

// ── ⑥ registration is LOUD ──
{
  const r4 = CH.createChannelRegistry();
  const caps = { receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, history: 'page', sendAs: [], identityMarking: 'none' };
  const mod = { kind: 'k', caps, create: () => ({ auth: { state: async () => ({}) }, convCaps: async () => ({}), history: async () => ({ records: [], reachedAnchor: true }) }) };
  r4.register(mod);
  let dup = null; try { r4.register({ ...mod }); } catch (e) { dup = e.message; }
  ok(/duplicate kind/.test(dup || ''), 'a duplicate kind THROWS at registration (module load — every gate sees it)');
  let unknown = null; try { r4.get('nope'); } catch (e) { unknown = e.message; }
  ok(/not registered/.test(unknown || '') && /registered: k/.test(unknown || ''), 'an unknown kind is LOUD and names what IS registered — core never falls through to a default adapter');
  let noCreate = null; try { r4.register({ kind: 'z', caps }); } catch (e) { noCreate = e.message; }
  ok(/create\(record, deps\) is required/.test(noCreate || ''), 'a module with no create() is refused');
}

// ── ⑦ THE CENSUS: no call site outside src/channels/ branches on `kind` ──
// Gate on the CAPABILITY ROW, never on an adapter id — the same discipline
// src/backend-caps.js enforces for harnesses. The file set is DERIVED from
// git (never a readdir: data/ holds untracked runtime products) and PRINTED,
// because a census is worth exactly the set it walked.
{
  const GIT_ENV = gitEnvFrom(process.env);
  const g = spawnSync('git', ['-C', REPO, 'ls-files', '-z'], { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' });
  if (g.status !== 0) {
    ok(true, `SKIP the kind census — git could not list this tree (${String(g.stderr || g.error || '').trim().slice(0, 120)}); an export/tarball has no index to derive a source set from`);
  } else {
    const tracked = g.stdout.split('\0').filter((f) => f && /\.(js|mjs)$/.test(f)
      && !f.startsWith('src/channels/')   // the registry and the adapters THEMSELVES may name kinds
      && !f.startsWith('scripts/')        // suites spell the forbidden shapes as controls
      && !f.startsWith('public/'));       // the built bundle
    // THE KINDS ARE DERIVED, never typed: every module under src/channels/ is
    // REQUIRED and every export that is shaped like an adapter (`kind` + `caps`
    // + `create`) contributes its id. When `lark.js` lands in P1 its kind joins
    // the census with no edit here — and reading the SHAPE rather than a
    // `kind:` regex is what keeps the conversation kinds ('group') and the
    // event kinds ('cursor-kick') that live in the same files out of it.
    const KINDS = [...new Set(fs.readdirSync(path.join(REPO, 'src/channels'))
      .filter((f) => f.endsWith('.js') && f !== 'index.js')
      .flatMap((f) => Object.values(require(path.join(REPO, 'src/channels', f)))
        .filter((v) => v && typeof v === 'object' && typeof v.kind === 'string' && v.caps && typeof v.create === 'function')
        .map((v) => v.kind)))];
    // …and the SCOPE is the channels layer: to branch on an adapter's kind a
    // file must first HAVE the adapter, which only this layer hands out — so a
    // file is in scope when it names a channels module or IS one by path. The
    // boundary is stated so the next reader knows what it does not see: a file
    // that reaches a kind while naming nothing of this layer is invisible here.
    const TOUCHES = /src\/channels\/|channel-caps|channel-store|channel-record|channels-engine|channels-wiring|getEngine/;
    const IS_CHANNELS = /(^|\/)channels?[-.]|(^|\/)channels\.js$/;
    const files = tracked.filter((f) => IS_CHANNELS.test(f) || TOUCHES.test(fs.readFileSync(path.join(REPO, f), 'utf-8')));
    const RE = new RegExp(`\\bkind\\s*(?:===|!==|==|!=)\\s*['"](?:${KINDS.join('|')})['"]|case\\s+['"](?:${KINDS.join('|')})['"]\\s*:`);
    const blank = (src) => src.replace(/^\s*\/\/.*$/gm, '');   // a census reads CODE
    const strays = files.filter((f) => RE.test(blank(fs.readFileSync(path.join(REPO, f), 'utf-8'))));
    console.log(`    [kind census] kinds ${KINDS.join(', ')} · ${files.length} of ${tracked.length} tracked js/mjs files name the channels layer: ${files.join(', ')}`);
    ok(KINDS.length >= 3, `the kinds are DERIVED from the adapter modules themselves (${KINDS.length})`, KINDS.join(','));
    ok(!strays.length, 'NO call site outside src/channels/ branches on an adapter `kind` — gate on the capability row, never on an id', strays.join(', '));
    // POSITIVE CONTROL: the detector really sees the shape it claims to census.
    ok(RE.test("if (rec.kind === 'fake-poll') doSomethingSpecial();"), 'POSITIVE CONTROL: the census matches a real branch');
    ok(RE.test("  switch (a.kind) { case 'fake-scan': return 1; }"), 'POSITIVE CONTROL: …and a switch case');
    ok(!RE.test(blank("  // if (rec.kind === 'fake-poll') this is prose")), 'POSITIVE CONTROL: …and ignores the same line behind a `//`');
    ok(!RE.test("if (mount.kind === 'gmail') syncMail();"), 'NEGATIVE CONTROL: an unrelated `kind === \'gmail\'` (the Gmail MOUNT) is NOT a channel-adapter branch — deriving the kinds is what keeps this census from colliding with the rest of the tree');
    ok(files.includes('src/server/channels-engine.js') && files.includes('src/routes/channels.js') && files.includes('src/server/channels-wiring.js'),
      'the census really covers the engine, the routes and the wiring — the three places most likely to reach for an id', files.join(', '));
  }
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
