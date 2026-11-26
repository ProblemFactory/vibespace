#!/usr/bin/env node
// test-attention-facts-hold — B-0f37 (lane bl-loop-a, 主开发 r5024 / r5035): THE ATTENTION FACTS' DUPLICATE-INBOX MAP ON A HUB WHOSE
// ROWS ARE MOSTLY MAIL. HEAVY: a stand-in built in-process — 198 043 conversations over 8 accounts (173 306 · 20 674 · 1 887 · 933
// · 747 · 234 · 146 · 116), its BIGGEST account a mail account (the registry's glyph «mail»), the rest chats — the real channels
// engine and the real store (no vendor: the accounts' modules answer nothing). No profiler in the measured run: each step's longest
// turn by a loop-gap meter (a setImmediate beat and the event loop's delay histogram), every run printed. THE LAW (主开发 r5035 (b)):
// no turn of building the facts or of keeping them current does work past the family's bound — 50 ms a turn:
//   ① the map's BUILD (the first judged row's need: src/server/channels-engine.js attnInbox — slices over each mail account's kept
//      keys, a held iterator): its longest turn ≤ 50 ms; the map holds every mail row's key (structure judged everywhere)
//   ② KEPT CURRENT: a mail update of 1 000 rows (their times and subjects moved) — its longest turn ≤ 50 ms (the index's own update
//      included; the same update before the map was built PRINTED beside it); the map applied exactly those 1 000 rows, no build
//   ③ a judged row's facts read through the kept map: printed
//   RED: today's one-turn build (the release's walk over every live row, in a copy of the engine over the same stand-in): its one
//   turn over the bound
// THE CLOCK IS THE BOX's (主开发 r4850's form, scripts/test-channel-walks-hold.mjs): on the hosted runner (GITHUB_ACTIONS=true —
// never a guess from speed) every leg still runs; a leg that judges a TIME prints its reading and is a named skip; what is not a
// clock is judged everywhere; the closing line there names how many legs were printed, not judged.
// Run: node scripts/test-attention-facts-hold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { anchored, scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const HOSTED = process.env.GITHUB_ACTIONS === 'true';
const CLOCKS = { n: 0 };
const { ok, report } = checker({ log: (l) => console.log(HOSTED && /^\n(?:ALL PASS|\d+ FAILED)/.test(l) ? `${l} · ${CLOCKS.n} leg(s) that judge a clock printed, not judged on the hosted runner (each said above)` : l) });
const LAW_WHY = 'the clock law is judged on the box only (主开发 r4850); its reading is printed';
const RED_WHY = 'a red control\'s clock is judged on the box only, as its law (主开发 r4850); its plant is judged by its structure checks';
/** a leg that judges a TIME: a leg on the box and the test machines; on the hosted runner its words (its reading in them) and the skip */
function clock(cond, words, why, detail) {
  if (!HOSTED) return ok(cond, words, detail);
  CLOCKS.n++;
  console.log(`  ⊘ SKIP: ${words} — NOT JUDGED on the hosted runner (GITHUB_ACTIONS=true): ${why}`);
  return cond;
}
const ROOT = scratch('attention-facts-hold');
const T = Date.parse('2026-11-26T12:00:00Z');
const BOUND_MS = 50;   // the family's bound (B-360d): 50 ms a turn at the stand-in's size
const quiet = { info() { }, warn() { }, error() { }, log() { }, debug() { } };
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const MB = mutantCopies('attention-facts-hold', REPO);
const ESRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
// THE RED: today's one-turn build — the release's walk over EVERY live row in one synchronous turn (each row read; the mail rows keyed)
const WALK_LINE = '          const ok = await walkMail(j);\n';
const RED_SRC = anchored(ESRC, WALK_LINE, "          const ok = (() => { const live = store.index.live(); for (const key of Object.keys(live)) apply(j.m, key); return true; })();   /* RED: the release's one-turn build over every live row */\n", 'red: the one-turn build');
const ENGR = MB.load('src/server/channels-engine.js', RED_SRC, 'one-turn-build');

/** THE METER: the loop's longest turn while `fn` runs (its own awaits included) — the gap between two beats of a setImmediate
 *  chain, and the delay histogram's max; a synchronous `fn` is one turn */
async function holdOf(fn) {
  const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
  let last = process.hrtime.bigint(), worst = 0, run = true;
  const beat = () => { const n = process.hrtime.bigint(), g = Number(n - last) / 1e6; if (g > worst) worst = g; last = n; if (run) setImmediate(beat); };
  await new Promise((r) => setImmediate(r));
  last = process.hrtime.bigint(); setImmediate(beat);
  const t0 = process.hrtime.bigint(); let out, err = null;
  try { out = await fn(); } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  const end = process.hrtime.bigint(); { const g = Number(end - last) / 1e6; if (g > worst) worst = g; }
  run = false; h.disable();
  return { turn: Math.round(worst * 10) / 10, total: Math.round(Number(end - t0) / 1e5) / 10, hist: Math.round(h.max / 1e5) / 10, out, err };
}

// ═══ THE STAND-IN ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const SIZES = [173306, 20674, 1887, 933, 747, 234, 146, 116];
const IDS = SIZES.map((_, i) => `acct-${i}`);
const mod = (kind, glyph) => ({
  kind,
  caps: { ...fake.fakePoll.caps, receive: 'poll', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true }, ...(glyph ? { glyph } : {}) },
  create() {
    return {
      selfId: () => null,
      auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
      async listConversations() { return { conversations: [], cursor: null, complete: true }; },
      async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: T }; },
      async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
      async older() { return { records: [], exhausted: true }; },
    };
  },
});
const registry = CH.createChannelRegistry();
registry.register(mod('mailx', 'mail'));
registry.register(mod('chatx', null));
const acct = (id, kind) => ({ id, kind, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0 });
const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: IDS.map((id, i) => acct(id, i === 0 ? 'mailx' : 'chatx')) }));
const si = globalThis.setInterval;
const open = (EM) => { globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 }); try { return EM.create({ dataDir, registry, env: {}, now: () => T, broadcast: () => { }, serverSetting: () => undefined, liveSessions: () => [], deliver: null, log: quiet, censusTimer: () => ({ cancel() { } }) }); } finally { globalThis.setInterval = si; } };
const eng = open(ENG);
const ix = eng.store.index;
const subject = (i) => (i % 2 === 0 ? `回复：项目进度 第${i % 997}周 [ops-${i % 97}]` : `Re: [ops-${i % 97}] thread ${i % 1997} weekly report`);
await ix.update(() => {
  IDS.forEach((id, ai) => { for (let i = 0; i < SIZES[ai]; i++) Object.assign(ix.entry(id, `c${String(i).padStart(6, '0')}`), { title: ai === 0 ? subject(i) : `[team-${i % 97}] room ${i}`, kind: ai === 0 ? 'thread' : (i % 3 ? 'group' : 'dm'), lastAt: T - i * 1000, unread: i % 5, listedAt: T - i * 1000, authors: [{ name: i % 2 === 0 ? `张${i % 389}` : `Pat ${i % 389}` }] }); });
});
await ix.durable();
const N = Object.keys(ix.live()).length;
console.log(`the stand-in: ${N} conversations (${SIZES.join(' · ')}), the biggest account (${SIZES[0]} rows) a MAIL account`);
// the store's own per-account map kept FIRST (its sliced build, the store's road — its first turn snapshots the keys: printed, the store's)
{
  ix.keysKept(IDS[0]);
  const w = await holdOf(() => ix.keysReady());
  console.log(`  · PRINTED (the store's own per-account map, not this unit's): its sliced build to its landing, the loop's longest turn ${w.turn} ms of ${w.total} ms; kept: ${!!ix.keysKept(IDS[0])}`);
}
// ② BEFORE the map: the same kind of mail update with nothing kept (printed beside ②)
const moveMail = (from, n, shift) => ix.update(() => { for (let i = from; i < from + n; i++) Object.assign(ix.entry(IDS[0], `c${String(i).padStart(6, '0')}`), { lastAt: T + shift + i, title: `Fwd: ${subject(i)}` }); });
const pre = await holdOf(() => moveMail(0, 1000, 1));
console.log(`  · PRINTED: a 1 000-row mail update BEFORE the map is built (the index's own work and its other hooks): longest turn ${pre.turn} ms of ${pre.total} ms`);

// ═══ ① THE BUILD ══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('① the duplicate-inbox map built at the first judged row\'s need: slices over the mail account\'s kept keys');
const b = await holdOf(() => eng.attentionFacts.ready());
const sb = eng.attentionFacts.stats();
ok(b.err === null && b.out === true && sb.builds === 1 && sb.walks === 1 && sb.kept && sb.keys > 0 && sb.fallback === 0 && sb.slices > 1, `① the map BUILT once (one walk, ${sb.slices} slices, no snapshot of every key: fallback ${sb.fallback}) and kept — ${sb.keys} subject keys over the mail account's ${SIZES[0]} rows`, { sb, err: b.err });
clock(b.turn <= BOUND_MS, `① …to its landing the loop's longest turn ${b.turn} ms (histogram ${b.hist} ms; its longest slice ${sb.maxSliceMs} ms) of ${b.total} ms — ≤ ${BOUND_MS} ms`, LAW_WHY, { turn: b.turn, total: b.total, sb });

// ═══ ② KEPT CURRENT ═══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('② a 1 000-row mail update with the map kept: one row\'s work a touch, no build');
const a0 = eng.attentionFacts.stats().applied;
const kc = await holdOf(() => moveMail(1000, 1000, 2));
await eng.attentionFacts.ready();
const sk = eng.attentionFacts.stats();
ok(kc.err === null && sk.builds === 1 && sk.walks === 1 && sk.kept && sk.applied - a0 === 1000, `② the map applied EXACTLY the 1 000 touched rows (applied ${a0} → ${sk.applied}) and was never built or walked again (builds ${sk.builds}, walks ${sk.walks})`, { sk, err: kc.err });
clock(kc.turn <= BOUND_MS, `② the update's longest turn ${kc.turn} ms (histogram ${kc.hist} ms) of ${kc.total} ms with the map kept — ≤ ${BOUND_MS} ms (before the map: ${pre.turn} ms)`, LAW_WHY, { kc: { turn: kc.turn, total: kc.total }, pre: { turn: pre.turn } });

// ═══ ③ A JUDGED ROW's FACTS ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const f = await holdOf(async () => { await eng.attentionFacts.ready(); return eng.attentionFacts.stats().keys; });
  console.log(`  · PRINTED ③: a judged row's wait on the kept map: its longest turn ${f.turn} ms (a resolved wait, no walk; the row's facts are then read from the map at the call)`);
}

// ═══ RED: today's one-turn build ══════════════════════════════════════════════════════════════════════════════════════════
console.log('RED: the release\'s one-turn build over every live row (a copy of the engine, the same stand-in)');
{
  try { eng.stop(); } catch { }
  try { eng.store.close(); } catch { }
  const engR = open(ENGR);
  await engR.store.index.keysReady();
  const r = await holdOf(() => engR.attentionFacts.ready());
  const sr = engR.attentionFacts.stats();
  ok(r.err === null && sr.kept && sr.keys > 0, `RED's plant: the copy built the same map (${sr.keys} subject keys) — its walk is the release's, one turn over every live row`, { sr, err: r.err });
  // AN ABSOLUTE TIME (r4841 (b)'s note): machine 1 reads this one-turn build far over the bound; a much faster machine could read it under it — the control would go red falsely
  clock(r.turn > BOUND_MS, `RED: the release's one-turn build — the loop's longest turn ${r.turn} ms (histogram ${r.hist} ms) of ${r.total} ms, OVER the bound`, RED_WHY, { turn: r.turn });
  try { engR.stop(); } catch { }
  try { engR.store.close(); } catch { }
}
for (const x of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 1, label: 'B-0f37 facts hold ' })) ok(x.pass, x.name, x.pass ? undefined : x.detail);
report();
