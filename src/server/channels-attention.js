'use strict';
/**
 * THE FIRST SCREEN'S JUDGED ROWS (lane decision-attention, D2 of docs/design-decision-api.zh.md §2.3 / §2.4) — ORCH,
 * created by the channels engine (src/server/channels-engine.js), which hands it the rows it draws.
 *
 *  · THE CANDIDATES: a first-screen row no FACT tag claims (PURE `FO.judgeCandidate` — the facts are free and
 *    stronger: a fact-tagged row is never sent, not once), its newest message inside 24 h and not the owner's own, of
 *    an account not marked "never judge" (`rec.judge === 'never'`), not labeled by the person for that message, and
 *    not already judged under the SAME memo material (use · row · lastAt · rubric v · the person's block · the examples);
 *  · THE CALLS: ONE record per call (D1's probe, 2026-10-12: five records in one call changed the needs_now verdicts
 *    — agreement 12/20 — for a 9 % token saving), every rubric question in that one call, through D1's engine
 *    `judge('attention', …)` — the ONE caller, its memo (a redraw, a reopen, a restart never re-bill), its budget, its
 *    walls. A QUEUE, at most CONCURRENCY in flight, every row asked AGAIN as it is now right before its call; a refusal that holds for every row (no key, a switch off, the
 *    day's budget, the hour's cap, a backoff) empties the queue — the next read queues again;
 *  · ASYNC: the rows are drawn first; a verdict is patched in by ONE partial broadcast of its row (`notify([key])`) —
 *    the first screen never waits on a judgment (the scale law);
 *  · THE VERDICT a row keeps: `{p, clauses, rubricV, lastAt, source}` (PURE `M.judgedOf`); the row's `judged` view adds
 *    the CURRENT threshold (the setting `decision.threshold`) and the person's label — the tag is `FO.judgedTag`'s;
 *  · THE EXAMPLES: data/decision-examples.json (0600, tmp + rename; THIS module is its ONE writer) — a "needs" / "not"
 *    on a judged row is a labeled example (`M.exampleOf`: the record's digest ≤ 200 characters, the label, the clauses,
 *    when), the newest 200 kept, the newest 12 in every input; a "not" drops the tag at once (the label wins), and the
 *    examples hash in the memo material means the next scan judges again with it;
 *  · THE DRAFT ("Draft from my recent decisions"): D1's catalogue asked of the newest labeled examples (one call each,
 *    memoised), `M.criteriaProposal` PROPOSES lines for the person's own block — never applied by itself.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../decision-model.js');
const FO = require('../channel-focus.js');

const CONCURRENCY = 3;          // calls in flight at most
const PER_HOUR = 60;            // attention calls an hour at most (design §2.4)
const QUEUE_MAX = 500;
const KICK_MS = 200;            // a burst of reads queues ONE drain
const VERDICTS_MAX = 5000;
const DRAFT_EXAMPLES = 30;
// a refusal no other row would escape — the queue is emptied, the next read queues again
const STOP = Object.freeze(['plugin-off', 'feature-off', 'no-key', 'daily-budget', 'per-hour', 'backoff', 'over-ceiling']);
const hash16 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

function create({ dataDir, decision = null, serverSetting = () => undefined, now = () => Date.now(), tailOf = () => [], notify = () => { },
  accountNever = () => false, viewNow = null, log = console, policy = () => null } = {}) {
  const FILE = path.join(dataDir, 'decision-examples.json');
  let examples = readExamples();
  const verdicts = new Map();   // row key → {p, clauses, rubricV, lastAt, source, mk}
  const queue = new Map();      // row key → the rowView it was queued with
  const flying = new Set();     // row keys whose call is in flight (a read meanwhile must not queue them again — one call per row)
  let inFlight = 0, timer = null, lastWhy = null;
  const stats = { calls: 0, memo: 0, refused: 0 };
  // lane attention-policy: the owner's readout — "today: judged N · M needed you" (the local day, counted where a verdict lands)
  let today = { day: null, judged: 0, hits: 0 };
  const todayNow = () => { const day = M.dayOf(now(), new Date(now()).getTimezoneOffset()); if (today.day !== day) today = { day, judged: 0, hits: 0 }; return today; };
  // lane attention-policy: a fact whose rule the owner switched off claims nothing — the judge may see that row
  const pol = () => { try { return policy() || null; } catch { return null; } };

  function readExamples() {
    try {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return (Array.isArray(j && j.examples) ? j.examples : []).filter((x) => x && typeof x.key === 'string' && M.VERDICTS.includes(x.verdict)).slice(0, M.EXAMPLES_KEPT);
    } catch { return []; }
  }
  function save() {
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, examples }), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  }
  const setting = (k) => { try { return serverSetting(k); } catch { return undefined; } };
  const threshold = () => M.attentionThreshold(setting('decision.threshold'));
  const userBlock = () => M.userBlockOf(setting('decision.attentionBlock'));
  /** Is the attention use switched on (the plugin + its feature)? The key and the budget are the engine's to judge. */
  function on() {
    try { const s = decision && typeof decision.settings === 'function' ? decision.settings() : null; return !!(s && s.pluginOn && s.features && s.features.attention); } catch { return false; }
  }
  const memoParts = (key, lastAt) => ({ id: key, lastAt, userBlock: hash16(userBlock()), examples: hash16(JSON.stringify(M.examplesForInput(examples))) });
  const labelOf = (key, lastAt) => { const x = examples.find((e) => e.key === key); return x && x.lastAt === lastAt ? x.verdict : null; };

  /** The row's `judged` view (null: nothing to say) — the verdict on THIS message, the current threshold, the label. */
  function judgedFor(en, rec = null) {
    if (!en || !en.key || (rec ? rec.judge === 'never' : accountNever(en.adapterId))) return null;
    if (!decision || !on()) return null;   // lane attention-policy: the judge's switch off (「只用固定规则」) ⇒ no judged row stays listed
    const lastAt = Number(en.lastAt) || 0;
    const label = labelOf(en.key, lastAt);
    const v = verdicts.get(en.key);
    const base = v && v.lastAt === lastAt ? v : null;
    if (!base && !label) return null;
    return { p: base ? base.p : null, clauses: base ? base.clauses : [], source: label === 'needs' ? 'you' : 'judge', rubricV: M.RUBRIC.version, lastAt, threshold: threshold(), ...(label ? { label } : {}) };
  }
  const viewOf = (en, rec = null) => { const j = judgedFor(en, rec); return j ? { judged: j } : {}; };

  /** The rows a read built: queue the candidates (cheap — no I/O here; the drain runs after a short delay). */
  function note(views) {
    if (!decision || !on()) return 0;
    const t = now();
    let n = 0;
    for (const v of Array.isArray(views) ? views : []) {
      if (!v || !v.key || queue.has(v.key) || flying.has(v.key) || queue.size >= QUEUE_MAX) continue;
      if (accountNever(v.adapterId) || !FO.judgeCandidate(v, t, pol())) continue;
      const lastAt = Number(v.lastAt) || 0;
      if (labelOf(v.key, lastAt)) continue;
      const have = verdicts.get(v.key);
      if (have && have.lastAt === lastAt && have.mk === M.memoMaterial('attention', memoParts(v.key, lastAt))) continue;
      queue.set(v.key, v); n++;
    }
    if (queue.size && !timer) { timer = setTimeout(() => { timer = null; drain(); }, KICK_MS); if (timer.unref) timer.unref(); }
    return n;
  }
  function drain() {
    while (inFlight < CONCURRENCY && queue.size) {
      const [key, v] = queue.entries().next().value;
      queue.delete(key);
      inFlight++; flying.add(key);
      judgeOne(v).catch((e) => log.warn?.(`[decision] attention: ${e && e.message}`)).finally(() => { inFlight--; flying.delete(key); drain(); });
    }
  }
  async function judgeOne(queued) {
    // THE ROW AS IT IS NOW, asked again right before the call: a row queued by an earlier read may since have been
    // handed to an agent, answered by the owner or labeled (the census caught a hand-over landing between the two)
    const v = typeof viewNow === 'function' ? viewNow(queued.key) : queued;
    const lastAt = Number(v && v.lastAt) || 0;
    if (!v || accountNever(v.adapterId) || !FO.judgeCandidate(v, now(), pol()) || labelOf(v.key, lastAt)) return;
    const mp = memoParts(v.key, lastAt);
    let tail = [];
    try { tail = tailOf(v) || []; } catch { tail = []; }
    const parts = { rubric: M.rubricText(), userBlock: userBlock(), examples: M.examplesForInput(examples), ...M.attentionRecord(v, tail) };
    const r = await decision.judge('attention', parts, { questions: M.rubricQuestions(), memo: mp, accountNever: accountNever(v.adapterId), perHour: PER_HOUR });
    if (!r || !r.ok) { lastWhy = r ? r.why : 'no-answer'; stats.refused++; if (STOP.includes(lastWhy)) queue.clear(); return; }
    lastWhy = null;
    if (r.memo) stats.memo++; else stats.calls++;
    const j = M.judgedOf(r.answers, lastAt);
    verdicts.delete(v.key);
    verdicts.set(v.key, { ...(j || { p: null, clauses: [], rubricV: M.RUBRIC.version, lastAt, source: 'judge' }), mk: M.memoMaterial('attention', mp) });
    while (verdicts.size > VERDICTS_MAX) verdicts.delete(verdicts.keys().next().value);
    const hit = !!(j && FO.judgedTag({ ...j, threshold: threshold() }, lastAt));
    const d = todayNow(); d.judged++; if (hit) d.hits++;
    if (hit) notify([v.key]);
  }

  /** "Needs" / "Not" on a judged row: a labeled example (the ONE write), the row re-drawn at once. */
  function label(key, lastAt, verdict, view) {
    if (!M.VERDICTS.includes(verdict)) return { ok: false, code: 'bad-request', error: 'label must be needs or not' };
    if (!view) return { ok: false, code: 'not-found', error: 'no such conversation' };
    const at = Number(lastAt) || Number(view.lastAt) || 0;
    let tail = [];
    try { tail = tailOf(view) || []; } catch { tail = []; }
    const v = verdicts.get(key);
    const ex = M.exampleOf({ ...M.attentionRecord(view, tail), key, lastAt: at }, verdict, v && v.lastAt === at ? v.clauses : [], now());
    examples = M.addExample(examples, ex);
    save();
    notify([key]);
    return { ok: true, label: verdict, examples: examples.length };
  }

  /** "Draft from my recent decisions": the catalogue over the newest labeled examples → PROPOSED lines (never applied). */
  async function draft() {
    const list = examples.slice(0, DRAFT_EXAMPLES);
    if (!list.some((x) => x.verdict === 'needs') || !list.some((x) => x.verdict === 'not')) return { ok: false, why: 'need-both-labels', read: list.length };
    if (!decision) return { ok: false, why: 'plugin-off', read: 0 };
    const answers = new Array(list.length).fill(null);
    let calls = 0, stopped = null, next = 0;
    const one = async () => {
      while (next < list.length && !stopped) {
        const i = next++, ex = list[i];
        const r = await decision.judge('attention', { body: ex.snippet }, { questions: M.criteriaQuestions(), memo: { id: `criteria:${ex.key}`, lastAt: ex.lastAt, userBlock: 'catalogue', examples: hash16(ex.snippet) }, perHour: PER_HOUR });
        if (!r || !r.ok) { stopped = r ? r.why : 'no-answer'; return; }
        if (!r.memo) calls++;
        answers[i] = r.answers;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, one));
    const used = list.filter((_, i) => answers[i]), got = answers.filter(Boolean);
    if (!got.length) return { ok: false, why: stopped || 'no-answer', read: 0 };
    const p = M.criteriaProposal(used, got);
    return { ok: true, read: used.length, calls, lines: p.lines, text: p.text, applied: false, ...(p.why ? { why: p.why } : {}), ...(stopped ? { stopped } : {}) };
  }

  const status = () => ({ on: !!decision && on(), queued: queue.size, inFlight, ...stats, why: lastWhy, examples: examples.length, threshold: threshold(), today: { ...todayNow() } });
  return { note, viewOf, judgedFor, label, draft, status, on: () => !!decision && on(), examples: () => examples.slice(), idle: () => !queue.size && !inFlight && !timer, file: FILE };
}

module.exports = { create, CONCURRENCY, PER_HOUR, STOP };
