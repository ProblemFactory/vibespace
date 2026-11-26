#!/usr/bin/env node
// test-attention-facts — B-0f37 (lane bl-loop-a; 主开发 r5024 / r5035, its required follow r5106, moved into its own suite by r5208):
// THE ATTENTION FACTS' DUPLICATE-INBOX MAP, read through the REAL channels engine and D1's REAL decision engine over a fake judge, in
// section ⑩'s world of scripts/test-decision-attention.mjs — a chat account and TWO mail accounts that both got the same notice —
// built by the shared harness (scripts/lib/attention-facts-world.mjs: nothing of the world copied). FAST, in-process.
//   ① THE LATE ROWS (the finder's EARLY world: the fake judge holds every call while the chat pass's rows fly; the mail passes land
//      meanwhile): the two notices are judged WITH «the same message reached 2 of the reader's inboxes»; the map built ONCE, kept
//      by row touches. REDS: the map kept from its first build (the release's scan facts); a map walked again at every touch
//   ② THE CONTENT WORLD's MAP: a row's touch is one row's work; a whole-map touch walks it again once; the judge switched OFF drops
//      it (no map, no work at a touch) and the next need builds it again
//   ③ THE FOLLOW (r5106): a HALF map is never served as current (a whole-map touch placed in every walk: the waiting rows not judged,
//      no paid call; then each row once with a whole map); a FAILED build serves no map (mail read from the accounts, no inbox count,
//      one build in the back-off). REDS: df8fcedfb's landing, df8fcedfb's view, no back-off
// Every red control carries the WITNESS that its plant was read in the window (主开发 r5135 law 1); a plant never read is a named SKIP.
// Run: node scripts/test-attention-facts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { createFakeJudge, createDecisionEngine, createWaits, createFactsWorld } from './lib/attention-facts-world.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('attention-facts');
let clock = Date.now();
const now = () => clock;
const J = createFakeJudge({ sleep });
const got = J.got;
const settings = { 'decision.attentionBlock': 'Invoices and contracts matter to me.' };
let plug = { enabled: true, config: { attention: true } };
const decisionEngine = createDecisionEngine({ REPO, fetch: J.fetch, now, quiet, plug: () => plug });
const { until, idle } = createWaits({ ok, sleep });
const { TITLES10, factsOf, factsTable, exactOnce, asksExact, factsWorld } = createFactsWorld({ REPO, ROOT, T0: clock, J, now, quiet, settings, setPlug: (p) => { plug = p; }, decisionEngine, until, idle });
/** 主开发 r5135 law 1: a CONTROL is judged on the FACT that its plant was in force — `inForce` is the witness that the product read
 *  the plant inside the window; a plant never read is a NAMED SKIP (counted by the gate), never a red and never a green */
const redIf = (inForce, witness, cond, words, detail) => { if (inForce) return ok(cond, words, detail); console.log(`  ⊘ SKIP: ${words} — NOT JUDGED: its plant was not read in the window (${witness}; 主开发 r5135 law 1)`); return true; };

console.log('① the late rows of the early world (the judge held while the mail passes land): judged with the facts of their own moment');
{
  const E = await factsWorld(ENG, 'facts-early', { early: true });
  ok(E.placed && exactOnce(E.T, E.mine) && asksExact(E.asks), `the early world placed and its count EXACT: ${TITLES10.length} asks, ${TITLES10.length} calls, each row once (${E.mine.length} calls)`, { asks: E.asks, n: E.mine.length });
    // B-0f37: THE LATE ROWS — queued by the mail passes while the scan was HELD — judged with the facts of their own moment
    const late = (W) => { const n = TITLES10.filter((t) => /Action Required/.test(t)).map((t) => W.T.last(t)).filter(Boolean); return { n, two: n.length === 2 && n.every((g) => (factsOf(g) || '').includes('kind: an email thread') && (factsOf(g) || '').includes('the same message reached 2 of the reader\'s inboxes')), lines: n.map((g) => factsOf(g)) }; };
    const EL = late(E), est = E.eng.attentionFacts.stats();
    ok(E.placed && EL.two && (factsOf(E.T.last('Re: licensing')) || '').includes('kind: an email thread'), `B-0f37 THE LATE ROWS of the early world: the two notices the mail passes queued while the scan was held are judged WITH «the same message reached 2 of the reader's inboxes», as email threads (${EL.lines.join(' | ')})`, EL.lines);
    ok(est.builds === 1 && est.walks === 1 && est.kept && est.applied > 0 && E.eng.attention.status().scans === 1, `B-0f37: the duplicate-inbox map built ONCE (at the first row's need, before the mail passes) and kept current by ${est.applied} row touch(es), never walked again; the scan took its facts once (scans ${E.eng.attention.status().scans})`, est);
    const MB = mutantCopies('decision-attention-b0f37', REPO);
    const ESRC0 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const HOOK = "      if (job) apply(job.m, k);\n      if (served) apply(served, k);\n";
    const WHOLE = "      if (key === null || key === undefined) { if (job) job.again = true; if (served) stale = true; return; }\n";
    ok(ESRC0.split(HOOK).length === 2 && ESRC0.split(WHOLE).length === 2, 'control setup: the map\'s touch hook (a row\'s work, a whole touch) is present once');
    // RED: the release's kept facts — the map kept from its first build, never touched (the scan's first moment)
    const Kept = await factsWorld(MB.load('src/server/channels-engine.js', anchored(ESRC0, HOOK, "      /* RED: the map kept from its first build — the release's scan facts */\n", 'src/server/channels-engine.js'), 'kept-facts'), 'facts-kept', { early: true });
    const KL = late(Kept), ks = Kept.eng.attentionFacts.stats();
    redIf(ks.builds === 1 && ks.rows < est.rows, `the copy's map was built once and never took the late rows: ${ks.rows} rows against the cure's ${est.rows}`, Kept.placed && KL.n.length === 2 && !KL.two && KL.lines.every((l) => !(l || '').includes('reached 2')), `RED (the release's kept facts: the map from the scan's first moment, in a copy): the late notices are judged WITHOUT «the same message reached 2 of the reader's inboxes» (${KL.lines.join(' | ')})`, KL.lines);
    // RED: a map walked again at EVERY touch (the rebuild the cure must not be — on a hub of mostly mail rows, a walk of them all per poll)
    const Every = await factsWorld(MB.load('src/server/channels-engine.js', anchored(ESRC0, WHOLE, "      { if (job) job.again = true; if (served) stale = true; if (key === null || key === undefined) return; }   /* RED: every touch walks it again */\n", 'src/server/channels-engine.js'), 'every-touch'), 'facts-every', { early: true });
    const evs = Every.eng.attentionFacts.stats();
    redIf(evs.applied > 0, `a row's touch reached the copy's hook while its map stood: applied ${evs.applied}`, Every.placed && late(Every).two && evs.builds > 1, `RED (a copy that walks the map again at every touch): the facts are right but it is BUILT ${evs.builds} times in this world — the leg above (once) is red on it`, evs);
    for (const x of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 2, label: 'B-0f37 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

console.log('② the content world\'s map: a row\'s touch, a whole-map touch, the judge switched off');
{
  const W = await factsWorld(ENG, 'facts');
  ok(W.placed && exactOnce(W.T, W.mine) && asksExact(W.asks), `the content world placed and its count EXACT (${W.mine.length} calls)`, { asks: W.asks });
  // B-0f37: the content world's map — built once at the first row's need; a ROW's touch is one row's work (no build); a WHOLE-map
  // touch walks it again once, at the next row's need
  {
    const s0 = W.eng.attentionFacts.stats();
    await W.eng.store.index.update(() => { Object.assign(W.eng.store.index.entry('mail1', 'q1'), { unread: 3 }); });
    await W.eng.attentionFacts.ready();
    const s1 = W.eng.attentionFacts.stats();
    await W.eng.store.index.update((x) => { void Object.keys(x.conversations).length; });   // the update reaches ix.conversations: a whole-map touch
    const kept2 = W.eng.attentionFacts.stats().kept;
    await W.eng.attentionFacts.ready();
    const s2 = W.eng.attentionFacts.stats();
    ok(s0.builds === 1 && s0.kept && s1.builds === 1 && s1.applied === s0.applied + 1 && !kept2 && s2.builds === 2 && s2.kept, `B-0f37: the content world's map was built once; a row's touch is ONE row's work (builds ${s1.builds}, applied ${s0.applied} → ${s1.applied}); a whole-map touch makes it stale and the next need walks it again ONCE (builds ${s2.builds})`, { s0, s1, s2 });
  }
  // B-0f37 follow (主开发 r5106 (1)): THE JUDGE SWITCHED OFF DROPS THE MAP — a read while it is off (its note) leaves no map and no
  // work at a touch; switched on, the next need builds it again
  {
    const d0 = W.eng.attentionFacts.stats();
    plug = { enabled: true, config: { attention: false } };
    W.eng.digest();
    const d1 = W.eng.attentionFacts.stats();
    await W.eng.store.index.update(() => { Object.assign(W.eng.store.index.entry('mail1', 'q1'), { unread: 4 }); });
    const d2 = W.eng.attentionFacts.stats();
    plug = { enabled: true, config: { attention: true } };
    const back = await W.eng.attentionFacts.ready();
    const d3 = W.eng.attentionFacts.stats();
    ok(d0.kept && !d1.kept && d1.rows === 0 && d1.dropped === d0.dropped + 1 && d2.applied === d1.applied && back === 'whole' && d3.builds === d1.builds + 1 && d3.kept && d3.rows > 0, `B-0f37 follow: the judge switched OFF drops the map at its next read (kept ${d1.kept}, rows ${d1.rows}); a touch then does no work (applied ${d1.applied} → ${d2.applied}); switched on, the next need builds it again (builds ${d1.builds} → ${d3.builds}, ${d3.rows} rows)`, { d0, d1, d2, d3, back });
  }
}

console.log('③ the follow (主开发 r5106): a half map never served as current; a failed build never misnames mail');
  {
    const MF = mutantCopies('decision-attention-b0f37-follow', REPO);
    const ESRC1 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const notices = (W, T2) => TITLES10.filter((t) => /Action Required/.test(t)).map((t) => (T2 || W.T).last(t)).filter(Boolean).map((g) => factsOf(g) || '');
    // (2) A HALF MAP IS NEVER SERVED AS CURRENT: the engine's walk seam — one row a slice, a WHOLE-map touch placed between two
    // slices of every walk of the map while the seam stands (never load): each walk is cut, the ladder's bound is met
    const halfWorld = async (EM, tag) => {
      const hold = { eng: null, seam: true };
      const onSlice = async (i, what) => { if (hold.seam && what === 'attention-inbox' && hold.eng) await hold.eng.store.index.update((x) => { void Object.keys(x.conversations).length; }); };
      const W = await factsWorld(EM, tag, { walk: { sliceMs: 0, onSlice }, hold });
      const during = { calls: W.mine.length, st: W.eng.attentionFacts.stats(), half: W.eng.attention.status().factsHalf };
      hold.seam = false;
      const n1 = got.length;
      W.eng.digest();
      await idle(W.eng);
      const after = got.slice(n1);
      return { W, during, after, T2: factsTable(after), st2: W.eng.attentionFacts.stats() };
    };
    const H = await halfWorld(ENG, 'facts-half');
    ok(H.W.placed && H.during.calls === 0 && H.during.half >= TITLES10.length && H.during.st.landedAsItStood >= 1 && !H.during.st.kept, `B-0f37 follow (r5106 (2)): with a whole-map touch in EVERY walk the map is never served as current — it lands STALE past the bound (${H.during.st.landedAsItStood} time(s), ${H.during.st.walks} walks), and the ${H.during.half} rows that waited on it are NOT judged now (0 calls, no paid call)`, H.during);
    ok(exactOnce(H.T2, H.after) && notices(H.W, H.T2).length === 2 && notices(H.W, H.T2).every((l) => l.includes('the same message reached 2 of the reader\'s inboxes')) && H.st2.kept, `B-0f37 follow: the seam lifted, the next read judges each row ONCE with a whole map — the notices WITH the fact (${notices(H.W, H.T2).join(' | ')})`, { st2: H.st2, n: H.after.length });
    const LAND = "        if (job === j) { served = j.m; stale = !full; job = null; }\n        if (full) { failedAt = null; failSaid = false; }\n        return full ? 'whole' : 'half';\n";
    const VIEW = "      const mail = attnMailIds().has(en.adapterId);\n";
    const BACK = "      if (failedAt !== null && now() - failedAt < ATTN_BACKOFF_MS) return Promise.resolve('none');\n";
    ok([LAND, VIEW, BACK].every((x) => ESRC1.split(x).length === 2), 'control setup: the map\'s landing, the view\'s mail and the back-off are present once each');
    const HR = await halfWorld(MF.load('src/server/channels-engine.js', anchored(ESRC1, LAND, "        if (job === j) { served = j.m; stale = false; job = null; }\n        if (full) { failedAt = null; failSaid = false; }\n        return 'whole';   /* RED: df8fcedfb's landing — the half map served as current */\n", 'src/server/channels-engine.js'), 'half-current'), 'facts-half-red');
    const hrn = notices(HR.W);
    redIf(HR.during.st.landedAsItStood >= 1, `the seam's whole touches cut the copy's walks to the ladder's bound: ${HR.during.st.landedAsItStood} landing(s) as it stood, ${HR.during.st.walks} walks`, HR.during.calls > 0 && hrn.length >= 1 && hrn.some((l) => !l.includes('reached 2')), `RED (df8fcedfb's landing, in a copy): the half map is served as current — ${HR.during.calls} rows judged while the seam stood, a notice WITHOUT the fact (${hrn.join(' | ')})`, HR.during);
    // (3) A FAILED BUILD: a throw placed in the map's walk (the same seam) — no map is served; each row is judged with its mail read
    // from the ACCOUNTS and no inbox count; said once; tried again only after the back-off (the suite's clock moved past it)
    const failWorld = async (EM, tag) => {
      const hold = { eng: null, seam: true };
      const onSlice = async (i, what) => { if (hold.seam && what === 'attention-inbox') throw new Error('a placed throw of the map build'); };
      const W = await factsWorld(EM, tag, { walk: { sliceMs: 0, onSlice }, hold });
      const st = W.eng.attentionFacts.stats();
      hold.seam = false;
      const c0 = clock; clock += 31e3;   // past ATTN_BACKOFF_MS (30 s)
      let back; try { back = await W.eng.attentionFacts.ready(); } finally { clock = c0; }
      return { W, st, back, st2: W.eng.attentionFacts.stats() };
    };
    const F = await failWorld(ENG, 'facts-fail');
    const fn = notices(F.W);
    ok(F.W.placed && exactOnce(F.W.T, F.W.mine) && F.st.failed === 1 && F.st.builds === 1 && fn.length === 2 && fn.every((l) => l.includes('kind: an email thread') && !l.includes('reached 2')), `B-0f37 follow (r5106 (3)): a FAILED build serves no map — the ${F.W.mine.length} rows are judged once each, the notices AS EMAIL THREADS (mail read from the accounts) with no inbox count, and the build is tried ONCE in the back-off (failed ${F.st.failed}, builds ${F.st.builds})`, { st: F.st, fn });
    ok(F.back === 'whole' && F.st2.builds === 2 && F.st2.kept && F.st2.failed === 1, `B-0f37 follow: past the back-off the next need builds it again, whole (builds ${F.st2.builds})`, F.st2);
    const FR = await failWorld(MF.load('src/server/channels-engine.js', anchored(ESRC1, VIEW, "      const mail = !!attnInbox.whole() && attnInbox.whole().mailIds.has(en.adapterId);   /* RED: df8fcedfb's view — mail read from the map */\n", 'src/server/channels-engine.js'), 'mail-from-map'), 'facts-fail-red');
    const frn = notices(FR.W);
    redIf(FR.st.failed >= 1, `the placed throw failed the copy's build: failed ${FR.st.failed}`, frn.length === 2 && frn.every((l) => !l.includes('kind: an email thread')), `RED (df8fcedfb's view, in a copy): on a failed build the mail rows are described to the paid judge as NOT mail (${frn.join(' | ')})`, frn);
    const FB = await failWorld(MF.load('src/server/channels-engine.js', anchored(ESRC1, BACK, "      /* RED: no back-off — every judged row walks the map again */\n", 'src/server/channels-engine.js'), 'no-backoff'), 'facts-fail-nobackoff');
    redIf(FB.st.failed >= 1, `the placed throw failed the copy's build: failed ${FB.st.failed}`, FB.st.builds > 1, `RED (no back-off, in a copy): every judged row starts another walk of the failed map (builds ${FB.st.builds}) — the leg above (once) is red on it`, FB.st);
    for (const x of copiesCensus(MF.files, MF.dir, REPO, { minCopies: 3, label: 'B-0f37 follow ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
  }

report();
